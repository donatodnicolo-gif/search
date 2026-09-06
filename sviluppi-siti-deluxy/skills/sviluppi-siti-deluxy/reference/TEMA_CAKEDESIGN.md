# Mappa tecnica — tema cakedesign.me

Negozio: `cakedesign-5921.myshopify.com`. Temi (al 10/7/2026): live "live" (MAIN)
`182508781891`, sviluppo "Version to work on" (UNPUBLISHED) `182548955459`.
**Verifica sempre id e role prima di scrivere** (nel negozio ci sono ~20 temi di backup).

Stessa famiglia di codice di deluxyflowers (stesso sviluppatore), ma **versione diversa**:
non dare per scontato che i file siano identici — controlla sempre gli anchor.

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

## Modifiche del 06/09/2026 (data di consegna solo dal calendario)

Caso reale: ordini #1834 (`Data_Consegna = 2026-undefined-11`), #1806 (`2026-undefined-18`) e
#1835 (`16 of september`), tutti da clienti sul sito in inglese. Copie dei file corretti in
`sviluppi-siti-deluxy/cakedesign/`. Caricati sul tema **«Version to work on»** (id
`182632743235`) e verificati con l'md5: `home-delivery-section` e `delivery_date_hour_c`;
**`main-cart.liquid` NON caricato** (bloccato dal classificatore del connettore, 3 tentativi):
va incollato a mano dal file nel repo.

`sections/home-delivery-section.liquid` (home, widget `#deliverydate`):
- in `/en` il calendario formattava la data con i mesi inglesi e la salvava così in
  `localStorage.delivery_date_val` («Fri September 11, 2026»); il carrello conosce solo i mesi
  italiani → mese `undefined`. ORA `onChange` mostra il testo nella lingua del sito ma in
  `.date_input` (e quindi nel localStorage) scrive SEMPRE il formato italiano
  «Ven Settembre 11, 2026».

`snippets/delivery_date_hour_c.liquid` (carrello):
- **normalizzatore** in testa al file, eseguito al parse (prima di ogni altro script del
  carrello, anche dei blocchi a parse-time di `main-cart`): `delivery_date_val` e
  `saved_delivery_date` vengono riportati al formato italiano se il mese è inglese; se non
  sono una data reale (`undefined`, testo libero, 30 febbraio) si cancellano e il carrello
  ripropone la prima data utile;
- `$(window).ready`: se la data ricostruita non è `AAAA-MM-GG` si azzera `localDate`
  (prima scriveva «2026-undefined-11» nel campo);
- `fnCheckDate`: guardia iniziale, con un valore non ISO esce (prima crollava con
  `TypeError` su «Invalid Date» e lasciava il campo sporco);
- input `#DeliveryDate_def`: `readonly autocomplete="off" inputmode="none"` → si compila
  solo dal datepicker jQuery UI (che si apre anche su input readonly). Prima era testo libero.

`sections/main-cart.liquid` (DA CARICARE A MANO):
- `fnCheckDelivery`: al checkout passa solo `AAAA-MM-GG` con giorno reale, altrimenti svuota
  il campo e mostra `general.new.select_delivery_date`;
- blocco «OVERWRITING INPUT VALUE» (`monthMap` italiano): mese non riconosciuto → `maxDate`.
- Restano altri tre `monthMap` solo italiani (etichette e popup): coperti dal normalizzatore.

Prova simulata (`harness.js` in sessione): «Fri September 11, 2026» → «Ven Settembre 11, 2026»;
«undefined», «16 of september», «Wed February 30, 2026» → cancellati; checkout blocca
«2026-undefined-11», «16 of september», «2026-02-30», «2026-9-1».

## Insidie specifiche

- `fnCheckDate` attiva usa `currentHour` (`getItalyHour()`): già in ora italiana, ma il
  blocco `$(window).ready` PRIMA delle modifiche usava l'ora del device — controllare
  sempre entrambe le parti.
- Il vecchio `minDate +2` del picker prodotto era una toppa: se qualcosa sembra
  incoerente con le Regole per Brand, chiedere all'utente prima di "correggere" al buio.
- Per i test vale l'harness descritto in `TEMA_DELUXYFLOWERS.md` §Test (identico qui).
