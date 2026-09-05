"use client";

import { fmtMoney, fmtPct, fmtSigned, langLabel } from "@/lib/format";
import { TCGS } from "@/lib/types";

export function Money({ amount, currency = "USD", className = "" }: { amount: number | null | undefined; currency?: string; className?: string }) {
  return <span className={`tabular ${className}`}>{fmtMoney(amount, currency)}</span>;
}

export function Delta({ amount, pct, currency = "USD", className = "" }: { amount?: number | null; pct?: number | null; currency?: string; className?: string }) {
  const v = amount ?? pct ?? 0;
  const color = v > 0 ? "text-up" : v < 0 ? "text-down" : "text-muted";
  return (
    <span className={`tabular ${color} ${className}`}>
      {amount != null && fmtSigned(amount, currency)}
      {amount != null && pct != null && " "}
      {pct != null && `(${fmtPct(pct)})`}
      {amount == null && pct == null && "—"}
    </span>
  );
}

export function CardImage({ id, size = "low", className = "", alt = "" }: { id: string; size?: "low" | "high"; className?: string; alt?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/api/images/${encodeURIComponent(id)}?size=${size}`} alt={alt} loading="lazy" className={`object-cover bg-elev ${className}`} style={{ aspectRatio: "63/88" }} />;
}

export function TcgBadge({ tcg, lang }: { tcg: string; lang?: string | null }) {
  const t = TCGS.find((x) => x.id === tcg);
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide">
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: t?.accent ?? "#888" }} />
      <span className="text-muted">{t?.label ?? tcg}</span>
      {lang && <span className="text-muted/70">· {langLabel(lang)}</span>}
    </span>
  );
}

export function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-muted uppercase tracking-wider">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton rounded-xl ${className}`} />;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="card-surface rounded-2xl p-6 text-center text-sm text-muted">{children}</div>;
}

export function Segmented<T extends string>({ value, options, onChange, size = "sm" }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; size?: "sm" | "xs" }) {
  return (
    <div className="inline-flex rounded-full bg-elev border border-line p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-full ${size === "xs" ? "px-2.5 py-0.5 text-[11px]" : "px-3 py-1 text-xs"} font-medium transition-colors ${value === o.value ? "bg-fg text-bg" : "text-muted hover:text-fg"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Button({ children, variant = "primary", className = "", ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }) {
  const base = "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none";
  const v = {
    primary: "bg-accent text-black hover:brightness-110",
    ghost: "bg-elev border border-line text-fg hover:bg-white/5",
    danger: "bg-down/15 text-down border border-down/30 hover:bg-down/25",
  }[variant];
  return (
    <button className={`${base} ${v} ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-muted mb-1">{label}</span>
      {children}
    </label>
  );
}

export const inputCls = "w-full rounded-xl bg-elev border border-line px-3 py-2.5 text-sm outline-none focus:border-accent/60 placeholder:text-muted/60";
