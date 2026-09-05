"use client";

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtMoney } from "@/lib/format";

export interface Point {
  date: string;
  value: number | null;
}

export function PriceChart({ data, currency, height = 180, color }: { data: Point[]; currency: string; height?: number; color?: string }) {
  const pts = data.filter((d) => d.value != null);
  if (pts.length < 2) {
    return (
      <div className="flex items-center justify-center text-xs text-muted" style={{ height }}>
        {pts.length === 1 ? "One data point so far. Daily snapshots build this chart over time." : "No price history yet."}
      </div>
    );
  }
  const first = pts[0].value ?? 0;
  const last = pts[pts.length - 1].value ?? 0;
  const stroke = color ?? (last >= first ? "var(--up)" : "var(--down)");
  const min = Math.min(...pts.map((p) => p.value as number));
  const max = Math.max(...pts.map((p) => p.value as number));
  const pad = (max - min) * 0.15 || max * 0.1 || 1;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={pts} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity={0.35} />
            <stop offset="100%" stopColor={stroke} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="date" hide />
        <YAxis domain={[min - pad, max + pad]} hide />
        <Tooltip
          contentStyle={{ background: "var(--bg-elev)", border: "1px solid var(--line)", borderRadius: 12, fontSize: 12 }}
          labelStyle={{ color: "var(--muted)" }}
          formatter={(v) => [fmtMoney(Number(v), currency), ""]}
          separator=""
        />
        <Area type="monotone" dataKey="value" stroke={stroke} strokeWidth={2} fill="url(#fill)" dot={false} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
