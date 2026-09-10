# Mappatura dei metafield sui prodotti nuovi — 2026-09-10

Un prodotto di prova per categoria, creato **dallo stesso codice del modulo** (`creaProdottoCompleto`) con i metafield che il modulo dà a un prodotto nuovo: i campi operativi dal valore più usato sul sito, il partner più usato, uno o due campi di contenuto con la prima scelta ammessa. Poi riletto da Shopify.

Legenda: **atteso** = presente su almeno metà delle schede attive di quel sito · ✅ arrivato su Shopify · ❌ mandato ma non arrivato · ⚪ atteso e non mandato (il modulo non lo compila da solo).

## Riassunto

- **TORTE_DOLCI** su Cake: creato · mandati 9, arrivati 9
- **FIORI** su Flowers: creato · mandati 11, arrivati 11 · attesi non compilati dal modulo: custom.modello
- **BOUQUET** su Flowers: creato · mandati 10, arrivati 10 · attesi non compilati dal modulo: custom.colore, custom.occasione
- **VINI_SPIRITS** su Gifts: creato · mandati 12, arrivati 12
- **GASTRONOMIA** su Business Deluxy: creato · mandati 12, arrivati 12
- **ORIGINALI_DELUXY** su Gifts: creato · mandati 12, arrivati 12
- **REGALI** su Gifts: creato · mandati 12, arrivati 12
- **ARTE** su Gifts: creato · mandati 11, arrivati 11
- **SERVIZI** su Business Deluxy: creato · mandati 11, arrivati 11
- **GIFT_BOX** su Business Deluxy: creato · mandati 12, arrivati 12

## TORTE_DOLCI → Cake (tipo «Torte»)

Esito: creato · Shopify DRAFT · id `gid://shopify/Product/15407239364931` · SKU `5972560` · mandati 9, arrivati 9

| Chiave | Atteso | Mandato | Su Shopify |
|---|:-:|---|---|
| `custom.data` | sì (70%) | `72 ore` | ✅ `72 ore` |
| `custom.gusti` |  | `["Frutta"]` | ✅ `["Frutta"]` |
| `custom.is_unique` | sì (99%) | `false` | ✅ `false` |
| `custom.minimo_orario` | sì (99%) | `8` | ✅ `8` |
| `custom.nations_availability` | sì (99%) | `ITALY-MILAN(MI) ITALY-ROMA(RM) ITALY-FLORENCE(FI) ITALY-MONZ` | ✅ `ITALY-MILAN(MI) ITALY-ROMA(RM) ITALY-FLORENCE(FI) ITALY-MONZ` |
| `custom.not_physical` | sì (99%) | `false` | ✅ `false` |
| `custom.partner_address` | sì (99%) | `Via Varesina, Milano MI, Italia` | ✅ `Via Varesina, Milano MI, Italia` |
| `custom.partner_id` | sì (99%) | `223` | ✅ `223` |
| `judgeme.badge` |  |  |  `<div style='display:none' class='jdgm-prev-badge' data-avera` |
| `judgeme.widget` |  |  |  `<div class='jdgm-rev-widg' data-updated-at='2026-09-10T12:06` |
| `prodotto.consegna` | sì (100%) | `3` | ✅ `3` |

## FIORI → Flowers (tipo «Fiori»)

Esito: creato · Shopify DRAFT · id `gid://shopify/Product/16158533222725` · SKU `1474329` · mandati 11, arrivati 11

| Chiave | Atteso | Mandato | Su Shopify |
|---|:-:|---|---|
| `custom._nations_availability` | sì (91%) | `ITALY-MILAN(MI) ITALY-ROMA(RM) ITALY-FLORENCE(FI) ITALY-COMO` | ✅ `ITALY-MILAN(MI) ITALY-ROMA(RM) ITALY-FLORENCE(FI) ITALY-COMO` |
| `custom.colore` | sì (91%) | `Mix` | ✅ `Mix` |
| `custom.data` | sì (64%) | `["Oggi","Domani"]` | ✅ `["Oggi","Domani"]` |
| `custom.fiori` | sì (94%) | `["Rose"]` | ✅ `["Rose"]` |
| `custom.is_unique` | sì (88%) | `false` | ✅ `false` |
| `custom.minimo_orario` | sì (91%) | `8` | ✅ `8` |
| `custom.modello` | sì (90%) |  | ⚪  |
| `custom.not_physical` | sì (88%) | `false` | ✅ `false` |
| `custom.occasione` | sì (89%) | `["Compleanno"]` | ✅ `["Compleanno"]` |
| `custom.partner_address` | sì (90%) | `Via Monte Napoleone, 20121 Milano MI, Italia` | ✅ `Via Monte Napoleone, 20121 Milano MI, Italia` |
| `custom.partner_id` | sì (90%) | `242` | ✅ `242` |
| `prodotto.consegna` | sì (96%) | `0` | ✅ `0` |

