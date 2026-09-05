import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { snapshotPortfolios } from "@/lib/portfolio";
import { ItemPatch } from "@/lib/validation";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  const parsed = ItemPatch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", details: parsed.error.issues }, { status: 400 });
  const d = parsed.data;
  const row = db
    .update(schema.portfolioItems)
    .set({
      ...(d.quantity !== undefined ? { quantity: d.quantity } : {}),
      ...(d.variantType !== undefined ? { variantType: d.variantType } : {}),
      ...(d.condition !== undefined ? { condition: d.condition } : {}),
      ...(d.isGraded !== undefined ? { isGraded: d.isGraded } : {}),
      ...(d.gradingCompany !== undefined ? { gradingCompany: d.gradingCompany } : {}),
      ...(d.grade !== undefined ? { grade: d.grade } : {}),
      ...(d.certNumber !== undefined ? { certNumber: d.certNumber } : {}),
      ...(d.costBasis !== undefined ? { costBasis: d.costBasis } : {}),
      ...(d.costCurrency !== undefined ? { costCurrency: d.costCurrency } : {}),
      ...(d.notes !== undefined ? { notes: d.notes } : {}),
    })
    .where(eq(schema.portfolioItems.id, id))
    .returning()
    .get();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  snapshotPortfolios().catch(() => undefined);
  return NextResponse.json(row);
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  db.delete(schema.portfolioItems).where(eq(schema.portfolioItems.id, id)).run();
  snapshotPortfolios().catch(() => undefined);
  return NextResponse.json({ ok: true });
}
