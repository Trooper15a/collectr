"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { PriceChart } from "@/components/PriceChart";
import { CardImage, Delta, Empty, Money, Section, Segmented, Skeleton, TcgBadge } from "@/components/ui";
import { RANGES, type Range } from "@/lib/format";

interface SlimItem {
  id: number;
  cardId: string;
  name: string;
  setName: string | null;
  cardNumber: string | null;
  language: string;
  tcg: string;
  portfolioName: string;
  quantity: number;
  value: number;
  gain: number | null;
  gainPct: number | null;
  change24h: number | null;
  change24hPct: number | null;
}

interface AlertRow {
  id: number;
  card: { id: string; name: string; setName: string | null; cardNumber: string | null; tcg: string; language: string };
  thresholdPct: number;
  basePrice: number | null;
  currentPrice: number | null;
  currency: string | null;
  changePct: number | null;
  triggered: boolean;
}

interface Stats {
  totalCards: number;
  uniqueCards: number;
  portfolioCount: number;
  closestSet: { name: string; owned: number; total: number; pct: number; missing: number } | null;
  cheapestMissing: { id: string; name: string; setName: string | null; price: number } | null;
}

interface Dashboard {
  currency: string;
  summary: { value: number; cost: number; gain: number; gainPct: number | null; itemCount: number; uniqueCount: number; change24h: number; change24hPct: number | null };
  series: { date: string; value: number; cost: number }[];
  mostValuable: SlimItem[];
  trending: SlimItem[];
  biggestGains: SlimItem[];
  biggestLosses: SlimItem[];
  stats: Stats;
  fxDate: string;
}

