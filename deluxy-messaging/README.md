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

## Chiedere aiuto senza uscire da dove sei

Sul bordo destro di **ogni** pagina c'è la linguetta **Aiuto**. Si apre un pannello
laterale e si scrive la domanda: ci si blocca mentre si sta facendo una cosa, non prima —
se per chiedere bisogna uscire da dove si è, si perde il contesto e con quello la voglia.

⚠️ **Il contesto lo allega il codice, non tu.** Insieme alla domanda parte **la pagina da
cui l'hai fatta**, e il numero d'ordine se l'indirizzo lo dice. «Che faccio?» non si può
rispondere, «che faccio con l'ordine #2783» sì. Il pannello lo scrive a chiare lettere:
allegare in silenzio qualcosa di chi scrive è un modo per farlo scoprire male.

**Chi risponde**: gli amministratori. Loro nel pannello vedono le domande di tutti e
rispondono lì; gli altri vedono le proprie con le risposte.

**Il pallino sulla linguetta** dice due cose diverse: a un amministratore quante domande
aspettano lui, a chi ha chiesto che **gli hanno risposto** — e resta finché non preme «L'ho
letta». ⚠️ Senza, una risposta arrivata mentre eri su un'altra pagina non ti raggiunge mai,
e tu resti bloccato mentre chi ha risposto ti dà per risolto. ⚠️ Se un amministratore
corregge una risposta già letta, il pallino torna: se no resteresti con la versione vecchia.

**Una richiesta è uno scambio, non una domanda sola.** Dopo la prima risposta la
conversazione continua: c'è **«Scrivi»** su ogni richiesta, e lo usano tutti e due — chi ha
chiesto e chi risponde. ⚠️ Era il difetto della prima versione, e si è visto al primo uso
vero: l'amministratore ha risposto «cosa hai bisogno?» e chi aveva chiesto **non poteva
continuare**.

Il filo si legge a colpo d'occhio: le righe di chi ha chiesto sono grigie, quelle di chi
risponde hanno il bordo oro, e sotto ognuna c'è chi l'ha scritta e **se è arrivata da
WhatsApp** — una riga scritta dal telefono, in piedi, non è una riga scritta guardando la
schermata.

Ogni messaggio nuovo di un operatore **riavvisa l'amministratore su WhatsApp** («AIUTO
K37ZP (ancora)»), se no la seconda riga dello scambio resterebbe lì senza che nessuno la
veda. Quando basta, **«Risolto»** chiude la richiesta: resta scritta, spenta, e si riapre
scrivendoci ancora.

**Il bottone «Apri la chat ↗»** su ogni richiesta apre di che cosa parla: la **chat** da
cui è nata, o — se una chat non c'è ma c'è un numero d'ordine — l'**ordine**. Se non c'è né
l'una né l'altro il bottone non compare: un bottone che non fa niente è peggio di un
bottone che non c'è, perché la prima volta si crede a un guasto.

⚠️ Perché la chat si sappia, l'inbox adesso **scrive nell'indirizzo quale conversazione è
aperta** (`?c=…`). Serve a due cose che prima non funzionavano: il link a una
conversazione precisa si può **copiare e mandare a un collega**, e il pannello Aiuto capisce
da solo di quale chat stai parlando.

### La domanda arriva su WhatsApp, e la risposta torna da lì

Appena qualcuno chiede, l'amministratore riceve la domanda **sul telefono**, su WhatsApp
(oggi al **+39 349 885 3209**; si cambia scrivendo la chiave `aiutoWhatsApp` in
Impostazioni, senza un deploy).

⚠️ **Da quale nostro numero esce non è indifferente.** L'avviso parte dalla linea del
marchio **generale**, oggi **+39 02 9475 1144** (Deluxy): è quella che riceve meno clienti,
quindi quella dove un messaggio interno dà meno fastidio — e dove le risposte
dell'amministratore non finiscono in mezzo al traffico di un brand. Si può scegliere un
altro numero scrivendo il suo `phone_number_id` nella chiave `aiutoWaNumeroId`. Il messaggio porta chi ha chiesto, l'ordine, la pagina, la
domanda e un **codice** di cinque lettere.

**Per rispondere ci sono due strade**, e sono scritte dentro il messaggio stesso:

1. **citare l'avviso** con «rispondi a questo messaggio» — è il legame esatto;
2. **scrivere il codice in testa**: «XBW0I la consegna si può fare».

⚠️ **Fuori da questi due casi non si indovina.** La tentazione sarebbe «c'è una sola
domanda aperta, sarà quella» — ma allora un «ok» mandato per altro diventerebbe la risposta
ufficiale a una domanda di lavoro, e nessuno capirebbe da dove è uscita. Un messaggio che
non è riconosciuto come risposta prosegue normalmente e finisce in inbox, perché
l'amministratore a quel numero scrive anche per altro.

La risposta compare nel pannello con scritto **«Amministratore (WhatsApp)»**: chi la legge
ha diritto di sapere che è stata scritta dal telefono e non guardando la schermata. E sul
telefono torna una conferma con il codice.

⚠️⚠️ **La finestra di 24 ore.** WhatsApp lascia mandare un messaggio libero a un numero
**solo se quel numero ci ha scritto nelle ultime 24 ore**. Fuori da lì Meta rifiuta
(errore 131047) e servirebbe un *template* approvato, che si crea a mano nel Business
Manager. Quindi **l'avviso può non partire**, ed è la norma se l'amministratore non scrive
da un po'.
⚠️ Quando non parte, **il pannello lo dice in rosso** a chi ha chiesto, con l'errore di
Meta. Chi crede di aver avvisato qualcuno che invece non sa niente sta peggio di chi sa di
non averlo avvisato. La domanda resta comunque salvata e visibile: la notifica è un di più,
non il canale.
⚠️ Per riaprire il canale basta che l'amministratore **scriva una parola** al numero
aziendale: da lì, e per 24 ore, gli avvisi passano.

### Perché restano scritte

Le domande **non si cancellano dopo la risposta**, ed è il motivo per cui la sezione
esiste. Rilette tutte insieme dicono **che cosa non è chiaro** — cioè cosa manca nel
glossario, nelle risposte pronte o nelle istruzioni dell'AI. Una domanda risposta e buttata
è una lezione persa.

Infatti il **giro notturno del glossario** le legge insieme alle chat, e le tratta come la
prova più forte: ⚠️ se una persona che lavora qui ha dovuto chiedere, quel fatto nel
glossario non c'era. Le proposte che ne nascono citano la domanda, esattamente come le
altre citano la conversazione.

## Il glossario

`/glossario`, nel gruppo **Messaggi** — prima delle Risposte pronte, perché è quello che
si legge *prima* di scrivere. Lo vedono tutti gli operatori.

È fatto di tre parti.

**Da controllare**, in cima. Ogni notte alle 5:40 l'AI rilegge le chat delle ultime 24 ore
e propone: cosa **manca** nel glossario, cosa c'è ma risulta **sbagliato**, e cosa
l'operatore **deve sapere** (una domanda che torna ogni giorno senza risposta pronta).
⚠️ **Propone: non scrive.** Il glossario è quello su cui ci si basa per parlare a un
cliente — un'AI che ci mette dentro un fatto da sola lo metterebbe in bocca a una persona
senza che nessuno l'abbia verificato, e a scoprirlo sarebbe il cliente.
⚠️ **Ogni proposta porta la conversazione da cui nasce**, con un bottone «Vedi la chat».
Senza la prova non è una proposta, è un'opinione: si controlla in dieci secondi invece di
fidarsi. Le proposte che citano una conversazione inesistente **vengono buttate dal codice**
prima di arrivare a schermo, insieme a quelle su un marchio inventato e ai doppioni.
C'è anche «Rileggi le chat adesso», per non aspettare stanotte.

**La passata di recupero.** Un glossario vuoto non si riempie da solo in una notte: c'è
`npx tsx scripts/glossario-storico.mts`, che rilegge **tutte le conversazioni passate** a
lotti di 25 e propone quello che ne esce. Si fa **una volta**; il giro di ogni notte resta
alle ultime 24 ore, perché rileggere seicento conversazioni ogni mattina costerebbe e
direbbe ogni volta le stesse cose.
⚠️ Si ferma a **40 proposte aperte**: oltre non le rilegge nessuno, e un elenco che non si
smaltisce è come non averlo. Quando le hai smaltite, si rilancia e riprende da dove era.
⚠️ Guarda solo le conversazioni in cui il cliente ha scritto qualcosa di **sostanza** (oltre
60 caratteri): fra 590 ce ne sono centinaia fatte di «ciao», newsletter e risponditori
automatici — costano e producono rumore.

**Le voci**: il glossario vero. Ogni voce ha un **termine** (come lo cercherebbe una
persona), il **fatto** scritto come lo diresti a un collega nuovo, il **marchio** a cui vale
(o *tutti*), e chi lo può leggere: **«si può dire al cliente»** oppure **«interno»**.
⚠️ Quest'ultima etichetta è rossa apposta: è l'unica che dice *non leggerlo a un cliente*.

**Come siamo fatti**, in fondo: domini Shopify, numeri WhatsApp, account Instagram, caselle
email, siti col widget, quota del fornitore.
⚠️ **Questa parte non si scrive a mano**: è letta dalla configurazione ogni volta che apri
la pagina, quindi è vera per definizione. Copiarla in una voce vorrebbe dire che il giorno
in cui qualcuno collega un numero nuovo il glossario **mente** — ed è il modo più veloce per
far smettere la gente di fidarsene. Se qualcosa lì è sbagliato, si corregge dove sta
davvero.

### Che cosa NON va nel glossario

