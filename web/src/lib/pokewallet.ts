import { RateLimiter, cached } from "./cache";
import type { CardPrices, MarketPrices, NormalizedCard, PriceVariant } from "./types";

/**
 * PokéWallet client. Verified response shapes (2026-09):
 *
 * GET /search?q=&limit=&page=  -> { results: Card[], pagination: { page, limit, total, total_pages } }
 * GET /cards/:id               -> Card
 * GET /sets                    -> { success, data: [{ name, set_code, set_id, card_count, language, release_date }] }
 * GET /sets/:code?language=&page=&limit= -> { success, set: {...}, cards: Card[], pagination }
 *                              or { disambiguation: true, matches: [...] } when language is omitted and ambiguous
 * GET /images/:id?size=low|high (needs X-API-Key)
 *
 * Card = { id, card_info: { name, set_name, set_code, set_id, card_number, rarity, card_type, hp, stage,
 *          attacks[], weakness, resistance, retreat_cost }, images: { languages[] },
 *          tcgplayer: { prices: [{ sub_type_name, market_price, low_price, mid_price, high_price, direct_low_price, updated_at }], url } | null,
 *          cardmarket: { prices: [{ variant_type, avg, low, trend, avg1, avg7, avg30, updated_at }], product_url } | null }
 *
 * Card language is not on the card itself; it comes from the set (matched by set_id).
 */
export const POKEWALLET_BASE = process.env.POKEWALLET_BASE ?? "https://api.pokewallet.io";
const API_KEY = process.env.POKEWALLET_API_KEY ?? "";

const globalForPw = globalThis as unknown as { __pwLimiter?: RateLimiter };
export const pokewalletLimiter = globalForPw.__pwLimiter ?? (globalForPw.__pwLimiter = new RateLimiter(100, 1000, 300));

