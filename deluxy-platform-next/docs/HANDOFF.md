# HANDOFF — deluxy-platform-next

> Documento vivo per riprendere il lavoro da una finestra nuova **senza contesto pregresso**.
> Va aggiornato a ogni tappa e prima di fermarsi (vedi [REGOLE-DI-LAVORO.md](REGOLE-DI-LAVORO.md)).

**Ultimo aggiornamento:** 16 luglio 2026
**Branch:** `platform-delivery-slots` (worktree isolato, basato su `deluxy-scout`) · **Remote:** `origin` = https://github.com/donatodnicolo-gif/search.git
**Working dir:** `C:\Users\nicol\app\.claude\worktrees\platform-slots\deluxy-platform-next` (worktree) — da consolidare su `deluxy-scout`

> ⚠️ **Perché un worktree separato (16/07):** un'altra sessione stava cambiando branch nel worktree principale `C:\Users\nicol\app` (regola 4), rischiando di sovrascrivere il lavoro. Questo lavoro è stato spostato in un worktree isolato (`.claude/worktrees/platform-slots`, branch `platform-delivery-slots`). I preview server dell'harness sono pinnati a `C:\Users\nicol\app`: per servire questo worktree i dev server girano via Bash (npm run dev:api / dev:web) sulle porte 3000/4200. Il DB dev (`api/prisma/dev.db`) e `api/.env` sono copie locali del worktree.

## Come riprendere (avvio rapido)

```bash
cd C:\Users\nicol\app\deluxy-platform-next
npm install
npm run prisma:migrate   # DB dev SQLite (api/prisma/dev.db)
npm run seed             # dati demo (idempotente)
npm run dev:api          # http://localhost:3000/api/v1  — Swagger: /api/docs
npm run dev:web          # http://localhost:4200
# Login demo: admin@deluxy.it / Deluxy2026!  (anche operation@, fioraio@, pasticceria@, valet1@, valet2@)
```

Preview server (Claude): config in `.claude/launch.json` → `deluxy-next-api`, `deluxy-next-web`.

## Fonti di verità (leggere prima di lavorare)

- **Funzionale:** [COME-FUNZIONA-APP-DELUXY.md](COME-FUNZIONA-APP-DELUXY.md) — manuale completo, va aggiornato a **ogni commit** che cambia il comportamento. Dopo averlo modificato, rigenerare il Word: `npm run doc:word` → `docs/COME-FUNZIONA-APP-DELUXY.docx`.
- **Design:** `../../deluxy-design-system/DESIGN-SYSTEM.md` (stile Apple, obbligatorio per la UI).
- **Backend reale:** [ANALISI-BACKEND-LEGACY.md](ANALISI-BACKEND-LEGACY.md) (NestJS+TypeORM+MySQL, 76 entità).
- **Sync ordini:** [INTEGRAZIONE-WOOCOMMERCE-SYNC.md](INTEGRAZIONE-WOOCOMMERCE-SYNC.md).

## FATTO

- **Scaffold**: monorepo npm workspaces — `api/` (NestJS 11, Node 22, Prisma, JWT+ruoli, Swagger) + `web/` (Angular 19 standalone, PWA-ready). Docker compose.
- **Design System v1.0** applicato (sidebar traslucida, pill, token in `web/src/styles.css`); UI in stile Apple.
- **Sidebar mobile**: drawer a scomparsa con hamburger + overlay (sotto 800px).
- **Menu**: sezioni Operatività · **Utenti** (Partner/Valet/Clienti/Operatori) · Catalogo (Prodotti) · Amministrazione · Configurazione (con "Utenti e ruoli").
- **Form di creazione fatti e verificati end-to-end**:
  - **Partner** (`/partners/new`): 7 sezioni riorganizzate, indirizzi di ritiro multipli, pagamenti+fatturazione, setup (magazzino/sicurezza/notifiche), WooCommerce key.
  - **Valet** (`/valets/new`): P.IVA, stipendio (frequenza+limite), province, servizi (con vincolo 1 ora+1 fisso), team leader (province+partner), mezzo, notifiche.
  - **Nuova consegna** (`/deliveries/new`): scelta servizio, data/ritiro, assegnazione, destinatario+mittente, prodotti, listino (da fatturare/pagare), documentazione+note.
  - **Operatori** (`/operators/new`): anagrafica + **ruolo operatore** (operation/finance/project_manager/customer_service) + notifiche.
  - **Categorie** (`/categories/new`): nome, note, AI prompt, campi extra (opzionale/obbligatorio/admin), sconti % per provincia.
  - **Prodotti** (`/products/new`): nome, categoria, tipo (unico/non-unico/superprodotto), partner, SKU, prezzo/prezzo pubblico, giorni prep., immagine, plus, descrizione, campi personalizzati, componenti superprodotto.
