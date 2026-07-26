# Deluxy Customer Service

Il **servizio clienti** dell'ecosistema Deluxy. Si aprono e si lavorano i **reclami**
sugli ordini — ognuno con una casistica, le azioni da eseguire e la colpa attribuita a un
**valet** o a un **partner**, da cui nascono i **giudizi** — e attorno restano gli
**ordini da lavorare** e l'**inbox unificata**: **WhatsApp**, **Messenger**, **Instagram**
(API ufficiali Meta) e la **chat del sito** in un'unica schermata.

- Porta di sviluppo: **3140** (`npm run dev`)
- Stack: Next.js 15 (App Router) + Prisma + Postgres, stesso impianto di `deluxy-mail/`
- Design: Deluxy Design System (token in `src/app/tokens.css`)

> L'app si chiamava "Deluxy Messaggi". Sono cambiate solo le **etichette visibili**:
> cartella (`deluxy-messaging/`), progetto Vercel, schema Postgres `messaging` e cookie
> `msg_session` restano quelli, perché rinominarli romperebbe URL, deploy e sessioni.

## Reclami (Customer Service)

**Il giro completo.** Da ogni ordine il bottone **Reclamo** apre il form già pieno con
ordine, cliente e recapiti. Si scegle una **casistica** e questa riempie da sola la
gravità, la colpa tipica e la **checklist delle azioni** da eseguire; poi si attribuisce
la **colpa** e si lavora il reclamo (Aperto → In lavorazione → Risolto → Chiuso).

**Casistiche** (`/reclami/casistiche`). Il catalogo dei tipi di reclamo: nome, gravità
(lieve/media/grave), colpa tipica e le azioni consigliate, una per riga. Un pulsante
carica le **7 casistiche più comuni** (ritardo, mancata consegna, prodotto danneggiato,
prodotto errato, indirizzo sbagliato, biglietto, comportamento del corriere) da adattare —
e non le duplica se le ricarichi.

**Colpa.** Un reclamo può essere imputato a un **valet** (chi consegna: registro locale in
`/reclami/valet`), a un **partner** (letto dal registro Anagrafiche, nessuna copia locale),
a **Deluxy** stessa, al **cliente**, oppure restare *da attribuire*. I giudizi si danno
solo a valet e partner.

**Giudizi** (`/reclami/giudizi`). La lettura dei **soli reclami**: per ogni valet e partner
la somma delle gravità (1/2/3), **dimezzata per i reclami risolti o chiusi** — rimediare
conta — tradotta in **Ottimo · Buono · Attenzione · Critico** (0 Ottimo, ≤2 Buono, ≤6
Attenzione, oltre Critico). Così un solo reclamo grave ancora aperto accende già
"Attenzione", mentre lo stesso reclamo risolto torna "Buono". Accanto si può registrare un
**giudizio manuale** (voto 1-5 + nota): non lo sostituisce, gli si affianca, così resta
sempre visibile da cosa nasce il numero. Per il quadro completo — feedback, orari e altre
variabili — c'è la **pagella** qui sotto.

## Come si contatta il cliente

Su ogni ordine ci sono i canali che quel cliente ha **davvero**: WhatsApp, Chiama,
Email. Nessuna gerarchia decisa dal codice — a chi ha appena scritto una mail si
risponde per mail, un ritardo grave si dice al telefono, e chi sceglie è chi ha in mano
la situazione. Se non ci sono recapiti il posto del bottone resta e dice perché.

WhatsApp e mail si aprono col messaggio già scritto **nella lingua del cliente** e non
partono da soli: si rilegge e si corregge prima di premere invio. La telefonata non
porta nessun testo, ovviamente.

## Il dettaglio di un ordine

Cliccando un ordine si apre il pannello con foto dei prodotti, messaggio pronto per
il fornitore e i dati che servono per parlare con le persone giuste:

- **Mittente** — chi ordina e paga, coi suoi recapiti e la lingua in cui gli si scrive;
- **Destinatario** — chi riceve il regalo. Quasi mai la stessa persona: quando lo è,
  il pannello lo dice;
- **Indirizzo di consegna** completo di CAP, provincia e paese.

