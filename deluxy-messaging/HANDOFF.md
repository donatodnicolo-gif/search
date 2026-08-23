# Handoff — Deluxy Customer Service

Ultimo aggiornamento: **24/08/2026, ore 05:00** (sezione **Turni** in cima al menu e pagina **Operatori** in Qualità;
prima, alle 15:10, l'utente ha pubblicato la schermata di consenso Google e il
conto alla rovescia dei 7 giorni è finito).
Prima, il 19/08: la **risposta di primo contatto** che parte da sola al primo
messaggio; i **chargeback**; il **nuovo ordine** per il cliente al telefono.

**Stato del 21/08/2026 ore 15:00 — l'app è viva.** `GET /api/health` risponde
`200` con `database: true`, `scrivibile: true`, **1.305 ordini** (1.271 il
19/08) e **564 conversazioni** (514): i giri automatici e i canali hanno
lavorato da soli. Ultimo commit di questa cartella **`3af85d56`**; albero pulito
qui, allineato con `origin/scout-ui`.

⚠️⚠️ **Il 21/08 un'altra sessione lavorava nella stessa cartella** (commit alle
13:42, 13:53, 13:56, 14:40). In `scoutwt` **l'indice git è uno solo**: committare
**sempre con pathspec** (`git commit -- deluxy-messaging/...`), e prima di
toccare `HANDOFF.md` o `README.md` guardare `git log -1` — sono i due file che
due sessioni si contendono.

✅ **IL FIX DEL WIDGET REGGE SUL CAMPO, con clienti veri** (era la prova che
mancava il 17/08): dalle 16:23 del 17/08 a stamattina **5 conversazioni dei siti
hanno messaggi dentro** — flowers e cake, l'ultima oggi alle 08:18 — mentre le
18 vecchie restano a zero. Il guasto che dal 30/07 buttava via ogni parola dei
visitatori è chiuso davvero, non solo in prova.

✅ **CADE LA NOTA «conteggi bloccati dai permessi»** (durava da tre sessioni): lo
script di sola lettura **gira**. Ora sta in `scripts/conta.mjs` (versionato,
solo `count`/`findMany`, dei segreti stampa solo *PRESENTE/vuota*):

```bash
cd C:\Users\nicol\scoutwt\deluxy-messaging && node scripts/conta.mjs
```

✅ **Il bug del widget è verificato SUL CAMPO, non solo in tabella** (era la
prova che mancava stamattina): dalla produzione ho aperto una sessione widget
con `sito=cake`, mandato un messaggio e riletto la conversazione — il messaggio
c'è, con titolo e saluto **di Cake** e non quelli generali. La conversazione di
prova è stata cancellata subito, per id, con uno script che pretende il token
esatto. ⚠️ **Le 18 conversazioni widget del 30/07–17/08 restano a zero
messaggi**: quelle parole sono perse davvero. Dopo il fix i visitatori
scrivono: le conversazioni widget sono **31** il 21/08 (erano 18 prima del fix).

🟢 **GOOGLE HA RIPRESO A FUNZIONARE — cadono i due 🔴 del 17-19/08.** Rimisurato
il **21/08**: chiesto un token a `oauth2.googleapis.com` col refresh token
salvato, **HTTP 200**, scope `.../auth/contacts`. Fra il 19 e il 20/08 qualcuno
ha ricollegato dal browser, quindi anche il `redirect_uri_mismatch` è chiuso: il
giro **arriva in fondo**.
✅ E si vede dall'effetto, non solo dalla chiamata: **1.143 ordini hanno il
contatto salvato in rubrica, 0 rimasti da salvare, 0 errori** — l'arretrato che
il cron smaltiva a 40 per giro **è finito**. Delle conversazioni, **122** sono
già state cercate in rubrica e **5** hanno trovato un nome.

🟢🟢 **E ADESSO NON SCADE PIÙ — chiuso il 21/08 alle 15:10.** Alle 14:50 la stessa
chiamata rispondeva `refresh_token_expires_in: 516791` secondi (5,98 giorni): il
token sarebbe morto intorno al **27/08**. L'utente ha **pubblicato la schermata di
consenso** («Testing» → «In production») e ha ricollegato: ora quel campo **non
c'è più**, e la prova è arrivata fino in fondo — **People API `200`, 5.439
contatti in rubrica**.
⭐⭐ **Il campo `refresh_token_expires_in` dice se un OAuth è in «Testing» senza
aprire la console Google**: se c'è, la schermata non è pubblicata e i token
durano 7 giorni. Vale per ogni app del gruppo che parla con Google, ed è il modo
di accorgersene **prima** che si scolleghi.
⚠️ Due cose da non confondere, imparate qui: **pubblicare non allunga il token che
hai già** (nasce con la sua scadenza dentro, quindi va **ricollegato dopo**), e la
schermata **«Google non ha verificato questa app»** che compare al consenso non
c'entra con la scadenza — la verifica serve solo a togliere quell'avviso e ad
alzare il tetto dei 100 utenti.

<details><summary>Se dovesse ricapitare il <code>redirect_uri_mismatch</code> (storia del 17/08)</summary>

Nella console Google Cloud, sullo stesso client OAuth, **mancavano fra gli «URI di
reindirizzamento autorizzati»** gli indirizzi che l'app manda:

```
https://deluxy-messaging.vercel.app/api/google/callback
http://localhost:3140/api/google/callback
```

⚠️ Vanno messi negli **URI di reindirizzamento autorizzati**, **non** fra le
«Origini JavaScript autorizzate» — è l'errore classico, e da lì non si torna
indietro con un messaggio chiaro. L'indirizzo lo costruisce `redirectUri()` in
`src/lib/google.ts` da `APP_URL` (in produzione) o dall'host della richiesta:
deve **combaciare carattere per carattere**, barra finale compresa.

</details>

🔴 **LAVORO CHE SCADE E NESSUNO LO STA GUARDANDO: due chargeback vogliono le prove
entro il 4 settembre.** Contato in tabella il 21/08 (13 righe): **10 perse per
2.087,66 €**, **1 in esame** (#12432, 170 €, prove mandate il 12/08) e **2 in
`needs_response`** — **#1741 da 103,34 €** e **#12726 da 99,94 €**, tutte e due
con `scadenzaProve` **04/09/2026** e `proveInviateIl` **null**: le prove non sono
mai partite. Codice rete **13.1** su entrambe (merce/servizio non ricevuto → la
banca vuole la prova di consegna). Si risponde da `/chargeback`.
⚠️ Il totale delle perse **non è peggiorato** dal 19/08: è fermo.

🟢 **Il bottone «Fornitore» non chiede più la password**: `searchApiKey` **ora è
configurata** (l'ha messa l'utente) e funziona — provata contro
`search-deluxy.vercel.app/api/link`, risponde `200 ok` con un codice da 300 s.
Cade la nota «oggi non è impostata, quindi ripiega sul link semplice».

> ⚠️ **L'app si chiama Deluxy Customer Service** (prima "Deluxy Messaggi"). Sono
> cambiati i nomi visibili (topbar, login, titolo della pagina, tessera del Hub),
> **non** la cartella `deluxy-messaging/`, né il progetto Vercel
> `deluxy-messaging`, né lo schema Postgres `messaging`, né il cookie
> `msg_session`: rinominarli avrebbe rotto URL, deploy e sessioni per un
> cambio di etichetta. Una cosa in particolare NON va rinominata:
> `MARCATORE = 'Deluxy Messaggi'` in `src/lib/google.ts` è il marcatore già
> scritto nella biografia dei contatti Google creati da noi — cambiarlo li
> renderebbe irriconoscibili e l'app ricomincerebbe a rinominare contatti che
> non sono suoi.

## In due minuti (per una finestra nuova)

**Cos'è.** Il **servizio clienti**: si aprono e si lavorano i **reclami** sugli
ordini (casistica → azioni da eseguire → colpa a un valet o a un partner → da lì
i **giudizi**). Attorno ai reclami restano le due cose che c'erano già: **gli
ordini da lavorare** (arrivano da [Deluxy Orders](https://deluxy-orders.vercel.app)
da soli ogni 15 minuti, si smistano con stati nostri Da gestire → In pagamento →
Comunicazione → Gestito) e l'**inbox unificata** (WhatsApp/Messenger/Instagram +
widget dei siti).

**Dove.** Cartella `deluxy-messaging/` nel repo `scoutwt`, branch `scout-ui`.
Porta 3140. LIVE su <https://deluxy-messaging.vercel.app> (progetto Vercel
`deluxy-messaging`, team deluxy). Deploy: `npx vercel deploy --prod --yes` dalla
cartella dell'app — **il push su GitHub NON pubblica**.

**Le pagine.** `/reclami` reclami sugli ordini · `/reclami/casistiche` catalogo
dei tipi di reclamo con le azioni · `/reclami/punteggi` la **pagella** di valet e
partner con le voci configurabili · `/reclami/feedback` registrazione di feedback
e orari delle consegne · `/reclami/giudizi` giudizio manuale sui soli reclami ·
`/reclami/valet` chi fa le consegne · `/` Ordini (bacheca a colonne
o elenco) · `/calendario` consegne a partire da oggi · `/clienti` rubrica dagli
ordini · `/partner` partner attivi dal registro Anagrafiche · `/pagamenti`
richieste di pagamento con lettura AI dell'IBAN · `/inbox` conversazioni ·
`/script` risposte rapide che l'AI usa · `/negozi` `/caselle` `/impostazioni`.

**Le tre regole che questa app rispetta, e non vanno rotte.**
1. *L'AI propone, un controllo deterministico decide.* L'IBAN letto da una foto
   passa dal checksum mod-97; lo `scriptId` scelto dall'AI è validato contro
   l'elenco che le abbiamo mandato. Se non torna, si scarta — non si tira a
   indovinare su soldi e clienti.
2. *Non si duplicano i dati di altri registri.* Ordini da Deluxy Orders, partner
   da Deluxy Anagrafiche (questi ultimi senza nemmeno una copia locale).
3. *Lo stato di lavorazione è NOSTRO* (`Ordine.gestione`) e resta separato dalla
   pipeline di Orders (`statoChiave`): il sync non lo tocca mai.

**Le chiavi non stanno nell'ambiente** (tranne `DATABASE_URL`, `APP_SECRET`,
`APP_URL`, `CRON_SECRET`): si incollano in `/impostazioni` e finiscono cifrate
AES-256-GCM nel database. `APP_SECRET` su Vercel **deve** essere identico al
locale, altrimenti nulla si decifra.

## FATTO

- **L'AIUTO PASSA DA WHATSAPP** (23/08/2026). Chiesto dall'utente: «invia un
  messaggio WhatsApp a +393498853209 per l'aiuto, e la risposta sarà su
  WhatsApp».
  - Appena qualcuno chiede, l'avviso parte su WhatsApp col nome di chi ha
    chiesto, l'ordine, la pagina, la domanda e un **codice** di 5 lettere.
  - 🐞 **Da quale numero esce: corretto subito dopo, su domanda dell'utente.**
    La prima versione prendeva «il primo numero attivo con un token» — regola
    arbitraria, e pescava **+1 555-336-2009, la linea clienti di Flowers** (59
    conversazioni ricevute). Adesso l'ordine è: quello scelto in
    `aiutoWaNumeroId`, altrimenti la linea del marchio **generale** (Deluxy,
    +39 02 9475 1144, 4 conversazioni), altrimenti la prima che c'è.
    ⚠️ Un avviso interno che esce dalla linea clienti di un brand ci finisce in
    mezzo, e lì arrivano anche le risposte dell'amministratore.
    ⚠️⚠️ **La finestra di 24 ore vale per COPPIA di numeri**: cambiando mittente
    poteva chiudersi. Riprovato per davvero dopo il cambio → **`inviato`** anche
    dal numero Deluxy. Il
    numero sta in `aiutoWhatsApp` (Impostazioni), con
    `393498853209` come ripiego: cambiarlo **non vuole un deploy**.
  - **Due modi di rispondere**, scritti dentro il messaggio: **citare** l'avviso
    (`context.id` = il wamid che abbiamo salvato — legame esatto) o mettere il
    **codice in testa**.
  - ⚠️⚠️ **Fuori da quei due casi NON si indovina.** «C'è una sola domanda
    aperta, sarà quella» farebbe diventare un «ok» mandato per altro la risposta
    ufficiale a una domanda di lavoro. Un messaggio non riconosciuto prosegue e
    finisce in inbox: a quel numero l'amministratore scrive anche per altro.
  - ⚠️ Una risposta riconosciuta **non entra in inbox** (è roba interna) e si
    firma «Amministratore (WhatsApp)»: chi la legge ha diritto di sapere che è
    stata scritta dal telefono e non guardando la schermata. Sul telefono torna
    una conferma col codice.
  - ⚠️⚠️ **LA FINESTRA DI 24 ORE.** WhatsApp lascia mandare messaggi liberi solo
    a chi ci ha scritto nelle ultime 24 ore; fuori serve un **template
    approvato** (da creare a mano nel Business Manager). Quindi l'avviso **può
    non partire**. Quando non parte, `avvisoEsito` tiene l'errore di Meta **così
    com'è** (131047 dice tutto a chi sa leggerlo) e il pannello lo mostra **in
    rosso** a chi ha chiesto — credere di aver avvisato qualcuno che non sa
    niente è peggio che sapere di non averlo avvisato.
  - 🐞🐞 **CHI SCRIVE SI DECIDEVA DAL RUOLO, NON DA CHI HA CHIESTO.** Chi prova
    l'app è **amministratore**: continuando una richiesta **sua** dal pannello,
    il suo messaggio veniva registrato come «chi risponde» e **non avvisava
    nessuno** su WhatsApp. Da fuori: «ho risposto e non è passato nulla».
    Corretto: la domanda giusta è **«è la tua richiesta?»**, non «che ruolo
    hai». Ora i messaggi di chi ha chiesto riavvisano su WhatsApp anche se chi
    ha chiesto è un amministratore, e «letta» si azzera solo quando risponde
    **qualcun altro**.
    ⚠️ Diagnosi fatta sui dati, non a intuito: `webhookUltimaChiamata` era fermo
    alle 16:05 mentre il messaggio delle 16:36 era in tabella **senza**
    `viaWhatsApp` — cioè scritto dal pannello, non arrivato dal telefono.
    ✅ Controllate anche le iscrizioni al webhook di tutti e tre i WABA
    (`GET /{waba}/subscribed_apps`): **tutte e tre iscritte a «Messaggi
    Deluxy»**, quindi il canale non c'entrava.
  - 🐞🐞 **ERA UNA DOMANDA SOLA, E SI È ROTTA AL PRIMO USO VERO.** L'utente ha
    scritto «aiutami», l'amministratore ha risposto **«cosa hai bisogno?»** — e
    chi aveva chiesto **non poteva continuare**. Una richiesta d'aiuto **è una
    conversazione**: quasi mai la prima risposta è quella definitiva.
    - Tabella nuova `MessaggioAiuto` (`db push` additivo) e bottone **«Scrivi»**
      su ogni richiesta, per **tutti e due** i lati. Le vecchie risposte nel
      campo `risposta` sono state **migrate nel filo**
      (`scripts/migra-aiuto-in-filo.mts`, 1 riga) invece di lasciare due strade
      di lettura per sempre.
    - ⚠️ Ogni messaggio nuovo di un operatore **riavvisa su WhatsApp**, con
      «(ancora)» nel titolo: se no la seconda riga dello scambio resta lì e non
      la vede nessuno — che è il difetto che stiamo togliendo. E l'avviso di
      «(ancora)» porta il testo NUOVO, non la domanda iniziale.
    - ⚠️ Lo stato è `aperta` | `chiusa`, non più «risposta»: **rispondere non
      vuol dire aver finito**. Si chiude con «Risolto», e scriverci ancora la
      **riapre** — se qualcuno scrive, evidentemente chiusa non era.
    - ⚠️ Una risposta da WhatsApp cerca la richiesta fra quelle **non chiuse**,
      non fra quelle «aperte»: con lo stato vecchio, dopo la prima risposta il
      filo non era più raggiungibile dal telefono.
    - ⚠️ `avvisoWaId` è quello dell'**ultimo** avviso: citando un avviso vecchio
      di uno scambio lungo non si trova più niente, e allora vale il **codice**
      in testa. È il motivo per cui le due strade servono tutte e due.
    - ⚠️ Un operatore continua **solo le proprie** (403): intromettersi nello
      scambio di un collega non è aiutare, è confondere chi deve rispondere.
    - ✅ Provato con l'anteprima temporanea: filo di tre bolle nell'ordine giusto
      (OP → ADMIN → OP), richiesta chiusa spenta con «Riapri e scrivi», bottoni
      «Apri la chat ↗» / «Apri l'ordine ↗» a seconda del contesto.
  - **AL CLIC SI APRE DI CHE COSA PARLA** (chiesto dall'utente): la **chat** da
    cui è nata, o l'**ordine** se chat non ce n'è. Senza né l'una né l'altro la
    riga non è cliccabile — un clic che non fa niente è peggio di un clic che
    non c'è.
    - 🐞🐞 **Il contesto non veniva MAI catturato**: il pannello leggeva
      `?conversazione=`, ma **l'inbox usa `?c=`**. La domanda «aiutami» delle
      16:04 ha infatti `conversazioneId` **vuoto**. ⚠️ Lo stesso sbaglio era
      nel link «Vedi la chat» delle proposte del **glossario**: portava
      all'inbox senza aprire niente, e la «prova» della proposta era un clic
      che non funzionava. Corretti tutti e due.
    - 🐞 E non bastava: **l'inbox non scriveva affatto la chat aperta
      nell'indirizzo** (lo leggeva solo all'avvio). Adesso lo fa con
      `history.replaceState` — non col router, che rifarebbe il rendering di
      tutta l'inbox a ogni clic e riempirebbe la cronologia. 🎁 Effetto
      collaterale utile: il link a una conversazione si può copiare e mandare.
    - ⚠️ Il pannello legge `window.location.search` **all'apertura** e non
      `useSearchParams`: quello che scrive `replaceState` il router di Next non
      lo vede, e il pannello continuerebbe a leggere l'indirizzo del caricamento.
    - ⚠️ Il clic sta sulla RIGA, ma non ruba i clic dei bottoni dentro
      («Rispondi», «L'ho letta»): senza il controllo, premere Rispondi
      porterebbe via dalla pagina. **Provato**: premendo Rispondi l'indirizzo
      non cambia e il campo si apre.
    - ✅ Provato con l'anteprima temporanea: riga con chat → «Clicca per aprire
      la chat» e `apribile`; riga col solo ordine → «Clicca per aprire
      l'ordine»; riga senza contesto → **non** cliccabile; l'errore 131047
      compare nel riquadro rosso.
  - 🐞 **IL GIRO COMPLETO PROVATO DALL'UTENTE, e il difetto che ha scoperto.**
    Domanda «aiutami» alle 16:04:53 dal pannello, avviso inviato, risposta da
    WhatsApp «cosa hai bisogno?» **registrata alle 16:05:10 — 17 secondi dopo**,
    firmata «Amministratore (WhatsApp)». Funzionava tutto, ma l'utente ha
    scritto «non arriva nulla»: **il pannello non ricaricava aprendosi**, e
    mostrava ancora «in attesa». ⚠️⚠️ Un pannello che si apre su una cosa
    vecchia fa credere che il canale sia rotto — ed è il modo più veloce per
    farlo abbandonare. Corretto: si ricarica **all'apertura**, ogni **45 s**
    (erano 120) e **al ritorno sulla finestra** (chi va a leggere la risposta su
    WhatsApp e torna deve trovarla).
  - ⚠️ Lezione: quando una cosa passa da un altro canale, **il segnale di
    ritorno va progettato quanto l'andata**. Qui il dato arrivava in 17 secondi
    e restava invisibile per due minuti.
  - ✅ **Provato per davvero il 23/08**: `npx tsx scripts/prova-aiuto-whatsapp.mts`
    → `esito: inviato`, wamid vero. **La finestra era aperta.** ⚠️ Lo script
    manda un messaggio VERO e cancella la riga di prova per id.
  - ⚠️ La riga di prova è stata cancellata: se qualcuno risponde a **quel**
    messaggio, la domanda non c'è più e la risposta finisce in inbox come un
    messaggio qualsiasi. È il comportamento giusto, non un guasto.

- **CHIEDERE AIUTO ALL'AMMINISTRATORE, DA OGNI PAGINA** (23/08/2026). Chiesto
  dall'utente: «un help laterale dove fare domande all'amministratore in caso di
  bisogno con un ordine o una richiesta; registra tutte queste richieste,
  verranno poi rilette dall'AI per capire come migliorare il modello».
  - Linguetta **Aiuto** sul bordo destro di ogni pagina (montata nel layout,
    **fuori** da `.layout`: dentro un contenitore che scorre seguirebbe la
    pagina). Tabella `DomandaAiuto`, rotta `/api/aiuto`.
  - ⚠️⚠️ **Il contesto lo registra il codice**: pagina di partenza e numero
    d'ordine (dall'indirizzo). «Che faccio?» non si può rispondere, «che faccio
    con l'ordine #2783» sì — e chiederlo in un campo vuol dire che una domanda
    su tre arriva senza. ⚠️ Il pannello **dichiara** che allega la pagina:
    allegare in silenzio roba di chi scrive è un modo per farlo scoprire male.
  - ⚠️ **Rispondono gli amministratori** (403 per gli altri) e vedono le domande
    di tutti; gli operatori vedono le proprie. **Chiedere lo possono tutti**,
    admin compresi: un pannello che a chi coordina non lascia chiedere gli dice
    che i suoi dubbi non contano.
  - ⚠️ **Il pallino ha due significati**: per l'admin le domande che aspettano
    lui, per chi ha chiesto le risposte non ancora lette (`lettaIl`). Senza,
    una risposta arrivata mentre eri altrove non ti raggiunge mai e resti
    bloccato mentre l'altro ti dà per risolto. ⚠️ Correggere una risposta
    **azzera `lettaIl`**: se no resteresti con la versione vecchia.
  - ⚠️ Il giro del pannello è ogni **2 minuti**, non 5 secondi come l'inbox: sta
    su OGNI pagina, e una chiamata continua ovunque si paga.
  - 🔗 **Le domande entrano nel giro notturno del glossario** come seconda fonte
    accanto alle chat, e valgono di più: se una persona che lavora qui ha dovuto
    chiedere, quel fatto nel glossario non c'era. Campo nuovo
    `PropostaGlossario.domandaId`, e il filtro ora accetta **una** delle due
    prove — conversazione **o** domanda — ma sempre una che **esiste**.
  - ✅ Riprovato dopo la modifica: 11 chat lette, 2 proposte nuove, **2 scartate
    dal filtro**; 5 proposte aperte in tutto.
  - ⚠️ **Non visto a pixel**: pannello del browser non a schermo. La linguetta è
    `position: fixed` col testo verticale — **da guardare**, soprattutto su
    mobile dove il pannello è a tutta larghezza.

- **LA TESTATA DELLA CONVERSAZIONE, RIORGANIZZATA** (24/08/2026, chiesto
  dall'utente sopra uno screenshot: «riorganizza con logica tutti questi
  bottoni»). Due righe: sopra CHI È (nome, recapito, badge — sola lettura),
  sotto CHE COSA CI FACCIO, in quattro gruppi separati da una lineetta:
  presa in carico · ordine · capire · andare via.
  - ⚠️ **Il difetto vero non era il numero dei bottoni, era il mescolamento**:
    il badge del canale finiva DOPO «Collega a un ordine», il numero del
    cliente DOPO «Lascia», e andando a capo non si capiva quale gruppo fosse
    quale.
  - ⚠️ **«Elimina» staccato da «Archivia»** (8px + lineetta, 14px sul
    telefono) e **la ✕ spostata nella riga di sopra**: erano vicini di casa
    con 6px in mezzo — il gesto per uscire e quello per distruggere.
  - ⚠️ «Collega a un ordine» sta **prima** di «Nuovo ordine ↗»: è di gran
    lunga il più frequente dei due, e il secondo porta fuori dall'app.
  - ✅ Guardata con un'anteprima temporanea sotto `/widget` (l'unico ramo
    pubblico del middleware): due righe, gruppi [Lascia] · [Cambia ordine,
    Nuovo ordine ↗] · [Riassunto, Diario, Traduci, Rubrica] · [Da leggere,
    Archivia, Elimina], ✕ nella riga dell'identità, separatori da 1px,
    Elimina rosso con 8px di stacco.

- **LA NOTA DI DIARIO DALLA CONVERSAZIONE** (24/08/2026, chiesto: «devo poter
  inserire una nota per il diario legato a questa conversazione»). Bottone
  **Diario** nella testata, pannello sotto, `NotaDiario.conversazioneId`.
  - ⚠️ **La nota prende ANCHE il numero d'ordine** quando la conversazione ne
    ha uno: si legge dalla chat e dalla scheda dell'ordine. Scriverla due
    volte sarebbe l'unico modo per averne due versioni diverse.
  - ⚠️ `conversazioneChi` è una **copia** del nome: la pagina del diario non
    carica le conversazioni, e la nota deve dire di chi parlava anche se la
    chat finisce nel cestino.
  - ⚠️ **Il numero delle note da fare sta sul bottone**: in un pannello chiuso
    una nota lasciata a un collega non esisterebbe.

- **LE AZIONI DELL'ORDINE, IN CINQUE GRUPPI** (24/08/2026, chiesto sopra uno
  screenshot: «paga va sotto con gli altri bottoni, riorganizza poi tutti i
  bottoni con logica»). Di chi è · parlare col cliente · soldi e guai ·
  lasciar detto · uscire dall'app.
  - ⚠️ **Nella SCHEDA «Paga» era già accanto a «Rimborso»**: quello che si
    vede nello screenshot è il blocco che va a capo dove capita. Il difetto
    vero era che dieci bottoni uguali in fila si spezzavano in punti diversi
    a ogni larghezza di finestra, e «Rimborso» si cercava a occhio ogni volta.
  - ⚠️ **Nella TABELLA invece il difetto c'era davvero**: `Paga fornitore`
    stava attaccato al menu «Assegna a…» — un'azione sui soldi come primo
    vicino di una sulle persone. Sceso accanto a «Rimborso».
  - ⚠️ **Un gruppo non si spezza dentro di sé** (`flex-wrap: nowrap`): a capo
    ci va la riga fra un gruppo e l'altro. Se i tre dei soldi si dividessero
    dove capita, il raggruppamento non lo vedrebbe più nessuno.
  - ⚠️ **«Rubrica» è finita col cliente** e non fra gli attrezzi: è il
    recapito del cliente, cioè la stessa cosa dei bottoni accanto.
  - ⚠️ Sul telefono i gruppi vanno a capo, la lineetta sparisce e «fuori»
    perde la spinta a destra.
  - ✅ Misurato su un'anteprima temporanea: a **450px** (la larghezza vera di
    una scheda nella bacheca) il blocco passa da **tre righe** a **due**,
    nessun gruppo spezzato, niente che sborda —
    riga 1 «Assegna a… | WhatsApp · Chiama · Email · Rubrica»,
    riga 2 «Reclamo · Rimborso · Paga | Nota | Fornitore ↗ · Shopify ↗».
    A 375px separatori nascosti, gruppi a capo, bottoni da 40px.

- **«DA LEGGERE» ANCHE DALL'ELENCO** (24/08/2026, chiesto: «consenti di
  impostare da leggere anche da vista inbox»). Una **busta** fra le iconcine
  di ogni riga in posta in arrivo: vuota = normale, piena e d'oro = segnata.
  - ⚠️ Serve **scorrendo l'elenco**: si legge l'anteprima, si capisce che ci
    vuole tempo, e la si mette da parte **senza entrarci**. Il bottone nella
    testata presuppone di essere già dentro.
  - ⚠️⚠️ `stopPropagation` obbligatorio: senza, il clic sarebbe arrivato alla
    riga, che APRE la conversazione — e aprirla **cancella** il segno. Il
    bottone avrebbe fatto il contrario di quello che dice, in silenzio.
  - ⚠️ È un INTERRUTTORE: un segno che si può solo mettere si toglierebbe
    aprendo la chat, cioè facendo la cosa che si voleva rimandare.
  - ⚠️ L'icona **cambia** (busta piena/vuota) e la busta accesa **non è
    smorzata** come le altre: quelle sono azioni, questa è uno stato.
  - ⚠️ **Difetto vecchio trovato per strada**: la riga riservava 58px a destra,
    che bastano a DUE icone. Sulle mail (che hanno anche lo Spam) ce n'erano
    già tre e l'anteprima finiva sotto le iconcine. Adesso lo spazio si conta
    con `:has(.azioni-riga > button:nth-child(3|4))` → 84px / 110px.
  - ✅ Guardata con un'anteprima temporanea con due righe, una WhatsApp
    segnata (3 icone, 84px, busta piena oro) e una mail non segnata (4 icone,
    110px, busta vuota grigia): in nessuna delle due il testo finisce sotto le
    icone, e il clic manda un solo PATCH nei due versi **senza aprire la
    conversazione**.

