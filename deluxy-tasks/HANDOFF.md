# Handoff — Deluxy Tasks

App nuova (21/07/2026): registro centralizzato delle attività di un utente,
condiviso fra tutte le app Deluxy. Porta **3090**. Stack Next.js 15 + Prisma +
Postgres condiviso (schema `tasks`). Cartella: `C:\Users\nicol\app\deluxy-tasks`.

## Fotografia del 17/08/2026 (controllo reale su produzione + database)

- **Live e sana**: `https://deluxy-tasks.vercel.app` risponde (health 200,
  `/` → `/login`, `/api/sso` presente, API a chiave 401 senza chiave). Il codice
  online è quello di `main` (= `hub-registra-tasks` = questa cartella): l'ultimo
  commit funzionale è del 26/07, gli ultimi deploy (10/08) sono ridistribuzioni
  automatiche dovute a push su `main` di altre app. Env in produzione (4):
  `DATABASE_URL`, `DIRECT_URL`, `HUB_SSO_SECRET`, `TASKS_SESSION_SECRET`.
- **Database vivo e usato davvero** (schema `tasks`, cluster Supabase Francoforte):
  **214 task** (203 attive) — `mail` 195, `deluxy-finance` 15, e 5 task **demo**
  del seed (`partner` 2, `platform` 1, `scout` 1, `mail` 1: le uniche di
  scout/platform/partner sono finte). Stati: 51 aperte (**23 già scadute**),
  152 completate. Persone: `nicolo.donato@deluxy.it` 182, `renato.cassoli@deluxy.it`
  15, `donatod.nicolo@gmail.com` 3, `gaia@deluxy.it` 2, `eleonora.mannini@deluxy.it` 1.
  Revisione massima 44; 1 task con livelli multipli (3 livelli).
