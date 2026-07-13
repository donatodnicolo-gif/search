# Deluxy Scout — Stato del progetto & Handoff

Ultimo aggiornamento: **11 luglio 2026**. Questo documento permette a un altro agente di riprendere il progetto senza contesto pregresso.

> ⚠️ **Segreti**: nessun valore segreto è in questo file. Le chiavi vere stanno in `deluxy-scout/.env` (gitignored) e nei secret della Edge Function. Gli identificatori qui sotto (project ref, portal id, URL) **non** sono segreti.

---

## 1. Cos'è
App mobile React Native (Expo Router, TypeScript) per la prospezione commerciale sul territorio a Milano. Backend Supabase (DB/Auth/Storage). Integrazione HubSpot via Supabase Edge Function. 6 fasi: mappa+priorità+giro · nuova visita offline · sync HubSpot · dashboard · test · build.

- **Codice**: `deluxy-scout/` (sotto-cartella del repo `donatodnicolo-gif/search`, branch `main`).
- **Repo GitHub**: https://github.com/donatodnicolo-gif/search

## 2. ✅ Fatto e verificato
- **Codebase completa** delle 6 fasi + estensioni di campo: nuovo target da GPS, aggiungi contatto (flag decisore), navigazione Google Maps, **modifica attività** e **schermata Profilo/Impostazioni** (4° tab: utente, stato coda sync, integrazioni, logout). Validata: `tsc --noEmit` pulito, `jest` verde (2 suite), `expo export --platform android` bundle OK (**1267 moduli**).
- **Identità visiva**: icona, adaptive icon (Android), splash e favicon brandizzate navy/oro (pin di mappa oro) — generate da SVG con `scripts/gen-icons.mjs` (dep dev `sharp`), collegate in `app.config.ts`. In `assets/`.
- **Rifiniture**: ricerca testuale nella lista target (nome/indirizzo/zona/categoria); dettaglio visita con foto vetrina (tap su una visita nello storico della scheda); **export CSV** di attività e visite dalla schermata Profilo (BOM UTF-8, condivisione via `expo-sharing`). Bundle a 1276 moduli.
- **Build EAS Android**: progetto **@deluxyoff/deluxy-scout** (projectId `81ab09df-c772-4c2b-b860-c590df0ec789`, owner `deluxyoff`). Primo **APK preview** generato con successo. Variabili Supabase nel profilo `preview` di `eas.json`. Fix necessario per SDK 52: plugin `expo-build-properties` con `android.kotlinVersion: '1.9.25'` (il default 1.9.24 rompeva `expo-modules-core:compileReleaseKotlin` per mismatch col Compose Compiler 1.5.15). Owner impostato in `app.config.ts` (`owner: 'deluxyoff'`, `extra.eas.projectId`). La build si lancia con `EXPO_TOKEN` (personal access token Expo) in modo non-interattivo: `npx eas-cli build -p android --profile preview --non-interactive --no-wait`.
- **Supabase** — org "Deluxy" (free), progetto **deluxy-scout**:
  - Project ref: **`fdsziebgkljfsugqqbqd`** · URL: **`https://fdsziebgkljfsugqqbqd.supabase.co`**
  - Migrazioni applicate e verificate (schema + RLS + seed): 9 linee (3 standby con `attiva_bool=false`), 20 `category_rules`, RLS attivo su tutte le tabelle, storage bucket `vetrine`. Accenti UTF-8 corretti.
  - Anon (publishable) key già in `deluxy-scout/.env`.
- **HubSpot** — account "Deluxy Srl", portal **`147623810`**, regione **EU (app-eu1)**:
  - Service key "Deluxy Scout" (8 scope: companies/contacts/deals read+write + schemas companies/deals write). Token in `.env` come secret della Edge Function (non nel client).
  - 7 proprietà custom create (vedi ARCHITETTURA §mappature).
  - Edge Function `hubspot-sync` **deployata**: `https://fdsziebgkljfsugqqbqd.supabase.co/functions/v1/hubspot-sync` (in `.env`). Secret `HUBSPOT_TOKEN` impostato. Verificata: 401 senza auth.
- **Node.js** v24 installato (`C:\Program Files\nodejs`).

