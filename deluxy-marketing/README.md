# Deluxy Marketing

**In produzione: https://deluxy-marketing.vercel.app** (progetto Vercel `deluxy-marketing`,
Root Directory `deluxy-marketing`, Postgres condiviso Deluxy schema `marketing`).
La UI e protetta da password unica (`MARKETING_APP_PASSWORD`); le API `/api/v1` restano
aperte alle sole chiavi.

👉 **Stato del progetto, cosa manca e trappole già pagate: [docs/HANDOFF.md](docs/HANDOFF.md)**.

La **memoria operativa dell'advertising Deluxy** (porta **3130**): qui si depositano le analisi e
gli audit prodotti dalle sessioni Claude (custode "Digital Global Marketing" e progetti brand),
le **azioni** che ne derivano — con storia completa e feedback — e le **campagne** con le loro
metriche giornaliere (spesa, click, conversioni, ricavi, ROAS).

La **fonte di verità documentale resta la cartella Google Drive "ADV DELUXY SRL"** (sincronizzata
in locale da Google Drive per Desktop): l'app la **indicizza in sola lettura** (pagina Documenti
Drive) e non la scrive mai. L'app aggiunge ciò che il Drive non dà: database interrogabile,
storicità delle azioni, dashboard.

## Come si lavora (Claude Code, non Progetti)

Le analisi si lanciano con **Claude Code** (app desktop): è l'unico ambiente che ha insieme
l'accesso alla cartella locale del Drive, le skill `deluxy-adv:*` (audit Google/Meta, lancio
campagne, report settimanale, revisioni) e la possibilità di chiamare queste API. I Progetti di
Claude Desktop leggono il Drive via connettore ma non possono scrivere in locale né chiamare API:
vanno bene solo per consultare. Flusso tipo di una sessione:

1. `GET /api/v1/stato` → il riassunto (azioni aperte/scadute, ultime analisi, campagne vive).
2. La sessione lavora secondo le regole della cartella ufficiale (00. LEGGIMI) e scrive i suoi
   output su Drive come sempre.
3. A fine lavoro deposita qui la sintesi: `POST /api/v1/analisi` (con le azioni proposte),
   `PATCH /api/v1/azioni/:id` per chiudere le azioni eseguite, `POST /api/v1/campagne/:id/metriche`
   per aggiornare i numeri delle campagne.

## Deploy



Variabili gia impostate su Vercel (production, preview, development): `DATABASE_URL`,
`DIRECT_URL`, `MARKETING_APP_PASSWORD`. Da aggiungere quando disponibile:
`GOOGLE_DRIVE_API_KEY` (per la sync del Drive dal server).

Per travasare il database fra ambienti: `npm run esporta` e `npm run importa -- <file>`.

## Avvio

```bash
npm install
npm run db:push        # crea prisma/dev.db (SQLite)
npm run db:seed        # dati dimostrativi (facoltativo; origine "demo")
npm run dev            # http://localhost:3130
```

Variabili in `.env` (mai committato):

- `DATABASE_URL="file:./dev.db"` — SQLite in sviluppo; in produzione Postgres condiviso Deluxy
  (cambiare provider nello schema).
- `DRIVE_ADV_DIR` — radice locale della cartella ufficiale
  (default `G:\Il mio Drive\ADV DELUXY SRL`).

## Sezioni

- **Dashboard / Analisi / Audit / Azioni / Campagne** — il ciclo operativo: analisi depositate
  (con semaforo), azioni con storia ed eventi di feedback, campagne con metriche e ROAS.
- **Landing page** — registro delle landing con campagne associate, stati (attiva / mismatch /
  da verificare) e performance per periodo. Config canonica: Mappa 00.4 su Drive.
- **Copy & annunci** — titoli e descrizioni RSA per campagna con conteggio caratteri, keyword
  con incasso/spesa (import dal Monitoraggio). Regole di tono/claim: Definitivi 7.2/7.3.
- **Meta & test** — backlog dei test Meta pianificabili in anticipo (modello AIDA dei
  Definitivi 8.x): ipotesi, variabile, metrica di successo, guardrail, board per stato.
