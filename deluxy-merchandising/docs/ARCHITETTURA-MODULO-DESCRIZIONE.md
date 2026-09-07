# Architettura del modulo prodotto: come i quattro negozi scrivono la scheda, e come deve nascere qui

Scritto il 07/09/2026 su richiesta dell'utente («analizza come Shopify fa la
descrizione dei prodotti per tutti i siti e crea l'architettura del form
sottostante per noi al momento della creazione di un prodotto»). Fonte: due
analisi indipendenti sui quattro negozi, fatte da due agenti su un campione
estratto con `scripts/campione-descrizioni.ts` (210 prodotti attivi: Gifts 53
su 800, Business Deluxy 55 su 346, Flowers 45 su 269, Cake 57 su 321; tutte le
definizioni dei metafield; 6-8 pagine pubbliche per sito scaricate e lette).
I rapporti completi, con numeri e handle:
[analisi-gifts-business.md](campione-descrizioni/analisi-gifts-business.md) e
[analisi-flowers-cake.md](campione-descrizioni/analisi-flowers-cake.md).
Quello che i due agenti **non** sono riusciti ad accertare sta in fondo, e
non è stato dedotto.

> **Un chiarimento prima di tutto (utente, 07/09):** il campo che il modulo
> chiamava «Tipologia di vendita» (unico / a quantità / mix / a preventivo)
> **non è una tipologia di vendita del negozio: è una classificazione interna
> dell'app**, quella che la piattaforma consegne legge per scegliere il
> fornitore e fare il prezzo. Non va su Shopify e non c'entra con la
> descrizione. Nel modulo ora si chiama **«Classificazione interna»**; il campo
> nel database e nell'API resta `tipologiaVendita` perché la piattaforma lo
> legge già da lì.

## 1. Cosa fanno davvero i negozi (le cose che contano)

Tutti e quattro i negozi usano **lo stesso tema** (Impulse 7.2.0 personalizzato)
e **la stessa grammatica** di scheda, anche se nessuno l'ha mai scritta:

1. **La descrizione apre con un elenco di tre righe** `<ul><li><b>Etichetta</b>: valore</li>…</ul>`:
   riga 1 = **famiglia + sottotitolo** («**Torta**: sacher», «**Bouquet**: girasoli»),
   riga 2 = **inclusi / personalizzazione** («biglietto scritto a mano e confezione regalo», «Personalizzabile: da 3 giorni»),
   riga 3 = **consegna** («in guanti bianchi, a casa o dove vuoi tu», «dove vuoi tu nel mondo», «in ufficio o dove vuoi tu»).
   Lo fanno 47/53 Gifts, 48/55 Business, 44/45 Flowers, 55/57 Cake. **Il tema
   estrae questo primo elenco** e lo mostra accanto ai bottoni di acquisto, e lo
   usa come meta description quando `seo.description` manca (quasi sempre).
2. **Seguono sezioni con titolo `<h6>`** nel flusso della descrizione (non tab
   del tema): il tema mostra tutta la descrizione in un blocco a scomparsa. I
   titoli sono testo libero, e per questo esistono in tre forme
   (DESCRIZIONE / Descrizione / Dettagli Prodotto).
3. **I blocchi dipendono dalla famiglia**, non dal negozio: torte = Ingredienti
   + Allergeni (+ Pesi e Misure + Conservazione su Cake); fiori = Come Funziona
   + Significato + Dimensioni (taglia → numero di fiori); vini = Dettagli
   Prodotto con cinque voci fisse (Denominazione, Varietà, Regione, Gradazione,
   Temperatura); oggetti = Dettagli chiave/valore; servizi = Come Funziona;
   catering B2B = Menù + Allergeni + Personalizzazione + Occasioni.
   Chiusura: «Regala con Deluxy» / «Perfetto per» + «Ideale per:» + lista occasioni.
