import { cached } from "./cache";
import type { Currency } from "./types";

import { convert, type Rates } from "./fx";
export { convert, type Rates };

const FALLBACK: Rates = {
  base: "USD",
  date: "fallback",
  rates: { USD: 1, EUR: 0.92, GBP: 0.78, CAD: 1.36, JPY: 150, AUD: 1.52 },
};

/** Free, keyless FX from frankfurter.app (ECB data). Cached 12h. */
export async function getRates(): Promise<Rates> {
  return cached("fx:usd", 12 * 3600, async () => {
    try {
      const res = await fetch("https://api.frankfurter.app/latest?from=USD", { signal: AbortSignal.timeout(8000) });
      if (!res.ok) return FALLBACK;
      const data = (await res.json()) as { date: string; rates: Record<string, number> };
      return { base: "USD" as const, date: data.date, rates: { USD: 1, ...data.rates } };
    } catch {
      return FALLBACK;
    }
  });
}

export function toUsd(amount: number, from: string, rates: Rates) {
  return convert(amount, from, "USD", rates);
}

export function isCurrency(x: string): x is Currency {
  return ["USD", "EUR", "GBP", "CAD", "JPY", "AUD"].includes(x);
}
