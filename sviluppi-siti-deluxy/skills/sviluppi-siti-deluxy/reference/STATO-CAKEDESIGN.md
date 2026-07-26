# Stato cakedesign.me — 26/7/2026

Documento da leggere **per primo** prima di toccare cakedesign.me. Mappa tecnica del tema e
insidie storiche: [TEMA_CAKEDESIGN.md](TEMA_CAKEDESIGN.md). Gemello per deluxy.it:
[STATO-DELUXY-IT.md](STATO-DELUXY-IT.md).

## Temi (verifica sempre, gli id cambiano a ogni pubblicazione)

| Ruolo | Nome | Id | Note |
|---|---|---|---|
| MAIN (live) | `live` | `182574350659` | aggiornato 24/7/2026 |
| UNPUBLISHED (lavoro) | `Version to work on` | `182574317891` | **contiene lavoro pronto, non pubblicato** |
| UNPUBLISHED | `Version to work on (test Deivid)` | `182608265539` | **non** è il tema di sviluppo standard: non scriverci senza chiedere |

Gli id annotati il 10/7 sono obsoleti (il vecchio dev oggi è "fino al 13.07"). Interroga sempre
`themes(first:30){ nodes{ id name role updatedAt } }` prima di lavorare.

## Pronto sul tema di lavoro, DA PUBBLICARE

### 1. Numero WhatsApp/telefono migrato
`+39 02 9475 1221` → **`+39 02 8295 2899`**. **53 occorrenze in 19 file**, comprese le forme
`wa.me/`, `api.whatsapp.com/send?phone=`, `tel:` (compatto e spaziato) e il numero scritto a
video. Mappa file per file in [TEMA_CAKEDESIGN.md](TEMA_CAKEDESIGN.md) §Numero di telefono.

Tutte verificate una per una confrontando *contenuto del live + sostituzioni* con quello
effettivamente salvato (MD5 dove possibile, confronto integrale altrove): **zero discrepanze**,
ogni file differisce dal live solo per le cifre del numero.

### 2. Tema allineato al live
Il dev era fermo al 16/7 mentre il live era al 24/7. Ricopiati dal live i **4 file** che
differivano — il dev è ora una fotografia del live più il numero nuovo:

- `snippets/css-variables.liquid` — **il più importante**: contiene il fix dei bottoni
  "aggiungi al carrello" della griglia collezione. Senza questo passaggio, pubblicando si
  reintroduceva quel bug.
- `templates/collection.json` — sottocollezioni Best Sellers attuali (`cream-tart`,
  `cake-design`, `film`, `luxury-cakes`) invece delle vecchie.
- `sections/custom-phone-button.liquid` — posizione del bottone telefono flottante.
- `templates/page.landing-torte-compleanno.json` — refuso "realizzte" → "realizzate".

## Da fare, e le può fare solo l'utente dall'admin

1. **Pubblicare** il tema `182574317891` — è il passo che porta online il nuovo numero.
2. **Privacy policy**: contiene ancora `+39 02 9475 1221`. Le policy non stanno nel tema, valgono
   per tutti i canali e la modifica è immediata sul live. `Impostazioni → Policy`.
3. **Banner cookie doppio**: convivono iubenda (app embed `cmp-insert-code`) e il banner nativo
   Shopify. Si tiene iubenda e si rimuove il nativo da `Impostazioni → Privacy dei clienti`.
   **Mai disattivarli entrambi.** Identico al caso già risolto su deluxy.it.

## Aperto, non ancora affrontato

- **jQuery e Semantic UI caricati due volte** su home, `/en` e prodotto (~1 MB di parsing in
  doppio; jQuery re-inizializzato azzera gli handler già registrati). Primo sospetto per i
  comportamenti intermittenti del date picker. È il candidato successivo più utile.
- jQuery **2.1.4** (2015), con CVE note.
- Popup exit-intent "DOLCEVIA" in italiano anche su `/en`, con bottone verso `/cart` invece di
  `/en/cart`; barra annunci in italiano su `/en`.
- `flag-icon.min.css` linkato 3 volte da cdnjs, render-blocking.
- `/pages/contatti` senza `<h1>`; un blocco `ld+json` malformato sulla pagina prodotto.
- Un **terzo numero**, `393498853209`, in `page.fiori.json`, `page.contatti.json` e nelle policy
  "Informazioni di contatto" e "Rimborso": numero diverso, l'utente non ne ha chiesto la migrazione.

Verificato **pulito** nell'audit: nessun Liquid non renderizzato, nessun link o immagine rotti
(69 link e 40 immagini testati), markup bilanciato, meta SEO e `hreflang` corretti.

## Trappole pagate su questo lavoro

- **Il negozio è al limite di 20 temi**: `themeDuplicate` viene accettata ma **fallisce in
  silenzio** (`newTheme: null`, nessun `userErrors`, nessun tema creato). Per avere una copia
  del live bisogna che l'utente cancelli un backup o duplichi a mano dall'admin. In alternativa,
  come fatto qui: allineare il tema di sviluppo esistente ricopiandoci sopra i file dal live.
- **Checksum inaffidabili sui `.json`**: `size` e `checksumMd5` descrivono la forma *minificata*
  memorizzata, mentre `body.content` arriva *indentato*. L'MD5 dell'atteso non coincide **mai**
  con quello del sorgente. Confronto valido: `md5(body del live + sostituzioni)` contro il
  `checksumMd5` della *destinazione* dopo la scrittura. Sui `.liquid` invece coincidono.
  Diagnostica utile dopo un errore: un `.json` con `size` uguale a quella del live non è stato
  scritto, uno più grande sì.
- **Caratteri non-ASCII**: passando i contenuti attraverso un agente si rischia di convertire
  silenziosamente spazi unificatori U+00A0, accenti, apostrofi `’` ed emoji. Inviare i non-ASCII
  come `\uXXXX` con backslash **singolo** e controllare che la lunghezza resti invariata quando
  la sostituzione è a parità di caratteri. È già successo: 19 U+00A0 stavano per essere persi in
  `page.condizioni-di-acquisto.json`, intercettati prima della scrittura.
- **`page.contatti.json` non è la pagina Contatti**: non è usato da nessuna pagina. Il template
  vero è `page.contact.json`.
- **Agenti e file grandi**: i template arrivano a 26–36 KB e gli agenti con più di 2–3 file per
  volta si bloccano spesso. Un file per agente, con controllo preventivo della dimensione sulla
  destinazione per sapere se è già stato scritto.
