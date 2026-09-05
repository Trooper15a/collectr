import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { defaultCategoryIds, importStatus, importTcgcsv, TCGCSV_CATEGORIES } from "@/lib/tcgcsv";

const Body = z.object({
  categories: z.array(z.number().int().positive()).min(1).max(20).optional(),
  onlyGroups: z.number().int().positive().max(1000).optional(),
});

/** GET /api/tcgcsv -> import status + available categories */
export async function GET() {
  return NextResponse.json({ status: importStatus(), categories: TCGCSV_CATEGORIES, defaults: defaultCategoryIds() });
}

/** POST /api/tcgcsv { categories?: [3,85] } -> starts an import in the background and returns immediately */
export async function POST(req: NextRequest) {
  const parsed = Body.safeParse((await req.json().catch(() => ({}))) ?? {});
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", details: parsed.error.issues }, { status: 400 });
  const status = importStatus();
  if (status.running) return NextResponse.json({ error: "Import already running", status }, { status: 409 });
  const cats = parsed.data.categories ?? defaultCategoryIds();
  importTcgcsv(cats, { onlyGroups: parsed.data.onlyGroups }).catch((e) => console.error("[tcgcsv] import failed", e));
  return NextResponse.json({ started: true, categories: cats }, { status: 202 });
}
