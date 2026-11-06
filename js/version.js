// Versione dell'app: la scrive scripts/copy-app.sh da package.json (qui nel codice sorgente resta il segnaposto).
export const VERSION = "0.2.0";
export const versionLabel = () => (VERSION.startsWith("__") ? "sviluppo" : VERSION);
