# Stato cakedesign.me — 29/7/2026

> ✅ **Numero definitivo `+39 02 8294 1380`: scritto il 29/7/2026 e PUBBLICATO** la sera
> stessa dall'utente. 54 occorrenze in 20 file (le 53 mappate + 1 che la mappa non aveva).
> Verificato: ogni file è tornato alla **size identica** alla baseline e le pagine italiane
> non contengono più nessuna forma del vecchio numero.
>
> ⚠️ **Il sito inglese `/en` mostra ancora il numero vecchio** e non si è sistemato
> pubblicando: vive nelle **traduzioni**, non nei file del tema. Vedi §Traduzioni inglesi.
>
> 🔧 **Pronto sul tema di lavoro `182627729731`, da pubblicare**: i pulsanti WhatsApp non
> aprono più una scheda nuova. Vedi §Pulsanti WhatsApp.

Documento da leggere **per primo** prima di toccare cakedesign.me. Mappa tecnica del tema e
insidie storiche: [TEMA_CAKEDESIGN.md](TEMA_CAKEDESIGN.md). Gemello per deluxy.it:
[STATO-DELUXY-IT.md](STATO-DELUXY-IT.md).

## Temi (verifica sempre, gli id cambiano a ogni pubblicazione)

| Ruolo | Nome | Id | Note |
|---|---|---|---|
| MAIN (live) | `live` | `182574317891` | **pubblicato la sera del 29/7/2026**: è il tema col numero nuovo |
| UNPUBLISHED (lavoro) | `Version to work on` | `182627729731` | nato con quella pubblicazione; **è qui che si lavora adesso** |
| UNPUBLISHED | `fino al 2907` | `182574350659` | il vecchio live, archiviato |
| UNPUBLISHED | `Version to work on (test Deivid)` | `182608265539` | copia del dev del 26/7, ferma a lunedì 27/7. **Ha ancora il numero vecchio**: non pubblicarla. Unica cosa sua che il live non ha: vedi §Tema di Deivid |

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

## Pulsanti WhatsApp: niente più scheda nuova (30/7/2026, sul tema di lavoro)

I punti di contatto WhatsApp erano **sei** e si comportavano in modo incoerente: tre aprivano
una scheda nuova (`target="_blank"`), tre no. Su telefono `wa.me` passa la mano all'app, quindi
con `_blank` restava aperta una **scheda vuota** del browser: è il fastidio che si notava.

Tolto `target="_blank"` dalle sole àncore WhatsApp in **3 file** (lasciando `tel:`, `mailto:`,
Koalendar e Trustpilot come stavano):

| File | Cosa | Verifica |
|---|---|---|
| `sections/bottom-help-bar.liquid` | pulsante verde `.bhb-btn` della barra in basso | 5420 → **5404** (−16 byte) |
| `sections/footer-group.json` | footer "Contattaci via Whatsapp", su ogni pagina | 7440 → **7422** (−18) |
| `templates/page.contact.json` | "Contattaci via Whatsapp" della pagina Contatti | 9586 → **9568** (−18) |

Il calo di size è esattamente il peso dell'attributo (18 e non 16 nei `.json` perché lì gli
apici sono escapati): conferma che non è stato toccato altro. Sweep su 10 pagine italiane:
**zero** àncore WhatsApp con scheda nuova, e numero di link per pagina invariato.

> Nel `.json` l'attributo pesa 18 byte, nel `.liquid` 16: è un buon controllo a costo zero
> quando si toglie un attributo da un template.

**Non coperto**: su `/en` il footer inglese apre ancora una scheda nuova (e col numero
vecchio), perché quel testo è una **traduzione**, non un file del tema — vedi sotto.

## Chat del sito: la «Live Chat» è Deluxy Customer Service (30/7/2026, sul tema di lavoro)

La voce **Live Chat** del pannello contatti portava a **`chatting.page`**, un servizio esterno:
il cliente usciva dal sito e la conversazione restava fuori dall'Inbox. Ora quel click apre il
widget di [Deluxy Customer Service](../../../../deluxy-messaging/HANDOFF.md), che arriva in
Inbox insieme a WhatsApp e Messenger.

