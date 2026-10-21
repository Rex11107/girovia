// Mappa: fornitori di tile, segnaposti, fermate, posizione, disegno dei percorsi.

import { showDepartures } from "./views.js";
import { motis } from "./api.js";
import { $, ICONS, cssVar, modeColor, toast } from "./ui.js";
import { blurInputs, hideSugg, isFav, setPlace, toggleFav } from "./places.js";
import { areaLabel, decodePolyline, distM, esc, fmtTime, isTransitLeg, placeLabel, rentalLabel, streetKind } from "./util.js";
import { CFG, state, store } from "./state.js";

// ---------- Mappa ----------
export const map = L.map("map", { zoomControl: false, attributionControl: true }).setView(CFG.center || [43.7731, 11.256], CFG.zoom || 12);
// Tile: fornitori in ordine di preferenza (config.js); se uno smette di rispondere si passa al successivo
const DATA_ATTR = ' · Orari <a href="https://transitous.org/sources/" target="_blank" rel="noopener">Transitous e fonti</a> · Strade <a href="https://routing.openstreetmap.de/about.html" target="_blank" rel="noopener">FOSSGIS</a>';
const PROVIDERS = Array.isArray(CFG.tileProviders) && CFG.tileProviders.length ? CFG.tileProviders
  : [{ name: "OpenStreetMap", url: CFG.tiles || "https://tile.openstreetmap.org/{z}/{x}/{y}.png", maxZoom: 19, attribution: "© OpenStreetMap" }];
let tileLayer = null, tileIdx = 0, tileErrors = 0, tileOk = 0;
function useProvider(i) {
  tileIdx = i; tileErrors = 0; tileOk = 0;
  const p = PROVIDERS[i];
  if (tileLayer) map.removeLayer(tileLayer);
  tileLayer = L.tileLayer(p.url, { maxZoom: p.maxZoom || 19, subdomains: p.subdomains || "abc", crossOrigin: "anonymous", attribution: (p.attribution || "") + DATA_ATTR }).addTo(map);
  tileLayer.on("tileload", () => { tileOk++; });
  tileLayer.on("tileerror", () => {
    tileErrors++;
    // Molti errori e nessuna tile riuscita: il fornitore non risponde (offline escluso)
    if (navigator.onLine !== false && tileErrors >= 8 && tileOk < 2 && tileIdx + 1 < PROVIDERS.length) {
      useProvider(tileIdx + 1); toast("Mappa: uso " + PROVIDERS[tileIdx].name);
    }
  });
}
export const routeLayer = L.layerGroup().addTo(map);
const stopsLayer = L.layerGroup().addTo(map);
const rentalsLayer = L.layerGroup().addTo(map);
const pinLayer = L.layerGroup().addTo(map);
let meMarker = null;

const pinIcon = (cls) => L.divIcon({ className: "", html: `<div class="pin ${cls}"></div>`, iconSize: [18, 18], iconAnchor: [9, 9] });
export function drawPins() {
  pinLayer.clearLayers();
  if (state.from) L.marker([state.from.lat, state.from.lon], { icon: pinIcon("from"), keyboard: false }).addTo(pinLayer);
  if (state.to) L.marker([state.to.lat, state.to.lon], { icon: pinIcon("to"), keyboard: false }).addTo(pinLayer);
}
function sheetPx() { return $("#sheet").getBoundingClientRect().height; }
export function fit(latlngs) {
  if (!latlngs.length) return;
  const topH = $("#top").getBoundingClientRect().height;
  map.fitBounds(L.latLngBounds(latlngs), { paddingTopLeft: [30, topH + 20], paddingBottomRight: [30, sheetPx() + 20], maxZoom: 17 });
}

function popupHtml(p) {
  return `<b>${esc(p.name)}</b>${p.sub ? `<div class="muted small">${esc(p.sub)}</div>` : ""}<div class="popbtns"><button class="btn small primary" data-pop="from">Parti da qui</button><button class="btn small" data-pop="to">Arriva qui</button><button class="btn small" data-pop="fav" aria-label="Preferito">${isFav(p) ? "★" : "☆"}</button></div>`;
}
function bindPopup(pop, p) {
  setTimeout(() => {
    const el = pop.getElement(); if (!el) return;
    el.querySelectorAll("[data-pop]").forEach((b) => b.onclick = () => {
      if (b.dataset.pop === "fav") { b.textContent = toggleFav(p) ? "★" : "☆"; return; }
      map.closePopup(); setPlace(b.dataset.pop, { ...p });
    });
  }, 0);
}

