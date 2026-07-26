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
- `urlNotifica` deve essere **https**.

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

Parametri: `stato`, `riferimentoEsterno`, `limite` (max 200).
Un'app vede **solo le proprie** richieste. L'IBAN torna mascherato.

## `GET /api/v1/richieste/<id o riferimento>`

Stato di una richiesta, con `firmeRaccolte` / `firmeNecessarie`. I nomi degli
operatori che hanno firmato non escono: restano dentro Transactions.

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
  "stato": "approvata", "importoCent": 24990, "valuta": "EUR",
  "decisaIl": "2026-07-26T12:05:11.000Z", "pagataIl": null }
```

**Verifica sempre la firma** prima di dare retta al contenuto. La notifica è un
avviso, non una prova: la fonte di verità è `GET /api/v1/richieste/<rif>`.

## Stati

| Stato | Significato |
|---|---|
| `in_attesa` | aspetta una firma |
| `sospesa` | un operatore ha chiesto un chiarimento |
| `approvata` | firmata, pronta per la distinta |
| `in_lotto` | inserita in una distinta SEPA |
| `pagata` | la distinta è stata segnata come pagata |
| `rifiutata` | un operatore ha detto no |
| `annullata` | ritirata dall'app di origine |
