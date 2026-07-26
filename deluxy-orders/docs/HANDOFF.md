# Handoff — Deluxy Orders

Stato al **26/07/2026**. Aggiornare a ogni tappa (regole di lavoro Deluxy).
Serve a far ripartire una finestra nuova senza contesto: prima lo stato, poi le
**trappole già pagate** — quelle valgono più dell'elenco delle funzioni.

## Cos'è
Registro centralizzato degli ordini Shopify di tutti i brand Deluxy: la fonte di
verità degli ordini, come Anagrafiche lo è per i partner. Importa da Shopify, fa
riclassificare a piacimento, espone alle altre app via API a chiave.

Next.js 15 + Prisma + Postgres condiviso (**schema `orders`**), porta **3150**.
**LIVE su https://deluxy-orders.vercel.app** (progetto Vercel `deluxy-orders`).
Manuale funzionale completo: [COME-FUNZIONA.md](COME-FUNZIONA.md).

## Stato: funziona tutto, con dati reali

**13.959 ordini** importati e allineati esattamente con Shopify
(`npm run verifica:totali` lo dimostra negozio per negozio: deluxy.it 11.640,
Flowers 1.584, cakedesign.me 730). Tre negozi collegati con Client ID+Secret,
credenziali riusate da Finance.

Le pagine: **Ordini** (vista predefinita a *colonne per brand*, più l'elenco in
tabella), **Bacheca** kanban, **scheda ordine**, **Clienti** (+ tag, + rubrica
Google), **Liste** (29 liste di clienti + export CSV), **Consegna**,
**Impostazioni**, **Fornitori vicini** per ordine.

### Liste e tag dei clienti (26/07/2026)
I 10.212 clienti (su 10.375 identificabili: 163 hanno solo ordini annullati e
non contano) sono classificati in tempo reale su due assi, e raccolti in **29
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
