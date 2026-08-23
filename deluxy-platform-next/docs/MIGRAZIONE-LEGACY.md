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

### ❓ Domande aperte

1. **`active = 0` cosa significa?** Sono **6 righe** (4 partner, 2 valet). `1` è attivo e `-1` è «non
   attivato»: `0` sarebbe «disattivato/sospeso», ma è un'ipotesi e riguarda l'accesso.
2. **I 4.514 Customer vanno importati da qui?** Non hanno password: nel legacy non sono account, sono
   scorciatoie verso la tabella `customer` (via `extraId`). Se `customer` contiene già tutto, queste
   4.514 righe **non servono** e i clienti si importano da lì. Si decide vedendo `customer.csv`.
3. **Le 9 righe senza `extraType`** (oltre ai 2 superadmin): che utenti sono?

---

## Prossime tabelle

`provinces` · `partner` · `expert` · `customer` · `product` · `delivery`

`expert` è la più utile subito: incrociandola con i 283 valet si chiude anche la domanda 1.
