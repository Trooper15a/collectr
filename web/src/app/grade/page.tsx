"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { Button, CardImage, Empty, Money, Skeleton, inputCls, Section } from "@/components/ui";

interface CardResult {
  id: string;
  name: string;
  setName: string | null;
  cardNumber: string | null;
  rarity: string | null;
  price: { amount: number; currency: string } | null;
}

interface CenteringResult {
  leftRight: [number, number];
  topBottom: [number, number];
  score: number;
  psaCentering: string;
}

interface GradeBreakdown {
  centering: number;
  surface: number;
  edges: number;
  corners: number;
  overall: number;
  psaGrade: number;
  cgcGrade: number;
  label: string;
}

const PSA_GRADES = [
  { grade: 10, label: "Gem Mint", mult: 3.0 },
  { grade: 9, label: "Mint", mult: 1.4 },
  { grade: 8, label: "NM-MT", mult: 1.0 },
  { grade: 7, label: "NM", mult: 0.85 },
  { grade: 6, label: "EX-MT", mult: 0.6 },
  { grade: 5, label: "EX", mult: 0.45 },
];

const CGC_GRADES = [
  { grade: 10, label: "Pristine", mult: 4.0 },
  { grade: 9.5, label: "Gem Mint", mult: 2.0 },
  { grade: 9, label: "Mint", mult: 1.3 },
  { grade: 8.5, label: "NM/Mint+", mult: 1.0 },
  { grade: 8, label: "NM/Mint", mult: 0.9 },
];

function calcGrade(centering: number, surface: number, edges: number, corners: number): GradeBreakdown {
  const overall = centering * 0.1 + surface * 0.3 + edges * 0.3 + corners * 0.3;
  const psaGrade = overall >= 9.5 ? 10 : overall >= 8.5 ? 9 : overall >= 7.5 ? 8 : overall >= 6.5 ? 7 : overall >= 5.5 ? 6 : 5;
  const cgcGrade = overall >= 9.7 ? 10 : overall >= 9.2 ? 9.5 : overall >= 8.5 ? 9 : overall >= 7.8 ? 8.5 : overall >= 7 ? 8 : 7.5;
  const labels: Record<number, string> = { 10: "Gem Mint", 9: "Mint", 8: "NM-MT", 7: "NM", 6: "EX-MT", 5: "EX" };
  return { centering, surface, edges, corners, overall, psaGrade, cgcGrade, label: labels[psaGrade] ?? "EX" };
}

function analyzeCentering(canvas: HTMLCanvasElement): CenteringResult {
  const ctx = canvas.getContext("2d")!;
  const w = canvas.width;
  const h = canvas.height;
  const data = ctx.getImageData(0, 0, w, h).data;

  const brightness = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    return (data[i] + data[i + 1] + data[i + 2]) / 3;
  };

  const edgeThreshold = 40;

  let left = 0, right = 0, top = 0, bottom = 0;
  const midY = Math.floor(h / 2);
  for (let x = 1; x < w; x++) {
    if (Math.abs(brightness(x, midY) - brightness(x - 1, midY)) > edgeThreshold) { left = x; break; }
  }
  for (let x = w - 2; x >= 0; x--) {
    if (Math.abs(brightness(x, midY) - brightness(x + 1, midY)) > edgeThreshold) { right = w - x; break; }
  }
  const midX = Math.floor(w / 2);
  for (let y = 1; y < h; y++) {
    if (Math.abs(brightness(midX, y) - brightness(midX, y - 1)) > edgeThreshold) { top = y; break; }
  }
  for (let y = h - 2; y >= 0; y--) {
    if (Math.abs(brightness(midX, y) - brightness(midX, y + 1)) > edgeThreshold) { bottom = h - y; break; }
  }

  const lrTotal = left + right || 1;
  const tbTotal = top + bottom || 1;
  const lPct = Math.round((left / lrTotal) * 100);
  const rPct = 100 - lPct;
  const tPct = Math.round((top / tbTotal) * 100);
  const bPct = 100 - tPct;

  const lrOff = Math.abs(50 - lPct);
  const tbOff = Math.abs(50 - tPct);
  const score = Math.max(0, 10 - (lrOff + tbOff) * 0.3);

  return {
    leftRight: [lPct, rPct],
    topBottom: [tPct, bPct],
    score: Math.round(score * 10) / 10,
    psaCentering: `${lPct}/${rPct} - ${tPct}/${bPct}`,
  };
}

