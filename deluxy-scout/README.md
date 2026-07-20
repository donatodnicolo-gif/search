# Deluxy Scout

App mobile (React Native + Expo) di prospezione commerciale sul territorio per il
Team Commerciale Deluxy a Milano. Mappa tutte le attività del territorio con
priorità e ipotesi di interesse pre-calcolate, registra le visite (anche offline)
e **alimenta HubSpot** creando company, contatti, deal e note.

Stack: **Expo (Expo Router, TypeScript)** · **Supabase** (DB / Auth / Storage) ·
**HubSpot API v3** via Supabase Edge Function.

---

## 1. Prerequisiti

- **Node.js 18+** e npm
- **Expo CLI**: `npm i -g eas-cli` (per le build)
- Un progetto **Supabase**
- Un **Private App token HubSpot**
- Chiavi **Google Maps** (Android + iOS) per `react-native-maps`

## 2. Installazione

```bash
cd deluxy-scout
npm install
cp .env.example .env      # poi compila i valori
```

### Variabili d'ambiente (`.env`)

| Variabile | Dove trovarla |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API (chiave *anon*, pubblica) |
| `EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY` | Google Cloud → Credentials (Maps SDK for Android) |
| `EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY` | Google Cloud → Credentials (Maps SDK for iOS) |
| `EXPO_PUBLIC_HUBSPOT_SYNC_URL` | URL della Edge Function `hubspot-sync` (vedi §5) |
| `EAS_PROJECT_ID` | Creato da `eas init` |

