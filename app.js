/* Girovia: mezzi pubblici, auto e piedi. Nessuna pubblicità, nessun tracciamento.
   Dati: Transitous (orari GTFS ufficiali), OpenStreetMap, OSRM (FOSSGIS). */
(function () {
  "use strict";

  const CFG = window.GIROVIA_CONFIG || {};
  const TZ = "Europe/Rome";
  const $ = (s, r = document) => r.querySelector(s);

  // ---------- Stato ----------
  const state = {
    from: null, to: null, mode: "TRANSIT",
    me: null, activeField: null,
    lastPlan: null, nextCursor: null,
    stack: [] // pila delle viste del pannello
  };

  // ---------- Utilità ----------
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtTime = (iso) => iso ? new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(new Date(iso)) : "";
  const fmtDay = (iso) => new Intl.DateTimeFormat("it-IT", { weekday: "short", day: "numeric", month: "short", timeZone: TZ }).format(new Date(iso));
  function fmtDur(sec) {
    const m = Math.max(1, Math.round(sec / 60));
    if (m < 60) return m + " min";
    const h = Math.floor(m / 60), r = m % 60;
    return h + " h" + (r ? " " + r + " min" : "");
  }
  function fmtDist(m) {
    if (m == null) return "";
    if (m < 950) return Math.round(m / 10) * 10 + " m";
    return (m / 1000).toFixed(m < 10000 ? 1 : 0).replace(".", ",") + " km";
  }
  const delayMin = (real, sched) => (real && sched) ? Math.round((new Date(real) - new Date(sched)) / 60000) : 0;
  const minutesUntil = (iso) => Math.round((new Date(iso) - Date.now()) / 60000);
  const sameDay = (a, b) => fmtDay(a) === fmtDay(b);
  function dayLabel(iso) {
    const now = Date.now();
    if (fmtDay(iso) === fmtDay(new Date(now).toISOString())) return "Oggi";
    if (fmtDay(iso) === fmtDay(new Date(now + 864e5).toISOString())) return "Domani";
    return fmtDay(iso);
  }
  const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

  function store(key, val) { try { if (val === undefined) return JSON.parse(localStorage.getItem("girovia." + key) || "null"); localStorage.setItem("girovia." + key, JSON.stringify(val)); } catch (e) { return null; } }

  function toast(msg) {
    const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; t.setAttribute("role", "status");
    document.body.appendChild(t); setTimeout(() => t.remove(), 3500);
  }

  // Decodifica polilinea (formato Google) con precisione variabile
  function decodePolyline(str, precision) {
    if (!str) return [];
    const f = Math.pow(10, precision || 5); let i = 0, lat = 0, lon = 0; const out = [];
    const next = () => {
      let shift = 0, result = 0, b;
      do { b = str.charCodeAt(i++) - 63; result += (b & 0x1f) * Math.pow(2, shift); shift += 5; } while (b >= 0x20 && i < str.length);
      return (result % 2) ? -(result + 1) / 2 : result / 2;
    };
    while (i < str.length) { lat += next(); lon += next(); out.push([lat / f, lon / f]); }
    return out;
  }

  // I dati GTFS di AT arrivano spesso TUTTI MAIUSCOLI: "SCALA SANTA MARIA NOVELLA" → "Scala Santa Maria Novella".
  // Le sigle restano maiuscole (SMN, FS, SS67, AT).
  const SMALL = new Set(["di", "de", "del", "dell", "della", "dello", "dei", "degli", "delle", "da", "dal", "dalla", "e", "ed", "in", "a", "al", "alla", "allo", "ai", "agli", "alle", "sul", "sulla", "per", "con", "tra", "fra"]);
  const KEEP = /^(SS|SR|SP|FS|SMN|AT|ATAF|GEST|RFI|TFT|II|III|IV|VI|VII|VIII|IX|XI|XII|XX|XXIV|XXV|A1|A11|FI-PI-LI)$/;
  function prettyName(str) {
    if (typeof str !== "string" || !/[A-ZÀ-Ý]{3}/.test(str) || str !== str.toUpperCase()) return str;
    let first = true;
    return str.replace(/[A-ZÀ-Ý0-9]+/g, (w, idx) => {
      const prev = str[idx - 1];
      const after = prev === "'" || prev === "’" || prev === ".";
      let out;
      if (KEEP.test(w) || /\d/.test(w) || !/[AEIOUÀÈÉÌÒÙ]/.test(w)) out = w;
      else if (!first && !after && SMALL.has(w.toLowerCase())) out = w.toLowerCase();
      else out = w.charAt(0) + w.slice(1).toLowerCase();
      first = false;
      return out;
    });
  }
  function prettify(o) {
    if (Array.isArray(o)) { o.forEach(prettify); return o; }
    if (o && typeof o === "object") for (const k of Object.keys(o)) {
      if ((k === "name" || k === "headsign") && typeof o[k] === "string") o[k] = prettyName(o[k]);
      else if (o[k] && typeof o[k] === "object") prettify(o[k]);
    }
    return o;
  }

  // ---------- Accesso ai servizi ----------
  // Transitous (MOTIS 2) ha più versioni delle API: si prova dalla più recente.
  const VERSIONS = { "plan": [6, 5, 4, 3, 2], "trip": [6, 5, 4, 2], "stoptimes": [6, 5, 4, 1], "map/stops": [6, 1], "geocode": [1], "reverse-geocode": [1] };
  const knownVersion = {};
  async function motis(endpoint, params, signal) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") qs.set(k, Array.isArray(v) ? v.join(",") : String(v));
    const list = knownVersion[endpoint] ? [knownVersion[endpoint]] : VERSIONS[endpoint];
    let lastErr;
    for (const v of list) {
      const url = `${CFG.transitous}/api/v${v}/${endpoint}?${qs}`;
      let res;
      try { res = await fetch(url, { signal, referrerPolicy: "origin" }); }
      catch (e) { if (e.name === "AbortError") throw e; lastErr = new Error("Servizio orari non raggiungibile. Controlla la connessione."); break; }
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

  async function osrm(base, from, to, alternatives) {
    const url = `${base}/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?overview=full&geometries=polyline6&steps=true&alternatives=${alternatives ? "true" : "false"}`;
    const res = await fetch(url, { referrerPolicy: "origin" });
    if (!res.ok) throw new Error("Servizio percorsi non raggiungibile (" + res.status + ").");
    const j = await res.json();
    if (j.code !== "Ok" || !j.routes || !j.routes.length) throw new Error("Nessun percorso trovato tra questi due punti.");
    return j.routes;
  }

  // ---------- Mappa ----------
  const map = L.map("map", { zoomControl: false, attributionControl: true }).setView(CFG.center || [43.7731, 11.256], CFG.zoom || 12);
  L.tileLayer(CFG.tiles, {
    maxZoom: 19,
    attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> · Orari <a href="https://transitous.org/sources/" target="_blank" rel="noopener">Transitous e fonti</a> · Strade <a href="https://routing.openstreetmap.de/about.html" target="_blank" rel="noopener">FOSSGIS</a>'
  }).addTo(map);
  map.attributionControl.setPrefix(false);
  const routeLayer = L.layerGroup().addTo(map);
  const stopsLayer = L.layerGroup().addTo(map);
  const pinLayer = L.layerGroup().addTo(map);
  let meMarker = null;

  const pinIcon = (cls) => L.divIcon({ className: "", html: `<div class="pin ${cls}"></div>`, iconSize: [18, 18], iconAnchor: [9, 9] });
  function drawPins() {
    pinLayer.clearLayers();
    if (state.from) L.marker([state.from.lat, state.from.lon], { icon: pinIcon("from"), keyboard: false }).addTo(pinLayer);
    if (state.to) L.marker([state.to.lat, state.to.lon], { icon: pinIcon("to"), keyboard: false }).addTo(pinLayer);
  }
  function sheetPx() { return $("#sheet").getBoundingClientRect().height; }
  function fit(latlngs) {
    if (!latlngs.length) return;
    const topH = $("#top").getBoundingClientRect().height;
    map.fitBounds(L.latLngBounds(latlngs), { paddingTopLeft: [30, topH + 20], paddingBottomRight: [30, sheetPx() + 20], maxZoom: 17 });
  }

  // Tocco sulla mappa: scegli un punto come partenza o arrivo
  map.on("click", async (e) => {
    hideSugg(); blurInputs();
    const p = { lat: e.latlng.lat, lon: e.latlng.lng, name: "Punto sulla mappa", type: "POINT" };
    const pop = L.popup({ closeButton: false }).setLatLng(e.latlng).setContent(popupHtml(p)).openOn(map);
    bindPopup(pop, p);
    try {
      const r = await motis("reverse-geocode", { place: `${p.lat},${p.lon}`, numResults: 1 });
      if (r && r[0]) { p.name = placeLabel(r[0]); p.sub = areaLabel(r[0]); pop.setContent(popupHtml(p)); bindPopup(pop, p); }
    } catch (err) { /* resta "Punto sulla mappa" */ }
  });
  function popupHtml(p) {
    return `<b>${esc(p.name)}</b>${p.sub ? `<div class="muted small">${esc(p.sub)}</div>` : ""}<div class="popbtns"><button class="btn small primary" data-pop="from">Parti da qui</button><button class="btn small" data-pop="to">Arriva qui</button></div>`;
  }
  function bindPopup(pop, p) {
    setTimeout(() => {
      const el = pop.getElement(); if (!el) return;
      el.querySelectorAll("[data-pop]").forEach((b) => b.onclick = () => { map.closePopup(); setPlace(b.dataset.pop, { ...p }); });
    }, 0);
  }

  // Fermate visibili sulla mappa quando lo zoom è alto
  let stopsAbort = null, stopsTimer = null;
  map.on("moveend", () => { clearTimeout(stopsTimer); stopsTimer = setTimeout(loadStops, 350); });
  async function loadStops() {
    if (map.getZoom() < 16) { stopsLayer.clearLayers(); return; }
    if (stopsAbort) stopsAbort.abort(); stopsAbort = new AbortController();
    const b = map.getBounds();
    try {
      const stops = await motis("map/stops", { min: `${b.getSouth()},${b.getWest()}`, max: `${b.getNorth()},${b.getEast()}` }, stopsAbort.signal);
      stopsLayer.clearLayers();
      const accent = cssVar("--transit") || "#b3261e";
      (stops || []).slice(0, 400).forEach((s) => {
        if (!s.stopId) return;
        L.circleMarker([s.lat, s.lon], { radius: 6, color: "#fff", weight: 2, fillColor: accent, fillOpacity: 1 })
          .bindTooltip(s.name, { direction: "top" })
          .on("click", (ev) => { L.DomEvent.stop(ev); showDepartures({ id: s.stopId, name: s.name, lat: s.lat, lon: s.lon, type: "STOP" }); })
          .addTo(stopsLayer);
      });
    } catch (e) { if (e.name !== "AbortError") stopsLayer.clearLayers(); }
  }

  // ---------- Posizione ----------
  function locate(thenUse) {
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
  $("#locate").onclick = () => locate(state.from ? null : "from");

  // ---------- Ricerca luoghi ----------
  const ICONS = {
    STOP: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="3" width="14" height="15" rx="3"/><path d="M5 11h14M8 21l1-3M16 21l-1-3"/></svg>',
    ADDRESS: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s-7-6.2-7-12a7 7 0 0114 0c0 5.8-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/></svg>',
    PLACE: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20V9l8-5 8 5v11z"/><path d="M9 20v-6h6v6"/></svg>',
    ME: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>',
    RECENT: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    WALK: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="13" cy="4" r="2"/><path d="M11 21l2-6-3-3 1-5 4 3 3 1M10 12l-3 2"/></svg>',
    CAR: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M4 16v-4l2-5h12l2 5v4z"/><circle cx="7.5" cy="16.5" r="1.8"/><circle cx="16.5" cy="16.5" r="1.8"/></svg>',
    RAIL: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><rect x="6" y="3" width="12" height="14" rx="3"/><path d="M6 11h12M8 21l2-4M16 21l-2-4"/></svg>',
    TRAM: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 3h6M12 3v3M9 21l1-3M15 21l-1-3"/></svg>'
  };
  function stopModes(modes) {
    if (!Array.isArray(modes) || !modes.length) return "";
    const out = [];
    for (const m of modes) {
      const n = /RAIL|SUBURBAN|LONG_DISTANCE|HIGHSPEED/.test(m) ? "Treno" : ({ BUS: "Bus", COACH: "Pullman", TRAM: "Tram", SUBWAY: "Metro", FERRY: "Traghetto", FUNICULAR: "Funicolare" })[m];
      if (n && !out.includes(n)) out.push(n);
    }
    return out.join(", ");
  }
  const placeLabel = (m) => m.type === "ADDRESS" && m.street ? `${m.street}${m.houseNumber ? " " + m.houseNumber : ""}` : m.name;
  function areaLabel(m) {
    const a = (m.areas || []).filter((x) => x.name && x.name !== m.name).sort((x, y) => (y.adminLevel || 0) - (x.adminLevel || 0));
    const names = []; for (const x of a) if (!names.includes(x.name)) names.push(x.name);
    return names.slice(0, 2).join(", ");
  }

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
    const items = [{ name: "La mia posizione", type: "ME", sub: "Usa il GPS" }];
    (store("recent") || []).forEach((r) => items.push({ ...r, recent: true }));
    renderSugg(field, items);
  }
  function renderSugg(field, items, error) {
    const box = $("#sugg");
    if (!items.length) { box.innerHTML = `<div class="empty" style="padding:12px">${esc(error || "Nessun risultato. Prova con il nome del comune, della via o della fermata.")}</div>`; box.hidden = false; return; }
    box.innerHTML = items.map((it, i) => `<button type="button" data-i="${i}"><span class="sicon">${ICONS[it.recent ? "RECENT" : it.type] || ICONS.ADDRESS}</span><span class="stext"><b>${esc(it.name)}</b>${it.sub ? `<small>${it.type === "STOP" ? "Fermata · " : ""}${esc(it.sub)}</small>` : (it.type === "STOP" ? "<small>Fermata</small>" : "")}</span></button>`).join("");
    box.hidden = false;
    box.querySelectorAll("button").forEach((b) => {
      b.addEventListener("pointerdown", (e) => e.preventDefault()); // non togliere il focus prima del click
      b.onclick = () => {
        const it = items[+b.dataset.i];
        hideSugg(); blurInputs();
        if (it.type === "ME") { locate(field); return; }
        const p = { ...it }; delete p.recent; setPlace(field, p);
      };
    });
  }
  function hideSugg() { $("#sugg").hidden = true; }
  function blurInputs() { $("#from").blur(); $("#to").blur(); }

  ["from", "to"].forEach((f) => {
    const input = $("#" + f);
    input.addEventListener("focus", () => { state.activeField = f; input.select(); if (input.value.trim().length < 2 || state[f]) showSuggDefaults(f); });
    input.addEventListener("input", () => { state[f] = null; onType(f); });
    input.addEventListener("blur", () => setTimeout(() => { if (document.activeElement !== $("#from") && document.activeElement !== $("#to")) { hideSugg(); if (state[f]) input.value = state[f].name; } }, 150));
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { const first = $("#sugg button"); if (first) first.click(); } });
  });
  document.querySelectorAll("[data-clear]").forEach((b) => b.onclick = () => { const f = b.dataset.clear; state[f] = null; $("#" + f).value = ""; b.hidden = true; drawPins(); routeLayer.clearLayers(); $("#" + f).focus(); });
  $("#swap").onclick = () => { [state.from, state.to] = [state.to, state.from]; syncInputs(); drawPins(); maybeSearch(); };

  function syncInputs() {
    for (const f of ["from", "to"]) { $("#" + f).value = state[f] ? state[f].name : ""; $(`[data-clear="${f}"]`).hidden = !state[f]; }
  }
  function remember(p) {
    if (p.type === "ME" || p.type === "POINT") return;
    const list = (store("recent") || []).filter((r) => !(Math.abs(r.lat - p.lat) < 1e-5 && Math.abs(r.lon - p.lon) < 1e-5));
    list.unshift({ id: p.id, lat: p.lat, lon: p.lon, name: p.name, sub: p.sub, type: p.type });
    store("recent", list.slice(0, 8));
  }
  function setPlace(field, p) {
    state[field] = p; remember(p); syncInputs(); drawPins();
    if (state.from && state.to) { maybeSearch(); return; }
    // Solo una fermata scelta: mostra subito le partenze
    if (p.type === "STOP" && p.id) { showDepartures(p); return; }
    map.setView([p.lat, p.lon], Math.max(map.getZoom(), 15));
    $(field === "from" ? "#to" : "#from").focus();
  }

  // ---------- Modalità e orario ----------
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
  function chosenTime() {
    const m = $("#whenMode").value;
    if (m === "now" || !$("#whenTime").value) return { time: new Date().toISOString(), arriveBy: false };
    return { time: new Date($("#whenTime").value).toISOString(), arriveBy: m === "arrive" };
  }

  // ---------- Pannello inferiore ----------
  const SNAP = () => { const h = window.innerHeight; return [Math.round(h * 0.22), Math.round(h * 0.5), Math.round(h * 0.86)]; };
  function setSheet(level) { const s = SNAP(); document.documentElement.style.setProperty("--sheet-h", s[level] + "px"); }
  (function sheetDrag() {
    const sheet = $("#sheet"); let startY = 0, startH = 0, dragging = false, moved = false;
    const down = (e) => { dragging = true; moved = false; startY = e.clientY; startH = sheet.getBoundingClientRect().height; sheet.classList.add("dragging"); e.currentTarget.setPointerCapture(e.pointerId); };
    const move = (e) => { if (!dragging) return; const dy = startY - e.clientY; if (Math.abs(dy) > 4) moved = true; const h = Math.min(window.innerHeight * 0.92, Math.max(90, startH + dy)); document.documentElement.style.setProperty("--sheet-h", h + "px"); };
    const up = () => {
      if (!dragging) return; dragging = false; sheet.classList.remove("dragging");
      const h = sheet.getBoundingClientRect().height, s = SNAP();
      if (!moved) { setSheet(h < s[1] - 10 ? 1 : (h < s[2] - 10 ? 2 : 0)); return; }
      let best = 0; s.forEach((v, i) => { if (Math.abs(v - h) < Math.abs(s[best] - h)) best = i; }); setSheet(best);
    };
    for (const el of [$("#handle"), $("#sheetHead")]) { el.addEventListener("pointerdown", (e) => { if (e.target.closest("button")) return; down(e); }); el.addEventListener("pointermove", move); el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up); }
  })();

  // Salva la vista attuale per il tasto Indietro (le schermate di caricamento non si salvano)
  function pushCurrent() {
    if (state.viewKind === "loading" || state.viewKind === "error" || !state.viewKind) return;
    state.stack.push({ title: $("#sheetTitle").textContent, html: $("#sheetBody").innerHTML, bind: state.currentBind, draw: state.currentDraw, kind: state.viewKind });
  }
  function view(title, html, opts = {}) {
    if (opts.push) pushCurrent();
    else if (opts.root) state.stack = [];
    state.viewKind = opts.kind || "view";
    $("#sheetTitle").textContent = title;
    $("#sheetBody").innerHTML = html;
    $("#sheetBody").scrollTop = 0;
    $("#back").hidden = state.stack.length === 0;
    state.currentBind = opts.bind || null; state.currentDraw = opts.draw || null;
    if (opts.bind) opts.bind($("#sheetBody"));
    if (opts.draw) opts.draw();
    if (opts.level != null) setSheet(opts.level);
  }
  $("#back").onclick = () => {
    const prev = state.stack.pop(); if (!prev) return;
    $("#sheetTitle").textContent = prev.title; $("#sheetBody").innerHTML = prev.html;
    state.currentBind = prev.bind; state.currentDraw = prev.draw; state.viewKind = prev.kind || "view";
    if (prev.bind) prev.bind($("#sheetBody"));
    if (prev.draw) prev.draw(); else { routeLayer.clearLayers(); }
    $("#back").hidden = state.stack.length === 0;
  };
  const loading = (title) => view(title, '<div class="spinner" role="status" aria-label="Caricamento"></div>', { level: 1, kind: "loading" });
  const errorBox = (msg, retry) => `<div class="err">${esc(msg)}</div>${retry ? '<button class="btn" data-retry>Riprova</button>' : ""}`;

  function homeView() {
    const rec = store("recent") || [];
    const html = `
      <p class="muted" style="margin:0 0 6px">Scrivi partenza e arrivo, oppure tocca un punto sulla mappa. Avvicinati con lo zoom per vedere le fermate e i loro orari.</p>
      ${rec.length ? `<div class="label">Luoghi recenti</div>${rec.map((r, i) => `<button class="recent" data-r="${i}"><span class="sicon">${ICONS[r.type] || ICONS.RECENT}</span><span class="stext"><b>${esc(r.name)}</b>${r.sub ? `<small>${esc(r.sub)}</small>` : ""}</span></button>`).join("")}` : ""}
      <div class="label">Dati</div>
      <p class="small muted" style="margin:0">Orari ufficiali GTFS di Autolinee Toscane, Trenitalia e tramvia tramite Transitous. Mappa e strade da OpenStreetMap. I tempi in auto non tengono conto del traffico. Nessun account, nessuna pubblicità, nessun tracciamento: le ricerche recenti restano solo su questo telefono.</p>
      ${CFG.contact ? `<p class="small muted" style="margin:8px 0 0">Progetto e contatti: <a href="${esc(CFG.contact)}" target="_blank" rel="noopener" style="color:var(--accent)">${esc(CFG.contact.replace(/^https?:\/\//, ""))}</a></p>` : ""}`;
    view("Dove vuoi andare?", html, { root: true, level: 0, kind: "home", bind: (root) => {
      root.querySelectorAll("[data-r]").forEach((b) => b.onclick = () => {
        const r = rec[+b.dataset.r];
        if (r.type === "STOP" && r.id && !state.from) { showDepartures(r); return; }
        setPlace(state.from ? "to" : "from", { ...r });
      });
    } });
  }

  // ---------- Ricerca percorsi ----------
  let searchSeq = 0;
  function maybeSearch() { if (state.from && state.to) search(); }
  async function search(cursor) {
    const seq = ++searchSeq; hideSugg(); blurInputs();
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
        });
        if (seq !== searchSeq) return;
        const its = (plan.itineraries || []).map((x) => ({ kind: "transit", ...x }));
        const direct = (plan.direct || []).map((x) => ({ kind: "transit", direct: true, ...x }));
        if (cursor && state.lastPlan) state.lastPlan.items = state.lastPlan.items.concat(its);
        else state.lastPlan = { items: its, direct, mode: "TRANSIT" };
        state.nextCursor = plan.nextPageCursor;
        showResults();
      } else {
        const items = await roadRoutes(state.mode, from, to);
        if (seq !== searchSeq) return;
        state.lastPlan = { items, direct: [], mode: state.mode }; state.nextCursor = null;
        showResults();
      }
    } catch (e) {
      if (seq !== searchSeq) return;
      view("Nessun percorso", errorBox(e.message, true), { root: true, level: 1, bind: (r) => { const b = r.querySelector("[data-retry]"); if (b) b.onclick = () => search(); } });
    }
  }
  function placeParam(p) { return `${p.lat},${p.lon}`; }

  async function roadRoutes(mode, from, to) {
    const base = mode === "CAR" ? CFG.routingCar : CFG.routingFoot;
    try {
      const routes = await osrm(base, from, to, mode === "CAR");
      const now = Date.now();
      return routes.map((r) => ({
        kind: "road", mode, duration: r.duration, distance: r.distance,
        startTime: new Date(now).toISOString(), endTime: new Date(now + r.duration * 1000).toISOString(),
        geometry: decodePolyline(r.geometry, 6),
        via: r.legs && r.legs[0] && r.legs[0].summary,
        steps: (r.legs || []).flatMap((l) => l.steps || []).map((s) => ({ text: osrmText(s, mode), distance: s.distance })).filter((s) => s.text)
      }));
    } catch (first) {
      // Riserva: stesso calcolo con Transitous
      const plan = await motis("plan", { fromPlace: placeParam(from), toPlace: placeParam(to), directModes: mode, maxDirectTime: 6 * 3600, numItineraries: 1, language: "it", time: new Date().toISOString() });
      const d = (plan.direct || []);
      if (!d.length) throw first;
      return d.map((it) => {
        const legs = it.legs || [];
        return { kind: "road", mode, duration: it.duration, distance: legs.reduce((a, l) => a + (l.distance || 0), 0), startTime: it.startTime, endTime: it.endTime,
          geometry: legs.flatMap((l) => decodePolyline(l.legGeometry.points, l.legGeometry.precision)),
          steps: legs.flatMap((l) => (l.steps || []).map((s) => ({ text: motisStepText(s), distance: s.distance }))) };
      });
    }
  }

  const DIR = { "left": "a sinistra", "right": "a destra", "slight left": "leggermente a sinistra", "slight right": "leggermente a destra", "sharp left": "decisamente a sinistra", "sharp right": "decisamente a destra", "straight": "dritto", "uturn": "inversione a U" };
  function osrmText(s, mode) {
    const m = s.maneuver || {}; const name = s.name || s.ref || ""; const mod = DIR[m.modifier] || "";
    const on = name ? ` su ${name}` : "";
    switch (m.type) {
      case "depart": return `Parti${on}${mode === "WALK" ? " a piedi" : ""}`;
      case "arrive": return "Sei arrivato a destinazione";
      case "roundabout": case "rotary": case "exit roundabout": case "exit rotary": return `Alla rotonda prendi la ${m.exit ? m.exit + "ª " : ""}uscita${name ? " verso " + name : ""}`;
      case "roundabout turn": return `Alla rotonda gira ${mod}${on}`;
      case "fork": return `Al bivio tieni ${mod || "la direzione"}${on}`;
      case "merge": return `Immettiti${on}`;
      case "on ramp": return `Prendi la rampa${name ? " per " + name : ""}`;
      case "off ramp": return `Prendi l'uscita${name ? " per " + name : ""}`;
      case "end of road": return `In fondo alla strada gira ${mod}${on}`;
      case "new name": case "continue": case "notification": return m.modifier === "uturn" ? `Fai inversione a U${on}` : (name ? `Continua su ${name}` : "");
      case "turn": default:
        if (m.modifier === "straight") return name ? `Prosegui dritto su ${name}` : "Prosegui dritto";
        if (m.modifier === "uturn") return `Fai inversione a U${on}`;
        return `Gira ${mod}${on}`.trim();
    }
  }
  const MDIR = { DEPART: "Parti", HARD_LEFT: "Gira decisamente a sinistra", LEFT: "Gira a sinistra", SLIGHTLY_LEFT: "Tieni leggermente a sinistra", CONTINUE: "Continua", SLIGHTLY_RIGHT: "Tieni leggermente a destra", RIGHT: "Gira a destra", HARD_RIGHT: "Gira decisamente a destra", CIRCLE_CLOCKWISE: "Alla rotonda prosegui", CIRCLE_COUNTERCLOCKWISE: "Alla rotonda prosegui", STAIRS: "Prendi le scale", ELEVATOR: "Prendi l'ascensore", UTURN_LEFT: "Fai inversione", UTURN_RIGHT: "Fai inversione" };
  function motisStepText(s) { const base = MDIR[s.relativeDirection] || "Continua"; return s.streetName ? `${base} su ${s.streetName}` : base; }

  // ---------- Risultati ----------
  function legChip(l) {
    if (l.mode === "WALK") return `<span class="chip walk">${ICONS.WALK}${Math.max(1, Math.round(l.duration / 60))}′</span>`;
    if (l.mode === "CAR") return `<span class="chip" style="background:var(--car)">${ICONS.CAR}</span>`;
    const name = l.routeShortName || l.displayName || l.tripShortName || modeName(l.mode);
    const bg = l.routeColor ? "#" + l.routeColor : "var(--transit)";
    const fg = l.routeTextColor ? "#" + l.routeTextColor : "#fff";
    return `<span class="chip" style="background:${bg};color:${fg}">${modeIcon(l.mode)}${esc(name)}</span>`;
  }
  function modeIcon(m) { if (/RAIL|SUBURBAN|LONG_DISTANCE|HIGHSPEED|NIGHT_RAIL/.test(m)) return ICONS.RAIL; if (m === "TRAM") return ICONS.TRAM; return ""; }
  function modeName(m) { return ({ BUS: "Bus", COACH: "Pullman", TRAM: "Tram", RAIL: "Treno", REGIONAL_RAIL: "Regionale", REGIONAL_FAST_RAIL: "Reg. veloce", HIGHSPEED_RAIL: "Alta velocità", LONG_DISTANCE: "Intercity", SUBURBAN: "Treno", SUBWAY: "Metro", FERRY: "Traghetto", FUNICULAR: "Funicolare" })[m] || "Linea"; }

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
        ${firstT && firstT.realTime ? (dl > 0 ? `<span class="late">+${dl} min</span>` : '<span class="rt">In orario</span>') : ""}</div></button>`;
  }

  function showResults() {
    const P = state.lastPlan;
    const all = P.items.concat(P.direct.filter((d) => d.duration <= 40 * 60));
    const title = P.mode === "TRANSIT" ? `${esc(state.to.name)}` : (P.mode === "CAR" ? "In auto" : "A piedi");
    let html;
    if (!all.length) {
      html = P.mode === "TRANSIT"
        ? errorBox("Nessun collegamento con i mezzi in questo orario. Prova un altro orario, oppure scegli come partenza o arrivo una fermata vicina.")
        : errorBox("Nessun percorso trovato.");
    } else {
      html = `<div class="list">${all.map(itinCard).join("")}</div>` +
        (P.mode === "TRANSIT" && state.nextCursor ? '<div style="margin-top:10px"><button class="btn wide" data-more>Mostra partenze successive</button></div>' : "");
    }
    view(P.mode === "TRANSIT" ? "Verso " + state.to.name : title, html, { root: true, level: 1,
      draw: () => { routeLayer.clearLayers(); if (all[0]) drawItin(all[0], true); },
      bind: (root) => {
        root.querySelectorAll("[data-it]").forEach((b) => b.onclick = () => showItin(all[+b.dataset.it]));
        const more = root.querySelector("[data-more]"); if (more) more.onclick = () => { more.disabled = true; more.textContent = "Carico…"; search(state.nextCursor); };
      } });
  }

  function drawItin(it, light) {
    routeLayer.clearLayers();
    const pts = [];
    const casing = cssVar("--surface") || "#fff";
    if (it.kind === "road") {
      const col = it.mode === "CAR" ? cssVar("--car") : cssVar("--walk");
      L.polyline(it.geometry, { color: casing, weight: 9, opacity: light ? 0.6 : 0.9 }).addTo(routeLayer);
      L.polyline(it.geometry, { color: col, weight: 6, opacity: light ? 0.7 : 1, dashArray: it.mode === "WALK" ? "2 9" : null, lineCap: "round" }).addTo(routeLayer);
      pts.push(...it.geometry);
    } else {
      for (const l of it.legs || []) {
        const g = decodePolyline(l.legGeometry.points, l.legGeometry.precision); pts.push(...g);
        if (l.mode === "WALK" || l.mode === "CAR") {
          L.polyline(g, { color: l.mode === "CAR" ? cssVar("--car") : cssVar("--walk"), weight: 5, dashArray: l.mode === "WALK" ? "2 9" : null, lineCap: "round", opacity: light ? 0.7 : 1 }).addTo(routeLayer);
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

  // ---------- Dettaglio di un percorso ----------
  function showItin(it) {
    let html = "";
    if (it.kind === "road") {
      html = `<div class="meta" style="margin-bottom:8px"><span><b>${fmtDur(it.duration)}</b></span><span>${fmtDist(it.distance)}</span>${it.mode === "CAR" ? "<span>tempo senza traffico</span>" : ""}</div>
        <ol class="steps">${it.steps.map((s) => `<li><span>${esc(s.text)}</span><span>${s.distance >= 10 ? fmtDist(s.distance) : ""}</span></li>`).join("")}</ol>
        ${externalNav()}`;
      view(it.mode === "CAR" ? "In auto · " + fmtDur(it.duration) : "A piedi · " + fmtDur(it.duration), html, { push: true, level: 1, draw: () => drawItin(it) });
      return;
    }
    const legs = it.legs || [];
    html += '<div class="tl">';
    legs.forEach((l, i) => {
      const isT = l.mode !== "WALK" && l.mode !== "CAR";
      const col = isT ? (l.routeColor ? "#" + l.routeColor : "var(--transit)") : "var(--walk)";
      const d = delayMin(l.startTime, l.scheduledStartTime);
      const timeCell = (iso, sched) => { const dd = delayMin(iso, sched); return `${fmtTime(iso)}${dd > 0 ? `<small class="late">+${dd}</small>` : (l.realTime && isT ? '<small class="rt">live</small>' : "")}`; };
      html += `<div class="stop" style="--c:${col}"><div class="t">${timeCell(l.startTime, l.scheduledStartTime)}</div><div class="node"></div><div class="n"><b>${esc(i === 0 && !isT && state.from ? state.from.name : l.from.name)}</b>${l.from.track ? `<span class="small muted">Binario ${esc(l.from.track)}</span>` : ""}</div></div>`;
      html += `<div class="seg" style="--c:${col}"><div></div><div class="bar ${isT ? "" : "dash"}"></div><div class="body">`;
      if (!isT) {
        html += `<div class="muted">${ICONS.WALK.replace("<svg", '<svg width="16" height="16" style="vertical-align:-3px"')} A piedi ${fmtDur(l.duration)}${l.distance ? " · " + fmtDist(l.distance) : ""}</div>`;
        const st = (l.steps || []).map((s) => ({ text: motisStepText(s), distance: s.distance })).filter((s) => s.distance > 5);
        if (st.length > 1) html += `<details><summary>Indicazioni</summary><ol class="steps">${st.map((s) => `<li><span>${esc(s.text)}</span><span>${fmtDist(s.distance)}</span></li>`).join("")}</ol></details>`;
      } else {
        const inter = l.intermediateStops || [];
        html += `<div>${legChip(l)} <b>→ ${esc(l.headsign || (l.tripTo && l.tripTo.name) || "")}</b></div>
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
    } });
  }
  function externalNav() {
    if (!state.to) return "";
    const geo = `geo:${state.to.lat},${state.to.lon}?q=${state.to.lat},${state.to.lon}`;
    return `<div class="label">Navigazione vocale</div><p class="small muted" style="margin:0 0 8px">Per la guida passo passo con la voce puoi aprire la destinazione in un'app di navigazione installata, ad esempio Organic Maps o OsmAnd.</p><a class="btn" href="${esc(geo)}">Apri in un'app di navigazione</a>`;
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
      const html = `<div style="margin-bottom:10px">${legChip(l)} <b>→ ${esc(l.headsign || l.to.name)}</b><div class="small muted">${esc(l.agencyName || "")}${l.realTime ? ' · <span class="rt">dati in tempo reale</span>' : " · orario programmato"}</div></div>
        <div class="mini" style="font-size:15px;gap:2px">${stops.map((s) => {
          const t = s.departure || s.arrival; const past = t && new Date(t) < now; const hl = s.stopId && s.stopId === highlightStopId;
          const dd = delayMin(t, s.scheduledDeparture || s.scheduledArrival);
          return `<div style="padding:6px 0;border-bottom:1px solid var(--line);${past ? "opacity:.55;" : ""}${hl ? "font-weight:700;" : ""}"><span style="min-width:48px">${fmtTime(t)}${dd > 0 ? ` <small class="late">+${dd}</small>` : ""}</span><span>${esc(s.name)}</span></div>`;
        }).join("")}</div>`;
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

  // ---------- Partenze da una fermata ----------
  async function showDepartures(stop) {
    pushCurrent();
    loading(stop.name);
    map.setView([stop.lat, stop.lon], Math.max(map.getZoom(), 16));
    try {
      const r = await motis("stoptimes", { stopId: stop.id, n: 25, time: new Date().toISOString(), language: "it" });
      const list = r.stopTimes || [];
      let lastDay = dayLabel(new Date(Date.now()).toISOString());
      const html = `<div class="row" style="margin-bottom:6px"><button class="btn small primary" data-go="to">Portami qui</button><button class="btn small" data-go="from">Parti da qui</button></div>
        ${list.length ? list.map((s, i) => {
          const t = s.place.departure || s.place.arrival; const sch = s.place.scheduledDeparture || s.place.scheduledArrival;
          const day = dayLabel(t); const head = day !== lastDay ? `<div class="label">${esc(day)}</div>` : ""; lastDay = day;
          const m = minutesUntil(t); const dd = delayMin(t, sch);
          const when = m <= 0 ? "ora" : (m < 60 ? `${m} min` : fmtTime(t));
          const bg = s.routeColor ? "#" + s.routeColor : "var(--transit)"; const fg = s.routeTextColor ? "#" + s.routeTextColor : "#fff";
          const name = s.routeShortName || s.displayName || s.tripShortName || modeName(s.mode);
          return `${head}<button class="dep" data-d="${i}"><span class="chip" style="background:${bg};color:${fg}">${modeIcon(s.mode)}${esc(name)}</span>
            <span class="hs"><b>${esc(s.headsign || (s.tripTo && s.tripTo.name) || "")}</b><span class="small muted">${esc(s.agencyName || "")}${s.place.track ? " · bin. " + esc(s.place.track) : ""}</span></span>
            <span class="in ${s.cancelled || s.tripCancelled ? "cancel" : ""}">${when}<small>${fmtTime(t)}${s.realTime ? (dd > 0 ? ` <span class="late">+${dd}</span>` : ' <span class="rt">live</span>') : ""}</small></span></button>`;
        }).join("") : '<p class="empty">Nessuna partenza trovata da questa fermata.</p>'}`;
      view(stop.name, html, { level: 1, draw: () => { routeLayer.clearLayers(); L.circleMarker([stop.lat, stop.lon], { radius: 8, color: cssVar("--surface"), weight: 3, fillColor: cssVar("--transit"), fillOpacity: 1 }).addTo(routeLayer); }, bind: (root) => {
        root.querySelectorAll("[data-go]").forEach((b) => b.onclick = () => setPlace(b.dataset.go, { ...stop, type: "STOP" }));
        root.querySelectorAll("[data-d]").forEach((b) => b.onclick = () => { const s = list[+b.dataset.d]; showTrip(s.tripId, stop.id); });
      } });
    } catch (e) {
      view(stop.name, errorBox(e.message), { level: 1, kind: "error" });
    }
  }

  // ---------- Avvio ----------
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
      if (!$("#sugg").hidden) { hideSugg(); blurInputs(); return; }
      if (map._popup && map.hasLayer(map._popup)) { map.closePopup(); return; }
      if (!$("#back").hidden) { $("#back").click(); return; }
      if (state.viewKind !== "home") { state.from = null; state.to = null; syncInputs(); drawPins(); routeLayer.clearLayers(); homeView(); return; }
      capApp.exitApp();
    });
  }

  // Per i test
  window.__girovia = { map, prettyName, decodePolyline, osrmText, fmtDur, fmtDist, state, showResults, showItin, view };
})();
