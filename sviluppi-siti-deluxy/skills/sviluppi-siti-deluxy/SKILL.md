---
name: sviluppi-siti-deluxy
description: >-
  Sviluppo e manutenzione dei siti Shopify di Deluxy srl (deluxyflowers.com, deluxy.it,
  cakedesign.me): modifiche al tema, regole data/ora di consegna, date picker del carrello,
  calendari header/prodotto/home. Usala quando l'utente vuole modificare il tema di un sito
  Deluxy, cambiare le regole di consegna, sistemare bug del carrello o testare in anteprima.
  Trigger: "deluxyflowers", "tema Shopify", "carrello", "data di consegna", "version to work on".
---

# Sviluppi Siti Deluxy srl

Questa skill raccoglie l'esperienza operativa per lavorare sui **temi Shopify dei siti Deluxy**
senza rompere il sito live. Leggi anche:

- `reference/REGOLE_BRAND.md` — **Regole per Brand**: regole ufficiali di consegna (cutoff orari,
  prima data selezionabile, fasce orarie) per ogni sito. **È la fonte di verità del business.**
- `reference/TEMA_DELUXYFLOWERS.md` — mappa tecnica del tema di deluxyflowers.com
  (file, id DOM, localStorage, architettura del sistema date).
- `reference/TEMA_CAKEDESIGN.md` — mappa tecnica del tema di cakedesign.me (stessa famiglia
  di codice ma versione diversa: file e anchor NON identici a deluxyflowers).
- `reference/TEMA_DELUXY_IT.md` — mappa tecnica del tema di deluxy.it (versione più vecchia,
  fasce granulari 2h/1h; `fnCheckDate` riscritta).

## Negozi

| brand | shop (.myshopify.com) | note |
|---|---|---|
| deluxyflowers.com | fb72b1-2 | tema Impulse 7.2.0 personalizzato |
| deluxy.it | deluxygifts | versione tema più vecchia; fasce granulari 2h (oggi) / 1h (dopo) |
| cakedesign.me | cakedesign-5921 | tema stessa famiglia di deluxyflowers, versione diversa |

## Regola d'oro n.1 — mai toccare il tema live

1. Tutto lo sviluppo si fa sul tema **"Version to work on"** (role `UNPUBLISHED`).
   Su fb72b1-2: dev id `202100179269`, live id `202097721669` (verifica sempre, possono cambiare).
2. **Prima di OGNI scrittura** interroga `theme { name role }` e procedi **solo se**
   `role == UNPUBLISHED` e il nome è quello del tema di sviluppo. Se non torna, fermati.
3. La **pubblicazione** la fa l'utente dall'admin (o la chiede esplicitamente). Mai pubblicare
   di propria iniziativa.
4. Se "Version to work on" è vecchio rispetto al live, chiedi all'utente se rifarne una copia
   dal live prima di iniziare (le modifiche al live fatte nel frattempo andrebbero perse).

## Come accedere al tema

**Via MCP Shopify (preferito)** — `graphql_query` / `graphql_mutation`:
- Lettura file: `theme(id:...) { files(filenames:[...]) { nodes { filename body { ... on OnlineStoreThemeFileBodyText { content } } } } }`
- Scrittura: mutation `themeFilesUpsert(themeId, files:[{filename, body:{type:TEXT, value}}])` —
  il connettore consente scritture **solo su temi non pubblicati** (bene così).

**Via browser (fallback se il connettore è invalidato)** — dall'admin `admin.shopify.com` si può
usare l'API GraphQL Admin con la sessione staff:
```js
const sd = JSON.parse(document.querySelector('[data-serialized-id="server-data"]').textContent);
fetch('https://admin.shopify.com/api/shopify/<store>', { method:'POST',
  headers:{'Content-Type':'application/json','X-CSRF-Token':sd.csrfToken},
  body: JSON.stringify({query, variables}) })
```
Anche qui: guardia sul `role` del tema DENTRO la stessa chiamata che scrive.

## Come modificare i file (tecnica sicura)

I file del tema sono grandi e pieni di codice legacy: **non riscriverli**, fai chirurgia mirata.

1. Scarica il contenuto esatto del file e tienilo in una variabile.
2. Modifica con **replace ancorati**: prima di ogni replace verifica che l'anchor sia **unico**
   (`s.split(anchor).length === 2`), altrimenti fermati. Per blocchi lunghi usa indici
   (`indexOf` da un marker) e controlla lunghezza e contenuto del blocco che stai per
   rimuovere/sostituire (es. `if (!removed.includes('...') || removed.length > N) throw`).
3. ⚠️ **Insidia vissuta**: cercando `} else {` come anchor di fine blocco si può agganciare un
   `else` **interno** annidato invece di quello esterno → codice orfano → `SyntaxError` che
   uccide TUTTO lo script del carrello (campo data vuoto, datepicker morto). Conta le graffe o
   usa marker univoci (stringhe di console.log) e **valida sempre la sintassi** (punto 4).
4. **Valida la sintassi prima di caricare**: simula il rendering Liquid (togli
   `{% comment %}…{% endcomment %}`, sostituisci i `{{ … }}` con valori plausibili, svuota i tag
   `{% … %}`), estrai ogni blocco `<script>` e prova `new Function(codice)`. Confronta col file
   del tema live come baseline: se il live passa e il tuo no, hai introdotto tu l'errore.
5. Dopo l'upsert **verifica il round-trip**: rileggi il file dal tema e confronta col contenuto
   inviato (devono essere identici).

## Come testare

1. **Test logico simulato** (sempre): esegui lo script renderizzato in sandbox con stub DOM +
   mini-shim jQuery + `Intl.DateTimeFormat` mockato per simulare le ore italiane (8, 15, 17,
   21, 23) e i vari stati di `localStorage`. Vedi TEMA_DELUXYFLOWERS.md §Test per l'harness.
2. **Anteprima reale**: editor tema `admin.shopify.com/store/<store>/themes/<id>/editor?previewPath=/cart`.
   - Per riempire il carrello: `previewPath=/cart/add?id=<variantId>&quantity=1&return_to=/cart`.
   - L'anteprima è un iframe cross-origin: **niente console né JS** da lì. L'editor è lento:
     attendi 20–40s tra navigazione e screenshot.
   - `https://<dominio>/?preview_theme_id=<id>` in forma anonima (curl) serve il **tema live**:
     non usarlo per verificare il dev.
3. **Verifica finale con l'utente**: al termine chiedi sempre all'utente di controllare
   visivamente che funzioni (preferenza esplicita dell'utente). Non serve automatizzare tutto.

## Fusi orari e date (fondamentale)

- Tutte le regole orarie sono in **ora italiana**: calcola SEMPRE ora/data con
  `Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', ... })`, mai con `new Date()` nudo
  (i clienti possono essere all'estero).
- `localStorage.delivery_date_val` usa il formato italiano `"Gio Luglio 9, 2026"` (giorno
  abbreviato, mese capitalizzato, mappa mesi→numero presente in più file). Attenzione a non
  romperne il parsing.
- Il Liquid `{{ 'now' }}` è renderizzato server-side e **cachato**: per i cutoff orari serve
  JavaScript client-side, non Liquid.

## Metafields prodotto rilevanti

- `prodotto.consegna` (int): giorni di lead time (0 = consegna in giornata possibile).
  Sulle varianti può esistere `variant.metafields.prodotto.consegna` che ha precedenza.
- `custom.minimo_orario` (int): prima ora di consegna del prodotto (filtra le fasce).