- **Chi scrive/legge (dalle chiavi, `ultimoUso`)**: `mail` (scrittura, ultimo uso
  17/08 07:55 → il cron di AI Mail è vivo e manda le attività ogni giorno);
  `calendario` (lettura, 17/08 07:45 → la sync del Calendario ogni 15' funziona);
  `deluxy-finance` (scrittura, **fermo dal 03/08** — Finance non manda niente da
  allora); `commerciale` (scrittura, creata il 31/07, **mai usata**).
- **Squadre: nessuna. Progetti registrati (callback): nessuno** → nessun webhook
  verso le app; chi sincronizza lo fa in pull (`changes`). I non-admin vedono solo
  le proprie task.
- **Corretto oggi**: le funzioni giravano a Washington col DB a Francoforte
  (`X-Vercel-Id: fra1::iad1`) → aggiunto `vercel.json` con `"regions": ["fra1"]`;
  aggiunto **`GET /api/health`** standard (`{ ok, app, database }` con `SELECT 1`,
  `no-store`) così la pagina /stato del Hub non segna più Tasks «non verificato».
  `/api/v1/health` resta com'era. **Verificato il 17/08 nel pomeriggio**:
  `/api/health` → `{"ok":true,"database":true}` in **0,55 s** con
  `X-Vercel-Id: fra1::fra1` (prima `fra1::iad1`), `/` → `/login`.
- **Attenzione (17/08)**: il commit con quelle due correzioni era **solo in
  locale** (branch `piattaforma-ricerca-insensitive`, mai su `origin`) mentre la
  produzione era già aggiornata da un deploy CLI: il primo push su `main` di
  un'altra sessione l'avrebbe cancellata dalla produzione. Ora è **su `main`**
  insieme a «Nuova attività». Regola: su Tasks si finisce **sempre** con
  `git push origin <branch>:main`.
- **Task di prova rimossa**: la task `sistema=tasks` «Prova nuova attività (test
  Claude, da cancellare)», creata dal collaudo del form, è stata cancellata (era
  l'unica del sistema `tasks`, nessun dato reale toccato). Restano invece le
  **5 task demo del seed** (`idEsterno` che inizia per `demo-`).

## FATTO

- **Schema Prisma** (`prisma/schema.prisma`): modello `Task` (identità
  `(sistema, idEsterno)`, utente per email, stato/priorità, scadenza, contesto,
  tag, extra JSON, soft delete) + `ApiKey` (hash SHA-256, flag scrittura).
- **API v1** (`src/app/api/v1/…`):
  - `GET /health` (senza auth).
  - `GET /tasks` con filtri (utente, stato, sistema, priorita, tag, q, aperte,
    scadenzaEntro, page/perPage) + paginazione.
  - `POST /tasks` — upsert su (sistema, idEsterno). Richiede chiave scrittura.
  - `GET/PATCH/DELETE /tasks/:id` — leggi / modifica / archivia (soft delete).
  - `GET /tasks/by-ref/:sistema/:idEsterno` — risoluzione per id d'origine.
  - `GET /tasks/changes?since=&sistema=&utente=` — feed incrementale (pull) per
    "cosa è cambiato": revisione > since + cursore.
  - `GET/POST /progetti` — registro progetti (callbackUrl + segreto HMAC).
- **Sincronizzazione** (`src/lib/sync.ts`, `src/lib/callback.ts`):
  - Freschezza: `POST` con `asOf` più vecchio del registrato → `ignorata_obsoleta`
    (niente regressioni); `revisioneOrigine` = versione del progetto, conservata.
  - Revisione interna `Task.revisione` (intero, +1 a ogni modifica) = cursore pull.
  - Callback: quando una task cambia e l'attore ≠ sistema di origine (es. UI del
    team), Tasks fa un POST firmato (HMAC-SHA256, header `x-tasks-signature`) al
    `callbackUrl` del progetto. Best-effort (timeout 5s), niente self-callback
    (l'origine che riscrive la propria task non si auto-notifica → no loop).
- **Auth API**: chiavi in `x-api-key` (o Bearer), hash in DB (`src/lib/api-auth.ts`).
- **Accesso UI per-utente (dal Hub)**: login con email+password del Deluxy Hub,
  autenticate contro `hub."Utente"` sullo stesso cluster (`src/lib/hub-utenti.ts`,
  `password.ts` scrypt). Sessione = cookie firmato HMAC (`src/lib/auth.ts`,
  `TASKS_SESSION_SECRET`). **Admin** vede tutte le task; **gli altri** le proprie +
  quelle della **squadra** (`src/lib/squadre.ts`, modelli Squadra/MembroSquadra,
  `npm run squadra`). Copiato 1:1 da deluxy-calendario (app gemella).
- **Livelli di priorità con date diverse**: modello `TaskLivello` (priorita, data,
  nota, ordine); `Task.livelloSceltoId` = livello attivo; `Task.priorita/scadenza`
  rispecchiano sempre il livello scelto (le app che non gestiscono i livelli
  leggono un valore singolo). API: `livelli` nel POST/PATCH (sostituisce il set);
  la UI cambia il livello attivo via `/api/interno/tasks/:id { livelloId }`.
  Lib `src/lib/livelli.ts` + `src/lib/applica-livelli.ts`.
- **UI** (design system Deluxy, stile Apple): dashboard `/` che raggruppa le
  task per persona, chip di stato + filtro progetto + ricerca
  (`src/components/Filtri.tsx`), card task con spunta "completa", "archivia" e i
  chip dei livelli di priorità cliccabili (`src/components/RigaTask.tsx`), via
  endpoint interno `/api/interno/tasks/:id`. Barra utente con ruolo.
- **Attività create a mano dalla UI** (17/08/2026): bottone **«＋ Nuova attività»**
  in cima alla dashboard (`src/components/NuovaTask.tsx`) con titolo, descrizione,
  **per chi**, priorità, scadenza e link. Salva con la server action
  `src/lib/task-actions.ts` (`creaTaskAction`), che rifà i controlli lato server:
  titolo obbligatorio (max 200), email valida, priorità dell'elenco, data
  `YYYY-MM-DD` (salvata a mezzogiorno UTC, così in Italia resta il giorno giusto),
  link solo `http(s)://`, e **un non-admin può assegnare solo a sé o alla propria
  squadra**. L'elenco delle persone (`src/lib/persone.ts`) unisce gli utenti del
  Hub (`hub."Utente"`) e chi ha già delle task; un admin può anche digitare
  un'email fuori elenco. Le task nate qui hanno `sistema = "tasks"` (`SISTEMA_UI`,
  etichetta **«Inserita a mano»**) e `idEsterno` nullo: nessuna app le sovrascrive
  e non parte nessun callback.
- **Chiavi dall'app** (26/07/2026): pagina **`/chiavi`** (solo admin,
  `src/app/chiavi/page.tsx` + `src/components/Chiavi.tsx` +
  `src/lib/chiavi-actions.ts`). Si sceglie nome dell'app e se può scrivere; la
  chiave in chiaro compare **una volta sola** con il tasto «Copia» (nel database
  resta solo lo SHA-256, come da riga di comando). Si vedono le chiavi esistenti
  con l'ultimo uso e si possono revocare/riattivare; rigenerare una chiave manda
  in pensione la precedente. Link nella barra in alto.
