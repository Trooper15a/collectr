"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PriceChart } from "@/components/PriceChart";
import { Button, CardImage, Delta, Empty, Field, Money, Segmented, Skeleton, TcgBadge, inputCls } from "@/components/ui";
import { RANGES, type Range, langLabel } from "@/lib/format";
import { CONDITIONS, type NormalizedCard, variantLabel } from "@/lib/types";

interface Item {
  id: number;
  card: NormalizedCard;
  quantity: number;
  variantType: string;
  condition: string;
  isGraded: boolean;
  gradingCompany: string | null;
  grade: string | null;
  certNumber: string | null;
  costBasis: number | null;
  costCurrency: string;
  notes: string | null;
  addedAt: string;
  unitPrice: { amount: number; currency: string; variant: string } | null;
  value: number;
  cost: number | null;
  gain: number | null;
  gainPct: number | null;
  change24hPct: number | null;
}
interface Data {
  portfolio: { id: number; name: string; tcgId: string | null; language: string | null };
  items: Item[];
  summary: { value: number; cost: number; gain: number; gainPct: number | null; itemCount: number; change24h: number; change24hPct: number | null };
  series: { date: string; value: number }[];
  currency: string;
}

type Sort = "value" | "name" | "set" | "gain" | "added" | "lang";

export default function PortfolioPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [range, setRange] = useState<Range>("1M");
  const [data, setData] = useState<Data | null>(null);
  const [sort, setSort] = useState<Sort>("value");
  const [langFilter, setLangFilter] = useState<"all" | "eng" | "jap">("all");
  const [editing, setEditing] = useState<Item | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`/api/portfolios/${id}?range=${range}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? "Failed");
        return r.json();
      })
      .then((d: Data) => {
        setData(d);
        setName(d.portfolio.name);
      })
      .catch((e) => setError(e.message));
  }, [id, range]);
  useEffect(load, [load]);

  const items = useMemo(() => {
    if (!data) return [];
    const list = data.items.filter((i) => langFilter === "all" || i.card.language === langFilter);
    const cmp: Record<Sort, (a: Item, b: Item) => number> = {
      value: (a, b) => b.value - a.value,
      name: (a, b) => a.card.name.localeCompare(b.card.name),
      set: (a, b) => (a.card.setName ?? "").localeCompare(b.card.setName ?? "") || (a.card.cardNumber ?? "").localeCompare(b.card.cardNumber ?? "", undefined, { numeric: true }),
      gain: (a, b) => (b.gain ?? -Infinity) - (a.gain ?? -Infinity),
      added: (a, b) => b.addedAt.localeCompare(a.addedAt),
      lang: (a, b) => a.card.language.localeCompare(b.card.language),
    };
    return list.sort(cmp[sort]);
  }, [data, sort, langFilter]);

  async function rename() {
    await fetch(`/api/portfolios/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    setRenaming(false);
    load();
  }
  async function remove() {
    if (!confirm(`Delete "${data?.portfolio.name}" and all its cards?`)) return;
    await fetch(`/api/portfolios/${id}`, { method: "DELETE" });
    router.push("/portfolios");
  }

  if (error) return <Empty>{error}</Empty>;
  if (!data)
    return (
      <div className="space-y-3 pt-4">
        <Skeleton className="h-40" />
        <Skeleton className="h-16" />
      </div>
    );
  const c = data.currency;
  const s = data.summary;

  return (
    <div>
      <header className="pt-2 pb-3 flex items-center gap-3">
        <Link href="/portfolios" className="text-muted text-sm">
          ‹ Back
        </Link>
        {renaming ? (
          <div className="flex-1 flex gap-2">
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            <Button className="px-3" onClick={rename}>
              Save
            </Button>
          </div>
        ) : (
          <h1 className="text-xl font-bold flex-1 truncate" onClick={() => setRenaming(true)}>
            {data.portfolio.name}
          </h1>
        )}
        <button onClick={remove} className="text-xs text-down">
          Delete
        </button>
      </header>

      <div className="card-surface rounded-3xl p-5">
        <div className="text-xs text-muted">Value</div>
        <div className="text-3xl font-bold tabular mt-1">
          <Money amount={s.value} currency={c} />
        </div>
        <div className="text-sm mt-1 flex flex-wrap gap-x-4">
          <span>
            <span className="text-muted">24h </span>
            <Delta amount={s.change24h} pct={s.change24hPct} currency={c} />
          </span>
          <span>
            <span className="text-muted">Gain </span>
            <Delta amount={s.cost > 0 ? s.gain : null} pct={s.gainPct} currency={c} />
          </span>
          <span className="text-muted">{s.itemCount} cards</span>
        </div>
        <div className="mt-2 -mx-2">
          <PriceChart data={data.series} currency={c} height={120} />
        </div>
        <div className="mt-2 flex justify-center">
          <Segmented value={range} onChange={setRange} size="xs" options={RANGES.map((r) => ({ value: r, label: r }))} />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 justify-between">
        <select className="rounded-full bg-elev border border-line px-3 py-1 text-xs" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
          <option value="value">Sort: Value</option>
          <option value="gain">Sort: Gain/Loss</option>
          <option value="name">Sort: Name</option>
          <option value="set">Sort: Set</option>
          <option value="added">Sort: Date added</option>
          <option value="lang">Sort: Language</option>
        </select>
        <Segmented
          value={langFilter}
          onChange={setLangFilter}
          size="xs"
          options={[
            { value: "all", label: "All" },
            { value: "eng", label: "EN" },
            { value: "jap", label: "JP" },
          ]}
        />
      </div>

      {items.length === 0 ? (
        <div className="mt-4">
          <Empty>
            No cards here yet.{" "}
            <Link href="/scan" className="text-accent font-semibold">
              Scan or search
            </Link>{" "}
            to add some.
          </Empty>
        </div>
      ) : (
        <ul className="mt-3 card-surface rounded-2xl divide-y divide-line overflow-hidden">
          {items.map((i) => (
            <li key={i.id} className="flex items-center gap-3 p-3">
              <Link href={`/cards/${encodeURIComponent(i.card.id)}`}>
                <CardImage id={i.card.id} className="w-12 rounded-md" alt="" />
              </Link>
              <div className="flex-1 min-w-0" onClick={() => setEditing(i)}>
                <div className="font-medium truncate">{i.card.name}</div>
                <div className="text-xs text-muted truncate">
                  {i.card.setName} {i.card.cardNumber && `#${i.card.cardNumber}`} · {variantLabel(i.variantType)} · {i.isGraded ? `${i.gradingCompany} ${i.grade}` : i.condition} · ×{i.quantity}
                </div>
                <TcgBadge tcg={i.card.tcg} lang={i.card.language} />
              </div>
              <div className="text-right" onClick={() => setEditing(i)}>
                <div className="font-semibold">
                  <Money amount={i.value} currency={c} />
                </div>
                <div className="text-xs">
                  <Delta amount={i.gain} pct={i.gainPct} currency={c} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <EditItemSheet
          item={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function EditItemSheet({ item, onClose, onSaved }: { item: Item; onClose: () => void; onSaved: () => void }) {
  const { id: currentPortfolioId } = useParams<{ id: string }>();
  const [quantity, setQuantity] = useState(item.quantity);
  const [condition, setCondition] = useState(item.condition);
  const [graded, setGraded] = useState(item.isGraded);
  const [company, setCompany] = useState(item.gradingCompany ?? "PSA");
  const [grade, setGrade] = useState(item.grade ?? "10");
  const [cert, setCert] = useState(item.certNumber ?? "");
  const [cost, setCost] = useState(item.costBasis?.toString() ?? "");
  const [costCurrency, setCostCurrency] = useState(item.costCurrency);
  const [notes, setNotes] = useState(item.notes ?? "");
  const [variant, setVariant] = useState(item.variantType);
  const [busy, setBusy] = useState(false);
  const [allPortfolios, setAllPortfolios] = useState<{ id: number; name: string }[]>([]);
  const [transferTo, setTransferTo] = useState<number | null>(null);
  const [transferMsg, setTransferMsg] = useState<string | null>(null);
  const variants = [...new Set([...Object.keys(item.card.prices.tcgplayer?.variants ?? {}), ...Object.keys(item.card.prices.cardmarket?.variants ?? {}), item.variantType])];

  useEffect(() => {
    fetch("/api/portfolios").then((r) => r.json()).then((d) => {
      const list = (d.portfolios ?? []).map((p: { id: number; name: string }) => ({ id: p.id, name: p.name })).filter((p: { id: number }) => p.id !== Number(currentPortfolioId));
      setAllPortfolios(list);
      if (list.length) setTransferTo(list[0].id);
    }).catch(() => undefined);
  }, [currentPortfolioId]);

  async function save() {
    setBusy(true);
    await fetch(`/api/items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
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
    setBusy(false);
    onSaved();
  }
  async function remove() {
    if (!confirm("Remove this card from the portfolio?")) return;
    await fetch(`/api/items/${item.id}`, { method: "DELETE" });
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button className="absolute inset-0 bg-black/60" onClick={onClose} aria-label="Close" />
      <div className="relative glass w-full max-w-lg rounded-t-3xl p-5 pb-[max(env(safe-area-inset-bottom),20px)] max-h-[88vh] overflow-y-auto">
        <div className="font-semibold text-lg">{item.card.name}</div>
        <div className="text-xs text-muted mb-3">
          {item.card.setName} · {langLabel(item.card.language)}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantity">
            <input className={inputCls} type="number" min={1} value={quantity} onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))} />
          </Field>
          <Field label="Variant">
            <select className={inputCls} value={variant} onChange={(e) => setVariant(e.target.value)}>
              {variants.map((v) => (
                <option key={v} value={v}>
                  {variantLabel(v)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Condition">
            <select className={inputCls} value={condition} onChange={(e) => setCondition(e.target.value)} disabled={graded}>
              {CONDITIONS.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <label className="flex items-end gap-2 text-sm pb-2">
            <input type="checkbox" checked={graded} onChange={(e) => setGraded(e.target.checked)} className="accent-accent w-4 h-4" /> Graded
          </label>
          {graded && (
            <>
              <Field label="Company">
                <input className={inputCls} value={company} onChange={(e) => setCompany(e.target.value)} />
              </Field>
              <Field label="Grade">
                <input className={inputCls} value={grade} onChange={(e) => setGrade(e.target.value)} />
              </Field>
              <div className="col-span-2">
                <Field label="Cert number">
                  <input className={inputCls} value={cert} onChange={(e) => setCert(e.target.value)} />
                </Field>
              </div>
            </>
          )}
          <Field label="Cost basis (per card)">
            <input className={inputCls} type="number" step="0.01" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} />
          </Field>
          <Field label="Currency">
            <select className={inputCls} value={costCurrency} onChange={(e) => setCostCurrency(e.target.value)}>
              {["USD", "EUR", "GBP", "CAD", "JPY", "AUD"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <div className="col-span-2">
            <Field label="Notes">
              <input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </div>
        </div>
        {allPortfolios.length > 0 && (
          <div className="mt-4 pt-3 border-t border-line">
            <div className="text-xs text-muted mb-2">Transfer to another portfolio</div>
            <div className="flex gap-2">
              <select className={`${inputCls} flex-1`} value={transferTo ?? ""} onChange={(e) => setTransferTo(Number(e.target.value))}>
                {allPortfolios.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <Button variant="ghost" disabled={!transferTo || busy} onClick={async () => {
                if (!transferTo) return;
                setBusy(true);
                setTransferMsg(null);
                const r = await fetch(`/api/items/${item.id}/transfer`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ toPortfolioId: transferTo }) });
                const d = await r.json();
                setBusy(false);
                if (r.ok) {
                  setTransferMsg(`Moved to ${d.movedTo}`);
                  setTimeout(onSaved, 600);
                } else {
                  setTransferMsg(d.error ?? "Transfer failed");
                }
              }}>Transfer</Button>
            </div>
            {transferMsg && <div className="text-xs text-muted mt-1">{transferMsg}</div>}
          </div>
        )}
        <div className="mt-4 flex gap-2">
          <Button variant="danger" onClick={remove}>
            Remove
          </Button>
          <Button variant="ghost" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={save} disabled={busy}>
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
