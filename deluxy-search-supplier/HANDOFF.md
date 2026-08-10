# HANDOFF — Deluxy Search/Supplier (aggiornato al 10/08/2026)

Per riprendere il lavoro su quest'app da una nuova sessione Claude. **Leggere prima
[AI_SPEC.md](AI_SPEC.md)**: è la scheda tecnica completa e aggiornata; questo file dice
solo dove siamo e come si lavora.

## Cos'è e dove vive
- **App live**: https://search-deluxy.vercel.app (progetto Vercel `search-deluxy`, team `deluxy`).
- **Repo**: `donatodnicolo-gif/search`, branch **`main`**, cartella **`deluxy-search-supplier/`**
  (Vercel ha la root del progetto puntata qui). **Push su `main` = deploy automatico (~1 min).**
- Un solo file front-end (`index.html`, vanilla JS) + funzioni Vercel in `api/`
  (`_auth.js` condiviso, `config.js`, `order.js`, `segnala.js`, `storico.js`, `oauth.js`, `webhook.js`).
  Niente npm, KV via REST. Node 24 disponibile per `node --check`.

## Come lavorare (macchina di Nicol)
- Clone/worktree già pronti: worktree su `main` in
  `C:/Users/nicol/app/.claude/worktrees/search-main/` (creato da `C:/Users/nicol/scoutwt`,
  che sta su `scout-ui` — NON lavorare sulla copia alla radice di scoutwt: è vecchia).
  Se manca: `git -C C:/Users/nicol/scoutwt worktree add <dir> main`.
- Anteprima locale SENZA Node: server PowerShell `C:/Users/nicol/scoutwt/.claude/serve.ps1`
  (parametri `-Root <cartella app> -Port 5511`); config `search-main` nel launch.json di
  `deluxy-platform-next/.claude/`. In locale le `/api/*` puntano alla produzione
  (`API_BASE` in index.html); la lock screen si aggira da console nascondendo `#lockScreen`.
- Verifica sempre su https://search-deluxy.vercel.app dopo il push (`curl | grep <marker>`).

## Stato attuale (tutto live e verificato)
1. **Login con utenze**: **email + password** (19/07). `APP_PASSWORD` (env Vercel) = amministratore,
   unico che salva le Impostazioni; utenze operative in Impostazioni → «Utenze dell'app».
   Le password utenze sono **hashate (scrypt+salt, 20/07)**: in KV solo `{nome, salt, passHash}`,
   migrazione automatica delle voci legacy. Header `x-app-password` + `x-app-user`.
2. **Viste**: Smistamento/Ricerca (operativa, 2 colonne: impostazioni a sinistra, risultati a
   destra), Impostazioni (solo card Admin, nascosta altrove), **Storico richieste**.
   Sidebar a scomparsa anche su desktop.
3. **Messaggio copiabile** (`#ord_msg`) rigenerato dai campi ordine, modificabile (il testo
   utente vince); su mobile WhatsApp via `wa.me` (app del telefono).
4. **Registro anagrafiche** (deluxy-anagrafiche.vercel.app, chiavi in Impostazioni):
   dopo ogni ricerca lookup **sempre per provincia** (sigla/nome/nome esteso, ripiego
   città capoluogo), partner 🤝/prospect 📋 in cima ai risultati, match per nome.
5. **💾 Salva in rubrica**: People API con dedupe per numero (ultime 9 cifre), nome contatto
   `FORNITORE [NOME] [FIORAIO|PASTICCERE] PROV. [PR]`; ripiego .vcf senza OAuth.
6. **📣 Segnala al commerciale**: `/api/segnala` fa un solo POST upsert-merge al registro
   secondo le sue regole d'ingaggio (`sistema:'deluxy-suppliers'` + `idEsterno`=place_id,
   `asOf`, niente `stato`): `esito creato` = nuovo prospect, `merged` = note accodate e
   ultimo contatto aggiornato dal registro. Anche le LETTURE passano dal proxy
   `/api/anagrafiche`: nessuna chiave del registro arriva più al browser.
7. **Storico richieste** (`/api/storico`, KV `storico:v1`): richieste WhatsApp/email,
   rubrica, segnalazioni — con utenza, negozio, esito, ordine.
8. **Deep link**: `?brand=…&ordine=…` oppure `?indirizzo=…&categoria=fiorai|pasticcerie`
   (si applicano dopo il login) — per il bottone nelle altre app.
9. **Storico con i check ordine** (20/07): ogni `/api/order` registra un evento `check`;
   import una tantum dei 60gg passati fatto (184 ordini); «↻ Riapri richiesta» su ogni evento.
10. **Stato ricerca + stelline** (20/07, `/api/stato`, KV `statoricerca:v1`): per ordine
   (`brand#numero`) stato `non iniziata/in corso/trovato` + ★ sui fornitori contattati
   (anche schede del registro, id `anag:<id>`), condivisi fra operatori; il click su
   «Invia richiesta» WhatsApp/email mette da solo «in corso» + stella.
