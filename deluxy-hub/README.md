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
| `HUB_CHIAVI_SECRET` | **facoltativo.** cifra i valori della pagina `/chiavi` (AES-256-GCM, min 32 caratteri). Se assente si riusa `HUB_SESSION_SECRET`, così la cassaforte funziona senza configurare nulla. **Cambiarlo rende illeggibili le chiavi già salvate** |
| `APP_URL_SEARCH` / `APP_URL_PARTNER` / `APP_URL_SCOUT` | dove puntano le icone |
| `BUDGETS_API_KEY` | **facoltativa, solo ripiego.** chiave in **entrata** di Budgets: con questa `/utenti` legge squadre e persone da `GET /api/v1/team`. Il posto suo è la cassaforte `/chiavi` (progetto `deluxy-budgets`, va bene anche `budgets`), **che vince sull'ambiente** (scelta dell'utente, 24/08). Senza, la sezione spiega cosa manca |
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
| `/utenti` | solo admin | crea, sceglie app per utente, cambia ruolo/password, attiva/disattiva, elimina; in mezzo, **squadre e persone lette da Budgets** con lo stato dell'account di ognuno |
| `/chiavi` | solo admin | cassaforte dei segreti dei progetti: valori cifrati sul database, mascherati in lista, rivelabili uno alla volta |
| `/stato` | solo admin | semaforo server + database di ogni app del catalogo |
| `/cartellino` | tutti, **solo da computer** | il proprio cartellino: timbra, ore del mese, ferie/permessi/malattia, certificati |
| `/cartellino/gestione` | solo admin, **solo da computer** | richieste da approvare, chi è in sede adesso, ore e assenze di tutti |

### Squadre e persone in `/utenti` (da Budgets)

L'organico — squadre, responsabili, ruoli, persone — vive in **Budgets**, dove
nasce col budget del personale. `/utenti` lo legge da `GET /api/v1/team`
([`src/lib/organico.ts`](src/lib/organico.ts)) e lo mostra fra il form «Nuovo
utente» e la lista utenti, **senza tenersene una copia**: squadre e ruoli si
correggono in Budgets, qui si creano solo gli accessi.

- Ogni persona è confrontata con gli utenti del portale **per nome normalizzato**
  (minuscole, spazi compattati, accenti ignorati): se combacia si vede il badge
  dell'account (attivo/disattivato) con l'email; se no, il bottone **«Crea
  account»** porta al form con il nome già compilato.
- Chi non è in forza tutto l'anno ha accanto i suoi mesi («fino a giu», «da
  set»): un account per chi ha già finito non serve, e la pagina lo fa vedere.
- La chiave si cerca prima nella cassaforte `/chiavi` (progetto `deluxy-budgets`
  o `budgets`), poi nell'ambiente (`BUDGETS_API_KEY`) come ripiego: **quello che
  l'admin scrive in /chiavi comanda** (scelta dell'utente, 24/08). ⚠️ Vale solo
  la chiave in entrata **già attiva** di Budgets — una generata al momento dalla
  sua Configurazione non lo è. Senza chiave o con Budgets giù la sezione
  **spiega cosa manca** invece di sparire; il resto della pagina funziona
  comunque (timeout 6 s).
- Nella lista utenti, chi è riconosciuto nell'organico ha la sua squadra accanto
  all'email.

### Il Cartellino

Il registro delle presenze di chi lavora in Deluxy, dentro il portale invece che
su un foglio: si trova **in alto a destra** nella barra, accanto al proprio nome,
con un pallino verde quando si è dentro.

Cosa ci si fa:

- **Timbrare**: un bottone solo, che alterna entrata e uscita. Il verso non
  arriva dal form ma si deduce dall'ultima timbratura della giornata, così due
  click ravvicinati non aprono due turni.
- **Registrare una giornata a mano** (dimenticanza, cliente in sede): resta
  marcata `origine: "manuale"`, e nel riepilogo del mese si legge «contiene righe
  inserite a mano». Una timbratura non si modifica e non si cancella: le
  correzioni si aggiungono.
- **Chiedere ferie, permessi e trasferte**: nascono `in-attesa` e le decide un
  admin da `/cartellino/gestione`, con una nota che chi ha chiesto rivede sul
  proprio cartellino. Finché nessuno ha risposto si possono ritirare.
- **Registrare una malattia**: non è una richiesta, quindi nasce già
  `registrata`. Quello che conta è il **certificato**, che si allega subito o più
  tardi (il medico lo manda il giorno dopo: è la norma).
- **Caricare certificati**: PDF, JPEG o PNG fino a **5 MB**, con il numero di
  protocollo. Il file sta nel database (le funzioni Vercel non hanno un disco che
  resta) e si scarica da `/cartellino/certificato/<id>`, che lo dà **solo** a chi
  l'ha caricato e agli admin: è un dato sanitario, e l'indirizzo si può digitare.

#### Cosa vede e cosa manda l'amministratore

