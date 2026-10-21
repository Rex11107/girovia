// Funzioni: bici, condividere un percorso, link condivisi, scorciatoia Casa, biglietti, bici e monopattini in sharing.
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const FX = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures.json"), "utf8"));
const NOW = "2026-10-21T06:30:00Z";
const TILE_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
const clone = (x) => JSON.parse(JSON.stringify(x));
const PROVIDERS = { providerGroups: [], providers: [{ id: "dott-fi", name: "Dott", groupId: "dott", url: "https://ridedott.com", formFactors: ["SCOOTER_STANDING"], bbox: [], vehicleTypes: [] }], stations: [], vehicles: [], zones: [] };
const VEHICLES = { ...PROVIDERS, vehicles: [
  { id: "v1", providerId: "dott-fi", providerGroupId: "dott", typeId: "s", lat: 43.7731, lon: 11.2562, formFactor: "SCOOTER_STANDING", propulsionType: "ELECTRIC", isReserved: false, isDisabled: false, rentalUriWeb: "https://ridedott.com/v1" },
  { id: "v2", providerId: "dott-fi", providerGroupId: "dott", typeId: "s", lat: 43.7729, lon: 11.2551, formFactor: "SCOOTER_STANDING", propulsionType: "ELECTRIC", isReserved: true, isDisabled: false }
] };

test.use({ permissions: ["geolocation", "clipboard-read", "clipboard-write"], geolocation: { latitude: 43.7764, longitude: 11.2480, accuracy: 5 } });

async function setup(page, opts = {}) {
  const calls = [];
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.addInitScript(({ now, favs }) => {
    const t = new Date(now).getTime(); Date.now = () => t;
    try { delete Navigator.prototype.share; } catch { /* niente */ }
    try { window.speechSynthesis.speak = () => {}; } catch { /* niente voce */ }
    if (favs && !sessionStorage.getItem("seeded")) { localStorage.setItem("girovia.favs", JSON.stringify(favs)); sessionStorage.setItem("seeded", "1"); }
  }, { now: NOW, favs: opts.favs || null });
  await page.route("**/*", async (route) => {
    const u = route.request().url();
    if (u.startsWith("http://127.0.0.1")) return route.continue();
    if (/tile\.openstreetmap|cartocdn/.test(u)) return route.fulfill({ body: TILE_PNG, contentType: "image/png", headers: { "access-control-allow-origin": "*" } });
    calls.push(decodeURIComponent(u));
    if (u.includes("/rentals")) {
      if (!opts.sharing) return route.fulfill({ json: { providerGroups: [], providers: [], stations: [], vehicles: [], zones: [] } });
      return route.fulfill({ json: u.includes("min=") ? VEHICLES : PROVIDERS });
    }
    if (u.includes("/reverse-geocode")) return route.fulfill({ json: [] });
    if (u.includes("/geocode")) return route.fulfill({ json: decodeURIComponent(u).includes("Firenze") ? FX.geo : FX.geo2 });
    if (u.includes("/map/stops")) return route.fulfill({ json: [] });
    if (u.includes("/plan")) {
      const p = clone(FX.plan);
      if (decodeURIComponent(u).includes("RENTAL")) {
        // primo tratto in monopattino Dott invece che a piedi
        const it = p.itineraries[0];
        it.legs[0] = { ...it.legs[0], mode: "RENTAL", rental: { providerId: "dott-fi", providerGroupId: "dott", systemId: "dott", systemName: "Dott", formFactor: "SCOOTER_STANDING", fromStationName: "", rentalUriWeb: "https://ridedott.com/ride" } };
      }
      return route.fulfill({ json: p });
    }
    if (u.includes("/stoptimes")) return route.fulfill({ json: FX.stoptimes });
    if (u.includes("/trip")) return route.fulfill({ json: FX.trip });
    if (u.includes("routing.openstreetmap.de")) return route.fulfill({ json: FX.osrm });
    return route.fulfill({ status: 500, body: "non previsto: " + u });
  });
  await page.goto(opts.url || "/index.html");
  return { calls, errors };
}
async function pick(page, field, text) {
  await page.click("#" + field);
  await page.fill("#" + field, text);
  await expect(page.locator("#sugg button").first()).not.toContainText("La mia posizione");
  await page.locator("#sugg button").first().click();
}