## BOUQUET → Flowers (tipo «Rose»)

Esito: creato · Shopify DRAFT · id `gid://shopify/Product/16158533386565` · SKU `3967795` · mandati 10, arrivati 10

| Chiave | Atteso | Mandato | Su Shopify |
|---|:-:|---|---|
| `custom._nations_availability` | sì (91%) | `ITALY-MILAN(MI) ITALY-ROMA(RM) ITALY-FLORENCE(FI) ITALY-COMO` | ✅ `ITALY-MILAN(MI) ITALY-ROMA(RM) ITALY-FLORENCE(FI) ITALY-COMO` |
| `custom.colore` | sì (91%) |  | ⚪  |
| `custom.data` | sì (64%) | `["Oggi","Domani"]` | ✅ `["Oggi","Domani"]` |
| `custom.fiori` | sì (94%) | `["Rose"]` | ✅ `["Rose"]` |
| `custom.is_unique` | sì (88%) | `false` | ✅ `false` |
| `custom.minimo_orario` | sì (91%) | `8` | ✅ `8` |
| `custom.modello` | sì (90%) | `Bouquet` | ✅ `Bouquet` |
| `custom.not_physical` | sì (88%) | `false` | ✅ `false` |
| `custom.occasione` | sì (89%) |  | ⚪  |
| `custom.partner_address` | sì (90%) | `Via Monte Napoleone, 20121 Milano MI, Italia` | ✅ `Via Monte Napoleone, 20121 Milano MI, Italia` |
| `custom.partner_id` | sì (90%) | `242` | ✅ `242` |
| `prodotto.consegna` | sì (96%) | `0` | ✅ `0` |

## VINI_SPIRITS → Gifts (tipo «Vini»)

Esito: creato · Shopify DRAFT · id `gid://shopify/Product/16028046688586` · SKU `8192274` · mandati 12, arrivati 12

| Chiave | Atteso | Mandato | Su Shopify |
|---|:-:|---|---|
| `custom.da_chi_fatto` | sì (62%) | `["Creato dall'Artista: "]` | ✅ `["Creato dall'Artista: "]` |
| `custom.data` | sì (87%) | `["Oggi","Domani"]` | ✅ `["Oggi","Domani"]` |
| `custom.is_unique` | sì (93%) | `false` | ✅ `false` |
| `custom.minimo_orario` | sì (89%) | `8` | ✅ `8` |
| `custom.nations_availability` | sì (73%) | `ITALY-ROMA(RM) ITALY-MILAN(MI) ITALY-FLORENCE(FI) ITALY-PAVI` | ✅ `ITALY-ROMA(RM) ITALY-MILAN(MI) ITALY-FLORENCE(FI) ITALY-PAVI` |
| `custom.not_physical` | sì (93%) | `false` | ✅ `false` |
| `custom.occasioni` | sì (53%) | `["Anniversari"]` | ✅ `["Anniversari"]` |
| `custom.partner_address` | sì (97%) | `Milano` | ✅ `Milano` |
| `custom.partner_id` | sì (97%) | `128` | ✅ `128` |
| `custom.tipologia` | sì (57%) | `["Raccomandato"]` | ✅ `["Raccomandato"]` |
| `custom.vini` |  | `["Champagne"]` | ✅ `["Champagne"]` |
| `prodotto.consegna` | sì (99%) | `0` | ✅ `0` |

## GASTRONOMIA → Business Deluxy (tipo «B2B Lunch»)

Esito: creato · Shopify DRAFT · id `gid://shopify/Product/12237231063304` · SKU `2583647` · mandati 12, arrivati 12

