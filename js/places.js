// Ricerca dei luoghi, partenza e arrivo, preferiti e viaggi salvati, mezzo e orario.

import { state, store } from "./state.js";
import { motis } from "./api.js";
import { homeView, maybeSearch, showDepartures } from "./views.js";
import { drawPins, locate, map, routeLayer } from "./map.js";
import { areaLabel, esc, placeLabel, prettyName, samePlace, stopModes } from "./util.js";
import { $, ICONS, toast } from "./ui.js";

let geoAbort = null, geoTimer = null;
function onType(field) {
  const input = $("#" + field);
  $(`[data-clear="${field}"]`).hidden = !input.value;
  clearTimeout(geoTimer);
  const q = input.value.trim();
  if (q.length < 2) { showSuggDefaults(field); return; }
  const box = $("#sugg");
  if (!box.querySelector("[data-searching]")) { box.innerHTML = '<div class="empty" data-searching style="padding:12px">Cerco…</div>'; box.hidden = false; }
  geoTimer = setTimeout(async () => {
    if (geoAbort) geoAbort.abort(); geoAbort = new AbortController();
    const c = map.getCenter();
    try {
      const res = await motis("geocode", { text: q, language: "it", place: `${c.lat},${c.lng}`, placeBias: 1.5, numResults: 8 }, geoAbort.signal);
      if (state.activeField !== field) return;
      renderSugg(field, (res || []).map((m) => ({ id: m.type === "STOP" ? m.id : undefined, lat: m.lat, lon: m.lon, name: placeLabel(m), sub: [stopModes(m.modes), areaLabel(m)].filter(Boolean).join(" · "), type: m.type })));
    } catch (e) { if (e.name !== "AbortError") renderSugg(field, [], e.message); }
  }, 280);
}
function showSuggDefaults(field) {
  const items = state.pickFor ? [] : [{ name: "La mia posizione", type: "ME", sub: "Usa il GPS" }];
  const f = favs();
  if (!state.pickFor) {
    if (f.home) items.push({ ...f.home, icon: "HOME", sub: "Casa" });
    if (f.work) items.push({ ...f.work, icon: "WORK", sub: "Lavoro" });
    f.list.forEach((x) => items.push({ ...x, icon: "FAV" }));
  }
  (store("recent") || []).forEach((r) => { if (!items.some((x) => samePlace(x, r))) items.push({ ...r, name: prettyName(r.name), recent: true }); });
  if (!items.length) { $("#sugg").hidden = true; return; }
  renderSugg(field, items);
}
function renderSugg(field, items, error) {
  const box = $("#sugg");
  if (!items.length) { box.innerHTML = `<div class="empty" style="padding:12px">${esc(error || "Nessun risultato. Prova con il nome del comune, della via o della fermata.")}</div>`; box.hidden = false; return; }
  box.innerHTML = items.map((it, i) => `<button type="button" data-i="${i}"><span class="sicon">${ICONS[it.icon || (it.recent ? "RECENT" : it.type)] || ICONS.ADDRESS}</span><span class="stext"><b>${esc(it.name)}</b>${it.sub ? `<small>${it.type === "STOP" ? "Fermata · " : ""}${esc(it.sub)}</small>` : (it.type === "STOP" ? "<small>Fermata</small>" : "")}</span></button>`).join("");
  box.hidden = false;
  box.querySelectorAll("button").forEach((b) => {
    b.addEventListener("pointerdown", (e) => e.preventDefault()); // non togliere il focus prima del click
    b.onclick = () => {
      const it = items[+b.dataset.i];
      hideSugg(); blurInputs();
      if (it.type === "ME") { locate(field); return; }
      const p = { ...it }; delete p.recent; delete p.icon; setPlace(field, p);
    };
  });
}
export function hideSugg() { $("#sugg").hidden = true; }
export function blurInputs() { $("#from").blur(); $("#to").blur(); }

export function syncInputs() {
  for (const f of ["from", "to"]) { $("#" + f).value = state[f] ? state[f].name : ""; $(`[data-clear="${f}"]`).hidden = !state[f]; }
}