Qui vanno i **fatti**. Un testo da mandare è una **Risposta pronta**; una regola di tono per
l'AI è un'istruzione di **CS AI**; un file da cui l'AI impara è un **documento** di CS AI.
Se le quattro cose si mescolano, in sei mesi ci sono quattro posti dove cercare la stessa
cosa e nessuno è aggiornato.

## Cercare un fornitore: quattro fonti

La casella «Cerca il fornitore» guarda in quattro posti, in quest'ordine di
utilità: **i pagamenti già fatti** (l'unico posto dove c'è l'IBAN), **gli ordini
già affidati**, **il registro Anagrafiche**, e — solo su richiesta — **Google
Maps**.

### Chi è «segnato come fornitore»

⚠️⚠️ **Nel registro non esiste un campo «fornitore».** La marcatura è la
**categoria**, e sono più parole per la stessa cosa: contate sul registro vero il
24/08/2026, FIORISTA 144 **e** FIORI 5, PASTICCERIA 98 **e** CIOCCOLATERIA 5.
Guardarne una sola perde un pezzo di elenco senza che si veda che manca.

La categoria ora si vede sulla riga — **verde** se è un mestiere da cui
compriamo, grigia se no — e chi è segnato così va davanti a parità di nome. Serve
a distinguere un fioraio da una boutique cliente, che in un elenco si somigliano
molto.

⚠️⚠️ **Ma non si filtra**: **340 partner su 1048 sono «DA CLASSIFICARE»**.
Filtrando sui soli fornitori, un terzo del registro sparirebbe dalla ricerca —
compreso, un giorno su tre, proprio quello che si sta cercando. Si **marca e si
ordina**: nessuno nascosto.

### Google Maps, per chi non è ancora dei nostri

Un bottone sotto ai risultati di casa, con accanto la zona in cui cercare.

⚠️⚠️ **Si paga a chiamata**, per questo è un bottone e non parte mentre si
scrive: un autocompletamento su Maps a ogni tasto sarebbero centinaia di ricerche
al giorno per riempire un campo che nove volte su dieci si riempie con quello che
sappiamo già.

⚠️ **Il telefono si chiede solo per quello che si sceglie.** La ricerca di testo
non lo restituisce: servirebbe una chiamata di dettaglio *per ogni risultato* —
venti a pagamento per usarne una.

⚠️⚠️ **I risultati di Maps stanno in fondo e sono marcati.** Non li conosciamo:
non sappiamo se rispondono, se fatturano, se hanno già lavorato per noi. Una riga
uguale alle altre li farebbe scegliere per sbaglio, con la fretta di un ordine da
sistemare. La riga dice «da Google Maps: non ci abbiamo mai lavorato», col voto e
il numero di recensioni, e se risultano **chiusi** lo dice.

### Tre trappole già pagate

⚠️ **«are blocked» è un «API non accesa».** Sono due API diverse — «Places API»
e «Places API (New)» — e la nostra chiave parla la vecchia. Il riconoscitore non
capiva quella frase, quindi non ricadeva sulla strada che funziona: la ricerca
sembrava rotta con la soluzione lì accanto. Corretto anche in `indirizzi.ts`, che
aveva la stessa lacuna.

⚠️ **La città non è «il penultimo pezzo» dell'indirizzo.** L'API vecchia separa
il civico con una virgola e non mette «, Italia» in fondo, la nuova sì: contando
le virgole, `Via Salvatore Trinchese, 7, 73100 Lecce LE` diventava città «7». Si
cerca il **CAP**, che sta sempre attaccato alla città.

⚠️ **La zona conta anche sui nostri.** Cercando «pasticceria» per una consegna a
**Lecce**, in cima uscivano le pasticcerie di Firenze, Roma e Siena: la zona
restringeva solo Maps. Ora alza anche i risultati di casa — ma li **alza**, non
li filtra: un fornitore del paese accanto è quasi sempre buono, e la città scritta
nel registro non è sempre quella del laboratorio.

Prove: `npx tsx scripts/prova-cerca-zona.mts` e
`npx tsx scripts/prova-maps-fornitori.mts`

## Quanto dare al fornitore

Sulla scheda di un ordine, nel riquadro **Chiedi al fornitore**, c'è quanto ci si aspetta di
pagargli: «Al fornitore, indicativamente: **81,00 €** — il 60% di 135,00 €».

⚠️ **È indicativa, e la parola ci sta apposta.** È una percentuale **sola per tutti i
fornitori**: non ci sono regole per fornitore, per marchio o per prodotto. Senza quella
parola passerebbe per un prezzo concordato.

⚠️ **La regola non è di quest'app.** Vive in **Deluxy Orders → Impostazioni**
(`controllo.quotaFornitore`, di norma **60%**), perché è là che si controllano i pagamenti
ai fornitori: si cambia lì e da quel momento vale ovunque. Qui si legge soltanto — scriverne
una copia nel nostro codice vorrebbe dire mostrare il vecchio numero il giorno che la
cambiano, con due schermate che dicono due percentuali diverse.

⚠️ **Se Orders non risponde, la riga non compare.** Meglio una riga in meno che un numero
inventato accanto a dei soldi.

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

## La pagina Pagamenti: non solo bonifici

### Come si paga — quattro modi, non uno

`Bonifico (IBAN)` · `Link di pagamento` · `PayPal` · `Altro (scritto)`.

⚠️⚠️ **Non tutti i fornitori si pagano con un bonifico.** Chi manda un link, chi
dà un indirizzo PayPal, chi si accorda a voce. Finché l'unica forma prevista era
l'IBAN, tutto il resto **non si registrava affatto**: restava in una chat, e su
quell'ordine risultava che non avevamo pagato nessuno.

⚠️ Quello che serve cambia col metodo: un bonifico senza IBAN non è pagabile, un
«altro» senza la frase non dice niente a nessuno. L'unica cosa che serve
**sempre** è il nome di chi va pagato.

⚠️ **Su un metodo che non è un bonifico non c'è niente da verificare**: il codice
di controllo esiste solo per gli IBAN. In tabella si legge «non si verifica», non
un «da controllare» rosso — un allarme su una riga che sta benissimo, ripetuto
tre volte, spegne anche quello vero.

⚠️ Un link diventa cliccabile **solo se è `http` o `https`**: un `javascript:`
o un `data:` incollati per sbaglio (o non per sbaglio) restano testo.

### L'ordine collegato, e il margine

Sotto la causale c'è **Ordine**: si cerca per numero e si collega. ⚠️ Il campo
`ordineNumero` esisteva già in tabella ed era **sempre vuoto** — la pagina non lo
mandava mai. Di una richiesta salvata non si sapeva a quale ordine appartenesse:
restava la causale scritta a mano, che non è un collegamento (non si conta, non
porta al cliente, e non dice quanto valeva l'ordine — da cui: niente margine).

⚠️ **Il numero si legge dalla causale e si cerca da solo, ma si collega da solo
solo se il risultato è UNO.** Lo stesso numero esiste su più negozi («#1733» è
sia di Cake sia di Deluxy): sceglierne uno a caso vorrebbe dire mostrare il
margine calcolato sul valore di un altro ordine.

⚠️⚠️ **Arrivando dal bottone «Paga fornitore», però, non si cerca: si
riconosce.** Il link porta l'**id** dell'ordine e il **negozio**, non solo il
numero — e con l'id non c'è niente da indovinare. Prima portava il numero da
solo, e succedeva questo (segnalato dall'utente il 25/08/2026 su
`/pagamenti?ordine=%232792…`): cercando «2792» tornano **#2792 di FLowers** e
**#12792 di Deluxy**, due risultati, quindi la regola di sopra si fermava e il
campo **restava vuoto** — a chi era partito da quell'ordine sembrava che l'app
avesse dimenticato quello che aveva appena fatto.

Le prove, in quest'ordine: **id** → **numero esatto + negozio** (vale per gli
ordini d'archivio, che un id nostro non ce l'hanno) → **un solo risultato**. Se
nessuna dice sì, il campo resta vuoto **apposta**: meglio farlo scegliere a una
persona che collegare l'ordine sbagliato, che non dà nessun errore e dà un
margine calcolato sul valore di un altro.

⚠️ Lo stesso link lo costruiscono ora **tutti e due** i bottoni «Paga
fornitore», quello dell'elenco e quello della scheda (`linkPagamentoOrdine()`,
una funzione sola): erano due copie diverse, e quella della scheda **perdeva per
strada il fornitore e il costo concordato** — cioè proprio chi va pagato e
quanto, che dalla scheda si ribattevano a mano.

### La riga si lavora: copia, modifica, pagata

⚠️ **Ogni cella si copia toccando il testo.** Il caso vero: un IBAN di ventisette
caratteri va incollato nel portale della banca, e selezionarlo col dito dentro
una tabella che scorre di lato non riesce quasi mai — chi ci prova lo ribatte a
mano. ⚠️ Si prova `navigator.clipboard` e, **se fallisce, si riprova col vecchio
`execCommand`**: il primo rifiuta quando la pagina non ha il fuoco, e arrendersi
al primo no vorrebbe dire dire «selezionalo a mano» su una copia che si poteva
fare.

⚠️ **Modifica** riporta la riga nel modulo — ma solo finché **non è stata mandata
a chi approva**: dopo, quello che c'è qui e quello che hanno loro divergerebbero
in silenzio, e si leggerebbe un importo mentre ne viene pagato un altro.

⚠️ **Pagata** dice che il denaro è **uscito** — un'altra cosa da «inviata a chi
approva». Prima l'app sapeva solo di aver *chiesto* un pagamento: con un
fornitore che richiama per sapere se è stato pagato non c'era niente da guardare.
Si può disfare (capita di spuntare la riga sbagliata), ma **la ricevuta resta**:
è un documento.

