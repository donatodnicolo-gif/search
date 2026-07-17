# HANDOFF — deluxy-platform-next

> Documento vivo per riprendere il lavoro da una finestra nuova **senza contesto pregresso**.
> Va aggiornato a ogni tappa e prima di fermarsi (vedi [REGOLE-DI-LAVORO.md](REGOLE-DI-LAVORO.md)).

**Ultimo aggiornamento:** 17 luglio 2026
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
- **Multilingua (16/07)**: nuovo frontend internazionalizzato con **ngx-translate** (IT default + **EN**). Selettore a **bandierine SVG** fisso in alto a destra (anche sul login), scelta persistita in `localStorage`. Tradotti shell/menu + login; traduzioni in `web/public/i18n/{it,en}.json` (resto incrementale). ⚠️ Aggiunta dipendenza `@ngx-translate/core`+`http-loader` col dev server attivo → può servire un **riavvio pulito del web** (kill 4200 + `dev:web`, eventualmente `rm -rf web/.angular/cache`) per evitare errori Vite di deps disallineate.
- **Consegna — flag "Salva come nuovo cliente in Clienti" (16/07)**: se il destinatario è nuovo, alla creazione della consegna il cliente viene prima salvato in Clienti (`POST /customers`) e poi si crea la consegna collegata. Verificato end-to-end.
- **Servizio + Valet — rifiniture form (16/07)**: nel **Servizio** ora **Ora min/max di inserimento** sono tendine 00:00–23:00. Nel **Valet**: luogo/data nascita sempre visibili; con P.IVA compare solo la P.IVA (spariscono CF e % ritenuta), senza P.IVA compaiono CF\* + % ritenuta; IBAN spostato in **Stipendio**. Selettori province/partner (competenza + team leader) convertiti in **tendina "aggiungi" + chip rimovibili**; aggiunta lista **Partner esclusi** del team leader (`teamLeaderExcludedPartners`, migrazione `20260715222752`). Doc: *partner magazzino* = stock prodotti del cliente monitorato; *% ritenuta* = % rimborso spese per ricevuta fiscale sul totale servizi. (Categorie/province partner erano già multi-select.) Tutto verificato nel browser + create API.
- **Consegna — fascia consegna a tendina + ordine/dipendenze campi (16/07)**: nel form consegna **Servizio** è il 1° campo e **Indirizzo** il 2°; la **Data** ha min/default = oggi + `noticeDays`. Quando la consegna non è flessibile si sceglie una **fascia predefinita a tendina** (da `minOrderTime` a `maxOrderTime`, default 06:00–22:00, passo `slotHours`); il flag "flessibile" della consegna appare solo se il servizio ha `allowFlexibleTime` (nuovo campo `ServiceType`, con migrazione `20260715154057_service_allow_flexible_time`). Il **ritiro** resta invariato. Dall'indirizzo si deduce la **provincia** e si mostrano **solo partner/valet con quella provincia** e **solo partner col tipo di servizio abilitato** (novità). Verificato end-to-end nel browser (MI/MB, filtro servizio, avvisi). Doc + Word aggiornati.
- **Form allineati campo-per-campo all'app reale** (15/07): Prodotto (varianti, multi-partner, piattaforme, flag), Partner (PEC, promemoria, tipo codice consegna, KM partner), Consegna (Vendita Deluxy, prezzo flessibile, valet servizio, da fatturare/pagare, smsPhoneNo, file DDT). Valet/Operatore/Categoria già allineati.
- **Convenzioni form** (tutti i form di creazione): tasto **Duplica** in fondo — salva e mantiene i valori compilati per creare rapidamente un altro record (banner verde di conferma). Lo **SKU dei prodotti è automatico** (`DXY-NNNNN`, progressivo, rigenerato a ogni creazione/duplicazione).
- **Liste reali** (dati da API): consegne, partner, valet, operatori.
- **Backend moduli**: auth, deliveries, partners, valets, products, customers, users, service-types, provinces, categories, operations, woocommerce (endpoint pubblico), + stub degli altri.
- **Analisi backend legacy** e **scaffolding connessione DB in sola lettura** (`api/.env.legacy.example`, `api/prisma/legacy-readonly-user.sql`).
- Tutto **pushato** su `origin/deluxy-scout`.

