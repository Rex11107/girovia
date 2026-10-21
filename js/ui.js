// Pannello inferiore, icone e piccoli elementi di interfaccia.

import { state, store } from "./state.js";
import { routeLayer } from "./map.js";
import { CAUSE, esc, modeName } from "./util.js";

export const $ = (s, r = document) => r.querySelector(s);
export const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

// Tema: "auto" segue il telefono, oppure chiaro o scuro fisso (theme.js lo applica già all'avvio)
export function getTheme() { const t = store("theme"); return t === "light" || t === "dark" ? t : "auto"; }
export function applyTheme(t) {
  if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
  else document.documentElement.removeAttribute("data-theme");
  store("theme", t === "light" || t === "dark" ? t : null);
  const bg = cssVar("--bg");
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", bg));
  // App Android: icone della barra di stato leggibili sul nuovo sfondo
  const dark = t === "dark" || (t === "auto" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const C = window.Capacitor, sb = C && C.Plugins && C.Plugins.SystemBars;
  if (sb && sb.setStyle) sb.setStyle({ style: t === "auto" ? "DEFAULT" : (dark ? "DARK" : "LIGHT") }).catch(() => {});
  if (state.currentDraw) state.currentDraw(); // i colori dei percorsi sulla mappa seguono il tema
}

export function toast(msg) {
  const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; t.setAttribute("role", "status");
  document.body.appendChild(t); setTimeout(() => t.remove(), 3500);
}

export const ICONS = {
  STOP: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="3" width="14" height="15" rx="3"/><path d="M5 11h14M8 21l1-3M16 21l-1-3"/></svg>',
  ADDRESS: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s-7-6.2-7-12a7 7 0 0114 0c0 5.8-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/></svg>',
  PLACE: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20V9l8-5 8 5v11z"/><path d="M9 20v-6h6v6"/></svg>',
  ME: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>',
  RECENT: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  WALK: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="13" cy="4" r="2"/><path d="M11 21l2-6-3-3 1-5 4 3 3 1M10 12l-3 2"/></svg>',
  CAR: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M4 16v-4l2-5h12l2 5v4z"/><circle cx="7.5" cy="16.5" r="1.8"/><circle cx="16.5" cy="16.5" r="1.8"/></svg>',
  RAIL: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><rect x="6" y="3" width="12" height="14" rx="3"/><path d="M6 11h12M8 21l2-4M16 21l-2-4"/></svg>',
  TRAM: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 3h6M12 3v3M9 21l1-3M15 21l-1-3"/></svg>',
  FAV: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/></svg>',
  HOME: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 11l8-7 8 7v9H4z"/><path d="M10 20v-5h4v5"/></svg>',
  WORK: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5h6v2M3 13h18"/></svg>',
  TRIP: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="6" cy="18" r="2.5"/><rect x="15.5" y="3.5" width="5" height="5" rx="1"/><path d="M8 16.5c4-1 2-7 7.5-9"/></svg>'
};
export const TRASH = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';

export const WARN_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 3l9.5 17h-19z"/><path d="M12 10v4M12 17.5v.01"/></svg>';
export function alertsHtml(list) {
  if (!list.length) return "";
  return `<div class="alerts">${list.map((a) => {
    const sev = a.severityLevel === "SEVERE" ? "severe" : (a.severityLevel === "INFO" ? "info" : "warn");
    const cause = CAUSE[a.cause] ? `<span class="acause">${esc(CAUSE[a.cause])}</span>` : "";
    const head = a.headerText || (a.descriptionText || "").slice(0, 90);
    const desc = a.descriptionText && a.descriptionText !== a.headerText ? a.descriptionText : "";
    return `<div class="alert ${sev}" role="note">${WARN_ICON}<div class="abody">${cause}<b>${esc(head)}</b>${desc ? `<details><summary>Dettagli</summary><p>${esc(desc)}</p></details>` : ""}${a.url ? `<a href="${esc(a.url)}" target="_blank" rel="noopener">Maggiori informazioni</a>` : ""}</div></div>`;
  }).join("")}</div>`;
}

export function legChip(l) {
  if (l.mode === "WALK") return `<span class="chip walk">${ICONS.WALK}${Math.max(1, Math.round(l.duration / 60))}′</span>`;
  if (l.mode === "CAR") return `<span class="chip" style="background:var(--car)">${ICONS.CAR}</span>`;
  const name = l.routeShortName || l.displayName || l.tripShortName || modeName(l.mode);
  const bg = l.routeColor ? "#" + l.routeColor : "var(--transit)";
  const fg = l.routeTextColor ? "#" + l.routeTextColor : "#fff";
  return `<span class="chip" style="background:${bg};color:${fg}">${modeIcon(l.mode)}${esc(name)}</span>`;
}
export function modeIcon(m) { if (/RAIL|SUBURBAN|LONG_DISTANCE|HIGHSPEED|NIGHT_RAIL/.test(m)) return ICONS.RAIL; if (m === "TRAM") return ICONS.TRAM; return ""; }

// ---------- Pannello inferiore ----------
export const SNAP = () => { const h = window.innerHeight; return [Math.round(h * 0.22), Math.round(h * 0.5), Math.round(h * 0.86)]; };
export function setSheet(level) { const s = SNAP(); document.documentElement.style.setProperty("--sheet-h", s[level] + "px"); }

function sheetDrag() {
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
}
// Salva la vista attuale per il tasto Indietro (le schermate di caricamento non si salvano)
export function pushCurrent() {
  if (state.viewKind === "loading" || state.viewKind === "error" || !state.viewKind) return;
  state.stack.push({ title: $("#sheetTitle").textContent, html: $("#sheetBody").innerHTML, bind: state.currentBind, draw: state.currentDraw, kind: state.viewKind });
}
export function view(title, html, opts = {}) {
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
export const loading = (title) => view(title, '<div class="spinner" role="status" aria-label="Caricamento"></div>', { level: 1, kind: "loading" });
export const errorBox = (msg, retry) => `<div class="err">${esc(msg)}</div>${retry ? '<button class="btn" data-retry>Riprova</button>' : ""}`;

export function initSheet() {
  sheetDrag();
  $("#back").onclick = () => {
    const prev = state.stack.pop(); if (!prev) return;
    $("#sheetTitle").textContent = prev.title; $("#sheetBody").innerHTML = prev.html;
    state.currentBind = prev.bind; state.currentDraw = prev.draw; state.viewKind = prev.kind || "view";
    if (prev.bind) prev.bind($("#sheetBody"));
    if (prev.draw) prev.draw(); else { routeLayer.clearLayers(); }
    $("#back").hidden = state.stack.length === 0;
  };
}
