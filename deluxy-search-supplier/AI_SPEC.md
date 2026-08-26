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

## 3. Accesso (email + password)
- All'avvio `index.html` mostra una **lock screen**: email + password. Due strade in `api/_auth.js`:
  - **amministratore**: email qualsiasi + pass code principale (env `APP_PASSWORD` su Vercel) → `admin:true`, unico che può salvare le impostazioni;
  - **utenza operatore**: creata dall'admin in ⚙️ Impostazioni → «👥 Utenze dell'app», salvata in `config:v1.utenti`.
- Credenziali in `sessionStorage`, inviate come header **`x-app-user`** + **`x-app-password`** a tutte le API.
- **Chiavi API** (per AI e integrazioni): header **`x-api-key: dlxs_<id>_<segreto>`** al posto di email+password. Create/revocate dall'admin in Impostazioni → «🔑 Chiavi API» (o via `/api/chiavi`); in KV `apikeys:v1` c'è solo `{id, nome, salt, hash}` (scrypt) — il segreto si vede **solo alla creazione**. Nello Storico le azioni compaiono come `chiave:<nome>`. Le chiavi NON sono admin: non possono salvare impostazioni né gestire altre chiavi.
- **Le password delle utenze NON sono in chiaro**: in cassaforte c'è solo `{nome, salt, passHash}` (scrypt, `node:crypto`, confronto `timingSafeEqual`). Hash creato in `config.js` al salvataggio; le voci legacy col campo `pass` in chiaro vengono migrate da sole (al primo login riuscito o al primo salvataggio delle impostazioni). `GET /api/config` restituisce delle utenze solo `{nome}`.

