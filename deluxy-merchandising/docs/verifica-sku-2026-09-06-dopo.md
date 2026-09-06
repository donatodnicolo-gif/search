# Verifica SKU sui prodotti pubblicati — 06/09/2026

Letto direttamente dai tre negozi Shopify con i token dell'app (`scripts/verifica-sku.ts`, solo lettura) e confrontato col catalogo di questa app. «Pubblicato» = `status: ACTIVE` sul negozio.

## Riepilogo

| Negozio | Prodotti attivi | Varianti | Varianti senza SKU | Prodotti con varianti senza SKU | A catalogo qui (per id) | Con più di 10 varianti (l'import ne legge 10) |
|---|---:|---:|---:|---:|---:|---:|
| Gifts | 893 | 3943 | 0 | 0 | 893 | 50 (412 varianti oltre la decima) |
| Flowers | 269 | 1178 | 0 | 0 | 19 | 1 (2 varianti oltre la decima) |
| Cake | 321 | 3021 | 0 | 0 | 164 | 34 (35 varianti oltre la decima) |
| **Totale** | **1483** | **8142** | **0** | **0** | | |

Note di lettura:

- Su Gifts 18 prodotti hanno più di 20 varianti (torte di laurea, «Selezione Mignon»…): riletti per intero, i loro conteggi qui sotto sono completi.
- Nessuno SKU è duplicato fra prodotti diversi dello stesso negozio.
- Su Gifts 334 prodotti attivi non hanno una scheda con quell'id qui: 312 di loro sono **lo stesso prodotto venduto anche su Flowers (231) o Cake (74)**, e la scheda porta l'id dell'altro negozio (una scheda = un prodotto, anche se sta su due negozi); 22 non hanno una scheda con lo stesso handle.
- Il catalogo qui legge **10 varianti per prodotto** (`variants(first: 10)` nell'import): per i prodotti con più varianti quelle oltre la decima non esistono qui. Da allargare se serve lo SKU di ogni variante.

## Da correggere sul negozio: prodotti attivi con varianti senza SKU

### Gifts (deluxygifts.myshopify.com) — 0 prodotti

| Prodotto | Handle | Varianti senza SKU / totali | Varianti scoperte |
|---|---|---:|---|

### Flowers (fb72b1-2.myshopify.com) — 0 prodotti

| Prodotto | Handle | Varianti senza SKU / totali | Varianti scoperte |
|---|---|---:|---|

### Cake (cakedesign-5921.myshopify.com) — 0 prodotti

| Prodotto | Handle | Varianti senza SKU / totali | Varianti scoperte |
|---|---|---:|---|

## A catalogo qui ma con codice che non combacia con gli SKU del negozio

Il codice della scheda è nato dall'handle (l'import lo fa quando le varianti non hanno una base comune) e le varianti qui non coprono tutti gli SKU del negozio. Non è un errore del negozio: è dove il catalogo di questa app non rispecchia lo SKU vero.

### Gifts — 69 schede

| Codice qui | Prodotto | SKU sul negozio | SKU delle varianti qui |
|---|---|---|---|
| `TORTA-ROSE-E-BOLLICINE` | Torta, Rose e Bollicine | SEEM506, SEEM507, SEEM504, SEEM505, SEEM508, SEEM509… | SEEM-523, SEEM-532 |
| `SUSHI-PROTEIN-BOX` | Sushi - Protein Box | rht, AFDEe231, hrj | rht, hrj |
| `TORTA-LOVE-ME-DELUXE` | Torta Love Me Deluxe | 2424271-7, 2424271-4, 2424271-1, 2424271-13, 2424271-14, 2424271-15… | 2424271-4, 2424271-7, 2424271-8, 2424271-13, 2424271-15, 2424271-16… |
| `COPY-OF-OMAKASE` | To Share | dgwr, heth, 8808191-1, 8808191-2, fefv, nyac… | dgwr, heth, fefv, nyac, cwrd, 8808191-1… |
| `NIGIRI` | Nigiri | juyv, oiuuty, yterx, kiuyc, jkhbg, khgvyt… | juyv, oiuuty |
| `CLASSIC-ROLLS` | Classic Rolls | scwvf, sdv, jkh, sqwd, cfty | jkh |
| `TEMPURA-ROLLS` | Tempura Rolls | Lhui7, Lhui75, oiiydb, fgfdb, uxsvdyq, ncidufu… | Lhui75, Lhui7 |
| `103-LUXURY-ROSES` | 103 Luxury Roses | dgf-4, dgf-1, dgf-2, dgf-3 | dgf-4 |
| `TORTA-CUORE` | Torta Cuore | nyoiie12, nyoiie13, nyoiie14, nyoiie15, nyoiie16, nyoiie17… | nyoiie12, nyoiie13 |
| `CROSTATA-AI-FRUTTI-DI-BO` | Crostata ai frutti di bosco | rty-1, rty-2, rty-3, rty-4, rty-5, rty-6… | rty-3, rty-1, rty-2, LRMEPI1, LRMEPI2 |
| `CORONA-LAUREA-LUXURY` | Corona Laurea Luxury | R6YT5, R6YT6, R6YT7, R6YT8, R6YT9, R6YT10… | R6YT5, R6YT8 |
| `SELEZIONE-MIGNON` | Selezione Mignon | rfgtjr-15, e223, a334g, arhdv-1, rfgtjr-24, a4fw3… | a334g, arhdv-3, rfgtjr-15, rfgtjr-33222, a4fw3, arhdv-1… |
| `TORTA-BUON-ANNIVERSARIO` | Torta Buon Anniversario | funnyc20, funnyc22, funnyc24, funnyc25, funnyc26, funnyc27… | funnyc20, funnyc22 |
| `MAXI-BOUQUET-ROSE-ROSSE-` | MAXI Bouquet Rose Rosse e Girasoli | aaa5, aaa6, aaa7 | aaa5, aaa6 |
| `BOUQUET-ORANGE-ELEGANCE` | Bouquet Orange Elegance | MQQUB0, MQQUB1, MQQUB2, MQQUB-4, MQQUB-5 | MQQUB0, MQQUB1, MQQUB2 |
| `BOUQUET-PINK-GRACE` | Bouquet Pink Grace | SHUXWA1, SHUXWA2, SHUXWA3, SHUXWA-4, SHUXWA-5 | SHUXWA1, SHUXWA2, SHUXWA3, SHUXWA-4 |
| `BOUQUET-PURE-HARMONY` | Bouquet Pure Harmony | BBEELI1, BBEELI2, BBEELI3, BBEELI-4, BBEELI-5 | BBEELI2, BBEELI1, BBEELI3, BBEELI-4 |
| `BOUQUET-PURPLE-MAJESTY` | Bouquet Purple Majesty | QWRYDK-1, QWRYDK-2, QWRYDK-3, QWRYDK-4, QWRYDK-5 | QWRYDK-2, QWRYDK-1, QWRYDK-3, QWRYDK1 |
| `BOUQUET-YELLOW-RADIANCE` | Bouquet Yellow Radiance | GGVLAS1, GGVLAS2, GGVLAS3, GGVLAS-4, GGVLAS-5 | GGVLAS1, GGVLAS3, GGVLAS2, GGVLAS-4 |
| `DXQKQC` | Dad Tris Cake | DXQKQC-1b, DXQKQC-1, DXQKQC-2b, DXQKQC-2, DXQKQC-3b, DXQKQC-3… | DXQKQC-1, DXQKQC-2, DXQKQC-3, DXQKQC-4, DXQKQC-5, DXQKQC-6… |
| `MILLEFOGLIE` | Millefoglie | OGZDYZ1, OGZDYZ2, OGZDYZ3 | YQIWWL-4, VROQKH-1, EQAOUR-2, MIT400-1, OGZDYZ1, SBKLUT6 |
| `SACHER-GRUE` | Sacher | BNROOU1, BNROOU2, BNROOU3 | ∅, ∅, BNROOU3 |
| `MACARONS-CLASSICI-GRUE` | Macarons Classici - Grué | BWYQKG1, BWYQKG2, BWYQKG3 | BWYQKG1, BWYQKG2 |
| `PREGIATE-PRALINE-GRUE` | Pregiate Praline - Grué | EJSPEL1, EJSPEL2, ndnvofv | EJSPEL1, ndnvofv |
| `VHKCLJHI9-2` | Monoporzioni Assortite | vhkcljhi9 | ∅ |
| `MUUNXW` | Celebration Blue | MUUNXW-1, MUUNXW-1a, MUUNXW-1b, MUUNXW-2, MUUNXW-2a, MUUNXW-2b… | MUUNXW-1 |
| `WBSBXL` | Celebration Red | WBSBXL-1, WBSBXL-1a, WBSBXL-1b, WBSBXL-2, WBSBXL-2a, WBSBXL-2b… | WBSBXL-1 |
| `MOM-TRIS-CAKE` | Mom Tris Cake | XZRGXO2, XZRGXO2a, XZRGXO3, XZRGXO3a, XZRGXO4, XZRGXO4a… | XZRGXO1, XZRGXO2, XZRGXO3, XZRGXO4, XZRGXO5, XZRGXO6… |
| `REGINA-DI-CUORI-PINK` | Regina di Cuori - PINK | OXOMEQ1, OXOMEQ2, OXOMEQ3 | OXOMEQ1, OXOMEQ2 |
| `UXSJPX1` | Sole Mio - Cream Tart, Girasoli e Spumante | 3726551-9, 3726551-10, 3726551-11, 3726551-12, 3726551-1, 3726551-3… | UXSJPX1, 3726551-9 |
| `FIORI-FRAGOLE-E-CHAMPAGN` | Fiori, Fragole e Champagne Rosé | DGMDEL-RS9, DGMDEL-RS25, DGMDEL-RS50, DGMDEL-RS101, DGMDEL-RR9, DGMDEL-RR25… | DGMDEL-RS9, DGMDEL-RR9 |
| `CROSTATA-AI-FRUTTI-DI-BO-6` | Crostata ai Frutti di Bosco | LRMEPI1, LRMEPI2, LRMEPI3, LRMEPI4, LRMEPI5, LRMEPI6… | ∅, ∅, LRMEPI3, LRMEPI4, LRMEPI5, LRMEPI6… |
| `SWEET-DEGREE` | Sweet Degree | ZLWPFS1, ZLWPFS1a, ZLWPFS1b, ZLWPFS2, ZLWPFS2a, ZLWPFS2b… | ZLWPFS1, ZLWPFS2, ZLWPFS3, ZLWPFS4, ZLWPFS5, ZLWPFS6… |
| `ROYAL-DEGREE` | Royal Degree | RPFMQG1, RPFMQG1a, RPFMQG1b, RPFMQG2, RPFMQG2a, RPFMQG2b… | RPFMQG1, RPFMQG2, RPFMQG3, RPFMQG4, RPFMQG5, RPFMQG6… |
| `FABULOUS-GRADUATION` | Fabulous Graduation | FHPRTV1, FHPRTV1a, FHPRTV1b, FHPRTV2, FHPRTV2a, FHPRTV2b… | FHPRTV1, FHPRTV2, FHPRTV3, FHPRTV4, FHPRTV5, FHPRTV6… |
| `TIRAMISU` | Tiramisù | EGDHMO-1, EGDHMO-2, EGDHMO-3 | VUOYEQ6, JAHLYF-6, xfkcku201, JAHLYF-1, JAHLYF-2, EGDHMO-1… |
| `CHEESECAKE` | Cheesecake | SEDKRB-1, SEDKRB-2, SEDKRB-3 | SEDKRB-1, njtyuf-3, SEDKRB-2, njtyuf-2, njtyuf-7 |
| `PROFITEROLES` | Profiteroles | CGVTGC-1, CGVTGC-2, CGVTGC-3 | NBMVLK6, NBMVLK8 |
| `STRAWBERRY-VINTAGE-CAKE` | Strawberry Vintage Cake | DCOGNV-10, DCOGNV-10a, DCOGNV-10b, DCOGNV-1, DCOGNV-1a, DCOGNV-1b… | DCOGNV-10a, DCOGNV-1a, DCOGNV-10, DCOGNV-10b, DCOGNV-1b |
| `DRXFOE` | Torta Sapienza | DRXFOE-1, DRXFOE-1a, DRXFOE-1b, DRXFOE-2, DRXFOE-2a, DRXFOE-2b… | DRXFOE-1, DRXFOE-4 |
| `YHLGJY` | Dolce Traguardo | YHLGJY-1, YHLGJY-1a, YHLGJY-1b, YHLGJY-2, YHLGJY-2a, YHLGJY-2b… | YHLGJY-1, YHLGJY-2, YHLGJY-3, YHLGJY-4, YHLGJY-5, YHLGJY-6… |
| `FABULOUS-DEGREE` | Fabulous Degree | WEZUQU1, WEZUQU1a, WEZUQU1b, WEZUQU2, WEZUQU2a, WEZUQU2b… | WEZUQU1, WEZUQU2, WEZUQU3, WEZUQU4, WEZUQU5, WEZUQU6… |
| `NUMBERS` | Numbers | WUJTWS1, WUJTWS2, WUJTWS3, WUJTWS4, WUJTWS5, WUJTWS6… | WUJTWS1, WUJTWS2, WUJTWS3, WUJTWS5 |
| `ULSKJX` | Centrotavola Capri | ULSKJX-1, ULSKJX-1a, ULSKJX-2, ULSKJX-2a, ULSKJX-3, ULSKJX-3a | ULSKJX-1 |
| `CAPPELLIERA-ROSE-LAUREA-` | Cappelliera Rose Laurea (colore a scelta) | UVSTYR-1oroa, UVSTYR-2oroa, UVSTYR-3oroa, UVSTYR-1rosso, UVSTYR-1rossoa, UVSTYR-2rosso… | UVSTYR-1mixa, UVSTYR-2rossoa |
| `STBJSA` | Cappelliera Laurea 110 e Lode | STBJSA-1a, STBJSA-1, STBJSA-2a, STBJSA-2, STBJSA-3a, STBJSA-3 | STBJSA-1 |
| `TORTA-FUOCHI-D-ARTIFICIO` | Torta Fuochi d'Artificio | CGBRIL-1, CGBRIL-1a, CGBRIL-1b, CGBRIL-2, CGBRIL-2a, CGBRIL-2b… | CGBRIL-1b, CGBRIL-1 |
| `TORTA-D-ORO` | Torta d'Oro | SUPDPY-1, SUPDPY-1a, SUPDPY-1b, SUPDPY-2, SUPDPY-2a, SUPDPY-2b… | SUPDPY-1a, SUPDPY-1b |
| `CROSTATA-DI-FRUTTA` | Crostata di Frutta | KHBWOM-1, KHBWOM-2, KHBWOM-3, KHBWOM-4, KHBWOM-5, KHBWOM-6 | KHBWOM-1, VZPGKD-1, VZPGKD-2, KHBWOM-2, KHBWOM-3, VZPGKD-4… |
| `CAPRESE` | Caprese | UDWAYR-1, UDWAYR-2 | GBDERQ, UDWAYR-1 |
| `WCKAGN` | Torta e Bollicine | WCKAGN-1, WCKAGN-1a, WCKAGN-2, WCKAGN-2a, WCKAGN-3, WCKAGN-3a… | WCKAGN-3, WCKAGN-1, WCKAGN-2 |
| `ELEGANT-CAKE` | Elegant Cake | OOLEZR-1, OOLEZR-2, OOLEZR-3, OOLEZR-4, OOLEZR-5 | OOLEZR-2, OOLEZR-1, OOLEZR-3, OOLEZR-2a, OOLEZR-4, OOLEZR-3a… |
| `YRJJGM` | Eleanor | YRJJGM-1, YRJJGM-1a, YRJJGM-1b, YRJJGM-2, YRJJGM-2a, YRJJGM-2b… | YRJJGM-1 |
| `4-CIOCCOLATI` | 4 Cioccolati | MOT310-1, MOT310-2, MOT310-3, MOT310-4, MOT310-5, MOT310-6… | MOT310-1, MOT310-3, MOT310-2, MOT310000-6, MOT3100001 |
| `ROSE-ROSA-E-PRALINE-D-AU` | Rose Rosa e Praline d'Autore (Champagne Rosé) | XQXDCB-1, XQXDCB-1a, XQXDCB-1b, XQXDCB-1d, XQXDCB-1e, XQXDCB-2… | XQXDCB-1, XQXDCB-1d |
| `LABUBU-CAKE` | Labubu Cake | GJZVFI-1, GJZVFI-1a, GJZVFI-2, GJZVFI-2a, GJZVFI-3, GJZVFI-3a… | GJZVFI-1, GJZVFI-1a |
| `SAINT-HONORE` | Saint Honoré | PIDGZO1, PIDGZO2, PIDGZO3 | PIDGZO1, PIDGZO2 |
| `XFKCKU3` | Pista Choco | xfkcku4-1, xfkcku4-2, xfkcku4-3, xfkcku4-4, xfkcku4-5, xfkcku4-6… | xfkcku3 |
| `TIRAMISU-PAC` | Tiramisù | xfkcku201, xfkcku202, xfkcku20-3, xfkcku20-4, xfkcku20-5, xfkcku20-6… | ∅, xfkcku202, xfkcku20-3, xfkcku20-4, xfkcku20-5, xfkcku20-6… |
| `CHANTILLY` | Chantilly | rfgtjrq-1, rfgtjrq-2, rfgtjrq-3, rfgtjrq-4, rfgtjrq-5, rfgtjrq-6… | rfgtjrq-2, rfgtjrq-1, PCSMKF-1, PCSMKF-2, rfgtjrq-4, PCSMKF-3 |
| `MERINGATA` | Meringata | rfgtjr-224gf-1, rfgtjr-224gf-2 | POIJNH-6, rfgtjr-224gf-1 |
| `ALSD10BT-2` | Piramide di Macarons (esclusiva Deluxy) | ALSD10BT | ∅ |
| `COMG0010-2` | Cofanetto Regalo "Assortimento Lusso" | COMG0010 | ∅ |
| `CECD10DD-4` | Pregiate Praline - Martesana | CECD10DD-3, CECD10DD-2, CECD10DD-1 | CECD10DD-3, ∅, ∅ |
| `ROSE-ROSSE-E-PRALINE-D-A` | Rose Rosse e Praline d'Autore | NAIOHQ-1, NAIOHQ-1a, NAIOHQ-1b, NAIOHQ-1d, NAIOHQ-1e, NAIOHQ-2… | NAIOHQ-1, NAIOHQ-2, NAIOHQ-1d, NAIOHQ-2d, NAIOHQ-1b, NAIOHQ-1c |
| `CNTFRNC7-2` | Salon Cuvée S Oenotheque - Cassa di Legno | cntfrnc7 | ∅ |
| `TORTA-TIRAMISU` | Torta Tiramisù | YRXIFR-1, YRXIFR-2 | YRXIFR-1 |
| `QEPGXQ` | Corona Funebre | QEPGXQ-1, QEPGXQ-1a, QEPGXQ-1b, QEPGXQ-2, QEPGXQ-2a, QEPGXQ-2b… | QEPGXQ-3, ∅ |
| `FRAGOLE-LOVE-2` | Fragole Love | NGPAGI-1, NGPAGI-1a, NGPAGI-1b, NGPAGI-2, NGPAGI-2a, NGPAGI-2b… | ∅, NGPAGI-1a, NGPAGI-1b, ∅, ∅, NGPAGI-2b… |

### Flowers — 6 schede

| Codice qui | Prodotto | SKU sul negozio | SKU delle varianti qui |
|---|---|---|---|
| `ABCWDY-2` | Ortensie Balloon | ABCWDY | ∅ |
| `AINSXG-2` | Cento Rose Bianche | AINSXG | ∅ |
| `ZSOAMD-2` | Champagne e Fiori di Stagione | ZSOAMD | ∅ |
| `ABBONAMENTO-STAGIONALE-2-2` | ABBONAMENTO STAGIONALE - 2 VOLTE AL MESE | ZRGNAI1, ZRGNAI2, ZRGNAI3, ZRGNAI4, ZRGNAI5 | ∅, ∅, ∅, ∅, ∅ |
| `ABBONAMENTO-BUSINESS-1-V-2` | ABBONAMENTO BUSINESS - 1 VOLTA AL MESE | QRGTVU1, QRGTVU2, QRGTVU3, QRGTVU4, QRGTVU5, QRGTVU6 | ∅, ∅, ∅, ∅, ∅, ∅ |
| `ABBONAMENTO-ROMANTICO-1--2` | ABBONAMENTO ROMANTICO - 1 VOLTA AL MESE | UOMGIB1, UOMGIB2, UOMGIB3, UOMGIB4, UOMGIB5 | ∅, ∅, ∅, ∅, ∅ |

### Cake — 11 schede

| Codice qui | Prodotto | SKU sul negozio | SKU delle varianti qui |
|---|---|---|---|
| `TDMLOVEYOUD` | Darling | TDMLOVEYOUD-9, TDMLOVEYOUd-15, TDMLOVEYOUd-20, TDMLOVEYOUd-25, TDMLOVEYOU-d30, TDMLOVEYOUd-40… | TDMLOVEYOUD-10 |
| `TDMLOVEYOUDR` | Red Velvet | TDMLOVEYOUDR-10, TDMLOVEYOUDR-9, TDMLOVEYOUdr-15, TDMLOVEYOUdr-20, TDMLOVEYOUdr-25, TDMLOVEYOU-dr30… | TDMLOVEYOUDR-9 |
| `TDMLOVEYOUEEDRAABB` | Berry Love | TDMLOVEYOUeedraabb-10, TDMLOVEYOUeedraabb-15, TDMLOVEYeeOUdraabb-20, TDMLOVEeeeYOUdraabb-25, TDMLOeeVEYOU-aadrbb30, TDMLOVeeEYOUdaa-4bbr0… | TDMLOVEYOUeedraabb-15 |
| `NUMBER` | Number | CYSTXZ1, CYSTXZ2, CYSTXZ3, CYSTXZ4, CYSTXZ5, CYSTXZ6… | CYSTXZ2, CYSTXZ3, CYSTXZ1, CYSTXZ4 |
| `LETTERS-1` | Letters | DKCYOC4, DKCYOC5, DKCYOC6, DKCYOC7, DKCYOC-12, DKCYOC8… | DKCYOC4, DKCYOC5, DKCYOC6, DKCYOC7, DKCYOC8, DKCYOC9… |
| `DIANA` | Diana | DMSSUP-10, DMSSUP1, DMSSUP2, DMSSUP3, DMSSUP4, DMSSUP5… | DMSSUP1, DMSSUP3, DMSSUP-10 |
| `LILY` | Lily | GLTPTL-10, GLTPTL1, GLTPTL2, GLTPTL3, GLTPTL4, GLTPTL5… | GLTPTL-10, GLTPTL1, GLTPTL3 |
| `TORTA-CIOCCOLATO` | Torta Cioccolato | LEBQMO6, LEBQMO8, LEBQMO10, LEBQMO15, LEBQMO20, LEBQMO25… | LEBQMO6, LEBQMO8 |
| `TORTA-CAPRESE` | Torta Caprese | OCYTIE6, OCYTIE8, OCYTIE10, OCYTIE15, OCYTIE20, OCYTIE25… | OCYTIE6, OCYTIE10 |
| `TORTA-AI-TRE-CIOCCOLATI` | Torta Tre Cioccolati | PCBFYS6, PCBFYS8, PCBFYS10, PCBFYS15, PCBFYS20, PCBFYS25… | PCBFYS6, PCBFYS8, PCBFYS15, PCBFYS10 |
| `CROSTATA-DI-MELE` | Crostata di Mele | HYFLSS6, HYFLSS8, HYFLSS10, HYFLSS15, HYFLSS20, HYFLSS25… | HYFLSS6, HYFLSS8, HYFLSS10, HYFLSS15, HYFLSS20, HYFLSS25… |

## Database (senza passare dal negozio)

Prodotti con `statoShopify = ACTIVE`: 1076; loro varianti: 3752, di cui **98 senza sku** (rispecchiano le varianti senza SKU del negozio, entro le prime 10); prodotti attivi senza alcuna variante qui: 0.
