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

## Più WhatsApp, una sola inbox

La holding ha più numeri WhatsApp Business — Deluxy Flowers, Cake Design, Deluxy Cake
Delivery. Ogni messaggio in arrivo porta con sé **su quale numero è arrivato**, e in
Inbox si vede il nome del brand accanto al canale. Serve a tre cose concrete:

- **rispondere col tono giusto**: le istruzioni di CS AI sono per brand;
- **rispondere dal numero giusto**: la risposta esce dalla linea che ha ricevuto, non
  da un numero fisso. Altrimenti a chi ha scritto ai fiori risponde la pasticceria, e
  dal suo telefono è un'altra azienda che gli scrive di un ordine che non ha fatto lì;
- **non mescolare i discorsi**: lo stesso cliente che scrive a due numeri ha due
  conversazioni separate, non una con due argomenti dentro.

Il collegamento numero → brand si dichiara in **Negozi**, nel campo *Phone Number ID*
(app Meta → WhatsApp → Configurazione API). Senza, il messaggio arriva comunque e in
Inbox si vede il numero grezzo invece del nome del marchio.

## Le reazioni

Il cuore o il pollice che un cliente attacca a un messaggio adesso **si vede**: la sua
emoji compare in una pastiglia **sotto la bolla a cui è stata messa**, come in ogni chat.
Vale anche per le reazioni ai **nostri** messaggi.

Prima arrivavano come un messaggio col testo **«[reaction]»** in mezzo al filo: non
diceva né quale emoji né a che cosa. In tabella ce ne sono **19 rimaste così**, e non si
possono recuperare — quell'evento l'emoji non la salvava. Al loro posto ora si legge «Il
cliente ha messo una reazione — quale, non lo sappiamo», con la data da cui invece si sa.

⚠️ **Togliere la reazione la fa sparire davvero.** Meta manda l'annullamento come un
evento con l'emoji **vuota** (su Instagram è `action: "unreact"`): non è un evento da
ignorare, è chi ha tolto il cuore.

⚠️ **Una reazione non riporta la conversazione in cima all'inbox.** Il filo si ordina per
l'ultimo messaggio, e un pollice è cortesia, non lavoro da fare: farla risalire vorrebbe
dire mettere in cima una chat chiusa.

⚠️ **Se il messaggio a cui si riferisce non ce l'abbiamo** (più vecchio del nostro
archivio), l'emoji non si butta: compare come messaggio a sé. Meglio un cuore senza
contesto che un cuore perso.

Su **Instagram e Messenger** le reazioni prima non arrivavano affatto — nemmeno come
«[reaction]». Lì Meta le manda in un campo tutto suo, fuori dal messaggio, e il codice
guardava solo i messaggi: venivano buttate in silenzio. Adesso si leggono.

Si ricontrolla con `npx tsx scripts/prova-reazioni.mts` (crea righe finte e le cancella).

## Il correttore di bozze

**Misurato il 22/08/2026 su 120 messaggi usciti scritti a mano: 18 avevano almeno un
refuso vero — il 15%.** «Good mornign», «Yes we recived your order», «compresa
consegnsa», «servirbbe», «tutta via», «un ora». Sono i messaggi che legge un cliente.

Adesso, quando premi **Invia** in Inbox, il messaggio viene **riletto prima di partire**:

- **Se è a posto parte subito.** Nell'85% dei casi non te ne accorgi nemmeno: il bottone
  dice «Rileggo…» per un attimo e il messaggio va.
- **Se trova qualcosa non parte.** Sopra la casella compaiono le parole trovate
  (`mornign → morning`) e due bottoni: **«Correggi»** mette a posto il testo e lo lascia
  lì da rileggere, **«Manda così»** manda com'è.

⚠️ **Non corregge mai da solo, e non manda mai da solo.** Un correttore che riscrive in
silenzio prima o poi «aggiusta» il cognome di un cliente o una via, e non se ne accorge
nessuno. Qui l'AI propone e decide una persona — la stessa regola dell'IBAN letto da una
foto.

⚠️ **«Manda così» non è un ripiego: è la via d'uscita, e deve restare.** Chi scrive sa
cose che il correttore non sa (una sigla, un nome, una parola in dialetto). Senza quel
bottone il correttore diventa un ostacolo, e un ostacolo si aggira — di solito smettendo
di leggerlo.

⚠️ **Se il correttore non risponde entro 2,5 secondi, il messaggio parte lo stesso.**
Rete, timeout, chiave scaduta: bloccare le risposte ai clienti è molto peggio di un
refuso.

⚠️ **Quello che non viene nemmeno guardato**: link, indirizzi email, numeri d'ordine
(`#2529`), telefoni e IBAN si mascherano prima di mandare il testo al modello. Sono la
fonte principale dei falsi allarmi, e un allarme falso di troppo insegna a mandare senza
leggere. E qualunque proposta che contenga cifre viene buttata comunque: «21018» non è un
refuso, è un CAP.

