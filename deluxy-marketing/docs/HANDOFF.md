# Handoff — Deluxy Marketing

> Stato al **28/07/2026**. Una finestra Claude nuova deve poter riprendere da qui
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

0. **Token Meta non autorizzato sugli account** (28/07/2026, misurato). Il cron
   funziona — auth, tre account interrogati, esito riportato — ma la Graph API
   risponde **403 `(#200) Ad account owner has NOT grant ads_management or
   ads_read permission`** su tutti e tre (Flowers 965988141913909, Cake
   1040175814157216, Gifts 2802316249885506). Finché non si assegnano gli
   account all'utente di sistema con `ads_read`, **Meta resta fermo al 27/07**
   per quanto giri il cron. Gli errori finiscono in `RicezioneDati` e si vedono
   in **Dati in arrivo**.
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
4. **Schedulazione: NON impostata su nessuno dei tre** (verificato 29/07). La
   prova è l'orario della prima consegna di ogni giorno — 26/07 **10:06**,
   27/07 **15:31**, 28/07 **09:00**, 29/07 **09:46** (e solo Gifts): una
   frequenza «ogni giorno» gira sempre nella stessa fascia, orari sparsi sono
   lanci a mano. Confronto: il cron di Meta, che è vero, gira puntuale al minuto
   7 di **ogni** ora.
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