4. **HTML povero, e va bene così**: solo `ul/li`, `h6`, `p`, `b` (+ `i` per le
   note). Zero tabelle, zero immagini nel testo. Lunghezza mediana 158-291 parole.
5. **Molto è boilerplate identico** ripetuto a mano: «Inclusi: biglietto scritto a
   mano e confezione regalo» (43/45 Flowers), il blocco «Come Funziona» dei fiori
   (4-5 punti Valet, identico in 26/45), la tabella «Pesi e Misure» di Cake (11
   righe identiche in 51/57 **anche quando le varianti sono 9**), le tre righe
   di «Conservazione», le note foto e allergeni.
6. **La consegna vive nei metafield, non nel testo**: `prodotto.consegna`
   (giorni minimi 0-5), `custom.minimo_orario`, `custom.orario_consegna`,
   `custom.data` (Oggi/Domani/Su prenotazione), `custom.nations_availability`
   (province nel formato esatto `ITALY-MILAN(MI) ITALY-ROMA(RM)…`: il tema
   estrae le sigle fra parentesi), più i campi del partner `custom.partner_id`,
   `custom.partner_address`, `custom.is_unique`, `custom.not_physical`. Su
   **Business e Cake questi campi non hanno definizione** nel negozio: il tema
   li legge lo stesso, l'admin non li valida.
7. **Le chiavi cambiano da negozio a negozio per la stessa cosa**: best seller
   = `custom.best_value` (Flowers) / `custom.best_seller` (Cake, Gifts);
   province = `custom._nations_availability` (Flowers, con underscore, definito)
   / `custom.nations_availability` (gli altri); `custom.data` è una **lista**
   su Flowers e una **stringa** su Cake («72 ore»). Serve una **mappa delle
   chiavi per negozio** in un posto solo.
8. **Opzioni e prezzi seguono la famiglia**: Flowers = taglie nominali
   (S/M/L/XL, Medio/Medio-Grande/Grande/Luxury, Maxi/Dream/Mega Dream) con
   prezzi a scaglioni fissi per famiglia (bouquet 85/135/250/450, cappelliere
   150/300/600/900) e una seconda opzione facoltativa (Vaso +50, Polaroid,
   Colore rose, Champagne +80); Cake = una sola opzione **Porzioni**
   (6…100, mediana 10 varianti) con prezzo = porzioni × €/porzione fisso per
   fascia; Business = **Numero di persone** (5…100) a prezzo lineare; Gifts =
   Dimensione / Porzioni / Colore / Formato (mediana 2 varianti). `compareAtPrice`
   **mai usato** (0 su 1.214 varianti). SKU sempre presenti, generati
   (`XXXXXX-n` o `XXXXXX{porzioni}`); su Cake l'app EasyOptions aggancia i
   sovrapprezzi **per SKU**: lo SKU è obbligatorio e unico.
9. **Tag**: Gifts/Flowers duplicano occasione, colore, fiore e famiglia con
   vocabolari incoerenti («Fiori Mix / Mix Fiori / Fiori Misti», «Pink» per
   Rosa, «Compleanno / Compleanni») più tag di campagna fossili; Cake usa i tag
   per destinatario, occasione, tema, dieta e **flusso editoriale** («Approvato»
   41/57, «novità», «cakedesign»).
10. **SEO praticamente assente** (`seo.title` 2-5 prodotti per negozio,
    `seo.description` 0-6), alt delle immagini vuoti nel 67-87% dei casi,
    mediana 1-2 immagini per prodotto.
11. **Dalla pagina viva**: badge Best Seller (metafield), riga «Creato
    dall'Artista: {vendor}» (da `custom.da_chi_fatto` + `vendor`), calendario
    con **giorni minimi per variante** letti da un metafield **di variante** che
    il campione non contiene (chiave non accertata), popup «Guida alle Misure»
    (Flowers: `custom.guida_misure=SI` + `custom.url_img_dimensione`), su Cake
    il configuratore EasyOptions con gli stessi passi su ogni torta e il campo
    obbligatorio (`custom.campo_obbligatorio`). Business non ha listini,
    quantità minime né IVA in pagina: `custom.minima_quantita` e
    `multipli_quantita` sono definiti ma **0/55 usati e non letti dal tema**.

