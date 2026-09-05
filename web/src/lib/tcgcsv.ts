import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { getSetting, setSetting } from "./cache";
import { nowIso, today } from "./format";
import type { CardPrices, PriceVariant } from "./types";

/**
 * TCGCSV (tcgcsv.com): free daily mirror of TCGPlayer products + prices, no key, no rate limit.
 * Products are imported as app cards with id `tp:<productId>` so search, detail pages, portfolios
 * and charts work the same as for every other card. Sealed products (no card number) are included.
 *
 *   GET https://tcgcsv.com/tcgplayer/categories
 *   GET https://tcgcsv.com/tcgplayer/{categoryId}/groups
 *   GET https://tcgcsv.com/tcgplayer/{categoryId}/{groupId}/products
 *   GET https://tcgcsv.com/tcgplayer/{categoryId}/{groupId}/prices
 */
const BASE = "https://tcgcsv.com/tcgplayer";

export interface TcgcsvCategory {
  id: number;
  tcg: string;
  language: "eng" | "jap";
  label: string;
}

export const TCGCSV_CATEGORIES: TcgcsvCategory[] = [
  { id: 3, tcg: "pokemon", language: "eng", label: "Pokémon" },
  { id: 85, tcg: "pokemon", language: "jap", label: "Pokémon Japan" },
  { id: 1, tcg: "mtg", language: "eng", label: "Magic" },
  { id: 2, tcg: "yugioh", language: "eng", label: "Yu-Gi-Oh!" },
  { id: 68, tcg: "onepiece", language: "eng", label: "One Piece" },
  { id: 71, tcg: "lorcana", language: "eng", label: "Lorcana" },
  { id: 63, tcg: "digimon", language: "eng", label: "Digimon" },
  { id: 27, tcg: "dbs", language: "eng", label: "Dragon Ball Super" },
  { id: 80, tcg: "dbfw", language: "eng", label: "DB Fusion World" },
  { id: 62, tcg: "fab", language: "eng", label: "Flesh and Blood" },
  { id: 79, tcg: "swu", language: "eng", label: "Star Wars Unlimited" },
  { id: 16, tcg: "vanguard", language: "eng", label: "Cardfight!! Vanguard" },
  { id: 20, tcg: "weiss", language: "eng", label: "Weiss Schwarz" },
  { id: 24, tcg: "finalfantasy", language: "eng", label: "Final Fantasy" },
];

/** Default import set. Override with TCGCSV_CATEGORIES="3,85,1" in .env.local. */
export function defaultCategoryIds(): number[] {
  const env = process.env.TCGCSV_CATEGORIES;
  if (env) return env.split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));
  return [3, 85];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;

