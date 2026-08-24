# Deluxy Hub — Handoff per ripartire

> Documento per una nuova sessione (anche altro account Claude) che riprende il
> lavoro sul portale. Aggiornato: **24 agosto 2026**.
> Leggi anche [README.md](README.md) (dettagli completi) e la memoria del progetto.

> ⚠️ **La cartella di lavoro è `C:\Users\nicol\scoutwt\deluxy-hub` (branch
> `scout-ui`)**. Nel repo `C:\Users\nicol\app` esiste una copia `deluxy-hub/`
> **ferma al 26/07/2026**, con un handoff che sembra buono ma è vecchio: non
> lavorarci e non ripescarne file.

---

## 1. Cos'è, dov'è, com'è messo

**Deluxy Hub** è il portale unico di accesso alle app Deluxy: l'utente entra con
email+password e vede in home **solo le icone delle app abilitate per lui**. Ogni
app resta autonoma, il Hub la linka soltanto.

- **Codice**: `C:\Users\nicol\scoutwt\deluxy-hub\` (Next.js 15, App Router, server
  action, Prisma, Postgres/Supabase, Deluxy Design System). Porta dev: **3050**.
- **Produzione**: **https://deluxy-hub.vercel.app** — URL pubblico ma **non mostra
  nulla senza login**. Stato: **online e funzionante**.
- **Git**: repo radice `C:\Users\nicol\scoutwt`, branch **`scout-ui`**. Al
  5 agosto 2026 il working tree del Hub è pulito e tutto è su `origin/scout-ui`.
  ⚠️ Nel repo committano **più sessioni in parallelo**: prima di pushare `git
  fetch` e controlla il *contenuto* su origin, non solo lo SHA.

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

## 3. Le 16 app del portale

Ordine alfabetico A→Z (ordinamento fatto in `catalogoApp()`).

| App (etichetta) | URL | Chi la vede | Note |
|---|---|---|---|
| AI Mail | `APP_URL_MAIL` (dev 3070) | solo admin | |
| Anagrafiche | `APP_URL_ANAGRAFICHE` (dev 3060) | admin, commerciale | |
| Attività | `https://deluxy-tasks.vercel.app` | solo admin | default nel codice, override con `APP_URL_TASKS` (dev 3090), **`sso: true`** |
| Budgets | `https://deluxy-budgets.vercel.app` | admin, commerciale | default nel codice, override con `APP_URL_BUDGETS`, **`sso: true`** (i commerciali vedono solo le proposte: filtra Budgets, non il Hub) |
| Calendario | `https://deluxy-calendario.vercel.app` | solo admin | default nel codice, override con `APP_URL_CALENDARIO` (dev 3110), **`sso: true`** |
| Commerciale Scout | `https://deluxy-scout.vercel.app` | admin, commerciale | export web Expo |
| Consegne | `https://deluxy-delivery.vercel.app` | solo admin | |
| Finance | `https://deluxy-partner.vercel.app` | admin, partner | id interno = `partner`, **`sso: true`** |
| Maison | `https://deluxy-os.base44.app/` | tutti i ruoli | Deluxy OS su base44 |
| Marketing | `https://deluxy-marketing.vercel.app` | solo admin | default nel codice, override con `APP_URL_MARKETING` |
| Merchandising | `https://deluxy-merchandising.vercel.app` | admin, commerciale | default nel codice, override con `APP_URL_MERCHANDISING` |
| Customer Service | `https://deluxy-messaging.vercel.app` | admin, commerciale | id interno = `messaggi` (era "Messaggi": è cambiato solo il `nome`), override `APP_URL_MESSAGGI` |
| Ordini | `https://deluxy-orders.vercel.app` | solo admin | default nel codice, override con `APP_URL_ORDERS` |
| Ricerca fornitori | `https://search-deluxy.vercel.app` | admin, commerciale | id interno = `search` |
| Scripts | `https://deluxy-scripts.vercel.app` | solo admin | i testi pronti da mandare ai clienti, override `APP_URL_SCRIPTS`, **`sso: true`** |
| Transactions | `https://deluxy-transactions.vercel.app` | solo admin | autorizza i pagamenti; chi firma va aggiunto dentro l'app |

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
| [`src/middleware.ts`](src/middleware.ts) | blocca chi non è loggato; `/utenti`, `/chiavi`, `/stato` solo admin |
| [`src/components/AppIcon.tsx`](src/components/AppIcon.tsx) | glifi SVG delle app |
| [`src/app/{page,login,utenti,profilo}`](src/app) | home, login, gestione utenti, profilo |
| [`src/lib/organico.ts`](src/lib/organico.ts) | legge squadre e persone da Budgets (`GET /api/v1/team`; chiave dalla cassaforte, env come ripiego) per la sezione in `/utenti` |
| [`src/app/utenti/OrganicoBudgets.tsx`](src/app/utenti/OrganicoBudgets.tsx) | la sezione «Squadre e persone»: badge squadra, stato account per persona, bottone «Crea account» che precompila il form |
| [`src/lib/stato-servizi.ts`](src/lib/stato-servizi.ts) | interroga l'health di ogni app del catalogo (server + database) |
| [`src/app/stato`](src/app/stato) | pagina **Stato servizi** (admin) |
| [`src/app/api/health`](src/app/api/health) | health-check del Hub stesso |
| [`src/lib/cartellino.ts`](src/lib/cartellino.ts) | regole del cartellino: fuso Europe/Rome, coppie entrata/uscita, durate (codice puro, senza database) |
| [`src/lib/cartellino-actions.ts`](src/lib/cartellino-actions.ts) | timbra, registra giornata, chiedi assenza, carica certificato, approva/respingi |
| [`src/lib/dispositivo.ts`](src/lib/dispositivo.ts) · [`solo-desktop.ts`](src/lib/solo-desktop.ts) | riconoscimento telefono/tablet e guardia `richiediDesktop()` |
| [`src/app/cartellino`](src/app/cartellino) | il proprio cartellino, `gestione` (admin), `certificato/[id]` (download), `solo-desktop` (spiegazione) |

