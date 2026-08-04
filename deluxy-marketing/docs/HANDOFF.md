# Handoff — Deluxy Marketing

> Stato al **04/08/2026**. Una finestra Claude nuova deve poter riprendere da qui
> senza altro contesto. Leggere prima il [README](../README.md) per cosa fa l'app;
> questo documento dice **dove siamo** e **cosa manca**.

## In una riga

App **live** su https://deluxy-marketing.vercel.app (password `MARKETING_APP_PASSWORD`,
al primo deploy `seta-rose-4728`). Postgres condiviso Deluxy, schema `marketing`.
Riceve già dati veri da Google Ads (Gifts e Flowers) e ha 2.426 ordini Shopify 2026.

## Cartella di lavoro e deploy

- Cartella: `C:\Users\nicol\scoutwt\deluxy-marketing` (branch **scout-ui**)
- Deploy: `npx vercel deploy --prod --yes` dalla cartella dell'app.
  Il progetto Vercel **non è collegato a GitHub**: il push non pubblica, si
  pubblica dalla CLI. (Il push su GitHub funziona: `git push origin scout-ui`.)
- Database: `npm run configura-db -- ../deluxy-hub/.env` rigenera il `.env`.
  ⚠️ Il `.env` locale punta al **Postgres di produzione**: quello che si modifica
  in sviluppo scrive sui dati veri. Non esiste ancora uno schema `marketing_dev`.

## FATTO

### ⭐ Il change control AVVISA, non blocca più (04/08/2026)

**Decisione dell'utente**: «consenti tutte le modifiche da app, al massimo metti
un alert che avvisa dell'impatto del cambiamento». Prima le regole del doc 11
**rifiutavano** l'operazione e la persona non poteva farci niente: si ritrovava
con un messaggio e nessuna via d'uscita, sulla propria campagna.

Ora **ogni divieto è diventato un avviso che dice l'impatto**, e nessuno di
questi ferma più niente:

| prima bloccava | ora avvisa |
| --- | --- |
| 2ª modifica sulla stessa campagna entro 72h | «i risultati non diranno quale delle due li ha prodotti» |
| budget oltre il 30% | «l'algoritmo riparte ad apprendere, per giorni la resa peggiora» |
| TRAINO toccata ven-dom | «il weekend è quando fa fatturato e non c'è nessuno a rimediare» |
| L2/L3 su TRAINO senza rollback | «se peggiora nessuno sa com'era prima» |
| >1 L2/L3 a settimana su TRAINO | «oltre non si distingue l'effetto di ciascuna» |
| **freeze da incidente aperto** (6 punti nel codice) | «quello che si misura è sporcato dal guasto» |

> **La rete di sicurezza vera non era questa: è che niente parte da solo.** Ogni
> operazione resta in coda finché una persona non la approva a mano, e lo
> script esegue solo le approvate (AGENDA PIANI). Quella **non è stata
> toccata** — ed è il motivo per cui togliere i divieti resta ragionevole.

- Colonna nuova **`OperazioneAdv.avvisi`** (ALTER TABLE mirato, 20 operazioni
  intatte): l'avviso viaggia **con l'operazione** e compare sulla riga in
  `/operazioni`. ⚠️ È lì che serve, non nel messaggio dopo il redirect: **chi
  approva può essere un'altra persona un altro giorno**, e quell'URL non lo
  vedrà mai. Per questo l'avviso viaggia due volte.
- `validaModifica` restituisce ancora `blocchi`, e resta **vuoto**: i chiamanti
  lo controllano ancora, così rimettere *un* divieto — uno solo, per un motivo
  preciso — è una riga in `guardrail.ts`.
- Sulla scheda gruppo il tag non dice più «blackout fino al»: dice **«già
  toccata di recente · giudicabile dal …»**, che è un'informazione, non un
  divieto.

Provato in produzione su un gruppo in blackout: l'operazione che prima veniva
rifiutata è **entrata in coda**, con l'avviso a schermo e sulla riga da
approvare. Riga di prova poi cancellata (solo quella, per id).

### Vendite Shopify in due righe, e il blocco dove si è cliccato (04/08/2026)

Il blocco «Vendite su Shopify» occupava **1.700 px**: due tabelle, tre file di
KPI, quattro paragrafi e un modulo. Ora sono **due righe espandibili** da 46 px
(`.vend-riga`): fuori i numeri che si guardano — venduto, ordini, scontrino,
ROS col break-even, costo per cliente nuovo e per ordine — dentro tutto il
resto. Misurato a 1280 px: **1.700 → 172 px**.

> **Niente è stato tolto**: tabelle per categoria, città di consegna, blocco
> «Stima», spiegazioni e modulo di correzione del legame sono tutti dentro,
> uno scatto più in là. Stringere la cornice, non ridurre il contenuto.

Il blocco «Stima» sta dentro la riga **Attribuzione**, non da solo: è la
versione stimata degli stessi KPI, e come riga a sé faceva sembrare che
fossero tre misure diverse.

**E il change control diceva «no» a due schermate di distanza.** Segnalato:
«clicco metti in pausa e non succede nulla». L'operazione *era* stata bloccata
e il motivo *era* in pagina — ma sotto il selettore del periodo, mentre chi
aveva premuto guardava il bottone in cima. Ora:

- l'avviso rosso sta **subito sotto la testata**, dove si è fatta l'azione;
- accanto al bottone compare **prima** «blackout fino al …» quando la campagna
  è in blackout: mettere in coda qualcosa che il guardrail rifiuterà di sicuro
  è un giro a vuoto. Le L0 non contano, come nel guardrail.

### Dove mandano gli annunci (04/08/2026)

Blocco **«Dove mandano gli annunci»** sulla scheda campagna
(`DestinazioniCampagna.tsx`): gli URL di destinazione, aperti in una finestra
nuova, con il gruppo che li usa e — se l'URL combacia con una landing censita —
il link alla sua scheda con la scorecard.

> ⚠️ **La destinazione dell'annuncio non era MAI stata importata.** Misurato:
> `finalUrl` popolato su **429 righe su 18.223**, e tutte e 429 sono
> **sitelink**. Zero sui 9.764 titoli e sui 3.036 descrizioni, perché nessuna
> query dello script chiedeva `ad_group_ad.ad.final_urls`. Chi guardava un URL
> in app stava guardando dove manda un *sitelink*, non dove manda l'annuncio:
> sono due pagine diverse, e il blocco le tiene **separate** dicendolo.

- Nello script: **`leggiDestinazioni()`**, query propria su `ad_group_ad` con
  `final_urls`, accorpata per (campagna, gruppo, url). ⚠️ **In una query a
  parte e dentro un `try`**, non dentro `leggiAnnunci()`: quella gira su
  `ad_group_ad_asset_view`, e infilarci un campo che la vista non regge farebbe
  fallire **tutto** il giro dei titoli, che oggi funziona. Se Google la rifiuta,
  si torna a mani vuote **scrivendolo nel log**.
- Le righe arrivano come `tipo: "destinazione"`: l'ingest accetta già tipi
  nuovi e scrive `finalUrl`, nessuna modifica lì.
- Finché il giro `copy` aggiornato non passa, il blocco **dichiara** che il
  dato non c'è invece di spacciare i sitelink per la destinazione.

