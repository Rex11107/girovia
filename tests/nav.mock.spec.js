// Navigazione con posizioni GPS simulate: auto (annunci, ricalcolo, arrivo) e mezzi (avvisi di discesa).
// Pannello iniziale: schede, preferiti, viaggi salvati.
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const FX = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures.json"), "utf8"));
const LEAFLET = path.join(__dirname, "..", "node_modules", "leaflet", "dist");
const NOW = "2026-10-21T06:30:00Z";
const TILE_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
const FI = [43.7764, 11.2480], TURN = [43.79, 11.30], MID = [43.775, 11.33], PON = [43.7745, 11.4330];
const SMN_BUS = [43.7770, 11.2475], CDM = [43.776, 11.28], SIECI = [43.78, 11.39];
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

test.use({ permissions: ["geolocation"], geolocation: { latitude: FI[0], longitude: FI[1], accuracy: 5 } });

async function setup(page, context) {
  const calls = [];
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
    if (u.includes("leaflet.min.js")) return route.fulfill({ path: path.join(LEAFLET, "leaflet.js"), contentType: "application/javascript" });
    if (u.includes("leaflet.min.css")) return route.fulfill({ path: path.join(LEAFLET, "leaflet.css"), contentType: "text/css" });
    if (/tile\.openstreetmap|cartocdn/.test(u)) return route.fulfill({ body: TILE_PNG, contentType: "image/png", headers: { "access-control-allow-origin": "*" } });
    calls.push(u);
    if (u.includes("/reverse-geocode")) return route.fulfill({ json: [] });
    if (u.includes("/geocode")) return route.fulfill({ json: decodeURIComponent(u).includes("Firenze") ? FX.geo : FX.geo2 });
    if (u.includes("/plan")) return route.fulfill({ json: FX.plan });
    if (u.includes("/stoptimes")) return route.fulfill({ json: FX.stoptimes });
    if (u.includes("/map/stops")) return route.fulfill({ json: [] });
    if (u.includes("routing.openstreetmap.de")) return route.fulfill({ json: FX.osrm });
    return route.fulfill({ status: 500, body: "non previsto: " + u });
  });
  await page.goto("/index.html");
  const move = async (p, accuracy = 5) => { await context.setGeolocation({ latitude: p[0], longitude: p[1], accuracy }); await page.waitForTimeout(250); };
  const spoken = () => page.evaluate(() => window.__spoken.slice());
  return { calls, errors, move, spoken };
}
async function pick(page, field, text) {
  await page.click("#" + field);
  await page.fill("#" + field, text);
  await expect(page.locator("#sugg button").first()).not.toContainText("La mia posizione");
  await page.locator("#sugg button").first().click();
}

test("auto: indicazioni, voce, ricalcolo e arrivo", async ({ page, context }) => {
  const { calls, errors, move, spoken } = await setup(page, context);
  await page.click("[data-mode='CAR']");
  await pick(page, "from", "Firenze");
  await pick(page, "to", "Pontassieve");
  await page.locator(".itin").first().click();
  await page.click("[data-nav]");
  await expect(page.locator("#nav")).toBeVisible();
  await expect(page.locator("#top")).toBeHidden();
  await expect(page.locator("#navBar")).toContainText("Fine");

  // 300 m prima della svolta a destra
  await move(lerp(FI, TURN, 0.92));
  await expect(page.locator("#navInstr")).toHaveText("Gira a destra su Viale Spartaco Lavagnini");
  await expect(page.locator("#navSummary")).toContainText("arrivo");
  expect((await spoken()).some((t) => /^Tra \d+ metri, gira a destra su Viale Spartaco Lavagnini$/.test(t))).toBe(true);

  // dopo la svolta: la prossima è la rotonda
  await move(lerp(TURN, MID, 0.3));
  await expect(page.locator("#navInstr")).toContainText("rotonda");

  // fuori percorso per tre letture: ricalcolo
  const before = calls.filter((u) => u.includes("routed-car")).length;
  await move([43.70, 11.20]); await move([43.7002, 11.2002]); await move([43.7004, 11.2004]);
  await expect.poll(() => calls.filter((u) => u.includes("routed-car")).length).toBeGreaterThan(before);
  expect(await spoken()).toContain("Ricalcolo il percorso");

  // arrivo
  await move(PON);
  await expect(page.locator("#navInstr")).toContainText("Sei arrivato");
  expect(await spoken()).toContain("Sei arrivato a destinazione");

  // voce spenta e fine navigazione
  await page.click("#navVoice");
  await expect(page.locator("#navVoice")).toHaveAttribute("aria-pressed", "false");
  await page.click("#navStop");
  await expect(page.locator("#nav")).toBeHidden();
  await expect(page.locator("#top")).toBeVisible();
  expect(errors).toEqual([]);
});

