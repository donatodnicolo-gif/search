# Deluxy Scout

> **24/08/2026 — audit architettura, cinque correzioni** (migr. `0068`):
> 1. **Il cron HubSpot torna vivo**: `sync-hubspot-crm` era morto in silenzio dal
>    23/08 (la correzione d'auth su `hubspot-match` rifiutava la sua vecchia
>    anon key con 401 ogni notte). La 0068 lo rifà con la chiave d'ingresso da
>    `chiavi_app._ingresso`, come il cron delle Richieste Web.
> 2. **`allinea-supabase.mjs` legge migrazioni e funzioni DALLA CARTELLA**: via
>    l'elenco a mano che aveva saltato la 0066 e lasciato 10 funzioni su 21
>    senza ripubblicazione. `SENZA_JWT` ora include anche `linee`,
>    `hubspot-sync`, `calendario-ics` (già pubbliche in produzione). Corollario:
>    ogni migrazione ≥ 0045 DEVE essere idempotente.
> 3. **L'import non copia più i referenti dei clienti attivi**: sapere CHI è
>    cliente serve (Copertura, Affiliazioni), tenerne la rubrica no — vive nel
>    registro. I contatti già copiati restano; non se ne aggiungono.
> 4. `hubspot-sync`: il controllo dei segreti sta DOPO l'auth (come
>    `hubspot-match`); `linee`: confronto della chiave a tempo costante.
> 5. Verificato e NON toccato: l'upsert verso Anagrafiche manda `stato`/
>    `interessi` ma il registro li BLOCCA dal merge e li tiene come proposte in
>    revisione — è il canale previsto, non una scrittura nella verità. E
>    `partners/match?pIva=` non si applica a Scout: i places non hanno P.IVA,
>    l'aggancio è `sistema`+`idEsterno` (già in uso).
>
> Restano aperti: bucket `vetrine` pubblico (passarlo a privato tocca il client
> RN: URL firmati), e la chiave publishable nella storia git della 0009
> (pubblica per progettazione, nessuna rotazione necessaria).

App di prospezione commerciale sul territorio per il Team Commerciale Deluxy a
Milano. Mappa tutte le attività del territorio con priorità e ipotesi di interesse
pre-calcolate, registra le visite (anche offline) e **alimenta HubSpot** creando
company, contatti, deal e note.

Scritta in **Expo / React Native** ma **consegnata come sito**: la versione viva è
quella web — https://deluxy-scout.vercel.app — che si usa dal browser, anche dal
telefono. L'APK Android è fermo a una preview interna del 13/07/2026, precedente al
passaggio al drawer: per averlo aggiornato serve un nuovo build EAS.

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

## Segnalazioni CS (rotta `/segnalati`, scheda dentro Affiliazioni)

Le aziende che **un'altra app** ha già trovato, lette **live** dal registro
Anagrafiche (nessuna copia: la copia in Scout nasce solo premendo «Prendi in
carico», e resta collegata con `anagrafiche_id`).

Le fonti sono **due**, e si vedono sulla riga:

| fonte nel registro | chi sono | come si leggono |
|---|---|---|
| `deluxy-suppliers` | fioristi e pasticcerie cercati dall'app fornitori | prospect con interesse «Affiliazioni», categoria FIORISTA/PASTICCERIA |
| `customer-service` | **fornitori che hanno già preparato un ordine e sono stati pagati** | entrano nel registro premendo «Pagata» in Customer Service |

⚠️⚠️ **I secondi mancavano**, in una schermata che si chiama «Segnalazioni CS»:
si chiedeva la sola fonte `deluxy-suppliers`. Sono i contatti più caldi che
abbiamo — non un negozio trovato su una mappa, ma uno che ha già lavorato per
noi — ed erano gli unici a non arrivare a chi va a visitarli. Aggiunti il
25/08/2026.

⚠️ Si chiede **una fonte per volta** e si uniscono nell'app (`fetchSegnalatiDaApp`
accetta una lista): la Edge Function `anagrafiche` passa un `fonte` solo.

⚠️ Se la Edge Function deployata è più vecchia del parametro `fonte`, il registro
ignora il filtro: l'app se ne accorge (tornano righe di altre fonti) e lo **dice
a schermo**, invece di mostrare un elenco a caso. Per i fornitori del Customer
Service il ripiego per categoria non può funzionare — nascono come `ALTRO`,
perché dal nome dell'intestatario di un conto non si deduce un mestiere — quindi
lì l'elenco resta vuoto e dichiarato incompleto. Si risolve con:

