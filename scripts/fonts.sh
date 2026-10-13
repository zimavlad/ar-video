#!/usr/bin/env bash
# Тягне шрифти з кирилицею у static/fonts (самохост, без CDN у рантаймі).
# Беремо woff2 з пакетів fontsource у npm: лише підмножини cyrillic і latin.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DST="$ROOT/static/fonts"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$DST"
fetch() { # пакет файл...
  local pkg="$1"; shift
  (cd "$TMP" && npm pack "@fontsource/$pkg" --silent >/dev/null && mkdir -p "$pkg" && tar -xzf fontsource-"$pkg"-*.tgz -C "$pkg")
  for f in "$@"; do cp "$TMP/$pkg/package/files/$f" "$DST/$f"; done
}
fetch cormorant-garamond \
  cormorant-garamond-cyrillic-600-normal.woff2 cormorant-garamond-latin-600-normal.woff2 \
  cormorant-garamond-cyrillic-600-italic.woff2 cormorant-garamond-latin-600-italic.woff2
fetch alegreya-sans \
  alegreya-sans-cyrillic-400-normal.woff2 alegreya-sans-latin-400-normal.woff2 \
  alegreya-sans-cyrillic-500-normal.woff2 alegreya-sans-latin-500-normal.woff2
fetch jetbrains-mono \
  jetbrains-mono-cyrillic-500-normal.woff2 jetbrains-mono-latin-500-normal.woff2
ls -la "$DST"
