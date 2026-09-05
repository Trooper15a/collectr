import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { indexCard } from "@/lib/model-index";
import { linkManually, resolveScanId } from "@/lib/resolve";

const Query = z.object({ id: z.string().min(3).max(200) });
const LinkBody = z.object({ scanId: z.string().min(3).max(200), cardId: z.string().min(3).max(200) });

/** GET /api/resolve?id=tcgdex:ja:SV1a-001 -> { card, method, scan } */
export async function GET(req: NextRequest) {
  const parsed = Query.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  try {
    const { card, method } = await resolveScanId(parsed.data.id);
    const scan = indexCard(parsed.data.id) ?? null;
    if (!card) {
      const msg =
        method === "no-api-key"
          ? "PokéWallet API key not configured, so scanned cards cannot be priced."
          : `No priced listing found for ${scan?.name ?? parsed.data.id}${scan?.set ? ` (${scan.set} #${scan.num})` : ""}. Search by name and pick it manually.`;
      return NextResponse.json({ card: null, method, scan, error: msg }, { status: 404 });
    }
    return NextResponse.json({ card, method, scan });
  } catch (err) {
    console.error("resolve error", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Resolve failed" }, { status: 500 });
  }
}

/** POST /api/resolve { scanId, cardId } -> remember a manual link */
export async function POST(req: NextRequest) {
  const parsed = LinkBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  linkManually(parsed.data.scanId, parsed.data.cardId);
  return NextResponse.json({ ok: true });
}
