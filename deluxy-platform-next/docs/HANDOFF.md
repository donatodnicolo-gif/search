# HANDOFF — deluxy-platform-next

> Documento vivo per riprendere il lavoro da una finestra nuova **senza contesto pregresso**.
> Va aggiornato a ogni tappa e prima di fermarsi (vedi [REGOLE-DI-LAVORO.md](REGOLE-DI-LAVORO.md)).

**Ultimo aggiornamento:** 17 luglio 2026
**Branch:** `deluxy-scout` · **Remote:** `origin` = https://github.com/donatodnicolo-gif/search.git
**Working dir:** `C:\Users\nicol\app\deluxy-platform-next`

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
- **Servizi** (`/services/new`): nome, tipo (vendita/prezzo fisso/a ora/magazzino/aziendale), **scelta Partner/Valet**; le tariffe si impostano nelle schede partner/valet. Backend: `ServiceType.scope` + `deliveryPrice` (magazzino). **Sezione Setup prenotazione**: `noticeDays` (giorni preavviso), `slotHours` (fascia 1/2/4 ore), `minOrderTime`/`maxOrderTime` (ora min/max inserimento giornaliero), `allowFlexibleTime` (**Consenti fascia oraria flessibile**, migrazione `service_allow_flexible_time`).
- **Calcoli** (`/calcoli` + modulo `api/src/calculations`): tutte le formule di prezzo centralizzate, con endpoint `POST /calculations/preview` e pagina con calcolatori live. Verificate: vendita, prezzo fisso (in/fuori città), a ora, magazzino. (Da confermare: prezzo fisso fuori città somma o no il valore base — vedi doc 7-bis.)
- **Consegna — fasce orarie** (17/07): il flag "Fascia oraria consegna flessibile" appare **solo se il servizio lo consente** (`allowFlexibleTime`); la fascia automatica di consegna dura **`slotHours` del servizio** (default 1 ora); se il servizio ha min+max+fascia compilati le fasce sono **proposte come elenco generato** (es. 08–10 … 18–20). Il ritiro resta a fascia di 1 ora (`pickupFlexible` sempre disponibile). Demo: servizio "Consegna prezzo fisso" seedato con fasce 2h 08–20 e flessibile consentito (il seed aggiorna il setup anche su DB già popolati).
- **Consegna — Gestione ordine**: ogni prodotto mostra il **prezzo** e ha il flag **Prezzo flessibile** che consente di modificarlo (precompilato col prezzo base). Salvato su `DeliveryProduct.price`+`flexiblePrice`.
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
7-bis. **Da confermare con l'utente/app reale**: la semantica di `minOrderTime`/`maxOrderTime` — oggi usati sia come limite di inserimento (testo nel form Servizi) sia come intervallo di **generazione fasce di consegna** (elenco 08–10… nel form Consegna). Verificare su app.deluxy.it quale delle due (o entrambe) è quella vera.
8. **In pausa**: analisi multi-agente del vecchio codice (cosa fa ogni funzione + come aggiornarla).

## Note operative (IMPORTANTI per una nuova sessione)

- ⚠️ **Una sola sessione Claude per questa cartella** (regola 4): due sessioni sulla stessa working dir si sovrascrivono branch e lavoro non committato. Se serve lavorare in parallelo, usare un **git worktree** isolato (cartella + branch dedicati).
- **Push pre-autorizzato** (utente, 15/07: "si sempre"): dopo ogni commit, pushare su `origin/deluxy-scout` **senza chiedere conferma ogni volta** (menzionarlo soltanto). Restano da confermare: deploy, invii, cancellazioni.
- **Regola d'oro UI**: ogni form/schermata va **verificato campo-per-campo contro l'app reale** app.deluxy.it (sessione admin) prima di dirlo finito; integrare le scoperte nel manuale; se un campo ha semantica dubbia, **chiedere all'utente**.
- Token demo a scadenza breve: durante i test la sessione web può saltare — rifare login.
- Le migrazioni Prisma vanno create con l'API server **fermo** (lock del query engine su Windows): `preview_stop` o chiudere `npm run dev:api`, poi `npx prisma migrate dev --name ...`.
- Dopo ogni modifica al `.md`: `npm run doc:word` per rigenerare il Word, e committarlo.
- Tutto il lavoro è sul branch `deluxy-scout` (non `main`). Consolidamento su `main` via PR quando deciso.
- Ultimo commit pushato: `0a71e45` (sezione Setup servizio).