```bash
supabase functions deploy anagrafiche
```

## Richieste Web: qualificare crea anche l'anagrafica (26/08/2026)

Vale per **tutte e due le qualifiche**, che dal 25/08 sono due:

- **a mano**, dal bottone «Qualifica» (`lib/db.ts` → `qualificaLead`);
- **da sola**, appena la richiesta arriva dalle Edge `lead` e `mail`
  (`supabase/functions/_shared/autoqualifica.ts`). Lì il registro lo scrive il
  server (`_shared/registro.ts`), con la stessa regola in tre passi, e i conti
  tornano indietro nella risposta: `anagraficheCreate`, `anagraficheGiaPresenti`,
  `anagraficheNonScritte` — che l'app mostra dopo «Importa da commerciale@».

⚠️ Nell'auto-qualifica, quando chi scrive **non** è già in rubrica, il negozio
nasce dai dati della richiesta e si chiama come la **persona** («Marco Banzi»):
quell'anagrafica entra nel registro con quel nome. È la conseguenza voluta di
«crea il lead anche in Anagrafiche», ma va saputa — il registro tiene le
AZIENDE B2B, e i privati stanno in `Consumer`.

Qualificare una richiesta (`/lead` → **Qualifica** → «A quale negozio
appartiene?») fa tre cose, non più una:

1. apre la **trattativa** sul negozio scelto, canale `web` (come prima);
2. salva in rubrica **chi ci ha scritto**, se la richiesta porta un recapito
   (come prima);
3. **mette il negozio nel registro Anagrafiche, se non c'è già** — col
   referente della richiesta.

Perché: una richiesta qualificata è un'azienda con cui stiamo trattando, e fino
a ieri restava solo dentro Scout. Il registro — che è la casa delle anagrafiche
B2B — non ne sapeva niente. Misurato il 26/08/2026: **1.807 negozi in Scout,
1.051 agganciati al registro** (756 sconosciuti di là), e **zero** richieste mai
qualificate: questa strada non era mai passata di lì.

**«Se non è già presente»** è deciso in tre passi (`assicuraNegozioNelRegistro`,
`lib/db.ts`):

| passo | condizione | cosa succede |
|---|---|---|
| 1 | il negozio ha già `anagrafiche_id` | c'è: **non si scrive niente** |
| 2 | il registro ha un'anagrafica con lo stesso nome e città compatibile | c'era già: la si aggancia e le si porta il referente |
| 3 | nessuna delle due | si crea, e l'id che torna aggancia il negozio |

⚠️ Il passo 2 non è pignoleria. L'upsert del registro aggancia per riferimento
esterno, P.IVA o **nome + città**; quando la città che gli mandiamo è vuota
cerca fra le anagrafiche *senza* città — e in Scout la zona è vuota su 979
negozi su 1.807. Senza quel controllo, qualificare una richiesta su uno di
quelli avrebbe creato una **seconda scheda** accanto a quella giusta. Nel
registro un doppione non è un fastidio: è la fonte di verità che si sdoppia.

⚠️ La città non si passa come filtro alla ricerca del registro: di là il filtro
`citta` è un confronto esatto, e Scout scrive «MILANO» dove il registro ha
«Milano». Si filtra nell'app, normalizzando.

⚠️ **Cosa resta scoperto**, dichiarato invece che nascosto: il passo 2 riconosce
solo l'omonimo **unico e con città compatibile**. Restano quindi due casi in cui
può nascere un doppione nel registro — (a) la stessa città scritta in due lingue
(«MILAN» in Scout, «Milano» nel registro: 63 negozi contro 238), e (b) un nome
molto comune il cui omonimo non entra nei primi 25 risultati della ricerca.
Allargare la regola non è gratis: due negozi possono avere lo stesso nome in
città diverse («HAVI» sono due), e agganciare quello sbagliato è peggio che
crearne uno nuovo.

⚠️ **L'esito si legge a schermo**, sempre — anche quando va male. La finestra di
conferma dice quale delle tre strade è stata presa, e se il registro non ha
preso la scrittura lo dichiara («il negozio resta solo in Scout») col motivo.
La trattativa si apre comunque: è il pezzo che conta, e un registro irraggiungibile
non deve far perdere il lavoro.

