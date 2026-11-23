/* Offline support: the app shell and book list are fetched fresh when online (cache is the fallback);
   per-passage indexes under data/refs are cached after first use. Private covers are never cached here. */
const CACHE = "bookshelf-v1";
const SHELL = ["./", "index.html", "css/style.css", "js/app.js", "data/books.json", "data/meta.json", "manifest.webmanifest", "icon.svg"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || /\/data\/(covers|private)/.test(url.pathname)) return;
  const refs = /\/data\/refs\//.test(url.pathname);
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (refs) { const hit = await cache.match(req); if (hit) return hit; }
    try { const res = await fetch(req); if (res.ok) cache.put(req, res.clone()); return res; }
    catch { const hit = await cache.match(req, { ignoreSearch: true }); if (hit) return hit; throw new Error("offline"); }
  })());
});
