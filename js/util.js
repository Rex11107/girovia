// Funzioni pure: formattazione, nomi, geometria, testi delle indicazioni, avvisi.
// Nessun accesso a pagina, rete o memoria: si provano anche con Node (tests/unit).

export const TZ = "Europe/Rome";

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const fmtTime = (iso) => iso ? new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(new Date(iso)) : "";
export const fmtDay = (iso) => new Intl.DateTimeFormat("it-IT", { weekday: "short", day: "numeric", month: "short", timeZone: TZ }).format(new Date(iso));
export function fmtDur(sec) {
  const m = Math.max(1, Math.round(sec / 60));
  if (m < 60) return m + " min";
  const h = Math.floor(m / 60), r = m % 60;
  return h + " h" + (r ? " " + r + " min" : "");
}
export function fmtDist(m) {
  if (m == null) return "";
  if (m < 950) return Math.round(m / 10) * 10 + " m";
  return (m / 1000).toFixed(m < 10000 ? 1 : 0).replace(".", ",") + " km";
}
export const delayMin = (real, sched) => (real && sched) ? Math.round((new Date(real) - new Date(sched)) / 60000) : 0;
export const minutesUntil = (iso) => Math.round((new Date(iso) - Date.now()) / 60000);
export const sameDay = (a, b) => fmtDay(a) === fmtDay(b);
export function dayLabel(iso) {
  const now = Date.now();
  if (fmtDay(iso) === fmtDay(new Date(now).toISOString())) return "Oggi";
  if (fmtDay(iso) === fmtDay(new Date(now + 864e5).toISOString())) return "Domani";
  return fmtDay(iso);
}