---

## 5-bis. Stato servizi (28 luglio 2026)

Pagina **`/stato`**, solo admin (link «Stato» nella barra in alto): per ogni app del
catalogo mostra due semafori — **server su/giù** e **database ok/ko** — con il motivo
del guasto, il link e la latenza. Si ricontrolla a ogni visita (`force-dynamic`,
`maxDuration = 60`), tutte le app in parallelo con timeout di 6 secondi ciascuna.

**Come fa il Hub a sapere del database altrui:** non lo sa e non deve saperlo. Ogni app
espone un health-check e il Hub lo legge. Convenzione (standard Deluxy):

```
GET /api/health  →  { ok: boolean, app: "<id>", database: boolean }
```

pubblico, `no-store`, dove `database` è il risultato di un `SELECT 1` vero — non basta
che il processo sia vivo: senza database l'app non serve a nulla. Chi ha già
`/api/v1/health` viene letto lì (ripiego automatico); chi non ha nulla risulta
«database non verificato», non «rotto».

**Tre cose da non rompere:**

1. **`/api/health` deve stare fuori dal middleware dell'app**, altrimenti risponde con
   la pagina di login e il Hub legge HTML al posto del JSON. È stato il primo intoppo:
   sei app su nove lo bloccavano. In alcune l'esclusione è nel `matcher`, in altre è un
   `return` anticipato — dipende da com'è scritto quel middleware.
2. **`ok: false` non è una risposta da scartare**: è un'app che dice di stare male, ed è
   esattamente ciò che questa pagina deve mostrare. Si ripiega solo quando manca il
   campo `ok` (cioè non è un health). Prima non era così e AI Mail, che era guasta,
   compariva come sana.
3. **Un database che legge ma non scrive è guasto lo stesso** (`scrivibile: false`):
   con Supabase capita quando il progetto va in sola lettura e l'app sembra viva mentre
   non salva più niente. La pagina lo segna rosso.

