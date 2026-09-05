import { and, eq, like, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { cached, getSetting } from "./cache";
import { convert, getRates } from "./currency";
import { nowIso, today } from "./format";
import { hasPokewalletKey, pwCard, pwPriceHistory, pwSearch, pwSets } from "./pokewallet";
import { sfCard, sfSearch, sfSets } from "./scryfall";
import { bestPrice, type CardPrices, type CardSummary, type NormalizedCard, type Tcg } from "./types";
import { hasTcgcsvData } from "./tcgcsv";
import { ygoCard, ygoSearch } from "./ygoprodeck";

const PRICE_TTL_MS = 20 * 3600 * 1000; // refresh a card's price at most once a day

/** Collector shorthand -> substring of the TCGPlayer rarity name. */
const RARITY_ALIASES: Record<string, string> = {
  sar: "special art rare",
  ar: "art rare",
  sr: "super rare",
  ur: "ultra rare",
  hr: "hyper rare",
  chr: "character rare",
  csr: "character super rare",
  rr: "double rare",
  rrr: "triple rare",
  ssr: "shiny secret rare",
  mur: "mega ultra rare",
  mar: "mega attack rare",
  bwr: "black white rare",
  promo: "promo",
};

export function sourceOf(cardId: string): "pw" | "sf" | "ygo" | "tp" {
  const p = cardId.split(":")[0];
  if (p === "pw" || p === "sf" || p === "ygo" || p === "tp") return p;
  throw new Error(`unknown card id prefix: ${cardId}`);
}

export function rowToCard(row: schema.Card): NormalizedCard {
  return {
    id: row.id,
    tcg: row.tcg as Tcg,
    name: row.name,
    setName: row.setName,
    setCode: row.setCode,
    setId: row.setId,
    cardNumber: row.cardNumber,
    rarity: row.rarity,
    variant: row.variant,
    language: row.language,
    imageUrl: row.imageUrl,
    releaseDate: row.releaseDate,
    sourceId: row.sourceId,
    prices: row.pricesJson ? (JSON.parse(row.pricesJson) as CardPrices) : {},
    meta: row.metaJson ? JSON.parse(row.metaJson) : undefined,
  };
}

export function toSummary(c: NormalizedCard): CardSummary {
  const bp = bestPrice(c.prices);
  return {
    id: c.id,
    tcg: c.tcg,
    name: c.name,
    setName: c.setName,
    setCode: c.setCode,
    cardNumber: c.cardNumber,
    rarity: c.rarity,
    language: c.language,
    price: bp ? { amount: bp.amount, currency: bp.currency, variant: bp.variant } : null,
    prices: c.prices,
  };
}

/** Insert/update the card row and record today's price snapshot. */
export function upsertCard(c: NormalizedCard, opts: { touchPrices?: boolean } = { touchPrices: true }) {
  const now = nowIso();
  const hasPrices = !!(c.prices.tcgplayer || c.prices.cardmarket);
  db.insert(schema.cards)
    .values({
      id: c.id,
      tcg: c.tcg,
      name: c.name,
      setName: c.setName ?? null,
      setCode: c.setCode ?? null,
      setId: c.setId ?? null,
      cardNumber: c.cardNumber ?? null,
      rarity: c.rarity ?? null,
      variant: c.variant ?? null,
      language: c.language,
      imageUrl: c.imageUrl ?? null,
      releaseDate: c.releaseDate ?? null,
      sourceId: c.sourceId,
      pricesJson: hasPrices ? JSON.stringify(c.prices) : null,
      priceUpdatedAt: hasPrices ? now : null,
      metaJson: c.meta ? JSON.stringify(c.meta) : null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: schema.cards.id,
      set: {
        name: c.name,
        setName: c.setName ?? null,
        setCode: c.setCode ?? null,
        cardNumber: c.cardNumber ?? null,
        rarity: c.rarity ?? null,
        language: c.language,
        imageUrl: c.imageUrl ?? null,
        releaseDate: c.releaseDate ?? null,
        ...(hasPrices ? { pricesJson: JSON.stringify(c.prices), priceUpdatedAt: now } : {}),
        ...(c.meta ? { metaJson: JSON.stringify(c.meta) } : {}),
        updatedAt: now,
      },
    })
    .run();
  if (hasPrices && opts.touchPrices !== false) recordPriceSnapshot(c);
}

/** Write today's price rows (one per market+variant) and the compact price_history row. */
export function recordPriceSnapshot(c: NormalizedCard, date = today()) {
  const now = nowIso();
  const markets: ("tcgplayer" | "cardmarket")[] = ["tcgplayer", "cardmarket"];
  const variantSet = new Set<string>();
  for (const m of markets) {
    const mp = c.prices[m];
    if (!mp) continue;
    for (const [variant, v] of Object.entries(mp.variants)) {
      variantSet.add(variant);
      db.insert(schema.cardPrices)
        .values({
          cardId: c.id,
          date,
          variantType: variant,
          source: m,
          currency: mp.currency,
          market: v.market ?? null,
          low: v.low ?? null,
          mid: v.mid ?? null,
          high: v.high ?? null,
          trend: v.trend ?? null,
          avg1: v.avg1 ?? null,
          avg7: v.avg7 ?? null,
          avg30: v.avg30 ?? null,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [schema.cardPrices.cardId, schema.cardPrices.date, schema.cardPrices.variantType, schema.cardPrices.source],
          set: {
            market: v.market ?? null,
            low: v.low ?? null,
            mid: v.mid ?? null,
            high: v.high ?? null,
            trend: v.trend ?? null,
            avg1: v.avg1 ?? null,
            avg7: v.avg7 ?? null,
            avg30: v.avg30 ?? null,
            updatedAt: now,
          },
        })
        .run();
    }
  }
  for (const variant of variantSet) {
    const tp = c.prices.tcgplayer?.variants[variant];
    const cm = c.prices.cardmarket?.variants[variant] ?? c.prices.cardmarket?.variants.normal;
    db.insert(schema.priceHistory)
      .values({
        cardId: c.id,
        date,
        variantType: variant,
        tcgplayerMarket: tp?.market ?? null,
        cardmarketAvg: cm?.market ?? cm?.trend ?? cm?.avg7 ?? null,
      })
      .onConflictDoUpdate({
        target: [schema.priceHistory.cardId, schema.priceHistory.date, schema.priceHistory.variantType],
        set: { tcgplayerMarket: tp?.market ?? null, cardmarketAvg: cm?.market ?? cm?.trend ?? cm?.avg7 ?? null },
      })
      .run();
  }
}

async function fetchRemote(cardId: string): Promise<NormalizedCard> {
  const [src, ...rest] = cardId.split(":");
  const sourceId = rest.join(":");
  if (src === "pw") return pwCard(sourceId);
  if (src === "sf") return sfCard(sourceId);
  if (src === "ygo") return ygoCard(sourceId);
  if (src === "tp") throw new Error("TCGPlayer products are refreshed by the nightly TCGCSV import");
  throw new Error(`unknown source ${src}`);
}

/** Get a card, from the local DB when fresh, otherwise from its API (and cache it). */
export async function getCard(cardId: string, opts: { forceRefresh?: boolean } = {}): Promise<NormalizedCard | null> {
  const row = db.select().from(schema.cards).where(eq(schema.cards.id, cardId)).get();
  if (row && cardId.startsWith("tp:")) return rowToCard(row); // bulk-imported; refreshed nightly, never fetched individually
  const stale = !row || !row.priceUpdatedAt || Date.now() - Date.parse(row.priceUpdatedAt) > PRICE_TTL_MS;
  if (row && !stale && !opts.forceRefresh) return rowToCard(row);
  try {
    const fresh = await fetchRemote(cardId);
    upsertCard(fresh);
    return fresh;
  } catch (err) {
    if (row) return rowToCard(row);
    if (err instanceof Error && /404|not found/i.test(err.message)) return null;
    throw err;
  }
}

export async function refreshCardPrices(cardId: string) {
  return getCard(cardId, { forceRefresh: true });
}

export interface SearchOpts {
  q: string;
  tcg?: Tcg | "all";
  lang?: "eng" | "jap" | "all";
  limit?: number;
}

/** Search the local DB first (instant, offline), then the live APIs, merging by id. */
export async function searchCards(opts: SearchOpts): Promise<{ cards: CardSummary[]; warnings: string[] }> {
  const q = opts.q.trim();
  const limit = opts.limit ?? 24;
  const tcg = opts.tcg ?? "all";
  const lang = opts.lang ?? "all";
  const warnings: string[] = [];
  if (!q) return { cards: [], warnings };

  // Multi-word queries match every word against name, number, set code or set name
  // ("pikachu 025", "gardevoir mega symphonia"). Rarity shorthand (sar, ar, sr, ur, hr, chr, rr) filters by rarity.
  const rarityWords: string[] = [];
  const words = q
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => {
      const r = RARITY_ALIASES[w.toLowerCase()];
      if (r) rarityWords.push(r);
      return !r;
    });
  const conditions = words.map((w) => or(like(schema.cards.name, `%${w}%`), like(schema.cards.cardNumber, `${w}%`), like(schema.cards.setCode, w), like(schema.cards.setName, `%${w}%`)));
  for (const r of rarityWords) conditions.push(like(schema.cards.rarity, `%${r}%`));
  if (tcg !== "all") conditions.push(eq(schema.cards.tcg, tcg));
  if (lang !== "all") conditions.push(eq(schema.cards.language, lang));
  const localRows = db
    .select()
    .from(schema.cards)
    .where(and(...conditions))
    .orderBy(sql`case when prices_json is null then 1 else 0 end, length(name)`)
    .limit(400)
    .all();
  const merged = new Map<string, NormalizedCard>(localRows.map((r) => [r.id, rowToCard(r)]));

  // When TCGCSV has been imported for a game, the local table is complete for English cards: skip the
  // live API (saves the PokéWallet budget). Japanese Pokémon still goes to PokéWallet for CardMarket data.
  const localComplete = (t: string) => hasTcgcsvData(t, lang === "all" ? undefined : lang) && merged.size > 0;
  const remote: Promise<NormalizedCard[]>[] = [];
  if ((tcg === "all" || tcg === "pokemon") && !(localComplete("pokemon") && lang !== "jap")) {
    if (hasPokewalletKey()) {
      remote.push(
        cached(`pw:search:${q}:${limit}`, 6 * 3600, () => pwSearch(q, limit)).catch((e: Error) => {
          warnings.push(`PokéWallet: ${e.message}`);
          return [];
        }),
      );
    } else warnings.push("PokéWallet API key not configured; Pokémon results are local only.");
  }
  if ((tcg === "all" || tcg === "mtg") && lang !== "jap" && !localComplete("mtg")) {
    remote.push(
      cached(`sf:search:${q}:${limit}`, 6 * 3600, () => sfSearch(q, limit)).catch((e: Error) => {
        warnings.push(`Scryfall: ${e.message}`);
        return [];
      }),
    );
  }
  if ((tcg === "all" || tcg === "yugioh") && lang !== "jap" && !localComplete("yugioh")) {
    remote.push(
      cached(`ygo:search:${q}:${limit}`, 6 * 3600, () => ygoSearch(q, limit)).catch((e: Error) => {
        warnings.push(`YGOProDeck: ${e.message}`);
        return [];
      }),
    );
  }
  const results = await Promise.all(remote);
  for (const list of results) {
    for (const c of list) {
      if (lang !== "all" && c.language !== lang) continue;
      if (!merged.has(c.id)) {
        merged.set(c.id, c);
        upsertCard(c);
      }
    }
  }
  // The same printing can arrive from two sources (tp: bulk + pw: live). Keep one entry per
  // set+number+language, prefer the TCGCSV row, and carry the CardMarket block over from PokéWallet.
  const byPrinting = new Map<string, NormalizedCard>();
  for (const c of merged.values()) {
    const numKey = (c.cardNumber ?? "").split("/")[0].trim().replace(/^0+(?=\d)/, "").toLowerCase();
    const key = c.setCode && numKey ? `${c.tcg}:${c.language}:${c.setCode.toLowerCase()}:${numKey}` : c.id;
    const prev = byPrinting.get(key);
    if (!prev) {
      byPrinting.set(key, c);
      continue;
    }
    const keep = prev.id.startsWith("tp:") ? prev : c.id.startsWith("tp:") ? c : prev;
    const other = keep === prev ? c : prev;
    if (!keep.prices.cardmarket && other.prices.cardmarket) keep.prices = { ...keep.prices, cardmarket: other.prices.cardmarket };
    if (!keep.prices.tcgplayer && other.prices.tcgplayer) keep.prices = { ...keep.prices, tcgplayer: other.prices.tcgplayer };
    byPrinting.set(key, keep);
  }
  const displayCurrency = getSetting("currency", "USD");
  const fx = await getRates();
  const cards = [...byPrinting.values()].map((c) => {
    const s = toSummary(c);
    s.display = s.price ? { amount: convert(s.price.amount, s.price.currency, displayCurrency, fx), currency: displayCurrency } : null;
    return s;
  });
  // Exact name hits first, then singles by price; sealed products (no number) sink unless the query asks for them.
  const ql = q.toLowerCase();
  const wantsSealed = /box|etb|bundle|pack|case|collection|tin|display/.test(ql);
  cards.sort((a, b) => {
    const ea = a.name.toLowerCase().startsWith(ql) ? 1 : 0;
    const eb = b.name.toLowerCase().startsWith(ql) ? 1 : 0;
    if (ea !== eb) return eb - ea;
    const sa = !a.cardNumber && !wantsSealed ? 1 : 0;
    const sb = !b.cardNumber && !wantsSealed ? 1 : 0;
    if (sa !== sb) return sa - sb;
    return (b.price?.amount ?? 0) - (a.price?.amount ?? 0);
  });
  return { cards: cards.slice(0, Math.max(60, limit * 2)), warnings };
}

