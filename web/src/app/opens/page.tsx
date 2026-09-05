"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button, Empty, Money, Skeleton, inputCls, Field } from "@/components/ui";

const PRODUCT_TYPES = [
  { value: "booster_box", label: "Booster Box" },
  { value: "etb", label: "Elite Trainer Box" },
  { value: "bundle", label: "Bundle" },
  { value: "tin", label: "Tin" },
  { value: "booster_pack", label: "Booster Pack" },
  { value: "collection_box", label: "Collection Box" },
  { value: "other", label: "Other" },
];

interface OpenSummary {
  id: number;
  name: string;
  productType: string;
  setName: string | null;
  cost: number;
  totalValue: number;
  profit: number;
  roi: number;
  cardCount: number;
  openedAt: string;
}

export default function OpensPage() {
  const [opens, setOpens] = useState<OpenSummary[] | null>(null);
  const [currency, setCurrency] = useState("USD");
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("booster_box");
  const [newCost, setNewCost] = useState("");
  const [newCurrency, setNewCurrency] = useState("CAD");
  const [busy, setBusy] = useState(false);

  const load = () =>
    fetch("/api/opens")
      .then((r) => r.json())
      .then((d) => {
        setOpens(d.opens);
        setCurrency(d.currency);
      })
      .catch(() => undefined);

  useEffect(() => { load(); }, []);

  async function create() {
    if (!newName.trim() || !newCost) return;
    setBusy(true);
    await fetch("/api/opens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), productType: newType, cost: Number(newCost), costCurrency: newCurrency }),
    });
    setBusy(false);
    setShowNew(false);
    setNewName("");
    setNewCost("");
    load();
  }

  if (!opens) return <div className="pt-4 space-y-3"><Skeleton className="h-28" /><Skeleton className="h-28" /></div>;

  const totals = opens.reduce((acc, o) => ({ cost: acc.cost + o.cost, value: acc.value + o.totalValue }), { cost: 0, value: 0 });

  return (
    <div className="pb-24">
      <header className="pt-2 pb-3 flex items-baseline justify-between">
        <h1 className="text-xl font-bold">Box Opens</h1>
        <Button className="text-xs !py-1.5 !px-3" onClick={() => setShowNew(!showNew)}>
          {showNew ? "Cancel" : "+ New open"}
        </Button>
      </header>

      {showNew && (
        <div className="card-surface rounded-3xl p-4 mb-4">
          <div className="text-xs text-muted mb-3">Log a new sealed product opening</div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Product name">
              <input className={inputCls} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Surging Sparks BB" />
            </Field>
            <Field label="Type">
              <select className={inputCls} value={newType} onChange={(e) => setNewType(e.target.value)}>
                {PRODUCT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </Field>
            <Field label="Cost paid">
              <input className={inputCls} type="number" min={0} step="0.01" inputMode="decimal" value={newCost} onChange={(e) => setNewCost(e.target.value)} placeholder="180.00" />
            </Field>
            <Field label="Currency">
              <select className={inputCls} value={newCurrency} onChange={(e) => setNewCurrency(e.target.value)}>
                <option>CAD</option>
                <option>USD</option>
                <option>EUR</option>
                <option>GBP</option>
                <option>JPY</option>
              </select>
            </Field>
          </div>
          <Button className="w-full mt-3" onClick={create} disabled={busy || !newName.trim() || !newCost}>
            {busy ? "Creating..." : "Create"}
          </Button>
        </div>
      )}

      {opens.length > 0 && (
        <div className="card-surface rounded-3xl p-4 mb-4">
          <div className="text-xs text-muted">All opens</div>
          <div className="grid grid-cols-3 gap-2 mt-2 text-center">
            <div className="rounded-2xl bg-white/[0.03] border border-line py-2">
              <div className="text-[10px] text-muted uppercase tracking-wider">Total cost</div>
              <div className="text-sm font-semibold"><Money amount={totals.cost} currency={currency} /></div>
            </div>
            <div className="rounded-2xl bg-white/[0.03] border border-line py-2">
              <div className="text-[10px] text-muted uppercase tracking-wider">Pull value</div>
              <div className="text-sm font-semibold"><Money amount={totals.value} currency={currency} /></div>
            </div>
            <div className="rounded-2xl bg-white/[0.03] border border-line py-2">
              <div className="text-[10px] text-muted uppercase tracking-wider">Profit</div>
              <div className={`text-sm font-semibold ${totals.value - totals.cost >= 0 ? "text-up" : "text-down"}`}>
                {totals.value - totals.cost >= 0 ? "+" : ""}<Money amount={totals.value - totals.cost} currency={currency} />
              </div>
            </div>
          </div>
        </div>
      )}

      {opens.length === 0 ? (
        <Empty>
          No box opens yet. Tap "+ New open" to log your first sealed product opening and track your pulls.
        </Empty>
      ) : (
        <ul className="space-y-3">
          {opens.map((o) => (
            <li key={o.id}>
              <Link href={`/opens/${o.id}`} className="card-surface rounded-2xl p-4 flex items-center gap-4 hover:bg-white/[0.03] block">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{o.name}</div>
                  <div className="text-xs text-muted">
                    {PRODUCT_TYPES.find((t) => t.value === o.productType)?.label ?? o.productType} · {o.cardCount} cards · {new Date(o.openedAt).toLocaleDateString()}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-sm">
                    <Money amount={o.totalValue} currency={currency} /> / <span className="text-muted"><Money amount={o.cost} currency={currency} /></span>
                  </div>
                  <div className={`text-sm font-semibold ${o.profit >= 0 ? "text-up" : "text-down"}`}>
                    {o.profit >= 0 ? "+" : ""}<Money amount={o.profit} currency={currency} />
                    <span className="text-xs ml-1">({o.roi >= 0 ? "+" : ""}{o.roi.toFixed(0)}%)</span>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
