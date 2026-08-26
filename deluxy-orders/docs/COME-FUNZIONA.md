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

**Lo stato del Customer Service e il margine, subito nell'elenco.** Su ogni
ordine (in tutt'e due le viste) compare la pill **«CS: <stato>»** — come il
Customer Service sta lavorando l'ordine (Da iniziare, Ricerca fornitore, In
pagamento, In comunicazione, Attesa consegna, Gestito) — accanto alla pipeline
di Orders, da cui è **distinta**: la prima dice *come lo evadiamo*, la seconda
*a che punto è nel registro*. Per gli ordini **chiusi** dal Customer Service
(stato «Gestito») si vede anche il **margine reale, in euro e in percentuale**
(chip verde se positivo, rosso se negativo). Il valore è **al netto dell'IVA**:
alla differenza fra prezzo e costo si toglie l'IVA (scorporo ÷ 1,22), perché
l'IVA non è profitto. La **percentuale** è quel margine netto rapportato al
**totale pagato dal cliente** (`margine ÷ totale`): 81,97 € su un ordine da
250 € sono il **32,8%**, e con la quota del 60% l'atteso non è 40% ma 32,8%
(vedi `/margini`). Un ordine chiuso ma senza il costo del fornitore mostra **«margine n/d»**, non uno zero che sembrerebbe «nessun margine». Lo
stato arriva dal Customer Service e il costo pure (è lui che lo concorda col
fornitore): Orders li riceve e qui li mostra.

**Filtro per anno.** Fra i filtri c'è **l'anno dell'ordine** (solo gli anni in
cui c'è davvero almeno un ordine: 2020…2026, non un elenco inventato).
Cambia l'elenco *e* i due numeri in cima — quanti ordini e quanto valgono — che è
il modo più corto di chiedere «quanto abbiamo fatto nel 2025» senza scrivere due
date. Vale anche nelle colonne per brand, nella ricerca e nelle API
(`?anno=2025`). L'anno è quello **italiano**: `Ordine.data` è UTC, e tagliare sul
1° gennaio di Greenwich metterebbe l'ultima ora del 31 dicembre nell'anno dopo.
Convive con `da`/`a` invece di sovrascriverli. Verificato sui dati veri: 2025 =
**4.640 ordini · 845.505,69 €**, che è esattamente quello che l'Analisi conta per
lo stesso anno per un'altra strada (4.490 validi + 118 annullati + 32 rimborsati).

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

### La riconciliazione: la città che il registro sa e non diceva
**3.315 ordini non avevano la città di consegna** — non perché non si sapesse
dove andavano, ma perché quel dato era finito da un'altra parte: nei **tag**
dell'ordine («Roma», «Milano», e sono 1.986 e 1.386 ordini) o dentro il **nome
del prodotto** («Colazione Alassio», «Torta per 10 Roma», «15 cupcake roma»).

Il pulsante **Riconcilia città e categorie**, in Impostazioni, li rimette
insieme. Sui dati veri: **894 ordini** hanno ora una città — 571 dai tag, 323
dal nome del prodotto — e ne restano 2.421 senza, che è una risposta onesta.

Tre regole, e sono il motivo per cui ci si può fidare:

1. **una città dedotta non diventa mai l'indirizzo di consegna.** Vive in un
   campo suo, il tag in pagina si vede diverso (📍? invece di 📍) e sotto il
   mouse dice da dove viene: «presa dai tag — “Roma”». Un indirizzo è un impegno
   con un fattorino davanti; una deduzione serve a contare e a cercare;
2. **il vocabolario delle città non è inventato**: sono le 239 città in cui
   abbiamo consegnato davvero, prese dagli indirizzi veri. Cresce da sé e non
   contiene posti dove non siamo mai stati;
3. **la controprova sui nomi dei prodotti.** «Bouquet Tulipani Rosa e Magenta»
   nomina un comune vicino a Milano, ma Magenta lì è un colore. Non lo si
   indovina: si guarda dove sono andati *davvero* quegli stessi prodotti negli
   ordini che l'indirizzo ce l'hanno. «Bouquet Venezia» è finito **21 volte su
   21 fuori Venezia** — quindi nei titoli Venezia non è una destinazione, e non
   le si crede. Le parole bocciate dai fatti: Capri, Dubai, Magenta, Monza,
   Napoli, Sorrento, Venezia. 34 deduzioni scartate così.

**Stessa storia per le categorie**, ma la deduzione dai tag sta *dentro* il
ricalcolo, non accanto: la catena è titolo del prodotto → proposta dell'AI →
**tag dell'ordine** → specialità del negozio → «non classificato». Un tag dice
come il negozio chiama quell'ordine, non che cosa c'è nella scatola: per questo
vale meno del titolo e più della specialità. Risultato: gli ordini «non
classificati» sono passati da **2.525 a 607**.

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

**Anni e mesi si scelgono in un clic.** Sotto i filtri ci sono due file di
pillole: gli **anni** che esistono nel registro (2020…2026) e i **mesi**
dell'anno che si sta guardando. Un anno porta all'anno intero, un mese a quel
mese: qualunque periodo è a **due clic** — prima l'anno, poi il mese — mentre con
le frecce «giugno 2024» erano venticinque. La fila dei mesi segue l'anno scelto,
e l'anno di cui si sta guardando un mese resta segnato (davanti a «marzo 2025» la
pillola *2025* è accesa in grigio, *mar* in nero). I **mesi non ancora
cominciati** si vedono spenti e non si possono cliccare: risponderebbero zero e
sembrerebbe un crollo. Il confronto scelto, il negozio e la dimensione non si
perdono; un periodo scritto a mano nelle due date viene annullato dalla scelta
rapida, perché sono due modi di chiedere la stessa cosa.

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

