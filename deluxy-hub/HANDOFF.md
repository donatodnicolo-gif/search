# Deluxy Hub — Handoff per ripartire

> Documento per una nuova sessione (anche altro account Claude) che riprende il
> lavoro sul portale. Aggiornato: **23 luglio 2026**.
> Leggi anche [README.md](README.md) (dettagli completi) e la memoria del progetto.

---

## 1. Cos'è, dov'è, com'è messo

**Deluxy Hub** è il portale unico di accesso alle app Deluxy: l'utente entra con
email+password e vede in home **solo le icone delle app abilitate per lui**. Ogni
app resta autonoma, il Hub la linka soltanto.

- **Codice**: `C:\Users\nicol\scoutwt\deluxy-hub\` (Next.js 15, App Router, server
  action, Prisma, Postgres/Supabase, Deluxy Design System). Porta dev: **3050**.
- **Produzione**: **https://deluxy-hub.vercel.app** — URL pubblico ma **non mostra
  nulla senza login**. Stato: **online e funzionante**.
- **Git**: repo radice `C:\Users\nicol\scoutwt`, branch **`scout-ui`**. Ultimo
  commit del Hub: `6870236`. Working tree pulito. ⚠️ **1 commit locale non ancora
  su `origin/scout-ui`** (l'ultimo). I file sono tutti su disco: una sessione sulla
  stessa macchina li vede subito, senza `git pull`.

### ⚠️ Attenzione: cartella condivisa con un'altra sessione
Un'altra sessione Claude lavora **nella stessa cartella** e ha aggiunto in
parallelo le app **Anagrafiche** e **AI Mail** e corretto la porta di AI Mail.
Prima di modifiche importanti: **rileggi sempre i file da disco** (potrebbero
essere cambiati) e, se possibile, coordina o chiudi l'altra sessione. La regola
del progetto è **una sessione per cartella**.

---

## 2. Accesso (cambiare la password!)

| | |
|---|---|
| URL | https://deluxy-hub.vercel.app |
| Email admin | `deluxy.delivery@gmail.com` |
| Password admin | `deluxy2026` — **TEMPORANEA, in chiaro in `.env`** |

🔴 **Prima cosa da fare/ricordare**: cambiare la password dell'admin dal portale
(barra in alto → il proprio nome → Cambia password). Finché non è cambiata, resta
quella qui sopra, leggibile nel file `.env` locale.

---

## 3. Le 12 app del portale

Ordine alfabetico A→Z (ordinamento fatto in `catalogoApp()`).

| App (etichetta) | URL | Chi la vede | Note |
|---|---|---|---|
| AI Mail | `APP_URL_MAIL` (dev 3070) | solo admin | |
| Anagrafiche | `APP_URL_ANAGRAFICHE` (dev 3060) | admin, commerciale | |
| Attività | `APP_URL_TASKS` ?? `http://localhost:3090` | solo admin | visibile anche in prod |
| Budgets | `APP_URL_BUDGETS` ?? `http://localhost:3080` | solo admin | visibile anche in prod |
| Calendario | `APP_URL_CALENDARIO` ?? `http://localhost:3110` | solo admin | visibile anche in prod |
| Commerciale Scout | `https://deluxy-scout.vercel.app` | admin, commerciale | export web Expo |
| Consegne | `https://deluxy-delivery.vercel.app` | solo admin | |
| Finance | `https://deluxy-partner.vercel.app` | admin, partner | id interno = `partner`, **`sso: true`** |
| Maison | `https://deluxy-os.base44.app/` | tutti i ruoli | Deluxy OS su base44 |
| Marketing | `APP_URL_MARKETING` ?? `http://localhost:3130` | solo admin | visibile anche in prod |
| Merchandising | `APP_URL_MERCHANDISING` ?? `http://localhost:3120` | admin, commerciale | visibile anche in prod |
| Ricerca fornitori | `https://search-deluxy.vercel.app` | admin, commerciale | id interno = `search` |

