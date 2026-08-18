# Analisi 3 di 5 — Fonti dati realmente disponibili (test sul campo)

> Ogni riga viene da una chiamata effettivamente eseguita dall'agente. Le fonti "verificate"
> sono state ricontrollate da me su `TIT.MI` e `FTSEMIB.MI` prima di scriverci sopra il codice.

## Fonti VERIFICATE

| Fonte | Cosa dà | Auth | Limiti | URL esatto | Esito test reale |
|---|---|---|---|---|---|
| **Yahoo chart v8** | OHLCV + adjclose giornaliero, storico completo | Nessuna | Nessun 429 su 12 req rapide | `https://query1.finance.yahoo.com/v8/finance/chart/TIT.MI?range=10y&interval=1d` | HTTP 200, 279 KB, **2540 barre dal 2016-08-18 al 2026-08-18**, `adjclose` presente |
| **Yahoo fundamentals-timeseries** | Ricavi, EBITDA, utile netto, FCF, debito, cassa — in EUR | Nessuna | Solo ~4 esercizi annuali | `https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/TIT.MI?symbol=TIT.MI&type=annualTotalRevenue,annualEBITDA,...` | HTTP 200, 4,6 KB |
| **Google News RSS** | Titoli+link+pubDate, query booleane in italiano | Nessuna | **100 item max**, no storico | `https://news.google.com/rss/search?q=...&hl=it&gl=IT&ceid=IT:it` | 139 KB, **100 `<item>`** reali |
| **SEC EDGAR full-text** | 13D/13G/13F, JSON strutturato | Header User-Agent con email | 10 req/s | `https://efts.sec.gov/LATEST/search-index?q=%22Telecom%20Italia%22&forms=SC%2013D` | **614 hit**, incl. CIK 0000948642 |
| **BCE Data Portal** | FX ufficiale, CSV | Nessuna | — | `https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A?format=csvdata&lastNObservations=3` | CSV: `2026-08-14,1.1567` |
| **Frankfurter** | FX su BCE, JSON, storico a range | Nessuna | **`.app` → 301 su `.dev`: serve `-L`** | `https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD,GBP` | `{"date":"2026-08-17","rates":{...}}` |

**Simbolo giusto di Telecom Italia = `TIT.MI`** (non `TLIT.MI`, che Yahoo risolve come `MUTUALFUND` su exchange fittizio "YHD", dato fermo al 2019 — trappola classica).

Fondamentali TIT.MI realmente ottenuti, gratis e senza chiave:

```
annualTotalRevenue: 2022=15.79B | 2023=14.31B | 2024=13.65B | 2025=13.73B EUR
annualEBITDA:       2022=5.51B  | 2023=4.81B  | 2024=4.83B  | 2025=4.60B EUR
annualNetIncome:    2022=-2.92B | 2023=-1.44B | 2024=-610M  | 2025=297M  EUR
annualFreeCashFlow: 2022=-1.41B | 2023=661M   | 2024=427M   | 2025=37M   EUR
annualTotalDebt:    2022=31.19B | 2023=31.55B | 2024=14.72B | 2025=13.22B EUR
```

Il salto debito 31,55B→14,72B nel 2024 è la cessione di NetCo: conferma che il dato è reale, ma anche che **le serie hanno discontinuità da operazioni straordinarie** — un confronto anno su anno cieco produrrebbe un falso segnale.

Falso positivo strutturale nelle news: "TIM" come nome proprio inquina la query (`ACV nomina Tim Fox come CFO…`). Serve filtro per dominio/ticker, non solo per parola.

## Fonti NON funzionanti / da scartare

| Fonte | Errore reale ottenuto |
|---|---|
| **Stooq CSV** | Challenge JS anti-bot su `.com` e `.pl`: `This site requires JavaScript to verify your browser`. **Inutilizzabile da cron.** |
| **Yahoo quoteSummary v10** | `{"code":"Unauthorized","description":"Invalid Crumb"}` HTTP 401 — serve cookie+crumb. Usare `fundamentals-timeseries`. |
| **Alpha Vantage** | Chiave `demo` rifiutata sui dati veri. Free tier reale = 25 req/giorno: insufficiente. |
| **Twelve Data** | HTTP 401 `apikey parameter is incorrect or not specified` |
| **Financial Modeling Prep** | `{"Error Message": "Invalid API KEY"}` |
| **EODHD** | `Forbidden` con token demo |
| **Borsa Italiana RSS** | 404 su tutti i percorsi provati. **Nessun RSS pubblico trovato.** |
| **eMarket Storage** | Drupal, **zero `<link rel=alternate type=rss>`**, `/rss` e varianti 404. Solo scraping HTML. |
| **Consob partecipazioni rilevanti** | Portale Liferay: **0 tag `<table>`, 0 link a csv/xls/xml/json**. Nessun download strutturato. |

