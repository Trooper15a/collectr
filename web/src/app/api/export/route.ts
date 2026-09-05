import { NextRequest } from "next/server";
import { getSetting } from "@/lib/cache";
import { getRates } from "@/lib/currency";
import { valuedItems } from "@/lib/portfolio";
import { bestPrice } from "@/lib/types";

function csvCell(v: unknown) {
  if (v == null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: NextRequest) {
  const currency = req.nextUrl.searchParams.get("currency") ?? getSetting("currency", "USD");
  const fx = await getRates();
  const items = await valuedItems(null, currency, fx);
  const header = [
    "portfolio", "card_id", "tcg", "name", "set", "set_code", "card_number", "language", "rarity", "variant", "quantity",
    "condition", "graded", "grading_company", "grade", "cert_number", "cost_basis", "cost_currency",
    "tcgplayer_usd", "cardmarket_eur", `unit_value_${currency.toLowerCase()}`, `total_value_${currency.toLowerCase()}`,
    `gain_${currency.toLowerCase()}`, "gain_pct", "date_added", "notes",
  ];
  const lines = [header.join(",")];
  for (const i of items) {
    const tp = bestPrice({ tcgplayer: i.card.prices.tcgplayer }, i.variantType);
    const cm = bestPrice({ cardmarket: i.card.prices.cardmarket }, i.variantType);
    lines.push(
      [
        i.portfolioName, i.card.id, i.card.tcg, i.card.name, i.card.setName, i.card.setCode, i.card.cardNumber, i.card.language,
        i.card.rarity, i.variantType, i.quantity, i.condition, i.isGraded ? "yes" : "no", i.gradingCompany, i.grade, i.certNumber,
        i.costBasis, i.costCurrency, tp?.amount?.toFixed(2), cm?.amount?.toFixed(2),
        (i.value / i.quantity).toFixed(2), i.value.toFixed(2), i.gain?.toFixed(2), i.gainPct?.toFixed(2), i.addedAt.slice(0, 10), i.notes,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  const body = "﻿" + lines.join("\r\n");
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="collection-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
