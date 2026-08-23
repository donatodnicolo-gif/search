# Deluxy Budgets

App dei budget aziendali Deluxy (porta **3080**): raccoglie tutti i budget, calcola il P&L
con i costi e stabilisce i premi su **3 livelli di budget** — *raggiungibile* (il budget
pubblicato), *sfidante* e *irraggiungibile*.

## Cosa fa (v1)

- **L'app si apre sul Consuntivo**: `/` rimanda a `/consuntivo`, perché la domanda quotidiana è
  «come sta andando davvero», non «cosa avevamo pianificato». Anche il login atterra lì.
- **Dashboard** (`/dashboard`): sintesi del conto economico 2026 sui 3 livelli + riepilogo per
  maison. Resta la prima voce della sidebar, non è più la home.
- **P&L** (`/pl`): conto economico aziendale completo, con il **consuntivo dei mesi chiusi** nelle prime colonne (Gen → mese precedente a quello in corso) accanto al **budget degli stessi mesi** e allo scostamento. Il mese in corso NON entra: mezzo mese di ricavi contro un mese intero di stipendi darebbe un EBITDA più brutto del vero, e questa è la tabella dove si decide. Il confronto è col **pubblicato** (raggiungibile), non con lo sfidante. Premi e risultato netto restano vuoti nel consuntivo: si liquidano a fine anno al raggiungimento, non si consuntivano mese per mese. Nell **andamento mensile** c e una quarta pillola **Attuale**: i mesi chiusi mostrano il consuntivo (in grassetto), quelli che restano il budget pubblicato (in grigio), e la colonna Anno somma i due pezzi — a meta anno e la lettura che serve, «dato come e andata finora, dove si chiude». Il mese in corso sta gia fra i mesi a budget. Il calcolo del consuntivo sta in `src/lib/consuntivo.ts`, condiviso, così P&L e Consuntivo non possono contraddirsi (verificato: su Gen–Giu le due pagine coincidono voce per voce) — ricavi per canale, costo del venduto,
  margine lordo, ADV, **costo del personale**, costi di struttura, EBITDA, premi e risultato
  netto — confrontato sui 3 livelli, con **andamento mensile** (evidenzia i mesi in perdita)
  e conto economico **per maison** (costi comuni ripartiti in proporzione ai ricavi).
- **Dipendenti** (`/dipendenti`): organico a budget con **dipendenti a RAL** (oneri sopra il
  lordo, default 38%), **stagisti** e **consulenti** a compenso mensile, e i **mesi in cui il
  costo è a carico** (assunzioni infra-anno, stage, consulenze a progetto). Per ciascuno si
  indicano **superminimo individuale** e **% di part-time**: il lordo effettivo è
  `(tabellare + superminimo) × % tempo`, riproporzionato come da CCNL, e gli oneri si
  applicano sopra. Il costo azienda entra automaticamente nel P&L, anche mese per mese.
  Per i dipendenti si stima anche il **netto in busta** (mensilità 12/13/14, contributi a
  carico del dipendente, IRPEF a scaglioni 23/35/43, detrazione da lavoro dipendente,
  addizionali e cuneo fiscale). È una stima di pianificazione con **parametri fiscali 2025**:
  non sostituisce il cedolino e va riverificata con la legge di bilancio dell'anno di budget
  (motore in `src/lib/calc.ts`, funzioni `irpefLorda`, `detrazioneLavoro`, `cuneoFiscale`).
  **Flag «Budget»** (17/08/2026, campo `Dipendente.budget`): segna chi **avrà un suo budget** — chi
  risponde di un numero e lo proporrà da `/proposte`. **Non cambia il costo del personale di un
  euro**: serve a sapere da chi aspettarsi una proposta e a chi il budget si può intestare. Si vede
  come pastiglia oro accanto al nome e nel riepilogo in cima («N con un budget proprio»).
  **«Modifica» porta il cursore nei dati** (17/08/2026): il modulo sta in fondo alla pagina e con
  undici persone il bottone sembrava non fare niente — ora la pagina ci si sposta, il titolo dice
  *chi* stai modificando, la riga si evidenzia e il fuoco va nel primo campo (senza selezionarne il
  testo: il primo tasto premuto cancellerebbe il nome).
- **CFO** (`/cfo`): scarica gli **addebiti bancari** dall'app Finance (`/api/spese`, uscite per
  controparte e per mese) e li **riclassifica in categorie di costo** tramite regole
  (controparte → categoria, il match più specifico vince). Ricostruisce la struttura dei costi,
  mostra la % di copertura e le controparti **da categorizzare** con assegnazione rapida (crea
  una regola permanente). Ogni categoria è agganciata a una voce di P&L (COGS/ADV/Personale/
  Struttura/Esclusa). Le controparti da categorizzare sono mostrate per importo (le prime 100),
  con nota su quante restano. Richiede `FINANCE_API_KEY` e l'API `/api/spese` di Finance (live).
  Le **controparti di una categoria si aprono sotto la sua riga** (17/08/2026): prima erano una
  scheda in fondo alla pagina e, con diciotto categorie, premere la freccia su una riga in alto
  sembrava non fare niente — la risposta c'era, tre schermate più giù. Ora la riga si evidenzia, il
  pannello compare subito sotto e la pagina ci si sposta se serve. ⚠️ **`behavior: "smooth"` in
  `scrollIntoView` non fa nulla** (misurato: con l'animazione la pagina resta ferma, col
  comportamento predefinito scorre) — il rimedio a «non succede niente» stava per essere a sua volta
  un non-succede-niente.
  Categorie e regole si aggiungono, si rimuovono e **si modificano**: nome e voce di P&L si cambiano dalla riga della categoria, senza cancellarla e perdere le regole che le erano state insegnate — è il modo per spostare, per esempio, i pagamenti ai partner fuori dai costi. **Proposte con AI**: un bottone chiede a OpenAI
  di ipotizzare la categoria di ogni controparte non classificata (con confidenza e motivo); le
  proposte pre-compilano le tendine e si confermano una a una o in blocco (solo le alte
  confidenze). L'AI propone, l'utente conferma: nulla è applicato in automatico. Richiede
  `OPENAI_API_KEY` (segreto, come le altre app Deluxy); senza chiave il resto del CFO funziona
  e il bottone spiega come attivarla.
- **Costi ricorrenti** (`/ricorrenti`, 17/08/2026): le controparti che tornano **mese dopo mese**,
  in fila per **regolarità** e non per importo. Nasce da un limite del CFO: fra 1.672 controparti
  l'occhio va alle più grosse, e le più grosse sono partner e stipendi — mentre i risparmi stanno nel
  canone da 60 € che nessuno ricorda di aver sottoscritto, nel software pagato due volte, nel
  noleggio finito che addebita ancora. Sono **le stesse uscite del CFO** (categoria decisa da
  Finance), ma una controparte divisa fra più categorie si **ricompone in una riga sola**: qui la
  domanda è «chi paghiamo ogni mese», non «in quale casella». Per ognuna: andamento a dodici mesi,
  **ritmo** (fisso / regolare / variabile, dallo scarto fra i mesi), mesi attivi, media, min–max,
  speso nel periodo e **quanto costa in un anno a questo ritmo** — 60 € al mese sembrano niente,
  720 € l'anno no. Filtri: canoni fissi, sotto 500 €/mese, **forse cessati** (niente da 2 mesi
  chiusi né nel mese in corso: può voler dire disdetto, o pagato con un altro mezzo — in entrambi i
  casi è una cosa da sapere). Il **mese in corso non conta né a favore né contro**: a metà agosto un
  canone «assente» è solo un canone non ancora passato. Soglie dichiarate in pagina
  (`SOGLIE` in `src/lib/ricorrenti.ts`), perché chi legge sappia cosa *non* vede. ⚠️ Limite vero: la
  banca dice **a chi** hai pagato, non **cosa** hai comprato — chi incassa con nomi diversi ogni
  volta non compare, e non è che non ci sia.
- **Venduto** (`/venduto`): quanto è passato dalla cassa dei negozi Shopify — il **prezzo pieno
  pagato dal cliente**, IVA e spedizione incluse — per maison e per mese, dal registro ordini
  (Orders `/api/v1/ricavi`), con confronto anno precedente e budget D2C. **Venduto ≠ fatturato**:
  una parte di quel denaro va al partner che esegue l'ordine. Le detrazioni vere dei partner non
  sono ancora in nessuna app, quindi si applica una **stima unica del 40%** (costante
  `QUOTA_FATTURATO` in `src/lib/venduto.ts`), scritta in chiaro in ogni riga che la usa: quando
  arriveranno i dati veri va **sostituita, non affiancata**.
- **Previsione di fine anno** (in fondo a `/venduto`, solo su YTD): dove si chiude se il ritmo resta questo. Non è la media dei mesi fatti moltiplicata per quelli che restano — il business è stagionale e una media direbbe che dicembre vale come agosto. Si misura **di quanto si sta crescendo** sui mesi già fatti rispetto allo stesso periodo dell'anno prima, e si applica quella crescita ai mesi che mancano **così com'erano l'anno prima**: la stagionalità la mette l'anno scorso, che l'ha già vissuta. Senza anno precedente **non si proietta** e la pagina dice perché (motore in `src/lib/previsione.ts`).
- **Competenza** (`/competenza`): **l anno di competenza di entrate e uscite si decide qui, e solo qui** (decisione dell utente, 27/07/2026). Finance e il registro di quello che e successo e passa gli importi con la data del movimento; a quale *esercizio* appartengano e una scelta contabile, e la fa questa app. Una fattura di dicembre pagata a gennaio si sposta da qui e **tutte le pagine la leggono spostata** (P&L, Consuntivo, andamento mensile). Il dato di Finance non viene toccato: resta la verita di cassa. Una rettifica dice «questo importo, di questa voce, che risulta nel mese X dell anno A, va letto nel mese Y dell anno B» e **porta con se il proprio importo** — cosi il conto di un anno si fa leggendo quell anno piu le sue rettifiche, senza interrogare Finance su tutti gli anni toccati. L importo si propone da solo (quello della voce in quel mese) e si puo ridurre, perche una controparte in un mese puo avere sia costi dell anno prima sia costi dell anno giusto. **Una controparte senza categoria nel CFO non entra in nessuna voce di P&L**: la riga lo dice in rosso invece di far sparire l importo in silenzio. Modello `RettificaCompetenza`, motore in `src/lib/competenza.ts`. **Si decide anche dal CFO**, che e dove si guardano le uscite una per una: ogni controparte — sia fra quelle «da categorizzare», sia aprendo le controparti di una categoria — ha un pannello che mostra i suoi importi mese per mese e permette di spostarne uno su un altro esercizio. Accorgersi che una fattura e dell anno prima succede mentre la si categorizza, non dopo in un altra schermata.
- **Consuntivo / Fatturato reale** (`/consuntivo`): gli importi **realmente fatturati** per tipologia di servizio,
  richiamati dall'app **Finance** (`deluxy-partner`, endpoint `/api/tipologie`) con selettore di
  periodo (anno / 1° / 2° semestre) e stato (tutte / saldate / aperte). Il fatturato reale si
  **raggruppa per voce di budget** secondo la mappatura impostata in Margini (campo "Voci in
  Finance": più categorie di Finance possono confluire in una voce — es. il B2B raccoglie
  Consegne, Food Supplier, Magazzino, Affiliazioni, Clientelling), con **budget vs consuntivo,
  scostamento e % realizzato**. Il fatturato non associato ad alcuna voce è elencato a parte,
  così nulla è nascosto. Richiede `FINANCE_API_KEY` in
  `.env` (la stessa chiave di `/api/verifiche` di Finance, **segreto, mai committato**);
  `FINANCE_API_URL` è opzionale. Senza chiave la pagina spiega come configurarla.
  **L'ecommerce non passa da Finance** — nasce sui negozi Shopify — quindi la riga D2C di questo
  conto economico è la **quota del venduto che resta a Deluxy**: `QUOTA_FATTURATO` (oggi 40%)
  applicata al venduto di [Venduto](#). Sommare qui il venduto pieno gonfierebbe i ricavi di più
  del doppio e produrrebbe un margine che non esiste. Un riquadro in fondo alla pagina mostra la
  catena venduto → detrazioni partner → fatturato.
  Di conseguenza **non c'è più un «costo del venduto»**: la quota del partner è già una detrazione
  dai ricavi, non un costo. Quella riga è ora il **costo per servizi** — quanto si paga ai **valet**
  per la consegna — e la pagina **elenca le categorie di banca che la compongono** con gli importi,
  perché è lì che si annidava il doppio conteggio. **Risolto il 28/07/2026 con una misura**: la
  categoria «Fornitori fiori e torte» vale **349.377 €** sul 2026 contro **363.729 €** di quota
  attesa ai partner (60% del venduto ecommerce 606.215 € letto da Orders) — scarto del 4%, cioè è
  *quella* partita. Spostata su «Esclusa dal P&L» in `/cfo`: il costo per servizi Gen–Giu passa da
  334.912 a **29.156 €** e l'EBITDA consuntivo da −171.596 a **+134.160 €**.
  **Due decisioni aperte, dichiarate in pagina e non risolte a mano**: (1) il budget D2C è scritto
  sul **venduto**, quindi su quella riga «scostamento» e «realizzato» confrontano due basi diverse
  (il paragone giusto è in `/venduto`); (2) il **budget** del costo per servizi è ancora calcolato
  come costo del venduto dai margini per tipologia, cioè con la vecchia logica — e adesso che il
  consuntivo è netto lo scostamento è enorme per costruzione (Gen–Giu: budget 548.287 contro 29.156
  reali). **Finché il budget non viene rifatto sulla stessa base, l'EBITDA a budget e quello a
  consuntivo non sono confrontabili**: rifarlo cambia P&L, EBITDA e premi, quindi è una decisione
  dell'utente. **L'IVA non si scorpora**: il totale Shopify si usa così com'è,
  IVA e spedizione incluse, perché il budget D2C è scritto sulla stessa base. Le due fonti dei
  ricavi restano quindi su basi diverse — Finance **imponibile**, Shopify **IVA inclusa** — e la
  pagina lo dichiara invece di uniformarle con un'aliquota indovinata (Shopify non salva l'aliquota
  sull'ordine). Ordini **annullati e rimborsati esclusi**; i rimborsi
  parziali restano contati per intero, ed è scritto sotto la tabella.
  Il consuntivo **arriva a oggi**: il mese in corso è dentro il conto, parziale (prima si fermava
  all'ultimo mese chiuso, e a fine luglio non sapeva niente di luglio). Siccome non tutte le fonti
  hanno la stessa finezza, la pagina dice cosa è al giorno e cosa al mese: le **vendite ecommerce**
  sono al giorno e **anche l'anno prima viene tagliato allo stesso giorno** (Orders accetta un
  intervallo di date, quindi lì il confronto è esatto); **Finance e banca hanno solo il mese**,
  quindi per l'anno prima quel mese vale intero; **budget e costo del personale** del mese sono
  interi. Un importo dell'anno prima che copre solo una parte del periodo è marcato «parziale», la
  sua **percentuale non si mostra** (confronterebbe 7 mesi con 1) e il **margine lordo** di
  quell'anno resta vuoto invece di essere ricavi pieni meno costi di un mese.
  I periodi sono **YTD** (predefinito: da gennaio a oggi), T1-T4, i due semestri e
  **Anno** (ultimo del gruppo). «Anno» è la vista di fine corsa e si comporta diversamente: il
  **consuntivo resta YTD** mentre **budget e anno precedente sono interi**, per rispondere a «a che
  punto sono rispetto a tutto l'anno». Lì le colonne cambiano nome — «Tutto il *anno-1*», «% del
  *anno-1*», «Budget anno», «Ancora da fare» — perché quel confronto **non è uno scostamento** e un
  −60% letto come calo direbbe una bugia (è solo metà anno). Se il budget è già superato la casella
  non si azzera: dice «superato di X», in verde sui ricavi e in rosso sui costi.
  **Confronto con l'anno precedente a parità di periodo** (in tutte le altre viste): le colonne «*mesi* *anno-1*» e «Var.»
  confrontano gli **stessi mesi** dell'anno prima (Gen–Giu con Gen–Giu, non con l'anno intero).
  Ci sono nel conto economico (totale e per voce di budget), nel KPI dei ricavi e nella tabella
  delle vendite ecommerce per maison. Dove il dato dell'anno prima **non esiste** la casella resta
  **vuota, non a zero**: oggi la banca non ha movimenti categorizzati per il 2025 e non c'è un
  organico a budget 2025, quindi costi ed EBITDA dell'anno prima non si calcolano e la pagina lo
  scrive. Si riempiranno da soli quando quei dati ci saranno. Un dato **parziale** viene segnalato
  invece che spacciato per completo: il conto di banca del 2025 parte da **luglio**, quindi nella
  vista Anno i costi del 2025 coprono 6 mesi su 12 e la pagina avvisa che quella percentuale è
  gonfiata dal minor tempo misurato, non solo da maggiore spesa.
- **Ogni riga del consuntivo si apre** (`/consuntivo/[voce]`, 29/07/2026): «Costo per servizi 75.622 €» è
  un numero che o si crede o non si crede, finché non si vede da quali categorie di banca è fatto e con
  quali controparti. Cliccando la riga si scende — categorie con importi, controparti, e le **stesse
  tendine** di voce di P&L e voce di bilancio del CFO, perché è lì che ci si accorge di una categoria
  classificata male ed è lì che deve esserci il modo di spostarla. Gli importi sono quelli dei **mesi del
  periodo** scelto (le controparti portano il loro `perMese`), quindi il dettaglio somma esattamente al
  totale da cui si è arrivati. Si aprono: totale ricavi, costo per servizi, ADV, personale, struttura.
  Il **personale** fa eccezione e lo dichiara: il totale è il roster, e accanto si legge quanto è uscito
  davvero dal conto per stipendi nello stesso periodo — non sommato, che sarebbe contare due volte le
  stesse persone, ma affiancato, che è l'unico modo per accorgersi se pianificato e pagato si stanno
  allontanando. Motore in `src/lib/consuntivo-dettaglio.ts`, stessa UI del conto economico.
- ⭐ **IN `/maison` I MESI PASSATI PORTANO IL LORO CONSUNTIVO** (09/08/2026, richiesta dell'utente:
  «maison metti consuntivo per i mesi passati»). La tabella «mese per mese, brand per brand» era tutta
  budget: dodici mesi di promesse, anche su mesi già finiti di cui si sa com'è andata. Ora, per ogni
  brand che ha un negozio, sotto la riga **D2C** c'è la riga **venduto reale** in blu — mese per mese,
  solo i **mesi chiusi** — e sotto le righe del brand la riga **Attuale**: mesi chiusi per quello che è
  successo, mesi che restano per quello che è a budget. Le stesse due righe in fondo, per l'azienda.
  Misurato oggi: Deluxy.it budget 525.500 € → **attuale 908.441 €**, Flowers 293.024 → **316.957**,
  CakeDesign 98.259 → **99.853**, azienda 1.164.282 → **1.544.851** (venduto dei mesi chiusi 614.351 €).
  Sono gli stessi numeri della scheda del singolo brand: il conto è uno solo.
  > ⚠️ Limiti dichiarati sotto la tabella. Nei mesi chiusi **solo il D2C è misurato**, quindi dentro
  > «Attuale» Eventi e B2B sono ancora budget — per un brand un loro consuntivo non esiste, il fatturato
  > di Finance è per tipologia di servizio e non si ripartisce per maison. E i brand **senza negozio**
  > (Business, Experience) non hanno nessuna riga blu: una riga di zeri sembrerebbe un crollo invece di
  > un dato che non c'è.
- ⭐ **…E ANCHE IL MESE IN CORSO** (23/08/2026, richiesta dell'utente: «riesci a compilare il mese in
  corso con il valore corrente del mese?»). Fino a ieri quella colonna era un trattino, per una ragione
  scritta nel codice: mezzo mese di vendite accanto a un mese intero di budget fa sembrare in ritardo
  un brand che non lo è. Ma il dato **c'era già** — Orders è al giorno — e nasconderlo lasciava una
  casella vuota proprio dove stanno le sorprese. Misurato il 23/08: **Deluxyflowers aveva già venduto
  35.093 € contro i 19.000 a budget**, cioè il mese era chiuso con nove giorni di anticipo, e la pagina
  non lo diceva. Ora c'è, **dichiarato parziale**: colonna marcata «in corso» in testa, valore in
  corsivo e più chiaro, e ovunque l'etichetta «Ago al 23» con i giorni passati sul totale del mese.
  > 🎯 **Dentro «Attuale» il mese in corso vale il *maggiore* fra il venduto di adesso e il budget.**
  > Non è una proiezione — non si moltiplica niente per i giorni che mancano — è un dato di fatto: *il
  > mese non può chiudere sotto quello che ha già venduto*. Sostituirlo col parziale direbbe che l'anno
  > si chiude più in basso ogni volta che si apre la pagina il 2 del mese; tenere il budget quando il
  > parziale l'ha già superato nasconderebbe il contrario. Passando sopra la casella si legge **quale
  > dei due ha vinto**. Il confronto «a che punto siamo» in fondo alla pagina resta invece sui **soli
  > mesi chiusi**, che è la ragione per cui il mese in corso era stato escluso all'inizio.
  >
  > ⚠️⚠️ **Due conti sbagliati trovati mentre si aggiungeva il mese in corso**, tutti e due della stessa
  > famiglia — *un totale che non torna con quello che c'è scritto sopra*.
  > 1. Nell'elenco, un mese chiuso **sostituiva l'intero budget del mese** con il venduto ecommerce,
  >    buttando via Eventi e B2B: la didascalia prometteva il contrario e la scheda del singolo brand
  >    faceva il contrario. Ora il D2C si sostituisce e le altre linee restano, in tutte e due (su
  >    Deluxyflowers luglio: 32.168 → **35.168 €**, i 3.000 di Eventi erano spariti).
  > 2. Il totale d'azienda si rifaceva **sugli aggregati** invece di sommare le righe: con il `max` del
  >    mese in corso le due cose divergono, perché il sorpasso di un brand veniva **annullato** dal
  >    ritardo di un altro. Il 23/08 dava **78.200 €** mentre le righe sopra ne facevano **95.097**.
  >    Adesso il totale è la somma delle righe, punto.
