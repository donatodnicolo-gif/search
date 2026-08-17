# Handoff — Deluxy Marketing

> Stato al **17/08/2026**. Una finestra Claude nuova deve poter riprendere da qui
> senza altro contesto. Leggere prima il [README](../README.md) per cosa fa l'app;
> questo documento dice **dove siamo** e **cosa manca**.

## In una riga

App **live** su https://deluxy-marketing.vercel.app (password `MARKETING_APP_PASSWORD`,
al primo deploy `seta-rose-4728`). Postgres condiviso Deluxy, schema `marketing`.
Riceve ogni notte i dati veri da Google Ads (**tutti e tre gli account**), ogni
ora da Meta (tre account, in sola lettura), ogni 3 ore gli ordini da Deluxy
Orders (8.342 ordini dei tre brand dal 01/01/2025).

## Cartella di lavoro e deploy

- Cartella: `C:\Users\nicol\scoutwt\deluxy-marketing` (branch **scout-ui**)
- Deploy: `npx vercel deploy --prod --yes` dalla cartella dell'app.
  Il progetto Vercel **non è collegato a GitHub**: il push non pubblica, si
  pubblica dalla CLI. (Il push su GitHub funziona: `git push origin scout-ui`.)
- Database: `npm run configura-db -- ../deluxy-hub/.env` rigenera il `.env`.
  ⚠️ Il `.env` locale punta al **Postgres di produzione**: quello che si modifica
  in sviluppo scrive sui dati veri. Non esiste ancora uno schema `marketing_dev`.

## Fotografia del 17/08/2026 (verificata su produzione, sola lettura)

Controllo fatto la mattina del 17/08 con `/api/health`, `vercel ls/inspect` e
query dirette sul database (nessuna scrittura). **Prima di lavorare, rileggere
questi numeri: dicono cosa gira e cosa è fermo.**

- **Produzione = codice.** Ultimo deploy di produzione alle **15/08 09:18:29**
  (`deluxy-marketing-42iwaw2it`), stesso minuto dell'ultimo commit
  `caa38322` (15/08 09:18): non c'è niente di committato e non pubblicato.
  Health `200` in 0,65 s, `X-Vercel-Id: fra1::fra1` (le funzioni girano già
  a Francoforte accanto al database — `"regions": ["fra1"]` in `vercel.json`).
  `npx tsc --noEmit` pulito, `node scripts/prova-script-google.mjs` = 9
  lavori su 9 ok, 0 rotti.
- **Google Ads consegna da tutti e tre gli account, ogni notte**: Cake
  (846-090-5423) alle 02:38, Gifts (248-656-1148) alle 03:47, Flowers
  (825-518-1560) alle 05:14 del 17/08 — anagrafica, metriche, gruppi,
  keyword-giorni, diagnosi, asset, copy, stati-keyword, tutte con esito ok,
  **zero consegne non-ok negli ultimi 10 giorni**. Le tre chiavi per account
  (`google-ads-gifts/-cake/-flowers`) non si usano più: gli script usano la
  chiave `google-ads` (ultimo uso 17/08 08:09).
- **La versione dello script nei tre account è quella dell'11/08**, non
  quella del 15/08: arrivano gli `annuncio` (KPI per annuncio, 820 Gifts ·
  168 Flowers · 75 Cake) e le `destinazione` con l'id a tre parti
  (1.056/1.056), ma **`MetricaAnnuncio` ha 0 righe e `annuncio-giorni` non è
  mai stato ricevuto** → la storia giornaliera degli annunci (commit
  `caa38322`) aspetta il **reincollo delle copie del 15/08** da
  `C:\Users\nicol\Downloads\deluxy-google-ads\` (10 file, 15/08 09:18).
  Basta reincollare `tutto.js` (il lavoro `keyword-giorni` dentro `tutto`
  manda entrambe le tabelle). ⚠️ CHIAVE_API e BRAND vanno rimessi a mano.
- **Storia giornaliera delle keyword: c'è, e c'è anche il passato**:
  `MetricaKeyword` parte dal **12-13/04/2026** su tutti e tre gli account
  (Gifts 15.955 righe/426 criteri, Flowers 5.554/152, Cake 2.462/85) — il
  giro una tantum con `GIORNI_INDIETRO = 90` è stato fatto.
- **Località lette**: 255 righe di `LocalitaCampagna` su 158 campagne (le
  «non ancora lette» dovrebbero essere sparite dalle vive).
- **Id delle keyword**: restano **419 righe col numero nudo** su 22.110
  (1,9%, era il 60% l'08/08) — sono le righe che nessun giro conferma più.
- **Metriche giornaliere di campagna**: Google fino al 16/08 (Cake, Gifts) e
  17/08 (Flowers); Meta fino al 17/08 su tutti e tre i brand, cron ogni ora
  vivo (ultima corsa 08:07). Spesa 30 giorni: Google Gifts 3.743 € · Flowers
  3.649 € · Cake 1.008 €; Meta Gifts 1.694 € · Flowers 1.176 € · Cake 822 €.
- **Coda operazioni**: 47 eseguite · 15 in attesa · 5 annullate · **0
  approvate ferme · 0 fallite**. Le 15 in attesa sono le `nuova_keyword`
  «torte roma / torino / napoli…» (frase) messe in coda il 15/08 06:35 su
  `[Cakedesign] | Sales | ITA` da «Estendi con AI» — aspettano una persona.
  Ultime eseguite: 4 cambi budget il 15/08 (Torte MILANO, Fiori Milano ITA,
  Lead Generico → 10 €/g), 2 keyword nuove su Cake l'11/08, la riattivazione
  di «flowers delivery milan» (la riga ferma dal 07/08) e la pausa del gruppo
  ROSE l'11/08. **La catena coda → approvazione → script → esito funziona.**
- **Campagne**: Google 19 attive · 1 in pausa · 1 bozza · 140 defunte; Meta
  6 attive · 59 in pausa · 4 defunte. `Campagna.account` è scritto su tutte
  le vive Google (19/19); manca solo sulle defunte e su gran parte delle Meta
  in pausa (non consegnano metriche → l'import non le tocca: normale).
- **Ordini da Deluxy Orders**: cron ogni 3 ore vivo (06:20 del 17/08),
  8.342 ordini (Gifts 6.097 · Flowers 1.514 · Cake 731) dal 01/01/2025,
  ultimo ordine 17/08 05:05.
- ✅ **Sync Drive: rifatta il 17/08 alle 08:31** (era ferma dal 04/08 16:41).
  **644 documenti** trovati, 3 nuovi, 334 aggiornati, 1 rimosso,
  **0 analisi importate**. Non ha un cron Vercel (in `vercel.json` ci sono
  solo `meta` e `ordini`) e l'attività programmata di Claude gira solo con
  l'app desktop aperta: va lanciata a mano con `npm run sync-drive` o
  «Sincronizza ora».
  ⚠️ **Lo zero delle analisi non è un guasto: è il Drive che è fermo.** Il
  documento più recente della cartella è del **07/08** (`APPEND 00.2
  ADV-Gifts 2026-08-07 1100.md` e il `BRIEFING App Gifts 2026-08-07`), e
  l'ultima *Analisi* in archivio è del 04/08. Dopo 13 giorni di sync mancata
  ci si aspetta un raccolto: non essercene vuol dire che **da due settimane
  non viene prodotta analisi nuova su Drive**, non che l'import non funzioni.
  Sono due diagnosi opposte e portano ad azioni opposte — prima di cercare
  un bug nell'import, guardare la data del file più recente nella cartella.
  Archivio a oggi: 644 documenti (278 definitivi · 94 archivio · 83 analisi ·
  75 pubblici · 44 piani · 37 audit · 24 altro · 7 creatività · 2 seo) e
  **86 Analisi**.
- **Meta resta in sola lettura**: `META_SCRITTURA` spenta, il motore
  `lib/meta-scrittura.ts` c'è ma non ha `ads_management`. TikTok scollegato.

## FATTO

### Quanto budget usa ogni campagna, e «Crea campagna» segue il brand (17/08/2026)

Commit `37f3b551`, in produzione (deploy 17/08, health 200).

- ⭐ **«Budget usato» sulle card di `/campagne`** (`lib/budget-usato.ts`): quanto
  del budget giornaliero la campagna sta davvero spendendo, con l'etichetta che
  dice cosa farne — **al tetto** (≥95%: è il budget a limitarla, alzarlo porta
  volume), **molto sotto** (<50%: il freno non sono i soldi, alzarlo non
  cambierebbe niente), **nella norma** in mezzo. Il colore si accende solo sui
  due estremi: colorare tutto equivale a non colorare niente.

  ⚠️ **Tre scelte che cambiano il numero, tutte dichiarate nel `title` della
  cella.** (1) **Oggi non conta**: il giorno in corso è mezzo giorno, e
  includerlo abbasserebbe ogni percentuale ogni mattina — a mezzogiorno «48%»
  sarebbe l'ora, non un problema (stessa ragione per cui `OggiCampagna` tiene il
  giorno in corso separato). (2) **Si divide per i giorni in cui ha davvero
  erogato**, non per i giorni del periodo: una campagna accesa 3 giorni su 7 che
  in quei 3 ha finito il budget ha usato il 100% di quello che poteva, non il
  43% — e il 43% porterebbe alla conclusione opposta a quella giusta.
  (3) **Senza budget si scrive un trattino, non uno zero**: su Meta il budget può
  stare sull'ad set (CBO) e non sulla campagna, e lì non è «zero», è «non lo so».

  Misurato in pagina su Flowers 7 giorni: 58% «nella norma», 103% e 105% «al
  tetto» (oltre 100% è normale — Google può spendere fino al doppio in un
  giorno e recuperare nel mese).

- **«Lancia su Google Ads» → «Crea campagna», e porta con sé il brand**
  (`?brand=`): il modulo ripartiva **sempre da «gifts»**, quindi chi stava
  filtrando Flowers rischiava di creare la campagna sul marchio sbagliato — un
  errore che si scopre quando è già su Google. Ora il brand arriva dall'elenco,
  il titolo lo dichiara («Crea campagna · Flowers») e sopravvive anche ai
  redirect d'errore (`tornaBrand`).

- **Il modulo è rifatto a sezioni**, una domanda per scheda, con le icone del set
  esistente: obiettivo, nome e marchio, budget, località, URL, keyword e
  negative, annuncio. **Tutto senza JavaScript** — radio e checkbox veri,
  nascosti alla vista ma **non alla tastiera** (`position:absolute` + opacity, mai
  `display:none`), con la carta come `<label>` e `:checked + .carta` per lo stato.

- ⭐ **L'obiettivo scrive `tipoConversione`**, che decide se il ROAS è una domanda
  sensata: su «contatti» il valore conversione è simbolico (1,00 €) e col ROAS la
  campagna sembrerebbe una perdita netta. ⚠️ Su **traffico** e **notorietà** resta
  **`null`** invece di essere forzato a «vendite»: un valore inventato si propaga
  in ogni classifica che quel campo tocca.

- ⚠️⚠️ **IL MODULO DICE COSA LO SCRIPT PORTA DAVVERO SU GOOGLE E COSA NO.** Il
  bulk upload degli Scripts ha le colonne di Google Ads Editor: **nome, budget,
  tipo Ricerca, stato, gruppo, keyword, annuncio RSA** — e basta. **Obiettivo,
  località, lingua, strategia di offerta e negative NON sono colonne del bulk
  upload.** Restano scritte in tre posti (campi della campagna dove esistono,
  `note`, parametri dell'operazione) e la pagina dichiara che vanno impostate a
  mano prima di accendere — che è comunque il momento della checklist 4.1.
  **Chiederle e buttarle via sarebbe stato il difetto peggiore**: chi le scrive
  crede di averle impostate, e qualcuno accende la campagna convinto che il
  targeting ci sia. Appena impostate, il giro dopo dello script le rilegge
  (`leggiLocalita`) e l'app le mostra da sola.

- ⚠️ **Trappola ripagata in verifica**: `getComputedStyle` sul bordo delle carte
  dava il valore VECCHIO dopo il click — `border-color` è in transizione e con la
  scheda del browser nascosta le transizioni non avanzano. Sembrava che la
  selezione non funzionasse. Si controlla con `.matches(':checked')` (che non
  dipende dal tempo) o rileggendo dopo aver iniettato `transition: none`.
  Vedi anche la nota sul dev server: `P2024 connection pool timeout` a raffica
  con due dev server sullo stesso Postgres di produzione.

### La storia giornaliera anche per gli annunci, il recap in cima, la coda vista dalla campagna (15/08/2026)

Sette commit in un'ora, tutti pubblicati (deploy 09:18). In ordine:

- **Cliccando una keyword si aprono le sue finestre** (`c1460317`,
  `components/DettaglioKeyword.tsx` + `lib/finestre-keyword.ts`): sulla
  tabella del gruppo la parola è cliccabile e mostra come va a **7 giorni,
  mese corrente, 30 giorni e anno**, dalla storia giornaliera
  `MetricaKeyword`. Una lettura sola per tutte le parole mostrate (mai una
  query per riga), il periodo più lungo ritagliato in memoria.
  ⚠️ **Quando i numeri non ci sono il pannello dice PERCHÉ**, invece di
  mostrare zeri: id di criterio vecchio (si aggancia al prossimo giro
  completo) oppure nessun giorno con dati (la parola non è comparsa, o il
  carico storico non è passato su quell'account). Una keyword senza storia
  non è una keyword che ha speso zero: portano a decisioni opposte.
- **Dopo aver approvato si torna dove si era** (`bea39352`): chi mette in
  coda da una scheda campagna/gruppo arriva su `/operazioni` col punto di
  partenza in `?torna=`; in cima «← Torna dove eri», e il parametro
  **sopravvive ad approva, annulla e ritira** — senza quel passaggio il
  bottone spariva proprio dopo il click che lo rendeva utile.
- **Dalla parola cercata si entra nel gruppo con un click** (`bef2931e`):
  la colonna «Gruppo» dei termini è un link alla scheda del gruppo, preso
  dalla query dei gruppi che la tabella faceva già (id accanto al nome).
- **Si approva in blocco, e «← Indietro» c'è su ogni pagina** (`449e6f93`):
  in coda si spuntano le operazioni (o «Tutte / nessuna») e si approvano in
  un colpo. ⚠️ **Le tre reti restano**: si approva solo ciò che è GIÀ in
  coda, solo le righe spuntate, e lo script esegue una per una riferendo
  l'esito di ognuna — sparisce il click ripetuto quindici volte, non il
  controllo. **Gli stati si rileggono prima di scrivere**: fra il
  caricamento della pagina e il click una può essere stata annullata, e
  riapprovarla la resusciterebbe senza che nessuno l'abbia chiesto.
  «← Indietro» sale nella **Sidebar** (`components/TornaIndietro.tsx`),
  quindi vale ovunque; su Operazioni resta anche «torna dove eri» perché il
  redirect dell'approvazione azzera la cronologia utile.
- **Le attività in coda su Google si vedono dalla scheda campagna**
  (`1c48a71b`, `components/CodaCampagna.tsx`): un blocco in cima con le sole
  operazioni **vive** (da approvare o approvate), quante ne mancano, gli
  avvisi del guardrail sulla riga e «Approva (N)» che porta in coda sapendo
  da dove si veniva. Prima stavano solo mescolate allo storico «Ultime
  modifiche» in fondo, insieme a vecchie e annullate.
- **Il recap degli annunci in cima, i testi in fondo** (`0775ca10`,
  `components/RecapAnnunci.tsx`): per ogni annuncio se è in asta, dove
  manda, spesa, clic, CTR, conversioni e resa — si vede subito quale
  funziona senza scorrere quindici titoli per colonna. Nessuna query in più:
  lavora sulle righe già caricate dalla scheda; i testi completi restano in
  fondo col link che ci porta.
- ⭐ **Cliccando un annuncio si aprono le sue finestre** (`caa38322`): come
  per le keyword. Serviva la storia giorno per giorno anche per gli annunci:
  tabella **`MetricaAnnuncio`** (CREATE mirato con
  `scripts/crea-tabella-metriche-annuncio.mjs`, già eseguito in
  produzione), route `POST /api/v1/ingest/annuncio-giorni` senza query per
  riga, `lib/finestre-annuncio.ts`, e la **lettura dentro il lavoro
  `keyword-giorni` che già esiste**: stesso lavoro, un solo reincollo invece
  di un altro script da schedulare. Il pannello è lo stesso componente delle
  keyword, parametrizzato: quando la storia manca lo DICE.
  ⚠️ **Al 17/08 nessun account ha ancora consegnato `annuncio-giorni`**
  (`MetricaAnnuncio` = 0 righe): serve il reincollo delle copie del 15/08.

  ⚠️⚠️ **«Non è mai arrivato» è una SPIA di script vecchio, non una prova**
  (precisato il 17/08). L'assenza di consegne è compatibile con **tre** cause
  che dal database sono indistinguibili: (1) lo script nell'account è vecchio
  e quel codice non ce l'ha; (2) è nuovo ma la query è stata **rifiutata** —
  `mandaAnnunciGiorni` sta in un `try` che al `catch` fa `return`, quindi
  scrive solo nel log dentro Google Ads; (3) è nuovo ma ha trovato **zero
  righe** — `inviaABlocchi` esce con `if (righe.length === 0) return`
  **senza fare la chiamata HTTP**, quindi non nasce nessuna `RicezioneDati`.

  **Il controllo che li separa**: il `RIEPILOGO` dello script torna all'app
  **solo per le richieste su domanda** (`POST /api/v1/aggiornamenti/{id}/esito`),
  mai per i giri schedulati. Quindi si mette in coda un «Rifai tutto»
  dall'app e si preme **Esegui** in Google Ads: l'esito che torna contiene la
  stringa `annuncio-giorni: N/M righe` **se e solo se** quel codice è
  nell'account, anche con N = 0. Riga presente = versione nuova; riga assente
  = versione vecchia. È l'unico modo di distinguere «non ce l'ha» da «ce l'ha
  ma non ha trovato niente» senza aprire il log di Google Ads.

  ⚠️ E la regola ovvia che è facile dimenticare: **un giro precedente al
  reincollo non dice niente su cosa c'è nell'account adesso.** Dopo aver
  reincollato, l'unica prova è un giro nuovo.

### Diciotto commit dell'11/08/2026: annunci per colonna, keyword sparite, il ReferenceError, «Come sta andando»

Sessione lunga sulla **scheda gruppo** e sui dati degli annunci. Le cose che
contano, nell'ordine in cui sono arrivate:

- **Ogni annuncio dice il suo stato e dove manda** (`3b17bdf4`): le voci
  dell'elenco annunci portano lo stato attaccato (`id:ENABLED`), la testata
  mostra attivo/in pausa (attivi per primi) con «stato non ancora letto»
  finché lo script nuovo non gira; le destinazioni portano gli id degli
  annunci che le usano, sotto ogni colonna la landing vera cliccabile.
  Parsing tollerante: le voci vecchie (solo id) restano leggibili. E
  **l'ancora `#keywords` scatta anche sulle pagine lente**
  (`components/AncoraggioHash.tsx`): il browser saltava PRIMA che la sezione
  esistesse nel DOM e si restava in cima — riprova a pagina montata.
