import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSetting, setSetting } from "@/lib/cache";
import { getRates } from "@/lib/currency";
import { hasPokewalletKey, pokewalletLimiter } from "@/lib/pokewallet";

const Patch = z.object({
  currency: z.enum(["USD", "EUR", "GBP", "CAD", "JPY", "AUD"]).optional(),
  theme: z.enum(["dark", "light"]).optional(),
  language: z.enum(["en", "ja"]).optional(),
  bulkCondition: z.enum(["NM", "LP", "MP", "HP", "DMG"]).optional(),
  bulkCurrency: z.enum(["USD", "EUR", "GBP", "CAD", "JPY", "AUD"]).optional(),
  bulkPortfolio: z.string().min(1).max(100).optional(),
});

export async function GET() {
  const fx = await getRates();
  return NextResponse.json({
    currency: getSetting("currency", "USD"),
    theme: getSetting("theme", "dark"),
    language: getSetting("language", "en"),
    bulkCondition: getSetting("bulkCondition", "NM"),
    bulkCurrency: getSetting("bulkCurrency", "CAD"),
    bulkPortfolio: getSetting("bulkPortfolio", "My Collection"),
    pokewalletConfigured: hasPokewalletKey(),
    pokewalletBudget: pokewalletLimiter.remaining,
    fxDate: fx.date,
  });
}

export async function PATCH(req: NextRequest) {
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", details: parsed.error.issues }, { status: 400 });
  for (const [k, v] of Object.entries(parsed.data)) if (v) setSetting(k, v);
  return GET();
}
