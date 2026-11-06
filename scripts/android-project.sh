#!/usr/bin/env bash
# Prepara il progetto Android (Capacitor) con l'app web dentro: lo usano l'APK pubblicata
# e il test sull'emulatore. Uso: scripts/android-project.sh <versionCode> [build]
set -euo pipefail
cd "$(dirname "$0")/.."
N="${1:?versionCode (numero crescente)}"; BUILD="${2:-locale}"
rm -rf www android
scripts/copy-app.sh www "$BUILD"
# Nell'APK Capacitor può inserire nella pagina uno script inline per il collegamento
# con il telefono: la Content-Security-Policy lo deve permettere.
sed -i "s/script-src 'self';/script-src 'self' 'unsafe-inline';/" www/index.html
grep -q "script-src 'self' 'unsafe-inline';" www/index.html
npx cap add android
android-src/prepare.sh "$N"
npx cap sync android