**La conclusione che regge tutto**: la scheda di un prodotto Deluxy non è un
testo libero, è **un documento strutturato con una grammatica fissa** che oggi
viene ricopiata a mano, con tutte le incoerenze del ricopiare a mano. Il
modulo giusto **non chiede una descrizione: chiede i dati e la genera**.

## 2. Che cosa non va nel modulo di oggi

Il modulo attuale (`FormProdottoNuovo`) manda a Shopify `descriptionHtml` =
testo del campo «Descrizione» con `<br>` al posto degli a capo, `productType`
vuoto, `vendor` vuoto, SEO solo se compilato, tag scritti a mano, metafield
compilati uno per uno dalle definizioni del negozio. Rispetto ai negozi:

- non produce l'elenco di tre righe né i titoli `h6`: **la pagina esce senza
  riepilogo nel buy box e senza meta description**;
- non mette il tipo prodotto né il vendor: **niente riga «Creato dall'Artista»,
  niente collezioni automatiche per tipo**;
- lascia che consegna, occasioni e partner vengano scritti due volte (testo e
  metafield) da chi compila, cioè **riproduce la divergenza** che i negozi hanno
  già (Cake: «da 7 giorni» nel testo contro `consegna=3`; Flowers: la lista
  «Ideale per» non coincide mai con `custom.occasione`);
- non conosce le famiglie: non sa che una torta ha Ingredienti e Allergeni e
  un bouquet ha Significato e Dimensioni.

## 3. L'architettura del modulo

### 3.1 Il principio: campi strutturati → un generatore → la scheda

```
  compilazione                 motore (src/lib/scheda/)                    Shopify
  ────────────                 ────────────────────────                    ───────
  famiglia ─────────┐
  titolo, sottotitolo│         template di famiglia   ──► descriptionHtml (ul + h6)
  racconto           ├──►      + mappa chiavi/negozio ──► metafields (chiavi giuste per QUEL negozio)
  blocchi famiglia   │         + vocabolario tag      ──► tags
  consegna/province  │         + regole prezzi        ──► options + variants (SKU, prezzi)
  occasioni          │         + formule SEO          ──► seo.title / seo.description / alt
  opzioni e prezzi ──┘                                    productType, vendor
```

Una funzione sola, `componiScheda(negozio, famiglia, campi)`, restituisce
**tutto** quello che va sul negozio; il salvataggio la chiama per ogni negozio
scelto (il modulo dal 07/09 pubblica anche su più negozi) e ne ottiene la
versione con le chiavi e i testi di *quel* negozio. Il campo «Descrizione»
libero resta solo come **racconto** (il paragrafo narrativo), e il bottone
«Scrivi con l'AI» scrive quello, non la scheda intera.

### 3.2 Le sezioni del modulo, nell'ordine in cui si compilano

1. **Dove e cosa** — negozio principale + «pubblica anche su» (già fatto);
   **famiglia** (lista chiusa per negozio, è il `productType` e sceglie il
   template: Torta classica, Cake design, Cream Tart, Bouquet, Rose a numero,
   Cappelliera, Cesto floreale, Fiori d'Arte, Pianta, Vino/Spirits, Box
   gastronomico, Colazione/Cena, Oggetto, Servizio/Voucher, Catering B2B,
   Personalizzabile B2B…); **titolo**; **sottotitolo di riga 1** («sacher»,
   «girasoli», «a tema Super Mario»); **partner/vendor** dal registro (dà
   `vendor`, `custom.partner_id`, `custom.partner_address`, la formula di
   `custom.da_chi_fatto`); **classificazione interna** (per la piattaforma
   consegne, non va su Shopify).