- **«DA LEGGERE», COME NELLA POSTA** (24/08/2026, chiesto: «consenti di
  lasciare una conversazione come non letta»). Campo `Conversazione.daRileggere`.
  - ⚠️⚠️ **NON è `nonLetti = 1`**: quello è il contatore dei messaggi
    arrivati, alzarlo a mano avrebbe mentito sul numero **e fatto squillare
    l'avviso** a chi ha appena messo il segno (`avvisi.ts` suona quando
    `nonLetti` cresce).
  - ⚠️ **Segnare CHIUDE la finestra**: il segno serve a ritrovarla
    nell'elenco, restare dentro a guardarla è la sola cosa che lo rende
    inutile.
  - ⚠️ **Lo spegne il clic che riapre**, non la rotta dei messaggi: quella la
    richiama il polling ogni 4 secondi.
  - ⚠️ **Anche la dashboard lo conta** fra «chi aspetta una risposta»: due
    funzioni diverse che contassero cose diverse direbbero numeri diversi
    senza dare errore.
  - ✅ `npx tsx scripts/prova-nota-e-rileggere.mts` sul database vero: 7
    controlli su 7 (la nota si ritrova dalla chat e dall'ordine, il segno
    porta «chi aspetta risposta» da 0 a 1, `nonLetti` resta 0, tutto
    rimesso com'era).

- **LA MATITA SULLE RISPOSTE PRONTE** (24/08/2026, chiesto dall'utente: «metti
  una matitina per cambiare anche da qui velocemente una risposta rapida»).
  Nel pannello Risposte dell'inbox ogni riga ha una matitina: si apre lì titolo
  e testo, si salva su `POST /api/script` (che già accettava un `id`).
  - ⚠️ **Il perché**: ci si accorge che un testo è sbagliato **mentre lo si sta
    per mandare**. Se correggerlo costa «esci, cerca, correggi, torna, ritrova
    la chat», nessuno lo fa: si aggiusta a mano quella volta e il testo resta
    sbagliato **per tutti**.
  - ⚠️ **Categoria e «quando» si rimandano com'erano**: la rotta riscrive la
    riga INTERA, e non mandarli li svuoterebbe — la categoria è quella che
    raggruppa l'elenco, e sparirebbe sotto le mani.
  - ⚠️ La matita è un bottone **fratello** della riga, non dentro: un bottone
    dentro un bottone non è HTML valido e il clic finirebbe a caso su uno dei
    due.
  - ⚠️ L'editor **dichiara** che si sta cambiando la risposta di tutti (e quella
    da cui attinge l'AI), non questo messaggio: la matita sta dentro una
    conversazione ed è facile crederlo.
  - ⚠️ Opacità **0,45** finché non ci si passa sopra: è manutenzione, e non deve
    competere col gesto vero della riga.
  - ✅ Guardata con l'anteprima temporanea: matita alta quanto la riga, 38px,
    opacità 0,45, niente scorrimento laterale; al clic l'editor si apre **al
    posto** di quella riga e le altre restano righe.

- **IL FOGLIO DI STILE, RIVISTO** (24/08/2026, chiesto dall'utente: «rivedi
  TUTTO il css»). 3.777 righe, 306 classi. Trovato poco, ma vero.
  - 🐞 **`.vuoto` era definita DUE VOLTE**, a mille righe di distanza e con due
    intenzioni diverse: «scritta al centro, alta quanto il contenitore» e
    «cartoncino con bordo». ⚠️ Non vinceva nessuna delle due: la cascata le
    **sommava**, e a schermo c'era un ibrido che nessuno aveva disegnato. Unite
    in una regola sola **con lo stesso risultato di prima** — cambiare l'aspetto
    di venti schermate senza averle guardate sarebbe stato peggio del difetto.
    ⚠️ Resta una decisione: `display:flex`+`height:100%` e il cartoncino sono
    due idee diverse, e una va tolta.
  - 🐞 `.scheda-ordine .azioni-ordine` definita due volte a **sette righe** di
    distanza: la prima era morta.
  - 🐞 `#248a3d` scritto a mano dov'era già `var(--green)`; `.sidebar` e
    `.campo select` spezzate in due blocchi lontani.
  - ✅ **Controllati e ASSOLTI** (non erano difetti):
    · i colori `--w-*` dei temi del **widget**, scritti per esteso anche quando
      il valore coincide con un token — il widget gira in un iframe sul sito di
      un cliente, e un tema che dipendesse dalla nostra palette cambierebbe
      aspetto sul sito altrui il giorno che ritocchiamo un token;
    · le **distanze in px**: questo design system ha token per colori, raggi e
      ombre, **non per lo spazio** (è dichiarato nel foglio stesso);
    · le cinque ridefinizioni della **bacheca stretta**: sono volute e vincono
      perché vengono dopo. Ora è scritto, così nessuno le «aggiusta».
  - 🆕 `npx tsx scripts/controlla-css.mts`: cerca **solo** le due cose che
    marciscono davvero — selettori doppi nello stesso contesto (tenendo conto
    delle `@media`) e colori già esistenti come token. ⚠️ Non segnala le classi
    «mai usate»: molte si compongono a runtime (`canale-${canale}`) e un
    controllo testuale le dà per morte — **il primo giro dava 21 falsi allarmi
    su 21**, e un elenco così non lo guarda più nessuno.
  - Oggi il controllo dice: **pulito**.

- **OPERATORI: I NUMERI ANCHE AL GIORNO** (chiesto dall'utente: «mostra le KPI
  diviso il numero di giorni lavorati»). Interruttore **Totali / Al giorno**
  accanto ai periodi, e colonna **Giorni** sempre visibile.
  - ⚠️⚠️ **«Giorni lavorati» = i giorni in cui c'è una TRACCIA**, non i giorni
    di calendario del periodo: chi è stato in ferie cinque giorni su sette
    verrebbe altrimenti diviso per sette e risulterebbe lento.
  - ⚠️⚠️ **Il divisore si vede sempre**, anche coi totali. Una media senza il
    denominatore davanti non si può controllare, e un numero che non si può
    controllare in una tabella di prestazioni non andrebbe mostrato affatto.
  - ⚠️⚠️ **Il giorno si calcola nel fuso di chi guarda** (`fuso` dal browser,
    `Intl.DateTimeFormat('en-CA', { timeZone })`): raggruppando a UTC un
    messaggio dell'una di notte italiana finirebbe nel giorno prima, e il lavoro
    serale risulterebbe spalmato su due giornate — cioè **la media verrebbe più
    bassa del vero**. Le date arrivano grezze e si raggruppano in JS apposta.
  - ⚠️ Zero giornate dà **«—»**, non zero: dividere per zero darebbe `Infinity`.
    E una cifra dopo la virgola, non due: è una media, non una misura.
  - ⚠️ Per la riga «Tutti» il divisore è la **somma delle giornate di tutti**:
    se tre persone lavorano lo stesso giorno, quel giorno vale tre giornate.
  - ⚠️ **Non sono i giorni dei TURNI**: quelli dicono quando una persona doveva
    esserci. Quando la griglia sarà piena si potranno confrontare, e la
    differenza sarà un'informazione.
  - ✅ `npx tsx scripts/prova-operatori.mts` ora controlla anche il divisore: i
    giorni di una persona non superano **mai** i giorni di calendario del
    periodo (se succedesse, il fuso starebbe spezzando le giornate). Misurato
    sugli ultimi 30 giorni: **Federica 17, Riccardo 12, Nicolò 10**.
  - 📊 E si vede subito a cosa serve: sui totali dei 30 giorni Federica domina i
    messaggi (618 contro 57), ma **al giorno chiude quasi quanto Nicolò**
    (5,4 ordini al giorno contro 5,4) — perché lui ha lavorato dieci giorni e
    lei diciassette.

- **GLOSSARIO: LA PASSATA SU TUTTO LO STORICO** (23/08/2026, chiesto
  dall'utente). `giroGlossario` ora prende opzioni (`ore: 0` = tutto,
  `salta`/`quante` per i lotti, `minLunghezza`, `maxProposte`), e
  `scripts/glossario-storico.mts` percorre l'archivio a lotti di 25.
  - ✅ **Girata davvero**: 175 conversazioni lette, **35 proposte nuove**, 6
    scartate dal filtro, fermata al tetto di **40 aperte** con **92
    conversazioni ancora da guardare**.
  - ⚠️ **Il tetto è una scelta, non un limite tecnico**: oltre le 40 nessuno le
    rilegge davvero, e un elenco che non si smaltisce è come non averlo. Si
    rilancia dopo aver smaltito, e riprende.
  - ⚠️ Si guardano solo le conversazioni con un messaggio in arrivo **oltre i 60
    caratteri**: su 590, quelle con sostanza sono **310** — il resto è «ciao»,
    newsletter e risponditori automatici, che costano e fanno rumore.
  - ⚠️ Il filtro sulla lunghezza è **in codice e non nella query**: Prisma non sa
    filtrare per lunghezza di un testo, e SQL grezzo per questo non vale.
  - ⚠️ **Un lotto vuoto non vuol dire che è finita**: può essere fatto tutto di
    newsletter. Per questo il giro torna `rimaste` e chi chiama va avanti.
  - ⚠️ **Il giro notturno resta a 24 ore**: la passata storica è una tantum.
  - 📋 Qualità delle 40 proposte, guardata a campione: **utili** («opzioni di
    ripieno per le torte» coi nomi veri, «modifica indirizzo/data di consegna»),
    **vaghe** («se il destinatario non è presente, il cliente deve essere
    informato» — non dice niente) e almeno una **rovesciata** («pagamento in
    ritardo: il cliente può sollecitare il saldo» — è il contrario). ⚠️ La
    revisione è lavoro vero: è esattamente il motivo per cui sono proposte.

- **IL GLOSSARIO, E IL GIRO NOTTURNO DELL'AI** (23/08/2026). Chiesto
  dall'utente: «una sezione glossario con tutte le informazioni sui brand e
  globali, tecniche e per i clienti; ogni giorno l'AI verifica dalle chat se c'è
  da aggiungere, correggere o segnalare».
  - `/glossario` (gruppo Messaggi, prima delle Risposte pronte: è quello che si
    legge *prima* di scrivere). Tre parti: **Da controllare** (le proposte
    dell'AI), **Le voci**, **Come siamo fatti**.
  - Tabelle nuove `VoceGlossario` e `PropostaGlossario` (`db push` additivo).
    Cron **`/api/cron/glossario` alle 5:40**, più «Rileggi le chat adesso».
  - ⚠️⚠️ **L'AI PROPONE, NON SCRIVE.** Il glossario è ciò su cui ci si basa per
    parlare a un cliente: scriverci dentro da sola metterebbe in bocca a una
    persona un fatto che nessuno ha verificato. Ogni proposta resta `aperta`
    finché qualcuno accetta o scarta.
  - ⚠️⚠️ **Ogni proposta deve citare una conversazione VERA**: il codice butta
    (in silenzio) quelle con un id inesistente, quelle su un marchio inventato,
    le correzioni a voci che non ci sono e i doppioni di proposte già aperte.
    Senza prova non è una proposta, è un'opinione. Provato: 12 conversazioni
    lette, 3 proposte tenute, **1 scartata dal filtro**.
  - ⚠️⚠️ **«Come siamo fatti» NON si scrive**: domini, numeri, caselle, siti e
    quota fornitore si leggono dalla configurazione a ogni apertura. Copiarli in
    una voce vorrebbe dire che il giorno che cambiano il glossario mente — e a
    un glossario che mente ci si crede.
  - ⚠️ **Non è un doppione di Script / IstruzioneAI / DocumentoAI**, e la
    distinzione è scritta a schermo: qui stanno i **fatti**, non i testi da
    mandare né le regole di tono. Se si mescolano, in sei mesi ci sono quattro
    posti dove cercare la stessa cosa.
  - ⚠️ `negozioId` è una **stringa vuota** e non `null` per «vale per tutti»: in
    Postgres due NULL non sono uguali, quindi con una colonna nullable
    `@@unique([termine, negozioId])` **non impedirebbe** due voci globali con lo
    stesso termine.
  - 🐞 **Terza volta che serve la stessa separazione**: `src/lib/glossario.ts`
    deve restare **puro** (lo importa la pagina, che è client). La build fallisce
    con «node:crypto non gestito» — le query stanno nella route. Come per
    `turni.ts` e `refusi.ts`: è una regola, non un caso.
  - ✅ Provato contro le chat vere: `npx tsx scripts/prova-glossario.mts` — 3
    proposte sensate, ognuna con la sua conversazione («foto dei fiori prima
    della consegna», «pagamento in valuta estera», «consegna in giornata»).
  - ⚠️ **Non visto a pixel**: pannello del browser non a schermo.
  - ➡️ **Passo successivo non fatto, da decidere**: il glossario **non entra**
    ancora nelle risposte dell'AI ai clienti. Farlo entrare cambia quello che
    l'AI dice a un cliente, ed è una decisione da prendere apposta.

- **QUANTO DARE AL FORNITORE, SULLA SCHEDA DELL'ORDINE** (23/08/2026).
  Chiesto dall'utente: «metti anche la % da dare al fornitore indicativa».
  - Nel riquadro «Chiedi al fornitore»: «Al fornitore, indicativamente:
    **81,00 €** — il 60% di 135,00 €. È la quota uguale per tutti: si cambia in
    Deluxy Orders → Impostazioni».
  - ⭐⭐ **LA REGOLA ESISTEVA GIÀ, e non qui**: sta in **Deluxy Orders**,
    impostazione `controllo.quotaFornitore` (default **60**), usata là per
    controllare i pagamenti ai fornitori (`src/lib/controllo.ts`,
    `valutaQuota`: sotto la quota è bene, sopra è male, tolleranza 0,5 pp).
    **Non era esposta da nessuna API.**
  - Aggiunta in Orders la rotta **`GET /api/v1/quota-fornitore`** (sola
    lettura, chiave come le altre; `?totale=135` torna anche `atteso: 81`).
    ⚠️ Il conto lo fa **chi possiede la regola**, così non si sparpagliano
    moltiplicazioni per le app.
  - ⚠️⚠️ **Non si ricopia il 60% qui.** Una seconda copia nel codice di
    quest'app resterebbe al vecchio valore il giorno che la cambiano in Orders,
    e due schermate direbbero due percentuali diverse **senza che nessuno se ne
    accorga**. È la regola «non si duplicano i dati di altri registri», applicata
    a una regola invece che a un dato.
  - ⚠️ **Se Orders non risponde, la riga non compare** (`leggiQuotaFornitore`
    torna `null`, timeout 4 s). Meglio una riga in meno che un numero inventato
    accanto a dei soldi.
  - ⚠️ **«Indicativamente» è scritto a schermo** e ci deve restare: la quota è
    **una sola per tutti** — non ci sono regole per fornitore, per marchio o per
    prodotto. Senza quella parola passerebbe per un prezzo concordato.
  - ✅ Provata in produzione con la chiave vera: `60` senza totale, `atteso: 81`
    con `totale=135` (l'ordine #2783 della richiesta), **nessun importo** con un
    totale illeggibile (un «≈ 0,00 €» sarebbe una risposta sbagliata con l'aria
    di una giusta), e **401** senza chiave.
  - ⚠️ **Non vista a pixel**: pannello del browser non a schermo.
  - 🐞 Nota di lavorazione: i file già in repo sono a **CRLF** (git li converte
    in checkout). Uno script che cerca un blocco multiriga scritto con 
 **non
    lo trova**, e sembra che il testo sia cambiato: va convertito prima.

- **LE REAZIONI SI VEDONO** (23/08/2026). Chiesto dall'utente vedendo
  «[reaction]» in una chat WhatsApp.
  - L'emoji compare in una pastiglia **sotto la bolla a cui è attaccata** (campo
    nuovo `Messaggio.reazione`, `db push` additivo), come in ogni chat. Vale
    anche per le reazioni ai **nostri** messaggi: 908 dei 945 usciti hanno
    `idEsterno` salvato, quindi si ritrovano.
  - ⚠️⚠️ **Una reazione non è un messaggio**: è un francobollo su una frase.
    Registrarla come riga a sé dava «[reaction]» in mezzo al filo — né quale
    emoji né a che cosa. In tabella ne restano **19** così, **irrecuperabili**
    (l'evento l'emoji non la salvava): a schermo ora dicono «Il cliente ha messo
    una reazione — quale, non lo sappiamo», con la data.
  - ⚠️ **L'emoji vuota è l'annullamento**, non un evento da ignorare (su
    Instagram `action: 'unreact'`): chi leva il cuore se lo deve veder sparire.
  - ⚠️ **Non tocca `ultimoMessaggioIl`**: il filo si ordina per quello, e un
    pollice non è lavoro da fare. Far risalire una chat chiusa per una reazione
    sarebbe rumore.
  - ⚠️ **Se il messaggio riferito non c'è** (più vecchio dell'archivio) l'emoji
    non si butta: si registra come riga normale. Meglio un cuore senza contesto
    che un cuore perso.
  - 🐞 **Su Instagram e Messenger le reazioni non arrivavano AFFATTO**, nemmeno
    come «[reaction]»: lì Meta le manda in `messaging[].reaction`, **fuori da
    `message`**, e il codice leggeva solo `ev.message` — il `continue` le
    buttava via in silenzio. Adesso si leggono.
  - ✅ `npx tsx scripts/prova-reazioni.mts`: 8 casi, tutti passano (attacca,
    sostituisce, toglie, id inesistente, e la conversazione che non risale).
    ⚠️ Lo script SCRIVE: crea righe sue con un id riconoscibile e **le cancella
    per id**. Mai un `deleteMany` senza filtro su questo database.
  - ⚠️ **Non visto a pixel** (pannello del browser non a schermo): la pastiglia
    ha la sua regola CSS `.bolla .reazione`, con la variante chiara sulle bolle
    in uscita. **Da guardare.**

- **IL CORRETTORE DI BOZZE** (23/08/2026). Chiesto dall'utente dopo aver visto
  partire «Good mornign» e «Yes we recived your order».
  - 📊 **Misurato prima di costruire**: su **120 messaggi usciti** scritti a
    mano, **18 avevano almeno un refuso vero (15%)** — «consegnsa»,
    «servirbbe», «realzzazioen», «tranfer», «theese», «tutta via», «un ora».
    ⚠️ Nel campione **103 messaggi su 120 sono di una persona sola**: non si
    può leggere come «è un problema suo», scrive lei quasi tutto.
  - **Come funziona**: premi Invia → il messaggio viene riletto. A posto, parte
    subito; con dei refusi **non parte**, e sopra la casella compaiono le
    parole trovate con **«Correggi»** e **«Manda così»**.
  - ⚠️⚠️ **L'AI propone, il codice decide** (`src/lib/refusi.ts`): ogni parola
    proposta deve **esistere nel testo come parola intera**, o si butta in
    silenzio. Senza questo filtro un modello che «migliora» la frase
    riscriverebbe un cognome o una via, e non se ne accorgerebbe nessuno.
  - ⚠️⚠️ **Non corregge e non manda mai da solo.** «Manda così» **deve
    restare**: chi scrive sa cose che il correttore non sa, e senza via d'uscita
    il correttore diventa un ostacolo — che si aggira smettendo di leggerlo.
  - ⚠️ **Fallisce aperto**: timeout 2,5 s, errori ingoiati, `controllato:false`
    → il messaggio parte. Bloccare le risposte ai clienti è peggio di un refuso.
  - ⚠️ **Mascherati prima di andare al modello**: link, email, `#numeri`,
    telefoni, IBAN. E ogni proposta con cifre si butta comunque («21018» è un
    CAP). **Più di 5 refusi = nessuno**: non è un testo pieno di errori, è un
    testo non capito.
  - ⚠️ **Modello grande, misurato**: `gpt-4o` 18 trovati, `gpt-4o-mini` 11 sugli
    stessi 120. ~1 €/mese al nostro volume. Stessa lezione già in `src/lib/ai.ts`.
  - ⚠️ `src/lib/refusi.ts` **non importa né OpenAI né il database**: lo importa
    l'Inbox, che è un componente client. Le chiamate stanno in `correttore.ts`.
  - 🎁 Aggiunto anche l'attributo `lang` alla casella di risposta (dalla lingua
    del cliente, che l'app già calcola in codice): il correttore del browser
    era acceso ma inutile — con il solo dizionario italiano ogni parola inglese
    risultava sbagliata.
  - ✅ `npx tsx scripts/prova-correttore.mts`: **17 casi**, tutti passano.
    `prova-correttore-vero.mts` prova la catena col modello: le quattro frasi
    vere corrette, e la frase giusta con indirizzo/ordine/telefono **non dà
    nessun falso allarme**.
  - ⚠️ **Il riquadro non è stato visto a pixel**: il pannello del browser non
    era a schermo e `getBoundingClientRect` tornava zeri (trappola nota). La
    struttura è verificata nel DOM — etichetta, pastiglie, «Correggi», «Manda
    così» — ma **l'occhio ce lo deve mettere una persona**.

- **«PAGA» FRA LE AZIONI, E «NOTA» CHE SCRIVE SUL DIARIO** (23/08/2026, LIVE,
  commit `587edfc8`). Chiesto dall'utente guardando la bacheca ordini.
  - **«Paga»** stava in cima accanto al menu «Assegna a…» e ci faceva riga a
    sé. Un pagamento non è compagno di riga dell'assegnazione: è un'azione come
    «Rimborso», con cui si legge insieme. Spostato lì accanto — i soldi vicini
    ai soldi.
  - **«Nota»** (`BottoneNota` in `OrdiniLista.tsx`) scrive una riga del diario
    **dall'ordine che si ha davanti**. Prima: cambiare pagina, ritrovare il
    numero, ribatterlo — tre passaggi, e quello che costa tre passaggi non si
    scrive. Invio salva, Esc chiude.
  - ⚠️ **Il numero dell'ordine lo mette il codice, non la persona**: l'API sa
    staccarlo dalla testa del testo, ma qui il contesto lo conosciamo già, e
    farlo ribattere vuol dire prima o poi attaccare la nota all'ordine
    sbagliato.
  - ⚠️ **La casella si svuota e si chiude SOLO dopo un salvataggio riuscito**:
    chiuderla comunque farebbe sparire una frase appena scritta proprio quando
    il salvataggio è fallito.
  - ⚠️ Il commit toccava **solo `OrdiniLista.tsx`**: manuale e handoff sono
    arrivati dopo, in un commit a parte. La regola del repo li vuole **nello
    stesso commit** — segnato qui perché non si ripeta.

- **TURNI: CHI LAVORA E QUANDO** (21/08/2026). Chiesto dall'utente: «una
  sezione in alto per admin TURNI dove consenti di impostare i turni per gli
  operatori». Pagina `/turni`, **primo gruppo del menu**, **solo
  amministratori** — e il gruppo per un operatore **non compare proprio**: una
  voce che risponde «serve un amministratore» sembra un guasto, non una regola.
  Per farlo, il ruolo ora arriva alla `Sidebar` dal layout (stessa cosa fatta
  anche per «Operatori»).
  - ⚠️ **Rifatta subito dopo la prima versione, su richiesta dell'utente
    («semplifica: è tipo gli orari di apertura di Google»).** Prima era una
    griglia persone × 7 giorni con sopra una barra da **quattro tendine**:
    funzionava e non si capiva — per mettere il lunedì di Federica bisognava
    scegliere persona, giorno e due ore in controlli diversi, e poi cercare dove
    fosse finita la pastiglia. Ora si sceglie **una persona** e si aprono o
    chiudono i suoi **sette giorni**, con le ore scritte dov'è scritto l'orario.
  - Tre parti: **Adesso** (chi è dentro, fino a che ora, e chi entra dopo), **gli
    orari della persona scelta** (7 righe Aperto/Chiuso, «+ Aggiungi orario» per
    la seconda fascia), **Giorni speciali** (ferie, permessi, orari diversi).
  - ⚠️ Le pastiglie delle persone dicono **quanti giorni** hanno già («· 4g»):
    si vede chi non ha ancora un orario senza aprirlo.
  - ⚠️ Chiudere un giorno è **una chiamata sola** (`DELETE ?cosa=giorno`): una
    per fascia vorrebbe dire più risposte in parallelo, ognuna con lo stato
    completo, e l'ultima che arriva vince — il giorno resterebbe mezzo aperto a
    schermo.
  - Due tabelle e non una (`TurnoSettimanale`, `EccezioneTurno`; `db push`
    additivo): la regola che si ripete e le volte in cui non vale sono due
    domande diverse. Con una sola, ogni permesso costringerebbe a riscrivere la
    settimana e poi a rimetterla a posto — e nessuno lo farebbe, così la griglia
    direbbe il falso in silenzio.
  - ⚠️⚠️ **L'eccezione vince sempre sulla settimana.** *Non lavora* cancella
    **tutte** le fasce di quel giorno (non una); *orario diverso* le
    **sostituisce**. Provato: `npx tsx scripts/prova-turni.mts`, 18 casi, tutti
    passano — compreso il caso in cui Federica ha due fasce e le ferie le
    devono togliere entrambe.
  - ⚠️⚠️ **Ore e giorni sono TESTO, non date**: `"09:00"` è un orario da parete,
    `"2026-08-25"` un giorno di calendario. Con dei `DateTime`, a fine ottobre
    — finita l'ora legale — tutti i turni si sposterebbero di un'ora da soli, e
    il 25 agosto salvato a mezzanotte italiana tornerebbe indietro come «24
    agosto 22:00». Stessa ragione per cui «Adesso» si calcola nel browser.
  - ⚠️ `giornoValido` controlla che il giorno **esista**: `2026-04-31`
    scivolerebbe al primo maggio senza dare errore, e l'eccezione finirebbe sul
    giorno sbagliato.
  - **I TURNI SI IMPOSTANO ANCHE PER SETTIMANA** (chiesto subito dopo: «consenti
    di impostare per settimane»). Sopra i sette giorni c'è **Sempre** (la regola
    che si ripete) oppure **‹ 24 – 30 ago ›** con le frecce e «Questa
    settimana». Dentro una settimana i giorni portano la **data**; appena se ne
    cambia uno, quel giorno si **stacca** dalla regola — etichetta «solo questa
    settimana», campo per il motivo, e «Torna al solito» che lo riattacca. In
    fondo, **Prossimi cambi**: i giorni staccati di tutti, cliccabili per aprire
    la loro settimana.
    - ⚠️⚠️ **La regola non si tocca mai** quando si lavora dentro una settimana:
      è tutto il punto. Le ferie del 25 agosto non devono costringere a
      riscrivere il martedì e poi a rimetterlo a posto.
    - ⚠️⚠️ **Un giorno si scrive INTERO, in una chiamata sola** (`cosa:
      'settimana-giorno'` e `cosa: 'giorno-data'`, dentro una transazione).
      Prima era «cancella il giorno, poi riscrivi le fasce» in più chiamate: se
      la seconda non arriva, il giorno resta **vuoto** — cioè si è cancellato un
      turno per cambiargli mezz'ora. Ora o cambia tutto o non cambia niente.
    - ⚠️ **`GET /api/turni?dal=<lunedì>`**: senza, i cambi partono da ieri e una
      settimana passata torna vuota — direbbe «era una settimana normale»
      invece di «non te l'ho caricata».
    - ⚠️ Un giorno non può essere insieme «non lavora» e «lavora dalle…»:
      scrivere un orario toglie il riposo e viceversa, altrimenti in tabella
      restano righe che si contraddicono.
    - ⚠️ `lunediDi`/`giornoSettimana`/`piuGiorni` stanno nel **lib puro** e
      hanno le loro prove: `getDay()` chiama la domenica **0** (presa così
      sposta la settimana di un giorno, e si vedrebbe solo di domenica), e
      `piuGiorni` usa `setDate` e non «più 7 × 86.400.000 ms» — le due notti in
      cui cambia l'ora legale durano 23 e 25 ore.
    - ✅ Guardata con l'anteprima temporanea: in «Sempre» si vede la regola; in
      «17 – 23 ago» il mercoledì staccato mostra **14:00–18:00** (non il
      09:00–18:00 della regola) col motivo «visita»; nella settimana dopo il
      martedì 25 è «non lavora · solo questa settimana · ferie» e il mercoledì
      26 **torna a seguire la regola**. A 375px non scorre di lato.
    - ✅ `npx tsx scripts/prova-turni.mts`: **28 casi**, tutti passano.

  - 🐞⚠️⚠️ **Le `24:00` erano ammesse e sono state TOLTE — bug trovato provando
    la pagina, non leggendo il codice.** Il campo orario del browser
    (`<input type="time">`) arriva alle **23:59**: un turno salvato con le 24:00
    tornava a schermo **con la casella di fine vuota**. Dato giusto nel
    database, pagina che sembra rotta — il modo peggiore di sbagliare. Ora si
    finisce al più tardi alle **23:59**, e i turni di notte vanno spezzati in
    due. ⚠️ Le tabelle erano vuote, quindi niente da migrare.
  - ⚠️ `src/lib/turni.ts` **non parla col database** ed è una regola da non
    rompere: lo importa anche il componente client. Le query stanno in
    `src/app/api/turni/route.ts`.
  - ⚠️ **I turni non fanno succedere niente**: non assegnano ordini, non
    smistano conversazioni, non impediscono di lavorare fuori orario. Scritto
    anche a schermo, perché è la prima cosa che si dà per scontata.
  - ✅ **Guardata davvero**, con un trucco che vale la pena ricordare: la pagina
    vuole un login e le password non le usa una sessione Claude, quindi si mette
    un file **temporaneo** sotto `src/app/widget/…` — l'unico ramo fuori dal
    cancello del middleware — che rende il componente con dati finti e la
    `window.fetch` sostituita. Si guarda, si cancella, non si committa. È così
    che è saltata fuori la casella vuota delle 24:00.
  - ✅ Provata anche a **375px**: le righe dei giorni vanno a capo e la pagina
    **non scorre di lato** (`scrollWidth === clientWidth`). La vecchia griglia a
    7 colonne, quella, scorreva.
  - ⚠️ `npx tsx scripts/prova-turni.mts`: 20 casi, tutti passano.

- **OPERATORI: QUANTO LAVORO HA FATTO CIASCUNO** (21/08/2026). Chiesto
  dall'utente: «una sezione per giudicare gli operatori — quanti ordini
  gestiscono, quante chat, quanti link di pagamento inviano». Pagina
  `/operatori`, **prima voce del gruppo Qualità** (le altre misurano chi
  consegna, questa misura noi) e **solo amministratori** — il controllo sta in
  `/api/operatori`, non solo nella pagina.
  - Sette colonne: **Ordini presi** (`Ordine.presaDaId`/`presaIl`), **Ordini
    chiusi** (`gestione='gestito'` + `gestioneDaId`/`gestioneIl`), **Chat
    prese** (`Conversazione.presaDaId`), **Chat risposte** (conversazioni
    *diverse* in cui ha scritto), **Messaggi inviati**
    (`Messaggio.direzione='out'` + `utenteId`), **Link di pagamento** e
    **Ordini creati**.
  - ⚠️ *Chat prese* e *Chat risposte* sono due cose diverse apposta: prendere
    in carico è un clic, rispondere è il lavoro. Chi risponde senza prendere in
    carico lo vede solo la seconda.
  - **Periodi**: oggi · ieri · 7 giorni · questo mese · 30 giorni · trimestre ·
    anno · date a scelta. Mese/trimestre/anno di **calendario**, 7 e 30 giorni
    **mobili**; *ieri* è il giorno intero; nelle date a scelta l'ultimo giorno è
    **compreso** (il confine è la mezzanotte del giorno dopo).
  - ⚠️⚠️ **I confini si calcolano nel BROWSER e si mandano come istanti.** Sul
    server sarebbero UTC — Vercel sta lì — e «oggi» comincerebbe alle 02:00
    italiane: due ore di lavoro di ogni mattina finirebbero nel giorno prima,
    **senza che nulla desse errore**. L'intervallo risolto è sempre scritto a
    schermo, perché «trimestre» non vuol dire la stessa cosa per tutti.
  - 🆕 **Tabella `OrdineCreato`** (`prisma db push`, additiva). Serviva perché
    **i link di pagamento non erano misurabili**: `/nuovo-ordine` creava la
    bozza su Shopify e nessuno scriveva chi era stato — il nome dell'operatore
    vive solo nella sessione, Shopify non lo sa, e **all'indietro quel dato non
    si recupera**. Ora la riga si scrive alla nascita dell'ordine, col totale
    vero calcolato da Shopify (`totalPriceSet`, validato contro lo schema prima
    di toccare la mutation).
  - ⚠️⚠️ **La scrittura di quella riga non può far fallire l'ordine**: quando ci
    si arriva la bozza su Shopify **esiste già**, e un errore mostrato
    all'operatore lo farebbe ricominciare — col cliente che si ritrova due
    ordini e due link. È in try/catch, l'errore va nei log e finisce lì.
  - ⚠️ **`OrdineCreato` NON è un secondo registro degli ordini**: quello resta
    Deluxy Orders. Qui c'è solo la riga di lavoro (chi, quando, come, quanto), e
    nessuna schermata legge di lì lo stato di un ordine.
  - ⚠️ **Il campanello grosso, scritto anche a schermo**: `gestioneDaId`/
    `gestioneIl` tengono **solo l'ULTIMO cambio di stato**. Se qualcuno riapre
    un ordine chiuso, quella chiusura non si conta più a nessuno. Non c'è un
    registro delle azioni in quest'app: la pagina misura **il lavoro, non il
    merito**, e lo dice.
  - ⚠️ Ogni colonna dichiara **da quando si misura** (riquadro in fondo, letto
    dal database): serve a non leggere «zero» come «non ha fatto niente» quando
    la verità è «qui non si misurava ancora». Link e ordini creati: dal 21/08;
    le altre da fine luglio 2026.
  - ✅ **Provato contro il database vero**: `npx tsx scripts/prova-operatori.mts`
    stampa tutti i periodi e verifica che «da sempre» dia gli stessi totali di
    un conteggio senza filtri — **tornano tutti** (16 presi, 143 chiusi, 51 chat
    prese, 810 messaggi). I periodi discriminano davvero: oggi 11 messaggi, ieri
    23, 7 giorni 183, il mese 759.
  - ⚠️ **Non verificato a schermo da una sessione**: la pagina vuole un login da
    amministratore, e le password non le usa una sessione Claude. Typecheck e
    build passano, `/operatori` compare fra le rotte. **Da guardare con gli
    occhi.**

- **NUOVO ORDINE PER IL CLIENTE AL TELEFONO** (19/08/2026, LIVE). Pagina
  `/nuovo-ordine`: negozio, cliente (precompilato dalla conversazione), giorno e
  fascia, indirizzo, prodotti, biglietto, e **due metodi di pagamento**:
  «link di pagamento» (bozza + invito, resta bozza finché non paga) o «ha già
  pagato» (bonifico/contanti/POS → ordine **pagato**, con conferma davanti e il
  mezzo scritto nelle note).
  - ⚠️⚠️ L'ordine **nasce in Shopify** come bozza e torna dal registro come
    tutti gli altri: uno scritto solo da noi sarebbe invisibile a logistica e
    contabilità.
  - ⚠️ Giorno e fascia vanno negli attributi `Data_Consegna` e
    `Fascia_Oraria_Consegna`, gli unici che il registro legge.
  - ✅ **`read_products` aggiunto il 19/08**: il catalogo si legge su tutti e
    tre i negozi (30 varianti Deluxy, 12 Cake, 30 Flowers, **tutte con foto**) e
    nei risultati c'è la miniatura — al telefono col cliente «quello con le
    peonie» si riconosce a colpo d'occhio, e i titoli si somigliano tutti
    («· Medio», «· Medio-Grande», «· Grande»). La riga scritta a mano resta per
    i fuori-listino. ⚠️ L'avviso «catalogo non leggibile» resta nel codice: se
    il permesso venisse tolto, una lista vuota direbbe «non c'è niente con quel
    nome», che è un'altra cosa da «non posso guardare».

- **CHARGEBACK: SEZIONE, RISPOSTA ALLA BANCA E COMPITO DEL GIORNO** (19/08/2026,
  LIVE). Chiesto dall'utente. Il dato viveva solo dentro Shopify: misurato lo
  stesso giorno, **10 contestazioni perse per 2.087,66 €** e **3 aperte per
  373,28 €**, due con le prove da mandare entro il **5 settembre**.
  - `src/lib/chargeback.ts`: legge `shopify_payments/disputes` sui tre negozi
    (REST) e risponde con la mutation GraphQL `disputeEvidenceUpdate`.
  - ⚠️⚠️ **È L'UNICO PUNTO IN CUI QUEST'APP PARLA CON SHOPIFY**, ed è una deroga
    **dichiarata** alla regola di `src/lib/negozi.ts`. Quella regola esiste per
    non avere due verità sugli **ordini**; qui gli ordini non si toccano — le
    contestazioni Orders non le ha, non le importa e non le espone. Il confine
    sta nel codice: quelle funzioni sanno raggiungere solo le dispute.
  - Pagina `/chargeback`: elenco per scadenza più vicina con «quanto manca»;
    il dettaglio dice **che cosa vuole la banca** a seconda del motivo.
  - ⚠️ Due gesti distinti: «Salva bozza» resta qui, «Invia le prove» è
    **irreversibile** e chiede conferma con numero e importo davanti.
  - ⚠️ Il testo già scritto su Shopify **vince** sulla bozza nostra: se un
    collega ha risposto dal pannello, riscriverci sopra sarebbe cancellarlo.
  - Dashboard: numero in cima + riquadro **primo di tutti** (è l'unica cosa che
    scade da sola). ⚠️ Se non ce ne sono, il riquadro sparisce: uno vuoto tutti
    i giorni si impara a saltare.
  - Cron `25 * * * *`, più il bottone «Aggiorna da Shopify».
  - ⚠️ Permessi: bastano quelli aggiunti il 19/08 (`read_shopify_payments_disputes`
    + `write_orders` per le prove). **Non** serve `read_shopify_payments`: quello
    aprirebbe `shopifyPaymentsAccount`, che non usiamo.

