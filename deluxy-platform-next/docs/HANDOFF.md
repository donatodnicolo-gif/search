# HANDOFF — deluxy-platform-next

> Documento vivo per riprendere il lavoro da una finestra nuova **senza contesto pregresso**.
> Va aggiornato a ogni tappa e prima di fermarsi (vedi [REGOLE-DI-LAVORO.md](REGOLE-DI-LAVORO.md)).

**Ultimo aggiornamento:** 18 luglio 2026
**Branch:** `deluxy-scout` · **Remote:** `origin` = https://github.com/donatodnicolo-gif/search.git
**Working dir:** `C:\Users\nicol\app\deluxy-platform-next`

> ℹ️ **17/07: `platform-delivery-slots` è stato fuso in `deluxy-scout`** (questa cartella). Il worktree `.claude/worktrees/platform-slots` (porte 3000/4200) era l'ambiente isolato di quel lavoro: se la sessione lì è ancora attiva, deve ripartire da `deluxy-scout` aggiornato per non divergere di nuovo.

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
- **Seed — setup prenotazione demo** (17/07): "Consegna prezzo fisso" seedato con fasce 2h 08:00–20:00 e flessibile consentito; il seed applica il setup **anche su DB già popolati** (prima usciva subito se esistevano consegne). Le fasce a tendina/flessibile del form consegna sono descritte più sotto (16/07).
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
- Pushato su `origin/deluxy-scout` fino a `2caa7cc`; i commit del 17/07 (fusioni comprese) sono **in attesa di push** (vedi nota in fondo).

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

### 17/07/2026 (sera) — Impostazioni admin + geocodifica Google + tendina ora ritiro

- **Configurazione → Impostazioni** (`/settings`, solo ADMIN): chiavi API dei servizi esterni salvate **solo nel DB** (`AppSetting`, migrazione `20260717143057_app_settings`; `GET/PUT /settings` admin). Prima chiave: **Google Maps** (campo mascherato con Mostra/Nascondi + tester "Prova geocodifica"). ⚠️ Regola 3 rispettata: nessuna chiave in file/commit — la inserisce l'utente nella pagina.
- **Geocodifica indirizzo consegna**: `GET /settings/geocode?address=` (tutti i ruoli autenticati) chiama Google Geocoding con la chiave salvata e restituisce `provinceCode` (`administrative_area_level_2`). Il form consegna la usa con **debounce 700ms** dopo la digitazione; se trova la provincia vince sul riconoscimento testuale, che resta il **fallback** senza chiave/errore. Verificato: senza chiave → messaggio dedicato; con chiave finta → REQUEST_DENIED gestito.
- **Ora ritiro a tendina**: 00:00–23:30 a passi di 30 min (un orario fuori griglia salvato in precedenza viene aggiunto alla lista in modifica).

### 17/07/2026 (sera 2) — Gestione utenti: stati, invito, revoca immediata, audit

- **`User.status`** (`invited|active|suspended|archived`) al posto di `User.active` (migrazione `20260717150000_user_status_invite_audit`, scritta a mano per preservare i 6 utenti demo come `active`). Accesso separato dall'operatività dell'anagrafica.
- **Invito**: creando Partner/Valet/Operatore si crea/collega l'utente in stato `invited` con token a scadenza (7 gg). Pagine pubbliche `GET /auth/invite/:token` + `POST /auth/accept-invite` (la persona sceglie la password → account attivo + auto-login). Provisioning in `UsersService.provisionForAnagrafica`, chiamato da partners/valets/operations service (moduli ora importano `UsersModule`).
- **Revoca immediata**: `JwtAuthGuard` verifica `status==='active'` sul DB a ogni richiesta (prima controllava solo la firma → un utente disattivato entrava fino a 8h). Verificato: sospendendo valet2, `/auth/me` col suo token dà subito 401.
- **Pagina Utenti** (`/users`, era stub): lista con stato/ruolo/anagrafica + azioni `PATCH /users/:id/status` (attiva/sospendi/archivia), `POST /users/:id/resend-invite` (ritorna il token → il client compone `origin/invite/<token>` e lo copia). "Elimina" = archivia. **Audit** in `UserEvent`. Nuovo utente da UI = invitato (nessuna password dall'admin).
- **`User.operationId`**: collega finalmente l'operatore al suo account.
- ⚠️ **Senza SMTP l'invito è un link da copiare/condividere** (predisposto per l'invio email automatico). `CreateUserDto.password` è ora opzionale (con password = attivo; senza = invitato).
- Verificato end-to-end via API (invito→accetta→login; revoca immediata) e nel browser (pagina Utenti, pagina pubblica invito). Dati di test ripuliti.

### 17/07/2026 (sera 3) — Stati modificabili in linea dalle liste

- **`StatusSelectComponent`** (`web/src/app/core/status-select.component.ts`): pillola-stato con menu a clic, riutilizzabile. Usato in **Partner** (Pagamento `paymentStatus` + Stato `active`), **Valet** (`active`), **Operatori** (`active`). Aggiornamento **ottimistico** con rollback se la chiamata fallisce.
- Backend: aggiunto `active` (opzionale) a **CreatePartnerDto / CreateValetDto / CreateOperationDto** — prima il ValidationPipe (`whitelist:true`) lo scartava e il PUT/PATCH era un no-op silenzioso. L'update parziale non tocca le relazioni (verificato: province valet intatte).
- Endpoint usati: Partner/Valet `PUT /:id`, Operatori `PATCH /:id`. Verificato E2E nel browser (partner attivo→inattivo persistito) e via API (valet/operatore).
- Servizi non ha colonna stato → non toccato. La pagina **Utenti** ha già i suoi bottoni di stato (feature precedente).

