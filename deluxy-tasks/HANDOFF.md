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
  `configura-db-condiviso.mjs`, `seed-demo.mjs`.
- **Hub**: registrata in `deluxy-hub/src/lib/apps.ts` (id `tasks`, `APP_URL_TASKS`,
  ruoli admin/commerciale/partner) + icona `tasks` in `AppIcon.tsx`.
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
   (es. `TASKS_API_KEY`).
3. **Deploy Vercel** (progetto nuovo `deluxy-tasks`, root `deluxy-tasks/`), con
   `DATABASE_URL`, `DIRECT_URL`, `TASKS_SESSION_SECRET` (per il login dal Hub).
   Poi impostare `APP_URL_TASKS` nel Hub. Creare le squadre con `npm run squadra`.
4. **Far mandare le task alle app**: integrare `POST /api/v1/tasks` dove ogni app
   già crea "cose da fare" (AI Mail estrae attività dalle mail; Scout le visite;
   Consegne le attività operative; Finance i bonifici da fare; ecc.).
5. **Commit/branch**: i file sono su disco nel repo `app` (branch `deluxy-scout`),
   non ancora committati. Decidere ramo e push.

## Note

- `sistema` è libero lato API (un'app nuova può mandare da subito); l'elenco noto
  con nomi/colori è in `src/lib/sistemi.ts`.
- Identità utente = **email** (scelta condivisa col Hub). Se in futuro servisse
  un id Hub stabile, aggiungere un campo `utenteId` senza rompere l'email.