- **ORDINI: CHI SE NE OCCUPA, PAGAMENTO E FRODE, FORNITORI IN ZONA** (19/08/2026,
  tutto LIVE). Una giornata sulla bacheca degli ordini, su richiesta dell'utente.
  - **Presa in carico degli ordini**, con le stesse regole delle conversazioni
    (`Ordine.presaDaId/presaDaNome/presaIl`, db push additivo). Bollino oro se è
    di un collega, grigio se è mio; filtro «Chi se ne occupa: Liberi / Miei».
    ⚠️ Update **condizionato** (`updateMany` su «libero o già mio»): con un
    update secco due operatori che premono nello stesso secondo leggerebbero
    entrambi il proprio nome. ⚠️ Si lascia **solo il proprio**.
  - **L'amministratore assegna, l'operatore prende**: per l'admin il bottone
    diventa il menu «Assegna a…» con tutti gli operatori. ⚠️ Assegnare a un
    altro è **403 per i non-admin**: un operatore che può scaricare un ordine su
    un collega non fa una presa in carico, fa uno scarico di responsabilità con
    l'aria di essere una funzione. ⚠️ Anche l'admin passa dal 409 se l'ordine è
    in mano a un terzo: toglierlo di soppiatto è il guaio di sempre.
  - **Pagamento e rischio frode nella lista** (`rischioLivello`,
    `rischioRaccomandazione`, e `statoPagamento` che il sync **non riempiva
    più**: 491 ordini su 1.273 l'avevano vuoto). Il dato c'era già in Orders
    (`shopify.financialStatus`, `shopify.rischio`, che tiene la valutazione più
    severa fra quelle che Shopify conosce). ⚠️ LOW/NONE e pagamento sconosciuto
    **non si mostrano**: un bollino su tutto è come nessun bollino. Misurato su
    7 giorni di ordini veri: 3 PENDING, 2 MEDIUM/INVESTIGATE (#2749, #2714).
    Riempito l'arretrato con un giro completo (866 ordini).
  - **Fornitori del registro nella provincia di consegna**, nel pannello
    dell'ordine: pasticcerie per il negozio Cake, fiorai per Flowers, con
    WhatsApp/Email/«Copia richiesta». ⚠️ La richiesta usa **lo stesso testo
    dell'app Ricerca fornitori**. ⚠️⚠️ `src/lib/province.ts` perché nel registro
    la stessa provincia è scritta in due modi (**20 «MI» e 9 «MILANO»**): senza
    normalizzare, Milano trovava 20 fornitori su 29 e la lista sembrava solo più
    corta. ⚠️ I mestieri hanno più etichette (FIORISTA+FIORI, PASTICCERIA+
    CIOCCOLATERIA) e il recapito può essere di un **referente**. Misurato:
    Milano → 9 pasticcerie / 6 fiorai; Firenze e Novara → nessuno, e lo dice.
  - **IL SALUTO AUTOMATICO PARLA LA LINGUA DEL CLIENTE** (19/08/2026, LIVE).
    Un cliente ha scritto in inglese e si è visto rispondere in italiano: un
    saluto nella lingua sbagliata dice che dall'altra parte non lo hanno nemmeno
    letto. Ora it/en/fr/es/de.
    ⚠️⚠️ `linguaDelTesto` **da sola non basta**, e non è un difetto: pretende 3
    parole comuni e 2 punti di margine perché decide se *pagare* una traduzione
    (senza margine, 13 newsletter italiane su 384 risultavano portoghesi). Su
    «Hi I want deliver a sympathy flower in Italy address is Via Teocrito 56
    Milano» risponde «non so»: metà delle parole sono nomi propri italiani.
    Qui la decisione costa meno, quindi la catena è **testo → marcatori
    («hello», «please», «bonjour») → prefisso del telefono → italiano**.
    ✅ Provata con 10 casi: `npx tsx scripts/prova-primo-contatto.mts`.
    ⚠️ Le traduzioni sono **scritte a mano** nel codice: il messaggio parte
    dentro il webhook, e una chiamata a un traduttore lì dentro è un messaggio
    che rischia di perdersi. Il testo delle Impostazioni vale per l'italiano.
  - **ORA DI INVIO E RICEZIONE SU OGNI MESSAGGIO** e **«/» apre le risposte
    pronte** (ricerca per titolo, Invio sceglie la prima; solo a riquadro vuoto,
    e la barra non resta scritta).
  - 🐛 **«COLLEGA A UN ORDINE» SEMBRAVA NON FARE NIENTE**: il pop-up nasceva
    prima della finestra della conversazione e, **a parità di z-index, ordina il
    DOM** — finiva dietro. Ora ha il suo livello (`velo-sopra`).
    ⚠️ Da ricordare: nell'inbox a colonne il thread È già una finestra col suo
    velo. Ogni nuovo pop-up aperto da lì va sopra, o non si vede.
  - **I NUMERI D'ORDINE CITATI NELLA CONVERSAZIONE** si propongono con un clic
    nel pop-up. ⚠️ Solo le forme che dichiarano un ordine (#2759, «ordine
    2759»): in chat girano civici, CAP e importi.
  - **COLLEGARE UNA CONVERSAZIONE A UN ORDINE, A MANO** (19/08/2026, LIVE):
    bottone nella testata del thread + pop-up di ricerca (numero, cliente,
    telefono, email, indirizzo) che parte già col nome del cliente.
    ⚠️ Cerca fra **tutti** gli ordini, non i soli aperti: una mail arriva spesso
    dopo la consegna. ⚠️ Si salva il **numero**, non l'id — è la chiave
    dell'aggancio automatico e sopravvive all'uscita dai 60 giorni. ⚠️ Un numero
    inventato non diventa un aggancio a niente: la rotta risponde 404.
  - **«GESTITO» RESTA LA CHIUSURA, NON UN PASSO** (19/08/2026, LIVE). Era
    finito in fila coi passi come se fosse il quinto: ma gli altri dicono *a che
    punto siamo* e questo dice che *abbiamo finito*, ed è l'unico che fa uscire
    l'ordine dalla lista. Ora sta accanto, staccato, verde, e da acceso il clic
    riapre. ⚠️ È una distinzione da non perdere al prossimo ritocco.
  - **RIGA DI FILTRI PER PUNTO DI LAVORAZIONE** (19/08/2026, LIVE): Solo nuovi |
    Tutti gli aperti · i quattro passi | Gestiti, sotto i filtri lunghi.
    ⚠️ Stessa impostazione della tendina, non una seconda: due comandi che
    raccontano stati diversi sono il modo più rapido per non fidarsi di
    nessuno dei due.
  - **LA CONSEGNA SI SPOSTA DAL PANNELLO, E LO STATO SI CAMBIA ANCHE LÌ**
    (19/08/2026, LIVE). Il pannello è dove si lavora l'ordine: ci si accorge lì
    di essere passati al punto dopo, e chiudere per cambiare stato sulla scheda
    è un giro che non fa nessuno. Stessa cosa per la consegna: il cliente
    chiede un altro giorno, e prima si andava su Shopify aspettando il reimport.
    - ⚠️⚠️ Il valore nuovo si scrive **dentro `dataConsegna`/`fasciaConsegna`**,
      i campi che leggono già urgenza, calendario, ordinamenti e messaggio al
      fornitore: una data «nostra» in un campo a parte sarebbe vera solo nella
      schermata che la mostra.
    - ⚠️ `consegnaSpostata` dice al sync di non ripassarci sopra — senza,
      la decisione di una persona sparirebbe entro 15 minuti — e
      `dataConsegnaOriginale` tiene quella di Shopify per mostrarla accanto.
    - ⚠️ **La divergenza si dichiara a schermo** («spostata da X · su Shopify
      resta Y»): è l'unico modo perché qualcuno vada a sistemarla alla fonte.
    - 🔴 **MANCA la nota su Shopify** (chiesta dall'utente): da qui non si
      scrive su Shopify — il client è stato tolto di proposito, e le credenziali
      dei tre negozi coniano un token ma **non dichiarano `write_orders`**
      (provato il 19/08: `access_scopes` torna vuoto).
      ✅✅ **CORREZIONE del 19/08: `write_orders` C'È GIÀ.** Interrogata
      l'installazione (`currentAppInstallation { accessScopes }`) su tutti e tre i
      negozi: **read_all_orders, read_audit_events, read_channels, read_customers,
      read_orders, write_channels, write_customers, write_orders**. La nota su
      Shopify si può scrivere **subito**, senza toccare niente.
      ⚠️ Da dove nasceva l'errore: `/admin/oauth/access_scopes.json` torna VUOTO
      con i token client-credentials — non vuol dire «nessun permesso». Il modo
      giusto di chiederlo è la query GraphQL `currentAppInstallation`. Appena fatto: qui si aggiunge la scrittura della nota
      sull'ordine («Consegna spostata al … da …») usando le credenziali già in
      `NegozioShopify` (client credentials grant, `src/lib/negozi.ts`), e si
      valuta di aggiornare la data **alla fonte** così la divergenza non nasce.
      ⚠️ Prima di scrivere: ricontrollare `access_scopes`, perché oggi torna
      vuoto anche col token valido.
  - 🐛🐛 **GLI ORDINI APPENA FATTI ARRIVAVANO SEMPRE UN GIRO DOPO** (19/08,
    segnalato dall'utente: «ne ho ricevuti ora alcuni su Flowers che non
    vedo»). Non era un guasto: era una **gara persa in partenza**. Anche il
    registro Orders importa da Shopify ogni 15 minuti (`*/15`), e il nostro
    cron girava sullo stesso `*/15` — cioè leggevamo il registro
    sistematicamente un attimo **prima** che si aggiornasse. Misurato: nostro
    sync **15:30:44**, import di Orders **15:31:11**, e i tre Flowers delle
    15:19/15:20/15:29 rimasti fuori per un giro intero.
    Ora il nostro cron è `5,20,35,50`: si legge **dopo** che il registro ha
    finito, e il ritardo passa da 15-30 minuti a 5-20.
    ⚠️ **Regola generale**: due cron con lo stesso passo non sono
    «contemporanei», sono uno prima e uno dopo — e quale dei due sia lo decide
    il caso. Chi legge deve girare **sfasato** rispetto a chi scrive.
    ⚠️ Il ritardo residuo è quello del registro: un ordine può comparire in
    bacheca fino a ~20 minuti dopo che il cliente l'ha fatto. Per averlo subito
    c'è «Aggiorna da Ordini».
  - 🐛 **IL PASSO IN CORSO ERA UNA PILLOLA VUOTA** (19/08, «il vuoto cosa
    sarebbe?»): `.bottone.mini` forzava lo sfondo chiaro su **tutti** i mini,
    ma il testo dei primari è bianco — bianco su bianco. Lo sfondo serviva solo
    ai mini *secondari* (per renderli opachi sopra le righe) e ora sta lì.
    Stesso difetto, mai notato, sul bottone «Nuovo messaggio» dell'inbox.
  - **I PASSI DELLA LAVORAZIONE, SOPRA I BOTTONI** (19/08/2026, LIVE):
    **Da iniziare · Ricerca fornitore · In pagamento · Attesa consegna**, il
    passo in corso pieno e gli altri no. Stanno prima dei bottoni perché
    rispondono a un'altra domanda: i bottoni dicono *cosa posso fare*, la fila
    dice *dove siamo* — e un ordine fermo sul fornitore chiede una cosa diversa
    da uno che aspetta solo la consegna, mentre finora erano tutti «Da gestire».
    ⚠️ La chiave resta `da_gestire` anche se ora si legge «Da iniziare»: è
    scritta su 1.274 ordini e nei filtri, e rinominarla per un'etichetta
    vorrebbe dire migrare i dati per una parola. ⚠️ `comunicazione` resta nel
    vocabolario pur non essendo un passo: **lo scrive l'app da sé** quando
    scrivi al cliente, e toglierlo lascerebbe uno stato senza nome sugli ordini
    che ce l'hanno.
  - **FILTRO «SOLO NUOVI»** (19/08/2026, LIVE): un interruttore in alto per
    vedere i soli ordini col bollino NUOVO (ultime 12 ore, la finestra di
    `ORE_APPENA_ARRIVATO`).
    ⚠️ Filtra il **server**: la lista è tagliata a 200 e ordinata per urgenza,
    quindi a valle si vedrebbero i soli nuovi fra i 200 già scelti. Misurato
    alla nascita: 7 col bollino, 4 ancora da gestire.
  - **IL RIQUADRO FORNITORI DIVENTA UNA FASCIA SUA, COL MESTIERE A SCELTA**
    (19/08/2026, LIVE). Stava in fondo alla prima colonna: una lista di nomi con
    tre bottoni ciascuno, in una striscia stretta, è un elenco che non si
    guarda. Ora è largo quanto la finestra, con le tessere affiancate. E il
    mestiere si sceglie — pasticcerie / fiorai / quello del negozio — perché
    sugli ordini **Deluxy** il negozio non dice niente e su una torta uscivano
    anche i fiorai. ⚠️ Non si indovina dal nome del prodotto: «Numbers»,
    «Millefoglie», «Bouquet» sono nomi di listino.
  - **LA FOTO DEL PRODOTTO PARTE ALLEGATA** nella mail al fornitore (spunta per
    toglierla, con anteprima). ⚠️ Si scarica **lato server con la stessa lista
    bianca di `/api/immagine`** (`src/lib/immagine-prodotto.ts`, solo
    `cdn.shopify.com`): una funzione che prende un URL da chi la chiama e va a
    scaricarlo è un proxy verso la rete interna. ⚠️ Se non si riesce, la mail
    parte lo stesso **e lo dice**.
  - **L'ORDINE RIMBORSATO SI CHIUDE DA SOLO** (richiesta dell'utente). ⚠️⚠️ Si
    reagisce al **passaggio** REFUNDED, non allo stato: chiudendo a ogni giro,
    un ordine riaperto apposta verrebbe richiuso all'infinito — **chi riapre
    lascia il proprio id e da lì comanda lui**. Vale anche per i rimborsati
    «mai toccati da nessuno», che altrimenti nessun passaggio avrebbe più
    ripescato: erano **9**, chiusi; 3 di quelli erano fuori dalla finestra dei
    60 giorni e sono stati chiusi a mano con lo stesso filtro. Solo REFUNDED
    pieno: un rimborso parziale lascia una consegna da fare.
  - **ORARIO DI ARRIVO DELL'ORDINE** nel dettaglio: su una consegna per oggi
    dice se è entrato stamattina o cinque minuti fa, cioè quanto tempo resta.
  - 🐛 **«ASSEGNA A…»: SEMBRAVA NON FARE NIENTE** (segnalato dall'utente).
    Faceva il suo lavoro, ma il menu tornava sempre in bianco e assegnare a sé
    un ordine già proprio non muove niente a schermo — il bollino «Mio» è in
    cima alla scheda, lontano. Ora il menu **mostra chi ce l'ha** e l'esito si
    scrive in una riga. ⚠️ Un comando che non lascia traccia dove viene premuto
    è indistinguibile da un comando rotto.
  - 🐛 **«NESSUN FORNITORE» CON IL FORNITORE IN TABELLA** (segnalato
    dall'utente: «nell'app search ne ho uno possibile»). Due difetti sovrapposti
    sullo stesso riquadro appena fatto: (1) si leggeva **una pagina da 200
    righe su 1.040** — la pasticceria di Arona stava a pagina 3; (2) si
    chiedevano **solo i partner attivi**, mentre chi cerca qualcuno da chiamare
    per domani vuole anche i **prospect** già censiti (è quello che mostra da
    sempre Ricerca fornitori). Ora si leggono tutte le pagine (le successive
    insieme, memoria di 5 minuti nel processo) e entrano tutti gli stati tranne
    `non_interessato` e `dismesso`; a schermo si legge Partner o Prospect.
    ⚠️ È lo stesso difetto delle province scritte in due modi: **una lista
    tagliata non sembra sbagliata, sembra corta**. Misurato dopo: Novara 0 → 1,
    Firenze 0 → 5, Milano 5 → 21.
  - **«Spam» anche dalla conversazione aperta** (inbox), non solo dall'icona
    nella riga: la spazzatura la si riconosce leggendola. Solo sulla posta e non
    nel cestino.
  - 🐛 **«Fornitore» apriva una scheda vuota (about:blank)**, segnalato
    dall'utente: la scheda si apre prima della chiamata (deve nascere dentro il
    clic) ma era aperta con `noopener`, e **con `noopener` il browser
    restituisce null** invece della scheda — l'indirizzo non si poteva più
    scrivere dentro. Ora si apre senza `noopener` e il legame si toglie a mano
    con `opener = null`.
  - ⚠️ Resa a schermo **non verificata** (login): verificati `tsc`, `build`, i
    dati veri dal registro e da Orders, e il deploy promosso.

- **GLI AVVISI SUONANO PER LE CONVERSAZIONI TUE O LIBERE, NON PER QUELLE DI UN
  COLLEGA** (19/08/2026, LIVE). Era l'ultimo pezzo che mancava alla presa in
  carico del 17/08: la funzione esisteva, ma l'avviso continuava a suonare
  **tutto a tutti**. Un avviso che nove volte su dieci riguarda il lavoro di
  qualcun altro si impara a ignorare — e a quel punto è inutile anche quando
  conta.
  - **mia** → suona; **libera** → suona (è il caso in cui rischia di non
    rispondere **nessuno**, per questo «Libere» pesa più di «Mie»); **di un
    collega** → silenzio. Il testo dell'avviso dice quale dei due casi è.
  - ⚠️ Si confronta il non letto **conversazione per conversazione**, non la
    somma di prima: con la somma, un collega che *libera* una conversazione con
    tre non letti farebbe salire il totale filtrato e suonerebbe come se fossero
    appena arrivati. **Un cambio di proprietario non è un messaggio nuovo.**
  - ⚠️ Con `ioId` vuoto si avvisa **solo per le libere**: senza sapere chi
    guarda, il ripiego prudente non è «tutto mio».
  - ✅ **Provata con 9 casi, tutti passano** (`npx tsx scripts/prova-avvisi.mts`):
    primo caricamento muto, mia, libera, del collega, conversazione liberata,
    conversazione nuova, mista, apertura che azzera i non letti, `ioId` vuoto.
    La regola è in `src/lib/avvisi.ts` proprio per poterla provare senza
    browser: **un avviso che non suona non lascia traccia da nessuna parte**.
  - ⚠️ Resa a schermo non verificata (login): il suono e l'avviso vanno sentiti
    da un operatore vero.

- **LA RISPOSTA DI PRIMO CONTATTO PARTE DA SOLA** (19/08/2026, LIVE e **accesa
  in produzione**). Chi scrive per la prima volta riceve subito «abbiamo
  ricevuto il tuo messaggio»: fra il messaggio di un cliente e la prima risposta
  di una persona può passare un'ora, e in quell'ora non sa nemmeno se ha scritto
  al posto giusto.
  - `src/lib/primo-contatto.ts`. Parte **solo se in quella conversazione c'è un
    messaggio in tutto** — il controllo che la rende «di PRIMO contatto» e
    insieme la protegge dal doppione, perché la risposta stessa diventa il
    secondo messaggio e al giro dopo il conto non torna più. Nessun flag da
    tenere allineato.
  - ⚠️⚠️ **Nessun nome di operatore**, ed è il punto: `tipo: 'auto'`,
    `utenteNome` vuoto, e l'inbox scrive «risposta automatica». Firmare
    «Federica» un messaggio che Federica non ha scritto vuol dire che il cliente
    le risponde per nome e che nel thread non si distingue più la persona dal
    sistema.
  - ⚠️ **La conversazione non si tocca**: `ultimoTesto` resta la frase del
    cliente (altrimenti l'inbox mostrerebbe la stessa riga identica su ogni
    conversazione nuova e la domanda vera sparirebbe), `ultimoMessaggioIl` resta
    la sua ora (così «da quanto aspetta» misura la sua attesa), `nonLetti` non
    si azzera e **nessuno risulta averla presa in carico**: un robot non ha
    letto niente.
  - ⚠️ **La posta è esclusa di proposito**: lì arrivano newsletter, notifiche e
    spam, e rispondere da soli vuol dire scrivere agli spammer o aprire un
    ping-pong fra due risponditori automatici.
  - ⚠️ Il saluto parte **in italiano per tutti**: la lingua si riconosce solo
    dopo aver letto il messaggio e su una frase sola sbaglia spesso. È un limite
    dichiarato, non una svista.
  - `src/lib/invio.ts` (nuovo): le regole di «da quale nostro numero/pagina esce
    la risposta» stavano dentro la rotta dell'operatore; ora i chiamanti sono
    due e stanno in un posto solo.
  - ✅ **VERIFICATO IN PRODUZIONE, non solo compilato**: aperta una sessione
    widget su `sito=cake`, mandato un messaggio → il saluto è tornato nella chat
    del visitatore; mandato un **secondo** messaggio → **non** si è ripetuto; in
    tabella il messaggio ha `tipo=auto`, `utenteNome` vuoto, la conversazione ha
    `nonLetti=2`, `presaDaId` vuoto e `ultimoTesto` = la frase del cliente. La
    conversazione di prova è stata cancellata per id.
  - ⚠️ **Su WhatsApp/Instagram/Messenger non è ancora successo con un cliente
    vero** (`tipo='auto'` a 0 in tabella al momento del deploy): il primo caso
    reale va guardato in inbox.

- **IL BOTTONE «SHOPIFY ↗» ANCHE FRA LE AZIONI RAPIDE** (17/08/2026, LIVE).
  Stava solo dentro il pannello del dettaglio: rimborsare davvero, cambiare le
  righe o guardare un pagamento però si decide **scorrendo l'elenco**, e aprire
  il pannello per prendere un link era un clic in più su ogni ordine. Ora il
  bottone sta accanto agli altri nei **tre** posti dove si lavora: schede a
  colonne, righe della tabella, **archivio storico**.
  - ⚠️ Nell'**archivio** serve più che altrove: di quegli ordini non abbiamo la
    copia in casa, quindi le azioni che scrivono non ci sono e l'unica cosa da
    fare sul serio si fa là. Lì il negozio si trova **per brand** (le righe
    dell'archivio non portano il `negozioId`); la colonna «Fornitore» è
    diventata «Azioni», perché ora ne contiene due.
  - ⚠️ Il link nasce sempre da **gid + dominio del negozio di quell'ordine**,
    mai dal numero, e se non si può costruire **il bottone non c'è**. Contato
    sul database: **0 ordini su 1.245 senza gid**, quindi in pratica compare
    sempre; verificato anche che le tre maniglie sono quelle vere
    (`deluxygifts`, `cakedesign-5921`, `fb72b1-2`).
  - ⚠️ Resa a schermo **non verificata**: la bacheca sta dietro il login.
    Verificati `tsc`, `build` e il deploy promosso all'alias di produzione.

- **«COLLEGATO» A GOOGLE LO DICE GOOGLE, NON LA CHIAVE SALVATA** (17/08/2026,
  LIVE — commit `17bab22a`).
  - **Due schermate, due risposte opposte, entrambe convinte.** In
    *Impostazioni* il bollino verde «collegato» nasceva da
    `!!config.googleRefreshToken`, cioè dalla sola **presenza** della chiave in
    tabella; nella **bacheca degli ordini** l'avviso rosso «Google Contacts non
    è collegato» nasceva dal **provare a usarla**. La ragione era della bacheca:
    misurato oggi, Google risponde **`invalid_grant`** a quel token.
  - `statoGoogle()` in `src/lib/contatti.ts` distingue le due cose che prima
    erano una sola: **`configurato`** (la chiave c'è) e **`collegato`** (Google
    la accetta *adesso*), più l'`errore` con le parole di Google. Impostazioni
    mostra il terzo caso che prima non esisteva — badge **«chiave rifiutata da
    Google»** — e sotto il motivo, il pulsante *Ricollega Google* e la causa più
    probabile (consenso in «Testing» = refresh token che scadono dopo 7 giorni).
  - `/api/ordini` non butta più via il motivo: `googleAccessToken().catch(() =>
    null)` trasformava «Google ha revocato l'accesso» in un muto «non
    collegato». Ora la rotta torna anche `googleErrore` e `OrdiniLista` lo
    mostra: *«Google Contacts non risponde più: <parole di Google>. La chiave è
    salvata ma Google la rifiuta»*.
  - ⚠️ **Regola generale**: uno stato di collegamento va **misurato**, non
    dedotto dalla presenza di una credenziale. Un sì/no dedotto manda a cercare
    un interruttore che non c'è; il messaggio d'errore di chi rifiuta dice cosa
    fare.
  - ⚠️ `statoGoogle()` **costa una chiamata a Google**: si usa dove lo stato
    viene *mostrato* (la pagina Impostazioni), mai nei giri di lavoro.
  - ⚠️ Resa a schermo **non verificata** (login). Verificati `tsc`, `build`, il
    deploy promosso all'alias di produzione, e — sul database — che la chiave
    salvata sia davvero rifiutata, che è il caso che il nuovo badge racconta.

- **«APRI IN SHOPIFY» SUL DETTAGLIO ORDINE, ED «ETICHETTA NUOVO» CHE SI VEDE**
  (17/08/2026, LIVE).
  - **Link a Shopify.** Una parte del lavoro non si fa da qui e non deve farsi
    da qui: rimborsi veri, modifica delle righe, rispedizione della conferma,
    pagamenti. Prima si apriva Shopify a mano, si sceglieva il negozio giusto
    fra tre e si cercava il numero — e **`#1733` esiste su più negozi**, quindi
    ogni tanto si finiva sull'ordine di un altro marchio. Il link nasce dal
    **gid**, che quell'ambiguità non ce l'ha, più il dominio del negozio *di
    quell'ordine* (campo `dominio` aggiunto alla risposta di `/api/ordini`).
  - `src/lib/link-shopify.ts`: da `xxx.myshopify.com` si ricava la maniglia per
    `admin.shopify.com/store/<maniglia>/orders/<id>`; con un dominio pubblico si
    ripiega su `<dominio>/admin/orders/<id>`, che Shopify redirige da sé.
    ⚠️ Se il link non si può costruire **il bottone non c'è**: uno che porta a
    una pagina d'errore è peggio di uno assente.
  - **⚠️⚠️ L'etichetta NUOVO c'era già e non si vedeva MAI.** Confrontava
    `creatoIl` con l'istante in cui avevi **aperto la scheda**: aprendo la
    bacheca la mattina nessun ordine è più recente dell'apertura, quindi zero
    etichette. Ora `appenaArrivato()` marca quelli entrati nelle ultime
    **12 ore** (`ORE_APPENA_ARRIVATO`) — la giornata del servizio clienti, non
    24 ore: un ordine di ieri sera non è una novità per chi si siede stamattina.
    Resta il grado più forte per quelli comparsi *sotto i tuoi occhi*: cambia la
    spiegazione, non il bollino — due bollini per la stessa cosa sarebbero un
    rebus.
  - ⚠️ `adesso` sta in uno **stato riempito in un effetto**, non `Date.now()` nel
    render: server e browser darebbero valori diversi (idratazione). Si aggiorna
    ogni 5 minuti, altrimenti su una scheda lasciata aperta tutto il giorno
    l'etichetta non si spegnerebbe mai. Con `0` non marca niente, che è il
    ripiego giusto prima di sapere che ore sono.
  - ⚠️ **`creatoIl` è quando l'ordine è comparso DA NOI**, non la data
    dell'ordine: al primo scarico di un negozio nuovo entrano insieme due mesi
    di ordini e sono tutti «appena arrivati». È vero, ed è il motivo per cui
    questa etichetta non va usata come «ordine recente».
  - ⚠️ Resa a schermo **non verificata** (login). Verificati `tsc`, `build`, e
    che `/api/ordini` mandi `shopifyId` — nessun `select` che lo tagli fuori.

- **DALLA SCHERMATA «OGGI» SI ARRIVA SULL'ELEMENTO, NON SULL'ELENCO**
  (17/08/2026, LIVE). Due difetti diversi con lo stesso effetto: si clicca e non
  si arriva dove si voleva.
  - **I reclami portavano a `/reclami` e basta.** C'era perfino un commento che
    lo dichiarava («servirebbe un parametro che quella pagina non legge»). Ora la
    pagina lo legge: `/reclami?apri=<id>` **evidenzia la riga** e la porta sotto
    gli occhi. Il parametro si legge lato server e si passa come prop, come già
    fa il `prefill` — niente `useSearchParams`, che vorrebbe un `<Suspense>`
    attorno a tutta la lista.
  - ⚠️ **Se nel frattempo il reclamo è stato chiuso non sparisce**: il filtro di
    partenza è «aperti», e la pagina lo allarga a «tutti». Un link che porta a un
    elenco dove la cosa promessa non c'è è peggio di nessun link. ⚠️
    L'allargamento scatta **una volta sola** (`allargato`): senza la guardia, un
    id che non esiste più farebbe rimbalzare i filtri all'infinito, perché
    `carica()` rigira a ogni cambio di filtro.
  - **Il bersaglio cliccabile era il solo nome.** Su righe che si leggono per
    intero — nome, canale, testo, da quanto aspetta — il collegamento erano poche
    decine di pixel: si mirava al testo del messaggio e **non succedeva niente**,
    da telefono peggio ancora. Ora **l'intera riga è il collegamento**, in tutti
    e tre gli elenchi (chi aspetta, ordini, reclami). Dentro quelle righe non ci
    sono altri comandi, quindi un link che avvolge tutto non annida niente di
    interattivo, e `.riga-collegamento` eredita il `flex` della riga: l'aspetto
    non cambia. Stessa lezione dei bersagli da 24px di luglio.
  - ⚠️ **Le tessere dei numeri in cima restano collegamenti all'elenco** (consegne
    di oggi, reclami aperti, rimborsi da decidere): lì l'«elemento» è un conteggio,
    non una riga. Per farle atterrare su un elenco già filtrato servirebbero
    filtri via URL che quelle pagine oggi non leggono.
  - ⚠️ **Resa a schermo NON verificata**: la dashboard sta dietro il login e in
    questa sessione non c'è un account. Verificati `tsc`, `build` e che le rotte
    col parametro rispondano in produzione (307 al login, come tutte).

- **IL LINK DELLA CHAT PORTA SUL SITO, E LA × LA NASCONDE** (17/08/2026, LIVE).
  `/chat/<codice>` era una chat a pagina intera su sfondo vuoto: chi arriva
  dalla bio di Instagram o da un QR non vedeva il negozio, e premendo la ×
  veniva portato via da una pagina che non aveva nient'altro. Ora, se il sito ha
  il widget, il link rimanda a `https://<dominio>/#chat` e `widget.js` si apre
  da solo: la × torna a fare quello che fa ovunque — **nasconde** la chat e
  lascia il bottone per riaprirla, col negozio sotto.
  - ⚠️ Si usa il **frammento**, non un parametro di query: non arriva al server,
    non finisce nei log né nelle statistiche del sito, e non sporca gli `utm` da
    cui l'inbox ricava la provenienza del visitatore. Dopo l'apertura si toglie
    dall'indirizzo con `replaceState` — senza, un aggiornamento della pagina o il
    tasto indietro riaprirebbero la chat addosso a chi l'aveva appena chiusa.
  - ⚠️⚠️ **Nuova spunta `WidgetSito.apreSulSito`, DI PARTENZA SPENTA, e non
    basta che il dominio sia compilato.** Se su quel sito `widget.js` non c'è, il
    cliente atterra su una vetrina senza nessuna chat e il link diventa un
    **vicolo cieco** — peggio di prima. Controllato il 17/08/2026 scaricando le
    home: **deluxyflowers.com sì, cakedesign.me sì, deluxy.it NO.** Per questo la
    decisione sta in una spunta che accende una persona (pagina «Widget dei
    siti»), non in una deduzione del codice.
  - **VERIFICATO END-TO-END sul `widget.js` pubblicato**, da una pagina di prova
    che lo carica come farebbe un sito vero: con `#chat` la chat si apre da sola
    (`eAperta() === true`), il frammento sparisce dall'indirizzo mentre la query
    resta, la × la chiude **senza cambiare pagina**, il bottone flottante resta e
    la chat si riapre. File di prova rimosso.

- **LE CONVERSAZIONI SI PRENDONO IN CARICO** (17/08/2026, LIVE). Gli operatori
  sono tre e l'inbox è una sola: *chi aveva fatto cosa* restava scritto
  (`Messaggio.utenteNome`), ma nessuno *prendeva in carico*. Due persone
  potevano rispondere allo stesso cliente nello stesso momento, e il cliente
  riceveva **due risposte diverse dalla stessa azienda**.
  - Campi `Conversazione.presaDaId` / `presaDaNome` / `presaIl`. Nel client:
    bollino sulla riga (**oro** se è di un collega, **grigio** se è mia),
    bottone «Me ne occupo io» nella testata del thread, linguette
    **Tutte / Mie / Libere** coi conteggi.
  - ⚠️⚠️ **NON È UN LUCCHETTO, ed è una scelta.** Prendere in carico **segnala,
    non blocca**: in un servizio clienti un blocco vero si ritorce sul cliente
    — chi ha preso la conversazione va a pranzo, il cliente aspetta, e chi
    potrebbe rispondere trova la porta chiusa. **Il pezzo che serve davvero non
    è il badge: è l'avviso fra chi scrive e il campo di risposta** («Se ne sta
    occupando Federica — controlla prima che non l'abbia già fatto»). Il badge
    nell'elenco lo leggi solo se lo guardi; l'avviso sta nell'unico punto in cui
    è impossibile non vederlo.
  - ⚠️⚠️ **L'aggiornamento è CONDIZIONATO** (`updateMany` con
    `presaDaId: { in: ['', io] }`). Con un `update` secco due operatori che
    premono nello stesso secondo leggerebbero **entrambi il proprio nome** e
    risponderebbero insieme: esattamente il guaio che la funzione esiste per
    evitare. Il secondo riceve **409** e la conferma «se ne sta già occupando
    X, vuoi prenderla comunque tu?».
  - ⚠️ **Rispondere prende in carico da solo, ma solo se è libera.** Chiedere un
    secondo clic vuol dire che nove volte su dieci non lo si fa. Ma se ce l'ha
    già un altro **non gliela si porta via di soppiatto**: sparirebbe dal suo
    elenco «Mie» un cliente che pensa di seguire.
  - ⚠️ **Si libera solo la propria**: liberare quella di un collega con un clic
    è togliergli il cliente da sotto le mani senza che se ne accorga. Per
    prenderla davvero c'è la conferma, che almeno è un gesto dichiarato.
  - ⚠️ Il **ritorno indietro** dell'aggiornamento ottimistico è obbligatorio,
    per la regola imparata poche ore prima col widget (qui sotto): un'interfaccia
    che non sa disfare mostrerebbe il proprio nome su una conversazione che il
    server ha assegnato a un altro.
  - ⚠️ **RESA A SCHERMO NON VERIFICATA da chi ha scritto il codice**: servono le
    credenziali di un account, e su questo database **condiviso** non se ne
    creano di prova (la regola vale ancora, vedi in fondo). Verificati
    `npx tsc --noEmit`, `npm run build` e che `prisma db push` sia **additivo**
    (nessun `--accept-data-loss`). Chi riprende: la prima cosa da guardare è
    l'inbox con due account diversi aperti insieme.

- **⚠️⚠️ LA CHAT DEI SITI BUTTAVA VIA OGNI MESSAGGIO DEI VISITATORI** (17/08/2026,
  LIVE). Dal **30/07 al 17/08** chi scriveva dal widget di un sito non è mai
  stato letto da nessuno: **18 conversazioni, tutte con zero messaggi**.
  - **Perché.** Da quando i siti passano `data-sito`, `/api/widget/sessione`
    scrive lo **slug del sito** (`cake`, `flowers`, `deluxy`) in
    `Conversazione.numeroId`; ma `/api/widget/messaggi` cercava la riga con la
    chiave unica a tre campi e `numeroId: ''`. Con lo slug valorizzato la
    `findUnique` non trovava **mai** la conversazione: GET e POST rispondevano
    404. Ora si cerca per **canale + token** con `findFirst` — il token è 24 byte
    casuali, identifica da solo.
  - ⚠️ **Il difetto non si vedeva perché il widget FINGEVA**: la bolla del
    messaggio compariva a schermo (eco locale) anche quando il server aveva
    rifiutato, e il visitatore restava ad aspettare una risposta che non poteva
    arrivare. Ora se il server rifiuta **la bolla sparisce**, il testo torna nel
    campo e compare «Messaggio non inviato»; su 404 si dimentica il token, così
    l'invio successivo riapre la sessione.
    **REGOLA: un'interfaccia ottimistica deve saper tornare indietro.** Una che
    mostra sempre «inviato» non è ottimista, è muta — e nasconde il guasto
    proprio a chi lo sta subendo.
  - Trovato da una revisione multi-agente e **confermato contando in tabella**,
    non dedotto dal codice.

- **IL TITOLO DEL WIDGET NON TORNA PIÙ «DELUXY» SOTTO GLI OCCHI DI CHI SCRIVE**
  (17/08/2026, LIVE). Coda del punto sopra: il **polling** di
  `/api/widget/messaggi` non passava `sito`, e il server senza quel parametro
  risponde con titolo e saluto **generali**. Effetto: chi apriva la chat su
  cakedesign.me leggeva «CakedesignMe», poi al primo giro dopo l'invio
  l'intestazione diventava **«Deluxy»**, cioè il nome di un altro marchio.
  - **Misurato in produzione, non supposto**:
    `/api/widget/messaggi?sito=cake` → «CakedesignMe», senza parametro →
    «Deluxy». Ora `sito` viaggia in **tutte e tre** le chiamate (ripresa con
    token, ripresa senza token, polling) ed è fra le dipendenze di `aggiorna`.
  - **Verificato sul bundle pubblicato**, non solo sul deploy riuscito: nel
    chunk live di `/widget` compaiono tutte e tre le concatenazioni
    (`?sito=` una volta, `&sito=` due).
  - Nella stessa passata: l'hover/attivo delle intestazioni ordinabili usava
    `var(--text-primary)`, **token che non esiste** (in `tokens.css` è `--text`)
    e che non compare più da nessuna parte nel repo — era una regola morta, il
    colore non cambiava mai.

- **LA × DELLA CHAT PUBBLICA RIPORTA IL CLIENTE DA DOVE ERA VENUTO** (15/08/2026,
  LIVE). Su `/chat/<codice>` la × dentro l'iframe mandava `deluxy-widget:chiudi`
  alla pagina ospite, come sui siti — ma qui la pagina ospite siamo noi e non la
  ascoltava nessuno: il cliente premeva e non succedeva niente.
  `src/components/RitornoChatPubblica.tsx` (montato dalla pagina) ascolta il
  messaggio (solo dalla nostra origine) e torna: **indietro nella storia** se
  c'è una pagina prima; **sul sito del marchio** (`WidgetSito.dominio`) se la
  scheda è nuova; altrimenti prova `window.close()`.
  - ⚠️ «Scheda nuova» = una voce di storia, **oppure due senza referrer**:
    about:blank + la chat, come quando la apre uno script o un lettore di QR.
    Trovato provando: con `history.length` 2 l'indietro portava su una pagina
    bianca.
  - ⚠️ `history.back()` non promette di navigare: dopo averlo chiesto si aspetta
    500 ms e, se non è arrivato `pagehide`, si va sul sito. Non si guarda
    `document.hidden`: una scheda in secondo piano è ancora questa pagina.
  - Verificato in produzione: da una scheda che veniva da `/login` la × torna
    su `/login`; da una scheda nuova va su `deluxy.it`.

- **L'ORDINE DELL'ARCHIVIO SI APRE, E LA TABELLA SI ORDINA** (15/08/2026, LIVE).
  In «Ordini globali» le righe dell'**Archivio storico** — gli ordini più vecchi
  dei 60 giorni che teniamo in casa — non facevano niente al clic: si cercava un
  ordine vecchio e la ricerca finiva lì.
  - Ora aprono lo **stesso pannello** degli altri, costruito in una sola chiamata
    a Orders: prodotti con le foto, biglietto, destinatario, recapiti, lingua del
    cliente. Rotta `GET /api/ordini/archivio/dettaglio?numero=&orderId=`,
    costruzione in **`src/lib/dettaglio-ordine.ts`** (che ora serve anche la
    rotta locale: era la stessa forma scritta due volte).
  - ⚠️ **Se quell'ordine è ANCHE in casa, si apre la versione locale.** La
    ricerca dell'archivio pesca pure i recenti: senza questo controllo (per gid
    Shopify) lo stesso ordine avrebbe mostrato metà azioni a seconda della
    tabella da cui lo si apriva.
  - ⚠️ **Le azioni che scrivono non si offrono** su un ordine che non abbiamo
    (Gestito, messaggi del cliente): un bottone che fallisce dopo il clic è
    peggio di un bottone assente. Il pannello dice **perché**: «archivio storico
    (sola lettura)». Reclamo e rimborso invece restano — `Reclamo.ordineId` e
    `Rimborso.ordineId` nascono già col vuoto ammesso proprio per questo caso.
  - ⚠️ Il gid Shopify non è un vezzo: **`#1894` esiste su due negozi**, e nella
    verifica i candidati col numero erano due. Si sceglie per gid.
  - **Verificato sui dati veri** (ordine #1894 del 31/12/2025, fuori dalla copia
    locale): tornano cliente, telefono, tipo, fascia di consegna `12-16`, stato
    «Nuovo», **destinatario diverso dal mittente** (Almarri → Alfarraj), 1
    prodotto **con foto** e 93 caratteri di biglietto.
  - **Le intestazioni della tabella ORDINANO** (negozio, data, consegna, cliente,
    tipo, telefono, totale, lavorazione): primo clic il verso utile, secondo lo
    rovescia, terzo si torna all'ordine per **urgenza** — che non è «nessun
    ordinamento», è quello di lavoro, e senza una via di ritorno servirebbe
    ricaricare la pagina.
  - ⚠️ **Ordina il SERVER** (`ordiniOrdinati` in `/api/ordini`), per la stessa
    ragione dell'urgenza: la lista è tagliata a **200 su 1.216**, e ordinare nel
    browser avrebbe riordinato i 200 che il server aveva già scelto — «il totale
    più alto» sarebbe stato il più alto *fra quelli mostrati*.
  - ⚠️ **Il vuoto va in fondo in tutt'e due i versi**: 40 ordini senza nome e 160
    senza telefono aprivano l'elenco crescente con righe bianche. Le date di
    consegna mancanti con `nulls: 'last'`, i campi di testo con due query (i
    pieni, poi i vuoti) — verificato: 0 righe vuote fra le prime 200 di
    «Cliente ↑».
  - ⚠️ **Il numero d'ordine NON è ordinabile**, e l'intestazione lo spiega: è
    testo e i tre negozi numerano con lunghezze diverse, quindi «#12121»
    finirebbe prima di «#1623». Un ordinamento che sembra giusto ed è sbagliato
    è peggio di uno che non c'è; per il cronologico c'è *Data*.
  - Corretta anche la riga «mostrati i N **più recenti**», che era falsa: sono i
    primi N *dell'ordine in corso*.