> Il destinatario e l'indirizzo **non sono in copia qui**: li tiene il registro Ordini
> e si chiedono a lui nella stessa chiamata che porta le righe e le foto. Su un ordine
> vero (#1733) la copia locale aveva l'indirizzo vuoto mentre Orders aveva la via, il
> CAP e la provincia — prima quell'informazione non si vedeva affatto.

## Ordini aperti e ordini globali

La lista degli ordini è due pagine con la stessa tabella:

- **Ordini aperti** (`/`) è la lista di **lavoro**: solo ciò che non è ancora
  gestito, e **senza gli ordini su cui è già stato aperto un rimborso** — da quel
  momento quell'ordine si lavora in *Rimborsi*, e lasciarlo qui significa che
  prima o poi qualcuno lo rilavora per sbaglio. Se la richiesta viene rifiutata o
  annullata, l'ordine torna nella lista.
- **Ordini globali** (`/ordini-globali`) è l'**archivio**: tutto, gestiti e
  rimborsati compresi, con la ricerca su numero, cliente, telefono, email e
  indirizzo. Parte dalla vista a tabella, perché qui si cerca e non si lavora.

## Rimborsi

Da ogni ordine il pulsante **Rimborso** apre la richiesta già compilata: ordine, cliente,
recapiti, valore dell'ordine e stato del pagamento. Si scrive quanto si rende e **perché**,
poi la richiesta passa da **Da approvare → Approvato → Rimborsato** (o Rifiutato).

> **Quest'app non rimborsa nessuno.** Registra chi lo ha chiesto, chi lo ha approvato e
> come è stato reso. Il denaro lo muove una persona, su Shopify o in banca, e poi lo si
> segna come fatto — con l'esito scritto, obbligatorio. È la stessa regola dei pagamenti in
> tutto l'ecosistema: nessuna app Deluxy fa uscire soldi per conto proprio.

**I paletti, perché qui si parla di denaro vero.**

- **Non si rende più di quanto si è incassato**, e il tetto è *cumulativo*: se su un ordine
  da 64 € c'è già una richiesta da 40, la seconda può arrivare al massimo a 24, e dopo non
  passa più niente. Le richieste rifiutate o annullate non impegnano nulla, quindi dopo un
  rifiuto si può ripartire dall'intero importo.
- **Il motivo è obbligatorio**: un rimborso senza motivo scritto è impossibile da spiegare
  sei mesi dopo, quando è solo denaro uscito.
- **«Rimborsato» pretende l'esito** («reso su Shopify il 3/8»): senza, resterebbe un
  "fatto" senza prova di dove e quando.
- I confronti si fanno **in centesimi interi**, non in virgola mobile: con 66,66 già
  impegnati su 100, chiedere 33,34 deve passare — in float il residuo esce negativo e un
  rimborso legittimo verrebbe respinto.

**Gli avvisi non bloccano, informano.** Se Shopify dice che l'ordine è già rimborsato,
rimborsato in parte, stornato o non ancora incassato, il modulo lo scrive in cima: chi ha
parlato col cliente ne sa più del dato, ma deve saperlo *prima* di decidere. Sugli ordini
veri non è teoria: 16 risultano già rimborsati, 11 in parte, 11 stornati, 5 non incassati.

In alto: quante richieste sono da approvare, quante approvate da pagare, **quanto è
promesso e non ancora uscito** e quanto è già stato reso.

## Punteggi: la pagella di valet e partner

Il giudizio sui reclami guarda una cosa sola. La **pagella** (`/reclami/punteggi`) mette
insieme tutto: reclami ricevuti, feedback dei clienti, puntualità delle consegne e
qualunque altra variabile serva.

**Il punteggio non è una formula scritta nel codice.** È la media pesata di **voci** che
configuri tu. Ogni voce dice:

| | |
|---|---|
| **a chi si applica** | valet, partner, o tutti |
| **da dove prende il dato** | *Reclami* · *Feedback ricevuti* · *Puntualità* · *Valore a mano* |
| **quanto pesa** | un numero puro: contano i rapporti (peso 4 vale il doppio di peso 2). Peso **0** = la voce resta ma non conta |
| **la soglia** | per i reclami: il punteggio-reclami che azzera la voce. Per la puntualità: i minuti di tolleranza |

Ogni voce dà un valore da 0 a 100, così cose diverse — una media di voti da 1 a 5, una
percentuale di consegne, un conteggio di reclami — diventano confrontabili. Aggiungere una
variabile nuova ("cura del confezionamento", "risponde al telefono") significa aggiungere
una voce con fonte *Valore a mano* e scrivere un numero da 0 a 100 per ogni soggetto: non
serve toccare il codice. Le voci di partenza si creano con un pulsante — Reclami e Feedback
per tutti, Puntualità per i valet, Qualità del prodotto per i partner.

**Feedback e orari** (`/reclami/feedback`) è dove entrano i due dati che pesano di più. Il
feedback è il voto da 1 a 5 di una persona, con quello che ha detto e l'ordine a cui si
riferisce. La puntualità si registra come **minuti di ritardo** (0 = in orario, negativo =
in anticipo), non come "in orario sì/no": la tolleranza sta sulla voce, quindi cambiandola
gli stessi dati si rileggono da soli. Se metti l'ora attesa e l'ora di consegna, il ritardo
lo calcola l'app — e in quel caso le date vincono sul numero scritto a mano, per non avere
due verità.

### Le due regole che tengono onesto il numero

1. **Una voce senza dati viene esclusa, non contata come zero.** Un partner di cui non
   misuriamo la puntualità non deve risultare scarso per un dato che non abbiamo mai
   raccolto. Svuotare un valore a mano lo *rimuove* — diverso da metterlo a 0 — e la pagella
   dice sempre su quante voci si è basata.
2. **Sotto metà del peso misurato non si dà una fascia**, si scrive *Da valutare*. Serve a
   evitare un errore concreto, visto in verifica: con 41 partner in registro e i dati che
   arrivano poco a poco, 38 uscivano "100 Ottimo" solo perché non avevano ancora reclami —
   un complimento costruito sul nulla, che seppelliva i pochi con dati veri. Per questo la
   pagella mostra di default **solo chi ha prove sufficienti**, dicendo quanti sono gli
   altri e dove andare a misurarli.

Ogni riga si apre e mostra da cosa nasce il numero, voce per voce, col perché in chiaro:
«9 su 10 entro 15 min», «3 feedback, media 4,7/5», «2 reclami, peso 6 su soglia 10».

### Chi legge i reclami da fuori (API a chiave)

Il registro ordini (**deluxy-orders**) importa i feedback degli ordini e li mostra sulla
scheda dell'ordine: chi lavora sugli ordini vede che su quell'ordine c'è un reclamo,
senza cambiare app.

```
GET /api/v1/feedback?da=<ISO>&page=1&limit=200
Header: x-api-key: <chiave>
→ { page, limit, pagine, totali: { reclami, voti }, reclami: [...], voti: [...] }
```

- `da` = solo ciò che è cambiato da allora: è l'import **incrementale**.
- **Sola lettura.** Da fuori non si aprono né si chiudono reclami: un reclamo nasce dove
  c'è la persona che ha parlato col cliente.
- Escono i **reclami** (casistica, colpa, gravità, stato, azioni, esito) e i **voti**
  legati a un ordine. Un voto **senza numero d'ordine non esce**: a un registro di ordini
  non serve un giudizio che non sa dove attaccare.
- Le chiavi si creano con `npm run chiave -- <nome-app>`: nel database resta solo lo
  SHA-256, il valore in chiaro si vede una volta sola.
- `/api/v1/*` è **fuori dal cancello della sessione** (si autentica da sé, standard
  Deluxy §4.3) e risponde con gli header CORS.

## Come funziona (messaggistica)

**In entrata.** Un solo webhook per tutti i prodotti Meta: `POST /api/webhooks/meta`.
Su developers.facebook.com si registra quell'URL per WhatsApp (oggetto
`whatsapp_business_account`), Messenger (`page`) e Instagram (`instagram`); il verify
token e l'App Secret si impostano nella pagina **Impostazioni** dell'app. Ogni messaggio
in arrivo crea o aggiorna una `Conversazione` (canale + id esterno della persona) e
aggiunge un `Messaggio` con dedup sull'id Meta. Gli aggiornamenti di stato WhatsApp
(inviato/consegnato/letto/errore) aggiornano i messaggi in uscita.

