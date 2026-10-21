// Versione dell'app: la scrive scripts/copy-app.sh da package.json (qui nel codice sorgente resta il segnaposto).
export const VERSION = "__VERSION__";
export const versionLabel = () => (VERSION.startsWith("__") ? "sviluppo" : VERSION);
