# HANDOFF — Deluxy Search/Supplier (aggiornato al 24/07/2026)

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

20. **Doppia nearbySearch (keyword + solo tipo)** (24/07): la ricerca Google per categoria ora fa
   DUE nearbySearch — con keyword localizzata e solo per `type` — e unisce le liste (dedup per
   place_id già a valle). Motivo: la keyword `pasticceria` scartava schede vere — «Le Torte di
   Giada» (Brescia, type bakery) non usciva nemmeno a 0 m dalle sue coordinate (ordine
   cakedesign #1725, consegna in via Odofredo Denari 36) — mentre lasciava passare panifici
   e bar. Dettagli in AI_SPEC §12.9. C'è anche un .gitignore nuovo (`.env*`, `.vercel`).

21-bis. **Numero risultati: opzione 30 + scelta ricordata** (24/07): il select «Numero
   risultati» arriva a 30 e la scelta resta in `localStorage.limitPref` (per browser, come
   la sidebar). Caso reale: ordine cakedesign #1720 (Villa Vergano LC) — «Pasticceria
   Gelateria Nessi» (Dolzago) era la 12ª per distanza stradale: le ricerche la trovavano,
   ma il limite a 10 la tagliava. Non era colpa di keyword/tipo.

21. **Parole chiave Google personalizzabili** (24/07): in ⚙️ Impostazioni due campi nuovi
   «Parole chiave Google — Fiorai / Pasticcerie» (`config:v1.kwFioraio/kwPasticceria`,
   visibili a tutte le utenze via GET /api/config, salvabili solo dall'admin). Più keyword
   separate da virgola = una nearbySearch per ciascuna, risultati uniti; la ricerca per sola
   categoria si aggiunge sempre. Vuoti = predefinite di `KEYWORDS` per lingua (comportamento
   di prima). AI_SPEC §4.

## Cose in sospeso
- **Utenze operative**: da creare in Impostazioni (finché non esistono si entra solo col
  pass code amministratore + un'email qualsiasi). Le email degli operatori vanno anche
  aggiunte come **test user** dell'app OAuth (vedi sotto).
- **Bottone nelle altre app**: deciso il deep link, manca l'integrazione (in quale app?).

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
