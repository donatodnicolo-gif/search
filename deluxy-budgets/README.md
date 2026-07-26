# Deluxy Budgets

App dei budget aziendali Deluxy (porta **3080**): raccoglie tutti i budget, calcola il P&L
con i costi e stabilisce i premi su **3 livelli di budget** — *raggiungibile* (il budget
pubblicato), *sfidante* e *irraggiungibile*.

## Cosa fa (v1)

- **L'app si apre sul Consuntivo**: `/` rimanda a `/consuntivo`, perché la domanda quotidiana è
  «come sta andando davvero», non «cosa avevamo pianificato». Anche il login atterra lì.
- **Dashboard** (`/dashboard`): sintesi del conto economico 2026 sui 3 livelli + riepilogo per
  maison. Resta la prima voce della sidebar, non è più la home.
- **P&L** (`/pl`): conto economico aziendale completo — ricavi per canale, costo del venduto,
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
  Categorie e regole si aggiungono/rimuovono. **Proposte con AI**: un bottone chiede a OpenAI
  di ipotizzare la categoria di ogni controparte non classificata (con confidenza e motivo); le
  proposte pre-compilano le tendine e si confermano una a una o in blocco (solo le alte
  confidenze). L'AI propone, l'utente conferma: nulla è applicato in automatico. Richiede
  `OPENAI_API_KEY` (segreto, come le altre app Deluxy); senza chiave il resto del CFO funziona
  e il bottone spiega come attivarla.
- **Consuntivo** (`/consuntivo`): gli importi **realmente fatturati** per tipologia di servizio,
  richiamati dall'app **Finance** (`deluxy-partner`, endpoint `/api/tipologie`) con selettore di
  periodo (anno / 1° / 2° semestre) e stato (tutte / saldate / aperte). Il fatturato reale si
  **raggruppa per voce di budget** secondo la mappatura impostata in Margini (campo "Voci in
  Finance": più categorie di Finance possono confluire in una voce — es. il B2B raccoglie
  Consegne, Food Supplier, Magazzino, Affiliazioni, Clientelling), con **budget vs consuntivo,
  scostamento e % realizzato**. Il fatturato non associato ad alcuna voce è elencato a parte,
  così nulla è nascosto. Richiede `FINANCE_API_KEY` in
  `.env` (la stessa chiave di `/api/verifiche` di Finance, **segreto, mai committato**);
  `FINANCE_API_URL` è opzionale. Senza chiave la pagina spiega come configurarla.
  **Le vendite ecommerce non passano da Finance** — nascono sui negozi Shopify — quindi il
  consuntivo del canale D2C arriva dal registro ordini **Orders** (`GET /api/v1/ricavi`, chiave
  `ORDERS_API_KEY` + `ORDERS_URL`), che dà il venduto per brand e per mese. La pagina lo somma
  ai ricavi (riga D2C e split mensile) e lo apre nella tabella **Vendite ecommerce per maison**:
  i negozi si abbinano alle maison per nome (`deluxy.it` → Deluxy.it) o per slug (`Flowers` →
  flowers), e un negozio senza maison resta comunque a vista su una riga a parte. In pagina si
  parla di «vendite ecommerce»; «D2C» resta il nome della **voce di budget**, che a DB si chiama
  così (`TipologiaServizio.slug`). Il totale Shopify è **IVA e
  spedizione incluse** mentre il budget è imponibile: lo scorporo si sceglie in pagina (IVA 22%
  predefinita, 10%, oppure «Lordo» per il dato Shopify tale e quale), perché l'aliquota non è
  salvata sull'ordine e non va indovinata. Ordini **annullati e rimborsati esclusi**; i rimborsi
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
  confrontano gli **stessi mesi** dell'anno prima (Gen–Giu con Gen–Giu, non con l'anno intero),
  con la **stessa aliquota IVA** — altrimenti si misurerebbe lo scorporo invece delle vendite.
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
maison e per mese, scorporo IVA a scelta), catalogo Hub aggiornato (id `budgets`, `APP_URL_BUDGETS`),
**pubblicata su Vercel** ([deluxy-budgets.vercel.app](https://deluxy-budgets.vercel.app), Postgres/Supabase + password).

**MANCA**:
- **Anno unico 2026**: nessun selettore d'anno; il pluriennale 2027-30 (già nei file pubblicati) non è caricato.
- **Proposte budget**: si raccolgono ma non si **approvano/consolidano** nel budget ufficiale.
- **Premi per singolo responsabile**: oggi è un monte premi totale per livello, non ripartito per persona/team.
- **Consuntivo**: confronto solo dove la mappatura Finance è impostata. Il D2C reale ora arriva da
  Orders (per maison e per mese), ma resta **un'unica aliquota IVA** scelta a mano per scorporare
  il venduto Shopify: non c'è un'aliquota per maison né per prodotto. I **rimborsi parziali** sono
  contati per intero (l'importo reso non esiste nel registro ordini).
- **Piattaforme ADV**: split **globale** d'azienda, non per singola maison; nessun raccordo con lo speso reale.
- **Costo del lavoro**: tredicesima/quattordicesima e TFR non sono voci distinte; nessun consuntivo del personale.
- **P&L**: per singola **linea commerciale** non c'è (le linee hanno solo il budget vendite, non un conto economico).