> 👉 **Serve reincollare `copy.js` (o `tutto.js`) nei tre account**: le copie
> rigenerate sono in `C:\Users\nicol\Downloads\deluxy-google-ads\`.

⚠️ Lo script è stato modificato **in latin1** (vedi in fondo). Verificato dopo
la modifica: **5.842 byte non-ascii identici** a prima e `node --check` pulito.

### La matita accanto al titolo, e i due stati vicini (04/08/2026)

Il nome si cambia **dove lo si legge**: matita accanto al titolo
(`RinominaInline.tsx`, un componente per entrambi) su **gruppo** e **campagna**.
Le vecchie sezioni «Come si chiama qui» e «Stato nell'app» in fondo alla colonna
destra sono state **tolte**, non duplicate.

- **`Campagna.nomeVisibile` è nuovo** (colonna aggiunta il 04/08 sul Postgres di
  produzione). ⚠️ Applicata con un `ALTER TABLE … ADD COLUMN` mirato e **non**
  con `prisma db push`: il database è **condiviso** con le altre app Deluxy e un
  push confronta l'intero schema — se ha derivato altrove proporrebbe di
  allineare anche quello. Verificato dopo: colonna `text` nullable, 230
  campagne intatte.
- `nomeCampagna()` in `lib/gruppi.ts`, gemello di `nomeGruppo()`. Vale **solo a
  schermo**: ogni confronto e aggancio continua a usare `nome`, che è la chiave
  dell'import — e le keyword del Monitoraggio ci si agganciano per nome.
  Usato su scheda campagna e su `/campagne` (schede e tabella).
- Lo **stato nell'app** del gruppo è salito accanto allo stato di Google: sono
  il giudizio e il fatto, e si leggono solo uno di fianco all'altro. Al posto
  della vecchia sezione resta la spiegazione della differenza.

> ⚠️ **Un `<dialog>` non va dentro un `<h1>`.** Prima versione: matita dentro il
> titolo, e siccome il componente si porta dietro il suo dialogo, il `<h1>`
> "conteneva" tutto il testo del modulo — quello che legge uno screen reader
> diventava «Flowers DeliveryCome si chiama quiFlowers Delivery✕Nome da
> usare…». La matita sta in un `<div>` flex **accanto** all'`<h1>`.

Provato in produzione: rinominata una campagna («PROVA rinomina»), verificato
titolo nostro + tag «su Google: [Deluxy] - Fiori Milano ENG», poi **rimessa
com'era** (casella svuotata → torna il nome di Google).

### Gli ordini si aggiornano ogni 3 ore (04/08/2026)

`/api/cron/ordini` passa da `20 3 * * *` a **`20 */3 * * *`**: otto corse al
giorno invece di una. Era un punto aperto dal 01/08 e si vedeva nei numeri —
con la spesa di Google e Meta aggiornata a oggi e gli ordini fermi alla notte,
ROS, MER e costo di acquisizione risultavano **peggiori del vero** fino al
mattino dopo, senza dichiararlo. Misurato prima del cambio: ultimo ordine
03/08 21:34 con la spesa già al 04/08.

La finestra resta di **7 giorni** (un ordine cambia stato dopo essere nato) e
la corsa si ferma da sola a 45 s dei 60 di `maxDuration` dicendo dov'è
arrivata: otto corse corte costano meno di una lunga che rischia il timeout.

### «Metti in coda» sembrava non fare niente (04/08/2026)

Segnalato dall'utente: si sceglievano le campagne, si premeva **Metti in coda**
e «non succede nulla». Il meccanismo funzionava — provato in sviluppo: il form
parte, l'operazione si crea, si atterra su `/operazioni`. Il difetto era che
**nessuno diceva com'era andata**: `/operazioni` non leggeva **nessun**
parametro, e l'azione ci mandava l'utente muta. Quando tutte le campagne scelte
venivano **saltate** — la parola c'era già, o la campagna è congelata da un
incidente — non compariva nemmeno una riga nuova: dal di fuori è
indistinguibile da un bottone rotto.

- `applicaKeywordAdAltreCampagne` ora redirige con `?esito=` e `?saltate=`;
- `/operazioni` mostra i due avvisi (`.avviso-ok` nuovo, verde, gemello di
  `.avviso-errore`).

> ⚠️ **Le saltate non sono un dettaglio: sono il motivo per cui uno guarda la
> coda e non trova quello che si aspettava.** Finivano solo in `registra()`,
> cioè nello storico — che non è dove uno guarda.

I **tag delle campagne** sulle righe delle keyword sono ora collegamenti che
aprono la campagna in una **finestra nuova** (freccia ↗ e `rel="noopener"`):
tornare indietro da lì significherebbe ricaricare 1.500 righe e riaprire il
tema. Le campagne di cui non si trova l'id restano etichette mute — meglio
nessun link che un link a un 404.

### Una negativa congelava la campagna per tre giorni (04/08/2026)

**Il change control bloccava cose che non doveva.** `escludiParoleSelezionate`
dichiara nel suo commento che una negativa è **L0**, «la modifica più leggera
che esista», e che **non fa scattare il blackout**. Ma `validaModifica` riceveva
`campagna.modifiche[0]`, cioè l'ultima modifica **di qualunque livello**: ogni
negativa congelava la campagna per 72 ore. Misurato su `[Deluxy] - Fiori Milano
ENG`: negativa `flowers milan` alle 09:09, e da lì in poi tutto bloccato.

- `LIVELLI_CHE_PESANO` (L1/L2/L3) e `MODIFICHE_CHE_PESANO` in `guardrail.ts`,
  usati in tutti e sei i punti che leggono l'ultima modifica (4 in `azioni.ts`,
  `api/v1/operazioni`, `ProssimeAzioni`).
- Verificato sul database: prima sceglieva la L0 delle 09:09, ora la **L2 delle
  07:09**. ⚠️ **Il blocco resta**, perché quella L2 è vera: si sblocca il
  07/08 alle 07:09. Il fix raddrizza la regola, non toglie il divieto.

> ⚠️ **Filtrare dopo la query non funziona.** Con `take: 1` la riga vera è già
> stata scartata: il filtro va nella `where`. Per lo stesso motivo in
> `GuardrailCampagna` c'è una **query in più**: lì l'elenco delle modifiche
> serve anche a *mostrare* lo storico, negative comprese, e le due domande
> vogliono due risposte diverse.

> ⚠️ **Il messaggio diceva «stesso oggetto», il conto è per CAMPAGNA.** Fermare
> una keyword *diversa* della stessa campagna risultava «secondo intervento
> sullo stesso oggetto» e non si capiva quale fosse il primo. Ora il testo dice
> la campagna e che le L0 non contano.

### Il comando per fermare un gruppo è salito in cima (04/08/2026)

Era in fondo alla colonna destra, dopo dodici riquadri di numeri. Ora è un
bottone **accanto al titolo** (`AzioneGruppo.tsx`) che apre il modulo in un
dialogo — motivo e piano di rollback restano, non sono decorazione: il rollback
è obbligatorio sulle L2 di una traino. Quando non si può agire, al posto del
bottone c'è il motivo (PMax, o operazione già in coda): un bottone che non
funziona è peggio di nessun bottone. La vecchia sezione «Agire su Google» è
stata **tolta**, non duplicata — due moduli che mandano la stessa operazione,
prima o poi, mandano due operazioni.

### Il menu su telefono, e la scelta delle campagne leggibile (04/08/2026)

**Su telefono l'app non aveva navigazione.** Sotto gli 800px il CSS diceva
`.sidebar { display: none }` e basta: il menu spariva, e l'hamburger della
topbar non poteva riportarlo indietro perché toglieva/metteva
`data-sidebar-chiusa`, che `display: none` copriva comunque. Si arrivava alla
pagina aperta e da lì non si andava più da nessuna parte. Ora la sidebar
diventa un **cassetto** sopra la pagina, con velo che chiude al tocco, Esc, e
chiusura automatica appena si sceglie una voce.

> ⚠️ **Lo stesso bottone fa due cose opposte, ed è voluto.** Su schermo grande
> la sidebar parte APERTA e il bottone la chiude (preferenza in
> `localStorage`); su telefono parte CHIUSA e il bottone la apre. Sono due
> stati iniziali diversi, non due bottoni: `ToggleSidebar` guarda
> `matchMedia("(max-width: 800px)")` e decide. Lo stato del telefono **non si
> salva**: un cassetto che copre il contenuto non deve ritrovarsi aperto alla
> riapertura dell'app.

> ⚠️ **La preferenza salvata dal desktop non deve tenere chiuso il cassetto.**
> Chi ha chiuso la sidebar dal computer si porta dietro `data-sidebar-chiusa`
> anche sul telefono. `[data-sidebar-mobile] .sidebar` ha la **stessa
> specificità** di `[data-sidebar-chiusa] .sidebar`: vince perché è dichiarata
> dopo. Spostare quel blocco più in alto nel file rimetterebbe il bug.

**«Porta su altre campagne» era illeggibile**: si apriva come `<details>`
*dentro la cella* della tabella, quindi ereditava la larghezza della colonna
keyword — con nomi come `[Cakedesign.me] | LeadGen | ITA` si leggevano tre
parole per riga in una colonnina da 180px, e scegliere la campagna giusta era
indovinare. Ora è un **dialogo** (`<dialog>` nel top layer, 560px, o
schermo−32px sul telefono) con **casella di ricerca**, conteggio delle
selezionate, «Prendi le trovate» / «Togli tutte» e invio disabilitato finché
non se ne sceglie almeno una.

> ⚠️ Nel dialogo ci sono **solo le campagne che erogano** (`stato = "attiva"`, che è
il fatto scritto dall'import: `attiva` = ENABLED su Google): portare una parola
su una campagna ferma non serve a niente. Da 121 a 19, e l'elenco **dichiara**
di essere filtrato — una lista filtrata che non lo dice si legge come «queste
sono tutte».

> ⚠️ **Uno solo per pagina, non uno per riga** — e qui c'era un difetto grosso,
> più vecchio di questa modifica: il `<details>` stampava l'elenco **completo**
> delle campagne dentro **ogni** riga. Misurato su `/keywords?tema=fiori`:
> 1.531 righe × 121 campagne = **185.480 checkbox e 68,6 MB di HTML** per una
> lista che è sempre la stessa. Ora il dialogo è montato una volta in fondo
> alla pagina e le righe portano quattro `data-*` a testa, con un ascoltatore
> delegato che legge dal bottone su quale keyword sta lavorando:
> **68,6 MB → 11,5 MB (−83%)**, 122 checkbox.

> ⚠️ **Un helper condiviso fra server e client non può stare in un modulo
> `"use client"`.** `attributiPortaKeyword` era esportato da
> `components/PortaKeyword.tsx`: `npx tsc --noEmit` passa pulito e la pagina
> esplode a runtime con «Attempted to call attributiPortaKeyword() from the
> server but attributiPortaKeyword is on the client». Sta in
> `src/lib/porta-keyword.ts`. **Il typecheck non vede questo errore: si trova
> solo aprendo la pagina.**

> ⚠️ **Misurare una transizione CSS con la scheda del browser nascosta dà
> numeri falsi.** Le transizioni non avanzano e `getComputedStyle` restituisce
> i valori di partenza: a cassetto chiuso il margine risultava `0` invece di
> `-280px`, cioè "bug" dove non c'era. Si neutralizza con
> `elemento.style.transition = "none"` prima di leggere.

### Lo script esegue davvero (04/08/2026)

`AZIONE = "tutto"` è schedulato **ogni giorno** sugli account, e comprende
`esegui` — che gira per primo, prima delle letture. Alle 07:09 del 04/08 ha
applicato le prime sei operazioni approvate: cinque keyword in pausa e una
negativa. La coda si svuota da sola.

> ⚠️ **Una coda ferma non vuol dire "script non schedulato".** L'errore l'ho
> fatto: ho letto sette operazioni in stato `approvata` e concluso che il
> lavoro `esegui` non girasse, mentre stava semplicemente per passare. Le due
> cose da guardare PRIMA di quella conclusione sono `/ricezione` (chi ha
> consegnato e quando) e la data di `eseguitaIl` sulle operazioni.

> ⚠️ **Un'operazione eseguita NON si annulla dall'app.** Annullarla cambierebbe
> solo l'etichetta: la keyword resta in pausa su Google, e l'app comincia a
> mentire. Per disfare serve l'operazione opposta (riattiva), e per una
> negativa la rimozione a mano — lo script non la toglie.

Le copie configurate per ogni lavoro si rigenerano in
`C:\Users\nicol\Downloads\deluxy-google-ads\` con lo snippet in fondo a
questo file: legge e scrive in **latin1**, perché `google-ads-script.js` ha
byte non-UTF8 e latin1 è l'unico encoding byte-preserving 1:1.


### Il 02/08/2026 (questa sessione)

**L'app girava dall'altra parte dell'oceano.** Home a 10,4 secondi, e la causa
non era una query pesante: `X-Vercel-Id` diceva `fra1::iad1` — richiesta entrata
a Francoforte, funzione eseguita a **Washington**, database a Francoforte. Ogni
query pagava l'andata e ritorno oltre oceano, e una pagina ne fa decine. Una riga
in `vercel.json` (`"regions": ["fra1"]`) e la home è passata a **0,64 s: −94%**.
E la sidebar faceva **19 query su ogni pagina**: ora una sola con i conteggi come
sotto-select più 60 s di cache (`lib/conteggi-sidebar.ts`), e se il database non
risponde mostra zeri ma la pagina si apre.

> ⚠️ **Da controllare per primo quando qualcosa è lento**: l'header
> `X-Vercel-Id`. Se la seconda sigla non è `fra1`, la funzione sta girando
> lontano dal database e nessuna ottimizzazione di query recupererà quel tempo.

**Il risultato atteso** (`lib/risultato.ts`): vendite × 30% di margine meno la
spesa ADV, su `/analisi-campagne` (il conto riga per riga) e in home (un KPI).
Luglio: 98.951 € venduti, 14.030 di ADV, **risultato atteso 15.656 €**, la
pubblicità pesa il 14,2% sul venduto. Il venduto è quello **vero di Shopify** —
i ricavi dichiarati dalle piattaforme sono gonfiati e il margine lo sarebbe due
volte — ed è **tutto** quello del periodo, non solo l'attribuito: la pubblicità
si paga sul fatturato che l'azienda fa. La pagina ripete che **non è un utile**:
sotto non ci sono personale, logistica, commissioni e resi.

**Stato keyword da Google** — nuovo `AZIONE = "stati-keyword"`. Il giro `copy`
filtra `metrics.impressions > 0`, quindi una keyword **in pausa non arrivava
mai** (non ha impressioni per definizione) e nell'app restava "attiva" per
sempre: i bottoni Metti in pausa / Riattiva partivano da uno stato falso. Il
nuovo giro legge tutte le keyword senza filtro impressioni e senza finestra di
date — lo stato non è una metrica, non ha un periodo. Le negative si saltano.

> ⚠️ **Il null che azzera, di nuovo.** Il giro degli stati manda keyword SENZA
> metriche, e `salva()` fa update con tutti i campi passati: quei null avrebbero
> cancellato spesa e clic scritti dal giro dei numeri. I numeri ora si scrivono
> solo se ci sono, e `metricheAl` (la data della fotografia dei NUMERI) non si
> sposta su un giro di soli stati. Provato in produzione: 12,50 € e 9 clic
> sopravvissuti a un update di solo `PAUSED`.

**Città e provincia da Orders.** `cittaDedotta` arriva come **OGGETTO**
(`{ citta, da, prova }`), non come stringa: passarlo intero a Prisma fermava
l'intero import di 8.101 ordini alla prima riga utile. Si estrae `.citta`, e
`.da` va in `cittaFonte` (tag | prodotto). Presa anche `spedizione.provincia`,
sigla normalizzata che risolve meglio il problema per cui la città serviva: in
MI convivono "Milano" (1.000), "Milan" (42) e "MILANO" (14) — come testo erano
tre righe diverse. Fuori dall'Italia la provincia è spesso vuota (Francia,
Lussemburgo), quindi la città serve ancora.

> ⚠️ **Un campo NUOVO non entra negli ordini già presenti** se il controllo «è
> cambiato?» non lo guarda **e** il `select` non lo legge. Il primo giro aveva
> riempito la provincia su 2.068 ordini su 8.139 — solo quelli che cambiavano
> per altri motivi. Vale per qualunque campo si aggiunga in futuro.

> ⚠️ **Gli import lunghi vanno lanciati con `nohup … & disown`**: col solo `&`
> muoiono quando la shell finisce, a metà strada e in silenzio (successo due
> volte lo stesso giorno, a pagina 20 su 41).

**Scheda gruppo e campagna**: andamento **per mese espandibile** (`<details>`
nativi, niente JS, il browser ricorda l'apertura col tasto indietro) al posto di
404 righe giornaliere; grafico dei **dodici mesi** che dice quando si vende, con
lo storico degli anni precedenti sui mesi futuri — dichiarato come media di ciò
che è successo, non previsione; **budget della campagna madre** col flag «unico
gruppo attivo» (se lo è, quel budget è di fatto suo e si dice quanto ne consuma;
se ce ne sono altri se lo dividono in base all'asta); keyword e parole cercate
**in rosso** quando spendono senza rendere, con **Escludi** che mette in coda la
negativa (diversa dalla pausa: vale anche in futuro, su tutta la campagna); e le
due tabelle dichiarano che **non seguono il periodo scelto** — sono fotografie a
finestra fissa, e chi chiedeva 7 giorni leggeva la spesa di un mese.

**Tutte le tabelle ordinabili** con un componente solo montato nel layout
(`TabelleOrdinabili.tsx`): ordina ciò che è già in pagina, senza toccare il
database, e capisce i numeri all'italiana (`1.234,50 €`, `12,3×`) e le date —
senza quello "1.000" finiva prima di "9". `data-no-ordina` esclude le tabelle
dove l'ordine **è** l'informazione.

**Il bottone Sincronizza** sembrava rotto e non lo era: la corsa dura una
ventina di secondi e la pagina restava immobile, senza un segnale. Ora si
disabilita, gira e dice «Sincronizzo…»; sotto, la data in due forme («2 ore fa ·
02/08/2026, 06:08») che diventa arancione dopo tre giorni di silenzio. E quando
non cambia niente dice «già aggiornato, 634 documenti» invece del criptico
«nuovi 0 · aggiornati 0», che somigliava a un fallimento.



### Il budget di vendita arriva da Deluxy Budgets (01/08/2026)

**Il tetto pubblicitario non nasce qui**: nasce dal budget di vendita della maison, che vive in
**deluxy-budgets** — `advConsentito = vendite del mese × % decisa in /spese`. Fino a oggi questa app
ne teneva una **copia propria**, la tabella `BudgetMensile` importata a mano dal foglio «Budget adv»
del Monitoraggio, e non parlava con nessuno. Al momento di collegarle la copia locale conteneva
**nove righe in tutto** — giugno, luglio e agosto per i tre siti — quindi **da settembre in poi qui
non esisteva nessun tetto di spesa**, mentre Budgets sapeva già quanto si poteva spendere fino a
dicembre.

- Client `src/lib/budgets.ts` → `GET /api/v1/maison?anno=` di Budgets, chiave **`BUDGETS_API_KEY`**
  (aggiunta all'ambiente di produzione il 01/08/2026; si risolve con `chiave()`, quindi vale anche
  dalla cassaforte del Hub);
- l'abbinamento **sito → maison** sta scritto in un punto solo (`MAISON_DI_SITO`): `gifts`→Deluxy.it,
  `cake`→CakeDesign.me, `flowers`→Deluxyflowers.com. Verificato end-to-end: ADV consentito 2026
  70.417 € · 18.180 € · 47.224 €;
- in cima a `/budget` il componente `BudgetUfficiale` mostra **tutti e dodici i mesi**: vendite a
  budget, % ADV, ADV consentito, e accanto il budget calcolato qui dal ROS con la **differenza**.

> **Le due cifre restano affiancate e non fuse, di proposito.** Sono due strade per lo stesso numero
> — qui il ROS (vendita prevista ÷ ritorno atteso), là una percentuale sulle vendite — e dove si
> discostano la differenza è **una domanda da fare**, non un errore da nascondere sotto una media.
> Su agosto per esempio coincidono quasi all'euro (6.702 contro 6.700), perché un ROS di 7,46 è
> l'inverso del 13,4%: ma è una coincidenza di derivazione dalla stessa fonte, non un collegamento.
> Un mese senza riga importata mostra **—**, non zero: non è un mese a budget zero, è un mese che
> nessuno ha ancora caricato.

### Il 29/07/2026 (questa sessione)

**Gli asset dicono quanto hanno speso e reso.** Prima non lo dicevano: i 296
sitelink, 129 callout, 4 snippet e 121 immagini in tabella avevano **zero**
clic, zero impressioni, zero spesa. Non era una finestra temporale sbagliata —
`leggiAsset()` nello script Google non chiedeva **nessun** `metrics.*`: mandava
l'anagrafica degli asset, non la loro resa. Alla domanda «quale sitelink rende
di più» non esisteva risposta, né sugli anni né sull'ultimo mese.

Ora la query chiede anche spesa, clic, impressioni, conversioni e valore, con
`segments.date` **solo nella WHERE** — così Google aggrega il periodo in una
riga per asset invece di spaccarlo per giorno. Finestra in `GIORNI_ASSET`
(costante nuova, separata da `GIORNI_COPY`: quella domanda si fa su anni, non su
un mese). Se la vista non regge le metriche — `customer_asset` spesso no — si
ripiega sulla sola anagrafica **dicendolo nel log**, invece di far credere che
l'asset non abbia speso niente.

> ⚠️ **Il null non deve azzerare il numero buono.** `salva()` in
> `ingest/copy/route.ts` fa `update({ data })` con tutti i campi passati: se il
> giro ripiegato sull'anagrafica avesse mandato `spesa: null`, avrebbe
> **cancellato** i numeri del giro riuscito, e la tabella avrebbe detto che quel
> sitelink non ha mai speso niente. I numeri degli asset ora si scrivono **solo
> se ci sono** (`numeriAsset`, costruito campo per campo). Provato davvero in
> produzione: mandato l'asset con 12,34 € e 9 clic, rimandato lo stesso asset
> con tutti null, i numeri sono **sopravvissuti**; riga di test poi rimossa.

Le copie configurate dello script (5 lavori × 3 account) si rigenerano con lo
script generatore: legge e scrive in **latin1**, perché `google-ads-script.js`
ha byte non-UTF8 (box-drawing e accenti in encoding misto) e latin1 è l'unico
encoding byte-preserving 1:1 — modificarlo come UTF-8 corrompe i caratteri.

### Quanto c'è dentro davvero (verificato sul database, 29/07/2026)

| Cosa | Copertura |
| --- | --- |
| Metriche campagna | 4.265 righe, **19/06/2025 → oggi** (i 400 giorni del primo caricamento) |
| Metriche gruppo | 3.472 righe, 23/06/2025 → oggi · 49 gruppi |
| Termini di ricerca | 814 righe, **solo 28/06 → 28/07** (tetto `MAX_TERMINI = 300`) |
| Titoli / descrizioni | 622 / 183 · solo etichetta BEST/GOOD/LOW, nessun numero |
| Campagne | 30 attive · 147 in pausa · **0 bozza · 0 in lancio** |

Le campagne «da lanciare» non stanno in bozza: bozza e in-lancio sono **vuote**,
il serbatoio vero sono le **147 in pausa**.

### Il 28/07/2026

**Vendite Shopify sulla scheda campagna.** Sotto i gruppi c'è il venduto vero:
categorie, ordini, clienti nuovi contro di ritorno, scontrino medio, e i KPI
ROS reale (venduto ÷ spesa), costo di acquisizione (spesa ÷ clienti nuovi),
costo per conversione (spesa ÷ ordini). `lib/vendite-campagna.ts`.

> ⚠️ **Due legami che non vanno confusi, ed è il motivo per cui quel file
> esiste.** L'**attribuzione** è una sola: l'ordine porta scritto l'UTM della
> campagna (`Ordine.utmCampagna`), confrontato coi nomi normalizzati (lo stesso
> `normalizza()` dell'import) più l'id di piattaforma, che alcune campagne Meta
> scrivono al posto del nome. **Solo lì** si calcolano i KPI. Il **contesto** è
> altro: prodotto e lingua *dedotti dal nome* ("[Deluxy] Torte ROMA" → torte,
> italiano). Dice cosa vendeva il negozio mentre la campagna girava, **non** che
> quelle vendite arrivino da lì — nessun KPI ci si appoggia ed è scritto in
> pagina. Gli ordini con UTM che *somiglia* al nome ma non combacia (nomi
> vecchi, campagne divise in ENG/ITA) **non si attribuiscono**: si contano e si
> dicono. Misurato su Torte MILANO: ROS di cassa **2,42×** contro il **4,2×**
> dichiarato da Google.

Il legame di contesto sta in `LegameCampagnaShopify` (campagna → categoria,
lingua, negozio), dedotto e **correggibile a mano dalla scheda**: da lì
`origine = manuale` e nessun giro successivo lo sovrascrive, nemmeno se la
campagna cambia nome. Se il nome non nomina un prodotto (Brand Protection,
generiche) non si deduce niente.

**La lingua taglia i clienti**, non è un'etichetta: `ita` → paese IT, `eng` →
paese diverso da IT, `fra` → FR.

> ⚠️ **Il paese sull'ordine è quello di CONSEGNA, non del cliente.** Su
> deluxy.it e cakedesign.me si consegna in Italia anche quando compra un turista
> o un'azienda estera: su "[Deluxy] - Fiori Milano ENG" il filtro «diverso da
> IT» dava **0 ordini su 121**. Quando succede (meno di 3 su almeno 10) il
> filtro **si spegne da solo** e la pagina spiega perché — uno zero lì si
> leggerebbe come "questa campagna non vende". Su Flowers/Francia invece
> funziona: 18 ordini, tutti FR.

**KPI stimati** (`kpiStimati`), perché la maggior parte delle campagne non ha
nemmeno un ordine con l'UTM che combacia e senza di loro la scheda non direbbe
niente: costo per conversione, costo di acquisizione e ROS calcolati sulle
**conversioni dichiarate dalla piattaforma** e sullo scontrino medio del
contesto. Sono il **pavimento**, non la misura — Google e Meta contano anche
view-through e finestre lunghe, quindi i costi veri sono più alti. Se manca uno
dei due pezzi il numero resta vuoto: mezza stima ha lo stesso aspetto di un dato.

**Trend vendite** (`/trend`, `lib/trend-vendite.ts`): il venduto Shopify mese per
mese e dove sta andando, con proiezione dei prossimi 3/6/12 mesi.
`mese previsto = stesso mese dell'anno scorso × fattore`, dove il fattore sono i
mesi chiusi di quest'anno sugli stessi dell'anno prima — la stagione la porta
l'anno scorso, perché San Valentino e Natale **sono** l'andamento e una retta li
spianerebbe. Misurato 28/07: **+57%** sul 2025 (516.517 € contro 328.333 € su 6
mesi chiusi), anno 2026 stimato **1.204.366 €** contro 765.576 €.
Un mese con meno di 10 ordini l'anno prima non fa da base e resta vuoto; se
l'anno prima non esiste abbastanza (Cake ha aperto a metà 2025) si ripiega sulla
media dei mesi recenti **dichiarando che quella previsione non ha la stagione
dentro**.

