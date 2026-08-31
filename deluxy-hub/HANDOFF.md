# Deluxy Hub — Handoff per ripartire

> Documento per una nuova sessione (anche altro account Claude) che riprende il
> lavoro sul portale. Aggiornato: **30 agosto 2026**.
> Leggi anche [README.md](README.md) (dettagli completi) e la memoria del progetto.

> ⚠️ **La cartella di lavoro è `C:\Users\nicol\scoutwt\deluxy-hub` (branch
> `scout-ui`)**. Nel repo `C:\Users\nicol\app` esiste una copia `deluxy-hub/`
> **ferma al 26/07/2026**, con un handoff che sembra buono ma è vecchio: non
> lavorarci e non ripescarne file.

---

## 0-bis. Manuale delle funzionalità (OBBLIGATORIO — 27/08/2026)

Il Hub ha un **manuale visivo** delle sue funzionalità: [`docs/manuale-funzionalita.html`](docs/manuale-funzionalita.html), lo stesso file pubblicato come **Artifact** su https://claude.ai/code/artifact/78d07a3e-31b7-47e8-aa2e-1b15b1ddd689 (guida per chi entra nel team: cos'è il Hub, login, home, ruoli, le 19 app, cartellino, funzioni admin, come le app si parlano, sicurezza in parole semplici).

🔴 **Regola dell'utente**: d'ora in poi **ogni funzionalità nuova o modificata va scritta in questo manuale nello stesso giro di lavoro** — si aggiorna il file `docs/manuale-funzionalita.html` (versionato col commit della feature) e **si ripubblica l'Artifact allo STESSO indirizzo** (dalla stessa conversazione: ripubblicare lo stesso path; da un'altra conversazione: passare l'`url` dell'artifact). Un file solo, versionato + artifact. Se una schermata non corrisponde al manuale, ha ragione la schermata: il manuale va corretto.


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
| Password admin | **cambiata dall'utente** — quella temporanea di un tempo (`deluxy2026`) **non vale più** (verificato contro l'hash a database il 26/08/2026) |

✅ La password temporanea è stata cambiata: la conosce solo l'utente. Se serve
entrare per una verifica, **non** provare a recuperarla — si crea un utente di
prova via Prisma (ruolo `commerciale`, password usa-e-getta) e **si cancella a
fine verifica** (la cascata porta via il suo cartellino). Nessun recupero
password autonomo: le password le reimposta un admin da `/utenti`.

---

## 3. Le 19 app del portale (18 visibili in produzione)

Ordine alfabetico A→Z (ordinamento fatto in `catalogoApp()`). **Fondo** è a
catalogo ma in produzione **non compare**: ha solo il ripiego `localhost:3180`
e senza `APP_URL_FONDO` la tessera sparisce (regola generale qui sotto).