Stato al 28/07: verdi Hub, Finance, Budgets, Anagrafiche, Marketing, Merchandising,
Messaggi, Orders, Transactions. **Rossa AI Mail** (database non raggiungibile).
«Non verificato» per Calendario, Tasks (health senza campo `database`), Consegne,
Scout, Ricerca fornitori, Maison.

---

## 5-ter. Cartellino (5 agosto 2026)

Sezione **`/cartellino`**, in alto a destra nella barra (con il pallino verde
quando si è dentro), per **tutti** i ruoli: timbratura entrata/uscita, ore del
mese, giornate registrate a mano, richieste di ferie/permessi/trasferte,
malattia con certificato. Gli admin hanno anche **`/cartellino/gestione`**:
richieste da decidere, chi è in sede adesso, **le timbrature di tutti** (dettaglio
giorno per giorno, apribile persona per persona) e il **riepilogo del mese da
mandare per email** a un destinatario a scelta. Il manuale sta nel
[README](README.md#il-cartellino).

**La posta** (`src/lib/posta.ts`, nodemailer come Transactions e Finance): le
credenziali arrivano dalle variabili d'ambiente `SMTP_HOST/PORT/USER/PASS/FROM`
oppure, se mancano, dalla **cassaforte `/chiavi` progetto `hub`** con gli stessi
nomi — così si configura la posta senza toccare Vercel e senza far passare la
password da nessuna parte. L'ambiente vince sempre. **Al 5/08/2026 non è
configurata né in un modo né nell'altro**: la pagina lo dice e propone di
copiare l'anteprima. Il testo dell'email e la schermata escono dalla stessa
funzione (`src/lib/presenze.ts`): non duplicare quel conto.

**Si usa solo da computer** — una timbratura dal telefono potrebbe partire da
ovunque. La regola è scritta in tre punti, non uno: middleware (redirect a
`/cartellino/solo-desktop`), `richiediDesktop()` dentro ogni pagina e ogni server
action, CSS che nasconde il bottone sotto i 900px. Verificato con user-agent di
iPhone, Android e iPad: `307` verso la pagina di spiegazione, anche sulle POST.

**Dati** (schema `hub`): `Timbratura`, `Assenza`, `Certificato` — create con
`npx prisma db push` il 5/08/2026 (solo `CREATE TABLE`, nessuna tabella esistente
toccata). Legate a `Utente` con cascata: cancellando una persona sparisce il suo
cartellino. I certificati (PDF/JPEG/PNG, max 5 MB) stanno **nel database**: le
funzioni Vercel non hanno un disco che resta. `Certificato.dati` non va mai letto
in una query di elenco — solo nella rotta di download, che verifica prima chi
chiede (proprietario o admin).

**Quattro cose da non rompere:**

1. **Il fuso**: il server è in UTC, si timbra in Italia. Ogni timbratura salva il
   `giorno` già calcolato su `Europe/Rome`; senza, un turno serale finisce nel
   giorno prima. Le conversioni stanno in `cartellino.ts`.
2. **Il `value` di un bottone non arriva a una server action**: React costruisce
   la FormData dal form, non dal submitter. «Approva» e «Respingi» sono due
   `formAction` diverse sullo stesso form — non un campo `decisione`. È stato un
   bug vero, trovato provando la pagina.
3. **Il verso della timbratura non si accetta dal client**: si guarda l'ultima
   riga del giorno e si fa il gesto opposto, altrimenti due click aprono due turni.
4. **Un turno aperto di un giorno passato vale zero minuti**, non le ore fino ad
   adesso (`minutiLavorati(..., null)`).

Il limite del corpo delle server action è alzato a 6 MB in `next.config.ts`:
il default è 1 MB e un certificato scansionato lo supera.

## 5-quater. Squadre e persone in `/utenti` (24 agosto 2026)

`/utenti` mostra l'**organico letto da Budgets** (`GET /api/v1/team`, rotta nata
apposta per il Hub): squadre con responsabile, persone con ruolo/tipo/maison, e
accanto a ognuna lo stato dell'accesso al portale — badge verde/rosso se il nome
(normalizzato: minuscole, spazi, accenti) combacia con un utente, altrimenti
**«Crea account»** che apre il form «Nuovo utente» col nome precompilato
(`?nome=…#nuovo-utente`). Chi non è in forza tutto l'anno ha accanto i suoi mesi
(«fino a giu», «da set»). Nella lista utenti la squadra compare accanto
all'email. Il Hub **non salva nulla** dell'organico: la fonte resta Budgets.

