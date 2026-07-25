# Handoff — Deluxy Orders

Stato al 25/07/2026. Aggiornare questo file a ogni tappa (regole di lavoro Deluxy).

## Cos'è
Registro centralizzato degli ordini Shopify (fonte di verità). Importa gli
ordini, li fa riclassificare a piacimento ed espone tutto alle altre app via API
a chiave. Next.js 15 + Prisma + Postgres, porta **3150**. Live: non ancora
pubblicata (in produzione il Hub la mostra puntando a `http://localhost:3150`
finché non c'è `APP_URL_ORDERS`).

## FATTO (prima versione)
- **Scaffold**: package.json (porta 3150), next/tsconfig, design system
  (`tokens.css` + `globals.css`), middleware (CORS API + password UI).
- **Schema Prisma**: `NegozioShopify`, `StatoOrdine` (pipeline), `Etichetta`,
  `Ordine` (+ classificazione: stato, etichette, categorie, instradamento,
  `classificazioni` JSON libere, note interne), `RigaOrdine`, `EventoOrdine`
  (storia), `ApiKey`.
- **Import Shopify**: `src/lib/shopify.ts` (Admin GraphQL 2024-10: ordini,
  righe, spedizione, tag, evasione; token statico o client-credentials come
  Partner) + `src/lib/sync.ts` (upsert che NON sovrascrive la classificazione).
- **UI**: Ordini (elenco con filtri + KPI + cambio stato inline), Bacheca
  (kanban per stato), scheda ordine (riclassificazione completa + storia),
  Impostazioni (negozi, pipeline, etichette, chiavi), Login.
- **Server actions** in `src/app/actions.ts` per ogni mutazione UI.
- **API v1**: `health`, `ordini` (GET lista), `ordini/:id` (GET + PATCH
  riclassifica), `stati` (GET), `sync` (POST). Cron `/api/cron/sync` + vercel.json.
- **Script**: `npm run chiave` (chiavi API), `npm run sync` (import via HTTP).
- **Hub**: registrata in `deluxy-hub/src/lib/apps.ts` (id `orders`, icona
  `orders`), glifo in `AppIcon.tsx`.
- **Verifica**: `npm run build` verde (8 rotte, typecheck e lint ok).

## FATTO (messa in esercizio, 25/07/2026)
- **DB reale**: schema `orders` creato sul Postgres condiviso Supabase
  (`scripts/configura-db-condiviso.mjs` + `npm run db:push`).
- **Negozi collegati**: i 3 negozi di Finance copiati in Orders con
  `npm run negozi:da-finance` — Flowers (fb72b1-2), cakedesign.me
  (cakedesign-5921), deluxy.it (deluxygifts), tutti con Client ID+Secret.
- **Import storico completo** con `npm run import:storico`: motore aggiornato
  per scaricare **tutti gli ordini di sempre** (nessun filtro di data, pagine
  illimitate, salvataggio pagina per pagina, ritentativi sui limiti di
  frequenza Shopify) e inserimento **a blocchi** (createMany) — da ~1 ordine
  per query a poche query per pagina.
- **App avviata** su http://localhost:3150 e verificata con dati reali.

## MANCA / prossimi passi
1. **Deploy Vercel** + `APP_URL_ORDERS` nel Hub + `CRON_SECRET` + `ORDERS_APP_PASSWORD`.
2. **Integrazione con le app di destinazione** (fase 2, lettura via API):
   - Ricerca fornitori (smistamento): legge gli ordini `assegnatoApp=search`.
   - Finance (partner): può leggere/riconciliare da qui invece che da Shopify.
   - Consegne: legge gli ordini instradati.
   Per ora le altre app continuano a scaricare da Shopify: la migrazione a
   «leggono da Orders» è graduale.
3. **Riclassificazione avanzata** (idee): regole automatiche (es. brand→stato),
   assegnazione massiva dalla bacheca, editor delle dimensioni libere `classificazioni`.

## Note di progetto
- La sync **non tocca** la classificazione Deluxy; la categoria pagamento si
  aggiorna solo se non corretta a mano (`categoriaPagamentoManuale`).
- Le chiavi API si vedono in chiaro una sola volta (nel DB solo lo SHA-256).
- Una sola sessione Claude per cartella; commit spesso; confermare deploy/push.