test("mezzi: segue il viaggio e avvisa quando scendere", async ({ page, context }) => {
  const { errors, move, spoken } = await setup(page, context);
  await pick(page, "from", "Firenze");
  await pick(page, "to", "Pontassieve");
  await page.locator(".itin").first().click();
  await page.click("[data-follow]");
  await expect(page.locator("#navInstr")).toContainText("fermata Firenze Stazione SMN");
  expect((await spoken())[0]).toContain("Vai a piedi alla fermata Firenze Stazione SMN");

  await move(SMN_BUS); // alla fermata: tratta del bus
  await expect(page.locator("#navInstr")).toContainText("Linea 7");
  await move(lerp(CDM, MID, 0.4)); // sul bus
  await expect(page.locator("#navInstr")).toHaveText("Scendi a Pontassieve Piazza Vittorio Emanuele");
  await expect(page.locator("#navDist")).toHaveText("3 fermate"); // Compiobbi, Sieci, Pontassieve

  await move(lerp(SIECI, PON, 0.2)); // dopo Sieci: la prossima è quella giusta
  await expect(page.locator("#navDist")).toHaveText("Prossima");
  expect(await spoken()).toContain("Alla prossima fermata scendi: Pontassieve Piazza Vittorio Emanuele");

  await move(lerp(SIECI, PON, 0.95)); // circa 175 m prima (soglia 250 m)
  expect(await spoken()).toContain("Scendi ora: Pontassieve Piazza Vittorio Emanuele");
  await move(PON);
  await expect(page.locator("#navInstr")).toContainText("Sei arrivato");
  await page.screenshot({ path: "test-results/screens/navigazione-mezzi.png" });
  expect(errors).toEqual([]);
});

test("schede: preferiti (Casa) e viaggi salvati", async ({ page, context }) => {
  const { errors } = await setup(page, context);
  await expect(page.locator(".tabs [role=tab]")).toHaveCount(4);
  await expect(page.locator("#sheetBody")).not.toContainText("Scrivi partenza e arrivo");

  // Casa
  await page.click("[data-tab='fav']");
  await page.click("[data-f='home']");
  await expect(page.locator("#to")).toHaveAttribute("placeholder", "Cerca l'indirizzo di Casa");
  await pick(page, "to", "Pontassieve");
  await expect(page.locator("[data-f='home']")).toContainText("Pontassieve");

  // viaggio salvato
  await pick(page, "from", "Firenze");
  await pick(page, "to", "Pontassieve");
  await page.click("[data-save-trip]");
  await expect(page.locator("[data-save-trip]")).toHaveText("★ Viaggio salvato");
  await page.click("[data-clear='to']");
  await expect(page.locator(".tabs")).toBeVisible();
  await page.click("[data-tab='trips']");
  await expect(page.locator("[data-t]")).toHaveCount(1);
  await expect(page.locator("[data-t]")).toContainText("Firenze Santa Maria Novella → Pontassieve");
  await page.click("[data-t='0']");
  await expect(page.locator(".itin").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("schermata di navigazione su telefono (scuro)", async ({ page, context }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  const { move } = await setup(page, context);
  await page.click("[data-mode='WALK']");
  await pick(page, "from", "Firenze");
  await pick(page, "to", "Pontassieve");
  await page.locator(".itin").first().click();
  await page.click("[data-nav]");
  await move(lerp(FI, TURN, 0.95));
  const w = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(w[0]).toBeLessThanOrEqual(w[1]);
  await page.screenshot({ path: "test-results/screens/navigazione-piedi-scuro.png" });
});
