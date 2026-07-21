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
- **`/identita-aziende`** — cruscotto che raccoglie le tre viste dell'identità: Sync HubSpot
  (N/tot collegate), Richieste di aggancio (da risolvere), Riconciliazione (referenti da riassegnare).
  Sidebar sezione **«Identità aziende»** (ex «Sync»): Panoramica · Sync HubSpot · Richieste di aggancio · Riconciliazione.
- **`/riconciliazione`** — smistamento dei **referenti** sotto anagrafiche «DA CLASSIFICARE»
  (contenitore «Contatti senza azienda (HubSpot)» + gruppi/holding creati dal sync).
  `TabellaRiconciliazione` (client): **chip di suggerimento** dell'insegna dal dominio email
  (radice dominio, esclusi i provider generici → `whereRicerca`, solo anagrafiche non-DA CLASSIFICARE);
  **selezione multipla** con barra e spostamento in blocco (`spostaContattiMulti`, updateMany);
  «Altra…» apre la modale di ricerca. Azioni: `spostaContatto` / `spostaContattiMulti` (non duplicano).
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
- **`/partner/nuovo`** e **`/partner/:id/modifica`** — form creazione/modifica. La **categoria**
  è un **select obbligatorio** dal catalogo chiuso `src/lib/categorie.ts` (16 voci, incl. CORPORATE
  e DA CLASSIFICARE); niente più testo libero. In modifica, se il record ha una categoria fuori
  catalogo (scritta da un'app) viene aggiunta in cima per non perderla. `creaPartner` valida
  `isCategoria`. NB: le API esterne possono ancora mandare categorie fuori catalogo (finiscono così
  come sono; il merge le accetta solo se il record è vuoto/DA CLASSIFICARE/ALTRO). La modifica
  include la sezione **Dati finanziari**: PEC, codice SDI, IBAN (normalizzato senza spazi,
  maiuscolo), banca, metodo/condizioni di pagamento, note amministrative e **contatto
  amministrativo** (nome/telefono/email) — campi omonimi su `Partner`, mostrati nella scheda
  nella sezione «Dati finanziari» (con P.IVA/CF/ragione sociale ripetuti lì per completezza).
  **Esposti e scrivibili via API** (20/07/2026): la risposta include il blocco `datiFinanziari`
  (campi + `aggiornamenti` = provenienza {sistema, asOf} per campo, così le app verificano la
  freschezza); il POST/PATCH li accetta come campi fattuali del merge (vince l'`asOf` più
  fresco, vuoti si riempiono, `noteAmministrative` additiva, IBAN/SDI normalizzati) e dopo la
  scrittura vengono propagati alle sedi (valori + timbri). Anche la UI timbra la provenienza
  (`sistema: "ui"`, asOf = adesso) dei campi finanziari cambiati. Contratto per le app nel
  README, sezione «Dati finanziari».
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
| POST | `/api/v1/referenti/archivia` | referenti | Archivia/ripristina un referente (Scout): `{riferimento?{sistema,idEsterno}, negozio?, citta?, referente{email?,telefono?,nome?}, archiviato?}` → trova partner (xref→negozio+città) e referente (email>tel>nome), setta `Contatto.archiviato`. `200 {ok:true}` / `404 {ok:false, reason}` |

Interne `/api/interno/*` (solo UI, cookie di sessione, NON per le app): `cerca-partner`, `cerca-hubspot`.

**Chiavi**: una per app, in `<app>/.env` (gitignored), mai committare i valori. Rigenera con
`npm run chiave -- <nome-app> [--scrittura]` (stampa la chiave una volta; nel DB solo l'hash;
la upsert è per `nome`, quindi rigenerare **ruota** l'hash: la vecchia chiave smette di valere).
Scope chiavi (3 oltre la sola lettura):
- **`scrittura`** — partner completo, PATCH/DELETE inclusi (deluxy-platform, deluxy-partner).
- **`scritturaPartner`** (`--scrittura-partner`, es. `deluxy-scout-partner`) — **solo `POST /partners`**
  (no PATCH/DELETE → 403) E può impostare **stato/interessi** (driver di prima parte: Scout dichiara
  «cliente»→attivo, con audit in `PassaggioStato`). Le chiavi `scrittura` generiche NON sbloccano i
  curati (restano proposte). Sblocco gestito in `calcolaMerge(..., {sbloccaCurati})` + create path;
  `autentica(req, {partner:true})` passa con scrittura piena O scritturaPartner.
- **`scritturaReferenti`** (`--scrittura-referenti`, es. `deluxy-scout-referenti`) — solo
  /referenti/archivia. `autentica(req, {referenti:true})` passa con scrittura piena O referenti.
Le app con chiave: `deluxy-platform` (scrittura), **`deluxy-partner` (scrittura dal 20/07/2026**,
ruotata da lettura → la vecchia read key non vale più, aggiornare `ANAGRAFICHE_API_KEY` in
deluxy-partner sia per lettura che scrittura), `deluxy-suppliers`, `deluxy-scout` (lettura). Il
**nome** della chiave = la sorgente nella provenienza/ranking. La cascata d'identità in scrittura:
xref → platformId → P.IVA/CF → nome+città.

### Integrazione deluxy-partner ↔ FIC (Fatture in Cloud) — piano
Obiettivo: i clienti di fatturazione FIC portano identità fiscale + dati finanziari nel registro.
**Scoperta chiave (20/07/2026): 0 anagrafiche su 578 hanno la P.IVA** — la riconciliazione per
P.IVA oggi dà 0 match. Quindi il bootstrap è **per NOME**, ed è FIC (che ha le P.IVA) ad arricchire
il registro, non il contrario. Flusso sicuro (evita doppioni: il POST matcha per nome+città
ESATTO, mentre `/match` è fuzzy):
1. Per ogni cliente FIC: `GET /api/v1/partners/match?nome=<nome>&idEsterno=<idFic>&sistema=partner`
   → `esito` agganciata/candidati/nessuna + confidenza. Ogni chiamata è loggata in `RichiestaMatch`.
2. Il team rivede gli ambigui nella pagina **/match** e risolve (crea xref `partner`→id FIC).
3. Da lì `POST /api/v1/partners` **con `idEsterno`** (risolve per xref, esatto) + `pIva` + blocco
   finanziario + `asOf`: scrive identità fiscale e fatturazione, propagate alle sedi dell'insegna.
   I "nessuna" si importano come nuove anagrafiche-cliente.
Misura pendente (solo lato partner, i nomi FIC vivono in Fatture in Cloud): quanti clienti FIC
trovano un match nel registro. Lato registro misurato: 578 attivi, 316 boutique, **0 con P.IVA**.

## 6. Integrazioni

- **Linee di interesse — MASTER è Deluxy Scout** (22/07/2026): il catalogo interessi non è più
  hardcodato. `src/lib/linee.ts` `getLinee()` legge live `GET …supabase…/functions/v1/linee?soloAttive=1`
  con `x-api-key: LINEE_API_KEY` (secret .env + Vercel), cache 1h, fallback al catalogo statico
  allineato in `src/lib/interessi.ts` (9 nomi canonici). Il valore memorizzato in `Partner.interessi[]`
  è il **nome canonico** ("Consegne", "Eventi & Catering", …); colore derivato dal nome
  (`coloreInteresse`). Migrazione dati fatta (slug→nomi: catering+eventi→Eventi & Catering,
  in_store+pr_activation→Clientelling, vendor→Food Supplier, ecc.). Sidebar/dashboard leggono live;
  MenuInteressi usa il fallback statico se non riceve `linee`. `eAffiliatoReseller` = Affiliazioni|Re-seller.
  Le API accettano i nomi canonici così come arrivano (Scout li manda già giusti).

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

`db:push`, `import:excel`, `import:hubspot-contatti` (con `--crea-aziende`: crea l'anagrafica
mancante dalla company HubSpot così nessun contatto viene scartato — genera prospect «DA
CLASSIFICARE» a livello di gruppo/holding da riordinare; con `--importa-orfani` anche i
contatti senza azienda associata entrano, agganciati all'anagrafica-contenitore «Contatti
senza azienda (HubSpot)» da riassegnare a mano), `export:vcard`, `chiave`,
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