### Marketing (`/marketing`)
Quanto vende ogni **canale di provenienza** — Google Ads, ricerca non pagata,
diretto, email, social — e, accanto, **che tipo di clienti** porta. Le due metà
vanno insieme: un canale che porta solo gente che tornava già non sta acquistando
niente, sta rifatturando la fedeltà, e in una tabella di soli euro sembrerebbe il
migliore di tutti.

Sul **2026** (numeri veri al 30/07/2026, tutto lo storico del periodo):

| canale | venduto | quota | clienti nuovi |
| --- | --- | --- | --- |
| Diretto | 149.738 € | 24,5% | 60% |
| Google Ads *(a pagamento)* | 145.194 € | 23,7% | 89% |
| Ricerca non pagata | 124.480 € | 20,3% | 88% |
| Ordine creato a mano | 107.967 € | 17,6% | 71% |
| Provenienza sconosciuta | 50.697 € | 8,3% | — |
| Email | 9.243 € | 1,5% | 21% |

Tre righe da leggere con la testa, e la pagina le spiega dov'è il caso:

- **«Ordine creato a mano» non è un canale di traffico**: sono ordini presi al
  telefono, su WhatsApp o di persona. È venduto vero, ma non si confronta con
  Google;
- **«Provenienza sconosciuta» resta lì**: Shopify non ha associato nessuna
  visita. Non viene spalmata sugli altri canali — sarebbe un numero comodo e
  falso;
- **l'attribuzione è al primo contatto**: chi ci ha trovati con Google Ads e poi
  è tornato scrivendo l'indirizzo resta Google Ads.

#### Acquisizione o fedeltà: dove vanno i soldi di ogni canale (03/08/2026)
La tabella qui sopra dice **quanti ordini** sono di clienti nuovi. Questa dice
**quanti euro** lo sono, che non è la stessa cosa e quasi mai lo stesso numero:
chi torna spende di più, quindi un canale può fare l'80% di ordini da clienti
nuovi e metà del fatturato da clienti che tornavano già.

Per ogni canale: venduto da clienti nuovi, venduto da clienti di ritorno, **lo
scontrino delle due metà** e la quota di acquisizione. Misurato su deluxy.it,
25–31 luglio 2026:

| canale | da clienti nuovi | scontrino nuovi | da clienti di ritorno | scontrino ritorno |
| --- | --- | --- | --- | --- |
| Diretto | 2.690 € (8 ordini) | 336 € | 4.030 € (4 ordini) | **1.007 €** |
| Ordine creato a mano | 2.174 € (8) | 272 € | 95 € (2) | 48 € |
| Google Ads | 1.240 € (10) | 124 € | 220 € (1) | 220 € |
| **Totale** | **6.894 € (33)** | 209 € | **5.291 € (11)** | 481 € |

È il taglio che una dashboard pubblicitaria non sa dare: Google Ads acquista
davvero (85% del suo venduto è di clienti nuovi) ma con uno scontrino da 124 €,
mentre il *Diretto* sembra il canale più grosso solo perché ci torna chi spende
1.007 € a ordine.

⚠️ **Le due colonne non fanno il totale del canale, e deve restare così**: gli
ordini senza email, telefono né nome non stanno né di qua né di là (nell'esempio
545 €). Si dichiarano sotto la tabella invece di spalmarli: chi ha comprato non
si indovina. Le stesse tre cifre escono da `GET /api/v1/marketing` come
`lordoPrimi`, `lordoDaRepeater`, `lordoNonAttribuibili` — chi calcola un costo di
acquisizione deve usare `lordoPrimi`, non `lordo`.

#### Da quale strumento arrivano — e dov'è Klaviyo
Sotto il canale c'è lo **strumento**: quello che c'è scritto nel link
(`utm_source`) o il sito da cui è arrivata la persona. **Klaviyo è visto, ma come
«Email»**: il canale mette insieme Klaviyo, Shopify Email e le newsletter, e
questa tabella li separa. Sul 2026: **Klaviyo 5.797 € su 36 ordini, di cui solo
il 22% clienti nuovi** — che è esattamente cosa ci si aspetta da un canale che
parla a chi ha già comprato. Accanto, `shopify_email`, `adwords` (Google Ads),
`chatgpt.com`, `l.wl.co` (WhatsApp).

La riga più grande è quasi sempre **«nessun link tracciato»**, ed è normale: chi
arriva da Google o scrivendo l'indirizzo non porta nessun `utm_*`.

⚠️ **La pagina avvisa da sola quando un confronto non è leale.** Se fra i due
periodi cambia quanta parte degli ordini portava un link marcato, compare un
avviso: sul 2026 il **27%** degli ordini aveva un `utm_*` contro l'**1%** del
2025, quindi «Google Ads +8.785%» dice soprattutto che nel 2025 quei clic non
erano marcati e finivano in *Ricerca* o *Diretto*. Senza quell'avviso sarebbe una
notizia commerciale inventata.

