# Deluxy Merchandising

Gestione del **prodotto a 360°, come una maison di moda**. È la fonte di verità
a monte del prodotto Deluxy: qui il prodotto nasce (concept), si sviluppa,
riceve costi e prezzi, viene messo in scena (visual merchandising) e infine
**pubblicato su Shopify**, che resta il canale di vendita a valle.

- **Stack**: Next.js 15 (App Router) · React 19 · Prisma · SQLite (sviluppo)
- **Porta**: `3120`
- **Design system**: Deluxy Design System v1.0 (stile Apple), token in `src/app/tokens.css`

## Ambito: globale o un brand

In alto a destra c'è **un solo selettore**: «Globale — tutti i brand» oppure un
brand (Flowers, deluxy.it, cakedesign.me). La scelta sta in un cookie e vale in
**ogni** pagina, così non c'è mai il dubbio di chi siano i numeri: è scritto nel
titolo della pagina. Le singole pagine non hanno più un filtro brand proprio.

Il brand **non è una proprietà del prodotto**: è del venduto (`Vendita.canale`,
dal negozio Shopify via Orders). Perciò «prodotti di un brand» significa sempre
**prodotti venduti su quel brand** — uno stesso bouquet può stare su due negozi.
Le **collezioni** restano trasversali: non si filtrano per brand.

Il menù è raggruppato per mestiere: **Panoramica** (cruscotto) · **Vendite**
(andamento, classifiche, ipotesi di ordinativo, lettura AI) · **Prodotto**
(collezioni, prodotti, sviluppo, costi) · **Vetrina & canale** (visual, Shopify).

## Moduli

