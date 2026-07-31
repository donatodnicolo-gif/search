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
- **CFO** (`/cfo`): scarica gli **addebiti bancari** dall'app Finance (`/api/spese`, uscite per
  controparte e per mese) e li **riclassifica in categorie di costo** tramite regole
  (controparte → categoria, il match più specifico vince). Ricostruisce la struttura dei costi,
  mostra la % di copertura e le controparti **da categorizzare** con assegnazione rapida (crea
  una regola permanente). Ogni categoria è agganciata a una voce di P&L (COGS/ADV/Personale/
  Struttura/Esclusa). Le controparti da categorizzare sono mostrate per importo (le prime 100),
  con nota su quante restano. Richiede `FINANCE_API_KEY` e l'API `/api/spese` di Finance (live).
  Categorie e regole si aggiungono, si rimuovono e **si modificano**: nome e voce di P&L si cambiano dalla riga della categoria, senza cancellarla e perdere le regole che le erano state insegnate — è il modo per spostare, per esempio, i pagamenti ai partner fuori dai costi. **Proposte con AI**: un bottone chiede a OpenAI
  di ipotizzare la categoria di ogni controparte non classificata (con confidenza e motivo); le
  proposte pre-compilano le tendine e si confermano una a una o in blocco (solo le alte
  confidenze). L'AI propone, l'utente conferma: nulla è applicato in automatico. Richiede
  `OPENAI_API_KEY` (segreto, come le altre app Deluxy); senza chiave il resto del CFO funziona
  e il bottone spiega come attivarla.
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

  **E adesso il budget si può scrivere** (31/07/2026). Fino a quel giorno in `BudgetEntry` scrivevano
  solo tre cose: il **seed** dall'Excel, `/margini` (che cancella le voci di una tipologia eliminata)
  e il **consolidamento di una proposta**. Cioè il budget si poteva *importare* o *ereditare*, ma non
  *scrivere*: se a un brand mancava un canale, l'unico modo di aggiungerlo era inventarsi una
  proposta e consolidarla. In `/maison/[slug]` la griglia **canale × dodici mesi** è editabile
  (`PUT /api/budget`, componente `BudgetMaison`), e sotto si vede l'**ADV consentito ricalcolarsi da
  solo**.

  > **Un canale senza budget non è un canale a zero: è un canale che non porta ADV con sé.** Quanto
  > si può spendere in pubblicità è `vendite del mese × % ADV`, e le vendite del mese sono la somma
  > **di tutti i canali** (`advConsentitoMese` in `src/lib/calc.ts`). Quindi un brand a cui manca
  > Eventi o B2B non perde solo quella riga di ricavo: si vede assegnare **meno soldi per fare
  > pubblicità**, e nessuna schermata lo diceva. Oggi la pagina lo dice, con il badge dei canali
  > vuoti. Al 31/07/2026 mancano **4 coppie brand-canale su 15**: Business B2B non ha D2C né Eventi,
  > Experience non ha D2C né B2B — e Deluxy.it ha sei mesi a zero su tutti e tre, quindi **ADV
  > consentito zero da gennaio a giugno**.

  > **Si scrive solo il livello pubblicato.** Su *sfidante* e *irraggiungibile* le caselle sono in
  > sola lettura e la pagina spiega perché: quei numeri non sono un dato, sono il pubblicato per un
  > moltiplicatore, e lasciarli scrivere vorrebbe dire salvare uno scenario credendo di salvare un
  > budget. Il salvataggio avviene **uscendo dalla casella**, non a ogni tasto: scrivere «55000»
  > sono cinque salvataggi, e i primi quattro sono numeri che nessuno ha mai voluto scrivere.
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
  > era nato.
- **Spese ADV** (`/spese`): quanto si può spendere in pubblicità per maison come **% delle
  vendite del mese**, personalizzabile mese per mese; l'importo consentito si ricalcola.
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

## Punti aperti (29/07/2026)

