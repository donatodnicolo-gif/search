# API di Deluxy Transactions

Come un'app Deluxy chiede un pagamento. Client pronto da copiare:
[esempio-client.mjs](esempio-client.mjs).

Base: `https://deluxy-transactions.vercel.app` (in sviluppo `http://localhost:3160`).

## Autenticazione: chiave **e** firma

Ogni chiamata porta cinque header:

```
x-api-key:            trx_…            la chiave dell'app
x-deluxy-timestamp:   1785067602183    millisecondi epoch, tolleranza ±5 minuti
x-deluxy-nonce:       <stringa unica>  usabile una volta sola, max 80 caratteri
x-deluxy-signature:   sha256=<hmac>    firma del corpo
x-idempotency-key:    <facoltativo>    stesso valore = stessa risposta
```

La firma è `HMAC-SHA256(segreto, stringa)` in esadecimale, dove la stringa è:

```
<METODO>\n<percorso con query>\n<timestamp>\n<nonce>\n<SHA-256 del corpo>
```

Il corpo è la stringa JSON esatta che si invia (vuota per le GET). Chiave e
segreto si ottengono dalla pagina `/chiavi` o con `npm run chiave`: si vedono
**una volta sola**.

```js
const corpo = JSON.stringify(dati);
const daFirmare = [metodo, percorso, timestamp, nonce, sha256(corpo)].join("\n");
const firma = createHmac("sha256", SEGRETO).update(daFirmare).digest("hex");
```

## `POST /api/v1/richieste`

```json
{
  "importo": "249,90",
  "beneficiario": "Fioreria Bianchi SRL",
  "iban": "IT60X0542811101000000123456",
  "bic": "BCITITMM",
  "causale": "Ordine DLX-10422 consegna 12/08",
  "note": "Richiesto in chat dal fornitore",
  "categoria": "fornitori",
  "scadenza": "2026-08-12",
  "riferimentoEsterno": "conversazione-8842",
  "urlNotifica": "https://tua-app.vercel.app/api/pagamenti/notifica"
}
```

- `importo` accetta numero o stringa, virgola o punto (`"1.234,56"`, `1234.56`).
  Internamente diventa **centesimi interi**.
- `causale` è obbligatoria, massimo 140 caratteri (limite SEPA).
- `riferimentoEsterno` rende la chiamata ripetibile: la stessa coppia
  `(app, riferimentoEsterno)` non crea una seconda richiesta.
- `urlNotifica` deve essere **https**; se la chiave ha un webhook di default,
  l'override per-richiesta deve stare sullo **stesso host**.
- **`metodo`** (dal 28/08/2026, facoltativo, default `"iban"`): come si vuole
  pagare — `iban | link | paypal | carta | altro`. Con `iban` valgono le regole
  di sempre (IBAN obbligatorio, checksum). Con gli altri l'IBAN non serve e ci
  va **`riferimentoPagamento`**: il link (solo http/https), l'indirizzo
  PayPal, la nota per la carta (MAI il numero: un numero di carta riconosciuto
  nel testo — Luhn — fa rifiutare la richiesta con `400`). ⚠️ Un metodo
  diverso da `iban` **non entra mai in distinta SEPA né nei bonifici Qonto**:
  lo paga a mano un operatore, che lo chiude come «pagata fuori dall'app»
  (`pagatoCon: "fuori_app"`).
- **`categoria`** è l'imputazione di spesa, non il tipo di app (quello è
  l'`origine`, cioè il nome della tua chiave). Vocabolario in uso:
  `fornitore` (CS e Scout), `partner` (Finance), `valet` (piattaforma
  consegne), oppure una categoria di Budgets per le richieste libere.

Risposta `201` (o `200` se già esistente):

```json
{
  "riferimento": "TRX-2026-000002",
  "id": "cms1qufhv0004i6ugdpk3m0n8",
  "stato": "in_attesa",
  "rischio": 15,
  "motiviRischio": ["primo pagamento a questo beneficiario"],
  "doppiaFirma": false,
  "ripetuta": false,
  "nota": "Richiesta registrata. Nessun pagamento parte finché non è approvata da un operatore."
}
```

Errori: `400` dati non validi (IBAN, importo, causale), `401` chiave/firma/marca
temporale, `403` oltre il tetto o permesso mancante, `409` nonce già usato o
chiave di idempotenza riusata con un corpo diverso, `429` troppe richieste.

## `GET /api/v1/richieste`

Parametri: `stato`, `riferimentoEsterno`, `limite` (max 200) e
**`aggiornateDa`** (ISO 8601). Un'app vede **solo le proprie** richieste.
L'IBAN torna mascherato; dal 28/08 ogni riga porta anche `metodo`,
`pagatoCon` e `aggiornataIl`.

**`aggiornateDa` è il pull di recupero** (Standard §7.3.5): il webhook è un
avviso che può perdersi — questo è il canale con cui ritiri TUTTI i cambi
(pagate, annullate, rifiutate) dopo un certo istante, ordinati dal più
vecchio. Se tieni uno specchio locale dello stato, riconcilialo da qui in un
cron, avanzando il segnalibro all'`aggiornataIl` dell'ultima riga ricevuta.

## `GET /api/v1/richieste/<id o riferimento>`

Stato di una richiesta, con `firmeRaccolte` / `firmeNecessarie`, `metodo`,
`pagatoCon` e l'elenco `allegati` (solo metadati: id, ruolo, nome, tipo, byte,
sha256). I nomi degli operatori che hanno firmato non escono: restano dentro
Transactions.

## Allegati

- `GET /api/v1/richieste/<id|rif>/allegati` — i metadati.
- `GET /api/v1/richieste/<id|rif>/allegati/<allegatoId>` — i **byte**
  (attachment; l'intestazione `x-allegato-sha256` permette di verificare il
  file scaricato).
