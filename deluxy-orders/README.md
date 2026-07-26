# Deluxy Orders

Registro **centralizzato degli ordini Shopify** di tutti i brand Deluxy. È la
fonte di verità degli ordini: li importa da Shopify, permette di
**riclassificarli a piacimento** (stato/pipeline, etichette libere, categorie,
instradamento a un'app o a un fornitore) e li espone alle altre app tramite
**API a chiave**. Per gli ordini è ciò che Deluxy Anagrafiche è per i partner.

- Stack: Next.js 15 (App Router, React 19) + Prisma + PostgreSQL. Porta **3150**.
- Design: Deluxy Design System v1.0 (`deluxy-design-system/`).

## Sviluppo

```bash
npm install
# .env con DATABASE_URL + DIRECT_URL (Postgres, schema dedicato "orders"):
#   node scripts/configura-db-condiviso.mjs ../deluxy-partner/.env
npm run db:push            # crea le tabelle
npm run negozi:da-finance  # riusa i negozi Shopify già collegati in Finance
npm run import:storico     # scarica TUTTI gli ordini di sempre (lungo)
npm run dev                # http://localhost:3150
```

Variabili d'ambiente:

| Nome | A cosa serve |
| --- | --- |
| `DATABASE_URL` | Postgres pooled (pgbouncer) — schema dedicato `orders` |
| `DIRECT_URL` | Postgres diretto per `db push`/migrazioni |
| `ORDERS_APP_PASSWORD` | password unica della UI (se assente, UI aperta in locale) |
| `CRON_SECRET` | protegge `/api/cron/sync` (sync notturna Vercel) |
| `MESSAGGI_URL` | dove sta il Customer Service (deluxy-messaging), per importare i feedback |
| `MESSAGGI_API_KEY` | chiave di sola lettura del Customer Service (si crea là: `npm run chiave -- deluxy-orders`) |

## Come funziona (in breve)

1. **Negozi** (Impostazioni): si collega un negozio Shopify con token statico
   `shpat_…` oppure Client ID + Secret di un'app della Dev Dashboard (il token
   si conia da solo, come in Deluxy Partner). Sola lettura ordini.
2. **Import**: il primo carico si fa con `npm run import:storico` (**tutti gli
   ordini di sempre**, a pagine, ripetibile senza doppioni); poi il pulsante
   «Sincronizza», lo script `npm run sync` o il cron notturno tengono
   aggiornati gli ordini recenti (numero, cliente, spedizione, righe, stato
   pagamento/evasione, gateway) senza toccare la classificazione impostata.
3. **Riclassificazione**: dalla scheda ordine o dalla **Bacheca** si imposta lo
   stato della pipeline, si aggiungono etichette, si correggono le categorie e
   si instrada l'ordine a un'app/fornitore/responsabile. Ogni modifica lascia
   una traccia nella *Storia*.
4. **Lettura dalle altre app**: via `GET /api/v1/ordini` con chiave.

## API (per le altre app)

Autenticazione: header `x-api-key: <chiave>` (o `Authorization: Bearer …`).
Le chiavi si creano da riga di comando:

```bash
npm run chiave -- deluxy-search              # sola lettura
npm run chiave -- deluxy-partner --scrittura # può riclassificare (PATCH)
```

| Metodo | Rotta | Scopo |
| --- | --- | --- |
| GET | `/api/v1/health` | sonda pubblica |
| GET | `/api/v1/ordini` | elenco con filtri (`q, brand, stato, categoria, app, etichetta, da, a, consegnaDa, consegnaA, pagamento, shopify, rischio, problema`) e paginazione (`page, limit`) |
| GET | `/api/v1/ordini/:id` | un ordine con la classificazione (410 se annullato) |
| PATCH | `/api/v1/ordini/:id` | riclassifica (chiave di scrittura): `stato`, `etichette[]`, `categoriaPagamento`, `tipoConsegna`, `tipoProdotto`, `canale`, `assegnatoApp`, `fornitore`, `responsabile`, `classificazioni{}`, `noteInterne` |
| GET | `/api/v1/ricavi` | venduto **aggregato per brand e per mese** (`anno`, oppure `da`/`a`; `brand`; `annullati=inclusi`, `rimborsati=inclusi`) |
| GET | `/api/v1/stati` | la pipeline degli stati (per interpretare `stato`) |
| GET | `/api/v1/liste` | catalogo delle liste di clienti, con conteggi, criteri e soglie |
| GET | `/api/v1/liste/:chiave` | i clienti di una lista (`q, ordina, page, limit≤500`) con segmento, tipologia, spesa e recency |
| POST | `/api/v1/sync?giorni=90` | avvia l'import (chiave di scrittura); `giorni=tutto` per lo storico completo |

