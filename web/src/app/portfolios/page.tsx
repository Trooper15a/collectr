"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button, Delta, Empty, Field, Money, Skeleton, inputCls } from "@/components/ui";
import { TCGS } from "@/lib/types";

interface Summary {
  value: number;
  cost: number;
  gain: number;
  gainPct: number | null;
  itemCount: number;
  uniqueCount: number;
  change24h: number;
  change24hPct: number | null;
}
interface PortfolioRow {
  id: number;
  name: string;
  tcgId: string | null;
  language: string | null;
  summary: Summary;
}

export default function PortfoliosPage() {
  const [data, setData] = useState<{ portfolios: PortfolioRow[]; all: Summary; currency: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [tcgId, setTcgId] = useState<string>("");
  const [language, setLanguage] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/portfolios")
      .then((r) => r.json())
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  async function create() {
    setError(null);
    const r = await fetch("/api/portfolios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, tcgId: tcgId || null, language: language || null }),
    });
    if (!r.ok) return setError((await r.json()).error ?? "Failed");
    setName("");
    setCreating(false);
    load();
  }

  if (!data)
    return (
      <div className="space-y-3 pt-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-20" />
      </div>
    );

  const c = data.currency;
  const groups = new Map<string, PortfolioRow[]>();
  for (const p of data.portfolios) {
    const key = p.tcgId ?? "other";
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }

  return (
    <div>
      <header className="pt-2 pb-3 flex items-center justify-between">
        <h1 className="text-xl font-bold">Portfolios</h1>
        <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => setCreating((v) => !v)}>
          + New
        </Button>
      </header>

      {creating && (
        <div className="card-surface rounded-2xl p-4 mb-4 grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Field label="Name">
              <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Japanese Promos" autoFocus />
            </Field>
          </div>
          <Field label="TCG (optional)">
            <select className={inputCls} value={tcgId} onChange={(e) => setTcgId(e.target.value)}>
              <option value="">Any</option>
              {TCGS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Language (optional)">
            <select className={inputCls} value={language} onChange={(e) => setLanguage(e.target.value)}>
              <option value="">Any</option>
              <option value="eng">English</option>
              <option value="jap">Japanese</option>
            </select>
          </Field>
          {error && <div className="col-span-2 text-sm text-down">{error}</div>}
          <Button className="col-span-2" onClick={create} disabled={!name.trim()}>
            Create portfolio
          </Button>
        </div>
      )}

      <div className="card-surface rounded-3xl p-4">
        <div className="text-xs text-muted">All portfolios</div>
        <div className="text-3xl font-bold tabular mt-1">
          <Money amount={data.all.value} currency={c} />
        </div>
        <div className="text-sm mt-1 flex gap-4">
          <span>
            <span className="text-muted">24h </span>
            <Delta amount={data.all.change24h} pct={data.all.change24hPct} currency={c} />
          </span>
          <span>
            <span className="text-muted">{data.all.itemCount} cards</span>
          </span>
        </div>
      </div>

      {data.portfolios.length === 0 && (
        <div className="mt-4">
          <Empty>No portfolios yet. Create one, or add a card from Scan and one will be created for you.</Empty>
        </div>
      )}

      {[...groups.entries()].map(([tcg, list]) => {
        const t = TCGS.find((x) => x.id === tcg);
        return (
          <section key={tcg} className="mt-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted mb-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full" style={{ background: t?.accent ?? "#888" }} />
              {t?.label ?? "Other"}
            </h2>
            <ul className="space-y-2">
              {list.map((p) => (
                <li key={p.id}>
                  <Link href={`/portfolios/${p.id}`} className="card-surface rounded-2xl p-4 flex items-center justify-between hover:bg-white/[0.03]">
                    <div>
                      <div className="font-semibold">{p.name}</div>
                      <div className="text-xs text-muted">
                        {p.summary.itemCount} cards{p.language ? ` · ${p.language === "jap" ? "Japanese" : "English"}` : ""}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">
                        <Money amount={p.summary.value} currency={c} />
                      </div>
                      <div className="text-xs">
                        <Delta amount={p.summary.cost > 0 ? p.summary.gain : null} pct={p.summary.gainPct} currency={c} />
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