- ⭐ **SI ENTRA NEL SINGOLO MESE** (`/consuntivo/mese/[m]`, 09/08/2026, richiesta dell'utente:
  «consentimi di entrare nel dettaglio di ogni mese»). Lo **split mensile** dava dodici colonne di
  numeri veri e nessun modo di chiedere *perché*, mentre la domanda che nasce lì è quasi sempre su un
  mese solo — «perché gennaio è in perdita e maggio no?». Adesso:
  - **ogni casella si apre** su *quella voce in quel mese* (`/consuntivo/[voce]?mese=7`): le categorie
    di banca e le controparti di **luglio soltanto**, non del periodo;
  - il **nome del mese** apre il mese intero: conto economico del mese con ogni riga apribile, lo
    **stesso mese dell'anno prima** accanto con la variazione, da dove viene il fatturato per voce di
    budget, e in fondo **cosa sapere su quel mese** (mese in corso, vendite vendor non caricate, uscite
    ancora senza categoria, quanta pubblicità Marketing spiega);
  - **margine lordo ed EBITDA non si aprono per voce** ma portano al mese: sono differenze fra le
    altre righe, non movimenti, e un link «di cosa è fatto» su una sottrazione prometterebbe una
    risposta che non esiste.
  Il mese singolo si risolve in **`risolviPeriodo()`** (`?mese=`), non nelle pagine, per la stessa
  ragione dei periodi: se «luglio» significasse due cose in due schermate, il dettaglio non sommerebbe
  al numero da cui si è cliccato. Un mese fuori dal periodo, o non ancora cominciato, si **ignora** e
  si torna al periodo intero. I numeri del mese vengono da `caricaConsuntivo(dati, [m])` — lo stesso
  motore della pagina da cui si è arrivati, non un secondo conto.
  > ⚠️ **Due divergenze trovate proprio aprendo i mesi, e corrette**: il dettaglio dei ricavi
  > calcolava l'ecommerce come *venduto × quota* mentre la pagina usa ormai le **fee vere dei vendor**
  > (`ricavoD2C`) — su luglio 2026 36.688 € contro 34.693 € — e sommava anche le **tipologie di
  > Finance non mappate** su nessuna voce di budget («Altro», 2.278 €), che nei ricavi della pagina non
  > entrano. Ora la strada è una sola e le non mappate sono scritte **fuori dal totale**, con quanto
  > valgono e dove si agganciano. Verificato voce per voce: su luglio, marzo e YTD gen–ago il dettaglio
  > somma **all'euro** al totale che lo ha aperto. La divisione del ricavo ecommerce **per negozio**
  > resta una ripartizione sul venduto, e la riga lo dice: le fee si conoscono per partner e per mese,
  > non per negozio.
- **Ogni controparte si apre sui suoi movimenti — data e causale** (29/07/2026): cliccando una
  controparte, nel dettaglio di una voce o nell'elenco delle senza-categoria, si vedono i suoi
  movimenti uno per uno con **data**, importo e **causale**. Serviva per due motivi diversi e
  entrambi pratici: per decidere *cosa è* un pagamento — il nome non basta, `Formenti Patrizia` può
  essere una fiorista o una valet, mentre la causale lo dice — e per **scegliere l'anno di
  competenza** di quel singolo movimento, che è l'unica cosa che la vista per mese non permetteva.
  Lo spostamento si fa dalla riga del movimento: il **mese di origine non si sceglie**, è quello
  della sua data. I movimenti li espone Finance (`GET /api/spese?controparte=…`, aggiunto lo stesso
  giorno) e si chiedono **solo quando si apre una controparte** — farlo per tutte vorrebbe dire una
  chiamata per ognuna su una pagina che ne mostra centinaia.
- **Anche i ricavi si aprono, fino alla singola fattura** (29/07/2026): dal Consuntivo si clicca
  «Totale ricavi» — o una qualsiasi voce di ricavo — e si scende alle **tipologie di Finance**, ognuna
  apribile sulle **fatture che la compongono** (numero, mese, partner, imponibile, saldata o aperta;
  `GET /api/tipologie?tipologia=…` aggiunto a Finance, simmetrico a `?controparte=` sulle spese).
  L'**ecommerce si apre per negozio** invece che in una riga sola: il totale non dice se sta tirando
  Deluxy.it o Flowers, che è la prima cosa che si vuole sapere. I negozi non abbinati a nessuna
  maison restano a parte, invece di sparire nel totale.
  In cima alla sezione la pagina risponde alla domanda che si fanno tutti — **«ci sono dentro gli
  ordini annullati?»** — con i numeri presi dal registro: annullati e rimborsati **esclusi** (sul
  2026: 86 ordini per 26.960 € e 59 per 5.856 €), rimborsi parziali **contati per intero**, che è
  l'unico punto in cui i ricavi restano gonfiati.
- **La categoria nuova si crea dalla riga che la fa nascere**: nella tendina di assegnazione c'è
  **«+ Nuova categoria…»** — nome e voce di P&L, si crea e si assegna in un gesto solo. Ci si accorge
  che manca «Viaggi e trasferte» proprio mentre si guarda un parcheggio da assegnare, e mandare in
  un'altra schermata a crearla — per poi tornare e ritrovare il punto — è il modo migliore perché
  quella riga resti dov'è.
- **Piattaforme ADV** (`/piattaforme`): ripartizione del budget pubblicitario tra le **piattaforme**
  (Google, Meta, TikTok e altre **aggiungibili/rimovibili**). Si impostano le **% per mese** — diverse
  mese per mese — e l'**importo per piattaforma si calcola da solo** (= budget ADV del mese × %). La
  riga "Totale %" segnala se un mese non copre il 100%. Il budget ADV mensile è quello di Spese ADV.
- **Margini** (`/margini`): il **margine lordo per tipologia di servizio** (D2C, Eventi, B2B e
  quelle aggiunte a mano). Il costo del venduto del P&L non è più una percentuale unica: è la
  somma dei ricavi di ogni tipologia al netto del suo margine, quindi **cambia col mix di
  vendita**, anche mese per mese. Da qui si aggiungono nuove tipologie: nascono senza ricavi
  ed entrano nel P&L quando gli si attribuisce budget. Una tipologia con ricavi a budget non
  è eliminabile (i suoi ricavi sparirebbero dal conto senza che si veda).
- **Team** (`/team`): le squadre aziendali (nome, responsabile, colore del badge, ordine)
  con **organico e costo del lavoro per team**, il peso di ciascuna persona sul totale della
  squadra e l'elenco di chi non è ancora assegnato. Le persone si assegnano dalla scheda in
  Dipendenti. Sciogliere un team **non cancella le persone**: restano a budget senza team.
- **Maison** (`/maison`, `/maison/[slug]`): per ogni brand (Deluxy.it, CakeDesign.me,
  Deluxyflowers.com, Business B2B, Experience) la vista mensile **D2C · Eventi · B2B
  (lead generation)** con selettore del livello. **L'elenco non è più solo cinque riquadri**
  (31/07/2026): c'è la tabella **mese per mese, brand per brand**, con sotto ogni brand le sue righe
  **per canale** — nella stessa tabella, perché «questo mese chi lo fa e con cosa» è una domanda
  sola e in due tabelle separate si scorre avanti e indietro. Un mese a **—** è un mese *senza
  budget* su quel canale, non un mese a zero vendite: la differenza conta, e la pagina la scrive.
  In fondo l'**avanzamento sui mesi chiusi**: budget D2C contro venduto ecommerce reale,
  scostamento, % realizzata e barra.

  > **L'avanzamento è solo l'ecommerce, e non per scelta.** Il consuntivo *per brand* esiste
  > soltanto per i negozi Shopify: il fatturato di Finance è per **tipologia di servizio** (consegne,
  > eventi, B2B) e ripartirlo per maison vorrebbe dire inventare una chiave di riparto. Quindi
  > eventi e B2B di ogni brand lì non ci sono, ed è dichiarato. Le due colonne sono però sulla stessa
  > base — prezzo pieno, IVA e spedizione incluse, come è scritto il budget D2C. Il **mese in corso
  > resta fuori**: mezzo mese di vendite contro un mese intero di budget farebbe sembrare in ritardo
  > chi non lo è. **Business B2B ed Experience non compaiono**: non hanno negozio, e una riga a zero
  > sembrerebbe un crollo invece di un dato che non esiste. Dove il budget D2C è zero la percentuale
  > **non si mostra**: dividere per zero non dà «0%», e uno 0% direbbe che il brand è fermo mentre
  > sta vendendo.

  > ⚠️ **Da dove arrivano i valori di Eventi e B2B** (domanda dell'utente, 31/07/2026): dalle righe
  > `BudgetEntry` con `canale` = `EVENTI` / `B2B`, scritte dal **seed** (`prisma/seed-data.json`,
  > estratto da *Monitoraggio 2026.xlsx*, foglio `SALES GLOBAL 26 - REVISED`). Non li tocca nessun
  > altro: gli unici che scrivono in `BudgetEntry` sono il seed, `/margini` (che cancella le voci di
  > una tipologia eliminata) e il **consolidamento di una proposta**. **E su Deluxy.it il dato di
  > origine è anomalo**: eventi e B2B esistono **solo da luglio a dicembre**, e su gennaio–giugno
  > tutti e tre i canali sono a zero — mentre Deluxyflowers e CakeDesign hanno il D2C su tutti e
  > dodici i mesi. Non è un'ipotesi di business, ha la forma di un'estrazione andata storta: nel
  > secondo semestre il totale del mese è spaccato in percentuali fisse (10/20/70, 10/90), nel primo
  > no. Va confrontato col foglio prima di leggere qualsiasi scostamento di quel brand.

  ### Il budget di un mese è una SOMMA, non un numero solo (31/07/2026)

  Regola dell'utente, e cambia il modello dei dati: le vendite che nascono dalla **pubblicità web**
  le propone chi gestisce l'ADV; sopra ci si somma il budget del **team commerciale**, che nasce da
  tutt'altro lavoro. Finché la casella era una sola, consolidare la proposta di una squadra
  **cancellava quella dell'altra** — misurato sulla proposta di Deluxy.it: **648.404 €** sarebbero
  spariti in un clic, e nessuno avrebbe saputo di chi era il numero cancellato.

  Ma **il budget iniziale non è un addendo: è un punto di partenza.** Le proposte si sommano *fra
  loro* e insieme **sostituiscono** quello che veniva dal file di monitoraggio — il nuovo budget
  rimpiazza il precedente. Solo dove nessuno ha ancora proposto vale ancora l'iniziale.

  > ⚠️ **Senza questa seconda metà della regola il totale sommava il vecchio e il nuovo**, e su
  > Deluxy.it faceva **1.699.404 €** invece di 525.500: il D2C di luglio valeva 105.000 (55.000
  > rimasti in `iniziale` da un consolidamento fatto *prima* che la colonna `fonte` esistesse, più i
  > 50.000 della proposta). Un totale che somma il budget vecchio e quello nuovo non è il budget di
  > nessuno. Motore: `venditeApplicate()` in `src/lib/calc.ts`. Il valore sostituito **non sparisce**,
  > si mostra ~~barrato~~ nella riga della sua fonte: chi guarda deve capire che è stato rimpiazzato,
  > non perso — e che non entra nel totale.

  `BudgetEntry` ha quindi una colonna **`fonte`** (`iniziale` · `adv-web` · `commerciale`) e la
  chiave unica diventa `(anno, maison, mese, canale, fonte)`. Conseguenze, tutte volute:

  - il budget di un canale in un mese è la **somma delle sue fonti** (`caricaAnno` le somma e porta
    anche `perFonte` per mostrarle separate);
  - **ogni squadra sovrascrive solo la propria riga**: le altre restano dove sono;
  - **riconsolidare due volte la stessa proposta non raddoppia niente** — riscrive la stessa riga;
  - il **seed** scrive `iniziale`, quindi rilanciarlo non cancella il lavoro delle squadre.

  La proposta dichiara da dove nasce (campo `fonte`, scelto nel modulo), e chi consolida può
  cambiarlo — una proposta può essere stata scritta prima che la distinzione esistesse. **L'anteprima
  del consolidamento confronta la stessa fonte**, non il totale del canale: metterla accanto al
  totale mostrerebbe un crollo enorme che non avverrà.

  Migrazione fatta con `prisma db push` sul Postgres condiviso: le 180 righe esistenti sono passate
  a `fonte = "iniziale"`, totali invariati (1.840.404 € sul 2026). Allargare una chiave unica non può
  creare duplicati — se `(a,b,c,d)` era unica, `(a,b,c,d,e)` lo è per forza — quindi l'avviso di
  «possibile perdita di dati» di Prisma era generico.

  **Il budget non si digita: si propone, si approva, si consolida** (31/07/2026). Per qualche ora
  questa griglia è stata modificabile ed era la strada sbagliata — correzione dell'utente, e la
  ragione va lasciata scritta: **un budget scritto a mano su una pagina non ha un autore, non ha una
  data e non ha il «va bene» di nessuno**, cioè non si sa più *chi* ha promesso quel numero, che è
  metà del motivo per cui il budget esiste. La rotta di scrittura è stata tolta.

  **Quale proposta si sta usando, detto in chiaro.** Su una **stessa fonte** una proposta nuova
  riscrive quella di prima: l'ultima consolidata è il budget, le precedenti restano come storico e
  la pagina le marca «sostituita da *autore, data*». Fra **fonti diverse** invece non si sostituisce
  niente — pubblicità web e team commerciale si **sommano**. Senza dirlo, due proposte approvate
  della stessa squadra si somigliano e non si sa quale delle due si sta guardando.

  **E il totale ha una riga «Attuale»**: i mesi già chiusi valgono per quello che è successo davvero,
  quelli che restano per quello che è a budget — la domanda di metà anno non è «quanto avevamo
  pianificato» ma *dato come è andata finora, dove si chiude*. Il totale a budget resta sopra, perché
  servono entrambi: uno dice la promessa, l'altro la rotta. Su Deluxy.it al 01/08/2026 fa **908.441 €**
  contro 525.500 di budget. ⚠️ Nei mesi chiusi **solo il D2C è misurato**: Eventi e B2B restano a
  budget, perché per una maison un loro consuntivo non esiste — e quella parte della riga è ancora una
  promessa, non una misura. È scritto sotto la tabella.

  **Il consuntivo dei mesi chiusi è in blu**, sotto la riga D2C: quello che è davvero stato venduto,
  non una promessa — sono le due cose che in questa pagina non vanno mai confuse. C'è solo lì perché
  per una maison l'unico consuntivo è il venduto dei negozi, ed è sulla **stessa base** del budget
  D2C (prezzo pieno, IVA e spedizione incluse), quindi il confronto è omogeneo. Il **mese in corso
  resta fuori**: è parziale, e accanto a un budget intero sembrerebbe un crollo.

  Quello che serviva davvero era **vedere da dove viene ogni casella**, e adesso si vede: le proposte
  consolidate dicono esattamente quali *(linea, mese)* hanno scritto, quindi la provenienza si
  ricostruisce **cella per cella**. Un <span>●</span> verde accanto al numero vuol dire «arrivato da
  una proposta approvata»; passandoci sopra si legge **di chi** e **di quando**. Le caselle senza
  pallino vengono dal file di partenza. In cima alla griglia c'è chi ha proposto, con il link alla
  proposta, e — separato — l'avviso delle proposte **approvate ma non ancora consolidate**:
  approvare vuol dire «va bene», consolidare è il gesto che riscrive i numeri, e finché non avviene
  il budget pubblicato non è cambiato di un euro.

  > **Un canale senza budget non è un canale a zero: è un canale che non porta ADV con sé.** Quanto
  > si può spendere in pubblicità è `vendite del mese × % ADV`, e le vendite del mese sono la somma
  > **di tutti i canali** (`advConsentitoMese` in `src/lib/calc.ts`). Quindi un brand a cui manca
  > Eventi o B2B non perde solo quella riga di ricavo: si vede assegnare **meno soldi per fare
  > pubblicità**, e nessuna schermata lo diceva. Oggi la pagina lo dice. Al 31/07/2026 mancano
  > **4 coppie brand-canale su 15**: Business B2B non ha D2C né Eventi, Experience non ha D2C né
  > B2B — e Deluxy.it ha sei mesi a zero su tutti e tre, quindi **ADV consentito zero da gennaio a
  > giugno**. Si riempiono con una proposta su quella maison, che oggi si scrive linea per linea.
- **Team commerciale** (`/commerciale`): le **linee di vendita** (con sottolinee) sono richiamate
  live da **Scout**, che ne è il master (edge function Supabase `linee`, chiave `LINEE_API_KEY`
  dal vault del Hub). Il budget per linea (valore/clienti) resta in Budgets e si aggancia alle
  linee di Scout **per nome**; dove non combacia, la colonna resta “—”. Se Scout non è
  raggiungibile o la chiave manca, la pagina ripiega sulle linee a budget locali. budget per **linee** (Affiliazioni, Consegne
  Corporate, Catering & Eventi, Torte e Mono, Regalistica, Retail Marketing & Concierge,
  Eventi & Altro, Magazzino) e **nuovi clienti** per mese.
- **Proposte budget** (`/proposte`): ogni utente di livello Responsabile invia la propria
  proposta (ambito: azienda / maison / linea, 12 mesi + note); elenco con stato. **I mesi già
  passati non si propongono: si leggono**, con la casella bloccata — chiedere di «proporre»
  gennaio a luglio inoltrato è un invito a scrivere un numero che non conta niente e che poi
  finisce nel budget consolidato accanto a quelli veri.
  **E il consuntivo che si legge dipende dall'ambito** (31/07/2026): fino al giorno prima era
  *sempre* quello aziendale, anche su una proposta di maison o di linea — cioè al responsabile
  di Deluxyflowers veniva mostrato il fatturato di tutta Deluxy come se fosse il suo. Un numero
  giusto nel posto sbagliato è peggio di un numero mancante: quello mancante si va a cercare,
  quello sbagliato si usa. Le tre risposte sono diverse perché **le fonti non sanno le stesse
  cose**:

  | Ambito | Cosa mostra | Perché |
  | --- | --- | --- |
  | **Azienda** | i ricavi reali del Consuntivo | fatturato Finance + ricavo dell'ecommerce: l'unica lettura completa che esiste |
  | **Maison** | **solo il venduto ecommerce** di quella maison | il fatturato di Finance è per *tipologia di servizio* (consegne, eventi, B2B), non per maison: ripartirlo vorrebbe dire inventare una chiave di riparto. Eventi e B2B della maison quindi non ci sono, ed è scritto |
  | **Linea commerciale** | **niente**, con la riga che dice perché | né Finance né il registro ordini sanno a quale linea appartiene una vendita |

  **Su una maison si propone linea per linea** (31/07/2026, richiesta dell'utente): non un numero al
  mese ma una griglia **D2C · Eventi · B2B × dodici mesi**, con il totale del mese calcolato sotto.
  Due motivi, e valgono entrambi: un brand deve avere un budget su **ognuna** delle sue linee, e da
  tutte insieme nasce **quanto può spendere in pubblicità** — l'ADV consentito è una percentuale
  sulle vendite del mese *sommate su tutti i canali*, quindi una linea lasciata a zero non è «una
  linea a zero», è una linea che non porta con sé i soldi per farla.

  > **E il consolidamento non chiede più su quale voce applicarla.** Era l'ultima domanda che
  > costringeva chi approva a indovinare — «questa proposta è D2C, Eventi o B2B?» — e un numero
  > messo sulla voce sbagliata poi non lo ritrova più nessuno. Adesso lo dice la proposta, riga per
  > riga. La tendina resta **solo per le proposte vecchie**, quelle scritte con un numero unico per
  > mese: senza, non si potrebbero più applicare.

  Sui mesi già chiusi il consuntivo si mostra **sulla riga D2C**, non su tutte e tre: per una maison
  l'unico consuntivo che esiste è il venduto ecommerce, e ripeterlo su Eventi e B2B lo farebbe
  sembrare tre misure invece di una.

  Il calcolo è **sul server** (`src/lib/proposta-consuntivo.ts`), una mappa ambito → dodici mesi;
  il pannello legge la casella dell'ambito scelto. Le maison **senza negozio** (Business B2B,
  Experience) non mostrano zero — che sarebbe una bugia — ma un trattino e il motivo. I mesi
  chiusi restano bloccati **anche dove il consuntivo non c'è**: il motivo per cui non si
  propongono è che sono passati, non che c'era un numero da mettere al loro posto.
  **I campi degli euro si formattano mentre si scrive** (`src/components/CampoEuro.tsx`): punti
  delle migliaia e simbolo €, così `55.000 €` sta accanto a `50.576 €` di consuntivo e non a
  `55000` — contare gli zeri a occhio è il modo in cui si scrive un numero dieci volte più grande
  senza accorgersene. Il cursore **non salta**: si contano i caratteri significativi prima di lui e
  lo si rimette dopo gli stessi, qualunque punto sia comparso. Il punto digitato si **ignora** (le
  migliaia le mettiamo noi), la virgola vale come decimale, e un campo **vuoto resta vuoto**: `0 €`
  sarebbe una proposta di non vendere niente, che è un'altra cosa.
  **Si approva aprendo la proposta** — bottone «Leggi e decidi» in fondo alla riga dell'elenco.
  Prima l'unico modo di arrivarci era cliccare il **nome dell'autore**, che nessuno interpreta come
  «qui si approva»: la domanda «dove approvo le proposte?» è arrivata dall'utente guardando la
  pagina. Il bottone dice cosa succede, e cambia con lo stato (`Leggi e decidi` → `Consolida` →
  `Apri`).

  > ⚠️ **CONSOLIDARE HA CANCELLATO 692.728 € DI BUDGET, ED È COLPA DEGLI ZERI (31/07/2026).** Il
  > pannello mandava **dodici mesi** anche quando ne proponeva sei: i mesi chiusi, bloccati in
  > pagina, viaggiavano come `0`. Il consolidamento scrive nel budget *quello che la proposta
  > contiene* — quindi una proposta di Deluxy.it su luglio–dicembre ha **azzerato il D2C di
  > gennaio–giugno** (50.112 · 74.936 · 135.000 · 134.280 · 193.960 · 104.440), portando il totale
  > della maison da 1.492.440 a 1.173.904 €. Due correzioni, perché una sola non basta:
  >
  > 1. **la causa**: una proposta contiene **solo i mesi che propone**. Il pannello non manda i
  >    mesi bloccati e `POST /api/proposte` accetta da 1 a 12 mesi invece di pretenderne dodici —
  >    quel controllo sembrava completezza ed era il generatore degli zeri;
  > 2. **la difesa**: prima di consolidare si vede la tabella **«a budget oggi → dalla proposta →
  >    differenza»** sui soli mesi che verranno scritti, e se qualcosa scende un riquadro rosso
  >    dice quanto. Consolidare **sovrascrive, non somma**, e da lì il valore di prima non torna.
  >
  > Il ripristino si fa con `scripts/ripristina-budget-azzerato.mjs` (prova a vuoto senza
  > argomenti, `scrivi` per applicare); i valori vengono dal seed, che è la fonte da cui il budget
  > era nato. **Ancora non eseguito al 21/08/2026** — verificato a database: su Deluxy.it le righe di
  > gennaio–giugno ci sono e valgono `0` su tutti e tre i canali. È il motivo per cui `/spese`
  > mostrava «100% = 0 €» su sei mesi, ed è il primo posto da guardare quando un budget «sparisce».
- **Spese ADV** (`/spese`): **come si distribuisce fra i mesi il budget pubblicitario dell'anno** di
  ogni brand. Ogni casella è una quota di quel monte, quindi le dodici quote di un brand devono fare
  **100%**: sopra si impegna pubblicità che non c'è e il salvataggio è bloccato, sotto si salva e la
  pagina dice quanto resta da assegnare. Nei mesi già chiusi la quota è **misurata** (speso reale ÷
  monte annuo), non decisa. I **mesi
  già passati sono in sola lettura**, il **totale dell'anno sta anche in fondo** (per brand e
  complessivo) e **mentre si scrive si vede di quanto cambia**, casella per casella. Una percentuale
  **oltre il 100% blocca il salvataggio** (sarebbe spendere più di quanto il mese vende). Ogni brand
  ha il **suo bottone Salva**, e da qui si **aggiunge un brand** nuovo. Vedi «Spese ADV: cosa si può
  ancora scrivere, e quanto sposta».