2. **Racconto** — un paragrafo o due (campo libero o AI). Finisce in
   `<h6>Dettagli Prodotto</h6>` (fiori, box, vini) o `<h6>DESCRIZIONE</h6>`
   (torte, oggetti, servizi): lo decide il template, non chi scrive.
3. **Blocchi di famiglia** — campi che compaiono solo per la famiglia scelta:
   - torte/dolci: **ingredienti** (lista), **allergeni** (scelta multipla dal
     vocabolario: Glutine, Lattosio, Uova, Frutta a guscio…), **gusti**
     (`custom.gusti`), **cosa si personalizza** (checklist: forma, base, piani,
     farcitura, scritta, foto, candeline → riga 2 e sezione Personalizzazione),
     **campo obbligatorio** (lettera/numero/foto → `custom.campo_obbligatorio`);
     Pesi e Misure e Conservazione sono fissi del template (la tabella si genera
     **dalle porzioni scelte**, non più 11 righe fisse con 9 varianti);
   - fiori: **fiori** (multi, `custom.fiori` + tag), **colore dominante**
     (`custom.colore`/`colore_fiori` + tag), **modello** (`custom.modello`),
     **significato** (testo → `<h6>Significato</h6>`; il metafield
     `custom.significato` è vuoto ovunque e resta fuori), **guida misure**
     (flag → `custom.guida_misure` + URL della famiglia); Come Funziona e
     Dimensioni sono fissi del template (Dimensioni si genera dalla tabella
     taglia → numero di fiori della famiglia);
   - vini/spirits: cinque voci fisse (Denominazione, Varietà, Regione,
     Gradazione, Temperatura);
   - oggetti: coppie chiave/valore (Materiale, Misure, Artista, Linea…);
   - servizi/voucher: punti «Come Funziona» + validità;
   - catering B2B: menù (voci una per riga), allergeni, personalizzazione,
     `custom.tipologia_catering`.
4. **Consegna e disponibilità** — **giorni minimi** (0/1/2/3/5), **orario
   minimo** (7…19), **fasce** (mattina/pomeriggio/sera), **province servite**
   (scelta multipla da lista chiusa → `nations_availability` nel formato
   esatto, con o senza underscore secondo il negozio), **flag** pezzo unico /
   non fisico (default: falso). Da qui il motore deriva `custom.data`
   (0 → Oggi+Domani, 1 → Domani, ≥2 → Su prenotazione / «48 ore» / «72 ore» su
   Cake), la riga «Personalizzabile: da N giorni» di Cake, il tag `oklastminute`
   se consegna = 0. **Una sorgente sola**: la divergenza testo/metafield
   diventa impossibile.
5. **Occasioni e destinatari** — scelta multipla dalle *choices* del negozio
   (`custom.occasioni` / `custom.occasione`; Business ha le sue sette voci B2B);
   destinatario (Per lei / Per lui / Bambini / Adulti); best seller (flag). Da
   qui: metafield + lista «Ideale per:» + tag corrispondenti + badge.
6. **Opzioni, varianti e prezzi** — **nome opzione da lista chiusa**
   (Dimensione, Porzioni, Numero di persone, Numero di rose, Colore, Formato),
   **valori dal template di famiglia** con prezzi proposti a scaglioni
   (modificabili), su Cake **€/porzione** che genera le varianti, seconda
   opzione facoltativa (Vaso, Champagne, Polaroid — quest'ultima è dell'app
   BCPO e non si scrive via API finché non è accertato), suffisso «(foto)»
   sulla taglia fotografata. SKU generato dal codice della scheda (`{7 cifre}-n`,
   regola già in vigore dal 06/09: unico dentro il negozio, uguale sui gemelli).
   Controlli: niente varianti a 0 €, niente «Default Title» accanto a varianti
   vere, prezzo che cresce con la taglia (avviso), ordine crescente.
