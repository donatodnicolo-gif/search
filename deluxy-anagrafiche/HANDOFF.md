# Deluxy Anagrafiche — Handoff / Stato del progetto

> Documento per riprendere il lavoro da zero in una nuova sessione. Aggiornato il 19/07/2026.
> Leggi anche `README.md` (brief di integrazione per le altre app) e il `CLAUDE.md` alla radice del repo.

## 1. Cos'è, in una riga

Registro **centralizzato** delle anagrafiche partner/prospect B2B Deluxy: la **fonte di
verità unica** che tutte le app dell'ecosistema leggono via API. Solo la piattaforma
consegne ha la chiave di scrittura; le altre leggono (e "segnalano").

- **Live**: https://deluxy-anagrafiche.vercel.app (UI protetta da password, API a chiavi)
- **Stack**: Next.js 15 (App Router) + Prisma + **Postgres condiviso** (cluster Supabase,
  stesso di hub/partner, schema `anagrafiche`). Porta locale **3060**.
- **Progetto Vercel**: `deluxy-anagrafiche` (team deluxy).
- **UI**: Deluxy Design System (Apple-like, sfondo `#F5F5F7`, oro `#B8963E` come accento).

## 2. Come riprendere (setup)

```bash
cd deluxy-anagrafiche
# .env: genera DATABASE_URL/DIRECT_URL copiandole da un'altra app del cluster
node scripts/configura-db-condiviso.mjs ../deluxy-hub/.env   # oppure ../deluxy-partner/.env
npm install
npx prisma generate
npm run dev            # http://localhost:3060
```

Il `.env` (gitignored) contiene anche: `HUBSPOT_ACCESS_TOKEN` (Sync/import HubSpot),
opzionale `ANAGRAFICHE_APP_PASSWORD` (in locale se assente la UI è aperta).

> **⚠️ Branch condiviso**: il lavoro sta su **`scout-ui`**, un branch usato in parallelo da
> più sessioni Claude (anche deluxy-partner, deluxy-scout, deluxy-mail). Fai sempre
> `git fetch origin scout-ui` e allinea prima di committare. Committa **solo** i file di
> `deluxy-anagrafiche/`. L'HEAD locale può risultare "indietro": la verità è `origin/scout-ui`.

## 3. Modello dati (Prisma, schema `anagrafiche`)

- **Partner** — l'anagrafica. Campi chiave: `nome` (insegna), `ragioneSociale`, `categoria`
  (MAIUSCOLO: BOUTIQUE/FIORISTA/PASTICCERIA/…/`DA CLASSIFICARE`), `stato` (ciclo di vita, vedi
  `src/lib/stati.ts`: prospect·in_contatto·in_attesa·in_trattativa·da_ricontattare·attivo(=Partner)·non_interessato·dismesso),
  `citta`/`provincia`/`regione`, `indirizzo`, `email`, `telefono`, `pIva`, `codiceFiscale`,
  `account`, `ultimaVisita`, `interessi[]` (multi, `src/lib/interessi.ts`: consegne·affiliazione·
  gifting·catering·eventi·pr_activation·in_store·vendor), `note`, `datiExtra` (JSON tracker),
  `platformId` @unique, `hubspotId` @unique, `provenienzaCampi` (JSON: chi/quando per campo),
  `fonte` (excel·platform·manuale·ui·hubspot), `attivo` (soft delete),
  `capogruppoId` → self-relation `capogruppo`/`sedi` (gruppi aziendali a un livello).
- **Contatto** — referenti (persone): `ruolo·nome·telefono·email·fonte·hubspotId` (id del
  contatto nel CRM, per aprirlo) · `nomeRubrica` (nome per la rubrica Google; se vuoto si
  usa `[STATO] [AZIENDA] [CITTÀ] [Nome contatto]`). Fonti: Excel + HubSpot.
- **RiferimentoEsterno** — xref `(sistema, idEsterno)` @unique → partner. Generalizza
  platformId/hubspotId: è la "lingua comune di id" tra le app.
- **RichiestaMatch** — storico delle richieste di aggancio (`/api/v1/partners/match`): sistema,
  tipo, esito, confidenza, partner risolto, `risolto`.
- **PassaggioStato** — storico dei cambi di stato/archivio (da·a·origine·quando).
- **ApiKey** — chiavi delle app client (solo SHA-256 nel DB).

