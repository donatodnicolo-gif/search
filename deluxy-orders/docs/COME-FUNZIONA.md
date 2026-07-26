# Come funziona Deluxy Orders

Manuale funzionale. Fonte di verità del comportamento dell'app: aggiornarlo a
ogni commit che cambia comportamento (regola di lavoro Deluxy n. 0).

## Idea
Tutti gli ordini Shopify dei brand Deluxy in un posto solo, riclassificabili
come serve, leggibili dalle altre app. Orders **non vende** e **non consegna**:
raccoglie, ordina e smista informazioni.

## Le pagine

### Ordini (`/`)
Due viste, con lo stesso motore di ricerca e filtri (il selettore è in alto a
destra):

- **Elenco** — tabella di tutti gli ordini. Ogni riga mostra numero, data,
  cliente, totale, pagamento, **stato** (cambiabile al volo dal menu a
  tendina), destinazione ed etichette, con il **colore del brand** sul bordo
  sinistro e nel pallino accanto al nome del negozio.
- **Colonne per brand** — una colonna per ogni negozio (Flowers, deluxy.it,
  cakedesign.me…), con quanti ordini e quanto valgono, e gli ordini come
  schede col bordo del colore del brand. Ogni scheda mostra **quando va
  consegnato** (giorno e fascia oraria) oltre alla data dell'ordine. Su schermo
  stretto le colonne si impilano; il selettore sparisce sotto i 700px.

### La consegna richiesta
Su Shopify il giorno e la fascia oraria di consegna sono **attributi
dell'ordine**: `Data_Consegna` (data) e `Fascia_Oraria_Consegna` (es. `16-20`).
Si vedono nelle colonne, nella colonna «Consegna» dell'elenco e in cima alla
scheda dell'ordine, con l'urgenza a colpo d'occhio: **oggi in rosso**, domani in
arancio, già passate smorzate.

Se l'ordine non ha quegli attributi resta «consegna non indicata»: la data
**non** viene indovinata dal testo delle note. Sembrerebbe utile, ma le note
contengono numeri ambigui — in un ordine vero «30 Luglio 08/12» il `08/12` è la
fascia oraria, e leggerlo come una data dava «8 dicembre». In un registro
operativo una consegna sbagliata è peggio di una mancante; la nota completa
resta comunque leggibile nella scheda dell'ordine.

Sopra, la **ricerca** (vedi sotto) e i filtri: brand, stato, categoria di
pagamento, destinazione, etichetta. Il pulsante «Sincronizza da Shopify» avvia
l'import. I colori dei brand si cambiano in Impostazioni.