- **Impostazioni** (`/impostazioni`): moltiplicatori dei livelli sfidante/irraggiungibile,
  premi al raggiungimento, voci di costo del P&L (COGS %, costi fissi).

## Dati

Seed 2026 estratto da **Monitoraggio 2026.xlsx** (foglio `SALES GLOBAL 26 - REVISED`:
vendite/ADV HP mensili per maison) e **budget pubblicati.xlsx** (foglio
`TARGET NUOVI CLIENTI`: linee commerciali). Totali verificati con i file:
Deluxy.it €1.492.440 (ADV €200k), Flowers €300.000, Cake €119.000, B2B €225.000,
Experience €22.500; linee €504.000 / 317 attivazioni.

Il COGS di partenza (65%) deriva dal margine stimato 2026 dei budget pubblicati (≈35%).
Il motore di calcolo è `src/lib/calc.ts` (mai valori derivati a DB).

## La spesa pubblicitaria viene dalla banca; Marketing dice quanta ne conosciamo

In quest'app «ADV» vuol dire due cose, e vanno tenute separate:

- **a budget** (`/spese`, `/piattaforme`) è quanto **si può** spendere: una percentuale sulle
  vendite per maison e mese. Nasce qui, ed è anche il numero che esce dall'API `/api/v1/maison`;
- **a consuntivo** (P&L, Consuntivo, proposta di conto economico) è quanto si è speso davvero: le
  **uscite di banca** categorizzate «Marketing e ADV» nel CFO, con le rettifiche di competenza
  applicate come a ogni altra voce.

> **Per un giorno (28/07/2026) la riga è stata la spesa delle campagne da Deluxy Marketing. Era
> sbagliato, e la ragione va lasciata scritta**: Marketing conosce solo le **campagne collegate**,
> quindi il suo totale è per costruzione un sottoinsieme — misurato sul 2026, il 46% di quello che
> il conto ha pagato. Un conto economico costruito su un sottoinsieme mostra un EBITDA più bello del
> vero, che è il modo peggiore di sbagliare. La banca invece vede tutto quello che è stato pagato,
> comprese le piattaforme che nessuno ha collegato.

**Marketing resta accanto, come misura della copertura** (`GET /api/v1/spesa?raggruppa=mese`, client
`src/lib/marketing.ts`, chiave `MARKETING_API_KEY`): nel consuntivo è `advMarketing`, e il P&L
scrive «Marketing ne spiega X (Y%)». È anche l'unico posto in cui quella spesa è divisa **per brand
e per campagna**, cosa che la banca non sa. Se Marketing non risponde, `advMarketing` è `null` e la
frase sparisce: il conto economico non cambia di una virgola.

Il confronto mese per mese sta in `/competenza` (`src/lib/adv-competenza.ts`), con la colonna «non
spiegato»: se la banca è molto più alta, mancano account da collegare in Marketing.

### La differenza fra cassa e campagne, e cosa farne

In `/competenza` c'è il confronto mese per mese (uscito dal conto / campagne collegate / **non
spiegato**) e **un gesto solo** per portare un importo in competenza di un altro anno, spalmato
sulle **controparti vere** di ogni mese in proporzione a quanto ciascuna ha preso — una rettifica
deve poter nominare da quale addebito viene, altrimenti nel CFO resta un importo senza categoria che
non entra in nessuna voce di P&L. Premere due volte non raddoppia: quello che è già stato spostato
si scala dalla differenza.

> **Non è automatico, di proposito** — e verificato sui movimenti il 28/07/2026, la parte «non
> spiegata» **non va spostata**: è copertura, non competenza. Google e Meta addebitano **a soglia**: importi fissi (500 € Google,
> 800 € Meta) ogni due o tre giorni per tutto il mese, quindi il denaro esce entro pochi giorni dalla
> campagna. Su tutti i movimenti pubblicitari noti a Qonto, quelli con *anno di emissione* diverso
> dall'*anno di regolamento* sono **zero**. L'unica coda è il residuo sotto soglia addebitato l'1–2
> del mese (7.718 € sul 2026, in 26 addebiti), che riguarda il **mese** prima, non l'anno.
>
> **La competenza della pubblicità è quindi l'anno della transazione** (decisione dell'utente,
> 28/07/2026). Il bottone resta per i casi veri — una fattura di dicembre pagata a gennaio — non per
> il totale.

**Le regole della categoria «Marketing e ADV» erano sbagliate in due sensi opposti**, corrette il
28/07/2026. Erano le parole `google`, `meta`, `facebook`, `tiktok`, `ads`, `klaviyo` cercate dentro
il nome della controparte:

- prendevano cose che pubblicità non sono — Google Cloud, Workspace, One e Play (3.073 € sul 2026,
  ora in *Software*), i distributori `ADS … TAMOIL` (benzina, ora in *Struttura*), `PAM META`
  (supermercato, ora fra i *Fornitori*);
- e **lasciavano fuori quasi tutta Meta**: gli addebiti si chiamano `FACEBK *…`, che non contiene
  «facebook». Finivano in ADV solo quelli con `fb.me/ads` nel nome, per via della regola `ads`.
  Erano **9.248 € del 2026 senza categoria**, cioè fuori da ogni voce di P&L.

Le regole ora nominano la piattaforma: `google*ads`, `google *ads`, `google ads`, `facebk`,
`metapay`, `tiktok ads`, `klaviyo`. Uscite di banca ADV 2026: **91.224 → 97.013 €**; 2025:
43.443 → 42.484 €. Siccome la riga ADV è la banca, **questa correzione entra dritta nel conto
economico**: era la categoria a essere sbagliata, non il totale della banca.

**Come la competenza entra nella riga ADV**, che non è più cassa: quello che **entra** si somma alle
campagne (è spesa di quest'esercizio pagata altrove nel tempo, e nelle campagne dell'anno non
compare); quello che **esce** non si toglie dalle campagne — lì dentro non c'è mai stato, toglierlo
sarebbe sottrarre due volte — ma dalla cassa, che è il numero da cui è stato spostato. Con il
ripiego sulla banca la riga torna a essere cassa e la competenza vale in entrambi i versi.

## Cos'è un ricavo D2C (definizione dell'utente, 29/07/2026)

Quello che entra in cassa dai negozi non è un ricavo: una parte è denaro dei partner. E la parte che
resta a Deluxy **non è una percentuale unica** — sono due mestieri diversi, e dal 29/07/2026 l'app li
tiene separati (motore in `src/lib/ricavo-d2c.ts`, dati da `GET /api/vendor` di Finance):

1. gli ordini eseguiti dai **partner vendor**: lì Deluxy fattura una **fee sua**, concordata partner
   per partner — dal 15% al 25% — che Finance tiene scritta e applica **vendita per vendita**. Non
   si stima niente;
2. gli ordini eseguiti comprando dai **fornitori**: lì il ricavo è quanto resta dopo la merce, e
   finché non ci sono le riconciliazioni si usa una percentuale dichiarata (MARGINE_FORNITORI, oggi **35%**).

| Gen–Giu 2026 | | 8 mesi 2025 | |
|---|---:|---|---:|
| incassato | 516.517 € | incassato | 465.419 € |
| di cui dai partner | 243.082 € | di cui dai partner | 221.541 € |
| **fee + margine 20%** | **110.151 €** | **fee + margine 20%** | **96.086 €** |
| di cui dai fornitori | 273.436 € | di cui dai fornitori | 243.878 € |
| margine stimato 35% | 74.433 € | margine stimato 35% | 65.972 € |
| **ricavo D2C** | **184.584 €** | **ricavo D2C** | **162.058 €** |

**Perché non basta più la quota misurata dalla banca** (`1 − pagato ÷ venduto`): quel conto divide
*tutti* i pagamenti ai fioristi per il *solo* venduto dei negozi, quindi ci mette dentro anche i
fioristi che hanno eseguito ordini B2B ed eventi. Peggiorava ogni volta che si classificava meglio la
banca — 39,1% la mattina del 29/07, 27,1% la sera — che è il contrario di come deve comportarsi una
misura. Resta come **ripiego dichiarato** per gli anni in cui le vendite dei partner non sono caricate.

> ⚠️ **Un mese senza vendite vendor caricate non è un mese senza partner.** Le vendite si inseriscono
> a mano in Finance: un mese vuoto farebbe finire tutto l'incasso fra i «fornitori» e gli
> attribuirebbe il 25%, cioè un ricavo che sembra misurato e invece è un foglio non inserito. Sotto
> il **15%** del proprio incasso il mese si dichiara **non misurato** e resta fuori dai totali — nei
> mesi pieni il venduto dei partner sta fra il 40% e il 60%. Oggi restano fuori **luglio 2026** e
> **agosto, settembre, novembre, dicembre 2025**.
>
> **Verificato il 31/07/2026 su `/api/vendor?anno=2026`: luglio è ancora vuoto.** Il mese ha
> **137 €** di venduto vendor su una riga sola, contro ~95.700 € di incasso — lo **0,14%**, cioè
> nemmeno vicino alla soglia. Il meccanismo funziona ed è dalla parte giusta: luglio resta fuori
> dai totali invece di far passare l'intero incasso per «ordini eseguiti da fornitori» e
> attribuirgli il 35% di margine. **Non c'è niente da correggere in Budgets**: il foglio delle
> vendite vendor si inserisce a mano in Finance, e il giorno in cui c'è i 95.688 € entrano nel
> ricavo D2C da soli. I sei mesi caricati stanno fra 27.686 e 51.051 € di venduto vendor.

