import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { TCG_IDS } from "@/lib/types";
import { db, schema } from "@/db";
import { getSetting } from "@/lib/cache";
import { getRates } from "@/lib/currency";
import { RANGES, type Range } from "@/lib/format";
import { summarize, valuedItems, valueSeries } from "@/lib/portfolio";

const Patch = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  tcgId: z.enum(TCG_IDS).nullable().optional(),
  language: z.enum(["eng", "jap"]).nullable().optional(),
});

function parseId(id: string) {
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const id = parseId((await ctx.params).id);
  if (!id) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  const portfolio = db.select().from(schema.portfolios).where(eq(schema.portfolios.id, id)).get();
  if (!portfolio) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const currency = req.nextUrl.searchParams.get("currency") ?? getSetting("currency", "USD");
  const rangeParam = req.nextUrl.searchParams.get("range") ?? "1M";
  const range = (RANGES as readonly string[]).includes(rangeParam) ? (rangeParam as Range) : "1M";
  try {
    const fx = await getRates();
    const items = await valuedItems(id, currency, fx);
    return NextResponse.json({ portfolio, items, summary: summarize(items), series: valueSeries(id, range, currency, fx), currency });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const id = parseId((await ctx.params).id);
  if (!id) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", details: parsed.error.issues }, { status: 400 });
  const row = db.update(schema.portfolios).set(parsed.data).where(eq(schema.portfolios.id, id)).returning().get();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(row);
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const id = parseId((await ctx.params).id);
  if (!id) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  db.delete(schema.portfolios).where(eq(schema.portfolios.id, id)).run();
  return NextResponse.json({ ok: true });
}
