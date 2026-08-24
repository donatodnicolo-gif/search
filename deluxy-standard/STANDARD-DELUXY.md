# Standard Deluxy — regole comuni a tutte le app

**Versione 1.1 — 24 agosto 2026** (1.0 del 24 luglio; la 1.1 aggiunge il
capitolo 7 — **Architettura dei dati, obbligatoria** — e le voci d'architettura
nella checklist §6, dopo l'audit su tutte le 18 app)

Questo documento è la **fonte unica** di come si fanno le cose in tutte le app
Deluxy: CSS, server, database, chiavi interne, chiavi esterne. Vale per le app
esistenti e per quelle nuove.

> Regola d'oro: se un'app fa diversamente da qui, **o si allinea o la deviazione
> viene scritta qui** con la motivazione. Non esistono deviazioni non scritte.

Documenti collegati:
- estetica e componenti → [deluxy-design-system/DESIGN-SYSTEM.md](../deluxy-design-system/DESIGN-SYSTEM.md)
- regole di lavoro (commit, handoff, segreti) → [deluxy-platform-next/docs/REGOLE-DI-LAVORO.md](../deluxy-platform-next/docs/REGOLE-DI-LAVORO.md)
- catalogo script → [scripts/README.md](../scripts/README.md)
- come allineare una singola app → [ALLINEAMENTO.md](ALLINEAMENTO.md)

---

## 1. CSS

**Fonte**: `deluxy-design-system/tokens/tokens.css` (v1.0). Ogni app ne tiene una
**copia** in `src/app/tokens.css`, importata **come primo foglio di stile**.

Regole:

1. **Mai valori hardcodati** dove esiste un token: colori, radius, ombre, font,
   spaziature si scrivono `var(--nome)`. I token disponibili sono in
   `tokens.css` (`--bg`, `--surface`, `--text`, `--hairline`, `--radius-*`,
   `--shadow-*`, `--gold`, …).
2. **L'unica eccezione ammessa** ai valori letterali: colori di servizio che non
   sono nel sistema (es. il verde/rosso di un grafico, i colori di un brand
   esterno). Vanno definiti come variabile CSS in cima a `globals.css`, con un
   commento che dice perché, **non sparsi nelle regole**.
3. **L'oro `#B8963E` è solo accento**: mai un bottone primario, mai uno sfondo
   pieno. I bottoni primari sono neri a pillola.
4. **Struttura dei file**, uguale per tutte:
   - `src/app/tokens.css` — copia dei token, **non si modifica a mano**;
   - `src/app/globals.css` — stili dell'app, che importa i token come prima riga;
   - niente CSS-in-JS, niente librerie di componenti esterne.
5. **Aggiornare i token**: si cambia `deluxy-design-system/tokens/tokens.json`,
   si rigenerano `tokens.css`/`theme.ts`, si **bumpa la versione** e poi si
   ricopia il file in ogni app. Mai il contrario.
6. **Serve un componente nuovo?** Prima si aggiunge al design system, poi si usa.

**Verifica**: `tokens.css` dell'app deve essere identico a quello del design
system (a meno del fine riga CRLF su Windows) e `globals.css` non deve
contenere hex non giustificati.

---

## 2. Server

**Stack unico**: Next.js 15 (App Router, React 19, server action) + TypeScript,
deploy su **Vercel**, un progetto Vercel per app.

### 2.1 Porte di sviluppo (registro)

Ogni app ha la **sua** porta, fissata nello script `dev` del `package.json`:

| Porta | App | | Porta | App |
|---|---|---|---|---|
| 3040 | deluxy-partner (Finance) | | 3100 | deluxy-acquisti *(riservata)* |
| 3050 | deluxy-hub | | 3110 | deluxy-calendario *(riservata)* |
| 3060 | deluxy-anagrafiche | | 3120 | deluxy-merchandising |
| 3070 | deluxy-mail | | 3130 | deluxy-marketing |
| 3080 | deluxy-budgets | | 3140 | deluxy-messaging |
| 3090 | deluxy-tasks *(riservata)* | | 3150 | deluxy-orders |
| | | | 3160 | deluxy-transactions |
| | | | 3170 | deluxy-scripts |
| 3180 | deluxy-fondo *(in `app/`)* | | 3190 | deluxy-crm *(in `app/`)* |
| 3200 | deluxy-personale *(in `app/`)* | | | |

Una porta nuova si prende **dal primo multiplo di 10 libero** e si aggiunge qui
e al catalogo del Hub (`deluxy-hub/src/lib/apps.ts`).

### 2.2 `.vercelignore` — obbligatorio

Vercel **non** applica `.gitignore` agli upload: senza `.vercelignore` il `.env`
locale finisce nel pacchetto, il sito in produzione legge i valori di sviluppo e
si spediscono in cloud le credenziali del database. Ogni app deve avere questo
file, identico a [deluxy-hub/.vercelignore](../deluxy-hub/.vercelignore):

```
.env
.env.*
!.env.example

prisma/dev.db
prisma/dev.db-journal
node_modules
.next
```

### 2.3 Rendering e cache

- Le pagine che leggono il database sono **dinamiche**: `export const dynamic = "force-dynamic"`.
- Le route API che espongono dati rispondono con `Cache-Control: no-store`.
- Le route che chiamano un modello AI o fanno lavori lunghi dichiarano
  `export const maxDuration = 60` (120/300 solo se davvero serve, con commento).
- **Mai una fetch di rete dentro il render di una pagina senza cache**: si mette
  una cache in memoria con TTL e un `AbortSignal.timeout()`, come in
  [deluxy-mail/src/lib/chiaviApp.ts](../deluxy-mail/src/lib/chiaviApp.ts).

### 2.4 `next.config.ts`

Vuoto per default. Ogni riga in più va **commentata con il perché**. Deviazioni
oggi legittime: `deluxy-mail` (`serverExternalPackages` per imapflow/mailparser,
`bodySizeLimit` 20 MB per gli allegati) e `deluxy-messaging` (header per far
incorniciare `/widget` in iframe sui siti dei clienti).

### 2.5 Deploy

- Produzione: `npx vercel deploy --prod --yes` dalla cartella dell'app.
- Cambiare una variabile su Vercel **non basta**: vale solo per i deployment
  nuovi → dopo ogni modifica si ripubblica.
- Prima di ogni commit: `npx tsc --noEmit` **e** `npm run build`.
- I cron stanno in `vercel.json` e sono protetti da `CRON_SECRET`.

---

## 3. Database

**Un solo Postgres** (Supabase), **uno schema per app**: le connection string
finiscono con `?schema=<nome-app>`. Le tabelle di un'app non si toccano da
un'altra app: si passa dalle API.

### 3.1 Connessione

| Variabile | Cosa | Porta |
|---|---|---|
| `DATABASE_URL` | pooler, con `?pgbouncer=true&connection_limit=1&schema=<app>` | 6543 |
| `DIRECT_URL` | connessione diretta, con `?schema=<app>` — serve a `db push`/migrazioni | 5432 |

### 3.2 Client Prisma

Un solo file `src/lib/db.ts`, **identico in tutte le app** (singleton, per non
esaurire le connessioni con l'hot reload):

```ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

### 3.3 Regole

1. **SQLite solo in prototipo.** Un'app che va in produzione passa a Postgres con
   il proprio schema — **su Vercel SQLite non funziona affatto**: il filesystem
   delle funzioni è effimero e in sola lettura, il file `dev.db` non si può
   scrivere e sparisce a ogni deploy. È questo, non altro, il motivo per cui
   un'app resta "solo in locale". La migrazione si fa con
   `node scripts/configura-db-condiviso.mjs ../deluxy-partner/.env` +
   `npx prisma db push` (chiuso per budgets e merchandising il 24/07/2026).
2. **Un'app pubblicata ha sempre una porta d'accesso.** Prima di pubblicare va
   messo il middleware con `<APP>_APP_PASSWORD` (pattern di `deluxy-orders`:
   `src/lib/auth.ts` + `src/middleware.ts` + `/login`). Senza password non si
   pubblica: i dati aziendali finirebbero pubblici in rete.
3. **Mai `deleteMany` senza filtro** sul database condiviso, nemmeno "per pulire
   i test": si cancellano i dati veri di un'altra app. Si filtra sempre sui
   record creati dal test.
4. **Indici** su ogni campo usato per filtrare o ordinare (`@@index`).
5. **Migrazioni**: `npm run db:push` in sviluppo; ogni cambio di schema va
   descritto nell'handoff dell'app.
6. **Il modello è la fonte di verità di un'app sola**: anagrafiche in
   `deluxy-anagrafiche`, ordini in `deluxy-orders`, attività in `deluxy-tasks`.
   Le altre app **non duplicano** quei dati, li leggono via API.

---

## 4. Chiavi delle app Deluxy (interne)

### 4.1 Dove vivono

La **cassaforte centrale è il Hub**: pagina `/chiavi` (solo admin), valori
cifrati AES-256-GCM nel database. Le app **non** tengono le chiavi nei file.

Lettura via API:

```
GET https://deluxy-hub.vercel.app/api/chiavi?progetto=<id-progetto>
Header: x-api-key: <token>      (in alternativa: Authorization: Bearer <token>)
→ { "progetto": "…", "chiavi": { "NOME": "valore", … } }
```

I **token di servizio** si generano da `/chiavi` → "Token di servizio": il valore
in chiaro si vede una volta sola, nel database resta solo lo SHA-256. Ogni token
è limitato ai progetti che gli assegni.

⚠️ **L'header deve essere `x-api-key` o `Authorization: Bearer`.** Il Hub non
riconosce altri nomi: un client che manda un header diverso viene rifiutato con
401 e l'app ripiega in silenzio sulle variabili d'ambiente.

### 4.2 Come le legge un'app (pattern obbligatorio)

Tre sorgenti, **in questo ordine**:

1. impostazione inserita dall'utente nell'app (cifrata nel suo database);
2. **cassaforte del Hub** (`HUB_KEYS_TOKEN` + `HUB_URL`);
3. variabile d'ambiente su Vercel (fallback).

Il client deve: **non fallire mai** (se il Hub è giù si usa il resto), tenere una
**cache in memoria di 5 minuti**, avere un **timeout di 4 secondi**, e riusare
l'ultima risposta buona in caso di errore. Implementazione di riferimento:
[deluxy-mail/src/lib/chiaviApp.ts](../deluxy-mail/src/lib/chiaviApp.ts).

### 4.3 Come un'app protegge le proprie API

Chi espone dati alle altre app usa lo stesso schema di
[deluxy-anagrafiche/src/lib/api-auth.ts](../deluxy-anagrafiche/src/lib/api-auth.ts)
e [deluxy-orders/src/lib/api-auth.ts](../deluxy-orders/src/lib/api-auth.ts):

- chiave in `x-api-key`, in alternativa `Authorization: Bearer`;
- errore `401` con messaggio esplicito se manca;
- CORS con `Access-Control-Allow-Headers: x-api-key, authorization, content-type`;
- `/api/*` **escluso dal middleware di sessione** (le API si autenticano da sé).

**Deviazione dichiarata — `deluxy-transactions`.** Le sue API creano richieste
di pagamento, quindi: (a) **niente CORS** e preflight rifiutato, perché si
chiamano solo da server a server; (b) oltre alla chiave serve una **firma
HMAC-SHA256** del corpo con marca temporale e nonce usa-e-getta. Una chiave
rubata, da sola, non basta. Dettagli in
[deluxy-transactions/docs/SICUREZZA.md](../deluxy-transactions/docs/SICUREZZA.md).

### 4.4 Nomi delle variabili (convenzione)

| Forma | Significato | Esempi reali |
|---|---|---|
| `<APP>_URL` | dove sta l'app da chiamare | `ANAGRAFICHE_URL`, `HUB_URL`, `SEARCH_URL` |
| `<APP>_API_KEY` | chiave per **leggere** le API di quell'app | `ANAGRAFICHE_API_KEY`, `ORDERS_API_KEY`, `MAIL_API_KEY` |
| `<APP>_WRITE_KEY` | chiave di **scrittura** (solo a chi ne ha diritto) | `ANAGRAFICHE_WRITE_KEY` |
| `<APP>_APP_PASSWORD` | password della UI dell'app (non un'API) | `ORDERS_APP_PASSWORD`, `MARKETING_APP_PASSWORD` |
| `HUB_KEYS_TOKEN` | token di servizio per la cassaforte del Hub | uguale in tutte le app |
| `APP_SECRET` | firma dei cookie di sessione dell'app | uguale in tutte le app |

Un nome nuovo si sceglie **dentro questo schema**, mai inventando una forma nuova.

**Deviazione dichiarata — `deluxy-transactions`.** Non usa
`TRANSACTIONS_APP_PASSWORD`: la UI ha **account nominali** (email + password
PBKDF2 + TOTP obbligatorio), non una password di team. Motivo: l'app autorizza
bonifici con doppia firma, e due firme non sono dimostrabili se tutti entrano
con la stessa password. Variabili proprie: `TRANSACTIONS_ENC_KEY` (AES-256-GCM
per i segreti a riposo) e, per chi la chiama, `TRANSACTIONS_API_KEY` +
`TRANSACTIONS_HMAC_SECRET`.

### 4.5 Login unico (SSO)

Il Hub apre le app con `sso: true` via `/vai/<id>`: genera un token cifrato
AES-GCM con `HUB_SSO_SECRET` (**minimo 32 caratteri, identico nelle due app**) e
l'app lo scambia su `/api/sso` creando la propria sessione. Se il segreto manca,
si degrada al login normale dell'app. Oggi è pronto solo verso Finance.

---

## 5. Chiavi di servizi esterni

Valgono le stesse regole del capitolo 4 (cassaforte del Hub come sorgente,
`.env` mai committato), più queste:

1. **Un segreto non entra mai in un file del repo**, nemmeno in un esempio,
   nemmeno in un commento, nemmeno "temporaneamente". Nei `.env.example` e nel
   catalogo script vanno **solo i nomi** delle variabili e il link da cui si
   prende la chiave.
2. **Chiave scaduta o esposta = rotazione**: si cambia sul servizio, si aggiorna
   nella cassaforte del Hub, si ripubblicano le app che la usano.
3. **Ogni chiave esterna ha un solo proprietario**: l'app che parla con quel
   servizio. Le altre passano da lei, non si copiano la chiave.
4. **Timeout e fallback su ogni chiamata esterna**: nessuna schermata deve
   restare appesa perché un servizio terzo è lento.
5. **Il modello AI si sceglie da variabile** (`OPENAI_MODEL`), mai scritto nel
   codice, così si cambia senza rideploy del codice.

Servizi esterni oggi in uso e variabili relative:

| Servizio | Variabili | App proprietaria |
|---|---|---|
| OpenAI | `OPENAI_API_KEY`, `OPENAI_MODEL` | mail, marketing, messaging, budgets |
| HubSpot | `HUBSPOT_ACCESS_TOKEN` | scout / anagrafiche |
| Shopify | `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`, `SHOPIFY_STORE_DOMAIN` | orders, search-supplier |
| Google Drive / OAuth | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `GOOGLE_DRIVE_API_KEY` | marketing |
| Posta IMAP/SMTP | `APP_EMAIL`, `APP_PASSWORD`, `SMTP_*` | mail |
| Meta (WhatsApp/Messenger/IG) | token cifrati in Impostazioni | messaging |
| Notifiche push | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | scout |
| Cron Vercel | `CRON_SECRET` | mail, orders, partner |

---

## 6. Checklist di conformità (per una singola app)

Un'app è **allineata** quando tutte queste righe sono vere:

- [ ] `src/app/tokens.css` identico al design system, importato per primo
- [ ] nessun colore/radius/ombra hardcodato dove esiste un token
- [ ] porta di sviluppo dedicata, presente nel registro §2.1
- [ ] `.vercelignore` presente e completo
- [ ] pagine con dati `force-dynamic`, API `no-store`, `maxDuration` sulle route AI
- [ ] `next.config.ts` vuoto o con ogni riga motivata
- [ ] Postgres con schema proprio, `DATABASE_URL` (pooler) + `DIRECT_URL`
- [ ] `src/lib/db.ts` = singleton standard
- [ ] nessun `deleteMany` senza filtro
- [ ] chiavi lette dalla cassaforte del Hub con il pattern a 3 sorgenti (cache 5', timeout 4")
- [ ] API protette con `x-api-key`/`Bearer`, `/api/*` fuori dal middleware
- [ ] nomi delle variabili conformi a §4.4
- [ ] `.env` non committato, `.env.example` con i soli nomi
- [ ] `npx tsc --noEmit` e `npm run build` puliti
- [ ] handoff dell'app aggiornato
- [ ] **architettura (§7)**: nessuna tabella-copia di domini altrui; nessuna
      query su schemi altrui; regole economiche mai ricopiate
- [ ] `GET /api/health` pubblica, fuori dal middleware, `{ ok: true }`
- [ ] `vercel.json` con `"regions": ["fra1"]`
- [ ] middleware **fail-closed**: password mancante in produzione = 503, mai
      app aperta (pattern di deluxy-merchandising)

---

## 7. Architettura dei dati (OBBLIGATORIA)

Decisa il **24/08/2026** dopo l'audit su tutte le 18 app. Il disegno completo,
coi diagrammi e l'esito dell'audit app per app, sta nell'artifact
**«Architettura Dati Deluxy»** (lo si apre con `/artifacts` dal terminale
Claude, o dalla galleria claude.ai/code/artifacts). Vale la regola d'oro di
questo documento: chi devia, o si allinea o scrive qui la deviazione motivata.

### 7.1 La regola fondante

**Ogni dato ha una casa sola.** Chi lo possiede è l'unico che lo scrive; tutti
gli altri lo leggono via `/api/v1` con chiave a scope e **non ne tengono copie
di verità**. Cache in memoria con scadenza breve: sì. Tabella-copia: no.
Riferimento per id esterno (`sistema` + `idEsterno`, `platformId`,
`hubspotId`): sì, è il modo giusto di agganciarsi.

### 7.2 Le fonti di verità per dominio

| Dominio | Proprietaria | Nota |
|---|---|---|
| Identità partner/prospect B2B | `deluxy-anagrafiche` | scrive solo la piattaforma consegne; le altre propongono (merge lato registro) |
| Ordini Shopify, quota fornitore, **margine per ordine** | `deluxy-orders` | quota via `/api/v1/quota-fornitore`; annullamenti da ritirare via `?annullatiDa=` |
| **Decisione di gestione** dell'ordine (come si evade, a chi, esiti coi fornitori) | `deluxy-messaging` (Customer Service) | decisore UNICO: per mano o per regola |
| **Offerta del fornitore** (prodotti caricati dal partner, `type=UNICO`, suo prezzo), **incarichi** ed **esecuzione consegne** | piattaforma consegne (`deluxy-platform-next`) | è il canale applicativo del fornitore-partner |
| **Assortimento D2C** (cosa va sui siti, scheda di vendita, prezzi al cliente) | `deluxy-merchandising` (PLM) | pubblica su Shopify; il legame col prodotto-fornitore è un riferimento per id |
| Denaro in uscita | `deluxy-transactions` | UNICA app che paga; richieste firmate HMAC |
| Contabilità (fatture, saldi, banca) | `deluxy-partner` (FINANCE) | schema `public` (deroga storica) |
| Utenti, ruoli, SSO, cassaforte chiavi | `deluxy-hub` | le app non tengono utenti propri (deviazioni esistenti da riassorbire o dichiarare) |
| Attività / eventi datati | `deluxy-tasks` / `deluxy-calendario` | Calendario sincronizza da Tasks via API |
| Ricerca fornitori sul territorio | `deluxy-search-supplier` | **motore, nessuna verità**: niente graduatorie né copie di anagrafiche |
| Prospezione commerciale | `deluxy-scout` | eccezione dichiarata (Supabase proprio); vale finché è prospezione |
| Copioni commerciali | `deluxy-scripts` | |

### 7.3 Le regole operative

1. **Un dominio, un solo scrittore.** Le chiavi API hanno lo scope; chi non
   possiede il dato propone, il proprietario fonde.
2. **Mai query su schemi altrui.** Nemmeno in lettura, nemmeno «per fare
   prima» (è la violazione che l'audit ha trovato in Tasks e Calendario su
   `hub."Utente"`). Si passa dalle API del proprietario.
3. **Le regole economiche vivono in un posto solo** e si leggono da lì: quota
   fornitore e margine in Orders, fee e listini nella piattaforma, IVA e
   aliquote nella contabilità. Un numero ricopiato resta al valore vecchio il
   giorno che il proprietario lo cambia.
4. **Una replica di lavoro dichiarata si misura.** Se una copia serve davvero
   (lo specchio banca di Orders: l'abbinamento cerca dentro tutto l'estratto),
   va dichiarata nel modello e la completezza si **conta** contro il
   proprietario — l'ultima data non tradisce i buchi in mezzo.
5. **La fonte espone i cambi che i lettori devono ritirare.** Un fatto che
   sparisce dagli elenchi (un ordine annullato) è una copia a valle che resta
   «valida» per sempre: serve il canale dedicato (`?annullatiDa=` in Orders è
   il modello).
6. **Un dato senza ingrediente non vale zero**: si dichiara «non calcolabile».

### 7.4 Il giro dell'ordine D2C (vincola Orders, Customer Service, piattaforma, Merchandising, Search, Transactions)

L'ordine arriva su **Orders** (sync Shopify). Il **Customer Service** è il
decisore — per mano o per regola — e ha quattro percorsi:

- **A · Fornitore in chat** (senza account partner): WhatsApp dal CS, consegna
  lui, conferma in chat → il CS propone tutto a Orders via PATCH. Nessun
  incarico in piattaforma.
- **B · Consegna nostra**: il CS crea l'**incarico** nella piattaforma
  (`POST /api/v1/consegne`, riferimento `orders:brand+orderId`, idempotente);
  il fornitore-partner lo vede dal suo account; valet, tracking, consegnato.
- **C · Fornitore da trovare**: Search propone i candidati, poi A, B o D.
- **D · Accettazione autonoma**: il prodotto è `type=UNICO` nella piattaforma
  (caricato dal fornitore, col suo prezzo). Il cron del CS incrocia il
  `productId` Shopify delle righe (Orders lo registra) con gli UNICI
  pubblicati e propone l'incarico **senza operatore**; il fornitore accetta
  dal suo applicativo (`proposto → accettato | rifiutato | scaduto`, timer
  della piattaforma); rifiuto o scadenza → coda umana del CS.

Il pagamento del fornitore passa **sempre** da Transactions (richiesta firmata
dal CS). Il **margine si calcola SOLO in Orders**: `incassato −
costoFornitore` (percorsi con consegna del fornitore) oppure `incassato −
costoFornitore − costoConsegna + fee` (consegna nostra) — costo e fee arrivano
dall'incarico della piattaforma, il costo pattuito è il `price` caricato dal
fornitore **cristallizzato sull'incarico** alla proposta.

**Sconti per provincia e lista di priorità (deciso il 24/08/2026):**

- La **% riconosciuta al fornitore può variare per provincia** (e per
  categoria: fiori/torte): è una regola economica dell'ordine, quindi vive in
  **Orders** — è l'evoluzione della quota fornitore che Orders possiede già.
  `GET /api/v1/quota-fornitore` accetta `?provincia=` (e `?categoria=`) e
  risponde quota e importo atteso; senza una riga per quella provincia vale il
  default. Nessun'app ricopia la tabella: la si interroga. L'atteso è la
  bussola — il costo **concordato** dal CS può sempre scostarsene, e sono i
  due numeri che il controllo di Orders confronta. ⚠️ Non si applica ai
  prodotti `UNICO`: lì il costo è il `price` caricato dal fornitore.
- La **lista di priorità dei fornitori per provincia** è del **Customer
  Service**, il decisore: nasce dai suoi fatti (a chi abbiamo dato gli ordini,
  esiti, reclami con colpa, tempi di risposta) più la preferenza manuale
  dell'operatore; può usare la quota di Orders come ingrediente. **Search
  resta il motore di scoperta** (chi esiste in zona, aperto adesso) e non
  tiene graduatorie; Anagrafiche resta l'identità.

**Deviazione dichiarata — `deluxy-messaging` (24/08/2026, decisa dall'utente).**
Due punti di §7.4 sono stati cambiati, e vale la pena scrivere perché.

**1 · Il margine lo calcola il Customer Service, e lo comunica a Orders.**
Il costo del fornitore **nasce nel Customer Service** — è la cifra che si concorda
al telefono con chi prepara l'ordine, ed è la stessa app che §7.2 indica come
proprietaria della «decisione di gestione». Il margine discende da quella
decisione, quindi si mostra lì nel momento in cui la cifra si scrive: è quello
l'istante in cui serve, perché è quando si può ancora discutere il prezzo.
Il numero **si comunica a Orders** via `PATCH /api/v1/ordini/<id>`
(`costoFornitore`, `costoDa: "customer-service"`), e Orders resta il posto dove
il margine si legge per i riepiloghi.
⚠️ **Si manda il costo, non il margine**: il margine è `totale − costo` e Orders
lo fa già da sé. Mandarli tutti e due vorrebbe dire due numeri per un fatto solo,
e il giorno che divergono nessuno saprebbe quale credere.
⚠️ **Il rischio noto**: sui percorsi con consegna nostra §7.4 prevede
`− costoConsegna + fee`. Su quelli il conto del Customer Service e quello di
Orders **non coincidono**, e vince quello di Orders. Finché gli incarichi in
piattaforma non esistono la questione è teorica; quando esisteranno, il Customer
Service dovrà leggere il margine da Orders invece di mostrarlo.
*Misurato il 24/08 prima della modifica: su #2780, #2783 e #2785 Orders rispondeva
«costo: non lo sa» — il margine era «non calcolabile» su quasi tutti i ~1.300
ordini, perché quel numero non arrivava mai fin lì.*

**2 · Il pagamento non passa sempre da Transactions.**
Un bonifico esce quasi sempre dal **portale della banca**, a mano; a volte si paga
in contanti alla consegna, o si compensa con quello che quel fornitore ci deve.
Il Customer Service registra il pagamento **e da dove è uscito**
(`RichiestaPagamento.pagatoCon`: banca · transactions · contanti · compensazione
· altro), con la ricevuta allegata.
⚠️ È lo stesso fatto che Transactions chiama `pagatoCon: "fuori_app"` e che
FINANCE già dichiara («pagato altrove: portale della banca, contanti,
compensazione»): l'ecosistema lo prevedeva già, §7.4 no.
⚠️ **Vuoto resta «non indicato»**: indovinare il canale di un'uscita di denaro
manda a cercare quel movimento dove non è mai passato.
