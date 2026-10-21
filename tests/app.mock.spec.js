// Test dell'interfaccia con risposte finte (stesso formato delle API reali).
// Non serve la rete: mappa, font e servizi sono intercettati.
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const FX = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures.json"), "utf8"));
const LEAFLET = path.join(__dirname, "..", "node_modules", "leaflet", "dist");
const NOW = "2026-10-21T06:30:00Z";
const TILE_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");

async function setup(page, opts = {}) {
  const calls = [];
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.addInitScript((now) => { const t = new Date(now).getTime(); Date.now = () => t; }, NOW);
  await page.route("**/*", async (route) => {
    const u = route.request().url();
    if (u.startsWith("http://127.0.0.1")) return route.continue();
    if (u.includes("leaflet.min.js")) return route.fulfill({ path: path.join(LEAFLET, "leaflet.js"), contentType: "application/javascript" });
    if (u.includes("leaflet.min.css")) return route.fulfill({ path: path.join(LEAFLET, "leaflet.css"), contentType: "text/css" });
    if (/tile\.openstreetmap|cartocdn/.test(u)) return route.fulfill({ body: TILE_PNG, contentType: "image/png", headers: { "access-control-allow-origin": "*" } });
    calls.push(u);
    if (u.includes("transitous")) {
      if (opts.failTransit) return route.fulfill({ status: 503, body: "down" });
      if (u.includes("/api/v6/")) return route.fulfill({ status: 404, body: "not found" }); // forza il ripiego su v5
      if (u.includes("/reverse-geocode")) return route.fulfill({ json: [] });
      if (u.includes("/geocode")) return route.fulfill({ json: decodeURIComponent(u).includes("Firenze") ? FX.geo : FX.geo2 });
      if (u.includes("/plan")) return route.fulfill({ json: opts.emptyPlan ? { ...FX.plan, itineraries: [], direct: [] } : FX.plan });
      if (u.includes("/stoptimes")) return route.fulfill({ json: FX.stoptimes });
      if (u.includes("/trip")) return route.fulfill({ json: FX.trip });
      if (u.includes("/map/stops")) return route.fulfill({ json: [] });
    }
    if (u.includes("routing.openstreetmap.de")) {
      if (opts.failRouting) return route.fulfill({ status: 502, body: "bad gateway" });
      return route.fulfill({ json: FX.osrm });
    }
    return route.fulfill({ status: 500, body: "non previsto: " + u });
  });
  await page.goto("/index.html");
  await expect(page.locator("#sheetTitle")).toHaveText("Dove vuoi andare?");
  return { calls, errors };
}

test("i suggerimenti mostrano i mezzi della fermata", async ({ page }) => {
  await setup(page);
  await page.click("#from"); await page.fill("#from", "Firenze");
  await expect(page.locator("#sugg button").first()).toContainText("Treno, Bus · Firenze");
});

async function pick(page, field, text) {
  await page.click("#" + field);
  await page.fill("#" + field, text);
  await expect(page.locator("#sugg button").first()).not.toContainText("La mia posizione");
  await page.locator("#sugg button").first().click();
}

