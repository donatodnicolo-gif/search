# Verifica SKU sui prodotti pubblicati — 06/09/2026

Letto direttamente dai tre negozi Shopify con i token dell'app (`scripts/verifica-sku.ts`, solo lettura) e confrontato col catalogo di questa app. «Pubblicato» = `status: ACTIVE` sul negozio.

## Riepilogo

| Negozio | Prodotti attivi | Varianti | Varianti senza SKU | Prodotti con varianti senza SKU | A catalogo qui (per id) | Con più di 10 varianti (l'import ne legge 10) |
|---|---:|---:|---:|---:|---:|---:|
| Gifts | 893 | 3943 | 190 | 40 | 559 | 50 (412 varianti oltre la decima) |
| Flowers | 269 | 1178 | 124 | 40 | 269 | 1 (2 varianti oltre la decima) |
| Cake | 321 | 3021 | 3 | 1 | 321 | 34 (35 varianti oltre la decima) |
| **Totale** | **1483** | **8142** | **317** | **81** | | |

Note di lettura:

- Su Gifts 18 prodotti hanno più di 20 varianti (torte di laurea, «Selezione Mignon»…): riletti per intero, i loro conteggi qui sotto sono completi.
- Nessuno SKU è duplicato fra prodotti diversi dello stesso negozio.
- Su Gifts 334 prodotti attivi non hanno una scheda con quell'id qui: 312 di loro sono **lo stesso prodotto venduto anche su Flowers (231) o Cake (74)**, e la scheda porta l'id dell'altro negozio (una scheda = un prodotto, anche se sta su due negozi); 22 non hanno una scheda con lo stesso handle.
- Il catalogo qui legge **10 varianti per prodotto** (`variants(first: 10)` nell'import): per i prodotti con più varianti quelle oltre la decima non esistono qui. Da allargare se serve lo SKU di ogni variante.

## Da correggere sul negozio: prodotti attivi con varianti senza SKU

### Gifts (deluxygifts.myshopify.com) — 40 prodotti

| Prodotto | Handle | Varianti senza SKU / totali | Varianti scoperte |
|---|---|---:|---|
| Torta, Rose e Bollicine | `torta-rose-e-bollicine` | 12 / 30 | Roma - Grué / Rosse / Champagne Brut · Roma - Grué / Rosse / Spumante Dolce · Roma - Grué / Bianche / Champagne Brut · Roma - Grué / Bianche / Spumante Dolce · Roma - Grué / Rosa / Champagne Brut · Roma - Grué / Rosa / Spumante Dolce · Firenze - Cheesecake / Rosse / Champagne Brut · Firenze - Cheesecake / Rosse / Spumante Dolce · Firenze - Cheesecake / Bianche / Champagne Brut · Firenze - Cheesecake / Bianche / Spumante Dolce · Firenze - Cheesecake / Rosa / Champagne Brut · Firenze - Cheesecake / Rosa / Spumante Dolce |
| Bracciale Mongolfiera in Oro (Diamanti Rosato) | `bracciale-mongolfiera-in-oro-e-diamanti-rosato` | 1 / 1 | Default Title |
| Torta Love Me Deluxe | `torta-love-me-deluxe` | 27 / 27 | 20 / Chantilly · 20 / Crema pasticcera · 20 / Cioccolato · 30 / Chantilly · 30 / Crema pasticcera · 30 / Cioccolato · 40 / Chantilly · 40 / Crema pasticcera · 40 / Cioccolato · 50 / Chantilly · 50 / Crema pasticcera · 50 / Cioccolato · 60 / Chantilly · 60 / Crema pasticcera · 60 / Cioccolato · 80 / Chantilly · 80 / Crema pasticcera · 80 / Cioccolato · 100 / Chantilly · 100 / Crema pasticcera · 100 / Cioccolato · 150 / Chantilly · 150 / Crema pasticcera · 150 / Cioccolato · 200 / Chantilly · 200 / Crema pasticcera · 200 / Cioccolato |
| Servizio NCC | `servizio-ncc` | 3 / 3 | Milano · Roma · Firenze |
| To Share | `copy-of-omakase` | 5 / 14 | Edamame spicy · Edamame lime · Harumaki verdure · Harumaki pollo e verdure · Harumaki gamberi e verdure |
| Edamame | `edamame` | 2 / 3 | Spicy · Lime |
| Selezione Mignon | `selezione-mignon` | 5 / 48 | 75 / Mix · 175 / Mix · 200 / Mix · 225 / Mix · 250 / Mix |
| Lezione privata con chef | `lezione-privata-con-chef` | 5 / 5 | Pasta Fresca · Vegetariano · Tradizionale Romano · Tradizionale Milanese · Pesce Gourmet |
| Sole Mio - Cream Tart, Girasoli e Spumante | `sole-mio` | 12 / 12 | Medio / 8 · Medio / 12 · Medio / 16 · Medio / 20 · Grande / 8 · Grande / 12 · Grande / 16 · Grande / 20 · Luxury / 8 · Luxury / 12 · Luxury / 16 · Luxury / 20 |
| Cappelliera Rose Laurea (colore a scelta) | `cappelliera-rose-laurea-colore-a-scelta` | 12 / 45 | Bianco / M / No grazie · Bianco / L / No grazie · Blu / M / No grazie · Blu / L / No grazie · Giallo / M / No grazie · Giallo / L / No grazie · Rosa / M / No grazie · Rosa / L / No grazie · Arancione / M / No grazie · Arancione / L / No grazie · Mix Colori / M / No grazie · Mix Colori / L / No grazie |
| Van Gogh - Notte Stellata | `van-gogh-notte-stellata` | 1 / 5 | Medio |
| Monet - Giardino a Giverny | `monet-giardino-a-giverny` | 1 / 5 | Medio |
| Hokusai - La Grande Onda di Kanagawa | `hokusai-la-grande-onda-di-kanagawa` | 1 / 5 | Medio |
| Matisse - Finestra Aperta a Collioure | `matisse-finestra-aperta-a-collioure` | 1 / 5 | Medio |
| Botticelli - Nascita di Venere | `botticelli-nascita-di-venere` | 1 / 5 | Medio |
| Leonardo - Gioconda | `leonardo-gioconda` | 1 / 5 | Medio |
| MAXI Bouquet Rose Dolce Metà | `maxi-bouquet-rose-dolce-meta` | 6 / 12 | 50 / Rosa e Bianche · 100 / Rosa e Bianche · 150 / Rosa e Bianche · 200 / Rosa e Bianche · 250 / Rosa e Bianche · 300 / Rosa e Bianche |
| Picasso - Maternità | `picasso-maternita` | 1 / 5 | Medio |
| House Party Kids - Torta, cupcake e palloncini | `house-party-compleanno-bambini-con-torta-cupcake-e-palloncini` | 4 / 8 | Classic (girl) · Premium (girl) · Luxury (girl) · Eteneral (girl) |
| Cerchio Palloncini | `cerchio-palloncini` | 1 / 4 | Cerchio di Palloncini |
| Bouquet Bach | `bouquet-bach` | 5 / 10 | Medio-Grande / Si · Grande / Si · Luxury / Si · Maxi / Si · Dream / Si |
| Bouquet Einaudi | `bouquet-einaudi` | 5 / 10 | Medio-Grande / Si · Grande / Si · Luxury / Si · Maxi / Si · Dream / Si |
| Bouquet Mozart | `bouquet-mozart` | 5 / 10 | Medio-Grande / Si · Grande / Si · Luxury / Si · Maxi / Si · Dream / Si |
| Bouquet Debussy | `bouquet-debussy` | 5 / 10 | Medio-Grande / Si · Grande / Si · Luxury / Si · Maxi / Si · Dream / Si |
| Bouquet Chopin | `bouquet-chopin` | 5 / 10 | Medio-Grande / Si · Grande / Si · Luxury / Si · Maxi / Si · Dream / Si |
| Bouquet Tchaikovsky | `bouquet-tchaikovsky` | 5 / 10 | Medio-Grande / Si · Grande / Si · Luxury / Si · Maxi / Si · Dream / Si |
| Bouquet Puccini | `bouquet-puccini` | 5 / 10 | Medio-Grande / Si · Grande / Si · Luxury / Si · Maxi / Si · Dream / Si |
| Bouquet Rossini | `bouquet-rossini` | 5 / 10 | Medio-Grande / Si · Grande / Si · Luxury / Si · Maxi / Si · Dream / Si |
| Bouquet Paganini | `bouquet-paganini` | 5 / 10 | Medio-Grande / Si · Grande / Si · Luxury / Si · Maxi / Si · Dream / Si |
| Bouquet Schubert | `bouquet-schubert` | 5 / 10 | Medio-Grande / Si · Grande / Si · Luxury / Si · Maxi / Si · Dream / Si |
| Bouquet Morricone | `bouquet-morricone` | 5 / 10 | Medio-Grande / Si · Grande / Si · Luxury / Si · Maxi / Si · Dream / Si |
| Bouquet Beethoven | `bouquet-beethoven` | 5 / 10 | Medio-Grande / Si · Grande / Si · Luxury / Si · Maxi / Si · Dream / Si |
| Bouquet Verdi | `bouquet-verdi` | 5 / 10 | Medio-Grande / Si · Grande / Si · Luxury / Si · Maxi / Si · Dream / Si |
| MAXI Cesto Ortensie Azzurre e Rose | `maxi-cesto-ortensie-azzurre-e-rose` | 3 / 6 | Maxi / Bianche · Dream / Bianche · Mega Dream / Bianche |
| MAXI Cesto Ortensie Bianche e Rose | `maxi-cesto-ortensie-bianche-e-rose` | 3 / 6 | Maxi / Rosa · Dream / Rosa · Mega Dream / Rosa |
| MAXI Cesto Ortensie Rosa e Rose | `maxi-cesto-ortensie-rosa-e-rose` | 3 / 6 | Maxi / Bianche · Dream / Bianche · Mega Dream / Bianche |
| Telegramma Romantico e Polaroid | `telegramma-romantico-e-polaroid` | 2 / 3 | Rosa · Bianca |
| Cappelliera Henri-Edmond Cross - The Pink Cloud | `cappelliera-henri-edmond-cross-the-pink-cloud` | 4 / 8 | S / Si · M / Si · L (foto) / Si · XL / Si |
| Cappelliera Botticelli- Nascita di Venere | `cappelliera-botticelli-nascita-di-venere` | 4 / 8 | S / Si · M / Si · L (foto) / Si · XL / Si |
| Cappelliera Munch - L'Urlo | `cappelliera-munch-lurlo` | 4 / 8 | S / Si · M / Si · L (foto) / Si · XL / Si |

### Flowers (fb72b1-2.myshopify.com) — 40 prodotti

| Prodotto | Handle | Varianti senza SKU / totali | Varianti scoperte |
|---|---|---:|---|
| 103 Luxury Roses - Maxi Bouquet | `103-rose` | 1 / 1 | Default Title |
| Van Gogh - Notte Stellata | `van-gogh-notte-stellata` | 1 / 6 | Dream |
| Monet - Giardino a Giverny | `monet-giardino-a-giverny` | 1 / 6 | Dream |
| Hokusai - La Grande Onda di Kanagawa | `hokusai-la-grande-onda-di-kanagawa` | 1 / 6 | Dream |
| Matisse - Finestra Aperta a Collioure | `matisse-finestra-aperta-a-collioure` | 1 / 6 | Dream |
| Botticelli - Nascita di Venere | `botticelli-nascita-di-venere` | 1 / 6 | Dream |
| Dalì - La persistenza della memoria | `dali-la-persistenza-della-memoria` | 1 / 6 | Dream |
| Frida - Rosso Ribelle | `frida-rosso-ribelle` | 1 / 6 | Dream |
| Munch - L'Urlo | `munch-lurlo` | 1 / 6 | Dream |
| Leonardo - Gioconda | `leonardo-gioconda` | 1 / 6 | Dream |
| Klimt - Il Bacio | `klimt-il-bacio` | 1 / 6 | Dream |
| Magritte - Les Amants | `magritte-les-amants` | 1 / 6 | Dream |
| Corona Funebre | `corona-funebre` | 6 / 9 | M / Rosa · M / Blu · L / Rosa · L / Blu · XL / Rosa · XL / Blu |
| MAXI Bouquet Rose Dolce Metà | `maxi-bouquet-rose-dolce-meta` | 6 / 12 | 50 / Rosa e Bianche · 100 / Rosa e Bianche · 150 / Rosa e Bianche · 200 / Rosa e Bianche · 250 / Rosa e Bianche · 300 / Rosa e Bianche |
| Picasso - Maternità | `picasso-maternita` | 1 / 6 | Dream |
| 007 | `007` | 1 / 6 | Dream |
| Bouquet - Moulin Rouge | `bouquet-moulin-rouge` | 1 / 6 | Dream |
| Bouquet - Grande Gatsby | `bouquet-grande-gatsby-1` | 1 / 6 | Dream |
| Bouquet - Red Carpet | `bouquet-red-carpet` | 1 / 6 | Dream |
| Bouquet Vivaldi | `bouquet-vivaldi` | 6 / 10 | Medio-Grande / No · Grande / No · Luxury / No · Maxi / No · Dream / No · Dream / Si |
| Bouquet Bach | `bouquet-bach` | 5 / 10 | Medio-Grande / Si · Grande / Si · Luxury / Si · Maxi / Si · Dream / Si |
| Bouquet Einaudi | `bouquet-einaudi` | 5 / 10 | Medio-Grande / Si · Grande / Si · Luxury / Si · Maxi / Si · Dream / Si |
| Bouquet Mozart | `bouquet-mozart` | 5 / 10 | Medio-Grande / Si · Grande / Si · Luxury / Si · Maxi / Si · Dream / Si |
| Bouquet Debussy | `bouquet-debussy` | 5 / 10 | Medio-Grande / Si · Grande / Si · Luxury / Si · Maxi / Si · Dream / Si |
| Bouquet Chopin | `bouquet-chopin` | 5 / 10 | Medio-Grande / Si · Grande / Si · Luxury / Si · Maxi / Si · Dream / Si |
| Bouquet Tchaikovsky | `bouquet-tchaikovsky` | 5 / 10 | Medio-Grande / Si · Grande / Si · Luxury / Si · Maxi / Si · Dream / Si |
| Bouquet Puccini | `bouquet-puccini` | 5 / 10 | Medio-Grande / Si · Grande / Si · Luxury / Si · Maxi / Si · Dream / Si |
| Bouquet Rossini | `bouquet-rossini` | 5 / 10 | Medio-Grande / Si · Grande / Si · Luxury / Si · Maxi / Si · Dream / Si |
| Bouquet Paganini | `bouquet-paganini` | 5 / 10 | Medio-Grande / Si · Grande / Si · Luxury / Si · Maxi / Si · Dream / Si |
| Bouquet Schubert | `bouquet-schubert` | 5 / 10 | Medio-Grande / Si · Grande / Si · Luxury / Si · Maxi / Si · Dream / Si |
| Bouquet Wagner | `bouquet-wagner` | 5 / 10 | Medio-Grande / Si · Grande / Si · Luxury / Si · Maxi / Si · Dream / Si |
| Bouquet Morricone | `bouquet-morricone` | 5 / 10 | Medio-Grande / Si · Grande / Si · Luxury / Si · Maxi / Si · Dream / Si |
| Bouquet Beethoven | `bouquet-beethoven` | 5 / 10 | Medio-Grande / Si · Grande / Si · Luxury / Si · Maxi / Si · Dream / Si |
| MAXI Cesto Ortensie Azzurre e Rose | `maxi-cesto-ortensie-azzurre-e-rose` | 3 / 6 | Maxi / Bianche · Dream / Bianche · Mega Dream / Bianche |
| MAXI Cesto Ortensie Bianche e Rose | `maxi-cesto-ortensie-bianche-e-rose` | 3 / 6 | Maxi / Rosa · Dream / Rosa · Mega Dream / Rosa |
| MAXI Cesto Ortensie Rosa e Rose | `maxi-cesto-ortensie-rosa-e-rose` | 3 / 6 | Maxi / Bianche · Dream / Bianche · Mega Dream / Bianche |
| Dalie Colorate e Praline d'Autore (Champagne) | `dalie-colorate-e-praline-dautore-champagne` | 3 / 6 | Classic / Si · Premium / Si · Luxury / Si |
| Cappelliera Henri-Edmond Cross - The Pink Cloud | `cappelliera-henri-edmond-cross-the-pink-cloud` | 4 / 8 | S / Si · M / Si · L (foto) / Si · XL / Si |
| Cappelliera Botticelli- Nascita di Venere | `cappelliera-botticelli-nascita-di-venere` | 4 / 8 | S / Si · M / Si · L (foto) / Si · XL / Si |
| Cappelliera Munch - L'Urlo | `cappelliera-munch-lurlo` | 4 / 8 | S / No · M / No · L (foto) / No · XL / No |

### Cake (cakedesign-5921.myshopify.com) — 1 prodotti

| Prodotto | Handle | Varianti senza SKU / totali | Varianti scoperte |
|---|---|---:|---|
| Letters | `letters-1` | 3 / 12 | 60 · 80 · 90 |

## A catalogo qui ma con codice che non combacia con gli SKU del negozio

Il codice della scheda è nato dall'handle (l'import lo fa quando le varianti non hanno una base comune) e le varianti qui non coprono tutti gli SKU del negozio. Non è un errore del negozio: è dove il catalogo di questa app non rispecchia lo SKU vero.

### Gifts — 29 schede

| Codice qui | Prodotto | SKU sul negozio | SKU delle varianti qui |
|---|---|---|---|
| `TORTA-ROSE-E-BOLLICINE` | Torta, Rose e Bollicine | SEEM506, SEEM507, SEEM504, SEEM505, SEEM508, SEEM509… | ∅, ∅ |
| `SUSHI-PROTEIN-BOX` | Sushi - Protein Box | rht, AFDEe231, hrj | rht, hrj |
| `COPY-OF-OMAKASE` | To Share | dgwr, heth, fefv, nyac, cwrd, dasFQF… | dgwr, heth, ∅, ∅, fefv, nyac… |
| `NIGIRI` | Nigiri | juyv, oiuuty, yterx, kiuyc, jkhbg, khgvyt… | juyv, oiuuty |
| `CLASSIC-ROLLS` | Classic Rolls | scwvf, sdv, jkh, sqwd, cfty | jkh |
| `TEMPURA-ROLLS` | Tempura Rolls | Lhui7, Lhui75, oiiydb, fgfdb, uxsvdyq, ncidufu… | Lhui75, Lhui7 |
| `CROSTATA-AI-FRUTTI-DI-BO` | Crostata ai frutti di bosco | rty-1, rty-2, rty-3, rty-4, rty-5, rty-6… | rty-3, rty-1, rty-2, LRMEPI1, LRMEPI2 |
| `SELEZIONE-MIGNON` | Selezione Mignon | rfgtjr-15, e223, a334g, arhdv-1, rfgtjr-24, a4fw3… | a334g, arhdv-3, rfgtjr-15, rfgtjr-33222, a4fw3, arhdv-1… |
| `TORTA-BUON-ANNIVERSARIO` | Torta Buon Anniversario | funnyc20, funnyc22, funnyc24, funnyc25, funnyc26, funnyc27… | funnyc20, funnyc22 |
| `SACHER-GRUE` | Sacher | BNROOU1, BNROOU2, BNROOU3 | ∅, ∅, BNROOU3 |
| `MACARONS-CLASSICI-GRUE` | Macarons Classici - Grué | BWYQKG1, BWYQKG2, BWYQKG3 | BWYQKG1, BWYQKG2 |
| `PREGIATE-PRALINE-GRUE` | Pregiate Praline - Grué | EJSPEL1, EJSPEL2, ndnvofv | EJSPEL1, ndnvofv |
| `VHKCLJHI9-2` | Monoporzioni Assortite | vhkcljhi9 | ∅ |
| `FIORI-FRAGOLE-E-CHAMPAGN` | Fiori, Fragole e Champagne Rosé | DGMDEL-RS9, DGMDEL-RS25, DGMDEL-RS50, DGMDEL-RS101, DGMDEL-RR9, DGMDEL-RR25… | DGMDEL-RS9, DGMDEL-RR9 |
| `CROSTATA-AI-FRUTTI-DI-BO-6` | Crostata ai Frutti di Bosco | LRMEPI1, LRMEPI2, LRMEPI3, LRMEPI4, LRMEPI5, LRMEPI6… | ∅, ∅, LRMEPI3, LRMEPI4, LRMEPI5, LRMEPI6… |
| `STRAWBERRY-VINTAGE-CAKE` | Strawberry Vintage Cake | DCOGNV-10, DCOGNV-10a, DCOGNV-10b, DCOGNV-1, DCOGNV-1a, DCOGNV-1b… | DCOGNV-10a, DCOGNV-1a, DCOGNV-10, DCOGNV-10b, DCOGNV-1b |
| `TORTA-D-ORO` | Torta d'Oro | SUPDPY-1, SUPDPY-1a, SUPDPY-1b, SUPDPY-2, SUPDPY-2a, SUPDPY-2b… | SUPDPY-1a, SUPDPY-1b |
| `CAPRESE` | Caprese | UDWAYR-1, UDWAYR-2 | GBDERQ, UDWAYR-1 |
| `WCKAGN` | Torta e Bollicine | WCKAGN-1, WCKAGN-1a, WCKAGN-2, WCKAGN-2a, WCKAGN-3, WCKAGN-3a… | WCKAGN-3, WCKAGN-1, WCKAGN-2 |
| `4-CIOCCOLATI` | 4 Cioccolati | MOT310-1, MOT310-2, MOT310-3, MOT310-4, MOT310-5, MOT310-6… | MOT310-1, MOT310-3, MOT310-2, MOT310000-6, MOT3100001 |
| `SAINT-HONORE` | Saint Honoré | PIDGZO1, PIDGZO2, PIDGZO3 | PIDGZO1, PIDGZO2 |
| `XFKCKU3` | Pista Choco | xfkcku4-1, xfkcku4-2, xfkcku4-3, xfkcku4-4, xfkcku4-5, xfkcku4-6… | xfkcku3 |
| `TIRAMISU-PAC` | Tiramisù | xfkcku201, xfkcku202, xfkcku20-3, xfkcku20-4, xfkcku20-5, xfkcku20-6… | ∅, xfkcku202, xfkcku20-3, xfkcku20-4, xfkcku20-5, xfkcku20-6… |
| `ALSD10BT-2` | Piramide di Macarons (esclusiva Deluxy) | ALSD10BT | ∅ |
| `COMG0010-2` | Cofanetto Regalo "Assortimento Lusso" | COMG0010 | ∅ |
| `CECD10DD-4` | Pregiate Praline - Martesana | CECD10DD-3, CECD10DD-2, CECD10DD-1 | CECD10DD-3, ∅, ∅ |
| `CNTFRNC7-2` | Salon Cuvée S Oenotheque - Cassa di Legno | cntfrnc7 | ∅ |
| `TORTA-TIRAMISU` | Torta Tiramisù | YRXIFR-1, YRXIFR-2 | YRXIFR-1 |
| `FRAGOLE-LOVE-2` | Fragole Love | NGPAGI-1, NGPAGI-1a, NGPAGI-1b, NGPAGI-2, NGPAGI-2a, NGPAGI-2b… | ∅, NGPAGI-1a, NGPAGI-1b, ∅, ∅, NGPAGI-2b… |

### Flowers — 21 schede

| Codice qui | Prodotto | SKU sul negozio | SKU delle varianti qui |
|---|---|---|---|
| `SUSHI-FLOREALE` | Sushi Floreale | SUFP202, SUFP2020, SUFP20201, SUFP20202 | SUFP2020, SUFP202, SUFP20201 |
| `MAXI-BOUQUET-ROSE-ROSSE-` | MAXI Bouquet Rose Rosse e Girasoli | aaa5, aaa6, aaa7 | aaa5, aaa6 |
| `BOUQUET-ORANGE-ELEGANCE` | Bouquet Orange Elegance | MQQUB1, MQQUB2, MQQUB-4, MQQUB-5 | MQQUB0, MQQUB1, MQQUB2 |
| `BOUQUET-PINK-GRACE` | Bouquet Pink Grace | SHUXWA2, SHUXWA3, SHUXWA-4, SHUXWA-5 | SHUXWA1, SHUXWA2, SHUXWA3, SHUXWA-4 |
| `BOUQUET-PURE-HARMONY` | Bouquet Pure Harmony | BBEELI2, BBEELI3, BBEELI-4, BBEELI-5 | BBEELI2, BBEELI1, BBEELI3, BBEELI-4 |
| `BOUQUET-PURPLE-MAJESTY` | Bouquet Purple Majesty | QWRYDK-2, QWRYDK-3, QWRYDK-4, QWRYDK-5 | QWRYDK-2, QWRYDK-1, QWRYDK-3, QWRYDK1 |
| `BOUQUET-RED-PASSION` | Bouquet Red Passion | KQMSHZ2, KQMSHZ3, KQMSHZ-4, KQMSHZ-5 | KQMSHZ1, KQMSHZ2, KQMSHZ-4 |
| `BOUQUET-YELLOW-RADIANCE` | Bouquet Yellow Radiance | GGVLAS2, GGVLAS3, GGVLAS-4, GGVLAS-5 | GGVLAS1, GGVLAS3, GGVLAS2, GGVLAS-4 |
| `CORONA-LAUREA-LUXURY` | Corona Laurea Luxury | R6YT5, R6YT6, R6YT7, R6YT8, R6YT9, R6YT10… | R6YT5, R6YT8 |
| `ULSKJX` | Centrotavola Capri | ULSKJX-1, ULSKJX-1a, ULSKJX-2, ULSKJX-2a, ULSKJX-3, ULSKJX-3a | ULSKJX-1 |
| `REGINA-DI-CUORI-PINK` | Regina di Cuori - PINK | OXOMEQ1, OXOMEQ2, OXOMEQ3 | OXOMEQ1, OXOMEQ2 |
| `BOUQUET-ORTENSIE-VERDI-E` | Bouquet Ortensie Verdi e Fiori Bianchi | ILXHPG-1, ILXHPG-2, ILXHPG-3, ILXHPG-4 | ILXHPG-1, ILXHPG-2, AFD325323, AFD32532 |
| `ROSE-ROSSE-E-PRALINE-D-A` | Rose Rosse e Praline d'Autore | NAIOHQ-1, NAIOHQ-2, NAIOHQ-3 | NAIOHQ-1, NAIOHQ-2, NAIOHQ-1d, NAIOHQ-2d, NAIOHQ-1b, NAIOHQ-1c |
| `ROSE-ROSA-E-PRALINE-D-AU` | Rose Rosa e Praline d'Autore (Champagne Rosé) | XQXDCB-1, XQXDCB-1a, XQXDCB-2, XQXDCB-2a, XQXDCB-3, XQXDCB-3a | XQXDCB-1, XQXDCB-1d |
| `QTIQSL` | Botticelli - Bouquet e Palloncini | QUPPCO-1, QUPPCO-2, QUPPCO-3, QUPPCO-4, QUPPCO-5 | QTIQSL-1 |
| `ABCWDY-2` | Ortensie Balloon | ABCWDY | ∅ |
| `AINSXG-2` | Cento Rose Bianche | AINSXG | ∅ |
| `ZSOAMD-2` | Champagne e Fiori di Stagione | ZSOAMD | ∅ |
| `ABBONAMENTO-STAGIONALE-2-2` | ABBONAMENTO STAGIONALE - 2 VOLTE AL MESE | ZRGNAI1, ZRGNAI2, ZRGNAI3, ZRGNAI4, ZRGNAI5 | ∅, ∅, ∅, ∅, ∅ |
| `ABBONAMENTO-BUSINESS-1-V-2` | ABBONAMENTO BUSINESS - 1 VOLTA AL MESE | QRGTVU1, QRGTVU2, QRGTVU3, QRGTVU4, QRGTVU5, QRGTVU6 | ∅, ∅, ∅, ∅, ∅, ∅ |
| `ABBONAMENTO-ROMANTICO-1--2` | ABBONAMENTO ROMANTICO - 1 VOLTA AL MESE | UOMGIB1, UOMGIB2, UOMGIB3, UOMGIB4, UOMGIB5 | ∅, ∅, ∅, ∅, ∅ |

### Cake — 25 schede

| Codice qui | Prodotto | SKU sul negozio | SKU delle varianti qui |
|---|---|---|---|
| `CHEESECAKE` | Cheesecake | njtyuf-2, njtyuf-3, njtyuf-4, njtyuf-6, njtyuf-7, njtyuf-8… | SEDKRB-1, njtyuf-3, SEDKRB-2, njtyuf-2, njtyuf-7 |
| `CROSTATA-DI-FRUTTA` | Crostata di Frutta | VZPGKD-1, VZPGKD-2, VZPGKD-3, VZPGKD-4, VZPGKD-5, VZPGKD-6… | KHBWOM-1, VZPGKD-1, VZPGKD-2, KHBWOM-2, KHBWOM-3, VZPGKD-4… |
| `OBQYBP` | Wildflower | OBQYBP-10, OBQYBP1, OBQYBP2, OBQYBP3, OBQYBP4, OBQYBP5… | OBQYBP-10 |
| `TDMLOVEYOUD` | Darling | TDMLOVEYOUD-9, TDMLOVEYOUd-15, TDMLOVEYOUd-20, TDMLOVEYOUd-25, TDMLOVEYOU-d30, TDMLOVEYOUd-40… | TDMLOVEYOUD-10 |
| `TDMLOVEYOUDR` | Red Velvet | TDMLOVEYOUDR-10, TDMLOVEYOUDR-9, TDMLOVEYOUdr-15, TDMLOVEYOUdr-20, TDMLOVEYOUdr-25, TDMLOVEYOU-dr30… | TDMLOVEYOUDR-9 |
| `TDMLOVEYOUEEDRAABB` | Berry Love | TDMLOVEYOUeedraabb-10, TDMLOVEYOUeedraabb-15, TDMLOVEYeeOUdraabb-20, TDMLOVEeeeYOUdraabb-25, TDMLOeeVEYOU-aadrbb30, TDMLOVeeEYOUdaa-4bbr0… | TDMLOVEYOUeedraabb-15 |
| `MERINGATA` | Meringata | POIJNH-6, POIJNH-8, POIJNH-10, POIJNH-15, POIJNH-20, POIJNH-25… | POIJNH-6, rfgtjr-224gf-1 |
| `NUMBER` | Number | CYSTXZ1, CYSTXZ2, CYSTXZ3, CYSTXZ4, CYSTXZ5, CYSTXZ6… | CYSTXZ2, CYSTXZ3, CYSTXZ1, CYSTXZ4 |
| `LETTERS-1` | Letters | DKCYOC4, DKCYOC5, DKCYOC6, DKCYOC7, DKCYOC8, DKCYOC9… | DKCYOC4, DKCYOC5, DKCYOC6, DKCYOC7, ∅, DKCYOC8… |
| `NUMBERS` | Numbers | WUJTWS1, WUJTWS2, WUJTWS3, WUJTWS4, WUJTWS5, WUJTWS6… | WUJTWS1, WUJTWS2, WUJTWS3, WUJTWS5 |
| `DIANA` | Diana | DMSSUP-10, DMSSUP1, DMSSUP2, DMSSUP3, DMSSUP4, DMSSUP5… | DMSSUP1, DMSSUP3, DMSSUP-10 |
| `LILY` | Lily | GLTPTL-10, GLTPTL1, GLTPTL2, GLTPTL3, GLTPTL4, GLTPTL5… | GLTPTL-10, GLTPTL1, GLTPTL3 |
| `TIRAMISU` | Tiramisù | VUOYEQ6, VUOYEQ8, VUOYEQ10, VUOYEQ15, VUOYEQ20, VUOYEQ25… | VUOYEQ6, JAHLYF-6, xfkcku201, JAHLYF-1, JAHLYF-2, EGDHMO-1… |
| `TORTA-CIOCCOLATO` | Torta Cioccolato | LEBQMO6, LEBQMO8, LEBQMO10, LEBQMO15, LEBQMO20, LEBQMO25… | LEBQMO6, LEBQMO8 |
| `TORTA-CAPRESE` | Torta Caprese | OCYTIE6, OCYTIE8, OCYTIE10, OCYTIE15, OCYTIE20, OCYTIE25… | OCYTIE6, OCYTIE10 |
| `TORTA-AI-TRE-CIOCCOLATI` | Torta Tre Cioccolati | PCBFYS6, PCBFYS8, PCBFYS10, PCBFYS15, PCBFYS20, PCBFYS25… | PCBFYS6, PCBFYS8, PCBFYS15, PCBFYS10 |
| `MILLEFOGLIE` | Millefoglie | SBKLUT6, SBKLUT8, SBKLUT10, SBKLUT15, SBKLUT20, SBKLUT25… | YQIWWL-4, VROQKH-1, EQAOUR-2, MIT400-1, OGZDYZ1, SBKLUT6 |
| `PASTIERA-NAPOLETANA` | Pastiera Napoletana | RXDEEG6, RXDEEG8, RXDEEG10, RXDEEG15, RXDEEG20, RXDEEG25… | RXDEEG6, YDNSWL |
| `CROSTATA-DI-MELE` | Crostata di Mele | HYFLSS6, HYFLSS8, HYFLSS10, HYFLSS15, HYFLSS20, HYFLSS25… | HYFLSS6, HYFLSS8, HYFLSS10, HYFLSS15, HYFLSS20, HYFLSS25… |
| `SACHER` | Sacher | DPOYKN6, DPOYKN8, DPOYKN10, DPOYKN15, DPOYKN20, DPOYKN25… | DPOYKN6, BNROOU1, EXYUFM-3, VLPQAK-1, DPOYKN10, BNROOU2… |
| `CHANTILLY` | Torta Chantilly | PCSMKF-1, PCSMKF-2, PCSMKF-3, PCSMKF-4, PCSMKF-5, PCSMKF-6… | rfgtjrq-2, rfgtjrq-1, PCSMKF-1, PCSMKF-2, rfgtjrq-4, PCSMKF-3 |
| `QJPVTA-2A` | Torta Lode | QJPVTA-1, QJPVTA-2, QJPVTA-3, QJPVTA-4, QJPVTA-5, QJPVTA-6… | QJPVTA-2a |
| `ELEGANT-CAKE` | Elegant Cake | OOLEZR-1, OOLEZR-2, OOLEZR-3, OOLEZR-4, OOLEZR-5 | OOLEZR-2, OOLEZR-1, OOLEZR-3, OOLEZR-2a, OOLEZR-4, OOLEZR-3a… |
| `TORTA-FUOCHI-D-ARTIFICIO` | Torta Fuochi d'Artificio | CGBRIL-1, CGBRIL-2, CGBRIL-3, CGBRIL-4, CGBRIL-5, CGBRIL-6… | CGBRIL-1b, CGBRIL-1 |
| `LABUBU-CAKE` | Labubu Cake | GJZVFI-1, GJZVFI-2, GJZVFI-3, GJZVFI-4, GJZVFI-5, GJZVFI-6… | GJZVFI-1, GJZVFI-1a |

## Database (senza passare dal negozio)

Prodotti con `statoShopify = ACTIVE`: 1149; loro varianti: 4284, di cui **187 senza sku** (rispecchiano le varianti senza SKU del negozio, entro le prime 10); prodotti attivi senza alcuna variante qui: 0.
