// Accessibilità: fermate da tastiera, elenco delle fermate, fermate passate, audit axe di tutte le schermate.
const { test, expect } = require("@playwright/test");
const AxeBuilder = require("@axe-core/playwright").default;
const fs = require("fs");
const path = require("path");

const FX = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures.json"), "utf8"));
const NOW = "2026-10-21T06:57:00Z"; // il bus è già passato da SMN e Campo di Marte, la prossima è Compiobbi
const TILE_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
const STOPS = [
  { name: "Duomo", stopId: "s_duomo", lat: 43.7731, lon: 11.2560, modes: ["BUS"] },
  { name: "Cerretani", stopId: "s_cerr", lat: 43.7735, lon: 11.2530, modes: ["BUS", "TRAM"] },
  { name: "Proconsolo", stopId: "s_proc", lat: 43.7710, lon: 11.2580, modes: ["BUS"] }
];

test.use({ permissions: ["geolocation"], geolocation: { latitude: 43.7764, longitude: 11.2480, accuracy: 5 } });

async function setup(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.addInitScript((now) => { const t = new Date(now).getTime(); Date.now = () => t; try { window.speechSynthesis.speak = () => {}; } catch { /* niente voce */ } }, NOW);
  await page.route("**/*", async (route) => {
    const u = route.request().url();
    if (u.startsWith("http://127.0.0.1")) return route.continue();
    if (/tile\.openstreetmap|cartocdn/.test(u)) return route.fulfill({ body: TILE_PNG, contentType: "image/png", headers: { "access-control-allow-origin": "*" } });
    if (u.includes("/reverse-geocode")) return route.fulfill({ json: [] });
    if (u.includes("/geocode")) return route.fulfill({ json: decodeURIComponent(u).includes("Firenze") ? FX.geo : FX.geo2 });
    if (u.includes("/map/stops")) return route.fulfill({ json: STOPS });
    if (u.includes("/plan")) return route.fulfill({ json: FX.plan });
    if (u.includes("/stoptimes")) return route.fulfill({ json: FX.stoptimes });
    if (u.includes("/trip")) return route.fulfill({ json: FX.trip });
    if (u.includes("routing.openstreetmap.de")) return route.fulfill({ json: FX.osrm });
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
// All'avvio l'app centra la mappa sulla posizione GPS (permesso già dato): si aspetta, poi si sposta sul Duomo
async function zoomOnStops(page) {
  await expect(page.locator(".me")).toBeVisible();
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__girovia.map.setView([43.7728, 11.2557], 17, { animate: false }));
  await expect(page.locator(".stopdot").first()).toBeVisible();
}

test("fermate sulla mappa: Tab e Invio aprono le partenze", async ({ page }) => {
  const errors = await setup(page);
  await zoomOnStops(page);
  const dot = page.locator(".stopdot").first();
  await expect(page.locator(".stopdot")).toHaveCount(3);
  await expect(dot).toHaveAttribute("aria-label", /^Fermata .+: mostra le partenze$/);
  await expect(dot).toHaveAttribute("tabindex", "0");
  await dot.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#sheetTitle")).toHaveText(/Duomo|Cerretani|Proconsolo/);
  await expect(page.locator(".dep").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("elenco \"Fermate qui\" dalla più vicina, con i mezzi", async ({ page }) => {
  await setup(page);
  await zoomOnStops(page);
  const btn = page.locator("#stopsBtn");
  await expect(btn).toHaveText("Fermate qui · 3");
  await btn.click();
  await expect(page.locator("#sheetTitle")).toHaveText("Fermate qui");
  await expect(page.locator("[data-ns]").first()).toContainText("Duomo");
  await expect(page.locator("[data-ns]").nth(1)).toContainText("Bus, Tram");
  await page.locator("[data-ns]").first().click();
  await expect(page.locator("#sheetTitle")).toHaveText("Duomo");
  await page.click("#back");
  await expect(page.locator("#sheetTitle")).toHaveText("Fermate qui");
});

test("corsa intera: fermate passate con icona e parola, prossima evidenziata", async ({ page }) => {
  await setup(page);
  await pick(page, "from", "Firenze");
  await page.locator(".dep").nth(1).click();
  await expect(page.locator(".tripstops li")).toHaveCount(5);
  await expect(page.locator(".tripstops li.past")).toHaveCount(2);
  await expect(page.locator(".tripstops li.past").first()).toContainText("passata");
  await expect(page.locator(".tripstops li").nth(2)).toContainText("prossima");
  await expect(page.locator(".tripstops li").nth(2)).not.toHaveClass(/past/);
});

// Audit axe (WCAG 2.1 A e AA) di ogni schermata, nei due temi
const VIEWS = {
  "iniziale e schede": async (page) => { for (const t of ["recent", "trips", "fav", "info"]) await page.click(`[data-tab='${t}']`); },
  "suggerimenti": async (page) => { await page.click("#from"); await page.fill("#from", "Firenze"); await expect(page.locator("#sugg button").first()).not.toContainText("La mia posizione"); },
  "partenze": async (page) => { await pick(page, "from", "Firenze"); await expect(page.locator(".dep").first()).toBeVisible(); },
  "risultati": async (page) => { await pick(page, "from", "Firenze"); await pick(page, "to", "Pontassieve"); await expect(page.locator(".itin").first()).toBeVisible(); },
  "dettaglio": async (page) => { await pick(page, "from", "Firenze"); await pick(page, "to", "Pontassieve"); await page.locator(".itin").first().click(); await page.locator("details summary").first().click(); },
  "corsa intera": async (page) => { await pick(page, "from", "Firenze"); await page.locator(".dep").nth(1).click(); await expect(page.locator(".tripstops")).toBeVisible(); },
  "fermate qui": async (page) => { await zoomOnStops(page); await page.click("#stopsBtn"); },
  "navigazione": async (page) => { await page.click("[data-mode='WALK']"); await pick(page, "from", "Firenze"); await pick(page, "to", "Pontassieve"); await page.locator(".itin").first().click(); await page.click("[data-nav]"); await expect(page.locator("#nav")).toBeVisible(); }
};
for (const scheme of ["light", "dark"]) {
  for (const [name, go] of Object.entries(VIEWS)) {
    test(`axe: ${name} (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await setup(page);
      await go(page);
      await page.waitForTimeout(400); // fine delle transizioni del pannello
      const res = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).exclude(".leaflet-tile-pane").analyze();
      const found = res.violations.map((v) => `${v.id} (${v.impact}): ${v.help}\n    ${v.nodes.slice(0, 4).map((n) => n.target.join(" ") + " — " + (n.failureSummary || "").split("\n").slice(1, 2).join("")).join("\n    ")}`);
      expect(found, found.join("\n")).toEqual([]);
    });
  }
}
test("axe: pagina privacy", async ({ page }) => {
  await page.goto("/privacy.html");
  const res = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(res.violations.map((v) => v.id)).toEqual([]);
});
