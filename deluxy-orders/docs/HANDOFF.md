# Handoff — Deluxy Orders

Stato al **30/07/2026**. Aggiornare a ogni tappa (regole di lavoro Deluxy).
Serve a far ripartire una finestra nuova senza contesto: prima lo stato, poi le
**trappole già pagate** — quelle valgono più dell'elenco delle funzioni.

## Cos'è
Registro centralizzato degli ordini Shopify di tutti i brand Deluxy: la fonte di
verità degli ordini, come Anagrafiche lo è per i partner. Importa da Shopify, fa
riclassificare a piacimento, espone alle altre app via API a chiave.

Next.js 15 + Prisma + Postgres condiviso (**schema `orders`**), porta **3150**.
**LIVE su https://deluxy-orders.vercel.app** (progetto Vercel `deluxy-orders`).
Manuale funzionale completo: [COME-FUNZIONA.md](COME-FUNZIONA.md).

## Le sezioni, e dove sono documentate qui sotto
Ordini (`/`) · Bacheca · Consegna · **Fatti pagare** (`/incassa`) · Analisi ·
**Marketing** (`/marketing`) · **Margini** (`/margini`) · **Controllo**
(`/controllo`) · Clienti · Liste · Eventi clienti · Script · Automazioni ·
Categorie · Impostazioni.

Le quattro in grassetto sono del **30/07/2026** e hanno una sezione propria più
sotto, con i numeri veri e le trappole pagate. Le altre sono precedenti.

## Stato: funziona tutto, con dati reali

**13.995 ordini** importati e allineati esattamente con Shopify (13.959 al 26/07)
(`npm run verifica:totali` lo dimostra negozio per negozio: deluxy.it 11.640,
Flowers 1.584, cakedesign.me 730). Tre negozi collegati con Client ID+Secret,
credenziali riusate da Finance.

Le pagine: **Ordini** (vista predefinita a *colonne per brand*, più l'elenco in
tabella), **Bacheca** kanban, **scheda ordine**, **Clienti** (+ tag, + rubrica
Google), **Liste** (39 liste di clienti + export CSV), **Consegna**,
**Impostazioni**, **Fornitori vicini** per ordine.

### Liste e tag dei clienti (26/07/2026)
I 10.212 clienti (su 10.375 identificabili: 163 hanno solo ordini annullati e
non contano) sono classificati in tempo reale su due assi, e raccolti in **40
liste** con criterio scritto e consiglio d'uso — catalogo in
`src/lib/segmenti.ts`, query in `src/lib/clienti.ts`, API `/api/v1/liste`.

- **Segmento di valore** (uno solo per cliente): VIP 143 · Da non perdere 79 ·
  Fedeli 78 · Ricorrenti 591 · Nuovi 1.004 · Una tantum 2.775 · Da riattivare
  2.692 · Persi 2.850. Soglie tarate sui dati veri (mediana di spesa 110 EUR,
  p95 515, p99 1.498; 85% dei clienti ha un solo ordine).
- **Tipologia**: dedotta dal nome dell'**acquirente** (mai il destinatario) e
  correggibile a mano (`TagCliente`, la mano vince). Numeri onesti: aziende 75,
  hotel 4, eventi 1, rivenditori 0 — più 1.098 «probabili aziende da
  confermare» (email a dominio proprio), che è la coda di lavoro.

**Perché il riconoscimento automatico è così prudente**: la prima versione
pescava «Villa» e «Fiori» (cognomi) come location ed eventi, e «spa» come hotel
mentre erano S.p.A. Restano solo parole che in italiano non sono anche cognomi.
Meglio quattro hotel giusti che quaranta sbagliati.

Cosa si importa da Shopify: ordini, righe con personalizzazioni e **foto**,
cliente, spedizione, note, tag, **data e fascia di consegna**, **annullamento**
con motivo, evasione, stato pagamento, **rischio frode**, biglietto.

Copertura dei dati (non è il 100%, e va saputo):

| Dato | Copertura | Perché |
| --- | --- | --- |
| Ordini | 13.959 / 13.959 | allineato con Shopify |
| Data di consegna | ~9.400 | un terzo degli ordini non ha l'attributo (vedi trappole) |
| Rischio frode | ~9.800 | si importa **solo sui nuovi**, per scelta |
| Foto prodotti | ultimi 90 giorni | backfill completo costerebbe ore |
| Biglietto | 132 ordini | 128 dedotti dalla nota, marcati «da verificare» |

### Feedback dal Customer Service (26/07/2026)
Orders importa da **deluxy-messaging** (`GET /api/v1/feedback`, chiave di sola
lettura creata là con `npm run chiave -- deluxy-orders`) i **reclami** e i
**voti** legati a un ordine, li mostra sulla scheda dell'ordine e li conta in
Impostazioni. Import incrementale e idempotente (`idEsterno`, upsert), ogni
notte dentro `/api/cron/sync` e a mano dal pulsante.

- **Serve configurare** `MESSAGGI_URL` + `MESSAGGI_API_KEY` (in locale sono nel
  `.env`; su Vercel vanno impostate).
- **Il collegamento all'ordine è prudente**: solo numero+brand, oppure numero se
  è unico in tutto il registro; altrimenti `collegamento = ambiguo|non-trovato`
  e il feedback resta scollegato ma visibile. Provato: un voto con «1731» senza
  negozio resta ambiguo, il reclamo con «#1731» + `cakedesign.me` si attacca.
- **Verificato con dati di prova** (creati e poi cancellati): API 200 con
  chiave, 401 senza, un voto senza numero d'ordine non esce nemmeno; import
  ripetuto due volte → 0 nuovi, nessun doppione.
- **Stato reale al 26/07/2026**: nel Customer Service ci sono 7 casistiche
  configurate, **0 reclami** e 6 voti (nati mentre si lavorava). Quindi la
  catena c'è ma il registro è vuoto: non è un errore.
- **MANCA**: il Customer Service va **pubblicato** perché l'import funzioni in
  produzione (la rotta `/api/v1/feedback` è nuova), e le due variabili vanno
  messe sul progetto Vercel di Orders.