### Motore di merge multi-sorgente (`src/lib/merge.ts`) — Fase 1 dell'architettura
Ogni scrittura via API è un **merge governato per campo**, mai una sostituzione:
- **Bloccati** (curati dal team): `stato`, `interessi` mai sovrascritti; `account`/`categoria`
  solo se vuoti (categoria: anche se `DA CLASSIFICARE`/`ALTRO`).
- **Fattuali** (nome, ragioneSociale, città, indirizzo, email, telefono, pIva, CF, ultimaVisita):
  **vince il più fresco** (`asOf`) o, a parità, la sorgente più **autorevole** (ranking di
  fiducia: ui 100 > platform 80 > scout 60 > suppliers 55 > hubspot 40 > … > sconosciuta 20).
  I campi vuoti si riempiono sempre. La provenienza per campo è in `provenienzaCampi`.
- **Additivi**: `note` (append), `contatti` (merge per identità email>telefono>nome, mai wipe).

## 4. Funzionalità UI (pagine)

- **`/`** Aziende (ex "Visione globale") — elenco con ricerca "a parole" su tutti i campi + referenti, filtri
  (categoria/città/stato/interesse), ordinamenti cliccabili, **sezione Novità** (top 10 tra
  data creazione e ultimo contatto), colonne Interessi/Ultimo contatto/Note, cambio
  stato/interessi in riga, archivia/ripristina, riconciliazione HubSpot (⇄), bottone **＋ Nuovo**.
  **Gruppi aziendali** — due meccanismi che si sommano:
  1. **Automatico per insegna** (nessun dato da preparare): le anagrafiche con lo stesso `nome`
     collassano in un'unica riga espandibile «NOME · N sedi · città…»; il ▸ mostra le sedi, ognuna
     riga completa con stato/interessi/azioni proprie. La testata del gruppo è solo presentazione,
     non è un'anagrafica. Raggruppamento fatto a render time in `src/app/page.tsx` (mappa per nome).
  2. **Manuale** (`Partner.capogruppoId`, self-relation `capogruppo`/`sedi`, un livello) per le
     insegne scritte diversamente (es. «BOTTEGA VENETA FLAGSHIP»): `⧉ Raggruppa` nella scheda.
  Le sedi collegate a mano non compaiono come righe a sé (`where.capogruppoId = null`).
  **Durante una ricerca (`?q=`) l'elenco torna piatto**, così una sede resta trovabile per nome.
  Nota: la paginazione conta i record, non i gruppi — una pagina da 50 record mostra meno righe.
- **`/dashboard`** — analisi con **macro-filtri** (tipologia/regione/stato/interesse in AND):
  KPI, funnel per stato, interessi, tipologie/regioni/città, contatti per mese, qualità dati.
- **`/contatti`** — rubrica di tutti i referenti (Excel + HubSpot), ricerca, filtro fonte,
  colonna **Azienda** (link alla scheda), telefoni cliccabili (`tel:` → avvia la chiamata),
  colonna **Google** («Salva in Google» via People API + fallback .vcf), link al contatto HubSpot (↗).
- **`/contatti/:id`** — scheda del referente (click sul nome in /contatti): modifica
  nome/ruolo/telefono/email + **Nome su rubrica** (`aggiornaContatto`) ed eliminazione
  (`eliminaContatto`). Il nome Google è `Contatto.nomeRubrica` se compilato, altrimenti
  `[STATO] [AZIENDA] [CITTÀ] [Nome contatto]` (`src/lib/rubrica.ts`).
- **`/sync-hubspot`** — confronto registro ↔ companies HubSpot (match per nome normalizzato +
  riferimenti): riepilogo, liste "solo HubSpot"/"solo registro"/"in entrambi", ricerca+ordinamenti,
  **⇄ riconcilia** (crea xref hubspot), **＋ importa** company come prospect DA CLASSIFICARE.
- **`/match`** — storico delle richieste di aggancio delle app (tipo, esito, app, confidenza);
  **Risolvi** (crea xref) le ambigue, **Modifica** quelle già agganciate, **Ignora** il rumore.
