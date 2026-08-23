# Migrazione dei dati dal database originario (MySQL) al nuovo ambiente

Documento vivo. Si riempie **una tabella alla volta**, e solo dopo averla misurata.

**Metodo, in quest'ordine e mai al contrario:** misurare → mappare → importare.
`ANALISI-BACKEND-LEGACY.md` descrive 76 entità lette dal **codice**: non può dire quali colonne siano
davvero popolate né quali valori esistano per davvero. Le decisioni qui sotto nascono dai **dati**,
prodotte con `scripts/profila-export-legacy.mjs` sugli export in `legacy/` (mai committati).

Vale la regola di casa: **i dati critici non si deducono**. Dove il legacy non dice, il nuovo record
scrive «non indicato» — non un valore plausibile.

---

## `user` → `User` + `Customer` — misurata il 23/08/2026 (5.087 righe)

### Com'è composta

| `extraType` | `groupId` | righe | diventa |
|---|---|---|---|
| Customer | 6 | **4.514** | *(probabilmente niente — vedi domanda 2)* |
| Expert | 2 | 283 | `User` ruolo `VALET` + `Valet` |
| Partner | 3 | 259 (+4 senza group) | `User` ruolo `PARTNER` + `Partner` |
| Operation | 4 | 15 (+1 con group 1) | `User` ruolo `OPERATION` + `Operation` |
| *(vuoto)* | 1 / vuoto | 11 | 2 sono `isSuperAdmin=1` → `ADMIN`; gli altri 9 da decidere |

`groupId` è **ridondante** con `extraType` (corrispondenza 1:1 verificata): non serve la tabella `group`.

### Mappatura campo per campo