⚠️ La chiave che Scout ha in cassaforte è `deluxy-scout` (`scrittura: true`):
crea e aggiorna i partner, ma **non** ha lo scope `scritturaPartner`, quindi
`stato` e `interessi` che mandiamo restano *proposte in revisione* nel registro.
L'anagrafica nuova nasce quindi come **prospect senza interessi** — che per una
richiesta web è giusto. Per farle passare servirebbe la chiave
`deluxy-scout-partner` (esiste di là, non è quella in uso qui).

⚠️ Serve la Edge Function `anagrafiche` **rideployata**: è lei che ora inoltra i
`contatti` e riporta indietro l'esito (`creato`/`merged`) e l'`id`. Con la
versione vecchia la scrittura passa lo stesso, ma l'app non può dire quale delle
due è stata e non aggancia `anagrafiche_id` — e lo dichiara, invece di
inventarselo.

## Regole di prodotto (invarianti)

1. La mappa mostra **tutte** le attività; i filtri sono opzionali e servono al giro.
2. Le linee **Clientelling / Concierge / Magazzino** sono in standby: mai ipotesi
   primaria, solo cross-sell manuale.
3. L'app **alimenta** HubSpot (company + contatto + deal + nota), non lo sostituisce.
4. `dealstage`: `appointmentscheduled`, `decisionmakerboughtin`, `contractsent`,
   `closedwon`, `closedlost`.
5. Segreti solo in variabili d'ambiente / secret server; mai nel repo.

## Preventivi fornitore: a quale vendita appartiene un costo (26/08/2026)

Un preventivo fornitore è un **costo**, e un costo appartiene sempre a qualcosa
che vendiamo. Fino a oggi quel qualcosa poteva essere solo una **trattativa**:
chi riceveva una richiesta da un cliente già acquisito — il caso più frequente,
e per la *regola del binario* non apre una trattativa — non aveva dove mettere
il prezzo del fornitore, e il margine di quell'ordine restava «—».

Da oggi il lavoro si aggancia a **una delle tre vendite** (migrazione `0077`,
colonne `lavori.deal_id` / `richiesta_id` / `ordine_id`):

| Vendita | Quando si sceglie | Cosa serve |
| --- | --- | --- |
| **Trattativa** | la vendita è ancora da conquistare | il costo serve a fare il prezzo |
| **Richiesta cliente** | un cliente che c'è già chiede una fornitura | il costo serve a rispondergli |
| **Ordine** | la vendita è chiusa | il lavoro adesso va comprato |

Il vincolo `lavori_ha_una_vendita` lo impone al database, non solo alla
schermata. È scritto `NOT VALID` di proposito: c'è **un** lavoro nato prima
della regola, senza nessun legame, e non gli si inventa una vendita per far
contento il database — la scheda lo dichiara in rosso e lo si sistema
guardandolo.

**Il margine di un ordine** (`costiPerOrdine`, colonna *Margine* in Ordini) si
legge da tutte e tre le strade: prima il lavoro agganciato all'ordine, poi
quello della sua trattativa, poi quello della sua richiesta. Un ordine **senza
preventivi non entra** nella mappa e mostra «—»: contarlo a costo zero darebbe
un margine pari al prezzo pieno.

Nell'elenco delle vendite da collegare non compaiono le finite (trattative
chiuse, richieste perse/annullate/fatturate) né le richieste **già diventate
ordine**: quelle si scelgono dal loro ordine, o lo stesso lavoro comparirebbe
due volte con due nomi diversi.

## Ordini: si correggono (26/08/2026)

Di un ordine si poteva cambiare solo lo **stato**: un valore sbagliato o una
descrizione da correggere obbligavano ad **annullarlo e rifarlo** — e un ordine
annullato resta nell'elenco a dire una cosa che non è successa.

Adesso l'icona ✎ (o «Modifica» sul telefono) apre un foglio con i campi che
l'ordine ha davvero: **cliente, descrizione, valore, linea, canale**. Tre
scelte deliberate:

- **Lo stato non sta nel form.** Ha i suoi bottoni (Fattura · Acconto ·
  Incassato · Annulla): dentro un form cambierebbe per sbaglio insieme a una
  correzione di battitura.
