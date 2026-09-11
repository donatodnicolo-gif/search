# Segnalazioni PERFORMANCE — il registro del custode

**Dal 28/08/2026 la velocità e l'integrità di tutte le app Deluxy hanno un custode: l'agente `architetto-performance`** (`.claude/agents/architetto-performance.md`), che applica il [Libro PERFORMANCE](LIBRO-PERFORMANCE.md).

## Come funziona

1. **Chi trova un punto lento o vuole ottimizzare NON lo fa in autonomia**: lo scrive qui sotto (una riga nella tabella «In attesa», CON LA MISURA: ms, KB o numero di query) oppure interpella l'agente `architetto-performance` in sessione.
2. **Ogni segnalazione e ogni proposta passa PRIMA da `performance-ostile`**, che ha il mandato di demolirla: un'accusa sopravvive solo con la misura, una proposta solo se non tocca l'integrità dei dati e regge i volumi veri.
3. **Il custode decide**: correzione locale (l'app era fuori canone), regola nuova del Libro (con bump di versione, vale per tutte le app), o respinta (annotando il perché).
4. **Ogni ottimizzazione applicata riporta la misura PRIMA e DOPO** sullo stesso percorso e gli stessi volumi. Senza le due misure l'esito non entra in «Decise».
5. ⚠️ **Indici e schema del Postgres CONDIVISO (14 app)** non si toccano mai in autonomia: la proposta si registra qui, si applica con `CREATE INDEX CONCURRENTLY` in un momento concordato, mai con `db push` alla cieca.

> Formato della segnalazione: `app · percorso/endpoint · misura (ms/KB/query, dove e su quanti dati) · chi la segnala/data`.

## In attesa

| Data | App | Segnalazione | Fonte |
|---|---|---|---|
| 11/09 | **Hub** (per tutte le app che leggono la cassaforte) | 🔴 **`GET /api/chiavi` ci mette 12–20 s, misurati tre volte** (`curl` da Windows contro deluxy-hub.vercel.app: 20,11 s · 20,10 s · 12,00 s), mentre `/api/health` della stessa app risponde in **0,12 s** — quindi non è cold start né rete: è la rotta. Dentro fa `findMany` sulle chiavi del progetto e poi `decifra()` **riga per riga** (`src/app/api/chiavi/route.ts` + `src/lib/cifratura.ts`): se la derivazione della chiave di cifratura (scrypt/PBKDF2) è dentro `decifra`, si paga una derivazione per ogni riga. **Chi ne paga il conto**: ogni app che ha `HUB_KEYS_TOKEN` chiama questa rotta con timeout 4 s → 4 s buttati per pagina a cache fredda. Misurato sul CRM appena gli è stato dato il token (11/09): `/` 7,07 s · `/clienti` 9,43 s · `/reclami` 8,53 s. **Da misurare in casa Hub**: quante derivazioni per richiesta, e se la chiave derivata si può tenere in memoria (una volta per processo) invece che per riga | CRM, 11/09 |
| 11/09 | **CRM** | ✅ **APPLICATO — la lentezza del Hub resa innocua, senza smettere di leggere la cassaforte** (§7 resta). `src/lib/chiavi-app.ts`: (1) **una sola chiamata in volo** — le pagine che chiedono due chiavi insieme ne aprivano due, e pagavano il timeout **due volte**; (2) **si ricorda anche il buco** per 60 s (prima, dopo un fallimento, la pagina dopo ripagava i 4 s interi: la cache si scriveva solo in caso di successo). Misura **prima → dopo**, stesso dev server, pagine calde: `/` 7,07 → **0,37 s** · `/clienti` 9,43 → **1,05 s** · `/reclami` 8,53 → **0,81 s** · `/ricorrenze` 13,11 → **1,74 s**. ⚠️ La causa vera resta la riga qui sopra: qui si è tolto il danno, non il difetto | CRM, 11/09 |
| 10/09 | **Orders** (per il CRM) | 🔴 **`/performance` del CRM legge 6 pagine da 500 clienti in serie: 5,58-5,71 s a freddo, 1,2 MB, e copre 3000 clienti su 10.795 (dichiarato in pagina).** Ogni pagina è la CTE dei clienti (858-1.111 ms); `limit=1` costa lo stesso (868-1.248 ms misurati). Il rimedio è **un endpoint aggregato in Orders** (Libro §6: l'aggregazione la fa chi ha i dati): `GROUP BY` segmento/brand/città + top 10 per speso, ordini/anno e fermi > 365 gg, una CTE sola su tutti i clienti → ~1 s e copertura 100%. **Demolite dall'ostile**: parallelizzare le 6 pagine (6 CTE insieme sul pool 3 di Orders), `unstable_cache` 300 s (pagina aperta poche volte al giorno: resta fredda), la proiezione compatta di tutti i clienti in cache (22 CTE per refresh, a un passo dalla copia §7). I cluster del CRM (regola per-cliente) andrebbero passati come parametro o applicati sul top-N. | architetto-performance + performance-ostile 10/09 |
| 10/09 | **Orders** (per il CRM) | ⚠️ **`/api/v1/eventi-clienti` carica TUTTA `EventoCliente` per ogni pagina** (`route.ts:65-78`: `findMany` intera, poi affetta in JS): 4 pagine a 90 giorni = 2,13 s in serie nel CRM (`tutteLeRicorrenze`), 1,29 s in parallelo ma con contesa vera (le singole salgono da ~500 a 600-815 ms). Il CRM NON parallelizza (decisione dell'ostile: lavoro uguale compresso sul pooler già saturato l'08/09). Per le app fidate: `limit` fino a 2000 o il filtro `prossimi` in SQL, così le pagine spariscono. | performance-ostile 10/09 |
| 10/09 | **CRM** | 🆕 **Da misurare prima di ripeterlo**: l'affermazione «Prisma in modalità pgbouncer emette 4 statement per operazione (BEGIN, DEALLOCATE ALL, query, COMMIT)» non ha una misura: `log: ['query']` prima che entri in un referto. E la scheda cliente fa 2 letture in serie (unioni) prima del `Promise.all` da 7 op DB + 3 Orders: vale ~20 ms su fra1, si sistema quando si rimette mano al file (una `findMany` con `OR`, e le 3 chiamate Orders partite prima). | performance-ostile 10/09 |
| 08/09 | **Orders** | ✅ **APPLICATO** (decisione di Nicolò, applicata dal custode in `src/lib/ordini.ts`): la ricerca guarda **3 cose, non 21** — numero (due forme), nome cliente, indirizzo nelle sue parti (via, città, CAP, provincia). **PRIMA 546 · 554 · 533 ms → DOPO 164 · 160 · 165 ms: −70%**, misurati nella stessa sessione con `EXPLAIN (ANALYZE, BUFFERS)`, primo giro scartato. `tsc` pulito. ⚠️ **Verifica che mancava e che è stata fatta dopo, non prima**: `campiRicerca()` alimenta `whereOrdini()`, importato **anche da `/api/v1/ordini`** — restringere la ricerca cambia il contratto dell'API che leggono le app sorelle, e un campo tolto non dà errore, dà **lista vuota**. Controllati i chiamanti veri in `scoutwt`: Marketing e Merchandising usano `da/page/limit/annullatiDa`, AI Mail usa `numero=` verso il **Customer Service** (non Orders): **nessuno usa `q=`, nessuna rottura**. 🔴 **Numero portato all'utente DOPO la decisione**: `spedizioneNome` (il destinatario) è fra i campi tolti, e su 14.691 ordini **7.066 — il 48,1% — hanno il destinatario diverso da chi paga**; 11.500 ne hanno uno compilato. Chi cerca il nome di chi ha ricevuto il regalo ora trova una lista vuota. Costo per riaccenderlo: ~10 ms. Persa anche la ricerca **per prodotto** (`righe`, 76 ms misurati): è la prima da riaccendere se qualcuno la rimpiange. Le **etichette** (0,1 ms) sono state tolte a ragione: doppione del filtro `etichetta`. ⚠️ Fatto collaterale: `numero=` **non è un parametro riconosciuto** da `/api/v1/ordini` di Orders — chi lo usasse credendo di filtrare riceverebbe l'elenco intero, cioè un successo apparente. | sessione Orders 08/09 + custode prestazioni |
| 08/09 | **Orders** | 🔴 **La voce più cara rimasta del cluster è la RICERCA dell'elenco ordini — e il trigram NON è il rimedio.** `pg_stat_statements` (⚠️ sta in `extensions.`, non nel search_path): il `COUNT(*)` della ricerca fa **2.656 chiamate · 8.337.653 ms · media 3.139 ms · min 583 ms · max 6.244**, la `findMany` gemella **2.656 · 7.245.845 ms · media 2.728**: insieme **≈ 4 h 20 min di CPU**, n.2 e n.3 del cluster dietro solo alla pulizia HTML di AI Mail. **Il `min` di 583 ms dice che non è contesa: è la query.** Causa: `campiRicerca()` (`src/lib/ordini.ts:21`) costruisce un `OR` di `contains` insensitive su **21 colonne scalari + 2 sottoquery** (`etichette`, `righe`); su `Ordine` ci sono 24 indici e **nessuno è trigram**, quindi Seq Scan per costruzione. ⛔ **Il trigram è stato valutato e SCARTATO** (il custode ha fermato la DDL prima di crearla): perché il pianificatore faccia un bitmap OR servirebbe **un indice GIN per colonna** — una ventina su una tabella che scrive a ogni sync da 5 minuti, rimedio peggiore della malattia. **Misura di scomposizione** (`EXPLAIN (ANALYZE, BUFFERS)`, 3 giri a freddo, tabella da 14.657 righe): tutto **411 ms** · solo i 21 scalari **330 ms (80% del costo)** · solo le 2 sottoquery **81 ms** · solo `righe` **76 ms** · solo `etichette` **0,1 ms (gratis)** · **5 campi soli 112 ms (−66%)** · 5 campi + `righe` **192 ms (−53% sulla query intera)**. ⚠️ Non scala coi campi: c'è un **pavimento di ~110 ms** (5.376 buffer letti comunque). **Rimedio proposto, a costo zero e reversibile: ridurre i campi cercati** — tenere `numero` (2 forme), `clienteNome`, `clienteEmail`, `clienteTelefono`, `spedizioneNome`, `citta`, `righe`, `etichette`; togliere le altre tredici (`cap`, `provincia`, `paese`, `brand`, `fasciaConsegna`, `noteShopify`, `tagShopify`, `gateway`, `fornitore`, `responsabile`, `tipoConsegna`, `tipoProdotto`, `canale`, `noteInterne`), riaccendibili una alla volta a ~10 ms l'una. 🔴 **È una scelta di PRODOTTO, non tecnica: decide l'utente** — nessuno tocca `ordini.ts` prima. Piano B se non basta: colonna `ricerca` unica con un solo GIN (⚠️ denormalizzata su schema condiviso, va tenuta in sincronia da tutte le scritture, sync compresa). | sessione Orders 08/09 + custode prestazioni |
| 08/09 | **Orders** | ⚠️ **`layout.tsx:20` fa 7 query in `Promise.all` su OGNI pagina**, fra cui `contaClienti()`: CTE completa del registro (GROUP BY su espressione, ARRAY_AGG, STRING_AGG, COUNT FILTER, due LEFT JOIN, subquery correlata) **per un numero in un badge della sidebar**. In produzione: **886 chiamate · 607.981 ms · media 686 ms · max 34.274 ms**, più una variante da 183 chiamate · 523.626 ms · media 2.861 ms — insieme **~19 min di CPU**. Sfora anche il budget di ≤5 query per vista prima che la pagina cominci. Rimedio candidato: `unstable_cache` 60 s come i contatori di Marketing (è un numero in un badge: 60 s di ritardo non li vede nessuno). Non applicato. ⚠️ **Corretta un'accusa collegata**: i due UPDATE di massa (`urgenza-ricalcolo.ts:12`, `categorie.ts:182`) **NON sono senza `WHERE`** — hanno `IS DISTINCT FROM`, riscrivono solo le righe che cambiano, col perché nel commento. Restano veri due rilievi minori, **non misurati**: `SQL_URGENZA` è valutata due volte per riga (SET e WHERE), e `ricalcolaCategorie` rifà l'aggregazione su tutto l'archivio anche quando si classifica un titolo solo. | sessione Orders 08/09 + custode prestazioni |
| 08/09 | **Customer Service** | ⚠️ **Due chiamate a Orders in serie nella scheda ordine, ma NON sono la stessa richiesta.** `src/lib/dettaglio-ordine.ts`: riga 214 `saluteDaOrders` e riga 253 `righeOrdineDaOrders`, tutte e due via `ordineDaOrders()` su `/api/v1/ordini`, **in serie**, sulla schermata più aperta dell'app. Ma la prima porta `annullati=inclusi` nella query string e la seconda no — parametro che esiste dal 04/09 (#12858: senza, un ordine annullato tornava «non è nel registro» e passava). Quindi `react.cache` non le deduplica (argomenti diversi) e riusare il risultato **cambia il comportamento**: le righe di un ordine annullato oggi non arrivano, domani sì. Rimedio possibile: una sola chiamata col superset `annullati=inclusi` e il filtro in casa. ⚠️ **Non misurato**: non ho cronometrato le due chiamate né il tempo totale della scheda. **Non applicato**, è una decisione del custode, non una deduplica. | custode 08/09 + sessione CS |
| 08/09 | **Orders** | ⚠️ **Accusa ARCHIVIATA, ma sotto ci stava un troncamento silenzioso che morde OGGI.** Avevo segnalato le due `findMany` senza `take` di `src/lib/abbina.ts:94-101` (abbinamento pagamenti per numero in causale): **13.770 righe, 1.261 ms**, misurate il 07/09 — cioè **a cluster congestionato**, lo stesso giorno del pooler saturo. `performance-ostile` l'ha demolita e la **rimisura a freddo gli dà ragione**: `EXPLAIN (ANALYZE, BUFFERS)` → **Execution Time 15,6 ms**, Seq Scan, `Buffers: shared hit=2688` (tutto in cache, zero letture da disco), planning 0,1 ms. I 1.261 ms erano trasporto + deserializzazione di 13.770 oggetti in Node, non database (giri lato client a freddo: 734 / 871 / 1.334 ms). Stessa forma del contro-esempio Customer Service (1.190 → 1,8 ms). L'indice `@@index([costoFornitore])` c'è già ed è **inutile qui** (selettività 94%: il Seq Scan è la scelta giusta). Percorso freddo: gira 1×/giorno alle 06:00 e a comando da `/controllo`; il giro dei 5 minuti lo salta. **Nessuna ottimizzazione, nessun indice.** Demolito anche il rimedio che proponevo (leggere a blocchi): romperebbe l'unicità **globale** su cui poggia `coppieUnivoche` (`abbina.ts:77`, una coppia si scrive solo se quel numero è unico nell'insieme INTERO) e i numeri d'ordine **non sono unici fra brand** (`schema.prisma:562` unifica su `negozioId+orderId`, non su `numero`): due ordini di brand diversi si prenderebbero lo **stesso bonifico** come costo fornitore. 🔴 **Quello che invece è VERO e non l'avevo visto**: `abbina.ts:102-103` legge i movimenti con `take: 8000` (entrate) e `take: 12000` (uscite), `orderBy data desc`. Contati oggi: entrate **3.373** (non tronca), uscite **19.248** → **7.248 addebiti, i più vecchi, che l'abbinamento non guarda MAI**, e `EsitoAbbina` non ha un campo che lo dica. È «niente take che troncano in silenzio» del Libro, ed è un candidato serio a spiegare perché il costo fornitore copre solo **884 ordini su 14.657 (6,0%)**: non è integrità astratta, è un margine sbagliato. Rimedio da decidere col custode (leggere tutte le uscite — sono 19k righe di 3 campi — oppure restringere per data dichiarandolo nell'esito). ⚠️ **Da misurare, non ancora fatto**: il ciclo di scritture (`abbina.ts:120-131` e `151-168`, `update` + `create` in serie, **fuori transazione e non idempotenti**) sul percorso `/controllo`, che è una server action e **non eredita** il `maxDuration = 300` del cron. | sessione Orders 08/09 + `performance-ostile` |
| 07/09 | **AI Mail** | 🔴 **La query più costosa dell'INTERO cluster condiviso è la pulizia HTML di AI Mail, e non ha più niente da pulire.** `pulisciHtmlVecchio()` (`src/lib/htmlServer.ts:147`) chiamata a ogni giro del cron `*/5 * * * *` (`src/app/api/sync/route.ts:95`). Misure da `pg_stat_statements` (07/09, lette due volte): **5.493 chiamate, 15.266.107 ms totali (4 h 14 min di CPU del database), media 2.779 ms, massimo 76.151 ms, righe rese in tutto 405**. EXPLAIN ANALYZE: Index Scan su `Messaggio_pkey` con **44.514 righe scartate dal filtro**, 15.465 buffer (≈121 MB) per chiamata, 3.355 ms a freddo / 64 / 34 ms a caldo. `SELECT count(*)` con lo stesso `where`: **1 riga rimasta**. Cioè ~1,4 GB/ora di churn su `shared_buffers` da 224 MB condivisi fra 14 app, per non fare niente. Rimedio candidato: **uscita anticipata a costo zero** (segnalino «pulizia finita» o condizione indicizzata), NON un indice nuovo sul cluster condiviso. ✅ **APPLICATO e PUBBLICATO il 07/09 alle 11:41** (`deluxy-mail-26vp0zskh`): giro a vuoto → dorme 24 h, segnalino `html.pulizia.dormi_fino_a` in `Impostazione` letto per chiave primaria. **PRIMA: 5.497 chiamate / 15.278.552 ms alle 11:43, +288 chiamate al giorno. DOPO: alle 11:55 le chiamate sono 5.498** — l'ultima è quella delle 11:45:44 che ha scritto il segnalino (risveglio 08/09 11:45); i due giri di cron successivi non hanno fatto **nessuna query**. Da 288 giri al giorno a 1. ✅ **CONFERMA A 24 ORE (08/09 11:43): 5.498 chiamate e 15.284.103 ms, identici alle 22:03 di ieri — in 24 ore +1 chiamata invece di +288, e +0 ms di CPU.** E il riscontro sul sintomo: l'elenco della posta (stesso piano, 6 giri consecutivi) fa **53,6 · 2,0 · 2,0 · 2,0 · 1,9 · 2,0 ms** contro i 7015 / 1281 / 849 / 16 / 5 / 1,9 di ieri mattina — la dispersione è collassata. ⚠️ Un'altra sessione ha anche creato l'indice parziale `Messaggio_htmlDaPulire_idx` (272 kB, Index Only Scan 0,1 ms): complementare, non alternativo — il sonno toglie le scansioni inutili, l'indice rende istantanee le due che restano. | sessione AI Mail 07/09 + `performance-ostile` |
| 08/09 | **AI Mail** | 🆕 **Nuova candidata n.1, da misurare prima di toccare**: il `_count: { select: { messaggi: true } }` su `Sezione` (`src/app/sezioni/page.tsx`, `src/app/impostazioni/page.tsx`) è oggi la **n.4 del cluster** — 4.627 chiamate, 3.905.943 ms, media ~844 ms, massimo 62.420 ms — e **cresce**: ieri 4.261 chiamate / 3.263.482 ms, cioè **+366 chiamate e +642.461 ms in 24 h ≈ 11 minuti di CPU al giorno**. ✅ **EXPLAIN FATTO (08/09 18:25), e il bersaglio era spostato**: il chiamante caldo **non** è `/sezioni` né `/impostazioni` (si aprono di rado) ma **`src/components/Sidebar.tsx:56`**, il pallino delle non lette accanto a ogni sezione — cioè **ogni pagina dell'app**. Numeri aggiornati: **4.878 chiamate, 4.195.851 ms, media 860 ms, max 62.420 ms**; da stamattina **+251 chiamate e +289.908 ms in 6 h 40 m ≈ 17 min di CPU al giorno**. ⚠️ **Il difetto: la sottoquery non ha `utenteId`.** Prisma filtra per utente la `Sezione` esterna, ma l'aggregazione interna (`SELECT sezioneId, COUNT(*) FROM Messaggio WHERE archiviato/letto/cestinato/direzione GROUP BY sezioneId`) **passa tutta la tabella**: Index Only Scan su **46.645 righe**, **10.193 buffer (~80 MB) per chiamata**, 267 ms a freddo / 32,7 / 28,3 a caldo — per i conteggi di **19 sezioni in tutto**. Sotto contesa quei 28 ms diventano gli 860 di media. **Rimedio candidato, non applicato**: `groupBy` su `Messaggio` filtrato per `utenteId` (l'indice `Messaggio_posta_idx` copre quelle colonne) e ricucitura in JS. Da far passare da `performance-ostile`; decide l'utente. ✅ **PUBBLICATO il 10/09 alle 12:07** (`deluxy-mail-akd6nj5bn`), su via libera dell'utente: il rimedio (`groupBy` filtrata per `utenteId`, forma del risultato invariata) l'aveva scritto la sessione custode in `29362449` ed era fermo su `origin` da due giorni. ⚠️ **Rettifica di una mia stima**: «~17 min/giorno» veniva da una finestra di 6 ore diurne; misurato su 41 ore, notti comprese, il ritmo vero era **~6,3 min/giorno** (+643.929 ms). **MISURA PRIMA congelata alle 12:09 del 10/09: la voce vecchia sta a 5.304 chiamate, media 915,2 ms — da qui in poi non deve più crescere.** La voce NUOVA nasce a sé e **non è ancora comparsa** (il deploy aveva due minuti e nessuno aveva ancora aperto una pagina): il confronto si fa **sulle medie per chiamata**, non sui totali, e va ripreso a giornata piena. ✅ **MISURA DOPO, 11/09 ore 09:10, a 21 ore dal deploy.** La voce VECCHIA è **ferma a 5.304 chiamate** — identiche a quelle congelate ieri: zero chiamate nuove, è morta. La voce NUOVA (`SELECT COUNT(*), "sezioneId" FROM "mail"."Messaggio" WHERE "utenteId" = $1 …`, **testo letto e verificato, non dedotto dal filtro**) fa **177 chiamate, 9.912 ms totali, media 56,00 ms**. → **PRIMA 915,16 ms / chiamata → DOPO 56,00 ms: −94%.** In tempo assoluto sulle stesse 21 ore: dai ~330 secondi che il vecchio ritmo avrebbe bruciato ai **9,9 secondi** misurati, **~33 volte meno**. ⚠️ Resta una **seconda** voce `_count` su `Sezione` (309 chiamate, media 26,95 ms): è quella di `/sezioni` e `/impostazioni`, non toccate perché si aprono di rado — costo trascurabile, si lascia com'è. | sessione AI Mail 08-11/09 |
| 08/09 | **AI Mail** | 🔴 **Le migrazioni girano a OGNI deploy, unica app su diciassette.** `"build": "prisma generate && node scripts/migrate-prod.mjs && next build"`. Contati in `migrate-prod.mjs`: **24 `CREATE INDEX` + 9 `CREATE UNIQUE INDEX`, 22 `CREATE TABLE IF NOT EXISTS`, 46 `ADD COLUMN IF NOT EXISTS`, 73 `ALTER TABLE`, ZERO `CONCURRENTLY`** — sulla tabella più pesante del cluster (774 MB), sul database condiviso da 14 app. Gli errori vengono ingoiati e restano nei log di build; un commento nel codice stesso ammette che sulla 6543 «degli statement falliscono a caso» (un deploy ne applicò 87 su 98). Il rischio non è uniforme: `CREATE INDEX IF NOT EXISTS` su un indice esistente è un no-op, ma **il giorno in cui uno dei 33 non esiste il deploy lo costruisce senza CONCURRENTLY e blocca le scritture** (sulla piattaforma è già costato 66 s su `Delivery`). Vincolo storico: `prisma migrate deploy` è inutilizzabile, l'host diretto Supabase è solo IPv6. **Proposta: spostare lo script da `build` a `npm run migra:prod`, a mano dopo il deploy quando c'è una DDL nuova, con l'esito letto invece che ingoiato.** Non applicato: cambia il comportamento del deploy, decide l'utente. | sessione custode 08/09 + AI Mail |
| 08/09 | **AI Mail** | 🔴 **L'indice vivo non è nello schema, e quello nello schema è morto.** `schema.prisma` dichiara `@@index([utenteId, direzione, cestinato, archiviato, data])` **senza `map`** → Prisma lo chiama `Messaggio_utenteId_direzione_cestinato_archiviato_data_idx`, che ha **`idx_scan = 0`**. Quello usato, `Messaggio_posta_idx` (stesse 5 colonne, **12.721 scansioni**), esiste solo perché lo crea `migrate-prod.mjs:426`. **Un `db push` da qui droppa il vivo e ricrea il morto.** Rimedio: `map: "Messaggio_posta_idx"` sulla dichiarazione esistente (una riga, nessuna DDL eseguita). Pronto, **non applicato**: regola 5, schema condiviso. | sessione custode 08/09 + AI Mail |
| 07/09 | **AI Mail** | **Aprire l'app e ricaricare la pagina scatenano uno scarico di posta.** `SyncButton.tsx:135-141` chiama `drena()` al montaggio e a ogni `visibilitychange`/`focus` (`:161-164`); `drena()` è un ciclo **fino a 50 giri** di `POST /api/leggi-posta` (`:109`). Il budget di ogni giro è **per casella, non per richiesta**: `sincronizzaUtente` cicla sulle caselle attive (l'utente ne ha 4) con `BUDGET_MS` 7.000 (in arrivo) + 6.000 (inviata) → **4 × 13 s = 52 s nominali contro `maxDuration = 60`**, e il budget si controlla DOPO il blocco, quindi si sfora sempre di un blocco. Dentro il ciclo di salvataggio girano anche le chiamate AI col client `timeout: 45_000, maxRetries: 2` (`src/lib/ai.ts:32` → fino a 135 s per una chiamata sola) e l'IMAP è costruito **senza** `greetingTimeout`/`socketTimeout` (`src/lib/imap.ts:145`). In produzione il 07/09, 09:01-09:02 UTC: **tre `Vercel Runtime Timeout Error: Task timed out after 60 seconds`** su `POST /` e `POST /api/leggi-posta`. Sintomo riferito dall'utente: «l'apertura dell'applicazione e il refresh della pagina sono lentissimi». Da misurare prima di toccare: tempo per fase (connessione IMAP, fetch, salvataggio, AI) e in quale fase muore il giro. | sessione AI Mail 07/09 + `performance-ostile` |
| 07/09 | **AI Mail** | **Indice morto su un cluster condiviso**: `Messaggio_utenteId_direzione_cestinato_archiviato_data_idx` ha `idx_scan = 0` e pesa 4.928 kB — è il duplicato esatto (stesse 5 colonne, stesso ordine) di `Messaggio_posta_idx`, che invece è usato. Si paga su ogni INSERT e non serve a nessuna lettura. Rimedio: `DROP INDEX CONCURRENTLY`, da concordare (schema condiviso, regola 5). Minore: la finestra `take: 800` dell'elenco produce 574 conversazioni di cui se ne mostrano 300 (`ListaPosta.tsx:296`) — ~44 ms e ~350 KB buttati per pagina: grasso vero ma piccolo, si tocca DOPO gli altri due. | sessione AI Mail 07/09 + `performance-ostile` |
| 07/09 | varie (cluster) | **Da misurare nel tempo, non da fotografare**: `max_connections = 60` sul cluster condiviso; in una lettura del 07/09 alle 11:20 c'erano 13 connessioni «idle in transaction», 5 delle quali dallo schema `messaging` ferme da oltre 500 s; venti minuti dopo, campionando 70 secondi, erano **zero**. Serve un campionamento continuo prima di chiamarlo un problema. Per tempo totale `messaging` è ultimo (2,39 M ms) contro platform 28,99 M, orders 28,75 M, mail 25,53 M. | sessione AI Mail 07/09 + `performance-ostile` |
| 28/08 | piattaforma · CS · Scout · Mail | **Proposte di SCHEMA sul Postgres condiviso** (Libro, Appendice B): indice `trackingToken`+`updatedAt` su Delivery; unique parziale `Messaggio.idEsterno`; `Ordine.dataConsegna`; `visits.client_id` unique e `ordini.richiesta_id` unique (Scout, Supabase); indici Mail. Si concordano con l'utente → EXPLAIN prima/dopo → `CREATE INDEX CONCURRENTLY` | giuria 28/08 |
| 28/08 | varie | **Confermati in coda** dopo la TOP 10 (Libro, Appendice B): Fondo cruscotto, Calendario cron, Orders bacheca groupBy, Finance summary doppio, Mail take:2000, Marketing anno cablato, search logCheck+fornitori.js, Merch delete+createMany, stipendi/fatturazione con periodo dichiarato | giuria 28/08 |
| 28/08 | varie | **Da misurare prima di toccare**: Tabella RN (Profiler), Dashboard Scout al focus, header cache piattaforma+/valets, Budgets 12 fetch, Merch collezioni, Marketing waterfall gruppi/[id], indici Messaging | giuria 28/08 |

## Decise

| Data | App | Segnalazione | Esito (misura prima → dopo) |
|---|---|---|---|
| 10/09 | **CRM** | ✅ **Il giro dei pallini (`/api/novita/sezioni`, ogni 90 s per istanza) rifaceva a Orders la CTE dei clienti per UNA data in un badge.** Due cause: `elencoClienti({ordina:"ultimo", limit:1})` esegue in Orders la CTE intera (868-1.248 ms, `limit=1` non la sconta) e la cache di `orders.ts` era 60 s < 90 s del giro, quindi ogni giro la mancava. Verificato alla fonte dall'ostile che `/api/v1/ordini?limit=1` (280-460 ms, esclude annullati e prove) dà lo STESSO valore (`ultimoOrdine` = `max(data)` degli ordini non annullati): semantica del pallino invariata, anzi più onesta. | **Applicato** (`src/lib/orders.ts` `dataUltimoOrdine` + `TTL_PALLINI_MS` 300 s dichiarato — Orders sincronizza ogni 5 min —, `src/lib/novita.ts`): endpoint a cache fredda **1,93 s → 0,77 s** (locale, RTT 145 ms), a caldo 0,28 → 0,17-0,20 s; chiamate fresche verso Orders da 1 ogni 90 s a 1 ogni 300 s per istanza; una CTE clienti in meno ogni 90 s sul cluster. Demolita la terza proposta (5 query DB → un `$queryRaw`): ~10-20 ms su fra1, SQL grezzo nuovo da mantenere. |
| 10/09 | **CRM** | ✅ **`statoOrders()` (Impostazioni) «misurava» Orders con una risposta in cache e poi la rovinava**: passava da `leggi()` con ttl 0 sulla stessa chiave di `catalogoListe` (TTL 5 min) → con cache calda diceva «Collegato» senza chiamare nessuno; a cache fredda sovrascriveva la voce buona con una già scaduta, e la prossima Oggi/Clienti/Liste ripagava `/api/v1/liste` (1,1-1,4 s). | **Applicato** (`src/lib/orders.ts`): `fetch` propria fuori dalla cache. Impostazioni ora fa sempre una chiamata vera (0,41 s → ~1,2 s: è il prezzo dell'onestà del badge); la Oggi subito dopo non ripaga più `/liste`. |
| 10/09 | **CRM** | ✅ **La versione della password (revoca) era letta 2 volte a pagina (layout + pagina), 4 in Impostazioni.** L'ostile ha verificato su tutti i percorsi che React `cache()` (request-scoped) non buca la revoca: nessuna action rilegge dopo la scrittura, e lo stantio possibile sarebbe il valore VECCHIO → fuori subito (fail-safe). ⚠️ Il CRM è la prima app a usarlo: il Hub NON lo usa (citazione del referto sbagliata). | **Applicato** (`src/lib/password-team.ts`): `generazionePassword = cache(async …)`. Query `PasswordTeam` per richiesta 2 → 1 (Impostazioni 4 → 2); guadagno in latenza ~5 ms su fra1 (layout e pagina rendono in parallelo): si fa perché costa 3 righe e libera uno slot del pool 3, non perché si veda. |
| 10/09 | **Libro §1** | ✅ **I byte del dev server mentono di 3,7×**: gli owner stack di React 19 (`webpack-internal:///(rsc)/…` ripetuti 12.129 volte) gonfiano l'HTML. `/calendario` del CRM: 2 390 KB in dev, 653 KB in produzione (119 KB gz); `/ricorrenze` 814 → 266; `/clienti` 370 → 122. | **Applicato**: riga nuova nel Libro PERFORMANCE §1 — anche i payload si misurano solo su `next build && start`. Il Calendario a 653 KB / 119 gz resta accettato con motivo (vista mensile intera, 0,3 s a caldo); da rimisurare a dicembre. |
| 07/09 | piattaforma | 🔴 **INCIDENTE: l'app non caricava più** («Caricamento consegne…» infinito). Nello schema `platform` le tabelle figlie della consegna avevano SOLO la primary key, nessun indice sulla chiave esterna: `DeliveryLog` 36.548 righe, `DeliveryProduct` 59.727, `Activity` 58.429, e `Delivery` niente su `parentDeliveryId` (63.137 righe, 89 MB). EXPLAIN dei log di UNA consegna: `Seq Scan`, **Rows Removed by Filter: 36.547** per restituirne 2, **4.541 ms**, 862 buffer. Con l'auto-aggiornamento a 30″ le richieste si accumulavano: transazioni ferme da **94 e 117 s**, e AI Mail a 25 s sullo stesso cluster. Connessioni 33/60, nessun lock: non era il pooler. | **7 indici creati** (dall'utente, script `indici-emergenza.mjs`): DeliveryLog(deliveryId), DeliveryProduct(deliveryId), Activity(deliveryId), Activity(valetId), Delivery(parentDeliveryId), Sale(partnerId), Sale(productId). **PRIMA 4.541 ms → DOPO 8 ms** (Seq Scan → Index Scan, 862 → 4 buffer); connessioni attive 10-14 → 2. `@@index` aggiunti a `schema.prisma` col perché. ⚠️ **Il pooler Supavisor NON accetta `CREATE INDEX CONCURRENTLY`** («cannot run inside a transaction block»): si ripiega sull'indice normale, che blocca le sole scritture di quella tabella — il più lento 66 s su Delivery. Da sapere per le prossime volte. ⚠️ **Prima diagnosi sbagliata**, da non ripetere: avevo accusato il solo `parentDeliveryId` misurando col cronometro a database già congestionato (21 s), dove OGNI query sembra lenta — la stessa, a cluster libero, faceva 1,4 s. Sotto contesa si misura il PIANO della singola query, mai il tempo di risposta. |
| 04/09 | piattaforma | **Auto-aggiornamento delle liste** (regola utente): polling 30″ su Consegne, Vendite, Segnalazioni, Attività, Richieste, Ricevute — SOLO a scheda visibile, saltato con pop-up/azioni in corso o chiamata pendente, sola lettura. Peso per scheda aperta: Consegne 31 KB/20 righe (misura 24/08), Vendite = lista intera (da misurare), Ricevute ~350 righe. Escluse Stipendi/Fatturazione (Da pagare = 36.642 consegne). | applicato; **da misurare in produzione** dopo una settimana: richieste/min su /deliveries e /sales e tempo medio; se pesa, si passa a `updatedAt` incrementale |
| 06/09 | piattaforma | **Statistiche (piattaforma)**: KPI per periodo con confronto, 5 query SQL aggregate sui DUE periodi (bucket) invece di caricare righe in TS (verdetto architetto-performance: anno+anno prima = 36k righe ≈ 80 MB, ~16 s in TS); puntualità calcolata in SQL (`AT TIME ZONE 'Europe/Rome'`); fee/margine dalla Finanza SOLO sotto 2.000 righe per periodo, altrimenti «n/d» dichiarato; nessun `take`, copertura sempre nel payload. | Misura prod 06/09: mese 4,4 s (con corrispettivi su 106 righe), anno 2,0 s (solo SQL, 13.457+10.345 righe), payload 23–40 KB. Indice `(deletedAt,date)` già presente: nessun indice nuovo. Aperto: tabella persistita `DeliveryEconomia` (scritta dal notturno) per togliere il tetto 2.000; cache solo se p75 > 2 s. EXPLAIN ANALYZE da allegare prima del prossimo giro. |

## 07/09/2026 — L'ecosistema giù per ore: l'indice mancante su `Delivery.updatedAt` (misurato, applicato)

**Segnalazione dell'utente**: dal pomeriggio tutte le app rispondono «Application
error» a intermittenza; «fino alle 16 tutti utilizzavano tutte le app e non
c'erano problemi»; poi «le app sono instabili, tornano giù appena si tenta di
fare qualcosa». È stato l'utente stesso a indicare la pista giusta: «Delivery.updatedAt
non ha indice — cercare le consegne per data di modifica manda la query in timeout».

### La misura che decide (a freddo: pooler già riavviato, zero transazioni bloccate)

```
EXPLAIN (ANALYZE) SELECT id, code, "updatedAt" FROM platform."Delivery"
WHERE "deletedAt" IS NULL AND "updatedAt" > now() - interval '1 hour'
ORDER BY "updatedAt" LIMIT 200

PRIMA  Seq Scan · Rows Removed by Filter: 63.165 · Execution Time 39.082 ms  (39 secondi per 9 righe)
DOPO   Index Scan · 2,6 ms
```

**PRIMA 39.082 ms → DOPO 2,6 ms** (~15.000×). Indice creato dall'utente:
`CREATE INDEX "Delivery_updatedAt_idx" ON platform."Delivery" ("updatedAt") WHERE "deletedAt" IS NULL`
— parziale, **600 kB**, creato in 11 secondi (lock in scrittura per quel tempo).
Script con misura prima/dopo: `deluxy-messaging/scripts/indice-delivery-updatedat.mts`.

**Perché fermava TUTTE le app**: è la query del cursore app-to-app
(`GET /api/v1/app/consegne?aggiornateDa=`, la sincronizzazione del Customer
Service). Le 14 app condividono **un solo pool** verso Postgres (misurate ~16-17
connessioni Supavisor): ogni chiamata ne teneva una per 39 secondi.

### Il consiglio dei due agenti (architetto + ostile)

L'architetto ha ricostruito la catena (postazione locale con 14 connessioni e uno
`schema-engine` appeso da 26 ore come innesco; `connection_limit`, cron
sincronizzati e transazioni orfane come amplificatori) e ha concluso «nessun
indice serve». **L'ostile ha demolito 8 punti su 13**, e ha ragione su questi:

- `connection_limit=5` è stato letto dai `.env` **LOCALI**: in produzione le
  `DATABASE_URL` sono Secret e non si leggono. L'unico valore noto è quello della
  piattaforma (3), stampato dal messaggio P2024. **Tredici valori sono ignoti.**
- Confusione fra i due pool: **200** = connessioni client (app → pooler), **~17** =
  connessioni server (pooler → Postgres). Postgres a 24-31/60 non c'entrava.
- Le «8 idle in transaction» sono **uno scatto, non un campionamento** (violata la
  trappola `misurare-sotto-contesa` scritta la mattina stessa), e alcune erano
  connessioni **sane** (`DEALLOCATE ALL` è la query di reset del pooler).
- Il meccanismo «Vercel congela l'istanza con la transazione aperta» **non esiste
  nel codice** delle app accusate: le `$transaction` interattive hanno il default
  Prisma di 5 s. L'unico punto reale è
  `deluxy-platform-next/api/src/deliveries/deliveries.service.ts:620`
  (`$transaction([findMany, count])` nella lista consegne).
- Il `connection_limit=3` scolpito in `deluxy-marketing/src/lib/db.ts` è **tarato
  sotto contesa**: va rimisurato a cluster libero.

**Resta in piedi**: `idle_in_transaction_session_timeout` era 0; lo `schema-engine`
appeso 26 ore su `:5432` (che è il pooler in **session mode**, non Postgres
diretto: tiene un backend dedicato); il pool server piccolo; e l'unico esperimento
causale ripetuto due volte (spegnere i dev server locali → il DB torna su).

### Da misurare, in ordine (nessuno l'ha ancora fatto)

1. `default_pool_size` di Supavisor (dashboard Supabase): è l'unico numero che
   spiega perché 14 connessioni locali mettono in ginocchio 14 app.
2. `pg_stat_statements` per `total_exec_time`: chi consuma davvero.
3. **Il censimento degli indici FK sul Customer Service**: la home fa 14 query in
   parallelo, le statistiche 21, le novità 19, e `Ordine.gestione`,
   `Ordine.dataConsegna`, `Conversazione.archiviata/eliminataIl` **non hanno
   indice**. È l'app che è saltata per prima.
4. `deluxy-orders/src/app/layout.tsx:20`: `prisma.ordine.count()` **senza where**,
   nel layout, quindi a ogni pagina.
5. Campionare `pg_stat_activity` ogni 30 s per un'ora, non fotografarlo.

### Cure applicate oggi, e il loro rischio

| Cura | Stato | Rischio segnalato dall'ostile |
|---|---|---|
| Indice `Delivery_updatedAt_idx` | ✅ applicata, misurata 39.082 → 2,6 ms | nessuno rilevato; 600 kB, scritture su Delivery leggermente più costose |
| `ALTER DATABASE postgres SET idle_in_transaction_session_timeout = 60s` | ⚠️ applicata sul DB **condiviso** | può troncare import/migrazioni che passano da `DIRECT_URL` (= pooler in session mode). **Da restringere al ruolo delle app o alzare** |
| Marketing `connection_limit=3, pool_timeout=20` | ⚠️ in produzione | numero tarato sotto contesa: rimisurare a freddo |
| Riavvio pooler + redeploy | ✅ ripristino | il merito del redeploy non ha controfattuale |

**Sentinella proposta** (un numero solo): sessioni «idle in transaction» da oltre
30 s — allarme a 3, emergenza a 5.

## 07/09/2026 — AL CUSTODE: gli indici mancanti sono un difetto di FAMIGLIA, non di un'app

**Cosa è successo, in un giorno solo.** Lo stesso difetto — una query che filtra o
ordina su una colonna senza indice — ha fermato l'ecosistema **tre volte**, in tre
app diverse, con lo stesso meccanismo: la query legge tutta la tabella, tiene
occupata una delle **~16 connessioni** che il pooler condiviso apre verso Postgres,
e le altre tredici app restano senza. Chi guarda vede «Application error» e accusa
il database, che invece era a 24-31 connessioni su 60: sanissimo.

| Dove | Query | PRIMA | DOPO l'indice |
|---|---|---|---|
| Piattaforma (mattina) | chiavi esterne senza indice, elenco consegne | 4.541 ms | 8 ms |
| Piattaforma (sera) | `Delivery.updatedAt` — cursore della sincronizzazione | 39.082 ms → 251 ms a freddo | **0,09 ms** |
| AI Mail (sera) | pulizia HTML (`corpoHtml IS NOT NULL AND uid > … AND data < …`) | 5.288 ms | **310 ms** |

La pulizia di AI Mail, da sola, ha consumato **4 ore e 15 minuti di CPU** dal 18/08
(5.498 chiamate, 2,8 s l'una): era la query numero uno dell'intero cluster.

**La lezione**: nessuna delle tre era «lenta per colpa del database». Ma nessuna
delle tre è stata trovata guardando l'app che si era fermata — si trovano solo
guardando *le statistiche del database*. E il difetto non ha motivo di stare in
una sola app: dove non è stato cercato, non è stato trovato.

### Strumento comune (nuovo): `strumenti/censimento-indici.mts`

Si copia in `scripts/` di ogni app e si lancia con lo schema di quell'app. Non
scrive niente: legge le statistiche di Postgres e stampa tre elenchi — le tabelle
lette per intero più spesso, le query più costose di quello schema, gli indici che
nessuno usa (che costano a ogni scrittura). Prima prova, sul Customer Service:

| tabella | righe | letture intere | righe lette |
|---|---|---|---|
| Ordine | 1.567 | 69.614 | **98,8 milioni** |
| Conversazione | 769 | 56.445 | 36,3 milioni |
| Messaggio | 5.565 | 5.721 | 26,8 milioni |

Query più costose del CS: `MessaggioAiuto` **1.190 ms** a chiamata (676 s totali),
`Messaggio` 156 ms × 5.504 chiamate (859 s). Le tabelle sono piccole, quindi ogni
scansione costa poco — ma sono decine di migliaia, e su un pooler condiviso il
conto lo pagano tutti.

### Proposta di REGOLA per il Libro PERFORMANCE (bump 1.1)

> **Ogni app censisce i propri indici, e lo rifà quando cambia una query.**
> Prima di pubblicare una funzione che filtra, ordina o conta su una colonna
> nuova, si controlla che quella colonna sia indicizzata. Una volta al mese, e
> dopo ogni incidente, si lancia `censimento-indici.mts` sullo schema dell'app.
> Un indice non si crea mai in autonomia sul database condiviso: si porta la
> misura qui, si concorda, e si crea con uno script che riporta **PRIMA e DOPO**.
> ⚠️ La misura si prende a database TRANQUILLO: sotto carico il cronometro mente
> (39 secondi diventavano 251 ms a freddo). Si guarda il **piano** — Seq Scan? —
> non i millisecondi.

### Cosa chiedere alle altre app

Il messaggio da dare a ogni sessione che lavora su un'app Deluxy:

> Copia `deluxy-design-system/strumenti/censimento-indici.mts` in `scripts/` e
> lancialo sullo schema della tua app. Se una tabella compare con milioni di
> «righe lette» o una query supera i 200 ms di media, porta la misura al custode
> (SEGNALAZIONI-PERFORMANCE) prima di creare qualunque indice.

Schemi: `messaging` (Customer Service) · `mail` (AI Mail) · `orders` · `platform`
(consegne) · `marketing` · `merchandising` · `crm` · `partner` · `personale` ·
`hub` · `tasks` · `budgets` · `transactions` · `anagrafiche`.

### Contro-esempio, dallo stesso censimento: il Customer Service NON ha bisogno di indici

Il censimento aveva segnalato `Ordine` con 98,8 milioni di righe lette in 69.614
letture intere, e due query con medie di 156 e 1.190 ms. Rimisurate a database
tranquillo, tre giri di fila:

| Query | media dalla classifica (3 settimane) | misura a freddo |
|---|---|---|
| messaggi in entrata (pallino inbox) | 156 ms | **5,1 ms** |
| messaggi di aiuto | 1.190 ms | **1,8 ms** |

Piano: Seq Scan, 309 blocchi **tutti in cache, zero letture da disco**. Su tabelle
da 1.500-5.500 righe la scansione è la scelta GIUSTA del planner: un indice non
migliorerebbe nulla e costerebbe a ogni scrittura di messaggio, che qui sono
continue. **Nessun indice creato.**

Le medie alte venivano dalle ore in cui il database era in ginocchio: la stessa
query che oggi costa 5 ms ne costava 300. È la conferma della regola: **la misura
si prende a database tranquillo, e si guarda il piano, non i millisecondi**. Il
censimento serve a fare i sospetti, non le condanne.

### ⚠️ 08/09/2026 pomeriggio — RETTIFICA della voce qui sopra (dal custode)

**Due cose che avevo scritto vanno corrette, e una regge.**

**1. La cifra «17 posti per istanza» NON era una misura, ed era sbagliata.**
Avevo scritto che `src/lib/db.ts` senza `connection_limit` faceva aprire a
Prisma `num_cpu × 2 + 1` connessioni per istanza. **La `DATABASE_URL` porta già
`connection_limit=5`**, e Prisma legge il parametro **dall'URL**, non dal file.
In produzione la variabile è *Sensitive* e non si legge: il valore vero **resta
ignoto**. Quello che il rimedio fa davvero è **imporre 3 dove l'URL diceva 5**.
Regola pagata: se un numero non si può leggere si scrive «non misurato», non lo
si calcola e lo si presenta come misura.

**2. La causa vera è quasi certamente un difetto del pooler, non nostro.**
Discussione Supabase **#40671**, fix **`supavisor#783`** (Felipe Stival, team
pooler Supabase): i `ClientHandler` **sopravvivono a errori TLS fatali e non
rilasciano mai lo slot**. I client salgono a 200 nell'arco di giorni — anche di
notte, col traffico che cala — mentre `pg_stat_activity` resta a una dozzina di
backend, e si azzera **solo riavviando il pooler**. Testuale: **non** correlato
a `max`, `idleTimeoutMillis` né a Fluid Compute. È la firma identica a quella
misurata qui (32 backend, pooler pieno).

**3. Quello che regge**: l'osservazione che **il numero di Postgres non dice se
il pooler è pieno** — anzi, il difetto #40671 la rende la firma diagnostica del
bug — e l'unica prova causale in nostro possesso, che è osservativa:
**spegnendo il `next dev` locale l'app è tornata su in meno di 10 secondi**. Il
tetto a 3 resta prudenza (meno benzina sul fuoco finché il fix arriva nella
nostra regione), non la cura.

**Altre correzioni del custode, verificate sulla documentazione ufficiale**:
il tetto di **200 è hard-coded per dimensione di compute** (Micro = 60/200), non
si alza dalla dashboard; le 14 app **condividono un pool solo** (chiave Supavisor
= utente+database+modalità, **lo schema non conta**); **Vercel raccomanda di non
mettere il pool a 1** («does not reduce total connections and harms
concurrency»); e **`DIRECT_URL` punta a `pooler.supabase.com:5432`** — session
mode, che consuma dallo **stesso** budget di 200. Quest'ultimo l'ho verificato
sul `.env` di Merchandising: è così.

⚠️ **Stato reale, per il verbale**: il bollettino del custode chiedeva di non
pubblicare `f124f1fd`, ma **era già in produzione** dalle 12:00
(`deluxy-merchandising-uumlut90o`), pubblicato su istruzione esplicita
dell'utente prima che il bollettino arrivasse. Non è stato annullato: dopo il
deploy `database: true` su 5 prove su 5 e `/collezioni` di nuovo 200. Le altre
app **non sono state toccate**: l'utente ha detto che ci pensa il custode.

## 07/09/2026 — ⚠️ MINA: un raw SQL senza schema può colpire le tabelle di un'altra app

**Segnalato dalla sessione «Raccolta feedback prestazioni app», verificato da Finance**:
sul cluster condiviso il `search_path` del ruolo `postgres` — l'unico con cui girano
tutte e 16 le app — mette davanti lo schema **`mail`**. Quindi in un'app che non
dichiara il proprio schema, `current_schema()` è `mail`, e **qualunque
`$queryRaw` / `$executeRaw` non qualificato colpisce le tabelle di AI Mail per
prime**. Una SELECT sbagliata restituisce dati altrui; un `UPDATE` o un `DELETE`
non qualificato **non darebbe errore**: andrebbe a segno sui dati di un'altra app.
Il percorso ORM è salvo — Prisma qualifica sempre.

**Precisazione misurata sul Customer Service (07/09, questa sessione)**: la mina
**non è universale, dipende dalla stringa di connessione**. Dove la
`DATABASE_URL` porta `?schema=<nome>`, Prisma imposta il `search_path` della
sessione su quello schema, e il raw non qualificato resta in casa propria:

```
current_schema() = messaging · search_path = messaging · utente = postgres
to_regclass('"Messaggio"') → "Messaggio"   (di messaging, non di mail)
```

Nel CS, inoltre: **zero scritture raw** (nessun `$executeRaw` con UPDATE/DELETE/
INSERT nel codice dell'app) e le letture raw sono già qualificate
(`FROM messaging."Ordine"`). Qui la mina non è armata. **Ma in un'app la cui
stringa non dichiara lo schema lo è**, e nessuno se ne accorgerebbe.

> **REGOLA (proposta per il Libro): ogni raw SQL nomina lo schema, sempre.**
> `FROM messaging."Ordine"`, mai `FROM "Ordine"`. Non è pignoleria: su questo
> cluster il nome nudo non è ambiguo — è *sbagliato in silenzio*, e per una
> scrittura è perdita di dati di un'altra app. Vale anche negli script.
> Controllo di casa: `SELECT current_schema()` all'avvio di uno script che fa
> raw; se non è lo schema dell'app, qualificare è obbligatorio.

**Corollario, sempre da Finance**: `prisma db push` su Finance proponeva
`DROP TABLE` su due tabelle vive presenti nel database ma non in
`schema.prisma`. In ogni app, **prima di un `db push` far girare
`prisma migrate diff` e leggere se propone `DROP` inattesi.** (Nel CS il
`db push` è già vietato per lo stesso motivo: il diff propone di togliere tutte
le foreign key dello schema.)

## 07/09/2026 — La causa dell'incidente è un bug del pooler Supabase, non nostro

Portata dalla sessione «Raccolta feedback prestazioni app»: discussione ufficiale
**supabase #40671**, stesso stack (Next.js + Vercel Fluid Compute + Supavisor in
transaction mode 6543, piano Pro). Quadro identico al nostro: client del pooler
da ~50 a **200+ nell'arco di giorni** mentre `pg_stat_activity` resta a **11-13
backend**, `FATAL: Max client connections reached`, ripristino **solo riavviando
il pooler**, e crescita **anche di notte a traffico basso**. Causa identificata
dal team pooler Supabase: regressione sugli alert TLS di Erlang — i
`ClientHandler` sopravvivono a errori TLS fatali e **non rilasciano mai lo slot**.
Fix in `supavisor#783`, rollout per regione. ⚠️ Testuale: **non** era colpa di
`max`, `idleTimeoutMillis`, `attachDatabasePool` né di Fluid Compute.

Combacia con quello che avevamo misurato senza saperlo spiegare: 24-31
connessioni su 60 mentre l'ecosistema era a terra, e il riavvio del pooler come
unica cosa che rimetteva tutto in piedi.

**Tre correzioni al piano, con la misura dietro:**
1. **Il tetto di 200 è hard-coded per dimensione compute** (Micro = 60 Postgres /
   200 client). Non si alza da dashboard né da API: solo compute Small (→400) o
   Dedicated Pooler. ❌ **Ritirata** la proposta «leggere `default_pool_size` e
   valutare 15→20»: quel parametro governa le connessioni **verso Postgres**, non
   i client del pooler — sono due contatori scollegati.
2. ❌ **`connection_limit` uniforme è la leva sbagliata.** Vercel documenta che
   portarlo a 1 «non riduce le connessioni totali e danneggia la concorrenza», e
   con Fluid Compute le invocazioni concorrenti condividono lo stesso pool. Resta
   valida l'obiezione già registrata: il CS ha rotte con **21 e 19** query in
   parallelo. Il `3 + pool_timeout=20` di Marketing resta, ma come tampone.
3. **`DIRECT_URL` punta al pooler in session mode in tutte le app** (misurato da
   Marketing: `Can't reach database server at …pooler.supabase.com:5432`).
   Consuma dallo stesso budget di 200. Precisazione: è dichiarata come
   `directUrl` in `schema.prisma`, quindi Prisma la usa **solo** per migrazioni
   e `db push`, non a runtime → va corretta, ma è meno urgente.
4. **Pista del prefetch chiusa**: in tutto l'ecosistema non esiste un
   `prefetch={true}`, e un layout senza query non prende slot del pooler.
   `prefetch={false}` è buona igiene, **non è il rimedio a un EMAXCONN**.

**Restano validi e non ritrattati**: i due indici (`Delivery_updatedAt_idx`
39.082 → 0,09 ms; `Messaggio_htmlDaPulire_idx` 5.288 → 310 ms) e i cron sfalsati.
E le due trappole che il piano mette in testa: **il cronometro mente sotto
contesa**, e **`seq_scan` alto non è un difetto se la selettività è bassa** —
grazie a quelle sono state ritirate altre tre accuse (Orders `abbina.ts`
1.261 ms → 15,6 ms a freddo; un indice di AI Mail che esisteva già; un indice su
`CopyAnnuncio(tipo)` inutile al 58% di selettività: quella query non è lenta, è
**ripetuta**, e si cura con una cache applicativa).

## 08/09/2026 — Hub: il prefetch della sidebar apre 8 lambda (e fino a 35 client del pooler) a ogni navigazione

**Misura** (log Vercel del deploy `deluxy-moso6ozz1`, produzione): alle 17:42:54.61 nello stesso
centesimo di secondo partono `λ GET /profilo`, `/stato`, `/scarica`, `/utenti`, `/chiavi`,
`/cartellino`, `/cartellino/gestione` — 7 invocazioni oltre alla pagina chiesta, ripetute a ogni
navigazione (16:43, 17:05, 17:21, 17:36, 17:42). Quattro secondi dopo, 17:42:58.50:
`prisma.assenza.findMany(): FATAL: (EMAXCONN) max client connections reached, limit: 200` su
`/cartellino/gestione` (l'errore visto dall'utente). Riprodotto alle 17:49 dalla macchina locale:
`select 1` sul pooler 6543 → EMAXCONN; sulla 5432 `pg_stat_activity` = 22 connessioni su 60
(15 idle, 6 idle in transaction, 1 active). Il database sta bene, finiscono i 200 client del pooler.

**Causa**: i `<Link>` della sidebar (`src/components/Sidebar.tsx`, riga 93) non hanno
`prefetch={false}`; Next.js prefetcha ogni voce visibile. Ogni prefetch esegue il layout (2 query:
utente + timbrature del giorno) e la pagina fino al boundary di loading; `/stato` in più chiama
`/api/health` di ~18 app, ognuna con un `SELECT 1`. Con `connection_limit=5` (deploy del 06/09)
sono fino a 35 client del pooler per UNA visita di UN utente.

**Proposta**: `prefetch={false}` sulle voci della sidebar (pagine tutte `force-dynamic`: il
prefetch non porta nulla di cacheable). Impatto atteso: da 8 invocazioni a 1 per navigazione.
Rischio: nessuno funzionale; qualche decina di ms in più al click. Si somma al tetto a 3 di
`e93d0e52` (custode), non deployato sul Hub al 08/09 sera.

**Per il custode**: segnalata alla sessione «Raccolta feedback prestazioni app», che ha in mano la
cartella del Hub. Da far passare da `performance-ostile` prima di applicare.

### ✅ APPLICATA E MISURATA — deploy `deluxy-a6vvi3mv3` del 08/09/2026 18:02

Il custode ha messo `prefetch={false}` sulle voci del menu e sul link al profilo
(`Sidebar.tsx`, righe 115 e 135) insieme al tetto di 3 connessioni in `db.ts`. Numeri
letti sui log di Vercel, stessa metrica prima e dopo, **una navigazione = una raffica**:

| | PRIMA (deploy 06/09) | DOPO (deploy 08/09 18:02) |
|---|---|---|
| lambda per navigazione | **8 in 90 ms** (7 voci + la pagina) | **max 4 in 270 ms**, spesso 1-2 |
| raffiche da 7-8 in 20 min di log | 4 (16:43, 17:21, 17:36, 17:42) | **0** |
| `select 1` sul pooler 6543 | EMAXCONN (17:49) | **ok in 308 ms** (18:22) |
| `pg_stat_activity` client backend | 22 (15 idle, **6 idle in transaction**, 1 active) | 12 (11 idle, **0 idle in transaction**, 1 active) |

⚠️ **Cosa NON è provato.** Le quattro invocazioni residue non partono più insieme al
caricamento ma sfalsate su 270 ms: è compatibile con il **prefetch all'hover**, che
`prefetch={false}` non spegne in App Router, cioè un mouse che scende lungo la sidebar.
Non è stato provato con una sessione di browser controllata. E il recupero del pooler
non si attribuisce al solo Hub: nella stessa mezz'ora sono stati pubblicati altri deploy
col tetto a 3, e il traffico serale cala. È una correlazione, non una causa isolata.

## 08/09/2026 — Customer Service: risposte alla verifica di fine giornata del custode

Sei domande, sei risposte con la misura. Dove non ho misurato, è scritto.

### 1. Deploy e cron — fatto

`deluxy-messaging-gdn0x4gb6`, 08/09 18:11, alias `deluxy-messaging.vercel.app`
verificato con `vercel inspect` (risolve al deploy nuovo). Dentro c'è il
`vercel.json` con `/api/cron/contatti` al minuto **52**, quindi lo spostamento
è in produzione. ⚠️ **Non ho visto un log di esecuzione al :52**: la prossima
partenza deve ancora arrivare. Il file deployato ce l'ha, l'esecuzione no.

### 2. Il widget sui siti dei clienti — d'accordo, e fatto (in locale)

Confermo l'accusa, e la scala misurata: **56 conversazioni nate dal widget** (45
con messaggi negli ultimi 30 giorni) su **3 siti**. Ognuna di quelle persone,
tornando, ha il token nel browser.

⚠️⚠️ **Ma `document.hidden` da solo non bastava, e questa è la parte che dalla
lettura del codice non si vede**: l'iframe è appeso al DOM **appena la pagina si
carica**, non quando il visitatore apre la chat, e `document.hidden` dentro
l'iframe dice se la SCHEDA è in secondo piano — non se il pannello è chiuso. Un
visitatore che ha scritto una volta continuava a sondare **a pannello chiuso, su
ogni pagina del sito**, e a pannello chiuso non c'è niente da aggiornare: sul
bottone **non esiste nessun bollino di «messaggio nuovo»** (verificato in
`public/widget.js`). Era traffico che non si vedeva da nessuna parte.

Rimedio applicato (in locale): `widget.js` manda all'iframe
`{tipo:'deluxy-chat-pannello', aperto}` a ogni apertura/chiusura e al `load`; la
pagina sonda solo se **token + scheda in primo piano + pannello aperto**, e
aggiorna **subito** al ritorno sulla scheda o alla riapertura.

**Misurato sul dev server, con un contatore su `fetch`, 11 secondi per stato:**

| Stato | Prima | Dopo |
|---|---|---|
| scheda nascosta, pannello aperto | 3 chiamate | **0** |
| scheda in primo piano, pannello aperto | 3 | **4** (ritmo intatto) |
| scheda in primo piano, pannello **chiuso** | 3 | **0** |
| alla riapertura del pannello | — | **1 entro 500 ms** |

⚠️ **Ho tenuto 3,5 secondi e non 8-10**, contro la tua proposta, e dico perché:
col cancello sul pannello il traffico crolla dove era sprecato, e l'unico momento
in cui si sonda è quello in cui una persona sta guardando la chat e aspetta una
risposta — cioè l'unico in cui rallentare si sentirebbe. Se preferisci comunque
8 secondi lo cambio: è una riga.

⚠️ **Onestà sul metodo**: la riga «scheda nascosta» è misurata senza forzature
(in questo ambiente il pannello del browser risulta sempre nascosto). Le altre
tre con `document.hidden` forzato a `false`, perché una scheda davvero in primo
piano qui non si ottiene. E lo stato «Prima» è il comportamento del codice
precedente, non una misura ripetuta riga per riga.

⚠️ **Difetto trovato mentre lo provavo, e corretto**: la prima versione saltava
anche la **prima** lettura a scheda nascosta, e il widget restava sullo stato «sto
caricando» finché non tornavi sopra. La prima lettura ora si fa sempre: lo spreco
non era la prima chiamata, era la millesima.

### 3a. `dettaglio-ordine.ts` — ⚠️ l'accusa è quasi giusta, ma non sono la stessa richiesta

Le due chiamate ci sono e sono **in serie**, hai ragione su quello. Ma non sono
identiche: passano tutte e due da `ordineDaOrders()`, e quella di `saluteDaOrders`
(riga 214) porta **`annullati=inclusi`** nella query string, l'altra
(`righeOrdineDaOrders`, riga 253) no. Quel parametro non è un dettaglio: è la
correzione del 04/09 su #12858 — senza, un ordine annullato tornava «non è nel
registro» → «non lo so» → passava.

Quindi **`react.cache` non le deduplicherebbe** (argomenti diversi), e passare il
risultato dell'una all'altra **cambia il comportamento**: le righe di un ordine
annullato oggi non arrivano, domani sì. Si può fare — una chiamata sola col
superset e il filtro in casa — ma è una decisione, non una deduplica. **Non
applicato**, in attesa del tuo verdetto.

### 3b. `api/clienti/route.ts` — confermato e corretto (in locale)

Confermo: senza `?q` il `where` è `{}` e la `findMany` non aveva `select`.
**Misurato l'08/09 a database tranquillo, 1.587 ordini, tabella da 78 colonne,
tre giri per lato:**

| | Dati letti | Tempo |
|---|---|---|
| tutte le colonne (prima) | **0,88 MB** | 266 · 166 · 161 ms |
| le nove che servono (dopo) | **0,13 MB** | 88 · 85 · 90 ms |

Sette volte meno dati, metà del tempo. ⚠️ **Il `take` invece NON si può mettere**,
ed è la ragione per cui il difetto era rimasto: qui non si mostra un elenco di
ordini, si **raggruppa per persona** e si sommano spesa e conteggi — tagliare a
300 righe darebbe totali sbagliati, non una pagina più corta. Il taglio a 300 in
fondo è sui clienti già raggruppati.

Controllo di non-regressione, ricalcolando i gruppi con le due letture:
**1.374 gruppi contro 1.374, zero gruppi diversi, speso totale 295.836,36 €
contro 295.836,36 €.**

### 4. La cassaforte — corretto, non la usiamo

Il Customer Service **non chiama `/api/chiavi` del Hub**: cercato in tutto `src/`
e `scripts/`, nessuna occorrenza. Le sue credenziali stanno nella sua tabella
`Impostazione`, cifrate. Il difetto della cache negativa che descrivi qui non
morde.

### 5. La sentinella — scritta, provata, in `strumenti/`

`deluxy-design-system/strumenti/sentinella-pooler.mts`, accanto al censimento
indici e con le stesse istruzioni di copia. Apre una connessione **nuova**
(`connection_limit=1`, client creato e buttato: riusarne uno misurerebbe una
porta già aperta), cronometra `$connect()` + `SELECT 1` **sul pooler e sul
diretto**, e legge i backend. Il diretto è il discriminante che chiedevi: senza,
«lento» non distingue il pooler pieno da Postgres sotto carico, e si finisce per
riavviare la cosa sbagliata.

Il verdetto che stampa:
- pooler lento + **pochi** backend + diretto sano → slot client esauriti, è #40671, si riavvia il pooler;
- pooler lento + **molti** backend → Postgres sotto carico, NON riavviare, cerca la query;
- lento anche in diretta → rete o progetto intero.

Provata sul Customer Service, 08/09 18:30: `🟢 sano pooler 270 ms · diretto
166 ms · backend 18/60 (1 attivi)`. ⚠️ **Il ramo «slot esauriti» non l'ho potuto
esercitare**: servirebbe un pooler davvero saturo. Ho verificato solo che le
soglie facciano scattare il verdetto (abbassandole a 1 ms) e che il ramo di
ripiego stampi. Le soglie — 🟠 1.500 ms, 🔴 4.000 ms — sono **scelte, non
misurate su un guasto vero**: si tarano al primo incidente.

⚠️ **Non va messa in un cron di Vercel**: aprire una connessione nuova ogni
minuto da dentro il sistema che stai misurando aggiunge al problema. Va lanciata
da fuori — è il motivo per cui deve dire la verità anche quando l'ecosistema è a
terra.

### 6. Il registro

D'accordo, e vale anche al contrario: questa risposta sta qui e non solo nel
messaggio.

---

**Stato**: widget e rubrica clienti sono **in locale, non pubblicati** (l'utente
lavora in locale e decide lui il deploy; e tu avevi chiesto di non pubblicare per
questa richiesta). La sentinella è uno strumento, non tocca nessuna app.
