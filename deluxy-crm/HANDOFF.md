# Handoff — Deluxy CRM

Stato al 2026-08-24 (notte). App **nuova**, costruita e pubblicata in
giornata; in serata il **nuovo ordine con link di pagamento**; in nottata le
**liste AI da brief** e i **WhatsApp (template, singolo e a lista)**.
Cartella: `deluxy-crm/`, porta **3190**, schema Postgres **`crm`**.

**LIVE**: https://deluxy-crm.vercel.app (progetto Vercel `deluxy/deluxy-crm`,
region fra1). Tessera nel Hub: id `crm`, ruoli admin+commerciale, `sso: true`.

## Stato al 10/09/2026 (giornata di richieste dell'utente — deployato in serata, vedi in fondo alla sezione)

Diciassette richieste arrivate in sessione, tutte implementate in locale,
tsc 0, provate sul dev server (porta 3190) contro la produzione di Orders.
**Commit `8ee4c0c5` nel repo `app/`** (+ correzione tipo Calendario dopo) e
**commit `e178d633` nel repo `scoutwt/` per Orders**. Nessun deploy: da
chiedere all'utente (CRM e Orders separatamente).

**Schema `crm` — 5 tabelle nuove + 2 colonne, `prisma db push` FATTO sul DB
condiviso** (solo schema crm): `ProfiloCliente` (nome «come lo chiamiamo»,
professione, punteggio 0-100, foto Bytes ≤ 600 KB + fotoTipo), `NotaCliente`
(n note modificabili), `Programmazione` (cosa fare con un cliente in un giorno:
da_fare/fatta/annullata, spinta al Calendario come `prog:<id>`, tipo
appuntamento/promemoria), `UnioneClienti` (alias → principale), `ImpostazioniCrm`
(riga «crm», Json soglie+cluster); `archiviatoIl` su TemplateMail e
TemplateWhatsApp.

**Cosa c'è di nuovo, pagina per pagina** (tutto a norma Libro UX: form con
label, stati «in corso», modale §9, filtri §8, ordinamento ThSort):
- **Scheda cliente**: foto tonda + iniziali, professione, «Modifica il
  profilo» (form con `FotoInput` che riduce a 512 px nel browser), punteggio
  manuale, **cluster** (badge), **Note** multiple (aggiungi/modifica/elimina),
  **Programmazione** (giorno + ora facoltativa + cosa fare; «Fatta», ✕; le
  chiuse in `<details>`), **ordini in finestra modale** («Vedi gli ordini
  (N)», `Modale.tsx`), **ricorrenze multiple** in un colpo
  (`RicorrenzeMultiple.tsx`, action `aggiungiRicorrenze`, una POST a Orders per
  riga), **Schede unite** («Unisci» per email/codice, «Separa»): la scheda del
  principale somma KPI, ordini, ricorrenze e diario degli alias; aprire un alias
  rimanda al principale. Orders NON cambia.
- **Ricorrenze**: chip **Oggi** (prossimi=0) + 7/14/30/60/90; data
  prospettica vera («ven 11 set 2026») accanto a giorno/mese; ricerca `q`;
  filtri dietro «Filtri (N)» (occasione, stato, per chi, sito); **colonne
  ordinabili**; colonna **Sito** (brand del cliente). ⚠️ Il sito arriva da
  Orders SOLO dopo il deploy di `e178d633` (API `eventi-clienti` → `brand[]`);
  fino ad allora «—». Si leggono TUTTE le ricorrenze della finestra a pagine di
  500 (`tutteLeRicorrenze`, tetto 3000 dichiarato in pagina) e si filtra/ordina
  in casa.
- **Calendario** (`/calendario?mese=YYYY-MM`, voce di menù): griglia mensile
  con programmazioni (blu / verde se fatte), ricorrenze prospettiche
  (colore del tipo, solo da oggi in poi) ed eventi (oro); elenco «giorno per
  giorno» sotto con «Fatta». Pallino/numero nel menù (`novita.ts`: da fare
  entro 7 giorni, rosso se in ritardo).
- **Oggi**: card «Programmato per oggi» (con le arretrate) e «Fatta».
- **Performance** (voce di menù): valore, cluster, segmenti, siti, città,
  classifiche (migliori, assidui, in allontanamento); legge fino a 3000
  clienti per spesa su 10.795 e LO DICE. Filtro per sito.
