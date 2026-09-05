"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Scanner } from "@/components/Scanner";
import { Button, CardImage, Empty, Money, Skeleton, inputCls } from "@/components/ui";
import { isScanIndexId, type Match } from "@/lib/scanner/matcher";

interface OpenDetail {
  id: number;
  name: string;
  productType: string;
  setName: string | null;
  cost: number;
  totalValue: number;
  profit: number;
  roi: number;
  openedAt: string;
}

interface PullItem {
  id: number;
  cardId: string;
  name: string;
  setName: string | null;
  cardNumber: string | null;
  rarity: string | null;
  variantType: string;
  quantity: number;
  value: number;
}

export default function OpenDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<{ open: OpenDetail; items: PullItem[]; currency: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<{ id: string; name: string; setName: string | null; cardNumber: string | null }[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/opens/${id}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? "Failed");
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message));
  }, [id]);

  useEffect(load, [load]);

  async function addCard(cardId: string) {
    await fetch(`/api/opens/${id}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId }),
    });
    load();
  }

  async function removeItem(itemId: number) {
    await fetch(`/api/opens/${id}/items?itemId=${itemId}`, { method: "DELETE" });
    load();
  }

  async function resolveMatch(m: Match) {
    const url = isScanIndexId(m.card.id) ? `/api/resolve?id=${encodeURIComponent(m.card.id)}` : `/api/cards/${encodeURIComponent(m.card.id)}`;
    const r = await fetch(url);
    const d = r.ok ? await r.json() : null;
    return d?.card?.id ?? null;
  }

  async function chooseMatch(m: Match) {
    setMatches(null);
    const cardId = await resolveMatch(m);
    if (cardId) {
      await addCard(cardId);
    } else {
      setResolveError(`No listing found for ${m.card.name ?? m.card.id}`);
    }
  }

  async function searchCards() {
    if (!searchQ.trim()) return;
    setSearchLoading(true);
    try {
      const r = await fetch(`/api/search?q=${encodeURIComponent(searchQ.trim())}`);
      const d = await r.json();
      setSearchResults(d.cards?.slice(0, 10) ?? []);
    } catch {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }

  if (error) return <Empty>{error}</Empty>;
  if (!data) return <div className="pt-4 space-y-3"><Skeleton className="h-28" /><Skeleton className="h-40" /></div>;

  const { open: o, items, currency: c } = data;
  const sorted = [...items].sort((a, b) => b.value - a.value);

  return (
    <div className="pb-24">
      <header className="pt-2 pb-3 flex items-center gap-3">
        <Link href="/opens" className="text-muted text-sm">&#8249; Opens</Link>
      </header>

      <div className="card-surface rounded-3xl p-4">
        <h1 className="text-lg font-bold">{o.name}</h1>
        <div className="text-xs text-muted">{new Date(o.openedAt).toLocaleDateString()}</div>
        <div className="grid grid-cols-3 gap-2 mt-3 text-center">
          <div className="rounded-2xl bg-white/[0.03] border border-line py-2">
            <div className="text-[10px] text-muted uppercase tracking-wider">Cost</div>
            <div className="text-sm font-semibold"><Money amount={o.cost} currency={c} /></div>
          </div>
          <div className="rounded-2xl bg-white/[0.03] border border-line py-2">
            <div className="text-[10px] text-muted uppercase tracking-wider">Pull value</div>
            <div className="text-sm font-semibold"><Money amount={o.totalValue} currency={c} /></div>
          </div>
          <div className="rounded-2xl bg-white/[0.03] border border-line py-2">
            <div className="text-[10px] text-muted uppercase tracking-wider">Profit</div>
            <div className={`text-sm font-semibold ${o.profit >= 0 ? "text-up" : "text-down"}`}>
              {o.profit >= 0 ? "+" : ""}<Money amount={o.profit} currency={c} />
            </div>
          </div>
        </div>
        {o.totalValue > 0 && (
          <div className="mt-2 h-2 rounded-full bg-white/[0.06] overflow-hidden">
            <div className={`h-full ${o.profit >= 0 ? "bg-up" : "bg-down"}`} style={{ width: `${Math.min(100, (o.totalValue / o.cost) * 100)}%` }} />
          </div>
        )}
        <div className="text-xs text-muted text-center mt-1">
          {o.roi >= 0 ? "+" : ""}{o.roi.toFixed(1)}% ROI · {items.reduce((s, i) => s + i.quantity, 0)} cards pulled
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <Button onClick={() => setScanning(true)} className="flex-1">
          Scan a pull
        </Button>
      </div>

      <div className="mt-3 flex gap-2">
        <input
          className={inputCls}
          placeholder="Or search by name..."
          value={searchQ}
          onChange={(e) => setSearchQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && searchCards()}
          enterKeyHint="search"
        />
        <Button variant="ghost" onClick={searchCards} disabled={searchLoading || !searchQ.trim()}>Search</Button>
      </div>

      {resolveError && (
        <div className="mt-2 text-xs text-down flex justify-between">
          <span>{resolveError}</span>
          <button onClick={() => setResolveError(null)}>X</button>
        </div>
      )}

      {searchResults && searchResults.length > 0 && (
        <ul className="card-surface rounded-2xl divide-y divide-line overflow-hidden mt-3">
          {searchResults.map((sr) => (
            <li key={sr.id} className="flex items-center gap-3 p-2.5">
              <CardImage id={sr.id} className="w-8 rounded" alt="" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{sr.name}</div>
                <div className="text-[10px] text-muted truncate">{sr.setName} {sr.cardNumber && `#${sr.cardNumber}`}</div>
              </div>
              <button onClick={() => { addCard(sr.id); setSearchResults(null); setSearchQ(""); }} className="text-xs font-semibold text-accent px-2 py-1 rounded-lg bg-accent/10">
                + Add
              </button>
            </li>
          ))}
        </ul>
      )}

      {items.length > 0 && (
        <section className="mt-5">
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">Pulls ({items.reduce((s, i) => s + i.quantity, 0)} cards)</h2>
          <ul className="card-surface rounded-2xl divide-y divide-line overflow-hidden">
            {sorted.map((item) => (
              <li key={item.id} className="flex items-center gap-3 p-3">
                <Link href={`/cards/${encodeURIComponent(item.cardId)}`}>
                  <CardImage id={item.cardId} className="w-10 rounded-md" alt="" />
                </Link>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{item.name}</div>
                  <div className="text-[10px] text-muted truncate">
                    {item.setName} {item.cardNumber && `#${item.cardNumber}`}
                    {item.rarity && ` · ${item.rarity}`}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-sm font-semibold"><Money amount={item.value} currency={c} /></div>
                  {item.quantity > 1 && <div className="text-[10px] text-muted">x{item.quantity}</div>}
                </div>
                <button onClick={() => removeItem(item.id)} className="text-xs text-muted px-1">X</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {scanning && !matches && (
        <Scanner onClose={() => setScanning(false)} onMatches={(m) => setMatches(m)} />
      )}
      {matches && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <button className="absolute inset-0 bg-black/70" onClick={() => setMatches(null)} aria-label="Close" />
          <div className="relative glass w-full max-w-lg rounded-t-3xl p-5 pb-[max(env(safe-area-inset-bottom),20px)]">
            <div className="text-xs text-muted mb-3">Which card did you pull?</div>
            <ul className="divide-y divide-line">
              {matches.map((m, i) => (
                <li key={m.card.id}>
                  <button onClick={() => chooseMatch(m)} className="w-full flex items-center gap-3 py-2.5 text-left">
                    <CardImage id={m.card.id} className="w-12 rounded-md" alt="" />
                    <div className="flex-1 min-w-0">
                      <div className={`font-medium truncate ${i === 0 ? "text-up" : ""}`}>{m.card.name}</div>
                      <div className="text-xs text-muted truncate">
                        {m.card.setName ?? m.card.set} #{m.card.num} · {m.card.lang?.toUpperCase()}
                      </div>
                    </div>
                    <div className="text-xs tabular text-muted">{(m.score * 100).toFixed(0)}%</div>
                  </button>
                </li>
              ))}
            </ul>
            <Button variant="ghost" className="w-full mt-3" onClick={() => { setMatches(null); setScanning(true); }}>
              Scan again
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
