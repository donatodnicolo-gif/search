# Stato cakedesign.me — 29/7/2026

> ✅ **Numero definitivo `+39 02 8294 1380` scritto sul tema di sviluppo `182574317891`
> il 29/7/2026.** 54 occorrenze in 20 file (le 53 mappate + 1 che la mappa non aveva).
> Verificato: ogni file è tornato alla **size identica** alla baseline e le pagine italiane
> in anteprima non contengono più nessuna forma del vecchio numero. Resta da **pubblicare**.
>
> ⚠️ **Il sito inglese `/en` mostra ancora il numero vecchio** e non si sistema pubblicando:
> vive nelle **traduzioni**, non nei file del tema. Vedi §Traduzioni inglesi.

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

### 1. Numero WhatsApp/telefono — FATTO il 29/7/2026
Storia: il live ha `+39 02 9475 1221`; il 26/7 sul tema di sviluppo era stato messo
`+39 02 8295 2899`; il **29/7 il numero definitivo è diventato `+39 02 8294 1380`**
(WhatsApp e assistenza) ed è stato scritto sul tema `182574317891`. Siccome il tema non è
mai stato pubblicato, `8295 2899` non è mai andato online sulle pagine italiane.

Forme sostituite: compatta `390282952899` → `390282941380` (usata da `wa.me/`, `wa.me/+`,
`api.whatsapp.com/send?phone=`, `tel:+`) e spaziata `02 8295 2899` → `02 8294 1380`
(usata da `tel:+39 02 …` e dal numero scritto a video). Mappa in
[TEMA_CAKEDESIGN.md](TEMA_CAKEDESIGN.md) §Numero di telefono.

**Come è stata verificata** (metodo riusabile): la sostituzione **non cambia la lunghezza**
(8→8 e 9→9 caratteri), quindi dopo ogni scrittura la `size` del file deve tornare
**identica** alla baseline. Tutte tornate identiche. In più, sweep sulle pagine renderizzate
in anteprima del tema di sviluppo: home, contatti, cakedesign, condizioni, come-funziona,
matrimonio, torte-a-domicilio, collezione, chi-siamo → **zero** occorrenze del vecchio numero.

> Il numero `+39 02 8295 2899` compare anche su **deluxy.it** (vedi
> [STATO-DELUXY-IT.md](STATO-DELUXY-IT.md) §7). L'utente ha chiesto il numero nuovo **solo per
> cakedesign.me**: non migrare deluxy.it senza chiederglielo.

### 1-bis. La mappa dei 19 file era incompleta: mancavano i `.context.<mercato>.json`
La **20ª occorrenza** stava in `sections/header-group.context.it.json`: è l'override del
**mercato Italia** che alimenta la **barra annunci in cima a ogni pagina** ("TORTE PER I TUOI
EVENTI / CONTATTACI" → link WhatsApp). Non essendo un `templates/*.json` né il footer, era
sfuggita alla mappa e sarebbe finita online col numero vecchio su *tutte* le pagine.
**Regola nuova: cercare sempre anche `*.context.*.json`** (qui esistono
`sections/header-group.context.it.json`, `sections/popup-group.context.it.json`,
`templates/page.torte_a_domicilio.context.it.json` — solo il primo aveva il numero).
Trappola collegata: la `size` di questi file era la forma **minificata** salvata dall'editor
(359 byte), quindi dopo l'upsert indentato è diventata 919 — qui l'invariante della size
**non vale**, va verificato il contenuto.

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
   Il tema è pronto: tutte le occorrenze portano `8294 1380`.
2. **Privacy policy**: contiene ancora `+39 02 9475 1221`; va portata a `+39 02 8294 1380`.
   Le policy non stanno nel tema, valgono per tutti i canali e la modifica è immediata sul
   live. `Impostazioni → Policy`.
2-bis. **Traduzioni inglesi** (vedi §Traduzioni inglesi): il footer EN e la pagina EN delle
   condizioni hanno numeri vecchi. **Non si sistemano pubblicando il tema.**
3. **Banner cookie doppio**: convivono iubenda (app embed `cmp-insert-code`) e il banner nativo
   Shopify. Si tiene iubenda e si rimuove il nativo da `Impostazioni → Privacy dei clienti`.
   **Mai disattivarli entrambi.** Identico al caso già risolto su deluxy.it.

## Traduzioni inglesi: un secondo posto dove vive il numero (scoperto 29/7/2026)

Il numero **non sta solo nei file del tema**: le versioni inglesi delle stesse sezioni sono
**risorse di traduzione** di Shopify, agganciate al **tema MAIN** (`theme_id=182574350659`),
non al tema di sviluppo. Quindi **pubblicare il tema non le tocca** e, siccome puntano al
MAIN, modificarle cambia il **sito live all'istante**.

Stato al 29/7/2026 su `/en` (misurato pagina per pagina, sempre le stesse occorrenze):

| Dove | Risorsa | Numero che mostra |
|---|---|---|
| Footer EN "CUSTOMER SERVICE" (ogni pagina `/en`) | `ONLINE_STORE_THEME_SECTION_GROUP` → `footer-group` chiave `footer.1366a667-….text` | `+39 02 8295 2899` ×4 |
| `/en/pages/condizioni-generali-di-acquisto` | traduzione del template | `+39 02 9475 1221` ×3 |

Da notare: il footer inglese mostra **già oggi, in produzione**, `8295 2899` — un numero che
non è mai stato pubblicato in italiano. Non è stato toccato in questa sessione perché
l'utente aveva chiesto esplicitamente di **non toccare il MAIN**. Si aggiornano da
`Impostazioni → Lingue → Traduci e adatta` (o via `translationsRegister`), e vanno rifatte
**dopo** la pubblicazione, perché al cambio del testo sorgente Shopify marca la traduzione
come non aggiornata.

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