### Privacy, attività, ordinamento e automazioni (26/07/2026)
- **Consensi di marketing importati da Shopify** (`emailMarketingConsent`,
  `smsMarketingConsent` sul cliente dell'ordine): verificato che il token li
  legge su **tutti e tre** i negozi. Sull'ordine sono una fotografia; per il
  cliente vale quello dell'**ordine più recente**. Sopra tutto sta
  `PrivacyCliente`, modificabile dalla scheda cliente (sì/no per canale + «non
  contattare mai»), che **vince sempre**. Se non si sa niente → non si contatta.
- **I consensi entrano in `cambiato()`** (al contrario del rischio frode):
  cambiano nel tempo ed è il punto. Conseguenza: la prima sync dopo questa
  modifica riscrive gli ordini della finestra. Gli ordini più vecchi della
  finestra sincronizzata restano senza consenso → lista «Consenso da chiedere».
- **Attività**: stato ricavato dal solo tempo (Attivo ≤90gg, Recente ≤365,
  Dormiente ≤730, Inattivo oltre), come colonna, filtro e ordinamento.
- **Ordinamento su tutte le colonne**, nei due versi, dalle intestazioni. Le
  colonne a etichetta usano `array_position` sul vocabolario, non l'alfabeto.
- **Script** (`/script`): i testi da mandare, riusabili, con **variabili**
  dichiarate (chiave, etichetta, valore predefinito, obbligatoria) oltre a
  quelle automatiche del cliente. Una obbligatoria vuota **blocca** la
  preparazione; una citata e non riempita da nessuno è segnalata prima
  dell'invio; i dati del cliente non si possono sovrascrivere. Provato:
  variabile obbligatoria vuota → blocco col nome della variabile, valore
  predefinito 10% scavalcato dal 20% scelto dall'automazione, {{refuso}}
  riconosciuto come «nessuno lo riempirà».
- **Automazioni** (`/automazioni`): lista + canale + script (collegato o testo
  scritto lì) +
  guardrail (consenso, recapito, silenzio di N giorni fra un messaggio e
  l'altro, limite per giro). **Preparano** i messaggi, non li inviano: si
  esportano o si mandano dal Customer Service e poi si segnano come inviati.
  Ogni scheda mostra la prova a vuoto con i motivi degli esclusi.

### Split per brand e categorie di prodotto (26/07/2026)
Ogni lista si guarda per **brand** e per **categoria**: `?brand=` e `?categoria=`
su /liste, /liste/[chiave] e /clienti (e nell'export CSV). I due tagli NON sono
simmetrici, ed è voluto: il brand filtra gli ORDINI (numeri e segmento
ricalcolati su quel negozio), la categoria filtra i CLIENTI (numeri interi),
altrimenti «di quante categorie è amante» darebbe sempre 1. Vedi `Taglio` in
`src/lib/clienti.ts`.

Le **categorie di prodotto** stanno in `src/lib/categorie.ts` (vocabolario a
parole chiave, in TS e in SQL: la stessa regola in due linguaggi, per il
ricalcolo in una query sola) e si salvano su `Ordine.categorie` come stringa
(«dolci fiori»). Fallback: `NegozioShopify.categoriaPredefinita`, impostata a
Flowers=fiori e cakedesign.me=torte → quei due negozi sono classificati al 100%,
deluxy.it resta con 2.525 ordini «non classificato» (i best seller si chiamano
«Botticelli» o «Favolosa»). NON aggiungere i nomi propri al vocabolario: si
riscriverebbe a ogni collezione.
Ricalcolo: pulsante in Impostazioni → `ricalcolaCategorie()`, 13.967 ordini in
3,7 s, riscrive solo ciò che cambia. `categorie` NON entra in `cambiato()`
(sarebbe una riscrittura dell'archivio a ogni sync).
Numeri veri: mono-categoria 7.803, multi 1.001; fiori 5.199, torte 2.372,
colazioni 1.105, dolci 922. Split VIP: deluxy.it 109 · Flowers 24 · cake 3.

### Eventi clienti (26/07/2026)
Le occasioni per cui i clienti ordinano, ricavate dagli ordini: **9.129 ordini
con data di consegna → 8.729 occasioni**, 169 confermate da 2+ anni, **366 nei
prossimi 30 giorni**. Pagina `/eventi`, motore in `src/lib/eventi.ts`, tabella
`EventoCliente`, rilevamento nel cron notturno + pulsante.

- **Solo dati strutturati**: data di consegna + destinatario. Mai le note. Il
  TIPO (compleanno/anniversario) non si deduce: nessuno lo scrive in un ordine.
- Raggruppamento: stesso cliente + stesso destinatario + consegne entro 7
  giorni. Anni diversi = fatto; una volta sola = ipotesi.
- **Idempotente e non distruttivo**: rilanciarlo aggiorna solo i fatti
  (ricorrenze, anni, ordini) e lascia tipo/titolo/note/stato scritti a mano.
  Secondo giro misurato: 0 nuovi, 0 aggiornati, 1,6 s.
- Alimenta la lista **«Ha un'occasione fra 30 giorni»** (359 clienti): il
  confronto sulle date che tornano si fa su `mese*100+giorno`, che cresce come
  la data dentro l'anno — niente `make_date`, che sul 29 febbraio esploderebbe.

### Ordini problematici — rimborsi parziali (26/07/2026)
**89 ordini** (13.815 EUR) hanno `financialStatus = PARTIALLY_REFUNDED`: l'ordine
resta valido e sembra normale, ma parte del denaro è tornata al cliente e
**l'importo reso non esiste nel registro** (Shopify ci dà solo il totale). Sono
marcati «problematici»: badge nell'elenco e nelle colonne, riquadro nella scheda,
KPI-coda in cima alla pagina Ordini, filtro `problema=aperti|gestiti|tutti` e
campo `problema` nelle API.

- Il **motivo non si salva**: si ricava sempre da `motiviProblema()` in
  `src/lib/ordini.ts`, così non può invecchiare. Nel database c'è solo
  `problemaGestito` + `problemaNota` («l'ho guardato, ecco cosa ho concluso»).
- Aggiungere un altro caso = una riga in `motiviProblema()` più la costante in
  `STATI_PROBLEMA`. Candidati **non** inclusi per scelta: i 2 ordini
  `PARTIALLY_PAID` (pagati in parte) e gli ordini con un reclamo aperto dal
  Customer Service — vanno decisi con l'utente, non aggiunti di slancio.
- Provato su un ordine vero (#1713): segnato → 88 aperti / 1 gestito con
  l'evento nella storia, poi rimesso com'era.

### AI (ChatGPT) — prima applicazione: le categorie dei prodotti (26/07/2026)
`src/lib/ai.ts` è il cliente OpenAI dell'app (chiave `OPENAI_API_KEY`, modello
`gpt-4o-mini` come nelle altre app; impostata anche su Vercel). Nessun pacchetto
nuovo: chiamata fetch e basta.

Prima applicazione: `/categorie` — l'AI classifica i prodotti che le regole a
parole non riconoscono (`src/lib/categorie-ai.ts`, tabella `CategoriaProdotto`).
Precedenza: manuale → parole → AI → specialità del negozio → non classificato.

- **Misurato sui dati veri**: 40 prodotti chiesti in 1 chiamata, 17 secondi →
  12 classificati con motivo, 28 lasciati come «non so», 0 scartati. Copertura
  delle righe d'ordine dal 79% all'85%.
- ⚠️ **TRAPPOLA: l'AI risponde col NOME della categoria, non con la chiave.**
  Il primo controllo accettava solo `torte` e scartava «Torte e pasticceria»:
  12 prodotti su 40 buttati, e sembrava un errore del modello mentre era del
  controllo. Ora si normalizza (chiave o nome, senza maiuscole).
- ⚠️ **Il prompt va tenuto in equilibrio.** Una versione troppo severa («se
  l'unico argomento è il prezzo, rispondi non-classificato») ha portato a 0
  classificati su 40; una troppo permissiva faceva scrivere «il negozio indica
  una torta» anche per deluxy.it, che vende di tutto. Ora al modello si dice
  quale negozio ha una specialità e quale no.

### AI sugli eventi: il motivo dell'occasione dal biglietto (26/07/2026)
`src/lib/eventi-ai.ts` + pulsante su `/eventi`. Legge biglietto/nota degli
ordini di un evento e propone il TIPO, salvando **la frase su cui ha deciso**
(`prova`) e il motivo. Campi nuovi su `EventoCliente`: `tipoDa` ("" | ai |
manuale), `motivoTipo`, `prova`.

- **Misurato**: 50 biglietti, 2 chiamate → 37 riconosciuti, 9 «non si capisce»,
  0 scartati. 7.672 eventi su 8.729 hanno un testo leggibile.
- Vocabolario allargato (TIPI_EVENTO): compleanno, anniversario, matrimonio,
  nascita, laurea, ricorrenza, ringraziamento, **condoglianze**, altro.
  `TIPI_DELICATI` esiste perché le automazioni possano saltare i lutti.
- ⚠️ **Tarature pagate**: «Auguri Mamma» / «Feliz día de las madres» venivano
  letti come *nascita* invece che festa della mamma (corretto nel prompt), e un
  «auguri» generico veniva comunque classificato (ora è «da precisare»). Ne
  resta uno ambiguo su 33: si corregge in pagina, con la prova sotto gli occhi.
- Chi risponde «da precisare» viene comunque marcato `tipoDa = ai`: senza,
  ogni giro ripagherebbe la stessa domanda per la stessa risposta.

### Riepilogo AI del cliente, con preferenze e gusti (26/07/2026)
`src/lib/clienti-ai.ts` + card in cima a `/clienti/:chiave` + pulsante in blocco
su `/clienti`. Modello nuovo `RiepilogoCliente` (chiave unica, `testo`, `punti`,
`gusti`, `ordiniConsiderati`, `ultimoOrdine`, `modello`), già in produzione con
`prisma db push`.

- **Tre campi distinti**: riassunto in prosa, **gusti** (categorie e prodotti
  ripetuti, fascia di prezzo, destinatari abituali, stagionalità) e i **punti**,
  uno per ordine.
- **Incrementale per costruzione**: se il riepilogo esiste, all'AI vanno solo
  gli ordini più recenti di `ultimoOrdine`, col riepilogo vecchio davanti e
  l'ordine di non riscriverne i punti; i punti nuovi si **accodano** ai vecchi.
  I gusti invece si riscrivono ogni volta. `riepilogaCliente(chiave, { rifai:
  true })` riparte da zero — è il bottone «Riscrivi da capo».
- **Misurato su clienti veri**: 4 ordini → 3,7 s; 26 ordini → 10,9 s. I gusti
  escono con nomi di prodotto e destinatari veri («Bouquet Grande Gatsby …
  destinatari abituali Graziella Turchetti, …»).
- **MAX_ORDINI = 24**: oltre, si mandano i più recenti. La scheda lo scrive,
  perché `ordiniConsiderati` è *quanti ordini aveva quando è stato scritto* (lo
  usa il confronto «sono arrivati N ordini nuovi»), non quanti ne ha letti.
- **Il blocco si ferma da solo dopo 50 s** (`SECONDI_MAX`) e dice a che punto è
  arrivato: una server action su Vercel viene uccisa, e 100 clienti × ~7 s non
  ci stanno.
- ⚠️ `riepilogaCliente` può tornare `ok: true` **con** un messaggio («Nessun
  ordine nuovo»): non è un errore, e l'azione lo mostra come avviso verde.
- **Esposto alle altre app** (27/07/2026): `GET /api/v1/clienti` (elenco con
  `riassunto` e `gusti`, filtri `q, lista, ordina, verso`, `riepiloghiScritti`
  nella risposta) e `GET /api/v1/clienti/:cliente` (scheda completa coi
  `punti`; accetta base64url **o email in chiaro**). `/api/v1/liste/:chiave`
  accetta `riepilogo=si`. Provati in produzione con una chiave temporanea, poi
  cancellata.
- ⚠️ **Niente filtro `solo=con-riepilogo`**: era stato scritto e poi tolto
  perché filtrava *dopo* la paginazione — restituiva pagine vuote su 3.406
  pagine fingendo di aver selezionato. Se serve davvero, va fatto in SQL dentro
  `elencoClienti`, non a valle.

### Repeater e provenienza di marketing su ogni ordine (27/07/2026)
Due segni su ogni ordine, in elenco, in colonne, nella scheda e nelle API.

**Repeater** — `src/lib/repeater.ts`, `ordinali(ids)`: una query sola per
schermata che conta, per ciascun ordine, **quanti ordini validi lo precedono**
per lo stesso cliente (chiave email → telefono → nome, la stessa di Clienti,
via `chiaveDi(alias)` in `clienti.ts`). Non è «quanti ordini ha oggi»: un ordine
vecchio resta «1º» per sempre. Misurato: 50 ordini in 130–290 ms, di cui ~135 ms
sono latenza verso Supabase. Su 50 ordini recenti: 15 repeater, 32 primi ordini,
3 senza cliente riconoscibile (nessun segno: non si indovina).

**Provenienza** — campi nuovi su `Ordine` (`sorgente`, `visitaSorgente`,
`utmSource/Medium/Campaign`, `canaleMarketing` + indice). Vengono da
`customerJourneySummary.firstVisit` e `sourceName` di Shopify; il canale in
italiano lo deduce `deduciCanale()` in `src/lib/marketing.ts` (12 canali con
simbolo). **Attribuzione al primo contatto**, non all'ultimo clic.

- ⚠️ **I campi entrano in `cambiato()`**, non solo in `datiShopify()`: è
  l'errore già pagato coi consensi (scritti ma non confrontati → il backfill
  scrive zero). Conseguenza voluta: la prima sync dopo questa modifica riscrive
  gli ordini della finestra.
- ⚠️ **Niente backtick nei commenti dentro `ORDERS_QUERY`**: è un template
  literal, e un backtick nel commento GraphQL rompe il parse di TypeScript.
- Costo Shopify misurato: 25 ordini col percorso = **26 punti** su un bucket da
  1000. Non cambia il ritmo dell'import.
- Backfill: `npm run importa:provenienza [brand]`. Prima versione con un
  `update` per ordine: **~78 ordini/minuto**, cioè 2 ore e mezza per deluxy.it.
  Riscritta con `UPDATE … FROM (VALUES …)`, una scrittura per pagina da 100.
  Se serve di nuovo un backfill di massa su questo database, **partire da lì**.
- Distribuzione reale (Flowers, 1.588 ordini): 738 ricerca non pagata, 378
  diretto, 192 creati a mano, 189 sconosciuti, 48 Shopping, 16 email, 11
  referral, 8 Meta, 6 AI, 1 WhatsApp, 1 social.

**Esposto alle altre app (27/07/2026)**

- `GET /api/v1/ordini` porta `marketing{}` e, dentro `cliente`, `repeater`,
  `ordiniPrima`, `numeroOrdine`; nuovo filtro **`canale=`** (una chiave,
  `pagato`, oppure `sconosciuto`).
- `GET /api/v1/clienti` porta `acquisizione { canale, primoOrdine }` — il canale
  del **primo** ordine valido (`src/lib/acquisizione.ts`, `DISTINCT ON`).
- **`GET /api/v1/marketing`** (nuovo): per canale × mese ordini, lordo, `primi`
  / `daRepeater` / `nonAttribuibili`, clienti distinti, più le campagne per
  nome. Misurato in dev: **0,86 s** a caldo (a freddo 20–36 s = compilazione
  Next, non la query). Due query, ciascuna con una window function su tutta la
  tabella.
- ⚠️ **La numerazione dei clienti si fa PRIMA di tagliare il periodo**: la CTE
  `numerati` scorre tutti gli ordini e solo la CTE `dentro` applica le date. Se
  si invertisse, il secondo ordine di un cliente del 2024 risulterebbe «cliente
  nuovo» nel 2026 — il numero sarebbe plausibile e sbagliato.
- ⚠️ `clienti` nella risposta è la **somma dei distinti per mese**: chi compra a
  gennaio e a marzo è contato due volte. È dichiarato in `criteri`.

### Analisi delle vendite (`/analisi`, 27/07/2026)
`src/lib/analisi.ts` + pagina. Settimane / mesi / anni, confronto col periodo
precedente o con lo stesso dell'anno scorso, filtro per negozio, navigazione
all'indietro. KPI: venduto, ordini, clienti, pezzi, scontrino medio, **UPT**,
prezzo medio a pezzo, % ordini da clienti nuovi, % annullati, % rimborsati; più
categorie di prodotto e serie storica.

- **Confronto a parità di giorni** quando il periodo è in corso: il periodo di
  confronto viene troncato allo stesso numero di giorni. Senza, a metà mese la
  pagina mostrerebbe cali inventati.
- «Ordine medio» e «scontrino medio» sono **lo stesso numero** (venduto/ordini):
  la pagina lo dice invece di mostrare due KPI identici con nomi diversi. Quello
  che li spiega è la coppia UPT × prezzo medio.
- ⚠️ **Il conto dei clienti nuovi si fa su tutta la storia**, come in
  `/api/v1/marketing`: la CTE `numerati` non è filtrata per data.
- **Otto dimensioni** (27/07/2026): città di consegna, categoria, tipologia di
  cliente, occasione, **nazione di chi ordina**, **nazione di consegna**, tipo
  di ordine, canale di provenienza — ognuna con TUTTI i KPI e la
  loro variazione. Motore unico: `DIMENSIONI` + `perDimensione()` in
  `analisi.ts`; una dimensione nuova sono tre righe. Le due derivate usano CTE
  in più (`tipologie` da nomi+TagCliente con `SQL_TIPOLOGIA_AUTO`, `occasioni`
  da `EventoCliente.ordini` spezzato con `string_to_array`).
- **Periodo a mano** (`?da=&a=`, date ISO): il confronto diventa la stessa
  lunghezza appena prima, o le stesse date dell'anno scorso; l'etichetta mostra
  i giorni **davvero** confrontati (troncati a parità di giorni se il periodo è
  in corso). Date invertite → si ignora la scelta invece di rispondere a
  un'altra domanda.
- **Gli annullati sono sempre fuori dal venduto** e contati a parte: verificato
  su luglio 2026, 393 validi + 18 annullati + 9 rimborsati = 420 nel registro.
- ⚠️ Con i JOIN delle dimensioni la colonna `chiave` diventa **ambigua**: in
  `MISURE` va qualificata `x.chiave`, e ogni query che usa MISURE deve aliasare
  la sottoquery come `x`. È il primo errore che si prende aggiungendone una.
- **Verificato**: la somma delle righe di ogni dimensione torna esatta col
  totale della pagina (86.700,25 € a luglio 2026) — nessuna riga persa né
  contata due volte, categorie a parte che si moltiplicano apposta.
- ⚠️ **Categorie: doppio conteggio voluto.** Stanno sull'ordine, non sulla riga;
  un ordine multi-categoria è contato in ogni riga e la somma supera il totale.
  Scritto in pagina.

### Chiavi API create dall'app (30/07/2026)
`src/lib/chiavi.ts` + `ChiaviApi.tsx` + `chiavi-actions.ts`: le chiavi delle altre
app si creano, rigenerano, sospendono ed eliminano da **Impostazioni**, non più
solo da riga di comando.

- **Un solo motore**: `creaChiave()` sta in `src/lib/chiavi.ts` e lo usano sia la
  pagina sia `npm run chiave` (lo script è passato da `.mjs` a `.ts` per poterlo
  importare). Due modi di generare una credenziale divergono, e sulle credenziali
  divergere si scopre il giorno che una non funziona.
- ⚠️ **La chiave in chiaro non passa mai da un redirect**: torna nel valore di
  ritorno della server action. In una querystring finirebbe nella cronologia del
  browser e nei log, dove resta per sempre.
- Il riquadro della chiave appena nata **si chiude a mano**: nel DB c'è solo lo
  SHA-256, quindi chi non fa in tempo a copiarla deve rigenerarla.
- Rigenera ed Elimina sono **a due clic** (l'etichetta diventa «Confermi?»):
  spengono un'altra app all'istante.
- ⚠️ **`revalidatePath` non basta quando l'azione parte da un clic** e non da un
  `form action`: la tabella restava con la chiave appena eliminata ancora
  visibile — su una credenziale è la bugia peggiore, sembra attiva e non lo è.
  Serve `router.refresh()` nel client dopo crea/rigenera/elimina.
- **Provato davvero il 30/07/2026**: chiave creata → `GET /api/v1/ordini` risponde
  200; rigenerata → la vecchia risponde **401** e la nuova 200; eliminata → 401.
  Le due chiavi di prova sono state cancellate (restano le 7 vere).

### Sezione Marketing (30/07/2026)
`/marketing` + `src/lib/canali.ts`. Quanto vende ogni canale di provenienza, con
la variazione sul periodo prima e il taglio nuovi/di ritorno.

- **Il motore è stato estratto dall'API**: `venditePerCanale()` sta in
  `src/lib/canali.ts` e lo usano sia la pagina sia `/api/v1/marketing` (che
  l'app ADV legge). Prima la query viveva dentro la rotta: due implementazioni
  degli stessi numeri divergono, e quando divergono nessuno se ne accorge.
  Risposta dell'API invariata, più due campi nuovi (`sorgenti`,
  `totali.tracciati`); provata in locale con una chiave temporanea, poi
  cancellata.
- **`sorgenti`**: `utm_source` (o il sito di provenienza) sotto il canale. Nasce
  dalla domanda «Klaviyo lo vedi come canale?»: **sì, ma come *Email***, insieme a
  Shopify Email e alle newsletter. Sul 2026 Klaviyo è 5.797 € su 36 ordini, con
  il 22% di clienti nuovi.
- ⚠️ **Avviso automatico sui confronti sleali**: `totali.tracciati` conta gli
  ordini con un `utm_*`. Se la quota cambia molto fra i due periodi (soglia: 8
  punti) la pagina lo scrive. Caso vero: 2026 **27%** contro 2025 **1%**, da cui
  un «Google Ads +8.785%» che è soprattutto tracciamento, non mercato — i clic
  del 2025 finivano in *Ricerca* o *Diretto*. Verificato che **non** è un buco di
  import: la copertura del canale è ~90% in tutti gli anni, sono i link a essere
  cambiati.
- La **spesa** non c'è: sta in deluxy-marketing. Finché non si collega, la pagina
  misura il fatturato per canale, non il ritorno (niente ROAS/MER qui).

**Tabella «Acquisizione o fedeltà» (03/08/2026)** — gli stessi canali, ma i soldi
divisi fra clienti nuovi e clienti di ritorno, con **lo scontrino delle due
metà**. Tre `SUM(…) FILTER` in più nella query che c'era già (`lordoPrimi`,
`lordoDaRepeater`, `lordoNonAttribuibili` in `RigaCanale` e in `totali`): nessuna
query aggiuntiva. Escono anche da `/api/v1/marketing`, con i criteri scritti nella
risposta. Misurato su deluxy.it 25–31/07: 6.894 € da nuovi + 5.291 € da chi torna
+ 545 € non attribuibili = 12.730 €, che è il totale della tabella sopra.

- ⚠️ **I non attribuibili non si spalmano.** Gli ordini senza email, telefono né
  nome non possono stare in nessuna delle due colonne: si dichiarano sotto la
  tabella. Sommarli a metà per far quadrare le percentuali sarebbe un numero
  comodo e falso — e la somma delle due colonne **non** deve fare il venduto.
- Il taglio serve perché conteggio e denaro divergono sempre: Google Ads fa l'85%
  di *ordini* da clienti nuovi ma con scontrino 124 €, mentre il Diretto sembra
  il canale più grande solo perché chi torna spende 1.007 € a ordine.

### ⚠️ NON caricare gli ordini-bozza come conversioni offline in Google Ads (03/08/2026)
Proposta arrivata da un'altra sessione e **bocciata sui dati**: gli ordini nati
da bozza (assistiti dal Customer Service) ma con un percorso pubblicitario
alle spalle sarebbero «invisibili a Google», quindi andrebbero ricaricati come
conversioni offline. **Il fenomeno esiste, la conclusione è sbagliata: Google
quegli ordini li conta già.** Caricarli li conterebbe due volte e lo Smart
Bidding spenderebbe di più su campagne che sembrano rendere il doppio.

- **Il fenomeno, misurato**: 203 ordini `sorgente = shopify_draft_order` con
  `canaleMarketing` a pagamento, 39.612,50 € — di cui 201 nel 2026 e **202 su 203
  su deluxy.it** (Flowers 1, cakedesign.me 0: non è un problema «di tutti i
  brand»). Campagne più colpite: Fiori Milano 60, Torte MILANO 41, Torte ROMA 34.
- **La prova che sono già contate** (campagna «[Deluxy] Torte ROMA», luglio 2026):
  nei giorni delle bozze #12543 (11/07) e #12547 (12/07) Google dichiara 1 e 0,5
  conversioni; il 23/07, giorno della bozza **#12638**, ne dichiara **2** — e il
  clic di quell'ordine è delle 15:08 con l'ordine alle 15:25, stesso giorno.
  Il 19/07, giorno di un ordine **web**, Google dichiara **0**. Confermato
  dall'utente nell'interfaccia di Google Ads.
- **Perché**: pagando la fattura della bozza il cliente passa da un **checkout
  Shopify vero**, dove il tag di Google c'è. Infatti **198 dei 203** risultano
  pagati con shopify_payments o PayPal, non segnati a mano in admin.
- ⚠️ **La deduplica per `transactionId` non protegge**: Google deduplica solo
  **dentro la stessa azione di conversione**, e qui le azioni sarebbero due (il
  tag del sito e l'import offline).
- **E comunque non si potrebbe**: Shopify **taglia la query string** dalla landing
  page (`landingPage` torna senza `?gclid=…`, verificato su #12638 e #12682),
  quindi il GCLID non ce l'abbiamo; e la finestra di import è ~90 giorni, dentro
  la quale stanno solo **67 ordini** dei 203.
- **La lezione**: prima di costruire un recupero, misurare il verso opposto —
  *quel dato manca davvero?* Qui bastava guardare le conversioni del giorno.

### ⚠️ Il nome della campagna in Orders può essere un nome MORTO (03/08/2026)
Indagine su «6 conversioni di Fiori Milano ENG che non si vedono», 25–31/07/2026.
Non era un buco d'importazione: **`utm_campaign` è il nome che la campagna aveva
quando il link è stato scritto, non quello che ha oggi.**

- In Google Ads la campagna si chiama `[Deluxy] - Fiori Milano ENG` (id
  15012697091, attiva); nel registro i suoi ordini portano `[Deluxy] - Fiori
  Milano`, senza suffisso. A giugno 2026 le è stata staccata accanto una gemella
  ITA (id 23958449662) e la vecchia è stata rinominata: l'utm nel link è scritto a
  mano ed è rimasto indietro.
- **Prova**: su tutto luglio 2026 le conversioni Google Ads della ENG sono **18**
  e gli ordini con quell'utm sono **18**. Coincidono esattamente. Sulla singola
  settimana no (7 contro 4) perché **Google data la conversione sul giorno del
  CLIC, noi sul giorno dell'ORDINE**, e perché Google **modella** ciò che non
  vede (nei dati veri ci sono conversioni da 0,5).
- **Prima di dare la colpa all'import, chiedere a Shopify.** I 6 ordini della
  settimana senza canale (#12662 #12668 #12684 #12689 #12690 #12692) hanno
  `customerJourneySummary.ready = true`, `momentsCount = 0`, `firstVisit` e
  `lastVisit` null, `landingPageUrl` null: il dato **non esiste** lato Shopify,
  non c'è niente da recuperare né dal `gclid` né dalla landing.
- **Non è un problema della versione inglese del sito** (ipotesi provata e
  bocciata): a luglio gli ordini dal sito senza percorso sono il **20% degli
  inglesi e il 17% degli italiani**. È un buco strutturale (consensi cookie,
  blocchi, browser dentro le app) stabile fra il 13% e il 21% ogni mese da
  gennaio 2025, ~24 ordini al mese su deluxy.it.

### Margini e Controllo: i soldi degli ordini arrivano qui (30/07/2026)
Il controllo degli ordini — **incassi** e **costi del fornitore** — che si faceva
in Finance (`deluxy-partner/ordini`) ora vive qui, dove stanno gli ordini. In
Finance restano **i movimenti bancari**, che sono suoi.

**Come sono divisi i mestieri (deciso con l'utente)**
- Finance possiede l'estratto conto e lo espone in sola lettura:
  `GET /api/v1/movimenti` e `GET /api/v1/ordini-controllo` (chiave = quella delle
  API di verifica, `Impostazione api.verificheKey`).
- Orders copia i movimenti in `MovimentoBanca` (specchio, idempotente su `hash`) e
  possiede lo **stato del controllo** sull'ordine: `gestioneIncasso`,
  `statoIncasso`, `movimentoIncassoId`, `costoFornitore`, `costoMovimentoId`,
  `costoDa`.
- ⚠️ **Orders non scrive niente in Finance.** Là il movimento abbinato veniva
  marcato «registrata»; qui no: che un movimento sia usato lo dice **l'ordine che
  lo cita** (`movimentiUsati()` lo deriva). Così una reimportazione dell'estratto
  non può perdere il lavoro. È una deviazione voluta dal comportamento di Finance.
- **`/api/v1/ordini` porta un blocco `controllo{}`** (stato incasso, costo,
  margine): `margine` è `null` quando il costo non c'è, mai zero.

**Configurazione**: `FINANCE_URL` + `FINANCE_API_KEY` (impostate su Vercel per
production/preview/development il 30/07/2026, e nel `.env` locale puntano a
`localhost:3040`). Nel middleware di Finance è stato escluso `api/v1`, altrimenti
rispondeva con la PAGINA di login e stato 200.

**Numeri veri del primo giro (30/07/2026)**
- 10.998 movimenti copiati (1.497 entrate, 9.501 uscite, dal 01/01/2025);
- adozione da Finance: **249 costi** (23.224,47 € su 43.754,83 €) e 1.347 incassi
  da gateway, identici a Finance;
- abbinamento per numero in causale: **+122 costi** e +5 incassi che Finance non
  aveva (là c'erano solo 1.484 ordini, qui 14.027);
- **371 ordini con un costo** → margine misurato 33.916,16 € (49,7%), copertura 3%
  di tutto l'archivio e **9% sul 2026**.

**⚠️ Trappole di questo giro — tre, tutte pagate**
1. **La normalizzazione dell'archivio serve, e va fatta PRIMA dell'adozione.**
   Gli ordini importati prima che il controllo esistesse erano tutti «da
   riconciliare»: **12.680 ordini** in una coda che nessuno deve lavorare.
   `normalizzaControllo()` (due `updateMany`) porta le carte PAID a
   `incassato_gateway` e gli ordini deluxy.it a `gestione = partner`, ma **solo
   dove nessuno ha deciso niente**. Risultato: 10.728 + 10.823 righe sistemate, e
   la coda vera scende a **240 ordini**. Senza questo passo l'adozione da Finance
   non adottava le gestioni, perché confrontava col default dello schema.
2. **Niente una-riga-per-volta verso Supabase.** La prima versione dell'import
   faceva un upsert per movimento: 11.000 movimenti × ~135 ms = mezz'ora, e su
   Vercel la server action muore prima. Ora: una `findMany` per capire cosa c'è,
   `createMany` per i nuovi, `UPDATE … FROM (VALUES …)` a blocchi di 100 per i
   cambiati, `$transaction` a blocchi di 50 per l'adozione. Quarta volta che
   questa trappola si presenta in questo progetto.
3. **L'abbinamento per numero non si fa a coppie.** Una regex per ogni
   ordine×movimento sono **18 milioni** di confronti. Ora si costruisce un indice
   `numero → movimenti` in una passata (`numeriIsolati()` in `controllo.ts`, che è
   l'unico posto dove la regola del «token isolato» è scritta: chi fa un confronto
   solo usa `causaleContieneNumero`, che si appoggia allo stesso indice).
4. Un `<form>` dentro un `<p>` è HTML non valido: React lo segnala come errore di
   hydration e rimonta la pagina. Succede appena si mette un bottone-azione dentro
   una frase.

### Link di pagamento Shopify (30/07/2026)
`src/lib/pagamento-link.ts` + `LinkPagamento.tsx`: sugli ordini non incassati si
chiede a Shopify `paymentCollectionDetails.additionalPaymentCollectionUrl` — la
pagina su cui **quel** cliente paga **quell'ordine**. Verificato su ordini veri
(#2242 Flowers, 255 € da incassare).

- **Funziona con i permessi che già ci sono.** Scope misurati sui tre negozi il
  30/07/2026: `read_all_orders read_audit_events read_channels read_customers
  read_orders write_channels write_customers write_orders`. Il link si **legge**,
  non si crea.
- ⚠️ **Non usare `draftOrderCreate`/`invoiceUrl` per far pagare un ordine che
  esiste già**: quando il cliente paga la bozza, Shopify crea un **ordine nuovo**
  → due ordini per una vendita, il vecchio non pagato per sempre, venduto doppio
  in Analisi e nei Margini. La bozza serve solo per far pagare qualcosa che
  ordine non è ancora, e richiede lo scope **`write_draft_orders`** che oggi i
  token NON hanno (va aggiunto nell'app della Dev Dashboard, poi il token si
  riconia da sé col client credentials grant).
- ⚠️ **Il link contiene un segreto** (`?secret=…`): non si salva nel database,
  non si scrive nei log, si chiede quando serve. Un link vecchio salvato sarebbe
  una bugia con dentro una chiave.
- **L'app non invia niente**: prepara il link (come le automazioni preparano i
  messaggi). Ogni richiesta lascia una riga in `EventoOrdine`.
- Esiste anche la mutazione `orderInvoiceSend` (manda l'email di pagamento
  dell'ordine, e `write_orders` c'è): **non è stata collegata** perché scrivere a
  un cliente è un'azione che va decisa da una persona, non da un bottone dentro
  una tabella.

### «Fatti pagare» — link per ciò che non è ancora un ordine (30/07/2026)
`/incassa` + `src/lib/incassa.ts` + modello `LinkIncasso`. Si scrivono righe
libere («100 rose × 4,50»), Shopify crea una **bozza d'ordine** e ne esce
l'`invoiceUrl`. Pagando, la bozza **diventa un ordine vero** che la sync importa:
nessun doppione, perché prima non c'era niente.

- ⚠️ **BLOCCATO SUL PERMESSO**: `draftOrderCreate` risponde
  `ACCESS_DENIED — Required access: write_draft_orders access scope or
  write_quick_sale`. Provato davvero il 30/07/2026 su Flowers: nessuna bozza
  creata. Va aggiunto lo scope nell'app della Dev Dashboard di ogni negozio
  (**non c'è nessun `shopify.app.toml` nel repo**: la configurazione è solo lì);
  il token si riconia da sé col client credentials grant, senza toccare l'app.
- La pagina **diagnostica da sé** quali negozi sono pronti, leggendo
  `/admin/oauth/access_scopes.json` (`negoziPronti()`): non fa fallire il bottone
  per scoprirlo, e l'errore di Shopify è tradotto in cosa fare.
- **L'URL non si salva** (contiene un segreto): `LinkIncasso` tiene solo cosa,
  quanto, a chi e com'è finita; il link e lo stato si richiedono a Shopify.
- Le bozze nascono con i tag `deluxy-orders` + `link-di-pagamento`: dentro Shopify
  si riconosce da dove vengono.
- ⚠️ **Non sostituire questa pagina con `orderCreate`** (che i permessi
  attuali consentirebbero): un ordine creato prima del pagamento comparirebbe in
  bacheca, in consegna e al Customer Service anche se il cliente non paga mai.

**MANCA / da decidere**
- **Aggiungere `write_draft_orders`** ai tre negozi: finché non c'è, `/incassa`
  mostra tutto ma non può creare il link. È l'unica cosa che manca.
- **La pagina `/ordini` di Finance non è stata rimossa**: la funzione è qui, ma
  togliere di là pagina, modelli e cron è una scelta contabile (i `Pagamento` con
  riferimento `PAY-…` nascono là e `/api/incassi` li espone) e **in quella cartella
  lavora un'altra sessione**. Da concordare prima di toccarla.
- Il costo dei 13.271 ordini senza costo si recupera solo abbinando gli addebiti:
  l'estratto parte dal 01/01/2025, quindi per gli ordini più vecchi non c'è niente
  da trovare, e la pagina lo dice invece di lasciarlo indovinare.

### Scelta rapida di anni e mesi + filtro per anno (30/07/2026)
Due cose sole, ma toccano `whereOrdini`, quindi anche le API.

- **`/analisi`: due file di pillole** (anni del registro, mesi dell'anno
  mostrato). Non introducono un modo nuovo di dire il periodo: calcolano il
  **`salto`** che la pagina già usa (`saltoAnno` / `saltoMese` in `analisi.ts`),
  così confronto, parità di giorni ed etichette restano gli stessi. Il periodo a
  mano (`da`/`a`) viene azzerato dalla scelta rapida, altrimenti vincerebbe lui e
  la pillola sembrerebbe non funzionare.
- **I mesi futuri sono `<span>`, non link**: `salto` sulla pagina è clampato a
  `>= 0` (non si va nel futuro), quindi un link a dicembre 2026 avrebbe portato a
  luglio fingendo di aver capito.
- **`anniConOrdini()`**: gli anni si leggono dal database (`DISTINCT EXTRACT(YEAR
  …)`), non da una lista scritta. Sui dati veri: 2020…2026.
- **Ordini (`/`) e API: filtro `anno=`** in `whereOrdini`. Sta in `AND` e non in
  `where.data` per **convivere** con `da`/`a` invece di sovrascriverli in
  silenzio. Il confine è la mezzanotte **italiana** (`inizioGiornoItaliano`,
  riusata da `analisi.ts`: una sola implementazione della regola del fuso).
- **Verifica incrociata sui dati veri**: `/?anno=2025` dà 4.640 ordini ·
  845.505,69 €; l'Analisi del 2025, che ci arriva con SQL suo, dà 4.490 validi +
  118 annullati + 32 rimborsati = **4.640**, e le somme tornano. È la prova che i
  due tagli dell'anno cadono nello stesso punto.
- ⚠️ `ordini.ts` ora importa `analisi.ts`. Non è un ciclo (analisi non importa
  ordini) ma va tenuto d'occhio: se un giorno `analisi.ts` avesse bisogno di
  qualcosa da `ordini.ts`, la regola del fuso va spostata in un modulo suo, non
  duplicata.

**⚠️ Trappola del fuso orario, trovata e corretta il 27/07/2026 — riguardava
anche codice già in produzione.** `Ordine.data` è `timestamp without time zone`
e contiene UTC. Scrivere `data AT TIME ZONE 'Europe/Rome'` **sottrae** due ore
invece di aggiungerle (Postgres interpreta il valore come ora di Roma e lo
converte in UTC). La forma giusta è `data AT TIME ZONE 'UTC' AT TIME ZONE
'Europe/Rome'`. Effetto misurato sull'archivio: **593 ordini finivano nel giorno
sbagliato** e **16 nel mese sbagliato** (3.627 €) — il consuntivo D2C che
Budgets legge da `/api/v1/ricavi` era sbagliato di quei 16. Corretto in
`ricavi/route.ts`, `marketing/route.ts` e `analisi.ts`.

### Tag di luogo, mittente e tipo di urgenza (27/07/2026)
Campi nuovi su `Ordine`: `mittenteNome/Citta/Provincia/Paese` (da
`billingAddress` di Shopify) e `urgenza`. Indici su `urgenza`, `citta`, `paese`,
`mittenteCitta`, `mittentePaese`.

- `src/lib/luoghi.ts` — normalizzazione delle città (per raggruppare) e nomi dei
  paesi in italiano dal codice ISO2, più la bandiera come emoji. `daLontano()` =
  paese del mittente diverso da quello di consegna.
- `src/lib/urgenza.ts` — il vocabolario (urgenza ≤1 giorno, pensiero ≤2,
  pianificato ≤7, evento ≤30, lontano oltre) e **due implementazioni della
  stessa regola**: in TS per la sync, in SQL (`SQL_URGENZA`) per il ricalcolo di
  massa. Se cambia una, va cambiata l'altra.
- `src/lib/urgenza-ricalcolo.ts` — riscrive l'urgenza di tutto l'archivio in una
  query (9.430 ordini in 2,9 s), toccando solo le righe che cambiano.
- Filtri nuovi (UI + API): `citta`, `paese`, `cittaMittente`, `paeseMittente`,
  `estero=si`, `urgenza` (`senza-data` per gli ordini senza data di consegna).
  `estero=si` confronta due colonne della stessa riga con un **riferimento a
  campo Prisma** (`prisma.ordine.fields.paese`).
- **Numeri veri dopo la risincronizzazione completa** (27/07/2026, 36,7 minuti,
  13.367 ordini aggiornati): 13.980 ordini, **13.279 col mittente** (i 701 senza
  sono quasi tutti ordini creati a mano), **3.790 mandati dall'estero** (US
  1.220, GB 793, AE 272), 6.313 urgenze · 1.131 pensieri · 1.538 pianificati ·
  476 eventi · 37 molto in anticipo · 4.485 senza data di consegna.
- **Esonimi**: «Milan»→Milano, «Rome»→Roma… solo se il paese è `IT`. Il filtro
  cerca tutte le grafie (`variantiCitta`), altrimenti cliccando il tag «Milano»
  i 171 ordini scritti «Milan» sparivano in silenzio.

**⚠️ Trappola trovata e corretta il 27/07/2026: la fascia oraria letta come data
di consegna.** `RE_DATA` contiene il termine generico `consegn`, e la chiave
`Fascia_Oraria_Consegna` **corrisponde** — arrivando prima nell'elenco degli
attributi, vinceva lei. Due effetti opposti, entrambi gravi:

- su **cakedesign.me** la fascia `08-12` veniva letta come **8 dicembre**: un
  ordine da consegnare lo stesso giorno finiva in agenda a dicembre;
- su **deluxy.it** la fascia `14-15` non è una data valida, quindi la lettura
  tornava `null` e la vera `Data_Consegna` **non veniva mai guardata**: ordini
  con una data di consegna che risultavano «senza data».

Corretto passando a `cercaAttributo` un'esclusione esplicita (`RE_FASCIA`): la
chiave più specifica vince. Verificato su 180 ordini reali (60 per negozio): 6
corretti, il resto invariato. Se in futuro si aggiunge un attributo, controllare
che non finisca per corrispondere a due regex diverse.

**Effetto misurato dopo la risincronizzazione di tutto lo storico**: gli ordini
con una consegna a più di 300 giorni sono passati da **110 a 4**, e le consegne
finte di dicembre 2026 da 3+ a **zero**. Erano appuntamenti sbagliati in agenda.

⚠️ Il tema di **cakedesign.me** scrive date rotte: `Data_Consegna =
"2026-undefined-27"`. Ora quegli ordini risultano «consegna non indicata»
(giusto: non lo sappiamo) invece di prendersi la fascia oraria. **Il bug è del
sito e va sistemato là**: finché c'è, quegli ordini non hanno una data.

### Etichetta «Nuovo»: ordini arrivati durante la sessione (27/07/2026)
`src/lib/sessione.ts` + cookie scritto dal **middleware** (una pagina server non
può metterne). Due cookie: `orders_sessione_da` (inizio sessione, muore col
browser) e `orders_visto_fino` (pulsante «Ho visto»). Il confronto è su
`Ordine.createdAt` — quando è entrato nel REGISTRO, non la data Shopify.

- Filtro nuovo `nuoviDa=<iso>` in `whereOrdini` (vale anche per le API); in
  pagina il pulsante usa `nuovi=si` e ci mette dentro il momento di sessione.
- Se manca il cookie non si segna NIENTE, invece di segnare tutto come nuovo.
- Provato creando due ordini finti (`orderId` con prefisso `gid://prova/`),
  verificando badge, contatore, filtro e «Ho visto», e poi cancellandoli.

### Riconciliazione: città dai tag e dal nome del prodotto (27/07/2026)
`src/lib/riconcilia.ts` + pulsante in Impostazioni + `npm run riconcilia`.
Campi nuovi: `cittaDedotta`, `cittaDedottaDa` (tag|prodotto), `cittaDedottaProva`.

- **Non si scrive MAI in `citta`**: la deduzione sta in un campo suo. In pagina
  il tag è 📍? e il titolo dice la fonte; il filtro `citta=` cerca in tutt'e due,
  altrimenti cliccando il tag l'ordine stesso non uscirebbe.
- **La controprova** (`fiduciaNeiTitoli`): una città trovata in un titolo si
  accetta solo se quei prodotti, negli ordini indirizzati, ci sono andati
  davvero. Bocciate dai fatti: Capri, Dubai, Magenta, Monza, Napoli, Sorrento,
  Venezia («Bouquet Venezia» 21 volte su 21 fuori Venezia).
- **Vocabolario dalle 239 città degli indirizzi veri** (≥3 occorrenze, ≥4
  lettere, confini di parola): non una lista inventata.
- **La categoria dai tag sta DENTRO `sqlCategoria`**, nella catena titolo → AI
  → tag → specialità. Metterla accanto al ricalcolo è l'errore che ho fatto
  prima: il primo «Ricalcola le categorie» la cancellava senza dire niente.
- Risultati veri: 894 città recuperate (571 tag, 323 prodotto), 2.421 restano
  senza; «non classificato» da 2.525 a **607**.
- ⚠️ 200 `update` in parallelo esauriscono il pool (limite 5): scrivere in
  blocco con `UPDATE … FROM (VALUES …)`. Terza volta che succede.
- **Esposta alle altre app dal 03/08/2026**: blocco `cittaDedotta { citta, da,
  prova }` in `serializzaOrdine`, quindi sia in `GET /api/v1/ordini` sia nel
  dettaglio. **Fuori da `spedizione.citta`**, che resta l'indirizzo vero. Numeri
  al 03/08: 894 ordini, 571 dai tag e 323 dal prodotto, **tutti senza città
  vera**. Il motivo per cui andava esposta non è la completezza: `?citta=` cerca
  già in tutt'e due i campi, quindi la risposta restituiva ordini con
  `spedizione.citta` vuota **senza dire perché fossero usciti** — il filtro
  sapeva una cosa che la risposta non diceva.
- **LIVE in produzione dal 03/08/2026**, verificato su
  `https://deluxy-orders.vercel.app/api/v1/ordini/cms0w1n1n0iwxi6kk7p2jhkyj`
  (#7154 → `{citta: "Firenze", da: "tag", prova: "Firenze"}`).
- ⚠️ **Le altre app leggono la PRODUZIONE, non il locale.** Un campo nuovo nelle
  API non arriva a nessuno finché non si fa il deploy: `deluxy-marketing` punta a
  `https://deluxy-orders.vercel.app` per impostazione predefinita
  (`ORDERS_URL` in `src/lib/sync-ordini.ts`). Push ≠ pubblicato.
- ⚠️ **Esporre un campo non basta perché a valle lo usino.** In deluxy-marketing
  l'import scrive `citta: spedizione.citta ?? undefined` e `cittaDedotta` la
  ignora; e anche correggendo quella riga, il suo confronto «è cambiato?»
  (`sync-ordini.ts`) guarda solo totale, stato, numero, origine e utmSource — la
  città non c'è, quindi sull'archivio già importato non riscriverebbe niente.
  **Da concordare con l'utente** se in Marketing la città dedotta debba fondersi
  con quella vera o stare in una colonna sua (in quella cartella lavora un'altra
  sessione).

## Trappole già pagate — leggere prima di toccare l'import

1. **La consegna non si deduce dalle note.** Un ripiego a espressione regolare
   leggeva «30 Luglio 08/12» come *8 dicembre*, mentre `08/12` era la fascia
   oraria. In un registro operativo una consegna sbagliata è peggio di una
   mancante: se manca l'attributo, l'ordine resta «consegna non indicata».
   Vale anche per il **biglietto**: nessuno dei tre negozi ha un campo
   strutturato, quindi si mostra la nota intera etichettata «possibile
   biglietto — da verificare», senza inventare il testo da stampare.
2. **L'annullamento non si deduce dal pagamento.** Gli ordini #2565, #2562,
   #2563 sono annullati ma risultano «pagato». Senza `annullatoIl` un ordine
   annullato è indistinguibile da uno valido.
3. **Non riscrivere ciò che non è cambiato.** La sync confronta l'ordine prima
   di aggiornarlo (`cambiato()` in `sync.ts`). Senza, il cron notturno — che ha
   pochi minuti — non finiva mai: 90 giorni significano migliaia di ordini a
   ~110 aggiornamenti al minuto. Misurato: stessa finestra da 1,0 min a 0,1 min.
4. **Se aggiungi un campo alle RIGHE, mettilo anche in `righeCambiate()`.**
   Le righe si riscrivono solo se quel confronto dice che sono cambiate. Le foto
   sono rimaste vuote (6 righe su 16.938) proprio perché il confronto guardava
   solo le personalizzazioni.
5. **Il pooler Supabase chiude la connessione sui giri lunghi.** È successo tre
   volte oltre l'ora. `conRiprova()` riprova l'intera pagina (è idempotente) con
   pause fino a mezzo minuto. Un primo tentativo con 18 secondi di pazienza non
   bastava.
6. **`product.featuredImage` non è accessibile**: richiede lo scope
   `read_products`, che i token non hanno. Resta `lineItem.image` (57% delle
   righe su deluxy.it, 93-96% sugli altri).
7. **Nelle `$queryRaw` la tabella va qualificata con lo schema.** Prisma mette
   `orders.` da sé nelle query dei modelli, ma non in quelle grezze: quelle si
   appoggiano al `search_path` della connessione e col pooler in modalità
   transazione ne capita una senza. Sintomo visto in dev: la stessa query
   funziona, poi risponde `relation "Ordine" does not exist`, poi rifunziona.
   Si usa `tabella("Ordine")` di `src/lib/db.ts` (legge lo schema da
   `DATABASE_URL`), mai `FROM "Ordine"` nudo.
8. **Un campo Shopify in più può far cadere TUTTO l'import.** Vale per i
   consensi come per le foto: prima di aggiungerlo alla query si prova sul
   campo, negozio per negozio (`customer { emailMarketingConsent { … } }` è
   accessibile col token degli ordini, provato il 26/07/2026). Se un giorno
   rispondesse ACCESS_DENIED, l'import fallisce per intero, non «salta il
   campo».
9. **`WITH … AS MATERIALIZED` conta.** La vista dei clienti classificati ha
   espressioni regolari nella SELECT: senza materializzare, Postgres le
   ricalcola per ognuno dei 48 aggregati del catalogo (2,0 s → 0,6 s). Per
   l'elenco invece conviene il contrario — le calcola solo sulle righe mostrate
   (0,6 s → 0,2 s). Da qui l'interruttore in `vistaClienti()`.

## La regola più importante delle API
**Gli ordini annullati non escono.** `/api/v1/ordini` li esclude e il dettaglio
risponde **410**. Un'app a valle li lavorerebbe come validi — e restano spesso
«pagati», quindi non si riconoscono dal pagamento. Chi deve gestirli passa
`annullati=inclusi`; la risposta dichiara sempre `annullatiInclusi`.

**Finance è l'eccezione** e li chiede già
(`deluxy-partner/src/lib/ordini-registro.ts`): senza, perdeva 221 ordini con
26.200 EUR di movimenti (rimborsi da quadrare e incassi su ordini poi annullati)
e soprattutto non *scopriva* più gli annullamenti — un ordine importato quando
era valido spariva dalla risposta e restava valido per sempre.

Chi consuma oggi: `deluxy-partner-import` (Finance), `deluxy-messaggi` e
`deluxy-budgets` (sola lettura, 26/07/2026).

### `/api/v1/ricavi` — il venduto per brand e per mese (26/07/2026)
Nuovo endpoint di sola lettura, nato per il **consuntivo D2C di Budgets**: le
vendite ai consumatori non passano da Finance, quindi la voce di budget più
grande dell'anno restava a zero. La somma la fa il database (raw SQL con
`date_trunc` sui mesi **Europe/Rome**): a pagine di 200 ordini un anno sarebbe
stato decine di chiamate.

Scelte da conoscere prima di toccarlo:
- esclude **annullati** *e* **rimborsati/stornati** (REFUNDED, VOIDED);
- conta **per intero i rimborsi parziali** — l'importo reso non è nel registro,
  quindi si dichiara in `esclusi.parzialmenteRimborsati` invece di stimarlo;
- restituisce il **lordo Shopify** (IVA e spedizione incluse): l'aliquota non è
  sull'ordine, lo scorporo lo fa chi consuma e deve dichiararlo.

## PUNTI APERTI al 30/07/2026 — in ordine di cosa sblocca cosa

**Le prime due sono le uniche che bloccano qualcosa di già costruito.**

1. **`write_draft_orders` sui tre negozi Shopify.** Senza, la pagina
   **/incassa** («Fatti pagare», link per «100 rose») non può creare il link:
   `draftOrderCreate` risponde ACCESS_DENIED — provato davvero. Si aggiunge
   nella **Dev Dashboard** dell'app di ogni negozio (nel repo non c'è nessun
   `shopify.app.toml`: la configurazione sta solo lì), poi si preme «Ho aggiunto
   il permesso — rileggi» in pagina, che fa scadere il token: dura ~24 ore e i
   permessi ce li ha dentro. La pagina dice da sé quali negozi sono pronti.
2. **1.105 «probabili aziende» da confermare** (pagina Clienti, lista
   *Probabili aziende*). Al 30/07 la tabella `TagCliente` è **vuota**: nessuna
   tipologia è mai stata confermata a mano, quindi tutte sono dedotte dal nome
   dell'acquirente — aziende 75, hotel 4, eventi 1, rivenditori 0, tutto il
   resto «privato». Sono **317.669 €** di venduto quasi certamente B2B contati
   come privati, in Analisi e in Marketing. Oggi si conferma **un cliente alla
   volta**: la cosa che sblocca la coda è la conferma in blocco dalla lista.
3. **Il costo fornitore c'è solo su 371 ordini su 14.027** (copertura 3% dello
   storico, **9% sul 2026**): il margine misurato è vero ma su una fetta. Si
   allarga dal **/controllo**, abbinando gli addebiti. ⚠️ L'estratto conto di
   Finance parte dal **01/01/2025**: per gli ordini più vecchi non c'è niente da
   trovare, e la pagina lo dice invece di lasciarlo indovinare.
4. **La pagina `/ordini` di Finance non è stata rimossa.** La funzione è qui
   (/controllo), ma togliere di là pagina, modelli e cron è una **scelta
   contabile**: i `Pagamento` con riferimento `PAY-…` nascono in Finance e
   `/api/incassi` li espone alle altre app. **In quella cartella lavora
   un'altra sessione**: concordare prima.
5. **Il bug del tema di cakedesign.me.** Il sito scrive `Data_Consegna =
   "2026-undefined-27"`: quegli ordini restano «consegna non indicata» (giusto,
   ma è un buco vero). **Si corregge nel tema**, in `sviluppi-siti-deluxy/` —
   non qui.
6. **Le occasioni «da precisare»** sono il 59% del venduto 2026: ricorrenze vere
   di cui nessuno ha detto il motivo. Si fanno leggere all'AI dalla pagina
   Eventi clienti — finché non si fa, la dimensione «occasione» dice poco.
7. **2.421 ordini senza città** dopo la riconciliazione e **607** senza
   categoria. Residuo onesto: né i tag né i titoli dicono niente.
8. **Riepiloghi AI dei clienti: 3 su 10.285.** Il motore c'è ed è provato; vanno
   generati in blocco dalla pagina Clienti (ogni cliente è una chiamata a
   pagamento, quindi il numero si sceglie).
9. **La spesa pubblicitaria non è in /marketing.** La pagina misura il fatturato
   per canale, non il ritorno: la spesa vive in **deluxy-marketing**, che
   espone già la spesa reale via API. Collegandola nascono ROAS e MER per canale.
10. **Gli stessi dati nel Customer Service.** `repeater`, `marketing`,
    `mittente` e `urgenza` escono dalle API ma le tabelle di deluxy-messaging non
    li mostrano. Lì lavora un'altra sessione: concordare prima.
11. **Finance: cosa fare degli annullati** — li riceve ma li tratta come normali
    e finiscono in coda di riconciliazione. Scelta contabile, aspetta l'utente.
12. **`ORDERS_APP_PASSWORD` da cambiare**: è comparsa in chiaro in una chat.

## MANCA / prossimi passi
0. **Finance: cosa fare degli annullati.** Ora li riceve ma li tratta come
   ordini normali e finiscono in coda di riconciliazione. Va deciso se
   ignorarli o trasformarli in voci di rimborso: **è una scelta contabile**, non
   tecnica, e aspetta l'utente.
1. **Password della UI**: `ORDERS_APP_PASSWORD` è stata scelta dall'utente ma è
   comparsa in chiaro in una chat. Da cambiare quando si può.
2. **Backfill facoltativi**: rischio frode e foto sugli ordini storici. Costano
   ore e sono stati esclusi per scelta — le foto servono su ciò che è in
   lavorazione, il rischio su ciò che si deve ancora spedire.
3. **Riclassificazione avanzata** (idee): regole automatiche brand→stato,
   assegnazione massiva dalla bacheca, editor delle dimensioni libere
   `classificazioni`.
4. **Liste, prossimi passi**: tipologia in blocco dalla lista «probabili
   aziende» (oggi si conferma un cliente alla volta), invio diretto dei pubblici
   a Marketing/Google/Meta invece dell'export CSV, liste salvate dall'utente con
   criteri propri.

## Come si lavora qui
- **Import storico**: `npm run import:storico` (tutto) o `-- 90` (giorni).
  Ripetibile senza doppioni, riprende da dove si era fermato perché salta ciò
  che è già a posto.
- **Verifica**: `npm run verifica:totali` confronta con Shopify negozio per
  negozio. Da lanciare dopo ogni import importante.
- **Sync quotidiana**: cron Vercel `/api/cron/sync` (protetto da `CRON_SECRET`).
- La sync **non tocca mai** la classificazione Deluxy; la categoria di pagamento
  si aggiorna solo se non è stata corretta a mano (`categoriaPagamentoManuale`).
- Le chiavi API si vedono in chiaro una volta sola (nel DB c'è solo lo SHA-256).
- **Attenzione**: in questa cartella hanno lavorato due sessioni Claude in
  parallelo (contro la regola 4). Prima di partire, `git status` e `git log`.
