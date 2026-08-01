# Stato cakedesign.me — 31/7/2026

## 🧭 DA DOVE RIPRENDERE (31/7/2026, ore 08)

**Tema live: `182632546627`** (pubblicato dall'utente alle 07:54). **Non esiste un tema bozza**:
il connettore blocca ogni scrittura sul tema pubblicato, quindi per lavorare serve che l'utente
duplichi il live dall'admin. Gli id cambiano a ogni pubblicazione: **interrogare sempre
`themes(first:30)` prima di scrivere**, mai fidarsi degli id scritti qui.

### Gia' fatto e ONLINE
Numero e recapiti puliti ovunque · WhatsApp senza scheda nuova · etichette del carrello tradotte ·
`info@cakedesignme.it` ovunque (tolto anche l'indirizzo personale del titolare da
`templates/customers/account.liquid`) · **Live Chat che apre la chat Deluxy dentro il sito**, senza
pastiglia flottante · **doppia quantita' nel carrello CORRETTA**.

### I tre lavori aperti, in ordine di valore

**1. La data scelta nel wizard non arriva al carrello — CRITICO, non toccato.**
Scelto il 2 agosto, il carrello scrive `Data_Consegna = 2026-07-31`, violando anche il preavviso di
3 giorni del prodotto. Il cliente riceve la torta **nel giorno sbagliato** senza che nessuno se ne
accorga prima della consegna. E' il difetto piu' grave rimasto su questo sito.

**2. «Crea con AI» non restituisce nessuna immagine.**
`app.deluxy.it/api/open-ai/generate-image` risponde **500 a qualunque cosa** (auth OK: con chiave
sbagliata da 401). Il codice di quel backend **non sta in nessun repo**. Ipotesi da confermare:
DALL·E rimosso dall'API OpenAI il 12/05/2026 → serve cambiare modello **e** forma della risposta
(`gpt-image-1` restituisce `b64_json`, non `url`).

**3. La chiave `x-internal-key` e' in chiaro nell'HTML pubblico.**
Chiunque legge il sorgente puo' generare immagini a spese di Deluxy. **Va invalidata sul legacy**,
non solo tolta dalla pagina: le copie archiviate restano leggibili. Prova che e' fatto: il vecchio
valore deve rispondere **401**, non 500. Il progetto per spostarla dietro merchandising e' stato
**bocciato due volte** dalla revisione: vedi §«Secondo giro di piano» per i difetti da chiudere.

### Le tre trappole che costano piu' tempo su questo sito
- **`snippets/delivery-date.liquid` (78 KB) NON e' riscrivibile dall'API dei temi**: alla riga 1580
  ha la sequenza letterale backslash-u00a0, che in transito si trasforma sempre. Si modifica **a
  mano dall'editor di codice dell'admin**.
- **`themeFilesCopy` e' bloccato anche col live come sola SORGENTE**, e `themeFilesDelete` sempre.
  L'unico ripristino possibile e' ritrascrivere il file e verificare il `checksumMd5`.
- **La scheda in background falsa i test**: con `document.hidden` le transizioni non avanzano e
  `getComputedStyle` da' i valori iniziali. Guardare le **classi**, non l'opacita'.

---

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

## QA del 30/7/2026 (secondo giro, sul tema PUBBLICATO) — acquisto di una torta personalizzata

Percorso completo da cliente: scegliere una torta, personalizzarla col wizard, chiederla per
**domenica 2 agosto 2026**, dedica, fino alla soglia del pagamento (nessun ordine).

> ⚠️ **Quanto sotto viene da un agente e solo in parte è stato ricontrollato a mano.** Un
> difetto (N5, «il wizard non si apre su Dot Cake») si è rivelato **falso** alla riprova: era
> l'app delle opzioni non ancora caricata. Prima di aprire un intervento su una di queste voci,
> riprovarla di persona — soprattutto quelle senza una prova numerica allegata.

**Esito: si compra, a 210,00 € — ma solo correggendo la data a mano.** Celebration Pink 190 € +
20 € di frutta esotica, fascia 16-20, domenica confermata al checkout. La domenica **è**
consegnabile e il calendario del wizard propone correttamente il 2 agosto.

### Le due cose che fanno danno

1. **La data scelta non arriva al carrello.** Scelto il 2 agosto nel wizard, subito dopo
   «Acquista» `cart.attributes.Data_Consegna` vale **`2026-07-31`** — una data che viola
   perfino il preavviso di 3 giorni del prodotto stesso. La pagina carrello la ripete su ogni
   riga e dichiara *«La prima data di consegna disponibile è Ven Luglio 31, 2026»*, mentre il
   suo stesso datepicker ha `minDate` = 2 agosto. Chi si fida riceve la torta **venerdì invece
   che domenica**.
2. **Un click, due torte, ~2 volte su 3.** Confermato il doppio `POST /cart/add.js` (9 ms di
   distanza, 3 prove su 3), e in 2 casi su 3 il carrello è finito a quantità 2 → **380 €**. La
   causa ora è nota: **lo script del wizard gira due volte**, si vede dai log di debug stampati
   in doppio (`"AI Cake Add to Cart clicked"` ×2).

### Difetti nuovi

| # | Difetto | Gravità |
|---|---|---|
| N1 | La data del wizard non arriva al carrello (2/8 → `2026-07-31`) | **Critica** |
| N2 | Il carrello propone come prima data il 31/7, sotto il `minDate` del suo datepicker e sotto il preavviso del prodotto | **Critica** |
| N3 | Tornando su `/cart` la fascia oraria non è ripristinata e «COMPLETA IL TUO ACQUISTO» **resta muto** finché non la si riseleziona | Alta |
| ~~N5~~ | ~~Su Dot Cake «CREA LA TUA TORTA» non apre nessun wizard~~ — **FALSO, ritirato il 30/7**. Ricontrollato a mano su `/products/dot-cake`: `#ez-ds-option-widget`, `.all-wrpp-varit` e `#nextStep` esistono **già prima del click**, e `#ai_cake_button` non apre il pannello contatti. L'agente ha misurato mentre l'app delle opzioni non era ancora caricata e ha scambiato la lentezza per un'assenza. **Su quella app aspettare non basta: va aspettato l'elemento.** | — |
| N4 | I 22 spazi del bigliettino rientrano dopo il ricaricamento e finiscono nell'ordine | Media |
| N6 | Il sito riscrive `user_lang='en'` e rimanda su `/en` anche dopo averlo messo a `it` | Media |
| N7 | Al checkout «Subtotale · **21 articoli**» per una torta sola (l'Extra vale 20 unità) | Media |
| N8 | Abbassando la quantità l'Extra non si riduce (2→1 lascia Extra a 40 → 230 € invece di 210) | Media |
| N12 | Calendario prodotto: in vista Luglio l'unica cella cliccabile è il **31**, sotto `minDate`; l'1 agosto risulta selezionabile pur essendo sotto `minDate` | Media |
| N9 | **Log di debug in produzione**, tutti duplicati (`TESTING>> …`, `currentStep:`, `totalOptions:`) | Bassa |
| N10 | Testi non tradotti: il modale conflitto in inglese e il calendario del carrello con «August 2026» in pagina italiana | Bassa |
| N11 | Il link Live Chat conserva `href="https://chatting.page/…"`: se JS non intercetta si esce dal sito (scelta voluta come rete di sicurezza, ma va saputo) | Bassa |
| N13 | `localStorage.new_delivery_date_val = "undefined"` (stringa) e `variantDelDate` incoerente con la scelta | Bassa |

### Gli 11 difetti del primo giro, riverificati sul tema pubblicato

**Dieci su undici confermati**: doppio add-to-cart, sovrapprezzo solo su `/cart`, riga Extra
cancellabile dal cliente, opzioni obbligatorie non controllate (ho lasciato «Numero di piani»
vuoto e il riepilogo **e l'ordine** hanno scritto «1»), data unica di carrello, colonna Totale
che ignora la quantità (q.tà 2 → mostra 190 €), campo quantità che si autoricarica a 1,
bigliettino e fascia salvati solo al checkout con 22 spazi (178 caratteri utili su 200),
`Є` cirillico **U+0404** nel wizard (`var currencyFormat = ' Є'`), «Ricomincia» che non azzera.

**Uno non provabile**: il modale del conflitto date (`#custom-modal`, `visibility:hidden`) non
si è potuto innescare — **nessun prodotto del catalogo ha una finestra incompatibile** (preavviso
massimo 3 giorni, nessuna data massima), e forzando `Data_Consegna=2026-07-31` il carrello l'ha
**auto-corretta**. Il pulsante muto esiste comunque, ma per la causa N3.

### La chat verificata dal percorso cliente

Il link apre la chat **dentro il sito** (`#deluxy-chat`, iframe `…/widget?tema=minimale&sito=cake`,
`DeluxyChat.eAperta() === true`), non naviga su chatting.page, e si chiude. **Nessuna pastiglia
flottante**: `.avvio` è definito nel CSS ma l'elemento non viene creato.

## «Crea con AI» non restituisce nessuna torta (31/7/2026) — il guasto NON e' nel tema

Prodotto `/products/cake-ai-maker`. Alla fine del percorso il wizard dovrebbe mostrare
l'immagine generata dentro `.aicakeimg`: non arriva niente, e **non compare nessun messaggio**.

### Come funziona

Il tema fa una `POST` a **`https://app.deluxy.it/api/open-ai/generate-image`** (la piattaforma
legacy, **il cui codice non sta ne' in `scoutwt` ne' in `app`**) con header `x-internal-key` e
corpo `{prompt}`, e si aspetta `response.data[0].url` — la forma di risposta di DALL·E.
Nel codice c'e' ancora, commentato, un residuo `http://localhost:3000/open-ai/generate-image`.

### La diagnosi, misurata

| Chiamata | Esito |
|---|---|
| chiave `x-internal-key` **sbagliata** | **401** `{"message":"Invalid source"}` |
| **senza** chiave | **401** `{"message":"Invalid source"}` |
| chiave **vera**, prompt valido | **500** `{"message":"Internal server error"}` in ~650 ms |
| chiave vera, prompt **vuoto** | **500**, ~580 ms |
| chiave vera, **corpo vuoto** (nessun prompt) | **500**, ~1180 ms |

Cosa dicono questi numeri: **la rotta esiste e la chiave e' accettata** (altrimenti 401), quindi
il problema non e' l'autenticazione ne' il tema. E il 500 arriva **identico e in mezzo secondo
anche quando non c'e' nessun prompt**: se il guasto fosse dentro la generazione, una richiesta
senza prompt fallirebbe in modo diverso (validazione, 400) o piu' lentamente. Fallire subito e
sempre uguale indica che l'errore avviene **prima**, nell'inizializzazione del client OpenAI —
cioe' **chiave OpenAI mancante, scaduta o senza credito su `app.deluxy.it`**.

Il formato dell'errore (`{statusCode, message, error}`) e' quello predefinito di NestJS: la rotta
sta in un backend Nest, non nel tema Shopify.

### Due difetti del tema che restano nostri

1. ⚠️ **La chiave interna e' in chiaro nell'HTML pubblico della vetrina** (64 caratteri esadecimali,
   nell'header `x-internal-key` dentro uno script inline della scheda prodotto). Chiunque apra il
   sorgente della pagina puo' leggerla e generare immagini **a nostre spese**. Va spostata dietro
   un app proxy Shopify (`/apps/...`, che gira lato server) oppure ruotata e messa dietro un limite
   di frequenza. Finche' sta li', ruotarla e basta non risolve: tornerebbe pubblica al primo deploy.
2. **Il fallimento e' completamente muto.** Il ramo `.fail()` fa solo `console.error`: il loader
   sparisce, il bottone si riabilita e il cliente non vede **niente**. Per questo sembra rotto
   invece che «momentaneamente non disponibile». Un messaggio visibile e' l'unica cosa che si puo'
   correggere lato tema, e va messa in `snippets/all_tags_and_script.liquid` (agganciando l'XHR
   verso quell'endpoint), perche' il codice del wizard sta in `snippets/delivery-date.liquid`, che
   **non e' riscrivibile dall'API**.

### ⚠️ L'ipotesi piu' forte sul 500: il modello non esiste piu'

DALL·E 2 e 3 sarebbero stati **rimossi dall'API di OpenAI il 12/05/2026** (annuncio del
14/11/2025), sostituiti da `gpt-image-*`. Se `app.deluxy.it` chiama ancora `dall-e-3`, ogni
richiesta fallisce **a prescindere dalla chiave** — e spiega un 500 costante, veloce e identico
anche col corpo vuoto meglio di «chiave mancante».

> Questa data **non e' stata verificata direttamente**: viene da un agente e va confermata sulla
> console OpenAI prima di agire. Costa cinque minuti e cambia la diagnosi.

Seconda conseguenza, se confermata: `gpt-image-1` restituisce **`b64_json`**, non `url`. Il tema
legge `response.data[0].url`, quindi **anche sistemando la chiave l'immagine non arriverebbe**.
Chi ripara il legacy deve cambiare **modello e forma della risposta**, non solo la credenziale.

### Progetto per togliere la chiave dalla vetrina (31/7/2026) — NON ancora realizzato

Richiesta del proprietario: spostare la chiave su `deluxy-merchandising`. **Attenzione
all'equivoco da cui nasce**: far «comunicare la chiave a Shopify» non risolve niente — impostazioni
del tema, metafield e variabili Liquid finiscono tutti nel sorgente pubblico. L'unica forma che
funziona e' che **merchandising faccia la chiamata al posto del browser**.

**App Proxy Shopify: conviene, ma in fase 2.** Shopify **firma** le richieste che passano da
`/apps/…` (HMAC col client secret dell'app): e' l'unico modo, senza login del cliente, di provare
che la chiamata arriva dalla vetrina — un controllo su `Origin` non lo e', `curl` manda gli header
che vuole. E merchandising **ha gia' quel segreto** (`clientSecretCifrato` in `src/lib/negozi.ts`):
zero chiavi nuove. Costo: il negozio dev'essere collegato in modo *credenziali* e non *token*,
serve lo scope `write_app_proxy` (→ **reinstallazione dell'app**, la stessa che conia il token
degli import: farlo fuori orario), e prefisso e sottopercorso sono **immutabili** dopo
l'installazione. Fase 1: chiamata diretta a Vercel. Fase 2: cambia **una sola stringa** nel tema.

**La modifica al tema si fa dall'editor di codice dell'admin**, non dall'API: si salva quello che
si vede a schermo e il problema dei byte della riga 1580 non si pone.

> ⚠️ **Il piano NON e' pronto da scrivere.** Tre revisori adversariali hanno trovato difetti
> **certi** nella difesa principale: il tetto giornaliero conta solo i successi (chi fa fallire il
> salvataggio genera all'infinito) e la riga di registro si scrive 30-90 secondi **dopo** la
> generazione, quindi 200 richieste in volo leggono tutte lo stesso contatore e passano. Piu':
> tre percorsi che saltano il limitatore, il messaggio d'eccezione grezzo rimandato a un endpoint
> anonimo, il matcher del middleware che cancellerebbe `api/cron`, e un budget di tempo che non
> torna (90 s di timeout OpenAI + caricamento su Shopify Files > 120 s di `maxDuration`).

**Ordine di grandezza del rischio**: ~0,03-0,05 € a immagine. Uno script a una richiesta al secondo
fa ~150 €/ora; una notte non presidiata supera i **1.000 €**. E' questo numero che rende il tetto
non negoziabile — e che rende inaccettabile un tetto che non funziona.

**Prerequisito a tutto, e la prova che dice se e' fatto**: la chiave a 64 esadecimali va
**invalidata** su app.deluxy.it, non solo tolta dalla pagina — le copie archiviate restano
leggibili per sempre. Verifica: dopo la rotazione il vecchio valore deve rispondere **401**, non
500.

### ⚠️ Secondo giro di piano (31/7/2026): BOCCIATO. Le tre correzioni che cambiano il progetto

**1. L'App Proxy NON dimostra che la richiesta viene dalla vetrina.** E' l'errore su cui poggiava
tutto il progetto. `https://cakedesign.me/apps/…` e' un URL **pubblico** dello storefront, e finisce
in chiaro nel JS del tema: chiunque puo' fare `curl -X POST https://cakedesign.me/apps/…` ed e'
**Shopify** a calcolare la firma e inoltrarla. La firma prova che la richiesta e' **passata da
Shopify**, non che l'abbia fatta un cliente vero con un browser. Resta utile (niente CORS, il
percorso e' same-origin, si scarta il traffico che non passa dal negozio) ma **non e' un cancello**.

Conseguenza di progetto: **nessun controllo puo' provare la provenienza**. Il progetto giusto non e'
«tenerli fuori», e' **limitare il danno**: tetto rigido lato OpenAI, parametri di costo decisi dal
server, prenotazione prima della spesa, cache, moderazione, interruttore che funziona.

**2. Su OpenAI il tetto di spesa si imposta per PROGETTO, non per chiave.** Una chiave dedicata
coniata **dentro lo stesso progetto** condivide il budget di tutte le altre: la «seconda rete» non
esiste. La chiave della vetrina va creata in un **progetto OpenAI separato**, col suo limite.

**3. Il rimborso del posto sul timeout riapre la spesa illimitata.** Interrompere la nostra `fetch`
non annulla niente: OpenAI genera e **fattura comunque**. Restituire il posto prenotato in quel caso
significa pagare senza contare — e i modelli immagine superano spesso i 38 s.

### Gli altri difetti certi, da chiudere prima di scrivere una riga

- **L'interruttore d'emergenza fa l'opposto**: `tetto()` accetta il valore solo se `> 0`, quindi
  mettere il tetto a `0` per fermare l'emorragia **riapplica la riserva di 120**.
- **Un refuso in `OPENAI_IMAGE_MODEL` brucia il tetto in pochi secondi**: OpenAI risponde 400 anche
  per modello inesistente, e sul 400 il piano non rimborsa.
- **Il codice per il tema ha un errore di sintassi JavaScript** (`'piu' del previsto'`: l'apostrofo
  chiude la stringa). Andrebbe in `snippets/delivery-date.liquid`, dove vive **tutto il wizard**: un
  `SyntaxError` aborte l'intero blocco `<script>` e spegne la personalizzazione, non solo l'AI.
- **La rotta di lettura dell'immagine e' del tutto aperta**: nessun freno, `force-dynamic`, fino a
  8 MB letti dal **Postgres condiviso con altre sei app**, e l'id circola dentro gli ordini.
- **Il freno per IP misura l'IP sbagliato**: dietro il proxy la connessione arriva dal server di
  Shopify. O si limita tutto il negozio insieme, o il freno non c'e'.
- **Nessun `try/catch` in cima**: la prima I/O che sbatte diventa un 500 grezzo di Next, e il tema
  cerca `xhr.responseJSON.errore` che non esiste.
- **Il codice non compila** (`Record<string, unknown>` passato a `data` di Prisma, `@@index` su un
  campo inesistente) e la migrazione userebbe `db push` **sul cluster di produzione condiviso**,
  senza storia e senza possibilita' di tornare indietro.
- **Collisione di nomi**: in merchandising `Vetrina` significa gia' un'altra cosa (visual
  merchandising, `model Vetrina`, `/visual`).
- **I costi sono sbagliati di circa 4 volte**: 0,03-0,05 € e' il listino DALL·E 3, non di
  `gpt-image-1`, il cui prezzo dipende dalla qualita' — che il piano sceglie di non mandare.

### Cosa fare, in ordine

1. Su **`app.deluxy.it`**: verificare la variabile d'ambiente con la chiave OpenAI e il credito
   residuo dell'account. E' li' che si risolve: nessuna modifica al tema fa tornare le immagini.
2. Far propagare l'errore vero invece di un 500 generico, altrimenti la prossima volta si ricomincia
   da capo con la stessa diagnosi.
3. Togliere la chiave interna dalla vetrina.
4. Rimuovere il residuo `localhost:3000`.

## Doppia quantita' nel carrello: CORRETTO il 31/7/2026 (tema bozza `182632415555`)

**La causa non era jQuery.** Il bottone «Acquista» del wizard (`#add-to-cart-new-cake-ai`) e' un
`<button type="submit">` dentro il `<form action="/cart/add">`. Il gestore del wizard fa il suo
`$.ajax` e **non chiama mai `preventDefault()`**, quindi dopo di lui parte l'attivazione nativa
del submit, che il tema trasforma in una **seconda** aggiunta (`ProductForm.addItemFromForm` in
`assets/theme.js`). Due meccanismi diversi, non due jQuery: misurato su 9 click, sempre 2 POST —
una da `XMLHttpRequest`, una da `fetch` — e **una sola** riga di log del wizard.

Descrizione corretta del difetto: non e' «a volte parte due volte», e' **«parte sempre due volte
e a volte Shopify ne perde una»**, perche' le due scritture corrono in parallelo sullo stesso
carrello (5 volte su 7 finiva a quantita' 2, 2 volte su 7 a 1, con entrambe le risposte 200).

### Dove sta la correzione, e perche' non dove ci si aspetta

Andrebbe dentro quel gestore, in `snippets/delivery-date.liquid`. Ma **quel file non e'
riscrivibile dall'API** (vedi la lezione 2 qui sotto). Si ottiene lo stesso risultato da fuori:
un ascoltatore in **fase di cattura** su `document` che annulla l'azione predefinita del click.
Annullato il default, il submit nativo non parte; il gestore del wizard continua a girare, perche'
`preventDefault` **non** ferma la propagazione.

Sta in `snippets/all_tags_and_script.liquid` (nell'`<head>` di ogni pagina):

```js
document.addEventListener('click', function (ev) {
  var bottone = ev.target && ev.target.closest ? ev.target.closest('#add-to-cart-new-cake-ai') : null;
  if (!bottone) return;
  ev.preventDefault();
}, true);
```

Il guard `$btn.off('click')` che sta dentro il wizard, con scritto sopra «Prevent multiple
clicks», **non c'entra**: stacca i gestori diretti dal bottone, non la delega su `document`.

### ⚠️ La regressione che ne e' nata, e come si chiude

Annullando il submit si e' annullato anche **cio' che apriva il cassetto laterale del
carrello**: era il percorso del tema a farlo. Risultato: la torta finiva in carrello ma non
si vedeva succedere niente, e il click sembrava non funzionare. Segnalato dall'utente
provando il sito.

Il cassetto va riaperto da noi, agganciandosi alla **fine della chiamata vera** (evento
`loadend` sull'XHR di `/cart/add.js`) e non a un ritardo a caso. Servono **due** azioni, e
una sola non basta — misurato:

| Azione | Effetto |
|---|---|
| click su `.js-drawer-open-cart` | il cassetto si apre ma resta **`is-empty`**, «Totale €0,00», anche col carrello pieno lato server |
| `document.dispatchEvent(new CustomEvent('cart:build'))` | il contenuto si ricostruisce, ma senza aprire |
| **le due insieme** | cassetto aperto **e** pieno |

### Verifica

| Prova | POST `/cart/add.js` | Carrello |
|---|---|---|
| 5 click consecutivi | **1** ogni volta (0 `fetch`) | 1 articolo, 190 € |
| primo click dopo un caricamento pulito | **1** | 1 articolo, 190 €, properties conservate |
| **percorso completo con sovrapprezzo** (pink-flower-cake, pan di spagna cacao + chantilly + **frutta esotica +20**) | **1** | riepilogo 115,00 € → cassetto **aperto e pieno** con le opzioni → `/cart` **115,00 €** (95 + Extra 20×1) |

Le properties arrivano tutte: `Base`, `Forma`, `Farcitura`, `Ingredienti: FRUTTA ESOTICA
(+20,00 €)`, piu' `__additional_price_total: 20` che e' il valore su cui `/cart` costruisce
la riga «Extra».

Un giro indipendente su **22 configurazioni** (3 prodotti da 90/190/240 €, tutte le opzioni a
pagamento: ingredienti da 10 e 20 €, piani da 50 a 200 €) ha dato **1 sola POST e il totale
esatto in tutti i casi**. Nessuna opzione perde il sovrapprezzo.

Lo stack conferma la struttura: `HTMLDocument.dispatch` in **jquery-2.1.4.js** (il gestore e'
registrato li') che chiama `w.ajax` della **3.3.1** (il `$` globale a quel momento).

> ⚠️ **Una lettura anomala.** La primissima misura, prima di un ricaricamento pulito, dava ancora
> 2 chiamate (entrambe XHR). Non si e' piu' ripresentata in 6 prove successive, compresa quella
> sul primo click dopo il caricamento. Se ricompare, e' un terzo percorso di aggiunta e va cercato
> con la cattura degli stack, non con il conteggio.

> ⚠️ **Cosa resta da provare**: il percorso completo del wizard **con un'opzione a sovrapprezzo
> selezionata**. Le prove qui sopra cliccano il bottone senza passare dai passi delle opzioni,
> quindi la riga «Extra» non era in gioco. Il sovrapprezzo viene aggiunto **aprendo `/cart`**, non
> dalla scheda prodotto, quindi in teoria non e' toccato — ma va confermato prima di pubblicare.

## Doppio jQuery: tentativo FALLITO del 30/7/2026, e le tre lezioni

Obiettivo: una sola jQuery e un solo Semantic. **Tentativo annullato, tutto ripristinato.** Il
live non e' mai stato toccato (il connettore blocca le scritture sul tema pubblicato).

### Com'e' fatto il doppio caricamento (questa parte resta valida)

| File | Cosa | Dove |
|---|---|---|
| `sections/header.liquid` 331/333/334 | jQuery **2.1.4** + Semantic JS + CSS, **sincroni** | ogni pagina |
| `sections/main-product.liquid` riga 1 | jQuery **3.3.1** da googleapis, **defer** | schede prodotto |
| `snippets/delivery-date.liquid` 162/163 | Semantic JS + CSS, **defer**, dentro il `<form>` | schede prodotto |
| `sections/home-delivery-section.liquid` 109/110/111 | jQuery 2.1.4 + Semantic + CSS **di nuovo** | home e 12 landing |
| `country-ak.liquid` + `multi-selectors.liquid` | flag-icon da cdnjs | 3 copie |

La regola che spiega tutto: il codice inline eseguito **durante il parsing** si lega alla 2.1.4
sincrona; quello dentro `ready()` risolve `$` a DOMContentLoaded, quando la 3.3.1 differita l'ha
gia' sostituita in `window`. Per questo i calendari stanno sulla 3.3.1 e il gestore del carrello
del wizard sulla 2.1.4, irraggiungibile. Sulla pagina `/cart` la 3.3.1 **non arriva affatto**.

### ⚠️ Lezione 1: l'app delle opzioni PRETENDE jQuery 3

Ho unificato sulla **2.1.4** (ragionamento: e' quella su cui gira gia' il carrello, i 343 KB di
BSS e i 122 KB di easy-options) togliendo la 3.3.1 differita dalla scheda prodotto. **Sbagliato:
sono spariti tutti i sovrapprezzi del wizard.** Su `/products/diana`, scegliendo «frutta esotica»,
il `+ €20` non veniva piu' aggiunto. Se ne e' accorto l'utente provando il sito, non i miei
controlli, che guardavano il conteggio degli script e non il prezzo.

Motivo: `easy-options` gira **dopo** il caricamento, quindi oggi vive sulla 3.3.1. Spostarlo sulla
2.1.4 lo rompe. **L'unificazione va fatta sulla 3.3.1**, che era la scelta del piano originale.
Il che comporta la parte scomoda: la jQuery unica dev'essere **sincrona e in `<head>`**, perche'
il codice inline che gira durante il parsing la trovi gia' pronta.

Resta da provare **prima** del prossimo tentativo, isolatamente: il carrello oggi gira su 2.1.4 e
usa **jQuery UI 1.9.2** (2012), che supporta ufficialmente jQuery 3 solo dalla 1.12. Spostarlo
sulla 3.3.1 puo' rompere il datepicker della data di consegna.

### ⚠️ Lezione 2: `snippets/delivery-date.liquid` NON si puo' riscrivere da qui

Alla riga 1580 il file contiene, dentro una stringa JavaScript, la **sequenza letterale di sei
caratteri** ` ` (backslash, u, 0, 0, a, 0):

```js
if (inputField.value.replace(/ /g, ' ').trim() !== '') {
```

Quella sequenza **non e' trasmissibile** attraverso l'API dei file del tema da questo ambiente:
inviata con un backslash diventa il carattere NBSP vero (−4 byte), inviata con due backslash
arriva come due backslash (+1 byte, e la regex cerca un backslash letterale invece dello spazio
unificatore). Misurato con un file di prova: ` ` produce un file di **2 byte**, cioe' il
carattere. Le due forme cadono ai lati opposti del bersaglio e la via di mezzo non e' esprimibile.

**Conseguenza pratica: quel file va modificato a mano dall'editor di codice del tema.** Vale per
qualunque intervento futuro sul selettore della data della scheda prodotto.

### ⚠️ Lezione 3: cosa il connettore blocca davvero

- `themeFilesCopy` e' bloccato **anche quando il tema live e' solo la SORGENTE**, non solo quando
  e' la destinazione: non si puo' far copiare un file dal live alla bozza lato server.
- `themeFilesDelete` e' bloccato **sempre**, anche su un tema bozza: i file creati per sbaglio si
  cancellano solo dall'admin.
- Quindi **l'unico modo di riportare un file allo stato del live e' ritrascriverlo per intero**,
  con tutti i rischi del caso. Il `checksumMd5` restituito dall'upsert e' la prova: se combacia
  con quello del live, il ripristino e' byte per byte.

### Stato in cui e' rimasta la bozza `182629630275`

| File | Stato |
|---|---|
| `sections/main-product.liquid` | ripristinato **byte per byte** (`ee68fc822d4b1169db28fbaee16c7808`) |
| `sections/home-delivery-section.liquid` | ripristinato **byte per byte** (`64edd1c1c4b81c020ada66de3b5959cd`) |
| `snippets/delivery-date.liquid` | **1 byte di troppo** alla riga 1580 (doppio backslash): da correggere a mano |
| `snippets/prova-escape-nbsp.liquid` | file di prova inerte, da cancellare dall'admin |

Conviene **cancellare la bozza e riduplicare il live**: risolve entrambi i residui in un colpo e
da' una base pulita al prossimo tentativo.

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
