# Dossier Deluxy — briefing per un'altra AI

**Aggiornato: 24 luglio 2026.** Documento autoconsistente: chi è Deluxy, come
funziona il business, com'è fatto l'ecosistema software, con che regole si
lavora. Pensato per essere dato a un assistente che **non ha mai visto** questo
repo. Non contiene segreti: chiavi e password stanno nella cassaforte del
portale, mai nei file.

Per la parte operativa ("da dove parto?") vedi [DA-DOVE-PARTIRE.md](DA-DOVE-PARTIRE.md).

---

## 1. Cos'è Deluxy

**Deluxy srl** vende e consegna **fiori e dolci di lusso**, con consegna in
giornata e a fascia oraria. Vive su tre marchi/siti Shopify:

- **deluxyflowers.com** — fiori, il marchio principale;
- **deluxy.it** — vetrina/marchio corporate;
- **cakedesign.me** — dolci e cake design.

Il modello è **ibrido**: l'ordine arriva online (Shopify), la merce la prepara un
**partner** sul territorio (fioraio, pasticceria), la consegna la fa un **valet**
(fattorino) in una **fascia oraria** precisa. Sopra ci sono operatori che
smistano, un team commerciale che recluta nuovi partner, e l'amministrazione che
paga valet e partner.

Il software che c'è in questo repo serve a far girare **tutta** questa catena.

---

## 2. Glossario (indispensabile per capire il codice)

I nomi sono in italiano e ricorrono ovunque, anche nelle tabelle e nelle API.

| Termine | Significato |
|---|---|
| **Partner** | l'attività B2B che prepara la merce (fioraio, pasticceria). Ha anagrafica, orari di apertura, province servite, fatturazione. |
| **Valet** | chi consegna. Ha province abilitate, disponibilità per data, paga a consegna, stipendio. |
| **Operatore / operation** | chi gestisce le consegne dall'interno (ruolo intermedio fra admin e utenti esterni). |
| **Consegna (delivery)** | l'unità di lavoro: destinatario, indirizzo, data, **fascia oraria**, partner, valet, stato, prezzo. |
| **Fascia** | finestra di consegna: `08:00-12:00`, `12:00-16:00`, `16:00-20:00`. |
| **Da gestire** | primo stato di una consegna (`created`), in rosso nelle liste: non ancora presa in carico. |
| **Plus / additional** | maggiorazione di prezzo (`additionalPrice`) o di paga al valet (`valetAdditionalPrice`). |
| **Billable** | consegna «da fatturare» al partner: entra nella generazione fattura. |
| **Stipendio** | compenso periodico del valet = paghe delle consegne − contanti incassati alla consegna. Flusso Bozza → Inviato → Ricevuta → Approvato → Pagato. |
| **Ricevuta** | documento firmato dal valet, obbligatorio prima di approvare lo stipendio. |
| **Fattura** | documento verso il **partner**, generato sommando le sue consegne billable del periodo. Flusso Bozza → Emessa → Pagata. |
| **Prospect** | attività non ancora partner, censita dal commerciale sul campo. |
| **Maison** | il modo in cui Deluxy chiama la gestione "da casa di moda" del prodotto (collezioni, stagioni). |
| **Golden record** | la versione unica e ufficiale di un'anagrafica, ottenuta unendo le fonti campo per campo. |

---

## 3. Regole di business che non si toccano

Sono decisioni dell'azienda, non scelte tecniche: si rispettano e basta. Fonte:
`sviluppi-siti-deluxy/skills/sviluppi-siti-deluxy/reference/REGOLE_BRAND.md`.

**Orari sempre in ora italiana (`Europe/Rome`)**, mai l'ora del dispositivo del
cliente, mai il `now` di Liquid (viene cachato da Shopify).

**deluxyflowers.com — prima data selezionabile**: fino alle **15:59** si può
consegnare **oggi**; **dalle 16:00** la prima data è **domani**.

**Fasce disponibili in base all'ora dell'ordine**:

| Ora ordine | Oggi | Domani |
|---|---|---|
| < 8:00 | tutte | tutte |
| 8:00–11:59 | dalle 12:00 | tutte |
| 12:00–15:59 | solo 16-20 | tutte |
| 16:00–21:59 | non disponibile | tutte |
| dalle 22:00 | non disponibile | dalle 12:00 |

Il **lead time del prodotto** (`prodotto.consegna > 0`) sposta comunque in avanti
la prima data; il cutoff delle 16:00 vale solo per i prodotti consegnabili in
giornata.