test("funzioni di base: polilinee, durate, indicazioni", async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(() => {
    const g = window.__girovia;
    return {
      poly: g.decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@", 5),
      empty: g.decodePolyline("", 6),
      names: ["SCALA SANTA MARIA NOVELLA", "FIRENZE S.MARIA NOVELLA", "SANT'ELLERO", "PONTASSIEVE SS67", "BORGO SAN LORENZO VIA DEL CARMINE", "CAMPO MARTE FS", "Firenze Rifredi", "LE SIECI PIAZZA ALBIZI", "VIA DE' CALZAIUOLI", "A", "BORGO SAN LORENZO Via Gaiani", "FIRENZE Stazione SMN", "Via Roma"].map(g.prettyName),
      dur: [g.fmtDur(30), g.fmtDur(600), g.fmtDur(3600), g.fmtDur(5400)],
      dist: [g.fmtDist(123), g.fmtDist(1500), g.fmtDist(23456)],
      txt: [
        g.osrmText({ maneuver: { type: "turn", modifier: "left" }, name: "Via Roma" }, "CAR"),
        g.osrmText({ maneuver: { type: "roundabout", exit: 3 }, name: "" }, "CAR"),
        g.osrmText({ maneuver: { type: "arrive" } }, "WALK"),
        g.osrmText({ maneuver: { type: "new name" }, name: "" }, "CAR")
      ]
    };
  });
  expect(r.poly).toEqual([[38.5, -120.2], [40.7, -120.95], [43.252, -126.453]]);
  expect(r.empty).toEqual([]);
  expect(r.names).toEqual(["Scala Santa Maria Novella", "Firenze S.Maria Novella", "Sant'Ellero", "Pontassieve SS67", "Borgo San Lorenzo Via del Carmine", "Campo Marte FS", "Firenze Rifredi", "Le Sieci Piazza Albizi", "Via de' Calzaiuoli", "A", "Borgo San Lorenzo Via Gaiani", "Firenze Stazione SMN", "Via Roma"]);
  expect(r.dur).toEqual(["1 min", "10 min", "1 h", "1 h 30 min"]);
  expect(r.dist).toEqual(["120 m", "1,5 km", "23 km"]);
  expect(r.txt).toEqual(["Gira a sinistra su Via Roma", "Alla rotonda prendi la 3ª uscita", "Arrivo a destinazione", ""]);
});

test("fermata: partenze, corsa intera e tasto indietro", async ({ page }) => {
  const { errors } = await setup(page);
  await pick(page, "from", "Firenze");
  await expect(page.locator("#sheetTitle")).toHaveText("Firenze Santa Maria Novella");
  await expect(page.locator(".dep")).toHaveCount(3);
  await expect(page.locator(".dep").first()).toContainText("+2");
  // le prime due sono oggi (nessuna intestazione), la terza domani
  await expect(page.locator("#sheetBody .label")).toHaveCount(1);
  await expect(page.locator("#sheetBody .label")).toHaveText("Domani");
  await page.locator(".dep").nth(1).click();
  await expect(page.locator("#sheetTitle")).toHaveText("Linea 7");
  await expect(page.locator("#sheetBody")).toContainText("Compiobbi");
  await page.click("#back");
  await expect(page.locator("#sheetTitle")).toHaveText("Firenze Santa Maria Novella");
  await page.click("#back");
  await expect(page.locator("#sheetTitle")).toHaveText("Dove vuoi andare?");
  await expect(page.locator("#back")).toBeHidden();
  expect(errors).toEqual([]);
});

test("mezzi: risultati, dettaglio, corsa, ripiego di versione API", async ({ page }) => {
  const { calls, errors } = await setup(page);
  await pick(page, "from", "Firenze");
  await pick(page, "to", "Pontassieve");
  await expect(page.locator(".itin")).toHaveCount(2);
  await expect(page.locator(".itin").first()).toContainText("08:35 – 09:25");
  await expect(page.locator(".itin").first()).toContainText("Linea 7");
  await expect(page.locator(".itin").first()).toContainText("+4 min");
  expect(calls.some((u) => u.includes("/api/v6/plan"))).toBe(true);
  expect(calls.some((u) => u.includes("/api/v5/plan"))).toBe(true);

  await page.locator(".itin").first().click();
  await expect(page.locator("#sheetBody")).toContainText("Firenze Santa Maria Novella"); // nome scelto, non "START"
  await expect(page.locator("#sheetBody")).toContainText("ritardo 4 min");
  await page.locator("details summary", { hasText: "fermate" }).click();
  await expect(page.locator("#sheetBody")).toContainText("Sieci");
  await page.click("[data-trip]");
  await expect(page.locator("#sheetTitle")).toHaveText("Linea 7");
  await page.click("#back");
  await expect(page.locator("#sheetTitle")).toContainText("08:35");
  await page.click("#back");
  await expect(page.locator("#sheetTitle")).toHaveText("Verso Pontassieve");

  await page.click("[data-more]");
  await expect(page.locator(".itin")).toHaveCount(4);
  expect(errors).toEqual([]);
});