/** Price history: local daily snapshots merged with PokéWallet history when available. */
export async function getPriceHistory(cardId: string, variant?: string) {
  const local = db
    .select()
    .from(schema.priceHistory)
    .where(and(eq(schema.priceHistory.cardId, cardId), variant ? eq(schema.priceHistory.variantType, variant) : sql`1=1`))
    .orderBy(schema.priceHistory.date)
    .all();
  const byDate = new Map<string, { date: string; tcgplayerMarket: number | null; cardmarketAvg: number | null }>();
  if (sourceOf(cardId) === "pw" && hasPokewalletKey()) {
    const remote = await cached(`pw:history:${cardId}`, 24 * 3600, () => pwPriceHistory(cardId.slice(3)));
    for (const r of remote) byDate.set(r.date, r);
  }
  for (const r of local) {
    const prev = byDate.get(r.date);
    byDate.set(r.date, {
      date: r.date,
      tcgplayerMarket: r.tcgplayerMarket ?? prev?.tcgplayerMarket ?? null,
      cardmarketAvg: r.cardmarketAvg ?? prev?.cardmarketAvg ?? null,
    });
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export async function listSets(tcg: Tcg | "all", lang: "eng" | "jap" | "all") {
  const rows = db.select().from(schema.sets).all();
  if (!rows.length || (tcg === "pokemon" && !rows.some((r) => r.tcg === "pokemon"))) await syncSets();
  return db
    .select()
    .from(schema.sets)
    .where(and(tcg === "all" ? sql`1=1` : eq(schema.sets.tcg, tcg), lang === "all" ? sql`1=1` : eq(schema.sets.language, lang)))
    .orderBy(sql`release_date desc`)
    .all();
}

export async function syncSets() {
  const jobs: Promise<void>[] = [];
  if (hasPokewalletKey()) {
    jobs.push(
      cached("pw:sets", 7 * 86400, pwSets).then((list) => {
        for (const s of list) {
          db.insert(schema.sets)
            .values({ id: `pokemon:${s.code}:${s.language}`, tcg: "pokemon", code: s.code, name: s.name, language: s.language, total: s.total, releaseDate: s.releaseDate, imageUrl: null })
            .onConflictDoUpdate({ target: schema.sets.id, set: { name: s.name, total: s.total, releaseDate: s.releaseDate } })
            .run();
        }
      }).catch(() => undefined),
    );
  }
  jobs.push(
    cached("sf:sets", 7 * 86400, sfSets).then((list) => {
      for (const s of list) {
        db.insert(schema.sets)
          .values({ id: `mtg:${s.code}:eng`, tcg: "mtg", code: s.code, name: s.name, language: "eng", total: s.total, releaseDate: s.releaseDate, imageUrl: s.imageUrl })
          .onConflictDoUpdate({ target: schema.sets.id, set: { name: s.name, total: s.total, releaseDate: s.releaseDate } })
          .run();
      }
    }).catch(() => undefined),
  );
  await Promise.all(jobs);
}
