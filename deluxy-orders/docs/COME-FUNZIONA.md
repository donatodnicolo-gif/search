# Come funziona Deluxy Orders

Manuale funzionale. Fonte di verità del comportamento dell'app: aggiornarlo a
ogni commit che cambia comportamento (regola di lavoro Deluxy n. 0).

## Idea
Tutti gli ordini Shopify dei brand Deluxy in un posto solo, riclassificabili
come serve, leggibili dalle altre app. Orders **non vende** e **non consegna**:
raccoglie, ordina e smista informazioni.

## Il menu
A sinistra le pagine sono raggruppate per **cosa si sta facendo**, non per come è
fatta l'app — sono tre mestieri diversi, che spesso fanno persone diverse in
momenti diversi della giornata:

- **Ordini** — quello che è entrato e va lavorato: tutti gli ordini, la bacheca,
  la consegna da scrivere su Shopify;
- **Clienti** — chi ha comprato: l'elenco, le liste, le occasioni. Si guarda
  quando si pensa, non quando si spedisce;
- **Comunicazione** — script e automazioni, cioè quello che esce verso i
  clienti. Stanno insieme perché uno script senza automazione non parte, e
  un'automazione senza script non ha niente da dire;
- **Configurazione** — Impostazioni, in fondo: ci si va di rado e apposta.

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

### Chi ordina e da dove arriva
Su ogni ordine, in tutte e due le viste, ci sono due segni che si leggono prima
di aprire qualsiasi cosa.

**«1º ordine» o «Repeater · 4º».** Non è «quanti ordini ha oggi quel cliente»,
ma **quanti ne aveva prima di questo**: un ordine di due anni fa resta «primo
ordine» anche se nel frattempo la persona ne ha fatti altri dieci — la storia
non si riscrive all'indietro. Il cliente è lo stesso della pagina Clienti (email
→ telefono → nome), quindi un ordine su Flowers e uno su deluxy.it fatti con la
stessa email sono la stessa persona, e il secondo è un ritorno. Gli ordini
annullati non contano come volta precedente: un ordine annullato non è un
cliente servito. Sugli ordini **senza email, telefono né nome** il segno non
compare: lì non si sa, e non si tira a indovinare.

**Il simbolo della provenienza.** Shopify sa da sempre da dove è arrivato ogni
ordine e non lo diceva a nessuno. Ora si vede a colpo d'occhio, con il nome del
canale sotto il mouse:

| | canale | come si riconosce |
| --- | --- | --- |
| 🎯 | Google Ads | `utm_source=adwords` con `medium` a pagamento |
| 🛒 | Google Shopping | `utm_medium=product_sync` |
| 🔎 | Ricerca non pagata | prima visita da Google, Bing, DuckDuckGo… |
| 📣 | Facebook / Instagram a pagamento | `utm` di Meta con medium a pagamento |
| 📸 | Social | profili e post, senza inserzione |
| 📧 | Email | Klaviyo, Shopify Email |
| 💬 | WhatsApp | anche `l.wl.co`, il dominio con cui WhatsApp apre i link |
| 🤖 | Assistenti AI | ChatGPT, Perplexity e simili |
| 🔗 | Da un altro sito | un sito ci ha linkati |
| ➜ | Diretto | ha scritto l'indirizzo o ci aveva già salvati |
| ☎ | Ordine creato a mano | bozza compilata da noi: telefono, di persona |

Tre cose da sapere, perché cambiano cosa significa quello che si legge:

1. **è attribuzione al primo contatto**: si guarda la *prima* visita del
   percorso che ha portato a quell'ordine, non l'ultimo clic. Chi ci ha trovati
   con un annuncio e poi è tornato scrivendo l'indirizzo resta «Google Ads». È
   la lettura giusta per capire chi ci porta i clienti, non per giudicare una
   singola campagna;
2. **non sapere è normale, e si vede**: se Shopify non ha associato nessuna
   visita — succede sugli ordini creati a mano e su molti ordini vecchi — non
   compare nessun simbolo. Un posto vuoto si legge come «non lo sappiamo»;
   «diretto» sarebbe stata una bugia comoda;
3. **i canali a pagamento sono in oro**: Google Ads, Shopping e Meta si
   distinguono a vista dal traffico che non ci è costato nulla.

Nella scheda dell'ordine c'è tutto per esteso: il **nome della campagna**
(«[Deluxy] Torte MILANO»), gli `utm`, la prima visita e il canale tecnico di
Shopify — cioè il dato grezzo su cui la deduzione è stata fatta, per chi non si
fida della deduzione.

### «Nuovo»: cosa è arrivato mentre eri qui
In una tabella da 14.000 righe, accorgersi che è entrato un ordine vuol dire
ricordare a memoria qual era il primo numero in cima. Non funziona. Perciò gli
ordini **entrati nel registro dopo che hai aperto l'app** portano un'etichetta
verde **Nuovo**, e in cima compare un avviso — «3 ordini nuovi dagli ultimi 20
minuti» — con due pulsanti: *Vedi solo questi* e *Ho visto*.

- **«Ho visto»** sposta ad adesso il momento da cui contare. Non tocca gli
  ordini e non cancella niente: sposta il segnalibro **di chi guarda**.