- **Si salva solo ciò che è cambiato.** La `PATCH` si costruisce confrontando
  campo per campo — un form che rimanda tutto riscrive anche quello che nessuno
  ha toccato, e cancella in silenzio ciò che non mostra.
- **Il valore vuoto torna sconosciuto (`null`), non zero.** Zero direbbe
  «venduto a niente», ed entrerebbe nei totali.

⚠️ **Il documento già emesso non si corregge da solo.** Cambiando il valore di
un ordine che ha già una fattura o una pro-forma su FINANCE, quel documento
resta con l'importo vecchio: la modifica **non arriva di là**. Non è vietato —
vietare spinge solo a rifare l'ordine da capo — ma prima di salvare l'app lo
dice con il numero del documento in chiaro, perché è quello che il cliente ha
in mano.

Il nome del **negozio** non si tocca da qui: appartiene alla sua scheda, e
riscriverlo sull'ordine farebbe due nomi diversi per la stessa attività.

## Correzioni del 27/08/2026 (revisione ostile)

Passata di correzione su tutta l'app. Il metodo conta quanto il risultato:
ogni difetto è stato prima **cercato** leggendo il codice, poi **sottoposto a
un revisore ostile** con il mandato di demolirlo — non di confermarlo — e
corretto solo se sopravviveva. Tre segnalazioni sono cadute lì, e non sono
state toccate:

| Accusa caduta | Perché era falsa |
| --- | --- |
| Il clic sulla «×» risale al Pressable genitore | `react-native-web` ferma la propagazione da sé; la prova sta nell'app (il foglio che non si chiude toccandolo si regge su quel meccanismo) |
| `upsert_partner` manda `nome: null` e cancella il nome | Il registro lo rifiuta con un 400 esplicito, e nessun chiamante può produrlo (`places.nome` è NOT NULL) |
| `richieste_cliente.owner on delete cascade` fa sparire le richieste | Le FK NO ACTION di visite/trattative/ordini bloccano prima la cancellazione dell'utente |
| Il `google_place_id` perso unendo due doppioni | L'indice unico impone comunque che uno dei due resti libero: il «rimedio» spostava il problema, non lo toglieva |

### Le due regole che erano ricopiate, e sbagliate

**Gli importi.** «1.500,50» era letto in cinque schermate con cinque copie
della stessa riga, e tre erano sbagliate in due direzioni opposte: Pagamenti
teneva il punto per decimale (una richiesta di pagamento da 1.500 € partiva al
cliente per **1,50 €**; un incasso registrato così lasciava la richiesta
«parziale»; «1.500,50» dava 0 e **azzerava** un incasso già scritto),
Trattative toglieva punto e virgola (**×10 o ×100**, e bastava riaprire e
salvare, perché il campo si precompila col numero del database), Preventivi
buttava il prezzo in silenzio se non era un numero puro. Ora sta in
[lib/importi.ts](lib/importi.ts), con i test. **Chi non capisce non inventa:
torna `null`, non `0`.**

**I giorni.** `toISOString().slice(0,10)` non è oggi: è oggi a Greenwich. Fra
mezzanotte e le due il chip «Oggi» scriveva **ieri**. Ora sta in
[lib/giorni.ts](lib/giorni.ts).

### Cosa spariva senza dirlo

- **Le trattative annullate** rientravano da sette porte su otto: il cestino
  non cambia la fase. La cestinata gonfiava la pipeline e — la più grave —
  faceva risultare il negozio «già in pipeline», togliendolo **sia** dalla coda
  richiami **sia** da «visite da lavorare»: usciva da entrambe le liste e non lo
  lavorava più nessuno.
- **Il tetto delle mille righe, quarta volta**: rubrica, recapiti e id già presi
  dal registro. I recapiti non avevano nemmeno l'ordinamento, quindi i bottoni
  Chiama/WhatsApp erano spenti **a caso** — impossibile da riprodurre.
- **La coda offline duplicava le visite**: se falliva l'ultimo passo (sync
  HubSpot) ripartiva tutto, e `inserisciVisita` non è idempotente. Una copia e
  una foto in più a ogni tentativo, in silenzio.
- **La ricerca negozi moriva su una virgola**: dentro un `or()` PostgREST la
  virgola separa le condizioni. «Rossi, Milano» dava 400 e il typeahead mostrava
  zero negozi senza dire niente — e chi non trova, crea un doppione. Il termine
  spesso non lo digita una persona: lo precompila un nome di mittente.