### 17/07/2026 — multilingua completo, dettagli+modifica ovunque, azioni consegne, filtri/ordinamenti

- **Multilingua esteso a tutta l'app**: tradotte le schermate centrali (liste + tutti i form). `web/public/i18n/{it,en}.json` → **~775 chiavi, IT/EN allineate** (verificato con confronto automatico dei path). Restava solo shell+login.
- **Sidebar collassabile** (desktop): pulsante riduci/espandi, solo icone, stato persistito in `localStorage`; su mobile resta il drawer.
- **Consegne — lista**: colonna **Stato come primo campo, solo pallino colorato** (nome nel tooltip) + **legenda colori** sopra la tabella; colonna **Consegna** con l'orario; il **Servizio è un'icona** per tipo. ⚠️ **Colori allineati all'app reale** (Da gestire=**rosso**, In gestione=giallo, In preparazione=arancione, Accettata=blu, In consegna=viola, Richiesta annullamento=azzurro) — prima erano diversi.
- **Convenzione: click sulla riga → Dettaglio** (niente bottone "Dettagli") in **tutte** le sezioni; accessibile da tastiera (Tab+Invio). I bottoni azione non attivano la riga.
- **Pagine di Dettaglio nuove**: consegna, partner, cliente, valet, prodotto, categoria, servizio, operatore.
- **Form di MODIFICA** per tutte le sezioni (riusano il form di creazione: rotta `/<sez>/:id/edit`, precompilato, salva in PUT — **PATCH per gli operatori** —, niente "Duplica").
- **Sezione Clienti creata da zero** (era uno stub): lista + form + dettaglio con le consegne del cliente.
- **Consegne — azioni di riga**: **Modifica** (regola: il partner solo se stato `created` e servizio ≠ VENDITA, **applicata lato server**), **Assegna** (pop-up coi valet della provincia della consegna), **Additional valet +/-** (plus/minus su `valetAdditionalPrice`), **Monitorare** (link **pubblico** `/tracking/<token>` senza login).
- **Prodotti — allineamento all'app reale**: tipo come **flag** (Prodotto unico / Super prodotto), partner aggiuntivi gated dietro *Visible to other partners*, Plus obbligatorio, sezione **Shopify** (Approvato/Attivo/Not physical + piattaforme + descrizione per piattaforma + galleria immagini), **varianti ricche** (SKU **auto progressivo** `<SKU>-NN`, giorni prep., prezzo, prezzo pubblico, stock, **immagine per variante**).
- **Filtri e ordinamenti (iniziato)**: contratto comune in `api/src/common/list-query.ts` → `?q=&sort=&dir=&page=&pageSize=` con risposta **`{ items, total, page, pageSize }`**. `q` = **ricerca globale** su tutti i campi testuali (anche di relazione, es. `category.name`); `sort` con **whitelist** per risorsa; `pageSize` default 50, max 500; data/ora con filtri propri (`dateFrom`/`dateTo`). **Applicato ai Prodotti** (API + lista con intestazioni ordinabili, ricerca con debounce, paginazione) e verificato E2E.

**Fix (erano bug reali, non regressioni):**
- `PUT /deliveries/:id` era vietato al partner → la regola di modifica non sarebbe mai stata applicabile.
- `AssignValetDto.valetId` non aveva decoratore di validazione → il ValidationPipe (whitelist) lo scartava e **l'assegnazione andava in 500**.
- `update()` delle consegne **scartava i prodotti** (e gli indirizzi di ritiro).
- `GET /customers/:id` non restituiva le consegne del cliente.
- **Svuotare una collezione in modifica non la cancellava** (i form omettevano gli array vuoti): ora in edit si inviano sempre, anche vuoti.
- `pickupAddresses` del partner è una **stringa JSON**, non un array (il prefill lo gestisce).

**API aggiunte perché mancanti:** `GET/PUT /categories/:id`, `GET/PUT /service-types/:id`, `GET /operations/:id`, `GET /deliveries/:id/tracking-link`, `GET /deliveries/tracking/:token` (**pubblico**).
**Migrazioni:** `product_variant_rich_images_platformdesc`, `product_variant_image`, `delivery_tracking_token`.

