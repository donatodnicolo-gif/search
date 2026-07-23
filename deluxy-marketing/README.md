# Deluxy Marketing

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
- `npm run import:monitoraggio -- "<file.xlsx>"` — importa il Monitoraggio (vendite, budget,
  settimane MKT 2025/2026, copy RSA). Idempotente.
- `npm run db:seed-adv` — ricarica la conoscenza dei Definitivi (campagne 00.4, landing,
  test Meta 8.x).
- `node scripts/deposita-analisi.mjs '<json>'` — deposita un'analisi senza server (usato
  dall'attività quotidiana).

## Collegamento a Google Ads

Lo script `scripts/google-ads-script.js` si incolla in Google Ads (Strumenti → Azioni
collettive → Script) e ha quattro funzioni indipendenti, da schedulare separatamente:

| Funzione | Cosa fa | Quando |
| --- | --- | --- |
| `main()` | Metriche giornaliere di campagna (spesa, clic, conversioni, valore) | Ogni giorno |
| `mainCopy()` | Keyword con QS e testi RSA con etichetta di rendimento | Ogni settimana |
| `mainAsset()` | Sitelink, callout, snippet e immagini sui tre livelli | Ogni mese |
| `mainEsegui()` | Esegue le operazioni **approvate** in /operazioni | Ogni ora |

Non serve developer token né OAuth: lo script gira dentro Google Ads. Serve solo una
chiave dell'app (`npm run chiave -- google-ads`) e che l'app sia raggiungibile da
internet. Endpoint usati: `/api/v1/ingest`, `/api/v1/ingest/copy`, `/api/v1/operazioni`.

**La scrittura passa sempre dall'approvazione**: una modifica decisa nell'app entra in
coda come "da approvare", il guardrail la valida prima (blackout 72h, ±20% budget,
freeze incidenti, mai ven-dom su traino), e solo dopo l'approvazione manuale lo script
la esegue e riferisce. All'esito parte il blackout e nascono le verifiche +24h/+72h.

## Automazione quotidiana

Un'attività programmata di Claude (08:31, `deluxy-marketing-sync-analisi-drive` in
`~\.claude\scheduled-tasks`) ogni giorno: sincronizza il Drive, individua i documenti
nuovi/modificati nelle 24h, li legge e deposita una sintesi AI come analisi (origine
`analisi-quotidiana`). Gira quando l'app desktop è aperta; se chiusa, al prossimo avvio.
In qualsiasi sessione si può comunque dire "sincronizza il drive marketing".

## API v1 (chiave obbligatoria)

| Metodo | Percorso | Cosa fa |
| --- | --- | --- |
| GET | `/api/v1/stato` | Riassunto per iniziare una sessione: azioni aperte/scadute per brand, ultime analisi, campagne vive, spesa 7 gg |
| GET/POST | `/api/v1/analisi` | Elenco / deposito di un'analisi (`titolo`, `sintesi`, `tipo`, `brand`, `esito`, `fileDrive`, `azioni[]` create in un colpo) |
| GET/POST | `/api/v1/azioni` | Elenco (filtri `aperte=1`, `scadute=1`, `brand`, `stato`) / creazione azione |
| GET/PATCH | `/api/v1/azioni/:id` | Scheda con storia / aggiornamento (il cambio `stato` finisce nella storia) |
| POST | `/api/v1/azioni/:id/eventi` | Aggiunge `feedback` o `nota` alla storia |
| GET/POST | `/api/v1/campagne` | Elenco con metriche 30 gg / registrazione campagna (upsert per `idEsterno`) |
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
- Stati campagna: `bozza` · `in_apprendimento` · `attiva` · `in_pausa` · `conclusa`

## Struttura

- `src/app` — dashboard, Analisi & audit, Azioni (board + scheda con storia/feedback), Campagne
  (metriche + grafico spesa), Documenti Drive; API in `src/app/api/v1`.
- `src/lib` — `dominio.ts` (cataloghi), `drive.ts` (indicizzazione Drive in sola lettura),
  `azioni.ts` (server action), `api-auth.ts` (chiavi API).
- `prisma/schema.prisma` — Analisi, Azione, EventoAzione (storia), Campagna, MetricaCampagna,
  DocumentoDrive, ApiKey.

L'app è nel catalogo del Hub (`deluxy-hub/src/lib/apps.ts`, id `marketing`,
`APP_URL_MARKETING`). UI secondo il Deluxy Design System v1.0.
