# Deluxy Partner — Handoff / Stato del prodotto

**Ultimo aggiornamento:** 26 luglio 2026 · branch `scout-ui` (origin, repo condiviso da PIÙ sessioni Claude — non è raro trovare le proprie modifiche dentro commit altrui).
Questo è il documento "parti da qui": stato reale del prodotto, funzioni, API, integrazioni, dati e come lavorarci. La fonte di verità funzionale storica resta [PROGETTO.md](PROGETTO.md); questo file è il quadro corrente più completo.

> **Novità 23–26/07/2026** (dettagli nelle sezioni sotto): allineamento incasso app→**Fatture in Cloud** (con conto di saldo Qonto); **stato finanziario del cliente** (credit management, aging) + API `/api/clienti/stato`; **regole degli stati** configurabili; **saldo parziale** delle fatture; **registro modifiche** (audit log, `/impostazioni/logs`); note del mese datate con verifica AI; **Orders**: sorgente ordini = **registro Deluxy Orders** (non più Shopify diretto), **costo fornitore** per ordine con quota attesa **60%** (sotto=bene/sopra=male), abbinamento automatico per **numero d'ordine in causale**, scheda ordine con transazione corrispondente + **popup «Riconcilia»** (ricerca per importo/nome) + «Richiedi pagamento». **RIMOSSA** tutta la parte pagamenti in uscita (Pagamenti diretti, Approvazioni, conferma via email) → passerà all'app **transazioni**.
>
> ⚠️ **Env da avere su Vercel**: `ORDERS_URL` + `ORDERS_API_KEY` (registro ordini) — già impostate. Chiave di lettura ordini creata in deluxy-orders (`deluxy-partner-import`).

---

## 1. Cos'è, dov'è

App che **sostituisce PARTNER.xlsx**: gestione finanziaria e operativa dei partner Deluxy (servizi a fatturazione, vendite come vendor, saldi/compensazioni, bonifici, scadenze, riconciliazione bancaria, reportistica, API per gli altri progetti).

- **Cartella:** `deluxy-partner/` nel monorepo `C:\Users\nicol\scoutwt` (branch `scout-ui`).
- **Produzione:** https://deluxy-partner.vercel.app (progetto Vercel `deluxy/deluxy-partner`).
- **Accesso UI:** password unica di team, env `PARTNER_APP_PASSWORD` su Vercel (oggi: `GuantiBianchi2026!`). Cambiandola si disconnettono tutte le sessioni.
- **Porta locale:** 3040.

## 2. Stack e avvio

- Next.js 15 (App Router, server components + server actions), Prisma 6, **PostgreSQL Supabase** (progetto `deluxy-partner`, ref `zegbztfxisqeowngvgvh`, eu-central-1). React 19, TypeScript.
- Design: **Deluxy Design System v1.0** (token in `src/app/tokens.css`, copia di `deluxy-design-system/tokens/tokens.css`).

```bash
cd deluxy-partner
npm install
# .env locale (NON in git) con DATABASE_URL + DIRECT_URL del Postgres Supabase.
# Senza PARTNER_APP_PASSWORD nel .env l'app locale è aperta (niente login).
npm run dev        # http://localhost:3040
```

- **Deploy:** `npx vercel --prod --yes` dalla cartella. Build fa `prisma generate && next build`.
- **Typecheck prima di ogni deploy:** `npx tsc --noEmit`.
- ⚠️ **Windows:** il dev server blocca la DLL di Prisma. Prima di `prisma db push` / reinstalli, **ferma il dev server** (in questa sessione si usa `preview_stop`).

## 3. Variabili d'ambiente

Su Vercel (produzione) e nel `.env` locale:

| Variabile | Dove | A cosa serve |
|---|---|---|
| `DATABASE_URL` | Vercel + .env | Postgres Supabase, pooler 6543 con `?pgbouncer=true&connection_limit=5` |
| `DIRECT_URL` | Vercel + .env | Postgres, pooler 5432 (migrazioni/`db push`) |
| `PARTNER_APP_PASSWORD` | Vercel | Password login UI (assente in locale = app aperta) |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | Vercel + .env | Recap AI (chiave condivisa con deluxy-mail; modello `gpt-4o-mini`) |
| `OPENAI_VISION_MODEL` | Vercel + .env (facoltativa) | Lettura AI foto IBAN in Pagamenti diretti (default `gpt-4o`, deve avere capacità vision) |
| `CRON_SECRET` | Vercel | Autorizza i cron `/api/cron/qonto` e `/api/cron/ordini` (senza → 503, cron disattivi) |
| `ORDERS_URL`, `ORDERS_API_KEY` | Vercel + .env | **Sorgente degli ordini** (`/ordini`): registro centralizzato Deluxy Orders, sola lettura. `ORDERS_URL` default `https://deluxy-orders.vercel.app`; la chiave si emette da Deluxy Orders (`npm run chiave -- deluxy-partner-import`). Senza chiave il cron notturno si ferma con `saltato` |
| `ANAGRAFICHE_URL`, `ANAGRAFICHE_API_KEY` | Vercel + .env | Lettura dal registro anagrafiche centralizzato (sola lettura) |
| `MAIL_URL`, `MAIL_API_KEY`, `MAIL_UTENTE` | Vercel + .env (facoltative) | Card «Posta con il cliente» nella scheda partner. `MAIL_URL` default `https://deluxy-mail.vercel.app`; `MAIL_API_KEY` = token API di AI Mail (Impostazioni App → Token API); `MAIL_UTENTE` = email di login dell'utente AI Mail di cui leggere la casella. Se mancano, la card non compare |