⚠️ **Più di cinque refusi in un messaggio = nessuno.** Non è un testo pieno di errori: è
un testo che il modello non ha capito (un'altra lingua, un elenco di codici). Meglio non
dire niente.

**Il modello è quello grande**, e non per abitudine: sugli stessi 120 messaggi `gpt-4o` ne
ha trovati **18** e `gpt-4o-mini` solo **11** — si perdeva «servirbbe», «tranfer»,
«theese», «tutta via». Costa circa **un euro al mese** al nostro volume.

C'è anche un aiuto gratis che prima non funzionava: la casella di risposta adesso dichiara
al browser **in che lingua si sta scrivendo** (quella del cliente, che l'app sa già). Prima,
con il solo dizionario italiano installato, ogni parola inglese risultava sbagliata — e una
schermata tutta rossa si impara a ignorare in un giorno.

Le regole si ricontrollano senza spendere niente: `npx tsx scripts/prova-correttore.mts`.
La catena intera (che chiama il modello): `npx tsx scripts/prova-correttore-vero.mts`.

## Segnalare spam

Il bottone **Spam** sta sia nella riga dell'elenco sia **dentro la conversazione aperta**:
la spazzatura la si riconosce leggendola, e chi doveva chiudere il thread, ritrovare la
riga e centrare un'icona quasi sempre non lo faceva.

Il mittente entra fra quelli ignorati e la conversazione va **in archivio** (non nel
cestino: non si cancella niente). ⚠️ Si salva l'**indirizzo esatto**, mai il dominio — da
uno spam `@gmail.com` sparirebbe in silenzio ogni cliente che scrive da Gmail. ⚠️ Solo
sulla **posta**: l'elenco dei mittenti ignorati lo leggono soltanto le rotte email, e su
WhatsApp o Instagram il blocco si fa da Meta.

## Chi si occupa di un ordine

Come per le conversazioni: gli operatori sono tre e la bacheca è una sola. Senza un
segnale, due persone chiamano lo stesso fornitore per lo stesso ordine — o (peggio)
nessuna delle due, ognuna convinta che ci pensi l'altra.

- **Operatore**: bottone «Me ne occupo io», e «Lascia» per liberarlo. Si lascia **solo il
  proprio**: liberare l'ordine di un altro con un clic vuol dire toglierglielo da sotto le
  mani senza che se ne accorga.
- **Amministratore**: al posto del bottone c'è il menu **«Assegna a…»** con tutti gli
  operatori e «Lascialo libero». Chi coordina il lavoro non lo prende: lo distribuisce.
- Bollino accanto al numero: **oro** = di un collega, **grigio** = mio.
- ⚠️ **«Paga» non sta piu' qui.** Stava accanto al menu «Assegna a…» e ci faceva riga a
  se': ma un pagamento non e' compagno di riga dell'assegnazione. Adesso e' piu' in basso
  **accanto a «Rimborso»**, con cui invece si legge insieme — i soldi vicini ai soldi.
- Filtro **«Chi se ne occupa: Liberi / Miei»**. ⚠️ Liberi prima di Miei: il guaio peggiore
  non è che due lavorino lo stesso ordine, è che non lo lavori nessuno.

⚠️ **Segnala, non blocca**: chi ha preso l'ordine può andare a pranzo, e una porta chiusa
la pagherebbe il cliente. Se due premono nello stesso secondo, il secondo riceve un avviso
con il nome di chi ce l'ha — non un silenzio con due nomi diversi sui due schermi.

## Quanto ci mette un ordine ad arrivare in bacheca

La catena è **Shopify → Deluxy Orders → qui**, e ogni anello ha il suo giro da 15 minuti:
il registro importa da Shopify `*/15`, noi leggiamo il registro a `5,20,35,50`. In pratica
un ordine compare qui **entro 5-20 minuti** da quando il cliente l'ha fatto.

⚠️ I due cron sono **sfasati apposta**: girando allo stesso minuto leggevamo il registro un
attimo prima che si aggiornasse, e gli ordini appena fatti restavano fuori per un giro
intero. Se serve subito, il bottone **«Aggiorna da Ordini»** fa il giro a mano.

Per dare un'idea del ritmo: negli ultimi 30 giorni sono arrivati **~15 ordini al giorno**
(minimo 6, massimo 26), con le punte attorno alle **11** e alle **15**, e solo l'8% fra
mezzanotte e le 7.

## Il diario di lavoro

Le righe che ci si scrive per ricordare cosa c'e' da fare su un ordine — prima stavano in
una chat interna: «12562 da fare 16 luglio», «2506 pagamento su cs, concordato cambio fiori
con mittente». Funzionava per chi le scriveva e per nessun altro: chi apriva l'ordine non
sapeva che esistessero.

**Menu → Diario**: si scrive **in un campo solo**, come sul quaderno, e il numero d'ordine
in testa si stacca da solo. Ogni riga si spunta quando e' fatta, e resta scritto chi l'ha
scritta e chi l'ha chiusa.

⚠️ Il numero si riconosce **solo in testa alla riga** e da 3 a 6 cifre: dentro la frase i
numeri sono date, importi e orari («per il 16 luglio», «45 euro»), e prenderli
attaccherebbe la nota all'ordine sbagliato — che e' peggio che non attaccarla a nessuno.

Sopra il campo ci sono gli **ordini aperti**: un clic e il numero va in testa alla riga.
Ogni pastiglia dice quante righe ha gia' quell'ordine, e quelle **senza** sono in evidenza —
la domanda della mattina non e' «quali ordini ci sono», e' quali sono ancora scoperti (c'e'
anche il filtro «Solo senza note»). ⚠️ Ne compaiono ventiquattro, nell'ordine del lavoro di
oggi: prima le consegne da qui in avanti, poi quelle senza data, in fondo le scadute. Gli
ordini aperti sono cinquecento: una striscia con cinquecento pastiglie non la guarda
nessuno.

**Le note si vedono anche sull'ordine** (riquadro nel pannello, dove si scrive senza
ripetere il numero) e **in home**, con le ultime dodici da fare: e' il quaderno con cui si
apre la giornata. Se non ce ne sono, il riquadro sparisce.

**E si scrivono dalla bacheca**, senza cambiare pagina: fra le azioni di ogni ordine c'e'
il bottone **«Nota»**. Si apre una casella, si scrive la mezza frase che si ha in testa
(«richiama lunedi'», «il fioraio non risponde») e Invio salva; Esc chiude. Prima
bisognava andare nel Diario, ritrovare il numero e ribatterlo: **tre passaggi**, e quello
che costa tre passaggi non si scrive — la memoria del lavoro resta nella testa di chi
c'era.

⚠️ **Il numero dell'ordine lo mette il codice, non la persona.** Il campo del Diario sa
staccarlo dalla testa del testo, ma qui l'ordine ce l'abbiamo gia' davanti: farlo ribattere
vorrebbe dire, prima o poi, attaccare la nota all'ordine sbagliato.

⚠️ **La casella si svuota e si chiude solo dopo un salvataggio riuscito.** Chiuderla
comunque farebbe sparire una frase appena scritta **proprio quando il salvataggio e'
fallito**, cioe' nell'unico momento in cui serviva ancora.

## Fare un ordine per il cliente

**Menu → Nuovo ordine**, oppure il bottone **«Nuovo ordine ↗»** dentro la conversazione:
da lì nome, email e telefono sono già compilati e la chat resta aperta in fondo (serve a
rileggere indirizzo, orari e biglietto mentre si compila).

**Il negozio arriva dalla conversazione**: il cliente ha scritto a quel marchio, e un ordine
Cake creato su Flowers avrebbe listino, spedizione e voce di consegna di un'altra azienda.

**Il cliente si richiama**: si cerca per nome, email o telefono fra quelli gia' registrati in
quel negozio e si riempie tutto, **indirizzo compreso**. ⚠️ La ricerca sta dentro il negozio
scelto: le anagrafiche Shopify sono separate per marchio.

**L'indirizzo si prende da Google Maps**: si scrive e si sceglie dall'elenco, e via, CAP,
citta' e provincia arrivano gia' separati e giusti. ⚠️ Un indirizzo scelto **esiste**; uno
digitato al telefono ha una cifra sbagliata una volta su dieci, e l'errore si scopre col
mazzo in mano davanti alla porta sbagliata. Serve la chiave in **Impostazioni → Indirizzi**
(API Places New); senza, la schermata lo dice e l'indirizzo si scrive a mano.

**La spedizione e' quella che quel negozio usa davvero**, letta dai suoi ultimi ordini:
Deluxy «Consegna Deluxy» (25 €) o «in Giacca, Cravatta e Guanti Bianchi» (15 €), Cake
«Consegna Standard» (10 €), Flowers «Consegna Sempre Gratuita». ⚠️ Non si legge da una
tabella nostra: un listino scritto oggi sarebbe falso fra un mese e nessuno se ne
accorgerebbe.

Si sceglie il negozio, si cerca il prodotto **nel catalogo** (con la foto, che è quella che
poi si manda al fornitore), si mettono giorno e fascia di consegna, indirizzo e biglietto.
Poi il **pagamento**:

- **Link di pagamento** — la bozza resta bozza e paga il cliente. Se ha l'email il link
  glielo manda Shopify; in ogni caso resta a schermo, da copiare o da mandare su WhatsApp.
  ⚠️ Finché non paga **non compare fra gli ordini da lavorare**, ed è giusto: non c'è niente
  da consegnare finché non è pagato.
- **Ha già pagato** (bonifico, contanti, POS, PayPal) — l'ordine nasce **pagato**. ⚠️ Chiede
  conferma con importo e mezzo davanti: scrive su Shopify un incasso, e se i soldi non sono
  arrivati la contabilità legge il falso. Il mezzo resta nelle note dell'ordine.

⚠️ **L'ordine nasce in Shopify**, non nella nostra tabella: torna qui dal registro come
tutti gli altri (entro ~20 minuti). Un ordine scritto solo qui sarebbe invisibile a
logistica, contabilità e Shopify. Giorno e fascia si scrivono negli attributi
 `Data_Consegna` e `Fascia_Oraria_Consegna`, gli unici che il registro legge.

## Chargeback: le contestazioni di pagamento

La banca di un cliente contesta un pagamento e i soldi tornano indietro. La pagina
**Chargeback** le tiene tutte, ordinate per **scadenza più vicina**, e dal dettaglio si
risponde alla banca.

⚠️ **Sono soldi con una scadenza**: se le prove non partono entro la data, la contestazione
si perde da sola. Contate il giorno in cui è nata questa pagina: **10 perse per 2.087,66 €**
e 3 aperte per 373,28 €.

- Il dettaglio dice **che cosa vuole la banca** a seconda del motivo: per «prodotto mai
  ricevuto» la prova della consegna, per «frode» che a ordinare sia stato il titolare della
  carta, per «non conforme» le foto e la politica di reso. Un testo generico si perde.
- Due gesti diversi: **Salva bozza** resta qui e non parte; **Invia le prove alla banca** è
  ⚠️ **irreversibile** — parte, e la contestazione passa in esame. La conferma mostra numero
  d'ordine e importo.
- ⚠️ Se qualcuno ha già risposto **dal pannello di Shopify**, quel testo vince sulla bozza:
  riscriverci sopra cancellerebbe il lavoro di un collega.
- In **Oggi** compaiono in cima, come primo riquadro della giornata: è l'unica cosa lì
  dentro che scade da sola. Se non ce ne sono, il riquadro sparisce.
- L'elenco si rilegge da Shopify **una volta all'ora** (e col bottone «Aggiorna da
  Shopify»). Una contestazione si muove in giorni, non in minuti.

## Spostare la consegna

Il cliente chiama e chiede un altro giorno: dal pannello dell'ordine, riga **Consegna →
Sposta**, si cambiano giorno e fascia. La data nuova vale subito ovunque — urgenza,
calendario, ordinamenti, messaggio al fornitore e ora di ritiro.

⚠️ **La consegna resta diversa da quella su Shopify**, e l'app lo dice: «spostata da
Nicolò · su Shopify resta 20 agosto». Va sistemata anche alla fonte, altrimenti chi guarda
Shopify (o chiunque legga il registro) vede l'altra data. Quando Orders porta la stessa
data, la deroga si spegne da sola.

⚠️ Finché la consegna è spostata, il sync **non** riscrive più data e fascia di quell'ordine:
senza questa regola la decisione di una persona verrebbe cancellata ogni 15 minuti, e la
data «tornerebbe indietro» senza spiegazione. «Rimetti quella di Shopify» annulla tutto.

## A che punto è un ordine

Sopra i bottoni di ogni ordine c'è la fila dei passi: **Da iniziare** (dove nasce) ·
**Ricerca fornitore** · **In pagamento** · **Attesa consegna**. Quello in corso è pieno,
gli altri no, e si cambia con un clic.

Sta prima dei bottoni perché risponde a un'altra domanda: i bottoni dicono *cosa posso
fare*, la fila dice *dove siamo*. Un ordine fermo sulla ricerca del fornitore e uno che
aspetta solo la consegna chiedono cose diverse a chi guarda la bacheca — e prima erano
tutti e due «Da gestire».

**Gestito ✓** sta **accanto** alla fila, staccato da una riga verticale e in verde: non è
il quinto passo. Gli altri dicono *a che punto siamo*, questo dice che **abbiamo finito** —
ed è l'unico che fa sparire l'ordine dalla lista di lavoro. Quando è acceso, ricliccarlo
**riapre** l'ordine.

**Comunicazione con cliente** non è un passo da scegliere: lo scrive l'app da sé quando
scrivi al cliente da qui.

Nella vista **elenco** (tabella) la fila non c'è e resta il bottone «Gestito ✓»: lì
toglierlo avrebbe tolto l'unico modo di chiudere un ordine.

## La riga dei filtri per punto

Sotto i filtri lunghi c'è una riga di pillole: **Solo nuovi** | **Tutti gli aperti · Da
iniziare · Ricerca fornitore · In pagamento · Attesa consegna** | **Gestiti**. I filtri
lunghi rispondono a *quali ordini*, questa riga a *a che punto*: erano due domande diverse
mescolate, e lo stato era una voce in fondo a una tendina — tre gesti per una cosa che si
guarda venti volte al giorno.

⚠️ È la **stessa** impostazione della tendina, non una seconda: premendo una pillola la
tendina segue, e viceversa. Ripremendo la stessa si torna agli aperti.

## L'ora dei messaggi, e «/» per le risposte pronte

Ogni messaggio porta **data e ora** («19 ago · 15:42»; solo l'ora se è di oggi): prima,
fuori da oggi, si leggeva solo il giorno — e «gliel'ho scritto alle 9, ha risposto alle 14»
è la storia di un reclamo, mentre «19 ago» non dice niente.

Nel riquadro della risposta, **premere «/» apre le risposte pronte** con la ricerca per
titolo: si scrive qualche lettera e **Invio** sceglie la prima. ⚠️ Solo a riquadro vuoto —
dentro un testo la barra è un carattere come un altro («16/20») — e la barra non resta
scritta: è un comando, non testo.

## Collegare una conversazione a un ordine

Nella testata del thread, **«Collega a un ordine»** (o «Cambia ordine» se ce n'è già uno):
si apre un pop-up che cerca per numero, cliente, telefono, email o indirizzo — e parte già
col nome del cliente, perché nove volte su dieci l'ordine è suo.

L'aggancio automatico prende il caso facile: il cliente cita il numero, o scrive dalla mail
o dal numero dell'ordine. Tutti gli altri («buongiorno, per la consegna di domani» da un
altro indirizzo) restavano senza, e chi rispondeva si cercava l'ordine a mano ogni volta.

Se nella conversazione un numero d'ordine è già scritto — «Ordine #2759 confermato», la
conferma incollata dal cliente — il pop-up lo propone **in cima, con un clic**: cercarlo a
mano quando è tre righe più su è lavoro che l'app deve togliere, non dare. ⚠️ Si
riconoscono solo le forme che *dichiarano* un ordine («#2759», «ordine 2759»): in chat
girano civici, CAP e importi, e proporre «20128» manderebbe a collegare la conversazione
sbagliata.

⚠️ Il pop-up cerca fra **tutti** gli ordini, non solo gli aperti: una mail arriva spesso
*dopo* la consegna. ⚠️ Un aggancio sbagliato fa leggere la conversazione col contesto di un
altro cliente: da lì si cambia e si scollega.

## «Solo nuovi»: cos'è entrato mentre non guardavi

In alto, accanto agli altri filtri, un interruttore **Solo nuovi**: mostra i soli ordini col
bollino **NUOVO**, cioè entrati nelle ultime 12 ore. È la domanda che ci si fa aprendo la
bacheca, e si risponde con un clic — acceso si vede, così non si resta a guardare una lista
corta chiedendosi dove sono finiti gli altri.

⚠️ Il filtro lo fa il server: la lista è tagliata a 200 e ordinata per urgenza, quindi
filtrare nel browser mostrerebbe i soli nuovi *fra i 200 già scelti*.

## L'ordine rimborsato si chiude da solo

Su un ordine reso non c'è più niente da lavorare: restava «Da gestire» in mezzo al lavoro
vero, e prima o poi qualcuno lo rilavorava. Quando Shopify lo dà **REFUNDED** (reso per
intero — un rimborso *parziale* lascia una consegna da fare, e resta aperto) l'ordine passa
a **Gestito**, con scritto «rimborso su Shopify» al posto del nome di chi l'ha chiuso.

⚠️ Si reagisce al **passaggio**, non allo stato: chiudendo a ogni giro, un ordine che una
persona ha riaperto apposta verrebbe richiuso al giro dopo, e al successivo. **Chi riapre
comanda**: da quel momento il sync non lo tocca più.

## Pagamento in sospeso e sospetto di frode

Un ordine **non incassato** o che **Shopify considera sospetto** non deve partire. Il
bollino sta nella lista (scheda e riga), non solo nel dettaglio: l'ordine si lavora
scorrendo la bacheca, e un avviso dentro un pannello che si apre a richiesta lo legge solo
chi era già andato a cercarlo.

- «⚠️ Pagamento in sospeso» (Shopify non risulta aver incassato), «Pagamento stornato»,
  «Rimborsato» / «Rimborsato in parte».
- «⚠️ Possibile frode» / «Rischio frode alto», col consiglio di Shopify (verificare o
  annullare). ⚠️ Un ordine fraudolento pagato con carta rubata torna indietro come storno,
  e il prodotto è già stato consegnato.
- ⚠️ **LOW e NONE non si mostrano** (sono il 99% degli ordini) e nemmeno il pagamento
  sconosciuto: un bollino su tutto è come nessun bollino. Rosso solo per ciò che ferma la
  mano.

I due dati arrivano da Deluxy Orders, che li legge da Shopify: qui si copiano soltanto.

## I fornitori che abbiamo già in quella provincia

Nel dettaglio dell'ordine, sotto il messaggio per il fornitore, compaiono i **partner
attivi del registro Anagrafiche che stanno nella provincia di consegna**: le pasticcerie
se l'ordine è del negozio Cake, i fiorai se è di Flowers. Con WhatsApp, Email e «Copia
richiesta».

⚠️ La richiesta è **lo stesso testo dell'app Ricerca fornitori** («Buongiorno, per giovedì
20 agosto è possibile Millefoglie x6 da spedire con consegna a … all'ora 12-16?»): due
formulazioni diverse per la stessa richiesta, dalla stessa azienda, allo stesso fornitore,
sono due mittenti diversi visti da fuori.

Compaiono **partner e prospect**, prima quelli con cui lavoriamo già, e accanto al nome
si legge quale dei due è: a un prospect non si promettono le condizioni di un partner.
Restano fuori solo «non interessato» e «dismesso», che vogliono dire *non chiamarli*.

Il riquadro ha una **sua fascia larga** sotto le tre colonne, e un menu per scegliere il
mestiere: **pasticcerie**, **fiorai**, o quello che dice il negozio. ⚠️ La scelta serve
perché il negozio non sempre lo dice: sugli ordini **Deluxy** — che vende di tutto — non
si può dedurre niente, e su un ordine di una torta uscivano anche i fiorai. Non si prova a
indovinare dal nome del prodotto: «Numbers», «Millefoglie», «Bouquet» sono nomi di
listino, e una parola fraintesa manda a chiamare il fornitore sbagliato.

Scrivendo per **email**, la **foto del prodotto parte allegata** (la spunta la toglie): su
una richiesta a un fornitore la foto *è* la richiesta — è quello che si fa a mano su
WhatsApp da sempre. ⚠️ Se la foto non si riesce a scaricare la mail parte lo stesso, e il
pop-up lo dice: chi ha scritto «come da foto» deve sapere che il fornitore quella foto non
ce l'ha.

⚠️ Nel registro la stessa provincia è scritta in due modi (20 partner «MI», 9 «MILANO»):
si confrontano le **sigle**, altrimenti un ordine a Milano trova due terzi dei fornitori e
la lista sembra solo più corta. Per lo stesso motivo si leggono **tutte** le pagine del
registro (1.040 righe, non le prime 200): una lista tagliata non sembra sbagliata, sembra
corta. Dove davvero non c'è nessuno lo dice, e rimanda a «Cerca fornitore» — che cerca su
Google chi ancora non conosciamo.

## Gli avvisi suonano per quello che riguarda te

Gli operatori sono tre e l'inbox è una sola. Il suono e l'avviso del browser arrivano
**solo** per le conversazioni:

- **tue** (le hai prese in carico): la risposta la devi tu;
- **libere**: nessuno se ne sta ancora occupando, ed è il caso peggiore — quello in cui
  rischia di non rispondere nessuno. L'avviso lo dice a parole.

Per quelle prese da un collega si tace: se ne sta occupando lui, e interrompere te non
aiuta il cliente. ⚠️ L'avviso del browser compare **solo a scheda non in primo piano** (se
stai guardando l'inbox lo vedi da solo) e il permesso lo deve chiedere un clic, dal
bottone «Avvisi».

⚠️ Un collega che **libera** una conversazione con tre messaggi non letti non fa suonare
niente: un cambio di proprietario non è un messaggio nuovo. La regola sta in
`src/lib/avvisi.ts` e si prova con `npx tsx scripts/prova-avvisi.mts`.

## La risposta di primo contatto

Chi scrive per la **prima volta** riceve subito un messaggio che dice che è arrivato e
che qualcuno lo leggerà. Fra il suo messaggio e la prima risposta di una persona può
passare un'ora, e in quell'ora un cliente non sa nemmeno se ha scritto al posto giusto.

- Parte **una sola volta per conversazione**, al primissimo messaggio in assoluto. Chi
  scrive di nuovo il giorno dopo non se lo ritrova.
- **Non porta il nome di nessun operatore**: nella chat è etichettato *risposta
  automatica*. Firmarlo col nome di una persona vorrebbe dire che il cliente le
  risponde per nome, e che nel thread non si distingue più quello che ha detto qualcuno
  da quello che ha detto il sistema.
- **Non fa sembrare la conversazione servita**: nell'elenco resta l'anteprima del
  messaggio del *cliente*, i non letti non si azzerano, nessuno risulta averla presa in
  carico, e il «da quanto aspetta» continua a contare dal messaggio del cliente.
- Vale su **WhatsApp, Instagram, Messenger e la chat dei siti**. ⚠️ **Non sulla posta**:
  in una casella email arrivano newsletter, notifiche e spam — rispondere da soli lì
  vuol dire scrivere agli spammer (che così sanno che la casella è viva) o aprire un
  ping-pong infinito con un altro risponditore automatico.
- **Esce nella lingua di chi ha scritto**: italiano, inglese, francese, spagnolo,
  tedesco. Si guarda il testo del messaggio; se non basta, i marcatori («hello», «please»,
  «bonjour»); se non bastano nemmeno quelli, il **prefisso del telefono** (+33, +49). Nel
  dubbio resta l'italiano.
- Interruttore e testo in **Impostazioni → Risposta di primo contatto**. ⚠️ Il testo che
  scrivi lì vale per l'**italiano**: le altre lingue usano le traduzioni scritte nel codice
  (scritte a mano, non tradotte al volo — questo messaggio parte dentro il webhook, dove
  ogni attesa in più è un messaggio che rischia di perdersi).

⚠️ Nel testo non vanno promesse che non dipendono da noi («ti rispondiamo entro
un'ora», orari di apertura): questo messaggio parte anche di notte e a Ferragosto, e a
incassarlo è il cliente.

## Chi può entrare: la pagina Utenti

In **Utenti** (sotto Configurazione) un amministratore apre gli account dei colleghi:
nome, email, password e ruolo. La password la scegli tu e **gliela dici a voce** —
l'app non manda email, e la password non compare mai in un indirizzo o in un
messaggio, perché da lì finirebbe nella cronologia del browser.

Due ruoli: **amministratore** (usa l'app e gestisce gli accessi) e **operatore**
(usa l'app). Un operatore che apre la pagina legge che gli accessi li gestisce un
amministratore, e non può farci niente — nemmeno aggirando la schermata.

> **La registrazione libera è chiusa, e prima era un problema vero.** Chiunque
> conoscesse l'indirizzo di questa app poteva crearsi un account da solo ed entrare:
> dentro ci sono nomi, indirizzi, telefoni ed email dei clienti, i reclami e i
> rimborsi. La pagina di registrazione ora funziona **solo su un'installazione senza
> nessun utente**, per creare il primo amministratore. Tutti gli altri accessi si
> aprono da Utenti.

Due cose non si possono fare, e l'app lo dice invece di rifiutare in silenzio:
togliere il **proprio** account (te lo chiude sotto i piedi mentre lo usi) e togliere
o retrocedere l'**ultimo amministratore** — resteremmo senza nessuno che possa aprire
account, e da dentro l'app non si rimedia.

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

## CS AI: come l'AI parla ai clienti

In **CS AI** si scrive il *come*: tono di voce, firma, cosa non promettere mai, cosa cambia
fra una chat e una mail. Ogni istruzione ha un ambito — *sempre*, *solo chat*, *solo email* —
e finisce nel prompt di ogni risposta suggerita. I testi da mandare restano gli **Script**:
quelli sono il *cosa*.

> **Cinque regole non si toccano da qui.** Non inventare dati, non promettere rimborsi o
> date, non spacciare per decisa una cosa che non lo è, tacere quando non si sa: stanno nel
> codice e la pagina le mostra soltanto. Se fossero cancellabili, basterebbe togliere una
> riga perché l'AI inizi a promettere ai clienti cose che nessuno ha deciso — e ce ne si
> accorgerebbe quando qualcuno ci tiene per la parola. Quello che scrivi si aggiunge a
> quelle, e se le contraddice vincono loro.

Il pulsante **«Cosa legge l'AI»** mostra il blocco esatto che finisce nel prompt, separato
per chat e per mail: serve a vedere se un'istruzione è arrivata davvero e in che ordine. Una
regola che credi attiva e non lo è, è peggio di una che manca.

## Documenti: insegnare all'AI a partire da quello che è già scritto

In CS AI si caricano i documenti dell'azienda — il manuale del servizio clienti, la brand
voice, le regole di consegna: PDF, Word, testo, fino a 4 MB. L'AI li legge e **propone**
delle regole; tu spunti quelle da tenere. Sotto ognuna c'è la frase del documento da cui
nasce, così si controlla in un secondo che non se la sia inventata.

> **Il documento non viene allegato a ogni risposta.** Da trenta pagine restano poche
> regole, approvate da una persona. Mandare il manuale intero a ogni messaggio costerebbe
> a ogni messaggio, annegherebbe le regole che contano fra indici e frontespizi, e
> renderebbe impossibile capire perché l'AI ha scritto una certa frase.

Un PDF *scansionato* è un'immagine e non contiene testo: l'app lo dice, invece di salvare un
documento vuoto. Le regole ricavate ricordano da quale documento vengono e restano anche se
il documento viene cancellato — perdono solo il rimando alla fonte.

## Ogni brand parla con la sua voce

Un'istruzione può valere per **tutti i marchi** o per **uno solo**. Il brand si prende
dall'ordine, e le regole del brand sbagliato non entrano mai: se il brand non si riesce a
stabilire valgono solo le regole generali — meglio il tono neutro dell'azienda che quello
di un altro negozio.

Quando una regola di brand contraddice una generale — «firmati Servizio Clienti Deluxy»
contro «firmati Il team di Cake Design» — si indica quale **sostituisce**, e quella non
viene nemmeno mandata all'AI.

> **Le istruzioni si scrivono come ordini.** «Chiudi ogni mail con…» funziona; «ci si firma
> sempre…» viene ignorata. Non è una preferenza di stile: misurato, il modello legge una
> descrizione come un'informazione sull'azienda invece che come una cosa da fare adesso.

> **Le risposte ai clienti usano gpt-4o, non il modello piccolo**, e costano di più. Con
> gpt-4o-mini, su sei prove identiche, la firma richiesta dalle istruzioni non compariva mai
> quando c'era di mezzo un brand; con gpt-4o compare sei volte su sei, sempre quella del
> marchio giusto. Si cambia in Impostazioni.

## Esportare le linee guida

Dalla pagina CS AI, **Stampa o PDF** apre il documento pronto da stampare (o da salvare in
PDF dal browser) e **Scarica (.md)** lo dà in Markdown. Escono le regole non negoziabili
insieme alle istruzioni, raggruppate per categoria, con la fonte di ognuna; filtrando per
brand esce il documento di quel brand, e le regole che lì non valgono si vedono barrate.

Serve perché le regole che legge l'AI devono poterle leggere anche le persone: chi entra in
squadra, chi lavora dall'esterno, chi deve approvarle. Se il tono di voce vive solo dentro
un prompt, esiste per il modello e non per l'azienda.

## I comandi sotto il dito

Sul telefono i bottoni di ogni ordine sono **alti 40px** e distanziati. Prima erano
alti 24 e affiancati a nove per riga: «Email» era largo 47 e alto 24, con «Chiama» e
«Reclamo» attaccati. Il minimo per un polpastrello è 44px, quindi si mancava il
bersaglio in continuazione — e mancarlo lì vuol dire o non far succedere niente o
aprire il pannello dell'ordine, che da fuori sembra «la mail non funziona».

Nel dettaglio, anche **l'indirizzo email si tocca** e apre il modulo di posta già
compilato, e il numero di telefono chiama. Prima erano testo e basta: su un telefono
sono la prima cosa su cui si preme.

## Il menu sul telefono

Sotto gli 800px il menu non è una colonna ma un **pannello che scorre da
sinistra**: si apre col tasto in alto a sinistra, si chiude toccando la pagina
dietro, con Esc, e da solo appena scegli dove andare. Parte sempre chiuso.

> Prima diventava una riga orizzontale sopra il contenuto: ventidue voci da
> scorrere di lato, con le intestazioni dei gruppi nascoste — si arrivava in
> fondo alla riga senza sapere più dove si era. E il tasto del menu, che sul
> computer stringe la colonna, sul telefono spostava la riga fuori schermo
> lasciando una banda vuota alta uguale.

Sul computer non cambia niente: il tasto stringe la colonna e la scelta resta
salvata per la volta dopo.

## «NUOVO»: gli ordini arrivati mentre lavoravi

Gli ordini entrano da soli ogni quindici minuti, e la lista è ordinata per
urgenza: uno nuovo può spuntare a metà pagina senza che nessuno se ne accorga.
Da oggi porta un bollino **NUOVO** dorato — l'unico bollino pieno della lista,
perché è l'unica cosa che deve farsi notare.

Vale per la sessione in corso: chiudendo la scheda e riaprendo domani, quegli
ordini non sono più nuovi. Il conto parte da quando hai aperto l'app, non
dalla data dell'ordine.

## Che cliente è: nuovo, di ritorno, VIP

Accanto al tipo di cliente c'è **quante volte ha già comprato**: *Nuovo cliente*,
*2° ordine*, *Cliente VIP · 7° ordine*. A chi è al primo ordine si spiegano cose
che al nono sono offensive, e a chi ha comprato dieci volte e stavolta ha un
problema si risponde con un'altra faccia.

> **Il conto viene dal registro Ordini, non da qui.** Questa app tiene solo gli
> ultimi due mesi: contando su quelli, il 91,7% dei clienti sembrava avere un
> ordine solo e un cliente che compra ogni Natale sarebbe risultato nuovo ogni
> Natale. Sulla storia intera saltano fuori clienti al 20°, 26°, 33° ordine.

**VIP dal quarto ordine in su**, ed è una soglia misurata: gli ordini di clienti
affezionati sono il 7,2% del totale — rari abbastanza da voler dire qualcosa,
frequenti abbastanza da vederli. Quando il registro non riconosce il cliente il
bollino **non compare**: non si scrive «nuovo cliente» perché il dato manca.

## Come si contatta il cliente

Su ogni ordine ci sono i canali che quel cliente ha **davvero**: WhatsApp, Chiama,
Email. Nessuna gerarchia decisa dal codice — a chi ha appena scritto una mail si
risponde per mail, un ritardo grave si dice al telefono, e chi sceglie è chi ha in mano
la situazione. Se non ci sono recapiti il posto del bottone resta e dice perché.

WhatsApp e mail si aprono col messaggio già scritto **nella lingua del cliente** e non
partono da soli: si rilegge e si corregge prima di premere invio. La telefonata non
porta nessun testo, ovviamente.

**La mail si manda da qui, non dal programma di posta del computer.** *Email* apre un pop-up
con mittente, destinatario, oggetto e testo già compilati: si rilegge e si preme *Invia*. La
mail esce dalla **casella aziendale** (`cs@deluxy.it`) e resta registrata in **Inbox**, nella
conversazione del cliente.

> Prima era un link `mailto:`, che apre il client di posta del computer: dove non è
> configurato non succede niente, e dove lo è la mail parte da un indirizzo personale — fuori
> dall'app e senza lasciare traccia. Chi prende il turno dopo non trova più quella
> conversazione.

Se ci sono più caselle si scegle il mittente; se non ce n'è nessuna il pop-up lo dice e rimanda
a *Caselle*. Un indirizzo non valido, un messaggio vuoto o una casella che non esiste più
vengono respinti **prima** di provare a spedire.

**Le risposte pronte si richiamano da lì.** Nel modulo c'è *Usa uno script*: si cerca fra i
testi salvati in [Script](#) e si clicca — entra nel messaggio dove sta il cursore, o in fondo
se non hai ancora scritto niente. Ogni uso fa crescere il contatore, così l'elenco tiene in
cima quelli che si usano davvero.

> **Il saluto non esce doppio.** Ogni script comincia con «Buongiorno,» e il corpo della mail
> ce l'ha già: quando succede, allo script si toglie il suo. Nient'altro — non si riscrive e
> non si "migliora" il testo che hai salvato. Se avevi selezionato del testo, lo script lo
> sostituisce in linea; altrimenti diventa un paragrafo a sé.

## Il biglietto

Il biglietto è quello che il cliente scrive nelle **note dell'ordine**: gli ordini che
ne hanno una portano una **busta dorata** accanto al numero — sono l'81%. Aprendo
l'ordine, la sezione **Biglietto e note del cliente** c'è **sempre**: col testo per
intero e il tasto *Copia biglietto* quando c'è qualcosa, e con scritto «nessun
biglietto» quando il cliente non ha scritto niente.

> **Quel testo non è solo il biglietto, ed è per questo che si mostra tutto.** Sugli
> ordini veri le note contengono il messaggio per il cartoncino insieme all'indirizzo
> del destinatario, ai numeri di telefono, al budget e alle specifiche del prodotto —
> e in un caso «30 Luglio 08/12», dove 08/12 è la fascia oraria, non l'8 dicembre.
> Tagliarne fuori "il messaggio" in automatico vuol dire, prima o poi, stampare un
> numero di telefono su un cartoncino o perdere metà della dedica. Chi taglia è una
> persona che ha letto: l'app mette il testo davanti e lo copia tutto.

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

**Cliccando una riga si apre il dettaglio dell'ordine** — prodotti con le foto,
biglietto, destinatario, recapiti e le azioni. Vale anche per le righe
dell'**Archivio storico**, cioè per gli ordini più vecchi dei 60 giorni che
teniamo in casa: quelli si aprono in **sola lettura** (lo dice la testata del
pannello), perché non c'è una riga nostra da aggiornare — niente stato di
lavorazione né messaggi collegati. Se invece quell'ordine ce l'abbiamo anche in
casa, si apre per intero: lo stesso ordine non cambia faccia a seconda della
tabella da cui lo si apre.

**Le intestazioni della tabella ordinano**: negozio, data, consegna, cliente,
tipo cliente, telefono, totale, lavorazione. Primo clic il verso utile (i più
recenti, i totali più alti, la consegna più vicina), secondo lo rovescia, terzo
si torna all'ordine per **urgenza**, che è quello di lavoro. Ordina il server, su
tutti gli ordini del filtro e non solo sui 200 mostrati; **le righe senza il dato
— 40 senza nome, 160 senza telefono — stanno in fondo in tutt'e due i versi**.
Il **numero d'ordine non si ordina** di proposito: è testo, e i tre negozi
numerano con lunghezze diverse (`#12121` verrebbe prima di `#1623`). Per l'ordine
cronologico c'è *Data*.

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

## Turni: chi lavora, e quando

`/turni`, **primo gruppo del menu** e **solo per amministratori** — un operatore
quel gruppo non lo vede proprio: una voce che risponde «serve un amministratore»
sembra un guasto, non una regola.

È fatta come gli **orari di apertura**: si sceglie una persona e si aprono o si
chiudono i suoi sette giorni. E si guarda in due modi — **Sempre** (la regola che
si ripete) oppure **una settimana precisa**.

**Adesso**, in cima, dice chi è in turno in questo momento e fino a che ora, e chi
entra dopo.

**Gli orari di…** — una pastiglia per persona, col numero di giorni già impostati
(«· 4g»): si vede a colpo d'occhio chi non ha ancora un orario.

**Sempre, oppure una settimana.** Sotto le persone c'è la riga che decide *cosa*
stai cambiando:

- **Sempre** — la regola che vale tutte le settimane. È quella che si imposta una
  volta e non si tocca più.
- **‹ 24 – 30 ago ›** — quella settimana lì, e solo quella. Le frecce vanno avanti
  e indietro, «Questa settimana» riporta a oggi.

Dentro una settimana, i sette giorni portano anche la **data**, e mostrano quello
che vale davvero quel giorno. Appena ne cambi uno, quel giorno si **stacca** dalla
regola: compare l'etichetta **«solo questa settimana»**, un campo per il **motivo**
(ferie, visita) e un **«Torna al solito»** che lo riattacca. ⚠️ La regola non si
tocca mai: è tutto il punto — così un permesso non ti costringe a riscrivere la
settimana e poi a rimetterla a posto.

**Prossimi cambi**, in fondo, elenca i giorni staccati dalla regola di *tutti*, da
oggi in avanti: si clicca e si apre la loro settimana, senza andarli a cercare
avanti e indietro.

Le sette righe, in tutti e due i modi:

- **Aperto / Chiuso** è un bottone solo. Aprire un giorno mette l'orario di sempre
  (9–18) e lo si corregge scrivendoci sopra; chiuderlo toglie tutte le fasce di
  quel giorno. È quello che fa Google, e nessuno lo trova sorprendente.
- Le ore si scrivono **dov'è scritto l'orario**, e si salvano quando si esce dal
  campo. Nessun modulo da compilare a parte.
- **+ Aggiungi orario** dà una seconda fascia allo stesso giorno, per chi stacca a
  pranzo. La × per toglierla compare solo quando ce n'è più di una: l'ultima si
  toglie chiudendo il giorno.

⚠️ **Il giorno staccato vince sempre sulla regola.** Se un giorno ha un orario suo,
vale quello; se è chiuso, quel giorno non lavora, anche se la regola dice di sì.

⚠️ **Le settimane passate si possono guardare** (le frecce vanno anche indietro), e
quello che ci si vede è quello che è stato davvero: la pagina chiede al server i
cambi a partire dal lunedì che stai guardando. Senza, una settimana di due mesi fa
tornerebbe vuota — cioè direbbe «era una settimana normale» invece di «non te
l'ho caricata».

⚠️ **Le ore e i giorni sono scritti come li dice la gente**, non come istanti:
`09:00` è un orario da parete, `2026-08-25` un giorno di calendario. Se fossero
date vere, a fine ottobre — finita l'ora legale — tutti i turni si sposterebbero di
un'ora da soli. Per la stessa ragione «Adesso» si calcola con l'orologio di chi
guarda: sul server sarebbe UTC, e alle 09:30 italiane direbbe che non è entrato
ancora nessuno.

⚠️ **Un turno finisce al più tardi alle 23:59**, e non esistono turni che scavalcano
la mezzanotte: vanno spezzati in due. Le `24:00` erano ammesse e sono state tolte —
il campo orario del browser arriva alle 23:59, e un turno che finiva alle 24:00
tornava a schermo **con la casella di fine vuota**: dato giusto nel database, pagina
che sembra rotta.

### Quello che i turni NON fanno

Si scrivono qui e basta: **non assegnano ordini, non smistano conversazioni e non
impediscono a nessuno di lavorare fuori orario**. Servono a sapere chi c'è — e a
poterlo dire a un cliente che chiede quando richiamare. Se un domani devono contare
davvero (dare le chat nuove a chi è di turno, per esempio), è una cosa da decidere e
costruire, non da far succedere di lato.

Le regole si ricontrollano senza aprire la pagina: `npx tsx scripts/prova-turni.mts`.

## Operatori: quanto lavoro ha fatto ciascuno

`/operatori`, in **Qualità**. Le altre voci di quel gruppo misurano chi consegna —
valet e partner; questa misura **noi**. La vede **solo un amministratore**: qui si
confrontano fra loro le persone che lavorano insieme, e un operatore che vede quanti
messaggi ha scritto il collega non ha in mano uno strumento di lavoro, ha una classifica.

Una riga per persona, e sette colonne:

| Colonna | Che cosa conta |
|---|---|
| **Ordini presi** | ordini di cui si è preso carico (il bollino col suo nome sulla bacheca) |
| **Ordini chiusi** | ordini portati a «Gestito», cioè tolti dalla lista di lavoro |
| **Chat prese** | conversazioni di cui si è preso carico in Inbox |
| **Chat risposte** | conversazioni **diverse** in cui ha scritto almeno un messaggio |
| **Messaggi inviati** | messaggi partiti col suo nome, su tutti i canali |
| **Link di pagamento** | ordini creati da «Nuovo ordine» col link da mandare al cliente |
| **Ordini creati** | tutti gli ordini fatti al telefono: col link o già pagati |

**Chat prese** e **Chat risposte** non sono la stessa cosa, ed è voluto: prendere in
carico è un clic, rispondere è il lavoro. Chi risponde senza prendere in carico compare
lo stesso — la seconda colonna lo vede, la prima no.

**Il periodo** si sceglie in cima: *Oggi · Ieri · 7 giorni · Questo mese · 30 giorni ·
Trimestre · Anno · Date a scelta*. Mese, trimestre e anno sono di **calendario** (dal
primo del mese, del trimestre, dell'anno); 7 e 30 giorni sono **mobili**, a ritroso da
adesso — il mese è quello che si chiude in contabilità, i 30 giorni sono quanto si è
lavorato ultimamente. *Ieri* è il giorno **intero** di ieri, non le ultime 24 ore. Con
*Date a scelta* l'ultimo giorno è **compreso**.

Sotto i pulsanti c'è sempre scritto **l'intervallo per esteso** («Dal 15 ago a adesso»):
«trimestre» non vuol dire la stessa cosa per tutti, e un numero senza il suo periodo
davanti si finisce per confrontarlo con quello sbagliato.

### Quello che questa pagina NON dice

⚠️ **Si contano solo i gesti che lasciano un nome nel database.** Leggere una chat,
cercare un ordine, calmare un cliente al telefono non lasciano traccia e non sono qui
dentro. È una misura del lavoro che si può contare, **non di quanto vale una persona**:
va letta sapendolo, altrimenti premia chi fa molti gesti piccoli.

⚠️ **«Ordini chiusi» vale l'ultimo cambio di stato, non la storia.** L'ordine si porta
dietro un solo nome e una sola data (`gestioneDaId`, `gestioneIl`): se qualcuno riapre
un ordine chiuso, quella chiusura non si conta più a nessuno. Non c'è un registro delle
azioni in quest'app, e questa è la conseguenza.

⚠️ **Le risposte automatiche non contano a nessuno.** La risposta di primo contatto
nasce senza operatore, apposta: non gonfia i numeri di chi era di turno.

⚠️ **Ogni colonna dice da quando si misura**, nel riquadro in fondo. Serve a leggere gli
zeri: «zero link di pagamento nel trimestre» non vuol dire che nessuno ne ha mandati,
vuol dire che prima del **21/08/2026** non li scrivevamo — il nome di chi crea un ordine
vive solo nella sessione, Shopify non lo sa, e quel dato **non è recuperabile**
all'indietro. Le altre colonne partono da fine luglio 2026, quando sono nate le firme
che contano.

⚠️ **Chi non lavora più con noi resta in tabella**, con scritto «non ha più un accesso»:
far sparire i suoi numeri cambierebbe i totali del passato.

I conti si possono ricontare senza aprire la pagina: `npx tsx scripts/prova-operatori.mts`
stampa tutti i periodi e verifica che un intervallo «da sempre» dia gli stessi totali di
un conteggio senza filtri.

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

**Chi se ne occupa.** Ogni conversazione può essere **presa in carico**: bottone «Me ne
occupo io» nella testata, bollino sulla riga dell'elenco (oro se è di un collega, grigio
se è tua) e linguette **Tutte / Mie / Libere**. Rispondere prende in carico da solo,
**se la conversazione è libera**. Si libera solo la propria.

⚠️ **Non è un lucchetto**: segnala, non blocca. Chi apre una conversazione presa da un
collega vede un avviso sopra il riquadro di risposta e può rispondere lo stesso — in un
servizio clienti un blocco vero si ritorce sul cliente, perché chi l'ha presa può essere
a pranzo mentre il cliente aspetta. Se due persone la prendono nello stesso momento la
seconda riceve un avviso, non un sorpasso silenzioso.

⚠️ «**Libere**» è la linguetta che conta più di «Mie»: è dove stanno i clienti che
rischiano di non ricevere risposta da **nessuno**, che è il guaio opposto alle risposte
doppie.

**Il dettaglio di un ordine** ha «**Apri in Shopify ↗**»: porta alla scheda vera, dove si
fanno le cose che qui non si fanno (rimborsi, modifica delle righe, rispedizione della
conferma). Il collegamento nasce dal **gid** e dal dominio del negozio di quell'ordine —
mai dal numero: `#1733` esiste su più negozi. Se non si può costruire, il bottone non
compare.

**«NUOVO»** marca gli ordini entrati da noi nelle ultime **12 ore**; quelli comparsi
mentre stai guardando la pagina hanno la stessa etichetta con una spiegazione diversa.
⚠️ Conta quando l'ordine è comparso **da noi**, non la data dell'ordine: al primo scarico
di un negozio nuovo entrano insieme due mesi di ordini, e per noi sono tutti nuovi davvero.

**La schermata «Oggi» (`/`).** Chi aspetta una risposta, gli ordini da lavorare, i reclami
aperti, i promemoria. **Ogni riga è un collegamento all'elemento**, non all'elenco:
`/inbox?c=<id>` apre quella conversazione, `/ordini?apri=<id>` quell'ordine col pannello
già aperto, `/reclami?apri=<id>` quel reclamo con la riga evidenziata. Il bersaglio è
**tutta la riga**, non il solo nome. ⚠️ Se un reclamo è stato chiuso nel frattempo la
pagina allarga il filtro da «aperti» a «tutti»: non deve mai capitare di arrivare su un
elenco in cui la cosa promessa non c'è. Le tessere dei numeri in cima portano invece
all'elenco intero, perché lì l'«elemento» è un conteggio.

**Allegati.** Su WhatsApp funzionano nei due versi. Su **Instagram e Messenger si
ricevono** (dal 17/08/2026): Meta non manda un id da richiedere dopo, manda un indirizzo
già firmato, e quello si salva in `Messaggio.mediaUrl`. ⚠️ Quell'indirizzo **scade**, e
non ne teniamo copia: passata la finestra la foto non c'è più, e `/api/media/[id]` lo dice
invece di mostrare un'immagine rotta. Le foto arrivate **prima del 17/08 sono perse** — si
vedono solo nell'app di Instagram o Messenger, e la chat lo scrive.

**Spam.** Sulle mail in arrivo c'è il bottone col divieto: il mittente entra fra quelli
ignorati (`/caselle`) e la conversazione va in **archivio**. ⚠️ Si salva l'**indirizzo
esatto, mai il dominio**: da uno spam `@gmail.com` si farebbe sparire in silenzio ogni
cliente che scrive da Gmail. Non si cancella niente, e si toglie dalla pagina Caselle.
Solo sulla posta: sugli altri canali quell'elenco non viene nemmeno letto.

**Il link pubblico della chat.** Con la spunta «Il link della chat porta sul sito»,
`/chat/<codice>` rimanda a `https://<dominio>/#chat` e il widget si apre da solo: il
cliente vede il negozio e la **×** *nasconde* la chat lasciando il bottone per riaprirla.
⚠️ Accenderla **solo dove `widget.js` è davvero installato** — altrimenti si atterra su una
vetrina senza chat. Al 17/08/2026: deluxyflowers.com sì, cakedesign.me sì, deluxy.it no.

**Widget.** Snippet da incollare nel sito (mostrato in Impostazioni):
`<script src="https://TUA-APP/widget.js" defer></script>`. Lo script crea il bottone
flottante e apre un iframe su `/widget`; la sessione del visitatore è un token casuale
salvato nel suo browser, la conversazione appare in inbox come canale "Sito".

La conversazione del widget si ritrova **dal token** (canale + `idEsterno`), non dalla
chiave unica a tre campi: `numeroId` porta lo **slug del sito** (`cake`, `flowers`,
`deluxy`), non è vuoto. ⚠️ Cercare con `numeroId: ''` è il difetto che dal 30/07 al
17/08/2026 ha fatto rispondere 404 a ogni invio e ha perso i messaggi di 18 visitatori.

Se un invio viene rifiutato **il widget lo dice**: la bolla sparisce, il testo torna nel
campo e compare «Messaggio non inviato». Non deve mai mostrare come inviato un messaggio
che il server non ha accettato.

Ogni chiamata a `/api/widget/messaggi` passa **`?sito=<slug>`**, anche quando ha già il
token: senza, il server risponde con titolo e saluto **generali** delle Impostazioni e
l'intestazione del marchio si trasforma in «Deluxy» mentre il visitatore sta scrivendo.
I testi per sito si impostano in **Widget dei siti** (`/aspetto-widget`); quelli generali
restano il ripiego per gli snippet vecchi, incollati senza `data-sito`.

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