| App (etichetta) | URL | Chi la vede | Note |
|---|---|---|---|
| AI Mail | `APP_URL_MAIL` (dev 3070) | solo admin | |
| Anagrafiche | `APP_URL_ANAGRAFICHE` (dev 3060) | admin, commerciale | |
| Attività | `https://deluxy-tasks.vercel.app` | solo admin | default nel codice, override con `APP_URL_TASKS` (dev 3090), **`sso: true`** |
| Budgets | `https://deluxy-budgets.vercel.app` | admin, commerciale | default nel codice, override con `APP_URL_BUDGETS`, **`sso: true`** (i commerciali vedono solo le proposte: filtra Budgets, non il Hub) |
| Calendario | `https://deluxy-calendario.vercel.app` | solo admin | default nel codice, override con `APP_URL_CALENDARIO` (dev 3110), **`sso: true`** |
| Commerciale Scout | `https://deluxy-scout.vercel.app` | admin, commerciale | export web Expo |
| Consegne | `https://deluxy-delivery.vercel.app` | solo admin | |
| CRM | `https://deluxy-crm.vercel.app` | admin, commerciale | il libro dei clienti D2C, override `APP_URL_CRM`, **`sso: true`** |
| Finance | `https://deluxy-partner.vercel.app` | admin, partner | id interno = `partner`, **`sso: true`** |
| Fondo | `APP_URL_FONDO` (dev 3180) | solo admin | **nascosta in produzione**: manca `APP_URL_FONDO` (l'app non è pubblicata) |
| Maison | `https://deluxy-os.base44.app/` | tutti i ruoli | Deluxy OS su base44 |
| Marketing | `https://deluxy-marketing.vercel.app` | solo admin | default nel codice, override con `APP_URL_MARKETING` |
| Merchandising | `https://deluxy-merchandising.vercel.app` | admin, commerciale | default nel codice, override con `APP_URL_MERCHANDISING` |
| Customer Service | `https://deluxy-messaging.vercel.app` | admin, commerciale | id interno = `messaggi` (era "Messaggi": è cambiato solo il `nome`), override `APP_URL_MESSAGGI` |
| Ordini | `https://deluxy-orders.vercel.app` | solo admin | default nel codice, override con `APP_URL_ORDERS` |
| Personale | `https://deluxy-personale.vercel.app` | solo admin (dentro ci sono gli stipendi) | override `APP_URL_PERSONALE` (impostata in prod il 24/08), **`sso: true`** |
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
| [`src/components/GrigliaApp.tsx`](src/components/GrigliaApp.tsx) | le tessere della home **con la ricerca** (client: ci vive lo stato del filtro) |
| [`src/components/NavLink.tsx`](src/components/NavLink.tsx) | link della barra che sa se è la pagina corrente (`aria-current`, classe `attivo`) |
| [`src/app/utenti/RigaUtente.tsx`](src/app/utenti/RigaUtente.tsx) | riga della tabella utenti: il pannello «Modifica» sta in una **riga sua**, non nella cella |
| [`src/app/utenti/ScelteApp.tsx`](src/app/utenti/ScelteApp.tsx) | le spunte delle app: l'elenco arriva per **props** (`catalogoApp()` legge `process.env` e non attraversa il confine client) |
| [`src/app/{error,not-found,loading}.tsx`](src/app) | la rete di sicurezza: imprevisti, indirizzi sbagliati e attese (§5-quinquies) |
| [`src/lib/organico.ts`](src/lib/organico.ts) | legge squadre e persone da Budgets (`GET /api/v1/team`; chiave dalla cassaforte, env come ripiego) per la sezione in `/utenti` |
| [`src/app/utenti/OrganicoBudgets.tsx`](src/app/utenti/OrganicoBudgets.tsx) | la sezione «Squadre e persone»: badge squadra, stato account per persona, bottone «Crea account» che precompila il form |
| [`src/lib/stato-servizi.ts`](src/lib/stato-servizi.ts) | interroga l'health di ogni app del catalogo (server + database) |
| [`src/app/stato`](src/app/stato) | pagina **Stato servizi** (admin) |
| [`src/app/api/health`](src/app/api/health) | health-check del Hub stesso |
| [`src/lib/cartellino.ts`](src/lib/cartellino.ts) | regole del cartellino: fuso Europe/Rome, coppie entrata/uscita, durate (codice puro, senza database) |
| [`src/lib/cartellino-actions.ts`](src/lib/cartellino-actions.ts) | timbra, registra giornata, chiedi assenza, carica certificato, approva/respingi |
| [`src/lib/dispositivo.ts`](src/lib/dispositivo.ts) · [`solo-desktop.ts`](src/lib/solo-desktop.ts) | riconoscimento telefono/tablet e guardia `richiediDesktop()` |
| [`src/app/cartellino`](src/app/cartellino) | il proprio cartellino, `gestione` (admin), `certificato/[id]` (download), `solo-desktop` (spiegazione) |
| [`src/app/api/presenze/route.ts`](src/app/api/presenze/route.ts) | `GET /api/presenze?mese=YYYY-MM` — il cartellino del mese per le altre app (vedi §5-ter, in fondo) |
| [`src/components/Sidebar.tsx`](src/components/Sidebar.tsx) | il menu laterale: tre gruppi (Portale, Presenze, Amministrazione), voce attiva da `usePathname`, stato del cartellino in parole (vedi §5-quinquies) |
| [`src/components/ToggleSidebar.tsx`](src/components/ToggleSidebar.tsx) | il bottone del menu: su desktop collassa la colonna (preferenza in localStorage), sotto 800px apre il cassetto da sinistra |
| [`scripts/emetti-token.mjs`](scripts/emetti-token.mjs) | emette un token di servizio da riga di comando (stessa cosa di `/chiavi` → Token di servizio) |

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

**Cinque cose da non rompere:**

0. **L'orologio grande è ancorato al SERVER, non al computer di chi guarda**
   (25/08/2026): un PC con l'ora di sistema sbagliata mostrava le 08:32 alle
   09:30, proprio sopra «Timbra entrata» — mentre le timbrature si scrivono
   con l'ora del server. `Orologio` riceve `oraServer` dalla pagina, misura lo
   scarto UNA volta al montaggio e mostra «ora del PC + scarto»; oltre i 3
   minuti di scarto lo dichiara sotto l'orologio. Non tornare a `new Date()`
   puro: sembrerebbe uguale su ogni macchina sana e mentirebbe su quelle rotte.
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
5. **La timbratura arretrata pretende la motivazione (26/08/2026)**: si può
   registrare a mano un giorno passato, ma se `giorno < oggi` la server action
   rifiuta senza `note` (`errore=motivo-arretrata`). Il form (`FormGiornata.tsx`,
   client) anticipa la regola col `required` dinamico, ma la difesa vera sta in
   `registraGiornata`. Le motivazioni delle righe a mano ora si **vedono**
   (`Giornata.motivi` in `presenze.ts`): nel proprio mese, nella gestione admin
   e nel rapporto email — l'obbligo serve a chi controlla, non al database.

Il limite del corpo delle server action è alzato a 6 MB in `next.config.ts`:
il default è 1 MB e un certificato scansionato lo supera.

**Il cartellino del mese si legge anche via API (26/08/2026, commit
`c59c2834`, live)**: `GET /api/presenze?mese=YYYY-MM[&nota=…]` risponde
`{ riepilogo, rapporto: { oggetto, testo, html } }` — il rapporto è già pronto
da spedire. Nata per **deluxy-personale**, che da lì manda il rapporto al
commercialista per le buste paga; il Hub resta il **proprietario** di
timbrature e assenze, qui si legge soltanto. I numeri escono dalle **stesse
funzioni** della schermata di gestione e dell'email (`riepilogoMese` +
`rapportoPresenze` in `presenze.ts`): non duplicare quel conto. Auth: token di
servizio (`x-api-key`/`Bearer`) come `/api/chiavi`; un token limitato per
progetti deve comprendere **`personale`**. Un token si emette da `/chiavi` o
con `node scripts/emetti-token.mjs <nome-app> [progetti]`.

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
- Per buona parte del 24/08 una chiave **«generata» da Budgets non diventava
  quella attiva** (l'env Sensitive vinceva su tutto), e i primi due tentativi
  dell'utente con chiavi generate (`L484`, poi `DYt4`) presero 401. ⭐ **Alle
  11:27 un'altra sessione ha cambiato la regola**: commit `c04d13c7`, Budgets
  **emette chiavi per app** (`ChiaveEmessa`: hash a database, scope
  lettura/scrittura deciso dal metodo HTTP, revocabili una a una, `ultimoUso`
  tracciato) e le accetta accanto alla vecchia `BUDGETS_API_KEY` condivisa,
  che resta valida **solo in lettura**. Da quel deploy le chiavi generate
  dall'utente («App Hub» e «Test», mai revocate) **erano valide davvero** —
  la lezione va quindi a metà: prima aveva ragione il codice, dopo l'utente.

✅ **Chiuso alle ~12:15 del 24/08 — la sezione di `/utenti` è viva.** L'utente
ha incollato la chiave condivisa (suffisso `376f`) nella riga «budgets /
Budget» e la riga è stata rinominata **`BUDGETS_API_KEY`** (solo metadati):
nome canonico + valore valido, provato con **200** su `/api/v1/team` anche
sotto la nuova autenticazione. In `/chiavi` resta
`deluxy-budgets / BUDGETS_APP_PASSWORD` (`••••1w8i`, la password dell'app
rietichettata col suo nome vero): non dà fastidio, si può cancellare.
Volendo passare a una **chiave emessa** (revocabile, con `ultimoUso`): se ne
genera una in Budgets → Configurazione → Chiavi con scope «lettura» e si
aggiorna la voce `BUDGETS_API_KEY` in `/chiavi` — le vecchie emesse mai usate
(«App Hub», «Test») si possono revocare da là.
- **Gli orari di `/chiavi` e dell'«ultimo accesso» in `/utenti` erano UTC**
  (segnalato dall'utente guardando «aggiornata 09:08» alle 11): mancava
  `timeZone: "Europe/Rome"` nei due `dataIt()` — il Cartellino invece lo aveva
  ovunque. È [[trappola-periodi-fuso-server]] in versione «solo visualizzazione»;
  provato con `TZ=UTC` (09:08 → 11:08).


## 5-quinquies. Revisione di layout e UX (27 agosto 2026)

Tre revisori indipendenti — uno sul layout desktop, uno sul mobile, uno ostile
incaricato di **demolire** i primi due — hanno misurato il portale col DOM
(niente impressioni: px, colonne, scrollWidth, aree toccabili). Bilancio:
**19 reperti confermati, 8 ridimensionati, 1 caduto**. Le correzioni sono tutte
in questo commit. Cosa e' cambiato e **perche'**, perche' non venga disfatto:

1. **La barra in alto va a capo** (`.topbar-actions { flex-wrap: wrap }` + media
   query a 720px). Era il difetto n.1: un flex che non andava a capo misurava
   501px dentro 375, e il browser **rimpiccioliva l'intera pagina al 59%** (la
   descrizione da 13.5px si leggeva a ~8px). ⚠️ Le voci restano **tutte**: si
   stringe la cornice, non si riduce il loro numero.
2. **Il marchio non si spezza piu'** (`white-space: nowrap` + `.brand{min-width:0}`):
   compresso a 96px, «Deluxy Hub» andava su 2 righe e il sottotitolo su 3,
   portando la barra a **122px per ogni ruolo**, anche dove non c'era eccedenza.
3. **Campi a 16px sotto i 900px**: sotto quella soglia iOS ingrandisce da solo
   al primo tocco e non torna indietro. Vale anche sul **login**, cioe' sul
   primissimo gesto di chiunque.
4. **Aree toccabili a 44px** (`min-height` sui `.btn` su schermo stretto): erano
   35-38px. Il metro non e' teorico — l'«Entra» del login, progettato apposta,
   misurava gia' 44.
5. **Contenuto a 1240px** (era 1080): apre la **quarta colonna** di tessere, che
   mancava per 56px. A 1920 il portale mostrava 3 colonne e 824px di vuoto.
6. **Ricerca in cima alla home** (`GrigliaApp`, client): con 19 app «trovare»
   era l'unica cosa non progettata — nessun filtro, nessun raggruppamento, 4
   schermate di scorrimento da telefono. Filtra nome, sottotitolo e descrizione.
7. **Le descrizioni sono tagliate a 3 righe** (2 su mobile) col testo intero nel
   `title`: andavano da 2 a 5 righe e le righe della griglia risultavano alte
   267/306/286px, con fino a 59px di vuoto dentro una card.
8. **Ogni tabella sta in `.tabella-scroll`**: sotto i ~768px la tabella utenti
   misurava 612px in una card di 327 e **298px di righe finivano fuori dal
   riquadro** — con esse Stato, Ultimo accesso e il comando «Modifica».
9. **Il pannello «Modifica» ha una riga sua** (`RigaUtente`, client): dentro la
   cella rimisurava tutta la tabella (colonne da 246/238/170/187/165 a
   166/143/115/85/498, riga da 71 a 674px) e faceva andare a capo le date delle
   righe vicine. Modificare una persona scompaginava la lista.
10. **La barra dice dove sei** (`NavLink` + `aria-current` + `.attivo`): i link
    erano pixel-identici su ogni pagina.
11. **Le spunte delle app si accendono quando sono scelte** (`.spunta-app` con
    `:has(input:checked)`): erano identiche a quelle non scelte, e su una pagina
    di **permessi** non e' un attrito ma il rischio di sbagliare in silenzio.
12. **Focus oro, non blu** e **intestazioni di tabella senza maiuscolo urlato**:
    due deroghe al Design System (righe 115 e 122), verificate sul documento.
13. **`:active` e `:focus-visible` su bottoni e tessere**: il DS chiede che
    *ogni* elemento interattivo risponda, e nessun bottone rispondeva alla
    pressione. L'hover ora sta in `@media (hover: hover)`: su touch la tessera
    restava sollevata dopo il tocco (e la card apre una scheda nuova, quindi
    tornando indietro sembrava selezionata).
14. **`error.tsx`, `not-found.tsx`, `loading.tsx`**: non ce n'era **nessuno**. Un
    imprevisto portava alla schermata spoglia di Next, senza barra ne' strada per
    tornare; un indirizzo sbagliato usciva dal portale (e chi non era autenticato
    ci veniva rispedito **dopo** il login, per via di `?da=`); e `/utenti` poteva
    restare 6 secondi (il timeout di Budgets) senza un segnale.
15. **Seconda uscita in `/profilo`**: «Esci» viveva solo nella barra, cioe'
    nell'elemento che su schermo stretto si rompe per primo.
16. **Il Cartellino non sparisce piu' sotto i 900px**: la regola «solo da
    computer» la applicano middleware e server action guardando il **dispositivo**;
    il CSS puniva anche il portatile con mezzo schermo, e `/cartellino` e'
    linkato in **un solo posto**.

**Rimasto aperto di proposito**: `--text-tertiary` (#86868b) ha contrasto 3.62:1
su bianco, sotto la soglia di 4.5:1, ed e' usato su 28 elementi che portano dati
(email, elenco app abilitate). ⚠️ **Non si corregge qui**: e' il token del Design
System, il Hub lo applica fedelmente. Va cambiato in `deluxy-design-system` per
tutte le app, altrimenti torna alla prossima.

**Come sono state verificate**: typecheck, build, e misure sugli stili calcolati
(barra `flex-wrap: wrap`, campi 16px a 375, bottoni `min-height: 44px`, tabella
`overflow-x: auto`, `th` 12px/500/nessun maiuscolo, voce attiva con
`aria-current="page"` e peso 600). ⚠️ Le misure di **posizione** (colonne, altezze,
eccedenza) non sono state riverificate dopo la correzione: in quella sessione il
pannello del browser non componeva i frame e ogni `getBoundingClientRect`
tornava 0 — la stessa condizione dichiarata dai revisori. Da rifare quando il
pannello e' a schermo.

## 5-septies. Il menu laterale e la riga che si apre (30 agosto 2026)

### Il menu, in tre gruppi

Il menu di sinistra elenca gli **strumenti del portale**, non le 19 app (quelle
sono le tessere della home). Riordino chiesto dall’utente, registrato in
`deluxy-design-system/SEGNALAZIONI-UX.md`:

| Gruppo | Voci | Chi |
|---|---|---|
| **Portale** | Le app (`/`) · Installa le app (`/scarica`) | tutti |
| **Presenze** | Il mio cartellino (`/cartellino`, con «Dentro dalle …»/«Fuori» sotto il nome) · Gestione cartellini (`/cartellino/gestione`) | la seconda solo admin |
| **Amministrazione** | Utenti · Chiavi · Stato servizi | solo admin |

**Perché**: prima «Gestione cartellino» stava in fondo ad Amministrazione, dopo
Chiavi e Stato servizi — la stessa materia spezzata in due gruppi lontani. E due
voci si chiamavano diversamente dalla pagina che aprivano («Installa» → «Installa
le app»; «Gestione cartellino» → «Gestione cartellini»), contro la legge 11 del
Libro. Nessuna voce è stata tolta.

**Da non rompere:** «Il mio cartellino» ha `esatta: true` (senza, si accenderebbe
anche stando sulla gestione: una pagina, una voce attiva sola, con
`aria-current="page"`); nel cassetto mobile le voci sono alte **44px**
(`min-height` nella media query ≤800px — col dito 33px non bastano, legge 4);
il nome nel menu è il titolo della pagina, cambiando l’uno si cambia l’altro.

⚠️ **Aperto per il custode UX — due soglie mobile nella stessa app**: il guscio
(cassetto CSS e `suTelefono()` di `ToggleSidebar`) commuta a **800px**, form e
bottoni a **900px**. Il Libro §2 ne vuole una sola per app: o si porta il guscio a
900, o si annota la deroga nel README. Non toccato in autonomia.

### La tabella dei cartellini: il dettaglio si apre dalla riga

In «Gestione cartellini» → «Le timbrature di tutti» il dettaglio di una persona
si apre **cliccando la riga in un punto qualsiasi** (Libro §8 v1.6; prima solo dal
comando «Timbrature» in fondo). Componente
[`RigaPersona.tsx`](src/app/cartellino/gestione/RigaPersona.tsx), client.

**Le guardie sono la regola, non decorazioni:**
- le **azioni dentro la riga non aprono il dettaglio**
  (`closest("a,button,input,select,label")`): senza, il bottone farebbe due
  scatti e si richiuderebbe da sé;
- la riga cliccabile **si dichiara** (pointer, sfondo all’hover, filo oro quando
  è aperta) e chi **non ha dettaglio non finge**: niente pointer, e al posto del
  bottone la cella dice «nessun dato»;
- resta un comando **da tastiera**, con `aria-expanded` e `aria-controls`; la
  `<tr>` non è un secondo punto di tabulazione (sarebbe un doppione muto);
- il dettaglio sta in una **seconda riga con `colSpan`**, a tutta larghezza:
  nell’ultima colonna era un riquadro schiacciato accanto ai numeri.

⚠️ **Verificando, ricordare che l’idratazione di React è PIGRA.** Un click
sintetico da console (`element.click()`, `isTrusted:false`) su una pagina appena
caricata **non la innesca**, e sembra che l’app sia morta: orologio del cartellino
fermo su `--:--:--`, ricerca della home che non filtra, riga che non si apre.
Non è un guasto. Con un **click vero** — o dopo una navigazione interna — tutto
risponde: provato in produzione il 30/08 (click reale → riga aperta; orologio
08:05:35 → 08:05:37).

---

## 5-sexies. Revisione di sicurezza (27 agosto 2026)

Tre pentester (esterno su produzione, interno sul codice, e un ostile che ha
**demolito** reperti e correzioni prima dell'implementazione). **Dall'esterno
anonimo non si legge nulla**: cassaforte, presenze e pagine danno 401/redirect,
cookie falsificati e trucchi sul path rifiutati, `/api/health` non trapela.
Il vero accesso indebito lo otteneva un **utente gia' loggato a basso privilegio**.
Corretto (commit di sicurezza), con il **perche'** perche' non venga disfatto:

1. **`/vai/[app]` ora controlla `appVisibili` prima di coniare il token SSO**
   (`src/app/vai/[app]/route.ts`). Prima chiunque loggato poteva chiamare
   `/vai/personale` (stipendi, solo-admin) e farsi coniare un token valido: il
   gate stava solo nelle tessere della home. Il portale decide chi entra, non
   lo delega all'app di destinazione.
2. **La sessione si rilegge dal DB a ogni richiesta** (`src/lib/sessione-server.ts`,
   `sessioneCorrente` memoizzata con `cache()`): ruolo/nome/`attivo` vengono dalla
   riga viva, non dal cookie congelato 30 giorni. Un admin declassato smette di
   esserlo adesso, un utente disattivato/eliminato e' fuori subito. Il middleware
   Edge resta il primo filtro (firma), la verita' e' qui (Prisma non gira
   sull'Edge). Chiude anche l'`/vai` dell'utente eliminato.
3. **Revoca al cambio password** (buco trovato dall'ostile): `cambiaMiaPassword`
   sposta `Utente.sessioniValideDa` a ora → ogni cookie emesso prima (anche uno
   **rubato**) muore; poi si riemette quello di chi cambia, con `iat` nuovo, per
   non cacciarlo fuori. Il cookie porta `iat` (`src/lib/session.ts`); il confronto
   e' troncato al secondo (l'`iat` e' in secondi: coi ms il cookie nuovo si
   auto-invaliderebbe). Schema: aggiunta `sessioniValideDa DateTime?` a `hub.Utente`
   (nullable, `db push`, nessun altro schema toccato).
4. **Open redirect chiuso** (`src/lib/actions.ts`, `destinazioneSicura`): il vecchio
   `da.startsWith('/')` accettava `//evil` e, col tab `/%09/evil`, sfuggiva a
   qualunque blacklist. Ora si risolve `new URL(da, origine-fittizia)` e si tiene
   solo se l'origine resta interna. ⚠️ **Non tornare al controllo a caratteri**:
   provato con backslash/tab/newline grezzi (`String.fromCharCode`), tutti → `/`.
5. **Login: scrypt gira SEMPRE** (`accedi`, `HASH_FITTIZIO`): prima girava solo
   se l'utente esisteva ed era attivo → oracolo temporale che smascherava le email
   valide, vanificando il messaggio d'errore unico. ⚠️ L'hash fittizio **deve**
   essere ben formato (salt hex : 64 byte hex), altrimenti `verificaPassword`
   esce prima di scrypt e l'oracolo resta. Misurato: 56ms fittizio vs 52ms vero.
6. **Header di sicurezza** (`next.config.ts`): `X-Frame-Options: DENY` +
   CSP `frame-ancestors 'none'` (anti-clickjacking), `nosniff`, `Referrer-Policy`,
   `Permissions-Policy`, `poweredByHeader:false`. ⚠️ La CSP e' **prudente di
   proposito** (solo frame-ancestors/base-uri/object-src/form-action): una CSP
   stretta su `script-src` romperebbe l'hydration di Next. Niente `clipboard-write=()`
   nella Permissions-Policy: la pagina Chiavi copia il token.
7. **Token di servizio: scope vuoto vietato alla creazione** (`chiavi-actions.ts`):
   un token senza progetti valeva «tutti» = chiave maestra su ogni segreto.
   Verificato: in produzione **un solo token, scope `personale`** (nessuna master
   key esistente). La semantica a runtime NON e' cambiata (romperebbe i token gia'
   emessi e il Hub stesso): si blocca solo la nascita di nuovi token vuoti.
8. **Certificati sanitari: `attachment` + `nosniff` + magic byte** (buco trovato
   dall'ostile). Il download ora forza lo scaricamento invece di aprire nell'origine
   del Hub, e il tipo si legge dai **primi byte reali** (`tipoDaiByte`), non dal MIME
   dichiarato dal browser: un HTML travestito da PNG viene scartato prima di salvare.

**Regge, non toccato** (verificato dai pentester): server action tutte con
`richiediAdmin`, pagine admin con doppio controllo, IDOR certificati chiuso, token
SSO cifrato AES-256-GCM legato all'app con `exp` 60s, cripto password/sessione
solida (scrypt, HMAC a tempo costante, token per hash).

🔴 **Lasciato aperto, con la ragione** (non e' incuria):
- **Rate-limit su login e API** (R5): un limite in-memory su Vercel serverless e'
  teatro (ogni lambda ha la sua memoria). Serve uno store (Upstash) o il Vercel
  Firewall sulla rotta di login. Mitigato: scrypt rallenta, i token sono ad alta
  entropia cercati per hash. Da fare quando c'e' l'infrastruttura.
- **Token SSO nell'URL** (R8): mitigato (AES-GCM, 60s, monouso di fatto). Il fix
  (POST invece di GET) toccherebbe il `/api/sso` di TUTTE le app di destinazione.

**Giro ostile FINALE sulle patch (stesso giorno) — ha trovato un residuo vero:**
- 🔴→✅ **L'anti-open-redirect era ancora bucato**: `destinazioneSicura` controllava l'origine ma restituiva il `pathname`, e la normalizzazione dei dot-segment porta `/.//host` (e `/..//host`) a un pathname `//host` = protocol-relative → dominio esterno. Le varianti a blacklist erano già chiuse, ma i dot-segment le aggiravano. **Corretto ri-risolvendo il risultato finale** con un secondo `new URL(dest, …)` e scartando se l'origine cambia; provato su 15 vettori, 0 bypass. ⭐ **Lezione: un origin-check che poi restituisce il pathname è mezzo controllo — il valore che ESCE va rivalidato, non solo l'input.**
- 🔴→✅ **Il reset password da ADMIN non revocava le sessioni** (solo il self-service lo faceva): un account compromesso a cui l'admin cambiava la password teneva il cookie rubato fino a scadenza. Aggiunto `sessioniValideDa = now` anche in `aggiornaUtente` quando cambia la password. (Chi resetta la PROPRIA password dal pannello /utenti viene disconnesso — atteso.)
- ⚠️ **Finestra di 1 secondo** nella revoca (il troncamento al secondo, necessario per non auto-invalidare il cookie riemesso): una sessione emessa nello stesso secondo del cambio password sopravvive. L'ostile stesso la dice «praticamente irrilevante». Costo del compromesso.
- ✅ **Le altre 5 correzioni: CHIUSE, nessuna regressione dura** — login anonimo senza query sprecata, `cache()` request-scoped (niente leak fra utenti), certificati e header reggono.

## 5-octies. Recupero password dal login (30 agosto 2026)

Dal login c'è **«Password dimenticata?»**: si chiede il link, arriva per email, e
il link porta alla scelta della password nuova. Prima non c'era: l'unica strada
era chiedere a un amministratore (che resta, ed è il ripiego quando la posta non
è configurata).

**File**: [`src/lib/recupero-password.ts`](src/lib/recupero-password.ts) (regole e
token), [`src/lib/recupero-actions.ts`](src/lib/recupero-actions.ts) (le due
azioni pubbliche), `src/app/password-dimenticata/`, `src/app/reimposta-password/`,
[`src/app/login/CorniceAccesso.tsx`](src/app/login/CorniceAccesso.tsx) (il vestito
condiviso delle tre schermate). Tabella `TokenReset` nello schema `hub`.

### Sette cose da non rompere

1. **A database non c'è mai il token in chiaro**, solo il suo SHA-256. Il valore
   in chiaro esiste per il tempo di finire dentro l'email.
2. **La risposta è sempre la stessa**: email sconosciuta, account disattivato,
   freno scattato o email partita davvero non si distinguono. Il portale è la
   porta della suite: un «questo indirizzo non risulta» regala l'organico.
3. **Il token è monouso e dura un'ora**; usarne uno brucia anche tutti gli altri
   link non ancora usati di quella persona.
4. **Cambiare la password chiude tutte le sessioni** (`sessioniValideDa`): se
   qualcuno era entrato con la vecchia password o con un cookie rubato, esce.
5. **Il freno vive su DATABASE** (3/ora a persona, 10/ora per IP): in memoria non
   conterebbe nulla, con più istanze serverless. Dell'IP si salva solo l'hash.
6. **Password: min 12, blocklist, niente nome/email dentro**, nessuna regola di
   composizione (NIST 800-63B: la lunghezza batte i simboli).
7. **Le due rotte sono escluse dal middleware** (chi le apre non ha sessione):
   se qualcuno le rimette dentro il matcher, il recupero smette di funzionare.

⚠️ **Prerequisito: la posta non è configurata** (verificato il 30/08: né env né
cassaforte). Finché manca, il link non parte — e la pagina lo **dichiara** invece
di far aspettare un'email che non arriverà. Si accende da `/chiavi` → progetto
`hub` → `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` (più `SMTP_PORT`/`SMTP_FROM` se
diversi dai default): effetto immediato, senza redeploy.

⚠️ **Aperto, per il custode della sicurezza**: il **lockout sul login** continua a
mancare (il Libro §2 lo dà come priorità del Hub). Il freno scritto qui vale solo
per il recupero; lo stesso contatore su DB va applicato ad `accedi`. E resta un
canale sottile di timing: quando l'email esiste, l'azione attende l'invio SMTP.
Entrambi registrati in `deluxy-design-system/SEGNALAZIONI-SICUREZZA.md`.

---

## 6. Deploy e ambiente (Vercel)

- Progetto: **`deluxy/deluxy-hub`** (CLI già autenticata come `donatodnicolo-gif`).
- Deploy produzione: dalla cartella `deluxy-hub`, `npx vercel deploy --prod`.
- **[`vercel.json`](vercel.json): `"regions": ["fra1"]`** — le funzioni devono
  girare a Francoforte, accanto al database (vedi trappola 6 in §7). Non togliere.
  (Il classificatore di permessi può bloccarlo: se succede, chiedi conferma
  all'utente o fallo lanciare a lui.)
- **Env di produzione impostate** (14, misurate con `vercel env ls production`
  il 26/08/2026): `DATABASE_URL`, `DIRECT_URL`, `HUB_SESSION_SECRET`,
  `HUB_SSO_SECRET`, `HUB_KEYS_TOKEN`, `APP_URL_MAIL`, `APP_URL_MAISON`,
  `APP_URL_ANAGRAFICHE`, `APP_URL_PARTNER`, `APP_URL_SEARCH`,
  `APP_URL_MARKETING`, `APP_URL_ORDERS`, `APP_URL_TRANSACTIONS`,
  `APP_URL_PERSONALE`. Sono `Sensitive`: non si rileggono dalla CLI
  (`vercel env pull` dà `[SENSITIVE]`). Le copie locali stanno in
  `deluxy-hub/.env`. Le app senza `APP_URL_*` in prod usano il default di
  produzione scritto nel codice (§3); **manca `APP_URL_FONDO`**, quindi Fondo
  non compare.

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

- ✅ ~~Cambiare la password admin~~ — fatta (vedi §2).
- 🔴 **L'SSO è rotto su 6 app su 7: i segreti in produzione non combaciano**
  (misurato il 29/08/2026, vedi §9-ter — è il punto più importante aperto).
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
- ✅ ~~Nessun recupero password autonomo~~ — fatto il 30/08 (§5-octies): serve però la posta configurata, altrimenti il link non parte.
- **Creare gli utenti veri** del team da `/utenti` (finora esiste solo l'admin).
  Dal 24/08 la pagina mostra squadre e persone lette da Budgets con «Crea
  account» precompilato (§5-quater); la chiave di Budgets **c'è** dalla stessa
  mattina (incollata in cassaforte alle ~12:15, vedi §5-quater): la sezione è
  viva anche in produzione.
- **`deluxy-acquisti` non è nel catalogo**: l'app esiste nel repo (porta 3100) ma
  non ha una tessera in `apps.ts` né un `APP_URL_ACQUISTI`, quindi dal portale non
  si raggiunge. Da aggiungere quando avrà un URL pubblico.
- **Il cookie non viene ricontrollato sul database**: il middleware valida solo la
  firma, non che l'utente esista ancora e sia `attivo`. Chi viene eliminato o
  disattivato continua a entrare col cookie che ha già, fino alla scadenza (30
  giorni). L'unica espulsione immediata oggi è cambiare `HUB_SESSION_SECRET`, che
  però butta fuori tutti. Non ancora affrontato.

---

## 9-ter. 🔴 L'SSO in produzione: cosa non funziona e perché (29 agosto 2026)

**Il sintomo dell'utente**: «entro nel Hub, clicco un'app autorizzata e mi chiede
di nuovo la password». **La causa non è il codice**: il Hub conia il token e le
app hanno tutte la loro `/api/sso`. Non combacia il **segreto condiviso**.

Il token è cifrato AES-256-GCM con una chiave derivata da `HUB_SSO_SECRET`
(`src/lib/sso.ts`). Se il valore del Hub e quello dell'app **non sono identici**,
l'app non apre il token e — per come è scritta la difesa — **degrada al proprio
login**. Il fallimento è quindi *silenzioso e identico* a «non hai la sessione»:
è il motivo per cui da fuori sembra che l'SSO non esista.

**Fotografia misurata in produzione il 29/08/2026** (login vero sul portale con
un utente di prova, poi cancellato; `vercel env ls production` per ogni progetto;
per Calendario e CRM il motivo letto nei log con `vercel logs`):

| App (con `sso: true`) | `HUB_SSO_SECRET` in prod | Esito del salto dal Hub |
|---|---|---|
| Attività (`tasks`) | ✅ presente | ✅ **entra senza login** — l'unica che funziona |
| Calendario | ✅ presente | ❌ login — log: «token non decifrabile (segreto diverso dal Hub?)» |
| Scripts | ✅ presente | ❌ login (non guarda l'email: se rifiuta, è il segreto) |
| CRM | ✅ presente | ❌ login — log: «token non decifrabile (segreto diverso dal Hub?)» |
| Finance (`partner`) | ❌ **assente** | ❌ login |
| Budgets | ❌ **assente** | ❌ login |
| Personale | ❌ **assente** | ❌ login |

Nei `.env` **locali** il valore è invece lo stesso su Hub, Scripts, CRM, Finance
e Budgets (64 caratteri, confrontati per impronta SHA-256 senza mai stamparli):
**in sviluppo l'SSO funzionerebbe; è la produzione a essere disallineata**.

### Come si ripara (lo deve lanciare l'utente)

Il classificatore dei permessi **blocca ogni scrittura automatica di
credenziali** (`vercel env add`, e anche uno script che legga il segreto): i
comandi vanno lanciati a mano. Il valore da usare è `HUB_SSO_SECRET` di
[`deluxy-hub/.env`](.env) — le env `Sensitive` di Vercel non si rileggono
([[trappola-vercel-env-sensitive-pull]]), quindi la fonte in chiaro è quel file.

⚠️ **Vanno aggiornate tutte insieme, Attività compresa**: cambiare il segreto
solo sul Hub romperebbe l'unica app che oggi entra. E ⚠️ **una env nuova vale
solo dal deployment successivo**: dopo ogni `env add` serve il redeploy.

Per ognuna delle cartelle — `deluxy-hub`, `deluxy-tasks`, `deluxy-calendario`,
`deluxy-scripts`, `deluxy-crm`, `deluxy-partner`, `deluxy-budgets`,
`deluxy-personale` — nell'ordine: `vercel env rm HUB_SSO_SECRET production --yes`
(salta se non c'era), `vercel env add HUB_SSO_SECRET production` incollando lo
stesso valore, e alla fine `vercel deploy --prod` su tutte.
⚠️ Incollando il valore **non lasciare l'a-capo** ([[trappola-vercel-env-a-capo]]).

**Il prerequisito storico di Finance non c'è più**: l'handoff diceva di
impostare `PARTNER_APP_PASSWORD_READONLY` prima di accendere l'SSO, altrimenti i
non-admin entravano con accesso pieno. Oggi `deluxy-partner/src/app/api/sso/route.ts`
mappa il ruolo del Hub in una **sessione firmata** (`admin` → pieno, tutto il
resto → sola lettura) e non usa più le password di team: si può accendere.

**Restano 11 app senza SSO del tutto** (nessun `sso: true`, quindi chiedono
sempre il loro accesso): Anagrafiche, AI Mail, Consegne, Marketing,
Merchandising, Customer Service, Ordini, Transactions, Ricerca fornitori,
Commerciale Scout, Maison. Perché «entrare dal Hub senza rifare il login» valga
ovunque, ognuna deve esporre la sua `/api/sso` e ricevere il segreto: è lavoro
app per app, non una modifica al Hub.

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
> e **middleware** (protezione). La "superficie API" sono le server action, il
> contratto del cookie di sessione e due rotte a token di servizio:
> `GET /api/chiavi` (cassaforte, §9-bis) e `GET /api/presenze` (cartellino,
> §5-ter). Consuma una sola API esterna: `GET /api/v1/team` di Budgets (§5-quater).

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

Portale **live** con **19 app** catalogate (18 visibili in produzione, §3), login
a database, permessi app-per-utente immediati, gestione utenti admin, cassaforte
dei segreti con API a token, pagina Stato servizi, cartellino
presenze/ferie/malattia (solo da computer) leggibile anche via
`GET /api/presenze`, organico da Budgets in `/utenti`.
Manca: cambio password admin di default, SSO su Finance, posta SMTP non
configurata, recupero password autonomo, popolamento degli utenti reali, l'app **Acquisti**
non ancora nel catalogo (vedi §9).
