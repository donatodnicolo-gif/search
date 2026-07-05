# Configurazione — Smistamento ordini

L'app ha due parti:
- **Front-end** (`index.html`): ricerca fiorai/pasticcerie + form ordine. Gira nel browser.
- **Back-end** (`api/order.js`): recupera l'ordine da Shopify tenendo i token al sicuro. Serve un hosting che esegue codice → **Vercel** (gratis per questo uso).

## 1) Token Shopify (uno per negozio)
Per ognuno dei 3 negozi (deluxy.it, deluxyflowers.com, cakedesign.me):
1. Admin Shopify → **Settings → Apps and sales channels → Develop apps → Create an app**
2. **Configure Admin API scopes** → attiva almeno: `read_orders`, `read_customers`, `read_products`
3. **Install app** → copia l'**Admin API access token** (inizia con `shpat_...`)
4. Segna anche il dominio tecnico del negozio, tipo `deluxy.myshopify.com`

## 2) Pubblica su Vercel
1. Vai su [vercel.com](https://vercel.com) → registrati con GitHub
2. **Add New → Project** → importa il repo `donatodnicolo-gif/search`
3. Lascia tutto di default → **Deploy**
4. Ottieni un URL tipo `https://search-xxx.vercel.app` (qui funzionano SIA la ricerca SIA gli ordini)

## 3) Variabili d'ambiente su Vercel
Project → **Settings → Environment Variables**, aggiungi:

| Nome | Valore |
|------|--------|
| `APP_PASSWORD` | una password a tua scelta (la digiterai nell'app) |
| `SHOP_DELUXY` | `deluxy.myshopify.com` |
| `TOKEN_DELUXY` | `shpat_...` di deluxy |
| `SHOP_DELUXYFLOWERS` | `deluxyflowers.myshopify.com` |
| `TOKEN_DELUXYFLOWERS` | `shpat_...` di deluxyflowers |
| `SHOP_CAKEDESIGN` | `cakedesign.myshopify.com` |
| `TOKEN_CAKEDESIGN` | `shpat_...` di cakedesign |

Dopo aver aggiunto le variabili: **Deployments → Redeploy** (per applicarle).

## 4) Nell'app
- Apri l'URL Vercel → pannello ⚙️ → inserisci **Password operatore** (uguale ad `APP_PASSWORD`) e la **Google API key**.
- Lascia vuoto "URL backend ordini" (stesso sito).

## 5) Proteggi la chiave Google
In Google Cloud → Credenziali → chiave → **Referrer HTTP**, aggiungi il dominio Vercel:
```
https://search-xxx.vercel.app/*
```

## Recupero automatico ordini SENZA token (Webhook + KV)
Alternativa al token Shopify: Shopify "spinge" gli ordini nuovi verso il backend, che li salva.

### a) Attiva l'archivio KV su Vercel
1. Progetto Vercel → **Storage** → **Create Database** → **KV** (Upstash) → **Create**
2. **Connect** al progetto `search-deluxy` → Vercel aggiunge da solo `KV_REST_API_URL` e `KV_REST_API_TOKEN`
3. **Redeploy** il progetto

### b) Crea il webhook in Shopify (per ogni negozio)
1. Admin Shopify → **Impostazioni → Notifiche → Webhook** (in fondo) → **Crea webhook**
2. Evento: **Creazione ordine** · Formato: **JSON**
3. URL:
   ```
   https://search-deluxy.vercel.app/api/webhook?brand=deluxyflowers.com
   ```
4. Salva. Da ora ogni **nuovo** ordine viene salvato e sarà recuperabile nell'app col suo numero (pulsante "Da Shopify").

> Nota immagine prodotto: il webhook nativo di Shopify NON include la foto. Per averla in automatico serve **Shopify Flow** (azione "Invia richiesta HTTP") con nel corpo l'URL immagine del prodotto, oppure si incolla il link a mano nell'app. Il backend è già pronto a leggere l'immagine se presente nel payload.

### c) (facoltativo) Proteggi il webhook
Env `WEBHOOK_SECRET` su Vercel + aggiungi `&key=IL_SEGRETO` all'URL del webhook.

## Alternativa: consegna via Google Cloud Pub/Sub
Metodo ufficiale Shopify più robusto (ritentativi automatici). Il backend è già pronto a riceverlo.

1. **GCP → Pub/Sub → Crea topic** (es. `shopify-orders`).
2. Sul topic → **⋮ → Visualizza autorizzazioni → Aggiungi entità (principal)**:
   - Principal: `delivery@shopify-pubsub-webhooks.iam.gserviceaccount.com`
   - Ruolo: **Pub/Sub Publisher**
3. Crea una **subscription di tipo PUSH** sul topic, endpoint:
   ```
   https://search-deluxy.vercel.app/api/webhook?brand=deluxyflowers.com
   ```
4. Crea l'iscrizione webhook lato Shopify con la mutation Admin (`pubSubWebhookSubscriptionCreate` è **deprecata** → usa `webhookSubscriptionCreate`):
   ```graphql
   mutation {
     webhookSubscriptionCreate(
       topic: ORDERS_CREATE,
       webhookSubscription: {
         pubSubProject: "IL_TUO_PROGETTO_GCP",
         pubSubTopic: "shopify-orders",
         format: JSON
       }
     ) { webhookSubscription { id } userErrors { field message } }
   }
   ```
   Questa mutation richiede accesso Admin API. Modo **senza token**: installa l'app gratuita **"Shopify GraphiQL App"** (di Shopify) e incolla lì la mutation — usa la sessione del negozio, nessun token da copiare.

> Nota: Pub/Sub o HTTPS, il payload è lo stesso e **non include la foto** del prodotto. Per l'immagine automatica serve Shopify Flow (vedi sotto) o incollare il link a mano.

## Regola budget
In `index.html`, cerca `BUDGET_TABLE`: aggiungi le righe `prezzoCliente: budgetFiorario` man mano che le definiamo.
Ora c'è solo `{ 85: 50 }`; per gli altri importi l'operatore inserisce il budget a mano.
