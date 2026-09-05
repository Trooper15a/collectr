"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Field, Section, Skeleton, inputCls } from "@/components/ui";
import { CURRENCIES } from "@/lib/types";

interface Settings {
  currency: string;
  theme: "dark" | "light";
  language: string;
  bulkCondition: string;
  bulkCurrency: string;
  bulkPortfolio: string;
  pokewalletConfigured: boolean;
  pokewalletBudget: { hour: number; day: number };
  fxDate: string;
}

export default function SettingsPage() {
  const [s, setS] = useState<Settings | null>(null);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then(setS);
  }, []);

  async function patch(p: Partial<Settings>) {
    const r = await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p) });
    const d = await r.json();
    setS(d);
    if (p.theme) {
      document.documentElement.setAttribute("data-theme", p.theme);
      try {
        localStorage.setItem("theme", p.theme);
      } catch {}
    }
  }

  async function refreshNow() {
    setBusy(true);
    setRefreshMsg(null);
    try {
      const r = await fetch("/api/prices/refresh", { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setRefreshMsg(`Refreshed ${d.refreshed} cards (${d.failed} failed, ${d.skipped} skipped for rate limit). PokéWallet budget: ${d.pokewalletBudget.hour}/hr, ${d.pokewalletBudget.day}/day left.`);
    } catch (e) {
      setRefreshMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  if (!s)
    return (
      <div className="pt-4 space-y-3">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
    );

  return (
    <div>
      <header className="pt-2 pb-3">
        <h1 className="text-xl font-bold">Settings</h1>
      </header>

      <Section title="Display">
        <div className="card-surface rounded-2xl p-4 grid grid-cols-2 gap-3">
          <Field label="Display currency">
            <select className={inputCls} value={s.currency} onChange={(e) => patch({ currency: e.target.value })}>
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Theme">
            <select className={inputCls} value={s.theme} onChange={(e) => patch({ theme: e.target.value as "dark" | "light" })}>
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </Field>
          <div className="col-span-2 text-xs text-muted">FX rates from the European Central Bank as of {s.fxDate}. Japanese cards (CardMarket EUR) convert at this rate.</div>
        </div>
      </Section>

      <Section title="Bulk scan defaults">
        <div className="card-surface rounded-2xl p-4 grid grid-cols-3 gap-3">
          <Field label="Condition">
            <select className={inputCls} value={s.bulkCondition} onChange={(e) => patch({ bulkCondition: e.target.value } as Partial<Settings>)}>
              <option value="NM">Near Mint</option>
              <option value="LP">Lightly Played</option>
              <option value="MP">Moderately Played</option>
              <option value="HP">Heavily Played</option>
              <option value="DMG">Damaged</option>
            </select>
          </Field>
          <Field label="Currency">
            <select className={inputCls} value={s.bulkCurrency} onChange={(e) => patch({ bulkCurrency: e.target.value } as Partial<Settings>)}>
              {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Portfolio">
            <input className={inputCls} value={s.bulkPortfolio} onChange={(e) => patch({ bulkPortfolio: e.target.value } as Partial<Settings>)} />
          </Field>
          <div className="col-span-3 text-xs text-muted">Used when you tap "Add All" in bulk scan mode. Quantity defaults to 1.</div>
        </div>
      </Section>

      <Section title="Data sources">
        <div className="card-surface rounded-2xl p-4 text-sm space-y-2">
          <div className="flex justify-between">
            <span>PokéWallet API key</span>
            <span className={s.pokewalletConfigured ? "text-up" : "text-down"}>{s.pokewalletConfigured ? "Configured" : "Missing"}</span>
          </div>
          <div className="flex justify-between text-muted">
            <span>Requests left</span>
            <span className="tabular">
              {s.pokewalletBudget.hour}/hr · {s.pokewalletBudget.day}/day
            </span>
          </div>
          {!s.pokewalletConfigured && <div className="text-xs text-muted">Add POKEWALLET_API_KEY to web/.env.local and restart the server to enable Pokémon search and images.</div>}
          <div className="flex justify-between text-muted">
            <span>Scryfall (Magic) · YGOProDeck (Yu-Gi-Oh!)</span>
            <span className="text-up">Free, no key</span>
          </div>
        </div>
      </Section>

      <Section title="Prices">
        <div className="card-surface rounded-2xl p-4 space-y-3">
          <div className="text-sm text-muted">Owned cards refresh automatically every night at 03:30. Run it now if you just added cards.</div>
          <Button variant="ghost" onClick={refreshNow} disabled={busy}>
            {busy ? "Refreshing…" : "Refresh prices now"}
          </Button>
          {refreshMsg && <div className="text-xs text-muted">{refreshMsg}</div>}
        </div>
      </Section>

      <Section title="TCGPlayer price database">
        <TcgcsvPanel />
      </Section>

      <Section title="Import from CSV">
        <ImportPanel />
      </Section>

      <Section title="Export">
        <div className="card-surface rounded-2xl p-4 space-y-3">
          <div className="text-sm text-muted">Download your whole collection as CSV: name, set, language, condition, grade, cost basis, current value (USD + EUR), gain/loss, date added.</div>
          <a href={`/api/export?currency=${s.currency}`} className="inline-flex items-center justify-center rounded-xl bg-elev border border-line px-4 py-2.5 text-sm font-semibold">
            Download CSV
          </a>
        </div>
      </Section>

      <Section title="Scanner">
        <UpdateIndexPanel />
      </Section>
    </div>
  );
}


interface TcgcsvStatus {
  running: boolean;
  progress?: { category: number; group: number; of: number };
  last?: { products: number; priced: number; historyRows: number; groups: number; errors: string[]; finishedAt: string; categories: number[] };
}

function TcgcsvPanel() {
  const [status, setStatus] = useState<TcgcsvStatus | null>(null);
  const [cats, setCats] = useState<{ id: number; label: string }[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  const load = () =>
    fetch("/api/tcgcsv")
      .then((r) => r.json())
      .then((d) => {
        setStatus(d.status);
        setCats(d.categories);
        setSelected((cur) => (cur.length ? cur : d.defaults));
      })
      .catch(() => undefined);

  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    if (!status?.running) return;
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [status?.running]);

  async function start() {
    setMsg(null);
    const r = await fetch("/api/tcgcsv", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ categories: selected }) });
    const d = await r.json();
    if (!r.ok) setMsg(d.error ?? "Failed");
    load();
  }

  const last = status?.last;
  return (
    <div className="card-surface rounded-2xl p-4 space-y-3 text-sm">
      <div className="text-muted">
        Daily TCGPlayer prices for every card and sealed product, from tcgcsv.com (free, no key). Imported automatically every night; run it now for the first time.
      </div>
      <div className="flex flex-wrap gap-1.5">
        {cats.map((c) => {
          const on = selected.includes(c.id);
          return (
            <button key={c.id} onClick={() => setSelected(on ? selected.filter((x) => x !== c.id) : [...selected, c.id])} className={`rounded-full px-2.5 py-1 text-xs border ${on ? "bg-accent text-black border-accent" : "border-line text-muted"}`}>
              {c.label}
            </button>
          );
        })}
      </div>
      <Button variant="ghost" onClick={start} disabled={!status || status.running || selected.length === 0}>
        {status?.running ? `Importing… category ${status.progress?.category} set ${status.progress?.group}/${status.progress?.of}` : "Import prices now"}
      </Button>
      {msg && <div className="text-xs text-down">{msg}</div>}
      {last && !status?.running && (
        <div className="text-xs text-muted">
          Last import {new Date(last.finishedAt).toLocaleString()}: {last.products.toLocaleString()} products in {last.groups} sets, {last.priced.toLocaleString()} priced, {last.historyRows.toLocaleString()} history points
          {last.errors.length > 0 && `, ${last.errors.length} errors`}.
        </div>
      )}
    </div>
  );
}


interface ImportRowView {
  line: number;
  name: string;
  number: string | null;
  set: string | null;
  quantity: number;
  status: "matched" | "ambiguous" | "unmatched" | "error";
  error?: string;
  match: { id: string; name: string; setName: string | null; cardNumber: string | null; language: string; price: number | null; currency: string | null } | null;
}

function ImportPanel() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ImportRowView[] | null>(null);
  const [summary, setSummary] = useState<{ total: number; matched: number; ambiguous: number; unmatched: number; errors: number } | null>(null);
  const [portfolio, setPortfolio] = useState("Imported");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function preview(file: File) {
    setBusy(true);
    setMsg(null);
    setRows(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/import", { method: "POST", body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Import failed");
      setRows(d.rows);
      setSummary(d.summary);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }
  async function commit() {
    if (!rows) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/import", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows: rows.filter((x) => x.match), defaultPortfolio: portfolio }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Import failed");
      setMsg(`Added ${d.added} cards. ${d.skipped.length ? `Skipped lines: ${d.skipped.join(", ")}` : ""}`);
      setRows(null);
      setSummary(null);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card-surface rounded-2xl p-4 space-y-3 text-sm">
      <div className="text-muted">
        Bulk-load a spreadsheet. Columns are matched by name: <span className="font-mono text-fg">name</span> (required), <span className="font-mono text-fg">number</span>, <span className="font-mono text-fg">set</span>,{" "}
        <span className="font-mono text-fg">language</span> (EN/JP), <span className="font-mono text-fg">quantity</span>, <span className="font-mono text-fg">condition</span>, <span className="font-mono text-fg">cost</span>,{" "}
        <span className="font-mono text-fg">currency</span>, <span className="font-mono text-fg">portfolio</span>, <span className="font-mono text-fg">notes</span>. The app&apos;s own CSV export re-imports as-is.
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <input ref={fileRef} type="file" accept=".csv,text/csv,.tsv,.txt" className="hidden" onChange={(e) => e.target.files?.[0] && preview(e.target.files[0])} />
        <Button variant="ghost" onClick={() => fileRef.current?.click()} disabled={busy}>
          {busy && !rows ? "Reading…" : "Choose CSV file"}
        </Button>
        {rows && (
          <>
            <input className={`${inputCls} w-44`} value={portfolio} onChange={(e) => setPortfolio(e.target.value)} placeholder="Default portfolio" />
            <Button onClick={commit} disabled={busy || !summary || summary.matched + summary.ambiguous === 0}>
              Import {summary ? summary.matched + summary.ambiguous : 0} cards
            </Button>
          </>
        )}
      </div>
      {summary && (
        <div className="text-xs text-muted">
          {summary.total} rows: <span className="text-up">{summary.matched} matched</span>, {summary.ambiguous} ambiguous (best guess used), <span className="text-down">{summary.unmatched} unmatched</span>
          {summary.errors > 0 && `, ${summary.errors} errors`}. Unmatched rows are skipped; add a number or set column to improve matching.
        </div>
      )}
      {rows && (
        <div className="max-h-72 overflow-auto rounded-xl border border-line">
          <table className="w-full text-xs">
            <thead className="text-muted text-left sticky top-0 bg-elev">
              <tr>
                <th className="p-2">Line</th>
                <th className="p-2">Your row</th>
                <th className="p-2">Matched card</th>
                <th className="p-2 text-right">Qty</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.line} className={`border-t border-line ${r.status === "unmatched" || r.status === "error" ? "text-down" : r.status === "ambiguous" ? "text-accent" : ""}`}>
                  <td className="p-2 tabular">{r.line}</td>
                  <td className="p-2">
                    {r.name} {r.number && `#${r.number}`} {r.set && `· ${r.set}`}
                    {r.error && ` (${r.error})`}
                  </td>
                  <td className="p-2">{r.match ? `${r.match.name} · ${r.match.setName ?? ""} #${r.match.cardNumber ?? ""} (${r.match.language.toUpperCase()})` : "—"}</td>
                  <td className="p-2 text-right tabular">{r.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {msg && <div className="text-xs">{msg}</div>}
    </div>
  );
}


function UpdateIndexPanel() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; output: string; finishedAt: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/update-index").then((r) => r.json()).then((d) => {
      setRunning(d.running);
      if (d.lastResult) setResult(d.lastResult);
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      fetch("/api/update-index").then((r) => r.json()).then((d) => {
        setRunning(d.running);
        if (d.lastResult) setResult(d.lastResult);
      }).catch(() => undefined);
    }, 3000);
    return () => clearInterval(t);
  }, [running]);

  async function start() {
    setMsg(null);
    setResult(null);
    const r = await fetch("/api/update-index", { method: "POST" });
    const d = await r.json();
    if (!r.ok) { setMsg(d.error ?? "Failed"); return; }
    setRunning(true);
  }

  return (
    <div className="card-surface rounded-2xl p-4 space-y-3 text-sm">
      <div className="text-muted">
        The card recognition model runs on-device (~20 MB, cached). Check for new card sets from PokéWallet, download images, compute embeddings with the existing model, and update the scanner index — no retraining needed.
      </div>
      <Button variant="ghost" onClick={start} disabled={running}>
        {running ? "Updating… (this may take a few minutes)" : "Check for new cards"}
      </Button>
      {msg && <div className="text-xs text-down">{msg}</div>}
      {result && (
        <div className={`text-xs ${result.ok ? "text-muted" : "text-down"}`}>
          <div>{result.ok ? "Update completed successfully" : "Update failed"} — {new Date(result.finishedAt).toLocaleString()}</div>
          <pre className="mt-1 whitespace-pre-wrap font-mono text-[11px] bg-elev rounded-lg p-2 max-h-40 overflow-auto">{result.output}</pre>
        </div>
      )}
    </div>
  );
}