**In uscita.** Dall'inbox si risponde: WhatsApp via Cloud API
(`/{phoneNumberId}/messages`), Messenger e Instagram via `/me/messages` col Page Access
Token. Il widget non ha invio esterno: il visitatore riceve col polling.

**Widget.** Snippet da incollare nel sito (mostrato in Impostazioni):
`<script src="https://TUA-APP/widget.js" defer></script>`. Lo script crea il bottone
flottante e apre un iframe su `/widget`; la sessione del visitatore è un token casuale
salvato nel suo browser, la conversazione appare in inbox come canale "Sito".

**Email (register.it), più caselle.** Le caselle si gestiscono in `/caselle` (tabella
`CasellaEmail`): se ne collegano quante servono, con una **predefinita** per le mail
nuove. *Scarica posta* in inbox legge la posta in arrivo di **tutte** le caselle attive
via IMAP e crea una conversazione per mittente; rispondendo dal thread la mail parte
dalla casella che ha ricevuto (`Conversazione.casellaId`), con oggetto `Re: …`.
Parametri ufficiali register.it — IMAP **`pop.securemail.pro:993`**, SMTP
**`authsmtp.securemail.pro:465`**, utente = indirizzo completo — host *generici*, non del
dominio del cliente ([fonte](https://www.register.it/assistenza/parametri-email/)). Porte
e host restano modificabili (sulla 587 si passa a STARTTLS). La password è cifrata e c'è
un pulsante che prova SMTP **e** IMAP. Nota: quei server presentano un certificato che può
non combaciare col nome usato, quindi si salta la verifica del *nome* — la connessione
resta cifrata (stessa scelta di `deluxy-mail`).

**Accesso.** Due pagine con link incrociati: `/login` per entrare e `/registrati` per
creare l'account (sessione firmata, come deluxy-mail). Il primo account registrato è
l'amministratore; i successivi nascono con ruolo operatore.

**Ordini (dal registro Deluxy Orders).** Gli ordini **non** si prendono più da Shopify: la
fonte è l'app **Deluxy Orders**, il registro centralizzato che sincronizza Shopify per
tutte le app (`src/lib/orders.ts` → `scaricaOrdiniDaOrders`, `GET /api/v1/ordini` con
`x-api-key`). Così la classificazione Deluxy è la stessa ovunque e non si duplica la
sincronizzazione. *Aggiorna da Ordini* nella pagina iniziale è **incrementale**: riparte dal
giorno dell'ordine più recente già presente (il primo giro è l'unico lungo), e deduplica sul
**gid Shopify** (`orderId`), così gli ordini presi in passato da Shopify si aggiornano invece
di duplicarsi. Ogni brand di Orders diventa un negozio in `/negozi` — creato da solo se
manca — che serve alle colonne della bacheca, alla sigla in rubrica e al bottone Fornitore;
lì **non servono più credenziali Shopify**. La lista ha **ricerca lato
server** (su tutti gli ordini, non solo quelli in pagina): testo su numero, cliente,
telefono — normalizzando le cifre, così "+39 333 12" trova "+393331234567" — email,
indirizzo e negozio, più i filtri per negozio e per contatto salvato/da salvare.

**I più urgenti stanno sempre in cima.** L'elenco è ordinato per urgenza: prima le consegne
di **oggi** (e dentro la giornata, prima chi va consegnato presto), poi domani e i giorni
successivi, poi le scadute da pochi giorni, poi quelle senza data, e **per ultime le scadute
da tempo**. In testa alla pagina le pillole dicono quante sono: *8 da consegnare oggi*, *7
domani*, *28 scadute di recente*.

> **Perché non basta «la consegna più vecchia prima»**, che sarebbe l'ordinamento ovvio: sugli
> ordini veri, fra quelli non gestiti **578 hanno la consegna già passata** — si torna a due
> mesi indietro — mentre quelli di oggi sono **8**. Quelle consegne sono avvenute, manca solo
> la spunta. Ordinando per data, il lavoro della giornata finirebbe sotto 578 righe di
> archeologia: l'esatto contrario di avere gli urgenti in primo piano.

L'ordinamento si fa nel database e non nella pagina, perché l'elenco è tagliato a 200: un
ordine da consegnare oggi ma ricevuto tre settimane fa altrimenti non entrerebbe nemmeno.

**La pagina è compatta, senza perdere bottoni.** Il primo ordine comincia a 344px dall'alto
invece di 430, e ogni scheda è 166px invece di 237 — un terzo in meno, quindi si vedono più
ordini per schermata. Le azioni sono **tutte** sulla scheda: lo spazio arriva da etichette
più corte (*Paga*, *Contatta*, col significato pieno nel suggerimento) e da una cornice più
stretta, che porta i bottoni da tre righe a due. Le stesse azioni si trovano anche nel
dettaglio, per chi lavora da lì.

**Cliccando un ordine si apre il dettaglio.** Un punto qualsiasi della scheda — o della riga
in tabella — apre un pannello con la **foto grande del prodotto**, le personalizzazioni
scelte dal cliente («Numeri: 30», «Base: shortcrust pastry»), i dati dell'ordine e le azioni
principali. I bottoni sulla scheda continuano a fare il loro mestiere: premere *Reclamo*
apre il reclamo, non il pannello.

Dentro c'è il **form rapido per il fornitore**: la foto si **copia** negli appunti (si incolla
diretta in WhatsApp o in una mail) o si **scarica** come file, e si copia il messaggio già
scritto —