11. **`/api/fornitori`** (20/07): top 3 fornitori per un ordine, per AI/plugin (comando `/fornitori`).
12. **Chiavi API `dlxs_`** (20/07, `/api/chiavi`, KV `apikeys:v1`): header `x-api-key` accettato
   da tutte le API; gestione in Impostazioni → «🔑 Chiavi API» (solo admin), segreto mostrato
   una sola volta (salvato scrypt), revoca immediata, Storico firma `chiave:<nome>`.
   Collaudo completo in produzione 20/07 (crea→usa→403 su admin→revoca→401).
   Una chiave dlxs_ è accettata anche nel campo `x-app-password` (app con un solo campo).
13. **Handoff senza login** (20/07, `/api/link`): un'app con chiave API fa POST /api/link →
   codice monouso (KV `linkcode:` TTL 300s); apre `/?t=<code>&brand=&ordine=`; il browser fa
   GET /api/link?code= → sessione (KV `session:` TTL 1h, header `x-app-session`) e la ricerca
   parte già sbloccata. Collaudato end-to-end nel browser (sblocco + ordine + ricerca, no login).
   ⚠️ **Insidia risolta**: `fetchOrder` aveva `if(!PASS) location.reload()` → con la sessione
   (PASS vuoto) andava in loop di reload infinito. Ora `if(!PASS && !SESSION)`. Ogni guard futuro
   su `PASS` deve considerare anche `SESSION`.
14. **Nota Vercel firewall**: burst di richieste (loop/test) da un IP fanno scattare una *System
   Rule* automatica «Challenge» su quell'IP (pagina "Vercel Security Checkpoint"). I browser la
   passano da soli; `curl` no. È temporanea e per-IP, decade da sola. Non è un toggle manuale.
13. **Sezione Contatti** (20/07): voce sidebar «Contatti», vista dedicata (`loadContatti`),
   importa TUTTE le pagine da `/api/anagrafiche` e raggruppa per provincia. Filtri: tipo
   (Partner=stato `attivo` / Fornitori=tutti gli altri stati), categoria (Fiorai/Pasticcerie),
   ricerca testo. NB: il registro contiene 578 schede di MOLTE categorie B2B (boutique 316,
   ristoranti, gioiellerie…), non solo fiorai (114) e pasticcerie (77): «Tutte le categorie»
   le mostra tutte. Da decidere se limitare il default a fiorai+pasticcerie.

15. **Riconciliazione fornitore ↔ registro** (20/07, `/api/riconcilia`): pulsante «🔗 Riconcilia»
   sulle schede Google → si sceglie il contatto del registro (preselezionato dal match per nome)
   → il registro salva il riferimento esterno (deluxy-suppliers + place_id), fonde i dati freschi
   e accoda la nota. Reti di sicurezza per doppioni/omonimie (409 + rollback soft del creato).
   Collaudata in produzione: «Les fleurs de May» (Sainte-Maxime) riconciliata, riferimento e nota
   verificati nel registro.
   In più (20/07 sera): le schede matchate/riconciliate mostrano i **contatti del registro**
   (`enrichCardWithRegistry`: telefono → pulsante «Invia su WhatsApp — numero del registro»,
   email, referenti; dedupe su ultime 9 cifre) e dopo la conferma parte da solo
   **Salva in rubrica** (saveContact: dedupe People API / OAuth / ripiego .vcf).
   NB: l'auto-rubrica usa la stessa saveContact del pulsante manuale ma il percorso automatico
   non è ancora stato esercitato su una riconciliazione vera (l'unica in zona era già fatta).
   In rubrica vanno anche i **referenti** del registro (`salvaReferentiInRubrica`, nome
   `FORNITORE <NEGOZIO> — <NOME> (<RUOLO>)`, dedupe per numero, solo con OAuth).

16. **WhatsApp per i referenti nelle schede del registro** (22/07, `f05d1b3`): in `registryCard`
   anche i telefoni dei **referenti** hanno link 💬 WhatsApp + pulsante «📤 Invia richiesta
   ordine» (prima solo `tel:`/`mailto:`; WhatsApp esisteva solo per il telefono aziendale).
   Stessa normalizzazione di `enrichCardWithRegistry` (prefisso 39 sui cellulari IT, ≥8 cifre,
   dedupe su ultime 9 cifre); il ripiego «📧 Invia via email» compare solo senza alcun numero WA.

17. **Ordini recenti + riconciliazione sulle schede già nostre** (22/07): a ogni ricerca parte
   in parallelo un GET /api/storico; su schede del registro e schede Google matchate compare
   «📦 N richieste ordine inviate — ultima …· #num · brand · canale» (`annotaOrdiniRecenti`,
   match per nome normalizzato o telefono ultime 9 cifre, solo eventi `richiesta`) oppure
   «Nessuna richiesta ordine recente». In più: le schede del registro dicono nel footer se
   sono 🔗 riconciliate con una scheda Google (`p.riferimenti` con sistema `deluxy-suppliers`);
   le schede Google matchate con riferimento esatto (idEsterno=place_id) hanno il badge
   «🔗 riconciliata».

