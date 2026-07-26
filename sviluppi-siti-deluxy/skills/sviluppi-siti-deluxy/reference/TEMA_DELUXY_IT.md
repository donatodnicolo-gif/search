# Mappa tecnica — tema deluxy.it

> 📍 **Stato del lavoro, correzioni pronte da pubblicare e problemi aperti:**
> [STATO-DELUXY-IT.md](STATO-DELUXY-IT.md) — leggilo per primo se riprendi il lavoro.

Negozio: `deluxygifts.myshopify.com`. Temi (al 25/7/2026): live (MAIN) `204350161226`
(nome "live", pubblicato il 25/7 alle 16:20), sviluppo "Version to work on" (UNPUBLISHED)
`204439585098`. **Gli id cambiano a ogni pubblicazione** (si pubblica un duplicato e se
ne crea uno nuovo per lavorare): verifica sempre `role` prima di scrivere, non fidarti
degli id scritti qui. Il negozio è vicino al **limite di 20 temi**: per duplicare bisogna
prima eliminare un backup (la `themeDuplicate` fallisce silenziosamente, `newTheme: null`
senza userErrors).

> Il connettore Shopify MCP **blocca le scritture sul tema MAIN** (e la pubblicazione):
> si lavora sul tema UNPUBLISHED e la pubblicazione la fa l'utente dall'admin.
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

## Blocco cookie iubenda vs Google Maps (fix del 18/7/2026)

- **Sintomo**: con cookie rifiutati (o banner ignorato) l'autocomplete indirizzo della modale
  "Select delivery options" non mostra suggerimenti (`getPlacePredictions` → `UNKNOWN_ERROR`
  in ~10ms, nessuna richiesta di rete) → impossibile aggiungere al carrello / comprare.
- **Causa**: il blocker iubenda (`window.cmpblocker`, caricato dal widget
  `embeds.iubenda.com/widgets/94d409ef-…js`) sovrascrive `document.createElement` e neutralizza
  gli script dinamici JSONP dell'SDK Places (`src` → `data-cmp-src`, classe `cmplazyload`);
  `maps.googleapis.com` è nella sua blocklist come vendor "178". La chiave Google e la Places
  API legacy funzionano (verificato via REST). NON è un problema di chiave/billing.
- **Fix**: script inline in `snippets/all_tags_and_script.liquid` (in fondo al file) che
  definisce `window.cmp_block_ignoredomains` con getter/setter che fa il **merge** di
  `maps.googleapis.com` e `maps.gstatic.com` con la lista che il widget assegna dopo.
  Il blocker rilegge quella whitelist a ogni blocco, quindi l'ordine di caricamento è
  indifferente. Verificato in anteprima (tema 203952652618) con consenso rifiutato: `OK`, 5
  suggerimenti.
- Alternativa equivalente senza codice: dashboard iubenda → blocco automatico → eccezioni.
- ⚠️ Il popup "Select delivery options" **senza indirizzo validato fallisce in silenzio**:
  in `sections/cart-popup-step1.liquid`, `submitButtonHandler` legge provincia/indirizzo da
  localStorage (`administrativeAreaLevel2`/`formatted_address`, scritti SOLO alla selezione di
  un suggerimento Google). Senza selezione, il ramo prodotti fisici (`if (localStorageAddress
  && partnerAddress)`) non ha `else`: la funzione termina senza feedback e il bottone resta
  `disabled` (disabilitato a inizio handler). **Fix applicato (18/7/2026) sul tema dev
  204060033354**, in coda a `snippets/all_tags_and_script.liquid`: listener in capture sul
  modal che intercetta il click su `#deliveryOptionBtn` quando manca `formatted_address`,
  mostra messaggio in `.available-from-date` (IT/EN via `request.locale`) e riabilita il
  bottone; esclusi i flussi `open-from-top-bar`/`open-from-date-select` (solo data). Stesso
  blocco: placeholder "Enter address" sui locale non-IT. Logica verificata dal vivo
  (iniezione su sito live: messaggio visibile, bottone riutilizzabile).