> **Le commissioni di affiliazione invece stanno in B2B** (decisione dell'utente, 29/07/2026). Erano
> state provate su D2C — nascono da una vendita fatta sul sito — ma la voce di Finance
> «Affiliazioni» (1.850 € nel 2026) resta nel B2B insieme a Consegne, Food Supplier, Magazzino e
> Clientelling. Quindi la riga D2C del consuntivo è **solo** la differenza incasso − pagato.

> ⚠️ **«Altro» non è mappata su nessuna voce di budget** (2.005 € nel 2026, 2 fatture): è fatturato
> che non entra nei ricavi di nessuno. Si aggancia in Margini, campo «Voci in Finance».

## Modello C: intermediario sull'ecommerce, venditore sugli eventi

Deciso il 28/07/2026 rispondendo alle quattro domande che distinguono un venditore da un
intermediario:

| | Ecommerce (D2C) | Eventi / B2B |
|---|---|---|
| Chi documenta la vendita | il **partner** (scontrino) | **Deluxy** (fattura) |
| Chi decide il prezzo | Deluxy (sito) | Deluxy (trattativa) |
| Rischio reso / errore | scaricato sul fornitore | scaricato sul fornitore |
| Il fornitore fattura a | — | **Deluxy** |
| **Ne consegue** | **intermediario**: ricavo = la quota | **venditore**: ricavo = fatturato pieno |

Conseguenze in app, e sono due:

1. **I pagamenti ai partner dell'ecommerce non sono un costo**: sono una partita di giro. Le
   categorie che li contengono si marcano **«quota partner»** nel CFO, il che le tiene fuori dal
   conto economico. I fornitori degli **eventi** restano un costo pieno, come devono.
2. **La quota che resta a Deluxy si misura, non si stima**: `1 − (pagato ai partner ÷ venduto)`,
   anno per anno, dalle stesse categorie marcate. Motore in `src/lib/quota.ts`.

Sul 2026 la misura dà **39,1%** contro il 40% che era stimato a tavolino: la stima era buona, ma
adesso è un dato e si aggiorna da sola. Sul **2025 no**, e la pagina lo dice: l'archivio di banca
parte da luglio mentre il venduto copre tutto l'anno, e dividere mezzo anno di pagamenti per un anno
di vendite darebbe una quota altissima e falsa — quindi lì resta la stima, dichiarata.

> Il modello regge **solo se lo scontrino del partner c'è davvero**. Se non viene emesso, quella
> vendita al consumatore non è documentata da nessuno: Deluxy ha incassato 100 e ne dichiara ~39 di
> provvigione. È la prima cosa da verificare coi partner.

**Perché non il modello A (rivenditore).** Su 100 € incassati da un consumatore, con il partner
pagato 60 al 10% di IVA: da rivenditore al 22% verseresti 12,58 € di IVA e ti resterebbero 27,42; da
intermediario ne versi 7,21 e ne restano 32,79. Sono **5,37 € ogni 100, il 16% del margine**, e
nascono dal rivendere al 22% un prodotto comprato al 10% a chi l'IVA non la recupera. Sugli
**eventi** il problema non esiste: il cliente è un'azienda e l'IVA se la detrae, quindi lì il
modello lordo non costa niente.

## Due lenti sulla stessa categoria: P&L gestionale e bilancio civilistico

Ogni categoria del CFO ha **due** classificazioni, e non sono un doppione:

- **`tipoPL`** (COGS / ADV / PERSONALE / STRUTTURA / ESCLUSA) risponde a «quanto margine faccio».
  È quella che alimenta il P&L quotidiano;
- **`voceCE`** (B6 / B7 / B8 / B9 / B14 / C17 / esclusa) risponde a «cosa scrivo in bilancio».

Servono entrambe perché divergono, e il bilancio 2024 di Deluxy fa vedere quanto:

| Nel P&L dell'app | In bilancio | 2024 |
|---|---|---|
| Pubblicità, voce a sé | dentro **B7 servizi** | 82.802 € |
| Costo del personale | **B9**, ma solo lavoro dipendente | 36.725 € |
| — | amministratore, co.co.co., occasionali → **B7** | 42.625 € |
| Struttura, voce unica | divisa fra **B7**, **B8**, **B14** | 5.388 + 29.694 € |
| Costo per servizi | **B7**, non B6 | 278.457 € |
| — | **B6 merci** (fiori, torte) | 42.299 € |

**Una categoria raccoglie il residuo.** Nel CFO si può spuntare «raccoglie il residuo» su una
categoria sola: tutto quello che nessuna regola prende finisce lì, invece di restare «non
categorizzato» e fuori da ogni voce di conto economico. Serve perché la coda è fatta di **1.258
controparti da ~90 € l'una** (nomi di persona: fioristi e valet pagati per singoli ordini): scrivere
una regola a testa non aggiunge verità, solo righe. Oggi la raccoglie «Altre uscite (da
classificare)» — 117.364 € sul 2026 — e la copertura del CFO è al **100%**.

La voce di bilancio si sceglie nel [CFO](https://deluxy-budgets.vercel.app/cfo), colonna «Voce di
bilancio». Una categoria che nessuno ha ancora deciso mostra **«dedotta, da confermare»** e usa il
valore ricavato da `tipoPL` (quasi tutto B7): la proposta di conto economico le elenca invece di far
finta che siano state scelte. `GET /api/v1/categorie` espone `voceCE` accanto a `tipoPL`.

**A cosa serve davvero**: la proposta in `/conto-economico` somma le uscite **per voce di bilancio**,
e accanto a ogni voce mostra quanto valeva nell'ultimo bilancio vero con la variazione %. È così che
saltano fuori gli errori di classificazione — al 28/07/2026 il B6 proposto per il 2026 è 349.377 €
contro 42.299 € del 2024, perché dentro «Fornitori fiori e torte» ci sono i pagamenti ai partner, che
merce non sono; e il B9 è 217.254 € contro 36.725 €, perché l'anagrafica Dipendenti comprende molto
più del lavoro dipendente.

## Perché l'app era lenta, e cosa è cambiato (29/07/2026)

Ogni pagina del consuntivo faceva **una chiamata a Finance per ogni mese** — dodici viaggi di rete
per disegnare l'andamento mensile — e tutte le letture verso le altre app erano `no-store`, quindi
si rifacevano da capo anche solo passando dal Consuntivo al P&L, che guardano gli stessi numeri.
Due interventi:

- **Il fatturato mensile arriva in una chiamata sola**: `GET /api/tipologie?raggruppa=mese` su
  Finance restituisce i dodici mesi di ogni tipologia. Misurato su Gen–Lug: **0,8 s contro 2,4 s**,
  e soprattutto una query invece di dodici sul server di Finance. Se Finance non è aggiornato si
  torna da soli alla vecchia strada, invece di mostrare un andamento tutto a zero.
- **Le letture verso Finance, Orders, Marketing e Scout durano un minuto** (`RIVALIDA` in
  `src/lib/cache.ts`). Un minuto perché questi conti si muovono quando arriva un movimento in banca
  o un ordine, non da un secondo all'altro, e nessuna decisione cambia perché un totale è vecchio di
  sessanta secondi. Le **scritture** non passano di qui: dopo un salvataggio la pagina si ricarica e
  rilegge.

Verificato che i numeri non cambiano: la somma dei dodici mesi coincide all'euro con l'aggregato del
periodo (185.949 € su Gen–Lug 2026).

## Tasse () — una perdita non vuol dire zero imposte

Nel 2024 Deluxy ha chiuso con una **perdita di 21.130 €** e ha pagato imposte lo stesso: il reddito
**fiscale** era **+48.970 €** e la base IRAP 97.120 €. Il gestionale guarda l'EBITDA e di quella
differenza non sa niente — un F24 a giugno che nessuna pagina aveva anticipato.

La pagina parte dal risultato ante imposte del bilancio (o dall'EBITDA, dichiarandolo, se il bilancio
non c'è ancora), somma le **variazioni in aumento** applicando le regole del TUIR alle categorie del
CFO — vitto e alloggio al 75%, veicoli non strumentali al 20%, imposte indeducibili da se stesse,
oneri finanziari e compenso amministratore deducibili IRES ma non IRAP — e calcola **IRES 24%** e
**IRAP 3,9%**. Motore in .

> ⚠️ **Quanto vale questa stima, misurato**: sul 2024 le variazioni vere sono state **70.100 €**, e
> le percentuali per categoria ne spiegano **1.385 — il 2%**. Il resto sono voci che l'app non vede
> (accantonamenti, ammortamenti oltre i coefficienti, compensi deliberati e non pagati, perdite su
> crediti). Quindi il numero è un **minimo**, non una previsione, e la pagina lo scrive in rosso in
> cima. Il metro più affidabile resta il rapporto dell'ultimo anno vero: nel 2024 le variazioni
> valevano il **16% dei costi**.

**Due di quelle voci ora hanno un campo** (31/07/2026), perché sono le due che spostano di più e
nessuna fonte dell'app le può sapere: le **perdite fiscali riportabili** da esercizi precedenti e
l'**eccedenza degli ammortamenti civilistici sui fiscali**. Si scrivono a mano in
`/conto-economico`, sezione «Dati fiscali dal commercialista» — **fuori dallo schema di legge**,
perché voci di conto economico non sono e in nessun totale devono entrare (codici `FPERDITE` e
`FAMMORT` in `VOCI_FISCALI`, stessa tabella `VoceBilancio`: nessuna migrazione).

In `/tasse` compare la catena **«Dal risultato all'imponibile»** riga per riga: risultato ante
imposte + costi non deducibili + ammortamenti eccedenti = reddito lordo, meno le perdite usate =
imponibile. Due regole scritte nel motore (`src/lib/tasse.ts`):

- **le perdite non azzerano l'IRES**: si usano fino all'**80%** dell'imponibile (art. 84 TUIR),
  quindi anche con perdite più grandi del reddito un quinto resta tassato — e valgono solo
  sull'IRES, mentre **l'IRAP si paga lo stesso** perché ha una base sua che non parte dall'utile;
- **vuoto non è zero**: finché il campo non è compilato la stima passa `undefined` e la pagina
  scrive «non comunicato», invece di calcolare come se il commercialista avesse detto zero. Con le
  perdite mancanti l'IRES stimata è un **massimo** — e Deluxy il 2024 l'ha chiuso in perdita
  civilistica, quindi qualcosa quasi certamente c'è.

Restano fuori ROL sugli interessi, ACE e crediti d'imposta, il tetto dell'1,5% sulla rappresentanza
e la deducibilità **per cassa** del compenso amministratore: ognuna può spostare il conto di
migliaia di euro, e sono elencate in fondo alla pagina invece di essere taciute.

## Utenti e ruoli (Configurazione → Accesso, 29/07/2026)

Prima si entrava con **una password sola, condivisa**: in queste pagine ci sono stipendi, premi e
margini, e una password che gira in chat non si revoca — si cambia per tutti. Ora ogni persona ha il
proprio accesso (, motore in ): si entra scrivendo **email e
password**, e si sa **chi** è entrato.

| Ruolo | Cosa può fare |
| --- | --- |
| **Amministratore** | tutto |
| **Sola lettura** (il commercialista) | vede **tutte** le pagine, non modifica **niente** |
| **Responsabile** | solo : manda il proprio budget, non vede stipendi né margini |

> **La sola lettura è una serratura, non un cartello.** Nascondere i bottoni non basta: il blocco è
> nel middleware ed è **sul metodo** — per quel ruolo passano solo GET e HEAD, tutto il resto riceve
> **403**. Ferma anche le *server action*, che sono POST verso la pagina stessa, quindi non si
> modifica nemmeno passando di lato. Restano possibili solo login e logout: chiudere la propria
> sessione non è una modifica dei dati.

Le password si salvano con **scrypt** (sale casuale, confronto a tempo costante) e non tornano mai
indietro: nemmeno un amministratore può rileggerle, può solo sostituirle. Minimo dieci caratteri.
Chi non serve più si **disattiva, non si cancella** — resta lo storico di chi aveva accesso. E
**l'ultimo amministratore attivo non si può disattivare né degradare**: un'app in cui nessuno può più
entrare non è più sicura, è solo rotta.

> **La password di team resta come via di riserva**: si entra lasciando vuota l'email, con pieni
> poteri. Se il database non risponde o gli utenti non ci sono ancora, nessuno resta chiuso fuori. È
> una porta che resta aperta, ed è una scelta — ma chi entra da lì non ha un nome.


### IVA: quanto mettere da parte

Dentro la stessa pagina, perche e la stessa domanda — quanta cassa serve per il fisco — ma il conto e
un altro. **L IVA non e un costo** e non passa dal conto economico: e denaro incassato per conto dello
Stato che va riversato. Ma **e cassa che esce**, e chi la spende credendola sua si trova scoperto il 16.

Il conto: IVA incassata sulle vendite meno IVA pagata e detraibile sugli acquisti. Le tre parti del
debito, sul 2026: **42.739 euro** dalle fatture emesse (dato vero, Finance separa gia imponibile e IVA),
**24.233 euro** sulle provvigioni dell ecommerce e **13.422 euro** sul margine degli ordini eseguiti
da fornitori. Il credito vale **38.802 euro**: da versare **41.593 euro**, cioe **3.466 euro al mese**
da accantonare. Sul 2025 il saldo era molto piu basso — 4.955 euro — perche il credito sugli acquisti
quasi pareggiava il debito.

> **Sull ecommerce si versa l IVA solo sulla provvigione**, non sul venduto: nel modello C il prezzo
> pieno lo incassa il partner e l IVA la fa lui col suo scontrino. Contarla sul venduto vorrebbe dire
> versare l IVA di un altro. Sulla parte comprata dai fornitori invece Deluxy compra e rivende, quindi
> l IVA netta e quella sul **margine**.

> ⚠️ **I fiori stanno al 10%, e adesso il conto lo sa** (31/07/2026). Prima si scorporava il 22% da
> **tutte** le spese, ma fiori, piante e prodotti del florovivaismo scontano l'aliquota ridotta del
> **10%** (tabella A parte III, DPR 633/72) — cioè esattamente quello che Deluxy compra di più.
> Scorporare il 22% da una spesa che il 22% non l'ha mai avuto tira fuori il **doppio** dell'IVA
> davvero pagata: su 1.000 € di fiori 180 € invece di 91. E siccome il credito si sottrae dal
> debito, il numero che ne usciva peggio era proprio quello per cui la pagina esiste — **quanto
> accantonare**, che risultava più basso del vero. Ora l'aliquota si sceglie **per categoria**
> (`ALIQUOTA_PER_CATEGORIA` in `src/lib/iva.ts`): *Materiali per gli ordini* e *Partner che
> eseguono gli ordini* al 10%, tutto il resto al 22%, e la tabella del credito ha la colonna
> **Aliquota** — senza, un credito più basso sembra un errore di conto invece di una scelta.
>
> Due cose da sapere. La regola sta sulla **categoria** e non sul singolo movimento, perché la
> banca dice **a chi** hai pagato, non cosa c'era in fattura: è un'approssimazione, dichiarata, ma
> molto più vicina del 22% su tutto. E **sul debito il 10% non è stato applicato**: il margine
> sugli ordini eseguiti da fornitori resta scorporato al 22%; se anche la vendita al consumatore è
> di fiori al 10%, quella riga è più alta del vero — cioè l'errore che resta è dalla parte
> prudente. Il 4% non è gestito.

> ⚠️ **La detraibilita non e mai piena su tutto**: veicoli al 40%, rappresentanza **indetraibile** (salvo
> omaggi sotto i 50 euro), stipendi e tributi fuori campo, quota partner senza fattura. Le categorie a
> zero non compaiono nella tabella del credito: su quelle non c e niente da detrarre. E resta una stima
> **di cassa**, non la liquidazione vera, che si fa sui registri per data di fattura: qui gli acquisti
> arrivano dalla banca, cioe da quando il denaro e uscito. Motore in .

## Chiavi (cassaforte del Hub)

Le chiavi (`FINANCE_API_KEY`, `ORDERS_API_KEY`, `OPENAI_API_KEY`, …) non stanno nel `.env` di questa app: si
chiedono al **Hub** (pagina `/chiavi`, progetto `deluxy-budgets`) tramite `GET /api/chiavi`,
autenticandosi con il token di servizio `HUB_KEYS_TOKEN` (uguale a quello del Hub). Il client è
`src/lib/chiavi.ts`: scarica le chiavi del progetto una volta (cache 5 min) e le usa a runtime.
In sviluppo una chiave presente nel `.env` locale ha la **precedenza** sul Hub, così si può
lavorare offline. Serve quindi solo `HUB_URL` + `HUB_KEYS_TOKEN` in produzione; tutto il resto
vive nel vault.

## Stack e avvio

Next.js 15 + React 19 + Prisma. In sviluppo il DB è **SQLite** (`prisma/dev.db`, zero
configurazione); in **produzione** gira su **Postgres/Supabase** (provider `postgresql` in
`prisma/schema.prisma`, `DATABASE_URL` + `DIRECT_URL`), protetta da `BUDGETS_APP_PASSWORD`.

```bash
npm install
cp .env.example .env      # DATABASE_URL="file:./dev.db"
npm run db:push
npm run db:seed
npm run dev               # http://localhost:3080
```

### Produzione: come si pubblica e dove gira

- **Ultima pubblicazione**: 17/08/2026, commit `f04e37f0` (costi ricorrenti + `senzaRegola`).
  Verificato dopo il deploy: `/api/health` → `{"ok":true,"database":true}`, header `fra1::fra1`, e la
  rotta `/ricorrenti` compare nel build di Vercel. ⚠️ Dal fuori non si distingue una pagina che non
  esiste da una che esiste: il middleware manda **tutto** a `/login` con un 307, quindi «307 → /login»
  non è la prova che una rotta nuova sia andata su. La prova è il log di build
  (`npx vercel inspect <url-del-deploy> --logs`, sezione «Route (app)»).
- **Il push su GitHub NON pubblica**: il progetto Vercel `deluxy-budgets` non è collegato al branch
  (verificato il 09/08/2026: dopo il push la produzione era ferma a otto giorni prima). Si pubblica
  **dalla cartella dell'app**: `cd deluxy-budgets; npx vercel deploy --prod --yes` (~40 s), poi
  `npx vercel inspect https://deluxy-budgets.vercel.app` deve mostrare l'URL del deploy appena fatto.
  Sintomo tipico se ci si dimentica: «il codice è su GitHub ma la funzione non si vede».
- **Le funzioni girano a Francoforte** (`vercel.json`, `"regions": ["fra1"]`, aggiunto il
  17/08/2026): il Postgres condiviso è in `eu-central-1` e senza quel file Vercel esegue a Washington
  (`iad1`), facendo attraversare l'Atlantico a ogni query. Si riconosce dall'header della risposta:
  `X-Vercel-Id: fra1::iad1::…` è sbagliato, `fra1::fra1::…` è giusto. Misurato (minimo su più
  giri, perché un giro solo misura il cold start): `/api/health` (una query) **696 → 166 ms**,
  `/login` **739 → 183 ms** — tre quarti del tempo era la distanza, non l'app.
- **Variabili d'ambiente in produzione al 17/08/2026** (nove): `DATABASE_URL`, `DIRECT_URL`,
  `HUB_URL`, `BUDGETS_APP_PASSWORD`, `BUDGETS_API_KEY`, `FINANCE_API_KEY`, `ORDERS_URL`,
  `ORDERS_API_KEY`, `MARKETING_API_KEY` (quest'ultima dal 09/08). Nella cassaforte dell'app c'è
  `OPENAI_API_KEY`. **Mancano ancora `HUB_SSO_SECRET` e `APP_SECRET`**: finché manca il primo,
  l'accesso dal Hub non funziona e l'app chiede la password di team. Aggiungerle con
  `vercel env add NOME production --value "…" --sensitive`, mai da stdin (ci infila un a-capo).

## Le categorie di spesa dicono cosa sono (riassetto del 29/07/2026)

Le categorie avevano solo un nome, e il nome non basta: «Fornitori / COGS» non dice niente a chi
non l'ha creata, e chi deve assegnare una controparte finisce per indovinare — cioè per mettere la
stessa spesa oggi in una categoria e domani in un'altra. Tre cose cambiate:

1. **Ogni categoria ha una descrizione** (campo `descrizione`, scritto nel CFO e letto ovunque la
   categoria compaia): *cosa ci va dentro e cosa no*. Le 18 categorie ce l'hanno tutte.
2. **Nomi che si capiscono senza saperne la storia**: `Fornitori fiori e torte` → **Partner che
   eseguono gli ordini** (è il loro incasso, non un costo), `Servizi Personale Consegne` →
   **Consegne (valet e corrieri)**, `Personale Azienda` → **Stipendi dei dipendenti**, `Sviluppi
   Software` / `Software` → **Sviluppo su commessa** (freelance) e **Abbonamenti software** (canoni),
   che prima si confondevano. `Altre uscite (da classificare)` → **Da classificare**: non è una
   categoria, è la coda del lavoro da fare.
3. **Un doppione fuso**: `Fornitori / COGS` conteneva fioristi ed era già quota partner come
   `Fornitori fiori e torte` — 84 regole spostate, categoria eliminata. Nessun euro si è mosso
   (stesso `tipoPL` e stesso `voceCE`): erano due nomi per la stessa cosa, e due nomi per la stessa
   cosa sono un modo garantito di dividere i totali a caso.

### La regola «sumup» teneva 59 fornitori fuori dal conto economico

Il riassetto ha fatto emergere l'errore più caro della giornata: in «Banca e giroconti» c'era una
regola generica **`sumup`**, e siccome SumUp è un **POS**, quella regola non prendeva spese bancarie
— prendeva **chiunque incassasse con SumUp**: 59 controparti per **9.455 €**, quasi tutte fioristi e
pasticcerie che eseguono ordini (`SUMUP *FIORI E PIANTE`, `SUMUP *EMILI FLOWERS`, `SUMUP *PATISSERIE
BO`, `SumUp *Les reveries`), più un NCC che fa consegne e un'enoteca. Tenuti fuori dal P&L come se
fossero commissioni di banca.

Regola rimossa e sostituita da **31 regole per nome**. Effetto sul 2026: banca 41.548 → **34.083 €**,
partner 436.274 → **440.971 €**, consegne 26.243 → **27.402 €**. Nella stessa passata:
`donato nicolo` da **Stipendi dei dipendenti** a **Amministratore e collaboratori** (11.500 €, che in
bilancio è B7 e non B9), e **Signorvino** da rappresentanza a **Materiali per gli ordini** — è un
fornitore di vini, non un pranzo.

> **Da qui la regola generale**: una regola che matcha il **circuito di pagamento** (`sumup`,
> `paypal`, `satispay`) non classifica una spesa, classifica **come è stata pagata**. Il POS non dice
> niente su cosa hai comprato, e mettendo tutto in «banca» si nasconde un costo vero dentro una voce
> che nessuno guarda.

Anche le **etichette delle due lenti** sono state riscritte per chi sceglie, non per chi legge il
codice civile: «Costo del servizio», «Fuori dal conto economico», «B6 · Roba comprata», «B7 · Servizi
di qualcun altro», «B9 · Dipendenti» — ognuna con la riga che dice **quando sceglierla e quando no**,
perché gli errori stanno sui confini. Aggiunta la voce **imposte sul reddito**, che prima non era
selezionabile.

## La causale del bonifico dice cosa è (criterio dell'utente, 28/07/2026)

Il nome della controparte non basta a capire cosa sia un pagamento: `Formenti Patrizia` può
essere una fiorista o una valet. **La descrizione del movimento lo dice**, e questo è il criterio:

| Nella causale c'è… | È… | Dove va |
|---|---|---|
| un **numero d'ordine** (`2104`, `9139`) | fioraio pagato per quel singolo ordine | **quota partner** |
| **«vendite» / «vostri incassi»** | gli si gira il suo incasso | **quota partner** |
| un **mese** (`gennaio`, `Deluxy Dicembre 2025`) | rimborso servizi del **valet** | **costo vero** |
| niente (pagamento con carta al POS) | non si sa | resta nel residuo |

### I rimborsi ai clienti non sono un costo (29/07/2026)

Un bonifico `Rimborso ordine 10858` **non va fra i costi**, e la ragione è che il venduto
letto da Orders **esclude già** gli ordini annullati e rimborsati. Verificato su quel caso:
l'ordine #10858 di deluxy.it, 13/02/2026, 250 € — `REFUNDED` e annullato — non è mai entrato
nei ricavi, e il bonifico di pari importo è la restituzione di un incasso che il conto economico
non ha mai visto. Contarlo come costo toglierebbe **due volte** lo stesso denaro. Categoria
dedicata **«Rimborsi ai clienti»**, fuori dal conto economico.

> ⚠️ **L'eccezione sono i rimborsi parziali**: Orders li conta **per intero** (l'importo reso non
> esiste nel registro ordini) — sul 2026 sono **32 ordini per 4.802 €** di valore. Per quelli il
> ricavo resta gonfiato dell'importo restituito, e tenere il rimborso fuori dai costi non lo
> corregge. È un errore piccolo e dichiarato, non un errore nascosto: si chiude quando Orders saprà
> dire quanto è stato reso.

### Il criterio applicato ai bonifici alle persone (29/07/2026)

Sui bonifici a nomi di persona la regola dell'utente è: **numero d'ordine, «ordine», «fiori» o
«torta» nella causale ⇒ fioraio** (partner); **altrimenti ⇒ personale per le consegne**. Applicata
leggendo le causali vere di 59 controparti: 33 ai partner (6.297 €), 26 alle consegne (4.136 €).

Tre precisazioni che sono servite per non sbagliare, e che valgono anche la prossima volta:

- **senza causale non si decide**: uno scontrino al POS non è né un fioraio né un valet, e
  assegnarlo lo stesso avrebbe messo autogrill e supermercati fra le consegne. Restano nel residuo,
  dove si vedono;
- **un nome di mese vince su tutto**: `Deluxy Dicembre 2025` è il rimborso mensile di un valet, ma
  contiene un numero di quattro cifre che lo faceva sembrare un ordine. Gli anni non sono numeri
  d'ordine;
- **`17/001` e `50/001` sono numeri di documento, non di ordine**: senza questa distinzione chi
  manda una fattura («SALDO proforma n. 17/001») veniva preso per fioraio.

> ⚠️ **Le regole del CFO matchano solo sulla controparte, non sulla causale.** La classificazione
> si è fatta leggendo `TransazioneBancaria.descrizione` in Finance e trasformandola in **regole per
> nome**: 563 regole, residuo 2026 da 117.364 a **23.705 €**. Se un domani serve rifarlo su nuovi
> movimenti, il criterio è questo — e varrebbe la pena farlo diventare una regola vera sulla
> causale, invece di ripetere l'esercizio a mano.

## Punti aperti (29/07/2026, rimisurati il 21/08/2026)

**Fotografia del 21/08/2026** (rimisurata interrogando Finance, Orders e Marketing come fa il
consuntivo; fra parentesi il valore precedente, del 17/08):

| | gen–ago (YTD) | gen–lug (mesi chiusi) |
| --- | --- | --- |
| Venduto ecommerce 2026 (Orders) | **667.403 €** (era 655.411) | 614.248 € |
| Ricavi a consuntivo | **425.442 €** — *identici* al 17/08 — D2C 219.197 (fee vendor 126.319 + margine fornitori 92.878), B2B 184.270, Eventi 21.975 | 425.246 € |
| Girato ai partner | **449.068 €** — *identici* al 17/08 → quota Deluxy **32,7%** (era 31,5%) | 443.934 € → quota **27,7%** |
| ADV: banca vs Marketing | **97.929 €** usciti — *identici dal 09/08* — contro **83.185 €** di campagne → Marketing ne spiega l'**85%** (era 78%) | 97.929 € vs 75.147 € |
| Uscite che nessuna regola riconosce | **4.988 €** (2026) e 23.548 € (2025) | 4.081 € |
| EBITDA a consuntivo | **+64.844 €**, 15,2% sui ricavi | **+74.427 €** |
| Uscite di banca 2026 (anno) | **847.690 €**, 3.375 movimenti, 1.674 controparti | — |

🔴 **Come leggere agosto: la banca di agosto è quasi tutta assente, e non si vedeva.** Misurato il
21/08/2026 mese per mese: giugno **416 movimenti** (306 controparti), luglio **408** (315), agosto
**31** (21) su ventun giorni — **un nono del ritmo normale**, distribuiti su tutto il mese (uno o due
al giorno, non un intervallo mancante). Conseguenze dirette sui numeri qui sopra: in tutto agosto
**zero uscite pubblicitarie** e **zero pagamenti ai partner**, quindi ADV, girato ai partner e ricavi
a consuntivo sono *identici alla misura del 17/08* mentre il venduto è cresciuto di 12.000 €. La
quota Deluxy che «sale» al 32,7% non è il business che migliora: è il denominatore che corre da solo.

⚠️⚠️ **E il modo in cui il 17/08 era stato verificato non bastava.** Quel giorno la freschezza era
stata controllata guardando l'**ultima data** (ultimo movimento: 15/08) e la conclusione era stata
«non è una sync ferma, è il ritardo fra vendita e pagamento». Il 21/08 l'ultimo movimento è **del
giorno stesso** — sembra ancora più in ordine — e intanto mancano nove decimi del mese. **L'ultima
data non dice che i dati ci sono tutti**: dice solo che qualcosa è arrivato. Si conta quanti
movimenti al giorno arrivano, confrontandoli con un mese chiuso. Il rimedio sta nella **sync Qonto di
Finance** (`deluxy-partner`), non qui; qui il consuntivo adesso lo dichiara (sotto, «Un mese con
qualche movimento sembra un mese intero»).

Chiusi rispetto al 29/07: il **buco Meta in Marketing** (punto «storico Meta assente») e **luglio dei
vendor**. La coda di quel buco si è ristretta ma non è sparita: `flowers/meta_ads` è passato da 103
giorni su 229 a **191 su 233** e `cake/meta_ads` sta a **196 su 233** — sopra la soglia dell'80%,
quindi Marketing torna a dichiarare la copertura «completa» mentre **79 giorni restano scoperti**
(≈ 1.280 € di spesa che il totale non conta). Vedi «Una soglia attraversata non è un buco chiuso».
Restano aperti tutti i punti qui sotto, più i due nuovi: i **movimenti che Finance non ha
ancora riclassificato** e le **variabili d'ambiente mancanti su Vercel** (in produzione ci sono solo
`DATABASE_URL`, `DIRECT_URL`, `HUB_URL`, `BUDGETS_APP_PASSWORD`, `BUDGETS_API_KEY`, `FINANCE_API_KEY`,
`ORDERS_URL`, `ORDERS_API_KEY`; nella cassaforte dell'app c'è **solo `OPENAI_API_KEY`**). In
particolare **`MARKETING_API_KEY` non c'era né nell'ambiente né in cassaforte**: in produzione la
riga «di questi ADV, Marketing ne spiega X%» del consuntivo non si vedeva affatto e il P&L ripiegava
in silenzio sulle sole uscite di banca. ✅ **Aggiunta il 09/08/2026** all'ambiente di produzione
(`vercel env add MARKETING_API_KEY production --value "…" --sensitive` — mai da stdin, che ci infila
un a-capo); ricontrollato il 17/08/2026: c'è. Restano fuori `HUB_SSO_SECRET` e `APP_SECRET` (punto 9).

1. ⚠️ **La quota Deluxy misurata**, al 17/08/2026, è **31,5%** sull'anno (449.068 € girati su
   655.411 € di venduto) — ma è **gonfiata dal mese in corso**, che porta le vendite di agosto senza
   i pagamenti ai partner di agosto: vedi l'avvertenza qui sopra. Sotto, la storia della misura, che
   spiega perché il numero si muove tanto. ⤵
   ⚠️ **La quota Deluxy misurata è scesa al 25,9% su Gen–Giu 2026** (382.801 € girati ai partner su
   516.517 € di venduto) — era 39,1% prima delle classificazioni del 29/07/2026. **Ogni fiorista che
   si riconosce abbassa la quota**, e siccome la quota moltiplica il venduto per fare i ricavi
   ecommerce del consuntivo, l'effetto sul P&L è grosso: sui mesi chiusi i ricavi ecommerce valgono
   **133.716 €** contro i 206.607 € che darebbe il 40% stimato — **73.000 € di differenza**. La
   misura è più onesta della stima, ma **è un limite inferiore**: quei pagamenti comprendono anche i
   fioristi degli ordini B2B ed eventi, che non si dividono per il venduto Shopify. Prima era un
   punto aperto teorico, ora sposta il conto economico: serve l'aggancio pagamento → ordine → canale.
   (Sull'anno intero la quota misurata è **28,4%**: 434.310 € su 606.919 di venduto.)
   ed è **distorta verso il basso**: quei pagamenti comprendono i fioristi degli ordini **B2B ed
   eventi**, che non si dividono per il venduto Shopify. Serve l'aggancio pagamento → ordine →
   canale. Finché manca, il 29% è un limite inferiore, non la misura.
2. ✅ **RISOLTO il 23/08/2026 — il costo del venduto contava la quota partner due volte.** Segnalato
   dall utente («il costo del venduto è troppo alto rispetto alle vendite che ci sono») ed era il punto
   aperto che stava qui: i margini per tipologia erano scritti sul **venduto lordo**, ma sul D2C il
   ricavo è già **netto** — 778.883 € venduti diventano 311.553 € di quota Deluxy — e sopra veniva
   tolto un altro 65% di costo del venduto (202.509 €). La quota partner spariva due volte: una
   convertendo il venduto in ricavo, una come costo.

   **Deciso dall utente**: margine D2C **da 35% a 100%**, cioè nessun costo del venduto sull ecommerce —
   la quota che va ai partner è una **partita di giro**, non un costo, ed è già fuori dal ricavo. È il
   modello C applicato fino in fondo. Su **Eventi e B2B** il costo resta (lì fattura Deluxy e il
   fornitore fattura a Deluxy): sono loro a tenere basso il margine, 246.400 € di costo su 308.000 € di
   ricavi B2B.

   | | Prima | Dopo |
   | --- | ---: | ---: |
   | Costo del venduto | 510.829 € | **308.320 €** |
   | Margine lordo | 186.123 € (26,7%) | **388.633 € (55,8%)** |
   | EBITDA (Raggiungibile) | −443.255 € | **−240.745 €** |

   ✅ **E le quote ADV dei mesi chiusi sono state riallineate** (23/08/2026, su ok dell utente). Erano
   rimaste quelle scritte con la regola vecchia — «% del venduto del mese» — e siccome i mesi chiusi
   sono in **sola lettura** nessuno poteva correggerle dall interfaccia. Il P&L attribuiva ai mesi
   passati **206.961 €** di pubblicità quando ne erano usciti **75.147**.

   Lo script è **`scripts/allinea-quote-adv-chiuse.ts`** (prova a vuoto senza argomenti, `scrivi` per
   applicare): `quota nuova = speso davvero ÷ monte annuo × 100`. Tocca **solo** i mesi chiusi, **solo**
   il campo `percent`, e **solo** dove Marketing ha una misura. **21 quote riscritte** su tre brand.

   | | Prima | Dopo |
   | --- | ---: | ---: |
   | Spesa ADV nel P&L | 412.125 € | **280.311 €** |
   | EBITDA (Raggiungibile) | −240.745 € | **−108.931 €** |

   ⭐ **Il riscontro che chiude il cerchio**: dopo il riallineamento i tre negozi sommano **esattamente
   100,0%** di quote sull anno — i mesi aperti li aveva già sistemati l utente, i chiusi adesso portano
   quelle vere. Non era un controllo previsto: è venuto fuori da solo, ed è la prova che le due metà
   ora parlano la stessa lingua.

   🔴 **Restano fuori B2B (218,4%) ed Experience (240%)**: in Marketing non hanno campagne, quindi non
   c è una misura con cui sostituire le loro quote — e i mesi chiusi non si scrivono a mano. Il P&L
   attribuisce loro **83.908 €** contro un monte di 38.077: **45.831 € di troppo**. Non li ho toccati
   perché «non misurato» non vuol dire «zero speso»: se quei due brand fanno pubblicità su canali che
   Marketing non legge, metterli a zero sarebbe inventare. È una decisione dell utente.

   ⭐ **Le due basi, confermate dall utente il 23/08/2026 e adesso scritte in pagina.** Sono diverse di
   proposito, e finché non lo si dice sembrano un errore di conto:

   | | Base | Perché |
   | --- | --- | --- |
   | **Budget pubblicitario** (`/spese`) | il **venduto globale**, prezzo pieno pagato dal cliente | la pubblicità genera il venduto **intero**, quindi è su quello che si misura quanto costa farlo |
   | **Conto economico** (`/pl`) | solo la **quota che resta a Deluxy** | il resto gira ai partner: partita di giro, non ricavo — e per la stessa ragione lì il costo del venduto D2C è zero |

   ⚠️ **E `/margini` diceva un terzo numero**: chiamava «ricavi» il venduto lordo (1.164.282 €) e
   mostrava un margine del 73,5% che nel P&L non compariva da nessuna parte — la stessa confusione che
   teneva in piedi il doppio conteggio. Ora la tabella ha **due colonne**, «Venduto a budget» e «Ricavi
   nel P&L», con la quota scritta sotto (`quota 40% del venduto`), e i totali coincidono con il conto
   economico: 1.164.282 € venduti → **696.953 € di ricavi**, margine **388.633 € (55,8%)**, costo del
   venduto **308.320 €**.

   ⚠️ **Il perché sta scritto dove si cambia il numero**: la nota della tipologia adesso si legge in
   `/margini` accanto alla riga, non solo a database — una spiegazione che non raggiunge chi sta per
   rimettere 35% non serve a niente. E l EBITDA resta negativo: con 217.254 € di personale e la riga ADV
   ancora gonfiata (sotto), il conto non torna comunque — ma adesso non è più un artefatto.
3. **4.903 € che nessuna regola riconosce** nel 2026 (146 controparti) e **23.548 €** sul 2025
   (545 controparti) — rimisurati il 17/08/2026. ⚠️ Attenzione a *dove* stanno: non sono fuori dal
   conto economico, sono dentro la categoria **«Da classificare»** (tipo di P&L: COGS), quindi il
   totale quadra ma la sua ripartizione per voce no. Vedi «Il residuo era tornato invisibile»
   più sotto. Il 2025 è dieci volte peggio del 2026 perché le 2.187 regole sono state scritte
   guardando l'elenco del 2026. Numeri del 29/07/2026, quando il residuo si misurava senza
   passare da Finance: **4.117 €** nel 2026 (140 controparti, copertura **99,5%**) e 4.015 € sul
   2025 (99,4%). Erano 23.705 € in 412 controparti la mattina del 29/07/2026: **2.187 regole** in
   tutto, scritte guardando l'elenco insieme all'utente. L'ultima passata ha sistemato LinkedIn
   (pubblicità), il software a canone (Tauros, Tavus, Apollo, Miro, Iubenda, WATI, Gloobo, OpenAI,
   Anthropic), gli acquisti per l'ecommerce (Metro, Rajapack, Amazon, Notino, champagne e vini,
   Giocattoli Quaglia), la rappresentanza (Cova, Carlsberg, cantina Giannone), le trasferte
   (autogrill, stabilimenti balneari, Villa Giada) e i **fioristi pagati online** — i nomi di persona
   senza causale, confermati dall'utente. Erano **23.705 in 412**: il
   29/07/2026, guardando l'elenco, l'utente ha riconosciuto le famiglie una per una e sono diventate
   **oltre 210 regole** — più tre categorie nuove: **Carburante e pedaggi** (81 regole, 2.962 €:
   distributori `ENI`, `PV####`, pedaggi `MISER`/`ASPIT`, parcheggi), **Viaggi e trasferte** e
   **Rimborsi ai clienti**. Prima di queste erano già diventate **129 regole** — i **fiorai** (41 nomi, anche esteri come `TLF*MIAMI FLOWERS`, `Everything
   Flowers` KE, `NATURELLE` FR) sono acquisti fiori **per ordini ecommerce**, quindi quota partner;
   **ristoranti e bar** (87 nomi) sono pasti e cene aziendali, quindi rappresentanza; `Gabriele
   Salazar Gordillo` è una partita IVA che **fa consegne**, quindi servizi di consegna. Effetto sul
   2026: costo per servizi 75.622 → **69.104 €**, struttura 53.392 → **56.615 €**, girato ai partner
   431.014 → **434.310 €**. Sette nomi ambigui (`ROSA LUNA`, `GINROSA`, `LA ROSA DEI VENTI`,
   `ORTOBELLO`, …) sono stati **lasciati fuori di proposito**: un fioraio messo fra i costi o un
   ristorante messo fra le partite di giro sposta denaro nel posto sbagliato e non se ne accorge più
   nessuno. Quello che resta è coda vera: carburante e pedaggi sotto sigla (`PV####`, `MISER
   DIREZ.`), materiali (`RAJAPACK` 255 €), 96 voci sotto i 10 € che valgono 412 € in tutto.
4. **529.364 € (il 66% delle uscite 2026) sono «fuori dal conto economico»**, ed è emerso aprendo la
   voce: dentro non c'è solo la quota partner (`Fornitori fiori e torte` 410.798 €, che è corretto
   escludere nel modello C) ma anche **Tasse e contributi 56.802 €** e **Banca e finanziari
   41.548 €**, che in bilancio esistono eccome — sono B14 e C17 — più **Fornitori / COGS 20.216 €**,
   che dal nome è un costo vero. Escludere è una decisione, e queste tre non sembrano decise: vanno
   riportate nelle loro voci.