### Da dove esce il denaro

⚠️⚠️ **Un bonifico non parte per forza da un'app nostra.** Quasi sempre esce dal
portale della banca, a mano; a volte si paga in contanti alla consegna, o si
scala da quello che quel fornitore ci deve. Segnando «Pagata» si può dire da
dove: *portale della banca · Deluxy Transactions · contanti · compensazione ·
altro*.

⚠️ Si può **lasciare vuoto**: «non indicato» è una risposta, indovinare il canale
di un'uscita di denaro no — manderebbe qualcuno, fra sei mesi, a cercare quel
movimento dove non è mai passato.

⚠️ È lo stesso fatto che nel resto dell'ecosistema si chiama
`pagatoCon: "fuori_app"`. Il canale si legge **sulla riga**, non solo nel
titolo: «pagata» da solo non dice dove andare a cercare.

### Il pop-up che registra il pagamento

Premendo **Pagata** si apre una finestra: ricevuta, da dove esce, conferma.

⚠️ La ricevuta si carica **nel momento in cui si registra**, non prima.
Sceglierla in cima alla pagina e poi ricordarsi di premere la riga giusta è un
passaggio in più che si sbaglia — e quando si sbaglia la ricevuta finisce sul
pagamento di un altro fornitore.

⚠️ Si conferma anche **senza** ricevuta: obbligarla vorrebbe dire che i
pagamenti fatti al telefono, senza un documento in mano, non si registrano
affatto.

⚠️ Si chiude cliccando **fuori**, non dentro: un clic finito male che butta via
il file appena caricato fa ricominciare da capo.

### L'ordine risulta pagato

Segnando pagata, l'ordine **esce da «in pagamento»** e passa ad «attesa
consegna», e sulla scheda in bacheca compare il bollino verde **pagato**.

⚠️ Segnalato dall'utente: un ordine col bonifico già fatto continuava a dire «In
pagamento», cioè lo stato di quando lo si *stava* pagando.

⚠️ **Solo in avanti**, e solo da `in_pagamento`: da uno stato più avanti non si
torna indietro, e da uno più indietro non si salta. E togliendo il segno
«pagata» l'ordine **non** torna indietro — era forse stato spostato a mano da
qualcuno, e disfare un clic non deve cancellare la decisione di una persona.

### ⚠️ «Email» nella riga della tabella non faceva niente (corretto il 25/08/2026)

I bottoni per parlare col cliente (WhatsApp · Chiama · Email) stavano scritti in
**due punti**: la scheda a bacheca e la riga della tabella. Quella della tabella
disegnava **tutti** i canali come link — `<a href={c.url}>` — ma l'**email un
`url` non ce l'ha**: da quando il `mailto:` è stato tolto (apriva il programma di
posta del computer e mandava la mail da un indirizzo personale, fuori dall'app)
il canale email porta una **bozza** che apre il pop-up.

Risultato: nella tabella «Email» era `<a href={undefined}>`, cioè **un bottone
che non faceva assolutamente niente**. ⚠️⚠️ E un link senza indirizzo non dà
nessun segnale — non si illumina, non si raggiunge da tastiera, non scrive un
errore: sembra che l'app abbia ignorato il clic.

Ora i bottoni li disegna **una funzione sola** (`BottoniContatto`), e il tipo del
canale è un'**unione**: `url` e `mail` non esistono finché non si è detto di
quale dei due casi si parla. Lo stesso sbaglio adesso **non compila** — provato
rimettendolo: `error TS2339: Property 'url' does not exist on type
'CanaleContatto'`.

⚠️ Non bastava marcarli facoltativi: `href` accetta `string | undefined`, quindi
`href={c.url}` sarebbe passato lo stesso.

### Quanto lavoro gli abbiamo già dato

Accanto a ogni fornitore — **nella lista di chi è in zona** (dove si sceglie a
chi telefonare) e **nella ricerca del fornitore** (dove si chiede il pagamento) —
c'è una riga sola: `3 ordini · 210 € dati`, oppure **«mai lavorato con lui»**.

⚠️⚠️ Non è una statistica: è la posizione da cui si parla. Fra due fiorai della
stessa provincia non è lo stesso chiamare quello che ha già preparato tre ordini
per noi e quello che non ci ha mai visto — cambia chi risponde, cambia il
prezzo, cambia se ti fa il favore alle sette di sera. Il dato c'era da giorni (il
costo concordato sta sull'ordine) e non lo sommava nessuno.

⚠️ **Un ordine senza costo scritto non vale zero: vale «non lo so»**, e si dice
(`3 ordini · 160 € dati · 1 senza costo`). Sommarlo come zero racconterebbe che
a quel fornitore abbiamo dato meno di quello che gli abbiamo dato — e chi tratta
un prezzo partirebbe da un numero più basso del vero.

⚠️ Si conta **sugli ordini**, non sui pagamenti: l'ordine è il lavoro dato, il
pagamento è la sua conseguenza (e può arrivare giorni dopo, o non arrivare).
L'economia dell'ordine resta di Deluxy Orders: qui non si ricopia niente, si
somma quello che quest'app già possiede — chi prepara e a quanto.

⚠️ Una query aggregata sola per tutta la lista, non una per riga.

### La città del fornitore: è quella che lo fa ritrovare

⚠️⚠️ Senza città un fornitore **non torna più indietro**. La lista dei
«fornitori in zona» filtra per provincia e ricava la sigla da `provincia`
**oppure dalla città**: chi non ha né l'una né l'altra è invisibile. Misurato il
25/08/2026: **15 fornitori nostri in anagrafica, tutti senza città** — gente che
abbiamo già pagato e che al prossimo ordine in quella provincia non verrebbe
proposta a nessuno.

Da oggi, pagando un fornitore, al registro va anche la **sua** città (e la
provincia, se dalla città si ricava una sigla certa: «Firenze» → FI sì, un
comune che non è capoluogo no).

⚠️⚠️ È la città **del fornitore**, presa dall'ordine dove l'ha scritta una
persona o dove è arrivata dal registro: **non** la città di consegna. Si consegna
a Milano un mazzo preparato a Sesto, e dedurla scriverebbe un dato inventato nel
golden record di tutte le app.

### Il fornitore pagato entra nel registro Anagrafiche

Premendo «Pagata», oltre alla riconciliazione e all'avviso, quel fornitore viene
**segnalato al registro Anagrafiche** (`statoFornitore: abituale`, più telefono
ed email se l'ordine li ha, e l'**IBAN solo se il checksum torna**). Qui non
resta nessuna copia dell'anagrafica: il registro è il proprietario, noi gli
diciamo quello che abbiamo osservato.

⚠️ Prima di scrivere si chiede **chi è** (`GET /partners/match`), perché il POST
aggancia per nome+città esatti e la città del fornitore non la sappiamo (quella
dell'ordine è la città di **consegna**: dedurla scriverebbe un dato inventato).

⚠️⚠️ **E la risposta del registro non si prende sulla parola.** Il 25/08/2026 il
match ha risposto «agganciata» mandandoci su **«Contatti senza azienda
(HubSpot)»** — un contenitore con 288 contatti dentro, in cui le parole di
«Paradis des fleurs» comparivano sparse — e quel record si è preso un
«fornitore abituale» che non gli appartiene, mentre il fioraio vero è rimasto
fuori dall'anagrafica. Ora si confronta **come si chiama** il record agganciato
(`src/lib/aggancio-fornitore.ts`): se non è lo stesso nome **non si scrive**, e
la richiesta resta nella pagina Match del registro, dove sceglie una persona.

⚠️ Vale per il caso vero in tutti e due i versi: «Ketty Flowers» **si aggancia**
a «Ketty Flowers · PORTO CERVO» (è la ragione per cui il match esiste), ma
«Battistella fioreria srl» e «Fioreria Battistella» **no** — stesse parole in
ordine diverso è una somiglianza, non un'identità, e a unirle è una persona.

⚠️ Best-effort: se il registro non risponde, il pagamento si salva lo stesso e
l'esito torna a schermo. Un contorno non fa fallire la cosa che conta.

### Avvisare chi abbiamo pagato — da solo

Sulle righe pagate c'è **Avvisa**: copia un messaggio pronto per il fornitore.

⚠️ **Parte da solo** premendo «Pagata» — chiesto esplicitamente. Ma parte solo
perché **una persona ha premuto**: è la differenza fra «automatico» e «da solo».

⚠️⚠️ **E non sempre riesce.** La ragione più frequente non è un guasto: su
WhatsApp si può scrivere in testo libero solo entro **24 ore** dall'ultimo
messaggio di quella persona (Meta, errore 131047). Un fornitore che non ci scrive
da ieri non è raggiungibile. Per questo l'esito si **scrive** e si mostra sulla
riga: «avvisato» oppure «non avvisato» col motivo. Un avviso automatico di cui non
si vede l'esito è peggio di nessun avviso — si crede che il fornitore sappia, e
quello richiama lo stesso tre giorni dopo.

⚠️ Il recapito si prende dall'**ordine** (`fornitoreTelefono`/`fornitoreEmail`),
non dalla richiesta: lì c'è l'intestatario del conto, che è una ragione sociale,
non un contatto. Senza recapito si dice **dove metterlo**, invece di un generico
«non riuscito».

⚠️ Il vecchio bottone «Avvisa» resta, per rimandarlo a mano.

⚠️ Dice «abbiamo **disposto** il pagamento», non «è arrivato»: fra i due ci sono
due o tre giorni lavorativi in cui il fornitore non lo vede e richiama pensando a
un errore.

### «In pagamento», da solo

Salvando una richiesta legata a un ordine, quell'ordine passa a **in pagamento**:
chiedere il pagamento *è* quel passo, e spuntarlo a mano dopo vuol dire che metà
degli ordini resta indietro di uno stato.

⚠️ **Solo se l'ordine è ancora indietro** (da gestire, ricerca fornitore,
comunicazione). Su uno già «attesa consegna» o «gestito» sarebbe tornare indietro
nel tempo: una richiesta si può salvare anche dopo aver pagato.

