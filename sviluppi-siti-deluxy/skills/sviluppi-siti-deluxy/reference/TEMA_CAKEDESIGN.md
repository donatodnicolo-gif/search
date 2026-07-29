# Mappa tecnica — tema cakedesign.me

Negozio: `cakedesign-5921.myshopify.com`. Temi **al 26/7/2026**: live "live" (MAIN)
`182574350659`, sviluppo "Version to work on" (UNPUBLISHED) `182574317891`.
**Verifica sempre id e role prima di scrivere** (nel negozio ci sono ~20 temi di backup).

> ⚠️ Gli id cambiano spesso: quelli annotati il 10/7 (`182508781891` / `182548955459`) sono
> già obsoleti — il vecchio "Version to work on" oggi si chiama "fino al 13.07". **Interroga
> sempre `themes(first:30){ nodes{ id name role updatedAt } }` prima di lavorare**, non fidarti
> degli id scritti qui. Esiste anche un "Version to work on (test Deivid)": non è il tema di
> sviluppo standard, non scriverci senza chiedere.

Stessa famiglia di codice di deluxyflowers (stesso sviluppatore), ma **versione diversa**:
non dare per scontato che i file siano identici — controlla sempre gli anchor.

## 👉 Stato del lavoro: [STATO-CAKEDESIGN.md](STATO-CAKEDESIGN.md)

Cosa è pronto sul tema di sviluppo e non ancora pubblicato, cosa deve fare l'utente dall'admin,
problemi aperti e trappole già pagate stanno **lì**, non qui. Questo documento resta la mappa
tecnica del tema (file, id DOM, sistema date).

In sintesi al 29/7/2026: sul tema `182574317891` c'è il **numero di telefono migrato**
(`+39 02 9475 1221` → `+39 02 8295 2899`, 53 occorrenze in 19 file, tutte verificate) e il tema
è stato **allineato al live**; resta da **pubblicare**, da correggere la **privacy policy** e da
disattivare il **banner cookie nativo Shopify** che fa doppione con iubenda.

> ✅ **29/7/2026: numero definitivo `+39 02 8294 1380` scritto sul tema di sviluppo**,
> 54 occorrenze in **20** file — i 19 qui sotto **più `sections/header-group.context.it.json`**,
> che la mappa non elencava (barra annunci del mercato Italia, presente su ogni pagina).
> Cercare sempre anche i file `*.context.*.json`. Le traduzioni **inglesi** non stanno nel
> tema e restano col numero vecchio: vedi [STATO-CAKEDESIGN.md](STATO-CAKEDESIGN.md).

## Sistema data di consegna — chi fa cosa

| File | Ruolo |
|---|---|
| `snippets/delivery_date_hour_c.liquid` | Carrello (renderizzato da `sections/main-cart.liquid`). Stessa struttura di deluxyflowers: `$(window).ready` per min/default data + `fnCheckDate` per le fasce (qui usa `currentHour`/`getItalyHour()`, non `italyHour`). |
| `sections/header.liquid` | Calendario header `#header_deliverydate`. |
| `sections/home-delivery-section.liquid` | Calendario home (senza `-new` a differenza di deluxyflowers); ha supporto lingua `/en`. |
| `snippets/home-delivery.liquid` | Secondo widget home con calendario `#deliverydate`. |
| `snippets/delivery-date.liquid` (77KB) | Picker pagina prodotto (renderizzato da `snippets/product-form.liquid`). Calendario via `reloadDates(id)`; `#Stardate` = Liquid `now` + `prodotto.consegna`. |
| `snippets/altra-date1.liquid` | Popup "altra data" (42KB, nessun calendario diretto). |
| File `*-old`, `*(16July 2024)`, `delivery_date_hour_c_old` | Backup morti: NON toccarli, NON prenderli come riferimento. |

## Modifiche del 10/7/2026 (regole cutoff — vedi REGOLE_BRAND.md §cakedesign.me)

`snippets/delivery_date_hour_c.liquid`:
- aggiunto `romeNowParts()`; `start_date`/`date`/`prdt_end_date` basati sulla data italiana;
- cutoff prima data alle **14:00** (`maxgiorno == 0 && ROME_NOW.h >= 14 → +1 giorno`);
  rimosso il vecchio hack `days==today / tmpHour>=20` (stesso bug di deluxyflowers);
- `fnCheckDate` ramo OGGI: prima era `<13 → solo 16-20, poi bloccato`; ora
  `<8 → 12-16 e 16-20` (regola notturna), `8–13:59 → solo 16-20`, `>=14 → bloccato`;
- ramo DOMANI: riduzione a `12-16 e 16-20` spostata da `>=18` a `>=20`.

`sections/header.liquid`, `sections/home-delivery-section.liquid`, `snippets/home-delivery.liquid`:
- `var today` del calendario = data italiana con cutoff 14:00 → `minDate` corretto.

`snippets/delivery-date.liquid` (pagina prodotto):
- PRIMA: `minDate = oggi + 2 giorni fissi` (ignorava lead time e consegna in giornata!);
  ORA: `minDate = oggi(Roma) + prodotto.consegna`, `+1` se lead 0 e ora ≥ 14;
  `start` (data iniziale) clampato a `minDate` e protetto da NaN.

## Insidie specifiche

- `fnCheckDate` attiva usa `currentHour` (`getItalyHour()`): già in ora italiana, ma il
  blocco `$(window).ready` PRIMA delle modifiche usava l'ora del device — controllare
  sempre entrambe le parti.
