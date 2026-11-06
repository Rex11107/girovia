/* Girovia: funzionamento offline della versione web.
   - L'app (pagine, codice, font, Leaflet) resta in cache: si apre anche senza rete.
   - Tile della mappa e dati già visti li conserva l'app stessa (js/offline.js), così vale
     anche nell'APK, dove il service worker non c'è. */
const VERSION = "__BUILD__";
const APP = "girovia-app-" + VERSION;
const SHELL = [
  "./", "index.html", "styles.css", "theme.js", "config.js", "privacy.html", "manifest.webmanifest",
  "js/main.js", "js/util.js", "js/state.js", "js/ui.js", "js/api.js", "js/map.js", "js/places.js", "js/views.js", "js/nav.js", "js/version.js", "js/net.js", "js/offline.js",
  "icon.svg", "icon-192.png", "icon-512.png",
  "vendor/leaflet/leaflet.js", "vendor/leaflet/leaflet.css",
  "fonts/atkinson-hyperlegible-latin-400-normal.woff2", "fonts/atkinson-hyperlegible-latin-700-normal.woff2",
  "fonts/barlow-condensed-latin-600-normal.woff2", "fonts/barlow-condensed-latin-700-normal.woff2"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(APP).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => (k.startsWith("girovia-app-") && k !== APP) || k === "girovia-tiles").map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});


self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // File dell'app: subito dalla cache, aggiornati in sottofondo
  if (url.origin === self.location.origin) {
    e.respondWith(caches.open(APP).then(async (c) => {
      const hit = await c.match(req, { ignoreSearch: true }) || (req.mode === "navigate" ? await c.match("index.html") : null);
      const net = fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res; });
      if (hit) { net.catch(() => {}); return hit; }
      return net;
    }));
  }
  // Tutto il resto (tile, orari, percorsi, ricerca) va direttamente in rete: lo gestisce l'app.
});