⚠️ Un errore qui non fa fallire il salvataggio: la richiesta è la cosa che conta,
lo stato è un contorno.

### Il margine, anche in tabella

Colonna **Margine** su ogni riga salvata: nel modulo si vede solo quello che si
sta scrivendo, in tabella si vede lo storico — ed è lì che ci si accorge che a un
fornitore diamo sistematicamente troppo.

⚠️ Se il numero d'ordine appartiene a **più ordini** (negozi diversi) non si
mostra nessuna percentuale ma «più ordini»: un margine sbagliato è peggio di
nessun margine.

### La ricevuta

Si sceglie una volta, sopra la tabella, poi si preme «Pagata» sulla riga giusta.
Si accettano **immagini e PDF**: la prova di un bonifico è quasi sempre un PDF
della banca, e accettare solo le foto vorrebbe dire chiedere a qualcuno di
fotografare uno schermo.

⚠️ Tetto **1,5 MB**: il corpo di una funzione serverless arriva a ~4,5 MB, e un
file più grande non ci arriva nemmeno — muore prima con un errore che non spiega
niente.

⚠️⚠️ **I byte della ricevuta NON escono nell'elenco** (`select` esplicito nella
GET): senza, ogni caricamento della pagina si porterebbe dietro le ricevute di
tutte le righe — duecento file — per mostrare una tabella che di quel file usa
solo il nome.

⚠️ **La ricevuta sta nel database** perché quest'app non ha uno storage (gli
allegati delle chat passano da Meta e non restano). Per qualche centinaio di
ricevute va bene; se diventano migliaia va spostata altrove.

⚠️ **Un PDF nella lettura AI non si legge**, e lo si dice invece di lasciarlo
caricare e fallire: il modello legge immagini, non documenti. Un file scelto e
ignorato in silenzio è il modo migliore per far credere che l'AI abbia «letto
male».

Prova: `npx tsx scripts/prova-pagamenti.mts`

### Si incolla, non si carica

**Ctrl+V** (o ⌘V) attacca quello che c'è negli appunti. La prova di un bonifico
nasce come una schermata: chiedere un *file* vuol dire chiedere di salvarla,
ritrovarla fra i download e sceglierla — tre passaggi, e alla terza volta non si
allega più niente.

⚠️ Si ascolta su **tutta la pagina**, non su un campo: una schermata negli
appunti non ha un posto dove «cliccare prima di incollare».

⚠️ Interviene **solo se negli appunti c'è davvero un file** di un tipo accettato.
Se c'è del testo si sta incollando un IBAN in un campo, e rubare quel Ctrl+V
romperebbe il lavoro normale della pagina.

⚠️ **Dove finisce dipende da cosa stai facendo** — col pop-up «Pagata» aperto è
una ricevuta, altrimenti è l'immagine da far leggere all'AI; un PDF è sempre una
ricevuta perché l'AI non lo legge. Lo si **dice a schermo e si può spostare**: un
allegato che atterra dove non te lo aspetti, in silenzio, si scopre dopo aver
salvato.

## La Riconciliazione

⚠️⚠️ **Pagando da questa app non serve venire qui**: premendo «Pagata» su una
richiesta collegata a un ordine, l’ordine impara **da solo** chi l’ha preparato
e quanto è costato, e il costo parte verso Deluxy Orders. In questa pagina
restano le **eccezioni**: i pagamenti vecchi, quelli fatti altrove, e quelli su
cui il codice non decide da sé.

⚠️⚠️ La scrittura sta in **una funzione sola** (`riconciliaDaPagamento`), usata
sia dal percorso automatico sia dal bottone di questa pagina. Non è un dettaglio
di stile: se le due strade avessero due copie della stessa logica, il giorno che
si corregge un controllo se ne correggerebbe una sola — e il buco resterebbe
aperto proprio su quella automatica, che è la strada che nessuno guarda.

⚠️ **Automatico non vuol dire senza controlli.** I tre rifiuti qui sotto valgono
identici sulle due strade; anzi in automatico contano di più, perché a mano c’è
una persona che legge la frase e si accorge.

⚠️ **I recapiti non arrivano dal pagamento**: una richiesta ha un IBAN, non un
telefono. L’avviso al fornitore legge telefono ed email **dall’ordine**, quindi
resterà «non avvisato» finché non li scrive qualcuno. Inventarli sarebbe peggio,
ma va detto, o si crede che la catena sia completa.

`/riconciliazione` — i pagamenti già fatti dicono **chi ha preparato** un ordine
e **quanto è costato**. Qui quel fatto si porta sull'ordine, dove serve.

⚠️⚠️ Da dove nasce, misurato il 24/08/2026: **8 pagamenti fatti** (nome, IBAN,
importo, ordine collegato) e **ZERO ordini con un fornitore registrato, su
1.341**. Il dato non mancava: stava in un altra tabella. Senza, il costo non
arrivava a Orders e il margine risultava «non calcolabile» dove era
calcolabilissimo. **Recuperati tutti e 8 lo stesso giorno: 490 € di margine che
Orders adesso calcola.** Perche non si riformi, il caso normale e ora
automatico (vedi sopra); qui restano le eccezioni.

⚠️ Sulle eccezioni la pagina **propone e una persona conferma**, una riga per
volta. Un «sistema tutto» che scrive ottanta costi di fornitura senza che
nessuno li abbia letti sposta soltanto il problema: da «non sappiamo niente» a
«sappiamo cose che nessuno ha verificato», che è peggio perché sembra vero.

### I tre controlli, e l'errore da cui nascono

⚠️⚠️ **Il rimborso.** Non tutti i soldi che escono vanno a un fornitore: un
rimborso al cliente esce dalla stessa pagina e finisce nella stessa tabella.
Registrarlo come costo di fornitura direbbe che il cliente si è preparato
l'ordine da solo, e sottrarrebbe quella cifra dal margine — falso, e per sempre,
senza che nessuno lo veda. Servono **tutte** le parole del nome del cliente, non
una: con «basta una parola» un pagamento a «Fioreria Rossi» su un ordine di
«Marta Rossi» diventava un sospetto rimborso, e non si registrava più niente.

⚠️⚠️ **Chi è nel registro.** Cercare e affermare non sono la stessa cosa. La
regola della casella di ricerca («basta una parola») è giusta per proporre —
sceglie una persona — e sbagliata per affermare. Usandola qui usciva
`Battistella fioreria srl → BEYOND 142 SRL` (combaciava «SRL») e
`Goshà flowers → ANTOFLOWERS…`. Ora contano solo le **parole distintive**, tolte
forme societarie e mestieri, e ne servono due — o una sola se identifica anche
l'altro nome. Qualche abbinamento vero si perde: è lo sbaglio giusto, «non
trovato» manda a controllare, un nome falso scritto come fatto no.

⚠️⚠️ **Il registro troncato.** Chiedendo l'elenco intero ne arrivavano **200
schede su 1048**, e un censimento troncato letto come completo trasforma «non
l'ho ricevuto» in «non c'è» — cioè manda a creare il doppione di un fornitore
che abbiamo già. Ora si cerca per nome, una richiesta per riga, e il tetto è
scritto a schermo.

Non si sovrascrive niente: un fornitore diverso già registrato, o un costo che
non torna, si **segnalano** e decide una persona. Un ordine pagato che risulta
ancora «da iniziare» ha il bottone per allinearsi.

Prova: `npx tsx scripts/prova-riconciliazione.mts`

## Le contestazioni: abbiamo di che rispondere?

Nella pagina Chargeback, aprendo una contestazione, un riquadro dice **che cosa
abbiamo in mano**: chi ha preparato l'ordine e quanto l'abbiamo pagato, la
consegna prevista, chi ha spuntato lo stato e quando, le conversazioni col
cliente.

⚠️⚠️ Prima c'era solo «da rispondere, 12 giorni» e un riquadro di testo vuoto:
per sapere se c'era qualcosa da opporre bisognava cercare ordine, conversazioni e
fornitore uno per uno. È il motivo per cui dieci contestazioni sono state perse
per **2.087,66 €** con le prove mai partite — non per una decisione, ma perché
rispondere cominciava con mezz'ora di ricerche.

⚠️ I punti si copiano nella bozza **con un bottone**, non ci finiscono da soli:
sono fatti presi dai nostri archivi e vanno riletti prima di mandarli a una banca.

⚠️⚠️ **Il verdetto può essere scomodo, ed è scritto per esserlo.** Su «prodotto
mai ricevuto» contro un ordine che non risulta nemmeno lavorato — nessun
fornitore, nessuna conversazione, stato ancora di partenza — dice che non
abbiamo niente, e che se il cliente non ha ricevuto la strada è il **rimborso**,
non la difesa. Una difesa costruita su una consegna che non risulta è una
dichiarazione falsa mandata a una banca, e vale molto più dei cento euro in
ballo.

Prova: `npx tsx scripts/prova-prove-chargeback.mts`

## Correggere una proposta del glossario prima di accettarla

Ogni proposta dell'AI ha tre bottoni: **Accetta**, **Modifica**, **Scarta**.
«Modifica» apre termine, testo e categoria lì nella riga; poi **Accetta così**.

⚠️⚠️ **Prima si poteva solo prendere o lasciare.** Con una proposta giusta
all'80% — il fatto è quello, la frase no — l'unica strada era **scartarla** e
riscrivere la voce da capo: si buttava via anche la parte buona e la **prova**,
cioè la conversazione da cui nasce. Nella pratica quelle proposte restavano lì.

