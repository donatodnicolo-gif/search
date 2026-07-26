# Handoff — Deluxy Tasks

App nuova (21/07/2026): registro centralizzato delle attività di un utente,
condiviso fra tutte le app Deluxy. Porta **3090**. Stack Next.js 15 + Prisma +
Postgres condiviso (schema `tasks`). Cartella: `C:\Users\nicol\app\deluxy-tasks`.

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
  - **Come si ridistribuisce**: il progetto ha *Root Directory* = `deluxy-tasks`,
    quindi `vercel deploy` **dalla cartella dell'app fallisce** (cerca
    `deluxy-tasks/deluxy-tasks`). La radice del repo è stata collegata al
    progetto, quindi il deploy si fa da lì:
    `cd C:\Users\nicol\app && npx vercel deploy --prod --yes`.
  - ⚠️ **Mai `vercel redeploy`**: non applica solo le variabili nuove, rimette in
    produzione il **codice** di quel vecchio deploy. Il 26/07 ha riportato online
    una versione senza `/api/sso`, e dal Hub si finiva su una pagina 404.
- **Verifica**: `npx tsc --noEmit` OK, `next build` OK, DB collegato (schema
  isolato `tasks` nel cluster condiviso) con 4 task demo. Testato end-to-end:
  upsert idempotente, freschezza (`ignorata_obsoleta`), callback firmato HMAC
  verso un webhook di prova (1 callback per azione, nessun loop), changes feed
  con cursore incrementale.

## MANCA (serve l'utente / passi con segreti)

1. **Collegare il DB**: `npm run db:condiviso -- <env-di-un-altra-app>` poi
   `npm run db:push`. Serve una stringa Postgres del cluster condiviso (segreta).
2. **Creare le chiavi API** per le app che manderanno task
   (`npm run chiave -- <app> --scrittura`) e metterle nei `.env` di quelle app
   (es. `TASKS_API_KEY`). **AI Mail è già pronta lato codice** (26/07/2026): manca
   solo `npm run chiave -- mail --scrittura` e incollare la chiave in AI Mail →
   Impostazioni App → «Registro Attività» (o nella cassaforte del Hub, progetto
   `deluxy-mail`, nome `TASKS_API_KEY`).
3. ~~**DB in produzione**~~ **FATTO il 26/07/2026**: `DATABASE_URL` e `DIRECT_URL`
   sono nelle variabili di produzione (messe con `npm run vercel:env`, che le copia
   dal `.env` locale senza stamparle e poi ripubblica dalla radice del repo).
   L'app online interroga il database. Restano da creare le squadre
   (`npm run squadra`).
4. **Far mandare le task alle app**: integrare `POST /api/v1/tasks` dove ogni app
   già crea "cose da fare".
   - **FATTO — AI Mail** (26/07/2026, repo `scoutwt`, branch `scout-ui`):
     `deluxy-mail/src/lib/registroTask.ts` manda le attività a ogni giro del cron
     della posta (`GET /api/sync`, `?forzaRegistro=1` per rimandare tutto), solo
     quelle cambiate, con `asOf` che impedisce di riaprire ciò che è stato chiuso
     qui. Chiave incollabile in AI Mail → Impostazioni App → «Registro Attività».
   - **DA FARE**: Scout (le visite), Consegne (le attività operative), Finance
     (i bonifici da fare), Customer Service (le azioni sui reclami), Acquisti
     (le richieste da approvare).

## Note

- `sistema` è libero lato API (un'app nuova può mandare da subito); l'elenco noto
  con nomi/colori è in `src/lib/sistemi.ts`.
- Identità utente = **email** (scelta condivisa col Hub). Se in futuro servisse
  un id Hub stabile, aggiungere un campo `utenteId` senza rompere l'email.
