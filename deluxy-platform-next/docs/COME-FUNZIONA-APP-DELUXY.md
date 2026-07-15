# COME FUNZIONA L'APP DELUXY

**MANUALE COMPLETO — EDIZIONE AGGIORNATA**

> Aggiornato il 14 luglio 2026 — integra la mappatura completa di app.deluxy.it (ogni sezione, bottone, filtro e opzione verificati direttamente in app con utenza Admin), il codice del backend reale e i chiarimenti dell'utente.
> Le parti contrassegnate con **[NUOVO]** sono funzionalità rilevate nell'app reale/backend e assenti nel manuale precedente.
>
> **📌 Questo `.md` è la VERSIONE VIVA adatta a Claude: è la fonte di verità funzionale per lo sviluppo di `deluxy-platform-next` e va aggiornata a ogni nuova scoperta.** Regola: quando si verifica una schermata reale, rileggere e integrare qui; se un campo/opzione ha semantica dubbia, chiederla all'utente e poi documentarla.
> **Word sempre aggiornato** (per le persone): `docs/COME-FUNZIONA-APP-DELUXY.docx`, generato da questo `.md` con `npm run doc:word` — non modificarlo a mano. Snapshot storico originale: `docs/COME-FUNZIONA-APP-DELUXY-AGGIORNATO-2026-07.docx`.
>
> **Changelog**
> - 14/07/2026 — chiarita la semantica del codice di consegna (`UNIQUE_PER_DELIVERY` = OTP per consegna reinviabile dal valet; `UNIQUE_PER_CUSTOMER` = codice fisso tipo PIN, rigenerabile dalla boutique in Customers); ritiro multiplo (scelta dell'indirizzo in fase di consegna); KM inclusi = dentro il comune / extra fuoricittà = fuori dal comune, verificato all'inserimento consegna.

---

## 1. Architettura tecnica e stato attuale

- **Frontend**: Angular (SPA) servita su https://app.deluxy.it — versione datata, da ammodernare.
- **Backend**: Node.js v12 (obsoleto; ultima LTS: v24) con API REST su `https://app.deluxy.it/api/*`.
- **Autenticazione**: JWT (Bearer token) con ruoli nel payload (`admin`, `expert`, `partner`, `operation`); endpoint `/api/auth`, `/api/users/me`.
- **Integrazioni attive rilevate**: Google Maps (geocoding/mappe), Stripe (pagamenti), Qonto (banking, da Profilo), Web Push Notification (`/api/web-push-notification`), SMS, WhatsApp, WooCommerce (plugin `deluxy-send-order`), Shopify (prodotti e piattaforme di vendita). **[NUOVO]**
- **Endpoint API osservati**: `/api/users/me`, `/api/auth/<token>`, `/api/experts/delivery/experts`, `/api/web-push-notification/count/:id`. Il ruolo "valet" nelle API si chiama **"expert"**.

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

**Stati utente** (pagina Utenti): Attivo, Disattivo, Da convalidare, Sconosciuto. Ruolo assegnabile in linea: nessuno / admin / expert / partner / operation.

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
- Azioni per riga: DETTAGLI, MODIFICA, ASSEGNA, MONITORARE, **ADDITIONAL VALET +/-** (aggiunta/rimozione valet extra su una consegna). **[NUOVO]**
- **Vista team leader in Consegne**: un valet **team leader** può, in questa schermata, **vedere tutte le consegne (delle sue province) oppure filtrare per vedere solo le proprie** — ha un filtro "tutte / solo le mie". Un valet normale vede solo le proprie. **[NUOVO]**

#### Dettaglio consegna (`/consegne/:id`)

- Azioni in alto: STAMPA · MAPS · SHARE · DELIVERED LINK · ASSEGNA.
- Toggle: **VERIFICA DELL'IDENTITÀ VALET** e **CODICE DI CONSEGNA RICHIESTO**. **[NUOVO]**
- Sezioni: Dati di consegna e ritiro (stato, data, fascia oraria, ora ritiro, consegna flessibile, valet) · Scelta del servizio (partner, nome/tipo servizio, prezzo, plus/minus al prezzo) · Informazioni destinatario e mittente (cognome/nome, SMS telefonici, indirizzo, citofono, telefono, email; cognome/nome/telefono mittente) · Gestione dell'ordine (pagamento alla consegna, contanti da incassare, prova e reso del prodotto, prodotto, immagine, quantità, variante) · Receipt info (nome di chi ha ricevuto, ricevuta) · Documentazione e note (numero DDT, file DDT, note, PERSONALIZZAZIONE, note interne) · Storico consegna (log con data/ora: inserita, partita, effettuata).
- Visibilità per ruolo: Partner vede valet/mezzo/telefono ma non note interne né costi consegna dei propri servizi; Valet vede note e note interne; Admin/Operation vedono tutto + logs. Nessuno vede l'indirizzo di ritiro nelle colonne della lista.

#### Form "Nuova consegna" (`/consegne/nuovo`) — campi completi

Data consegna\* · Indirizzo destinatario · Partner · Servizio\* · Fascia oraria consegna (+flag flessibile) · Fascia oraria ritiro\* (+flag flessibile) · Prodotto, quantità, prezzo flessibile · Vendita Deluxy · Valet · Valet Servizio · Stato consegna · Stato del pagamento · SMS telefonici · Pagamento alla consegna (+prezzo contanti) · Prova e reso del prodotto · Customer esistente (CHOOSE EXISTING CUSTOMER) o SAVE CUSTOMER · Cognome/Nome destinatario\* · Citofono\* · Telefono/Email destinatario · Cognome/Nome/Telefono mittente · DA FATTURARE (indirizzo di ritiro, prezzo, plus prezzo) · DA PAGARE (valet salario, plus/minus) · Numero DDT + file DDT · Note · PERSONALIZZAZIONE · Note interne · CODICE DI CONSEGNA RICHIESTO.

**Regole**: obbligatori giorno, servizio, orario ritiro, nome e cognome destinatario, indirizzo, citofono, prodotto. In base all'indirizzo vengono proposti i partner della provincia. La fascia minima per servizi orari è 1 ora. Il sistema associa automaticamente il tipo servizio partner al salario valet (fisso↔fisso, ora↔ora, vendita↔fisso). Con SMS telefonici parte il messaggio secondo i Modelli SMS (creata/partita/arrivata). Prodotti del partner mostrati per primi in grassetto. Per prezzo fisso: calcolo automatico distanza ritiro→consegna con extra KM per il partner e rimborsi valet. Consegne con stesso DDT: più ritiri in Activities, una sola consegna. Note interne visibili solo ad Admin/Operation/Valet.

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
- **Partner Magazzino**: flag `partnerHasWarehouse` che qualifica il partner come magazzino. **[NUOVO]**
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

- **Personal information**: Cognome\*, Nome\*, E-mail\*, Telefono\*, Indirizzo\*, **Partita IVA** (opzionale), **Codice Fiscale\*** (obbligatorio), **Luogo di nascita (e provincia)**, Data di nascita, coordinate bancarie (IBAN), Percentuale Ritenuta. **[NUOVO — nel form reale il CF è obbligatorio, la P.IVA no]**
- **Salary Frequency Setting**: frequenza dello stipendio\* (`salaryFrequency`: MENSILE / SETTIMANALE) e limite di deposito settimanale (`weeklyDepositLimit`). **[NUOVO]**
- **Team Leader**: flag `isTeamLeader`; quando attivo si impostano le **PROVINCE** in cui il team leader può vedere/assegnare consegne in autonomia e i **PARTNERS** associati (es. SWISS FOOD, ECI).
- **Valet Province**: province in cui il valet opera (distinte da quelle del team leader).
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
- **Form "Nuovo prodotto"** (verificato): Nome\*, Partner, Prodotto Categoria\*, SKU, Giorni Preparazione, **Plus del prodotto** (max 80 char)\*, Descrizione (editor rich text), Prezzo, Prezzo pubblico, Linea, Immagine; flag **Non modificabile**, **Prodotto unico**; **Inventory management** (Controlla stock, nome alternativo); **Shopify connection** (Approvato, Attivo, Not physical, Select platforms + descrizione per piattaforma). **[NUOVO — campi del form prodotto]**

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

**Step successivi alla registrazione**:
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
