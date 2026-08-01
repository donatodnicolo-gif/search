# Stato deluxyflowers.com — 31/07/2026

> Da leggere **prima** di toccare il tema. Mappa tecnica: [TEMA_DELUXYFLOWERS.md](TEMA_DELUXYFLOWERS.md).

Negozio: `fb72b1-2.myshopify.com` · dominio `deluxyflowers.com` · tema Impulse 7.2.0 personalizzato.

## ⚠️ Le modifiche di questa sessione sono GIÀ IN PRODUZIONE

Durante la sessione il tema di lavoro è stato **pubblicato**. Verificato con `curl` sul sito live
il 31/07/2026:

| Tema | id | Ruolo |
|---|---|---|
| `live` | **`203646435653`** | **MAIN** — contiene le modifiche descritte sotto |
| `Live` (vecchio) | `203134304581` | era MAIN a inizio sessione |
| `Version to work on 1.3 date cart fixed` | `203522212165` | tema su cui ho scritto, poi pubblicato |

**Gli id cambiano di ruolo a ogni pubblicazione**: rileggere sempre `themes(...)` prima di scrivere.

### Cosa è live adesso (verificato)

| | |
|---|---|
| ✅ Guardia `if (!SavedDate)` in `header.liquid` | presente sul live |
| ✅ `console.log('getLocation …')` | rimossi dal live |
| ✅ `/pages/ask-the-artist` | **0 errori Liquid** (erano 10) |
| ✅ Numero WhatsApp footer + popup contatti | `15553362009` su ogni pagina |
| ❌ `/cart` | **ancora 4× `393498853209`** |
| ❌ `/pages/gdpr-compliance` e simili | **ancora 12× + 1× `390282952899`** |
| ❌ Prodotti senza foto | `Liquid error … divided by 0` ancora presente |
| ❌ Canonical | ancora **3 tag** per pagina |

> 🔴 **Conseguenza urgente**: il sito ora mostra il numero nuovo nel footer ma i **numeri vecchi
> nel carrello e su alcune pagine**. È un'incoerenza *visibile ai clienti*, non più un lavoro
> in bozza. Chiudere i 4 file mancanti è la priorità.

### Verificare l'anteprima di un tema NON pubblicato (funziona)

```bash
curl -s -L -c jar -b jar "https://deluxyflowers.com/?preview_theme_id=<id>&_ab=0&_fd=0&_sc=1" -o /dev/null
curl -s -L -c jar -b jar "https://deluxyflowers.com/<path>"
```
Conferma leggendo `Shopify.theme = {"name":…,"id":…,"role":…}` nell'HTML servito.
Una `fetch()` semplice dal browser **non** basta: serve il cookie jar.

### Trappole del connettore MCP

1. **`themeDuplicate` è un no-op silenzioso**: torna `newTheme: null` con `userErrors: []` e non
   crea niente. Copia pulita del live → si fa a mano dall'admin.
2. **`themeFilesUpsert` vuole il file INTERO**: nessuna modifica parziale.
3. **Scritture bloccate sul tema MAIN** (bene così).
4. **⚠️ Il connettore può cambiare negozio da solo.** A metà sessione è passato da Deluxy Flowers
   a **cakedesign.me** dopo una riconnessione. **Chiamare `get-shop-info` prima di ogni scrittura.**

### Verificare l'integrità di una scrittura

- **`.liquid`**: la `size` è affidabile. `390294751347` (12) → `15553362009` (11) = **−1 byte per
  occorrenza**. Riscontro reale: `product-template.liquid` 38183 → 38182 ✅
- **`.json` di template**: la `size` **non** è confrontabile. Prima della scrittura Shopify riporta
  la forma *minificata*, il body restituito è indentato: dopo l'upsert cresce di 2–3 KB anche se il
  contenuto è giusto. Non è un errore.

---

## Lavoro 1 — Numero WhatsApp: 16 file su 20 (i 16 sono LIVE)

Obiettivo: tutti i link WhatsApp puntano a **`+1 555-336-2009`** → `15553362009`.

> L'utente ha **confermato** il numero pur essendogli stato segnalato che il prefisso 555
> statunitense è riservato alla finzione: chi clicca apre una chat inesistente.