- Il momento sta in un **cookie di sessione**, non nel database: due persone che
  lavorano insieme hanno due «da quando sono arrivato» diversi, e nessuna
  azzera le novità dell'altra. Chiudendo il browser si riparte.
- Si guarda **quando l'ordine è entrato nel registro**, non la sua data su
  Shopify: un ordine di ieri sera importato stamattina è nuovo per chi lavora.
- L'avviso compare **solo se ci sono novità**: un avviso che dice «zero» ogni
  volta smette di essere letto dopo due giorni.

### I tag di luogo: dove arriva e da dove parte
Su ogni ordine ci sono i **tag dei luoghi**, e sono cliccabili: un clic mostra
tutti gli ordini di quella città o di quel paese.

- 📍 **la città di consegna** e la bandiera del paese di arrivo;
- ✈ **la città e il paese di chi manda**, presi dall'indirizzo di fatturazione.

Sono due cose diverse e servono a due mestieri diversi: la città di consegna è
un problema operativo (chi consegna lì? in quanto tempo?), il paese del mittente
è un fatto commerciale. Sui dati veri **3.790 ordini su 13.980 — più di uno su quattro — sono mandati
da un paese diverso da quello di consegna**: Stati Uniti (1.220), Regno Unito
(793), Emirati (272), Svizzera, Francia, Australia. Gente che manda fiori in
Italia da lontano. C'è un filtro apposta («Solo ordini mandati
dall'estero»), perché quel cliente non passerà mai dal negozio e va trattato per
quello che è.

Quando mittente e destinatario sono nello stesso paese la bandiera si mostra una
volta sola: ripeterla sarebbe rumore. E i tag compaiono **solo se il dato c'è** —
niente «città sconosciuta» a riempire il buco.

Le città arrivano da Shopify in ogni forma («MILANO», «Milano», « milano ») e
per i tag vengono ridotte a una forma sola, ma **si mostrano come si scrivono**:
«Reggio Emilia», non «REGGIO EMILIA». I clienti stranieri le scrivono anche in
inglese — 171 ordini dicono «Milan», 77 «Rome» — e quelli si uniscono al tag
italiano, ma **solo quando il paese è l'Italia**: «Florence» esiste anche nel
Regno Unito, e ce n'è un ordine vero. Tradurre alla cieca sposterebbe un ordine
di mille chilometri. Il filtro cerca tutte le grafie: cliccando «Milano» escono
anche i «Milan», altrimenti sparirebbero senza che nessuno se ne accorga.

### Quanto manca alla consegna: urgenze, pensieri, eventi
Un ordine da consegnare domani mattina e uno per un matrimonio fra tre settimane
si assomigliano in una tabella e non c'entrano niente l'uno con l'altro. Ogni
ordine porta quindi una **pallina colorata** che dice quanto tempo c'è fra
l'ordine e la consegna richiesta:

| | tipo | quando |
| --- | --- | --- |
| 🔴 | **Urgenza** | consegna lo stesso giorno o il giorno dopo (entro 24 ore) |
| 🟠 | **Pensiero** | entro 48 ore |
| 🔵 | **Pianificato** | entro 7 giorni |
| 🟣 | **Evento** | entro 30 giorni: una data fissata in anticipo |
| ⚪ | **Molto in anticipo** | oltre 30 giorni |

Sui dati veri il negozio vive di urgenze: **6.313 ordini su 9.495 con una data
di consegna sono da consegnare entro 24 ore**. Gli eventi sono 476.

**Si misura in giorni di calendario, non in ore.** La data di consegna che arriva
da Shopify è un giorno, non un istante: la fascia oraria c'è solo qualche volta.
Dire «mancano 23 ore e mezza» sarebbe precisione finta, ed è il tipo di numero
che fa prendere decisioni sbagliate. Gli ordini **senza data di consegna** non
finiscono nel mucchio dei «pianificati»: restano «consegna non indicata», si
filtrano a parte e si vedono.

### Analisi (`/analisi`)
Come stanno andando le vendite, **sempre accanto a un altro periodo**: 85.000 €
in un mese è tanto o poco? Da solo quel numero non lo dice. Si sceglie
**settimane, mesi o anni** e il confronto — *periodo precedente* oppure *stesso
periodo dell'anno scorso* — e ogni misura esce con la sua variazione. Con le
frecce si va indietro nel tempo; il filtro per negozio taglia tutto.

**Il periodo in corso si confronta a parità di giorni.** Al 27 luglio si è al 27
luglio: il confronto si ferma al 27 del mese prima. Senza questo accorgimento
ogni mese sembra un disastro fino al 28, e la pagina scriverebbe cali del 40%
che sono solo giorni non ancora accaduti.

**Si può anche scegliere un periodo qualsiasi** — «dal 1 al 14 febbraio» — con
le due date in alto. Lì «il mese prima» non esiste, quindi il confronto diventa
**la stessa lunghezza appena prima** (18–31 gennaio) oppure **le stesse date
dell'anno scorso**, e l'etichetta scrive sempre quali giorni sta confrontando.
Un giorno solo si può chiedere: «14 feb 2026» contro «13 feb 2026». Se le due
date sono al contrario la scelta viene **ignorata** e si torna ai mesi, invece
di rispondere a una domanda diversa da quella fatta.

