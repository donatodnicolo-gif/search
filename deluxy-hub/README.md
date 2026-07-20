# Deluxy Hub

**Produzione: https://deluxy-hub.vercel.app** — URL pubblico, ma senza login non
si vede nulla. Si entra solo con gli utenti creati da `/utenti`.

Portale unico di accesso alle app Deluxy. L'utente entra con email e password e
trova nella home **solo le icone delle app abilitate per il suo ruolo**. Ogni app
resta autonoma: il Hub la linka, non la ingloba.

Stack: **Next.js 15** (App Router, server action) · **Prisma** · **Postgres
(Supabase)** · Deluxy Design System v1.0. Porta di sviluppo: **3050**.

Il Hub vive nello **schema `hub`** dello stesso database Supabase di
`deluxy-partner`: le sue tabelle sono isolate da quelle di Partner (che stanno in
`public`), quindi un `prisma db push` del Hub non può toccarne i dati.

---

## 1. Ruoli e app

Il **ruolo** decide i privilegi, **non** più quali app si vedono:

| Ruolo | Etichetta | Cosa può fare |
|---|---|---|
| `admin` | Amministratore | vede **tutte** le app + gestisce gli utenti (`/utenti`) |
| `partner` | Partner | vede solo le app spuntate sul suo profilo |
| `commerciale` | Commerciale | vede solo le app spuntate sul suo profilo |

**Le app visibili si scelgono per singolo utente**, non per ruolo: in `/utenti`
ogni utente ha una lista di spunte (una per app del catalogo). Il ruolo serve
solo da preselezione comoda quando crei l'utente. Gli **admin** vedono comunque
tutto il catalogo, a prescindere dalle spunte.

- La lista sta nel campo `appAbilitate` (`String[]`) dell'`Utente`, vedi
  [`prisma/schema.prisma`](prisma/schema.prisma).
- Chi vede cosa è deciso da `appVisibili()` in [`src/lib/permessi.ts`](src/lib/permessi.ts),
  che rilegge l'utente dal database a ogni caricamento: **modificare le spunte ha
  effetto subito**, senza aspettare un nuovo login (a differenza del ruolo, che
  viaggia nel cookie).
- I ruoli sono in [`src/lib/ruoli.ts`](src/lib/ruoli.ts).
- Il catalogo app è in [`src/lib/apps.ts`](src/lib/apps.ts).
- Le icone (SVG) sono in [`src/components/AppIcon.tsx`](src/components/AppIcon.tsx).

Gli URL delle app arrivano dall'ambiente (`APP_URL_SEARCH`, `APP_URL_PARTNER`,
`APP_URL_SCOUT`, …), così lo stesso codice punta a locale o produzione.

**Un'app senza URL configurato sparisce dalla home.** In produzione l'URL deve
arrivare dall'ambiente: se manca, l'icona non viene mostrata invece di portare a
una pagina morta. Il fallback a `localhost` vale solo in sviluppo. È così che
Scout (app mobile, nessun sito pubblico), Anagrafiche e AI Mail restano visibili
in locale ma nascosti in produzione finché non hanno un indirizzo pubblico.

### Aggiungere un'app

