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