⚠️⚠️ **La proposta originale resta archiviata.** `termine` e `definizione` della
proposta non si toccano: quello che si è deciso di scrivere va accanto
(`termineAccettato`, `definizioneAccettata`, `corretta`). Sovrascriverle avrebbe
cancellato la prova di che cosa aveva detto l'AI — e serve all'unica domanda che
conta: **quanto spesso ci prende?** Un archivio che dice «proposta dall'AI e
accettata» anche su una frase riscritta da capo racconta un'AI più precisa di
quella che è, e nessuno saprebbe che il prompt va cambiato.

⚠️ Per lo stesso motivo la voce nata da una proposta corretta si dichiara
**«proposta dall'AI e corretta a mano»** (`fonte: 'ai-corretta'`), non
«proposta dall'AI».

⚠️ **Niente «Modifica» sugli avvisi**: un avviso è una cosa da sapere, non una
voce — non c'è un testo da correggere, e un bottone che lo promette manda a
cercare un modulo che non serve.

Prova: `npx tsx scripts/prova-proposta-corretta.mts`

## Quanto ci resta, mentre scrivi l'importo

Sotto il campo **Importo**, appena c'è una cifra, la pagina Pagamenti dice quanto
di quell'ordine se ne va e quanto resta:

> Al fornitore va il **43,3%** dei 300,00 € dell'ordine. A noi resta **170,00 €**,
> cioè il **56,7%**. ✓ In linea: al fornitore è previsto fino al 60%.

⚠️ **Il conto si faceva a mente, o non si faceva.** Chi compila una richiesta ha
davanti due numeri — quanto ha incassato l'ordine e quanto ha promesso al
fornitore — e la differenza fra i due è tutto il guadagno di quell'ordine. Non
mostrarla vuol dire scoprire una cifra sbagliata a fine mese, quando non si può
più discutere.

Quattro risposte, e sono quattro apposta:

- **✓ In linea** (verde) — la quota al fornitore sta dentro quella prevista;
- **⚠️ Sopra la quota** (oro) — dice **di quanti euro**, e aggiunge «puoi mandarla
  lo stesso, ma sappilo»: è un avviso, non un divieto;
- **⚠️ Perdita** (rosso) — l'ordine ci costa **più** di quanto è stato venduto.
  ⚠️ È un caso a sé, non un «sopra la quota» più grande: va detto con un'altra
  parola perché si legga come un'altra cosa;
- **nessun verdetto** (grigio) — i numeri ci sono, il giudizio no.

⚠️⚠️ **La regola non sta qui.** Quanto è previsto che vada al fornitore lo sa
**Deluxy Orders** (`controllo.quotaFornitore`, oggi il 60%) e si chiede a lui
ogni volta. Un 60% ricopiato nel nostro codice resterebbe al vecchio valore il
giorno che lo cambiano là, e nessuna delle due schermate darebbe errore — direbbero
solo due numeri diversi sulla stessa cosa. **Se Orders non risponde non si dà
nessun verdetto**: si mostrano i numeri e si dice perché manca il giudizio. Un «va
bene» calcolato su una regola inventata sarebbe peggio del silenzio.

⚠️ Senza sapere quanto vale l'ordine **non si calcola niente** e lo si dice: una
percentuale su un valore sconosciuto sarebbe un numero inventato che sembra un
dato, accanto a una cifra che sta per partire verso una banca.

⚠️ La **perdita si vede anche senza la regola**: non serve sapere la quota per
accorgersi che stiamo pagando più di quanto abbiamo incassato.

Prova: `npx tsx scripts/prova-margine.mts`

## Cercare un fornitore: magari i dati ce li abbiamo già

In cima al modulo **Coordinate** della pagina Pagamenti c'è **«Cerca il
fornitore»**. Arrivando dal bottone «Paga» di un ordine la ricerca **parte da
sola** col nome di chi lo ha preparato. Un clic sul risultato compila
intestatario e IBAN.

⚠️⚠️ **Non è una comodità.** Un IBAN sono ventisette caratteri copiati da una
chat o da una foto: ribatterli ogni volta è il modo classico di sbagliarne uno —
e il bonifico parte lo stesso, verso un conto che non esiste o, peggio, che
esiste.

**Tre fonti**, in ordine di quanto risparmiano a chi sta compilando:

1. **le richieste di pagamento già fatte** — qui c'è l'**IBAN**, l'unica cosa che
   non si ricava da nessun'altra parte;
2. **gli ordini che gli abbiamo già dato** — città, telefono, e **quanto gli
   abbiamo pattuito l'ultima volta**;
3. **il registro Anagrafiche** — la **ragione sociale**, che è quella che va sul
   bonifico, più città e recapiti.

⚠️ **Il registro non ha gli IBAN**: quelli li conosciamo solo perché li abbiamo
usati. Per questo la prima fonte è la nostra tabella.

⚠️⚠️ **Con più IBAN diversi per lo stesso nome non se ne propone nessuno**, e lo
si scrive in rosso. Due IBAN vogliono dire che è cambiato qualcosa — un conto
nuovo, un'altra società, un omonimo — e indovinare vuol dire mandare i soldi a
qualcun altro. Da lì non si torna indietro.

⚠️ **L'intestatario è la ragione sociale** quando c'è, non l'insegna: il bonifico
va a «Rossi S.r.l.», non a «Pasticceria Rossi», e una banca che non riconosce il
nome può rimandarlo indietro giorni dopo.

⚠️ **L'importo non si tocca mai.** È quello dell'ordine da cui si arriva:
sovrascriverlo con l'ultimo pagamento fatto a quella persona vorrebbe dire pagare
la cifra di un altro ordine.

⚠️ **L'IBAN non si mostra mai intero** nell'elenco, solo `IT60…3456`: a chi deve
capire «è lui?» bastano le ultime quattro, e un elenco di IBAN completi a schermo
è una cosa che si finisce per fotografare.

### ⚠️⚠️ Si cerca PAROLA PER PAROLA, non a frase intera

Misurato: cercando **«Pasticceria Rossi» i risultati erano ZERO**, mentre
«pasticceria» da sola ne dava 4 e «rossi» da sola 1. Il motivo è che tutte e tre
le fonti cercavano la stringa **così com'è**, e nessuna insegna si chiama
esattamente «Pasticceria Rossi».