- **Liste**: pillole «Con l'AI» / «A condizioni»; **lista manuale**
  (`creaListaManuale`: stessa `CriteriLista` e stesso esecutore); bottone con
  stato «in corso» (`BottoneInvio.tsx`). **Diagnosi del «non fa nulla»**: il
  bottone AI FUNZIONAVA (due liste da 8 membri nate alle 15:41 con due click),
  ma senza nessun segnale per 30-60 s. Correzione vera in `liste-ai.ts`: con
  un filtro sui giorni dall'ultimo ordine la base si legge per **recenza**
  (prima i primi 3000 per spesa: i clienti recenti ma piccoli restavano fuori).
- **Template mail**: tabella (nome, oggetto, aggiornato) con Modifica /
  **Archivia** / Elimina; pillola «Archivio (N)» con Ripristina; gli archiviati
  spariscono da Componi (mail, WhatsApp, liste). Delete con esito vero.
- **Nuovo ordine** (voce di menù `/nuovo-ordine`): cerca il cliente → apre il
  modulo esistente `/clienti/<codice>/nuovo-ordine` (via Customer Service).
- **Componi mail / WhatsApp**: `<details>` «Proponi un prodotto o una
  collezione (da Merchandising)» → `InserisciDaCatalogo.tsx` cerca via
  `/api/interno/catalogo` (`lib/merchandising.ts`, chiave `MERCH_API_KEY` +
  `MERCH_URL`) e inserisce «• Nome — prezzo — nota» nel textarea. ⚠️ **Manca la
  chiave**: va emessa da Merchandising → Impostazioni → chiavi API (nome
  «deluxy-crm») e messa nelle env; Impostazioni del CRM mostra lo stato.
  Niente link al prodotto: Merchandising non conosce l'URL pubblico.
- **Impostazioni → «Clienti del CRM: soglie e cluster»**: spesa totale minima,
  spesa annua minima, frequenza minima (ordini/anno) = «in soglia» (evidenzia,
  NON esclude: decisione dell'utente «in ogni caso fai entrare tutti i
  clienti»); fino a 8 cluster ordinati per priorità con condizioni (spesa
  totale/annua, ordini/anno, ordini, punteggio). `lib/cluster.ts`: spesa annua
  e frequenza sono STIME (speso/anni di vita, minimo 1 anno). Cluster nel
  libro Clienti (colonna + «fuori soglia»), nella scheda e in Performance.
- Card **Merchandising** in Impostazioni (stato misurato).

**Collaudato dal vivo (10/09)**: scheda di Angelina (Kzk3MTUwNzIyNzEyNA):
programmazione creata (11/09 10:30 Roma → 08:30Z corretto), modale ordini
centrata; Calendario e Performance renderizzati con dati veri. **Prima push
al Calendario fallita (400 «tipo non valido»)**: corretto in
`spingiProgrammazione` (appuntamento/promemoria) — da riprovare col bottone
«Fatta» sulla programmazione di collaudo, poi eliminarla (✕) dalla scheda.