- **Script**: `crea-chiave.mjs`, `registra-progetto.mjs` (npm run progetto),
  `configura-db-condiviso.mjs`, `seed-demo.mjs`, `vercel-env-prod.mjs`
  (`npm run vercel:env`: copia DATABASE_URL/DIRECT_URL dal `.env` alle variabili
  di **produzione** su Vercel senza mostrarle e rilancia il deploy).
- **Hub**: registrata in `deluxy-hub/src/lib/apps.ts` (id `tasks`, `APP_URL_TASKS`,
  ruoli admin/commerciale/partner) + icona `tasks` in `AppIcon.tsx`.
- **Online (26/07/2026)**: progetto Vercel `deluxy-tasks` (rinominato da `tasks`),
  URL pubblico **https://deluxy-tasks.vercel.app** (resta valido anche il vecchio
  `tasks-eight-gray.vercel.app`). `TASKS_SESSION_SECRET` impostato in produzione →
  la UI **richiede il login** (`/` reindirizza a `/login`). Il Hub non punta più a
  `localhost:3090`: il default in `apps.ts` è l'URL pubblico (Hub ridistribuito).
  - **Ingresso dal Hub senza secondo login (SSO)**: `GET /api/sso?token=…`
    (`src/app/api/sso/route.ts` + `src/lib/sso.ts`, copia lato ricezione di
    `deluxy-hub/src/lib/sso.ts`). Il Hub cifra un token AES-256-GCM di 60s con
    `HUB_SSO_SECRET` — **lo stesso valore nelle due app** — che porta email, nome
    e ruolo; Tasks apre la sua sessione a cookie. L'identità qui è l'**email**:
    il Hub la aggiunge al token (`PayloadSso.email`) leggendola dalla sua tabella
    `Utente`. Token assente/scaduto/di un'altra app/segreto sbagliato → `/login`.
  - 🔴 **La produzione nasce dal branch `main` di GitHub.** Il progetto Vercel è
    collegato al repo (alias `deluxy-tasks-git-main-deluxy.vercel.app`): **ogni
    push su `main` ridistribuisce e sovrascrive quello che hai pubblicato da
    CLI**. Il 26/07 la rotta `/api/sso` è tornata 404 due volte per questo: era
    solo sul branch `hub-registra-tasks`, e i push su `main` di un'altra
    sessione rimettevano online la versione senza SSO. Quindi: **il lavoro su
    Tasks va portato su `main`** (`git push origin <branch>:main` dopo aver
    fatto il merge di `origin/main`), non basta il deploy da CLI.
  - **Come si ridistribuisce a mano**: il progetto ha *Root Directory* = `deluxy-tasks`,
    quindi `vercel deploy` **dalla cartella dell'app fallisce** (cerca
    `deluxy-tasks/deluxy-tasks`). La radice del repo è stata collegata al
    progetto, quindi il deploy si fa da lì:
    `cd C:\Users\nicol\app && npx vercel deploy --prod --yes`.
  - ⚠️ **Mai `vercel redeploy`**: non applica solo le variabili nuove, rimette in
    produzione il **codice** di quel vecchio deploy. Il 26/07 ha riportato online
    una versione senza `/api/sso`, e dal Hub si finiva su una pagina 404.
- **Verifica**: `npx tsc --noEmit` OK, `next build` OK (rifatti il 17/08 con
  «Nuova attività»), DB collegato (schema
  isolato `tasks` nel cluster condiviso) con 4 task demo. Testato end-to-end:
  upsert idempotente, freschezza (`ignorata_obsoleta`), callback firmato HMAC
  verso un webhook di prova (1 callback per azione, nessun loop), changes feed
  con cursore incrementale.