| Chiave | Atteso | Mandato | Su Shopify |
|---|:-:|---|---|
| `custom.da_chi_fatto` | sì (72%) | `["Pensato In Esclusiva per te da "]` | ✅ `["Pensato In Esclusiva per te da "]` |
| `custom.data` | sì (77%) | `["Oggi","Domani"]` | ✅ `["Oggi","Domani"]` |
| `custom.is_unique` | sì (89%) | `true` | ✅ `true` |
| `custom.minimo_orario` | sì (73%) | `7` | ✅ `7` |
| `custom.nations_availability` | sì (79%) | `ITALY-ROMA(RM) ITALY-MILAN(MI) ITALY-FLORENCE(FI) ITALY-PAVI` | ✅ `ITALY-ROMA(RM) ITALY-MILAN(MI) ITALY-FLORENCE(FI) ITALY-PAVI` |
| `custom.not_physical` | sì (89%) | `false` | ✅ `false` |
| `custom.occasioni` |  | `["Anniversari"]` | ✅ `["Anniversari"]` |
| `custom.partner_address` | sì (89%) | `Milano` | ✅ `Milano` |
| `custom.partner_id` | sì (89%) | `128` | ✅ `128` |
| `custom.tipologia` | sì (71%) | `["Raccomandato"]` | ✅ `["Raccomandato"]` |
| `custom.tipologia_catering` |  | `Colazioni` | ✅ `Colazioni` |
| `prodotto.consegna` | sì (89%) | `0` | ✅ `0` |

## ORIGINALI_DELUXY → Gifts (tipo «Originali Deluxy»)

Esito: creato · Shopify DRAFT · id `gid://shopify/Product/16028046917962` · SKU `7259351` · mandati 12, arrivati 12

| Chiave | Atteso | Mandato | Su Shopify |
|---|:-:|---|---|
| `custom.classificazione` |  | `["Prêt-à-Porter"]` | ✅ `["Prêt-à-Porter"]` |
| `custom.da_chi_fatto` | sì (62%) | `["Creato dall'Artista: "]` | ✅ `["Creato dall'Artista: "]` |
| `custom.data` | sì (87%) | `["Oggi","Domani"]` | ✅ `["Oggi","Domani"]` |
| `custom.is_unique` | sì (93%) | `false` | ✅ `false` |
| `custom.minimo_orario` | sì (89%) | `8` | ✅ `8` |
| `custom.nations_availability` | sì (73%) | `ITALY-ROMA(RM) ITALY-MILAN(MI) ITALY-FLORENCE(FI) ITALY-PAVI` | ✅ `ITALY-ROMA(RM) ITALY-MILAN(MI) ITALY-FLORENCE(FI) ITALY-PAVI` |
| `custom.not_physical` | sì (93%) | `false` | ✅ `false` |
| `custom.occasioni` | sì (53%) | `["Anniversari"]` | ✅ `["Anniversari"]` |
| `custom.partner_address` | sì (97%) | `Milano` | ✅ `Milano` |
| `custom.partner_id` | sì (97%) | `128` | ✅ `128` |
| `custom.tipologia` | sì (57%) | `["Raccomandato"]` | ✅ `["Raccomandato"]` |
| `prodotto.consegna` | sì (99%) | `0` | ✅ `0` |

## REGALI → Gifts (tipo «Box Regalo»)

Esito: creato · Shopify DRAFT · id `gid://shopify/Product/16028046983498` · SKU `2309482` · mandati 12, arrivati 12

| Chiave | Atteso | Mandato | Su Shopify |
|---|:-:|---|---|
| `custom.citta` |  | `["Milano"]` | ✅ `["Milano"]` |
| `custom.da_chi_fatto` | sì (62%) | `["Creato dall'Artista: "]` | ✅ `["Creato dall'Artista: "]` |
| `custom.data` | sì (87%) | `["Oggi","Domani"]` | ✅ `["Oggi","Domani"]` |
| `custom.is_unique` | sì (93%) | `false` | ✅ `false` |
| `custom.minimo_orario` | sì (89%) | `8` | ✅ `8` |
| `custom.nations_availability` | sì (73%) | `ITALY-ROMA(RM) ITALY-MILAN(MI) ITALY-FLORENCE(FI) ITALY-PAVI` | ✅ `ITALY-ROMA(RM) ITALY-MILAN(MI) ITALY-FLORENCE(FI) ITALY-PAVI` |
| `custom.not_physical` | sì (93%) | `false` | ✅ `false` |
| `custom.occasioni` | sì (53%) | `["Anniversari"]` | ✅ `["Anniversari"]` |
| `custom.partner_address` | sì (97%) | `Milano` | ✅ `Milano` |
| `custom.partner_id` | sì (97%) | `128` | ✅ `128` |
| `custom.tipologia` | sì (57%) | `["Raccomandato"]` | ✅ `["Raccomandato"]` |
| `prodotto.consegna` | sì (99%) | `0` | ✅ `0` |

## ARTE → Gifts (tipo «Arte»)

Esito: creato · Shopify DRAFT · id `gid://shopify/Product/16028047016266` · SKU `6433795` · mandati 11, arrivati 11