- **Migrazione Places API (da pianificare, non urgente)**: il tema usa
  `google.maps.places.Autocomplete` + `AutocompleteService` (legacy: deprecate per i nuovi
  clienti da 3/2025, ma funzionanti per i clienti esistenti; Google promette ≥12 mesi di
  preavviso prima dello spegnimento). Target: `PlaceAutocompleteElement` +
  `AutocompleteSuggestion`. Prerequisito: abilitare **"Places API (New)"** sul progetto Google
  271943634172 (oggi risponde 403 PERMISSION_DENIED) — azione dell'utente in Google Cloud
  Console, SKU di fatturazione diversi. Codice da toccare: `createAutocomplete()` e
  `handleSelectedPlace()` in `layout/theme.liquid` (mapping `address_components` →
  `addressComponents`), più il campo "Dove" della home. `DistanceMatrixService` in
  `cart-popup-step1.liquid` è un'API separata, non coinvolta.
- Placeholder hardcoded `"Inserisci Indirizzo"` nell'input della modale
  (`cart-popup-step1.liquid`): compare anche sul sito in inglese. Il formato data italiano
  `"Sab Luglio 18, 2026"` in `delivery_date_val` è invece **voluto/strutturale**: lo parsano
  `parseItalianDateToISO` e la mappa mesi in più file — NON cambiarlo per estetica.

## Modifiche del 25/07/2026 (tema di lavoro `204439585098`, da pubblicare)

- **Barra WhatsApp "Ordina Ora" rimossa** (`sections/footer-group.json`): era la sezione
  `bottom_help_bar_yWzTXN` (type `bottom-help-bar`) nel *footer group*, quindi su tutte le
  pagine e in tutte le lingue, con testo hardcodato in italiano. Aggiunta fra il 13/04 e il
  07/05/2026 da chi cura il tema (codice a mano, CRLF, default `+390294751221` = riuso da un
  altro negozio). Già live: il tema pulito è stato pubblicato il 25/7.
- **`Translation missing: it.cart.general.greetings_next_day_available`**
  (`snippets/delivery_date_hour_c.liquid`): la chiave **non è mai esistita** in `locales/it.json`
  né in `en.default.json` (md5 identici ai backup); la chiamavo dal 10/7 nella `fnCheckDate`
  riscritta. Compariva nel carrello quando per oggi non resta nessuna fascia (dopo le 20:00 o con
  `minimo_orario` alto) **bloccando il checkout**. Sostituita con messaggio letterale IT/EN via
  `request.locale.iso_code`. Verifica: diff del carrello renderizzato live vs anteprima = **1 riga
  su 298**.
- **Indirizzo digitato ≠ indirizzo salvato** (`snippets/all_tags_and_script.liquid`): la guardia del
  18/7 mostrava l'avviso solo se `formatted_address` mancava del tutto, quindi chi aveva già un
  indirizzo in localStorage poteva riscrivere il campo senza selezionare un suggerimento e ordinare
  verso il **vecchio** indirizzo. Aggiunto listener `keydown` (solo tasti di scrittura, `isTrusted`)
  sui tre campi indirizzo che scarta `formatted_address`/`administrativeAreaLevel2`: la selezione di
  un suggerimento (click o Invio) non passa di lì e riscrive subito i valori corretti.
