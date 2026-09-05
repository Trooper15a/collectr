import { and, eq, like, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { rowToCard } from "./cards";
import { nowIso } from "./format";
import { bestPrice, type NormalizedCard } from "./types";

/**
 * CSV import. Accepts a loose spreadsheet: we look for columns by fuzzy header names.
 *   name (required), number | card_number | #, set | set_name | set_code, language | lang,
 *   quantity | qty, condition, cost | cost_basis | paid, currency, portfolio, variant, notes,
 *   graded, grading_company | company, grade, cert
 * Also re-imports the app's own export (card_id column wins when present).
 */
export interface ImportRow {
  line: number;
  raw: Record<string, string>;
  name: string;
  number: string | null;
  set: string | null;
  language: "eng" | "jap" | null;
  quantity: number;
  condition: string;
  cost: number | null;
  currency: string;
  portfolio: string | null;
  variant: string | null;
  notes: string | null;
  cardId: string | null;
  match: { id: string; name: string; setName: string | null; cardNumber: string | null; language: string; price: number | null; currency: string | null } | null;
  candidates: number;
  status: "matched" | "ambiguous" | "unmatched" | "error";
  error?: string;
}

export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === "," || c === "\t" || c === ";") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f.trim())) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim())) rows.push(row);
  if (!rows.length) return [];
  const headers = rows[0].map((h) => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""));
  return rows.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? "").trim()])));
}

const COL = {
  name: ["name", "card_name", "card", "title"],
  number: ["number", "card_number", "no", "num", "collector_number"],
  set: ["set", "set_name", "set_code", "expansion", "series"],
  language: ["language", "lang"],
  quantity: ["quantity", "qty", "count", "amount"],
  condition: ["condition", "cond"],
  cost: ["cost", "cost_basis", "paid", "price_paid", "purchase_price"],
  currency: ["cost_currency", "currency"],
  portfolio: ["portfolio", "collection", "binder", "folder"],
  variant: ["variant", "finish", "printing"],
  notes: ["notes", "note", "comment"],
  cardId: ["card_id", "id"],
  graded: ["graded"],
  company: ["grading_company", "company", "grader"],
  grade: ["grade"],
  cert: ["cert_number", "cert"],
};

function col(raw: Record<string, string>, keys: string[]) {
  for (const k of keys) if (raw[k] !== undefined && raw[k] !== "") return raw[k];
  return null;
}

function normLang(v: string | null): "eng" | "jap" | null {
  if (!v) return null;
  const s = v.toLowerCase();
  if (/^(jap|jp|ja|japanese|日本)/.test(s)) return "jap";
  if (/^(eng|en|english)/.test(s)) return "eng";
  return null;
}

function normCondition(v: string | null): string {
  const s = (v ?? "").toLowerCase().replace(/[^a-z]/g, "");
  if (!s) return "NM";
  if (["nm", "nearmint", "mint", "m"].includes(s)) return "NM";
  if (["lp", "lightlyplayed", "ex", "excellent"].includes(s)) return "LP";
  if (["mp", "moderatelyplayed", "played", "gd", "good"].includes(s)) return "MP";
  if (["hp", "heavilyplayed", "poor"].includes(s)) return "HP";
  if (["dmg", "damaged", "d"].includes(s)) return "DMG";
  return "NM";
}

function numPrefix(n: string | null | undefined) {
  return (n ?? "").split("/")[0].trim().replace(/^0+(?=\d)/, "").toLowerCase();
}