## MANCA (serve l'utente / passi con segreti)

1. ~~**Collegare il DB**~~ **FATTO** (locale e produzione, vedi punto 3).
2. **Chiavi API**: si creano **dall'app, in `/chiavi`** (o `npm run chiave --
   <app> --scrittura`) e si mettono nei `.env` di quelle app (es. `TASKS_API_KEY`).
   Al 17/08/2026 esistono `mail` (scrittura, in uso), `calendario` (lettura, in
   uso), `deluxy-finance` (scrittura, ferma dal 03/08), `commerciale` (scrittura,
   mai usata: da capire per quale app era stata fatta — Scout? — e installarla).
3. ~~**DB in produzione**~~ **FATTO il 26/07/2026**: `DATABASE_URL` e `DIRECT_URL`
   sono nelle variabili di produzione (messe con `npm run vercel:env`, che le copia
   dal `.env` locale senza stamparle e poi ripubblica dalla radice del repo).
   L'app online interroga il database. **Restano da creare le squadre**
   (`npm run squadra`): al 17/08 non ce n'è nessuna, quindi i non-admin (Renato,
   Gaia, Eleonora) vedono solo le proprie task.
4. **Far mandare le task alle app**: integrare `POST /api/v1/tasks` dove ogni app
   già crea "cose da fare".
   - **FATTO — AI Mail** (26/07/2026, repo `scoutwt`, branch `scout-ui`):
     `deluxy-mail/src/lib/registroTask.ts` manda le attività a ogni giro del cron
     della posta (`GET /api/sync`, `?forzaRegistro=1` per rimandare tutto), solo
     quelle cambiate, con `asOf` che impedisce di riaprire ciò che è stato chiuso
     qui. Chiave incollabile in AI Mail → Impostazioni App → «Registro Attività».
     **Vivo al 17/08** (195 task, ultimo invio alle 07:55).
   - **FATTO — Finance** (`deluxy-partner/src/lib/tasks-sync.ts`, nei due versi,
     `sistema=deluxy-finance`): 15 task per Renato, **ma ferma dal 03/08** (nessun
     invio da allora — controllare dal lato Finance se il cron/la sync sono spenti).
   - **FATTO — Calendario** legge in pull con la chiave `calendario` (cron ogni 15').
   - **DA FARE**: Scout (le visite), Consegne (le attività operative), Customer
     Service (le azioni sui reclami), Acquisti (le richieste da approvare).
5. **Pulizia**: 5 task demo del seed (`idEsterno` che inizia per `demo-`) sono
   ancora nel database di produzione — archiviarle o cancellarle (solo quelle).
   (La task di prova del form «Nuova attività» è già stata tolta il 17/08.)
6. **Punti aperti**: registrare i progetti (`npm run progetto`) se si vuole il
   callback verso le app quando il team chiude una task dalla UI (oggi nessuno
   registrato: si va solo in pull); **23 task aperte già scadute** (la UI le segna
   in rosso «Scaduta …», ma nessuno le chiude): 14 di AI Mail (13 Nicolò, 1
   Eleonora) e **9 di Finance per Renato** — quelle di Finance sono 14 aperte su
   15 e Finance non le aggiorna dal 03/08, quindi possono essere già fatte di là.
   Le più vecchie sono del **22/07** («Ripianificare l'appuntamento con Stefano
   Corona»), quindi scadute da quasi un mese.
7. **Il Calendario legge ma nessuno scrive dalla parte sua**: la sync di
   `deluxy-calendario` gira ogni 15' con chiave di sola lettura (ultimo giro
   17/08 08:15). Se si vuole che una task creata a mano finisca anche a
   calendario, basta darle una **scadenza**.

## Note

- `sistema` è libero lato API (un'app nuova può mandare da subito); l'elenco noto
  con nomi/colori è in `src/lib/sistemi.ts`.
- Identità utente = **email** (scelta condivisa col Hub). Se in futuro servisse
  un id Hub stabile, aggiungere un campo `utenteId` senza rompere l'email.