| Chiave | Atteso | Mandato | Su Shopify |
|---|:-:|---|---|
| `custom.da_chi_fatto` | sì (62%) | `["Creato dall'Artista: "]` | ✅ `["Creato dall'Artista: "]` |
| `custom.data` | sì (87%) | `["Oggi","Domani"]` | ✅ `["Oggi","Domani"]` |
| `custom.is_unique` | sì (93%) | `false` | ✅ `false` |
| `custom.minimo_orario` | sì (89%) | `8` | ✅ `8` |
| `custom.nations_availability` | sì (73%) | `ITALY-ROMA(RM) ITALY-MILAN(MI) ITALY-FLORENCE(FI) ITALY-PAVI` | ✅ `ITALY-ROMA(RM) ITALY-MILAN(MI) ITALY-FLORENCE(FI) ITALY-PAVI` |
| `custom.not_physical` | sì (93%) | `false` | ✅ `false` |
| `custom.occasioni` | sì (53%) | `["Anniversari"]` | ✅ `["Anniversari"]` |
| `custom.partner_address` | sì (97%) | `Milano` | ✅ `Milano` |
| `custom.partner_id` | sì (97%) | `128` | ✅ `128` |
| `custom.tipologia` | sì (57%) | `["Raccomandato"]` | ✅ `["Raccomandato"]` |
| `prodotto.consegna` | sì (99%) | `0` | ✅ `0` |

## SERVIZI → Business Deluxy (tipo «Servizi Deluxy»)

Esito: creato · Shopify DRAFT · id `gid://shopify/Product/12237231456520` · SKU `4914681` · mandati 11, arrivati 11

| Chiave | Atteso | Mandato | Su Shopify |
|---|:-:|---|---|
| `custom.da_chi_fatto` | sì (72%) | `["Pensato In Esclusiva per te da "]` | ✅ `["Pensato In Esclusiva per te da "]` |
| `custom.data` | sì (77%) | `["Oggi","Domani"]` | ✅ `["Oggi","Domani"]` |
| `custom.is_unique` | sì (89%) | `true` | ✅ `true` |
| `custom.minimo_orario` | sì (73%) | `7` | ✅ `7` |
| `custom.nations_availability` | sì (79%) | `ITALY-ROMA(RM) ITALY-MILAN(MI) ITALY-FLORENCE(FI) ITALY-PAVI` | ✅ `ITALY-ROMA(RM) ITALY-MILAN(MI) ITALY-FLORENCE(FI) ITALY-PAVI` |
| `custom.not_physical` | sì (89%) | `true` | ✅ `true` |
| `custom.occasioni` |  | `["Anniversari"]` | ✅ `["Anniversari"]` |
| `custom.partner_address` | sì (89%) | `Milano` | ✅ `Milano` |
| `custom.partner_id` | sì (89%) | `128` | ✅ `128` |
| `custom.tipologia` | sì (71%) | `["Raccomandato"]` | ✅ `["Raccomandato"]` |
| `prodotto.consegna` | sì (89%) | `0` | ✅ `0` |

## GIFT_BOX → Business Deluxy (tipo «B2B Regali da Personalizzare»)

Esito: creato · Shopify DRAFT · id `gid://shopify/Product/12237231620360` · SKU `8347245` · mandati 12, arrivati 12

| Chiave | Atteso | Mandato | Su Shopify |
|---|:-:|---|---|
| `custom.da_chi_fatto` | sì (72%) | `["Pensato In Esclusiva per te da "]` | ✅ `["Pensato In Esclusiva per te da "]` |
| `custom.data` | sì (77%) | `["Oggi","Domani"]` | ✅ `["Oggi","Domani"]` |
| `custom.dolci` |  | `["Mignon"]` | ✅ `["Mignon"]` |
| `custom.is_unique` | sì (89%) | `true` | ✅ `true` |
| `custom.minimo_orario` | sì (73%) | `7` | ✅ `7` |
| `custom.nations_availability` | sì (79%) | `ITALY-ROMA(RM) ITALY-MILAN(MI) ITALY-FLORENCE(FI) ITALY-PAVI` | ✅ `ITALY-ROMA(RM) ITALY-MILAN(MI) ITALY-FLORENCE(FI) ITALY-PAVI` |
| `custom.not_physical` | sì (89%) | `false` | ✅ `false` |
| `custom.partner_address` | sì (89%) | `Milano` | ✅ `Milano` |
| `custom.partner_id` | sì (89%) | `128` | ✅ `128` |
| `custom.personalizzabile` |  | `true` | ✅ `true` |
| `custom.tipologia` | sì (71%) | `["Raccomandato"]` | ✅ `["Raccomandato"]` |
| `prodotto.consegna` | sì (89%) | `0` | ✅ `0` |