**Viste salvate** (`lib/viste.ts`, `components/VisteSalvate.tsx`) su Campagne,
Parole cercate, Keywords e Dashboard per brand: filtri + ordinamento + periodo
con un nome, **condivise** (non per utente), una può essere predefinita.
Parametri salvati in forma canonica (chiavi ordinate, vuoti fuori) o "questa
vista è già attiva" non funzionerebbe mai; fuori i parametri che sono messaggi
di ritorno (`salvata`, `bloccata`, `aggiornamento`). Via d'uscita:
`?vista=libera`.

**Sync Drive: arriva in fondo, e importa le analisi.** Vedi la sezione dedicata
più sotto.

**Due stati campagna nuovi**: `in_lancio` (decisa e pronta, non ancora partita:
conta nei contatori delle vive e genera un'azione «Far partire» con owner
*utente*) e `defunta` (da non considerare mai più: fuori da elenchi, contatori,
`/api/v1/stato`, selettori e `GET /api/v1/campagne` — si chiede apposta con
`?defunte=incluse`). **La spesa di una defunta resta nei totali**: quei soldi
sono usciti davvero. Costanti `STATI_CAMPAGNA_VIVE` e `STATI_CAMPAGNA_IGNORATE`
in `dominio.ts`: le liste di stati non stanno più sparse nel codice.