## MANCA / PROSSIMI PASSI

1. **[BLOCCATO — palla all'utente] Connessione al DB di produzione (MySQL, sola lettura)**: servono i 5 valori `MYSQL_*` (o replica) + raggiungibilità/tunnel. Vedi ANALISI-BACKEND-LEGACY. Poi `prisma db pull` per lo schema reale.
2. **Allineare l'endpoint WooCommerce** al contratto reale: `POST /api/deliveries/sync/woo-order`, header `x-deluxy-partner-key`, payload+risposta identici (oggi usa `x-api-key` e `/woocommerce/orders`).
3. ~~**Form di MODIFICA**~~ → **FATTO il 17/07** per tutte le sezioni (vedi FATTO).
2-bis. ~~Form **Prodotti**: comportamento dei flag dell'app reale~~ → **FATTO il 17/07**: osservato dal vivo su app.deluxy.it (l'utente ha fatto il login; Claude non inserisce credenziali) e replicato. Semantica dei campi ora nel manuale (§3.6).
3-bis. ~~**Traduzione incrementale**~~ → **FATTO il 17/07**: tutte le schermate tradotte (~775 chiavi IT/EN allineate).
4. **Applicare la visibilità per ruolo operatore** al login (Finance vede Amministrazione, PM no Operatività, Customer Service no Amministrazione) — richiede auth reale che porti `operationRole` nel token e sidebar che filtri.
5. **Autenticazione reale** contro il DB: mapping `extraId`/`extraType` → partner/valet/operation.
6. **Sezioni ancora stub**: Attività, Vendite, Stipendi, Pagamenti, Regole carnet, Finanza, Modelli SMS, Disponibilità, Province, Utenti/ruoli. *(Clienti non è più stub: fatto il 17/07.)*
9. ~~**Filtri/ordinamenti**~~ → **FATTO il 17/07** su tutte le liste, con **due strategie decise in base al volume**:
   - **Server-side** (`api/src/common/list-query.ts`, risposta `{items,total,page,pageSize}`): **Prodotti** (8.503 in prod), **Consegne**, **Clienti** (4.092). Ricerca globale `q` in AND con lo scope di ruolo, sort su whitelist, paginazione 10–500 (default 50).
   - **Client-side** (`web/src/app/core/client-table.ts`): **Partner, Valet, Categorie, Servizi, Operatori** — liste piccole (≤243) usate soprattutto come tendine nei form: la conversione server-side avrebbe rotto ~14 punti di chiamata senza dare valore. Queste API restano array.
   - ⚠️ **Regola per il futuro**: se una lista cresce, spostarla su server-side e aggiornare **tutti** i consumatori (leggere `.items`, passare `pageSize=500` per le tendine).
9-bis. **Tendina "Cliente esistente" nel form consegna**: carica `pageSize=500`, ma in produzione i clienti sono **4.092** → la tendina è **parziale**. Va sostituita con una **ricerca mentre si scrive** (usa `GET /customers?q=`). Stesso discorso, meno urgente, per i prodotti nel form consegna (8.503, `pageSize=500`).
10. **⚠️ Ricerca case-insensitive su PostgreSQL**: in SQLite (dev) `contains` → `LIKE`, già case-insensitive; su **Postgres (produzione) `LIKE` è case-sensitive** → servirà `mode: 'insensitive'` in `textSearch()`, altrimenti la ricerca globale si comporterà diversamente in produzione.
11. **Image manager Shopify e descrizione per piattaforma**: la parte dati/form c'è (URL multipli + descrizione per piattaforma); manca l'**upload/sincronizzazione reale su Shopify** (stub).
12. **`trackingToken` senza vincolo unique**: in SQLite avrebbe richiesto una migrazione interattiva con rebuild tabella; il token è casuale a 24 byte e la ricerca usa `findFirst`. **In PostgreSQL aggiungere l'indice unique.**
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
- Ultimo commit pushato: `02457e2` su `origin/platform-delivery-slots` (multilingua IT/EN con selettore a bandierine + flag "salva cliente" nel form consegna).
