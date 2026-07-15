# Deluxy Scout — Stato del progetto & Handoff

Ultimo aggiornamento: **15 luglio 2026**. Questo documento permette a un altro agente di riprendere il progetto senza contesto pregresso.

> ⚡ **COME RIPRENDERE IN UNA NUOVA FINESTRA (checklist)**
> 1. Apri una nuova sessione Claude Code nel progetto e scrivi **"continua deluxy-scout"** (la memoria si carica da sola e rimanda a questo file).
> 2. **Lavora nel worktree** `C:\Users\nicol\scoutwt` (branch `scout-ui`), **non** in `C:\Users\nicol\app`. Se il worktree non c'è più: `git -C C:\Users\nicol\app worktree add -b scout-ui C:\Users\nicol\scoutwt scout-ui` (o `deluxy-scout`), poi ricrea la junction `node_modules` (`cmd //c "mklink /J node_modules C:\Users\nicol\app\deluxy-scout\node_modules"`) e copia `.env`.
> 3. **Node**: `$env:Path = "$env:ProgramFiles\nodejs;$env:Path"`. Verifica con `npx tsc --noEmit` + `npx jest`.
> 4. **Token da rifornire** (io NON li salvo — chiedili all'utente quando servono): `EXPO_TOKEN` (build APK), `VERCEL_TOKEN` (deploy web), `SUPABASE_PAT`/`SUPABASE_ACCESS_TOKEN` (migrazioni + deploy Edge Functions), e opzionale `ANTHROPIC_API_KEY` (match AI). Google Maps/HubSpot vivono già come secret server.
> 5. **Deploy web**: usa **`VERCEL_TOKEN=<token> bash scripts/deploy-web.sh`** (fa build + **fix font** + deploy). ⚠️ IMPORTANTE: senza il fix, Vercel esclude `assets/node_modules` (dove finiscono i font di @expo/vector-icons) e le **icone appaiono come quadratini**; lo script sposta i font in `assets/vendor`. URL: deluxy-scout.vercel.app.
> 6. **Migrazioni** applicate fino a **0012**; **⚠️ 0013 (`visits.concorrenti`) e 0014 (`profiles`) scritte ma NON applicate** — eseguirle con `SUPABASE_PAT`: `node scripts/mgmt-query.mjs supabase/migrations/0013_concorrenti.sql` e `...0014_profiles.sql`. Entrambe **degradano con grazia** se assenti (0013: la visita si salva senza concorrenti; 0014: la dashboard Team mostra nomi di ripiego "Utente xxxxxx"). Dopo la 0013 **rideploya `hubspot-sync`**.
> 6b. **Web deployato** con: campo Concorrenti + fix nomi mobile (card a colonna <560px) + **dashboard Team per admin** (riepilogo rete, scheda per venditore, feed) + **drill-down venditore giorno per giorno con KPI** + **editing nome** (Profilo per sé, dettaglio venditore per l'admin). URL live aggiornato.
> 7. `scout-ui` è **pushato su GitHub** (origin/scout-ui). Dopo ogni tappa: commit + `git push`. Per integrare: merge su `deluxy-scout`.

> ⚠️ **Segreti**: nessun valore segreto è in questo file. Le chiavi vere stanno in `deluxy-scout/.env` (gitignored) e nei secret della Edge Function. Gli identificatori qui sotto (project ref, portal id, URL) **non** sono segreti.

> 🧭 **AMBIENTE DI LAVORO (14 lug 2026)**: per sfuggire alla concorrenza con l'altra sessione (che continuava a spostare il branch `deluxy-scout` nella working tree condivisa `C:\Users\nicol\app`), lo sviluppo Scout si è spostato in un **git worktree isolato**: cartella **`C:\Users\nicol\scoutwt`**, branch **`scout-ui`** (creato da `deluxy-scout`). `node_modules` è una **junction** verso quello del main tree; `.env` copiato. Build/deploy si fanno da lì. **Per integrare il lavoro**: `git merge scout-ui` sul branch `deluxy-scout` (o PR). Il branch `deluxy-scout` è condiviso/rumoroso (ci committa anche l'altra sessione col progetto `deluxy-platform-next`); `scout-ui` è pulito e solo-Scout.

> 🧭 **Navigazione (14 lug 2026)**: da tab bar in basso a **drawer laterale a scomparsa** (`expo-router/drawer`, `_layout.tsx`): logo D in cima + voci con icona, attiva oro (sidebar DS), hamburger nell'header. Aggiunte dep `@react-navigation/drawer` + `react-native-gesture-handler` + `react-native-reanimated` (plugin in `babel.config.js`). Nota: reanimated è nativo → per l'APK Android servirà un **nuovo build EAS** (il web è già live).

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
- **Google Maps (Android)** — chiave configurata (l'utente l'ha fornita il 13 lug). Salvata in `deluxy-scout/.env` (`EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY`, gitignored) **e** come **variabile d'ambiente EAS** (scope progetto, ambiente `preview`, visibilità *sensitive* → non committata): creata con `eas env:create`. Il profilo `preview` di `eas.json` ora ha `"environment": "preview"` così il build la preleva. iOS lasciato vuoto (app solo Android).
- **Build EAS con Maps (13 lug 2026)** — nuovo APK preview `finished` che include la chiave (log EAS: *"…loaded from the 'preview' environment: EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY"*). Artifact: `https://expo.dev/artifacts/eas/2HVixTwvQ6fV7RLXC9_IZ1GIwrqrmSAWxRXe2TQxVog.apk` (build `6ff9f020-8991-4452-8aa7-866064958b91`). Stesso keystore del build precedente (stessa SHA-1). Nota: sul tier gratuito la **coda** può durare ore.
- **Feature "giro navigabile" (13 lug)** — nuovo `lib/nav.ts` (URL Google Maps: singola destinazione + percorso multi-tappa con waypoint, cap 9 + troncamento segnalato) e pannello tappe ordinate in `mappa.tsx` con pulsante 🧭 Naviga. Logica del giro estratta in `lib/giro.ts` (condivisa). Test in `__tests__/nav.test.ts`. `tsc` pulito, **18/18 jest verdi**. Non ancora committato (vedi §git sotto).
- **Versione WEB live (14 lug 2026)** — l'app gira anche da browser: **https://deluxy-scout.vercel.app** (deploy statico su Vercel, account `donatodnicolo-gif`, team `deluxy`, progetto `deluxy-scout`). Verificata nel browser (login reso, 0 errori console). Come è fatta:
  - Dipendenze web: `react-dom`, `react-native-web`, `@expo/metro-runtime` (via `expo install`).
  - `app.config.ts` → `web: { bundler: 'metro', output: 'single' }` (SPA).
  - **`mappa.web.tsx`**: variante web della schermata Mappa (react-native-maps è solo-nativo). Niente mappa: lista target + pianificatore di giro + pulsante 🧭 Naviga (apre Google Maps in una scheda). Riusa `lib/giro.ts`.
  - **`metro.config.js`**: stub di `@opentelemetry/api` (dipendenza opzionale di supabase-js, non installata) e di `react-native-maps` su web (→ `{ type: 'empty' }`). Stub vuoto in `stubs/empty.js`.
  - Build: `npm run build:web` (= `expo export --platform web --output-dir dist-web`). Il bundle è **autoconsistente** (anon key Supabase già inclusa). La chiave Maps Android nel bundle è ininfluente sul web (ristretta all'app Android).
  - **Deploy**: `dist-web` (con `vercel.json` di rewrite SPA) copiata in una cartella `deluxy-scout/` e pubblicata con `npx vercel deploy --prod --yes --token <VERCEL_TOKEN>`. Nessuna integrazione Git (evita il branch condiviso). Per ripubblicare: `npm run build:web`, poi rideploy della cartella. **Serve login utente Supabase per usarla davvero** (vedi §3.1).
- **Sezioni nuove richieste dall'utente (14 lug 2026)** — funzionano su desktop e mobile:
  - **"Dove vai?"** — spostata nella **Mappa** (`mappa.tsx` nativa + `mappa.web.tsx`), non più in Target (scelta utente). Componente riutilizzabile `components/AddressSearch.tsx` con **suggerimenti Google (autocomplete)** a tendina mentre digiti; alla scelta ricentra la mappa (nativo) o riordina la lista per vicinanza (web) e imposta il punto di partenza del giro. Backend: `lib/geocode.ts` → **Edge Function `geocode`** con 3 azioni (`geocode`, `autocomplete`, `details`), Google **Geocoding + Places** lato server (chiavi come secret). ✅ **DEPLOYATA e funzionante (14 lug 2026)**: secret `GOOGLE_GEOCODING_KEY` impostato (si riusa la STESSA chiave Maps `AIza…qTH8`, scelta utente → resa senza restrizione app); Geocoding+Places API abilitate; testato: Google risponde, funzione raggiungibile (OPTIONS 200, 401 senza auth). Il flusso end-to-end autenticato lo verifica l'utente loggato dal sito.
  - **Rubrica** (`rubrica.tsx`, nuovo tab 📇): tutti i contatti registrati (query `fetchTuttiContatti` con join sul negozio), ricerca, badge "HubSpot ✓ / da sync", tap→scheda negozio, azioni tel/email. Dati da Supabase (già sincronizzati con HubSpot).
  - **Trattative** (`trattative.tsx`, nuovo tab 💼): tutte le deal raggruppate per negozio (`SectionList`, `fetchTutteTrattative`), fase leggibile (`labelFase` in `theme.ts`), valore atteso, totale in testata, tap→scheda negozio.
  - Tab totali ora 6: Mappa · Target · Rubrica · Trattative · Dashboard · Profilo. `tsc` pulito, web build OK, 18/18 jest.
- **🆕 Motore "Scoperta sul territorio" — TAPPA 1 (14 lug 2026)**: nuovo flusso richiesto dall'utente — digiti un indirizzo → l'app trova i negozi della zona da **Google Places Nearby**, li **classifica** per linea (category_rules), li salva in cache e li mostra; ⭐ = interessante (entra nel giro), badge **NOVITÀ** per i mai visti.
  - **Schema** (migrazione `0004_discovery.sql`, applicata): su `places` aggiunti `source`('manual'|'google'), `google_place_id`(unique), `google_types`, `starred`, `novita`, `da_completare`, `hubspot_deal_aperta`, `hubspot_sync_at`, `google_refresh_at`; tabella cache `google_aree` (griglia ~100m, refresh 30gg, RLS senza policy = solo service_role); funzione SQL `places_vicini(lat,lng,raggio)` (usa l'indice GIST).
  - **Edge Function `discover`** (deployata): azione `discover {lat,lng,radius}` → se la cella è fresca (<30gg) serve dal DB, altrimenti chiama Google Nearby, classifica, inserisce i nuovi (`novita=true`) senza toccare starred/stato dei noti, aggiorna `google_aree`, ritorna `{places, cached, nuovi}`. Riusa il secret `GOOGLE_GEOCODING_KEY` (serve **Places API** già abilitata). Google Nearby testato ✓.
  - **Client**: `lib/discover.ts` (`scopriNegozi`), `db.aggiornaStarred`, tipo `Place` esteso (campi opzionali). **Mappa web** (`mappa.web.tsx`) collegata: ricerca indirizzo → lista negozi scoperti con ⭐ e NOVITÀ, giro dai ⭐. `tsc`/web build/jest ok, deployata.
  - **TAPPA 1b fatta (14 lug 2026)**: **paginazione** Nearby (fino a ~60 risultati, 3 pagine con pagetoken+attesa 2s, dedup); **icone tipologia** per linea (`iconaLinea`/`lineaIcona` in `theme.ts`); **filtro per tipologia** a pillole nella Mappa web; **redesign stile Apple** della scheda scoperta (`mappa.web.tsx`: liste raggruppate, icona-tipologia per card, badge NOVITÀ, ⭐, dock flottante). tsc/build ok, deployata.
  - **TAPPA 1c fatta (14 lug 2026)**: **filtro priorità** ripristinato (era sparito nel redesign) + badge priorità sulle card, accanto al filtro tipologia (2 righe di pillole); **spunta "sono stato qui"** (☐/☑ sulla card) → `components/VisitaModal.tsx` (pop-up bottom-sheet: contatto opzionale + note; "Salva visita" = `registraVisitaRapida` crea contatto+visita e stato→visitato; "Compila dopo" = `segnaVisitatoDaCompletare` → `da_completare=true`, resta come attività); nuova **scheda "Da fare"** (`da-completare.tsx`, tab 📝) che elenca i `da_completare` e riapre il pop-up per completarli. Tab totali ora **7**. tsc/build/jest ok, deployata.
  - **TAPPA 1d fatta (14 lug 2026)**: **"Non interessante" 🚫** sulla card scoperta → `aggiornaNascosto(true)`: l'attività sparisce e non torna più nella scoperta (migrazione `0005_nascosti.sql`: colonna `nascosto` + `places_vicini` la esclude). Recuperabile da **Profilo → "Nascosti"** → `nascosti.tsx` (rotta drawer nascosta) con **Ripristina** (`aggiornaNascosto(false)`, `fetchNascosti`).
  - **TAPPA 1e — copia locale CRM HubSpot + match contatti (15 lug 2026)**: estratto TUTTO il CRM HubSpot (portal 147623810: **514 aziende, 1657 contatti**, 1365 con azienda) in tabelle locali Supabase `hubspot_companies`/`hubspot_contacts` (migrazione `0006_hubspot_crm.sql`, con **pg_trgm** + RPC `cerca_azienda_hubspot(nome, indirizzo)` per match fuzzy). Estrazione **server-side** via Edge Function `hubspot-match` azione **`sync_crm`** (deployata con `--no-verify-jwt`: sync_crm apribile senza sessione utente, `match_contacts` resta con auth). Client: `cercaContattiHubspot(nome, indirizzo)` (match locale istantaneo, **niente chiave AI**) usato dal pulsante **"Trova contatti su HubSpot"** nella scheda attività (mostra azienda + contatti importabili con "+ Aggiungi"). **Profilo → "Sincronizza contatti da HubSpot"** (`sincronizzaHubspot` → sync_crm) per riaggiornare periodicamente. La conciliazione **AI** (azione `match_contacts` + `trovaContattiAI`) resta pronta ma spenta finché non si imposta `ANTHROPIC_API_KEY` (secret).
  - ⏳ **TAPPE SUCCESSIVE (da fare)**: (2) wiring scoperta nella **Mappa nativa** (`mappa.tsx`, con pin) — ora ancora sul vecchio flusso DB; (3) **"Sincronizza HubSpot"** — azione batch che incrocia i negozi con HubSpot e salva `hubspot_deal_aperta` (ri-eseguibile ogni tot; il pallino "● trattativa" è già predisposto); (4) ✅ FATTO 15 lug — sync HubSpot automatico dopo `registraVisitaRapida` (vedi "Revisione commerciale"); (5) rifinire `TYPE_MAP` (Google types → categoria) + foto negozio da Google.
- **💼 Revisione da esperto commerciale (15 lug 2026)** — ottimizzato il ciclo visita→follow-up (commit `cb8faa1` + successivo, branch `scout-ui`):
  - **Esito obbligatorio nella visita rapida**: `VisitaModal` ora chiede "Com'è andata?" con i 4 chip (`EsitoButtons`); la nota è obbligatoria solo per interessato/da_richiamare. `registraVisitaRapida(placeId, {esito, note, contatto})` salva l'esito, deriva lo **stato del place** dalla regola unica `statoDaEsito` (spostata da `lib/syncQueue.ts` a **`@/types`**, re-export per compatibilità) e imposta un `next_step` commerciale suggerito (`nextStepDaEsito` in `db.ts`). Mostra anche l'**aggancio d'apertura** nel pop-up.
  - **Sync HubSpot immediato (best effort)** dopo la visita rapida: chiama `syncVisita` se configurato; **mai per i non_target** (non inquinare la pipeline); su errore la visita resta `hubspot_synced=false`.
  - **Coda richiami**: `daRicontattare(places, visits)` in `lib/metrics.ts` — ultima visita per negozio con esito interessato (soglia recap 3 gg) o da_richiamare (7 gg), esclusi cliente/perso; ordina i ritardi prima. 6 test in `__tests__/richiami.test.ts` (24/24 verdi). La scheda **"Da fare"** (`da-completare.tsx`) ha ora 2 sezioni: **Da ricontattare** (badge IN RITARDO, nota ultima visita, tap→scheda attività) + **Da completare** (come prima, tap→pop-up).
  - **Dashboard**: card "Visite ultimi 7 giorni" (ritmo, col totale come sub) e "Da ricontattare (N in ritardo)" al posto del solo storico; `carica()` con try/finally (spinner non resta più appeso su errore). Fix rollback ⭐ in `mappa.web.tsx` (ripristina anche `novita`).
  - ⚠️ **Non verificato nel browser**: serve un utente loggato (io non digito password). Verifica utente: segnare una visita rapida → controllare esito nella scheda, coda "Da fare", numeri dashboard, e la visita su HubSpot.
- **Tipologia di interesse = linea Deluxy (14 lug 2026)** — chiarito dall'utente: NON un campo nuovo, è la `linea_ipotizzata`. Resa **visibile** (tag oro nella lista Target, nella card web della Mappa, nella Rubrica) e **selezionabile** con `components/LineaSelector.tsx` (mostra le 6 linee attive, `LINEE_ATTIVE` in `types`): nel **nuovo target** (override dell'ipotesi automatica) e nella **modifica** attività (`aggiornaPlace` già accetta `linea_ipotizzata`). La query Rubrica ora include `place_linea`.

- **🎨 Adottato il Deluxy Design System v1.0 (14 lug 2026)**: il DS ufficiale vive in `deluxy-design-system/` (root del repo, committato sul branch `deluxy-scout` come `93f0429`). Scout lo adotta: `lib/theme.ts` **rimappato sui token DS** (sfondo `#F5F5F7`, testo `#1D1D1F`, azioni primarie **ink `#111318`**, accento **oro `#B8963E`** usato poco, hairline/fill neutri, ombre `shadow.card/float`). I nomi storici restano (`navy`→ink, `oro`→gold) per non rompere le schermate. **Login** ridisegnato stile DS (card chiara, logo D oro su quadrato ink, campi raggruppati, CTA pillola nera, footnote brand) — verificato live. Bottoni primari → ink in VisitaModal/nuovo-target/modifica. Commit `6c13b2f` + `79b26bc`. **Header/tab bar** ora chiari DS (surface bianco, testo ink, no ombra, icona attiva oro) e **FAB** ink — commit `2854be2`. ⏳ Resta (opzionale): dock "Naviga" ancora oro (accento tollerato), badge di stato secondo §Componenti del DS, eventuale blur (`expo-blur`) su barre.

## 3. ⏳ Cosa manca (richiede l'utente / suoi account)
1. **Utente auth per il login** — pronto lo script `scripts/create-user.mjs`: crea/aggiorna l'utente in Supabase Auth via Admin API, con email+password forniti **dall'utente** via env var (l'agente non vede la password); crea l'utente già confermato. Serve la `service_role` key. Comando in §5. In alternativa: Supabase → Authentication → Users → *Add user*.
2. **Restringere la chiave Google Maps** (sicurezza, da fare) — la chiave Android finisce nell'APK ed è estraibile: la protezione vera è restringerla in Google Cloud Console → Credenziali → *App Android*: nome pacchetto `it.deluxy.scout` + **SHA-1** del keystore (presa da dashboard Expo → Credentials → Android), e restrizione API a *Maps SDK for Android*. Verificare che *Maps SDK for Android* sia abilitata e che il progetto Google Cloud abbia **billing attivo**.
3. **Test end-to-end HubSpot** — con un utente loggato (punto 1), registrare una visita e verificare company+contatto+deal con le proprietà su HubSpot.
4. **iOS / distribuzione store** — l'APK Android preview è fatto; per iOS serve setup Apple, per gli store la submission.
5. ✅ **FATTO (14 lug 2026)** — geocoding "Dove vai?" + suggerimenti Google **attivo** (funzione `geocode` deployata, secret `GOOGLE_GEOCODING_KEY` impostato con la chiave `AIza…qTH8`, Geocoding+Places abilitate, testato ok). Storico passaggi (per riferimento / rotazione chiave):
   a. Google Cloud → abilitare **Geocoding API** *e* **Places API** + **billing** attivo; creare una **chiave dedicata** con restrizione API = *Geocoding API + Places API* (NON restrizione app Android, altrimenti le REST non passano).
   b. Deploy della Edge Function e secret:
      ```powershell
      $env:SUPABASE_ACCESS_TOKEN = "<PAT Supabase>"
      npx -y supabase@latest functions deploy geocode --project-ref fdsziebgkljfsugqqbqd
      npx -y supabase@latest secrets set GOOGLE_GEOCODING_KEY=<chiave> --project-ref fdsziebgkljfsugqqbqd
      ```
   Finché non è fatto, la barra "Dove vai?" mostra un errore leggibile; il resto della scheda Target funziona normalmente. Il client deriva l'URL da solo (`<supabaseUrl>/functions/v1/geocode`), nessuna env var nuova.

> **Git** (branch `deluxy-scout`):
> - `0c5e0a9` — versione web (Vercel) + giro navigabile + config Maps.
> - `<commit 14 lug>` — sezioni Rubrica/Trattative + barra "Dove vai?" (geocode) + Edge Function `geocode`. File nuovi: `app/(app)/rubrica.tsx`, `app/(app)/trattative.tsx`, `lib/geocode.ts`, `supabase/functions/geocode/index.ts`. Modificati: `lib/db.ts`, `lib/theme.ts`, `app/(app)/_layout.tsx`, `app/(app)/lista.tsx`.
> - `.env` resta gitignored.
> **⚠️ Concorrenza**: un'altra sessione Claude lavora sull'app fiorai nella **stessa working directory** `C:\Users\nicol\app` e fa `git checkout` tra `main` e `deluxy-scout` → i file di deluxy-scout appaiono/spariscono ("flickering") e le modifiche non committate rischiano di perdersi. Non lanciare due sessioni sulla stessa cartella; se serve, committare spesso o usare un git worktree separato.

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
- `create-user.mjs` — crea/aggiorna l'utente di login in Supabase Auth (Admin API). Email+password via env var (`SCOUT_EMAIL`/`SCOUT_PASSWORD`), utente già confermato. Idempotente.
- `gen-icons.mjs` — rigenera icona/splash/adaptive/favicon da SVG (richiede `sharp`).

## 8. Creare l'utente di login (comando)
```powershell
Set-Location 'C:\Users\nicol\app\deluxy-scout'
$env:Path = "$env:ProgramFiles\nodejs;$env:Path"
$env:SUPABASE_URL = "https://fdsziebgkljfsugqqbqd.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "<service_role key>"   # Supabase → Project Settings → API
$env:SCOUT_EMAIL = "nome@deluxy.it"
$env:SCOUT_PASSWORD = "<password scelta dall'utente, min 6>"
node scripts/create-user.mjs
```

## 9. Chiave Maps come variabile EAS (già fatto — riferimento)
```powershell
$env:EXPO_TOKEN = "<personal access token Expo>"
npx eas-cli env:create --scope project --name EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY --value "<key>" --visibility sensitive --environment preview --non-interactive
npx eas-cli build -p android --profile preview --non-interactive --no-wait
```