⚠️ **Una casella che non trova mai niente si smette di usare dopo due volte** —
cioè si torna a ribattere gli IBAN a mano, che è il problema da cui si era
partiti. Ora la ricerca spezza la frase in parole (al massimo tre: ognuna è un
giro in più su un'altra app) e interroga ogni fonte parola per parola.

⚠️ **Basta UNA parola per restare in elenco, non tutte** — chi le ha tutte va in
cima. Cercando «capri flor»: prima «Capri Flor» e «Capri Flor di Domenico
Ruggiero» (due parole su due), poi «100% CAPRI» e «Doda Flores» (una).
Il filtro decide **l'ordine**, non chi sopravvive.

⚠️ La ricerca **dice sempre che cosa sta facendo**: «Cerco…», «5 che potrebbero
essere lui», oppure «Nessuno con questo nome fra i nostri ordini, i pagamenti già
fatti e il registro Anagrafiche». Una casella muta sembra rotta.

### ⚠️ Il rumore del registro, tolto

Anagrafiche cerca anche **dentro le note**: misurato, cercando «rossi»
rispondevano **ANTONIO MARRAS, BRIONI e DOLCE & GABBANA**, perché nelle loro note
c'è scritto «p**rossi**ma settimana». In un elenco da cui si sceglie **chi
pagare**, quel rumore fa cliccare il nome sbagliato. I risultati si tengono solo
se il **nome** o la **ragione sociale** contengono davvero le parole cercate —
parola per parola, così «rossi pasticceria» trova «Pasticceria Rossi».

Prova: `npx tsx scripts/prova-cerca-fornitore.mts`

## Il costo del fornitore si comunica a Orders

Registrando chi prepara un ordine, il costo concordato viene **proposto a
Orders** (PATCH, `costoDa: "customer-service"`). Prima quel numero restava solo
qui, e in Orders il margine risultava «non calcolabile» su quasi tutti gli ordini
— misurato il 24/08 su #2780, #2783 e #2785: rispondeva «costo: non lo sa».

⚠️⚠️ **Deviazione dichiarata** rispetto allo Standard §7.4, decisa dall utente e
scritta nello standard: il margine lo calcola questa app (nasce dal costo che
decide questa app) e lo si comunica a Orders. ⚠️ Si manda il **costo**, non il
margine: il margine è `totale − costo` e Orders lo fa già da sé — mandarli tutti
e due vorrebbe dire due numeri per un fatto solo.

⚠️ **Un rifiuto non fa fallire la registrazione**: il fatto («questo ordine lo
prepara Tizio a 80 €») è nostro e vale comunque. L esito si mostra a schermo —
una proposta che rimbalza in silenzio lascerebbe il margine vuoto in Orders senza
che nessuno capisca perché.

⚠️ **Anche il ritiro si comunica**: se il fornitore ha detto di no, un costo
rimasto in Orders continuerebbe a produrre un margine su un ordine che non è
stato dato a nessuno.

⚠️ Serve la **chiave di scrittura** in Orders: quella di quest app nasce in sola
lettura e ogni proposta rimbalzava con 403. Abilitata il 24/08.

## Il calendario dice anche a che punto siamo

Ogni consegna porta il suo **stato di lavorazione** — da iniziare · ricerca
fornitore · in pagamento · attesa consegna · gestito — accanto allo stato che
c era già.

⚠️⚠️ Sono **due cose diverse**: `statoNome` viene dalla pipeline di
Orders/Shopify e dice a che punto è l ordine **per il negozio**; la gestione dice
a che punto siamo **noi**. Su un calendario di consegne la seconda è la domanda
vera — «cosa esce giovedì, e cosa mi manca ancora da fare».

In cima, il conto: «20 da iniziare · 2 in pagamento · 5 gestito». Prima il
calendario diceva **quando** escono gli ordini, non a che punto erano: per sapere
quanti restavano da lavorare bisognava contarli a occhio, riga per riga.

⚠️ Nella griglia del mese non c è spazio per una parola, quindi c è un **puntino**
dello stesso colore della bacheca — così non si impara due volte. Il dettaglio
sta nel titolo, col fornitore e col «pagato».

⚠️ Sulle consegne già avanti senza fornitore compare **«fornitore?»**, come in
bacheca: su una consegna imminente è la cosa che manca più spesso.

## I fornitori in zona: solo chi può fare QUEL prodotto

L'elenco «Fornitori in provincia di …» si restringe al mestiere che serve. Tre
fonti, in ordine di quanto ci si può fidare:

1. **quello scelto col menu** — vince sempre;
2. **il negozio** (Cake → pasticcerie, Flowers → fiorai): è un fatto, non una
   lettura di testo libero;
3. **il prodotto dell'ordine**, quando il negozio non lo dice.

⚠️⚠️ Il terzo esiste perché su **«Deluxy», che vende di tutto**, l'elenco mostrava
**pasticcerie e fiorai insieme** — cioè per metà gente che quell'ordine non lo può
fare, e chi telefona se ne accorge alla terza chiamata sbagliata. Contati: **58
ordini su 200** stanno su un negozio che non dice il mestiere.

⚠️ Il prodotto è testo libero e si legge con prudenza. Se cita **tutte e due** le
cose (una torta *con* un bouquet, che da noi capita) o **nessuna** (champagne, una
confezione regalo), non si filtra: si mostrano tutti. Meglio una lista più lunga
che una lista sbagliata — un elenco accorciato per sbaglio fa sparire il fornitore
giusto, e una lista corta sembra comunque una lista.

⚠️ **Si dice da dove viene il filtro** — «Dal prodotto: fiorai», «Dal negozio:
pasticcerie», «Tutti i mestieri». Un elenco accorciato senza spiegare perché fa
credere che in quella provincia i fornitori non ci siano, e chi lo crede va a
cercarli su Google invece di chiamare quelli che abbiamo.

Misurato su Milano: senza prodotto **30** fornitori (4 categorie), «bouquet di
rose» **9** (solo FIORI/FIORISTA), «torta Vivaldi» **21** (PASTICCERIA/
CIOCCOLATERIA), «torta e bouquet» di nuovo **30**.

Prova: `npx tsx scripts/prova-mestiere-prodotto.mts`

## A chi abbiamo dato l'ordine da preparare

Nella scheda di un ordine, in cima, il riquadro **«Chi prepara quest'ordine»**:
nome, città, **quanto gli diamo**, telefono, mail, nota. Si registra in due modi:

- dalla lista dei **fornitori in zona**, col bottone **«Lo fa lui»** sulla riga
  di quello che si è appena chiamato — il modulo si apre già compilato;
- **a mano**, per chi non è nel registro (trovato su Google, o per passaparola).

⚠️⚠️ **Perché serviva**: l'app sapeva **chi si poteva chiamare** (i fornitori in
provincia, chiesti ad Anagrafiche) e sapeva **che era stato pagato un nome su un
IBAN**, ma non «questo ordine l'ha fatto Tizio». Quel fatto viveva nella testa di
chi aveva telefonato: il giorno dopo, davanti a un reclamo, non c'era modo di
sapere a chi chiedere — e alla domanda «quanto lavoro diamo a quel fornitore?»
non si poteva rispondere affatto.

⚠️ **Il costo è quello CONCORDATO**, non la quota indicativa. La quota (il 60%
del venduto) la calcola Deluxy Orders e resta una stima: si **mostra** accanto al
campo come riferimento, ma non lo precompila — precompilare con una stima vuol
dire archiviare stime credendo di archiviare accordi. Vuoto = «da concordare»,
che è diverso da zero.

⚠️ **Si accetta un fornitore fuori dal registro.** Impedirlo avrebbe significato
non registrare metà degli ordini — cioè non registrarne nessuno, perché un
archivio con dei buchi non lo guarda più nessuno. Quando succede, la scheda lo
dice: **«fuori registro»**.

⚠️ **Registrare il fornitore NON cambia lo stato di lavorazione.** Vuol dire «la
ricerca è finita», non «l'ordine è in consegna»: spostare lo stato da solo
direbbe una cosa che non è ancora successa, e chi guarda la bacheca ci
crederebbe.

⚠️⚠️ **Lo scarico da Orders non lo cancella.** La sync fa un `upsert`
sull'ordine ogni pochi minuti con i soli campi che arrivano da Orders: se un
giorno ci si aggiungessero i nostri, il fornitore sparirebbe **senza che nessuno
tocchi niente**, e sembrerebbe un dato mai inserito. C'è un controllo apposta in
`scripts/prova-fornitore-ordine.mts` che rifà esattamente quell'upsert.

### In bacheca, e nei pagamenti

Sulla scheda in bacheca compare il **nome di chi lo prepara**: «a chi l'abbiamo
dato?» è una domanda che si fa scorrendo, e un dato che vive dentro un pannello
da aprire, nella pratica, non si guarda.

⚠️ Quando manca, la scheda scrive **«fornitore?»** — ma **solo** sugli ordini
*in pagamento* o *in attesa di consegna*. Contati sul database il 24/08/2026: gli
ordini senza fornitore erano 828, di cui **822 già chiusi**. Segnalarli avrebbe
acceso un avviso su quasi ogni riga per una cosa che non si può più fare e che
non si *poteva* fare, visto che il campo nasce oggi. Restano **6**, che sono
lavoro vero.

⚠️⚠️ **Il bottone «Paga» ora paga il fornitore.** La pagina Pagamenti si apre con
il suo nome come intestatario e con **il costo concordato**, non con l'importo
del venduto: mandare quello vorrebbe dire pagare al fornitore il prezzo di
vendita. Se sull'ordine non c'è nessun fornitore, la pagina lo dice a chiare
lettere invece di lasciar credere che l'importo sia giusto.

Prova: `npx tsx scripts/prova-fornitore-ordine.mts`

## Vedere la comunicazione col cliente da un ordine

Il bollino **✉ 2** sulla scheda è un **link**: porta dritto alla conversazione
(`/inbox?c=…`), quella **più recente** fra le collegate. Prima era un'etichetta
ferma, e per leggere quei messaggi bisognava aprire l'ordine e scendere fino al
riquadro in fondo: un'informazione che non porta dove serve è un'informazione a
metà, e nella pratica vuol dire che i messaggi non si leggono.

⚠️ Il clic sul bollino **non deve aprire anche il pannello dell'ordine**
(`stopPropagation`): la scheda intera è cliccabile, e il pannello si vede sopra —
il clic sembrerebbe aver fatto la cosa sbagliata.

⚠️ Senza un id il bollino resta un'etichetta ferma. Un link che non sa dove
andare è peggio di un'etichetta: si clicca, non succede niente, e la volta dopo
non si clicca più nemmeno quello che funziona.

### «Comunicazione con cliente» non vuol dire che ci sia un messaggio

Quello stato lo scrive l'app quando qualcuno preme **WhatsApp, Chiama o Email**
da qui: registra un gesto, non una conversazione. Se avete telefonato, o scritto
dal telefono personale, l'app non può saperlo.

⚠️ Perciò, quando lo stato è «Comunicazione con cliente» e non c'è **nessuna**
conversazione collegata, la scheda lo dice a schermo: **«non registrata»**. Uno
stato che promette qualcosa da leggere e non porta da nessuna parte fa perdere
tempo a cercarlo. (Il consiglio, in quel caso, è scrivere una **Nota**.)

### ⚠️ Il difetto che nascondeva le conversazioni

Il riquadro dei messaggi dentro l'ordine faceva **una query sola**:
`OR: [numero, email, {canale:'whatsapp'}]` con `take: 40`. Ma
`{canale:'whatsapp'}` **non filtra niente** — il telefono in SQL non si può
confrontare per coda — quindi quel ramo pescava **tutte** le chat WhatsApp e le
faceva competere per i 40 posti con quelle vere. Su #1797 la conversazione del
cliente stava alla **posizione 87 su 132**: il riquadro diceva «nessun messaggio»
mentre la chat esisteva.

⚠️ **Il difetto era invisibile da tutte e due le parti**: la bacheca contava 1
messaggio (usa due query separate) e il dettaglio ne mostrava 0, senza che
nessuna delle due desse errore. Si è visto solo **confrontandole una contro
l'altra**: `npx tsx scripts/prova-messaggi-ordine.mts`.

**Misurato: 25 ordini su 45** con messaggi nascondevano la conversazione.
Adesso sono due query — le precise con il tetto, le chat prese tutte e filtrate
in memoria — e il tetto si applica **dopo** aver riconosciuto i legami: tagliare
prima vuol dire tagliare a caso.

## Le azioni di un ordine, in cinque gruppi

Sulla scheda di un ordine i bottoni sono raggruppati per **che cosa fanno**,
nell'ordine in cui si attraversano:

1. **di chi è** — `Assegna a…`, prima di «cosa ci faccio»;
2. **parlare col cliente** — `WhatsApp` · `Chiama` · `Email` · `Rubrica`;
3. **soldi e guai** — `Reclamo` · `Rimborso` · `Paga`;
4. **lasciar detto** — `Nota`;
5. **uscire dall'app** — `Fornitore ↗` · `Shopify ↗`, in fondo a destra.