| legacy | nuovo | nota |
|---|---|---|
| `id` | `legacyId` **(campo nuovo, da aggiungere)** | serve a ricollegare `delivery`/`expert`/… e a rendere l'import **ripetibile**: senza, una seconda esecuzione duplica tutto |
| `email` | `email` | 5.087 valori distinti su 5.087 righe: **già unica**, nessun conflitto |
| `password` | `passwordHash` | ✅ **copia diretta**: il legacy usa `$2a$10$`/`$2b$10$` e il nuovo `bcryptjs` con `compare()` — **le persone tengono la password che hanno** |
| `active` | `status` | `1`→`active` · `-1`→`invited` (**«non attivato»**, confermato dall'utente) · `0`→ *da confermare, 6 righe* |
| `deletedAt` | `status: archived` | asse **indipendente** da `active` (26 righe, sparse su tutti i valori di `active`) → **`deletedAt` vince** |
| `name` / `surname` | `firstName` / `lastName` | 99% piene |
| `extraType` + `extraId` | relazione | il legame polimorfo: `Expert`→`Valet`, `Partner`→`Partner`, `Operation`→`Operation` |
| `isSuperAdmin` | ruolo `ADMIN` | vale `1` su **2 righe soltanto** |
| `createdAt` / `updatedAt` | idem | il più vecchio è del **21/07/2020** |
| `partnerComplainEmail`, `valetComplainEmail` | **`AppSetting`** | valorizzate su **una riga sola**: non sono campi dell'utente, sono impostazioni globali finite lì dentro |
| `emailToken` | ❌ | token di invito temporaneo, non ha senso migrarlo |
| `sensibleUpdateAt` | ❌ | nessun corrispettivo nel nuovo schema |
| `secretOtp`, `backupCodes`, `qontoAccessToken`, `qontoRefreshToken` | ❌ | **sempre vuote**: mapparle creerebbe campi finti |

### ⚠️ Da sapere prima di importare

- **`NULL` è una stringa, non un vuoto.** Nell'export CSV il campo vuoto è il testo `"NULL"`
  (4.631 righe sulla sola colonna `password`). Un importatore che non lo traduce scrive la parola
  «NULL» dentro i campi — e su `passwordHash` significherebbe **4.631 account con la stessa password
  inesistente**. Il profilatore lo gestisce già; l'importatore dovrà farlo esplicitamente.
- 🔴 **42 account condividono 7 password.** Un solo hash è in uso su **25 account** (15 partner +
  10 valet), un altro su 5, e altri cinque su 2-3. Sono password copiate a mano fra collaboratori.
  Migrando gli hash tali e quali **il problema si porta dentro**: vanno forzate al cambio, o quei
  25 account nascono già condivisi.

### Domande chiuse dall'utente il 23/08

- **`active = 0` → si tratta come `-1`**, quindi `invited`. Riguarda 6 righe.
- **I 4.514 clienti si importano come `Customer`.** ⚠️ Vedi però il nodo qui sotto sulla password.

### Le 11 righe senza `extraType` — risolte

Non sono 9 ma **11**, e si dividono in tre gruppi:

| chi | righe | cosa fare |
|---|---|---|
| `support@deluxy.it` — `groupId 1`, `isSuperAdmin=1`, attivo dal **21/07/2020** | 1 | è l'admin storico: **importare** |
| un account **`@jamtech.info`**, `isSuperAdmin=1`, attivo, creato il 13/06/2023 | 1 | è lo **sviluppatore esterno** (`jamtechdev/deluxy-backend`): decidere se ha ancora senso |
| account orfani del 2020-2021: nessun `groupId`, nessun `extraId`, **5 su 9 con email `@yopmail.com`** (servizio di indirizzi usa-e-getta), 6 su 9 mai attivati | 9 | sono **prove di collaudo rimaste lì**: non importare |

⚠️ `groupId 1` non è un ruolo di persone: è l'admin, e vale su **3 righe in tutto**.

### 🔴 Nodo aperto: i clienti non possono avere una password

L'utente ha chiesto di importare i clienti «come customer, con una password di default». **Nel nuovo
schema non è possibile così com'è**, ed è bene saperlo prima di scrivere l'importatore:

- `model Customer` (`api/prisma/schema.prisma`) ha `firstName, lastName, email?, phone?, address?,
  notes?, partnerId?` — **nessun campo password, nessuna relazione con `User`**;
- `enum Role` (`api/src/common/enums.ts`) ha `ADMIN, OPERATION, PARTNER, VALET, PROJECT_MANAGER` —
  **non esiste un ruolo cliente**;
- nel legacy i 4.514 clienti **non avevano password** (`NULL` su tutte le righe): non hanno mai fatto
  login nemmeno lì.

Quindi ci sono due strade, e sono lavori diversi:

1. **Importarli come anagrafiche** (`Customer`), senza account. Rispecchia il legacy, è l'import di cui
   stiamo parlando, si fa subito.
2. **Dare loro un accesso** = funzionalità nuova: ruolo `CUSTOMER`, relazione `User`→`Customer`, tutta
   la parte di permessi. Non è una migrazione, è uno sviluppo.

⚠️ E in ogni caso **una password di default uguale per tutti è da evitare**: sarebbero 4.514 account
con la stessa password nota su un indirizzo pubblico. È lo stesso problema che il 21/08 ha richiesto di
sospendere gli account demo del seed. Se serve l'accesso clienti, la strada sana è **una password
diversa per ciascuno** (o nessuna password e accesso via link/OTP), con obbligo di cambio al primo uso.

---

## L'export completo — 92 tabelle, 427.155 record (23/08/2026)

`legacy/deluxy.csv` (209 MB) non era un CSV ma **92 CSV impilati**: phpMyAdmin, esportando più tabelle
insieme, le scrive una dopo l'altra ognuna con la propria intestazione. `scripts/dividi-export-unico.mjs`
lo divide in streaming e riconosce i nomi dalle colonne (phpMyAdmin non li scrive): **75 file** in
`legacy/tabelle/`, le 17 tabelle vuote non producono file.

Le tabelle che servono, con le dimensioni vere:

| tabella | righe | colonne | nota |
|---|---|---|---|
| `delivery` | **62.376** | **114** | l'analisi diceva ~90 colonne: sono **114** |
| `product` | 21.909 | 58 | |
| `products-variants` | 18.375 | 19 | |
| `customer` | **4.514** | 14 | ✅ combacia esatto coi 4.514 utenti `extraType=Customer`, e ha `userId` |
| `partner` | 265 | 41 | (i `user` di tipo Partner erano 263) |
| `expert` | 285 | 25 | (i `user` di tipo Expert erano 283) |
| `operation` | 16 | 14 | combacia esatto |
| `provinces` | 108 | 6 | |
| `user` | 5.087 | 21 | **già dentro il file unico**: `user.csv` a parte è un doppione |

Le più grosse non ancora mappate: `partner-time-availability` 113.191 · `delivery-product` 62.800 ·
`valet-activities` 57.296 · `web-push-history` 19.211 · `delivery-updates` 17.682 · `shopify-sale` 11.055.

⚠️ **Sei tabelle di vendita** hanno 69 colonne quasi identiche (shopify, cake, flowers, business,
deluxy.com, experience) e si distinguono solo per il numero di righe: sono rimaste `tabella-N`,
vanno nominate a mano prima di usarle.

---

## Fase 1 — anagrafiche (23/08/2026)

`scripts/importa-legacy.mjs --fase anagrafiche`. Prima si prova con `--prova`, che simula senza scrivere.

| sorgente | destinazione | righe |
|---|---|---|
| `provinces` | `Province` | 107 (1 scartata) |
| `province-cities` | `City` | 43 |
| `partner` | `Partner` + `User` ruolo `PARTNER` | 265 |
| `expert` | `Valet` + `User` ruolo `VALET` | 285 |
| `operation` | `Operation` + `User` ruolo `OPERATION`/`PROJECT_MANAGER` | 16 |
| `customer` | `Customer` + `User` ruolo `CUSTOMER` | 4.512 (2 senza nome) |
| `user` senza `extraType` | `User` ruolo `ADMIN` | 2 (gli altri 9 non si importano) |

### Modifiche allo schema che sono servite

- **`legacyId Int? @unique`** su 11 modelli. Senza, l'import non è ripetibile e le relazioni del legacy
  (tutte su id numerici) non si possono ricollegare.
- **Ruolo `CUSTOMER` + relazione `User` ↔ `Customer`**: non esistevano, la richiesta di dare un accesso
  ai clienti non era realizzabile così com'era.

Migrazione `20260823125015_legacy_id_e_accesso_clienti`, puramente additiva.

### Le cinque trappole, tutte incontrate davvero

1. **`NULL` è una stringa.** Nell'export il vuoto è il testo `"NULL"`. Senza conversione si scriverebbe
   la parola dentro i campi.
2. **MySQL ammette `0000-00-00 00:00:00`, Postgres no.** In `provinces` metà delle date è la data zero:
   passarla fa fallire l'intera riga.
3. **Il codice provincia `TO` è duplicato**: due righe, «Torino» e «Turin». Vince la prima, la seconda
   viene segnalata invece di far esplodere l'indice unico.
4. **Il seed aveva già creato province e utenti senza `legacyId`.** Un upsert sul solo `legacyId` va a
   sbattere sugli indici unici (`MI`, `MB`, gli utenti demo). Serve un aggancio a tre livelli:
   `legacyId` → chiave naturale (codice, email) → creazione. Al secondo passaggio il `legacyId` c'è
   e basta il primo livello.
5. **Il client Prisma va rigenerato** dopo aver toccato lo schema, o l'import muore con
   *Unknown argument `legacyId`* pur avendo la colonna nel database.

### Scelte di sicurezza

- ✅ **Le password si migrano tali e quali**: gli hash legacy sono `$2a$10$`/`$2b$10$` e il nuovo
  ambiente usa `bcryptjs`. Le 421 persone che avevano un accesso lo tengono identico.
- 🔒 **I clienti ricevono una password casuale e diversa per ciascuno**, e nascono in stato `invited`:
  nessuno la conosce, l'accesso passa dal flusso di invito già presente. Una password di default uguale
  per tutti sarebbe stata **4.514 account con la stessa chiave nota su un indirizzo pubblico**.
- 🔒 **Il campo `notes` degli operatori non si migra**: in una riga contiene **una password in chiaro**.
- 🔴 **Resta aperto**: 42 account condividono 7 password (uno stesso hash su 25 fra partner e valet).
  Migrandoli tali e quali il problema entra nel nuovo ambiente: vanno forzati al cambio.

## Fase 2-4 — servizi, listini, regole carnet (23/08/2026)

`--fase servizi` → `--fase listini` → `--fase regole`. In quest'ordine: le consegne hanno il servizio
obbligatorio, e i listini si agganciano ai servizi.

| sorgente | destinazione | righe |
|---|---|---|
| `service` | `ServiceType` scope **partner** | 32 |
| `tabella-38` | `ServiceType` scope **valet** | 8 |
| *(creato qui)* | `ServiceType` «Non indicato» | 1 |
| `partner-service` | `PartnerService` (listino partner) | **528** |
| `expert-service` | `ValetService` (listino valet) | **240** |
| `delivery-rules` | `DeliveryRule` + `DeliveryRulePartner` | 28 (+6 estensioni) |

Zero righe orfane: ogni listino ha trovato il suo partner/valet **e** il suo servizio.

### 🔴 La collisione di id che avrebbe corrotto i listini in silenzio

Nel legacy i cataloghi dei servizi sono **due**, con spazi di id che **si sovrappongono**:

- `service` — 32 righe, id **5-39** — lato **partner**, usato da `partner-service`
- `tabella-38` — 8 righe, id **3-10** — lato **valet**, usato da `expert-service`

Le 240 righe di `expert-service` usano i `serviceId` **3, 5, 8**. Tutti e tre esistono **anche** in
`service`. Agganciandole al catalogo sbagliato, **112 listini valet su 240** sarebbero finiti su un
servizio che non c'entra nulla — **senza nessun errore**, perché l'id esiste davvero.

Nel nuovo schema il catalogo è **uno solo** con un campo `scope`. Per tenere separate le due origini e
restare ripetibili, i servizi valet prendono `legacyId = 900000 + id`.

✅ **Controprova fatta**: dei 240 listini valet importati, **0** puntano a un servizio non-valet; dei
528 partner, **0** puntano a un servizio non-partner. *(Un primo controllo dava 3 falsi positivi: erano
righe del seed, non del legacy — vanno escluse filtrando su `legacyId != null`.)*

### Campi senza destinazione — segnalati, non buttati

| campo legacy | perché non si mappa |
|---|---|
| `partner-service.pricePerItem` (10 righe) | `PartnerService` non ha un prezzo a pezzo |
| `delivery-rules.days` (28 righe) | `DeliveryRule` non ha i giorni della settimana |
| `delivery-rules.serviceType` | nel legacy è un **modello di prezzo** (`fixedprice`), non un servizio: di `PREZZO_FISSO` ce ne sono 10 e sceglierne uno sarebbe inventare. Finisce nel **nome** della regola, dove almeno si vede |
| regole carnet lato **valet** (7 + 44 collegamenti) | nel nuovo schema le regole sono solo dei partner, e il loro JSON di scaglioni `pickUps→plusSalary` non ha un campo corrispondente |

⚠️ **Un'assunzione da confermare**: `expert-service.minimumKmPrice` è stato mappato su
`ValetService.extraKmPrice`. I nomi differiscono, ma i valori sono gli stessi del lato partner
(0, 0,2, 0,5, 1, 1,5, 2…). Se il significato è un altro, va corretto prima di fidarsi delle paghe.

⚠️ `DeliveryRule.name` è obbligatorio e nel legacy **non esiste**: si compone («Regola 8 · prezzo
fisso»). È un'etichetta, non un dato inventato.

## Consegne — misurate, non ancora importate

62.376 righe × **114 colonne**. Decisioni già prese con l'utente il 23/08:

| problema | righe | deciso |
|---|---|---|
| stati che nel nuovo schema non esistono: `deliveredWithTimeToBeApproved` 708, `approved` 550, vuoto 434, `invalidated` 230 | **1.922** | **aggiungere i 3 stati mancanti all'enum**; le 434 senza stato restano `created` (il valore predefinito) |
| senza tipo di servizio, ma è obbligatorio | **17.669** | **servizio «Non indicato»** (creato) |
| senza nome/cognome/indirizzo destinatario | 448 / 396 / 214 | riempire con **«Non indicato»** |
| senza data (141) o senza partner (401) | 542 | **saltare** ed elencarle |

Stati usati davvero: `delivered` 53.415 · `canceled` 3.361 · `notDelivered` 1.745 · `created` 1.629 ·
`assigned` 273 · `requestCancellation` 11 · `accepted` 10 · `notAccepted` 6 · `delivering` 4.
⚠️ La documentazione ne dichiarava 14: quelli **davvero usati sono 12**, e `inPreparation` non compare mai.

⚠️ **97,5% delle consegne non ha un `customerId`**: il destinatario sta nei campi `name`/`surname`/
`address` della consegna stessa. Solo 1.143 sono legate a un cliente in anagrafica.

## Prossime fasi

`catalogo` (categorie, prodotti 21.909, varianti 18.375, servizi) → `consegne` (62.376 × 114 colonne,
più `delivery-product` 62.800 e i log) → il resto (regole, ricevute, disponibilità, vendite).

⚠️ **«Importare tutte le tabelle» non è letteralmente possibile**: parecchie tabelle legacy non hanno
una destinazione nel nuovo schema (le sei di vendita Shopify, `stripe-*`, `emails-webhook`,
`shop-collection`, `offer`, `web-push-history`…). Verranno elencate una per una col motivo, invece di
essere ignorate in silenzio.