## 4. Cassaforte impostazioni (KV `config:v1`)
Oggetto JSON in KV alla chiave **`config:v1`**:
```json
{ "googleKey": "AIza...", "proxy": "https://api.allorigins.win/raw?url=",
  "kwFioraio": "", "kwPasticceria": "pasticceria, torte, cake design",
  "stores": [ { "brand": "deluxyflowers.com", "shop": "fb72b1-2.myshopify.com", "token": "shpat_..." } ] }
```
- I **token Shopify NON escono mai dal server**: `GET /api/config` restituisce `hasToken:true/false`, mai il token.
- `googleKey` invece È restituita al browser (serve alla mappa; proteggila con restrizione referrer su Google Cloud).
- `kwFioraio`/`kwPasticceria` (24/07/2026): **parole chiave Google personalizzate** per categoria, impostabili in ⚙️ Impostazioni. Più keyword separate da virgola = una `nearbySearch` per ciascuna (i risultati si uniscono, dedup per place_id); a queste si aggiunge SEMPRE la ricerca per sola categoria (`type`). Vuote = predefinite di `KEYWORDS` nella lingua della consegna.
- `mostraFoto` (10/08/2026): `'1'` (predefinito, anche se la chiave non è mai stata salvata) = **foto dei negozi da Google Maps** accese; `'0'` = spente del tutto. Interruttore in ⚙️ Impostazioni (solo admin lo salva, tutte le utenze lo leggono). Vedi §5-bis.
- `mappaTipi` (19/08/2026): tabella **«categoria Shopify → formato»** per il messaggio al fornitore, testo libero tipo `Fiori d'Arte = bouquet, Cake Design = torta` (coppie separate da virgola o a capo, max 2000 caratteri, salvata solo dall'admin). È una **riserva**: il formato si legge prima dai **tag** del prodotto (`items[].tags`), poi da questa tabella applicata al `productType`, poi dalla categoria a parole, infine dal titolo. Vedi §9.
- `pagineRicerca` (17/08/2026): **quante pagine di risultati chiedere a Google per ogni `nearbySearch`** — `'1'` = solo i primi 20 (comportamento fino al 17/08), `'2'` = 40, `'3'` = 60 (**predefinito**, anche se mai salvata). Google dà max 20 risultati per chiamata: le pagine dopo si prendono con `pagination.nextPage()`. Sanificata sul server (`pagine()` in `api/config.js`: intero 1..3, qualunque altra cosa = `'3'`) e sul client (`paginePerRicerca()`). ⚠️ **Ogni pagina è una chiamata Places a pagamento**, moltiplicata per il numero di keyword e per le categorie cercate. Vedi §12-quater.

## 5. Endpoint API (tutti richiedono header `x-app-password`, tranne webhook)
| Metodo | Path | Cosa fa |
|---|---|---|
| GET | `/api/config` | ritorna config "sanitizzata" (senza token) |
| POST | `/api/config` | salva config; body `{googleKey,proxy,stores:[{brand,shop,token}]}`. **token vuoto = mantiene quello esistente** |
| GET | `/api/order?brand=&number=&ts=&debug=` | ordine per numero. Prima cerca in KV (webhook), poi via Shopify Admin col token. `debug=1` elenca i nomi ordini recenti. **Ogni check viene registrato nello Storico** (tipo `check`, esito trovato/non trovato, `ts` = timestamp ISO dal browser) |
| GET | `/api/fornitori?brand=&number=&categoria=&ts=` | **per AI/plugin**: recupera l'ordine, geocodifica la consegna e ritorna i **top 3 fornitori** vicini (nome, telefono, link `wa.me`, sito, aperto ora, valutazione, distanza stradale via OSRM con ripiego linea d'aria). `categoria` opzionale `fiorai|pasticcerie` (default dal brand: cakedesign→pasticcerie). Usa Geocoding+Places REST con la `googleKey` di cassaforte: funziona finché la chiave NON ha restrizione referrer |
| POST/GET | `/api/link` | **handoff senza login** da un'altra app. POST (con `x-api-key`) crea un **codice monouso** (KV `linkcode:` TTL 300s) → `{code,url}`; il browser apre `/?t=<code>[&brand=&ordine=]` e fa GET `/api/link?code=` (senza auth) che consuma il codice e restituisce una **sessione** (KV `session:` TTL 1h, header `x-app-session`). La sessione non è mai nell'URL |
| GET/POST | `/api/chiavi` | **solo admin**: elenca (`{id,nome,creata}`, mai segreti), crea (`{azione:'crea',nome,quando}` → ritorna `dlxs_…` una sola volta), revoca (`{azione:'revoca',id}`) |
| GET/POST | `/api/stato?ordine=<brand#num>` | **stato ricerca fornitore** per ordine (`non iniziata`/`in corso`/`trovato`) + **stelle** sui fornitori contattati (`stelle:{id:{nome,utente,quando}}`; id = place_id Google o `anag:<id>` registro). POST `{ordine, quando, stato?, stella?:{id,nome,on}}`. KV `statoricerca:v1` (max 300 ordini, si potano i meno recenti). Il front-end mette «in corso» + stella in automatico al click su WhatsApp/email |
| POST | `/api/riconcilia` | **riconcilia** un fornitore Google con un contatto del registro: body `{partnerId, quando, ordine?, place:{idEsterno(place_id), nome, categoria, citta, provincia, indirizzo, telefono, email, sito}}`. Fa GET del record scelto e POST upsert al registro con l'identità di QUEL record (nome+città) + `sistema:'deluxy-suppliers'`+`idEsterno`: il registro salva il **riferimento esterno** e fonde i campi freschi. Reti di sicurezza: `esito creato` = doppione → DELETE immediato + 409; merge su altro id → 409 con spiegazione. UI: pulsante «🔗 Riconcilia» sulle schede Google (candidati = registro in zona, preselezione dal match per nome). Dopo la conferma: contatti del registro sulla scheda (`enrichCardWithRegistry`), auto «Salva in rubrica» e **referenti del registro in rubrica Google** (`salvaReferentiInRubrica`: nome `FORNITORE <NEGOZIO> — <NOME> (<RUOLO>)`, dedupe per numero, solo con OAuth; token chiesto in-gesto) |
| GET | `/api/contatti?url=<sito>` | **email + Instagram dal sito del negozio**, lato server (niente CORS, nessun proxy da configurare): legge homepage + pagine contatti tipiche → `{emails:[…max 3], instagram}`. Google Places non dà l'email: la ricava da qui. Best effort: errori di rete → liste vuote. Il front-end lo chiama per ogni scheda con sito dopo la ricerca; se in config c'è un `proxy` CORS usa quello (legacy, scraping dal browser) |
| POST | `/api/webhook?brand=` | riceve ordine da Shopify (HTTPS diretto **o** envelope Google Pub/Sub) e lo salva in KV `order:{brand}:{num}` (TTL 60gg) |
| GET | `/api/oauth?shop=&pass=` | avvia OAuth Shopify; il callback salva il token Admin del negozio in `config:v1.stores` |

