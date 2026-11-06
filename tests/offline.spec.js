// Rete che va e viene: app che si apre offline (service worker), avvisi, timeout, fornitore di mappa di riserva.
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const FX = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures.json"), "utf8"));
const TILE_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");

// Le richieste del service worker passano dalle regole del contesto, non della pagina
async function mockNet(context, opts = {}) {
  const calls = [];
  await context.route("**/*", async (route) => {
    const u = route.request().url();
    if (u.startsWith("http://127.0.0.1")) {
      if (opts.timeoutMs && u.endsWith("/config.js")) {
        const r = await route.fetch();
        return route.fulfill({ response: r, body: (await r.text()).replace("timeoutMs: 15000", `timeoutMs: ${opts.timeoutMs}`) });
      }
      return route.continue();
    }
    calls.push(u);
    if (opts.net && opts.net.off) return route.abort("internetdisconnected");
    if (/tile\.openstreetmap\.org/.test(u) && opts.osmDown) return route.fulfill({ status: 503, body: "down" });
    if (/tile\.openstreetmap|cartocdn/.test(u)) return route.fulfill({ body: TILE_PNG, contentType: "image/png", headers: { "access-control-allow-origin": "*" } });
    if (u.includes("/geocode")) {
      if (opts.hang) return; // il servizio non risponde mai
      return route.fulfill({ json: FX.geo });
    }
    if (u.includes("/map/stops")) return route.fulfill({ json: [] });
    if (u.includes("/rentals")) return route.fulfill({ json: { providerGroups: [], providers: [], stations: [], vehicles: [], zones: [] } });
    if (u.includes("/plan")) return route.fulfill({ json: FX.plan });
    if (u.includes("/stoptimes")) return route.fulfill({ json: FX.stoptimes });
    if (u.includes("/trip")) return route.fulfill({ json: FX.trip });
    return route.fulfill({ status: 500, body: "non previsto" });
  });
  return calls;
}

test("si apre anche offline e avvisa quando la rete va e viene", async ({ page, context }) => {
  const net = { off: false };
  await mockNet(context, { net });
  await page.goto("/index.html");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // ora la pagina è controllata dal service worker
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await context.setOffline(true); net.off = true;
  await page.reload();
  await expect(page.locator("#sheetTitle")).toHaveText("Dove vuoi andare?");
  await expect(page.locator(".tabs")).toBeVisible();
  await expect(page.locator("#net")).toBeVisible();
  await expect(page.locator("#net")).toContainText("Sei offline");

  await page.click("#from");
  await page.fill("#from", "Firenze");
  await expect(page.locator("#sugg")).toContainText("Sei offline");

  await context.setOffline(false); net.off = false;
  await expect(page.locator("#net")).toBeHidden();
  await expect(page.locator(".toast")).toContainText("Di nuovo online");
});

test("se il servizio non risponde, dopo il tempo massimo lo dice", async ({ page, context }) => {
  await mockNet(context, { hang: true, timeoutMs: 1500 });
  await page.goto("/index.html?nosw");
  await page.click("#from");
  await page.fill("#from", "Firenze");
  await expect(page.locator("#sugg")).toContainText("non risponde", { timeout: 6000 });
});

test("se le tile OpenStreetMap non rispondono passa al fornitore di riserva", async ({ page, context }) => {
  const calls = await mockNet(context, { osmDown: true });
  await page.goto("/index.html?nosw");
  await expect(page.locator(".toast")).toContainText("Mappa: uso OpenStreetMap France", { timeout: 10000 });
  await expect.poll(() => calls.some((u) => u.includes("tile.openstreetmap.fr"))).toBe(true);
  await expect(page.locator(".leaflet-control-attribution")).toContainText("OSM France");
});

// ---------- Dati già visti, disponibili offline ----------
const NOW = Date.parse("2026-10-21T06:30:00Z");
// L'orologio della pagina si può spostare durante il test (window.__fakeNow)
async function fixClock(context) {
  await context.addInitScript((t) => { const real = Date.now; Date.now = () => (window.__fakeNow || t) + (real() - real()); }, NOW);
}
async function pickFirst(page, field, text) {
  await page.click("#" + field);
  await page.fill("#" + field, text);
  await expect(page.locator("#sugg button").first()).not.toContainText("La mia posizione");
  await page.locator("#sugg button").first().click();
}