18. **Filtro WhatsApp a 3 stati** (22/07): il checkbox «solo probabili WhatsApp» è diventato
   la scelta «Tutti / 📱 Con WhatsApp / ☎️ Senza WhatsApp» (`#waFilter`, `waFiltro`,
   `applyWaFilter`; con = `wakind==='mobile'`, senza = fissi o senza numero). Le schede del
   registro restano sempre visibili. NB: le pillole usano la classe **`.wchip`** (stesso stile
   di `.chip`) apposta per NON prendere i listener globali di `.chip` (toggle categorie).
   Il filtro è in DUE punti sincronizzati (`setWaFiltro`): nel form di ricerca (`#waFilter`)
   e in cima ai risultati (`#waFilterResults`, appare dopo la prima ricerca).

19. **Fix scoping chip categorie** (22/07): il listener «toggle categorie» e i selettori del
   deep link / `setCategoryForBrand` ora usano **`.catbtns .chip`** (solo le chip della
   ricerca). Prima `document.querySelectorAll('.chip')` prendeva anche le chip dei filtri
   Contatti (`#ctTipo`/`#ctCat`), inquinando il set `cats` con valori spuri (`undefined`,
   `'tutte'`, `'FIORISTA'`) e togliendo/mettendo `.active` sui filtri Contatti. Regola:
   ogni nuovo selettore sulle chip della ricerca va scopato a `.catbtns .chip`.