- **Vendite** — SALES GLOBAL: piano vendite + budget ADV mensile per sito.
- **Budget ADV** — budget mensile con ripartizione per canale/campagna (quota % e €/giorno).
- **MKT vs 2025** — spesa Google/Meta, vendite e KPI settimana per settimana con delta %
  sulla stessa settimana dell'anno precedente (totale e per brand).
- **Guardrail** — classe TRAINO con change control L0-L3 (blackout 72h, verifiche +24/+72h), alert A1-A5, break-even ROAS per brand, pacing e regole se/allora, calcolatore apprendimento.
- **Governance** — storico errori ERR-* con freeze, memoria condivisa append-only, incongruenze con verdetto, cadenze ricorrenti, occasioni con task T-21/T-14/T+7.
- **Valida copy** (/copy/valida) — lint claim/parole per brand (7.2/7.3) + Copy Score /100; scorecard landing 13 criteri nella scheda landing; rotazione creativa in /meta.
- **Documenti Drive** — indice in sola lettura della cartella ufficiale.
- **Storico** — il registro globale di tutte le modifiche (gemello dello 00.2 su Drive).

## Script

- `npm run chiave -- <nome> [--sola-lettura]` — crea una chiave API (stampata una sola volta;
  nel db resta lo SHA-256). Header: `x-api-key` o `Authorization: Bearer`.
- `npm run sync-drive` — indicizza la cartella Drive locale (equivalente al bottone
  "Sincronizza ora" della pagina Documenti Drive).
- `npm run import:ordini-orders` — importa gli ordini di **tutti i brand** dal registro
  centrale Deluxy Orders (serve `ORDERS_API_KEY` di sola lettura). È la strada buona:
  Shopify si interroga una volta sola, da Orders.
- `npm run import:pubblici-orders` — importa i pubblici (39 liste di clienti) dal
  registro centrale Orders. Nascono "da creare": esistono come segmento, non ancora
  come pubblico su Meta o Google.
- `npm run import:monitoraggio -- "<file.xlsx>"` — importa il Monitoraggio (vendite, budget,
  settimane MKT 2025/2026, copy RSA). Idempotente.
- `npm run db:seed-adv` — ricarica la conoscenza dei Definitivi (campagne 00.4, landing,
  test Meta 8.x).
- `node scripts/deposita-analisi.mjs '<json>'` — deposita un'analisi senza server (usato
  dall'attività quotidiana).

## Collegamento a Google Ads

Lo script `scripts/google-ads-script.js` si incolla in Google Ads (Strumenti → Azioni
collettive → Script), una copia per account e per lavoro. Google Ads esegue **sempre**
`main()`: il lavoro si sceglie con la costante `AZIONE` in testa al file.

| `AZIONE` | Cosa fa | Quando |
| --- | --- | --- |
| `metriche` | Metriche giornaliere di campagna (spesa, clic, conversioni, valore) | Ogni giorno, 23-24 |
| `approvazioni` | Annunci in revisione o limitati, per campagna (alert A4) | Ogni giorno, mattina |
| `copy` | Keyword con QS e testi RSA con etichetta di rendimento | Ogni settimana |
| `gruppi` | Gruppi di annunci, una riga per giorno (e gruppi di asset per le PMax) | Ogni giorno o settimana |
| `asset` | Sitelink, callout, snippet e immagini sui tre livelli | Ogni settimana |
| `diagnosi` | Termini di ricerca cercati davvero + spesa per dispositivo, giorno e rete | Ogni settimana |
| `negative` | Le keyword **escluse** di campagna e di gruppo: l'altra metà di una campagna, e l'unica conferma vera delle operazioni «negativa» | Ogni settimana |
| `esegui` | Esegue le operazioni **approvate** in /operazioni | Quando serve |

Va impostato anche `BRAND` (`flowers` | `gifts` | `cake`): senza, le campagne il cui
nome non dice il marchio finiscono in "cross".

Non serve developer token né OAuth: lo script gira dentro Google Ads. Serve solo una
chiave dell'app (`npm run chiave -- google-ads-<brand>`) e che l'app sia raggiungibile da
internet. Endpoint usati: `/api/v1/ingest`, `/api/v1/ingest/copy`, `/api/v1/ingest/diagnosi`,
`/api/v1/ingest/negative`, `/api/v1/operazioni`.

