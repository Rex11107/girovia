/* Girovia: funzionamento offline.
   - L'app (pagine, codice, font, Leaflet) resta in cache: si apre anche senza rete.
   - Le tile della mappa già viste restano disponibili offline (al massimo MAX_TILES).
   - Orari e percorsi non vengono mai messi in cache: devono essere sempre aggiornati. */
const VERSION = "__BUILD__";
const APP = "girovia-app-" + VERSION;
const TILES = "girovia-tiles";
const MAX_TILES = 1500;
const SHELL = [
  "./", "index.html", "app.js", "config.js", "privacy.html", "manifest.webmanifest",
  "icon.svg", "icon-192.png", "icon-512.png",
  "vendor/leaflet/leaflet.js", "vendor/leaflet/leaflet.css",
  "fonts/atkinson-hyperlegible-latin-400-normal.woff2", "fonts/atkinson-hyperlegible-latin-700-normal.woff2",
  "fonts/barlow-condensed-latin-600-normal.woff2", "fonts/barlow-condensed-latin-700-normal.woff2"
];
const TILE_HOSTS = /(^|\.)tile\.openstreetmap\.(org|fr|de)$|(^|\.)basemaps\.cartocdn\.com$/;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(APP).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith("girovia-app-") && k !== APP).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

let trimming = false;
async function trimTiles() {
  if (trimming) return; trimming = true;
  try {
    const c = await caches.open(TILES); const keys = await c.keys();
    if (keys.length > MAX_TILES) await Promise.all(keys.slice(0, keys.length - MAX_TILES + 200).map((k) => c.delete(k)));
  } finally { trimming = false; }
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Tile della mappa: prima la cache, poi la rete (e si salva)
  if (TILE_HOSTS.test(url.hostname)) {
    e.respondWith(caches.open(TILES).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) { c.put(req, res.clone()); trimTiles(); }
      return res;
    }));
    return;
  }

  // File dell'app: subito dalla cache, aggiornati in sottofondo
  if (url.origin === self.location.origin) {
    e.respondWith(caches.open(APP).then(async (c) => {
      const hit = await c.match(req, { ignoreSearch: true }) || (req.mode === "navigate" ? await c.match("index.html") : null);
      const net = fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res; });
      if (hit) { net.catch(() => {}); return hit; }
      return net;
    }));
  }
  // Tutto il resto (orari, percorsi, ricerca) va direttamente in rete.
});
