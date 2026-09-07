# Analisi schede prodotto — Gifts (deluxy.it) e Business Deluxy (business.deluxy.it)

Data analisi: 2026-09-07. Fonti: `docs/campione-descrizioni/gifts.json` (800 prodotti attivi letti, **53 nel campione**, 48 definizioni metafield) e `docs/campione-descrizioni/business-deluxy.json` (346 attivi, **55 nel campione**, 19 definizioni). Pagine vive scaricate con `curl` (8 per sito, HTML + `.json` pubblico). Nessuna scrittura su Shopify o DB.

Nota sul campione: il campo `tipiProdotto.nelCampione` dichiara 6 per tipo, ma i file contengono al massimo **2 prodotti per productType** (53 e 55 prodotti totali). Le percentuali sotto sono quindi indicative; i pattern strutturali sono invece molto stabili (47/53 e 48/55 seguono lo stesso schema).

---

## A. Anatomia della descrizione (`descriptionHtml`)

### A.1 Tag HTML usati (prodotti che li usano)

| Tag | Gifts (su 53) | Business (su 55) |
|---|---|---|
| `ul` / `li` | 53 / 53 | 54 / 54 |
| `h6` | 53 | 54 |
| `p` | 52 | 54 |
| `b` | 49 | 51 |
| `i` (note in corsivo) | 15 | 10 |
| `strong` | 10 | 2 |
| `span` | 6 | 5 |
| `br` | 5 | 8 |
| `meta charset` (residuo copia-incolla) | 4 | 1 |
| `div` (con `style` inline) | 2 | 2 |
| `table` | **0** | **0** |

Nessuna descrizione usa `h1-h5`, tabelle, immagini o link. Le intestazioni di sezione sono **sempre `<h6>`**, le etichette dentro gli elenchi sono `<b>` (raramente `<strong>`).

### A.2 Struttura canonica (identica nei due negozi)

```html
<ul>
  <li><b>{Famiglia}</b>: {sintesi di 3-10 parole}</li>
  <li><b>Inclusi</b>: biglietto scritto a mano e confezione regalo</li>
  <li><b>Consegna</b>: in guanti bianchi, a casa o dove vuoi tu</li>
</ul>
<h6>{DESCRIZIONE | Dettagli Prodotto}</h6>
<p>…1-2 paragrafi…</p>
<h6>{blocco specifico per famiglia: Ingredienti / Allergeni / Menù / Significato / Dimensioni / Personalizzazione / Scheda tecnica…}</h6>
…
<h6>{Regala con Deluxy | Perfetto per}</h6>
<p>Ideale per:</p>
<ul><li>Compleanni</li><li>Anniversari</li>…</ul>
```