export function hasPokewalletKey() {
  return API_KEY.length > 0;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

async function pwFetch(path: string, params: Record<string, string | number | undefined> = {}): Promise<J> {
  if (!API_KEY) throw new Error("POKEWALLET_API_KEY is not set (see web/.env.example)");
  await pokewalletLimiter.acquire();
  const url = new URL(POKEWALLET_BASE + path);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, String(v));
  const res = await fetch(url, { headers: { "X-API-Key": API_KEY, Accept: "application/json" } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`PokéWallet ${res.status} on ${path}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

export async function pwRawImage(id: string, size: "low" | "high", lang?: string) {
  if (!API_KEY) throw new Error("POKEWALLET_API_KEY is not set");
  await pokewalletLimiter.acquire();
  const url = new URL(`${POKEWALLET_BASE}/images/${encodeURIComponent(id)}`);
  url.searchParams.set("size", size);
  if (lang) url.searchParams.set("lang", lang);
  return fetch(url, { headers: { "X-API-Key": API_KEY } });
}

/* ---------- sets ---------- */

export interface PwSet {
  code: string;
  setId: string;
  name: string;
  language: string; // eng | jap | ...
  total: number | null;
  releaseDate: string | null;
}

function parseReleaseDate(s: unknown): string | null {
  // "3rd May, 2019" -> 2019-05-03
  if (typeof s !== "string" || !s) return null;
  const m = s.match(/(\d+)(?:st|nd|rd|th)?\s+([A-Za-z]+),?\s+(\d{4})/);
  if (!m) return null;
  const month = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"].indexOf(m[2].toLowerCase());
  if (month < 0) return null;
  return `${m[3]}-${String(month + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

export async function pwSets(): Promise<PwSet[]> {
  const payload = await pwFetch("/sets");
  const list: J[] = Array.isArray(payload) ? payload : (payload.data ?? payload.sets ?? []);
  return list
    .map((s: J) => ({
      code: String(s.set_code ?? ""),
      setId: String(s.set_id ?? ""),
      name: String(s.name ?? ""),
      language: String(s.language ?? "eng").toLowerCase(),
      total: num(s.card_count ?? s.total_cards),
      releaseDate: parseReleaseDate(s.release_date),
    }))
    .filter((s: PwSet) => s.code);
}

/** set_id -> set, cached for a week (one API call). Used to attach language to cards. */
async function setsById(): Promise<Map<string, PwSet>> {
  const list = await cached("pw:sets", 7 * 86400, pwSets).catch(() => [] as PwSet[]);
  return new Map(list.map((s) => [s.setId, s]));
}

/* ---------- cards ---------- */

const TP_VARIANTS: Record<string, string> = {
  normal: "normal",
  holofoil: "holofoil",
  reverseholofoil: "reverseHolofoil",
  "1stedition": "1stEdition",
  "1steditionholofoil": "1stEditionHolofoil",
  shadowless: "shadowless",
  unlimited: "unlimited",
  unlimitedholofoil: "unlimitedHolofoil",
};

function tpVariantKey(name: unknown) {
  const k = String(name ?? "Normal").replace(/[\s_-]/g, "").toLowerCase();
  return TP_VARIANTS[k] ?? String(name).replace(/\s+/g, "");
}

function tcgplayerBlock(tp: J): MarketPrices | null {
  if (!tp || !Array.isArray(tp.prices) || !tp.prices.length) return null;
  const variants: Record<string, PriceVariant> = {};
  let updatedAt: string | null = null;
  for (const p of tp.prices) {
    const v: PriceVariant = {
      market: num(p.market_price),
      low: num(p.low_price),
      mid: num(p.mid_price),
      high: num(p.high_price),
      directLow: num(p.direct_low_price),
    };
    if (Object.values(v).every((x) => x == null)) continue;
    variants[tpVariantKey(p.sub_type_name)] = v;
    updatedAt = updatedAt ?? p.updated_at ?? null;
  }
  if (!Object.keys(variants).length) return null;
  return { currency: "USD", url: tp.url ?? null, updatedAt, variants };
}

function cardmarketBlock(cm: J): MarketPrices | null {
  if (!cm || !Array.isArray(cm.prices) || !cm.prices.length) return null;
  const variants: Record<string, PriceVariant> = {};
  let updatedAt: string | null = null;
  for (const p of cm.prices) {
    const v: PriceVariant = {
      market: num(p.avg),
      low: num(p.low),
      trend: num(p.trend),
      avg1: num(p.avg1),
      avg7: num(p.avg7),
      avg30: num(p.avg30),
    };
    // CardMarket returns trend: 0 with everything else null for variants that don't exist; drop those.
    const meaningful = (v.market ?? 0) > 0 || (v.low ?? 0) > 0 || (v.trend ?? 0) > 0 || (v.avg7 ?? 0) > 0;
    if (!meaningful) continue;
    variants[String(p.variant_type ?? "normal")] = v;
    updatedAt = updatedAt ?? p.updated_at ?? null;
  }
  if (!Object.keys(variants).length) return null;
  return { currency: "EUR", url: cm.product_url ?? cm.url ?? null, updatedAt, variants };
}

export function normalizePokewalletCard(c: J, sets?: Map<string, PwSet>): NormalizedCard {
  const id = String(c.id);
  const info: J = c.card_info ?? c;
  const setId = info.set_id != null ? String(info.set_id) : null;
  const set = setId ? sets?.get(setId) : undefined;
  // For Japanese sets card_info.set_code is sometimes the numeric set_id; prefer the set list.
  const setCode = set?.code ?? (info.set_code && !/^\d+$/.test(String(info.set_code)) ? String(info.set_code) : null);
  const language = set?.language ?? (id.startsWith("pk_") ? "eng" : "jap");
  const prices: CardPrices = { tcgplayer: tcgplayerBlock(c.tcgplayer), cardmarket: cardmarketBlock(c.cardmarket) };
  return {
    id: `pw:${id}`,
    tcg: "pokemon",
    name: String(info.name ?? "Unknown"),
    setName: set?.name ?? info.set_name ?? null,
    setCode,
    setId,
    cardNumber: info.card_number ? String(info.card_number) : null,
    rarity: info.rarity ?? null,
    variant: null,
    language,
    imageUrl: `${POKEWALLET_BASE}/images/${id}?size=high`,
    releaseDate: set?.releaseDate ?? null,
    sourceId: id,
    prices,
    meta: {
      hp: num(info.hp),
      types: info.card_type ?? null,
      stage: info.stage ?? null,
      attacks: info.attacks ?? null,
      weaknesses: info.weakness ?? null,
      resistances: info.resistance ?? null,
      retreatCost: num(info.retreat_cost),
      cardText: info.card_text ?? null,
      imageLanguages: c.images?.languages ?? null,
      tcgplayerUrl: c.tcgplayer?.url ?? null,
      cardmarketUrl: c.cardmarket?.product_url ?? null,
    },
  };
}

export async function pwSearch(q: string, limit = 20, page = 1): Promise<NormalizedCard[]> {
  const [payload, sets] = await Promise.all([pwFetch("/search", { q, limit, page }), setsById()]);
  const list: J[] = payload.results ?? payload.data ?? payload.cards ?? [];
  return list.map((c) => normalizePokewalletCard(c, sets));
}

export async function pwCard(id: string): Promise<NormalizedCard> {
  const [payload, sets] = await Promise.all([pwFetch(`/cards/${encodeURIComponent(id)}`), setsById()]);
  const c = payload.card ?? payload.data ?? payload;
  return normalizePokewalletCard(c, sets);
}

export async function pwSetCards(setCode: string, language: string, page = 1, limit = 50) {
  const [payload, sets] = await Promise.all([pwFetch(`/sets/${encodeURIComponent(setCode)}`, { page, limit, language }), setsById()]);
  if (payload.disambiguation) throw new Error(`PokéWallet: set ${setCode} is ambiguous; pass language (eng/jap)`);
  const cards = ((payload.cards ?? []) as J[]).map((c) => normalizePokewalletCard(c, sets));
  const totalPages = num(payload.pagination?.total_pages);
  return { cards, totalPages, set: payload.set ?? null };
}

/** PRO/trial endpoint; returns [] on 403 so callers fall back to local snapshots. */
export async function pwPriceHistory(id: string): Promise<{ date: string; tcgplayerMarket: number | null; cardmarketAvg: number | null }[]> {
  try {
    const payload = await pwFetch(`/cards/${encodeURIComponent(id)}/price-history`);
    const rows: J[] = payload.history ?? payload.data ?? payload.snapshots ?? payload.prices ?? [];
    return rows
      .map((r) => ({
        date: String(r.date ?? r.day ?? r.timestamp ?? r.updated_at ?? "").slice(0, 10),
        tcgplayerMarket: num(r.tcgplayer?.market_price ?? r.tcgplayer_market ?? r.market_price ?? r.tcgplayer),
        cardmarketAvg: num(r.cardmarket?.avg ?? r.cardmarket_avg ?? r.avg ?? r.cardmarket),
      }))
      .filter((r) => r.date);
  } catch {
    return [];
  }
}
