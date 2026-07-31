# Deluxy Anagrafiche — Handoff / Stato del progetto

> Documento per riprendere il lavoro da zero in una nuova sessione. Aggiornato il 26/07/2026.
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
  (MAIUSCOLO: BOUTIQUE/FIORISTA/PASTICCERIA/…/`DA CLASSIFICARE`), **tre stati indipendenti**
  (catalogo unico in `src/lib/stati.ts`, dal 23/07/2026):
  · `stato` = **stato commerciale** (ex "stato", nome del campo invariato per compatibilità):
  prospect·in_contatto·in_attesa·in_trattativa·da_ricontattare·attivo(=Partner)·non_interessato·dismesso;
  · `statoFinanziario` = da_verificare(default)·regolare·in_ritardo·insoluto·piano_di_rientro·bloccato;
  · `statoAnalisi` = pp(P.P., pari perimetro)·nuovo·dismesso, vuoto = mai analizzata — catalogo preso
  da **FINANCE** (`Partner.clienteAnno` di deluxy-partner, "P.P./Nuovo/Dismesso": in API si accettano
  anche quelle forme e si normalizzano),
  `citta`/`provincia`/`regione`, `indirizzo`, `email`, `telefono`, `pIva`, `codiceFiscale`,
  `account`, `ultimaVisita`, `interessi[]` (multi, `src/lib/interessi.ts`: consegne·affiliazione·
  gifting·catering·eventi·pr_activation·in_store·vendor), `note`, `datiExtra` (JSON tracker),
  `platformId` @unique, `hubspotId` @unique, `provenienzaCampi` (JSON: chi/quando per campo),
  `fonte` (excel·platform·manuale·ui·hubspot), `attivo` (soft delete),
  `capogruppoId` → self-relation `capogruppo`/`sedi` (gruppi aziendali a un livello).
- **Contatto** — referenti (persone): `ruolo·nome·telefono·email·fonte·hubspotId` (id del
  contatto nel CRM, per aprirlo) · `nomeRubrica` (nome per la rubrica Google; se vuoto si
  usa `[STATO] [AZIENDA] [CITTÀ] [Nome contatto]`). Fonti: Excel + HubSpot.
