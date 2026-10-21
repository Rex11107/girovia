// Schermate del pannello: iniziale, risultati, dettaglio, corsa intera, partenze.

import { startRoadNav, startTripNav } from "./nav.js";
import { motis, roadRoutes } from "./api.js";
import { drawItin, drawPins, fit, locate, map, nearbyStops, routeLayer } from "./map.js";
import { collectAlerts, dayLabel, decodePolyline, delayMin, esc, fmtDay, fmtDist, fmtDur, fmtTime, itinAlerts, legAlerts, minutesUntil, modeName, motisSteps, placeParam, prettyName, sameDay, stopModes } from "./util.js";
import { blurInputs, chosenTime, favs, hideSugg, isFav, sameTrip, setPlace, syncInputs, toggleFav, toggleTrip, trips } from "./places.js";
import { $, ICONS, TRASH, WARN_ICON, alertsHtml, applyTheme, cssVar, errorBox, getTheme, legChip, loading, modeIcon, pushCurrent, view } from "./ui.js";
import { CFG, state, store } from "./state.js";

// Schermata iniziale divisa in schede: Recenti, Viaggi salvati, Preferiti, Info
const TABS = [["recent", "Recenti"], ["trips", "Viaggi"], ["fav", "Preferiti"], ["info", "Info"]];
const MODE_LABEL = { TRANSIT: "Mezzi", CAR: "Auto", WALK: "A piedi" };
const row = (attrs, icon, title, sub, del) => `<div class="rowitem"><button class="recent" ${attrs}><span class="sicon">${icon}</span><span class="stext"><b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ""}</span></button>${del ? `<button class="iconbtn" ${del} aria-label="Elimina">${TRASH}</button>` : ""}</div>`;
export function homeView(tab) {
  tab = TABS.some(([k]) => k === tab) ? tab : (store("homeTab") || "recent");
  store("homeTab", tab);
  const rec = store("recent") || [], tr = trips(), f = favs();
  let body = "";
  if (tab === "recent") {
    body = rec.length ? rec.map((r, i) => row(`data-r="${i}"`, ICONS[r.type] || ICONS.RECENT, prettyName(r.name), r.sub, "")).join("") +
      '<button class="btn small" data-clear-recent style="margin-top:10px">Cancella cronologia</button>'
      : '<p class="empty">Qui compariranno i luoghi che cerchi.</p>';
  } else if (tab === "trips") {
    body = tr.length ? tr.map((t, i) => row(`data-t="${i}"`, ICONS.TRIP, `${prettyName(t.from.name)} → ${prettyName(t.to.name)}`, MODE_LABEL[t.mode] || "", `data-del-t="${i}"`)).join("")
      : '<p class="empty">Salva un viaggio dai risultati con ☆ per ritrovarlo qui con un tocco.</p>';
  } else if (tab === "fav") {
    body = row('data-f="home"', ICONS.HOME, "Casa", f.home ? prettyName(f.home.name) : "Tocca per impostarla", f.home ? 'data-del-f="home"' : "") +
      row('data-f="work"', ICONS.WORK, "Lavoro", f.work ? prettyName(f.work.name) : "Tocca per impostarlo", f.work ? 'data-del-f="work"' : "") +
      f.list.map((x, i) => row(`data-f="${i}"`, ICONS.FAV, prettyName(x.name), x.sub, `data-del-f="${i}"`)).join("") +
      (f.list.length ? "" : '<p class="empty small">Aggiungi altri luoghi con ☆ dal popup sulla mappa o dalla pagina di una fermata.</p>');
  } else {
    const th = getTheme();
    body = `<div class="label" id="lblTema" style="margin-top:4px">Tema</div>
      <div class="tabs" role="radiogroup" aria-labelledby="lblTema" style="margin-bottom:14px">${[["auto", "Automatico"], ["light", "Chiaro"], ["dark", "Scuro"]].map(([k, l]) => `<button type="button" role="radio" aria-checked="${k === th}" data-theme-set="${k}">${l}</button>`).join("")}</div>
      <div class="label">Dati e privacy</div>
      <p class="small" style="margin:0 0 8px">Orari ufficiali GTFS di Autolinee Toscane, Trenitalia e tramvia tramite Transitous. Mappa e strade da OpenStreetMap, percorsi in auto e a piedi da OSRM (FOSSGIS).</p>
      <p class="small muted" style="margin:0 0 8px">I bus AT non hanno dati in tempo reale: vedi gli orari programmati. I tempi in auto non tengono conto del traffico.</p>
      <p class="small muted" style="margin:0 0 8px">Nessun account, nessuna pubblicità, nessun tracciamento. Cronologia, preferiti e viaggi salvati restano solo su questo telefono.</p>
      <p class="small" style="margin:0 0 8px"><a href="privacy.html" style="color:var(--accent);font-weight:700">Privacy: quali dati usa Girovia e a chi li invia</a></p>
      ${CFG.contact ? `<p class="small muted" style="margin:0">Progetto e contatti: <a href="${esc(CFG.contact)}" target="_blank" rel="noopener" style="color:var(--accent)">${esc(CFG.contact.replace(/^https?:\/\//, ""))}</a></p>` : ""}`;
  }
  const tabs = `<div class="tabs" role="tablist" aria-label="Sezioni">${TABS.map(([k, l]) => `<button type="button" role="tab" aria-selected="${k === tab}" data-tab="${k}">${l}</button>`).join("")}</div>`;
  view("Dove vuoi andare?", tabs + `<div class="tabpanel" role="tabpanel">${body}</div>`, { root: true, level: state.viewKind === "home" ? null : 0, kind: "home", bind: (root) => {
    root.querySelectorAll("[data-tab]").forEach((b) => b.onclick = () => homeView(b.dataset.tab));
    root.querySelectorAll("[data-theme-set]").forEach((b) => b.onclick = () => {
      applyTheme(b.dataset.themeSet);
      root.querySelectorAll("[data-theme-set]").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
    });
    root.querySelectorAll("[data-r]").forEach((b) => b.onclick = () => {
      const r = { ...rec[+b.dataset.r], name: prettyName(rec[+b.dataset.r].name) };
      if (r.type === "STOP" && r.id && !state.from) { showDepartures(r); return; }
      setPlace(state.from ? "to" : "from", r);
    });
    const cr = root.querySelector("[data-clear-recent]"); if (cr) cr.onclick = () => { store("recent", []); homeView("recent"); };
    root.querySelectorAll("[data-t]").forEach((b) => b.onclick = () => {
      const t = tr[+b.dataset.t];
      state.from = { ...t.from }; state.to = { ...t.to };
      const mb = document.querySelector(`[data-mode="${t.mode}"]`);
      syncInputs(); drawPins();
      if (mb && state.mode !== t.mode) mb.click(); else search();
    });
    root.querySelectorAll("[data-del-t]").forEach((b) => b.onclick = () => { const l = trips(); l.splice(+b.dataset.delT, 1); store("trips", l); homeView("trips"); });
    root.querySelectorAll("[data-f]").forEach((b) => b.onclick = () => {
      const k = b.dataset.f, place = k === "home" || k === "work" ? f[k] : f.list[+k];
      if (!place) { // imposta Casa o Lavoro cercando l'indirizzo
        state.pickFor = k; const t = $("#to"); t.placeholder = k === "home" ? "Cerca l'indirizzo di Casa" : "Cerca l'indirizzo del Lavoro"; t.value = ""; t.focus(); return;
      }
      setPlace("to", { ...place });
      if (!state.from) locate("from"); // parti da dove sei
    });
    root.querySelectorAll("[data-del-f]").forEach((b) => b.onclick = () => {
      const k = b.dataset.delF, ff = favs();
      if (k === "home" || k === "work") ff[k] = null; else ff.list.splice(+k, 1);
      store("favs", ff); homeView("fav");
    });
  } });
}

// ---------- Ricerca percorsi ----------
let searchSeq = 0, searchAbort = null;
export function maybeSearch() { if (state.from && state.to) search(); }
async function search(cursor) {
  const seq = ++searchSeq; hideSugg(); blurInputs();
  if (searchAbort) searchAbort.abort();
  const ctl = searchAbort = new AbortController();
  const from = state.from, to = state.to;
  if (!cursor) { routeLayer.clearLayers(); loading(state.mode === "TRANSIT" ? "Cerco i mezzi…" : "Calcolo il percorso…"); }
  try {
    if (state.mode === "TRANSIT") {
      const t = chosenTime();
      const plan = await motis("plan", {
        fromPlace: placeParam(from), toPlace: placeParam(to),
        time: cursor ? undefined : t.time, arriveBy: t.arriveBy || undefined, pageCursor: cursor,
        transitModes: "TRANSIT", directModes: "WALK", preTransitModes: "WALK", postTransitModes: "WALK",
        maxPreTransitTime: 1200, maxPostTransitTime: 1200, maxDirectTime: 3600,
        numItineraries: 5, language: "it", detailedTransfers: true
      }, ctl.signal);
      if (seq !== searchSeq) return;
      const its = (plan.itineraries || []).map((x) => ({ kind: "transit", ...x }));
      const direct = (plan.direct || []).map((x) => ({ kind: "transit", direct: true, ...x }));
      if (cursor && state.lastPlan) state.lastPlan.items = state.lastPlan.items.concat(its);
      else state.lastPlan = { items: its, direct, mode: "TRANSIT" };
      state.nextCursor = plan.nextPageCursor;
      showResults();
    } else {
      const items = await roadRoutes(state.mode, from, to, ctl.signal);
      if (seq !== searchSeq) return;
      state.lastPlan = { items, direct: [], mode: state.mode }; state.nextCursor = null;
      showResults();
    }
  } catch (e) {
    if (seq !== searchSeq || e.name === "AbortError") return;
    view(e.kind ? "Nessuna risposta" : "Nessun percorso", errorBox(e.message, true), { root: true, level: 1, bind: (r) => { const b = r.querySelector("[data-retry]"); if (b) b.onclick = () => search(); } });
  }
}

function itinCard(it, i) {
  if (it.kind === "road") {
    return `<button class="itin" data-it="${i}"><div class="top"><span class="times">${fmtDur(it.duration)}</span><span class="dur">${fmtDist(it.distance)}</span></div>
      <div class="meta">${it.via ? `<span>via ${esc(it.via)}</span>` : ""}<span>Arrivo verso le ${fmtTime(it.endTime)}</span>${it.mode === "CAR" ? "<span>senza traffico</span>" : ""}</div></button>`;
  }
  const legs = it.legs || [];
  const firstT = legs.find((l) => l.mode !== "WALK");
  const dl = firstT ? delayMin(firstT.startTime, firstT.scheduledStartTime) : 0;
  const walkM = legs.filter((l) => l.mode === "WALK").reduce((a, l) => a + l.duration, 0);
  const chain = legs.filter((l) => !(l.mode === "WALK" && l.duration < 60 && legs.length > 1)).map(legChip).join('<span class="sep">›</span>');
  const day = !sameDay(it.startTime, new Date(Date.now()).toISOString()) ? `<span>${fmtDay(it.startTime)}</span>` : "";
  return `<button class="itin" data-it="${i}">
    <div class="top"><span class="times">${fmtTime(it.startTime)} – ${fmtTime(it.endTime)}</span><span class="dur">${fmtDur(it.duration)}</span></div>
    <div class="chain">${chain}</div>
    <div class="meta">${day}${firstT ? `<span>Parte da ${esc(firstT.from.name)} alle ${fmtTime(firstT.startTime)}</span>` : "<span>Tutto a piedi</span>"}
      ${it.transfers ? `<span>${it.transfers} cambi${it.transfers === 1 ? "o" : ""}</span>` : (firstT ? "<span>Diretto</span>" : "")}
      ${walkM >= 60 ? `<span>${fmtDur(walkM)} a piedi</span>` : ""}
      ${firstT && firstT.realTime ? (dl > 0 ? `<span class="late">+${dl} min</span>` : '<span class="rt">In orario</span>') : ""}
      ${itinAlerts(it).length ? `<span class="awarn">${WARN_ICON} Avviso di servizio</span>` : ""}</div></button>`;
}

export function showResults() {
  const P = state.lastPlan;
  const all = P.items.concat(P.direct.filter((d) => d.duration <= 40 * 60));
  const title = P.mode === "TRANSIT" ? `${esc(state.to.name)}` : (P.mode === "CAR" ? "In auto" : "A piedi");
  let html;
  if (!all.length) {
    html = P.mode === "TRANSIT"
      ? errorBox("Nessun collegamento con i mezzi in questo orario. Prova un altro orario, oppure scegli come partenza o arrivo una fermata vicina.")
      : errorBox("Nessun percorso trovato.");
  } else {
    html = `<div class="row" style="margin-bottom:8px"><button class="btn small" data-save-trip aria-pressed="${trips().some(sameTrip)}">${trips().some(sameTrip) ? "★ Viaggio salvato" : "☆ Salva viaggio"}</button></div><div class="list">${all.map(itinCard).join("")}</div>` +
      (P.mode === "TRANSIT" && state.nextCursor ? '<div style="margin-top:10px"><button class="btn wide" data-more>Mostra partenze successive</button></div>' : "");
  }
  view(P.mode === "TRANSIT" ? "Verso " + state.to.name : title, html, { root: true, level: 1,
    draw: () => { routeLayer.clearLayers(); if (all[0]) drawItin(all[0], true); },
    bind: (root) => {
      root.querySelectorAll("[data-it]").forEach((b) => b.onclick = () => showItin(all[+b.dataset.it]));
      const sv = root.querySelector("[data-save-trip]");
      if (sv) sv.onclick = () => { const on = toggleTrip(); sv.textContent = on ? "★ Viaggio salvato" : "☆ Salva viaggio"; sv.setAttribute("aria-pressed", String(on)); };
      const more = root.querySelector("[data-more]"); if (more) more.onclick = () => { more.disabled = true; more.textContent = "Carico…"; search(state.nextCursor); };
    } });
}

// ---------- Dettaglio di un percorso ----------
export function showItin(it) {
  let html = "";
  if (it.kind === "road") {
    html = `<div class="meta" style="margin-bottom:8px"><span><b>${fmtDur(it.duration)}</b></span><span>${fmtDist(it.distance)}</span>${it.mode === "CAR" ? "<span>tempo senza traffico</span>" : ""}</div>
      <button class="btn primary wide" data-nav style="margin:4px 0 12px">Avvia navigazione</button>
      <ol class="steps">${it.steps.map((s) => `<li><span>${esc(s.text)}</span><span>${s.distance >= 10 ? fmtDist(s.distance) : ""}</span></li>`).join("")}</ol>`;
    view(it.mode === "CAR" ? "In auto · " + fmtDur(it.duration) : "A piedi · " + fmtDur(it.duration), html, { push: true, level: 1, draw: () => drawItin(it), bind: (root) => {
      root.querySelector("[data-nav]").onclick = () => startRoadNav(it);
    } });
    return;
  }
  const legs = it.legs || [];
  html += '<button class="btn primary wide" data-follow style="margin:4px 0 12px">Segui il viaggio</button><div class="tl">';
  legs.forEach((l, i) => {
    const isT = l.mode !== "WALK" && l.mode !== "CAR";
    const col = isT ? (l.routeColor ? "#" + l.routeColor : "var(--transit)") : "var(--walk)";
    const d = delayMin(l.startTime, l.scheduledStartTime);
    const timeCell = (iso, sched) => { const dd = delayMin(iso, sched); return `${fmtTime(iso)}${dd > 0 ? `<small class="late">+${dd}</small>` : (l.realTime && isT ? '<small class="rt">live</small>' : "")}`; };
    html += `<div class="stop" style="--c:${col}"><div class="t">${timeCell(l.startTime, l.scheduledStartTime)}</div><div class="node"></div><div class="n"><b>${esc(i === 0 && !isT && state.from ? state.from.name : l.from.name)}</b>${l.from.track ? `<span class="small muted">Binario ${esc(l.from.track)}</span>` : ""}</div></div>`;
    html += `<div class="seg" style="--c:${col}"><div></div><div class="bar ${isT ? "" : "dash"}"></div><div class="body">`;
    if (!isT) {
      html += `<div class="muted">${ICONS.WALK.replace("<svg", '<svg width="16" height="16" style="vertical-align:-3px"')} A piedi ${fmtDur(l.duration)}${l.distance ? " · " + fmtDist(l.distance) : ""}</div>`;
      const st = motisSteps(l.steps).filter((s) => s.distance > 5);
      if (st.length > 1) html += `<details><summary>Indicazioni</summary><ol class="steps">${st.map((s) => `<li><span>${esc(s.text)}</span><span>${fmtDist(s.distance)}</span></li>`).join("")}</ol></details>`;
    } else {
      const inter = l.intermediateStops || [];
      html += `<div>${legChip(l)} <b>→ ${esc(l.headsign || (l.tripTo && l.tripTo.name) || "")}</b></div>
        ${alertsHtml(legAlerts(l))}
        <div class="small muted">${esc(l.agencyName || modeName(l.mode))}${l.cancelled ? ' · <span class="cancel">Corsa soppressa</span>' : ""}${l.realTime ? (d > 0 ? ` · <span class="late">ritardo ${d} min</span>` : ' · <span class="rt">dati in tempo reale</span>') : " · orario programmato"}</div>
        ${inter.length ? `<details><summary>${inter.length + 1} fermate · ${fmtDur(l.duration)}</summary><div class="mini">${inter.map((s) => `<div><span>${fmtTime(s.arrival || s.departure)}</span><span>${esc(s.name)}</span></div>`).join("")}</div></details>` : `<div class="small muted">${fmtDur(l.duration)} senza fermate intermedie</div>`}
        ${l.tripId ? `<div><button class="btn small" data-trip="${i}">Vedi tutta la corsa</button></div>` : ""}`;
    }
    html += "</div></div>";
    if (i === legs.length - 1) html += `<div class="stop" style="--c:var(--fg)"><div class="t">${timeCell(l.endTime, l.scheduledEndTime)}</div><div class="node"></div><div class="n"><b>${esc(state.to ? state.to.name : l.to.name)}</b></div></div>`;
  });
  html += "</div>";
  view(`${fmtTime(it.startTime)} – ${fmtTime(it.endTime)} · ${fmtDur(it.duration)}`, html, { push: true, level: 1, draw: () => drawItin(it), bind: (root) => {
    root.querySelectorAll("[data-trip]").forEach((b) => b.onclick = () => { const l = legs[+b.dataset.trip]; showTrip(l.tripId, l.from.stopId); });
    root.querySelector("[data-follow]").onclick = () => startTripNav(it);
  } });
}
// ---------- Corsa intera (tutte le fermate della linea) ----------
async function showTrip(tripId, highlightStopId) {
  pushCurrent();
  loading("Carico la corsa…");
  try {
    const it = await motis("trip", { tripId, language: "it" });
    const l = (it.legs || []).find((x) => x.tripId === tripId) || (it.legs || [])[0];
    if (!l) throw new Error("Dettagli della corsa non disponibili.");
    const stops = [l.from, ...(l.intermediateStops || []), l.to];
    const now = Date.now();
    const html = `${alertsHtml(legAlerts(l))}<div style="margin-bottom:10px">${legChip(l)} <b>→ ${esc(l.headsign || l.to.name)}</b><div class="small muted">${esc(l.agencyName || "")}${l.realTime ? ' · <span class="rt">dati in tempo reale</span>' : " · orario programmato"}</div></div>
      <ol class="tripstops">${stops.map((s, k) => {
        const t = s.departure || s.arrival; const past = t && new Date(t) < now; const hl = s.stopId && s.stopId === highlightStopId;
        const isNext = !past && (k === 0 || (stops[k - 1] && new Date(stops[k - 1].departure || stops[k - 1].arrival) < now));
        const dd = delayMin(t, s.scheduledDeparture || s.scheduledArrival);
        const tag = past ? `<span class="tag past">${CHECK_ICON}passata</span>` : (isNext && k > 0 ? '<span class="tag next">prossima</span>' : "");
        return `<li class="${past ? "past" : ""}${hl ? " mine" : ""}"><span class="tt">${fmtTime(t)}${dd > 0 ? ` <small class="late">+${dd}</small>` : ""}</span><span class="tn">${esc(s.name)}${hl ? '<span class="tag mine">la tua fermata</span>' : ""}</span>${tag}</li>`;
      }).join("")}</ol>`;
    const lname = l.routeShortName || l.displayName || modeName(l.mode);
    view(/^\d/.test(lname) || lname.length <= 4 ? "Linea " + lname : lname, html, { level: 1, draw: () => {
      routeLayer.clearLayers();
      const g = decodePolyline(l.legGeometry.points, l.legGeometry.precision);
      const c = l.routeColor ? "#" + l.routeColor : cssVar("--transit"); const casing = cssVar("--surface");
      L.polyline(g, { color: casing, weight: 10, opacity: .9 }).addTo(routeLayer);
      L.polyline(g, { color: c, weight: 6 }).addTo(routeLayer);
      stops.forEach((s) => L.circleMarker([s.lat, s.lon], { radius: s.stopId === highlightStopId ? 7 : 4.5, color: c, weight: 3, fillColor: casing, fillOpacity: 1 }).bindTooltip(`${s.name} · ${fmtTime(s.departure || s.arrival)}`).addTo(routeLayer));
      fit(g);
    } });
  } catch (e) {
    view("Corsa", errorBox(e.message), { level: 1, kind: "error" });
  }
}

const CHECK_ICON = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

// ---------- Fermate visibili sulla mappa (elenco accessibile) ----------
export function showNearbyStops() {
  const list = nearbyStops();
  const html = list.length ? `<p class="small muted" style="margin:0 0 6px">Dalla più vicina al centro della mappa.</p>` + list.map((s, i) =>
    `<div class="rowitem"><button class="recent" data-ns="${i}"><span class="sicon">${ICONS.STOP}</span><span class="stext"><b>${esc(s.name)}</b><small>${esc([stopModes(s.modes), fmtDist(s.d)].filter(Boolean).join(" · "))}</small></span></button></div>`).join("")
    : '<p class="empty">Nessuna fermata in questa zona. Sposta la mappa o avvicinati con lo zoom.</p>';
  view("Fermate qui", html, { push: true, level: 1, kind: "stops", bind: (root) => {
    root.querySelectorAll("[data-ns]").forEach((b) => b.onclick = () => showDepartures(list[+b.dataset.ns]));
  } });
}

// ---------- Partenze da una fermata ----------
export async function showDepartures(stop, refresh) {
  if (!refresh) {
    pushCurrent();
    loading(stop.name);
    map.setView([stop.lat, stop.lon], Math.max(map.getZoom(), 16));
  }
  try {
    const r = await motis("stoptimes", { stopId: stop.id, n: 25, time: new Date(Date.now()).toISOString(), language: "it", withAlerts: true });
    // Aggiornamento in sottofondo: solo se l'utente è ancora su questa fermata
    if (refresh && !(state.viewKind === "departures" && state.depStop && state.depStop.id === stop.id)) return;
    const list = r.stopTimes || [];
    let lastDay = dayLabel(new Date(Date.now()).toISOString());
    const html = `<div class="row" style="margin-bottom:6px"><button class="btn small primary" data-go="to">Portami qui</button><button class="btn small" data-go="from">Parti da qui</button><button class="btn small" data-fav-stop>${isFav(stop) ? "★ Preferito" : "☆ Preferito"}</button></div>
      ${alertsHtml(collectAlerts(r.place && r.place.alerts))}
      ${list.length ? list.map((s, i) => {
        const t = s.place.departure || s.place.arrival; const sch = s.place.scheduledDeparture || s.place.scheduledArrival;
        const day = dayLabel(t); const head = day !== lastDay ? `<div class="label">${esc(day)}</div>` : ""; lastDay = day;
        const m = minutesUntil(t); const dd = delayMin(t, sch);
        const when = m <= 0 ? "ora" : (m < 60 ? `${m} min` : fmtTime(t));
        const bg = s.routeColor ? "#" + s.routeColor : "var(--transit)"; const fg = s.routeTextColor ? "#" + s.routeTextColor : "#fff";
        const name = s.routeShortName || s.displayName || s.tripShortName || modeName(s.mode);
        return `${head}<button class="dep" data-d="${i}"><span class="chip" style="background:${bg};color:${fg}">${modeIcon(s.mode)}${esc(name)}</span>
          <span class="hs"><b>${esc(s.headsign || (s.tripTo && s.tripTo.name) || "")}</b><span class="small muted">${esc(s.agencyName || "")}${s.place.track ? " · bin. " + esc(s.place.track) : ""}${collectAlerts(s.place.alerts).length ? ` · <span class="awarn">${WARN_ICON} avviso</span>` : ""}</span></span>
          <span class="in ${s.cancelled || s.tripCancelled ? "cancel" : ""}">${when}<small>${fmtTime(t)}${s.realTime ? (dd > 0 ? ` <span class="late">+${dd}</span>` : ' <span class="rt">live</span>') : ""}</small></span></button>`;
      }).join("") : '<p class="empty">Nessuna partenza trovata da questa fermata.</p>'}
      <p class="small muted" style="margin:10px 0 0">Aggiornato alle ${fmtTime(new Date(Date.now()).toISOString())} · si aggiorna da solo</p>`;
    const scroll = refresh ? $("#sheetBody").scrollTop : 0;
    state.depStop = stop; state.depAt = Date.now();
    view(stop.name, html, { level: refresh ? null : 1, kind: "departures", draw: refresh ? null : () => { routeLayer.clearLayers(); L.circleMarker([stop.lat, stop.lon], { radius: 8, color: cssVar("--surface"), weight: 3, fillColor: cssVar("--transit"), fillOpacity: 1 }).addTo(routeLayer); }, bind: (root) => {
      root.querySelectorAll("[data-go]").forEach((b) => b.onclick = () => setPlace(b.dataset.go, { ...stop, type: "STOP" }));
      const fs = root.querySelector("[data-fav-stop]"); if (fs) fs.onclick = () => { fs.textContent = toggleFav({ ...stop, type: "STOP" }) ? "★ Preferito" : "☆ Preferito"; };
      root.querySelectorAll("[data-d]").forEach((b) => b.onclick = () => { const s = list[+b.dataset.d]; showTrip(s.tripId, stop.id); });
    } });
    if (refresh) { $("#sheetBody").scrollTop = scroll; state.currentDraw = () => { routeLayer.clearLayers(); L.circleMarker([stop.lat, stop.lon], { radius: 8, color: cssVar("--surface"), weight: 3, fillColor: cssVar("--transit"), fillOpacity: 1 }).addTo(routeLayer); }; }
  } catch (e) {
    if (refresh) return; // un aggiornamento fallito lascia i dati di prima
    view(stop.name, errorBox(e.message), { level: 1, kind: "error" });
  }
}
