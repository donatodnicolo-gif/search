# Handoff — Deluxy Merchandising

Stato al 23/07/2026. Una nuova sessione deve poter riprendere da qui senza contesto.

## Cos'è
App per gestire il **prodotto a 360° come una maison di moda**: fonte di verità a
monte, Shopify canale di vendita a valle. Next.js 15 + Prisma + SQLite (dev),
porta **3120**. Design system Deluxy v1.0.

## FATTO
- Scaffold completo (package.json, tsconfig, next.config, `.claude/launch.json`, `.env.example`).
- Schema Prisma (SQLite): `Collezione`, `Prodotto`, `Variante`, `TappaSviluppo`, `Fornitore`, `Vetrina`, `VetrinaProdotto`. Niente enum/array (compat SQLite): stati come stringhe con catalogo in `src/lib/dominio.ts`.
- Seed demo (`prisma/seed.mjs`): 3 collezioni, 8 prodotti, 3 varianti, 2 vetrine, 3 fornitori.
- Lib: `db.ts`, `dominio.ts` (stagioni, stati collezione, fasi PLM, categorie, calcolo margine/mark-up, euro), `shopify.ts` (payload + `shopifyConfigurato()`), `azioni.ts` (server actions).
- Shell UI riusa il design system: `tokens.css`, `globals.css`, `layout.tsx`, `Sidebar`, `ToggleSidebar`, `SbSezione`, `Icona`, `Badge`, `BarraMargine`, `FormFiltri`, `TabellaProdotti`.
- Pagine: `/` (collezioni+KPI), `/collezioni/nuova`, `/collezioni/[id]`, `/prodotti`, `/prodotti/nuovo`, `/prodotti/[id]` (scheda 360° a tab: Panoramica/Sviluppo/Costi/Visual/Shopify), `/sviluppo` (board PLM), `/costi`, `/visual`, `/visual/[id]`, `/shopify`.
- Server actions verificate end-to-end (creazione, aggiornamento, cambio fase, varianti, vetrine riordino/aggiungi/rimuovi, stato Shopify) con `revalidatePath`.
- **Hub**: voce `merchandising` in `deluxy-hub/src/lib/apps.ts` + icona in `AppIcon.tsx` (union estesa). In produzione compare con `APP_URL_MERCHANDISING`.
- Verifica: `npm run db:push` + `db:seed` ok; `npx tsc --noEmit` exit 0; navigazione browser su tutte le pagine senza errori console; azione Shopify testata (bozza + revalidation).

## COME AVVIARE
```
cd deluxy-merchandising
npm install
npm run db:push && npm run db:seed
npm run dev   # http://localhost:3120
```
`npm run db:reset` per ripartire dai dati demo.

## MANCA / PROSSIMI PASSI
- **Shopify reale**: `src/lib/shopify.ts` costruisce il payload ma non scrive. Da collegare: `SHOPIFY_STORE_DOMAIN` + `SHOPIFY_ADMIN_TOKEN` e la chiamata `productSet`/`productCreate` all'Admin API (con conferma). Esiste un MCP Shopify in sessione utilizzabile per il primo collaudo.
- **Postgres condiviso** (produzione): oggi SQLite. Cambiare provider in `postgresql` + `DATABASE_URL`/`DIRECT_URL` (schema `merchandising`). Nessun array/enum da convertire. Vedi README §"Passaggio a Postgres".
- **Protezione UI** (`MERCHANDISING_APP_PASSWORD`) + middleware come le altre app: non ancora aggiunta (UI aperta in locale).
- **SSO Hub**: non ancora agganciato (come le app senza flag `sso`).
- **Deploy Vercel** + `APP_URL_MERCHANDISING` nell'Hub: da fare (con conferma).
- **Anagrafiche/Fornitori**: i fornitori sono locali; valutare se collegarli al registro centralizzato.
- **Immagini**: gli still-life sono via URL; nessun upload asset (placeholder ❀ se assente).

## NOTE
- Committato e pushato su `scout-ui` (search.git) il 24/07/2026.
- Il preview `.claude/launch.json` locale definisce `merchandising`; il launch.json condiviso della sessione non lo conosce (avviare con `npm run dev`).
