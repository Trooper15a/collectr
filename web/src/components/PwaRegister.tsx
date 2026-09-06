"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production" && !location.protocol.startsWith("https")) return;
    navigator.serviceWorker.register("/sw.js").catch((e) => console.warn("sw register failed", e));

    const syncOnReconnect = () => {
      navigator.serviceWorker.controller?.postMessage("SYNC_QUEUE");
    };
    window.addEventListener("online", syncOnReconnect);
    return () => window.removeEventListener("online", syncOnReconnect);
  }, []);
  return null;
}