- **Le sequenze** sceglievano il passo per posizione: cancellandone uno, chi era
  a metà ne saltava uno e chi era in fondo restava «attiva» per sempre.
- **Il filtro città** prendeva per Milano «MILANO MARITTIMA» (Ravenna) e per
  Roma «ROMANO DI LOMBARDIA». Non è un'etichetta: filtra le basi dei KPI.

### Le due cose serie

**L'azione `corpo` della Edge `mail`** leggeva da una cassetta *personale* con
un id preso dal client e mai confrontato con niente: qualunque utente Scout
autenticato poteva farsi dare il testo di **qualsiasi** messaggio di quella
cassetta, anche mai importato e anche della posta inviata. Ora si legge prima
dalla **propria** cassetta — che è anche quella in cui la ricerca ha trovato
l'id, e prima non coincidevano — e da quella comune solo per un messaggio che
Scout ha davvero importato.

**`scripts/azzera-target.sql`** cancella in produzione, e il suo predicato
«nessuna traccia di lavoro» era quello di luglio: non conosceva
`contatti_avviati`, `sequenza_iscrizioni` e `bozze_visita`, tutte in cascade su
`places`. Un negozio a cui era già partita una mail di sequenza veniva
cancellato insieme alla sua storia, **irreversibilmente**. E la «prova a vuoto»
prescritta prima del delete usava lo stesso predicato: confermava il numero
sbagliato ed era muta proprio sul danno. Ora il conteggio dichiara quanto
lavoro sparirebbe, e su quelle tre righe deve leggere **zero**.

## Ogni ordine nasce con la sua pro-forma (27/08/2026)

Richiesta dell'utente: «quando finisce in ordini crea automaticamente la
pro-forma».

Le strade che portano a un ordine sono **tre**, e due su tre il documento lo
emettevano già:

| Strada | Prima | Adesso |
| --- | --- | --- |
| «Trasforma in ordine» da una richiesta cliente | pro-forma emessa | uguale |
| «Trasforma in ordine» da una trattativa | pro-forma emessa | uguale |
| Chiudere la trattativa come **vinta** dal suo form | **niente documento** | pro-forma emessa |

La terza era il buco — e l'errore era pure ingoiato (`.catch(() => {})`), quindi
l'ordine compariva in elenco senza documento e senza che nessuno sapesse perché.
Adesso la regola sta in **un posto solo** ([lib/documenti.ts](lib/documenti.ts)):
tre copie della stessa regola divergono al primo ritocco.

⚠️ **Non lancia mai.** Quando la pro-forma non si può emettere — FINANCE non
risponde, o il cliente là non esiste ancora — **l'ordine resta**: non si perde
una vendita perché un registro è giù. Ma il documento mancante **si dice**, e su
quell'ordine compare il bottone **«Pro-forma»** per emetterla dopo, senza rifare
l'ordine. Il bottone c'è solo su chi il documento non ce l'ha, e sparisce appena
arriva.

⚠️ **Senza valore non si emette**: una pro-forma è una richiesta di denaro, e una
richiesta di denaro senza cifra non è un documento. Si dice, invece di emettere
zero.

**Con quale intestazione**: FINANCE tiene un template per brand (logo, dati
societari, IBAN). Si passa il brand **per nome** — `brand: 'cakedesign.me'` —
senza conoscere codici interni; senza, di là si usa il predefinito. I template si
fanno in FINANCE → *Template documenti*, che è dove il documento viene disegnato.

## Design system e deroghe UX annotate (28/08/2026)

Scout segue il **Deluxy Design System** ([../deluxy-design-system/DESIGN-SYSTEM.md](../deluxy-design-system/DESIGN-SYSTEM.md),
v1.4) per i materiali (token, colori, ombre) e i **due Libri** — il **Libro UX&UI**
e il **Libro della Sicurezza** — per i pattern. I due Libri vivono nel repo privato
`app/` (`deluxy-design-system/LIBRO-UX-UI.md`), perché questo repo (`scoutwt`) è
**pubblico**: non ci si copiano dettagli d'uso sensibili.

### Custode del layout

Ogni errore di UI o richiesta di cambiamento dell'interfaccia passa dal custode
(`architetto-ux`) attraverso il registro `SEGNALAZIONI-UX.md` del repo `app/`: è
lui a decidere se è una correzione locale, una regola nuova del Libro (valida per
tutte le app) o una **deroga da annotare qui**.

