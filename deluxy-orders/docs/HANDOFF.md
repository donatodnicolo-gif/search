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
- **Import storico COMPLETATO** (28,5 min, 0 errori): **13.954 ordini** e 16.933
  righe. `npm run verifica:totali` conferma l'allineamento esatto con Shopify:
  deluxy.it 11.640 = 11.640 · Flowers 1.584 = 1.584 · cakedesign.me 730 = 730.

- **Ricerca ordini**: casella unica in evidenza sopra i filtri; cerca su numero
  (anche senza `#`), cliente/email/telefono, destinatario e indirizzo, brand,
  note e tag Shopify, gateway, classificazione Deluxy (fornitore, responsabile,
  note interne, etichette) e prodotti (titolo, variante, SKU). AND fra le
  parole, OR fra i campi — `campiRicerca()` in `src/lib/ordini.ts`, usata sia
  dalla UI sia dall'API.
- **LIVE su https://deluxy-orders.vercel.app** (progetto Vercel `deluxy-orders`):
  env `DATABASE_URL`/`DIRECT_URL` (schema orders), `ORDERS_APP_PASSWORD`,
  `CRON_SECRET`; nel Hub è impostata `APP_URL_ORDERS`. Verificato: UI protetta
  (redirect a /login), API senza chiave → 401, `/api/v1/health` → 200.

## FATTO (26/07/2026)
- **Colori per brand**: campo `colore` su `NegozioShopify` (modificabile in
  Impostazioni). Applicato al bordo sinistro e al pallino delle righe
  dell'elenco, alle schede e alle testate delle colonne. Assegnati: Flowers
  rosso, deluxy.it oro, cakedesign.me viola.
- **Vista «Colonne per brand»** nella pagina Ordini (`?vista=brand`): una
  colonna per negozio con conteggio e valore, schede colorate, stessa ricerca e
  stessi filtri dell'elenco. Sotto i 900px le colonne si impilano.
- **Sezione Clienti** (`/clienti` + `/clienti/[chiave]`): clienti ricavati dagli
  ordini con aggregazione SQL (`src/lib/clienti.ts`), identità = email →
  telefono → nome. 10.371 clienti sui 13.954 ordini. Ricerca, ordinamenti
  (spesa/ordini/recenti/nome), paginazione; scheda con KPI, anagrafica e
  storico ordini. Gli ordini senza dati cliente (602) sono esclusi dall'elenco
  e contati a parte, per non creare un finto cliente da centinaia di ordini.

- **Consegna richiesta** (26/07): campi `dataConsegna` + `fasciaConsegna` su
  Ordine, letti dagli attributi Shopify `Data_Consegna` e
  `Fascia_Oraria_Consegna` (stesse chiavi su tutti e tre i negozi, verificate
  sui dati veri). Mostrata nelle colonne per brand, in una colonna dell'elenco
  e in cima alla scheda ordine, con urgenza colorata (oggi/domani/passata).
  Filtro API `consegnaDa`/`consegnaA`, campo `consegna` nella risposta.
  **Attenzione**: la data NON si deduce dalle note libere. Un primo tentativo lo
  faceva e sbagliava (in «30 Luglio 08/12» leggeva "8 dicembre" mentre 08/12 è
  la fascia oraria): meglio "non indicata" che una consegna sbagliata.

## FATTO (26/07/2026, seconda parte)
- **Stati Shopify**: annullamento (`annullatoIl`, motivo, `chiusoIl`), evasione e
  stato pagamento, con etichette italiane, colori e filtri. L'annullamento
  mancava del tutto ed era una lacuna vera: non si deduce dal pagamento (#2565,
  #2562, #2563 sono annullati ma «pagati»).
- **Rischio frode**: livello, raccomandazione e i soli segnali negativi
  dall'analisi antifrode di Shopify; si segnalano solo medio e alto.
- **API: gli annullati non escono più** (410 sul dettaglio, esclusi
  dall'elenco, `annullati=inclusi` per chi deve gestirli). Vedi README.
- **Finance** (`deluxy-partner/src/lib/ordini-registro.ts`): chiede
  `annullati=inclusi` e porta avanti il flag. Senza, perdeva 221 ordini con
  26.200 EUR di movimenti e non scopriva più gli annullamenti.
- **Rubrica Google** (`/clienti/rubrica`) con prova a vuoto obbligatoria.
- **Bottone «Cerca fornitore»** sotto ogni ordine (link a search-deluxy).
- **Import resiliente**: la pagina viene riprovata se il pooler Supabase chiude
  la connessione (era successo tre volte su giri di oltre un'ora).

## MANCA / prossimi passi
0. **Finance: cosa fare degli annullati.** Ora li riceve, ma li tratta come
   ordini normali e finiscono in coda di riconciliazione. Va deciso se
   ignorarli o trasformarli in voci di rimborso: è una scelta contabile.
1. **Push su GitHub** del commit `1b5a678` (in sessione il push è bloccato dal
   classificatore): va fatto a mano con `git push origin scout-ui`.
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
