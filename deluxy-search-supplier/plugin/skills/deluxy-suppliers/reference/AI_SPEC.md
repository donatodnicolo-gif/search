# Deluxy — Scheda tecnica per AI (SPEC)

Documento di riferimento per qualsiasi AI/sviluppatore che deve modificare l'app **senza romperla**.
Leggi TUTTO prima di scrivere codice. Le sezioni "⚠️ Insidie" contengono gli errori già fatti e risolti: non ripeterli.

---

## 1. Cos'è
App web per **cercare fiorai/pasticcerie vicino a un indirizzo** e **smistare ordini** (Deluxy) ai fiorai locali via **WhatsApp/Email**.
- Front-end: **una pagina** `index.html` (vanilla JS, nessun framework, nessun build step).
- Back-end: **funzioni serverless Vercel** in `api/*.js` (Node, `export default handler`, `fetch` globale).
- Storage: **Upstash Redis** (aka "Vercel KV"), usato via **API REST** (NON la libreria `@vercel/kv`, per evitare dipendenze npm).

## 2. Dove vive
- **Live**: https://search-deluxy.vercel.app
- **Repo**: https://github.com/donatodnicolo-gif/search — branch **`main`**. **Push su main = deploy automatico su Vercel** (~1 min).
- **Cartella nel repo**: tutto sta in **`deluxy-search-supplier/`** (`index.html`, `api/`, questa spec, `plugin/`). Alla root del repo non c'è più nulla dell'app.
- **Progetto Vercel**: `search-deluxy` (team `deluxy`), con **Root Directory = `deluxy-search-supplier`**. Le funzioni serverless sono riconosciute solo dentro `api/` relativo alla Root Directory: se sposti di nuovo i file, aggiorna quell'impostazione o le API vanno offline. Le URL pubbliche restano `/api/...`.
- **Deploy**: NON serve CLI. `git push origin main` e Vercel ricostruisce. Le credenziali GitHub sono in cache (Git Credential Manager).
- **Nessun Node/Python in locale**: per l'anteprima locale c'è un server statico **PowerShell** (`.claude/serve.ps1`, `.claude/launch.json`, porta 5510). Non usare `node`/`python`.

## 3. Accesso (pass code)
- All'avvio `index.html` mostra una **lock screen**: l'utente inserisce il **pass code** = env `APP_PASSWORD` su Vercel.
- Il pass code viene salvato in `sessionStorage` e inviato come header **`x-app-password`** a tutte le API.
- Tutte le API protette confrontano l'header con `process.env.APP_PASSWORD` (401 se diverso).

## 4. Cassaforte impostazioni (KV `config:v1`)
Oggetto JSON in KV alla chiave **`config:v1`**:
```json
{ "googleKey": "AIza...", "proxy": "https://api.allorigins.win/raw?url=",
  "stores": [ { "brand": "deluxyflowers.com", "shop": "fb72b1-2.myshopify.com", "token": "shpat_..." } ] }
```
- I **token Shopify NON escono mai dal server**: `GET /api/config` restituisce `hasToken:true/false`, mai il token.
- `googleKey` invece È restituita al browser (serve alla mappa; proteggila con restrizione referrer su Google Cloud).

## 5. Endpoint API (tutti richiedono header `x-app-password`, tranne webhook)
| Metodo | Path | Cosa fa |
|---|---|---|
| GET | `/api/config` | ritorna config "sanitizzata" (senza token) |
| POST | `/api/config` | salva config; body `{googleKey,proxy,stores:[{brand,shop,token}]}`. **token vuoto = mantiene quello esistente** |
| GET | `/api/order?brand=&number=&debug=` | ordine per numero. Prima cerca in KV (webhook), poi via Shopify Admin col token. `debug=1` elenca i nomi ordini recenti |
| POST | `/api/webhook?brand=` | riceve ordine da Shopify (HTTPS diretto **o** envelope Google Pub/Sub) e lo salva in KV `order:{brand}:{num}` (TTL 60gg) |
| GET | `/api/oauth?shop=&pass=` | avvia OAuth Shopify; il callback salva il token Admin del negozio in `config:v1.stores` |

## 6. Negozi Shopify (3)
| brand (chiave app) | shop (.myshopify.com) | store handle admin |
|---|---|---|
| `deluxyflowers.com` | `fb72b1-2.myshopify.com` | fb72b1-2 |
| `deluxy.it` | `deluxygifts.myshopify.com` | deluxygifts (negozio "DELUXY") |
| `cakedesign.me` | `cakedesign-5921.myshopify.com` | cakedesign-5921 |

