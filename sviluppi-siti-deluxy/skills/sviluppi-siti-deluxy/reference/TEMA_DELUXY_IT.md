# Mappa tecnica — tema deluxy.it

Negozio: `deluxygifts.myshopify.com`. Temi (al 10/7/2026): live "Live" (MAIN)
`203369513290`, sviluppo "Version to work on" (UNPUBLISHED) `203573428554`.
Esistono ~20 temi di backup e un tema "ai developmet - do not touch it": **non toccarli**,
verifica sempre id e role prima di scrivere.

**È la versione più vecchia e disordinata dei tre siti** (stesso sviluppatore): stessa idea,
ma molto codice morto/commentato e nessun uso del fuso orario italiano prima del 10/7/2026.

## Sistema data di consegna — chi fa cosa

| File | Ruolo |
|---|---|
| `snippets/delivery_date_hour_c.liquid` | Carrello (render da `sections/main-cart.liquid`). `$(window).ready` per min/default data + `fnCheckDate` per le fasce. **Fasce granulari** (vedi sotto). Prima del 10/7 usava l'ora del device e un hack `days==today / tmpHour>20`. |
| `sections/header.liquid` | Calendario header `#header_deliverydate` (Semantic UI, `var today`). |
| `sections/home-delivery-section-new.liquid` | Calendario home (versione "new"). |
| `sections/home-delivery-section.liquid` | Calendario home (versione vecchia, con supporto lingua `/en`). |
| `snippets/home-delivery.liquid` | Widget home con calendario `#deliverydate`. |
| `snippets/product-delivery-date.liquid` (54KB) | Picker pagina prodotto (render da `snippets/product-template.liquid`); `.product-calendar` con `start` da `#Stardate` (Liquid `now` + `prodotto.consegna`). |
| `snippets/delivery-date.liquid` (16KB) | **NON usato** da nessun file (verificato 10/7/2026): ignorare. |
| `snippets/*-old*`, `*(…July 2024)*`, `delivery_date_hour_c_old` | Backup morti: ignorare. |

## Fasce granulari (particolarità di deluxy.it)

- **OGGI = fasce di 2 ore**: 08-10, 10-12, 12-14, 14-16, 16-18, 18-20, 20-22.
- **DOMANI e oltre = fasce di 1 ora**: 08-09, 09-10, … 21-22 (consegne fino alle 22:00).
- Ordine serale (20:00-24:00): domani con prima fascia **08-10** (2h) poi orarie.
- I `value` delle option sono stringhe `HH-HH` con zero-padding su entrambe le ore
  (es. `08-09`, `10-12`). Mantenere questo formato: lo consuma il resto del tema/ordine.

## Modifiche del 10/7/2026 (regole — vedi REGOLE_BRAND.md §deluxy.it)

`snippets/delivery_date_hour_c.liquid`:
- **`$(window).ready`**: aggiunto `romeNowParts()`; `start_date`/`date`/`prdt_end_date` dalla
  data italiana; cutoff prima data alle **20:00** (`maxgiorno==0 && ROME_NOW.h>=20 → +1`);
  rimosso il vecchio hack `days==today / tmpHour>20` (usava device time + Math.round su ora_min).
- **`fnCheckDate` riscritta da zero** (da ~24KB di rimozioni `.remove()` annidate a ~4KB puliti):
  ora italiana via `Intl` (`Europe/Rome`); rami OGGI (2h, anticipo 2h, notte da 10:00, ultima
  fascia 20-22 fino alle 20:00, blocco dalle 20:00), DOMANI (orarie; se ordine ≥20:00 prima
  fascia 08-10), DOPODOMANI+ (orarie); filtro `custom.minimo_orario`; tail che scrive
  `delivery_date_val` (formato `"Gio Luglio 9, 2026"`) e `#DeliveryDate_def` (YYYY-MM-DD).

`sections/header.liquid`, `sections/home-delivery-section-new.liquid`,
`sections/home-delivery-section.liquid`, `snippets/home-delivery.liquid`:
- `var today` del calendario = data italiana con cutoff 20:00.

`snippets/product-delivery-date.liquid`:
- clamp `__dlxMin` prima di `$(".product-calendar").calendar({`: `start = max(start, minData)`
  con cutoff 20:00 + lead time `prodotto.consegna`; protezione da `start` NaN.

## Insidie specifiche

- La `fnCheckDate` originale era un groviglio di `if (tmpHour > X && tmpHour < Y) $(...).remove()`
  con `tmpHour = device.getHours() + 2` (buffer) e bug sugli orari pari (soglie strette `>`/`<`
  che non scattavano alle ore esatte). Riscritta interamente: non cercare di rimetterci le pezze.
- Chiamate JS su slice molto grandi di questo file possono **freezare il renderer** del tab
  (timeout CDP): lavora su slice piccole (< ~2KB) e usa un tab admin "leggero" (es. settings)
  per eseguire le GraphQL, non l'editor del tema.
- Harness di test: vedi `TEMA_DELUXYFLOWERS.md` §Test. Attenzione: il rendering Liquid sostituisce
  `minimo_orario | json` con `null`, quindi per testare il filtro `ora_min` iniettalo a mano.
- **"Cambiando data il campo perde il valore"** (segnalato 10/7/2026): NON era un bug del tema dev.
  Verificato in simulazione che sul tema "Version to work on" sia la nuova `fnCheckDate` sia
  l'handler legacy `$('.pickup_date').change(...)` di `main-cart.liquid` mantengono il valore del
  campo `#DeliveryDate_def`. Il sintomo si vedeva perché si stava guardando il **tema live**
  (vecchio codice, `deluxy.it/cart` senza `preview_theme_id`), dove il problema esisteva.
  Regola operativa: quando l'utente segnala un bug su `<dominio>/cart` senza parametro di preview,
  **prima verifica quale tema sta guardando** (`Shopify.theme.id`) — le tue modifiche sono sul dev,
  non ancora pubblicate. Per testare il dev: editor tema → Anteprima, oppure `?preview_theme_id=<id>`
  con sessione staff.
- `main-cart.liquid` (99KB, non modificato) ha un handler `$('.pickup_date').change(...)` che al
  cambio data fa un POST `/cart/update.js` (salva l'attributo ordine `Data_Consegna`) e, in certi
  rami di conflitto con `#max_del_date`/`#last_prod_date`, può rimettere `#DeliveryDate_def` al
  valore di `#max_del_date`. Gira **in parallelo** al mio `onchange="fnCheckDate(...)"`. Se un domani
  serve toccare il salvataggio della data sull'ordine, è lì (non nel mio snippet).
