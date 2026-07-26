# Handoff — Deluxy Merchandising

Stato al 26/07/2026. Una nuova sessione deve poter riprendere da qui senza contesto.

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
- **Vendite & trend** (`/vendite`, 26/07/2026): modello `Vendita` (il fatto elementare: riga venduta al giorno in cui è stata venduta) + `ImportVendite`. `src/lib/vendite.ts` calcola tutto — serie giorno/settimana, totali con confronto sul periodo precedente della stessa lunghezza, margine sul venduto, righe per prodotto con ritmo, tendenza e sparkline a 8 settimane, raggruppamenti per collezione/categoria/canale, righe non abbinate. `src/lib/orders.ts` importa da Deluxy Orders (`ORDERS_URL` + `ORDERS_API_KEY`), deduplicando su `"<idOrdine>#<indiceRiga>"`.
- **Ipotesi di ordinativo** (`/riordini`, `/riordini/[id]`): `src/lib/riordino.ts` calcola quanto riordinare (ritmo pesato 65/35 fra metà recente e metà precedente, correzione di tendenza limitata a ±35%, fabbisogno = ritmo × (lead time + copertura) + scorta − giacenza). Parametri regolabili in querystring; l'ipotesi si congela in `PianoRiordino`/`RigaRiordino` con quantità modificabili, stato bozza/confermato/archiviato ed export CSV (`/riordini/[id]/csv`).
- **Trend con AI** (`/trend-ai`): `src/lib/ai-trend.ts` manda a OpenAI **solo numeri già calcolati** e ne riceve sintesi, osservazioni, azioni proposte e domande; tutto storicizzato in `LetturaTrend` **insieme al pacchetto di dati**, così la lettura resta verificabile. L'AI non calcola e non esegue niente.
- **Venduto reale in archivio (26/07/2026)**: importate **6.582 righe** da Deluxy Orders, 12 mesi (25/07/2025 → 25/07/2026): 9.366 pezzi, **932.604 €** (deluxy.it 63%, Flowers 30%, cakedesign.me 7%). Chiave API di Orders creata (`deluxy-merchandising`, sola lettura) e messa in `.env` locale **e** su Vercel (`ORDERS_API_KEY` + `ORDERS_URL`). Le vendite dimostrative sono state rimosse: in archivio ci sono solo dati veri.
- **Catalogo dal venduto**: `scripts/prodotti-da-vendite.mjs` (`npm run prodotti:da-vendite`, opzioni `--min N` e `--dry`) crea un prodotto per ogni titolo venduto, con varianti da SKU + nome variante, e aggancia le vendite già in archivio. Il 26/07/2026 sono stati creati **2.163 prodotti** (tutto il venduto: la coda lunga degli ordini su misura è quasi 1.900 titoli venduti una volta sola). Prezzo = media davvero incassata; **costo 0**, categoria **`DA_CLASSIFICARE`** e giacenza 0 restano da compilare: non si deducono dal titolo. La riga venduta porta anche `varianteNome` (la taglia scelta dal cliente), altrimenti gli SKU sono codici ciechi tipo `ICQLBN-2`.
- **Vendite dimostrative**: `scripts/vendite-demo.mjs` (`npm run vendite:demo`) genera 180 giorni di venduto plausibile con stagionalità settimanale e picchi (San Valentino, festa della mamma, Natale). Inserisce solo righe con `origine = "demo"`; `--pulisci` toglie solo quelle.
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

## STATO DEPLOY (26/07/2026)
- **Pubblicata**: https://deluxy-merchandising.vercel.app (progetto Vercel `deluxy-merchandising`, Postgres condiviso Supabase schema `merchandising`).
- **UI protetta da password** (`MERCHANDISING_APP_PASSWORD`, middleware + `/login`, cookie `mrc_session` = HMAC della password). Cambiando la password su Vercel **decadono tutte le sessioni** e serve un **nuovo deploy** perché il valore entri in vigore.
- Il 26/07/2026 la variabile è stata sostituita su Vercel ma **il redeploy non è stato eseguito** (bloccato in sessione): finché non si rilancia il deploy, in produzione vale ancora il valore precedente.
- Lo schema del database è già allineato alle tabelle nuove (`prisma db push` eseguito sul Postgres condiviso il 26/07/2026).
- CLI Vercel autenticata come `donatodnicolo-gif`.

## MANCA / PROSSIMI PASSI
- **Redeploy** dopo il cambio password (vedi sopra): `npx vercel redeploy <url-ultimo-deployment>` oppure Redeploy dal pannello Vercel.
- **Costi e categorie dei 2.163 prodotti nuovi**: finché `costoProduzione` resta 0, il margine di `/vendite` e delle ipotesi di ordinativo è 0 (dichiarato, non stimato) e `/costi` non ha nulla da confrontare col target. Stessa cosa per la categoria `DA_CLASSIFICARE` e per le collezioni (nessun prodotto importato è assegnato a una collezione).
- **Giacenze**: nessuna fonte di magazzino è collegata, tutte le varianti importate hanno giacenza 0. Le ipotesi di ordinativo partono quindi da «scorta ignota» e propongono la copertura piena.
- **Chiave OpenAI** (`OPENAI_API_KEY`) per la lettura AI del trend: il percorso è verificato fino alla chiamata (con chiave finta l'app mostra "Chiave OpenAI rifiutata (401)"), la risposta del modello non è ancora stata provata con una chiave vera.
- **Shopify reale**: `src/lib/shopify.ts` costruisce il payload ma non scrive. Da collegare: `SHOPIFY_STORE_DOMAIN` + `SHOPIFY_ADMIN_TOKEN` e la chiamata `productSet`/`productCreate` all'Admin API (con conferma). Esiste un MCP Shopify in sessione utilizzabile per il primo collaudo.
- **SSO Hub**: non ancora agganciato (come le app senza flag `sso`).
- **Anagrafiche/Fornitori**: i fornitori sono locali; valutare se collegarli al registro centralizzato.
- **Immagini**: gli still-life sono via URL; nessun upload asset (placeholder ❀ se assente).

## NOTE
- Committato e pushato su `scout-ui` (search.git) il 24/07/2026; vendite/trend/riordini/AI il 26/07/2026.
- Il preview `.claude/launch.json` locale definisce `merchandising` (3120); nel launch.json condiviso della sessione ci sono `merchandising` (3120) e `merchandising-3121`, utile quando un'altra sessione tiene occupata la 3120.
- **Trappola già pagata**: il calcolo del riordino è per **prodotto**, non per variante. La giacenza sta sulle varianti e si somma, ma il venduto non arriva sempre con la variante riconosciuta: distribuirlo "a occhio" sulle taglie darebbe quantità inventate, cioè ordini sbagliati al fornitore. Stessa logica per le righe vendute non riconosciute: restano senza prodotto invece di essere abbinate per somiglianza.