// Preferiti: Casa, Lavoro e altri luoghi; viaggi salvati (partenza, arrivo, mezzo)
const slim = (p) => ({ id: p.id, lat: p.lat, lon: p.lon, name: p.name, sub: p.sub, type: p.type === "ME" ? "POINT" : p.type });
export function favs() { const f = store("favs") || {}; return { home: f.home || null, work: f.work || null, list: Array.isArray(f.list) ? f.list : [] }; }
export function isFav(p) { const f = favs(); return f.list.some((x) => samePlace(x, p)); }
export function toggleFav(p) {
  const f = favs();
  if (isFav(p)) { f.list = f.list.filter((x) => !samePlace(x, p)); toast("Tolto dai preferiti"); }
  else { f.list.unshift(slim(p)); toast("Aggiunto ai preferiti"); }
  store("favs", f); return isFav(p);
}
export const trips = () => (Array.isArray(store("trips")) ? store("trips") : []);
export const sameTrip = (t) => samePlace(t.from, state.from) && samePlace(t.to, state.to) && t.mode === state.mode;
export function toggleTrip() {
  let list = trips();
  if (list.some(sameTrip)) { list = list.filter((t) => !sameTrip(t)); toast("Viaggio tolto dai salvati"); }
  else { list.unshift({ from: slim(state.from), to: slim(state.to), mode: state.mode }); toast("Viaggio salvato"); }
  store("trips", list.slice(0, 30)); return list.some(sameTrip);
}

function remember(p) {
  if (p.type === "ME" || p.type === "POINT") return;
  const list = (store("recent") || []).filter((r) => !(Math.abs(r.lat - p.lat) < 1e-5 && Math.abs(r.lon - p.lon) < 1e-5));
  list.unshift({ id: p.id, lat: p.lat, lon: p.lon, name: p.name, sub: p.sub, type: p.type });
  store("recent", list.slice(0, 8));
}
export function setPlace(field, p) {
  if (state.pickFor) {
    const f = favs(); f[state.pickFor] = slim(p); store("favs", f);
    toast(state.pickFor === "home" ? "Casa salvata" : "Lavoro salvato");
    state.pickFor = null; $("#to").placeholder = "Arrivo";
    state.to = null; syncInputs(); homeView("fav"); return;
  }
  state[field] = p; remember(p); syncInputs(); drawPins();
  if (state.from && state.to) { maybeSearch(); return; }
  // Solo una fermata scelta: mostra subito le partenze
  if (p.type === "STOP" && p.id) { showDepartures(p); return; }
  map.setView([p.lat, p.lon], Math.max(map.getZoom(), 15));
  $(field === "from" ? "#to" : "#from").focus();
}

export function chosenTime() {
  const m = $("#whenMode").value;
  if (m === "now" || !$("#whenTime").value) return { time: new Date().toISOString(), arriveBy: false };
  return { time: new Date($("#whenTime").value).toISOString(), arriveBy: m === "arrive" };
}

export function initPlaces() {
  $("#search").addEventListener("submit", (e) => e.preventDefault());
  ["from", "to"].forEach((f) => {
    const input = $("#" + f);
    input.addEventListener("focus", () => { state.activeField = f; input.select(); if (input.value.trim().length < 2 || state[f]) showSuggDefaults(f); });
    input.addEventListener("input", () => { state[f] = null; onType(f); });
    input.addEventListener("blur", () => setTimeout(() => { if (document.activeElement !== $("#from") && document.activeElement !== $("#to")) { hideSugg(); if (state[f]) input.value = state[f].name; } }, 150));
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { const first = $("#sugg button"); if (first) first.click(); } });
  });
  document.querySelectorAll("[data-clear]").forEach((b) => b.onclick = () => {
    const f = b.dataset.clear; state[f] = null; $("#" + f).value = ""; b.hidden = true; drawPins(); routeLayer.clearLayers();
    if (state.viewKind !== "home") homeView(); // torna alle schede (recenti, viaggi, preferiti)
    $("#" + f).focus();
  });
  $("#swap").onclick = () => { [state.from, state.to] = [state.to, state.from]; syncInputs(); drawPins(); maybeSearch(); };
  // Mezzo e orario
  document.querySelectorAll("[data-mode]").forEach((b) => b.onclick = () => {
    state.mode = b.dataset.mode;
    document.querySelectorAll("[data-mode]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    $("#whenMode").parentElement.hidden = state.mode !== "TRANSIT";
    store("mode", state.mode);
    maybeSearch();
  });
  $("#whenMode").onchange = () => {
    const t = $("#whenTime");
    t.hidden = $("#whenMode").value === "now";
    if (!t.hidden && !t.value) { const d = new Date(Date.now() + 15 * 60000); d.setSeconds(0, 0); t.value = new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
    maybeSearch();
  };
  $("#whenTime").onchange = maybeSearch;
}