7. **Foto e video** — almeno una per pubblicare; alt = «{Titolo} - DELUXY».
8. **SEO** — generato e modificabile: `seo.title` = «{Titolo esteso} | DELUXY»
   (≤60; suffisso «| Deluxy Business» su Business), `seo.description` =
   «{Cosa}: {beneficio}. Consegna in guanti bianchi, biglietto a mano e
   confezione regalo DELUXY.» (≤155; **non** l'elenco di tre righe).
9. **Tag** — generati dal vocabolario (famiglia, destinatario, occasioni,
   colore/fiore, vendor, `oklastminute`, «… best seller») + tag aggiuntivi da
   una lista per negozio; i tag di campagna hanno una scadenza e si tolgono da
   soli (oggi restano `festadelpapà2025`).
10. **Pubblicazione** — fase, finestra dal/al, negozi (già fatto).

### 3.3 Il motore (`src/lib/scheda/`)

- `famiglie.ts` — l'elenco delle famiglie per negozio con: `productType` da
  scrivere, etichetta della riga 1 (singolare), blocchi previsti e loro ordine,
  titoli `h6` **fissi** (uno solo per concetto: «Dettagli Prodotto»,
  «Ingredienti e Allergeni», «Significato», «Dimensioni», «Come Funziona»,
  «Personalizzazione», «Pesi e Misure», «Conservazione», «Regala con Deluxy»),
  boilerplate (riga Inclusi, riga Consegna per negozio, note foto/allergeni,
  Come Funziona), tabelle taglie → fiori e porzioni → pesi, scaglioni di prezzo.
- `chiavi-negozio.ts` — la mappa delle chiavi metafield per negozio
  (best seller, province con/senza underscore, `data` lista o stringa,
  colore = `colore` o `colore_fiori`, occasioni = `occasione` o `occasioni`) e i
  namespace/tipi da usare quando una chiave **non ha definizione** (Business,
  Cake): si scrive lo stesso, con tipo dichiarato.
- `componi.ts` — `componiScheda(negozio, famiglia, campi)` → `{ descrizioneHtml,
  productType, vendor, tags, metafield[], seo, alt }`. HTML generato da
  stringhe controllate: mai HTML incollato (i negozi sono pieni di
  `<meta charset>`, `<div class="ewa-rteLine">`, stili inline, `<h6></h6>` vuoti).
- `vocabolario.ts` — allergeni, occasioni per negozio, destinatari, colori,
  nomi opzione: un vocabolario, con la forma canonica (Compleanno, non
  Compleanni; Rosa, non Pink).

### 3.4 I dati

`Prodotto` tiene già `descrizione` (che diventa il **racconto**), `tipoShopify`,
`vendorShopify`, i metafield tipizzati e `metafieldShopify`. Servono in più:

- `famiglia` (chiave del template) e `sottotitolo` (riga 1);
- `scheda` Json: i blocchi strutturati compilati (ingredienti, allergeni,
  significato, coppie chiave/valore, menù, personalizzazioni) — **questa è la
  fonte**, `descriptionHtml` è un derivato che si rigenera a ogni salvataggio;
- niente colonne nuove per consegna/province/partner: ci sono già
  (`ggDispMin`, `zoneConsegna`, `partnerIdShopify`…), vanno solo scritte dal
  modulo invece che lette dall'import.

Per i prodotti **importati** (5.053 schede) la scheda strutturata non c'è: il
modulo li apre con il racconto = descrizione attuale e i blocchi vuoti, e li
rigenera **solo se una persona compila la famiglia e salva**; finché non lo fa,
la descrizione del negozio non si tocca (un import non riscrive un testo che
un cliente sta leggendo).

### 3.5 Le regole del posto (che il modulo impone, perché i negozi le violano)

1. Province solo da lista chiusa, nel formato `ITALY-NOME(XX)` (4/53 Gifts sono
   in un formato che il tema non legge: quei prodotti non risultano
   consegnabili da nessuna parte).
2. Per pubblicare servono: almeno una foto, il partner, la consegna, le
   province, la famiglia (Business: 23/55 senza metafield, 21/55 senza foto;
   Flowers: 7/45 bozze pubblicate con placeholder).
3. Descrizione, `custom.data`, «da N giorni», lista occasioni e tag nascono
   **dagli stessi campi**: non possono divergere.
4. Titoli `h6`, riga Inclusi, riga Consegna: fissi per template e negozio
   (Business oggi ha dieci varianti della riga Consegna).
5. Niente HTML libero. Il racconto è testo; il resto lo genera il motore.
6. Nome opzione da lista (niente «Numero di persone » con lo spazio), varianti
   ordinate, prezzi crescenti, mai 0 €, mai «Default Title» fra le taglie.
7. Valori metafield validati contro le choices del negozio (oggi: «Torte» fuori
   dalle choices di `custom.dolci`, «Regalo » con lo spazio, «Su Prenotazione»
   insieme a «Oggi»).
8. Vendor dal registro partner, con `partner_id` e `partner_address` che ne
   discendono (oggi «Mazzetti dAltavilla» e «Mazzetti d'Altavilla» sono due
   vendor, e su Business il vendor è «Deluxy» anche per le torte di Martesana).
9. Handle generato dal titolo (oggi `spring-cak`, `labubu-cak`,
   `tiramisu-senza-glutine-1` = «Torta della Nonna Vegan»).
10. SEO con i limiti di lunghezza (oggi una `seo.description` di 2.505
    caratteri) e alt dal titolo corrente.

### 3.6 In che ordine si costruisce

1. **Motore e famiglie** (`src/lib/scheda/`) con le famiglie che coprono il
   grosso: Torta classica, Cake design, Bouquet, Cappelliera, Cesto, Vino, Box,
   Catering B2B. Test: per 30 prodotti esistenti del campione, `componiScheda`
   dai loro dati deve dare una descrizione **equivalente** a quella del
   negozio (stesse righe, stessi blocchi, stesso ordine).
2. **Il modulo**: famiglia in testa, blocchi condizionali, consegna/province/
   occasioni come sorgente unica, anteprima della scheda com'esce (il testo
   generato si vede prima di salvare). Il campo «Descrizione» diventa
   «Racconto».