- **`/partner/:id`** — scheda: anagrafica, pillole stato + menu interessi, ✎ Modifica, archivia,
  sezione **Contatti** (Excel+HubSpot con link al CRM, telefono cliccabile, **✕ rimuove il
  referente** dall'azienda → `staccaContatto`), Note, Dati del tracker, **Storia** (timeline).
  **Gruppi**: `⧉ Raggruppa` (`GestioneGruppo`) mette l'anagrafica sotto un'insegna madre;
  una sede mostra «Sede del gruppo X» + «Togli dal gruppo»; la madre ha la sezione
  **Sedi del gruppo** (✕ per sganciarne una). Azione unica `raggruppaSotto(partnerId, capogruppoId|null)`.
  **Diventata cliente → rubrica Google in automatico**: quando lo stato passa a `attivo`
  (etichetta «Partner»), `cambiaStato` fa redirect a `?rubrica=1` e il pannello
  `SalvaRubricaAuto` salva tutti i referenti nella rubrica dell'operatore (verifica per numero,
  crea solo se assenti). Primo tentativo **silenzioso** (`getToken(true)` → GIS `prompt: ""`,
  riesce se il consenso è già stato dato); se non basta compare il bottone «Autorizza e salva
  in rubrica» (il popup Google richiede un gesto utente). Logica condivisa in
  `src/components/google-rubrica.ts` (usata anche dalla tabella di /contatti).
- **`/partner/nuovo`** e **`/partner/:id/modifica`** — form creazione/modifica. La modifica
  include la sezione **Dati finanziari**: PEC, codice SDI, IBAN (normalizzato senza spazi,
  maiuscolo), banca, metodo/condizioni di pagamento, note amministrative e **contatto
  amministrativo** (nome/telefono/email) — campi omonimi su `Partner`, mostrati nella scheda
  nella sezione «Dati finanziari» (con P.IVA/CF/ragione sociale ripetuti lì per completezza).
  Curati solo dalla UI: le API esterne non li scrivono. **Non ancora esposti in lettura via
  API** (serializzaPartner espone solo pIva/codiceFiscale) — passo successivo se serve a
  deluxy-partner.
  **Condivisi a livello di insegna** (`src/lib/insegna.ts`, `CAMPI_FINANZIARI` = pIva,
  codiceFiscale, pec, codiceSdi, iban, banca, metodo/condizioni pagamento, note ammin.,
  contatto ammin.): la fatturazione è della società, non della singola sede. La scheda e il
  form li leggono via `datiFinanziariCondivisi` (merge per campo tra le sedi della stessa
  insegna = stesso nome, o sedi collegate a mano alla madre con quel nome); al salvataggio
  `aggiornaPartner` chiama `propagaDatiFinanziari` che li copia su tutte le sedi (updateMany).
  Compili una volta su una sede → valgono per Milano/Roma/Capri. NON condivisi: ragioneSociale,
  indirizzo, città, telefono/email, stato, interessi, referenti (restano per-sede).
- **Sidebar** a sezioni espandibili (Registro·Tipologie·Stati·Interessi·Archivio·Sync), toggle a
  scomparsa (☰), preferenze in localStorage.

## 5. API (base `https://deluxy-anagrafiche.vercel.app`)

Pubbliche `/api/v1` — auth header `x-api-key: <chiave>` (o `Authorization: Bearer`):

| Metodo | Percorso | Permesso | Note |
|---|---|---|---|
| GET | `/api/v1/health` | — | Stato servizio |
| GET | `/api/v1/partners` | lettura | Filtri: q, categoria, citta, provincia, regione, stato, interesse, fonte, platformId, attivo; page, perPage |
| GET | `/api/v1/partners/:id` | lettura | id registro, platformId, o **qualsiasi** idEsterno via xref |
| GET | `/api/v1/partners/by-ref/:sistema/:idEsterno` | lettura | Risolve dall'id di un'altra app |
| GET | `/api/v1/partners/match` | lettura | `?pIva=&codiceFiscale=&nome=&citta=&idEsterno=` → match/candidati+confidenza; registra RichiestaMatch |
| POST | `/api/v1/partners` | scrittura | Upsert-merge; body opzionale `sistema`,`idEsterno`,`asOf` |
| PATCH | `/api/v1/partners/:id` | scrittura | Aggiornamento parziale mirato |
| DELETE | `/api/v1/partners/:id` | scrittura | Soft delete (attivo=false) |

Interne `/api/interno/*` (solo UI, cookie di sessione, NON per le app): `cerca-partner`, `cerca-hubspot`.

