// Tempo reale: avvisi di servizio, partenze che si aggiornano, ritardo nel viaggio seguito.
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const FX = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures.json"), "utf8"));
const NOW = "2026-10-21T06:30:00Z";
const TILE_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
const clone = (x) => JSON.parse(JSON.stringify(x));
const STRIKE = { headerText: "Sciopero del trasporto pubblico", descriptionText: "Venerdì possibili cancellazioni dalle 9 alle 17.", cause: "STRIKE", severityLevel: "WARNING" };
const DETOUR = { headerText: "Deviazione a Compiobbi per lavori", descriptionText: "Fermata spostata di 100 metri.", cause: "CONSTRUCTION", severityLevel: "INFO" };

test.use({ permissions: ["geolocation"], geolocation: { latitude: 43.7764, longitude: 11.2480, accuracy: 5 } });

async function setup(page, state) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.addInitScript((now) => {
    const t = new Date(now).getTime(); Date.now = () => t;
    window.__spoken = [];
    try { window.speechSynthesis.speak = (u) => window.__spoken.push(u.text); window.speechSynthesis.cancel = () => {}; } catch { /* nessuna sintesi vocale */ }
  }, NOW);
  await page.route("**/*", async (route) => {
    const u = route.request().url();
    if (u.startsWith("http://127.0.0.1")) return route.continue();
    if (/tile\.openstreetmap|cartocdn/.test(u)) return route.fulfill({ body: TILE_PNG, contentType: "image/png", headers: { "access-control-allow-origin": "*" } });
    if (u.includes("/reverse-geocode")) return route.fulfill({ json: [] });
    if (u.includes("/geocode")) return route.fulfill({ json: decodeURIComponent(u).includes("Firenze") ? FX.geo : FX.geo2 });
    if (u.includes("/map/stops")) return route.fulfill({ json: [] });
    if (u.includes("/plan")) { const p = clone(FX.plan); p.itineraries[0].legs[1].alerts = [STRIKE]; return route.fulfill({ json: p }); }
    if (u.includes("/stoptimes")) {
      state.stoptimes = (state.stoptimes || 0) + 1;
      const st = clone(FX.stoptimes); st.place.alerts = [STRIKE];
      if (state.stoptimes > 1) { st.stopTimes[0].place.departure = "2026-10-21T06:47:00Z"; } // +7 rispetto al programmato
      return route.fulfill({ json: st });
    }
    if (u.includes("/trip")) {
      const t = clone(FX.trip);
      if (state.delayTrip) { t.legs[0].to.arrival = "2026-10-21T07:31:00Z"; t.legs[0].alerts = [DETOUR]; }
      return route.fulfill({ json: t });
    }
    return route.fulfill({ status: 500, body: "non previsto: " + u });
  });
  await page.goto("/index.html");
  return errors;
}
async function pick(page, field, text) {
  await page.click("#" + field);
  await page.fill("#" + field, text);
  await expect(page.locator("#sugg button").first()).not.toContainText("La mia posizione");
  await page.locator("#sugg button").first().click();
}

test("avvisi di servizio nei risultati, nel dettaglio e alla fermata", async ({ page }) => {
  const errors = await setup(page, {});
  await pick(page, "from", "Firenze"); // fermata: partenze con avviso
  await expect(page.locator(".alert").first()).toContainText("Sciopero del trasporto pubblico");
  await expect(page.locator(".alert .acause").first()).toHaveText("Sciopero");
  await pick(page, "to", "Pontassieve");
  await expect(page.locator(".itin").first()).toContainText("Avviso di servizio");
  await expect(page.locator(".itin").nth(1)).not.toContainText("Avviso di servizio");
  await page.locator(".itin").first().click();
  await expect(page.locator(".alert")).toContainText("Sciopero del trasporto pubblico");
  await page.locator(".alert summary").click();
  await expect(page.locator(".alert")).toContainText("possibili cancellazioni");
  expect(errors).toEqual([]);
});

test("le partenze si aggiornano da sole senza perdere la vista", async ({ page }) => {
  const st = {};
  await setup(page, st);
  await pick(page, "from", "Firenze");
  await expect(page.locator(".dep").first()).toContainText("+2");
  await page.evaluate(() => window.__girovia.tick(true));
  await expect(page.locator(".dep").first()).toContainText("+7");
  expect(st.stoptimes).toBe(2);
  await expect(page.locator("#sheetTitle")).toHaveText("Firenze Santa Maria Novella");
  await expect(page.locator("#back")).toBeVisible(); // la pila del tasto Indietro resta uguale
});

test("viaggio seguito: il ritardo sposta l'arrivo e il nuovo avviso viene annunciato", async ({ page }) => {
  const st = {};
  await setup(page, st);
  await pick(page, "from", "Firenze");
  await pick(page, "to", "Pontassieve");
  await page.locator(".itin").first().click();
  await page.click("[data-follow]");
  await expect(page.locator(".toast")).toContainText("Sciopero"); // avviso già noto: mostrato all'avvio
  await expect(page.locator("#navSummary")).toContainText("arrivo 09:25");
  st.delayTrip = true;
  await page.evaluate(() => window.__girovia.tick(true));
  await expect(page.locator("#navSummary")).toContainText("arrivo 09:31");
  await expect.poll(() => page.evaluate(() => window.__girovia.NAV.legs[1].l.endTime)).toBe("2026-10-21T07:31:00Z");
  await expect.poll(() => page.evaluate(() => window.__spoken.slice())).toContain("Avviso di servizio. Deviazione a Compiobbi per lavori");
});