- **Blocco iniziale a 3 `<li><b>`**: Gifts 47/53, Business 48/55. Eccezioni Gifts: `selezione-mignon`, `edamame`, `copy-of-omakase`, `bracciale-mongolfiera…` (li senza `<b>`, stile vecchio con `style` inline), `voucher-aperitivo-deluxy` (1 li), `lezione-privata-con-chef` (etichette Voucher / Consegna del voucher). Eccezioni Business: `the-grand-soiree-by-deluxy`, `caviar-champagne-experience` (2 li, senza Consegna), `copy-of-box-aperitivo-caviale-1` e i 2 `cofanetto-macarons…` (stile vecchio), `_additional-price` (prodotto nascosto dell'app EZ Product Options).
- **Prima etichetta**: coincide con il `productType` in 25/53 (Gifts) e 36/55 (Business). Quando differisce è il singolare o un sinonimo: `Torte→Torta`, `Cappelliere→Cappelliera`, `Cesti Floreali→Cesto Floreale`, `Rose→Fiori`, `Vini→Champagne/Spumante`, `Colazioni & Brunch→Brunch/Colazione`, `Cene→Cena di compleanno`, `Servizi Deluxy→Servizio Deluxy`, `Gift Card→Servizio Deluxy`. In Business la prima etichetta è quasi sempre il productType letterale (`B2B Lunch`, `B2B Break`, `Boutique Activation`, `Regalistica Natale 2026`).
- **Riga Inclusi**: "biglietto scritto a mano e confezione regalo" in 44/53 Gifts e 42/55 Business; varianti Business: "personalizzazione desiderata" (5, prodotti personalizzabili), "personalizzazione esperienza e prodotti" (2, Boutique Activation).
- **Riga Consegna**: Gifts = "in guanti bianchi, a casa o dove vuoi tu" **45/53** (1 "istantanea, tramite mail" per la gift card; 7 senza). Business è **incoerente**: "…a casa o dove vuoi tu" 14, "…in ufficio o dove vuoi tu" 14, "…in azienda o dove vuoi tu" 9, "…in ufficio, a casa o dove vuoi tu" 4, "in ufficio o dove vuoi tu" (senza guanti bianchi) 2, più 5 altre micro-varianti e 6 assenti.

### A.3 Intestazioni `<h6>` ricorrenti

| Intestazione | Gifts | Business | Note |
|---|---|---|---|
| Regala con Deluxy | 32 | 24 | Chiusura con lista occasioni |
| Perfetto per | 11 | 18 | Stessa funzione, usata nei fiori e nei personalizzabili |
| Dettagli Prodotto / Dettagli / Dettagli Prodotti | 19+7+2 | 19+2 | Testo narrativo |
| DESCRIZIONE (maiuscolo) / Descrizione | 14+3 | 22 | Testo narrativo (alternativa a Dettagli Prodotto) |
| Come Funziona | 15 | 5 | Fiori (boilerplate 5 punti) e servizi |
| Allergeni | 9 | 19 | Food/torte/catering |
| Ingredienti / Ingredienti e Allergeni / Ingredienti Generici | 2+2 | 6+5 | Torte |
| Menù | 5 | 13 | Colazioni, cene, catering B2B |
| Significato | 10 | 8 | Fiori |
| Dimensioni | 7 | 8 | Fiori (taglie → n. fiori) |
| Personalizzazione | 3 | **19** | Business: blocco standard dei B2B e dei personalizzabili |
| Occasioni | 0 | **8** | Business: solo nei B2B Break/Lunch/Aperitivo/Colazione (al posto di Regala con Deluxy) |
| Conservazione / Cura / Consigli per la consumazione | 1+1+1 | 3+2+1 | Torte, fiori in vaso |
| Altre (una tantum) | Scheda tecnica, Artista, Linea, Bottiglie, Accompagnamento, Champagne, Spumante, Composizione, Note aggiuntive, Modalità di utilizzo, Cosa include | Riserva Gaia, Torte, Il caviale, Pesi e misure, Menù Opzionale, Personalizzazione disponibile | |

Casing incoerente: "DESCRIZIONE" vs "Descrizione", "Dettagli Prodotto" vs "Dettagli prodotto" vs "Dettagli Prodotti", "REGALA CON DELUXY" (1). Il tema renderizza il testo così com'è, quindi la differenza si vede in pagina.

### A.4 Sequenze di h6 per famiglia (dal campione)

**Gifts**
- Torte/Dolci/Colazioni/Cene: `DESCRIZIONE > Ingredienti > Allergeni > Regala con Deluxy` (sacher) oppure `DESCRIZIONE > Menù > Allergeni > Regala con Deluxy` (4: brunch-martesana-milano, colazione-tasting-malia-milano, cena-marocchina-*). Cake design: `Caratteristiche/DESCRIZIONE > Ingredienti Generici > Allergeni > Consigli per la consumazione/Conservazione` (zodiaco-cake, summer-number) — **senza** blocco occasioni finale.
- Fiori/Rose/Cesti/Cappelliere/Rosa eterna/Piante (10/53): `Dettagli Prodotto > Come Funziona > [Significato] > Dimensioni > Perfetto per` (bouquet-ortensie-rosa-e-fucsia, maxi-bouquet-rose-colorate, rosa-eterna-*). Fiori d'Arte: `Dettagli Prodotto > Significato > Dimensioni > Perfetto per` (hokusai, botticelli) senza Come Funziona.
- Box/Gastronomia: `Dettagli Prodotti > [Accompagnamento] > Regala con Deluxy` (degustazione-macarons-con-champagne-2-persone, cofanetto-regalo-gourmet-enrico-rizzi).
- Vini/Spirits: `Champagne|Spumante > Dettagli Prodotto (lista denominazione/varietà/regione/gradazione/temperatura) > Regala con Deluxy` (dom-perignon-moet-chandon); `Dettagli Prodotto > Bottiglie > Regala con Deluxy` (piccola-degustazione-*).
- Oggetti (Arte, Borse, Accessori, Peluche): `DESCRIZIONE > Scheda tecnica > Artista > Regala con Deluxy` (scultura-royalty), `DESCRIZIONE > Dettagli (lista Materiale/Manico/Chiusura/Colore/Dimensioni) > Linea > Regala con Deluxy` (temini-casa), `DESCRIZIONE > Personalizzazione > Regala con Deluxy` (calze-*).
- Servizi/Gift card: `Descrizione > Come Funziona > [Ingredienti e Allergeni] > Regala con Deluxy` (lezione-privata-con-chef, servizio-ncc, voucher-colazioni-stellate).

**Business**
- Catering B2B (Break/Lunch/Aperitivo/Colazione, 7/55): `DESCRIZIONE > Menù > Allergeni > Personalizzazione > Occasioni` (lunch-con-gift-1, maternita-1, back-to-office-aperitif, coffee-con-gift). I sotto-blocchi sono elenchi di `<p>` (una voce per paragrafo), non `<ul>`.
- Regali personalizzabili / Regalistica Natale / Boutique Activation (9/55): `Dettagli Prodotto|DESCRIZIONE > Personalizzazione > Perfetto per` (palloncini-personalizzabili, biscotti-con-box-personalizzabile, cesto-gourmet-natalizio-personalizzabile, the-grand-soiree-by-deluxy).
- Torte/Dolci (5): `DESCRIZIONE > Ingredienti > Allergeni > Regala con Deluxy` (alexander-2, martesana-3) — identico a Gifts.
- Fiori: `Dettagli Prodotto > Significato > Dimensioni > Perfetto per` (cappelliera-gerbere-colorate-1, monet, dalì); Fiori in vaso: `Dettagli Prodotto > Dimensioni > Cura > Perfetto per`.
- Vini/Spirits: come Gifts (`DESCRIZIONE > Dettagli Prodotto > Regala con Deluxy`).

### A.5 Lunghezza, lingua, tono

- Parole (testo senza tag): Gifts min 26 / **mediana 172** / max 326 / media 175; Business min 16 / **mediana 158** / max 295 / media 167.
- Descrizioni vuote: **0** in entrambi. Sotto le 30 parole: Gifts 1 (`edamame`, 26), Business 1 (`_additional-price`, prodotto tecnico).
- Per tipo (mediana parole, Gifts): Arte 326, Servizi 320, Cappelliere 309, Originali 283, Rosa Eterna 256, Rose 249, Cake Design 246, Piante 245, Fiori 228, Fiori d'Arte 227, Cesti 211, Cene 210, Food 188, Accessori 181, Peluche 176, Spirits 172, Borse 169, Dolci 154, Gift Card 154, Gastronomia 140, Mignon 137, Vini 133, Torte 124, Box 124, Degustazioni 117, Colazioni 110, Palloncini 107, Gioielli 56. Business: Cappelliere 295, CDM Adulti 294, Fiori 285, Rose 278, Originali 268, CDM Cream Tart 260, Regali personalizzabili 248, Cene 239, Torte 235, Colazioni 218, Box 216, Fiori d'Arte 213, B2B Regali 204, Fiori in Vaso 185, Regalistica Natale 159, Spirits 158, Dolci di Pasqua 152, Boutique Activation 149, Vini 135, B2B Lunch 133, B2B Break 127, B2B Colazione 125, B2B Aperitivo 119, Dolci 103.
- Lingua: italiano al 100%. Tono: seconda persona singolare ("chi ami", "il tuo regalo", "stupisci"), lessico lusso (eleganza, raffinatezza, guanti bianchi, esperienza). Business mantiene il "tu" ma sostituisce il destinatario affettivo con quello aziendale ("clienti, partner e ospiti", "identità del brand", "hospitality").
- Vendor: Gifts 20 vendor distinti (Deluxy 14, Deluxy Flowers 12, poi pasticcerie/partner), Business quasi solo `Deluxy` (43/55) + `Deluxy Flowers` 2, `CLIVATI 1969` 2, `Enrico Rizzi Milano` 2, altri 1. Le descrizioni dei partner esterni (Enrico Rizzi, Fao Schwarz, Deodato, Braccialini) sono più tecniche (schede prodotto, biografie) ma seguono lo stesso scheletro.

### A.6 Boilerplate (frasi identiche in ≥3 prodotti)

Gifts:
- Blocco "Come Funziona" dei fiori (10/53, tutti vendor Deluxy Flowers): frase in corsivo "Con Deluxy[,] i tuoi regali si trasformano in un'esperienza indimenticabile…" (esiste in 2 varianti con/senza virgola: 6 + 4) seguita da 5 coppie `<ul><li><b>Titolo</b></li></ul><p>testo</p>`: "Un'opera floreale d'autore / Realizzata dai migliori fioristi della tua città, con fiori freschi selezionati." · "Confezione regalo / Una confezione elegante per rendere il tuo regalo perfetto per chi ami." · "Un messaggio scritto a mano / Un bigliettino personalizzato con il testo da te indicato nella pagina del carrello." · "Data, ora e luogo / Scelti da te al momento dell'acquisto." · "Consegna Deluxy / Un nostro Valet in giacca e cravatta consegnerà in guanti bianchi il tuo regalo." (usa `<b>` in 9 casi e `<strong>` in 1).
- "Completano l'esperienza un bigliettino scritto a mano con la frase da te scelta e la consegna in guanti bianchi." (3, set/cene).
- Nota allergeni cake design: "Possibile presenza di frutta a guscio." (2), "La foto è a scopo illustrativo, l'aspetto potrebbe variare…" (cake design), "I fiori freschi sono soggetti a disponibilità…" (fiori d'arte).
- Blocco "Dimensioni" fiori: `<p><b>Medio:</b></p><p>4-6 fiori</p>…` con taglie Medio / Medio-Grande / Grande / Luxury / Maxi (bouquet) e Maxi / Dream / Mega Dream (cesti). I numeri di fiori cambiano per prodotto.

Business:
- Lista finale B2B (7/55): "Hospitality e welcome experience / Corporate gifting e omaggi aziendali / Eventi ed esperienze corporate / Collaborazioni e progetti di co-branding" (vini, spirits, torte).
- Lista finale fiori B2B (5): "Inaugurazioni aziendali / Meeting ed eventi corporate / Allestimenti floreali per uffici, hotel e showroom / Omaggi istituzionali e regali per clienti o partner / Ringraziamenti eleganti".
- Lista finale personalizzabili (4): "Eventi corporate e brindisi aziendali / Regali di rappresentanza e clienti premium / Hospitality in hotel e sale meeting / Cene istituzionali e celebrazioni di brand / Ringraziamenti eleganti o collaborazioni speciali".
- Blocco "Dimensioni" cappelliere/vasi: Small / Medium / Large / Extra-Large con "Diametro… circa 8-12 fiori" (4).
- Il blocco "Come Funziona" con il Valet compare solo in 2 prodotti copiati da Gifts (`cappelliera-ortensie-rosa-e-azzurre-1`, `maxi-bouquet-lavanda-e-rose-bianche`).
- Consigli torte: "Consumare entro 2-3 giorni…", "Prima di servire, lasciare la torta a temperatura ambiente per circa 20-30 minuti…" (3).

### A.7 Esempi rappresentativi (struttura)

| Famiglia | Handle | Struttura |
|---|---|---|
| Torta (Gifts) | `sacher` (124 parole, 6 varianti Porzioni) | ul 3 li (Torta/Inclusi/Consegna) → h6 DESCRIZIONE p → h6 Ingredienti p → h6 Allergeni ul + `<i>` nota contaminazione → h6 Regala con Deluxy ul 5 occasioni |
| Cake design (Gifts) | `zodiaco-cake` (218, 10 var.) | ul 3 li → h6 Caratteristiche p + `<i>` foto illustrativa → h6 Ingredienti Generici p (allergeni in MAIUSCOLO) → h6 Allergeni ul → h6 Consigli per la consumazione ul (3 regole) |
| Fiori (Gifts) | `bouquet-ortensie-rosa-e-fucsia` (228, 4 var. Dimensione) | ul 3 li (Fiori/…) → h6 Dettagli Prodotto p → h6 Come Funziona (boilerplate 5 punti) → h6 Significato p → h6 Dimensioni (4 taglie → n. fiori) → h6 Perfetto per ul |
| Cesto (Gifts) | `maxi-cesto-ortensie-rosa-e-rose` (211, 6 var. Dimensione×Colore rose) | come fiori ma Dimensioni (Maxi/Dream/Mega Dream) **dopo** Perfetto per |
| Box (Gifts) | `degustazione-macarons-con-champagne-2-persone` (124, 1 var.) | ul 3 li (Box Regalo/…) → h6 Dettagli Prodotti p → h6 Accompagnamento p (champagne) → h6 Regala con Deluxy p "Ideale per:" ul |
| Vino (Gifts/Business) | `dom-perignon-moet-chandon` / `-1` (125/135, 2 var. Formato) | ul 3 li (Champagne / Vini) → h6 Champagne|DESCRIZIONE p → h6 Dettagli Prodotto ul (Denominazione, Varietà, Regione, Gradazione, Temperatura) → h6 Regala con Deluxy ul. **Stesso testo nei due siti**, cambiano solo etichetta iniziale, riga Consegna ("in ufficio") e lista finale (B2B). |
| Oggetto (Gifts) | `temini-casa` (164, 1 var.) | ul 3 li (Borsa/…) → h6 DESCRIZIONE p → h6 Dettagli ul `<b>Materiale:</b>…` → h6 Linea p → h6 Regala con Deluxy ul |
| Servizio (Gifts) | `servizio-ncc` (320, 3 var. Città) | ul 3 li (Servizio Deluxy / **Inclusa: possibilità di fattura** / Assistenza) → h6 DESCRIZIONE 4 p (uno per città) → h6 Come Funziona p → h6 Regala con Deluxy ul |
| Catering B2B | `lunch-con-gift-1` (112, 7 var. Numero di persone) | ul 3 li (B2B Lunch/…) → h6 DESCRIZIONE p → h6 Menù (4 `<p>`) → h6 Allergeni (5 `<p>`) → h6 Personalizzazione (3 `<p>`) → h6 Occasioni (3 `<p>`) |
| Personalizzabile B2B | `biscotti-con-box-personalizzabile` (248, 1 var.) | ul 3 li (Regali personalizzabili / Inclusi / Consegna "in azienda") → h6 Dettagli Prodotto p + ingredienti per tipo `<b>BISCOTTI…</b>` → h6 Personalizzazione p "Logo su box" → h6 Perfetto per ul |
| Activation B2B | `the-grand-soiree-by-deluxy` (149, 1 var. 9.500 €) | ul **2** li (Boutique Activation / Inclusi: personalizzazione esperienza e prodotti) → h6 DESCRIZIONE 3 p → h6 Personalizzazione 2 p → h6 Perfetto per ul |

---

## B. Dove vive ogni informazione (metafield)

### B.1 Gifts — tasso di compilazione e valori (53 prodotti)

| Metafield | Tipo | Compilato | Definizione | Distribuzione valori |
|---|---|---|---|---|
| `custom.nations_availability` | multi_line_text | **53/53** | sì | stringhe "ITALY-MILAN(MI) ITALY-ROMA(RM) ITALY-FLORENCE(FI) …" — 17 combinazioni distinte; **4 prodotti in formato errato** "Italia-Milano Italia-Roma Italia-Firenze" (edamame, copy-of-omakase, e 2 Food/Gioielli) |
| `prodotto.consegna` (gg_disp_min) | number_integer | 51/53 | sì (min 0 max 100) | 0 = 42, 1 = 5, 2 = 3, 5 = 1 |
| `custom.partner_id` | number_integer | 47/53 | **no** | 242 (Deluxy Flowers) 12, 128 (Deluxy) 9, 49 4, altri 17 valori |
| `custom.partner_address` | multi_line_text | 47/53 | **no** | indirizzo completo (es. "Via Monte Napoleone, 20121 Milano MI, Italia" 12) o solo "Milano" (9) |
| `custom.is_unique` | boolean | 47/53 | **no** | true 24 / false 23 (true ≈ prodotto senza varianti/taglie, ma non sempre: `selezione-mignon` true con 12 varianti) |
| `custom.not_physical` | boolean | 47/53 | **no** | false 44 / true 3 (box-gourmet-ca-del-bosco, 2 degustazioni Mazzetti — probabilmente spedizione corriere) |
| `custom.minimo_orario` | number_integer | 46/53 | sì (7-22) | 8 = 18, 7 = 11, 10 = 11, 9 = 3, 19 = 3 (cene) |
| `custom.data` | list | 46/53 | sì (Oggi/Domani/Su Prenotazione) | Oggi 40, Domani 40, Su Prenotazione 4 |
| `custom.classificazione` | list | 45/53 | sì | Prêt-à-Porter 36, Originali 10, Romantici 9, Lussuosi 3, Giganti 2 |
| `custom.occasioni` | list | 45/53 | sì (18 scelte) | Sorprese Romantiche 42, Anniversari 38, Compleanni 37, Ringraziamenti 26, San Valentino 17, Natale 13, Festa della Mamma 11, Lauree 10, Festa del Papà 9… |
| `custom.da_chi_fatto` | list | 44/53 | sì (3 scelte) | "Creato dall'Artista: " 20, "Pensato In Esclusiva per te da " 14, "Selezionato per te da " 10 |
| `custom.orario_consegna` | list | 44/53 | sì | Sera 40, In Mattinata 38, Pomeriggio 37, Dalle 8 5 |
| `custom.tipologia` | list | 43/53 | sì | Raccomandato 23, Esclusivi 8, Best Seller 7, Novità 5 |
| `bcpo.bcpo_data` | json | 18/53 | no (app Best Custom Product Options) | opzioni virtuali/extra (candeline, bigliettino, ecc.) |
| `custom.modello` (Modello Fiori) | list | 16/53 | sì | Bouquet 7, Cappelliera 3, Vetro 2, Cesto 2, Corona 1, Pianta 1 |
| `custom.fiori` | list | 15/53 | sì | Rose 12, Ortensie 4, Dalie 3, Peonie 1, Ranuncoli 1 |
| `custom.best_seller` | boolean | 14/53 | sì | true 14 (mai false) |
| `custom.citta` | list | 14/53 | sì (Milano/Roma/Firenze) | Milano 14, Roma 10, Firenze 10 |
| `custom.colore_fiori` | list | 10/53 | sì | Mix 7, White 6, Pink 5, Red 5… |
| `custom.dolci` | list | 7/53 | sì | Cioccolatini 3, Macarons 2, Gelato 1, Torte 1 (Torte non è tra le choices!), Mignon 1 |
| `global.description_tag` / `global.title_tag` | string | 6 / 5 | no (SEO legacy) | coincidono con `seo.description` / `seo.title` |
| `custom.vini` | list | 6/53 | sì | Champagne 5, Spumante 1 |
| `custom.colazione` | list | 5/53 | sì | 2 Persone 3, Brunch, Tasting, 5 Stelle, Luxury, Cena Compleanno… |
| `mc-facebook.google_product_category` | string | 3/53 | no | 887, 2899, 4748 |
| `custom.guida_misure` + `custom.url_img_dimensione` | list "SI" + url | 3/53 | sì | fiori: attiva il popup "Guida alle Misure" con immagine SIZE_BOUQUET.jpg |
| `custom.gusti` / `custom.modelli` (Modello Torta) | list | 3 / 3 | sì | Frutta 2, Cioccolato 2, Crema 1 / PanDiSpagna 2, Crostata 1 |
| `custom.descrizione_cattura_vendite` | multi_line | 3/53 | sì | testo marketing alternativo (Food/Gioielli) |
| `shopify.flavor` | list.metaobject | 1/53 | sì (standard Shopify) | |

Definizioni **mai usate** nel campione (25/48): `custom.promo`, `custom.realizzato_su_misura`, `custom.significato`, `custom.cioccolato`, `custom.tipologia_mood`, `custom.altro_artista`, `custom.ultimo_artista`, `custom.custom_product_info_*` (4), `custom.test_nations_availability`, `custom.immagine_dimensioni`, i 7 `shopify.*` standard (color-pattern, arrangement, stem-length, allergen-information, flour-grain-type, material, shape), i 4 `shopify--discovery--*`, `mm-google-shopping.custom_product`.

Compilazione per tipo (Gifts): tutti i tipi "core" (fiori, torte, box, vini, cene, palloncini, peluche…) hanno il set completo `consegna + nations + minimo_orario + da_chi_fatto + classificazione + tipologia + occasioni + data + partner_id/address + is_unique + not_physical + orario_consegna`. Fanno eccezione: **Cake Design** (solo consegna, nations, minimo_orario, partner, is_unique, not_physical, bcpo — nessun tag di catalogo), **Food** e **Gioielli** (solo consegna, nations, minimo_orario, orario_consegna, descrizione_cattura_vendite), **Gift Card** (parziale). I metafield di famiglia (`fiori`, `modello`, `colore_fiori`) sono compilati solo sui fiori; `gusti`/`modelli` solo su Torte (2/2) e 1 Cena; `vini` su Vini (2/2), 1 Cappelliera, 1 Gastronomia e 2 Cene.

### B.2 Business Deluxy — tasso di compilazione (55 prodotti)

| Metafield | Compilato | Definizione | Distribuzione |
|---|---|---|---|
| `prodotto.consegna` | 32/55 | **no** (nessuna definizione in questo negozio) | 1 = 13, 0 = 12, 2 = 6, 6 = 1 |
| `custom.partner_id` / `partner_address` | 32/55 | no | 128 ("Milano") 18, 223 3, 242 3, altri |
| `custom.is_unique` | 32/55 | no | false 25 / true 7 |
| `custom.not_physical` | 32/55 | no | false 30 / true 2 |
| `custom.nations_availability` | 32/55 | **no** | "ITALY-ROMA(RM) ITALY-MILAN(MI) ITALY-FLORENCE(FI) …" 18, altre 5 combinazioni (tutte nel formato corretto) |
| `custom.minimo_orario` | 31/55 | no | 7 = 21, 8 = 8, 10 = 2 |
| `custom.da_chi_fatto` | 24/55 | sì | "Pensato In Esclusiva per te da " 18, "Creato dall'Artista: " 4, "Selezionato per te da " 2 |
| `custom.tipologia` | 24/55 | sì | Raccomandato 14, Esclusivi 7, Best Seller 2, Novità 1 |
| `custom.data` | 21/55 | sì | Domani 15, Oggi 14, Su Prenotazione 7 |
| `custom.occasioni` | 17/55 | sì (7 scelte B2B) | Eventi Aziendali 17, Anniversari 13, "Regalo " (con spazio finale) 12, Feste Private 12, Pensionamenti 8, Natale 3 |
| `custom.gusti` / `custom.dolci` | 8 / 8 | sì | Crema 5, Cioccolato 5 / Dolci Vari 5, Torte 2 |
| `custom.tipologia_catering` | 5/55 | sì (Colazioni/Coffee Break/Business Lunch/Aperitivo) | Aperitivo 2, Colazioni 2, Business Lunch 1 |
| `custom.personalizzabile` | 5/55 | sì | true 5 |
| `bcpo.bcpo_data` | 5/55 | no | |
| `custom.modello_torta` / `custom.modello_fiori` / `custom.fiori` / `custom.vini` | 3 / 3 / 3 / 1 | sì | |
| `global.title_tag` / `description_tag` | 3 / 1 | no | |

**Definite ma mai usate**: `custom.minima_quantita`, `custom.multipli_quantita` (le uniche due definizioni "B2B" del negozio!), più i 4 `shopify--discovery--*` e `mm-google-shopping.custom_product`. Non esistono in Business le definizioni `classificazione`, `orario_consegna`, `citta`, `colore_fiori`, `best_seller`, `guida_misure`, `colazione`, `minimo_orario`, `nations_availability`, `prodotto.consegna`: i valori esistono sui prodotti (copiati da Gifts) ma **senza definizione** — nell'Admin appaiono come metafield "non strutturati".

**23/55 prodotti Business non hanno alcun metafield** (tutti quelli con handle `-1`/`-2`/`-3`, cioè duplicati importati da Gifts: lunch-con-gift-1, maternita-1, dom-perignon-*-1, cappelliera-*-1, alexander-2, martesana-3, grappa-*-1, bouquet-rose-rosse-e-girasoli-1, monet-*-1, dali-*-1…, più composizione-*, casetta-*, uovo-di-pasqua-fondente, panettone-artigianale, colazione-vegan, torta-e-bollicine). La pagina viva di `alexander-2` conferma: `data-partner-id=""`, `data-delivery-province=""`.

### B.3 Solo descrizione / solo metafield / duplicato

| Informazione | Descrizione | Metafield | Note |
|---|---|---|---|
| Occasioni | lista finale "Regala con Deluxy / Perfetto per" (Gifts 43/53) | `custom.occasioni` (45/53) | **Duplicata ma non sincronizzata**: Gifts 37/41 hanno almeno un valore in comune, ma le liste nel testo sono più lunghe e in forma diversa ("Sorprese romantiche" vs "Sorprese Romantiche", "Celebrazioni", "Congratulazioni" non esistono tra le choices). Business: 0/12 coincidono (testo B2B "Hospitality…" vs choices "Eventi Aziendali"). |
| Ingredienti, allergeni, menù, dimensioni (n. fiori), significato, scheda tecnica, cura, personalizzazione | **solo descrizione** | — | `shopify.allergen-information` esiste ma è vuoto |
| Fiore principale, modello, colore | testo narrativo | `custom.fiori`, `modello`, `colore_fiori` (solo fiori Gifts, 15-16/53) | duplicato |
| Gusto torta / modello torta | testo | `custom.gusti`, `modelli` (3/53) | duplicato, poco compilato |
| Champagne/Spumante | etichetta iniziale + h6 | `custom.vini` (6/53) | duplicato |
| Chi lo fa (artista/partner) | non nel testo (vendor nel titolo per i partner: "Brunch - Martesana Milano") | `vendor` + `custom.da_chi_fatto` + `partner_id` + `partner_address` | solo metafield; il tema compone "Creato dall'Artista: La DolceRoma" |
| Consegna: giorni minimi, orario minimo, fasce, Oggi/Domani, province | riga "Consegna: in guanti bianchi…" (generica) | `prodotto.consegna`, `minimo_orario`, `orario_consegna`, `data`, `nations_availability` | **solo metafield** (la descrizione non dice mai città/tempi, salvo Servizio NCC e gift card) |
| Città | mai nel testo (salvo NCC) | `custom.citta` (14/53) e/o opzione "Città" (1) | ridondante con nations_availability |
| Best seller / Novità / Esclusivi | no | `custom.tipologia`, `custom.best_seller`, tag "… best seller" | triplicato |
| Unicità/fisicità | no | `is_unique`, `not_physical` | solo metafield, semantica non documentata |
| Personalizzabile (B2B) | h6 Personalizzazione (19/55) | `custom.personalizzabile` (5/55) | duplicato, metafield quasi mai compilato |
| Quantità minima / multipli B2B | mai nel testo | `custom.minima_quantita`, `multipli_quantita` definiti ma **0/55** | assente ovunque; le "quantità" sono varianti "Numero di persone" |

---

## C. Opzioni e varianti

### C.1 Gifts (53 prodotti, 196 varianti)

- Varianti per prodotto: min 1 / **mediana 2** / max 12. Distribuzione: 1 var. = 20 prodotti (38%), 2 = 7, 3 = 6, 4 = 4, 5 = 4, 6 = 4, 7 = 1, 9 = 1, 10 = 2, 12 = 4.
- Nomi opzione (33 prodotti con opzioni reali): **Dimensione** 8 (fiori: Medio / Medio-Grande / Grande / Luxury / Maxi; cesti: Maxi / Dream / Mega Dream; corona: M / L / XL; a volte con suffisso "(foto)"), **Porzioni** 4 (torte: 4/5, 6/8, 10, 16, 20, 24 oppure 6, 10, 15, 20, 25, 30, 40, 50, 75, 100; cream tart "10 (1 LETTERA)"), **Colore** 3, **Composizione** 2 (Classic/Premium/Luxury; Principessa/Regina/Imperatrice), **Lucine decorative** 2 (Presenti/Assenti), **Colore rose** 2, **Numero di rose** 2, **Numero di palloncini** 2, e 1 ciascuno: Numero di praline, Quantità (500 g/750 g/1 kg), Numero Mignon + Gusto Principale (2 opzioni → 12 varianti), Champagne in glacette, Menù, Città (Milano/Roma/Firenze per NCC), Gusto, To Share (14 valori sushi), Cocktail a scelta, Formato (Standard 75 cl / Magnum 150 cl), TAGLI (gift card "50,00€"), Voucher, Taglia (calze 38-41/42-45), Caviale.
- Max 2 opzioni per prodotto (Dimensione×Colore, Dimensione×Colore rose, Numero Mignon×Gusto).
- **SKU**: 0/196 vuoti. Pattern dominante `XXXXXX-n` (6 lettere maiuscole casuali + "-" + indice variante: `RCGMCA-1…5`, `QEPGXQ-1…9`); varianti: senza trattino (`WTQFMV1`), numerico `6437364-1`, misti (`DPOYKN10` in mezzo a `VLPQAK-n` su sacher — SKU di due generazioni), minuscoli/sporchi su selezione-mignon (`rfgtjr-15`, `e223`, `a334g`, `acs8178`). Prodotti singoli: codice a 6 lettere o `DEED106`. Non c'è alcuna semantica nello SKU.
- **Prezzi**: min 3 € (voce sushi) / mediana 250 € / max 5.000 € (Mega Dream). Il prezzo **cresce sempre con la taglia** in modo non lineare: fiori 85 → 135 → 250 → 450 → 950; cesti 900 → 2.500 → 5.000; torte ~5-10 €/porzione; cake design 120 (6) → 195 (10) → … → 1.950 (100) ≈ 19,5 €/porzione costante; praline 65/80/100/125. Le opzioni colore non cambiano prezzo.
- **compareAtPrice: 0/196** usato. Nessuno sconto barrato.
- Nella pagina viva tutte le varianti hanno `taxable:false`, `inventory_management:null` (nessuna gestione scorte), `requires_shipping:true`, peso 0.

### C.2 Business (55 prodotti, 249 varianti)

- Varianti per prodotto: min 1 / **mediana 4** / max 12 (88 nella pagina viva di `palloncini-personalizzabili`: 8 numeri × 11 colori). 1 var. = 11 prodotti (20%), 4 = 8, 7 = 7, 2 = 6, 3 = 6, 5 = 6, 10 = 5.
- Nomi opzione: **Numero di persone** 11 (valori 5/10/15/20/25/50/100; anche 2/4/6/8 e 1-10), **Porzioni** 6 (6…50, come Gifts), **Dimensione** 5 / **Dimensioni** 2 (S/M/L/XL sulle cappelliere e vasi; Medio…Maxi sui bouquet), **Formato** 2, **Numero di macarons** 2 (36/72/108), **QUANTITÀ** 2 / **Quantità** 1, e singoli: Cocktail a scelta, Confezione (Cassetta in legno/Nessuna), Gusto, Grammi, Numero di palloncini, Colore, Torta con Candelina, Numero di rose (bianche), Caviale, Menù (Antipasto + Dolce…), Numero di praline.
- **Incoerenze di nome**: "Numero di persone " e "Numero di praline " con **spazio finale**, "QUANTITÀ" vs "Quantità", "Dimensione" vs "Dimensioni".
- **Varianti "Default Title" a 0,00 € mescolate a valori reali** in 6 prodotti (`lunch-box-rainbow-essenza-sushi`, `casetta-150gr-latte-fondente`, `uovo-di-pasqua-fondente`, `colazione-vegan`, `torta-e-bollicine`, `cappelliera-ortensie-rosa-e-azzurre-1`): residuo di prodotti creati senza opzioni e poi estesi. Il tema le nasconde solo se non disponibili — nel JSON pubblico di `lunch-box-rainbow` la variante "Default Title" ha `sku JYGHXP-5`.
- **SKU**: 0/249 vuoti; 74 SKU puramente numerici `4705848-1` (import), poi il pattern 6 lettere-n; `MAT4104-n` (Martesana). Stesso disordine di Gifts.
- **Prezzi**: min 0 (Default Title) / mediana 250 / max 25.000 € (Promozione 100 persone). Il catering B2B è **lineare per persona** (Lunch con gift 80 €/p.p., Back to Office Aperitif 25 €/p.p., Maternità/Promozione 250 €/p.p.), quindi "Numero di persone" è di fatto un moltiplicatore. `alexander-2` ha 15 e 20 porzioni allo stesso prezzo (115 €): errore. Cappelliere S/M/L/XL 150/300/600/900 in tutti i fiori B2B.
- **compareAtPrice: 0/249**. `quantity_rule` sempre `min 1, increment 1` (nessuna quantità minima B2B impostata a livello variante).

---

## D. Tag

### D.1 Gifts
- Tag per prodotto: min 0 / **mediana 4** / max 18; 97 tag distinti su 53 prodotti; 3 prodotti senza tag (`zodiaco-cake`, `scultura-royalty`, `box-gourmet-ca-del-bosco-delizie-salate`).
- Famiglie: **occasione** (Compleanno 15 / Compleanni 4, Natale 10, Festa Della Mamma 6, Pasqua 3, San Valentino 3, Lauree 3, Anniversari 4 / Anniversario 2, Serate Romantiche 5 / sorprese romantiche 2), **destinatario** (Per Lui 7, Per Lei 6, Pasqua per lui 6, regali compleanno bambini 4, Pasqua per bambini 2), **categoria/prodotto** (Fiori 13, Rose 8, Bouquet 7, Dolci 6, Torta 3, Champagne 4, Rose Rosse 4, Ortensie 3, Cappelliera 2, Cesti Floreali 2, palloncini 3, polaroid 3), **operativo/consegna** (oklastminute 14, Last Minute 4, lastminutenatale 1, Oggi 1, Domani 2), **stato/approvazione interna** (Approvato 5, PasticceriaApprovata 5), **best seller per collezione** (Compleanno best seller 3, cantina best seller 3, Pasqua best seller 2), **campagne** (festadelpapà2025 5, Dolci Rientri / DolciRientri 3+3, solobouquet 3), **vendor** (Enrico Rizzi, Adolfo Stefanelli, La Medina, Basara, Chef Privato).
- Duplicati per casing/forma: Compleanno/Compleanni, Anniversari/Anniversario, Dolci Rientri/DolciRientri, Fiori Misti/Fiori Mix/Mix Fiori, sorprese romantiche/Serate Romantiche.
- Replica metafield: `custom.occasioni` presente in 45, di cui **20** hanno almeno un valore identico anche nei tag (spesso con forma diversa: mf "Compleanni" ↔ tag "Compleanno"). I tag "… best seller" replicano `custom.best_seller`/`tipologia`; "Oggi"/"Domani" replicano `custom.data`; il vendor nel tag replica `vendor`.

### D.2 Business
- Tag per prodotto: min 0 / **mediana 1** / max 29; 89 distinti; **25/55 senza tag** (tutti i duplicati `-1`). Un solo prodotto (`copy-of-box-aperitivo-caviale-1`) porta 29 tag copiati da Gifts (Oggi, Domani, Dalle 10, Tutto il Giorno, Per Lei, Per Lui, CenaRomantica…).
- Famiglie B2B: Regali Aziendali 5, Regali personalizzati 5, Set compleanni 6, Compleanni 9, Aperitivo 4 / Aperitivo Lusso 3, Torte 5, boutique activation 2, Eventi 2, Regali di Natale 3, Colazione 2, Cake Design 2, Enrico Rizzi 3, Milano 3, Prêt-à-porter 2, Solo Consegna 2.
- `custom.occasioni` presente in 17, coincide con un tag in **1** solo caso.

---

## E. SEO e immagini

- **seo.title**: compilato **5/53** Gifts, **3/55** Business; mai uguale al titolo. Pattern: "{Titolo esteso} | DELUXY" ("Scultura Royalty Opera d'Arte Originale | DELUXY", "Serigrafia Pin Up in Vespa Marco Lodola | DEODATO X DELUXY", "Box Gourmet Bollicine e Delizie Salate Pregiate | DELUXY"), Business: "Biscotti Personalizzati con Box Logo | Deluxy Business". Lunghezza 27-58 caratteri (mediana 48). Nella pagina viva il `<title>` è "{Titolo} – DELUXY" (suffisso del tema) e `og:title` = titolo prodotto.
- **seo.description**: 6/53 e 1/55. Formula ricorrente (4/6): "{Cosa}: {beneficio}. Consegna in guanti bianchi[, biglietto a mano e confezione regalo DELUXY | a Milano, Roma e Firenze con Deluxy]." 128-153 caratteri (una eccezione da 2.505: `voucher-colazioni-stellate` ha incollato l'intera descrizione). Senza seo.description il tema usa i primi ~320 caratteri della descrizione (meta description di sacher = "Torta: classica sacher viennese Inclusi: biglietto scritto a mano…"): la riga a 3 punti diventa lo snippet Google.
- `global.title_tag` / `global.description_tag` (metafield legacy) coincidono con i campi SEO negli stessi prodotti.
- **Titoli**: mediana 29 caratteri (6-59). Pattern: "{Prodotto} - {Vendor|Opera|Colore}" ("Pregiate Praline Luxury - Enrico Rizzi", "Hokusai - La Grande Onda di Kanagawa", "Brunch - Martesana Milano (3 persone)"), prefisso "MAXI " per cesti/bouquet grandi, suffisso "(2 Persone)"/"(colore a scelta)"/"(da 36)". Business: titoli brevi ("Alexander", "Martesana", "Maternità", "Promozione") o inglesi ("Back to Office Aperitif", "Lunch con gift", "The Grand Soirée by Deluxy").
- **Immagini**: Gifts min 1 / mediana 2 / max 6 (1 img = 23 prodotti, 2 = 13, 3-6 = 17). Business min **0** / mediana 1 / max 5: **21/55 senza immagine** (i duplicati). Alt text Gifts: 124/126 compilati, 81 nella forma esatta "{Titolo} - DELUXY" (alt generato dal titolo), altri "Cofanetto Pregiate Praline Luxury - DELUXY" (titolo precedente rimasto). Business: 30/46 alt vuoti, 8 "{Titolo} - DELUXY", 4 descrittivi ("Box rosso con biscotti artigianali e logo personalizzabile - Regalo aziendale Deluxy Business"), 1 "… - DELUXY BOUTIQUE".
- `category` (tassonomia Shopify): Gifts 47/53 "Uncategorized", 6 assegnati (Chocolate, Cakes & Dessert Bars, Bracelets, Gift Cards, Food Items); Business 29 Uncategorized + 26 null. `templateSuffix`: sempre null/"" (un solo template prodotto).

---

## F. Pagina viva (tema)

Entrambi i negozi usano **Impulse 7.2.0** (Archetype Themes) con lo stesso set di sezioni custom: `date_topbar`, `header`, `main` (product), `Custom_Product_Section` (vuota), `sub`, `product-recommendations`, `text_and_image`, `collection-return`, `testimonials`, `recently-viewed`, 4 popup carrello (`cart_information_popup`, `cart_popup_step1/2/3`), `footer`. Business aggiunge `announcement` ("Il regalo su misura per ogni azienda. CONTATTACI ORA.") e `contact_form` ("Richiedi un listino prezzi dedicato": Nome, Email, Telefono, Messaggio).

### F.1 Cosa mostra la sezione `main` (buy box), dall'alto

1. Galleria immagini; badge **"Best Seller"** in overlay quando `custom.best_seller = true` (sacher, dom-perignon: sì; bouquet-ortensie con tipologia "Raccomandato": no).
2. Titolo (h1).
3. Riga autore: `{custom.da_chi_fatto[0]}{vendor}` con link a `/pages/{vendor con _}` → "Creato dall'Artista: La DolceRoma", "Selezionato per te da Deluxy Flowers", "Pensato In Esclusiva per te da Deluxy". Se il metafield manca, appare solo il vendor ("Deluxy", "CakeDesignME").
4. Prezzo ("Prezzo di listino €35"; Business formatta "€40,00").
5. Blocco app **Best Custom Product Options** (`vopo-block`, da `bcpo.bcpo_data`) — vuoto sui prodotti senza opzioni extra.
6. Selettore varianti a bottoni per ogni opzione; sui fiori con `custom.guida_misure = SI` l'etichetta "Dimensione" ha il link **"Guida alle Misure"** che apre un popup con `custom.url_img_dimensione` (SIZE_BOUQUET.jpg).
7. Quantità (+/−).
8. **Calendario consegna** ("Seleziona la data di consegna" / "CONSEGNA PER STUPIRE DAL {data}" / "CAMBIA LA DATA"): usa `Stardate` (oggi), una lista nascosta `<ul class="metaValue">` con un valore **per variante** (sacher 0,0,0,2,2,2; alexander-2 0,0,1,1,2,…; zodiaco-cake 5,5,…,7,7; palloncini-personalizzabili 0 con alcuni 6) e le regole "dalle 20:00 ora italiana la prima data è domani". Il valore per variante NON è nei JSON del campione (che hanno solo metafield di prodotto): è quasi certamente un metafield di variante, chiave non accertata (vedi "Non accertato").
9. Bottoni ACQUISTA / Aggiungi al carrello / WhatsApp / "Personalizza con un Nostro Esperto" (apre il popup contatti "REALIZZA UN SOGNO CON UN NOSTRO ESPERTO… dalle 7:00 alle 22:00").
10. **`product-short-description`**: il tema estrae il **primo `<ul>` della descrizione** (le 3 righe Famiglia/Inclusi/Consegna) e lo mostra sotto i bottoni. Il taglio avviene sul primo `</ul>`: per questo la riga a 3 punti deve stare all'inizio e non contenere altri `<ul>`.
11. Attributi dati per il JS di disponibilità: `data-partner-id`, `data-partner-address`, `data-delivery-province` (ricavata da `nations_availability` con la regex `\(([^)]+)\)` → la sigla tra parentesi), `data-product-unique` (`is_unique`), `data-product-physical` (`not_physical`), `data-delivery-day` (`prodotto.consegna`). Nella griglia "Prodotti consigliati" gli stessi attributi (`data-delivery-country`, `data-delivery-day`, `data-partner-id`) sono stampati per ogni prodotto: **la scheda incompleta rende invisibile/ non ordinabile il prodotto nella città scelta**.

### F.2 Sezione `sub` (sotto la galleria, tutta larghezza)
Un solo accordion **senza titolo** (`collapsible-trigger` vuoto, aperto di default) che renderizza **l'intera `descriptionHtml`** in un `.rte`: quindi le 3 righe iniziali compaiono **due volte** (buy box + descrizione). Non esistono tab "Ingredienti", "Consegna", "Spedizione" generati dal tema: **tutti i titoli di sezione visibili in pagina (DESCRIZIONE, Ingredienti, Allergeni, Regala con Deluxy…) sono gli `<h6>` scritti nella descrizione**. Nessun metafield viene renderizzato come testo in questa sezione.

### F.3 Blocchi fissi del tema (uguali per tutti i prodotti)
- Gifts `text_and_image`: "SEI A UN PASSO DAL CONCLUDERE UN'ESPERIENZA SPECIALE — PROSSIMI PASSAGGI: Data, orario e bigliettino alla pagina del carrello. Pagamento sicuro con carta, bonifico, paypal e postepay. Supporto dedicato 24/7 anche per ordini anonimi."
- Business `text_and_image`: "SCEGLI IL PARTNER GIUSTO PER LA TUA AZIENDA — VANTAGGI: Fattura elettronica su ogni ordine · Assistenza dedicata prioritaria · Ordini rapidi e gestione semplificata · Partner affidabile per forniture continuative."
- Recensioni (`testimonials`) identiche nei due siti (stesse 3 recensioni "Alessia", "Chiara"…), "Oltre 300.000 esperienze…" (Gifts) vs "Oltre 1.000.000 di esperienze…" (Business).
- Popup consegna carrello (`cart_popup_step1`): "SELEZIONA OPZIONI DI CONSEGNA — Dove / Quando"; step2 "Prodotto non ancora disponibile nella tua città. PRODOTTI SIMILI DISPONIBILI"; step3 "Deluxy in guanti bianchi non è ancora arrivato nel tuo luogo di consegna… CONTATTACI PER IL TUO REGALO". Il JS legge `nations_availability` via Storefront API e confronta le sigle provincia con l'indirizzo scelto (`defaultProvinces` di fallback: RM, MI, FI, PV, BG, MB, VA, CO…).
- Topbar "Indica il giorno di consegna desiderato" con calendario globale (Gifts ha la regola "dopo le 20:00 → domani").

### F.4 Differenze Business vs Gifts in pagina
- Nessun listino B2B, nessuna quantità minima, nessuna menzione IVA, nessun preventivo automatico: il prezzo è quello di listino, `quantity_rule min 1`, `taxable:false` come in Gifts. L'unico contenuto B2B è **statico** (announcement "CONTATTACI ORA", blocco "Fattura elettronica", form "Richiedi un listino prezzi dedicato") o **scritto nella descrizione** (Personalizzazione, Occasioni aziendali, "in ufficio / in azienda").
- Il popup contatti Business elenca "Ordini Anonimi" e ordine diverso dei canali; il calendario non ha la regola delle 20:00 nel JS (verificato solo su alexander-2).
- Formato prezzo con decimali (€40,00) in Business, senza (€35) in Gifts.

---

## G. Conclusione per il modulo «Nuovo prodotto»

### G.1 Campi minimi — Gifts (deluxy.it)

| # | Campo del modulo | Dove finisce |
|---|---|---|
| 1 | Titolo | `title` (pattern "{Prodotto} - {Vendor/Opera} ({dettaglio})") → handle automatico → alt immagini "{Titolo} - DELUXY" |
| 2 | Famiglia / tipo | `productType` (lista chiusa dei 28 tipi esistenti) → sceglie il **template di descrizione** e l'etichetta della prima riga (singolare: Torta, Cappelliera, Cesto Floreale, Fiori, Champagne…) |
| 3 | Vendor / partner | `vendor` (lista esistente) + `custom.partner_id` + `custom.partner_address` (dal partner) + `custom.da_chi_fatto` (una delle 3 formule) → riga "Creato dall'Artista: X" |
| 4 | Sintesi in una riga | `<li><b>{Famiglia}</b>: …</li>` (prima riga della descrizione, mostrata nel buy box e nello snippet SEO) |
| 5 | Testo narrativo (1-2 paragrafi) | `<h6>Dettagli Prodotto</h6>` (fiori/box/vini) o `<h6>DESCRIZIONE</h6>` (torte/oggetti/servizi) |
| 6 | Blocchi di famiglia (vedi G.3) | h6 specifici: Ingredienti + Allergeni (torte/dolci), Menù + Allergeni (colazioni/cene), Significato + Dimensioni (fiori), Dettagli tecnici (vini/oggetti), Come Funziona (servizi) |
| 7 | Occasioni (multi-scelta dalle 18 choices) | `custom.occasioni` **e** lista finale `<h6>Regala con Deluxy</h6><p>Ideale per:</p><ul>…` (generata dagli stessi valori, così restano sincronizzate) **e** tag corrispondenti (Compleanno, Natale, San Valentino…) |
| 8 | Opzione + varianti (nome opzione da lista: Dimensione, Porzioni, Colore, Formato, Numero di…; valori; prezzo per valore) | `options` + `variants` con SKU generato `{6 lettere}-{n}`; per i fiori genera anche il blocco `<h6>Dimensioni</h6>` (taglia → n. fiori) |
| 9 | Prezzo (o prezzi per variante) | `variants.price`; `compareAtPrice` sempre vuoto |
| 10 | Province servite (multi-scelta) | `custom.nations_availability` nel formato esatto `ITALY-MILAN(MI) ITALY-ROMA(RM) …` (+ `custom.citta` per Milano/Roma/Firenze) |
| 11 | Consegna: giorni minimi (0/1/2/5), orario minimo (7/8/9/10/19), fasce (In Mattinata/Pomeriggio/Sera/Dalle 8), disponibilità (Oggi/Domani/Su Prenotazione) | `prodotto.consegna`, `custom.minimo_orario`, `custom.orario_consegna`, `custom.data` (+ eventuale metafield di variante per i giorni, chiave da accertare) |
| 12 | Classificazione / tipologia / best seller | `custom.classificazione` (default Prêt-à-Porter), `custom.tipologia` (default Raccomandato), `custom.best_seller` (→ badge + tag "… best seller") |
| 13 | Flag tecnici | `custom.is_unique` (true se prodotto senza taglie), `custom.not_physical` (default false) |
| 14 | Attributi di famiglia (facoltativi) | fiori: `custom.fiori`, `custom.modello`, `custom.colore_fiori`, `guida_misure`+`url_img_dimensione`; torte: `custom.gusti`, `custom.modelli`; dolci: `custom.dolci`; vini: `custom.vini`; colazioni/cene: `custom.colazione` |
| 15 | Immagini (≥1) | `images` con alt "{Titolo} - DELUXY" |
| 16 | SEO (facoltativo) | `seo.title` "{Titolo esteso} \| DELUXY" (≤60), `seo.description` "{Cosa}: {beneficio}. Consegna in guanti bianchi, biglietto a mano e confezione regalo DELUXY." (≤155) |
| 17 | Tag di categoria/destinatario | `tags`: famiglia (Fiori, Rose, Bouquet, Torta, Dolci, Champagne), destinatario (Per Lui/Per Lei), operativi (oklastminute se consegna=0), vendor |

Righe fisse generate dal template (non da compilare): "Inclusi: biglietto scritto a mano e confezione regalo", "Consegna: in guanti bianchi, a casa o dove vuoi tu", blocco "Come Funziona" per i fiori (5 punti Valet), note allergeni standard, "Ideale per:".

### G.2 Campi minimi — Business Deluxy

Stessi campi 1-17 con queste differenze:
- **Riga Consegna**: "in guanti bianchi, in ufficio o dove vuoi tu" (catering, fiori) oppure "in azienda" (regali personalizzabili); il modulo deve imporne **una** (oggi ce ne sono 10 varianti).
- **Riga Inclusi** alternativa "personalizzazione desiderata" per i personalizzabili.
- **Template catering B2B** (Break/Lunch/Aperitivo/Colazione): `DESCRIZIONE > Menù > Allergeni > Personalizzazione > Occasioni` con voci una per riga; opzione **"Numero di persone"** con prezzo = prezzo unitario × persone (il modulo può chiedere prezzo a persona + scaglioni 5/10/15/20/25/50/100); `custom.tipologia_catering` (4 choices).
- **Template personalizzabili/activation**: `Dettagli Prodotto > Personalizzazione > Perfetto per` + `custom.personalizzabile = true`; Boutique Activation senza riga Consegna.
- Lista finale B2B fissa per famiglia (vini/torte: "Hospitality e welcome experience…"; fiori: "Inaugurazioni aziendali…"; personalizzabili: "Eventi corporate e brindisi aziendali…") invece delle occasioni consumer; `custom.occasioni` ha 7 choices B2B (Eventi Aziendali, Feste Private, Pensionamenti, "Regalo ").
- **Metafield mancanti di definizione in Business**: `prodotto.consegna`, `nations_availability`, `minimo_orario`, `partner_id/address`, `is_unique`, `not_physical`, `classificazione`, `orario_consegna`, `citta`, `best_seller`, `guida_misure`. Il modulo deve scriverli lo stesso (il tema li legge) ma finché non esistono le definizioni l'Admin non li valida; consigliato crearle (fuori scopo di questa analisi).
- `custom.minima_quantita` / `multipli_quantita`: definiti ma inutilizzati e **non letti dal tema** (quantity_rule sempre 1). Se servono quantità minime B2B vanno gestite altrove (variante o app).
- Tag: minimo "Regali Aziendali" + famiglia; SEO title suffisso "| Deluxy Business".

### G.3 Blocchi boilerplate per famiglia (da template)

| Famiglia | Blocchi fissi | Blocchi da compilare |
|---|---|---|
| Fiori / Rose / Cesti / Cappelliere / Piante / Rosa eterna | riga Inclusi+Consegna; "Come Funziona" (5 punti Valet, Gifts); "Perfetto per"; tabella Dimensioni (taglie standard) | fiore e colore (riga 1), Dettagli Prodotto, Significato, n. fiori per taglia |
| Fiori d'Arte | come fiori senza Come Funziona; nota `<i>` "I fiori freschi sono soggetti a disponibilità…"; paragrafo "Deluxy ha il piacere di presentare una collezione…" | opera ispiratrice, frase-dedica in corsivo |
| Torte / Dolci / Mignon | h6 Ingredienti, Allergeni (ul), nota contaminazione o "Possibile presenza di frutta a guscio", Regala con Deluxy | descrizione, ingredienti, allergeni (scelta multipla → ul) |
| Cake Design | Caratteristiche + `<i>` "La foto è a scopo illustrativo…", Ingredienti Generici, Allergeni, Consigli per la consumazione (3 righe fisse) | descrizione decorazione |
| Colazioni / Brunch / Cene / Degustazioni | DESCRIZIONE, Menù (ul), Allergeni, Regala con Deluxy | menù voci, allergeni |
| Box / Gastronomia | Dettagli Prodotti, [Accompagnamento], Regala con Deluxy | contenuto box |
| Vini / Spirits | Dettagli Prodotto con 5 voci fisse (Denominazione, Varietà, Regione, Gradazione alcolica, Temperatura); "Bottiglie" per i set | testo cantina + 5 valori |
| Oggetti (Arte, Borse, Accessori, Peluche, Gioielli) | DESCRIZIONE, Dettagli/Scheda tecnica (ul `<b>Chiave:</b> valore`), [Artista/Linea/Personalizzazione], Regala con Deluxy | coppie chiave/valore |
| Servizi / Gift card | riga "Voucher: esperienza prenotabile entro un anno dall'acquisto", "Consegna del voucher: …", Come Funziona (ul), Regala con Deluxy | descrizione, punti inclusi |
| Catering B2B | DESCRIZIONE, Menù, Allergeni, Personalizzazione, Occasioni | tutte le voci |
| Personalizzabili B2B / Natale / Activation | Dettagli Prodotto, Personalizzazione, Perfetto per (lista fissa) | descrizione, testo personalizzazione |

### G.4 Incoerenze trovate (cosa il modulo deve impedire)

1. `nations_availability` in formato non parsabile ("Italia-Milano Italia-Roma Italia-Firenze", 4/53 Gifts): il JS del tema estrae solo le sigle tra parentesi → il prodotto non risulta disponibile in nessuna provincia. **Imporre il formato `ITALY-NOME(XX)` da lista chiusa.**
2. Business: 23/55 prodotti senza alcun metafield e 21/55 senza immagine (duplicati `-1/-2/-3` da Gifts): in pagina partner, province e giorni consegna sono vuoti. **Rendere obbligatori partner, province, consegna, immagine.**
3. Varianti "Default Title" a 0 € mescolate a varianti reali (6 Business, +1 con prezzo 0): **vietare varianti a 0 € e "Default Title" quando esistono opzioni.**
4. Nomi opzione con spazio finale ("Numero di persone ", "Numero di praline "), casing incoerente (QUANTITÀ/Quantità, Dimensione/Dimensioni): **lista chiusa di nomi opzione con trim.**
5. Riga Consegna in 10 varianti in Business; riga Inclusi assente in 9/53 e 6/55; blocco iniziale senza `<b>` (5+5 prodotti vecchio stile): **generare le tre righe dal template.**
6. Intestazioni h6 con casing e nome diversi per la stessa cosa (DESCRIZIONE/Descrizione, Dettagli Prodotto/prodotto/Prodotti, Regala con Deluxy/Perfetto per/Occasioni): **titoli h6 fissi per template.**
7. Occasioni scritte a mano nel testo che non esistono tra le choices del metafield (Celebrazioni, Congratulazioni, Sorprese, Festa della mamma minuscola) e metafield non allineato al testo (Business 0/12): **generare la lista finale dal metafield.**
8. Tag duplicati per forma (Compleanno/Compleanni, Anniversari/Anniversario, DolciRientri/Dolci Rientri, Fiori Mix/Mix Fiori/Fiori Misti) e tag stagionali fossili (festadelpapà2025, lastminutenatale): **tag da vocabolario; campagne come tag separati con scadenza.**
9. `custom.dolci` con valore "Torte" fuori dalle choices di Gifts; `custom.occasioni` Business con choice "Regalo " (spazio finale); `custom.data` compilato "Su Prenotazione" insieme a "Oggi" su alcuni prodotti: **validare contro le choices.**
10. SKU senza regola (maiuscole/minuscole, con/senza trattino, due generazioni sullo stesso prodotto — `sacher`): **generatore SKU unico `{PREFISSO}-{n}`.**
11. Vendor duplicato per apostrofo ("Mazzetti dAltavilla" / "Mazzetti d'Altavilla") e vendor Business quasi sempre "Deluxy" anche per prodotti di pasticcerie terze (alexander-2 è Martesana, riga autore mostra "Deluxy"): **vendor da lista + collegamento vendor→partner_id/address.**
12. Prezzi non monotoni (alexander-2: 15 e 20 porzioni = 115 €): **avviso se il prezzo non cresce con la taglia.**
13. Residui di copia-incolla nel HTML (`<meta charset="utf-8">`, `<div class="ewa-rteLine">`, `style` inline, `<b></b>` vuoti, `<h6>` vuoti, `<p></p>` vuoti come in `colazione-vegan` "DESCRIZIONE" vuota e "Menù Opzionale: ."): **generare HTML pulito, mai accettare HTML libero.**
14. `productType` Business incoerenti per la stessa famiglia ("Regali personalizzabili" / "Regali da Personalizzare" / "B2B Regali da Personalizzare"; "Torte" / "Torte e Pasticceria" / "CDM Adulti"; 3 prodotti senza tipo): **lista chiusa dei tipi.**
15. `is_unique = true` su prodotti con 12 varianti (`selezione-mignon`), `custom.citta` compilato solo in 14/53 mentre `nations_availability` copre le stesse città: semantica dei due flag da chiarire con chi gestisce il tema prima di automatizzarli.
16. SEO: `seo.description` con 2.505 caratteri (descrizione incollata); alt text con titolo precedente: **limiti di lunghezza e alt generato dal titolo corrente.**

### G.5 Non accertato (da verificare con Admin API o con chi gestisce il tema)
- La **chiave del metafield di variante** che alimenta `metaValue` (giorni di consegna per variante, es. sacher 0/0/0/2/2/2): il campione contiene solo metafield di prodotto e l'HTML pubblico non ne espone il nome.
- Il significato operativo esatto di `custom.is_unique`, `custom.not_physical`, `custom.classificazione` e `custom.tipologia_mood` (il tema li passa come `data-product-unique` / `data-product-physical` ma la logica JS non è stata ricostruita).
- Se `custom.citta` sia ancora letto dal tema o sia un residuo (non compare nel JS della pagina prodotto).
- Cosa mostrano `custom.custom_product_info_content_1/2` e `custom.descrizione_cattura_vendite` (definiti, ma nel campione non renderizzati — la `Custom_Product_Section` è vuota).
- Il popup carrello "Dove/Quando" e la regola "dopo le 20:00 → domani" sono stati letti dal JS ma non eseguiti: il comportamento reale con `minimo_orario` e `orario_consegna` non è stato osservato (non era consentito usare il browser).
- Il campione contiene 2 prodotti per tipo (non 6): le frequenze per tipo sono indicative.