La chiave è la **chiave in entrata di Budgets** (la stessa che usa Finance):
si legge **prima dalla cassaforte `/chiavi`** (progetto `deluxy-budgets`;
accettato anche `budgets`; nome canonico `BUDGETS_API_KEY`, o nome libero se il
progetto ha una voce sola) e **poi, come ripiego, dall'ambiente** — ordine
INVERSO rispetto a `posta.ts`, deciso dall'utente il 24/08 («fai che vinca non
su Vercel ma chiave che inserisco su app»). Senza chiave, o con Budgets giù, la
sezione spiega cosa manca e il resto della pagina vive lo stesso (timeout 6 s).
Stati verificati sul dev server contro l'API di produzione: organico completo
(11 persone, 2 squadre + 4 senza squadra), senza chiave, 401.

Il classificatore dei permessi **blocca ogni scrittura automatica della
chiave** (cassaforte via script, `vercel env add`): il valore lo incolla
l'utente in **`/chiavi` → progetto `deluxy-budgets` → `BUDGETS_API_KEY`**
(effetto immediato, niente redeploy). Il valore giusto (**56 caratteri**) sta
in `deluxy-budgets/.env` e `deluxy-partner/.env` locali. ⚠️ Le env `Sensitive`
**non si rileggono** da Vercel: `vercel env pull` restituisce il segnaposto
`[SENSITIVE]`, non il valore.

**Trappole già pagate qui (24/08/2026):**
- Il primo incollaggio era la **password dell'app** (`BUDGETS_APP_PASSWORD`,
  16 caratteri) al posto della chiave API — «la chiave di budget» le confonde.
  Si riconosce **dal suffisso in lista** (ultimi 4 in chiaro) confrontato con
  la coda del valore in `deluxy-budgets/.env`, e dalla sezione che dice
  «Budgets risponde 401». La riga si corregge da «Modifica» senza ricrearla.
- Il nome era **«Budget Key»** (in cassaforte i nomi sono spesso umani: «Mail»,
  «Richiesta Linee Servizi»): la riga è stata rinominata a database e da questo
  commit il codice **tollera il nome libero se il progetto ha una voce sola**;
  con più voci vale solo il nome canonico `BUDGETS_API_KEY`.
- Una chiave **«generata» dalla Configurazione di Budgets non diventa quella
  attiva**: in produzione `chiave()` legge prima l'**env Sensitive di Vercel**
  (che vince sempre, ed è la stessa che manda Finance) e la Configurazione
  scrive a database solo con `APP_SECRET`, che in prod manca. Il secondo
  tentativo dell'utente (24/08, riga «budgets / Budget», suffisso `L484`, poi
  rigenerata: `DYt4`) era proprio una chiave generata così: inerte, Budgets
  risponde 401 comunque.
  **La chiave valida è UNA**: quella dell'env, copia leggibile nei `.env`
  locali di `deluxy-budgets` e `deluxy-partner` (suffisso `376f`).