- `POST /api/v1/richieste/<id|rif>/allegati` — corpo
  `{ "nome": "fattura.pdf", "dati": "<base64>" }`: allega un documento **a
  corredo** della richiesta (ruolo `richiesta`). Immagini png/jpg/webp/gif o
  PDF, max 1,5 MB, max 5 per richiesta; il tipo si verifica sui magic bytes.
  Lo stesso file due volte non si duplica (`ripetuto: true`).
- La **prova del pagamento** (ruolo `prova`) la carica SOLO un operatore
  dentro Transactions: chi ha chiesto il pagamento non scrive la propria
  prova. Quando compare, arriva un webhook coi suoi metadati: scaricala con la
  GET qui sopra.

⚠️ Interim dichiarato (giuria 28/08): i byte vivono nel database, in una
tabella separata dai metadati. Soglia di migrazione a object storage: 500 MB
complessivi o 2.000 allegati.

## `POST /api/v1/estrai` — lettura AI

Corpo `{ "testo": "…" }` **oppure**
`{ "immagine": { "dati": "<base64>", "tipo": "image/png" } }` (max 1,5 MB).
Risposta: `{ dati: { iban, intestatario, importo, valuta, causale },
ibanValido, ibanPaese, fornitore }`.

Le regole: l'AI **propone**, il checksum mod-97 **decide** (`ibanValido` lo
calcola il codice, non il modello); l'esito **non deve mai alimentare una
scrittura senza conferma umana** — riempie un modulo che una persona rilegge.
Rate limit dedicato: 10 letture al minuto per app (fail-closed). Se la lettura
non è configurata risponde `503`: il modulo si compila a mano.

## `POST /api/v1/richieste/<id o riferimento>/annulla`

Corpo facoltativo `{ "motivo": "…" }`. Funziona solo finché la richiesta è
`in_attesa` o `sospesa`: dopo l'approvazione la decisione non è più di chi ha
chiesto. Risposta `409` se è troppo tardi.

## `GET /api/v1/health`

Aperta, senza firma. Dice solo se l'app è viva e configurata.

## Notifiche (webhook)

Se hai passato `urlNotifica`, a ogni cambio di stato arriva un `POST` firmato
con **lo stesso segreto HMAC** della tua chiave:

```
x-deluxy-timestamp: <ms>
x-deluxy-signature: sha256=<hmac di "<timestamp>\n<sha256 del corpo>">
x-deluxy-evento:    richiesta.stato
```

```json
{ "riferimento": "TRX-2026-000002", "riferimentoEsterno": "conversazione-8842",
  "stato": "approvata", "importoCent": 24990, "valuta": "EUR", "metodo": "iban",
  "decisaIl": "2026-07-26T12:05:11.000Z", "pagataIl": null,
  "pagatoCon": null, "motivo": null,
  "allegati": [ { "id": "…", "nome": "ricevuta.pdf", "tipo": "application/pdf",
                  "byte": 88214, "ruolo": "prova", "sha256": "…" } ] }
```

- `pagatoCon` dice **come** è uscito il denaro: `"distinta"` (file SEPA),
  `"qonto"` (bonifico partito dall'API) oppure `"fuori_app"` — pagato altrove e
  registrato a mano da un operatore. `null` finché non è pagata.
  **`"fuori_app"` va trattato diversamente**: di quel pagamento questa app non ha
  una prova propria, ha la parola di chi l'ha registrato.
- `motivo` c'è quando la richiesta è stata chiusa a mano (annullata, o segnata
  già pagata altrove): è il testo scritto dall'operatore.

I due campi sono **aggiunti**, non sostituiti: chi legge solo `stato` continua a
funzionare com'era.

- `allegati` porta i **metadati** (mai i byte): la `prova` è la ricevuta del
  pagamento caricata dall'operatore — scaricala con la GET degli allegati e
  verifica lo `sha256`.

**Verifica sempre la firma** prima di dare retta al contenuto. La notifica è un
avviso, non una prova: la fonte di verità è `GET /api/v1/richieste/<rif>`.

**Affidabilità (dal 28/08/2026)**: ogni notifica si ritenta fino a 3 volte
(subito, +30 s, +5 min), **rifirmata ogni volta con timestamp fresco** — la
tua finestra di ±5 minuti va verificata sul timestamp dell'header, non su
quando è nato l'evento. Il tuo receiver dev'essere **idempotente**: la stessa
notifica può arrivare due volte (rispondi 200 subito, fai il lavoro pesante
dopo, e un secondo arrivo con lo stesso stato non deve rifare effetti — mail,
avanzamenti). Se dopo 3 tentativi non sei raggiungibile, la notifica resta
«fallita» in Transactions (rilanciabile a mano) e te la recuperi col pull
`?aggiornateDa=`.

## Stati

| Stato | Significato |
|---|---|
| `in_attesa` | aspetta una firma |
| `sospesa` | un operatore ha chiesto un chiarimento |
| `approvata` | firmata, pronta per la distinta |
| `in_lotto` | inserita in una distinta SEPA |
| `pagata` | la distinta è stata segnata come pagata, il bonifico è partito, **oppure** un operatore ha registrato un pagamento avvenuto altrove (`pagatoCon: "fuori_app"`) |
| `rifiutata` | un operatore ha detto no |
| `annullata` | ritirata dall'app di origine, oppure annullata a mano da un operatore (arriva col `motivo`) |

Una richiesta `annullata` o `rifiutata` è una partita chiusa **senza**
pagamento: il dovuto è ancora lì e l'app che l'aveva chiesta può richiederlo di
nuovo.
