// Dati già visti conservati sul telefono per quando manca la rete:
// orari, partenze, corse, ricerche dei luoghi, percorsi su strada e tile della mappa.
// Si usa la Cache del browser, che funziona sia sul sito sia nell'APK (senza service worker).

const DATA = "girovia-dati-v1", MAX_DATA = 80;
const TILES = "girovia-tiles-v2", MAX_TILES = 1500;
const hasCache = () => typeof caches !== "undefined";
const dataUrl = (key) => "https://girovia.invalid/dati/" + encodeURIComponent(key);

async function trim(c, max) {
  const keys = await c.keys();
  if (keys.length > max) await Promise.all(keys.slice(0, keys.length - max + Math.ceil(max / 10)).map((k) => c.delete(k)));
}

export async function saveData(key, data) {
  if (!key || !hasCache()) return;
  try {
    const c = await caches.open(DATA);
    await c.put(dataUrl(key), new Response(JSON.stringify({ at: Date.now(), data }), { headers: { "content-type": "application/json" } }));
    trim(c, MAX_DATA);
  } catch (e) { /* memoria piena o non disponibile: si continua senza */ }
}
export async function loadData(key) {
  if (!key || !hasCache()) return null;
  try { const r = await (await caches.open(DATA)).match(dataUrl(key)); return r ? await r.json() : null; } catch (e) { return null; }
}

// Tile: la stessa immagine dai sottodomini a/b/c/d si conserva una volta sola
const tileKey = (url) => url.replace(/\/\/[abcd]\./, "//a.");
let tileTrim = 0;
export async function cachedTile(url, offline) {
  if (!hasCache()) throw new Error("niente cache");
  const c = await caches.open(TILES);
  const hit = await c.match(tileKey(url));
  if (hit) return hit.blob();
  if (offline) throw new Error("tile non salvata");
  const res = await fetch(url, { mode: "cors", credentials: "omit", referrerPolicy: "origin" });
  if (!res.ok) throw new Error("tile " + res.status);
  await c.put(tileKey(url), res.clone());
  if (++tileTrim % 50 === 0) trim(c, MAX_TILES);
  return res.blob();
}
export async function tileCount() {
  if (!hasCache()) return 0;
  try { return (await (await caches.open(TILES)).keys()).length; } catch (e) { return 0; }
}