5. **Il B7 2026 è per due terzi dedotto, non scelto**: su 224.907 €, cinque categorie (Marketing e
   ADV 97.729, Struttura e uffici 31.618, Eventi e catering 23.141, …) hanno la voce di bilancio
   **dedotta dal tipo di P&L** e mai confermata da nessuno. Il dettaglio le segna «dedotta, da
   confermare»: confermarle o spostarle è mezz'ora di lavoro e rende il bilancio proposto difendibile.
6. **PayPal**: 18.300 € nel 2025 e 8.600 nel 2026 stanno in «Banca e finanziari», esclusa dal P&L.
   Se dentro c'è pubblicità Meta il 2025 è sottostimato di quella cifra: serve l'estratto PayPal.
7. ✅ **RISOLTO il 29/07/2026 — il 2025 in banca è completo.** Mancava gennaio–15 luglio: la sync
   normale scarica dal più recente e si ferma a 30 pagine, quindi il vecchio non entrava mai.
   Recuperati **3.423 movimenti** con `deluxy-partner/scripts/recupera-qonto-storico.mjs` (intervallo
   di date + deduplica per hash): uscite 2025 da 668.322 a **1.113.632 €**, e i dodici mesi ci sono
   tutti. **Cosa dice il dato completo**: pubblicità 2025 **84.925 €**, che combacia con gli ~84.000
   ricostruiti dal bilancio 2024 — due strade indipendenti, stesso numero; e soprattutto la **quota
   Deluxy 2025 misurata è 41,6%**, sopra il 40% che era stato stimato a tavolino. Il che rende più
   sospetta la quota 2026 al 27,1%: la differenza fra i due anni non è il business, è quanto
   abbiamo classificato — sul 2026 sono state scritte 2.187 regole guardando l'elenco, sul 2025 no.
   **Non si aggiusta qui**: la sync Qonto vive in Finance (`deluxy-partner`), ed è lì che va alzato
   il limite di pagine.
   🔴 **Riaperto dall'altro capo il 21/08/2026**: risolto il passato, adesso manca il **presente**.
   Agosto 2026 ha **31 movimenti** contro i 408 di luglio, e questa volta non è un intervallo di date
   mancante ma un mese **rado** (uno o due movimenti al giorno, l'ultimo del giorno stesso). Quanto
   basta a togliere dal conto economico tutta la pubblicità e tutti i pagamenti ai partner del mese.
   Si chiude in Finance come sopra; qui il consuntivo ora lo dichiara.
8. **Google Ads `956-137-8913`** non è censito in Marketing (1.305 € nel 2026).
9. **`HUB_SSO_SECRET` e `APP_SECRET` mancano su Vercel** (ricontrollato con `vercel env ls
   production` il 17/08/2026: le variabili sono nove, quelle due non ci sono): senza il primo
   l'accesso dal Hub non funziona e l'app chiede la password di team. Due cose da sapere prima di
   aggiungerle. (a) `HUB_SSO_SECRET`: in **locale** il valore di Budgets e quello del Hub
   **coincidono** (confrontate le impronte SHA-256 dei due `.env`, senza stamparli), ma quello che
   conta è il valore in **produzione del Hub**, che da questa sessione non si è potuto leggere —
   copiarci sopra il valore locale senza quel confronto rischia di lasciare l'SSO rotto lo stesso,
   solo in un altro modo. (b) `APP_SECRET`: aggiungerlo **cambia il segreto che cifra la cassaforte**
   (oggi in produzione vince `BUDGETS_APP_PASSWORD`) → la `OPENAI_API_KEY` salvata lì diventa
   illeggibile e va reincollata subito dopo, altrimenti l'AI del CFO smette di funzionare in silenzio.
10. **Lo scontrino del partner**: il modello C regge solo se il fioraio lo emette davvero. Non è
    codice — è una verifica coi partner, ed è l'unico punto che può invalidare il resto.

## Stato

**FATTO**: schema dati, seed 2026 dai file Excel, dashboard 3 livelli, **P&L aziendale
completo** (annuale, mensile e per maison), **sezione Dipendenti** (RAL/stagisti/consulenti
con mesi di competenza), dettaglio maison D2C/Eventi/B2B, team commerciale per linee e
clienti, invio e lista proposte, spese ADV con % per mese personalizzabili, impostazioni
scenari/premi/costi, **consuntivo D2C dal registro ordini** (Orders `/api/v1/ricavi`: venduto per
maison e per mese, IVA inclusa come il budget), catalogo Hub aggiornato (id `budgets`, `APP_URL_BUDGETS`),
**pubblicata su Vercel** ([deluxy-budgets.vercel.app](https://deluxy-budgets.vercel.app), Postgres/Supabase + password),
**costi ricorrenti** (`/ricorrenti`: canoni, abbonamenti e noleggi in fila per regolarità, con proiezione annua e «forse cessati»).

**MANCA**:
- **Anno unico 2026**: nessun selettore d'anno; il pluriennale 2027-30 (già nei file pubblicati) non è caricato.
- **Proposte budget**: un Responsabile invia i suoi dodici mesi da /proposte/nuova; l admin apre la proposta (/proposte/[id]), vede il totale accanto a **quanto c e oggi a budget** sullo stesso ambito, **approva o respinge** con una nota, e in un **secondo gesto separato** la **consolida** nel budget ufficiale (BudgetEntry per le maison, TargetLinea per le linee). Approvare e consolidare sono distinti di proposito: una proposta si puo approvare e applicare in parte, piu tardi, o mai. Respingere **richiede una motivazione** (chi l ha scritta deve sapere cosa correggere), consolidare **richiede la voce di budget** su cui applicarla (una proposta per maison non dice se e D2C, Eventi o B2B: indovinarlo scriverebbe numeri nel posto sbagliato), e una proposta **globale non si consolida** perche il budget si scrive per maison o per linea. Ogni consolidamento lascia traccia sulla proposta (data e dove).
  > ⭐ **E si vede come resterebbe l anno intero** (23/08/2026, «mostra anche la proiezione di tutto
  > l anno»). Il totale proposto da solo non risponde alla domanda di chi approva: una proposta copre
  > **alcuni** mesi, e affiancarla al budget di dodici fa leggere come un taglio del 40% quello che è
  > solo un pezzo d anno. Ora c è un KPI **«L anno intero, se consolidata»** (da X a Y, con la
  > differenza) e una tabella mese per mese: **in blu i mesi che la proposta scrive**, gli altri restano
  > il budget di oggi.
  >
  > ⚠️ **Non è una somma**: si applica la regola vera del consolidamento — la proposta riscrive **solo
  > la sua fonte**, e una proposta **sostituisce** il budget iniziale invece di aggiungersi. Sommare
  > direbbe un numero che dopo il consolidamento non si vedrebbe da nessuna parte. Le proposte vecchie
  > (un numero per mese, senza linea) **non si proiettano**: non dicono su quale voce atterrano, ed è la
  > stessa ragione per cui il consolidamento chiede di sceglierla.
  >
  > 📌 Su una proposta **già consolidata** la proiezione dice `293.024 € → 293.024 €, +0 €`: è la
  > risposta giusta — riconsolidarla non cambierebbe niente — e prima non c era modo di saperlo senza
  > confrontare a mano dodici caselle.
- **Premi per singolo responsabile**: oggi è un monte premi totale per livello, non ripartito per persona/team.
- **Consuntivo**: confronto solo dove la mappatura Finance è impostata. Il D2C reale ora arriva da
  Orders (per maison e per mese), ma i ricavi restano **su due basi diverse** — Finance imponibile,
  Shopify IVA inclusa: il totale è dichiarato, non omogeneo. I **rimborsi parziali** sono contati
  per intero (l'importo reso non esiste nel registro ordini).
- ✅ **Piattaforme ADV: la ripartizione si sceglie per brand** (23/08/2026, richiesta dell'utente:
  «devo poter selezionare per quale brand è così»). Era il limite scritto qui sotto — split unico
  d'azienda — ed è chiuso: in cima a `/piattaforme` c'è il selettore **Azienda · un brand per volta**,
  e ogni brand può avere le sue percentuali applicate **al suo** budget ADV (Deluxy.it 206.606 €
  contro i 412.125 € d'azienda). Resta aperto il confronto col reale, che esiste solo nel P&L
  (totale) e non piattaforma per piattaforma.
  > **Come si comporta.** Un brand che non ha una ripartizione sua **eredita quella d'azienda**, e la
  > pagina lo dice: *«Deluxy.it non ha ancora una ripartizione sua: quelle che vedi sono le percentuali
  > dell'azienda… Salvando, diventano sue e da lì in poi non seguono più quelle d'azienda»*. Dopo il
  > salvataggio la scritta diventa *«Ripartizione propria di Deluxy.it»*. A database sta in
  > `PiattaformaSplit.ambito`: **stringa vuota = azienda**, altrimenti l'id della maison — non una
  > foreign key, perché una FK non potrebbe reggere il valore vuoto e senza quello servirebbe una riga
  > fittizia per rappresentare «tutti». Migrazione additiva (`prisma db push`): le 36 righe esistenti
  > sono diventate «azienda» senza perderne una, verificato prima e dopo.
  >
  > ⚠️ **Trappola React, evitata di un soffio**: l'editor tiene le percentuali in uno stato
  > inizializzato **una volta sola**, e cambiando brand React riuserebbe la stessa istanza — si
  > vedrebbero le percentuali del brand precedente sopra i numeri di quello nuovo. Serve `key={ambito}`
  > sul componente per rimontarlo.
  >
  > ⭐ **E nei mesi già passati non c'è niente da ripartire: si è già ripartito** (23/08/2026, «per i
  > mesi passati metti consuntivo»). Su un mese chiuso la domanda «quanto do a Google» non esiste più —
  > i soldi sono usciti, e Marketing sa **per quale canale**. Quindi lì la riga non è *budget ×
  > percentuale* ma la **spesa vera** di quella piattaforma, la percentuale accanto è quella che ne è
  > uscita, e la casella è **in sola lettura** (riscriverla non riporta indietro i soldi). Il totale del
  > mese diventa lo speso, così **somma le sue caselle**, e la riga si chiama «Speso / budget ADV mese».
  > Misurato su CakeDesign.me a gennaio: **Google 93,3% (974 €) · Meta 6,7% (70 €)**, totale 1.045 € —
  > lontanissimo dal 70/20/10 a budget. Il salvataggio manda **solo i mesi aperti**: rispedire un mese
  > chiuso sovrascriverebbe la quota a budget con una misura.
  >
  > Il canale di Marketing si abbina alla piattaforma **dal nome** (`Google` → `google_ads`, `Meta` →
  > `meta_ads`, in `canaleDiPiattaforma`). Una piattaforma che in Marketing non ha un canale — TikTok —
  > nei mesi chiusi scrive **«non misurato»**, non uno zero che sembrerebbe «non ha speso niente».
  >
  > **La colonna «Anno» porta anche la quota in %** («fai vedere anche le ripartizioni delle spese %»):
  > sull'anno la domanda non è più *quanto* ma *quanta parte*. Sotto l'importo c'è la sua percentuale
  > sul totale, e nel titolo la spaccatura fra **quello che è già uscito e quello che è ancora una
  > decisione** — nell'importo sono sommati e non si distinguerebbero. Su CakeDesign.me: Google
  > **11.995 € · 77,5%** (8.528 già spesi + 3.467 a budget), Meta **2.981 € · 19,3%** (1.990 + 991).
  >
  > ⭐ **«Azienda» è la SOMMA dei brand, e non si scrive** (23/08/2026, «azienda fai la somma di
  > tutti»). Prima quel tab applicava la ripartizione **predefinita** al budget di tutta l'azienda: una
  > risposta sbagliata appena un brand se ne scrive una sua. Ora le viste sono **tre**, e rispondono a
  > tre domande diverse:
  >
  > | Vista | Cosa dice | Si scrive? |
  > | --- | --- | --- |
  > | **Azienda (somma)** | quanto va davvero a ogni piattaforma su tutti i brand, ciascuno con la **sua** ripartizione dove ce l'ha | **no**: è una conseguenza |
  > | **Predefinita** | la ripartizione che eredita chi non ne ha una sua (l'ambito vuoto a database) | sì |
  > | **un brand** | la sua, applicata al suo budget | sì |
  >
  > Nella somma il bottone Salva **sparisce del tutto** invece di restare spento: un bottone che non può
  > fare niente fa cercare cosa manca per accenderlo. Misurato il 23/08 su settembre: la somma dà
  > **Google 72,6% · Meta 20% · TikTok 4,8%**, mentre la predefinita dice 70/20/0 — la differenza è
  > esattamente quello che i brand hanno deciso per conto loro, e prima non si vedeva da nessuna parte.
  >
  > **Quando è stata salvata, si vede** («rendi chiaro quando hai salvato una ripartizione»). Due cose
  > diverse e servono tutte e due: sopra la griglia la **data dell'ultimo salvataggio** (*«Salvata
  > l'ultima volta il 23/08/2026, 19:02»*, oppure «Mai salvata da questa pagina»), e dopo il clic una
  > **pastiglia verde accanto al bottone** con l'ora — *«Ripartizione d'azienda salvata alle 19:02»*.
  > Sta lì e non altrove perché **l'esito si vede dove si è agito**: un salvataggio che non si vede
  > sembra un bottone rotto.
  >
  > Il campo è `PiattaformaSplit.aggiornatoIl`, **nullable di proposito**: le righe che c'erano prima
  > non sono mai passate da questa pagina, e stamparle con la data della migrazione sarebbe una data
  > inventata. Tutte le righe di un salvataggio portano lo **stesso istante** (uno solo, preso a inizio
  > scrittura), se no «quando l'ho salvata» diventerebbe un intervallo. ⚠️ La data si formatta su
  > **`Europe/Rome`**, non sul fuso del server: su Vercel il runtime è UTC e un salvataggio delle 19:02
  > si leggerebbe «17:02» ([[trappola-periodi-fuso-server]] della memoria di progetto).
  >
  > ⚠️ **Due difetti trovati provandola, e sistemati**: nella vista **Azienda** i mesi chiusi restavano
  > **scrivibili** ma il salvataggio li scartava — una modifica che sparisce in silenzio, il difetto
  > peggiore di tutti. Ora i mesi passati sono in sola lettura **ovunque**, e la vista Azienda mostra
  > anche lei lo **speso vero** (somma dei brand per canale) invece del budget: era rimasta l'unica a
  > dire una cosa diversa dalle altre. Gennaio d'azienda: **Google 69,7% (5.135 €) · Meta 30,3%
  > (2.230 €)** — a budget erano 70/20.
  >
  > ⚠️ **Il totale della colonna non è 100 per definizione, e non va scritto a mano.** L'avevo messo
  > fisso a «100%» pensando che la somma delle quote lo fosse per costruzione: è falso appena una
  > piattaforma viene **tolta** — la sua parte resta scoperta e nessuno la riassegna. Oggi vale
  > **96,8%**, in arancione, con scritto quanto resta senza casa (495 €): è successo davvero perché
  > TikTok è stato rimosso e il suo 10% sui mesi aperti è sparito con lui.
- ✅ **Storico Meta in Marketing: caricato** (verificato il 09/08, il 17/08 e il 21/08/2026 — copertura
  233 giorni su 233, Marketing spiega l'**85%** delle uscite ADV contro il 46% del 28/07). Resta una
  coda: **`flowers/meta_ads` sta a 191 giorni su 233** e **`cake/meta_ads` a 196** — nei giorni scoperti
  quella spesa manca del tutto (≈ **1.280 €**). Sono *sopra* la soglia dell'80% che fa scattare
  l'avvertenza degli account parziali, quindi Marketing li dichiara «completi»: da qui in poi l'app li
  nomina lo stesso (vedi «Una soglia attraversata non è un buco chiuso»). Si chiude in **Marketing**, non qui.
- ⭐ **Costo del lavoro: il TFR di chi smette c è** (23/08/2026, «aggiungi tfr per chi smette»). Il TFR
  matura per tutti ma **si paga quando il rapporto finisce**: per chi resta è un accantonamento, per chi
  se ne va è un costo dell anno, e nel budget va messo lì dove esce. Quota di legge: retribuzione ÷
  **13,5**, sul lordo già riproporzionato ai mesi lavorati — il TFR del 2026 è quello maturato nel 2026,
  non tutta l anzianità, che questa app non conosce. Solo i **dipendenti**: un consulente fattura e uno
  stagista prende un rimborso, il TFR non lo maturano né l uno né l altro.
  > **Cade tutto nel mese in cui il rapporto finisce**, non spalmato sui dodicesimi: è lì che si
  > liquida, e spalmarlo direbbe che quel costo esce a gennaio. Misurato: Andrea Bellazzi **852 €** a
  > giugno, Giada Lo Proto **772 €** a maggio — costo del personale da 217.254 a **218.877 €**. In
  > `/dipendenti` si legge accanto al totale della persona («di cui TFR 852 € a Giu»), perché un costo
  > che esce una volta sola, sommato in silenzio, fa sembrare sbagliato il conto dei dodicesimi.
- **Costo del lavoro, cosa manca ancora**: tredicesima e quattordicesima non sono voci distinte (per i
  contratti **annui** la RAL le comprende già, per i **mensili** il lordo si fa ×12 anche se il campo
  dice 14); il TFR di chi **resta** non è accantonato; e non c è un consuntivo del personale.
- **P&L**: per singola **linea commerciale** non c'è (le linee hanno solo il budget vendite, non un conto economico).

## Chiavi dall'app (Configurazione → Chiavi)

Le chiavi API si possono incollare **dentro l'app** (`/impostazioni/chiavi`), oltre che nelle
variabili d'ambiente e nella cassaforte del Hub. Ordine di precedenza, e la pagina lo dichiara con
un badge su ogni riga: **ambiente → impostata nell'app → Hub**. L'ambiente vince perché è quello
che si cambia in emergenza senza entrare nell'app.

Il valore finisce nel database **cifrato** (AES-256-GCM, chiave derivata con scrypt — stessa
infrastruttura di `deluxy-merchandising` e `deluxy-messaging`, `src/lib/crypto.ts`) e **non torna
mai al browser per intero**: in pagina si vede solo `sk-proj-…a1b2`, quanto basta a riconoscere
quale chiave è impostata.

Il segreto da cui deriva la cifratura si cerca in quest'ordine: **`APP_SECRET` → `HUB_KEYS_TOKEN` →
`BUDGETS_APP_PASSWORD`**. `APP_SECRET` è quello giusto (dedicato, si ruota senza toccare altro), ma
pretendere solo quello significava tenere la pagina disabilitata in produzione finché nessuno lo
aggiungeva su Vercel — cioè una funzione che esiste e non si può usare. Stessa scelta, e stessa
motivazione, della cassaforte del Hub (`HUB_CHIAVI_SECRET` → `HUB_SESSION_SECRET`).

> **Cambiare il segreto in uso rende illeggibili le chiavi già salvate.** Non si rompe niente — una
> chiave che non si decifra risulta «non impostata» e si reincolla — ma sparisce. Vale anche
> aggiungere `APP_SECRET` dove prima si usava il ripiego: la cifratura si sposta su di lei. Per
> questo la pagina dichiara sempre **quale segreto** sta proteggendo le chiavi. Conseguenza pratica:
> se locale e produzione hanno segreti diversi non si leggono le chiavi a vicenda — la chiave si
> incolla **nell'ambiente in cui deve funzionare**.

## Accesso: password + codice di autenticazione

Chi entra vede budget, premi e stipendi, e la password del team è **una sola e condivisa**: basta
che finisca in una chat o in uno screenshot. Da **Configurazione → Accesso** si attiva un
**secondo fattore TOTP** (Google Authenticator, 1Password, Authy): stesso meccanismo e stesso
file di `deluxy-transactions` (`src/lib/totp.ts`), così il codice si fa in un modo solo in tutto
l'ecosistema.

**Non ci si può chiudere fuori** — è la regola che governa `src/lib/accesso.ts`:

- finché nessuno ha registrato un'app di autenticazione, il login resta quello di prima;
- il codice diventa obbligatorio **solo dopo** che se ne è digitato uno valido: una chiave
  generata e mai confermata non blocca nessuno;
- se `APP_SECRET` manca **o è cambiata**, il segreto non è leggibile e l'app torna alla sola
  password, invece di rifiutare tutti perché non riesce a decifrarlo;
- per **togliere** il secondo fattore serve un codice valido: se bastasse essere dentro, chi
  trovasse un computer aperto lo disattiverebbe in due clic.

> **Il cookie di sessione include `APP_SECRET`** (`src/lib/auth.ts`). Senza, sarebbe una funzione
> della sola password: chi la conosce se lo calcolerebbe da sé e lo infilerebbe nel browser,
> **saltando il codice**. Conseguenza voluta: cambiando `APP_SECRET` (o la password) tutte le
> sessioni aperte decadono.

## Conto economico civilistico (`/conto-economico`)

Il bilancio **vero**, nello schema di legge (art. 2425 c.c.), con le stesse voci e gli stessi
codici del PDF del commercialista. Non sostituisce il Consuntivo: risponde a un'altra domanda.

| | Consuntivo / CFO | Conto economico |
| --- | --- | --- |
| Domanda | «come sta andando adesso» | «cosa abbiamo chiuso» |
| Fonte | Finance + banca + Orders | il bilancio depositato |
| Copertura | arriva a oggi | solo esercizi chiusi |
| Limite | non conosce ammortamenti, ratei, rimanenze | esiste dopo la chiusura |

**I totali si calcolano, non si digitano** (`totali()` in `src/lib/bilancio.ts`): un bilancio in cui
il totale è un campo libero prima o poi non quadra e nessuno se ne accorge.

**Proposta dai dati dell app**: un riquadro propone le voci che l app puo ricavare da se — A1 dal fatturato Finance (tutte le tipologie, non solo quelle mappate) piu la quota ecommerce, B7 dalle uscite di banca «Costo per servizi» e «Pubblicita», B9 dal roster, B14 dalla «Struttura». Ogni riga dice **da dove viene** e nulla si salva da solo: si spunta e si conferma. Le voci gia compilate sono segnalate in arancio perche accettare la proposta le sovrascriverebbe. Sotto, l elenco di **quello che l app non puo sapere** con il motivo (ammortamenti, rimanenze, imposte di competenza…): e la parte piu utile, perche dice perche il gestionale non torna col bilancio. Se in banca ci sono uscite non ancora categorizzate, la proposta lo dichiara e avverte che i costi sono sottostimati di almeno quella cifra.

**Cliccando una voce si vede di cosa è fatta** (`/conto-economico/[codice]`, 29/07/2026): le
**categorie di banca** che la compongono con importo, quota e controparti, e — nella stessa riga —
le tendine per cambiare **voce di bilancio** e **voce di P&L**. La correzione si fa dove si vede
l'errore: quando ci si accorge che il B6 proposto è 349.377 € contro i 42.299 € del bilancio 2024,
si è in questa pagina, e mandare a cercare la categoria per nome nel CFO è il modo migliore perché
la correzione non venga fatta. In cima, accanto al ricostruito, c'è **quanto è scritto in bilancio**
su quella voce e la differenza: non devono coincidere — sono due contabilità diverse — ma una
differenza grande è quello che si viene a cercare qui.

Le voci che **non nascono dalla banca** dichiarano la loro provenienza invece di mostrare una
tabella vuota: A1/A5 elencano il fatturato per tipologia da Finance più la quota ecommerce (e
scrivono che la divisione fra A1 e A5 l'app non sa farla), B9 elenca le persone a budget una per
una, B10 e le imposte spiegano **perché** nessuna fonte dell'app le conosce. Si apre anche
**«fuori dal conto economico»**, che di legge non è una voce: è dove finisce quello che si è deciso
di togliere — le partite di giro coi partner — e chi controlla un bilancio deve vedere anche cosa è
stato tolto.

**Il residuo si distingue da quello che una regola ha davvero classificato.** Da quando una
categoria «raccoglie il residuo» la copertura del CFO è al 100%, e quel 100% nasconde una cosa: che
dentro ci sono controparti che nessuno ha mai classificato, lì solo perché dovevano stare da
qualche parte. Ora `abbina()` in `src/lib/cfo.ts` dice **come** una controparte è arrivata nella
categoria, il conto economico avvisa in cima quanti euro stanno in una voce senza che nessuna regola
lo dica (**23.705 € sul 2026, 412 controparti**, tutti in B7), e il dettaglio della voce li elenca
con l'assegnazione rapida — che crea una regola permanente e li toglie da lì per sempre. Motore in
`src/lib/bilancio-dettaglio.ts`.

**Import**: si incollano le righe copiate dal PDF o dall'Excel, «codice importo». Il parser dei
numeri (`numero()`) non tira a indovinare: **l'ultimo fra punto e virgola è il separatore
decimale**, e tre cifre dopo l'ultimo separatore vogliono dire migliaia. Regge l'italiano
(`1.250.000,00`), l'inglese (`1,250,000.00`) e i negativi fra parentesi. Le righe con un codice
fuori schema vengono **ignorate e contate**: nessuna riga finisce in una voce a caso.

**Ripartizione mensile** facoltativa per voce: la somma dei dodici mesi deve fare esattamente
l'importo annuo, altrimenti il salvataggio viene rifiutato. Le voci senza ripartizione restano
annue e **non vengono spalmate in dodicesimi** — un dodicesimo di ammortamento è un numero
inventato che in una tabella mensile sembrerebbe misurato.

Su un esercizio chiuso e compilato compare il **confronto col gestionale**, con la spiegazione
riga per riga del perché può non tornare. Le differenze non sono errori: sono due contabilità che
misurano cose diverse. Quando una differenza *non* ha una spiegazione, quella è la cosa da guardare.

## API per le altre app Deluxy

Autenticazione: header `X-API-Key` con **`BUDGETS_API_KEY`** (variabile d'ambiente, oppure
Configurazione → Chiavi, oppure cassaforte del Hub — nell'ordine deciso da `chiave()`). Il
controllo sta in un file solo, `src/lib/api-auth.ts`: ripulisce i caratteri invisibili incollati
nell'header, confronta trimmato e risponde **503** se la chiave non è configurata (diverso da 401:
«l'API è spenta» non è «non sei autorizzato»).

| Metodo | Rotta | Scopo |
| --- | --- | --- |
| GET | `/api/v1/categorie` | le categorie di costo, per Finance (`?regole=1` per le regole) |
| GET | `/api/v1/maison` | i **budget per maison**, per Marketing (`?anno`, `?livello`, `?maison`) |
| GET | `/api/v1/team` | **squadre e persone**, per il Hub (`?anno`, `?compensi=1`) |

**`/api/v1/categorie` non manda più solo i nomi** (31/07/2026). Insieme a `tipoPL` e `voceCE`
viaggiano ora anche **`descrizione`** — *cosa ci va dentro e cosa no* — e **`quotaPartner`**, due
campi aggiuntivi che non cambiano il contratto. Servono dove si assegna davvero a mano, cioè in
**Finance davanti al movimento**: con i soli nomi si finisce per indovinare, e indovinare vuol dire
mettere la stessa spesa oggi in una categoria e domani in un'altra.

`quotaPartner` è quello che cambia di più la lettura di una riga: un bonifico a un fioraio che ha
eseguito un ordine ecommerce **non è una spesa**, è la sua quota — nei ricavi c'è già solo la parte
che resta a Deluxy, e contarlo anche fra i costi toglierebbe due volte lo stesso denaro. Finance ora
lo mostra come badge «partita di giro».

> **Le etichette delle voci di P&L devono essere le stesse nelle due app.** In Finance c'era ancora
> «Costo del venduto», che qui è stato rinominato **«Costo per servizi (valet)»** il 26/07/2026
> proprio perché era sbagliato — se la quota del partner è già tolta dai ricavi non è *anche* un
> costo. Due app che chiamano in due modi la stessa voce di conto economico sono un modo garantito
> di far litigare due numeri identici.

### Chi classifica è Finance; qui si scrivono le regole

**Deciso dall'utente il 31/07/2026**: «Finance importa le regole di Budgets e poi sarà Finance a
classificarle, anche con l'uso dell'AI». Quindi il lavoro è diviso così:

| | Chi comanda |
| --- | --- |
| l'**elenco** delle categorie (nome, voce di P&L, voce di bilancio, quota partner) | **Budgets** |
| le **regole** controparte → categoria | **Budgets** (si scrivono nel CFO) |
| la **categoria del singolo movimento** | **Finance** — applica le regole, l'AI, e la mano |

Fino a quel giorno `ricostruisci()` **ricalcolava tutto** dalle proprie regole e buttava via la
categoria che Finance le mandava già dentro `/api/spese`: due calcoli sulla stessa spesa, e una
categoria cambiata a mano in Finance che non arrivava mai al conto economico. Ora vale quella di
Finance; le regole di qui si applicano **solo dove Finance non ha ancora niente**.

`/api/spese` di Finance manda ora, per ogni controparte, le sue categorie con **id**, **importo** e
**dodici mesi** ciascuna: una controparte usata per spese di natura diversa si **divide** fra le sue
voci invece di finire tutta nella prima. L'`id` evita che una rinomina faccia divergere le due app
in silenzio.

> ⚠️ **Conseguenza voluta, e va saputa: scrivere una regola qui non cambia più il conto economico
> da solo.** La categoria di Finance è una **fotografia**, scattata quando si preme «Applica le
> regole di Budgets». Finché quella passata non si rifà, la regola nuova non si vede. Prima era il
> contrario — Budgets live, Finance ferma — ed è quello che faceva divergere le due app. È scritto
> in cima al CFO, altrimenti sembra rotto.

**Quanto è costato il passaggio, misurato prima di farlo**: sul 2026 si muovono **1.000 €** (COGS
+1.000, esclusa −1.000) e sul 2025 **700 €** (personale +700, COGS −700). I mille euro del 2026 sono
il pagamento PayPal del 29/07 che era stato assegnato a mano in Finance a «Consegne (valet e
corrieri)» e che il conto economico **non vedeva**: adesso lo vede. Tutto il resto è invariato,
perché le due app usavano già le stesse regole.

Confrontate voce per voce sul 2026 (1.663 controparti): **1.476 uguali, zero in disaccordo**.

### Una categoria non vuol dire tutti i movimenti (09/08/2026)

Finance classifica **movimento per movimento**, non controparte per controparte: la stessa
controparte può avere alcuni movimenti riconosciuti e altri no, perché il nome grezzo della riga è
scritto in un altro modo (uno spazio davanti, un `SUMUP *` incollato prima). `ricostruisci()` invece,
finché la controparte aveva **una sola** categoria, attribuiva a quella l'**intero** totale della
controparte — e nel caso a più categorie sommava solo i pezzi noti, buttando via il resto.

Misurato sul 2026 (835.379 € di uscite):

| | |
| --- | --- |
| controparti **senza nessuna** categoria (il residuo che la pagina dichiarava) | **8.093 €** |
| movimenti scoperti **assorbiti** nell'unica categoria della controparte | **27.260 €** — 20.000 in «Banca e giroconti», 8.404 fra i partner, 1.652 negli stipendi |
| movimenti scoperti **spariti** (controparte con più categorie: PayPal) | **919 €** |
| uscite 2026 **senza classificazione**, in tutto | **36.272 €**, non 8.093 |

Cioè: la copertura al 99,5% era vera solo per le controparti *interamente* scoperte, ed è lo stesso
errore già corretto il 29/07/2026 sulla categoria che «raccoglie il residuo» — un totale che
sembra classificato perché nessuno ha misurato la parte che non lo è.

Ora gli importi per categoria si usano **sempre** (non solo quando le categorie sono più d'una) e la
parte scoperta passa dalle **regole di Budgets**, esattamente come una controparte che Finance non ha
mai visto: è quello che succederà comunque alla prossima passata di «Riclassifica tutto». Se nessuna
regola la riconosce, resta residuo **e si vede**.

**Effetto misurato, ed è la parte tranquillizzante**: il conto economico **non si muove** — 2026
residuo 4.107 → **4.113 €**, struttura −6 €, tutto il resto identico — perché quei 27.260 € una
regola di Budgets ce l'avevano già e finivano nella categoria giusta *per caso*. Quello che cambia è
che il totale ricostruito torna a **quadrare con la banca** (834.460 → **835.379 €**: i 919 € di
PayPal non spariscono più) e che il rischio non è più invisibile. Sul 2025: totale 1.113.632 €,
residuo 23.548 €.

> ⚠️ Il rimedio vero non è qui: sono **movimenti che Finance non ha ancora classificato**. Si chiude
> premendo **«↻ Riclassifica tutto»** in `/spese` di Finance, che è già nella lista delle cose da
> fare da quando le regole a match esatto sono state normalizzate.

### Il residuo era tornato invisibile, da un'altra porta (17/08/2026)

Terza volta che lo stesso inganno si ripresenta, e vale la pena riconoscerne la **forma**: *un
totale che sembra classificato perché il non classificato è finito da qualche parte*.

Nel consuntivo, `nonCategorizzato` conta solo le righe **senza nessuna categoria**. Ma da quando è
Finance a classificare, quello che nessuna regola riconosce non resta senza categoria: cade nella
categoria **«Da classificare»**, che è una categoria vera, con un tipo di P&L (COGS). Risultato: il
numero era **0 €** e la pagina scriveva «0 € ancora da categorizzare» mentre **4.903 €** (2026,
146 controparti) stavano dentro i costi senza che nessuno avesse scelto in quale voce.

Non è lo stesso rischio di prima, ed è per questo che ora sono **due numeri**:

| | |
| --- | --- |
| `nonCategorizzato` | uscite che **non entrano** nel conto economico → i costi sono **sottostimati** |
| `senzaRegola` (nuovo) | uscite che **entrano**, ma nella casella in cui sono cadute per difetto → il **totale quadra, la ripartizione no** |

`senzaRegola` è la somma del `residuo` che `ricostruisci()` porta già su ogni riga (esiste dal
29/07/2026, semplicemente nessuno lo sommava a livello di consuntivo). Si vede nel KPI dei costi, nel
paragrafo che spiega da dove vengono i numeri, e come **avviso nella proposta di conto economico** —
perché un bilancio si difende voce per voce, non a totale. Il rimedio resta lo stesso: le regole si
scrivono nel CFO e la fotografia si rifà con **«↻ Riclassifica tutto»** in `/spese` di Finance.

### Un mese con qualche movimento sembra un mese intero (21/08/2026)

Quarta variante della stessa famiglia, e la più cara finora. Il consuntivo sapeva già dire «in banca
non ci sono movimenti per questi mesi» — ma sapeva riconoscere **una sola** forma di mancanza: lo
zero. Agosto 2026 ne aveva 31, di movimenti, quindi passava il controllo come un mese qualsiasi.

Misura che ha fatto emergere il problema (Finance, `/api/spese` mese per mese):

| | movimenti | controparti | uscite |
| --- | ---: | ---: | ---: |
| Giugno | 416 | 306 | 111.283 € |
| Luglio | 408 | 315 | 116.476 € |
| **Agosto** (1–21) | **31** | **21** | 39.760 €, di cui 20.000 un giroconto |

Un nono del ritmo, e non in un intervallo di giorni mancante: uno o due movimenti al giorno per tutto
il mese. Dentro non c'è **nessuna** uscita pubblicitaria (negli altri mesi 11–17.000 € ciascuno) e
**nessun** pagamento ai partner. Ecco perché ADV, girato ai partner e ricavi a consuntivo erano
*identici* alla misura di quattro giorni prima.

⚠️ **La trappola nella verifica, non nel dato.** Il 17/08 la freschezza era stata controllata
guardando l'**ultima data** dei movimenti, ed era recente: da lì la conclusione «non è una sync
ferma». Il 21/08 l'ultima data è **il giorno stesso** — ancora più rassicurante — con nove decimi del
mese mancanti. *L'ultima data dice che qualcosa è arrivato, non che è arrivato tutto.* Il conteggio
per giorno lo dice; la data no.

**Cosa fa l'app adesso.** In `/consuntivo`, accanto all'avviso sui mesi senza banca, ce n'è uno sui
mesi **radi**: si contano le **controparti attive** di ogni mese (306, 315, … — molto più stabile
dell'importo, che un solo giroconto da 20.000 € basta a gonfiare), si prende la **mediana** del
periodo e si segnala ogni mese sotto la **metà** di quella mediana. Per il mese in corso il confronto
è riproporzionato ai giorni trascorsi, altrimenti il 3 del mese sarebbe sempre «rado». Oggi scatta su
**agosto: 21 controparti contro una mediana di 326**. Il rimedio resta nella **sync Qonto di
Finance** (`deluxy-partner`), non qui — vedi anche il punto 7 dei punti aperti.

**Da dove cominciare a cercare la causa, senza indovinare.** L'archivio movimenti di Finance mescola
**due fonti**: la sync Qonto e i CSV di una seconda banca (quella su cui gira quasi tutta la
pubblicità 2026), caricati a mano. Il primo sospetto è quindi che il CSV di agosto non sia mai stato
importato — ma non regge da solo: fra le 21 controparti di agosto ce ne sono di stile carta
(`Netflix.com`, `Google One`, `DELIVEROO`, `ARIELFLORI*…`), quindi non manca *una fonte intera*,
manca **una parte di entrambe**. Si guarda in `deluxy-partner`, contando i movimenti di agosto per
fonte; qui si può solo dichiarare che mancano.

### ⚠️ La percentuale di /spese è una quota del budget ADV dell'anno (23/08/2026)

**Leggere questo prima della sezione qui sotto**, che descrive la regola vecchia e resta solo come
storia. Fino al 23/08/2026 la percentuale di `/spese` voleva dire *«quanto del venduto di questo mese
posso spendere in pubblicità»*. Era sbagliato, e l'utente lo ha detto in tre modi prima che lo
capissi: «così superiamo il 100% ed è impossibile», «devo vedere la somma dei p.p.», e infine
**«sono da calcolare su totale pubblicità prevista per l'anno»**.

**La regola giusta**: ogni brand ha un **monte pubblicità per l'anno** e le dodici caselle dicono
**come si distribuisce fra i mesi**. Da cui tutto il resto:

| | |
| --- | --- |
| Importo del mese | monte annuo del brand × quota del mese |
| Il 100% | il monte annuo di **quel brand**, stimato dal ROS obiettivo (sotto) |
| Le dodici quote | **devono fare 100**: distribuiscono un numero già deciso |
| Sopra il 100 | si impegna pubblicità che non c'è → **salvataggio bloccato** |
| Sotto il 100 | budget non ancora assegnato → si salva, e la pagina dice quanto resta |
| Mese chiuso | la quota non è una decisione ma una **misura**: speso reale ÷ monte annuo |

Il conto sta in un posto solo — `advConsentitoMese(mese, budgetAnno)` in `calc.ts` — quindi la
regola nuova vale anche per `/piattaforme`, per il P&L e per l'API `/api/v1/maison`, non solo per la
schermata dove si scrive.

### Il monte annuo non è ereditato: si stima dal ROS obiettivo (23/08/2026)

*«Stima in automatico il budget pubblicitario pari a 7 per deluxy.it e 6,5 per tutti gli altri siti»*.
Il ROS è quanti euro di vendite deve muovere ogni euro speso, quindi il conto si rovescia:

```
budget pubblicità dell'anno = vendite dell'anno ÷ ROS obiettivo
   dove vendite dell'anno = consuntivo dei mesi chiusi + budget di quelli che restano
```

⚠️⚠️ **Trappola trovata facendolo, e vale per tutta l'app.** Far leggere il venduto a `calc.ts` ha
**rotto la build del client**: `DipendentiEditor` e `TeamEditor` sono componenti *client* e importavano
da `calc.ts` quattro funzioni di busta paga — così facendo si portavano nel bundle del browser tutta la
catena `prisma → chiavi → node:crypto`, che webpack non sa risolvere («Reading from "node:crypto" is
not handled»). Finché `calc.ts` toccava solo il database la cosa passava; il giorno in cui ha
cominciato a fare una chiamata di rete è saltata. Rimedio strutturale, non tampone: le funzioni pure
(`lordoAnnuo`, `costoPersonaMese`, `costoPersonaAnno`, `nettoBusta`, `TIPI_PERSONA`, `Persona`) sono in
**`src/lib/persone.ts`**, che non tocca né database né rete; `calc.ts` le re-esporta, quindi tutti gli
import server esistenti continuano a funzionare. ⭐ **Regola: quello che serve al browser non sta in un
modulo che tocca il database.**

A **ROS 7** la pubblicità vale un settimo del venduto (≈14,3%), a **6,5** un po' di più (≈15,4%). Sta
Il ripiego per chi non ne ha uno suo resta **6,5×**.

### Un brand che la pubblicità non la fa

⭐ **`Maison.faPubblicita`** (23/08/2026, «b2b ed experience vanno azzerati come budget marketing»):
l'interruttore sta sulla scheda del brand in `/spese`, e spento vuol dire **monte zero, quote zero,
niente nel P&L e niente da ripartire in `/piattaforme`**.

⚠️ **Non si esprime azzerando le quote** e nemmeno con un ROS a zero. Le quote sono percentuali del
monte: finché il monte esiste resta a schermo un budget che nessuno spende, e sembra disponibile. Un
ROS a zero, invece, è una divisione per zero — e «ROS zero» vorrebbe dire il contrario di quello che
si intende, cioè resa nulla. Serviva un terzo stato, e ha un campo suo.

⚠️ **Spegnere azzera anche le quote a database**, dopo conferma che dice quante ne sta per cancellare.
Lasciarle lì vorrebbe dire che chi un giorno riaccende l'interruttore si ritrova addosso una
ripartizione sbagliata di cui non sa niente. Riaccendendo si riparte da zero, non da quello che c'era.

📌 **Applicato a B2B ed Experience** con `scripts/spegni-pubblicita-brand.ts` (prova a vuoto, poi
`scrivi`): erano i due brand che in Marketing non hanno campagne, e le loro quote — scritte con la
regola vecchia — sommavano **218,4%** e **240%**. Il P&L gli attribuiva **83.908 €** di pubblicità
contro un monte di 38.077. Dopo: **ADV 280.324 → 196.416 €**, **EBITDA −108.931 → −26.660 €**, e i tre
negozi che la pubblicità la fanno davvero sommano **100,0%** ciascuno.

⭐ **Il ROS si imposta per brand** (23/08/2026, «consentimi di impostare il ros per ogni brand per i
budget»): vive a database su `Maison.rosObiettivo` e si scrive **dalla scheda del brand in `/spese`**,
dove il monte si legge — un parametro che sposta il P&L non sta in un file di codice. Il campo è
**nullable di proposito**: vuoto vuol dire «usa il predefinito» e il segnaposto lo scrive, che è
diverso dallo scriverci sopra lo stesso numero — uno è una scelta, l'altro è un ripiego, e la testata
dice quale dei due (`÷ ROS 6,5× predefinito`).

⚠️ L'API rifiuta **zero e negativi** (un ROS a zero è una divisione per zero, cioè un monte
pubblicitario infinito) e i valori sopra 100. I valori che stavano nel codice sono stati **portati a
database così com'erano** (`deluxy` → 7), altrimenti il monte di Deluxy.it sarebbe cambiato da solo al
primo deploy. Provato sul vivo: CakeDesign a 8× → monte da 15.477 a **12.575 €**, poi rimesso a
predefinito.

**Le vendite dell'anno sono «consuntivo dove c'è + budget sul resto»** (*«nel calcolo devi sommare il
budget a consuntivo»*): è la stessa riga «Attuale» di `/maison`, e per la stessa ragione — su un mese
già chiuso la previsione è stata smentita dai fatti, e dimensionare la pubblicità di tutto l'anno su
una previsione sbagliata sbaglia due volte. Sul mese in corso vale il **maggiore** fra il venduto di
adesso e il budget. Il venduto si usa **solo dove è sopra lo zero**, altrimenti B2B ed Experience —
che sui negozi non vendono — si vedrebbero azzerare i mesi chiusi.

| Brand | Vendite anno (cons. + budget) | ÷ ROS | **Stimato** | Solo budget | Il monitoraggio ne aveva |
| --- | ---: | ---: | ---: | ---: | ---: |
| Deluxy.it | 908.441 € | 7× | **129.777 €** | 75.071 € | 199.922 € |
| Deluxyflowers.com | 332.720 € | 6,5× | **51.188 €** | 45.081 € | 47.251 € |
| Deluxy Business (B2B) | 225.000 € | 6,5× | **34.615 €** | 34.615 € | 40.909 € |
| CakeDesign.me | 100.601 € | 6,5× | **15.477 €** | 15.117 € | 18.189 € |
| Deluxy Experience | 22.500 € | 6,5× | **3.462 €** | 3.462 € | 4.500 € |
| | | | **234.519 €** | 173.346 € | 310.771 € |

Il consuntivo cambia soprattutto **Deluxy.it** (+54.706 €), perché i suoi sei mesi di budget azzerato
vengono rimpiazzati dal venduto vero: la stima smette di ereditare quel buco. E porta
**Deluxyflowers sopra il pubblicato** (51.188 contro 47.251), perché quest'anno sta vendendo più di
quanto avesse a budget.

⚠️ **Dove vive il dato, e perché lì.** Il venduto sta dentro `DatiAnno.maisons[].vendutoMesi`, caricato
da `caricaAnno` in *best effort* (se Orders non risponde resta `null` e tutto ricade sul budget). Non è
un dettaglio di una pagina: se quel dato lo avesse solo la schermata dove si scrive, il P&L e
`/piattaforme` userebbero un altro monte annuo.

⚠️ **Il totale «assegnato» di `/spese` è più basso di quello di `/piattaforme`** (309.804 contro
441.618 al 23/08) e non è un errore: qui i mesi chiusi valgono **quello che è stato speso davvero**,
lì valgono ancora la quota decisa a budget. Scritto in fondo alla pagina.

**Il budget vendite da cui si stima è selezionabile, e di default è l'approvato** (*«consenti di
selezionare il budget da prendere, ma dovrebbe essere di default quello approvato»*). In cima a
`/spese` c'è un selettore con **Approvato** · **Budget iniziale** · e ogni fonte che nei dati esiste
davvero (oggi «Pubblicità web»). Le voci diverse da «Approvato» sono una **lente**: rispondono a *«e se
prendessimo l'altro budget, quanta pubblicità sarebbe?»* senza cambiare niente — il P&L e
`/piattaforme` restano sempre sull'approvato, e la pagina lo scrive in arancione quando la lente è
attiva.

⭐ **La differenza non è teorica, ed è la scoperta di questo giro**: su Deluxy.it il **budget iniziale
vale 1.173.904 €** contro i **525.500 approvati** — più del doppio, perché una proposta «Pubblicità
web» consolidata ha *sostituito* l'iniziale. Con quella base il monte pubblicitario passa da 75.071 a
**167.701 €**, e succede una cosa che vale la pena guardare: **su tutti e tre i negozi la stima
sull'iniziale è quasi identica all'ADV che il monitoraggio aveva pubblicato**.

| Brand | Stima su iniziale | Pubblicato dal monitoraggio |
| --- | ---: | ---: |
| Deluxy.it | 167.701 € | 199.922 € |
| Deluxyflowers.com | 46.154 € | 47.251 € |
| CakeDesign.me | 18.308 € | 18.189 € |

Cioè: il budget ADV pubblicato era stato dimensionato **sul budget vendite iniziale**, con un ROS
molto vicino a quello che l'utente ha indicato ora. Il che spiega perché sulla base approvata il monte
scende tanto — non è la stima a essere sbagliata, è il budget vendite che nel frattempo si è
dimezzato.

🔴 **Su Deluxy.it la stima è costruita su un budget vendite bucato**: gennaio–giugno valgono **zero**
(il budget azzerato dal consolidamento del 31/07, mai ripristinato — punto 10). Con quei sei mesi
rimessi, il budget vendite andrebbe verso i ~900.000 € e la stima verso i **~128.000 €** invece di
75.071. Finché il ripristino non gira, il monte pubblicitario del brand più grande è sottostimato di
oltre un terzo — ed è lo stesso buco che si vede in `/maison`.

⚠️⚠️ **Il vincolo cade sui mesi APERTI, non sulla somma dei dodici.** Sembra la stessa cosa e non lo
è: i mesi chiusi non si riscrivono, quindi un brand i cui **soli mesi chiusi** superano già il 100%
resterebbe **bloccato per sempre** — nessuna modifica possibile lo riporterebbe sotto. Succede
davvero, ed è il primo caso provato: B2B ha i mesi Gen–Lug a **127,4%** ed Experience a **140%**,
quote scritte quando la percentuale voleva dire un'altra cosa. Quindi: si blocca quando
`quote dei mesi aperti > 100 − quote dei mesi chiusi`, e lo sforamento già consumato si **dichiara**
con un avviso a parte, che non blocca niente perché non c'è niente da correggere. Tolleranza di mezzo
punto: le quote si scrivono con un decimale e dodici arrotondamenti non devono diventare un divieto.

**E accanto alla quota, il ROS e la vendita del mese** (*«puoi mostrare rispetto alle vendite
attese?»*, poi *«indica il ROS non % su vendite, e nei mesi mostra la vendita attesa»*). La quota
risponde a *come distribuisco il monte annuo*; il **ROS** risponde a *quanto rende* — due domande
diverse, e servono tutte e due: si può distribuire benissimo il budget e ritrovarsi con un mese a
2,9× di ritorno, che è la cosa che poi si paga.

Ogni casella ha **cinque righe fisse**, e sono cinque perché è l'altezza costante che tiene gli input
in linea (verificato: `.sub` alta 74 px identica in tutte le caselle di tutti i brand):

```
= 53.179 €              la pubblicità del mese
a budget                che tipo di numero è (o lo scostamento, se toccata)
vendite attese 153.000 € quello che il mese vende
ROS 2,9×                quanti euro di vendite per euro di pubblicità
Pubblicità web          da quale budget arrivano quelle vendite
```

Il `su 199.922 €` è sparito dalla casella: era lo stesso numero in dodici caselle e sta nella testata
del brand. Sui mesi chiusi le vendite non sono attese ma **vere** (`venduto 49.948 € · vendite:
registro ordini`). Dove non ci sono vendite scrive «nessuna vendita» e `ROS —`, non «0»: un rapporto
senza denominatore non esiste — succede su B2B ed Experience nei mesi con il budget azzerato.

**Da quale budget arrivano i numeri**, scritto in fondo alla pagina perché in una schermata sola ce ne
sono quattro diversi e due numeri che non tornano sembrerebbero un errore di conto:

| | |
| --- | --- |
| Budget pubblicità dell'anno (il 100%) | l'ADV **«pubblicato»** del monitoraggio, non scalato dagli scenari |
| Vendite attese | il **budget vendite** del brand (quello di `/maison`), con la **fonte** in ogni casella: «Budget iniziale» è il file di inizio anno, le altre sono proposte che lo hanno *sostituito* |
| Venduto (mesi chiusi) | **Orders**, registro ordini Shopify |
| Speso (mesi chiusi) | **Marketing**, spesa per brand |

📌 **Il ROS con le quote di adesso**: Deluxyflowers **5,5×**, CakeDesign **4,6×**, Deluxy.it **4,5×**,
B2B **2,5×**, Experience **2,1×**. Dentro Deluxy.it la forbice è larga: gennaio (misurato, vero)
**10,9×**, agosto **8,3×**, dicembre **2,9×** — la distribuzione concentra sul finale d'anno una spesa
che, sulle vendite attese di quei mesi, rende un terzo di gennaio.

📌 **Cosa dice il dato il giorno del cambio** — e non lo diceva prima, perché le dodici percentuali non
avevano nessun vincolo fra loro: **quattro brand su cinque distribuiscono più del loro budget
pubblicitario**, per **47.019 €** in totale (Experience 240%, B2B 218,4%, Deluxyflowers 121,3%,
CakeDesign 118,2%; solo Deluxy.it sta sotto, a 89,4% con 21.095 € ancora da assegnare). ⚠️ Sono numeri
scritti con la regola vecchia: **vanno rifatti**, e finché non lo sono il salvataggio di quei brand
resta bloccato — che è esattamente ciò che deve succedere.

### Spese ADV: cosa si può ancora scrivere, e quanto sposta (21/08/2026)

> ⚠️ **Sezione storica.** Il punto 4-bis, 4-ter e il punto 5 qui sotto descrivono la regola
> **precedente** (percentuale sul venduto del mese), sostituita il 23/08/2026 — vedi la sezione qui
> sopra. Restano perché spiegano da dove vengono l'avviso sui mesi chiusi, la lettura dei mesi
> misurati e l'allineamento delle caselle, che sono sopravvissuti al cambio di regola.

Quattro cose chieste insieme sulla stessa pagina, perché rispondono alla stessa domanda: *se cambio
questa casella, cosa succede al budget dell'anno — e questa casella si può ancora cambiare?*

**1. I mesi passati non si riscrivono.** Il budget di un mese si decide **prima** del mese. Riscrivere
la percentuale di marzo ad agosto non cambia un euro di quello che è stato speso: cambia solo il metro
con cui lo si giudica, e fa **sparire lo scostamento** invece di mostrarlo. Da qui in poi i mesi già
chiusi sono in sola lettura (input disabilitato, etichetta «chiuso», sfondo spento).

⚠️ **Il blocco vive nell'API, non nel form.** `disabled` su un input è una cortesia verso chi guarda
la pagina, non un controllo: la stessa `PUT /api/spese` partita da una scheda rimasta aperta da ieri —
o rigiocata a mano — riscriverebbe un mese già speso. La regola sta in `src/lib/periodo.ts`
(`primoMeseAperto` / `meseChiuso`), la usano **sia** la pagina **sia** la rotta, e la risposta dichiara
cosa ha scartato (`mesiChiusiIgnorati`) invece di rispondere `ok` su una richiesta accolta a metà — il
form lo mostra («*Ago si è chiuso nel frattempo: ricarica la pagina*»). Verificato sul vivo: `PUT` di
marzo al 99% → `{"ok":true,"mesiChiusiIgnorati":[3]}`, e la percentuale a database resta 13,3.

**2. Il totale in fondo, e non solo in cima.** Una tabella finale con una riga per brand — *consentito
ora*, *salvato*, *differenza* — e la riga del totale dell'anno.

**3. La differenza si vede mentre si scrive.** Tre livelli, perché «il totale è cambiato» senza dire
*dove* costringe a ricontrollare dodici caselle per brand: sulla **casella** (`+3.300 €` sotto
l'importo), sul **brand** (nel sottotitolo della sua scheda), e sul **totale** (KPI «rispetto a quello
che è salvato», che nomina i mesi toccati). La colonna «salvato» è il database: finché non si preme
Salva la differenza vive solo nella pagina, e ricaricando sparisce.

> Il bottone si accende sulle **caselle toccate**, non sulla differenza in euro: due modifiche opposte
> che si compensano lasciano il totale identico e sono comunque da salvare.

**3-bis. La somma dei punti percentuali del brand** (chiesta guardando la scheda: *«qui devo vedere la
somma dei p.p.»*). Sotto il consentito, ogni brand porta la somma delle sue dodici percentuali —
`160,8 p.p. su 12 mesi · media 13,4%` — e, se qualcosa è stato toccato, di quanto si è spostata
(`+1,6 p.p. rispetto ai 160,8 salvati`). L'euro dice *quanto costa*, i punti dicono *quanto stai
tirando la leva*: due domande diverse sullo stesso gesto.

> ⚠️ Si scrive **p.p.** e non **%** di proposito: sommare percentuali calcolate su basi diverse **non
> dà una percentuale**: 160,8 non è «il 160,8% di qualcosa». È un indicatore di quanto si sta
> distribuendo sull'anno, e accanto c'è la **media**, che invece una lettura percentuale ce l'ha.
> Confronto fra brand al 21/08/2026: Deluxy.it 160,8 (media 13,4%), Deluxyflowers 189,1 (15,8%),
> B2B 218,4 (18,2%), Experience 240 (20%), CakeDesign 248,6 (**20,7%**).

**4. Aggiungere un brand.** Prima i brand esistevano solo nel seed: aggiungerne uno voleva dire aprire
il database, quindi non lo faceva nessuno. Ora c'è `POST /api/maison` (nome → slug ricavato e reso
unico, `ordine` in coda). Due nomi uguali si **rifiutano** (409, confronto senza distinzione di
maiuscole) perché un gemello sdoppia i numeri in ogni pagina; due nomi diversi che darebbero lo stesso
slug si **numerano**. Il brand nuovo **nasce a zero** e la pagina lo dice: senza vendite a budget la
percentuale non ha su cosa applicarsi, e il consentito resta 0 finché il budget non si scrive in
Maison.

**4-bis. I mesi passati non valgono zero: portano il loro consuntivo.** Segnalato dall'utente
guardando la pagina — *«i mesi precedenti perché esce 0?»*. Su Deluxy.it gennaio–giugno mostravano
`100% = 0 €` e quindi `= 0 €` di consentito, su sei mesi in cui si è venduto eccome.

La causa, verificata a database: le righe di budget di quei mesi **esistono** ma valgono **zero** su
tutti e tre i canali (`B2B/iniziale=0, D2C/iniziale=0, EVENTI/iniziale=0`) — è il budget azzerato dal
consolidamento del 31/07/2026, quello per cui esiste `scripts/ripristina-budget-azzerato.mjs` e che
**non è mai stato ripristinato** (punto 10 dei punti aperti). La pagina non sbagliava il conto: stava
misurando la pubblicità su una previsione che non c'è più.

Rimedio, lo stesso già scelto in `/maison`: **per un mese chiuso il 100% è il venduto vero**, per un
mese ancora aperto è il budget. Misurare la pubblicità di gennaio sulla previsione di gennaio — che
gennaio ha già smentito — dà un numero che non serve a nessuno. Ogni casella dichiara quale delle due
basi sta usando (`a budget` / `venduto reale`), e se Orders non risponde i mesi chiusi restano sul
budget con l'avviso in chiaro.

⚠️ **Due paletti, perché la stessa cura può fare il danno che cura.** (a) Il consuntivo per brand è il
**venduto dei negozi**: copre il D2C e non eventi o B2B. Si usa **solo quando è sopra lo zero**,
altrimenti «Deluxy Business (B2B)» — che sui negozi non vende niente — si vedrebbe azzerare un budget
vero. Verificato: B2B ed Experience restano `a budget`, Deluxy.it passa a `venduto reale`. (b) Il
budget ADV che usano **Piattaforme** e il **P&L** (`advConsentitoMese` in `calc.ts`) resta sulle
vendite a budget anche per i mesi chiusi: i due numeri **possono non coincidere**, ed è scritto nella
pagina invece di lasciarlo scoprire. Portare la stessa regola anche lì cambierebbe il conto economico
a budget, e non è una decisione da prendere di straforo.

Effetto misurato sul 2026: consentito di Deluxy.it da **71.217 €** a **121.640 €**, totale dell'anno da
178.703 € a **234.020 €** — gennaio da `= 0 €` a `= 6.843 € su 49.948 € (venduto reale)`.

**4-ter. E nei mesi chiusi anche la percentuale è quella vera** (*«ok per i mesi già passati metti i
valori reali»*, 21/08/2026). Sistemata la base, restava una stonatura: la casella di gennaio mostrava
ancora la **percentuale decisa allora**, applicata al venduto vero. Ma su un mese passato «quanto posso
spendere» non è una domanda — i soldi sono usciti. Ora un mese chiuso mostra la percentuale
**misurata** (spesa ADV di Marketing ÷ venduto reale dei negozi) e l'importo **speso davvero**; la
percentuale a budget resta a database, intatta, e si legge nel tooltip della casella.

Conseguenze da tenere in fila, tutte volute:

- **il totale somma le sue caselle**: `speso davvero` sui mesi misurati + `consentito` sul resto. Un
  totale che non torna con quello che si legge sopra è il modo più veloce per non fidarsi di una pagina.
  Perciò la scheda dice *«Speso davvero 44.879 € (Gen–Lug) · consentito 63.717 € sul resto dell'anno»* e
  la tabella finale ha le colonne **Speso davvero · Consentito sul resto · Totale · Differenza**;
- la **somma dei p.p.** diventa «punti davvero usati + punti pianificati» (Deluxy.it: 141 p.p., media
  11,8% — era 160,8 a budget);
- la **differenza** rispetto al salvato riguarda solo i mesi aperti, perché lo speso non si modifica.

**L'abbinamento fra i brand di Marketing e le maison è confermato dall'utente, non dedotto**
(`gifts → Deluxy.it`, `flowers → Deluxyflowers.com`, `cake → CakeDesign.me`, in `BRAND_MARKETING` dentro
`src/lib/marketing.ts`): `flowers` combaciava con lo slug, gli altri due nessuna regola li avrebbe
presi, e attribuire la spesa al brand sbagliato falsa il confronto senza che si veda. Riscontro che
chiude il cerchio: la somma dei tre brand fa **75.147 €**, cioè *esattamente* il totale ADV di Marketing
per gen–lug — nessuna spesa resta fuori. Se un domani un brand di Marketing non trovasse casa, la
pagina lo elenca invece di lasciarlo cadere.

⚠️ **Dettagli tecnici e trappole.** L'API di Marketing raggruppa **o** per mese **o** per brand
(`raggruppa=brand,mese` risponde una lista vuota): si chiede **un mese per volta** e si compone qui, in
parallelo, solo sui mesi chiusi. Una casella a `null` vuol dire **non misurato** — mese aperto,
Marketing muto, o brand che in Marketing non esiste — e non «zero speso»: **B2B ed Experience non fanno
campagne**, quindi restano sul consentito a budget anche nei mesi passati, e la pagina lo scrive.

📌 **Cosa si legge adesso, e non si leggeva prima** (gen–lug 2026): Deluxy.it ha speso **44.879 €** su
432.942 € venduti (**10,4%**), Deluxyflowers **19.750 €** su 140.556 (**14,1%**), e **CakeDesign.me
10.518 € su 40.750 (25,8%)** — contro una media a budget del 20,7%. Il brand più piccolo è quello che
spende di più in proporzione, e prima della modifica quel numero non stava da nessuna parte.

**5. Una percentuale sopra il 100% è impossibile, e si dice con il metro accanto.** Spendere in
pubblicità più di quanto il mese vende non è un budget aggressivo: è un budget che non esiste.
`max={100}` sull'input **non lo impedisce** (frena le frecce, non la tastiera) e l'API lo **tagliava in
silenzio** con `Math.min(100, …)` — a schermo restava 150, a database finiva 100, e nessuno lo sapeva.

Ora la casella diventa rossa, **il salvataggio è bloccato** (quello del brand e quello generale) e
l'API **rifiuta invece di tagliare**, dichiarando quante ne ha scartate (`percentualiRifiutate`). Ma
«impossibile» da solo non basta: senza il metro, chi legge deve andarselo a cercare. Quindi si dice
**quanti punti** si sfora e **quanto vale il 100%** di quel mese, che è il tetto della spesa:

- nella **casella**, che ora ha **tre righe fisse**: quanto fa (`= 7.500 €`), su quanto (`su 50.000 €`,
  cioè il 100% del mese) e da dove viene quella base (`a budget` / `venduto reale`) — oppure lo
  scostamento, se la casella è stata toccata. In errore diventano `+37,5 punti` · `oltre il 100%` ·
  `su 50.000 €`;
- nella **scheda del brand**: *«Ago: 137,5% — 37,5 punti oltre il 100%, e per quel mese il 100% è
  50.000 € (tetto della spesa) · a 137,5% farebbe 68.750 €»*;
- l'**etichetta** invece è tornata corta (`Ago`, `Lug · chiuso`): il metro sta sotto l'input, dove lo
  si legge insieme all'importo, e un'etichetta corta non va a capo — che è metà del problema di
  allineamento qui sotto.

Il controllo guarda **tutti** i mesi aperti, non solo quelli appena toccati: il salvataggio manda
comunque tutto ciò che è ancora scrivibile, quindi un valore fuori scala rimasto lì da prima
partirebbe insieme agli altri. I mesi chiusi non si segnano in rosso: additare un errore che nessuno
può correggere non serve a niente.

**6. Ogni brand ha il suo bottone Salva**, nella sua scheda, che manda solo i suoi mesi; quello in
fondo salva tutti. Dodici caselle si sistemano un brand per volta, e dover scorrere fino in fondo per
salvarne uno fa salvare anche gli altri per sbaglio. Salvando un brand si azzerano **solo le sue**
caselle in sospeso: ripulirle tutte farebbe sparire dallo schermo le modifiche degli altri senza che
nessuno le abbia scritte da nessuna parte.

**7. L'allineamento della griglia dei mesi, in due passaggi.** L'etichetta lunga («Lug · 100% =
50.000 € · chiuso») va a capo e spingeva in basso *quel* campo, sfalsando la riga. Risolto **senza
altezze fisse** — un numero da indovinare, sbagliato al primo carattere in più: la cella è una colonna
flex e l'etichetta ha `flex: 1`, così si allarga fino all'altezza della riga e gli input partono tutti
dalla stessa quota. Misurato: prima i campi della stessa riga stavano a `top` 593 e 595, poi a uno solo.

⚠️ **E non bastava, perché la riga si rompe anche da sotto.** La riga sotto l'input cambia altezza con
lo stato della cella (importo; importo + scostamento; l'avviso di sforamento): con il contenuto
allineato in basso, la cella più alta faceva salire il **proprio** input rispetto agli altri — è
esattamente il difetto della seconda segnalazione, con agosto più in alto degli altri mesi. Rimedio in
due mosse: la didascalia ha **sempre tre righe** (`min-height: 4.05em` con `line-height` esplicito) e
**ogni riga resta una riga** (`white-space: nowrap`, con ellissi se proprio non ci sta). Altezza
prevedibile, quindi input in linea in **tutti** gli stati. Verificato misurando il `top` di ogni input
riga per riga, nei tre stati: un solo valore per riga in tutti e tre.

🔎 **Come è stato verificato** (dev locale sullo stesso database di produzione): 60 caselle, **35
disabilitate** = Gen–Lug × 5 brand; totale 178.703 € di cui 40.884 nei mesi chiusi; portando agosto di
Deluxy.it da 13,4% a 20% → totale 182.003 €, `+3.300 €` sulla casella, sul brand e sul totale; salvato
e **rimesso a 13,4** subito dopo, ricontrollando il valore a database. A 150% la casella si è fatta
rossa e **tutti** i bottoni si sono spenti; la `PUT` di 150% su settembre ha risposto
`{"percentualiRifiutate":1}` lasciando 13,4 a database (non 100). Il salvataggio per brand: con due
brand modificati, premendo «Salva CakeDesign.me» si è salvato **solo** quello e la modifica in sospeso
di Deluxy.it è rimasta a schermo, evidenziata. Tutti i valori toccati sono stati riportati agli
originali, e il brand di prova creato per l'occasione è stato **cancellato**, dopo aver verificato che
non avesse né budget né percentuali.

⚠️ **Trappola di misura, non di codice**: nel pannello browser non a schermo il `borderColor`
*calcolato* di un input già esistente resta quello vecchio anche dopo che la classe è cambiata — lo
sfondo della stessa regola si aggiorna, il bordo no. Sembrava una regola CSS che non si applicava. La
prova che scioglie il dubbio è un **elemento nuovo** che matcha lo stesso selettore: lì il colore
calcolato è giusto. Vedi anche «QA: pannello browser non a schermo» nelle note di lavoro.

### Una soglia attraversata non è un buco chiuso (21/08/2026)

Stessa forma, altro dato. `src/lib/marketing.ts` dichiarava parziale un account pubblicitario sotto
l'**80%** dei giorni coperti, e `AdvCompetenza` mostrava le avvertenze **solo** quando la copertura
non era completa. Il 17/08 `flowers/meta_ads` stava a 103 giorni su 229 e l'avvertenza si vedeva; il
21/08, dopo altri caricamenti, sta a **191 su 233** — sopra la soglia — quindi `completa` è tornato
`true` e i **42 giorni ancora scoperti sono spariti da ogni pagina**. Il buco non si era chiuso:
aveva attraversato una soglia.

Due correzioni, piccole e indipendenti:

- un account che non copre tutto il periodo si dichiara **comunque**, con la stima di quanto manca al
  suo stesso ritmo di spesa (`spesa ÷ giorni con dati × giorni mancanti`). Tolleranza di **7 giorni**,
  perché Google e Meta consolidano l'ultimo giorno con un po' di ritardo e quella non è una mancanza.
  Oggi: *«2 account coprono quasi tutto il periodo ma non tutto (flowers/meta_ads: mancano 42 giorni su
  233; cake/meta_ads: mancano 37): al loro ritmo sono circa 1.280 € che il totale di Marketing non
  conta»*;
- le avvertenze si mostrano **anche a copertura completa**, con un attacco diverso («la copertura è
  completa, ma non è tutto coperto»), invece di sparire proprio quando restano l'unica traccia.

### 67 regole erano morte per uno spazio che non è uno spazio

Trovato il 31/07/2026 cercando perché uno **stipendio** stesse fra le quote dei partner. Due
caratteri invisibili, incollati insieme al nome copiando da una pagina web:

- lo **spazio non separabile** (U+00A0), che si scrive esattamente come uno spazio normale ma non lo
  è — quindi una regola a **match esatto** non scatta *mai*;
- il letterale **`&nbsp;`**, cioè HTML finito dentro il campo.

**67 regole su 2.500** ne avevano uno dentro. Una di queste nominava
`Giada Maria Francesca Lo Proto` come **dipendente**: non scattando, vinceva la regola generica
`lo proto` e quegli **8.194 €** finivano in «Partner che eseguono gli ordini» — cioè *fuori dal
conto economico* invece che nel **costo del personale**. Le altre 66 erano doppioni di regole già
funzionanti, e infatti la correzione sposta **una sola** controparte: quella.

Corretto nel confronto, non nei dati: `normalizzaNomeRegola()` in `src/lib/cfo.ts` e la gemella in
`deluxy-partner/src/lib/categorie-spesa.ts` ripuliscono **entrambe le parti** prima di confrontarle.
Due normalizzazioni diverse sarebbero due classificazioni diverse sulla stessa spesa, quindi le due
funzioni devono restare identiche.

### «Riclassifica tutto» in Finance

Il bottone «Applica le regole» riempie **solo le caselle vuote** — giusto, ma vuol dire che quello
che è già stato assegnato resta com'è **per sempre**, anche quando la regola che l'aveva deciso
viene corretta. È esattamente il caso qui sopra: sistemata la regola, quegli 8.194 € sarebbero
rimasti dov'erano.

Da qui il secondo bottone, **«↻ Riclassifica tutto»** (richiesta dell'utente, 31/07/2026: *«Finance
deve importare le regole di budget per le spese e usare quelle per riclassificare le proprie
spese»*): riapplica le regole a **tutte** le uscite. Due cose che non tocca, ed è deliberato — le
assegnazioni **fatte a mano** (una persona che decide batte una regola) e le entrate. E quando
nessuna regola riconosce più una controparte la categoria si **toglie**: una regola cancellata deve
poter disfare quello che aveva fatto, altrimenti «riclassifica» sarebbe solo «aggiungi».

> ⚠️ **Le regole non sono salvate in Finance: si rileggono a ogni passata.** Sono 2.500, pesano
> **124 KB** e la chiamata dura **1,1–3,4 s** (misurato; il 3,4 è a freddo). Il che ha fatto venire
> fuori un guasto grosso: il timeout era **6 s**, e nel `catch` Finance ripiegava sulla **cache dei
> nomi — che le regole non le ha** — restituendo però `ok: true`. Una riclassificazione partita così
> avrebbe avuto **zero regole**, e siccome toglie la categoria dove nessuna regola risponde,
> **avrebbe cancellato la classificazione di due anni** credendo di aggiornarla. Corretto su tre
> livelli: timeout a **25 s** quando si chiedono le regole (è un'azione chiesta a mano, non il
> render di una pagina), la cache **non** si usa più come ripiego quando servono le regole, e sia il
> client sia l'azione **si fermano se le regole ricevute sono zero**. In pagina si legge **quante
> regole sono arrivate**: «Finance ha le regole?» è una domanda a cui si deve poter rispondere
> guardando, non fidandosi.

> ⚠️ **Le 46 che Budgets classificava e Finance no non erano un problema di regole, ma di spazi**
> (31/07/2026). **2.411 delle 2.500 regole sono a match esatto**, e un match esatto contro
> `" Alice Angelotti"` — con lo spazio davanti, come arriva da Qonto — non scatta mai. Budgets non
> se ne accorgeva perché riceve i nomi **già aggregati e ripuliti** da `/api/spese`, mentre Finance
> confronta il campo grezzo del movimento: **54 movimenti del 2026 per 4.078 €**. È anche la
> spiegazione del residuo che non tornava fra le due app (Finance 8.662 € contro 4.117 € qui).
> Corretto in `categoriaDaRegole()` di Finance, che ora normalizza entrambe le parti del confronto.
> **Va ripremuto il bottone** perché la fotografia si rifaccia.

**Dal 01/08/2026 Marketing la chiama davvero.** Fino a quel giorno l'API esisteva «per Marketing» ma
nessuno l'aveva collegata: Marketing teneva una **copia propria** del budget pubblicitario, la
tabella `BudgetMensile` importata a mano dal foglio «Budget adv» del Monitoraggio — che al momento
del collegamento aveva **nove righe in tutto** (giugno, luglio, agosto per i tre siti). Cioè **da
settembre in poi Marketing non aveva nessun tetto di spesa**, mentre qui il budget arrivava a
dicembre. Client in `deluxy-marketing/src/lib/budgets.ts`, chiave `BUDGETS_API_KEY` aggiunta al suo
ambiente di produzione; l'abbinamento sito → maison (`gifts`→Deluxy.it, `cake`→CakeDesign,
`flowers`→Deluxyflowers) sta scritto in un punto solo. Le due cifre restano **affiancate**: sono due
strade per lo stesso numero — lì il ROS, qui una percentuale sulle vendite — e dove si discostano la
differenza è una domanda da fare, non un errore da nascondere.

**`/api/v1/maison` nasce per Marketing**, che deve sapere due cose che vivono solo qui: quanto una
maison deve vendere in un mese e **quanto può spendere in ADV** in quel mese. Senza, Marketing
terrebbe una copia dei budget — e due copie che divergono fanno decidere le campagne su numeri
sbagliati.

Risposta: per ogni maison i dodici mesi con `vendite` per tipologia, `venditeTotali`, `advPercent`,
`advConsentito` e `advPubblicato`, più i totali. In cima l'elenco delle `tipologie` con il margine,
perché le chiavi di `vendite` sono i loro slug e senza l'elenco chi consuma dovrebbe indovinarli.

> **: i compensi restano fuori di default.** Il Hub sa chi e una
> persona, non in che squadra sta ne chi ne risponde: quello nasce dal budget del
> personale e vive qui. Il **costo azienda** pero esce solo con  —
> sono stipendi, e un API che li restituisce a chiunque abbia la chiave e un modo
> silenzioso di farli girare. La **stima del netto in busta non esce mai**: e un
> calcolo di pianificazione con parametri fiscali di un altro anno, utile dentro
> Budgets dove la pagina lo spiega, ingannevole fuori dove sembrerebbe un
> cedolino. Chi non ha squadra esce in : un elenco che perde persone
> per strada e peggio di uno con una voce «senza team».

> **Lo scenario vale anche per l'ADV.** Con `?livello=SFIDANTE` le vendite salgono del
> moltiplicatore e **con loro il budget pubblicitario**, perché l'ADV consentito è una percentuale
> sulle vendite: restituire la crescita senza i soldi per farla sarebbe un piano che non sta in
> piedi. `advPubblicato` invece **non** si moltiplica: è un riferimento storico, non uno scenario.

## Più utenti: si entra dal Hub (SSO)

La password di team è **una sola e condivisa**: va bene per chi amministra, non per far entrare
persone diverse. Gli utenti stanno nel **Hub** — email, ruolo, e quali app può aprire ciascuno — e
il Hub passa a Budgets un token cifrato (`HUB_SSO_SECRET`, lo stesso valore nelle due app) su
`/api/sso?token=…`. Budgets **non tiene un elenco di utenti suo**: due elenchi che divergono sono il
modo più veloce per lasciare dentro qualcuno che è stato tolto.

Due profili, mappati sul ruolo del Hub:

| Ruolo nel Hub | In Budgets | Cosa vede |
| --- | --- | --- |
| `admin` | **admin** | tutta l'app |
| qualsiasi altro (es. `commerciale`) | **proposte** | **solo** `/proposte`: manda il proprio budget e vede le proprie |

Perché così: in queste pagine ci sono stipendi, premi e margini. Chi entra per mandare il proprio
budget non ha bisogno di sapere quanto guadagnano gli altri, e «non ne ha bisogno» è il criterio
giusto per un permesso.

Il ruolo viaggia in una **sessione firmata** (`src/lib/sessione.ts`, HMAC-SHA256 con Web Crypto —
niente Prisma né `node:crypto`, perché la legge anche il middleware che gira su Edge). Chi provasse
a scriversi `ruolo: admin` produrrebbe una firma che non torna. Dura **7 giorni**, meno dei 30 della
password di team: disattivando un utente il middleware non può accorgersene subito, quindi la
finestra in cui una sessione già aperta sopravvive va tenuta stretta.

> **La password di team resta come via di riserva**, con pieni poteri: se il Hub è irraggiungibile o
> si lavora in locale si entra lo stesso. È una porta che resta aperta, ed è una scelta — non una
> dimenticanza.

Serve in produzione: `HUB_SSO_SECRET` (uguale a quello del Hub) e `APP_SECRET`. Nel catalogo del Hub
Budgets ha `sso: true` e i ruoli `admin` + `commerciale`.