- **SI LEGGE IN ITALIANO E SI RISPONDE NELLA LINGUA DEL CLIENTE** (31/07/2026).
  Come su AI Mail, ma qui vale su tutti i canali (WhatsApp, Messenger,
  Instagram, widget, email).
  - **La lingua si riconosce in CODICE, gratis**: si contano le parole più
    comuni (`src/lib/lingua-testo.ts`, stesso impianto di
    `deluxy-mail/src/lib/rilevaLingua.ts`). ⚠️ Nel webhook non entra nessuna
    chiamata a OpenAI: una chiamata lenta lì manda Meta in timeout, cioè fa
    **perdere messaggi**. La lingua si scrive su `Messaggio.lingua` appena il
    messaggio arriva; la traduzione si compra dopo.
  - **Si traduce solo quello che non leggiamo**, e solo **all'apertura** della
    conversazione (`POST /api/conversazioni/[id]/traduci`). Le lingue lette e
    l'interruttore «traduci da solo» stanno in Impostazioni → *Lingue e
    traduzione* (`lingueLette`, `traduzioneAuto`). La traduzione si salva:
    riaprire non la ricompra.
  - Nella bolla si parte **dalla traduzione**, con «Originale (inglese)» a un
    clic: chi apre una conversazione in olandese deve capirla subito, ma su una
    data o un indirizzo si controlla l'originale.
  - **La risposta AI esce nella lingua del cliente** anche con la traduzione
    spenta. ⚠️ L'istruzione sta in fondo al prompt e in maiuscolo: gli script
    sono in italiano e occupano dieci volte lo spazio, quindi trascinano il
    modello: senza dirglielo esplicitamente rispondeva in italiano a chi aveva
    scritto in inglese.
  - **Quello che scrivi tu non parte mai tradotto da solo**: «Traduci in
    inglese» mette la traduzione nel riquadro e la mandi tu. Una frase che un
    cliente legge e in azienda non ha letto nessuno non esiste.
  - ⚠️ **Il rumore decide la lingua, se non lo togli.** Misurato sugli ultimi
    384 messaggi veri: contando le parole *senza* togliere URL ed entità HTML,
    **12 newsletter italiane e inglesi risultavano portoghesi** — in una mail
    dove il testo vero sono tre righe, un indirizzo lungo e una riga di
    `&#8203;` sono la maggioranza. Togliendoli: da 12 falsi a **2** (due
    «Respuesta automática» spagnole lette come portoghese, che comunque
    finiscono tradotte in italiano lo stesso). Serve anche un **margine di 2
    punti** sul secondo classificato: vincere per un punto è rumore.
  - Esito della misura: 180 inglese, 113 italiano, 89 non deciso (troppo corti:
    «ciao»), 2 portoghese. Con «leggo italiano e inglese» si traducono **2
    messaggi su 384** — la traduzione non è un costo di massa.

- **LA CHAT COME LINK: `/chat/<codice>`** (31/07/2026). La stessa chat del
  widget, ma senza un sito attorno: si manda per link. Bio di Instagram, firma
  delle mail, QR sul biglietto che va col mazzo, «scrivici qui» su WhatsApp. Le
  conversazioni arrivano in Inbox nella colonna del marchio giusto, perché sotto
  è sempre `/widget?sito=<slug>`.
  - ⚠️ **Il pezzo finale è un codice casuale, non lo slug.** Lo slug è pubblico
    per costruzione (sta nello snippet di ogni sito, lo legge chiunque guardi il
    sorgente): con `/chat/cake` bastava provare `/chat/deluxy` per aprire
    conversazioni a nome di un altro marchio. Il codice sta in
    `WidgetSito.codice`, 32 caratteri da `crypto.getRandomValues` — non
    `Math.random()`, perché due siti creati nello stesso istante possono uscire
    uguali e un codice uguale vuol dire scrivere al marchio sbagliato. **Non
    cambia mai**: cambiarlo romperebbe i QR già stampati.
  - ⚠️ **Va escluso dal middleware** (`chat` nel matcher), o il link mandato ai
    clienti finisce al login: cioè non funziona per nessuno tranne noi.
  - ⚠️ **I link rapidi sono relativi** («/collections/oggi») e qui non c'è un
    sito ospite a cui appoggiarli: `postMessage` non lo ascolta nessuno e il
    ripiego avrebbe aperto `deluxy-messaging.vercel.app/collections/oggi`. Il
    dominio del sito viaggia nell'URL dell'iframe (`&dominio=`) e il widget
    ricostruisce l'indirizzo vero.
  - Il link si copia da **Widget dei siti**, che crea il codice alla prima
    apertura per i soli siti **salvati** (a una proposta non si mandano
    clienti). Verificato in locale: codice valido → la chat di Cakedesign col
    suo saluto e il suo tema; codice inventato → «questa chat non esiste più»;
    **`/chat/cake` non funziona**; e le pagine protette continuano a
    rimandare al login (307).

- **IL NUMERO DI CHI SCRIVE, E UNA TESTATA CHE NON SI TAGLIA** (31/07/2026).
  - Su WhatsApp `idEsterno` **è** il numero del cliente (Meta lo manda senza
    «+»): ora si legge in chiaro accanto ai badge ed è un link `tel:`. Prima
    stava nel testo grigio `.dettaglio`, che è `flex: 1 1 auto` e quindi, appena
    la testata si riempiva, si accorciava fino a sparire: c'era e non si vedeva.
    Su Messenger e Instagram resta piccolo — lì è un id interno che non dice
    niente a nessuno.
  - ⚠️ **La testata ora va a capo sempre, non solo su mobile.** Con quattro
    azioni, tre badge e il numero, in una finestra da 760px la riga non ci stava
    e «Chiudi» finiva tagliato contro il bordo: si perdevano insieme il dato più
    utile e l'unica via d'uscita della finestra.
  - ⚠️ **La larghezza della finestra non era mai stata applicata.**
    `.pannello-thread` e `.pannello` hanno la stessa specificità e `.pannello`
    sta più in basso nel file: vinceva lei, quindi la chat è sempre stata larga
    760px invece degli 880 che c'erano scritti. Ora la regola è
    `.pannello.pannello-thread` (due classi) e la finestra è **1000px**: a
    quella larghezza la testata sta su una riga sola. Verificato a 1480 e a 900
    px sul CSS compilato: niente fuori dal bordo, «Chiudi» dentro, numero
    visibile, nessuno scorrimento orizzontale.

- **LA CONVERSAZIONE SI APRE ANCHE DAL TELEFONO** (31/07/2026). Da mobile la
  finestra della chat si rompeva in tre punti: i bottoni del riquadro di
  scrittura uscivano dal bordo (si leggeva «R…» e «Invia» non c'era), le azioni
  della testata (Riassunto/Archivia/Elimina/Chiudi) finivano fuori schermo
  perché la riga era `nowrap`, e le bolle larghe al massimo il 68% riducevano
  una mail a due parole per riga.
  - ⚠️ **Non si toglie nessuna azione per fare spazio**: i bottoni ci sono
    tutti, si accorcia la cornice (etichette a larghezza naturale, meno
    padding, font 13px) e si va a capo. Un'azione che sparisce su mobile è
    un'azione che non esiste, e chi risponde dal telefono ha più fretta.
  - Misurato a 375×812 sul CSS compilato: nessuno scorrimento orizzontale,
    tutti e quattro i bottoni della testata dentro lo schermo, i tre aiuti del
    composer su una riga sola e «Invia» da solo sulla sua (è l'unica azione
    irreversibile del gruppo). Cornice da 374px a 300px, cioè **399px per i
    messaggi invece di 324**.
  - Media query `max-width: 700px` in fondo a `globals.css`.

- **DUE RIGHE, UNA PERSONA: I CLIENTI SI UNISCONO A MANO** (31/07/2026). In
  `/clienti` la stessa persona compariva due volte con metà storia ciascuna.
  - I clienti non sono una tabella: si ricavano dagli ordini raggruppando per
    telefono (ultime 9 cifre) e, in mancanza, per email. Regge finché la persona
    usa sempre gli stessi recapiti.
  - ⚠️ **Non si può indovinare.** Misurato sui dati veri: «Nicolò Donato» sono
    **due righe** — `+393338052490 / nicolo.donato@deluxy.it` (5 ordini) e
    `+393498853209 / donatod.nicolo@gmail.com` (3 ordini). Nessun dato le
    collega: solo il nome, e il nome non è una chiave — unire due omonimi
    vorrebbe dire mostrare a un cliente gli ordini di un altro. Quindi l'app
    **consiglia** e una persona **decide**.
  - Su 865 righe: **23** hanno la stessa email di un'altra (indizio forte),
    **32** lo stesso nome (indizio debole). Il filtro «Possibili doppioni» le
    mostra ordinate per nome, così i gemelli stanno uno sotto l'altro.
  - Si spuntano le righe e si sceglie **quale resta**: non è estetica, il suo
    telefono e la sua email restano quelli «buoni», ed è a quelli che si scrive.
  - Nuova tabella `ClienteUnito` (`chiave` assorbita → `principale`):
    `src/lib/clienti-uniti.ts`, rotte `POST/DELETE /api/clienti/unisci`.
    **Nessun ordine viene toccato**, per questo «Separa» rimette tutto com'era.
  - ⚠️ **GOOGLE NON HA UN'API PER FONDERE DUE CONTATTI.** La People API sa
    creare, aggiornare e cancellare; «Unisci e correggi» esiste solo dentro
    contacts.google.com. Quindi «Allinea in Google»
    (`POST /api/clienti/google`) fa la metà che si può fare bene: il contatto
    principale prende **tutti** i numeri e **tutte** le email della persona, e i
    doppioni rimasti li elenca per nome. **Non cancella nulla**: un doppione è un
    fastidio, un contatto cancellato per sbaglio è una perdita (e può avere note,
    foto e gruppi che noi non vediamo).
  - Verificato sul database vero, andata e ritorno: 5 + 3 ordini → **8 ordini in
    una riga** col secondo numero mostrato come recapito in più, poi «Separa» e
    di nuovo 5 e 3. Nessuna riga di prova lasciata indietro.
  - **Pulizia fatta il 31/07/2026: da 865 righe a 834** (31 unite). Regola usata:
    resta la riga **con più dati**, e email + telefono insieme valgono più di
    tutto — dopo l'unione **nessuna** riga sopravvissuta è senza telefono o
    senza email. 22 gruppi per *stessa email*, 10 per *stesso nome + stessa
    città*. Lasciato aperto **1** gruppo: «Mustafa Moneir», stesso nome ma
    città diverse — potrebbero essere due persone, e quello lo decide una
    persona.
  - ⚠️ **STESSA EMAIL NON VUOL DIRE SEMPRE STESSA PERSONA**, e questo cambia la
    regola. `dandrea_michele@virgilio.it` stava su due righe con nomi diversi —
    *Danila Cattani* (Paris) e *Michele Dandrea* (Châtillon): una casella di
    posta condivisa in famiglia, non un doppione. Unite dalla pulizia e poi
    **separate a mano su decisione dell'utente**. Quindi «stessa email» resta
    l'indizio più forte che abbiamo, ma quando i **nomi sono diversi** va
    guardato prima di unire — nel dubbio si lascia stare, perché unire due
    persone fa vedere a un cliente gli ordini di un altro.
  - ⚠️ **GLI ANELLI**: unendo gli stessi due clienti prima a mano e poi in
    blocco, nei due versi opposti, si scrivono `A→B` e `B→A`. Le due unioni si
    annullano e le righe restano separate **senza che si capisca perché**
    (`mappaUnioni` interrompe il giro per non bloccare la pagina). Successo
    davvero su Donato. Ora `unisciClienti()` scioglie il vecchio legame quando
    la riga scelta era stata assorbita da una di quelle che si stanno unendo:
    **l'ultima parola è di chi sceglie adesso**.
  - ⚠️ **Le righe selezionate sono NUMERATE, e il bottone dice chi sparisce.**
    Gli omonimi sono il caso per cui questa funzione esiste, quindi i due
    bottoni uscivano identici — «Tieni Adhiraj singh rathore» e «Tieni Adhiraj
    singh rathore» — e sceglierne uno era un sorteggio. Ora ogni riga
    selezionata porta il suo numero e il bottone dice **«Tieni 1 — togli 2»**,
    col dettaglio (telefono, città) nel titolo al passaggio del mouse.
  - ⚠️ **Appena unita, la riga NON è più un doppione**: col filtro «Possibili
    doppioni» attivo spariva subito dopo l'unione, e la pagina diceva «Nessun
    cliente per donato» — sembrava di averla persa. Ora le chiavi unite in
    quella sessione viaggiano nel parametro `tieni` e saltano i filtri, e
    l'avviso lo dice a parole.
  - ⚠️ **«ALLINEA IN GOOGLE NON FA NULLA»**, e non era Google. La rotta
    funzionava (token ottenuto, cliente ricostruito, contatto trovato e nostro):
    a mancare era il **bottone**. In `/api/clienti` i recapiti uniti si
    raccoglievano dentro il ciclo, e se l'ordine più recente del gruppo
    apparteneva alla riga **assorbita**, quella riga apriva il gruppo dal ramo
    «else» e il suo recapito non veniva registrato: niente `uniti`, quindi
    niente badge «unito» e niente bottone — proprio sui clienti appena uniti.
    Ora i recapiti si raccolgono a parte e si assegnano dopo, e il conteggio
    delle righe assorbite (`assorbite`) è un dato suo, non dedotto dai recapiti.
  - ⚠️ Due contorni dello stesso problema: il **telefono non si completava**
    dagli ordini più vecchi (una riga unita mostrava «—» proprio dove il
    cliente un numero ce l'ha), e l'esito dell'operazione compariva **solo in
    cima alla pagina** — con 833 righe si clicca a metà elenco e l'avviso è
    fuori schermo, che si legge come «non fa niente». Ora il bottone dice
    «Allineo…» e l'esito si scrive **sulla riga**.
  - **Dall'elenco si apre la SCHEDA** (31/07/2026): dal nome del cliente si va a
    `/clienti/scheda`, con ordini passati, reclami, rimborsi, conversazioni, a
    chi manda di solito e quando ordina. È un link sul nome e non la riga
    intera: la riga ha già una casella da spuntare e due bottoni, e cliccarla
    per sbaglio sarebbe la norma.
  - ⚠️ **La scheda ora SEGUE le unioni.** Prima interrogava Orders con un solo
    identificativo: su un cliente unito avrebbe mostrato la metà da cui si
    entrava — il problema che l'unione doveva risolvere, spostato dove non si
    vede. Ora raccoglie tutti i recapiti del gruppo, chiede a Orders per
    ognuno (**tetto di 4**: ogni recapito è una chiamata di rete) e fonde le
    risposte per numero d'ordine. Verificato sui dati veri: Michele Capaccioli
    (i due numeri che differiscono di una cifra) apre **6 ordini** da entrambe
    le direzioni, e Rodrigo Taddeo dà la stessa scheda sia dalla riga
    principale sia da quella assorbita.

- **OGNI CANALE RISPONDE DAL SUO INDIRIZZO: INSTAGRAM HA UN GRAPH SUO**
  (30/07/2026). I direct Instagram si **ricevevano** ma non si potevano
  **mandare**: la risposta restava lì con «errore».
  - ⚠️ **Il prodotto «Instagram API con login di Instagram» rilascia token che
    cominciano per `IGAA`, e quei token vivono SOLO su `graph.instagram.com`.**
    Su `graph.facebook.com` non sono nemmeno leggibili: Meta risponde *cannot
    parse access token*, cioè un errore che sembra «token sbagliato» mentre il
    token è giusto ed è l'indirizzo a essere quello di un altro prodotto. Il
    Page Access Token di Facebook (`EAA…`) invece parla col Graph di Facebook,
    ed è quello che serve a Messenger e agli account Instagram collegati a una
    Pagina.
  - Quindi l'indirizzo **non si sceglie una volta per tutte nel codice**: lo
    decide il token di quell'account. `graphPerCanale()` in `src/lib/meta.ts`
    guarda il prefisso; `inviaPagina()` prende il **canale** come parametro e
    lo riceve dalla rotta `/api/conversazioni/[id]/messaggi` (che vale anche
    per le risposte dalla scheda dell'ordine, `MessaggiOrdine.tsx`: è la stessa
    rotta).
  - Se Meta dice che il token non sa nemmeno leggerlo, si riprova **una volta
    sola** sull'altro Graph: copre i casi che il prefisso non prende (un token
    vecchio, un account migrato). Se fallisce anche il secondo si torna
    l'errore del **primo**, che è quello che descrive la strada giusta per come
    è configurato l'account.
  - In `/account-meta` il campo del token ora dice quale dei due si sta
    incollando: chi lo prende dal Business Manager non ha modo di saperlo da sé.
  - ⚠️ **Non verificabile da qui**: serve un direct vero su Instagram e una
    risposta dall'app in produzione. Il permesso richiesto è
    `instagram_business_manage_messages`.

- **I NUMERI SI RICONOSCONO DALLA RUBRICA GOOGLE** (29/07/2026). Su WhatsApp
  arrivava il nome che il cliente si è messo sul profilo — «Nicolo», «Ale», a
  volte niente. In rubrica (`deluxy.delivery@gmail.com`, la stessa che l'app
  riempie dagli ordini) quel numero è già salvato come **«FL Mario Rossi
  #1042»**, che dice chi è e con quale ordine.
  - `src/lib/rubrica.ts`: `riconosciConversazione(id)` per una sola (bottone
    **Rubrica** nella testata del thread, risposta immediata) e
  `riconosciDaRubrica(25)` per il giro automatico — cron **`/api/cron/rubrica`
    al minuto 37**, sfasato da quello dei contatti (minuto 7) perché usano la
    stessa People API e insieme si rubano il tempo.
  - `Conversazione.nomeRubrica` è un campo **a parte** da `nome`: sono due cose
    diverse (il nostro nome e quello del profilo) e nessuna sovrascrive l'altra.
    In elenco vince la rubrica, e il titolino mostra entrambi.
  - `rubricaCercataIl` evita di richiedere ogni ora i numeri che non ci sono: un
    numero che manca oggi manca anche fra un'ora. Se Google non risponde la data
    **non** si scrive, così quella conversazione si riprova.
  - ⚠️ **Non si cerca dentro il webhook.** Una ricerca sono 2-3 chiamate HTTP:
    nel percorso che riceve i messaggi allungano la risposta a Meta e, se Google
    è lento, mandano il webhook in timeout — cioè fanno perdere messaggi.
  - Solo WhatsApp: su Instagram e Messenger l'id non è un numero di telefono e
    in rubrica non c'è niente da cercare.

- **GLI ORDINI MOSTRANO SE IL CLIENTE HA SCRITTO, E SI RISPONDE DA LÌ**
  (30/07/2026). Rispondere a un ordine senza sapere che quel cliente ha già
  scritto vuol dire richiedergli quello che ha già detto — o chiamarlo per una
  cosa che aveva spiegato per iscritto.
  - Sulla scheda dell'ordine compare **«✉ 2»**, in **oro quando ci sono messaggi
    non letti**: quell'ordine ha qualcuno che aspetta.
  - Nella scheda laterale, riquadro **«Messaggi del cliente»**: le conversazioni
    collegate con le ultime sei battute e un riquadro per **rispondere** senza
    uscire — la risposta passa dalla stessa rotta dell'Inbox, quindi esce dal
    canale giusto e dall'account che aveva ricevuto.
  - ⚠️ **Come si collega un ordine a una conversazione**, in ordine di certezza:
    il **numero d'ordine** scritto sulla conversazione (lo mette lo smistamento
    delle mail), l'**email**, il **telefono** (coda di 9 cifre, perché lo stesso
    numero gira come `349…` e come `39349…`). **Mai per nome**: due clienti
    possono chiamarsi uguale, e mostrare la conversazione di un'altra persona
    sotto l'ordine sbagliato è peggio che non mostrare niente. Il riquadro dice
    anche **come** è collegata («cita questo ordine» / «stessa email»).
  - ⚠️ In elenco i collegamenti si calcolano con **due query per tutta la
    pagina**, non una per ordine: con 200 ordini a schermo sarebbero 200 andate
    e ritorni al database a ogni caricamento della bacheca.
  - Misurato il 30/07: 17 conversazioni con un numero d'ordine, 9 mail che
    combaciano con l'email di un ordine, 5 chat WhatsApp da confrontare.

- **LINK RAPIDI NEL WIDGET: «Come ti aiutiamo?» → «Regali per oggi»**
  (30/07/2026). Sotto il saluto compaiono le opzioni, e ognuna porta a una
  pagina del sito: chi apre la chat vuole spesso una cosa che il sito ha già, e
  mandarcelo subito vale più di una risposta scritta bene dieci minuti dopo.
  Si configurano per sito in «Widget dei siti» (testo + indirizzo, massimo sei,
  `WidgetSito.linkRapidi` in JSON).
  - ⚠️ **Come funziona la navigazione, e perché non è banale**: i bottoni vivono
    dentro l'iframe, su un altro dominio, e da lì il browser **non lascia
    cambiare l'indirizzo della pagina ospite**. Quindi la chat *chiede* con
    `postMessage` e **decide `widget.js`**: accetta solo i messaggi che vengono
    dal nostro iframe e dalla nostra origine, apre i link **di quel sito** al
    posto della pagina e quelli esterni in una scheda nuova. Il controllo sta
    fuori perché un messaggio può arrivare da qualunque iframe della pagina.
  - Se sul sito c'è uno snippet vecchio che non ascolta i messaggi, dopo mezzo
    secondo il link si apre comunque in una scheda nuova: meglio una scheda in
    più che un bottone che non fa niente.
  - I bottoni **spariscono appena la conversazione comincia**: sopra la risposta
    di una persona sarebbero un invito ad andarsene.

- **DA DOVE ARRIVA CHI SCRIVE, E IL RIASSUNTO DELLA CHAT** (30/07/2026).
  - **PROVENIENZA** (`Conversazione.origine`, `origineDettaglio`,
    `paginaIngresso`): chi apre la chat dopo un annuncio non è chi arriva dal
    passaparola — cambia urgenza, tono e cosa vale la pena proporgli, e in Inbox
    erano tutti «Visitatore sito». `widget.js` legge sulla **pagina ospite**
    `utm_*`, la presenza di `gclid`/`fbclid`, il sito che ha mandato e il
    percorso della pagina; `src/lib/provenienza.ts` classifica in google-ads ·
    google · meta-ads · social · referral · **diretto**.
    - ⚠️ Dentro l'iframe non si potrebbe sapere: là `document.referrer` è il sito
      che ci ospita, non Google. Per questo lo raccoglie lo script di fuori.
    - ⚠️ **Niente cookie e niente storia salvata sul sito ospite**: si legge solo
      quello che c'è quando la chat si apre. Chi clicca l'annuncio oggi e scrive
      fra due giorni risulta «diretto» — che vuol dire «non lo sappiamo», e va
      detto così invece di costruirci sopra un tracciamento.
    - Del `gclid` si tiene **il fatto che c'è, non il valore** (identifica il
      singolo clic), e della pagina il **percorso senza query**: in quei parametri
      finisce di tutto, email comprese.
  - **RIASSUNTO AI** (bottone «Riassunto» nella testata del thread,
    `POST /api/conversazioni/[id]/riassunto`): legge la conversazione e ne tira
    fuori **data, ora, luogo, prodotto** più due righe di sintesi e cosa manca
    ancora da chiedere. Si salva su `Conversazione.riassunto`: riaprendo si
    rilegge, l'AI si scomoda solo con «Rifai».
    - ⚠️ **Ogni campo esce solo con la FRASE del cliente da cui viene**, e il
      controllo che la frase ci sia è **nostro**, non del modello: un campo senza
      citazione viene buttato. È la differenza fra «lo ha detto il cliente» e «lo
      ha pensato l'AI», e su una consegna quella differenza è tutta — un «08/12»
      che è una fascia oraria letto come l'8 dicembre manda i fiori quattro mesi
      dopo. Il prompt vieta esplicitamente di convertire «domani» in una data.
    - Quello che il cliente non ha detto resta **«non indicato»**, in un riquadro
      tratteggiato: è un'informazione, non un buco da riempire a intuito.

- **LA DIAGNOSI SI PUÒ FARE SU UN NUMERO SOLO** (30/07/2026). Con più numeri
  collegati «Perché non arrivano i messaggi?» rispondeva **errore**: ogni numero
  costa 4-5 chiamate a Meta e la richiesta sforava i 30 secondi della funzione.
  Si rompeva proprio lo strumento che serve a capire cos'è rotto — e un numero
  che non risponde portava giù la diagnosi di tutti gli altri.
  - `GET /api/whatsapp/diagnosi?numero=<phoneNumberId>` controlla solo quello: il
    conto delle chiamate resta fisso. In `/numeri-whatsapp` ogni scheda ha il suo
    **«Controlla questo numero»**; quello generale resta in fondo, con scritto
    accanto che su più numeri può sforare.
  - Un numero **sospeso** si può comunque controllare se lo si chiede per id: è il
    caso in cui si vuole capire perché è stato sospeso.

- **SI PUÒ SCRIVERE PER PRIMI: «NUOVO MESSAGGIO» IN INBOX** (30/07/2026). Prima
  si poteva solo *rispondere*: per scrivere a un cliente che non aveva mai
  scritto bisognava uscire dall'app. Bottone in cima all'elenco, finestra con tre
  cose nell'ordine in cui si pensa: **da quale casella** parte (predefinita
  preselezionata), **quale ordine** agganciare, **a chi** e cosa.
  - `GET /api/ordini/cerca?numero=1742` trova l'ordine e riempie destinatario e
    oggetto — ma **non sovrascrive** quello che una persona ha già scritto.
    Agganciare l'ordine fa anche finire il thread nella **colonna del suo
    marchio** invece che in quella della casella.
  - `POST /api/email/nuovo` invia dalla casella scelta (con la sua **firma**) e
    ⚠️ **crea la conversazione in Inbox**: se il nostro messaggio non lasciasse
    traccia, la risposta del cliente arriverebbe in un thread che comincia a
    metà. I non letti restano a 0 — le nostre uscite non sono un debito.
  - **Per ora solo posta.** Su WhatsApp scrivere per primi fuori dalle 24 ore
    richiede un modello approvato da Meta: è un lavoro a parte, non un campo in
    più in questa finestra.
  - **17 conversazioni email già arrivate rismistate** con
    `scripts/rismista-mail.mjs` (numero d'ordine → ordine in tabella → marchio):
    `#1742 → Cake` (era in Deluxy), `#2587 → FLowers`, `#12663 → Deluxy`… Su 125
    conversazioni senza marchio, 17 avevano un numero d'ordine che esiste in
    tabella; le altre sono newsletter e mail senza ordine.

- **IL WIDGET CHIEDEVA LA CONFIGURAZIONE PRIMA DI SAPERE IL SITO** (30/07/2026).
  Su cakedesign.me lo snippet mandava `data-sito="cake"` e l'API rispondeva
  «CakedesignMe», ma la chat mostrava «Deluxy — Ciao! Come possiamo aiutarti?»:
  i testi generali.
  - ⚠️ **La causa è l'ordine degli effetti.** Il sito veniva letto dentro un
    `useEffect`, e gli effetti girano tutti **dopo** il primo disegno: la
    richiesta al server partiva da un altro effetto quando `sito` era ancora
    vuoto, e non si ripeteva perché `sito` non stava fra le sue dipendenze.
  - Ora si legge nell'inizializzatore dello stato (`useState(() => …)`, con la
    guardia `typeof window`) e sta fra le dipendenze della richiesta.
  - **Verificato sulla pagina pubblicata**: `/widget?sito=cake` mostra
    «CakedesignMe» col saluto delle torte, `/widget` senza parametro mostra
    «Deluxy» coi testi generali.
  - Da tenere a mente: un valore che decide **quale** richiesta fare non può
    nascere in un effetto se la richiesta parte da un altro effetto.

- **LE NEWSLETTER SI TOLGONO DI MEZZO, E SI VEDONO SOLO GLI ORDINI**
  (30/07/2026). Misurato: colonna Deluxy con **85 conversazioni e 107 non
  letti**, quasi tutte newsletter e piattaforme (TikTok, chatbot Shopify,
  agenzie immobiliari) — il lavoro vero stava in mezzo. Due strumenti, diversi
  di proposito:
  - **Filtro «Solo ordini»** in Inbox: mostra le conversazioni con un numero
    d'ordine (o che lo citano) **più tutte le chat**, perché una persona che
    scrive su WhatsApp non è mai rumore anche se non nomina un ordine. È un
    filtro sulla vista, non tocca i dati.
  - **Mittenti da ignorare** (`/caselle`, `Impostazione.mittentiIgnorati`): le
    loro mail entrano **già archiviate** e non contano fra i non letti. Tre
    forme: `info@tiktok.com`, `@tiktok.com`, `tiktok` (pezzo dell'indirizzo, da
    usare con prudenza). Le righe con `#` sono commenti.
  - ⚠️ **Non è un antispam e non deve diventarlo.** Non si indovina se una mail è
    pubblicità: si ignorano i mittenti che **una persona** ha messo in elenco. Un
    filtro che decide da sé, il giorno che sbaglia, fa sparire la mail di un
    cliente e nessuno se ne accorge — perché il posto dove cercarla non esiste.
    Per lo stesso motivo si **archivia**, non si cancella.
  - ⚠️ **Entrambe agiscono all'ARRIVO**: le conversazioni già in casa restano
    dove sono. Per questo in Inbox si vedeva ancora «[cakedesign] Ordine #1742»
    nella colonna Deluxy. Il bottone **«Applica alle mail già arrivate»**
    (`POST /api/email/rismista`) ripassa fino a 500 conversazioni email: smista
    per numero d'ordine e archivia i mittenti in elenco. Non tocca chi ha già un
    marchio scritto a mano, e non cancella niente.

