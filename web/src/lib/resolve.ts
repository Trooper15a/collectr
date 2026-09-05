import { and, eq, like, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { getCard, rowToCard, upsertCard } from "./cards";
import { nowIso } from "./format";
import { indexCard } from "./model-index";
import { isScanIndexId } from "./scanner/matcher";
import { hasPokewalletKey, pwSearch } from "./pokewallet";
import type { NormalizedCard } from "./types";

/**
 * Resolve a scanner id to a priced app card.
 *  - pw:/sf:/ygo: ids are already app cards.
 *  - tcgdex:<lang>:<setId>-<localId> ids are matched to PokéWallet by set code + number,
 *    then name + number, then name. The result (or a miss) is remembered in card_links.
 */
export async function resolveScanId(scanId: string): Promise<{ card: NormalizedCard | null; method: string }> {
  if (!isScanIndexId(scanId)) {
    return { card: await getCard(scanId), method: "direct" };
  }
  const link = db.select().from(schema.cardLinks).where(eq(schema.cardLinks.scanId, scanId)).get();
  if (link) {
    if (!link.cardId) return { card: null, method: link.method };
    const card = await getCard(link.cardId);
    if (card) return { card, method: link.method };
  }
  const idx = indexCard(scanId);
  if (!idx) return { card: null, method: "unknown-id" };

  const lang = idx.lang === "jap" ? "jap" : "eng";
  const setCode = (idx.set ?? "").trim();
  const num = (idx.num ?? "").trim();
  const name = (idx.name ?? "").trim();

  // 1) Local TCGCSV products: free and instant.
  // English: match by name + number. Japanese: match by set code + number only
  // (TCGCSV stores Japanese cards with English names, so name matching won't work for JP scans).
  if (num) {
    const numNorm = num.replace(/^0+(?=\d)/, "");
    const numFilter = or(like(schema.cards.cardNumber, `${num}%`), like(schema.cards.cardNumber, `${numNorm}%`));
    const conditions = [eq(schema.cards.tcg, "pokemon"), eq(schema.cards.language, lang), sql`id like 'tp:%'`, numFilter];
    if (lang === "eng" && name) {
      conditions.push(like(schema.cards.name, `${name}%`));
    } else if (setCode) {
      conditions.push(eq(schema.cards.setCode, setCode));
    }
    const rows = db
      .select()
      .from(schema.cards)
      .where(and(...conditions))
      .limit(10)
      .all();
    const local = pickMatch(rows.map(rowToCard), { setCode, num, name, lang });
    if (local) {
      remember(scanId, local.id, "tcgcsv-local");
      return { card: local, method: "tcgcsv-local" };
    }
  }
  if (!hasPokewalletKey()) return { card: null, method: "no-api-key" };

  const attempts: { q: string; method: string }[] = [];
  if (setCode && num) attempts.push({ q: `${setCode} ${num}`, method: "setcode+number" });
  if (name && num && lang === "eng") attempts.push({ q: `${name} ${num}`, method: "name+number" });
  if (name && lang === "eng") attempts.push({ q: name, method: "name" });

  for (const a of attempts) {
    let results: NormalizedCard[] = [];
    try {
      results = await pwSearch(a.q, 20);
    } catch {
      continue;
    }
    const hit = pickMatch(results, { setCode, num, name, lang });
    if (hit) {
      upsertCard(hit);
      remember(scanId, hit.id, a.method);
      return { card: hit, method: a.method };
    }
  }
  remember(scanId, null, "none");
  return { card: null, method: "none" };
}

function normNum(n: string | null | undefined) {
  // "054/214" -> "54", "SM-P 086" -> "86", "TG12" -> "tg12"
  const first = (n ?? "").split("/")[0].trim().toLowerCase();
  return first.replace(/^0+(?=\d)/, "");
}

function pickMatch(results: NormalizedCard[], want: { setCode: string; num: string; name: string; lang: string }): NormalizedCard | null {
  const wantNum = normNum(want.num);
  const wantSet = want.setCode.toLowerCase();
  const wantName = want.name.toLowerCase();
  const scored = results
    .map((c) => {
      let score = 0;
      if (c.language !== want.lang) return { c, score: -1 };
      if (wantNum && normNum(c.cardNumber) === wantNum) score += 4;
      if (wantSet && (c.setCode ?? "").toLowerCase() === wantSet) score += 3;
      if (wantName && c.name.toLowerCase().startsWith(wantName)) score += 2;
      return { c, score };
    })
    .filter((x) => x.score >= 4)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.c ?? null;
}

function remember(scanId: string, cardId: string | null, method: string) {
  db.insert(schema.cardLinks)
    .values({ scanId, cardId, method, createdAt: nowIso() })
    .onConflictDoUpdate({ target: schema.cardLinks.scanId, set: { cardId, method, createdAt: nowIso() } })
    .run();
}

/** Manually link a scanner id to an app card (used when the user picks a card from search after a miss). */
export function linkManually(scanId: string, cardId: string) {
  remember(scanId, cardId, "manual");
}