**Gli ordini annullati non entrano nel venduto**, mai. Luglio 2026, per essere
precisi: nel registro ci sono 420 ordini per 98.984 €; l'analisi ne mostra
**393 per 87.450 €** e tiene fuori 18 annullati (10.730 €) e 9 rimborsati o
stornati (803 €), che vengono contati a parte nel riquadro «cosa è rimasto fuori
dal venduto». 393 + 18 + 9 = 420: nessun ordine sparisce e nessuno viene contato
due volte.

I numeri che escono:

- **venduto**, **ordini**, **clienti**, **pezzi venduti**;
- **scontrino medio** — è lo stesso numero dell'«ordine medio»: venduto diviso
  ordini. E siccome un unico numero non dice mai *perché* si è mosso, accanto ci
  sono i due pezzi da cui è fatto: **UPT** (pezzi per ordine) e **prezzo medio a
  pezzo**. Scontrino medio = UPT × prezzo medio, e la differenza fra «vendiamo
  meno» e «vendiamo le stesse cose a meno» si legge lì;
- **ordini da clienti nuovi**, in percentuale: la stessa numerazione dei
  repeater, calcolata su tutta la storia e non solo dentro il periodo;
- **annullati** e **rimborsati** in percentuale, con le frecce di colore
  invertito — un aumento dei resi non è una buona notizia e non deve sembrarlo.

Poi **cosa è rimasto fuori dal venduto** (annullati, rimborsi pieni, e i
rimborsi parziali che restano contati per intero perché l'importo reso non
esiste nel registro) e la **serie storica** degli ultimi 12–13 periodi con tutti
i KPI riga per riga: è lì che si confrontano fra loro settimane, mesi e anni.
**L'ultima riga della serie è il periodo in corso**: va letta sapendo che non è
ancora finita.

#### Da dove viene il risultato: gli stessi numeri tagliati in sei modi
«Il venduto è sceso» non è una notizia finché non si sa **dove**. La stessa
tabella si può guardare per:

- **città di consegna** — dove arriva il regalo;
- **categoria di prodotto** — fiori, torte, colazioni…;
- **tipologia di cliente** — privato, azienda, hotel e ristoranti, eventi;
- **occasione** — compleanni, anniversari, lauree;
- **nazione di chi ordina** — da quale paese parte la richiesta;
- **nazione di consegna** — in quale paese arriva il regalo;
- **tipo di ordine** — urgenza, pensiero, pianificato, evento;
- **canale di provenienza** — Google Ads, ricerca, social, email, WhatsApp.

Ogni riga porta **tutti i KPI della pagina** — venduto, quota, ordini, scontrino
medio, UPT, prezzo medio, pezzi, clienti, % nuovi, % annullati, % rimborsi —
ognuno **con la sua variazione** rispetto allo stesso periodo di confronto.

Tre cose volute:

1. **una riga che sparisce resta a zero**: se il mese scorso c'erano ordini a
   Firenze e questo mese no, la riga «Firenze» resta in tabella con `0,00 €` e
   la sua freccia rossa. Farla sparire nasconderebbe esattamente la notizia che
   si sta cercando;
2. **le categorie stanno sull'ordine, non sulla riga**: un ordine con fiori e
   una torta è contato in entrambe, e la somma supera il totale. Spezzare
   l'importo a metà sarebbe un numero inventato;
3. **si mostrano le 25 righe che valgono di più** — le città sono centinaia — e
   la pagina lo scrive, invece di far sparire numeri in silenzio.

Due letture che sembrano errori e non lo sono, spiegate sotto le tabelle:
**«azienda» è piccolissima** (11 ordini nel 2026) perché il riconoscimento
automatico è prudente apposta e le circa mille «probabili aziende» sono ancora
da confermare a mano; **«da precisare» è la riga più grande fra le occasioni**
(59% del venduto 2026) perché sono ricorrenze vere di cui nessuno ha ancora
detto il motivo — si fa dire all'AI dalla pagina Eventi clienti.

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

### Ordinare l'elenco dei clienti
**Ogni colonna è ordinabile**, nei due versi: si clicca l'intestazione, e
cliccandola di nuovo si inverte (la freccia dice sempre cosa sta succedendo).
Le colonne a etichetta — tipologia, segmento, attività — non si ordinano in
alfabetico ma nell'ordine in cui contano: «Attivo, Recente, Dormiente,
Inattivo», non «Attivo, Dormiente, Inattivo, Recente».

### Lo stato di attività
Accanto al segmento di valore c'è **quanto tempo è passato dall'ultimo ordine**,
da solo: **Attivo** (≤ 90 giorni), **Recente** (3-12 mesi), **Dormiente**
(12-24 mesi), **Inattivo** (oltre 24 mesi). È la domanda che ci si fa davvero
guardando un elenco — «questo cliente c'è ancora?» — e il segmento la mescola
col denaro. Si ordina e si filtra anche per quello.

### Privacy: chi si può contattare
Dai negozi si importa, per ogni ordine, il **consenso di marketing** che Shopify
conosceva in quel momento (email e SMS). Per il cliente vale il consenso del suo
**ordine più recente**: chi si disiscrive dopo tre ordini non è «iscritto»
perché lo era due anni fa.