**Quello che qui NON c'è: la spesa.** Quanto è costato ogni canale lo sa l'app
Marketing (deluxy-marketing), non il registro degli ordini: finché le due non si
parlano, questa pagina misura il **fatturato per canale**, non il ritorno. Gli
stessi numeri escono già da `GET /api/v1/marketing`, che l'app ADV legge — un
motore solo (`src/lib/canali.ts`) per pagina e API, così non raccontano due
storie diverse.

### Margini (`/margini`)
Quanto **resta** di un ordine dopo aver pagato il fornitore. È la domanda che il
venduto non risponde: 86.000 € di ordini con che margine?

**La regola della pagina: si misura solo dove il costo c'è.** Il costo del fioraio
non sta nell'ordine Shopify — nessuno lo scrive lì — quindi entra dal
[Controllo](#controllo-controllo): si abbina l'addebito in banca all'ordine. Dove
il costo manca, quell'ordine **non entra nel conto**, e accanto a ogni numero la
pagina scrive su quanti ordini è calcolato. Un margine del 48% misurato su un
ordine su dieci è un'informazione diversa da un margine del 48% su tutti, e
spalmare una media sui mancanti darebbe un numero preciso e falso.

I numeri, sul periodo scelto (settimane/mesi/anni, con le stesse pillole di anni e
mesi della pagina Analisi):

- **margine misurato** in euro e in percentuale, e il **costo fornitore** con la
  sua quota del valore;
- **copertura della misura**: quanti ordini e quanto venduto sono misurati. Al
  30/07/2026, sul 2026: **318 ordini su 3.469 (9%)**, 26.213 € di margine su
  54.663 € di venduto misurato → **48,0%**;
- **margine atteso**, dichiarato come *ipotesi*: quello che verrebbe se ogni
  ordine costasse la quota di riferimento (60%). Serve a dare l'ordine di
  grandezza di ciò che non è misurato, non a far finta di saperlo;
- **sopra la quota**: quanti ordini abbiamo pagato più del concordato;
- un riquadro **«cosa non è misurato»** che scrive quanti ordini e quanti euro
  restano fuori. Non si nasconde: è la coda di lavoro.

**Dove si fa il margine**: gli stessi numeri per **negozio**, **categoria di
prodotto**, **fornitore pagato**, **città**, **tempo di consegna**, **canale** e
**mese**. Ogni riga porta la sua copertura, perché due righe con lo stesso margine
e coperture diverse non valgono uguale. Numeri veri sul 2026: deluxy.it 52,9% ·
Flowers 44,1% · cakedesign.me 45,6%.

**Pagati sopra la quota — da guardare**: l'elenco degli ordini su cui abbiamo
pagato più del 60%, ordinati per **quanto ci sono costati in più**, non per
percentuale: il 90% su un ordine da 30 € pesa meno del 70% su uno da 900 €.

**Il margine è al netto dell'IVA.** `totale` è il totale Shopify (IVA e
spedizione incluse), ma il margine reale non è profitto finché non se ne toglie
l'IVA: si **scorpora** (÷ 1,22), non si sottrae il 22%. ⚠️ Su richiesta
dell'utente (24/08/2026) si usa **un'aliquota unica del 22% su tutto** — anche
fiori e torte, che in Italia sarebbero di norma al 10% (scelta consapevole, dopo
averlo segnalato). La **percentuale** del margine non cambia con lo scorporo
(l'IVA colpisce ricavo e costo alla stessa aliquota): cambia solo il valore in
euro. Se un giorno serve l'aliquota per categoria, si cambia in un posto solo
(`controllo.ALIQUOTA_IVA`).

**⚠️ IL MARGINE DELL'ORDINE LO CALCOLA LA PIATTAFORMA CONSEGNE (26/08/2026).**
Dove c'è, Orders mostra `margineFinale` — il conto della piattaforma, non il
proprio:

    primo margine = (pagato dal cliente − valore prodotti dato al partner) ÷ 1,22
    margine finale = primo margine + fee della vendita − costo del valet
                     − commissione d'incasso

Il pezzo che Orders **non può sapere** è il primo: il *valore dato al partner*
sta scritto sulla consegna (`Delivery.productValue`), non nel registro.
Rifacendo il conto con `costoFornitore` uscivano numeri più alti — **#12805:
81,97 € contro 52,88 € veri**, **#12802: 163,93 € contro 69,49 €** — perché al
posto del valore al partner c'era un campo spesso vuoto: **410 ordini su 14.411
hanno un `costoFornitore`, 10.053 hanno il margine della piattaforma**.

Il calcolo del registro resta come **ripiego**, solo per gli ordini che la
piattaforma non conosce, e la nota sotto il numero dice sempre da dove viene
(«margine della piattaforma consegne» oppure «conto del registro: la
piattaforma non ha questo ordine»). ⚠️ Il campo è **obbligatorio** nella firma
di `margineOrdine()`: se fosse opzionale, un chiamante distratto compilerebbe
lo stesso e ricadrebbe in silenzio sul conto vecchio.

⚠️ **La commissione d'incasso si detrae SEMPRE dal margine (26/08/2026,
decisione dell'utente).** Nel numero della piattaforma è già dentro; nel
**ripiego del registro** si sottrae qui, dopo lo scorporo IVA (è un costo
pieno, come fa la piattaforma). Quando la commissione **non è nota** — l'ordine
è pagato con carta o PayPal ma nessuno ha mandato la tariffa — il margine esce
comunque ma **dichiarato parziale**: «senza la commissione d'incasso», mai
fingere che incassare sia gratis. Il contante e il bonifico valgono zero per
definizione (gateway `Cash on Delivery`, `manual`, `Bank Deposit`). Oggi i
ripieghi sono 26, tutti carta/PayPal senza tariffa: spariranno quando le
tariffe d'incasso vivranno in Orders.

⚠️ **Anche gli AGGREGATI leggono il margine della piattaforma (26/08/2026).**
`/margini` non somma più `costoFornitore`: somma il **margine riga per riga**,
con la stessa regola della scheda ordine — quello della piattaforma dove c'è, il
ripiego del registro dove manca. Il costo del fornitore, per il confronto con la
quota, si **ricava** dal primo margine (`valore al partner = totale −
primoMargine × 1,22`), perché sugli ordini della piattaforma `costoFornitore` è
quasi sempre vuoto.

⚠️ **La regola è scritta due volte** — in `margineOrdine()` per la singola scheda
e in SQL dentro `margini.ts` per gli aggregati, perché lì il conto gira su
decine di migliaia di righe raggruppate e caricarle in memoria non è
un'opzione. Toccandone una va toccata l'altra: il confronto sui dati veri
(3.000 ordini a campione, JS contro SQL) deve restare a **zero differenze**.

L'effetto è grosso, ed è tutto sulla **copertura**: luglio 2026 passa da 77
ordini misurati su 453 (17%) a **430 su 453 (95%)**, e il margine da «38,9% su
14.944 € di venduto» a **31,4% su 93.802 €**. Il primo numero non era sbagliato:
era misurato su un sesto degli ordini.

⚠️ **La percentuale è sul totale che il cliente ha pagato (scelta dell'utente,
25/08/2026).** Valore e percentuale hanno **basi diverse apposta**: il valore è
netto IVA, la base è il **lordo incassato**. Un ordine da 250 € con 150 € di
costo fa **81,97 € · 32,8%** — 81,97 su 250, non su 204,92 (l'imponibile). Si
legge «di ogni 100 € incassati me ne restano 32,80, IVA e fornitore pagati»: è
il conto che chi guarda la schermata rifà a mente, e ora torna.

Due conseguenze da non dimenticare:
- **L'atteso non è più `100 − quota`.** Con la quota del 60% non è 40% ma
  **32,8%** (40 ÷ 1,22). La soglia sta in `margineAttesoPct(quota)` — un posto
  solo, come l'aliquota — e con quella sono colorati i numeri di `/margini`:
  senza scorporare anche la soglia, ogni margine risulterebbe sotto le attese e
  sarebbe rosso a torto.
- **`costo fornitore %` e `margine %` non fanno 100 fra loro**: il costo è lordo
  su lordo (60%), il margine è netto su lordo (32,8%). Non è un errore di somma,
  è la differenza fra le due basi.

### Controllo (`/controllo`)
I soldi di ogni ordine: **quello che il cliente ha pagato** e **quello che abbiamo
pagato al fornitore**. È il mestiere che si faceva in Finance
(deluxy-partner, `/ordini`), portato dove stanno gli ordini. In Finance restano i
**movimenti bancari**, che sono suoi: qui se ne tiene una copia di sola lettura e
si decide **a quale ordine appartiene** ciascuno.

Due domande, tenute separate perché hanno due risposte:

| | domanda | come si riconosce |
| --- | --- | --- |
| **Incasso** | il cliente ha pagato? | accredito di importo ~ uguale al totale |
| **Costo** | quanto ci è costato? | addebito di una **frazione** del totale (~60%) |

Da qui la regola che conta: **l'abbinamento si fa per NUMERO D'ORDINE in causale,
non per importo.** Cercare l'importo uguale funzionerebbe solo per gli incassi;
per il costo del fornitore non troverebbe mai niente.

- **% incassato** sul periodo, con la barra e il dettaglio per metodo di
  pagamento. Al 30/07/2026, tutto lo storico: **86,0%** (carte 98,5%).
- «Incassato» = carte pagate su Shopify (l'incasso è avvenuto sul gateway: il
  versamento in banca arriva a blocchi, non ordine per ordine) + ordini abbinati a
  un movimento + ordini segnati incassati a mano.
- **Come si incassa** un ordine è una scelta, e cambia se in banca c'è qualcosa da
  cercare: *incasso da riconciliare*, *ordine partner* (rientra nel conto mensile
  del partner: in banca non c'è niente da cercare, ed è il caso di deluxy.it),
  *richiesta di pagamento esterna*. Gli ordini partner **non sono un arretrato** e
  la pagina lo scrive: 1.325 ordini per 238.140 €.
- **⇄ Abbina per numero** aggancia in automatico, solo dove la corrispondenza è
  **unica** 1:1. Un numero che compare su due ordini o due movimenti resta
  «ambiguo» e non viene scritto. Sul primo giro vero: **122 costi** e 5 incassi
  agganciati, oltre a quelli che arrivavano da Finance.
- Guardia di plausibilità sui costi: un costo sta fra il **5% e il 90%** del valore
  dell'ordine. Fuori da lì l'aggancio è un caso, e un caso scritto in automatico
  dentro un margine è un numero falso che nessuno rileggerà.
- **Adotta il controllo già fatto in Finance**: prende di là lo stato dell'incasso
  e i costi già registrati (249 ordini, 23.224,47 €) e **non sovrascrive** quello
  che è stato deciso qui.

#### Far pagare un ordine: il link di Shopify
Sugli ordini non ancora incassati compare **«Link di pagamento»**: è la pagina su
cui *quel* cliente paga *quell'ordine* con la carta. È il modo più corto di
chiudere un bonifico che non arriva — si manda il link, il cliente paga, l'ordine
diventa `PAID` su Shopify e la sync lo porta qui.

Tre cose da sapere, e sono il motivo per cui è fatto così:

- **paga l'ordine che c'è già, non ne crea un altro.** L'altro modo di fare un
  link su Shopify è la *bozza d'ordine* (`draftOrderCreate` → `invoiceUrl`), ma
  quando il cliente paga **nasce un ordine nuovo**: nel registro ci sarebbero due
  ordini per una vendita sola, il vecchio resterebbe non pagato per sempre e il
  venduto risulterebbe doppio. Quel modo serve solo per far pagare **qualcosa che
  non è ancora un ordine** (vedi sotto);
- **il link non si salva.** Contiene un segreto (`?secret=…`) che vale un
  pagamento: si chiede a Shopify sul momento, si copia e si manda. Un link vecchio
  tenuto in tabella sarebbe una bugia con dentro una chiave;
- **l'app non manda niente al cliente.** Prepara il link, come le automazioni
  preparano i messaggi: a mandarlo è una persona, dal Customer Service o da dove
  preferisce. Ogni volta che il link viene chiesto resta scritto nella storia
  dell'ordine.

Se l'ordine è già pagato, o se Shopify non offre un link per quello stato, la
pagina lo dice invece di dare un indirizzo che porterebbe il cliente a una pagina
morta.

Per far pagare **qualcosa che non è ancora un ordine** — «100 rose» — c'è la
pagina [Fatti pagare](#fatti-pagare-incassa).

### Fatti pagare (`/incassa`)
Un link di pagamento per una cosa concordata al telefono: **«100 rose × 4,50 =
450 €»**. Si scrivono le righe (descrizione, quantità, prezzo), si sceglie il
negozio da cui esce il link, e ne esce un indirizzo da mandare al cliente. Quando
paga, **quella bozza diventa un ordine vero**: entra nel negozio, la sync lo porta
nel registro e da lì in poi è un ordine come tutti gli altri — con la sua
consegna, il suo margine, il suo controllo.

- **Le righe sono libere**: «100 rose» non è un prodotto a catalogo, è un accordo.
  Il totale che conta lo calcola **Shopify** (tasse e spedizione secondo le
  impostazioni del negozio); in pagina si vede anche la somma delle righe, e se i
  due numeri non coincidono vince Shopify, perché è quello che vedrà il cliente.
- **Perché una bozza e non un ordine creato subito**: un ordine non pagato
  comparirebbe **ovunque** — bacheca, consegna, Customer Service — anche se il
  cliente non paga mai. Una bozza non è un ordine finché non è pagata, ed è
  esattamente cosa significa un preventivo.
- **Lo stato non si aggiorna da solo**: «Mostra il link» lo richiede a Shopify e
  nello stesso giro scopre se nel frattempo è stato pagato (e con quale numero
  d'ordine). Il link non è salvato qui: contiene un segreto.
- **L'app non manda niente al cliente**: lo copi e lo mandi tu.
- Una bozza non ancora pagata si può **annullare**; una pagata no — non si
  disfa un incasso avvenuto.

⚠️ **Serve il permesso `write_draft_orders`** sull'app Shopify di ciascun negozio.
Al 30/07/2026 i tre negozi non ce l'hanno (hanno `read_orders`, `write_orders`,
`write_customers`), e la pagina lo dice negozio per negozio invece di far fallire
il bottone. Si aggiunge **una volta sola** nella Dev Dashboard del negozio: il
token si riconia da sé al primo uso, senza reincollare niente nell'app.

La **quota attesa del fornitore** (60% di default) si cambia in Impostazioni:
pagare sotto è bene, sopra è male. Non serve a *calcolare* un costo — quello si
registra ordine per ordine — ma a segnalare gli scostamenti.

Sulla **scheda di ogni ordine** c'è il riquadro «I soldi di questo ordine»: stato
dell'incasso, movimento abbinato, costo con la quota pagata, margine, e il campo
per scrivere il costo a mano.

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
  Customer Service), stato (aperto, in lavorazione, risolto, chiuso) e il tipo
  di soggetto a cui è imputata la colpa (valet, partner, azienda…);
- **voti**: il giudizio 1-5 dato da una persona su un valet o un partner,
  quando è legato a quell'ordine, con il canale da cui è arrivato.

Arrivano da **deluxy-messaging (Customer Service, porta 3140)** via
`GET /api/v1/feedback` con chiave di sola lettura. Dal **24/08/2026** qui non
c'è più una copia: c'è il **riferimento coi codici** — l'identità nel Customer
Service, l'aggancio all'ordine e i codici per contare e riconoscere il caso
(tipo, stato, casistica, colpa, gravità, voto, origine). Il racconto completo —
chi è il cliente, cosa ha scritto, cosa è stato fatto, com'è finita — **vive
solo nel Customer Service**, che è la fonte: la scheda lo dice e ci rimanda.
L'import gira ogni notte insieme alla sincronizzazione da Shopify, ed è
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

### Lo stato di lavorazione del Customer Service (24/08/2026)
Sulla scheda dell'ordine, sopra la pipeline «Stato», può comparire la scheda
**«Customer Service — lavorazione»**: come il Customer Service (deluxy-messaging)
sta lavorando *quest'*ordine — `da gestire`, `in pagamento`, `in comunicazione`,
`ricerca fornitore`, `in attesa di consegna`, `gestito` — con **chi** l'ha
deciso e **quando**.

- **Non è la nostra pipeline.** «Stato» qui sotto è dove sta l'ordine nel
  *registro* (Nuovo, Da smistare, …); questa scheda è come lo si *evade*, ed è
  **deciso dal Customer Service** (è lui che parla col cliente e col fornitore,
  Standard §7.2). Orders lo **mostra soltanto**: è una copia di sola lettura, la
  fonte resta il Customer Service.
- **Compare solo quando c'è.** Finché il Customer Service non l'ha comunicato, la
  scheda non si vede: uno stato inventato sarebbe peggio di nessuno stato.
- **Da dove arriva.** Il Customer Service lo *propone* a Orders via
  `PATCH /api/v1/ordini/:id` (campo `csGestione`), lo stesso canale con cui gli
  manda il costo del fornitore. Un vocabolario nuovo aggiunto di là non sparisce
  qui: uno stato che Orders non conosce si mostra comunque, reso leggibile.

### Le due strade dell'evasione, e chi comanda quando si incrociano (25/08/2026)
Un ordine si evade per **una** di due strade, e il registro tiene il conto di
quale:

- **Fornitore diretto** (`evasione = fornitore_diretto`): il Customer Service
  trova il fioraio o la pasticceria in chat e consegna lui. Lo propone il CS via
  `PATCH /api/v1/ordini/:id`, insieme al costo.
- **Piattaforma consegne** (`evasione = piattaforma`): la piattaforma pesca
  l'ordine, lo smista a un partner e — **quando il partner accetta** — rimanda
  indietro il costo, e poi la consegna. Questa parola la scrive **solo** il
  ritiro (`src/lib/piattaforma.ts`), mai il Customer Service: due mani sullo
  stesso campo con la stessa parola sono un conflitto che non si vede.

⚠️ **Le due strade si incrociano davvero.** Può succedere che la piattaforma
abbia già in mano un ordine e che il Customer Service se lo *riprenda* in chat
(caso #2790 del 24/08/2026: vendita ferma sulla piattaforma alle 9:54,
lavorazione e costo decisi dal CS tre ore dopo). In quel caso **la mano batte il
ritiro**, come già succede per il costo: il ritiro **non** riscrive
`fornitore_diretto` con `piattaforma`, e lascia una riga nella **storia
dell'ordine** («Conflitto di strada: la piattaforma ha una vendita … su un
ordine già evaso per fornitore diretto»). I conflitti si contano in
Impostazioni, sotto «Ordini su due strade»: non è un errore da nascondere, è una
cosa che qualcuno deve guardare.

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

### Aprire lo stesso ordine nel Customer Service (25/08/2026)
Sulla scheda dell'ordine, accanto a «Cerca fornitore» e «Apri su Shopify», c'è
**«Apri nel Customer Service»**: porta all'archivio ordini di deluxy-messaging
(`/ordini-globali`) già filtrato su quel numero. Si va sull'**archivio** e non
sulla lista di lavoro perché là ci sono anche i gestiti e i rimborsati, che
dalla lista di lavoro spariscono apposta — e chi arriva da qui cerca un ordine
preciso, non la giornata.

- **Il bottone c'è sempre**, anche quando la scheda «Customer Service —
  lavorazione» non compare: il motivo per andare là è spesso proprio che qui non
  risulta nulla.
- ⚠️ **È una ricerca, non un identificativo.** Gli id del Customer Service qui
  non si conoscono, e non si vanno a leggere dal suo database (ogni dato ha una
  casa sola). Si passa il numero **col cancelletto** — `#12649`, non `12649` —
  perché la ricerca là fa `contains`: senza, «2792» pescherebbe anche «#12792».
  Resta un caso che il link non chiude: **lo stesso numero può esistere su più
  negozi**, quindi il suggerimento del bottone dice di controllare il brand
  della riga.
- Se `MESSAGGI_URL` non è impostata il bottone **non compare**: meglio nessun
  bottone che uno che porta a un indirizzo vuoto.

### Impostazioni (`/impostazioni`)
- **Il giro dell'ordine (piattaforma consegne)** (25/08/2026): quanto è vivo il
  giro, **contato adesso sul registro** e non ricordato — ordini smistati dalla
  piattaforma, quanti hanno avuto il **costo di ritorno** (è metà del margine:
  se questo numero è zero mentre gli smistati non lo sono, il giro è partito e
  si è **fermato a metà**, e lo dice in rosso), quanti sono **consegnati**,
  quanti sono stati evasi da **fornitore diretto** (e di questi quanti hanno il
  costo), quanti sono gli **ordini su due strade**. In fondo, la data
  dell'ultima notizia arrivata dalla piattaforma. ⚠️ Questa scheda esiste
  perché l'esito del ritiro viveva **solo** nel JSON del cron, che non legge
  nessuno: per un mese i documenti hanno continuato a dire «il ritiro legge un
  elenco vuoto» mentre aveva già smistato 65 ordini.
- **Negozi Shopify**: aggiunta/rimozione, attiva/sospendi, tipo di
  autenticazione, ultima sync e **colore del brand** (quello con cui l'ordine
  si riconosce a colpo d'occhio in elenco e colonne). Pulsante «Sincronizza ora».
- **Pipeline degli stati**: crea/modifica/elimina stati (nome, colore, ordine,
  quale è predefinito e quali sono «di chiusura»). Eliminare uno stato lascia i
  suoi ordini «senza stato», non li cancella.
- **Etichette**: crea/elimina etichette colorate.
- **Chiavi API**: si creano **dall'app** (30/07/2026). Si scrive il nome
  dell'app che la userà, si sceglie il permesso, e la chiave compare **una volta
  sola** in un riquadro da copiare — nel database resta solo la sua impronta
  SHA-256, quindi non è recuperabile da nessuno, nemmeno da chi l'ha creata. Il
  riquadro non sparisce da solo: si chiude a mano, perché chi non fa in tempo a
  copiarla deve rigenerarla.
  - una chiave per app: così si vede **chi chiama** (colonna «ultimo uso»), si
    sospende una sola app quando serve e si rigenera senza toccare le altre;
  - **Rigenera** fa una chiave nuova per la stessa app: quella di prima smette di
    funzionare all'istante. **Elimina** toglie l'accesso. Tutt'e due chiedono
    conferma sullo stesso bottone («Confermi?»), perché interrompono un'altra app
    con un clic;
  - **sospendi/riattiva** dal badge di stato: la chiave resta, l'accesso no;
  - **sola lettura** basta a quasi tutti (ordini, clienti, liste, ricavi,
    marketing). **Lettura + scrittura** serve solo a chi deve *riclassificare* un
    ordine via `PATCH`: oggi nessuno, e una chiave di scrittura in giro prima o
    poi qualcuno la usa;
  - la riga di comando resta e fa la stessa cosa, dallo stesso motore
    (`src/lib/chiavi.ts`): `npm run chiave -- deluxy-search [--scrittura]
    [--rigenera]`.

  ⚠️ La chiave in chiaro **non passa mai da un indirizzo**: torna nel valore
  dell'azione, non in una querystring. Un segreto in un URL finisce nella
  cronologia del browser e nei log del server, dove resta per sempre e nessuno lo
  va a cercare.

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

## La finestra della sincronizzazione guarda l'ULTIMA MODIFICA (26/08/2026)
La sync chiede a Shopify gli ordini **modificati** da una certa data
(`updated_at:>=`), non quelli *creati*. Prima guardava la creazione, e questo
lasciava fuori un caso preciso: **un ordine annullato molto tempo dopo essere
stato creato non veniva mai riletto**. Il giro dei 15 minuti guarda 2 giorni,
quello notturno 90: chi annulla a gennaio un ordine di ottobre restava «valido»
per sempre nel registro.

Non è teoria: su **388 annullati**, **75** sono arrivati oltre due giorni dopo
l'ordine e **7 oltre i 90 giorni** — il record è un annullamento **1.043 giorni
dopo**. Erano nel registro solo perché a un certo punto è stato fatto un import
completo dello storico.

Il costo è stato **misurato sui tre negozi veri** prima di cambiare: su una
finestra di 7 giorni entrano **99 ordini invece di 87**, dodici in più — quelli
creati prima e toccati dopo (pagamento, evasione, annullamento, tag). La sync
riscrive solo ciò che è **davvero cambiato**, quindi rileggerli non fa danni:
la prima passata col criterio nuovo ha aggiornato **4 ordini** e non ne ha
creato nessuno.

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
`/api/v1/marketing`, `/api/v1/province`, `/api/v1/quota-fornitore`). Ogni ordine
porta il blocco `customerService { gestione, etichetta, da, il }` — lo stato di
lavorazione deciso dal Customer Service, `null` finché non l'ha comunicato. Chi
ha una chiave di scrittura può **riclassificare** (`PATCH /api/v1/ordini/:id`) e
**proporre lo stato di lavorazione** (`csGestione`) o il **costo del fornitore**
(`costoFornitore`, da cui Orders calcola il margine). Dettaglio in `README.md`.

### La città dedotta esce a parte (`cittaDedotta`, 03/08/2026)
`spedizione.citta` è la città dell'**indirizzo**: quella vera. Accanto, quando
l'indirizzo non la dice, c'è la città **ricavata dai tag dell'ordine o dal nome
del prodotto** — 894 ordini al 03/08/2026, 571 dai tag e 323 dal prodotto, tutti
senza città vera:

```json
"spedizione": { "citta": null, "provincia": null, "paese": "IT" },
"cittaDedotta": { "citta": "Milano", "da": "tag", "prova": "milano-centro" }
```

- **Non si scrive mai dentro `spedizione.citta`**: una deduzione e un indirizzo
  non sono la stessa cosa, e chi legge deve poter scegliere se fidarsi.
- `da` vale `tag` o `prodotto`, `prova` è **il testo su cui è stata decisa**: una
  deduzione che chi la riceve non può controllare non è un dato, è un'opinione.
- ⚠️ **Serve soprattutto a chi filtra.** `?citta=Milano` cerca in tutt'e due i
  campi (e in tutte le grafie: «Milan» compresa). Prima di questo blocco la
  risposta conteneva ordini con `spedizione.citta` vuota e niente che spiegasse
  perché fossero usciti: il filtro sapeva una cosa che la risposta non diceva.
- La deduzione ha una **controprova** che ne ha bocciate parecchie (Venezia,
  Capri, Dubai…): vedi la riconciliazione più su.

### Quanto vale ogni canale (`/api/v1/marketing`)
L'app Marketing sa quanto ha **speso** per canale; qui trova quanto ha
**incassato** — e soprattutto il taglio che nessuna dashboard pubblicitaria sa
dare: **di quegli ordini, quanti sono di gente che avrebbe comprato comunque.**
Un canale che porta solo clienti che tornavano già non sta acquistando niente:
sta rifatturando la fedeltà.

Per ogni canale: ordini, lordo, i dodici mesi, e lo split `primi` (clienti mai
visti prima) / `daRepeater` / `nonAttribuibili`. In più le **campagne per nome**
(«[Deluxy] - Fiori Milano»), che è la riga con cui si riconcilia la spesa
pubblicitaria col venduto. ⚠️ Quel nome è quello che la campagna aveva **quando
il link è stato scritto**: se in Google Ads è stata rinominata, qui resta il nome
vecchio — vedi la trappola nell'handoff.

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

Dal **26/08/2026** la risposta porta anche **l'economia della vendita** che la
piattaforma consegne scrive sugli ordini, per brand e per mese: le **fee
incassate dai partner** come commissioni (`fee`, lorde) e il **primo margine**
(`primoMargine` = pagato − valore prodotti, già ÷ 1,22 quindi **netto IVA** — a
differenza del lordo, e le due basi si dichiarano). Sono somme sui **soli ordini
che hanno il dato**: la copertura viaggia accanto (`ordiniConEconomia`,
`lordoConEconomia`, anche mese per mese) perché chi legge deve poter dire
«misurato su X ordini di Y», e zero ordini col dato si legge **n.d., non zero**.
Il primo lettore è il consuntivo per maison di Budgets.

Le **liste di clienti** escono con gli stessi criteri della UI: `/api/v1/liste`
dà il catalogo con i conteggi (e le soglie, così chi legge sa cosa significano),
`/api/v1/liste/:chiave` dà i clienti con segmento, tipologia, spesa e recency.
È l'interfaccia pensata per Marketing: da lì nascono i pubblici Customer Match e
Meta senza esportare a mano un CSV.

### Il venduto per territorio (`/api/v1/province`)
Chi ragiona per territorio e non per periodo — le viste Province e Copertura di
**Deluxy Scout**, dove accanto a «quanti partner abbiamo qui» sta «quanto vale
qui» — chiede il venduto aggregato per **provincia di consegna**: ordini, lordo
e clienti distinti per sigla, con le stesse esclusioni di `/api/v1/ricavi`
(annullati e rimborsati fuori, salvo `annullati=inclusi` /
`rimborsati=inclusi`). Filtri `anno=`, `da=`/`a=`, `brand=`; senza periodo
risponde su TUTTO lo storico, apposta: per capire dove si vende, tre anni
dicono più di dodici mesi.

- **La provincia non c'è sempre** (~10.300 ordini su ~13.600 italiani): chi non
  ce l'ha finisce nel blocco `senzaProvincia` invece di sparire, e **non** la
  si deduce da CAP o città — sarebbe un'ipotesi travestita da dato. Le sigle
  sono quelle vere di Shopify («MI», ma anche «ENG»): la geografia la
  normalizza chi legge.
- **Ogni provincia porta lo split `torte` / `fiori` / `altro`** (23/08/2026),
  chiesto da Scout per sapere se il fornitore da cercare è un fiorista o una
  pasticceria. Usa la colonna `categorie` già calcolata sugli ordini; un ordine
  sta in **una colonna sola** (chi ha sia torte sia fiori va dove pesa di più,
  contando il valore delle righe), così le tre colonne sommano esatte al lordo.

### La quota del fornitore (`/api/v1/quota-fornitore`)
Risponde con la **percentuale che spetta al fornitore** (di norma 60) e, se le
si passa `?totale=135`, anche l'importo atteso (`atteso: 81`). Esiste perché la
regola vive **solo qui**: il Customer Service la mostra sulla scheda di un
ordine («al fornitore, indicativamente, 81,00 €») senza ricopiarsi il numero
nel proprio codice — una copia resterebbe al valore vecchio il giorno che qui
cambia, e due schermate direbbero due numeri diversi. Il conto lo fa questa
app, che possiede la regola; un `totale` illeggibile **non diventa zero**: si
risponde senza importo, perché «≈ 0,00 €» sarebbe una risposta sbagliata con
l'aria di una giusta.

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
- Chi tiene una **copia** degli ordini (Customer Service, Merchandising,
  Marketing) chiede `annullatiDa=<ISO>` e riceve **solo gli ordini annullati da
  quel momento** (con `annullatoIl`), così ritira le proprie righe. Prima un
  ordine annullato spariva dall'elenco e la copia a valle restava valida per
  sempre (24/08/2026).

**Finance è l'eccezione**: la riconciliazione ha bisogno degli annullati, perché
dietro ci sono rimborsi da quadrare e incassi realmente avvenuti. Chiama con
`annullati=inclusi` e legge il campo `annullato`. Le app operative (smistamento,
consegne) usano il default.