- Regola generale: senza `APP_URL_*` l'app **sparisce in produzione** (helper `url()`
  in `apps.ts`). Le app marcate "visibile anche in prod" sono **eccezioni volute**
  (`process.env.X ?? "http://localhost:PORTA"`): la tessera resta e punta
  all'istanza locale finché non c'è un URL pubblico.
- Le app con `sso: true` in home puntano a **`/vai/<id>`** invece che all'URL
  diretto: il Hub genera il token e reindirizza (vedi §9-bis).
- I "Chi la vede" della tabella sono i **default di preselezione del ruolo**: con i
  permessi per-utente (sotto) l'accesso vero è deciso app-per-app.

---

## 4. Modello permessi (importante)

Il **ruolo** decide i privilegi, **non** più quali app si vedono:
- `admin` → vede **tutte** le app + gestisce gli utenti (`/utenti`);
- `partner` / `commerciale` → vedono **solo le app spuntate sul loro profilo**.

Le app visibili si scelgono **per singolo utente** in `/utenti` (una spunta per
app). Il ruolo serve solo da preselezione comoda alla creazione. La logica è in
[`src/lib/permessi.ts`](src/lib/permessi.ts) → `appVisibili()`, che **rilegge
l'utente dal database a ogni caricamento**: cambiare le spunte ha effetto subito
(il ruolo invece viaggia nel cookie e cambia al login successivo).

Dato salvato: `Utente.appAbilitate String[]` (id delle app), vedi
[`prisma/schema.prisma`](prisma/schema.prisma).

---

## 5. File chiave

| File | Cosa |
|---|---|
| [`src/lib/apps.ts`](src/lib/apps.ts) | catalogo app, filtro per URL, ordinamento A→Z, `appPerIds`/`idAppValidi` |
| [`src/lib/permessi.ts`](src/lib/permessi.ts) | `appVisibili()` — chi vede cosa |
| [`src/lib/ruoli.ts`](src/lib/ruoli.ts) | i 3 ruoli e le etichette |
| [`src/lib/actions.ts`](src/lib/actions.ts) | login, logout, CRUD utenti, cambio password |
| [`src/lib/session.ts`](src/lib/session.ts) | cookie firmato HMAC (`dh_session`), validato dal middleware |
| [`src/lib/password.ts`](src/lib/password.ts) | hash `scrypt` (`salt:hash`) |
| [`src/middleware.ts`](src/middleware.ts) | blocca chi non è loggato; `/utenti` solo admin |
| [`src/components/AppIcon.tsx`](src/components/AppIcon.tsx) | glifi SVG delle app |
| [`src/app/{page,login,utenti,profilo}`](src/app) | home, login, gestione utenti, profilo |

---

## 6. Deploy e ambiente (Vercel)