function SubGradeSlider({ label, value, onChange, description }: { label: string; value: number; onChange: (v: number) => void; description: string }) {
  const color = value >= 9 ? "text-up" : value >= 7 ? "text-accent" : "text-down";
  return (
    <div className="py-3">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-sm font-medium">{label}</span>
        <span className={`text-sm font-bold tabular ${color}`}>{value.toFixed(1)}</span>
      </div>
      <input
        type="range"
        min={1}
        max={10}
        step={0.5}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-accent h-1.5"
      />
      <div className="text-[10px] text-muted mt-0.5">{description}</div>
    </div>
  );
}

export default function GradeEstimatorPage() {
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<CardResult[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [card, setCard] = useState<CardResult | null>(null);
  const [cardCurrency, setCardCurrency] = useState("USD");

  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [centering, setCentering] = useState<CenteringResult | null>(null);
  const [surface, setSurface] = useState(8.5);
  const [edges, setEdges] = useState(8.5);
  const [corners, setCorners] = useState(8.5);

  const fileRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const grade = centering ? calcGrade(centering.score, surface, edges, corners) : null;

  async function searchCards() {
    if (!searchQ.trim()) return;
    setSearchLoading(true);
    try {
      const r = await fetch(`/api/search?q=${encodeURIComponent(searchQ.trim())}`);
      const d = await r.json();
      setSearchResults(d.cards?.slice(0, 8) ?? []);
    } catch {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }

  const selectCard = useCallback(async (c: CardResult) => {
    setCard(c);
    setSearchResults(null);
    setSearchQ("");
    try {
      const r = await fetch(`/api/cards/${encodeURIComponent(c.id)}`);
      const d = await r.json();
      if (d.card?.prices) {
        const bp = d.card.prices?.tcgplayer?.variants?.normal ?? d.card.prices?.tcgplayer?.variants?.holofoil ?? {};
        const amount = bp.market ?? bp.mid ?? bp.low ?? c.price?.amount ?? 0;
        setCard({ ...c, price: { amount, currency: d.displayCurrency ?? "USD" } });
        setCardCurrency(d.displayCurrency ?? "USD");
      }
    } catch { /* use search price */ }
  }, []);

  function handlePhoto(file: File) {
    const url = URL.createObjectURL(file);
    setPhotoUrl(url);
    const img = new Image();
    img.onload = () => {
      const canvas = canvasRef.current!;
      const scale = Math.min(600 / img.width, 840 / img.height, 1);
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const result = analyzeCentering(canvas);
      setCentering(result);
    };
    img.src = url;
  }

  function reset() {
    setCard(null);
    setPhotoUrl(null);
    setCentering(null);
    setSurface(8.5);
    setEdges(8.5);
    setCorners(8.5);
  }

  const rawPrice = card?.price?.amount ?? 0;

  return (
    <div className="pb-24">
      <header className="pt-2 pb-3">
        <h1 className="text-xl font-bold">Grade Estimator</h1>
        <p className="text-xs text-muted mt-0.5">Estimate your card{"'"}s grade and see what it{"'"}s worth graded</p>
      </header>

      {!card && (
        <>
          <div className="flex gap-2">
            <input
              className={inputCls}
              placeholder="Search for a card..."
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchCards()}
              enterKeyHint="search"
            />
            <Button variant="ghost" onClick={searchCards} disabled={searchLoading || !searchQ.trim()}>
              {searchLoading ? "..." : "Search"}
            </Button>
          </div>

          {searchResults && searchResults.length > 0 && (
            <ul className="card-surface rounded-2xl divide-y divide-line overflow-hidden mt-3">
              {searchResults.map((sr) => (
                <li key={sr.id}>
                  <button onClick={() => selectCard(sr)} className="w-full flex items-center gap-3 p-2.5 text-left hover:bg-white/[0.03]">
                    <CardImage id={sr.id} className="w-10 rounded-md" alt="" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{sr.name}</div>
                      <div className="text-[10px] text-muted truncate">{sr.setName} {sr.cardNumber && `#${sr.cardNumber}`}</div>
                    </div>
                    {sr.price && (
                      <div className="text-sm font-semibold tabular">
                        <Money amount={sr.price.amount} currency={sr.price.currency} />
                      </div>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {searchResults && searchResults.length === 0 && <Empty>No cards found</Empty>}
        </>
      )}

      {card && (
        <>
          <div className="card-surface rounded-3xl p-4 flex items-center gap-4">
            <Link href={`/cards/${encodeURIComponent(card.id)}`}>
              <CardImage id={card.id} className="w-16 rounded-lg" alt="" />
            </Link>
            <div className="flex-1 min-w-0">
              <div className="font-semibold truncate">{card.name}</div>
              <div className="text-xs text-muted truncate">{card.setName} {card.cardNumber && `#${card.cardNumber}`}</div>
              {rawPrice > 0 && (
                <div className="text-sm mt-0.5">
                  Raw: <span className="font-semibold"><Money amount={rawPrice} currency={cardCurrency} /></span>
                </div>
              )}
            </div>
            <button onClick={reset} className="text-xs text-muted px-2 py-1 rounded-lg bg-white/[0.05]">Change</button>
          </div>

          <Section title="Step 1 — Photo">
            <div className="card-surface rounded-2xl p-4">
              {!photoUrl ? (
                <div className="text-center">
                  <p className="text-sm text-muted mb-3">Take a photo of the front of your card for centering analysis</p>
                  <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => e.target.files?.[0] && handlePhoto(e.target.files[0])} />
                  <div className="flex gap-2 justify-center">
                    <Button onClick={() => fileRef.current?.click()}>Take photo</Button>
                    <Button variant="ghost" onClick={() => { if (fileRef.current) { fileRef.current.removeAttribute("capture"); fileRef.current.click(); fileRef.current.setAttribute("capture", "environment"); } }}>Upload</Button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="relative rounded-xl overflow-hidden bg-black flex justify-center">
                    <img src={photoUrl} alt="Card photo" className="max-h-64 object-contain" />
                  </div>
                  {centering && (
                    <div className="mt-3 grid grid-cols-2 gap-2 text-center">
                      <div className="rounded-xl bg-white/[0.03] border border-line py-2">
                        <div className="text-[10px] text-muted uppercase tracking-wider">L/R centering</div>
                        <div className="text-sm font-semibold tabular">{centering.leftRight[0]}/{centering.leftRight[1]}</div>
                      </div>
                      <div className="rounded-xl bg-white/[0.03] border border-line py-2">
                        <div className="text-[10px] text-muted uppercase tracking-wider">T/B centering</div>
                        <div className="text-sm font-semibold tabular">{centering.topBottom[0]}/{centering.topBottom[1]}</div>
                      </div>
                    </div>
                  )}
                  {centering && (
                    <div className="mt-2 text-center">
                      <span className="text-xs text-muted">Centering score: </span>
                      <span className={`text-sm font-bold ${centering.score >= 9 ? "text-up" : centering.score >= 7 ? "text-accent" : "text-down"}`}>
                        {centering.score}/10
                      </span>
                      <span className="text-xs text-muted ml-2">({centering.psaCentering})</span>
                    </div>
                  )}
                  <button onClick={() => { setPhotoUrl(null); setCentering(null); }} className="mt-2 text-xs text-accent">Retake photo</button>
                </div>
              )}
            </div>
          </Section>

          <Section title="Step 2 — Condition">
            <div className="card-surface rounded-2xl px-4 divide-y divide-line">
              <SubGradeSlider
                label="Surface"
                value={surface}
                onChange={setSurface}
                description="Scratches, print lines, silvering, whitening on face. 10 = flawless under light"
              />
              <SubGradeSlider
                label="Edges"
                value={edges}
                onChange={setEdges}
                description="Edge wear, nicks, peeling foil. 10 = razor sharp all around"
              />
              <SubGradeSlider
                label="Corners"
                value={corners}
                onChange={setCorners}
                description="Corner wear, dings, rounding. 10 = perfectly sharp points"
              />
            </div>
          </Section>

          {grade && centering && (
            <Section title="Estimated Grade">
              <div className="card-surface rounded-3xl p-4">
                <div className="text-center mb-4">
                  <div className="text-4xl font-black tabular">{grade.psaGrade}</div>
                  <div className="text-sm text-muted">{grade.label}</div>
                  <div className="text-xs text-muted mt-1">
                    PSA {grade.psaGrade} · CGC {grade.cgcGrade}
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2 text-center text-xs mb-4">
                  {[
                    { label: "Center", val: grade.centering },
                    { label: "Surface", val: grade.surface },
                    { label: "Edges", val: grade.edges },
                    { label: "Corners", val: grade.corners },
                  ].map((s) => (
                    <div key={s.label} className="rounded-xl bg-white/[0.03] border border-line py-2">
                      <div className="text-[10px] text-muted uppercase tracking-wider">{s.label}</div>
                      <div className={`font-bold tabular ${s.val >= 9 ? "text-up" : s.val >= 7 ? "text-accent" : "text-down"}`}>
                        {s.val.toFixed(1)}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                  <div
                    className={`h-full ${grade.overall >= 9 ? "bg-up" : grade.overall >= 7 ? "bg-accent" : "bg-down"}`}
                    style={{ width: `${(grade.overall / 10) * 100}%` }}
                  />
                </div>
                <div className="text-xs text-muted text-center mt-1 tabular">
                  Overall: {grade.overall.toFixed(1)}/10
                </div>
              </div>
            </Section>
          )}

          {grade && rawPrice > 0 && (
            <Section title="Estimated graded values">
              <div className="card-surface rounded-2xl p-4">
                <div className="text-xs text-muted mb-3">Based on raw market price of <Money amount={rawPrice} currency={cardCurrency} /></div>
                <div className="space-y-1.5">
                  {PSA_GRADES.map((g) => {
                    const est = rawPrice * g.mult;
                    const isMatch = g.grade === grade.psaGrade;
                    return (
                      <div key={g.grade} className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm ${isMatch ? "bg-accent/10 border border-accent/30" : "bg-white/[0.03] border border-line"}`}>
                        <div>
                          <span className={`font-semibold ${isMatch ? "text-accent" : "text-muted"}`}>PSA {g.grade}</span>
                          <span className="text-xs text-muted ml-1.5">{g.label}</span>
                          {isMatch && <span className="text-[10px] text-accent ml-2">YOUR EST.</span>}
                        </div>
                        <span className="font-semibold tabular"><Money amount={est} currency={cardCurrency} /></span>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-4 pt-3 border-t border-line">
                  <div className="text-xs text-muted mb-2">CGC estimates</div>
                  <div className="space-y-1.5">
                    {CGC_GRADES.map((g) => {
                      const est = rawPrice * g.mult;
                      const isMatch = g.grade === grade.cgcGrade;
                      return (
                        <div key={g.grade} className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm ${isMatch ? "bg-accent/10 border border-accent/30" : "bg-white/[0.03] border border-line"}`}>
                          <div>
                            <span className={`font-semibold ${isMatch ? "text-accent" : "text-muted"}`}>CGC {g.grade}</span>
                            <span className="text-xs text-muted ml-1.5">{g.label}</span>
                            {isMatch && <span className="text-[10px] text-accent ml-2">YOUR EST.</span>}
                          </div>
                          <span className="font-semibold tabular"><Money amount={est} currency={cardCurrency} /></span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </Section>
          )}

          {grade && rawPrice > 0 && (
            <Section title="Should you grade it?">
              <GradingROI rawPrice={rawPrice} currency={cardCurrency} grade={grade} />
            </Section>
          )}

          <canvas ref={canvasRef} className="hidden" />
        </>
      )}
    </div>
  );
}

const GRADING_FEES: { company: string; grade: string; fee: number; turnaround: string }[] = [
  { company: "PSA", grade: "Economy", fee: 24.99, turnaround: "65 business days" },
  { company: "PSA", grade: "Regular", fee: 49.99, turnaround: "20 business days" },
  { company: "CGC", grade: "Economy", fee: 17, turnaround: "65 business days" },
  { company: "CGC", grade: "Standard", fee: 30, turnaround: "30 business days" },
  { company: "BGS", grade: "Standard", fee: 14.95, turnaround: "30 business days" },
];

function GradingROI({ rawPrice, currency, grade }: { rawPrice: number; currency: string; grade: GradeBreakdown }) {
  const psaMatch = PSA_GRADES.find((g) => g.grade === grade.psaGrade);
  const estGradedValue = rawPrice * (psaMatch?.mult ?? 1);
  const marketplaceFee = 0.13;

  return (
    <div className="card-surface rounded-2xl p-4">
      <div className="space-y-2">
        {GRADING_FEES.map((f) => {
          const shipping = f.company === "PSA" ? 14.99 : f.company === "CGC" ? 12.99 : 12.99;
          const totalCost = rawPrice + f.fee + shipping;
          const netRevenue = estGradedValue * (1 - marketplaceFee);
          const profit = netRevenue - totalCost;
          const worthIt = profit > 0;

          return (
            <div key={`${f.company}-${f.grade}`} className={`rounded-xl px-3 py-2.5 border ${worthIt ? "border-up/30 bg-up/5" : "border-line bg-white/[0.03]"}`}>
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-semibold">{f.company} {f.grade}</span>
                  <span className="text-[10px] text-muted ml-2">${f.fee} + ${shipping.toFixed(2)} ship</span>
                </div>
                <div className={`text-sm font-bold tabular ${worthIt ? "text-up" : "text-down"}`}>
                  {worthIt ? "+" : ""}<Money amount={profit} currency={currency} />
                </div>
              </div>
              <div className="text-[10px] text-muted mt-0.5">
                {f.turnaround} · Est. graded value: <Money amount={estGradedValue} currency={currency} /> · {worthIt ? "Worth grading" : "Not worth it"}
              </div>
            </div>
          );
        })}
      </div>
      <div className="text-[10px] text-muted mt-3">
        Based on PSA {grade.psaGrade} estimate. Assumes {(marketplaceFee * 100).toFixed(0)}% marketplace fee. Shipping estimates for US — from Canada add ~$15-25 CAD or use a middleman (EVORETRO, Card Chasers MTL).
      </div>
    </div>
  );
}