3. **Salvataggio per negozio**: `componiScheda` per ciascun negozio scelto,
   con le chiavi giuste; `scheda` Json salvato; SEO e alt scritti.
4. **Poi**, e solo poi, i prodotti esistenti: apertura col racconto attuale,
   rigenerazione a scelta.

## 4. Non accertato (da verificare prima di scriverci sopra)

- La **chiave del metafield di variante** con i giorni minimi per taglia
  (Cake: 75/100 porzioni = +2 giorni; Gifts «sacher» 0/0/0/2/2/2): il tema la
  legge in una lista `metaValue`, il campione ha solo metafield di prodotto.
  Si accerta con una query Admin `productVariant.metafields`.
- Il significato operativo di `custom.is_unique`, `custom.not_physical`,
  `custom.classificazione`, `custom.tipologia_mood` (il tema li passa come
  `data-product-unique` / `data-product-physical`).
- Se `custom.citta` sia ancora letto dal tema (compilato in 14/53 su Gifts).
- Cosa mostrano `custom_product_info_content_1/2` e
  `custom.descrizione_cattura_vendite` (definiti, non resi nel campione).
- Se `bcpo.bcpo_data` (Polaroid su Flowers) si possa scrivere via Admin API
  senza rompere l'app BCPO.
- Il significato dei tag editoriali di Cake («Approvato», «novità»,
  «cakedesign»): flusso di lavoro di chi cura il sito, o collezioni.
- La variazione per pasticcere su Cake: nel campione c'è un solo partner (223).
- Il campione tiene 2 prodotti per tipo (non 6 come previsto dallo script):
  le frequenze per tipo sono indicative, la grammatica no (è la stessa su 210
  prodotti su 210).
