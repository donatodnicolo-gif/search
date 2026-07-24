# Deluxy Merchandising

Gestione del **prodotto a 360°, come una maison di moda**. È la fonte di verità
a monte del prodotto Deluxy: qui il prodotto nasce (concept), si sviluppa,
riceve costi e prezzi, viene messo in scena (visual merchandising) e infine
**pubblicato su Shopify**, che resta il canale di vendita a valle.

- **Stack**: Next.js 15 (App Router) · React 19 · Prisma · SQLite (sviluppo)
- **Porta**: `3120`
- **Design system**: Deluxy Design System v1.0 (stile Apple), token in `src/app/tokens.css`

## Moduli

| Modulo | Cosa fa | Rotta |
| --- | --- | --- |
| **Collezioni & stagioni** | Il prodotto organizzato per stagione (SS26, HOLIDAY26…), con stato in sviluppo → in vendita → archiviata, tema, data di lancio, margine target. | `/`, `/collezioni/[id]` |
| **Prodotti** | Catalogo completo con filtri (collezione, categoria, fase) e scheda 360° a tab. | `/prodotti`, `/prodotti/[id]` |
| **Sviluppo (PLM)** | La pipeline del ciclo di vita a board: concept → prototipo → approvato → in vendita. Brief creativo, materiali, palette, storico delle fasi. | `/sviluppo` |
| **Costi & margini** | Costo, prezzo, guadagno e marginalità sul venduto di ogni prodotto, confrontati col target di collezione. Allarmi sotto target. | `/costi` |
| **Visual merchandising** | Allestimenti (vetrine, lookbook, capsule): i prodotti disposti in una sequenza curata, riordinabile. | `/visual`, `/visual/[id]` |
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
- `SHOPIFY_STORE_DOMAIN` + `SHOPIFY_ADMIN_TOKEN` — opzionali: necessari **solo** per pubblicare davvero i prodotti su Shopify. Finché mancano, l'app prepara il payload e traccia lo stato ma non scrive sul negozio.

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
