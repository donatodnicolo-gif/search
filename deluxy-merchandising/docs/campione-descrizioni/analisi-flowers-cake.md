# Analisi schede prodotto — Deluxy Flowers e Cakedesign.me

Data analisi: 2026-09-07. Fonti: `docs/campione-descrizioni/flowers.json` (45 prodotti attivi su 269, 11 tipi) e `docs/campione-descrizioni/cake.json` (57 prodotti attivi su 321, 13 tipi), più 9 pagine pubbliche per sito scaricate con `curl` (HTML del tema + `/products/<handle>.json`). Sola lettura: nessuna chiamata Admin API. Gli script di analisi (`analisi.mjs`, `incroci.mjs`, `pagina.mjs`) sono nello scratchpad della sessione, non nel repo.

Convenzione: «N/45» = prodotti Flowers del campione, «N/57» = prodotti Cake del campione. Dove una cosa NON è stata verificabile è segnalata esplicitamente con **[non accertato]**.

---

## Sintesi in 10 righe

1. Entrambi i negozi usano lo stesso tema (Impulse 7.2.0 personalizzato) e la **stessa grammatica di descrizione**: un `<ul>` iniziale con 3 righe `<b>Etichetta</b>: valore` (riga 1 = famiglia + sottotitolo, riga 2 = inclusi/personalizzazione, riga 3 = consegna) seguito da sezioni `<h6>` fisse per famiglia.
2. Il tema mostra il primo `<ul>` come riepilogo sotto i bottoni e la descrizione intera in un blocco a scomparsa; **nessun metafield descrittivo** (occasione, fiori, colore, gusti, data…) viene reso in pagina prodotto: servono ad altro (collezioni/filtri/app) **[non accertato]**.
3. Flowers: 44/45 seguono lo schema; sezioni tipiche «Dettagli Prodotto → Come Funziona → Significato → Dimensioni → Perfetto per»; mediana 224 parole; «Come Funziona» (4 punti) e «Inclusi» sono boilerplate identico in 26-43 prodotti.
4. Cake: 55/57 seguono lo schema; sezioni «DESCRIZIONE/Dettagli → Personalizzazione → Ingredienti e Allergeni → Pesi e Misure → Conservazione»; mediana 291 parole; tabella pesi (51/57) e conservazione (≈45-50/57) identiche.
5. Opzioni: Flowers usa taglie nominali (`Dimensione` 25/45: S/M/L/XL, Medio/Medio-Grande/Grande/Luxury, Maxi/Dream/Mega Dream) o `Numero di rose`, con prezzi a scaglioni fissi per famiglia; Cake usa `Porzioni` (53/57) con prezzo = porzioni × €/porzione (8-24 €).
6. `compareAtPrice` mai usato (0/233 e 0/536 varianti). SKU generati: 6 lettere maiuscole + progressivo (`GKCSRX-1`) o + porzioni (`DPOYKN25`); su Cake EasyOptions aggancia le varianti **per SKU**.
7. Metafield operativi presenti quasi ovunque ma **senza definizione** su entrambi: `custom.partner_id`, `custom.partner_address`, `custom.is_unique`, `custom.not_physical`, `custom.nations_availability` (Cake) / `custom._nations_availability` (Flowers, con underscore e con definizione), `custom.minimo_orario` (Cake senza definizione, Flowers con).
8. Il tema legge un valore **per variante** di «giorni minimi di consegna» (lista `metaValue` nel sorgente) che NON è nel campione (le varianti campionate hanno solo titolo/sku/prezzo): la chiave del metafield di variante è **[non accertata]**.
9. SEO quasi mai compilato (Flowers 2/45, Cake 1/57); alt immagini vuoti 67/77 su Flowers, 35/87 su Cake; mediana 1 immagine per prodotto.
10. Il campione contiene bozze e refusi (7 duplicati «-1» senza immagini/tag su Flowers; su Cake prezzi non monotoni, handle troncati, «da 7 giorni» in descrizione contro `consegna=3`): il modulo deve impedirli.

---

## A. Anatomia della descrizione (`descriptionHtml`)

### A.1 Flowers

**Tag HTML usati** (n. prodotti che li usano): `ul`/`li`/`h6`/`p` 44, `b` 43, `i` 30, `strong` 15, `em` 6, `br` 6, `meta` 5, `span` 5, `div` 2. Nessuna tabella, nessuna immagine, nessun `h1-h5`. Grassetto misto `<b>` (43) e `<strong>` (15): stesso ruolo, markup diverso. In 13 occorrenze c'è un `<h6></h6>` vuoto usato come spaziatore; in 2 prodotti stili inline (`style="font-size: 16px; font-weight: 400;"` su maxi-cesto-ortensie-rosa-e-rose, `margin-top` su corona-laurea-luxury).

**Lunghezza**: min 3, mediana 224, media 202, max 274 parole. Vuote 0; una sola sotto le 25 parole (`luxury-red-roses-bouquet`, testo «Flowers product description», tipo «Dolci»: placeholder mai completato). Per tipo: Abbonamento Fiori ≈100, Originali Deluxy 181, Fiori 212, Cesti 220, Fiori d'Arte 224, Rose 230, Rosa Eterna 237, Cappelliere 256.

**Struttura ricorrente** (sequenza iniziale più frequente: `ul,h6,p,h6,p,ul,p,ul,p,ul,p,ul` = 14/45, poi `ul,h6,p,p,h6,p,ul,p,ul,p,ul,p` = 7/45):

