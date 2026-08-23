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

## Prossimo passo

Profilare `customer`, `partner`, `expert` e `provinces` — sono piccole e chiudono la parte anagrafica.
`delivery` (62.376 × 114) va affrontata dopo, da sola.