**Trappola pagata il 26/07/2026 — il BOM invisibile nelle chiavi.** La sync ordini falliva con
`Cannot convert argument to a ByteString because the character at index 0 has a value of 65279`:
65279 è **U+FEFF, il BOM** finito dentro `ORDERS_API_KEY` con un copia-incolla da file UTF-8 con
BOM. `fetch` rifiuta l'intero header, il messaggio non nomina né la variabile né l'app, e la chiave
su Vercel «sembra» giusta perché il carattere è invisibile. Da allora **ogni variabile che finisce
in un header o in un URL passa da `src/lib/env.ts`** (`env()` per URL e controlli «è configurato?»,
`chiave()` per gli header — toglie BOM, zero-width, spazi, a-capo e virgolette, e se resta qualcosa
fuori dall'ASCII si ferma dicendo *quale* variabile). Non tornare a leggere `process.env.X` diretto
per una chiave. Stessa pulizia sul confronto del `CRON_SECRET`, altrimenti un BOM lì darebbe 401
tutte le notti senza che nessuno se ne accorga.

**Importante — credenziali NON in env, ma nel DB** (tabella `Impostazione`, chiave/valore): SMTP solleciti (`smtp.*`), Qonto (`qonto.*`), Fatture in Cloud (`fic.*` incluso access/refresh token), ordinante SEPA (`sepa.*`), chiave API pubblica (`api.verificheKey`). Si gestiscono dalla pagina **Impostazioni** e **/verifiche**, non toccando Vercel.

## 4. Dati importati (stato)

Da `PARTNER.xlsx` (foglio "Database clienti 2026"): **92 partner**, ledger mensile gen–giu 2026. Storico **2025** dal foglio "Database clienti 2025" (331 fatture, 198 vendite, 643 saldi). Import una-tantum via `prisma/seed.mjs` (2026) e `prisma/seed-2025.mjs` (additivo 2025). **⚠️ `npm run db:seed` cancella e reimporta: MAI sul DB di produzione in uso.**

Riconciliazione incassi già applicata (`prisma/riconcilia-incassi.mjs`): 17 fatture incassate ma senza spunta segnate pagate.

## 5. Motore di calcolo — `src/lib/calc.ts` (unica fonte delle formule)

```
commissione        = incasso vendite × fee%            (netto IVA)
dovuto al partner  = incasso − commissione × 1,22       (netto commissioni IVATE)
```

**Due regimi in base al flag `compensazione` del partner** (decisione utente 17/07/2026):
- **CON compensazione** (6 partner): saldo netto mensile = servizi IVATI − dovuto vendite; residuo = saldo + bonifici.
- **SENZA compensazione** (tutti gli altri): due partite separate, mai compensate: `daIncassare` = fatture non saldate IVATE − acconti; `daBonificare` = dovuto vendite − bonifici inviati. Mese pareggiato = entrambe a 0.

Convenzione bonifici: `> 0` inviato al partner, `< 0` ricevuto. `RiepilogoMese` espone `daIncassare/daBonificare/pareggiato`. `rolling()` = cumulati YTD.

**Fee nel tempo** (`src/lib/fee.ts` + modello `TariffaPartner`): "dal mese/anno la fee diventa X%". Ogni vendita salva uno **snapshot** della fee del suo mese; le vendite passate restano invariate, le nuove prendono la fee valida per il mese (`feeApplicabile`/`feeDaTariffe`). La fee della singola vendita si modifica in `/vendite/[id]`; "Riallinea fee vendite" nella scheda partner applica a ciascuna vendita la fee prevista dallo storico per il suo mese.

## 6. Sezioni UI (route)

| Route | Cosa fa |
|---|---|
| `/` Dashboard | KPI anno + bonifici da fare + fatture scadute; bottone "Paga" rapido |
| `/partner`, `/partner/[id]`, `/partner/nuovo`, `/partner/[id]/modifica` | Lista (con totale e delta vs 2025), scheda con Recap AI, anagrafica centralizzata, **contatto amministrativo** (campi `amm*`, importabile dal registro Anagrafiche) con **elenco fatture aperte e invio sollecito diretto**, Fee nel tempo, Rolling, movimenti mensili con registrazione pagamenti e note, totale YTD, **card «Posta con il cliente»** (le mail scambiate con quell'azienda, con casella di ricerca) |
| `/fatture`, `/fatture/[id]`, `/fatture/nuova` | Servizi a fatturazione; scheda record editabile; tipologia obbligatoria dal "Piano per Area" |
| `/vendite`, `/vendite/[id]`, `/vendite/nuova` | Vendite come vendor; scheda con modifica fee/incasso |
| `/proforma`, `/proforma/nuova`, `/proforma/[id]`, `/proforma/[id]/modifica`, `/proforma/[id]/invia` | **Pro-forma ad hoc**: righe libere con totali live, numerazione `PF n/anno` per anno, documento stampabile (Stampa/PDF del browser, `@media print`), invio email (SMTP o mailto, testo precompilato modificabile). Stati: bozza → inviata → **fatturata** (con n° fattura definitiva) oppure **annullata**; bozze modificabili/eliminabili, stati sempre reversibili. Intestazione mittente da Impostazioni → "Intestazione documenti" (chiavi `azienda.*`). Logica: `src/lib/proforma.ts` + `proforma-actions.ts`, editor righe `RigheProForma.tsx` |
| `/saldi` | Riconciliazione mensile per partner, export SEPA/CSV |
| `/transazioni` | **Import transazioni**: upload CSV/XLSX (parser tollerante, incluso Vivid) o **Sincronizza da Qonto**; riconciliazione con match a 1 click, discrepanze, non riconosciute, ricerca morbida, "attesi mancanti" |
| `/scadenzario` | Fatture da incassare (con "Invia sollecito" + "Emetti su FIC"), bonifici pendenti, commissioni da emettere. **Ricerca** (partner/n. fattura/tipologia/IBAN) su tutte e tre le tabelle e **colonne ordinabili indipendenti** per tabella (default: nome partner) |
| `/report`, `/confronti`, `/analisi` | Report per tipologia/città/categoria + forecast; Confronti 2026 vs 2025 (mese/trimestre/anno/personalizzato); Analisi finanziaria per scadenza con split saldato/da saldare e liquidità Qonto live |
| Sorgente ordini = Deluxy Orders (26/07/2026) | Gli ordini **NON** si scaricano più da Shopify: la sorgente è il **registro centralizzato Deluxy Orders** (`deluxy-orders.vercel.app`) via API a chiave. `scaricaOrdiniDaRegistro` in `ordini-registro.ts` legge `GET /api/v1/ordini?da=&page=&limit=200` con header `x-api-key`; `eseguiSyncOrdini` mappa `brand`→`NegozioShopify` (crea il negozio se un brand nuovo) e fa upsert per `(negozioId, orderId)`. Brand e orderId (gid) **coincidono** con quelli già in FINANCE → gli ordini esistenti (coi costi) si aggiornano, non si duplicano (verificato: 1423 update / 7 nuovi su 90gg). **Env nuove**: `ORDERS_URL` (default `https://deluxy-orders.vercel.app`) + `ORDERS_API_KEY` (chiave di lettura di Deluxy Orders, `npm run chiave -- <nome>` in deluxy-orders). ⚠️ Vanno aggiunte su **Vercel** (produzione), altrimenti la sync risponde «ORDERS_API_KEY mancante». `shopify.ts` resta solo per `scaricaTransazioniOrdine` (dettaglio ordine) e la config negozi; `scaricaOrdini`/`tokenNegozio` non sono più usati dalla sync. |
| `/ordini` (Orders) | **Ordini dei negozi Shopify riconciliati con gli incassi.** Scarico multi-negozio via GraphQL Admin API 2024-10 (`scaricaOrdini`), token per negozio in `NegozioShopify` (Impostazioni → Negozi Shopify). Ogni ordine è categorizzato dal `paymentGatewayNames`: **bonifico** → match 1:1 con un movimento `TransazioneBancaria` (Qonto/Vivid) per importo ±0,02 + nome (proposta da confermare, `suggerisciMovimenti`); **carta** già pagata → `incassato_gateway` automatico (payout aggregato); **contrassegno/altro** → spunta a mano. Stati: da_riconciliare / riconciliato / incassato_gateway / ignorato. Modelli `NegozioShopify` + `OrdineShopify`. `src/lib/shopify.ts`, `ordini.ts`, `ordini-actions.ts`. 3 negozi noti: fb72b1-2 (deluxyflowers), deluxygifts (deluxy.it), cakedesign-5921 (cakedesign.me). **Autenticazione per negozio (2 modi, 23/07/2026)**: A) token statico `shpat_…`; B) **Client ID + Client Secret** di un'app della **Dev Dashboard** — l'app conia da sé il token Admin col *client credentials grant* (`POST https://{dominio}/admin/oauth/access_token`, `grant_type=client_credentials`) e lo **rinnova ogni 24h** (cache in `NegozioShopify.token`/`tokenScadeIl`). `tokenNegozio(neg)` in `shopify.ts` sceglie/conia il token; sync e cron non se ne accorgono. Si configura in Impostazioni → Negozi Shopify (Opzione A/B); resta anche l'OAuth «Collega con Shopify». **Sync automatica**: cron Vercel `/api/cron/ordini` ogni notte alle 5:30 (nucleo `eseguiSyncOrdini` in `ordini-sync.ts`), protetto da `CRON_SECRET`; ultima sync mostrata in pagina. **% di incasso (23/07/2026)**: in cima a `/ordini` un riquadro «Incasso» con la percentuale incassata (barra + per categoria di pagamento), su periodo selezionabile (30/90/180/365/tutto) e per negozio. «Incassato» = ordini `incassato_gateway` (carte pagate su Shopify) + `riconciliato` (bonifici abbinati a un movimento Qonto/file); gli `ignorato` sono esclusi dalla base. Calcolato su TUTTI gli ordini del periodo, non solo i 400 elencati |
| Popup «Riconcilia» (26/07/2026) | Gli ordini **da_riconciliare** hanno un bottone **RICONCILIA** che apre un popup (client `RiconciliaModale.tsx` + CSS `.modal-*`) per cercare l'accredito **per importo o per nome/causale** e abbinarlo. Ricerca lato server `cercaMovimentiIncasso(q)` (accrediti non ancora registrati, per descrizione/controparte/importo); abbinamento `riconciliaDaModale(fd)` → `riconciliaOrdine`. All'apertura propone i movimenti dello stesso importo dell'ordine. Sostituisce i vecchi suggerimenti inline; restano «Incassato» e «Ignora». |
| Richiesta di pagamento per ordine (26/07/2026) | Sezione «Richiedi pagamento al fornitore» nella scheda ordine: importo + **IBAN**/beneficiario (validato mod-97), **oppure** un **link di pagamento**, oppure una nota. Modello `RichiestaPagamentoOrdine` (stati richiesto/pagato/annullato). «Segna pagata» → diventa il **costo fornitore** dell'ordine (`pagatoFornitore` + riferimento `Pagamento` out). Azioni `creaRichiestaPagamento`/`segnaRichiestaPagata`/`annullaRichiestaPagamento`. L'app non esegue pagamenti, predispone soltanto. |
| Ricerca movimento da abbinare (26/07/2026) | Nella scheda ordine, ricerca del movimento in **uscita** da usare come costo, per **causale / importo / destinatario** (default = numero ordine); ogni risultato mostra %-sul-valore col colore e un bottone **«Usa»** che lo imposta come costo. Resta l'inserimento a mano in un `<details>`. |
| Quota fornitore 60% — sotto bene / sopra male (26/07/2026) | Default quota **60%** (era 40). Regola: pagato **≤ 60%** = buon margine (verde), **> 60%** = margine basso (rosso). `valutaQuota` → `stato "buono"|"alto"`. Badge/colori in scheda ordine e lista aggiornati. Dai dati reali il pagato ai fiorai è ~55-60% del valore, coerente col 60%. **Backfill 26/07/2026**: 247 ordini hanno il costo abbinato automaticamente dai bonifici Vivid (causale = n° ordine, destinatario = fioraio), 187 sotto il 60% / 60 sopra. |
| Quota fornitore attesa ~40% (26/07/2026) | Deluxy paga al fioraio di norma **~40%** del valore ordine → il costo abbinato **non** deve combaciare col totale. Impostazione `ordini.quotaFornitore` (default 40, in Impostazioni → «Quota fornitore»); helper `valutaQuota(totale, pagato, quota)` in `ordini.ts` (in linea entro ±5 punti percentuali). Ovunque si mostra il costo fornitore compare l'indicatore: badge **In linea col 40% / Sotto / Sopra** nella scheda ordine (con atteso pre-riempito nel form), e in lista la % col colore. L'auto-match usa la quota per **segnalare** i costi fuori linea (non li scarta). |
| Abbinamento per numero in causale (26/07/2026) | Se il **numero dell'ordine** compare nella causale di un movimento in entrata (molti estratti lo riportano), è il match più affidabile. `suggerisciMovimenti` (`ordini.ts`) ora propone anche i match per numero (badge «n°», mostrati pure se l'importo non combacia) oltre a quelli per importo±0,02+nome. Logica in `ordini-abbina.ts` (`eseguiAbbinamentoPerNumero`, non è una server action): match univoci 1:1, **per direzione** — accrediti (entrata) → **incasso** (importo entro il 5% del totale, `causaleContieneNumero`); addebiti (uscita) → **costo fornitore** `pagatoFornitore` = |importo|. **Gira in AUTOMATICO** dopo la sync ordini (`ordini-sync.ts`, quindi anche dal cron notturno) e dopo l'import transazioni / sync Qonto (`transazioni-actions.ts`); il pulsante **«⇄ Abbina per numero»** in `/ordini` lo lancia a mano (backfill). ⚠️ Per i COSTI il criterio è **stretto** (`causaleSoloNumero`): la causale dev'essere il **solo numero** senza parole — altrimenti gli ID lunghi di PayPal/Stripe e i fornitori terzi («DEDEM SPA…») producono falsi positivi; in più l'importo dev'essere un costo plausibile (5–90% del valore, così un aggancio con importo assurdo non viene scritto). Colonna **Stato** rimossa dalla lista (26/07/2026). Nota dai dati reali: i pagamenti fiorai risultano ~**55–60%** del valore, non 40% → valutare se la quota va messa più alta. **Import estratti**: il parser (`estratto.ts`) ora cattura anche una colonna **Reference** separata dalla Description (Vivid mette lì il n° ordine mentre Description=«SHOPIFY») e la accoda alla descrizione; l'impronta anti-duplicati resta sulla sola descrizione base (re-importare non duplica). ⚠️ Al 26/07/2026 gli accrediti Vivid importati (fonte «Statement DE54…csv») sono **payout Stripe/Shopify aggregati** (causale «SHOPIFY/STRIPE», nessun n° ordine): l'auto-match trova ~0 finché non si re-importa un file con il n° in Reference / con i bonifici diretti dei clienti. |
| `/ordini/[id]` (costo fornitore) | **Quanto abbiamo PAGATO al fornitore per l'ordine (23/07/2026)**. Nuovi campi `OrdineShopify.pagatoFornitore` / `fornitoreNome` / `transazionePagamentoId` / `pagatoIl`. Nella scheda ordine sezione «Pagato al fornitore»: importo + data + fornitore + (facoltativo) abbinamento a un **movimento bancario in uscita** (`TransazioneBancaria` con `importo<0`, Qonto/file) — un movimento può coprire più ordini, resta un riferimento non "consumato". Mostra il **margine** = totale ordine − pagato. Azioni `registraPagamentoFornitore`/`azzeraPagamentoFornitore` in `ordini-actions.ts`; riferimento `Pagamento` di tipo `costo_ordine_shopify` (uscita). In cima a `/ordini` riquadro **«Pagato ai fornitori»**: totale pagato + **margine** (incasso − costo) e margine %, sugli ordini del periodo a cui è stato assegnato un costo (gli altri sono contati come «ancora senza»). ⚠️ L'ordine **non sa quale fioraio** l'ha evaso (dato nell'app fornitori) → abbinamento **manuale**; il passo naturale è leggerlo da search-supplier. Colonna in lista: «pagato … · marg. …». |
| `/ordini/[id]` | **Scheda ordine con la transazione corrispondente (23/07/2026)**. Il n° ordine nell'elenco è cliccabile. Mostra: bonifico riconciliato → il **movimento bancario abbinato** (`TransazioneBancaria`: data, importo, controparte, fonte, descrizione, + avviso se l'importo non coincide col totale); carta/gateway → le **transazioni reali lette da Shopify in diretta** (`scaricaTransazioniOrdine` in `shopify.ts`, query `order.transactions`: tipo SALE/CAPTURE/REFUND, gateway, data/ora, ultime cifre carta, importo, esito) con la nota che in banca arrivano nel **payout aggregato** (non 1:1). Best-effort: se Shopify non risponde la scheda mostra il resto |
| `/registrazioni/riconciliazione` | **Riconciliazione clienti FIC ↔ partner Deluxy** (abbina per nome, `matchPartner`). Per i conciliati con `anagraficaId` prepara i dati fiscali di FIC (P.IVA, CF, indirizzo) e, **su conferma per record**, li invia al registro Anagrafiche (`aggiornaAnagrafica`, PATCH, sistema `deluxy-partner`, `asOf`). Invia al registro anche i dati finanziari che FIC possiede (PEC, codice SDI, contatto amm.) e ha una colonna **Dati bancari**: l'IBAN è **precompilato dai beneficiari dei bonifici Qonto** (`qontoBeneficiari` → `/v2/beneficiaries`, dove vive l'IBAN di chi abbiamo pagato; i movimenti espongono solo il nome), abbinati al partner per nome; è modificabile e va sia sul partner (per i SEPA) sia nel registro. I partner abbinati ma **non ancora nel registro** hanno il bottone **"Crea in Anagrafiche"** (`creaInAnagrafiche` → `creaAnagrafica`, POST upsert-merge con i dati FIC, `sistema`/`idEsterno`/`asOf`; il registro dedup per nome+città) che crea/aggancia il record e ne salva l'`anagraficaId` sul partner. Elenca anche i clienti FIC **senza conciliazione**. Scrittura gated su `ANAGRAFICHE_WRITE_KEY` (assente = solo lettura). Stato conferma/ignora in `RiconciliazioneAnagrafica`. `src/lib/riconciliazione-fic.ts`, `ficClientiFiscali()` |
| `/registrazioni/fatture` | **Elenco delle fatture reali emesse su Fatture in Cloud** (fonte: FIC, non il DB): numero, data, cliente, imponibile/IVA, stato incasso, link "Apri su FIC". Ricerca (cliente/numero) e filtro anno lato FIC. `ficFatture()` in `src/lib/fic.ts` |
| `/fic/emetti` | Emissione fattura commissioni su Fatture in Cloud (non inviata allo SDI; numero di ritorno) |
| `/fic/fattura?proforma=<id>` \| `?fattura=<id>` | **Emissione fattura vera su FIC** da una pro-forma (che passa a `fatturata`) o da una fattura servizi senza numero (che riceve numero ed emissione). Anteprima righe, cliente FIC preselezionato per somiglianza, scadenza; supporta più righe e aliquote ≠ 22% (mappate da `/info/vat_types`; se il permesso manca si ferma con messaggio esplicito invece di applicare l'IVA sbagliata) |
| `/solleciti/[id]` | Anteprima e invio sollecito di pagamento (SMTP o mailto) |
| `/impostazioni` | Ordinante SEPA, SMTP (Register.it), Qonto, Fatture in Cloud (Collega OAuth), accesso |
| `/impostazioni/stati` | **Regole degli stati del cliente**: soglie dello stato finanziario (materialità, fasce di scaduto, ritardo tollerato, storico) e dello stato analisi (mesi per «Nuovo»/«Dismesso»), con anteprima dell'effetto sui clienti di oggi e ripristino dei default. Vedi §7-bis |
| `/verifiche` | Gestione chiave API pubblica + documentazione + storico richieste |

Sidebar riducibile a icone (preferenza in localStorage). **Operatività**: Dashboard, Servizi a fatturazione, Vendite come vendor. **Registrazioni**: Fatture (elenco fatture reali da Fatture in Cloud, `/registrazioni/fatture`), Pro-forma e Riconciliazione clienti. **Ordini Shopify**: sezione a sé con `Orders` (`/ordini`) — gli ordini del sito non sono una registrazione come una fattura o una pro-forma, e da lì passa la quadratura degli incassi dell'e-commerce.

**Prestazioni**: le funzioni girano in `fra1` (Francoforte) accanto al Postgres Supabase — `vercel.json`. Prima erano su `iad1` (Washington) e ogni query attraversava l'Atlantico: era **quella** la causa della lentezza (2,3 s per le 4 query del riepilogo, con soli 2 ms di elaborazione). Se si tocca la regione o si migra il DB, tenerli nella stessa area.

## 7. API pubbliche (per gli altri progetti Deluxy)

Base `https://deluxy-partner.vercel.app`. Auth: header `X-API-Key: <chiave>` (unica, in `Impostazione.api.verificheKey`, gestita in `/verifiche`). Header facoltativo `X-App: <nome>` per lo storico. Ogni chiamata → tabella `RichiestaVerifica`. Rotte escluse dal middleware di sessione: `api/verifiche`, `api/fatture`, `api/proforma`, `api/tipologie`, `api/incassi`, `api/tasks`, `api/riepilogo-finanziario`, `api/clienti`, `api/cron`, `api/fic/callback`.

1. **`GET /api/verifiche?partner=<nome o id>`** → situazione finanziaria partner (venditeYtd, serviziFatturatiYtd, commissioniYtd, dovutoAlPartner, daIncassare, daBonificare, residuo, fattureAperte{numero,totaleIvato,scaduto}, debiti/crediti2025). `src/lib/verifica.ts`.
2. **`GET /api/fatture?numero=181/2026`** (o `?id=`) → stato pagamento fattura (`pagata`, `dataPagamento`, `scaduta`, `scadenza`, `competenza`, imponibile/aliquota/totale, tipologia, partner). Riconosce numeri raggruppati. `src/lib/verifica-fattura.ts`.
3. **`GET /api/tipologie?anno=2026`** (o `&mese=6`, o `&dal=1&al=6`, o `&stato=pagate|aperte`) → totali dei servizi a fatturazione **aggregati per tipologia** nel periodo: per ciascuna `imponibile`/`iva`/`totale`/`fatture`/`quota%`, più i `totali` complessivi. `src/app/api/tipologie/route.ts`.
4b. **`GET/POST/PATCH /api/tasks`** → attività finance condivise in rete. GET `?stato=&priorita=&partner=` (o `?id=`). POST (body `titolo`, `note?`, `priorita?`, `scadenza?`, `partner?`, `riferimento?`, `idEsterno?`) crea un task; con `idEsterno`+`X-App` è idempotente per `(origineApp, idEsterno)`. PATCH (body `id`, `stato`: aperto|in_corso|fatto). Modello `TaskFinance`; `src/app/api/tasks/route.ts`. Sezione UI `/tasks`.
4. **`GET /api/incassi?riferimento=PAY-2026-000123`** (o `?partner=<nome|id>`, `?dal=&al=&tipo=&direzione=`, `?origine=<tipo>:<id>`) → **pagamenti riconciliati** con riferimento univoco `PAY-<anno>-<n>`. Ogni incasso riconosciuto (ordine Shopify riconciliato, fattura servizi pagata, pagamento diretto eseguito, bonifico/incasso partner) genera un `Pagamento` idempotente per `(origineTipo, origineId)`; annullando la riconciliazione il pagamento viene rimosso. `registraPagamento`/`rimuoviPagamento` in `src/lib/pagamenti-rif.ts`, agganciati in `actions.ts`/`ordini-actions.ts`/`pagamenti-actions.ts`. `src/app/api/incassi/route.ts`.
6. **`GET /api/riepilogo-finanziario?partner=<nome|id>`** (`&anno=` facoltativo) → riepilogo per la card «Finance» delle altre app (Scout): `fatturato` (vendite vendor incasso lordo + servizi netto IVA, **YTD**), `fatturatoPrec` (stesso periodo anno prima), `variazionePct`, `mesi[]`/`mesiPrec[]` (12 valori gen→dic), `periodo{daMese,aMese}`. Riusa `riepilogoPartner`; risoluzione partner-per-nome come la pro-forma (404 con `candidati` se ambiguo). `src/app/api/riepilogo-finanziario/route.ts`.
5. **`GET /api/proforma?numero=1/2026`** (o `?id=`, o `?partner=<nome|id>&stato=…` per l'elenco) → dettaglio/elenco pro-forma con righe, totali, `stato` e `fatturaNumero`. **`POST /api/proforma`** (body JSON: `partner`, `righe[{descrizione, prezzoUnitario, quantita?, aliquotaIva?}]`, `data?`, `scadenza?`, `oggetto?`, `note?`) → crea una pro-forma **in bozza** con numero `PF n/anno` automatico; invio e annullo restano nell'app. **`PATCH /api/proforma`** (body JSON: `id` **o** `numero` es. `"1/2026"`, `fatturaNumero?`) → **conferma il pagamento** dalle altre app: la pro-forma passa a `fatturata` (con `fatturataIl` + eventuale n° fattura definitiva). Idempotente (già fatturata → 200 con `avviso`); 422 se annullata (riaprirla dall'app). Es. Scout può chiamarla quando segna un incasso ricevuto. `src/app/api/proforma/route.ts`.

7. **`GET /api/clienti/stato`** → **stati del cliente per tutte le app** (23/07/2026). Senza parametri torna l'elenco completo ordinato dal più a rischio; `?partner=<nome|id>` o `?anagraficaId=<id del registro Anagrafiche>` per uno solo; `?stato=insoluto,grave` filtra. Ogni cliente ha:
   - `statoAnalisi` = `{codice: "P.P."|"Nuovo"|"Dismesso"|null, attivo, calcolato, discordante, ultimoMovimento, motivo}` — `codice` è il campo scritto a mano (fonte di verità), `calcolato` è quello che risulta dai movimenti con le regole in vigore;
   - `statoFinanziario` = `{codice, etichetta, gravita 0-5, motivo, azione, esposizione, scaduto, aging{correnti,g1_30,g31_60,g61_90,oltre90,senzaScadenza}, giorniRitardoMax, ritardoMedioAperto, puntualitaPct, ritardoMedioStorico, fattureAperte, fattureScadute}`;
   - `condizioni{giorniPagamento, compensazione}` e `url` alla scheda; nell'elenco c'è anche `regole` = le soglie con cui gli stati sono stati calcolati, così chi consuma l'API sa cosa vuol dire «insoluto» oggi.
   Sola lettura. `src/app/api/clienti/stato/route.ts`. Gli stessi due stati (in forma sintetica) sono ora anche dentro `/api/riepilogo-finanziario`, così la card Finance di Scout non deve fare due chiamate.

Esiti: 200 trovato · 404 non trovato (con `candidati`) · 401 chiave errata · 400 parametro mancante. Auth condivisa in `src/lib/apiauth.ts`.

## 7-bis. Stato finanziario del cliente (credit management) — 23/07/2026

`src/lib/stato-credito.ts` è l'unica fonte: classifica ogni cliente come farebbe un CFO, su due dimensioni tenute separate.

**Aging dell'esposizione** (fatture servizi aperte, IVATE; le `compensata` non sono esposizione perché si chiudono contro il dovuto vendite): a scadere · 1-30 · 31-60 · 61-90 · oltre 90 giorni.

**Comportamento storico** (fatture già incassate degli ultimi 24 mesi): `puntualita` = quota di importo incassato entro scadenza, `ritardoMedioStorico` = giorni medi di ritardo pesati per importo.

**Stati** (`GRAVITA` 0→5, decide la fascia più vecchia con importo materiale):

| codice | etichetta | quando | badge |
|---|---|---|---|
| `nessuna` | Nessuna esposizione | niente di aperto | neutral |
| `regolare` | Regolare | tutto a scadere e storico puntuale | green |
| `monitorare` | Da monitorare | scaduto entro 30 gg **oppure** paga in media oltre 15 gg dopo la scadenza | gold |
| `ritardo` | In ritardo | scaduto 31-60 gg | orange |
| `grave` | Scaduto grave | scaduto 61-90 gg | red |
| `insoluto` | Insoluto | scaduto oltre 90 gg | purple |

Soglia di materialità **25 €**: sotto quella cifra uno scaduto non declassa il cliente — 17 € fermi da 90 giorni sono un residuo contabile, non un rischio. Ogni stato porta con sé `motivo` (perché) e `azione` (cosa farebbe un CFO domani: sollecito, rientro, blocco affidamento, messa in mora).

### Le condizioni si cambiano dall'app (niente codice) — `/impostazioni/stati`

**`src/lib/regole-stati.ts` è l'unico posto dove vivono le soglie**, salvate in `Impostazione` con chiavi `regole.credito.*` / `regole.analisi.*`; chiave assente = default (i valori qui sopra). Si modificano in **Impostazioni → Regole degli stati** (`src/app/impostazioni/stati/page.tsx`), che sotto ogni gruppo mostra **l'effetto reale sui clienti di oggi** (quanti clienti e quanto esposto per stato) e ha «Ripristina default». Cambiando una regola si invalidano le viste: elenco partner, scadenzario, scheda cliente e API.

- **Credito**: `materialita` (€), `fascia1`/`fascia2`/`fascia3` (giorni, tenute crescenti a forza), `ritardoTollerato` (giorni), `mesiStorico` (finestra dello storico).
- **Analisi (P.P./Nuovo/Dismesso)**: `mesiNuovo`, `mesiDismesso`. `src/lib/stato-analisi.ts` calcola lo stato **dai movimenti reali** (fatture servizi + vendite vendor) e lo confronta con il campo `Partner.clienteAnno` scritto a mano: **non lo sovrascrive**, segnala solo le differenze (tabella «Da rivedere» nella pagina regole, badge arancio nella scheda partner). ⚠️ Il ledger parte dal 2025: i clienti attivi da prima risultano «Nuovo» finché non si allarga lo storico.

Il motore (`stato-credito.ts`) accetta le regole come parametro e le legge dal DB se non passate: `schedaPartner(id, {regole})`, `schedeTutti({regole})`, `schedaCredito(fatture, oggi, regole)`.

Dove si vede: colonna **Credito** + **Scaduto** e filtro «Credito» in `/partner` (ordinabili), card **«Salute del credito»** nella scheda partner (`CreditoCard.tsx`), **Aging del credito** di portafoglio + «da lavorare per primi» in `/scadenzario`, e l'API `/api/clienti/stato`.

⚠️ Le fatture **senza data di scadenza** non entrano nell'aging e sono contate a parte (`senzaScadenza`): oggi sono una quota grossa del portafoglio, la card lo dice esplicitamente. Manca ancora: fido/limite di credito per cliente, DSO di portafoglio e storico dello stato nel tempo.

**API interne (NON per altri progetti, protette da login):** `/api/recap` (recap AI), `/api/sepa` (export bonifici pain.001 + CSV), `/api/fic/authorize`+`/api/fic/callback` (OAuth Fatture in Cloud).

### Saldo parziale delle fatture (23/07/2026)

Una fattura servizi non è più solo pagata/non pagata: si può incassare **un acconto** e gestire il **residuo** in tutta l'app. Nuovo campo `FatturaServizio.incassato` (IVA inclusa); saldata ⇒ `incassato = totale`, riaperta ⇒ `incassato = 0`.

- **Motore** (`calc.ts`): `residuoFattura(f) = pagata ? 0 : max(0, ivato − incassato)`, `incassatoFattura`, `parzialmenteIncassata`. `serviziNonPagati` ora somma il **residuo**, non tutto l'IVATO → dashboard, scadenzario, scheda partner, rolling e API riflettono i saldi parziali. Aging in `stato-credito.ts` idem.
- **Azione** `incassaFatturaParziale(id, fd)` (in `actions.ts`): è un INCASSO (entrata) → **niente codice di conferma**; se copre tutto il residuo chiama `segnaFatturaPagata(true)`, altrimenti aggiorna `incassato`, registra/aggiorna il riferimento `Pagamento` (importo = incassato totale) e allinea FIC.
- **Fatture in Cloud**: `ficAllineaIncassoParziale(numero, incassato, totale)` e `ficIncassaParzialePerId(ficId, importo)` riscrivono i `payments_list` come «parte paid / resto not_paid», così l'`amount_due` su FIC scende. `ficFatture` ora espone `residuo`/`incassato` (da `payments_list`).
- **UI**: form «Registra un incasso» (tutto o acconto) nella scheda fattura; colonna **Residuo** + «Incassa…»/«Salda tutto» in scadenzario, dashboard (fatture scadute) e **`/registrazioni/fatture`** (che scrive l'acconto direttamente su FIC); badge oro «Incassata in parte» / «Residuo …» nella scheda partner e nelle liste.

### RIMOSSA tutta la parte "pagamenti in uscita" (26/07/2026)

Decisione utente: i **pagamenti** (esecuzione/richiesta) si faranno in una **nuova app «transazioni»**, non in FINANCE. Rimossi:
- **Pagamenti diretti** (`/pagamenti`, modello `PagamentoDiretto`, SEPA del singolo pagamento, lettura AI dell'IBAN da foto): pagine, `pagamenti-actions.ts`, `lettura-iban.ts`, `LettoreBonifico.tsx`, `api/pagamenti/*`.
- **Approvazioni** (`/approvazioni`, modello `RichiestaPagamentoIn`, `api/richieste-pagamento`, `approvazioni-actions.ts`).
- **Conferma con codice via email** (`/conferma`, modello `ConfermaPagamento`, `conferme.ts`, `eseguiPagamentoDiretto`).

**Cosa resta (tracciamento, non esecuzione)**: il «Paga» dei bonifici ai partner e «Abbiamo pagato»/«Hanno pagato» sulla scheda partner **registrano subito** (senza codice) che il denaro è stato mosso in banca — l'uscita vera avviene fuori; il **costo fornitore** sugli ordini; la **«Richiesta di pagamento» sulla scheda ordine** (`RichiestaPagamentoOrdine`); il registro riferimenti `Pagamento` (`PAY-…`, `pagamenti-rif.ts`) e `pagamenti-core.ts` (solo `aggiornaPagamentoDaSaldo` + `eseguiBonificoMese`). SEPA di gruppo resta in `/saldi`.

### Registro modifiche / audit log (23/07/2026)

`/impostazioni/logs` elenca **chi ha cambiato cosa e quando**, con ricerca a testo libero (azione/partner/operatore/dettaglio) e filtri per **area** e **operatore**, paginato. Modello `RegistroModifica`; le voci si scrivono da `registra()` in `src/lib/registro.ts` — un helper che **non fa mai fallire l'azione** se il log va storto.

**Chi**: l'app entra con password di team, quindi di suo conosce solo il ruolo. Il **nome della persona** arriva dal Single Sign-On del Hub (il token porta `nome`, prima scartato): `/api/sso` ora lo salva nel cookie non-httpOnly `dp_utente`, che `attoreCorrente()` rilegge. Login a password → il cookie viene cancellato e l'azione risulta come «Accesso a password» / «Accesso sola lettura»; in locale senza password → «Sistema».

**Cosa è tracciato**: le mutazioni di valore in `actions.ts` (partner crea/modifica, fatture crea/modifica/elimina/saldata/compensata, vendite crea/modifica/elimina, fee, note e pagamenti del mese), `transazioni-actions` (riconciliazioni), `proforma-actions` (crea + cambio stato), `pagamenti-actions` (predisposto + eseguito), `tasks-actions` (crea + stato), regole degli stati e i salvataggi principali di Impostazioni. Per aggiungerne altre: importare `registra({azione, categoria, entita?, entitaId?, partner?, dettaglio?})` e chiamarla prima del `redirect`. **Non ancora tracciate**: alcune azioni minori (ignora/ripristina transazione, elimina task/pro-forma, Shopify, riconciliazione anagrafiche).

## 8. Integrazioni (stato)

- **Qonto** ✅ collegato (org DELUXY S.R.L., 2 conti). API terze parti a chiave (`qonto.*` nel DB). "Sincronizza da Qonto" in `/transazioni` scarica i movimenti completati (dedup per hash). **Sincronizzazione automatica**: cron Vercel `/api/cron/qonto` ogni notte alle 5 (`vercel.json`), protetto da `CRON_SECRET` (senza segreto → 503). Scarica soltanto: **nessuna registrazione automatica**, i match restano da confermare in `/transazioni`; data/ora dell'ultimo scarico in `qonto.ultimaSync`, mostrata in pagina. `src/lib/qonto.ts`, `src/lib/transazioni-actions.ts` (`scaricaMovimentiQonto`).
- **Fatture in Cloud** ✅ collegato (app "FINANCE", azienda "Deluxy srl", id 712328). OAuth con refresh automatico (`fic.*` nel DB). Emissione fatture commissioni non-SDI con numero di ritorno; lettura clienti e fatture. `src/lib/fic.ts`.
  **Stato incasso allineato app → FIC (23/07/2026)**: helper `ficAllineaStatoFattura()` + `ficIdDaNumero()` scrivono i `payments_list` del documento FIC (match per numero+anno, es. `"474/2026"`). Se FIC non è collegato o il numero non si trova, l'azione locale **non fallisce** (log `[fic]` e stato da allineare a mano dal pulsante in `/registrazioni/fatture`). Il verso opposto (saldata su FIC → saldata in app) resta da fare.
  **Rate limit (23/07/2026)**: FIC risponde **429 TOO_MANY_REQUESTS** quando si sfilano molte pagine di fila (l'elenco fatture 2026 sono 11 pagine da 50). `ficFetch` ora riprova fino a 3 volte su 429/503 rispettando `Retry-After` (attesa max 5s) e `ficFatture` mette 120 ms fra una pagina e l'altra; l'errore, se resta, arriva a video in italiano invece che come URL. Tipo `FicError` con `.stato`/`.troppeRichieste` per distinguerlo.

  Trappole dell'API risolte, non reintrodurle:
  - un pagamento `paid` **senza conto di saldo** → 422 «É necessario impostare il conto di saldo nel pagamento». Il conto si sceglie una volta con `ficContoSaldo()` (elenco conti, o in mancanza di scope il conto già usato su una fattura saldata) e resta in `Impostazione` **`fic.contoSaldo`** — oggi `642601` = **Qonto**. Per cambiarlo basta modificare quella riga.
  - leggere il documento con `?fields=payments_list` restituisce le scadenze **senza `due_date`**: riscrivendole si spostava la scadenza della fattura. Si legge il documento **intero** e si rimanda indietro anche l'`id` della scadenza, così si aggiorna la riga esistente.
  - ricerca in `/registrazioni/fatture`: `numeration` è la sigla della numerazione (qui vuota), quindi cercare "474" non trovava nulla → ora se la ricerca è numerica si filtra anche su `number`.

### Segnare pagata una fattura: un solo punto (23/07/2026)

`segnaFatturaPagata()` in `src/lib/actions.ts` è **l'unica funzione** che cambia lo stato di incasso di una fattura servizi, e aggiorna in un colpo solo: flag `pagata` + `dataPagamento`, incasso IVATO sul saldo del mese per i partner in **compensazione** (con storno pulito se si riapre), **registro Pagamenti**, **Fatture in Cloud**, cache di tutte le pagine. Ci passano tutti i modi di segnare pagato: pulsante «Saldata» (dashboard, `/fatture`, scheda partner, `/scadenzario`), spunta *pagata* nella scheda fattura (`updateFattura`, solo se cambia) e **riconciliazione di un movimento bancario** in `/transazioni` (`registraTransazioneFattura`). Prima queste due ultime strade scrivevano solo il flag: la fattura risultava saldata in app e ancora «Da incassare» su FIC (caso 474/2026 BERTELLI 4, 23/07/2026). **Non scrivere mai `pagata` a mano con Prisma: chiamare questa funzione.** `segnaFatturaCompensata()` riporta la fattura a «da incassare» anche su FIC.
- **OpenAI** ✅ Recap AI nella scheda partner (`/api/recap`, `src/lib/recap.ts`). **Note mensili** (`SaldoMensile.note`, una per partner-mese, si scrivono in fondo al blocco del mese): entrano nel prompt con la **data in cui sono state scritte** (`SaldoMensile.noteAggiornateIl`, aggiornata da `salvaNoteMese`) e il recap deve produrre una sezione «Note del mese» che le classifica **ANCORA VALIDA / SUPERATA / DA VERIFICARE** confrontandole coi numeri attuali (es. «rateizzazione concordata» ma il mese è pareggiato → superata, con proposta di riscrittura). Nel titolo del mese compare una **stellina «★ Nota»** (testo nel tooltip) e le note più vecchie di 90 giorni si aprono già espanse.
- **SMTP solleciti** (Register.it): preset `authsmtp.deluxy.it:587`, utente `smtp@deluxy.it`; **manca password + mittente** (da inserire in Impostazioni). `src/lib/mail.ts`.
- **Deluxy Anagrafiche** (lettura + scrittura mirata): card "Anagrafica dal registro centralizzato" nella scheda partner (`src/lib/anagrafiche.ts`, `AnagraficaCard.tsx`, campo `Partner.anagraficaId`). Il registro è la fonte di verità anagrafica; da qui si scrivono solo i campi di cui FINANCE è sorgente, su record già collegati: i dati fiscali/bancari confermati nella riconciliazione FIC e — dal **23/07/2026** — lo **stato analisi** dell'azienda, cioè «Cliente per l'anno» (`clienteAnno`: P.P. = pari perimetro, Nuovo, Dismesso → `statoAnalisi` pp/nuovo/dismesso, `statoAnalisiDaClienteAnno`). Parte a ogni salvataggio del partner (`updatePartner`) e c'è il travaso una-tantum `npm run sync:stato-analisi` (`-- --dry` per la prova a vuoto; aggancia per `anagraficaId`, poi nome esatto, poi insegna univoca, e salva il collegamento trovato). Chiave: `ANAGRAFICHE_WRITE_KEY` o, in mancanza, `ANAGRAFICHE_API_KEY` (che dal 20/07/2026 ha scrittura piena). Vedi `deluxy-anagrafiche/README.md`.
- **AI Mail** (lettura): card «Posta con il cliente» nella scheda partner (`src/lib/aimail.ts`, `MailPartnerCard.tsx`). Non ricostruisce nessuna regola di abbinamento: chiede ad AI Mail `GET /api/v1/messaggi?cliente=<anagraficaId o nome>&direzione=tutte&q=<testo>`, che usa la **stessa associazione mail↔cliente della sezione Clienti** (email esatte + domini non generici del registro Anagrafiche). Si passa l'`anagraficaId` quando il partner è collegato al registro, altrimenti il nome ripulito dalla ragione sociale fra parentesi. Ultimi 12 mesi, ricerca lato AI Mail con il parametro `?mail=` della scheda partner. Senza `MAIL_API_KEY`/`MAIL_UTENTE` la card non compare.
- **Vivid**: nessuna API pubblica → si usa l'export CSV in `/transazioni` (formato riconosciuto: Completed date, Counterparty name, Reference, Payment amount).

## 9. Modello dati (Prisma)

`Partner` · `TipologiaServizio` · `FatturaServizio` · `VenditaVendor` · `SaldoMensile` (chiusura mensile: extra, fattura commissioni, bonifico, note) · `TariffaPartner` (storico fee) · `TransazioneBancaria` (movimenti importati, hash univoco, stato nuova/registrata/ignorata) · `AssociazioneControparte` (regole controparte→partner per la riconciliazione, apprese) · `ProForma` + `ProFormaRiga` (pro-forma con righe; totali sempre calcolati dalle righe; `@@unique([anno, numero])`) · `Impostazione` (chiave/valore) · `RichiestaVerifica` (storico API) · `Forecast` (piano commerciale). Schema completo: `prisma/schema.prisma`.

## 10. Cosa manca / prossimi sviluppi

- **SMTP**: inserire password casella + mittente in Impostazioni per attivare l'invio solleciti dall'app (oggi solo mailto).
- **IBAN partner**: nell'Excel non c'erano → l'export SEPA li segnala mancanti; vanno inseriti nelle schede.
- **Fatture in Cloud**: sync automatico incassi (fattura pagata su FIC → saldata in app) e pagina di verifica FIC↔app permanente; emissione automatica in blocco delle commissioni a chiusura mese.
- **Sicurezza**: login a password unica; per il team servono utenze/ruoli con audit (Fase D). Ruotare le chiavi passate in chat (OpenAI, Qonto secret, FIC secret, chiave API `/verifiche`).
- **Open banking (PSD2)**: aggregatore per coprire anche banche senza API (es. Vivid) in automatico.
- **API pubbliche**: candidati — stato bonifico partner/mese, elenco fatture aperte di un partner, scadenze entro una data.

## 11. Note operative per chi riprende

- **Branch condiviso**: `scout-ui` ospita anche lavoro di altre sessioni (deluxy-mail, deluxy-scout, e parte anagrafiche di deluxy-partner). Committare **solo i file di deluxy-partner** che si toccano; non fare `git add -A`.
- **Deploy = push**: dopo `vercel --prod`, committare e `git push origin scout-ui`. Ogni deploy invalida i bottoni delle pagine già aperte (server action mismatch): ricaricare.
- **Verifica reale**: typecheck + prova nel browser/endpoint con dati veri prima di dire "fatto". Ripulire sempre i dati di test dal DB di produzione.
- **Regole Deluxy** (CLAUDE.md di repo): handoff+doc aggiornati a ogni commit, commit spesso verificati, no segreti in git, conferma azioni esterne, esito reale.