20. **Doppia nearbySearch (keyword + solo tipo)** (26/07): la ricerca Google per categoria ora fa
   DUE nearbySearch — con keyword localizzata e solo per `type` — e unisce le liste (dedup per
   place_id già a valle). Motivo: la keyword `pasticceria` scartava schede vere — «Le Torte di
   Giada» (Brescia, type bakery) non usciva nemmeno a 0 m dalle sue coordinate (ordine
   cakedesign #1725, consegna in via Odofredo Denari 36) — mentre lasciava passare panifici
   e bar. Dettagli in AI_SPEC §12.9. C'è anche un .gitignore nuovo (`.env*`, `.vercel`).

21-bis. **Numero risultati: opzione 30 + scelta ricordata + gemello sui risultati** (26/07):
   il select «Numero risultati» arriva a 30 e la scelta resta in `localStorage.limitPref`
   (per browser, come la sidebar). In cima ai risultati, accanto al filtro WhatsApp, c'è il
   select gemello `#limitResults` (compare dopo la prima ricerca, come `#waFilterResults`):
   è sincronizzato col form e al cambio **rilancia subito la ricerca** (`run()`). Caso reale: ordine cakedesign #1720 (Villa Vergano LC) — «Pasticceria
   Gelateria Nessi» (Dolzago) era la 12ª per distanza stradale: le ricerche la trovavano,
   ma il limite a 10 la tagliava. Non era colpa di keyword/tipo.

21. **Parole chiave Google personalizzabili** (26/07): in ⚙️ Impostazioni due campi nuovi
   «Parole chiave Google — Fiorai / Pasticcerie» (`config:v1.kwFioraio/kwPasticceria`,
   visibili a tutte le utenze via GET /api/config, salvabili solo dall'admin). Più keyword
   separate da virgola = una nearbySearch per ciascuna, risultati uniti; la ricerca per sola
   categoria si aggiunge sempre. Vuoti = predefinite di `KEYWORDS` per lingua (comportamento
   di prima). AI_SPEC §4.

22. **Refresh = ultima ricerca ripetuta** (26/07): `rememberSearch()` tiene l'URL allineato
   all'ultima ricerca con `history.replaceState` — `?brand&ordine` lo scrive `populateOrder`
   (dai campi `o.brand`/`o.orderName`: ordine vero da Shopify/KV); `?indirizzo&categoria` lo
   scrive `run()` quando l'URL non dice già `?ordine` (quindi anche in modalità manuale).
   Al refresh la sessione si riprende da sessionStorage e `applyDeepLink()` ripete tutto.
   ⚠️ Insidia corretta al volo: la prima versione usava in `populateOrder` le variabili
   `brand`/`number` che sono locali di `fetchOrder` → ReferenceError sul caricamento ordine.
   In `populateOrder` esistono solo `o` e il DOM.

23. **Distanza stradale anche sulle schede del registro** (26/07): `annotaDistanzeRegistro`
   geocodifica (best effort) l'indirizzo censito di ogni scheda registro mostrata in cima e
   aggiunge il badge «🚗 X km · Y min» con lo stesso motore delle schede Google
   (`drivingDistances`: Distance Matrix → OSRM → ripiego 📏 linea d'aria). Non blocca la
   ricerca: gira in parallelo dopo il prepend. Schede senza indirizzo = nessun badge.

24. **«↻ Riapri ricerca» per le ricerche solo-indirizzo** (26/07): `logEvento` ora allega anche
   `ricerca {indirizzo, categoria}` (campo nuovo whitelisted in `api/storico.js`); nello
   Storico gli eventi SENZA ordine ma con indirizzo hanno il pulsante «↻ Riapri ricerca»
   (`.st-reopen-search`) che reimposta indirizzo+categoria e rilancia `run()`. Gli eventi
   registrati prima del 26/07 non hanno il campo e restano senza pulsante.
   In più (stesso giorno): ogni ricerca per zona SENZA ordine registra da sola un evento
   `tipo:'ricerca'` («🗺️ Ricerca in zona · trovati N negozi», nome = indirizzo cercato) —
   prima una ricerca senza azioni non lasciava traccia e non c'era nulla da riaprire.
   Anti-doppioni per sessione (`ultimaRicercaLoggata`): stessa zona ripetuta = 1 evento.
   Con ordine caricato non si registra: c'è già il check di /api/order.

25. **Stella automatica su WhatsApp/chiamata** (26/07): cliccare 💬 (link `a.wa`) o 📞
   (`a.tel`) su qualsiasi scheda — comprese quelle del registro e i numeri dei referenti —
   mette da sola la ⭐ «contattato» (`starShop`, dedupe già incluso); con un ordine caricato
   lo stato ricerca passa a «in corso» (se non già «trovato»), come per «Invia richiesta
   ordine». Listener dedicato su `resultsEl` accanto a quello delle star-btn.
   ⚠️ Insidia trovata in verifica: senza ordine le stelle vivono sotto la chiave `generale`
   ma `loadStato()` partiva solo da `populateOrder`/modalità manuale → sparivano al reload.
   Ora `run()` chiama `loadStato()` a fine ricerca quando non c'è un ordine.

26. **Contatti destinatario nel messaggio al fornitore** (26/07): `buildOrderMessage` aggiunge
   una riga «📍 Destinatario: NOME · 📞 Telefono: NUM» (etichette localizzate `RECIPIENTWORD`/
   `PHONEWORD` per it/en/fr/de/es) dai campi `#ord_recipient`/`#ord_phone`, prima del
   bigliettino. La riga compare solo se almeno uno dei due è compilato; i due campi sono
   nei listener che rigenerano il testo (finché l'operatore non lo edita a mano).

27. **Email dei fornitori nei risultati** (26/07): Google Places non dà l'email → la si
   ricava dal sito del negozio. Prima girava solo con un `proxy` CORS impostato (che era
   vuoto → nessuna email). Ora c'è l'endpoint server `GET /api/contatti?url=<sito>`
   (`api/contatti.js`): scraping lato server, niente CORS/proxy. `scrapeContacts` nel
   front-end passa dal backend di default (dal proxy solo se configurato) e il blocco email
   in `run()` gira SEMPRE (non più `if(proxy)`). Le schede con sito mostrano ✉️ email +
   «📧 Invia via email»; lo Storico segna «email per N». AI_SPEC §5.

28. **Filtro apertura + mappa + estendi ricerca** (26/07): tre aggiunte alla vista Ricerca.
   - **Filtro «Apertura»** (`#openFilter` nel form + gemello `#openFilterResults` sopra i
     risultati, stato `openFiltro`): Tutti / 🟢 Aperti ora / 🔴 Chiusi ora. Si basa su
     `d.opening_hours.isOpen()` di Google, salvato in `shopCard` come `el.dataset.open`
     (`open`/`closed`/`unknown`). Il vecchio `applyWaFilter` è diventato **`applyFilters`**
     che combina WhatsApp **e** apertura; le schede del registro (`dataset.registry`) e i
     negozi con orari non disponibili restano fuori solo dai filtri «aperti/chiusi» (sempre
     visibili con «Tutti»). `setWaFiltro`/`setOpenFiltro` tengono i due gruppi gemelli in
     sincrono. Regola: le pillole usano `.wchip` per non prendere i listener globali di `.chip`.
   - **Mappa dei risultati** (`#toggleMap` → `#mapWrap`/`#map`): bottone «🗺️ Mostra sulla
     mappa» sopra i risultati. Usa la stessa Google Maps JS API già caricata (`libraries=
     geometry` c'era già; la mappa non richiede librerie extra). Segnaposto blu = indirizzo
     di consegna (`origin`), numerati = negozi (posizione da `d.geometry.location`, raccolta
     in `mapPoints` durante il loop dettagli). Click su un marker = InfoWindow (nome, distanza,
     stato apertura) + `focusCard(sid)` che scrolla e evidenzia la scheda. `syncMapMarkers`
     nasconde i marker delle schede filtrate via `applyFilters`. `resetMap` azzera a ogni
     nuova ricerca. NB: sulla mappa vanno solo le schede **Google** (le schede del registro
     sono geocodificate in modo async best-effort, non incluse nei marker).
   - **Estendi la ricerca** (`#noResults` + `#extendBtn` → `extendSearch`): quando la ricerca
     in zona non trova nulla (e non è un errore di quota/chiave) compare «🔎 Estendi la
     ricerca a un'area più ampia». Usa `wideSearch` = `service.textSearch` (query = stesse
     keyword) con bias sulla zona e **raggio ~40 km**, poi passa dallo stesso renderer.
   - **Refactor**: la coda di `run()` (ordina→dettagli→registro→email) è stata estratta in
     **`renderResults(found, geo, origin, service, {extended})`**, condivisa tra ricerca
     normale ed estesa. `run()` salva `lastSearchCtx = {service, origin, geo}` per l'estensione.
     Verificato: `node --check` OK, pagina caricata su 5511 senza errori console, filtro
     apertura e sync gemello testati a runtime. Non collaudato end-to-end su Google (serve
     chiave+login reali): da verificare in produzione su un ordine vero.

29. **Mobile + estendi in fondo alla lista** (26/07, follow-up del 28): due rifiniture.
   - **Estendi anche con risultati**: oltre al bottone su ricerca vuota (`#noResults`), c'è
     `#extendMore` in **fondo alla lista** (`showExtendFooter`), visibile dopo ogni ricerca con
     risultati — così si allarga l'area anche quando qualche negozio c'è. Se la ricerca è già
     stata estesa resta solo il messaggio (siamo già a ~40 km, bottone nascosto). Stessa
     `extendSearch`. Nascosto a inizio ricerca (`run()` e `renderResults`).
   - **Fix mobile intestazione schede** (`@media(max-width:560px)`): `.shop .head` diventa a
     colonna e la colonna badge (inline `flex-direction:column; align-items:flex-end`) passa a
     **riga con wrap** via `!important` — prima il nome lungo si schiacciava a ~150px su 5 righe
     con i badge accanto; ora titolo a piena larghezza (2 righe) e badge a capo sotto. Idem
     `.ct-card .top`; `.content`/`.deal` con padding ridotto; pillole filtro a larghezza piena.
     Verificato a 375px (nessun overflow) e a >560px (layout affiancato invariato).

30. **Orari di apertura anche sulle schede del registro** (26/07): il registro anagrafiche non
   ha gli orari, quindi per partner 🤝 / prospect 📋 mostrati in cima si cerca il negozio su
   Google (`annotaOrariRegistro`: `findPlaceFromQuery` su nome+indirizzo con `locationBias`
   sulla consegna → `getDetails(['opening_hours'])` → `isOpen()`) e si aggiunge il badge
   «🟢 Aperto ora / 🔴 Chiuso ora» nella colonna testa, come per le schede Google. Best effort,
   in parallelo, non blocca la ricerca; se Google non trova la scheda niente badge. Imposta
   anche `card.dataset.open`, ma le schede del registro **restano sempre visibili** (il filtro
   apertura non le nasconde: sono i nostri partner/prospect). Le schede del registro *matchate*
   con una scheda Google avevano già il badge (sono `.shop` Google). Chiamata accanto a
   `annotaDistanzeRegistro` in `renderResults`. Costo: 2 richieste Places per scheda registro
   (poche per zona). Non collaudato end-to-end su Google (serve chiave+login); DOM verificato.

31. **Sezione «Province» — re-seller & vendor per provincia** (26/07): nuova voce sidebar
   (`#navProvince`, vista `view-province`, card `#provinceCard`) che riusa i dati del registro
   di «Contatti» (`ctData`/`anagAllPages`, cache condivisa). Mostra **SOLO re-seller e vendor**
   (`renderProvince`), raggruppati per provincia (gruppi `<details open>` collassabili), con in
   cima le chip di riepilogo **🛍️ N re-seller / 📦 N vendor** e su ogni scheda i tag ruolo +
   la **tipologia di prodotto**. Province con più re-seller/vendor in cima; «non indicata» in coda.
   ⚠️ **Nel registro anagrafiche NON esiste un campo «tipo» né «prodotto»** (verificato sullo
   schema Prisma di deluxy-anagrafiche): re-seller/vendor si ricavano dall'array **`interessi`**
   (`affiliazione` = re-seller, `vendor` = «Vendor Deluxy»), la tipologia di prodotto = campo
   **`categoria`** (FIORISTA/PASTICCERIA/BOUTIQUE…). Il proxy `/api/anagrafiche` inoltra
   `interessi` (già in `dati`). Helper `isReseller`/`isVendor`/`isResellerOrVendor`, `prodChip`
   (mappa `PROD_TIPO` categoria→«🌸 Fiori» ecc.), `ruoloPills`. `ctCard(p,{showRuolo:true})`
   aggiunge la riga tag (usato solo qui; Contatti invariato). Filtri: ruolo (`#pvRuolo`:
   Tutti/Re-seller/Vendor), categoria/prodotto (`#pvCat`), ricerca (`pvFiltro`). Verificato con
   dati finti: filtro solo-reseller/vendor, riepilogo, tag prodotto/ruolo, filtro ruolo, mobile,
   console pulita. Non collaudato sui dati veri (serve chiave registro): dipende da quante
   anagrafiche hanno `interessi` con affiliazione/vendor.

31-bis. **Correzione mappatura (il filtro dava 0 risultati)** (26/07): la v. precedente filtrava
   su `interessi` (affiliazione/vendor), ma **l'import da Excel NON popola mai `interessi`**
   (verificato su `deluxy-anagrafiche/scripts/import-excel.mjs`) → sempre 0 risultati. La
   mappatura VERA (dal tracker Excel) è: **venditori di fiori/torte = `categoria` FIORISTA
   (col «TIPO PROSPECT»=FIORI) / PASTICCERIA (=PASTICCERIA)**; **re-seller/affiliato attivo =
   `stato`='attivo'** (Excel STATUS=PARTNER/ACCETTATA), **prospect = `stato`='prospect'** (STATUS
   vuoto). Il programma specifico (DELUXY FLOWERS / CAKEDESIGN.ME / DELUXY) sta in
   `datiExtra.tipologiaPartnershipAttiva` (JSON, può arrivare come oggetto o stringa → `pvDatiExtra`
   fa il parse). Nuovo filtro base `pvBase` = categoria∈{FIORISTA,PASTICCERIA} ∧ stato∈{attivo,
   prospect} ∧ `attivo`≠false (esclude archiviati). Helper `isVenditoreTF`/`isAttivoReseller`/
   `isProspectP`; chip 🤝 re-seller attivi / 📋 prospect; filtro ruolo `#pvRuolo`
   (tutti/attivo/prospect); filtro prodotto `#pvCat` (Fiori/Torte). `ctCard` mostra la pillola
   ruolo (col programma) + 🌸 Fiori/🎂 Torte. Verificato con dati finti (inclusione/esclusione
   corretta, datiExtra oggetto+stringa, filtri, console pulita). Cross-tab reale attesa: ~93
   FIORISTA + ~78 PASTICCERIA tra attivi(12)+prospect(156).

32. **Modo compatto dell'ordine quando ci sono i risultati** (26/07): la scheda ordine (lunga)
   si **comprime in un riepilogo** appena compaiono i risultati della ricerca, così l'operatore
   ha meno scroll e si concentra sui negozi. Riepilogo (`#orderSummary`, `renderOrderSummary`):
   n° ordine + stato ricerca, foto piccola, destinatario, consegna, prodotto, budget/pagato/
   margine, messaggio (read-only + «📋 Copia»). Toggle: `setOrderCollapsed(bool)` aggiunge/toglie
   `.ordercard.collapsed` (CSS `#orderBox{display:none !important}`); «✏️ Modifica ordine» (nel
   riepilogo) riespande, «▲ Comprimi ordine» (`#collapseOrder`, in cima a `#orderBox`, visibile
   solo se `resultsShown && orderLoaded`) ricomprime. La compressione parte in `renderResults`
   quando `orderLoaded`; `populateOrder`/`manualOrder` resettano `resultsShown=false` e
   riespandono (nuovo ordine → form esteso finché non arrivano i risultati). **I campi originali
   restano nel DOM (nascosti)**: gli invii dalle schede leggono `#ord_msg`/campi come prima.
   Scelta utente fra 3 opzioni (compattamento vs scroll indipendenti vs 1 colonna). Verificato:
   collapse/expand, contenuti riepilogo, mobile (1 colonna, no overflow), console pulita.

33. **Archivia / nascondi risultati** (26/07): ogni scheda risultato ha un pulsante 🗄️ accanto
   alla ⭐; cliccandolo la scheda sparisce dalla lista e finisce nella sezione **«🗄️ Archiviati
   (N)»** (`#archivedBox`, collassabile, sotto i risultati) con «↩ Ripristina». Persistito
   **per ordine** e **condiviso fra operatori**, esattamente come le stelle: campo nuovo
   `archiviati` in `/api/stato` (KV, patch `archivia:{id,nome,on}`, GET lo restituisce). Lato
   client: `statoRicerca.archiviati`, `applyArchive()` (mette `.shop.archived`→`display:none` e
   costruisce il pannello dagli id archiviati con il nome salvato), chiamata in `loadStato` e
   `renderResults`. Le schede restano nel DOM (delega listener intatta); `syncMapMarkers` nasconde
   anche i marker degli archiviati. Chiave = `ordineKey()` (brand#numero o 'generale'). Verificato:
   archivia→sparisce+pannello, ripristina→torna, backend `node --check` OK, console pulita.

34. **Sezione «Archiviati» (globale, per provincia, ricercabile)** (26/07): nuova voce sidebar
   (`#navArchiviati`, vista `view-archiviati`, card `#archiviatiCard`) che elenca **tutti** i
   fornitori archiviati di **tutti gli ordini**, raggruppati per provincia, con ricerca e
   «↩ Togli da archiviati». Per raggruppare per provincia, all'archiviazione ora si salvano anche
   **provincia/città/categoria/indirizzo/telefono** (helper `datiSchedaPerArchivio`: da
   `CARD_DATA` per le schede Google, da `lastAnagList` per quelle del registro). Backend
   `/api/stato`: la POST `archivia` memorizza questi campi extra; **nuovo GET
   `?archiviati=tutti`** restituisce l'elenco aggregato `[{id, ordine, nome, provincia, citta,
   categoria, …}]` scorrendo tutte le chiavi. Il ripristino fa POST con l'`ordine` della voce
   (archivia off) e, se è l'ordine aperto ora (`ordineKey()`), aggiorna anche i risultati in
   vista (`applyArchive`). Le voci archiviate PRIMA di questa modifica non hanno provincia →
   «Provincia non indicata». Verificato con dati finti: raggruppamento, ricerca, ripristino con
   ordine corretto, console pulita.

35. **Province normalizzate + caricamento più veloce** (27/07): due fix a Contatti/Province/
   Archiviati (tutte raggruppano per provincia).
   - **MI vs Milano**: nel registro `provincia` è testo libero (MI, MILANO, «Città Metropolitana
     di Milano»…) → uscivano gruppi doppi. Aggiunta tabella province IT + `normProv(v)` che porta
     tutto alla **sigla** (con NFD/strip accenti, rimozione prefissi «provincia di / città
     metropolitana di», alias Monza/Reggio/Forlì) e `provLabel(k)` = «📍 MI · Milano». Usati nei
     tre `renderContatti/renderProvince/renderArchiviati`.
   - **Lentezza caricamento**: `anagAllPages` scaricava le pagine (perPage 200) **in sequenza**
     (browser → proxy `/api/anagrafiche` → registro, con cold start su entrambi). Ora scarica la
     1ª pagina, legge `totale`, e scarica le successive **in parallelo** (`Promise.all`). Resta la
     cache in memoria `ctData` (condivisa Contatti/Province): lento solo al primo caricamento
     della sessione, poi istantaneo; «↻ Aggiorna» forza il refetch.

36. **Estensione a 10 km, filtro stelle, mappa migliorata, «vedi su Maps»** (27/07):
   - **Estendi a scatti di 10 km** (prima ~40 km in un colpo): `extendRadius` +10 km a ogni clic,
     max 50 km (`EXTEND_STEP`/`EXTEND_MAX`); `wideSearch(...,radius)` passa il raggio a
     `textSearchOne`; `showExtendFooter` mostra «~N km» e il bottone «+10 km» finché non è al max;
     `run()` azzera `extendRadius`.
   - **Filtro «⭐ 4+ stelle»** in `#rateFilterResults` (`ratingFiltro`, applyFilters su
     `dataset.rating` = `d.rating`, soglia ≥ 4). Le schede del registro (senza rating Google)
     restano sempre visibili, come per gli altri filtri.
   - **Mappa — clic sul segnaposto**: non salta più al record; apre una **tendina (infowindow)**
     coi dettagli (nome, indirizzo, ★ valutazione, distanza, aperto/chiuso, link 📞/💬/🗺️ Maps e
     «Vedi la scheda completa ↓» che usa `focusCard`). `mapPoints` arricchito (address, rating,
     phone, waDigits, url).
   - **«🗺️ Vedi tutti su Google Maps»** (`#openGmaps`): apre Google Maps con la ricerca della
     categoria centrata sulla consegna (`/maps/search/<kw>/@lat,lng,13z`).
   - **Fix mobile**: le pillole dei filtri risultati venivano tagliate (testo icone poco
     visibile) → su ≤560px `flex:0 0 auto` così si dimensionano al testo e vanno a capo.
   Verificato: filtro stelle (incl. registro sempre visibile), fix mobile (niente clip/overflow),
   sintassi OK, console pulita. NON collaudati end-to-end su Google (serve chiave+login): infowindow
   mappa e URL «vedi su Maps» — logica verificata staticamente.

37. **Ordine↔indirizzo, Azzera, fix Storico ricerche senza ordine** (27/07):
   - **Numero ordine vuoto ⇒ indirizzo vuoto**: l'indirizzo non si precompila più da
     `localStorage` senza un ordine e si svuota appena si cancella il numero ordine
     (`$('#orderNum')` input listener).
   - **Pulsante «🔄 Azzera»** (accanto a «Cerca in zona»): `resetSearch()` riporta la vista allo
     stato iniziale (svuota ordine, indirizzo, risultati, mappa, footer; filtri→Tutti;
     categorie→Fiorai+Pasticcerie; azzera `extendRadius`/`lastSearchCtx`/`ultimaRicercaLoggata`;
     pulisce i parametri URL).
   - **Fix Storico — ricerche senza ordine Shopify**: in `renderResults` il logging della
     ricerca in zona usava `address`, che NON è in scope (locale a `run()`); come bareword il
     browser lo risolveva nell'**elemento `<input id="address">`** → `ultimaRicercaLoggata`
     diventava l'elemento e il dedup bloccava ogni ricerca zona dopo la prima (+ `nome` evento
     rotto). Ora si legge `$('#address').value`. Inoltre «↻ Riapri ricerca» azzera il contesto
     ordine così la ripresa è una ricerca zona pulita e ri-registrata. Verificato dal vivo.

38. **Foto dei negozi da Google Maps** (10/08): ogni scheda risultato mostra una **foto di
   copertina** (150px, 180px su mobile) fra i dati e i contatti, con la pillola «📷 N foto»;
   cliccandola si apre a tutto schermo (`#lbox`) la **griglia con tutte le foto insieme**
   (5 colonne su desktop, 2 su mobile) e cliccandone una la si **ingrandisce**, con ‹ ›,
   contatore e «↩ Tutte le foto». Esc torna alla griglia, un secondo Esc chiude; con una foto
   sola si apre già ingrandita. L'attribuzione richiesta da Google è sempre in fondo.
   Copertina anche sulle schede del
   **registro** (partner/prospect: le foto arrivano dalla stessa `findPlaceFromQuery` +
   `getDetails` che già serviva per gli orari, in `annotaOrariRegistro`) e **miniatura nella
   tendina della mappa** (`mapPoints[].foto`).
   ⚠️ **Il punto delicato è il costo**: il campo `photos` nei dettagli è gratis, ma **ogni
   immagine scaricata è una richiesta Place Photo a pagamento**. Per questo la scheda carica
   **una sola** foto, con `loading="lazy"` (le schede fuori schermo o nascoste dai filtri non
   scaricano niente) e le altre partono solo aprendo la galleria. Chi in futuro volesse una
   striscia di miniature deve rifare questo conto: 30 risultati × 5 miniature = 150 richieste
   a pagamento per ricerca.
   **Interruttore** in ⚙️ Impostazioni → «Mostra le foto dei negozi» (`config:v1.mostraFoto`,
   `'1'` predefinito anche se mai salvata, `'0'` = spente: con le foto spente non parte
   nessuna richiesta). Salvabile solo dall'admin, letto da tutte le utenze.
   Verificato in locale con dati finti (porta 5511): copertina + pillola conteggio, apertura
   sulla griglia con tutte e 6 le foto finte, clic sulla terza → ingrandita «3 / 6», frecce coi
   limiti giusti, Esc→griglia→Esc→chiusa, caso «una foto sola» che si apre ingrandita, griglia
   svuotata alla chiusura, attribuzione resa come link, interruttore acceso/spento/mai-salvato,
   desktop 5 colonne e mobile 375px 2 colonne senza overflow, console pulita, sintassi OK. **Non collaudato su Google vero** (serve chiave + login): da guardare in
   produzione su un ordine reale — soprattutto quanti negozi hanno davvero le foto.

## Cose in sospeso
- **Utenze operative**: da creare in Impostazioni (finché non esistono si entra solo col
  pass code amministratore + un'email qualsiasi). Le email degli operatori vanno anche
  aggiunte come **test user** dell'app OAuth (vedi sotto).
- **Bottone nelle altre app**: deciso il deep link, manca l'integrazione (in quale app?).
- **Numeri della mappa (proposto, non fatto)**: l'utente chiede perché i vicini a volte hanno
  numero più alto. Risposta: i numeri = rango in lista (per «Ordina per»: Distanza=strada, o
  Valutazione), e i marker filtrati/archiviati lasciano buchi. Offerto ma da confermare:
  **rinumerare solo i marker visibili (contigui) + badge «#N» anche sulla scheda**.
- **Pulizia eventi Storico vecchi**: gli eventi «ricerca» salvati prima del fix (27/07) hanno il
  `negozio.nome` rotto (elemento invece dell'indirizzo). Offerto: pulizia una-tantum che li
  sistema/nasconde. Da confermare.
- **Cache anagrafiche (offerto)**: `ctData` è cache in memoria per sessione (Contatti/Province/
  Archiviati). Si può persistere in `sessionStorage` con scadenza o precaricare in background
  per evitare il ricarico al refresh. Da confermare.
- **Filtro «4+ stelle»**: soglia attuale ≥ 4 (include 4.0). Se serve *strettamente* >4, 1 riga.

## OAuth Google rubrica — CONFIGURATO E VERIFICATO (20/07/2026)
- Il client attivo è **«Deluxy search rubrica» `813248887384-kdksp8lq8p8pg4tou6b2q4i7r0avchjt`**
  nel progetto **My Project 75759** (`xenon-jetty-502714-c9`) dell'account
  **deluxy.delivery@gmail.com** — NON quello vecchio `639032328429-…` di deividcala
  citato dai handoff precedenti (esiste ancora, ma non va usato).
- Già in Impostazioni → «Google OAuth Client ID»; verificato su Google Cloud:
  origini JS `search-deluxy.vercel.app` + `deluxy-anagrafiche.vercel.app` + `localhost:3060`,
  **People API attivata**, app in modalità **Test** con test user
  deluxy.delivery@gmail.com e donatod.nicolo@gmail.com (nuovi operatori → aggiungerli qui:
  console.cloud.google.com/auth/audience?project=xenon-jetty-502714-c9).
- Duplicato registro «Essenza Fiorita»: già rimosso; «G32 Piante e Fiori Palermo» ha
  telefono italiano corretto. Niente da fare.

## Regole fisse
- Modifiche SEMPRE nel worktree su `main` → commit → push → verifica live. Mai committare
  segreti (le chiavi vivono in env Vercel o nella config KV via Admin).
- Aggiornare AI_SPEC.md (e questo HANDOFF) a ogni commit rilevante.
- CLAUDE.md alla radice del repo scoutwt + Deluxy Design System valgono anche qui.