- **FeedbackD2C** (26/07/2026) — il giudizio **INTERNO** su come il partner ha lavorato una
  consegna D2C. **Non è una recensione del cliente finale**: lo scrive Deluxy (chi ha seguito
  l'ordine, il customer service su un reclamo, un controllo). Campi: `voto` 1–5
  (+ `votoOriginale`/`scala` per chi usa 1–10), `origine` (consegna·reclamo·controllo·visita·
  segnalazione·altro), `sistema` (chi l'ha mandato) + `idEsterno` (idempotenza), `ordine`,
  `autore` (chi ha valutato, dentro Deluxy), `commento`, `motivi[]` (catalogo chiuso),
  `dataFeedback`. Da qui si ricalcolano gli
  aggregati su **Partner**: `votoD2C` (media), `numeroFeedbackD2C`, `ultimoFeedbackD2C`,
  `votoD2CAggiornatoIl` — sola lettura, si scrive solo un feedback (`src/lib/feedback-d2c.ts`,
  `ricalcolaValutazioneD2C`). **Zero feedback = nessun voto («Da valutare»), MAI zero**;
  sotto 3 feedback il voto si mostra «indicativo» (`SOGLIA_AFFIDABILE`). Le medie di gruppo
  sono **pesate sui feedback**, non medie di medie (`valutazioneAggregata`).
- **RiferimentoEsterno** — xref `(sistema, idEsterno)` @unique → partner. Generalizza
  platformId/hubspotId: è la "lingua comune di id" tra le app.
- **RichiestaMatch** — storico delle richieste di aggancio (`/api/v1/partners/match`): sistema,
  tipo, esito, confidenza, partner risolto, `risolto`.
- **PassaggioStato** — storico dei cambi di stato/archivio (da·a·origine·quando).
- **Valet** (30/07/2026) — le persone che fanno le consegne. Qui c'è **l'anagrafica**: nome,
  cognome, telefono, email, indirizzo, città/provincia, `provinceServite` (sigle a testo, per
  cercarlo), `mezzo`, `codiceFiscale`/`pIva`, `stato` (in_servizio·sospeso·cessato, catalogo in
  `src/lib/valet.ts`), `note`, `platformId` @unique (ponte con la piattaforma), `fonte`, `attivo`
  (soft delete come i partner).
  **Non** c'è la sua operatività: paghe per servizio, province assegnate, disponibilità giorno per
  giorno, stipendi, ricevute e ritenute restano nella **piattaforma consegne**, che di quel pezzo è
  il master e che i valet li paga (lì `Valet` ha `ValetService`, `ValetProvince`,
  `ValetAvailability`, `Salary`, `withholdingPercent`…). Duplicarli qui rifarebbe il danno che il
  registro esiste per evitare. Stessa ragione per cui l'IBAN non c'è.
  **Perché non un `Contatto`**: un Contatto è il referente di un'AZIENDA e vive attaccato a lei
  (`partnerId` obbligatorio, cascade). Un valet non è di nessuna azienda, è di Deluxy.
- **Modifica** (30/07/2026) — **registro delle modifiche**: una riga per campo cambiato, con
  `campo`, `da`, `a`, `origine` (`ui` o il nome della chiave dell'app), `autore` (quando lo
  sappiamo) e `creatoIl`. Il soggetto è un'azienda (`partnerId`, cascade) **oppure un valet**
  (`valetId`, dal 30/07/2026): uno dei due è sempre valorizzato. `contattoId` è valorizzato quando
  riguarda un referente, così la sua scheda mostra solo la sua storia.
  Risponde a tre domande che prima non ne avevano: la **storia** di un campo (`provenienza` tiene
  solo l'ultimo scrittore, e solo dei campi finanziari), le modifiche ai **referenti** (che non
  lasciavano traccia da nessuna parte) e le **cancellazioni** (un referente o un feedback rimosso
  sparivano senza dire chi li aveva toccati). Gli stati restano in `PassaggioStato` — lo leggono
  anche le API — e la timeline della scheda unisce i due flussi invece di duplicarli.
  Helper unico: `src/lib/log-modifiche.ts` (`diffCampi` scarta i campi che non cambiano davvero,
  altrimenti ogni salvataggio scriverebbe decine di righe finte; `registraModifiche` non fa mai
  fallire l'operazione che l'ha chiamata).
- **ApiKey** — chiavi delle app client (solo SHA-256 nel DB): `nome` @unique (= la sorgente nella
  provenienza), `hash`, i 4 flag di permesso, `attiva`, `creataIl`, `ultimoUso`, e dal 29/07/2026
  `prefisso` (primi 12 caratteri in chiaro, per riconoscerla in elenco: non basta per autenticarsi)
  e `note` (a cosa serve). Si gestiscono dalla pagina `/chiavi` o da `npm run chiave`.

### Regola automatica: chi entra dai fornitori è «Affiliazioni» (26/07/2026)
Le scritture `POST /api/v1/partners` che arrivano dall'**app di ricerca fornitori** aggiungono
da sé l'interesse **«Affiliazioni»** (nome canonico del catalogo Scout, non «Affiliazione»):
in creazione lo mettono anche se la chiave non è un driver di prima parte, in merge lo
**aggiungono** (`push`) se manca. Riconoscimento della sorgente in `eRicercaFornitori`
(`src/lib/interessi.ts`): `sistema` che contiene `supplier`/`fornitor` o che inizia per
`search`. È additivo: non tocca gli altri interessi e non ne toglie mai — il team può
correggerlo dal registro.
**Recupero dello storico fatto il 26/07/2026**: la regola è stata applicata a mano alle 8
anagrafiche vive già arrivate da quell'app (2 record di prova archiviati saltati) e la vecchia
dicitura minuscola `affiliazione` di un record Excel è stata normalizzata su `Affiliazioni`.
Restano da normalizzare `consegne` (7) vs `Consegne` (5): stessa linea scritta in due modi,
residuo della migrazione slug→nomi canonici.

### Motore di merge multi-sorgente (`src/lib/merge.ts`) — Fase 1 dell'architettura
Ogni scrittura via API è un **merge governato per campo**, mai una sostituzione:
- **Bloccati** (curati dal team): `stato` (commerciale), `interessi` mai sovrascritti; `account`/`categoria`
  solo se vuoti (categoria: anche se `DA CLASSIFICARE`/`ALTRO`).
- **Fattuali** (nome, ragioneSociale, città, indirizzo, email, telefono, pIva, CF, ultimaVisita,
  **statoFinanziario**, **statoAnalisi**: questi due nascono in FINANCE, quindi le app li scrivono —
  `da_verificare` vale come casella vuota; fiducia `partner` = 70, sotto platform, sopra scout):
  **vince il più fresco** (`asOf`) o, a parità, la sorgente più **autorevole** (ranking di
  fiducia: ui 100 > platform 80 > scout 60 > suppliers 55 > hubspot 40 > … > sconosciuta 20).
  I campi vuoti si riempiono sempre. La provenienza per campo è in `provenienzaCampi`.
- **Additivi**: `note` (append), `contatti` (merge per identità email>telefono>nome, mai wipe).

## 4. Funzionalità UI (pagine)

- **`/`** Aziende (ex "Visione globale") — elenco con ricerca "a parole" su tutti i campi + referenti, filtri
  (categoria/città/**stato commerciale/stato finanziario/stato analisi**/interesse), ordinamenti
  cliccabili, **sezione Novità** (top 10 tra
  data creazione e ultimo contatto), colonne Interessi/Ultimo contatto/Note, cambio
  dei **tre stati** e degli interessi in riga (menu a tendina sul badge, `MenuStato` per il
  commerciale e `MenuStatoAzienda` per finanziario/analisi), archivia/ripristina,
  riconciliazione HubSpot (⇄), bottone **＋ Nuovo**.
  **Gruppi aziendali** — due meccanismi che si sommano:
  1. **Automatico per insegna** (nessun dato da preparare): le anagrafiche con lo stesso `nome`
     collassano in un'unica riga espandibile «NOME · N sedi · città…»; il ▸ mostra le sedi, ognuna
     riga completa con stato/interessi/azioni proprie. La testata del gruppo è solo presentazione,
     non è un'anagrafica. Raggruppamento fatto a render time in `src/app/page.tsx` (mappa per nome).
  2. **Manuale** (`Partner.capogruppoId`, self-relation `capogruppo`/`sedi`, un livello) per le
     insegne scritte diversamente (es. «BOTTEGA VENETA FLAGSHIP»): `⧉ Raggruppa` nella scheda.
  Le sedi collegate a mano non compaiono come righe a sé (`where.capogruppoId = null`).
  **Durante una ricerca (`?q=`) l'elenco torna piatto**, così una sede resta trovabile per nome.
  ⚠️ Proprio per questo una sede che corrisponde alla ricerca arriva **due volte** (riga propria +
  dentro le `sedi` della madre): il raggruppamento **deduplica per id** (31/07/2026). Senza,
  compariva due righe identiche e sembrava un doppione nei dati — mentre nel database il record
  era uno solo.
  Nota: la paginazione conta i record, non i gruppi — una pagina da 50 record mostra meno righe.
- **`/dashboard`** — analisi con **macro-filtri** (tipologia/regione/stato commerciale/stato
  finanziario/stato analisi/interesse in AND): KPI (compreso **A rischio incasso** = ritardo →
  bloccato), funnel per stato commerciale, **stati finanziari**, **perimetro di analisi**,
  interessi, tipologie/regioni/città, contatti per mese, qualità dati.
- **`/contatti`** — rubrica di tutti i referenti (Excel + HubSpot), ricerca, filtro fonte,
  colonna **Azienda** (link alla scheda), telefoni cliccabili (`tel:` → avvia la chiamata),
  colonna **Google** («Salva in Google» via People API + fallback .vcf), link al contatto HubSpot (↗).
- **`/contatti/:id`** — scheda del referente (click sul nome in /contatti): modifica
  nome/ruolo/telefono/email + **Nome su rubrica** (`aggiornaContatto`) ed eliminazione
  (`eliminaContatto`). Il nome Google è `Contatto.nomeRubrica` se compilato, altrimenti
  `[STATO] [AZIENDA] [CITTÀ] [Nome contatto]` (`src/lib/rubrica.ts`).
  **Storia della persona (30/07/2026)**: le righe di log con `contattoId` = questo referente —
  campi cambiati, spostamenti fra sedi, archiviazioni dalle app. Il log segue la **persona**, non
  l'azienda di adesso: se è stata spostata, le righe scritte sotto l'azienda precedente restano e
  si mostrano con il nome di quell'azienda accanto.
- **`/sync-hubspot`** — confronto registro ↔ companies HubSpot (match per nome normalizzato +
  riferimenti): riepilogo, liste "solo HubSpot"/"solo registro"/"in entrambi", ricerca+ordinamenti,
  **⇄ riconcilia** (crea xref hubspot), **＋ importa** company come prospect DA CLASSIFICARE.
- **`/match`** — storico delle richieste di aggancio delle app (tipo, esito, app, confidenza);
  **Risolvi** (crea xref) le ambigue, **Modifica** quelle già agganciate, **Ignora** il rumore.
- **`/identita-aziende`** — cruscotto che raccoglie le tre viste dell'identità: Sync HubSpot
  (N/tot collegate), Richieste di aggancio (da risolvere), Riconciliazione (referenti da riassegnare).
  Sidebar sezione **«Identità aziende»** (ex «Sync»): Panoramica · Sync HubSpot · Richieste di aggancio · Riconciliazione.
- **`/riconciliazione`** — **due ambiti (31/07/2026)**, perche sono due lavori diversi: *Da
  smistare (contenitori)* e la **coda** da svuotare (predefinito, il comportamento di sempre), *Tutti
  i referenti del registro* e uno **strumento**: una persona finita sotto l azienda sbagliata prima
  da qui non si poteva nemmeno trovare. In ambito «tutti» i **suggerimenti dal dominio email** non
  si calcolano (per chi sta gia sotto un azienda vera sarebbero rumore) e restano comunque al
  massimo 12 per pagina: e una query per radice distinta.
  Smistamento dei **referenti** sotto anagrafiche «DA CLASSIFICARE»
  (contenitore «Contatti senza azienda (HubSpot)» + gruppi/holding creati dal sync).
  `TabellaRiconciliazione` (client): **chip di suggerimento** dell'insegna dal dominio email
  (radice dominio, esclusi i provider generici → `whereRicerca`, solo anagrafiche non-DA CLASSIFICARE);
  **selezione multipla** con barra e spostamento in blocco (`spostaContattiMulti`, updateMany);
  «Altra…» apre la modale di ricerca. Azioni: `spostaContatto` / `spostaContattiMulti` (non duplicano).
- **Valutazione D2C nella UI** (26/07/2026): sezione **Valutazione D2C** nella scheda partner
  (voto grande + fascia, distribuzione delle stelle su tutti i feedback, elenco degli ultimi 30
  con origine/chi valuta/motivi/commento e ✕ per eliminarne uno, **＋ Feedback** per registrare
  un giudizio interno → `registraFeedbackD2C`, sorgente `ui`, campo «Chi valuta» = `autore`); colonna ordinabile **D2C** nell'elenco `/` (e in Novità)
  con i partner senza voto sempre in fondo; filtro «Valutazione D2C» (con feedback / da valutare);
  scheda **Valutazione D2C** in dashboard (fasce + media pesata della fetta).
- **`/partner/:id`** — scheda: anagrafica, **tre righe di pillole** (Commerciale · Finanziario ·
  Analisi, `SelettoreStato` + `SelettoreStatoAzienda`) + menu interessi, ✎ Modifica, archivia,
  sezione **Contatti** (Excel+HubSpot con link al CRM, telefono cliccabile, **✕ rimuove il
  referente** dall'azienda → `staccaContatto`), Note, Dati del tracker, **Storia** (timeline).
  **Storia = log completo (30/07/2026)**: non più solo i cambi di stato. Ogni riga dice *quale
  campo* è cambiato, *da* cosa *a* cosa e *da dove* («dal registro» o il nome dell'app), incluse le
  modifiche ai referenti, gli spostamenti fra sedi, le sedi aggiunte/collegate/sganciate e i
  feedback aggiunti o eliminati. Ultime 120 righe; la creazione non si ripete (in fondo c'è già
  «Creata»). Coperto sia dalla UI (`aggiornaPartner`, referenti, sedi, interessi, feedback) sia
  dalle **API** (`POST`/`PATCH /partners` registrano i campi che quell'app ha davvero applicato —
  il diff parte da `datiMerge`, quindi i campi che hanno perso il confronto di autorevolezza non
  compaiono — e `POST /referenti/archivia`).
  **Il log parte dal 30/07/2026**: quello cambiato prima non è tracciato.
  **Referenti per sede (29/07/2026)** — i referenti sono di **quella sede**, non dell'insegna:
  due negozi hanno persone diverse. La sezione Contatti compare **anche a zero referenti** (una
  sede appena aperta è proprio il caso in cui serve aggiungerne uno) con **＋ Referente**
  (`AggiungiReferente` → `aggiungiReferente(partnerId, fd)`, fonte `ui`, ruolo in maiuscolo,
  serve almeno nome/telefono/email). Quando l'insegna ha più luoghi compare la colonna
  **Sposta in**: un menu con gli altri luoghi (etichetta «città · indirizzo») che sposta il
  referente con `spostaReferenteInSede` — **si sposta, non si ricrea**, quindi la persona si
  porta dietro `hubspotId` e lo storico.
  **Dalla rubrica Google (29/07/2026)** — `CercaInRubrica`: pesca il referente dalla rubrica
  dell'account con cui l'operatore si collega (in azienda `deluxy.delivery@gmail.com`) invece di
  ridigitarlo. Stesso OAuth e stesso scope `contacts` del salvataggio automatico, nel verso
  opposto (People API `searchContacts`, con la **warm-up call obbligatoria**: senza, la prima
  ricerca torna vuota anche se il contatto c'è).
  **La scelta è multipla e il riquadro non si chiude a ogni click**: da un negozio si prendono
  titolare e persone in sala, e richiuderlo ogni volta vorrebbe dire riaprire, riautorizzare e
  ricercare. Le spunte **sopravvivono al cambio di ricerca** (mappa chiave→persona, non lista),
  il piede dice quante sono e con chi, si conferma una volta sola.
  Sta in due posti, e fanno due cose diverse:
  · **scheda** (`ReferentiDallaRubrica`, accanto a ＋ Referente) → `aggiungiReferentiDaRubrica`
    li **crea subito** tutti; chi ha già lo stesso telefono (ultime 9 cifre) o la stessa email
    fra i referenti viene **saltato**, non duplicato, e l'esito lo dice («2 referenti aggiunti ·
    1 già in elenco»). Un modulo a una riga non poteva reggere più persone insieme.
  · **form di modifica** (`RubricaNelModulo`) riempie **le righe libere in ordine** e si salva
    col resto — scrivere subito farebbe perdere le modifiche non salvate negli altri campi. Se
    le persone sono più delle righe lo dice coi numeri («inserite 2 di 3»), invece di perderne
    una in silenzio.
  Il nome viene **ripulito** con `nomePersonaDaRubrica` (src/lib/rubrica.ts), l'inverso di
  `nomeRubricaDefault`: toglie stato, azienda, città e le etichette dell'app fornitori
  («PARTNER Basara Milano MILANO Mara Roveda» → «Mara Roveda»), altrimenti quella zavorra
  rientrerebbe nel registro a ogni import. Se non resta niente si tiene il nome originale.
  ⚠️ Il riquadro esce in un **portale sul body**: vive dentro il `<form>` della pagina di
  modifica e un form dentro un form è HTML non valido — con l'Invio che salvava l'anagrafica
  mentre cercavi una persona. Ce n'eravamo accorti solo dagli errori in console.
  ⚠️ **Corretto un guasto silenzioso (29/07/2026)**: `aggiornaPartner` faceva
  `contatti: { deleteMany: {}, create: [...] }`, cioè a **ogni** salvataggio della scheda
  cancellava e ricreava i referenti — perdendo `hubspotId`, `fonte`, `nomeRubrica` e
  l'archiviazione, che il form non conosce. Ora il form manda anche `c<i>-id` e i referenti si
  **aggiornano per id** (`update`/`create`/`deleteMany` mirati); riga svuotata = rimosso, come
  prima. Verificato sul contatto HubSpot di Basara Milano: dopo il salvataggio conserva id,
  `fonte: hubspot` e `hubspotId`.
  **Gruppi** — i due bottoni sono l'uno l'inverso dell'altro, e dal 31/07/2026 **il nome dice il
  verso**: `⧉ Raggruppa` veniva letto al contrario (sembrava «aggancia altre a questa») ed è
  diventato **↳ È una sede di…**, mentre `＋ Sede` è **＋ Sedi di questa**. Ogni modale dichiara la
  direzione in testa e rimanda all'altra: se l'operazione è quella opposta, si scopre lì invece
  che dopo averla fatta.
  `↳ È una sede di…` (`GestioneGruppo`) mette l'anagrafica sotto un'insegna madre;
  una sede mostra «Sede del gruppo X» + «Togli dal gruppo»; la madre ha la sezione
  **Sedi del gruppo** (✕ per sganciarne una). Azione unica `raggruppaSotto(partnerId, capogruppoId|null)`.
  **＋ Sede (29/07/2026)** — `AggiungiSede`, bottone in testata e nella sezione **Sedi**, che ora
  compare **anche a zero sedi** (altrimenti non si sa che si può). Due strade nella stessa modale:
  · **Nuova sede** → `aggiungiSede(madreId, fd)`: nel modulo si scrive **solo ciò che cambia da una
    sede all'altra** (nome della sede, città, provincia, indirizzo, telefono, email); il resto
    arriva dall'insegna e la nota in fondo **lo elenca coi valori veri**, se no i campi vuoti
    sembrano dati persi. L'indirizzo resta vuoto apposta: una sede nuova è un altro luogo.
    ⚠️ **La provincia è un campo del modulo (31/07/2026)**: prima veniva ereditata dall'insegna e
    basta, quindi una sede a Roma creata da un'insegna di Firenze nasceva con provincia FI —
    sbagliata in silenzio.
    Crea l'anagrafica già collegata (`capogruppoId`),
    eredita da madre categoria/stati/interessi/account/ragione sociale e, via `propagaDatiFinanziari`,
    tutta la fatturazione. **A distinguere due sedi nella stessa città è l'indirizzo**: il guard sul
    duplicato è nome+città+indirizzo, non nome+città come in `creaPartner` (che infatti bloccherebbe
    la seconda boutique in centro). Senza indirizzo, la seconda sede con stesso nome e città viene
    rifiutata con un messaggio, non creata di nascosto.
  · **Collega esistenti** → `collegaSedi(madreId, sedeIds[])`, a **selezione multipla** (31/07/2026): come `raggruppaSotto` visto dalla
    madre, ma **dice perché** quando non si può (madre già sede, oppure la candidata ha sedi proprie:
    i gruppi restano a un livello). Le spunte **restano cambiando ricerca**, così si pescano i
    negozi uno a uno e si collegano in un gesto solo: una alla volta significava riaprire la
    modale e ricercare per ognuno, cioè lasciare il gruppo a metà. Chi non si può collegare **non
    ferma gli altri** e torna indietro col proprio motivo. Nell'elenco delle sedi c'è la colonna
    **Indirizzo**.
  **Un'anagrafica ha UNA sola insegna** (`capogruppoId` singolo): non si può dire «è sede di
  Milano e anche di Roma». Non è un limite da togliere — se una sede avesse due insegne, «di chi è
  questo negozio?» non avrebbe risposta e la fatturazione, che è dell'insegna, resterebbe ambigua.
  Quando serve mettere insieme N anagrafiche il verso giusto è l'altro: **una è l'insegna, le
  altre sono sue sedi**.
  **E spesso non serve affatto**: le anagrafiche con lo **stesso nome** sono già lo stesso gruppo —
  l'elenco le mostra unite e `datiFinanziariCondivisi` le tratta come una società sola (il match è
  per nome). Il legame manuale serve solo quando l'insegna è **scritta in modo diverso**.
  Dal 31/07/2026 la sezione **Sedi** lo dice sulla scheda: elenca **tutti gli altri luoghi
  dell'insegna** — sedi formali, madre e sorelle se questa è una sede, e le omonime non collegate —
  con il conteggio «N luoghi in tutto». Prima da una sede non si vedeva nulla, e si finiva a
  cercare di dare a un'anagrafica due insegne.
  ⚠️ Da una **sede** i due bottoni non compaiono: una sede non può avere sedi proprie. È il
  motivo per cui su un'anagrafica già raggruppata la scheda sembra «senza azioni».
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
  **Gruppo di pagamento (29/07/2026)** — campo **facoltativo** `gruppoPagamento`: quando è
  compilato **paga una centrale per tutte le sedi** e le singole sedi non si fatturano a parte.
  È un campo finanziario a tutti gli effetti (condiviso e propagato all'insegna, nel merge, nelle
  API dentro `datiFinanziari` con il timbro in `aggiornamenti`). Nella scheda non sta in mezzo agli
  altri campi: se c'è, apre la sezione con la riga in evidenza «Pagamento centralizzato: paga X per
  tutte le sedi» — è una risposta a «chi paga», si legge prima dell'IBAN. Vuoto = ogni sede paga per sé.
  **Condivisi a livello di insegna** (`src/lib/insegna.ts`, `CAMPI_FINANZIARI` = pIva,
  codiceFiscale, pec, codiceSdi, iban, banca, metodo/condizioni pagamento, **gruppo di pagamento**,
  note ammin., contatto ammin.): la fatturazione è della società, non della singola sede. La scheda e il
  form li leggono via `datiFinanziariCondivisi` (merge per campo tra le sedi della stessa
  insegna = stesso nome, o sedi collegate a mano alla madre con quel nome); al salvataggio
  `aggiornaPartner` chiama `propagaDatiFinanziari` che li copia su tutte le sedi (updateMany).
  Compili una volta su una sede → valgono per Milano/Roma/Capri. NON condivisi: ragioneSociale,
  indirizzo, città, telefono/email, stato, interessi, referenti (restano per-sede).
- **`/valet`, `/valet/nuovo`, `/valet/:id`, `/valet/:id/modifica`** — **anagrafica dei valet
  (30/07/2026)**: la rubrica delle persone che fanno le consegne, accanto a quella dei referenti
  delle aziende («contatti per aziende e per valet»). Elenco con ricerca (nome, telefono, email,
  città, province servite), filtro per stato con conteggi, archiviati a parte. Form unico
  `FormValet` per Nuovo e Modifica, in tre blocchi: **la persona**, **come lavora** (province
  servite + mezzo) e **identità fiscale** (facoltativa). Sulla scheda: pillole dello stato di
  servizio (come i partner), ✎ Modifica, ⌫ Archivia e la **Storia** dei cambiamenti.
  **Doppione per telefono**: creando un valet con un numero già in elenco (confronto sulle ultime
  9 cifre, quindi `+39 348 1234567` e `3481234567` sono la stessa persona) non si crea un secondo
  record — si apre la scheda esistente con un avviso. È l'unico dato che identifica davvero una
  persona in un elenco di consegne.
  Lo **stato di servizio non è nel form di modifica**: si cambia dalle pillole, come i tre stati
  del partner, così ogni cambio resta un gesto tracciato e non un campo salvato per sbaglio.
- **`/affiliati`** — **pagella di affiliati e re-seller (30/07/2026)**: sono loro a servire le
  consegne D2C, quindi sono loro ad avere un voto. Popolazione = anagrafiche attive con linea
  **Affiliazioni** o **Re-seller** (`INTERESSI_AFFILIAZIONE` in `src/lib/interessi.ts`, unica
  definizione usata anche da `eAffiliatoReseller`). KPI (quanti sono · quanti hanno una pagella ·
  quanti critici), tabella **dal peggiore al migliore con i mai valutati in fondo**
  (`votoD2C asc nulls last`: chi non ha giudizi non è il problema più grave), e **Ultimi reclami
  arrivati** con casistica, gravità, se è risolto, ordine e app che l'ha mandato.
  Voce «Affiliati e re-seller» nella sezione Registro della sidebar, col conteggio.
- **`/chiavi`** — **gestione delle chiavi API dalla UI (29/07/2026)**: chi chiama il registro, con
  che permessi, quando l'abbiamo visto l'ultima volta. Prima si potevano creare solo da terminale
  (`npm run chiave`): ora si **aggiungono, si tolgono e si cambia loro tipologia** senza terminale,
  con lo stesso effetto sul database (nel DB resta solo lo SHA-256).
  - **Tipologie** (`src/lib/chiavi.ts`, catalogo unico): Sola lettura · Scrittura piena · Driver di
    prima parte (upsert partner) · Archivio referenti · Feedback D2C · Personalizzata. La tipologia
    **è il nome della combinazione di permessi**, non una colonna: le pillole spuntano i permessi
    giusti, sotto restano i 4 singoli ambiti (con endpoint e spiegazione) perché è lì che si decide
    davvero. La **lettura è implicita** su ogni chiave attiva.
  - **Azioni**: ＋ Nuova chiave (mostra il valore in chiaro **una volta sola**, con Copia) ·
    Permessi (cambia tipologia e nota) · Rigenera (ruota l'hash: la vecchia smette di valere
    all'istante) · Sospendi/Riattiva (reversibile, `attiva=false` → 401) · Elimina (definitiva).
    Rigenera ed Elimina chiedono conferma.
  - **Nome normalizzato** («Prova Chiavi UI» → `prova-chiavi-ui`): è anche la **sorgente** nella
    provenienza e nel ranking del merge, quindi non si rinomina — si crea/rigenera.
  - Colonne nuove su `ApiKey`: `prefisso` (primi 12 caratteri in chiaro, solo per riconoscerla in
    elenco) e `note` (a cosa serve). Le chiavi create prima d'ora hanno `prefisso` nullo → in
    elenco «prefisso ignoto (chiave creata da terminale)»; rigenerandole lo prendono.
  - **Attenzione**: la UI è protetta dalla sola password condivisa dell'app, e da qui si creano
    chiavi di scrittura piena → quella password vale quanto le chiavi. Con il login dall'Hub
    (§7) andrebbe ristretta agli admin.
- **Campo «Sede» (31/07/2026)**: come si chiama QUESTA sede dentro l'insegna — «Montenapoleone»,
  «Flagship», «Outlet». Serve perché le sedi di un gruppo hanno tutte lo **stesso `nome`**: senza
  etichetta si distinguono solo dall'indirizzo, e chi non ce l'ha resta una riga muta in mezzo
  alle sorelle. Sta nei form Nuovo e Modifica, nella modale **＋ Sede**, sulla scheda, nella
  tabella delle sedi (dove diventa il titolo della riga, col nome dell'insegna sotto) e nel menu
  «Sposta in» dei referenti. Nell'elenco identifica la riga: **sede · indirizzo**, poi il solo
  indirizzo, e se mancano entrambi «sede senza nome né indirizzo» in arancio.
  È un campo fattuale come gli altri (merge, API `sede`, log delle modifiche).
- **Account commerciale a scelta di lista (30/07/2026)**: nei form Nuovo e Modifica non è più
  testo libero ma un menu. Il MASTER è **Deluxy Budgets**: si legge il team «Commerciale» da
  `GET /api/v1/team` (chiave `BUDGETS_API_KEY`, cache 1h) — l'organico nasce dal budget del
  personale, tenerne una copia qui vorrebbe dire non aggiornarla mai. Più le persone che seguono
  anagrafiche pur non stando in quella squadra (`SEMPRE_IN_ELENCO` in `src/lib/commerciali.ts`:
  oggi **Nicolò Donato**, che in Budgets è amministratore e risulta senza team).
  **Il valore già presente sull'anagrafica resta in cima all'elenco anche se fuori lista**: chi non
  c'è più non deve sparire dal record aprendo la modifica. Se Budgets non risponde, il fallback
  sono i nomi già in uso nel registro.
  ⚠️ **L'account non si mette più in MAIUSCOLO** (`creaPartner`/`aggiornaPartner`): i nomi arrivano
  da Budgets con la loro grafia, e forzarli avrebbe fatto sì che il valore salvato non combaciasse
  più con l'opzione del menu. I valori vecchi («ELEONORA», «GAIA, ELEONORA») restano come sono.
- **Sidebar** a sezioni espandibili (Registro·Tipologie·**Stati commerciali·Stati finanziari·Stati
  analisi**·Interessi·Archivio·Identità aziende·**Impostazioni → Chiavi API**), con i conteggi per
  ogni stato, toggle a scomparsa (☰), preferenze in localStorage.

## 5. API (base `https://deluxy-anagrafiche.vercel.app`)

Pubbliche `/api/v1` — auth header `x-api-key: <chiave>` (o `Authorization: Bearer`):

| Metodo | Percorso | Permesso | Note |
|---|---|---|---|
| GET | `/api/v1/health` | — | Stato servizio |
| GET | `/api/v1/partners` | lettura | Filtri: q, categoria, citta, provincia, regione, stato (commerciale), statoFinanziario, statoAnalisi (`nessuno` = mai analizzate), interesse, fonte, platformId, attivo; page, perPage |
| GET | `/api/v1/partners/:id` | lettura | id registro, platformId, o **qualsiasi** idEsterno via xref |
| GET | `/api/v1/partners/by-ref/:sistema/:idEsterno` | lettura | Risolve dall'id di un'altra app |
| GET | `/api/v1/partners/match` | lettura | `?pIva=&codiceFiscale=&nome=&citta=&idEsterno=` → match/candidati+confidenza; registra RichiestaMatch |
| POST | `/api/v1/partners` | scrittura | Upsert-merge; body opzionale `sistema`,`idEsterno`,`asOf` |
| PATCH | `/api/v1/partners/:id` | scrittura | Aggiornamento parziale mirato |
| DELETE | `/api/v1/partners/:id` | scrittura | Soft delete (attivo=false) |
| GET | `/api/v1/feedback` | lettura | Feedback D2C: `partnerId`, `origine`, `sistema`, `votoMin/votoMax`, `dal/al`, page, perPage. Con `partnerId` include anche `valutazioneD2C` |
| POST | `/api/v1/feedback` | scrittura **o** feedback | Registra un giudizio interno (`origine`, `autore`). Aggancio: `partnerId` → `riferimento{sistema,idEsterno}` → `platformId` → `negozio`+`citta`; niente aggancio = **404** (mai attribuito a caso). `voto` obbligatorio (+`scala` per NPS/percentuali, fuori scala = 400), `idEsterno` = idempotenza (la riga viene sostituita), `motivi` solo dal catalogo. Risponde con il feedback e la valutazione ricalcolata |
| GET | `/api/v1/valet` | lettura | Elenco valet. Filtri: `q`, `stato`, `provincia` (guarda anche le province servite), `attivo` (`false`/`tutti`), page, perPage. `provinceServite` esce come **lista** e c'è `nomeCompleto` già composto |
| GET | `/api/v1/valet/:id` | lettura | Un valet, per id del registro **o** per `platformId` |
| POST | `/api/v1/referenti/archivia` | referenti | Archivia/ripristina un referente (Scout): `{riferimento?{sistema,idEsterno}, negozio?, citta?, referente{email?,telefono?,nome?}, archiviato?}` → trova partner (xref→negozio+città) e referente (email>tel>nome), setta `Contatto.archiviato`. `200 {ok:true}` / `404 {ok:false, reason}` |

Interne `/api/interno/*` (solo UI, cookie di sessione, NON per le app): `cerca-partner`, `cerca-hubspot`.

**Stati nelle API (23/07/2026)**: la risposta espone `stato` (commerciale, nome storico),
`statoCommerciale` (stesso valore, alias esplicito), `statoFinanziario` e `statoAnalisi`. In
scrittura si accettano tutti e quattro i nomi; `statoAnalisi` accetta anche "P.P."/"Nuovo"/
"Dismesso" di FINANCE. Ogni cambio finisce in `PassaggioStato` (prefissi `fin:` / `ana:`,
resi leggibili da `nomeEventoStato`).

**Chiavi**: una per app, in `<app>/.env` (gitignored), mai committare i valori. Si gestiscono
dalla pagina **`/chiavi`** (crea/rigenera/sospendi/elimina, cambio di tipologia) oppure da
terminale con `npm run chiave -- <nome-app> [--scrittura]` — stessa tabella, stesso effetto
(stampa la chiave una volta; nel DB solo l'hash; la upsert è per `nome`, quindi rigenerare
**ruota** l'hash: la vecchia chiave smette di valere).
Scope chiavi (4 oltre la sola lettura; catalogo leggibile in `src/lib/chiavi.ts`):
- **`scrittura`** — partner completo, PATCH/DELETE inclusi (deluxy-platform, deluxy-partner).
- **`scritturaPartner`** (`--scrittura-partner`, es. `deluxy-scout-partner`) — **solo `POST /partners`**
  (no PATCH/DELETE → 403) E può impostare **stato/interessi** (driver di prima parte: Scout dichiara
  «cliente»→attivo, con audit in `PassaggioStato`). Le chiavi `scrittura` generiche NON sbloccano i
  curati (restano proposte). Sblocco gestito in `calcolaMerge(..., {sbloccaCurati})` + create path;
  `autentica(req, {partner:true})` passa con scrittura piena O scritturaPartner.
- **`scritturaReferenti`** (`--scrittura-referenti`, es. `deluxy-scout-referenti`) — solo
  /referenti/archivia. `autentica(req, {referenti:true})` passa con scrittura piena O referenti.
- **`scritturaFeedback`** (`--scrittura-feedback`) — solo `POST /feedback`: manda i giudizi dei
  clienti finali senza poter toccare il golden record. `autentica(req, {feedback:true})` passa
  con scrittura piena O feedback. **Nessuna app ha ancora questa chiave**: si genera quando si
  decide chi raccoglie i feedback (candidato naturale: Deluxy Customer Service) — da `/chiavi`
  bastano due click, tipologia «Feedback D2C».
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
- **Segno del salvataggio in rubrica (31/07/2026)**: `Contatto.salvatoInRubricaIl`. Il
  salvataggio in Google avviene **nel browser** (OAuth dell operatore) e prima non lasciava
  traccia: riaprendo la scheda non si sapeva se era gia stato fatto, e si rifaceva. Ora dopo un
  salvataggio riuscito il browser chiama `segnaSalvatiInRubrica(ids)` — sia dalla tabella di
  `/contatti` sia dal salvataggio automatico della scheda, che manda un solo giro alla fine
  invece di una scrittura per persona. Vale anche per l esito **gia presente**: il punto e sapere
  che quella persona in rubrica c e.
  Si vede come **✓ In rubrica** (con la data nel tooltip) in `/contatti`, nella sezione Contatti
  della scheda partner e sulla scheda del referente; dove c e la spunta il bottone «Salva in
  Google» non ricompare. Nel log finisce **solo il primo** salvataggio.
  ⚠️ **Il campo parte vuoto per tutti**: si riempie dal prossimo salvataggio in avanti. Per
  allineare lo storico basta una passata di «Salva in Google» su `/contatti` — chi c e gia in
  rubrica viene riconosciuto dal numero e marcato senza creare doppioni.
- **Export vCard** (`npm run export:vcard` → `~/Downloads/Deluxy-Anagrafiche-Contatti.vcf`),
  importabile in bulk su contacts.google.com.

## 7. Punti aperti

Aggiornato il **30/07/2026**. Ordine: prima quello che blocca un uso reale, poi le
scelte da fare, in fondo le pulizie. Quando un punto si chiude, si cancella da qui.

### A. Integrazioni che aspettano l'altra metà

1. **Customer Service → voti degli affiliati: manca il lato Customer Service.**
   Il registro è pronto (30/07/2026): `POST /api/v1/feedback` accetta il reclamo così com'è
   (`gravita` 1|2|3 + `stato`) e ricava il voto con `votoDaReclamo` — lieve 3/4 · media 2/3 ·
   grave 1/2, secondo valore = risolto. Conserva `gravita`, `reclamoRisolto`, `casistica` perché
   un voto va spiegato; rimandando lo stesso `idEsterno` il feedback si aggiorna (il voto **sale**
   se il reclamo è stato risolto) e i campi non rispediti restano.
   Da fare **in `deluxy-messaging`**: (a) creare la chiave di tipologia «Feedback D2C» da `/chiavi`
   e metterla nel suo `.env`; (b) chiamare l'API quando un reclamo si chiude con
   `colpaTipo === "partner"`, mandando `partnerId` (CS ce l'ha già in `colpaId`), `idEsterno` = id
   del reclamo, `gravita`, `stato`, `casistica`, `ordineNumero`, `autore`.
   La chiave **non è ancora stata generata**: si genera quando si collega l'app, così non resta in
   giro una chiave di scrittura inutilizzata.

2. **`statoFinanziario`: nessuna app lo scrive.** In FINANCE non esiste una colonna da copiare —
   ci sono i fatti (fatture scadute, `pdrDebito`, `debiti2025`). Serve la regola che li traduce in
   regolare/in_ritardo/insoluto/piano_di_rientro/bloccato, e va scritta **in `deluxy-partner`**,
   che possiede i dati e ha già la chiave di scrittura.
   Proposta: `pdrDebito` valorizzato → piano_di_rientro; almeno una fattura scaduta → in_ritardo;
   scaduta da oltre N giorni o sopra un importo → insoluto; nessuna scaduta → regolare; `bloccato`
   solo a mano. **Decisione aperta: N.**
   Misurato il 29/07/2026 su BASARA (`anagraficaId` già agganciato): 18 fatture, 6 non pagate, 1
   scaduta, debiti 2025 = 0 → con questa regola sarebbe «regolare», mentre il registro dice ancora
   «da verificare». È questo il disallineamento che si vede confrontando le due schede.

3. **Letture del registro dalle altre app**: `deluxy-partner` fatto (join per `anagraficaId`);
   **Ricerca fornitori legge già** (proxy `/api/anagrafiche` con la chiave lato server) e segnala
   nuovi prospect con `/api/segnala`; **Scout ha la chiave ma non legge ancora**.

3b. **Valet: chi è il master?** L'anagrafica è nel registro dal 30/07/2026 e si legge via
   `GET /api/v1/valet` (**sola lettura di proposito**: aprire la scrittura prima di aver deciso
   vorrebbe dire ritrovarsi tre copie della stessa persona). Oggi i valet nascono nella
   **piattaforma consegne**, che li assume, li paga e li assegna, e **Customer Service** ne tiene
   una copia minima (nome + recapito) solo per attribuire la colpa di un reclamo.
   Da fare: (a) far leggere Customer Service da qui invece di duplicare — il suo `Valet.id`
   diventa `platformId`/xref; (b) decidere se il registro riceve i valet dalla piattaforma (come
   fa FINANCE per `statoAnalisi`) o se resta compilato a mano; (c) travaso una-tantum dei valet
   esistenti, che oggi la tabella è **vuota**.

### B. Scelte da prendere (il codice viene dopo)

4. **Fornitori nel registro** (impianto discusso il 30/07/2026, non costruito). Il fornitore
   oggi vive come testo libero altrove: `fornitore` sull'ordine in Orders, `beneficiario` sulla
   richiesta di pagamento in FINANCE, e una tabella `Fornitore` tutta sua in Merchandising.
   Disegno concordato: **`ruoli[]`** sull'anagrafica (cliente · fornitore · vendor — non
   esclusivi: la stessa azienda ci compra, ci fornisce e ci fa vendere a commissione), uno
   **stato fornitore** suo (da provare / abituale / da evitare: «prospect» su un fornitore non
   vuol dire niente), e un livello **cercabile** — cosa fornisce (tag), province servite, lead
   time, tagli minimi, canale per la richiesta. I **preventivi non stanno nel registro**: sono
   transazioni, casa naturale l'app Ricerca fornitori (già manda richieste e tiene lo storico —
   ma su KV, per i preventivi serve una tabella) oppure `deluxy-acquisti`.
   **Decisione aperta: il catalogo del «cosa fornisce» è chiuso (come le categorie) o aperto
   (come le linee di Scout)?**

5. **Il voto conta o è solo informativo?** Oggi la valutazione D2C non entra nella scelta del
   partner in fase di smistamento. Da decidere se ci entra e se un «Critico» va solo segnalato o
   sospeso. (I giudizi restano **solo interni**, deciso il 26/07/2026: niente recensioni
   pubbliche, niente moduli al cliente finale.)

6. **Chi ha fatto cosa nella UI**: il registro non ha utenti, solo la password condivisa. Il
   **cosa** dal 30/07/2026 è tracciato (modello `Modifica` + sezione «Storia» su azienda e
   contatto: campo, valore prima e dopo, da quale app); il **chi** no — `autore` resta vuoto per
   le modifiche dalla UI, e da `/chiavi` chiunque entri può creare una chiave di **scrittura
   piena**, quindi quella password vale quanto le chiavi. Serve il login dall'Hub, con `/chiavi`
   riservata agli admin: da lì `autore` si riempie da sé.

7. **Ambito «dati finanziari» sulle chiavi**: oggi **qualsiasi** chiave di lettura vede il blocco
   `datiFinanziari`, IBAN compreso (`deluxy-suppliers` e `deluxy-scout` inclusi). Finché sono dati
   di clienti è brutto; col registro usato anche per i fornitori — cioè per chi paghiamo — diventa
   una superficie da frode. L'impianto delle tipologie in `src/lib/chiavi.ts` è pronto ad
   accogliere l'ambito nuovo.

8. **Gruppo di pagamento in due posti**: `gruppoPagamento` qui (dal 29/07/2026) e `gruppo` in
   `deluxy-partner`, documentato lì come «GRUPPO DI PAGAMENTO» con l'esempio CHANEL
   Firenze/Milano/Roma. Stesso concetto, due copie: da allineare, probabilmente nello stesso giro
   della regola dello `statoFinanziario`.

9. **Fase 2 dell'architettura** (non costruita): coda di **proposte** per i campi curati toccati
   dalle app + UI di revisione. **Fase 3**: outbox/webhook sui cambi + `Idempotency-Key`.

### C. Pulizie di dati (piccole, misurate il 30/07/2026)

10. **Linee scritte in due modi**: `consegne` (10 anagrafiche) accanto a `Consegne` (5), e
    `gifting` (2) accanto a `Gifting` (51). I filtri e la sidebar ne vedono una per volta, quindi
    quei partner spariscono dal conteggio giusto. Il nome canonico è quello con l'iniziale
    maiuscola (catalogo master in Scout): serve una passata di normalizzazione.

11. **Quattro anagrafiche di prova archiviate** (`attivo: false`, nessun interesse): «PROVA PATCH
    NOTE», «PROVA MILANO» (fonte `platform`), «PROVA MERGE SUPPLIERS», «PROVA REGOLE INGAGGIO»
    (fonte `deluxy-suppliers`). Da cancellare o marcare, così non inquinano i conteggi
    dell'archivio.

12. **Nomi dei referenti importati dall'Excel**: il campo `nome` è testo libero sporco. Passata di
    normalizzazione possibile appoggiandosi ai dati HubSpot, più strutturati. (Dal 29/07/2026 la
    modifica della scheda **non li ricrea più**, quindi una pulizia non viene più sovrascritta.)

### D. Verifiche in sospeso

13. **Ricerca in rubrica Google**: implementata il 29/07/2026 e provata con Google Identity e
    People API sostituiti da finti nel browser (pulizia dei nomi, selezione multipla, riempimento
    righe, creazione dei referenti). **La ricerca vera non è mai stata eseguita**: il consenso
    Google richiede un click in un browser reale, con un account fra i test user
    (deluxy.delivery, deividcala, donatod.nicolo). L'app OAuth è ancora in **modalità test**.

## 8. Script (`package.json`)

`db:push`, `import:excel`, `import:hubspot-contatti` (con `--crea-aziende`: crea l'anagrafica
mancante dalla company HubSpot così nessun contatto viene scartato — genera prospect «DA
CLASSIFICARE» a livello di gruppo/holding da riordinare; con `--importa-orfani` anche i
contatti senza azienda associata entrano, agganciati all'anagrafica-contenitore «Contatti
senza azienda (HubSpot)» da riassegnare a mano), `export:vcard`, `chiave`,
`scripts/configura-db-condiviso.mjs`, `scripts/crea-chiave.mjs`, `scripts/esporta-vcard-google.mjs`,
`scripts/importa-hubspot-contatti.mjs`.

## 8bis. Prestazioni (31/07/2026) — perche l app era lenta

Assegnare uno stato o un interesse prendeva **~4 secondi**. Non erano le
scritture: era la **rivalidazione**. Ogni azione fa `revalidatePath("/")`, e la
pagina si ricostruiva tutta.

Misurato, prima → dopo:

| | prima | dopo |
|---|---|---|
| conteggi della sidebar | 3320 ms (12 query in fila) | **485 ms (una query sola)** |
| query dell elenco | 1076 ms | 720 ms |
| pagina `/` (build di produzione) | ~4 s | **~0,9 s** |
| scheda partner | ~2,4 s | **~1,5 s** |

Cosa e stato fatto, e perche va tenuto cosi:

1. **La sidebar fa UNA query.** Erano dodici `await` in fila; metterle in
   `Promise.all` non bastava (1,4 s) perche il pooler ha `connection_limit=5` e
   le "parallele" vanno a ondate. Ora e un solo SQL con dodici sotto-select.
   **Aggiungendo un conteggio, aggiungi un sotto-select li dentro**, non un
   `await` sotto: e il modo in cui questa lentezza e nata.
2. **L elenco carica dei referenti solo il telefono** (`select`), non l intero
   record per 50 anagrafiche piu tutte le loro sedi.
3. **La scheda partner fa un solo giro** dopo aver letto l anagrafica
   (fatturazione + altri luoghi + voti + linee in `Promise.all`).
4. **I badge sono ottimistici** (`useOptimistic` in MenuStato, MenuStatoAzienda,
   MenuInteressi): la pillola cambia al click e la rivalidazione arriva dopo.
   E quello che si **sente**: il resto e misura, questo e percezione.
5. **Gli audit si scrivono dopo la risposta** (`after` di Next):
   `registraPassaggio` e `registraModifica` non sono dati che servono a
   disegnare la pagina. `toggleInteresse` usa `RETURNING` invece di rileggere.

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