- **IL SITO SCELTO RESTA DOPO IL SALVATAGGIO** (30/07/2026). Sembrava che
  «Mostra anche il bottone tondo» si riaccendesse da sola dopo Salva. In tabella
  il dato era **giusto** (`mostraBottone: false`): a mentire era la schermata —
  dopo il salvataggio la pagina si rimonta e ripartiva dal **primo** sito
  dell'elenco, quindi chi aveva appena configurato Cakedesign si ritrovava
  davanti Deluxy con la sua spunta accesa.
  - Ora il sito scelto sta nell'**URL** (`?sito=cake`, aggiornato senza ricaricare
    quando si cambia scheda) e l'action **torna su quel sito** con `?salvato=1`,
    che mostra anche la conferma «Widget salvato per questo sito» — prima dopo
    Salva non compariva niente.
  - Da tenere a mente: un form che si rimonta perde lo stato del client. Se una
    scelta deve sopravvivere al salvataggio, va nell'URL o nel database, non
    soltanto in `useState`.

- **LA CHAT SI APRE DA UN LINK CHE C'È GIÀ SUL SITO** (30/07/2026). Sui siti la
  voce «Live Chat» del menu contatti esiste già e punta a un servizio esterno
  (`<a class="dialogify" href="https://chatting.page/…">`). Ora quel link può
  aprire la nostra chat senza mettere le mani nel tema: nello snippet
  **`data-apri-da="a.dialogify"`** (più selettori separati da virgola), e
  **`data-bottone="no"`** per togliere il bottone tondo quando quel punto
  d'ingresso basta. Si configurano per sito in «Widget dei siti»
  (`WidgetSito.selettoreApri`, `mostraBottone`).
  - ⚠️ Il clic si ascolta **sul documento**, non sull'elemento: i menu dei temi
    Shopify si costruiscono con JavaScript e quel link spesso non esiste ancora
    quando parte lo script. Con la delega funziona anche se compare dopo, e per
    tutti gli elementi che combaciano.
  - Un selettore scritto male non rompe il sito ospite: `closest()` sta in un
    `try` e in caso di errore il clic prosegue come prima.
  - Da codice resta `window.DeluxyChat.apri()` (già presente).

- **LE MAIL D'ORDINE SI SMISTANO PER SITO, E IL TOKEN INSTAGRAM SI RINNOVA DA SÉ**
  (30/07/2026).
  - ⚠️ **Le notifiche d'ordine dei tre siti arrivano tutte sulla stessa casella**:
    `[cakedesign] Ordine #1742…` finiva nella colonna della CASELLA («Deluxy»,
    perché la posta arriva a cs@deluxy.it) e non in quella del sito che ha
    venduto. Ora `src/lib/ordine-da-email.ts` prende il **numero d'ordine**
    dall'oggetto o dal corpo e lo **cerca nella tabella ordini**: se lo trova, il
    marchio è quello dell'ordine. È una ricerca, non una deduzione dal testo.
    - Misurato il 30/07: **981 ordini, zero numeri ripetuti** fra i siti (Deluxy
      12121–12684, Cake 1623–1742, Flowers 2318–2614). La tabella locale però
      tiene solo ~60 giorni: per una mail su un ordine più vecchio si scende al
      tag `[cakedesign]`, usato **solo se combacia con un solo negozio** — se ne
      pesca due o nessuno non si assegna niente.
    - `Conversazione.negozioId` + `ordineNumero`: il marchio scritto sulla
      conversazione **vince** su quello della casella. Il numero d'ordine si vede
      nella testata del thread.
  - **Si vede su quale ACCOUNT è arrivata**: nella testata, accanto al marchio,
    ora c'è `← cs@deluxy.it`. Prima con due caselle non si sapeva quale delle due
    avesse ricevuto — la prima cosa da sapere per rispondere. Per le mail
    l'etichetta è l'**indirizzo**, non il nome che ci siamo dati noi.
  - **Il CSS non si legge più nelle mail**: le notifiche Shopify cominciano con
    venti righe di `.button__cell { background: #d04c66 }` e il messaggio vero sta
    sotto, fuori schermo. `senzaCss()` in `src/lib/testo-email.ts` conta le graffe
    e butta le righe interne. ⚠️ Il riconoscimento è **stretto di proposito**:
    solo righe che COMINCIANO come un selettore, perché una riga di testo vero può
    finire con la virgola («Gentile cliente,») e non deve sparire. Provato su
    prosa con orari (`10:00-12:00`) e virgole: intatta.
  - ⚠️ **IL TOKEN INSTAGRAM SCADE OGNI 60 GIORNI** e non si rinnova da sé: al
    sessantesimo giorno i direct smettono di arrivare e non lo segnala nessuno.
    `src/lib/token-instagram.ts` + cron **`/api/cron/token-meta`** (ogni notte
    alle 4:50) lo rinnovano **dal quindicesimo giorno prima** della scadenza —
    Meta lascia rinnovare solo un token ancora valido, quindi «quando ce ne
    accorgiamo» è troppo tardi. In `/account-meta` si vede la scadenza di ogni
    account e c'è «Rinnova i token adesso».
    - **La strada migliore resta un'altra**: un token generato da un **utente di
      sistema non scade**. Su quello l'endpoint di rinnovo risponde errore, e
      l'app lo scrive come esito invece di ritentare ogni notte: un rinnovo che
      non serve non è un guasto.
  - **AVVISI DEL BROWSER**: bottone «Avvisi» in Inbox. Il permesso lo chiede un
    clic (i browser rifiutano la richiesta al caricamento, e chiederlo subito è il
    modo migliore per farselo negare per sempre) e l'avviso compare **solo a
    scheda non in primo piano**: se stai guardando l'inbox la conversazione nuova
    la vedi, e una notifica sopra ciò che guardi è rumore.

- **UN WIDGET PER OGNI SITO, CESTINO A 30 GIORNI, POSTA OGNI 5 MINUTI, FIRME,
  SUONO** (30/07/2026). Sei richieste in fila, tutte in produzione.
  - **`/aspetto-widget` → «Widget dei siti»**: si scegle il sito e la pagina
    PROPONE già la sua versione — tema, colore, scritta del bottone, titolo e
    saluto nella voce di quel brand (deluxy.it nero e oro e cerimonioso,
    l'atelier dei fiori minimale, Cakedesign caldo e con le emoji). Tabella
    nuova **`WidgetSito`**; la proposta **non si salva da sola**: finché nessuno
    conferma il sito è marcato «proposto», perché fra «così l'abbiamo deciso» e
    «così te lo suggeriamo» c'è la differenza fra una configurazione e
    un'ipotesi. Anche non salvata, però, la proposta è quella che il widget usa.
  - Lo snippet ora porta **`data-sito`**, e quello slug finisce in
    `Conversazione.numeroId`: in Inbox le chat dei siti vanno **nella colonna
    del marchio** invece di stare tutte in «Senza marchio». Gli snippet vecchi
    senza `data-sito` continuano a funzionare coi testi generali.
  - **CESTINO**: `Conversazione.eliminataIl`. Elimina non cancella più subito —
    la conversazione va nel cestino e ci resta **30 giorni**, poi
    `/api/cron/cestino` (ogni notte alle 4:20) la cancella davvero coi suoi
    messaggi. Terza linguetta in Inbox con Ripristina e «Cancella per sempre».
    ⚠️ Un messaggio nuovo **riporta fuori dal cestino** la conversazione: chi
    riscrive non sa che l'avevamo buttata.
  - **POSTA OGNI 5 MINUTI**: `/api/cron/posta`. Prima serviva premere «Scarica
    posta»: una mail delle 9:02 restava invisibile fino al clic. Finestra di 2
    giorni e non 7 — a 288 giri al giorno, rileggere una settimana di posta per
    trovare una mail nuova è lavoro buttato.
  - **FIRME PER CASELLA**: `CasellaEmail.firma`, in coda alle mail che partono da
    quella casella. `conFirma()` non la aggiunge se il testo già la contiene (le
    risposte pronte e l'AI a volte firmano da sole, e due firme si notano).
    Firmare una mail della pasticceria «Servizio Clienti Deluxy, guanti bianchi»
    è dire al cliente una cosa che per quel brand non esiste.
  - **SUONO ALL'ARRIVO**: due note generate con la Web Audio API (nessun file da
    caricare), con l'interruttore **Suono/Muto** in Inbox. ⚠️ I browser non
    suonano niente prima di un clic dell'utente nella pagina: è una regola loro.
    E si suona solo quando il totale dei non letti **cresce** — aprire l'inbox
    con 106 non letti non è un messaggio appena arrivato.
  - **Layout della testata del thread**: nome, badge e bottoni stavano su tre
    righe diverse. Ora la riga è una, e chi si accorcia è l'indirizzo.
  - ⚠️ **Perché una mail arrivata a Cake risultava «Senza marchio»**: la casella
    `info@cakedesignme.it` esisteva ma non era collegata a nessun marchio.
    Collegata a **Cake** (dato di produzione). Non l'ho dedotta dal dominio: il
    collegamento casella → marchio lo dichiara una persona, e «cakedesignme.it»
    somiglia a «Cake» ma somigliare non è essere.

- **IL WEBHOOK ACCETTA DUE FIRME, E I SEGRETI SI POSSONO CANCELLARE**
  (30/07/2026). Due cose che si tenevano per mano.
  - ⚠️ **«Instagram API con login di Instagram» ha una chiave segreta SUA** e
    firma i webhook dei DM con quella, non con l'App Secret dell'app Facebook.
    `POST /api/webhooks/meta` verificava con un segreto solo: gli eventi
    Instagram venivano respinti con **401**, e da fuori sembrava «Meta non ci
    manda niente» — si andava a controllare l'iscrizione al webhook, che era a
    posto. Ora si provano **tutti i segreti configurati** e basta che uno
    combaci. Nuovo campo in Impostazioni: **Chiave segreta di Instagram**
    (`igAppSecret`); vuoto = vale l'App Secret.
  - **Non si sceglie la chiave da `body.object`**: quel campo sta nel corpo, e il
    corpo non è ancora verificato — decidere quale serratura usare partendo da un
    dato non firmato vuol dire lasciarla scegliere a chi chiama. Provato: firma
    Instagram + solo App Secret → 401; con entrambi → accettata; firma di un
    estraneo → 401.
  - **I segreti ora si cancellano.** I campi segreti si salvavano solo se pieni
    (comodo: non si reincolla tutto a ogni modifica) e quindi **un token
    revocato o incollato per errore non si poteva togliere**, solo sovrascrivere.
    Nuovo componente `CampoSegreto` con la casella «Cancella il valore salvato»
    (arriva come `svuota_<chiave>`), usato da tutti gli 11 campi segreti della
    pagina. La cancellazione vince sul valore incollato: se qualcuno spunta e
    incolla, l'intenzione dichiarata è la casella.
  - La diagnosi ha una riga in più sulla chiave di Instagram.

- **LA GUIDA CUSTOMER SERVICE È DENTRO L'AI** (30/07/2026).
  `scripts/carica-guida-cs.mjs` (in catalogo) porta nell'app la parte della
  **Guida Customer Service Deluxy unificata v1.0** (14/07/2026, 49.000 caratteri)
  che serve a rispondere ai clienti: **27 risposte pronte**, **12 istruzioni** di
  tono per brand e canale, **1 documento** di riferimento.
  - ⚠️ **La divisione fatti / forma non è arbitraria.** Il prompt delle risposte
    rapide (`src/lib/ai.ts`) vieta all'AI di aggiungere fatti: prende il
    contenuto da uno **Script** e ne cambia solo la forma seguendo le
    **Istruzioni**. Quindi tempi, cut-off, costi e coperture stanno negli
    Script; tono, firma e lessico nelle Istruzioni. Mettere un fatto in
    un'istruzione vuol dire che non arriverà mai in una risposta.
  - Gli Script **non hanno un campo marchio**: quelli validi per un solo brand lo
    dichiarano in coda al `quando` («Vale SOLO per il marchio …»), che è il testo
    su cui l'AI decide. Senza, avrebbe proposto i guanti bianchi a chi scrive ai
    fiori.
  - **Restano fuori di proposito**: operatività interna (Shopify admin, bozze,
    tag, ticket Tidio), liste partner e fornitori, sconti riconosciuti, ricarichi
    +30%/+40%, costi a noi e margini, nomi delle persone interne.
  - ⚠️ **I punti in conflitto NON sono stati caricati come fatti.** La guida
    marca «DA VALIDARE» sei punti dove i due documenti sorgente si contraddicono
    — **numero della carta Postepay (due carte diverse)**, soglia di spesa per la
    chiamata di feedback, link per la recensione, tipo di compensazione, orari di
    contatto, formato del nome in rubrica. C'è un'istruzione esplicita che vieta
    di rispondere su quei punti. Far scegliere all'AI una delle due versioni
    voleva dire dare a un cliente un numero di carta sbagliato.
  - I 3 script che l'handoff chiamava «di prova» **sono rimasti**: «Ritardo nella
    consegna» ha **199 usi** e copre un caso che il set nuovo non ha. Allineate
    solo le categorie (`Consegne`→`Consegna`, `Amministrazione`→`Pagamenti`):
    nel selettore comparivano come gruppi separati.
  - **Non verificato con l'AI vera**: la chiave OpenAI è cifrata con l'`APP_SECRET`
    di produzione e da qui non si legge. Va provato dall'app pubblicata con
    «Risposta rapida» su un messaggio vero.

- **603 ORDINI VECCHI CHIUSI, E I RECLAMI APERTI IN PRIMA PAGINA** (29/07/2026).
  - `scripts/chiudi-consegne-passate.mjs` (in catalogo in `scripts/README.md`):
    segna **gestiti** gli ordini con consegna precedente a ieri. Eseguito in
    produzione: **603 chiusi**, da 907 a **304 da gestire**. `gestione` era
    arrivata dopo e nessuno aveva spuntato i vecchi: la bacheca metteva il
    lavoro di oggi sotto due mesi di archeologia.
    - Senza `--esegui` non scrive; `--giorni N` sposta il confine.
    - ⚠️ Non tocca i **286 ordini senza data di consegna**: non si sa se sono
      passati, e chiuderli a scatola chiusa vuol dire perderli. Sono il prossimo
      problema da guardare, ed è un problema di dati (Orders non manda la data),
      non di questa app.
    - `gestioneDaNome = "Chiusura automatica · consegna passata"`, non il nome di
      una persona: quel campo dice chi ha spuntato l'ordine, e una firma falsa in
      un registro di chi-ha-fatto-cosa è peggio del campo vuoto.
  - Nella schermata «Oggi» c'è il riquadro **Reclami aperti**: gravità in
    parole (lieve/media/grave), ordine, marchio, casistica + **prima azione da
    fare**, colpa e **da quanti giorni è aperto** — dal terzo giorno in rosso.
    Ordinati per gravità e poi per età: un grave di ieri prima di un lieve di una
    settimana, ma il lieve che invecchia non sparisce sotto.

- **SCHERMATA INIZIALE «OGGI», MENU RIORDINATO, PROMEMORIA** (29/07/2026).
  `/` non è più la bacheca ordini: è la **dashboard dell'operatore**. La bacheca
  sta su **`/ordini`**, che era un redirect ed è diventato la pagina vera —
  ⚠️ è anche l'URL registrato dell'app su Shopify, quindi chi arriva da lì
  continua a trovare gli ordini.
  - Fascia dei numeri (ognuno è un link a dove si lavora): chat da rispondere,
    consegne di oggi, ordini da gestire con quanti in ritardo, reclami aperti,
    rimborsi da decidere, pagamenti da inviare.
  - ⚠️ **Chat ed email sono contate a parte, e non è estetica.** Misurato:
    **106 conversazioni non lette, di cui 105 email** — quasi tutte newsletter.
    Un unico «106 da rispondere» sarebbe un allarme che suona sempre, cioè che
    non si guarda più. Il numero grande sono le chat; le mail stanno nella nota.
  - «Chi aspetta una risposta» ordina per: **finestra WhatsApp che sta
    scadendo** → chat → chi aspetta da più tempo. La finestra è l'unica cosa
    rossa della schermata: passate 24 ore dal messaggio del cliente, Meta non
    lascia più rispondere in testo libero e serve un modello approvato.
  - «Ordini da lavorare» usa le **stesse fasce di urgenza della bacheca**
    (`src/lib/urgenza.ts`: oggi → prossimi → scaduti da poco → senza data →
    scaduti da tempo) su tutti i marchi, solo i non gestiti. Le due schermate
    non devono raccontare priorità diverse.
  - I collegamenti portano sulla **riga precisa**: `/inbox?c=<id>` apre quella
    conversazione, `/ordini?apri=<id>` apre quel dettaglio.
  - **Menu laterale riordinato per priorità**: `Lavoro` (Oggi, Inbox, Ordini
    aperti, Calendario) · `Ordini` · `Reclami` · **`Qualità`** (Punteggi,
    Feedback, Giudizi, Valet) · Messaggi · Configurazione. Le misure servono a
    chi guarda indietro una volta a settimana, non a chi ha un cliente al
    telefono: erano in cima, ora sono in fondo.
  - **Promemoria** (`Attivita`, `/api/attivita`): si scrivono dalla dashboard,
    con scadenza facoltativa, e si spuntano. ⚠️ **Non sono il registro attività
    dell'ecosistema**: quello è **Deluxy Tasks** (porta 3090, API a chiave).
    Questi sono i promemoria attaccati al lavoro di questa schermata; quando la
    chiave di Tasks sarà configurata **vanno spinti anche là**, altrimenti
    diventano due registri. La cartella `deluxy-tasks/` non è su questo branch:
    il contratto dell'API va letto lì prima di integrare.

- **ICONCINE SULLA RIGA E LINGUETTA «ARCHIVIATE»** (29/07/2026). Archiviare
  richiedeva di aprire la conversazione: per fare pulizia di 112 newsletter è
  un clic di troppo per riga.
  - Ogni riga ha ora **due iconcine in basso a destra**: archivia (o «riporta in
    inbox», quando si è nell'archivio) ed elimina. Sempre visibili, smorzate —
    un'azione che compare solo se la cerchi non è un'azione rapida. Le icone
    sono SVG scritti nel componente: tre disegni non giustificano un pacchetto.
  - **Linguette «In arrivo» / «Archiviate N»** in cima all'elenco. Il numero
    dell'archivio arriva sempre dal server (`/api/conversazioni` lo torna anche
    quando si guarda la posta in arrivo), così si sa quante se ne sono messe via
    senza dover cliccare. `?archiviate=1` filtra al contrario, stesso
    raggruppamento per marchio.
  - ⚠️ **La riga è un `div role="button"`, non più un `<button>`**: le iconcine
    sono bottoni, e un bottone dentro un bottone è HTML non valido — i browser
    lo "riparano" buttando fuori i figli e la riga si scompone. Con
    `tabIndex` + Invio/Spazio resta raggiungibile da tastiera.
  - ⚠️ Sulle iconcine c'è `stopPropagation()`: senza, archiviare aprirebbe anche
    il thread di una conversazione che sta sparendo.

- **SI PUÒ TOGLIERE UNA CONVERSAZIONE DALL'INBOX** (29/07/2026). Nella testata
  del thread: **Archivia** (sparisce dall'elenco, resta nel database — è il
  gesto giusto per la pubblicità) e **Elimina** (cancella la conversazione **e
  tutti i suoi messaggi**, `onDelete: Cascade`, con conferma che dice cosa se ne
  va). `DELETE` e `PATCH` su `/api/conversazioni/[id]`.
  - ⚠️ **Nessuna delle due tocca la casella di posta vera**: la mail resta sul
    server IMAP. E con **«Scarica posta» una mail eliminata rientra**, se è
    ancora in posta in arrivo e dentro la finestra dei 7 giorni — la dedup
    guarda i messaggi che abbiamo, e quello cancellato non c'è più. Archiviare
    invece regge.

- **LE MAIL SI POSSONO SCRIVERE DA AI MAIL** (29/07/2026). `src/lib/ai-mail.ts`
  → `urlScriviAiMail()` costruisce il deep link
  `https://deluxy-mail.vercel.app/scrivi?a=…&oggetto=…&corpo=…&app=Deluxy Customer Service&rif=…`,
  la strada comune a tutte le app Deluxy (stessa convenzione di
  `deluxy-scout/lib/aimail.ts`).
  - Due punti d'ingresso: il bottone **AI Mail** nel riquadro di risposta delle
    conversazioni **email** (destinatario, `Re: oggetto` e bozza già dentro) e
    **Apri in AI Mail** nel pop-up di composizione degli Ordini.
  - ⚠️ **Quello che parte da AI Mail NON torna in questa conversazione**: il
    thread registra solo ciò che spedisce quest'app. È scritto accanto al
    bottone e nel titolino, perché è la cosa che si scoprirebbe dopo.
  - Il corpo si ferma a 6000 caratteri: oltre, l'URL non arriva (i browser
    tagliano intorno a 8000 e AI Mail taglia a 8000).
  - L'invio SMTP di quest'app **resta**: è quello che tiene la traccia in Inbox.
    Oggi però la casella `cs@deluxy.it` non ha la password salvata, quindi la
    posta da qui non parte davvero: finché è così, AI Mail è la strada che
    funziona.

- **RISPOSTE PRONTE PER TIPOLOGIA NEL RIQUADRO DI RISPOSTA** (29/07/2026).
  Bottone **Risposte** accanto a «Risposta rapida»: apre l'elenco degli Script
  attivi **raggruppati per categoria**, con ricerca; un clic e il testo entra
  nel riquadro dove sta il cursore. Il conteggio `usi` cresce, quindi i più
  usati salgono in cima.
  - Convive con la **Risposta rapida** (AI) e non la sostituisce: l'AI serve
    per i messaggi da capire, l'elenco per i casi che si riconoscono a colpo
    d'occhio — e non fa aspettare né sceglie al posto tuo.
  - Riusa `inserisciScript()` di `src/lib/script-testo.ts`: se nel riquadro c'è
    già un saluto, quello dello script si toglie. Senza, il cliente riceveva
    «Buongiorno… Buongiorno…» ogni volta.
  - ⚠️ **Niente invio automatico.** Il testo si mette nel riquadro e parte solo
    quando lo manda una persona. Un invio davvero automatico va deciso a parte:
    servono le regole di quando scatta, e sbagliarne una vuol dire scrivere una
    cosa sbagliata a un cliente vero senza che nessuno l'abbia letta.
  - Da fare: **i testi veri**. In tabella ci sono ancora i 3 script di prova
    creati per collaudare l'AI.

- **L'ETICHETTA DI UN ACCOUNT NON È UN MARCHIO** (29/07/2026). In Inbox
  comparivano quattro colonne — Cake, Deluxy, FLowers, **CakeDesignMe** — ma
  «CakeDesignMe» non è un brand: è il nome che avevamo dato al numero WhatsApp
  di Cake. Il ripiego «se il numero non ha un negozio, usa la sua etichetta»
  andava bene per il badge di una riga e **inventava un marchio** in una
  bacheca a colonne.
  - `risolutoreMarchio()` ora restituisce **due** cose: `marchioDi` (solo il
    negozio collegato, altrimenti vuoto → colonna «Senza marchio») e
    `etichettaDi` (come si chiama la linea, per il badge). Una linea non
    collegata adesso si vede che manca, invece di sembrare un brand in più.
  - Dati sistemati in produzione: il numero **CakeDesignMe → Cake**, e i due
    account Instagram **@deluxyflowers → FLowers**, **@cakedesignme → Cake**
    (erano senza marchio: appena Instagram riceve, sarebbero finiti fuori posto).

- **FOTO E ALLEGATI SU WHATSAPP, IN USCITA E IN ENTRATA** (29/07/2026). Prima si
  mandava solo testo, e di una foto ricevuta restava la scritta «[image]».
  - **In uscita**: bottone **Allega** nel riquadro di risposta (solo WhatsApp).
    Sono due chiamate, non una: `POST /{phoneNumberId}/media` per caricare il
    file e avere un id, poi il messaggio che punta a quell'id
    (`caricaMediaWhatsApp` + `inviaMediaWhatsApp` in `src/lib/meta.ts`). Il
    testo già scritto nel riquadro diventa la **didascalia**.
  - ⚠️ **Tetto 4 MB, e non è una scelta estetica**: la richiesta passa da una
    funzione serverless, che accetta ~4,5 MB di corpo. Oltre, il file non
    arriva nemmeno alla rotta e l'errore non spiega niente: meglio dirlo prima
    (`/api/conversazioni/[id]/allegati`).
  - **In entrata** il webhook ora salva `mediaId`, `mimeType` e `nomeFile` di
    foto, video, audio, sticker e documenti — e la **didascalia**, che prima si
    buttava insieme al resto (era il messaggio del cliente).
  - ⚠️ **Il file non lo teniamo noi.** Lo tiene Meta e lo dà a richiesta;
    `/api/media/[id]` fa da ponte. L'`id` nella rotta è quello del
    **messaggio**, non del media: così si sa quale token usare (quello del
    numero che ha ricevuto) e un id indovinato non tira fuori la foto di un
    altro cliente. L'indirizzo che dà Meta vale pochi minuti e vuole il token
    anche solo per leggerlo: come `src` di una `<img>` risponderebbe 401.
    Dopo ~30 giorni Meta il file non ce l'ha più e la rotta lo dice.
  - Non ancora: allegati su **email, Messenger, Instagram** (strade diverse —
    SMTP e altre rotte Meta); sugli altri canali il bottone non compare invece
    di comparire e fallire.

- **LE COLONNE SONO TUTTI I MARCHI, E LA CONVERSAZIONE SI APRE IN UNA FINESTRA**
  (29/07/2026). Seguito immediato della voce qui sotto, che nasceva monca.
  - Le colonne ora partono da **tutti i negozi attivi** (`Cake`, `Deluxy`,
    `FLowers`), non solo da quelli con un account Meta collegato: prima esisteva
    la sola colonna «FLowers» e deluxy.it non c'era.
  - **`CasellaEmail.negozioId`** (campo nuovo, `prisma db push` fatto): una mail
    non porta con sé «il nostro numero» come WhatsApp, quindi il marchio è
    quello della casella, dichiarato in **`/caselle` → Marchio**. Vuoto resta
    una risposta legittima (una casella che serve tutti i marchi).
    ⚠️ **Dato cambiato in produzione**: `cs@deluxy.it` è stato assegnato al
    marchio **Deluxy** (= deluxy.it), così le 112 mail hanno una colonna. Si
    cambia dal menu in `/caselle`.
  - A colonne il thread **non sta più di fianco**: la bacheca prende tutta la
    larghezza e la conversazione si apre in una **finestra** (`.velo` +
    `.pannello-thread`, gli stessi del dettaglio ordine) con Esc, clic fuori e
    bottone Chiudi. In vista Elenco resta il classico elenco + thread a destra.
  - ⚠️ **`src/lib/marchio-conversazione.ts`**: il marchio si calcola in UN posto
    solo, usato dalla pagina e da `/api/conversazioni`. Erano due logiche
    diverse — la rotta non conosceva Messenger/Instagram — e con l'inbox a
    colonne una conversazione **cambiava colonna da sola** al primo
    aggiornamento automatico (5 secondi dopo).

- **INBOX A COLONNE PER MARCHIO** (29/07/2026). L'elenco unico non rispondeva a
  «come stiamo andando su Flowers?». Ora `/inbox` apre con **una colonna per
  marchio** (stessa grammatica della bacheca degli Ordini: pallino, nome,
  conteggio, pill dei non letti) e il thread resta a destra; il bottone
  **Elenco/Colonne** riporta alla lista unica per ordine di arrivo. Sotto i
  1100px il thread passa sotto le colonne.
  - Le colonne partono dai **marchi collegati** (numeri WhatsApp + account Meta),
    così un marchio a zero messaggi si vede lo stesso: «oggi nessuno ha
    scritto» e «non è collegato» sono due cose diverse.
  - ⚠️ **Oggi la vista dice poco, ed è colpa dei dati, non della vista.**
    Misurato in produzione il 29/07: 112 conversazioni email + 1 WhatsApp, e
    **113 su 113 finiscono in «Senza marchio»**. Due motivi distinti:
    1. **le mail non hanno marchio**: `CasellaEmail` non ha un legame col
       negozio, e c'è una casella sola (`cs@deluxy.it`). Per dare un marchio
       alle mail servirebbe o un campo `negozioId` sulla casella, o una casella
       per marchio — è una decisione, non un dettaglio tecnico: il servizio
       clienti potrebbe legittimamente essere unico per tutti i marchi.
    2. **l'unica conversazione WhatsApp è arrivata su `numeroId`
       `1227556353776499`, che non è il numero registrato**
       (`677520672119409`, marchio «FLowers»): finché quell'id non è in
       `/numeri-whatsapp`, la conversazione resta senza marchio.

- **UNA MAIL APERTA IN INBOX SI LEGGE** (29/07/2026). Cliccando una mail, la
  schermata si smontava: elenco delle conversazioni bianco, testata e riquadro
  di scrittura fuori campo, e al posto del testo un muro di link di
  tracciamento SendGrid e di indirizzi di immagini.
  - ⚠️ **Il colpevole era un `min-height` mancante**, non la mail. In una
    colonna flex il figlio non scende sotto la dimensione del suo contenuto: con
    un messaggio lungo `.messaggi` non attivava mai il proprio scorrimento, e lo
    `scrollIntoView` di fine thread finiva per scorrere `.inbox` — che è
    `overflow: hidden` ma resta scorribile da codice. Aggiunto
    `min-height: 0` a `.inbox .thread` e `.thread .messaggi` in `globals.css`.
  - `src/lib/testo-email.ts`: le mail HTML arrivano come testo generato da chi
    le manda, con i link fra parentesi quadre e le immagini scritte per esteso.
    `ripulisciTestoEmail()` toglie immagini, parentesi, spazi invisibili e
    righe vuote a colonne; `pezziDiTesto()` rende i link cliccabili mostrando
    **solo il nome del sito** (un link SendGrid è lungo 300 caratteri).
  - La pulizia è **solo per gli occhi**: nel database il testo resta intero e la
    bolla ha «Testo originale» per rileggerlo com'era arrivato. Oltre 900
    caratteri si chiude con «Mostra tutto». L'oggetto della mail si vede in
    grassetto in cima alla bolla (`Messaggio.oggetto`, c'era già ma non usciva).
  - Ripulitura attiva **solo sul canale email**: su WhatsApp e widget scrive una
    persona e quello che manda va letto com'è.

- **IL WIDGET SI ADATTA AL SITO CHE LO OSPITA** (28/07/2026). Pagina
  **`/aspetto-widget`** («Widget dei siti»): sei temi, colore del sito,
  posizione, scritta accanto al bottone, anteprima e codice pronto da copiare.
  - I temi sono blocchi di variabili `--w-…` su `.widget-app[data-tema=…]` in
    `globals.css`: chiaro, scuro, deluxy, caldo, minimale, automatico. Il widget
    **non usa i token dell'app**, altrimenti cambiare tema non cambierebbe
    niente. Il colore del sito arriva da `data-accento` → `?accento=` e vince
    sul tema (una variabile sola, `--w-accento`).
  - ⚠️ **`public/widget.js` ora vive in uno SHADOW DOM.** Gira su siti che non
    controlliamo: un `button { … !important }` del tema ospite ci riscriveva il
    bottone. Verificato su una pagina di prova con CSS ostile: il bottone del
    sito diventa rosso, quadrato e maiuscolo, il nostro resta pillola, accento
    corretto, font di sistema; l'iframe ignora `border: 8px solid green` e
    `filter: invert(1)`.
  - Sul telefono (≤480px) la chat va a schermo intero e la × è **dentro** la
    chat: il bottone che l'ha aperta ci finisce sotto. `100dvh`, `16px` esatti
    sul campo (sotto, Safari zooma) e `env(safe-area-inset-bottom)`.
  - **IL WIDGET SI APRE ANCHE DAI PULSANTI DEL SITO** (30/07/2026). Lo shadow DOM
    protegge dai CSS altrui ma chiude fuori anche noi: il bottone flottante era
    l'**unico** modo di aprire la chat, e i siti hanno già il loro punto
    d'ingresso. Aggiunta `window.DeluxyChat` in `public/widget.js`: `apri()`,
    `chiudi()`, `alterna()`, `eAperta()`. Nient'altro è cambiato.
    - Primo uso: **cakedesign.me**, dove la voce «Live Chat» del pannello
      contatti portava a `chatting.page` — servizio esterno, il cliente usciva
      dal sito e la conversazione non arrivava mai in Inbox. Il tema intercetta
      il click e chiama `DeluxyChat.apri()`; il link vecchio resta come rete di
      sicurezza se il widget non si carica. Codice e trappole:
      `sviluppi-siti-deluxy/skills/sviluppi-siti-deluxy/reference/STATO-CAKEDESIGN.md`.
    - ⚠️ Chi si aggancia deve **chiudere il proprio pannello** prima di chiamare
      `apri()`: un menu a tendina che copre lo schermo lascia la chat dietro.
  - ⚠️ **La conversazione nasce al PRIMO MESSAGGIO, non al caricamento.** Prima
    bastava che il widget si caricasse: ogni visitatore di passaggio (e ogni
    anteprima, e ogni prova) lasciava in Inbox una conversazione vuota
    indistinguibile da un cliente in attesa. `GET /api/widget/messaggi` senza
    token risponde con titolo e saluto e basta; `POST /api/widget/sessione` lo
    chiama l'invio. Misurato: aprire la chat → 0 conversazioni, scrivere → 1.
  - L'anteprima (`/widget?anteprima=1`) è il widget vero con messaggi finti e
    **non parla col server**: le sei miniature dei temi avrebbero creato sei
    conversazioni ogni volta che si guarda la pagina.
  - Corretto un errore vecchio: il messaggio di benvenuto era marcato come
    scritto dal visitatore (`bolla out`); coi temi, che colorano la sua bolla,
    il nostro saluto sembrava suo.

- **CHI HA FATTO COSA: l'operatore resta scritto su ordini e messaggi**
  (28/07/2026). Con più persone sugli stessi ordini, «chi l'ha preso in mano» e
  «chi ha risposto al cliente» erano domande senza risposta.
  - `Ordine.gestioneDaId` + `gestioneDaNome`: chi ha cambiato lo stato di
    lavorazione (`/api/ordini/[id]/gestione`); in lista si legge nel titolino
    del badge. Verificato in produzione: ordine **#1738 → `da_gestire`, segnato
    da Nicolo Daniele Donato**.
  - `Messaggio.utenteId` + `utenteNome`: chi ha scritto il messaggio in
    **uscita** — risposte dall'Inbox (`/api/conversazioni/[id]/messaggi`) e mail
    dal pop-up (`/api/email/invia`). Si vede nella bolla accanto all'ora e nella
    riga «ultimo messaggio» della scheda cliente.
  - ⚠️ Il **nome è copiato, non collegato**: se quell'utente viene tolto resta
    scritto chi aveva risposto al cliente invece di un id orfano. E i campi sono
    **vuoti sullo storico**: partono da adesso, a posteriori non si indovina —
    «vuoto» non vuol dire «nessuno», vuol dire «prima di questa data».

- **PIÙ PAGINE FACEBOOK E PIÙ ACCOUNT INSTAGRAM** (28/07/2026). Stesso impianto
  dei numeri WhatsApp, esteso agli altri due canali Meta.
  - Tabella `PaginaMeta` (`canale` + `idPagina` unici insieme, `token` cifrato,
    `negozioId` per il marchio), pagina **`/account-meta`** «Facebook e
    Instagram» in Configurazione, `src/lib/pagine-meta.ts` per la traduzione.
  - Il webhook non butta più via il destinatario: legge
    `entry[].messaging[].recipient.id` (ripiego `entry.id`) e lo scrive nello
    **stesso campo** `Conversazione.numeroId` usato dal numero WhatsApp — fa lo
    stesso mestiere, tenere separate le conversazioni di marchi diversi.
  - Si risponde **dall'account che ha ricevuto**: `tokenPerPagina(canale, id)` e
    `inviaPagina(..., mittenteId)` che chiama `/{idPagina}/messages` invece di
    `/me/messages`. ⚠️ Con `/me` il token generale mandava il messaggio dalla
    pagina di un altro marchio.
  - ⚠️ **Il ripiego sul token generale qui non è un'equivalenza** (come invece è
    su WhatsApp, dove un token vale per tutti i numeri dello stesso Business
    Manager): ogni Pagina ha il SUO Page Access Token. Con più pagine, il token
    per pagina è obbligatorio, non facoltativo.
  - Verificato in locale con webhook firmato: lo stesso cliente che scrive a due
    pagine diverse crea **due conversazioni separate**, ciascuna col suo
    `nostroAccount` — prima ne faceva una sola con i due discorsi mescolati.
    Righe di prova cancellate per id.
  - Da fare quando arrivano gli account veri: incollare l'ID pagina/profilo e il
    token in `/account-meta` (in Impostazioni `fbPageToken` e `igToken` non sono
    mai stati riempiti), e spuntare `messages` per Messenger e Instagram
    nell'app Meta — il webhook è lo stesso già usato da WhatsApp.