function findCard(row: ImportRow): { match: NormalizedCard | null; candidates: number } {
  if (row.cardId) {
    const r = db.select().from(schema.cards).where(eq(schema.cards.id, row.cardId)).get();
    if (r) return { match: rowToCard(r), candidates: 1 };
  }
  const nameWords = row.name.split(/\s+/).filter(Boolean).slice(0, 4);
  const conds = nameWords.map((w) => like(schema.cards.name, `%${w}%`));
  if (row.language) conds.push(eq(schema.cards.language, row.language));
  conds.push(sql`card_number is not null`);
  const rows = db.select().from(schema.cards).where(and(...conds)).limit(400).all().map(rowToCard);
  if (!rows.length) return { match: null, candidates: 0 };
  const wantNum = numPrefix(row.number);
  const wantSet = (row.set ?? "").toLowerCase();
  const nameLc = row.name.toLowerCase();
  const scored = rows
    .map((c) => {
      let score = 0;
      if (c.name.toLowerCase() === nameLc) score += 5;
      else if (c.name.toLowerCase().startsWith(nameLc)) score += 3;
      if (wantNum && numPrefix(c.cardNumber) === wantNum) score += 4;
      if (wantSet && ((c.setName ?? "").toLowerCase().includes(wantSet) || (c.setCode ?? "").toLowerCase() === wantSet)) score += 3;
      if (c.id.startsWith("tp:")) score += 1; // prefer the priced bulk source
      if (bestPrice(c.prices)) score += 1;
      return { c, score };
    })
    .filter((x) => x.score >= (wantNum || wantSet ? 6 : 4))
    .sort((a, b) => b.score - a.score);
  if (!scored.length) return { match: null, candidates: rows.length };
  const top = scored[0];
  const ties = scored.filter((x) => x.score === top.score && !(x.c.setName === top.c.setName && x.c.cardNumber === top.c.cardNumber));
  return { match: top.c, candidates: ties.length };
}

export function previewImport(text: string): ImportRow[] {
  const records = parseCsv(text);
  return records.map((raw, i) => {
    const name = col(raw, COL.name) ?? "";
    const row: ImportRow = {
      line: i + 2,
      raw,
      name,
      number: col(raw, COL.number),
      set: col(raw, COL.set),
      language: normLang(col(raw, COL.language)),
      quantity: Math.max(1, Number(col(raw, COL.quantity) ?? 1) || 1),
      condition: normCondition(col(raw, COL.condition)),
      cost: col(raw, COL.cost) != null ? Number(String(col(raw, COL.cost)).replace(/[^0-9.]/g, "")) || null : null,
      currency: (col(raw, COL.currency) ?? "USD").toUpperCase().slice(0, 3),
      portfolio: col(raw, COL.portfolio),
      variant: col(raw, COL.variant),
      notes: col(raw, COL.notes),
      cardId: col(raw, COL.cardId),
      match: null,
      candidates: 0,
      status: "unmatched",
    };
    if (!name && !row.cardId) {
      row.status = "error";
      row.error = "missing name";
      return row;
    }
    const { match, candidates } = findCard(row);
    if (match) {
      const bp = bestPrice(match.prices, row.variant ?? undefined);
      row.match = { id: match.id, name: match.name, setName: match.setName ?? null, cardNumber: match.cardNumber ?? null, language: match.language, price: bp?.amount ?? null, currency: bp?.currency ?? null };
      row.status = candidates > 1 ? "ambiguous" : "matched";
    }
    row.candidates = candidates;
    return row;
  });
}

export function commitImport(rows: ImportRow[], defaultPortfolio: string) {
  let added = 0;
  const skipped: number[] = [];
  const portfolioIds = new Map<string, number>();
  const getPortfolio = (name: string) => {
    const key = name.trim() || defaultPortfolio;
    if (portfolioIds.has(key)) return portfolioIds.get(key)!;
    const existing = db.select().from(schema.portfolios).where(eq(schema.portfolios.name, key)).get();
    const id = existing?.id ?? db.insert(schema.portfolios).values({ name: key, tcgId: null, language: null, createdAt: nowIso() }).returning().get().id;
    portfolioIds.set(key, id);
    return id;
  };
  db.transaction(() => {
    for (const r of rows) {
      if (!r.match || r.status === "error") {
        skipped.push(r.line);
        continue;
      }
      const graded = /^(y|yes|true|1)$/i.test(col(r.raw, COL.graded) ?? "");
      db.insert(schema.portfolioItems)
        .values({
          portfolioId: getPortfolio(r.portfolio ?? ""),
          cardId: r.match.id,
          quantity: r.quantity,
          variantType: r.variant ?? "normal",
          condition: r.condition,
          isGraded: graded,
          gradingCompany: graded ? col(r.raw, COL.company) : null,
          grade: graded ? col(r.raw, COL.grade) : null,
          certNumber: graded ? col(r.raw, COL.cert) : null,
          costBasis: r.cost,
          costCurrency: ["USD", "EUR", "GBP", "CAD", "JPY", "AUD"].includes(r.currency) ? r.currency : "USD",
          notes: r.notes,
          addedAt: nowIso(),
        })
        .run();
      added++;
    }
  });
  return { added, skipped };
}
