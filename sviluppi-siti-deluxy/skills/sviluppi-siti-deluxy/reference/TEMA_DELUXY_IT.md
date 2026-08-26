# Mappa tecnica — tema deluxy.it

Negozio: `deluxygifts.myshopify.com`. Temi (al 26/8/2026): live "Live" (MAIN)
`204735971658`, sviluppo "Version to work on" (UNPUBLISHED) `204745769290`.
**Gli id cambiano a ogni giro di backup/publish: rileggerli sempre con `themes(first:30)`
prima di scrivere** (quelli del 10/7 — 203369513290/203573428554 — non esistono più).
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

## Province coperte e locale russo (bug risolto il 26/8/2026)

La whitelist delle province coperte è lo **shop metafield `custom.default_provinces`**
(`list.single_line_text_field`, valore primario `["ITALY-ROMA(RM)","ITALY-MILAN(MI)",…]`,
9 voci con LODI). `layout/theme.liquid` la interpola in uno script inline e la parsa con
la regex `/ITALY-(.*)\((\w+)\)/` → `localStorage.default_provinces`. Due gate la usano:
il listener di `addToCartButtonManual` (pagina prodotto) e `submitButtonHandler` (modal
indirizzo): se la lista è vuota, aprono `noProductsModal` per QUALSIASI indirizzo.

**Il bug**: i metafield sono traducibili da Translate & Adapt. Il 7/2/2026 era stata
registrata una traduzione RUSSA in cirillico («ИТАЛИЯ-МИЛАН(МИ)», 4 codici su 9 in
cirillico): la regex non combaciava mai → lista vuota → sul locale `/ru` nessun cliente
superava la verifica di consegna, nemmeno per Milano (verificato con replay del codice
reale: parse it 9/9, en 9/9, ru 0/9). **Fix applicato**: `translationsRemove` della
traduzione ru del metafield (gid://shopify/Metafield/53650775671114) → il russo ricade
sul valore primario; verificato live 9/9 il 26/8. Vecchio valore RU (per eventuale
rollback) nella memoria del progetto.

**Regole**: (1) MAI tradurre `custom.default_provinces` in Translate & Adapt; (2) blindatura
del parse APPLICATA il 26/8 sul tema dev «Version to work on» (`theme.liquid`, +784 byte):
regex `/-(.*)\((\w+)\)/` senza prefisso obbligato + se `provincesArray.length <
provinceItems.length` (parse rotto O parziale) ripiego sui codici
`['RM','MI','FI','PV','BG','MB','VA','CO','LO']` con `console.warn` — testata in Node su
valore primario (parse normale 9/9), traduzione cirillica e lista mista (ripiego 9 codici);
va in produzione quando l'utente pubblica il tema dev; (3) attenzione: la whitelist include
LODI ma le zone di spedizione Shopify NON hanno una tariffa per Lodi → chi è di Lodi passa
il check e al checkout non trova corrieri.

## Verifiche ostili del 26/8/2026 (carrello/data, replay del codice live)

- **Il filtro fasce funziona** (IT/EN/RU): `fnCheckDate` gira on-ready e on-change, ora
  di Roma via Intl; a 16:08 restano 18-20 e 20-22, a 20:05 zero fasce + checkout
  disabilitato. I calendari scrivono `delivery_date_val` in formato ITALIANO su ogni
  locale ("Mer Agosto 26, 2026"), per questo il parser coi mesi italiani regge anche
  su /en e /ru. Su /ru i messaggi di blocco sono rimasti in inglese.
- **Trappola di aprile (bug attuale, tutti i locali)**: nei config dei calendari c'è
  `'aprile'` MINUSCOLO contro la mappa parser `'Aprile'` → ogni data di aprile scelta
  dall'header esce `2026-undefined-9`, e Shopify accetta e salva `Data_Consegna` rotta.
  Fix: un carattere nei config (cart r.3345, product r.3445, en/ru identici).
- **Doppio fail-open al checkout**: `fnCheckDelivery` legge `$("#DeliveryDate")` che
  NON esiste (il campo vero è `#DeliveryDate_def`, che peraltro ha `name="checkIn"`:
  la data arriva all'ordine SOLO dal POST JS a /cart/update.js, mai dal submit del
  form) → il ramo DATA non scatta mai (`undefined == ""` è false). ⚠️ Riverificato
  ostile sul live 26/8 sera: `fnCheckDelivery` è morta A METÀ — il ramo FASCIA è
  vivo (`#ddlFasciaOraria` esiste, prima option "") e dal bottone principale la
  fascia vuota BLOCCA davvero il submit; «passa senza fascia» vale SOLO dagli
  express (`<shopify-accelerated-checkout-cart>`: Shop Pay/PayPal/GPay vanno
  dritti al wallet, nessuno script del tema li intercetta). Se il ready muore
  (valore legacy tipo "mer 26 ago 2026" o "undefined" in `delivery_date_val`,
  entrambi i ready senza try) la tendina resta quella statica con tutte le 15
  option e nessun POST di `Data_Consegna` parte — dal bottone principale serve
  comunque scegliere una fascia (anche passata). Nessuna validazione server degli
  attributi (accetta fasce passate e date malformate via /cart/update.js; la
  sanitizzazione dell'header rimuove solo le date SCADUTE, non le malformate —
  `new Date('') < oggi` è false).
  **Impatto vendite (verificato): ZERO ordini persi per costruzione** (fail-open
  = lascia comprare) e ZERO ordini web sporchi osservati (42/42 con data ISO in
  18 giorni: il POST on-ready mette l'attributo prima che l'utente clicchi
  qualsiasi bottone, express compresi). Il rischio è latente/operativo, non di
  fatturato. ⚠️ Un fix ingenuo che punta il guard a `#DeliveryDate_def` lo
  trasformerebbe in un blocco NUOVO: quello sì potrebbe costare vendite.
- **Il funnel web salva la data**: su 80 ordini reali (9-26/8) i 42 `web` hanno TUTTI
  `Data_Consegna` ISO + fascia HH-HH regolari; i 34 senza attributi sono TUTTI draft
  dello staff (9 senza data da nessuna parte). Il dato mancante è un problema del
  canale manuale, non del sito.
- **Rumore inerte**: `delivery_date_val_eng` viene scritto (anche "undefined") ma mai
  letto; il campo `checkIn` (`2026-undefined-ago` con valori legacy) viene inviato ma
  Shopify lo scarta — inquina solo `#max_del_date` in pagina.
- **Cutoff 20:00 mai dichiarato all'utente**: esiste solo nel codice; nessun testo
  «ordina entro le…» in carrello o scheda prodotto.

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
