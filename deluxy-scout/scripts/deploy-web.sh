#!/usr/bin/env bash
# Build web + FIX FONT + deploy su Vercel (progetto deluxy-scout).
#
# Due accorgimenti necessari:
# 1) FONT: l'export mette i font di @expo/vector-icons in assets/node_modules/... e
#    Vercel ESCLUDE le cartelle node_modules → il .ttf non viene pubblicato e le
#    icone appaiono come quadratini. Soluzione: spostarli in assets/vendor.
# 2) PROGETTO: `vercel deploy` usa il NOME della cartella come progetto e un
#    eventuale .vercel/ la linka. Per finire sempre su "deluxy-scout.vercel.app"
#    si deploya da una cartella chiamata esattamente "deluxy-scout", senza .vercel.
#
# Uso (dal worktree deluxy-scout):
#   VERCEL_TOKEN=<token> bash scripts/deploy-web.sh
set -e

echo "→ build web"
rm -rf dist-web
npx expo export --platform web --output-dir dist-web

echo "→ fix font (assets/node_modules → assets/vendor)"
if [ -d dist-web/assets/node_modules ]; then
  mv dist-web/assets/node_modules dist-web/assets/vendor
  grep -rl 'assets/node_modules' dist-web 2>/dev/null | while read -r f; do
    sed -i 's#assets/node_modules#assets/vendor#g' "$f"
  done
fi

echo "→ vercel.json (rewrite SPA)"
printf '{\n  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]\n}\n' > dist-web/vercel.json

echo "→ deploy prod (progetto deluxy-scout)"
STAGE="$(mktemp -d)/deluxy-scout"
mkdir -p "$STAGE"
cp -r dist-web/. "$STAGE/"
rm -rf "$STAGE/.vercel"
( cd "$STAGE" && npx vercel deploy --prod --yes --token "$VERCEL_TOKEN" )