## 6. Negozi Shopify (4)
| brand (chiave app) | shop (.myshopify.com) | store handle admin |
|---|---|---|
| `deluxyflowers.com` | `fb72b1-2.myshopify.com` | fb72b1-2 |
| `deluxy.it` | `deluxygifts.myshopify.com` | deluxygifts (negozio "DELUXY") |
| `cakedesign.me` | `cakedesign-5921.myshopify.com` | cakedesign-5921 |
| `business.deluxy.it` | `90bfeb-f5.myshopify.com` | 90bfeb-f5 (negozio "Business Deluxy", B2B) |

- **Ordini NUOVI** → webhook nativo Shopify "Creazione ordine" (JSON) verso `.../api/webhook?brand=<brand>`. Già configurati sui primi 3 negozi. ⚠️ **Su business.deluxy.it il webhook NON c'è ancora**: finché non si aggiunge, un ordine appena fatto non sta in KV e `/api/order` deve chiederlo all'Admin API — che funziona solo dopo l'OAuth (§8). Senza nessuno dei due, la risposta è «ordine non trovato», che sembra un ordine che non esiste.
- ⚠️⚠️ **Il brand del quarto negozio non si deduce**: `api/oauth.js` ha la mappa `SHOP_BRAND`, e senza la riga per `90bfeb-f5.myshopify.com` il collegamento riesce lo stesso ma salva il negozio col nome tecnico (`90bfeb-f5.myshopify.com`) invece di `business.deluxy.it` — un nome che nessun'altra app pronuncia. La configurazione esisterebbe, e non combacerebbe.
- ⚠️ **La categoria non si deduce dal marchio**, per questo negozio: vende fiori, torte e catering insieme. Il front-end accende **tutte e due** le categorie (fiorai + pasticcerie) e lascia scegliere all'operatore. Provata la deduzione dai titoli dei prodotti sui 250 veri del catalogo: 74% di risposte giuste, 50 dolci non riconosciuti (le torte si chiamano «Giulio», «Alexander»).
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
- **{prodotto} = tipologia + «come da foto»** (17/08/2026): quando l'ordine ha la foto, al posto del nome
  commerciale («Bouquet Rose Rosse Passion», che al fiorista non dice nulla) va **«un Bouquet» /
  «una Cappelliera» / «una Torta» + variante + «come da foto»** (localizzati: `TIPO_PRODOTTO`,
  `ASPHOTOWORD`), es. «è possibile un Bouquet Grande come da foto x1 da spedire…». La tipologia la
  decide `tipoProdotto(item)`: prima il **`productType` di Shopify** (campo nuovo `items[].type`
  da `api/order.js` — `product { productType }` nella query — e `li.product_type` nel webhook),
  poi il **titolo** (regex cappelliera/hat box/flower box/scatola/box → cappelliera; bouquet/mazzo →
  bouquet; torta/cake → torta). Le righe dell'ordine stanno in `orderItems` (globale, riempita da
  `populateOrder`, azzerata da «Compila ordine» e «Azzera»; in manuale si legge il testo di
  `#ord_items`). **Senza foto** o con tipologia non riconosciuta / righe di tipo diverso resta il
  nome del prodotto (con «come da foto» se la foto c'è). `#ord_photo` è fra i campi che rigenerano
  il messaggio. Il riepilogo a schermo continua a mostrare il nome vero del prodotto.



- **Numeri di telefono** (19/08): a schermo vanno **col prefisso internazionale**. Schede Google → `international_phone_number` (Google sa il paese). Numeri del registro → `telConPrefisso(num, provincia)`: `+39` solo se la provincia è italiana (`provItaliana`, tabella delle 107 sigle), mai su numeri che hanno già `+`/`00`, mai su partner esteri.
- **`orderId`** (19/08): id numerico dell'ordine su Shopify, restituito da `/api/order` (da `gid://shopify/Order/…`) e salvato dal webhook. Serve al bottone **«🛍️ Apri su Shopify»** del front-end, che costruisce `https://admin.shopify.com/store/<handle>/orders/<id>` con l'handle preso da `CONFIG.stores[].shop`; senza id ripiega sulla ricerca `?query=%23<numero>`.
- **Variante** (19/08): entra nel messaggio **solo per le torte**, dove è il numero di porzioni e diventa «per 20 persone» (`PERSONEWORD`, `variantePerTorta`; `20 / Cioccolato` → «per 20 persone, Cioccolato»). Per bouquet e cappelliere la variante è la taglia commerciale Deluxy e **resta fuori** (al fornitore serve il budget, non «Medio-Grande»). Se la tipologia non si riconosce si mostra nome prodotto + variante.
⚠️ **Come si riconosce il formato (aggiornato 19/08)**: il `productType` di Shopify **non** dice il
formato — è la categoria commerciale (`Fiori d'Arte`, `Originali Deluxy`, `Cake Design`, `Dolci di
Natale`, verificati sul catalogo). Il formato sta nei **tag** del prodotto (`Bouquet`,
`Cappelliera`, `Cake Design`), che **non arrivano dal webhook**: `api/order.js` li chiede
all'Admin API (`product { tags }`) e li mette in `items[].tags`. `tipoProdotto(item)` decide in
quest'ordine: **tag → tabella `mappaTipi` sulla categoria (§4) → categoria a parole → titolo**;
se due tag dicono formati diversi torna vuoto (meglio il nome del prodotto che un formato
sbagliato in mano al fornitore). Il classificatore condiviso è `classificaFormato(testo)`.
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
- Invio: **WhatsApp** `https://web.whatsapp.com/send?phone=<digits>&text=<enc>` da desktop, **`https://wa.me/<digits>?text=<enc>` su mobile** (apre l'app WhatsApp del telefono; rilevamento con `IS_MOBILE` da user agent, helper `waChatUrl()`); **Email** `mailto:` con subject+body(+link foto).
- **Messaggio copiabile** (17/07/2026): textarea `#ord_msg` nel box ordine, rigenerata dai campi (`refreshOrderMessage`) finché l'utente non la modifica a mano (`msgDirty`); da lì in poi i pulsanti «Invia» usano il testo dell'utente (`currentMessage()`), il pulsante «↺ Rigenera» torna al testo automatico. «📋 Copia messaggio» = `navigator.clipboard.writeText`.

## 10-bis. Registro anagrafiche (partner/prospect già nostri in zona)
- Dopo ogni ricerca, l'app interroga **deluxy-anagrafiche** (`GET {anagUrl}/api/v1/partners?…` con header `x-api-key`, timeout 5 s, `cache:no-store`) **sempre per provincia**: `provincia=` con sigla (FI), nome (FIRENZE) e nome completo (CITTÀ METROPOLITANA DI FIRENZE), ricavati dal geocoding della zona di consegna. Unico ripiego, per le schede con provincia vuota: se non esce nulla si riprova con `citta=<capoluogo>`. **Tutti i valori dei filtri vanno in MAIUSCOLO** (il registro salva tutto così; ci pensa `anagQuery`). Risposta `{ totale, dati:[...] }`; stato `attivo` (confronto case-insensitive) = partner, gli altri stati = prospect.
- URL di default: **`https://deluxy-anagrafiche.vercel.app`**. Le letture passano dal **proxy `/api/anagrafiche`** (autenticato con le utenze dell'app): la chiave `anagKey` (sola lettura, `dlxk_…`) vive nella config KV e **non arriva mai al browser** (in `sanitize` solo `hasAnagKey`; se manca, il proxy usa la chiave di scrittura). `anagUrl` opzionale per puntare altrove (es. `http://localhost:3060` in sviluppo). Segue le regole d'ingaggio del registro: "chiave lato server, mai nel browser".
- Esito: schede dedicate in cima ai risultati (`registryCard`, bordo oro = partner, blu = prospect, con i **referenti** `p.contatti` → telefono/email) + badge sulle schede Google che matchano per nome (`normName`); nota nello status. Il filtro «solo WhatsApp» non le nasconde (`data-registry`). Best-effort: se il registro non risponde la ricerca funziona comunque.
- ⚠️ Le API del registro **richiedono CORS**: `deluxy-anagrafiche/src/middleware.ts` apre GET/OPTIONS su `/api/*`. Senza, il browser blocca la chiamata dalla pagina Vercel.

## 10-ter. Schede Google: «Salva in rubrica» e «Segnala al commerciale»
- Ogni scheda che viene da Google (non dal registro) ha due pulsanti; i dati del negozio stanno in `CARD_DATA[place_id]` (nome, categoria, città, provincia — da `address_components` —, indirizzo, telefono, email dallo scraping, sito).
- **💾 Salva in rubrica**: con `googleOauthClientId` configurato in Admin usa Google Identity Services (`accounts.google.com/gsi/client`, scope `auth/contacts`) e la **People API**; il Client ID (tipo Web) deve avere la People API attiva e l'origine `https://search-deluxy.vercel.app`. Prima di creare, **cerca il numero** con `people:searchContacts` (con richiesta di warm-up, confronto sulle ultime 9 cifre): se il contatto esiste mostra «Già in rubrica» e non duplica. Il contatto viene salvato col nome **`FORNITORE [NOME] [TIPO] PROV. [PROVINCIA]`** (`contactName()`: tipo FIORAIO/PASTICCERE dalla categoria, provincia dal negozio o dall'ultima ricerca `lastGeo`). Senza Client ID (o se l'OAuth fallisce) ripiega su un **file .vcf** con lo stesso nome, che si apre con la rubrica di telefono/PC (lì niente controllo duplicati).
- **📣 Segnala al commerciale**: `POST /api/segnala` (utenze) → la funzione server legge dalla config KV `anagWriteKey` (chiave di **scrittura**, mai al browser — `hasAnagWriteKey`) e fa **un solo POST upsert-merge** al registro seguendo le sue regole d'ingaggio: `sistema:'deluxy-suppliers'` + `idEsterno` (= place_id Google: il registro ci riconosce alla prossima segnalazione), `asOf` e `ultimaVisita` = `quando` (ISO dal browser, regola §12.5), nota `[data] Segnalato dall'app search/supplier (utente). Ordine #2403 valore € 85. Sito: …`. **Niente `stato`** (le nuove nascono `prospect`; stato/interessi/account li cura il team del registro). Anti-doppioni, append delle note e merge per campo li fa il registro: risposta `{esito:'creato'|'merged', applicati, in_revisione}` → tradotta in `{creato:true}` o `{esistente:true, aggiornato:true}`. La `fonte` del record risulta `deluxy-suppliers` (dedotta da `sistema`). Le schede Google già matchate col registro hanno il pulsante disabilitato («Già nel registro»).
- Chiave di scrittura: si genera nel registro con `npm run chiave -- deluxy-suppliers --scrittura` (consegna per canale privato → incollarla in Impostazioni).

## 10-ter-bis. Deep link (bottone da altre app)
L'app è richiamabile da un bottone/link di qualsiasi altra app; i parametri si applicano **dopo il login** (`applyDeepLink()` in `unlock()`), che resta obbligatorio:
- `https://search-deluxy.vercel.app/?brand=deluxyflowers.com&ordine=2403` → imposta il brand, recupera l'ordine (che auto-compila indirizzo e categoria e lancia la ricerca)
- `https://search-deluxy.vercel.app/?indirizzo=Via Roma 1, Milano&categoria=fiorai|pasticcerie` → ricerca diretta in zona senza ordine
- Alias accettati: `order`/`address`; `#` iniziale nel numero ordine tollerato. Parametri sconosciuti ignorati; senza parametri non cambia nulla.

## 10-quater. Utenze e Storico richieste
- **Utenze**: si entra con **nome utente + pass code**. Due livelli: il pass code principale (`APP_PASSWORD`) = amministratore (unico che può salvare le Impostazioni); le utenze operative vivono nella config KV (`utenti:[{nome,pass}]`, gestite in ⚙️ Impostazioni → «Utenze dell'app»; `sanitize` non restituisce mai le password). Il browser manda `x-app-password` + `x-app-user`; l'autenticazione condivisa sta in **`api/_auth.js`** (`authUser`, il prefisso `_` non crea un endpoint) ed è usata da `config`, `order`, `segnala`, `storico`.
- **Storico richieste** (`api/storico.js`, chiave KV `storico:v1`, max 500 eventi, più recenti in testa): registra richieste ordine inviate (WhatsApp/email), salvataggi in rubrica e segnalazioni, ognuno con **l'utenza autenticata** (mai dal body), timestamp dal browser (`quando`), negozio, esito, eventuale ordine `{numero, valore, brand}` e (24/07) eventuale ricerca per zona `{indirizzo, categoria}` — usata dal pulsante «↻ Riapri ricerca» per gli eventi senza ordine. Le ricerche per zona senza ordine registrano da sole un evento `tipo:'ricerca'` (una volta per zona per sessione). Il client logga con `logEvento()` (best effort, non blocca la UI) dai 4 punti: invio WhatsApp, invio email, `saveContact`, `reportShop`. Vista dedicata «Storico richieste» in sidebar (`setView('storico')` → carica con `loadStorico()`).

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
4-ter. **Popup OAuth rubrica = solo in-gesto** (bug risolto 20/07): `requestAccessToken()` di Google
   apre un popup, e i popup passano solo dentro un click dell'utente. Ogni azione automatica che
   può aver bisogno del token (es. salvataggio in rubrica dopo la riconciliazione) deve chiedere
   il token AL CLICK (in parallelo alle chiamate al server), non dopo un await. Regola generale:
   clipboard.write, window.open e requestAccessToken vanno TUTTI avviati nel gesto.
4-bis. **La copia negli appunti richiede il FOCUS** (bug risolto il 16/07/2026): la versione precedente avviava `clipboard.write()` con una Promise e apriva WhatsApp nello stesso istante → quando l'immagine era pronta il focus era su WhatsApp e Chrome rifiutava con *"Document is not focused"*; il `catch` lo nascondeva e il fallback `window.open(foto)` dopo `await` veniva bloccato come popup. Da PC non si incollava nulla. Regola: **precarica la foto, copia PRIMA, apri WhatsApp DOPO** (§9-bis).
5. **`new Date()`/`Math.random()`**: OK nel browser, ma NON nelle funzioni serverless se un domani girano in contesti che li vietano (usare valori passati).
6. **Anteprima locale**: server statico PowerShell (`.claude/serve.ps1`, porta 5510) — serve `deluxy-search-supplier/`. In locale le `/api/*` NON esistono: la lock screen non si sblocca, per collaudare l'interfaccia si nasconde `#lockScreen` e si chiama `populateOrder({...})` da console. (Aggiornamento 16/07/2026: **Node 24 e npm ci sono** — `node --check api/*.js` per il lint di sintassi. Python no.)
6-bis. **Ordine da KV = senza foto**: `/api/order` usciva subito con la copia del webhook (`if (cached) return ...`) e il webhook non include le immagini → foto sempre vuota anche per prodotti che su Shopify l'immagine ce l'hanno. Risolto arricchendo da Admin API (§6). Regola generale: **la cache del webhook è incompleta, non trattarla come la verità completa sull'ordine.**
7. **Google key**: deve stare nel browser (mappa) → proteggila con restrizione **referrer** `https://search-deluxy.vercel.app/*`.
8. **CORS immagine**: si scarica il file con `fetch` e si converte dal **blob locale** (`fetchImageBlob` → `toPngBlob`), così il canvas non è mai "tainted". Se il CDN blocca il CORS si riprova col `proxy` configurato; se fallisce anche quello, il pulsante diventa «⚠️ Foto non scaricabile» e si salva a mano dal link.
9. **La `keyword` di nearbySearch scarta schede vere** (bug risolto 24/07/2026, ordine cakedesign #1725): «Le Torte di Giada» (pasticceria, Brescia, type `bakery`) NON usciva nemmeno cercando dalle sue coordinate, perché il keyword-match di Google non le associa la parola "pasticceria" (e intanto la keyword lascia passare panifici e bar). Soluzione in `nearby()`: **doppia ricerca per categoria** — con keyword localizzata E solo per `type` — e unione delle liste (la dedup per `place_id` è già a valle). Regola: mai fidarsi della sola keyword per l'esaustività; il costo è 1 richiesta Places in più per categoria.

## 12-bis. Filtri risultati, mappa ed estensione ricerca (front-end)
- **Filtri**: `applyFilters()` (ex `applyWaFilter`) combina il filtro WhatsApp (`waFiltro`) e il
  filtro apertura (`openFiltro`). Ogni scheda Google porta `dataset.wakind` e `dataset.open`
  (`open`/`closed`/`unknown`, da `opening_hours.isOpen()` in `shopCard`). Le schede del registro
  (`dataset.registry`) restano sempre visibili. Due gruppi gemelli sincroni: form
  (`#waFilter`,`#openFilter`) e sopra i risultati (`#waFilterResults`,`#openFilterResults`), via
  `setWaFiltro`/`setOpenFiltro`. Pillole in `.wchip` (non prendono i listener di `.chip`).
- **Suggerimenti indirizzo da Google Maps** (26/08): il campo `#address` ha il **Places
  Autocomplete** (`attivaAutocompleteIndirizzo`, `types:['geocode']`, fields
  formatted_address/geometry/address_components). La libreria Google si carica al **primo focus**
  sul campo (`loadGoogle` sulla chiave di cassaforte; senza chiave niente suggerimenti).
  Scegliendo un suggerimento la ricerca **parte da sola** e `run()` **salta la geocodifica**
  (`addrAutoGeo {text, geo}`; helper condiviso `geoDaResult(r)` estratto da `geocode`).
  Enter col menu suggerimenti aperto NON lancia `run()` (`pacAperto()` guarda i
  `.pac-container` visibili): sceglie il suggerimento, e ci pensa `place_changed`.
  Un Enter senza suggerimento scelto (place senza geometry) → geocodifica normale di prima.
  Costo: la widget gestisce da sola le sessioni di fatturazione Autocomplete di Google.
- **Ordinamento a scelta dell'operatore** (26/08): select «Ordina per» nel form (`#sort`) +
  gemello sopra i risultati (`#sortResults`, riempito copiando le option, sincrono nei due
  versi, scelta salvata in `localStorage.sortPref`). Valori: `dist` (predefinito), `rating`,
  `reviews` (numero recensioni), `wa` (con WhatsApp prima), `open` (aperti ora prima).
  `applySort()` riordina le schede **già in pagina** spostando i nodi DOM (zero chiamate
  Google) e poi chiama `applyFilters()`; `syncMapMarkers` scorre il DOM, quindi segnaposto e
  targhette #N si rinumerano da soli. Le schede del registro e le matchate partner/prospect
  (`dataset.registry`/`dataset.regId`) restano SEMPRE in cima nell'ordine loro. Dati per
  l'ordinamento sul dataset della scheda: `rating`, `reviews` (`user_ratings_total`), `dist`
  (metri, stradale se calcolata altrimenti linea d'aria; chi non ce l'ha va in fondo),
  `wakind`, `open`; a parità decide sempre la distanza. In `renderResults` la scelta
  dist/rating/reviews decide anche QUALI negozi entrano nel taglio «Numero risultati»
  (pre-sort prima dello slice); per wa/open la pre-selezione resta per distanza (i dati
  arrivano solo coi dettagli) e l'ordine vero lo mette `applySort()` a fine render.
- **Mappa**: `#toggleMap` → `#mapWrap`/`#map`, Google Maps JS (già caricata). I punti si raccolgono
  in `mapPoints` nel loop dettagli (`d.geometry.location`); `buildMap` mette il segnaposto blu
  della consegna + i negozi numerati (InfoWindow + `focusCard`), `syncMapMarkers` segue i filtri,
  `resetMap` azzera a ogni ricerca. Solo schede Google (non quelle del registro).
- **Estendi ricerca**: se in zona non c'è nulla → `#noResults`/`#extendBtn` → `extendSearch()`,
  che usa `wideSearch` (`service.textSearch`, stesse keyword, bias zona, raggio ~40 km). La coda
  di render è condivisa in `renderResults(found, geo, origin, service, {extended})`; `run()` salva
  `lastSearchCtx` per l'estensione.

## 12-ter. Foto dei negozi da Google Maps (front-end)
- **Da dove arrivano**: il campo `photos` chiesto in `details()` (getDetails). Sono oggetti
  `PlacePhoto` con `getUrl({maxWidth,maxHeight})`. `fotoDaPlace(d)` ne ricava fino a
  `FOTO_MAX` (10) voci `{thumb (520px), full (1600px), attr}` e le mette in **`PLACE_FOTOS[sid]`**
  (sid = place_id, oppure `anag:<id>` per le schede del registro).
- **💰 Costo — la regola che governa tutto il disegno**: chiedere il campo `photos` è gratis
  (Basic Data), **scaricare ogni immagine è una richiesta Place Photo a pagamento**. Perciò
  nella scheda va **una sola copertina** (`fotoCoverHtml` → `.shopfoto`, con `loading="lazy"`
  così le schede fuori schermo e quelle nascoste dai filtri non scaricano nulla) e le altre
  foto partono **solo** all'apertura della lightbox. Non trasformare la copertina in una
  striscia di miniature senza rifare questo conto.
- **Galleria** (`#lbox`, due viste nello stesso overlay): `apriFoto(sid, nome)` apre **subito la
  griglia con TUTTE le foto** del negozio (`lbGriglia`, `#lbGrid`, miniature `thumb`); cliccandone
  una si passa alla vista ingrandita (`lbShow`, `#lbOne`, immagine `full`) con ‹ ›, contatore e
  «↩ Tutte le foto». La vista si sceglie con la classe `#lbox.single`. Con **una sola foto** si
  apre già ingrandita (una griglia da una cella non ha senso). Tastiera: ← → nella vista
  ingrandita; **Esc torna alla griglia** e solo dalla griglia chiude; clic sullo sfondo chiude.
  Un solo listener delegato su `resultsEl` per `.shopfoto` (come star-btn/arch-btn).
- **Attribuzione**: Google richiede di mostrare `html_attributions`; è **HTML dell'API** e va
  inserito con `innerHTML` (`#lbAttr`), non con `esc()`, altrimenti si vede il markup.
- **Schede del registro**: `annotaOrariRegistro` chiede ora anche `photos` (stessa
  `findPlaceFromQuery` + `getDetails` già usata per gli orari) e infila la copertina dopo `.meta`.
  Il nome della funzione parla solo di orari: **fa anche le foto**.
- **Mappa**: `mapPoints[].foto` = miniatura della copertina, mostrata in cima all'InfoWindow.
- **Interruttore**: `fotoAttive()` legge `CONFIG.mostraFoto`; se spento `fotoDaPlace` torna
  vuoto → nessuna copertina, nessuna lightbox, nessuna richiesta Place Photo.

## 12-quater. Paginazione dei risultati Google (front-end, 17/08/2026)
- **Il limite di Google**: una `nearbySearch` restituisce al massimo **20 risultati per
  chiamata**, i più vicini in linea d'aria. In una città densa i 20 fioristi più vicini possono
  stare tutti entro un chilometro: chi è poco oltre **non entra mai** nella lista, con qualunque
  valore di «Numero risultati» (che taglia *dopo*, in `renderResults`). È il caso segnalato di
  «La Mimosa» sull'ordine deluxyflowers #2734.
- **Cosa fa ora `nearbyOne`**: dopo la prima pagina, se `pagination.hasNextPage` chiama
  `pagination.nextPage()` — che **richiama la stessa callback** con la pagina successiva — fino
  a `paginePerRicerca()` pagine (max 3 = 60, limite di Google). Vale per tutte le chiamate della
  categoria (una per keyword + quella per solo `type`).
- **Tre dettagli che sembrano inutili e non lo sono**:
  1. `PAGINA_ATTESA_MS` (1200 ms) prima di `nextPage()`: il `next_page_token` diventa valido
     dopo un istante, chiamarlo subito può fallire.
  2. `try/catch` intorno a `nextPage()`: se lancia si tiene quello che si è già raccolto.
  3. **Rete di sicurezza** (`PAGINA_TIMEOUT_MS`): se la pagina non arriva mai, la Promise si
     risolve comunque con i risultati parziali. Senza questa, `run()` resterebbe appeso per
     sempre su `Promise.all` e la ricerca non finirebbe più. `fine()` è idempotente (`chiuso`).
- **💰 Costo**: ogni pagina è una chiamata Places **a pagamento**, moltiplicata per keyword e
  categorie. Con 2 categorie e 1 keyword ciascuna si passa da 4 a 12 chiamate per ricerca.
  L'impostazione `pagineRicerca` (§4) permette di tornare a «solo i primi 20».
- **NON è paginato** `textSearchOne` (usato da «Estendi la ricerca»): lì il raggio cresce a
  scatti di 10 km, che è già il modo di allargare la copertura.

## 13. Ricette rapide
- **Aggiungere un negozio**: aggiungilo alla mappa `SHOP_BRAND` in `api/oauth.js` e a `BRAND_BY_SHOP` in `api/webhook.js`; aggiungi il brand a `KNOWN_BRANDS` in `index.html` e all'`<select id="brand">`; crea il webhook su Shopify; fai `/api/oauth?shop=...&pass=...`.
- **Recuperare un ordine** (test): `curl "https://search-deluxy.vercel.app/api/order?brand=deluxyflowers.com&number=2484" -H "x-app-password: <PASS>"`.
- **Diagnostica nomi ordine**: aggiungi `&debug=1`.
- **Cambiare pass code**: cambia env `APP_PASSWORD` su Vercel + Redeploy.