**Meta si aggiorna da sola, ogni ora** — vedi "Connettori".

### Dati dentro (verificati sul database di produzione, 26/07/2026)

| Cosa | Quanti |
| --- | --- |
| Metriche giornaliere di campagna | **2.730** (19/06/2025 → 26/07/2026) |
| Ordini Shopify **tutti i brand** | **8.032** (01/01/2025 → 26/07/2026), 9.416 righe prodotto — gifts 5.982 · flowers 1.371 · cake 679 |
| Documenti Drive indicizzati | 653 |
| Analisi e audit dai Definitivi | 39 |
| Keyword e annunci | 635 |
| Settimane MKT 2025-2026 | 410 |
| Campagne | 32, di cui **20 agganciate** alla piattaforma (Gifts 12, Flowers 8) |
| Gruppi di annunci | 0 — tabelle pronte, si riempiono al primo giro di `AZIONE = "gruppi"` |
| Pubblici · Landing | 38 · 27 |

### I gruppi di annunci (dal 26/07/2026)

Il gruppo è un **livello vero**, non più un'etichetta attaccata alle keyword:
modello `Gruppo` + `MetricaGruppo` (gemelli di `Campagna`/`MetricaCampagna`,
una riga per gruppo e per giorno, upsert per (gruppo, giorno)).

- **Pagina `/gruppi`**: tutti i gruppi ordinati per spesa, filtri brand /
  campagna / periodo (7-30-90 gg), i due estremi in cima (chi tiene su la
  baracca e chi se la mangia). Voce in sidebar sotto Google Ads.
- **Scheda `/gruppi/[id]`**: KPI, quota di spesa dentro la campagna, andamento,
  metriche giornaliere, keyword e testi che vivono lì, stato dell'app
  (`attivo | vincente | da_valutare | in_pausa | escluso`, mai sovrascritto
  dall'import) e il bottone per metterlo in pausa **su Google**.
- **Scheda campagna**: blocco "Gruppi di annunci" con la quota di spesa di
  ognuno — la media di campagna nasconde il gruppo che brucia.
- **Operazioni `pausa_gruppo` / `attiva_gruppo`**: stessa coda approvata a mano,
  livello **L2** (spostano traffico), guardrail della campagna che li contiene
  (freeze incidenti, blackout 72h, max 1 L2/L3 a settimana contata dal registro).
  L'esito riporta `statoPiattaforma` sul gruppo. I gruppi di asset delle PMax
  **non si fermano da script**: l'app lo dice e lo script si rifiuta.
- Il ROAS del gruppo si legge sul **break-even del suo brand** (`lib/gruppi.ts`,
  `letturaRoas`): lo stesso 2,5 è buono per Cake e una perdita per Gifts.

### Scheda campagna, quattro blocchi nuovi (26/07/2026)

- **Quanto stiamo spendendo oggi**: spesa di oggi (dichiarata *parziale*, con
  l'ora in cui è arrivata), ieri a giornata piena, media dei 7 giorni prima,
  quanto resta del budget e il totale di oggi del brand con la quota di questa
  campagna. I numeri di oggi non si usano per decidere: servono ad accorgersi
  in tempo di un'anomalia.
- **Prossime azioni**: la tasklist. Ogni voce nasce da un numero della campagna
  (`lib/opportunita.ts`, 10 regole: gruppi mancanti, alert aperti, spesa a
  vuoto, sotto break-even, gruppo che si mangia la campagna, gruppo vincente da
  allargare, keyword a vuoto, apprendimento, valore-vs-numero, pacing, dati
  fermi, blackout) e diventa un'**azione vera** del kanban con un bottone. Le
  voci già in lista non si ripropongono.
- **Gruppi di annunci**: sempre visibile, con la quota di spesa di ciascuno.
- **Ultime modifiche**: recap unico di modifiche eseguite (paper-trail),
  operazioni in coda/fallite e voci di registro, in ordine di tempo.

> ⚠️ **Bug trovato e corretto lo stesso giorno**: `GuardrailCampagna`,
> `RotazioneCreativa` (e la nuova `ProssimeAzioni`) leggevano le metriche con
> `orderBy: data asc + take: 60`, cioè i giorni **più vecchi**. Su una campagna
> con un anno di storia il guardrail giudicava dati del 2025: alert A2/A3 mai
> mostrati, ROAS reale vuoto, gate bidding a zero. Ora si prendono i più
> recenti (`desc` + `take`) e si rimettono in ordine di tempo. **Chi aggiunge
> query di metriche: mai `asc` con `take`.**

### La scheda campagna è il posto dove si valuta (26/07/2026)

Ordine della pagina, dall'alto: **titolo con i bottoni di stato** (cambiarlo è
la cosa più frequente, non merita una scheda a parte) → KPI → **oggi** →
poi la valutazione, dal generale al dettaglio:

| Blocco | Risponde a | Da dove viene il dato |
| --- | --- | --- |
| Gruppi di annunci | quale pezzo tiene su la campagna | `AZIONE = "gruppi"` |
| Copertura delle ricerche | quanto altro c'è da prendere, e perché non lo prendiamo | `AZIONE = "metriche"` (quota impressioni) |
| Cosa ha cercato la gente | dove scivolano i soldi davvero | `AZIONE = "diagnosi"` |
| Dove finisce la spesa | telefono/computer, giorno, rete | `AZIONE = "diagnosi"` |
| Cosa vede chi cerca | titoli, descrizioni ed estensioni, con i buchi | `AZIONE = "copy"` + `"asset"` |
| Guardrail | cosa dicono le regole | calcolato |
| Prossime azioni | cosa fare adesso | tutte le fonti sopra |
| Ultime modifiche | cosa è cambiato e quando | paper-trail |

- **Quota impressioni** (`MetricaCampagna.quotaImpressioni / persaBudget /
  persaRank`, 0-1): distingue "limitata dal budget" da "limitata dalla
  posizione". Sono rimedi opposti — alzare il budget a una campagna che perde
  per rank non produce niente. Google non la dà su tutti i tipi di campagna: lo
  script prova con i campi e, se la query viene rifiutata, **riprova senza**.
- **Termini di ricerca** (`TermineRicerca`): i più costosi del periodo, col
  giudizio dell'utente (`nuovo | pertinente | da_escludere | escluso`).
  "Escludi" mette in coda una **negativa** L0 sulla campagna — non tocca Google
  da solo.
- **Segmenti** (`SegmentoCampagna`): una tabella sola per dispositivo, giorno e
  rete, sostituita a ogni passata (sono dati per periodo, non per giorno: se si
  sommassero la campagna sembrerebbe spendere il doppio a ogni import).
- **Prossime azioni** ora ha 18 regole: alle 10 di prima si aggiungono quota
  persa per budget, quota persa per rank, ricerche da escludere, segmento che
  pesa e rende sotto il pari, estensioni mancanti.

### "Aggiorna adesso" (26/07/2026)

Bottone su **Dati in arrivo** e in fondo alla scheda campagna.

- **Meta**: succede subito, è l'app che va a prendere i dati (`aggiornaAdesso`
  in `lib/azioni.ts` chiama la Graph API in-process).
