import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { TCG_IDS } from "@/lib/types";
import { db, schema } from "@/db";
import { getSetting } from "@/lib/cache";
import { getRates } from "@/lib/currency";
import { nowIso } from "@/lib/format";
import { summarize, valuedItems } from "@/lib/portfolio";

const Body = z.object({
  name: z.string().trim().min(1).max(80),
  tcgId: z.enum(TCG_IDS).nullable().optional(),
  language: z.enum(["eng", "jap"]).nullable().optional(),
});

export async function GET(req: NextRequest) {
  const currency = req.nextUrl.searchParams.get("currency") ?? getSetting("currency", "USD");
  try {
    const fx = await getRates();
    const all = await valuedItems(null, currency, fx);
    const list = db.select().from(schema.portfolios).orderBy(schema.portfolios.createdAt).all();
    const portfolios = list.map((p) => ({ ...p, summary: summarize(all.filter((i) => i.portfolioId === p.id)) }));
    return NextResponse.json({ portfolios, all: summarize(all), currency });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", details: parsed.error.issues }, { status: 400 });
  const row = db
    .insert(schema.portfolios)
    .values({ name: parsed.data.name, tcgId: parsed.data.tcgId ?? null, language: parsed.data.language ?? null, createdAt: nowIso() })
    .returning()
    .get();
  return NextResponse.json(row, { status: 201 });
}