> Per mercoledì 29 luglio possibile questo prodotto con ritiro 15-19?

**Il ritiro è la fascia di consegna meno un'ora**, perché il valet deve avere il prodotto in
mano prima di partire: consegna 16-20 → ritiro 15-19. Se la fascia non ha forma *ore-ore* il
ritiro resta *da concordare*: a un fornitore che deve organizzarsi non si manda un orario
inventato. Il messaggio è in italiano anche quando il cliente è straniero — qui si scrive a
un fornitore, che è un partner italiano.

Le foto arrivano dal registro Ordini (il Customer Service non tiene una copia dei prodotti) e
si scaricano passando dall'app, perché il browser ignora il download sui link verso un altro
dominio. Negli ultimi 60 giorni 730 ordini su 892 hanno almeno una foto; sugli altri si legge
*nessuna foto*.

**Si scrive al cliente nella sua lingua.** *Contatta cliente* apre WhatsApp o la mail con
l'apertura già scritta in **italiano, inglese, francese, spagnolo o tedesco**, e il titolo
del bottone dice quale lingua ha scelto e perché. Il messaggio non parte da solo:
l'operatore lo rilegge e può cambiarlo.

> **Conta chi compra, non dove vanno i fiori.** Qui si vende molto regalo, quindi cliente e
> destinatario sono spesso due persone in due paesi diversi — e noi scriviamo al *cliente*.
> Per questo si guarda prima il **suo** telefono, poi il dominio della **sua** email, e solo
> dopo il paese di spedizione. Usare l'indirizzo per primo scriverebbe in italiano a un
> londinese che manda fiori a Milano, e in francese a un italiano che li manda a Parigi.

