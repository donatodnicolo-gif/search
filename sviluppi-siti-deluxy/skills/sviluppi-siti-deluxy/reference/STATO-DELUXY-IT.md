# deluxy.it — stato del lavoro e problemi aperti (26/07/2026)

> Punto di ripresa per una sessione nuova. Prima di toccare qualsiasi cosa leggi anche
> [TEMA_DELUXY_IT.md](TEMA_DELUXY_IT.md) (mappa tecnica) e [REGOLE_BRAND.md](REGOLE_BRAND.md)
> (regole di consegna, fonte di verità del business).

## 1. Situazione dei temi

| ruolo | id | nome | note |
|---|---|---|---|
| MAIN (live) | `204460360010` | "live" | pubblicato dall'utente il 26/07 alle ~05:58 UTC |
| UNPUBLISHED (lavoro) | `204465930570` | "Version to work on" | **contiene 5 correzioni verificate, da pubblicare** |

**Gli id cambiano a ogni pubblicazione**: l'utente pubblica il tema di lavoro e ne crea uno nuovo.
Verifica sempre `theme { name role }` prima di scrivere. Il negozio è al **limite di 20 temi**:
`themeDuplicate` fallisce in silenzio (`newTheme: null`, nessun `userErrors`) finché non si
elimina un backup.

**Il connettore MCP Shopify blocca le scritture sul tema MAIN e la pubblicazione.** Si lavora sul
tema UNPUBLISHED; pubblica l'utente dall'admin.

## 2. Metodo che ha funzionato (usare questo)

- **Non riscrivere i file grossi.** `main-cart.liquid` 99 KB, `product-delivery-date.liquid` 55 KB,
  `product-template.liquid` 44 KB, `cart-popup-step1.liquid` 41 KB, `layout/theme.liquid` 24 KB:
  le API riscrivono solo file interi, e sbagliare in `theme.liquid` spegne tutto il sito.
  Le correzioni si concentrano in **`snippets/all_tags_and_script.liquid`** (~16 KB), renderizzato
  nell'head di ogni pagina, e in `snippets/delivery_date_hour_c.liquid` (~18 KB).
- Se la funzione difettosa è **globale**, si può **avvolgere** dal file di patch invece di toccare
  il file che la contiene (fatto per `handleSelectedPlace`, il fix del civico).
- **Verifica per confronto di rendering**: scarica la stessa pagina dal live e dall'anteprima ed
  esegui `diff` sul blocco interessato. Se il diff mostra solo le righe attese, il resto del file
  è identico byte per byte. Ha intercettato ogni errore di trascrizione.
- **Sintassi**: estrai il blocco `<script>` renderizzato e passalo a `node --check`.
- **Anteprima via curl: funziona.** `curl -sL -c jar -b jar "https://deluxy.it/?preview_theme_id=<id>&_ab=0&_fd=0&_sc=1"`
  e poi naviga con lo stesso cookie jar; conferma leggendo `"id":<theme_id>` nell'HTML.
  (La vecchia nota "in anonimo serve il live" è **sbagliata** e ha già depistato un agente.)

## 3. Trappole di misura (ci hanno già fatto perdere tempo)

- **Tab in background = transizioni CSS congelate.** Con `document.hidden === true` le transizioni
  non avanzano e `getComputedStyle` restituisce i valori iniziali **anche con `!important` inline**
  (le transizioni battono `!important` nella cascata). Ha fatto sembrare "invisibile" una modale
  perfettamente funzionante. Prima di dichiarare un bug di visibilità: controlla `document.hidden`
  e imposta `transition:none`.
- `offsetParent === null` è **normale** per `position: fixed`; `innerText` torna vuoto quando il
  rendering è sospeso.
- **Eventi jQuery ≠ eventi DOM**: il datepicker jQuery UI fa `input.trigger("change")`, che esegue
  gli handler jQuery e l'`onchange` inline ma **non** gli `addEventListener`. Se serve intercettare
  il cambio data, bind anche con `jQuery(el).on('change', …)`.