Nella scheda del cliente ci sono tre interruttori — email, WhatsApp/SMS,
telefonate — più **«non contattare mai»**. La regola, valida per la UI, per gli
export e per le automazioni:

1. se il cliente è **bloccato**, non si contatta su nessun canale;
2. se qualcuno ha scritto **sì/no** a mano, vince quello: è l'ultima volontà che
   conosciamo (una telefonata, una richiesta a voce);
3. altrimenti vale **Shopify**, e conta solo «iscritto»;
4. se non sappiamo niente, **non si contatta**. Nel dubbio si tace.

Da qui le liste della famiglia **Privacy**: *Consenso email* e *Consenso
WhatsApp/SMS* (quelle da esportare davvero), *Non contattare*, e *Consenso da
chiedere* — clienti veri, con un recapito, di cui non sappiamo niente. Le
vecchie liste «Ha un'email» e «Ha un telefono» restano, ma dicono un'altra cosa:
avere il recapito non è avere il permesso di usarlo.

> I consensi arrivano con la sincronizzazione: gli ordini importati **prima** di
> questa funzione non li hanno finché non vengono risincronizzati. Un cliente
> senza consenso noto finisce in «Consenso da chiedere», non in «si può
> scrivere».

### Liste (`/liste`)
I clienti raggruppati **come si usano**: 39 liste calcolate in tempo reale dagli
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

### I feedback del Customer Service sull'ordine
Nella scheda dell'ordine compare la scheda **«Customer Service — reclami e
voti»** quando c'è qualcosa da sapere:

- **reclami**: casistica, gravità (lieve/media/grave, con il colore del
  Customer Service), stato (aperto, in lavorazione, risolto, chiuso), a chi è
  imputato, descrizione ed esito;
- **voti**: il giudizio 1-5 dato da una persona su un valet o un partner,
  quando è legato a quell'ordine, con il canale da cui è arrivato.

