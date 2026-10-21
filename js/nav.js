// Navigazione: auto e piedi con voce e ricalcolo; mezzi con avvisi di discesa.

import { motis, osrm } from "./api.js";
import { drawItin, map, routeLayer, showMe } from "./map.js";
import { decodePolyline, fmtDist, fmtDur, fmtTime, itinAlerts, legAlerts, lineName, lowerFirst, makeLine, motisSteps, osrmItem, projectOn, spokenDist } from "./util.js";
import { blurInputs, hideSugg } from "./places.js";
import { $, ICONS, cssVar, legChip, toast } from "./ui.js";
import { CFG, NAV, state, store } from "./state.js";

// Auto e piedi: segue il GPS, indicazione successiva, voce, ricalcolo se esci dal percorso.
// Mezzi: segue il viaggio tratta per tratta e avvisa quando scendere.
const ROT = { "straight": 0, "slight right": 45, "right": 90, "sharp right": 135, "uturn": 180, "sharp left": -135, "left": -90, "slight left": -45 };
function arrowSvg(st) {
  if (!st) return "";
  if (st.type === "arrive") return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 21V4M6 4h11l-2.5 4L17 12H6"/></svg>';
  if (/roundabout|rotary/.test(st.type || "")) return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="10" r="4.5"/><path d="M12 21v-6.5M15.5 7l3-3M18.5 4v3.5M18.5 4H15"/></svg>';
  if (st.mod === "uturn") return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M16 21V9a4 4 0 00-8 0v4M4.5 10L8 13.5 11.5 10"/></svg>';
  const r = ROT[st.mod] || 0;
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><g transform="rotate(${r} 12 12)"><path d="M12 21V5M6 11l6-6 6 6"/></g></svg>`;
}

// Funzioni del telefono: nell'app Android usa i componenti nativi, nel browser quelli web
function capPlugin(name) {
  const C = window.Capacitor;
  try { return C && C.isPluginAvailable && C.isPluginAvailable(name) ? ((C.Plugins && C.Plugins[name]) || (C.registerPlugin && C.registerPlugin(name))) : null; } catch (e) { return null; }
}
export function speak(text) {
  NAV.lastSpoken = text;
  if (!NAV.voice || !text) return;
  const tts = capPlugin("TextToSpeech");
  if (tts) { tts.speak({ text, lang: "it-IT", rate: 1.0, pitch: 1.0, volume: 1.0, category: "playback", queueStrategy: 0 }).catch(() => {}); return; }
  try { const u = new SpeechSynthesisUtterance(text); u.lang = "it-IT"; window.speechSynthesis.cancel(); window.speechSynthesis.speak(u); } catch (e) {}
}
function hush() { const tts = capPlugin("TextToSpeech"); if (tts) tts.stop().catch(() => {}); try { window.speechSynthesis.cancel(); } catch (e) {} }
function buzz(ms) { const h = capPlugin("Haptics"); if (h) { h.vibrate({ duration: ms }).catch(() => {}); return; } try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} }
async function stayAwake(on) {
  const k = capPlugin("KeepAwake");
  try {
    if (k) { await (on ? k.keepAwake() : k.allowSleep()); return; }
    if (on && navigator.wakeLock) NAV.lock = await navigator.wakeLock.request("screen");
    else if (!on && NAV.lock) { await NAV.lock.release(); NAV.lock = null; }
  } catch (e) {}
}
// Mezzi: notifica all'orario di arrivo, utile col telefono in tasca (solo app Android)
async function scheduleAlerts(legs) {
  const ln = capPlugin("LocalNotifications"); NAV.notifIds = [];
  if (!ln) return;
  try {
    const perm = await ln.requestPermissions();
    if (perm && perm.display && perm.display !== "granted") return;
    const list = [];
    legs.forEach((g, i) => {
      if (!g.isT) return;
      const at = new Date(new Date(g.l.endTime).getTime() - 120000);
      if (at.getTime() < Date.now() + 30000) return;
      list.push({ id: 7100 + i, title: "Prepara a scendere", body: `Alla prossima: ${g.l.to.name} (${lineName(g.l)})`, schedule: { at, allowWhileIdle: true } });
    });
    if (list.length) { await ln.schedule({ notifications: list }); NAV.notifIds = list.map((x) => ({ id: x.id })); }
  } catch (e) {}
}
function cancelAlerts() { const ln = capPlugin("LocalNotifications"); if (ln && NAV.notifIds && NAV.notifIds.length) ln.cancel({ notifications: NAV.notifIds }).catch(() => {}); NAV.notifIds = []; }

function banner(o) {
  $("#navIcon").innerHTML = o.icon || "";
  $("#navDist").textContent = o.dist || "";
  $("#navInstr").textContent = o.text || "";
  $("#navThen").textContent = o.then || "";
  $("#nav").classList.toggle("transit", !!o.transit);
}
export const summary = (t) => { $("#navSummary").textContent = t; };
function voiceBtn() { const b = $("#navVoice"); b.setAttribute("aria-pressed", String(NAV.voice)); b.innerHTML = NAV.voice ? VOICE_ON : VOICE_OFF; b.setAttribute("aria-label", NAV.voice ? "Voce attiva" : "Voce spenta"); }
const VOICE_ON = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 10v4h4l5 4V6L8 10z"/><path d="M16 9a4 4 0 010 6M18.5 6.5a7.5 7.5 0 010 11"/></svg>';
const VOICE_OFF = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 10v4h4l5 4V6L8 10z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>';

// Imposta il percorso da seguire (auto, piedi o tratta a piedi di un viaggio con i mezzi)
function setRoute(line, steps, duration, arriveText) {
  NAV.line = line; NAV.duration = duration || 0; NAV.hint = 0; NAV.done = new Set(); NAV.off = 0;
  NAV.steps = (steps || []).filter((x) => x.loc && x.type !== "arrive").map((x) => ({ ...x, at: x.type === "depart" ? 0 : projectOn(line, x.loc).along })).sort((a, b) => a.at - b.at);
  NAV.steps.push({ text: arriveText || "Arrivo a destinazione", type: "arrive", at: line.len });
}
function drawNav(pts, color, dashed) {
  routeLayer.clearLayers();
  L.polyline(pts, { color: cssVar("--surface"), weight: 11, opacity: .9 }).addTo(routeLayer);
  L.polyline(pts, { color, weight: 7, dashArray: dashed ? "2 10" : null, lineCap: "round" }).addTo(routeLayer);
}

function beginNav() {
  NAV.active = true; NAV.arrived = false; NAV.follow = true;
  document.body.classList.add("navigating"); $("#nav").hidden = false; $("#navBar").hidden = false; $("#navCenter").hidden = true;
  voiceBtn(); hideSugg(); blurInputs(); map.closePopup(); stayAwake(true);
  if (!navigator.geolocation) { toast("Questo dispositivo non fornisce la posizione."); return; }
  NAV.watch = navigator.geolocation.watchPosition(onFix, (err) => {
    if (err.code === 1) { toast("Serve il permesso di posizione per navigare."); stopNav(); }
    else summary("In attesa del segnale GPS…");
  }, { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 });
}
export function stopNav() {
  if (!NAV.active) return;
  NAV.active = false;
  if (NAV.watch != null && navigator.geolocation) navigator.geolocation.clearWatch(NAV.watch);
  NAV.watch = null; hush(); cancelAlerts(); stayAwake(false);
  document.body.classList.remove("navigating"); $("#nav").hidden = true; $("#navBar").hidden = true;
  if (state.currentDraw) state.currentDraw();
}
function onFix(pos) {
  if (!NAV.active) return;
  const p = [pos.coords.latitude, pos.coords.longitude], acc = pos.coords.accuracy || 0;
  NAV.pos = p; showMe(p);
  if (NAV.follow) map.setView(p, NAV.kind === "road" && NAV.mode === "CAR" ? 17 : 18, { animate: true });
  if (NAV.arrived) return;
  if (NAV.kind === "road") { const r = guide(p, acc, NAV.mode, true); if (r === "arrived") arrived(); }
  else tripUpdate(p, acc);
}

// Auto e piedi: avanzamento, annunci, uscita dal percorso
function guide(p, acc, mode, allowReroute) {
  const pr = projectOn(NAV.line, p, NAV.hint); NAV.hint = pr.idx;
  NAV.off = pr.dist > (mode === "CAR" ? 45 : 30) && acc <= 50 ? NAV.off + 1 : 0;
  if (allowReroute && NAV.off >= 3) { if (Date.now() - (NAV.lastReroute || 0) > 15000) reroute(p); return "reroute"; }
  const remain = Math.max(0, NAV.line.len - pr.along);
  if (remain < (mode === "CAR" ? 35 : 20)) return "arrived";
  const k = NAV.steps.findIndex((x) => x.at > pr.along + 3 && x.type !== "depart");
  const next = NAV.steps[k < 0 ? NAV.steps.length - 1 : k], key = k < 0 ? NAV.steps.length - 1 : k;
  const d = Math.max(0, next.at - pr.along), after = NAV.steps[key + 1];
  banner({ icon: arrowSvg(next), dist: fmtDist(d), text: next.text, then: after && after.at - next.at < 150 ? "Poi: " + lowerFirst(after.text) : "" });
  const ths = mode === "CAR" ? [1000, 400, 120, 25] : [70, 15];
  const th = ths.filter((t) => d <= t).pop();
  if (th != null && !NAV.done.has(key + ":" + th)) {
    ths.filter((t) => t >= th).forEach((t) => NAV.done.add(key + ":" + t));
    const last = th === ths[ths.length - 1];
    speak(last ? next.text : `Tra ${spokenDist(d)}, ${lowerFirst(next.text)}`);
  }
  if (NAV.kind === "road") {
    const left = NAV.line.len ? NAV.duration * remain / NAV.line.len : 0;
    summary(`${fmtDur(left)} · ${fmtDist(remain)} · arrivo ${fmtTime(new Date(Date.now() + left * 1000).toISOString())}`);
  }
  return "ok";
}
export async function reroute(p) {
  NAV.lastReroute = Date.now(); NAV.off = 0;
  speak("Ricalcolo il percorso"); banner({ icon: "", dist: "", text: "Ricalcolo il percorso…" });
  try {
    const routes = await osrm(NAV.mode === "CAR" ? CFG.routingCar : CFG.routingFoot, { lat: p[0], lon: p[1] }, NAV.dest, false);
    if (!NAV.active) return;
    const it = osrmItem(routes[0], NAV.mode);
    setRoute(makeLine(it.geometry), it.steps, it.duration);
    drawNav(it.geometry, NAV.mode === "CAR" ? cssVar("--car") : cssVar("--walk"), NAV.mode === "WALK");
  } catch (e) {
    if (navigator.onLine === false) summary("Offline · ricalcolo appena torna la rete");
    else toast("Ricalcolo non riuscito: " + e.message);
  }
}
function arrived() {
  NAV.arrived = true;
  banner({ icon: arrowSvg({ type: "arrive" }), dist: "", text: "Sei arrivato" + (NAV.dest ? ": " + NAV.dest.name : "") });
  summary("Buon proseguimento!");
  speak("Sei arrivato a destinazione"); buzz(400);
}

export function startRoadNav(it) {
  NAV.kind = "road"; NAV.mode = it.mode; NAV.dest = state.to; NAV.lastReroute = 0;
  setRoute(makeLine(it.geometry), it.steps, it.duration);
  drawNav(it.geometry, it.mode === "CAR" ? cssVar("--car") : cssVar("--walk"), it.mode === "WALK");
  const first = NAV.steps.find((x) => x.type !== "depart") || NAV.steps[0];
  banner({ icon: arrowSvg(first), dist: fmtDist(first.at), text: first.text });
  summary("In attesa del segnale GPS…");
  beginNav();
  speak((NAV.steps[0] && NAV.steps[0].type === "depart" ? NAV.steps[0].text + ". " : "") + "Navigazione avviata");
}

// Mezzi: segue il viaggio tratta per tratta
export function startTripNav(it) {
  NAV.kind = "trip"; NAV.mode = "WALK"; NAV.dest = state.to; NAV.endTime = it.endTime;
  NAV.legs = (it.legs || []).map((l) => {
    let pts = decodePolyline(l.legGeometry && l.legGeometry.points, l.legGeometry && l.legGeometry.precision);
    if (pts.length < 2) pts = [[l.from.lat, l.from.lon], [l.to.lat, l.to.lon]];
    const line = makeLine(pts), isT = l.mode !== "WALK" && l.mode !== "CAR";
    const g = { l, isT, line, pts };
    if (isT) g.stops = [l.from, ...(l.intermediateStops || []), l.to].map((x) => ({ name: x.name, stopId: x.stopId, time: x.arrival || x.departure, at: projectOn(line, [x.lat, x.lon]).along }));
    else g.steps = motisSteps(l.steps);
    return g;
  });
  if (!NAV.legs.length) return;
  NAV.seenAlerts = new Set(); NAV.refreshedAt = Date.now();
  drawItin(it);
  beginNav();
  enterLeg(0);
  scheduleAlerts(NAV.legs);
  const al = itinAlerts(it);
  al.forEach((a) => NAV.seenAlerts.add(a.headerText || a.descriptionText));
  if (al.length) toast("Avviso di servizio: " + (al[0].headerText || al[0].descriptionText));
}
const tripSummary = () => summary(`Tratta ${NAV.li + 1} di ${NAV.legs.length} · arrivo ${fmtTime(NAV.endTime)}`);

// Viaggio seguito: ogni minuto rilegge le corse (ritardi e avvisi in tempo reale, quando l'azienda li pubblica)
export async function refreshTrip(force) {
  if (!NAV.active || NAV.kind !== "trip" || NAV.refreshing || NAV.arrived) return;
  if (!force && Date.now() - (NAV.refreshedAt || 0) < 60000) return;
  NAV.refreshing = true; NAV.refreshedAt = Date.now();
  let shift = 0, changed = false;
  try {
    for (let i = NAV.li; i < NAV.legs.length; i++) {
      const g = NAV.legs[i];
      if (!g.isT) { // le tratte a piedi seguono il ritardo della tratta precedente
        if (shift) { g.l.startTime = new Date(new Date(g.l.startTime).getTime() + shift).toISOString(); g.l.endTime = new Date(new Date(g.l.endTime).getTime() + shift).toISOString(); }
        continue;
      }
      if (!g.l.tripId) continue;
      const it = await motis("trip", { tripId: g.l.tripId, language: "it" });
      const tl = (it.legs || []).find((x) => x.tripId === g.l.tripId) || (it.legs || [])[0];
      if (!tl) continue;
      const all = [tl.from, ...(tl.intermediateStops || []), tl.to];
      const byId = (id) => all.find((x) => id && x.stopId === id);
      g.stops.forEach((st) => { const f = byId(st.stopId); const t = f && (f.arrival || f.departure); if (t && t !== st.time) { st.time = t; changed = true; } });
      const on = byId(g.l.from.stopId), off = byId(g.l.to.stopId);
      if (on && on.departure && on.departure !== g.l.startTime) { g.l.startTime = on.departure; changed = true; }
      if (off && off.arrival && off.arrival !== g.l.endTime) {
        shift = new Date(off.arrival) - new Date(g.l.endTime);
        g.l.endTime = off.arrival; changed = true;
      } else shift = 0;
      if (tl.cancelled && !g.l.cancelled) { g.l.cancelled = true; speak(`Attenzione: la corsa ${lineName(g.l)} risulta soppressa`); toast(`${lineName(g.l)}: corsa soppressa`); buzz(800); }
      for (const a of legAlerts(tl)) {
        const k = a.headerText || a.descriptionText;
        if (NAV.seenAlerts.has(k)) continue;
        NAV.seenAlerts.add(k);
        toast("Avviso di servizio: " + k); speak("Avviso di servizio. " + (a.ttsHeaderText || k)); buzz(300);
      }
    }
    if (changed) {
      const lastLeg = NAV.legs[NAV.legs.length - 1];
      NAV.endTime = lastLeg.l.endTime;
      cancelAlerts(); scheduleAlerts(NAV.legs); // la notifica di discesa segue il ritardo
      tripSummary();
      if (NAV.pos && !NAV.arrived) tripUpdate(NAV.pos, 0);
    }
  } catch (e) { /* senza rete o servizio lento: si riprova al prossimo giro */ }
  finally { NAV.refreshing = false; }
}
function enterLeg(i) {
  NAV.li = i; const g = NAV.legs[i];
  tripSummary();
  if (!g.isT) {
    const next = NAV.legs[i + 1];
    setRoute(g.line, g.steps, g.l.duration, next && next.isT ? `Arrivo alla fermata ${next.l.from.name}` : "Arrivo a destinazione");
    const goal = next && next.isT ? `Vai a piedi alla fermata ${next.l.from.name}` : "Prosegui a piedi verso la destinazione";
    banner({ icon: ICONS.WALK, dist: fmtDist(g.line.len), text: goal });
    speak(goal + (next && next.isT ? `. ${lineName(next.l)} alle ${fmtTime(next.l.startTime)}` : ""));
  } else {
    NAV.line = g.line; NAV.hint = 0; NAV.done = new Set();
    const msg = `Prendi ${lineName(g.l)} direzione ${g.l.headsign || g.l.to.name} alle ${fmtTime(g.l.startTime)}`;
    banner({ icon: legChip(g.l), dist: fmtTime(g.l.startTime), text: msg, then: `Fermata ${g.l.from.name}`, transit: true });
    speak(msg);
  }
}
function tripUpdate(p, acc) {
  const g = NAV.legs[NAV.li], last = NAV.li === NAV.legs.length - 1;
  if (!g.isT) {
    const r = guide(p, acc, "WALK", false);
    if (r === "arrived") { if (last) arrived(); else enterLeg(NAV.li + 1); }
    return;
  }
  const pr = projectOn(g.line, p, NAV.hint); NAV.hint = pr.idx;
  const stops = g.stops, endAt = stops[stops.length - 1].at, alight = stops[stops.length - 1];
  const toEnd = Math.max(0, endAt - pr.along);
  const boarded = NAV.done.has("on") || (pr.along > 120 && pr.dist < 150);
  if (!boarded) {
    banner({ icon: legChip(g.l), dist: fmtTime(g.l.startTime), text: `Aspetta ${lineName(g.l)} → ${g.l.headsign || g.l.to.name}`, then: `Fermata ${g.l.from.name}`, transit: true });
    return;
  }
  NAV.done.add("on");
  const ni = stops.findIndex((x, k) => k > 0 && x.at > pr.along + 40);
  const nextStop = stops[ni < 0 ? stops.length - 1 : ni];
  const left = ni < 0 ? 0 : stops.length - ni;
  banner({ icon: legChip(g.l), dist: left > 1 ? `${left} fermate` : (left === 1 ? "Prossima" : "Ora"), text: `Scendi a ${alight.name}`, then: `Prossima: ${nextStop.name} · arrivo ${fmtTime(alight.time)}`, transit: true });
  if (left <= 1 && !NAV.done.has("prep")) { NAV.done.add("prep"); speak(`Alla prossima fermata scendi: ${alight.name}`); buzz(500); }
  if (toEnd < 250 && !NAV.done.has("now")) { NAV.done.add("now"); speak(`Scendi ora: ${alight.name}`); buzz(1200); }
  if (toEnd < 60) { if (last) arrived(); else enterLeg(NAV.li + 1); }
}

export function initNav() {
  $("#navStop").onclick = stopNav;
  $("#navVoice").onclick = () => { NAV.voice = !NAV.voice; store("voice", NAV.voice); if (!NAV.voice) hush(); voiceBtn(); };
  $("#navCenter").onclick = () => { NAV.follow = true; $("#navCenter").hidden = true; if (NAV.pos) map.setView(NAV.pos, 17); };
  map.on("dragstart", () => { if (NAV.active) { NAV.follow = false; $("#navCenter").hidden = false; } });
}