## 3. ⏳ Cosa manca (richiede l'utente / suoi account)
1. **Utente auth per il login** — crearlo da Supabase → Authentication → Users → *Add user* (email + password scelta dall'utente). L'agente **non** deve digitare password né creare account al posto dell'utente.
2. **Chiavi Google Maps** (Android + iOS) — servono per far renderizzare `react-native-maps` (senza, la schermata Mappa mostra un segnaposto: guard in `mappa.tsx` via `env.hasGoogleMaps()`). Richiede un progetto Google Cloud con **billing attivo**. Vanno in `.env` (`EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY`, `..._IOS_KEY`) e nel profilo `preview` di `eas.json` per le build.
3. **Test end-to-end HubSpot** — con un utente loggato, registrare una visita e verificare company+contatto+deal con le proprietà su HubSpot.
4. **iOS / distribuzione store** — l'APK Android preview è già fatto (vedi §EAS); per iOS serve setup Apple, per gli store la submission.

## 4. 🔐 Housekeeping sicurezza
- `deluxy-scout/.env` è gitignored: **non committarlo mai**.
- **Revocare** il Personal Access Token Supabase "deluxy-scout-setup" (`sbp_...`, scade 10 ago 2026) quando il setup è concluso: Dashboard → Account → Access Tokens → Elimina. Serviva solo per migrazioni e deploy da terminale.
- Il token HubSpot vive come secret della Edge Function; se va rigenerato: HubSpot → Sviluppo → Chiavi → Chiavi di servizio → "Deluxy Scout" → Ruota, poi `supabase secrets set HUBSPOT_TOKEN=...`.

## 5. Come riprendere (comandi esatti, PowerShell)
Prependi sempre Node al PATH: `$env:Path = "$env:ProgramFiles\nodejs;$env:Path"`.

```powershell
# 0. posizionati
Set-Location 'C:\Users\nicol\app\deluxy-scout'
$env:Path = "$env:ProgramFiles\nodejs;$env:Path"

# 1. dipendenze (se node_modules manca)
npm install

# 2. validazione rapida
npx tsc --noEmit
npx jest
npx expo export --platform android --output-dir dist-check   # poi cancella dist-check

# 3. avvio dev server (per Expo Go / dev build)
npx expo start
```

**Eseguire SQL sul DB** (serve `SUPABASE_PAT` = Personal Access Token Supabase, dashboard → Account → Access Tokens):
```powershell
$env:SUPABASE_PAT = "<pat>"
node scripts/mgmt-query.mjs -e "select count(*) from places;"
node scripts/mgmt-query.mjs supabase/migrations/000X_file.sql
```

**Deploy Edge Function** (serve `SUPABASE_ACCESS_TOKEN` = un PAT Supabase):
```powershell
$env:SUPABASE_ACCESS_TOKEN = "<pat>"
npx -y supabase@latest functions deploy hubspot-sync --project-ref fdsziebgkljfsugqqbqd
npx -y supabase@latest secrets set HUBSPOT_TOKEN=<token> --project-ref fdsziebgkljfsugqqbqd
```
(Docker non serve: la CLI bundla via API.)

**Importare lead** (serve la service_role key, solo da terminale):
```powershell
$env:SUPABASE_URL = "https://fdsziebgkljfsugqqbqd.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "<service_role>"
node scripts/import-places.mjs supabase/seed/lead.example.csv
```

## 6. Trappole d'ambiente (importante)
- **Node non nel PATH di sessione** dopo l'install: usa il prefisso `$env:Path` sopra, o richiama `C:\Program Files\nodejs\node.exe` col percorso completo.
- **Browser dashboard Supabase**: Google Translate rompe React (crash `removeChild`) e un gestore appunti sovrascrive la clipboard. → migrazioni **via `scripts/mgmt-query.mjs`**, non via SQL Editor. Se devi comunque usare il browser, chiedi all'utente di disattivare la traduzione per quel sito.
- **Regione HubSpot = EU**: la dashboard è `app-eu1.hubspot.com`; l'API resta `api.hubapi.com` (il token instrada da solo).

## 7. Script disponibili (in `deluxy-scout/scripts/`)
- `mgmt-query.mjs` — esegue un file .sql o `-e "SQL"` via Supabase Management API (no password DB, no clipboard).
- `hubspot-setup-properties.mjs` — crea/verifica le 7 proprietà custom HubSpot (idempotente).
- `import-places.mjs` — importa un CSV di lead nella tabella `places`.
- `gen-icons.mjs` — rigenera icona/splash/adaptive/favicon da SVG (richiede `sharp`).
