# Deluxy Hub

Portale unico di accesso alle app Deluxy. L'utente entra con email e password e
trova nella home **solo le icone delle app abilitate per il suo ruolo**. Ogni app
resta autonoma: il Hub la linka, non la ingloba.

Stack: **Next.js 15** (App Router, server action) · **Prisma** · **SQLite** in
locale · Deluxy Design System v1.0. Porta di sviluppo: **3050**.

---

## 1. Ruoli e app

| Ruolo | Etichetta | App visibili |
|---|---|---|
| `admin` | Amministratore | Search Partners · Partner · Commerciale Scout **+ gestione utenti** |
| `partner` | Partner | Partner |
| `commerciale` | Commerciale | Search Partners · Commerciale Scout |

- I ruoli sono in [`src/lib/ruoli.ts`](src/lib/ruoli.ts).
- Il catalogo app e la mappa ruolo → app sono in [`src/lib/apps.ts`](src/lib/apps.ts).
- Le icone (SVG) sono in [`src/components/AppIcon.tsx`](src/components/AppIcon.tsx).

Gli URL delle app arrivano dall'ambiente (`APP_URL_SEARCH`, `APP_URL_PARTNER`,
`APP_URL_SCOUT`), così lo stesso codice punta a locale o produzione.

### Aggiungere un'app

1. Aggiungi il glifo in `AppIcon.tsx` e il suo nome al tipo `icona` in `apps.ts`.
2. Aggiungi la voce in `catalogoApp()` con `ruoli` ed `url` (da env).
3. Aggiungi la variabile in `.env.example`.

## 2. Avvio in locale

```bash
cd deluxy-hub
npm install
cp .env.example .env        # poi compila i valori (vedi sotto)
npx prisma db push          # crea prisma/dev.db
npm run db:seed             # crea il primo amministratore
npm run dev                 # http://localhost:3050
```

### Variabili d'ambiente

| Variabile | A cosa serve |
|---|---|
| `DATABASE_URL` | `file:./dev.db` in locale |
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
- Cambiare ruolo o disattivare un utente ha effetto **al prossimo login**: il
  ruolo viaggia nel cookie, che dura 30 giorni. Per un'espulsione immediata,
  cambiare `HUB_SESSION_SECRET`.

## 4. Pagine

| Rotta | Chi | Cosa |
|---|---|---|
| `/` | tutti | home con le icone delle app del proprio ruolo |
| `/login` | pubblica | email + password |
| `/profilo` | tutti | proprio ruolo, app abilitate, cambio password |
| `/utenti` | solo admin | crea, modifica ruolo, attiva/disattiva, elimina |

## 5. Andare in produzione

1. In `prisma/schema.prisma` cambia `provider = "sqlite"` in `"postgresql"` e
   aggiungi `directUrl = env("DIRECT_URL")` (stesso schema di `deluxy-partner`).
2. Su Vercel imposta `DATABASE_URL`, `DIRECT_URL`, `HUB_SESSION_SECRET` e i tre
   `APP_URL_*` di produzione.
3. `npx prisma db push` verso il database di produzione, poi lancia il seed una
   volta sola per creare l'admin.

## 6. Stato

**Fatto** — login con database, ruoli, home a icone filtrata, gestione utenti,
cambio password, protezione middleware. Build e typecheck puliti; login, filtro
ruoli, blocco `/utenti` per non-admin, cookie manomesso, password errata e utente
disattivato verificati sull'app in esecuzione.

**Manca** — deploy (gira solo in locale), `scout` punta al web di Expo
(`localhost:8081`) e non a una build pubblicata, nessun recupero password
autonomo (lo reimposta un admin da `/utenti`).
