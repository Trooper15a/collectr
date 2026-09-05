"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getScanEngine, type ScanEngine } from "@/lib/scanner/engine";
import type { Match } from "@/lib/scanner/matcher";
import { cardGuide, preprocess } from "@/lib/scanner/preprocess";
import { Button } from "./ui";

/** Map an ML index card id (pw:/sf:/ygo:) straight to the app's card id: they use the same scheme. */
export function Scanner({ onMatches, onClose, bulkMode, bulkCount }: { onMatches: (m: Match[]) => void; onClose: () => void; bulkMode?: boolean; bulkCount?: number }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [engine, setEngine] = useState<ScanEngine | null>(null);
  const [camError, setCamError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [auto, setAuto] = useState(true);
  const [live, setLive] = useState<Match[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    let cancelled = false;
    getScanEngine().then((e) => !cancelled && setEngine(e));
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 1280 } }, audio: false });
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch (e) {
        setCamError(e instanceof Error ? e.message : "Camera unavailable. Use HTTPS (npm run dev:https) and allow camera access.");
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const scanOnce = useCallback(async () => {
    const v = videoRef.current;
    if (!v || !engine || engine.status !== "ready" || v.videoWidth === 0) return null;
    const guide = cardGuide(v.videoWidth, v.videoHeight);
    const input = preprocess(v, guide, canvasRef.current ?? undefined);
    return engine.match(input, 5);
  }, [engine]);

  // Live preview: run a match ~3x/sec while auto mode is on.
  useEffect(() => {
    if (!auto || !engine || engine.status !== "ready") return;
    let stop = false;
    const tick = async () => {
      if (stop) return;
      try {
        const m = await scanOnce();
        if (m && !stop) setLive(m);
      } catch {
        /* ignore transient */
      }
      if (!stop) setTimeout(tick, 350);
    };
    tick();
    return () => {
      stop = true;
    };
  }, [auto, engine, scanOnce]);

  async function capture() {
    setBusy(true);
    try {
      const m = await scanOnce();
      if (m) onMatches(m);
    } finally {
      setBusy(false);
    }
  }

  const top = live[0];
  const confident = top && top.score > 0.8;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} playsInline muted className="absolute inset-0 w-full h-full object-cover" />
        <canvas ref={canvasRef} className="hidden" />
        <Guide />
        <div className="absolute top-0 inset-x-0 p-4 pt-[max(env(safe-area-inset-top),16px)] flex items-center justify-between">
          <button onClick={onClose} className="glass rounded-full px-3 py-1.5 text-sm">
            Close
          </button>
          <div className="glass rounded-full px-3 py-1.5 text-xs text-muted">
            {engine == null ? "Loading model…" : engine.status === "ready" ? `Model ready · ${engine.backend}` : engine.status}
          </div>
        </div>
        {top && (
          <div className="absolute bottom-4 inset-x-4 glass rounded-2xl p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted">Live match · {(top.score * 100).toFixed(0)}%</div>
            <div className={`font-semibold ${confident ? "text-up" : ""}`}>{top.card.name}</div>
            <div className="text-xs text-muted">
              {top.card.setName ?? top.card.set} #{top.card.num} · {top.card.lang?.toUpperCase()}
            </div>
          </div>
        )}
      </div>
      <div className="glass p-4 pb-[max(env(safe-area-inset-bottom),16px)]">
        {camError && <div className="text-sm text-down mb-3">{camError}</div>}
        {engine && engine.status !== "ready" && engine.error && <div className="text-sm text-down mb-3">{engine.error}</div>}
        {bulkMode && (bulkCount ?? 0) > 0 && (
          <div className="text-xs text-accent font-semibold mb-2 text-center">{bulkCount} card{bulkCount !== 1 ? "s" : ""} scanned</div>
        )}
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-muted">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="accent-accent" /> Live
          </label>
          <Button className="flex-1" onClick={capture} disabled={busy || !engine || engine.status !== "ready" || !!camError}>
            {busy ? "Identifying…" : "Identify card"}
          </Button>
          {bulkMode && (
            <Button variant="ghost" onClick={onClose}>Done</Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Guide() {
  return (
    <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
      <div className="relative" style={{ width: "78%", aspectRatio: "63/88", maxHeight: "85%" }}>
        <div className="absolute inset-0 rounded-xl border-2 border-white/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
      </div>
    </div>
  );
}
