// L'app vera contro i servizi veri, come la userebbe una persona.
// Gira su GitHub Actions; salva gli screenshot come artefatto del job.
const { test, expect } = require("@playwright/test");

const SHOTS = "test-results/screens-live";

async function pick(page, field, text) {
  await page.click("#" + field);
  await page.fill("#" + field, text);
  await expect(page.locator("#sugg button").first()).not.toContainText("La mia posizione", { timeout: 20000 });
  await page.waitForTimeout(800); // lascia arrivare i risultati definitivi
  await page.locator("#sugg button").first().click();
}

test.describe.configure({ mode: "serial" });

test("Firenze SMN → Pontassieve con i mezzi", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("/index.html");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/01-home.png` });
  await pick(page, "from", "Firenze Santa Maria Novella");
  await expect(page.locator("#sheetTitle")).not.toHaveText("Dove vuoi andare?", { timeout: 20000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/02-partenze.png` });
  await pick(page, "to", "Pontassieve");
  await expect(page.locator(".itin, .err").first()).toBeVisible({ timeout: 45000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${SHOTS}/03-risultati.png` });
  await expect(page.locator(".itin").first()).toBeVisible();
  await page.locator(".itin").first().click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${SHOTS}/04-dettaglio.png` });
  const tripBtn = page.locator("[data-trip]").first();
  if (await tripBtn.count()) {
    await tripBtn.click();
    await expect(page.locator(".mini div").first()).toBeVisible({ timeout: 30000 });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${SHOTS}/05-corsa.png` });
  }
  expect(errors).toEqual([]);
});

test("Firenze → Greve in Chianti in auto e a piedi verso Fiesole", async ({ page }) => {
  await page.goto("/index.html");
  await pick(page, "from", "Firenze Santa Maria Novella");
  await page.click("[data-mode='CAR']");
  await pick(page, "to", "Greve in Chianti");
  await expect(page.locator(".itin").first()).toBeVisible({ timeout: 45000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${SHOTS}/06-auto.png` });
  await page.locator(".itin").first().click();
  await expect(page.locator(".steps li").first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/07-auto-indicazioni.png` });
  await page.click("[data-mode='WALK']");
  await page.click("[data-clear='to']");
  await pick(page, "to", "Fiesole");
  await expect(page.locator(".itin").first()).toBeVisible({ timeout: 45000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${SHOTS}/08-piedi.png` });
});

test("fermate sulla mappa in centro", async ({ page }) => {
  await page.goto("/index.html");
  await page.locator("#map").waitFor();
  await page.evaluate(() => window.__girovia.map.setView([43.7731, 11.2560], 17)); // zoom sul Duomo
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${SHOTS}/09-fermate-mappa.png` });
  const n = await page.locator(".leaflet-interactive").count();
  expect(n).toBeGreaterThan(0);
});