**Sui temi Shopify**: si lavora **solo** sul tema "Version to work on" (non
pubblicato), **mai** sul tema live. Pubblica solo l'utente.

---

## 4. L'ecosistema software

Un **portale unico** (Hub) e una costellazione di app autonome, ognuna padrona di
un pezzo di dominio. Nessuna app duplica i dati di un'altra: li **legge via API**.

### 4.1 Chi possiede cosa (la regola più importante)

| Dato | App proprietaria | Le altre come lo usano |
|---|---|---|
| Anagrafiche partner/prospect B2B | **deluxy-anagrafiche** | API a chiave in lettura; **scrive solo** la piattaforma consegne |
| Ordini Shopify | **deluxy-orders** | API a chiave |
| Consegne, valet, stipendi, fatture | **deluxy-platform-next** (+ piattaforma legacy) | — |
| Utenti, ruoli, accessi, chiavi | **deluxy-hub** | API `/api/chiavi` a token |
| Conversazioni social/chat | **deluxy-messaging** | — |
| Posta e attività da email | **deluxy-mail** | — |
| Campagne e spesa ADV | **deluxy-marketing** | — |
| Prospezione sul campo | **deluxy-scout** (+ HubSpot) | — |

Corollario: se serve un dato che non è tuo, **non te ne fai una copia**: chiedi
all'app che lo possiede.

### 4.2 Le app

| App | A cosa serve |
|---|---|
| **deluxy-hub** | portale d'ingresso: un login, e in home solo le icone delle app abilitate per quell'utente. Contiene la **cassaforte delle chiavi** di tutti i progetti. |
| **deluxy-platform-next** | la piattaforma logistica: consegne, partner, valet, calendario, stipendi, ricevute, fatture, pagamenti, tracking pubblico. È il cuore operativo. |
| **deluxy-partner** ("Finance") | gestione finanziaria dei partner: fatture servizi, vendite vendor, saldi, bonifici SEPA. Sostituisce un vecchio Excel. |
| **deluxy-anagrafiche** | registro centralizzato dei partner e prospect B2B, con golden record e merge per campo. |
| **deluxy-orders** | registro centralizzato degli ordini Shopify (~14.000 storici importati), riclassificabili e instradabili. |
| **deluxy-search-supplier** | ricerca fiorai/pasticcerie e smistamento degli ordini via WhatsApp/Email. |
| **deluxy-messaging** | inbox unificata WhatsApp/Messenger/Instagram (API Meta) + widget di chat per i siti. |
| **deluxy-mail** | client IMAP/SMTP che smista la posta, crea attività e prepara bozze con l'AI. |
| **deluxy-marketing** | memoria operativa dell'advertising: audit, azioni con storia, campagne con metriche e guardrail. |
| **deluxy-budgets** | budget aziendali su 3 livelli (raggiungibile / sfidante / irraggiungibile) con P&L e premi. |
| **deluxy-merchandising** | il prodotto gestito come una maison: collezioni, stagioni, PLM, costi e margini. |
| **deluxy-scout** | app mobile del commerciale: mappa le attività di Milano, registra visite offline, alimenta HubSpot. |
| **sviluppi-siti-deluxy** | i temi Shopify dei tre siti, con le regole di consegna. |
| **deluxy-design-system** / **deluxy-standard** | le regole comuni di aspetto e di tecnica. |

### 4.3 Come si parlano

- **Autenticazione fra app**: chiave nell'header `x-api-key` (in alternativa
  `Authorization: Bearer`), errore `401` esplicito se manca.
- **Le chiavi non stanno nei file**: si leggono dalla **cassaforte del Hub**
  (`GET /api/chiavi?progetto=<id>`, token di servizio per progetto). Ogni app le
  cerca in tre posti, in ordine: impostazione inserita nell'app → cassaforte del
  Hub → variabile d'ambiente.
- **Login unico (SSO)**: il Hub può aprire un'app passandole un token cifrato, in
  modo che l'utente non rifaccia il login. Predisposto verso Finance, **non
  ancora attivo** (manca il segreto condiviso nelle impostazioni di produzione).
- **Le integrazioni sono best-effort**: se l'app remota è spenta, l'operazione
  locale deve comunque riuscire. Timeout e fallback sempre.

---

## 5. Architettura tecnica

**Stack uniforme**: Next.js 15 (App Router, React 19, server action) +
TypeScript + Prisma + **PostgreSQL su Supabase**, deploy su **Vercel** (un
progetto per app). Il mobile è React Native/Expo; la piattaforma legacy è
Angular + Node.

