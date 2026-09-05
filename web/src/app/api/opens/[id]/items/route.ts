import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const openId = Number(id);
  const open = db.select().from(schema.boxOpens).where(eq(schema.boxOpens.id, openId)).get();
  if (!open) return NextResponse.json({ error: "Box open not found" }, { status: 404 });

  try {
    const body = await req.json();
    const cardId = String(body.cardId ?? "").trim();
    if (!cardId) return NextResponse.json({ error: "cardId is required" }, { status: 400 });
    const card = db.select().from(schema.cards).where(eq(schema.cards.id, cardId)).get();
    if (!card) return NextResponse.json({ error: "Card not found" }, { status: 404 });

    const now = new Date().toISOString();
    const row = db.insert(schema.boxOpenItems).values({
      boxOpenId: openId,
      cardId,
      quantity: Math.max(1, Number(body.quantity) || 1),
      variantType: body.variantType ?? "normal",
      addedAt: now,
    }).returning().get();

    return NextResponse.json({ id: row.id }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const itemId = Number(req.nextUrl.searchParams.get("itemId"));
  if (!itemId) return NextResponse.json({ error: "itemId required" }, { status: 400 });
  db.delete(schema.boxOpenItems).where(eq(schema.boxOpenItems.id, itemId)).run();
  return NextResponse.json({ ok: true });
}