Arrivano da **deluxy-messaging (Customer Service, porta 3140)** via
`GET /api/v1/feedback` con chiave di sola lettura, e qui sono una **copia in
sola lettura**: un reclamo si apre e si chiude là, dove c'è chi ha parlato col
cliente. L'import gira ogni notte insieme alla sincronizzazione da Shopify, ed è
lanciabile a mano da Impostazioni («Importa ora», con l'opzione «rileggi tutto
dall'inizio»). Ogni reclamo nuovo lascia anche una riga nella *Storia*
dell'ordine, con autore `customer-service`.

**Un feedback si attacca a un ordine solo se il numero lo identifica senza
ambiguità.** Lo stesso numero esiste su più negozi — «#1731» c'è su
cakedesign.me e potrebbe esserci su deluxy.it — quindi se il Customer Service
non dice anche il negozio, il feedback resta *senza ordine riconosciuto*
(visibile e contato in Impostazioni) invece di essere attaccato all'ordine
sbagliato. Un reclamo sull'ordine sbagliato manda a un fornitore la colpa di un
altro: meglio scollegato.

### Split per brand e per categoria
Ogni lista si può guardare **per singolo negozio** e **per categoria di prodotto**,
e i due tagli funzionano in modo diverso apposta:

- il **brand** taglia gli *ordini*: «i VIP di Flowers» sono quelli che su
  Flowers hanno speso da VIP, e spesa, segmento e attività sono ricalcolati su
  quel negozio. Lo stesso cliente può essere VIP su deluxy.it e nuovo su
  Flowers — sono due storie diverse, e il registro le tiene separate;
- la **categoria** sceglie le *persone*: «chi compra fiori» resta con tutti i
  suoi numeri interi, altre categorie comprese. Se filtrasse gli ordini, la
  domanda «di quante categorie è amante» avrebbe sempre risposta «una».

Nel catalogo ogni card mostra lo **split per brand** sotto il numero grande
(VIP: deluxy.it 109 · Flowers 24 · cakedesign.me 3), così si vede subito dove sta
davvero una lista. Cliccando si apre l'elenco dei clienti con nome, contatti,
ordini, speso, medio e tag — e l'export CSV esce **con gli stessi filtri** che
si stanno guardando.

### Categorie di prodotto e gusti dei clienti
Le categorie (fiori, torte e pasticceria, colazioni, dolci e cioccolato, salato,
vini, regali) si ricavano dal **titolo dei prodotti** nelle righe d'ordine.
Shopify non le dà: il tipo di prodotto richiede lo scope `read_products`, che i
token non hanno.

Quello che il titolo non dice lo copre la **specialità del negozio** (in
Impostazioni, negozio per negozio): su Flowers e cakedesign.me, che vendono una
cosa sola, un prodotto sconosciuto è fiori o torte. Su deluxy.it, che vende di
tutto, resta **«non classificato»** — sono 2.525 ordini su 11.647, e sono i best
seller con nome proprio («Botticelli - Nascita di Venere», «Favolosa»): nel nome
non c'è niente che dica cosa sono, e inventarlo sarebbe peggio che ammetterlo.

Da qui la famiglia di liste **Gusti**: *Ama una categoria sola* (7.803 clienti),
*Compra da più categorie* (1.001) e una lista per ogni categoria — fiori 5.199,
torte 2.372, colazioni 1.105, dolci 922, regali 171, vini 136, salato 121.
Incrociando «ama una categoria sola» con il filtro categoria si ottiene
l'amante puro: chi compra **solo** fiori, o **solo** torte.

Il ricalcolo si lancia da Impostazioni: legge le righe già salvate (non chiama
Shopify), ci mette 4 secondi sull'intero archivio e riscrive solo gli ordini in
cui il risultato cambia.

### Eventi clienti (`/eventi`)
Le **occasioni** per cui i clienti ordinano, ricavate dagli ordini. Un fioraio
non vende fiori: vende ricorrenze. Se lo stesso cliente manda qualcosa alla
stessa persona più o meno nello stesso giorno di anni diversi, quello è un
compleanno, un anniversario, una festa — l'informazione più utile del registro,
e c'era già dentro senza che nessuno la leggesse.

Sui dati veri: **9.129 ordini con data di consegna → 8.729 occasioni**, di cui
**169 confermate da più anni** e **366 che ricorrono nei prossimi 30 giorni**.
Esempi reali: la stessa persona riceve qualcosa ogni **27 marzo dal 2022 al
2026** (cinque anni di fila), un'altra ogni **24 dicembre dal 2022**.

Come si ricava, e cosa **non** si deduce:

- si guardano solo la **data di consegna** (l'attributo Shopify) e il
  **destinatario** della spedizione: due dati strutturati, mai il testo delle
  note;
- stesso cliente + stesso destinatario + consegne entro **7 giorni** l'una
  dall'altra = una occasione. Se cade in **anni diversi** è un fatto
  (`ricorrenze` ≥ 2); se è capitata una volta sola è un'ipotesi — utile lo
  stesso, perché quella data torna;
- **che cosa** si festeggi non si indovina: nessuno lo scrive in un ordine, e
  chiamare «compleanno» un anniversario di matrimonio è l'errore che poi si
  legge in un messaggio al cliente. Il tipo resta «da precisare» finché non lo
  scrive una persona, dal menu sulla riga;
- gli ordini **senza data di consegna** (un terzo dell'archivio) non producono
  occasioni: la data dell'ordine è quando si compra, non quando si festeggia.

La vista predefinita è **quello che sta arrivando** (60 giorni, il più vicino in
alto, in rosso sotto i 14 giorni); ci sono anche *ricorrenti*, *da confermare*,
*confermati* e *ignorati* — perché una consegna capitata lì per caso si toglie
di mezzo invece di restare a fare rumore. Le occasioni di un cliente si vedono
anche sulla sua scheda.

Il rilevamento si rilancia dal pulsante **«Rileggi gli ordini»** e gira ogni
notte con la sincronizzazione. È idempotente e **non tocca ciò che ha scritto
una persona**: tipo, titolo, note e stato restano com'erano (secondo giro
misurato: 0 nuovi, 0 aggiornati, 1,6 secondi).

Da qui nasce la lista **«Ha un'occasione fra 30 giorni»** (359 clienti,
99.000 EUR di storico): la più preziosa del catalogo, perché non stai
proponendo di comprare — stai ricordando una data che a quella persona importa.

### Categorie dei prodotti e l'AI (`/categorie`)
Di cosa è fatto un ordine — e quindi cosa piace a un cliente. Le **parole del
titolo** riconoscono la maggior parte dei prodotti («Bouquet Rose Rosse» →
fiori, «Crostata di Frutta» → torte), ma i più venduti si chiamano «Botticelli -
Nascita di Venere», «Favolosa», «Alexander»: nel nome non c'è niente da
riconoscere, e su 4.367 titoli diversi un elenco scritto a mano andrebbe
riscritto a ogni collezione.

Qui entra **ChatGPT**: guarda nome, negozio (con la sua specialità dichiarata) e
prezzo medio, e **propone** una categoria con il **motivo** scritto. Chi decide,
in ordine: quello che scrivi tu → le parole del titolo → la proposta dell'AI →
la specialità del negozio → «non classificato».

Le regole che la tengono onesta, e sono la stessa cosa che fanno le altre app
Deluxy con l'AI:

1. **non può inventare categorie**: una risposta fuori dall'elenco viene
   scartata e il prodotto resta senza categoria;
2. **non tocca ciò che le regole già sanno**: la si interroga solo sui prodotti
   che nessuna parola riconosce;
3. **«non classificato» è una risposta giusta**: se l'unico argomento è «costa
   una cifra plausibile», deve dirlo invece di indovinare. Sui 40 prodotti più
   venduti senza categoria ne ha classificati 12 con una ragione vera (il
   negozio vende solo fiori, «Nigiri» è sushi, «Luxury Cream Tart» è una torta) e
   ne ha lasciati 28 da parte;
4. **resta una proposta**: si vede in pagina col motivo, si corregge in un clic,
   e la correzione di una persona vince e non viene più toccata.

Un prodotto senza categoria non è un errore: è un buco dichiarato. Finché resta
lì, quel cliente non risulta «amante» di niente per colpa di quel prodotto — che
è meglio che farlo risultare amante della cosa sbagliata.

### L'AI legge il biglietto e dice PERCHÉ
Degli eventi si sapeva **quando** (data di consegna + destinatario, dati
strutturati) ma non **perché**. Il perché sta scritto in un posto solo: il
**biglietto** che accompagna il regalo. Sui dati veri **7.672 eventi su 8.729**
hanno un testo da leggere (91 un campo biglietto vero, gli altri la nota
dell'ordine, dove i tre negozi finiscono per scrivere la dedica).

Il pulsante **«Leggi i biglietti con l'AI»** manda quei testi a ChatGPT e
riporta l'occasione: compleanno, anniversario, matrimonio, nascita, laurea,
festa/ricorrenza, ringraziamento, **condoglianze**, altro. Misurato: 50
biglietti in 2 chiamate → **37 occasioni riconosciute**, 9 «non si capisce», 0
risposte scartate.

Quello che si vede in pagina è la **prova**: la frase esatta su cui ha deciso,
sotto il tipo — «Tantissimi auguri di buon compleanno!!», «Buon Natale», «Buon
onomastico Maria Rita». Il bollino **AI** dice chi l'ha detto; se lo cambi tu
diventa ✓ e nessun giro successivo lo tocca più.

Tre cose volute:

1. **la nota non è sempre una dedica**: dentro finiscono «Tags: Fiori»,
   indirizzi e istruzioni per il corriere. Se il testo non dice l'occasione, la
   risposta è «da precisare» — e resta segnato che l'AI ha già guardato, per non
   ripagare la stessa domanda;
2. **«condoglianze» esiste in elenco apposta**: in questo mestiere confondere un
   lutto con una festa è l'errore che non si recupera, e riconoscerlo serve a
   tenere quell'evento fuori da qualunque automazione allegra;
3. **cosa esce dall'azienda**: solo il testo del biglietto e la data. Non nome,
   email, telefono o indirizzo del cliente. Il biglietto però contiene spesso
   nomi di persona, ed è giusto saperlo: quel testo passa da OpenAI.

### Il riepilogo del cliente scritto dall'AI (`/clienti/:chiave`)
In cima alla scheda di ogni cliente c'è un **riepilogo scritto dall'AI leggendo
i suoi ordini veri**: chi è questa persona per noi, come compra, per chi — e
soprattutto **cosa le piace**. È la cosa che un negoziante di quartiere sa a
memoria dei suoi abituali, e che qui era sparsa in venti righe d'ordine.

Sono **tre cose separate**, non un blocco solo:

1. il **riassunto** in prosa, due o tre frasi;
2. **Preferenze e gusti**: categorie e prodotti che ripete, fascia di prezzo,
   destinatari abituali, stagionalità. È la parte che serve davvero per vendere
   bene, e per questo è staccata dal resto;
3. **la sua storia, un punto per ordine**, in ordine di tempo.

**A ogni ordine nuovo si aggiunge un punto, i vecchi restano come sono.** Non è
un dettaglio di risparmio: un riepilogo riscritto da capo ogni volta cambia le
parole di cose già lette, e due letture a distanza di mesi si contraddicono. Chi
aggiorna manda all'AI **solo gli ordini arrivati dopo l'ultima volta**, con
davanti il riepilogo già scritto e l'istruzione di non riscriverne i punti. I
gusti invece si riscrivono ogni volta: sono una lettura dell'insieme, e con un
ordine in più possono cambiare davvero. Se il riepilogo non convince c'è
**Riscrivi da capo**, che rilegge tutta la storia.

Esempi veri (luglio 2026): «Tutti gli ordini sono indirizzati a Angelina Lacour
… preferenza per le rose di lusso, in media 2.476 € per ordine»; «Bouquet Grande
Gatsby, Bouquet Milano e Flower Box Ponza … destinatari abituali Graziella
Turchetti, Immacolata Marsaglia, Maddalena Collini Crosti».

Quattro cose volute:

1. **si legge solo quello che c'è**: prodotti, date, importi, destinatari,
   biglietti di quel cliente. Se gli ordini non bastano a dire i gusti, l'AI
   deve scrivere che sono pochi ordini — non riempire il vuoto;
2. **degli ordini si mandano i 24 più recenti**: la storia recente è quella che
   conta, e la scheda lo dice invece di far credere di averli letti tutti;
3. **si fa a mano, o in blocco con un numero scelto**: ogni cliente è una
   chiamata a pagamento, e 10.000 clienti non si riassumono per sbaglio. Dalla
   pagina Clienti si scrivono i mancanti partendo da chi ha speso di più, cinque
   o cento alla volta; se il tempo sta per scadere il giro si ferma da solo e
   dice a che punto è arrivato;
4. **cosa esce dall'azienda**: titoli dei prodotti, date, importi, nomi dei
   destinatari e testo dei biglietti di quel cliente. Non l'email, non il
   telefono, non l'indirizzo.

### Script (`/script`)
Uno **script** è un testo da mandare ai clienti, scritto una volta e riusato
dalle automazioni: il messaggio di riordino, l'invito per una ricorrenza, il
ringraziamento dopo il primo acquisto. Vive per conto suo perché un testo che
parla ai clienti si rilegge, si corregge e lo si fa correggere da qualcun altro
— non si nasconde dentro un'automazione.

**Le variabili** si scrivono fra doppie graffe e sono di due specie:

- **del cliente**, sempre disponibili e riempite dall'app: `{{nome}}`,
  `{{citta}}`, `{{brand}}`, `{{ultimo_ordine}}`, `{{giorni}}`, `{{ordini}}`,
  `{{speso}}`;
- **dichiarate nello script**: uno sconto, una data, il nome di una collezione.
  Ognuna ha un nome (`sconto`), un'etichetta per chi la compila («Sconto
  riservato»), un **valore predefinito** e la spunta **obbligatoria**. Ogni
  automazione che usa lo script sceglie il proprio valore, così lo stesso testo
  serve a gennaio e a febbraio senza riscriverlo.

Tre regole che evitano i danni:

1. una variabile **obbligatoria senza valore blocca** la preparazione dei
   messaggi. Meglio un'automazione ferma che cinquecento messaggi con scritto
   «{{sconto}}»;
2. una variabile **che nessuno riempirà** (un refuso, o una dichiarata mai) è
   segnalata in rosso sia sullo script sia sull'automazione, **prima** di
   mandare: nel messaggio resterebbe scritta com'è;
3. i **dati del cliente vincono sempre**: nessun valore può sovrascrivere
   `{{nome}}` con una costante.

La scheda dello script dice anche quali variabili sono usate nel testo, quali
sono dichiarate ma mai usate (di solito un refuso) e quali automazioni lo
stanno usando. Eliminando uno script le automazioni **non** spariscono con lui:
restano senza script e lo dicono.

### Automazioni (`/automazioni`)
Messaggi ai clienti di una lista: «torna a ordinare», «è passato un anno», «ti
aspettiamo per San Valentino». Un'automazione è fatta di quattro cose: una
**lista** (le stesse del catalogo), un **canale** (WhatsApp, email,
telefonata), uno **script** con i valori scelti per le sue variabili, e i
**guardrail**.

Lo script si sceglie da un elenco; chi non vuole crearne uno può ancora
scrivere il testo direttamente sull'automazione (ed è quello che succede alle
automazioni nate prima che gli script esistessero).