**Sera 10/09 — revisione coi custodi (UX desktop, UX mobile, Performance) e
gli ostili, poi push e deploy su richiesta dell'utente.** Tutto registrato:
SEGNALAZIONI-UX (riga «10/09 sera») e SEGNALAZIONI-PERFORMANCE (3 righe in
attesa per Orders, 4 decise per il CRM), Libro PERFORMANCE §1 (i byte del dev
server mentono 3,7×), README (deroga Ricorrenze 3000 con soglia di rientro).
- **Performance applicate**: pallini senza la CTE dei clienti (`dataUltimoOrdine`
  da `/api/v1/ordini?limit=1`) e TTL 300 s (`TTL_PALLINI_MS`): endpoint a
  freddo 1,93 → 0,77 s; `statoOrders` fuori dalla cache (il badge diceva
  «Collegato» dalla cache e rovinava la voce di `catalogoListe`);
  `generazionePassword` in React `cache()` (revoca letta 1 volta a richiesta
  invece di 2-4; l'ostile ha verificato che non buca la revoca). **Per Orders**
  (registrate, non fatte): endpoint aggregato per `/performance` (oggi 6 CTE in
  serie = 5,6 s su 3000/10.795 clienti), `eventi-clienti` che carica tutta la
  tabella a ogni pagina.
- **UX applicate** (10 + seconda fascia): `ConfermaElimina` sulle 4 eliminazioni
  irreversibili, griglie a classi `.griglia.scheda/.lavoro` con ramo mobile
  (11 stili inline tolti), chip di /clienti scorrevoli su mobile, MQ 900/700
  (form-riga a capo, input 16 px, overflow di Impostazioni/Performance),
  `aria-current`, `input[type=time]` a norma, ricorrenze tutte viola nel
  Calendario, `BottoneInvio` sui 3 invii, gap 10 fra le azioni di riga, meno
  neri, 6 `aria-label`, hex → token, «Archivia» sui template WhatsApp,
  `WaAssistito` che guarda `window.open`, titoli di sezione nel form a
  condizioni, «Azzera» nel vuoto di /clienti.
- **Da fare in giri dedicati** (elenco completo nel registro UX): drawer mobile
  (la sidebar a 375 px occupa il 56% dello schermo) e da lì bersagli 44,
  tabelle a schede, calendario mobile; inversione dell'API `.btn` col CS;
  `htmlFor/id` sui campi; `useActionState` sui compositori; tabella Clienti
  (Medio/Brand, `ThSort`); avviso oro + rami del troncamento in Ricorrenze;
  esito «non in agenda»; `error.tsx`; 3 delete muti.

**Trappola del deploy precompilato da Windows (10/09 sera)**: `vercel build`
lascia in `.vercel/output/functions` dei link simbolici (`api/health.func →
../logout.func`, una ventina) e `vercel deploy --prebuilt` fallisce lato Vercel
con `ENOENT … api/health.func`. Rimedio: prima del deploy sostituire i link con
copie (`find … -type l` → `cp -r` del bersaglio). Vale per CRM e Orders; da
mettere nel comando `/deploy` o nel CLAUDE.md di radice. Anche con le copie il
deploy è fallito (link annidati: `.next\server\pagesĄ.html`, poi `.env`):
**pubblicati con la build su Vercel** (`vercel deploy --prod --yes`, ~41 s di
build ciascuno): CRM `deluxy-exiab7ay6` ✅ Ready (health ok, login ok,
`/api/novita/sezioni` 401 come atteso), Orders `deluxy-orders-bxjpq6wgy` ✅ Ready.
Push fatto: `app/` su `piattaforma-ricerca-insensitive`, `scoutwt/` era già
su `scout-ui` (pushato dall'altra sessione).

**Notte 10/09 — secondo giro dopo il deploy (segnalazioni dell'utente).**
- **Regressione MIA in Orders**: i brand nelle ricorrenze (`e178d633`) con
  `orderBy data desc` + `IN` insensibile facevano filtrare tutta la tabella
  Ordine: `eventi-clienti` da 0,5 s a **17-20 s** per pagina → Ricorrenze e
  Calendario in timeout, scheda senza il bottone degli ordini. Corretto
  (`distinct` su email+brand, niente orderBy; commit `988aaf60` in scoutwt) e
  rideployato: 30 giorni in 0,9 s.
- **Consensi**: Orders espone `privacy` nella scheda e `POST
  /api/v1/clienti/{c}/privacy` (chiave di scrittura). CRM: card «Consensi»
  in scheda (email/sms/telefono/bloccato con Attiva/Disattiva → Orders) +
  **consenso CRM** («ha voglia di sentire Eva», `ProfiloCliente.consensoCrm`,
  default sì) con pallino nel libro clienti (colonna «CRM»).
- **«Chi è» modificabile in visualizzazione** (matitina, `TestoModificabile`,
  `ProfiloCliente.chiE`; se vuoto vale il riassunto AI). Matitina «Modifica»
  in testata al posto del link piccolo.
- **«Unisci i selezionati»** nel libro clienti: spunte nelle righe (attributo
  `form=`), principale = chi ha più ordini; rifiuta chi è già in un'altra
  unione.
- **Ordine per un cliente nuovo** (come nel CS): da `/nuovo-ordine` si scrive
  l'email → `/clienti/<email>/nuovo-ordine` apre il modulo vuoto anche se
  Orders non conosce il cliente.
- «Crea utenti legati alla piattaforma»: nel CRM gli utenti NON si creano —
  vivono nel Hub (SSO): si crea l'utente là e si abilita l'app «crm» nella sua
  scheda (`appAbilitate`); il CRM mostra nome e ruolo dal Hub. Da spiegare
  all'utente, nessun codice.

**NON fatto / da decidere**:
- **Rubrica di deluxy.delivery@gmail.com** («come sono salvati in rubrica»):
  nessuna app espone i contatti Google; servirebbe People API (OAuth) — non
  c'è. AI Mail ha solo `/api/v1/contatto?email=` (quadro delle conversazioni),
  non la rubrica. Da discutere con l'utente.
- **Deploy**: CRM (`/deploy deluxy-crm`) e Orders (`e178d633`, cartella
  `scoutwt/deluxy-orders`, branch scout-ui). `npm run build` NON eseguito
  (dev server acceso sulla stessa `.next`): farlo prima del deploy.
- Registrazioni: SEGNALAZIONI-UX (riga 10/09) e Manuale Deluxy (riga
  10/09) — vedi sotto se fatte.
- Aperti dal 03/09: dedup mail personalizzata (P1), `error.tsx`, input perso
  su `?errore=`, `WaAssistito` «Aperta ✓». `MAIL_API_KEY` ancora assente.

## Stato al 04/09/2026 (ripresa breve)

- **FATTO 04/09 (mattina, commit da fare a tsc verde): la password del team si
  cambia e si recupera dall'app** (richiesta dell'utente: «consentimi di fare
  reset password da app», confermati indirizzo deluxy.delivery@gmail.com e
  password unica senza account personali). Modelli `PasswordTeam` (riga unica,
  scrypt, `versione`) e `TokenResetPassword` (solo SHA-256, monouso, 60 min);
  `lib/password-team.ts`, `lib/password-actions.ts`, `lib/sessione-server.ts`
  (revoca: le sessioni portano `gen`, layout e ogni action passano da
  `sessioneCorrente()`); pagine `/login` (bottone «Mandami il link di
  recupero» nel `<details>`, avviso onesto se la posta non è configurata),
  `/reimposta-password` (pubblica, porta = token), card «Password del team» in
  Impostazioni (serve la password attuale; dal Hub solo admin). Il link va
  SEMPRE a `CRM_RESET_EMAIL` → `MAIL_UTENTE`. Freni: 3/ora globali, 5/ora per
  hash-IP. README, `.env.example`, registro sicurezza (riga «DIFESA NUOVA», da
  far smontare all'ostile) e Manuale Deluxy (riga 04/09) aggiornati.
  **Passata dall'ostile e corretta nello stesso giro** (verdetto completo
  nel registro sicurezza, riga Decise 04/09): revoca in testa a TUTTE le 18
  pagine (`dentroOppureFuori()`: il layout da solo non basta, Next non lo
  ri-renderizza nelle navigazioni RSC) e su `/api/interno/*` (401);
  origine del link FISSA (`CRM_URL` → deluxy-crm.vercel.app, mai dagli
  header); l'admin del Hub (SSO) cambia la password SENZA quella attuale (così
  il proprietario espelle chi ha la password anche a posta spenta); token
  bruciato con updateMany condizionato in transazione; contatore «richieste
  24h» in Impostazioni. Node installato alle 10:10: `prisma generate` ok,
  **tsc 0, build 0, `prisma db push` FATTO** (2 tabelle nello schema crm).
  ✅ **DEPLOYATO alle 10:25** (`vercel deploy --prod`, deployment
  deluxy-5u0gym4f5, Ready, alias deluxy-crm.vercel.app; verificato: /login
  mostra «Mandami il link di recupero» + avviso posta non configurata,
  /reimposta-password risponde «Link non più valido», /api/health ok). Con
  questo deploy è andato live anche il commit del login del 31/08.
  **Decisione del proprietario (b5)**: la casella di reset RESTA
  deluxy.delivery@gmail.com (nessuna `CRM_RESET_EMAIL`). ⚠️ **Manca solo
  `MAIL_API_KEY`** nelle env: finché non c'è il link non parte (il login lo
  dice in arancione). Finché la riga `PasswordTeam` non esiste vale ancora
  `CRM_APP_PASSWORD`, che resta obbligatoria per il fail-closed.