**Chiavi**: una per app, in `<app>/.env` (gitignored), mai committare i valori. Rigenera con
`npm run chiave -- <nome-app> [--scrittura]` (stampa la chiave una volta; nel DB solo l'hash).
Le app con chiave già generata: `deluxy-platform` (scrittura), `deluxy-partner`,
`deluxy-suppliers`, `deluxy-scout` (lettura). Il **nome** della chiave = la sorgente nella
provenienza/ranking. La cascata d'identità in scrittura: xref → platformId → P.IVA/CF → nome+città.

## 6. Integrazioni

- **HubSpot CRM** (token `HUBSPOT_ACCESS_TOKEN`, portale **147623810**, region **app-eu1**):
  Sync companies (`src/lib/hubspot.ts`), import contatti (`npm run import:hubspot-contatti`:
  aggancia le persone ai partner via azienda per id/nome, dedup), link ai record
  (`src/lib/hubspot-link.ts`). Solo lettura. Il flywheel: più riconcili in /sync-hubspot →
  più contatti agganciabili al re-import.
- **Google Contacts** (People API, `src/components/TabellaContattiGoogle.tsx`,
  `src/lib/google.ts`): OAuth **lato browser** (GIS token flow, scope `contacts`); verifica per
  numero (searchContacts con warm-up, ultime 9 cifre) e crea solo se assente, nome `[STATO] NOME`
  (+ provincia per affiliati/reseller = interessi affiliazione/vendor). Fallback `.vcf`.
- **Export vCard** (`npm run export:vcard` → `~/Downloads/Deluxy-Anagrafiche-Contatti.vcf`),
  importabile in bulk su contacts.google.com.

## 7. Sviluppi IN CORSO / pending

1. ~~Google OAuth Client ID~~ **RISOLTO (20/07/2026)**: `src/lib/google.ts` ora usa il client
   **«Deluxy search rubrica»** `813248887384-kdksp8lq8p8pg4tou6b2q4i7r0avchjt.apps.googleusercontent.com`
   (progetto **«My Project 75759»** = `xenon-jetty-502714-c9`, account **deluxy.delivery@gmail.com**,
   in console via `?authuser=1`). Configurato sul client: origini JS
   `https://search-deluxy.vercel.app` + `https://deluxy-anagrafiche.vercel.app` + `http://localhost:3060`;
   People API già abilitata; test user: deividcala, deluxy.delivery, donatod.nicolo (@gmail.com).
   Gotcha console: il tasto Salva può restare coperto dal banner cookie e il carattere `/` digitato
   ruba il focus alla ricerca globale — impostare i campi via DOM se succede.
2. **Fase 2 architettura** (non ancora costruita): coda **proposte** per i campi bloccati toccati
   dalle app + UI di revisione; **Fase 3**: outbox/webhook sui cambi + Idempotency-Key.
3. **Pulizia contatti Excel**: alcuni referenti dall'Excel hanno il campo `nome` sporco (testo
   libero). Passata di normalizzazione possibile sfruttando i dati HubSpot più strutturati.
4. **deluxy-partner**: ha già `anagraficaId` e join per id (fatto). Le altre app (suppliers,
   scout, search) hanno la chiave ma non ancora l'integrazione in lettura.

## 8. Script (`package.json`)

`db:push`, `import:excel`, `import:hubspot-contatti`, `export:vcard`, `chiave`,
`scripts/configura-db-condiviso.mjs`, `scripts/crea-chiave.mjs`, `scripts/esporta-vcard-google.mjs`,
`scripts/importa-hubspot-contatti.mjs`.

## 9. Gotchas (imparati a caro prezzo)

- **SQL raw sul cluster condiviso**: qualificare SEMPRE lo schema (`"anagrafiche"."Partner"`),
  altrimenti via pgbouncer il `search_path` non è garantito e si colpisce la tabella di un'altra
  app (errore 42703). È già così in `azioni.ts`/`dashboard`/`Sidebar`.
- **Prisma generate su Windows**: se dà `EPERM` sul `query_engine.dll`, ferma prima il dev server.
- **db push** con nuove colonne unique può chiedere `--accept-data-loss` (ok se non ci sono duplicati).
- **Branch scout-ui condiviso** (vedi §2): committa solo i tuoi file, allinea spesso.
- Warning `LF → CRLF` sui commit: innocuo (Windows).

## 10. Regole di lavoro (dal CLAUDE.md / memoria)

Handoff+doc aggiornati a ogni commit; commit spesso e verificati; niente segreti nel codice;
1 sessione per cartella; conferma azioni esterne; push; riportare l'esito reale. Dopo modifiche
UI, far verificare all'utente. Ogni feature va confrontata con la fonte di verità funzionale
(`deluxy-platform-next/docs/COME-FUNZIONA-APP-DELUXY.md`).