I quattro setacci, nell'ordine:

1. **consenso** per quel canale (si può togliere solo per i messaggi di servizio
   su un ordine in corso, mai per una promozione — e resta scritto che è stato
   tolto);
2. **recapito** presente (email o telefono, secondo il canale);
3. **silenzio**: nessun altro messaggio, di *nessuna* automazione, negli ultimi
   N giorni — il modo più veloce per farsi bloccare è scrivere due volte in una
   settimana;
4. **limite del giro**: quante persone al massimo in una volta.

La scheda mostra sempre la **prova a vuoto**: quanti messaggi verrebbero
preparati adesso, **quanti restano fuori e perché** (con i motivi contati uno
per uno) e come suonerebbero i primi tre, coi dati veri di quelle persone.

**L'automazione non invia da sola.** Prepara i messaggi, uno per cliente, e
quelli restano lì: si controllano, si esportano in CSV, si mandano dal Customer
Service (che è l'app che parla con WhatsApp) e poi si segnano come inviati. È
una scelta, non un pezzo mancante: un errore su una lista da duemila persone non
si corregge dopo, e l'app non deve poter dire di aver inviato ciò che non ha
inviato.

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

### Ordini problematici (rimborsi parziali)
Un ordine è **problematico** quando i soldi non tornano e serve un occhio umano.
Oggi il caso è uno solo: il **rimborso parziale** (`PARTIALLY_REFUNDED`) — 89
ordini per 13.815 EUR sul registro attuale.

Perché proprio quello: un ordine annullato si vede (è barrato) e uno rimborsato
del tutto è una vendita che non c'è più; il rimborso *parziale* invece resta in
piedi e sembra un ordine normale, ma **una parte del denaro è tornata al cliente
e quanta non si sa** — Shopify tiene sul nostro registro il totale dell'ordine,
non l'importo reso. Quindi ogni conto che lo tocca è sbagliato in eccesso, e
dietro c'è quasi sempre una storia (un pezzo mancante, una consegna andata male,
un accordo).

