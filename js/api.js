// Servizi esterni: Transitous (orari, luoghi, percorsi con i mezzi) e OSRM (auto, piedi).

import { dataKey, decodePolyline, motisSteps, osrmItem, placeParam, prettify } from "./util.js";
import { CFG } from "./state.js";
import { isOffline } from "./net.js";
import { loadData, saveData } from "./offline.js";

// ---------- Accesso ai servizi ----------
// Ogni richiesta ha un tempo massimo; si può anche annullare dall'esterno (nuova ricerca, uscita dalla vista).
const TIMEOUT_MS = CFG.timeoutMs || 15000;
export class NetError extends Error { constructor(msg, kind) { super(msg); this.kind = kind; } }
export const OFFLINE_MSG = "Sei offline: puoi riaprire i viaggi e le fermate già consultati, il resto torna con la rete.";
async function fetchT(url, signal, ms) {
  const ctl = new AbortController();
  const onAbort = () => ctl.abort();
  if (signal) { if (signal.aborted) ctl.abort(); else signal.addEventListener("abort", onAbort, { once: true }); }
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; ctl.abort(); }, ms || TIMEOUT_MS);
  try { return await fetch(url, { signal: ctl.signal, referrerPolicy: "origin" }); }
  catch (e) {
    if (timedOut) throw new NetError("Il servizio non risponde: la rete è lenta o assente. Riprova tra poco.", "timeout");
    if (e.name === "AbortError") throw e;
    throw new NetError(isOffline() ? OFFLINE_MSG : "Servizio non raggiungibile. Controlla la connessione.", "offline");
  } finally { clearTimeout(timer); if (signal) signal.removeEventListener("abort", onAbort); }
}
// Transitous (MOTIS 2) ha più versioni delle API: si prova dalla più recente.
const VERSIONS = { "rentals": [1], "plan": [6, 5, 4, 3, 2], "trip": [6, 5, 4, 2], "stoptimes": [6, 5, 4, 1], "map/stops": [6, 1], "geocode": [1], "reverse-geocode": [1] };
const knownVersion = {};
// Risposta salvata: stessi dati, con l'ora in cui erano stati letti (__savedAt)
function fromSaved(hit) {
  const d = prettify(hit.data);
  Object.defineProperty(d, "__savedAt", { value: hit.at, enumerable: false });
  return d;
}

// Con la rete chiede al servizio e salva la risposta; senza rete (o se il servizio non
// risponde) usa l'ultima risposta salvata per la stessa ricerca, se c'è.
export async function motis(endpoint, params, signal) {
  const key = dataKey(endpoint, params);
  if (isOffline()) {
    const hit = await loadData(key);
    if (hit) return fromSaved(hit);
    throw new NetError(OFFLINE_MSG, "offline");
  }
  try {
    const json = await motisNet(endpoint, params, signal);
    saveData(key, json);
    return prettify(json);
  } catch (e) {
    if (e.kind) { const hit = await loadData(key); if (hit) return fromSaved(hit); }
    throw e;
  }
}

async function motisNet(endpoint, params, signal) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") qs.set(k, Array.isArray(v) ? v.join(",") : String(v));
  const list = knownVersion[endpoint] ? [knownVersion[endpoint]] : VERSIONS[endpoint];
  let lastErr;
  for (const v of list) {
    const url = `${CFG.transitous}/api/v${v}/${endpoint}?${qs}`;
    const res = await fetchT(url, signal);
    if (res.status === 404 && !knownVersion[endpoint]) { lastErr = new Error("Versione API non trovata"); continue; }
    if (!res.ok) {
      let t = ""; try { t = await res.text(); } catch (e) {}
      lastErr = new Error(res.status === 429 ? "Troppe richieste al servizio orari. Riprova tra un minuto." : `Il servizio orari ha risposto con un errore (${res.status}). ${t.slice(0, 140)}`);
      break;
    }
    knownVersion[endpoint] = v;
    return res.json();
  }
  throw lastErr || new Error("Servizio orari non disponibile.");
}

export async function osrm(base, from, to, alternatives, signal) {
  const url = `${base}/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?overview=full&geometries=polyline6&steps=true&alternatives=${alternatives ? "true" : "false"}`;
  const key = `osrm/${base.split("/").pop()}/${(+from.lat).toFixed(4)},${(+from.lon).toFixed(4)}/${(+to.lat).toFixed(4)},${(+to.lon).toFixed(4)}`;
  const saved = async (err) => { const hit = await loadData(key); if (!hit) throw err; const r = hit.data.routes; Object.defineProperty(r, "__savedAt", { value: hit.at, enumerable: false }); return r; };
  if (isOffline()) return saved(new NetError(OFFLINE_MSG, "offline"));
  let res;
  try { res = await fetchT(url, signal); } catch (e) { if (e.kind) return saved(e); throw e; }
  if (!res.ok) throw new Error("Servizio percorsi non raggiungibile (" + res.status + ").");
  const j = await res.json();
  if (j.code !== "Ok" || !j.routes || !j.routes.length) throw new Error("Nessun percorso trovato tra questi due punti.");
  saveData(key, { routes: j.routes });
  return j.routes;
}

// Server OSRM per auto, piedi e bici (config.js)
export function routingBase(mode) { return mode === "CAR" ? CFG.routingCar : (mode === "BIKE" ? CFG.routingBike : CFG.routingFoot); }

// Bici e monopattini in sharing: c'è un servizio nella zona? (risposta ricordata per zona, ~5 km)
const sharingCache = new Map();
export async function sharingNear(p, signal) {
  const key = `${Math.round(p.lat * 20)},${Math.round(p.lon * 20)}`;
  if (sharingCache.has(key)) return sharingCache.get(key);
  let ok = false;
  try { const r = await motis("rentals", { point: `${p.lat},${p.lon}`, radius: 3000, withProviders: true, withStations: false, withVehicles: false, withZones: false }, signal); ok = !!(r && r.providers && r.providers.length); }
  catch (e) { if (e.name === "AbortError") throw e; }
  sharingCache.set(key, ok);
  return ok;
}

export async function roadRoutes(mode, from, to, signal) {
  const base = routingBase(mode);
  try {
    const routes = await osrm(base, from, to, mode !== "WALK", signal);
    const items = routes.map((r) => osrmItem(r, mode));
    if (routes.__savedAt) Object.defineProperty(items, "__savedAt", { value: routes.__savedAt, enumerable: false });
    return items;
  } catch (first) {
    if (first.name === "AbortError" || first.kind === "offline") throw first;
    // Riserva: stesso calcolo con Transitous
    const plan = await motis("plan", { fromPlace: placeParam(from), toPlace: placeParam(to), directModes: mode, maxDirectTime: 6 * 3600, numItineraries: 1, language: "it", time: new Date().toISOString() }, signal);
    const d = (plan.direct || []);
    if (!d.length) throw first;
    return d.map((it) => {
      const legs = it.legs || [];
      return { kind: "road", mode, duration: it.duration, distance: legs.reduce((a, l) => a + (l.distance || 0), 0), startTime: it.startTime, endTime: it.endTime,
        geometry: legs.flatMap((l) => decodePolyline(l.legGeometry.points, l.legGeometry.precision)),
        steps: legs.flatMap((l) => motisSteps(l.steps)) };
    });
  }
}