Regole applicate: sostituiti **solo** gli URL `wa.me/…` e `api.whatsapp.com/send?phone=…`; i `tel:`
restano invariati. Dove la barra mostra il numero **come testo accanto al bottone** è stato
aggiornato anche il testo. Tre numeri unificati: `390294751347`, `390282952899`, `393498853209`.

### FATTI (16, in produzione)

`sections/footer-group.json` (footer di ogni pagina + popup contatti header + bottom help bar) ·
`snippets/product-template.liquid` (ogni pagina prodotto) · `snippets/product-form.liquid` ·
`sections/bottom-help-bar.liquid` · `templates/page.contact.json` ·
`page.parla-con-il-tuo-esperto.json` · `page.londra.json` · `page.dubai.json` · `page.milano.json` ·
`page.francia.json` · `page.parigi.json` · `page.italia.json` · `page.aw-landing.json` ·
`page.landing-opera-flowers.json` · `page.landing-punti-cliente.json` · `page.landing-acquisto-rose.json`

### DA FARE (4) — priorità, perché creano incoerenza sul sito live

| File | KB | Contenuto |
|---|---|---|
| `sections/main-cart.liquid` | 57 | "Contatta un nostro Esperto" nel **carrello** — `393498853209`, 2 link (una coppia dentro un commento HTML) |
| `templates/page.json` | 24 | 13 occorrenze di `390282952899` — serve gdpr-compliance, data-sale-opt-out, details-cake-artist |
| `templates/page.landing-abbonamento-fiori.json` | 29 | 4× `2899` + 1 `wa.me/1347` |
| `templates/page.landing-lead.json` | 25 | 1 `wa.me/1347` |

---

## Lavoro 2 — Correzioni di codice (LIVE e verificate)

### `sections/header.liquid` — 29.842 → 30.443 byte

`updateSavedBackDate()` andava in **eccezione su ogni pagina** per ogni visitatore senza
`delivery_date_val` in localStorage (`.split()` su `null`), dentro un `$(document).ready`.
Aggiunte tre guardie, rimossi due `console.log`:

```js
if (!SavedDate) { return; }                    // visitatore nuovo
if (dateComponents.length < 4) { return; }     // formato non riconosciuto
if (!month) { return; }                        // evitava "2026-undefined-09" e la
                                               // cancellazione di una data valida
```
Logica provata su 6 scenari: zero eccezioni, e la rimozione della data **scaduta** funziona ancora.

### `sections/ask-the-artist.liquid` — 1.611 → 2.322 byte

Stampava **10 volte** `Liquid error (snippets/image-element line 93): invalid url input` come testo
visibile su `/pages/ask-the-artist` (it/en/fr): passava l'oggetto *collezione* a `image-element`
invece di un'immagine. Ora salta i blocchi con collezione mancante, passa `collection.image`, e i
link puntano a `collection.url` (prima `#` e `/collections/` senza handle).

---

## Lavoro 3 — Errori trovati e ANCORA APERTI

Audit sul sito live: 1.060 URL dal sitemap, 675 link interni, 243 prodotti.

### Codice del tema

| # | Errore | Dove | Fix |
|---|---|---|---|
| 1 | `Liquid error (snippets/product-template line 67): divided by 0` — **10 prodotti × 3 lingue** | `snippets/product-template.liquid` riga 67 | `{{ 100 \| divided_by: product.featured_media.aspect_ratio }}` esplode se il prodotto non ha immagini: guardia su `product.featured_media` o `\| default: 1` |
| 2 | **Canonical duplicato su tutto il sito** — 741 pagine su 744 → **3 tag per pagina** con quello di Shopify | `snippets/all_tags_and_script.liquid` | ci sono due righe `<link rel="canonical" …>` identiche: cancellarne una |
| 3 | **ID HTML duplicati**: `PredictiveWrapper ×2`, `PredictiveResults ×2`, `localization_formtoolbar ×2` | `sections/header.liquid` | il blocco è renderizzato due volte secondo l'allineamento del logo; `getElementById` prende solo il primo |
| 4 | **jQuery caricato 5 volte da 4 CDN** (2.1.4 tema, 3.3.1 cdnjs, 3.6.0 code.jquery, 3.7.1 googleapis) + jQuery UI; **Semantic UI doppio** (asset tema + jsDelivr). Attiva: 3.6.0, non l'ultima caricata | `sections/header.liquid` e altri | **NON rimuovere alla cieca**: Seal Subscriptions, Infinite Options, Station Tabs si legano a `$`. Prova a tappe, app per app |
| 5 | `console.log` di debug in produzione: `bookingIDbookingIDbookingID`, `formattedDelDate`, `Formatted Today date` | snippet della data (`delivery_date_hour_c`, `product-delivery-date`, `main-cart`) | i due di `header.liquid` sono già tolti |
| 6 | **30 immagini su 55 senza `alt`** in home | vari | accessibilità e SEO |