### Consegna su bozze e ordini (`/consegna`)
Gli attributi della consegna li scrive il **sito**, quando l'ordine passa dal
carrello. Una **bozza creata a mano in admin** no: Shopify non ha un campo dove
metterli, così quegli ordini arrivano qui senza consegna (caso reale: ordine
#12646, nato dalla bozza #D5510, con la sola data).

Questa pagina copre il buco. Si sceglie il negozio, si scrive il numero — `D5510`
per una bozza, `12646` per un ordine, con o senza cancelletto — e la pagina mostra
la consegna attualmente impostata. Poi si scelgono data e fascia dalle **stesse
liste del sito** (due ore per la giornata, un'ora dai giorni successivi) e si
salva: l'app scrive `Data_Consegna` e `Fascia_Oraria_Consegna` su Shopify.

Dettagli che contano:
- su una **bozza** gli attributi passano all'ordine quando la bozza viene
  completata, quindi impostarli prima è sufficiente;
- gli **altri attributi** dell'ordine non si toccano: si riscrivono solo le due
  chiavi della consegna (le mutazioni di Shopify sostituiscono l'intero elenco,
  quindi l'app rilegge gli attributi esistenti e li rimette);
- lasciando un campo **vuoto** il dato viene rimosso, invece di lasciare in giro
  una consegna vecchia che a valle sembrerebbe confermata;
- se la bozza è già completata, o l'ordine già evaso, l'app lo dice prima di
  salvare (su un ordine evaso il fornitore va avvisato a parte);
- serve che il token del negozio abbia gli scope **`write_draft_orders`** e
  **`write_orders`**: il token nasce in sola lettura, e senza permessi l'app
  spiega cosa aggiungere invece di mostrare l'errore grezzo di Shopify.

Il registro locale non viene toccato: la consegna la rilegge dagli attributi al
prossimo import, perché la fonte resta Shopify.

### Il biglietto
Il simbolo **✉** accanto al numero segnala che l'ordine ha una dedica da
scrivere. Il testo si legge nella scheda, in evidenza.

Ci sono due casi, e la pagina li distingue perché non valgono uguale:
- **Biglietto** — arriva da un campo che il sito riempie apposta: è il testo da
  copiare sul cartoncino.
- **Possibile biglietto — da verificare** — arriva dalla **nota dell'ordine**,
  che nomina una dedica ma contiene di tutto. Va letto prima di copiarlo: un
  primo tentativo che accettava le note contenenti «scriv» o «messaggio» aveva
  preso per dediche due istruzioni di consegna («contattare per indirizzo di
  consegna»). Oggi sui negozi Deluxy tutti i biglietti sono di questo tipo,
  perché nessuno dei tre siti ha un campo dedicato.

### I prodotti dell'ordine
Le righe d'ordine si importano sempre: titolo, variante, SKU, quantità, prezzo,
**foto** e le **personalizzazioni** scelte dal cliente («Scritta sulla torta:
Sofia», «Colore della candelina: Rosso»), esattamente come le mostra Shopify.
I primi tre prodotti compaiono già sulla scheda dell'ordine nelle colonne, così
si vede cosa è stato ordinato senza aprire nulla.

> La foto è quella della riga d'ordine. Non si risale a quella del prodotto:
> servirebbe lo scope `read_products`, che i token non hanno — e chiederlo
> faceva fallire l'intero import con ACCESS_DENIED su tutti i negozi.

### Clienti (`/clienti`)
I clienti non sono una tabella a sé: si **ricavano dagli ordini**. Una persona è
identificata dall'email; se manca, dal telefono; se manca anche quello, dal
nome — così chi ha ordinato dieci volte, anche su brand diversi, resta un
cliente solo. Per ognuno: contatti, brand su cui ha comprato, numero di ordini,
totale speso, ordine medio, ultimo ordine e i suoi **tag** (tipologia e
segmento di valore). Si cerca per nome, email, telefono o città, si ordina per
spesa, numero di ordini, data o nome, e si filtra con le pillole **Segmento** e
**Tipologia** (sono le stesse liste del catalogo, applicate qui).

I totali del cliente **escludono gli ordini annullati** — come le API: un
annullato resta spesso «pagato» e conterebbe come fatturato, spingendo il
cliente fra i VIP per errore. Gli annullati si mostrano a parte («+2 annull.»).
Chi ha *solo* ordini annullati non compare: non ha mai comprato niente.

Gli ordini **senza alcun dato del cliente** non vengono spacciati per una
persona: restano fuori dall'elenco e si contano a parte nel riquadro «Ordini
senza dati cliente».

Cliccando un cliente si apre la sua **scheda**: tag, ordini validi, speso,
ordine medio, da quanto è fermo, il selettore della **tipologia**, le liste in
cui compare, l'anagrafica con l'ultimo indirizzo e tutti i suoi ordini (con
cambio di stato al volo).

### Liste (`/liste`)
I clienti raggruppati **come si usano**: 24 liste calcolate in tempo reale dagli
ordini (nessuna lista salvata che possa invecchiare). Ogni card dice quanti
clienti contiene, quanto valgono, **con che criterio** ci si finisce dentro e
**cosa farci**. Aprendone una si ottiene l'elenco dei clienti, la ricerca
interna, l'ordinamento e l'**export CSV** (separatore `;` e BOM: si apre in
Excel italiano con gli accenti giusti) da caricare su Customer Match o Meta.

Quattro famiglie:

- **Valore e ciclo di vita** — ogni cliente sta in **una sola** di queste:
  VIP (≥ 1.000 EUR o ≥ 8 ordini, attivo), *Da non perdere* (stessi numeri ma
  fermo da oltre un anno), Fedeli (≥ 4 ordini), Ricorrenti (2-3), Nuovi (un
  ordine negli ultimi 90 giorni), Una tantum, Da riattivare (12-24 mesi),
  Persi (oltre 24 mesi).
- **Tipologia** — Aziende, Hotel e ristoranti, Eventi e wedding, Rivenditori,
  Privati, più la coda di lavoro *Probabili aziende da confermare*.
- **Occasioni ricorrenti** — chi ha già comprato per San Valentino, Festa della
  donna, Festa della mamma, Natale.
- **Liste operative e ADV** — alto scontrino, multi-brand, cross-sell da fare,
  contattabili via email, contattabili via WhatsApp, con ordini annullati.

Le **soglie** sono tarate sui dati reali del registro (mediana di spesa 110 EUR,
90° percentile dell'ordine medio 265 EUR, 85% dei clienti con un solo ordine) e
si cambiano in un punto solo: `src/lib/segmenti.ts`.

### La tipologia di cliente (tag)
Si **deduce dal nome di chi ordina — mai dal destinatario**: nei fiori il
destinatario è quasi sempre un'altra persona, e un privato che manda un mazzo al
Four Seasons non è un hotel. Si usano solo parole che in italiano non sono anche
cognomi: la prova sui 10.375 clienti reali ha scartato «villa», «castello»,
«location», «fiori», «cake» e «spa» (che pescava le S.p.A. e i centri
benessere). Meglio poche tipologie giuste che tante sbagliate.

Il resto lo mette l'operatore: nella scheda del cliente si sceglie la tipologia
e, se serve, si scrive **perché**. Da quel momento **la mano vince** e la
deduzione automatica non la tocca più (stessa regola di
`categoriaPagamentoManuale` sugli ordini). Le pillole impostate a mano hanno una
spunta ✓.

L'indizio che non basta da solo — l'**email a dominio proprio** (non gmail,
libero, icloud…) — non scrive niente: alimenta la lista «Probabili aziende da
confermare», che è una coda di lavoro. È così che il registro impara chi è B2B.

### Bacheca (`/bacheca`)
Vista kanban: una colonna per ogni stato della pipeline (più «Senza stato»).
Ogni card è un ordine; cambiando lo stato dal menu della card l'ordine «si
sposta» di colonna. Filtro per brand.

### Scheda ordine (`/ordini/:id`)
- **Stato**: pillole per spostare l'ordine nella pipeline.
- **Etichette**: si aggiungono/tolgono con un clic.
- **Classificazione e instradamento**: categoria pagamento, destinazione (app),
  tipo consegna, tipo prodotto, canale, fornitore, responsabile, note interne.
- **Dati Shopify**: pagamento, evasione, gateway, cliente, spedizione, righe.
- **Storia**: ogni import e ogni riclassificazione, con autore e data.

### Impostazioni (`/impostazioni`)
- **Negozi Shopify**: aggiunta/rimozione, attiva/sospendi, tipo di
  autenticazione, ultima sync e **colore del brand** (quello con cui l'ordine
  si riconosce a colpo d'occhio in elenco e colonne). Pulsante «Sincronizza ora».
- **Pipeline degli stati**: crea/modifica/elimina stati (nome, colore, ordine,
  quale è predefinito e quali sono «di chiusura»). Eliminare uno stato lascia i
  suoi ordini «senza stato», non li cancella.
- **Etichette**: crea/elimina etichette colorate.
- **Chiavi API**: elenco (nome, permesso, uso), attiva/sospendi. La creazione è
  da riga di comando (`npm run chiave`).

## Import da Shopify
Per ogni negozio attivo si scaricano gli ordini via Admin API GraphQL, in sola
lettura. Si salvano dati ordine, cliente, spedizione e righe. I nuovi ordini
partono dallo stato **predefinito**; gli aggiornamenti **non toccano** stato,
etichette, assegnazione, note e la categoria di pagamento se è stata corretta a
mano. Rilanciare l'import non crea doppioni (chiave negozio + id Shopify).

- **Primo carico (tutto lo storico)**: `npm run import:storico` — nessun filtro
  di data, scarica a pagine e salva a blocchi, con ritentativi automatici se
  Shopify applica i limiti di frequenza. Su negozi grandi dura decine di
  minuti; se si interrompe basta rilanciarlo.
- **Aggiornamento quotidiano** (ultimi 90 giorni): pulsante «Sincronizza» nella
  UI, `npm run sync`, oppure il cron notturno Vercel `/api/cron/sync`
  (protetto da `CRON_SECRET`). Via API: `POST /api/v1/sync?giorni=90`
  (`giorni=tutto` per lo storico completo).

## Gli stati che arrivano da Shopify
Sono informativi: si importano e si mostrano, non si modificano da qui (la
fonte resta Shopify). Sono tre cose diverse, da non confondere con lo **stato
della pipeline**, che invece è la classificazione Deluxy.

- **Annullamento** — `annullatoIl` + motivo. È l'unico modo per sapere se un
  ordine è annullato: **non si deduce dal pagamento**. Casi reali: gli ordini
  #2565, #2562, #2563 risultano «pagato» pur essendo annullati. Un ordine
  annullato appare barrato e smorzato in elenco e colonne, con badge rosso e
  motivo, e con un avviso in cima alla sua scheda.
- **Evasione** — evaso, da evadere, evaso in parte, in attesa…
- **Stato del pagamento** — pagato, in attesa, rimborsato (anche in parte),
  annullato, autorizzato… Da non confondere con la *categoria di pagamento*
  (bonifico/carta/contrassegno), che è una classificazione Deluxy correggibile
  a mano.

I codici inglesi di Shopify vengono mostrati in italiano e colorati: evaso in
verde, rimborsi e annullamenti in rosso, situazioni parziali in arancio.

Si filtra per stato Shopify (non annullati, solo annullati, da evadere, evasi,
rimborsati) e per stato del pagamento puntuale.

### Rischio frode
Shopify analizza ogni ordine e assegna un livello (nessuno, basso, medio, alto)
con una raccomandazione (accettare, verificare, annullare). Qui si importano
livello, raccomandazione e i **soli segnali negativi**: Shopify ne restituisce
decine per ordine, ma quelli positivi («il CVV è corretto») non aiutano a
decidere. Restano i motivi utili: *indirizzo di spedizione a 9.715 km dalla
posizione dell'IP*, *fatturazione in Italia ma ordine effettuato dall'Albania*,
*connessione a rischio (proxy)*.

In elenco e colonne si segnalano **solo medio e alto**: «basso» è la norma e
riempirebbe le pagine di avvisi che nessuno guarderebbe più. La scheda
dell'ordine mostra l'elenco completo dei segnali e il consiglio di Shopify.
Filtro «Sospetti (medio o alto)».

Se un'app esterna ha più valutazioni (Shopify più un'app antifrode), si tiene la
**più severa**: è quella che deve far fermare l'operatore.

Il rischio si importa **solo sugli ordini nuovi**. Serve a decidere se spedire,
quindi ha valore sugli ordini freschi; riempirlo all'indietro costringerebbe
ogni sincronizzazione a riscrivere l'intero archivio (un'ora di lavoro) per un
dato che su un ordine di tre anni fa non cambia niente. Gli ordini storici
importati prima di questa funzione restano senza valutazione; se un ordine
viene aggiornato per altri motivi, il rischio viene salvato in quell'occasione.

## Classificazione «a piacimento»
- **Stato/pipeline**: dove si trova l'ordine nel flusso.
- **Etichette libere**: raggruppamenti trasversali (urgente, VIP, reso…).
- **Categorie**: pagamento (dedotta e correggibile), tipo consegna, tipo
  prodotto, canale.
- **Instradamento**: app di destinazione, fornitore, responsabile.
- **Dimensioni libere** (`classificazioni`, JSON): coppie chiave→valore per
  classificare senza cambiare lo schema (scrivibili via API).

## Lettura dalle altre app
Le altre app leggono con una chiave di sola lettura (`GET /api/v1/ordini`,
`/api/v1/ordini/:id`, `/api/v1/stati`, `/api/v1/liste`, `/api/v1/liste/:chiave`).
Chi ha una chiave di scrittura può anche riclassificare
(`PATCH /api/v1/ordini/:id`). Dettaglio in `README.md`.

Le **liste di clienti** escono con gli stessi criteri della UI: `/api/v1/liste`
dà il catalogo con i conteggi (e le soglie, così chi legge sa cosa significano),
`/api/v1/liste/:chiave` dà i clienti con segmento, tipologia, spesa e recency.
È l'interfaccia pensata per Marketing: da lì nascono i pubblici Customer Match e
Meta senza esportare a mano un CSV.

### Gli ordini annullati non escono dalle API
È la regola più importante di questa interfaccia. Un'app a valle che ricevesse
un ordine annullato potrebbe lavorarlo come valido — mandarlo a un fornitore,
contarlo nel fatturato — e **un ordine annullato resta spesso «pagato»**, quindi
non lo riconoscerebbe dallo stato del pagamento.

- `GET /api/v1/ordini` li esclude; la risposta dichiara sempre
  `annullatiInclusi`, così chi consuma sa cosa non sta ricevendo.
- `GET /api/v1/ordini/:id` su un ordine annullato risponde **410** spiegando il
  motivo, invece di servirlo come se fosse valido.
- Chi deve gestirli davvero passa `annullati=inclusi` (o `annullati=solo`).

**Finance è l'eccezione**: la riconciliazione ha bisogno degli annullati, perché
dietro ci sono rimborsi da quadrare e incassi realmente avvenuti. Chiama con
`annullati=inclusi` e legge il campo `annullato`. Le app operative (smistamento,
consegne) usano il default.
