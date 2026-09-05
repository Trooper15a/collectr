"use client";

import { useEffect, useState } from "react";
import { fmtMoney } from "@/lib/format";
import { bestPrice, CONDITION_LABELS, CONDITIONS, CURRENCIES, GRADING_COMPANIES, type CardPrices, variantLabel } from "@/lib/types";
import { convert, type Rates } from "@/lib/fx";
import { Button, CardImage, Field, inputCls } from "./ui";

interface PortfolioLite {
  id: number;
  name: string;
}

export interface AddSheetCard {
  id: string;
  name: string;
  setName?: string | null;
  prices?: CardPrices;
}

export function AddToPortfolioSheet(props: { card: AddSheetCard | null; onClose: () => void; onAdded?: () => void }) {
  // Keyed on the card id so every open starts with fresh form state.
  if (!props.card) return null;
  return <Sheet key={props.card.id} {...props} card={props.card} />;
}

function Sheet({ card, onClose, onAdded }: { card: AddSheetCard; onClose: () => void; onAdded?: () => void }) {
  const [portfolios, setPortfolios] = useState<PortfolioLite[]>([]);
  const [portfolioId, setPortfolioId] = useState<number | "new">("new");
  const [newName, setNewName] = useState("My Collection");
  const [quantity, setQuantity] = useState(1);
  const [variant, setVariant] = useState(() => bestPrice(card.prices)?.variant ?? "normal");
  const [condition, setCondition] = useState<(typeof CONDITIONS)[number]>("NM");
  const [graded, setGraded] = useState(false);
  const [company, setCompany] = useState<string>("PSA");
  const [grade, setGrade] = useState("10");
  const [cert, setCert] = useState("");
  const [cost, setCost] = useState("");
  const [costCurrency, setCostCurrency] = useState<string>("USD");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const [fx, setFx] = useState<{ rates: Rates; currency: string } | null>(null);
  const variants = card?.prices ? [...new Set([...Object.keys(card.prices.tcgplayer?.variants ?? {}), ...Object.keys(card.prices.cardmarket?.variants ?? {})])] : [];

  useEffect(() => {
    let cancelled = false;
    fetch("/api/portfolios")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const list: PortfolioLite[] = (d.portfolios ?? []).map((p: PortfolioLite) => ({ id: p.id, name: p.name }));
        setPortfolios(list);
        if (list.length) setPortfolioId(list[0].id);
      })
      .catch(() => undefined);
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const cur = d.currency ?? "USD";
        setCostCurrency(cur);
        fetch(`/api/cards/${encodeURIComponent(card.id)}`)
          .then((r) => r.json())
          .then((d2) => { if (!cancelled && d2.fx) setFx({ rates: d2.fx, currency: d2.displayCurrency ?? cur }); })
          .catch(() => undefined);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [card.id]);

  const unit = bestPrice(card.prices, variant);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      let pid = portfolioId;
      if (pid === "new") {
        const r = await fetch("/api/portfolios", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newName || "My Collection" }) });
        if (!r.ok) throw new Error((await r.json()).error ?? "Could not create portfolio");
        pid = (await r.json()).id as number;
      }
      const r = await fetch(`/api/portfolios/${pid}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardId: card.id,
          quantity,
          variantType: variant,
          condition,
          isGraded: graded,
          gradingCompany: graded ? company : null,
          grade: graded ? grade : null,
          certNumber: graded ? cert || null : null,
          costBasis: cost === "" ? null : Number(cost),
          costCurrency,
          notes: notes || null,
        }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Could not add card");
      setDone(true);
      onAdded?.();
      setTimeout(onClose, 700);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal>
      <button className="absolute inset-0 bg-black/60" onClick={onClose} aria-label="Close" />
      <div className="relative glass w-full max-w-lg rounded-t-3xl p-5 pb-[max(env(safe-area-inset-bottom),20px)] max-h-[88vh] overflow-y-auto">
        <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-4" />
        <div className="mb-4 flex items-start gap-3">
          <CardImage id={card.id} className="w-20 rounded-lg flex-shrink-0" alt="" />
          <div className="min-w-0">
            <div className="text-xs text-muted">Add to portfolio</div>
            <div className="font-semibold text-lg leading-tight">{card.name}</div>
            <div className="text-xs text-muted">{card.setName}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Portfolio">
            <select className={inputCls} value={String(portfolioId)} onChange={(e) => setPortfolioId(e.target.value === "new" ? "new" : Number(e.target.value))}>
              {portfolios.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
              <option value="new">+ New portfolio…</option>
            </select>
          </Field>
          {portfolioId === "new" ? (
            <Field label="New portfolio name">
              <input className={inputCls} value={newName} onChange={(e) => setNewName(e.target.value)} />
            </Field>
          ) : (
            <Field label="Quantity">
              <input className={inputCls} type="number" min={1} value={quantity} onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))} />
            </Field>
          )}
          {portfolioId === "new" && (
            <Field label="Quantity">
              <input className={inputCls} type="number" min={1} value={quantity} onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))} />
            </Field>
          )}
          <Field label="Variant">
            <select className={inputCls} value={variant} onChange={(e) => setVariant(e.target.value)}>
              {(variants.length ? variants : ["normal"]).map((v) => (
                <option key={v} value={v}>
                  {variantLabel(v)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Condition">
            <select className={inputCls} value={condition} onChange={(e) => setCondition(e.target.value as (typeof CONDITIONS)[number])} disabled={graded}>
              {CONDITIONS.map((c) => (
                <option key={c} value={c}>
                  {CONDITION_LABELS[c]}
                </option>
              ))}
            </select>
          </Field>
          <label className="col-span-2 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={graded} onChange={(e) => setGraded(e.target.checked)} className="accent-accent w-4 h-4" />
            Graded card
          </label>
          {graded && (
            <>
              <Field label="Company">
                <select className={inputCls} value={company} onChange={(e) => setCompany(e.target.value)}>
                  {GRADING_COMPANIES.map((g) => (
                    <option key={g}>{g}</option>
                  ))}
                </select>
              </Field>
              <Field label="Grade">
                <input className={inputCls} value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="10, 9.5…" />
              </Field>
              <Field label="Cert number">
                <input className={inputCls} value={cert} onChange={(e) => setCert(e.target.value)} />
              </Field>
            </>
          )}
          <Field label="Cost basis (per card)">
            <input className={inputCls} type="number" min={0} step="0.01" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="What you paid" />
          </Field>
          <Field label="Cost currency">
            <select className={inputCls} value={costCurrency} onChange={(e) => setCostCurrency(e.target.value)}>
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Notes">
            <input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>

        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-muted">Current market</span>
          <span className="tabular font-semibold">
            {unit
              ? fx
                ? `${fmtMoney(convert(unit.amount, unit.currency, costCurrency, fx.rates), costCurrency)} × ${quantity}`
                : `${fmtMoney(unit.amount, unit.currency)} × ${quantity}`
              : "No price yet"}
          </span>
        </div>
        {error && <div className="mt-2 text-sm text-down">{error}</div>}
        <div className="mt-4 flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={submit} disabled={busy || done}>
            {done ? "Added ✓" : busy ? "Adding…" : "Add card"}
          </Button>
        </div>
      </div>
    </div>
  );
}