1. Aggiungi il glifo in `AppIcon.tsx` e il suo nome al tipo `icona` in `apps.ts`.
2. Aggiungi la voce in `catalogoApp()` con `url` (da env) e `ruoli` (i ruoli per
   cui l'app è pre-spuntata quando crei un utente — non decide chi la vede).
3. Aggiungi la variabile in `.env.example` e, per la produzione, nelle env di
   Vercel; poi `npx vercel deploy --prod`.

L'app comparirà come nuova spunta in `/utenti`: assegnala agli utenti che devono
vederla (gli admin la vedono già).

## 2. Avvio in locale

```bash
cd deluxy-hub
npm install
cp .env.example .env        # poi compila i valori (vedi sotto)
npx prisma db push          # crea le tabelle nello schema "hub"
npm run db:seed             # crea il primo amministratore
npm run dev                 # http://localhost:3050
```

Serve un Postgres anche in locale (come `deluxy-partner`): metti in `.env` la
connection string Supabase con `?schema=hub` in fondo.

### Variabili d'ambiente

| Variabile | A cosa serve |
|---|---|
| `DATABASE_URL` | Postgres Supabase, pooler 6543, con `?pgbouncer=true&connection_limit=1&schema=hub` |
| `DIRECT_URL` | Postgres Supabase, pooler 5432, con `?schema=hub` — usata da `db push` |
| `HUB_SESSION_SECRET` | firma il cookie di sessione. **Cambiarlo disconnette tutti.** Generalo con `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `APP_URL_SEARCH` / `APP_URL_PARTNER` / `APP_URL_SCOUT` | dove puntano le icone |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | primo admin creato dal seed (solo primo avvio) |

`.env` è in `.gitignore`: i segreti non finiscono mai nel repo.

## 3. Come funziona l'accesso

- **Password**: hash con `scrypt` (Node), salvato come `salt:hash`. In chiaro non
  esistono da nessuna parte. Vedi [`src/lib/password.ts`](src/lib/password.ts).
- **Sessione**: cookie `dh_session` httpOnly con payload firmato HMAC-SHA256
  (`src/lib/session.ts`). Il [middleware](src/middleware.ts) lo valida sull'Edge
  senza interrogare il database; un cookie manomesso viene rifiutato.
- **Permessi**: il middleware blocca `/utenti` a chi non è `admin`; le server
  action ricontrollano il ruolo lato server (`richiediAdmin()`), quindi non basta
  nascondere un bottone.
- **App visibili**: si scelgono per utente (campo `appAbilitate`) e la home le
  rilegge dal database a ogni caricamento, quindi cambiarle ha effetto subito.
- Cambiare **ruolo** o disattivare un utente ha effetto **al prossimo login**: il
  ruolo viaggia nel cookie, che dura 30 giorni. Per un'espulsione immediata,
  cambiare `HUB_SESSION_SECRET`.

## 4. Pagine

| Rotta | Chi | Cosa |
|---|---|---|
| `/` | tutti | home con le icone delle app abilitate per l'utente |
| `/login` | pubblica | email + password |
| `/profilo` | tutti | proprio ruolo, app abilitate, cambio password |
| `/utenti` | solo admin | crea, sceglie app per utente, cambia ruolo/password, attiva/disattiva, elimina |

## 5. Deploy

Progetto Vercel: **`deluxy/deluxy-hub`** (`npx vercel --prod` dalla cartella,
come `deluxy-partner`). Il portale è a URL pubblico ma **non mostra nulla senza
login**: si entra solo con gli utenti creati da `/utenti`.

Env di produzione già impostate: `HUB_SESSION_SECRET`, `APP_URL_SEARCH`,
`APP_URL_PARTNER`. Gli altri `APP_URL_*` sono volutamente assenti, così le app
senza sito pubblico non compaiono.

Env di produzione impostate: `DATABASE_URL`, `DIRECT_URL` (entrambe con
`?schema=hub`), `HUB_SESSION_SECRET`, `APP_URL_SEARCH`, `APP_URL_PARTNER`,
`APP_URL_SCOUT`.

**Cambiare un `APP_URL_*` non basta**: le env di Vercel si applicano solo ai
deployment nuovi, quindi dopo averle modificate serve un `npx vercel deploy
--prod`, altrimenti il sito continua a mostrare i vecchi valori.

Lo `?schema=hub` non è un dettaglio: senza, `db push` lavorerebbe sullo schema
`public` e finirebbe **sui dati di Partner**.

### `.vercelignore`: i `.env` non si caricano

Vercel **non applica `.gitignore`** agli upload: senza
[`.vercelignore`](.vercelignore) il `.env` locale finisce nel pacchetto, e in
produzione l'app legge i valori di sviluppo. È già successo: il primo deploy
mostrava l'icona di Scout con `http://localhost:8081`, perché `APP_URL_SCOUT`
arrivava dal `.env` caricato invece che dalle env di Vercel. Caricare il `.env`
significa anche spedire in cloud le credenziali del database. Non toglierlo.

### Primo deploy su un database nuovo

```bash
npx prisma db push   # crea le tabelle nello schema "hub"
npm run db:seed      # crea il primo admin (SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD)
npx vercel deploy --prod
```

## 6. Stato

**In produzione** su https://deluxy-hub.vercel.app (18 luglio 2026). Sei app nel
catalogo (Consegne, Search Partners, Partner, Anagrafiche, Maison, Commerciale
Scout, AI Mail); Consegne è ancora un segnaposto su `localhost`.

**Permessi per singola app** verificati **sul sito pubblicato**: creato un utente
di prova con ruolo commerciale ma con la sola app Partner spuntata; al login
vedeva **solo Partner** (non i default del commerciale), senza link `/utenti`, e
`/utenti` gli veniva bloccato con redirect alla home. Utente di prova poi
eliminato: sul database resta solo l'admin. Confermato anche: login admin (vede
tutto), redirect a `/login` per home, `/utenti` e con cookie falsificato,
isolamento schema `hub` con le tabelle di Partner intatte.

**Manca** — Consegne non ha un indirizzo pubblico (segnaposto admin). Nessun
recupero password autonomo (lo reimposta un admin da `/utenti`).