| Modulo | Cosa fa | Rotta |
| --- | --- | --- |
| **Cruscotto** | La prima schermata: come sta andando l'ambito scelto. In globale i brand affiancati (ricavo, variazione, quota, primo prodotto) invece di un totale che non è di nessuno; dentro un brand, quel mondo. | `/` |
| **Anagrafica completa** | Tutti i prodotti con tutto quello che l'app ne sa: codice, SKU, fornitore e categoria dal negozio, categoria interna, prezzo, costo, collezioni Shopify e venduto. **Raggruppa per fornitore, categoria, linea o fornitore × categoria**, con prodotti, senza costo, esclusi e venduto 90gg di ogni gruppo; dal gruppo si entra nei suoi prodotti. Filtri per fornitore, linea e «cosa manca», ed export CSV per compilare i buchi in foglio di calcolo. | `/anagrafica` |
| **Categorie, linee, collezioni** | Il vocabolario con cui Deluxy classifica i prodotti, modificabile a piacimento. Ogni voce ha una **descrizione**: la legge chi classifica e la legge l'AI per proporre dove va un prodotto importato. | `/classificazione` |
| **Collezioni Shopify** | Le collezioni **vere** dei negozi, importate con un bottone e abbinate ai prodotti per SKU. Restano separate da quelle di maison: una è la vetrina del sito, l'altra una scelta creativa. Ogni scheda dice quanti prodotti contiene su Shopify e quanti ne riconosce l'app, e come ha venduto. | `/collezioni`, `/collezioni/shopify/[id]` |
| **Collezioni & stagioni** | Il prodotto organizzato per stagione (SS26, HOLIDAY26…), con stato in sviluppo → in vendita → archiviata, tema, data di lancio, margine target. | `/collezioni`, `/collezioni/[id]` |
| **Prodotti** | Catalogo completo con filtri (collezione, categoria, fase) e scheda 360° a tab. | `/prodotti`, `/prodotti/[id]` |
| **Sviluppo (PLM)** | La pipeline del ciclo di vita a board: concept → prototipo → approvato → in vendita. Brief creativo, materiali, palette, storico delle fasi. | `/sviluppo` |
| **Costi & margini** | Costo, prezzo, guadagno e marginalità sul venduto di ogni prodotto, confrontati col target di collezione. Allarmi sotto target. | `/costi` |
| **Vendite & trend** | Il venduto reale letto da Deluxy Orders: andamento del periodo, cosa tira e cosa si è spento, pezzi/ricavo/margine per prodotto, collezione, categoria e canale, sempre confrontati col periodo precedente. | `/vendite` |
| **Classifiche** | Gli articoli più venduti messi in fila **per quantità** e **per valore**, su tutti i brand o su uno solo, per prodotto o per variante (taglia/formato), con il confronto fra le due posizioni. Contano **solo le vendite andate a buon fine**. | `/classifiche` |
| **Categorie & collezioni** | Il venduto letto con le informazioni del prodotto: per ogni categoria e collezione quanti prodotti tirano rispetto a quanti ne ha a catalogo, pezzi, ricavo, variazione, quota, prezzo medio, margine e i tre prodotti che tirano di più. | `/assortimento` |
| **Ipotesi di ordinativo** | Quanto riordinare di ogni prodotto, dal ritmo di vendita reale e dalla giacenza (lead time, copertura, scorta regolabili). Si congela in un piano modificabile ed esportabile in CSV. **Propone, non ordina.** | `/riordini`, `/riordini/[id]` |
| **Trend con AI** | Lettura del venduto scritta dal modello sui numeri già calcolati dall'app, con osservazioni, azioni proposte e domande aperte. Storicizzata insieme ai dati su cui è fondata. | `/trend-ai` |
| **Visual merchandising** | Allestimenti (vetrine, lookbook, capsule): i prodotti disposti in una sequenza curata, riordinabile. | `/visual`, `/visual/[id]` |
| **Negozi & permessi** | Dove si decide con quali negozi Shopify l'app parla: **Client ID + Secret** dell'app (l'app si conia da sola il token, ~24h, rinnovo automatico) oppure il vecchio token statico `shpat_…`; tutto cifrato e mai rimostrato. Verifica che dice quali permessi ha davvero, catalogo dei permessi da dare, chiave OpenAI e prompt AI per categoria. | `/impostazioni` |
| **Shopify** | Stato di pubblicazione e anteprima del payload prodotto. L'app prepara tutto; la scrittura reale sul negozio si attiva con le credenziali. | `/shopify` |

La **scheda prodotto 360°** (`/prodotti/[id]`) riunisce tutto in tab:
Panoramica · Sviluppo · Costi & margini · Visual · Shopify.

## Avvio in locale

```bash
npm install
npm run db:push      # crea lo schema su SQLite (prisma/dev.db)
npm run db:seed      # dati demo (collezioni, prodotti, varianti, vetrine)
npm run dev          # http://localhost:3120
```

Per ripartire da zero con i dati demo: `npm run db:reset`.

## Variabili d'ambiente

Copiare `.env.example` in `.env`. In sviluppo serve solo `DATABASE_URL` (SQLite,
nessun segreto). Vedi il file per le opzioni:

- `DATABASE_URL` — database (SQLite in locale).
- `MERCHANDISING_APP_PASSWORD` — opzionale: protegge la UI con password unica (come le altre app Deluxy).
- `ORDERS_URL` + `ORDERS_API_KEY` — collegamento al registro ordini **Deluxy Orders**, da cui arriva il venduto di `/vendite` e delle ipotesi di ordinativo. La chiave si crea in `deluxy-orders` con `npm run chiave -- deluxy-merchandising`. Senza chiave le pagine restano leggibili ma non importano nulla.
- `APP_SECRET` — cifra i token Shopify inseriti in `/impostazioni` (AES-256-GCM). Senza, l'app **rifiuta di salvarli** invece di metterli in chiaro. Cambiandola, i token salvati vanno reinseriti.
- `OPENAI_API_KEY` + `OPENAI_MODEL` — lettura AI del trend. Senza chiave `/trend-ai` mostra comunque i numeri pronti, ma non la lettura.
- `SHOPIFY_STORE_DOMAIN` + `SHOPIFY_ADMIN_TOKEN` — opzionali: necessari **solo** per pubblicare davvero i prodotti su Shopify. Finché mancano, l'app prepara il payload e traccia lo stato ma non scrive sul negozio.

## Vendite: da dove arrivano i numeri

Merchandising **non vende e non consegna**: legge il venduto dal registro
centralizzato `deluxy-orders` (che sincronizza Shopify) e lo interpreta. Due
conseguenze da tenere a mente:

- gli **ordini annullati non escono** dalle API di Orders, quindi non sono mai
  contati (un annullato resta spesso "pagato": contarlo gonfierebbe il venduto);
- **vendita andata a buon fine** = ordine **pagato e non rimborsato**
  (`PAID`/`PARTIALLY_PAID`). È la base di Classifiche e ipotesi di ordinativo:
  un reso non è domanda. Restano fuori rimborsati, rimborsati in parte (non si
  sa quale riga sia stata resa) e non incassati; **non** si pretende l'evasione,
  perché metà del venduto è `UNFULFILLED` per consegne future. `/vendite` invece
  mostra tutto: è il registro di quello che è successo;
- i **prodotti archiviati** non entrano in classifica: è così che si tolgono le
  righe di servizio dei negozi (supplementi di prezzo e simili), che altrimenti
  vincono la classifica dei pezzi senza vendere niente. Non vengono riconosciute
  dal nome, perché sarebbe indovinare;
- una riga venduta che non corrisponde a nessun prodotto dell'app **non viene
  abbinata a occhio**: resta senza prodotto, conta nei totali e compare in fondo
  a `/vendite` fra le righe da mappare (basta dare alla variante lo SKU giusto).

### Dal venduto al catalogo

Se il catalogo non contiene ancora i prodotti che si vendono davvero, le vendite
importate restano senza prodotto. Per crearli dal venduto reale:

```bash
npm run prodotti:da-vendite -- --dry        # mostra cosa farebbe
npm run prodotti:da-vendite                 # crea tutto
npm run prodotti:da-vendite -- --min 5      # solo i titoli venduti almeno 5 volte
```

Un prodotto per ogni titolo venduto, con le varianti prese dagli SKU e dai nomi
di variante scelti dai clienti, e le vendite già in archivio agganciate. Il
prezzo è la **media davvero incassata**; **costo 0** e categoria **«Da
classificare»** restano da compilare a mano, perché non si indovinano dal titolo:
finché il costo manca, il margine resta a zero invece di essere inventato. Anche
la giacenza parte da 0 (qui non arriva nessun magazzino): le ipotesi di
ordinativo vanno lette sapendo che partono da scorta ignota.

Senza collegamento a Orders si possono caricare vendite dimostrative su 180
giorni — inseriscono solo righe con origine `demo` e non toccano altro:

```bash
npm run vendite:demo            # carica
npm run vendite:demo:pulisci    # rimuove solo le righe demo
```

## Passaggio a Postgres condiviso (produzione)

Come le altre app Deluxy, in produzione si usa il Postgres condiviso (schema
`merchandising`). Per migrare:

1. In `prisma/schema.prisma` cambiare `provider = "sqlite"` in `postgresql` e aggiungere `directUrl = env("DIRECT_URL")`.
2. Riportare i tipi Postgres nativi dove utile (nessun array/enum è usato: la migrazione è diretta).
3. Impostare `DATABASE_URL`/`DIRECT_URL` e lanciare `prisma db push`.

## Integrazione con l'ecosistema

- **Hub**: la voce è già nel catalogo (`deluxy-hub/src/lib/apps.ts`, id `merchandising`, icona `merchandising`). In produzione la tessera compare impostando `APP_URL_MERCHANDISING`.
- **Shopify**: canale di vendita a valle (vedi modulo Shopify e `src/lib/shopify.ts`).
- **Anagrafiche**: non duplica dati partner; è un registro di prodotto, complementare al registro partner B2B.
