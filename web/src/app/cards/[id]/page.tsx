"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AddToPortfolioSheet } from "@/components/AddToPortfolioSheet";
import { PriceChart } from "@/components/PriceChart";
import { Button, CardImage, Empty, Money, Section, Segmented, Skeleton, TcgBadge } from "@/components/ui";
import { RANGES, type Range, fmtMoney, rangeToDays } from "@/lib/format";
import { convert, type Rates } from "@/lib/fx";
import { type MarketPrices, type NormalizedCard, variantLabel } from "@/lib/types";

interface HistoryPoint {
  date: string;
  tcgplayerMarket: number | null;
  cardmarketAvg: number | null;
}

const GRADE_MULT: Record<string, number> = { "PSA 10": 3.0, "PSA 9": 1.4, "PSA 8": 1.0, "BGS 10": 4.5, "BGS 9.5": 2.5, "BGS 9": 1.3, "CGC 10": 2.8, "CGC 9.5": 1.6 };

export default function CardPage() {
  const { id } = useParams<{ id: string }>();
  const [card, setCard] = useState<NormalizedCard | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<Range>("3M");
  const [market, setMarket] = useState<"tcgplayer" | "cardmarket">("tcgplayer");
  const [mode, setMode] = useState<"raw" | "graded">("raw");
  const [zoom, setZoom] = useState(false);
  const [adding, setAdding] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [now] = useState(() => Date.now());
  const [fx, setFx] = useState<{ rates: Rates; currency: string } | null>(null);
  const [alert, setAlert] = useState<{ id: number; thresholdPct: number } | null | undefined>(undefined);
  const [alertOpen, setAlertOpen] = useState(false);
  const [threshold, setThreshold] = useState("10");

  const loadAlert = () =>
    fetch("/api/alerts")
      .then((r) => r.json())
      .then((d) => {
        const mine = (d.alerts ?? []).find((a: { card: { id: string } }) => a.card.id === id);
        setAlert(mine ? { id: mine.id, thresholdPct: mine.thresholdPct } : null);
        if (mine) setThreshold(String(mine.thresholdPct));
      })
      .catch(() => setAlert(null));
  async function saveAlert() {
    await fetch("/api/alerts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cardId: id, thresholdPct: Number(threshold) || 10 }) });
    setAlertOpen(false);
    loadAlert();
  }
  async function removeAlert() {
    if (alert) await fetch(`/api/alerts/${alert.id}`, { method: "DELETE" });
    setAlertOpen(false);
    loadAlert();
  }

  const load = (refresh = false) =>
    fetch(`/api/cards/${encodeURIComponent(id)}${refresh ? "?refresh=1" : ""}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? "Failed");
        return r.json();
      })
      .then((d) => {
        setCard(d.card);
        setHistory(d.history ?? []);
        if (d.fx && d.displayCurrency) setFx({ rates: d.fx, currency: d.displayCurrency });
        if (!d.card.prices.tcgplayer && d.card.prices.cardmarket) setMarket("cardmarket");
      })
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
    loadAlert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const series = useMemo(() => {
    const days = rangeToDays(range);
    const cutoff = days ? new Date(now - days * 86400000).toISOString().slice(0, 10) : "";
    const native = market === "tcgplayer" ? "USD" : "EUR";
    return history.filter((h) => h.date >= cutoff).map((h) => {
      const v = market === "tcgplayer" ? h.tcgplayerMarket : h.cardmarketAvg;
      return { date: h.date, value: v != null && fx ? convert(v, native, fx.currency, fx.rates) : v };
    });
  }, [history, range, market, now, fx]);

  if (error) return <Empty>{error}</Empty>;
  if (!card)
    return (
      <div className="pt-4 space-y-3">
        <Skeleton className="aspect-[63/88] w-2/3 mx-auto" />
        <Skeleton className="h-24" />
      </div>
    );

  const tp = card.prices.tcgplayer;
  const cm = card.prices.cardmarket;
  const active = market === "tcgplayer" ? tp : cm;
  const currency = active?.currency ?? "USD";
  const headline = active ? firstMarket(active) : null;
  const meta = (card.meta ?? {}) as Record<string, unknown>;
  const displayCurrency = fx?.currency ?? currency;
  const toDisplay = (amount: number) => (fx ? convert(amount, currency, fx.currency, fx.rates) : amount);

  return (
    <div>
      <header className="pt-2 pb-3 flex items-center gap-3">
        <Link href="/scan" className="text-muted text-sm">
          ‹ Back
        </Link>
        <div className="flex-1" />
        <button onClick={() => setAlertOpen(true)} className={`text-xs mr-3 ${alert ? "text-accent" : "text-muted"}`} aria-label="Price alert">
          {alert ? `🔔 ±${alert.thresholdPct}%` : "🔕 Alert"}
        </button>
        <button
          onClick={async () => {
            setRefreshing(true);
            await load(true);
            setRefreshing(false);
          }}
          className="text-xs text-muted"
        >
          {refreshing ? "Refreshing…" : "Refresh price"}
        </button>
      </header>

      <button onClick={() => setZoom(true)} className="block w-[68%] mx-auto rounded-2xl overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.6)]">
        <CardImage id={card.id} size="high" className="w-full" alt={card.name} />
      </button>

      <div className="mt-4">
        <TcgBadge tcg={card.tcg} lang={card.language} />
        <h1 className="text-2xl font-bold leading-tight mt-1">{card.name}</h1>
        <div className="text-sm text-muted">
          {card.setName} {card.setCode && `(${card.setCode.toUpperCase()})`} {card.cardNumber && `· #${card.cardNumber}`} {card.rarity && `· ${card.rarity}`}
        </div>
      </div>

      <div className="card-surface rounded-3xl p-4 mt-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <Segmented
            value={market}
            onChange={setMarket}
            size="xs"
            options={[
              { value: "tcgplayer", label: `TCGPlayer${tp ? "" : " (n/a)"}` },
              { value: "cardmarket", label: `CardMarket${cm ? "" : " (n/a)"}` },
            ]}
          />
          <Segmented
            value={mode}
            onChange={setMode}
            size="xs"
            options={[
              { value: "raw", label: "Raw" },
              { value: "graded", label: "Graded" },
            ]}
          />
        </div>
        <div className="mt-3 text-3xl font-bold tabular">{headline ? <Money amount={toDisplay(headline.amount)} currency={displayCurrency} /> : <span className="text-muted text-lg">No {market} pricing for this card</span>}</div>
        {headline && (
          <div className="text-xs text-muted">
            {variantLabel(headline.variant)} · market
            {displayCurrency !== currency && (
              <>
                {" "}
                · <Money amount={headline.amount} currency={currency} /> on {market === "tcgplayer" ? "TCGPlayer" : "CardMarket"}
              </>
            )}
          </div>
        )}
        <div className="mt-2 -mx-2">
          <PriceChart data={series} currency={displayCurrency} height={160} />
        </div>
        <div className="mt-2 flex justify-center">
          <Segmented value={range} onChange={setRange} size="xs" options={RANGES.map((r) => ({ value: r, label: r }))} />
        </div>

        {mode === "raw" && active && (
          <table className="w-full text-sm mt-4">
            <thead className="text-[10px] uppercase tracking-wider text-muted">
              <tr>
                <th className="text-left font-medium py-1">Variant</th>
                {market === "tcgplayer" ? (
                  <>
                    <th className="text-right font-medium">Low</th>
                    <th className="text-right font-medium">Mid</th>
                    <th className="text-right font-medium">Market</th>
                    <th className="text-right font-medium">High</th>
                  </>
                ) : (
                  <>
                    <th className="text-right font-medium">Low</th>
                    <th className="text-right font-medium">Trend</th>
                    <th className="text-right font-medium">Avg</th>
                    <th className="text-right font-medium">7d / 30d</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="tabular">
              {Object.entries(active.variants).map(([k, v]) => (
                <tr key={k} className="border-t border-line">
                  <td className="py-1.5">{variantLabel(k)}</td>
                  {market === "tcgplayer" ? (
                    <>
                      <td className="text-right text-muted">{fmtMoney(v.low, currency)}</td>
                      <td className="text-right text-muted">{fmtMoney(v.mid, currency)}</td>
                      <td className="text-right font-semibold">{fmtMoney(v.market, currency)}</td>
                      <td className="text-right text-muted">{fmtMoney(v.high, currency)}</td>
                    </>
                  ) : (
                    <>
                      <td className="text-right text-muted">{fmtMoney(v.low, currency)}</td>
                      <td className="text-right font-semibold">{fmtMoney(v.trend ?? v.market, currency)}</td>
                      <td className="text-right text-muted">{fmtMoney(v.market ?? v.avg1, currency)}</td>
                      <td className="text-right text-muted">
                        {fmtMoney(v.avg7, currency)} / {fmtMoney(v.avg30, currency)}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {mode === "graded" && (
          <div className="mt-4">
            <div className="text-xs text-muted mb-2">Estimated graded values (multiplier of raw market).</div>
            <div className="grid grid-cols-2 gap-2 text-sm tabular">
              {Object.entries(GRADE_MULT).map(([g, m]) => (
                <div key={g} className="flex justify-between rounded-xl bg-white/[0.03] border border-line px-3 py-2">
                  <span className="text-muted">{g}</span>
                  <span className="font-semibold">{headline ? fmtMoney(toDisplay(headline.amount * m), displayCurrency) : "—"}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {active?.url && (
          <a href={active.url} target="_blank" rel="noreferrer" className="block mt-3 text-xs text-accent">
            View on {market === "tcgplayer" ? "TCGPlayer" : "CardMarket"} ↗
          </a>
        )}
      </div>

      <Section title="Details">
        <dl className="card-surface rounded-2xl p-4 grid grid-cols-2 gap-y-2 text-sm">
          <Row k="TCG" v={card.tcg} />
          <Row k="Language" v={card.language.toUpperCase()} />
          <Row k="Set" v={card.setName} />
          <Row k="Number" v={card.cardNumber} />
          <Row k="Rarity" v={card.rarity} />
          <Row k="Released" v={card.releaseDate} />
          {"hp" in meta && meta.hp != null && <Row k="HP" v={String(meta.hp)} />}
          {"types" in meta && meta.types != null && <Row k="Type" v={Array.isArray(meta.types) ? meta.types.join(", ") : String(meta.types)} />}
          {"typeLine" in meta && meta.typeLine != null && <Row k="Type" v={String(meta.typeLine)} />}
          {"artist" in meta && meta.artist != null && <Row k="Artist" v={String(meta.artist)} />}
          {"atk" in meta && meta.atk != null && <Row k="ATK / DEF" v={`${meta.atk} / ${meta.def ?? "—"}`} />}
        </dl>
      </Section>

      <Section title="Sold listings">
        <div className="card-surface rounded-2xl p-4 space-y-2 text-sm">
          <a href={ebaySoldUrl(card, false)} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-xl bg-white/[0.03] border border-line px-3 py-2.5 hover:bg-white/[0.06]">
            <span>eBay sold listings (raw)</span>
            <span className="text-accent">↗</span>
          </a>
          <a href={ebaySoldUrl(card, true)} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-xl bg-white/[0.03] border border-line px-3 py-2.5 hover:bg-white/[0.06]">
            <span>eBay sold listings (PSA graded)</span>
            <span className="text-accent">↗</span>
          </a>
          {"tcgplayerUrl" in meta && typeof meta.tcgplayerUrl === "string" && (
            <a href={meta.tcgplayerUrl} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-xl bg-white/[0.03] border border-line px-3 py-2.5 hover:bg-white/[0.06]">
              <span>TCGPlayer listings</span>
              <span className="text-accent">↗</span>
            </a>
          )}
          <div className="text-xs text-muted">Opens eBay pre-filtered to sold and completed items, newest first. POP reports are still to come.</div>
        </div>
      </Section>

      <div className="fixed bottom-[92px] inset-x-0 px-4 pointer-events-none">
        <div className="max-w-3xl mx-auto flex justify-end">
          <Button className="pointer-events-auto shadow-[0_10px_30px_rgba(250,204,21,0.35)]" onClick={() => setAdding(true)}>
            + Add to portfolio
          </Button>
        </div>
      </div>

      {alertOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <button className="absolute inset-0 bg-black/60" onClick={() => setAlertOpen(false)} aria-label="Close" />
          <div className="relative glass w-full max-w-lg rounded-t-3xl p-5 pb-[max(env(safe-area-inset-bottom),20px)]">
            <div className="font-semibold text-lg">Price alert</div>
            <div className="text-xs text-muted mb-3">Show a badge on the dashboard when this card moves more than this much from its price today.</div>
            <label className="block text-xs text-muted mb-1">Threshold (%)</label>
            <input type="number" min={1} step={1} inputMode="numeric" value={threshold} onChange={(e) => setThreshold(e.target.value)} className="w-full rounded-xl bg-elev border border-line px-3 py-2.5 text-sm outline-none focus:border-accent/60" />
            <div className="mt-4 flex gap-2">
              {alert && (
                <Button variant="danger" onClick={removeAlert}>
                  Remove
                </Button>
              )}
              <Button variant="ghost" className="flex-1" onClick={() => setAlertOpen(false)}>
                Cancel
              </Button>
              <Button className="flex-1" onClick={saveAlert}>
                Save alert
              </Button>
            </div>
          </div>
        </div>
      )}
      {zoom && (
        <button className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4" onClick={() => setZoom(false)}>
          <CardImage id={card.id} size="high" className="max-h-full w-auto rounded-2xl" alt={card.name} />
        </button>
      )}
      <AddToPortfolioSheet card={adding ? { id: card.id, name: card.name, setName: card.setName, prices: card.prices } : null} onClose={() => setAdding(false)} />
    </div>
  );
}

/** eBay search pre-filtered to sold + completed listings, most recent first. */
function ebaySoldUrl(card: NormalizedCard, graded: boolean) {
  const num = (card.cardNumber ?? "").split("/")[0].replace(/^0+(?=\d)/, "");
  const name = card.name.replace(/\s+-\s+\d+\/\d+$/, ""); // TCGPlayer names carry " - 007/165"
  const terms = [name, num, card.language === "jap" ? "japanese" : "", graded ? "PSA" : "", card.tcg === "pokemon" ? "pokemon" : ""].filter(Boolean).join(" ");
  const u = new URL("https://www.ebay.com/sch/i.html");
  u.searchParams.set("_nkw", terms);
  u.searchParams.set("LH_Sold", "1");
  u.searchParams.set("LH_Complete", "1");
  u.searchParams.set("_sop", "13"); // end date: recent first
  return u.toString();
}

function Row({ k, v }: { k: string; v: string | null | undefined }) {
  if (!v) return null;
  return (
    <>
      <dt className="text-muted">{k}</dt>
      <dd className="text-right">{v}</dd>
    </>
  );
}

function firstMarket(m: MarketPrices) {
  for (const [variant, v] of Object.entries(m.variants)) {
    const amount = v.market ?? v.trend ?? v.avg7 ?? v.mid ?? v.low;
    if (amount != null) return { amount, variant };
  }
  return null;
}