**Database**: un solo Postgres condiviso, **uno schema per app**
(`?schema=<app>`). Connessione via pooler per l'app, connessione diretta per le
migrazioni. Client Prisma come singleton, identico ovunque.

**Regole complete** (css, server, database, chiavi interne ed esterne):
[deluxy-standard/STANDARD-DELUXY.md](deluxy-standard/STANDARD-DELUXY.md).
**Aspetto** (stile Apple, sfondo chiaro, bottoni neri a pillola, oro solo come
accento): [deluxy-design-system/DESIGN-SYSTEM.md](deluxy-design-system/DESIGN-SYSTEM.md).

---

## 6. Stato al 24 luglio 2026

**In produzione e funzionanti**: portale (Hub), piattaforma consegne, Finance,
Anagrafiche, AI Mail, Marketing, Messaggi, Ordini, Ricerca fornitori, Scout.

**Non ancora pubblicate**: Budgets e Merchandising (girano in locale, database
SQLite, da portare su Postgres).

**Aperto e noto**:
- il **login unico** è pronto come codice ma non attivo (manca il segreto
  condiviso nelle impostazioni di produzione delle due app);
- **Budgets e Merchandising su SQLite** invece che Postgres;
- alcune app hanno solo un README e non un handoff (Budgets, Marketing);
- la cassaforte centrale delle chiavi **è stata letta davvero solo da poco**: due
  app la chiamavano con l'header sbagliato e ripiegavano in silenzio sulle
  variabili d'ambiente (corretto il 24/07/2026).

---

## 7. Come si lavora (regole non negoziabili)

1. **Verifica reale prima di ogni commit**: `npx tsc --noEmit` **e** `npm run build`.
   Riportare l'esito vero, anche quando è negativo.
2. **Handoff e documento dell'app aggiornati nello stesso commit** che cambia il
   comportamento: una sessione nuova deve poter riprendere senza contesto.
3. **Commit spesso**, con messaggi in italiano che dicono *cosa cambia per
   l'utente*, non quali file sono stati toccati.
4. **Segreti mai nei file, mai committati.** Nei `.env.example` solo i nomi.
5. **Una sola sessione per cartella.** Prima di modificare, rileggere i file da
   disco: un'altra sessione potrebbe averli cambiati.
6. **Confermare le azioni irreversibili o esterne** (deploy, invii, cancellazioni,
   modifiche alle impostazioni).
7. **Il push non pubblica**: il deploy è un comando separato.

---

## 8. Cosa NON fare (errori già pagati)

- **Non ripescare file da zip, worktree o cartelle vecchie** della piattaforma:
  esiste **una sola versione valida**. È già costato lavoro perso.
- **Mai `deleteMany` senza filtro** sul database condiviso, nemmeno per pulire i
  test: cancella i dati veri di altre app.
- **Non duplicare anagrafiche o ordini** dentro un'altra app.
- **Non scrivere sul tema Shopify live.**
- **Non hardcodare colori, misure o modelli AI** che esistono come token o come
  variabile.
- **Non fidarsi di un `.env` caricato per sbaglio in produzione**: ogni app ha un
  `.vercelignore` che lo esclude, i valori veri stanno nelle impostazioni del
  progetto.
- **Non lasciare una chiamata di rete senza timeout** dentro il render di una
  pagina: si vede, e blocca l'utente.

---

## 9. Sicurezza

- Password utente con hash (mai in chiaro nel database); cookie di sessione
  firmati; i valori della cassaforte cifrati.
- Le API fra app si autenticano da sole e restano fuori dal middleware di
  sessione.
- I token di servizio si vedono **una volta sola** alla generazione: nel database
  resta solo la loro impronta.
- **Da sistemare**: l'handoff del portale riporta ancora la **password admin di
  default in chiaro**. Va cambiata dal portale e rimossa dal documento.

---

## 10. Se devi lavorarci

Leggi in quest'ordine: questo dossier → [DA-DOVE-PARTIRE.md](DA-DOVE-PARTIRE.md)
(mappa dei progetti e primo documento da aprire) →
[deluxy-standard/STANDARD-DELUXY.md](deluxy-standard/STANDARD-DELUXY.md) →
l'handoff dell'app su cui lavori.

Poi, prima di scrivere una riga: guarda `git status` e `git log` sulla cartella,
e se l'app è pubblicata controlla che risponda. Solo dopo si tocca il codice.
