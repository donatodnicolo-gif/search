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
| 08/09 | **piattaforma** | 🔴 **Il deploy si porta giù l'app da solo: `DATABASE_URL` di produzione senza `connection_limit`.** Dopo il deploy `delivery-1hdlsem6c` (08/09, ~11:28) `app.deluxy.it` ha risposto **HTTP 500 su TUTTE le rotte per ~8 minuti**, anche sulle pubbliche. Log Vercel: `PrismaClientInitializationError: FATAL: (EMAXCONN) max client connections reached, limit: 200` in `PrismaService.onModuleInit`, cioè **all'avvio del modulo**, prima di qualunque rotta. ⚠️ **NON era il pooler condiviso né il database**, e la prima diagnosi (mia) diceva il contrario: misurato via connessione di sessione, sul Postgres c'erano **28 connessioni in tutto** (Supavisor 16 idle, PostgREST 2, storage/cron/net 4) e le altre app rispondevano regolarmente nello stesso momento (**Orders 401 in 247 ms**, CRM/FINANCE/Anagrafiche 307). Erano i **client attaccati a Supavisor dalla sola piattaforma** a sfondare il tetto di 200. Causa: il `DATABASE_URL` di produzione **non ha `connection_limit`**, quindi ogni istanza lambda apre il pool di default (`num_cpu*2+1`, 3-5 connessioni); un deploy invalida tutte le funzioni calde e le nuove istanze aprono pool nuovi mentre le vecchie sono ancora attaccate — valanga che si autoalimenta. Riassorbito da solo: da 1 richiesta buona su 5 a **12 su 12** dopo ~9 minuti. **Rimedio candidato: `connection_limit=1` (o 2) nel `DATABASE_URL` di produzione** — configurazione canonica per il serverless, non tocca né schema né dati; da concordare perché cambia una variabile d'ambiente. Da valutare anche un `pool_timeout` esplicito. ➕ **AGGIORNAMENTO delle 12:15, dopo la prima stesura: IL GUASTO È RICORRENTE, NON legato al solo deploy.** Riassorbito una prima volta (da 1 richiesta buona su 5 a **12/12**), è **tornato ~15 minuti dopo senza alcun deploy nel frattempo** (3/3 HTTP 500), e poi rientrato di nuovo (3/3 HTTP 401). Quindi l'effetto valanga della pubblicazione **non basta a spiegarlo**: qualcosa esaurisce i client del pooler anche a regime. Nella stessa finestra il database era tranquillo (**16 connessioni**) e le altre app rispondevano. ➕ **AGGIORNAMENTO del custode (08/09, sessione «Raccolta feedback prestazioni app»): la causa è probabilmente un BUG NOTO DI SUPAVISOR, non nostra.** Discussione Supabase #40671: stesso stack (Next/Vercel Fluid + Supavisor transaction 6543 + Pro), client del pooler oltre 200 con `pg_stat_activity` fermo a ~11-13 backend, crescita anche a traffico calante, ripristino solo col riavvio del pooler. Causa individuata dal team pooler: `ClientHandler` che sopravvivono a errori TLS fatali e **non rilasciano lo slot**; fix `supavisor#783`, in rollout per regione. ✅ Combacia con le mie misure (16-28 backend durante i blocchi) e soprattutto col **ritorno del guasto senza deploy**. ❌ **CORREGGO LA MIA PROPOSTA**: «mettere `connection_limit=1`» era ragionata sul modello lambda classico ed è **sbagliata su Fluid Compute**, dove le invocazioni concorrenti condividono istanza e pool — Vercel documenta che abbassare il pool «non riduce le connessioni totali e danneggia la concorrenza». Non applicarla. ✅ **Resta valida e in cima**: verificare **porta** (6543 transaction vs 5432 session) e **`pgbouncer=true`** sul `DATABASE_URL` di produzione. 🔴 **QUESTIONE APERTA, IN CARICO AL CUSTODE — nessuno la chiuda in autonomia.** ⚠️ **Quello che manca per decidere, e che io NON ho potuto misurare**: il valore vero del `DATABASE_URL` di produzione del progetto Vercel `delivery`. `vercel pull` lo restituisce come `[SENSITIVE]`, quindi la frase «non ha connection_limit» era una **deduzione mia, non una misura** (corretta come tale). Serve leggerlo dalla dashboard e rispondere a due domande: **(1)** porta `6543` (transaction) o `5432` (session)? **(2)** ci sono `pgbouncer=true` e `connection_limit`? In session mode ogni client tiene una connessione dedicata finché vive: con le lambda il tetto di 200 si raggiunge in fretta, e spiegherebbe sia la ricorrenza sia perché tocca solo questa app. Riferimento buono nell'ecosistema: **Tasks** usa `6543` + `pgbouncer=true&connection_limit=5`. ⚠️ **Da non fare alla cieca**: riscrivere quella variabile senza il valore corretto spegne l'app del tutto. 📄 Report completo (sintomi, misure, cause accertate e sospette, dipendenze) consegnato l'08/09 alla sessione custode «Raccolta feedback prestazioni app». | sessione piattaforma 08/09 |
| 07/09 | **AI Mail** | 🔴 **La query più costosa dell'INTERO cluster condiviso è la pulizia HTML di AI Mail, e non ha più niente da pulire.** `pulisciHtmlVecchio()` (`src/lib/htmlServer.ts:147`) chiamata a ogni giro del cron `*/5 * * * *` (`src/app/api/sync/route.ts:95`). Misure da `pg_stat_statements` (07/09, lette due volte): **5.493 chiamate, 15.266.107 ms totali (4 h 14 min di CPU del database), media 2.779 ms, massimo 76.151 ms, righe rese in tutto 405**. EXPLAIN ANALYZE: Index Scan su `Messaggio_pkey` con **44.514 righe scartate dal filtro**, 15.465 buffer (≈121 MB) per chiamata, 3.355 ms a freddo / 64 / 34 ms a caldo. `SELECT count(*)` con lo stesso `where`: **1 riga rimasta**. Cioè ~1,4 GB/ora di churn su `shared_buffers` da 224 MB condivisi fra 14 app, per non fare niente. Rimedio candidato: **uscita anticipata a costo zero** (segnalino «pulizia finita» o condizione indicizzata), NON un indice nuovo sul cluster condiviso. ✅ **APPLICATO e PUBBLICATO il 07/09 alle 11:41** (`deluxy-mail-26vp0zskh`): giro a vuoto → dorme 24 h, segnalino `html.pulizia.dormi_fino_a` in `Impostazione` letto per chiave primaria. **PRIMA: 5.497 chiamate / 15.278.552 ms alle 11:43, +288 chiamate al giorno. DOPO: alle 11:55 le chiamate sono 5.498** — l'ultima è quella delle 11:45:44 che ha scritto il segnalino (risveglio 08/09 11:45); i due giri di cron successivi non hanno fatto **nessuna query**. Da 288 giri al giorno a 1. Conferma sulle 24 h da riprendere l'08/09. | sessione AI Mail 07/09 + `performance-ostile` |
| 07/09 | **AI Mail** | **Aprire l'app e ricaricare la pagina scatenano uno scarico di posta.** `SyncButton.tsx:135-141` chiama `drena()` al montaggio e a ogni `visibilitychange`/`focus` (`:161-164`); `drena()` è un ciclo **fino a 50 giri** di `POST /api/leggi-posta` (`:109`). Il budget di ogni giro è **per casella, non per richiesta**: `sincronizzaUtente` cicla sulle caselle attive (l'utente ne ha 4) con `BUDGET_MS` 7.000 (in arrivo) + 6.000 (inviata) → **4 × 13 s = 52 s nominali contro `maxDuration = 60`**, e il budget si controlla DOPO il blocco, quindi si sfora sempre di un blocco. Dentro il ciclo di salvataggio girano anche le chiamate AI col client `timeout: 45_000, maxRetries: 2` (`src/lib/ai.ts:32` → fino a 135 s per una chiamata sola) e l'IMAP è costruito **senza** `greetingTimeout`/`socketTimeout` (`src/lib/imap.ts:145`). In produzione il 07/09, 09:01-09:02 UTC: **tre `Vercel Runtime Timeout Error: Task timed out after 60 seconds`** su `POST /` e `POST /api/leggi-posta`. Sintomo riferito dall'utente: «l'apertura dell'applicazione e il refresh della pagina sono lentissimi». Da misurare prima di toccare: tempo per fase (connessione IMAP, fetch, salvataggio, AI) e in quale fase muore il giro. | sessione AI Mail 07/09 + `performance-ostile` |
| 07/09 | **AI Mail** | **Indice morto su un cluster condiviso**: `Messaggio_utenteId_direzione_cestinato_archiviato_data_idx` ha `idx_scan = 0` e pesa 4.928 kB — è il duplicato esatto (stesse 5 colonne, stesso ordine) di `Messaggio_posta_idx`, che invece è usato. Si paga su ogni INSERT e non serve a nessuna lettura. Rimedio: `DROP INDEX CONCURRENTLY`, da concordare (schema condiviso, regola 5). Minore: la finestra `take: 800` dell'elenco produce 574 conversazioni di cui se ne mostrano 300 (`ListaPosta.tsx:296`) — ~44 ms e ~350 KB buttati per pagina: grasso vero ma piccolo, si tocca DOPO gli altri due. | sessione AI Mail 07/09 + `performance-ostile` |
| 07/09 | varie (cluster) | **Da misurare nel tempo, non da fotografare**: `max_connections = 60` sul cluster condiviso; in una lettura del 07/09 alle 11:20 c'erano 13 connessioni «idle in transaction», 5 delle quali dallo schema `messaging` ferme da oltre 500 s; venti minuti dopo, campionando 70 secondi, erano **zero**. Serve un campionamento continuo prima di chiamarlo un problema. Per tempo totale `messaging` è ultimo (2,39 M ms) contro platform 28,99 M, orders 28,75 M, mail 25,53 M. | sessione AI Mail 07/09 + `performance-ostile` |
| 28/08 | piattaforma · CS · Scout · Mail | **Proposte di SCHEMA sul Postgres condiviso** (Libro, Appendice B): indice `trackingToken`+`updatedAt` su Delivery; unique parziale `Messaggio.idEsterno`; `Ordine.dataConsegna`; `visits.client_id` unique e `ordini.richiesta_id` unique (Scout, Supabase); indici Mail. Si concordano con l'utente → EXPLAIN prima/dopo → `CREATE INDEX CONCURRENTLY` | giuria 28/08 |
| 28/08 | varie | **Confermati in coda** dopo la TOP 10 (Libro, Appendice B): Fondo cruscotto, Calendario cron, Orders bacheca groupBy, Finance summary doppio, Mail take:2000, Marketing anno cablato, search logCheck+fornitori.js, Merch delete+createMany, stipendi/fatturazione con periodo dichiarato | giuria 28/08 |
| 28/08 | varie | **Da misurare prima di toccare**: Tabella RN (Profiler), Dashboard Scout al focus, header cache piattaforma+/valets, Budgets 12 fetch, Merch collezioni, Marketing waterfall gruppi/[id], indici Messaging | giuria 28/08 |

## Decise

| Data | App | Segnalazione | Esito (misura prima → dopo) |
|---|---|---|---|
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
