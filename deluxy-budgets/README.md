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
  perché è lì che si annida il doppio conteggio (oggi dentro c'è «Fornitori fiori e torte» per
  346 k€: sono pagamenti ai partner e vanno spostati su «Esclusa dal P&L» in `/cfo`).
  **Due decisioni aperte, dichiarate in pagina e non risolte a mano**: (1) il budget D2C è scritto
  sul **venduto**, quindi su quella riga «scostamento» e «realizzato» confrontano due basi diverse
  (il paragone giusto è in `/venduto`); (2) il **budget** del costo per servizi è ancora calcolato
  come costo del venduto dai margini per tipologia, cioè con la vecchia logica. **L'IVA non si scorpora**: il totale Shopify si usa così com'è,
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
  (lead generation)** con selettore del livello.
- **Team commerciale** (`/commerciale`): le **linee di vendita** (con sottolinee) sono richiamate
  live da **Scout**, che ne è il master (edge function Supabase `linee`, chiave `LINEE_API_KEY`
  dal vault del Hub). Il budget per linea (valore/clienti) resta in Budgets e si aggancia alle
  linee di Scout **per nome**; dove non combacia, la colonna resta “—”. Se Scout non è
  raggiungibile o la chiave manca, la pagina ripiega sulle linee a budget locali. budget per **linee** (Affiliazioni, Consegne
  Corporate, Catering & Eventi, Torte e Mono, Regalistica, Retail Marketing & Concierge,
  Eventi & Altro, Magazzino) e **nuovi clienti** per mese.
- **Proposte budget** (`/proposte`): ogni utente di livello Responsabile invia la propria
  proposta (ambito: azienda / maison / linea, 12 mesi + note); elenco con stato.
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
- **Piattaforme ADV**: split **globale** d'azienda, non per singola maison; nessun raccordo con lo speso reale.
- **Costo del lavoro**: tredicesima/quattordicesima e TFR non sono voci distinte; nessun consuntivo del personale.
- **P&L**: per singola **linea commerciale** non c'è (le linee hanno solo il budget vendite, non un conto economico).

## Chiavi dall'app (Configurazione → Chiavi)

Le chiavi API si possono incollare **dentro l'app** (`/impostazioni/chiavi`), oltre che nelle
variabili d'ambiente e nella cassaforte del Hub. Ordine di precedenza, e la pagina lo dichiara con
un badge su ogni riga: **ambiente → impostata nell'app → Hub**. L'ambiente vince perché è quello
che si cambia in emergenza senza entrare nell'app.

Il valore finisce nel database **cifrato** (AES-256-GCM, chiave derivata da `APP_SECRET` con
scrypt — stessa infrastruttura di `deluxy-merchandising` e `deluxy-messaging`, `src/lib/crypto.ts`)
e **non torna mai al browser per intero**: in pagina si vede solo `sk-proj-…a1b2`, quanto basta a
riconoscere quale chiave è impostata.

> **Senza `APP_SECRET` il salvataggio è disabilitato**, e la pagina lo dice: una chiave in chiaro su
> un database condiviso non è una cosa da fare di nascosto. La variabile va aggiunta all'ambiente
> dell'app (locale e Vercel).

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
