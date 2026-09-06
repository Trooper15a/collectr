/* Collect Them All service worker: app shell + model + images + offline API caching. */
const VERSION = "v2";
const SHELL = `cta-shell-${VERSION}`;
const MODEL = `cta-model-${VERSION}`;
const IMAGES = `cta-images-${VERSION}`;
const API_DATA = `cta-api-${VERSION}`;

const OFFLINE_API_PATTERNS = [
  "/api/dashboard",
  "/api/portfolios",
  "/api/alerts",
  "/api/settings",
  "/api/sets",
  "/api/cards/",
  "/api/opens",
];

function isOfflineCacheable(pathname) {
  return OFFLINE_API_PATTERNS.some((p) => pathname.startsWith(p));
}

/* ── IndexedDB for offline write queue ── */
function openQueue() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("cta-offline", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("queue", { keyPath: "id", autoIncrement: true });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function enqueue(entry) {
  const db = await openQueue();
  const tx = db.transaction("queue", "readwrite");
  tx.objectStore("queue").add(entry);
  await new Promise((r, e) => { tx.oncomplete = r; tx.onerror = e; });
  db.close();
  notifyClients({ type: "QUEUE_UPDATED" });
}

async function drainQueue() {
  const db = await openQueue();
  const tx = db.transaction("queue", "readonly");
  const items = await new Promise((r) => { const req = tx.objectStore("queue").getAll(); req.onsuccess = () => r(req.result); });
  db.close();
  if (!items.length) return;
  const synced = [];
  for (const item of items) {
    try {
      const res = await fetch(item.url, {
        method: item.method,
        headers: item.headers,
        body: item.body,
      });
      if (res.ok || res.status < 500) synced.push(item.id);
    } catch {
      break;
    }
  }
  if (synced.length) {
    const db2 = await openQueue();
    const tx2 = db2.transaction("queue", "readwrite");
    const store = tx2.objectStore("queue");
    synced.forEach((id) => store.delete(id));
    await new Promise((r) => { tx2.oncomplete = r; });
    db2.close();
    notifyClients({ type: "QUEUE_SYNCED", count: synced.length });
  }
}

async function getQueueCount() {
  try {
    const db = await openQueue();
    const tx = db.transaction("queue", "readonly");
    const count = await new Promise((r) => { const req = tx.objectStore("queue").count(); req.onsuccess = () => r(req.result); });
    db.close();
    return count;
  } catch { return 0; }
}

function notifyClients(msg) {
  self.clients.matchAll().then((clients) => clients.forEach((c) => c.postMessage(msg)));
}

/* ── Lifecycle ── */
self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => ![SHELL, MODEL, IMAGES, API_DATA].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/* ── Fetch handler ── */
self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // Write requests: try network, queue if offline
  if (req.method !== "GET") {
    if (url.pathname.startsWith("/api/")) {
      e.respondWith(handleWrite(req));
    }
    return;
  }

  // Model files: stale-while-revalidate
  if (url.pathname.startsWith("/model/")) {
    e.respondWith(staleRevalidate(MODEL, req));
    return;
  }
  // ORT WASM runtime: cache-first
  if (url.pathname.startsWith("/ort/")) {
    e.respondWith(cacheFirst(MODEL, req));
    return;
  }
  // Card images: cache-first
  if (url.pathname.startsWith("/api/images/")) {
    e.respondWith(cacheFirst(IMAGES, req));
    return;
  }
  // API data: network-first with cache fallback for offline
  if (url.pathname.startsWith("/api/") && isOfflineCacheable(url.pathname)) {
    e.respondWith(networkFirstApi(req));
    return;
  }
  // Other API: network only
  if (url.pathname.startsWith("/api/")) return;
  // Pages + static assets: network-first
  e.respondWith(networkFirst(SHELL, req));
});

/* ── Write handler: try network, queue on failure ── */
async function handleWrite(req) {
  const cloned = req.clone();
  try {
    const res = await fetch(req);
    return res;
  } catch {
    const body = await cloned.text();
    const headers = {};
    for (const [k, v] of cloned.headers.entries()) headers[k] = v;
    await enqueue({ url: cloned.url, method: cloned.method, headers, body, timestamp: Date.now() });
    return new Response(JSON.stringify({ queued: true, offline: true }), {
      status: 202,
      headers: { "Content-Type": "application/json" },
    });
  }
}

/* ── API cache: network-first, cache fallback when offline ── */
async function networkFirstApi(req) {
  const cache = await caches.open(API_DATA);
  try {
    const res = await fetch(req);
    if (res.ok) {
      cache.put(req, res.clone());
      // Store sync timestamp
      const meta = await caches.open("cta-meta");
      await meta.put("last-sync", new Response(JSON.stringify({ timestamp: Date.now() })));
    }
    return res;
  } catch {
    const hit = await cache.match(req);
    if (hit) {
      const offlineRes = new Response(hit.body, {
        status: hit.status,
        statusText: hit.statusText,
        headers: new Headers(hit.headers),
      });
      offlineRes.headers.set("X-Offline-Cache", "true");
      return offlineRes;
    }
    return new Response(JSON.stringify({ error: "Offline and no cached data" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
}

/* ── Cache strategies ── */
async function cacheFirst(cacheName, req) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

async function staleRevalidate(cacheName, req) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  const fresh = fetch(req).then((res) => {
    if (res.ok) cache.put(req, res.clone());
    return res;
  });
  return hit || fresh;
}

async function networkFirst(cacheName, req) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok && (req.mode === "navigate" || url_is_static(req.url))) cache.put(req, res.clone());
    return res;
  } catch {
    const hit = await cache.match(req);
    if (hit) return hit;
    if (req.mode === "navigate") {
      const root = await cache.match("/");
      if (root) return root;
    }
    throw new Error("offline");
  }
}

function url_is_static(u) {
  return /\/_next\/static\//.test(u) || /\.(png|svg|ico|json|woff2?)$/.test(u);
}

/* ── Messages from the app ── */
self.addEventListener("message", (e) => {
  if (e.data === "SYNC_QUEUE") {
    drainQueue();
  }
  if (e.data === "GET_STATUS") {
    Promise.all([
      getQueueCount(),
      caches.open("cta-meta").then((c) => c.match("last-sync")).then((r) => r ? r.json() : null),
    ]).then(([pending, sync]) => {
      e.source.postMessage({ type: "STATUS", pending, lastSync: sync?.timestamp ?? null });
    });
  }
});

/* ── Online sync ── */
self.addEventListener("online", () => drainQueue());