async function getJson(url: string): Promise<J> {
  const res = await fetch(url, { headers: { "User-Agent": "collectr-clone-personal/0.1" }, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`TCGCSV ${res.status} ${url}`);
  return res.json();
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const SUBTYPE_KEYS: Record<string, string> = {
  normal: "normal",
  holofoil: "holofoil",
  "reverse holofoil": "reverseHolofoil",
  "1st edition": "1stEdition",
  "1st edition holofoil": "1stEditionHolofoil",
  unlimited: "unlimited",
  "unlimited holofoil": "unlimitedHolofoil",
  foil: "foil",
  etched: "etched",
};

function variantKey(subType: string | null | undefined) {
  const s = (subType ?? "Normal").trim();
  return SUBTYPE_KEYS[s.toLowerCase()] ?? s.replace(/\s+(\w)/g, (_, c) => c.toUpperCase()).replace(/^\w/, (c) => c.toLowerCase());
}

export interface ImportResult {
  categories: number[];
  groups: number;
  products: number;
  priced: number;
  historyRows: number;
  skippedGroups: number;
  startedAt: string;
  finishedAt: string;
  errors: string[];
}

export interface ImportStatus {
  running: boolean;
  progress?: { category: number; group: number; of: number };
  last?: ImportResult;
}

const g = globalThis as unknown as { __tcgcsvStatus?: ImportStatus };
export function importStatus(): ImportStatus {
  if (!g.__tcgcsvStatus) {
    const raw = getSetting("tcgcsv:last", "");
    g.__tcgcsvStatus = { running: false, last: raw ? (JSON.parse(raw) as ImportResult) : undefined };
  }
  return g.__tcgcsvStatus;
}

/** Import (or refresh) TCGPlayer products + today's prices for the given categories. Safe to run daily. */
export async function importTcgcsv(categoryIds = defaultCategoryIds(), opts: { onlyGroups?: number } = {}): Promise<ImportResult> {
  const status = importStatus();
  if (status.running) throw new Error("TCGCSV import already running");
  status.running = true;
  const result: ImportResult = { categories: categoryIds, groups: 0, products: 0, priced: 0, historyRows: 0, skippedGroups: 0, startedAt: nowIso(), finishedAt: "", errors: [] };
  const date = today();
  try {
    for (const catId of categoryIds) {
      const cat = TCGCSV_CATEGORIES.find((c) => c.id === catId);
      if (!cat) {
        result.errors.push(`unknown category ${catId}`);
        continue;
      }
      let groups: J[] = [];
      try {
        groups = (await getJson(`${BASE}/${catId}/groups`)).results ?? [];
      } catch (e) {
        result.errors.push(`groups ${catId}: ${(e as Error).message}`);
        continue;
      }
      if (opts.onlyGroups) groups = groups.slice(0, opts.onlyGroups);
      for (let gi = 0; gi < groups.length; gi++) {
        const group = groups[gi];
        status.progress = { category: catId, group: gi + 1, of: groups.length };
        try {
          const [productsRes, pricesRes] = await Promise.all([
            getJson(`${BASE}/${catId}/${group.groupId}/products`),
            getJson(`${BASE}/${catId}/${group.groupId}/prices`),
          ]);
          const products: J[] = productsRes.results ?? [];
          const prices: J[] = pricesRes.results ?? [];
          if (!products.length) {
            result.skippedGroups++;
            continue;
          }
          const counts = upsertGroup(cat, group, products, prices, date);
          result.groups++;
          result.products += counts.products;
          result.priced += counts.priced;
          result.historyRows += counts.history;
          // Upsert set row so set browsing works.
          db.insert(schema.sets)
            .values({ id: `${cat.tcg}:${group.abbreviation ?? group.groupId}:${cat.language}`, tcg: cat.tcg, code: String(group.abbreviation ?? group.groupId), name: group.name, language: cat.language, total: products.length, releaseDate: group.publishedOn ? String(group.publishedOn).slice(0, 10) : null, imageUrl: null })
            .onConflictDoUpdate({ target: schema.sets.id, set: { name: group.name, total: products.length } })
            .run();
        } catch (e) {
          result.errors.push(`group ${catId}/${group.groupId} ${group.name}: ${(e as Error).message}`);
        }
      }
    }
  } finally {
    result.finishedAt = nowIso();
    status.running = false;
    status.progress = undefined;
    status.last = result;
    setSetting("tcgcsv:last", JSON.stringify(result));
  }
  return result;
}

function upsertGroup(cat: TcgcsvCategory, group: J, products: J[], prices: J[], date: string) {
  const byProduct = new Map<number, J[]>();
  for (const p of prices) byProduct.set(p.productId, [...(byProduct.get(p.productId) ?? []), p]);
  const now = nowIso();
  let priced = 0;
  let history = 0;

  const insertCard = db
    .insert(schema.cards)
    .values({
      id: sql.placeholder("id"),
      tcg: cat.tcg,
      name: sql.placeholder("name"),
      setName: group.name,
      setCode: String(group.abbreviation ?? group.groupId),
      setId: String(group.groupId),
      cardNumber: sql.placeholder("cardNumber"),
      rarity: sql.placeholder("rarity"),
      variant: sql.placeholder("variant"),
      language: cat.language,
      imageUrl: sql.placeholder("imageUrl"),
      releaseDate: group.publishedOn ? String(group.publishedOn).slice(0, 10) : null,
      sourceId: sql.placeholder("sourceId"),
      pricesJson: sql.placeholder("pricesJson"),
      priceUpdatedAt: sql.placeholder("priceUpdatedAt"),
      metaJson: sql.placeholder("metaJson"),
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: schema.cards.id,
      set: {
        name: sql`excluded.name`,
        setName: sql`excluded.set_name`,
        setCode: sql`excluded.set_code`,
        cardNumber: sql`excluded.card_number`,
        rarity: sql`excluded.rarity`,
        imageUrl: sql`excluded.image_url`,
        pricesJson: sql`coalesce(excluded.prices_json, cards.prices_json)`,
        priceUpdatedAt: sql`coalesce(excluded.price_updated_at, cards.price_updated_at)`,
        metaJson: sql`excluded.meta_json`,
        updatedAt: now,
      },
    })
    .prepare();

  const lastHistory = db
    .select({ tp: schema.priceHistory.tcgplayerMarket, date: schema.priceHistory.date })
    .from(schema.priceHistory)
    .where(and(eq(schema.priceHistory.cardId, sql.placeholder("cardId")), eq(schema.priceHistory.variantType, sql.placeholder("variant"))))
    .orderBy(sql`date desc`)
    .limit(1)
    .prepare();

  const insertHistory = db
    .insert(schema.priceHistory)
    .values({ cardId: sql.placeholder("cardId"), date, variantType: sql.placeholder("variant"), tcgplayerMarket: sql.placeholder("market"), cardmarketAvg: null })
    .onConflictDoUpdate({ target: [schema.priceHistory.cardId, schema.priceHistory.date, schema.priceHistory.variantType], set: { tcgplayerMarket: sql`excluded.tcgplayer_market` } })
    .prepare();

  db.transaction(() => {
    for (const p of products) {
      const ext: Record<string, string> = {};
      for (const e of p.extendedData ?? []) ext[e.name] = e.value;
      const number = ext.Number ?? null;
      const isSealed = !number;
      const id = `tp:${p.productId}`;
      const variants: Record<string, PriceVariant> = {};
      for (const pr of byProduct.get(p.productId) ?? []) {
        const v: PriceVariant = { market: num(pr.marketPrice), low: num(pr.lowPrice), mid: num(pr.midPrice), high: num(pr.highPrice), directLow: num(pr.directLowPrice) };
        if (Object.values(v).some((x) => x != null)) variants[variantKey(pr.subTypeName)] = v;
      }
      const hasPrices = Object.keys(variants).length > 0;
      const pricesJson: CardPrices | null = hasPrices ? { tcgplayer: { currency: "USD", url: p.url ?? null, updatedAt: now, variants }, cardmarket: null } : null;
      // Keep any CardMarket block previously merged from PokéWallet.
      const existing = hasPrices ? db.select({ pricesJson: schema.cards.pricesJson }).from(schema.cards).where(eq(schema.cards.id, id)).get() : undefined;
      if (existing?.pricesJson && pricesJson) {
        const prev = JSON.parse(existing.pricesJson) as CardPrices;
        if (prev.cardmarket) pricesJson.cardmarket = prev.cardmarket;
      }
      insertCard.run({
        id,
        name: p.name,
        cardNumber: number,
        rarity: isSealed ? "Sealed" : (ext.Rarity ?? null),
        variant: null,
        imageUrl: p.imageUrl ?? null,
        sourceId: String(p.productId),
        pricesJson: pricesJson ? JSON.stringify(pricesJson) : null,
        priceUpdatedAt: pricesJson ? now : null,
        metaJson: JSON.stringify({
          sealed: isSealed,
          tcgplayerUrl: p.url,
          groupId: p.groupId,
          hp: ext.HP,
          types: ext["Card Type"],
          stage: ext.Stage,
          attacks: [ext["Attack 1"], ext["Attack 2"], ext["Attack 3"]].filter(Boolean),
          weakness: ext.Weakness,
          resistance: ext.Resistance,
          retreatCost: ext.RetreatCost,
          description: ext.Description ?? ext.DescriptionText,
        }),
      });
      if (hasPrices) priced++;
      // Delta-compressed history: write a row only when the market price changed or the last point is >6 days old.
      for (const [variant, v] of Object.entries(variants)) {
        if (v.market == null) continue;
        const last = lastHistory.get({ cardId: id, variant });
        const stale = !last || last.date < shiftDate(date, -6);
        if (stale || last?.tp !== v.market) {
          insertHistory.run({ cardId: id, variant, market: v.market });
          history++;
        }
      }
    }
  });
  return { products: products.length, priced, history };
}

function shiftDate(iso: string, days: number) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** True when TCGCSV data exists locally for a tcg/language (used to skip remote searches). */
export function hasTcgcsvData(tcg: string, language?: string): boolean {
  const row = db
    .select({ id: schema.cards.id })
    .from(schema.cards)
    .where(and(eq(schema.cards.tcg, tcg), language ? eq(schema.cards.language, language) : sql`1=1`, sql`id like 'tp:%'`))
    .limit(1)
    .get();
  return !!row;
}