1. ⚠️ **La quota Deluxy misurata è scesa al 25,9% su Gen–Giu 2026** (382.801 € girati ai partner su
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
2. **I margini per tipologia a budget** (D2C 35%, Eventi 20%, B2B 20%) restano scritti sul venduto
   lordo: applicati a ricavi ormai netti danno un EBITDA a budget negativo e «12 mesi in perdita»,
   che è un artefatto. Rifarli **cambia i premi**.
3. **4.117 € ancora senza categoria** nel 2026 (140 controparti, copertura **99,5%**) e 4.015 € sul
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
8. **Google Ads `956-137-8913`** non è censito in Marketing (1.305 € nel 2026).
9. **`HUB_SSO_SECRET` e `APP_SECRET` mancano su Vercel**: senza il primo l'accesso dal Hub non
   funziona e l'app chiede la password di team.
10. **Lo scontrino del partner**: il modello C regge solo se il fioraio lo emette davvero. Non è
    codice — è una verifica coi partner, ed è l'unico punto che può invalidare il resto.

## Stato

**FATTO**: schema dati, seed 2026 dai file Excel, dashboard 3 livelli, **P&L aziendale
completo** (annuale, mensile e per maison), **sezione Dipendenti** (RAL/stagisti/consulenti
con mesi di competenza), dettaglio maison D2C/Eventi/B2B, team commerciale per linee e
clienti, invio e lista proposte, spese ADV con % per mese personalizzabili, impostazioni
scenari/premi/costi, **consuntivo D2C dal registro ordini** (Orders `/api/v1/ricavi`: venduto per
maison e per mese, IVA inclusa come il budget), catalogo Hub aggiornato (id `budgets`, `APP_URL_BUDGETS`),
**pubblicata su Vercel** ([deluxy-budgets.vercel.app](https://deluxy-budgets.vercel.app), Postgres/Supabase + password).

**MANCA**:
- **Anno unico 2026**: nessun selettore d'anno; il pluriennale 2027-30 (già nei file pubblicati) non è caricato.
- **Proposte budget**: un Responsabile invia i suoi dodici mesi da /proposte/nuova; l admin apre la proposta (/proposte/[id]), vede il totale accanto a **quanto c e oggi a budget** sullo stesso ambito, **approva o respinge** con una nota, e in un **secondo gesto separato** la **consolida** nel budget ufficiale (BudgetEntry per le maison, TargetLinea per le linee). Approvare e consolidare sono distinti di proposito: una proposta si puo approvare e applicare in parte, piu tardi, o mai. Respingere **richiede una motivazione** (chi l ha scritta deve sapere cosa correggere), consolidare **richiede la voce di budget** su cui applicarla (una proposta per maison non dice se e D2C, Eventi o B2B: indovinarlo scriverebbe numeri nel posto sbagliato), e una proposta **globale non si consolida** perche il budget si scrive per maison o per linea. Ogni consolidamento lascia traccia sulla proposta (data e dove).
- **Premi per singolo responsabile**: oggi è un monte premi totale per livello, non ripartito per persona/team.
- **Consuntivo**: confronto solo dove la mappatura Finance è impostata. Il D2C reale ora arriva da
  Orders (per maison e per mese), ma i ricavi restano **su due basi diverse** — Finance imponibile,
  Shopify IVA inclusa: il totale è dichiarato, non omogeneo. I **rimborsi parziali** sono contati
  per intero (l'importo reso non esiste nel registro ordini).
- **Piattaforme ADV**: split **globale** d'azienda, non per singola maison; il confronto col reale
  esiste solo nel P&L (totale), non piattaforma per piattaforma.
- **Storico Meta assente in Marketing**: al 28/07/2026 gli account Meta hanno dati solo dagli ultimi
  giorni di giugno, quindi l'ADV a consuntivo di gennaio–giugno è di fatto **solo Google** (39.005 €
  contro 82.264 € usciti dal conto). L'app lo dichiara, ma il buco si chiude in **Marketing**,
  ricaricando lo storico Meta: non è una cosa che si aggiusta qui.
- **Costo del lavoro**: tredicesima/quattordicesima e TFR non sono voci distinte; nessun consuntivo del personale.
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