Dove si vede: badge arancio **⚠ Rimborso parziale** nelle colonne per brand e
nell'elenco, riquadro dedicato nella scheda dell'ordine, e un riquadro in cima
alla pagina Ordini — «Rimborsi parziali da verificare» — che è una **coda di
lavoro** e conta su tutto il registro, non sul filtro attivo. Filtro dedicato:
*Solo problematici da verificare*, *già verificati*, *tutti*.

**Il marchio non si toglie a mano**: dipende dallo stato del pagamento su
Shopify e resta finché resta quello (se Shopify cambia idea, cambia anche il
marchio — il motivo non viene mai salvato nel database, si ricalcola sempre).
Quello che una persona può dire è «l'ho guardato», con una nota: l'ordine esce
dalla coda, il badge diventa grigio «✓ verificato» e la nota resta scritta per
chi passa dopo. Ogni verifica lascia una riga nella *Storia* dell'ordine.

Nelle API l'ordine porta con sé `problema: { problematico, motivi, gestito, nota }`:
i motivi sono in chiaro, così un'app a valle può dirlo a un operatore senza
conoscere i codici di Shopify.

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
`/api/v1/ordini/:id`, `/api/v1/stati`, `/api/v1/liste`, `/api/v1/liste/:chiave`,
`/api/v1/clienti`, `/api/v1/clienti/:cliente`, `/api/v1/ricavi`,
`/api/v1/marketing`). Chi ha una chiave di scrittura può anche riclassificare
(`PATCH /api/v1/ordini/:id`). Dettaglio in `README.md`.

