# HANDOFF — Deluxy Search/Supplier (aggiornato al 19/08/2026)

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
- ⚠️ **«Deploy in ~1 minuto» non è garantito: il 17/08 sera la coda ha messo ~30 minuti.**
  Il push delle 16:07 è diventato Production alle 16:31, quello delle 16:14 alle 16:48. Per
  mezz'ora sembrava che il deploy non fosse partito affatto (nessun deployment in elenco per
  `main`, mentre i push di altre sessioni su `scout-ui` producevano Preview regolarmente).
  **Non concludere «il deploy non parte» dopo pochi minuti**: aspetta e ricontrolla.
  Come si controlla davvero: `npx vercel list search-deluxy --scope deluxy` → riga **Production**
  e la sua età; `npx vercel inspect <url> --scope deluxy` dice `target` e, dagli alias, il branch
  (`…-git-main-…` = main). Due cose che NON sono prove: il `Last-Modified` di `/index.html` (su
  una MISS è l'ora della cache) e il contenuto dell'URL del deployment (le URL di deployment
  hanno la protezione Vercel e rispondono con la pagina di login, ~480 KB, non con l'app).
  Se serve pubblicare a mano: `vercel link --project search-deluxy --scope deluxy` **dalla radice
  del worktree** (non dalla cartella dell'app: la Root Directory del progetto è già
  `deluxy-search-supplier` e verrebbe applicata due volte) → `vercel deploy` per una Preview da
  verificare → `vercel promote <url>`. Il link crea `.vercel/` e `.env.local` (ignorati da git):
  cancellali dopo. Il 17/08 il deploy CLI è rimasto appeso ~20 minuti senza output e non è
  servito: ha fatto prima la coda del webhook.
- ⚠️ **Per sapere se «live == main» confronta l'HTML, non gli SHA**: `main` è anche il branch di
  altre app del repo, quindi ci sono deploy di produzione nuovi anche senza modifiche qui.
  Su Windows/PowerShell 5.1 **non usare `Get-Content -Raw`** per il confronto: legge l'UTF-8
  senza BOM come ANSI, gli accenti e le «» diventano 2 caratteri e il diff mostra decine di
  righe finte diverse. Ricetta giusta: leggere i due file con
  `[System.IO.File]::ReadAllText($p,(New-Object System.Text.UTF8Encoding($false)))`,
  normalizzare `\r\n`→`\n` e togliere il BOM (`TrimStart([char]0xFEFF)`) dalla copia salvata
  con `Out-File -Encoding utf8`.

## Verifica del 17/08/2026 (sera) — nessuna modifica al codice
`origin/main` = HEAD del worktree = **e0d56ea8**, worktree pulito. Produzione: HTTP 200 in
0,6 s, 217 KB, `X-Vercel-Id: fra1::…`, `Last-Modified` 17/08 13:38 GMT (deploy di e0d56ea8) e
HTML live **identico** a `index.html` di main (a meno del CRLF) → **live == main**. Marker
presenti: `TIPO_PRODOTTO`, `ASPHOTOWORD`, `prodottoPerMessaggio`, `tipoProdotto`, `orderItems`,
`lbox`, `mostraFoto`, `PLACE_FOTOS`, `extendMore`, `navArchiviati`, `lockScreen`. Tutte le API
senza chiave rispondono **401** (`/api/config`, `/api/stato`, `/api/storico`,
`/api/anagrafiche`, `/api/contatti`): muro d'autenticazione integro (per questo dalla sessione
non si vedono dati reali né si può diagnosticare «La Mimosa»).

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
   `FORNITORE [NOME] [FIORAIO|PASTICCERE] [PROVINCIA] PROV. [PR]` (dal 19/08 c'è anche il nome
   della provincia: «… FIORAIO AOSTA PROV. AO»); ripiego .vcf senza OAuth.
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

39. **Messaggio al fornitore: tipologia + «come da foto»** (17/08): su richiesta dell'utente, nel
   testo WhatsApp/email non va più il nome commerciale del prodotto ma **«un Bouquet» / «una
   Cappelliera» / «una Torta» + variante + «come da foto»** («Buongiorno, è possibile un Bouquet
   Grande come da foto x1 da spedire con consegna a …?»), nelle 5 lingue. La tipologia viene dal
   `productType` di Shopify (campo nuovo `items[].type` in `api/order.js` e `api/webhook.js`) o, se
   vuoto, dal titolo (`tipoProdotto`). Senza foto resta il nome del prodotto come prima; tipologia
   non riconosciuta o righe miste → nome prodotto + «come da foto». Il riepilogo a schermo mostra
   sempre il nome vero. Verificato in locale (5511) su 7 casi + rigenerazione al cambio foto;
   `node --check` OK; console pulita. Dettagli in AI_SPEC §9.
   ⚠️ Gli ordini già in KV (salvati dal webhook prima di oggi) non hanno `type`: per loro decide il
   titolo. Il `productType` dei prodotti su Shopify va **compilato** (Bouquet/Cappelliera) perché il
   riconoscimento sia certo: dal titolo è un'euristica.

40. **Paginazione dei risultati Google: fino a 60 negozi per ricerca** (17/08, rimedio scelto
   dall'utente per «La Mimosa»): una `nearbySearch` dà **max 20 risultati per chiamata**, i più
   vicini in linea d'aria — in città densa i 20 più vicini stanno entro un chilometro e chi è
   poco oltre non entra mai, con qualunque «Numero risultati» (che taglia dopo). Ora `nearbyOne`
   segue `pagination.nextPage()` fino a **3 pagine (60)**, su tutte le chiamate della categoria
   (una per keyword + quella per solo `type`). Nuova impostazione admin **«Quanti negozi chiedere
   a Google per ogni ricerca»** (`#cfg_pagine` → `config:v1.pagineRicerca`: 1 = i primi 20 come
   prima, 2 = 40, 3 = 60 **predefinito** anche se mai salvata; sanificata sia in `api/config.js`
   con `pagine()` sia nel client con `paginePerRicerca()`).
   ⚠️ **Costo**: ogni pagina è una chiamata Places a pagamento × keyword × categorie — con 2
   categorie e 1 keyword si passa da 4 a 12 chiamate per ricerca. `textSearchOne` («Estendi la
   ricerca») **non** è paginato: là si allarga il raggio di 10 km alla volta.
   Tre reti di sicurezza da non togliere: attesa di 1,2 s prima di `nextPage()` (il
   `next_page_token` non è valido subito), `try/catch` attorno a `nextPage()`, e un **timeout che
   risolve comunque la Promise** — senza quello una pagina che non arriva lascia `run()` appeso
   per sempre su `Promise.all` e la ricerca non finisce più. Dettagli in AI_SPEC §12-quater.
   Verificato: `node --check` su `api/config.js` OK, sintassi dello script inline OK, **17
   controlli automatici** su `nearbyOne` con un PlacesService finto (3 pagine piene → 60 negozi
   in 3 chiamate; Google che finisce alla 2ª → 27 e nessuna 3ª chiamata; impostazione 1 → una
   sola chiamata; impostazione 2 → si ferma a 40; ZERO_RESULTS → lista vuota; `nextPage()` che
   lancia → si tiene la 1ª pagina; `nextPage()` muto → la rete di sicurezza sblocca), select
   dell'impostazione letto/scritto correttamente per tutti i valori (compresi vuoto e testo
   spazzatura → 3), pagina caricata sulla 5511 senza errori in console.
   **In produzione dalle 16:48 del 17/08** (HTML live identico a `index.html` di main, marker
   `cfg_pagine`/`pagineRicerca`/`PAGINA_ATTESA_MS`/`hasNextPage` presenti, API ancora 401 senza
   chiave). **Non collaudato su Google vero** (serve chiave + login): da guardare in produzione
   sull'ordine deluxyflowers #2734 se «La Mimosa» ora compare.

41. **La tipologia si recupera anche quando la foto c'è già** (19/08): buco trovato guardando un
   ordine vero (consegna 18/08 in Francia, «Monet - Giardino a Giverny Medio-Grande»). In
   `api/order.js` l'ordine pescato dal magazzino KV veniva arricchito dall'Admin API **solo se
   mancava la foto** (`if (!data.photoUrl)`): un ordine con la foto e senza `type` non lo
   recuperava mai più, nemmeno compilando dopo il `productType` su Shopify. Ora la condizione è
   **foto mancante OPPURE tipologia mancante su qualche riga** (`tipiMancanti`), il salvataggio in
   KV avviene solo se qualcosa è davvero cambiato (`cambiato`) e le note sulla foto compaiono solo
   quando la foto manca davvero (prima una foto già presente poteva prendersi un
   «Foto non disponibile…» fuorviante). Costo: una chiamata Admin API in più solo sugli ordini a
   cui manca la tipologia; zero chiamate in più quando c'è tutto.
   Verificato con 11 controlli automatici sul blocco vero estratto dal file (foto presente + type
   mancante → recupera e risalva; tutto presente → zero chiamate; foto mancante → foto + type +
   immagine di riga; Shopify senza foto → nota giusta ma type preso lo stesso; negozio non
   collegato o errore Shopify → nessuna nota fuorviante se la foto c'è; niente di nuovo → nessun
   salvataggio inutile; titoli che non combaciano → riga invariata) + `node --check` OK.
   ⚠️ **Ma da solo NON basta a far dire «un Bouquet»**: vedi «Cose in sospeso».

42. **Il formato del prodotto si legge dai TAG di Shopify (+ tabella di riserva)** (19/08): è la
   risposta al «perché il messaggio dice ancora il nome del prodotto». Il `productType` di Shopify
   **non è il formato**: è la categoria commerciale (`Fiori d'Arte`, `Originali Deluxy`,
   `Cake Design`, `Dolci di Natale` — letti sul catalogo vero col connettore Shopify). Il formato
   sta nei **tag** del prodotto (`Bouquet`, `Cappelliera`, `Cake Design`).
   - `api/order.js`: la query GraphQL chiede `product { … tags }` e `normalize` porta
     **`items[].tags`**; l'arricchimento dell'ordine in KV parte anche quando mancano i tag
     (il webhook non li manda, quindi per gli ordini vecchi arrivano al primo riaprire).
   - `index.html`: `classificaFormato(testo)` (le tre famiglie di parole, estratta dalla vecchia
     `classifica`), `mappaTipi()` (legge la tabella dell'admin) e `tipoProdotto(item)` che decide
     in quest'ordine: **tag → tabella sulla categoria → categoria a parole → titolo**.
     ⚠️ Se **due tag dicono formati diversi** (es. un set con bouquet e cappelliera) NON si tira a
     indovinare: si torna al nome del prodotto. L'errore lo leggerebbe il fornitore.
   - Nuova impostazione admin **«Categorie Shopify → tipo di prodotto (riserva)»**
     (`#cfg_mappa` → `config:v1.mappaTipi`, testo libero «Fiori d'Arte = bouquet, Cake Design =
     torta», max 2000 caratteri): serve solo quando i tag non dicono niente. Il valore a destra
     passa dallo stesso classificatore, quindi «Bouquet», «bouquet» e «mazzo» valgono uguale.
   Verificato: 20 controlli automatici sulle funzioni vere estratte dal file — coi **prodotti veri
   del catalogo** («Monet - Giardino a Giverny» type Fiori d'Arte + tag Bouquet → bouquet; «Mario
   party cake» → torta; «Uovo di Pasqua Monet» → nessun formato, resta il nome), ordine vecchio
   senza tag con e senza tabella, tabella scritta male/maiuscole/sinonimi/righe spazzatura, tag in
   disaccordo, e i casi del 17/08 che dovevano continuare a funzionare. In più, nel browser sulla
   5511, il messaggio vero: **«un Bouquet Medio-Grande comme sur la photo»** col tag, «una Torta 20
   come da foto» in italiano, il nome del prodotto quando non c'è la foto. `node --check` OK.
   **Non collaudato su un ordine vero in produzione** (serve il login): la prova è riaprire
   l'ordine dello screenshot e guardare il messaggio.

43. **La variante: «per 20 persone» sulle torte, niente taglia sui fiori** (19/08, scelta
   dell'utente): il messaggio diceva «una Torta **20** come da foto». Su Shopify le torte si
   vendono a **porzioni** (l'opzione del prodotto si chiama `Porzioni`, valori numerici nudi:
   6, 10, 15, 20…; su 50 prodotti «Cake Design» ~20 sono così, alcuni con una seconda opzione
   `Interno` → variante `20 / Cioccolato`), mentre per i fiori l'opzione è `Dimensione`
   (`Medio`, `Medio-Grande`, `Luxury`…). Quindi ora:
   - **torte**: il numero diventa «**per 20 persone**» nella lingua della consegna
     (`PERSONEWORD`: it/en/fr/de/es); la seconda opzione segue dopo la virgola
     («una Torta per 20 persone, Cioccolato come da foto»); una variante non numerica resta
     tal quale (`variantePerTorta`);
   - **bouquet e cappelliere**: la variante **non entra più nel messaggio** — è la nostra taglia
     commerciale, al fioraio non dice niente (al suo posto c'è il budget);
   - **tipologia non riconosciuta**: si mostra il nome del prodotto **con** la variante, che lì
     serve a capire cosa è stato ordinato.
   NB: nessuna modifica al backend — il numero è già nella variante che manda il webhook, e la
   parola «persone» non dipende dal nome dell'opzione Shopify.
   Verificato: 15 controlli automatici sulle funzioni vere (5 lingue, due opzioni, variante non
   numerica, bouquet/cappelliera senza taglia, tipologia ignota, tabella di riserva, percorso
   senza foto invariato) + messaggio intero nel browser:
   «Bonjour, pour 2026-08-21 serait-il possible de préparer **un Gâteau pour 20 personnes,
   Cioccolato** comme sur la photo x1 …» e «… de préparer **un Bouquet** comme sur la photo …».

44. **Bottone «🛍️ Apri su Shopify» sull'ordine** (19/08, chiesto dall'utente): apre l'ordine
   nell'admin Shopify in una scheda nuova, sia dalla testata della scheda ordine
   (`#shopifyLink` in `.ordertitle`, allineato a destra) sia dal **riepilogo compresso**
   (accanto a «✏️ Modifica ordine») — che è quello che l'operatore vede quando ci sono i risultati.
   - URL: `https://admin.shopify.com/store/<handle>/orders/<id>`. L'**handle** viene dalla
     cassaforte (`CONFIG.stores[].shop`, es. `cakedesign-5921.myshopify.com` → `cakedesign-5921`):
     `GET /api/config` restituisce `shop` al browser, il token no. L'**id** è nuovo:
     `orderId` in `api/order.js` (dal `gid://shopify/Order/123` che la query già chiedeva) e in
     `api/webhook.js` (`o.id`).
   - **Ripiego senza id** (ordini salvati dal webhook prima di oggi, ordini compilati a mano):
     `…/orders?query=%23<numero>`, la ricerca dell'admin per numero ordine — un clic in più, zero
     chiamate API. Per questo non serve rileggere l'ordine da Shopify solo per avere l'id.
   - Il bottone **non compare** se il negozio non è in cassaforte o se non c'è né id né numero;
     `resetSearch` lo nasconde (e riporta `#ordTag` a «ordine»).
   - Il numero si legge da `#ordTag` (l'ordine **caricato**) e non dal campo di ricerca, che
     l'operatore può aver già cambiato per cercarne un altro.
   Verificato nel browser: link con id, ripiego per numero, campo di ricerca cambiato (il bottone
   resta sull'ordine caricato), manuale con e senza numero, negozio non configurato, dopo «Azzera»,
   presenza nel riepilogo con `target="_blank" rel="noopener"`; console pulita (restano solo i 401
   delle API in locale). `node --check` su `order.js` e `webhook.js` OK.

45. **Prefisso internazionale nei numeri + avviso «tipologia non riconosciuta»** (19/08):
   - **Prefissi**: le schede Google mostrano ora `international_phone_number` («+39 0165 547485»
     invece di «0165 547485») — è Google a sapere il paese del negozio, non si indovina niente.
     Per i numeri del **registro** il paese non è scritto da nessuna parte: `telConPrefisso(num,
     provincia)` aggiunge `+39` **solo** se `provItaliana(provincia)` (sigla nella tabella delle
     107 province), e mai se il numero ha già `+`/`00`. Su un partner estero (Sainte-Maxime, Var)
     il numero resta com'è: meglio senza prefisso che con quello sbagliato, perché lo compone una
     persona. Applicato a schede registro, referenti, numeri del registro sulle schede Google
     (`enrichCardWithRegistry`) e tendina della mappa.
   - **Avviso sulla tipologia** (`#tipoHint`, `aggiornaTipoHint`): sotto il campo «Prodotto» ora
     c'è scritto cosa finirà nel messaggio — «✅ Nel messaggio: “un Bouquet … come da foto”»
     oppure «⚠️ Tipologia non riconosciuta (<perché>): nel messaggio va il nome del prodotto»
     con i **tag letti**, la **categoria** e i due rimedi. I «perché» distinti: nessun tag sul
     prodotto (o ordine salvato prima del 19/08 → riaprirlo), nessun tag utile fra quelli letti,
     righe dell'ordine con tipologie diverse, ordine compilato a mano. Senza foto l'avviso non
     compare (lì il nome del prodotto è voluto). Si aggiorna anche quando il testo è stato
     modificato a mano.
     Motivo: il 19/08 l'unico modo di accorgersi che il messaggio diceva ancora «Monet - Giardino
     a Giverny» era leggere il testo già pronto per il fornitore. Ora lo dice la scheda, e dice
     anche quale dato manca.
   Verificato nel browser: numero Google col prefisso (testo e `tel:`), registro italiano con
   `+39`, registro francese invariato, numero già con `+39` non raddoppiato; avviso nei 5 casi
   (riconosciuto, tag inutili, ordine senza tag, righe discordi, senza foto). Console pulita.

46. **Rubrica: il nome della provincia nel nome del contatto** (19/08, chiesto dall'utente):
   `contactName` produce ora «FORNITORE L'ORCHIDEA FIORI DI ANGELA VISENTIN FIORAIO **AOSTA
   PROV. AO**» (prima solo «PROV. AO»). Il nome esteso viene da `SIGLA2NAME` dopo `normProv`, che
   normalizza anche «Città Metropolitana di Milano» → MI e «Monza e Brianza» → MB. Se la provincia
   **non è italiana** o non si riconosce si tiene il valore grezzo («PROV. VAR»): non si inventa un
   nome che non c'è. Senza provincia il nome finisce con la categoria.
   Vale anche per il ripiego **.vcf** (usa la stessa funzione). I referenti hanno un formato loro
   (`FORNITORE <NEGOZIO> — <NOME> (<RUOLO>)`) e restano senza provincia.
   ⚠️ I contatti già salvati col nome vecchio **non cambiano**: il dedupe è sul numero (ultime 9
   cifre), quindi non si creano doppioni, ma i vecchi restano «PROV. AO» finché non si rinominano
   a mano. Verificato nel browser su 8 casi (screenshot, pasticceria, provincia per esteso, città
   metropolitana, Monza, estero, senza provincia, tutto minuscolo).

47. **Il bottone della rubrica, dopo il salvataggio, APRE il contatto** (19/08, chiesto
   dall'utente): finito il salvataggio il bottone non è più morto — diventa
   «✅ In rubrica: <nome> · ✏️ apri» (o «ℹ️ Già in rubrica: …») e al clic apre il contatto nei
   **Contatti Google** in una scheda nuova, per correggerlo a mano (il nome che generiamo è lungo
   e tutto maiuscolo, e spesso c'è da sistemare qualcosa).
   - L'id arriva dal `resourceName` della People API: `createGoogleContact` ora **restituisce**
     la risposta (prima la buttava via) e `findContactByPhone` restituiva già la persona trovata.
     URL: `https://contacts.google.com/person/<id>`; se l'id manca si ripiega sulla **ricerca per
     nome** (`/search/<nome>`).
   - `segnaInRubrica(btn, nome, resourceName, gia)` fa tutto: scrive il testo, riabilita il
     bottone e mette `dataset.contactUrl`. `saveContact` in cima: se `contactUrl` c'è **non
     risalva**, apre.
   - ⚠️ Il salvataggio automatico dopo la **riconciliazione** chiama `saveContact(sc, {auto:true})`:
     con `auto` non apre nessuna finestra (altrimenti la riconciliazione avrebbe aperto da sola
     una scheda del browser addosso all'operatore).
   - Senza OAuth resta il ripiego `.vcf`, che non ha un contatto da aprire: testo invariato.
   Verificato nel browser: testo e URL nei tre casi (creato, già esistente, senza id → ricerca per
   nome), bottone riabilitato, clic che apre invece di risalvare, percorso automatico che non apre
   niente. Console pulita.

48. **La foto dell'ordine si apre a tutto schermo e si copia** (19/08, chiesto dall'utente): la
   miniatura del **riepilogo compresso** (`.os-photo`) e quella della scheda ordine (`#ord_thumb`)
   ora si cliccano (cursore `zoom-in`) e aprono la foto a tutto schermo; lì un clic
   sull'immagine — o il bottone **«📋 Copia foto»** — la mette negli appunti, pronta da incollare
   con Ctrl+V in WhatsApp Web.
   - Riusa la **lightbox delle foto negozio** (`#lbox`: ✕, Esc, clic fuori) registrando una scheda
     finta `PLACE_FOTOS['ordine']` con l'unica foto → si apre già ingrandita (`apriFotoOrdine`).
   - `lbOrdine` (impostato in `apriFoto` da `sid === 'ordine'`) distingue le due modalità: sulla
     foto dell'ordine compaiono bottone copia e cursore `copy`; sulle foto dei **negozi** no —
     sono di Google e vogliono l'**attribuzione**, non la copia negli appunti.
   - La copia usa il PNG già preparato (`photoPng`, lo stesso dell'invio WhatsApp): niente
     download in più. Tre esiti distinti e onesti in `#lbAttr`: «✅ Foto copiata…», «⚠️ Il browser
     non ha permesso la copia: usa «⬇️ Scarica foto»…», «⏳ La foto si sta ancora preparando…»
     (o l'errore vero se il download della foto era fallito).
   Verificato nel browser: apertura dal riepilogo, modalità singola, titolo, bottone e cursore,
   attribuzione Google che torna sulle foto dei negozi (bottone copia nascosto), chiusura, e i
   **tre esiti della copia** simulando appunti che funzionano, che rifiutano e foto non pronta.
   Console pulita.

49. **«Estendi» non butta più via i risultati + «Aggiungi negozio per nome» + cache dei dettagli**
   (19/08, segnalazione dell'utente: «il pulsante estendi non funziona bene, ricarica la pagina e
   fa un sacco di disordine» sull'ordine deluxyflowers #2756).
   - **Il bug**: `extendSearch` passava a `renderResults` **solo** i risultati della ricerca
     allargata (`textSearch`), e `renderResults` comincia con `resultsEl.innerHTML=''`. Siccome è
     un'interrogazione diversa, i negozi di prima non c'erano tutti: la lista veniva **sostituita**
     e l'operatore vedeva sparire quello che aveva sotto gli occhi (e la lista poteva persino
     accorciarsi, perché `textSearch` dà max 20 per parola chiave). Ora si **uniscono** vecchi e
     nuovi (`lastSearchCtx.found`, dedup per place_id) e si ridisegna l'insieme.
   - Se l'allargamento non trova **nessun negozio nuovo**, la lista non viene nemmeno ridisegnata:
     si scrive «Nessun negozio NUOVO entro ~N km» e si tiene tutto com'è. Altrimenti lo status dice
     quanti se ne sono aggiunti.
   - **Il tetto di «Numero risultati» non si applica alle ricerche allargate** (`cap` in
     `renderResults`, opzioni `extended`/`mostraTutti`): altrimenti i più vicini riempivano la
     lista e l'estensione non mostrava niente di nuovo. Tetto assoluto 60.
   - **Nuovo campo «Manca un negozio? Scrivi il nome» + «➕ Aggiungi ai risultati»**
     (`#addByName`, `aggiungiPerNome`): una `textSearch` per nome con bias sulla consegna, il
     negozio entra nella lista come tutti gli altri (distanza, WhatsApp, invio ordine). Lo status
     mostra i **`types` di Google**, che spiegano perché non usciva dalla ricerca per categoria
     (tutte le nearbySearch passano `type: florist`). Se è già in lista non lo duplica: lo
     evidenzia. Costo: **una** chiamata, solo quando serve davvero. Nato dal caso «Manfredini
     Fiori Snc» (ordine #2756), che su Google è `florist` ma non usciva.
   - **Cache dei dettagli** (`PLACE_DETAILS`): `details()` non richiede due volte lo stesso
     `place_id`. Ogni `getDetails` è a pagamento e la lista si ridisegna spesso (estendi, cambio
     «Numero risultati», riordino): prima si ripagavano ogni volta gli stessi negozi.
   Verificato nel browser con Google finto: estensione che unisce (1 + 2 = 3 schede), estensione
   senza novità che non ridisegna, aggiunta per nome (entra, campo svuotato, `types` mostrati),
   doppione non riaggiunto, nome inesistente col messaggio giusto, e cache dei dettagli (4
   richieste → 2 chiamate). Console pulita.

## Cose in sospeso

- **Fornitore che Google non fa uscire** (era «La Mimosa» #2734, poi «Manfredini Fiori» #2756):
  dal 19/08 ci sono tutti e tre i rimedi previsti — paginazione fino a 60 (punto 40), estensione
  del raggio che ora **aggiunge** invece di sostituire (punto 49) e il campo **«Aggiungi negozio
  per nome»** (punto 49), che risolve il caso singolo con una chiamata e mostra i `types` di
  Google. Resta vero il limite di fondo: tutte le nearbySearch passano `type: florist`, quindi una
  scheda classificata diversamente esce solo per nome. Se capita spesso, valutare una
  nearbySearch **solo keyword senza `type`** (+1 chiamata a pagamento per keyword su OGNI ricerca).
- **Tipologia nel messaggio: da provare su un ordine vero** — il 19/08 il riconoscimento è passato
  ai **tag** del prodotto (punto 42) perché il `productType` è la categoria commerciale. Prova da
  fare in produzione, loggati: riaprire l'ordine dello screenshot (consegna 18/08, «Monet -
  Giardino a Giverny Medio-Grande») e verificare che il messaggio dica «un Bouquet … come da
  foto». Se un prodotto non ha tag utili, la strada è la tabella in ⚙️ Impostazioni
  («Fiori d'Arte = bouquet»), non toccare il `productType`: serve alle categorie del catalogo.
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
