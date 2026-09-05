"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AddToPortfolioSheet, type AddSheetCard } from "@/components/AddToPortfolioSheet";
import { Scanner } from "@/components/Scanner";
import { Button, CardImage, Empty, Money, Segmented, Skeleton, TcgBadge, inputCls } from "@/components/ui";
import { isScanIndexId, type Match } from "@/lib/scanner/matcher";
import type { CardSummary } from "@/lib/types";

type TcgFilter = "all" | "pokemon" | "mtg" | "yugioh";
type LangFilter = "all" | "eng" | "jap";
type SearchSort = "relevance" | "price-desc" | "price-asc" | "name";

export default function ScanPage() {
  const [q, setQ] = useState("");
  const [tcg, setTcg] = useState<TcgFilter>("all");
  const [lang, setLang] = useState<LangFilter>("all");
  const [results, setResults] = useState<CardSummary[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkQueue, setBulkQueue] = useState<AddSheetCard[]>(() => {
    try { const s = localStorage.getItem("bulkQueue"); return s ? JSON.parse(s) : []; } catch { return []; }
  });
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [adding, setAdding] = useState<AddSheetCard | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [searchSort, setSearchSort] = useState<SearchSort>("relevance");
  const [bulkAdding, setBulkAdding] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0);
  const [portfolios, setPortfolios] = useState<{ id: number; name: string }[]>([]);
  const [bulkPortfolioId, setBulkPortfolioId] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/portfolios").then((r) => r.json()).then((d) => {
      const list = (d.portfolios ?? []).map((p: { id: number; name: string }) => ({ id: p.id, name: p.name }));
      setPortfolios(list);
      if (list.length) setBulkPortfolioId(list[0].id);
    }).catch(() => undefined);
  }, []);
  useEffect(() => {
    try { localStorage.setItem("bulkQueue", JSON.stringify(bulkQueue)); } catch {}
  }, [bulkQueue]);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!q.trim()) return;
    timer.current = setTimeout(async () => {
      abort.current?.abort();
      const ac = new AbortController();
      abort.current = ac;
      setLoading(true);
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}&tcg=${tcg}&lang=${lang}`, { signal: ac.signal });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Search failed");
        setResults(d.cards);
        setWarnings(d.warnings ?? []);
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          setResults([]);
          setWarnings([(e as Error).message]);
        }
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    }, 350);
  }, [q, tcg, lang]);

  const sortedResults = useMemo(() => {
    if (!results) return null;
    if (searchSort === "relevance") return results;
    const sorted = [...results];
    if (searchSort === "price-desc") sorted.sort((a, b) => ((b.display?.amount ?? b.price?.amount ?? 0) - (a.display?.amount ?? a.price?.amount ?? 0)));
    else if (searchSort === "price-asc") sorted.sort((a, b) => ((a.display?.amount ?? a.price?.amount ?? 0) - (b.display?.amount ?? b.price?.amount ?? 0)));
    else if (searchSort === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
    return sorted;
  }, [results, searchSort]);

  async function resolveMatch(m: Match): Promise<AddSheetCard | null> {
    const url = isScanIndexId(m.card.id) ? `/api/resolve?id=${encodeURIComponent(m.card.id)}` : `/api/cards/${encodeURIComponent(m.card.id)}`;
    const r = await fetch(url);
    const d = r.ok ? await r.json() : null;
    if (d?.card) return { id: d.card.id, name: d.card.name, setName: d.card.setName, prices: d.card.prices };
    return null;
  }

  async function chooseMatch(m: Match) {
    setMatches(null);
    if (!bulkMode) setScanning(false);
    const card = await resolveMatch(m);
    if (card) {
      if (bulkMode) {
        setBulkQueue((prev) => [...prev, card]);
        setScanning(true);
      } else {
        setAdding(card);
      }
    } else {
      setResolveError(`No priced listing found for ${m.card.name ?? m.card.id}. Try searching by name.`);
      setQ(m.card.name ?? "");
    }
  }

  return (
    <div>
      <header className="pt-2 pb-3">
        <h1 className="text-xl font-bold">Scan / Search</h1>
      </header>

      <div className="flex gap-2">
        <input
          className={inputCls}
          placeholder="Card name, number, or set code…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            if (!e.target.value.trim()) {
              abort.current?.abort();
              setResults(null);
              setLoading(false);
            }
          }}
          autoCapitalize="off"
          autoCorrect="off"
          enterKeyHint="search"
        />
        <Button onClick={() => setScanning(true)} aria-label="Open camera scanner" className="px-3">
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" />
            <rect x="8" y="7" width="8" height="10" rx="1" />
          </svg>
        </Button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Segmented
          value={tcg}
          onChange={setTcg}
          size="xs"
          options={[
            { value: "all", label: "All" },
            { value: "pokemon", label: "Pokémon" },
            { value: "mtg", label: "Magic" },
            { value: "yugioh", label: "Yu-Gi-Oh!" },
          ]}
        />
        <Segmented
          value={lang}
          onChange={setLang}
          size="xs"
          options={[
            { value: "all", label: "EN + JP" },
            { value: "eng", label: "English" },
            { value: "jap", label: "Japanese" },
          ]}
        />
      </div>

      {resolveError && (
        <div className="mt-3 text-xs text-down flex justify-between gap-2">
          <span>{resolveError}</span>
          <button onClick={() => setResolveError(null)}>✕</button>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="mt-3 text-xs text-muted space-y-1">
          {warnings.map((w) => (
            <div key={w}>⚠ {w}</div>
          ))}
        </div>
      )}

      <div className="mt-4">
        {!q.trim() && (
          <div className="card-surface rounded-3xl p-6 text-center">
            <div className="flex justify-center gap-4">
              <button onClick={() => setScanning(true)} className="w-20 h-20 rounded-full bg-accent text-black flex items-center justify-center shadow-[0_0_40px_rgba(250,204,21,0.35)] active:scale-95 transition">
                <svg viewBox="0 0 24 24" className="w-9 h-9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" />
                  <rect x="8" y="7" width="8" height="10" rx="1" />
                </svg>
              </button>
              <button onClick={() => { setBulkMode(true); setScanning(true); }} className="w-20 h-20 rounded-full bg-elev border-2 border-accent text-accent flex flex-col items-center justify-center active:scale-95 transition">
                <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" />
                  <rect x="8" y="7" width="8" height="10" rx="1" />
                </svg>
                <span className="text-[9px] font-bold mt-0.5">BULK</span>
              </button>
            </div>
            <div className="mt-4 font-semibold">Point your camera at a card</div>
            <div className="text-sm text-muted mt-1">English and Japanese cards. Or type a name above to search.</div>
          </div>
        )}
        {loading && results === null && (
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[63/88]" />
            ))}
          </div>
        )}
        {sortedResults && sortedResults.length === 0 && !loading && <Empty>No cards found for "{q}".</Empty>}
        {sortedResults && sortedResults.length > 0 && (
          <>
          <div className="flex items-center justify-between mb-3">
            <Segmented value={searchSort} onChange={setSearchSort} size="xs" options={[
              { value: "relevance", label: "Best" },
              { value: "price-desc", label: "$↓" },
              { value: "price-asc", label: "$↑" },
              { value: "name", label: "A-Z" },
            ]} />
            <span className="text-xs text-muted">{sortedResults.length} results</span>
          </div>
          <div className={`grid grid-cols-2 sm:grid-cols-3 gap-3 ${loading ? "opacity-60" : ""}`}>
            {sortedResults.map((c) => (
              <div key={c.id} className="card-surface rounded-2xl overflow-hidden flex flex-col">
                <Link href={`/cards/${encodeURIComponent(c.id)}`}>
                  <CardImage id={c.id} className="w-full" alt={c.name} />
                </Link>
                <div className="p-2.5 flex-1 flex flex-col gap-1">
                  <div className="font-medium text-sm leading-tight line-clamp-2">{c.name}</div>
                  <div className="text-[11px] text-muted truncate">
                    {c.setName} {c.cardNumber && `#${c.cardNumber}`}
                  </div>
                  <TcgBadge tcg={c.tcg} lang={c.language} />
                  <div className="mt-auto flex items-center justify-between pt-1">
                    <span className="text-sm leading-tight">
                      {c.price ? (
                        <>
                          <span className="font-semibold">
                            <Money amount={c.display?.amount ?? c.price.amount} currency={c.display?.currency ?? c.price.currency} />
                          </span>
                          {c.display && c.display.currency !== c.price.currency && (
                            <span className="block text-[10px] text-muted">
                              <Money amount={c.price.amount} currency={c.price.currency} />
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </span>
                    <button onClick={() => setAdding({ id: c.id, name: c.name, setName: c.setName, prices: c.prices })} className="text-xs font-semibold text-accent px-2 py-1 rounded-lg bg-accent/10">
                      + Add
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          </>
        )}
      </div>

      {scanning && !matches && <Scanner onClose={() => { setScanning(false); setBulkMode(false); }} onMatches={(m) => setMatches(m)} bulkMode={bulkMode} bulkCount={bulkQueue.length} />}
      {matches && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <button className="absolute inset-0 bg-black/70" onClick={() => setMatches(null)} aria-label="Close" />
          <div className="relative glass w-full max-w-lg rounded-t-3xl p-5 pb-[max(env(safe-area-inset-bottom),20px)]">
            <div className="text-xs text-muted mb-3">Is it one of these? Tap to add.</div>
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
            <Button variant="ghost" className="w-full mt-3" onClick={() => setMatches(null)}>
              Scan again
            </Button>
          </div>
        </div>
      )}
      {bulkQueue.length > 0 && !scanning && (
        <div className="card-surface rounded-3xl p-4 mt-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Scanned cards ({bulkQueue.length})</h3>
            <div className="flex gap-2">
              <Button variant="ghost" className="text-xs !py-1.5 !px-3" onClick={() => setBulkQueue([])}>Clear</Button>
              <Button className="text-xs !py-1.5 !px-3" onClick={() => { setAdding(bulkQueue[0]); }}>Add next</Button>
            </div>
          </div>
          <div className="flex gap-2 mb-3">
            <select className={`${inputCls} flex-1`} value={bulkPortfolioId ?? ""} onChange={(e) => setBulkPortfolioId(Number(e.target.value))}>
              {portfolios.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <Button
              disabled={bulkAdding || !bulkPortfolioId}
              onClick={async () => {
                if (!bulkPortfolioId) return;
                setBulkAdding(true);
                setBulkProgress(0);
                try {
                  const settingsRes = await fetch("/api/settings");
                  const settings = await settingsRes.json();
                  const condition = settings.bulkCondition ?? "NM";
                  const costCurrency = settings.bulkCurrency ?? "CAD";

                  for (let i = 0; i < bulkQueue.length; i++) {
                    const card = bulkQueue[i];
                    await fetch(`/api/portfolios/${bulkPortfolioId}/items`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ cardId: card.id, quantity: 1, variantType: "normal", condition, costCurrency }),
                    });
                    setBulkProgress(i + 1);
                  }
                  setBulkQueue([]);
                } catch {} finally {
                  setBulkAdding(false);
                }
              }}
            >
              {bulkAdding ? `${bulkProgress}/${bulkQueue.length}` : `Add all (${bulkQueue.length})`}
            </Button>
          </div>
          <ul className="divide-y divide-line">
            {bulkQueue.map((c, i) => (
              <li key={`${c.id}-${i}`} className="flex items-center gap-3 py-2">
                <Link href={`/cards/${encodeURIComponent(c.id)}`}>
                  <CardImage id={c.id} className="w-10 rounded-md" alt="" />
                </Link>
                <Link href={`/cards/${encodeURIComponent(c.id)}`} className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{c.name}</div>
                  <div className="text-xs text-muted truncate">{c.setName}</div>
                </Link>
                <button onClick={() => setBulkQueue((prev) => prev.filter((_, j) => j !== i))} className="text-xs text-muted px-2">✕</button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <AddToPortfolioSheet card={adding} onClose={() => setAdding(null)} onAdded={() => {
        setAdding(null);
        if (bulkQueue.length > 0) {
          const rest = bulkQueue.filter((c) => c.id !== adding?.id);
          setBulkQueue(rest);
          if (rest.length > 0) setTimeout(() => setAdding(rest[0]), 300);
        }
      }} />
    </div>
  );
}
