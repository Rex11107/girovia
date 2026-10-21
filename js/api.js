// Servizi esterni: Transitous (orari, luoghi, percorsi con i mezzi) e OSRM (auto, piedi).

import { decodePolyline, motisSteps, osrmItem, placeParam, prettify } from "./util.js";
import { CFG } from "./state.js";

// ---------- Accesso ai servizi ----------
// Ogni richiesta ha un tempo massimo; si può anche annullare dall'esterno (nuova ricerca, uscita dalla vista).
const TIMEOUT_MS = CFG.timeoutMs || 15000;
class NetError extends Error { constructor(msg, kind) { super(msg); this.kind = kind; } }
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
    throw new NetError(navigator.onLine === false ? "Sei offline: orari e percorsi tornano quando c'è rete." : "Servizio non raggiungibile. Controlla la connessione.", "offline");
  } finally { clearTimeout(timer); if (signal) signal.removeEventListener("abort", onAbort); }
}
// Transitous (MOTIS 2) ha più versioni delle API: si prova dalla più recente.
const VERSIONS = { "rentals": [1], "plan": [6, 5, 4, 3, 2], "trip": [6, 5, 4, 2], "stoptimes": [6, 5, 4, 1], "map/stops": [6, 1], "geocode": [1], "reverse-geocode": [1] };
const knownVersion = {};
export async function motis(endpoint, params, signal) {
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
    return prettify(await res.json());
  }
  throw lastErr || new Error("Servizio orari non disponibile.");
}

export async function osrm(base, from, to, alternatives, signal) {
  const url = `${base}/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?overview=full&geometries=polyline6&steps=true&alternatives=${alternatives ? "true" : "false"}`;
  const res = await fetchT(url, signal);
  if (!res.ok) throw new Error("Servizio percorsi non raggiungibile (" + res.status + ").");
  const j = await res.json();
  if (j.code !== "Ok" || !j.routes || !j.routes.length) throw new Error("Nessun percorso trovato tra questi due punti.");
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
    return routes.map((r) => osrmItem(r, mode));
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