⚠️ **I tre dei soldi stanno insieme perché si decidono insieme**: «il cliente si
lamenta» porta a «rimborsiamo?» e a «il fornitore l'abbiamo pagato?». Sparsi fra
i canali e i link esterni, ognuno dei tre sembrava un'azione a sé.

⚠️ **Un gruppo non si spezza dentro di sé** (`flex-wrap: nowrap`): a capo ci va
la riga fra un gruppo e l'altro. Se i tre bottoni dei soldi si dividessero dove
capita a ogni larghezza di finestra, il raggruppamento non lo vedrebbe più
nessuno — che è il difetto di prima, dieci bottoni uguali in fila che si
spezzavano in punti diversi ogni volta.

⚠️⚠️ **I gruppi si separano con lo SPAZIO, non con una lineetta** — e il
margine sta a **destra**. Una lineetta disegnata come `::before` dentro il
gruppo, su una riga che va a capo, finisce **a inizio riga**: un trattino appeso
nel vuoto a sinistra del primo bottone. Il CSS non sa dire «solo se non sei il
primo della tua riga», quindi il separatore non può essere un segno: dev'essere
una distanza. E a destra, perché il margine destro dell'ultimo gruppo di una riga
semplicemente non si vede, mentre uno a sinistra rientrerebbe il primo gruppo
della riga dopo — lo stesso difetto in forma di buco.
Misurato: **4px dentro un gruppo, 16px fra due gruppi**, a ogni larghezza.

⚠️⚠️ **Niente `margin-left: auto` sull'ultimo gruppo.** Su una riga sola spingeva
Fornitore e Shopify in fondo a destra — che era il punto — ma appena il blocco
andava a capo li lasciava **soli su una riga tutta loro, allineati a destra**,
come se fossero un'altra cosa. Restano ultimi lo stesso: si leggono per ultimi
perché sono scritti per ultimi.

⚠️ **Il menu «Assegna a…» ha un tetto di larghezza.** Un `<select>` si dimensiona
sull'opzione **più lunga**, non su quella scelta: con «Me ne occupo io (Federica
Bertoldi)» in elenco diventava largo quanto la scheda e si portava via una riga da
solo, mentre a schermo c'era scritto «Assegna a…», che è corto. La larghezza di un
comando non deve dipendere da un testo che non si sta leggendo.

⚠️ Sul telefono i gruppi **vanno a capo anche dentro di sé**: su 360px «resta
attaccato» è una promessa che non si può mantenere, e quattro bottoni grandi in
fila uscirebbero dallo schermo.

⚠️ Nella **tabella** `Paga fornitore` è sceso accanto a `Rimborso`: stava
attaccato al menu `Assegna a…`, cioè un'azione sui soldi come primo vicino di
una sulle persone. Due schermate che mettono gli stessi bottoni in ordini
diversi si imparano due volte.

## La testata della conversazione: chi è sopra, che cosa ci faccio sotto

La riga in cima al thread è divisa in due, e la divisione è la funzione:

- **sopra, l'identità** — nome, recapito cliccabile, e i badge tutti insieme:
  canale, marchio, il nostro account che ha ricevuto, l'ordine, la lingua, chi
  se ne sta occupando. Non c'è niente da cliccare che cambi qualcosa.
- **sotto, le azioni**, in quattro gruppi separati da una lineetta:
  1. **chi se ne occupa** (`Me ne occupo io` / `Lascia`) — il primo gesto, e
     l'unico bottone pieno: è una decisione, non un attrezzo;
  2. **l'ordine** — `Collega` (frequente) e poi `Nuovo ordine ↗`, che porta fuori;
  3. **capire** — `Riassunto`, `Diario`, `Traduci`, `Rubrica`;
  4. **andare via** — `Da leggere`, `Archivia`, `Spam`, `Elimina`, in fondo a destra.

⚠️ **`Elimina` è staccato da `Archivia`** e la **✕ sta nella riga di sopra**:
prima il gesto per uscire e quello per distruggere erano vicini di casa, con 6px
in mezzo, e uno dei due si usa cento volte al giorno.

## Una nota di diario dalla conversazione

Il bottone **Diario** apre, sotto la testata, le note di lavoro di *questa*
conversazione: si leggono, si spuntano, se ne scrive una nuova senza uscire.

⚠️ **La cosa da ricordare nasce qui** — «richiamare lunedì», «vuole il biglietto
scritto a mano», «citofonare al 3». Finché la nota si poteva scrivere solo dalla
pagina del diario o dalla scheda di un ordine, o si usciva dalla chat — e allora
non la si scriveva — oppure restava nella testa di chi aveva risposto.

⚠️ **Se la conversazione è collegata a un ordine, la nota prende anche quel
numero**: la stessa riga si legge dalla scheda dell'ordine, dove la cerca chi
prepara la consegna. Scriverla due volte sarebbe l'unico modo per averne due
versioni diverse.

⚠️ **Il numero delle note da fare sta sul bottone** (`Diario 2`): dentro un
pannello chiuso, una nota lasciata a un collega non esisterebbe.

⚠️ Nel diario di lavoro la nota porta il **nome di chi scriveva**, copiato quando
è stata scritta: la pagina del diario non carica le conversazioni, e regge anche
se poi la chat finisce nel cestino.

## Lasciare una conversazione «da leggere»

Il bottone **Da leggere** la chiude e la rimette in coda col segno, come nella
posta. Riaprendola il segno si toglie da solo.

⚠️ **Non è `nonLetti` rimesso a 1.** Quello è il *contatore dei messaggi
arrivati*: alzarlo a mano avrebbe detto che è arrivato un messaggio nuovo quando
non è arrivato niente, e avrebbe fatto **squillare l'avviso** a chi ha appena
messo il segno (`src/lib/avvisi.ts` suona quando `nonLetti` cresce). È un campo
suo, `daRileggere`.

⚠️ **Segnare chiude la finestra**: il segno serve a ritrovare la conversazione
nell'elenco, e restare dentro a guardarla mentre dice «da leggere» è la sola cosa
che lo rende inutile.

⚠️ **Lo spegne il clic che riapre la conversazione**, non la rotta dei messaggi:
quella la richiama il polling ogni 4 secondi, e il segno sarebbe durato meno di
un battito di ciglia.

⚠️ **Anche la dashboard lo conta** fra «chi aspetta una risposta»: le due
schermate leggono da due funzioni diverse, e se una lo contasse e l'altra no
direbbero numeri diversi sulla stessa cosa, senza che nessuna dia errore.

⚠️ Nell'elenco il segno è una pillola **a contorno** d'oro, non piena come il
conteggio dei non letti: quella dice «è successo qualcosa», questa «me lo sono
messo da parte io».

**Anche dall'elenco, senza aprire niente**: ogni riga in posta in arrivo ha una
**busta** fra le iconcine — vuota se la conversazione è come le altre, piena e
d'oro se è segnata. Serve **scorrendo l'elenco**: si legge l'anteprima, si capisce
che ci vuole tempo, e la si mette da parte senza entrarci.

⚠️ È un **interruttore**: ripremendolo si toglie. Un segno che si può solo mettere
si toglierebbe aprendo la chat, cioè facendo esattamente la cosa che si voleva
rimandare.

⚠️⚠️ Il clic sulla busta **non deve arrivare alla riga** (`stopPropagation`): la
riga apre la conversazione, e aprirla cancella il segno. Senza, il bottone
avrebbe fatto il contrario di quello che dice, in silenzio.

⚠️ La busta accesa **non è smorzata** come le altre iconcine: quelle sono azioni
in attesa di essere usate, questa è uno **stato**, e uno stato che non si vede non
serve a niente.

⚠️ Lo spazio riservato a destra nella riga **si conta sulle icone che ci sono**
(`:has(...:nth-child(3|4))`): i 58px di prima bastavano a due, e sulle mail — che
hanno anche lo Spam — l'anteprima del messaggio finiva già sotto le iconcine.

Prova: `npx tsx scripts/prova-nota-e-rileggere.mts`

## Correggere una risposta pronta senza uscire dalla chat

Nel pannello **Risposte** dell'inbox (il bottone, o «/» a riquadro vuoto) ogni riga ha una
**matitina** a destra. Si clicca e la risposta pronta si apre lì: titolo, testo, **Salva**.

⚠️ **Serve perché ci si accorge che un testo è sbagliato mentre lo si sta per mandare**, non
aprendo la pagina delle risposte pronte. Se in quel momento correggerlo costa «esci, cerca,
correggi, torna, ritrova la chat», nessuno lo fa: si aggiusta a mano quella volta e il testo
resta sbagliato **per tutti**, per sempre.

⚠️ L'editor lo dice a chiare lettere: stai cambiando la risposta **di tutti** — e anche
quella a cui attinge l'AI — non questo messaggio.

⚠️ La matitina è **appena visibile** finché non ci passi sopra: è manutenzione, e non deve
competere col gesto vero della riga, che è «usa questa risposta».

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

Il mittente entra fra quelli ignorati e la conversazione va **nel cestino**: non compare
più né in arrivo né in archivio. ⚠️⚠️ E le prossime mail di quel mittente **nascono già nel
cestino** e non risalgono: prima ogni mail nuova ripescava la conversazione (giusto per un
cliente, sbagliato per uno spam, che sarebbe tornato su a ogni invio).

⚠️⚠️ **Il cestino si svuota dopo 30 giorni**, quindi da spam a mail perduta ci sono trenta
giorni: è la differenza col comportamento di prima, quando restava in archivio per sempre.
Per questo la conferma nomina l'**indirizzo esatto** che sta per essere bloccato — è
l'unico momento in cui ci si può accorgere che è un cliente vero — e per questo si salva
l'indirizzo, **mai il dominio**: da uno spam `@gmail.com` sparirebbe ogni cliente che
scrive da Gmail.

