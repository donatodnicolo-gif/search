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
# Se la CLI Vercel è già loggata su questa macchina il token si può omettere:
#   bash scripts/deploy-web.sh
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
  # COPIA, non `mv`: su Windows lo spostamento fallisce sistematicamente con
  # "Permission denied" (qualcosa tiene occupata la cartella) e il deploy si
  # ferma a metà, dopo aver già rifatto il build. La copia funziona sempre.
  # L'originale si prova a togliere: se resta non fa danno, Vercel ignora i
  # percorsi node_modules e i riferimenti nel bundle puntano ormai a `vendor`.
  cp -r dist-web/assets/node_modules dist-web/assets/vendor
  rm -rf dist-web/assets/node_modules 2>/dev/null || true
  grep -rl 'assets/node_modules' dist-web 2>/dev/null | while read -r f; do
    sed -i 's#assets/node_modules#assets/vendor#g' "$f"
  done
fi

echo "→ vercel.json (rewrite SPA + sonda di salute)"
# ⚠️ L'ORDINE CONTA: Vercel applica il primo rewrite che combacia. La regola
# della SPA («qualsiasi cosa → index.html») cattura tutto, /api/health compreso,
# ed è il motivo per cui il Hub leggeva dell'HTML dove si aspettava JSON e
# concludeva «database non pervenuto». La sonda va PRIMA, come le esclusioni in
# testa al matcher di un middleware Next.
#
# La destinazione è la Edge Function `health` su Supabase: un file statico
# direbbe solo che il server è su — quello si sapeva già — mentre qui si vuole
# sapere se il DATABASE risponde.
SUPA_REF="${SUPABASE_REF:-fdsziebgkljfsugqqbqd}"
cat > dist-web/vercel.json <<JSON
{
  "rewrites": [
    { "source": "/api/health", "destination": "https://${SUPA_REF}.supabase.co/functions/v1/health" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
JSON

echo "→ deploy prod (progetto deluxy-scout, pinnato per ID)"
STAGE="$(mktemp -d)/deluxy-scout"
mkdir -p "$STAGE/.vercel"
cp -r dist-web/. "$STAGE/"
# Pinna il progetto per ID: niente inferenza dal nome cartella.
printf '{"orgId":"%s","projectId":"%s"}\n' "$VERCEL_ORG_ID" "$VERCEL_PROJECT_ID" > "$STAGE/.vercel/project.json"
if [ -n "${VERCEL_TOKEN:-}" ]; then
  ( cd "$STAGE" && npx vercel deploy --prod --yes --token "$VERCEL_TOKEN" )
else
  # Nessun token: si usa la sessione della CLI (npx vercel login già fatto).
  ( cd "$STAGE" && npx vercel deploy --prod --yes )
fi

# L'app è una SPA: il testo runtime NON è nell'HTML statico. Uso il <title>,
# che è statico e distingue Scout ("Deluxy Scout") dall'app fiorai
# ("Trova Fiorai & Pasticcerie…").
#
# ⚠️ Il <title> da solo NON basta, e il 25/08/2026 si è visto: un deploy fatto
# pubblicando `dist-web` grezza (senza i due accorgimenti qui sopra) ha lasciato
# in produzione le icone a quadratini, ogni link profondo a 404 e /api/health
# giù — e questo controllo avrebbe detto «✓ OK», perché il titolo era giusto.
# Il titolo dice CHI serve il dominio, non SE funziona. Quindi si controllano
# anche le tre cose che i due accorgimenti esistono per garantire.
echo "→ verifica: $DOMINIO serve Scout, ed è servito per intero?"
GUAI=0
HTML="$(curl -fsSL "$DOMINIO" || true)"
if echo "$HTML" | grep -qi "<title>Deluxy Scout</title>"; then
  echo "  ✓ il dominio serve l'app Scout"
else
  echo "  ✗ $DOMINIO NON serve Scout (title inatteso — possibile sovrascrittura)." >&2
  echo "    Verifica che il progetto deluxy-scout non abbia ripreso l'integrazione Git col repo 'search'." >&2
  GUAI=1
fi

# ① Un link profondo: senza il rewrite della SPA risponde 404 e un F5 su una
#    qualsiasi schermata porta a una pagina di errore.
COD="$(curl -s -o /dev/null -w '%{http_code}' "$DOMINIO/oggi" || true)"
if [ "$COD" = "200" ]; then
  echo "  ✓ i link profondi rispondono (/oggi → 200)"
else
  echo "  ✗ /oggi → $COD: manca il rewrite della SPA (vercel.json non pubblicato)." >&2
  GUAI=1
fi

# ② La sonda di salute: è quella che legge il Hub in «Stato servizi».
SONDA="$(curl -s "$DOMINIO/api/health" || true)"
if echo "$SONDA" | grep -q '"ok"'; then
  echo "  ✓ /api/health risponde ($(echo "$SONDA" | head -c 60))"
else
  echo "  ✗ /api/health non risponde JSON: nel Hub Scout risulterà giù." >&2
  GUAI=1
fi

# ③ Il font delle icone: se resta sotto assets/node_modules Vercel non lo
#    pubblica e ogni icona diventa un quadratino. Si prende il primo .ttf
#    davvero referenziato dal bundle e lo si chiede al dominio.
TTF="$(grep -aoh '/assets/[^"]*.ttf' dist-web/_expo/static/js/web/*.js 2>/dev/null | head -1 || true)"
if [ -n "$TTF" ]; then
  COD="$(curl -s -o /dev/null -w '%{http_code}' "$DOMINIO$TTF" || true)"
  TIPO="$(curl -s -o /dev/null -w '%{content_type}' "$DOMINIO$TTF" || true)"
  case "$TIPO" in
    font/*|application/font*|application/octet-stream)
      echo "  ✓ il font delle icone è pubblicato ($TIPO)" ;;
    *)
      echo "  ✗ il font delle icone non arriva ($COD, $TIPO): icone a quadratini." >&2
      echo "    Di solito significa che i .ttf sono rimasti sotto assets/node_modules." >&2
      GUAI=1 ;;
  esac
else
  echo "  · nessun .ttf referenziato dal bundle: niente da controllare"
fi

if [ "$GUAI" != "0" ]; then
  echo "✗ ATTENZIONE: il deploy è uscito ma il sito NON è a posto (vedi sopra)." >&2
  exit 1
fi
echo "✓ OK: Scout è in produzione e servito per intero."
