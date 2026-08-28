# Il Libro PERFORMANCE Deluxy

**Versione 1.0 — 28 agosto 2026**

Il canone della **velocità e dell'integrità** di tutte le app Deluxy: query, liste, pagine, cache, scritture, migrazioni, bundle. D'ora in poi **ogni elemento nuovo di un'app — una query, un elenco, una rotta, una cache — si costruisce attingendo da qui**, e ogni punto lento si giudica con questo metro.

**Autorità.** Su una regola di velocità o integrità vince questo Libro; sul contratto dei dati vince lo **Standard Deluxy §7** (ogni dato ha una casa sola: una «ottimizzazione» che copia dati di un'altra app è una violazione, non una cache); sull'interfaccia vince il Libro UX&UI. Se un caso non è coperto: si interpella l'agente **`architetto-performance`** (`.claude/agents/architetto-performance.md`), che ricerca, decide e propone la voce nuova — mai inventare un'ottimizzazione in un'app.

**Come è nato.** 28/08/2026: ricerca sui riferimenti mondiali (Core Web Vitals/RAIL, guide Next.js 15/React 19, React Native/Expo, pratica Postgres/Prisma — EXPLAIN, indici, keyset, pooling —, il canone Stripe per l'idempotenza) + censimento del codice di TUTTE le app (3 agenti in parallelo: 10 app Next in scoutwt, 8 app in app/ + search-supplier, piattaforma Angular/Nest + Scout RN) + revisione ostile (`performance-ostile`) che ha demolito e confermato prima della promulgazione. Le prove sono le misure già pagate in casa: la lista consegne da 5,0 s a 0,62 s, la sidebar di Anagrafiche da 12 query (3.320 ms) a una (485 ms), lo Storico fatture da 3,2 MB a 370 KB.

---

## Le dieci leggi (più una)

1. **Prima si misura, poi si ottimizza; il numero prima e dopo si scrive.** Un'ottimizzazione senza ms/KB/query contate è arredamento — e chi viene dopo non può verificarla.
2. **La velocità non compra mai l'integrità.** Vietato ottimizzare togliendo una verifica, troncando dati in silenzio o copiando dati di un'altra app. Un `take` che tronca DEVE dirlo (totale a fianco): un KPI calcolato su una fetta è un numero falso, non un numero veloce.
3. **Budget di pagina**: prima riga utile ≤ 2 s in produzione (fra1) · interazione ≤ 200 ms (INP p75) · **≤ 5 query per vista** (il pooler condiviso ha `connection_limit=5`: la sesta si mette in fila) · JS client ≤ 200 KB compresso. Si sfora solo con la misura che dimostra perché, e la deroga scritta nel README dell'app.
4. **Ogni lista che può superare 50 righe è paginata dal server; ogni lista mobile è virtualizzata.** Oltre le migliaia, keyset invece di offset. «Prendi tutto e filtra in JS» è un guasto programmato sui volumi veri (62.000 consegne, 10.000 anagrafiche, la banca dal 2020).
5. **Una query nuova si prova sui volumi di produzione** (`EXPLAIN (ANALYZE, BUFFERS)`); **un indice entra solo col prima/dopo**, e sul cluster condiviso solo `CREATE INDEX CONCURRENTLY`, concordato col custode. Una query nel loop (N+1) è vietata.
6. **Ogni scrittura che può arrivare due volte è idempotente** (chiave naturale + upsert, o chiave di idempotenza registrata col suo esito — modello `Idempotenza` di Transactions); **ogni scrittura composta sta in UNA transazione**, corta e senza chiamate di rete dentro. Il denaro e i dati contati due volte sono il danno peggiore di questo Libro.
7. **Una cache dichiara TTL e invalidazione, o non esiste.** E una cache serve a MOSTRARE, mai a confrontare o decidere. Su serverless la cache in-process muore a ogni cold start: quella che deve reggere va in `unstable_cache`/KV con tag o TTL.
8. **Server-first**: il confine `"use client"` sta al livello più basso possibile; `force-dynamic` solo dove il dato deve essere fresco a ogni richiesta, col perché scritto accanto. Ogni import sotto il confine client finisce nel bundle di tutti.
9. **Un poll dichiara il suo budget e si ferma a scheda nascosta** (`document.hidden`). L'immediatezza è del canale leggero (toast); il giro pesante respira (≥60-90 s) e non fa mai scritture dentro una GET.
10. **`memo`, indici, cache e lazy si aggiungono dove il profiler o l'EXPLAIN li chiedono**, non dove il gusto li suggerisce: il collo di bottiglia vero (20 await in fila, un payload da 3 MB, 12 fetch per-mese) vale più di ogni micro-guadagno.

**La legge di metodo** (gemella dei Libri UX e Sicurezza): il fallimento di un caricamento **non può sembrare una lista vuota**, il troncamento **non può sembrare un totale**, e il rollback di una scrittura ottimistica **non può essere muto**. La performance percepita non si compra con l'ambiguità.

---

## 1. Misurare (il capitolo zero)

- **Cosa si misura**: LCP/INP/CLS al p75 sul campo (libreria `web-vitals`, build *attribution*); tempi di pagina su **build di produzione** (`next build && start` — mai su `next dev`, dove i P2024 sono falsi e i tempi pure); query contate per vista; `EXPLAIN (ANALYZE, BUFFERS)` per le query; re-render col React DevTools Profiler; bundle con l'output di `next build` e con Expo Atlas.
- **La regola del prima/dopo**: ogni ottimizzazione registra in `SEGNALAZIONI-PERFORMANCE.md` la misura prima e dopo, sullo stesso percorso e gli stessi volumi.
- Mai misurare su una scheda in background (i browser strozzano i timer) né dentro un `<details>` chiuso (i rect mentono): trappole già pagate.

## 2. Query e database

- **N+1 vietato**: mai `findMany`/`findFirst`/`update` dentro un ciclo — o `include`/`select` annidati, o batch con `IN` (ricordando che **`IN` scarta i NULL**), o `createMany`/`updateMany`. Il caso canonico in casa: la sidebar di Anagrafiche, da 12 query in `Promise.all` (1,4 s — il pooler a 5 le metteva in fila) a **una query raw con 15 sotto-select** (485 ms): `deluxy-anagrafiche/src/components/Sidebar.tsx:80` — «se ne serve un altro, aggiungi un sotto-select qui, non un `await` sotto».
- **`select` mirato**: una lista carica le colonne che mostra (la lista consegne proietta 20 colonne su 119: `DELIVERY_LIST_SELECT`). Mai collezioni figlie intere in un elenco (la lezione dei 3,2 MB dello Storico fatture).
- **Aggregare in SQL, non in JS**: somme, medie, conteggi e raggruppamenti si fanno con `aggregate`/`groupBy`/raw (`deluxy-orders/src/app/api/v1/ricavi` è il riferimento, con la motivazione scritta). Un KPI calcolato su un `take: 200` è un numero falso (legge 2).
- **Indici**: sulle colonne dei `where`/`orderBy` caldi, compositi quando il filtro è composto, parziali per i sottoinsiemi stabili. Entrano solo con l'EXPLAIN prima/dopo, e sul cluster condiviso solo `CONCURRENTLY` fuori transazione (un fallimento lascia un indice `INVALID` da ripulire). La ricerca testuale `contains` è un seq-scan: dove è un percorso caldo, la risposta è `pg_trgm` + GIN — proposta al custode, non fai-da-te.
- **Pooling**: stringa pooled (6543, `pgbouncer=true`) per il runtime, `directUrl` per le migrazioni; `connection_limit` NON si alza per «risolvere» un P2024 senza guardare chi consuma — il limite è di suite (14 app), non di app.
- **`Promise.all` sì, ma sapendo il tetto**: con pool a 5, un `Promise.all` da 19 va a ondate — sopra ~5 query parallele la risposta giusta è UNA query aggregata, non più parallelismo.

## 3. Rendering web (Next.js 15 / React 19; Angular tradotto)

- **La pagina nasce server component**; `"use client"` solo sulla foglia interattiva. Un client component da 2.700 righe è un bundle, non un componente.
- **La tabella di decisione**: dato che cambia al minuto e per utente → dinamico; catalogo/configurazione che cambia al mese → `unstable_cache`/`revalidate` con tag; pagina pubblica → statica o ISR. `force-dynamic` scritto su 134 rotte su 134 non è una scelta, è l'assenza di una scelta: dove c'è, accanto ci va il motivo.
- **fra1 dichiarato in ogni `vercel.json`** (`"regions": ["fra1"]`): una funzione in US contro un Postgres EU paga ~100 ms A QUERY. È un prerequisito, non un'ottimizzazione.
- Immagini con `next/image` (o dimensionate dal CDN): mai la foto Shopify a risoluzione piena dentro una miniatura da 34px.
- **Angular (piattaforma)**: `ChangeDetectionStrategy.OnPush` sui componenti (coi `signal()` è quasi gratis), `track` sempre (già ovunque ✓), virtual scroll dove le righe superano le centinaia.

## 4. Liste ed elenchi (il capitolo più pagato)

- Sopra 50 righe la pagina la fa il server (`skip/take` + `count` in `Promise.all`); sopra le migliaia, keyset (`where: { id: { gt: cursore } }`).
- **Il `take` che tronca lo dice**: «N di M» a fianco (`ContoRighe`), mai un 200/500/1000/2000/5000 silenzioso. **PostgREST tronca a 1000 CON UN 200**: ogni lettura Supabase che può superarle usa `.range()` paginato (`tutteLeRighe` di Scout è il riferimento).
- Niente «elenco coi figli»: le collezioni figlie si contano (`_count`) o si aggregano, non si caricano.
- La ricerca filtra sul server; l'ordinamento sul server quando la lista è paginata (ordinare in JS una pagina è ordinare la fetta sbagliata).
- **React Native**: ogni lista è virtualizzata (FlatList con `initialNumToRender`/`windowSize` tarati — il riferimento è `affiliazioni.tsx`, nato da un «è molto lento» dell'utente su 222 righe; FlashList quando si aggiorna SDK); la modalità-tabella che passa l'intero elenco come UNA riga annulla la virtualizzazione e va sanata.

## 5. Mobile (React Native / Expo)

- `keyExtractor` stabile; `getItemLayout` dove l'altezza è fissa; `React.memo` sulle righe di lista — SOLO dove il Profiler mostra il re-render.
- **Al focus non si ricarica il mondo**: un TTL breve (60 s) in un modulo condiviso evita che «torno indietro dal dettaglio» costi 10 round-trip. Il waterfall si appiattisce: le letture indipendenti stanno in un `Promise.all`.
- Hermes attivo; bundle web sorvegliato con Expo Atlas; le rotte-mammut (2.600 righe) sono le prime candidate allo split.
- Le Edge Functions chiamate a raffica dichiarano cache (`Cache-Control`/`s-maxage`) quando servono cataloghi che cambiano al mese.

## 6. Payload e cache HTTP

- Risposte `/api/v1` compresse, con `Cache-Control: private` (o `no-store` dove serve) e paginazione: una risposta di elenco sopra ~300 KB non compressi deve paginare, non crescere.
- **La cache cross-app canonica** è quella di CRM (`src/lib/orders.ts:160`) e Budgets (`RIVALIDA=60` con la motivazione scritta): TTL dichiarato, timeout esplicito, degrado leggibile. Su serverless la Map in-process è un'illusione che muore al cold start: ciò che deve reggere va in `unstable_cache` (o KV).
- Un fan-out di 12 fetch per-mese contro un endpoint che non pagina è il collo di bottiglia peggiore del parco: **l'aggregazione la fa CHI HA I DATI**, in una chiamata (Standard §7: si legge dal proprietario, e il proprietario risponde aggregato).
- Lo storico su KV non è un database relazionale: niente read-modify-write di blob interi (lost update) — liste atomiche (`LPUSH`+`LTRIM`), e mai prima della risposta.

## 7. Scritture e integrità

- **Idempotenza**: ogni rotta di scrittura raggiungibile da retry/webhook/cron ha una chiave naturale (`@@unique([sistema, idEsterno])`) + upsert, o il modello `Idempotenza` di Transactions (chiave registrata col suo esito, presa atomica). La dedup con `findFirst` poi `create` su campo non-unique NON è idempotenza: è una race.
- **Transazione unica** per la scrittura composta (crea A + aggiorna B): corta, senza chiamate di rete dentro. Supabase client non ha transazioni → la scrittura composta diventa una RPC/funzione SQL.
- I **cursori di sync** sono monotòni (sequenza globale o `updatedAt`+`id`), si salvano A OGNI pagina (non a fine giro), e il giro ha timeout, `maxDuration` e lock.
- Optimistic UI col rollback DETTO (la trappola «UI ottimistica muta» è del Libro UX: i due Libri si citano, non si duplicano).
- Mai «ottimizzare» un import cancellando o deducendo: le trappole «correzione non retroattiva» e «mai cancellare dati reali» valgono anche qui.

## 8. Migrazioni sul DB condiviso (14 app)

- **Expand-contract in 3 passi**: aggiungi (compatibile) → doppia scrittura/backfill → togli. Mai un lock lungo: ferma 14 app insieme.
- Indici: solo `CREATE INDEX CONCURRENTLY`, fuori transazione, con verifica post (`pg_index.indisvalid`); proposta registrata in `SEGNALAZIONI-PERFORMANCE.md` PRIMA di toccare il cluster.
- `db push` va bene sullo schema della PROPRIA app in sviluppo; sulle tabelle vive si va per SQL applicato a mano e documentato (è già la prassi delle migrazioni numerate di Scout).

## 9. Bundle e dipendenze

- Budget: ≤ 200 KB di JS client compresso per pagina di elenco. Il confine client in basso; `next/dynamic` per i pezzi pesanti non critici.
- Una dipendenza nuova entra solo se il suo peso è misurato e giustificato dal collo di bottiglia vero. Niente librerie per risparmiare 10 ms.
- Lo script inline monolitico (search-supplier: 207 KB dentro l'HTML) non è cacheabile separatamente: quando lo si tocca, la direzione è estrarlo in un file con hash.

## 10. Il processo

- **Il custode**: `architetto-performance`. **Il registro**: [SEGNALAZIONI-PERFORMANCE.md](SEGNALAZIONI-PERFORMANCE.md) — segnalazioni CON la misura.
- **L'ostile**: `performance-ostile` demolisce accuse e proposte prima che diventino lavoro (chi accusa porta la misura; chi propone porta il prima/dopo e non tocca l'integrità).
- Le tre vie del custode: correzione locale / regola nuova del Libro (bump di versione) / lentezza accettata col motivo scritto.
- **Integrità del codice**: typecheck + build passano prima di ogni commit; la stessa regola (economica, di calcolo, di stato) vive in UN file solo — le 5 copie della lettura importi di Scout, di cui 3 sbagliate in direzioni opposte, sono il monito permanente.

## Appendice A — Implementazioni di riferimento (dove si copia)

| Cosa | Dove |
|---|---|
| Sidebar a UNA query raw (15 sotto-select) | Anagrafiche `src/components/Sidebar.tsx:80` |
| Lista paginata con select mirato | piattaforma `deliveries.service.ts` (`DELIVERY_LIST_SELECT`) |
| API di elenco aggregata in SQL, col perché scritto | Orders `src/app/api/v1/ricavi/route.ts` |
| Cache cross-app con TTL + timeout + degrado leggibile | CRM `src/lib/orders.ts:160`; Budgets `src/lib/cache.ts` |
| Idempotenza con chiave registrata | Transactions `model Idempotenza` + `api/v1/richieste` |
| Idempotenza su chiave naturale | piattaforma `sales.module.ts:151`; Tasks `(sistema, idEsterno)` |
| Paginazione oltre il tetto PostgREST | Scout `lib/db.ts:786` (`tutteLeRighe`) |
| Lista RN virtualizzata tarata | Scout `affiliazioni.tsx` (initialNumToRender/windowSize) |
| Poll con guardia scheda nascosta | Messaging `Sidebar.tsx:496`; Libro UX §7 (notifiche) |
| `cache()` request-scoped senza leak fra utenti | Hub `src/lib/sessione-server.ts:23` |

## Appendice B — Piano di adeguamento (la classifica della giuria, 28/08/2026)

Censimento a 3 agenti su tutte le app → 34 punti → revisione ostile (`performance-ostile`, verificata sul codice vivo): **23 confermati, 4 demoliti, 7 da misurare**. Le demolizioni grosse (Finance /transazioni «tabella intera», `riepilogoTutti`, i 7 include di Personale, l'OnPush su 57 componenti) erano accuse che non avevano guardato la copia viva, i volumi veri o il rischio di regressione. Il filo conduttore dei confermati: **non i punti lenti, ma quelli che producono numeri/dati sbagliati in silenzio e le scritture non atomiche dove gira denaro.**

**Le 10 da fare subito** (guadagno × frequenza / rischio):

| # | Dove | Rimedio | Misura prima/dopo |
|---|---|---|---|
| 1 | CS `Inbox.tsx:797,804` — poll 5s/4s senza guardia scheda nascosta + UPDATE dentro GET polled | guardia `document.hidden` (come Sidebar:498) + `nonLetti:0` scritto solo al cambio conversazione | richieste/min con inbox in background, prima/dopo |
| 2 | CRM `liste-ai.ts` — l'esclusione «non-contattare» troncata a 4000 o svuotata da un errore, IN SILENZIO | per le liste di esclusione: errore BLOCCANTE se la lettura fallisce o tronca | test con chiave rotta: `ok:false`, mai lista parziale |
| 3 | Transactions `actions.ts:264,288` — distinte crea/paga fuori transazione (app di PAGAMENTI) | `$transaction` sulle due coppie (modello: `richieste.ts:447`) | errore iniettato fra le due scritture: nessun lotto orfano/incoerente |
| 4 | Scout `lib/db.ts` — letture senza `.range()`: PostgREST tronca a 1000 con un 200 | `tutteLeRighe` (già in casa, `db.ts:785`) sulle ~12 letture | `count(*)` su visits/deals/ordini vs numero in Dashboard |
| 5 | Tasks+Calendario `changes` — cursore su `revisione` non monotona: righe SALTATE in sync | cursore composito `(revisione,id)` con where di ripresa | 250 task stessa revisione, perPage 200: la 2ª pagina le rende tutte |
| 6 | piattaforma `POST /app/consegne` — nessuna idempotenza: un retry crea una consegna vera doppia | dedup su riferimento esterno (modello `sales.module.ts:151`) | doppio POST identico → una consegna sola |
| 7 | Acquisti `page.tsx:12-42` — KPI finanziari calcolati sui soli 200 recenti | KPI da `aggregate` senza take; il take resta per la lista | 250 acquisti seed: daPagare a mano vs a schermo |
| 8 | search `index.html:4151` — 60 `getDetails` in serie con reflow a ogni card (12-24 s a ricerca) | pool di 5-6 concorrenti + `DocumentFragment` (l'ordine lo rimette `applySort`) | `performance.now()` su ricerca 30-60 negozi: atteso ~3-5 s |
| 9 | Scout `syncQueue.ts:121` — passo 3 fuori try/catch: retry = visita duplicata | try/catch come il passo 4 (lo stato si riallinea al giro dopo) | fallimento iniettato: il flush NON ricrea la visita |
| 10 | Calendario/Acquisti/Fondo — funzioni senza `regions: ["fra1"]` contro Postgres EU | verifica region effettiva, poi la riga in vercel.json | `SELECT 1` cronometrato da una API route; durata del cron |

**Interventi sullo SCHEMA del Postgres condiviso — si CONCORDANO, mai d'impulso** (registro → EXPLAIN → `CONCURRENTLY`):
1. piattaforma `Delivery`: `@@index([trackingToken])` (seq scan su 62k a ogni apertura del link pubblico di tracking) e `@@index([updatedAt])` (pull incrementale).
2. Messaging `Messaggio`: unique PARZIALE su `idEsterno` (`WHERE idEsterno <> ''`) — la dedup `findFirst`+`create` di oggi è una race sulle riconsegne Meta.
3. Messaging `Ordine.dataConsegna` + `Conversazione` composito — dopo EXPLAIN.
4. Scout: `client_id` UUID unique su `visits` (chiusura piena del punto 9) e unique su `ordini.richiesta_id` (doppio click = ordine doppio, `db.ts:3062` — nel frattempo: rilettura dal DB prima dell'insert).
5. Mail: gli 8 modelli senza indici — dopo la misura delle 4 pagine.

**Confermati ma in coda** (dopo i 10): Fondo cruscotto (memo dell'archivio + `Promise.all`; app personale), Calendario cron (cursore a ogni pagina + `maxDuration` + timeout), Orders bacheca (groupBy), Finance `summary` che rilancia `corrispettivi`, Mail `take:2000` (misurare prima), Marketing anno cablato 2026/2025 (fix da 5 minuti: dal 2027 il ROS diventerebbe STANTIO, non nullo), search `logCheck` (LPUSH/LTRIM), `fornitori.js` (timeout+parallelo), Merchandising delete+createMany (diff invece di delete-all — e prima si ripara l'import fermo), stipendi/fatturazione piattaforma (periodo dichiarato, MAI un take muto sui totali).

**Da misurare prima di toccare**: Tabella RN (Profiler), Dashboard Scout al focus (4G), header cache/valets 445KB, Budgets 12 fetch (tempo pagina), Merch collezioni, Marketing waterfall, indici Messaging.