🔴 **Stato della cassaforte al 24/08 ~12:10 — la chiave giusta manca ancora.**
In `/chiavi` ci sono due righe legate a Budgets, nessuna delle due valida:
`deluxy-budgets / BUDGETS_APP_PASSWORD` (`••••1w8i`, la password dell'app,
rietichettata col suo nome vero, da tenere o cancellare) e `budgets / Budget`
(`••••DYt4`, chiave generata inerte, si può cancellare). Perché la sezione
di `/utenti` si accenda va creata la voce **`deluxy-budgets` /
`BUDGETS_API_KEY`** incollando la chiave da `deluxy-budgets/.env`: a
salvataggio fatto la lista deve mostrarla come **`••••376f`** — è il
controllo a vista che stavolta è quella giusta. Effetto immediato, senza
redeploy.
- **Gli orari di `/chiavi` e dell'«ultimo accesso» in `/utenti` erano UTC**
  (segnalato dall'utente guardando «aggiornata 09:08» alle 11): mancava
  `timeZone: "Europe/Rome"` nei due `dataIt()` — il Cartellino invece lo aveva
  ovunque. È [[trappola-periodi-fuso-server]] in versione «solo visualizzazione»;
  provato con `TZ=UTC` (09:08 → 11:08).

## 6. Deploy e ambiente (Vercel)

- Progetto: **`deluxy/deluxy-hub`** (CLI già autenticata come `donatodnicolo-gif`).
- Deploy produzione: dalla cartella `deluxy-hub`, `npx vercel deploy --prod`.
- **[`vercel.json`](vercel.json): `"regions": ["fra1"]`** — le funzioni devono
  girare a Francoforte, accanto al database (vedi trappola 6 in §7). Non togliere.
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
6. **Funzioni lontane dal database** (trovato il 17/08/2026): senza `vercel.json`
   Vercel piazza le funzioni a **Washington (`iad1`)** mentre il Postgres Supabase
   è a **Francoforte**, e ogni query si paga un andata-e-ritorno oceanico. Si
   riconosce dall'header `X-Vercel-Id: fra1::iad1` (il primo è il punto d'ingresso,
   il **secondo** è dove gira la funzione: devono coincidere). Corretto con
   `{"regions":["fra1"]}`: `/api/health` (login + `SELECT 1`) è passato da
   **~0,92-1,08 s a ~0,33-0,47 s** a caldo, misurato sul sito pubblicato prima e
   dopo il deploy. Attenzione: un `vercel.json` nuovo vale solo dal deployment
   successivo, e i tempi a freddo (~1,0-1,5 s) sono cold start, non region.

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
- **SSO su Finance**: il 26/07/2026 `HUB_SSO_SECRET` è stato impostato su **Hub** e
  **Tasks** (SSO attivo), ma **non** su `deluxy-partner`: aprendo Finance dal Hub
  il token non si apre e Partner chiede il suo login, come prima. Per accenderlo
  serve lo stesso segreto nelle env di Partner + redeploy — **prima** però va
  impostata `PARTNER_APP_PASSWORD_READONLY`, altrimenti i ruoli non-admin
  entrerebbero con l'accesso pieno (vedi `deluxy-partner/src/app/api/sso/route.ts`).
- **URL pubblici**: dal 26/07 anche Calendario punta alla produzione. Restano con
  ripiego su `localhost` solo Finance (3040), Anagrafiche (3060) e AI Mail (3070),
  che in produzione prendono comunque l'`APP_URL_*` da Vercel.
- **Cartellino**: da decidere se serve un tetto di ferie annuo per persona —
  oggi il Hub conta i giorni chiesti, non li scala da un monte ore.
- **Posta del Hub non configurata**: perché l'invio delle presenze funzioni
  servono `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` (più `SMTP_PORT`/`SMTP_FROM` se
  diversi dai default) nella cassaforte `/chiavi` sotto il progetto `hub`, oppure
  come variabili d'ambiente su Vercel. Finché mancano, la pagina lo dichiara e
  non prova a spedire.