Se il prefisso è estero ma non lo sappiamo tradurre (+971, +41) si passa all'inglese senza
guardare l'indirizzo: un cliente di Dubai che spedisce a Parigi non parla francese. Svizzera,
Belgio e Canada non vengono indovinati — da un indirizzo non si sa se a Berna si parli
tedesco o francese. E quando non c'è **nessun** segnale si scrive in italiano, perché tre
ordini su quattro spediscono in Italia: rispondere in inglese a un italiano solo perché manca
il suo numero sarebbe scommettere contro i propri dati. Sui 922 ordini in archivio: italiano
69%, inglese 26%, francese 3%, tedesco e spagnolo 1%.

**Quando va consegnato.** Ogni ordine mostra la **data di consegna** e la **fascia oraria**
chieste dal cliente: sulla scheda una riga sotto il nome, in tabella la colonna *Consegna*.
Chi lavora un ordine guarda quella, non la data in cui è stato fatto — perciò «consegna
OGGI» è in rosso, «domani» in oro e una consegna già scaduta lo dice a chiare lettere.

> **La fascia si scrive sempre con «ore» davanti.** Da Orders arriva come `08-12`, che
> accanto a una data si legge benissimo come *8 dicembre*: è un equivoco già capitato, e
> costa una consegna sbagliata. Qui diventa **«ore 8–12»**. Una fascia di forma diversa si
> mostra così com'è, senza tentare di interpretarla.

Quando il dato manca lo si dice: *consegna non indicata*, oppure *consegna ore 12–16,
giorno non indicato* se c'è solo la fascia. Sui 922 ordini in archivio, 618 hanno la data e
633 la fascia — «non indicata» non è un caso di scuola, ed è meglio di un giorno inventato.

