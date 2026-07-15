#!/usr/bin/env bash
# Build web + FIX FONT + deploy su Vercel.
#
# Perché il fix-font: l'export mette i font di @expo/vector-icons in
# assets/node_modules/... e Vercel ESCLUDE le cartelle node_modules dal deploy,
# quindi il .ttf non viene pubblicato e le icone appaiono come quadratini.
# Soluzione: sposta i font in assets/vendor e aggiorna i riferimenti nel bundle.
#
# Uso (dal worktree deluxy-scout):
#   VERCEL_TOKEN=<token> bash scripts/deploy-web.sh
set -e

echo "→ build web"
rm -rf dist-web
npx expo export --platform web --output-dir dist-web

echo "→ fix font (sposta assets/node_modules → assets/vendor)"
cd dist-web
if [ -d assets/node_modules ]; then
  mv assets/node_modules assets/vendor
  grep -rl 'assets/node_modules' . 2>/dev/null | while read -r f; do
    sed -i 's#assets/node_modules#assets/vendor#g' "$f"
  done
fi

echo "→ vercel.json (rewrite SPA)"
printf '{\n  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]\n}\n' > vercel.json

echo "→ deploy prod"
npx vercel deploy --prod --yes --token "$VERCEL_TOKEN"