- **Repo `app/` trovato con HEAD rotto** («bad object HEAD»): 17 commit del
  03/09 (16:09→18:29, compreso `b0512b4a` di questo handoff) avevano gli
  oggetti spariti dal `.git` locale. Erano su GitHub: **riparato con
  `git fetch origin piattaforma-ricerca-insensitive scout-ui`**, fsck 0
  errori, nessun ref toccato. Origin è ora 4 commit avanti (altra sessione:
  Segnalazioni/Vendite piattaforma, AI Mail): fast-forward NON fatto per non
  muovere file di altre app con lavoro sporco.
- **Node.js non è installato sulla macchina** (`where node` vuoto, winget
  non lo trova): niente `npx vercel`, tsc, build, dev server finché non si
  reinstalla (`winget install OpenJS.NodeJS.LTS`, poi `npx vercel login`).
  Il deploy del commit `a309b6b3` resta quindi da fare.
- **Password dell'app**: è la sola `CRM_APP_PASSWORD` nelle env Vercel
  (production). Non è in alcun `.env` locale; l'SSO dal Hub non la aggira
  (segreto disallineato, Hub §9-ter). Si legge dal pannello Vercel
  (Settings → Environment Variables → reveal); se è Sensitive va sostituita
  e rideployata.
- Produzione invariata: `/login` live senza «dimenticata», `/api/health`
  ok + database true, `MAIL_API_KEY` ancora assente, nessun fix UX fatto.