**Da che tipo di cliente arriva l'ordine.** Ogni ordine porta un bollino —
**Privato · Azienda · Hotel/Ristorante · Eventi/Wedding · Rivenditore** — con il filtro
per tipo e la riga «Da che clienti: …» coi conteggi cliccabili. Serve a capire a colpo
d'occhio se si sta lavorando un regalo di una persona o una fornitura ricorrente, e a
leggere i reclami per tipo di cliente.

Il tipo **non si decide qui**: arriva da Deluxy Orders (`cliente.tipo` dell'API), che lo
deduce dal nome dell'acquirente e lascia a un operatore la possibilità di correggerlo a
mano. Qui è una copia che il sync riscrive a ogni giro — modificarla da quest'app
cambierebbe solo questa schermata e farebbe litigare le due app. Il bollino dice anche, nel
suggerimento, se il tipo è *dedotto* o *deciso a mano*: una deduzione si può smentire, la
scelta di un collega no.

Gli ordini senza email, telefono né nome restano **senza tipo** (filtro *Tipo non
rilevato*): lì non si sa chi sia il cliente, e "privato" sarebbe un'invenzione. Attenzione
a un limite del dato, non del codice: su Shopify il nome dell'acquirente è quasi sempre una
persona anche quando compra un'azienda, quindi il B2B risulta sottostimato — si corregge
caso per caso in Orders, e il sync lo porta qui.

**Aggiornamento automatico ogni 15 minuti.** Gli ordini arrivano da soli lungo tutta la catena: **Orders scarica da Shopify ogni quarto d'ora** (prima lo faceva una volta al giorno, quindi qui si interrogava una fonte ferma) e un cron Vercel
(`vercel.json` → `/api/cron/ordini`) rifà lo scarico incrementale ogni quarto d'ora, così
un ordine ricevuto alle 9:03 è qui entro le 9:15 senza che nessuno prema niente.

In testa alla pagina Ordini c'è la **catena degli aggiornamenti**: un pallino verde che
pulsa finché il giro è vivo, da quanto sono aggiornati gli ordini, da quanto Orders ha
scaricato da Shopify e che questa pagina si rilegge da sola. I due orari servono entrambi:
senza quello di Orders, «aggiornati 3 minuti fa» non distingue *non ci sono ordini nuovi*
da *Orders è fermo da ieri*, che per chi aspetta un ordine sono cose molto diverse — ed è
esattamente l'errore che c'era prima, quando Orders scaricava una volta al giorno.

**Due allarmi**, perché un elenco fermo e un elenco senza novità si vedono uguali: il
pallino diventa rosso con un avviso se l'ultimo giro è **fallito**, o se non si aggiorna
**da più di un'ora** (quattro giri mancati di fila non sono un ritardo, sono un guasto).

**L'elenco si rilegge da solo ogni minuto**, così gli ordini nuovi compaiono senza premere
niente. Un minuto e non quindici perché i giri del cron non sono allineati a quando hai
aperto la pagina: con un solo controllo ogni quarto d'ora, un ordine appena arrivato
potrebbe aspettarne quasi trenta. Si ferma quando la scheda non è in primo piano e rilegge
appena ci torni. *Aggiorna adesso* resta per quando non si vuole aspettare. La rotta è
protetta dal `CRON_SECRET` (header `Authorization: Bearer …`, che Vercel manda da solo):
senza segreto configurato risponde 503 invece di restare un endpoint aperto.
Il **salvataggio dei contatti in rubrica ha un cron suo**, ogni ora
(`/api/cron/contatti`): misurato, è la parte lenta — 40 chiamate alla People API, oltre 3
minuti, contro i ~20 secondi degli ordini — e attaccato al giro dei 15 minuti lo avrebbe
fatto scadere, facendo perdere proprio gli ordini che deve salvare.

**Partner (dal registro Anagrafiche).** `/partner` mostra i partner **attivi** letti da
**Deluxy Anagrafiche**, la fonte di verità delle anagrafiche B2B
(`GET /api/v1/partners?stato=attivo`, chiave di sola lettura in Impostazioni). Non ne
teniamo copia — è la regola del registro: si rilegge a ogni apertura, così un partner
dismesso sparisce subito anche di qui, e per modificarli si va in Anagrafiche. Si cerca su
tutti i campi (referenti compresi, la ricerca la fa il registro) e si filtra per categoria
e città; per ogni partner c'è lo stato dei **pagamenti** — lo scrive l'amministrazione, e
cambia il tono con cui gli scrivi — e il bottone **Scrivi**, che apre WhatsApp o la mail.
Quel bottone guarda prima l'insegna e **poi i referenti**: nel registro di oggi nessuno dei
41 partner attivi ha un telefono proprio, ma 28 hanno un referente col numero — senza il
ripiego il bottone sarebbe spento per 37 partner su 41.

**Vista a colonne e collegamenti alle altre app.** `/ordini` ha due viste: **Colonne**
(una per negozio, con conteggio e valore del filtro, card con numero/importo/cliente/città)
ed **Elenco** (tabella). Sotto ogni ordine c'è il bottone **Fornitore**, che apre l'app
Ricerca fornitori già impostata (`search-deluxy/?brand=…&ordine=…`); il brand di ogni
negozio si deduce (Flowers→deluxyflowers.com, Cake→cakedesign.me, Deluxy→deluxy.it) ed è
modificabile in `/negozi`. Cercando, oltre agli ordini locali compare **Archivio storico**:
gli ordini più vecchi dei 60 giorni scaricati da Shopify, letti dall'app **Deluxy Orders**
via `GET /api/v1/ordini` con chiave di sola lettura (`src/lib/orders.ts`, configurata in
Impostazioni) — non se ne duplica l'archivio.

**Calendario ordini.** `/calendario` mostra gli ordini nel giorno in cui vanno
**consegnati** (non ordinati), con ogni ordine colorato dallo **stato** della pipeline di
Orders (colori letti da `GET /api/v1/stati`). Si apre sull'**agenda a partire da oggi** —
i prossimi 60 giorni, con il giorno corrente in evidenza — perché quello che serve è cosa
va consegnato adesso; la **griglia del mese** è a un clic. Si filtra per stato cliccando la
legenda e per negozio; in testa il numero e il valore delle consegne. Gli ordini senza data
di consegna indicata non compaiono e vengono contati esplicitamente.

**Lavorazione degli ordini.** Ogni ordine ha uno stato **nostro** (`Ordine.gestione`,
distinto dalla pipeline di Orders): **Da gestire** → **In pagamento** → **Comunicazione con
cliente** → **Gestito**. Sotto ogni ordine ci sono i pulsanti che lo fanno avanzare:
*Richiedi pagamento* (apre Pagamenti già compilato e segna "in pagamento"), *Contatta
cliente* (apre WhatsApp se c'è il numero, altrimenti la mail, e segna "comunicazione"),
*Gestito ✓* (e *Riapri* per tornare indietro). Il filtro parte da **"Da gestire"**, così si
vede solo il lavoro aperto; si può passare a "Tutti" o a un singolo stato. Lo scarico da
Orders non tocca mai questo campo.

**Menu a scomparsa.** Il pulsante ☰ in alto chiude il menu laterale: gli ordini prendono
tutta la larghezza. La scelta resta in `localStorage` e viene riapplicata prima del primo
disegno, così non lampeggia.

**Richiedi pagamento.** `/pagamenti` raccoglie le coordinate su cui farsi pagare. IBAN e
intestatario si scrivono a mano oppure si fanno **leggere all'AI** (`src/lib/ai.ts`)
da un messaggio incollato o da un'immagine — schermata di chat, foto di un bonifico — che
restituisce IBAN, intestatario, importo e causale e compone la stringa pulita da inviare
(`IBAN … — intestato a … — importo … — causale «…»`). L'AI propone, ma la verità formale la
dà il **checksum mod-97** (`src/lib/iban.ts`, ISO 13616): una cifra letta male non passa e la
riga resta marcata "da controllare" invece di essere spacciata per buona. L'AI è **OpenAI**
(chiave in Impostazioni, cifrata; Anthropic resta come ripiego): `gpt-4o-mini` per il testo
e `gpt-4o` per le **immagini**, perché mini ha sbagliato un IBAN letto da una foto — due
zeri persi, beccati dal checksum — mentre 4o l'ha letto giusto.

**Inoltro a Deluxy Partner.** Salvando, la richiesta viene mandata a Partner, che approva e
paga: `POST {partnerUrl}/api/richieste-pagamento` con header `X-API-Key` e
`X-App: deluxy-messaging` (`src/lib/partner.ts`). L'invio è **idempotente** sul campo
`riferimento`: rimandarla non crea doppioni, la aggiorna finché è in attesa. Partner
pretende un importo maggiore di zero. Se l'invio fallisce la richiesta resta salvata qui, con
il motivo, e si rimanda col pulsante *Invia*; *Aggiorna* chiede a Partner a che punto è.

**Script — le risposte rapide che l'AI impara.** `/script` raccoglie le risposte che diamo
più spesso: titolo, categoria, testo e soprattutto **quando usarlo** (quella riga la legge
l'AI per scegliere). Non sono solo copia-incolla: sono la **memoria** da cui l'AI impara a
rispondere come rispondiamo noi. Nell'inbox, il pulsante **Risposta rapida** prende
l'ultimo messaggio del cliente, lascia scegliere all'AI lo script più adatto e lo fa
adattare al caso (nome, ordine, tono) — il testo finisce **nel riquadro di scrittura, non
parte da solo**: si legge, si corregge, poi si invia. Un avviso dice sempre da quale script
arriva. All'AI vengono mandati **soltanto i nostri script**, e l'id che restituisce viene
verificato contro quell'elenco: se nessuno c'entra lo dice — «rispondi a mano» — invece di
inventare una risposta. Ogni script conta gli **usi**, e i più usati vengono proposti per
primi. Nella pagina c'è anche un **banco di prova**: si incolla un messaggio e si vede cosa
risponderebbe, senza scrivere a nessuno.

**Menu.** Il menu sta **a sinistra** (`src/components/Sidebar.tsx`, stesso impianto di
Deluxy Orders: `.layout` + `.sidebar` sticky + `.main`); la barra in alto tiene solo marchio
e utente. Sotto gli 800px il menu diventa una riga orizzontale scorrevole.

**Clienti (rubrica).** `/clienti` è la rubrica ricavata dagli ordini: una scheda per
persona (dedup sul telefono, altrimenti email) con negozi, numero di ordini, totale speso,
ultimo ordine e stato in rubrica Google. Da lì si portano tutti in Google Contacts.

**Contatti automatici.** A ogni scarico i clienti finiscono in Google Contacts senza
intervento manuale (`src/lib/contatti.ts` → `salvaContattiOrdini`), col nome
`SIGLA Nome Cognome #ordine` — es. `FL Mario Rossi #1042`. La sigla è quella del negozio:
**FL** Flowers, **CK** Cake, **DL** Deluxy, dedotta da nome/dominio e personalizzabile in
`/negozi`. Un contatto per persona (dedup sulle ultime 9 cifre del telefono): se il cliente
riordina, il contatto viene **aggiornato** col numero dell'ordine più recente. Un contatto
già in rubrica ma **non** creato da questa app non viene mai rinominato (riconosciuto dal
marcatore "Deluxy Messaggi" in biografia). Restano i pulsanti manuali per il singolo ordine
e per il blocco.

**Google Contacts.** OAuth server-side (`src/lib/google.ts`): in Impostazioni si mettono
Client ID e Secret del progetto Google Cloud (People API attiva) e si autorizza il
redirect URI mostrato; il pulsante "Collega Google" porta al consenso e il refresh token
torna cifrato nel DB. Server-side (non il token-client del browser) perché su Vercel i
contatti vanno salvati anche senza un operatore davanti.

## Variabili d'ambiente

Vedi [.env.example](.env.example): `DATABASE_URL`/`DIRECT_URL` (Postgres), `APP_SECRET`
(firma sessioni + cifra i token Meta salvati), `APP_URL` (URL pubblico per webhook e
snippet) e `CRON_SECRET` (protegge i cron: **senza, l'aggiornamento automatico degli
ordini non parte** — la rotta risponde 503). I token dei canali NON stanno nell'ambiente:
si incollano in Impostazioni e finiscono cifrati (AES-256-GCM) nel database.

## Avvio

```bash
npm install
npm run db:push   # crea le tabelle (serve DIRECT_URL)
npm run dev       # http://localhost:3140
```