> **Sicurezza (regola di prodotto #5).** Nessun segreto nel codice o nel repo.
> La anon key di Supabase è pubblica *per design* (protetta da RLS). Il **token
> HubSpot NON sta mai nell'app**: qualunque cosa in `extra` finisce nel bundle ed
> è estraibile dal dispositivo. Il token vive solo come *secret* della Edge
> Function (vedi §5). `.env` è già in `.gitignore`.

## 3. Database Supabase (migrazioni)

Le migrazioni sono in `supabase/migrations/`:

1. `0001_schema.sql` — tabelle, enum, indice geospaziale (PostGIS/GIST)
2. `0002_rls.sql` — Row Level Security + bucket Storage `vetrine`
3. `0003_seed.sql` — le 9 linee (3 in standby con `attiva_bool=false`) + `category_rules`

**Con la Supabase CLI:**

```bash
supabase link --project-ref <REF>
supabase db push
```

**Oppure** incolla i tre file, in ordine, nel **SQL Editor** della dashboard.

### Utente venditore

Auth → Users → *Add user* (email + password). L'app usa login email/password;
solo gli utenti autenticati vedono i dati.

## 4. Importare i lead esistenti

Metti i lead in un CSV (vedi `supabase/seed/lead.example.csv`; colonne minime:
`nome, lat, lng`). Priorità e ipotesi possono mancare: l'app le pre-popola da
`category_rules` al primo caricamento della mappa.

```bash
SUPABASE_URL="https://xxxx.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="eyJ..." \
node scripts/import-places.mjs supabase/seed/lead.example.csv
```

> La *service role key* si usa **solo** da terminale, mai nell'app.
> In alternativa: Supabase → Table Editor → `places` → *Import data from CSV*.

## 5. Integrazione HubSpot (Edge Function)

La logica HubSpot vive lato server in `supabase/functions/hubspot-sync/`, così il
token resta un secret.

```bash
supabase functions deploy hubspot-sync
supabase secrets set HUBSPOT_TOKEN=pat-xx-xxxxxxxx
# SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sono già disponibili alle Edge Function
```

L'URL della funzione è `https://<ref>.supabase.co/functions/v1/hubspot-sync`
→ va in `EXPO_PUBLIC_HUBSPOT_SYNC_URL`.

**Token HubSpot:** una *Service key* (o Private App token) con gli scope:
`crm.objects.companies.read/write`, `crm.objects.contacts.read/write`,
`crm.objects.deals.read/write`, `crm.schemas.companies.write`,
`crm.schemas.deals.write`. (Le Service key beta non espongono lo scope note:
per questo Briefing/Note/Esito vanno come proprietà del deal, vedi sotto.)

**Proprietà custom su HubSpot**: creale una volta con
`HUBSPOT_TOKEN=... node scripts/hubspot-setup-properties.mjs`. Crea su *Company*
`deluxy_linea`, `deluxy_priorita`; su *Deal* `deluxy_linea`, `deluxy_briefing`,
`deluxy_note_post`, `deluxy_esito_analisi`, `deluxy_next_step`. La visita scrive
Briefing / Note post meeting / Esito e analisi in queste proprietà del deal
(visibili nella view **"trattative def"** aggiungendone le colonne).

Mappatura esito visita → `dealstage`:

| Esito app | dealstage HubSpot |
|---|---|
| Interessato | `decisionmakerboughtin` |
| Da richiamare | `appointmentscheduled` |
| Chiuso | `closedwon` |
| Non target | `closedlost` |

Se `EXPO_PUBLIC_HUBSPOT_SYNC_URL` è vuoto, l'app funziona lo stesso: le visite
restano su Supabase con `hubspot_synced=false` e verranno sincronizzate appena
la funzione è configurata.

## 6. Avvio in sviluppo

```bash
npx expo start          # poi 'a' Android, 'i' iOS
# dopo aver cambiato .env:
npx expo start -c       # pulisce la cache
```

> `react-native-maps` e la geolocalizzazione richiedono un **development build**
> o un dispositivo reale (non funzionano tutte le feature in Expo Go). Vedi §8.

## 7. Test

```bash
npm test
```

Coprono: mappatura `category_rules`, la regola "**linee in standby mai come
ipotesi primaria**", la mappatura esito→stato e le metriche della dashboard.

## 8. Build con EAS

```bash
eas login
eas init                       # popola EAS_PROJECT_ID
eas build --profile preview --platform android   # APK installabile
eas build --profile preview --platform ios
# produzione:
eas build --profile production --platform all
```

I profili sono in `eas.json`. Imposta le variabili d'ambiente di build con
`eas env:create` (o nel profilo) — non vengono lette da `.env` in build cloud.

## 9. Distribuzione ai venditori

- **Android**: link/APK dal profilo `preview` (installazione diretta), oppure
  *Internal testing* su Google Play.
- **iOS**: *TestFlight* (`eas submit -p ios`) invitando le email del team.
- Ogni venditore accede con le proprie credenziali Supabase: le sue visite e i
  suoi deal restano attribuiti a lui (`owner`) per la dashboard per-venditore.

---

## Struttura del progetto

```
deluxy-scout/
├── app/                       # schermate (Expo Router)
│   ├── (auth)/login.tsx
│   └── (app)/                 # area protetta (tab)
│       ├── mappa.tsx          # mappa + priorità + pianificatore di giro
│       ├── lista.tsx          # lista target filtrabile
│       ├── dashboard.tsx      # metriche commerciali
│       ├── attivita/[id].tsx  # scheda attività + ipotesi
│       └── visita/[placeId].tsx  # nuova visita (offline)
├── components/                # BoxIpotesi, EsitoButtons, Filters, BarChart…
├── lib/                       # supabase, auth, db, categoryRules, hubspot,
│                              #   syncQueue, metrics, location, reminders
├── types/                     # tipi condivisi
├── supabase/
│   ├── migrations/            # schema + RLS + seed
│   ├── functions/hubspot-sync # Edge Function (token lato server)
│   └── seed/lead.example.csv
├── scripts/import-places.mjs  # import CSV → places
└── __tests__/                 # test logica
```

## Regole di prodotto (invarianti)

1. La mappa mostra **tutte** le attività; i filtri sono opzionali e servono al giro.
2. Le linee **Clientelling / Concierge / Magazzino** sono in standby: mai ipotesi
   primaria, solo cross-sell manuale.
3. L'app **alimenta** HubSpot (company + contatto + deal + nota), non lo sostituisce.
4. `dealstage`: `appointmentscheduled`, `decisionmakerboughtin`, `contractsent`,
   `closedwon`, `closedlost`.
5. Segreti solo in variabili d'ambiente / secret server; mai nel repo.
