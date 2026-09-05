import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { listAlerts, upsertAlert } from "@/lib/alerts";

const Body = z.object({
  cardId: z.string().min(3),
  thresholdPct: z.coerce.number().min(0.5).max(1000).default(10),
  variantType: z.string().max(40).optional(),
});

export async function GET() {
  const alerts = listAlerts();
  return NextResponse.json({ alerts, triggered: alerts.filter((a) => a.triggered).length });
}

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", details: parsed.error.issues }, { status: 400 });
  try {
    return NextResponse.json(upsertAlert(parsed.data.cardId, parsed.data.thresholdPct, parsed.data.variantType), { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 400 });
  }
}