- **Ordini NUOVI** → webhook nativo Shopify "Creazione ordine" (JSON) verso `.../api/webhook?brand=<brand>`. Già configurati sui 3 negozi.
- **Ordini PASSATI** → token Admin via OAuth (vedi §8), salvato in cassaforte; `/api/order` interroga l'Admin API.
- ⚠️ **Il payload del webhook NON contiene le immagini dei prodotti.** Perciò `/api/order`, quando l'ordine arriva da KV **senza** `photoUrl`, lo **arricchisce** interrogando l'Admin API (`product { featuredImage { url } }`) e ri-salva l'ordine completo in KV (TTL 60gg). Se manca il token del negozio o il prodotto non ha immagine, risponde con `photoNote` che spiega il motivo (mostrato in `.deal`).

## 7. Variabili d'ambiente su Vercel
`APP_PASSWORD`, `KV_REST_API_URL`, `KV_REST_API_TOKEN` (+ `KV_URL`, `REDIS_URL` iniettati da Upstash), `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`. Opzionale: `WEBHOOK_SECRET`.
Dopo aver aggiunto/cambiato una env → **Redeploy**.

## 8. App Shopify per OAuth (recupero ordini passati)
- App nella **Dev Dashboard** (non "custom app legacy") chiamata **"Smistamento"**, org `DELUXY HOLDING`.
- `client_id = 03b53820d9d734d60027251d54fc9d01`; scope `read_orders,read_customers,read_products`.
- **`app_url` DEVE avere lo stesso host del redirect** = `https://search-deluxy.vercel.app` (vedi ⚠️).
- Installazione/token: apri `/api/oauth?shop=<shop>.myshopify.com&pass=<APP_PASSWORD>` → autorizzi → il token finisce in `config:v1`.

## 9. Generazione messaggio (front-end)
`buildOrderMessage(lang)` produce una richiesta in linguaggio naturale:
> Buongiorno, per {oggi/domani/data} è possibile {prodotto} {variante} x{qtà} da spedire con consegna a {indirizzo} all'ora {fascia}?\n\n💌 Bigliettino: {testo}
- **Lingua** = paese del **negozio** (fiorario/pasticceria), non della consegna. Rilevata da `address_components` (country) di Google → mappa `COUNTRY_LANG` → it/en/fr/de/es. Il pulsante d'invio porta `data-lang`.
- **oggi/domani**: `dateLabel()` confronta la data ordine con oggi/domani (usa `new Date()` del browser — OK nel browser, VIETATO nelle funzioni serverless/script).
- **Foto**: NON nel testo. Per WhatsApp viene **copiata negli appunti** e l'operatore invia il testo e poi fa **Ctrl+V** per allegarla (vedi §9-bis). Per Email va come **link** (mailto non allega file).

## 9-bis. Riepilogo «foto + prezzi» e appunti
Sezione `.deal` in cima al riquadro ordine: miniatura, pulsante **⬇️ Scarica foto**, e tre prezzi (pagato dal cliente · da proporre al fiorario · margine).

**Prezzo da proporre** — `suggestBudget(paid)` ritorna `{value, exact}`:
- `BUDGET_TABLE` (prezzo cliente → budget fiorista): oggi solo `85 → 50`. **Quando arrivano gli altri prezzi vanno aggiunti qui.**
- Fuori tabella: stima `BUDGET_RATIO` (0.59, ricavato da 85→50), marcata a schermo come **«stima — da confermare»** in arancione. Non è una regola aziendale: è un ripiego, l'operatore corregge a mano.

**Appunti (la parte delicata)** — `navigator.clipboard.write()` funziona **solo se il documento ha il focus**. Perciò:
1. La foto si **precarica** appena l'URL è noto (`prefetchPhoto` → `photoFile` originale per il download, `photoPng` per gli appunti).
2. Al click su «Invia richiesta»: **prima** `await copyPhotoToClipboard()` (il PNG è già pronto → si risolve in pochi ms, pagina ancora a fuoco), **poi** `window.open(WhatsApp)`.
3. Mai invertire l'ordine e mai passare una **Promise** al `ClipboardItem`: se la copia finisce dopo l'apertura di WhatsApp, Chrome la rifiuta con *"Document is not focused"*.
4. Se la copia non riesce, il ripiego è il pulsante **Scarica foto** (niente `window.open` dopo un `await`: verrebbe bloccato come popup).

## 10. Contatti (front-end)
- Google Places (`getDetails`): telefono, sito, Maps, orari, valutazione, `address_components`.
- Scraping (solo se `proxy` impostato): **email** + **Instagram** dal sito ufficiale. Instagram mostrato come **DM diretto** `https://ig.me/m/{handle}`.
- **Heuristica WhatsApp**: numero cellulare (IT inizia con 3) = "WhatsApp probabile"; fisso (inizia con 0) = "raro". Non esiste verifica gratuita reale.
- Invio: **WhatsApp** `https://web.whatsapp.com/send?phone=<digits>&text=<enc>`; **Email** `mailto:` con subject+body(+link foto).