// Decodifica polilinea (formato Google) con precisione variabile
export function decodePolyline(str, precision) {
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
export const SMALL = new Set(["di", "de", "del", "dell", "della", "dello", "dei", "degli", "delle", "da", "dal", "dalla", "e", "ed", "in", "a", "al", "alla", "allo", "ai", "agli", "alle", "sul", "sulla", "per", "con", "tra", "fra"]);
export const KEEP = /^(SS|SR|SP|FS|SMN|AT|ATAF|GEST|RFI|TFT|II|III|IV|VI|VII|VIII|IX|XI|XII|XX|XXIV|XXV|A1|A11|FI-PI-LI)$/;
export function prettyName(str) {
  if (typeof str !== "string" || !/[A-ZÀ-Ý]{3}/.test(str)) return str;
  if (str !== str.toUpperCase()) {
    // Testo misto: sistema solo le parole tutte maiuscole (se sono almeno due, o lunghe)
    const caps = (str.match(/(^|[^A-Za-zÀ-ÿ])([A-ZÀ-Ý]{2,})(?![a-zà-ÿ])/g) || []).map((x) => x.replace(/^[^A-ZÀ-Ý]/, ""))
      .filter((w) => !KEEP.test(w) && /[AEIOUÀÈÉÌÒÙ]/.test(w));
    if (!caps.length) return str;
    const many = caps.length >= 2;
    let firstWord = true;
    return str.replace(/[A-Za-zÀ-ÿ0-9]+/g, (w, idx) => {
      const isFirst = firstWord; firstWord = false;
      if (w !== w.toUpperCase() || /\d/.test(w) || KEEP.test(w) || !/[AEIOUÀÈÉÌÒÙ]/.test(w) || !(many || w.length >= 4)) return w;
      const prev = str[idx - 1];
      if (!isFirst && prev !== "'" && SMALL.has(w.toLowerCase())) return w.toLowerCase();
      return w.charAt(0) + w.slice(1).toLowerCase();
    });
  }
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
export function prettify(o) {
  if (Array.isArray(o)) { o.forEach(prettify); return o; }
  if (o && typeof o === "object") for (const k of Object.keys(o)) {
    if ((k === "name" || k === "headsign") && typeof o[k] === "string") o[k] = prettyName(o[k]);
    else if (o[k] && typeof o[k] === "object") prettify(o[k]);
  }
  return o;
}

export function stopModes(modes) {
  if (!Array.isArray(modes) || !modes.length) return "";
  const out = [];
  for (const m of modes) {
    const n = /RAIL|SUBURBAN|LONG_DISTANCE|HIGHSPEED/.test(m) ? "Treno" : ({ BUS: "Bus", COACH: "Pullman", TRAM: "Tram", SUBWAY: "Metro", FERRY: "Traghetto", FUNICULAR: "Funicolare" })[m];
    if (n && !out.includes(n)) out.push(n);
  }
  return out.join(", ");
}
export const placeLabel = (m) => m.type === "ADDRESS" && m.street ? `${m.street}${m.houseNumber ? " " + m.houseNumber : ""}` : m.name;
export function areaLabel(m) {
  const a = (m.areas || []).filter((x) => x.name && x.name !== m.name).sort((x, y) => (y.adminLevel || 0) - (x.adminLevel || 0));
  const names = []; for (const x of a) if (!names.includes(x.name)) names.push(x.name);
  return names.slice(0, 2).join(", ");
}

export const samePlace = (a, b) => a && b && Math.abs(a.lat - b.lat) < 1e-5 && Math.abs(a.lon - b.lon) < 1e-5;
export function placeParam(p) { return `${p.lat},${p.lon}`; }

export function osrmItem(r, mode) {
  const now = Date.now();
  return {
    kind: "road", mode, duration: r.duration, distance: r.distance,
    startTime: new Date(now).toISOString(), endTime: new Date(now + r.duration * 1000).toISOString(),
    geometry: decodePolyline(r.geometry, 6),
    via: r.legs && r.legs[0] && r.legs[0].summary,
    steps: (r.legs || []).flatMap((l) => l.steps || []).map((s) => {
      const m = s.maneuver || {};
      return { text: osrmText(s, mode), distance: s.distance, loc: m.location ? [m.location[1], m.location[0]] : null, type: m.type, mod: m.modifier, exit: m.exit };
    }).filter((s) => s.text)
  };
}
// Passi a piedi di Transitous: testo, posizione e tipo di svolta
export const MMOD = { HARD_LEFT: "sharp left", LEFT: "left", SLIGHTLY_LEFT: "slight left", CONTINUE: "straight", SLIGHTLY_RIGHT: "slight right", RIGHT: "right", HARD_RIGHT: "sharp right", UTURN_LEFT: "uturn", UTURN_RIGHT: "uturn" };
export function motisSteps(steps) {
  return (steps || []).map((s, i) => {
    const g = s.polyline ? decodePolyline(s.polyline.points, s.polyline.precision) : [];
    return { text: motisStepText(s), distance: s.distance, loc: g[0] || null, type: i === 0 ? "depart" : (/CIRCLE/.test(s.relativeDirection) ? "roundabout" : "turn"), mod: MMOD[s.relativeDirection] || "straight" };
  });
}

export const DIR = { "left": "a sinistra", "right": "a destra", "slight left": "leggermente a sinistra", "slight right": "leggermente a destra", "sharp left": "decisamente a sinistra", "sharp right": "decisamente a destra", "straight": "dritto", "uturn": "inversione a U" };
export function osrmText(s, mode) {
  const m = s.maneuver || {}; const name = s.name || s.ref || ""; const mod = DIR[m.modifier] || "";
  const on = name ? ` su ${name}` : "";
  switch (m.type) {
    case "depart": return `Parti${on}${mode === "WALK" ? " a piedi" : (mode === "BIKE" ? " in bici" : "")}`;
    case "arrive": return "Arrivo a destinazione";
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
export const MDIR = { DEPART: "Parti", HARD_LEFT: "Gira decisamente a sinistra", LEFT: "Gira a sinistra", SLIGHTLY_LEFT: "Tieni leggermente a sinistra", CONTINUE: "Continua", SLIGHTLY_RIGHT: "Tieni leggermente a destra", RIGHT: "Gira a destra", HARD_RIGHT: "Gira decisamente a destra", CIRCLE_CLOCKWISE: "Alla rotonda prosegui", CIRCLE_COUNTERCLOCKWISE: "Alla rotonda prosegui", STAIRS: "Prendi le scale", ELEVATOR: "Prendi l'ascensore", UTURN_LEFT: "Fai inversione", UTURN_RIGHT: "Fai inversione" };
export function motisStepText(s) { const base = MDIR[s.relativeDirection] || "Continua"; return s.streetName ? `${base} su ${s.streetName}` : base; }

// ---------- Avvisi di servizio (scioperi, deviazioni…) ----------
// Arrivano dalle aziende tramite Transitous, dentro tratte, fermate e partenze.
export const SEV = { SEVERE: 3, WARNING: 2, INFO: 1, UNKNOWN_SEVERITY: 1 };
export const CAUSE = { STRIKE: "Sciopero", DEMONSTRATION: "Manifestazione", ACCIDENT: "Incidente", WEATHER: "Maltempo", MAINTENANCE: "Lavori", CONSTRUCTION: "Lavori", TECHNICAL_PROBLEM: "Guasto", POLICE_ACTIVITY: "Intervento delle forze dell'ordine", MEDICAL_EMERGENCY: "Emergenza sanitaria", SPECIAL_EVENT: "Evento", HOLIDAY: "Festività" };
export function activeAlert(a) {
  const per = a.communicationPeriod || a.impactPeriod;
  if (!Array.isArray(per) || !per.length) return true;
  const now = Date.now();
  return per.some((r) => (!r.start || new Date(r.start) <= now) && (!r.end || new Date(r.end) >= now));
}
export function collectAlerts(...lists) {
  const out = [], seen = new Set();
  for (const l of lists) for (const a of (l || [])) {
    if (!a || !(a.headerText || a.descriptionText) || !activeAlert(a)) continue;
    const k = (a.headerText || "") + "|" + (a.descriptionText || "").slice(0, 60);
    if (!seen.has(k)) { seen.add(k); out.push(a); }
  }
  return out.sort((x, y) => (SEV[y.severityLevel] || 1) - (SEV[x.severityLevel] || 1));
}
export const legAlerts = (l) => collectAlerts(l.alerts, l.from && l.from.alerts, l.to && l.to.alerts, ...(l.intermediateStops || []).map((x) => x.alerts));
export const itinAlerts = (it) => collectAlerts(...(it.legs || []).map(legAlerts));

export function modeName(m) { return ({ BUS: "Bus", COACH: "Pullman", TRAM: "Tram", RAIL: "Treno", REGIONAL_RAIL: "Regionale", REGIONAL_FAST_RAIL: "Reg. veloce", HIGHSPEED_RAIL: "Alta velocità", LONG_DISTANCE: "Intercity", SUBURBAN: "Treno", SUBWAY: "Metro", FERRY: "Traghetto", FUNICULAR: "Funicolare" })[m] || "Linea"; }
export const lineName = (l) => l.routeShortName || l.displayName || l.tripShortName || modeName(l.mode);

export const RAD = Math.PI / 180, EARTH = 6371000;
export function distM(a, b) { const la = (a[0] + b[0]) / 2 * RAD; const x = (b[1] - a[1]) * RAD * Math.cos(la), y = (b[0] - a[0]) * RAD; return Math.sqrt(x * x + y * y) * EARTH; }
export function makeLine(pts) { const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + distM(pts[i - 1], pts[i])); return { pts, cum, len: cum[cum.length - 1] || 0 }; }
// Punto più vicino sulla linea: distanza dalla linea e metri percorsi lungo di essa
export function projectOn(line, p, hint) {
  const n = line.pts.length;
  if (!n) return { dist: Infinity, along: 0, idx: 0 };
  if (n === 1) return { dist: distM(p, line.pts[0]), along: 0, idx: 0 };
  const kx = Math.cos(p[0] * RAD) * RAD * EARTH, ky = RAD * EARTH;
  const scan = (from, to) => {
    let best = { dist: Infinity, along: 0, idx: 0 };
    for (let i = Math.max(0, from); i < Math.min(n - 1, to); i++) {
      const a = line.pts[i], b = line.pts[i + 1];
      const ax = (a[1] - p[1]) * kx, ay = (a[0] - p[0]) * ky, dx = (b[1] - a[1]) * kx, dy = (b[0] - a[0]) * ky, l2 = dx * dx + dy * dy;
      const t = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
      const cx = ax + t * dx, cy = ay + t * dy, d = Math.sqrt(cx * cx + cy * cy);
      if (d < best.dist) best = { dist: d, along: line.cum[i] + t * (line.cum[i + 1] - line.cum[i]), idx: i };
    }
    return best;
  };
  if (hint != null) { const r = scan(hint - 30, hint + 300); if (r.dist < 40) return r; }
  return scan(0, n - 1);
}
export function spokenDist(d) {
  if (d >= 950) { const km = Math.round(d / 100) / 10; return km === 1 ? "un chilometro" : `${String(km).replace(".", ",")} chilometri`; }
  const m = d < 100 ? Math.max(10, Math.round(d / 10) * 10) : Math.round(d / 50) * 50;
  return `${m} metri`;
}
export const lowerFirst = (t) => t ? t.charAt(0).toLowerCase() + t.slice(1) : t;

// ---------- Tipi di tratta ----------
// Tratte "su strada" (piedi, auto, bici, sharing): non sono corse di linea con fermate e orari
export const STREET_MODES = new Set(["WALK", "CAR", "BIKE", "RENTAL", "CAR_PARKING", "CAR_DROPOFF", "ODM", "RIDE_SHARING", "FLEX"]);
export const isTransitLeg = (l) => !!l && !STREET_MODES.has(l.mode);
// Mezzo con cui si guida una tratta su strada (soglie della navigazione, colore, icona)
export function streetKind(l) {
  if (!l) return "WALK";
  if (l.mode === "RENTAL") return l.rental && /SCOOTER|MOPED/.test(l.rental.formFactor || "") ? "SCOOTER" : "BIKE";
  return l.mode === "CAR" ? "CAR" : (l.mode === "BIKE" ? "BIKE" : "WALK");
}
export const MODE_LABEL = { TRANSIT: "Mezzi", CAR: "Auto", WALK: "A piedi", BIKE: "Bici" };
export const MODE_TITLE = { CAR: "In auto", WALK: "A piedi", BIKE: "In bici" };
const FORM = { BICYCLE: "bici", CARGO_BICYCLE: "bici cargo", SCOOTER_STANDING: "monopattino", SCOOTER_SEATED: "scooter", MOPED: "scooter", CAR: "auto" };
// "monopattino Dott", "bici RideMovi"
export function rentalLabel(r) {
  if (!r) return "mezzo in sharing";
  const what = FORM[r.formFactor] || "mezzo in sharing";
  return r.systemName ? `${what} ${r.systemName}` : `${what} in sharing`;
}

// ---------- Biglietti ----------
// Prima i link pubblicati dall'azienda (via Transitous), poi i siti ufficiali noti, poi il sito dell'azienda.
const httpsOnly = (u) => (typeof u === "string" && /^https:\/\//i.test(u) ? u : null);
export function ticketInfo(l) {
  if (!l || !isTransitLeg(l)) return null;
  const direct = httpsOnly(l.ticketUrls && l.ticketUrls.web) || httpsOnly(l.agencyFareUrl);
  if (direct) return { url: direct, label: "Biglietti" };
  const a = `${l.agencyName || ""} ${l.agencyId || ""}`;
  if (/autolinee toscane|\bat\b|gest|ataf/i.test(a)) return { url: "https://www.at-bus.it/it", label: "Biglietti AT", note: "Anche con carta contactless a bordo di bus e tramvia" };
  if (/trenitalia/i.test(a)) return { url: "https://www.trenitalia.com/", label: "Biglietti Trenitalia" };
  const site = httpsOnly(l.agencyUrl);
  return site ? { url: site, label: "Sito dell'azienda" } : null;
}

// ---------- Link condivisi ----------
// ?da=lat,lon&dn=nome&a=lat,lon&an=nome&m=TRANSIT[&t=ISO][&ab=1]
export const SHARE_MODES = ["TRANSIT", "CAR", "WALK", "BIKE"];
const coord = (p) => `${(+p.lat).toFixed(6)},${(+p.lon).toFixed(6)}`;
export function shareQuery(s) {
  const q = new URLSearchParams();
  q.set("da", coord(s.from)); q.set("dn", (s.from.name || "").slice(0, 120));
  q.set("a", coord(s.to)); q.set("an", (s.to.name || "").slice(0, 120));
  q.set("m", SHARE_MODES.includes(s.mode) ? s.mode : "TRANSIT");
  if (s.time) q.set("t", s.time);
  if (s.arriveBy) q.set("ab", "1");
  return q.toString();
}
export function parseShare(search) {
  const q = new URLSearchParams(search || "");
  const pt = (v, n) => {
    const m = /^(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)$/.exec(v || "");
    if (!m) return null;
    const lat = +m[1], lon = +m[2];
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    return { lat, lon, name: (n || "").replace(/\p{Cc}/gu, "").slice(0, 120) || "Punto condiviso", type: "POINT" };
  };
  const from = pt(q.get("da"), q.get("dn")), to = pt(q.get("a"), q.get("an"));
  if (!from || !to) return null;
  const mode = SHARE_MODES.includes(q.get("m")) ? q.get("m") : "TRANSIT";
  const t = q.get("t"), time = t && !isNaN(Date.parse(t)) ? new Date(t).toISOString() : null;
  return { from, to, mode, time, arriveBy: q.get("ab") === "1" && !!time };
}
