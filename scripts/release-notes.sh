#!/usr/bin/env bash
# Stampa la sezione di CHANGELOG.md per una versione (es. 0.2.0), senza il titolo.
set -euo pipefail
V="${1:?versione}"
awk -v v="$V" '
  $0 ~ "^## \\[" v "\\]" { on = 1; next }
  on && /^## \[/ { exit }
  on { print }
' "$(dirname "$0")/../CHANGELOG.md" | sed -e '/./,$!d'
