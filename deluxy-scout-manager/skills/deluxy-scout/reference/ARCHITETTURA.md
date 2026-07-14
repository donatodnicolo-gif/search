# Deluxy Scout — Architettura & Regole

## Stack
Expo (Expo Router, TypeScript, New Architecture) · Supabase (`@supabase/supabase-js`) · `react-native-maps` · `react-native-svg` (grafici) · AsyncStorage + NetInfo (coda offline) · expo-location / expo-image-picker / expo-notifications. Integrazione HubSpot v3 tramite Supabase Edge Function (Deno).

## Struttura cartelle (`deluxy-scout/`)
```
app/                        # schermate (Expo Router)
  _layout.tsx               # AuthProvider + Stack + avvio auto-flush coda offline
  index.tsx                 # redirect in base alla sessione
  (auth)/login.tsx          # login email/password
  (app)/                    # area protetta (Tabs), guard su sessione
    mappa.tsx               # [tab] mappa (NATIVO): tutti i pin, colori priorità, filtri, pianificatore di giro + pannello tappe ordinate e "Naviga" multi-tappa
    mappa.web.tsx           # [tab] mappa (WEB): stessa logica giro senza react-native-maps → lista target + "Naviga" (Google Maps in nuova scheda)
    lista.tsx               # [tab] lista target: filtri + ricerca testuale + FAB "nuovo target"
    dashboard.tsx           # [tab] metriche commerciali (grafici SVG)
    profilo.tsx             # [tab] profilo/impostazioni: utente, coda sync, integrazioni, export CSV, logout
    attivita/[id].tsx       # scheda attività + ipotesi + naviga/modifica + nuova visita + contatti
    visita/[placeId].tsx    # nuova visita: offline, next-step obbligatorio, cross-sell separato
    contatto/[placeId].tsx  # aggiungi contatto (nome, ruolo, tel, email, is_decisore)
    nuovo-target.tsx        # crea attività dalla posizione GPS, ipotesi auto dalla categoria
    modifica/[id].tsx       # modifica attività (nome, indirizzo, zona, categoria, priorità, stato)
    visita-dettaglio/[id].tsx # dettaglio visita: briefing/note/esito/next + foto vetrina
components/                 # BoxIpotesi, EsitoButtons, Filters, PriorityBadge, SyncBadge, StatCard, BarChart
lib/                        # supabase, auth, env, db, categoryRules, hubspot, syncQueue,
                            #   metrics, location, nav, giro, reminders, theme, usePlaces, export
types/index.ts              # tipi condivisi (Place, Contact, Visit, Deal, Linea, CategoryRule…)
supabase/
  migrations/               # 0001_schema.sql · 0002_rls.sql · 0003_seed.sql
  functions/hubspot-sync/   # Edge Function Deno (logica HubSpot lato server)
  seed/lead.example.csv
scripts/                    # mgmt-query.mjs, hubspot-setup-properties.mjs, import-places.mjs, create-user.mjs, gen-icons.mjs
stubs/empty.js              # modulo vuoto per gli stub Metro (otel / react-native-maps su web)
metro.config.js             # Metro + stub @opentelemetry/api e react-native-maps (web)
__tests__/                  # metrics.test.ts, rules.test.ts, nav.test.ts
app.config.ts               # legge .env → extra (anon key ok; token HubSpot NON qui); web: bundler metro, output single
```

## Web (deluxy-scout.vercel.app)
L'app gira anche da browser tramite `react-native-web`. La schermata Mappa usa `mappa.web.tsx` (niente `react-native-maps`, solo-nativo): lista target + pianificatore di giro + "Naviga" su Google Maps. `metro.config.js` stubba `react-native-maps` su web e `@opentelemetry/api` (dep opzionale di supabase-js) ovunque. Build con `npm run build:web` (→ `dist-web`, SPA autoconsistente); deploy statico su Vercel (`vercel deploy`, no integrazione Git). GPS/fotocamera degradati su web; il login e il resto delle schermate funzionano.

## Regole di prodotto (invarianti — non violarle)
1. La mappa mostra **tutte** le attività; i filtri sono opzionali e servono al giro. Priorità: **P1 oro `#A6832B` / P2 navy `#1B2A4A` / P3 grigio**, con icona di stato sovrapposta al pin.
2. 9 linee di servizio. Le 3 in **standby** (Clientelling, Concierge, Magazzino, `attiva_bool=false`) **non** compaiono come ipotesi primaria: solo nel selettore "cross-sell" della nuova visita.
3. L'app **alimenta** HubSpot: ogni visita → Company + Contatto + Deal. Non lo sostituisce.
4. Il campo **next-step** della visita è **obbligatorio** (non si salva senza).
5. **Offline-first**: senza rete la visita va in coda AsyncStorage con badge "da sincronizzare"; al ritorno online la coda si svuota (foto → visita → stato place → sync HubSpot) con retry e gestione 429.
6. Segreti solo in `.env` / secret server. Mai nel bundle o nel repo.