- **Google**: **non si può lanciare uno Script da fuori** — nessuna API lo
  avvia, il verso è l'opposto. Il bottone mette una riga in
  `RichiestaAggiornamento`; **ogni** script, a ogni partenza e prima del proprio
  lavoro, chiama `GET /api/v1/aggiornamenti`, esegue quello che trova col
  periodo chiesto e riferisce su `POST /api/v1/aggiornamenti/:id/esito`.
  Quindi "adesso" = **alla prossima partenza**: per renderlo di minuti basta
  mettere la *Frequenza* di **uno** degli script su "ogni ora".
- Premere due volte non accumula richieste: la seconda ritorna la prima.
- In **anteprima** lo script non chiede e non serve niente.

> ⚠️ **Trappola pagata il 26/07/2026 (Cake, poi Flowers)**: un valore non
> numerico in `GIORNI_INDIETRO` (tipo `7 giorni`) faceva partire la query con
> `segments.date BETWEEN 'NaN-NaN-NaN'`, e Google la rifiutava. Peggio: il
> ripiego della quota impressioni si prendeva la colpa di **qualunque** errore,
> quindi il log diceva "quota non disponibile su questo account" e mandava
> fuori strada. Ora i numeri di configurazione si validano all'avvio (con
> avviso e valore di riserva), `dataIso` rifiuta un periodo non numerico con un
> messaggio esplicito, e il ripiego scatta **solo** su errori che nominano la
> quota. **Regola: un messaggio di ripiego non deve mai poter mentire sulla
> causa.**

### Ordini: si leggono da Deluxy Orders (26/07/2026)

Mancavano Flowers e Cake — c'erano solo i 2.426 ordini di deluxy.it presi
direttamente da Shopify. Ora tutti e tre i brand arrivano dal registro
centrale `deluxy-orders` con `npm run import:ordini-orders` (chiave di sola
lettura in `ORDERS_API_KEY`). Una fonte sola invece di tre token Admin.

- **Verifica di quadratura**: il venduto 2026 in Marketing coincide **all'euro**
  con quello dichiarato da Orders — 601.818 € su 3.415 ordini (gifts 426.182 ·
  flowers 135.816 · cake 39.820), esclusi annullati e rimborsati.
- **Due trappole già pagate**: i brand hanno nomi diversi nelle due app
  (`deluxy.it`/`Flowers`/`cakedesign.me` contro `gifts`/`flowers`/`cake`), e
  gli id no — Orders espone `gid://shopify/Order/123`, qui era salvato il numero
  nudo. Senza ridurlo i 2.426 ordini già presenti sarebbero **rientrati tutti
  come doppioni**.
- **Cosa non arriva**: annullati (esclusi per scelta: restano spesso "pagati" e
  gonfierebbero il fatturato — `--annullati` per averli), e netto merce,
  spedizione e sconto, che Orders non espone. Sulle righe già importate da
  Shopify **non vengono sovrascritti a null**.

### Connettori

- **Google Ads**: `scripts/google-ads-script.js` (**v2**, 26/07/2026) da incollare
  in Google Ads (Strumenti → Azioni collettive → Script), una copia per account e
  per lavoro. Google Ads esegue sempre `main()`: **il lavoro si sceglie con la
  costante `AZIONE`** — `metriche` (giornaliere + strategia d'offerta) ·
  `copy` (keyword e RSA) · `gruppi` (gruppi di annunci con spesa e resa, e
  gruppi di **asset** per le PMax) · `asset` (sitelink/callout/snippet/immagini
  sui 3 livelli) · `approvazioni` (stati di review, alert A4) · `esegui`
  (esegue le operazioni **approvate**) · `tutto`. Config in testa al file: `URL_APP`,
  `CHIAVE_API`, `AZIONE`, `BRAND`, `GIORNI_INDIETRO`, `GIORNI_COPY`,
  `INCLUDI_RIMOSSE`. Nessun developer token: gli Scripts girano dentro l'account.
  - **`BRAND` va impostato** (`flowers` | `gifts` | `cake`): i nomi tipo
    "DC1 Fiori Milano ENG" non dicono il marchio e finirebbero in "cross".
  - In **anteprima** lo script non manda niente all'app: prima della v2
    l'anteprima di `esegui` segnava le operazioni come eseguite senza averle
    eseguite (Google blocca le modifiche ma non le chiamate a internet).
  - Le keyword uguali in più gruppi vengono **sommate** prima dell'invio (l'app
    tiene una riga per campagna+keyword: prima vinceva l'ultimo gruppo letto), e
    gli id mandati all'app contengono l'account (`account:gruppo:criterio`), così
    tre account non si sovrascrivono a vicenda.
  - `esegui` legge la coda **senza filtro account** e salta — senza segnarle
    fallite — le operazioni di altri account; riconosce PMax/Shopping/Video;
    rifiuta i budget **condivisi** e i salti oltre `LIMITE_BUDGET_X`; se l'app
    non registra l'esito si ferma (prima poteva rifare la stessa operazione).
  - Caricamento storico: `GIORNI_INDIETRO = 400` **+ `INCLUDI_RIMOSSE = true`**
    (senza, la spesa delle campagne poi eliminate non entra mai), una volta sola.
  - **Gruppi di annunci**: `AZIONE = "gruppi"` manda **una riga per gruppo e per
    giorno** (finestra `GIORNI_INDIETRO`, come le campagne) a
    `POST /api/v1/ingest` nell'array **`gruppi`**. Le PMax non hanno gruppi di
    annunci: al loro posto arrivano i **gruppi di asset** (vista `asset_group`,
    `tipo = asset_group_pmax`).
  - Banco di prova con Google Ads finto: `scripts/prova-google-ads-script.js`
    (`node scripts/prova-google-ads-script.js`, 51 controlli).
- **Meta**: `src/lib/meta.ts`, logica in `src/lib/sync-meta.ts`, due porte:
  `POST /api/v1/sync/meta` (a mano, chiave di scrittura) e **`GET /api/cron/meta`
  chiamato dal cron di Vercel al minuto 7 di ogni ora** (`vercel.json`, dal
  28/07/2026). Meta non ha gli Scripts: è l'app che chiama la Graph API, e
  finché l'unica porta era la POST i numeri Meta si muovevano solo se qualcuno
  premeva un bottone — il 28/07 Google era a oggi e Meta fermo a ieri.
  - Finestra di **7 giorni**, non 1: Meta consolida le conversioni nei giorni
    dopo, quindi il numero di ieri cambia ancora.
  - L'endpoint è **chiuso** quando manca `CRON_SECRET` (impostato su Vercel il
    28/07), invece di essere aperto: un endpoint aperto per sbaglio non si nota
    finché non è tardi.
  - Il middleware lascia passare `/api/cron/`: col redirect a `/login` il cron
    prenderebbe un **307**, che per Vercel è una corsa *riuscita* con zero dati.
    È la stessa trappola che faceva risultare deluxy-budgets giù nel Hub.
  - Serve `META_ACCESS_TOKEN` (utente di sistema del Business Manager, non
    scade). Valore e conversioni **solo** da `omni_purchase`. Gli account sono
    già censiti in Impostazioni.
- Il salvataggio è condiviso: `src/lib/ingest-metriche.ts`. Google spinge
  (`/api/v1/ingest`), Meta viene interrogata, ma la logica di riconoscimento
  campagne e aggiornamento per giorno è la stessa.

### Un periodo solo per tutta l'app (28/07/2026)

`lib/periodo-condiviso.ts`. La scelta del periodo si **ricorda** (Impostazioni
`periodo.preset` / `periodo.da` / `periodo.a`, **condivisa** come le viste
salvate) e vale su dashboard, analisi periodo, scheda brand, **scheda
campagna**, lettura AI e dati in arrivo. Prima ogni pagina si teneva il suo:
si sceglieva "mese scorso" sulla dashboard e la scheda brand tornava a 30
giorni senza dirlo — due numeri letti a due minuti di distanza sembravano
confrontabili e non lo erano.

Gli indirizzi restano completi (`?preset=mese-scorso`): un link incollato
mostra quello che mostrava a chi l'ha copiato. La scheda campagna ha il suo
selettore, e KPI, gruppi, grafico e metriche seguono il periodo (prima era
inchiodata agli "ultimi 60 giorni registrati", che non è un periodo).

### Lo stato di un gruppo: il fatto prima del giudizio (28/07/2026)

> ⚠️ Un gruppo **fermo su Google** si leggeva «● Attivo» col pallino verde.
> Non era un dato sbagliato: `Gruppo.stato` è il **giudizio dell'app** (nasce
> "attivo" e l'import non lo tocca mai, apposta) e `statoPiattaforma` è **cosa
> dice Google**. Era la colonna a rispondere alla domanda sbagliata — chi la
> guarda vuole sapere se *sta girando*. Ora comanda il fatto («In pausa su
> Google», arancione) e il giudizio scende sotto («nell'app: Attivo»).
> Un posto solo: `presentazioneStatoGruppo` in `lib/gruppi.ts`. Riguardava 3
> gruppi su 49.

### Spesa e incasso per canale (scheda brand, 28/07/2026)

`numeriPerCanale` in `lib/brand-dati.ts`: la media di brand nasconde chi tiene
su la baracca e chi se la mangia (Gifts a giugno — Google 2.184 € a 3,46×,
Meta 345 € con **zero** incasso dichiarato). L'incasso è quello che il canale
**si attribuisce**, quindi di parte; le vendite Shopify **non si sanno
spezzare per canale** (l'UTM c'è su una minoranza di ordini), quindi il MER
resta un numero di brand e la tabella non finge di poterlo dividere.

### Le due tabelle della scheda campagna, e cosa farne (28/07/2026)

**Parole cercate** (`TerminiRicerca`) e **keyword** (`KeywordCampagna`) stanno
una sopra l'altra apposta: sono cosa ci hanno chiesto e cosa abbiamo comprato,
e la distanza fra le due è dove si nascondono i soldi. Colonne ordinabili
(parametri separati: `ord`/`verso` per i termini, `ordk`/`versok` per le
keyword — se li condividessero si riordinerebbero insieme).

> ⚠️ **Le parole cercate costavano la metà.** Google manda una riga per ogni
> coppia (parola × keyword): la stessa ricerca intercettata da due keyword
> arriva **due volte con la spesa spezzata**. L'app tiene una riga per
> (campagna, testo) e faceva `update` → vinceva l'ultima letta. Ora si somma in
> **due** punti (script prima di spedire + ingest, che non può fidarsi del
> mittente) e la riga dice «+N altre keyword, numeri sommati» (`keywordDiverse`).
> **I numeri già nel database restano sottostimati fino al primo giro con
> `AZIONE = "diagnosi"`.**

> ⚠️ **Le keyword stanno sotto il nome VECCHIO della campagna.** Quelle
> importate dal Monitoraggio hanno i nomi della 00.4 (`FIORI MILANO ENG`), la
> piattaforma usa i suoi (`[Deluxy] - Fiori Milano ENG`): col confronto esatto
> la tabella mostrava 60 keyword tutte a 0,00 €. Si confronta col nome
> **normalizzato**. E le righe dal Monitoraggio hanno l'incasso ma **non** il
> numero di conversioni: «spende a vuoto» vuol dire né conversioni **né**
> incasso, o una keyword che ha reso 3.817 € finiva fra quelle a vuoto.

### Le proposte dell'AI, e ideali vs specifiche (28/07/2026)

`lib/proposte-ai.ts` + `PropostaAi`. Per ogni keyword e ogni parola cercata
l'AI dice **cosa farne** (tieni · osserva · alza · abbassa · pausa · escludi ·
aggiungi) col numero da cui nasce la decisione e la fiducia dichiarata.

