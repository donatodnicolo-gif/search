# Analisi plugin `deluxy-send-order` e contratto di sync ordini

> Analisi del codice sorgente (github.com/deluxy-project/deluxy-send-order, v1.0.0).
> Serve alla nuova piattaforma per **replicare l'endpoint di ingresso ordini esterni** e restare compatibile con i plugin WooCommerce già installati sui negozi partner.

## Come funziona

Il plugin **non accede a nessun database**. È un client HTTP sottile che, al checkout, invia l'ordine WooCommerce all'API REST di Deluxy con una singola `POST`. È il backend a parlare col DB.

```
WooCommerce → hook woocommerce_thankyou → POST JSON
  → https://app.deluxy.it/api/deliveries/sync/woo-order
    header: x-deluxy-partner-key: <chiave partner>
  ← { status, deliveryId, statusCode }
  → salva meta ordine: deluxy_order_id, _deluxy_push_date, _deluxy_sandbox
```

## Endpoint da replicare nella nuova API

| | |
|---|---|
| URL prod | `POST https://app.deluxy.it/api/deliveries/sync/woo-order` |
| URL sandbox | `POST https://dev.deluxy.it/api/deliveries/sync/woo-order` |
| Auth | header `x-deluxy-partner-key: <chiave partner>` (no JWT) |
| Content-Type | `application/json` |
| Trigger | hook `woocommerce_thankyou` |
| Solo se | il metodo di spedizione è tra quelli abilitati (`deluxy_send_order_shipping_methods`) |

Il debug mode è `yes` di default → di fabbrica invia a `dev.deluxy.it`.

## Payload

```json
{
  "ddtNumber": "<order id>", "orderId": "<order id>",
  "name": "...", "surname": "...", "email": "...", "smsPhoneNo": "...",
  "deliveryProducts": [{ "productName": "...", "quantity": 1, "sku": "...", "price": 0.0, "categoryName": "..." }],
  "deliveryDate": "YYYY-MM-DD", "address": "<via, cap, città, prov>", "intercom": "",
  "startTime": "HH:MM", "endTime": "HH:MM", "notes": "<nota + regalo>",
  "senderName": "...", "senderSurname": "...", "senderPhone": "...", "pickUpTime": "",
  "externalOrderSource": "<url negozio>", "province": "<sigla|null>"
}
```

`deliveryDate`/`startTime`/`endTime` estratti da meta field del checkout via regex (default data `^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$`, orari `([01]\d|2[0-3]):([0-5]\d)`). `categoryName` = prima categoria WooCommerce del prodotto.

## Risposta attesa

Successo solo se `status` truthy: `{ "status": true, "deliveryId": <id>, "statusCode": <n> }`. Il plugin salva `deluxy_order_id = deliveryId` e non ritenta (nessuno scheduler).

## Conseguenze per deluxy-platform-next

Il nostro modulo woocommerce oggi usa `x-api-key` e path `/woocommerce/orders`: **non compatibile**. Per non toccare i negozi già configurati va allineato a `POST /api/deliveries/sync/woo-order`, header `x-deluxy-partner-key`, stesso payload e stessa risposta `{ status, deliveryId, statusCode }`.