## Modello dati (Supabase)
Tabelle: `places`, `contacts`, `visits`, `deals`, `lines`, `category_rules`. Enum: `priorita_t (P1/P2/P3)`, `stato_place_t (da_visitare/visitato/cliente/perso)`, `esito_visita_t (interessato/da_richiamare/non_target/chiuso)`, `dealstage_t`. PostGIS: colonna `geo` generata + indice GIST su `places`. RLS: solo utenti autenticati; `visits`/`deals` attribuiti all'`owner` per la dashboard per-venditore.

## Mappature chiave
**category_rules** (categoria → linea_ipotizzata / aggancio / priorità). Fallback locale in `lib/categoryRules.ts` allineato al seed. Esempi: gioielleria/moda/hotel → Consegne P1; ristorante premium → Food Supplier P1; fioraio/pasticceria → Re-seller P1; studio legale/banca/uffici → Regali aziendali P2; wedding → Catering P2; retail/altro → Consegne P3.

**Esito visita → stato place** (`lib/syncQueue.ts` `statoDaEsito`): interessato/da_richiamare → `visitato`; non_target → `perso`; chiuso → `cliente`.

**Esito visita → dealstage HubSpot** (`supabase/functions/hubspot-sync/index.ts` `dealstageDaEsito`): interessato → `decisionmakerboughtin`; da_richiamare → `appointmentscheduled`; chiuso → `closedwon`; non_target → `closedlost`. (Fasi reali della pipeline: appointmentscheduled, decisionmakerboughtin, contractsent, closedwon, closedlost.)

**Proprietà custom HubSpot** (create da `scripts/hubspot-setup-properties.mjs`):
- Company: `deluxy_linea`, `deluxy_priorita`.
- Deal: `deluxy_linea`, `deluxy_briefing`, `deluxy_note_post`, `deluxy_esito_analisi`, `deluxy_next_step`.

**Scelta di design HubSpot**: Briefing / Note post meeting / Esito e analisi sono scritti come **proprietà del deal** (non come Nota/engagement), perché le "Service key" beta di HubSpot non espongono lo scope note. Sono comunque visibili nella view "trattative def" aggiungendo le colonne. Se in futuro si usa una Private App con scope `crm.objects.notes.write`, si può ripristinare la creazione della Nota.

## Edge Function `hubspot-sync` (Deno)
Proxy sicuro app↔HubSpot; il token vive come secret `HUBSPOT_TOKEN`. Azioni:
- `sync_visit { visit_id }` → upsert Company (+`hubspot_company_id` sul place), upsert Contact, crea Deal con le proprietà, marca `visits.hubspot_synced=true`.
- `deals_for_place { place_id }` → sync inverso (fasi/valori dei deal per la scheda attività).
Autentica l'utente via JWT Supabase (`getUser`) e usa la service_role key (iniettata da Supabase) per scrivere sul DB. Gestisce 429 (RateLimit).

## Flusso "giro" (mappa)
"Pianifica giro" ordina le tappe per priorità (P1>P2>P3) e prossimità (nearest-neighbor entro ciascun livello), disegna la polyline e apre un **pannello scrollabile** con l'elenco numerato (badge priorità, zona, distanza dalla tappa precedente; tap → scheda attività). Il pulsante **🧭 Naviga** apre Google Maps con il percorso multi-tappa (`lib/nav.ts` → `urlNavigazioneGiro`: origine + fino a 9 waypoint + destinazione; oltre il limite tronca e lo segnala). Funziona anche senza mappa renderizzata (utile finché Maps non è configurato). Coperto da `__tests__/nav.test.ts`.

## Flusso "nuova visita"
Check-in GPS → box ipotesi editabile → linea primaria (esclude standby) + cross-sell (solo standby) → esito a bottoni → Briefing/Note/Esito (dettatura da tastiera OS) → foto vetrina (Storage) → next-step obbligatorio → salva. Online: foto→visita→stato→sync HubSpot. Offline: coda. Dopo esito "interessato"/"da_richiamare": promemoria locale recap email entro 12h.
