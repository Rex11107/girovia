const { defineConfig, devices } = require("@playwright/test");
const exe = process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {};
module.exports = defineConfig({
  testDir: "tests",
  timeout: 60000,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    ...devices["Pixel 7"],
    locale: "it-IT",
    timezoneId: "Europe/Rome",
    screenshot: "only-on-failure",
    launchOptions: exe
  },
  webServer: { command: "npx http-server -p 4173 -c-1 -s .", url: "http://127.0.0.1:4173/index.html", reuseExistingServer: true },
  projects: [
    { name: "mock", testMatch: /mock\.spec\.js/, use: { serviceWorkers: "block" } },
    { name: "offline", testMatch: /offline\.spec\.js/ },
    { name: "live", testMatch: /live\.spec\.js/, timeout: 120000 }
  ]
});
