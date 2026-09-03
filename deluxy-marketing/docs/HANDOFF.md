# Handoff — Deluxy Marketing

> Stato al **27/08/2026 (sera)**. Una finestra Claude nuova deve poter
> riprendere da qui senza altro contesto. Leggere prima il [README](../README.md)
> per cosa fa l'app; questo documento dice **dove siamo** e **cosa manca**.
>
> ⏱️ **RI-MISURATO IL 27/08 MATTINA** (i dettagli in FATTO, prima sezione). Cosa
> è cambiato rispetto all'elenco qui sotto, che è del 25/08:
> · la coda ha **3 fallite** (erano 1) e **1 approvata FERMA** su Meta dal 26/08
>   — la campagna «[Opera] ATC - VOLUME» è ancora accesa: su Meta esegue l'app,
>   e solo quando qualcuno preme. Adesso si vede dalla home.
> · **due allarmi della home dicevano il falso** («Cake mai partito», «sync 23
>   giorni fa»): corretti, erano una finestra troppo corta e una fonte sbagliata.
> · punti 5 e 6 **ancora aperti e invariati**: dati personali nelle colonne
>   (8.152 nomi, 6.486 email) e cinque segreti in chiaro in `Impostazione`.
> · la versione dello script la dichiara **un conto solo su tre** (Flowers).
> · 🆕 c'è il **censimento storico** delle campagne: fatto su Meta (89 campagne,
>   60.574 €, 22 mai viste dall'app), **da fare su Google** incollando lo script.
> · 🆕 **MANUALE DELLE FUNZIONALITÀ** (`docs/MANUALE-FUNZIONALITA.md` +
>   guida visiva `docs/manuale-funzionalita.html`, pubblicata come artifact):
>   il «cosa fa l'app» pagina per pagina. ⚠️ REGOLA: ogni funzionalità nuova o
>   cambiata si scrive lì nello stesso commit, con una riga nel Registro in
>   fondo, e si ripubblica la guida.
> · 🆕 **revisione di SICUREZZA**: ~120 prove dall'esterno, **zero buchi**
>   (401/403/307 dove serve). Quattro correzioni: la GET che faceva scrivere una
>   chiave di sola lettura, la traversata di percorso via `fileDrive`, l'OAuth
>   di Drive senza `state`, il freno sul login. Quattro accuse **refutate**
>   dall'ostile e non toccate. 🔴 Restano due cose da guardare A MANO: quanto è
>   lunga `MARKETING_APP_PASSWORD` e quali chiavi API sono attive e di chi sono.
> · **TikTok**: nel codice è pronto da settimane (connettore, cron, rotta,
>   pagina) e **non è mai partito** perché mancano due dati — token e advertiser
>   id. Misurato oggi: 0 advertiser, token assente, 0 consegne. Le istruzioni
>   sono in [docs/COLLEGARE-TIKTOK.md](COLLEGARE-TIKTOK.md): non c'è codice da
>   scrivere.
> · 🆕 **passata UX/UI con tre agenti** (desktop, telefono, ostile): 23 accuse,
>   **19 corrette**, 2 refutate. Sul telefono le pagine non scorrono più di lato
>   e i bersagli sono da 44px; su desktop le intestazioni restano a vista e la
>   prima colonna non scappa. Dettagli in FATTO, prima sezione.