// Fermate visibili sulla mappa quando lo zoom è alto
let stopsAbort = null, stopsTimer = null;
const STOP_ICON = L.divIcon({ className: "stopdot", html: "", iconSize: [16, 16], iconAnchor: [8, 8] });
let visibleStops = [];
// Pulsante "Fermate qui": elenco delle fermate visibili, alternativa ai punti sulla mappa
function updateStopsButton() {
  const b = $("#stopsBtn"); if (!b) return;
  b.hidden = !visibleStops.length || document.body.classList.contains("navigating");
  b.textContent = `Fermate qui · ${visibleStops.length}`;
}
export function nearbyStops() {
  const c = map.getCenter(); const here = [c.lat, c.lng];
  return visibleStops.map((s) => ({ ...s, d: distM(here, [s.lat, s.lon]) })).sort((a, b) => a.d - b.d);
}
// Bici e monopattini in sharing nella zona visibile (se il servizio pubblica i dati e l'opzione è attiva)
const RENT_ICON = (kind) => L.divIcon({ className: "rentdot", html: kind === "SCOOTER" ? ICONS.SCOOTER : ICONS.BIKE, iconSize: [22, 22], iconAnchor: [11, 11] });
async function loadRentals(b) {
  rentalsLayer.clearLayers();
  if (store("sharing") === false) return;
  try {
    const r = await motis("rentals", { min: `${b.getSouth()},${b.getWest()}`, max: `${b.getNorth()},${b.getEast()}`, withProviders: true, withStations: true, withVehicles: true, withZones: false }, stopsAbort && stopsAbort.signal);
    const prov = Object.fromEntries((r.providers || []).map((x) => [x.id, x]));
    const items = [
      ...(r.stations || []).filter((s) => s.isRenting !== false && s.numVehiclesAvailable > 0).map((s) => ({ lat: s.lat, lon: s.lon, ff: (s.formFactors || [])[0], p: prov[s.providerId], label: `${s.name} · ${s.numVehiclesAvailable} disponibili`, url: s.rentalUriWeb })),
      ...(r.vehicles || []).filter((v) => !v.stationId && !v.isReserved && !v.isDisabled).map((v) => ({ lat: v.lat, lon: v.lon, ff: v.formFactor, p: prov[v.providerId], label: "", url: v.rentalUriWeb }))
    ].slice(0, 300);
    for (const it of items) {
      const kind = /SCOOTER|MOPED/.test(it.ff || "") ? "SCOOTER" : "BIKE";
      const what = rentalLabel({ formFactor: it.ff, systemName: it.p && it.p.name });
      const url = [it.url, it.p && it.p.url].find((u) => typeof u === "string" && /^https:\/\//.test(u));
      const html = `<b>${esc(what.charAt(0).toUpperCase() + what.slice(1))}</b>${it.label ? `<div class="muted small">${esc(it.label)}</div>` : ""}${url ? `<div class="popbtns"><a class="btn small" href="${esc(url)}" target="_blank" rel="noopener">Apri il servizio</a></div>` : ""}`;
      const m = L.marker([it.lat, it.lon], { icon: RENT_ICON(kind), keyboard: true, title: what }).bindPopup(html).addTo(rentalsLayer);
      const el = m.getElement(); if (el) el.setAttribute("aria-label", `${what}: dettagli`);
    }
  } catch (e) { /* nessun dato di sharing in questa zona */ }
}

async function loadStops() {
  if (map.getZoom() < 16) { stopsLayer.clearLayers(); rentalsLayer.clearLayers(); visibleStops = []; updateStopsButton(); return; }
  if (stopsAbort) stopsAbort.abort(); stopsAbort = new AbortController();
  const b = map.getBounds();
  try {
    const stops = await motis("map/stops", { min: `${b.getSouth()},${b.getWest()}`, max: `${b.getNorth()},${b.getEast()}` }, stopsAbort.signal);
    stopsLayer.clearLayers();
    visibleStops = [];
    (stops || []).slice(0, 400).forEach((s) => {
      if (!s.stopId) return;
      const stop = { id: s.stopId, name: s.name, lat: s.lat, lon: s.lon, type: "STOP", modes: s.modes };
      visibleStops.push(stop);
      // Segnaposto raggiungibile con il tasto Tab e attivabile con Invio (Leaflet keyboard: true)
      const m = L.marker([s.lat, s.lon], { icon: STOP_ICON, keyboard: true, title: s.name, riseOnHover: true })
        .on("click", (ev) => { L.DomEvent.stop(ev); showDepartures(stop); })
        // Leaflet collega Invio solo ai segnaposti con popup: qui Invio e Spazio aprono le partenze
        .on("keydown", (ev) => { const k = ev.originalEvent; if (k.key === "Enter" || k.key === " ") { k.preventDefault(); showDepartures(stop); } })
        .addTo(stopsLayer);
      const el = m.getElement();
      if (el) el.setAttribute("aria-label", `Fermata ${s.name}: mostra le partenze`);
    });
    updateStopsButton();
    loadRentals(b);
  } catch (e) { if (e.name !== "AbortError") { stopsLayer.clearLayers(); visibleStops = []; updateStopsButton(); } }
}

// ---------- Posizione ----------
export function locate(thenUse) {
  if (!navigator.geolocation) { toast("Il browser non permette di leggere la posizione."); return; }
  navigator.geolocation.getCurrentPosition((pos) => {
    state.me = { lat: pos.coords.latitude, lon: pos.coords.longitude, name: "La mia posizione", type: "ME" };
    if (meMarker) meMarker.remove();
    meMarker = L.marker([state.me.lat, state.me.lon], { icon: L.divIcon({ className: "", html: '<div class="me"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }), keyboard: false }).addTo(map);
    if (thenUse) setPlace(thenUse, { ...state.me });
    else map.setView([state.me.lat, state.me.lon], Math.max(map.getZoom(), 16));
  }, (err) => {
    toast(err.code === 1 ? "Permesso di posizione negato. Puoi attivarlo dalle impostazioni del browser." : "Posizione non disponibile in questo momento.");
  }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 });
}

export function showMe(p) {
  if (!meMarker) meMarker = L.marker(p, { icon: L.divIcon({ className: "", html: '<div class="me"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }), keyboard: false, zIndexOffset: 1000 }).addTo(map);
  else meMarker.setLatLng(p);
}

export function drawItin(it, light) {
  routeLayer.clearLayers();
  const pts = [];
  const casing = cssVar("--surface") || "#fff";
  if (it.kind === "road") {
    const col = modeColor(it.mode);
    L.polyline(it.geometry, { color: casing, weight: 9, opacity: light ? 0.6 : 0.9 }).addTo(routeLayer);
    L.polyline(it.geometry, { color: col, weight: 6, opacity: light ? 0.7 : 1, dashArray: it.mode === "WALK" ? "2 9" : null, lineCap: "round" }).addTo(routeLayer);
    pts.push(...it.geometry);
  } else {
    for (const l of it.legs || []) {
      const g = decodePolyline(l.legGeometry.points, l.legGeometry.precision); pts.push(...g);
      if (!isTransitLeg(l)) {
        L.polyline(g, { color: modeColor(streetKind(l)), weight: 5, dashArray: l.mode === "WALK" ? "2 9" : null, lineCap: "round", opacity: light ? 0.7 : 1 }).addTo(routeLayer);
      } else {
        const col = l.routeColor ? "#" + l.routeColor : cssVar("--transit");
        L.polyline(g, { color: casing, weight: 10, opacity: light ? 0.6 : 0.9 }).addTo(routeLayer);
        L.polyline(g, { color: col, weight: 6, opacity: light ? 0.75 : 1 }).addTo(routeLayer);
        [l.from, l.to].forEach((s) => L.circleMarker([s.lat, s.lon], { radius: 6, color: col, weight: 3, fillColor: casing, fillOpacity: 1 }).bindTooltip(s.name).addTo(routeLayer));
        if (!light) (l.intermediateStops || []).forEach((s) => L.circleMarker([s.lat, s.lon], { radius: 3.5, color: col, weight: 2, fillColor: casing, fillOpacity: 1 }).bindTooltip(`${s.name} · ${fmtTime(s.arrival || s.departure)}`).addTo(routeLayer));
      }
    }
  }
  fit(pts);
}

export function initMap() {
  useProvider(0);
  map.attributionControl.setPrefix(false);
  // Tocco sulla mappa: scegli un punto come partenza o arrivo
  map.on("click", async (e) => {
    hideSugg(); blurInputs();
    const p = { lat: e.latlng.lat, lon: e.latlng.lng, name: "Punto sulla mappa", type: "POINT" };
    const pop = L.popup({ closeButton: true, autoPanPaddingTopLeft: [20, 230], autoPanPaddingBottomRight: [20, 40] }).setLatLng(e.latlng).setContent(popupHtml(p)).openOn(map);
    bindPopup(pop, p);
    try {
      const r = await motis("reverse-geocode", { place: `${p.lat},${p.lon}`, numResults: 1 });
      if (r && r[0]) { p.name = placeLabel(r[0]); p.sub = areaLabel(r[0]); pop.setContent(popupHtml(p)); bindPopup(pop, p); }
    } catch (err) { /* resta "Punto sulla mappa" */ }
  });
  map.on("moveend", () => { clearTimeout(stopsTimer); stopsTimer = setTimeout(loadStops, 350); });
  $("#locate").onclick = () => locate(state.from ? null : "from");
}