### Quanto vale ogni canale (`/api/v1/marketing`)
L'app Marketing sa quanto ha **speso** per canale; qui trova quanto ha
**incassato** — e soprattutto il taglio che nessuna dashboard pubblicitaria sa
dare: **di quegli ordini, quanti sono di gente che avrebbe comprato comunque.**
Un canale che porta solo clienti che tornavano già non sta acquistando niente:
sta rifatturando la fedeltà.

Per ogni canale: ordini, lordo, i dodici mesi, e lo split `primi` (clienti mai
visti prima) / `daRepeater` / `nonAttribuibili`. In più le **campagne per nome**
(«[Deluxy] - Fiori Milano»), che è la riga con cui si riconcilia la spesa
pubblicitaria col venduto.

Sul 2026 (3.419 ordini, 602.160 €): **Google Ads** 792 ordini e 144.499 € di cui
**701 da clienti nuovi**; la ricerca non pagata 838 ordini e 121.683 €; il
traffico diretto 783 ordini, ma con 316 ordini su 783 fatti da clienti che
tornavano. La campagna «Brand Protection» ha 43 ordini di cui **21 nuovi**: metà
di quella spesa raggiunge chi ci cercava già per nome — è esattamente il tipo di
cosa che non si vede finché qualcuno non la conta.

Due precisazioni che cambiano i numeri:

- **il cliente nuovo si conta prima di tagliare il periodo**: se si guardasse
  solo l'anno in corso, il secondo ordine di un cliente del 2024 risulterebbe un
  cliente nuovo. La numerazione si fa su tutta la storia e solo dopo si taglia;
- **annullati e rimborsati restano fuori**, come nel venduto, e la risposta
  dichiara quanti sono (141 ordini, 32.438 € nel 2026).

Sull'elenco degli ordini c'è il filtro `canale=`: una chiave (`google-ads`,
`ricerca`…), `pagato` per tutti i canali che ci sono costati qualcosa, o
`sconosciuto` per la coda di ordini di cui non sappiamo la provenienza.

### Chi è questo cliente (`/api/v1/clienti`)
Il riassunto scritto dall'AI non resta chiuso qui dentro: esce con le API, così
quando squilla il telefono o arriva un reclamo l'app che lo riceve non deve
indovinare chi c'è dall'altra parte. `GET /api/v1/clienti` dà l'elenco con
`riassunto` e `gusti` per ognuno; `GET /api/v1/clienti/:cliente` dà la scheda
completa, **punti compresi**, e accetta l'identificatore base64url oppure
l'email in chiaro. Le liste possono portarselo dietro con `riepilogo=si`, così
chi sta per scrivere a una lista sa a chi sta scrivendo.

Due cose dette apposta nella risposta:

- **`riepilogo: null` vuol dire «non l'abbiamo ancora scritto», non «questo
  cliente non ha preferenze»**. La differenza conta: la prima è ignoranza
  nostra, la seconda sarebbe un'affermazione sul cliente. L'elenco dichiara
  anche `riepiloghiScritti`, quanti ne esistono in tutto;
- **`aggiornato` e `ordiniNuoviDaAllora`**: se il cliente ha ordinato dopo
  l'ultima scrittura, quel testo descrive una persona un po' più vecchia di
  quella che si ha davanti, e chi legge deve poterlo sapere.

Non c'è un filtro «dammi solo quelli col riassunto»: applicarlo dopo la
paginazione restituirebbe pagine mezze vuote fingendo di aver selezionato
qualcosa.

### Il venduto per periodo (`/api/v1/ricavi`)
Chi ragiona per mese e non per singolo ordine — il **consuntivo di Budgets**, per
dire, che da qui prende il canale D2C — non deve scorrere l'archivio: chiede il
**totale per brand e per mese** e la somma la fa il database. A pagine di 200
ordini un anno sarebbero decine di chiamate per un unico numero.

Cosa entra e cosa no, dichiarato nella risposta invece che dato per scontato:
- **fuori gli annullati**, come in tutte le API di qui;
- **fuori i rimborsati e gli storni** (REFUNDED, VOIDED): i soldi sono tornati
  al cliente, non sono fatturato;
- **dentro per intero i rimborsati in parte**: Shopify non salva quanto è stato
  reso, quindi il dato si dichiara (`esclusi.parzialmenteRimborsati`) invece di
  essere corretto a occhio;
- gli importi sono il **totale Shopify: IVA e spedizione incluse**. L'aliquota
  non sta sull'ordine, quindi qui non si scorpora niente — chi confronta con un
  fatturato imponibile sceglie l'aliquota e la mostra nella propria pagina.

I mesi sono mesi di calendario **italiani** (`Europe/Rome`): un ordine delle
00:30 del 1° gennaio è di gennaio, non di dicembre.

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