- **Le colonne annuncio sono quelle del gruppo** (`59819d9a` + `e88eda31`):
  i testi sono CONDIVISI fra gruppi, quindi le loro voci citavano anche
  annunci di altri gruppi (4 «attivi» contro 1 Eligible su Google). Prima
  recinto per INCLUSIONE (solo gli annunci con URL propria: su Torte per
  Oggi 2 su 6, e l'unico attivo restava fuori), poi per **ESCLUSIONE**: le
  destinazioni degli ALTRI gruppi dicono chi è di casa altrove, si tolgono
  quelli e restano gli annunci del gruppo. Misurato: 6 colonne con 1
  attivo, come Google Ads. Un annuncio assegnato qui dalle nostre
  destinazioni non si toglie mai. E sulle parole cercate un bottone
  «Aggiungi»: la ricerca diventa keyword ESATTA del gruppo, dalla coda.
- **Marcare defunte TUTTE le keyword non nasconde più la via d'uscita**
  (`1b75913f`): con 79 defunte su 79 la sezione spariva, e con lei la
  pillola «Defunte». Ora compare se ci sono keyword, defunte comprese, e a
  zero vive un avviso spiega come tornare indietro.
- ⚠️ **Il cambio di stato in blocco agisce sulle righe guardate, non su
  tutto l'archivio** (`0ce0e461`): il cambio singolo vale per parola su
  tutte le campagne (lo stato è un giudizio sulla parola), ma in blocco
  quella regola era una falciata invisibile — «defunta» sulle sole in pausa
  di un gruppo ha marcato **168 righe, di cui 53 ATTIVE su Google**, sparse
  su nove campagne. Ora il form dichiara campagna e gruppo e l'update si
  limita a quelle; il registro lo scrive nel titolo. Le 53 rimesse attive.
- ⭐ **In Postgres `ORDER BY spesa DESC` mette i NULL PRIMI** (`75a751f7`):
  ogni `take` pescava le righe SENZA numeri e le keyword che spendono non
  entravano mai — sulla scheda campagna 60 righe tutte a trattino, e le
  proposte AI ragionavano sulle parole senza dati. Corretto con
  `nulls: "last"` in **tutti gli 8 punti**. Stesso commit: filtro annunci
  Tutti / Solo attivi (che non nasconde mai tutto: se gli stati non sono
  arrivati mostra tutti e lo dice), e **«Crea con AI»** sugli annunci
  (`components/CreaAnnuncioAi.tsx` + `lib/azioni-annuncio.ts`): 15 titoli e
  4 descrizioni scritti su keyword, ricerche che convertono e testi in
  asta, coi limiti di Google verificati lato nostro. **Propone e basta**:
  creare un annuncio non è fra le operazioni dello script, i testi si
  copiano. Su `/campagne`: selettore di periodo (le card seguono la scelta)
  e pillole di ordinamento che applicano subito.
- ⭐ **Le keyword sparite da Google lo dicono** (`14efa577` + `acc4460b`):
  una keyword rimossa su Google restava «attiva» nell'app per sempre —
  misurato **881 righe su Flowers e 304 su Cake**, comprese parole su
  concorrenti. Due strade: la consegna di `stati-keyword` **dichiara il
  lavoro** (l'app sa qual è l'ultimo censimento completo dell'account, e una
  riga non confermata si legge «non più su Google»); e finché lo script
  nuovo non gira, la **deduzione**: il giro completo riscrive ogni notte
  TUTTE le keyword vive, quindi una ferma molto più indietro non c'è più —
  ripiego sull'ultima scrittura dell'account con margine **48 ore, largo
  apposta** (meglio tacere su qualche riga morta che accusarne una viva).
  Sul gruppo English di Flowers 242 keyword (gotham flowers, eden flowers…)
  ora dicono «non più su Google», e la pillola del filtro le isola per
  marcarle defunte in blocco. I numeri restano: sono la loro storia. Stesso
  commit: **KPI per annuncio** (spesa, clic, conversioni, incasso, resa) da
  righe nuove `tipo: "annuncio"` lette da `ad_group_ad`, e via il ripiego
  che mostrava la destinazione del GRUPPO sul singolo annuncio (dava link
  sbagliati: festa della mamma su un annuncio di consegna in giornata) — o
  è la URL di quell'annuncio o «non ancora letta» (`e74eb7b2`: in testa le
  pagine dove manda il gruppo, dichiarando che quale usi ogni annuncio
  l'app non lo sa ancora).
- **Keyword nuove a mano** (`950a164d`, `components/NuovaKeyword.tsx`):
  «Aggiungi keyword» sulla scheda gruppo, una per riga, esatta di default,
  dalla coda. E su `/keywords` **senza tema scelto la pagina nascondeva
  TUTTO**: chi cercava «porto cervo» leggeva i totali in cima e sotto il
  vuoto — i temi sono un raggruppamento, non un cancello.
- ⭐ **L'account comanda sul brand dedotto** (`c04b71ad`): segnalato
  dall'utente («Cake aveva una campagna attiva di retargeting»). Aveva
  ragione: «Retargeting - Microacquisti» gira sul conto Cake, 143 € spesi e
  149 incassati in 30 giorni, accesa su Meta — ma l'app la dava a FLOWERS
  perché il brand era dedotto dal nome. Ora l'import corregge il brand
  quando l'account lo smentisce (solo `brandManuale` vince sul fatto). E la
  colonna Stato della scheda brand mostrava solo il giudizio dell'app
  («In pausa» mentre su Meta erogava): quando i due non concordano si
  vedono entrambi, comanda la piattaforma.
- ⭐⭐ **Il ReferenceError che uccideva il giro copy** (`e57a7a88`):
  `leggiDestinazioni` usava `conto` senza riceverlo fra i parametri → il
  lavoro copy moriva con «ReferenceError: conto is not defined» e su Flowers
  non arrivavano più annunci, destinazioni né KPI. Trovato nel log di
  Google, **il posto sbagliato dove trovarlo** — quindi ora c'è
  **`scripts/prova-script-google.mjs`**: esegue tutti e nove i lavori con
  `AdsApp` finto e prende gli errori di codice prima del reincollo.
  ⚠️ **La prima versione della prova diceva «tutto ok» sullo stesso bug**:
  le query finte restituivano ZERO righe, il codice non entrava nei cicli e
  non toccava mai le variabili di dentro. Ora ogni query rende UNA riga
  completa — verificato reintroducendo il bug: la prova lo segnala. **Da
  lanciare prima di ogni rigenerazione delle copie.**
- ⭐ **La destinazione è dell'ANNUNCIO, una riga per annuncio**
  (`fbe76873`, segnalato dall'utente — la radice del pasticcio): su Google
  la final URL è una proprietà dell'annuncio, non del gruppo.
  `leggiDestinazioni` accorpava per (campagna, gruppo, url), quindi due
  annunci verso la stessa pagina finivano su una riga sola e il legame col
  singolo annuncio si perdeva — da lì le landing sbagliate, poi il ripiego
  «del gruppo», poi «non ancora letta». Ora **una riga per annuncio**,
  `idEsterno = account:gruppo:idAnnuncio`, URL multiple dichiarate nelle
  note; l'app legge il legame dall'id (e l'elenco per le righe vecchie).
  Verificato il 17/08: **1.056 destinazioni su 1.056 con l'id a tre parti**.
- **«Come sta andando» a finestre** (`779b26be` → `2f0f47cb`,
  `components/PerformancePeriodi.tsx` + `OggiCampagna.tsx`): sotto «quanto
  stiamo spendendo oggi» — parziale per costruzione — le finestre su cui si
  decide: **7 giorni, mese corrente, 30 giorni, trimestre, anno**, tutte
  insieme in tabella con la colonna **«al giorno»**, l'unica confrontabile
  fra periodi di lunghezza diversa. È una lente a parte (`?perf=`), non
  tocca il periodo condiviso; una lettura sola per tutte e cinque,
  ritagliata in memoria. Lo stesso blocco sta **anche sulla scheda gruppo**,
  in cima sopra le due colonne (è la prima domanda che ci si fa). Nel
  riquadro «oggi» il budget non si ripete più: al suo posto il **passo
  rispetto ai 7 giorni prima, rapportato alle ore già passate** — a
  mezzogiorno una campagna in linea ha speso metà della sua media e dire
  «−50%» sarebbe un falso allarme quotidiano. Budget e «quanto ne usa» in
  una tessera sola («80,00 EUR · 40% usato»); nella card Ricerche le
  convertenti vengono **prima** e ci sono sempre (prima entravano solo le
  prime 24 per comparse, e una ricerca da 1 conversione e 138 € restava
  fuori). E il **CTR di ogni annuncio** sulla riga dei numeri: fra due
  annunci dello stesso gruppo è il primo numero che dice quale TESTO
  funziona — la spesa dipende dall'asta, il CTR dal testo.
- ⭐ **I titoli degli annunci mancavano per un taglio in ordine ALFABETICO**
  (`90a5673d`): la query del gruppo prendeva 300 righe con `orderBy tipo
  asc`, e «keyword» viene prima di «titolo» — su un gruppo con 1.038
  keyword i titoli non entravano MAI, e il blocco annunci mostrava solo le
  descrizioni. Ora **due query con tetti loro** (keyword e testi), non un
  tetto solo più alto: alzarlo sarebbe stata la stessa trappola più in là.
  Verificato: da 17 testi a 100.

### Notte del 10/08/2026: lo stato a più keyword, «Tutte / nessuna», le chip con l'incasso

Quattro commit dopo l'ultimo aggiornamento di questo file (23:10):

- **Il selettore di stato delle keyword sulla scheda gruppo non aveva mai
  salvato** (`95fac2e3`): il form mandava l'ID della riga, l'azione si
  aspettava il TESTO (come da `/keywords`), non trovandolo usciva in
  silenzio — scoperto provando «defunta». Ora con l'id si risale al testo e
  si applica per parola su tutte le campagne; al salvataggio **redirect
  esplicito** alla scheda, non solo revalidate (la trappola del `<select>`
  controllato, pagata per la terza volta).
- **Le chip delle Ricerche portano anche il valore delle conversioni**
  (`88b1253b`): «→ 95 EUR» dopo spesa, clic e conversioni.
- **La riga delle keyword si stringe, «Tutte / nessuna», le finestre si
  dichiarano** (`12739239`): le quattro azioni della tabella keyword erano
  IMPILATE (righe da 200 px) e due bottoni usavano una classe fantasma che
  nel CSS non esiste (nero pieno) — ora una riga flex con etichette corte
  (Pausa, Escludi, Porta, Estendi AI) e title estesi: **le azioni restano
  tutte, si stringe la cornice** (`components/SelezionaTutte.tsx` su ogni
  barra multipla: keyword e parole cercate, gruppo, scheda campagna,
  `/termini`). Nelle parole cercate del gruppo le righe con finestra diversa
  da quella fresca la **dichiarano sulla riga**: «torte milano 34,19» era la
  somma di UN ANNO accanto a righe di 30 giorni.
- **Lo stato a più keyword in un colpo** (`5b05f1f5`): caselle + menù di
  stato + «Applica alle selezionate» — per parola, su tutte le campagne,
  come il cambio singolo; il primo valore del menù è vuoto apposta (uno
  stato su 48 parole dev'essere una scelta). Le pillole dei filtri
  atterrano su `#keywords`, così non si riparte da cima. ⚠️ È questa la
  «falciata» corretta l'11/08 (`0ce0e461`): in blocco agisce **solo sulle
  righe di campagna+gruppo guardate**.

### Il primo giro vero (Cake, 10/08 pomeriggio): due trappole di Google trovate e chiuse

L'utente ha reincollato e lanciato `tutto` su Cake: giro completo in ~2
minuti, **39 località su 14 campagne**, **346 agganci titolo→annuncio
staccati** dalla pulizia. E due cose che solo il giro vero poteva dire:

> ⚠️ **`campaign_criterion.display_name` arriva VUOTO dagli Scripts**: tutte
> le località cadevano sul ripiego «geo 2380». Il nome vero (Italy, Milan…)
> si prende da `geo_target_constant.name`, nella stessa query che già
> arricchiva il livello. Le righe già scritte si correggono da sole al giro
> dopo (l'ingest aggiorna il nome sulla stessa chiave).
>
> ⚠️ **`ad_group_ad_asset_view` tiene anche i link TOLTI dall'annuncio**
> (`enabled = false`): la query di struttura senza filtro li prendeva tutti,
> e un RSA arrivava con **44 titoli «attuali»** su un massimo di 15 — righe
> fresche di consegna, non archivio sporco. Ora filtra `enabled = TRUE`; se
> il filtro non piacesse, scatta il ripiego e il giro non muore.

Dopo le due correzioni le copie in Downloads sono la **versione definitiva**:
su Cake va reincollato il solo «giornaliero» (era stato incollato prima delle
correzioni); «esegui» non usa quelle query e va bene com'è. «Estendi con AI»
è anche **sulla singola riga** dei termini (bottone accanto a «Porta
altrove», seme = quella parola, stesso dialogo).

### ⭐ Le località di targeting si importano, e la scheda le mostra (10/08/2026)

Richiesto dall'utente («lo script per importare le località»). Il modello
`LocalitaCampagna` esisteva nello schema dal 09/08 ma **non era mai stato
cablato**: nessuna tabella sul database, nessun ingest, nessuno script. Ora la
catena è completa:

- **Script** (`leggiLocalita()` dentro `mandaAnagrafica`): legge
  `campaign_criterion` di tipo LOCATION/PROXIMITY — il `criterion_id` di un
  criterio location **è** l'id del geo target constant — col `display_name`
  come nome e il `bid_modifier` come modificatore d'offerta. Il **livello**
  (City/Region/Country) si arricchisce da `geo_target_constant` in un try a
  parte: se quella query fallisce, i nomi bastano.
  ⚠️ **Campo assente ≠ elenco vuoto**: se la lettura fallisce l'anagrafica
  parte **senza** il campo («non lo so»); un elenco vuoto invece dice «questa
  campagna non ha criteri di località» e svuota lo specchio.
- **Ingest** (`salvaAnagrafica` → `sincronizzaLocalita`): specchio con
  aggiunta, aggiornamento **e rimozione** — qui togliere è giusto perché la
  consegna è **completa per campagna**, al contrario dei copy dove è
  parziale. Una lettura sola per lotto, scritture solo dove cambia.
- **Tabella** creata con `scripts/crea-tabella-localita.mjs` (CREATE mirato,
  mai `db push`; ha tolto anche due colonne TEXT aggiunte per sbaglio nella
  stessa sessione — la forma giusta era la tabella).
- **Scheda campagna**, blocco Dettagli: «Località (targeting Google)» con
  mirate, modificatori ed escluse; finché non arriva niente dice **«non
  ancora lette»** — mai lette e «nessuna località» sono due cose diverse.

Il targeting vero smette di essere una deduzione dal nome (`cittaDaTesto`
resta per i suggerimenti, ma il fatto ora ha la sua tabella). ⚠️ Si popola
al primo giro dello **script reincollato**.

### Località in testata, «Estendi con AI» per riga, e il primo giro vero (10/08/2026, pomeriggio)

Tre aggiunte a valle del primo giro reale su Cake:

- **Le località si leggono in testata** della scheda campagna, accanto ad
  account e canale: mirate per esteso, escluse per nome se poche o contate
  se tante («Milan — esclude 24 località»), elenco completo nel title e nei
  Dettagli. L'assenza si dichiara, come per l'account.
- **«Estendi con AI» anche sulla riga** della parola cercata
  (`data-estendi-seme`): stesso dialogo della barra, col seme di quella
  parola, senza spuntarla prima.
- **Tre livelli di estensione** (chiesti dall'utente), che sono ISTRUZIONI
  diverse per l'AI, non un numero: **prossima** (stessa domanda, altro
  luogo: torte milano → torte roma), **media** (aggiunge un concetto →
  torta personalizzata milano), **alta** (ricerche affini → cake design
  torino). Sulle proposte: ricerca con «prendi le trovate»/«togli tutte»,
  col conteggio delle selezionate sempre in vista (le spuntate nascoste
  dal filtro partono comunque). Gruppo e corrispondenza di default sono
  **quelli della parola che si estende** (viaggiano col bottone di riga).
- **La scheda gruppo adotta le stesse logiche** (sera): Porta altrove ed
  Estendi con AI in barra e per riga su keyword E parole cercate del
  gruppo, con selezione multipla sui termini; il gruppo corrente e la
  corrispondenza della parola fanno da default (`data-estendi-gruppo`,
  `data-estendi-form`). I controlli sugli annunci («Titoli e descrizioni
  usati qui», colonne per annuncio) c'erano già.
- **«Su Google tutte in pausa» NON era un bug** (verificato sui dati):
  era la PRIMA lettura vera degli stati — con gli id rotti fino a ieri,
  `stati-keyword` non aggiornava le righe giuste. Su `[Cakedesign] | Sales
  | ITA` Google dice davvero 104 keyword in pausa su 147; la spesa in
  tabella è storica (fino al 27/07), non di oggi.
- **Stato «Defunta» per le keyword** (notte, chiesto dall'utente): come per
  campagne e gruppi — sparisce da /keywords, scheda campagna e scheda
  gruppo (pillola «Defunte (N)» solo se ce ne sono); si ritrova dal filtro
  di stato di /keywords. È un giudizio: l'import non lo tocca, e marcare
  defunta agisce su tutte le campagne dove la parola sta.
- **Card «Ricerche» sulla destra del gruppo** (notte): come il widget
  Searches di Google (chips per comparse) ma coi numeri veri — spesa, clic,
  conversioni; verde converte, rosso spende a vuoto. ⚠️ KPI reali per
  costruzione: entrano SOLO le righe dell'ultima finestra della diagnosi,
  con la finestra nel titolo. Verificato: combacia col report Search terms
  di Google a parità di finestra (103 termini freschi 11/07→10/08 su Cake).
- ⭐ **LA STORIA GIORNO PER GIORNO DELLE KEYWORD** (notte, chiesta
  dall'utente: «la spesa non si aggiorna con il cambio di date»). Nuovo
  lavoro **`keyword-giorni`** (dentro `tutto`, finestra `GIORNI_INDIETRO`),
  tabella **`MetricaKeyword`** (una riga per criterio per giorno con
  impressioni, unique su idEsterno+data), route
  `/api/v1/ingest/keyword-giorni` (createMany + update dove cambia, mai una
  query per riga). Sulla scheda gruppo, quando la storia copre il periodo:
  spesa/incasso/resa/giudizi/filtri/ordinamento **seguono il periodo**, e
  la nota dichiara da quando parte la raccolta; coi periodi non coperti
  resta la fotografia, **datata riga per riga** («numeri al 30/07»).
  ⚠️ Per il passato: un giro una tantum con `GIORNI_INDIETRO = 90` (o
  quanto serve) usando la copia `keyword-giorni.js` — ora le copie in
  Downloads sono **10**. ⚠️ Da portare anche sulla pagina /keywords e sulla
  scheda campagna quando servirà: per ora la legge la scheda gruppo.
- ⭐⭐ **UNA RIGA PER CRITERIO: la stessa parola in due gruppi non si
  sovrascrive più** (sera). Caso vero su `Torte per Oggi // ITA`: 53
  keyword «tutte in pausa» nell'app mentre Google mostrava le attive che
  spendono (`"torte a domicilio"`: 706 clic, 389 €). La stessa parola vive
  in più gruppi con stati diversi, ma l'archivio la collassava su una riga
  per (campagna, testo): **l'ultima copia letta sovrascriveva gruppo e
  stato**. Due metà: `leggiKeywords` accorpa per campagna+**gruppo**+testo
  +match (una riga per criterio, come già manda `stati-keyword`), e il
  ripiego dell'ingest per (tipo, testo, campagna) aggancia SOLO le righe
  legacy — se la riga trovata ha un id completo e **diverso**, è un altro
  criterio e nasce la sua riga. Converge da solo al primo giro. ⚠️ Le
  statistiche del gruppo sono scese **nella colonna destra** (deciso
  dall'utente): la sinistra parte dal lavoro operativo. ⚠️ E le card di
  `/campagne` mostrano il targeting (⌖) quando è stato letto.
- ⚠️ **Un `<form>` di mezzo rompeva lo scroll del dialogo**:
  `.modale-elenco` scrolla solo da figlio DIRETTO del flex `.modale-corpo`
  — con 20 proposte il piede col «Metti in coda» finiva fuori schermo,
  irraggiungibile. Il form ora È il corpo, come in PortaKeyword.
- **Dal giro vero di Cake, tre difetti trovati e chiusi in giornata**:
  (1) il `display_name` dei criteri località arriva **vuoto** dagli Scripts
  → i nomi si prendono da `geo_target_constant.name` (prima uscivano
  «geo 2380»); (2) la vista degli asset tiene anche i **link tolti**
  (`enabled = false`) → un RSA arrivava con 44 titoli «attuali»: filtro
  `enabled = TRUE` nel WHERE **e** scarto in JS (vale anche per la query di
  ripiego); (3) due giri ravvicinati (<2h) non si puliscono a vicenda — è
  la finestra anti-blocchi, voluta: i residui si staccano al giro dopo.

### «Estendi con AI» sulle parole cercate della campagna (10/08/2026)

Richiesto dall'utente. Nella barra della tabella termini della scheda
campagna: si scrive un'**indicazione** («varianti con consegna a domicilio…»),
le parole spuntate in tabella fanno da **seme**, e l'AI propone una sequenza
di parole correlate. Solo quelle **lasciate spuntate** vanno in coda come
`nuova_keyword`.

> ⚠️ **Tre cancelli, nessuno salta gli altri**: l'AI propone
> (`lib/azioni-estendi.ts`, schema JSON vincolante, mai riproponendo ciò che
> la campagna ha già — filtro rifatto lato server perché uno schema
> rispettato non è un contenuto sensato), la persona sceglie nel dialogo
> (`components/EstendiConAi.tsx`: corrispondenza **esatta di default**,
> gruppo di annunci scelto), la coda approva in Operazioni.

L'accodamento riusa `applicaKeywordAdAltreCampagne`, che ora accetta un
**`motivo` dichiarato**: le parole AI non sono «portate da un'altra
campagna», e chi approva deve leggere da dove nascono davvero. Il dialogo
vive fuori dal form della barra (i form non si annidano) col bottone-apri
delegato `data-estendi-ai`, lo stesso disegno di PortaKeyword.

**Provata a secco sulla catena vera** (chiave dalle Impostazioni,
`claude-opus-5`, campagna Torte MILANO): 18 parole nuove, zero doppioni
sulle 117 esistenti, lingua giusta. La prova ha trovato due difetti, tolti
lo stesso giorno:

> ⚠️ **L'API di Claude RIFIUTA `maxItems` negli schemi degli structured
> outputs** (400 «For 'array' type, property 'maxItems' is not supported») —
> e anche i vincoli di lunghezza. Vale per OGNI chiamata con `schema` via
> `chiediAllAi`: schema minimo, i limiti si fanno nel codice dopo il parse.
> ⚠️ **Una server action che chiama il modello ha bisogno di `maxDuration`
> sulla pagina che la invoca** (qui 60 su `campagne/[id]`): senza, la
> chiamata muore a metà **solo in produzione**, dove il default di Vercel è
> più corto del tempo di risposta del modello.

### ⭐ I titoli tolti da un annuncio si staccano, invece di accumularsi (10/08/2026)

Chiuso il punto APERTO del 09/08 (annunci con 21/19/17 titoli su un massimo
di 15). Il difetto non era il merge dell'elenco — l'ingest **già sostituiva**
`annunci` sulle righe che arrivano — ma le **righe che non arrivano più**: un
titolo tolto da un RSA restava in archivio col vecchio aggancio, per sempre.

Due gambe, e la prima agisce da sola al prossimo giro:

1. **Ingest** (`/api/v1/ingest/copy`): per ogni annuncio citato nella
   consegna, l'aggancio si stacca dalle righe che la consegna non ha
   confermato. Si guarda **`metricheAl`** («l'ultima volta che questa riga è
   arrivata»), **non** `aggiornataIl`: lo stacco stesso tocca `aggiornataIl`,
   e usarla come spia farebbe saltare la pulizia dei blocchi successivi.
   Margine di 2 ore per i blocchi della stessa corsa (possono spezzare un
   annuncio a metà). ⚠️ **Si stacca l'aggancio, non la riga**: la storia del
   testo (spesa, rendimento, stato) resta. ⚠️ Un annuncio **mai citato** nella
   consegna non dice niente: le sue righe non si toccano.
2. **Script** (`leggiAnnunci()`): la query legge la **struttura attuale**
   (niente `segments.date`, `status IN ENABLED/PAUSED`) con **ripiego sulla
   finestra `GIORNI_COPY`** se Google la rifiuta. Col filtro data un titolo
   senza traffico non arrivava, e la pulizia dell'ingest l'avrebbe staccato
   per errore; senza filtro, «non arriva» = «non è più nell'annuncio», e la
   sostituzione diventa esatta. Patch fatta con node in ASCII puro, byte
   non-ASCII invariati (5.842); copie rigenerate in Downloads.

L'esito della consegna ora dice anche «N testi staccati da annunci che non li
usano più» (in `/registro` e nella risposta dell'API).

### Le approvate ferme si dichiarano, e la riga del 07/08 è sbloccata (10/08/2026)

Chiusi i punti 4a e 4b del «Da riprendere». In `/operazioni`:

- Un'operazione **approvata** che l'account ha scavalcato (consegne nei
  giorni successivi all'approvazione, con margine di 1 ora) ora lo dice
  sulla riga: quanti giri l'hanno lasciata indietro e dove sta il motivo
  (log dello script, sezione ESEGUI). Prima era indistinguibile da una che
  aspetta il primo giro.
- Un'operazione **senza account** (canale Google) dichiara che nessuno
  script la riconosce come sua — nata prima dell'8/08, o campagna col brand
  non deciso — e che conviene rifarla.

E l'unica riga viva in quello stato — `attiva_keyword` su «flowers delivery
milan», approvata il 07/08 — ha ricevuto **`account = 248-656-1148`** scritto
a mano sul database, col motivo annotato sull'operazione. Con lo script
attuale il «non trovata» diventa un errore visibile; con `tutto.js`
reincollato, la ricerca campagna+gruppo la trova e la esegue.

### Selezione multipla anche sulle parole cercate globali (10/08/2026)

Chiuso il punto 2 del «Da riprendere» (la scheda campagna l'aveva già dal
09/08): su **`/termini`** si spuntano più parole e si agisce su tutte insieme
— «Escludi le selezionate» e «Porta altrove le selezionate».

> ⚠️ **Qui le righe sono di campagne DIVERSE**, ed è il motivo per cui le
> caselle portano l'**id del termine**, non il testo: ogni parola diventa una
> negativa **sulla campagna in cui è stata cercata**. Il testo per il dialogo
> «Porta altrove» viaggia in `data-testo` (`PortaSelezionate` legge quello,
> quando c'è). Il giudizio segue («da escludere»), come nell'Escludi di riga.

Il cuore dell'esclusione — anti-doppioni, avviso incidente, coda, registro —
sta ora in **`accodaNegativeSuCampagna`** (`lib/azioni.ts`), condiviso fra la
barra della scheda e la pagina globale: due strade che accodassero in modo
diverso darebbero due code diverse. L'elenco campagne del dialogo (vive, con
lingua/città/gruppi) sta in **`lib/campagne-dialogo.ts`**, la stessa pipeline
della pagina Keywords.

### Col filtro Meta il lancio dice la verità (10/08/2026)

Chiuso il punto 3 del «Da riprendere». Su `/campagne?canale=meta_ads` compare
**«Lancia su Meta Ads — non ancora»**, spento, con la nota che spiega: il
modulo di lancio è di Google (keyword e negative, che su Meta non esistono),
**creare campagne non è fra le operazioni del motore Meta** (pausa, riattiva,
budget), e il motore è comunque spento. Una campagna Meta si lancia da Ads
Manager e qui si **censisce**. I bottoni di Google restano tutti: nessuna
azione tolta, solo una promessa falsa in meno.

### ⭐ Il brand di una campagna si corregge, e l'account è un fatto (09/08/2026)

`[Palloncini] - AWARENESS` risultava di Cake con 1.137,67 € attribuiti, e sul
conto Meta di Cake **non esiste**: gliel'aveva agganciata una sync mirata, e
la regola «cross → brand noto» l'aveva promossa al primo account che l'aveva
toccata. Il difetto vero: l'app teneva la **conseguenza** (il brand) e non il
**fatto** (l'account).

- **`Campagna.account`** scritto dall'import (ALTER TABLE mirato,
  `scripts/aggiungi-account-campagna.mjs`), mostrato sulla scheda; finché non
  si sa, la scheda dice «account non ancora letto».
- **`Campagna.brandManuale`**: il brand scelto a mano **blocca ogni import**,
  come `origine: manuale` sul legame Shopify.
- ⚠️ La correzione **non è retroattiva**: il brand sbagliato va corretto a
  mano una volta, poi resta.

### ⭐⭐ La somma dei gruppi non faceva il totale della campagna (09/08/2026)

Segnalato: «la somma non fa 1600 · manca una conversione a birthday». Vero, e
il database non c'entrava: era **come la pagina leggeva**.

Su `[Deluxy] Torte MILANO`, periodo 11/07 → 09/08:

| | pagina (prima) | database | Google |
| --- | --- | --- | --- |
| Torte per Oggi | 504 € · 1201 € | 518,89 € · 1201,37 € | 518,91 € · 1201,37 € |
| Crea la tua torta | 136 € · 285 € | 144,73 € · 285,00 € | 144,73 € · 285,00 € |
| **Birthday Cake** | 56,80 € · **59 €** · 0,5 conv | 60,14 € · **123 €** · 1,5 conv | 60,13 € · **123,00 €** |
| **somma** | 696,80 € · **1545 €** | 723,76 € · **1609,37 €** | 723,77 € · 1609,37 € |

`gruppiConNumeri` prendeva un **numero di giorni**, non il periodo: `daGiorni(30)`
parte dalla mezzanotte di (oggi − 29), cioè dal **12/07** — il primo giorno del
periodo non entrava mai — e non aveva **nessun limite superiore**, quindi un
periodo che finisce ieri si tirava dentro anche oggi.

> ⚠️ **Il difetto peggiore non era lo scarto: era che i due numeri stavano nella
> stessa schermata.** In cima «1609 €», sotto tre righe che ne fanno 1545, e
> nessuna delle due diceva di guardare un periodo diverso dall'altra. Su
> Birthday Cake lo scarto era del 108% — 59 € contro 123 — e nasceva da **una
> sola conversione** caduta nel giorno perduto.

Ora la scheda campagna passa `periodo: periodo.corrente` e i gruppi sommano
esatti: **1.609 €**, verificato in pagina. `giorni` resta per gli altri
chiamanti, che un periodo non ce l'hanno.

### ~~APERTO~~ CHIUSO il 10/08: i titoli per annuncio erano più di quanti Google ne ammetta

> ✅ **Corretto il 10/08/2026** — vedi «I titoli tolti da un annuncio si
> staccano» in cima al FATTO. Il testo sotto resta come diagnosi originale.

Segnalato il 09/08. Sul gruppo
`Flowers Delivery` di `[Deluxy] - Fiori Milano ENG`:

| annuncio | titoli in archivio |
| --- | --- |
| `671692470710` | **21** |
| `798230342872` | **19** |
| `687975359022` | **17** |
| `817075006943` | 15 ✔ |
| `816989412607` | 15 ✔ |

Google ne ammette **15 per annuncio**: 21 è impossibile.

La causa più probabile è che l'app **accumula e non toglie mai**. Lo script
manda i testi che vede adesso; l'ingest aggiorna le righe esistenti e ne crea
di nuove, ma **non rimuove** l'aggancio di un titolo che da quell'annuncio è
stato tolto. Un RSA modificato tre volte lascia in archivio l'unione storica di
tutti i titoli che ci sono passati, e la colonna «Annuncio 1» li mostra tutti
come se fossero insieme in asta oggi.

**Come si corregge**: l'elenco `annunci` di un testo deve essere **sostituito**,
non arricchito, e i testi non più presenti in un annuncio vanno staccati da
quell'annuncio. Serve che l'ingest sappia l'insieme completo dei testi per
annuncio in quella consegna — oggi arriva accorpato per campagna, non per
annuncio. ⚠️ Da fare con attenzione: staccare troppo cancellerebbe la storia
dei testi, che serve a leggere il rendimento.

### ⭐ Le lingue: al plurale sulla campagna, al singolare sul gruppo (09/08/2026)

Il selettore «clienti» costringeva a dichiarare **una** lingua, e una campagna
che serve due pubblici — `[Deluxy] Gifts Milano` con dentro «Regali in
Italiano» e «Regali Inglese» — era obbligata a dichiarare il falso.

**La divisione è questa, ed è quella che rende la domanda rispondibile:**

| livello | quante lingue | a cosa serve |
| --- | --- | --- |
| **campagna** | **più d'una** (`ita,eng`) | dichiara *a chi vende nel suo insieme*; taglia il venduto di contesto per paese |
| **gruppo** | **una sola** | è la lingua **vera**, quella in cui gli annunci sono scritti |

> ⚠️ **Con due lingue il filtro sul paese smette di tagliare, e va detto.**
> «italiano + inglese» è IT ∪ non-IT, cioè **tutti**. È la cosa giusta — una
> campagna che serve entrambi i pubblici non ha un paese da escludere — ma se
> non lo si scrive, un giorno si legge un ROS diverso e non si capisce perché.
> Per questo `filtroPaese` restituisce `copreTutto` e la descrizione lo dice a
> parole: «insieme coprono tutti i paesi, quindi NON si taglia niente».

- `lingueDa()` in `vendite-campagna.ts` legge la lista; `filtroPaese` fa
  l'**unione** dei filtri invece di sceglierne uno.
- `impostaLinguaCampagna` accetta `fd.getAll("lingua")` e salva ordinato, così
  «eng,ita» e «ita,eng» non risultano due valori diversi.
- Sulla scheda campagna: **caselle**, non tendina. Una tendina costringe a
  sceglierne una sola, cioè a dichiarare il falso.
- `Gruppo.lingua` (colonna nuova, **ALTER TABLE mirato**): vuota = si deduce dal
  nome del gruppo, e se il nome tace, dalla campagna — ma **solo se la campagna
  ne dichiara una sola**. Fra due dichiarate la deduzione tace: indovinare
  sarebbe peggio che non dire niente.
- Il valore dedotto si mostra **dicendo che è dedotto** («Italiano — dedotta»):
  un valore indovinato che si presenta come deciso è peggio di un campo vuoto.

Verificato in pagina: su `[Deluxy] - Fiori Milano ENG` la casella «Inglese» è
spuntata e le altre libere; sul gruppo «Regali in Italiano» il selettore mostra
«Italiano — dedotta».

### ⭐⭐ «In pausa» nell'app non fermava Google — un bottone che annotava (09/08/2026)

Segnalato come domanda: «mettere in pausa sull'app mette in pausa anche su
Google?». No, e la prova era su una campagna viva.

`[Deluxy] Catering Milan B2B`: nell'app **`in_pausa`**, su Google
**`ENABLED`** — cioè ancora accesa e a spendere — e **zero** operazioni
`pausa_campagna` in coda. Il click aveva prodotto un'**Azione**, cioè un
promemoria in stato `todo` che nessuno esegue.

> ⚠️ **E la pausa non restava nemmeno nell'app.** `in_pausa` non è fra gli
> `STATI_CAMPAGNA_NOSTRI` (`defunta`, `in_lancio`, `bozza`), gli unici che
> l'import non tocca: al primo giro successivo Google avrebbe riscritto
> «attiva». Non fermava Google **e** si cancellava da sola.

Ora le pillole fanno due cose diverse, perché sono due cose diverse:

| stato | cosa fa adesso |
| --- | --- |
| `in_pausa` · `attiva` | **mette in coda** `pausa_campagna`/`attiva_campagna` (L2, con gli avvisi del guardrail), approvazione a mano, esegue lo script |
| `bozza` · `in_lancio` · `defunta` | restano scelte **nostre**: si scrivono e basta, l'import non le tocca |
| `conclusa` | resta il promemoria — **eliminare una campagna non è fra le operazioni dello script**, e fingere il contrario sarebbe lo stesso difetto |

> ⚠️ **Lo stato dell'app NON si scrive più per `in_pausa`/`attiva`.** Quello è
> un fatto di Google: scriverlo prima che accada sarebbe di nuovo raccontare
> una cosa per un'altra. Il messaggio di ritorno lo dice esplicitamente —
> «sarà messa in pausa dopo l'approvazione, fino ad allora su Google resta
> ENABLED». Se c'è già un'operazione dello stesso tipo in volo non se ne
> accoda una seconda.

### La matita sul testo di una parola in coda (09/08/2026)

`components/ModificaTestoOperazione.tsx` + `cambiaTestoOperazione`: accanto
alla parola di un'operazione in coda c'è la matita, e il testo si corregge
prima che diventi vera. Nasce dal caso «rome flower delivery service» accodata
su `[Deluxy] - Fiori Milano ENG`.

> ⚠️ **Solo finché è `in_attesa`.** La corrispondenza si ritocca anche su
> un'operazione approvata, il testo no: chi ha approvato ha approvato *quella*
> parola, e cambiargliela sotto vorrebbe dire eseguire una cosa che nessuno ha
> guardato. Per correggerla si ritira prima l'approvazione.

> ⚠️ **Non è `RinominaInline`, è il suo contrario.** Là il nome vale solo
> dentro l'app e su Google l'oggetto continua a chiamarsi come si chiama; qui
> il testo **è** quello che finirà in asta. Due componenti diversi apposta: uno
> solo che dicesse entrambe le cose sarebbe un componente che mente a metà.

La correzione resta scritta nel `motivo` dell'operazione — chi approva domani
deve vedere che la parola non è più quella proposta — e nel registro.

### ⭐ Liste esclusioni: le regole si vedono PRIMA di accenderle (09/08/2026)

Pagina **`/esclusioni`** + `lib/esclusioni.ts`. Tre regole con cui una parola
cercata diventa una negativa, ognuna con l'**anteprima sui dati veri**: quante
ricerche colpirebbe adesso, quanta spesa spegnerebbe e — il numero che conta —
**quanto incasso hanno prodotto**.

> ⚠️ **Deterministico dove è un fatto, AI dove è un giudizio.** Che
> «купить цветы в милане» non sia inglese si legge dall'alfabeto: chiedere un
> parere a un modello su una cosa certa aggiunge costo e incertezza a zero
> informazione. Il giudizio serve per i concorrenti, che sono un'insegna solo
> se sai che esiste.

> ⚠️ **Nessuna regola esclude da sola.** Ogni ricerca colpita diventa
> un'operazione `in_attesa` con `richiestaDa = "regole-ai"`, e in `/operazioni`
> la riga lo **dichiara**: «Proposta dalle regole automatiche, non da una
> persona. Nessuno ha guardato questa ricerca una per una». Le negative nascono
> **esatte**: spengono quella ricerca, non tutte quelle che le somigliano.

**⛔ E l'anteprima ha subito detto di NON accendere la regola sulla lingua.**
Misurato al primo caricamento:

| regola | ricerche | spesa | incasso prodotto |
| --- | --- | --- | --- |
| alfabeto estraneo | 7 | 37,70 € | **0 €** → sicura |
| lingua diversa | **206** | 2.388 € | **13.180 €** e 835 conversioni |
| concorrenti | 0 (elenco vuoto) | — | — |

Le prime della lista sono `fiori a domicilio milano` (463 € → **3.557 €**,
ROS 7,7×), `consegna fiori milano` (227 € → 1.198 €), `consegna fiori a
domicilio milano` (127 € → 1.121 €), tutte su `[Deluxy] - Fiori Milano ENG`.

> ⚠️ **La regola non sbaglia: sbaglia il presupposto.** Quelle ricerche *sono*
> italiane su una campagna che si chiama ENG — ma sono il traffico migliore che
> quella campagna abbia. «ENG» dice a chi parla l'annuncio, non chi lo cerca.
> Accendere la regola avrebbe spento 13.180 € di incasso per risparmiare 2.388 €
> di spesa. È esattamente il motivo per cui l'anteprima viene prima
> dell'interruttore.

La regola **concorrenti nasce spenta**, e resta spegnibile: escludere chi cerca
un concorrente toglie traffico che molti comprano apposta, e quella è una scelta
commerciale, non una regola tecnica.

### La finestra dei numeri viaggia col numero, e le negative si rileggono (08/08/2026)

Due difetti della stessa famiglia — **una cosa che non si può sapere guardando
il dato** — chiusi insieme.

**1. `CopyAnnuncio.metricheGiorni`.** L'app teneva i numeri di keyword e asset
senza dire **su quanti giorni** fossero calcolati: c'era `metricheAl` (quando
sono stati scritti) ma non a cosa si riferivano. E il riquadro sulla scheda
gruppo aveva **«30 giorni» scritto a mano nel codice** — vero finché
`GIORNI_COPY` resta 30, falso al primo caricamento storico.

- Lo script manda `giorniMetriche` insieme ai numeri: `GIORNI_COPY` per keyword
  e testi RSA, **`GIORNI_ASSET` per gli asset** (finestra loro, non quella del
  copy). ⚠️ `stati-keyword` **non** lo manda ed è giusto: non porta numeri, e
  scrivere una finestra senza numeri direbbe che i vecchi si riferiscono a un
  periodo che non è il loro.
- L'ingest lo scrive **solo insieme ai numeri**, stessa regola già in uso.
- Il riquadro legge il dato. Se le righe **non concordano** lo dice — «ce ne
  sono di 30, 365 giorni: i numeri di righe diverse non si possono confrontare
  fra loro» — invece di mostrare un numero solo che sarebbe falso per metà.
- Colonna aggiunta con **ALTER TABLE mirato** (`scripts/aggiungi-metriche-giorni.mjs`),
  non con `prisma db push`: il Postgres è condiviso fra sei app.

Da qui in poi un caricamento storico su qualunque finestra è **legittimo**:
l'app dirà su cosa sta guardando invece di raccontare una cosa per un'altra.

**2. Le negative si rileggono, prima e dopo.**

> ⚠️ **`createNegativeKeyword()` non restituisce NIENTE**: è l'unica scrittura
> dello script che non può dire se è andata. `creaKeyword` usa un builder e
> controlla `isSuccessful()`; qui non c'era niente da controllare, e l'app
> registrava «negativa aggiunta» **per fede**. Se Google la rifiutava
> (doppione, limite, formato) nessuno lo sapeva.

`negativaPresente(campagna, testo)` risponde `uguale` / `altra-corrispondenza` /
`no` / `null` (non leggibile, che **non** è un no) e serve due volte:

- **prima**: se c'è già identica non se ne crea una seconda, e lo si dice;
- **dopo**: si conferma che sia arrivata.

> ⚠️ **Il dubbio si dichiara, non diventa un errore.** Dentro la stessa
> esecuzione i selettori di Google possono ancora vedere lo stato di partenza:
> trasformare quel dubbio in un fallimento marcherebbe come falliti dei lavori
> riusciti — il difetto opposto e altrettanto brutto. L'esito dice
> «confermata rileggendola» oppure «rileggendo non risulta ancora: può essere
> il ritardo di Google o un rifiuto muto, ricontrollare al prossimo giro».

Il confronto guarda sia il testo coi segni (`[esatta]`, `"frase"`) sia quello
nudo, così funziona comunque `getText()` li riporti. Se la parola c'era con
un'**altra** corrispondenza la nuova si crea lo stesso — è una cosa diversa —
ma l'esito avverte che «adesso ce ne sono due, e la più larga comanda».

### ⭐⭐ Il 60% degli id delle keyword era sbagliato, e a rifarlo era un nostro lavoro (08/08/2026)

Non erano dati vecchi ereditati: **`stati-keyword` riscriveva l'id sbagliato a
ogni giro**.

| lavoro | id mandato all'app | quando gira |
| --- | --- | --- |
| `copy` | `account:gruppo:criterio` (giusto) | penultimo in `LAVORI_LETTURA` |
| `stati-keyword` | `String(criterionId)` — **il numero nudo** | **ultimo**, subito dopo |

E l'ingest scrive `idEsterno` senza condizioni. Quindi a ogni `tutto`: `copy`
scriveva l'id buono, e `stati-keyword` **glielo cancellava** trenta secondi
dopo.

Misura al momento della scoperta:

| brand | id nuovo | id vecchio | senza id | totale |
| --- | --- | --- | --- | --- |
| gifts | 1.225 | **3.116** | 282 | 4.623 |
| flowers | 974 | 1.011 | 137 | 2.122 |
| cake | 645 | 681 | 0 | 1.326 |

> ⚠️ **Da qui nasceva tutto il resto.** Con l'id completo `trovaKeyword` prende
> la scorciatoia `withIds` e non sbaglia mai; col numero nudo cade nella ricerca
> per testo — quella che non aveva **mai** funzionato. Cioè: il difetto che
> teneva ferma la coda era un *sintomo*, la causa era qui.

> ⚠️ **Ed è la collisione che la v2 aveva risolto apposta.** Senza l'account nel
> prefisso, tre account che hanno lo stesso numero di criterio si sovrascrivono
> a vicenda nell'archivio.

Corretto: la query di `mandaStatiKeyword` ora chiede anche `ad_group.id` (senza,
l'id completo non si può comporre) e manda lo stesso formato di `copy`.

> ⚠️ **`MAX_STATI_KEYWORD` alzato da 4.000 a 20.000.** Il ciclo si fermava al
> tetto **senza ricordare dove era arrivato**: il giro dopo ripartiva da capo, e
> le keyword oltre la 4.000esima non sarebbero state lette **mai**. Su Gifts
> l'archivio ne ha 4.623, cioè il tetto mordeva davvero. La query è leggera
> (niente metriche, niente segmenti per giorno).

**La ricarica non cancella niente.** L'ingest cerca prima per `idEsterno` (non
lo trova, le righe hanno ancora quello vecchio) e poi ripiega su
`(tipo, testo, campagna)`: trova la riga esistente e le **riscrive l'id giusto**.
Le righe si curano da sole al primo giro, senza `deleteMany` — che sul Postgres
condiviso non si fanno comunque.

⚠️ Restano indietro le righe nate sotto un **nome di campagna vecchio**
(`FIORI MILANO ENG` contro `[Deluxy] - Fiori Milano ENG`): il ripiego confronta
anche la campagna, quindi non le riconosce. Sono le righe importate dal
Monitoraggio, non quelle di Google.

### ⭐⭐ La coda si bloccava in silenzio: l'account non lo scriveva nessuno (08/08/2026)

Partito da «un'operazione approvata dal 07/08 e mai eseguita». La causa non era
quella singola riga.

**Misurato: `OperazioneAdv.account` era vuoto su 32 operazioni su 32.** Il campo
c'è da sempre e non lo riempiva **nessuno** degli undici punti che creano
operazioni.

Con l'account vuoto, in `eseguiOperazioni` succede questo: lo script di *ogni*
account guarda l'operazione, cerca il bersaglio in casa propria, non lo trova e
la conta fra le **saltate** — non fra le fallite. Le saltate **non riferiscono
niente all'app**.

> ⚠️ **Una coda che si blocca in silenzio è indistinguibile da una coda vuota.**
> L'operazione resta `approvata` per sempre e il motivo esiste **solo nel log
> dentro Google Ads**, dove nessuno guarda. Il log di Cake diceva
> `Salto attiva_keyword su "flowers delivery milan": non è in questo account.`
> — su Cake è la risposta **giusta** (la keyword è di Gifts), ma **anche Gifts
> ha stampato la stessa riga**, e le due cose sono indistinguibili.

**Perché non era mai saltato fuori prima.** Guardando tutte le 18 operazioni
sulle keyword mai create: quelle che hanno funzionato avevano **tutte**
l'`idEsterno` nel formato `account:gruppo:criterio` e prendevano la **scorciatoia
per id** in `trovaKeyword`. Questa è **la prima e unica** che ha esercitato la
ricerca **per testo**, ed è fallita. Cioè: quel ramo non ha mai funzionato, e
non si vedeva perché non ci passava mai nessuno.

**Quanto è grande davvero**: nell'archivio delle keyword **4.808 righe su 8.071
(60%) hanno ancora l'id nel formato vecchio** (solo il numero del criterio) e
419 non ce l'hanno affatto. Cioè per **circa due keyword su tre** mettere in
coda una pausa o una riattivazione produceva un'operazione che lo script
scartava senza dirlo.

**La correzione**: `lib/operazioni.ts` con `accodaOperazione()`, **punto unico**
da cui passano tutte e undici le creazioni (dieci in `azioni.ts`, una nella
route API). Riempie `account` ricavandolo dal brand della campagna o del gruppo.
Non ripara la ricerca per testo: **toglie il silenzio**, che era il difetto
vero. Con l'account scritto, la macchina che c'è già cambia in due punti:

1. gli account estranei scartano l'operazione **subito**, senza cercare;
2. sull'account giusto un bersaglio non trovato smette di essere una «saltata» e
   diventa un **errore che torna indietro** con la sua causa
   (`if (op.account)` → `fallite++` → `riferisci(...)`).

Verificata a secco la risoluzione su tutti e sei gli incroci brand × canale:
gifts→`248-656-1148`/`2802316249885506`, flowers→`825-518-1560`/`965988141913909`,
cake→`846-090-5423`/`1040175814157216`. Un brand `cross` resta **null** apposta:
«non lo so» è meglio di un account a caso, che manderebbe l'operazione a farsi
eseguire nel posto sbagliato.

> ⚠️ **Vale per le operazioni NUOVE.** Quella ferma dal 07/08 ha ancora
> `account` vuoto: va riempita a mano sul database, **oppure** — più semplice —
> annullata in coda e rifatta dall'app, che ora la scrive.

#### La seconda metà: l'API non mandava l'account, e la ricerca per testo non ha mai funzionato

> ⚠️ **Riempire il campo nel database non serviva a niente da solo**:
> `GET /api/v1/operazioni` **non restituiva `account`**. Lo script leggeva
> sempre `op.account === undefined`, quindi tutta la logica che aveva già per
> distinguere «non è roba mia» da «è roba mia e non la trovo» restava spenta.
> Due metà di una correzione, e ognuna senza l'altra è inerte.

Ora la GET manda anche **`account`** e **`campagna`** (il nome della campagna:
`OperazioneAdv` non ha la relazione, solo `campagnaId`, quindi i nomi si
prendono in **una query sola** per tutte le righe — una per riga sarebbero
cinquanta andate e ritorno).

E `trovaKeyword` in `scripts/google-ads-script.js` **cerca dove l'app dice che
sta**, invece che a tentoni in tutto l'account:

1. `campagna + gruppo` — esatto;
2. solo `campagna`, se il gruppo è stato rinominato;
3. **se l'app ha detto la campagna, non si allarga oltre**. Senza campagna
   (solo allora) si guarda tutto l'account col filtro sul brand.

> ⚠️ **Due errori trovati rileggendo la prima versione di questa correzione, e
> corretti lo stesso giorno.** La prima stesura allargava sempre fino
> all'account, e sbagliava lo spareggio:
>
> 1. **Allargare oltre la campagna può agire sulla campagna sbagliata.** La
>    stessa parola vive in più campagne dello stesso account — misurati **531
>    testi su Gifts**, 241 su Cake, 180 su Flowers. Fermare o riaccendere la
>    keyword di un'altra campagna **riferendo «fatto»** è peggio di non fare
>    niente: adesso, con l'account scritto, il «non trovata» torna indietro
>    nell'app come errore leggibile.
> 2. **Serve lo spareggio sulla corrispondenza.** La stessa parola convive come
>    esatta *e* a frase nello stesso gruppo (**542 casi misurati**) e su Google
>    le due hanno lo **stesso** `keyword.text`: la ricerca precisa restituiva
>    due risultati e falliva proprio sul caso che doveva risolvere. Ora
>    `matchAtteso()` fa da spareggio — **spareggio, non filtro**: non si applica
>    con un solo risultato, così una corrispondenza sbagliata in archivio non
>    fa perdere la keyword giusta.

> ⚠️ **Il filtro sul brand era il sospettato numero uno e ora sta solo dove
> serve.** `brandDa(nome della campagna) !== BRAND` indovina il brand dal
> **nome** dentro un account che quel brand ce l'ha già: quando sbaglia a
> indovinare butta via l'unico risultato buono, e chi chiama legge «non è in
> questo account» — cioè la bugia perfetta, indistinguibile dalla verità.

Verificato il payload sui dati veri: l'operazione ferma riceverà
`campagna: "[Deluxy] - Fiori Milano ENG"` e `parametri.gruppo: "Flowers
Delivery"`, cioè abbastanza per la ricerca esatta **anche senza l'account**.

> ⚠️ **`tutto.js` va reincollato nei tre account** (rigenerati tutti e nove i
> file in `C:\Users\nicol\Downloads\deluxy-google-ads\`, **CHIAVE_API e BRAND
> restano da rimettere a mano**). Finché non si reincolla, gli account girano
> ancora la versione vecchia della ricerca.

> ⚠️ **Il file dello script è latin1 e va toccato solo con node, mai con
> l'editor.** Successo oggi: i trattini lunghi di un commento nuovo (`—`,
> U+2014) non esistono in latin1 e sono finiti nel file come **byte di
> controllo `0x14`**. Ora lo script di patch rifiuta di scrivere se il testo da
> inserire non è ASCII puro, e si controllano i byte non-ASCII prima/dopo:
> devono essere **identici** (5.842).

### ⭐ Un `<form>` dentro un `<p>` rompeva l'idratazione — e con lei l'ordinamento delle tabelle (08/08/2026)

Segnalato come «riordinando la colonna perde il focus e torna a inizio pagina».
La causa non era l'ordinamento: era **HTML non valido** in cima a due pagine.

`<p className="page-sub">` conteneva un `<form>` (il selettore dei clienti sulla
scheda campagna, quello di stato sulla scheda gruppo). Un form non può stare
dentro un paragrafo: il browser **chiude il `<p>` da solo**, l'albero che
riceve non è quello mandato dal server, e React **fallisce l'idratazione** e
ririsegna l'intera pagina.

> ⚠️ **Un errore di idratazione non si vede come un errore: si vede come una
> funzione che non funziona.** `TabelleOrdinabili` aggancia gli ascoltatori ai
> `<th>` a mano, in un `useEffect`. Quando React butta via l'albero del server e
> lo rifà, quegli ascoltatori restano su nodi che non sono più in pagina:
> cliccare l'intestazione **non faceva niente**, e sembrava un bug
> dell'ordinamento. Misurato in console: `Hydration failed` su
> `/campagne/[id]` e `/gruppi/[id]`, sparito passando a `<div>`.

> ⚠️ **È la stessa famiglia del `<dialog>` dentro l'`<h1>`** (04/08). Regola:
> prima di mettere un elemento interattivo dentro un contenitore di testo,
> chiedersi se quel contenitore lo può contenere — `<p>` può contenere solo
> testo e roba in linea.

**Cercare gli altri**: la spia è `<form>`, `<div>`, `<dialog>` o `<table>`
dentro `<p>`. Il modo veloce di accorgersene è la console del browser, non gli
occhi: `tsc` passa e la pagina si vede benissimo.

### Le conversioni vere accanto a quelle dichiarate (08/08/2026)

Sulla scheda campagna, nella riga dei numeri in cima: **`9 · 10`** — 9
conversioni dichiarate da Google, 10 ordini Shopify veri che portano l'UTM di
quella campagna, con il venduto a fianco.

> ⚠️ **Affiancate, MAI sommate.** Sono due modi di contare lo stesso acquisto:
> la piattaforma include view-through e finestre lunghe, gli ordini sono cassa
> entrata. Sommarle conterebbe due volte la stessa vendita. La distanza fra i
> due numeri **è essa stessa l'informazione** — quando si allontanano molto il
> problema è il tracciamento, non la campagna.

- Lo stesso metro dell'attribuzione del blocco Vendite: `metroUtm()` in
  `lib/vendite-campagna.ts`, un punto solo. Prima la regola («nomi normalizzati
  + id di piattaforma») viveva dentro `venditeDiCampagna` come costanti locali:
  copiarla avrebbe voluto dire due numeri diversi per la stessa domanda.
- **Stesso periodo** delle conversioni dichiarate (`periodo.corrente`), non i 30
  giorni fissi del blocco Vendite: due finestre diverse messe una accanto
  all'altra sembrano confrontabili e non lo sono.
- `ordiniAttribuiti()` non rilegge gli ordini uno per uno come
  `venditeDiCampagna`: fa una **`groupBy` sull'UTM**, poche decine di righe
  invece di migliaia di ordini con dentro le loro righe.
- **Uno zero non resta muto.** Su `[Deluxy] - Fiori Milano ENG`: `13 · 0` con
  849 € di spesa — e sotto la riga dice che ci sono **13 ordini con UTM
  `[Deluxy] - Fiori Milano`**, il nome di prima che la campagna fosse divisa in
  ENG/ITA. Senza quella frase, «0» si legge come «questa campagna non vende».

Verificato in pagina: su `[Deluxy] Torte MILANO` la riga in cima dice **9 · 10
(775 €)** e il blocco Vendite più sotto, che ci arriva per un'altra strada di
codice, dice **775 € · 10 ordini**. Stessa cifra da due parti.

### La colonna dice com'è ordinata, e riordinando non si torna in cima (08/08/2026)

Due cose sulla tabella delle keyword di un gruppo, segnalate insieme.

- La tabella **era già** ordinata per spesa crescente (scelta del 07/08), ma non
  lo diceva: nessuna freccia sulla colonna. Peggio, per l'ordinatore quella
  colonna risultava «mai ordinata», quindi il **primo click rifaceva lo stesso
  ordine** — la tabella non cambiava e sembrava rotta. Ora la tabella dichiara
  l'ordine che il server ha già fatto (`data-ordinata-per` /
  `data-ordinata-verso`); `TabelleOrdinabili` accende solo la freccia, **non
  riordina** (le righe sono già a posto), e il primo click rovescia.
- Riordinare sposta ogni riga, e il browser perde l'ancoraggio dello scroll: su
  una tabella lunga si finiva a inizio pagina. Ora si misura dove sta
  l'intestazione prima e dopo e si recupera la differenza, più
  `focus({preventScroll:true})` per chi ordina da tastiera.

Misurato dopo la correzione, su una tabella da 60 righe con le righe che si
spostano davvero: spostamento della pagina **0 px**, intestazione ferma, focus
sulla colonna.

### La corrispondenza «tornava indietro da sola» — e invece salvava (08/08/2026)

Segnalato: «cambio in *a frase* ma torna in *esatta* automaticamente». Il
salvataggio **funzionava**: verificato in pagina, il valore sul database era
già `phrase`. A tornare indietro era **solo il menù**, finché non si ricaricava
a mano.

> ⚠️ **`revalidatePath` non basta a far seguire il dato a un `<select>`
> controllato, ed è la SECONDA volta.** La prima era `impostaLinguaCampagna`
> (06/08). Il sintomo è sempre lo stesso e sempre il peggiore possibile: la
> modifica è andata, ma chi guarda vede il valore vecchio tornare — e conclude
> che l'app non salva. Serve il **ritorno esplicito** alla pagina.
>
> **Regola per il futuro**: ogni volta che una server action cambia un valore
> mostrato da un `SelettoreStato`, non fermarsi a `revalidatePath` —
> verificare in pagina che il menù segua, o mettere il redirect.

Provato: da `phrase` a `broad` e ritorno, col menù che resta su quello scelto.


### ⭐ Il motore di scrittura su Meta, spento (07/08/2026)

`lib/meta-scrittura.ts` + `POST /api/v1/esegui/meta`: l'esecuzione delle
operazioni Meta **già approvate a mano**. È il gemello di `eseguiOperazioni`
dello script Google, ma **dentro l'app** — Meta non ha gli Scripts, quindi è
l'app a dover chiamare la Graph API.

**Non parte finché non ci sono DUE cose**, e sono separate apposta:

1. **`ads_management`** sul token. Va chiesto su due fronti che non si
   sostituiscono: lo **scope del token** (rigenerarlo chiedendo
   `ads_management`) **e** il permesso sull'**asset** in Business Manager (i
   tre account assegnati all'utente di sistema con «Gestisci campagne», non
   «Visualizza prestazioni»). ⚠️ È la stessa distinzione di `#200` contro
   `190`, e farne una sola non basta.
2. **`META_SCRITTURA=attiva`** fra le variabili d'ambiente: un interruttore in
   più, perché il permesso da solo non deve bastare ad accendere la spesa.

`GET /api/v1/esegui/meta` **dice se si può scrivere e perché no, senza toccare
niente**: il permesso si chiede a `/me/permissions`, non si deduce provando a
scrivere — «provare» qui vorrebbe dire fare la modifica.

> ⚠️ **La differenza con Google è di natura.** Là l'esecuzione gira *dentro*
> Google Ads e il segreto non esce mai dall'account. Qui un token con
> `ads_management` — cioè col potere di far uscire denaro — vive come
> variabile d'ambiente su Vercel. È il motivo per cui coda → approvazione a
> mano → esito non è una formalità.

> ⚠️ **Niente cron, ed è voluto.** Finché non avrà fatto qualche giro vero
> sotto gli occhi di qualcuno, la scrittura non deve poter partire da sola di
> notte. Il cron si aggiunge dopo.

**Tre trappole già scritte nel codice:**

- **`daily_budget` va in CENTESIMI**, non in euro: `25` vuol dire 0,25 €.
  La conversione sta in un punto solo.
- Il budget può stare sulla **campagna (CBO)** o sull'**ad set**: scriverlo sul
  livello sbagliato non fa niente, o ne aggiunge un secondo che convive col
  primo. Chi chiama deve dire il livello — qui non si indovina.
- **Metà delle operazioni su Meta non esistono**: niente keyword, niente
  negative. `OPERAZIONI_META` sono cinque — pausa/attiva campagna, pausa/attiva
  ad set, budget — e le altre si segnano fallite col motivo invece di provarle.

L'esito crea la **`Modifica`**: senza, un'operazione eseguita su Meta sarebbe
invisibile al change control e la campagna risulterebbe «mai toccata» il giorno
dopo. E se l'esito non si riesce a registrare **ci si ferma**, come nello
script Google: rifarla al giro dopo sarebbe una seconda modifica sulla stessa
campagna.


### «Defunta» vale solo per chi non ha speso NULLA (06/08/2026)

Una pulizia in blocco aveva marcato defunte **159 campagne** col criterio
«ferma e senza spesa negli ultimi 30 giorni». L'utente ha corretto la regola:
**defunta è solo chi non ha speso nulla, mai**. Le due cose non si somigliano
nemmeno — fra le 159 c'erano `Deluxy - Awareness` con **2.817 €** di storia,
`Vendite (COLLECTION + CAROSELLO)` con 1.362 €, `Red Rose Sales-Search` con
543 €.

- **77 rimesse com'erano** (tutte `in_pausa`): avevano speso davvero.
- **82 restano defunte**: zero spesa in tutta la loro storia — Panettoni,
  Christmas Gift, Anniversario Rome/Florence/Milan, mai partite.
- Stato finale: **107 vive, 123 defunte** (le 123 comprendono le 41 già decise
  a mano prima).

> ⚠️ **Il criterio giusto è la spesa DI SEMPRE, non quella del periodo.** Una
> campagna stagionale ferma da mesi non è morta: è ferma. Ogni ripristino è
> tracciato nello storico con «rimessa viva: defunta vale solo per chi non ha
> speso NULLA».

> ⚠️ **Il Postgres condiviso ha rifiutato la connessione due volte** durante la
> correzione (la prima senza scrivere niente). Per questo lo script scriveva
> **una campagna alla volta** e ripartiva da dove si era fermato, saltando le
> già fatte: su una scrittura in blocco a 159 righe, con `connection_limit=5`,
> l'alternativa è non sapere dove ci si è interrotti.

### Il riquadro «quanto stiamo spendendo oggi» diceva il falso (06/08/2026)

Diceva «lo script manda la giornata la sera (fascia 23:00-24:00)». Era vero
quando fu scritto, ma le corse misurate oggi sono alle **02:37-02:47**: chi
leggeva aspettava per la sera dei dati che non sarebbero arrivati. E quando
oggi non c'era, il riquadro diceva **soltanto** che non c'era — sopra un
paragrafo che spiega che comunque i numeri di oggi non si usano per decidere.
Due frasi per non dire niente, in una scheda intera.

- L'orario si legge da **`RicezioneDati`**, non dal codice: resta vero anche il
  giorno che qualcuno cambia la schedulazione dentro Google Ads, dove l'app non
  può vedere. Se le ultime cinque corse hanno orari sparsi, lo dice.
- Senza i dati di oggi mostra **l'ultima giornata piena** — con la sua data, non
  «ieri»: la corsa delle 2 di notte copre fino all'altro ieri, e «ieri» usciva
  vuoto proprio nel numero principale, come se la campagna non avesse speso.
- Accanto: media dei 7 giorni e **quanto di budget ha usato quel giorno**.
  Su `[Deluxy] - Fiori Milano ENG` il 05/08 fa **55,06 € su 26 € di budget, il
  212%**.


### ⭐ Una keyword ESATTA finiva in coda come GENERICA (06/08/2026)

Segnalato dall'utente: «l'ho portata su un'altra campagna e la propone
generica, ma di là è a frase». Guardando i dati era peggio: la parola è
**`milano flowers (match esatto)`**, con 30,54 € di storia, ed era stata
accodata **broad**. Da esatta a generica, l'allargamento più pericoloso che
esista, in silenzio.

> ⚠️ **Due letture della corrispondenza, con vocabolari diversi.**
> `testoKeywordPulito` riconosce le forme del Monitoraggio («match esatto») e
> le toglie dal testo; la scheda keyword invece leggeva la corrispondenza con
> `/\((exact|phrase|broad)\)$/`, che su «(match esatto)» dà `null`. Il testo
> veniva ripulito bene e **la corrispondenza andava persa** — e il ripiego era
> `broad`. Ora c'è `corrispondenzaDiTesto()` in `dominio.ts`, un vocabolario
> solo per entrambe.

> ⚠️ **E il ripiego era dalla parte sbagliata.** Quando non si sa, adesso si
> va sulla più STRETTA (`exact`), non sulla più larga: su una parola nata
> esatta, «generica» moltiplica le ricerche comprate. L'operazione sbagliata
> è stata **annullata** in coda, non approvata.

**Avviso di lingua nel dialogo.** Portare «milano flowers» su «Fiori Milano
ITA» non la traduce: resta scritta in inglese e non intercetta chi cerca in
italiano. L'app **non traduce** — tradurre a macchina una keyword è il modo di
comprare ricerche che nessuno fa — ma ora lo dice, elencando quali campagne
scelte parlano un'altra lingua rispetto a quelle su cui la parola gira già.

### I buchi dell'archivio dicono di chi sono (06/08/2026)

La nota diceva «2 campagne hanno dati su meno giorni delle altre» senza dire
**quali** né **quanto**: un allarme rosso su cui non si può fare niente. Erano
`[Deluxyflower] Brand protection` e `[Cakedesign] Brand Protection`, due
giorni ciascuna, per **4,04 € stimati** sopra una tabella da 13.000 €.

> ⚠️ **Un buco vale quanto la campagna che lo ha.** Lo stesso rosso per pochi
> centesimi e per mille euro: letto tre volte a vuoto, quell'avviso smette di
> essere letto. Ora nomina le campagne, stima quanto varrebbero i giorni
> mancanti e, **sotto l'1% della spesa del mese**, dice che i totali non
> cambiano — spiegando la causa vera: una campagna che non eroga in un giorno
> non ha una riga da mandare.

### La lingua si imposta dal titolo, e l'attribuzione la legge da lì (06/08/2026)

La lingua era in fondo al blocco vendite, dentro «Correggi il legame» — e dopo
la compattazione in due righe stava sotto un espandibile. Ora è un menù
**accanto al titolo della campagna**, e non è una seconda impostazione che le
somiglia: scrive nello **stesso** `LegameCampagnaShopify.lingua` che
l'attribuzione usa per tagliare i clienti, e che il filtro lingua delle
keyword legge.

> ⚠️ **Scrivere la sola lingua avrebbe cancellato il resto.** Quando
> `origine = "manuale"` la scheda prende il legame **per intero** e non deduce
> più niente: un upsert con la sola `lingua` avrebbe azzerato prodotto, città e
> negozio, e l'attribuzione delle vendite si sarebbe spenta di colpo.
> `impostaLinguaCampagna` rilegge il legame corrente — dedotto o manuale — e
> cambia solo la lingua. Provato in produzione: da `ita` a `eng` e ritorno, con
> `categoria: torte` e `negozio: cakedesignme` **intatti**.

> ⚠️ **`revalidatePath` da solo non bastava.** I numeri sotto si aggiornavano
> (il blocco vendite li rilegge) ma il menù in testa tornava a mostrare «lingua
> non dichiarata» finché non si ricaricava a mano: cioè l'aspetto esatto di un
> salvataggio fallito, su un salvataggio riuscito. Serve il ritorno esplicito
> alla pagina — col periodo conservato, o cambiare lingua rimandava agli
> ultimi 30 giorni.

### Filtro lingua sulle keyword, e «ce l'ha già» che non era vero (05/08/2026)

**Filtro per lingua** su `/keywords`: italiano, inglese, francese e **«non
dichiarata nel nome»**. La lingua è quella della **campagna** su cui la parola
gira, non quella in cui la parola è scritta — «flower delivery milan» dentro
una campagna ITA resta ITA, perché qui lingua vuol dire *a chi parla la
campagna*. `linguaDaNome()` sta ora in un punto solo (`vendite-campagna.ts`),
usata da scheda campagna e filtro.

> ⚠️ **La scelta a mano vince sul nome.** La lingua si corregge dalla scheda
> campagna («Contesto» → *Clienti (lingua della campagna)* → **Correggi il
> legame**), e quella scelta è esattamente il caso in cui il nome sbaglia:
> filtrare sulla deduzione proprio dove qualcuno era già intervenuto per
> smentirla sarebbe stato il difetto peggiore della funzione.

Misurato su `?tema=fiori`: 1.532 parole → 1.111 in inglese, e **78 «non
dichiarate»** tutte su `[DELUXY] Fiori Firenze` — una campagna con keyword
inglesi che nel nome non lo dice.

**«Ce l'ha già» era falso.** Segnalato: «fiori a domicilio milano» rifiutata su
`[Deluxy] - Fiori Milano ITA` con «ce l'ha già». Il controllo usava
**`contains`**, e aveva trovato tre parole **diverse** che la contengono —
«mandare fiori a domicilio milano», «… e provincia», «… in giornata». Nessuna
era quella parola: l'aggiunta veniva rifiutata a torto.

- `contains` resta solo come setaccio grosso, la decisione la prende il
  confronto sul **testo ripulito**.
- Il messaggio ora dice **quale** riga ha bloccato: senza, «ce l'ha già» è una
  parola contro l'altra e non c'è modo di accorgersi che è sbagliata.

**`NOT_APPLICABLE` anche sulla scheda gruppo**: lo stesso gergo, ripetuto 51
volte, in un secondo blocco che la correzione di prima non toccava. Le
costanti (`GIUDIZI_GOOGLE`, `ETICHETTA_GIUDIZIO_GOOGLE`) stanno ora in
`dominio.ts` — due elenchi diversi davano due risposte.

### Tre caselle che si contraddicevano, e una classifica che non c'era (05/08/2026)

**«Azione decisa: in pausa» · «su Google: in pausa» · «Stato: Attiva»**, sulla
stessa riga. Non era il solito «giudizio contro fatto»: la pausa **l'aveva
chiesta l'utente** ed era stata eseguita. La causa: `POST /api/v1/operazioni/
:id/esito` aggiornava **gruppo e campagna, mai la keyword** — quindi
`CopyAnnuncio.stato` restava «attiva» per sempre.

- Ora l'esito allinea anche la parola (`pausa_keyword` → `in_pausa` +
  `PAUSED`), agganciandola per `idEsterno` quando c'è, altrimenti per testo
  ripulito dentro la campagna.
- **Riparate 8 keyword** già in quello stato.

> ⚠️ **Nella riparazione all'indietro si è toccato SOLO `stato`, non
> `statoPiattaforma`.** Da allora l'import può aver letto qualcosa di più
> fresco: su `fioraio milano (phrase)` la pausa risulta eseguita ma **Google
> lo dà ancora attivo**, e scriverci PAUSED sopra avrebbe cancellato proprio
> il segnale che vale la pena guardare. Ora quella riga dice «In pausa» +
> «attiva su Google», che è la verità e una domanda aperta.

**«Cosa vede chi cerca» non si capiva**, ed erano tre difetti insieme:

- **`31/15`** si legge come «31 su un massimo di 15», cioè un errore. Non lo
  era: 31 sono i titoli *diversi* della campagna, 15 quanti ne mostra un
  *singolo annuncio*, e «max 30 caratteri» era una terza cosa ancora — la
  lunghezza. Tre numeri schiacciati in uno, ora scritti per esteso.
- **«DAL MIGLIORE AL PEGGIORE SECONDO GOOGLE»** sopra un elenco in cui ogni
  riga diceva `NOT_APPLICABLE`: una classifica promessa e mai mantenuta, con
  un ordinamento che non voleva dire niente. Quando non c'è **nemmeno un**
  giudizio vero, ora lo si dichiara e si ordina per lunghezza — l'unica cosa
  azionabile rimasta. Il gergo (`BEST`, `LOW`) è tradotto, e
  `NOT_APPLICABLE` non compare più riga per riga.
- ⚠️ **`{KeyWord:...}` è inserimento dinamico**: Google ci mette la parola
  cercata, quindi contarne i caratteri e segnarlo in rosso è un **allarme
  falso**. Quelle righe dicono «dinamico». Misurato: da 1 falso rosso a 0.

### «Adatta», e la parola che Google ha sotto un altro nome (05/08/2026)

**«Adatta»** sulle parole che rendono altrove (`portaIdealeQui`,
`adattaProposta`): `flower delivery milan` dentro la campagna di Roma non serve
a niente com'è — comprerebbe le ricerche di chi vuole consegne a Milano. Il
bottone la riscrive per la città di *questa* campagna **traducendo la lingua**
(`perAltraCitta`, già usato da `/campagne/crea`): `flower delivery milan` →
`flower delivery rome`, `milano flowers` → `roma flowers`, `florists in milan
italy` → `florists in rome italy`. Quando non c'è niente da riscrivere il
bottone dice **«Porta qui»**.

> ⚠️ **La parola adattata non ha storia QUI.** I numeri per cui l'AI la
> propone sono dell'altra città: l'operazione parte con l'avviso addosso
> («su questa città non ha ancora nessun dato»), che è esattamente il tipo di
> cosa che chi approva deve sapere. La somiglianza non è una misura.

**«Google non l'ha ancora detto» era spesso falso.** Le keyword del
Monitoraggio arrivano col nome vecchio della campagna e col suffisso del foglio
— `flower delivery in milan (broad)` — mentre la riga vera di Google è
`(phrase)` sotto il nome nuovo: due righe distinte che non si fondono. La
colonna Stato diceva che Google non sapeva niente di una parola che stava
erogando. Ora si cerca la **gemella** (stesso testo tolta la corrispondenza) e
si dice quale riga ce l'ha, se è attiva o ferma, con spesa, clic e QS.
Misurato su `[Deluxy] - Fiori Milano ENG`: **8 righe su 60** avevano la gemella
— e una di quelle è **ferma su Google** mentre il foglio la dava attiva.
Le righe non si fondono: i numeri restano di chi li ha mandati.

### ⭐ «Defunta» non teneva: l'import la cancellava (04/08/2026)

Segnalato dall'utente: «le campagne che avevo messo come defunte sono tornate
visibili». Vero, e non era un caso isolato: **l'import scriveva `stato` con
quello che dice Google**, quindi una campagna marcata `defunta` a mano tornava
`in_pausa` alla passata successiva e ricompariva in ogni elenco.

Misurato sul registro: **66 marcature «→ defunta» su 68 erano state annullate**.
La stessa campagna era stata rimarcata fino a **quattro volte** — qualcuno
continuava a rifarlo senza capire perché tornasse.

> ⚠️ **È la distinzione `stato` / `statoPiattaforma` del gruppo, che alla
> campagna non era mai stata applicata.** Il giudizio è nostro, il fatto è di
> Google, e non si sovrascrivono. Vale per ogni campo dove l'app ha
> un'opinione: se l'import lo tocca, l'opinione dura fino al giro dopo.

- `STATI_CAMPAGNA_NOSTRI = ["defunta", "in_lancio", "bozza"]` in `dominio.ts`:
  Google non sa cosa siano e l'import non li tocca più.
- **`Campagna.statoPiattaforma` è nuovo** (ALTER TABLE mirato; 228 righe
  riempite dal fatto già noto, 230 campagne intatte): il fatto di Google non si
  perde nemmeno quando il giudizio nostro lo copre — una campagna può essere
  «defunta» per noi e **ancora accesa su Google**, ed è proprio il caso da
  vedere.
- **Ripristinate 34 campagne.** Regola: si guarda l'*ultimo* cambio di stato
  deciso a mano nel registro; se l'ultima parola dell'utente era «→ defunta» e
  adesso la campagna dice altro, l'ha cambiata l'import. Dove dopo la defunta
  c'era un'altra decisione a mano, **non si è toccato niente**: quella è più
  recente.

### ⭐ Il change control AVVISA, non blocca più (04/08/2026)

**Decisione dell'utente**: «consenti tutte le modifiche da app, al massimo metti
un alert che avvisa dell'impatto del cambiamento». Prima le regole del doc 11
**rifiutavano** l'operazione e la persona non poteva farci niente: si ritrovava
con un messaggio e nessuna via d'uscita, sulla propria campagna.

Ora **ogni divieto è diventato un avviso che dice l'impatto**, e nessuno di
questi ferma più niente:

| prima bloccava | ora avvisa |
| --- | --- |
| 2ª modifica sulla stessa campagna entro 72h | «i risultati non diranno quale delle due li ha prodotti» |
| budget oltre il 30% | «l'algoritmo riparte ad apprendere, per giorni la resa peggiora» |
| TRAINO toccata ven-dom | «il weekend è quando fa fatturato e non c'è nessuno a rimediare» |
| L2/L3 su TRAINO senza rollback | «se peggiora nessuno sa com'era prima» |
| >1 L2/L3 a settimana su TRAINO | «oltre non si distingue l'effetto di ciascuna» |
| **freeze da incidente aperto** (6 punti nel codice) | «quello che si misura è sporcato dal guasto» |

> **La rete di sicurezza vera non era questa: è che niente parte da solo.** Ogni
> operazione resta in coda finché una persona non la approva a mano, e lo
> script esegue solo le approvate (AGENDA PIANI). Quella **non è stata
> toccata** — ed è il motivo per cui togliere i divieti resta ragionevole.

- Colonna nuova **`OperazioneAdv.avvisi`** (ALTER TABLE mirato, 20 operazioni
  intatte): l'avviso viaggia **con l'operazione** e compare sulla riga in
  `/operazioni`. ⚠️ È lì che serve, non nel messaggio dopo il redirect: **chi
  approva può essere un'altra persona un altro giorno**, e quell'URL non lo
  vedrà mai. Per questo l'avviso viaggia due volte.
- `validaModifica` restituisce ancora `blocchi`, e resta **vuoto**: i chiamanti
  lo controllano ancora, così rimettere *un* divieto — uno solo, per un motivo
  preciso — è una riga in `guardrail.ts`.
- Sulla scheda gruppo il tag non dice più «blackout fino al»: dice **«già
  toccata di recente · giudicabile dal …»**, che è un'informazione, non un
  divieto.

Provato in produzione su un gruppo in blackout: l'operazione che prima veniva
rifiutata è **entrata in coda**, con l'avviso a schermo e sulla riga da
approvare. Riga di prova poi cancellata (solo quella, per id).

### Vendite Shopify in due righe, e il blocco dove si è cliccato (04/08/2026)

Il blocco «Vendite su Shopify» occupava **1.700 px**: due tabelle, tre file di
KPI, quattro paragrafi e un modulo. Ora sono **due righe espandibili** da 46 px
(`.vend-riga`): fuori i numeri che si guardano — venduto, ordini, scontrino,
ROS col break-even, costo per cliente nuovo e per ordine — dentro tutto il
resto. Misurato a 1280 px: **1.700 → 172 px**.

> **Niente è stato tolto**: tabelle per categoria, città di consegna, blocco
> «Stima», spiegazioni e modulo di correzione del legame sono tutti dentro,
> uno scatto più in là. Stringere la cornice, non ridurre il contenuto.

Il blocco «Stima» sta dentro la riga **Attribuzione**, non da solo: è la
versione stimata degli stessi KPI, e come riga a sé faceva sembrare che
fossero tre misure diverse.

**E il change control diceva «no» a due schermate di distanza.** Segnalato:
«clicco metti in pausa e non succede nulla». L'operazione *era* stata bloccata
e il motivo *era* in pagina — ma sotto il selettore del periodo, mentre chi
aveva premuto guardava il bottone in cima. Ora:

- l'avviso rosso sta **subito sotto la testata**, dove si è fatta l'azione;
- accanto al bottone compare **prima** «blackout fino al …» quando la campagna
  è in blackout: mettere in coda qualcosa che il guardrail rifiuterà di sicuro
  è un giro a vuoto. Le L0 non contano, come nel guardrail.

### Dove mandano gli annunci (04/08/2026)

Blocco **«Dove mandano gli annunci»** sulla scheda campagna
(`DestinazioniCampagna.tsx`): gli URL di destinazione, aperti in una finestra
nuova, con il gruppo che li usa e — se l'URL combacia con una landing censita —
il link alla sua scheda con la scorecard.

> ⚠️ **La destinazione dell'annuncio non era MAI stata importata.** Misurato:
> `finalUrl` popolato su **429 righe su 18.223**, e tutte e 429 sono
> **sitelink**. Zero sui 9.764 titoli e sui 3.036 descrizioni, perché nessuna
> query dello script chiedeva `ad_group_ad.ad.final_urls`. Chi guardava un URL
> in app stava guardando dove manda un *sitelink*, non dove manda l'annuncio:
> sono due pagine diverse, e il blocco le tiene **separate** dicendolo.

- Nello script: **`leggiDestinazioni()`**, query propria su `ad_group_ad` con
  `final_urls`, accorpata per (campagna, gruppo, url). ⚠️ **In una query a
  parte e dentro un `try`**, non dentro `leggiAnnunci()`: quella gira su
  `ad_group_ad_asset_view`, e infilarci un campo che la vista non regge farebbe
  fallire **tutto** il giro dei titoli, che oggi funziona. Se Google la rifiuta,
  si torna a mani vuote **scrivendolo nel log**.
- Le righe arrivano come `tipo: "destinazione"`: l'ingest accetta già tipi
  nuovi e scrive `finalUrl`, nessuna modifica lì.
- Finché il giro `copy` aggiornato non passa, il blocco **dichiara** che il
  dato non c'è invece di spacciare i sitelink per la destinazione.

> 👉 **Serve reincollare `copy.js` (o `tutto.js`) nei tre account**: le copie
> rigenerate sono in `C:\Users\nicol\Downloads\deluxy-google-ads\`.

⚠️ Lo script è stato modificato **in latin1** (vedi in fondo). Verificato dopo
la modifica: **5.842 byte non-ascii identici** a prima e `node --check` pulito.

### La matita accanto al titolo, e i due stati vicini (04/08/2026)

Il nome si cambia **dove lo si legge**: matita accanto al titolo
(`RinominaInline.tsx`, un componente per entrambi) su **gruppo** e **campagna**.
Le vecchie sezioni «Come si chiama qui» e «Stato nell'app» in fondo alla colonna
destra sono state **tolte**, non duplicate.

- **`Campagna.nomeVisibile` è nuovo** (colonna aggiunta il 04/08 sul Postgres di
  produzione). ⚠️ Applicata con un `ALTER TABLE … ADD COLUMN` mirato e **non**
  con `prisma db push`: il database è **condiviso** con le altre app Deluxy e un
  push confronta l'intero schema — se ha derivato altrove proporrebbe di
  allineare anche quello. Verificato dopo: colonna `text` nullable, 230
  campagne intatte.
- `nomeCampagna()` in `lib/gruppi.ts`, gemello di `nomeGruppo()`. Vale **solo a
  schermo**: ogni confronto e aggancio continua a usare `nome`, che è la chiave
  dell'import — e le keyword del Monitoraggio ci si agganciano per nome.
  Usato su scheda campagna e su `/campagne` (schede e tabella).
- Lo **stato nell'app** del gruppo è salito accanto allo stato di Google: sono
  il giudizio e il fatto, e si leggono solo uno di fianco all'altro. Al posto
  della vecchia sezione resta la spiegazione della differenza.

> ⚠️ **Un `<dialog>` non va dentro un `<h1>`.** Prima versione: matita dentro il
> titolo, e siccome il componente si porta dietro il suo dialogo, il `<h1>`
> "conteneva" tutto il testo del modulo — quello che legge uno screen reader
> diventava «Flowers DeliveryCome si chiama quiFlowers Delivery✕Nome da
> usare…». La matita sta in un `<div>` flex **accanto** all'`<h1>`.

Provato in produzione: rinominata una campagna («PROVA rinomina»), verificato
titolo nostro + tag «su Google: [Deluxy] - Fiori Milano ENG», poi **rimessa
com'era** (casella svuotata → torna il nome di Google).

### Gli ordini si aggiornano ogni 3 ore (04/08/2026)

`/api/cron/ordini` passa da `20 3 * * *` a **`20 */3 * * *`**: otto corse al
giorno invece di una. Era un punto aperto dal 01/08 e si vedeva nei numeri —
con la spesa di Google e Meta aggiornata a oggi e gli ordini fermi alla notte,
ROS, MER e costo di acquisizione risultavano **peggiori del vero** fino al
mattino dopo, senza dichiararlo. Misurato prima del cambio: ultimo ordine
03/08 21:34 con la spesa già al 04/08.

La finestra resta di **7 giorni** (un ordine cambia stato dopo essere nato) e
la corsa si ferma da sola a 45 s dei 60 di `maxDuration` dicendo dov'è
arrivata: otto corse corte costano meno di una lunga che rischia il timeout.

### «Metti in coda» sembrava non fare niente (04/08/2026)

Segnalato dall'utente: si sceglievano le campagne, si premeva **Metti in coda**
e «non succede nulla». Il meccanismo funzionava — provato in sviluppo: il form
parte, l'operazione si crea, si atterra su `/operazioni`. Il difetto era che
**nessuno diceva com'era andata**: `/operazioni` non leggeva **nessun**
parametro, e l'azione ci mandava l'utente muta. Quando tutte le campagne scelte
venivano **saltate** — la parola c'era già, o la campagna è congelata da un
incidente — non compariva nemmeno una riga nuova: dal di fuori è
indistinguibile da un bottone rotto.

- `applicaKeywordAdAltreCampagne` ora redirige con `?esito=` e `?saltate=`;
- `/operazioni` mostra i due avvisi (`.avviso-ok` nuovo, verde, gemello di
  `.avviso-errore`).

> ⚠️ **Le saltate non sono un dettaglio: sono il motivo per cui uno guarda la
> coda e non trova quello che si aspettava.** Finivano solo in `registra()`,
> cioè nello storico — che non è dove uno guarda.

I **tag delle campagne** sulle righe delle keyword sono ora collegamenti che
aprono la campagna in una **finestra nuova** (freccia ↗ e `rel="noopener"`):
tornare indietro da lì significherebbe ricaricare 1.500 righe e riaprire il
tema. Le campagne di cui non si trova l'id restano etichette mute — meglio
nessun link che un link a un 404.

### Una negativa congelava la campagna per tre giorni (04/08/2026)

**Il change control bloccava cose che non doveva.** `escludiParoleSelezionate`
dichiara nel suo commento che una negativa è **L0**, «la modifica più leggera
che esista», e che **non fa scattare il blackout**. Ma `validaModifica` riceveva
`campagna.modifiche[0]`, cioè l'ultima modifica **di qualunque livello**: ogni
negativa congelava la campagna per 72 ore. Misurato su `[Deluxy] - Fiori Milano
ENG`: negativa `flowers milan` alle 09:09, e da lì in poi tutto bloccato.

- `LIVELLI_CHE_PESANO` (L1/L2/L3) e `MODIFICHE_CHE_PESANO` in `guardrail.ts`,
  usati in tutti e sei i punti che leggono l'ultima modifica (4 in `azioni.ts`,
  `api/v1/operazioni`, `ProssimeAzioni`).
- Verificato sul database: prima sceglieva la L0 delle 09:09, ora la **L2 delle
  07:09**. ⚠️ **Il blocco resta**, perché quella L2 è vera: si sblocca il
  07/08 alle 07:09. Il fix raddrizza la regola, non toglie il divieto.

> ⚠️ **Filtrare dopo la query non funziona.** Con `take: 1` la riga vera è già
> stata scartata: il filtro va nella `where`. Per lo stesso motivo in
> `GuardrailCampagna` c'è una **query in più**: lì l'elenco delle modifiche
> serve anche a *mostrare* lo storico, negative comprese, e le due domande
> vogliono due risposte diverse.

> ⚠️ **Il messaggio diceva «stesso oggetto», il conto è per CAMPAGNA.** Fermare
> una keyword *diversa* della stessa campagna risultava «secondo intervento
> sullo stesso oggetto» e non si capiva quale fosse il primo. Ora il testo dice
> la campagna e che le L0 non contano.

### Il comando per fermare un gruppo è salito in cima (04/08/2026)

Era in fondo alla colonna destra, dopo dodici riquadri di numeri. Ora è un
bottone **accanto al titolo** (`AzioneGruppo.tsx`) che apre il modulo in un
dialogo — motivo e piano di rollback restano, non sono decorazione: il rollback
è obbligatorio sulle L2 di una traino. Quando non si può agire, al posto del
bottone c'è il motivo (PMax, o operazione già in coda): un bottone che non
funziona è peggio di nessun bottone. La vecchia sezione «Agire su Google» è
stata **tolta**, non duplicata — due moduli che mandano la stessa operazione,
prima o poi, mandano due operazioni.

### Il menu su telefono, e la scelta delle campagne leggibile (04/08/2026)

**Su telefono l'app non aveva navigazione.** Sotto gli 800px il CSS diceva
`.sidebar { display: none }` e basta: il menu spariva, e l'hamburger della
topbar non poteva riportarlo indietro perché toglieva/metteva
`data-sidebar-chiusa`, che `display: none` copriva comunque. Si arrivava alla
pagina aperta e da lì non si andava più da nessuna parte. Ora la sidebar
diventa un **cassetto** sopra la pagina, con velo che chiude al tocco, Esc, e
chiusura automatica appena si sceglie una voce.

> ⚠️ **Lo stesso bottone fa due cose opposte, ed è voluto.** Su schermo grande
> la sidebar parte APERTA e il bottone la chiude (preferenza in
> `localStorage`); su telefono parte CHIUSA e il bottone la apre. Sono due
> stati iniziali diversi, non due bottoni: `ToggleSidebar` guarda
> `matchMedia("(max-width: 800px)")` e decide. Lo stato del telefono **non si
> salva**: un cassetto che copre il contenuto non deve ritrovarsi aperto alla
> riapertura dell'app.

> ⚠️ **La preferenza salvata dal desktop non deve tenere chiuso il cassetto.**
> Chi ha chiuso la sidebar dal computer si porta dietro `data-sidebar-chiusa`
> anche sul telefono. `[data-sidebar-mobile] .sidebar` ha la **stessa
> specificità** di `[data-sidebar-chiusa] .sidebar`: vince perché è dichiarata
> dopo. Spostare quel blocco più in alto nel file rimetterebbe il bug.

**«Porta su altre campagne» era illeggibile**: si apriva come `<details>`
*dentro la cella* della tabella, quindi ereditava la larghezza della colonna
keyword — con nomi come `[Cakedesign.me] | LeadGen | ITA` si leggevano tre
parole per riga in una colonnina da 180px, e scegliere la campagna giusta era
indovinare. Ora è un **dialogo** (`<dialog>` nel top layer, 560px, o
schermo−32px sul telefono) con **casella di ricerca**, conteggio delle
selezionate, «Prendi le trovate» / «Togli tutte» e invio disabilitato finché
non se ne sceglie almeno una.

> ⚠️ Nel dialogo ci sono **solo le campagne che erogano** (`stato = "attiva"`, che è
il fatto scritto dall'import: `attiva` = ENABLED su Google): portare una parola
su una campagna ferma non serve a niente. Da 121 a 19, e l'elenco **dichiara**
di essere filtrato — una lista filtrata che non lo dice si legge come «queste
sono tutte».

> ⚠️ **Uno solo per pagina, non uno per riga** — e qui c'era un difetto grosso,
> più vecchio di questa modifica: il `<details>` stampava l'elenco **completo**
> delle campagne dentro **ogni** riga. Misurato su `/keywords?tema=fiori`:
> 1.531 righe × 121 campagne = **185.480 checkbox e 68,6 MB di HTML** per una
> lista che è sempre la stessa. Ora il dialogo è montato una volta in fondo
> alla pagina e le righe portano quattro `data-*` a testa, con un ascoltatore
> delegato che legge dal bottone su quale keyword sta lavorando:
> **68,6 MB → 11,5 MB (−83%)**, 122 checkbox.

> ⚠️ **Un helper condiviso fra server e client non può stare in un modulo
> `"use client"`.** `attributiPortaKeyword` era esportato da
> `components/PortaKeyword.tsx`: `npx tsc --noEmit` passa pulito e la pagina
> esplode a runtime con «Attempted to call attributiPortaKeyword() from the
> server but attributiPortaKeyword is on the client». Sta in
> `src/lib/porta-keyword.ts`. **Il typecheck non vede questo errore: si trova
> solo aprendo la pagina.**

> ⚠️ **Misurare una transizione CSS con la scheda del browser nascosta dà
> numeri falsi.** Le transizioni non avanzano e `getComputedStyle` restituisce
> i valori di partenza: a cassetto chiuso il margine risultava `0` invece di
> `-280px`, cioè "bug" dove non c'era. Si neutralizza con
> `elemento.style.transition = "none"` prima di leggere.

### Lo script esegue davvero (04/08/2026)

`AZIONE = "tutto"` è schedulato **ogni giorno** sugli account, e comprende
`esegui` — che gira per primo, prima delle letture. Alle 07:09 del 04/08 ha
applicato le prime sei operazioni approvate: cinque keyword in pausa e una
negativa. La coda si svuota da sola.

> ⚠️ **Una coda ferma non vuol dire "script non schedulato".** L'errore l'ho
> fatto: ho letto sette operazioni in stato `approvata` e concluso che il
> lavoro `esegui` non girasse, mentre stava semplicemente per passare. Le due
> cose da guardare PRIMA di quella conclusione sono `/ricezione` (chi ha
> consegnato e quando) e la data di `eseguitaIl` sulle operazioni.

> ⚠️ **Un'operazione eseguita NON si annulla dall'app.** Annullarla cambierebbe
> solo l'etichetta: la keyword resta in pausa su Google, e l'app comincia a
> mentire. Per disfare serve l'operazione opposta (riattiva), e per una
> negativa la rimozione a mano — lo script non la toglie.

Le copie configurate per ogni lavoro si rigenerano in
`C:\Users\nicol\Downloads\deluxy-google-ads\` con lo snippet in fondo a
questo file: legge e scrive in **latin1**, perché `google-ads-script.js` ha
byte non-UTF8 e latin1 è l'unico encoding byte-preserving 1:1.


### Il 02/08/2026 (questa sessione)

**L'app girava dall'altra parte dell'oceano.** Home a 10,4 secondi, e la causa
non era una query pesante: `X-Vercel-Id` diceva `fra1::iad1` — richiesta entrata
a Francoforte, funzione eseguita a **Washington**, database a Francoforte. Ogni
query pagava l'andata e ritorno oltre oceano, e una pagina ne fa decine. Una riga
in `vercel.json` (`"regions": ["fra1"]`) e la home è passata a **0,64 s: −94%**.
E la sidebar faceva **19 query su ogni pagina**: ora una sola con i conteggi come
sotto-select più 60 s di cache (`lib/conteggi-sidebar.ts`), e se il database non
risponde mostra zeri ma la pagina si apre.

> ⚠️ **Da controllare per primo quando qualcosa è lento**: l'header
> `X-Vercel-Id`. Se la seconda sigla non è `fra1`, la funzione sta girando
> lontano dal database e nessuna ottimizzazione di query recupererà quel tempo.

**Il risultato atteso** (`lib/risultato.ts`): vendite × 30% di margine meno la
spesa ADV, su `/analisi-campagne` (il conto riga per riga) e in home (un KPI).
Luglio: 98.951 € venduti, 14.030 di ADV, **risultato atteso 15.656 €**, la
pubblicità pesa il 14,2% sul venduto. Il venduto è quello **vero di Shopify** —
i ricavi dichiarati dalle piattaforme sono gonfiati e il margine lo sarebbe due
volte — ed è **tutto** quello del periodo, non solo l'attribuito: la pubblicità
si paga sul fatturato che l'azienda fa. La pagina ripete che **non è un utile**:
sotto non ci sono personale, logistica, commissioni e resi.

**Stato keyword da Google** — nuovo `AZIONE = "stati-keyword"`. Il giro `copy`
filtra `metrics.impressions > 0`, quindi una keyword **in pausa non arrivava
mai** (non ha impressioni per definizione) e nell'app restava "attiva" per
sempre: i bottoni Metti in pausa / Riattiva partivano da uno stato falso. Il
nuovo giro legge tutte le keyword senza filtro impressioni e senza finestra di
date — lo stato non è una metrica, non ha un periodo. Le negative si saltano.

> ⚠️ **Il null che azzera, di nuovo.** Il giro degli stati manda keyword SENZA
> metriche, e `salva()` fa update con tutti i campi passati: quei null avrebbero
> cancellato spesa e clic scritti dal giro dei numeri. I numeri ora si scrivono
> solo se ci sono, e `metricheAl` (la data della fotografia dei NUMERI) non si
> sposta su un giro di soli stati. Provato in produzione: 12,50 € e 9 clic
> sopravvissuti a un update di solo `PAUSED`.

**Città e provincia da Orders.** `cittaDedotta` arriva come **OGGETTO**
(`{ citta, da, prova }`), non come stringa: passarlo intero a Prisma fermava
l'intero import di 8.101 ordini alla prima riga utile. Si estrae `.citta`, e
`.da` va in `cittaFonte` (tag | prodotto). Presa anche `spedizione.provincia`,
sigla normalizzata che risolve meglio il problema per cui la città serviva: in
MI convivono "Milano" (1.000), "Milan" (42) e "MILANO" (14) — come testo erano
tre righe diverse. Fuori dall'Italia la provincia è spesso vuota (Francia,
Lussemburgo), quindi la città serve ancora.

> ⚠️ **Un campo NUOVO non entra negli ordini già presenti** se il controllo «è
> cambiato?» non lo guarda **e** il `select` non lo legge. Il primo giro aveva
> riempito la provincia su 2.068 ordini su 8.139 — solo quelli che cambiavano
> per altri motivi. Vale per qualunque campo si aggiunga in futuro.

> ⚠️ **Gli import lunghi vanno lanciati con `nohup … & disown`**: col solo `&`
> muoiono quando la shell finisce, a metà strada e in silenzio (successo due
> volte lo stesso giorno, a pagina 20 su 41).

**Scheda gruppo e campagna**: andamento **per mese espandibile** (`<details>`
nativi, niente JS, il browser ricorda l'apertura col tasto indietro) al posto di
404 righe giornaliere; grafico dei **dodici mesi** che dice quando si vende, con
lo storico degli anni precedenti sui mesi futuri — dichiarato come media di ciò
che è successo, non previsione; **budget della campagna madre** col flag «unico
gruppo attivo» (se lo è, quel budget è di fatto suo e si dice quanto ne consuma;
se ce ne sono altri se lo dividono in base all'asta); keyword e parole cercate
**in rosso** quando spendono senza rendere, con **Escludi** che mette in coda la
negativa (diversa dalla pausa: vale anche in futuro, su tutta la campagna); e le
due tabelle dichiarano che **non seguono il periodo scelto** — sono fotografie a
finestra fissa, e chi chiedeva 7 giorni leggeva la spesa di un mese.

**Tutte le tabelle ordinabili** con un componente solo montato nel layout
(`TabelleOrdinabili.tsx`): ordina ciò che è già in pagina, senza toccare il
database, e capisce i numeri all'italiana (`1.234,50 €`, `12,3×`) e le date —
senza quello "1.000" finiva prima di "9". `data-no-ordina` esclude le tabelle
dove l'ordine **è** l'informazione.

**Il bottone Sincronizza** sembrava rotto e non lo era: la corsa dura una
ventina di secondi e la pagina restava immobile, senza un segnale. Ora si
disabilita, gira e dice «Sincronizzo…»; sotto, la data in due forme («2 ore fa ·
02/08/2026, 06:08») che diventa arancione dopo tre giorni di silenzio. E quando
non cambia niente dice «già aggiornato, 634 documenti» invece del criptico
«nuovi 0 · aggiornati 0», che somigliava a un fallimento.



### Il budget di vendita arriva da Deluxy Budgets (01/08/2026)

**Il tetto pubblicitario non nasce qui**: nasce dal budget di vendita della maison, che vive in
**deluxy-budgets** — `advConsentito = vendite del mese × % decisa in /spese`. Fino a oggi questa app
ne teneva una **copia propria**, la tabella `BudgetMensile` importata a mano dal foglio «Budget adv»
del Monitoraggio, e non parlava con nessuno. Al momento di collegarle la copia locale conteneva
**nove righe in tutto** — giugno, luglio e agosto per i tre siti — quindi **da settembre in poi qui
non esisteva nessun tetto di spesa**, mentre Budgets sapeva già quanto si poteva spendere fino a
dicembre.

- Client `src/lib/budgets.ts` → `GET /api/v1/maison?anno=` di Budgets, chiave **`BUDGETS_API_KEY`**
  (aggiunta all'ambiente di produzione il 01/08/2026; si risolve con `chiave()`, quindi vale anche
  dalla cassaforte del Hub);
- l'abbinamento **sito → maison** sta scritto in un punto solo (`MAISON_DI_SITO`): `gifts`→Deluxy.it,
  `cake`→CakeDesign.me, `flowers`→Deluxyflowers.com. Verificato end-to-end: ADV consentito 2026
  70.417 € · 18.180 € · 47.224 €;
- in cima a `/budget` il componente `BudgetUfficiale` mostra **tutti e dodici i mesi**: vendite a
  budget, % ADV, ADV consentito, e accanto il budget calcolato qui dal ROS con la **differenza**.

> **Le due cifre restano affiancate e non fuse, di proposito.** Sono due strade per lo stesso numero
> — qui il ROS (vendita prevista ÷ ritorno atteso), là una percentuale sulle vendite — e dove si
> discostano la differenza è **una domanda da fare**, non un errore da nascondere sotto una media.
> Su agosto per esempio coincidono quasi all'euro (6.702 contro 6.700), perché un ROS di 7,46 è
> l'inverso del 13,4%: ma è una coincidenza di derivazione dalla stessa fonte, non un collegamento.
> Un mese senza riga importata mostra **—**, non zero: non è un mese a budget zero, è un mese che
> nessuno ha ancora caricato.

### Il 29/07/2026 (questa sessione)

**Gli asset dicono quanto hanno speso e reso.** Prima non lo dicevano: i 296
sitelink, 129 callout, 4 snippet e 121 immagini in tabella avevano **zero**
clic, zero impressioni, zero spesa. Non era una finestra temporale sbagliata —
`leggiAsset()` nello script Google non chiedeva **nessun** `metrics.*`: mandava
l'anagrafica degli asset, non la loro resa. Alla domanda «quale sitelink rende
di più» non esisteva risposta, né sugli anni né sull'ultimo mese.

Ora la query chiede anche spesa, clic, impressioni, conversioni e valore, con
`segments.date` **solo nella WHERE** — così Google aggrega il periodo in una
riga per asset invece di spaccarlo per giorno. Finestra in `GIORNI_ASSET`
(costante nuova, separata da `GIORNI_COPY`: quella domanda si fa su anni, non su
un mese). Se la vista non regge le metriche — `customer_asset` spesso no — si
ripiega sulla sola anagrafica **dicendolo nel log**, invece di far credere che
l'asset non abbia speso niente.

> ⚠️ **Il null non deve azzerare il numero buono.** `salva()` in
> `ingest/copy/route.ts` fa `update({ data })` con tutti i campi passati: se il
> giro ripiegato sull'anagrafica avesse mandato `spesa: null`, avrebbe
> **cancellato** i numeri del giro riuscito, e la tabella avrebbe detto che quel
> sitelink non ha mai speso niente. I numeri degli asset ora si scrivono **solo
> se ci sono** (`numeriAsset`, costruito campo per campo). Provato davvero in
> produzione: mandato l'asset con 12,34 € e 9 clic, rimandato lo stesso asset
> con tutti null, i numeri sono **sopravvissuti**; riga di test poi rimossa.

Le copie configurate dello script (5 lavori × 3 account) si rigenerano con lo
script generatore: legge e scrive in **latin1**, perché `google-ads-script.js`
ha byte non-UTF8 (box-drawing e accenti in encoding misto) e latin1 è l'unico
encoding byte-preserving 1:1 — modificarlo come UTF-8 corrompe i caratteri.

### Quanto c'è dentro davvero (verificato sul database, 29/07/2026)

| Cosa | Copertura |
| --- | --- |
| Metriche campagna | 4.265 righe, **19/06/2025 → oggi** (i 400 giorni del primo caricamento) |
| Metriche gruppo | 3.472 righe, 23/06/2025 → oggi · 49 gruppi |
| Termini di ricerca | 814 righe, **solo 28/06 → 28/07** (tetto `MAX_TERMINI = 300`) |
| Titoli / descrizioni | 622 / 183 · solo etichetta BEST/GOOD/LOW, nessun numero |
| Campagne | 30 attive · 147 in pausa · **0 bozza · 0 in lancio** |

Le campagne «da lanciare» non stanno in bozza: bozza e in-lancio sono **vuote**,
il serbatoio vero sono le **147 in pausa**.

### Il 28/07/2026

**Vendite Shopify sulla scheda campagna.** Sotto i gruppi c'è il venduto vero:
categorie, ordini, clienti nuovi contro di ritorno, scontrino medio, e i KPI
ROS reale (venduto ÷ spesa), costo di acquisizione (spesa ÷ clienti nuovi),
costo per conversione (spesa ÷ ordini). `lib/vendite-campagna.ts`.

> ⚠️ **Due legami che non vanno confusi, ed è il motivo per cui quel file
> esiste.** L'**attribuzione** è una sola: l'ordine porta scritto l'UTM della
> campagna (`Ordine.utmCampagna`), confrontato coi nomi normalizzati (lo stesso
> `normalizza()` dell'import) più l'id di piattaforma, che alcune campagne Meta
> scrivono al posto del nome. **Solo lì** si calcolano i KPI. Il **contesto** è
> altro: prodotto e lingua *dedotti dal nome* ("[Deluxy] Torte ROMA" → torte,
> italiano). Dice cosa vendeva il negozio mentre la campagna girava, **non** che
> quelle vendite arrivino da lì — nessun KPI ci si appoggia ed è scritto in
> pagina. Gli ordini con UTM che *somiglia* al nome ma non combacia (nomi
> vecchi, campagne divise in ENG/ITA) **non si attribuiscono**: si contano e si
> dicono. Misurato su Torte MILANO: ROS di cassa **2,42×** contro il **4,2×**
> dichiarato da Google.

Il legame di contesto sta in `LegameCampagnaShopify` (campagna → categoria,
lingua, negozio), dedotto e **correggibile a mano dalla scheda**: da lì
`origine = manuale` e nessun giro successivo lo sovrascrive, nemmeno se la
campagna cambia nome. Se il nome non nomina un prodotto (Brand Protection,
generiche) non si deduce niente.

**La lingua taglia i clienti**, non è un'etichetta: `ita` → paese IT, `eng` →
paese diverso da IT, `fra` → FR.

> ⚠️ **Il paese sull'ordine è quello di CONSEGNA, non del cliente.** Su
> deluxy.it e cakedesign.me si consegna in Italia anche quando compra un turista
> o un'azienda estera: su "[Deluxy] - Fiori Milano ENG" il filtro «diverso da
> IT» dava **0 ordini su 121**. Quando succede (meno di 3 su almeno 10) il
> filtro **si spegne da solo** e la pagina spiega perché — uno zero lì si
> leggerebbe come "questa campagna non vende". Su Flowers/Francia invece
> funziona: 18 ordini, tutti FR.

**KPI stimati** (`kpiStimati`), perché la maggior parte delle campagne non ha
nemmeno un ordine con l'UTM che combacia e senza di loro la scheda non direbbe
niente: costo per conversione, costo di acquisizione e ROS calcolati sulle
**conversioni dichiarate dalla piattaforma** e sullo scontrino medio del
contesto. Sono il **pavimento**, non la misura — Google e Meta contano anche
view-through e finestre lunghe, quindi i costi veri sono più alti. Se manca uno
dei due pezzi il numero resta vuoto: mezza stima ha lo stesso aspetto di un dato.

**Trend vendite** (`/trend`, `lib/trend-vendite.ts`): il venduto Shopify mese per
mese e dove sta andando, con proiezione dei prossimi 3/6/12 mesi.
`mese previsto = stesso mese dell'anno scorso × fattore`, dove il fattore sono i
mesi chiusi di quest'anno sugli stessi dell'anno prima — la stagione la porta
l'anno scorso, perché San Valentino e Natale **sono** l'andamento e una retta li
spianerebbe. Misurato 28/07: **+57%** sul 2025 (516.517 € contro 328.333 € su 6
mesi chiusi), anno 2026 stimato **1.204.366 €** contro 765.576 €.
Un mese con meno di 10 ordini l'anno prima non fa da base e resta vuoto; se
l'anno prima non esiste abbastanza (Cake ha aperto a metà 2025) si ripiega sulla
media dei mesi recenti **dichiarando che quella previsione non ha la stagione
dentro**.

**Viste salvate** (`lib/viste.ts`, `components/VisteSalvate.tsx`) su Campagne,
Parole cercate, Keywords e Dashboard per brand: filtri + ordinamento + periodo
con un nome, **condivise** (non per utente), una può essere predefinita.
Parametri salvati in forma canonica (chiavi ordinate, vuoti fuori) o "questa
vista è già attiva" non funzionerebbe mai; fuori i parametri che sono messaggi
di ritorno (`salvata`, `bloccata`, `aggiornamento`). Via d'uscita:
`?vista=libera`.

**Sync Drive: arriva in fondo, e importa le analisi.** Vedi la sezione dedicata
più sotto.

**Due stati campagna nuovi**: `in_lancio` (decisa e pronta, non ancora partita:
conta nei contatori delle vive e genera un'azione «Far partire» con owner
*utente*) e `defunta` (da non considerare mai più: fuori da elenchi, contatori,
`/api/v1/stato`, selettori e `GET /api/v1/campagne` — si chiede apposta con
`?defunte=incluse`). **La spesa di una defunta resta nei totali**: quei soldi
sono usciti davvero. Costanti `STATI_CAMPAGNA_VIVE` e `STATI_CAMPAGNA_IGNORATE`
in `dominio.ts`: le liste di stati non stanno più sparse nel codice.

**Meta si aggiorna da sola, ogni ora** — vedi "Connettori".

### Dati dentro (verificati sul database di produzione, 26/07/2026)

| Cosa | Quanti |
| --- | --- |
| Metriche giornaliere di campagna | **2.730** (19/06/2025 → 26/07/2026) |
| Ordini Shopify **tutti i brand** | **8.032** (01/01/2025 → 26/07/2026), 9.416 righe prodotto — gifts 5.982 · flowers 1.371 · cake 679 |
| Documenti Drive indicizzati | 653 |
| Analisi e audit dai Definitivi | 39 |
| Keyword e annunci | 635 |
| Settimane MKT 2025-2026 | 410 |
| Campagne | 32, di cui **20 agganciate** alla piattaforma (Gifts 12, Flowers 8) |
| Gruppi di annunci | 0 — tabelle pronte, si riempiono al primo giro di `AZIONE = "gruppi"` |
| Pubblici · Landing | 38 · 27 |

### I gruppi di annunci (dal 26/07/2026)

Il gruppo è un **livello vero**, non più un'etichetta attaccata alle keyword:
modello `Gruppo` + `MetricaGruppo` (gemelli di `Campagna`/`MetricaCampagna`,
una riga per gruppo e per giorno, upsert per (gruppo, giorno)).

- **Pagina `/gruppi`**: tutti i gruppi ordinati per spesa, filtri brand /
  campagna / periodo (7-30-90 gg), i due estremi in cima (chi tiene su la
  baracca e chi se la mangia). Voce in sidebar sotto Google Ads.
- **Scheda `/gruppi/[id]`**: KPI, quota di spesa dentro la campagna, andamento,
  metriche giornaliere, keyword e testi che vivono lì, stato dell'app
  (`attivo | vincente | da_valutare | in_pausa | escluso`, mai sovrascritto
  dall'import) e il bottone per metterlo in pausa **su Google**.
- **Scheda campagna**: blocco "Gruppi di annunci" con la quota di spesa di
  ognuno — la media di campagna nasconde il gruppo che brucia.
- **Operazioni `pausa_gruppo` / `attiva_gruppo`**: stessa coda approvata a mano,
  livello **L2** (spostano traffico), guardrail della campagna che li contiene
  (freeze incidenti, blackout 72h, max 1 L2/L3 a settimana contata dal registro).
  L'esito riporta `statoPiattaforma` sul gruppo. I gruppi di asset delle PMax
  **non si fermano da script**: l'app lo dice e lo script si rifiuta.
- Il ROAS del gruppo si legge sul **break-even del suo brand** (`lib/gruppi.ts`,
  `letturaRoas`): lo stesso 2,5 è buono per Cake e una perdita per Gifts.

### Scheda campagna, quattro blocchi nuovi (26/07/2026)

- **Quanto stiamo spendendo oggi**: spesa di oggi (dichiarata *parziale*, con
  l'ora in cui è arrivata), ieri a giornata piena, media dei 7 giorni prima,
  quanto resta del budget e il totale di oggi del brand con la quota di questa
  campagna. I numeri di oggi non si usano per decidere: servono ad accorgersi
  in tempo di un'anomalia.
- **Prossime azioni**: la tasklist. Ogni voce nasce da un numero della campagna
  (`lib/opportunita.ts`, 10 regole: gruppi mancanti, alert aperti, spesa a
  vuoto, sotto break-even, gruppo che si mangia la campagna, gruppo vincente da
  allargare, keyword a vuoto, apprendimento, valore-vs-numero, pacing, dati
  fermi, blackout) e diventa un'**azione vera** del kanban con un bottone. Le
  voci già in lista non si ripropongono.
- **Gruppi di annunci**: sempre visibile, con la quota di spesa di ciascuno.
- **Ultime modifiche**: recap unico di modifiche eseguite (paper-trail),
  operazioni in coda/fallite e voci di registro, in ordine di tempo.

> ⚠️ **Bug trovato e corretto lo stesso giorno**: `GuardrailCampagna`,
> `RotazioneCreativa` (e la nuova `ProssimeAzioni`) leggevano le metriche con
> `orderBy: data asc + take: 60`, cioè i giorni **più vecchi**. Su una campagna
> con un anno di storia il guardrail giudicava dati del 2025: alert A2/A3 mai
> mostrati, ROAS reale vuoto, gate bidding a zero. Ora si prendono i più
> recenti (`desc` + `take`) e si rimettono in ordine di tempo. **Chi aggiunge
> query di metriche: mai `asc` con `take`.**

### La scheda campagna è il posto dove si valuta (26/07/2026)

Ordine della pagina, dall'alto: **titolo con i bottoni di stato** (cambiarlo è
la cosa più frequente, non merita una scheda a parte) → KPI → **oggi** →
poi la valutazione, dal generale al dettaglio:

| Blocco | Risponde a | Da dove viene il dato |
| --- | --- | --- |
| Gruppi di annunci | quale pezzo tiene su la campagna | `AZIONE = "gruppi"` |
| Copertura delle ricerche | quanto altro c'è da prendere, e perché non lo prendiamo | `AZIONE = "metriche"` (quota impressioni) |
| Cosa ha cercato la gente | dove scivolano i soldi davvero | `AZIONE = "diagnosi"` |
| Dove finisce la spesa | telefono/computer, giorno, rete | `AZIONE = "diagnosi"` |
| Cosa vede chi cerca | titoli, descrizioni ed estensioni, con i buchi | `AZIONE = "copy"` + `"asset"` |
| Guardrail | cosa dicono le regole | calcolato |
| Prossime azioni | cosa fare adesso | tutte le fonti sopra |
| Ultime modifiche | cosa è cambiato e quando | paper-trail |

- **Quota impressioni** (`MetricaCampagna.quotaImpressioni / persaBudget /
  persaRank`, 0-1): distingue "limitata dal budget" da "limitata dalla
  posizione". Sono rimedi opposti — alzare il budget a una campagna che perde
  per rank non produce niente. Google non la dà su tutti i tipi di campagna: lo
  script prova con i campi e, se la query viene rifiutata, **riprova senza**.
- **Termini di ricerca** (`TermineRicerca`): i più costosi del periodo, col
  giudizio dell'utente (`nuovo | pertinente | da_escludere | escluso`).
  "Escludi" mette in coda una **negativa** L0 sulla campagna — non tocca Google
  da solo.
- **Segmenti** (`SegmentoCampagna`): una tabella sola per dispositivo, giorno e
  rete, sostituita a ogni passata (sono dati per periodo, non per giorno: se si
  sommassero la campagna sembrerebbe spendere il doppio a ogni import).
- **Prossime azioni** ora ha 18 regole: alle 10 di prima si aggiungono quota
  persa per budget, quota persa per rank, ricerche da escludere, segmento che
  pesa e rende sotto il pari, estensioni mancanti.

### "Aggiorna adesso" (26/07/2026)

Bottone su **Dati in arrivo** e in fondo alla scheda campagna.

- **Meta**: succede subito, è l'app che va a prendere i dati (`aggiornaAdesso`
  in `lib/azioni.ts` chiama la Graph API in-process).
- **Google**: **non si può lanciare uno Script da fuori** — nessuna API lo
  avvia, il verso è l'opposto. Il bottone mette una riga in
  `RichiestaAggiornamento`; **ogni** script, a ogni partenza e prima del proprio
  lavoro, chiama `GET /api/v1/aggiornamenti`, esegue quello che trova col
  periodo chiesto e riferisce su `POST /api/v1/aggiornamenti/:id/esito`.
  Quindi "adesso" = **alla prossima partenza**: per renderlo di minuti basta
  mettere la *Frequenza* di **uno** degli script su "ogni ora".
- Premere due volte non accumula richieste: la seconda ritorna la prima.
- In **anteprima** lo script non chiede e non serve niente.

> ⚠️ **Trappola pagata il 26/07/2026 (Cake, poi Flowers)**: un valore non
> numerico in `GIORNI_INDIETRO` (tipo `7 giorni`) faceva partire la query con
> `segments.date BETWEEN 'NaN-NaN-NaN'`, e Google la rifiutava. Peggio: il
> ripiego della quota impressioni si prendeva la colpa di **qualunque** errore,
> quindi il log diceva "quota non disponibile su questo account" e mandava
> fuori strada. Ora i numeri di configurazione si validano all'avvio (con
> avviso e valore di riserva), `dataIso` rifiuta un periodo non numerico con un
> messaggio esplicito, e il ripiego scatta **solo** su errori che nominano la
> quota. **Regola: un messaggio di ripiego non deve mai poter mentire sulla
> causa.**

### Ordini: si leggono da Deluxy Orders (26/07/2026)

Mancavano Flowers e Cake — c'erano solo i 2.426 ordini di deluxy.it presi
direttamente da Shopify. Ora tutti e tre i brand arrivano dal registro
centrale `deluxy-orders` con `npm run import:ordini-orders` (chiave di sola
lettura in `ORDERS_API_KEY`). Una fonte sola invece di tre token Admin.

- **Verifica di quadratura**: il venduto 2026 in Marketing coincide **all'euro**
  con quello dichiarato da Orders — 601.818 € su 3.415 ordini (gifts 426.182 ·
  flowers 135.816 · cake 39.820), esclusi annullati e rimborsati.
- **Due trappole già pagate**: i brand hanno nomi diversi nelle due app
  (`deluxy.it`/`Flowers`/`cakedesign.me` contro `gifts`/`flowers`/`cake`), e
  gli id no — Orders espone `gid://shopify/Order/123`, qui era salvato il numero
  nudo. Senza ridurlo i 2.426 ordini già presenti sarebbero **rientrati tutti
  come doppioni**.
- **Cosa non arriva**: annullati (esclusi per scelta: restano spesso "pagati" e
  gonfierebbero il fatturato — `--annullati` per averli), e netto merce,
  spedizione e sconto, che Orders non espone. Sulle righe già importate da
  Shopify **non vengono sovrascritti a null**.

### Connettori

- **Google Ads**: `scripts/google-ads-script.js` (**v2**, 26/07/2026) da incollare
  in Google Ads (Strumenti → Azioni collettive → Script), una copia per account e
  per lavoro. Google Ads esegue sempre `main()`: **il lavoro si sceglie con la
  costante `AZIONE`** — `metriche` (giornaliere + strategia d'offerta) ·
  `copy` (keyword e RSA) · `gruppi` (gruppi di annunci con spesa e resa, e
  gruppi di **asset** per le PMax) · `asset` (sitelink/callout/snippet/immagini
  sui 3 livelli) · `approvazioni` (stati di review, alert A4) · `esegui`
  (esegue le operazioni **approvate**) · `tutto`. Config in testa al file: `URL_APP`,
  `CHIAVE_API`, `AZIONE`, `BRAND`, `GIORNI_INDIETRO`, `GIORNI_COPY`,
  `INCLUDI_RIMOSSE`. Nessun developer token: gli Scripts girano dentro l'account.
  - **`BRAND` va impostato** (`flowers` | `gifts` | `cake`): i nomi tipo
    "DC1 Fiori Milano ENG" non dicono il marchio e finirebbero in "cross".
  - In **anteprima** lo script non manda niente all'app: prima della v2
    l'anteprima di `esegui` segnava le operazioni come eseguite senza averle
    eseguite (Google blocca le modifiche ma non le chiamate a internet).
  - Le keyword uguali in più gruppi vengono **sommate** prima dell'invio (l'app
    tiene una riga per campagna+keyword: prima vinceva l'ultimo gruppo letto), e
    gli id mandati all'app contengono l'account (`account:gruppo:criterio`), così
    tre account non si sovrascrivono a vicenda.
  - `esegui` legge la coda **senza filtro account** e salta — senza segnarle
    fallite — le operazioni di altri account; riconosce PMax/Shopping/Video;
    rifiuta i budget **condivisi** e i salti oltre `LIMITE_BUDGET_X`; se l'app
    non registra l'esito si ferma (prima poteva rifare la stessa operazione).
  - Caricamento storico: `GIORNI_INDIETRO = 400` **+ `INCLUDI_RIMOSSE = true`**
    (senza, la spesa delle campagne poi eliminate non entra mai), una volta sola.
  - **Gruppi di annunci**: `AZIONE = "gruppi"` manda **una riga per gruppo e per
    giorno** (finestra `GIORNI_INDIETRO`, come le campagne) a
    `POST /api/v1/ingest` nell'array **`gruppi`**. Le PMax non hanno gruppi di
    annunci: al loro posto arrivano i **gruppi di asset** (vista `asset_group`,
    `tipo = asset_group_pmax`).
  - Banco di prova con Google Ads finto: `scripts/prova-google-ads-script.js`
    (`node scripts/prova-google-ads-script.js`, 51 controlli).
- **Meta**: `src/lib/meta.ts`, logica in `src/lib/sync-meta.ts`, due porte:
  `POST /api/v1/sync/meta` (a mano, chiave di scrittura) e **`GET /api/cron/meta`
  chiamato dal cron di Vercel al minuto 7 di ogni ora** (`vercel.json`, dal
  28/07/2026). Meta non ha gli Scripts: è l'app che chiama la Graph API, e
  finché l'unica porta era la POST i numeri Meta si muovevano solo se qualcuno
  premeva un bottone — il 28/07 Google era a oggi e Meta fermo a ieri.
  - Finestra di **7 giorni**, non 1: Meta consolida le conversioni nei giorni
    dopo, quindi il numero di ieri cambia ancora.
  - L'endpoint è **chiuso** quando manca `CRON_SECRET` (impostato su Vercel il
    28/07), invece di essere aperto: un endpoint aperto per sbaglio non si nota
    finché non è tardi.
  - Il middleware lascia passare `/api/cron/`: col redirect a `/login` il cron
    prenderebbe un **307**, che per Vercel è una corsa *riuscita* con zero dati.
    È la stessa trappola che faceva risultare deluxy-budgets giù nel Hub.
  - Serve `META_ACCESS_TOKEN` (utente di sistema del Business Manager, non
    scade). Valore e conversioni **solo** da `omni_purchase`. Gli account sono
    già censiti in Impostazioni.
- Il salvataggio è condiviso: `src/lib/ingest-metriche.ts`. Google spinge
  (`/api/v1/ingest`), Meta viene interrogata, ma la logica di riconoscimento
  campagne e aggiornamento per giorno è la stessa.

### Un periodo solo per tutta l'app (28/07/2026)

`lib/periodo-condiviso.ts`. La scelta del periodo si **ricorda** (Impostazioni
`periodo.preset` / `periodo.da` / `periodo.a`, **condivisa** come le viste
salvate) e vale su dashboard, analisi periodo, scheda brand, **scheda
campagna**, lettura AI e dati in arrivo. Prima ogni pagina si teneva il suo:
si sceglieva "mese scorso" sulla dashboard e la scheda brand tornava a 30
giorni senza dirlo — due numeri letti a due minuti di distanza sembravano
confrontabili e non lo erano.

Gli indirizzi restano completi (`?preset=mese-scorso`): un link incollato
mostra quello che mostrava a chi l'ha copiato. La scheda campagna ha il suo
selettore, e KPI, gruppi, grafico e metriche seguono il periodo (prima era
inchiodata agli "ultimi 60 giorni registrati", che non è un periodo).

### Lo stato di un gruppo: il fatto prima del giudizio (28/07/2026)

> ⚠️ Un gruppo **fermo su Google** si leggeva «● Attivo» col pallino verde.
> Non era un dato sbagliato: `Gruppo.stato` è il **giudizio dell'app** (nasce
> "attivo" e l'import non lo tocca mai, apposta) e `statoPiattaforma` è **cosa
> dice Google**. Era la colonna a rispondere alla domanda sbagliata — chi la
> guarda vuole sapere se *sta girando*. Ora comanda il fatto («In pausa su
> Google», arancione) e il giudizio scende sotto («nell'app: Attivo»).
> Un posto solo: `presentazioneStatoGruppo` in `lib/gruppi.ts`. Riguardava 3
> gruppi su 49.

### Spesa e incasso per canale (scheda brand, 28/07/2026)

`numeriPerCanale` in `lib/brand-dati.ts`: la media di brand nasconde chi tiene
su la baracca e chi se la mangia (Gifts a giugno — Google 2.184 € a 3,46×,
Meta 345 € con **zero** incasso dichiarato). L'incasso è quello che il canale
**si attribuisce**, quindi di parte; le vendite Shopify **non si sanno
spezzare per canale** (l'UTM c'è su una minoranza di ordini), quindi il MER
resta un numero di brand e la tabella non finge di poterlo dividere.

### Le due tabelle della scheda campagna, e cosa farne (28/07/2026)

**Parole cercate** (`TerminiRicerca`) e **keyword** (`KeywordCampagna`) stanno
una sopra l'altra apposta: sono cosa ci hanno chiesto e cosa abbiamo comprato,
e la distanza fra le due è dove si nascondono i soldi. Colonne ordinabili
(parametri separati: `ord`/`verso` per i termini, `ordk`/`versok` per le
keyword — se li condividessero si riordinerebbero insieme).

> ⚠️ **Le parole cercate costavano la metà.** Google manda una riga per ogni
> coppia (parola × keyword): la stessa ricerca intercettata da due keyword
> arriva **due volte con la spesa spezzata**. L'app tiene una riga per
> (campagna, testo) e faceva `update` → vinceva l'ultima letta. Ora si somma in
> **due** punti (script prima di spedire + ingest, che non può fidarsi del
> mittente) e la riga dice «+N altre keyword, numeri sommati» (`keywordDiverse`).
> **I numeri già nel database restano sottostimati fino al primo giro con
> `AZIONE = "diagnosi"`.**

> ⚠️ **Le keyword stanno sotto il nome VECCHIO della campagna.** Quelle
> importate dal Monitoraggio hanno i nomi della 00.4 (`FIORI MILANO ENG`), la
> piattaforma usa i suoi (`[Deluxy] - Fiori Milano ENG`): col confronto esatto
> la tabella mostrava 60 keyword tutte a 0,00 €. Si confronta col nome
> **normalizzato**. E le righe dal Monitoraggio hanno l'incasso ma **non** il
> numero di conversioni: «spende a vuoto» vuol dire né conversioni **né**
> incasso, o una keyword che ha reso 3.817 € finiva fra quelle a vuoto.

### Le proposte dell'AI, e ideali vs specifiche (28/07/2026)

`lib/proposte-ai.ts` + `PropostaAi`. Per ogni keyword e ogni parola cercata
l'AI dice **cosa farne** (tieni · osserva · alza · abbassa · pausa · escludi ·
aggiungi) col numero da cui nasce la decisione e la fiducia dichiarata.

- **Propone, non decide**: la proposta resta scritta finché una persona non
  l'accetta, e accettarla **mette in coda** un'operazione da approvare. La
  catena app → coda → approvazione → script resta intera. Fiducia `bassa` =
  mostrata ma non eseguibile.
- **Niente pareri su dati che non ci sono**: sotto 10 clic *e* 15 € la parola
  non viene nemmeno mandata all'AI — l'azione è `osserva` e la decide il codice
  col motivo vero. Misurato: 22 giudicate, 70 lasciate a osservare.
- I numeri si **congelano** in `numeri`: una proposta riletta fra un mese deve
  dire su cosa era stata fatta.
- **`ideal` vs `specific`**: ideale = descrive quello che vendiamo e varrebbe
  altrove (`flower delivery in milan`); specifica = legata a un caso solo
  (concorrente, insegna, storpiatura, il nostro marchio). **Nel dubbio
  specifica**: una ideale sbagliata viene proposta a tutte le altre campagne e
  propaga l'errore. Da qui il blocco **«Ideali che qui mancano»**, che confronta
  solo le ideali, sulle *parole* e non sulla stringa, e mostra spesa e resa
  **dell'altra campagna** (là funziona, non è detto che qui funzioni).
  Per vederlo pieno serve aver fatto girare l'AI su **almeno due campagne dello
  stesso brand**.

**Escludere una keyword** dalla scheda: due bottoni, e la differenza conta —
`pausa_keyword` ferma quella keyword, `negativa` chiude anche le ricerche
simili, comprese quelle che oggi arrivano da altre keyword. Lo script esegue
entrambe dopo l'approvazione; le PMax non accettano negative da script.

> ⚠️ **Il testo con cui una keyword si mostra non è quello con cui esiste su
> Google**: il Monitoraggio ci attacca il tipo di corrispondenza, e in coda
> finiva `flower milan (match esatto)` — lo script avrebbe cercato una keyword
> inesistente e sarebbe tornato «bersaglio non trovato». `testoKeywordPulito`
> (in **dominio.ts**, non in azioni.ts: un file `"use server"` può esportare
> solo funzioni async, e il typecheck non lo vede) toglie solo una parentesi
> finale che contiene *solo* parole di corrispondenza.

### Sezioni dell'app

Dashboard (con le tessere dei brand in cima) · Lettura AI · Analisi periodo ·
Analisi · Stato account · Azioni · Campagne (+ lancio su Google Ads) ·
**Gruppi di annunci** · Landing ·
Pubblici · Copy & annunci · Keywords (+ operazioni keyword) · Meta & test ·
Ordini · Analisi per offerta · **Trend vendite** · Budget vendite/ADV · MKT vs 2025 · Operazioni ·
Occasioni · Cadenze · Storico errori · Memoria condivisa · Incongruenze ·
**Dati in arrivo** · Documenti Drive · Storico · Impostazioni · Dashboard per brand.

### Guardrail (dai Definitivi e dalle ISTRUZIONI di progetto)

In `src/lib/guardrail.ts` e `src/lib/copy-lint.ts`: classe TRAINO con
candidatura automatica, **alert A1-A5** (A4 incluso), change control L0-L3
(blackout 72h, ±20% budget, mai ven-dom su traino, rollback per L2/L3,
**max 1 L2/L3 a settimana**, **add-before-pause** da ERR-2026-001),
break-even ROAS per brand (Gifts 3,33 · Flowers 2,5 · Cake 2,0), freeze da
incidenti aperti, **check VALORE vs NUMERO** obbligatorio, lint copy 7.2/7.3.

### Scrittura verso le piattaforme

Mai diretta. Ogni modifica entra in coda (`OperazioneAdv`) come "da approvare",
il guardrail valida **prima** di accodare, e solo dopo approvazione manuale lo
script la esegue e riferisce; all'esito nasce la `Modifica` (→ blackout 72h) e
le verifiche +24h/+72h. Vale anche per keyword nuove, negative e campagne nuove
(che nascono **in pausa**: si accendono a mano dopo la checklist 4.1).

### API per le altre app

- `GET /api/v1/spesa` — quanto si spende **davvero**, con blocco `copertura`
  (chi alimenta, chi tace, giorni coperti, flag `completa`). Documentata nel README.
- `GET /api/v1/ordini`, `/api/v1/campagne`, `/api/v1/stato`, POST di ingest.
- Chiavi: `npm run chiave -- <nome> [--sola-lettura]`.

### Onestà sui dati

- `FreschezzaDati` avvisa quando le metriche si fermano (arancione da 2 giorni,
  rosso da 3), su dashboard brand, analisi periodo e scheda campagna.
- Pagina **Dati in arrivo** (`/ricezione`): chi manda, cosa, con quale chiave,
  e quali account censiti **tacciono**.
- `tipoConversione` distingue **vendite** da **lead**: le B2B hanno valore
  conversione 1,00 € e col ROAS sembrerebbero in perdita. Dedotto sul valore
  medio per conversione degli **ultimi 90 giorni** (la finestra conta: Torte
  MILANO ha 5,10 € di media storica ma 95 € oggi).

### Sync Drive: ripartibile, e le analisi diventano Analisi (28/07/2026)

Erano due problemi diversi.

**(a) Si fermava a metà.** Il 28/07 aveva toccato 179 documenti su 669 senza
lasciare niente nel registro. La colpa non era del Drive: era **una query per
file** — `findUnique` + `update` per ognuno, più una `update` a vuoto sugli
invariati solo per riscrivere `sincronizzatoIl`, più una `delete` per ogni file
sparito: ~1.350 andate e ritorno. Ora una lettura sola dell'indice, confronto in
memoria, `createMany` per i nuovi, `update` solo per quelli davvero cambiati,
una `deleteMany` per gli spariti. **Sugli invariati non si scrive più niente**:
la data dell'ultima sync si legge dalla corsa, non dall'ultimo documento.

La corsa si annota in **`SyncDrive` prima di cominciare**: anche una sync morta
lascia scritto che è morta. Se il tempo sta per finire (`DRIVE_SYNC_BUDGET_MS`,
45 s) si ferma da sola, segna dove era arrivata e **la prossima riparte da lì**;
una passata parziale **non cancella** i file mancanti (con un elenco a metà si
svuoterebbe mezzo indice). Provato davvero abbassando il budget a 4 s.

**(b) Le analisi su Drive non diventavano `Analisi`.** La sync indicizzava solo
`DocumentoDrive`; le `Analisi` le creava solo `scripts/deposita-analisi.mjs`,
cioè una sessione a mano. Ora `lib/analisi-drive.ts` crea un'Analisi per ogni
documento di categoria *analisi*/*audit* non ancora legato (chiave:
`Analisi.fileDrive = DocumentoDrive.percorso`, che è anche l'idempotenza). Dei
`.md`/`.txt` legge le prime righe come sintesi; degli `.xlsx` scrive che il
documento **non è stato letto**, invece di inventare.

> ⚠️ **Restano fuori archivi e documenti marcati `SUPERATO`**: la *categoria*
> non basta a tenerli fuori — un file in `.../Analisi/Archivio/` viene
> classificato `analisi`, perché la regola dell'archivio arriva dopo. Alla prima
> passata erano entrate 33 analisi già superate; il filtro è in
> `daNonImportare()`, replicato anche in `scripts/sync-drive.mjs`.

Numeri veri del 28/07: corsa completa **594 documenti in 24,7 s** (7 nuovi, 6
aggiornati, **101 spariti** che l'indice si portava dietro dalle sync morte, 25
analisi importate); seconda corsa 0 scritture.

## Da riprendere subito (17/08/2026)

I tre controlli lasciati il 10/08 sono **fatti** (verificati sul database il
17/08): le località arrivano (255 righe su 158 campagne), l'operazione
`attiva_keyword` su «flowers delivery milan» è **eseguita** l'11/08 05:40, e
gli script reincollati girano su tutti e tre gli account (versione
dell'11/08, con la prova a secco a 9/9).

Resta da fare, **fuori dall'app**:

1. **Reincollare `tutto.js` nei tre account** da
   `C:\Users\nicol\Downloads\deluxy-google-ads\` (copie del **15/08 09:18**,
   10 file): è l'unica cosa che manca perché la **storia giornaliera degli
   annunci** (`MetricaAnnuncio`, il pannello «finestre» sull'annuncio)
   cominci a riempirsi — al 17/08 la tabella ha **0 righe** e nessun account
   ha mai consegnato `annuncio-giorni`. Il lavoro `keyword-giorni` dentro
   `tutto` manda entrambe le tabelle, quindi basta `tutto.js`; chi ha
   schedulato anche i lavori singoli reincolli anche `keyword-giorni.js`.
   ⚠️ Nel file generato **CHIAVE_API e BRAND sono vuoti**: vanno rimessi a
   mano. Prima di rigenerare le copie: `node scripts/prova-script-google.mjs`.
2. **Le 15 `nuova_keyword` in attesa su `[Cakedesign] | Sales | ITA`**
   («torte roma / torino / napoli…», frase, da «Estendi con AI» del 15/08):
   sono in coda dal 15/08 06:35 e aspettano una persona che le approvi (o
   le annulli) da `/operazioni` — ora si può fare in blocco.
3. ~~**Sync Drive ferma dal 04/08**~~ — **fatta il 17/08 08:31** (644 doc,
   3 nuovi, 0 analisi: il Drive è fermo al 07/08, vedi fotografia). Resta
   aperta la scelta se darle un **cron Vercel** come `meta` e `ordini`: oggi
   dipende da una persona che se ne ricordi, e la staleness è silenziosa —
   l'app non distingue «nessun documento nuovo» da «nessuno ha sincronizzato
   da due settimane». **Un cron Vercel è fattibile**: `drive.cartella` è un
   **link a cartella Google Drive** e `drive.apikey` è presente, quindi
   `sincronizzaDrive()` prende il ramo `sincronizzaDriveApi()` e legge via
   API — non serve nessun disco locale. Servirebbe una route
   `/api/cron/drive` (esente dal middleware come le altre) e una riga in
   `vercel.json`. ⚠️ Attenzione al **budget di 45 s** (`DRIVE_SYNC_BUDGET_MS`):
   la sync è ripartibile apposta, il cron va scritto sapendo che una passata
   può finire «interrotta» e riprendere al giro dopo.

   ⚠️⚠️ **`npm run sync-drive` E il bottone «Sincronizza ora» NON LEGGONO LA
   STESSA COSA.** `scripts/sync-drive.mjs` è una copia standalone che dichiara
   di replicare `src/lib/drive.ts`, ma **ignora l'impostazione
   `drive.cartella`**: prende `process.env.DRIVE_ADV_DIR` o il default
   `G:\Il mio Drive\ADV DELUXY SRL`, sempre. L'app invece parte da
   `driveDir()`, che legge **prima l'impostazione** — oggi il link online. Le
   due strade combaciano solo finché la cartella montata da Google Drive per
   Desktop è davvero quella dell'impostazione: il giorno che divergono, la
   sync da riga di comando riscrive l'indice con il contenuto **di un'altra
   cartella**, e nessuno se ne accorge perché l'esito è «completata». La sync
   del 17/08 è passata dal **locale** (`Sync completata da: G:\…`), non
   dall'API. Il commento «tenere le due versioni allineate» in cima allo
   script è esattamente il debito che si sta pagando: la prossima modifica a
   `drive.ts` che tocchi la scelta della radice va riportata anche lì, o
   meglio, lo script dovrebbe chiamare `driveDir()`.
4. Verificare in Business Manager se `ads_management` si ottiene senza App
   Review (per accendere la scrittura Meta) — invariato dal 07/08.
5. Al primo giro dopo il reincollo del 15/08: aprire una scheda gruppo,
   cliccare un annuncio e controllare che le finestre 7g/mese/30g/anno
   abbiano numeri (e non «storia non ancora raccolta»); su `/ricezione`
   deve comparire il tipo `annuncio-giorni` per i tre account.

## MANCA

### Punti aperti al 01/08/2026 (in cima perché sono i più freschi)

- ~~**Date di FINE campagna**~~ — **ESCLUSA dall'utente il 05/08/2026**
  («data fine campagna non serve»). Verificato: 0 campagne su 230 hanno `fine`
  valorizzata, e resta così. Il disegno qui sotto si conserva solo perché il
  giorno che servisse non si riparta da zero. ⚠️ Conseguenza da tenere a mente:
  una campagna con end date su Google **si spegne da sola** e nell'app resta
  indistinguibile da un calo di spesa — `DC9 Regali B2B` scade il **31/08/2026**.

- **Il disegno, se un giorno servisse:**
  L'1/8 una sessione multi-agente ha scoperto live che `DC9 Regali B2B` ha una
  **end date 31/08/2026** su Google, ignota all'app (risulta attiva e senza
  scadenza). Una campagna con end date **si spegne da sola** quel giorno, e nel-
  l'app sembra solo che smetta di spendere — indistinguibile da un calo. L'utente
  ha chiesto di **registrare le date di fine per tutte le campagne**. La catena è
  rotta in **tre punti** e nessuno da solo basta: (1) `scripts/google-ads-script.js`
  non legge `campaign.end_date`/`start_date` (0 occorrenze); (2) `RigaMetrica` in
  `ingest-metriche.ts` non ha i campi; (3) `salvaMetriche` non scrive
  `Campagna.inizio`/`.fine`. ⚠️ **Trappola già individuata**: Google usa
  **`2037-12-30` come sentinella di «nessuna fine»** — va tradotto in `null`, o
  l'app si riempie di finte scadenze 2037. Un abbozzo (tipo + helper `dataCampagna`)
  era stato scritto e **poi tolto** per non lasciare codice a metà nel repo: si
  riparte da zero ma il disegno è questo.

- ~~**Tre APPEND ADV Gifts non indicizzati**~~ — **rientrato**: verificato il
  05/08/2026, l'indice ha 8 APPEND, i più recenti del **02/08** (Gifts 19:00,
  Cake 23:50, Flowers 04:01). La sync Drive è ripartita da sola. Restano validi
  i *contenuti* segnalati qui sotto (DC5 drift, policy Alcohol), che l'app
  continua a non vedere.

- **Il testo originale del punto, per il contenuto che resta aperto:**
  `ads/Definitivi/APPEND 00.2|00.3|00.4 ADV-Gifts 2026-08-01 2015.md`, da una
  sessione multi-agente (analisi Google live + Meta documentale + audit + 3
  verificatori ostili). La **sync Drive è fallita** (DB irraggiungibile, vedi
  sotto): rilanciare `npm run sync-drive` quando il Postgres risponde. Dentro,
  cose che toccano l'app: **DC9 end date** (sopra); **DC5 Roma italian** ha lingua
  targeting EN+IT mentre la scheda dice ITA (drift); **policy Alcohol** = 12
  annunci "Limited" su 10/12 campagne (critico, l'app non lo vede).

- **Break-even Meta con la DST Italia 3% — IN ATTESA DEL CUSTODE, non applicare.**
  Gli APPEND propongono BE Meta `3,33 × 1,03 = 3,43` per Gifts (DST dal 1/7/26).
  È la **proposta n.4 al custode, ancora APERTA**. L'utente ha deciso il 01/08 di
  **aspettare**: non toccare `MARGINE_BRAND`/`breakEvenRoas` in `guardrail.ts`
  finché non c'è risposta — cambia la soglia sopra/sotto di ogni keyword, gruppo,
  sitelink e del wizard.

- **Il Postgres condiviso rifiutava connessioni** (01/08 sera): `Can't reach
  database server … pooler.supabase.com:6543` e P2024 a raffica in dev. Con
  `connection_limit=5` la sola Sidebar fa ~8 query a pagina: due dev server sullo
  stesso DB lo saturano. **In produzione regge oggi perché il traffico è basso**,
  ma è il primo punto che cede. Candidato n.1 da alzare.

- ~~**Cron ordini una volta a notte**~~ — **fatto il 04/08/2026**: `20 */3 * * *`.

- **TikTok completamente scollegato** (0 account, 0 token, 0 consegne). Il
  connettore `lib/tiktok.ts` c'è e funziona, ma serve access token + advertiser id
  in Impostazioni, e **manca il cron** (staleness silenziosa come Meta pre-28/07).
  Da fare solo se su TikTok si spende davvero.

0. ~~**Token Meta non autorizzato sugli account**~~ — **RISOLTO il 29/07/2026.**
   Bastava assegnare i tre account pubblicitari all'utente di sistema in
   Business Settings (Utenti → Utenti di sistema → Aggiungi risorse → Account
   pubblicitari, permesso «Visualizza prestazioni» = `ads_read`). **Il token
   non è stato rigenerato**: non serviva.

   > ⚠️ **`403 (#200)` e `190` sono due guasti diversi e si curano in due modi
   > opposti.** Il `190 Invalid OAuth access token` è il token: scaduto o
   > sbagliato, va rigenerato. Il **`#200 Ad account owner has NOT grant…`** è
   > l'esatto contrario: il token è **valido e autenticato**, ma l'utente di
   > sistema non ha accesso a *quegli asset*. Si risolve in Business Manager,
   > non toccando il token — cercare di rigenerarlo non produce niente.

   Verificato subito dopo: **zero errori** sui tre account. Recuperato anche
   tutto lo storico: da 382 righe dal 28/01/2026 a **2.120 righe dal
   01/01/2025**, **42.300 €** di spesa, 69 campagne.

   | brand | campagne | righe | spesa |
   | --- | --- | --- | --- |
   | gifts | 49 | 1.360 | 35.036 € (83%) |
   | flowers | 13 | 431 | 3.896 € (9%) |
   | cake | 7 | 329 | 3.368 € (8%) |
   | **cross** | **0** | **0** | **0 €** |

   Flowers e Cake non hanno nulla fra luglio e dicembre 2025: le loro campagne
   Meta sono nate dopo, non è un buco da riempire.

   > ⚠️ **Chiedere UN account per id faceva perdere il brand.** `sync-meta`
   > costruiva l'oggetto account con `brand: undefined` senza guardare i
   > censiti: ogni sync mirata — un backfill, una prova — importava le campagne
   > senza brand, e quelle il cui *nome* non nomina il marchio finivano in
   > `cross`. Erano **451 righe e 12.339 €**, il 61% della spesa Meta,
   > invisibili in ogni vista per brand. Ora l'account passato per id eredita
   > il brand dai censiti, e le campagne già sbagliate si promuovono da sole al
   > primo giro utile — **solo da `cross` verso un brand noto**, mai il
   > contrario: un brand deciso a mano non si tocca. `cross` non vuol dire «di
   > tutti i marchi», vuol dire «non lo so».

   **Lo storico Meta prima del 28/01/2026 c'è, ma va preso a scaglioni.**
   `POST /api/v1/sync/meta` accetta `account`, `dal` e `al` oltre a `giorni`:
   servono quelli, perché `{giorni: 400}` muore in
   **`FUNCTION_INVOCATION_TIMEOUT`** (provato) e persino sei mesi su un solo
   account non ce la fanno. Misura vera: **un mese di un account = 3m06s**,
   120 righe, 5 campagne nuove (dicembre 2025).
   Il collo di bottiglia **non era Meta, era il salvataggio** — ed è stato
   tolto lo stesso giorno (vedi qui sotto).
   La route `sync/meta` **non ha `maxDuration`** (il cron sì, 60 s): se un
   giorno si vuole allungare la finestra, è lì che va messo.

### L'obiettivo del mese è quello del budget (31/07/2026)

La dashboard leggeva `VenditaMensile.vendite`, il piano **SALES GLOBAL** del
Monitoraggio. Per Flowers quel piano diceva **143.040 €** a luglio 2026 contro
**31.948 €** venduti davvero, e **2,08 milioni** sull'anno contro 140.252 € in
sette mesi: **quindici volte la realtà**.

Non era un errore di import — le quote mensili sommano a 1, il budget ADV è
proporzionale — ma un piano mai riallineato. E il numero giusto era già nello
stesso file, in un altro foglio: `BudgetMensile.venditaPrevista`, **30.000 €**
contro 31.948 venduti.

> ⚠️ **Un obiettivo che sbaglia di quindici volte non è un obiettivo severo: è
> un numero che non si può leggere.** La barra segnava 23% e sembrava un
> disastro mentre il mese stava andando bene.

| | prima | adesso |
| --- | --- | --- |
| Gifts | 104.440 € · 57% | **65.000 € · 91%** |
| Flowers | 143.040 € · 23% | **30.000 € · 110%** |
| Cake | 5.000 € · 133% | **8.000 € · 83%** |
| Totale | 252.480 € · 39% | **103.000 € · 96%** |

Il piano resta nel database e nella pagina Vendite: non guida più il semaforo.
Il totale ora si **somma dalle righe mostrate**, non da una query sua: se le due
strade divergessero, «Tutti i brand» non combacerebbe con la somma di quello
che ha sopra.

> ℹ️ **`VenditaMensile` non ha righe per il 2025, ed è giusto così: nel 2025 il
> budget non si faceva** (confermato dall'utente il 31/07/2026). Non è un import
> fallito, non c'è niente da riempire. I confronti anno su anno non passano di
> lì: il trend vendite usa gli **Ordini** (dal 01/01/2025) e «MKT vs 2025» usa
> `SettimanaMkt`.

### Una campagna nuova nasce da ciò che funziona (31/07/2026)

`/campagne/crea` (+ `lib/nuova-campagna.ts`). `/campagne/lancia` resta, ma è un
foglio bianco: chiede di ricordarsi a memoria quali parole rendono. Qui si
scelgono **brand → prodotto → città** e il resto arriva dallo storico.

- Le **categorie** sono quelle che il negozio vende davvero, col venduto a
  fianco (`servizio` escluso: spedizioni e gift card non si promuovono).
- Le **keyword** proposte sono solo quelle sopra il break-even **del brand**,
  con almeno 10 clic e 20 € alle spalle.
- Il pezzo che vale: **le keyword di un'altra città vengono riscritte**,
  traducendo la lingua — `fiori milano` (12,5×) → `fiori napoli`,
  `flower delivery in milan` → `flower delivery in naples`.
- Il traguardo è lo **stesso modulo di `/lancia`** e chiama `lanciaCampagna`:
  lint 7.2/7.3, coda, approvazione a mano, campagna che nasce **in pausa**. Un
  suggeritore che scavalcasse l'approvazione sarebbe un modo elegante di
  perdere il controllo.
- I **titoli** sono dichiarati per quello che sono — *usati dalle campagne
  affini*, **non «i migliori»**: Google non assegna un rendimento a quegli asset
  (tutti `NOT_APPLICABLE`) e fingere di saperlo sarebbe un numero inventato.

> ⚠️ **Trovato aprendo la pagina davvero**: `flowers delivery Como` veniva
> proposta **per Napoli**, perché Como non era fra le città riconosciute — e
> sarebbe finita in una campagna vera con la città sbagliata dentro. `CITTA_NOTE`
> ora ha 40 città, più `scartaSeAltraCitta()` che butta le keyword contenenti un
> luogo sconosciuto. **Chi aggiunge una città alle campagne la aggiunga anche
> lì.** Nel dubbio si scarta: un suggerimento in meno non costa niente.

### Impostazioni: due trappole sui token (31/07/2026)

> ⚠️ **La chiave del Drive si cancellava premendo «Salva».**
> `salvaApiKeyDrive` scriveva `valore: chiaveApi ?? ""`. La casella non può
> mostrare la chiave salvata — i segreti non si rileggono mai — quindi si trova
> **sempre vuota**: bastava premere Salva senza scrivere per spegnere la sync
> del Drive, in silenzio. E il placeholder prometteva già «lascia vuoto per non
> cambiarla»: promessa e comportamento andavano in direzioni opposte, e vinceva
> il codice. Ora il vuoto non tocca niente e c'è la spunta esplicita, come per
> chiavi AI, TikTok e credenziali Drive.

> ⚠️ **`[^@s]` non esclude gli spazi, esclude la lettera «s».** Due backslash
> mancanti nella validazione dell'email di impersonazione Drive: gli indirizzi
> con una s — `assistenza@`, `mario.rossi@` — venivano respinti come «non
> valida», e il messaggio dava la colpa all'indirizzo invece che al controllo.
> Misurato: 2 indirizzi normali su 4 rifiutati prima, 0 dopo.

### Gli ordini si aggiornano da soli (29/07/2026)

`GET /api/cron/ordini`, ogni notte alle **03:20 UTC** (`vercel.json`), più la
gemella a richiesta `POST /api/v1/sync/ordini` (chiave di scrittura). Logica
condivisa in `lib/sync-ordini.ts`.

Prima l'unico modo era `npm run import:ordini-orders` **dal PC di qualcuno**, e
il 29/07 la spesa era aggiornata a oggi e gli ordini fermi al **27**.

> ⚠️ **Due giorni di sfasamento non si vedono: si vedono dei rapporti sbagliati.**
> Gli ordini sono la metà «vendite» di ogni KPI — ROS reale, MER, costo di
> acquisizione. Con la spesa che corre e le vendite ferme, quei numeri risultano
> **peggiori del vero** e non lo dichiarano. È lo stesso difetto che aveva Meta
> finché l'unica porta era un bottone.

- Finestra di **7 giorni**, non 1: un ordine cambia stato dopo essere stato
  creato (rimborso, annullamento).
- Si **ferma da sola** a 45 s dei 60 di `maxDuration`, dicendo a che pagina è
  arrivata: il resto entra al giro dopo. Per i caricamenti storici lunghi resta
  lo **script**, che non ha il limite delle funzioni serverless.
- Serve **`ORDERS_API_KEY`** fra le variabili d'ambiente (impostata su
  Production il 29/07): senza, l'endpoint risponde 503 spiegandolo, invece di
  fallire in silenzio.
- La consegna si annota in `RicezioneDati` (`fonte: "orders"`), così **Dati in
  arrivo** sa dire anche degli ordini: una fonte che tace è esattamente ciò che
  quella pagina esiste per mostrare.

Provato in produzione: **45 ordini nuovi** (proprio il buco dei due giorni), 2
aggiornati, 74 invariati, 0 saltati, in 42 s. Ordini ora **8.080, fino a oggi**.

### L'import non fa più una query per riga (29/07/2026)

`salvaMetriche` faceva una `findFirst` **per ogni riga** per ritrovare la
campagna: con 30 giorni della stessa campagna erano 29 query che riscoprivano
ogni volta la stessa cosa, più una `findMany` di tutte le censite ogni volta
che un nome non combaciava, più un `update` di stato/budget ripetuto a ogni
riga. Su Postgres remoto con `connection_limit=5` l'attesa di rete era tutto
il costo dell'import.

Ora le campagne si caricano **una volta sola** in tre mappe (per id, per nome,
e le censite senza id), gli aggiornamenti di campagna si applicano **una volta
per campagna** invece che per riga, e gli upsert delle metriche vanno a gruppi
di **4 in parallelo** — quattro e non cinque: l'ultima connessione resta libera
per chi sta usando l'app in quel momento.

> ⚠️ **La campagna appena creata va rimessa subito nelle mappe.** Senza, la
> seconda riga della stessa campagna non la troverebbe e ne creerebbe un'altra:
> trenta giorni, trenta doppioni. È il motivo per cui il codice riscrive
> `perId`/`perNome`/`senzaId` dopo ogni create.

> ⚠️ **Chi accumula deve FONDERE, non sostituire** — pagata lo stesso giorno,
> poche ore dopo. Il ramo che annota stato e budget faceva `daAggiornare.set()`
> sovrascrivendo la voce: la riga 2 di una campagna cancellava il `brand` che
> la riga 1 aveva appena promosso, e la promozione non riscattava perché la
> cache in memoria diceva già il brand giusto. Il dato corretto spariva prima
> di arrivare al database. **È il rischio che questa ottimizzazione introduce**:
> passando da «una query per riga» a «accumula e scrivi in fondo», l'ordine
> delle scritture in memoria diventa qualcosa di cui rispondere.
> L'ha smascherata un numero: `cross` sceso al 41% invece che a zero era troppo
> preciso per essere un caso.

**Misurato sullo stesso lavoro**, un mese di un account Meta:
**3m06s → 35s** (120 righe a 1,55 s/riga contro 99 righe a 0,36 s/riga).
Ne guadagna anche ogni ingest quotidiano di Google, che passa dalla stessa
funzione.
1. **Chiave OpenAI** — la sezione `/ai` è pronta ma dirà che serve
   `OPENAI_API_KEY`: va nella cassaforte del Hub (progetto `deluxy-marketing`,
   più `HUB_KEYS_TOKEN` su Vercel) o come variabile su Vercel.
2. **Token Meta** — `META_ACCESS_TOKEN` su Vercel. Istruzioni: app su
   developers.facebook.com (tipo Azienda) → utente di sistema in Business
   Manager → assegnare i 3 account (Gifts 2802316249885506, Flowers
   965988141913909, Cake 1040175814157216) → token con `ads_read`.
   ⚠️ Il portfolio `1298043513875111` è **disabilitato da Meta**: mai usarlo.
   L'account `45888139` "Owned by deluxy.it" non si usa (ISTRUZIONI Gifts).
3. ~~**Script Google su Cake**~~ — **installato**: verificato il 29/07, Cake
   (846-090-5423) consegna dal 26/07, **27 consegne**, ultima il 28/07 alle
   10:45. Tutti e tre gli account hanno lavorato negli stessi giorni.
4. **Schedulazione: attiva su GIFTS, manca su Flowers e Cake** (verificato
   31/07). La prova è l'orario della prima consegna di ogni giorno:

   | | 28/07 | 29/07 | 30/07 | 31/07 |
   | --- | --- | --- | --- | --- |
   | **Gifts** | 09:00 | 09:46 | **03:47** | **03:47** ✅ |
   | Flowers | 10:19 | — | 07:56 | — |
   | Cake | 10:20 | — | 07:50 | — |

   Gifts gira due giorni di fila **all'ora identica**: è la firma di una
   schedulazione vera. Gli altri due hanno orari sparsi e **saltano giorni**:
   sono lanci a mano.

   ✅ **`AZIONE = "tutto"` ci sta, `copy` incluso**: il 31/07 Gifts ha fatto il
   giro completo in **22 minuti** (03:47 → 04:09) — anagrafica, diagnosi,
   metriche, gruppi, asset **e copy**. Il timore che gli ultimi due saltassero
   era infondato con `GIORNI_COPY = 30` e `GIORNI_ASSET = 90`: non serve
   spezzare in `G1`…`G7`.

   ⚠️ **Flowers ha lo storico corto**: parte dal **21/06/2025** invece che dal
   2024 come Gifts (20/05/2024) e Cake (27/06/2024). Su quell'account `S1`/`S2`
   non hanno fatto il giro da 800 giorni.
   ⚠️ **Non si risolve dal codice**: gli Apps Script non possono auto-programmarsi,
   la frequenza è una proprietà dell'account (colonna *Frequenza* nella lista
   degli script). Va impostata **su ogni account**, e `GIORNI_INDIETRO = 7`
   (800 solo per il caricamento storico, una volta sola).
   ⚠️ Con `AZIONE = "tutto"` i 7 lavori **non ci stanno** nei 30 minuti che
   Google concede: misurato il 26/07, le sole metriche di Gifts hanno preso
   31 minuti (10:06 → 10:37). `copy` e `asset`, ultimi in coda, rischiano di
   non arrivare **mai** senza che nessuno se ne accorga. Meglio una copia per
   lavoro, con frequenze diverse.
5. **Chiave Google Drive API** — `GOOGLE_DRIVE_API_KEY` per la sync del Drive
   **dal server**: da Vercel la cartella `G:\` non esiste. Senza chiave l'indice
   si aggiorna solo lanciando `npm run sync-drive` dal PC.
6. ~~**Ordini Flowers e Cake**~~ — **fatto il 26/07/2026**: arrivano dal registro
   centrale con `npm run import:ordini-orders`, non più da Shopify.
7. **Meta: scrittura** — il connettore oggi **legge** soltanto. Per scrivere
   servirebbe `ads_management` e la stessa coda approvata di Google.
8. **PR** — `scout-ui` è avanti di **477 commit** su `main`: una PR conterrebbe
   il lavoro di molte sessioni e tutte le app. Se serve una PR revisionabile,
   va fatto un branch nuovo con i soli commit di `deluxy-marketing`.
   `gh` non è installato su questa macchina.

## Trappole già pagate

- **Non buildare col dev server attivo**: la cache `.next` si corrompe
  ("Cannot find module './331.js'", pagine senza CSS). Fermare il preview,
  `rm -rf .next`, ricostruire.
- **`prisma generate` col dev server attivo** → EPERM sulla dll del query
  engine. Fermare il server prima di `db:push`/`generate`.
- **Heredoc bash e template literal** non convivono: `${...}` viene espanso
  dalla shell e corrompe i file. Scrivere blocchi con lo strumento Write o
  con Edit, non con `cat <<EOF`.
- **`DURING LAST_N_DAYS`** in GAQL accetta solo pochi valori fissi: con altri
  numeri lo script si rompe. Ora la query usa date esplicite (`BETWEEN`).
- **`apiVersion` fissata** negli `AdsApp.search`: Google ritira le versioni
  (v18 non è più supportata). Ora non è più specificata.
- **Nomi campagna diversi fra 00.4 e piattaforma** ("DC1 Fiori Milano ENG" vs
  "[Deluxy] - Fiori Milano ENG"): il primo import creò 12 doppie. Ora l'ingest
  confronta i nomi normalizzati (via prefissi in parentesi quadre, codici
  DC/DF/DT, eng=english, ita=italian).
- **Mai `deleteMany` globali** sul Postgres condiviso per pulire i test:
  cancellerebbe dati reali. Filtrare solo i record creati dal test.
- **`esporta-dati.mjs` non va importato** da altri script: eseguirebbe il suo
  codice azzerando il file. L'ordine tabelle sta in `scripts/tabelle.mjs`.
- **Mai una query per riga** su una funzione che gira su Vercel: è così che la
  sync del Drive moriva a metà (§ Sync Drive). Una lettura, il diff in memoria,
  scritture in blocco.
- **Il `name`/`value` di un bottone submit non arriva nelle server action**: il
  valore si lega con `.bind(null, valore)` e `formAction` (già così per gli
  stati campagna, il legame Shopify e le viste salvate).
- **Un redirect del middleware su un endpoint di servizio è un 307**, e per chi
  lo chiama (cron Vercel, pagina Stato del Hub) un 307 sembra "andato bene".
  `/api/health` e `/api/cron/` sono esentati apposta.
- **In Postgres `ORDER BY colonna DESC` mette i NULL per primi**: un `take`
  su una colonna con buchi pesca le righe senza numeri. Sempre
  `orderBy: { spesa: { sort: "desc", nulls: "last" } }` (11/08, 8 punti).
- **Un `take` su righe di tipi diversi ordinate per tipo taglia in ordine
  alfabetico**: «keyword» viene prima di «titolo», e con 1.038 keyword i
  titoli non entravano mai. Un tetto per tipo, non un tetto solo più alto.
- **Le azioni in blocco applicano la regola del singolo a tutto l'archivio**
  se non si passa il recinto (campagna+gruppo): 168 righe marcate, 53 attive
  su Google. Il form dichiara su cosa agisce e l'update si limita a quello.
- **Il log dentro Google Ads è il posto sbagliato dove scoprire un
  ReferenceError**: `node scripts/prova-script-google.mjs` prima di ogni
  rigenerazione delle copie — e una prova con query VUOTE non prova niente.

## Come riprendere

```bash
cd C:\Users\nicol\scoutwt\deluxy-marketing
npm run dev          # porta 3130
npx tsc --noEmit     # prima di ogni commit
```

Prima di fermarsi: aggiornare **questo file** e la memoria di progetto
(`progetto-deluxy-marketing.md`), come dice la regola 1 del repo.

## Rigenerare le copie dello script per ogni lavoro

Una copia per `AZIONE`, pronta da incollare in Google Ads. Da lanciare dopo
ogni modifica a `scripts/google-ads-script.js` — **prima**, la prova a secco
`node scripts/prova-script-google.mjs` (deve dire «lavori rotti: 0»):

```bash
cd deluxy-marketing && node -e "
const fs=require('fs');
const base=fs.readFileSync('scripts/google-ads-script.js','latin1');
const azioni=['metriche','copy','gruppi','asset','diagnosi','approvazioni','stati-keyword','keyword-giorni','esegui','tutto'];
const dir='C:/Users/nicol/Downloads/deluxy-google-ads';
fs.mkdirSync(dir,{recursive:true});
for(const a of azioni) fs.writeFileSync(dir+'/'+a+'.js', base.replace('var AZIONE = \"metriche\";','var AZIONE = \"'+a+'\";'), 'latin1');
console.log('scritte',azioni.length,'copie in',dir);
"
```

⚠️ **latin1, non UTF-8**: `google-ads-script.js` ha byte non-UTF8 (box-drawing
e accenti in encoding misto) e latin1 è l'unico encoding byte-preserving 1:1.
Leggerlo o scriverlo come UTF-8 corrompe i caratteri.