Tutto sta in **un solo file**, `snippets/all_tags_and_script.liquid` (era vuoto dal 13/7, ed è
incluso nell'`<head>` di ogni pagina da `layout/theme.liquid`): il tag del widget con
`data-apri-da`, più tre righe che chiudono il pannello.

Tre scelte, tutte volute:

- **Il link non è stato toccato.** L'`href` resta l'impostazione `chat_url` della sezione
  `cart-information-popup`. Se il widget non si carica, il cliente finisce ancora su
  chatting.page: meglio una chat altrove che un click che non fa niente.
- **Il dirottamento è del widget**, via `data-apri-da`: ascolta il click sul documento e annulla
  il link da solo. Così non serve riscrivere `sections/cart-information-popup.liquid` (11 KB
  pieni di SVG — riscriverlo per intero per due righe è rischio inutile).
- **Il pannello contatti viene chiuso** (`#contact-slide-model.active` e
  `body.overflow-hidden-popup-open`) al click, altrimenti la chat si apre dietro una tendina che
  copre lo schermo. Questa parte il widget non può saperla: resta nel tema.

> ⚠️ **Il selettore giusto è `a[href*='chatting.page']`, e nient'altro.** Misurato sulla pagina:
> `a.dialogify` (l'esempio proposto dalla pagina «Widget dei siti» dell'app) colpisce **3 link**
> — Email e Whatsapp hanno la stessa classe, e finirebbero ad aprire la chat invece di scrivere
> o telefonare. `apri-chat` scritto senza punto è un **selettore di tag**: colpisce **0**
> elementi. L'`href` è l'unica cosa che distingue davvero la voce.

> ⚠️ Il widget vive dentro uno **shadow DOM**: da fuori non si apre in nessun altro modo che con
> la sua API. Per questo esiste `window.DeluxyChat` (`apri` · `chiudi` · `alterna` · `eAperta`)
> in `deluxy-messaging/public/widget.js`, insieme a `data-apri-da` e `data-bottone`. Il push su
> GitHub **non pubblica** quell'app: serve `npx vercel deploy --prod --yes`.

**`data-bottone="no"`: si entra solo dal menu.** Niente pastiglia flottante — in basso a destra
c'erano già la barra di aiuto e il consenso ai cookie, e due ingressi per la stessa chat erano
uno di troppo.

> ⚠️ **Difetto aperto che nasce da questa scelta.** In `deluxy-messaging/src/app/globals.css`
> la × dentro la chat (`.widget-chiudi`) è `display: none` e torna visibile **solo sotto i
> 480px**: il commento nel codice dà per scontato che sul desktop si chiuda con la pastiglia
> flottante. Tolta la pastiglia, **da desktop resta solo il tasto Esc**. Non è un vicolo cieco,
> ma non si scopre. Rimedio: mostrare `.widget-chiudi` anche sul desktop quando il bottone è
> disattivato (il widget dovrebbe passarlo all'iframe, es. `&chiudibile=1`).

Verificato sull'anteprima del tema di lavoro, col widget già in produzione: navigazione
annullata, URL invariato, pannello contatti chiuso, scroll sbloccato, chat aperta
(`DeluxyChat.eAperta()` → `true`), iframe 372×568 con `sito=cake`. La pagina della chat risponde
200 senza `X-Frame-Options` né CSP, quindi si può incorniciare su cakedesign.me.

> La dissolvenza d'apertura **non** si vede in un test automatico: il `requestAnimationFrame`
> doppio che aggiunge la classe `aperto` non scatta in una scheda in background, quindi
> `opacity` resta `0` mentre il pannello è già `display:block` a dimensione piena. Guardare le
> classi (`visibile`/`aperto`) e `document.hidden`, non `getComputedStyle`.

Da decidere: lo snippet usa `data-tema="minimale"`, mentre l'aspetto che l'app propone per
cakedesign è **`caldo`** (avorio e terracotta, pensato per le foto di pasticceria) — vedi
`deluxy-messaging/src/lib/widget-siti.ts`. Il bottone è terracotta in entrambi i casi, perché
`data-accento` vince sulla tavolozza; cambia solo l'interno della chat.

## 30/7/2026 — recapiti ripuliti ovunque

**Il vecchio numero era in 11 file del tema, non in 2**, e in punti che nessun pannello Shopify
espone: `snippets/product-template.liquid` (quello che si vede su **ogni** pagina prodotto),
`snippets/product-form.liquid`, `sections/main-cart.liquid`, più 8 template. In 4 file era
scritto **URL-encoded** (`%2B393498853209`), quindi una ricerca normale non lo trovava.
Scansione finale su tutti i file di testo del tema: **0 residui** di `3498853209` e di
`@deluxy.it`. Attenzione: i 7 asset oltre 256 KB tornano dall'API come **URL, non come testo** —
un grep sulla risposta GraphQL non guarda nulla, vanno scaricati a parte.

Trovato per strada: in `templates/customers/account.liquid` c'era **l'indirizzo personale**
`nicolo.donato@deluxy.it`, mostrato ai clienti registrati. Sostituito con `info@cakedesignme.it`.
Quello stesso file è pieno di segnaposto mai rimossi ("Lorem ipsum", un nome di fantasia, link
`href="#"`): è una pagina che i clienti loggati vedono, **da sistemare**.
Altro relitto: `templates/page.dolci_rientri.liquid` contiene JSON puro con estensione
`.liquid` — se usato stamperebbe il JSON grezzo a video.

**Etichette del carrello ora traducibili**: `MODIFICA`/`CONTATTACI`/`Modifica opzioni` non sono
più scritte nel codice ma in `locales/it.json` e `locales/en.default.json`, sotto
`cart.general.edit_button`, `cart.general.contact_us_button`, `cart.general.edit_options`.
Si cambiano da "Traduci e adatta" senza toccare il tema. Controllo che vale la pena rifare
sempre dopo un lavoro così: caricare la pagina e contare `translation missing` — se le chiavi
non combaciano, esce quella scritta invece del testo.

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

## Tema di Deivid (`182608265539`) — confronto col live, 30/7/2026

Confrontati **~299 file** (61 `.json` di contenuto compresi tutti i 53 template di pagina,
77 sezioni, 108 snippet, 3 layout, 12 traduzioni, 38 asset). Differenze **vere: due**.

1. **Il numero**: 20 file col vecchio `8295 2899`. Se quel tema viene pubblicato, rimette
   online il numero sbagliato ovunque, barra annunci compresa.
2. **`snippets/css-variables.liquid`** (6.429 byte nel live → 9.980 da Deivid): in fondo ha un
   blocco in più, `Product delivery EXTRA info (test Deivid)`, attivo **solo sulle pagine
   prodotto**. Dopo `.delivery-date-block` aggiunge "Pronta a partire da oggi/domani/N giorni"
   (letta dal metacampo `prodotto.consegna` della **variante selezionata**) e "Costo consegna
   10€", con traduzione EN. **Non è nel live**: se serve, va riportato sul tema di lavoro.

Differenze **solo apparenti**, da non inseguire:
- `templates/collection.json` e i 19 `.json` che ho riscritto: checksum e size diversi ma
  contenuto **identico** — è solo indentato invece che minificato (confrontato riga per riga).
- `assets/theme.css` e `assets/country-flags.css`: checksum diverso ma **stessa identica
  dimensione** e sorgenti `.css.liquid` identici → sono i compilati che Shopify rigenera per
  ogni tema, non modifiche di qualcuno.

## QA del 30/7/2026 — i difetti del carrello (nessuno ancora corretto)

Cinque percorsi cliente provati su desktop e mobile, in italiano e in inglese. I difetti sotto
sono **confermati e ancora aperti**: nessuno è stato toccato, vanno decisi.

### Costano soldi
1. **La data di consegna è UNA per tutto il carrello.** Verificato sulla struttura dati:
   `cart.attributes.Data_Consegna` è un singolo campo e le righe **non hanno alcuna data**.
   Quindi l'ultimo prodotto aggiunto detta la data a tutti, ignorando i tempi di preparazione
   degli altri: una torta da 7 giorni finisce consegnata in 4. Rimuovendo il prodotto veloce la
   data sbagliata **non** si ripristina. Non è una riga da aggiustare: manca il posto dove
   tenere una data per riga.
2. **Un click su "Acquista" del wizard aggiunge due torte** (due `POST /cart/add.js`): il
   bottone è `type="submit"` dentro il form e viene intercettato sia da `ProductForm` sia dallo
   script custom, che non fa `preventDefault()`. Intermittente: 4 volte su 7.
3. **Il prezzo del wizard non è quello addebitato**: il riepilogo mostra il totale con le
   opzioni, ma il sovrapprezzo viene applicato **solo aprendo `/cart`**.
4. **Il cliente può cancellarsi il sovrapprezzo**: la riga "Extra" su `/cart` ha quantità
   modificabile e "RIMUOVI". Portandola a 1 si paga 141 € invece di 260 €.
5. **Le opzioni obbligatorie non sono controllate** e il riepilogo mostra la prima opzione di
   ogni gruppo **come se fosse stata scelta**. In IT quei valori mai scelti finiscono in
   carrello; in EN base e farcitura spariscono del tutto.

### Rompono l'esperienza
6. In conflitto di date il checkout è disabilitato e **il modale d'avviso è `visibility:hidden`**:
   pulsante morto e nessuna spiegazione. L'unica uscita è cambiare data.
7. La colonna "Totale" della riga **ignora la quantità** (mostra 190 € e ne addebita 380).
8. Il campo quantità su `/cart` non funziona: la pagina si autoricarica e torna a 1. Nel
   cassetto funziona.
9. Bigliettino e fascia oraria **non si salvano** fino al click sul checkout; il bigliettino
   nasce con **22 spazi** dentro che si mangiano 22 dei 200 caratteri.
10. XSS nel riepilogo del wizard: la scritta personalizzata è iniettata come HTML e lo
    `<script>` viene eseguito. **Non** memorizzato: `/cart` codifica correttamente.
11. Note per il cake designer **mai raggiungibili** dal wizard; porzioni non selezionabili lì
    dentro; "Ricomincia" non azzera (la funzione `resetCakeSteps` esiste e non è mai chiamata).
12. Simbolo di valuta **`Є` cirillico** (U+0404) invece di `€`: `var currencyFormat = ' Є';`.
13. Su `/en`: etichette e valori in italiano nel carrello, date con giorni e mesi italiani,
    "today" seguito da una data che non è oggi.

### Chiuso, era un falso allarme
Il cassetto carrello **non** permette di saltare `/cart`: ha un solo pulsante e porta lì. Il
sovrapprezzo non si aggira per quella via.

### Verificato funzionante
Il calendario della scheda prodotto rispetta il metacampo `prodotto.consegna`, blocca quando la
data in memoria è troppo vicina, e le regole di taglio orario sono coerenti. Il problema nasce
**solo quando i prodotti in carrello diventano più di uno**.

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