- **INBOX MULTI-NUMERO: si sa su quale nostro WhatsApp è arrivato un messaggio**
  (27/07/2026). Preparato per l'arrivo dei numeri veri (l'utente ha connesso il
  WABA «Deluxy Flowers», ID 1473727904063695).
  `Conversazione.numeroId` + `numeroNostro`, chiave unica ora
  **`[canale, idEsterno, numeroId]`**; `NegozioShopify.waPhoneNumberId` collega
  numero → brand (campo in `/negozi`); `src/lib/numeri-whatsapp.ts` per la
  traduzione; l'Inbox mostra il brand accanto al canale, in elenco e in testata.

  ⚠️⚠️ **IL DIFETTO CHE C'ERA: il webhook buttava via `metadata`.** Meta dice
  SEMPRE su quale nostro numero è arrivato il messaggio
  (`value.metadata.phone_number_id` / `display_phone_number`) e non lo leggevamo.
  Con più WhatsApp Business (Flowers, Cake Design, Deluxy Cake Delivery…) le
  conseguenze erano tre, tutte silenziose:
   1. non si sapeva a quale marchio avesse scritto il cliente — e le istruzioni
      di CS AI sono **per brand**, quindi si sarebbe risposto col tono e la firma
      di un altro negozio;
   2. la chiave era `[canale, idEsterno]`, quindi lo **stesso cliente che scrive
      a due numeri finiva in UNA conversazione**, con due discorsi mescolati;
   3. la risposta usciva dall'unico `waPhoneNumberId` delle Impostazioni: per
      metà dei messaggi il numero sbagliato — dal telefono del cliente è
      un'altra azienda che gli scrive di un ordine che non ha fatto lì.
  Ora si risponde da `conversazione.numeroId`, con l'impostazione come ripiego
  per le conversazioni vecchie che il numero non l'hanno.

  **Verificato simulando il webhook vero** (forma Meta completa, due
  `phone_number_id` diversi collegati a FLowers e Cake): lo stesso cliente
  produce **2 conversazioni distinte**, ognuna col suo numero e il suo brand, e
  l'Inbox mostra «WhatsApp + FLowers» e «WhatsApp + Cake». Il dedup per
  `idMessaggio` regge (evento ripetuto → nessun messaggio in più).
  Dati di prova rimossi, e i `waPhoneNumberId` finti (prefisso 9999) azzerati
  sui brand veri: nessun numero inventato è rimasto in tabella.

  ⚠️ `prisma db push` chiedeva `--accept-data-loss` per il nuovo vincolo unico.
  Accettato **dopo aver verificato che `Conversazione` ha 0 righe**: l'avviso
  riguarda solo il fallimento in caso di duplicati, non la cancellazione. Su una
  tabella piena andrebbe fatta prima una migrazione che riempie `numeroId`.

  ⚠️⚠️ **PERCHÉ L'INBOX È ANCORA VUOTA: manca tutta la configurazione Meta.**
  Verificato in produzione: `metaVerifyToken`, `metaAppSecret`, `waToken`,
  `waPhoneNumberId`, `fbPageToken`, `igToken` sono **tutte mancanti**, e
  conversazioni/messaggi sono 0. Per RICEVERE non serve il token, servono:
   1. **Impostazioni → Verify token**: una parola scelta da chi configura;
   2. su developers.facebook.com, app Meta → WhatsApp → Configurazione →
      **Webhook**: URL `https://deluxy-messaging.vercel.app/api/webhooks/meta`,
      lo stesso verify token, e **iscrizione al campo `messages`**;
   3. il WABA va **iscritto all'app** (`POST /{waba-id}/subscribed_apps`);
   4. **Impostazioni → App Secret** (facoltativo ma consigliato: se c'è, il
      webhook accetta solo richieste firmate — vedi `x-hub-signature-256`);
   5. per **rispondere** servono anche token permanente e Phone Number ID;
   6. in **Negozi**, il Phone Number ID sul brand giusto, altrimenti in Inbox si
      vede il numero grezzo invece di «Deluxy Flowers».
  I token li crea una persona sul suo account Meta: non li genero io.