**Risposta onesta**: *non esiste* un feed strutturato di cambi di management per l'Italia, né un download machine-readable delle partecipazioni rilevanti Consob.

## Schema dati consigliato

```sql
CREATE TABLE issuer (id, ticker_yahoo, isin, name, cik_sec, ir_url, mic);
CREATE TABLE price_daily (
  issuer_id, d DATE, open, high, low, close, adj_close, volume NUMERIC,
  source TEXT, ingested_at TIMESTAMPTZ, PRIMARY KEY (issuer_id, d));
CREATE TABLE fundamental_annual (
  issuer_id, as_of_date DATE, metric TEXT, value NUMERIC, currency TEXT,
  source TEXT, restated BOOLEAN DEFAULT FALSE, PRIMARY KEY (issuer_id, as_of_date, metric));
CREATE TABLE news_item (
  id, issuer_id, published_at TIMESTAMPTZ, title, url, publisher, source_feed,
  url_hash TEXT UNIQUE, is_regulated BOOLEAN);
CREATE TABLE governance_event (
  id, issuer_id, event_date, event_type TEXT,   -- nomina|dimissioni|revoca|cooptazione|cda
  role TEXT, person_name TEXT, direction TEXT,  -- in|out
  confidence NUMERIC, evidence_news_id, verified_by_human BOOLEAN DEFAULT FALSE);
CREATE TABLE ownership_stake (
  issuer_id, holder_name, pct_capital, pct_voting, as_of_date, source, filing_url);
CREATE TABLE signal (issuer_id, d, kind, score, inputs_json, computed_at);
CREATE TABLE source_health (source, run_at, http_status, rows, ok BOOLEAN, error);
```

`confidence` e `verified_by_human` sono obbligatori: un "nomina" estratto da un titolo di giornale non è un fatto societario finché non è confermato dal comunicato.

**Keyword per il rilevamento testuale** (IT): `nomina`, `nominato/a`, `cooptazione`, `dimissioni`, `si dimette`, `rassegna le dimissioni`, `revoca`, `subentra`, `passaggio di consegne`, `nuovo amministratore delegato`, `nuovo CEO`, `presidente del consiglio di amministrazione`, `direttore generale`, `CFO`, `lista del cda`, `assemblea degli azionisti`, `rinnovo del consiglio`. (EN): `appoints`, `steps down`, `resigns`, `succeeds`, `interim CEO`, `board reshuffle`, `co-opted`.

## Piano di aggiornamento quotidiano

| Job | Ora | Peso reale misurato | Fallback se cade |
|---|---|---|---|
| Prezzi incrementali (`range=5d`) | 19:00 CET, dopo chiusura MTA | ~8 KB/titolo → 40 titoli ≈ 320 KB | Ritenta a 21:00; se ancora KO, marca `source_health.ok=false` e **non** interpolare |
| Backfill storico | una tantum | 279 KB/titolo (10y) | — |
| Fondamentali | settimanale (lun) | 4,6 KB/titolo | Dato annuale: un buco non è urgente |
| FX BCE/Frankfurter | 17:00 CET | <1 KB | Frankfurter ↔ BCE si coprono a vicenda |
| Google News RSS | ogni 6 h | 139 KB/query | Cap 100 item: query per ticker, non aggregate |
| SEC 13D/13G | giornaliero 23:00 | JSON piccolo | `daily-index` come sorgente alternativa |
| Consob / eMarket | scraping HTML, best-effort | — | **Nessun fallback**: sorgente non affidabile, alert manuale |

Regola operativa: ogni job scrive in `source_health` **prima** di scrivere i dati. Una fonte che fallisce deve rendere il segnale `stale`, non silenziosamente vecchio — è la trappola già nota dello "stato dedotto invece che misurato": un cruscotto che mostra l'ultimo prezzo disponibile senza dire che è di tre giorni fa è peggio di uno vuoto.

Costo a regime: **0 €**, ~1,5 MB/giorno per 40 titoli. Il rischio non è il costo, è la dipendenza da Yahoo, endpoint non contrattualizzato che può chiudere come ha fatto `quoteSummary`.