test("offline: risultati, partenze, corsa e mappa già visti restano disponibili", async ({ page, context }) => {
  const net = { off: false };
  await fixClock(context);
  await mockNet(context, { net });
  await page.goto("/index.html");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  // online: fermata, corsa, percorso (tutto viene conservato)
  await pickFirst(page, "from", "Firenze");
  await expect(page.locator(".dep")).toHaveCount(3);
  await page.locator(".dep").nth(1).click();
  await expect(page.locator(".tripstops li").first()).toBeVisible();
  await page.click("#back"); await page.click("#back");
  await pickFirst(page, "to", "Firenze"); // il finto servizio di ricerca risponde sempre con SMN
  await expect(page.locator(".itin").first()).toBeVisible();
  await expect(page.locator(".saved")).toHaveCount(0);
  await expect.poll(() => page.evaluate(async () => (await (await caches.open("girovia-tiles-v2")).keys()).length)).toBeGreaterThan(0);

  // offline e riapertura dell'app
  await context.setOffline(true); net.off = true;
  await page.reload();
  await expect(page.locator("#net")).toBeVisible();
  // la mappa mostra le zone già viste (tile dalla memoria del telefono)
  await expect.poll(() => page.locator(".leaflet-tile-loaded").count()).toBeGreaterThan(0);
  const blobTiles = await page.locator(".leaflet-tile-loaded").evaluateAll((ts) => ts.length);
  expect(blobTiles).toBeGreaterThan(0);

  // lo stesso viaggio: risultati salvati con l'ora
  await page.click("[data-tab='recent']");
  await page.locator("[data-r]").first().click(); // Firenze SMN dai recenti → partenze salvate
  await expect(page.locator(".saved")).toContainText("Orari salvati alle 08:30");
  await expect(page.locator(".saved")).toContainText("Sei offline");
  await expect(page.locator(".dep")).toHaveCount(3);
  await page.locator(".dep").nth(1).click();
  await expect(page.locator(".saved")).toContainText("Corsa salvati");
  await expect(page.locator(".tripstops li")).toHaveCount(5);
});

test("offline: le soluzioni salvate già partite non si mostrano", async ({ page, context }) => {
  const net = { off: false };
  await fixClock(context);
  await mockNet(context, { net });
  await page.goto("/index.html?nosw");
  await pickFirst(page, "from", "Firenze");
  await pickFirst(page, "to", "Firenze");
  await expect(page.locator(".itin")).toHaveCount(2);
  await context.setOffline(true); net.off = true;
  await page.evaluate(() => { window.__fakeNow = Date.parse("2026-10-21T06:50:00Z"); }); // la prima soluzione (06:35) è partita
  await page.locator("[data-mode='CAR']").click(); await page.locator("[data-mode='TRANSIT']").click();
  await expect(page.locator(".saved")).toContainText("Risultati salvati alle 08:30");
  await expect(page.locator(".itin")).toHaveCount(1);
  await page.evaluate(() => { window.__fakeNow = Date.parse("2026-10-21T09:00:00Z"); }); // tutte partite
  await page.locator("[data-mode='CAR']").click(); await page.locator("[data-mode='TRANSIT']").click();
  await expect(page.locator(".err")).toContainText("già partite");
});

test("APK: lo stato della rete viene da Android anche se il browser crede di essere online", async ({ page, context }) => {
  // Nella WebView navigator.onLine resta true in modalità aereo: conta il componente Network
  await context.addInitScript(() => {
    window.Capacitor = { isPluginAvailable: (n) => n === "Network", Plugins: { Network: {
      getStatus: async () => ({ connected: true, connectionType: "wifi" }),
      addListener: (ev, fn) => { window.__netFn = fn; return { remove() {} }; }
    } } };
  });
  await mockNet(context, {});
  await page.goto("/index.html?nosw");
  await expect.poll(() => page.evaluate(() => typeof window.__netFn)).toBe("function");
  expect(await page.evaluate(() => navigator.onLine)).toBe(true);
  await expect(page.locator("#net")).toBeHidden();
  await page.evaluate(() => window.__netFn({ connected: false, connectionType: "none" }));
  await expect(page.locator("#net")).toBeVisible();
  await page.click("#from"); await page.fill("#from", "Pontassieve centro");
  await expect(page.locator("#sugg")).toContainText("Sei offline"); // risposta immediata, senza aspettare la rete
  await page.evaluate(() => window.__netFn({ connected: true, connectionType: "wifi" }));
  await expect(page.locator("#net")).toBeHidden();
  await expect(page.locator(".toast")).toContainText("Di nuovo online");
});