> 🔴 **I punti aperti, RI-MISURATI sul database di produzione il 25/08 fra le 12 e le 13**
> (`/api/health` 200, `database: true`; query in sola lettura, poi il lavoro di
> oggi — vedi la prima sezione di FATTO):
>
> 1. **Le copie dello script vanno reincollate — ma adesso è l'APP a dirlo.**
>    Il problema vero non era reincollare: era che *nessuno poteva sapere* se
>    una copia incollata dentro Google Ads fosse vecchia o nuova. `lista_negative`,
>    `localita` ed `estensione` sono in `applica()` da settimane e **non sono MAI
>    state messe in coda** (0 righe di quei tre tipi, da sempre — ricontato oggi):
>    l'unico modo di provarle era spendere un'operazione vera su un account vero.
>    Dal 25/08 **la copia dichiara la propria versione e i tipi che sa eseguire**
>    a ogni giro di «esegui», e `/operazioni` lo mostra conto per conto.
>    ⚠️ **Oggi i tre conti risultano MUTI**, ed è corretto: le copie incollate
>    ieri sono precedenti a questa modifica. Vanno rigenerate
>    (`node scripts/genera-copie-google.mjs` → **fatto oggi**, 11 copie in
>    `Downloads\deluxy-google-ads`) e reincollate; `CHIAVE_API` e `BRAND` a mano.
>    Al primo giro di «esegui» il riquadro diventa verde da solo, uno per conto.
> 2. **Il doppione dell'annuncio sulla WORLD-ENG: ANCORA LÌ.** Contati oggi due
>    RSA `ENABLED` nello stesso gruppo «Luxury Flower Delivery - Worldwide»
>    (`821753433517` e `821974827836`). Vanno tolti a mano in Google Ads: l'app
>    non sa mettere in pausa un annuncio. Resta anche l'unica operazione
>    **fallita**, ferma dal 21/08 (`nuovo_annuncio`, `DUPLICATE_ASSET`).
> 3. **La landing della WORLD-ENG** — la campagna eroga e converte: 3 giorni,
>    **37,46 € spesi, 37 clic, 2 conversioni, 222,66 € di ricavi, ROAS 5,94×**
>    (23/08: 16,83 € → 135 € · 24/08: 16,89 € → 87,66 € · 25/08 a metà giornata:
>    3,74 €, 7 clic, 0 conversioni). Resta la domanda **editoriale**: una
>    campagna **mondiale in inglese** che atterra su un indirizzo italiano
>    (`/en/pages/fiori-in-consegna-oggi`). «Non è più rotta» e «è quella giusta»
>    sono due cose diverse.
>    ✅ **Il budget a 15 €/g è stato deciso DALL'APP, ed è tracciato tre volte.**
>    (Qui il 25/08 era stato scritto «chi l'ha abbassato non l'ha scritto da
>    nessuna parte»: **falso**, ed era stato guardato solo
>    `Campagna.budgetGiornaliero` — vedi la trappola in fondo.) La storia vera:
>    operazione `budget` `{"budget":15}` messa in coda dall'**utente** il 19/08
>    alle 10:04 (`prima` = «35 €/g»), **approvata** il 21/08 alle 05:55 insieme ad
>    altre sei, **eseguita** dallo script il 21/08 alle 06:17:10 con esito
>    «budget 35 → 15 €/g (confermato rileggendo)». C'è in `OperazioneAdv`, in
>    `Modifica` e nel `RegistroEvento`, **con tanto di avviso del change
>    control** al momento dell'accodamento («Budget oltre il 30% in un colpo…»).
>    ⚠️ **Ma resta un doppione**: una **seconda** operazione `budget` identica era
>    stata accodata 2 secondi dopo (10:04:26) ed è stata approvata ed eseguita
>    anche lei — «budget 15 → 15 €/g», un colpo a vuoto. È lo stesso schema del
>    doppione dell'annuncio del punto 2: **il doppio invio non è un caso isolato**,
>    e nessuna delle due volte l'app ha detto «questa è uguale a quella di prima».
> 4. ⚠️⚠️ **NON ERA CAKE: era GIFTS.** Il «310 € consentiti contro 1.324 € spesi»
>    scritto qui ieri **era sbagliato**, e indicava il brand sbagliato. Letto il
>    25/08 dalla pagina `/budget` in produzione (che legge `advConsentito` vivo
>    da Budgets — **è quello il tetto che comanda, confermato dall'utente**):
>    · **Deluxy.it / Gifts — 3.028 € consentiti, 3.903 € spesi: 129 % del tetto,
>      GIÀ OLTRE.** È qui che serve guardare.
>    · **Deluxyflowers.com — 5.150 € consentiti, 4.260 € spesi (83 %)**, ma di
>      questo passo si arriva a **5.282 €**: sfora a fine mese.
>    · **Cakedesign.me — 2.242 € consentiti, 1.438 € spesi: 64 %, dentro**, con
>      804 € che restano. La spesa (1.435,85 € contati sul database) era giusta;
>      il tetto no.
>    ⚠️ Da dove veniva l'errore: si erano confrontati numeri di **fonti diverse**
>    senza dirlo — la copia locale `BudgetMensile` (ferma al 23/07) e un
>    `advConsentito` letto male. La copia locale **non comanda**: la pagina la
>    mostra già come «vecchia copia importata dal Monitoraggio, tenuta solo come
>    archivio». Resta da toglierla di torno — e da guardare **Gifts**.
> 5. 🆕 **I dati personali sono ancora NEL DATABASE.** Lo schema Prisma e il
>    codice non hanno più `cliente` né `email` dal 24/08 — ma le **colonne
>    fisiche ci sono ancora**, con **8.152 nomi** e **6.486 email** dentro
>    (contate oggi su `information_schema`). È la trappola della correzione non
>    retroattiva: pulire il codice non pulisce quello che il codice ha già
>    scritto. Il comando è pronto e si rifiuta di partire a vuoto:
>    `node scripts/ordini-senza-dati-personali.mjs --togli`. **Va lanciato**
>    (cancella colonne su un Postgres condiviso: chiedere prima).
> 6. **Segreti in chiaro nella tabella `Impostazione`: sono CINQUE, non uno.**
>    `drive.service_account` (2.343 caratteri), `ai_chiave_anthropic` (108),
>    `drive.oauth_refresh` (103), `drive.oauth_client_secret` (35),
>    `drive.apikey` (39). Chiunque legga quella tabella li legge. Vanno spostati
>    (`scripts/segreti-fuori-dal-db.mjs`) **e ruotati**, perché sono già stati
>    in chiaro.
> 7. ✅ **CHIUSO IN GIORNATA — l'indice di Drive adesso si allinea da solo.**
>    Era stato scritto qui che `sync-drive` «gira solo a mano e da questo PC
>    perché legge `G:\…`, che su Vercel non esiste». **Sbagliato**, e
>    l'utente l'ha corretto in un colpo: *l'app è già collegata a Drive, infatti
>    ci scrive*. Vero — il ponte ci deposita APPEND e RISULTATI ogni sera.
>    Guardando meglio: `sincronizzaDrive()` **sceglie da sé la strada**, e se la
>    cartella è configurata come URL/id di Drive (lo è) con la chiave API (c'è)
>    usa l'API, non il filesystem. Il percorso `G:\…` è solo il ripiego dello
>    sviluppo locale, ed è **lo script standalone** `npm run sync-drive` l'unico
>    legato al disco — è quello che era stato lanciato il 17/08, ed è da lì che
>    nasceva l'equivoco. **Mancava soltanto il cron**, e adesso c'è:
>    `/api/cron/drive`, ogni giorno alle 06:10 UTC — e dalla sera del 25/08,
>    dopo la sync, **rielabora in scheda grafica** le analisi nuove (2 per giro):
>    vedi la prima sezione di FATTO.
>    Provato davvero, non dedotto: chiamata all'endpoint con la sua chiave →
>    `radice: "drive:1VENQ…"` (cioè **l'API**, non il disco), 659 documenti, 5
>    nuovi, 1 analisi, `interrotta: false`. In produzione l'endpoint esiste e
>    risponde **401 senza chiave**.
>    ⚠️ `maxDuration` è **300**, non 60 come gli altri cron: il budget interno
>    (45 s) copre solo la visita, la scrittura sul database sta fuori, e la
>    passata vera ha impiegato **68 s**. Con 60 la funzione morirebbe proprio
>    nella fase che non sa riprendere.

> ⚠️ Una nota su come si legge un handoff: **tre** affermazioni di questa testata
> sono state scritte il 25/08 e **smentite dai dati lo stesso giorno** — «il tetto
> sforato è di Cake» (era di Gifts) e «il budget l'ha abbassato qualcuno senza
> scriverlo» (l'aveva deciso l'utente dall'app, tracciato tre volte), e «la sync
> di Drive può girare solo da quel PC» (l'app è collegata a Drive via API e ci
> scrive ogni sera: mancava il cron). In tutti e
> tre i casi l'errore è lo stesso: **si era guardato in UN posto solo** — una
> copia locale invece della fonte, una colonna di stato invece dello storico, uno
> script standalone invece della funzione che l'app usa davvero. La regola: prima
> di scrivere «non risulta» o «non si può», dire **dove** si è guardato.

>
> ✅ **Sano, ricontato oggi**: coda **0 in attesa · 0 approvate · 96 eseguite ·
> 7 annullate · 1 fallita**; **0 consegne non-ok** in 10 giorni; ordini da
> Orders alle 09:20 (**8.462**); Meta ogni ora (11:07); Google su tutti e tre i
> conti stanotte (Cake 02:38 · Gifts 03:47 · Flowers 05:14).
> Il **censimento delle negative si RIPETE da solo**: **92.731** parole escluse
> (Gifts 70.106 · Flowers 18.357 · Cake 4.268), **tutte agganciate alla loro
> campagna** (0 orfane su 92.731) e riviste stanotte. Una sola campagna Google
> attiva non ne ha nessuna: `[Deluxyflower] Brand protection`.
> Campagne: Google **21 attive · 140 in pausa**; Meta a mezzogiorno diceva
> **10 · 58**, ma era il difetto degli stati congelati (vedi FATTO): dopo la
> correzione sono **8 · 61** — e degli 8, **2 sono i fantasmi senza id** (vivi
> nel database, esclusi dal file per il custode), quindi le accese vere sono **6**.
> Spesa 7 giorni: Google Flowers 969 € · Gifts 710 € · Cake 233 €;
> Meta Flowers 318 € · Cake 131 € · Gifts 109 €.
>
> ✅ **Due dei tre scostamenti d'architettura sono chiusi NEL CODICE**: il
> `middleware` adesso risponde **503** su Vercel se manca `MARKETING_APP_PASSWORD`
> (fail-closed, riletto oggi in `src/middleware.ts`), e lo schema non porta
> più i dati personali. Ma vedi il punto 5: il codice è pulito, il database no.

> 🏛️ **ARCHITETTURA (OBBLIGATORIA, Standard Deluxy §7)** — Il ruolo di QUESTA
> app: **la memoria e il comando della PUBBLICITÀ**. Possiede — ed è l'unica a
> possedere — campagne, gruppi, keyword, **parole escluse**, testi e asset degli
> annunci, località di targeting, landing censite, la **coda delle operazioni**
> con la sua approvazione, e l'indice dei documenti ADV su Drive. La **spesa**
> pubblicitaria è sua: le altre app la leggono da `GET /api/v1/spesa`, non la
> ricalcolano.
>
> Cosa NON possiede, e legge da chi la possiede: il **venduto** (Deluxy Orders,
> via API ogni 3 ore), il **budget di vendita e il tetto ADV** (Deluxy Budgets,
> via API, con la ripartizione per piattaforma). ⚠️ Il tetto è `advConsentito`,
> **non** `budgetPubblicato` — vedi la trappola in FATTO: un campo non si sceglie
> dal nome. Il **margine** e la **quota fornitore** non si toccano: non sono di
> questa app.
>
> ✅ **I tre scostamenti sono stati AFFRONTATI il 24/08 pomeriggio** — sotto
> restano descritti perché la storia serva, ma vedi la sezione in FATTO per
> cosa è stato fatto e per **i due passi che restano a una persona**: togliere
> le due colonne personali (il comando è pronto) e **ruotare le credenziali**.
> 1. **Un segreto in chiaro**: l'impostazione `drive.service_account` contiene
>    la chiave privata del service account Google — 2.343 caratteri, leggibili
>    da chiunque legga quella tabella. Va spostata in una variabile d'ambiente
>    (o nella cassaforte del Hub) **e ruotata**, perché è già stata in chiaro.
> 2. **Una copia di verità con dati personali**: `Ordine` tiene **8.446** ordini
>    dal 01/01/2025, di cui **6.486 con l'email** del cliente e **8.152 col
>    nome**. Per mettere la spesa accanto all'incasso servono importi, data,
>    brand e attribuzione: nome ed email non servono a nessuna schermata di
>    questa app, e replicarli allarga la superficie senza dare niente. Il
>    riferimento per id resta giusto, i campi personali no.
> 3. **Password fail-OPEN**: in `middleware.ts`, se `MARKETING_APP_PASSWORD`
>    manca l'interfaccia resta **aperta**. In sviluppo va bene; in produzione una
>    variabile persa spalanca l'app invece di chiuderla. Il verso giusto è quello
>    di Merchandising: **503** su Vercel quando la password non c'è.

## Ri-misurato il 24/08 a mezzogiorno (sola lettura)

- **Produzione = codice**: health `200`, `fra1::fra1`, `database: true`; badge
  della dashboard **«24 giorni su 31»** — le due correzioni di stamattina sono
  vive (fuso di Roma e ritmo sul tempo trascorso).
- **Il reincollo non è avvenuto**: tre giri completi stanotte, **zero consegne
  `negative`**, archivio parole escluse a **0 righe** (vedi punto aperto 1).
- **Coda ferma dov'era**: 0 in attesa · 0 approvate · 92 eseguite · 7 annullate
  · **1 fallita** (`nuovo_annuncio`, `DUPLICATE_ASSET`, dal 21/08).
- **Consegne sane**: Meta ogni ora (11:07), ordini alle 11:20 (**8.446**),
  **0 consegne non-ok** in 10 giorni.
- 🧹 **Pulite due consegne di prova** di tipo `negative` rimaste dalla sera del
  23 (chiave `prova-negative-tmp`): erano le mie, mi erano sfuggite quando
  avevo cancellato righe, censimento e chiave. Ora le consegne `negative` sono
  **0**, così la prima vera si riconosce a colpo d'occhio.

## Ri-misurato la sera del 23/08 (sola lettura, prima di lavorare)

Un handoff si ri-misura, non si rilegge. Query dirette sul database di
produzione + `/api/health` (`200`, `fra1::fra1`, `database: true`).

- **Coda**: 0 in attesa · 0 approvate · **92 eseguite** · 7 annullate · **1
  FALLITA**, ferma lì dal 21/08: `nuovo_annuncio` su «Luxury Flower Delivery -
  Worldwide», `DUPLICATE_ASSET` (un titolo ripetuto dentro l'annuncio: Google
  rifiuta l'annuncio INTERO). Il difetto è chiuso nel codice, la riga fallita no.
- **Meta scrive davvero**: le due operazioni delle 17:01/17:02 risultano
  eseguite con la rilettura dentro l'esito (`PAUSED`, `3500` centesimi).
- 🔴 **Le dieci negative della WORLD-ENG (16:17) erano tutte «con dubbio»**:
  ognuna diceva «rileggendo la campagna non risulta ancora: ricontrollare al
  prossimo giro» — e **nessuno poteva ricontrollare**, perché il giro dopo non
  guardava le negative. È il punto da cui nasce il lavoro di stasera.
- **Consegne**: Meta ogni ora (21:07), Google 19:04-19:17 su tutti e tre i
  conti, ordini 18:20 (**8.440** ordini). **0 consegne non-ok in 10 giorni.**
- **Campagne**: Google 20 attive · 1 in pausa · 1 bozza · 140 defunte;
  Meta 7 · 57 · 5.
- **Spesa 7 giorni**: Google Flowers 1.191 € · Gifts 876 € · Cake 307 €;
  Meta Flowers 405 € · Cake 163 € · Gifts 149 €. ⚠️ **Cake resta il punto 4**:
  470 € in sette giorni contro i 310 € consentiti per tutto agosto.

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

> **Aggiornamento delle 15:55 del 17/08** (stesse query, sola lettura). Cosa è
> cambiato rispetto alla mattina:
> - **Produzione = codice**: deploy `deluxy-marketing-1l5ocf6q8` delle 15:56 =
>   commit **`ea919a4c`** (EU political ads + «Rimetti in coda», vedi FATTO in
>   cima). Health `200`, `fra1::fra1`, `database: true`.
> - **Coda vuota**: 0 in attesa · 0 approvate · **63 eseguite** · 5 annullate.
>   Le 15 `nuova_keyword` «torte roma/torino/…» sono state **approvate alle
>   14:01 ed eseguite alle 14:04** su Cake (846-090-5423), tutte ok.
> - 🔴 **PUNTO APERTO — la campagna nuova**: `[Deluxyflowers] - WORLD - ENG`
>   (35 €/g, 15 keyword + 1 RSA) messa in coda alle **14:01**, approvata alle
>   14:01, **«eseguita» alle 14:08** su Flowers (825-518-1560) — e **su Google
>   non esiste**: nell'app è senza `idEsterno`, senza `statoPiattaforma`, senza
>   `account`, e l'anagrafica di Flowers arrivata **alle 14:08:12** (35
>   campagne) non la nomina. Il registro caricamenti di Google Ads dice il
>   perché: **17 righe rifiutate, «Missing value in EU political ads»** sulla
>   riga della campagna, e le altre 16 cadono di conseguenza. Correzione in
>   `ea919a4c` (colonna `"EU political ads": "no"` in `creaCampagna`), **copie
>   dello script rigenerate alle 15:57** in `Downloads\deluxy-google-ads` — **da
>   reincollare**, poi «Rimetti in coda» su `/operazioni` → approvare → Esegui.
>   ⚠️ Il valore `"no"` non è ancora stato provato su un nostro account (le
>   fonti si contraddicono, vedi FATTO): se il registro risponde «Invalid value
>   in EU political ads» l'alternativa è il booleano `false`.
> - **`annuncio-giorni` arriva** da tutti e tre gli account (29 consegne),
>   `MetricaAnnuncio` **5.157** righe: lo script del 15/08 è nei tre account
>   (reincollato dall'utente, vedi «carico storico a 90 giorni»).
> - Ultime consegne Google: Gifts 12:20 · Cake 13:56 · Flowers 14:13 (un giro
>   completo dopo il lancio); Meta 15:07 (ogni ora); ordini 14:20 (**8.350**).
>   **0 consegne non-ok** in 10 giorni. `MetricaKeyword` 24.070,
>   `MetricaCampagna` 9.056.
> - Campagne Google: 19 attive · **4 in pausa** (fra cui la WORLD-ENG, che
>   nell'app esiste e su Google no) · 1 bozza · 138 defunte; Meta 6 · 59 · 4.
>   `LandingPage` ancora **27** (il censimento non è stato usato per
>   registrarne). Sync Drive: ultima 08:31, completata, 644 documenti.

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

### ⭐⭐ GLI ANNUNCI META SI VEDONO (creatività comprese) E IL LANCIO SA FARE CAROSELLO E CATALOGO (03/09/2026 sera)

- **Vista «Annunci su Meta (dal vivo)»** sulla scheda delle campagne Meta
  confermate (`AnnunciMeta` + `lib/meta-annunci.ts`): lettura VIVA dalla
  Graph API — nessuna copia in DB (Standard §7) — con miniatura della
  creatività, formato dedotto (immagine/video/carosello/catalogo), testi,
  stato effettivo e ad set. ⚠️ Dichiarato il limite vero: le **bozze di Ads
  Manager mai pubblicate NON esistono per l'API** — si vedono gli annunci
  reali in ogni stato, comprese le PAUSED (com'è nato provato su
  «Carosello ispirazione», 6 schede, attivo, con miniatura).
- **Formato dell'annuncio nel lancio**: radio *singolo | carosello |
  catalogo*.
  · **Carosello coi link ai prodotti** (`SchedeCarosello`): 2-10 schede,
  ogni immagine caricata UNA alla volta via `/api/interno/meta/immagine`
  (il form intero sfonderebbe i 4,5 MB di piattaforma), link/titolo/
  descrizione per scheda; nel form viaggia solo il JSON con gli hash.
  All'esecuzione: `child_attachments` con **CTA per scheda verso il SUO
  prodotto**. Lint 7.2/7.3 anche sulle schede.
  · **Raccolta dal catalogo**: gli insiemi di prodotti si leggono VIVI dal
  Business dell'account (`owned_product_catalogs → product_sets`, select
  riempito col catalogo vero al primo giro); all'esecuzione
  `promoted_object.product_set_id` sull'ad set + `template_data` e
  `product_set_id` sul creative. La **vetrina/Collection** con instant
  experience resta in Ads Manager: l'API non costruisce l'esperienza, il
  form lo dice.

### ⭐⭐ VIDEO A PEZZI, PUBBLICI NEL LANCIO, BRIEF AI META (03/09/2026 pomeriggio)

Tre pezzi in un giro, tutti provati in produzione:

- **VIDEO**: su Vercel il corpo di una richiesta ha un tetto DURO a 4,5 MB
  (misurato sulle fonti, non configurabile) — quindi niente server action:
  il browser AFFETTA il file (~3 MB a pezzo, `CaricaVideoMeta`) e
  `/api/interno/meta/video` (protetta dalla password come /interno/chiavi)
  inoltra ogni pezzo alla sessione chunked di Meta (start/transfer/finish,
  è Meta a dettare gli offset). Il `video_id` finisce nel campo nascosto
  del form; il creative diventa `video_data` con l'**immagine come
  COPERTINA obbligatoria**. Immagini: tetto corretto a **4 MB** — il 6 di
  prima sarebbe morto in un 413 di piattaforma prima del nostro controllo.
- **PUBBLICI**: colonna `idEsterno` su `Pubblico` (ALTER mirato, schema
  aggiornato), censimento delle custom audience da Meta
  (`lib/pubblici-meta.ts` — nel cron orario di Meta E col bottone
  «Censisci da Meta» su /pubblici, stessa funzione). Lo stato NON viene mai
  toccato dal censimento; nuovo stato **«estinto»** = gemello di «defunta»:
  sparisce da elenchi e lanci, si rivede solo col filtro. Nel modulo Meta i
  pubblici del brand (censiti, non estinti) si SPUNTANO e finiscono in
  `targeting.custom_audiences` dell'ad set; le esclusioni restano
  promemoria. Misurato: **142 pubblici censiti** (97 gifts · 24 flowers ·
  21 cake), 24 scelgibili sul lancio Flowers.
- **BRIEF AI sul modulo Meta** (`proponiBriefCampagnaMeta` +
  `BriefCampagnaMetaAi`): descrizione a parole → obiettivo, budget e
  livello, strategia, paesi/città, età/genere, copy, CTA compilati nei
  campi. I pubblici si spuntano a mano.

**Annotazione MISURATA sugli script Google**: l'utente ha reincollato le
copie aggiornate su Gifts e Cake — e le dichiarazioni lo confermano: tutti
e tre i conti (Cake 846-090-5423 · Gifts 248-656-1148 · Flowers
825-518-1560) si sono presentati da soli il 03/09 (14:04–14:17), versione
`2026-08-26`, **16 tipi** dichiarati. Se un'operazione accodata portasse
l'avviso «questa copia non sa eseguire X», è il segnale che serve la copia
`.2` — l'avviso in coda lo dirà da solo.

### ⭐ IL LANCIO META CARICA LA CREATIVITÀ E CREA L'ANNUNCIO (03/09/2026)

Il modulo Meta ha il campo **immagine** (JPG/PNG/WebP ≤6 MB;
`bodySizeLimit: 8mb` in next.config per le server action). All'accodamento
l'immagine va **subito** in `act_/adimages` — la libreria media: non
pubblica e non spende, è il gesto del drag in Ads Manager — e nei parametri
viaggia solo l'**hash** (niente base64 nel Postgres condiviso).
All'esecuzione approvata, dopo campagna e ad set, nascono anche **creative
e ANNUNCIO in pausa** (`object_story_spec` con `link_data`: message =
primo testo, name = titolo, CTA, image_hash). La **Pagina Facebook** si
indica nel modulo o la trova l'app con la regola del pixel
(`promote_pages`: una sola → si usa, di più → si elenca). Annuncio fallito
con campagna+ad set nati = esito **PARZIALE** che dice di NON riaccodare
(l'immagine resta in libreria). Senza immagine il copy resta un brief.
Video: ancora Ads Manager. ⚠️ Il giro Graph completo resta da collaudare
col primo lancio vero.

**Stesso giro, i brief Google puntano all'Ad Strength «Eccellente»**:
proponiBriefCampagna, proponiBriefGruppo e l'annuncio AI chiedono
**ESATTAMENTE 15 titoli e 4 descrizioni** con le leve dichiarate da Google
(keyword testuali in almeno 5 titoli, ogni titolo un angolo diverso —
i quasi-doppioni abbassano il giudizio —, 20-30 caratteri sfruttati,
descrizioni piene 70-90). Un brief che consegna meno di 15/4 lo dichiara
negli scarti invece di far contare a mano.

### ⭐ IL GRUPPO DI ANNUNCI NUOVO SI CREA DALL'APP, COL SUO BRIEF AI (03/09/2026)

Richiesta utente (una campagna non permetteva di aggiungere un gruppo):
**pagina `/campagne/[id]/nuovo-gruppo`** — nome del gruppo, keyword
(testo | match), annuncio RSA (titoli/descrizioni/URL) e il pannello
**«Compila con l'AI»** (`proponiBriefGruppo` in `lib/azioni-brief.ts`) che
riceve i gruppi già esistenti della campagna, le sue keyword che rendono e
le destinazioni in uso — e rifiuta i nomi omonimi. Bottone «Nuovo gruppo»
nella sezione Gruppi della scheda campagna (solo Google, solo confermata).

⭐ **Nessun tipo di operazione nuovo**: si accoda un `completa_campagna` —
lo stesso del lancio in due tempi — puntato sulla campagna viva. Lo script
è già idempotente: il gruppo che manca lo crea (`newAdGroupBuilder`),
keyword e RSA nascono dentro, l'esistente non si rifà. Un `nuovo_gruppo`
sarebbe stato un tipo in più da dichiarare/reincollare/allineare in tre
posti per un lavoro che il catalogo sapeva già fare.

Guardie: senza `idEsterno` si spiega che il gruppo del lancio arriva da
solo («Completa la campagna» del primo giro di anagrafica); lint 7.2/7.3;
regole RSA (3+ titoli ⇒ 2+ descrizioni + URL); coda L2 da approvare.
Provato in produzione end-to-end sul Cake: il brief AI ha compilato nome
gruppo, keyword e titoli.

**Nello stesso giro, verificata la campagna lead Cake** «[Cakedesign]
Torte Matrimonio Milano ITA» (creata 03/09 09:26): op `nuova_campagna`
eseguita alle 09:39 — «bulk upload INVIATO». Gruppo («Torte Nuziali su
Misura»), 9 keyword, 14 titoli e 4 descrizioni sono NEI PARAMETRI e
arrivano col flusso a due tempi: alla prima anagrafica che conferma la
campagna, l'app accoda «Completa la campagna» (da approvare). Non è un
guasto: è il disegno post-19/08. L'esito vero del caricamento sta in
Google Ads → Azioni collettive → Caricamenti.

### IL BRIEF DI CREAZIONE CAMPAGNA USA OPENAI (27/08/2026)

Scelta utente: l'AI che compila il brief su /campagne/lancia («Fatti
scrivere il brief dall'AI») deve essere **OpenAI**, non quella globale.
`chiediAllAi` ora accetta `fornitore` imposto dal chiamante (sopra la
scelta di Impostazioni → AI), e `proponiBriefCampagna` lo fissa a
`openai`. Tutto il resto — schede analisi, riconciliazione, proposte,
annunci — resta sul fornitore globale (oggi Claude `claude-opus-5`, che ha
gli structured outputs; misurato sul DB).
🔴 **Manca la chiave OpenAI**: non è né in Impostazioni né su Vercel
(`vercel env ls` controllato). Va messa dall'utente in **Impostazioni →
Intelligenza artificiale → OpenAI** (subito, senza deploy — ma quella
tabella è il posto dei «5 segreti in chiaro») oppure come variabile
**OPENAI_API_KEY** su Vercel + redeploy (più sicura). Provato in
produzione: il bottone risponde «Manca la chiave di OpenAI…» coi due
posti — che è anche la prova che il brief ora punta a OpenAI.

### ⭐⭐⭐ SICUREZZA: 120 PROVE DALL'ESTERNO (ZERO BUCHI) E 4 CORREZIONI (27/08/2026 sera)

**La domanda**: un estraneo può leggere dati richiamando dall'esterno API che
non gli sono consentite? **La risposta, misurata: no.**

#### Le prove, fatte davvero (~120 chiamate, locale + produzione)
- **401 senza chiave** su tutte e 39 le rotte; 401 con chiave inventata, vuota,
  troncata di un carattere, con spazi, in maiuscolo (l'hash è case-sensitive),
  con `Bearer` senza valore, con la chiave passata in query string.
- **403 su tutte e 26 le rotte di scrittura** usando una chiave di sola lettura
  creata apposta: **nessuna scrittura riuscita**.
- **Cron**: 401 in produzione con e senza `Bearer` sbagliato; 503 in locale
  (fail-closed quando `CRON_SECRET` non c'è).
- **Pagine e `/api/interno/*`**: 307 → `/login` senza cookie — e il corpo è la
  pagina di login, non i dati (controllato il corpo, non solo il codice).
- **CVE-2025-29927** (bypass del middleware Next): non sfruttabile,
  `x-middleware-subrequest` non passa — siamo su Next 15.5.21.
- **Nessun dato personale** nelle risposte di `/api/v1/ordini`: i campi sono
  elencati uno per uno e nome/email non ci sono più.
- **Nessuno stack trace**, nome di tabella o valore interno nei messaggi
  d'errore.

#### L'audit del codice, e cosa ne è rimasto dopo l'ostile
Otto rilievi da lettura del codice → **4 REFUTATI, 3 ridimensionati, 1
confermato**. Corretto solo ciò che ha retto:

1. **Una chiave di SOLA LETTURA scriveva sul database.** Unico punto dell'app:
   la GET di `/api/v1/operazioni` registrava la dichiarazione dello script, e
   `conto` arrivava dalla query string **senza forma né lunghezza**. Bastava un
   ciclo per riempire `Impostazione` di righe sul Postgres condiviso da 14 app,
   o per falsificare la dichiarazione di un conto vero (facendo sparire
   l'avviso che compare a chi approva). Ora il conto deve avere la forma di un
   conto Google Ads. **Provato**: chiave di lettura + conto inventato → il
   database resta a una riga sola.
2. **Traversata di percorso via `fileDrive`.** `path.join` non normalizza via i
   `..`: un `fileDrive` come `../../../.env` faceva leggere quel file, il cui
   contenuto finiva riassunto in `Analisi.scheda` — leggibile da chiunque abbia
   una chiave. ⚠️ Su Vercel non mordeva, **ma la cartella Drive esiste sul PC di
   sviluppo e il `.env` locale punta al database di produzione**: l'esca si
   piantava da fuori e maturava qui. Ora i percorsi che escono dalla cartella
   saltano il disco. **Provato su sei casi.**
3. **OAuth di Drive senza `state`.** Chiunque poteva far collegare all'app il
   **proprio** account Google mandando un link a chi era già dentro
   (`SameSite=Lax` manda il cookie su una GET di primo livello). ⚠️ L'ostile ha
   smontato metà dell'accusa: **niente esfiltrazione**, perché la cartella di
   destinazione è un id fisso e le letture non usano l'OAuth — il danno era che
   **il ponte verso Drive smetteva di depositare**. Ora `state` in cookie
   `httpOnly` con path limitato e scadenza 10 minuti. **Provato**: il passo 1 lo
   mette, un ritorno con codice altrui e senza cookie è rifiutato **prima**
   dello scambio.
4. **Login senza freno**: mezzo secondo di attesa sul tentativo sbagliato. ⚠️ È
   mezzo rimedio e sta scritto nel commento: su Vercel chi parallelizza se lo
   riprende. **La difesa vera è la lunghezza di `MARKETING_APP_PASSWORD`** — e
   quella non l'ho potuta misurare: 🔴 **da guardare**, se è una parola questa
   riga non salva niente.

**Igiene, non sicurezza** (l'ostile: «non compra niente», ma non toglie niente a
nessuno): `/api/health` non stampa più l'errore Prisma testuale; `limite` non
numerico dà 400 invece di 500 e ha un tetto, con la regola scritta **una volta
sola** in `api-auth`; creazione e revoca di una chiave API lasciano una traccia
nel registro (prima una credenziale nasceva senza che nessuno potesse dire
quando e con quale ambito).

#### Le quattro accuse REFUTATE — scritte qui perché non si «ricorreggano»
- **`/api/health?meta=1` loquace**: è una scelta dichiarata col suo motivo, e
  l'host del pooler Supabase è un indirizzo **regionale pubblico**, non un
  segreto. La toppa non cambia cosa ottiene chi guarda.
- **«Serve uno scope per rotta»**: la premessa era **falsa** — le chiavi
  incollate negli Script di Google Ads sono di **scrittura**, non di lettura
  (chiamano `ingest` e `aggiornamenti`, che chiedono `scrittura: true`). Scope
  per rotta significa colonna nuova, riemissione delle chiavi e rotture su più
  app, per un rischio che oggi non ha un attore.
- **`limite` senza tetto come vettore di esaurimento**: misurato — `NaN` viene
  rifiutato **prima** che la query prenda una connessione, ed è la richiesta più
  economica che si possa fare; e chi ha una chiave ottiene le stesse righe in
  più giri.
- **`/api/interno/chiavi` conia chiavi**: protetta dal middleware in produzione
  (verificato 307), e la via cross-site è chiusa da `SameSite=Lax`; il fail-open
  locale vale per chi è già alla tastiera, dove c'è il `.env` col database.

#### Note di metodo
- La chiave di sola lettura creata per il test è stata **revocata** a fine
  lavoro (`prova-sicurezza-tmp`, `attiva = false`), e i file con le chiavi
  cancellati dallo scratchpad.
- ⚠️ Non è stato possibile **elencare le chiavi attive con i loro scope** (la
  lettura di `ApiKey` è stata bloccata dal classificatore dell'ambiente): è il
  dato che manca per dire se i due difetti corretti avessero oggi un attore.
  🔴 Da guardare a mano da Impostazioni: **quante chiavi attive ci sono, di chi
  sono e quali sono di sola lettura**.
- 🔴 Da guardare nella console Google Cloud: il consent screen è in «Test» o
  pubblicato? Decide quanto fosse raggiungibile l'attacco OAuth.


### ⭐⭐⭐ UX/UI: TRE AGENTI, 23 ACCUSE, 19 CORREZIONI (27/08/2026 pomeriggio)

Un agente sul **layout desktop**, uno sul **telefono** (375×812) e uno **OSTILE**
col mandato di *refutare*, non di confermare. Le definizioni riutilizzabili
stanno in `C:\Users\nicol\app\.claude\agents\` (`ux-desktop.md`, `ux-mobile.md`,
`ux-ostile.md`) — ⚠️ i file nuovi si caricano solo **riavviando** Claude Code:
in questa sessione sono stati usati passandone il testo a un agente generico.

**Esito del contraddittorio: 19 confermate, 2 REFUTATE, 2 con l'effetto
capovolto.** Le due refutate NON sono state toccate:
- «le pillole d'ordinamento di `/campagne` perdono i filtri»: **falso**, leggono
  gli stessi parametri URL del `select` (`filtriOra` da `searchParams`), e la
  doppia forma è una scelta scritta nel commento;
- «il riquadro in home dice 3 fallite e non ne mostra nessuna»: **falso**, i due
  conteggi sono etichettati separatamente e le fallite hanno la loro riga sotto.

#### Quello che sul telefono rendeva l'app inusabile
- **La dashboard e la scheda campagna scorrevano di lato** (459px in 375) e il
  browser rimpiccioliva tutto all'**81,7%**: `.due-colonne` non stringeva i
  figli (`min-width: auto`). ⚠️ **L'ostile ha trovato un secondo colpevole che
  il mobile non aveva visto**: un `gridTemplateColumns` **inline** in
  `campagne/[id]` che scavalcava una `@media` già scritta e già giusta. Adesso
  **375 = 375** su tutte e cinque le pagine, zero elementi fuori.
- **`/operazioni` sfondava** (471 in 375): `.op-stato` girava in riga senza
  `flex-wrap`. La pagina delle approvazioni si portava via i bottoni di comando.
- **Le metriche per mese nascondevano Conv., Ricavi e ROAS**: sotto i 760px il
  pannello mostrava quanto si era **speso** e nascondeva quanto si era
  **incassato**. L'agente mobile l'aveva dedotto da markup iniettato; l'ostile
  l'ha **misurato su una campagna vera**: 11.612 € di ricavi e 7,2× di ROAS
  invisibili dal telefono. Ora cadono impression, click e conversioni.
- **Bersagli del tocco**: voci del menu e hamburger da 34px → **44**; campi data
  **118×20 → 169×44** (erano fuori dal selettore dei filtri, quindi sbagliati
  **anche col mouse**); campi numerici a **16px**, la soglia sotto cui iOS
  ingrandisce da solo la pagina.

#### Desktop
- **Intestazioni di tabella**: 12px, peso 500, niente maiuscolo (design system)
  e **sticky**. ⚠️⚠️ **Lo sticky da solo NON bastava**, ed è la lezione della
  giornata: un wrapper con `overflow-x: auto` diventa scroll container su
  **entrambi** gli assi, quindi l'intestazione si aggancia a lui — che in
  verticale non scorre — e non resta a vista un bel niente, si limita a sembrare
  corretta nel foglio di stile. Serviva un'**altezza** sul wrapper
  (`.tabella-lunga`, 72vh). Verificato scorrendo davvero: `scrollTop 800` e
  l'intestazione ferma al bordo (822 = 822).
- **`.th-ordinabile` aveva `position: relative`** e per specificità batteva lo
  sticky: restavano ferme solo le intestazioni delle tabelle **corte**, cioè
  proprio quelle che non ne avevano bisogno.
- **«Annulla» accanto ad «Approva» a 6px**, grigio come un'opzione neutra: ora
  **rosso** e a 14px. ⚠️ L'ostile ha ridimensionato l'effetto (non tocca
  l'account pubblicitario) **e l'ha peggiorato in un punto**: un'operazione
  annullata non ha **nessun** bottone per tornare indietro, va rifatta da capo.
- **Prima colonna ancorata** (`.tab-ancorata`) nelle tabelle larghe: scorrendo a
  destra restavano numeri senza sapere di quale brand o campagna fossero.
- **L'esito della sync era tagliato al 52%** — «nuovi 4 · aggiornati 42»
  invisibili — e il `title` mostrava i **conteggi** anche quando la sync
  **falliva**, cioè proprio quando serve il motivo.
- **`/campagne-storiche`**: filtri **sopra** la card che filtrano, due gruppi
  separati da una distanza vera, e ⚠️ **gli anni della barra non si
  autoescludono più**: uscivano da `perAnno` già filtrato, quindi scegliendo il
  2024 sparivano tutti gli altri anni — una porta che si chiude alle spalle.
- **Note lunghe**: da 137 a **87 caratteri per riga**, 0 sopra i 90.
- KPI (190px e padding da design system), i quattro bottoni di `/campagne`
  raggruppati (erano a 627px di distanza), stato vuoto, titoli di card.

#### Due correzioni MIE erano sbagliate, e le ha trovate la rimisura
Non l'agente: la misura fatta **dopo** aver corretto.
1. Il `max-width: 460px` dato a `.sync-esito` per farla vedere tutta **faceva
   scorrere la dashboard sul telefono** (474px in 375). Una larghezza fissa
   messa per mostrare di più è un modo nuovo di nascondere. Risolto sul
   genitore: `.sync-blocco` era `flex: 0 0 auto`, cioè «non stringerti mai».
2. Il selettore dei bersagli del tocco copriva `.cella-nome a` ma non
   `a.cella-nome`: **29 link erano rimasti a 18px** dopo la «correzione».

#### Trappole da ricordare
- ⚠️ **Il pannello del browser chiuso rende ogni scheda `document.hidden`**: lo
  scroll della finestra **non avanza** e `window.scrollTo` non fa niente
  (`scrollY` resta 0). Lo scroll di un contenitore con `overflow` invece
  funziona: è così che lo sticky è stato provato davvero.
- ⚠️ **25 `style={{ font: "inherit" }}` inline in 16 file** battono qualunque
  regola: la regola del tocco a 16px risultava attiva e non faceva niente
  (computed 13,5px). È l'unico `!important` del foglio, ed è dentro
  `@media (pointer: coarse)`: scritto nel commento perché non sembri pigrizia.
- ⚠️ Una misura presa su un elemento dentro un `<details>` **chiuso** vale zero:
  Chrome continua a dare `getBoundingClientRect()` su `content-visibility:
  hidden`. L'accusa «tabella alta 7227px» era vera e **invisibile**.


### ⭐⭐⭐ IL CENSIMENTO STORICO: quante campagne c'erano DAVVERO (27/08/2026)
**Domanda dell'utente**: quali e quante campagne sono esistite negli ultimi
tre anni, e quanto sono costate — non il dettaglio, il conto.

**Perché non si poteva rispondere.** L'app conosce le campagne che gli script
le raccontano, e gli script guardano una finestra corta (`GIORNI_INDIETRO`) e,
se `INCLUDI_RIMOSSE` è false, saltano le rimosse. Tutto ciò che è stato spento
e cancellato prima di quella finestra per l'app **non è mai esistito**: non
«zero spesa», proprio assente. L'elenco delle campagne rispondeva a un'altra
domanda e sembrava rispondere a questa.

**Cosa c'è adesso**
- `CampagnaStorica`: **una riga per campagna per ANNO** (totali, primo e ultimo
  mese con spesa). Non è una copia di `Campagna`: è un inventario, e si aggancia
  per `idEsterno` senza ricopiare niente. Chiave (canale, account, campagna,
  anno) → **ripetibile**: rifarlo aggiorna, non somma.
- `scripts/google-ads-censimento-storico.js` — script **ad hoc** da incollare
  una volta per account. ⚠️ **Non ha nessun `WHERE` sullo stato**: è l'assenza
  di quel filtro che fa entrare le REMOVED (gli iteratori `AdsApp.campaigns()`
  le escludono, GAQL no). Le copie: `node scripts/censimento-storico.mjs --copie`.
- `POST /api/v1/censimento` (scrittura) + `GET` riepilogo; `POST
  /api/v1/censimento/meta` fa il giro Meta **dentro l'app**, perché
  `META_ACCESS_TOKEN` vive solo lì e portarlo sul portatile vorrebbe dire
  scriverlo su disco.
- Pagina **`/campagne-storiche`** («Quante ce n'erano (storico)»): anno per
  anno, e la colonna «l'app la conosce?» calcolata al momento — non salvata,
  perché un «sì» scritto ieri è falso oggi.
- `node scripts/prova-censimento-storico.mjs`: prova a secco con AdsApp finto
  (aggregazione campagna×anno, un mese a zero **non** conta come attivo, le
  rimosse arrivano con `REMOVED`). Non tocca il database.

**Misurato subito dopo, sui dati veri — solo META** (Google aspetta l'incollo):
**89 campagne · 60.574 € · 2023-2026**, di cui **22 mai viste dall'app**
(Flowers 13 campagne · Cake 6 · Gifts 70). Anno per anno: 2026 44 campagne /
25.750 € · 2025 29 / 20.491 € · 2024 17 / 11.524 € · 2023 6 / 2.809 €.
Controprova: il 2026 di Meta secondo l'app (`MetricaCampagna`) fa 24.904 €
contro i 25.750 € del censimento — il censimento è **più alto**, come dev'essere,
perché contiene anche le campagne che l'app non ha mai visto.
⚠️ Meta riporta **solo le campagne che hanno erogato**: una creata e mai
avviata non compare, né qui né altrove. E le insights di Meta **non portano lo
stato**: la colonna «stato» è vuota sulle righe Meta, piena su quelle Google.
🔴 **RESTA A UNA PERSONA**: incollare `censimento-storico.js` (già pronto in
`Downloads\deluxy-google-ads\`) nei **tre** account Google, con `CHIAVE_API`,
prima in ANTEPRIMA. Finché non è fatto, la pagina racconta **solo Meta** — e va
detto, o un censimento a metà si legge come completo.

### ⭐⭐ DUE ALLARMI CHE DICEVANO IL FALSO, sulla PRIMA schermata (27/08/2026)
Trovati guardando la home con i numeri veri accanto, non rileggendo il codice.
1. **«Cakedesign Google Ads — MAI PARTITO»: falso.** Quell'account aveva
   consegnato quella notte alle **02:42**. `UltimaCorsa` leggeva le **ultime 400
   consegne** e raggruppava a mano: Gifts ne scrive ~236 al giorno, Flowers
   ~139, Meta 24 — nelle sette ore dopo la corsa di Cake la sua riga era già
   caduta fuori dalla finestra. È la trappola del `take`, e costava doppio:
   quel riquadro **esiste** per accorgersi di uno script fermo, e gridava al
   lupo sull'unico conto che stava lavorando. Ora l'ultima consegna per account
   la calcola il database (`groupBy` + `max`), senza finestra.
2. **«Sincronizzato 23 giorni fa · 04/08»: falso.** La sync era arrivata in
   fondo alle **06:10 di stamattina**, 689 documenti. `BottoneSync` leggeva il
   `RegistroEvento`, che scrive **solo il bottone**: da quando c'è il cron
   `/api/cron/drive` (25/08) l'esito viveva **solo nel JSON del cron**. Ora
   legge la riga `SyncDrive` — la traccia vera da qualunque strada parta la
   sync — e lo stato lo prende dalla **colonna**, non cercando parole dentro un
   testo libero.
3. **Nuovo riquadro in home: «Decisioni prese e non ancora eseguite».** Oggi
   dice **1 approvata ferma** (`pausa_campagna` Meta su «[Opera] ATC - VOLUME»,
   approvata il 26/08 alle 12:56, campagna **ancora ENABLED**: su Meta esegue
   l'app e **solo quando qualcuno preme**) e **3 fallite** mai rimesse in coda.
   Dalla prima schermata non se ne vedeva nessuna: la sidebar mostrava un «1»
   (in attesa + approvate sommate) e le fallite non le contava nessuno.

`daQuanto` è passata in `lib/dominio`: ne serviva una seconda copia, e due
copie della stessa regola divergono.

### Ri-misurato il 27/08/2026 mattina (sola lettura, prima di lavorare)
- Health `200`, `database: true`. Consegne: Meta 09:07 (ogni ora), Google
  Cake 04:42 · Gifts 06:12 · Flowers 07:24. **0 consegne non-ok in 10 giorni.**
  Ordini 8.480 (06:20). Sync Drive 06:10, 689 documenti.
- **Coda: 0 in attesa · 1 approvata (ferma, vedi sopra) · 99 eseguite · 9
  annullate · 3 FALLITE** (erano 1): `nuovo_annuncio` DUPLICATE_ASSET dal
  21/08, `rimuovi_estensione` «White-glove deliveries» del 26/08 (sitelink non
  trovato su campagna, 5 gruppi e account) e `pausa_gruppo` «Mother's Day-
  Italian» del 26/08 (bersaglio non trovato: riga vecchia senza id).
- Campagne: Google **21 attive · 140 in pausa** (+1 senza stato); Meta **8 · 61**.
- Negative: **92.731**, **0 orfane**.
- Spesa 7 gg: Google Flowers 1.018 € · Gifts 669 € · Cake 247 €; Meta Flowers
  295 € · Cake 124 € · Gifts 104 €.
- 🔴 **Aperti, invariati**: la versione dello script la dichiara **un conto solo**
  (Flowers, `2026-08-26`): Cake e Gifts sono ancora muti, cioè hanno copie
  precedenti. I **dati personali sono ancora nelle colonne** (8.152 nomi,
  6.486 email). I **cinque segreti** in `Impostazione` sono ancora **in chiaro**
  e nella loro forma originale: vanno spostati **e ruotati**.


### ⭐ LE RISPOSTE SI VERIFICANO, NON SI OBBEDISCONO (26/08/2026 notte)

Direttiva utente: le risposte date in app alle azioni proposte
(accolta/respinta/rimandata) **non sono decisioni** — i progetti di analisi
le VERIFICANO sui dati e rispondono con la loro OPINIONE motivata
(concordo/dissento, coi numeri). Una respinta smentita dai dati si
RIPROPONE dichiarando quali numeri la contraddicono; un'accolta si verifica
in esecuzione ED effetto; una rimandata si può anticipare se aspettare
costa. Cambiato in DUE posti, con lo stesso testo:
- il «Come leggerle» che l'app scrive in ogni `RISPOSTE App [Brand] …md`
  (`testoRisposteMd` in `lib/scheda-analisi.ts`), deployato;
- le **5 ISTRUZIONI dei progetti su Drive** (`ads/Definitivi/ISTRUZIONI -
  *.md`): i 3 brand (via il «RESPINTA → NON riproporla»), il **Custode**
  (che diceva l'OPPOSTO: «sono DECISIONI… vigilare che i progetti le
  rispettino» — ora vigila che i progetti le verifichino e dichiarino
  l'opinione, e segnala sia la respinta riproposta senza numeri sia il
  report che OBBEDISCE senza verificare), e App Azioni (frase descrittiva).
  ⚠️ **I blocchi vanno RE-INCOLLATI nei progetti Claude** (file rimandati
  all'utente in chat, marca di versione «26-08 sera» nel titolo).

### ⭐⭐⭐ REVISIONE DEL CODICE: 10 DIFETTI TROVATI E CORRETTI (26/08/2026 notte)

Caccia agli errori su tutto `src/` (8 angoli di ricerca + verifica
indipendente, tutti CONFIRMED). In ordine di gravità:

1. 🔴🔴 **`/api/v1/esegui/meta` era PUBBLICA.** `autentica()` non restituisce
   mai null (torna il cliente O la NextResponse d'errore), ma il guard era
   `if (!cliente)` — sempre falso. Chiunque senza chiave poteva fare POST e
   far partire l'esecuzione delle operazioni Meta approvate, con la
   scrittura ormai accesa; e mancava anche `{ scrittura: true }`, quindi una
   chiave di sola lettura bastava. **Hotfix deployato subito** e provato:
   401 senza chiave. Era l'unica rotta v1 col guard sbagliato.
2. **`cambiaStatoMeta` diceva «riuscita» anche smentita dalla rilettura**:
   l'ATTENZIONE finiva solo nel testo, l'op veniva marcata eseguita e il DB
   scriveva «in pausa» su una campagna che su Meta spendeva ancora. Ora
   rilettura discordante = operazione FALLITA (la rilettura mancata resta
   un «non lo so», non un fallimento).
3. **La negativa da /termini nasceva GENERICA**: `giudicaTermine` non
   passava la corrispondenza e lo script ripiega su broad — il difetto
   esatta→generica del 06/08, ancora aperto nel terzo punto di accodamento.
   Ora eredita la corrispondenza del termine (colonna che c'era già), default esatta.
4. **Un `parametri` malformato bloccava TUTTA la coda Meta**: JSON.parse
   senza guardia in `eseguiOperazioniMeta` → eccezione prima di `riferisci`,
   op sempre in testa (approvataIl asc), giro morto per sempre. Ora parse
   guardato → op fallita col motivo, la coda cammina.
5. **Una riga malformata spegneva la consegna a TUTTI gli script Google**:
   JSON.parse nudo nel GET /api/v1/operazioni → 500 sull'intera consegna.
   Ora parse guardato riga per riga ({} → lo script fallisce QUELLA op con
   esito chiaro e il resto continua).
6. **Le op Meta nate dalle schede analisi non partivano MAI**:
   `accodaAzioneScheda` non selezionava `idEsterno` e l'esecutore le saltava
   in silenzio, lasciandole «approvate» per sempre. Ora l'id viaggia con
   l'operazione E le saltate senza id diventano FALLITE col motivo scritto
   (l'id sta sull'op dall'accodamento: non sarebbero mai guarite da sole).
7. **La riconciliazione era cieca sulle azioni multi-campagna**: passava
   all'AI solo il legacy `operazione` singolare, vuoto sulle schede dal
   26/08. Ora passa `operazioni[]` col singolare come ripiego.
8. **Quattro ore in UTC a schermo (e una nel DB)**: la scadenza del
   blackout («Non toccare fino al…»), l'esito operazione PERSISTITO nella
   descrizione dell'azione di verifica, l'ultimo giro delle proposte AI e la
   freschezza dei connettori — tutte 2 ore indietro d'estate. Ora
   `formattaDataOra` ovunque.
9. **Slot del lunedì e giorno-settimana calcolati in UTC**: lo slot 9:30
   del doc 8.3 cadeva alle 11:30 di Roma e il lunedì notte era «domenica»
   (avviso weekend a torto); e `giornoDi` delle analisi storiche usava il
   giorno UTC (il «superata dal suo doppione» rientrava a cavallo delle
   2:00). Nuovi helper in **lib/fuso.ts** (`orologioRoma`, `giornoRoma`,
   `orarioRoma`) usati da guardrail e scheda-analisi.
10. **`proponiAccensione` scavalcava il punto unico**: `prisma.create`
    diretto invece di `accodaOperazione` → niente avviso versione-script e
    account potenzialmente vuoto (il difetto storico delle 32/32). Era il
    dodicesimo punto di creazione e l'unico fuori dal collo di bottiglia.

Verificato: tsc+build puliti, deploy, POST senza chiave → 401, GET
operazioni con chiave → 200. ⚠️ Nota di metodo: il n.1 esisteva perché
UNA rotta su quindici aveva un guard diverso dalle altre — il pattern
giusto era a un file di distanza.

### ⭐ LE ANALISI VECCHIE SI SEGNANO «STORICHE» DA SOLE (26/08/2026 sera)

Richiesta utente: un'analisi del 02/08 accanto a quella del 25/08 si legge
come attuale, e non lo è. Ora è **uno stato DERIVATO, mai scritto in
tabella** (`mappaAnalisiStoriche` / `analisiCheSupera` in
`lib/scheda-analisi.ts`): un'analisi è storica se ne esiste una
**strettamente più recente** sullo stesso **brand+canale** — depositata la
nuova, le vecchie diventano storiche da sole; due dello stesso giorno
restano entrambe attuali (sceglierne una a caso sarebbe peggio). Un flag
salvato sarebbe invecchiato: stessa famiglia del riassunto d'handoff.

- **/analisi**: pillola «Storica» sulle card (che si smorzano a opacità
  0.72, leggibili ma non in competizione con l'attuale) e nella colonna
  Data della tabella; il title dice CHI la supera e di quando.
  ⚠️ Il calcolo gira su TUTTA la tabella, non sull'elenco filtrato: col
  filtro «solo audit» chi supera potrebbe non essere in pagina, e una
  storica sembrerebbe attuale solo perché il suo successore è filtrato via.
- **/analisi/[id]**: banner NEUTRO in testa (grigio, non allarmato — una
  storica non è un errore): «del …, su questo mondo c'è un'analisi più
  recente del …: [titolo] →» con link. I findings restano tutti leggibili:
  raccontano com'era allora, non com'è adesso.
- ⚠️ **Trappola pagata al primo giro in produzione**: il confronto stretto
  sui TIMESTAMP faceva risultare la 25/08 «superata da sé stessa» — una
  RIDEPOSITATA in giornata crea due righe a poche ore di distanza, e il
  doppione (senza scheda, invisibile fra le card) superava l'originale.
  Si confronta il **GIORNO** (`giornoDi`), come la regola dichiarava:
  due righe dello stesso giorno sono la stessa stagione.

### ⭐⭐ RIFINITURA UX/UI TRASVERSALE (26/08/2026 sera)

Richiesta utente («migliora UX e UI di tutta l'app»). Interventi che valgono
su OGNI pagina, tutti dal design system — niente redesign, si chiudono gli
scarti fra l'app e il DS:

- **Focus ORO sui campi** (DS §Campi input): bordo `gold` + anello
  `gold-soft` su input/select/textarea di moduli e filtri. Prima il focus
  era un grigio appena percettibile.
- **Focus-visible dappertutto** (DS principio 4): bottoni, pillole, voci di
  sidebar, card cliccabili, matite, selettori — outline oro 2px. Prima chi
  navigava con la tastiera attraversava la pagina alla cieca (solo
  radio-carte e chip l'avevano).
- **Ancoraggi liberati dalla topbar**: `[id] { scroll-margin-top: 84px }` +
  scroll morbido. L'app vive di #ancore (op-…, #termini, #annunci) e il
  salto atterrava con la testata coperta dalla barra sticky.
- **Telefono**: padding pagina 22/14 (era 40/24 anche a 390px), titoli 24px,
  e su puntatore «coarse» i bottoni small crescono a bersaglio da pollice —
  le azioni restano TUTTE, si allarga il bersaglio (regola di casa).
- **Scrollbar sottili** su tabelle/board/sidebar/modali, `::selection` oro,
  `prefers-reduced-motion` rispettato, `.btn` active a scale(0.97) e
  disabled 0.55 come da DS.
- ⭐ **La virgola dei moltiplicatori**: 105 punti in 36 file stampavano
  «3.35×» col PUNTO accanto a euro it-IT con la virgola. Rimpiazzo
  meccanico `toFixed(N)}×` → `toFixed(N).replace(".", ",")}×` (script
  split/join, niente regex — la trappola dei patch-script è nota), contati
  prima (105) e dopo (0).

### ⭐⭐ LE ANALISI SI VEDONO DALL'ELENCO E LA LORO STORIA SULLA CAMPAGNA (26/08/2026 pomeriggio)

Richiesta utente («dove vedo le analisi che sono state fatte? mettile
visibili anche su canale Meta»), in tre pezzi:

- **/campagne**: bottone **Analisi** in testata (porta i filtri correnti,
  brand e canale, Meta compreso → `/analisi?brand=…&canale=…`) e su ogni
  card il **pallino del verdetto** dell'analisi più recente che parla della
  campagna (`mappaAnalisiPerCampagne` in `lib/scheda-analisi.ts`: le analisi
  si caricano UNA volta, il confronto dei nomi gira in memoria — cento query
  sarebbero state la strada sbagliata). È uno span, non un link: la card è
  già un `<a>`, e la scheda si apre dal bottone ANALISI della campagna.
- **/campagne/[id]**: sezione **«Che cosa dicono le analisi»** — la STORIA
  dei giudizi, non solo l'ultimo: per ogni analisi che NOMINA la campagna,
  data, verdetto colorato (bordo sinistro), nota della voce campagna,
  findings che la citano con la pillola P0/P1/P2, link alla scheda
  (`noteAnalisiPerCampagna`). Solo le analisi che la nominano: il ripiego
  «verdetto dell'insieme» ripetuto per ogni campagna del brand sarebbe
  rumore, e resta al bottone in testata.
- **Tolto il falso «Lancia su Meta Ads — non ancora»**: il bottone disabilitato
  e la nota «su Meta non si lancia da qui» erano veri fino a stamattina e
  falsi dal deploy del modulo Meta. Ora «Crea campagna» porta anche il
  CANALE (filtro Meta → modulo Meta) e la nota dice come funziona davvero.
  ⚠️ È la trappola del riassunto che invecchia, pagata in casa: la pagina
  accanto al modulo nuovo continuava a negare che esistesse.

### ⭐⭐⭐ IL LANCIO CAMPAGNA HA IL SUO MODULO META (26/08/2026 pomeriggio)

Richiesta utente: su `/campagne/lancia` il modulo era SOLO Google (keyword,
RSA, corrispondenze) anche per chi voleva lanciare su Meta. Adesso la pagina
ha **due moduli separati**, scelti con le pill in testa (`?canale=meta`),
perché le due piattaforme non hanno un campo in comune oltre a nome, marchio
e budget:

- **Il modulo Meta segue la struttura di Meta**: obiettivo **ODAX**
  (Vendite/Contatti/Traffico/Notorietà — «Interazioni» manca APPOSTA:
  ottimizza su un post che al lancio non esiste ancora), categoria speciale
  (Meta la pretende anche da vuota), **livello del budget** (campagna/CBO o
  ad set/ABO — la trappola classica di Meta), strategia d'offerta
  (volume/cost cap/bid cap/ROAS minimo coi loro importi), pubblico (paesi
  ISO, città con raggio, età 18-65, genere, **Advantage+ audience** — la
  dichiarazione che la Graph API oggi pretende su ogni ad set nuovo),
  posizionamenti (automatici o manuali per piattaforma), evento del pixel
  (Acquisto/Carrello; su Contatti è Lead), e il **creativo come BRIEF**.
- **Esegue L'APP, non uno script**: nuovo tipo `lancio_campagna` in
  `OPERAZIONI_META` (`lib/meta-scrittura.ts`, `lancioMeta()`): crea campagna
  + ad set via Graph API, **tutti e due IN PAUSA**, e rilegge per confermare.
  Le città dette per nome le traduce chiedendo a Meta (`adgeolocation`):
  un nome ambiguo NON si sceglie, si elenca nell'esito (la regola di Como).
  Il **pixel** se non indicato lo cerca sull'account: se ce n'è più d'uno si
  ferma e li elenca — col pixel sbagliato conteresti le conversioni di un
  altro sito. ⚠️ **Esito PARZIALE possibile**: campagna nata e ad set no →
  operazione FALLITA (qualcuno deve guardare) ma `idEsterno` agganciato lo
  stesso alla campagna dell'app, sennò resterebbe orfana su Meta; l'esito
  dice di NON rimettere in coda lo stesso lancio (ne nascerebbe una seconda).
- **Cosa NON fa, dichiarato in pagina**: l'annuncio (serve un media che
  l'app non possiede — il copy passa dal lint 7.2/7.3 e resta nei parametri
  come brief), i pubblici personalizzati/lookalike (solo promemoria). E la
  scrittura resta **spenta** finché il token non ha `ads_management` +
  `META_SCRITTURA=attiva`: un lancio approvato con la scrittura spenta resta
  in coda, e `eseguiOperazioniMeta` dice perché.
- Server action `lanciaCampagnaMeta` in `lib/azioni.ts`: stesse regole del
  gemello Google (lint che blocca le vietate, brand che torna indietro con
  l'errore, `accodaOperazione` → L2 da approvare, registro eventi).
  Validazioni Meta-native: almeno una località (Meta rifiuta un ad set senza
  geo), cap obbligatorio con cost/bid cap, ROAS di soglia con la strategia
  omonima, età 18-65.

Verificato: `tsc` pulito, build ok, deploy `m1k445ptw` e **provato in
produzione nei due versi** (il tab Meta mostra il modulo nuovo, il tab
Google resta identico, brief AI compreso).

⚠️⚠️ **CORREZIONE della sera stessa: la scrittura Meta è GIÀ ACCESA.**
Qui (e nel commento di testa di `meta-scrittura.ts`) stava scritto
«`ads_management` manca da prima»: **falso al momento della scrittura** —
era la copia di un handoff invecchiato, non una misura. Misurato il 26/08
sera con la diagnosi (`GET /api/v1/esegui/meta`, chiave locale):
`puoScrivere: true`, token con `ads_management`, `META_SCRITTURA=attiva`
già fra le env di produzione. Quindi: **un lancio Meta approvato viene
ESEGUITO davvero** al primo giro di esecuzione (`POST /api/v1/esegui/meta`
o il bottone in app — il cron NON c'è, ed è voluto: si veda il commento
nella rotta). Resta vero che il primo lancio reale sarà la prova sul campo
dei parametri Graph API.

### ⭐⭐ LA DECISIONE SUI CLAIM, e pausa_annuncio (26/08/2026)

Direttiva utente: **same-day lecito ovunque** (consegna in giornata
disponibile su tutti i siti — risposta RESPINTA sulla #17 depositata su
Drive, operazione «Consegna Oggi» annullata); **white-gloves VIETATO su
Flowers e Cake**. Ricognizione dal censimento: su Cake il claim è tutto in
asset/campagne IN PAUSA (dormiente); su Flowers l'unico in onda è la **RSA di
Brand protection** (779344865650, l'unica RSA dell'unico gruppo → serve
ADD-BEFORE-PAUSE), il gruppo Mother's Day ENG è già in pausa e per quello di
Francia-FR c'è una `pausa_gruppo` cautelativa in coda (`cmt9sb8fm…`). Nuovo
tipo **`pausa_annuncio`** (script **2026-08-26.2**, copie rigenerate, da
reincollare): trova la RSA per id e SI RIFIUTA se è l'unica attiva del gruppo
— una pausa che spegne un gruppo non è una pausa. Decisione e stato veri
scritti per il custode in `APPEND 00.3 App-Azioni 2026-08-26 1000
DECISIONE-CLAIM.md`.

Sequenza per chiudere Brand protection: (1) creare l'annuncio pulito dalla
scheda campagna (CreaAnnuncioAi), approvare; (2) alla conferma di Google,
accodare `pausa_annuncio` della RSA coi guanti. Poi il claim su Flowers è
SOLO dormiente, come su Cake.


### ⭐ «Non vedo più stoppare white-gloves» — era l'etichetta, non la proposta (26/08/2026)

La proposta c'era (riconciliazione PARZIALE, giusta) ma la rimozione «per
descrizione» non ha `testo` e il bottone stampava **«undefined»**: invisibile
agli occhi che cercavano «White-glove». Corretti (1) l'etichetta — «Rimuovi
sitelink con descrizione …» — e (2) il riconoscimento dell'eseguita per
SOTTOINSIEME sui `rimuovi_estensione`: la proposta {descrizione} e l'eseguita
{titolo+descrizione} sono la stessa rimozione, e ora la scheda dice «già
eseguita» invece di riproporla. Chiarito anche l'equivoco: il sitelink dello
screenshot è «White FLOWERS» (peonie bianche, Francia-FR) — fiori, non guanti:
non è il claim vietato. ⚠️ Restano invece ENABLED i **titoli/descrizioni RSA
«White-Gloves»** su ITALIAN-ENG e Francia-FR: sono dentro gli ANNUNCI, l'app
non li sa mettere in pausa — F13(b), da interfaccia. E lo scalino #51 ora ha
il bottone: **Budget a 28,20** su Francia-FR (il +20% è la regola di casa, doc
11 — insegnato alla mappa: uno scalino senza importo nel documento si mappa
col passo prudente della banda 20-30%). ⭐ **La #50 è FATTA**: budget ITA
28,75→34,50 eseguito alle 06:17, confermato rileggendo.


### ⭐ LA FREQUENZA SULLE CAMPAGNE META (26/08/2026)

Richiesta utente: la frequenza nei KPI subito visibili. ⚠️ La frequenza è un
numero DI PERIODO (impressioni ÷ persone UNICHE raggiunte): dalle righe
giornaliere non si ricava — sommare la copertura conta la stessa persona
sette volte e darebbe ~1 anche su un pubblico cotto a 16×. La chiede l'unico
che la sa: `frequenzeMeta()` interroga Meta viva, in UNA chiamata per tutte le
finestre (time_ranges), timeout 6 s, e se Meta non risponde il KPI dice «—».
Dove: KPI in testata alla scheda campagna (sul periodo scelto, con le persone
raggiunte accanto) e colonna nella tabella «Come sta andando». Colori: ≥3
arancio (fatigue nel lusso), ≥10 rosso (pubblico esaurito). Verificato in
produzione: [Opera] ATC - VOLUME **17,9× su 9.492 persone** — peggio della
VENDITE dell'analisi (14,3× su 2.764) — tutti e due rossi. Il KPI è nato già
utile.


### ⭐⭐ LA MAPPA LEGGE ANCHE IL CENSIMENTO — e le card dicono la piattaforma (26/08/2026)

Due osservazioni utente. «Mi propone una sola azione, non per tutte le
campagne»: la mappa era vincolata al documento, e il documento dice «6
sitelink same-day su 4 campagne» SENZA i titoli — che l'app però ha già, nel
censimento asset di Google. Ora `elaboraAnalisi` passa all'AI `assetCensiti`
(sitelink e callout ENABLED su campagne ENABLED del brand, max 80) con la
regola: tradurre il claim in operazioni per campagna usando i titoli VERI del
censimento, mai inventare. Rielaborata la Flowers: la #17 è passata da 1 a
**4 operazioni** — descrizione «White-glove» su ENG (la forma giusta),
«Consegna Oggi» su ENG e Brand protection, «Delivery Today» su ENG — coi nomi
campagna COMPLETI (dal censimento), aggancio perfetto. Verificato dal DOM: 4
bottoni sotto F13.

«Che senso hanno i colori?»: dal pomeriggio il RICONOSCIMENTO delle card è per BRAND (bordo e pillola coi colori del brand, come ovunque nell'app) e il verdetto è un PALLINO col tooltip accanto alla data — un semaforo non deve competere col colore d'identità. E la piattaforma: sulle card di
/analisi l'ordine ora dice il senso — semaforo = verdetto della lettura,
pallino colorato = brand (i suoi colori di sempre), poi PIATTAFORMA (Google
Ads / Meta Ads) e tipo in grigio. Il canale mancava perché l'import non lo
deduceva dal nome del file: ora `canaleAnalisiDa()` lo scrive all'import, e
il backfill ha riempito **52 righe su 59** (le 7 senza canale non lo dicono
nel titolo, e non si inventa).


### ⭐⭐⭐ LE RISPOSTE ALLE PROPOSTE — il canale di RITORNO verso i progetti di analisi (26/08/2026)

Richiesta utente: poter RISPONDERE alle azioni proposte, così che la prossima
analisi le esamini. Il giro ora è chiuso nei due versi:

- **Nell'app**: su ogni azione della scheda c'è «Rispondi alla proposta» —
  Accogli / Respingi / Rimanda + nota. La risposta si salva su `Analisi.risposte`
  (colonna nuova, ALTER) e si DEPOSITA SUBITO su Drive in
  `adsApp AzioniOUT - dall'app` come `RISPOSTE App [Brand] [data ora].md` —
  stato COMPLETO delle risposte a quell'analisi, gli omonimi precedenti sono
  superati (lo dice il file stesso). Se Drive fallisce, la risposta resta
  nell'app e l'errore si vede: si rideposita alla risposta dopo.
- **Nei progetti di analisi**: le ISTRUZIONI su Drive sono state aggiornate
  NELLO STESSO GESTO (sezione «RISPOSTE DELL'UTENTE ALLE AZIONI» dentro il
  blocco da incollare): ADV Flowers/Cake/Gifts, Custode, App Azioni. La regola:
  ACCOLTA → verificarne l'esecuzione e riportare l'esito; RESPINTA → non
  riproporre senza fatti nuovi dichiarati; RIMANDATA → alla data della nota.
  Scritto anche l'`APPEND 00.2 App-Azioni … RISPOSTE.md` per il registro del
  custode. ⚠️ **L'utente deve RE-INCOLLARE i blocchi nei progetti Claude.**

Verificato dal DOM in produzione: 13 «Rispondi alla proposta» (una per azione),
i tre bottoni presenti. Il deposito usa `scriviInOut`, la stessa strada già
viva di RISULTATI e APPEND.


### ⭐ FINDINGS E AZIONI IN UNA COLONNA SOLA (26/08/2026)

Richiesta utente: le due colonne della scheda analisi — «Cosa ha trovato» a
sinistra, «Cosa propone» a destra — erano la stessa storia raccontata due
volte (F16 dice che le enhanced conversions sono rotte, la #19 dice di
aggiustarle). Ora è **una sezione sola a tutta larghezza**: la diagnosi sopra,
la cura annidata sotto — ogni azione si attacca al finding che la CITA
(aggancio per codice, con il confine dopo il numero: «#1» non combacia dentro
«#17») — con stato riconciliato, link → operazione e bottone «Metti in coda»
al loro posto. Le azioni che nessun finding cita stanno in fondo alla stessa
colonna («Altre azioni proposte»), non in un'altra. La riconciliazione
(data + bottone) sta nella testata della sezione. Verificato dal DOM in
produzione: la #17 Parziale col suo esito è annidata dentro il finding dei
claim vietati.


### ⭐⭐⭐ LA RICONCILIAZIONE: cosa risulta FATTO di quello che i report chiedono (26/08/2026 mattina)

**Prima, il fatto**: la rimozione v2 del sitelink vietato è andata — esito
«**2 sitelink rimossi** (campagna + gruppo "English")», 26/08 04:41: il claim
era agganciato a DUE livelli e la ricerca su tre livelli li ha presi entrambi.
E il conto si è ridichiarato da solo: versione **2026-08-26**.

**Poi il buco che questo apriva**: il sitelink era stato rimosso davvero e la
scheda continuava a proporlo come «da fare». Un'azione fatta che resta scritta
da fare insegna a non leggere le azioni. Da qui la **riconciliazione**
(richiesta utente): per ogni azione della scheda, **cosa risulta dalla coda** —
fatta (con l'esito vero citato), in coda, fallita, parziale, da fare.

- L'incrocio lo fa **l'AI** (`riconciliaAnalisi`): il legame azione↔operazione
  non è sempre letterale — la #17 è stata tentata due volte con parametri
  diversi, una JOIN non lo sa, un lettore sì. Il codice **riverifica**: indici
  nel range, id solo fra le operazioni vere, «da_fare» senza operazioni non si
  scrive (è il default, sarebbe rumore).
- ⚠️ **La coda è dell'app**: un'azione fatta a mano in interfaccia resta «da
  fare» finché un censimento non la mostra. Meglio un da-fare stantio che un
  fatto dedotto.
- **Chi la fa girare**: il cron dopo le schede (2 per giro, solo quelle la cui
  coda è CAMBIATA dopo l'ultima riconciliazione) + il bottone «Riconcilia
  adesso» sulla pagina. Colonne `riconciliazione`/`riconciliataIl` (ALTER).
- **A schermo**: pillola di stato accanto a ogni azione (✓ Fatta verde, In
  coda blu, Fallita rossa, Parziale arancio), la nota fattuale con l'esito, e
  il link **→ operazione** che atterra sulla riga giusta di /operazioni (le
  righe ora hanno l'àncora `op-<id>`). Se la riconciliazione dice fatta/in
  corso, il bottone «Metti in coda» sparisce.

**Provato**: 2 riconciliazioni passate (le Cake, 0 voci: coda vuota, giusto).
✅ **Risolto in giornata**: la chiave era di un account senza crediti; l'utente
ne ha messa una nuova in Impostazioni → AI (la vecchia …cAAA è da disattivare
nella sua console, punto segreti). Al giro dopo: **12 schede**, **4
riconciliate** — e la #17 di Flowers è uscita **PARZIALE**, non «fatta»: il
sitelink è rimosso (2 agganci, op collegate entrambe, anche il primo tentativo
fallito) ma la nota elenca cosa di F13 resta fuori — RSA «guanti bianchi»,
titoli ITA, 6 same-day, refuso «gambo ungo». Più onesto di così non si può.
Verificato dal DOM in produzione.


### ⭐⭐ IL PRIMO GIRO VERO DI rimuovi_estensione HA FALLITO BENE — e la v2 cerca su tre livelli (26/08/2026 mattina)

L'utente ha approvato la rimozione del sitelink vietato; lo script (reincollato,
dichiarato 2026-08-25.2) l'ha eseguita alle 06:19 ed è **fallita con l'errore
giusto**: «non trovato sulla campagna… o è agganciato all'ACCOUNT o a un
GRUPPO, o il testo è diverso». Erano vere TUTTE E DUE le ipotesi, e lo ha detto
lo **xlsx dell'analisi** (foglio Asset & Sitelink, letto con la libreria xlsx):

> `How it Works | White-glove deliveries | … | ENG › English | GRUPPO`

**«White-glove deliveries» non è il titolo del sitelink: è la sua DESCRIZIONE.**
Il link si chiama «How it Works» e sta sul **gruppo** «English», non sulla
campagna. Sia F13 che la coda avevano usato la descrizione come nome.

**La v2** (`VERSIONE_SCRIPT` → **2026-08-26**, copie rigenerate): cerca su
**campagna → gruppi della campagna → account**; per i sitelink accetta il
parametro **`descrizione`** (match dentro le due descrizioni) così si colpisce
il claim senza sapere come si chiama il link e senza rimuovere un omonimo
pulito; l'esito dice **da quale livello** ha tolto cosa, e la rimozione a
livello account — che spegne l'estensione ovunque — viene dichiarata. Se il
livello non permette la rimozione da script, lo dice invece di tacere.

**In coda, da approvare** (`cmt9lbd4v…`): secondo tentativo con le coordinate
giuste — `{tipo: sitelink, testo: "How it Works", descrizione: "White-glove
deliveries"}` sulla ITALIAN-ENG. ⚠️ **Prima si reincolla la copia 2026-08-26**
su Flowers (quella dichiarata sa il tipo ma cerca solo sulla campagna: fallirebbe
uguale), poi si approva. La fallita delle 06:19 resta nello storico: è la prova
che la catena riferisce anche i no.


### ⭐⭐⭐ LE AZIONI DEL REPORT SI METTONO IN CODA CON UN CLICK (26/08/2026, notte)

Richiesta utente sulla scheda analisi: «riesci a mettere i link per eseguire le
azioni che il report dice, se sono fattibili dentro l'app?». Fatto, con la
stessa filosofia delle PropostaAi: **l'AI propone, non decide** — la catena
resta app → coda → approvazione → script, nessuna scorciatoia.

- **La mappa nasce nell'elaborazione**: ogni azione della scheda può portare
  `operazione` (tipo + campagna citata + parametri JSON), SOLO se il documento
  dà tutto. Tipi mappabili: pausa/attiva campagna, budget, negativa,
  nuova_keyword, estensione, rimuovi_estensione. Creativi, pubblici, ad set
  Meta, ristrutturazioni → `null`, restano testo.
- **Il codice riverifica** (`operazioneDaAzione`): tipo nel catalogo del CANALE
  della campagna (su Meta solo stato+budget), parametri con la forma giusta,
  aggancio non ambiguo. La mappa dell'AI non è un permesso.
- **Il bottone** «Metti in coda: …» compare solo quando tutto passa; crea
  l'operazione **da approvare** su /operazioni col motivo che cita l'analisi.
  ⭐ **Dedupe con la coda viva**: un'operazione identica già in
  attesa/approvata → il bottone diventa «già in coda — vai ad approvarla»
  (il doppio invio è la trappola del 25/08).
- Provato in produzione sulla Google Flowers: 13 azioni, 2 mappate — #17
  rimuovi_estensione «White-glove deliveries» (che risulta correttamente **già
  in coda**, era quella accodata ieri) e #50 budget 34,5 €/g su ITALIAN-ITA
  col bottone attivo. Meta Flowers: 7 azioni, 0 mappate — giusto: propone
  lavoro su creativi e pubblici, che l'app non esegue.

⭐⭐ **E il giro si è CHIUSO stanotte**: l'utente ha reincollato gli script su
Flowers, e alle 03:33 il conto 825-518-1560 **si è dichiarato da solo** —
versione `2026-08-25.2`, tutti i 16 tipi compreso `rimuovi_estensione`. Il
meccanismo del 25/08 ha fatto il suo primo giro vero. Restano muti Gifts e
Cake (copie ancora vecchie).

Stanotte depositate e già in scheda anche: **Meta Flowers** (ROSSO, «prospecting
morto, ROAS 0,84»), **Meta Cake** e **Google Cake** del 25/08. Schede totali: 7.


### ⭐ L'APP SA RIMUOVERE UN'ESTENSIONE — e la prima in coda è il claim vietato (25/08/2026, sera)

F13 dell'analisi Flowers: il sitelink **«White-glove deliveries»** è un claim
VIETATO dal 2/8, verificato live ancora Eligible — 1.771 impr, 188 clic,
**362,78 €** in 30 giorni. E l'app sapeva solo AGGIUNGERE estensioni
(`creaEstensione`): per spegnerne una bisognava entrare in Google Ads a mano.

Nuovo tipo di operazione **`rimuovi_estensione`** (sitelink, callout, snippet):
lo script stacca dalla campagna tutte le estensioni col testo esatto, rilegge
per confermare (la parola di chi scrive non basta), e se non trova niente lo
dice **con le possibilità scritte nell'errore** — già tolto, o agganciato
all'ACCOUNT/gruppo (lo script vede solo il livello campagna), o testo diverso.
`VERSIONE_SCRIPT` → **2026-08-25.2** (cambia cosa sa fare), copie rigenerate.

**In coda, da approvare**: `rimuovi_estensione` del sitelink «White-glove
deliveries» sulla `[Deluxyflowers] - ITALIAN - ENG` (op `cmt9582qz…`), col
motivo che cita F13. ⭐ E l'avviso di versione di stamattina ha lavorato DA
SOLO: l'operazione porta scritto «la copia sul conto 825-518-1560 non dichiara
la propria versione… se fallisce, si reincolla e si rimette in coda». Restano
da accodare (decisione utente): i 6 sitelink same-day su 4 campagne, i 3
«Consegna Oggi» e i callout white-gloves della campagna London. I claim dentro
gli RSA (descrizioni «guanti bianchi», titoli «Consegna oggi») sono un'altra
strada: l'app non sa mettere in pausa un annuncio.


### ⭐⭐⭐ LE ANALISI DIVENTANO SCHEDE GRAFICHE — verdetto, KPI, findings e il bottone ANALISI sulle campagne (25/08/2026, sera)

> **Aggiornamento della stessa sera — la scheda INVECCHIATA si riprende da
> sola.** Flowers ha ridepositato l'analisi Google Ads **sullo stesso percorso**
> venti minuti dopo l'elaborazione (15.202 → 16.239 byte): la scheda raccontava
> la versione di prima, in silenzio. Ora la coda del cron mette **mancanti e
> invecchiate insieme** (invecchiata = `modificatoIl` del documento più giovane
> di `elaborataIl`), ordinate per DATA DELL'ANALISI — prima la precedenza
> assoluta alle mancanti avrebbe fatto passare l'arretrato di luglio davanti a
> una scheda fresca e sbagliata. Alzato anche il respiro della risposta AI
> (8.000 → 12.000 token): la Google Cake del 02/08 falliva con «JSON
> illeggibile» perché la risposta veniva TRONCATA a metà — uno schema vincolato
> non protegge dal tetto dei token. Riprovato: la Flowers rielaborata racconta
> la versione delle 15:45 (15 findings, 8 P0, «claim vietati ancora live») e
> le schede sono **4 su 4, 0 fallite**. Deploy `6wmgb4sum`.


**La richiesta dell'utente**: le analisi che arrivano su Drive presentate
nell'app in modo chiaro e grafico, rielaborate — non testo; un pulsante
**ANALISI** sopra ogni campagna e una sezione dedicata.

**Com'è fatto.**

- **La scheda** (`src/lib/scheda-analisi.ts`): l'AI legge il documento COMPLETO
  da Drive e lo rielabora in un JSON vincolato da schema — verdetto
  rosso/giallo/verde, frase-verdetto, 8 KPI col loro VERSO (buona o cattiva
  notizia), findings con priorità P0/P1/P2, azioni proposte, **campagna per
  campagna** con verdetto e nota, cosa il documento dichiara di non coprire.
  Salvata in `Analisi.scheda` con `verdetto`, `elaborataIl` ed `elaborataCon`
  (fornitore/modello: una rilettura senza firma non si giudica). Colonne
  aggiunte con ALTER mirati (`scripts/aggiungi-scheda-analisi.mjs`), mai db push.
- **Il testo completo si legge DAVVERO, anche da Vercel**: `DocumentoDrive.idDrive`
  (nuova colonna) viene scritto dalla sync via API — prima l'app indicizzava i
  file **senza poterli mai leggere**: `voce.id` arrivava e veniva buttato via.
  `testoDocumento()` in `drive.ts`: disco locale se c'è, altrimenti
  `files/{id}?alt=media` con la chiave API. Provato: 659 id riempiti in un giro,
  download del documento vero via API → 200, 28.644 caratteri.
- **Chi elabora**: il cron di Drive, dopo la sync (2 per giro, ~30-60 s l'una,
  solo .md/.txt — un xlsx non si manda a un modello come stringa); e il bottone
  **«Elabora la scheda» / «Rielabora»** su `/analisi/[id]` (server action, il
  documento su Drive può cambiare e il modello anche).
- **Audit e analisi restano DISTINTI** (domanda dell'utente, 25/08 sera): la
  tabella è una (`Analisi`) ma `tipo` li separa — /audit è la griglia di stato
  per brand×tematica (si nutre dell'esito, che l'elaborazione riempie quando
  manca), /analisi lo storico. Le card dicono il TIPO, e le istruzioni AI sanno
  che su un audit i findings sono i CONTROLLI FALLITI e il verdetto è lo stato
  dell'ACCOUNT, non delle vendite (`b09f71f8`).
- **La sezione** (`/analisi`): le ultime schede come **card colorate dal
  verdetto** sopra la tabella (frase-verdetto, conteggio KPI/findings/P0);
  in tabella il verdetto comanda sull'esito quando c'è.
- **La pagina scheda** (`/analisi/[id]`): hero col verdetto grande, griglia KPI
  (rosso = cattiva notizia, verde = buona — il colore è il VERSO, non il segno),
  findings ordinati per priorità con barra e pillola, «Campagna per campagna»
  coi semafori e i link, azioni proposte dal documento, «Cosa NON copre».
  Il documento resta la fonte: link a Drive sempre a vista.
- **Le letture in testata al BRAND** (richiesta utente, 25/08 sera): su
  `/brand/[brand]`, in alto a destra accanto a «Deposita analisi», le analisi
  già rielaborate del brand come bottoni col pallino del verdetto e la
  frase-verdetto nel tooltip. Se non c'è nessuna scheda, il blocco sparisce.
- **Il bottone ANALISI** sulla scheda campagna: apre l'analisi più recente che
  la NOMINA (pallino col verdetto della campagna, nota nel tooltip); se nessuna
  la nomina, l'ultima del suo brand+canale (e il tooltip lo dice). Se non c'è
  niente di utile il bottone NON compare: uno che apre una pagina a caso
  insegna a non premerlo.

**L'aggancio dei nomi, due lezioni pagate in prova.**

1. I documenti ABBREVIANO («WORLD-ENG» per «[Deluxyflowers] - WORLD - ENG»):
   il confronto esatto agganciava 2 campagne su 9. Ora è normalizzato (solo
   lettere e cifre, contenimento in entrambi i versi, mai sotto le 6 lettere)
   e **filtrato su brand+canale dell'analisi** — «Brand protection» citata in
   un'analisi Flowers non deve combaciare con quelle di Gifts e Cake.
2. ⚠️ **L'ambiguo NON si aggancia** (cercare non è affermare): «VENDITE»
   combacia per contenimento con NOVE campagne Meta — ma una si chiama proprio
   così, e **l'uguaglianza esatta vince sul contenimento**. Se i candidati
   restano più d'uno, niente link: il chip resta grigio.
   Dopo le due correzioni: 9 nomi citati su 9 agganciati giusti.

⚠️ **Trappola nuova, pagata in prova**: le structured outputs di Claude
**rifiutano `maxItems`** sugli array (400 « property 'maxItems' is not
supported»). I tetti stanno nelle istruzioni, lo schema tiene forma e cataloghi.

**Verificato davvero**, locale e produzione: cron end-to-end → `{"elaborate":2,"fallite":[]}`
— l'Analisi Meta Gifts (verdetto **ROSSO**, 8 KPI, 14 findings di cui 8 P0, 3
campagne) e l'Analisi Google Ads Flowers depositata oggi pomeriggio (**ROSSO**
per esecuzione ferma, ROAS 6,33 in ripresa, 6 campagne). Pagine lette dal DOM
in produzione: scheda ✓, card in elenco ✓, bottone ANALISI su VENDITE ✓ e
sulla WORLD-ENG ✓ (VENDITE rossa dall'analisi Meta, WORLD-ENG gialla da quella
Google: i due versi dell'aggancio). Build e deploy `ig98fj1fh`.

👉 **Da guardare con gli occhi** (regola «verifica utente»): aprire
https://deluxy-marketing.vercel.app/analisi e una scheda, dire se la forma va.


### ⭐⭐ L'ANALISI DI OGGI HA CONTESTATO L'APP, E AVEVA RAGIONE — su Meta lo stato restava congelato su ENABLED (25/08/2026)

L'`Analisi Meta Gifts` depositata su Drive il 25/08 alle 13:57 elenca 7
incongruenze fra documenti. La **I4** riguarda questa app:

> «`RISULTATI App Gifts 2026-08-25 0918` elenca DEF ATC e «INTERESSE - [Festa
> della Mamma] - LANDING PAGE» come **ENABLED**, mentre Ads Manager le dà «Non
> attivo/a» alle 12:00 dello stesso giorno.»

**Verificata sul database: vera.** E dietro c'erano **tre difetti in fila**,
tutti corretti, deployati e riprovati in produzione.

**1. Lo stato viaggiava attaccato alle INSIGHTS** (`src/lib/sync-meta.ts`).
La sync leggeva gli stati da `/campaigns` — che le riporta tutte, in pausa
comprese — e poi li applicava **solo alle campagne presenti nelle righe delle
insights**, cioè solo a quelle che avevano speso nella finestra. Una campagna
messa in pausa esce dalle insights dopo pochi giorni, e da lì il suo
`statoPiattaforma` **restava all'ultimo valore visto per sempre**: DEF ATC in
pausa dall'11/08 con lo stato fermo al 18/08. **La verità l'app ce l'aveva e la
buttava via.** Adesso gli stati si applicano a tutte le campagne che Meta
nomina, con la regola di sempre (`statoPiattaforma` è il fatto e si scrive
sempre; `stato` è il nostro giudizio e non si sovrascrive se è uno dei
nostri), e **quante ne allinea finisce nel registro**.

**2. Le archiviate su Meta vanno CHIESTE** (`src/lib/meta.ts`). Dopo la prima
correzione DEF ATC si è spenta, la «Festa della Mamma» **no**: Meta non la
nominava più, e la regola prudente («un'assenza non diventa spenta») la lasciava
accesa. Giusto come principio, sbagliato come risultato — perché il silenzio si
poteva **togliere di mezzo domandando**: il nodo `/campaigns` di default
restituisce solo ACTIVE e PAUSED, e con `filtering` su `effective_status` le
archiviate arrivano. Con ripiego: se Meta rifiuta il filtro si riparte senza —
un miglioramento non deve poter spegnere la sync.

**3. Due campagne FANTASMA nel file per il custode** (`src/lib/ponte-risultati.ts`).
Su Cake due righe non hanno **mai** avuto un `idEsterno`: vengono da un import
vecchio che creava le campagne per NOME, e sono gemelle di campagne vere col
brand appiccicato («[Continuativa] ATC (Cake)»). Nessuna sync può aggiornarle,
quindi il loro ENABLED è eterno — e nel `RISULTATI App Cake` del 25/08
comparivano entrambe come accese a zero spesa, con `[Continuativa] ATC` che
risultava **due volte**: una vera con 451,66 € e una fantasma a zero. Adesso il
ponte non dichiara accesa una campagna senza id. **Non si cancella niente**: si
smette solo di affermare una cosa che il file promette di non affermare.

**Provato in produzione, non dedotto**: due sync Meta vere dopo i deploy →
`statiAllineati` 2+1+5 al primo giro e 1 al secondo; DEF ATC → **PAUSED**, Festa
della Mamma → **PAUSED**; le campagne Meta che l'app dice accese sono passate da
**10 a 8** — e va detto giusto: **6 vere + i 2 fantasmi senza id**, che il ponte
filtra ma il database conserva. Sul perimetro coperto dall'analisi (Gifts) le
accese vere sono 2 — VENDITE e [Palloncini] AWARENESS — e **coincidono**.

⚠️ **Le due righe fantasma restano nel database** (marcate `defunta` da noi,
`statoPiattaforma` ENABLED, senza id): non le tocco senza mandato. Vanno
guardate insieme — sono duplicati, non campagne.

⭐ **La lezione più larga**: questa incongruenza l'ha trovata **un lettore
esterno che confrontava il file dell'app con la sua fonte**. L'app da sola non
poteva accorgersene, perché il suo dato e il suo file dicevano la stessa cosa —
[[trappola-confronto-con-il-proprio-specchio]] in azione. Le analisi depositate
su Drive non sono solo output: sono **il controllo esterno di questa app**, e
vanno lette.


### ✅ LO SCRIPT DICE CHI È — e i tre tipi mai provati smettono di essere un mistero (25/08/2026)

**Il problema, detto bene.** Su Google non esegue l'app: esegue una **copia di
`scripts/google-ads-script.js` incollata a mano dentro l'account**, una per
conto. L'app non la vede, non la aggiorna e non sa che versione sia. Finché è
così, «il conto Cake sa eseguire `localita`?» è una domanda **senza risposta**:
l'unico modo di rispondere era accodare un'operazione **vera** e guardare come
finiva — cioè spendere una modifica su un account vero per fare una prova.

Ed era esattamente il punto aperto n°1 di ieri: `lista_negative`, `localita` ed
`estensione` vivono in `applica()` da settimane e **non sono mai state messe in
coda nemmeno una volta** (ricontato oggi: 0 righe di quei tre tipi, da sempre).
Le copie incollate potevano essere di prima o di dopo, e l'unica fonte era il
ricordo di chi le aveva incollate.

**La correzione.** La copia si presenta:

- `scripts/google-ads-script.js` porta `VERSIONE_SCRIPT` e `SO_ESEGUIRE` (i
  tipi che `applica()` conosce), e li manda **insieme alla richiesta del
  lavoro** — `GET /api/v1/operazioni?…&conto=…&versione=…&sa=…`. Nessuna
  chiamata in più: quella la faceva già.
- `/api/v1/operazioni` se lo segna in `Impostazione` (`script.esegui.<conto>`),
  la stessa forma del marcatore del censimento negative. **Non cambia niente
  della risposta**: chi non dichiara riceve il lavoro come prima. Registrare
  non è un permesso.
- `/operazioni` lo **mostra**, conto per conto: versione, ultimo giro, e i tipi
  che quella copia *non* sa eseguire. Si vede sempre, anche quando va tutto
  bene — «nessun avviso» e «non l'ho guardato» si somigliano troppo.
- `accodaOperazione()` attacca l'avviso all'operazione che nasce: «la copia sul
  conto X non sa eseguire *questo* tipo». Sta **lì** e non nella rotta API per
  lo stesso motivo per cui ci sta `account`: le operazioni nascono da undici
  punti diversi. **Avvisa, non blocca** — una copia reincollata un minuto fa
  non ha ancora fatto il suo giro, e rifiutare punirebbe il caso normale.

⭐ **Perché funziona SUBITO, senza che il vecchio script collabori: l'assenza è
la risposta.** Una copia più vecchia di oggi non manda niente — e «questo conto
non dichiara nulla» vuol dire esattamente «la sua copia è più vecchia del
25/08». Non serve che il vecchio parli: basta che il nuovo lo faccia.

**Verificato davvero** (non «dovrebbe funzionare»): `npx tsc --noEmit` pulito ·
`node scripts/prova-script-google.mjs` = 12 lavori su 12 ok, 0 rotti ·
`npm run build` completato · chiamata vera al server locale con un conto
**finto** (`000-000-PROVA` — mai uno vero: scriverebbe una dichiarazione
falsa) → `HTTP 200` e riga scritta
`{"versione":"2026-08-25","sa":[…],"visto":"…"}`, **poi cancellata** · pagina
`/operazioni` letta dal DOM: i tre conti veri compaiono tutti e tre con «non
dichiara la sua versione», che oggi è la verità.

⚠️ **Cosa resta a una persona**: reincollare le 11 copie rigenerate oggi in
`Downloads\deluxy-google-ads` (`CHIAVE_API` e `BRAND` a mano). Il riquadro
diventa verde da sé, un conto per volta, al primo giro di «esegui».


### ✅ LA WORLD-ENG EROGA E CONVERTE, e la catena regge tutta (25/08/2026)

La campagna che il 17/08 **non nasceva** — bulk upload rifiutato per «Missing
value in EU political ads», e l'app che diceva «eseguita» — adesso è viva.
Contato sul database il 25/08:

| | |
| --- | --- |
| stato nell'app | `attiva` |
| stato su Google | **`ENABLED`** |
| `idEsterno` | **24147855987** — Google l'ha censita, quindi esiste davvero |
| dati | 3 giorni (23→25/08) |
| spesa · clic · conversioni | **37,46 €** · 37 · 2 |
| ricavi | **222,66 €** → ROAS **5,9×** |
| struttura | 9 località · 15 keyword |

⭐ **La verifica si è chiusa da sola, ed è il punto.** Il rilevatore delle
campagne «non confermate» (`lib/campagne-non-confermate.ts`) incrocia i giri di
anagrafica con `idEsterno`/`statoPiattaforma`: appena Google ha nominato la
campagna, l'avviso è sparito senza che nessuno lo togliesse a mano. Oggi le
**campagne lanciate e non confermate sono 0**. Un avviso che si spegne da solo
quando il fatto cambia è l'unico che si può lasciare acceso senza che diventi
rumore.

**Stato della coda al 25/08**: 96 eseguite · 7 annullate · **1 fallita** · **0 in
attesa, 0 approvate ferme**. L'unica fallita è nota ed è del 21/08: il secondo
annuncio sulla WORLD-ENG, respinto da Google con `DUPLICATE_ASSET` («Assets are
duplicated across operations», headline 9) — è il tentativo di doppione, non un
guasto dell'app.



### ⭐⭐⭐ 92.731 PAROLE ESCLUSE, e il censimento ha trovato il residuo di un difetto chiuso il 06/08

Reincollati gli script su tutti e tre i conti. Censimento **completo su 3 conti
su 3** — Flowers 17:14 (18.357 righe), Cake 17:55 (4.268), Gifts 18:12
(**70.106**).

| conto | righe | campagne | parole diverse | di campagna | di gruppo |
| --- | --- | --- | --- | --- | --- |
| Gifts 248-656-1148 | 70.106 | 93 | 12.476 | 27.778 | 42.328 |
| Flowers 825-518-1560 | 18.357 | 31 | 5.283 | 3.681 | 14.676 |
| Cake 846-090-5423 | 4.268 | 7 | 3.542 | 1.421 | 2.847 |
| **totale** | **92.731** | **131** | | | |

⚠️ **Gifts ha impiegato tre minuti e 350 blocchi**, e per un pezzo del giro il
marcatore non c'era: **non era un guasto, era che stava ancora scaricando.** Me
ne sono accorto solo perché ho rimisurato invece di concludere — la prima
lettura, presa a metà corsa, sembrava «finito senza dichiarare completo». Su un
account grande il censimento non è istantaneo, e chi guarda troppo presto legge
un guasto che non c'è.

**IL PRIMO RISULTATO UTILE — 27 operazioni `negativa` eseguite: 21 confermate,
3 «su Google ma diverse», 3 «non risultano».**

⭐⭐⭐ **Le tre diverse sono il RESIDUO di un difetto già chiuso.** Tutte e tre
(«flora fiori a domicilio», «fiori online» ×2, su *[Deluxy] - Fiori Milano ITA*)
erano state chieste **a frase** o **esatte** e su Google sono **generiche**. Sono
del **04-06/08** — cioè la finestra del difetto *«Una keyword ESATTA finiva in
coda come GENERICA»*, corretto il **06/08** e descritto in FATTO con le parole
giuste: *«da esatta a generica, l'allargamento più pericoloso che esista, in
silenzio»*. **Il codice era stato corretto, le negative che aveva già sbagliato
no** — e sono rimaste a bloccare più ricerche del dovuto per diciotto giorni,
senza che nessuno potesse vederlo. Una negativa **generica** su «fiori online»
spegne ogni ricerca che contenga quelle due parole in qualunque ordine.
🔴 **Da correggere a mano in Google Ads**: togliere le tre generiche e rimetterle
con la corrispondenza voluta.

🔴 **Le tre che non risultano**: «flowers milan» su *Fiori Milano ENG* (accodata
due volte il 04/08, broad e poi exact — e su Google non c'è né l'una né l'altra)
e «fiori delivery milano» su *Fiori Milano ITA* — che però **è esclusa su
*Fiori Milano ENG*** (esatta). O non sono mai passate, o qualcuno le ha tolte
dopo. Sono del **04/08**, il primo giorno in cui lo script eseguiva davvero.
⚠️ Prima di rifarle, guardare se sono state tolte apposta: «flowers milan»
escluso dalla campagna inglese di Milano sarebbe una scelta strana, e potrebbe
essere stata **corretta a mano proprio per questo**.

⭐ **La lezione che vale oltre questo caso**: correggere il codice non corregge
ciò che il codice ha già scritto **fuori** dall'app. Per diciotto giorni la
correzione del 06/08 è sembrata completa perché nessuno poteva rileggere il
risultato. Un difetto che scrive su un sistema esterno ha **due** rimedi, e il
secondo si dimentica sempre.

### ⭐⭐ NEL PONTE C'È LO STORICO DA INIZIO AGOSTO E LO STATO ATTUALE (25/08/2026, 09:18)

**Scritti davvero, verificati rileggendo la cartella da Drive** — non «il codice
c'è», ma i file ci sono:

| file | contenuto |
| --- | --- |
| `APPEND 00.2 App-Azioni 2026-08-25 0918.md` (40 KB) | **97 voci** dal 01/08 |
| `RISULTATI App Gifts 2026-08-25 0918.md` (6 KB) | 32 righe |
| `RISULTATI App Flowers …` (4 KB) | 16 righe |
| `RISULTATI App Cake …` (3 KB) | 14 righe |

- L'APPEND comprende anche le **NON eseguite**: un annuncio rifiutato da Google
  è un fatto che il progetto di brand deve conoscere, non un non-evento. La
  riga lo dice — `NON ESEGUITA — Error: …DUPLICATE_ASSET…` — invece di lasciare
  un «—» che sembra un dato mancante.
- I RISULTATI seguono il **§3**: una riga per campagna **ENABLED** per finestra
  (7gg e 30gg chiuse a ieri), solo numeri e **note fattuali**, nessun giudizio.
  Un rapporto che non si può calcolare è **`n.d.`**, non zero. Una campagna
  attiva senza dati nella finestra c'è lo stesso, con la nota: «non compare» e
  «ha speso zero» sono due cose diverse.

⚠️⚠️ **IL DIFETTO TROVATO DALL'ANTEPRIMA, prima che i file nascessero.** Metà
delle campagne Cake si chiamano `[Cakedesign] | Sales | ITA`, e il carattere
`|` dentro una cella **spezza la tabella Markdown**: il file sarebbe arrivato al
custode con la spesa sotto «Stato» e il ROAS sotto «Valore», e **nessuno se ne
sarebbe accorto** leggendo il sorgente. Ora le celle sono protette (`cella()`),
e la prova conta le colonne riga per riga: 14 righe su 14 con le stesse 13
colonne. **È esattamente il motivo per cui l'anteprima esiste**: il ponte è
append-only, un file sbagliato non si corregge — si può solo affiancare.

Cron: `/api/cron/ponte` ogni sera 22:40 (log azioni) · `/api/cron/risultati` il
**lunedì** (snapshot KPI, come chiede il modello). Più i bottoni «Deposita il log
azioni ora» e «Deposita lo stato attuale» in `/impostazioni`, che usano **le
stesse funzioni dei cron**, non copie.

🔴 **Restano fuori dal ponte**: **§4 SEGNALAZIONE** (il vaso giusto per le tre
negative generiche invece che esatte — ⚠️ e **l'app non sa togliere una
negativa**: non esiste quell'operazione, quindi è materia da segnalare, non da
riparare), **§5 RICHIESTA**, **§6 LANCIO** (obbligatorio a ogni campagna creata,
e l'app le crea).

### ⭐⭐ L'APP DEPOSITA SU DRIVE QUELLO CHE HA FATTO (24-25/08/2026)

Il ponte era aperto e non ci passava niente. Adesso c'è **`lib/ponte-drive.ts`**,
che compone l'**APPEND 00.2 App-Azioni** nel formato del **§2 di
`ads/Definitivi/MODELLO Ponte App Azioni.md`** — non inventato: letto su Drive
con le credenziali dell'app appena collegate. ⚠️ Il modello prevede **sei** tipi
di file, non quattro come diceva il `_LEGGIMI`: c'è anche **§6 LANCIO**,
obbligatorio lo stesso giorno di ogni campagna creata.

Una riga per operazione eseguita: canale, brand, campagna con id, stato PRIMA →
DOPO, autorizzazione, esito. Tre scelte dichiarate:
- **Nell'esito va la CONFERMA INDIPENDENTE**, non la parola dello script. Il
  modello chiede «esito verifica immediata», ma è proprio la verifica immediata
  che il 23/08 ha dichiarato un dubbio su venti negative tutte a posto.
- **L'autorizzazione si dice com'è**: nell'app è l'approvazione in coda, con nome
  e data. Non si scrive «briefing [data]» se un briefing non c'era.
- **Il segno «già depositato» si sposta solo dopo una scrittura riuscita**, o un
  errore di rete farebbe sparire quelle operazioni dal ponte per sempre.

Cron serale **22:40 di Roma** (`/api/cron/ponte`) più il bottone **«Deposita il
log azioni ora»** in `/impostazioni`, che usa **la stessa funzione del cron**, non
una copia. E un'**anteprima** (`{ anteprima: true }`): il ponte è append-only,
un file sbagliato non si corregge — si può solo affiancare, quindi il testo si
legge prima che nasca.

🔴 **QUELLO CHE ANCORA NON VA NEL PONTE**, per non crederlo completo:
- **il passato**: il primo giro parte da 24 ore fa (scelta dichiarata nel codice —
  un APPEND con dentro un mese non lo consolida nessuno);
- **le operazioni FALLITE**: solo le `eseguita` entrano, e ce n'è una ferma dal
  21/08 (`nuovo_annuncio`, `DUPLICATE_ASSET`);
- **il censimento delle 92.731 parole escluse**: non è un'azione;
- **le tre negative generiche invece che esatte** (residuo del difetto del 06/08):
  è materia da **§4 SEGNALAZIONE**, non costruita;
- **§3 RISULTATI**, **§5 RICHIESTA**, **§6 LANCIO**: non costruiti. Il più urgente
  è **LANCIO**, che il modello marca obbligatorio e l'app le campagne le crea.

⚠️ **Al 25/08 mattina nella cartella OUT non c'è ancora nulla**: il codice è in
produzione, ma il primo file nasce col bottone o col cron delle 22:40.

### ⭐ IL PONTE SU DRIVE È APERTO — tre errori in fila, e nessuno era quello che sembrava (24/08/2026, sera)

Stato finale: `via: "utente"`, collegato come **deluxy.delivery@gmail.com**,
cartella OUT trovata, `errore: null`. Per arrivarci sono caduti tre ostacoli,
e **ognuno dava un messaggio che indicava la cosa sbagliata**:

1. **«Client is unauthorized to retrieve access tokens using this method»** —
   sembrava un problema di credenziali OAuth. Era il campo **«Agisci per conto
   di»**, compilato con `deluxy.delivery@gmail.com`: è la cosa naturale da
   provare, ma l'**impersonazione esiste solo su un dominio Workspace**, dove un
   amministratore autorizza la delega. Su un Gmail non c'è nessun
   amministratore, e Google risponde così. ⚠️ E finché quel campo è compilato
   l'app tenta **sempre** quella strada, anche dopo un consenso OAuth valido.
2. **«Non trovo la cartella "ads"»** — sembrava un problema di percorso o di
   condivisione. Era l'**ambito**: si chiedeva `drive.file`, che dà accesso ai
   soli file **che l'app ha creato lei**. La cartella `ads` esiste da prima ed è
   di una persona: con quell'ambito l'app non la vedeva nemmeno. Passati a
   `drive` pieno. Era stato giusto partire dal minimo — adesso è **misurato**
   che non regge, e sta scritto nel codice perché nessuno ci riprovi.
3. **«Collegato» senza dire come chi** — mancava l'ambito `email`: senza, la
   chiamata a `userinfo` non risponde e l'app non sa con quale account scrive.

⚠️⚠️ **E il difetto che è costato più tempo di tutti e tre: un esito negativo
vestito da conferma.** La cornice degli esiti era sempre verde, con la spunta —
anche su «Scrittura NON riuscita» e «Collegamento non riuscito». **La forma
diceva *fatto*, il testo diceva *non fatto*, e la forma vince**: il collegamento
è stato rifatto due volte credendo che funzionasse. Ora i fallimenti hanno
cornice rossa e una ✕ (`ESITI_NEGATIVI` in `/impostazioni`, `.conferma.esito-no`).
*Un messaggio d'errore che nessuno legge come errore non è un messaggio d'errore.*

🔴 **RESTA IL PEZZO PRINCIPALE, ed è quello di prima**: il ponte è **aperto**, ma
**l'app continua a non depositare niente**. `scriviInOut()` ha ancora un solo
chiamante, il bottone «Prova scrittura». Serve il formato dei quattro file da
`ads/Definitivi/MODELLO Ponte App Azioni.md` §2-5 — che né l'account di servizio
né la chiave API riescono a leggere. Da chiedere all'utente, o condividere quel
documento con `app-deluxy@deluxy.iam.gserviceaccount.com`.

### 🔴 Com'era prima: il ponte costruito e non collegato a niente (24/08/2026)

Segnalato: *«su Drive l'app non ha messo nessun file su quello che è stato
fatto»*. **Vero, e non è un guasto.** Verificato chiedendo direttamente a Google
con le credenziali dell'app:

- Nella cartella `ads/App Azioni/OUT - dall'app` c'è **un solo file**:
  `_LEGGIMI.md` del **27/07**, di `deluxy.delivery@gmail.com` — cioè scritto
  dall'utente. **L'app non ha mai depositato niente.**
- **La causa**: `scriviInOut()` ha **un solo chiamante in tutto il codice**, il
  bottone «Prova scrittura» in `/impostazioni`. Non esiste nessun punto che
  produca i quattro file che il `_LEGGIMI` dichiara —
  `APPEND 00.2 App-Azioni [data].md` (log azioni), `RISULTATI App [Brand]`,
  `SEGNALAZIONE App [Brand]`, `RICHIESTA App [Brand]`. Il ponte è stato
  costruito tutto (protocollo, regole append-only, scrittore, diagnosi) e non è
  mai stato **collegato a chi dovrebbe alimentarlo**.
- **I permessi ci sono**: la cartella è condivisa con
  `app-deluxy@deluxy.iam.gserviceaccount.com` con `canAddChildren: true`.
  ⚠️ **Ma è una cartella normale, non un Drive condiviso** (`driveId` assente) e
  `drive.impersona` **non è impostata**: il commento in `drive-scrittura.ts`
  avverte che un account di servizio *non ha quota di archiviazione* e la
  creazione fallisce. Un clic su «Prova scrittura» lo dice in tre secondi —
  non l'ho fatto io perché lascerebbe un file in una cartella che altri leggono.
- ⚠️ **E anche scrivendo, l'app non se ne accorgerebbe**: l'ultima sync Drive è
  del **04/08**, l'indice è fermo al 07/08, e la sync **non ha un cron**.

⚠️ Il formato dei quattro file sta in `ads/Definitivi/MODELLO Ponte App Azioni.md`
§2-5, che **né l'account di servizio né la chiave API riescono a leggere**: alla
prima è condivisa solo la cartella OUT, la seconda non ha permessi su quel file.
Serve che l'utente lo incolli, o che condivida quel documento con l'account di
servizio. **Senza il formato non si costruisce il deposito**: un APPEND che il
custode non riesce a consolidare è peggio di nessun APPEND.

### ⭐ TIKTOK: c'era tutto tranne chi lo facesse partire (24/08/2026)

Chiesto dall'utente: «dammi come collegare TikTok». Guardando il codice per
scrivere i passi è saltato fuori che i passi **non sarebbero bastati**.

Dal 27/07 c'erano token, pagina in `/impostazioni`, registro degli advertiser,
lettura della Business API v1.3, gestione delle metriche che TikTok rifiuta.
Ma la sincronizzazione viveva **dentro** `POST /api/v1/sync/tiktok`, cioè dietro
una chiave di scrittura: la poteva chiamare solo una persona o uno script.
**Nessun cron.** Collegare TikTok avrebbe prodotto zero righe finché qualcuno
non chiamava l'endpoint a mano — cioè mai. È lo stesso buco che Meta aveva fino
al 28/07, e per cui era stato scritto `lib/sync-meta.ts` con il suo cron.

Fatto: motore in **`lib/sync-tiktok.ts`**, cron **`/api/cron/tiktok`** ogni due
ore al minuto **37** — sfalsato da Meta (:07) e dagli ordini (:20), perché tre
giri che partono insieme si contendono lo stesso pool del Postgres condiviso e
`connection_limit 5` non perdona. Il cron resta **chiuso** senza `CRON_SECRET`, e
distingue «TikTok non collegato» (503) e «nessun advertiser censito» (400) da un
guasto vero, così nel registro si legge **cosa manca**. Provato in produzione:
`401` senza il segreto, non `404`.

⚠️⚠️ **E il giro era in TRE copie.** Oltre alla rotta e al cron, il bottone
«Aggiorna TikTok ora» aveva la sua dentro `azioni.ts` — **e non era identica**:
non scriveva la consegna in `/ricezione` e non chiamava `deduciTipoConversione`.
Premendolo, i dati entravano **senza lasciare traccia**, e la pagina che serve a
rispondere a «cosa sto ricevendo e da quando» non ne sapeva niente. Adesso tutte
e tre passano dalla stessa libreria. *Tre copie della stessa cosa non restano
uguali: divergono, e la differenza si scopre mesi dopo guardando un numero che
non torna.*

🔴 **PER COLLEGARLO SERVONO DUE COSE, e le ha solo una persona**:
1. un **access token** da un'app *TikTok for Business* autorizzata
   sull'advertiser, con lettura dei report (l'app chiama
   `/report/integrated/get/` e `/campaign/get/`);
2. l'**ID numerico dell'advertiser** (18 cifre, da TikTok Ads Manager).
Poi: Impostazioni → **TikTok Ads** per il token, e Impostazioni → **Account
pubblicitari** → piattaforma *TikTok Ads* per l'advertiser. Da lì il cron fa
il resto da solo. ⚠️ Il token sta nel **database**, non fra le variabili
d'ambiente: è una scelta dichiarata in pagina — un token scade e cambiarlo non
deve richiedere un deploy.

⚠️ **Quello che arriva è meno di Google**: TikTok dà il **ritorno** (ROAS), non
l'importo incassato, quindi i ricavi sono `ROAS × spesa` — un numero **derivato**,
e l'app lo dichiara. Se TikTok rifiuta una metrica, la sync salva lo stesso
spesa e clic e dice quale manca.

### ⭐⭐⭐ IL CENSIMENTO DELLE PAROLE ESCLUSE È ARRIVATO, e il dubbio era un falso allarme (24/08/2026, 17:13)

L'utente ha reincollato gli script. Misurato subito dopo, sul database di
produzione:

- **18.357 parole escluse** consegnate da Flowers (825-518-1560) in **92
  blocchi**, su 31 campagne: 3.681 di **campagna**, 14.676 di **gruppo**.
  5.283 parole diverse — l'archivio di anni di esclusioni, che l'app non aveva
  mai visto.
- ✅ **Il marcatore di censimento completo è arrivato** (`negative.censimento.825-518-1560`,
  17:14:11): la rete contro l'elenco troncato ha fatto il suo giro per davvero,
  non solo nella prova in locale.
- ✅ **Tutte e VENTI le operazioni `negativa` della WORLD-ENG sono
  confermate** — non solo le dieci di ieri sera. Google le riporta tutte, a
  livello campagna, **con la corrispondenza chiesta**. Compreso `cheap`, che
  risulta due volte (esatta e a frase) esattamente come l'esito dello script
  aveva dichiarato.

⭐⭐ **QUINDI IL DUBBIO ERA UN FALSO ALLARME, ed è la lezione che vale.** Le dieci
negative di ieri erano uscite tutte con «rileggendo la campagna non risulta
ancora: ricontrollare al prossimo giro». Non era un rifiuto muto: era **la
rilettura dentro la stessa esecuzione che vedeva ancora lo stato di partenza**,
esattamente il sospetto scritto nel commento di `negativaPresente`. Chi avesse
letto quell'esito come un guasto avrebbe rifatto venti esclusioni già fatte.
**Un dubbio dichiarato non è una smentita** — e serviva un dato indipendente
per chiuderlo, che è precisamente il motivo per cui questo giro esiste.

### ⭐⭐ LE ORE ERANO QUELLE DI GREENWICH, in tutta l'app (24/08/2026)

Trovato dallo screenshot di un'operazione mandato dall'utente: la scheda diceva
**«24/08/2026, 10:49»**, il database **12:49** ora di Roma. `formattaDataOra`
non dichiarava il fuso e su Vercel il runtime è UTC — quindi **ogni data e ora
dell'app** era indietro di due ore d'estate, una d'inverno. Non solo la
dashboard: la coda operazioni, /ricezione, le bozze, i grafici, il registro.

Passata mirata sui soli formattatori di **data e ora**: **35 punti in 18 file**.
⚠️ Numeri e valute **non** toccati — il filtro esclude `style`, `currency`,
`FractionDigits` e `useGrouping`, e richiede che le opzioni contengano almeno
un campo di data. Verificato in produzione: adesso la riga dice **12:49**.

⚠️ È lo stesso difetto di `andamento-mese.ts` di stamattina, in un altro punto:
là erano i **confini** dei periodi, qui la **visualizzazione**. Chi ne trova uno
cerchi l'altro — `grep -rn "toLocale" src/ | grep -v timeZone`.

### ⭐ L'avviso del change control dice COSA avevi già cambiato (24/08/2026)

Chiesto dall'utente guardando la coda: *«mostrami quali sono le modifiche già
fatte»*. L'avviso diceva «seconda modifica sulla stessa campagna in 69 ore» e
si fermava lì: un fatto vero e **inutilizzabile**, perché per decidere serve
sapere *cosa* era stato cambiato, e chi legge doveva andarselo a cercare nello
storico. Adesso la nomina — «la precedente era **17 €/g → 15 €/g** (L2)» — e
dice **fino a quando aspettare** perché sparisca («fino alle 24/08, 16:09»):
così diventa una decisione invece di un rimprovero.

⚠️ **Si vede dalla prossima operazione messa in coda, non su quelle già lì**:
`OperazioneAdv.avvisi` è una **stringa salvata** al momento dell'accodamento
(di proposito: è il paper trail di cosa disse il change control allora). Le
righe già in coda continuano a mostrare il testo vecchio.

🔴 **DOMANDA APERTA, non risolta**: quel testo salvato **invecchia**. La riga
delle 12:49 dice «69 ore» anche letta alle 15:00, quando ne sono passate 71 — e
il numero serve proprio a chi approva, cioè dopo. O l'avviso si ricalcola per le
operazioni ancora *da approvare* (e allora non è più un paper trail), o accanto
al testo salvato va scritta l'ora in cui fu calcolato. Non l'ho deciso io: è una
scelta di disegno, e il paper trail è stato voluto apposta.

### ⭐⭐ I TRE SCOSTAMENTI dal contratto dati, chiusi (24/08/2026 pomeriggio)

**1. La password non apre più l'app quando manca.** `middleware.ts` era
fail-OPEN anche su Vercel: un rename o un typo della variabile e il deploy
successivo metteva online la memoria ADV, le Impostazioni e **la coda che
scrive su Google Ads e Meta** — senza che nessuno se ne accorgesse, perché
l'app «funziona» benissimo, solo per chiunque. Ora **503**, stessa forma di
`deluxy-merchandising`.

**2. Via il nome e l'email dei clienti, e la sostituzione è MIGLIORE
dell'originale.** Erano 8.446 ordini copiati qui, 6.486 con l'email e 8.152 col
nome, e non li usava nessuna schermata: il nome stava in un sottotitolo
dell'elenco, l'email serviva solo a contare clienti nuovi contro clienti di
ritorno. ⭐ Quella risposta **Orders la manda già in ogni ordine**
(`cliente.ordiniPrima`) — e la sua è più giusta: qui si guardava il primo
ordine con quella email **nell'archivio di questa app**, che parte dal
01/01/2025, quindi un cliente del 2024 che tornava risultava **nuovo** e
nessuno poteva accorgersene. Riempiti **8.159 ordini su 8.448 (97%)**: 6.350
nuovi, 1.809 di ritorno. La rotta `/api/v1/ordini` adesso **elenca i campi**
invece di fare `include` sul record intero — con l'include ogni colonna futura
sarebbe uscita di lì senza che nessuno lo decidesse.

⚠️⚠️ **TRAPPOLA PAGATA DUE VOLTE, e sta scritta nel codice che l'aveva già
pagata**: un campo NUOVO non entra mai negli ordini già presenti — che sono la
quasi totalità — se non lo si mette **anche nel controllo «è cambiato?»**. Al
primo giro si erano riempiti **246 ordini su 8.448**, e lo script dichiarava
allegramente «8.159 già uguali». Identico a quello che era successo con la
provincia il 02/08, con il commento a due righe di distanza.

🔴 **RESTA UN PASSO, e serve il permesso**: le colonne `cliente` ed `email`
sono ancora **fisicamente nella tabella** — il codice non le legge e non le
scrive più, ma i valori sono lì. Il comando c'è ed è già stato provato a vuoto:

    node scripts/ordini-senza-dati-personali.mjs --togli

Si rifiuta di partire sotto il 95% di riempimento (siamo al 97%). ⚠️ Va
lanciato **dopo** il deploy, che è già andato: la produzione non le legge più.

**3. Le credenziali: l'ambiente comanda, il database è il ripiego.** Erano
**tre** in chiaro su un Postgres condiviso da quattordici app con un solo
utente — `drive.service_account` (2.343 caratteri, la chiave privata Google),
`ai_chiave_anthropic` (108), `drive.apikey` (39). Non è un rischio teorico: è
una `SELECT`. ⚠️ L'audit ne aveva vista **una**: la chiave Anthropic è saltata
fuori solo guardando tutte e sette le impostazioni una per una.

⚠️ **Due punti leggevano già dall'ambiente, ma come RIPIEGO**: il valore del
database vinceva, quindi mettere la chiave fra le variabili **non la
disattivava** — restava lì, leggibile, e nessuno se ne accorgeva perché l'app
funzionava. Invertita la precedenza in `src/lib/segreti.ts`; il ripiego sul
database resta per lo sviluppo locale.

🔴 **RESTANO DUE PASSI, e sono di una persona**:

    node scripts/segreti-fuori-dal-db.mjs --scrivi .env.segreti
    # incollare le variabili su Vercel, poi cancellare il file
    node scripts/segreti-fuori-dal-db.mjs --togli

Lo script **non stampa mai i valori** e si rifiuta di cancellare una riga la cui
variabile d'ambiente non esiste ancora. ⚠️⚠️ **E comunque VANNO RUOTATE**: sono
state in chiaro per settimane su un database condiviso, e spostarle non
cancella il passato. Chiave Drive e account di servizio dalla Google Cloud
Console, chiave Anthropic dalla console Anthropic.

### ⭐ I ricavi sulle schede campagna (24/08/2026)

Il ROAS era il rapporto fra due numeri di cui se ne mostrava **uno solo**: si
vedeva quanto è uscito e un moltiplicatore, non quanto è entrato. Per decidere
se alzare un budget serve l'ordine di grandezza, non solo il rapporto — *5× su
26 €* e *5× su 2.600 €* sono la stessa cifra e due situazioni diverse. Il dato
era già calcolato per il ROAS, mancava solo a schermo (l'archivio delle spente
la colonna «Incasso» ce l'aveva già). Verificato in produzione: 86 schede su 86
mostrano spesa e ricavi.

### ⚠️ Un commit di questa sessione è finito dentro quello di un'altra

I file di marketing di stamattina (i tre scostamenti) sono dentro
**`8c7a7335` «Ordini: il costo del fornitore si comunica a Orders»**, che è di
un'altra sessione. In `scoutwt` **l'indice git è uno solo**: avevo i file in
stage, l'altra sessione ha fatto `git commit`, e se li è portati via tutti e
quindici. Verificato che il contenuto sia **integro e su origin** (nessuna
differenza fra il disco e `origin/scout-ui`). Non ho riscritto la storia: il
ramo è condiviso e un'altra sessione ci sta lavorando sopra — riscriverlo
sarebbe stato molto peggio del messaggio sbagliato. **La regola per la
prossima volta**: `git add` e `git commit` nello **stesso comando**, mai
separati da altro lavoro.

### ⭐⭐ «22 GIORNI CONCLUSI» era di calendario, non dei dati — e i confini del mese erano a Greenwich (24/08/2026)

Segnalato dall'utente guardando la dashboard: *«dovrebbero essere 23 giorni»*.
Erano due difetti diversi, uno dei quali non c'entrava niente col conteggio.

**1. Il confine del mese era calcolato sull'orologio del SERVER, e su Vercel è
UTC.** In produzione la finestra di agosto andava dalle **02:00 del 1** alle
**02:00 del 23**, ora di Roma. Misurato sui dati veri: un ordine da **135 €**
del 1° agosto (fra le 00:00 e le 02:00) **non era contato da nessuna parte**, e
uno da **130 €** del 23 entrava dentro i «22 giorni conclusi» — dentro un
giorno che la stessa riga dichiarava non concluso. E per due ore ogni notte
«che mese è» era il mese prima: il 1° settembre alle 00:30 la dashboard avrebbe
aperto ancora su agosto. Spiccioli in euro, ma **è la regola a essere
sbagliata**: il risultato cambiava con l'ora in cui si guardava.

Nuovo `lib/fuso.ts` — `mezzanotteRoma`, `oggiRoma`, `confiniMeseRoma`. Niente
librerie: `Intl` il fuso lo sa già, cambio dell'ora compreso. ⚠️ Lo scarto si
calcola **due volte**: la prima ipotesi cade dalla parte sbagliata del salto
nelle due notti del cambio d'ora, e senza il secondo giro la «mezzanotte»
sarebbe l'01:00 o le 23:00 del giorno prima. Provato con TZ di sistema **e con
`TZ=UTC`** (come Vercel): 1/08, 1/01, **29/03** e **25/10** danno tutti
00:00:00 italiane, e i mesi del cambio d'ora contano comunque 31 giorni.

⚠️ **Lo stesso difetto era in altri tre punti** che parlano dello stesso mese, e
sono stati allineati insieme — o due pagine avrebbero detto mesi diversi:
`/budget/adatta`, `BudgetQuestoMese`, `VenditeAttese`.

**2. Il divisore era un conto di calendario, non una misura.**
`giorniConclusi = adesso.getDate() - 1`: non guardava mai l'archivio. Alle 23:49
del 23 la pagina diceva «22 giorni conclusi» e lasciava fuori **15 ordini e
2.123 €** che erano già in archivio — mentre la colonna si chiamava **«ad
oggi»**. Il nome e il numero dicevano due cose diverse.

**Scelto con l'utente** fra tre strade: «ad oggi» include oggi, e il ritmo si
divide per il **tempo davvero trascorso** dal primo del mese, non per giorni
interi. Contare oggi come un giorno pieno sarebbe stato l'errore opposto: alle
09:00 tre ore di ordini divise come una giornata intera fanno **crollare** la
media e la proiezione, per poi farle risalire fino a sera. Misurato stamattina
alle 09:28 su dati veri: 62.367 € in 23,395 giorni = **2.666 €/giorno**
(proiezione 82.640 €); dividendo per 24 giorni interi sarebbero stati 2.599 €
e 80.557 € — **2.000 € di proiezione in meno per il solo fatto di aver guardato
la mattina invece che la sera**.

- `giorniTrascorsi` (con la virgola) è il divisore di ogni media;
- `giorniToccati` è il numero che si mostra — il badge dice ora **«24 giorni su
  31»**, cioè in che giorno del mese siamo, che è come lo conta una persona;
- `giorniCompleti` (interi) resta per una domanda sola: quante giornate di
  spesa deve avere in archivio una campagna, perché quella di oggi la manda lo
  script stanotte e non si può pretenderla.

⚠️ **Sotto il primo giorno pieno non si proietta.** Non è prudenza: dividere per
0,04 giorni (l'una di notte del primo del mese) moltiplicherebbe per
venticinque qualunque cosa sia entrata. Provato fingendo l'orologio:
`giorniTrascorsi = 0,0417` → media e stima `null`, e la pagina mostra il
messaggio «mese appena cominciato» invece di un numero da capogiro.

⚠️ **Quello che resta indietro, ed è scritto in pagina**: la spesa pubblicitaria
di oggi arriva stanotte con lo script, quindi «speso al giorno» è leggermente
sottostimato fino al giro notturno. È l'unica asimmetria rimasta fra le due
metà della tabella.

**Provato**: `tsc` pulito, `npm run build` completo, prove del fuso 8 su 8 in
locale **e** con `TZ=UTC`; numeri letti dal DOM della pagina e confrontati con
una query indipendente (62.367 € · 329 ordini · 2666 €/g · 82.640 € — tutti
combacianti); invariante del mese chiuso verificata su **luglio**, dove la
proiezione è uguale al venduto vero (97.834 € = 97.834 €).

### ⭐⭐ LE PAROLE ESCLUSE si importano, e «negativa» ha una conferma vera (23/08/2026, sera)

Era l'unico pezzo di una campagna che l'app non riceveva mai. Costava due cose,
e la seconda si è vista proprio oggi.

**1. Le operazioni `negativa` erano senza prova.** `createNegativeKeyword()` non
restituisce niente: è l'unica scrittura dello script che non può dire se è
andata. L'unico controllo era la rilettura fatta **dentro la stessa
esecuzione** — e lì i selettori di Google vedono ancora lo stato di partenza.
Misurato stasera: **tutte e dieci** le negative di lancio della WORLD-ENG
(16:17) sono uscite con «rileggendo la campagna non risulta ancora:
ricontrollare al prossimo giro», e il giro dopo non le guardava.
`conferme-operazioni.ts` lo diceva a chiare lettere: *«L'app non importa le
keyword negative, quindi non ha un dato indipendente: fa fede la rilettura
dello script»* — cioè la parola di chi ha scritto, che è esattamente ciò che
tutto quel file esiste per non usare.

**2. Metà campagna era invisibile.** La scheda mostrava su cosa si SPENDE, mai
cosa è stato spento. Una ricerca che non arriva non lascia traccia da nessuna
parte: né per capire perché il traffico non c'è, né per accorgersi di
un'esclusione troppo larga.

**Cosa c'è adesso:**

- **Lavoro `negative` nello script** (`AZIONE = "negative"`, ed è dentro anche a
  `tutto`), con **due query, non una**: le negative di CAMPAGNA stanno in
  `campaign_criterion`, quelle di GRUPPO in `ad_group_criterion`. Due tabelle
  diverse per due cose diverse — una di campagna spegne la ricerca in tutti i
  gruppi, una di gruppo solo lì dentro. (Il giro `stati-keyword` incontrava le
  seconde e le saltava apposta: lì sarebbero parole su cui si spende.)
- **Tabella `NegativaCampagna`** (`node scripts/crea-tabella-negative.mjs`,
  **già lanciato in produzione**) e rotta **`POST /api/v1/ingest/negative`**.
  Il testo si archivia **nudo**, la corrispondenza in un campo suo: «cheap»
  esatta e «cheap» generica sono la stessa parola con due regole diverse, ed è
  il caso vero della WORLD-ENG.
- **Sezione «Parole escluse» sulla scheda campagna**, con la corrispondenza
  accanto (decide QUANTO blocca) e il livello (tutta la campagna / solo quel
  gruppo). Vuoto ≠ mai censite: due frasi diverse, come per le località.
- **`negativa` entra in `CONSEGNA_CHE_FA_FEDE`**: gli stessi sei stati degli
  altri tipi. «Esclusa su Google» · «Su Google, ma diversa» (chiesta esatta,
  trovata generica: blocca molto più di quanto si era deciso) · «Non risulta
  esclusa» · «Da confermare».
- **Copie dello script da un comando**, non più a mano:
  `node scripts/genera-copie-google.mjs` legge `LAVORI_LETTURA` dal sorgente,
  così un lavoro nuovo ha subito il suo file. Erano dieci file identici tranne
  una riga, rifatti a memoria ogni volta — e `negative.js` non sarebbe esistito.

⚠️⚠️ **LA TRAPPOLA PAGATA, trovata provandola.** Con un censimento **finto e
parziale** caricato in locale, l'app ha subito dichiarato **«Non risulta
esclusa» su sedici operazioni su diciannove**. Erano parole vere, già escluse
su Google: mancavano solo dal mio elenco a metà. Le righe arrivano a blocchi e
`inviaABlocchi` si ferma quando Google sta per scadere — un caso **normale**,
previsto e scritto. Un elenco troncato letto come completo accusa di un guasto
un giro semplicemente lento, e lo fa su tutte le parole insieme. Perciò: lo
script manda `{ completo: true }` **solo se ha spedito tutte le righe che
aveva letto**, l'app lo registra come `negative.censimento.<account>`, e
**senza quella dichiarazione non smentisce niente** — confermare invece si può
sempre, perché una riga che c'è, c'è. Rimisurato dopo la correzione: senza
marcatore **zero** smentite e la frase giusta («nessun censimento completo è
ancora arrivato da questo account»), col marcatore i verdetti tornano.
Il verso giusto in cui sbagliare è tacere, non accusare.

⚠️ **Il limite dichiarato, in pagina e dentro il verdetto.** Il censimento legge
i criteri della campagna e dei gruppi, **non le liste di esclusione condivise**
(vivono in `shared_set`). Se una parola sta in una lista applicata alla
campagna, quella ricerca è spenta lo stesso: leggere «non risulta esclusa» come
«arriva ancora» vorrebbe dire riescluderla due volte. Sta scritto sotto
l'elenco e dentro la frase della smentita, non in una nota a fondo pagina.

**Provato**: `npx tsc --noEmit` pulito, `npm run build` completo,
`node scripts/prova-script-google.mjs` **12 lavori su 12, 25 query preparate**
(la riga finta ha ricevuto un `keyword` anche su `campaignCriterion`, se no il
giro `negative` la saltava con un `continue` — cioè la prova non entrava nel
ciclo, che è il difetto descritto in cima a quel file stesso). Rotta provata in
locale contro il database vero: 3 righe accettate, 1 scartata (testo vuoto),
ripetizione = 0 nuove e 1 aggiornata, marcatore `{"censimentoCompleto":true}`.
**Tutti i record di prova sono stati cancellati** (3 negative `PROVA:…`, il
censimento finto, la chiave temporanea): l'archivio è a **0 righe** e aspetta
il primo giro vero, che arriva col reincollo dello script.

### ⭐ Ogni operazione dice se Google l'ha confermata, non solo le campagne nuove (17/08/2026)

Commit `82fc0b46`, in produzione. `lib/conferme-operazioni.ts` + `/operazioni`.

Chiesto dall'utente: *«in operazioni puoi dare sempre il feedback se è stato
portato a termine o meno?»*. **«Eseguita» è la parola dello SCRIPT**: dice che
ha chiamato Google e Google non ha protestato. Accanto ora c'è la **conferma
indipendente** — cosa ha rimandato Google **dopo**, nei giri di lettura che
arrivano comunque: `anagrafica` per esistenza/stato/budget delle campagne,
`gruppi` per i gruppi, `stati-keyword` per le parole (il censimento completo;
`copy` no, porta solo le keyword con numeri nel periodo e una parola appena
messa in pausa può non comparirci).

Sei stati: **confermata · da confermare · Google dice il contrario · rifiutata ·
superata da un'altra · non verificabile**. Pillola a destra, frase per esteso
sulla riga, e un **avviso in cima per le smentite** — una riga «eseguita» in
fondo allo storico non la guarda nessuno. ⚠️ Le due pillole restano
**affiancate e non fuse**: fonderle vorrebbe dire sceglierne una e nascondere
l'altra, ed è la fusione che aveva fatto leggere «eseguita» come «creata».

**Tre cautele, tutte pagate altrove:**
1. L'app **scrive da sola il valore atteso** quando lo script riferisce l'esito
   (`/api/v1/operazioni/[id]/esito` aggiorna budget, stato gruppo, stato
   keyword): quindi «il dato attuale combacia» **non prova niente** finché
   Google non ha rimandato quel dato. La conferma vale solo con una consegna
   del tipo giusto, dell'account giusto, **dopo** l'esecuzione.
2. Una consegna **dello stesso giro** (entro 30 minuti) basta a **confermare**,
   ma **non a smentire**: dentro `tutto` l'esegui gira per primo e l'anagrafica
   due secondi dopo, e per il bulk upload — asincrono — due secondi non bastano
   di sicuro. Segnare fallito un lavoro riuscito è il difetto opposto.
3. **Una query per tipo di dato, mai una per riga** (`connection_limit 5`).

⭐⭐ **TRE FALSI POSITIVI TROVATI PROVANDOLA, tutti della stessa famiglia**: il
confronto è col valore di **oggi**, e la domanda giusta è *chi ha toccato quel
campo dopo*.
1. **Solo l'ULTIMA operazione su un bersaglio può essere giudicata.** Le prime
   9 «smentite» erano quattro budget cambiati più volte sulla stessa campagna e
   cinque keyword rimesse attive. Ora le precedenti dicono «superata da
   un'altra» — un verdetto in meno, non un'accusa falsa.
2. **`OperazioneAdv.idEsterno` su una `nuova_keyword` porta l'id della
   CAMPAGNA** (tutte e 15 le «torte roma/torino/…» avevano `22499642385`, cioè
   `[Cakedesign] | Sales | ITA`): ovvio col senno di poi — la keyword non
   esiste ancora quando l'operazione nasce. Fidandosene, quindici parole
   diverse diventavano **un bersaglio solo** e quattordici risultavano superate.
3. **La stessa keyword porta l'id COMPLETO su un'operazione e il numero NUDO su
   un'altra** (`…:154305705033:381244836363` la pausa del 04/08,
   `381244836363` la riattivazione dell'11/08 — l'eredità del difetto degli id
   chiuso l'08/08): due chiavi per lo stesso criterio, e la pausa risultava
   «smentita da Google» quando era stata **disfatta da noi**.
   Rimedio: chiave **grossolana, campagna + testo**, senza id e senza gruppo
   (un campo presente solo a volte spacca la chiave come un id in due formati).
   Il prezzo è dichiarato: la stessa parola in due gruppi della stessa campagna
   diventa un bersaglio solo. **Si perde un verdetto, non si accusa a torto.**

⚠️ **E la data che si cita è quella dell'ULTIMA consegna, non della prima.**
L'archivio tiene lo stato di **adesso**: scrivere «il censimento dell'11/08
riporta la keyword attiva» mentre il valore letto è quello riscritto stamattina
fa credere di aver visto quel dato quel giorno — e sposta la colpa sul giorno
sbagliato. La prima consegna serve solo a decidere *se* Google ha parlato.

**Misurato in pagina su 68 operazioni**: 18 confermate · 15 da confermare · 11
su Google (keyword nuove) · 7 superate · 7 senza dato indipendente · **4
smentite**. Le negative sono fra i «senza dato indipendente» **per una ragione
vera**: l'app non importa le keyword negative, quindi fa fede la rilettura che
lo script fa prima e dopo (`negativaPresente`, 08/08) — e se lo script ha
dichiarato un dubbio, la riga dice di andare a guardare a mano.

🔴 **LE 4 SMENTITE SONO VERE, ed è un punto aperto**: `fioraio milano`
(`[Deluxy] - Fiori Milano ITA`, gruppo «Fiori a Domicilio + località
d'interesse»), `send flowers in milan`, `milan flower delivery` e
`flowers milan` (`[Deluxy] - Fiori Milano ENG`, gruppo «Flowers Delivery»)
risultano **in pausa nell'app dal 04/08** e Google le riporta **`ENABLED`
ancora oggi** (righe riscritte dal censimento del 17/08). Cioè: sono state
messe in pausa dall'app, l'app le dà ferme, e **stanno ancora andando in
asta**. Da guardare in Google Ads: o l'esecuzione del 04/08 ha toccato un
criterio diverso (era il periodo del difetto degli id, chiuso l'08/08), o
qualcuno le ha riattivate a mano. ⚠️ Nota: il 04/08 quelle operazioni avevano
`account` vuoto — il difetto chiuso l'08/08 con `accodaOperazione`.

### ⭐⭐ I SOLDI: il tetto di Budgets arriva fin dentro le campagne (23/08/2026)

Prima l'app sapeva quanto si può spendere (Budgets) e quanto è acceso (Google,
Meta) — in due schermate che non si parlavano. Ora la catena è chiusa:

- **`/budget`** si apre su **«Come stiamo andando»**: consentito, speso, quanto
  resta, dove si arriva a fine mese, per brand. La pagina mescolava tre fonti
  senza dire quale comanda; la tabella del Monitoraggio è diventata un archivio
  richiuso (copre solo giugno-agosto e faceva credere che da settembre non ci
  fossero soldi).
- **`/budget/adatta`** è il posto dove si decide: campagne in asta divise per
  piattaforma, tetto per piattaforma (Budgets espone la ripartizione di
  `/piattaforme` da oggi), **suggerimento** dei budget, e per ogni riga *dove
  arriva a fine mese*, *di quanto cambia* e *la % di variazione* con l'avviso
  quando esce dai passi 20-30% dei Definitivi.
- **Le modifiche si PROGRAMMANO**: campo `daEseguireDal`, rispettato
  dall'endpoint che serve lo script e dall'esecutore Meta — non dalla sola
  schermata.

⚠️ **Tre trappole pagate qui, in ordine di quanto sono costate:**
1. **Un campo non si sceglie dal nome.** Avevo cambiato il tetto da
   `advConsentito` a `advPubblicato` perché «pubblicato» suonava come
   «approvato»: in Budgets `budgetPubblicato` è il *riferimento del vecchio
   monitoraggio*, mentre `advConsentito` nasce dal budget vendite **approvato**.
   Corretto solo dopo che l'utente ha contestato la cifra.
2. **Il budget giornaliero non è la spesa** ed è scritto ovunque compaia: è un
   tetto, quasi nessuna campagna lo tocca. Per questo la proiezione si calcola
   sulla spesa vera e «a fine mese» somma il già speso ai giorni che restano —
   `budget × giorni del mese` a metà agosto sbagliava quasi del doppio.
3. **Su Meta il budget può stare sugli ad set**: quelle campagne arrivano con
   `budgetGiornaliero` nullo e NON entrano nei totali come zero.

### ⭐ META SCRIVE DAVVERO (23/08/2026)

`META_SCRITTURA=attiva` acceso su Vercel, permesso `ads_management` **misurato**
(non dedotto) e provato in produzione: pausa su una campagna già ferma (effetto
zero, voluto) e budget 40 → 35 €/g su «[Opera] ATC - VOLUME», entrambe eseguite.

Restano cinque operazioni sole — pausa/riattiva campagna e ad set, budget: su
Meta non esistono keyword né negative, e **creare una campagna non si può** (il
modulo di lancio è cablato su Google; là servirebbero tre oggetti annidati più
il creativo).

⚠️ **Su Meta non c'è nessuno script**: esegue l'app, e solo quando qualcuno
preme «Esegui adesso» in `/operazioni` — di proposito. Il registro prometteva
«lo script la eseguirà alla prossima passata» anche lì: due operazioni sono
rimaste ferme un'ora ad aspettare un motore che non sarebbe mai passato.
⚠️ E dopo ogni scrittura **si rilegge** (stato + `effective_status`, budget in
centesimi), come fa lo script su Google.

### ⭐ Quello che l'app sa fare in più, da oggi (23/08/2026)

- **Liste di parole escluse** (`/liste-escluse`): si scrivono una volta e si
  applicano a più campagne, usando le **liste condivise** di Google — non N
  copie di negative. ⚠️ Vivono dentro un account: applicarle a un altro brand ne
  crea una COPIA.
- **«Escludi parole»** sulla campagna e sul gruppo: prima si poteva escludere
  solo ciò che era già in un elenco, cioè reagire, mai prevenire.
- **Località**: si vedono in cima alla scheda (per intero, non troncate) e **si
  cambiano** dall'app. ⚠️ Togliere non è aggiungere al contrario: senza
  targeting geografico Google esce OVUNQUE — tre reti lo impediscono.
- **Estensioni**: si aggiungono (sitelink, callout, snippet). Le immagini no,
  vogliono un file caricato nell'account.
- **Pagina Estensioni** (`/estensioni`): 247 in pausa su tre conti, e le
  campagne senza nemmeno una attiva di un tipo.
- **Archivio operazioni** (`/operazioni/archivio`) con ricerca su nome, motivo
  ed esito: in pagina restano la coda viva e gli ultimi 7 giorni.
- **Doppioni**: due annunci identici nello stesso gruppo non si creano più (è
  successo il 21 e il 23), e un titolo ripetuto dentro l'annuncio si vede
  mentre si scrive — Google rifiuta l'annuncio INTERO (`DUPLICATE_ASSET`).

🔴 **DA FARE APPENA POSSIBILE**: `esegui.js` va **reincollato** (copie in
`Downloads\deluxy-google-ads`, ~152 KB). Senza, restano in coda senza
esecutore: `lista_negative`, `localita`, `estensione`.

### ⭐⭐ L'annuncio si scrive DALL'APP: a mano o con l'AI, con la bozza che si salva (20-21/08/2026)

Commit `fff14c7a` → `12769641` → `3af85d56`, tutto in produzione (deploy
`deluxy-marketing-q11p2tceo`, health `200`). Prima gli annunci si potevano solo
**proporre**: l'AI scriveva i testi e la scheda diceva «copiali in Google Ads».
Adesso l'annuncio nuovo si compone qui e va in coda come le altre operazioni
(`nuovo_annuncio`, livello **L0** per i negative e **L1** per l'annuncio).

Cosa c'è, in ordine di come si incontra:

- **«Vedi brief»** in testa alla campagna (`components/BriefDiLancio.tsx` +
  `ApriBrief.tsx`): per le campagne nate dall'app mostra tutto quello che le
  era stato passato — obiettivo, località, lingua, strategia, negative.
  Accanto, l'avviso quando c'è **una modifica di budget in attesa di
  approvazione**: il numero a schermo non è quello che sta per diventare.
- **Nuovo annuncio** sulla scheda del gruppo (`components/CreaAnnuncioAi.tsx`).
  ⚠️ Il bottone NON è più nascosto dietro «ci sono già dei testi»: era
  invisibile proprio nei gruppi **senza annunci**, cioè dove serve.
  ⚠️ **La destinazione si chiede PRIMA**, non dopo la proposta: se si sta
  cambiando landing, l'AI deve scrivere per la pagina nuova.
  ⚠️ **L'AI riempie le stesse caselle** in cui si scriverebbe a mano: «l'ha
  scritto l'AI» e «l'ho scritto io» non sono due percorsi diversi.
- **La bozza si salva da sola** (`BozzaAnnuncio`, una per gruppo, creata con
  `scripts/crea-tabella-bozza-annuncio.mjs` — CREATE mirato, **mai**
  `prisma db push` sul Postgres condiviso). Si riprende da un'altra postazione
  o un altro giorno. Salvataggio **ritardato di 1 s** dall'ultima battuta
  (`connection_limit 5`: una scrittura per tasto fa cadere la pagina), **non
  prima** che la bozza sia stata letta (cancellerebbe quella che si sta per
  leggere), e si butta **solo** se la messa in coda è riuscita.
- **La coda si vede dove si è agito**: `CodaCampagna` accetta ora anche
  `gruppoId` e sta in cima alla scheda del gruppo, e il messaggio di successo
  porta un link **«Vai ad approvarlo»**. ⭐ Senza, l'annuncio ANDAVA in coda e
  dal di fuori sembrava che non fosse successo niente — la lamentela era
  «sembra poi non succedere nulla», e il difetto era solo che l'esito non si
  vedeva dove l'azione era partita.
- **I caratteri contati riga per riga** (21/08): sotto ogni casella l'elenco
  delle righe scritte col loro conteggio (`24/30`, `91/90` in arancione),
  aggiornato mentre si batte; le righe oltre il 15° titolo o la 4ª descrizione
  si vedono spente con «non parte». Il totale diceva *quante* righe erano
  lunghe, non *quali*, e un titolo di 31 caratteri fa rifiutare l'annuncio
  intero.

⭐⭐ **`lib/funzioni-annuncio.ts`: la regola delle graffe in UN posto solo.**
Viveva in tre copie che non si parlavano (scheda testi, dialogo, validazione
server) e due erano sbagliate: il dialogo contava `{KeyWord:Fresh Flower
Delivery}` come **31 caratteri invece di 21** e **bloccava il bottone** su
titoli perfetti. La regola di Google è che il limite vale sul **testo di
riserva**, non sulla stringa scritta. Dove la resa non si può sapere
(`{LOCATION(City)}`, countdown) la lunghezza si dichiara **incerta** e non si
segnala niente: un allarme che può essere falso fa riscrivere testi buoni e
insegna a ignorare gli avvisi.

Nello stesso giro, sulla leggibilità: le estensioni ora sono **raggruppate per
tipo** e quelle di conto sono marcate `(account NNN)` — la tabella era
illeggibile e mostrava **15 asset su 76 di altri brand**; e le graffe dentro i
testi si vedono come **pastiglie parlanti** («parola cercata → Luxury Florist»)
invece che come codice.

### ⭐ Provandolo: due difetti che l'app non poteva vedere da sola (21/08/2026, `20aa9a95`)

**1. Il gruppo cercato solo per id.** `trovaGruppo` faceva
`AdsApp.adGroups().withIds([id])` e basta: se quel selettore non risponde,
l'operazione muore lì. È successo con l'annuncio della WORLD-ENG, e l'id era
quello **mandato da Google stesso** poche ore prima. Ora: id → nome dentro la
campagna → nome su tutto l'account (**una sola** corrispondenza: due gruppi
omonimi e la scelta a caso significa scrivere l'annuncio nel posto sbagliato)
→ e se fallisce tutto, l'esito riporta **cosa vede Google in quella campagna**,
id e stato per ogni gruppo. Corretto anche `op.parametri.campagna`, che non
esisteva: il nome della campagna arriva in **`op.campagna`**, quindi quel
ripiego era codice morto.

**2. Le estensioni in pausa sembravano attive.** La scheda le elencava tutte
uguali. Contate sul database il 21/08 su «[Deluxyflowers] - ITALIAN - ENG»:
**17 sitelink su 30 in pausa**, **4 callout su 5**, 6 immagini su 23; su tutto
il conto Flowers **44 asset fermi su 215**. Il dato (`statoPiattaforma`)
arrivava dallo script da sempre e la scheda **non lo leggeva nemmeno una
volta**. Ora il numero grande conta le **attive**, le ferme si dichiarano e
scendono in fondo spente, e ⭐ **«manca callout» si decide sulle attive**: un
tipo con sole estensioni in pausa è mancante a tutti gli effetti — nella pagina
dei risultati non compare niente, esattamente come se non ne avessimo mai
fatte.

**3. Una riga «Fallita» non aveva nessun bottone** (`c2e213aa`). Lo storico
diceva cosa era andato storto e finiva lì: per riprovare bisognava rifare tutto
dal punto di partenza — per un annuncio, riscrivere quindici titoli. Ora sulle
fallite ci sono **«Rimetti in coda»** (stesso contenuto, torna **da approvare**:
la causa va sistemata prima, e l'approvazione è il momento in cui una persona
dichiara di averlo fatto; l'esito vecchio si sposta nel motivo) e, per gli
annunci, **«Correggi i testi»**, che riporta titoli, descrizioni e destinazione
nella bozza del gruppo e apre il dialogo. ⚠️ `nuova_campagna` resta fuori dal
bottone generico: ha `rilanciaCampagnaRifiutata`, che pretende **tre prove** che
su Google non esista — rimetterla in coda alla cieca può creare una seconda
campagna che spende. ⚠️ E l'operazione fallita **resta fallita**: correggere ne
crea una nuova, e nel registro si deve vedere il tentativo andato male accanto a
quello buono.

🔴 **Resta da fare, nell'ordine**: (1) reincollare `esegui.js` e `tutto.js`
(copie in `Downloads\deluxy-google-ads`) — senza, `nuovo_annuncio` non ha chi
lo esegua; (2) approvare in `/operazioni` l'annuncio in attesa e i **6 negative**
rimasti; (3) **la landing**: l'annuncio della WORLD-ENG è rifiutato per
`DESTINATION_NOT_WORKING`, ed è un problema di pagina, non di testo.

⚠️ **Nota sulla storia dei commit**: il conteggio riga-per-riga è finito dentro
il commit `3af85d56` («Indirizzi: Places API»), scritto da un'ALTRA sessione
sulla stessa cartella scoutwt. Il contenuto è giusto e su `origin/scout-ui`; il
messaggio no. È la trappola nota dell'indice git condiviso: **committare sempre
con pathspec**, mai `git add -A`.

### ⭐ «È voluto»: una divergenza si può chiudere, e chiuderla ALLINEA l'app (19/08/2026)

Commit `bcb8377a`, in produzione. Era il punto lasciato aperto ieri.

La conferma per operazione mostra ogni differenza fra quello che l'app crede e
quello che Google riporta — ed è il suo mestiere. Ma **senza un modo di dire
«lo so, è voluto» una divergenza voluta resta lì a segnalare per sempre**, e un
avviso che non si può chiudere si smette di leggere: a quel punto smette di
funzionare anche per quelli veri.

Bottone **«È voluto»** sulla riga smentita. Tre colonne nuove su
`OperazioneAdv` (`divergenzaAccettataIl` / `Da` / `Motivo`) con **ALTER mirato
e ripetibile** (`scripts/aggiungi-divergenza-accettata.mjs`), non `db push`: il
Postgres è condiviso fra dodici app.

⭐ **Non si limita a zittire l'avviso: ALLINEA.** È il punto. Le quattro keyword
risultavano `in_pausa` nell'app e su Google erogavano perché **le aveva
riattivate l'utente**. Chiudere solo l'avviso avrebbe lasciato l'app a dire «in
pausa» di parole che spendono — cioè avrebbe scambiato un avviso fastidioso con
una **bugia silenziosa**. Ora lo stato dell'app segue quello di Google, come già
fa il pallino sui gruppi: comanda il fatto, il giudizio gli va dietro.
⚠️ Gli **stati nostri** (`defunta`, `bozza`, `in_lancio`) non si toccano: non
hanno un gemello su Google. ⚠️ E il **confine di parola** nel confronto:
«flowers milan» non si porta dietro «flowers milano», che è un altro criterio
con un altro stato.
⚠️ **Non tocca Google**: dichiara una decisione già presa là.

**Applicato alle 4** che l'utente ha dichiarato volute (19/08): 5 criteri
allineati, una riga nel registro per ognuna, banner sparito. Il punto 4bis è
chiuso.

### ⭐⭐ La campagna nuova si imposta TUTTA dall'app (18-19/08/2026)

Commit `f46a0b3b` (strategia), `03adfbfd` (lingua, località, negative),
`f0bd40f9` (le località sconosciute le chiede Google). Tutto in produzione.

**Come è venuto fuori.** Il registro caricamenti di Flowers, letto sul CSV dei
risultati: 18 righe, **un solo errore vero** sulla riga della campagna —
`Missing value in either "Bid strategy type" or "Bid strategy"` — e le altre 17
con `The entity does not exist for Campaign`, la solita cascata. ⭐ **E la
colonna `EU political ads` col valore `"no"` è stata ACCETTATA**: quel formato
adesso è provato sul campo, il dubbio fra `"no"` e `false` è sciolto e
`EU_POLITICAL_ADS` resta `"no"`.

⭐⭐ **La scoperta che conta: la strategia l'app ce l'aveva già** (`par.strategia`,
«max_conversioni» su questa campagna) e la registrava solo come promemoria,
perché nel codice era scritto che il bulk upload non avesse la colonna. Ce
l'ha, ed è obbligatoria. Da lì la domanda dell'utente — *«no, deve essere tutto
messo tramite l'app»* — e la verifica di tutte le altre. **Regola: «non si può
fare» va verificato, non ereditato**; qui era scritto in un commento e nella
pagina, e nessuna delle due cose era una prova.

**Cosa arriva su Google adesso**, in un caricamento solo: nome, budget, tipo
Ricerca, **strategia** (`Bid strategy type`), **lingua** (`Language targeting`),
**località** (una riga per ognuna, con `Location ID`), gruppo, keyword,
annuncio RSA. La campagna nasce sempre in pausa.

⚠️ **Le località viaggiano per ID, non per nome.** I nomi hanno una lingua e gli
id no: Google le conosce in inglese (`Spain`, `Milan`), nel modulo si scrive in
italiano, e un nome che non combacia **non dà errore** — dà una campagna senza
quella località. `lib/geo-target.ts` traduce con tre strade: tabella dei paesi
(id = **2000 + codice ISO**, verificato sull'archivio: Italia 2380, Grecia 2300,
Portogallo 2620, Svizzera 2756), nome inglese cercato fra le **78 località già
importate** dalle campagne vive, e il nome così com'è. Un **numero** scritto nel
campo è già un id e si prende com'è.

⭐ **E quello che l'app non conosce lo chiede a GOOGLE** (`f0bd40f9`,
`risolviLocalitaSuGoogle` nello script): una tabella scritta a mano è una
tabella che prima o poi non contiene quello che serve, e la località finirebbe
fra le cose «da mettere a mano», cioè quasi sempre dimenticata. Google l'elenco
completo ce l'ha e si interroga per nome — lo dice il cookbook GAQL
(`WHERE geo_target_constant.name = 'Mountain View'`).
⚠️⚠️ **L'ambiguità non si risolve indovinando**: un nome può dare più risultati
(«Como» è una città e una provincia, «Valencia» sta in Spagna e in Venezuela) e
la documentazione di Google avverte proprio di questo. Prendere il primo
vorrebbe dire far erogare la campagna dall'altra parte del mondo senza che
nessuno l'abbia deciso. Quindi: **una** corrispondenza si usa, **più di una** si
elencano nell'esito col nome canonico e l'id, e non si tocca niente.
⚠️ `status` **non va nella WHERE** (il cookbook filtra `name`, `country_code` e
`target_type`; su `status` non c'è garanzia, e una query rifiutata farebbe
perdere la località invece di trovarla): si legge e si scarta in codice. Tutto
in un `try`.
⭐ **Effetto collaterale buono**: al primo giro di anagrafica quelle località
entrano in `LocalitaCampagna` col nome e l'id veri, quindi **la volta dopo l'app
le riconosce da sola**. La tabella smette di essere un collo di bottiglia.

⚠️ **Le negative NON viaggiano nel caricamento, ed è voluto** (`lib/negative-di-lancio.ts`).
Il bulk upload non risponde: per una keyword in più è un fastidio, per una
negativa è il guasto peggiore — la campagna erogherebbe proprio sulle ricerche
che qualcuno aveva deciso di escludere, e non se ne accorgerebbe nessuno. Lo
script sa aggiungerle con `createNegativeKeyword` e **rileggerle**
(`negativaPresente`, 08/08), l'unica strada su cui l'esito si può credere. Ma
quella chiamata vuole la campagna **in mano** e il caricamento è asincrono:
quindi aspettano il momento in cui l'anagrafica la nomina — agganciato a
`salvaAnagrafica` sulle campagne che in quel giro ricevono per la prima volta un
`idEsterno`. Nascono **da approvare**, non approvate: chi ha approvato il lancio
ha approvato anche queste, ma approvarle da sole vorrebbe dire che l'app scrive
su Google senza che una persona abbia guardato la riga. Sempre corrispondenza
**esatta**. Il tutto in un `try`: se questa parte si rompe, l'anagrafica — che
costa minuti di script — entra lo stesso.

**L'obiettivo resta un'etichetta nostra**, e la pagina lo dice invece di
elencarlo fra le cose da impostare: su Google l'«obiettivo» è un involucro
dell'interfaccia, non un campo che uno script possa scrivere, ed elencarlo
farebbe cercare per sempre un interruttore che non c'è.

**Da riprendere**: reincollare `esegui.js` (copie del 19/08, ~124 KB),
approvare la WORLD-ENG, lanciare. ⚠️ L'operazione in coda era del 17/08 col
formato vecchio: le sono stati aggiunti gli id delle 9 località (tutte risolte)
mentre era «da approvare», con la riga nel registro.

### ⭐⭐ «Google dice il contrario» non è un guasto: era una mano dentro Google Ads (18/08/2026)

Commit `975df18c` (la rilettura nello script) e `3d3d3f91` (la correzione del
racconto e delle frasi). **Prima cosa che la conferma per operazione ha fatto
vedere** — e vale la pena raccontarla per intero, perché la diagnosi giusta è
arrivata dopo una sbagliata.

**Quello che si vedeva.** Le quattro pause del 04/08 (`fioraio milano`,
`send flowers in milan`, `milan flower delivery`, `flowers milan`) avevano esito
«keyword in pausa» e Google le dava `ENABLED`. Non era un disallineamento di
etichette: **stavano spendendo**. Dal 04/08 **117,72 €** e impressioni fino a
oggi (fioraio milano 83,82 € e 630 impressioni · milan flower delivery 19,05 € ·
flowers milan 10,62 € · send flowers in milan 4,23 €).

⚠️⚠️ **La diagnosi sbagliata, e perché sembrava solida.** Avevo concluso che la
pausa non fosse mai andata, e l'argomento sembrava chiuso: `fioraio milano` non
ha un solo giorno di buco — 44 impressioni il giorno stesso della pausa, 45 il
giorno dopo. **Era falso: le aveva riattivate l'utente a mano in Google Ads.**
Il dato non lo poteva dire, perché una riattivazione fatta la stessa mattina
produce esattamente quella curva. **La lezione è sul metodo**: quando l'app e la
piattaforma non concordano, la spiegazione di gran lunga più probabile è **una
persona**, non un guasto del software — e prima di scriverlo nei commenti del
codice si chiede, perché la risposta costa una domanda e l'errore resta scritto.

**Il guasto vero, quello sì.** Non è che la pausa non sia andata: è che **una
modifica fatta a mano dentro Google Ads non torna indietro**, e per due
settimane `/operazioni` ha mostrato «in pausa» quattro parole che stavano
spendendo. L'app non aveva modo di accorgersene — ed è esattamente ciò che la
conferma per operazione serve a far vedere.

**Cosa è cambiato:**
1. **La frase mette per prima la causa più probabile**: «quasi sempre vuol dire
   che qualcuno l'ha cambiata dopo in Google Ads; se non è così, l'operazione
   non è passata». Prima diceva «o l'operazione non è passata, o è stata
   cambiata dopo» — la spiegazione giusta era in fondo, e si leggeva guasto dove
   c'era una decisione. L'avviso in cima dichiara di **non essere un allarme**.
2. **Lo script rilegge dopo aver scritto** (`975df18c`): tutti e sette i rami
   che scrivono (`pause`/`enable`/`setAmount` su campagna, gruppo, keyword,
   budget) rileggono da un selettore **NUOVO** — `rileggiStato` e
   `rileggiCampagna` — e l'esito dice *confermato rileggendo* · *non ho potuto
   rileggere* · **ATTENZIONE: risulta ancora in erogazione**. ⚠️ Il selettore
   dev'essere nuovo: l'oggetto che si ha in mano può tenersi lo stato con cui è
   stato letto. ⚠️ Il dubbio **si dichiara, non diventa un errore**: dentro la
   stessa esecuzione i selettori possono ancora vedere lo stato di partenza, e
   segnare fallito un lavoro riuscito è il difetto opposto.
   ⚠️ **Questa rete non ripara il caso qui sopra** — quello non era un guasto.
   È la terza della stessa famiglia (`createNegativeKeyword` 08/08,
   `creaCampagna` 17/08) e serve al caso che nessuno vedrebbe: una pausa che
   fallisce davvero. **Va reincollata** per avere effetto.

⚠️ **Ancore solo-ASCII per patchare `google-ads-script.js`**: gli accenti sono
in **mojibake** (`à` = `C3 83 C2 A0`, UTF-8 ri-codificato in latin1), quindi
un'ancora che contiene «già» **non aggancia**. Il conteggio dei byte non-ASCII
(5.842) resta il controllo che dice se si è rotto qualcosa.

### 🔴 «Eseguita» su una campagna nuova voleva dire INVIATA, non creata — e Google la rifiutava per «EU political ads» (17/08/2026)

Due commit, `db6d992f` (15:31) e `ea919a4c` (15:54), entrambi in produzione.

**Il fatto.** L'utente ha lanciato `[Deluxyflowers] - WORLD - ENG` da «Crea
campagna» (brief AI, 35 €/g, 15 keyword, 1 RSA): alle 14:08 l'operazione
risulta **eseguita** nell'app e **dentro Google Ads non c'è niente**.

**Perché l'app diceva «eseguita».** `creaCampagna` nello script chiama
`upload.apply()` e basta. Il bulk upload di Google **non restituisce niente**
e viene lavorato **in modo asincrono**: se una riga è sbagliata l'errore resta
nel registro dei caricamenti dentro Google Ads (Strumenti e impostazioni →
Azioni collettive → Caricamenti) e **non torna mai indietro**. Lo script
riferiva «bulk upload inviato … campagna creata IN PAUSA», l'app registrava
`eseguita`, e chi legge capisce «creata». È la stessa famiglia di
`createNegativeKeyword()` (corretta l'08/08 con `negativaPresente()` che
rilegge prima e dopo): qui il dubbio non era mai stato dichiarato.

**La prova che l'app aveva già in mano** (`lib/campagne-non-confermate.ts`):
il giro `anagrafica` manda **tutte** le campagne dell'account, comprese le
ferme. Su Flowers ne è arrivato uno **alle 14:08:12, subito dopo il lancio: 35
campagne, 0 nuove**, e la campagna nell'app non ha né `idEsterno` né
`statoPiattaforma` — Google non l'ha mai nominata. Ora `/operazioni` lo
dichiara in cima, incrociando i giri di anagrafica **di quell'account**
arrivati **dopo quel lancio**: con **zero** giri dice che è presto (il
caricamento è asincrono, si saprà al prossimo giro); con **uno o più** dice che
**è stata rifiutata** e manda al registro dei caricamenti, l'unico posto dove
il motivo esiste. Senza account non conclude niente. ⚠️ Una query sola per
tutti i lanci sospesi, non una per riga: con `take: 30` sarebbero fino a 30
andate e ritorno per un avviso, e su questo Postgres (`connection_limit 5`)
saturano il pool e **fanno cadere l'intera pagina**, non solo l'avviso.

**La causa vera, letta nel registro caricamenti di Google Ads (Flowers):
17 righe rifiutate, una sola causa.** La riga della campagna manca del valore
**«EU political ads»** — obbligatorio dal regolamento UE sulla pubblicità
politica (`Missing value in "EU political ads"`); gruppo, keyword e annuncio
cadono di conseguenza con `The entity does not exist for Campaign`, errori che
**sembrano la causa e sono solo l'effetto**. Correzione nello script
(`ea919a4c`): colonna `"EU political ads"` nella riga campagna di
`creaCampagna`, valore **`"no"`** (= NON contiene pubblicità politica UE — il
valore giusto per Deluxy; ⚠️ **non mettere «yes» per prudenza**: una campagna
che dichiara di contenerne **smette di erogare nella UE**).

⚠️⚠️ **Il formato del valore NON è ancora provato su un nostro account, e le
fonti si contraddicono.** Nell'unico thread pubblico sul tema (forum Google
Ads Scripts, 29/08/2025) il Forum Advisor di Google suggerisce il **booleano
`false`** («boolean values without hyphens»), ma nello stesso thread chi l'ha
provato riferisce che **`false` non passa e `no` sì**; i modelli di
caricamento di Google Ads e i bulksheet di Search Ads 360 usano **yes/no**. Ho
scelto `"no"` (minuscolo, testo). **Se il registro caricamenti risponde
«Invalid value in EU political ads»**, l'alternativa documentata è `false`:
è un cambio di una parola in `creaCampagna` + rigenerare le copie. La sessione
precedente aveva messo `false` citando l'Advisor: la scelta è stata rovesciata
qui, a ragion veduta, e chi legge deve sapere che è una scelta e non un fatto.

**Cosa cambia ancora.**
- Il **dettaglio dell'esito** dello script ora dice «bulk upload **INVIATO** …
  IN PAUSA **se Google accetta le righe** … l'esito vero sta nel registro
  caricamenti e l'app lo verifica col primo giro di anagrafica» — non più
  «creata». Era esattamente la parola che faceva leggere eseguita come nata.
- **«Rimetti in coda»** sull'avviso di `/operazioni`
  (`rilanciaCampagnaRifiutata` in `lib/azioni.ts`): riporta l'operazione fra
  quelle da approvare **con gli stessi parametri**, senza rifare il modulo.
  ⚠️ Compare **solo quando il rifiuto è provato** (almeno un'anagrafica
  dell'account dopo il lancio, campagna senza `idEsterno` né
  `statoPiattaforma`, account noto) e **i tre controlli sono ripetuti nella
  server action** — un bottone nascosto non è una rete. `riapriOperazione`
  continua a **escludere le eseguite**, ed è giusto: rifare un'operazione
  riuscita vorrebbe dire una seconda campagna, una seconda negativa. Terza
  rete: lo script stesso rifiuta di creare una campagna se ne esiste già una
  con quel nome (`trovaCampagna` in `creaCampagna`).
- **Non serve reincollare lo script per l'avviso** (tutto lato app); **serve
  reincollarlo per la colonna** — copie rigenerate il 17/08 alle 15:57.

**Verificato**: `tsc` pulito, prova a secco 9/9, byte non-ASCII dello script
identici prima e dopo (5.842 — file latin1 toccato solo con node, testo
inserito ASCII puro), `/operazioni` in locale mostra l'avviso con «Rimetti in
coda» e zero errori in console; deploy in produzione, health 200 a `fra1`.

**La sequenza per chiudere il punto** (fuori dall'app, in ordine): (1)
reincollare `tutto.js` — o `esegui.js`, se i lavori singoli sono schedulati a
parte — almeno nell'account Flowers, rimettendo CHIAVE_API e BRAND; (2) su
`/operazioni` premere «Rimetti in coda» sulla WORLD-ENG; (3) approvarla; (4)
lanciare Esegui in Google Ads o aspettare il giro; (5) guardare **il registro
caricamenti** e, al giro di anagrafica successivo, l'avviso deve sparire e la
campagna avere `idEsterno`. Se invece compare «Invalid value», passare a
`false` (sopra).

### Il carico storico a 90 giorni, fatto su tutti e tre gli account (17/08/2026)

L'utente ha reincollato lo script del 15/08 sui tre account, li ha lanciati con
`GIORNI_INDIETRO = 90` e poi ha rimesso 7. Verificato sul database:

- **`MetricaAnnuncio`: da 0 a 5.157 righe**, dal **19/05** al 17/08 su tutti e tre
  (Gifts 3.454 · Flowers 998 · Cake 705). Il pannello «finestre» sull'annuncio
  ha finalmente 90 giorni sotto, quindi mese / 30 giorni / anno dicono qualcosa.
- `MetricaKeyword` a 24.070 (cresciuta poco: lo storico keyword c'era già dal 12/04).
- **Zero consegne non-ok**, e `annuncio-giorni` arriva ora da tutti e tre.

⭐ **IL RISCHIO CHE AVEVO SEGNALATO NON SI È VERIFICATO, e si può dimostrare.**
Il pericolo era un **censimento `stati-keyword` troncato** dal limite dei 25
minuti: l'app avrebbe visto una consegna fresca, calcolato la soglia da lì, e
dichiarato «non più su Google» migliaia di keyword vive. Il conto torna su
tutti e tre — **i blocchi spediti coprono esattamente le keyword confermate**:

| | righe in archivio | dichiarate assenti | confermate | blocchi × 200 |
| --- | --- | --- | --- | --- |
| Gifts | 15.308 | 713 (4,7%) | **14.595** | 73 per giro (146 = 2 giri) ✓ |
| Cake | 1.335 | 304 (22,8%) | **1.031** | 6 ✓ |
| Flowers | 3.990 | 0 | **3.990** | 21 ✓ |

E c'è una conferma indipendente: le **304 di Cake sono esattamente** il numero
misurato l'11/08 come keyword davvero sparite da Google. Non è un artefatto del
carico lungo, sono rimozioni vere.

⚠️ **Resta però la regola**: il controllo da fare dopo ogni giro lungo è questo —
contare le righe con `aggiornataIl` più vecchio della soglia del censimento e
verificare che (totali − assenti) combaci con `blocchi × 200`. Se non combacia,
il censimento è stato tagliato e le schede gruppo stanno accusando keyword vive.

### Il censimento delle landing dalle destinazioni degli annunci (17/08/2026)

Commit `1d15c582`, in produzione. `lib/censimento-landing.ts` +
`/landing/censimento`.

**La domanda che l'ha fatto nascere: «sei sicuro ci siano tutte le landing?».**
No. `/landing` mostra `LandingPage`, che si riempie **solo a mano** dal bottone
«Registra landing» — ho controllato chi ci scrive: l'azione del modulo e una
route API a chiave mai usata, **nessun import**. Misurato: **27 registrate
contro 329 URL** su cui gli annunci mandano traffico davvero, cioè **312
mancanti**, di cui **181 con almeno una campagna che eroga adesso**. Solo 22
campagne vive su 86 avevano una landing agganciata.

Il dato per riempirla c'era già: dal 04/08 lo script porta la **destinazione di
ogni annuncio** (1.056 righe) e la **URL di ogni sitelink** (436), e su quelle
righe c'è il **nome della campagna**. La pagina nuova elenca le URL non ancora
registrate con **chi ci manda, se quella campagna gira adesso, e quanto hanno
speso gli annunci che ci puntano**, e le registra in blocco.

- ⚠️ **Non è un import cieco, ed è una scelta.** Fra quelle 329 ci sono
  collezioni Shopify normali: registrarle tutte riempirebbe `/landing` di rumore
  e la renderebbe inutile quanto lo era vuota — al contrario.
- ⚠️ **Lo stato della campagna è quello di GOOGLE**, non il giudizio dell'app:
  una campagna può essere «in pausa» qui e `ENABLED` là, e in quel caso sta
  ancora spendendo (successo davvero con Catering Milan B2B).
- ⚠️ **La spesa è quella degli ANNUNCI (30 giorni) e non comprende i sitelink**,
  che portano una finestra loro di 365: sommare due finestre diverse darebbe un
  numero che non vuol dire niente. Si ottiene unendo le righe `destinazione` a
  quelle `annuncio` per `idEsterno` — la stessa chiave, quindi senza chiedere
  niente in più a Google.
- ⚠️ Le landing nascono **`da_verificare`**, non `attiva`: che ci arrivi un
  annuncio dice che la pagina è **in uso**, non che sia **quella giusta**.
- Il **brand viene dalle campagne** che ci mandano (un fatto); solo in mancanza
  si deduce dal dominio, e la pagina scrive «dedotto dal dominio».

⚠️ **Trovato provandolo**: 15 URL avevano come campagna il segnaposto
**`(account 248-656-1148)`** che lo script mette sugli asset di **livello
account** (`leggiAsset`). Comparivano come finte campagne **«ferme»** — il
contrario del vero, perché un sitelink di account vale per *tutte* le campagne
di quell'account. Ora si chiamano «asset di account» e non risultano fermi
(verificato: 45 occorrenze in pagina, zero segnaposti grezzi).

⚠️ **Sbagliato e corretto durante l'analisi**: il primo conteggio dava 333
mancanti perché confrontavo `https://deluxyflowers.com/…` con
`deluxyflowers.com/…` — `LandingPage.url` si salva **senza protocollo**.
`normalizzaUrl()` ora toglie protocollo, `www.`, query string e barra finale, ed
è **la funzione che decide anche cosa si scrive nel database**: se le due
normalizzazioni divergessero, il censimento riproporrebbe per sempre pagine già
registrate.

### Il brief della campagna lo scrive l'AI, e i campi si riempiono (17/08/2026)

Commit `0f1c6ae2`, in produzione. `lib/azioni-brief.ts` + `components/BriefCampagnaAi.tsx`.

In cima a «Crea campagna» un pannello: si descrive la campagna a parole e l'AI
compila **nome, obiettivo, budget, lingua, località, URL, gruppo, keyword con
corrispondenza, negative, titoli, descrizioni e motivo**.

- ⚠️ **RIEMPIE I CAMPI, NON MANDA NIENTE.** Dopo il riempimento il modulo è
  esattamente come se lo avessi scritto a mano: si rilegge, si corregge, e resta
  tutta la strada di prima — lint 7.2/7.3, limiti di Google, coda, approvazione.
  **I tre cancelli restano tutti**: l'AI propone, la persona sceglie, la coda
  approva.
- **Le regole di tono arrivano all'AI PRIMA che scriva** (`regoleDiBrand()`
  nuovo in `copy-lint.ts`): senza, il modello produceva un titolo con «gratis»
  su Flowers e il lint lo respingeva in fondo al modulo, dopo tutto il lavoro.
- ⚠️ **I limiti di Google si impongono nel CODICE, non nello schema**: l'API di
  Claude **rifiuta `maxItems` e i vincoli di lunghezza** negli structured
  outputs (400 alla prima chiamata — trappola già nota da «Estendi con AI»).
  E **quello che viene scartato si DICE in pagina**: un titolo di 31 caratteri
  tolto in silenzio diventa «me ne ha dati 7 invece di 10» e si dà la colpa al
  modello.
- Il pannello sta **fuori** dal `<form>`: un form dentro un form non è HTML
  valido e il bottone diventerebbe un submit del modulo grande. Scrive nei campi
  per nome, che sono **non controllati** — è il modo che non litiga con React e
  che lascia il resto della pagina un server component.

⭐⭐ **DUE DIFETTI TROVATI PROVANDOLO DAVVERO, NON A TAVOLINO.** La query delle
keyword di esempio aveva un **filtro fantasma** (`campagna: { contains: "" }`,
un no-op rimasto lì) **e non era filtrata per brand**: scorreva tutte e **21.052**
le righe dell'archivio e passava all'AI **le parole di Gifts mentre scriveva una
campagna Flowers** — esempi del marchio sbagliato spacciati per «quello che
funziona da noi». Corretta filtrando sui nomi delle campagne del brand (a
`CopyAnnuncio` il brand non c'è: si aggancia alla campagna per nome), più
`massimoToken: 4000`. **Misurato: la chiamata è passata da 59 s a 31 s**, e i 59
erano sul filo dei **60 di `maxDuration`** — cioè in produzione sarebbe morta a
metà, ma solo qualche volta e senza una ragione visibile. ⚠️ **60 è il tetto
usato ovunque nell'app**: se un domani il brief rallenta, è il primo numero da
guardare.

Provato end-to-end su Flowers: nome `[Deluxyflowers] - Napoli - ITA`, 9 keyword
a frase, 14 titoli (il più lungo 28 caratteri), 4 descrizioni (79), «Napoli»
spuntata fra le località, negative sensate fra cui «gratis».

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

## Da riprendere subito (17/08/2026, aggiornato alle 16:00)

I tre controlli lasciati il 10/08 sono **fatti** (verificati sul database il
17/08): le località arrivano (255 righe su 158 campagne), l'operazione
`attiva_keyword` su «flowers delivery milan» è **eseguita** l'11/08 05:40, e
gli script reincollati girano su tutti e tre gli account.

Resta da fare, **fuori dall'app**:

0. 🔴 **LA CAMPAGNA NUOVA RIFIUTATA DA GOOGLE** (`[Deluxyflowers] - WORLD -
   ENG`, lanciata il 17/08 alle 14:01, «eseguita» alle 14:08, **inesistente su
   Google** per «Missing value in EU political ads» — vedi la sezione di FATTO).
   La correzione è nel codice e in produzione. Stato alle 16:20: l'utente ha
   **premuto «Rimetti in coda»** (l'operazione è tornata *da approvare*) e ha
   **reincollato `tutto.js`**. ⚠️ **Manca `esegui.js`, e serve**: verificato sul
   database che le operazioni vengono applicate da un lavoro **`esegui`
   schedulato a parte, ogni ora attorno al minuto :09** (15 keyword eseguite
   alle 12:04 su Cake, budget alle 07:08 su Gifts: nessuna anagrafica nei 2
   minuti dopo, quindi non è il giro `tutto`). Se `esegui.js` resta vecchio,
   sarà lui a riprendere la campagna e a farla rifiutare di nuovo.
   **Alle 16:21 l'utente ha reincollato `tutto.js` E `esegui.js` su Flowers**:
   sul database si vede un giro `tutto` completo di Flowers dalle **16:17 alle
   16:21** (anagrafica, metriche, gruppi, keyword-giorni, annuncio-giorni,
   asset, copy, stati-keyword, tutte ok). ⚠️ **Si vede che è girato, non quale
   versione è**: lo script non dichiara la sua versione e la colonna EU si vede
   solo quando crea una campagna — la prova arriva col primo tentativo.
   Quindi resta: (1) **approvare la WORLD-ENG** in `/operazioni` — è tornata
   *da approvare* e finché è lì `esegui` non ha niente da fare; (2) aspettare il
   giro `esegui` (ogni ora, ~:09) o premere Esegui in Google Ads; (3)
   controllare il **registro caricamenti** e che la riga dica **«Creata
   davvero»** invece di «Rifiutata».
   ⚠️ **Se il registro dice «Invalid value in EU political ads»**, il formato è
   l'altro: cambiare `"no"` in `false` in `creaCampagna`, prova a secco,
   rigenerare le copie, reincollare.
1. ~~**Reincollare `tutto.js` del 15/08 nei tre account**~~ — **fatto
   dall'utente il 17/08** (`MetricaAnnuncio` 5.157 righe, `annuncio-giorni`
   arriva da tutti e tre). ⚠️ Superato dal punto 0: le copie buone adesso
   sono quelle delle **15:57**, che contengono anche la colonna EU.
   Promemoria che resta: nel file generato **CHIAVE_API e BRAND sono vuoti**;
   prima di rigenerare le copie, `node scripts/prova-script-google.mjs`.
2. ~~**Le 15 `nuova_keyword` in attesa su `[Cakedesign] | Sales | ITA`**~~ —
   **approvate alle 14:01 ed eseguite alle 14:04 del 17/08** su Cake, tutte
   ok («torte messina», «torte cagliari», «torte genova», «torte brescia»…
   in «Torte per Oggi // ITA»). La coda è vuota.
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
4bis. ~~**Quattro keyword in pausa nell'app che su Google sono attive**~~ —
   **CHIUSO il 19/08**: le aveva riattivate l'utente, che l'ha dichiarato, e
   il bottone «È voluto» ha allineato l'app a Google (5 criteri). Restava
   aperto perché mancava proprio il modo di dirlo — vedi la sezione in FATTO.
5. ~~Su `/ricezione` deve comparire il tipo `annuncio-giorni` per i tre
   account~~ — **c'è** (29 consegne al 17/08 pomeriggio, `MetricaAnnuncio`
   5.157 righe dal 19/05). Resta da fare **a occhio**: aprire una scheda
   gruppo, cliccare un annuncio e controllare che le finestre 7g/mese/30g/anno
   abbiano numeri (e non «storia non ancora raccolta»).

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
- **Il bulk upload di Google Ads non risponde**: `upload.apply()` non
  restituisce niente e lavora in modo asincrono; se rifiuta, l'errore vive
  solo nel registro caricamenti dentro Google Ads. Un esito «eseguita» su una
  `nuova_campagna` vuol dire **inviata**, non creata: la prova è
  l'anagrafica dell'account arrivata dopo (17/08, `/operazioni` lo dichiara).
- **Una campagna nuova senza «EU political ads» viene rifiutata**, e con lei
  gruppo, keyword e annuncio con `The entity does not exist for Campaign` —
  errori che sembrano la causa e sono l'effetto. La colonna c'è dal 17/08
  (`"no"`); se Google risponde «Invalid value», l'altra forma è `false`.
- **Una scrittura che non si rilegge fa registrare un successo che potrebbe non
  essere avvenuto**: `createNegativeKeyword` (08/08), `creaCampagna` (17/08),
  `pause`/`enable`/`setAmount` (18/08). Prima di scrivere «fatto», rileggere —
  **da un selettore NUOVO**, perché l'oggetto in mano tiene lo stato con cui è
  stato letto — e dichiarare il dubbio invece di trasformarlo in un errore.
- ⚠️ **Quando l'app e la piattaforma non concordano, la spiegazione più
  probabile è UNA PERSONA, non un guasto.** Pagata il 18/08: quattro keyword
  «in pausa» nell'app e attive su Google le aveva riattivate l'utente, e io
  avevo già scritto «la pausa non è mai andata» nel commento del codice, nel
  commit e nell'handoff. Chiedere costa una domanda; l'errore resta scritto.
- **Il file `google-ads-script.js` ha gli accenti in MOJIBAKE** (`à` = `C3 83
  C2 A0`): un'ancora di ricerca che contiene «già» non aggancia niente. Le
  patch vanno scritte con ancore **solo-ASCII**.
- **Confrontare col valore di OGGI risponde a una domanda diversa da quella che
  si è fatta**: prima di dire «Google smentisce questa operazione», guardare
  **chi ha toccato quel campo dopo** — quasi sempre un'altra operazione nostra.
  E citare la data dell'**ultima** consegna, non della prima: l'archivio tiene
  lo stato di adesso, non la storia del campo (17/08, § conferme).
- **`OperazioneAdv.idEsterno` NON identifica la keyword**: su una
  `nuova_keyword` è l'id della **campagna** (la keyword non esiste ancora), e
  sulle altre può essere il numero nudo o `account:gruppo:criterio`. Per
  riconoscere una parola si usa **campagna + testo**.
- **Un lavoro `esegui` schedulato a parte** (ogni ora, minuto :09) esegue le
  operazioni: **reincollare `tutto.js` non basta**, va reincollato anche
  `esegui.js`. Si riconosce dal fatto che dopo un'esecuzione non arriva nessuna
  anagrafica entro un paio di minuti.

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
