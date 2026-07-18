# Deluxy Hub — Handoff per ripartire

> Documento per una nuova sessione (anche altro account Claude) che riprende il
> lavoro sul portale. Aggiornato: **18 luglio 2026**, commit `6870236`.
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

## 3. Le 7 app del portale

Ordine alfabetico A→Z (ordinamento fatto in `catalogoApp()`).

| App (etichetta) | URL produzione | Chi la vede | Note |
|---|---|---|---|
| AI Mail | `https://deluxy-mail.vercel.app/` | solo admin | |
| Anagrafiche | `https://deluxy-anagrafiche.vercel.app` | admin, commerciale | |
| Commerciale Scout | `https://deluxy-scout.vercel.app/lista` | admin, commerciale | export web Expo |
| Consegne | `http://localhost:4200/deliveries` | solo admin | ⚠️ **segnaposto**, non pubblica |
| Finance | `https://deluxy-partner.vercel.app` | admin, partner | id interno = `partner` |
| Maison | `https://deluxy-os.base44.app/` | tutti i ruoli | Deluxy OS su base44 |
| Ricerca fornitori | `https://search-deluxy.vercel.app` | admin, commerciale | id interno = `search` |

- **Consegne** è l'unica ancora su `localhost`: quando la piattaforma avrà un
  URL pubblico, imposta `APP_URL_CONSEGNE` su Vercel **e ripubblica**.
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
- **Consegne** non ha URL pubblico: aggiornare `APP_URL_CONSEGNE` + redeploy quando
  la piattaforma sarà pubblicata.
- **Nessun recupero password autonomo**: lo reimposta un admin da `/utenti`.
- **Creare gli utenti veri** del team da `/utenti` (finora esiste solo l'admin).
- Eventuale **push** dell'ultimo commit su `origin/scout-ui` (l'utente non l'ha
  ancora chiesto; branch condiviso con un'altra sessione, valutare prima).

---

## 10. Verifiche già fatte sul sito pubblicato

- Login admin → vede tutte e 7 le app, ordine A→Z, URL di produzione, nessun
  `localhost` tranne Consegne (segnaposto).
- Permessi per-app: creato utente commerciale con **solo Finance** spuntata → al
  login vedeva **solo Finance**, niente link `/utenti`, `/utenti` bloccato con
  redirect. Utente di prova poi eliminato (sul db resta solo l'admin).
- Sicurezza: redirect a `/login` per home, `/utenti` e con cookie falsificato;
  password in hash `scrypt` (mai in chiaro nel db); isolamento schema `hub`.