- **Menu**: sezione **Prodotti** (Prodotti + Categorie); **Amministrazione** ora include **Servizi** e **Calcoli**.
- **Servizi** (`/services/new`): nome, tipo (vendita/prezzo fisso/a ora/magazzino/aziendale), **scelta Partner/Valet**; le tariffe si impostano nelle schede partner/valet. Backend: `ServiceType.scope` + `deliveryPrice` (magazzino). **Sezione Setup prenotazione**: `noticeDays` (giorni preavviso), `slotHours` (fascia 1/2/4 ore — da rendere variabile), `minOrderTime`/`maxOrderTime` (ora min/max inserimento giornaliero). Da usare più avanti per le regole di richiesta servizio.
- **Calcoli** (`/calcoli` + modulo `api/src/calculations`): tutte le formule di prezzo centralizzate, con endpoint `POST /calculations/preview` e pagina con calcolatori live. Verificate: vendita, prezzo fisso (in/fuori città), a ora, magazzino. (Da confermare: prezzo fisso fuori città somma o no il valore base — vedi doc 7-bis.)
- **Consegna — fasce orarie**: consegna e ritiro mostrano *dalle–alle* solo col flag "flessibile"; altrimenti si sceglie un orario e la fascia è **automatica di 1 ora** (`deliveryFlexible`/`pickupFlexible`; il "to" = orario+1h calcolato al submit).
- **Consegna — Gestione ordine**: ogni prodotto mostra il **prezzo** e ha il flag **Prezzo flessibile** che consente di modificarlo (precompilato col prezzo base). Salvato su `DeliveryProduct.price`+`flexiblePrice`.
- **Consegna — fascia consegna a tendina + ordine/dipendenze campi (16/07)**: nel form consegna **Servizio** è il 1° campo e **Indirizzo** il 2°; la **Data** ha min/default = oggi + `noticeDays`. Quando la consegna non è flessibile si sceglie una **fascia predefinita a tendina** (da `minOrderTime` a `maxOrderTime`, default 06:00–22:00, passo `slotHours`); il flag "flessibile" della consegna appare solo se il servizio ha `allowFlexibleTime` (nuovo campo `ServiceType`, con migrazione `20260715154057_service_allow_flexible_time`). Il **ritiro** resta invariato. Dall'indirizzo si deduce la **provincia** e si mostrano **solo partner/valet con quella provincia** e **solo partner col tipo di servizio abilitato** (novità). Verificato end-to-end nel browser (MI/MB, filtro servizio, avvisi). Doc + Word aggiornati.
- **Form allineati campo-per-campo all'app reale** (15/07): Prodotto (varianti, multi-partner, piattaforme, flag), Partner (PEC, promemoria, tipo codice consegna, KM partner), Consegna (Vendita Deluxy, prezzo flessibile, valet servizio, da fatturare/pagare, smsPhoneNo, file DDT). Valet/Operatore/Categoria già allineati.
- **Convenzioni form** (tutti i form di creazione): tasto **Duplica** in fondo — salva e mantiene i valori compilati per creare rapidamente un altro record (banner verde di conferma). Lo **SKU dei prodotti è automatico** (`DXY-NNNNN`, progressivo, rigenerato a ogni creazione/duplicazione).
- **Liste reali** (dati da API): consegne, partner, valet, operatori.
- **Backend moduli**: auth, deliveries, partners, valets, products, customers, users, service-types, provinces, categories, operations, woocommerce (endpoint pubblico), + stub degli altri.
- **Analisi backend legacy** e **scaffolding connessione DB in sola lettura** (`api/.env.legacy.example`, `api/prisma/legacy-readonly-user.sql`).
- Tutto **pushato** su `origin/deluxy-scout`.

