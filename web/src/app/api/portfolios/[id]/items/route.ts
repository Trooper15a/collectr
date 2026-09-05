import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { getCard } from "@/lib/cards";
import { nowIso } from "@/lib/format";
import { snapshotPortfolios } from "@/lib/portfolio";
import { ItemBody } from "@/lib/validation";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const portfolioId = Number((await ctx.params).id);
  if (!Number.isInteger(portfolioId)) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  const portfolio = db.select().from(schema.portfolios).where(eq(schema.portfolios.id, portfolioId)).get();
  if (!portfolio) return NextResponse.json({ error: "Portfolio not found" }, { status: 404 });
  const parsed = ItemBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", details: parsed.error.issues }, { status: 400 });
  const d = parsed.data;
  try {
    const card = await getCard(d.cardId);
    if (!card) return NextResponse.json({ error: "Card not found" }, { status: 404 });
    const row = db
      .insert(schema.portfolioItems)
      .values({
        portfolioId,
        cardId: card.id,
        quantity: d.quantity,
        variantType: d.variantType,
        condition: d.condition,
        isGraded: d.isGraded,
        gradingCompany: d.isGraded ? (d.gradingCompany ?? null) : null,
        grade: d.isGraded ? (d.grade ?? null) : null,
        certNumber: d.isGraded ? (d.certNumber ?? null) : null,
        costBasis: d.costBasis ?? null,
        costCurrency: d.costCurrency,
        notes: d.notes ?? null,
        addedAt: nowIso(),
      })
      .returning()
      .get();
    snapshotPortfolios().catch(() => undefined);
    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    console.error("add item error", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to add" }, { status: 500 });
  }
}
