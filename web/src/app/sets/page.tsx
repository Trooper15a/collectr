"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { SetLogo } from "@/components/SetLogo";
import { Empty, Segmented, Skeleton, inputCls } from "@/components/ui";
import { langLabel } from "@/lib/format";

interface SetRow {
  id: string;
  tcg: string;
  code: string;
  name: string;
  language: string;
  total: number | null;
  releaseDate: string | null;
}

export default function SetsPage() {
  const [sets, setSets] = useState<SetRow[] | null>(null);
  const [owned, setOwned] = useState<Record<string, number>>({});
  const [tcg, setTcg] = useState<"all" | "pokemon" | "mtg" | "yugioh">("pokemon");
  const [lang, setLang] = useState<"all" | "eng" | "jap">("all");
  const [q, setQ] = useState("");
  const [onlyOwned, setOnlyOwned] = useState(false);

  useEffect(() => {
    fetch(`/api/sets?tcg=${tcg}&lang=${lang}`)
      .then((r) => r.json())
      .then((d) => {
        setSets(d.sets ?? []);
        setOwned(d.owned ?? {});
      })
      .catch(() => setSets([]));
  }, [tcg, lang]);

  const list = useMemo(() => {
    if (!sets) return [];
    const ql = q.trim().toLowerCase();
    return sets.filter((s) => (!ql || s.name.toLowerCase().includes(ql) || s.code.toLowerCase().includes(ql)) && (!onlyOwned || owned[s.id]));
  }, [sets, q, onlyOwned, owned]);

  return (
    <div>
      <header className="pt-2 pb-3">
        <h1 className="text-xl font-bold">Sets</h1>
      </header>
      <input className={inputCls} placeholder="Filter sets…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="mt-3 flex flex-wrap gap-2 items-center">
        <Segmented
          value={tcg}
          onChange={(v) => {
            setSets(null);
            setTcg(v);
          }}
          size="xs"
          options={[
            { value: "pokemon", label: "Pokémon" },
            { value: "mtg", label: "Magic" },
            { value: "yugioh", label: "Yu-Gi-Oh!" },
            { value: "all", label: "All" },
          ]}
        />
        <Segmented
          value={lang}
          onChange={(v) => {
            setSets(null);
            setLang(v);
          }}
          size="xs"
          options={[
            { value: "all", label: "EN + JP" },
            { value: "eng", label: "EN" },
            { value: "jap", label: "JP" },
          ]}
        />
        <label className="flex items-center gap-1.5 text-xs text-muted">
          <input type="checkbox" checked={onlyOwned} onChange={(e) => setOnlyOwned(e.target.checked)} className="accent-accent" /> Owned only
        </label>
      </div>

      {!sets && (
        <div className="mt-4 space-y-2">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      )}
      {sets && list.length === 0 && (
        <div className="mt-4">
          <Empty>No sets here yet. Run the TCGPlayer price import in Settings to load them.</Empty>
        </div>
      )}
      {sets && list.length > 0 && (
        <ul className="mt-4 card-surface rounded-2xl divide-y divide-line overflow-hidden">
          {list.map((s) => (
            <li key={s.id}>
              <Link href={`/sets/${encodeURIComponent(s.id)}`} className="flex items-center gap-3 p-3 hover:bg-white/[0.03]">
                <SetLogo id={s.id} code={s.code} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{s.name}</div>
                  <div className="text-xs text-muted">
                    {s.code.toUpperCase()} · {langLabel(s.language)} {s.releaseDate && `· ${s.releaseDate.slice(0, 7)}`}
                  </div>
                </div>
                <div className="text-right text-xs">
                  {owned[s.id] ? <span className="text-up font-semibold">{owned[s.id]} owned</span> : <span className="text-muted">{s.total ?? "—"} cards</span>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