## MANCA / PROSSIMI PASSI

1. **[BLOCCATO — palla all'utente] Connessione al DB di produzione (MySQL, sola lettura)**: servono i 5 valori `MYSQL_*` (o replica) + raggiungibilità/tunnel. Vedi ANALISI-BACKEND-LEGACY. Poi `prisma db pull` per lo schema reale.
2. **Allineare l'endpoint WooCommerce** al contratto reale: `POST /api/deliveries/sync/woo-order`, header `x-deluxy-partner-key`, payload+risposta identici (oggi usa `x-api-key` e `/woocommerce/orders`).
3. **Form di MODIFICA** (oggi c'è solo la creazione): partner, valet, operatore, consegna.
4. **Applicare la visibilità per ruolo operatore** al login (Finance vede Amministrazione, PM no Operatività, Customer Service no Amministrazione) — richiede auth reale che porti `operationRole` nel token e sidebar che filtri.
5. **Autenticazione reale** contro il DB: mapping `extraId`/`extraType` → partner/valet/operation.
6. **Sezioni ancora stub**: Attività, Vendite, Prodotti, Clienti (creazione), Stipendi, Pagamenti, Regole carnet, Finanza, Modelli SMS, Disponibilità, Province, Utenti/ruoli.
7. **Rifiniture**: nel form valet rendere Telefono/Indirizzo obbligatori e CF sempre richiesto (come app reale).
8. **In pausa**: analisi multi-agente del vecchio codice (cosa fa ogni funzione + come aggiornarla).

## Note operative (IMPORTANTI per una nuova sessione)

- ⚠️ **Una sola sessione Claude per questa cartella** (regola 4): due sessioni sulla stessa working dir si sovrascrivono branch e lavoro non committato. Se serve lavorare in parallelo, usare un **git worktree** isolato (cartella + branch dedicati).
- **Push pre-autorizzato** (utente, 15/07: "si sempre"): dopo ogni commit, pushare su `origin/deluxy-scout` **senza chiedere conferma ogni volta** (menzionarlo soltanto). Restano da confermare: deploy, invii, cancellazioni.
- **Regola d'oro UI**: ogni form/schermata va **verificato campo-per-campo contro l'app reale** app.deluxy.it (sessione admin) prima di dirlo finito; integrare le scoperte nel manuale; se un campo ha semantica dubbia, **chiedere all'utente**.
- Token demo a scadenza breve: durante i test la sessione web può saltare — rifare login.
- Le migrazioni Prisma vanno create con l'API server **fermo** (lock del query engine su Windows): `preview_stop` o chiudere `npm run dev:api`, poi `npx prisma migrate dev --name ...`.
- Dopo ogni modifica al `.md`: `npm run doc:word` per rigenerare il Word, e committarlo.
- Il lavoro base è sul branch `deluxy-scout`; **questa tappa è sul branch/worktree isolato `platform-delivery-slots`** (pushato su `origin/platform-delivery-slots`). **Da consolidare su `deluxy-scout`** (merge/PR) quando l'altra sessione ha smesso di toccare `C:\Users\nicol\app`. Consolidamento finale su `main` via PR quando deciso.
- Ultimo commit pushato: `dce97f8` su `origin/platform-delivery-slots` (fascia consegna a tendina + ordine campi + filtro provincia/servizio).