- **Propone, non decide**: la proposta resta scritta finché una persona non
  l'accetta, e accettarla **mette in coda** un'operazione da approvare. La
  catena app → coda → approvazione → script resta intera. Fiducia `bassa` =
  mostrata ma non eseguibile.
- **Niente pareri su dati che non ci sono**: sotto 10 clic *e* 15 € la parola
  non viene nemmeno mandata all'AI — l'azione è `osserva` e la decide il codice
  col motivo vero. Misurato: 22 giudicate, 70 lasciate a osservare.
- I numeri si **congelano** in `numeri`: una proposta riletta fra un mese deve
  dire su cosa era stata fatta.
- **`ideal` vs `specific`**: ideale = descrive quello che vendiamo e varrebbe
  altrove (`flower delivery in milan`); specifica = legata a un caso solo
  (concorrente, insegna, storpiatura, il nostro marchio). **Nel dubbio
  specifica**: una ideale sbagliata viene proposta a tutte le altre campagne e
  propaga l'errore. Da qui il blocco **«Ideali che qui mancano»**, che confronta
  solo le ideali, sulle *parole* e non sulla stringa, e mostra spesa e resa
  **dell'altra campagna** (là funziona, non è detto che qui funzioni).
  Per vederlo pieno serve aver fatto girare l'AI su **almeno due campagne dello
  stesso brand**.

**Escludere una keyword** dalla scheda: due bottoni, e la differenza conta —
`pausa_keyword` ferma quella keyword, `negativa` chiude anche le ricerche
simili, comprese quelle che oggi arrivano da altre keyword. Lo script esegue
entrambe dopo l'approvazione; le PMax non accettano negative da script.

> ⚠️ **Il testo con cui una keyword si mostra non è quello con cui esiste su
> Google**: il Monitoraggio ci attacca il tipo di corrispondenza, e in coda
> finiva `flower milan (match esatto)` — lo script avrebbe cercato una keyword
> inesistente e sarebbe tornato «bersaglio non trovato». `testoKeywordPulito`
> (in **dominio.ts**, non in azioni.ts: un file `"use server"` può esportare
> solo funzioni async, e il typecheck non lo vede) toglie solo una parentesi
> finale che contiene *solo* parole di corrispondenza.

### Sezioni dell'app

Dashboard (con le tessere dei brand in cima) · Lettura AI · Analisi periodo ·
Analisi · Stato account · Azioni · Campagne (+ lancio su Google Ads) ·
**Gruppi di annunci** · Landing ·
Pubblici · Copy & annunci · Keywords (+ operazioni keyword) · Meta & test ·
Ordini · Analisi per offerta · **Trend vendite** · Budget vendite/ADV · MKT vs 2025 · Operazioni ·
Occasioni · Cadenze · Storico errori · Memoria condivisa · Incongruenze ·
**Dati in arrivo** · Documenti Drive · Storico · Impostazioni · Dashboard per brand.

### Guardrail (dai Definitivi e dalle ISTRUZIONI di progetto)

In `src/lib/guardrail.ts` e `src/lib/copy-lint.ts`: classe TRAINO con
candidatura automatica, **alert A1-A5** (A4 incluso), change control L0-L3
(blackout 72h, ±20% budget, mai ven-dom su traino, rollback per L2/L3,
**max 1 L2/L3 a settimana**, **add-before-pause** da ERR-2026-001),
break-even ROAS per brand (Gifts 3,33 · Flowers 2,5 · Cake 2,0), freeze da
incidenti aperti, **check VALORE vs NUMERO** obbligatorio, lint copy 7.2/7.3.

### Scrittura verso le piattaforme

Mai diretta. Ogni modifica entra in coda (`OperazioneAdv`) come "da approvare",
il guardrail valida **prima** di accodare, e solo dopo approvazione manuale lo
script la esegue e riferisce; all'esito nasce la `Modifica` (→ blackout 72h) e
le verifiche +24h/+72h. Vale anche per keyword nuove, negative e campagne nuove
(che nascono **in pausa**: si accendono a mano dopo la checklist 4.1).

### API per le altre app

- `GET /api/v1/spesa` — quanto si spende **davvero**, con blocco `copertura`
  (chi alimenta, chi tace, giorni coperti, flag `completa`). Documentata nel README.
- `GET /api/v1/ordini`, `/api/v1/campagne`, `/api/v1/stato`, POST di ingest.
- Chiavi: `npm run chiave -- <nome> [--sola-lettura]`.

### Onestà sui dati

- `FreschezzaDati` avvisa quando le metriche si fermano (arancione da 2 giorni,
  rosso da 3), su dashboard brand, analisi periodo e scheda campagna.
- Pagina **Dati in arrivo** (`/ricezione`): chi manda, cosa, con quale chiave,
  e quali account censiti **tacciono**.
- `tipoConversione` distingue **vendite** da **lead**: le B2B hanno valore
  conversione 1,00 € e col ROAS sembrerebbero in perdita. Dedotto sul valore
  medio per conversione degli **ultimi 90 giorni** (la finestra conta: Torte
  MILANO ha 5,10 € di media storica ma 95 € oggi).

### Sync Drive: ripartibile, e le analisi diventano Analisi (28/07/2026)

Erano due problemi diversi.

**(a) Si fermava a metà.** Il 28/07 aveva toccato 179 documenti su 669 senza
lasciare niente nel registro. La colpa non era del Drive: era **una query per
file** — `findUnique` + `update` per ognuno, più una `update` a vuoto sugli
invariati solo per riscrivere `sincronizzatoIl`, più una `delete` per ogni file
sparito: ~1.350 andate e ritorno. Ora una lettura sola dell'indice, confronto in
memoria, `createMany` per i nuovi, `update` solo per quelli davvero cambiati,
una `deleteMany` per gli spariti. **Sugli invariati non si scrive più niente**:
la data dell'ultima sync si legge dalla corsa, non dall'ultimo documento.

La corsa si annota in **`SyncDrive` prima di cominciare**: anche una sync morta
lascia scritto che è morta. Se il tempo sta per finire (`DRIVE_SYNC_BUDGET_MS`,
45 s) si ferma da sola, segna dove era arrivata e **la prossima riparte da lì**;
una passata parziale **non cancella** i file mancanti (con un elenco a metà si
svuoterebbe mezzo indice). Provato davvero abbassando il budget a 4 s.