### Contenuto e dati (non codice)

| # | Errore | Dettaglio |
|---|---|---|
| 7 | **10 prodotti in vendita, disponibili, senza NESSUNA foto** | `abbonamento-classic`, `abbonamento-romantico-1-volta-al-mese`, `abbonamento-business-1-volta-al-mese-1`, `abbonamento-stagionale-2-volte-al-mese-1`, `luxury-red-roses-bouquet`, `cento-rose-bianche-1`, `rosa-eterna-bianca-1`, `ortensie-balloon-1`, `champagne-e-fiori-di-stagione-1`, `maxi-bouquet-rose-bianche-gialle-e-arancioni-1` — causa a monte dell'errore #1 |
| 8 | **9 collezioni cancellate ma ancora referenziate dal tema** | `142-restaurant`, `adinolfo-stefanelli`, `altapasticceriadeluxy`, `aperitivi-luxury`, `basara-sushi-pasticceria`, `bouquet-pret-a-porter`, `cappelliere-j-c` (inserita 2 volte), `clivati-1969`, `componi-la-tua-luxury-box` — più `colazioni-romantiche`, `torte`, `regali-per-lei`, `regali-per-lui`, `fiori-e-regali-per-lei` |
| 9 | `/pages/france`: **9 riquadri prodotto segnaposto grigi** + 2 "Visualizza tutto" con `href=""` | conseguenza di #8 |
| 10 | `/pages/details-cake-artist` **mostra il template sbagliato** | pagina con suffisso `details page artist`, file nel tema `templates/page.details page articts.json` — **refuso "articts"**. Shopify ripiega su `templates/page.json`. Due strade: rinominare il file **oppure** riassegnare il suffisso alla pagina (**quest'ultima si vede subito in produzione**) |
| 11 | `/pages/productfeed` (e `/fr`) **senza `<title>`** | |
| 12 | Script di produzione da un dominio di **sviluppo**: `https://dev.younet.network/scriptTag/infinite-option.js` (2 script) | iniettato dall'app Infinite Options, **non dal tema** |
| 13 | 29 script esterni da 17 domini sulla pagina carrello | |

### Confermato SANO (non perderci tempo)

Zero link interni rotti su 675 URL · zero errori HTTP su 744 URL del sitemap · tutte le 31
collezioni dei menu esistono · zero `translation missing` su it/fr · zero mixed content · zero
prodotti senza descrizione (243) · un solo `<h1>` per pagina.

> **I 429 durante un crawl non sono errori del sito**: sopra ~3 richieste concorrenti Shopify
> limita il traffico. Nel primo giro 686 URL erano tornati 429 e li avevo ricontrollati solo come
> stato HTTP, mai per il contenuto: è così che l'errore #1 era sfuggito. Usare **max 2 richieste
> concorrenti con ~250 ms di pausa** e riprovare i 429 con backoff.

---

## Come riprendere

1. `get-shop-info` → deve rispondere **deluxyflowers.com**. Se risponde `cakedesign.me`, fermarsi
   e ripuntare il connettore (`switch-shop` revoca il token e chiede una nuova autorizzazione).
2. `themes(first: 25) { nodes { id name role } }` → identificare il MAIN attuale e il nuovo tema
   di lavoro. **Gli id qui sopra sono già cambiati una volta in una sola sessione.**
3. Chiudere il **Lavoro 1** (4 file) — è l'unica cosa che oggi rende il sito incoerente per i clienti.
4. Poi i fix #1 e #2 del Lavoro 3: una riga ciascuno.
5. Verificare con la ricetta `curl` + cookie jar qui sopra prima di far pubblicare.
6. **La pubblicazione la fa l'utente.**
