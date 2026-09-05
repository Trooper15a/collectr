import { sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { getSetting } from "@/lib/cache";
import { convert, getRates, type Rates } from "@/lib/currency";
import { RANGES, type Range } from "@/lib/format";
import { summarize, valuedItems, valueSeries, type ValuedItem } from "@/lib/portfolio";
import { bestPrice } from "@/lib/types";

function slim(i: ValuedItem) {
  return {
    id: i.id,
    portfolioId: i.portfolioId,
    portfolioName: i.portfolioName,
    cardId: i.card.id,
    name: i.card.name,
    setName: i.card.setName,
    cardNumber: i.card.cardNumber,
    language: i.card.language,
    tcg: i.card.tcg,
    quantity: i.quantity,
    variantType: i.variantType,
    value: i.value,
    gain: i.gain,
    gainPct: i.gainPct,
    change24h: i.change24h,
    change24hPct: i.change24hPct,
  };
}

export async function GET(req: NextRequest) {
  const currency = req.nextUrl.searchParams.get("currency") ?? getSetting("currency", "USD");
  const rangeParam = req.nextUrl.searchParams.get("range") ?? "1M";
  const range = (RANGES as readonly string[]).includes(rangeParam) ? (rangeParam as Range) : "1M";
  try {
    const fx = await getRates();
    const items = await valuedItems(null, currency, fx);
    const summary = summarize(items);
    const series = valueSeries(null, range, currency, fx);
    const mostValuable = [...items].sort((a, b) => b.value - a.value).slice(0, 10).map(slim);
    const movers = items.filter((i) => i.change24hPct != null);
    const trending = [...movers].sort((a, b) => Math.abs(b.change24hPct ?? 0) - Math.abs(a.change24hPct ?? 0)).slice(0, 10).map(slim);
    const withGain = items.filter((i) => i.gain != null);
    const biggestGains = [...withGain].sort((a, b) => (b.gain ?? 0) - (a.gain ?? 0)).filter((i) => (i.gain ?? 0) > 0).slice(0, 5).map(slim);
    const biggestLosses = [...withGain].sort((a, b) => (a.gain ?? 0) - (b.gain ?? 0)).filter((i) => (i.gain ?? 0) < 0).slice(0, 5).map(slim);
    const stats = collectionStats(items, currency, fx);
    return NextResponse.json({ currency, range, summary, series, mostValuable, trending, biggestGains, biggestLosses, stats, fxDate: fx.date });
  } catch (err) {
    console.error("dashboard error", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}

function collectionStats(items: ValuedItem[], currency: string, fx: Rates) {
  const totalCards = items.reduce((s, i) => s + i.quantity, 0);
  const uniqueCards = new Set(items.map((i) => i.card.id)).size;
  const portfolioCount = new Set(items.map((i) => i.portfolioId)).size;

  const setOwnership = new Map<string, { owned: Set<string>; total: number; name: string }>();
  for (const i of items) {
    const code = i.card.setCode;
    if (!code) continue;
    const key = `${i.card.tcg}:${code}:${i.card.language}`;
    let entry = setOwnership.get(key);
    if (!entry) {
      entry = { owned: new Set(), total: 0, name: i.card.setName ?? code };
      setOwnership.set(key, entry);
    }
    entry.owned.add(i.card.id);
  }
  for (const [key, entry] of setOwnership) {
    const [tcg, code, lang] = key.split(":");
    const row = db.select({ cnt: sql<number>`count(*)` }).from(schema.cards).where(sql`tcg = ${tcg} AND set_code = ${code} AND language = ${lang} AND card_number IS NOT NULL`).get();
    entry.total = row?.cnt ?? 0;
  }

  let closestSet: { name: string; owned: number; total: number; pct: number; missing: number } | null = null;
  for (const entry of setOwnership.values()) {
    if (entry.total < 5) continue;
    const pct = entry.owned.size / entry.total;
    if (pct >= 1) continue;
    if (!closestSet || pct > closestSet.pct) {
      closestSet = { name: entry.name, owned: entry.owned.size, total: entry.total, pct: Math.round(pct * 100), missing: entry.total - entry.owned.size };
    }
  }

  let cheapestMissing: { id: string; name: string; setName: string | null; price: number } | null = null;
  if (closestSet) {
    const ownedIds = new Set(items.map((i) => i.card.id));
    const allCards = db.select().from(schema.cards).where(sql`set_name = ${closestSet.name} AND card_number IS NOT NULL AND prices_json IS NOT NULL`).all();
    for (const row of allCards) {
      if (ownedIds.has(row.id)) continue;
      const prices = row.pricesJson ? JSON.parse(row.pricesJson) : {};
      const bp = bestPrice(prices);
      if (!bp) continue;
      const displayPrice = convert(bp.amount, bp.currency, currency, fx);
      if (!cheapestMissing || displayPrice < cheapestMissing.price) {
        cheapestMissing = { id: row.id, name: row.name, setName: row.setName, price: displayPrice };
      }
    }
  }

  return { totalCards, uniqueCards, portfolioCount, closestSet, cheapestMissing };
}
