# Mappa tecnica — tema deluxyflowers.com (Impulse 7.2.0 personalizzato)

Negozio: `fb72b1-2.myshopify.com`. Temi (al 9/7/2026): live "Live" `202097721669`,
sviluppo "Version to work on" `202100179269`. **Verifica sempre id e role prima di scrivere.**

## Il sistema "data di consegna" — chi fa cosa

Il date picker NON è un'app: è codice custom sparso in più file del tema, con jQuery UI
(carrello), Semantic-UI calendar (header/home/prodotto) e stato condiviso via `localStorage`.

| File | Ruolo |
|---|---|
| `snippets/delivery_date_hour_c.liquid` | **Cuore del carrello.** Form "Seleziona data e ora": input `#DeliveryDate_def` (jQuery UI datepicker, formato `yy-mm-dd`), select fasce `#ddlFasciaOraria`, messaggi `#divCheckDelivery`, testo prima data `#date_disp2`. Nel `$(window).ready` calcola prima data/min/default (cutoff 16:00, lead time `maxgiorno`); `fnCheckDate(data)` ricalcola le fasce a ogni cambio data (cutoff 22:00 per domani). Qui vivono le Regole per Brand. |
| `sections/main-cart.liquid` | Riga prodotto ("Confermato in consegna: …"), modali di conflitto data, hidden `#max_del_date` e `#last_prod_date`, pulizia date scadute (`updateSavedBackDate`). |
| `sections/header.liquid` | Calendario header `#header_deliverydate` (Semantic UI). `minDate` = prima data selezionabile (con cutoff 16:00). Al cambio salva `delivery_date_val` e ricarica la pagina. |
| `sections/home-delivery-section-new.liquid` | Calendario della home `#deliverydate`, stesso pattern dell'header. |
| `snippets/product-delivery-date.liquid` | Calendario pagina prodotto `.product-calendar` dentro `calenderForm()`; `start` (=minDate) da `#Stardate` (Liquid `now` + `prodotto.consegna`) o da `variantDate`; è stato aggiunto un **clamp** `__dlxMin` che impone cutoff 16:00 + lead time. |
| `snippets/delivery-date.liquid`, `snippets/delevery-date.liquid` | Varianti legacy/minori del picker (verificare l'uso prima di toccarle). |
| `snippets/product-template.liquid` | Renderizza `product-delivery-date` nella pagina prodotto. |

## localStorage (condiviso tra le pagine del sito)

| chiave | formato | uso |
|---|---|---|
| `delivery_date_val` | `"Gio Luglio 9, 2026"` (it) | data scelta dall'utente, letta dal carrello |
| `new_delivery_date_val` | `YYYY-MM-DD` | max data dei prodotti nel carrello |
| `auto_delivery_date` | testo | data proposta automaticamente (pagina prodotto) |
| `bookings` | JSON array | date per prodotto aggiunte al carrello |
| `variantDate` | data testo | data della variante selezionata |

Il parsing di `delivery_date_val` usa una mappa mesi italiani→numero replicata in più file:
se cambi il formato rompi tutto.

## Fasce orarie

Valori option: `08-12`, `12-16`, `16-20`. `fnCheckDate` le ricostruisce a ogni chiamata
(`addSlots([...])`) filtrando per `custom.minimo_orario` e per le Regole per Brand.
`blockCheckout(msg)` nasconde le fasce e disabilita `#bntCheckout`.

## Modifiche del 9/7/2026 (regole cutoff — vedi REGOLE_BRAND.md)

In `delivery_date_hour_c.liquid`:
- aggiunto `romeNowParts()` (ora/data italiana via `Intl.DateTimeFormat` su `Europe/Rome`);
  `start_date`, `date`, `prdt_end_date` ora partono dalla data italiana, non da quella del device;
- cutoff prima data: `if (maxgiorno == 0 && ROME_NOW.h >= 16) date += 1 giorno`
  (sostituisce il vecchio hack `tmpHour >= 20 → days+1` che sbagliava anche a fine mese);
- `fnCheckDate`, ramo DOMANI: rimosso il blocco totale dopo le 20:00 (era il bug segnalato:
  di sera non si poteva ordinare per domani); ora `>= 22:00 → fasce 12-16 e 16-20`, altrimenti tutte;
- ramo DOPODOMANI: sempre tutte le fasce (rimossa la restrizione post-20:00).

In `sections/header.liquid` e `sections/home-delivery-section-new.liquid`:
- `var today` del calendario ora è la data italiana con cutoff 16:00 → `minDate` corretto.

In `snippets/product-delivery-date.liquid`:
- clamp `__dlxMin` prima dell'init del calendario: `start = max(start, dataMinimaDeluxy)`;
  gestisce anche `start` invalido (NaN da `Stardate`).

## Test — harness di simulazione

Per testare le regole senza il sito: renderizza il Liquid a mano e esegui in sandbox.

1. Prendi il contenuto del file, togli `{% comment %}…{% endcomment %}`;
   nel `{% for item in cart.items %}` sostituisci `{{ var_meta | json }}` → `0` e
   `{{ …minimo_orario | json }}` → `null`; `{{ '…' | t }}` → `'TXT'`; svuota gli altri tag.
2. Estrai il primo blocco `<script>` e controlla la sintassi con `new Function(js)`.
   **Baseline**: lo stesso processo sul file del tema live deve dare OK.
3. Esegui con stub: elementi DOM reali staccati (`date_disp2`, `DeliveryDate_def`,
   `max_del_date`, `last_prod_date`, `ddlFasciaOraria`, `bntCheckout`, `divCheckDelivery`),
   mini-shim jQuery (ready/append/children/find/css/attr/removeAttr/text/html/remove),
   `localStorage` finto, e `Intl.DateTimeFormat` wrappato che restituisce l'**ora mockata**.
   Esegui con `new Function('window','document','localStorage','Intl','$','jQuery','console', js)`.
4. Scenari minimi: ore 10/15/17/21/23 senza localStorage; con `delivery_date_val` = oggi
   (dopo cutoff → blocco), = domani, = data futura. Atteso: vedi REGOLE_BRAND.md.

## Insidie note (già pagate)

- Il selettore data del carrello si popola SOLO se lo script non muore: un `SyntaxError`
  in `delivery_date_hour_c.liquid` = campo vuoto + datepicker che non si apre + nessun
  messaggio. Prima ipotesi da verificare in caso di "carrello senza data".
- jQuery 2.1.4 è caricato in pagina insieme a jQuery 3.6: un'eccezione in un handler
  `ready` può bloccare gli handler successivi (incl. init del datepicker).
- L'anteprima nel theme editor è un iframe cross-origin: niente console/JS. Per debug vero
  serve accesso del browser al dominio del negozio (chiederlo all'utente) e la sessione staff
  (con essa `?preview_theme_id=<id>` funziona sul dominio).
- `?preview_theme_id` anonimo (curl) serve il tema live: inutile per verificare il dev.
- Per riempire il carrello in anteprima: `previewPath=/cart/add?id=<variantId>&quantity=1&return_to=/cart`.
- "Confermato in consegna: …" nella riga carrello viene da `main-cart.liquid` +
  `localStorage`, non dal form: non confonderlo con la data del form.