**(b) Le analisi su Drive non diventavano `Analisi`.** La sync indicizzava solo
`DocumentoDrive`; le `Analisi` le creava solo `scripts/deposita-analisi.mjs`,
cioè una sessione a mano. Ora `lib/analisi-drive.ts` crea un'Analisi per ogni
documento di categoria *analisi*/*audit* non ancora legato (chiave:
`Analisi.fileDrive = DocumentoDrive.percorso`, che è anche l'idempotenza). Dei
`.md`/`.txt` legge le prime righe come sintesi; degli `.xlsx` scrive che il
documento **non è stato letto**, invece di inventare.

> ⚠️ **Restano fuori archivi e documenti marcati `SUPERATO`**: la *categoria*
> non basta a tenerli fuori — un file in `.../Analisi/Archivio/` viene
> classificato `analisi`, perché la regola dell'archivio arriva dopo. Alla prima
> passata erano entrate 33 analisi già superate; il filtro è in
> `daNonImportare()`, replicato anche in `scripts/sync-drive.mjs`.

Numeri veri del 28/07: corsa completa **594 documenti in 24,7 s** (7 nuovi, 6
aggiornati, **101 spariti** che l'indice si portava dietro dalle sync morte, 25
analisi importate); seconda corsa 0 scritture.

## MANCA

### Punti aperti al 01/08/2026 (in cima perché sono i più freschi)

- **Date di FINE campagna — feature iniziata e RITIRATA, da rifare intera.**
  L'1/8 una sessione multi-agente ha scoperto live che `DC9 Regali B2B` ha una
  **end date 31/08/2026** su Google, ignota all'app (risulta attiva e senza
  scadenza). Una campagna con end date **si spegne da sola** quel giorno, e nel-
  l'app sembra solo che smetta di spendere — indistinguibile da un calo. L'utente
  ha chiesto di **registrare le date di fine per tutte le campagne**. La catena è
  rotta in **tre punti** e nessuno da solo basta: (1) `scripts/google-ads-script.js`
  non legge `campaign.end_date`/`start_date` (0 occorrenze); (2) `RigaMetrica` in
  `ingest-metriche.ts` non ha i campi; (3) `salvaMetriche` non scrive
  `Campagna.inizio`/`.fine`. ⚠️ **Trappola già individuata**: Google usa
  **`2037-12-30` come sentinella di «nessuna fine»** — va tradotto in `null`, o
  l'app si riempie di finte scadenze 2037. Un abbozzo (tipo + helper `dataCampagna`)
  era stato scritto e **poi tolto** per non lasciare codice a metà nel repo: si
  riparte da zero ma il disegno è questo.

- **Tre APPEND ADV Gifts nuovi sul Drive (01/08 20:15), NON ancora indicizzati.**
  `ads/Definitivi/APPEND 00.2|00.3|00.4 ADV-Gifts 2026-08-01 2015.md`, da una
  sessione multi-agente (analisi Google live + Meta documentale + audit + 3
  verificatori ostili). La **sync Drive è fallita** (DB irraggiungibile, vedi
  sotto): rilanciare `npm run sync-drive` quando il Postgres risponde. Dentro,
  cose che toccano l'app: **DC9 end date** (sopra); **DC5 Roma italian** ha lingua
  targeting EN+IT mentre la scheda dice ITA (drift); **policy Alcohol** = 12
  annunci "Limited" su 10/12 campagne (critico, l'app non lo vede).

- **Break-even Meta con la DST Italia 3% — IN ATTESA DEL CUSTODE, non applicare.**
  Gli APPEND propongono BE Meta `3,33 × 1,03 = 3,43` per Gifts (DST dal 1/7/26).
  È la **proposta n.4 al custode, ancora APERTA**. L'utente ha deciso il 01/08 di
  **aspettare**: non toccare `MARGINE_BRAND`/`breakEvenRoas` in `guardrail.ts`
  finché non c'è risposta — cambia la soglia sopra/sotto di ogni keyword, gruppo,
  sitelink e del wizard.

- **Il Postgres condiviso rifiutava connessioni** (01/08 sera): `Can't reach
  database server … pooler.supabase.com:6543` e P2024 a raffica in dev. Con
  `connection_limit=5` la sola Sidebar fa ~8 query a pagina: due dev server sullo
  stesso DB lo saturano. **In produzione regge oggi perché il traffico è basso**,
  ma è il primo punto che cede. Candidato n.1 da alzare.

- ~~**Cron ordini una volta a notte**~~ — **fatto il 04/08/2026**: `20 */3 * * *`.

- **TikTok completamente scollegato** (0 account, 0 token, 0 consegne). Il
  connettore `lib/tiktok.ts` c'è e funziona, ma serve access token + advertiser id
  in Impostazioni, e **manca il cron** (staleness silenziosa come Meta pre-28/07).
  Da fare solo se su TikTok si spende davvero.

0. ~~**Token Meta non autorizzato sugli account**~~ — **RISOLTO il 29/07/2026.**
   Bastava assegnare i tre account pubblicitari all'utente di sistema in
   Business Settings (Utenti → Utenti di sistema → Aggiungi risorse → Account
   pubblicitari, permesso «Visualizza prestazioni» = `ads_read`). **Il token
   non è stato rigenerato**: non serviva.

   > ⚠️ **`403 (#200)` e `190` sono due guasti diversi e si curano in due modi
   > opposti.** Il `190 Invalid OAuth access token` è il token: scaduto o
   > sbagliato, va rigenerato. Il **`#200 Ad account owner has NOT grant…`** è
   > l'esatto contrario: il token è **valido e autenticato**, ma l'utente di
   > sistema non ha accesso a *quegli asset*. Si risolve in Business Manager,
   > non toccando il token — cercare di rigenerarlo non produce niente.

   Verificato subito dopo: **zero errori** sui tre account. Recuperato anche
   tutto lo storico: da 382 righe dal 28/01/2026 a **2.120 righe dal
   01/01/2025**, **42.300 €** di spesa, 69 campagne.

   | brand | campagne | righe | spesa |
   | --- | --- | --- | --- |
   | gifts | 49 | 1.360 | 35.036 € (83%) |
   | flowers | 13 | 431 | 3.896 € (9%) |
   | cake | 7 | 329 | 3.368 € (8%) |
   | **cross** | **0** | **0** | **0 €** |

   Flowers e Cake non hanno nulla fra luglio e dicembre 2025: le loro campagne
   Meta sono nate dopo, non è un buco da riempire.

   > ⚠️ **Chiedere UN account per id faceva perdere il brand.** `sync-meta`
   > costruiva l'oggetto account con `brand: undefined` senza guardare i
   > censiti: ogni sync mirata — un backfill, una prova — importava le campagne
   > senza brand, e quelle il cui *nome* non nomina il marchio finivano in
   > `cross`. Erano **451 righe e 12.339 €**, il 61% della spesa Meta,
   > invisibili in ogni vista per brand. Ora l'account passato per id eredita
   > il brand dai censiti, e le campagne già sbagliate si promuovono da sole al
   > primo giro utile — **solo da `cross` verso un brand noto**, mai il
   > contrario: un brand deciso a mano non si tocca. `cross` non vuol dire «di
   > tutti i marchi», vuol dire «non lo so».

   **Lo storico Meta prima del 28/01/2026 c'è, ma va preso a scaglioni.**
   `POST /api/v1/sync/meta` accetta `account`, `dal` e `al` oltre a `giorni`:
   servono quelli, perché `{giorni: 400}` muore in
   **`FUNCTION_INVOCATION_TIMEOUT`** (provato) e persino sei mesi su un solo
   account non ce la fanno. Misura vera: **un mese di un account = 3m06s**,
   120 righe, 5 campagne nuove (dicembre 2025).
   Il collo di bottiglia **non era Meta, era il salvataggio** — ed è stato
   tolto lo stesso giorno (vedi qui sotto).
   La route `sync/meta` **non ha `maxDuration`** (il cron sì, 60 s): se un
   giorno si vuole allungare la finestra, è lì che va messo.

### L'obiettivo del mese è quello del budget (31/07/2026)

La dashboard leggeva `VenditaMensile.vendite`, il piano **SALES GLOBAL** del
Monitoraggio. Per Flowers quel piano diceva **143.040 €** a luglio 2026 contro
**31.948 €** venduti davvero, e **2,08 milioni** sull'anno contro 140.252 € in
sette mesi: **quindici volte la realtà**.

Non era un errore di import — le quote mensili sommano a 1, il budget ADV è
proporzionale — ma un piano mai riallineato. E il numero giusto era già nello
stesso file, in un altro foglio: `BudgetMensile.venditaPrevista`, **30.000 €**
contro 31.948 venduti.

> ⚠️ **Un obiettivo che sbaglia di quindici volte non è un obiettivo severo: è
> un numero che non si può leggere.** La barra segnava 23% e sembrava un
> disastro mentre il mese stava andando bene.

| | prima | adesso |
| --- | --- | --- |
| Gifts | 104.440 € · 57% | **65.000 € · 91%** |
| Flowers | 143.040 € · 23% | **30.000 € · 110%** |
| Cake | 5.000 € · 133% | **8.000 € · 83%** |
| Totale | 252.480 € · 39% | **103.000 € · 96%** |

Il piano resta nel database e nella pagina Vendite: non guida più il semaforo.
Il totale ora si **somma dalle righe mostrate**, non da una query sua: se le due
strade divergessero, «Tutti i brand» non combacerebbe con la somma di quello
che ha sopra.

> ℹ️ **`VenditaMensile` non ha righe per il 2025, ed è giusto così: nel 2025 il
> budget non si faceva** (confermato dall'utente il 31/07/2026). Non è un import
> fallito, non c'è niente da riempire. I confronti anno su anno non passano di
> lì: il trend vendite usa gli **Ordini** (dal 01/01/2025) e «MKT vs 2025» usa
> `SettimanaMkt`.

### Una campagna nuova nasce da ciò che funziona (31/07/2026)

`/campagne/crea` (+ `lib/nuova-campagna.ts`). `/campagne/lancia` resta, ma è un
foglio bianco: chiede di ricordarsi a memoria quali parole rendono. Qui si
scelgono **brand → prodotto → città** e il resto arriva dallo storico.

- Le **categorie** sono quelle che il negozio vende davvero, col venduto a
  fianco (`servizio` escluso: spedizioni e gift card non si promuovono).
- Le **keyword** proposte sono solo quelle sopra il break-even **del brand**,
  con almeno 10 clic e 20 € alle spalle.
- Il pezzo che vale: **le keyword di un'altra città vengono riscritte**,
  traducendo la lingua — `fiori milano` (12,5×) → `fiori napoli`,
  `flower delivery in milan` → `flower delivery in naples`.
- Il traguardo è lo **stesso modulo di `/lancia`** e chiama `lanciaCampagna`:
  lint 7.2/7.3, coda, approvazione a mano, campagna che nasce **in pausa**. Un
  suggeritore che scavalcasse l'approvazione sarebbe un modo elegante di
  perdere il controllo.
- I **titoli** sono dichiarati per quello che sono — *usati dalle campagne
  affini*, **non «i migliori»**: Google non assegna un rendimento a quegli asset
  (tutti `NOT_APPLICABLE`) e fingere di saperlo sarebbe un numero inventato.

> ⚠️ **Trovato aprendo la pagina davvero**: `flowers delivery Como` veniva
> proposta **per Napoli**, perché Como non era fra le città riconosciute — e
> sarebbe finita in una campagna vera con la città sbagliata dentro. `CITTA_NOTE`
> ora ha 40 città, più `scartaSeAltraCitta()` che butta le keyword contenenti un
> luogo sconosciuto. **Chi aggiunge una città alle campagne la aggiunga anche
> lì.** Nel dubbio si scarta: un suggerimento in meno non costa niente.

### Impostazioni: due trappole sui token (31/07/2026)

> ⚠️ **La chiave del Drive si cancellava premendo «Salva».**
> `salvaApiKeyDrive` scriveva `valore: chiaveApi ?? ""`. La casella non può
> mostrare la chiave salvata — i segreti non si rileggono mai — quindi si trova
> **sempre vuota**: bastava premere Salva senza scrivere per spegnere la sync
> del Drive, in silenzio. E il placeholder prometteva già «lascia vuoto per non
> cambiarla»: promessa e comportamento andavano in direzioni opposte, e vinceva
> il codice. Ora il vuoto non tocca niente e c'è la spunta esplicita, come per
> chiavi AI, TikTok e credenziali Drive.

> ⚠️ **`[^@s]` non esclude gli spazi, esclude la lettera «s».** Due backslash
> mancanti nella validazione dell'email di impersonazione Drive: gli indirizzi
> con una s — `assistenza@`, `mario.rossi@` — venivano respinti come «non
> valida», e il messaggio dava la colpa all'indirizzo invece che al controllo.
> Misurato: 2 indirizzi normali su 4 rifiutati prima, 0 dopo.

### Gli ordini si aggiornano da soli (29/07/2026)

`GET /api/cron/ordini`, ogni notte alle **03:20 UTC** (`vercel.json`), più la
gemella a richiesta `POST /api/v1/sync/ordini` (chiave di scrittura). Logica
condivisa in `lib/sync-ordini.ts`.

Prima l'unico modo era `npm run import:ordini-orders` **dal PC di qualcuno**, e
il 29/07 la spesa era aggiornata a oggi e gli ordini fermi al **27**.

> ⚠️ **Due giorni di sfasamento non si vedono: si vedono dei rapporti sbagliati.**
> Gli ordini sono la metà «vendite» di ogni KPI — ROS reale, MER, costo di
> acquisizione. Con la spesa che corre e le vendite ferme, quei numeri risultano
> **peggiori del vero** e non lo dichiarano. È lo stesso difetto che aveva Meta
> finché l'unica porta era un bottone.

- Finestra di **7 giorni**, non 1: un ordine cambia stato dopo essere stato
  creato (rimborso, annullamento).
- Si **ferma da sola** a 45 s dei 60 di `maxDuration`, dicendo a che pagina è
  arrivata: il resto entra al giro dopo. Per i caricamenti storici lunghi resta
  lo **script**, che non ha il limite delle funzioni serverless.
- Serve **`ORDERS_API_KEY`** fra le variabili d'ambiente (impostata su
  Production il 29/07): senza, l'endpoint risponde 503 spiegandolo, invece di
  fallire in silenzio.
- La consegna si annota in `RicezioneDati` (`fonte: "orders"`), così **Dati in
  arrivo** sa dire anche degli ordini: una fonte che tace è esattamente ciò che
  quella pagina esiste per mostrare.

Provato in produzione: **45 ordini nuovi** (proprio il buco dei due giorni), 2
aggiornati, 74 invariati, 0 saltati, in 42 s. Ordini ora **8.080, fino a oggi**.

### L'import non fa più una query per riga (29/07/2026)

`salvaMetriche` faceva una `findFirst` **per ogni riga** per ritrovare la
campagna: con 30 giorni della stessa campagna erano 29 query che riscoprivano
ogni volta la stessa cosa, più una `findMany` di tutte le censite ogni volta
che un nome non combaciava, più un `update` di stato/budget ripetuto a ogni
riga. Su Postgres remoto con `connection_limit=5` l'attesa di rete era tutto
il costo dell'import.

Ora le campagne si caricano **una volta sola** in tre mappe (per id, per nome,
e le censite senza id), gli aggiornamenti di campagna si applicano **una volta
per campagna** invece che per riga, e gli upsert delle metriche vanno a gruppi
di **4 in parallelo** — quattro e non cinque: l'ultima connessione resta libera
per chi sta usando l'app in quel momento.

> ⚠️ **La campagna appena creata va rimessa subito nelle mappe.** Senza, la
> seconda riga della stessa campagna non la troverebbe e ne creerebbe un'altra:
> trenta giorni, trenta doppioni. È il motivo per cui il codice riscrive
> `perId`/`perNome`/`senzaId` dopo ogni create.

> ⚠️ **Chi accumula deve FONDERE, non sostituire** — pagata lo stesso giorno,
> poche ore dopo. Il ramo che annota stato e budget faceva `daAggiornare.set()`
> sovrascrivendo la voce: la riga 2 di una campagna cancellava il `brand` che
> la riga 1 aveva appena promosso, e la promozione non riscattava perché la
> cache in memoria diceva già il brand giusto. Il dato corretto spariva prima
> di arrivare al database. **È il rischio che questa ottimizzazione introduce**:
> passando da «una query per riga» a «accumula e scrivi in fondo», l'ordine
> delle scritture in memoria diventa qualcosa di cui rispondere.
> L'ha smascherata un numero: `cross` sceso al 41% invece che a zero era troppo
> preciso per essere un caso.

**Misurato sullo stesso lavoro**, un mese di un account Meta:
**3m06s → 35s** (120 righe a 1,55 s/riga contro 99 righe a 0,36 s/riga).
Ne guadagna anche ogni ingest quotidiano di Google, che passa dalla stessa
funzione.
1. **Chiave OpenAI** — la sezione `/ai` è pronta ma dirà che serve
   `OPENAI_API_KEY`: va nella cassaforte del Hub (progetto `deluxy-marketing`,
   più `HUB_KEYS_TOKEN` su Vercel) o come variabile su Vercel.
2. **Token Meta** — `META_ACCESS_TOKEN` su Vercel. Istruzioni: app su
   developers.facebook.com (tipo Azienda) → utente di sistema in Business
   Manager → assegnare i 3 account (Gifts 2802316249885506, Flowers
   965988141913909, Cake 1040175814157216) → token con `ads_read`.
   ⚠️ Il portfolio `1298043513875111` è **disabilitato da Meta**: mai usarlo.
   L'account `45888139` "Owned by deluxy.it" non si usa (ISTRUZIONI Gifts).
3. ~~**Script Google su Cake**~~ — **installato**: verificato il 29/07, Cake
   (846-090-5423) consegna dal 26/07, **27 consegne**, ultima il 28/07 alle
   10:45. Tutti e tre gli account hanno lavorato negli stessi giorni.
4. **Schedulazione: attiva su GIFTS, manca su Flowers e Cake** (verificato
   31/07). La prova è l'orario della prima consegna di ogni giorno:

   | | 28/07 | 29/07 | 30/07 | 31/07 |
   | --- | --- | --- | --- | --- |
   | **Gifts** | 09:00 | 09:46 | **03:47** | **03:47** ✅ |
   | Flowers | 10:19 | — | 07:56 | — |
   | Cake | 10:20 | — | 07:50 | — |

   Gifts gira due giorni di fila **all'ora identica**: è la firma di una
   schedulazione vera. Gli altri due hanno orari sparsi e **saltano giorni**:
   sono lanci a mano.

   ✅ **`AZIONE = "tutto"` ci sta, `copy` incluso**: il 31/07 Gifts ha fatto il
   giro completo in **22 minuti** (03:47 → 04:09) — anagrafica, diagnosi,
   metriche, gruppi, asset **e copy**. Il timore che gli ultimi due saltassero
   era infondato con `GIORNI_COPY = 30` e `GIORNI_ASSET = 90`: non serve
   spezzare in `G1`…`G7`.

   ⚠️ **Flowers ha lo storico corto**: parte dal **21/06/2025** invece che dal
   2024 come Gifts (20/05/2024) e Cake (27/06/2024). Su quell'account `S1`/`S2`
   non hanno fatto il giro da 800 giorni.
   ⚠️ **Non si risolve dal codice**: gli Apps Script non possono auto-programmarsi,
   la frequenza è una proprietà dell'account (colonna *Frequenza* nella lista
   degli script). Va impostata **su ogni account**, e `GIORNI_INDIETRO = 7`
   (800 solo per il caricamento storico, una volta sola).
   ⚠️ Con `AZIONE = "tutto"` i 7 lavori **non ci stanno** nei 30 minuti che
   Google concede: misurato il 26/07, le sole metriche di Gifts hanno preso
   31 minuti (10:06 → 10:37). `copy` e `asset`, ultimi in coda, rischiano di
   non arrivare **mai** senza che nessuno se ne accorga. Meglio una copia per
   lavoro, con frequenze diverse.