### 18/07/2026 (13) — Sezione Fatturazione partner (era mancante)

- Feedback: "manca sezione fatturazione, controlla in app.deluxy.it come è realizzata". Nel reale è `/partner/fattura` (Genera fattura + Storico + Esporta) + Invoice List, alimentata dal blocco "DA FATTURARE" delle consegne; è il **gemello degli Stipendi lato partner**. Costruita a specchio (flusso scelto dall'utente: **Bozza → Emessa → Pagata**).
- **Backend**: nuovo modello `Invoice` (partnerId, number `FAT-anno-n`, periodo, totalAmount, deliveriesCount, status, archived, issuedAt, paidAt; relazione `Partner.invoices`) — migrazione `invoice_model`. `InvoicesModule` (`invoices.module.ts`, registrato in `app.module`): `generate(partnerId, periodo)` somma `price + additionalPrice` delle consegne `billable` + `status in (delivered, delivered_time_approved)` nel periodo; `findAll(user, archived)` role-scoped (partner → solo `partnerId` proprio); `updateStatus` (ISSUED archivia+issuedAt, PAID→paidAt); `reopen` (400 se PAID). Enum `InvoiceStatus`. Endpoint `GET /invoices?archived=`, `POST /invoices/generate`, `PATCH /invoices/:id/status`, `POST /invoices/:id/reopen` (generate/status/reopen = ADMIN/OPERATION).
- **Frontend**: `InvoicesListComponent` (`/invoices`), voce menu `nav.fatturazione` (ADMIN/OPERATION/PARTNER), a specchio di salaries-list: filtro partner, Genera fattura (partner+periodo), tab **Bozze/Storico**, colonne Partner/Numero/Periodo/N.consegne/Totale/Stato (+ Stato pagamento nello Storico), azioni Emetti / Segna pagata / Riapri, **Esporta** CSV. i18n `invoices.*` (IT/EN 1025/1025).
- **Verificato E2E**: sum logic con una consegna billable/delivered price 50 + plus 10 → fattura `total 60, consegne 1`; flusso Bozza→Emessa (in Storico, archived)→Pagata; riapri pagata → **400**. In browser: pagina + menu, tab Bozze (FAT con 60€) e Storico (colonna Stato pagamento, riga Pagata). Build API+web pulite. Fatture di test eliminate; la consegna usata per il test riportata a `status='created'`.
- ⚠️ **Non incluso** (rispetto al reale, TODO possibili): PDF/fattura elettronica via SDI (`sdiCode` c'è ma non si genera l'XML), invio email al partner (`invoiceEmail`), gate visibilità partner su `invoicingEnabled` (ora il partner vede comunque le proprie), righe di dettaglio per consegna nella fattura.

### 18/07/2026 (12) — Pagamento stipendio → storico in Pagamenti

- Feedback: "se clicca paga in pagamento crea uno storico del pagamento". Implementato **lato backend** in `salaries.updateStatus`: alla **transizione a PAID** (da qualunque origine — bottone Paga nelle Ricevute o Segna pagato in Stipendi/Archivio) crea un `Payment` di tipo **SALARY** (`amount = netAmount`, `status = PAID`, `salaryId` collegato, `description = "Stipendio dd/mm/yyyy – dd/mm/yyyy"`). Guardia `salary.status !== PAID` → creato **una sola volta** (idempotente, niente doppioni se si ri-PATCH PAID).
- Nuovo `PaymentType.SALARY` in `enums.ts`; import `PaymentType`/`PaymentStatus` in `salaries.module.ts`. Frontend Pagamenti: la label del tipo arriva da `payments.type.SALARY` (IT "Stipendio" / EN "Salary", 994/994). Nessuna modifica alla pagina Pagamenti (già rende `payments.type.<TYPE>` e non offre azioni su record PAID). Il tipo SALARY non è tra quelli creabili dal form (solo REIMBURSEMENT/CLAIM).
- Verificato E2E via API: 0 pagamenti → invia+firma+paga → 1 pagamento SALARY (amount netto, PAID, desc periodo, valet); ri-PATCH PAID → resta 1 (idempotente). In browser la pagina **Pagamenti** mostra la riga "Neri Sara · Stipendio · … · Pagato". Build API+web pulite. Dati/file test ripuliti.

### 18/07/2026 (11) — Ricevute: bottone "Paga" nella tab Firmate

- Feedback: "in firmate aggiungi bottone PAGA". In `ReceiptsListComponent`, nella tab **Firmate**, per admin/operation (`canManage()` via `AuthService`) ogni ricevuta firmata il cui stipendio non è ancora pagato mostra un bottone **Paga** → `pay(r)` fa `PATCH /salaries/:salaryId/status {status:'PAID'}`. Se lo stipendio è già `PAID` la cella mostra il badge **Pagato**; il valet non vede il bottone.
- Serviva `salary.id` nella risposta ricevute (già incluso dal backend) → aggiunto al tipo `Receipt.salary`. Nessuna modifica backend (riusa l'endpoint stato stipendio). i18n `receipts.pay/paid/paidOk` (IT/EN 993/993).
- Verificato E2E in browser: ricevuta firmata → tab Firmate mostra **Paga** → click → banner "Stipendio pagato ✓" → riga passa a **Pagato**; via API lo stipendio risulta `PAID` con `paidAt`. Build web pulita. Dati/file di test ripuliti.
- Nota flusso: **Paga** dalla ricevuta va direttamente a `PAID` (salta lo stato APPROVED, che resta usato solo dal flusso in Stipendi → Archivio). La guardia backend blocca solo APPROVED-senza-firma, non PAID, quindi è consentito.

### 18/07/2026 (10) — Ricevute: upload del file firmato dal PC

- Feedback: "in ricevute permetti di caricare anche file presenti su pc". Prima la ricevuta firmata era solo un **URL**; ora si può caricare un **file vero dal computer**.
- **Backend**: nuovo `POST /receipts/:id/upload` (multipart, `FileInterceptor` + `multer` `diskStorage`, max 10 MB) accanto a `POST /receipts/:id/sign` (URL). Il file va in `api/uploads/receipts/` (nome `${timestamp}-${originalname}`) e la ricevuta salva `fileUrl = /uploads/receipts/<file>`; poi il flusso è identico (`signed=true`, stipendio → `RECEIPT_PENDING`). `main.ts` ora è `NestExpressApplication` con `useStaticAssets(cwd/uploads, prefix:'/uploads/')` → i file sono serviti da `http://<api>/uploads/…`. `multer` è già presente (hoisted, v2.2.0, dipendenza di `@nestjs/platform-express`); nessun pacchetto aggiunto. `api/uploads/` aggiunto a `.gitignore`.
- **Frontend** (`ReceiptsListComponent`): nel riquadro "Carica firmata" ora c'è **selettore file** ("Scegli file dal PC…", accept `image/*,application/pdf`) **oppure** campo URL; `submitSign()` sceglie: se c'è un file → `POST /upload` con `FormData`, altrimenti `POST /sign` con l'URL. Il link **Apri** usa `fileHref()` che antepone l'origine dell'API ai path `/uploads` (i link `http…` restano invariati). i18n `receipts.pickFile`, `receipts.or` (IT/EN, 990/990).
- **Verificato E2E**: upload via API (curl -F) → ricevuta firmata, file servito a `/uploads/receipts/…` (200, `application/pdf`); e via **browser** (file input impostato con DataTransfer + "Carica") → banner "Ricevuta firmata ✓", tab Firmate con link Apri assoluto funzionante. Build API+web pulite. Dati e file di test ripuliti.
- ⚠️ **Nota deploy futuro**: i file stanno sul disco locale dell'API (`uploads/`). In produzione serve storage persistente (volume o object storage tipo S3); oggi l'app è solo locale, quindi va bene così.

### 18/07/2026 (9) — Sync partner → registro Anagrafiche (portata nel branch)

- **Divergenza scoperta**: `AnagraficheSyncService` (invio dei partner al registro centralizzato `deluxy-anagrafiche`) esisteva nella copia `C:\Users\nicol\scoutwt\deluxy-platform-next` ma **mancava** nel branch di lavoro `deluxy-scout` (`C:\Users\nicol\app\deluxy-platform-next`). Prima, creando un partner qui, non partiva alcuna sync.
- **Portata**: nuovo `api/src/partners/anagrafiche-sync.service.ts` (identico all'altra copia), registrato in `PartnersModule`, iniettato in `PartnersService` e chiamato **fire-and-forget** in `create`, `update` (entrambi i rami: partner-role e admin) e `remove` (soft delete → `stato: dismesso`). Invia `POST {ANAGRAFICHE_URL}/api/v1/partners` con header `x-api-key`, body `{platformId, nome, ragioneSociale, email, pIva, codiceFiscale, indirizzo, telefono, note, categoria, stato, attivo, fonte:'platform', contatti}`.
- **Config**: legge `ANAGRAFICHE_URL` (default `http://localhost:3060`) e `ANAGRAFICHE_API_KEY` da env. Creato `api/.env.example` (prima assente) con placeholder — **la chiave reale NON è committata** (va nel `.env` locale / env di produzione, generata su anagrafiche con `npm run chiave -- deluxy-platform --scrittura`). Best-effort: senza chiave logga "sync saltata" e prosegue.
- **Verificato E2E**: mock del registro su :3060 + API con `ANAGRAFICHE_API_KEY` fittizia → creando un partner arriva **POST #1** (`stato: attivo`, `fonte: platform`, contatti, x-api-key corretto); disattivandolo arriva **POST #2** (`stato: dismesso`, `attivo: false`). `nest build` pulito. Partner e utente di test ripuliti dal DB.
- ⚠️ **Segnalazione**: nella copia `scoutwt` il file `api/.env.example` contiene una **chiave `ANAGRAFICHE_API_KEY` reale committata** (`dlxk_…`) — è una fuga di segreto da revocare/ripulire (qui ho committato solo un placeholder vuoto).

### 18/07/2026 (8) — Stipendi allineati all'app reale: Ricevute+firma, Reclamo, Esporta, Frequenza (feedback)

Feedback "in app.deluxy.it ci sono cose che non hai considerato". Confrontata la mia pagina con `/valet/stipendi` reale (manuale righe 204-205) e implementati i 4 pezzi mancanti (l'utente ha risposto "tutti"):

1. **Ricevute con firma** (il pezzo grosso). L'invio dello stipendio ora **genera la ricevuta** (unsigned, numero `RIC-<anno>-<n>`) invece di aspettare uno stato separato. Nuovo modulo backend **`receipts.module.ts`** (registrato in `app.module.ts`): `GET /receipts?signed=true|false` (role-scoped: il valet vede le proprie via `salary.valetId`), `POST /receipts/:id/sign` `{fileUrl}` (valet proprio o admin/operation) → `signed=true`, `signedAt`, `fileUrl`, e avanza lo stipendio a `RECEIPT_PENDING`. In `salaries.updateStatus` l'**approvazione (APPROVED) è bloccata con 400** se nessuna ricevuta è firmata; `reopen` ora **cancella** le ricevute. Nuova **pagina `/receipts`** (`ReceiptsListComponent`) + voce menu `nav.ricevute`: tab Da firmare/Firmate, colonna Stato ricevuta, azione "Carica firmata" (input URL) per il valet, link "Apri" al file. Il file firmato è un **URL** (come `ddtFile`/immagini nel resto dell'app — upload binario = TODO futuro, non c'è multer).
2. **Reclamo per riga**. `Payment.salaryId String?` (relazione facoltativa, migrazione `payment_salary_link`); `payments.create` accetta `salaryId`; `salaries.findAll` include `claims`. In pagina Stipendi: bottone **Reclamo** su ogni riga → form inline (importo + descrizione) → `POST /payments {type:CLAIM, salaryId, valetId, amount}`; le righe con reclami mostrano il tag *Reclamo aperto*.
3. **Esporta**. Bottone in testata che scarica la lista **filtrata** in CSV (BOM UTF-8, `;` separatore) lato client.
4. **Frequenza stipendio**. `ValetRef` esteso con `salaryFrequency`/`hasVat`; aprendo Genera (o cambiando valet) il periodo è **precompilato**: settimana corrente (lun-dom) se `weekly`, mese corrente se `monthly`, con hint esplicativo.

- Verificato E2E via API: invia→ricevuta creata+archiviato; approva-senza-firma→**400**; firma→`RECEIPT_PENDING`+fileUrl; approva→APPROVED; reclamo→CLAIM legato (visibile in `salary.claims` e `/payments`). In browser: pagina Ricevute (tab Firmate mostra `RIC-2026-1`, link Apri), pagina Stipendi (tag *Reclamo aperto*, bottone Esporta, prefill periodo da frequenza). Build API+web pulite, i18n IT/EN 988/988. Dati di test ripuliti.
- ⚠️ **TODO futuri**: upload binario del file firmato (ora è un URL); export server-side/Excel; gestione approvazione/pagamento del reclamo dalla pagina Stipendi (per ora si gestisce da Pagamenti).

### 18/07/2026 (7) — Stipendi: Attivi/Archivio, stato finanziario, riapertura (feedback utente)

- Feedback in 5 punti sulla pagina Stipendi, tutti implementati:
  1. **Niente doppia scelta del valet**: il pannello **Genera** eredita il valet dal **filtro** in alto (`toggleGen()` precompila `genValet` da `valetFilter`).
  2. **Default = attivi**: la lista mostra gli stipendi **non in archivio**; nuovo tab **Attivi/Archivio** (`view` signal → `GET /salaries` con `?archived=true` in Archivio).
  3. **Invia archivia**: `updateStatus` imposta `archived=true` quando lo stato passa a **SENT** → lo stipendio esce dagli attivi ed entra in **Archivio**.
  4. **Riapri solo se non pagato**: nuovo `POST /salaries/:id/reopen` (admin/operation) → torna `DRAFT`, `archived=false`, azzera i timestamp; rifiuta con **400** se `status===PAID`. In pagina il bottone **Riapri** compare in Archivio solo se non pagato (i pagati mostrano ✓).
  5. **Colonna Stato finanziario** in Archivio: **Non pagato** finché `status!==PAID`, poi **Pagato** (pill verde).
- Backend: campo `Salary.archived Boolean @default(false)` (migrazione `20260718135049_salary_archived`); `findAll(user, archived)` filtra su `archived`; controller legge `@Query('archived')`. i18n `salaries.tab.*`, `salaries.fin.*`, `salaries.col.financial`, `salaries.action.reopen`, `salaries.reopened` (IT/EN, parità 955 chiavi).
- Verificato E2E via API: Invia → sparisce dagli attivi e appare in Archivio; Riapri (SENT) → torna attivo; avanzato fino a PAID → Riapri risponde **400 "Uno stipendio già pagato non può essere riaperto"**. In browser: tab Archivio mostra la colonna **Stato finanziario** e nasconde **Genera**. Dati di test ripuliti (stipendio demo di nuovo DRAFT attivo, receipts azzerate).

### 18/07/2026 (6) — Sezione Pagamenti (frontend, era stub)

- Backend già presente (`PaymentsService`): `GET /payments` (role-scoped), `POST /payments` (valet apre su di sé; admin/operation su un valetId), `PATCH /payments/:id/status` (admin/operation). Tipi `REIMBURSEMENT|CLAIM`, stati `REQUESTED→APPROVED/REJECTED→PAID`. **Fix**: `@Roles(ADMIN,OPERATION,VALET)` sulla creazione (prima aperto anche ai partner).
- **Pagina** `/payments` (`PaymentsListComponent`, sostituisce lo stub): lista (valet, tipo, importo, descrizione, stato a pill), filtro valet, form **Nuova richiesta** (valet select solo per admin/operation), azioni **Approva/Rifiuta** (da REQUESTED) e **Segna pagato** (da APPROVED). i18n `payments.*`.
- Verificato E2E: valet1 crea rimborso (12.5€ Area C), admin approva → pagina mostra "Segna pagato". Dati di test ripuliti.
- ⚠️ **Restano stub**: Regole carnet, Finanza, Attività, Vendite, Modelli SMS, Province.

### 18/07/2026 (5) — Sezione Stipendi (frontend, era stub)

- Backend già presente e funzionale (`SalariesService` in `api/src/salaries/salaries.module.ts`): `GET /salaries` (role-scoped, il valet vede i propri), `POST /salaries/generate` (somma `valetSalary` delle consegne `delivered`/`delivered_time_approved` nel periodo, meno i contanti `paymentOnDelivery`; documento pro-forma se `valet.hasVat` else ricevuta ritenuta), `PATCH /salaries/:id/status` (flusso DRAFT→SENT→RECEIPT_PENDING→APPROVED→PAID; a RECEIPT_PENDING crea una `Receipt`). **Fix**: aggiunto `@Roles(ADMIN, OPERATION)` all'avanzamento stato (prima qualsiasi autenticato).
- **Pagina** `/salaries` (`SalariesListComponent`, sostituisce lo stub): lista (valet, periodo, lordo, contanti, netto, documento, stato a pill), **filtro valet**, pannello **Genera stipendi** (valet+periodo), **avanzamento stato** con un'azione per passo (Invia/Genera ricevuta/Approva/Segna pagato) solo per admin/operation. i18n `salaries.*`.
- Verificato E2E: generato stipendio per Neri (ricevuta ritenuta, 0€ perché nessuna consegna consegnata nel periodo demo), avanzato DRAFT→SENT via API e pagina renderizza correttamente. Dati di test ripuliti.
- ⚠️ **Da fare più avanti**: upload ricevuta firmata dal valet (file), reclamo/claim per riga (come app reale), export, e collegare i contanti/plus-minus reali sulle consegne. Manca ancora **Pagamenti** (`/payments`), **Regole carnet**, **Finanza** (stub).

### 18/07/2026 (4) — Calendario: pulsante "Vai al giorno"

- Pannello del giorno del calendario: bottone **"Vai al giorno"** → `/deliveries?date=<giorno>`. La lista consegne ora legge il query param `date` all'avvio (nel constructor, prima di `load()`) e preimposta `dateFilter`. Filtrato per ruolo (il partner/valet vede i suoi). Verificato: da un giorno del calendario si apre la lista con il filtro data attivo e le consegne di quel giorno.

### 18/07/2026 (3) — Calendario e disponibilità per i valet

- **Modello** `ValetAvailability`: aggiunti `@@unique([valetId, date])` e `note` (migrazione `20260718070000_valet_availability_unique`, scritta a mano: ADD COLUMN + CREATE UNIQUE INDEX). `available=false` = non disponibile; `timeFrom/timeTo` = disponibile solo in fascia.
- **Endpoint** in ValetsController: `GET/PUT /valets/:id/availability` (upsert su valetId+date; `from/to`), `DELETE /valets/:id/availability/:date`. Permesso: VALET solo la propria (`assertCanManage`), ADMIN/OPERATION/PM su tutti. Calendar accetta anche `valetId`.
- **Calendario generalizzato** (`CalendarComponent`): `ctx()` = partner o valet (da query `?partnerId`/`?valetId` o dal proprio account). Un unico modello `Override {mode:'blocked'|'timed', from, to, note}` normalizza sia le eccezioni partner (closed→blocked) sia la disponibilità valet (available=false→blocked). L'editor usa il prefisso i18n `prefix()` (`calendar.exc.` per il partner, `calendar.avail.` per il valet). Marcatura: pallino rosso = blocked, oro = timed. `PUT` verso `/partners/:id/day-exceptions` o `/valets/:id/availability` a seconda del contesto.
- Bottone **Calendario** nella scheda valet (admin/operation) → `/calendar?valetId=<id>`.
- Verificato E2E: valet1 imposta la propria disponibilità (21/07 non disp., 22/07 fascia 14–18) via API e via UI (creazione 25/07); marcatura ed etichette valet corrette; il lato partner resta invariato (etichette Chiuso/Orario speciale). Test ripuliti.

### 18/07/2026 (2) — Calendario: eccezioni per data (chiusure / orari speciali)

- **Modello** `PartnerDayException` (migrazione `20260718062446_partner_day_exception`): `partnerId + date` unique, `closed`, `openTime/closeTime` (orario speciale), `note`. Vince sull'orario settimanale per quel giorno.
- **Endpoint** in PartnersController: `GET/PUT /partners/:id/day-exceptions` (upsert su partnerId+date; `from/to` per la lista), `DELETE /partners/:id/day-exceptions/:date`. Permesso: PARTNER solo sul proprio id (`assertCanManage`), ADMIN/OPERATION/PM su tutti. DTO inline (no class → il ValidationPipe non lo strippa).
- **Calendario**: pannello del giorno con editor **Normale / Chiuso / Orario speciale** (+ nota), visibile solo con un partner in contesto (`canEditExceptions`). Marcatura celle: pallino **rosso** = chiuso, **oro** = orario speciale (oltre allo striped per i chiusi). Salva = PUT, "Normale" = DELETE. Ricarica le eccezioni del mese dopo il salvataggio.
- Verificato E2E: creata via API chiusura (22/07) + orario speciale (23/07) → marcate correttamente; editor precompilato (23/07 = special 10–13); creata una chiusura via UI (24/07) → pallino rosso; poi test ripuliti.

### 18/07/2026 — Calendario consegne (anche per il partner)

- **Endpoint** `GET /deliveries/calendar?from=&to=` (`DeliveriesService.calendar`): conteggio consegne per giorno (+ per stato), **filtrato per ruolo** (`roleFilter`, il partner vede i suoi). Dichiarato **prima di `:id`** nel controller (come `/map`). Proiezione leggera (date+status), cap 10000.
- **Pagina** `/calendar` (`CalendarComponent`, ADMIN/OPERATION/PARTNER/VALET): vista mensile lun→dom (42 celle, calcolo in **UTC** per coerenza con le date del backend), prev/next/oggi; ogni giorno con ordini ha un badge col conteggio. Click su un giorno → `GET /deliveries?date=&pageSize=100` e pannello con l'elenco (dot stato + link alla scheda). Voce menu **Calendario** in Operatività.
- ⚠️ `translate.currentLang` in questa versione di ngx-translate è un **signal** → va chiamato `currentLang()` (non come proprietà). i18n `calendar.*` + `nav.calendario`.
- Verificato: endpoint role-scoped (admin 5 giorni, fioraio 2), pagina come partner (luglio 2026, giorni 14 e 20 marcati), click giorno → elenco con link.
- **Giorni di chiusura evidenziati (partner)**: se l'utente è PARTNER, il calendario carica i suoi orari (`GET /partners/:partnerId`) e marca le celle il cui `getUTCDay()` è tra i `dayOfWeek` con `closed=true` (motivo tratteggiato + legenda + avviso nel pannello del giorno). Verificato: fioraio ha la domenica chiusa → tutte le domeniche evidenziate, avviso al click.
- **Calendario di un partner per admin/operation (18/07)**: il calendario legge `?partnerId=` (query) e, se presente, filtra conteggi/ordini per quel partner, carica i suoi orari (giorni chiusi) e mostra il **nome** nel titolo. Endpoint `calendar` accetta `partnerId` (onorato solo per non-partner, come la lista). Bottone **Calendario** nella scheda partner (per ADMIN/OPERATION) → `/calendar?partnerId=<id>`. `targetPartnerId()` = query param, altrimenti il partner stesso, altrimenti null (admin senza filtro = tutti). Verificato E2E.

### 17/07/2026 (sera 8) — Orari di apertura del partner

- **Sezione "Orari di apertura"** nel form Partner (`partner-form`): griglia settimanale lun→dom, ogni giorno con flag **Chiuso** e orario **dalle–alle**; pulsante **"copia il lunedì su tutti"**; prefill in modifica. Invio nel payload come `openingHours` (giorni chiusi o con orario; in edit sempre, anche vuoto → cancellazione). Backend già pronto (`OpeningHour`, `OpeningHourDto`, partner service con deleteMany+create).
- **Scheda partner** (`partner-detail`): nuova sezione che mostra gli orari settimanali ordinati (giorni non impostati omessi). `dayOfWeek` DB: 0=domenica…6=sabato; ordine visualizzato lun→dom via `WEEK_DAYS`.
- i18n IT/EN (`partnerForm.openingHours.*`, giorni). Verificato: round-trip API (Lun/Mar 09:00–19:30, Dom chiuso), dettaglio e form prefill nel browser.
- ⚠️ **Distinzione**: l'app reale ha *anche* la **disponibilità per data** (`/partner/availability/list`, con link pubblico) — non ancora fatta; qui è l'**orario settimanale ricorrente**. Prossimo passo eventuale: availability per data (nuovo modello o riuso di `ValetAvailability`-like).

### 17/07/2026 (sera 7) — Fix layout mobile lista consegne + robustezza mappa

- **Barra filtri consegne responsive**: `.filters` ora `flex-wrap: wrap`; su ≤640px i controlli vanno a capo a larghezza piena (prima andavano in overflow orizzontale a 890px in un viewport da 375px, tagliando la ricerca — è il bug dello screenshot mobile). Mappa a **320px** su mobile (era 460).
- **Mappa più robusta**: `DeliveryMapComponent` attende che il contenitore abbia dimensione prima di creare la mappa (`waitForSize`) e fa un `resize` dopo il render — evita il classico caso di mappa grigia/statica quando si apre un pannello a scomparsa.
- ⚠️ **Nota su verifica mappa**: nel browser di anteprima di Claude la pagina risulta `document.hidden=true`, e Google Maps in quel caso mostra solo l'**immagine statica** e rimanda le tile interattive → la mappa interattiva **non è verificabile nell'anteprima** (artefatto dello strumento, non dell'app). Va provata su un browser reale.

### 17/07/2026 (sera 6) — Pulsante Aggiorna sulla mappa consegne

- Pulsante **"Aggiorna"** in alto a sinistra del pannello mappa (`DeliveryMapComponent.refresh()`): se la mappa è pronta ricarica i punti da `GET /deliveries/map`, altrimenti **re-inizializza** (rilegge `/settings/public` e ricarica lo script) — utile subito dopo aver inserito la chiave browser o dopo un errore. Disabilitato durante il caricamento. Verificato nel browser (presente, cliccabile, nessun errore).

### 17/07/2026 (sera 5) — Autocomplete indirizzi Google Places (form consegna)

- Campo **Indirizzo destinatario** del form consegna: agganciato `google.maps.places.Autocomplete` (ristretto all'Italia, `types:['address']`). Alla selezione compila l'indirizzo e ricava la **provincia** da `administrative_area_level_2` (→ filtro partner/valet). Evento Google riportato nella zona Angular (`NgZone.run`).
- Usa la **chiave browser** (`GET /settings/public`). ⚠️ La chiave browser deve avere abilitate sia **Maps JavaScript API** sia **Places API**. Senza chiave: degrada al campo di testo + geocodifica server (comportamento precedente). `autocomplete="off"` sul campo per sopprimere l'autofill di Chrome.
- **Helper condiviso** `web/src/app/core/google-maps.ts`: carica lo script Google Maps **una sola volta** con `libraries=places` (usato da mappa consegne + autocomplete). La mappa non ha più il suo loader locale.
- Stile globale `.pac-container` in `styles.css` (z-index sopra la UI). Verificato il fallback senza chiave (campo normale, nessun errore console); il menu Google richiede la chiave browser da inserire in Impostazioni.

### 17/07/2026 (sera 4) — Mappa consegne (Google Maps con puntatori)

- **Coordinate sulla consegna**: `Delivery.latitude/longitude` (migrazione `20260717201903_delivery_coords`), geocodificate **una volta** alla creazione/modifica (`DeliveriesService` usa `SettingsService.geocodeCoords`, chiave server). **Backfill** `POST /deliveries/geocode-missing?limit=` (admin, throttlato). La mappa **non geocodifica a runtime**.
- **Endpoint mappa**: `GET /deliveries/map` (Admin/Operation) → `{ points:[{id,code,status,date,latitude,longitude,recipient…,deliveryTime…,partner,valet}], capped }`, filtrabile come la lista (stato, data), cap 3000. Dichiarato **prima** di `:id` nel controller (altrimenti `/map` sarebbe catturato dalla route param).
- **Due chiavi Maps** in Impostazioni: `googleMapsApiKey` (SEGRETA, solo server — geocodifica) e `googleMapsBrowserKey` (per la mappa JS nel browser, esposta via `GET /settings/public`). ⚠️ La browser key va **separata** e ristretta per referrer + Maps JavaScript API.
- **Frontend**: `DeliveryMapComponent` (`web/src/app/pages/delivery-map.component.ts`) — carica Google Maps JS **pigramente** (singleton), marker colorati per stato (colori legenda), **cluster** via markerclusterer CDN (degrada a marker singoli se non carica), popup con link alla scheda. Pannello espandibile "Mostra mappa" nella lista Consegne, **solo Admin/Operation** (indirizzi = dati sensibili). Fallback: no chiave browser → avviso + link Impostazioni; no coordinate → "nessuna consegna geolocalizzata".
- Verificato via API: geocodifica reale (Montenapoleone→45.467,9.196; Corso Como→45.480,9.187), `/deliveries/map` restituisce i punti, `/settings/public`, backfill. Nel browser: campo browser key in Impostazioni, pulsante "Mostra mappa" (admin), pannello con stato "no chiave" corretto. **La mappa con i pin richiede la chiave browser** (da inserire in Impostazioni) — non testabile senza (Claude non inserisce chiavi API).

## MANCA / PROSSIMI PASSI

1. **[BLOCCATO — palla all'utente] Connessione al DB di produzione (MySQL, sola lettura)**: servono i 5 valori `MYSQL_*` (o replica) + raggiungibilità/tunnel. Vedi ANALISI-BACKEND-LEGACY. Poi `prisma db pull` per lo schema reale.
2. **Allineare l'endpoint WooCommerce** al contratto reale: `POST /api/deliveries/sync/woo-order`, header `x-deluxy-partner-key`, payload+risposta identici (oggi usa `x-api-key` e `/woocommerce/orders`).
3. ~~**Form di MODIFICA**~~ → **FATTO il 17/07** per tutte le sezioni (vedi FATTO).
2-bis. ~~Form **Prodotti**: comportamento dei flag dell'app reale~~ → **FATTO il 17/07**: osservato dal vivo su app.deluxy.it (l'utente ha fatto il login; Claude non inserisce credenziali) e replicato. Semantica dei campi ora nel manuale (§3.6).
3-bis. ~~**Traduzione incrementale**~~ → **FATTO il 17/07**: tutte le schermate tradotte (~775 chiavi IT/EN allineate).
4. **Applicare la visibilità per ruolo operatore** al login (Finance vede Amministrazione, PM no Operatività, Customer Service no Amministrazione) — richiede auth reale che porti `operationRole` nel token e sidebar che filtri.
5. **Autenticazione reale** contro il DB: mapping `extraId`/`extraType` → partner/valet/operation. *(17/07: `User` ora collega partner/valet/operation e ha stati espliciti — base pronta.)*
6. **Sezioni ancora stub**: Attività, Vendite, Stipendi, Pagamenti, Regole carnet, Finanza, Modelli SMS, Disponibilità, Province. *(Clienti e Utenti non sono più stub: fatti il 17/07.)*
6-bis. **Invito via email**: oggi l'invito è un **link da copiare** (nessun SMTP configurato). Wire di un invio email reale (o WhatsApp) quando si configura un provider; il token e il flusso sono già pronti.
9. ~~**Filtri/ordinamenti**~~ → **FATTO il 17/07** su tutte le liste, con **due strategie decise in base al volume**:
   - **Server-side** (`api/src/common/list-query.ts`, risposta `{items,total,page,pageSize}`): **Prodotti** (8.503 in prod), **Consegne**, **Clienti** (4.092). Ricerca globale `q` in AND con lo scope di ruolo, sort su whitelist, paginazione 10–500 (default 50).
   - **Client-side** (`web/src/app/core/client-table.ts`): **Partner, Valet, Categorie, Servizi, Operatori** — liste piccole (≤243) usate soprattutto come tendine nei form: la conversione server-side avrebbe rotto ~14 punti di chiamata senza dare valore. Queste API restano array.
   - ⚠️ **Regola per il futuro**: se una lista cresce, spostarla su server-side e aggiornare **tutti** i consumatori (leggere `.items`, passare `pageSize=500` per le tendine).
9-bis. **Tendina "Cliente esistente" nel form consegna**: carica `pageSize=500`, ma in produzione i clienti sono **4.092** → la tendina è **parziale**. Va sostituita con una **ricerca mentre si scrive** (usa `GET /customers?q=`). Stesso discorso, meno urgente, per i prodotti nel form consegna (8.503, `pageSize=500`).
10. **⚠️ Ricerca case-insensitive su PostgreSQL**: in SQLite (dev) `contains` → `LIKE`, già case-insensitive; su **Postgres (produzione) `LIKE` è case-sensitive** → servirà `mode: 'insensitive'` in `textSearch()`, altrimenti la ricerca globale si comporterà diversamente in produzione.
11. **Image manager Shopify e descrizione per piattaforma**: la parte dati/form c'è (URL multipli + descrizione per piattaforma); manca l'**upload/sincronizzazione reale su Shopify** (stub).
12. **`trackingToken` senza vincolo unique**: in SQLite avrebbe richiesto una migrazione interattiva con rebuild tabella; il token è casuale a 24 byte e la ricerca usa `findFirst`. **In PostgreSQL aggiungere l'indice unique.**
7. **Rifiniture**: nel form valet rendere Telefono/Indirizzo obbligatori e CF sempre richiesto (come app reale).
7-bis. **Da confermare con l'utente/app reale**: la semantica di `minOrderTime`/`maxOrderTime` — oggi usati sia come limite di inserimento (testo nel form Servizi) sia come intervallo di **generazione fasce di consegna** (elenco 08–10… nel form Consegna). Verificare su app.deluxy.it quale delle due (o entrambe) è quella vera.
8. **In pausa**: analisi multi-agente del vecchio codice (cosa fa ogni funzione + come aggiornarla).

## Note operative (IMPORTANTI per una nuova sessione)

- ⚠️ **Una sola sessione Claude per questa cartella** (regola 4): due sessioni sulla stessa working dir si sovrascrivono branch e lavoro non committato. Se serve lavorare in parallelo, usare un **git worktree** isolato (cartella + branch dedicati).
- **Porte alternative per sessioni parallele**: se 3000/4200 sono occupate da un'altra sessione, avviare l'API con `PORT=3010` e `CORS_ORIGINS=http://localhost:4200,http://localhost:4210`, e il web con `npx ng serve --port 4210`. `environment.ts` capisce da solo la porta: web su 4210 → API su 3010.
- **Push pre-autorizzato** (utente, 15/07: "si sempre"): dopo ogni commit, pushare su `origin/deluxy-scout` **senza chiedere conferma ogni volta** (menzionarlo soltanto). Restano da confermare: deploy, invii, cancellazioni.
- **Regola d'oro UI**: ogni form/schermata va **verificato campo-per-campo contro l'app reale** app.deluxy.it (sessione admin) prima di dirlo finito; integrare le scoperte nel manuale; se un campo ha semantica dubbia, **chiedere all'utente**.
- Token demo a scadenza breve: durante i test la sessione web può saltare — rifare login.
- Le migrazioni Prisma vanno create con l'API server **fermo** (lock del query engine su Windows): `preview_stop` o chiudere `npm run dev:api`, poi `npx prisma migrate dev --name ...`.
- Dopo ogni modifica al `.md`: `npm run doc:word` per rigenerare il Word, e committarlo.
- Tutto il lavoro piattaforma è di nuovo consolidato su **`deluxy-scout`** (merge di `platform-delivery-slots` il 17/07). Consolidamento finale su `main` via PR quando deciso.
- ⚠️ **Push in sospeso**: i commit del 17/07 su `deluxy-scout` (`0ea2d28`, `e8c7896`, merge `1000ded`, `8859a35`, merge `eb627c6` + doc) sono solo locali — pushare `deluxy-scout` appena possibile (il push automatico era bloccato dai permessi della sessione). Entrambe le fusioni includono anche i 4 commit del worktree **mai pushati** su `origin/platform-delivery-slots` (ricerca globale consegne, filtri tutte le liste, archivio+viste rapide prodotti, partner di provenienza clienti).