### Le deroghe di Scout (motivo + voce del Libro derogata)

Una deroga non scritta è indistinguibile da un errore, e in audit si tratta da bug
(DS §6, Libro UX cap.12). Scout ne dichiara tre:

1. **Pin della mappa colorati per PRIORITÀ, con P1 in ORO** (`lib/theme.ts`
   `coloreProprita`, `app/(app)/mappa.tsx`). Deroga al **Libro UX cap.5** («l'oro
   non è mai uno stato»): sulla mappa il colore del pin è la *priorità* (P1/P2/P3),
   non uno stato di processo, e lo stato viaggia sul **glifo** sovrapposto (○ ◐ ★ ✕,
   `iconaStato`) più la legenda — così il colore non è mai l'unico segnale (WCAG
   1.4.1). L'oro qui è l'accento brand della priorità massima, coerente con l'uso
   dell'oro come accento (avatar, focus, polyline del giro), non come stato.

2. **La tabella non si «strizza»: sotto i 900px si SOSTITUISCE con le schede**
   (`components/Tabella.tsx` non si monta sotto soglia; si montano `CardElenco`).
   È il canone RN del **Libro UX cap.8** (in React Native la tabella non si adatta,
   si sostituisce) — lo si annota perché su Scout la soglia è un unico numero
   documentato (900px) e chi arriva dal mondo web si aspetta lo scroll orizzontale,
   che qui è **vietato**.

3. **`spacing` locale in collisione col DS** (`lib/theme.ts`: `md/lg/xl` =
   16/24/32; il DS dice 12/16/20). Deroga governata dal **Libro UX cap.12**: NON si
   fa lo swap secco dell'import né si cambiano i valori — 44 schermate
   cambierebbero in silenzio. Le chiavi si rinomineranno prima, in una migrazione
   verificata. Nel frattempo i token nuovi del DS v1.4 (tinte `-soft`, `onInk`,
   `grey`, `touchMin`, `typography`, `motion`) sono stati aggiunti in modo
   **additivo** a `lib/theme.ts` e si usano nelle correzioni mirate.

### Adeguamento UX del 28/08/2026 (correzioni mirate)

- **Barra di stato**: da `style="light"` (ora/batteria invisibili su header
  bianchi) a `style="dark"` — Libro UX cap.10 §8.
- **Colori di stato dai token semantici**: eliminati gli hex «ombra Material»
  (`#2F7D46/#1F6FEB/#5B8DEF/#B7791F/#B3261E`) da badge e livelli (`lib/livelli.ts`,
  `visite`, `ordini`, `preventivi`, `CoperturaProvince`, `coloreAffiliazione`) —
  ora un solo verde/blu/arancione/rosso in tutta l'app (Libro UX cap.5).
- **Oro tolto dagli stati di processo**: `in_trattativa` → blu «in lavorazione»;
  chip cross-sell selezionato → selezione neutra invece dell'oro pieno (cap.5).
- **Bersagli touch ≥44px**: chip filtro, azioni rapide, bottone Filtri e il `Btn`
  canonico portati a `minHeight: touchMin` (cap.10 §1 / WCAG 2.5.5).
- **Card del login**: radius 24 (era 18), Libro UX cap.11.

### Deferito (annotato, non forzato)

- **Vetro/blur e radial-gradient del login**: richiedono `expo-blur` (non
  installato) e i due gradienti oro/ink — Libro UX cap.11. Da fare con la
  dipendenza.
- **Adozione del componente `Btn` in ~44 schermate** (oggi usato 1 volta): 461
  `Pressable` a mano senza stato `pressed` — refactor ampio (Libro UX cap.3).
- **Indicatore di rete globale + coda visibile dalla home** (quinto stato
  «offline» del cap.6): il motore `syncQueue` c'è, manca la spia.
- **Swap dei token/import** e **rinomina delle chiavi `spacing`**: migrazione
  verificata a parte (cap.12), mai in un colpo secco.
- **`grigioChiaro` → hairline trasparente**: tocca il bordo di *tutte* le card,
  va valutato a parte (Libro UX cap.10 / DS).
- **ScrollView annidate nei fogli** e **`behavior` esplicito del
  KeyboardAvoidingView su Android** (cap.9, cap.10 §5).
