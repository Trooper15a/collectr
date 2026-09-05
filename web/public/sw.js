/* Collectr service worker: app shell + model files + card images cached for offline use. */
const VERSION = "v1";
const SHELL = `collectr-shell-${VERSION}`;
const MODEL = `collectr-model-${VERSION}`;
const IMAGES = `collectr-images-${VERSION}`;

self.addEventListener("install", (e) => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => ![SHELL, MODEL, IMAGES].includes(k)).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // Model files: stale-while-revalidate so a retrained model is picked up on the next visit.
  if (url.pathname.startsWith("/model/")) {
    e.respondWith(staleRevalidate(MODEL, req));
    return;
  }
  // ORT WASM runtime: cache-first (never changes unless onnxruntime-web is upgraded).
  if (url.pathname.startsWith("/ort/")) {
    e.respondWith(cacheFirst(MODEL, req));
    return;
  }
  // Card images: cache-first (immutable per card id + size).
  if (url.pathname.startsWith("/api/images/")) {
    e.respondWith(cacheFirst(IMAGES, req));
    return;
  }
  // API data: network only (always live).
  if (url.pathname.startsWith("/api/")) return;
  // Pages + static assets: network-first with cache fallback so the app opens offline.
  e.respondWith(networkFirst(SHELL, req));
});

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