## Stato al 03/09/2026 (ripresa)

- (superato il 04/09: deployato) **Produzione ferma al 28/08**: l'ultimo deploy (`vercel ls --prod`) è di 6
  giorni fa; il commit `a309b6b3` del 31/08 (login: `<details>` «Password
  dimenticata?» che dice la verità sulla password unica di squadra) è in git ma
  **NON è live** (`curl /login | grep dimenticata` → 0). tsc 0 e build 0 il
  03/09; il deploy CLI dalla cartella è stato bloccato dal classificatore dei
  permessi: va lanciato a mano `npx vercel deploy --prod --yes`.
- **`MAIL_API_KEY` ancora assente** nelle env Vercel (16 variabili, quella no):
  l'invio mail resta spento. Vedi MANCA punto 1.
- **Dal 27 al 28/08 il CRM ha ricevuto le passate trasversali** (Libro UX
  v1.3–1.9, token v1.4): sidebar nuova con pallini gialli «novità»
  (`lib/pallini.ts`, `lib/novita.ts`, `api/novita/sezioni`), `loading.tsx`,
  `TornaIndietro`, `RigaLink`, chip su una riga scorrevole su mobile, ricerca
  `q` + scorciatoie di periodo su Eventi e membri lista (i Clienti NO: l'API di
  Orders non filtra, sarebbe l'OR largo col take). Tutto questo È live.
- **Aperti dal custode UX** (`SEGNALAZIONI-UX.md`, CRM 🟡 PARZIALE): P1 la mail
  personalizzata **non ha dedup** (doppio click = mail doppia al cliente);
  manca `error.tsx` (ogni throw è la pagina inglese di Next); 5 delete con
  `catch(()=>{})`; input perso sul redirect `?errore=`; `WaAssistito` mostra
  «Aperta ✓» anche se la chat non si è aperta. Nessuno è stato toccato il
  03/09: sono i primi lavori quando si riprende il codice.
- Working copy di `deluxy-crm/` pulita; le modifiche sporche nel repo
  (`deluxy-platform-next/`) sono di un'altra sessione: non toccarle.

## FATTO

- **Architettura conforme allo Standard §7**: nessuna tabella-copia dei
  clienti. Orders è la fonte (clienti, ordini, segmenti, riepiloghi AI,
  ricorrenze); il CRM tiene solo Attivita, Evento, Invito, TemplateMail,
  MailInviata, agganciati alla `chiaveCliente` di Orders (base64url di
  email → telefono → nome).
- **Due rotte nuove in Orders** (commit `a29eae78` su scout-ui, deployate):
  `GET /api/v1/clienti/{cliente}/ordini` (ordini esatti della scheda, non il
  contains di `?q=`) e `GET/POST /api/v1/eventi-clienti` (ricorrenze con
  prossimità e flag `delicato`; il POST scrive una ricorrenza manuale,
  upsert su chiave+destinatario+mese+giorno).
- **Pagine**: Oggi, Clienti, Scheda 360, Ricorrenze, Eventi (+nuovo,
  +dettaglio con inviti), Mail (registro, componi, template), Impostazioni
  (stato collegamenti misurato). Design system v1.0, sidebar traslucida,
  badge a pillola con dot, 4 stati per vista.
- **Auth**: password di team + SSO dal Hub (pattern Scripts; sessione HMAC
  WebCrypto nel cookie `dcrm_session`; fail-closed 503 in produzione senza
  password). NIENTE query su `hub."Utente"` (la violazione segnata
  dall'audit in Tasks/Calendario qui non c'è).
- **Mail via AI Mail** (`POST /api/v1/invia`, header `x-api-key` +
  `x-utente`): la copia resta negli «Inviati» della casella; il CRM registra
  in MailInviata e aggancia l'invito (stato → invitato) se era un invito.
- **Eventi → Calendario**: push best-effort (sistema `deluxy-crm`,
  idEsterno = id evento) alla creazione/modifica/cambio stato; chiave
  emessa (`deluxy-crm`, scrittura) e VERIFICATA (evento di collaudo creato e
  poi annullato su entrambi i lati).
- **Chiavi**: pattern cassaforte Hub → env (cache 5', timeout 4",
  never-fail, strip del BOM). Chiave Orders `deluxy-crm` (scrittura) emessa
  e in produzione. `HUB_SSO_SECRET` copiato dal Hub nelle env Vercel.
- **Collaudato in locale contro la produzione di Orders**: dashboard con
  dati veri (146 VIP), scheda di un cliente reale (riassunto AI + 26 ordini),
  attività registrata, evento creato→propagato→annullato, composizione invito
  con variabili risolte, blocco pulito dell'invio senza token.
- **Registrazioni**: porta 3190 nello Standard §2.1 (commit `def30ef5`),
  tessera+icona nel Hub (commit `dee97b59`, deployato), launch.json radice e
  locale.

- **Nuovo ordine con link di pagamento** (24/08 sera): dalla scheda cliente,
  «Crea ordine» → `/clienti/<codice>/nuovo-ordine`. Il form (client
  component) cerca nel catalogo del negozio (con foto), accetta righe a mano
  per i fuori listino, precompila cliente e indirizzo dall'ultimo ordine,
  sceglie la spedizione fra le voci VERE del negozio, e crea la bozza
  **passando dal Customer Service** (`POST /api/v1/nuovo-ordine`, chiave
  `MESSAGGI_API_KEY` con scrittura): è lui che ha le credenziali Shopify con
  lo scope giusto. Due strade come nel CS: link di pagamento (bozza resta
  bozza; se c'è l'email Shopify manda da sé l'invoice) o «ha già pagato»
  (nasce pagato). L'esito mostra il link con Copia + «Manda il link per
  mail» (componi precompilata via `?ordinelink=`); il link NON si salva da
  nessuna parte (regola dei link col segreto); nel diario resta l'attività
  `ordine`. Al CS sono state aggiunte 4 rotte `/api/v1/nuovo-ordine{,/negozi,
  /prodotti,/spedizioni}` + scope `scrittura` su ApiKey (commit `f69c7b32`,
  deployato **da copia pulita del commit** perché la working copy aveva la
  riconciliazione a metà di un'altra sessione). **Collaudato end-to-end in
  produzione**: bozza #D5627 creata dal form (riga a mano 1 €, cliente
  fittizio) con link vero, poi eliminata da Shopify e diario ripulito.
  Le rotte interne `/api/interno/*` (proxy catalogo/spedizioni) sono protette
  dalla sessione nel middleware: la chiave del CS non arriva mai al browser.

- **Liste AI da brief** (24/08 notte, pagina `/liste`): l'operatore scrive il
  brief in italiano, l'AI (OpenAI, `OPENAI_MODEL` default gpt-4o-mini) lo
  TRADUCE in criteri verificabili — quali liste di Orders unire, quali filtri
  (città, brand, segmento, spesa, giorni dall'ultimo, parole nei GUSTI dei
  riepiloghi) — e il codice li esegue sui dati veri (`liste-ai.ts`). La lista
  salva brief + criteri + spiegazione + note di trasparenza (base, esclusi,
  cap); si rigenera sui dati di oggi; «non-contattare» è escluso SEMPRE.
  Membri = fotografia con contatti (riferimento `chiaveCliente`). Collaudata
  dal vivo: brief «migliori di Milano che comprano fiori, con email» → 200
  membri veri. **Invio mail a lista** (`/liste/[id]/mail`): una mail per
  membro con le SUE variabili, tetto 150 a giro, niente doppioni per
  template+lista (si può rilanciare), esiti nel registro Mail.
- **WhatsApp** (24/08 notte, pagine `/whatsapp` e `/liste/[id]/whatsapp`):
  template NOSTRI con {{variabili}} (non i template approvati Meta), registro,
  invio singolo dalla scheda e a lista. DUE canali: **API** via Customer
  Service (`POST /api/v1/whatsapp` nuova, dai numeri Business veri — Cake,
  Deluxy, FLowers) che però consegna solo nella FINESTRA 24h di Meta (a
  freddo rifiuta, e l'errore è tradotto in chiaro); **assistito** (wa.me):
  la chat si apre sul WhatsApp dell'operatore col testo personalizzato
  pronto, un clic a persona, nessun limite — registrato come «preparato».
  Numeri normalizzati E.164 (+39 dedotto solo per cellulari italiani).

### Trappola già pagata

I **route params di Next 15 arrivano ancora percent-encoded**
(`monica%40…`): un `encodeURIComponent` diretto li doppia (`%2540`). La
scheda decodifica UNA volta all'ingresso (`decodeURIComponent(codiceRaw)`)
e ricodifica dove serve.

### Trappola già pagata (2): le chiavi delle liste sono al PLURALE

Le liste di Orders si chiamano `fedeli`, `nuovi`, `persi`, `ricorrenti`
(plurale); il **segmento del singolo cliente** è al singolare (`fedele`,
`nuovo`…). Sono due vocabolari diversi: confonderli lascia i contatori a «—».
**Ci è cascata anche l'AI** (prima lista generata: `tipologie: ["privati"]` →
0 membri): l'esecutore ora normalizza plurale→singolare e il prompt lo
avverte — un filtro che svuota in silenzio è un bug, non colpa del modello.

## MANCA (prossimi passi)

1. **`MAIL_API_KEY`** — unico passo per accendere l'invio: da AI Mail →
   Impostazioni App → «Token API di AI Mail» (esiste già un token: rigenerarlo
   lo ruota per tutti i client), poi
   `npx vercel env add MAIL_API_KEY production --value <token> --force --yes`
   dalla cartella e rideploy. `MAIL_UTENTE` è già a deluxy.delivery@gmail.com.
2. **Primo giro vero dell'SSO** dal Hub (tessera CRM → si entra senza
   password): il segreto è lo stesso, ma il salto va visto una volta.
3. **POST ricorrenza dal vivo**: il form della scheda scrive in Orders; il GET
   è collaudato in produzione, il POST è da vedere col primo compleanno vero
   (esito visibile in pagina: ok/errore).
4. Tessera per i **commerciali**: gli admin vedono tutto; per gli altri va
   spuntata l'app nella loro scheda utente del Hub (`appAbilitate`).
5. Idee a seguire: lista `evento-in-arrivo` di Orders in dashboard; rispetto
   del consenso (`consenso-email`) accanto al bottone mail; promemoria
   automatici (cron) per le ricorrenze dei VIP; allegati negli inviti.

## Note

- L'evento «Collaudo CRM (da ignorare)» (15/09/2026) è rimasto negli archivi
  di CRM e Calendario **in stato annullato**, a testimonianza del collaudo:
  si può eliminare dal CRM quando si vuole.
- La password di team è nelle env Vercel (`CRM_APP_PASSWORD`); in locale
  l'app è aperta (nessun segreto nel `.env`).
- Le mail di prova NON sono state inviate a nessun cliente: l'invio resta
  spento finché manca il token (punto 1).
