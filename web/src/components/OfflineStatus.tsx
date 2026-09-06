"use client";

import { useEffect, useState } from "react";

interface OfflineState {
  online: boolean;
  pending: number;
  lastSync: number | null;
}

export function OfflineStatus() {
  const [state, setState] = useState<OfflineState>({ online: true, pending: 0, lastSync: null });

  useEffect(() => {
    const update = () => setState((s) => ({ ...s, online: navigator.onLine }));
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    update();

    const sw = navigator.serviceWorker?.controller;
    if (sw) {
      sw.postMessage("GET_STATUS");
    }

    const handler = (e: MessageEvent) => {
      if (e.data?.type === "STATUS") {
        setState((s) => ({ ...s, pending: e.data.pending, lastSync: e.data.lastSync }));
      }
      if (e.data?.type === "QUEUE_UPDATED") {
        navigator.serviceWorker?.controller?.postMessage("GET_STATUS");
      }
      if (e.data?.type === "QUEUE_SYNCED") {
        navigator.serviceWorker?.controller?.postMessage("GET_STATUS");
      }
    };
    navigator.serviceWorker?.addEventListener("message", handler);

    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      navigator.serviceWorker?.removeEventListener("message", handler);
    };
  }, []);

  function syncNow() {
    navigator.serviceWorker?.controller?.postMessage("SYNC_QUEUE");
  }

  const ago = state.lastSync ? formatAgo(state.lastSync) : "never";

  return (
    <div className="card-surface rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`inline-block w-2 h-2 rounded-full ${state.online ? "bg-up" : "bg-down"}`} />
          <span className="text-sm font-medium">{state.online ? "Online" : "Offline"}</span>
        </div>
        <span className="text-xs text-muted">Last sync: {ago}</span>
      </div>
      <div className="text-xs text-muted">
        {state.online
          ? "Portfolio data and prices are cached for offline use. You can scan cards and browse your collection without internet."
          : "You're offline. Cached data is being used. Any changes will sync when you're back online."}
      </div>
      {state.pending > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-accent">{state.pending} pending {state.pending === 1 ? "change" : "changes"}</span>
          {state.online && (
            <button onClick={syncNow} className="text-xs text-accent underline">
              Sync now
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function OfflineBanner() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    update();
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (online) return null;

  return (
    <div className="bg-accent/10 border border-accent/20 rounded-xl px-3 py-2 mb-3 flex items-center gap-2">
      <span className="inline-block w-2 h-2 rounded-full bg-down" />
      <span className="text-xs text-fg">You're offline — using cached data</span>
    </div>
  );
}

function formatAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return `${Math.floor(diff / 86400_000)}d ago`;
}
