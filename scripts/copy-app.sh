#!/usr/bin/env bash
# Copia i file dell'app in una cartella (sito GitHub Pages o APK) e marca la versione del service worker.
# Uso: scripts/copy-app.sh <cartella> [versione]
set -euo pipefail
DEST="${1:?cartella di destinazione}"; VER="${2:-$(date -u +%Y%m%d%H%M%S)}"
cd "$(dirname "$0")/.."
mkdir -p "$DEST"
cp index.html styles.css theme.js config.js privacy.html sw.js manifest.webmanifest icon.svg icon-192.png icon-512.png LICENSE "$DEST/"
mkdir -p "$DEST/js" && cp js/*.js "$DEST/js/"
cp -r vendor fonts "$DEST/"
sed -i "s/__BUILD__/${VER}/" "$DEST/sw.js"
APPVER=$(node -p "require('./package.json').version")
sed -i "s/__VERSION__/${APPVER}/" "$DEST/js/version.js"
echo "App ${APPVER} copiata in $DEST (build $VER)"