- Il sito risponde **429 con `Cf-Mitigated: challenge`** dopo poche richieste ravvicinate: non è un
  guasto. Ritmo consigliato per i test automatici: ~1 richiesta al secondo, e ripetere a freddo
  prima di segnalare un 4xx/5xx.
- `/cart` con carrello **vuoto** non renderizza il form di consegna: per testare servono articoli
  dentro (`POST /cart/add.js`).

## 4. Correzioni già pubblicate (25-26/07)

1. Messaggio in chiaro IT/EN al posto di `Translation missing: it.cart.general.greetings_next_day_available`
   (bloccava il checkout quando per oggi non restano fasce).
2. Indirizzo memorizzato scartato quando il cliente riscrive il campo senza scegliere un suggerimento.
3. Quantità della scheda prodotto rispettata (`addToCartProductOnDeliveryDate` invia sempre `quantity: 1`).
4. Quantità nel carrello che aggiorna davvero il totale (`/cart/change.js` con la chiave di riga).
5. Fascia oraria e bigliettino salvati nel carrello appena inseriti.
6. Rimossa la barra WhatsApp "Ordina Ora" (sezione `bottom-help-bar` del footer group).

## 5. Pronte sul tema di lavoro `204465930570`, da pubblicare

| Correzione | Verifica fatta |
|---|---|
| **Numero civico** non più perso (wrapper su `handleSelectedPlace`) | componenti in ordine Google → `Corso Buenos Aires, 33, Milano` |
| **Data anteriore ai tempi di preparazione** bloccata (confronto con `#last_prod_date`), date passate comprese | carrello con lead 7 gg: 29/07 bloccato con messaggio, 05/08 accettato con 14 fasce |
| **Fascia oraria ri-selezionata** nella tendina (il submit del form la cancellava) | attributo `14-15` → tendina su `14-15` |
| **Bigliettino** non cresce più di 20 spazi per salvataggio; nota già sporca ripulita una volta | 32 caratteri → `"Auguri Sofia"` |
| Bigliettino del **drawer** ora salvato; azzeramento fascia al cambio data con bind jQuery; barra in alto senza `null` | rendering + `node --check` |

## 6. Problemi aperti — codice del tema

| Problema | Grav. | Dove |
|---|---|---|
| Scheda prodotto legge `prodotto.consegna` del **prodotto** invece che della **variante**: promette date che il carrello rifiuta (fino a 4 giorni di scarto) | Critico | `product-delivery-date.liquid` |
| Redirect di lingua non esclude `/cart`, `/account`, `/checkouts` | Alto | `theme.liquid` (script `restoreLanguage`) |
| Pagine collezione: titolo, filtri e griglia **renderizzati due volte** → `#SortBy` della seconda barra inerte, 12 filtri con id duplicato, due `<h1>` | Alto | sezione collezione |
| Collezioni 1,6–2 MB di HTML senza paginazione, fino a 8,6 s a freddo; **500 intermittente osservato** su `/collections/pasticceria` | Alto | sezione collezione |
| Data del carrello **sovrascritta da `localStorage`** a ogni apertura di `/cart` (confermato a runtime) | Alto | `delivery_date_hour_c` + `main-cart` |
| Date in italiano su tutto il sito EN: il tema calcola `variantDate` in inglese ma renderizza `delivery_date_val` | Medio | più file |
| Datepicker con mesi/giorni italiani su `/en` | Medio | header/home/prodotto |
| `fnCheckDelivery()` legge `#DeliveryDate`, id inesistente → guardia sulla data morta | Medio | `main-cart.liquid` |
| `<label for="DeliveryDate">` punta al nulla (su mobile il tap non apre il calendario) | Medio | `delivery_date_hour_c` |
| `id="DeliveryDate_def"` duplicato: le logiche toccano solo il primo | Medio | carrello |
| `PredictiveWrapper`/`PredictiveResults` duplicati: la ricerca mobile non mostra risultati | Medio | `theme.liquid` |
| Tendina dei suggerimenti Google copre il bottone CONFERMA | Medio | modale consegna |
| Calendario non accessibile da tastiera/screen reader (42 `<td>` senza `role`/`tabindex`/`aria-label`) | Medio | modale consegna |
| Immagine da 1,39 MB senza `srcset`, con `width="x" height="x"` | Medio | home + prodotto |
| `/cart/clear.js` non azzera nota, data e fascia: restano sul carrello successivo | Medio | carrello |
| Privacy e Cookie policy senza link statico (solo widget iubenda) | Medio | footer |
| Link assoluti alla versione IT nel footer EN (blog, ancora FAQ) | Medio | footer |
| Nessun tetto alle quantità (999 pezzi anche su pezzi unici) | Medio | carrello |
| `<img src>` vuoto; soglie responsive incoerenti (992 vs 768, iPad verticale); microcopy inglese nel carrello IT | Basso | vari |
| Log di debug in produzione; pannello `pop-up-testing-dev` su 359 pagine; link rotto `/pages/Deluxy` | Basso | vari |
| Debito tecnico: Google Places API legacy, Maps senza `loading=async`, jQuery 2.1.4 | Basso | `theme.liquid` |