## 11. Convenzioni di codice (RISPETTALE)
- `index.html`: un solo file, JS vanilla, testi UI in **italiano**, palette/variabili CSS già definite. Niente framework, niente CDN esterne (a parte Google Maps).
- Funzioni Vercel: `export default async function handler(req,res)`, `fetch` globale, **niente dipendenze npm** (KV via REST). `req.query` per i parametri; `req.body` è già JSON tranne dove `export const config = { api:{ bodyParser:false } }` (solo `webhook.js`, che legge il body grezzo per gestire Pub/Sub).
- KV via REST: `POST {KV_REST_API_URL}` header `Authorization: Bearer {KV_REST_API_TOKEN}`, body `["SET",key,value,"EX",ttl]` / `["GET",key]`.
- Dopo modifiche: `git push origin main` (deploy auto). Verifica con `curl` sugli endpoint live.

## 12. ⚠️ Insidie già incontrate (NON ripeterle)
1. **Token Shopify**: i token `atkn_...` sono **"token di automazione app" (CI/CD)**, NON token Admin di negozio → danno 401 sull'Admin API. Il token valido per leggere ordini si ottiene **solo via OAuth** (o è `shpat_...`).
2. **OAuth "matching hosts"**: `app_url` dell'app Shopify deve avere lo **stesso host** del `redirect_uri`. Se `app_url=https://example.com` e redirect `search-deluxy.vercel.app` → errore `invalid_request`. Imposta `app_url = https://search-deluxy.vercel.app`.
3. **Match numero ordine ESATTO**: cercando l'ordine, accetta il risultato **solo se** `node.name` (togliendo i non-cifre) è uguale al numero richiesto. Ricerche larghe (`name:*`, testo libero) restituiscono l'ordine sbagliato.
4. **Foto WhatsApp**: WhatsApp Web NON allega file via URL. Soluzione = copia negli appunti + Ctrl+V. E il testo si PERDE se alleghi la foto prima di inviarlo → istruisci "invia testo, POI allega foto".
4-bis. **La copia negli appunti richiede il FOCUS** (bug risolto il 16/07/2026): la versione precedente avviava `clipboard.write()` con una Promise e apriva WhatsApp nello stesso istante → quando l'immagine era pronta il focus era su WhatsApp e Chrome rifiutava con *"Document is not focused"*; il `catch` lo nascondeva e il fallback `window.open(foto)` dopo `await` veniva bloccato come popup. Da PC non si incollava nulla. Regola: **precarica la foto, copia PRIMA, apri WhatsApp DOPO** (§9-bis).
5. **`new Date()`/`Math.random()`**: OK nel browser, ma NON nelle funzioni serverless se un domani girano in contesti che li vietano (usare valori passati).
6. **Anteprima locale**: server statico PowerShell (`.claude/serve.ps1`, porta 5510) — serve `deluxy-search-supplier/`. In locale le `/api/*` NON esistono: la lock screen non si sblocca, per collaudare l'interfaccia si nasconde `#lockScreen` e si chiama `populateOrder({...})` da console. (Aggiornamento 16/07/2026: **Node 24 e npm ci sono** — `node --check api/*.js` per il lint di sintassi. Python no.)
6-bis. **Ordine da KV = senza foto**: `/api/order` usciva subito con la copia del webhook (`if (cached) return ...`) e il webhook non include le immagini → foto sempre vuota anche per prodotti che su Shopify l'immagine ce l'hanno. Risolto arricchendo da Admin API (§6). Regola generale: **la cache del webhook è incompleta, non trattarla come la verità completa sull'ordine.**
7. **Google key**: deve stare nel browser (mappa) → proteggila con restrizione **referrer** `https://search-deluxy.vercel.app/*`.
8. **CORS immagine**: si scarica il file con `fetch` e si converte dal **blob locale** (`fetchImageBlob` → `toPngBlob`), così il canvas non è mai "tainted". Se il CDN blocca il CORS si riprova col `proxy` configurato; se fallisce anche quello, il pulsante diventa «⚠️ Foto non scaricabile» e si salva a mano dal link.

## 13. Ricette rapide
- **Aggiungere un negozio**: aggiungilo alla mappa `SHOP_BRAND` in `api/oauth.js` e a `BRAND_BY_SHOP` in `api/webhook.js`; aggiungi il brand a `KNOWN_BRANDS` in `index.html` e all'`<select id="brand">`; crea il webhook su Shopify; fai `/api/oauth?shop=...&pass=...`.
- **Recuperare un ordine** (test): `curl "https://search-deluxy.vercel.app/api/order?brand=deluxyflowers.com&number=2484" -H "x-app-password: <PASS>"`.
- **Diagnostica nomi ordine**: aggiungi `&debug=1`.
- **Cambiare pass code**: cambia env `APP_PASSWORD` su Vercel + Redeploy.
