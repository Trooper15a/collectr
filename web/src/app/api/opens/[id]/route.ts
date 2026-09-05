import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { getSetting } from "@/lib/cache";
import { convert, getRates } from "@/lib/currency";
import { bestPrice } from "@/lib/types";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const openId = Number(id);
  const open = db.select().from(schema.boxOpens).where(eq(schema.boxOpens.id, openId)).get();
  if (!open) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const currency = getSetting("currency", "USD");
  const fx = await getRates();
  const items = db.select().from(schema.boxOpenItems).where(eq(schema.boxOpenItems.boxOpenId, openId)).all();

  const detailed = items.map((item) => {
    const card = db.select().from(schema.cards).where(eq(schema.cards.id, item.cardId)).get();
    const prices = card?.pricesJson ? JSON.parse(card.pricesJson) : null;
    const bp = bestPrice(prices, item.variantType);
    const value = bp ? convert(bp.amount, bp.currency, currency, fx) * item.quantity : 0;
    return {
      id: item.id,
      cardId: item.cardId,
      name: card?.name ?? "Unknown",
      setName: card?.setName,
      cardNumber: card?.cardNumber,
      rarity: card?.rarity,
      variantType: item.variantType,
      quantity: item.quantity,
      value,
    };
  });

  const totalValue = detailed.reduce((s, i) => s + i.value, 0);
  const costDisplay = convert(open.cost, open.costCurrency, currency, fx);

  return NextResponse.json({
    open: {
      id: open.id,
      name: open.name,
      productType: open.productType,
      setCode: open.setCode,
      setName: open.setName,
      cost: costDisplay,
      costRaw: open.cost,
      costCurrency: open.costCurrency,
      totalValue,
      profit: totalValue - costDisplay,
      roi: costDisplay > 0 ? ((totalValue - costDisplay) / costDisplay) * 100 : 0,
      openedAt: open.openedAt,
    },
    items: detailed,
    currency,
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  db.delete(schema.boxOpens).where(eq(schema.boxOpens.id, Number(id))).run();
  return NextResponse.json({ ok: true });
}
