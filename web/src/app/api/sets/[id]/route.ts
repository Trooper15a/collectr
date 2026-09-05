import { and, eq, or, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { getSetting } from "@/lib/cache";
import { rowToCard } from "@/lib/cards";
import { convert, getRates } from "@/lib/currency";
import { bestPrice } from "@/lib/types";

/**
 * GET /api/sets/<setId>  where setId is `${tcg}:${code}:${language}` (as in the sets table).
 * Returns the set's singles (sealed excluded), what you own, and the cost to complete it.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const id = decodeURIComponent((await ctx.params).id);
  const set = db.select().from(schema.sets).where(eq(schema.sets.id, id)).get();
  if (!set) return NextResponse.json({ error: "Set not found" }, { status: 404 });
  const currency = req.nextUrl.searchParams.get("currency") ?? getSetting("currency", "USD");
  const fx = await getRates();

  // TCGCSV cards carry the group id in set_id; other sources match on set_code.
  const group = db.select({ setId: schema.cards.setId }).from(schema.cards).where(and(eq(schema.cards.tcg, set.tcg), eq(schema.cards.setCode, set.code), eq(schema.cards.language, set.language), sql`id like 'tp:%'`)).limit(1).get();
  const rows = db
    .select()
    .from(schema.cards)
    .where(
      and(
        eq(schema.cards.tcg, set.tcg),
        eq(schema.cards.language, set.language),
        group?.setId ? or(eq(schema.cards.setId, group.setId), eq(schema.cards.setCode, set.code)) : eq(schema.cards.setCode, set.code),
        sql`card_number is not null`,
      ),
    )
    .all();
  // Prefer one row per card number (TCGCSV first), so PokéWallet duplicates don't double-count.
  const byNumber = new Map<string, ReturnType<typeof rowToCard>>();
  for (const r of rows.sort((a, b) => Number(b.id.startsWith("tp:")) - Number(a.id.startsWith("tp:")))) {
    const key = (r.cardNumber ?? "").split("/")[0].trim().replace(/^0+(?=\d)/, "").toLowerCase() || r.id;
    if (!byNumber.has(key)) byNumber.set(key, rowToCard(r));
  }
  const cards = [...byNumber.values()];
  const ids = cards.map((c) => c.id);
  const owned = new Map<string, number>();
  if (ids.length) {
    const items = db.select({ cardId: schema.portfolioItems.cardId, qty: schema.portfolioItems.quantity }).from(schema.portfolioItems).all();
    for (const it of items) owned.set(it.cardId, (owned.get(it.cardId) ?? 0) + it.qty);
  }
  // Ownership of the same card via a different source id (pw: vs tp:) counts too: match by number.
  const ownedNumbers = new Set<string>();
  const allOwnedCards = db.select({ card: schema.cards }).from(schema.portfolioItems).innerJoin(schema.cards, eq(schema.portfolioItems.cardId, schema.cards.id)).where(and(eq(schema.cards.tcg, set.tcg), eq(schema.cards.language, set.language), eq(schema.cards.setCode, set.code))).all();
  for (const { card } of allOwnedCards) ownedNumbers.add((card.cardNumber ?? "").split("/")[0].trim().replace(/^0+(?=\d)/, "").toLowerCase());

  let missingCost = 0;
  let totalValue = 0;
  let ownedCount = 0;
  const list = cards
    .map((c) => {
      const bp = bestPrice(c.prices);
      const price = bp ? convert(bp.amount, bp.currency, currency, fx) : null;
      const key = (c.cardNumber ?? "").split("/")[0].trim().replace(/^0+(?=\d)/, "").toLowerCase();
      const qty = owned.get(c.id) ?? (ownedNumbers.has(key) ? 1 : 0);
      if (qty > 0) ownedCount++;
      else if (price != null) missingCost += price;
      if (price != null) totalValue += price;
      return { id: c.id, name: c.name, cardNumber: c.cardNumber, rarity: c.rarity, price, owned: qty };
    })
    .sort((a, b) => (a.cardNumber ?? "").localeCompare(b.cardNumber ?? "", undefined, { numeric: true }));

  return NextResponse.json({
    set,
    currency,
    cards: list,
    completion: { owned: ownedCount, total: list.length, pct: list.length ? (ownedCount / list.length) * 100 : 0, missingCost, totalValue },
  });
}
