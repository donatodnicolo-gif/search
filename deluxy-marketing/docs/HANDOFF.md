# Handoff — Deluxy Marketing

> Stato al **26/07/2026**. Una finestra Claude nuova deve poter riprendere da qui
> senza altro contesto. Leggere prima il [README](../README.md) per cosa fa l'app;
> questo documento dice **dove siamo** e **cosa manca**.

## In una riga

App **live** su https://deluxy-marketing.vercel.app (password `MARKETING_APP_PASSWORD`,
al primo deploy `seta-rose-4728`). Postgres condiviso Deluxy, schema `marketing`.
Riceve già dati veri da Google Ads (Gifts e Flowers) e ha 2.426 ordini Shopify 2026.

## Cartella di lavoro e deploy

- Cartella: `C:\Users\nicol\scoutwt\deluxy-marketing` (branch **scout-ui**)
- Deploy: `npx vercel deploy --prod --yes` dalla cartella dell'app.
  Il progetto Vercel **non è collegato a GitHub**: il push non pubblica, si
  pubblica dalla CLI. (Il push su GitHub funziona: `git push origin scout-ui`.)
- Database: `npm run configura-db -- ../deluxy-hub/.env` rigenera il `.env`.
  ⚠️ Il `.env` locale punta al **Postgres di produzione**: quello che si modifica
  in sviluppo scrive sui dati veri. Non esiste ancora uno schema `marketing_dev`.

## FATTO

### Dati dentro (verificati sul database di produzione, 26/07/2026)

| Cosa | Quanti |
| --- | --- |
| Metriche giornaliere di campagna | **2.730** (19/06/2025 → 26/07/2026) |
| Ordini Shopify 2026 (deluxy.it) | 2.426, con 2.956 righe prodotto |
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
- **Meta**: `src/lib/meta.ts` + `POST /api/v1/sync/meta`. Meta non ha gli Scripts:
  è l'app che chiama la Graph API. Serve `META_ACCESS_TOKEN` (utente di sistema
  del Business Manager, non scade). Valore e conversioni **solo** da
  `omni_purchase`. Gli account sono già censiti in Impostazioni.
- Il salvataggio è condiviso: `src/lib/ingest-metriche.ts`. Google spinge
  (`/api/v1/ingest`), Meta viene interrogata, ma la logica di riconoscimento
  campagne e aggiornamento per giorno è la stessa.

### Sezioni dell'app

Dashboard (con le tessere dei brand in cima) · Lettura AI · Analisi periodo ·
Analisi · Stato account · Azioni · Campagne (+ lancio su Google Ads) ·
**Gruppi di annunci** · Landing ·
Pubblici · Copy & annunci · Keywords (+ operazioni keyword) · Meta & test ·
Ordini · Analisi per offerta · Budget vendite/ADV · MKT vs 2025 · Operazioni ·
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

## MANCA

1. **Chiave OpenAI** — la sezione `/ai` è pronta ma dirà che serve
   `OPENAI_API_KEY`: va nella cassaforte del Hub (progetto `deluxy-marketing`,
   più `HUB_KEYS_TOKEN` su Vercel) o come variabile su Vercel.
2. **Token Meta** — `META_ACCESS_TOKEN` su Vercel. Istruzioni: app su
   developers.facebook.com (tipo Azienda) → utente di sistema in Business
   Manager → assegnare i 3 account (Gifts 2802316249885506, Flowers
   965988141913909, Cake 1040175814157216) → token con `ads_read`.
   ⚠️ Il portfolio `1298043513875111` è **disabilitato da Meta**: mai usarlo.
   L'account `45888139` "Owned by deluxy.it" non si usa (ISTRUZIONI Gifts).
3. **Script Google su Cake** (846-090-5423) — non ancora installato.
4. **Schedulazione** — verificare che su Gifts e Flowers la colonna *Frequenza*
   sia impostata (non basta "Esegui": lancia una volta sola). Il 24/07 i dati si
   sono fermati due giorni per questo. Consigliato: ogni giorno, e
   `GIORNI_INDIETRO = 7` (400 solo per il primo caricamento storico).
5. **Chiave Google Drive API** — `GOOGLE_DRIVE_API_KEY` per la sync del Drive
   **dal server**: da Vercel la cartella `G:\` non esiste. Senza chiave l'indice
   si aggiorna solo lanciando `npm run sync-drive` dal PC.
6. **Ordini Flowers e Cake** — solo deluxy.it è importato. Serve il token Admin
   API dei due negozi (`SHOPIFY_TOKEN_*`) o l'autorizzazione a fare switch-shop.
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

## Come riprendere

```bash
cd C:\Users\nicol\scoutwt\deluxy-marketing
npm run dev          # porta 3130
npx tsc --noEmit     # prima di ogni commit
```

Prima di fermarsi: aggiornare **questo file** e la memoria di progetto
(`progetto-deluxy-marketing.md`), come dice la regola 1 del repo.