- **CORREZIONE: il biglietto sta nelle NOTE dell'ordine, non nell'attributo**
  (27/07/2026). Segnalato dall'utente, e i numeri gli danno ragione.
  `testoBiglietto(nota, attributo)` in `src/lib/orders.ts` unisce i due campi:
  la nota (`shopify.note`) è la fonte, l'attributo (`biglietto`) si aggiunge solo
  se dice qualcosa di diverso e non è già contenuto nell'altra.
  ⚠️ **Misurato su 800 ordini del registro**: `shopify.note` ha testo su **680
  (85%)**, l'attributo `biglietto` su **71** — e dei 70 con entrambi, **67 sono
  lo stesso testo**. Leggendo solo l'attributo (come faceva la prima versione)
  nove ordini su dieci risultavano «senza biglietto» pur avendone uno scritto:
  era il caso di **#12663**, dove la nota è «They say the best trips… Bien à toi,
  Arthur» e la sezione non compariva affatto.
  **Effetto della correzione, misurato in locale: buste da 77 a 758 su 938
  (dal 8,2% all'80,8%)**, dopo `POST /api/ordini/sync?completo=1`.
  ⚠️ **CONSEGUENZA DA DECIDERE**: un'icona presente sull'81% delle righe non
  distingue più niente — l'informazione è diventata l'ASSENZA (il 19% senza
  biglietto). Se dà fastidio, si inverte: si marca chi NON ha il biglietto. Per
  ora resta come chiesto, ma il numero va tenuto presente.
  ⚠️ La sezione nel dettaglio ora dice «note dell'ordine» e non «nota del
  cliente», e nello stato vuoto «Nessun biglietto: il cliente non ha scritto
  note»: le parole devono corrispondere al campo che si legge davvero.
  ⚠️ **Resta valida la regola di non interpretare il testo**: le note contengono
  spesso anche indirizzo, telefoni e istruzioni per il fornitore (e in un caso
  «30 Luglio 08/12», dove 08/12 è la fascia oraria). Si mostra tutto, si copia
  tutto, taglia una persona.
  ⚠️ **Lezione di metodo**: avevo scartato la pista «biglietto previsto» con una
  misura corretta (il Sì/No della variante NON c'entra — verificato) ma stavo
  leggendo un secondo campo sbagliato senza accorgermene, perché il campo si
  chiamava proprio `biglietto`. **Un nome giusto non garantisce il contenuto
  giusto**: quando un campo «di dominio» risulta pieno nell'8% dei casi, il
  sospetto va al campo, non ai dati.

- **La sezione Biglietto nel dettaglio c'è SEMPRE, con l'icona lettera**
  (27/07/2026). Prima spariva quando il campo era vuoto, e una sezione che
  scompare è ambigua: chi apre un ordine senza biglietto non sa se non c'è, se
  l'app non l'ha caricato o se va cercato altrove. Ora due stati espliciti —
  il testo con «Copia biglietto», oppure «Non indicato: su questo ordine il
  cliente non ha scritto niente». Verificati entrambi su ordini veri (#12372 con
  282 caratteri, e un ordine senza). L'icona è la stessa busta dell'elenco:
  icone diverse per la stessa cosa non si collegano.

  ⚠️⚠️ **«SE È PREVISTO BIGLIETTO» NON È UN DATO CHE ABBIAMO — MISURATO.**
  Sull'ordine dello screenshot (#12663) la riga è «Bouquet Beethoven —
  Medio-Grande / **No**», e sembrava naturale leggere quel «No» come «biglietto:
  no». **È una deduzione, e sarebbe stata sbagliata.** Su 800 ordini del
  registro:
    - la variante è la sola stringa dei VALORI (`variantTitle` di Shopify):
      i NOMI delle opzioni non li salva nessuno, quindi non si sa a cosa si
      riferisca quel Sì/No;
    - l'opzione finale Sì/No compare su **23 ordini su 800** (2 «Sì», 21 «No»):
      è una famiglia di prodotti, non un meccanismo generale;
    - **correlazione zero col biglietto**: i 2 ordini con «Sì» hanno **0** note
      del cliente, mentre il 9% dei 777 senza quell'opzione ce l'ha. Se il «Sì»
      fosse il biglietto, sarebbe il contrario.
    - nelle proprietà delle righe (che SONO strutturate, «chiave: valore»:
      Ingredienti, Base, Farcitura, Scritta sulla torta, Topping…) **non esiste
      nessuna chiave «Biglietto»** su 120 righe con proprietà.
  Quindi l'icona resta agganciata al solo segnale reale: **il testo scritto dal
  cliente** (`biglietto` non vuoto), 70 ordini su 800 (8,8%).
  **COME AVERE IL DATO VERO**: in `deluxy-orders` l'import Shopify chiede
  `variantTitle`; va aggiunto `selectedOptions { name value }` sul line item —
  lì il nome dell'opzione c'è. Poi si espone nell'API e qui l'icona può dire
  «biglietto previsto» come fatto e non come indovinello. Serve un re-import per
  riempire lo storico.

- **«DA MOBILE LA MAIL NON SI APRE»: bersagli troppo piccoli, e l'indirizzo che
  non si toccava** (27/07/2026).

  Il pop-up di posta **funzionava**: aperto da uno schermo da 375px con una
  sequenza di tocco vera (touchstart/touchend + click) si apre, sta dentro lo
  schermo, e col dettaglio già aperto riceve lui il tocco (stesso z-index 60 ma
  più avanti nel DOM — verificato con `elementFromPoint`). Il guasto era prima
  del pop-up: **non si riusciva a premere il bottone**.
  ⚠️ **Misurato: le nove azioni di una scheda erano alte 24px** — «Email» 47×24,
  con «Chiama» e «Reclamo» appiccicati ai lati. Il minimo per un polpastrello è
  44px (Apple) / 48 (Google). A 24px si manca, e mancare qui vuol dire o non far
  succedere niente o aprire il pannello dell'ordine: da fuori sembra che la mail
  sia rotta. Ora sotto gli 800px i comandi sono **alti 40px** con 8px di stacco
  (verificato: Email 63×40, nessun bottone sotto i 40). Sul desktop restano
  piccoli: lì si punta col mouse e lo spazio serve per far stare più ordini.
  ⚠️ **Nel dettaglio l'indirizzo email era testo semplice.** Su un telefono è la
  cosa più naturale su cui premere — è scritto lì e sembra un link — e non
  faceva niente. Ora è un bottone (`.come-link`) che apre il modulo già
  compilato; verificato: destinatario e oggetto «Ordine #1736» precompilati.
  La bozza (`bozzaMail`) è stata tirata fuori dall'IIFE dei canali e calcolata
  una volta sola, così la usano sia il bottone «Email» sia l'indirizzo.
  Anche il telefono, che era testo, ora è un `tel:`.
  ⚠️ Nota di metodo: la prima ipotesi (il pop-up non si apre su mobile) era
  sbagliata, e l'ho scartata riproducendo invece di correggere alla cieca. Il
  difetto vero non era nel codice del pop-up ma nella dimensione dei bottoni —
  una cosa che si vede solo misurando i rettangoli su un viewport da telefono.

- **PAGINA UTENTI + REGISTRAZIONE LIBERA CHIUSA** (27/07/2026).
  `/utenti` (voce di sidebar sotto Configurazione): un amministratore apre gli
  account dei colleghi, cambia ruolo, cambia password e toglie l'accesso.
  Libreria `src/lib/utenti.ts` (ruoli, controlli), azioni in
  `src/app/(app)/utenti/actions.ts`.

  ⚠️⚠️ **ERA UN BUCO, NON UNA FEATURE MANCANTE.** `/registrati` era **aperta a
  chiunque**: chi conosceva l'indirizzo dell'app si apriva un account ed entrava
  fra 929 ordini con nomi, indirizzi, telefoni ed email dei clienti, i reclami e
  i rimborsi. Era nata come bootstrap («il primo che si registra è admin, gli
  altri operatori») ma restava aperta per sempre. Ora la registrazione libera
  passa **solo se non esiste NESSUN utente**, per creare il primo
  amministratore; tolto anche il link «Non hai un account? Registrati» dal
  login, che altrimenti invitava a un giro a vuoto.

  ⚠️ **Il controllo del ruolo sta in OGNI server action, non nella pagina.** Una
  server action è un endpoint: nascondere il bottone non impedisce di chiamarla.
  **Verificato costruendo a mano il modulo** che la pagina non mostra
  all'operatore (con l'`$ACTION_ID` preso dall'HTML dell'admin) e inviandolo:
  da operatore l'account NON viene creato, con lo stesso identico modulo da
  admin viene creato. Il controllo vale perché ci sono entrambe le prove — la
  prima volta avevo provato con curl e falliva anche da admin, quindi non
  dimostrava niente: una richiesta malformata non è un cancello che funziona.

  ⚠️ **L'ultimo amministratore non si può togliere né retrocedere**
  (`puoEssereRimosso` / `puoCambiareRuolo`): senza, un clic distratto chiude
  tutti fuori dalla gestione degli account e da dentro l'app non si rientra più.
  **NON verificato end-to-end**: al momento c'è **un solo** amministratore
  (quello vero) e provarlo vorrebbe dire tentare di cancellare l'account del
  titolare su dati veri. Verificati i conteggi su cui la regola si regge
  (`altriAmministratori` esclude l'id giusto, e con un id inesistente torna il
  totale). Da esercitare quando ci saranno due amministratori.
  Verificati invece: **non si può cancellare il proprio account** (rifiutato col
  motivo scritto) e la cancellazione legittima di un operatore.

  ⚠️ La password la scrive l'amministratore e **la comunica a voce**: l'app non
  manda email. Non finisce mai nel messaggio di ritorno, perché quello sta
  nell'URL e da lì passa in cronologia e nei log.

  ⚠️ **PULITO IN PRODUZIONE**: c'era `prova-tipo@local.test` con diritti di
  **amministratore**, avanzo di una sessione precedente. Rimosso insieme ai miei
  account di prova. Resta `diagnostica@deluxy.local` (operatore), che non ho
  creato io: **da decidere se serve** — è un accesso attivo all'app.
  Regola per il futuro: un account di prova su un'app live va cancellato nella
  stessa sessione in cui lo si crea, e mai con ruolo admin.

- **SIMBOLO «C'È IL BIGLIETTO» + SEZIONE BIGLIETTO NEL DETTAGLIO** (27/07/2026).
  Icona a busta oro su ogni ordine che ha una nota del cliente (in scheda e in
  tabella), e nel dettaglio una sezione **Biglietto e note del cliente** col
  testo intero e il tasto **Copia biglietto**.
  Campo nuovo `Ordine.haBiglietto` (solo il sì/no), riempito dal sync da
  `biglietto` di Orders; il TESTO non si copia in locale — lo chiede il
  dettaglio a Orders, come già fa per destinatario e indirizzo.
  Misurato: **77 ordini su 929 (8,3%)** hanno una nota, 76 fra quelli da gestire.

  ⚠️⚠️ **IL CAMPO NON CONTIENE «IL BIGLIETTO»: CONTIENE TUTTO.** Guardati gli
  ordini veri, dentro ci sono — nello stesso testo libero — il messaggio per il
  cartoncino, l'indirizzo completo del destinatario, uno o due numeri di
  telefono, il budget, le specifiche della torta, e in un caso
  «30 Luglio 08/12», dove 08/12 è la FASCIA ORARIA e non l'8 dicembre. Un altro
  ordine dice «20 giugno ore 17-17.30 / Via delle Calasanziane… / +39 389…
  marito per ritiro / BIGLIETTO: …».
  Quindi: **niente estrazione automatica del messaggio**. Sarebbe comodissimo e
  stamperebbe un numero di telefono su un cartoncino, o butterebbe via metà
  messaggio. Si mostra il testo COM'È, in sola lettura, e sotto c'è scritto che
  va riletto prima di girarlo al fornitore. La copia prende tutto: chi taglia è
  una persona che ha letto. È la stessa regola già scritta per consegna e stati
  («meglio non indicato che sbagliato»).
  ⚠️ `haBiglietto` si riscrive SEMPRE nel sync, anche a falso — al contrario
  degli ordinali del cliente: se il cliente toglie la nota il simbolo deve
  spegnersi, mentre un ordinale mancante vuol dire «non calcolato», non «non
  c'è più».
  ⚠️ Per accendere il simbolo sugli ordini già in tabella serve un **sync
  completo** (`POST /api/ordini/sync?completo=1`).
  ⚠️ Il tasto Copia usa lo stesso `copia()` di «Copia messaggio», già in uso in
  produzione. Dal pannello browser nascosto fallisce sempre
  (`NotAllowedError: Document is not focused`) e **non è un bug**: gli appunti
  vogliono la finestra a fuoco. Verificato che il ripiego lo dice
  («seleziona il testo e copialo a mano») invece di tacere.

- **MENU A SCOMPARSA SU MOBILE + ETICHETTA «NUOVO» + CHE CLIENTE È** (27/07/2026).

  **Menu mobile.** Sotto gli 800px il menu non è più una riga orizzontale sopra
  il contenuto (ventidue voci da scorrere di lato, intestazioni dei gruppi
  nascoste, e il tasto che lo spostava fuori lasciando una banda vuota alta come
  prima): ora è un pannello `position: fixed` che scorre da sinistra, chiuso di
  partenza, col velo dietro. Si chiude toccando il velo, con Esc, e **da solo
  quando cambi pagina** (`useEffect` su `usePathname` in `Sidebar.tsx`: al
  cambio di percorso, così copre anche tasto indietro e redirect).
  Stato mobile = `data-menu-aperto` sull'html, **non** salvato: un pannello che
  copre lo schermo e si ritrova aperto domani è una porta lasciata aperta.
  Lo stato desktop (`data-sidebar-chiusa`, in localStorage) è rimasto identico.
  ⚠️ **Nella media query mobile bisogna AZZERARE il collasso desktop**
  (`margin-left/opacity/pointer-events` di `[data-sidebar-chiusa] .sidebar`):
  la preferenza sta sull'html e vale per entrambi gli schermi, quindi chi tiene
  il menu chiuso sul computer si ritroverebbe il pannello invisibile sul telefono.
  ⚠️ **`visibility: hidden` sul pannello chiuso non è estetica**: senza, i 19
  link e il bottone del velo **restano nell'ordine di tabulazione** — misurato,
  `link.focus()` funzionava a pannello chiuso. Il ritardo `visibility 0s linear
  260ms` serve a non farlo sparire di colpo mentre scorre via.
  ⚠️ **NON VERIFICATO**: il ritorno a desktop col pannello aperto. Il browser di
  prova non propaga NESSUN segnale di ridimensionamento — né `resize`, né il
  `change` di matchMedia, né ResizeObserver (provati tutti e tre, zero scatti).
  Il listener su matchMedia in `ToggleSidebar.tsx` è il meccanismo standard e su
  un browser vero scatta, ma qui non si può dimostrare: da riprovare a mano.

  **Etichetta «NUOVO».** Gli ordini comparsi mentre la sessione è aperta si
  accendono con un bollino oro pieno (l'unico pieno della lista, di proposito).
  `src/lib/cliente-valore.ts`: l'istante di apertura sta in **sessionStorage**
  (per scheda — con localStorage riaprendo domani sarebbero «nuovi» tutti quelli
  di ieri sera), e il confronto è su **`creatoIl`**, cioè quando l'ordine è
  comparso DA NOI, non sulla data dell'ordine: al primo scarico entrano insieme
  due mesi di ordini, e con la data sarebbero nuovi tutti quelli di oggi.
  ⚠️ L'istante si legge in un `useEffect`, non nel render: sul server
  sessionStorage non esiste e si avrebbe un errore di idratazione. Finché vale 0,
  `arrivatoAdesso()` torna **falso** — senza quella guardia `t > 0` è vero per
  qualunque data e per un istante si accende tutta la lista.
  Verificato spostando indietro l'inizio sessione: 19 ordini accesi su 928.

  **Che cliente è.** Bollino «Nuovo cliente» / «2° ordine» / «Cliente VIP · N°
  ordine» accanto al tipo cliente, in scheda e in tabella. Campi nuovi
  `Ordine.clienteNumeroOrdine` / `clienteOrdiniPrima`, ricopiati da Orders come
  `clienteTipo` (stessa regola: un null in arrivo non cancella un ordinale noto).
  ⚠️⚠️ **IL CONTO LO FA ORDERS, E NON POTEVA FARLO QUESTA APP.** Misurato: la
  copia locale copre **solo 2 mesi** (928 ordini, 25/05→27/07) contro i ~14.000
  del registro. Contando qui, dei 795 clienti distinti il 91,7% risultava con un
  ordine solo e appena 3 arrivavano a cinque — un cliente che compra ogni Natale
  sarebbe stato «nuovo» ogni Natale. Con gli ordinali di Orders sulla storia
  intera: 845 ordini su 928 hanno il dato, 646 sono primi ordini, e ci sono
  clienti al 20°, 21°, 26° e **33° ordine**. Gli ordini da clienti affezionati
  sono **61 su 845 (7,2%)** — abbastanza rari da voler dire qualcosa.
  ⚠️ **Soglia VIP = dal 4° ordine in su, ed è misurata, non un numero tondo.**
  A cinque ordini l'etichetta sarebbe comparsa su pochissimi; a due su troppi.
  ⚠️ **Quando l'ordinale è `null` non si scrive «nuovo cliente»**: è lo stesso
  errore del voto dato a chi non ha dati (vedi la pagella dei partner). 83
  ordini su 928 sono in questo caso — clienti che Orders non riesce a
  riconoscere — e per loro il bollino semplicemente non c'è.
  ⚠️ Per riempire il campo sugli ordini già in tabella serve **un sync completo**
  (`POST /api/ordini/sync?completo=1`): quello normale guarda solo la finestra
  recente e la prima volta ne aveva aggiornati 26 su 928.

- **DOCUMENTI, BRAND ed ESPORTAZIONE in CS AI** (27/07/2026).
  Tre cose in una: si CARICANO documenti da cui l'AI ricava le istruzioni, ogni
  istruzione può valere per un solo BRAND, e le linee guida si ESPORTANO come
  documento leggibile dalle persone.
  Tabella `DocumentoAI` + campi `IstruzioneAI.negozioId` / `documentoId` /
  `sostituisceId`; librerie `src/lib/documenti-ai.ts` (estrazione) e
  `src/lib/linee-guida.ts` (Markdown + HTML da stampare); rotte
  `/api/cs-ai/documenti` (carica/elenca/elimina), `/api/cs-ai/documenti/proposte`
  (POST propone, PUT salva le scelte) e `/api/cs-ai/esporta?formato=md|html`.
  Si legge PDF, .docx, .txt/.md, .csv, .html fino a 4 MB.
  **Il documento NON entra nel prompt**: da trenta pagine l'AI ricava poche
  regole, ognuna con la CITAZIONE della frase da cui nasce, e una persona spunta
  quali tenere. Le regole salvate ricordano da quale documento vengono.
  Verificato su un manuale finto ma realistico: delle sei sezioni ha preso solo
  le regole di comunicazione, lasciando fuori turni di laboratorio, storia
  dell'azienda e fatturazione.

  ⚠️⚠️ **IL MODELLO DELLE RISPOSTE È `gpt-4o`, NON `gpt-4o-mini` — misurato.**
  Impostazione dedicata `openaiModelloRisposte`, default `MODELLO_RISPOSTE_DEFAULT`
  in `src/lib/ai.ts`. `openaiModello` resta mini per il resto (estrazione IBAN).
  Su 6 chiamate identiche per condizione, con **mini**: brand Cake firma giusta
  **0/6**, brand Flowers **0/6**, senza brand 5/6. Con **4o**: Cake 6/6, Flowers
  6/6, senza brand 6/6, oggetto 6/6, **mai** la firma di un marchio sbagliato.
  Ci ho girato attorno per cinque riscritture del prompt — brand in testa, brand
  in coda, gerarchie scritte in maiuscolo, identità nel messaggio di sistema — e
  nessuna cambiava il risultato. **Non era il prompt: era il modello.**
  Regola operativa: prima di riscrivere un prompt per la sesta volta, misura su
  N chiamate e prova il modello grande. Una chiamata sola non dice niente: le
  risposte oscillano fra chiamate identiche, e ci ho creduto due volte.

  ⚠️ **Le istruzioni vanno scritte come ORDINI, non come descrizioni.**
  «Chiudi ogni mail con…» attecchisce, «ci si firma sempre…» viene ignorata: il
  modello legge una descrizione come un'informazione sull'azienda, non come una
  cosa da fare. Vale anche per l'estrazione dai documenti — il prompt di
  `ricavaIstruzioni` ordina esplicitamente di trasformare il raccontato in
  comandi, perché i manuali aziendali sono scritti al descrittivo. Le 6
  istruzioni di partenza sono state riscritte all'imperativo per lo stesso
  motivo (e le righe già in tabella migrate una tantum).

  ⚠️ **La firma di partenza non nomina più «Deluxy» ma «il negozio per cui stai
  scrivendo»**: in un gruppo con più marchi una firma fissa è una firma che
  sparisce — col brand impostato, il modello preferiva non firmare piuttosto che
  firmare col nome di un altro.

  ⚠️ **`sostituisceId`: una regola di brand può mandare in pensione una regola
  generale.** Serve quando le due si contraddicono (firma Deluxy contro firma
  Cake Design): la generale non viene proprio mandata all'AI. Con `gpt-4o` il
  conflitto si risolve bene anche senza — il 6/6 è stato ottenuto SENZA
  collegamento — ma il campo resta come valvola di sicurezza e rende la scelta
  visibile invece che affidata al modello. Nel documento esportato la regola
  sostituita si vede **barrata**, con scritto da cosa è rimpiazzata: toglierla
  farebbe sparire una regola che per gli altri brand vale, lasciarla muta
  farebbe credere che l'AI la legga.

  ⚠️ **`serverExternalPackages: ['pdf-parse', 'mammoth']` in `next.config.ts` non
  è facoltativo**: impacchettato da Next, pdf-parse fallisce su OGNI pdf con
  «Object.defineProperty called on non-object». In uno script node di prova non
  si vede — lì il pacchetto è già esterno — quindi il caricamento va provato
  passando dall'app.

  ⚠️ Un PDF **scansionato** non contiene testo: viene respinto dicendolo
  («è un'immagine, serve l'originale o l'OCR») invece di salvare un documento
  vuoto da cui non si ricava niente. Verificato, insieme al rifiuto dei formati
  non letti (.png, .doc vecchio, file Apple) e del file mancante.
  L'elenco dei documenti NON rilegge i testi: estratto e lunghezza li calcola
  Postgres con `left()`/`length()`, altrimenti dieci manuali sarebbero megabyte
  per disegnare dieci righe di tabella.

- SEZIONE **CS AI** — le istruzioni con cui l'AI parla ai clienti (26/07/2026).
  Tabella `IstruzioneAI`, libreria `src/lib/cs-ai.ts`, pagina `/cs-ai`, rotte
  `/api/cs-ai` (CRUD), `/api/cs-ai/iniziali` (6 istruzioni di partenza, non
  duplicano) e `/api/cs-ai/anteprima` (il blocco esatto che finisce nel prompt).
  **Sono il COME, non il cosa**: i testi da mandare restano gli Script. Ogni
  istruzione ha un `ambito` — sempre / solo chat / solo email — perché a una chat
  e a una mail si scrive in modo diverso.
  ⚠️ **DUE LIVELLI: i PALETTI restano nel codice.** Cinque regole (non inventare
  dati, non promettere rimborsi o date, non spacciare decisioni non prese, tacere
  se non si sa) stanno in `PALETTI` e **non si cancellano dall'interfaccia**: se
  fossero righe modificabili basterebbe toglierne una perché l'AI cominci a
  promettere cose mai decise, e nessuno se ne accorgerebbe finché un cliente non
  ci tiene per la parola. Le istruzioni scritte si AGGIUNGONO, e il prompt dichiara
  che in caso di conflitto vincono i paletti.
  ⚠️⚠️ **DOVE VANNO LE ISTRUZIONI NEL PROMPT — misurato, non supposto.** Con
  `gpt-4o-mini` metterle nel **messaggio di sistema NON funziona**: il modello
  restituiva lo script IDENTICO e un'istruzione di prova («chiudi sempre con —
  Reparto Fiori, Deluxy») non compariva mai. Funziona mettendole nel **messaggio
  utente, per ultime**, subito prima di «ora scrivi la risposta». Contava anche la
  `description` del campo `risposta` nello schema JSON: diceva «lo script adattato
  al messaggio (nome, numero ordine, data)», un elenco chiuso che il modello
  prendeva come l'unica libertà concessa — ora dice che il testo si RISCRIVE.
  VERIFICATO con l'AI vera, nei due versi: con l'istruzione di prova attiva la
  risposta finisce con «— Reparto Fiori, Deluxy»; cancellata l'istruzione, la
  firma sparisce. E in contesto **email** la risposta si chiude con «Un cordiale
  saluto…» (istruzione solo-email) mentre in chat no: il filtro per ambito regge
  end-to-end. Logica pura provata a parte: i 5 paletti sempre presenti, le regole
  solo-chat fuori dal prompt mail e viceversa, nessuna sezione vuota senza
  istruzioni.
  `suggerisciRisposta(messaggio, script, contesto)` ha il terzo parametro
  ('chat' | 'email', default 'chat'); `/api/script/suggerisci` lo accetta nel body.
  ⚠️ **DEBITO DA SANARE**: `prisma generate` non è potuto girare (il `.dll` è
  bloccato dal dev server dell'altra sessione, PID sulla porta 3140). Ho aggirato
  generando in una cartella temporanea e copiando tutto tranne il motore — i tipi
  sono giusti, typecheck e build passano, il DB risponde. **Effetto collaterale**:
  il client non carica più `.env` da solo negli script `node` (Next e Vercel lo
  caricano, quindi app e produzione non sono toccate). Al primo momento in cui la
  cartella è libera, rilanciare `npx prisma generate` per rimettere le cose a posto.

- SCRIPT RICHIAMABILI DAL POP-UP DI POSTA (26/07/2026). Dentro il modulo della
  mail c'è **«Usa uno script»**: si cerca fra le risposte pronte e si clicca —
  il testo entra nel messaggio **dove sta il cursore** (o in fondo, se il riquadro
  non è stato toccato). `POST /api/script/[id]/usato` incrementa `usi`, come fa
  già l'AI in `/api/script/suggerisci`: se contasse solo l'AI, l'ordinamento «i
  più usati in cima» racconterebbe le sue abitudini e non quelle di chi lavora.
  ⚠️ **IL SALUTO NON DEVE USCIRE DOPPIO.** Ogni script comincia con «Buongiorno,»
  e il corpo della mail ce l'ha già («Buongiorno Shontelle, le scriviamo…»).
  `src/lib/script-testo.ts` toglie il saluto allo script SOLO se il testo che lo
  precede ne ha già uno, e rimette la maiuscola. Riconosce pochi saluti in testa
  alla frase (buongiorno/buonasera/salve/ciao/gentile…/hello/bonjour/…): meglio
  lasciare un saluto doppio che tagliare una parola che serviva.
  Con una SELEZIONE attiva si sostituisce **in linea**; con il solo cursore lo
  script diventa un **paragrafo a sé**, e le righe vuote non si accumulano.
  ⚠️ **BUG TROVATO IN VERIFICA, il caso più comune di tutti**: un riquadro di testo
  mai cliccato riporta `selectionStart = 0`, indistinguibile da «cursore
  all'inizio». Chi apriva il pop-up e prendeva subito uno script se lo vedeva
  infilato PRIMA del saluto, col «Buongiorno» doppio. Ora la posizione si RICORDA
  (`cursore` in `ComponiMail`) e vale solo se il riquadro è a fuoco o è già stato
  usato; altrimenti si aggiunge in fondo.
  VERIFICATO in pagina: aprendo il pop-up e prendendo subito «Ritardo nella
  consegna» → **un solo «Buongiorno»**, script come paragrafo dopo l'apertura,
  elenco che si chiude, `usi` che cresce, ricerca che filtra («fattura» → 1
  script, «consegna» → 2, testo inesistente → «Nessuno script per «…»»).
  I contatori `usi` gonfiati dai miei clic sono stati riazzerati.

- POP-UP DI POSTA: LA MAIL SI SCRIVE E SI MANDA DA QUI (26/07/2026).
  Il bottone **Email** non è più un link `mailto:` ma apre `ComponiMail.tsx`:
  Da (casella aziendale) · A · Oggetto · Messaggio, già scritti nella lingua del
  cliente, e **Invia**. Rotte nuove: `POST /api/email/invia` e
  `GET /api/caselle` (che espone solo indirizzo/nome/predefinita — password, host
  e porte restano lato server).
  PERCHÉ: `mailto:` dipende dal programma di posta del computer — dove non è
  configurato non succede niente, e dove lo è la mail parte da un indirizzo
  personale, fuori da quest'app e senza lasciare traccia. Ora esce da
  `cs@deluxy.it` via SMTP e **viene registrata in Inbox** come conversazione
  email (stesse convenzioni del sync: canale `email`, `idEsterno` = indirizzo).
  ⚠️ **L'HANDOFF DICEVA IL FALSO**: «SMTP risponde 535 authentication rejected».
  Provato con `provaCasella()` sulla casella vera: **«Invio e ricezione funzionano
  per cs@deluxy.it»**. Il 535 è rientrato, la nota era vecchia. `inviaEmail()`
  esisteva già in `src/lib/email.ts`: mancava solo la rotta per una mail NUOVA
  (prima si potevano solo mandare risposte dentro un thread).
  ⚠️ **DIFETTO TROVATO E CORRETTO**: `casellaPerId()` ripiega da sé sulla
  predefinita, quindi un `casellaId` inesistente faceva partire la mail **da un
  altro indirizzo senza dirlo**. Ora se l'id è indicato esplicitamente e non
  esiste si rifiuta (400): una mail a nome di qualcun altro non è un ripiego
  accettabile.
  VERIFICATO: rifiutati prima di toccare l'SMTP → destinatario mancante, non
  valido, senza dominio, corpo vuoto, casella inesistente. Pop-up su #1731: Da
  `cs@deluxy.it`, A precompilato, oggetto «Ordine #1731», testo nella lingua del
  cliente, Esc chiude, `mailto:` **non compare più** in pagina.
  ⚠️ **NON ho premuto Invia su un cliente vero** (sarebbe una mail a una persona
  reale). Da provare a mano: l'unica cosa non verificata è l'invio vero dal
  pop-up. Il percorso SMTP però è provato da `provaCasella` (autenticazione ok).
  ⚠️ **INCIDENTE DEL MIO TEST**: un caso di prova con destinatario e testo validi
  ha **inviato davvero** una mail «ciao» a `x@esempio.it`. Traccia rimossa dal
  database (conversazioni email tornate a 0). Lezione: nei test su una rotta che
  invia, i casi devono essere **non spedibili per costruzione** (indirizzo o corpo
  non validi), non «probabilmente innocui».

- CANALI DI CONTATTO A SCELTA (26/07/2026). Il bottone «Contatta» sceglieva da
  solo: WhatsApp se c'era un numero, la mail altrimenti. Non è una gerarchia
  vera — a chi ha appena scritto una mail si risponde per mail, un ritardo
  grave si dice al telefono — quindi ora si mostra **un bottone per ogni canale
  che quel cliente ha davvero**: WhatsApp, Chiama, Email. Senza recapiti resta
  scritto «Nessun recapito» col motivo.
  Vale in tutti e tre i posti: schede, tabella e pannello di dettaglio
  (`canaliContatto()` in OrdiniLista, stessa logica nel dettaglio).
  La telefonata usa un link `tel:` col numero come è scritto (il + conta) e **non porta
  nessun testo**: il messaggio precompilato lì non serve. WhatsApp e mail
  restano nella lingua del cliente e non partono da soli.

- DETTAGLIO: MITTENTE, DESTINATARIO E INDIRIZZO DI CONSEGNA (26/07/2026).
  Nel pannello di un ordine ora si distinguono **chi ordina** (mittente, coi suoi
  recapiti) e **chi riceve** (destinatario), con l'indirizzo di consegna
  completo di CAP, provincia e paese. Quando sono la stessa persona lo dice.
  ⚠️ **Il destinatario NON è in casa**: qui l'ordine tiene i dati di chi compra.
  Arriva da Orders (campo spedizione di GET /api/v1/ordini) nella stessa chiamata
  che già portava le righe e le foto — nessuna copia locale, regola 2 dell'app.
  Verificato su #1733: in casa il campo indirizzo è VUOTO e la città «Florence», da
  Orders arriva «11 Campbell Avenue… IG6 1EA ENG GB». Quindi questa aggiunta
  non è solo un'etichetta in più: prima l'indirizzo di consegna su quegli
  ordini non si vedeva proprio.
  Se Orders non risponde si mostra l'indirizzo della copia locale, dicendo che
  è senza CAP e provincia.

- ORDINI APERTI / ORDINI GLOBALI (26/07/2026): la lista degli ordini ora è due
  pagine, stessa tabella (`OrdiniLista` con prop `modalita`):
  · **/** «Ordini aperti» — la lista di LAVORO: non gestiti, e **senza gli
    ordini con un rimborso vivo** (stato richiesto o approvato). Da quando si
    apre un rimborso quell'ordine si lavora in /rimborsi, e lasciarlo qui vuol
    dire che prima o poi qualcuno lo rilavora per sbaglio. Rifiutato o
    annullato → l'ordine torna nella lista.
  · **/ordini-globali** «Ordini globali» — l'archivio intero, gestiti e
    rimborsati compresi, con la ricerca. Parte dalla vista a tabella perché qui
    si cerca, non si lavora.
  Il filtro sta nell'API (`GET /api/ordini?rimborsi=nascondi`), non nel client:
  così il conteggio e l'elenco non possono divergere. Il rimborso esclude
  **sia per id sia per numero**, perché l'ordine può vivere solo nell'archivio
  di Orders.
  Verificato sui dati veri: aperti 906 → **905** (sparisce #2585, rimborso
  «richiesto»), globali **923**; l'ordine esiste ancora ed è `da_gestire`.

- URGENTI IN CIMA, PAGINA COMPATTA, COPIA FOTO (26/07/2026).
  **ORDINE PER URGENZA A FASCE** (`src/lib/urgenza.ts` + `ordiniPerUrgenza()` in
  `/api/ordini`): oggi (per fascia oraria, prima chi va consegnato presto) →
  domani e oltre (per data) → scadute da ≤3 giorni (dalla più recente) → senza
  data (dalle più recenti) → **scadute da tempo per ultime**.
  ⚠️ NON si ordina per «consegna più vecchia prima», che sarebbe l'ovvio: misurato
  sui dati veri, fra i non gestiti **578 hanno la consegna già passata** (fino a
  due mesi indietro) e quelli di **oggi sono 8** — perché `gestione` è recente e
  nessuno ha spuntato gli ordini vecchi. Ordinando per data il lavoro di oggi
  finiva sotto 578 righe di archeologia.
  ⚠️ Si ordina LATO SERVER perché l'elenco è tagliato a 200: ordinando nel browser
  si ordinerebbero i 200 più recenti, e un ordine da consegnare oggi ma ricevuto
  tre settimane fa non entrerebbe. Sono 5 query, una per fascia, che si fermano al
  tetto. Verificato: gli 8 di oggi in cima nell'ordine 08-12 → 18-20, poi +1gg,
  +2gg…
  In testa: pillole **«8 da consegnare oggi»**, «7 domani», «28 scadute di
  recente», contate sul filtro in corso.
  **SPAZIO**: primo ordine da ~430px a **344px**, scheda da 237 a **166px**
  (−30%), **con tutti i bottoni al loro posto**. Come: testa in una riga sola (il
  dettaglio della catena Shopify → Ordini → qui è nel `title` del pallino);
  azioni con etichette corte ("Paga", "Contatta") e cornice più stretta (gap 4px,
  padding 2×8, font 12px), che porta i 6-7 bottoni da tre righe a due — il blocco
  azioni scende da 97px a 56px. Tolta anche la data dell'ORDINE dalla scheda
  (quella che serve a chi lavora è la consegna, due righe sopra): faceva andare i
  badge a capo, 27px per scheda.
  ⚠️ **ERRORE MIO, CORRETTO**: in un primo giro avevo lasciato sulla scheda solo
  Contatta e Gestito, spostando le altre nel dettaglio. Sono azioni fondamentali e
  vanno tenute tutte: lo spazio si prende dalla cornice dei bottoni, non dal loro
  numero. Stringendola si ottiene **lo stesso risparmio** (166px contro i 167 che
  avevo ottenuto togliendole) senza perdere niente. Le azioni ci sono comunque
  anche nel dettaglio, che è utile a chi ci arriva da lì.
  **COPIA FOTO** (`copiaFoto` in `DettaglioOrdine.tsx`), accanto a Scarica.
  Due vincoli del browser da cui nasce il giro: negli appunti si può mettere
  **solo PNG** (`ClipboardItem` con image/jpeg viene rifiutato), e il canvas si
  sporca con un'immagine di un altro dominio — quindi la foto si carica dalla
  NOSTRA rotta `/api/immagine` (stessa origine) e si riesporta in PNG su canvas,
  con sfondo bianco perché un PNG trasparente incollato in chat diventa nero.
  VERIFICATO fin dove si può da qui: foto scaricata dalla nostra rotta (352 KB),
  canvas **non** sporcato, PNG prodotto (453 KB), `ClipboardItem` presente.
  ⚠️ **La scrittura negli appunti NON è verificata**: da questa sessione il
  pannello del browser non è in primo piano e Chrome risponde `NotAllowedError:
  Document is not focused`. Con un clic vero della persona la finestra è a fuoco,
  quindi dovrebbe funzionare — **da provare a mano**. Se fallisse, il messaggio
  distingue i casi (finestra non a fuoco / browser che non sa copiare / permesso
  negato) invece di dare una spiegazione sola e sbagliata.

- DETTAGLIO ORDINE CON FOTO E MESSAGGIO PER IL FORNITORE (26/07/2026).
  Cliccando **un punto qualsiasi** della scheda (o della riga in tabella) si apre
  `DettaglioOrdine`: foto grande del prodotto, **Scarica foto**, e il messaggio
  già scritto «Per mercoledì 29 luglio possibile questo prodotto con ritiro
  15-19?» da copiare. La riga delle azioni fa `stopPropagation`, altrimenti
  premere *Reclamo* aprirebbe anche il pannello; `role=button` + Invio/Spazio +
  Esc per chiudere.
  RITIRO = **fascia di consegna meno un'ora** (`src/lib/ritiro.ts`): il valet deve
  avere il prodotto prima di partire. 16-20 → 15-19. Una fascia di forma diversa
  da HH-HH, o che comincia a mezzanotte (un'ora prima sarebbe il giorno prima),
  diventa «ritiro da concordare»: a un fornitore non si manda un orario inventato.
  Il messaggio è in ITALIANO anche se il cliente è straniero — qui il destinatario
  è un fornitore, che è un partner italiano (la lingua del cliente è un'altra
  cosa, vedi `src/lib/lingua.ts`).
  LE FOTO VENGONO DA ORDERS: `RigaOrdine.immagine` c'era già ma l'API non la
  esponeva — aggiunta in `serializzaOrdine` (**lato Orders, pubblicato**). Il
  Customer Service NON tiene copia delle righe: le chiede a
  `righeOrdineDaOrders()` quando si apre il dettaglio.
  ⚠️ L'ordine si riconosce dal **gid Shopify**, non dal nome del negozio: `#1733`
  esiste sia su Cake sia su Deluxy, e col match sul brand il pannello diceva «il
  numero esiste su più negozi». Il gid è la stessa chiave con cui il sync fa
  l'upsert, quindi è esatta.
  ⚠️ `/api/immagine` è un proxy con **lista bianca obbligatoria**
  (`cdn.shopify.com`, https): serve perché il browser ignora `download` sui link
  cross-origin, ma una rotta che scarica un URL arbitrario è un proxy aperto verso
  la rete interna. VERIFICATO che respinge 169.254.169.254 (metadata AWS),
  localhost, 192.168.1.1, host estranei, http su host ammesso e URL malformati;
  e che ciò che torna sia davvero `image/*`.
  Copertura reale: negli ultimi 60 giorni **730 ordini su 892 hanno almeno una
  foto** (80% delle righe). Chi non l'ha mostra «nessuna foto».
  Verificato in pagina su #1733: foto 1108×1108, le 4 personalizzazioni del
  prodotto (Numeri: 30, Base, Ingredienti, Topping), messaggio col ritiro 15-19,
  Esc chiude, e premere *Gestito ✓* non apre il pannello.

- «PAGA FORNITORE» + SI SCRIVE AL CLIENTE NELLA SUA LINGUA (26/07/2026).
  Il bottone «Richiedi pagamento» è ora **Paga fornitore** (scheda e tabella), e
  la pagina di arrivo diceva una cosa sbagliata — «le coordinate su cui **farsi
  pagare**» — mentre sono le coordinate del fornitore **da pagare**: corretta.
  LINGUA: `src/lib/lingua.ts` decide in che lingua aprire il messaggio al cliente
  (it/en/fr/es/de) e `linkContatto()` la usa per testo e oggetto; il titolo del
  bottone dice **quale lingua e perché**.
  ⚠️ **IL SEGNALE È CHI COMPRA, NON DOVE VANNO I FIORI.** Qui si vende regalo:
  `paese` è quello di SPEDIZIONE, cioè il destinatario, mentre il messaggio va al
  CLIENTE. Prima avevo messo il paese per primo: sbagliato in entrambi i versi —
  italiano a un londinese che manda a Milano, francese a un italiano che manda a
  Parigi. Ordine corretto: (1) prefisso del suo telefono, (2) dominio della sua
  email, (3) **se il prefisso è estero ma fuori tabella si ferma qui in inglese**
  (altrimenti a un cliente di Dubai che spedisce a Parigi si scriverebbe in
  francese — caso vero, ordine #2378), (4) paese di spedizione, (5) numero senza
  prefisso di forma italiana, (6) niente del tutto → **italiano**, perché 3
  ordini su 4 spediscono in Italia: rispondere inglese a un italiano solo perché
  manca il suo numero è scommettere contro i propri dati.
  Svizzera, Belgio e Canada NON sono in tabella di proposito: da un indirizzo non
  si sa se a Berna si parli tedesco o francese.
  Campo nuovo `Ordine.paese` (ISO 2 lettere) da `spedizione.paese` di Orders.
  VERIFICATO sui 922 ordini veri: italiano 69%, inglese 26%, francese 3%, tedesco
  1%, spagnolo 1% — coerente col 75% di spedizioni in Italia. Casi provati:
  #12572 spedisce in IT ma il cliente ha un +43 → **tedesco**; #2378 (+971 → FR)
  e #2377 (+41 → FR) → inglese; `07534…` (mobile UK senza +44) con spedizione GB
  → inglese. In pagina: Emma Baker → «Hello Emma, we are writing about your order
  #1733.», gli altri in italiano.
  Il messaggio **non parte da solo**: wa.me e mailto lo precompilano, l'operatore
  lo rilegge e può cambiarlo — è la rete di sicurezza di tutte queste deduzioni.

- FORNITORE: PERCHÉ CHIEDE LA PASSWORD, E ORA LO DICE (26/07/2026).
  Diagnosi di `search-deluxy.vercel.app/?brand=…&ordine=…` che chiedeva il login:
  **non è un guasto**, è il link NON firmato. Quell'app si apre senza password
  solo con un codice monouso `?t=<code>` (schema authorization-code: `POST
  /api/link` con `x-api-key: dlxs_…` → codice valido 5 minuti → il browser lo
  scambia con `GET /api/link?code=` per una sessione di 1 ora; vedi
  `deluxy-search-supplier/api/link.js` sul branch **main**).
  CAUSA VERA: in questa app `searchApiKey` **non è impostata** (verificato sulla
  tabella `Impostazione`), quindi `linkFornitore()` ripiega sul link semplice.
  I campi ci sono già in Impostazioni → Ricerca fornitori.
  **PER SISTEMARLO SERVE UNA PERSONA**: la chiave si crea SOLO da amministratore
  dell'app Ricerca fornitori (`POST /api/chiavi {azione:'crea'}`, che risponde
  403 a chi non è admin) e va incollata qui. Non è una cosa che si possa fare da
  codice.
  CORRETTO NEL FRATTEMPO il difetto nostro: il bottone ripiegava **in silenzio**,
  e l'operatore si trovava davanti a un login senza sapere perché. Ora
  `linkFornitore()` torna una `nota` anche nel caso «chiave assente», e
  `apriFornitore()` la mostra in pagina. Verificato: l'API risponde
  `firmato:false` con l'URL identico a quello che l'utente aveva aperto, e
  premendo *Fornitore* compare l'avviso con l'istruzione.

- DATA E FASCIA DI CONSEGNA IN ELENCO (26/07/2026): sulla scheda dell'ordine una
  riga sotto il cliente, e in tabella la colonna **Consegna**. I campi
  (`dataConsegna`, `fasciaConsegna`) c'erano già da Orders e li usava solo il
  calendario. Sui dati veri: 618 ordini su 922 hanno la data, 633 la fascia.
  ⚠️ **LA FASCIA SI SCRIVE SEMPRE CON «ore» DAVANTI** (`fasciaLeggibile`):
  da Orders arriva come `"08-12"`, che accanto a una data si legge come **8
  dicembre** — è l'equivoco già costato (vedi la regola «non dedurre dati
  critici»). `"08-12"` → «ore 8–12». Una fascia di forma diversa da HH-HH si
  mostra **così com'è**, senza interpretarla.
  `consegnaLeggibile` dice «consegna OGGI» (rosso), «domani» (oro), «scaduta da N
  giorni» (rosso) o la data con il giorno della settimana. Se manca il giorno ma
  c'è la fascia: «consegna ore 12–16, giorno non indicato»; se non c'è niente:
  «consegna non indicata» — mai riempita a caso.
  Verificato sui 200 ordini in pagina: tutti e cinque i casi resi correttamente.

- LA REGOLA «GLI ORDINI LI SCARICA SOLO ORDERS» È ORA IMPOSSIBILE DA VIOLARE
  (26/07/2026). Il codice per prendere gli ordini da Shopify era ancora qui,
  inerte ma pronto: `src/lib/shopify.ts` con `scaricaOrdini()` e `risolviToken()`,
  `tokenPerNegozio()`/`negoziAttivi()` in `negozi.ts`, e la pagina `/negozi` che
  **chiedeva e cifrava credenziali Admin di Shopify** che nessuno leggeva.
  Verificato prima di togliere: `scaricaOrdini`, `verificaStore`, `tokenPerNegozio`
  e `negoziAttivi` non erano chiamati da nessuno.
  Ora `src/lib/shopify.ts` è **cancellato**, le credenziali non si chiedono né si
  salvano più, e la regola è scritta in testa a `src/lib/negozi.ts`. Motivo:
  due sorgenti per lo stesso ordine vorrebbero dire due verità, con
  classificazioni diverse a seconda dell'app che si guarda.
  Le colonne `token`/`clientId`/`clientSecret` restano sulla tabella coi valori
  storici — **non le legge più nessuno**. Se si vogliono azzerare quei segreti,
  è una cancellazione di dati e va chiesta prima.

- ORDINI VISIBILMENTE AGGIORNATI, E DAVVERO OGNI 15 MINUTI (26/07/2026).
  ⚠️ **LA CATENA ERA ROTTA A MONTE**: questo cron gira ogni quarto d'ora, ma
  **Orders scaricava da Shopify una volta al giorno (06:00)** — quindi si
  interrogava una fonte ferma e un ordine delle 10:00 compariva qui il mattino
  dopo. Non si poteva nemmeno sospettare: la pagina scriveva «aggiornati 3 minuti
  fa», che era vero e inutile.
  Corretto in `deluxy-orders/vercel.json`: due giri, `*/15 * * * *` su
  `/api/cron/sync?giorni=2` (gli ordini NUOVI in fretta) più la passata piena a
  90 giorni una volta al giorno (rimborsi, annullamenti, evasioni: cose che
  cambiano DOPO e che il giro veloce non guarda). I feedback restano sul giro
  lento — sono una chiamata a un'altra app e un reclamo non si aspetta come un
  ordine. Il parametro `giorni` è letto dalla rotta (max 365, default 90).
  In pagina, al posto della scritta grigia c'è la **barra della catena**
  (`.catena-sync`): pallino verde che pulsa se il giro è vivo, «Ordini aggiornati
  N minuti fa», «Ordini ha scaricato da Shopify N minuti fa» — quest'ultimo da
  `ultimoImportOrders()` che legge `ultimoImport`, campo nuovo di
  `GET /api/v1/health` di Orders (pubblico, è un orario) — e «questa pagina si
  rilegge da sola». Il pulsante è diventato «Aggiorna adesso».
  DUE ALLARMI, perché un elenco fermo e un elenco senza novità si vedono uguali:
  pallino rosso + avviso se l'ultimo giro è **fallito** (`ordiniSyncEsito` che non
  inizia per "ok") o se non si aggiorna **da più di un'ora** (quattro giri
  mancati di fila non sono un ritardo, sono un guasto).
  L'elenco si **rilegge da solo ogni 60 secondi** (non 15 minuti: i giri del cron
  non sono allineati a quando apri la pagina, quindi con un solo controllo ogni
  quarto d'ora un ordine appena arrivato potrebbe aspettarne quasi trenta). Si
  **ferma a scheda nascosta** e rilegge appena torna in primo piano.
  VERIFICATO: barra con i tre orari veri; scheda nascosta → 0 letture, ritorno in
  primo piano → 1 lettura subito; simulando 3 ore di fermo → pallino `fermo` +
  avviso; simulando un giro fallito → avviso con il messaggio d'errore; stato
  normale → nessun avviso. `ultimoImport` in produzione risponde davvero.
  ⚠️ DA CONTROLLARE FRA UN GIRO: che il cron `*/15` di Orders parta **da solo**
  (si vede da `ultimoImport` che avanza). Vercel registra i cron al deploy.

- RIMBORSI: BOTTONE SULL'ORDINE + REGISTRO (26/07/2026): da ogni ordine (scheda e
  tabella) il pulsante **Rimborso** apre `/rimborsi` col modulo già pieno
  (ordine, cliente, recapiti, **totale** e **stato del pagamento**). Tabella
  `Rimborso`, `src/lib/rimborsi.ts`, API `/api/rimborsi` e
  `/api/rimborsi/[id]/stato`, pagina + voce di menu.
  Flusso: **richiesto → approvato → rimborsato** (oppure rifiutato/annullato).
  ⚠️ **QUEST'APP NON RIMBORSA.** Registra la richiesta e la decisione; i soldi li
  muove una persona su Shopify o in banca e poi si segna «rimborsato». È la
  regola del repo (nessuna app Deluxy paga per conto proprio, vedi
  deluxy-transactions): **non aggiungere qui una chiamata che sposta denaro** —
  semmai si instrada a Transactions.
  I PALETTI, verificati contro l'API vera sull'ordine #1729 da 64 €:
  · non si rende più di quanto incassato → 64,01 rifiutato;
  · il tetto è **cumulativo** sulle altre richieste dello stesso ordine → 40 ok,
    poi 25 rifiutato («al massimo 24,00 €»), 24 ok, poi anche 1 € rifiutato
    («già chiesto o reso l'intero importo»);
  · importo 0 / negativo / NaN rifiutati; **motivo obbligatorio** (un rimborso
    senza motivo scritto è indifendibile dopo); ordine obbligatorio;
  · rifiutato e annullato **non impegnano** denaro: dopo un rifiuto si può
    richiedere di nuovo l'intero importo (verificato);
  · «rimborsato» **esige l'esito scritto** (400 senza), stato inventato → 400.
  I confronti sono in **centesimi interi**, non in float: con 66,66 già impegnati
  su 100, chiedere 33,34 deve passare — in virgola mobile il residuo risulta
  negativo e verrebbe rifiutato un rimborso legittimo (provato).
  AVVISI (non bloccano, informano) da `avvisoPagamento(statoPagamento)`: REFUNDED
  «già rimborsato per intero», PARTIALLY_REFUNDED, VOIDED «pagamento stornato»,
  PENDING «non ancora incassato», vuoto «stato sconosciuto». Sui dati veri
  servono davvero: 16 REFUNDED, 11 PARTIALLY_REFUNDED, 11 VOIDED, 5 PENDING.
  KPI: da approvare, approvati da pagare, **promesso e non ancora uscito** (somma
  di richiesti+approvati: un eseguito non ci conta, verificato) e rimborsato.
  MANCA: legare la richiesta al reclamo da cui nasce (il campo `reclamoId` c'è ed
  è accettato dall'API, ma non c'è ancora il pulsante dal reclamo), e l'invio a
  deluxy-transactions per l'uscita vera.

- TIPO DI CLIENTE SUGLI ORDINI (26/07/2026): ogni ordine mostra **da che tipo di
  cliente arriva** — privato, azienda, hotel/ristorante, eventi, rivenditore.
  Il dato **viene da Orders, non si calcola qui**: campi nuovi `Ordine.clienteTipo`
  e `clienteTipoDa` (copia riscritta a ogni sync), letti da `cliente.tipo`/`tipoDa`
  di `GET /api/v1/ordini`. Nomi e colori in `src/lib/clienti-tipo.ts` — solo
  presentazione: la classificazione resta di Orders, e un valore sconosciuto si
  mostra grezzo invece di sparire.
  In pagina: bollino su ogni scheda e colonna in tabella, filtro «Tipo cliente»
  (con *Tipo non rilevato* per gli ordini senza recapiti) e la riga «Da che
  clienti: …» coi conteggi cliccabili, da `perTipoCliente` in `/api/ordini`.
  ⚠️ **LATO ORDERS SERVE IL DEPLOY**: l'esposizione del campo è in
  `deluxy-orders/src/lib/tipologia-cliente.ts` + `serializzaOrdine` + la rotta
  `/api/v1/ordini`, ma **finché Orders non è pubblicato** la produzione risponde
  senza `cliente.tipo` e il sync scrive vuoto. Verificato in locale contro Orders
  vero: 894 ordini su 917 marcati, distribuzione reale **858 privato, 3 azienda,
  1 horeca, 32 non rilevati**; filtro «Azienda» → i 3 giusti (Recarlo Spa,
  Chatwin SRL, Eightstone Pte Ltd), «Tipo non rilevato» → 54.
  NOTA SUL DATO: la deduzione guarda il NOME DELL'ACQUIRENTE, e su Shopify quello
  è quasi sempre una persona anche quando compra un'azienda — perciò il B2B
  risulta sottostimato. Non è un errore del codice: si corregge caso per caso in
  Orders (tag manuale sul cliente), e da lì arriva qui col sync.
- CORRETTO «Scarico non riuscito.» SUL PULSANTE AGGIORNA (26/07/2026):
  `/api/ordini/sync` chiamava `sincronizzaOrdini({completo})` e `contatti` ha
  come default **true**, quindi il pulsante salvava anche la rubrica Google:
  ~218 secondi misurati (40 chiamate alla People API) contro `maxDuration = 60`.
  La funzione veniva uccisa, Vercel rispondeva 504 con una pagina non-JSON e il
  client — che fa `res.json().catch(() => ({}))` — restava senza campo `errore`,
  mostrando il messaggio generico. Per lo stesso motivo l'errore non finiva
  nemmeno in `ordiniSyncEsito`: `annotaSync` non faceva in tempo a girare.
  Ora passa `contatti: false`: i contatti li salva il cron dedicato
  (`/api/cron/contatti`, ogni ora, maxDuration 300) o il pulsante «Salva tutti i
  contatti». È la stessa correzione già applicata al cron dei 15 minuti, che sul
  pulsante era rimasta indietro. Verificato: **200 in 7,3s**, 36 ordini, 2 nuovi.

- API A CHIAVE PER LE ALTRE APP (26/07/2026): `GET /api/v1/feedback` espone in
  **sola lettura** i reclami e i voti legati a un ordine, per il registro ordini
  (deluxy-orders), che li mostra sulla scheda dell'ordine. Nuovi: `model ApiKey`
  (nel DB solo lo SHA-256), `src/lib/api-auth.ts`, `scripts/crea-chiave.mjs`
  (`npm run chiave -- <app>`), e in `middleware.ts` il ramo che lascia passare
  `/api/v1/*` — si autentica da sé (standard Deluxy §4.3) — con gli header CORS.
  Chiave già creata per **deluxy-orders**.
  Due scelte da non ribaltare per sbaglio: (a) **niente scrittura**, un reclamo
  si apre e si chiude qui, dove c'è chi ha parlato col cliente; (b) un voto
  **senza numero d'ordine non esce**, perché a un registro di ordini non serve
  un giudizio che non sa dove attaccare.
  ⚠️ **Da pubblicare**: finché questa versione non è su Vercel, l'import di
  Orders in produzione non trova la rotta (in locale è già provato e funziona).

- PUNTEGGI CONFIGURABILI DI VALET E PARTNER (26/07/2026): la "pagella".
  4 tabelle nuove (`VocePunteggio`, `Feedback`, `Puntualita`, `MetricaManuale`),
  motore di calcolo in `src/lib/punteggi.ts`, pagine `/reclami/punteggi` (pagella
  + configurazione delle voci) e `/reclami/feedback` (registrazione di feedback e
  orari), API `/api/punteggi`, `/api/punteggi/voci`, `/api/punteggi/voci/iniziali`,
  `/api/punteggi/manuale`, `/api/feedback`, `/api/puntualita`.
  **IL PUNTEGGIO NON È UNA FORMULA NEL CODICE.** È la media pesata di VOCI che
  l'operatore configura: ognuna ha una `fonte` (`reclami` | `feedback` |
  `puntualita` | `manuale`), un `peso` e una `soglia`. Aggiungere una variabile
  ("cura del confezionamento") = aggiungere una voce, non toccare il codice.
  Le 4 voci di partenza: Reclami (tutti, peso 3, soglia 10), Feedback (tutti,
  peso 3), Puntualità (solo valet, peso 4, tolleranza 15 min), Qualità del
  prodotto (solo partner, manuale, peso 2). Peso 0 = voce presente ma esclusa.
  **DUE REGOLE CHE TENGONO ONESTO IL NUMERO, da non rompere.**
  1. Una voce SENZA DATI per quel soggetto è **esclusa** dalla media, non contata
     come zero: un partner di cui non misuriamo la puntualità non deve risultare
     scarso per un dato mai raccolto. Svuotare un valore manuale lo rimuove
     (≠ metterlo a 0), e l'interfaccia lo dice.
  2. Sotto il 50% di peso coperto (`COPERTURA_MINIMA`) **non si dà la fascia**:
     si scrive "Da valutare". Nata da un problema visto in verifica: 38 partner su
     41 uscivano "100 Ottimo" solo perché non avevano ancora reclami — un
     complimento costruito sul nulla, che seppelliva i due soggetti con dati veri.
     Ora la pagella mostra per default solo chi ha prove sufficienti, col
     conteggio degli altri e il link per andare a misurarli.
  `Puntualita` salva i **minuti di ritardo** (0 = in orario, negativo = anticipo),
  non un "in orario sì/no": la tolleranza vive sulla voce, così cambiandola gli
  stessi dati si rileggono da soli (VERIFICATO: tolleranza 15→60 porta un valet
  da Critico 37,8 a Attenzione 57,8; rimettendo 15 torna esatto a 37,8). Se si
  passano le due date, il ritardo si **calcola** e il numero scritto a mano viene
  ignorato: una sola verità.
  VERIFICATO sui dati veri: voci iniziali 4 aggiunte / al secondo giro 0 aggiunte
  e 4 saltate; valet puntuale (9/10 in orario, feedback 5-5-4) → **93,5 Ottimo**,
  valet ritardatario (1/10, feedback 2-1) → **37,8 Critico**, ordinati dal
  peggiore; partner vero del registro con feedback 4 e qualità 80 → 85,6 su 3
  voci, togliendo il valore manuale → **87,5 su 2 voci con la terza "ESCLUSA"**
  (sale, perché l'80 non viene più contato né azzerato). Rifiutati: valore a mano
  su una voce calcolata 400, voce "puntualità" su un partner 400, voto 9 su 5 400,
  feedback senza soggetto 400, consegna senza valet 400, consegna senza minuti né
  date 400, data non valida 400; valore manuale 999 → 100, −50 → 0, soglia 0 non
  produce NaN.
  Dati di prova cancellati filtrando solo i miei record: 914 ordini e 2 utenti
  veri intatti. Le 4 voci restano: sono il catalogo di partenza.
- CUSTOMER SERVICE — RECLAMI, CASISTICHE, VALET, GIUDIZI (26/07/2026): l'app
  diventa il servizio clienti. Quattro tabelle nuove (`Valet`, `CasistaReclamo`,
  `Reclamo`, `Giudizio`), vocabolario e calcoli in `src/lib/reclami.ts`, quattro
  pagine sotto `/reclami` e sei rotte API. `prisma db push` fatto: sono tabelle
  NUOVE, nessuna esistente è stata toccata.
  **Il giro completo**: da ogni ordine (card e tabella) il bottone **Reclamo**
  apre `/reclami?ordineId=&ordine=&cliente=&telefono=&email=&negozio=` con il
  form già pieno → si scegle una **casistica** e questa riempie da sola gravità,
  colpa tipica e la **checklist delle azioni** → si attribuisce la **colpa** a un
  valet (registro locale `/reclami/valet`) o a un partner (tendina letta da
  Anagrafiche via `/api/partner`, la chiave non passa dal browser) → in
  `/reclami/giudizi` i reclami di ogni soggetto diventano un **giudizio**.
  **GIUDIZIO AUTOMATICO, come funziona** (`giudizioAutomatico()`): si sommano i
  pesi dei reclami, dove il peso è la gravità (1 lieve / 2 media / 3 grave)
  **dimezzata se il reclamo è risolto o chiuso** — rimediare conta. Soglie: 0 →
  Ottimo, ≤2 → Buono, ≤6 → Attenzione, oltre → Critico. Le soglie sono state
  ritarate durante la verifica: con la prima versione (≤3 → Buono) UN reclamo
  grave ancora aperto risultava "Buono", troppo indulgente. Il giudizio manuale
  (voto 1-5 + nota, upsert su `[soggettoTipo, soggettoId]`) **non sostituisce**
  quello automatico: si affianca, così resta visibile da cosa nasce il numero.
  **VERIFICATO sui dati veri** (dev server su porta 3141 per non litigare col
  3140 di un'altra sessione): casistiche di esempio 7 aggiunte e al secondo giro
  0 aggiunte / 7 saltate (il seed non duplica, match sul nome); un valet con 2
  gravi + 1 medio aperti → punti 8 **Critico**, un altro con 1 medio risolto →
  punti 1 **Buono**, ordinati dal peggiore; `risoltoIl` valorizzato da solo
  passando a "risolto"; azioni copiate dalla casistica (3 righe); tendina partner
  popolata con i **41 partner veri** del registro; nella sidebar si accende una
  sola voce anche sulle sotto-pagine. **Rifiutati come devono**: reclamo senza
  casistica 400, stato inventato 400, giudizio a un soggetto non giudicabile
  (azienda/cliente) 400, voto 99 → stretto a 5.
  I dati di prova sono stati cancellati **filtrando solo i miei record** (mai
  `deleteMany` globali su questo DB condiviso): 914 ordini e 2 utenti veri
  intatti. Le **7 casistiche di esempio sono state lasciate**: sono il catalogo
  di partenza, non dati di test.
  NON rinominati (romperebbero cose vive): cartella, progetto Vercel, schema
  `messaging`, cookie `msg_session`, `MARCATORE` di google.ts.
  **DEVIAZIONE SCRITTA, da sapere prima di toccare i valet.** La tabella `Valet`
  di quest'app **duplica** un registro che esiste già: quello vero è in
  deluxy-platform-next (`model Valet`, con IBAN, codice fiscale, veicolo, regole
  di stipendio). Non lo rileggiamo perché **per i valet non c'è una API a
  chiave**: `GET /api/v1/valets` è protetta da JWT utente + ruolo
  (`api/src/valets/valets.controller.ts`, guardie globali in `app.module.ts`), e
  l'unica strada praticabile oggi sarebbe tenere la password di un utente di
  servizio — peggio della copia. Perciò qui c'è solo il minimo per attribuire una
  colpa (nome, recapito, zona), e la pagina lo dice all'operatore. **Da fare
  quando si potrà**: aggiungere in platform-next una lettura a `x-api-key` sul
  modello di `deluxy-orders/src/lib/api-auth.ts`, poi sostituire la tabella con un
  `src/lib/valet.ts` che rilegge il registro, esattamente come
  `src/lib/anagrafiche.ts` fa per i partner (quelli infatti **non** sono
  duplicati). Attenzione a non prendere la strada opposta per comodità: se questa
  tabella diventa il posto dove si gestiscono i valet, nasce un secondo registro
  divergente da quello dei compensi.
- ORDINI AUTOMATICI OGNI 15 MINUTI (26/07/2026): `vercel.json` → cron
  `*/15 * * * *` su `/api/cron/ordini`, protetto da `Authorization: Bearer
  CRON_SECRET` (Vercel lo manda da solo; senza segreto la rotta risponde 503
  invece di restare aperta). `CRON_SECRET` impostata su Vercel (Production) e in
  `.env` locale. Il middleware ora ESCLUDE `api/cron` (i cron non hanno cookie:
  finivano rimandati al login).
  La logica di scarico è stata estratta in `src/lib/sincronizza.ts`
  (`sincronizzaOrdini({completo, contatti})`), condivisa fra il cron e il
  pulsante "Aggiorna" — prima viveva dentro la rotta e non era riusabile.
  MISURATO: il giro con i contatti Google durava **218 secondi** (40 chiamate
  alla People API), quello coi soli ordini **~21-25 s** (31 ordini). Perciò i
  contatti sono stati staccati sul loro cron `/api/cron/contatti` (`7 * * * *`,
  maxDuration 300): attaccati ai 15 minuti li avrebbero fatti scadere, cioè
  avrebbero fatto perdere proprio gli ordini che il cron deve salvare.
  `ordiniSyncUltimo`/`ordiniSyncEsito` in Impostazione registrano ogni giro; la
  pagina Ordini scrive "Aggiornati da soli 4 minuti fa" (verificato: "adesso").
  Verificato in locale e in produzione: senza header 401, header sbagliato 401,
  header giusto 200 con `{scaricati: 31}`. **PROVA DEFINITIVA**: alle 12:30:34
  UTC del 26/07 il giro è partito **da solo** (nessuna chiamata nostra), come si
  legge da `ordiniSyncUltimo` — il cron è davvero registrato, non solo dichiarato
  in `vercel.json`. In produzione dura **~2 secondi** (il DB Supabase è a fianco),
  contro i 21-25 s da casa.
- SEZIONE PARTNER (26/07/2026): `/partner` + `src/lib/anagrafiche.ts`
  (`partnerAttivi()`) + `/api/partner` (proxy: la chiave non passa dal browser).
  Legge `GET {anagraficheUrl}/api/v1/partners?stato=attivo` con `x-api-key`.
  NESSUNA copia locale (regola del registro: "non tenete una copia, rileggete").
  `stato=attivo` è lo stato COMMERCIALE, che nel registro vuol dire "è Partner".
  Chiave di sola lettura creata con `npm run chiave -- deluxy-messaging` in
  deluxy-anagrafiche e salvata cifrata in Impostazione `anagraficheApiKey`
  (+ `anagraficheUrl`); card dedicata in Impostazioni.
  SCOPERTA CHE HA CAMBIATO IL CODICE: nel registro **nessuno** dei 41 partner
  attivi ha un telefono proprio, ma 28 hanno un REFERENTE col numero. Il bottone
  "Scrivi" guarda prima l'insegna e poi i referenti: senza quel ripiego sarebbe
  spento per 37 partner su 41. Verificato sui dati veri: 41 righe, 38
  contattabili (27 WhatsApp + 11 email), 3 senza recapito; filtro FIORISTA → 11,
  ricerca "milano" → 22.

- SCRIPT — RISPOSTE RAPIDE CHE L'AI IMPARA (26/07/2026): tabella `Script`
  (titolo, categoria, testo, `quando` = quando usarlo, attivo, `usi`), pagina `/script`
  (`src/components/ScriptLista.tsx`) con CRUD, ricerca, copia e un BANCO DI PROVA
  ("Prova la risposta automatica": si incolla un messaggio e si vede cosa risponderebbe).
  `suggerisciRisposta()` in `src/lib/ai.ts` manda all'AI SOLO i nostri script (max 60, i
  più usati per primi) e le chiede quale usare + il testo adattato al cliente.
  API `POST /api/script/suggerisci` con `{messaggio}` oppure `{conversazioneId}` (in questo
  caso prende da sola l'ultimo messaggio IN ENTRATA della conversazione); lo script scelto
  incrementa `usi`, così i più usati salgono.
  PRINCIPIO (come per l'IBAN): l'AI propone, noi decidiamo. Lo `scriptId` restituito è
  validato contro l'elenco mandato — se l'AI inventa un id, la risposta viene scartata; e
  se nessuno script c'entra torna `null` invece di improvvisare.
  Nell'inbox: bottone **Risposta rapida** accanto a Invia — il testo finisce nel riquadro
  di scrittura, NON parte da solo, e un avviso dice da quale script arriva.
  Verificato con 3 script veri e l'AI vera: "ordine in ritardo" → Ritardo nella consegna
  (con il nome del cliente inserito), "mi serve la fattura" → Richiesta di fattura,
  "vendete macchine fotografiche usate?" → nessuno script, rifiutato correttamente.
  Dall'inbox su una conversazione widget: bottone → riquadro riempito + avviso, invio non
  automatico.
- CALENDARIO, VISTA "DA OGGI" (26/07/2026): `/calendario` apre sull'AGENDA che parte da
  oggi (`/api/ordini/calendario?giorni=60`), con "Oggi" evidenziato; la griglia del mese
  resta a un clic. Le date di consegna arrivano da Orders (campo `consegna`).
- AI = OPENAI (26/07/2026): `src/lib/ai.ts` usa la chiave OpenAI (Impostazione
  `openaiApiKey`, cifrata), con Anthropic come ripiego. Due modelli per motivo misurato:
  `gpt-4o-mini` per il testo, `gpt-4o` per le IMMAGINI — mini ha sbagliato un IBAN letto da
  foto (due zeri persi, beccato dal checksum), 4o l'ha letto giusto.

- Scaffold completo dell'app (Next 15 + Prisma, porta 3140, design system Deluxy).
- Schema dati: `Utente`, `Impostazione` (token cifrati AES-256-GCM), `Conversazione`
  (unica per canale+idEsterno), `Messaggio` (dedup su id Meta, stati di consegna).
- Webhook Meta unico (`/api/webhooks/meta`): verifica GET col verify token, firma
  X-Hub-Signature-256 con l'App Secret, ricezione WhatsApp/Messenger/Instagram,
  aggiornamenti di stato WhatsApp.
- Invio: WhatsApp Cloud API, Messenger e Instagram via `/{nostro account}/messages`
  (src/lib/meta.ts) — su `graph.facebook.com` col Page Access Token, su
  `graph.instagram.com` se il token comincia per `IGAA`.
- Inbox a due colonne con polling (elenco 5s, thread 4s), badge canale, non letti,
  stati di consegna e errori d'invio visibili in bolla.
- Widget: `public/widget.js` (bottone flottante + iframe) → pagina `/widget` (pubblica,
  frame-ancestors *), API pubbliche `/api/widget/sessione` e `/api/widget/messaggi`
  autenticate dal token di sessione del visitatore.
- Impostazioni: token canali (cifrati, "vuoto = non toccare"), verify token, App Secret,
  titolo/benvenuto widget, URL webhook e snippet pronti da copiare.
- Login (`/login`) e registrazione (`/registrati`) come pagine separate con link
  incrociati: il primo account registrato è l'amministratore (bootstrap), i successivi
  nascono operatori; middleware a sessione firmata.
- Tessera "Messaggi" nel catalogo del Hub (`deluxy-hub/src/lib/apps.ts`, icona nuova).

- Negozi Shopify MULTI-STORE: tabella `NegozioShopify` (credenziali cifrate), pagina
  `/negozi` (aggiungi/modifica/sospendi/elimina), `src/lib/negozi.ts`. Ogni negozio si
  autentica con token statico `shpat_` OPPURE Client ID+Secret (client credentials grant
  `POST {shop}/admin/oauth/access_token`, `src/lib/shopify.ts` `risolviToken`/`tokenDaClientCredentials`).
  Lo scarico ordini gira su tutti i negozi attivi e riporta l'esito per-negozio; ogni
  `Ordine` è legato al negozio (`negozioId`, unique `[negozioId, shopifyId]`).
  NB: il "Token di automazione dell'app" (`atkn_`) NON legge ordini — serve solo al deploy CI/CD.
- Ordini da Shopify: `src/lib/shopify.ts` (Admin GraphQL 2024-10, `X-Shopify-Access-Token`,
  ultimi 60 giorni), tabella `Ordine`, API `/api/ordini/sync` (scarica+upsert),
  `/api/ordini` (lista + se Google collegato), `/api/ordini/[id]/contatto` e
  `/api/ordini/contatti-tutti` (salva su Google), pagina `/ordini`. Dominio+token in
  Impostazioni (token cifrato).
- Google Contacts: OAuth server-side con refresh token (`src/lib/google.ts`), People API.
  Flusso `/api/google/connetti` → consenso Google → `/api/google/callback` (salva
  refresh token cifrato). `src/lib/contatti.ts` conia l'access token e salva con dedup
  per telefono. Client ID/Secret + redirect URI in Impostazioni. Scelta server-side (non
  il token-client del browser di anagrafiche) perché su Vercel i contatti vanno salvati
  anche senza operatore davanti. Verificato: il connetti reindirizza a accounts.google.com
  col client_id giusto (serve progetto Google Cloud reale per completare).
  NB: il redirect URI va messo negli **URI di reindirizzamento autorizzati**, non nelle
  Origini JavaScript (quelle rifiutano i percorsi) → errore `redirect_uri_mismatch`.
- LIVE su https://deluxy-messaging.vercel.app (progetto Vercel `deluxy-messaging`, team
  deluxy). Env di produzione: DATABASE_URL, DIRECT_URL, APP_SECRET (LO STESSO del locale,
  altrimenti i token cifrati nel DB condiviso non si aprono), APP_URL.
- Vista a colonne + bottone Fornitore (26/07/2026): `/ordini` alterna Colonne/Elenco; le
  colonne sono per negozio con conteggio e valore dell'intero filtro (groupBy). Bottone
  "Fornitore" = deep link `search-deluxy/?brand=&ordine=` (`linkRicercaFornitori`), brand
  per negozio da `brandRicercaDaNegozio()` (campo `brandRicerca` per l'override).
  Verificato: cakedesign.me/1730, deluxy.it/12650, deluxyflowers.com/2582.
- Clienti/rubrica (26/07/2026): `/clienti` + `/api/clienti`, ricavati dagli ordini
  raggruppando per telefono (fallback email) — nessuna tabella nuova. Verificato: 684
  clienti da 782 ordini.
- Archivio storico via Orders (26/07/2026): `src/lib/orders.ts` → `GET {ordersUrl}/api/v1/ordini`
  con header `x-api-key`. Chiave creata in deluxy-orders (`npm run chiave -- deluxy-messaggi`,
  sola lettura) e salvata cifrata in Impostazione `ordersApiKey` (+ `ordersUrl`). La ricerca
  in `/ordini` mostra la sezione "Archivio storico" con i risultati. Il brand di Orders viene
  tradotto per Ricerca fornitori ("Flowers" → "deluxyflowers.com").
- Email register.it, PIÙ CASELLE (26/07/2026): tabella `CasellaEmail` + pagina `/caselle`
  (schema/pagina gemelli di NegozioShopify//negozi). `src/lib/email.ts` lavora per casella.
  PARAMETRI UFFICIALI verificati su www.register.it/assistenza/parametri-email:
  IMAP `pop.securemail.pro:993` SSL, SMTP `authsmtp.securemail.pro:465` SSL, utente =
  indirizzo completo — host GENERICI, non del dominio cliente. (Prima avevo messo
  `imaps./smtps.register.it`: ERRATO. Attenzione: il DNS di questa rete risolve QUALSIASI
  nome a 10.147.17.27, quindi non è una verifica valida.) Porte/host modificabili; sulla
  587 `smtpSicuro=false` (STARTTLS). TLS con `rejectUnauthorized:false` (certificato
  intestato ad altro nome; connessione comunque cifrata).
  `/api/email/sync` gira su TUTTE le caselle attive con esito per casella; la risposta
  parte dalla casella che ha ricevuto (`Conversazione.casellaId`), altrimenti dalla
  predefinita. `/api/email/prova` prova SMTP **e** IMAP e legge dal DB (salvare prima).
  Campo `Messaggio.oggetto`. MANCA: allegati, HTML (solo testo), cartella Inviata sul
  server, cron di scarico, invio di una mail NUOVA (oggi solo risposte da thread).
- Link firmato Ricerca fornitori (26/07/2026): `src/lib/fornitori.ts` — POST
  `{searchUrl}/api/link` con `x-api-key: dlxs_…` e body `{quando: ISO}` torna
  `{url: …/?t=<code>}` valido ~5 min; ci aggiungiamo brand+ordine. Senza chiave ripiega
  sul link semplice `?brand=&ordine=` (verificato: `firmato: false`). Il bottone apre la
  scheda PRIMA della fetch, altrimenti il browser la blocca come popup.
- LAVORAZIONE ORDINI + MENU A SCOMPARSA (26/07/2026): `Ordine.gestione`
  (da_gestire | in_pagamento | comunicazione | gestito) + `gestioneIl`, con
  `src/lib/gestione.ts` per nomi e colori. NON confonderlo con `statoChiave` (pipeline di
  Orders): il sync non lo tocca. `POST /api/ordini/[id]/gestione` lo cambia; il filtro
  `gestione=aperti` (default in pagina) mostra solo i non gestiti.
  Pulsanti su card e tabella: Richiedi pagamento (→ `/pagamenti?ordine=&cliente=&importo=`,
  segna in_pagamento), Contatta cliente (wa.me se c'è il telefono, altrimenti mailto; segna
  comunicazione), Gestito ✓ / Riapri. I link si aprono in modo sincrono nel gestore del
  click, altrimenti il browser li blocca come popup.
  Menu a scomparsa: `ToggleSidebar` + `[data-sidebar-chiusa] .sidebar { margin-left:-232px }`
  + script nel `<head>` che riapplica la scelta da localStorage prima del paint.
  ⚠️ VERIFICA: col pannello del browser nascosto le TRANSIZIONI CSS non avanzano, quindi
  `margin-left`/`opacity` risultano fermi ai valori iniziali anche se la regola si applica
  (si vede da `pointer-events: none` che invece cambia). Misurare con
  `.sidebar { transition: none !important }`: così risulta 1033px → 1265px, corretto.
- INOLTRO A DELUXY PARTNER (26/07/2026): `src/lib/partner.ts` →
  `POST {partnerUrl}/api/richieste-pagamento`, header `X-API-Key` + `X-App: deluxy-messaging`,
  body {importo, beneficiario, iban, bic, causale, contatto, linkConversazione, riferimento,
  note}. Idempotente su (origine, riferimento) — vedi
  deluxy-partner/src/app/api/richieste-pagamento/route.ts. Campi nuovi su RichiestaPagamento:
  bic, contatto, linkConversazione, riferimento (unique), inviataIl, partnerId, partnerStato,
  esitoInvio. Partner RIFIUTA importo <= 0. Un invio fallito non annulla il salvataggio: si
  rimanda con `POST /api/pagamenti/[id]/invia`, e `GET` sulla stessa rotta aggiorna lo stato.
  Verificato con un finto Partner: header e body esattamente come da contratto.
  MANCA: chiave API vera di Partner in Impostazioni.
- RICHIEDI PAGAMENTO (26/07/2026): tabella `RichiestaPagamento` + pagina `/pagamenti`.
  `src/lib/iban.ts` verifica l'IBAN col checksum mod-97 (ISO 13616) + lunghezza per paese;
  `stringaPagamento()` compone la stringa pulita. `src/lib/ai.ts` estrae iban/intestatario/
  importo/causale con **Claude Opus 5** (`@anthropic-ai/sdk`, `output_config.format` con
  json_schema, immagini via blocco `image` base64), gestendo `stop_reason: "refusal"`.
  API `/api/pagamenti/estrai` (testo e/o immagine) e `/api/pagamenti` (GET/POST/DELETE).
  Chiave in Impostazione `anthropicApiKey` (cifrata).
  PRINCIPIO: l'AI propone, il checksum decide — un IBAN che non torna si salva ma resta
  "da controllare", non viene mai dato per buono. Verificato: cifra alterata → rifiutata,
  spazi → normalizzati, lunghezza IT sbagliata → rifiutata, DE valido → accettato.
  MANCA: prova reale dell'estrazione AI (serve una chiave Anthropic vera).
- Menu a SINISTRA (26/07/2026): `src/components/Sidebar.tsx` + `.layout/.sidebar/.main`
  copiati da deluxy-orders; la topbar tiene solo marchio e utente. Sotto 800px la sidebar
  diventa una riga orizzontale. Voci: Ordini/Calendario/Clienti · Inbox · Negozi/Caselle/
  Impostazioni.
- CALENDARIO ORDINI (26/07/2026): `/calendario` + `/api/ordini/calendario?mese=YYYY-MM`.
  Griglia del mese per DATA DI CONSEGNA, ogni ordine con il bordo del colore dello stato;
  legenda cliccabile per filtrare, filtro negozio, KPI consegne/valore.
  Campi nuovi su `Ordine`: `dataConsegna`, `fasciaConsegna`, `statoChiave`, `statoNome`,
  `statoColore` (da `consegna` e `classificazione.stato` di Orders + `GET /api/v1/stati`
  per i colori). Verificato: 610 ordini su 911 hanno una data di consegna, 876 hanno stato;
  luglio mostra 260 consegne per €47.539,98.
  NB: i campi nuovi NON si riempiono col sync incrementale — serve
  `POST /api/ordini/sync?completo=1` (rifà tutta la finestra di 60 giorni, dura minuti).
- FONTE ORDINI = DELUXY ORDERS (26/07/2026, non più Shopify diretto): `/api/ordini/sync`
  usa `scaricaOrdiniDaOrders()` (`GET {ordersUrl}/api/v1/ordini?da=&page=&limit=200`,
  `x-api-key`). INCREMENTALE: `da` = giorno dell'ordine più recente locale − 1 (primo giro
  fino a 60gg), altrimenti su Vercel si sfora il tetto di tempo. Dedup sul **gid Shopify**
  (`orderId` di Orders = il nostro `shopifyId`): i 782 ordini presi prima da Shopify si
  aggiornano, non si duplicano (verificato: 782→789→…→910 senza doppioni).
  Ogni brand di Orders → negozio in `NegozioShopify` (match su nome/dominio/brandRicerca,
  altrimenti creato). ATTENZIONE: `negozioNome` va scritto col nome del NEGOZIO, non col
  brand grezzo — Orders chiama lo stesso negozio ora "Flowers" ora "deluxyflowers.com" e si
  ottengono 6 nomi per 3 negozi (già corretto + riallineati i record vecchi).
  Le credenziali Shopify in /negozi non servono più (restano per storia).
  `src/lib/shopify.ts` non è più usato dal sync.
- Fornitore, link firmato VERIFICATO (26/07/2026) contro un finto `/api/link`: il backend
  fa POST con `x-api-key: dlxs_…` e body `{quando: ISO}`, poi al `url` restituito aggiunge
  brand e ordine → `…/?t=<code>&brand=deluxyflowers.com&ordine=2582` (numero senza #).
  La chiave non passa mai dal browser.
- Home = Ordini (26/07/2026): `/` mostra gli ordini, l'inbox è su `/inbox`, `/ordini`
  reindirizza a `/` (resta valido: è l'URL registrato come app su Shopify). Ordine in
  barra: Ordini, Clienti, Messaggi, Negozi, Caselle, Impostazioni.
- Grafica di Deluxy Orders importata (26/07/2026): stessi nomi di classe
  (`page-head/page-title/page-sub`, `kpi-riga/kpi`, `ricerca` a pillola con lente,
  `filtri` + `stato-pill`, `tabella-wrap` + `cella-*`, `tag`, `paginazione`, `vuoto`,
  `btn`) copiati da deluxy-orders/src/app/globals.css. Le regole di tabella sono confinate
  in `.tabella-wrap` per non toccare la `.tabella` preesistente. `/clienti` rifatta su quel
  modello (KPI, ordinamenti Più spesa/Più ordini/Più recenti/Nome — verificati).
- Ricerca ordini (25/07/2026): `/api/ordini` accetta `q` (numero, cliente, telefono con
  normalizzazione delle cifre, email, indirizzo, negozio), `negozio` e `contatto=si|no`;
  torna anche `totale` e l'elenco negozi. UI: barra con campo di ricerca (ritardo 300ms),
  due select e "Azzera"; lista tagliata a 200 con conteggio dei corrispondenti.
  Verificato su 782 ordini reali: nome→1, telefono con spazi→1, email→1, negozio→145,
  negozio+nome→4.
- Contatti automatici (25/07/2026): `src/lib/contatti.ts` → `salvaContattiOrdini()`, chiamata
  in coda a `/api/ordini/sync` (e da `/api/ordini/contatti-tutti`). Nome in rubrica
  `SIGLA Nome #ordine` (es. `FL Mario Rossi #1042`): sigla per negozio da
  `prefissoDaNegozio()` — flowers→FL, cake→CK, deluxy→DL, campo `prefisso` per l'override.
  Dedup per ultime 9 cifre del telefono: un contatto per persona, aggiornato col numero
  dell'ordine PIÙ RECENTE (`aggiornaContatto` = people.updateContact con etag rifresco).
  I contatti NON creati da noi non vengono mai rinominati (marcatore "Deluxy Messaggi" in
  biografia). Tetto di 40 clienti per giro (serverless): `rimasti` nel riepilogo.
  Verificato con le funzioni reali: FL/CK/DL corretti sui 3 negozi dell'utente.

## MANCA

> ⚠️ **Questa sezione era ferma al 28/07 e diceva il falso su quasi tutto.** Ricontata sul
> database di produzione il **15/08/2026** e di nuovo il **17/08/2026 pomeriggio**
> (`node scripts/conta.mjs`, solo pieno/vuoto, mai i valori). I canali li collega
> **l'utente, non una sessione**: prima di scrivere «manca X», **ricontarlo**.

**Ricontato il 21/08/2026** (`node scripts/conta.mjs`, più le tabelle
`Chargeback`, `NotaDiario` e `PaginaMeta`):

- **Ordini: 1.305**, **494 da gestire**, **383 senza data di consegna**.
- **Conversazioni: 564** e **3.071 messaggi** — email **394**, WhatsApp **122**,
  widget **31**, Instagram **17**, **Messenger 0** (in `PaginaMeta` le 3 righe
  sono tutte `instagram`, token che si rinnovano da soli fino al **28/09/2026**).
  Due non lette.
- **Presa in carico: 50 conversazioni** hanno un proprietario (erano 8 il 17/08).
- **Rubrica Google: arretrato finito** — 1.143 ordini con contatto salvato, **0
  rimasti**, **0 errori**.
- **Chargeback: 13** — 10 perse (2.087,66 €), 1 in esame, **2 da rispondere entro
  il 4 settembre, prove mai inviate**.
- **Diario di lavoro: 0 note.** La sezione è nata il 21/08 e nessuno ci ha ancora
  scritto: fra qualche giorno vale la pena chiedere all'utente se il quaderno si è
  spostato lì davvero, o se le righe finiscono ancora in chat.
- **`apreSulSito` ancora `false` su tutti e tre i siti** (deluxy, flowers, cake).
- **Utenti: 4**, fra cui ancora `diagnostica@deluxy.local`.
- **Chiavi vuote**: `shopifyToken` (giusto), `waBusinessAccountId`,
  `widgetTitolo`/`widgetMessaggio`, `partnerUrl`, `searchUrl`.

**Contato il 17/08/2026 pomeriggio** — STORIA (fra parentesi il 15/08):

- **Ordini**: **1.245** (1.216), **488 da gestire** (474), **371 senza data di consegna**
  (367).
- **Conversazioni: 468** (425) e **2.589 messaggi** — email **346**, WhatsApp **91**,
  widget **18**, Instagram **13**, **Messenger 0**. Una sola non letta.
- **Presa in carico già usata: 8 conversazioni** hanno un proprietario, il giorno stesso
  in cui la funzione è nata.
- **WhatsApp**: **3 numeri** attivi, tutti con token, WABA e marchio.
- **Instagram**: **3 account**, tutti con token e marchio, e i token si **rinnovano da
  soli** — `tokenEsito` dice «rinnovato: scade fra 59 giorni», scadenza **28/09/2026**.
- **Email**: **3 caselle** attive, tutte con password e marchio — `cs@deluxy.it`
  (predefinita), `info@deluxyflowers.com` (nuova dal 15/08), `info@cakedesignme.it`.
- **Contenuti**: 31 script, 18 istruzioni AI.
- **Lavoro che aspetta una persona**: **1 reclamo aperto** (è l'unico reclamo mai
  registrato), **2 rimborsi «richiesto»** fermi da prima del 15/08.
- **Utenti: 4**, fra cui ancora `diagnostica@deluxy.local`.
- **Chiavi**: presenti Orders, Anagrafiche, OpenAI, Meta (app secret, verify token, IG,
  fbPageToken), Google (client + refresh) e **`searchApiKey`** — nuova, e **funziona**.
  Vuote: `partnerApiKey`/`partnerUrl`, `waBusinessAccountId`, `widgetTitolo`/
  `widgetMessaggio`, `shopifyToken` (giusto: gli ordini li scarica Orders).

**Cosa manca davvero (contato il 17/08/2026):**

| Cosa manca | Cosa non funziona finché manca |
|---|---|
| 🔴 **2 chargeback in `needs_response`, prove mai inviate** (#1741 · 103,34 € e #12726 · 99,94 €) | Scadono il **4 settembre 2026**: passata quella data la banca decide senza di noi. Si risponde da `/chargeback`. |
| 🟡 **`apreSulSito` è ancora SPENTO su tutti e tre i siti** (verificato in tabella) | Il link `/chat/<codice>` continua a portare sulla chat a pagina intera invece che sul sito. Su **Flowers e Cake** la spunta va accesa (il `widget.js` là c'è, misurato il 17/08); su **deluxy.it no**, il widget non è installato. |
| **Messenger**: `fbPageToken` è in Impostazioni ma in `PaginaMeta` **non c'è nessuna riga `facebook`** (le 3 righe sono tutte Instagram) | È l'unico canale ancora spento: zero conversazioni Messenger. Il token generale non basta — ogni Pagina vuole il **suo** Page Access Token, messo in `/account-meta`. |
| `partnerApiKey` e `partnerUrl` (entrambi vuoti) | Le richieste di pagamento si salvano qui ma non arrivano a **FINANCE** (`deluxy-partner`). Oggi la tabella è comunque a 0 richieste. |
| `widgetTitolo` / `widgetMessaggio` | Il widget generale mostra i valori di riserva («Deluxy», «Ciao! Come possiamo aiutarti?»). I 3 siti configurati hanno i propri testi, quindi non è un guasto. |
| `waBusinessAccountId` | Serve alla diagnosi di `/numeri-whatsapp` per interrogare il WABA; i messaggi passano lo stesso. |

Da fare, in ordine di utilità:

- 🟡 **CHARGEBACK APERTI: il dato non c'è ancora, ma i permessi SÌ** (chiesto dall'utente il 19/08).
  Né questa app né Deluxy Orders leggono le contestazioni: sull'ordine di Shopify
  stanno in `disputes { id status initiatedAt }` (Shopify Payments), e la query di
  Orders (`src/lib/shopify.ts`) oggi chiede solo `risk`. Strada: **Orders le legge →
  qui si copiano** come già si fa per pagamento e rischio frode, poi bollino rosso e
  filtro. ✅ **MISURATO il 19/08** interrogando Shopify: `disputes { id status }`
  sull'ordine **risponde già** con i permessi che l'app ha (zero contestazioni
  sugli ultimi 50 ordini di ciascun negozio), quindi per l'elenco **non serve
  aggiungere niente**. Serve un permesso solo per il DETTAGLIO (importo, motivo,
  scadenza delle prove), che sta su `shopifyPaymentsAccount`: Shopify chiede
  **`read_shopify_payments`** o **`read_shopify_payments_accounts`**.
  ⚠️ Vale solo per Shopify Payments: una contestazione su un altro gateway lì non
  compare.

- **371 ordini senza data di consegna** (su 1.245 in tabella, 488 ancora «da gestire»):
  sono quelli che `chiudi-consegne-passate.mjs` non tocca di proposito. È un problema di
  **dati di Orders**, non di questa app, e va risolto lì.
- **2 rimborsi in stato «richiesto»** fermi in attesa di una decisione, e **1 reclamo
  aperto**: non è debito tecnico, è lavoro che aspetta una persona. ⚠️ Il reclamo aperto
  è **l'unico reclamo mai registrato** in tre settimane: o i reclami si trattano ancora
  fuori dall'app, o la strada per aprirne uno non si trova. Da chiedere all'utente prima
  di aggiungere altre funzioni a `/reclami`.
- **Template WhatsApp**: fuori dalla finestra di 24h Meta rifiuta i messaggi liberi, e
  «Nuovo messaggio» in Inbox oggi funziona **solo per la posta**. Costi (listino Meta
  1/7/2026, per messaggio, Italia): Marketing €0,0658, Utility/Authentication €0,0248,
  Service (risposte entro 24h) **gratis**.
- **Promemoria da spingere su Deluxy Tasks** (porta 3090, API a chiave): oggi le
  `Attivita` della dashboard restano qui, e sono un secondo registro.
- Allegati su **email** (su WhatsApp ci sono nei due versi; su Instagram e Messenger dal
  17/08/2026 si **ricevono**, non si inviano). ⚠️ Di quelli Instagram/Messenger teniamo
  solo l'indirizzo firmato di Meta, **che scade**: per conservarli davvero serve uno
  storage nostro, e lo scaricamento non può stare nel webhook (un webhook lento perde
  messaggi). Le foto arrivate **prima del 17/08 sono perse**: l'indirizzo veniva buttato.
- **Accendere `apreSulSito`** su Flowers e Cake dalla pagina «Widget dei siti»: il codice
  c'è ed è verificato, ma la spunta va accesa da una persona che sa se il widget è
  installato. Su deluxy.it **non va accesa** finché il sito non ha `widget.js`.
- **Segnalare spam sui canali chat**: oggi funziona solo sulla posta, perché l'elenco dei
  mittenti ignorati lo leggono solo le rotte email. Su WhatsApp e Instagram il blocco si
  fa da Meta.
- ~~Notifiche push filtrate sulle conversazioni mie~~ → **fatto il 19/08/2026** (mie e
  libere sì, quelle di un collega no). Resta da fare il passo successivo, se servirà:
  l'avviso **fuori dal browser** (telefono a schermo spento), che vuole un service worker
  e le Web Push — oggi se l'inbox è chiusa non arriva niente.
- **Il widget non sa chi sta scrivendo**: nessun campo nome/email prima del primo
  messaggio, quindi le conversazioni dei siti non si agganciano né al cliente né
  all'ordine. ⚠️ Le **18** rimaste a zero messaggi sono quelle del bug chiuso il 17/08 e
  restano perse; dopo il fix i visitatori hanno scritto davvero (**5 conversazioni con
  messaggi** al 19/08), quindi quella parte non è più «da provare».
- ~~**Rubrica Google**: restano clienti da smaltire~~ → **finito**, misurato il
  21/08: 1.143 contatti salvati, 0 rimasti, 0 errori. E ~~il conto alla rovescia
  della schermata di consenso in «Testing»~~ → **chiuso lo stesso giorno**: app
  pubblicata, token senza scadenza, People API `200` su 5.439 contatti.
- Account **`diagnostica@deluxy.local`** (operatore): è lì da luglio, non l'ha creato
  nessuna sessione nota. Da tenere o togliere — decisione dell'utente.

## Come riprendere

```bash
cd C:\Users\nicol\scoutwt\deluxy-messaging && npm install && npx prisma generate && npm run dev
```

Porta 3140. Senza `.env` con `DATABASE_URL` l'app non parte: vedi `.env.example`.
Il manuale funzionale completo è il **README.md** di questa cartella.

Prima di ogni commit, **entrambe**: `npx tsc --noEmit && npm run build`.
Su Windows, se `prisma generate` dà `EPERM … query_engine.dll`, ferma prima il dev
server: tiene il file bloccato.

Attenzione al database: è il **Postgres Supabase condiviso** con le altre app
(`?schema=messaging`). Mai `deleteMany` senza filtro per ripulire i test — cancella dati
veri (è già successo con la tabella `Utente`). Filtrare sui soli record creati dal test.