⚠️ Solo sulla **posta**: l'elenco dei mittenti ignorati lo leggono soltanto le rotte email,
e su WhatsApp o Instagram il blocco si fa da Meta.

## Fuori turno risponde l'AI (e se non sa, chiede)

Quando **non c'è nessuno in turno**, ogni dieci minuti l'app guarda le
conversazioni non lette che nessuno ha preso in carico e **risponde da sola**,
scegliendo fra le **risposte pronte** attive. Si accende in
**Impostazioni → Fuori turno risponde l'AI**, ed è **spenta di suo**.

⚠️⚠️ **Se non sa cosa dire, non lo inventa.** L'AI sceglie fra gli script: può
rispondere «nessuno adatto», ed è il momento in cui l'app **non sa**. Lì al
cliente non si scrive niente e parte una domanda su **WhatsApp
all'amministratore** (+39 349 885 3209, cambiabile in Impostazioni), a cui si
risponde dal telefono citando il messaggio o scrivendo il codice. È la ragione
per cui questa funzione può stare accesa di notte.

**Le quattro serrature**, e vanno lasciate:

1. l'**interruttore** in Impostazioni, spento di suo: una cosa che parla ai
   clienti non si accende con un deploy;
2. solo **fuori turno** — se c'è anche una sola persona in servizio non parte:
   due risposte diverse allo stesso cliente sono peggio di una tardiva;
3. solo su conversazioni **non prese in carico** e dove l'**ultimo messaggio è
   del cliente**;
4. massimo **tre** risposte automatiche per conversazione: se il cliente continua
   a scrivere, il problema non è la velocità — serve una persona.

⚠️⚠️ **L'ora è quella di ROMA, non del server.** I turni si scrivono «09:00 –
18:00» e il cron gira in UTC: d'estate alle 09:30 italiane il server segna le
07:30, direbbe «non c'è nessuno» a turno appena iniziato e si metterebbe a
rispondere sopra a chi lavora. E a mezzanotte e mezza in UTC è ancora il giorno
prima, cioè si guarderebbe la griglia di ieri.

⚠️ La risposta automatica **si vede in chat** col nome «AI (fuori turno)», e la
conversazione resta **da leggere**: l'AI ha tamponato, non ha chiuso.

⚠️ Un invio fallito si registra lo stesso, con l'errore: una risposta che non è
partita deve vedersi, non sparire.

⚠️ **Prima di accenderla** conviene guardarla lavorare a vuoto:
`POST /api/ai-fuori-turno?prova=1` fa tutto il giro e dice, riga per riga, cosa
risponderebbe — **senza mandare niente a nessuno**. Vale anche dopo ogni modifica
agli script.


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

### Il seguito di una nota: il filo

⚠️⚠️ Una nota da sola racconta metà storia. Il caso vero è: «richiamare il
cliente domani» → «richiamato, vuole il biglietto riscritto» → «riscritto». Tre
righe sulla stessa cosa: scritte separate diventano **tre cose da fare**, e chi
legge il diario non sa che le ultime due chiudono la prima.

Sotto ogni riga c'è **Aggiungi seguito**: la riga nuova **cita** quella e le si
mette sotto, rientrata. Un seguito è una **nota come le altre** — si spunta, ha
un autore, e **eredita l'ordine e la chat** della capofila: cercando quel numero
si trova tutto il filo, non metà.

⚠️ **Un solo livello.** Il seguito di un seguito si aggancia alla capofila: un
albero profondo dentro una lista di cose da fare non si legge più.

⚠️⚠️ **Una capofila completata con un seguito ancora aperto RESTA fra le
aperte**, e a schermo c'è scritto perché («questa riga è completata, ma il suo
seguito no»). Senza questa regola, spuntando la prima riga di un filo si
farebbero sparire dalla vista di lavoro le cose che restano da fare — in
silenzio, che è il modo peggiore di perderle. È provato:
`scripts/prova-seguito-diario.mts`.

⚠️ Il filo si vede anche **dentro l'ordine e dentro la chat** (lì piatto: il
contesto c'è già), e il numeretto delle note in sospeso su una conversazione
**conta anche i seguiti aperti**.


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

### Ci sono domande aperte? Si vede dalla pagina

In cima a `/reclami` c'è il riquadro **Domande aperte**: quante domande del filo
aspettano una risposta, e **su quanti reclami**. Il primo numero è il lavoro, il
secondo dice quante persone bisogna andare a cercare.

⚠️⚠️ Si conta su **tutto l'archivio**, non su quello che i filtri stanno
mostrando: una domanda su un reclamo «chiuso» aspetta lo stesso, e un numero che
cambia insieme ai filtri non serve a decidere se c'è qualcosa da sbloccare.

⚠️ **Zero si scrive** («Nessuna domanda aperta»), non si nasconde: un riquadro
che sparisce non è una risposta.

Il riquadro è **cliccabile**: filtra l'elenco sugli stessi reclami che dichiara —
un numero che non porta da nessuna parte costringe a rifare a mano il filtro che
descrive. Sulla riga resta il bollino con quante ne aspettano su quel reclamo.

### L'esito: come è andata a finire

Nella colonna **Stato**, sotto lo stato, ora si legge l'**esito** del reclamo —
«rimborso spedizione», «buono da 25 €», «riordino a nostro carico».

⚠️⚠️ Stato ed esito sono due cose diverse: il primo dice **a che punto è**, il
secondo **come è andata a finire**. In un elenco di reclami chiusi «Risolto» da
solo non dice se abbiamo rimborsato 250 € o scritto una mail di scuse — e quel
campo esisteva, si leggeva solo aprendo il reclamo uno per uno.

⚠️ Su un reclamo non più aperto **senza esito scritto** compare «esito non
scritto» in rosso: è una cosa che fra un mese non ricostruisce più nessuno.

⚠️ E nel filo, una domanda a cui si è risposto dice **chi ha risposto**
(«risposta da Federica»), non solo «risposta».

### Il filo di domande e risposte, e i soldi dell'ordine

Aprendo un reclamo (bottone **Apri** sulla riga) sotto il modulo ci sono due
riquadri nuovi.

**Quest'ordine, in soldi.** Valore dell'ordine · quanto è andato al fornitore ·
**quanto ci è rimasto**, con la percentuale sul totale pagato dal cliente.

⚠️⚠️ Il margine si **legge da Deluxy Orders**, non si rifà qui: è l'unico posto
dove si calcola (Standard §7.4) ed è al **netto IVA**. Rifarlo come «totale −
costo» darebbe un numero più alto e altrettanto credibile, e le due schermate
direbbero due cifre diverse sulla stessa cosa senza che nessuna dia errore.
⚠️ Per lo stesso motivo quota del fornitore e margine **non fanno 100 fra loro**:
il costo è lordo su lordo, il margine netto su lordo.

⚠️ Se Orders non risponde, o di quell'ordine non conosce il costo, si scrive
**«non calcolabile»** — mai «0 €», che si legge come «non ci abbiamo guadagnato
niente». A che serve: è la cifra che manca quando si decide un rimborso.
Rimborsare 250 € su un ordine che ce ne ha lasciati 40 non è la stessa decisione
che rimborsarli su uno che ne ha lasciati 120.

**Domande e risposte.** Il filo di quello che si chiede e si scopre lavorando il
reclamo: «il valet dice che ha citofonato, il cliente dice di no» · «chiedo al
fioraio se ha la prova di consegna» · «risposto: ce l'ha».

⚠️⚠️ Una riga si può segnare come **domanda**: resta marcata **«domanda aperta»**
finché qualcuno non preme *Rispondi*, e le risposte stanno **sotto** la loro
domanda, non in fondo al filo. Un elenco di note tutte uguali nasconderebbe
proprio la cosa che aspetta qualcuno.

⚠️ Il conto delle domande aperte si vede **dall'elenco dei reclami**, accanto
alla casistica: un reclamo fermo perché aspetta una risposta non è un reclamo
trascurato, ed è l'unico che si sblocca andando a cercare una persona. Tenerlo
dentro la scheda vorrebbe dire aprirne sei per scoprirlo.

⚠️ Scrivere nel filo **non chiude** una domanda: solo *Rispondi* lo fa. È la
differenza fra «ho detto qualcosa» e «ho risposto», ed è provata
(`scripts/prova-filo-reclamo.mts`).


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

**Totali o al giorno.** Accanto ai periodi c'è l'interruttore **Totali / Al giorno**: il
secondo divide ogni numero per i **giorni lavorati** di quella persona. Serve a confrontare
chi lavora un numero diverso di giorni — senza, chi c'è due giorni su sette risulta sempre
l'ultimo.

⚠️ **«Giorni lavorati» non sono i giorni del periodo**: sono i giorni in cui quella persona
ha lasciato **almeno una traccia**. Chi è stato in ferie cinque giorni su sette viene diviso
per due, non per sette.
⚠️ **Il divisore è sempre in tabella**, anche guardando i totali: c'è la colonna
**Giorni**. Una media senza il suo denominatore davanti non si può controllare — e un
numero che non si può controllare, in una tabella di prestazioni, non andrebbe mostrato
affatto.
⚠️ **Non sono i giorni dei Turni.** Quelli dicono quando una persona *doveva* esserci,
questi quando *ha fatto* qualcosa. Quando la griglia dei turni sarà piena si potranno
confrontare, e la differenza sarà un'informazione — non un errore.
⚠️ Zero giornate dà **«—»**, non zero: dividere per zero darebbe un numero impossibile.

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
