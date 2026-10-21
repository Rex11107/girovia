// Test unitari delle funzioni pure (js/util.js), senza browser: node --test tests/unit
import { test } from "node:test";
import assert from "node:assert/strict";
import * as U from "../../js/util.js";

// Codifica di riferimento (algoritmo Google) per costruire polilinee di prova
function encode(pts, precision) {
  const f = 10 ** precision; let plat = 0, plon = 0, out = "";
  const one = (v) => { v = v < 0 ? ~(v << 1) : v << 1; while (v >= 0x20) { out += String.fromCharCode((0x20 | (v & 0x1f)) + 63); v >>= 5; } out += String.fromCharCode(v + 63); };
  for (const [lat, lon] of pts) { const a = Math.round(lat * f), b = Math.round(lon * f); one(a - plat); one(b - plon); plat = a; plon = b; }
  return out;
}
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ""} ${a} ≉ ${b} (±${tol})`);

test("decodePolyline: esempio Google, precisione 6 e stringa vuota", () => {
  assert.deepEqual(U.decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@", 5), [[38.5, -120.2], [40.7, -120.95], [43.252, -126.453]]);
  const pts = [[43.7764, 11.248], [43.79, 11.3], [43.7745, 11.433]];
  U.decodePolyline(encode(pts, 6), 6).forEach((p, i) => { near(p[0], pts[i][0], 1e-6); near(p[1], pts[i][1], 1e-6); });
  assert.deepEqual(U.decodePolyline("", 6), []);
  assert.deepEqual(U.decodePolyline(undefined, 6), []);
});

test("prettyName: nomi GTFS in maiuscolo", () => {
  const cases = {
    "SCALA SANTA MARIA NOVELLA": "Scala Santa Maria Novella",
    "FIRENZE S.MARIA NOVELLA": "Firenze S.Maria Novella",
    "SANT'ELLERO": "Sant'Ellero",
    "PONTASSIEVE SS67": "Pontassieve SS67",
    "BORGO SAN LORENZO VIA DEL CARMINE": "Borgo San Lorenzo Via del Carmine",
    "CAMPO MARTE FS": "Campo Marte FS",
    "VIA DE' CALZAIUOLI": "Via de' Calzaiuoli",
    "BORGO SAN LORENZO Via Gaiani": "Borgo San Lorenzo Via Gaiani",
    "FIRENZE Stazione SMN": "Firenze Stazione SMN",
    "Firenze Rifredi": "Firenze Rifredi",
    "A": "A",
    "SMN": "SMN"
  };
  for (const [inp, out] of Object.entries(cases)) assert.equal(U.prettyName(inp), out, inp);
  assert.equal(U.prettyName(null), null);
});

test("prettify: cambia solo name e headsign, anche annidati", () => {
  const o = U.prettify({ name: "PONTASSIEVE", headsign: "AREZZO TERMINAL", agencyName: "TRENITALIA", legs: [{ from: { name: "LE SIECI" } }] });
  assert.equal(o.name, "Pontassieve");
  assert.equal(o.headsign, "Arezzo Terminal");
  assert.equal(o.agencyName, "TRENITALIA");
  assert.equal(o.legs[0].from.name, "Le Sieci");
});

test("durate e distanze", () => {
  assert.deepEqual([30, 600, 3600, 5400, 3661].map(U.fmtDur), ["1 min", "10 min", "1 h", "1 h 30 min", "1 h 1 min"]);
  assert.deepEqual([0, 123, 949, 1500, 9999, 23456].map(U.fmtDist), ["0 m", "120 m", "950 m", "1,5 km", "10,0 km", "23 km"]);
  assert.equal(U.fmtDist(null), "");
  assert.deepEqual([12, 140, 980, 1000, 2350].map(U.spokenDist), ["10 metri", "150 metri", "un chilometro", "un chilometro", "2,4 chilometri"]);
});

test("orari in ora italiana, ritardi", () => {
  assert.equal(U.fmtTime("2026-10-21T06:40:00Z"), "08:40"); // ora legale
  assert.equal(U.fmtTime("2026-12-21T06:40:00Z"), "07:40"); // ora solare
  assert.equal(U.fmtTime(""), "");
  assert.equal(U.delayMin("2026-10-21T06:44:00Z", "2026-10-21T06:40:00Z"), 4);
  assert.equal(U.delayMin(null, "2026-10-21T06:40:00Z"), 0);
});

test("geometria: lunghezza, proiezione e suggerimento di posizione", () => {
  const a = [43.77, 11.25], b = [43.77, 11.26], c = [43.78, 11.26];
  const line = U.makeLine([a, b, c]);
  near(U.distM(a, b), 804, 3, "10 millesimi di longitudine a Firenze");
  near(line.len, U.distM(a, b) + U.distM(b, c), 0.01);
  const mid = U.projectOn(line, [43.7705, 11.255]); // 55 m a nord del primo tratto
  near(mid.dist, 55.6, 1.5);
  near(mid.along, U.distM(a, b) / 2, 3);
  assert.equal(mid.idx, 0);
  const second = U.projectOn(line, [43.775, 11.2601], 0);
  assert.equal(second.idx, 1);
  near(second.along, U.distM(a, b) + U.distM(b, [43.775, 11.26]), 3);
  assert.equal(U.projectOn(U.makeLine([]), a).dist, Infinity);
});

test("indicazioni stradali in italiano", () => {
  const t = (type, modifier, name, extra = {}) => U.osrmText({ maneuver: { type, modifier, ...extra }, name }, "CAR");
  assert.equal(t("turn", "left", "Via Roma"), "Gira a sinistra su Via Roma");
  assert.equal(t("turn", "straight", ""), "Prosegui dritto");
  assert.equal(t("roundabout", undefined, "", { exit: 3 }), "Alla rotonda prendi la 3ª uscita");
  assert.equal(t("fork", "slight right", "SS67"), "Al bivio tieni leggermente a destra su SS67");
  assert.equal(t("arrive"), "Arrivo a destinazione");
  assert.equal(t("new name", undefined, ""), "");
  assert.equal(U.osrmText({ maneuver: { type: "depart" }, name: "Via Nazionale" }, "WALK"), "Parti su Via Nazionale a piedi");
  assert.equal(U.motisStepText({ relativeDirection: "RIGHT", streetName: "Piazza della Stazione" }), "Gira a destra su Piazza della Stazione");
  const steps = U.motisSteps([{ relativeDirection: "DEPART", distance: 10, polyline: { points: encode([[43.77, 11.25]], 6), precision: 6 } }, { relativeDirection: "CIRCLE_CLOCKWISE", distance: 50 }]);
  assert.equal(steps[0].type, "depart");
  near(steps[0].loc[0], 43.77, 1e-6);
  assert.equal(steps[1].type, "roundabout");
  assert.equal(steps[1].loc, null);
});

test("avvisi: solo quelli in corso, senza doppioni, i più gravi prima", () => {
  const now = Date.now(), h = 3600e3;
  const iso = (ms) => new Date(now + ms).toISOString();
  const info = { headerText: "Lavori", severityLevel: "INFO" };
  const severe = { headerText: "Sciopero", severityLevel: "SEVERE" };
  const past = { headerText: "Vecchio", communicationPeriod: [{ start: iso(-5 * h), end: iso(-h) }] };
  const future = { headerText: "Futuro", communicationPeriod: [{ start: iso(h) }] };
  const out = U.collectAlerts([info, past], [severe, future, { ...info }], null, [{}]);
  assert.deepEqual(out.map((a) => a.headerText), ["Sciopero", "Lavori"]);
  const leg = { alerts: [info], from: { alerts: [severe] }, to: {}, intermediateStops: [{ alerts: [info] }] };
  assert.equal(U.legAlerts(leg).length, 2);
});

test("fermate: mezzi e nomi delle zone", () => {
  assert.equal(U.stopModes(["REGIONAL_RAIL", "BUS", "BUS", "TRAM"]), "Treno, Bus, Tram");
  assert.equal(U.stopModes([]), "");
  assert.equal(U.areaLabel({ name: "Piazza", areas: [{ name: "Toscana", adminLevel: 4 }, { name: "Firenze", adminLevel: 8 }, { name: "Firenze", adminLevel: 7 }] }), "Firenze, Toscana");
  assert.equal(U.placeLabel({ type: "ADDRESS", street: "Via Roma", houseNumber: "3", name: "x" }), "Via Roma 3");
  assert.equal(U.lineName({ routeShortName: "", displayName: "", mode: "REGIONAL_RAIL" }), "Regionale");
  assert.equal(U.esc(`<a href="x">'&'</a>`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
});