5. **Chiave Google Drive API** — `GOOGLE_DRIVE_API_KEY` per la sync del Drive
   **dal server**: da Vercel la cartella `G:\` non esiste. Senza chiave l'indice
   si aggiorna solo lanciando `npm run sync-drive` dal PC.
6. ~~**Ordini Flowers e Cake**~~ — **fatto il 26/07/2026**: arrivano dal registro
   centrale con `npm run import:ordini-orders`, non più da Shopify.
7. **Meta: scrittura** — il connettore oggi **legge** soltanto. Per scrivere
   servirebbe `ads_management` e la stessa coda approvata di Google.
8. **PR** — `scout-ui` è avanti di **477 commit** su `main`: una PR conterrebbe
   il lavoro di molte sessioni e tutte le app. Se serve una PR revisionabile,
   va fatto un branch nuovo con i soli commit di `deluxy-marketing`.
   `gh` non è installato su questa macchina.

## Trappole già pagate

- **Non buildare col dev server attivo**: la cache `.next` si corrompe
  ("Cannot find module './331.js'", pagine senza CSS). Fermare il preview,
  `rm -rf .next`, ricostruire.
- **`prisma generate` col dev server attivo** → EPERM sulla dll del query
  engine. Fermare il server prima di `db:push`/`generate`.
- **Heredoc bash e template literal** non convivono: `${...}` viene espanso
  dalla shell e corrompe i file. Scrivere blocchi con lo strumento Write o
  con Edit, non con `cat <<EOF`.
- **`DURING LAST_N_DAYS`** in GAQL accetta solo pochi valori fissi: con altri
  numeri lo script si rompe. Ora la query usa date esplicite (`BETWEEN`).
- **`apiVersion` fissata** negli `AdsApp.search`: Google ritira le versioni
  (v18 non è più supportata). Ora non è più specificata.
- **Nomi campagna diversi fra 00.4 e piattaforma** ("DC1 Fiori Milano ENG" vs
  "[Deluxy] - Fiori Milano ENG"): il primo import creò 12 doppie. Ora l'ingest
  confronta i nomi normalizzati (via prefissi in parentesi quadre, codici
  DC/DF/DT, eng=english, ita=italian).
- **Mai `deleteMany` globali** sul Postgres condiviso per pulire i test:
  cancellerebbe dati reali. Filtrare solo i record creati dal test.
- **`esporta-dati.mjs` non va importato** da altri script: eseguirebbe il suo
  codice azzerando il file. L'ordine tabelle sta in `scripts/tabelle.mjs`.
- **Mai una query per riga** su una funzione che gira su Vercel: è così che la
  sync del Drive moriva a metà (§ Sync Drive). Una lettura, il diff in memoria,
  scritture in blocco.
- **Il `name`/`value` di un bottone submit non arriva nelle server action**: il
  valore si lega con `.bind(null, valore)` e `formAction` (già così per gli
  stati campagna, il legame Shopify e le viste salvate).
- **Un redirect del middleware su un endpoint di servizio è un 307**, e per chi
  lo chiama (cron Vercel, pagina Stato del Hub) un 307 sembra "andato bene".
  `/api/health` e `/api/cron/` sono esentati apposta.

## Come riprendere

```bash
cd C:\Users\nicol\scoutwt\deluxy-marketing
npm run dev          # porta 3130
npx tsc --noEmit     # prima di ogni commit
```

Prima di fermarsi: aggiornare **questo file** e la memoria di progetto
(`progetto-deluxy-marketing.md`), come dice la regola 1 del repo.

## Rigenerare le copie dello script per ogni lavoro

Una copia per `AZIONE`, pronta da incollare in Google Ads. Da lanciare dopo
ogni modifica a `scripts/google-ads-script.js`:

```bash
cd deluxy-marketing && node -e "
const fs=require('fs');
const base=fs.readFileSync('scripts/google-ads-script.js','latin1');
const azioni=['metriche','copy','gruppi','asset','diagnosi','approvazioni','stati-keyword','esegui','tutto'];
const dir='C:/Users/nicol/Downloads/deluxy-google-ads';
fs.mkdirSync(dir,{recursive:true});
for(const a of azioni) fs.writeFileSync(dir+'/'+a+'.js', base.replace('var AZIONE = \"metriche\";','var AZIONE = \"'+a+'\";'), 'latin1');
console.log('scritte',azioni.length,'copie in',dir);
"
```

⚠️ **latin1, non UTF-8**: `google-ads-script.js` ha byte non-UTF8 (box-drawing
e accenti in encoding misto) e latin1 è l'unico encoding byte-preserving 1:1.
Leggerlo o scriverlo come UTF-8 corrompe i caratteri.