Le copie da incollare, una per lavoro, si rigenerano con
`node scripts/genera-copie-google.mjs` (finiscono in `Downloadsdeluxy-google-ads`;
`CHIAVE_API` e `BRAND` restano vuoti apposta e si rimettono a mano in Google Ads).

⚠️ Il giro `negative` chiude il censimento con una chiamata `{ completo: true }`, e la
manda **solo se ha spedito tutte le righe**. Senza quella dichiarazione l'app non si
permette di dire che una parola non è più esclusa: le righe arrivano a blocchi e un
elenco troncato, letto come completo, accuserebbe di un guasto un giro solo lento.

**La scrittura passa sempre dall'approvazione**: una modifica decisa nell'app entra in
coda come "da approvare", il guardrail la valida prima (blackout 72h, ±20% budget,
freeze incidenti, mai ven-dom su traino), e solo dopo l'approvazione manuale lo script
la esegue e riferisce. All'esito parte il blackout e nascono le verifiche +24h/+72h.


## API per le altre app Deluxy

Servono una chiave di **sola lettura** (`npm run chiave -- <nome> --sola-lettura`)
nell'header `x-api-key`.

### GET /api/v1/spesa — quanto si spende davvero in campagne

La spesa **addebitata dalle piattaforme**, non il budget pianificato. La usano
Budgets (spese ADV effettive vs budget) e Partner (costi di marketing).

| Parametro | Valori | Default |
| --- | --- | --- |
| `dal`, `al` | AAAA-MM-GG (`al` incluso) | ultimi 30 giorni |
| `brand` | flowers · cake · gifts · cross | tutti |
| `canale` | google_ads · meta_ads · tiktok | tutti |
| `raggruppa` | giorno · mese · brand · canale · campagna | nessuno |



```bash
curl -H "x-api-key: dmk_..." \n  "https://deluxy-marketing.vercel.app/api/v1/spesa?dal=2026-07-01&al=2026-07-31&raggruppa=brand"
```

**Leggere sempre `copertura` prima di usare `totale`.** Un account che non
consegna abbassa il totale senza che si veda: il blocco `copertura` dichiara chi
sta alimentando il dato (`alimentano`), chi tace (`silenziosi`), quanti giorni del
periodo hanno dati e un elenco di `avvertenze` in italiano. Se
`copertura.completa` è `false`, **la spesa reale è più alta del totale restituito**.

I campi in `dichiarati` (conversioni, ricavi) sono quelli *dichiarati dalle
piattaforme*: sovrastimano di norma. Per i ricavi veri usare `/api/v1/ordini`.

## Automazione quotidiana

Un'attività programmata di Claude (08:31, `deluxy-marketing-sync-analisi-drive` in
`~\.claude\scheduled-tasks`) ogni giorno: sincronizza il Drive, individua i documenti
nuovi/modificati nelle 24h, li legge e deposita una sintesi AI come analisi (origine
`analisi-quotidiana`). Gira quando l'app desktop è aperta; se chiusa, al prossimo avvio.
In qualsiasi sessione si può comunque dire "sincronizza il drive marketing".

