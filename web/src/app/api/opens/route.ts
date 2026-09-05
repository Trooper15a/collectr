import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { getSetting } from "@/lib/cache";
import { convert, getRates } from "@/lib/currency";
import { bestPrice } from "@/lib/types";

const PRODUCT_TYPES = ["booster_box", "etb", "bundle", "tin", "booster_pack", "collection_box", "other"] as const;

export async function GET() {
  const opens = db.select().from(schema.boxOpens).orderBy(schema.boxOpens.id).all().reverse();
  const currency = getSetting("currency", "USD");
  const fx = await getRates();

  const result = opens.map((o) => {
    const items = db.select().from(schema.boxOpenItems).where(eq(schema.boxOpenItems.boxOpenId, o.id)).all();
    let totalValue = 0;
    let cardCount = 0;
    for (const item of items) {
      const card = db.select().from(schema.cards).where(eq(schema.cards.id, item.cardId)).get();
      if (card?.pricesJson) {
        const prices = JSON.parse(card.pricesJson);
        const bp = bestPrice(prices, item.variantType);
        if (bp) totalValue += convert(bp.amount, bp.currency, currency, fx) * item.quantity;
      }
      cardCount += item.quantity;
    }
    const costDisplay = convert(o.cost, o.costCurrency, currency, fx);
    return {
      id: o.id,
      name: o.name,
      productType: o.productType,
      setCode: o.setCode,
      setName: o.setName,
      cost: costDisplay,
      costRaw: o.cost,
      costCurrency: o.costCurrency,
      totalValue,
      profit: totalValue - costDisplay,
      roi: costDisplay > 0 ? ((totalValue - costDisplay) / costDisplay) * 100 : 0,
      cardCount,
      openedAt: o.openedAt,
    };
  });

  return NextResponse.json({ opens: result, currency });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const name = String(body.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    const cost = Number(body.cost);
    if (!cost || cost <= 0) return NextResponse.json({ error: "Cost must be positive" }, { status: 400 });
    const productType = PRODUCT_TYPES.includes(body.productType) ? body.productType : "booster_box";
    const now = new Date().toISOString();
    const row = db.insert(schema.boxOpens).values({
      name,
      productType,
      setCode: body.setCode ?? null,
      setName: body.setName ?? null,
      cost,
      costCurrency: body.costCurrency ?? "CAD",
      openedAt: body.openedAt ?? now,
      createdAt: now,
    }).returning().get();
    return NextResponse.json({ id: row.id }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