test("auto e a piedi", async ({ page }) => {
  const { calls, errors } = await setup(page);
  await pick(page, "from", "Firenze");
  await pick(page, "to", "Pontassieve");
  await page.click("[data-mode='CAR']");
  await expect(page.locator(".itin")).toHaveCount(1);
  await expect(page.locator(".itin")).toContainText("25 min");
  await expect(page.locator(".itin")).toContainText("20 km");
  await expect(page.locator(".when")).toBeHidden();
  await page.locator(".itin").click();
  await expect(page.locator(".steps")).toContainText("Alla rotonda prendi la 2ª uscita verso SS67");
  await page.click("#back");
  await page.click("[data-mode='WALK']");
  await expect(page.locator(".itin")).toHaveCount(1);
  expect(calls.some((u) => u.includes("routed-car"))).toBe(true);
  expect(calls.some((u) => u.includes("routed-foot"))).toBe(true);
  expect(errors).toEqual([]);
});

test("ricerca ricordata dopo il riavvio", async ({ page }) => {
  await setup(page);
  await pick(page, "from", "Firenze");
  await page.reload();
  await expect(page.locator(".recent")).toHaveCount(1);
  await expect(page.locator(".recent")).toContainText("Firenze Santa Maria Novella");
});

test("errori chiari se un servizio non risponde", async ({ page }) => {
  await setup(page, { failTransit: true, failRouting: true });
  await page.click("#from"); await page.fill("#from", "Firenze");
  await expect(page.locator("#sugg")).toContainText("errore (503)");
  await page.evaluate(() => {
    const s = window.__girovia.state;
    s.from = { lat: 43.77, lon: 11.25, name: "A", type: "POINT" };
  });
  await page.fill("#to", "");
  await page.click("[data-mode='CAR']");
  await page.evaluate(() => { window.__girovia.state.to = { lat: 43.77, lon: 11.43, name: "B", type: "POINT" }; });
  await page.click("[data-mode='WALK']");
  await expect(page.locator(".err")).toBeVisible();
  await expect(page.locator("[data-retry]")).toBeVisible();
});

test("la nuvoletta sulla mappa si chiude con la X", async ({ page }) => {
  await setup(page);
  const box = await page.locator("#map").boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.45);
  const pop = page.locator(".leaflet-popup");
  await expect(pop).toBeVisible();
  await expect(pop).toContainText("Parti da qui");
  const x = page.locator(".leaflet-popup-close-button");
  await expect(x).toBeVisible();
  const r = await x.boundingBox();
  expect(r.width).toBeGreaterThanOrEqual(36); // facile da toccare
  await x.click();
  await expect(pop).toHaveCount(0);
});

test("nessun collegamento: messaggio utile", async ({ page }) => {
  await setup(page, { emptyPlan: true });
  await pick(page, "from", "Firenze");
  await pick(page, "to", "Pontassieve");
  await expect(page.locator(".err")).toContainText("Nessun collegamento");
});

for (const scheme of ["light", "dark"]) {
  test(`layout telefono senza scorrimento laterale (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await setup(page);
    await pick(page, "from", "Firenze");
    await pick(page, "to", "Pontassieve");
    await page.locator(".itin").first().click();
    const w = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    expect(w[0]).toBeLessThanOrEqual(w[1]);
    await page.screenshot({ path: `test-results/screens/dettaglio-${scheme}.png` });
  });
}

test("tema: scelta chiaro, scuro o automatico, ricordata al riavvio", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await setup(page);
  await page.click("[data-tab='info']");
  const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const light = await bg();
  await page.click("[data-theme-set='dark']");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await bg()).not.toBe(light);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark"); // applicato prima del codice dell'app
  await page.click("[data-tab='info']");
  await expect(page.locator("[data-theme-set='dark']")).toHaveAttribute("aria-checked", "true");
  await page.click("[data-theme-set='auto']");
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/);
  expect(await bg()).toBe(light);
});

test("Content-Security-Policy: nessuna violazione durante l'uso", async ({ page }) => {
  const violations = [];
  page.on("console", (m) => { if (/Content Security Policy|Refused to/.test(m.text())) violations.push(m.text()); });
  await setup(page);
  await pick(page, "from", "Firenze");
  await pick(page, "to", "Pontassieve");
  await page.locator(".itin").first().click();
  expect(violations).toEqual([]);
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content");
  expect(csp).toContain("script-src 'self';");
});
