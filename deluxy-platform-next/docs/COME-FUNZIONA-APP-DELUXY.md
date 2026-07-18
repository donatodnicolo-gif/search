# COME FUNZIONA L'APP DELUXY

**MANUALE COMPLETO — EDIZIONE AGGIORNATA**

> Aggiornato il 14 luglio 2026 — integra la mappatura completa di app.deluxy.it (ogni sezione, bottone, filtro e opzione verificati direttamente in app con utenza Admin), il codice del backend reale e i chiarimenti dell'utente.
> Le parti contrassegnate con **[NUOVO]** sono funzionalità rilevate nell'app reale/backend e assenti nel manuale precedente.
>
> **📌 Questo `.md` è la VERSIONE VIVA adatta a Claude: è la fonte di verità funzionale per lo sviluppo di `deluxy-platform-next` e va aggiornata a ogni nuova scoperta.** Regola: quando si verifica una schermata reale, rileggere e integrare qui; se un campo/opzione ha semantica dubbia, chiederla all'utente e poi documentarla.
> **Word sempre aggiornato** (per le persone): `docs/COME-FUNZIONA-APP-DELUXY.docx`, generato da questo `.md` con `npm run doc:word` — non modificarlo a mano. Snapshot storico originale: `docs/COME-FUNZIONA-APP-DELUXY-AGGIORNATO-2026-07.docx`.
>
> **Changelog**
> - 18/07/2026 — **Calendario consegne** (anche per il partner): nuova sezione **Calendario** (menu, per Admin/Operation/Partner/Valet) con vista **mensile** che **marca i giorni con ordini** (conteggio nel badge); cliccando un giorno si apre l'elenco delle consegne di quel giorno con link alla scheda. Filtrato **per ruolo**: il partner vede solo i propri ordini. Endpoint `GET /deliveries/calendar?from=&to=` (conteggio per giorno + per stato, role-scoped).
> - 17/07/2026 (12) — **Orari di apertura del partner** (nuovo ambiente): sezione **Orari di apertura** nel form Partner — griglia settimanale (lun→dom) con "Chiuso" e orario *dalle–alle* per ogni giorno, più "copia il lunedì su tutti"; mostrati anche nella **scheda partner**. Usa il modello `OpeningHour` (già presente) via il campo `openingHours` del partner (salvato con deleteMany+create). ⚠️ **Nota**: nell'app reale "Orari Apertura" (`/partner/availability/list`) è la **disponibilità per data** (con link pubblico per partner) — concetto più avanzato; qui è stato realizzato prima l'**orario settimanale ricorrente** (base naturale). La disponibilità per data resta un possibile passo successivo.
> - 17/07/2026 (11) — **Autocompletamento indirizzi Google Places** nel form Consegna: sul campo **Indirizzo destinatario** compare il menu a tendina dei suggerimenti Google (indirizzi in Italia); selezionandone uno l'indirizzo si compila e la **provincia** viene ricavata dai dati Google (che filtra partner/valet). Usa la **chiave browser** delle Impostazioni (serve anche l'API "Places" abilitata, oltre a "Maps JavaScript"); senza chiave il campo resta normale con la geocodifica server come prima. Soppresso anche l'autofill di Chrome sul campo. Lo script Google Maps ora si carica una sola volta (helper condiviso con la mappa, con libreria `places`).
> - 17/07/2026 (10) — **Mappa consegne** (come l'app reale): pannello espandibile **"Mostra mappa"** nella lista Consegne (solo Admin/Operation) con i **puntatori dei luoghi di consegna** su Google Maps, colorati per stato e con popup (codice, destinatario, indirizzo, fascia, valet, link alla scheda), che **rispetta i filtri** (stato, data). Architettura: le **coordinate si salvano sulla consegna** (`Delivery.latitude/longitude`, geocodificate una volta alla creazione/modifica con la chiave server; endpoint backfill `POST /deliveries/geocode-missing` per le esistenti), la mappa legge da `GET /deliveries/map` — nessuna geocodifica a runtime. Due chiavi in Impostazioni: `googleMapsApiKey` (segreta, server, geocodifica) e **`googleMapsBrowserKey`** (per la mappa JS nel browser, da restringere per referrer). Senza chiave browser il pannello mostra un avviso; senza coordinate, "nessuna consegna geolocalizzata".
> - 17/07/2026 (9) — Pagina **Utenti**: aggiunta la **ricerca globale** (email, nome, ruolo, stato, anagrafica collegata) e **rimosso il pulsante "Nuovo utente"** — gli utenti nascono con l'anagrafica (Partner/Valet/Operatore), non si creano da qui.
> - 17/07/2026 (8) — **Stati modificabili in linea dalle liste**: nelle liste **Partner** (Pagamento + Stato), **Valet** e **Operatori** la pillola di stato è ora un menu a clic (componente `StatusSelectComponent`): si cambia lo stato senza aprire "Modifica" (aggiornamento ottimistico con rollback in caso di errore). Backend: aggiunto `active` ai DTO di Partner/Valet/Operazione (prima veniva scartato dal ValidationPipe `whitelist`); l'update parziale non tocca le relazioni.
> - 17/07/2026 (7) — **Gestione utenti rifatta (accesso separato dall'operatività)**: `User.active` sostituito da uno **stato esplicito** `invited | active | suspended | archived` (migrazione `user_status_invite_audit`). **Invito invece di password impostata dall'admin**: creando Partner/Valet/Operatore si crea (in un gesto solo) l'**utente collegato in stato "invitato"** con token monouso a scadenza (7 gg); la persona apre il link pubblico `/invite/:token`, sceglie la password e l'account si attiva da solo (`GET /auth/invite/:token`, `POST /auth/accept-invite`). **Revoca immediata**: il guard verifica lo stato sul DB a ogni richiesta, quindi sospendere/archiviare toglie l'accesso subito (non dopo la scadenza del token). **"Elimina" = archivia** (lo storico consegne/stipendi/fatture resta). Nuova pagina **Configurazione → Utenti** (solo admin): lista con stato/ruolo/anagrafica collegata e azioni Attiva/Sospendi/Archivia/Reinvita (il link d'invito si copia negli appunti); **audit** di ogni azione in `UserEvent`. `User` ora collega anche l'**operatore** (`operationId`). Nota: senza server email l'invito è un **link da copiare e condividere** (predisposto per l'invio automatico futuro).
> - 17/07/2026 (6) — **Nuova sezione Configurazione → Impostazioni (solo admin)**: chiavi API dei servizi esterni salvate **solo nel database** (`AppSetting`, migrazione `app_settings`; endpoint `GET/PUT /settings`, admin). Prima chiave: **Google Maps** — usata da `GET /settings/geocode` per geocodificare l'indirizzo della consegna e ricavarne la **provincia** (come l'app reale); la pagina ha un tester ("Prova geocodifica"). Nel form consegna la geocodifica parte con debounce dopo la digitazione dell'indirizzo e, se trova la provincia, **vince sul riconoscimento testuale** (che resta il fallback senza chiave). Inoltre **Ora ritiro** è ora una **tendina di orari** (00:00–23:30 a passi di 30 minuti) invece del campo orario libero.
> - 17/07/2026 (5) — Fusione del branch `platform-delivery-slots` in `deluxy-scout` (in due riprese: prima i commit pushati, poi ricerca/filtri/archivio): le due implementazioni delle **fasce di consegna dal setup del servizio** (fatte in parallelo) sono state riconciliate tenendo quella del branch slots; in più il **seed** ora applica il setup prenotazione demo (fasce 2h 08–20, flessibile consentito su "Consegna prezzo fisso") anche ai DB già popolati.
> - 17/07/2026 (4) — **Filtri e ordinamenti su tutte le liste**. Convenzione decisa: **una sola ricerca globale** (cerca in *tutti* i campi testuali, comprese le relazioni — es. cercando "Fiori" trova i prodotti della categoria Fiori), **data/ora con filtri propri** (`dateFrom`/`dateTo`), **ogni colonna ordinabile** asc/desc. Due strategie in base al volume: **server-side** per le liste grandi — **Prodotti** (8.503 in produzione), **Consegne**, **Clienti** (4.092) — con contratto comune `?q=&sort=&dir=&page=&pageSize=` → `{items,total,page,pageSize}` (default 50, max 500, come l'app reale); **client-side** per le liste piccole (**Partner, Valet, Categorie, Servizi, Operatori**), che sono ≤243 record e servono soprattutto come tendine nei form. La ricerca è sempre in **AND con il filtro di ruolo** (un partner che cerca il nome di un altro partner non vede nulla) e l'ordinamento accetta solo campi in **whitelist**. ⚠️ In SQLite (dev) la ricerca è già case-insensitive; su **PostgreSQL** servirà `mode: 'insensitive'`.
> - 17/07/2026 (3) — **Fix: svuotare una collezione in modifica ora la cancella davvero**. I form inviavano array/oggetti solo se non vuoti e l'API scrive solo le chiavi presenti: rimuovendo *tutte* le immagini/piattaforme/varianti/campi di un prodotto (o province/servizi/indirizzi di ritiro di un partner, servizi/liste team leader di un valet, campi/sconti di una categoria, prodotti di una consegna) i vecchi valori **restavano**. Ora, **in modalità modifica**, le collezioni sono inviate sempre — anche vuote (`[]`/`{}`). Regola per i nuovi form: in edit inviare esplicitamente la collezione vuota.
> - 17/07/2026 (2) — **Nuovo ambiente: convenzione "riga → dettaglio + Modifica" estesa a tutte le anagrafiche**. In **Consegne, Partner, Clienti, Valet, Prodotti, Categorie, Servizi, Operatori** il **click sulla riga apre il dettaglio** (`/<sezione>/:id`, anche da tastiera con Tab+Invio) e la colonna **Azioni** ha il bottone **Modifica** (`/<sezione>/:id/edit`), che **riusa il form di creazione** in modalità modifica (precompilato, salva in PUT/PATCH, niente "Duplica"). Nuove pagine di dettaglio per tutte le sezioni. **Sezione Clienti creata da zero** (prima era solo uno stub): lista, form, dettaglio con le consegne del cliente. **API aggiunte perché mancanti**: `GET/PUT /categories/:id`, `GET/PUT /service-types/:id`, `GET /operations/:id`; `GET /customers/:id` ora include le consegne. Nota: gli operatori si aggiornano con **PATCH**, le altre sezioni con **PUT**.
> - 17/07/2026 — **Nuovo ambiente: azioni di riga delle Consegne implementate**. **MODIFICA**: form di modifica (rotta `deliveries/:id/edit`, riusa il form di creazione, salva in PUT); la regola del partner è applicata **lato server** (solo `created` e servizio ≠ VENDITA) — prima `PUT /deliveries/:id` era riservato ad Admin/Operation. **ASSEGNA**: pop-up con i valet che hanno abilitata la provincia della consegna (provincia dedotta dall'indirizzo); usa `PATCH /deliveries/:id/assign`. **ADDITIONAL VALET +/-**: pop-up per il plus/minus immediato sulla paga (`valetAdditionalPrice`). **MONITORARE**: link pubblico `/tracking/<token>` (token opaco su `Delivery.trackingToken`, endpoint `@Public()`), che espone **solo** codice, stato, data, fascia, nome del destinatario, partner, nome valet e log — niente indirizzo, contatti, note o importi. **Fix**: `update()` ora salva anche **prodotti** e indirizzi di ritiro (prima venivano scartati); `AssignValetDto.valetId` non aveva decoratore di validazione e veniva scartato dal ValidationPipe (l'assegnazione andava in errore 500).
> - 16/07/2026 (11) — **Consegne, semantica dei bottoni di riga** (chiarita dall'utente): **MODIFICA** apre la consegna in modifica; **ASSEGNA** apre un **pop-up con i valet che hanno abilitata la provincia** della consegna; **MONITORARE** apre un **link pubblico** di monitoraggio della consegna; **ADDITIONAL VALET +/-** dà **subito un plus o minus al valet** — **correzione**: il doc lo descriveva erroneamente come "aggiunta/rimozione valet extra". Nel nuovo ambiente il bottone DETTAGLI è sostituito dal **click sulla riga**.
> - 16/07/2026 (10) — **Consegne, permessi dei bottoni di riga** (regola di business dall'utente): **Admin** tutti i bottoni; **Partner** solo **MODIFICA**, finché la consegna è **in rosso** (stato *Da gestire*/`created` secondo la legenda colori dell'app reale) e solo su consegne **non di tipo servizio "vendita Deluxy"**; **Valet** solo **DETTAGLI**. Nota: nel nuovo ambiente la legenda colori era diversa dall'app reale (vedi §3.1) — allineata.
> - 16/07/2026 (9) — **Nuovo ambiente, form Prodotto allineato all'app reale**: tipo prodotto ora come **flag** (*Prodotto unico* + *Super prodotto*) invece del select; **partner aggiuntivi** mostrati solo se *Visible to other partners* è attivo; **Plus del prodotto obbligatorio**; hint *Linea* (valori separati da `;`); **galleria immagini** (URL multipli, prima = principale) e **descrizione per piattaforma**; **varianti ricche** — ogni variante ha Nome\*, **SKU manuale**, Giorni prep., Prezzo, Prezzo pubblico, Controlla stock/Giacenza. Backend: nuovi campi `ProductVariant` (publicPrice, sku, prepDays, controlStock, stock) e `Product` (images, platformDescriptions) + migrazione. La *sincronizzazione immagini su Shopify* resta uno stub (richiede integrazione Shopify).
> - 16/07/2026 (8) — **Form prodotto reale, comportamento verificato live** (app.deluxy.it): confermato il "reveal" delle checkbox — *Visible To Other Partners* mostra il selettore **partner aggiuntivi**; *Super Prodotto* mostra il selettore **prodotti componenti**; *ha varianti?* mostra **titolo opzione + varianti**, dove **ogni variante** ha Nome\*, **SKU\* manuale**, Giorni preparazione, Prezzo, Prezzo pubblico, Controlla stock proprio. Nel form reale *Partner* è un select singolo e *Linea* accetta più valori separati da `;`.
> - 16/07/2026 (7) — **Prodotti, altri campi** (chiarito dall'utente): **Nome alternativo del prodotto** = il nome che il **partner vede in Consegne** (col flag *Usa nome alternativo*); **Visible to other partners** = rende visibile il prodotto a un **altro partner anche se è il prodotto unico di un altro partner** (utile per il **Corporate Service**); **Super Prodotto** = il **flag** basta e indica un **prodotto combinato**. Resta da confermare il **comportamento** del flag *Varianti del prodotto*.
> - 16/07/2026 (6) — **Prodotti, semantica campi** (chiarita dall'utente, prima mancante nel doc): **Super Provincia** = il prodotto in vendita viene proposto a un **partner specifico** con una **% di scontistica calcolata per provincia**; **Not physical** = si abbina a **Shopify** e indica che il prodotto **non ha stock** (nemmeno su Shopify); **Non modificabile** = i **partner non possono modificarlo**; **Linea** = la **linea del prodotto**.
> - 16/07/2026 (5) — **Multilingua**: la piattaforma è ora multilingua (ngx-translate). Aggiunta la lingua **Inglese** oltre all'Italiano; **selettore lingua con bandierine** (SVG) fisso **in alto a destra**, disponibile anche nella pagina di login; la scelta è persistita (`localStorage`, default Italiano). Tradotti al momento shell/menu e login; le altre schermate si traducono in modo incrementale (chiavi in `web/public/i18n/it.json` + `en.json`). Inoltre nel **form consegna** nuovo flag **"Salva come nuovo cliente in Clienti"**: alla creazione, se il destinatario è nuovo, viene prima salvato in Clienti e poi creata la consegna collegata.
> - 16/07/2026 (4) — Form **Valet**: province di competenza e sezione **Team leader** ora usano un **menu a tendina "aggiungi"** (fra tutte le province/partner) con **chip rimovibili** invece della griglia di chip; aggiunta la lista **Partner esclusi** dallo scope del team leader (nuovo campo `teamLeaderExcludedPartners`, con migrazione). Un partner non può essere insieme associato ed escluso.
> - 16/07/2026 (3) — Form **Servizio** e **Valet**: nel Servizio, **Ora minima/massima di inserimento** sono ora **tendine (00:00–23:00)**. Nel Valet: **Luogo e Data di nascita sempre visibili**; con **Partita IVA** attiva compare **solo la P.IVA** (spariscono CF e % ritenuta); **senza** P.IVA compaiono **CF\*** e **% ritenuta**; l'**IBAN** è spostato nella sezione **Stipendio**. Documentati: *Partner magazzino* = il cliente ha lo stock dei propri prodotti monitorato; *% ritenuta* = % di rimborso spese per ricevuta fiscale sul totale dei servizi effettuati. (Categorie partner e province partner/valet sono già a **selezione multipla** a chip.)
> - 16/07/2026 (2) — Form consegna, **ordine e dipendenze dei campi**: 1) **Servizio** è il primo campo; 2) **Indirizzo destinatario** è il secondo; 3) la **Data consegna** ha come minimo (e default) **oggi + giorni di preavviso** del servizio. Inserito l'indirizzo, il sistema rileva la **provincia** e mostra **solo i partner e i valet con quella provincia abilitata**; inoltre — **novità di questo sviluppo** — mostra **solo i partner che hanno abilitato quel tipo di servizio**. (Nel nuovo ambiente la provincia è dedotta dal testo dell'indirizzo — codice tipo `(MI)`, nome provincia o città; nell'app reale è geocodificata via Google Maps.)
> - 16/07/2026 — Form consegna, **fascia oraria di consegna a tendina**: quando la consegna **non** è flessibile si sceglie una **fascia predefinita** da un menu a tendina invece di un orario libero. Le fasce vanno da **Ora minima** a **Ora massima** del servizio (default **06:00–22:00**) con durata = **Fascia oraria** del servizio (`slotHours`, default 1 ora). La consegna mostra il flag "flessibile" **solo se il servizio lo consente** (nuovo campo servizio `allowFlexibleTime`); il **ritiro** resta sempre con orario flessibile opzionale e fascia automatica di 1 ora.
> - 15/07/2026 (4) — Form consegna, sezione **Gestione dell'ordine**: ogni prodotto mostra il **prezzo** e ha un flag **Prezzo flessibile** che ne consente la modifica (precompilato col prezzo base). Il prezzo override è salvato sulla riga della consegna (`DeliveryProduct.price` + `flexiblePrice`).
> - 15/07/2026 (3) — Form consegna: le fasce orarie di **consegna e ritiro** mostrano i campi **dalle–alle** solo se il flag "flessibile" è spuntato; altrimenti si sceglie un solo orario e la fascia è **automaticamente di 1 ora** (es. 10:00 → 10:00–11:00).
> - 15/07/2026 (2) — allineamento form all'app reale campo-per-campo: **Prodotto** (varianti con prezzo/SKU, multi-partner PRODUCTS PARTNER, piattaforme, controlla stock, non modificabile, super provincia, nome alternativo); **Partner** (PEC, promemoria attività, tipo codice consegna UNIQUE_PER_DELIVERY/CUSTOMER, KM inclusi/extra fuori città a livello partner); **Consegna** (Vendita Deluxy, prezzo flessibile, Valet Servizio, toggle Da fatturare/Da pagare, n° telefono SMS, file DDT).
> - 15/07/2026 — nuovo ambiente: form Categorie e Prodotti (con AI prompt, campi extra, sconti provincia, tipo/componenti); menu con sezione Prodotti e sezione Utenti; ruoli operatore (Operation/Finance/Project Manager/Customer Service). **Convenzioni nuovo ambiente**: ogni form di creazione ha un tasto **Duplica** (salva e mantiene i valori per un nuovo record); lo **SKU prodotto è generato automaticamente** (`DXY-NNNNN`, rigenerato a ogni creazione/duplicazione).
> - 14/07/2026 — chiarita la semantica del codice di consegna (`UNIQUE_PER_DELIVERY` = OTP per consegna reinviabile dal valet; `UNIQUE_PER_CUSTOMER` = codice fisso tipo PIN, rigenerabile dalla boutique in Customers); ritiro multiplo (scelta dell'indirizzo in fase di consegna); KM inclusi = dentro il comune / extra fuoricittà = fuori dal comune, verificato all'inserimento consegna.

---

## 1. Architettura tecnica e stato attuale

- **Frontend**: Angular (SPA) servita su https://app.deluxy.it — versione datata, da ammodernare.
- **Backend**: Node.js v12 (obsoleto; ultima LTS: v24) con API REST su `https://app.deluxy.it/api/*`.
- **Autenticazione**: JWT (Bearer token) con ruoli nel payload (`admin`, `expert`, `partner`, `operation`); endpoint `/api/auth`, `/api/users/me`.
- **Integrazioni attive rilevate**: Google Maps (geocoding/mappe), Stripe (pagamenti), Qonto (banking, da Profilo), Web Push Notification (`/api/web-push-notification`), SMS, WhatsApp, WooCommerce (plugin `deluxy-send-order`), Shopify (prodotti e piattaforme di vendita). **[NUOVO]**
- **Endpoint API osservati**: `/api/users/me`, `/api/auth/<token>`, `/api/experts/delivery/experts`, `/api/web-push-notification/count/:id`. Il ruolo "valet" nelle API si chiama **"expert"**.
- **[NUOVO — nuovo ambiente] Multilingua**: il nuovo frontend è internazionalizzato con **ngx-translate**. Lingue attive: **Italiano** (default) e **Inglese**. Selettore a bandierine in alto a destra, scelta persistita in `localStorage`. File di traduzione: `web/public/i18n/{it,en}.json`. Le stringhe si migrano alle chiavi in modo incrementale.

### Limiti attuali e strategia

- Node.js v12 e Angular datati: dipendenze deprecate, nuove feature difficili da integrare, manutenzione sempre più complessa e rischiosa.
- **Strategia concordata**: mantenere la piattaforma attuale stabile in produzione e creare un ambiente di staging parallelo con stack aggiornato (Node 22+ LTS, framework moderno, API-first, PWA multi-dispositivo), migrando gradualmente (strangler pattern).
- È stato creato il nuovo ambiente **`deluxy-platform-next`** (monorepo: API NestJS + Prisma + frontend Angular moderno, OpenAPI/Swagger, seed demo, Docker) come base della nuova versione.

## 2. Utenti e ruoli

Ruoli disponibili: **Admin** (solo alcuni admin — es. "support" — abilitati a Finanza), **Partner**, **Valet** (nei sistemi: "expert"), **Operation**, **Project Manager** (come Operation ma senza Consegne e Attività).

| Ruolo | Accessi |
|---|---|
| **Admin** | Tutto. Alcuni admin abilitati alla parte Finanza che mostra la marginalità dell'azienda. |
| **Partner** | Consegne, Customers, Prodotti, Modelli SMS (solo partner abilitati), Orari Apertura (propri), Vendita, Fatturazione (solo partner abilitati). |
| **Valet (Expert)** | Consegne, Activities, dati Partner e Valet (disponibilità orari), Disponibilità, Stipendi, Regole Valet, Pagamenti, Ricevute. |
| **Operation** | Consegne, Activities, Partner (+aggiunta), Valet (+aggiunta), Customers (+aggiunta), Prodotti (+aggiunta), Modelli SMS (+aggiunta), Vendita, Cakes Order Product, Province & Cities. |

**Sotto-ruoli operatore** (impostati alla creazione dell'operatore, controllano la visibilità delle sezioni del menu): **[NUOVO]**
- **Operation** (base): vede la sezione Operatività; non vede Amministrazione.
- **Finance**: vede **anche** la sezione Amministrazione (Stipendi, Pagamenti, Regole, Finanza).
- **Project Manager**: **non** vede la sezione Operatività (Consegne, Attività, Vendite).
- **Customer Service**: **non** vede la sezione Amministrazione.

**Stati utente** — *app reale* (pagina Utenti): Attivo, Disattivo, Da convalidare, Sconosciuto. Ruolo assegnabile in linea: nessuno / admin / expert / partner / operation.

**Stati utente — nuovo ambiente** (rifatto 17/07, `User.status`): **Invitato** (creato, deve ancora scegliere la password dal link di invito), **Attivo** (può accedere), **Sospeso** (accesso tolto temporaneamente, riattivabile), **Archiviato** (cessato; il record resta per lo storico — è ciò che fa "Elimina"). Lo **stato dell'accesso è separato dall'operatività** dell'anagrafica (`Partner/Valet/Operation.active`): un partner può essere "sospeso in ferie" (non riceve consegne) restando un utente attivo, o viceversa. Ogni cambio di stato è tracciato in `UserEvent` (chi/quando/nota). **[NUOVO]**

**Dati attuali rilevati**: 550 utenti registrati, 243 partner, ~57 valet attivi in lista, 14 membri Operation, 4.092 customers, 8.503 prodotti.

## 3. Mappa completa delle sezioni (verificata in app)

Menu principale: **CONSEGNE · ACTIVITIES · PARTNER · VALET · UTENTI · PRODOTTI · VENDITE · FINANZA · SETUP · Profilo**. In alto a destra: nome utente, contatore notifiche push, logout.

### 3.1 Consegne (`/nuovo-consegne`)

- Tab: **CONSEGNE ATTIVE** e **NON CONSEGNATE** (archivio). Bottone **STORICO** per le consegne chiuse.
- Bottoni: AGGIUNGI + · ESPORTA · IMPORTARE · MAP · RESET · SCARICA IL FORMATO CSV · STORICO.
- Area "DELIVERIES MAP" espandibile con localizzazione delle consegne (funzione MAPPA + RESET con filtri).
- Legenda stati (colori): Da gestire (rosso), In gestione (giallo), In consegna (viola), In preparazione (arancione), Accettata (blu), Richiedi Annullamento (azzurro).
- Colonne della lista: Stato, Vendita, Platform, ID, Original Consegna, Data, Orario, Partner, Valet, Indirizzo, Ora Ritiro, Tipo Servizio, Da Fatturare, Da Pagare, Azioni.
- Filtri per colonna: stato (`created`/`assigned`/`delivering`/`inPreparation`/`accepted`/`requestCancellation`), piattaforma vendita (Deluxy=`shopifysale`, Cakes=`cakesales`, Flowers=`flowerssales`, Deluxy Experience=`deluxyexperiencesales`, Deluxy Dot Com=`deluxydotcomsales`), ID, date da/a, orari da/a, partner, valet, indirizzo, ora ritiro da/a, tipo servizio (`sales`/`hourlyrate`/`fixedprice`/`corporate`/`warehouseservice`), da fatturare Sì/No, da pagare Sì/No. Paginazione 10–500 elementi.
- Azioni per riga: DETTAGLI, MODIFICA, ASSEGNA, MONITORARE, **ADDITIONAL VALET +/-**. **[NUOVO]**
- **Cosa fa ogni bottone** (chiarito dall'utente): **[NUOVO]**
  - **DETTAGLI**: apre il dettaglio della consegna.
  - **MODIFICA**: apre la consegna **in modifica**.
  - **ASSEGNA**: apre un **pop-up con la lista dei valet che hanno abilitata quella provincia** (la provincia della consegna).
  - **MONITORARE**: apre un **link pubblico** dove è possibile **monitorare la consegna** (tracking accessibile senza login).
  - **ADDITIONAL VALET +/-**: permette di dare **subito un plus o minus al valet** (rettifica economica sulla paga del valet). *(Correzione: in precedenza il doc lo descriveva come "aggiunta/rimozione valet extra" — non è così.)*
- **Permessi sui bottoni di riga, per ruolo** (regola di business): **[NUOVO]**
  - **Admin**: **tutti** i bottoni.
  - **Partner**: può usare **MODIFICA** solo **finché la consegna è "in rosso"** — cioè nello stato **Da gestire** (`created`), secondo la legenda colori dell'app reale — e **solo sulle consegne che non sono di tipo servizio "vendita Deluxy"**.
  - **Valet**: solo **DETTAGLI**.
  - **Convenzione nuovo ambiente**: il bottone **DETTAGLI** non esiste — il dettaglio si apre **cliccando la riga** della consegna (per tutti i ruoli che vedono la lista). I bottoni restano solo per le azioni (Modifica, Assegna, Monitorare, Additional valet). **[NUOVO]**
- **Vista team leader in Consegne**: un valet **team leader** può, in questa schermata, **vedere tutte le consegne (delle sue province) oppure filtrare per vedere solo le proprie** — ha un filtro "tutte / solo le mie". Un valet normale vede solo le proprie. **[NUOVO]**

#### Dettaglio consegna (`/consegne/:id`)

- Azioni in alto: STAMPA · MAPS · SHARE · DELIVERED LINK · ASSEGNA.
- Toggle: **VERIFICA DELL'IDENTITÀ VALET** e **CODICE DI CONSEGNA RICHIESTO**. **[NUOVO]**
- Sezioni: Dati di consegna e ritiro (stato, data, fascia oraria, ora ritiro, consegna flessibile, valet) · Scelta del servizio (partner, nome/tipo servizio, prezzo, plus/minus al prezzo) · Informazioni destinatario e mittente (cognome/nome, SMS telefonici, indirizzo, citofono, telefono, email; cognome/nome/telefono mittente) · Gestione dell'ordine (pagamento alla consegna, contanti da incassare, prova e reso del prodotto, prodotto, immagine, quantità, variante) · Receipt info (nome di chi ha ricevuto, ricevuta) · Documentazione e note (numero DDT, file DDT, note, PERSONALIZZAZIONE, note interne) · Storico consegna (log con data/ora: inserita, partita, effettuata).
- Visibilità per ruolo: Partner vede valet/mezzo/telefono ma non note interne né costi consegna dei propri servizi; Valet vede note e note interne; Admin/Operation vedono tutto + logs. Nessuno vede l'indirizzo di ritiro nelle colonne della lista.

#### Form "Nuova consegna" (`/consegne/nuovo`) — campi completi

Data consegna\* · Indirizzo destinatario · Partner · Servizio\* · Fascia oraria consegna (+flag flessibile) · Fascia oraria ritiro\* (+flag flessibile) · Prodotto, quantità, prezzo flessibile · Vendita Deluxy · Valet · Valet Servizio · Stato consegna · Stato del pagamento · SMS telefonici · Pagamento alla consegna (+prezzo contanti) · Prova e reso del prodotto · Customer esistente (CHOOSE EXISTING CUSTOMER) o SAVE CUSTOMER · Cognome/Nome destinatario\* · Citofono\* · Telefono/Email destinatario · Cognome/Nome/Telefono mittente · DA FATTURARE (indirizzo di ritiro, prezzo, plus prezzo) · DA PAGARE (valet salario, plus/minus) · Numero DDT + file DDT · Note · PERSONALIZZAZIONE · Note interne · CODICE DI CONSEGNA RICHIESTO.

**Ordine e dipendenze dei primi campi (nuovo ambiente)**: **[NUOVO]**
1. **Servizio** è il primo campo: determina il preavviso e le fasce orarie di consegna.
2. **Indirizzo destinatario** è il secondo campo (obbligatorio): da esso si deduce la **provincia**.
3. **Data consegna**: minimo e default = **oggi + giorni di preavviso** (`noticeDays`) del servizio.
4. **Partner**: mostrati **solo i partner con la provincia dell'indirizzo abilitata E che hanno abilitato il tipo di servizio scelto** (il filtro per tipo di servizio è una novità del nuovo ambiente). Il **Valet** è filtrato per la sola provincia dell'indirizzo. Se la selezione precedente esce dal filtro, viene azzerata; se nessun partner soddisfa i criteri, un avviso lo segnala.
5. **Fascia oraria di consegna**: se il servizio **non** consente l'orario flessibile (o il flag è disattivo) si sceglie una **fascia predefinita a tendina** (da `minOrderTime` a `maxOrderTime`, default 06:00–22:00, durata = `slotHours`); se consentito e attivo, si indica una fascia libera **dalle–alle**. Il **ritiro** ha sempre il flag flessibile opzionale con fascia automatica di 1 ora.

**Regole**: obbligatori servizio, indirizzo, data (≥ oggi + preavviso), orario ritiro, nome e cognome destinatario, citofono, prodotto. In base all'indirizzo vengono proposti i partner della provincia (e del tipo di servizio); nell'app reale la provincia è geocodificata via Google Maps, nel nuovo ambiente è dedotta dal testo dell'indirizzo (codice tipo `(MI)`, nome provincia o città). La fascia minima per servizi orari è 1 ora. Il sistema associa automaticamente il tipo servizio partner al salario valet (fisso↔fisso, ora↔ora, vendita↔fisso). Con SMS telefonici parte il messaggio secondo i Modelli SMS (creata/partita/arrivata). Prodotti del partner mostrati per primi in grassetto. Per prezzo fisso: calcolo automatico distanza ritiro→consegna con extra KM per il partner e rimborsi valet. Consegne con stesso DDT: più ritiri in Activities, una sola consegna. Note interne visibili solo ad Admin/Operation/Valet.

**Problemi di salvataggio**: verificare numero di caratteri dei telefoni, validare l'indirizzo, verificare presenza prodotto, controllare il messaggio di errore in fondo al form.

### 3.2 Activities (`/activities`)

- Vista VALET ACTIVITIES: attività di ritiro e consegna per ogni valet, ordinate per orario; filtro per valet; bottone STORICO; bottone "Reorder with time".
- Admin/Operation vedono tutte le attività; Team Leader vede le proprie e quelle dei valet delle sue province; il Valet vede solo le proprie.
- Ogni consegna genera un ritiro + una consegna; stesso indirizzo con più ritiri = più attività di ritiro e una consegna. Il furgoncino giallo imposta "in consegna" e sblocca la consegna. SEARCH cerca su qualsiasi campo.

### 3.3 Partner (`/partner`)

Sottomenu: Fatturazione (`/partner/fattura`), Orari Apertura (`/partner/availability/list`), Priorità (`/partner/priority/list`), Consegne Regole (`/partner/delivery/rules`), Invoice List (`/partner/invoices`), Carte (`/partner/cards`).

Lista: 243 partner. Colonne: ID, Ragione sociale, Email, Telefono, Città, Indirizzo, Partner's Catalog (categorie vendute), Payment Method, Payment Status, Attivo. Azioni: DISPONIBILITÀ, MODIFICA, ELIMINA. Bottone AGGIUNGI PARTNER.

Filtri pagamento: metodo (**Bank Transfer / Credit Card / Direct Debit Mandate**) e stato pagamento (**Active / Inactive / Blocked**). **[NUOVO]**

#### Scheda partner (campi completi, verificati)

- **Personal information**: Nome (insegna)\*, E-mail\*, Partita IVA, Codice Fiscale, Indirizzo\*, Telefono\*, Cognome/Nome referente\*, Azienda (ragione sociale).
- **Partner Provincia**: elenco province abilitate (es. MI, RM, CO, MB, LO, VA, BG, NO, PV, PC, CR, BS, LC) + AGGIUNGI PROVINCIA. Nelle consegne saranno selezionabili solo i partner con la provincia abilitata; i prodotti unici vengono caricati automaticamente.
- **Servizio**: elenco servizi abilitati con SERVIZIO PREZZO ed EXTRA KM PREZZO per servizio, più **KM INCLUDED** ed **EXTRA FUORICITTÀ PREZZO**. Significato confermato: **[NUOVO]**
  - **KM INCLUDED** → si applica alle consegne **all'interno dello stesso comune**: è la soglia di KM inclusi senza sovrapprezzo (per i servizi a prezzo fisso).
  - **EXTRA FUORICITTÀ PREZZO** → è il **costo per consegne fuori dal comune**; il controllo comune/fuori-comune viene fatto **all'inserimento di una nuova consegna**.
- **Categorie di prodotti** venduti dal partner.
- **Notifiche**: possibilità di inviare SMS, notifiche WhatsApp, notifiche mail.
- **Pagamenti e contratto**: periodo di validità del contratto (`startContractDate`/`endContractDate`), metodo di pagamento (bonifico/carta/SDD), conto bancario (IBAN), nome del conto, CODICE SDI, stato del pagamento (Active/Inactive/Blocked). **[NUOVO]** Le date contratto alimentano un job notturno (cron `checkingPartnerContract`, 03:00) che avvisa alla scadenza del contratto (flag `contractExpiryNotificationSent`). **[NUOVO — da codice backend]**
- **Fatturazione & Actions**: mail fatturazione (`billingEmail`) + flag ABILITA FATTURAZIONE (`billingAccess`).
- **Indirizzo di ritiro multiplo**: flag `isMultiplePickUpAddress`; quando attivo il partner ha una **lista di indirizzi di ritiro** (`pickupAddresses`, array) e **al momento della creazione della consegna si sceglie da quale indirizzo ritirare**. **[NUOVO]**
- **Campi di vendita**: URL del negozio (`partnerShopUrl`) + immagine (`saleImage`), usati nella presentazione delle vendite. **[NUOVO]**
- **Sicurezza**: VERIFICA DELL'IDENTITÀ VALET (`checkExpertIndentity`) e CODICE DI CONSEGNA RICHIESTO (`deliveryCodeCheck`) impostabili a livello partner. Il codice ha un **tipo** (`deliveryCodeCheckType`): **[NUOVO]**
  - `UNIQUE_PER_DELIVERY` (default): un **codice OTP diverso per ogni consegna**, inviato al cliente alla creazione della consegna; il valet può **reinviarlo** in fase di consegna.
  - `UNIQUE_PER_CUSTOMER`: un codice **fisso per il cliente** (come il PIN di una carta), assegnato una volta e valido per sempre; il cliente può chiederne la **rigenerazione** alla boutique tramite la sezione Customers dell'app (sui clienti della boutique).
- **Partner Magazzino**: flag `partnerHasWarehouse` che qualifica il partner come magazzino. **Significa che il cliente ha lo stock dei propri prodotti monitorato** (gestione delle giacenze dei suoi prodotti in magazzino). **[NUOVO]**
- **WooCommerce API key**: GENERATE KEY / COPY KEY per collegare il plugin deluxy-send-order.
- **Documentazione e note**. Bottoni: SALVA e DUPLICA.

> **Note tecniche (da entità `partner.entity.ts`):** il campo NOME* corrisponde a `businessName` (l'insegna) mentre AZIENDA è un campo separato `agency` (ragione sociale). Indirizzo, `city`, `latitude`/`longitude` vengono geocodificati automaticamente. Oltre ai valori per-servizio esistono anche `kmIncluded` ed `extraOutSideCityKmPrice` **a livello di partner** (soglia KM inclusi e prezzo extra fuori città globali). Le 3 notifiche sono `sendSms` / `receiveWhatsappMsg` / `receiveEmailMsg`.

#### Sottosezioni Partner

- **Fatturazione** (`/partner/fattura`): selezione partner + GENERA FATTURA, STORICO, ESPORTA. Riepiloga la fatturazione del partner (visibile solo Admin; il partner la vede se abilitato).
- **Orari Apertura** (`/partner/availability/list`): lista disponibilità per data: partner, province coperte, fascia oraria, Available Sì/No. Ogni partner imposta i propri orari; consultabili anche via link pubblico `https://app.deluxy.it/partner/[id]/availability`.
- **Priorità** (`/partner/priority/list`): 27 regole attive. Per Provincia + Categoria Prodotto si definisce la lista ordinata di partner prioritari per le vendite di prodotti non unici (es. MI/Fiori → Maryflor, Angolo Fiorito, Fiorista Tonino…).
- **Consegne Regole** (`/partner/delivery/rules`): regole per carnet e servizi con numero di consegne garantito. Campi: Daily Number Rule (Sì/No), Total Number Rule (Sì/No), periodo di validità, time range, partner, KM distance, numero giornaliero di consegne, numero totale di consegne, Plus/Minus prezzo partner, Plus/Minus paga valet, tipo servizio, Da fatturare, Da pagare. Le regole si possono estendere a più partner (sezione Estensione).
- **Invoice List** (`/partner/invoices`): elenco fatture per partner. **[NUOVO]**
- **Carte** (`/partner/cards`): gestione carte associate ai partner (es. Jamtech Technologies, Deluxy Flowers) con NUOVO CARTE — collegata ai pagamenti con carta. **[NUOVO]**

### 3.4 Valet (`/expert`)

Sottomenu: Servizi Valet (`/valet/servizi`), Stipendi (`/valet/stipendi`), Ricevute (`/expert/receipts`), Orari Apertura (`/expert/availability/list`), Regole Valet (`/expert/rules`), Pagamenti (`/expert/payments`), Transazioni (`/transzioni`), Valet Contratti (`/expert/contracts`).

Lista: ID, Cognome, Nome, Email, Telefono, Città, Mezzo (Auto / Bicicletta / Furgone / Moto-Scooter), Team Leader Sì/No, Attivo. Bottone AGGIUNGI VALET.

#### Scheda valet (campi completi, verificati)

- **Personal information**: Cognome\*, Nome\*, E-mail\*, Telefono\*, Indirizzo\*, **Luogo di nascita (e provincia)** e **Data di nascita** (sempre visibili), flag **Partita IVA**. **Regola form nuovo ambiente**: **[NUOVO]**
  - con **Partita IVA** attiva si mostra **solo il campo P.IVA\*** (il valet fattura: niente CF né ritenuta in questa sezione);
  - **senza Partita IVA** si mostrano **Codice Fiscale\*** e **Percentuale Ritenuta (%)** (ricevuta con ritenuta d'acconto).
  - Le **coordinate bancarie (IBAN)** stanno nella sezione **Stipendio** (non più tra i dati fiscali).
  - **`% Ritenuta`** = **percentuale di rimborso spese per la ricevuta fiscale sul totale dei servizi effettuati** dal valet. **[NUOVO — chiarimento utente]**
- **Salary Frequency Setting**: frequenza dello stipendio\* (`salaryFrequency`: MENSILE / SETTIMANALE) e limite di deposito settimanale (`weeklyDepositLimit`). **[NUOVO]**
- **Team Leader**: flag `isTeamLeader`; quando attivo si impostano le **PROVINCE** in cui il team leader può vedere/assegnare consegne in autonomia, i **PARTNERS associati** e — **[NUOVO]** — i **PARTNER ESCLUSI** dal suo scope (`teamLeaderExcludedPartners`): il team leader gestisce i partner delle sue province **tranne** quelli esclusi. Un partner non può essere insieme associato ed escluso.
- **Valet Province**: province in cui il valet opera (distinte da quelle del team leader).
- **Selezione province/partner (nuovo ambiente)**: province di competenza, province e partner del team leader (inclusi/esclusi) si scelgono da un **menu a tendina "aggiungi"** tra **tutte** le voci disponibili; le voci scelte restano come **chip rimovibili** (scala con 108 province / 243 partner). **[NUOVO]**
- **Servizi**: per ogni servizio abilitato, Servizio Salario ed Extra Km/€; per i **servizi magazzino** anche **SALARY PER ITEM** (salario a pezzo). A livello valet: **Minimum KM Included** (soglia entro il comune) ed **EXTRA FUORICITTÀ PREZZO** (rimborso per consegne fuori dal comune). **Regola:** si può selezionare **un solo servizio a ora e un solo servizio a prezzo fisso** per valet. **[NUOVO]**
- **Notifiche**: solo **WhatsApp** e **Mail** (il valet **non** ha l'opzione SMS, a differenza del partner); **Mezzo** (Auto, Bicicletta, Furgone, Moto/Scooter, selezione singola); Note.
- **Note tecniche** (da `expert.entity.ts`): il valet nei sistemi è `Expert`; anagrafica (nome/cognome/email) sta sulla relazione `user`; la % ritenuta è `holdingPercentage`; le coordinate bancarie `bankAccountData`; `minimumKmIncluded` ed `extraOutSideCityKmPrice` sono a livello valet; indirizzo geocodificato (`city`, `latitude`/`longitude`).

#### Sottosezioni Valet

- **Servizi Valet** (`/valet/servizi`): 8 servizi. Tipi: Servizi a Prezzo Fisso, Servizi in Ora, Servizi Magazzino (es. SERVIZIO MAGAZZINO SWISS/CAPJARI/ECI, Servizio Incluso, Trasporto catering). Il valore è impostato per singolo valet nella sua scheda. Solo i prezzi fissi calcolano extra KM / fuoricittà.
- **Stipendi** (`/valet/stipendi`): filtro per valet + STORICO, GENERA STIPENDI, ESPORTA. Genera pro-forma fattura (valet con P.IVA) o ricevuta ritenuta (senza P.IVA). Invio stipendio → righe in storico → ricevuta generata in RICEVUTE da firmare → approvazione → pagamento. Il valet può aprire un RECLAMO su ogni riga (es. rimborso Area C).
- **Ricevute** (`/expert/receipts`): ricevute generate automaticamente dall'invio stipendi; il valet le ricarica firmate per l'approvazione e il pagamento.
- **Regole Valet** (`/expert/rules`): regole per valet per definire i rimborsi per consegne con 2+ ritiri (lista per valet con edit/delete/expand).
- **Pagamenti** (`/expert/payments`): richieste di rimborso dei valet per servizi specifici. Stati: CREATA / APPROVATA + STORICO; filtro per valet.
- **Transazioni** (`/transzioni`): sezione transazioni valet (movimenti economici). **[NUOVO]**
- **Valet Contratti** (`/expert/contracts`): gestione contratti valet con colonne: ID, Valet, CONTRATTO GENERATO, CONTRATTO FIRMATO. **[NUOVO]**
- **Orari Apertura** (`/expert/availability/list`): disponibilità dei valet per data e fascia oraria.

### 3.5 Utenti / Operation / Customers

- **Utenti** (`/utenti`): 550 utenti; colonne ID, Email, Cognome, Nome, Ruolo (nessuno/admin/expert/partner/operation, modificabile in linea), Attivo (Attivo/Disattivo/Da convalidare/Sconosciuto), Elimina. Visibile solo ad Admin. Qui si attivano gli utenti appena registrati e si trasformano in Admin.
- **Operation** (`/operation`): staff d'ufficio (14 persone): Cognome, Nome, Email, Telefono, Attivo + AGGIUNGI. **Form "Nuovo Operation"**: Cognome\*, Nome\*, E-mail\*, Telefono\*, Indirizzo\*; notifiche WhatsApp/Mail; **Ruolo operatore**; Note. **[NUOVO]**
  - **Ruolo operatore** (controlla la visibilità delle sezioni del menu): **[NUOVO]**
    - `operation` (base): vede la sezione **Operatività**, non **Amministrazione**.
    - `finance`: vede **anche la sezione Amministrazione** (Stipendi, Pagamenti, Regole, Finanza).
    - `project_manager`: **non vede la sezione Operatività** (Consegne, Attività, Vendite).
    - `customer_service`: **non vede la sezione Amministrazione**.
- **Customers** (`/customers`): 4.092 clienti; colonne: ID, Owner (Admin/Operation/Partner), Partner, Cognome, Nome, Email, Data nascita, Citofono, Telefono, Indirizzo, Note. Azioni: DELIVERY (crea consegna dal cliente), MODIFICA, ELIMINA; AGGIUNGI, ESPORTA, IMPORTARE, formato CSV. Da questa sezione la boutique può **rigenerare il codice di consegna "fisso" del cliente** quando il partner usa `deliveryCodeCheckType = UNIQUE_PER_CUSTOMER` (vedi 3.3 Sicurezza). **[NUOVO]**

### 3.6 Prodotti (`/prodotti`)

- Tab: ATTIVA PRODOTTI, ARCHIVIO PRODOTTI, **SHOPIFY PRODOTTI** (sincronizzazione prodotti da Shopify). Viste TABELLA / GRIGLIA. 8.503 prodotti. **[NUOVO]**
- Bottoni: AGGIUNGI, ESPORTA, IMPORTARE, SCARICA IL FORMATO CSV, ELIMINAZIONE MULTIPLA (+SELEZIONA TUTTI), selettore stato Attivo/Disattivo.
- Colonne/filtri: ID, Foto, Nome, Variante SKU, Categoria, Prezzo, Prezzo Pubblico, Stock, Partner, SKU, Super Prodotto Sì/No, Super Provincia Sì/No, Prodotto Unico Sì/No, Approvato Sì/No, In Magazzino Sì/No, Attivo.
- Tipi di prodotto: **unici** (di un partner), **non-unici** (es. fiori), **superprodotti** (combinazioni di più prodotti). Flag "Visible to other partners" per rendere visibili i prodotti unici ad altri partner. Admin/Operation aggiungono qualsiasi prodotto; ogni partner carica i propri come unici.
- **Form "Nuovo prodotto"** (verificato campo-per-campo): sezioni **DETTAGLI** (Nome\*, Partner, Categoria\*, SKU, Giorni Preparazione, **Plus del prodotto** max 80\*, Descrizione rich text, Prezzo, Prezzo pubblico, Linea, Immagine; flag Non modificabile, Prodotto unico), **INVENTORY MANAGEMENT** (Controlla stock, Nome alternativo + Usa nome alternativo), **SHOPIFY CONNECTION** (Approvato, Attivo, Not physical, **SELECT PLATFORMS**: Deluxy/Cakes/Flowers/Business/Experience/DotCom + descrizione per piattaforma, image manager), **PRODUCTS PARTNER** (partner aggiuntivi che vendono il prodotto), **SUPER PRODOTTO** (componenti), **PRODOTTO VARIANTI** (flag ha varianti + titolo opzione + varianti con prezzo/SKU), **CAMPI OBBLIGATORI** (campi testuali). **[NUOVO — form prodotto completo, incl. varianti e multi-partner]**
  - **Significato campi (chiarito dall'utente)**: *Super Provincia* = in vendita il prodotto viene proposto a un **partner specifico** con una **% di scontistica calcolata per provincia**; *Not physical* = si abbina a **Shopify** e indica un prodotto **senza stock** (nemmeno su Shopify); *Non modificabile* = i **partner non possono modificarlo**; *Linea* = la **linea del prodotto**; *Nome alternativo del prodotto* = il nome che il **partner vede in Consegne** (attivo col flag *Usa nome alternativo*); *Visible to other partners* = rende il prodotto visibile a un **altro partner anche se è il prodotto unico di un altro partner** (utile per il **Corporate Service**); *Super Prodotto* = il **flag** è sufficiente e indica un **prodotto combinato** (composto da più prodotti).
  - **Comportamento checkbox (verificato live sul form reale)**: le sezioni con "reveal" mostrano campi aggiuntivi solo quando il flag è attivo. **Visible To Other Partners** → compaiono **PARTNER + AGGIUNGI PARTNER** (selettore partner aggiuntivi che vendono il prodotto). **Super Prodotto** → compaiono **PRODOTTI + AGGIUNGI PRODOTTO** (componenti del prodotto combinato). **Il prodotto ha varianti? [SI]** → compaiono **NOME OPZIONE** (titolo opzione) + **AGGIUNGI VARIANTI**; ogni variante ha: **Nome variante\***, **SKU variante\* (manuale, non auto)**, **Giorni preparazione**, **Prezzo**, **Prezzo pubblico**, **Controlla stock (variante)**, **Rimuovi**. Quindi ogni variante è di fatto un mini-prodotto con prezzo/SKU/stock propri. Altri dettagli reali: **Partner** in DETTAGLI è un **select singolo**; **Linea** accetta **più valori separati da `;`**; i nomi campo interni sono `visibleToOtherPartners`, `isSuperProduct`, `isSuperProvinceProduct`, `productHasVariants`, `productOptionTitle`, `variantName`, `variantSku`, `variantGgDispMin`, `variantPrice`, `variantShopifyPrice`, `controlVariantStock`.

#### Sottosezioni Prodotti

- **Categorie** (`/product/categoria`): 63 categorie (es. Fiori, Fiori Classici, Fiori d'Arte, Torte, Dolci, Box Regalo, Cappelliere, Palloncini, Accessori, B2B Colazione/Break/Lunch/Aperitivo, Ghirlande, Abbonamento Fiori, Regalistica Natale…). **Form "Nuova categoria"** (verificato): Nome\*, Note, **AI Prompt** (per generazione AI, es. torte), **Extra fields** (nome campo + tipo: Opzionale / Obbligatorio / solo Admin), **Province discounts** (provincia + % di sconto → genera automaticamente prodotti scontati arrotondati a 0/5). **[NUOVO — AI Prompt e Note sul form categoria]**
- **Prodotto Collections** (`/collections`): collezioni shop per provincia: Collection Name, Handle (es. `province-products/rm`), Descrizione, Provincia, Codice provincia, Categoria prodotto. **[NUOVO]**
- **Cakes Order Product** (`/cake/orders`): torte acquistate e realizzate con l'AI (8 presenti) con foto.

### 3.7 Vendite (`/all/vendita`)

- Viste per piattaforma: All Vendite + Deluxy (`/vendita`), Cakes (`/cakes/vendita`), Business (`/business/vendita`), Deluxy Flowers (`/flowers/vendita`), Deluxy Experience (`/experience/vendita`), Deluxy.Com (`/deluxydotcom/vendita`).
- Colonne: Platform, System ID, ID ordine effettivo, Ordine, Data, Cliente, Indirizzo, Telefono, Canale (es. Online Store), Totale, Costo consegna, Stato del pagamento (paid…), Stato di adempimento (Unfulfilled…), Elementi, SKU, Metodo di consegna, Vendor, Stato (es. Da Gestire).
- Azioni per vendita: **GENERATE LINK, SEND EMAIL, CONFERMA, MODIFICA, RIFIUTA**. In alto: AGGIUNGI, ESPORTA, **PAGAMENTI DELLE VENDITE**, STORICO. **[NUOVO]**
- Il popup "Seleziona Piattaforma di vendita" (Shopify / Cake / Business / Flowers) compare per aggiungere una vendita manuale.

#### Logica di smistamento vendite (invariata)

- **Prodotto unico**: se la provincia è servita da un partner aperto → la consegna viene creata e proposta al partner; se chiuso o provincia non servita → vendita "da gestire".
- **Prodotto non unico**: se esiste lista priorità per provincia → invio ai partner prioritari aperti (con eventuale sconto categoria arrotondato a 0 o 5), altrimenti agli altri partner; senza lista priorità → vendita "da gestire".
- Stati vendita/consegna collegati: Accettata (il partner accetta la vendita), Richiedi Annullamento (se ancora "da gestire" si annulla automaticamente), Non Accettata (grigio), Non Consegnata (blu, con motivo nelle note), Consegnata, Annullata (solo Admin/Operation).
- Servizi orari in storico: CONSEGNATO CON ORARIO DA APPROVARE / CONSEGNATO CON ORARIO NON APPROVATO (verificare l'orario del valet prima di procedere).

### 3.8 Finanza (`/finanza`)

Visibile solo agli admin abilitati (es. utente "support").

- Tab **CORRISPETTIVI**: per ogni vendita: Stato, ID Vendita, ID Consegna, Data consegna, Prodotto, Categoria, Valore vendite, Prezzo pubblico, Prezzo consegna, Partner, Prezzo partner, Fee %, Fee value, Fee+IVA, Costo consegna, Primo margine, Primo margine %. Con ESPORTA.
- Tab **MARGINI**: margini totali dell'azienda.

### 3.9 Setup

- **Modelli SMS** (`/admin/smstemplates`): 31 modelli; tipi Created / Departed / Arrived; assegnati ad Admin o a partner specifici (es. Boutique Chanel); placeholder disponibili: `[name]`, `[day]`, `[between_time]`. Brand: Deluxy, DeluxyFlowers, CakeDesign.Me, BusinessDeluxy, Deluxy Experience, Deluxy Dot Com.
- **Provinces & Cities** (`/provinces/cities`): 108 province italiane con codice e numero di città abilitate alle consegne in guanti bianchi; IMPORTARE + formato CSV.
- **Servizi Partner** (`/servizi`): 32 servizi; tipi: Prezzo Fisso, a Ora (min 1h), Vendita, Aziendale (Corporate), Magazzino. Esempi magazzino: Ricezione pallet, Ordine Ecommerce, Picking & Packing a pezzo/a collo, Picking e Preparazione con consegna/spedizione; consegna taglie S/M e L/XL. Il valore del servizio si imposta nella scheda del singolo partner.
  - **Corporate Service**: un cliente aziendale ordina prodotti di proprietà di un altro partner; si tramuta in servizio vendita per il proprietario dei prodotti.
  - **Servizio Magazzino**: Prezzo Base + A Pezzo (per quantità) + Trasporto (base + extra distanza).

### 3.10 Profilo (`/profilo`)

- **QONTO CONNECTION**: collegamento del conto Qonto (CONNECT WITH QONTO). **[NUOVO]**
- Personal information: e-mail\*, RECLAMA MAIL VALET, RECLAMA MAIL PARTNERS (indirizzi per i reclami), cognome\*, nome\*, password + ripeti password, SALVA.

## 4. Registrazione

La registrazione avviene obbligatoriamente da parte dell'Admin per qualsiasi utente. Utenti creabili: Admin, Operation, Partner, Valet.

- **Admin**: si crea come Valet/Partner/Operation e poi si trasforma in Admin dalla pagina Utenti.
- **Operation**: nome, cognome, mail, telefono, indirizzo, note.
- **Partner**: insegna, email, P.IVA/CF, indirizzo, telefono, referente, ragione sociale, province, servizi (KM included, extra fuoricittà), categorie, notifiche, fatturazione & actions, documentazione e note.
- **Valet**: anagrafica completa, flag P.IVA (P.IVA + CF, luogo/data di nascita, IBAN), team leader, province, servizi con salario, notifiche (mail o WhatsApp), mezzo, note.

**Nuovo ambiente (17/07)**: la creazione di Partner/Valet/Operatore **crea automaticamente l'utente collegato in stato "invitato"** — non serve più creare l'admin come valet e poi trasformarlo, né impostare a mano la password. La persona riceve un **link di invito** (`/invite/:token`), sceglie la propria password e l'account si attiva da solo. L'admin non conosce le password altrui. La pagina **Utenti** governa solo l'accesso (stato + ruolo); l'operatività resta nelle schede anagrafiche.

**Step successivi alla registrazione** (app reale):
- Admin: impostare l'utente come "Attivo" nella pagina Utenti.
- Partner: inserire subito i campi richiesti e impostare gli orari di apertura; Admin abilita le categorie di vendita.
- Valet: specificare subito le disponibilità; Admin indica la % di rimborso nella ritenuta.

## 5. Processo di consegna (Valet)

1. **RITIRO**: il valet imposta "in consegna" (furgoncino giallo); la consegna lampeggia per partner/admin/operation; notifica ad Admin e Operation.
2. **CONSEGNATO**: popup che chiede chi ha ritirato il prodotto + caricamento foto della ricevuta; notifica ad Admin e Operation.
3. **NON CONSEGNATO**: popup con il motivo della mancata consegna; notifica ad Admin e Operation.

Sicurezza opzionale: verifica dell'identità del valet e codice di consegna richiesto al destinatario (attivabili per consegna o per partner). **[NUOVO]**

## 6. Importazione consegne

Possibile per Admin, Operation e Partner (il Valet non può importare). File di riferimento su Google Sheets (formato Admin/Operation e formato Partner); bottone "Scarica il formato CSV" in app.

Campi obbligatori: DATA `['ANNO/MESE/GIORNO]` (attenzione all'apostrofo), STATO (`created`, `assigned`, `invalidated`/`canceled`, `delivered`, `not delivered`), Name/Surname, orari from/to `[ORA:MINUTI]`, Pickup `[ORA:MINUTI]–[ORA:MINUTI]`, Partner ID, Intercom (citofono), indirizzi `[INDIRIZZO CIVICO, CITTÀ PROVINCIA, NAZIONE]`, DeliveryProducts `[NOME PRODOTTO, QUANTITÀ]` (il prodotto deve già esistere), Service = 5 (consegna) o 6 (servizio orario).

La lista dei servizi è consultabile su https://app.deluxy.it/servizi.

## 7. Integrazioni

### WooCommerce — plugin `deluxy-send-order` (rev. 1.0.0)

- Intercetta gli ordini al checkout e li invia all'API Deluxy. Open source GPL: https://github.com/deluxy-project/deluxy-send-order/
- Requisiti: PHP 7.0+, WordPress 5.8+, WooCommerce 9.0.0+, campi data/ora ritiro nei meta dell'ordine.
- Configurazione (WooCommerce > Impostazioni > tab Deluxy): API key del partner (generata dalla scheda partner), metodi di spedizione abilitati, campi data/ora consegna, regex per interpretare i campi (output richiesto `HH:MM` e `YYYY-MM-DD`), campi extra, log di debug (WooCommerce > Stato > Log, voce `deluxy-orders`), modalità sandbox (invia a dev.deluxy.it, richiede API key differente).
- Il plugin non ha scheduler: cura solo l'invio degli ordini.

### Shopify

Tab SHOPIFY PRODOTTI in Prodotti e piattaforme di vendita collegate (`shopifysale` è il codice della piattaforma Deluxy). Gli ordini dei negozi Shopify entrano come Vendite con ID ordine effettivo (#…). **[NUOVO]**

### Altre integrazioni rilevate

Stripe (pagamenti online), Qonto (banking dal Profilo), Google Maps (geocoding, mappa consegne, calcolo distanze), SMS + WhatsApp (notifiche), Web Push (notifiche in app, contatore nell'header).

## 7-bis. Servizi e Calcoli (pricing) — sezione interna

I **servizi** si definiscono in **Amministrazione → Servizi** (nuovo ambiente): nome, tipo, e **destinazione** (Partner / Valet / entrambi). Le **tariffe** si impostano nella scheda del singolo partner/valet. Nell'app reale sono in *Setup → Servizi Partner* (`/servizi`) e *Valet → Servizi Valet* (`/valet/servizi`).

**Setup prenotazione del servizio** (usato al momento della richiesta): **Giorni preavviso** (`noticeDays`, alimenta la data minima consegna = oggi + preavviso), **Fascia oraria** (`slotHours`: 1 / 2 / 4 ore — durata delle fasce di consegna a tendina), **Ora minima di inserimento** (`minOrderTime`) e **Ora massima di inserimento** (`maxOrderTime`). Le due ore delimitano anche la **generazione delle fasce di consegna a tendina** nel form (da min a max, default **06:00–22:00**, passo = fascia oraria). Nuovo flag **Consenti orario di consegna flessibile** (`allowFlexibleTime`): se attivo, nel form consegna compare l'opzione per una fascia libera dalle–alle; se disattivo si può scegliere solo una fascia predefinita. Campi su `ServiceType`: `noticeDays`, `slotHours`, `minOrderTime`, `maxOrderTime`, `allowFlexibleTime`. **[NUOVO]**

Tutte le **formule di prezzo** sono centralizzate nel modulo **`api/src/calculations`** (endpoint `POST /api/v1/calculations/preview`) e consultabili/provabili nella pagina **Amministrazione → Calcoli**.

### Tipi di servizio partner e relativo calcolo

| Tipo | Calcolo del valore |
|---|---|
| **Vendita** | Vendiamo un prodotto per il partner trattenendo una nostra %. Nella sezione prodotti il **Valore totale** = Σ (prezzo singolo prodotto × qtà), includendo i prezzi impostati come **flessibili**. |
| **A prezzo fisso** | Es. servizio di consegna. **In città**: valore servizio + prezzo/km × max(0, distanza − km inclusi). **Fuori città**: prezzo fuori città × distanza. La **distanza** è calcolata via Google Maps tra ritiro e consegna. Il valore è **esposto nel Listino**. |
| **A ora** | max(1, ore) × prezzo orario (minimo 1 ora, sull'orario di consegna). Valore **esposto nel Listino**. |
| **Magazzino** | prezzo fisso (`servizio prezzo`) + prezzo a pezzo (`price per product` × qtà) + **prezzo consegna** (nuovo). |
| **Aziendale (corporate)** | Non è una formula: il sistema **replica la consegna a un altro partner**, trasformando il servizio da *prezzo fisso* a *vendita* (il valore diventa quindi quello di una Vendita per il partner destinatario). |

> Da confermare: nel "prezzo fisso" fuori città, se al costo `prezzo fuori città × distanza` vada sommato anche il valore base del servizio (attualmente non sommato, come da specifica ricevuta).

## 8. API — note per sviluppatori

- **Base URL**: `https://app.deluxy.it/api` (ambiente sandbox: dev.deluxy.it).
- **Autenticazione JWT**: login → access token con ruoli (admin/expert/partner/operation); `/api/users/me` restituisce l'utente corrente.
- **Convenzioni note**: il valet è "expert" (es. `/api/experts/delivery/experts`); i codici piattaforma vendita sono `shopifysale`, `cakesales`, `businesssales`, `flowerssales`, `deluxyexperiencesales`, `deluxydotcomsales`; gli stati consegna sono `created`, `assigned`, `delivering`, `inPreparation`, `accepted`, `requestCancellation` (+`delivered`, `notDelivered`, `cancelled` in storico); i tipi servizio sono `sales`, `hourlyrate`, `fixedprice`, `corporate`, `warehouseservice`.
- **API key partner** (WooCommerce) generabile in autonomia dalla scheda partner; garantisce l'accesso alle API di invio ordini.

## 9. Piano di modernizzazione (staging)

- **Problema**: Node.js v12 e Angular datati — dipendenze deprecate, difficoltà a integrare strumenti moderni, manutenzione rischiosa.
- **Approccio**: la produzione resta stabile; in parallelo un ambiente di staging con stack aggiornato replica il dominio (utenti/ruoli, consegne, activities, partner, valet, prodotti, vendite, stipendi, regole, finanza) e si migra gradualmente.
- **Nuovo ambiente creato**: `deluxy-platform-next` — monorepo con API NestJS (Node 22 LTS, TypeScript, Prisma, JWT+ruoli, Swagger su `/api/docs`) e frontend Angular moderno standalone/PWA, seed demo, Docker Compose, README con strategia di migrazione (strangler pattern).
- **Benefici**: allineamento agli standard moderni, feature e integrazioni più semplici, sistema live non toccato, possibilità di rinnovare anche la UX.