## 7. Problemi aperti — dati e contenuti Shopify (non codice)

| Problema | Grav. |
|---|---|
| **"Cerchio"** (vendor CakeDesignME, ACTIVE dal 6/7): variante residua "Default Title" a **€0,00** accanto alle taglie 75–180 € → ordinabile gratis | Critico |
| **PEC errata sul sito EN**: `deluxe@pec.net` invece di `deluxy@pec.net` (traduzione automatica del brand) | Critico |
| Condizioni legali (privacy, resi, ToS, spedizioni) **in italiano** sotto `/en`; refund policy con `[INSERIRE INDIRIZZO PER I RESI]` | Alto |
| `prodotto.consegna` **incoerente fra prodotto e varianti** (realistic-cat-cake 3 vs 7; elegant-cake 2 vs 1) | Alto |
| **Nessun prodotto può esaurirsi**: 0 varianti non disponibili su 3.784 | Medio |
| 29 collezioni pubbliche **vuote**, fra cui `ernst-knam` (destinazione di una landing ADV) | Medio |
| 25 pagine con sezioni "collezione in evidenza" vuote (tessere grigie, `href=""`) | Medio |
| `/pages/ask-the-artist`: 8 × `Liquid error … invalid url input` a video | Medio |
| `/pages/shipping`: testo segnaposto Shopify in inglese | Medio |
| Lead time mai dichiarato a parole su 43 prodotti con 2+ giorni di preavviso | Medio |
| Brand tradotto **"Deluxe"** nei title SEO e nei testi EN | Medio |
| Due numeri WhatsApp diversi nello stesso percorso (02 8295 2899 / 349 885 3209) | Basso |
| Filtri, `alt`, voci di menu non tradotti su EN; "Great" invece di "Large"; "byDeluxy" | Basso |
| 15 prodotti `copy-of-*` e pagine tecniche indicizzati in sitemap; handle con refusi | Basso |

## 8. Segnalazioni verificate e scartate

- **Modale del carrello "invisibile"** con prodotto non disponibile → artefatto del tab in
  background (§3). Il CSS `body.modal-open .custom-modal` funziona.
- **`/collections/oggi` 500** → non riproducibile (200 su 3 tentativi). Resta pesantissima.
- **Fasce fantasma `07:00-08:00`** → probabile falso positivo da analisi statica: `fnCheckDate`
  ricostruisce la tendina al caricamento.
- **429 diffusi** → protezione anti-bot Cloudflare attivata dai test stessi.

## 9. Come sono stati trovati

10 agenti QA in parallelo (26/07): 2 con browser (desktop IT, mobile EN), 8 via HTTP con cookie
jar isolato — pipeline del carrello, confronto live/anteprima, scansione di 362 pagine IT,
confronto IT/EN, tre user-agent mobili, prodotti con opzioni e lead time, casi limite del
carrello, percorsi di ingresso. **Il browser in-app e Chrome sono uno per sessione e condividono
i cookie**: più agenti che ci navigano insieme si sovrascrivono il carrello a vicenda e producono
falsi positivi. Con più agenti in parallelo, uno solo per browser e gli altri via curl.