La forma della risposta è documentata in `src/lib/ordini.ts` (`serializzaOrdine`).

> **Ordini problematici.** Ogni ordine porta `problema: { problematico, motivi, gestito, nota }`.
> Oggi `problematico` vuol dire **rimborso parziale**: l'ordine è valido e in piedi, ma una
> parte del denaro è tornata al cliente e l'importo reso **non esiste nel registro** — quindi
> ogni totale che lo include è sbagliato in eccesso. I `motivi` sono in italiano, così un'app
> a valle può dirlo a un operatore senza conoscere i codici Shopify. Filtro: `problema=aperti`
> (da verificare), `gestiti`, `tutti`.

> **Da che tipo di cliente arriva un ordine.** `GET /api/v1/ordini` restituisce
> dentro `cliente` anche `tipo` (`privato | azienda | horeca | eventi |
> rivenditore`) e `tipoDa` (`manuale` se l'ha deciso un operatore con un tag,
> `dedotta` se viene dal nome dell'acquirente). Così le altre app — per prima la
> Customer Service, che ci marca gli ordini — non devono rifarsi la
> classificazione in casa.
>
> Si risolve **per cliente, non per ordine**: la tipologia si deduce
> dall'insieme dei nomi con cui quella persona ha comprato, come nell'elenco
> Clienti. Chi ha ordinato una volta come «Mario Rossi» e una come «Rossi srl» è
> *azienda* su tutti i suoi ordini, e le due schermate non si contraddicono
> (`src/lib/tipologia-cliente.ts`, una sola query per pagina di risultati).
> `tipo` esce `null` sugli ordini senza email, telefono né nome: lì non si sa chi
> sia il cliente, e non si tira a indovinare.

> **Gli ordini annullati non escono di default.** Un'app che li ricevesse
> potrebbe lavorarli come validi, e un ordine annullato resta spesso «pagato»:
> non lo si riconosce dal pagamento. Per averli serve `annullati=inclusi` (o
> `annullati=solo`); l'elenco dichiara sempre `annullatiInclusi`. Finance li
> chiede, perché la riconciliazione ha bisogno di rimborsi e incassi avvenuti;
> le app operative usano il default.

> **`/api/v1/ricavi` somma nel database, non a valle.** Un anno sono migliaia di
> ordini: leggerli a pagine di 200 per sommarli nell'app che chiama sarebbe
> decine di chiamate per un totale. Gli importi sono il **totale Shopify, IVA e
> spedizione incluse** (l'aliquota non è salvata sull'ordine: chi confronta con
> un imponibile la scorpora a valle e dichiara quale ha usato). Oltre agli
> annullati si escludono anche i **rimborsati/stornati** (REFUNDED, VOIDED);
> i rimborsi **parziali** restano contati per intero, perché l'importo reso non
> esiste nel registro — la risposta lo dichiara in `esclusi`.

## Struttura

- `prisma/schema.prisma` — NegozioShopify, Ordine, RigaOrdine, StatoOrdine, Etichetta, EventoOrdine, FeedbackOrdine, TagCliente, PrivacyCliente, Automazione, MessaggioAutomazione, ApiKey.
- `src/lib/shopify.ts` — client Admin GraphQL (ordini + righe + spedizione + tag), paginazione con ritentativi sui limiti di frequenza.
- `src/lib/sync.ts` — import/upsert riutilizzabile (pulsante, script, cron), a blocchi per reggere gli import storici.
- `src/lib/ordini.ts` — filtro condiviso UI/API + serializzazione.
- `src/lib/clienti.ts` — clienti ricavati dagli ordini (aggregazione SQL) e
  classificati: segmento di valore, tipologia, liste.
- `src/lib/segmenti.ts` — il vocabolario della classificazione: soglie, regole
  di riconoscimento e **catalogo delle 28 liste** (criterio + consiglio d'uso).
  È il posto dove si cambiano le soglie o si aggiunge una lista.
- `src/lib/automazioni.ts` — messaggi ai clienti di una lista: segnaposto,
  composizione e i quattro setacci (consenso, recapito, silenzio, limite).
- `src/lib/feedback.ts` — import dei reclami e dei voti dal Customer Service.
- `src/lib/brand.ts` — brand e loro colori.
- `src/app/` — Ordini (elenco + colonne per brand), Bacheca (kanban), scheda
  ordine, Clienti (elenco ordinabile per ogni colonna + scheda con tipologia e
  privacy), Liste (catalogo + dettaglio + export CSV), Automazioni, Impostazioni.