- **Nessun recupero password autonomo**: lo reimposta un admin da `/utenti`.
- **Creare gli utenti veri** del team da `/utenti` (finora esiste solo l'admin).
  Dal 24/08 la pagina mostra squadre e persone lette da Budgets con «Crea
  account» precompilato (§5-quater) — ma serve prima la `BUDGETS_API_KEY`, che
  in produzione **manca ancora**.
- **`deluxy-acquisti` non è nel catalogo**: l'app esiste nel repo (porta 3100) ma
  non ha una tessera in `apps.ts` né un `APP_URL_ACQUISTI`, quindi dal portale non
  si raggiunge. Da aggiungere quando avrà un URL pubblico.
- **Il cookie non viene ricontrollato sul database**: il middleware valida solo la
  firma, non che l'utente esista ancora e sia `attivo`. Chi viene eliminato o
  disattivato continua a entrare col cookie che ha già, fino alla scadenza (30
  giorni). L'unica espulsione immediata oggi è cambiare `HUB_SESSION_SECRET`, che
  però butta fuori tutti. Non ancora affrontato.

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
  `/api/sso` e crea la propria sessione. Dichiarato su Finance e su **Attività**
  (`sso: true`); lato Partner: `src/lib/sso.ts` + `src/app/api/sso/route.ts`
  (admin → accesso pieno, altri → sola lettura).
- **SSO acceso su Attività (26/07/2026)**: il token porta anche l'**email**
  (`PayloadSso.email`, letta da `Utente` in `/vai/[app]`) perché Tasks identifica
  le persone per email e non per id del Hub. `HUB_SSO_SECRET` impostato su Hub e
  Tasks: dal portale si entra in Attività senza rifare il login.
- **SSO acceso anche su Calendario (26/07/2026)**: stessa ricetta di Attività
  (identità = email). Lato app: `deluxy-calendario/src/lib/sso.ts` +
  `src/app/api/sso/route.ts`, con `HUB_SSO_SECRET` (stesso valore) nelle env di
  produzione del progetto Vercel `deluxy-calendario`. Nota: sul Calendario il
  segreto è impostato **solo su Production**, non su Preview.
- **Catalogo passato a 11 app** (vedi §3), con `APP_URL_CONSEGNE` ora pubblico.

---

## 10. Verifiche già fatte sul sito pubblicato

- Login admin → vede tutte le app del catalogo, ordine A→Z, URL di produzione
  (verifica fatta quando le app erano 7: allora l'unico `localhost` era Consegne,
  oggi Consegne è pubblica e il ripiego locale resta solo su Finance, Anagrafiche
  e AI Mail — vedi §3).
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

**Sei tabelle** nello schema `hub`: `Utente`, `Chiave` e `TokenApi` (cassaforte,
§9-bis) più `Timbratura`, `Assenza` e `Certificato` (cartellino, §5-ter). Quella
centrale è `Utente`, a cui le altre sono legate con cascata:

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
| `HUB_CHIAVI_SECRET` | cifra i segreti della cassaforte `/chiavi` (ripiego su `HUB_SESSION_SECRET`) |
| `HUB_SSO_SECRET` | cifra il token SSO Hub→app; **stesso valore** nell'app di destinazione, min 32 caratteri. Assente = l'app chiede il suo login |
| `HUB_KEYS_TOKEN` | token con cui il Hub legge la *propria* cassaforte via API |
| `SMTP_HOST` `_PORT` `_USER` `_PASS` `_FROM` | invio del riepilogo presenze; in alternativa nella cassaforte `/chiavi`, progetto `hub` (l'ambiente vince) |
| `BUDGETS_API_KEY` | **solo ripiego** per squadre e persone in `/utenti`: il posto della chiave è la cassaforte `/chiavi`, progetto `deluxy-budgets`, **che vince sull'ambiente** (scelta utente 24/08, vedi §5-quater). Assente in produzione, ed è previsto così |
| `APP_URL_SEARCH` `_PARTNER` `_ANAGRAFICHE` `_MAISON` `_SCOUT` `_MAIL` `_CONSEGNE` `_TASKS` `_CALENDARIO` `_BUDGETS` `_MARKETING` `_MERCHANDISING` `_MESSAGGI` `_ORDERS` `_TRANSACTIONS` `_SCRIPTS` | dove puntano le icone (assente in prod = app nascosta, tranne le eccezioni con ripiego `localhost` in §3) |
| `SEED_ADMIN_EMAIL` `SEED_ADMIN_PASSWORD` | primo admin creato da `db:seed` (solo primo avvio) |

### 11.10 Stato prodotto in una riga

Portale **live** con **16 app** catalogate (§3), login a database, permessi
app-per-utente immediati, gestione utenti admin, cassaforte dei segreti con API a
token, pagina Stato servizi, cartellino presenze/ferie/malattia (solo da computer).
Manca: cambio password admin di default, SSO su Finance, posta SMTP non
configurata, recupero password autonomo, popolamento degli utenti reali, l'app **Acquisti**
non ancora nel catalogo (vedi §9).
