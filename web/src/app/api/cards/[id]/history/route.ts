import { NextRequest, NextResponse } from "next/server";
import { getPriceHistory } from "@/lib/cards";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const variant = req.nextUrl.searchParams.get("variant") ?? undefined;
  try {
    return NextResponse.json({ history: await getPriceHistory(decodeURIComponent(id), variant) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