export default function HomePage() {
  const [range, setRange] = useState<Range>("1M");
  const [data, setData] = useState<Dashboard | null>(null);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const loadAlerts = () =>
    fetch("/api/alerts")
      .then((r) => r.json())
      .then((d) => setAlerts(d.alerts ?? []))
      .catch(() => undefined);
  useEffect(() => {
    loadAlerts();
  }, []);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`/api/dashboard?range=${range}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? "Failed");
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message));
  }, [range]);

  useEffect(load, [load]);

  if (error) return <Empty>{error}</Empty>;
  if (!data)
    return (
      <div className="space-y-3 pt-4">
        <Skeleton className="h-28" />
        <Skeleton className="h-44" />
        <Skeleton className="h-40" />
      </div>
    );

  const s = data.summary;
  const c = data.currency;
  const empty = s.uniqueCount === 0;

  return (
    <div>
      <header className="pt-2 pb-1 flex items-baseline justify-between">
        <h1 className="text-xl font-bold">Portfolio</h1>
        <span className="text-[11px] text-muted">{c} · fx {data.fxDate}</span>
      </header>

      <div className="card-surface rounded-3xl p-5 mt-2">
        <div className="text-xs text-muted">Total value</div>
        <div className="text-4xl font-bold tabular tracking-tight mt-1">
          <Money amount={s.value} currency={c} />
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <span>
            <span className="text-muted">24h </span>
            <Delta amount={s.change24h} pct={s.change24hPct} currency={c} />
          </span>
          <span>
            <span className="text-muted">All time </span>
            <Delta amount={s.cost > 0 ? s.gain : null} pct={s.gainPct} currency={c} />
          </span>
        </div>
        <div className="mt-3 -mx-2">
          <PriceChart data={data.series.map((p) => ({ date: p.date, value: p.value }))} currency={c} height={150} />
        </div>
        <div className="mt-2 flex justify-center">
          <Segmented value={range} onChange={setRange} size="xs" options={RANGES.map((r) => ({ value: r, label: r }))} />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <Stat label="Cost basis" value={<Money amount={s.cost} currency={c} />} />
          <Stat label="Net gain" value={<Delta amount={s.cost > 0 ? s.gain : null} currency={c} />} />
          <Stat label="Cards" value={<span className="tabular">{s.itemCount}</span>} />
        </div>
      </div>

      {!empty && data.stats && (
        <div className="card-surface rounded-3xl p-4 mt-3">
          <div className="text-xs text-muted mb-3">Collection</div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat label="Total cards" value={<span className="tabular">{data.stats.totalCards}</span>} />
            <Stat label="Unique" value={<span className="tabular">{data.stats.uniqueCards}</span>} />
            <Stat label="Portfolios" value={<span className="tabular">{data.stats.portfolioCount}</span>} />
          </div>
          {data.stats.closestSet && (
            <div className="mt-4">
              <div className="flex items-baseline justify-between">
                <div className="text-xs font-medium">Closest to complete</div>
                <div className="text-xs text-muted tabular">{data.stats.closestSet.owned}/{data.stats.closestSet.total} · {data.stats.closestSet.pct}%</div>
              </div>
              <div className="text-sm font-semibold mt-1">{data.stats.closestSet.name}</div>
              <div className="mt-2 h-2 rounded-full bg-white/[0.06] overflow-hidden">
                <div className="h-full bg-accent" style={{ width: `${data.stats.closestSet.pct}%` }} />
              </div>
              <div className="text-xs text-muted mt-1">{data.stats.closestSet.missing} cards to go</div>
            </div>
          )}
          {data.stats.cheapestMissing && (
            <Link href={`/cards/${encodeURIComponent(data.stats.cheapestMissing.id)}`} className="mt-3 flex items-center gap-3 rounded-2xl bg-white/[0.03] border border-line p-3">
              <CardImage id={data.stats.cheapestMissing.id} className="w-10 rounded-md" alt="" />
              <div className="flex-1 min-w-0">
                <div className="text-[10px] text-muted uppercase tracking-wider">Cheapest missing</div>
                <div className="text-sm font-medium truncate">{data.stats.cheapestMissing.name}</div>
              </div>
              <div className="text-sm font-semibold">
                <Money amount={data.stats.cheapestMissing.price} currency={c} />
              </div>
            </Link>
          )}
        </div>
      )}

      {alerts.length > 0 && (
        <Section title={`Price alerts${alerts.some((a) => a.triggered) ? ` · ${alerts.filter((a) => a.triggered).length} triggered` : ""}`}>
          <ul className="card-surface rounded-2xl divide-y divide-line overflow-hidden">
            {alerts.map((a) => (
              <li key={a.id} className={`flex items-center gap-3 p-3 ${a.triggered ? "bg-accent/[0.06]" : ""}`}>
                <Link href={`/cards/${encodeURIComponent(a.card.id)}`} className="flex items-center gap-3 flex-1 min-w-0">
                  <CardImage id={a.card.id} className="w-10 rounded-md" alt="" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">
                      {a.triggered && <span className="mr-1">🔔</span>}
                      {a.card.name}
                    </div>
                    <div className="text-xs text-muted truncate">
                      {a.card.setName} {a.card.cardNumber && `#${a.card.cardNumber}`} · ±{a.thresholdPct}% from <Money amount={a.basePrice} currency={a.currency ?? "USD"} />
                    </div>
                  </div>
                </Link>
                <div className="text-right">
                  <div className="font-semibold">
                    <Money amount={a.currentPrice} currency={a.currency ?? "USD"} />
                  </div>
                  <div className="text-xs">
                    <Delta pct={a.changePct} />
                  </div>
                  {a.triggered && (
                    <button
                      onClick={async () => {
                        await fetch(`/api/alerts/${a.id}`, { method: "POST" });
                        loadAlerts();
                      }}
                      className="text-[10px] text-accent"
                    >
                      Dismiss
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Tools">
        <div className="grid grid-cols-3 gap-2">
          <ToolLink href="/grade" icon="🔍" label="Grade Estimator" />
          <ToolLink href="/opens" icon="📦" label="Box Opens" />
          <ToolLink href="/shop" icon="🛒" label="Shop Canada" />
        </div>
      </Section>

      {empty ? (
        <div className="mt-6">
          <Empty>
            Your collection is empty.{" "}
            <Link href="/scan" className="text-accent font-semibold">
              Scan or search
            </Link>{" "}
            for a card to get started.
          </Empty>
        </div>
      ) : (
        <>
          <Section title="Most valuable">
            <ItemList items={data.mostValuable} currency={c} mode="value" />
          </Section>
          <Section title="Trending today">
            {data.trending.length ? <ItemList items={data.trending} currency={c} mode="change" /> : <Empty>Price movements appear after the first daily refresh.</Empty>}
          </Section>
          {data.biggestGains.length > 0 && (
            <Section title="Biggest gains">
              <ItemList items={data.biggestGains} currency={c} mode="gain" />
            </Section>
          )}
          {data.biggestLosses.length > 0 && (
            <Section title="Biggest losses">
              <ItemList items={data.biggestLosses} currency={c} mode="gain" />
            </Section>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white/[0.03] border border-line py-2">
      <div className="text-[10px] text-muted uppercase tracking-wider">{label}</div>
      <div className="text-sm font-semibold mt-0.5">{value}</div>
    </div>
  );
}

function ToolLink({ href, icon, label }: { href: string; icon: string; label: string }) {
  return (
    <Link href={href} className="card-surface rounded-2xl p-3 text-center hover:bg-white/[0.03] border border-line">
      <div className="text-2xl">{icon}</div>
      <div className="text-xs font-medium mt-1">{label}</div>
    </Link>
  );
}

function ItemList({ items, currency, mode }: { items: SlimItem[]; currency: string; mode: "value" | "change" | "gain" }) {
  return (
    <ul className="card-surface rounded-2xl divide-y divide-line overflow-hidden">
      {items.map((i) => (
        <li key={i.id}>
          <Link href={`/cards/${encodeURIComponent(i.cardId)}`} className="flex items-center gap-3 p-3 hover:bg-white/[0.03]">
            <CardImage id={i.cardId} className="w-10 rounded-md" alt="" />
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{i.name}</div>
              <div className="text-xs text-muted truncate">
                {i.setName} {i.cardNumber && `#${i.cardNumber}`} · ×{i.quantity}
              </div>
              <TcgBadge tcg={i.tcg} lang={i.language} />
            </div>
            <div className="text-right">
              <div className="font-semibold">
                <Money amount={i.value} currency={currency} />
              </div>
              <div className="text-xs">
                {mode === "change" && <Delta amount={i.change24h != null ? i.change24h * i.quantity : null} pct={i.change24hPct} currency={currency} />}
                {mode === "gain" && <Delta amount={i.gain} pct={i.gainPct} currency={currency} />}
                {mode === "value" && <Delta pct={i.change24hPct} />}
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