- Progetto: **`deluxy/deluxy-hub`** (CLI già autenticata come `donatodnicolo-gif`).
- Deploy produzione: dalla cartella `deluxy-hub`, `npx vercel deploy --prod`.
  (Il classificatore di permessi può bloccarlo: se succede, chiedi conferma
  all'utente o fallo lanciare a lui.)
- **Env di produzione già impostate** (10): `DATABASE_URL`, `DIRECT_URL`,
  `HUB_SESSION_SECRET`, `APP_URL_MAIL`, `APP_URL_MAISON`, `APP_URL_ANAGRAFICHE`,
  `APP_URL_CONSEGNE`, `APP_URL_SCOUT`, `APP_URL_PARTNER`, `APP_URL_SEARCH`.
  Sono `Encrypted`/`[SENSITIVE]`: non si rileggono dalla CLI. Le copie locali
  stanno in `deluxy-hub/.env`.

### Database
Postgres **Supabase**, lo stesso progetto di `deluxy-partner`, ma nello **schema
`hub`** (isolato: le tabelle di Partner stanno in `public`). Le connection string
in `.env` finiscono con `?schema=hub`. Verificato che le 7 tabelle di Partner in
`public` sono intatte.

---

## 7. Trappole già incontrate (non ricascarci)

1. **`.vercelignore` deve escludere `.env`**: Vercel **non** applica `.gitignore`
   agli upload. Senza, il `.env` locale finisce nel bundle e in produzione l'app
   legge i valori di sviluppo (già capitato: Scout mostrava `localhost:8081`) —
   e spedisci in cloud le credenziali del db. Il file [`.vercelignore`](.vercelignore)
   c'è: non toglierlo.
2. **Cambiare un env var NON basta**: le env di Vercel valgono solo per i
   deployment nuovi. Dopo ogni modifica → `npx vercel deploy --prod`.
3. **Rinominare un'app** = cambiare solo `nome` in `apps.ts`. **NON** toccare `id`
   né `APP_URL_*`: romperebbe i permessi salvati e la config Vercel. (Così sono
   stati fatti "Finance" ← Partner e "Ricerca fornitori" ← Search Partners.)
4. **Windows / Prisma**: se `prisma generate` dà `EPERM ... query_engine.dll`,
   ferma prima il dev server (blocca il file), poi rigenera.
5. **Verifica**: in questa macchina lo **screenshot del pannello browser va in
   timeout** (viewport 0x0). Ho verificato tutto con `javascript_tool` contro il
   sito pubblicato (leggere `.app-card`, compilare form, ecc.). Usa quel metodo.

---

## 8. Avvio in locale

```bash
cd C:\Users\nicol\scoutwt\deluxy-hub
npm install
# .env è già presente e compilato (DB, segreti, URL app). Se manca: cp .env.example .env
npx prisma generate
npm run dev            # http://localhost:3050
```

---

## 9. Cosa manca / prossimi passi possibili

- **Cambiare la password admin** (vedi §2).
- **Go-live SSO** (§9-bis): impostare lo stesso `HUB_SSO_SECRET` (min 32 caratteri)
  nelle env Vercel di **Hub e deluxy-partner**, poi redeploy di entrambi. Finché
  il segreto manca, `/vai/<id>` degrada e apre l'app col suo login normale.
- **URL pubblici mancanti**: Attività, Budgets, Calendario, Merchandising puntano
  a `localhost`. Quando saranno pubblicate: `APP_URL_*` su Vercel + redeploy.
- **Nessun recupero password autonomo**: lo reimposta un admin da `/utenti`.
- **Creare gli utenti veri** del team da `/utenti` (finora esiste solo l'admin).

---

## 9-bis. Novità 21–23 luglio 2026

- **Cassaforte `/chiavi`** (solo admin): i segreti di tutti i progetti cifrati
  AES-256-GCM (`src/lib/cifratura.ts`, tabella `Chiave`), chiave da
  `HUB_CHIAVI_SECRET` con fallback su `HUB_SESSION_SECRET`. Link "Chiavi" nella
  topbar admin. Dettagli nel [README](README.md).
- **API di lettura per le altre app**: `GET /api/chiavi?progetto=<id>` con token
  di servizio (`x-api-key` o `Bearer`), salvati come SHA-256 (modello `TokenApi`,
  `src/lib/token-api.ts`), scope per progetto, generabili/revocabili da `/chiavi`.
  Il middleware **esclude `/api/*`**: quelle rotte si autenticano da sole.
- **SSO Hub→app** (`src/lib/sso.ts`, `src/app/vai/[app]`): token cifrato AES-GCM
  con `HUB_SSO_SECRET` condiviso, l'app di destinazione lo scambia su
  `/api/sso` e crea la propria sessione. Attivo su Finance (`sso: true`); lato
  Partner: `src/lib/sso.ts` + `src/app/api/sso/route.ts` (admin → accesso pieno,
  altri → sola lettura).
- **Catalogo passato a 11 app** (vedi §3), con `APP_URL_CONSEGNE` ora pubblico.

---

## 10. Verifiche già fatte sul sito pubblicato

- Login admin → vede tutte e 7 le app, ordine A→Z, URL di produzione, nessun
  `localhost` tranne Consegne (segnaposto).
- Permessi per-app: creato utente commerciale con **solo Finance** spuntata → al
  login vedeva **solo Finance**, niente link `/utenti`, `/utenti` bloccato con
  redirect. Utente di prova poi eliminato (sul db resta solo l'admin).
- Sicurezza: redirect a `/login` per home, `/utenti` e con cookie falsificato;
  password in hash `scrypt` (mai in chiaro nel db); isolamento schema `hub`.

---

## 11. Riferimento dettagliato: funzioni, "API", dati

> Il Hub **non è una REST API**: è un'app Next.js con **server action** (mutazioni)
> e **middleware** (protezione). La "superficie API" sono le server action più il
> contratto del cookie di sessione. Non consuma API esterne; le app che linka
> hanno le proprie (es. l'API a chiave di `deluxy-anagrafiche`).

### 11.1 Modello dati (Prisma — `prisma/schema.prisma`)

Un'unica tabella nello schema `hub`:

```
model Utente {
  id            String   @id @default(cuid())
  email         String   @unique         // salvata sempre in minuscolo
  nome          String
  passwordHash  String                    // "saltHex:hashHex" (scrypt)
  ruolo         String                    // admin | partner | commerciale
  appAbilitate  String[] @default([])     // id delle app visibili (ignorato per admin)
  attivo        Boolean  @default(true)   // false = non può accedere
  creatoIl      DateTime @default(now())
  ultimoAccesso DateTime?                 // aggiornato a ogni login
  @@index([ruolo])
}
```

### 11.2 Server action (`src/lib/actions.ts`) — la "API" del Hub

Tutte `"use server"`, ricevono `FormData`, rispondono con `redirect`. Chi le può
chiamare e cosa fanno:

| Azione | Chi | Input (campi FormData) | Effetto |
|---|---|---|---|
| `accedi` | pubblico | `email`, `password`, `da?` | Verifica `scrypt`. Se ok e utente `attivo`: aggiorna `ultimoAccesso`, crea cookie `dh_session` (30 gg), redirect a `da` (solo path interni) o `/`. Se no: `/login?errore=1`. **Messaggio unico** per email inesistente / password errata / utente disattivato (no user-enumeration). |
| `esci` | loggato | — | Cancella il cookie, redirect `/login`. |
| `creaUtente` | **admin** | `nome`, `email`, `password`(≥8), `ruolo`, `app` (ripetuto) | Valida, controlla email unica, hash password, crea `Utente` con `appAbilitate` = app spuntate valide. |
| `aggiornaUtente` | **admin** | `id`, `nome`, `ruolo`, `attivo`(checkbox), `password?`, `app`(ripetuto) | Aggiorna nome/ruolo/attivo/appAbilitate. Password cambiata **solo se fornita** (≥8). |
| `eliminaUtente` | **admin** | `id` | Elimina l'utente. **Blocca l'auto-eliminazione** (`id` == sessione). |
| `cambiaMiaPassword` | loggato | `attuale`, `nuova`(≥8) | Verifica la password attuale, poi la sostituisce. |

Guardie server (`src/lib/sessione-server.ts`), da chiamare nelle pagine/action:
`sessioneCorrente()` → `Sessione | null`; `richiediSessione()` → redirect `/login`
se assente; `richiediAdmin()` → redirect `/` se non admin. **La difesa è lato
server**: nascondere un bottone non basta, le action ricontrollano sempre.

### 11.3 Contratto del cookie di sessione (`src/lib/session.ts`)

- Cookie **`dh_session`**, `httpOnly`, `secure` in prod, `sameSite=lax`, durata
  **30 giorni** (`DURATA_SESSIONE_S`).
- Formato: `base64url(payloadJSON) + "." + base64url(HMAC_SHA256(payload, HUB_SESSION_SECRET))`.
- Payload `Sessione`: `{ uid, nome, ruolo, exp }` (`exp` in secondi epoch).
- `creaSessione({uid,nome,ruolo})` → token. `leggiSessione(token)` → `Sessione | null`:
  valida la firma **a tempo costante**, controlla `exp` e la forma. Un cookie
  manomesso o scaduto → `null` → il middleware rimanda al login.
- Cambiare **`HUB_SESSION_SECRET`** invalida **tutte** le sessioni (espulsione
  immediata di tutti).

### 11.4 Middleware (`src/middleware.ts`)

Gira sull'Edge, senza toccare il database. Per ogni richiesta (tranne
`login`, asset statici, `favicon.ico`): se `leggiSessione` è `null` → redirect
`/login?da=<path>` e cancella il cookie; se il path inizia con `/utenti` e il
ruolo non è `admin` → redirect `/`.

### 11.5 Catalogo app e permessi (`src/lib/apps.ts`, `permessi.ts`)

- Tipo `AppDeluxy = { id, nome, sottotitolo, descrizione, icona, url, ruoli, mobile? }`.
- `catalogoApp()` → `AppDeluxy[]`: costruisce le voci, **scarta quelle senza URL**
  (in prod: se manca `APP_URL_*` l'app sparisce), **ordina per nome A→Z**.
- `appPerRuolo(ruolo)` → default di preselezione in `/utenti` (NON decide chi vede).
- `appPerIds(ids)` → le app il cui id è nell'elenco (usato per la lista utente).
- `idAppValidi(ids)` → tiene solo gli id che esistono nel catalogo (validazione
  prima del salvataggio).
- `appVisibili(sessione)` (in `permessi.ts`) → **cosa vede uno in home**: admin =
  tutto il catalogo; altri = `appPerIds(utente.appAbilitate)`, letto dal **database
  a ogni load** (modifica immediata).

Per **aggiungere/rinominare** un'app vedi §7.3 e il README (rinominare = solo
`nome`, mai `id`/`APP_URL_*`).

### 11.6 Password (`src/lib/password.ts`)

`hashPassword(pw)` → `"saltHex:hashHex"` (scrypt, salt 16 byte, key 64 byte, solo
Node — niente dipendenze native su Windows). `verificaPassword(pw, salvata)` →
`bool`, confronto a tempo costante (`timingSafeEqual`). In chiaro le password non
esistono da nessuna parte.

### 11.7 Ruoli (`src/lib/ruoli.ts`)

`RUOLI = ["admin","partner","commerciale"]`; `RUOLO_INFO[ruolo] = {etichetta,
descrizione}`; `isRuolo(x)` type-guard. Elenco chiuso: aggiungere un ruolo qui.

### 11.8 Stack e comandi rapidi

- **Stack**: Next.js 15 (App Router, React 19, server action) · Prisma 6 ·
  Postgres (Supabase) · Deluxy Design System v1.0 (token in `src/app/tokens.css`).
- **Dev**: `npm run dev` (porta 3050). **Build**: `npm run build`
  (`prisma generate && next build`). **DB**: `npm run db:push`, `npm run db:seed`.
- **Deploy**: `npx vercel deploy --prod` da `deluxy-hub/`.
- **Typecheck**: `npx tsc --noEmit`.

### 11.9 Variabili d'ambiente (significato)

| Var | Serve a |
|---|---|
| `DATABASE_URL` | Postgres pooler **6543**, `?pgbouncer=true&connection_limit=1&schema=hub` |
| `DIRECT_URL` | Postgres diretta **5432**, `?schema=hub` (per `db push`/migrazioni) |
| `HUB_SESSION_SECRET` | firma il cookie; cambiarlo disconnette tutti |
| `APP_URL_SEARCH` `_PARTNER` `_ANAGRAFICHE` `_MAISON` `_SCOUT` `_MAIL` `_CONSEGNE` | dove puntano le icone (assente in prod = app nascosta) |
| `SEED_ADMIN_EMAIL` `SEED_ADMIN_PASSWORD` | primo admin creato da `db:seed` (solo primo avvio) |

### 11.10 Stato prodotto in una riga

Portale **live e completo** con 7 app catalogate (6 pubbliche + Consegne
segnaposto), login a database, permessi app-per-utente immediati, gestione utenti
admin. Manca: cambio password admin di default, URL pubblico per Consegne,
recupero password autonomo, popolamento degli utenti reali.
