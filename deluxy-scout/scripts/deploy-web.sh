#!/usr/bin/env bash
# Build web + FIX FONT + deploy su Vercel — SEMPRE sul progetto deluxy-scout.
#
# Tre accorgimenti:
# 1) FONT: l'export mette i font di @expo/vector-icons in assets/node_modules/... e
#    Vercel ESCLUDE le cartelle node_modules → il .ttf non viene pubblicato e le
#    icone appaiono come quadratini. Soluzione: spostarli in assets/vendor.
# 2) PROGETTO PINNATO: NON ci si affida più al nome della cartella per scegliere
#    il progetto (inferenza fragile → collisioni). Si scrive un .vercel/project.json
#    con gli ID espliciti di deluxy-scout, così il deploy finisce SEMPRE lì.
#    (projectId/orgId NON sono segreti: sono identificatori, come il project ref.)
# 3) VERIFICA POST-DEPLOY: dopo il deploy si controlla che deluxy-scout.vercel.app
#    serva davvero Scout (non l'app fiorai). Se no, esce con errore.
#
# ⚠️ Il progetto deluxy-scout su Vercel NON deve avere l'integrazione Git col repo
#    condiviso `search`: la root del repo è l'app fiorai e ogni push su main la
#    ripubblicherebbe qui sopra, sovrascrivendo Scout (già scollegata il 15/07/2026).
#
# Uso (dal worktree deluxy-scout):
#   VERCEL_TOKEN=<token> bash scripts/deploy-web.sh
set -e

# ID del progetto Vercel di Scout (team "deluxy"). Non segreti.
VERCEL_ORG_ID="team_vt9JRBhnxbY4spm5LzhNyxoY"
VERCEL_PROJECT_ID="prj_rnV0sqhZJ4GXiNXrT5OJXLb7Pjem"
DOMINIO="https://deluxy-scout.vercel.app"

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

echo "→ deploy prod (progetto deluxy-scout, pinnato per ID)"
STAGE="$(mktemp -d)/deluxy-scout"
mkdir -p "$STAGE/.vercel"
cp -r dist-web/. "$STAGE/"
# Pinna il progetto per ID: niente inferenza dal nome cartella.
printf '{"orgId":"%s","projectId":"%s"}\n' "$VERCEL_ORG_ID" "$VERCEL_PROJECT_ID" > "$STAGE/.vercel/project.json"
( cd "$STAGE" && npx vercel deploy --prod --yes --token "$VERCEL_TOKEN" )

# L'app è una SPA: il testo runtime NON è nell'HTML statico. Uso il <title>,
# che è statico e distingue Scout ("Deluxy Scout") dall'app fiorai
# ("Trova Fiorai & Pasticcerie…").
echo "→ verifica: $DOMINIO serve Scout?"
HTML="$(curl -fsSL "$DOMINIO" || true)"
if echo "$HTML" | grep -qi "<title>Deluxy Scout</title>"; then
  echo "✓ OK: il dominio serve l'app Scout."
else
  echo "✗ ATTENZIONE: $DOMINIO NON serve Scout (title inatteso — possibile sovrascrittura)." >&2
  echo "  Verifica che il progetto deluxy-scout non abbia ripreso l'integrazione Git col repo 'search'." >&2
  exit 1
fi
