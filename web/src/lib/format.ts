export function fmtMoney(amount: number | null | undefined, currency = "USD", opts: { compact?: boolean } = {}) {
  if (amount == null || !Number.isFinite(amount)) return "—";
  const digits = currency === "JPY" ? 0 : Math.abs(amount) < 1 && amount !== 0 ? 2 : 2;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    notation: opts.compact && Math.abs(amount) >= 100_000 ? "compact" : "standard",
  }).format(amount);
}

export function fmtPct(p: number | null | undefined, withSign = true) {
  if (p == null || !Number.isFinite(p)) return "—";
  const s = `${Math.abs(p).toFixed(2)}%`;
  if (!withSign) return s;
  return p > 0 ? `+${s}` : p < 0 ? `-${s}` : s;
}

export function fmtSigned(amount: number, currency = "USD") {
  const s = fmtMoney(Math.abs(amount), currency);
  return amount > 0 ? `+${s}` : amount < 0 ? `-${s}` : s;
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

export const RANGES = ["1D", "1W", "1M", "3M", "6M", "1Y", "ALL"] as const;
export type Range = (typeof RANGES)[number];
export function rangeToDays(r: Range): number | null {
  return { "1D": 1, "1W": 7, "1M": 30, "3M": 90, "6M": 180, "1Y": 365, ALL: null }[r];
}

export function langLabel(l: string | null | undefined) {
  return { eng: "EN", jap: "JP", chn: "CN", kor: "KR", fr: "FR", de: "DE", it: "IT", es: "ES", pt: "PT" }[l ?? ""] ?? (l ?? "").toUpperCase();
}