Indipendentemente da quello, **la sync del Drive importa già da sé le analisi**:
ogni documento di categoria *analisi*/*audit* non ancora legato a un'`Analisi`
ne crea una (chiave `Analisi.fileDrive` = percorso del documento, che è anche
l'idempotenza). Dei `.md`/`.txt` legge le prime righe come sintesi; degli
`.xlsx` scrive che il documento non è stato letto, invece di inventare.
Restano fuori archivi e documenti marcati `SUPERATO`.

**Meta si aggiorna da sola**: `GET /api/cron/meta` gira col cron di Vercel al
minuto 7 di ogni ora (`vercel.json`), finestra di 7 giorni indietro perché Meta
consolida le conversioni nei giorni successivi. Serve `CRON_SECRET` fra le
variabili d'ambiente: senza, l'endpoint resta **chiuso** (503). Google invece
non ha bisogno di niente: sono gli Scripts a spingere i dati dentro.

## API v1 (chiave obbligatoria)

| Metodo | Percorso | Cosa fa |
| --- | --- | --- |
| GET | `/api/v1/stato` | Riassunto per iniziare una sessione: azioni aperte/scadute per brand, ultime analisi, campagne vive, spesa 7 gg |
| GET/POST | `/api/v1/analisi` | Elenco / deposito di un'analisi (`titolo`, `sintesi`, `tipo`, `brand`, `esito`, `fileDrive`, `azioni[]` create in un colpo) |
| GET/POST | `/api/v1/azioni` | Elenco (filtri `aperte=1`, `scadute=1`, `brand`, `stato`) / creazione azione |
| GET/PATCH | `/api/v1/azioni/:id` | Scheda con storia / aggiornamento (il cambio `stato` finisce nella storia) |
| POST | `/api/v1/azioni/:id/eventi` | Aggiunge `feedback` o `nota` alla storia |
| GET/POST | `/api/v1/campagne` | Elenco con metriche 30 gg / registrazione campagna (upsert per `idEsterno`). Le **defunte non escono**: `?defunte=incluse` per averle |
| GET/PATCH | `/api/v1/campagne/:id` | Scheda completa / aggiornamento |
| POST | `/api/v1/campagne/:id/metriche` | Upsert metriche giornaliere: `{ metriche: [{ data, spesa, click, conversioni, ricavi }] }` |

Esempio di deposito a fine audit:

```bash
curl -X POST http://localhost:3130/api/v1/analisi \
  -H "x-api-key: dmk_…" -H "Content-Type: application/json" \
  -d '{"titolo":"Audit Google Ads Flowers — luglio","tipo":"audit_google","brand":"flowers","esito":"attenzione","fileDrive":"ads/Audit/Audit Google Flowers 2026-07.md","sintesi":"ROAS 4.1 ma 22% di spesa fuori target…","azioni":[{"titolo":"Aggiungere esclusioni","priorita":"alta","owner":"ai","scadenza":"2026-07-30"}]}'
```

## Cataloghi (src/lib/dominio.ts)

- Brand: `flowers` · `cake` · `gifts` · `cross`
- Tipi analisi: `audit_google` · `audit_meta` · `analisi_performance` · `revisione_creativi` ·
  `revisione_landing` · `report_settimanale` · `analisi_pubblici` · `analisi` · `altro`
- Stati azione (stessa lingua dei piani su Drive): `todo` · `in_corso` · `fatta` · `superata` · `bloccata`
- Stati campagna: `bozza` · `in_lancio` · `in_apprendimento` · `attiva` · `in_pausa` ·
  `conclusa` · `defunta`
  - **`in_lancio`** = decisa e pronta, non ancora partita ma da far partire. È una cosa
    da fare: conta nei contatori delle campagne vive e genera un'azione «Far partire».
  - **`defunta`** = da non considerare mai più. Sparisce da elenchi, contatori,
    selettori, `/api/v1/stato` e `GET /api/v1/campagne` (si chiede apposta con
    `?defunte=incluse`). **La spesa che ha fatto resta nei totali**: quei soldi sono
    usciti davvero. «Mai più» vale per il lavoro operativo, non per la contabilità.

## Le vendite Shopify accanto alla spesa (scheda campagna)

Sulla scheda di ogni campagna c'è quanto ha venduto il negozio: categorie,
ordini, clienti nuovi contro di ritorno, scontrino medio, e i KPI **ROS reale**
(venduto ÷ spesa), **costo di acquisizione** (spesa ÷ clienti nuovi), **costo
per conversione** (spesa ÷ ordini).

Convivono **due legami**, e non vanno confusi:

| | Da dove | Vale come |
| --- | --- | --- |
| **Attribuzione** | l'ordine porta scritto l'UTM della campagna (`Ordine.utmCampagna`) | legame vero: **solo qui** si calcolano i KPI |
| **Contesto** | prodotto e lingua **dedotti dal nome** della campagna | dice cosa vendeva il negozio *mentre* la campagna girava — **non** che quelle vendite arrivino da lì. Nessun KPI |
| **Stima** | conversioni **dichiarate dalla piattaforma** × scontrino medio del contesto | i costi che si possono dare anche senza UTM. Sono il **pavimento**: le piattaforme contano più conversioni degli ordini veri |

La **lingua** del nome non è un'etichetta: dice *a chi* vende la campagna, e taglia
i clienti del blocco di contesto — `ita` → paese IT, `eng` → paese diverso da IT,
`fra` → FR.

> ⚠️ **Il paese sull'ordine è quello di CONSEGNA, non del cliente.** Su deluxy.it e
> cakedesign.me si consegna in Italia anche quando compra un turista o un'azienda
> estera: lì una campagna in inglese produce ordini con paese IT, e filtrare per
> «diverso da IT» li azzera tutti. Quando succede (meno di 3 ordini su almeno 10
> del prodotto) il filtro **si spegne da solo** e la pagina spiega perché: uno zero
> lì sopra si leggerebbe come «questa campagna non vende».

Gli ordini con un UTM che *somiglia* al nome ma non combacia (nomi vecchi,
campagne poi divise in ENG/ITA) **non vengono attribuiti**: si contano e si
dicono in pagina, perché non si può sapere a quale campagna di oggi appartengano.

Il legame di contesto sta in `LegameCampagnaShopify` (campagna → categoria,
lingua, negozio): si deduce dal nome e **si corregge a mano dalla scheda**. Da
quel momento `origine = manuale` e nessun giro successivo lo sovrascrive,
nemmeno se la campagna cambia nome. Se il nome non nomina un prodotto (Brand
Protection, generiche) non si deduce niente.

> Il ROS di cassa e il ROAS di Google sono due numeri diversi: lì l'incasso è
> quello che la piattaforma si attribuisce, qui è quello entrato in cassa da
> ordini con l'UTM. Quando si allontanano molto, il problema è il tracciamento.

## Trend vendite (`/trend`)

Il venduto Shopify mese per mese e **dove sta andando**: grafico con storico
(oro), mese in corso (grigio, parziale) e proiezioni (blu a righe), più il
dettaglio dei prossimi mesi uno per uno. Filtri per brand e orizzonte 3/6/12 mesi.

**Non è una retta tirata sugli ultimi mesi.** San Valentino, la Festa della mamma
e Natale *sono* l'andamento, non rumore attorno a una tendenza: spianarli darebbe
un dicembre da metà del vero. Quindi la stagione la porta l'anno prima e la
crescita i mesi già chiusi:

```
mese previsto = stesso mese dell'anno scorso × fattore
fattore = mesi CHIUSI di quest'anno ÷ stessi mesi dell'anno scorso
```

Il mese in corso non entra nel fattore (mezzo mese contro un mese intero direbbe
che stiamo crollando) ma nel totale d'anno viene contato **intero**.

Due paracadute contro i numeri inventati:

- un mese con **meno di 10 ordini** l'anno prima non fa da base: quel mese resta
  vuoto e la pagina dice perché;
- se l'anno prima non esiste abbastanza (Cake ha aperto a metà 2025: 2-7 ordini al
  mese nel primo semestre) si ripiega sulla **media dei mesi chiusi recenti,
  tenuta piatta**, dichiarando che quella previsione **non ha la stagione dentro**.

## Viste salvate

Campagne, Parole cercate, Keywords e Dashboard per brand hanno una barra di
viste salvate: filtri, ordinamento e periodo messi da parte con un nome. Sono
**condivise**, non per utente. Una per pagina può essere la predefinita
(stella): aprendo la pagina senza filtri ci si finisce dentro; `?vista=libera`
è la via d'uscita per vedere la pagina nuda.

## Struttura

- `src/app` — dashboard, Analisi & audit, Azioni (board + scheda con storia/feedback), Campagne
  (metriche + grafico spesa), Documenti Drive; API in `src/app/api/v1`.
- `src/lib` — `dominio.ts` (cataloghi), `drive.ts` (indicizzazione Drive in sola lettura),
  `azioni.ts` (server action), `api-auth.ts` (chiavi API).
- `prisma/schema.prisma` — Analisi, Azione, EventoAzione (storia), Campagna, MetricaCampagna,
  DocumentoDrive, ApiKey.

L'app è nel catalogo del Hub (`deluxy-hub/src/lib/apps.ts`, id `marketing`,
`APP_URL_MARKETING`). UI secondo il Deluxy Design System v1.0.
