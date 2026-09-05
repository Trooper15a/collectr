/** Pure FX helpers, safe to import from client components (no database). */
export interface Rates {
  base: "USD";
  date: string;
  rates: Record<string, number>;
}

export function convert(amount: number, from: string, to: string, rates: Rates): number {
  if (from === to) return amount;
  const fromRate = rates.rates[from] ?? 1;
  const toRate = rates.rates[to] ?? 1;
  return (amount / fromRate) * toRate;
}
