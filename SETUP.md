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

## Regola budget
In `index.html`, cerca `BUDGET_TABLE`: aggiungi le righe `prezzoCliente: budgetFiorario` man mano che le definiamo.
Ora c'è solo `{ 85: 50 }`; per gli altri importi l'operatore inserisce il budget a mano.