test("bici: percorso con il server bici e navigazione", async ({ page }) => {
  const { calls, errors } = await setup(page);
  await page.click("[data-mode='BIKE']");
  await pick(page, "from", "Firenze");
  await pick(page, "to", "Pontassieve");
  await expect(page.locator("#sheetTitle")).toHaveText("In bici");
  expect(calls.some((u) => u.includes("routed-bike"))).toBe(true);
  await page.locator(".itin").first().click();
  await expect(page.locator("#sheetTitle")).toContainText("In bici · 25 min");
  await page.click("[data-nav]");
  await expect(page.locator("#nav")).toBeVisible();
  await page.click("#navStop");
  expect(errors).toEqual([]);
});

test("condividi: copia un link che riapre lo stesso percorso", async ({ page, context }) => {
  await setup(page);
  await pick(page, "from", "Firenze");
  await pick(page, "to", "Pontassieve");
  await page.click("[data-share]");
  await expect(page.locator(".toast")).toContainText("Link del percorso copiato");
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toMatch(/^https:\/\/rex11107\.github\.io\/girovia\/\?da=43\.776400%2C11\.248000&dn=Firenze\+Santa\+Maria\+Novella&a=43\.774500%2C11\.433000&an=Pontassieve&m=TRANSIT$/);

  // lo stesso link, aperto su un altro telefono
  const other = await context.newPage();
  const { calls } = await setup(other, { url: "/index.html?" + link.split("?")[1] });
  await expect(other.locator(".itin").first()).toBeVisible();
  await expect(other.locator("#from")).toHaveValue("Firenze Santa Maria Novella");
  await expect(other.locator("#to")).toHaveValue("Pontassieve");
  expect(calls.some((u) => u.includes("/plan"))).toBe(true);
  expect(new URL(other.url()).search).toBe(""); // indirizzo ripulito
});

test("scorciatoia Vai a Casa: parte da dove sei verso Casa", async ({ page }) => {
  const home = { lat: 43.7745, lon: 11.433, name: "Pontassieve", type: "PLACE" };
  await setup(page, { url: "/index.html?vai=casa", favs: { home, work: null, list: [] } });
  await expect(page.locator("#to")).toHaveValue("Pontassieve");
  await expect(page.locator("#from")).toHaveValue("La mia posizione");
  await expect(page.locator(".itin").first()).toBeVisible();
});

test("scorciatoia senza Casa impostata: porta ai Preferiti", async ({ page }) => {
  await setup(page, { url: "/index.html?vai=casa" });
  await expect(page.locator("[data-tab='fav']")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".toast")).toContainText("Imposta prima Casa");
});

test("biglietti nel dettaglio del viaggio", async ({ page }) => {
  await setup(page);
  await pick(page, "from", "Firenze");
  await pick(page, "to", "Pontassieve");
  await page.locator(".itin").first().click();
  const t = page.locator(".ticket a").first();
  await expect(t).toHaveText("Biglietti AT");
  await expect(t).toHaveAttribute("href", "https://www.at-bus.it/it");
  await expect(t).toHaveAttribute("rel", "noopener");
});

test("sharing: monopattino nel percorso e mezzi sulla mappa, disattivabile", async ({ page }) => {
  const { calls, errors } = await setup(page, { sharing: true });
  await pick(page, "from", "Firenze");
  await pick(page, "to", "Pontassieve");
  await expect(page.locator(".itin").first().locator(".chip").first()).toContainText("Dott");
  expect(calls.some((u) => u.includes("/plan") && u.includes("preTransitModes=WALK,RENTAL"))).toBe(true);
  await page.locator(".itin").first().click();
  await expect(page.locator("#sheetBody")).toContainText("Monopattino Dott");
  await expect(page.locator("#sheetBody a", { hasText: "Apri il servizio di sharing" })).toHaveAttribute("href", "https://ridedott.com/ride");

  await page.evaluate(() => window.__girovia.map.setView([43.7730, 11.2558], 17, { animate: false }));
  await expect(page.locator(".rentdot")).toHaveCount(1); // il mezzo prenotato non si mostra
  await expect(page.locator(".rentdot")).toHaveAttribute("aria-label", "monopattino Dott: dettagli");

  // opzione spenta: niente sharing nella ricerca
  await page.click("[data-clear='to']");
  await page.click("[data-tab='info']");
  await page.locator("#optSharing").uncheck();
  const before = calls.length;
  await pick(page, "to", "Pontassieve");
  await expect(page.locator(".itin").first()).toBeVisible();
  expect(calls.slice(before).some((u) => u.includes("RENTAL"))).toBe(false);
  expect(errors).toEqual([]);
});

test("quattro mezzi stanno in una riga anche su telefono stretto", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await setup(page);
  const tops = await page.locator(".modes button").evaluateAll((bs) => bs.map((b) => Math.round(b.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(1);
  const w = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
  expect(w[0]).toBeLessThanOrEqual(w[1]);
});