1. `<ul>` di 3 `<li>` «`<b>Etichetta</b>: valore`» — 44/45. L'etichetta della prima riga è la **famiglia**: Fiori (6), Rose (6), Cappelliera (6), Cesto Floreale (6), Fiori d'Arte (6), Originali Deluxy (6), Pianta (1), Rosa Eterna (2), Tipologia di Abbonamento (3) / Abbonamento Fiori (1), Fiori per corona-laurea. Seconda riga «Inclusi: biglietto scritto a mano e confezione regalo» 43/45 (103-rose: «bigliettino personalizzabile e confezione regalo»). Terza riga «Consegna: dove vuoi tu» 38/45 oppure «a casa o dove vuoi tu» 6/45 (stesso significato, due formule).
2. `<h6>Dettagli Prodotto</h6>` 32 (varianti: «Dettagli» 2, «Descrizione» 4, «DESCRIZIONE»/«DETTAGLI PRODOTTO» 1 ciascuno) + 1-2 `<p>` descrittivi in tono lirico; spesso un `<p><i>` di nota: «Ogni nostra rosa viene selezionata con cura dai migliori artisti del settore…» (5, famiglia Rose/Cappelliere) o «I fiori freschi sono soggetti a disponibilità e potrebbero subire variazioni, a differenza della palette colori che è da considerarsi fissa.» (8, Fiori d'Arte e cappelliere).
3. `<h6>Come Funziona</h6>` 30/45: `<p><i>Con Deluxy Flowers[,] i tuoi regali si trasformano in un'esperienza indimenticabile…</i></p>` (15 + 10 con la virgola = 25) seguito da 4 coppie `<ul><li><b>Titolo</b></li></ul><p>testo</p>`: «Un'opera floreale d'autore» / «Confezione regalo» / «Un messaggio scritto a mano» / «Data, ora e luogo» — identiche in 26-27/45. Sugli Originali Deluxy il blocco è invece «Deluxy Flowers porta a casa di chi ami un set pensato per sorprendere, così composto:» + lista dei componenti (4/45).
4. `<h6>Significato</h6>` 28/45 (+1 maiuscolo): 1-3 `<p>` sul simbolismo del fiore/colore/numero; su Rose «numero a scelta» una lista `9 Rose:…50 Rose:` (2); sui Fiori d'Arte il pattern `PALETTE / ANIMA / OPERA / COMPOSIZIONE` (3 in `<b>`, 3 in `<strong>`).
5. `<h6>Dimensioni</h6>` 26/45 (+1 «Dimensione»): coppie `<p><b>Taglia:</b></p><p>N-M fiori</p>`. Tabelle standard per famiglia:
   - Bouquet (Fiori): Medio 10-15 / Medio-Grande 15-20 / Grande 30-35 / Luxury 45-55 fiori.
   - Bouquet Fiori d'Arte: Medio-Grande 15-20 / Grande 25-30 / Luxury 45-55 / Maxi 95-105 / Dream 245-255.
   - Cappelliere (S/M/L/XL): «Diametro minore di 15 cm, circa 10-15 rose» / «15-20 cm, 20-25» / «maggiore di 20 cm, 45-55» / «maggiore di 20 cm, 65-75» (la versione d'arte aggiunge «e N polaroid»).
   - Cesti: Maxi 50-60 / Dream 170-175 / Mega Dream 350-360.
   - Originali con praline: `<h6>Composizione</h6>` Classic 9 dalie 16 praline / Premium 25-25 / Luxury 50-36.
6. `<h6>Perfetto per</h6>` 31/45 (varianti «Regala con Deluxy» 7+1, «Ideale per» 4): `<p>Ideale per:</p><ul>` di 4-6 occasioni al plurale (Compleanni, Anniversari, Sorprese romantiche, Congratulazioni, Ringraziamenti, Festa della mamma…).
7. Solo Piante: `<h6>Cura</h6>` con lista Luce/Temperatura/Acqua (1). Solo Originali con cibo: `<h6>Ingredienti e Allergeni</h6>` (1). Solo Abbonamenti: «Descrizione → Cosa include → Ideale per» (3-4), niente Come Funziona/Significato/Dimensioni.

**Lingua e tono**: italiano, seconda persona singolare («chi ami», «da te scelta»), registro lirico-lusso («petali vellutati», «senza compromessi»). Nessun inglese tranne titoli di alcuni prodotti («Love Memories - Red», «Luxury Red Roses Bouquet»).

**Per vendor**: Deluxy Flowers 29 (media 213 parole), Deluxy 15 (182; comprende gli Originali e le 7 bozze), Artisti Deluxy 1. Il vendor non cambia la struttura; gli Originali Deluxy (vendor Deluxy, partner 128) usano «Come Funziona» come elenco dei componenti del set.

**Esempi rappresentativi** (struttura):
- Bouquet `bouquet-girasoli-1` (Fiori): ul(Fiori: girasoli / Inclusi / Consegna: a casa o dove vuoi tu) → Dettagli Prodotto (1 p) → Come Funziona (frase + 4 punti) → Significato (1 p) → Dimensioni (4 taglie) → Perfetto per (4 li).
- Cappelliera `cappelliera-rose-rosse-1`: ul(Cappelliera: rose rosse / …) → Dettagli Prodotto (p + nota rosa in corsivo) → Come Funziona → Significato → Dimensioni (Small/Medium/Large/Extra-Large con diametro) → Perfetto per (5 li).
- Cesto `maxi-cesto-ortensie-rosa-e-rose`: ul(Cesto Floreale: …) → Dettagli Prodotto → Come Funziona → Perfetto per (6 li) → Dimensioni (Maxi/Dream/Mega Dream) — ordine invertito rispetto agli altri, con stili inline.
- Fiori d'Arte `bouquet-beethoven`: ul(Fiori d'Arte: ispirati a "Sinfonia n. 9…") → Dettagli Prodotto (p in strong + nota disponibilità) → Significato (PALETTE/ANIMA/OPERA/COMPOSIZIONE) → Dimensioni (5 taglie «BOUQUET») → Perfetto per. Niente Come Funziona.
- Rose a numero `rose-nere-numero-a-scelta`: … → Significato con lista «9 Rose: …50 Rose: …» → Perfetto per.
- Pianta `orchidea-bianca`: ul(Pianta: …) → Dettagli → Come Funziona → Cura (Luce/Temperatura/Acqua) → Regala con Deluxy.
- Abbonamento `abbonamento-rose`: ul(Tipologia di Abbonamento: …) → Descrizione → Cosa include (3 li) → Ideale per (4 li). 67 parole.
- Originale `dalie-colorate-e-praline-dautore-champagne`: ul(Originali Deluxy: …) → Come Funziona (set composto da 4 li) → Ingredienti e Allergeni → Significato → Composizione (Classic/Premium/Luxury) → Regala con Deluxy.

### A.2 Cake

**Tag HTML usati**: `ul`/`li`/`p` 56, `b` 55, `h6` 55, `br` 46, `i` 41, `em` 11, `a` 9 (tutti link a `/collections/vintagecake` nella prima riga dei Vintage Cake), `span` 5, `div` 4, `meta` 1. Nessuna tabella (la tabella pesi è un `<ul>` con `<br>`), nessuna immagine. In `cake-ai-maker` classi `MsoNormal` (incollato da Word); in `sweet-degree` commento `<!-- x-tinymce/html -->`.

**Lunghezza**: min 16, mediana 291, media 281, max 373 parole. Vuote 0; sotto le 25 parole solo `_additional-price` (prodotto nascosto di servizio: «This is a hidden product used by EZ Product Options, please do NOT remove it»). Per tipo: CDM Torte 226, CDM Domani 251, Cake Design 274, Nascite 287, Romantiche 291, Bambini 304, Laurea 311, Adulti 316, Cream Tart 323, FunnyCake 324.

**Struttura ricorrente** (sequenza più frequente `ul,h6,p,p,h6,p,p,ul,h6,p,ul,p` 14/57):

1. `<ul>` di 3 `<li>` (4 sui Vintage) — 55/57. Etichetta riga 1 = **famiglia commerciale**: «Torta di alta pasticceria» 19, «Torta» 11, «Vintage Cake» 7 (+2 «Vintage Cake & Cupcakes / e cupcake»), «Cream Tart Estiva» 4, «Cream Tart» 3, «Funny Cake» 2, «Torta Romantica» 2, «Torta e Cupcake "My Hero"/"My Love"» 2, altri singoli. Valore = sottotitolo («Cake Design a tema Super Mario», «sacher», «con la tua lettera»). Riga 2: «Personalizzabile: da N giorni» 29 (cake design), «Personalizza: farcitura|topping|forma e dettagli / gusti e dettagli / scegli la tua palette…» 17 (torte classiche, cream tart), oppure sui Vintage due righe «Gusto base: crema chantilly alla vaniglia» + «Crea la tua torta / Crea il tuo set: scegli ingredienti e dettagli» (7+2). Riga 3: «Consegna: dove vuoi tu nel mondo» 42, «Consegna: da 2|3 giorni, ovunque nel mondo» 8 (Vintage).
2. `<h6>DESCRIZIONE</h6>` 15 / «Descrizione» 7 / «Dettagli» 32: 1 `<p>` descrittivo (sui cake design spesso apre con «Torta con base di pan di Spagna e crema a scelta tra chantilly, pasticcera, cioccolato, pistacchio, nocciola o zabaione.») + `<p><i>La foto è a scopo illustrativo, l'aspetto potrebbe variare secondo la disponibilità dell'artista.</i></p>` (32) / «…creatività dell'artista» (11, torte classiche) / «…creatività del pasticcere» (4, Summer). Sui set con cupcake un secondo corsivo «Il numero dei cupcake inclusi corrisponde esattamente al numero di porzioni…» (4).
3. `<h6>Personalizzazione</h6>` 54/57: `<p>Con Cakedesign.me puoi personalizzare la tua torta quando e dove vuoi[ tu]! Ti basterà cliccare su CREA LA TUA TORTA.</p>` (20 + 13, due varianti di testo) + `<p>Potrai personalizzare:</p>` + `<ul>` di 3-7 voci prese da: Base, Numero di piani / Piani, Forma, Farcitura, Confettura, Ingredienti, Topping, Scritta [sulla torta] / Scritta e foto sulla torta, Candeline / «Numero e colore della candelina» (31), «Numero delle porzioni (1 cupcake per ogni persona)» (6), «Palette / Tema (Ocean, Beach, Tropical)» (4). Le torte classiche omettono la frase «Con Cakedesign.me…».
4. `<h6>Ingredienti e Allergeni</h6>` 55/57: due stili. (a) torte classiche: 1 `<li>` con allergeni in MAIUSCOLO («FARINA 00, zucchero, UOVA, LATTE e derivati, cacao, SOIA…») + `<p><i>Può contenere tracce di frutta a guscio.</i></p>` (4) / «Possibile presenza di frutta a guscio.» (7). (b) cake design: `<p>Potrai trovare:</p>` + `<li>` ingredienti («Farina, Zucchero, Uova, Burro, Latte, Cacao, Estratto di vaniglia, Pasta di zucchero, Coloranti alimentari» 16; senza pasta di zucchero 10) + `<li>` allergeni («Glutine, Lattosio, Uova, Frutta a guscio» 26) + `<p><i>La torta potrebbe contenere materiali non edibili[…]</i></p>` (20 + 4 versione lunga sui piani in polistirolo).
5. `<h6>Pesi e Misure</h6>` 53/57: sempre la stessa lista di 11 righe «350 - 500 g / 14 - 16 cm … 5 - 5,5 kg / 60 x 40 cm» (identica in 51; Summer usa «|» come separatore; 2 usano `45x35` senza spazi). Manca su CDM Domani (photo-memories, polaroid) e sui prodotti di servizio. NB: la tabella ha 11 righe anche quando il prodotto ha 9 o 10 varianti di porzioni: non è allineata alle varianti.
6. `<h6>Conservazione</h6>` 54/57: 3 `<li>`: «Conservare in frigorifero a una temperatura di circa 4°C.» (50) / «Consumare entro 2-3 giorni per garantire freschezza e qualità.» (45; Summer «la massima freschezza…» 4) / «Prima di servire, lasciare la torta a temperatura ambiente per circa 20-30 minuti…» (42; Summer variante 4).

**Errori di markup** nel campione: 4 prodotti hanno contenuto avvolto in `<h6>` per sbaglio (una lista ingredienti, la riga «Base Numero di piani Farcitura…», la tabella pesi, la riga conservazione) — testo che in pagina appare come titolo.

**Lingua e tono**: italiano, seconda persona, più descrittivo-gastronomico che lirico; termini inglesi nei nomi (Cream Tart, Funny Cake, Vintage Cake, Photo Memories). Ingredienti/allergeni con convenzione incoerente (maiuscolo vs normale).

**Per vendor**: CakeDesignME 47 (media 288 parole), Deluxy 7 (313; stessi schemi, nessuna differenza strutturale: sono cake design/cream tart), cakedesign 3 (prodotti di servizio/copia: `_additional-price`, `cheesecake-copy`, `cake-ai-maker`). Tutti i 54 prodotti «veri» hanno lo stesso `partner_id` 223 («Via Varesina, Milano MI, Italia»): nel campione c'è **un solo pasticcere**, quindi la variazione per partner non è osservabile **[non accertato su tutto il catalogo]**.

**Esempi rappresentativi**:
- Torta classica `sacher` (CDM Torte): ul(Torta: sacher / Personalizza: farcitura e dettagli / Consegna: dove vuoi tu nel mondo) → DESCRIZIONE (p + foto illustrativa «creatività») → Personalizzazione (Forma, Confettura, Scritta e foto, Candeline) → Ingredienti (CAPS + tracce) → Pesi e Misure (11) → Conservazione (3). 225 parole.
- Torta a strati `torta-tre-cioccolati` (Cake Design): come sacher ma DESCRIZIONE con `<ul>` dei 3 strati in `<b>`.
- Cake design `mario-cake` (CDM Bambini): ul(Torta di alta pasticceria: Cake Design a tema Super Mario / Personalizzabile: da tre giorni / Consegna) → Dettagli (p + «disponibilità dell'artista») → Personalizzazione (frase CREA LA TUA TORTA + Base, Numero di piani, Farcitura, Ingredienti, Scritta (es. il nome…), Numero e colore della candelina) → Ingredienti («Potrai trovare:» + 2 li + materiali non edibili) → Pesi e Misure → Conservazione. Stesso identico schema per `sweet-degree` (Laurea), `dubai-chocolate-cake` (Adulti), `red-velvet-rose-cake` (Romantiche).
- Cream Tart `letters`: ul(Cream Tart: con la tua lettera / Personalizza: gusti e dettagli / Consegna) → Descrizione → Personalizzazione (Base, Farcitura, Ingredienti, Topping, Numero e colore della candelina) → Ingredienti (2 li) → Pesi → Conservazione. `summer-star`: aggiunge la lista Ocean/Beach/Tropical nella descrizione e «Palette / Tema» nella personalizzazione.
- Torta con foto `photo-memories-cake` (CDM Domani): «Personalizzabile: da 1 giorno», senza Pesi e Misure.
- Set torta+cupcake `hero-e-cupcake`: nota cupcake in corsivo; voce «Numero delle porzioni (1 cupcake per ogni persona)».
- Vintage `diana`/`olivia`/`kai`: ul a 4 righe con link «Vintage Cake» → …

### A.3 Confronto Flowers vs Cake

| | Flowers | Cake |
|---|---|---|
| Header `<ul>` 3 righe | famiglia / Inclusi / Consegna | famiglia / Personalizza(bile) / Consegna |
| Sezioni h6 | Dettagli Prodotto, Come Funziona, Significato, Dimensioni, Perfetto per (+Cura, Composizione, Ingredienti) | DESCRIZIONE/Dettagli, Personalizzazione, Ingredienti e Allergeni, Pesi e Misure, Conservazione |
| Boilerplate identico | Inclusi (43), Come Funziona 4 punti (26), frase Deluxy Flowers (25), tabella Dimensioni per famiglia | Conservazione (42-50), Pesi e Misure (51), frase CREA LA TUA TORTA (33), foto illustrativa (49), allergeni (26), candelina (31) |
| Parole mediana | 224 | 291 |
| Occasioni in descrizione | sì (lista «Ideale per») | no (solo tag) |
| Dati di consegna in descrizione | «dove vuoi tu» generico | «da N giorni» (29) che duplica `prodotto.consegna` |
| Grassetto | `<b>` 43 / `<strong>` 15 | `<b>` 55 / `<strong>` 0 |

---

## B. Dove vive ogni informazione (metafield)

### B.1 Flowers — 33 definizioni, tasso di compilazione su 45

| namespace.key | tipo | compilato | valori |
|---|---|---|---|
| custom._nations_availability | multi_line_text | 37/45 | 3 distinti: elenco 14 province lombarde+RM+FI in 2 ordinamenti (31 e 5), e 1 errato «Italia-Italia / Francia-Francia / Inghilterra-Inghilterra» su 103-rose |
| custom.minimo_orario | integer | 37/45 | 8 (32), 7 (5: partner 128) |
| prodotto.consegna («gg_disp_min») | integer | 38/45 | 0 (26), 1 (6), 2 (6) |
| custom.colore | single_line, choices Mix/Rosso/Rosa/Bianco/Giallo/Arancione/Blu/Viola/Nero… | 37/45 | Mix 21, Rosso 5, Giallo 3, Bianco 3, Rosa 3, Nero 1, Arancione 1 |
| custom.modello | single_line, choices Bouquet/Maxi Bouquet/Cappelliera/Centrotavola/Cesto/Ghirlanda/Pianta/… | 37/45 | Bouquet 13, Cappelliera 12, Cesto 6, Corona 2, Maxi Bouquet 2, Pianta 1, Vetro 1 |
| custom.fiori | list, choices Rose/Peonie/Ortensie/Girasoli/Lavanda/Gerbere/Lisianthus/Dalie/… | 36/45 | Rose 27, Ortensie 10, Fiori di Stagione 6, Dalie 4, Girasoli 3, Lisianthus 3, Garofani 3 |
| custom.occasione | list, choices Compleanno/Sorpresa romantica/Anniversario/Ringraziamento/Laurea/Nascita/… | 35/45 | Sorpresa romantica 33, Anniversario 33, Compleanno 31, Ringraziamento 25, Nascita 10, Laurea 8, Matrimonio 6, Festa della Mamma 4, Festa del Papà 2, Festa della Donna 1 |
| custom.data | **list**, choices Oggi/Domani/Su prenotazione | 32/45 | Domani 23, Oggi 21, Su prenotazione 4 (tipicamente `["Oggi","Domani"]` con consegna=0, `["Domani"]` con consegna=1, `["Su prenotazione"]` con consegna=2) |
| custom.best_value («Best Seller») | boolean | 9/45 | true |
| custom.url_img_dimensione | url | 13/45 | SIZE_BOUQUET.jpg (4), SIZE_CAPPELLIERE.jpg (4+2 su CDN di un altro negozio), Significato_Rose_Bouquet (3: immagine sbagliata per la guida misure?) |
| custom.guida_misure | single_line, choices SI | 13/45 | SI (sempre insieme a url_img_dimensione) |
| custom.tipo_abbonamento | list Romantico/Stagionale/Business | 1/45 | Business |
| custom.tag_per_prodotto, custom.bestproduct, shopify.color-pattern, shopify.arrangement, reviews.rating(+count) | | 1/45 ciascuno | residui |
| custom.significato, custom.testnew, custom.combo, shopify.celebration-type, shopify.item-style, shopify.personalization-design, shopify--discovery.*, product_options.* (EasyFlow), seo.hidden, mm-google-shopping.custom_product | | **0/45** | definiti ma mai usati (il «Significato» vive solo nella descrizione) |

**Metafield presenti ma senza definizione** (Flowers): `custom.partner_id` 36/45 (128 → «Milano» sui 5 Originali; 242 → «Via Monte Napoleone, 20121 Milano MI, Italia» su 31), `custom.partner_address` 36, `custom.is_unique` 35 (tutti false), `custom.not_physical` 35 (tutti false), `judgeme.badge`/`judgeme.widget` 39 (HTML dell'app recensioni), `bcpo.bcpo_data` 10 (JSON dell'app Best Custom Product Options: «virtual_options» di tipo file «Polaroid 1…4» o testo «Link Foto» sui prodotti con polaroid), `global.title_tag`/`global.description_tag` 2 (SEO legacy), `mm-google-shopping.google_product_category` e `mc-facebook.google_product_category` 1 (corona-laurea). Min/max metafield per prodotto: 2/19.

### B.2 Cake — 21 definizioni, su 57

| namespace.key | tipo | compilato | valori |
|---|---|---|---|
| prodotto.consegna («gg_disp_min», descr. «Data prima disponibilità prodotto») | integer | 56/57 | 3 (19), 2 (16), 1 (12), 0 (8), 4 (1: cake-ai-maker) |
| custom.data | **single_line**, choices Oggi/Domani/48 ore/72 ore | 36/57 | 72 ore 15, 48 ore 9, Oggi 6, Domani 6 |
| custom.gusti | list, choices Frutta/Crema/Cioccolato/Pistacchio/Nocciola/Mandorla/Noci/Caffè/… | 22/57 | Cioccolato 15, Crema 14, Frutta 6, Formaggio 3, Limone 3, Caffè 2, Pistacchio 2, Nocciola 2 |
| custom.best_seller | boolean | 13/57 | true |
| custom.campo_obbligatorio | boolean | 3/57 | true su letters, numbers-1, polaroid-cake (prodotti che richiedono un dato obbligatorio: lettera/numero/foto) |
| reviews.rating(+count) | | 4/57 | 5.0 / 1 |
| custom.openai | boolean | 1/57 | true su cake-ai-maker |
| custom.test1, custom.tesetnumber, custom.choose_your_cake_fruit_tart, custom.choose_your_cake_a_thousand_leaves, shopify.color-pattern, shopify.flavor, shopify.allergen-information, shopify.flour-grain-type, shopify--discovery.*, mm-google-shopping.custom_product | | **0/57** | mai usati |

**Senza definizione** (Cake): `custom.nations_availability` 54/57 (**senza underscore**, un solo valore = stesse 14 province di Flowers), `custom.partner_id` 54 (sempre 223), `custom.partner_address` 54 («Via Varesina, Milano MI, Italia»), `custom.is_unique` 53 (false), `custom.not_physical` 53 (false), `custom.minimo_orario` 54 (8), `judgeme.*` 35, `global.title_tag` 1, e su 5 torte classiche «per oggi» un gruppo di residui di un vecchio configuratore: `custom.cyc_chantilly_cake_title`=«Oggi», `custom.cyc_thousand_leaves_title`=«1», `custom.cyc_fruit_tart_title`=gusto (2), `custom.occasione`=`["Oggi"]` (5, usato come «data», non come occasione), `custom.design_your_cake_chantilly_cake`=`["Cioccolato"]` (5). Nessuno di questi è referenziato nel sorgente delle pagine scaricate. Min/max per prodotto: 2/18.

### B.3 Solo descrizione / solo metafield / duplicati

- **Solo nella descrizione**: Flowers → testo emozionale, Significato, tabella Dimensioni (numero fiori/diametro per taglia), composizione floreale dettagliata (i Fiori d'Arte elencano varietà che `custom.fiori` non copre: lisianthus lilla, dianthus…), note disponibilità, cura piante, ingredienti praline. Cake → descrizione, lista personalizzazioni, ingredienti e allergeni, pesi e misure, conservazione, gusto base, palette (Summer).
- **Solo nei metafield**: partner (id/indirizzo), province servite, orario minimo, is_unique/not_physical, best seller, guida misure (Flowers), gusti (Cake), campo obbligatorio (Cake), giorni minimi (`prodotto.consegna`) — su Flowers la descrizione non dice mai quanti giorni servono.
- **Duplicati**: Flowers `custom.occasione` ↔ lista «Ideale per» ↔ tag occasione (con vocabolari diversi: singolare nel metafield, plurale in descrizione, «Festa Della Donna» solo tag; 0 prodotti in cui le tre liste coincidono); `custom.colore` ↔ tag colore (Mix↔«Mix Colori» 17; Rosso ha tag solo in 2/5; «Pink» al posto di Rosa 2); `custom.fiori` ↔ tag fiore (Rose 27↔19, Ortensie 10↔7, Girasoli 3↔3); `custom.modello` ↔ tag Bouquet/Cappelliera/Cesti Floreali ↔ etichetta prima riga ↔ productType (Cappelliere vs Fiori d'Arte vs Originali: un prodotto «cappelliera» può stare in 3 tipi). Cake `prodotto.consegna` ↔ «Personalizzabile: da N giorni» in descrizione (35 coerenti, 3 diversi, 19 senza numero) ↔ `custom.data` (34 coerenti, 2 diversi: crostata vegan e torta nonna vegan con «72 ore» ma consegna=0) ↔ giorni per variante nel tema.

---

## C. Opzioni e varianti

### C.1 Flowers
- Varianti per prodotto: min 1, mediana 4, max 12 (distribuzione: 4 → 10 prodotti; 8 → 8; 1 → 6; 3 → 6; 6 → 5; 10 → 4).
- Nomi opzione (n. prodotti): **Dimensione** 25, **Numero di rose** 7, Title/Default 5, Colore 3, Bouquet 3 (Fiori d'Arte, = dimensione), Vaso 3, Polaroid 3, Colore rose 3, Lucine decorative 2, Composizione 1, Champagne 1, Size 1. Combinazioni: solo Dimensione 18, solo Numero di rose 6, Bouquet+Vaso 3, Dimensione+Polaroid 3, Dimensione+Colore rose 3, Lucine 2, Composizione+Champagne 1, Dimensione+Colore 1, Numero di rose+Colore 1.
- Valori tipici di Dimensione: bouquet «Medio / Medio-Grande / Grande / Luxury», cappelliere «S / M / L / XL», cesti «Maxi / Dream / Mega Dream», Fiori d'Arte «Medio-Grande / Grande / Luxury / Maxi / Dream», abbonamenti «Piccolo / Medio / Medio-Grande / Grande / Luxury» (+ «(1 volta al mese)/(2 volte al mese)» in una bozza). Suffisso **«(foto)»** sulla taglia mostrata nell'immagine (XL (foto) 6, L (foto) 5, Luxury (foto) 2, Grande (foto) 1): informazione di UX codificata nel nome variante.
- Numero di rose: 9/12/15/18/21/24/36/50 (standard, 3 prodotti), 3/5/7 (rose rosse XXL), 45/75/105/150/200/250 (maxi), «7 rose…50 rose» con suffisso testuale nell'abbonamento.
- **Scala prezzi** (fissa per famiglia): bouquet 85/135/250/450; Fiori d'Arte 135/250/450/950/2500 (+50 con Vaso Si; sui cappelliere +5/10/15/20 con Polaroid Si); cappelliere 150/300/600/900 (Originali con polaroid 320/620/920 e 350/650/950); cesti 900/2500/5000 (+50/100 con polaroid); rose 10 €/rosa (rose nere ≈12 €/rosa: 110…600); rosa eterna 125/145 (lucine); abbonamenti 45…450 / business 95…500; piante 95; corona funebre 300/600/900; Originali Classic/Premium/Luxury 175/360/700 (+80 champagne).
- `compareAtPrice`: 0/233 varianti.
- **SKU**: 233/233 compilati. Pattern: `AAAAAA-9` 200 (6 lettere maiuscole casuali + progressivo 1-12), `AAAAAA-99` 13, numerici 7 cifre 10 (prodotti più vecchi), `A9AA9`/`A9AA99` 8, 1 leggibile («ABB-…»). Il progressivo segue l'ordine option1 poi option2 (`GKCSRX-1,-4,-2,-5,-3,-6` = Classic/No, Classic/Si, Premium/No…). Origine dei codici: probabilmente generati dall'app di smistamento **[non accertato]**.

### C.2 Cake
- Varianti: min 1, mediana 10, max 12 (10 → 21 prodotti; 9 → 18; 11 → 11; 8 → 3).
- Opzione unica **Porzioni** 53/57 (+ «Numero Porzioni» 1, «Porzioni e cupcake» 1, Default 2). Valori: torte classiche 6/8/10/15/20/25/30/40/50/75/100 (11); cake design 6 o 10/15/20/25/30/40/50/75/100 (9-10); cream tart 8/12/16/20/25|24/30/40/50/75|80/100; matrimonio/cupido 20/30/40/50/60/70/80/90/100/150/200; harry-cake solo 6-20.
- **Prezzo = porzioni × €/porzione**, con €/porzione fisso per fascia: 8 (tiramisù), 9 (classiche), 12 (senza glutine, Dubai, millefoglie, im-back), 14 (photo/polaroid/bow/sweet-degree, e 15 sulle 6 porzioni), 19 (unicorn, mario, beach), 20 (3D), 22-24 (set con cupcake, laurea premium, halloween, matrimonio). Cream tart non lineare (8=85, 12=110, 16=145 → da 10,6 a 9,0 €/porzione).
- `compareAtPrice`: 0/536.
- **SKU**: 536/536 compilati. `AAAAAA-9` 363 e `AAAAAA-99` 45 (progressivo), `AAAAAA9`/`AAAAAA99`/`AAAAAA999` 114 (6 lettere + **numero di porzioni**, es. `DPOYKN6…DPOYKN100`), minuscoli 11, anomali «9aa»/«a9a» 2. Nel sorgente pagina EasyOptions elenca le varianti con `sku/title/price/cost` tutti = SKU: lo SKU è la chiave con cui l'app opzioni collega i sovrapprezzi alla variante → deve essere presente e univoco.
- **Incoerenze**: `letters-1` varianti in ordine 25…100,10,15,20 con prezzi non monotoni (60=720, 75=1050, 80=960); `tiramisu-senza-glutine-1` 8 porzioni=80 € = 10 porzioni (refuso); `mery-e-cupcake` salta da 14 a 24 €/porzione fra 10 e 15; `hero-e-cupcake` e `lila-e-cupcake` con le taglie piccole in coda; `harry-cake` fermo a 20 porzioni.

---

## D. Tag

### D.1 Flowers
- Tag per prodotto: min 0, mediana 5, max 16; 51 distinti; **11/45 senza tag** (7 bozze, corona-funebre, 3 abbonamenti + corona-laurea con 2).
- Famiglie: *categoria* (Fiori 31, Rose 19, Bouquet 13, Cappelliera 10, Cappelliere 6, Cesti Floreali 6, Fiori Città 1), *colore* (Mix Colori 17, Rose Rosse 7, Giallo 3, Bianco 3, Rose Bianche 3, Rosso 2, Rose Rosa 2, Pink 2, Rosa 1), *fiore* (Ortensie 7, Girasoli 3, Dalie 2), *occasione* (Festa Della Donna 6, Anniversario 6, Festa Della Mamma 4, Pasqua 3, Compleanno 3, Natale 2, Festa del Papà 2, Matrimonio 2, Congratulazioni 2, San Valentino, Laurea, Lauree, Nascita, Battesimo, Halloween, Proposte Di Matrimonio, Romantico, Sorprese), *campagna/merchandising* (DolciRientri 10, polaroid 10, oklastminute 3, Luxury Roses 2, Luxury of Love, abbinamento regalo, Champagne, Praline, Palloncino, Fiori e champagne), *sinonimi doppi* (Fiori Mix 5, Mix Fiori 5, Fiori Misti 2 = stesso concetto in 3 forme; Cappelliera/Cappelliere; Laurea/Lauree), refusi («bouqet»).
- Tag che replicano metafield: colore ↔ `custom.colore`, fiore ↔ `custom.fiori`, occasione ↔ `custom.occasione`, categoria ↔ `custom.modello`/productType. Coerenza parziale (v. B.3).

### D.2 Cake
- Tag per prodotto: min 0, mediana 4, max 8; 35 distinti; 1/57 senza tag (`_additional-price`).
- Famiglie: *workflow* («Approvato» 41, «novità» 21, «cakedesign» 22), *destinatario* («per lei» 22, «per lui» 19, Bambini 7, Adulti 2), *occasione* (Compleanni 22, Natale 7, San Valentino 3, 18Anni 3, Anniversari 2, Nascite 2, Lauree 2, Papà 2, Pasqua, Halloween, festadellamamma2025 4), *tipo* (Torta 9, Vintage 9, Torte 3, Cream Tart, Cake Design, Pan di Spagna, Frutta), *dieta* (Intolleranti 3), *tema* (animali 3, film 3), *altro* (Luxury, internazionali, aziende, festa, gala, oggi, personalizzabili).
- I tag **non** replicano i metafield (gusti, consegna) tranne «oggi» (1). «Approvato» sembra un flag editoriale usato per le collezioni **[non accertato]**.

---

## E. SEO e immagini

| | Flowers | Cake |
|---|---|---|
| `seo.title` compilato | 2/45 («Bouquet Purezza Eterea \| Fiori Bianchi Eleganti \| Deluxy Flowers» 64 car.; «103 Rose - Consegna a domicilio» 31) | 1/57 («Cheesecake Deliveru», refuso) |
| `seo.description` | 2/45 (152 e 382 car.) | 0/57 |
| `<title>` reso dal tema | `{titolo} – Deluxy Flowers` | `{titolo} – cakedesign` |
| meta description resa | primi ~160 car. della descrizione spogliata: «Fiori: girasoli Inclusi: biglietto scritto a mano e confezione regalo Consegna: …» | idem: «Torta: sacher Personalizza: farcitura e dettagli Consegna: dove vuoi tu nel mondo DESCRIZIONE La Sacher…» |
| Immagini/prodotto | min 0, mediana 1, max 6 (1 → 17; 2 → 11; 0 → 7 bozze; 3 → 7) | min 1, mediana 1, max 5 (1 → 41; 3 → 7; 2 → 6) |
| Alt text | 67/77 vuoti; 9 = titolo; 1 descrittivo SEO | 35/87 vuoti; 40 = titolo; il tema aggiunge in pagina «\| Funny cake con scritta personalizzata» |
| Lunghezza titolo | 13-47 caratteri (es. «Cappelliera Henri-Edmond Cross - The Pink Cloud») | 3-39, mediana ≈13 (nomi propri: «Diana», «Kai», «Susy») |
| Categoria Shopify | 36 Uncategorized, 7 assenti, 2 valorizzate | 44 Uncategorized, 13 «Food… > Cakes» |
| templateSuffix | sempre null | null tranne `cake_ai_maker_product` (1) |
| Vendor | Deluxy Flowers 29, Deluxy 15, Artisti Deluxy 1 | CakeDesignME 47, Deluxy 7, cakedesign 3 |

Conclusione: la meta description reale è **la prima riga della descrizione**; l'header `<ul>` è quindi anche il testo SEO di fatto. Il tema non usa `seo.title` in modo distinguibile (non verificato su un prodotto che lo abbia compilato: dei due, nessuno è stato scaricato) **[non accertato]**.

---

## F. Pagina viva (tema)

Tema: **Impulse 7.2.0** (Archetype) personalizzato, identico su entrambi (`Shopify.theme.schema_name: "Impulse"`). Pagine scaricate: Flowers 9 (bouquet-girasoli-1, cappelliera-rose-rosse-1, maxi-cesto-ortensie-rosa-e-rose, bouquet-beethoven, rose-nere-numero-a-scelta, orchidea-bianca, abbonamento-rose, dalie-colorate…, rosa-eterna-gialla); Cake 10 (sacher, torta-tre-cioccolati, letters, numbers-1, dubai-chocolate-cake, mario-cake, photo-memories-cake, red-velvet-rose-cake, sweet-degree, cake-ai-maker). Lo `/products/<handle>.json` pubblico restituisce `body_html` **identico** a `descriptionHtml` Admin (verificato su 3), stessi tag/opzioni/varianti/SKU, `requires_shipping=true`, `grams=0`, `taxable=false`.

### F.1 Ordine dei blocchi in pagina — Flowers (`bouquet-girasoli-1`)
1. Badge «Best Seller» (da `custom.best_value`; classe `.best-seller`).
2. Titolo (h1) + «Prezzo di listino».
3. Selettore opzioni a **radio button** (label = nome opzione). Accanto a «Dimensione» il link **«Guida alle Misure»** apre un popup con l'immagine di `custom.url_img_dimensione` — presente solo se `custom.guida_misure = SI` (verificato: il sorgente contiene `SIZE_BOUQUET.jpg`).
4. Quantità.
5. Blocco **«Seleziona la data di consegna»** + bottone «CAMBIA LA DATA» + calendario Semantic-UI (codice custom, jQuery). Nel sorgente una lista nascosta `<ul class="metaValue hide"><li data-id="{variantId}" data-value="N">` con i **giorni minimi per variante**: 0 su bouquet/abbonamenti/dalie; 1 su rose nere e rosa eterna; su cappelliera-rose-rosse `0,0,1,0` (solo L = 1); su maxi-cesto `2,0,2,0,2,0` (Rosse=2, Bianche=0). Il JS confronta la data scelta con oggi + N e scrive «Non disponibile per la data …». Questo valore è **per variante** e non coincide sempre con `prodotto.consegna` di prodotto (cappelliera-rose-rosse ha consegna=0 ma L=1): viene da un metafield di variante la cui chiave **non è nel campione [non accertato]**.
6. Bottone «Acquista» + «Personalizza con un Nostro Esperto».
7. **Riepilogo**: le 3 righe del primo `<ul>` della descrizione, ripetute sotto i bottoni (il tema le stampa due volte: una come riepilogo, una nella descrizione completa — meccanismo Liquid non visibile, presumibilmente split sul primo `</ul>` **[non accertato]**).
8. Descrizione completa in `product-block--tab` a scomparsa (`collapsible-content__inner rte`): i `<h6>` sono semplici titoli nel flusso, **non** tab/accordion separati.
9. Blocco fisso «SEI A UN PASSO DAL CONCLUDERE UN'ESPERIENZA SPECIALE — Data, orario e bigliettino alla pagina del carrello / Pagamento sicuro / Supporto 24/7».
10. «Potrebbero piacerti anche», sezione «MIGLIORI FIORI PER STUPIRE» (5 accordion fissi: DISEGNATI IN ITALIA, SPEDIZIONE, PACKAGING E BIGLIETTO, GARANZIA DI QUALITÀ, AL TUO SERVIZIO), «Visualizzati di recente», «DICONO DI NOI» (recensioni statiche).

Non c'è in pagina prodotto: selettore città/provincia, campo dedica/biglietto (la nota è nel cart drawer: `textarea name="note"` «Nota sull'ordine»), scelta orario. `custom._nations_availability`, `partner_*`, `minimo_orario`, `occasione`, `fiori`, `colore`, `modello`, `data` **non compaiono** nel sorgente della pagina prodotto. App rilevate: BCPO (opzioni virtuali «Polaroid 1-4» upload file / «Link Foto»), Tabs Studio, VO Product Options, Forms, Infinite scroll, iubenda, Enorm gallery. Judge.me è presente solo come metafield.

### F.2 Ordine dei blocchi — Cake (`sacher`, `mario-cake`…)
1. Badge «Best Seller» (`custom.best_seller`).
2. Titolo + prezzo + «Imposte incluse».
3. **Riepilogo** delle 3 righe del primo `<ul>` (qui sopra le opzioni).
4. Riga fissa «Consegna €10 / Gratuita con €100 di spesa».
5. Quantità + radio **Porzioni**.
6. Blocco data con bottoni **Oggi / Domani / Altra data** (calendario). Campo nascosto `required_field` (`.reqdate`): la data è obbligatoria. Lista `metaValue` per variante: sacher `"", "", "", 1, 2, 2, 2, 2, 2, 3, 3` (6-10 porzioni oggi, 15 = 1 giorno, 20-50 = 2, 75-100 = 3); mario-cake `3,3,3,3,"",3,3,5,5` (un valore mancante su 30 porzioni: incoerenza); letters `1,1,1,2,2,2,2,2,5,5`; sweet-degree tutti 3. Il JS nasconde «Oggi» se il valore è 1 e «Oggi»+«Domani» se >1. Anche qui è un dato **per variante**, cresce con le porzioni e differisce da `prodotto.consegna` (sacher = 0) **[chiave non accertata]**.
7. Configuratore **«ECCO LA TUA TORTA»** (EasyOptions «EZ Product Options» + bottone `#ai_cake_button` «Crea la tua torta»): step «Numero di porzioni / Base / Forma / Farcitura / Ingredienti / Topping», **identici su tutte le 8 pagine** (non dipendono dal prodotto né dai metafield `cyc_*`, che non compaiono nel sorgente). I sovrapprezzi si sommano tramite il prodotto nascosto `_additional-price` (1 €) e la mappa SKU→variante.
8. «Aggiungi al carrello», «Crea la tua torta», «Personalizza con un Nostro Esperto» (modale WhatsApp).
9. Line-item property nascoste `field-scritta`, `field-noofchoco` (numero in cioccolato), `field-noofcand` (candeline), mostrate/nascoste dal JS in base al bottone data scelto (con «Domani»: scritta + candeline, non il numero di cioccolato).
10. Descrizione completa a scomparsa (`collapsible-content__inner product rte`).
11. «Potrebbero piacerti anche», FAQ fisse «DOMANDE FREQUENTI» (5: come creare la torta, tempo minimo di preavviso «48-72 ore», modifica/annulla, esigenze nutrizionali, dove/quando avviene la consegna), «DICONO DI NOI», «Visualizzati di recente».

App rilevate: EasyOptions, Globo also-bought, Tipo related products, Klaviyo, Microsoft Clarity, Tabs Studio, Forms, widget `deluxy-messaging.vercel.app/widget.js`, younet. `custom.gusti`, `custom.data`, `nations_availability`, `partner_*` non compaiono nella pagina prodotto.

### F.3 Differenze Flowers vs Cake in pagina
- Flowers: guida misure a popup (metafield), niente scelta Oggi/Domani a bottoni (solo calendario), niente configuratore, riepilogo sotto i bottoni, blocco «prossimi passaggi» che rimanda la dedica al carrello.
- Cake: bottoni Oggi/Domani/Altra data, riga costo consegna, configuratore a step + campi scritta/numero/candeline, FAQ, riepilogo sopra le opzioni, modale esperto.
- Comune: badge best seller da metafield boolean; descrizione unica con `<h6>`; giorni minimi per variante; nessun rendering dei metafield descrittivi; meta description = inizio descrizione.

---

## G. Conclusioni per il modulo «Nuovo prodotto»

### G.1 Flowers — campi minimi

| Campo da compilare | Dove finisce |
|---|---|
| Famiglia (Bouquet / Rose a numero / Cappelliera / Cesto / Fiori d'Arte / Originali / Pianta / Rosa Eterna / Abbonamento / Corona) | `productType` (mappa: Fiori, Rose, Cappelliere, Cesti Floreali, Fiori d'Arte, Originali Deluxy, Piante, Rosa Eterna, Abbonamento Fiori) + `custom.modello` + etichetta riga 1 del `<ul>` + tag categoria (Fiori, Bouquet/Cappelliera/Cesti Floreali) + template Dimensioni/opzioni |
| Titolo | `title`; alt immagini; `<title>` |
| Sottotitolo riga 1 (es. «girasoli», «rose rosse», «ispirati a "…"») | `<li><b>{famiglia}</b>: …` |
| Consegna a casa? (sì → «a casa o dove vuoi tu», no → «dove vuoi tu») | riga 3 del `<ul>` (opzionale, default «dove vuoi tu») |
| Testo «Dettagli Prodotto» (1-2 paragrafi) | `<h6>Dettagli Prodotto</h6>` |
| Testo «Significato» (1-3 paragrafi; per Fiori d'Arte PALETTE/ANIMA/OPERA/COMPOSIZIONE) | `<h6>Significato</h6>` (il metafield `custom.significato` esiste ma è vuoto ovunque: non usarlo, o riempirlo in più) |
| Fiori (multi) | `custom.fiori` + tag fiore (Ortensie, Girasoli, Dalie, Rose) |
| Colore dominante | `custom.colore` + tag colore (Mix → «Mix Colori»; Rosso → «Rosso» e «Rose Rosse» se rose) |
| Occasioni (multi) | `custom.occasione` + lista «Perfetto per» (plurale) + tag occasione |
| Taglie/opzione con prezzi (da template famiglia; seconda opzione facoltativa: Vaso, Polaroid, Colore rose, Champagne, Lucine) | `options` + `variants` (prezzi tabellati per famiglia, SKU generato `XXXXXX-n`, `compareAtPrice` vuoto) + blocco `<h6>Dimensioni</h6>` generato dalla tabella famiglia; suffisso «(foto)» sulla taglia della foto |
| Giorni minimi (0/1/2) + eventuale eccezione per variante | `prodotto.consegna` + `custom.data` (`["Oggi","Domani"]`/`["Domani"]`/`["Su prenotazione"]` derivato) + metafield di variante **[chiave da accertare]** |
| Partner | `custom.partner_id`, `custom.partner_address`, `custom.minimo_orario` (8; 7 per partner 128), `custom._nations_availability` (valore standard 14 province), `custom.is_unique=false`, `custom.not_physical=false` |
| Best seller (flag) | `custom.best_value` |
| Guida misure (flag) | `custom.guida_misure=SI` + `custom.url_img_dimensione` (SIZE_BOUQUET / SIZE_CAPPELLIERE) |
| Polaroid inclusa (n.) | opzione BCPO (`bcpo.bcpo_data` è scritto dall'app: **non replicabile via Admin API in modo sicuro [non accertato]**) + tag «polaroid» |
| Immagini (≥1) con alt = titolo | `images` |
| SEO (facoltativo) | `seo.title`/`seo.description`; oggi di fatto assenti |

Boilerplate da template Flowers: riga «Inclusi», riga «Consegna», blocco «Come Funziona» (frase + 4 punti; sugli Originali lista componenti), nota «Ogni nostra rosa…» (rose), nota «I fiori freschi sono soggetti a disponibilità…» (Fiori d'Arte/cappelliere miste), tabella Dimensioni per famiglia, «Ideale per:» + lista, blocco «Cura» per piante, «Cosa include» per abbonamenti.

### G.2 Cake — campi minimi

| Campo | Dove finisce |
|---|---|
| Famiglia (Torta classica / Cake design / Vintage / Cream Tart / Summer / Torta+cupcake / Photo cake) | `productType` (CDM Torte, Cake Design, CDM Adulti/Bambini/Laurea/Romantiche/Nascite e Battesimi/Matrimoni/Halloween, CDM Cream Tart, CDM Domani, CDM FunnyCake) + etichetta riga 1 («Torta», «Torta di alta pasticceria», «Cream Tart», «Vintage Cake»…) + template sezioni |
| Titolo | `title`; alt immagini |
| Sottotitolo riga 1 («Cake Design a tema Super Mario», «sacher», «con la tua lettera») | `<li><b>{famiglia}</b>: …` |
| Giorni minimi (0-3) | `prodotto.consegna` + `custom.data` (0→Oggi, 1→Domani, 2→48 ore, 3→72 ore) + riga 2 «Personalizzabile: da N giorni» (cake design) + giorni per variante (crescenti con le porzioni: 75/100 porzioni tipicamente +2 giorni) **[chiave variante da accertare]** |
| Cosa si personalizza (checklist: Forma, Base, Piani, Farcitura/Confettura, Ingredienti, Topping, Scritta [e foto], Candeline/Numero e colore della candelina, Palette) | riga 2 «Personalizza: X e dettagli» (classiche) + lista in `<h6>Personalizzazione</h6>` |
| Testo descrizione (1 paragrafo) + tipo nota foto (creatività artista / disponibilità artista / pasticcere) | `<h6>Dettagli</h6>` (o DESCRIZIONE: oggi 3 forme, unificare) |
| Ingredienti (lista) + allergeni (lista) + note (tracce frutta a guscio / materiali non edibili) | `<h6>Ingredienti e Allergeni</h6>` |
| Gusti (multi) | `custom.gusti` (oggi solo 22/57) |
| Porzioni disponibili (set da template) + €/porzione (o listino per fascia) | `options` Porzioni + `variants` (prezzo = porzioni × €/porzione arrotondato, SKU `XXXXXX{porzioni}` o `XXXXXX-n`, `compareAtPrice` vuoto) |
| Con cupcake? | titolo «… e cupcake», nota corsiva, voce «Numero delle porzioni (1 cupcake per ogni persona)», opzione «Porzioni e cupcake» (1 caso) |
| Campo obbligatorio (lettera/numero/foto) | `custom.campo_obbligatorio=true` |
| Destinatario (per lei / per lui / Bambini / Adulti), occasioni (Compleanni, Natale, San Valentino, Lauree, Nascite…), tema (animali, film), dieta (Intolleranti) | solo **tag** (nessun metafield) |
| Stato editoriale | tag «Approvato», «novità», «cakedesign» **[semantica non accertata]** |
| Partner | `custom.partner_id` (223), `custom.partner_address`, `custom.minimo_orario` (8), `custom.nations_availability` (senza underscore!), `custom.is_unique=false`, `custom.not_physical=false` |
| Best seller | `custom.best_seller` |
| Immagini (≥1) alt = titolo | `images` |

Boilerplate da template Cake: riga «Consegna: dove vuoi tu nel mondo», frase «Con Cakedesign.me puoi personalizzare… CREA LA TUA TORTA.» (non sulle classiche), «Potrai personalizzare:», «Potrai trovare:», nota foto illustrativa, «La torta potrebbe contenere materiali non edibili.», «Possibile presenza di frutta a guscio.», tabella «Pesi e Misure» (11 righe, omessa per photo cake), «Conservazione» (3 righe), link `/collections/vintagecake` sui Vintage, «Gusto base: crema chantilly alla vaniglia» sui Vintage.

### G.3 Differenze che richiedono campi diversi
- Flowers ha **taglie nominali + seconda opzione** e prezzi a scaglioni per famiglia; Cake ha **porzioni × €/porzione** e una sola opzione.
- Flowers scrive **Significato** e **Dimensioni** (fiori per taglia); Cake scrive **Ingredienti/Allergeni**, **Personalizzazione**, **Pesi/Conservazione** fissi.
- Flowers modella fiori/colore/occasione in metafield con choices; Cake modella solo gusti in metafield e tutto il resto in tag.
- Flowers: `custom.data` è una **lista** (`["Oggi","Domani"]`); Cake: **stringa** (`72 ore`). Flowers: `custom._nations_availability` (underscore, definito); Cake: `custom.nations_availability` (senza, non definito). Flowers: `custom.best_value`; Cake: `custom.best_seller`. Il modulo deve avere una mappa per negozio.
- Cake: giorni minimi **per variante** crescenti con le porzioni; Flowers: quasi sempre uguali a `prodotto.consegna`, con eccezioni per colore/taglia.
- Cake: flag `campo_obbligatorio` e nota cupcake; Flowers: guida misure e polaroid (BCPO).

### G.4 Incoerenze trovate (cosa il modulo deve impedire)
1. **Bozze pubblicate** (Flowers 7/45): duplicati con suffisso `-1`, 0 immagini, 0 tag, solo metafield Judge.me, creati in blocco il 2026-07-07 (`cento-rose-bianche-1`, `abbonamento-classic`, `luxury-red-roses-bouquet` con descrizione placeholder e tipo «Dolci»). → Bloccare pubblicazione senza immagine, senza tag, senza partner/consegna; rifiutare placeholder.
2. **Descrizione contro metafield**: Cake «da 7 giorni» in descrizione vs `consegna=3` (3d-cat-cake, labubu-cak), «da 2 giorni» vs 1 (lyric-cake), `custom.data=72 ore` vs `consegna=0` (2 vegan). Flowers: lista «Ideale per» mai uguale a `custom.occasione`. → Generare la riga «Personalizzabile: da N giorni», `custom.data` e la lista occasioni **dalla stessa sorgente**.
3. **Vocabolari doppi**: h6 «DESCRIZIONE/Descrizione/Dettagli/Dettagli Prodotto», «Perfetto per/Regala con Deluxy/Ideale per», «Personalizza/Personalizzabile/Crea la tua torta», `<b>` vs `<strong>`, tag «Fiori Mix/Mix Fiori/Fiori Misti», «Cappelliera/Cappelliere», «Laurea/Lauree», «Pink/Rosa», due formulazioni della frase CREA LA TUA TORTA e della nota foto. → Testi fissi nel template, un solo vocabolario per negozio.
4. **Markup rotto**: 4 prodotti Cake con contenuto in `<h6>`; `<h6></h6>` vuoti (13 su Flowers); stili inline; classi Word. → Generare HTML pulito, mai da editor WYSIWYG.
5. **Varianti/prezzi**: ordine varianti non crescente (letters-1, hero/lila-e-cupcake), prezzi non monotoni (letters-1), duplicati (tiramisù vegan 8=10 porzioni), salto di €/porzione (mery-e-cupcake), tabella «Pesi e Misure» a 11 righe con 9 varianti. → Ordinare le varianti, calcolare i prezzi da listino, validare monotonia, generare la tabella pesi dalle porzioni scelte (o tenerla fissa consapevolmente).
6. **Metafield**: `_nations_availability` in 2 ordinamenti + 1 valore errato («Italia-Italia…» su 103-rose); `url_img_dimensione` che punta a «Significato_Rose_Bouquet» (3) o al CDN di un altro negozio (2); residui `cyc_*`/`design_your_cake_*`/`occasione=["Oggi"]` su Cake; valori con spazi finali («Oggi », «1 »). → Scrivere sempre i valori canonici; non scrivere le chiavi residue.
7. **Titoli/handle**: handle troncati (`spring-cak`, `labubu-cak`), handle che non corrispondono al titolo (`tiramisu-senza-glutine-1` = «Torta della Nonna Vegan», `crostata-di-frutta-senza-glutine` = «Crostata di Frutta Vegan»), refusi («froma di gatto», «bouqet», «Deliveru»). → Handle generato dal titolo, controllo ortografico minimo.
8. **SEO/immagini**: alt vuoti (87% Flowers), `seo.*` vuoti, categoria Shopify quasi mai impostata. → Alt = titolo di default; `seo.description` = frase breve (non l'header `<ul>`).
9. **Tipo vs modello**: una cappelliera può avere `productType` Cappelliere, Fiori d'Arte o Originali Deluxy. → Il tipo è la «collezione commerciale», il modello la forma: due campi distinti, entrambi obbligatori.

### G.5 Cose NON accertate (da verificare con l'Admin API o il codice tema)
- Chiave/namespace del **metafield di variante** con i giorni minimi (lista `metaValue` del tema).
- Uso reale di `custom.data`, `custom.occasione`, `custom.fiori`, `custom.colore`, `custom.modello`, `custom.gusti` e dei tag «Approvato/novità/cakedesign»: presumibilmente collezioni automatiche/filtri/ricerca (es. menu «torte-per-oggi»); non visibili in pagina prodotto.
- Chi legge `partner_id`, `partner_address`, `nations_availability`, `minimo_orario`, `is_unique`, `not_physical` (app Deluxy di smistamento/checkout, plausibile ma non verificato).
- Come il tema estrae il riepilogo a 3 righe dalla descrizione (Liquid non visibile).
- Origine degli SKU a 6 lettere (app o script).
- Se `bcpo.bcpo_data` può essere scritto via Admin API senza rompere l'app BCPO.
- Comportamento del tema con `seo.title` compilato (i 2 prodotti che lo hanno non sono stati scaricati).
- Variazione per **partner** su Cake: nel campione c'è un solo pasticcere (223).
