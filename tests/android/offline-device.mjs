// Test dell'APK su un telefono Android (emulatore su GitHub Actions), con i servizi reali:
// online → modalità aereo → app riaperta offline → di nuovo online.
// Si collega alla WebView dell'app (APK di debug) con Playwright e fa screenshot del telefono.
// Uso: node tests/android/offline-device.mjs <apk>
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { chromium } from "@playwright/test";

const APK = process.argv[2];
const PKG = "io.github.rex11107.girovia";
const OUT = "android-results";
fs.mkdirSync(`${OUT}/screens`, { recursive: true });

const lines = [];
let failures = 0, step = 0;
const log = (s) => { lines.push(s); console.log(s); };
const ok = (name, detail = "") => log(`- ✅ ${name}${detail ? " — " + detail : ""}`);
const fail = (name, detail = "") => { failures++; log(`- ❌ ${name}${detail ? " — " + String(detail).split("\n")[0].slice(0, 300) : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const adb = (...a) => execFileSync("adb", a, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

function shot(name) {
  const file = `${String(++step).padStart(2, "0")}-${name}.png`;
  try { fs.writeFileSync(`${OUT}/screens/${file}`, execFileSync("adb", ["exec-out", "screencap", "-p"], { maxBuffer: 64 << 20 })); }
  catch (e) { log(`  (screenshot ${file} non riuscito: ${e.message})`); }
}

// Una verifica: se fallisce lo scrive nel rapporto e va avanti con le altre
async function check(name, fn) {
  try { const d = await fn(); ok(name, d || ""); return true; }
  catch (e) { fail(name, e.message); return false; }
}

let browser = null, page = null;
async function connect() {
  if (browser) { await browser.close().catch(() => {}); browser = null; }
  try { adb("forward", "--remove-all"); } catch { /* niente da togliere */ }
  for (let i = 0; i < 60; i++) {
    let pid = "";
    try { pid = adb("shell", "pidof", PKG).trim(); } catch { /* app non ancora avviata */ }
    const socks = pid ? adb("shell", "cat", "/proc/net/unix") : "";
    const m = pid && socks.match(new RegExp(`@(webview_devtools_remote_${pid})\\b`));
    if (m) {
      adb("forward", "tcp:9222", `localabstract:${m[1]}`);
      browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
      for (let k = 0; k < 30; k++) {
        page = browser.contexts().flatMap((c) => c.pages()).find((p) => p.url().startsWith("https://rex11107.github.io"));
        if (page) break;
        await sleep(500);
      }
      if (!page) throw new Error("pagina dell'app non trovata nella WebView");
      await page.locator("#sheetTitle").waitFor({ timeout: 30000 });
      return;
    }
    await sleep(1000);
  }
  throw new Error("WebView dell'app non raggiungibile (APK di debug?)");
}
async function launch() {
  adb("shell", "am", "force-stop", PKG);
  adb("shell", "am", "start", "-W", "-n", `${PKG}/.MainActivity`);
  await connect();
}
async function airplane(on) {
  adb("shell", "cmd", "connectivity", "airplane-mode", on ? "enable" : "disable");
  await sleep(on ? 4000 : 10000);
}
async function pick(field, text) {
  await page.click("#" + field);
  await page.fill("#" + field, text);
  await page.waitForFunction(() => { const b = document.querySelector("#sugg button"); return b && !/La mia posizione/.test(b.textContent); }, null, { timeout: 30000 });
  await sleep(800);
  await page.locator("#sugg button").first().click();
}
async function pickStop(field, text) {
  await page.click("#" + field);
  await page.fill("#" + field, text);
  await page.locator("#sugg button", { hasText: "Fermata" }).first().waitFor({ timeout: 30000 });
  await sleep(800);
  await page.locator("#sugg button", { hasText: "Fermata" }).first().click();
}
const visible = (sel, timeout = 30000) => page.locator(sel).first().waitFor({ state: "visible", timeout });
const tilesLoaded = () => page.locator(".leaflet-tile-loaded").count();
const savedTiles = () => page.evaluate(async () => (await (await caches.open("girovia-tiles-v2")).keys()).length);

async function main() {
  log(`# Girovia su Android (emulatore): prova offline\n\nEseguito: ${new Date().toISOString()}\n`);
  const sdk = adb("shell", "getprop", "ro.build.version.sdk").trim();
  const wv = (() => { try { return adb("shell", "dumpsys", "webviewupdate").match(/Current WebView package \(name, version\): \(([^)]+)\)/)?.[1]; } catch { return ""; } })();
  log(`Android API ${sdk} · WebView ${wv || "?"}\n`);
  await airplane(false);
  adb("install", "-r", "-g", APK);

  log("## 1. Online");
  await check("L'app si apre", async () => { await launch(); return await page.locator("#sheetTitle").textContent(); });
  await check("Gira come app Android con il componente Rete", async () => {
    const r = await page.evaluate(() => ({ native: !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()), net: !!(window.Capacitor && window.Capacitor.isPluginAvailable && window.Capacitor.isPluginAvailable("Network")) }));
    if (!r.native || !r.net) throw new Error(JSON.stringify(r));
  });
  await check("La mappa si carica", async () => { await page.waitForFunction(() => document.querySelectorAll(".leaflet-tile-loaded").length >= 4, null, { timeout: 45000 }); return `${await tilesLoaded()} riquadri`; });
  shot("online-avvio");
  await check("Partenze dalla stazione SMN", async () => { await pickStop("from", "Firenze Santa Maria Novella"); await visible(".dep", 45000); return `${await page.locator(".dep").count()} partenze`; });
  shot("online-partenze");
  await check("Percorso con i mezzi verso Pontassieve", async () => { await pick("to", "Pontassieve"); await visible(".itin", 60000); return `${await page.locator(".itin").count()} soluzioni`; });
  await check("Viaggio salvato", async () => { await page.click("[data-save-trip]"); await page.waitForFunction(() => /salvato/.test(document.querySelector("[data-save-trip]").textContent)); });
  shot("online-risultati");
  await check("Dettaglio e corsa intera", async () => {
    await page.locator(".itin").first().click();
    await visible("[data-trip]", 15000);
    await page.locator("[data-trip]").first().click();
    await visible(".tripstops li", 45000);
    return `${await page.locator(".tripstops li").count()} fermate`;
  });
  shot("online-corsa");
  await check("Tile della mappa conservate sul telefono", async () => { const n = await savedTiles(); if (!n) throw new Error("nessuna"); return `${n} riquadri`; });

  log("\n## 2. Modalità aereo con l'app aperta");
  await airplane(true);
  await check("Compare l'avviso \"Sei offline\"", async () => { await visible("#net", 15000); return await page.locator("#net").textContent(); });
  shot("aereo-avviso");

  log("\n## 3. App riaperta senza rete");
  await check("L'app si apre offline", async () => { await launch(); return await page.locator("#sheetTitle").textContent(); });
  await check("Avviso offline all'avvio", async () => { await visible("#net", 15000); });
  await check("La mappa mostra le zone già viste", async () => { await page.waitForFunction(() => document.querySelectorAll(".leaflet-tile-loaded").length >= 4, null, { timeout: 20000 }); return `${await tilesLoaded()} riquadri dalla memoria`; });
  shot("offline-avvio");
  await check("Viaggio salvato → risultati salvati", async () => {
    await page.click("[data-tab='trips']");
    await page.locator("[data-t]").first().click();
    await visible(".saved", 20000);
    const note = (await page.locator(".saved").first().textContent()).replace(/\s+/g, " ");
    if (!/salvati/.test(note)) throw new Error(note);
    return `${await page.locator(".itin").count()} soluzioni · "${note.slice(0, 70)}"`;
  });
  shot("offline-risultati");
  await check("Corsa intera salvata", async () => {
    await page.locator(".itin").first().click();
    await page.locator("[data-trip]").first().click();
    await visible(".tripstops li", 20000);
    if (!(await page.locator(".saved").count())) throw new Error("manca l'indicazione dei dati salvati");
    return `${await page.locator(".tripstops li").count()} fermate`;
  });
  shot("offline-corsa");
  await check("Partenze salvate della stazione SMN", async () => {
    await page.click("[data-clear='from']");
    await page.click("[data-tab='recent']");
    await page.locator("[data-r]").filter({ hasText: /Novella|SMN/i }).first().click();
    await visible(".saved", 20000);
    return `${await page.locator(".dep").count()} partenze non ancora passate`;
  });
  shot("offline-partenze");
  await check("Ricerca nuova offline: messaggio chiaro, nessun blocco", async () => {
    await page.click("[data-clear='to']").catch(() => {});
    await page.click("#to"); await page.fill("#to", "Siena piazza del Campo");
    await page.waitForFunction(() => /offline/i.test(document.querySelector("#sugg")?.textContent || ""), null, { timeout: 10000 });
    return (await page.locator("#sugg").textContent()).trim().slice(0, 90);
  });
  shot("offline-ricerca-nuova");

  log("\n## 4. Di nuovo online");
  await airplane(false);
  await check("L'avviso offline sparisce", async () => { await page.locator("#net").waitFor({ state: "hidden", timeout: 30000 }); });
  await check("La ricerca torna a funzionare", async () => {
    await page.fill("#to", "Pontassieve");
    await page.waitForFunction(() => { const b = document.querySelector("#sugg button"); return b && /Pontassieve/i.test(b.textContent); }, null, { timeout: 30000 });
    await page.locator("#sugg button").first().click();
    await page.waitForFunction(() => document.querySelector(".itin") || document.querySelector(".err") || document.querySelector(".dep"), null, { timeout: 60000 });
    if (await page.locator(".saved").count()) throw new Error("mostra ancora dati salvati");
  });
  shot("di-nuovo-online");
}

main()
  .catch((e) => fail("Errore inatteso", e.stack || e.message))
  .finally(async () => {
    try { fs.writeFileSync(`${OUT}/logcat.txt`, adb("logcat", "-d", "-v", "time", "chromium:I", "Capacitor:V", "Capacitor/Console:V", "*:S")); } catch { /* logcat non disponibile */ }
    if (browser) await browser.close().catch(() => {});
    log(`\n**Esito: ${failures ? failures + " verifiche fallite" : "tutto ok"}**`);
    fs.writeFileSync(`${OUT}/rapporto.md`, lines.join("\n") + "\n");
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n");
    process.exit(failures ? 1 : 0);
  });