In `/cartellino/gestione` l'admin ha **le timbrature di tutti**, non solo i
totali: per ogni persona si apre il dettaglio giorno per giorno (turni, ore,
righe inserite a mano, assenze del periodo), mese per mese. Sotto c'è **«Manda
le presenze per email»**: si scrive un destinatario qualsiasi — il
commercialista, il consulente del lavoro, chi serve — e parte il riepilogo del
mese che si sta guardando, in HTML e in testo semplice. Il testo non è un
ripiego: è quello che si legge dal telefono, dove il Cartellino non si apre.

Sopra il bottone c'è l'**anteprima esatta** di ciò che parte — non una
descrizione, proprio il testo che verrà spedito. Schermata ed email nascono
dalla stessa funzione ([`src/lib/presenze.ts`](src/lib/presenze.ts)): se fossero
due conti separati, prima o poi direbbero numeri diversi.

Le credenziali di posta si prendono, in quest'ordine
([`src/lib/posta.ts`](src/lib/posta.ts)):

1. le **variabili d'ambiente** `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`,
   `SMTP_PASS`, `SMTP_FROM` — come nelle altre app Deluxy;
2. la **cassaforte `/chiavi`**, progetto `hub`, con gli stessi nomi.

L'ambiente vince sempre: un'installazione già configurata su Vercel non si
scavalca da una pagina web. Senza né l'una né l'altra la pagina lo dice e non
finge di spedire; se il server di posta rifiuta, l'admin vede **il motivo vero**
(«connect ECONNREFUSED …», «Invalid login …»), non un generico «non è partita».

⚠️ Il riepilogo contiene dati personali di tutti (ore, turni, motivi delle
assenze): il destinatario lo sceglie l'admin e non c'è una rubrica di indirizzi
fidati, perché cambia ogni volta. L'avviso sotto il form lo ricorda.

**Solo da computer.** Una timbratura fatta dal telefono potrebbe partire da
qualsiasi posto, quindi la sezione si apre solo da una postazione desktop. La
regola è applicata in tre punti: il middleware reindirizza a
`/cartellino/solo-desktop` (pagina che spiega, raggiungibile anche dal telefono,
altrimenti si girerebbe in tondo), ogni server action ripete il controllo con
`richiediDesktop()` — una action è comunque un POST che si può chiamare a mano —
e il CSS nasconde il bottone sotto i 900px. Il riconoscimento sta in
[`src/lib/dispositivo.ts`](src/lib/dispositivo.ts): `sec-ch-ua-mobile` quando c'è,
altrimenti l'user-agent. Non è una serratura a prova di scasso (un user-agent si
falsifica): è la regola aziendale resa esplicita.

**Fuso orario.** Il server gira in UTC, l'azienda timbra in Italia: ogni
timbratura salva anche il `giorno` («2026-08-05») già calcolato su `Europe/Rome`,
altrimenti un turno serale finirebbe nel giorno prima. Le conversioni ora↔istante
stanno in [`src/lib/cartellino.ts`](src/lib/cartellino.ts), che è codice puro
senza database. Un turno lasciato aperto in un giorno passato vale **zero minuti**
in più, non cento ore.

### La pagina `/chiavi`

Le chiavi API di tutti i progetti (OpenAI, HubSpot, Shopify, …) vivono in un
posto solo invece che sparse nei `.env`: si salvano con progetto + nome +
valore, il valore è cifrato **AES-256-GCM**
([`src/lib/cifratura.ts`](src/lib/cifratura.ts)) e sul database non c'è mai
nulla in chiaro (tabella `Chiave`, in lista si vedono solo gli ultimi 4
caratteri). Il middleware blocca la rotta ai non-admin e ogni server action
([`src/lib/chiavi-actions.ts`](src/lib/chiavi-actions.ts)) ricontrolla il ruolo.

La chiave di cifratura deriva da `HUB_CHIAVI_SECRET` se impostato, **altrimenti
da `HUB_SESSION_SECRET`** (già in produzione): così la cassaforte funziona senza
configurare nulla di nuovo su Vercel. Restando sul fallback, però, ruotare
`HUB_SESSION_SECRET` (che serve a disconnettere tutti) rende illeggibili le
chiavi salvate — per disaccoppiarle imposta un `HUB_CHIAVI_SECRET` dedicato.

#### API di lettura per le altre app

Le app Deluxy leggono le proprie chiavi via HTTP invece di tenerle nel `.env`:

```
GET /api/chiavi?progetto=deluxy-scout
Header: x-api-key: <token>        (oppure Authorization: Bearer <token>)
→ { "progetto": "deluxy-scout", "chiavi": { "OPENAI_API_KEY": "sk-…", … } }
```

Con `&nome=OPENAI_API_KEY` restituisce solo quella. I **token di servizio** si
generano dalla pagina `/chiavi` (sezione "Token di servizio"): il valore in
chiaro si vede una volta sola, sul database resta solo il suo SHA-256
([`src/lib/token-api.ts`](src/lib/token-api.ts), modello `TokenApi`). Ogni token
è limitato ai progetti che gli assegni (nessuno = tutti) e si revoca dalla lista.
L'app che consuma mette il token nel proprio ambiente (es. `HUB_CHIAVI_TOKEN`) e
chiama l'endpoint. La rotta `/api/*` è esclusa dal middleware di sessione perché
si autentica da sé; `route.ts` risponde con `Cache-Control: no-store`.

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
