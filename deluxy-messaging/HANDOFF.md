# Handoff — Deluxy Customer Service

Ultimo aggiornamento: **26/07/2026**

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
- Invio: WhatsApp Cloud API, Messenger e Instagram via `/me/messages` (src/lib/meta.ts).
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

Stato reale delle chiavi al 26/07/2026 (letto dalla tabella `Impostazione`, non a
memoria). **Configurate e funzionanti**: Anagrafiche, Orders, Google Contacts
(collegato), OpenAI. **Mancanti**, con la conseguenza concreta:

| Cosa manca | Cosa non funziona finché manca |
|---|---|
| Tutto Meta (`metaVerifyToken`, `waToken`, `fbPageToken`, `igToken`) | L'inbox resta vuota: nessun canale WhatsApp/Messenger/Instagram collegato. Il widget dei siti invece funziona già. |
| `searchApiKey` (`dlxs_…` di search-deluxy) | Il bottone *Fornitore* ripiega sul link non firmato: si apre l'app ma senza accesso automatico. |
| `partnerApiKey` (chiave verifiche di deluxy-partner) | Le richieste di pagamento si salvano qui ma non arrivano a Partner (si rimandano poi con *Invia*). |
| Password giusta della casella email | SMTP risponde **535 authentication rejected** su tutte e quattro le varianti provate: o la password è sbagliata o l'auth SMTP è disattivata sulla casella. La cifratura è stata verificata a parte ed è corretta — il problema non è nostro. |

Da fare, in ordine di utilità:

- **App Meta reale**: webhook registrato, token permanenti, pagina FB e account IG
  professionale collegati. Fuori dalla finestra di 24h Meta rifiuta i messaggi liberi:
  serviranno i **template WhatsApp**, non ancora gestiti.
  Costi (listino Meta 1/7/2026, per messaggio, Italia): Marketing €0,0658,
  Utility/Authentication €0,0248, Service (risposte entro 24h) **gratis**.
- **Script veri**: in tabella ce ne sono 3, creati solo per provare l'AI (ritardo
  consegna, fattura, cambio indirizzo). Vanno sostituiti con le risposte reali.
- **Rubrica Google**: restano ~594 clienti da salvare, 40 per giro orario → circa 15 ore
  per smaltirli da soli. Il redirect URI del progetto Google Cloud va messo fra gli "URI
  di reindirizzamento autorizzati" (non fra le origini JavaScript).
- Media in entrata (oggi mostrati come `[tipo]`) e allegati in uscita.
- Più operatori / assegnazione delle conversazioni; notifiche push.
- Collegare un ordine alla conversazione WhatsApp dello stesso cliente (oggi sono due
  mondi separati: si contatta dall'ordine, ma la risposta non si aggancia all'ordine).

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
