const js = require("@eslint/js");
const globals = require("globals");
module.exports = [
  { ignores: ["node_modules/**", "test-results/**", "playwright-report/**", "_site/**", "vendor/**", "android/**", "www/**"] },
  js.configs.recommended,
  {
    files: ["app.js", "config.js"],
    languageOptions: { ecmaVersion: 2022, sourceType: "script", globals: { ...globals.browser, L: "readonly" } },
    rules: { "no-unused-vars": ["error", { caughtErrors: "none" }], "no-empty": ["error", { allowEmptyCatch: true }], "eqeqeq": ["error", "smart"], "no-implicit-globals": "error" }
  },
  {
    files: ["sw.js"],
    languageOptions: { ecmaVersion: 2022, sourceType: "script", globals: { ...globals.serviceworker } }
  },
  {
    files: ["tests/**/*.{js,mjs}", "*.config.js", "eslint.config.js"],
    languageOptions: { ecmaVersion: 2022, globals: { ...globals.node, ...globals.browser } }
  },
  { files: ["tests/**/*.mjs"], languageOptions: { sourceType: "module" } }
];
