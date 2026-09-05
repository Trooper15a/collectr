import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { TCG_IDS } from "@/lib/types";
import { searchCards } from "@/lib/cards";

const Query = z.object({
  q: z.string().min(1).max(120),
  tcg: z.enum(["all", ...TCG_IDS]).default("all"),
  lang: z.enum(["all", "eng", "jap"]).default("all"),
  limit: z.coerce.number().int().min(1).max(60).default(24),
});

export async function GET(req: NextRequest) {
  const parsed = Query.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Invalid query", details: parsed.error.issues }, { status: 400 });
  try {
    const result = await searchCards(parsed.data);
    return NextResponse.json(result);
  } catch (err) {
    console.error("search error", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Search failed" }, { status: 500 });
  }
}