- **Quantità** (stesso file di patch): `addToCartProductOnDeliveryDate()` invia sempre
  `quantity: 1` (hardcodato) e non riceve la quantità; nel carrello il campo `updates[]` partiva
  solo col submit del checkout, quindi il totale mostrato restava vecchio. Siccome le due funzioni
  vivono in `product-template.liquid` (44KB) e `main-cart.liquid` (99KB) — non patchabili in modo
  chirurgico via API, che riscrive solo file interi — il fix è nel file di patch:
  1. wrapper su `window.fetch` che, **solo su `body.template-product`** e solo se la quantità
     scelta è > 1, corregge il `quantity` nel corpo di `/cart/add.js` (il campo quantità è
     duplicato desktop/mobile: si prende il **massimo**, così non dipende dal layout);
  2. sul carrello, `change` sui campi `input[name="updates[]"]` → `POST /cart/change.js` con la
     **chiave di riga** presa da `data-id`, poi reload.
  Verificato dal vivo sull'anteprima: 3 pezzi → carrello 3 (€525); regressione a 1 → 1 (€175);
  campo carrello 2 → riga 2 (€350); gli attributi `Data_Consegna`/`Fascia_Oraria`
  **sopravvivono** a `change.js`.

## Modifiche del 26/07/2026 (tema di lavoro `204460360010`, da pubblicare)

