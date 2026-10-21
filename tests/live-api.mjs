// Controllo con i servizi REALI (Transitous e OSRM) su tratte di Firenze e provincia.
// Gira su GitHub Actions. Scrive un riepilogo leggibile in live-report.md
// e, se presente, nel riepilogo del job (GITHUB_STEP_SUMMARY).
import fs from "node:fs";

const T = "https://api.transitous.org";
const OSRM = "https://routing.openstreetmap.de";
const HEADERS = {
  "User-Agent": "Girovia-CI/0.1 (+https://github.com/Rex11107/girovia)",
  "Referer": "https://rex11107.github.io/girovia/"
};
const VERSIONS = { rentals: [1], plan: [6, 5, 4, 3, 2], trip: [6, 5, 4, 2], stoptimes: [6, 5, 4, 1], "map/stops": [6, 1], geocode: [1] };
const used = {};
const lines = [];
let failures = 0;
const log = (s) => { lines.push(s); console.log(s); };
const ok = (name, detail = "") => log(`- ✅ ${name}${detail ? " — " + detail : ""}`);
const fail = (name, detail = "") => { failures++; log(`- ❌ ${name}${detail ? " — " + detail : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function motis(ep, params) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, Array.isArray(v) ? v.join(",") : String(v)]));
  for (const v of used[ep] ? [used[ep]] : VERSIONS[ep]) {
    const res = await fetch(`${T}/api/v${v}/${ep}?${qs}`, { headers: HEADERS });
    if (res.status === 404 && !used[ep]) continue;
    if (!res.ok) throw new Error(`${ep} v${v}: HTTP ${res.status} ${(await res.text()).slice(0, 160)}`);
    used[ep] = v;
    await sleep(400); // gentile con un servizio gestito da volontari
    return res.json();
  }
  throw new Error(`${ep}: nessuna versione API disponibile`);
}

// Prossimo giorno feriale alle 08:00 ora italiana
function nextWeekday8() {
  const d = new Date();
  do { d.setUTCDate(d.getUTCDate() + 1); } while ([0, 6].includes(d.getUTCDay()));
  const ymd = d.toISOString().slice(0, 10);
  const probe = new Date(`${ymd}T12:00:00Z`);
  const romeHour = +new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", hour: "2-digit", hour12: false }).format(probe);
  const offset = romeHour - 12;
  return new Date(Date.parse(`${ymd}T08:00:00Z`) - offset * 3600e3).toISOString();
}

const fmt = (iso) => new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

const PLACES = {
  "Firenze SMN": [43.7764, 11.2480],
  "Pontassieve": [43.7745, 11.4381],
  "Borgo San Lorenzo": [43.9554, 11.3863],
  "Empoli": [43.7189, 10.9461],
  "Figline Valdarno": [43.6200, 11.4693],
  "Greve in Chianti": [43.5847, 11.3165],
  "Sesto Fiorentino": [43.8319, 11.1997]
};
const ROUTES = [["Firenze SMN", "Pontassieve"], ["Firenze SMN", "Borgo San Lorenzo"], ["Firenze SMN", "Greve in Chianti"], ["Sesto Fiorentino", "Empoli"], ["Firenze SMN", "Figline Valdarno"]];

async function main() {
  log(`# Controllo con dati reali\n\nEseguito: ${new Date().toISOString()}\n`);

  log("## Ricerca luoghi");
  let smnStop = null;
  for (const q of ["Pontassieve", "Firenze Santa Maria Novella", "Via de' Calzaiuoli Firenze", "Borgo San Lorenzo"]) {
    try {
      const r = await motis("geocode", { text: q, language: "it", place: "43.77,11.25", placeBias: 1.5, numResults: 5 });
      if (!r.length) { fail(`"${q}"`, "nessun risultato"); continue; }
      const top = r[0];
      const stop = r.find((m) => m.type === "STOP");
      if (q.startsWith("Firenze Santa") && stop) smnStop = stop;
      ok(`"${q}"`, `${top.name} (${top.type}) ${top.lat.toFixed(3)},${top.lon.toFixed(3)}${stop ? ` · prima fermata: ${stop.name}` : ""}`);
    } catch (e) { fail(`"${q}"`, e.message); }
  }

  log("\n## Percorsi con i mezzi (giorno feriale, partenza 08:00)");
  const time = nextWeekday8();
  const agencies = new Map();
  let sampleTrip = null;
  for (const [a, b] of ROUTES) {
    try {
      const p = await motis("plan", {
        fromPlace: PLACES[a].join(","), toPlace: PLACES[b].join(","), time,
        transitModes: "TRANSIT", directModes: "WALK", preTransitModes: "WALK", postTransitModes: "WALK",
        maxPreTransitTime: 1200, maxPostTransitTime: 1200, maxDirectTime: 3600, numItineraries: 5, language: "it", detailedTransfers: true
      });
      const its = p.itineraries || [];
      if (!its.length) { fail(`${a} → ${b}`, "nessun itinerario"); continue; }
      const best = its[0];
      const tl = best.legs.filter((l) => l.mode !== "WALK");
      for (const it of its) for (const l of it.legs) if (l.mode !== "WALK") agencies.set(l.agencyName || "?", (agencies.get(l.agencyName || "?") || 0) + 1);
      // i cambi a piedi tra fermate vicine possono non avere disegno: è normale
      const bad = its.flatMap((it) => it.legs).filter((l) => !l.legGeometry || (!l.legGeometry.points && l.mode !== "WALK") || !l.from || !l.to || !l.startTime);
      if (bad.length) {
        fail(`${a} → ${b}`, `${bad.length} tratte senza geometria o orari: ` + bad.slice(0, 3).map((l) => `${l.mode} ${l.from && l.from.name}→${l.to && l.to.name} geom=${l.legGeometry ? JSON.stringify(l.legGeometry).slice(0, 60) : "assente"}`).join(" | "));
        fs.writeFileSync("debug-bad-legs.json", JSON.stringify(bad.slice(0, 5), null, 1));
      }
      if (!sampleTrip) { const l = tl.find((x) => x.tripId); if (l) sampleTrip = l; }
      ok(`${a} → ${b}`, `${its.length} soluzioni; prima ${fmt(best.startTime)}–${fmt(best.endTime)}: ${tl.map((l) => `${l.mode} ${l.routeShortName || l.displayName || ""} (${l.agencyName || "?"})`).join(" + ") || "a piedi"}`);
    } catch (e) { fail(`${a} → ${b}`, e.message); }
  }
  log(`\nAziende viste nelle soluzioni: ${[...agencies].map(([k, v]) => `${k} (${v})`).join(", ") || "nessuna"}`);
  if (![...agencies.keys()].some((k) => /autolinee|toscane|\bat\b/i.test(k))) fail("Bus Autolinee Toscane", "nessuna tratta AT trovata nei percorsi provati");
  else ok("Bus Autolinee Toscane presenti");

  log("\n## Partenze da una fermata");
  try {
    if (!smnStop) throw new Error("fermata SMN non trovata dalla ricerca");
    const r = await motis("stoptimes", { stopId: smnStop.id, n: 10, time, language: "it" });
    const st = r.stopTimes || [];
    const now = await motis("stoptimes", { stopId: smnStop.id, n: 15, time: new Date().toISOString(), language: "it" });
    const slim = (x) => ({ dep: x.place.departure, sched: x.place.scheduledDeparture, stopId: x.place.stopId, stop: x.place.name, route: x.routeShortName, headsign: x.headsign, tripId: x.tripId, agency: x.agencyName, realTime: x.realTime, looped: x.loopedCalendarSince, source: x.source });
    fs.writeFileSync("debug-stoptimes.json", JSON.stringify({ requested08: time, stopId: smnStop.id, at08: st.map(slim), requestedNow: new Date().toISOString(), now: (now.stopTimes || []).map(slim) }, null, 1));
    if (!st.length) fail(`Partenze da ${smnStop.name}`, "lista vuota");
    else ok(`Partenze da ${smnStop.name}`, st.slice(0, 5).map((s) => `${fmt(s.place.departure || s.place.arrival)} ${s.routeShortName || s.displayName || s.mode} → ${s.headsign}`).join(" · "));
  } catch (e) { fail("Partenze", e.message); }

  log("\n## Corsa intera");
  try {
    if (!sampleTrip) throw new Error("nessuna corsa da provare");
    const t = await motis("trip", { tripId: sampleTrip.tripId, language: "it" });
    const l = (t.legs || [])[0];
    const n = l ? 2 + (l.intermediateStops || []).length : 0;
    if (!l || !l.legGeometry) fail("Corsa", "risposta senza tratte");
    else ok(`Corsa ${sampleTrip.routeShortName || sampleTrip.displayName || ""}`, `${n} fermate, da ${l.from.name} a ${l.to.name}`);
  } catch (e) { fail("Corsa", e.message); }

  log("\n## Fermate sulla mappa (zona Duomo)");
  try {
    const s = await motis("map/stops", { min: "43.768,11.248", max: "43.778,11.264" });
    if (!s.length) fail("Fermate in zona Duomo", "nessuna");
    else ok("Fermate in zona Duomo", `${s.length} fermate, es. ${s.slice(0, 3).map((x) => x.name).join(", ")}`);
  } catch (e) { fail("Fermate sulla mappa", e.message); }

  log("\n## Auto e a piedi (OSRM FOSSGIS)");
  for (const [prof, label] of [["routed-car", "Auto"], ["routed-foot", "A piedi"]]) {
    const [a, b] = prof === "routed-car" ? ["Firenze SMN", "Greve in Chianti"] : ["Firenze SMN", "Sesto Fiorentino"];
    try {
      const u = `${OSRM}/${prof}/route/v1/driving/${PLACES[a][1]},${PLACES[a][0]};${PLACES[b][1]},${PLACES[b][0]}?overview=full&geometries=polyline6&steps=true&alternatives=true`;
      const res = await fetch(u, { headers: HEADERS });
      const j = await res.json();
      if (j.code !== "Ok") throw new Error(j.code || res.status);
      const r = j.routes[0];
      ok(`${label}: ${a} → ${b}`, `${Math.round(r.duration / 60)} min, ${(r.distance / 1000).toFixed(1)} km, ${r.legs[0].steps.length} indicazioni, ${j.routes.length} alternative`);
    } catch (e) { fail(`${label}: ${a} → ${b}`, e.message); }
  }

  log("\n## Bici (OSRM FOSSGIS)");
  try {
    const [a, b] = [PLACES["Firenze SMN"], PLACES["Sesto Fiorentino"]];
    const res = await fetch(`${OSRM}/routed-bike/route/v1/driving/${a[1]},${a[0]};${b[1]},${b[0]}?overview=full&geometries=polyline6&steps=true`, { headers: HEADERS });
    const j = await res.json();
    if (j.code !== "Ok") throw new Error(j.code || res.status);
    ok("Bici: Firenze SMN → Sesto Fiorentino", `${Math.round(j.routes[0].duration / 60)} min, ${(j.routes[0].distance / 1000).toFixed(1)} km`);
  } catch (e) { fail("Bici", e.message); }

  log("\n## Bici e monopattini in sharing");
  try {
    const r = await motis("rentals", { min: "43.70,11.15", max: "43.85,11.35", withProviders: true, withStations: true, withVehicles: true });
    const names = (r.providers || []).map((x) => x.name);
    ok("Sharing nell'area di Firenze", names.length ? `${names.join(", ")} · ${(r.stations || []).length} stazioni, ${(r.vehicles || []).length} mezzi` : "nessun servizio con dati (l'app non mostra nulla e cerca senza sharing)");
  } catch (e) { fail("Sharing (rentals)", e.message); }
  try {
    const p = await motis("plan", { fromPlace: PLACES["Firenze SMN"].join(","), toPlace: PLACES["Sesto Fiorentino"].join(","), time,
      transitModes: "TRANSIT", directModes: "WALK,RENTAL", preTransitModes: "WALK,RENTAL", postTransitModes: "WALK,RENTAL", numItineraries: 3, language: "it" });
    const rentLegs = (p.itineraries || []).flatMap((it) => it.legs).filter((l) => l.mode === "RENTAL").length;
    ok("Ricerca con sharing accettata dal servizio", `${(p.itineraries || []).length} soluzioni, ${rentLegs} tratte in sharing`);
  } catch (e) { fail("Ricerca con sharing", e.message); }

  log(`\nVersioni API usate: ${Object.entries(used).map(([k, v]) => `${k} v${v}`).join(", ")}`);
  log(`\n**Esito: ${failures ? failures + " controlli falliti" : "tutto ok"}**`);
  const md = lines.join("\n") + "\n";
  fs.writeFileSync("live-report.md", md);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
