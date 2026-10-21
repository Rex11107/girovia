/* Girovia: mezzi pubblici, auto e piedi. Nessuna pubblicità, nessun tracciamento.
   Dati: Transitous (orari GTFS ufficiali), OpenStreetMap, OSRM (FOSSGIS).
   Avvio: collega i moduli, aggiornamento automatico, rete, tasto Indietro. */

import { initNav, refreshTrip, reroute, speak, stopNav, summary } from "./nav.js";
import { homeView, showDepartures, showItin, showResults } from "./views.js";
import { drawPins, initMap, locate, map, routeLayer } from "./map.js";
import { decodePolyline, fmtDist, fmtDur, makeLine, osrmText, prettyName, projectOn, spokenDist } from "./util.js";
import { blurInputs, hideSugg, initPlaces, syncInputs } from "./places.js";
import { $, SNAP, initSheet, setSheet, toast, view } from "./ui.js";
import { NAV, state, store } from "./state.js";

// ---------- Aggiornamento automatico ----------
function tick(force) {
  if (document.hidden && !force) return;
  if (navigator.onLine === false) return;
  if (state.viewKind === "departures" && state.depStop && (force || Date.now() - (state.depAt || 0) >= 30000)) showDepartures(state.depStop, true);
  refreshTrip(force);
}

// ---------- Rete: avvisi quando va e viene ----------
function netChanged() {
  const off = navigator.onLine === false;
  $("#net").hidden = !off;
  document.body.classList.toggle("offline", off);
  return off;
}

// Service worker: l'app si apre anche senza rete (non serve nell'app Android, che ha già i file dentro)
const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

// ---------- Avvio ----------
initSheet(); initMap(); initPlaces(); initNav();
setInterval(tick, 15000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) tick(); });
window.addEventListener("offline", () => {
  netChanged();
  if (NAV.active) { speak("Connessione persa. Continuo con il percorso già scaricato"); summary("Offline · percorso già scaricato"); }
});
window.addEventListener("online", () => {
  netChanged(); toast("Di nuovo online");
  if (NAV.active) { speak("Connessione tornata"); if (NAV.kind === "road" && NAV.off >= 3 && NAV.pos) reroute(NAV.pos); }
});
netChanged();
if ("serviceWorker" in navigator && window.isSecureContext && !isNative && !/[?&]nosw\b/.test(location.search)) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
const savedMode = store("mode");
if (savedMode && savedMode !== "TRANSIT") { const b = document.querySelector(`[data-mode="${savedMode}"]`); if (b) b.click(); }
homeView();
// Mostra la posizione solo se il permesso è già stato dato in passato (nessuna richiesta all'avvio)
if (navigator.permissions && navigator.permissions.query) navigator.permissions.query({ name: "geolocation" }).then((p) => { if (p.state === "granted") locate(); }).catch(() => {});
window.addEventListener("resize", () => { const h = $("#sheet").getBoundingClientRect().height, s = SNAP(); let best = 0; s.forEach((v, i) => { if (Math.abs(v - h) < Math.abs(s[best] - h)) best = i; }); setSheet(best); });

// App Android: il tasto Indietro del telefono torna alla schermata precedente invece di chiudere l'app
const capApp = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
if (capApp && capApp.addListener) {
  capApp.addListener("backButton", () => {
    if (NAV.active) { stopNav(); return; }
    if (!$("#sugg").hidden) { hideSugg(); blurInputs(); return; }
    if (map._popup && map.hasLayer(map._popup)) { map.closePopup(); return; }
    if (!$("#back").hidden) { $("#back").click(); return; }
    if (state.viewKind !== "home") { state.from = null; state.to = null; syncInputs(); drawPins(); routeLayer.clearLayers(); homeView(); return; }
    capApp.exitApp();
  });
}

// Per i test
window.__girovia = { map, NAV, tick, projectOn, makeLine, spokenDist, prettyName, decodePolyline, osrmText, fmtDur, fmtDist, state, showResults, showItin, view };