- **Fascia oraria e bigliettino salvati nel carrello** (`snippets/all_tags_and_script.liquid`).
  Erano solo campi del form della pagina carrello (`select[name="attributes[Fascia_Oraria_Consegna]"]`
  con `onchange="fnCheckTesto()"` che non salva nulla, e `textarea[name="note"]` = nota d'ordine):
  partivano **solo col submit del checkout**, mentre la data va nel carrello subito
  (`handlePickupDateChange()` → `/cart/update.js`). Risultato: ogni flusso che non completa il
  checkout dalla pagina carrello — bozze d'ordine costruite dal carrello del cliente, carrelli
  abbandonati, checkout dal drawer (il `#CartDrawerForm` non contiene né tendina né nota) —
  arrivava **con la data e senza fascia né bigliettino**. Caso reale: ordine #12646, nato dalla
  bozza #D5510, con il solo `Data_Consegna`.
  Ora: `change` sulla tendina → `attributes[Fascia_Oraria_Consegna]`; `blur` sulla nota → `note`;
  al cambio data la fascia salvata viene **azzerata** (le fasce vengono ricalcolate).
  Verificato sull'anteprima: fascia `10-12` e nota salvate senza checkout; dopo cambio data resta
  solo `Data_Consegna`.
- ⚠️ **Il negozio è al limite di 20 temi**: `themeDuplicate` è tornata `newTheme: null` senza
  userErrors (conferma dell'insidia già nota). Per avere un tema di lavoro nuovo bisogna prima
  eliminare un backup dall'admin.

## Modifiche del 26/07/2026 — secondo giro (tema di lavoro `204465930570`, da pubblicare)

Trovate dai 10 agenti QA sul live, corrette tutte in `snippets/all_tags_and_script.liquid`
(mai nei file grossi: le API riscrivono solo file interi e `layout/theme.liquid` è il layout
dell'intero sito).

- **Numero civico perso** (il più costoso: ordini con indirizzo non consegnabile). In
  `handleSelectedPlace()` di `layout/theme.liquid` il civico veniva concatenato *mentre* si
  scorrono gli `address_components`: siccome Google restituisce `street_number` **prima** di
  `route`, finiva appeso a una stringa vuota e la riga dopo lo sovrascriveva. Fix: la funzione
  globale del tema viene **avvolta** dal file di patch e l'indirizzo ricomposto dopo
  (`via, civico, città`). Verificato dal vivo con componenti in ordine Google:
  `Corso Buenos Aires, 33, Milano` (prima: `Corso Buenos Aires, Milano`).
- **Fascia oraria ri-selezionata** nella tendina al caricamento del carrello, leggendo
  `/cart.js`. Serviva perché il `select` riparte sempre vuoto e, essendo
  `name="attributes[Fascia_Oraria_Consegna]"`, **il submit del form cancellava l'attributo**
  già salvato. Se la fascia salvata non è più fra le opzioni della data corrente, viene
  azzerata invece che imposta. Verificato: attributo `14-15` → tendina su `14-15`.
- **Azzeramento fascia al cambio data**: il bind con `addEventListener('change')` **non
  scattava**, perché il datepicker jQuery UI emette un evento jQuery e non un evento DOM.
  Aggiunto anche `jQuery(campo).on('change', …)` e tolto il `setTimeout(600)` (che poteva
  cancellare una fascia scelta subito dopo).
- **Bigliettino**: la textarea del tema stampa `{{ cart.note }}` indentato, quindi ogni
  salvataggio aggiungeva 20 spazi (misurato: 12 → 32 → 52 → 72 caratteri, fino a saturare
  `maxlength=200`). Ora il campo viene ripulito al caricamento e la nota già sporca sul server
  viene risalvata pulita una volta sola. Coperta anche la textarea del drawer
  (`#CartNoteDrawer`), prima non salvata.
- **Barra in alto**: senza indirizzo mostrava la stringa `null` a ogni nuovo visitatore; ora
  "Scegli il tuo indirizzo" / "Choose your address".

- **Data anteriore ai tempi di preparazione** (`snippets/delivery_date_hour_c.liquid`): la
  `fnCheckDate` non confrontava mai la data scelta con il lead time del carrello, quindi
  passavano date impossibili (e pure date nel passato). Aggiunto in testa alla funzione il
  confronto con `#last_prod_date` (= oggi + max lead dei prodotti in carrello): sotto quella
  soglia `blockCheckout` con messaggio IT/EN che indica la prima data possibile. Verificato dal
  vivo con `realistic-cat-cake` (lead 7 gg): `last_prod_date = 2026-08-02`; scelta 29/07 →
  checkout bloccato, 0 fasce, messaggio corretto; scelta 05/08 → checkout attivo, 14 fasce.
- **Perché serviva**: `prodotto.consegna` è impostato **sia sul prodotto sia sulle varianti, con
  valori diversi**. Es. `realistic-cat-cake`: prodotto = 3, **tutte le varianti = 7**;
  `elegant-cake`: prodotto = 2, variante "6" = 1. Il carrello legge la **variante** (giusto), la
  scheda prodotto legge il **prodotto** (`var lead = Number(3)`, da `snippets/product-delivery-date.liquid`,
  55KB): il cliente vede una data e il carrello ne pretende un'altra, fino a 4 giorni dopo.
  **La scheda prodotto resta da correggere** (deve leggere il metafield della variante e
  aggiornarsi al cambio variante).

**Confermato a runtime** (era analisi statica di A3): la data del carrello **viene sovrascritta
da `localStorage`** a ogni apertura di `/cart` — impostato `Data_Consegna=2026-07-28`, dopo il
caricamento risultava `2026-07-29` (valore del browser). Non ancora corretto: il carrello non è
la fonte di verità della data.

## Insidie specifiche

- La `fnCheckDate` originale era un groviglio di `if (tmpHour > X && tmpHour < Y) $(...).remove()`
  con `tmpHour = device.getHours() + 2` (buffer) e bug sugli orari pari (soglie strette `>`/`<`
  che non scattavano alle ore esatte). Riscritta interamente: non cercare di rimetterci le pezze.
- **Tab in background = transizioni CSS congelate**: automatizzando il browser il tab spesso ha
  `document.hidden === true`; in quello stato le transizioni non avanzano mai e
  `getComputedStyle` restituisce i valori **iniziali** anche con `!important` inline (le
  transizioni battono `!important` nella cascata). Il 25/7 questo ha fatto sembrare "invisibile"
  la modale `#custom-modal` del carrello (che ha `transition: all .5s` e si mostra con
  `body.modal-open`): con `transition:none` risolveva a `visibility:visible; opacity:1`. Stessa
  trappola: `offsetParent === null` è **normale** per elementi `position: fixed`, e `innerText`
  torna vuoto quando il rendering è sospeso. Prima di dichiarare un bug di visibilità, controlla
  `document.hidden` e disattiva le transizioni.
- L'editor tema dell'admin su questo negozio **blocca il renderer** del tab (screenshot in timeout,
  sidebar ferma allo scheletro): per modifiche puntuali usa le API (`themeFilesUpsert`), non l'UI.
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