- Il vecchio `minDate +2` del picker prodotto era una toppa: se qualcosa sembra
  incoerente con le Regole per Brand, chiedere all'utente prima di "correggere" al buio.
- Per i test vale l'harness descritto in `TEMA_DELUXYFLOWERS.md` §Test (identico qui).

## Numero di telefono/WhatsApp — dove vive (mappa completa, 26/7/2026)

Il numero **non sta in un posto solo**: è sparso in 19 file, quasi tutti `templates/*.json`
(impostazioni delle sezioni salvate dall'editor), più due file di codice. Chi lo cambia deve
passarli tutti, altrimenti resta il vecchio numero in qualche landing.

| File | Occ. | Cosa alimenta |
|---|---|---|
| `sections/footer-group.json` | 9 | **Il più importante**: popup contatti dell'header (`cart_information_popup_*`: `phone`, `phone_url`, `whats_url`), footer "SERVIZIO CLIENTI" (`href` **e** `title` dei link `tel:` e WhatsApp), `bottom_help_bar_*` |
| `sections/bottom-help-bar.liquid` | 3 | Barra fissa in basso: numero e link `wa.me` sono **default hardcodati** in due `{% assign %}` + uno nello `{% schema %}` → restano attivi come fallback anche cambiando le impostazioni dall'editor |
| `templates/page.contact.json` | 5 | Pagina `/pages/contatti`. ⚠️ **non** `page.contatti.json`, che non è usato da nessuna pagina |
| `templates/page.Cake Design.json` | 4 | `/pages/cakedesign` (nome file **con spazio**) |
| `page.cakedesign-lead` · `page.condizioni-di-acquisto` · `page.pagina-per-aziende` · `page.pagina-per-eventi` | 3 cad. | In `condizioni-di-acquisto` è **testo visibile** in 3 blocchi rich-text |
| 9 landing (`landing-torta-per-oggi`, `landing-torte-compleanno`, `landing-torte-regalo`, `aw-landing`, `cake-design-acquisto`, `san-valentino`, `torte_a_domicilio`, `landing-festa-della-mamma`, `landing-torta-custom`) | 2 cad. | Quasi sempre `bottom_help_bar_*.settings`; in alcune il numero è dentro HTML incorporato in `html_*.settings.code` |
| `page.matrimonio` · `page.come_funziona` | 1 cad. | Bottone WhatsApp |
| **`sections/header-group.context.it.json`** | 1 | **Barra annunci del mercato Italia** ("TORTE PER I TUOI EVENTI / CONTATTACI"): sta in cima a **ogni** pagina. Mancava dalla mappa fino al 29/7/2026 |

Forme in cui compare, tutte da sostituire: `wa.me/<num>`, `wa.me/+<num>`,
`api.whatsapp.com/send?phone=<num>`, `tel:+<num>`, `tel:+39 02 …` spaziato, e testo visibile
`02 … …`. Due sole regole letterali bastano: la forma compatta `39…` e la forma spaziata `02 … …`.

Numeri in gioco, per non confondersi:

| Dove | Compatta | Spaziata |
|---|---|---|
| Live oggi (vecchio) | `390294751221` | `02 9475 1221` |
| Tema di sviluppo oggi (intermedio, mai online) | `390282952899` | `02 8295 2899` |
| **Definitivo dal 29/7/2026** | **`390282941380`** | **`02 8294 1380`** |

**Fuori dal tema** (valgono per tutti i temi, modifica immediata sul live, si fanno dall'admin):
la **privacy policy** contiene il numero; `Impostazioni → Policy`.

Un **terzo numero**, `393498853209`, vive in `page.fiori.json`, `page.contatti.json` e nelle
policy "Informazioni di contatto" e "Rimborso": è un numero diverso, non migrarlo per sbaglio.

## Cookie banner doppio (diagnosi 26/7/2026)

Su cakedesign.me convivono **due CMP**: iubenda, iniettato dall'app embed
`shopify://apps/cmp-insert-code/…` (widget `embeds.iubenda.com/widgets/26477360-….js` +
`consent-tracking.js`), e il **banner nativo Shopify** (`/cdn/shopifycloud/privacy-banner/storefront-banner.js`),
attivo da `Impostazioni → Privacy dei clienti`. Stessa identica causa già vista su deluxy.it:
si tiene iubenda e si rimuove il nativo dall'admin. **Non disattivarli entrambi.**

## Altri difetti noti del live (audit 26/7/2026, non ancora risolti)

1. **jQuery e Semantic UI caricati due volte** su home, `/en` e prodotto: lo stesso blocco
   "date picker consegna" è incluso sia nella sezione header sia in una sezione custom.
   ~1 MB di parsing in doppio e jQuery re-inizializzato, che azzera gli handler già registrati
   → è il primo sospetto per i comportamenti intermittenti del date picker.
2. jQuery **2.1.4** (2015), con CVE note.
3. Popup exit-intent "DOLCEVIA" hardcodato in italiano, mostrato anche su `/en`, con bottone
   verso `/cart` invece di `/en/cart` (unico link della pagina `/en` senza prefisso lingua).
4. Barra annunci in italiano su `/en`.
5. `flag-icon.min.css` linkato **3 volte** da `cdnjs.cloudflare.com`, render-blocking.
6. `/pages/contatti` senza `<h1>`; un blocco `ld+json` malformato sulla pagina prodotto.

Verificato invece **pulito**: nessun Liquid non renderizzato, nessun link o immagine rotti
(69 link e 40 immagini testati), markup bilanciato, meta SEO e `hreflang` corretti.
