# Handoff — Deluxy Merchandising

Stato all'11/09/2026. Una nuova sessione deve poter riprendere da qui senza contesto.

## 🏷️ 11/09/2026 — I prodotti nati dal partner arrivano «da approvare» (sessione piattaforma, PUBBLICATO `deluxy-merchandising-icufl4arz`)

Regola dell'utente: «quando un partner crea il proprio prodotto il nome che mette è il nome partner; il prodotto finisce in Merchandising con nome uguale a quello del partner e sarà da approvare; se viene approvato finisce su Shopify».
- `POST /api/v1/prodotti` accetta `nomePartner`, `nomePartnerAttivo`, `noteSviluppo` (in creazione e, il nome partner, anche in aggiornamento — non si cancella se non arriva). La piattaforma manda, per i prodotti creati dal PARTNER: `origine: partner`, `nomePartner` = nome scritto dal partner, `fase: prototipo`, nota «Creato dal partner … dalla piattaforma il …: DA APPROVARE».
- `cambiaFase` (`src/lib/azioni.ts`): su un prodotto SENZA `shopifyId`, i tasti rapidi «Approvato» e «Pubblico» portano a `/prodotti/:id/modifica?fase=…` (banner `.avviso-info`, fase preimpostata nel modulo): è il salvataggio del modulo che crea la scheda su Shopify (approvato = bozza, pubblico = visibile — regola del 09/09). Chi è già sul negozio cambia solo fase.
- Pubblicati anche (10/09): `nomePartner` nell'API prodotti; `POST /api/v1/prodotti/disponibilita` (giorni minimi e ora minima dal calendario dei partner dei prodotti unici, chiamata dal cron della piattaforma ogni mezz'ora); 5.080 nomi partner riempiti.
- ⚠️ Il deploy in cloud prende SOLO ciò che è pushato su `scout-ui`: il lavoro locale «NON pubblicato» qui sotto non è entrato.

## 11/09/2026 — LA SCHEDA CHE SI SCRIVE E QUELLA CHE ARRIVA SU SHOPIFY SONO LA STESSA — PUBBLICATA

✅ **PUSHATO E DEPLOYATO** (utente: «fai deploy»): `origin/scout-ui` a `7f082d60`, deploy **`deluxy-merchandising-h6r9m4gfs`** (cloud), Ready, alias di produzione. Verificato in produzione: `/api/health` ok con 4 negozi; la modifica del Centrotavola Rosa Nera risponde 200 col nuovo aiuto sotto la descrizione, due link «Apri la scheda online» e nessun `schedaHtml` nascosto. Manuale ripubblicato con la riga (versione che porta anche le 5 righe dell'11/09 delle altre sessioni).

⚠️ **Da provare con l'utente**: salvare dal browser un prodotto su due siti con «Dettagli» diversi e verificare su Shopify che ogni sito abbia il suo e che «Dettagli» sia la prima tab.


Sei segnalazioni dell'utente, arrivate insieme, con una causa comune:
1. «Dettagli» su Shopify sparisce o finisce ultima;
2. i testi sotto le sezioni escono a elenco puntato;
3. una sezione corretta nella scheda di un sito torna com'era;
4. la descrizione dovrebbe finire nella prima sezione, non due volte;
5. sparita la freccia «visualizza online»;
6. su più siti, «Dettagli prodotto» e «Perfetto per» diversi tornano uguali al primo sito.

### Le cause, misurate
- **Editor per sito con stato proprio** (`EditorScheda`): un'istanza sola per
  tutte le tab, con un HTML nascosto `schedaHtml:<sito>` che al salvataggio
  vinceva sulle caselle. Cambiando tab il DOM restava quello del primo sito, e
  l'HTML nascosto prendeva il nome del secondo → (6). Correggendo una casella
  con l'editor già toccato, l'HTML vecchio la sovrascriveva → (3). L'HTML
  conteneva solo le sezioni previste: le altre sparivano al salvataggio → (1,
  «scompare»).
- **Sezioni fuori previsione in coda**: `sezioniDaScrivere` metteva in fondo
  tutto ciò che il sito non prevede. Gifts per FIORI prevede solo «Come
  Funziona», Business e Gifts per TORTE_DOLCI solo «Ingredienti»/«Regala»: la
  «Dettagli» del prodotto finiva ultima → (1, «ultima»). Le grafie «Dettagli» /
  «Dettagli Prodotto» / «Dettagli prodotti» non combaciavano fra loro.
- **Tipi delle sezioni**: 16 sezioni di prosa (Dettagli*, Ingredienti*, Regala
  con Deluxy, Significato, Conservazione) erano `elenco` o `coppie`, dedotte
  dalle vetrine l'08/09: ogni a capo diventava un pallino → (2).
- **Descrizione + Dettagli**: su 887 schede attive × sito con una «Dettagli»
  piena, **7** hanno lo stesso testo della descrizione e **880** un testo
  diverso; nei prodotti scritti dal modulo la differenza era un refuso corretto
  in uno solo dei due («macaros»/«macarons») o una rifinitura per sito, e la
  scheda stampava tutti e due → (4).
- (5) **Il link c'è** in produzione (verificato sulla modifica del Cofanetto
  Colazione); 0 pubblicazioni su 5.760 senza handle. Manca solo dove il
  prodotto non è ancora sul negozio: ora lo dice.

### Fatto (`tsc` 0)
- `descrizione-shopify.ts` (puro, usato da server E browser):
  `sezioniDaScrivere` spostata qui — previste nel loro ordine (la prima anche
  se vuota), le altre **ereditano il posto** dalla definizione con lo stesso
  nome nella categoria (`ordine − 0,5`: «Dettagli» torna prima), solo chi non
  ha definizione resta in coda; `famigliaSezione` unisce le grafie di
  «Dettagli». `componiDescrizioneHtml`: **la descrizione va nella prima
  sezione** se è vuota; se la prima sezione ha lo stesso testo (uguale, o
  stessi primi 50 caratteri) non si stampa due volte; se ha un testo suo
  diverso restano entrambi (i prodotti importati hanno la vecchia tab
  «DESCRIZIONE» ≠ «Dettagli»: buttarla sarebbe cancellare testo dal sito).
  **Un elenco di una riga è un paragrafo**: la lista vale solo con ≥ 2 righe.
- `descrizione-prodotto.ts`: solo la lettura dal database, poi il compositore.
- `EditorScheda.tsx`: **senza stato proprio**. Legge l'HTML composto dai campi
  e, mentre si scrive, lo rispezza (`spezzaDescrizioneHtml`) nei campi di QUEL
  sito; plus e descrizione solo dal sito principale. Si riscrive nel DOM solo
  quando non ha il fuoco. Niente più `schedaHtml:` (il ramo server resta,
  inerte). Il grassetto dentro un paragrafo non si conserva (non si conservava
  nemmeno prima: si perdeva al salvataggio).
- Modulo: **descrizione ↔ prima sezione** in lockstep — scrivendo la
  descrizione si riempie la prima sezione dei siti dove è vuota o uguale a
  prima; correggendo «Dettagli» del sito principale nelle caselle si corregge
  la descrizione. Caselle anche per le **sezioni che il prodotto ha e il sito
  non prevede** («già sulla scheda»). Link «Apri la scheda online ↗» anche in
  testa alla tab, o «non ancora online».
- Dati: 16 sezioni portate a `testo` (restano a elenco/coppie: Come Funziona,
  Dimensioni, Perfetto per, Personalizzazione, Pesi e Misure, Menù, Menù
  Opzionale, Occasioni, Cosa include, scegli deluxy set, Aggiunte a Pagamento).

### Verificato in locale
Composizione su prodotti veri: Macarons/Business «Dettagli prodotto · Regala»
senza intro doppia; Centrotavola Rosa Nera su Business e Gifts «Dettagli
Prodotto · Perfetto per», intro no; Magnum 244 (scheda tecnica ≠ descrizione)
tiene entrambi; Rose Rosse su Gifts «Dettagli Prodotto · Significato · Perfetto
per» (prima era in coda). Browser, modifica del Centrotavola (Business + Gifts):
casella di Gifts → editor di Gifts sì, editor di Business no; «Dettagli» di
Business → descrizione aggiornata; scritto nell'editor di Gifts → casella di
Gifts aggiornata; nessun `schedaHtml` nascosto. ⚠️ Non provato il salvataggio
dal browser.

## 10/09/2026 sera (2) — LA SEZIONE «MULTIPRODOTTO» NEL MODULO — PUBBLICATA

✅ **PUSHATO E DEPLOYATO** (utente: «fai push & deploy»): il commit `e293a53a` era già su `origin/scout-ui` (pushato da un'altra sessione col suo lavoro); deploy **`deluxy-merchandising-7flk5k0pa`** (cloud), Ready, alias di produzione. Verificato in produzione: `/api/health` ok, `/prodotti/nuovo` 200 con la card e l'input `componentiJson`, `/api/prodotti/cerca?q=cristal` risponde.

⚠️ Nello stesso `/api/health`: `esitoUltimoImport: errore` — l'import di **Flowers delle 15:10 UTC** (lanciato a mano da qualcuno) è caduto in 9 s con **«Internal error. Looks like something went wrong on our end.»**: è il messaggio di Shopify, finalmente leggibile grazie a `erroriGraphql()` di stamattina. Il retry copre 5xx, timeout e rete, **non** questo errore che arriva dentro `errors` con HTTP 200. Da valutare: trattarlo come transitorio (una riga in `graphql()`: se il messaggio dice «internal error / something went wrong», riprova). Business Deluxy e Cake, negli stessi minuti, sono andati.


Utente: «inizia a creare in nuovo prodotto una sezione opzionale "Multiprodotto"
che lo aggancia ad altri prodotti esistenti o che si possono creare velocemente».

**Casa del dato**: la stessa dei composti — `ComponenteProdotto` (composto ×
componente × quantità), quella di `/multi-prodotto` e della tab «Composizione»
della scheda prodotto. Niente tabella nuova. Valgono le regole di
`src/lib/composti.ts`: costo e prezzo si leggono dai componenti, un costo che
manca non vale zero (somma «parziale»), **almeno due componenti**.

**Fatto (`tsc` 0):**
- `src/components/Multiprodotto.tsx`: card facoltativa nel modulo (fra Tag e
  Costi), spunta «È un multiprodotto»; ricerca per nome/SKU con tendina (attivi
  prima, il prodotto stesso escluso in modifica); tabella componenti con
  listino, costo, quantità 1–999, ×; riepilogo pezzi · somma listini · costo dai
  componenti (parziale se manca); bottoni **«Usa … come prezzo»** e **«Usa …
  come costo»** (solo se il costo è completo) che scrivono nei campi del
  modulo, non li impongono; **«+ Crea un componente al volo»**: nome, categoria,
  prezzo, costo → nasce un prodotto vero in Concept con la tappa «Creato al volo
  come componente di «…»» e si aggiunge alla tabella.
- API di sessione: `GET /api/prodotti/cerca?q=&escludi=` (20 righe) e
  `POST /api/prodotti/rapido`.
- Server (`azioni-prodotto-nuovo.ts`): `componentiDalModulo()` legge
  `componentiJson`, pulisce, rifiuta un solo componente e i componenti che non
  esistono; in creazione il legame nasce col prodotto (tappa «Multiprodotto: N
  componenti»); in modifica si allinea (tolti, quantità, nuovi) e un prodotto
  non può essere componente di sé stesso. `prodotto-per-il-modulo.ts` ripropone
  i componenti in modifica e duplica.

**Verificato in locale**: pagina `/prodotti/nuovo` 200 con la card; browser:
spunta → «cristal» → 4 risultati → aggiunti «Cristal - Louis Roederer» ×3 e
«Biscotti al Burro» ×1 → hidden `componentiJson` giusto → riepilogo «4 pezzi ·
comprati separati 1.200,00 € · costo 30,00 € — parziale: 1 componente non ha un
costo» → «Usa 1.200,00 € come prezzo» scrive 1200 nel campo. Dallo stesso
ingresso del modulo (`creaProdottoCompleto`): creato un multiprodotto di prova in
Concept con 2 componenti (tappa scritta), rifiutato con 1 componente; API
`rapido` provata (prodotto 5545331, tappa giusta). Prodotti di prova cancellati:
0 rimasti.

⚠️ Non provato il salvataggio dal browser né la modifica di un composto
esistente col modulo (0 composti a catalogo prima di oggi).

## 10/09/2026 sera — PUNTO DI RIPRESA (leggere prima di tutto)

**Tutto pubblicato**, Multiprodotto compreso (deploy `7flk5k0pa`). Produzione = `origin/scout-ui` (`2da191af` + handoff), ultimo deploy
**`deluxy-merchandising-i2e2kbh3i`** (cloud, Ready, alias). `/api/health` ok: 4 negozi,
5.081 prodotti, 420 collezioni, import collezioni `ok`. Manuale ripubblicato
(registro: tre righe del 10/09 per Merchandising).

**Fatto oggi, in ordine** (dettagli nelle sezioni sotto):
1. Import collezioni: `erroriGraphql()` per gli `errors` non-lista di Shopify, retry
   su 5xx/timeout/rete, `VERSIONE_API` 2025-10 (quella che Shopify serviva già).
2. SKU: il server teneva solo le cifre (`replace(/\D/g,"")`) — 5.061 su 5.081 hanno
   lettere. Ora si accetta la forma del campo e si rifiuta dicendolo. «Cristal -
   Louis Roederer» riportato a `cntfrnc21` (era rimasto «21»).
3. Metafield sui prodotti nuovi: blocco «Campi del negozio» riacceso per sito, sette
   storiche senza definizione (`partner_id`, `partner_address`, `is_unique`,
   `not_physical`, `prodotto.consegna`, `minimo_orario`, `nations_availability`)
   dichiarate coi tipi, `attesiDaiProdotti()` (quota e valore tipico per sito),
   prefill dei `CAMPI_OPERATIVI` sui nuovi, tendina del partner. Provato con 10
   prodotti (uno per categoria): 100% dei metafield arrivati; i 10 poi cancellati
   da Shopify e dal catalogo. Rapporto: `docs/mappatura-metafield-2026-09-10.md`.
4. Strumento nuovo: `scripts/prova-metafield-nuovi.ts` (`--prova` non scrive), a
   catalogo in `scripts/README.md`.

**Decisioni prese oggi** (non riaprire senza motivo nuovo):
- I valori dei metafield restano **condivisi per chiave** fra i siti; le chiavi che
  cambiano nome fra i siti si compilano una per sito.
- «Rigenera» SKU resta solo sui prodotti nuovi.
- I prodotti di prova si cancellano (non sono dati reali).

**Da guardare domattina**: in fondo a `/collezioni`, Gifts delle 03:10 UTC — è la
prima notte col retry sul timeout; ieri era morto dopo 369 s.

**Punti aperti**: la lista ricontata è nella sezione «10/09/2026 pomeriggio» più
sotto (lingue spente su 4/4, secondo passaggio descrizioni, costi 1.198/1.199,
linee 0, `read_publications`, 127 varianti senza SKU, cookie sha256…). Tolto da
quella lista il punto 6 (campi del negozio): chiuso oggi.

## 10/09/2026 sera — I PRODOTTI NUOVI NASCEVANO SENZA METAFIELD: RIACCESO IL BLOCCO, MAPPATI I CAMPI, PROVATI 10 PRODOTTI

✅ **PUSHATO E DEPLOYATO** (utente: «cancella i prodotti di test e fai push & deploy»): origin/scout-ui a `29797ab3`, deploy **`deluxy-merchandising-i2e2kbh3i`** (cloud), Ready, alias di produzione; `/api/health` ok, `/prodotti/nuovo` 200, la modifica del Cofanetto Colazione mostra la tendina del partner di Gifts.

Utente: «assicurati che per tutti i prodotti nuovi carichiamo tutti i metafield,
fai una mappatura con 10 prodotti nuovi di test, 1 per categoria».

### Il fatto, misurato
- Il blocco «Campi del negozio» del modulo era **spento** dall'08/09 (`false &&`):
  un prodotto nuovo partiva con `metafield = {}` e nasceva su Shopify **con
  zero metafield** — niente partner, province, orario minimo, date.
- I quattro campi più usati dai siti **non hanno definizione su Shopify** e
  quindi il modulo non poteva nemmeno vederli: `custom.partner_id`,
  `custom.partner_address`, `custom.is_unique`, `custom.not_physical` (Cake
  313/315 schede attive, Business 303/342, Flowers 241/269, Gifts 772/800).
  Idem `minimo_orario`, `nations_availability` e `prodotto.consegna` su **Cake e
  Business Deluxy**, che li usano sul 90% delle schede senza definirli.
- Il `partner_id` è l'id del partner **nel vecchio gestionale** (33 valori
  distinti sugli attivi: 223 = Via Varesina/Cake, 128 = Milano/Business e
  Gifts, 242 = Monte Napoleone/Flowers…). **Nessun prodotto attivo ha un
  `fornitoreId` nostro**: l'unica mappa esistente è quella scritta sui prodotti.

### Fatto (`tsc` 0)
- **`CAMPI_SENZA_DEFINIZIONE` + `conCampiStorici()`** (`metafield-definizioni.ts`):
  le sette storiche coi tipi veri (number_integer, multi_line_text_field,
  boolean), aggiunte alle definizioni di ogni negozio che non le ha. Usate in
  `leggiModulo`, `pubblicaSuAltroNegozio`, la modifica e i dati del modulo.
- **`attesiDaiProdotti()`** (`modulo-prodotto-dati.ts`): per sito e per chiave,
  **su quale quota delle schede attive sta** e **il valore più usato**; e i
  **partner noti** per sito (id, indirizzo più usato, quanti prodotti). Letto
  dai prodotti veri a ogni apertura del modulo, non scritto a mano.
- **Modulo, blocco riacceso** nella scheda di ogni sito: campi ordinati per
  quanto il sito li usa, **asterisco sopra la metà**, «Di solito qui: …» sui
  vuoti, riassunto «N su M compilati · K attesi vuoti», **tendina del partner**
  che riempie id e indirizzo. Su un **prodotto nuovo** i campi **operativi**
  (`CAMPI_OPERATIVI` in `metafield-puro.ts`: consegna, orario minimo, date,
  orario, province, pezzo unico, non fisico, tipologia, da chi fatto, guida
  misure) **partono dal valore più usato** sul sito scelto, una volta sola per
  sito; fiori, gusti, occasioni restano vuoti perché sono contenuto.
  ⚠️ **Decisione**: i valori restano **condivisi per chiave** fra i siti (un
  solo `metafieldShopify`); le chiavi che cambiano nome fra i siti
  (`occasioni`/`occasione`, `nations_availability`/`_nations_availability`) si
  compilano una per sito. Era il dubbio che aveva fatto spegnere il blocco.
- `metafieldDaColonne` ora rimette anche le quattro storiche dalle colonne
  (`pezzoUnicoShopify`, `nonFisicoShopify`, `partnerIdShopify`,
  `partnerIndirizzoShopify`): in modifica si vedono i valori veri.

### La prova: 10 prodotti, uno per categoria — `scripts/prova-metafield-nuovi.ts`
Passa dallo **stesso ingresso del modulo** (`creaProdottoCompleto`) coi
metafield che il modulo dà a un prodotto nuovo, e rilegge da Shopify.
Rapporto: **[docs/mappatura-metafield-2026-09-10.md](mappatura-metafield-2026-09-10.md)**.

| Categoria | Negozio | Mandati | Arrivati |
|---|---|--:|--:|
| TORTE_DOLCI | Cake | 9 | 9 |
| FIORI · BOUQUET | Flowers | 11 · 10 | 11 · 10 |
| VINI_SPIRITS · ORIGINALI_DELUXY · REGALI · ARTE | Gifts | 12 · 12 · 12 · 11 | tutti |
| GASTRONOMIA · SERVIZI · GIFT_BOX | Business Deluxy | 12 · 11 · 12 | tutti |

**100% dei metafield mandati è arrivato**, con i tipi giusti, su tutti e
quattro i negozi. La prova a secco aveva trovato le tre storiche mancanti su
Cake/Business (aggiunte prima della creazione). Verificato anche nel browser
su `/prodotti/nuovo`: scelto Business Deluxy, il blocco si apre con 21 campi,
8 precompilati, 10 asterischi, 20 partner in tendina, «2 attesi vuoti» (il
partner, che sceglie chi compila).

✅ **I 10 prodotti di prova sono stati CANCELLATI** (utente: «cancella i
prodotti di test»): `productDelete` su ciascun negozio, 10 su 10 riusciti, e
tolti dal catalogo (pubblicazioni, tappe, varianti, prodotto). Ricontato: 0
rimasti. Il rapporto della mappatura resta in `docs/`.

🔴 Restano fuori dal modulo (per scelta, tipi non compilabili): i metaobject
di Shopify (`shopify.*`), i `file_reference`, il json di BCPO, `judgeme.*`
(li scrive l'app delle recensioni da sola).

## 10/09/2026 pomeriggio — L'IMPORT MORTO ALLE 10:17, LA VERSIONE API, E LA LISTA DEI PUNTI APERTI RICONTATA

### 🔴→✅ Import delle collezioni: «g.errors?.some is not a function» — PUBBLICATO

✅ **PUSHATO E DEPLOYATO alle 12:43 del 10/09** (utente: «fai push & deploy»): `origin/scout-ui` a `1d80b342` (i due commit `e4c7687c` + `71bb90a1`, più il commit del manuale di un'altra sessione che stava sopra); deploy **`deluxy-merchandising-khd3oxtn6`** col cloud, Ready, alias di produzione agganciato; `/api/health` ok con 4 negozi, `esitoUltimoImport: ok`.


`ImportCollezioni` alle 10:17–10:20 UTC: **Business Deluxy errore dopo 139 s,
Flowers e Cake errore in 0–1 s**, tutti con `g.errors?.some is not a function`
(`g` è `corpo` minificato). `/api/health` diceva `esitoUltimoImport: errore`.
Sondati i quattro negozi alle 10:35 con la stessa query: **200 e dati su 4 su
4** — il guasto era transitorio, di Shopify. Ma il nostro codice lo ha coperto:
in certi guasti Shopify mette in `errors` **una stringa** o un oggetto, non la
lista, e quattro punti della lib facevano `.some`/`.map`/`.length` sopra.
Il TypeError nostro sostituiva il messaggio vero.

Fatto (`tsc` 0):
- **`src/lib/shopify-errori.ts` · `erroriGraphql(errors)`**: qualunque forma →
  lista di `{message}`. Provata su 8 forme (undefined, null, [], lista, stringa,
  oggetto, lista mista, numero). Usata in `shopify-collezioni.ts`,
  `shopify-admin.ts`, `shopify-scrittura.ts` (`erroriDi`), `negozi.ts`
  (verifica) e `traduzioni-automatiche.ts`.
- **`graphql()` dell'import riprova anche su 5xx, timeout della singola
  richiesta ed errore di rete** (stessi 6 tentativi con attesa raddoppiata).
  Motivo: **Gifts alle 03:10 di stanotte è morto per «The operation was aborted
  due to timeout» dopo 369 s** — un solo fetch oltre i 30 s buttava via tutto;
  rilanciato alle 07:01 è andato (238 collezioni, 2.932 prodotti). Da guardare
  domattina in fondo a `/collezioni` se la notte regge da sola.
- **`VERSIONE_API` da `2024-10` a `2025-10`** (punto 12 della lista del 10/08).
  Misurato: Shopify rispondeva già con l'header `x-shopify-api-version:
  2025-10` su 4 negozi su 4, cioè serviva in silenzio la più vecchia supportata.
  Scriverla non cambia il comportamento di oggi; toglie a Shopify la scelta di
  quando spostarlo. Se si alza ancora, validare le mutation.
- **Verificato in locale**: `/api/cron/collezioni?negozio=Cake` dal dev server
  → `ok`, 47 collezioni, 451 prodotti, 3.054 appartenenze, 81 s; `/api/health`
  locale torna `esitoUltimoImport: ok`.

⚠️ Non toccato `MANUALE-DELUXY.html`: è modificato (`M`) da un'altra sessione.

### 🔴→✅ «Su modifica prodotto non c'è più l'opzione di aggiornare la SKU» (utente, 10/09) — PUBBLICATO in `khd3oxtn6`

Il campo «Codice / SKU» c'è ed è scrivibile (verificato sulla pagina di
modifica del Cofanetto Colazione, `input#codice` con `COEC408`); solo
«Rigenera» è nascosto in modifica dal 04/09, di proposito. **Il difetto era
nel server**: `leggiModulo` faceva `codice.replace(/\D/g, "")` — teneva solo le
cifre, eredità degli SKU «sette cifre», mentre dall'08/09 il modulo accetta gli
SKU storici e **5.061 prodotti su 5.081 hanno lettere**. Due effetti, tutti e
due muti:
- SKU di sole lettere («MUUNXW») → «» → il cambio **veniva ignorato**: è il
  sintomo segnalato;
- SKU misto → solo le cifre, che se libere diventano **lo SKU nuovo**.
  **È successo**: «Cristal - Louis Roederer» (Gifts + Business, 2 varianti)
  salvato alle 10:14 UTC è rimasto con `codice = "21"`. L'originale era
  **`cntfrnc21`**: lo dicono le varianti (`cntfrnc21-1/-2`, nostre e su
  Shopify, riletto in sola lettura su entrambi i negozi) e il venduto.
  ✅ **Riportato a `cntfrnc21` sul database alle 10:33 UTC** (verificato
  libero prima di scrivere). Shopify non era stato toccato: con le varianti lo
  SKU del prodotto non si manda. Nessun altro caso: gli unici `codice` solo
  numerici non a 7 cifre erano questo e «1654» (una scheda vuota del 06/09
  che si chiama «1654»).

Fatto (`tsc` 0): `FORMA_SKU` = lo stesso `pattern` del campo (3–40 caratteri:
lettere, cifre, punto, trattino basso, trattino); `codiceChiesto` si accetta se
è in forma, altrimenti `codiceRifiutato` finisce negli **avvisi** («non è
ammesso… il prodotto tiene X» / «…assegnato Y»), sia in creazione sia in
modifica. Provate 12 forme. ⚠️ **Non provato il salvataggio su un prodotto
vero**: è una scrittura sul negozio; da fare con l'utente dopo il deploy
(cambiare lo SKU di un prodotto in Concept, senza Shopify, e vedere che resta).

### Commit del 10/09 mattina che il handoff non elencava

Fra le 11:42 e le 12:15 (altra sessione), tutti già su origin e in produzione
(`cwmb5coua`, Ready): sulla scheda del cliente usciva «TORTE_DOLCI» in
grassetto per una mappa vecchia (tre schede) · quando Shopify rifiuta ora
resta scritto, e il panettone aveva l'id di un altro negozio · via il titolo
«DESCRIZIONE», che teneva «Dettagli» fuori dalla prima tab · «(Duplica) I'm
Back Cake» era una bozza dell'autosalvataggio, non un duplicato · **le bozze
fantasma si archiviano, non si cancellano** (4 chiuse) · i percorsi di
`bozze-fantasma.ts` avevano fatto fallire **due deploy** (`rn2bg2uqj`,
`gs4g6s656`), corretti.

### Punti aperti al 10/09/2026 — ricontati sul database, non ricopiati

**Freschi**
1. ✅ Pubblicati l'import sopra e lo SKU che il server scartava (`khd3oxtn6`). Resta da provare un cambio di SKU su un prodotto in Concept.
2. **Gifts di notte è fragile**: vedi sopra; il retry sul timeout è la risposta,
   da verificare domattina (03:10 UTC).
3. **Lingue**: de, es, zh-CN, ar, ja spente su **4 negozi su 4**; `read_locales`
   negato su tutti; `lingueAttiveDi()` deduce dalle traduzioni esistenti, quindi
   una lingua accesa su Shopify resterebbe spenta per l'app. Serve lo scope o un
   campo manuale in Impostazioni. **1.528 prodotti** aspettano.
4. **Secondo passaggio delle descrizioni**: `spezza-descrizioni.ts --tutti
   --negozio <X>` per i quattro negozi, uno per volta, poi `--applica`.
5. **`.env.backup-sessione`** è un file di credenziali sciolto sul disco: da
   cancellare, decisione dell'utente.
6. ✅ Modulo: campi del negozio **riaccesi** (10/09 sera), valori condivisi per chiave.
7. AI sulle sezioni: in «Pesi e Misure» l'etichetta «Varianti:» esce ripetuta.
8. **Primo punto (plus) dai prodotti pubblicati**: il parser lo dà, manca lo
   script (~3.600 letture dalle vetrine).
9. **FIORI contiene 88 prodotti compositi** («Originali Deluxy»): decidere se
   restano lì.
10. Deploy **precompilato rotto** (terzo errore muto): si pubblica col cloud,
    deroga accettata. Non riprovarlo senza una causa nuova.

**Storici, numeri di oggi**
11. **Costi di produzione: 1.198 su 1.199 attivi senza costo.** Manca il
    reimport del CSV compilato.
12. **Linee: 0. `Collezione` (PLM di maison): 0 righe.** Scelte commerciali,
    non codice.
13. **`DA_CLASSIFICARE`: 1.890.**
14. **SEO nostro: 11 prodotti con `seoTitolo`, 0 spinti** (dal modulo del 09/09).
15. **Scope mancanti su 4/4: `read_publications` e `read_locales`** →
    `pubblicataShopify` è tutto vero per ripiego; le due collezioni tecniche di
    Gifts («Globo basis collection», «Smart Products Filter Index») sono ancora
    `attiva`; **0 sospese** in tutto il database.
16. **127 varianti ACTIVE senza SKU** (schede doppie: si chiudono riconciliando);
    doppioni 236 gruppi per 525 schede (26/08), riconciliazione mai eseguita,
    `doppioniEvidenti()` taglia a 100.
17. **Giacenze: 3 varianti sopra zero**, nessuna fonte di magazzino.
18. Dalla revisione del 15/08, mai applicati: cookie di sessione **sha256 non
    HMAC**; «Elimina» negozio e «Revoca» chiave **senza conferma**; collezioni
    cancellate dal negozio **non spariscono** dall'app; niente ESLint.
19. **SSO Hub** non agganciato; fornitori locali; immagini solo via URL.
20. Fuori da quest'app: tetto connessioni assente su orders, messaging, partner,
    personale (scelta dell'utente: «sistema solo la tua parte»).

Fasi oggi: in_vendita 3.050 · archiviato 1.882 · concept 141 · approvato 6 ·
prototipo 2. Prodotti 5.081, collezioni Shopify 420.

## 10/09/2026 — LINGUE: RIVERIFICATO, E IL PASSO CHE MANCA DA QUESTA PARTE

Richiesto `shopLocales` a tutti e quattro i negozi: **«Access denied … required
`read_locales`»** su tutti e quattro. Quindi le lingue **non si possono
chiedere**, e la deduzione resta l'unica strada — ma è fondata su un fatto, non
su una stima: una lingua spenta non può avere traduzioni, e provando a
scriverci Shopify risponde «Locale is not a valid locale for the shop».

Il conto vero (l'app ne conosce 8: en fr de es ru zh-CN ar ja):

| Negozio | attive | spente |
|---|---|---|
| Flowers | en, fr | 6 |
| Gifts | en, ru | 6 |
| Cake | en | 7 |
| Business Deluxy | en | 7 |

**Spente su TUTTI e quattro: 5** — de, es, zh-CN, ar, ja. (La riga «6 lingue
spente» che girava era imprecisa: 6 è quante ne mancano a Flowers e Gifts.)

⚠️⚠️ **Accenderle su Shopify NON basta.** `lingueAttiveDi()` in
`traduzioni-automatiche.ts` deduce le lingue **da chi ha già traduzioni**: una
lingua appena accesa ne ha zero, quindi per l'app resta spenta **per sempre**.
È un cane che si morde la coda. Le vie d'uscita, in ordine di pulizia:
  1. **chiedere lo scope `read_locales`** sull'app Shopify (poi `shopLocales`
     risponde e la deduzione si butta);
  2. un campo in Impostazioni per **dichiarare a mano** le lingue di ogni
     negozio, che vince sulla deduzione.
Oggi non esiste né l'uno né l'altro.

## 10/09/2026 — LE COLLEZIONI SI VEDONO

Nella scheda del prodotto (Panoramica), raggruppate per negozio, con manuale/
automatica e il link al sito; nel modulo il blocco è tornato visibile. L'import
le scriveva già (56.820 righe) e nessuno le rileggeva.

## 09/09/2026 — LA SCHEDA APPIATTITA, E SEI CORREZIONI AL MODULO

### ✅ Le 547 descrizioni sporche sono rientrate · 🔴 resta il secondo passaggio

`ripulisci-descrizioni.ts --applica`: **547 schede**, 192.864 caratteri
ripetuti tolti, **1.108 etichette del primo punto ritrovate** su 67 nomi e
rimesse davanti al plus. Copia su file prima di toccare. Ricontrollato: 0
schede ancora da ripulire.

🔴 **Resta il secondo passaggio**: dentro parecchie descrizioni ci sono ancora i
titoli di sezione («Caratteristiche», «Ingredienti Generici», «Allergeni») col
loro testo. Il taglio conservativo non poteva provarli — quelle sezioni sono
state rinominate dall'unione dell'08/09 e non combaciano più coi nomi salvati.
Li porta fuori `spezza-descrizioni.ts`, che rilegge la vetrina:

    npx tsx scripts/spezza-descrizioni.ts --tutti --negozio Flowers
    …poi Gifts, Cake, Business Deluxy — e infine con --applica

⚠️ **Un negozio per volta**: il giro completo supera il tempo di una sessione
(Flowers da solo sono ~270 schede in 9 minuti, con la pausa obbligatoria fra le
richieste). ⚠️ **In sottofondo non funziona**: due tentativi morti su «Can't
reach database server … :6543» mentre in primo piano, negli stessi minuti, il
pooler rispondeva 5 su 5.


### ✅ PUBBLICATO — ma NON col precompilato

**LIVE `deluxy-merchandising-4fro4pgzr`** (09/09/2026 13:33), alias di produzione
agganciato, `/api/health` ok: database sì, 4 negozi su 4, 5.069 prodotti.

⚠️⚠️ **Il deploy PRECOMPILATO su quest'app è rotto: si pubblica col cloud.**

    npx vercel deploy --prod --scope deluxy        # ← questo funziona
    npx vercel deploy --prebuilt --prod --scope deluxy   # ← 8 tentativi, 8 errori

Costa minuti di build (contro la regola 4 del CLAUDE.md, che li vuole azzerati):
è la stessa deroga che AI Mail usa già, per lo stesso motivo. **Non provare a
rifare il precompilato senza una causa nuova**: sotto c'è il registro di cosa è
già stato escluso.

### 🔴 IL PRECOMPILATO: due cause trovate, una no

`vercel deploy --prebuilt --prod --scope deluxy` fallisce. Due ostacoli veri,
trovati e superati, e un terzo che resta:

1. ✅ **200 collegamenti di Windows dentro `.vercel/output`.** La build locale
   crea symlink/giunzioni (`sezioni.func → _not-found.func`, i file statici
   verso `.next/`) e il caricamento va in `ENOENT` sul primo `.func`. Si
   sostituiscono con copie vere. ⚠️ Il genitore si chiede in modo diverso a una
   cartella (`.Parent`) e a un file (`.Directory`): usandone uno solo, metà dei
   collegamenti resta senza base e lo script li cancella senza ricopiarli —
   sbagliato una volta, output da rifare.
2. ✅ **`.env` dichiarato dentro ogni funzione ma escluso dal caricamento.**
   Ogni `.vc-config.json` elencava `.env`, `.env.local`, `.env.example` e un
   `.env.backup-sessione` nel `filePathMap`, mentre `.vercelignore` — **giustamente** —
   non li carica: in produzione le variabili arrivano da Vercel, e spedire quei
   file vorrebbe dire mandare in cloud le credenziali di sviluppo. Il server
   rispondeva `ENOENT lstat '/vercel/path0/.env'`. Tolte 500 voci da 125 bundle.
3. 🔴 **Resta un terzo errore, muto**: `deploy_failed` con messaggio vuoto,
   anche con `--debug`. Non so cosa sia. Da provare: la via del cloud (push +
   build su Vercel), che però qui richiede il push.

✅ **Push fatto**: `origin/scout-ui` allineato. Il merge con i 94 commit di
origin è stato risolto misurando file per file cosa si sarebbe perso — nei file
di codice del merchandising origin era indietro (quello che «aggiungeva» era la
versione vecchia delle righe cambiate), nei documenti si sono tenute entrambe le
parti, e due voci di registro di origin sono state reinserite a mano.

⚠️ Nella cartella c'è un **`.env.backup-sessione`** lasciato da qualcuno: non
va su git né su Vercel, ma è un file di credenziali sciolto sul disco.


**Il guasto e la sua causa.** «Magnum Rosé - Ruinart» su deluxy.it si vedeva
senza tab e tutto in un paragrafo: la descrizione su Shopify **non aveva più
nessun tag**. Il tema costruisce una tab per ogni `<h6>` e i tre punti da un
`<ul>`: senza tag, niente di tutto questo.

**Come si è provato di chi era la colpa** — vale per il prossimo guasto:
dei tre Magnum gemelli, l'unico con `PubblicazioneNegozio.origine = "modulo"` e
`spintoIl` valorizzato (08/09 13:49) era **l'unico rotto**; gli altri due,
`origine = "import"` e `spintoIl` nullo, avevano ancora l'HTML giusto. E il
testo online era, parola per parola, il nostro campo `descrizione`.
→ **quando una scheda viva si guasta, si confronta con i gemelli mai toccati.**

**La causa a monte** è il campo, non la scrittura: `descrizione` contiene tutta
la pagina appiattita, titoli delle sezioni compresi, residuo degli import
precedenti a `spezzaDescrizioneHtml`. Ricomponendo, ogni sezione uscirebbe
**due volte**. Misurato: **579 schede su 3.659** (era 898 prima della cintura).

🔴 **PUNTO APERTO deciso dall'utente**: `scripts/ripulisci-descrizioni.ts`
esiste e censisce, ma **non è stato applicato in massa**. Solo `--solo RLVCMZ`.

### Le sei correzioni al modulo

1. **Immagine su tutti gli shop.** Misurato: **3.576 prodotti su 5.069 hanno la
   foto SOLO nel campo `immagine`** e appena 9 hanno righe in `media` — e
   l'elenco delle foto da pubblicare partiva dai soli `media`. Ora, in modifica,
   se `media` è vuoto si usa `prima.immagine`.
2. **«Tipo di prodotto» sui nuovi.** I tre punti che creano la scheda passavano
   `tipo: ""` e `vendor: ""`. Ora passano `m.tipoShopify` e `"Deluxy"`, e il
   modulo ha il campo (con l'elenco dei tipi già in uso). ⚠️ **Non si deduce
   dalla categoria**: la nostra REGALI là diventa «Cosmetici», «Gioielli»,
   «Gift Card», «Box Regalo»; TORTE_DOLCI diventa «Torte», «Cake Design»,
   «Dolci», «Cioccolateria». Il campo `tipoShopify` esisteva già (3.542 pieni).
3. **Brief sempre visibile.** Stava dentro `fase === "concept"` (richiesta
   dell'08/09) e su un prodotto in vendita non si vedeva — ma è **quello che
   l'AI legge**. Ora è fuori; materiali e palette restano dentro.
4. **Ordine delle sezioni: pagina nuova `/sezioni`.** La composizione già
   ordinava per `ordine`; quello che mancava era **il posto per deciderlo** —
   `SezioneCategoria` si leggeva e basta. Ora si riordina con le frecce, si
   cambia il tipo, si spegne, si aggiunge (in fondo, per non scavalcare le tab
   che il cliente già vede).
5. **Selettore file.** `accept="image/*,video/*"` sostituito con l'elenco
   esplicito delle estensioni. ⚠️ **Non è una misura**: la lentezza sta nella
   finestra del sistema operativo, fuori dalla pagina.
6. **Anteprima nella tab di ogni sito, con la matitina** (`AnteprimaSito`):
   i tre punti e le tab come usciranno, in ordine, anche in fase «approvato».
   La matitina porta al campo che scrive quella tab — non apre un secondo posto
   dove modificare la stessa cosa.

### Altre due cose

- ⭐ **Le etichette in grassetto del primo punto erano recuperabili**: sul sito
  sono `<b>Champagne</b>: Ruinart Rosé Magnum`, nel nostro `plusProdotto` era
  rimasto solo il valore. **713 etichette su 51 nomi** ritrovate dentro il testo
  appiattito. Si scrivono come `«Etichetta: valore»` dentro `plusProdotto`, che
  `punto()` rende già in grassetto: nessun campo nuovo sul Postgres condiviso.
- ✅ **Tabella prodotti: l'ordine è già dall'ultimo aggiunto** (`creatoIl desc`),
  verificato sui dati veri.

### Provato e SCARTATO

Intitolare la tab del testo libero con l'etichetta del punto («Vino Bianco»)
invece di «DESCRIZIONE». Sembrava giusto perché i due Magnum sani fanno così —
ma su **182 schede vive di Gifts lo fa zero volte**: 58 dicono «DESCRIZIONE» e
la maggioranza «DESCRIZIONE E DETTAGLI». Generalizzare da due bottiglie avrebbe
rinominato una tab che il cliente già vede. Il giro spezza→ricomponi lo diceva:
da 111/120 identiche era sceso a 97.

### ✅ RIENTRATO — «metà degli handle non risponde» era un abbaglio MIO

Avevo scritto che 60 schede su 120 davano 404 su deluxy.it e che
`PubblicazioneNegozio.handle` era fuori sincrono. **Falso.** Rimisurato con una
pausa fra le richieste e guardando i codici veri: su 120 schede **83 rispondono
200 e 37 danno 429 — zero 404**. Il 429 è il limite di richieste di Shopify:
avevo interrogato il sito a raffica e ho letto la mia stessa strozzatura come un
difetto dei dati.

⚠️ **La lezione**: `if (!r.ok)` mette nello stesso mucchio «non esiste» e «non
adesso». Un controllo di esistenza fatto a raffica su un sito vero accusa i dati
di un problema che sta nel controllo. Se serve rifarlo: pausa fra le richieste,
qualche tentativo, e i codici contati per valore invece di un booleano.

Verificato anche dal lato admin su una scheda sospetta: `status ACTIVE`,
`onlineStoreUrl` valido, `publishedAt` del 2021. L'import, del resto, l'handle
lo riallinea già a ogni giro (`shopify-collezioni.ts`).


## 08/09/2026 notte (4) — L'AI SULLE SEZIONI, PROVATA SUL SERIO: DUE DIFETTI TROVATI E CHIUSI

Provata su prodotti veri (`scripts/prova-ai-sezioni.ts`), come chiesto
dall'utente. Funzionava a metà, e i due difetti erano **miei**, non del modello.

**1. Il codice buttava via le risposte.** Su «Cuore di Cioccolato e Fragole»
l'app diceva «lasciate vuote: niente dati per scriverle» su **tutte e cinque**
le sezioni. Guardando la risposta grezza, il modello **le aveva scritte tutte** —
ma come **liste**, non come stringhe, che per una sezione «elenco» o «coppie» è
la forma naturale. Il mio codice accettava solo `typeof v === "string"` e
scartava il resto. Un difetto travestito da prudenza: sembrava che l'AI non
sapesse fare il suo lavoro. Ora accetta stringhe, liste e oggetti.

**2. Il guardrail buttava via i dati veri.** Scartava ingredienti/allergeni/pesi
quando mancavano `materiali` e `note` — ma la **descrizione** di quel prodotto
conteneva già ingredienti, allergeni e conservazione, scritti da una persona.
Ora la descrizione conta come fonte (sopra i 120 caratteri), e le istruzioni
dicono di **riportare da lì** invece di lasciare vuoto. Resta il divieto di
inventare.

**Esito della prova**, sullo stesso prodotto senza materiali né note:
Dettagli, Personalizzazione, **Ingredienti e Allergeni** (Glutine · Latte e
derivati · Uova · possibile frutta a guscio — quelli veri), Pesi e Misure,
Conservazione. Su un prodotto con sezioni già piene (Brunch Martesana) ha
toccato **solo** le due vuote.

⚠️ Da migliorare: su «Pesi e Misure» ha reso i nomi delle varianti come
«Varianti: 8 / Varianti: 10…» — il dato è giusto, l'etichetta ripetuta no.

## 08/09/2026 notte (3) — DESCRIZIONE COLLEGATA, AI SULLE SEZIONI, TRADUZIONI PER NEGOZIO

**1. Import e pubblicazione ora viaggiano insieme** (era il pezzo che mancava).
· `src/lib/descrizione-prodotto.ts`: un posto solo che dice quali sezioni
  scrivere per un prodotto su un negozio — prima le previste nel loro ordine,
  **poi quelle che il prodotto ha ma che non sono più previste**. Senza la coda,
  un testo scritto sotto una sezione poi tolta sparirebbe dalla scheda online al
  primo salvataggio, senza che nessuno lo cancelli.
· I **cinque** punti che mandavano `descrizioneHtml` su Shopify ora compongono
  (`descrizionePerNegozio(m, <sito>)`).
· L'import spezza: `descrizioneDa` tiene **solo il testo libero**, e `pezziDa`
  scrive punti e sezioni nei loro campi. ⚠️ **Solo alla creazione della scheda**:
  `sezioniScheda` tiene le sezioni **di tutti i negozi**, e scriverlo da un
  import che ne guarda uno solo cancellerebbe gli altri — e le modifiche a mano
  — ogni notte.
· Pregresso: `scripts/spezza-descrizioni.ts --applica --tutti`, che **unisce**
  invece di sovrascrivere. **222 prodotti aggiornati** su 311 letti.

**2. L'AI riempie le sezioni** (`src/lib/ai-sezioni.ts`, rotta
`/api/ai/sezioni`, bottone «✦ Compila le sezioni con l'AI» nella scheda di ogni
sito). Riempie **solo le caselle vuote**, una richiesta per sito perché le
sezioni cambiano da un negozio all'altro.
⚠️ **Il guardrail vale più della funzione**: senza materiali né note, le sezioni
di **ingredienti, allergeni, pesi, misure, conservazione** vengono **scartate
anche se il modello le ha scritte**. Un elenco di allergeni inventato non è un
testo sbagliato, è un rischio per chi lo legge. L'esito dice cosa è stato
lasciato vuoto e perché.

**3. Le traduzioni stanno col negozio.** La spunta unica diceva «le 8 lingue del
negozio» a tutti e quattro: falso. Misurate e salvate su `NegozioShopify`
(`lingueAttive`, con `scripts/lingue-dei-negozi.ts`):
**Flowers inglese+francese · Gifts inglese+russo · Cake inglese · Business
inglese**. Ora la spunta è nella scheda di ogni sito, con le **sue** lingue
(`traduci:<negozio>`), e si traduce solo dove è accesa. Aggiunto il link
**«Modifica le traduzioni su Shopify ↗»** (Translate & Adapt).
⚠️ Le lingue non si chiedono a Shopify — manca lo scope `read_locales` — si
deducono da chi ha già traduzioni: un locale spento non può averne.

**4. Gifts non ha una coppia di plus fissa** (l'utente: «per gifts ricontrolla
c'è già»). Ricontrollato su 200 schede: il 2º punto più usato copre il **26%**
ed è 1,4× il secondo; il 3º copre il **35%** ed è 1,3× il secondo. Gifts vende
beauty, food, gioielli ed esperienze, e ogni famiglia ha la sua riga. **Non è
stato scritto niente**: metterne uno vorrebbe dire stamparlo su tre prodotti su
quattro che non l'hanno mai avuto.

## 08/09/2026 notte (2) — LE SEZIONI DALLE SCHEDE VERE, I PLUS DAI PRODOTTI, E UNA REGRESSIONE CHE IL CHERRY-PICK AVEVA NASCOSTO

**🔴 Lezione che è costata una correzione persa**: pubblicando a **cherry-pick
dei singoli commit**, su origin la tendina del negozio mostrava ancora
«Business Deluxy — 90bfeb-f5.myshopify.com» — corretto in locale la mattina e
**mai arrivato online**. Il cherry-pick porta il *diff* di un commit, non lo
stato del file: se una correzione precedente non è stata portata, i commit dopo
si applicano sopra la versione vecchia e la correzione **sparisce in silenzio**.
Rimedio: la cartella `deluxy-merchandising/` è stata **allineata per intero** a
quella locale (`034eaea2`). **Regola: pubblicare la cartella, non i commit.**

**Sezioni per sito, dalle schede pubblicate.** Erano dedotte (63 categorie del
vecchio gestionale mappate a mano sulle nostre 18, quasi tutte «comuni»).
Misurato: sulle torte **Cake** usa «Ingredienti e Allergeni» unito, **Business
Deluxy** li tiene separati e chiude con «Regala con Deluxy» che su Cake non c'è.
`scripts/rifai-sezioni-dai-siti.ts`: una sezione entra se compare in **almeno
metà** delle schede di quella categoria su quel sito; grafia più usata, ordine
medio. **Create 24 sezioni per sito su 8 coppie; attive ora 87, di cui 32 per
sito.**
⚠️ La prima stesura **sostituiva**: 63 via, 23 rimaste, e le categorie con pochi
prodotti online restavano senza nessuna sezione — coi valori importati
invisibili. **L'assenza di prove non è la prova di un'assenza**: ora si aggiunge,
le sezioni del sito vincono e le comuni restano come ripiego.

**I due plus di ogni sito, dedotti dai prodotti** (`deduci-plus-sito.ts`):
Flowers «Inclusi: biglietto…» + «Consegna: dove vuoi tu»; Cake
«Personalizzabile: da tre giorni» + «Consegna: dove vuoi tu nel mondo»; Business
«Inclusi: biglietto…». 🔴 **Gifts no**: nessun testo supera la metà delle schede,
e inventarne uno vorrebbe dire stampare una riga su prodotti che non l'hanno mai
avuta.

**Modulo**: categorie in **ordine alfabetico**; **nessun negozio preselezionato**
(partiva sul primo e il negozio decide categorie, collezioni, campi e foto);
**collezioni nascoste** e **campi del negozio nascosti** su richiesta (`false &&`,
si riaccendono togliendolo).

### 🔴 IN CODA, chiesto dall'utente e NON fatto
1. **Il primo punto (plus del prodotto) importato dai prodotti pubblicati**: il
   parser lo dà (`punti[0]`), manca lo script che lo scrive prodotto per
   prodotto — sono ~3.600 letture dalle vetrine.
2. **Traduzioni per negozio**: la spunta sta nella card «Pubblicazione» e parla
   di «8 lingue» fisse. Ogni negozio ha le sue: va spostata nella scheda del
   sito con le lingue vere di quel negozio, più un link per **modificare la
   traduzione su Shopify**.
3. **L'AI deve saper riempire le sezioni di ogni categoria** (oggi scrive solo
   la descrizione).
4. **Collegare import e pubblicazione della descrizione**: vedi la nota del
   blocco precedente — vanno insieme o si cancellano le tab dal sito.

## 08/09/2026 notte — L'HTML IMPORTATO SI SPEZZA NELLE SUE PARTI, E QUATTRO RITOCCHI AL MODULO

**1. Il parser, misurato prima di scriverlo.** `scripts/censimento-descrizioni.ts`
su 160 descrizioni vere dei quattro negozi: **159 usano `<h6>`**, una `<h5>`,
una non ha titoli. I titoli sono i nostri (Dettagli, Significato, Conservazione,
Ingredienti e Allergeni, Pesi e Misure, Come Funziona, Perfetto per…), a volte
in maiuscolo. Quindi `spezzaDescrizioneHtml()` accetta h4-h6 e confronta i nomi
senza maiuscole né accenti.

**2. La prova che conta è il giro completo**: spezzare e ricomporre, poi
confrontare le PAROLE con l'originale (`scripts/prova-giro-descrizione.ts`).
Su **120 descrizioni vere**: **111 tornano identiche parola per parola, 9 sopra
il 97%, nessuna sotto**. La prima versione ne perdeva una: prendeva i primi tre
`<li>` anche quando l'elenco in cima ne aveva tredici. Regola corretta:
**l'elenco in cima è «i tre punti» solo se ha al massimo tre voci** — misurato,
205 descrizioni su 224 ne hanno esattamente tre, 19 ne hanno da quattro a
tredici e lì quell'elenco è contenuto, non riassunto.

**3. I due plus di ogni sito si possono LEGGERE dai prodotti** invece di
scriverli a mano: il 2º e il 3º punto si ripetono uguali sul negozio. Contati:
Cake «Personalizzabile: da tre giorni» 38/60 e «Consegna: dove vuoi tu nel
mondo» 57/60; Business Deluxy «Inclusi: biglietto scritto a mano e confezione
regalo» 52/60. Script pronto: `scripts/deduci-plus-sito.ts` (soglia: metà delle
schede lette; sotto soglia non scrive e lo dice). 🔴 **Non ancora lanciato.**

🔴 **L'import NON è ancora collegato al parser, ed è voluto**: spezzare e
comporre devono partire **insieme**. Se si spezza soltanto, il campo
`descrizione` si accorcia e il primo salvataggio di un prodotto **sovrascrive
su Shopify la descrizione ricca con il solo testo libero** — cioè cancella le
tab dal sito. Da fare in un colpo: import che spezza + pubblicazione che
compone.

**4. Quattro ritocchi al modulo, tutti su richiesta dell'utente:**
· **Le foto stanno nei campi comuni** («le foto sono nei campi comuni»): erano
  una card a parte dopo le schede dei siti e sembravano di un sito solo.
· **La scheda creativa** (brief, materiali, palette) compare **solo in fase
  Concept** ed è salita **subito sotto «Fase iniziale»**: serve mentre il
  prodotto si pensa, e in fondo alla pagina non la vedeva nessuno.
· **La nota della variante ha la sua colonna**: stava dentro la cella del
  prezzo partner, sotto di esso e senza intestazione — due campi in una
  casella, che sfondavano la colonna e obbligavano la tabella a scorrere di
  lato. Aggiunte le larghezze di colonna (`.tabella-varianti`) e gli input a
  larghezza piena.
· **I campi del negozio nella scheda del sito sono nascosti** («per ora
  nascondi»): mostravano i campi che quel negozio definisce con valori che
  invece sono gli stessi per tutti i siti. Per riaccenderlo: togliere
  `false &&`. Prima va deciso se i valori diventano per negozio.

## 08/09/2026 sera (2) — MODULO RISTRUTTURATO A SCHEDE PER SITO, E IL METAFIELD CHE FACEVA RIFIUTARE IL PRODOTTO

**1. Struttura chiesta dall'utente**: «informazioni comuni a tutti gli store
(nome, nome diverso, sku, categoria, fase, plus del prodotto, categoria
interna); la scelta del brand poi apre dei tab col nome del sito che contengono
tutte le info che possono cambiare per brand; da mobile si espandono in
verticale». Fatto:
· **«Comune a tutti i negozi»** — nome + nome per i partner, SKU, categoria,
  fase, classificazione interna, plus del prodotto, note, descrizione;
· **«Dove va»** — brand principale e «pubblica anche su»: è la scelta che apre
  le schede;
· **una scheda per sito**, con tab (`.tab-siti/.tab-sito`, attiva nera piena
  come sul tema) che contengono i tre punti, lo stato su quel negozio, le
  collezioni di quel negozio, le sezioni della categoria e i campi che quel
  negozio definisce. Sotto 800px la fila diventa **verticale**. Con un sito solo
  le tab non compaiono.
· ⚠️ **Tab e non accordion**: sono gli stessi campi ripetuti con contenuto
  diverso. Con l'accordion due siti restano aperti insieme e le caselle omonime
  finiscono adiacenti — è così che il testo del B2B si scrive nel campo del D2C.
· La card «Campi del negozio» separata è sparita: era la stessa cosa, per il
  solo negozio principale.

**2. 🔴→✅ IL DIFETTO VERO: un valore fuori elenco faceva rifiutare TUTTO il
prodotto.** Segnalato dall'utente con la schermata di «Magnum Rosé - Ruinart»:
«Business Deluxy non ha creato il prodotto: metafields.0.value: Value does not
exist in provided choices…». La chiave `custom.occasioni` **esiste su tutti e
due i negozi**, ma le scelte ammesse sono diverse. Filtravamo le *chiavi* per
negozio, non i *valori*.
Misurato sul caso vero: su Gifts si mandano 10 campi, su Business Deluxy 4, e
**5 occasioni su 8** («Sorprese Romantiche», «Proposte di Matrimonio»,
«Matrimoni», «Festa della Donna», «San Valentino») non sono ammesse là.
· `metafieldPerShopify` ora **scarta il valore, non il prodotto** (per le liste
  tiene le voci ammesse e butta le altre); `scartiMetafield` produce la riga di
  avviso, così la perdita non è silenziosa. Applicato ai due percorsi: creazione
  su un altro negozio e aggiornamento.

**3. `src/lib/descrizione-shopify.ts` — la descrizione come tab su Shopify.**
Formato **letto dal prodotto vero** (`deluxy.it/products/colazione-luxury-clivati-milano.js`),
non dedotto: il tema fa **una tab per ogni `<h6>`**; i tre punti stanno prima
del primo `<h6>` in un `<ul>` con l'etichetta in `<b>`; poi `<h6>DESCRIZIONE</h6>`
e una `<h6>` per sezione. `sezioniDelSito()` tiene in un posto solo la regola
«le sezioni del negozio vincono su quelle comuni» — provandola in due posti
usciva una scheda con «Menù» e «Allergeni» **doppi**.
🔴 **NON ancora collegata alla pubblicazione, e per un motivo misurato**: il
campo `descrizione` dei prodotti importati **contiene già tutta la descrizione
composta** (i tre punti, «DESCRIZIONE», «Menù», «ALLERGENI»… appiattiti in un
unico testo). Componendo ora, ogni scheda uscirebbe con il contenuto **due
volte**. Il passo giusto è **spezzare l'HTML importato nelle sue parti** al
momento dell'import (tre punti · descrizione libera · sezioni), non incollare
sopra: da fare.

## 08/09/2026 sera — SEZIONI MANCANTI AGGIUNTE E I 728 STATI IN DISACCORDO SANATI

**1. «Perché qui dice bozza?»** (segnalazione dell'utente su «Back to Office
Aperitif»): il badge diceva **«Bozza su Shopify»** accanto a **«Business Deluxy ·
attivo»**. Due badge che si contraddicevano perché leggono due campi:
`statoShopify` (la parola di Shopify, riscritta a ogni import) e `shopifyStato`
(la nostra, che l'import aggiornava **solo alla creazione della scheda**).
Misurati **728 su 3.665 in disaccordo**, di cui **85 che l'app dava per
pubblicati mentre sul negozio erano in bozza o archiviati**.
· **Causa chiusa** in `shopify-collezioni.ts`: l'aggiornamento dei prodotti
  esistenti ora scrive anche `shopifyStato`, derivandolo da `statoShopify`.
  Comanda il negozio: non sono due giudizi, sono **lo stesso fatto scritto due
  volte**, e quando due copie divergono vince quella letta dalla fonte.
· **Pregresso sanato** con `scripts/allinea-stati-shopify.ts --applica`: 515
  ACTIVE → «pubblicato», 155 DRAFT → «bozza», 58 ARCHIVED → «non_pubblicato».
  **Rileggendo: 0 in disaccordo.** Fatto con tre `updateMany`, non 728 giri.

**2. Sezioni mancanti aggiunte — 54 → 63.** Rilanciato l'import dei valori:
altre **697 caselle su 407 prodotti**; non mappati restano **2 valori in tutto**.
· Aggiunte dove servivano davvero: FIORI «Ingredienti e Allergeni», «Cura»,
  «Cosa include»; BOUQUET «Cosa include»; VINI_SPIRITS «Menù» e «Allergeni»;
  TORTE_DOLCI «Menù» e «Occasioni»; GASTRONOMIA «Dettagli Prodotto».
· Aggiunti sinonimi dove era **la stessa cosa con un altro nome**: «Ideale per»
  → «Perfetto per», «Personalizzazione disponibile» → «Personalizzazione»,
  «Descrizione»/«Dettagli» → «Dettagli Prodotto».
· ⚠️ **Perché FIORI ha «Ingredienti e Allergeni»** (domanda dell'utente): non
  sono fiori. Verificato con `scripts/chi-sono.ts`: gli 88 prodotti sono
  **compositi** — di là stavano in «Originali Deluxy» (87 su 88) — fiori +
  cioccolatini + champagne, colombe, uova di Pasqua, cream tart. Contengono
  cibo, quindi hanno ingredienti e allergeni veri e l'informazione è
  obbligatoria per legge. 🔴 **Resta da decidere se quei prodotti debbano stare
  in FIORI**: la categoria è la cosa da guardare, non la sezione.

## 08/09/2026 pomeriggio — IMPORT DAL VECCHIO GESTIONALE, I TRE PUNTI A SCHERMO, NOME PER I PARTNER, DATA DI CREAZIONE UNICA

Cinque richieste dell'utente in fila, tutte fatte e verificate.

**1. Plus del prodotto importati — 1.856.** Dal dump `localhost.sql`, colonna
`product.productAdvantageDesc`. Riconoscimento per SKU (1.768) e per nome
esatto (206); **73 nomi ambigui e 303 non ritrovati non sono stati indovinati**.
Scartati 118 valori troppo corti o di una parola sola («ciao», «chantilly»): un
plus finisce in cima alla scheda che legge il cliente.

**2. Valori delle sezioni importati — 1.667 prodotti, 8.686 caselle.** Di là i
valori stanno in `product.productCategoryMetaFields` come array **posizionale**,
allineato all'elenco di `product_category.categoryMetaFields`. Senza una mappa
di sinonimi si perdevano 1.525 valori sulle sole torte (di là «Ingredienti» e
«Allergeni» separati, da noi «Ingredienti e Allergeni»): la mappa unisce i testi
con l'etichetta di provenienza, invece di sovrascriverli. Aggiunte 4 sezioni che
di là esistevano e qui no («Regala con Deluxy» su torte, fiori e bouquet,
«Consigli per la consumazione» sulle torte): **54 sezioni in tutto**.

**3. I tre punti si vedono nel modulo**, sito per sito, come li leggerà il
cliente: il primo è il plus del prodotto e cambia mentre si digita, gli altri
due arrivano dalle impostazioni del negozio. ⚠️ Stanno **fuori** dal blocco
delle sezioni: le sezioni dipendono dalla categoria, i tre punti no — tenendoli
dentro non comparivano su un prodotto nuovo finché non si sceglieva la
categoria, cioè proprio quando servono. **I due plus del sito ora si scrivono**
in Impostazioni → il negozio (`NegozioShopify.plusUno/plusDue`).

**4. Nome visibile ai partner.** `Prodotto.nomePartner` + `nomePartnerAttivo`,
con la spunta esplicita nel modulo. ⚠️ **Dal vecchio gestionale non è arrivato
niente**: le colonne `alternateProductName` e `isAlternateProductName`
esistevano, e sono **valorizzate su 0 record su 22.026** — la funzione c'era e
non è mai stata usata. Verificato, non dedotto.

**5. Data di creazione: una sola.** Prima la tabella *sceglieva* fra
`creatoIlShopify` e `creatoIl`, e i prodotti nati qui (Concept) finivano in
fondo all'ordinamento perché non hanno la data del negozio. Ora la data è
`creatoIl`, e sui **3.657** prodotti che venivano da Shopify è stata riportata
alla data vera del negozio (la più vecchia: **05/05/2020**) con un solo `UPDATE`.
`creatoIlShopify` resta, ma solo per dire da dove viene il numero.

**Strumenti nuovi** (`scripts/`): `vecchio-gestionale.ts` è il lettore comune del
dump — dentro ci sono due trappole già pagate: l'INSERT è **spezzato su più
righe** (cercando le tuple sulla stessa riga dell'intestazione si leggono zero
prodotti **senza nessun errore**) e il dump **dichiara latin1 ma i byte sono
UTF-8** («specialità» → «specialitÃ »). Poi `importa-plus-prodotto.ts`,
`importa-valori-sezioni.ts`, `importa-nome-partner.ts`,
`allinea-data-creazione.ts`, `guarda-vecchio.ts`. Tutti hanno la prova a vuoto e
si possono rilanciare.

⚠️ **Le scritture di massa vanno a blocchi o in un `UPDATE` solo**: 1.856 giri
singoli sul pooler condiviso da quattordici app sono mezz'ora di connessioni.

## 08/09/2026 mezzogiorno — DUE CORREZIONI: il tetto di connessioni e la duplicazione che non esisteva

**1. `(EMAXCONN) max client connections reached, limit: 200`.** Dopo il deploy
delle 11:28 l'app rispondeva `database: false` su `/api/health` (3 prove su 3) e
**500 su `/collezioni`**; Marketing e CRM stavano bene. L'errore vero è nei log
di runtime. ⚠️ **Non era Postgres pieno**: `pg_stat_activity` contava **32
connessioni** (24 idle, 1 attiva) — il tetto è quello dei *client del pooler*
Supavisor, che si conta altrove.
⚠️⚠️ **CORRETTO IL 08/09 POMERIGGIO — la prima versione di questa nota era
sbagliata.** Diceva: «`db.ts` non metteva nessun `connection_limit`, quindi
Prisma ne apre `num_cpu × 2 + 1` per istanza — 17 posti per un solo `next dev`».
**Non era una misura.** La `DATABASE_URL` porta già `connection_limit=5` nella
query string e **Prisma legge il parametro dall'URL**, non da `db.ts`; in
produzione la variabile è *Sensitive* e non si può leggere, quindi il valore
vero **resta ignoto**. Segnalato dal custode delle prestazioni, verificato sul
`.env`.

**La causa vera è quasi certamente un difetto del pooler, non nostro**:
discussione Supabase #40671 e fix `supavisor#783` — i `ClientHandler`
sopravvivono a errori TLS fatali e **non rilasciano mai lo slot**, così i client
salgono a 200 in giorni mentre i backend di Postgres restano una dozzina. È
esattamente la firma vista qui: **32 backend e pooler pieno**.

**Quello che resta provato**, e resta l'unica prova causale in mano nostra:
spegnendo il `next dev` locale l'app è tornata su in **meno di 10 secondi**.
Quello che il tetto fa davvero è **imporre 3 dove l'URL diceva 5** — prudente,
non risolutivo. ⚠️ Vercel raccomanda di non scendere a 1: con Fluid Compute il
totale dipende da **quante istanze sono vive**, non da questo numero.

⚠️ Da sistemare, non qui perché è uguale in tutte le app: **`DIRECT_URL` non è
una connessione diretta** — punta a `pooler.supabase.com:5432` (session mode) e
**consuma dallo stesso budget di 200**. E il tetto da 200 è **hard-coded per
dimensione di compute**: non si alza dalla dashboard.
Rimedio applicato: `urlPooler()` come in `deluxy-marketing` —
`connection_limit=3&pool_timeout=20` **solo** su `:6543`, nel codice e non nelle
variabili d'ambiente. **Tre e non uno**: con 1 la home di Marketing andava in
`P2024 Timed out fetching a new connection`. Provata la funzione sui cinque casi
(pooler nudo, con query, già limitato a 17, diretta 5432, assente).
🔴 **Restano senza tetto**: `deluxy-orders`, `deluxy-messaging`,
`deluxy-partner`, `deluxy-personale` (contate oggi; le altre del cluster non
sono state contate). Proposta al custode nel registro delle performance: farne
una regola del Libro.

**2. `/prodotti/[id]/duplica` non esisteva.** L'azione
`duplicaProdottoCompleto` era scritta dal 07/09 e compilava, il modulo accettava
già `duplica`, ma **la pagina non era mai stata creata**: la duplicazione
chiesta dall'utente non era raggiungibile da nessun bottone. Aggiunte la pagina e
il bottone «⧉ Duplica» accanto a «✎ Modifica col modulo» sulla scheda prodotto.
Il titolo nasce con **«(Duplica) »** davanti (una volta sola: duplicando una
copia non si accumula) e il codice arriva vuoto, che è la condizione su cui
conta l'azione per rigenerare SKU e varianti.
Nel farlo, la costruzione di `iniziale` (settanta righe) è uscita dalla pagina di
modifica ed è finita in `src/lib/prodotto-per-il-modulo.ts`, con l'`include`
della query accanto: due copie sarebbero divergute al primo campo nuovo, e la
duplicazione avrebbe perso dati **in silenzio**.

**VERIFICATO in locale**: scheda prodotto 200 col bottone e il link; `/duplica`
200 col titolo «(Duplica) Colazione a 5 Stelle (2/3 Persone)», SKU nuovo
(9784268 contro 7148093 dell'originale) e il riquadro «Copia di «Colazione a 5
Stelle»» senza il prefisso ripetuto; `/modifica`, `/prodotti/nuovo` e
`/collezioni` tutte 200. `npx tsc --noEmit` pulito.

✅ **PUBBLICATO l'08/09 alle 12:00** — `deluxy-merchandising-uumlut90o`, Ready,
alias attivo; su origin come `299eaaa5`. **Verificato in produzione**: `database:
true` su **5 prove su 5** (era `false` 3 su 3), `/collezioni` **200** (era 500) in
1.138–1.976 ms a funzione calda, `/prodotti` 1.155 ms, scheda 520 ms col bottone
«⧉ Duplica», `/duplica` 601 ms col titolo «(Duplica) Colazione a 5 Stelle».
**Nessun errore nei log del deploy.**

⚠️ **Push e deploy fatti da un worktree pulito, e non per abitudine**: al momento
della pubblicazione il working tree aveva **un merge di un'altra sessione con
conflitti (`UU`)** su `docs/HANDOFF.md`, `FormProdottoNuovo.tsx` e
`modifica/page.tsx`. `vercel deploy` carica la cartella **così com'è**: da lì
sarebbero finiti in produzione i marcatori `<<<<<<<`. **Regola: prima di ogni
deploy, `git status` sulla cartella dell'app; se compare `UU`, si pubblica da un
worktree su `origin`, senza toccare il merge altrui.**

🔴 **Restano senza tetto** `deluxy-orders`, `deluxy-messaging`, `deluxy-partner`,
`deluxy-personale`: scelta dell'utente («sistema solo la tua parte»). La proposta
di farne una regola è nel registro delle performance.

## 08/09/2026 mattina — SEZIONI PER CATEGORIA E TRE PUNTI DELLA SCHEDA (nuovo punto di ripresa)

Richiesta dell'utente dell'08/09 («in impostazioni per ogni sito definisci due
plus del sito… ogni categoria poi ha delle sezioni… i 3 punti e le sezioni sono
personalizzabili per sito selezionato»). Fatto tutto tranne l'ultima parte, che
resta scritta qui sotto.

**FATTO**
- `SezioneCategoria` (categoria · negozio · nome · tipo `testo|elenco|coppie` ·
  richiesta · ordine · attiva, unica su `[categoria, negozio, nome]`),
  `Prodotto.plusProdotto`, `Prodotto.sezioniScheda` (Json),
  `NegozioShopify.plusUno/plusDue`. Schema già applicato al database condiviso.
- `scripts/importa-sezioni.ts --applica`: **50 sezioni su 11 categorie**, dal
  vecchio gestionale (`docs/categorie-vecchio-gestionale.md`, estratto dal dump
  `localhost.sql`: 63 categorie). Due **deroghe B2B** su Business Deluxy —
  GASTRONOMIA e GIFT_BOX chiudono con «Occasioni» dove il D2C chiude con «Regala
  con Deluxy». Si può rilanciare: non tocca quelle già presenti.
- Nel modulo prodotto, blocco **«Scheda sul sito · i tre punti e le sezioni»**:
  campo «Plus del prodotto» (il primo dei tre punti) e, per **ogni sito scelto**,
  i due plus del sito in sola lettura più i campi delle sezioni della categoria.
  Le consigliate hanno l'asterisco e sono contate in testa al blocco, **ma non
  bloccano il salvataggio**.
- Salvataggio: `plusProdotto` e `sezioniJson` in `azioni-prodotto-nuovo.ts`
  (creazione e modifica). In modifica si scrive sempre, anche vuoto: svuotare una
  sezione è una decisione e deve arrivare al database.
- Corretti due difetti trovati strada facendo: `.stati-negozio` e
  `.stato-negozio-riga` (commit `0ddfa50b`) erano classi **senza CSS**, e il
  modulo non riceveva `statoVoluto` dalle pubblicazioni — il selettore dello
  stato per negozio ripartiva sempre da «lascia com'è».

**VERIFICATO in locale** (dev server 3120, sessione via cookie, sola lettura):
`/prodotti/nuovo` 200 col blocco e i campi nascosti; FIORI mostra Significato ·
Dimensioni · Perfetto per; GASTRONOMIA Menù · Allergeni; TORTE_DOLCI Ingredienti
e Allergeni · Conservazione. Sul prodotto `cms222w4v008ii6m843efvj4l` (Cofanetto
Colazione, su due siti) escono **due blocchi**: Gifts con 5 sezioni fino a «Regala
con Deluxy», Business Deluxy con 4 fino a «Occasioni». `npx tsc --noEmit` pulito.

**MANCA**
- 🔴 **I due plus di ciascun sito non si impostano ancora da nessuna parte**:
  le colonne `plusUno`/`plusDue` esistono e sono lette dal modulo, ma in
  Negozi & permessi non c'è ancora il campo per scriverle. Finché sono vuote il
  modulo lo dice esplicitamente.
- 🔴 **Le sezioni non compongono ancora la descrizione HTML** che va su Shopify:
  oggi si salvano sulla scheda e basta.
- 🔴 **Le sezioni non si amministrano dall'app**: si aggiungono o si cambiano
  solo rilanciando `scripts/importa-sezioni.ts` o scrivendo su
  `SezioneCategoria`.
- ⚠️ **`/prodotti/[id]/duplica` NON ESISTE**: l'azione `duplicaProdottoCompleto`
  c'è ed è compilata, il modulo accetta `duplica`, ma la pagina non è mai stata
  creata — la duplicazione chiesta il 07/09 **non è raggiungibile da nessun
  bottone**.
- ⚠️ Il dev server va **riavviato dopo un `prisma db push`**: quello acceso
  teneva il client vecchio e `/prodotti/nuovo` rispondeva 500 («non compila» =
  client Prisma vecchio, la trappola di sempre).

## 07/09/2026 sera — PUNTO DI RIPRESA (leggere prima di tutto)

✅ **PUSHATO E DEPLOYATO alle 15:54 del 07/09** (utente: «fai push & deploy»). Push:
worktree temporaneo da `origin/scout-ui` + cherry-pick di `a5bf11b0` → origin a
`0b430e1d` (i due commit del pomeriggio erano già su origin, pushati da un'altra
sessione); nessun conflitto. Deploy `deluxy-merchandising-mpnwt016h` (production,
Ready, alias deluxy-merchandising.vercel.app), `npx vercel deploy --prod --yes
--scope deluxy`. Verificato in produzione: `/api/health` ok con 4 negozi, `/login`
200, e con la sessione `/prodotti/nuovo` mostra «Pubblica anche su» e
«Classificazione interna», la scheda di Cake ha il badge «Cake · attivo»,
`/collezioni` mostra le durate. La tabella `PubblicazioneNegozio` era già in prod.
**Stanotte** i cron girano col codice nuovo: varianti + mappa dei negozi; da
guardare domattina la durata di Gifts (03:10 UTC) in fondo a `/collezioni`.

✅ **`canaleVendite` di Business Deluxy corretto alle 16:21** (utente: «correggi
canaleVendite di Business Deluxy in Impostazioni»): da «BUsiness» a
**`business.deluxy.it`**, che è il `brand` con cui Orders registra quel negozio
(letto in `orders."NegozioShopify"`: 57 ordini già con quel nome). Scritto sulla
stessa colonna che salva il modulo di /impostazioni; in produzione il menù Ambito
mostra già `business.deluxy.it`. ⚠️ In `Vendita` non c'è ancora nessuna riga di
quel canale: l'import del venduto guarda solo gli ultimi giorni (vedi sotto per
le date degli ordini Business in Orders).

Tre cose fatte oggi sera: la diagnosi del
panettone, la **pubblicazione su più negozi**, e l'**architettura del modulo
descrizione** analizzata sui quattro siti.

🔍 **«Ho pubblicato tramite app Panettone - Cioccolato Bianco e Frutti Rossi:
come mai non è su Shopify Business?»** Contato sul database: la scheda
(`1691535`, negozio Business Deluxy) è nata alle **12:45 con fase «Concept»**,
`shopifyId` nullo, una sola tappa «Prodotto creato.», nessun tentativo verso
Shopify. **Solo la fase «Pubblico» manda il prodotto sul negozio**; la fase di
partenza del modulo è Concept e il bottone diceva «Crea prodotto», non «Crea e
pubblica»: il modulo era coerente, ma non lo diceva abbastanza. Ora sotto il
bottone, quando la fase non è Pubblico, c'è la riga «Con la fase «Concept» il
prodotto resta solo qui: per mandarlo su … scegli la fase Pubblico». Il
panettone si pubblica aprendo «✎ Modifica col modulo» e scegliendo Pubblico (non
l'ho fatto io: è una scrittura sul negozio, decide l'utente). Esiste anche la
scheda archiviata dello stesso panettone su Gifts (`PANETTONE-CIOCCOLATO-BIA`).

✅ **PUBBLICARE SU PIÙ NEGOZI, nuovi ed esistenti** (utente: «consentimi di
scegliere sia per prodotti nuovi che esistenti di selezionare più di un brand in
cui pubblicare»).
- **Tabella nuova `PubblicazioneNegozio`** (prodotto × negozio: `shopifyId`,
  `handle`, `statoShopify`, `origine` modulo | import | tolto, `spintoIl`,
  `errore`; unica su prodotto+negozio). **Creata in produzione** con
  `node scripts/crea-tabella-pubblicazioni.mjs --scrivi` (CREATE IF NOT EXISTS,
  rilanciabile): nessuna riga esistente toccata. `Prodotto.shopifyId` resta l'id
  sul negozio principale (`negozioNome`) per tutto il codice che lo legge.
- **Modulo**: sotto «Brand / negozio» c'è **«Pubblica anche su»** con un chip
  per ogni altro negozio (spento se manca `write_products`); accanto al nome dice
  «già attivo là / là in bozza / rifiutato l'ultima volta». Le collezioni
  cercabili sono quelle di tutti i negozi scelti (col nome del negozio accanto);
  i campi del negozio si scrivono anche sugli altri, sulle chiavi che quei negozi
  definiscono; il titolo della sezione Pubblicazione e i bottoni elencano i
  negozi («Crea e pubblica su Gifts, Flowers»).
- **Salvataggio** (`azioni-prodotto-nuovo.ts`): `pubblicaSuAltroNegozio` crea la
  copia su ciascun altro negozio con **gli stessi SKU** (regola del 06/09: un
  prodotto su più negozi condivide lo SKU), stessi prezzi e varianti, metafield
  filtrati sulle definizioni di quel negozio, le sue collezioni manuali, le
  **foto copiate per URL** dai Files del principale, le traduzioni fatte **una
  volta** e scritte su tutti (`CacheTraduzioni`). In modifica: chi è già su un
  negozio si aggiorna là (titolo, descrizione, stato, tag, campi, varianti per
  SKU, collezioni aggiunte/tolte di quel negozio); chi manca e la fase è Pubblico
  si pubblica come nuovo; **un negozio tolto dalla scelta torna bozza là, non si
  cancella** (`origine = tolto`, e il modulo non lo ripropone spuntato). Le foto
  nuove non si copiano su un prodotto già pubblicato altrove (avviso: dall'admin).
  Ogni negozio è un giro a sé: un rifiuto non ferma gli altri, e resta scritto
  nella riga (`errore`) e nella cronaca.
- **Scheda prodotto**: un badge per negozio («Cake · attivo», «Flowers · bozza»,
  «Business Deluxy · rifiutato»). **API `/api/v1/prodotti`** espone
  `pubblicazioni[]` (negozio, shopifyId, handle, statoShopify).
- **Import**: `registraPubblicazioni` scrive la riga di OGNI prodotto
  riconosciuto per il negozio importato (solo differenze: righe nuove in blocco,
  cambiate aggiornate) e `costruisciIndici` riconosce per id anche gli id degli
  altri negozi. ⭐ **È la risposta alla trappola «una scheda, due negozi»**:
  `Prodotto.statoShopify` lo scrive l'ultimo import della notte, la riga dice lo
  stato negozio per negozio. Riempita oggi dal PC coi quattro import: **5.731 righe** (Gifts 2.932, Business 1.715, Flowers 635, Cake 449), **1.854 schede stanno su più di un negozio**, e **173 sono attive su un negozio mentre la scheda dice il contrario** (la trappola, finalmente contata). Durate dal PC con questo passo in più: Cake 84 s, Flowers 141, Business 225, Gifts **610** (era 569 un'ora prima: le 2.932 righe nuove; le notti seguenti scrive solo le differenze).
- ⚠️ **Non provata la pubblicazione vera su due negozi**: creare un prodotto sui
  negozi vivi è una scrittura esterna e non l'ho fatta senza l'utente. Provato:
  `tsc` 0, le pagine `/prodotti/nuovo`, `/prodotti/<id>/modifica` e
  `/prodotti/<id>` rispondono 200 col chip «Pubblica anche su», l'import di Cake
  riempie la mappa (449 righe, 85 s). **Prima prova consigliata**: un prodotto
  con fase Pubblico e finestra «dal» domani → nasce **DRAFT** su entrambi i
  negozi, invisibile ai clienti, e si vede la copia.
- ⚠️ Il campo «Tipologia di vendita» **si chiama «Classificazione interna»**
  (utente: «non è una tipologia di vendita ma una classificazione app interna»);
  nel database e nell'API resta `tipologiaVendita` perché la piattaforma lo legge.

📐 **ARCHITETTURA DEL MODULO DESCRIZIONE** (utente: «analizza come Shopify fa la
descrizione dei prodotti per tutti i siti e crea l'architettura del form»).
Campione con `scripts/campione-descrizioni.ts` (210 prodotti attivi dei 4
negozi, definizioni, pagine pubbliche) in `docs/campione-descrizioni/*.json`;
**due agenti** hanno analizzato Gifts+Business e Flowers+Cake
(`docs/campione-descrizioni/analisi-*.md`, sezioni A-G con numeri e handle).
La sintesi e il disegno del modulo: **[docs/ARCHITETTURA-MODULO-DESCRIZIONE.md](ARCHITETTURA-MODULO-DESCRIZIONE.md)**.
In una riga: i quattro negozi hanno **una grammatica sola** (elenco di 3 righe
`<b>Famiglia</b>: …` / Inclusi / Consegna, poi sezioni `<h6>` per famiglia, consegna
e partner nei metafield con **chiavi diverse per negozio**), ricopiata a mano con
tutte le incoerenze del caso; il modulo giusto **non chiede una descrizione,
chiede i dati e la genera** (`componiScheda(negozio, famiglia, campi)`), con la
consegna, le occasioni e i tag da **una sorgente sola**. Niente codice scritto:
è l'architettura, da approvare prima di costruirla (ordine in §3.6).

**Da fare (in ordine):** l'utente prova il multi-brand su un prodotto (meglio
con «dal» domani); push & deploy **a comando** (con la tabella già in prod il
deploy non ha migrazioni); decidere se costruire il modulo descrizione secondo
l'architettura; il resto sotto (pomeriggio e mattina).
> ⚠️ Qui c'era ancora scritto «correggere `canaleVendite` BUsiness» **dopo che
> la voce ✅ in cima diceva che era stato fatto alle 16:21**: il documento si
> contraddiceva a quattro righe di distanza. Depennata l'08/09 insieme ai due
> controlli di stanotte, verificati sotto. È il guasto già noto di questo file —
> una riga che resta scritta dopo essere diventata falsa.

## 08/09/2026 sera — PUSHATO E DEPLOYATO (`qf91518zt`)

Push su `origin/scout-ui` col solito worktree + cherry-pick: **portati solo i
commit di Merchandising**, lasciato indietro `f95588a1` di un'altra sessione
(«cron sfalsati su cinque app») — pushare lavoro altrui che tocca cinque app
avrebbe potuto far ricostruire quelle app senza che nessuno l'avesse deciso.
Origin a `ee11ed22`. Deploy `deluxy-merchandising-qf91518zt`, production, Ready.
Verificato in produzione: `/prodotti` 200 con le colonne **Prodotto ·
Collezione · Categoria · Fase · Prezzo · Margine · Shopify · Creato** e
**7 intestazioni cliccabili**; `?ordina=prezzo&verso=desc` parte da 29.065,00 €;
`/prodotti/nuovo` 200 col modulo. **Nove cron** registrati, compreso
`/api/cron/traduzioni` alle 04:40. Cluster sano dopo il deploy (merchandising,
personale, orders, budgets tutti `database: true`).

🔴 **Trappola pagata, da ricordare: `git add <file>` prende TUTTO il file,
anche il lavoro non finito di un'altra sessione.** Il commit `79415b96`
(ordinamento colonne) ha inglobato il `duplica` a metà lasciato nel working
tree da un'altra sessione, e **il codice non compilava**: `tsc` si fermava con
«Cannot find name 'duplica'» e il deploy sarebbe fallito in build. Trovato
perché **prima di pushare si rifà il typecheck e la build**, non solo dopo
l'ultima modifica propria. Chiuso con `822edac6`, una riga (`duplica` fra i
props destrutturati) che completa il loro lavoro senza cambiarne il disegno: il
prop è opzionale, quindi la funzione resta inattiva finché non nasce la pagina
`/prodotti/[id]/duplica` che passa il flag. ⭐ **Con due sessioni sulla stessa
cartella, `git add` di un file «M» va guardato con `git diff --cached` prima di
committare.**

## 08/09/2026 — TRADUZIONI: il problema non era l'AI, erano le lingue spente

Utente: «dobbiamo fare anche le traduzioni usando l'AI ed essere sicuri ci
siano poi per ogni prodotto che carico».

🔍 **Prima il fatto, che ribalta l'idea di partenza.** Un campione di 40
prodotti diceva «quasi tutti tradotti»: **guardava solo l'inglese**. Censiti
tutti i 1.829 prodotti pubblicati sulle otto lingue
(`scripts/censimento-traduzioni.ts`, sola lettura, rapporto in
`docs/censimento-traduzioni-2026-09-08-07.md`): **nessun prodotto, su nessun
negozio, ha tutte e otto le lingue.**

| Negozio | Pubblicati | en | fr | ru | de·es·zh·ar·ja |
|---|---:|---:|---:|---:|---:|
| Gifts | 893 | 893 | 0 | 787 | 0 |
| Business Deluxy | 346 | 193 | 0 | 0 | 0 |
| Cake | 321 | 275 | 0 | 0 | 0 |
| Flowers | 269 | 268 | 268 | 0 | 0 |

🔴 **Perché: quelle lingue NON esistono sui negozi.** Provato a scrivere:
Shopify risponde **«Locale is not a valid locale for the shop»** e **rifiuta
l'intero lotto**, quindi una lingua spenta faceva perdere anche le traduzioni
buone accanto. Le lingue davvero attive, dedotte dai fatti (un locale spento
non può avere traduzioni): **`en` su tutti e quattro, più `fr` su Flowers e
`ru` su Gifts**. L'app invece assumeva **otto lingue fisse uguali per tutti** —
un'assunzione scritta nel codice dal 04/09 e mai verificata. ⚠️ **Le altre sei
lingue si attivano solo dall'admin Shopify** (Impostazioni → Lingue), negozio
per negozio: non è codice, ed è il passo che sblocca tutto il resto.

**Fatto (in locale, `tsc` 0):**
- `traduciScheda(testi, lingue?)` accetta **le lingue da chiedere**: si paga
  solo per quelle vere e non si perde il lotto per una spenta.
- **`src/lib/traduzioni-automatiche.ts`**: `lingueAttiveDi(negozio)` (deduce le
  lingue attive finché manca `read_locales`) e `completaTraduzioniDelNegozio`,
  che trova i pubblicati senza una lingua attiva e li traduce, con un tetto per
  giro.
- **Cron nuovo `/api/cron/traduzioni` alle 04:40 UTC** (in `vercel.json`), dopo
  gli import del catalogo e prima delle rotazioni: **è la risposta a «essere
  sicuri ci siano per ogni prodotto che carico»**, perché l'import non traduce
  nulla e un prodotto caricato dall'admin resterebbe scoperto per sempre.
  Tetto di 20 prodotti per negozio a giro (ogni riga costa AI + scrittura).
- **`scripts/traduci-mancanti.ts`** per il pregresso: prova a secco di default,
  `--max=`, e `docs/traduzioni-fatte.json` per riprendere senza ripagare.
- ✅ **Pregresso chiuso: 301 prodotti tradotti, 604 voci scritte, 0 errori.**
  Ricontato dopo: **le lingue attive sono al 100% su tutti e quattro i negozi**
  — Business 346/346 in inglese (erano 193), Cake 321/321 (erano 275), Flowers
  269/269 in inglese e francese, Gifts 893/893 in inglese e **893/893 in russo**
  (erano 787). Controprova sul negozio, non sullo specchio dell'app: «Torta di
  alta pasticceria…» → «High pastry cake…».
- ⚠️ **Restano 1.528 prodotti che aspettano lingue non ancora attivate**: per
  loro non c'è niente da tradurre finché non si accendono su Shopify. Appena
  attivate, il cron le riempie da solo (o `traduci-mancanti.ts` per andare più
  in fretta). Costo misurato: **~0,01 $ ogni 5 prodotti** con gpt-4o-mini.

## 08/09/2026 mattina — le tre verifiche di stanotte: tutte passate

Nessun codice toccato: solo misure sul database, alle 06:47 UTC.

✅ **Il cron del negozio nuovo ha girato da solo**: `Business Deluxy 04:15:07 ·
ok · durata 196 s`. È la prima notte con la sua riga in `vercel.json` (aggiunta
il 07/09 mattina, deployata alle 10:47): prima il negozio si sarebbe fermato
all'unico import a mano del 07/09.

✅ **«Rotazione Fiori» è scattata l'08/09 alle 05:20** («3 collezioni, 3 mandate
a Shopify»), esattamente il giorno dovuto. **È la prova sul campo della
correzione dello slittamento**: col vecchio `Math.floor` sui millisecondi la
regola avrebbe contato 6 giorni e sarebbe slittata al 09/09, come le era già
successo il 31/08. Prossima attesa: 15/09. «Best Sellers» (mensile, ultima
11/08) è dovuta il 10/09.

✅ **Gifts in 440 s** (03:10), Flowers 97, Cake 46: tutti sotto gli 800 del
limite nuovo, e Gifts resta sopra i 300 del vecchio — cioè senza la correzione
del 06/09 sarebbe morto anche stanotte. ⚠️ Dal PC lo stesso import ne ha messi
**610** il 07/09 pomeriggio (con le varianti e la mappa dei negozi in più): su
Vercel resta margine, ma è il numero da guardare quando si aggiunge lavoro
all'import.

✅ **`canaleVendite` = `business.deluxy.it` funziona davvero**: in `Vendita` ci
sono ora **4 righe** con quel canale (erano 0 il 07/09 sera). L'ambito del
negozio nuovo non è più solo «catalogo»: comincia ad avere venduto suo.

**Contato il 08/09 alle 06:47**: 5.057 prodotti (**1.259 ACTIVE**), 419
collezioni, 7.331 righe di venduto, **15.383 varianti** (erano 11.067 prima che
l'import leggesse oltre la decima), **148 varianti ACTIVE senza sku** su 1.553
totali, 1.890 `DA_CLASSIFICARE`, **5.731 righe in `PubblicazioneNegozio`**.
Venduto vivo: ultimo giro 06:45 `ok`, **0 fallimenti in 48 ore**. Quattro negozi
tutti con verifica `ok`.
## 07/09/2026 pomeriggio — punto di ripresa del pomeriggio

**Come stavano le cose alle 14:10, contate sul database e sul repo prima di
toccare niente** (l'handoff della mattina qui sotto era già invecchiato di lato):
- ✅ **Business Deluxy HA `write_products`** (66 scope, `verificatoIl` 07:58 UTC
  = 09:58 di Roma, esito ok): il punto n.1 della mattina è chiuso — qualcuno ha
  dato lo scope e premuto «Verifica ora». Il token si rinnova da solo (scade
  08/09 06:55 UTC).
- ✅ **Gli SKU su Business Deluxy sono stati assegnati e resi unici da un'altra
  sessione** fra le 10:55 e le 11:21: cinque piani in `docs/*-2026-09-07.md`
  che erano su disco e **non committati** (ora sì, commit `6d4e5589`):
  `assegnazione-sku` 16 prodotti/111 varianti, `sku-unici` 154 prodotti/354
  varianti (123 archiviati), `sku-duplicati` 0 su tutti e quattro i negozi,
  `allinea-sku-db` 159 + 248, `varianti-dal-negozio` 225 rinomine.
  `verifica-sku.json` (11:17): **Business Deluxy 346 attivi, 1.347 varianti, 0
  senza SKU**. Punto n.3 della mattina chiuso. ⭐ Stessa lezione di sempre:
  **prima dell'handoff `git status` e `ls -lt docs/`, non solo `git log`** —
  il lavoro di un'altra sessione può stare su disco senza commit.
- 🔴 **`canaleVendite` del negozio nuovo è ancora «BUsiness»** (letto alle
  14:10). `Vendita.canale` ha solo `cakedesign.me`, `deluxy.it`, `Flowers`:
  non so come Orders chiamerà il canale del B2B, quindi non l'ho corretto —
  va scritto in `/impostazioni` con il nome esatto, altrimenti alla prima
  vendita si apre una seconda voce nell'Ambito.
- Import di Business Deluxy anche alle 12:05 UTC (ok, 175 s, 3 schede create):
  qualcuno ha aperto la home in produzione o l'ha lanciato.
- Rotazione «Fiori» ancora all'01/09: **dovuta domani 08/09** (codice nuovo
  in produzione dalle 10:47).

**Lavorato oggi pomeriggio, IN LOCALE (`tsc` 0, NON pushato, NON deployato —
«lavora poi su locale prima del push»): le varianti oltre la decima.**
Era il limite strutturale scritto due volte nell'handoff del 06/09 («l'import
legge `variants(first: 10)` → 449 varianti oltre la decima non esistono qui»)
e la richiesta dell'utente del 06/09 era «tutti i prodotti pubblicati su
Shopify e sul database devono avere il campo SKU»: nel database mancavano
proprio le varianti.
1. **`leggiProdotti` rilegge per intero chi torna con dieci varianti piene**
   (`nodes(ids)` a 5 prodotti per chiamata, `variants(first: 100)`, stessa
   gestione del limite di `graphql`). Prodotti con più di 10 varianti: Gifts
   127, Business Deluxy 67, Cake 56, Flowers 5 (contati tutti gli stati).
   Costo misurato: Cake da 77 a **81 s**, Business da 175-179 a **239 s**
   (ma lì ha anche creato 1.227 varianti), Flowers 151 s (variava già fra 95
   e 198). ⚠️ **Gifts: la durata del cron delle 03:10 va guardata domattina
   dopo il deploy** — era 428-447 s su un tetto di 800.
2. **L'import ora aggiunge le varianti che il negozio ha e la scheda no**
   (`allineaVarianti`, chiamata a ogni import dopo l'aggiornamento delle
   schede). Prima le varianti nascevano **solo** con la scheda
   (`creaProdottiMancanti`) e chi esisteva già restava con quelle del primo
   giorno: «Torta della Nonna» aveva **1** variante qui e **11** sul negozio.
   Regole, in un posto solo: la variante si riconosce **per SKU** (è la sua
   identità) e in mancanza **per nome** (`normalizza`, «Default Title» →
   «Unica»); se non c'è in nessuno dei due modi **nasce** (con `deltaPrezzo`
   rispetto al prezzo minimo del prodotto, come alla creazione); **mai tolta,
   mai rinominata**; una variante omonima senza SKU **lo riceve** se è libero;
   uno SKU già di un'altra scheda **non si ruba e la variante NON nasce**
   (è un doppione: si conta come «lasciata fuori» nel messaggio dell'import e
   si chiude riconciliando). Il messaggio in fondo a `/collezioni` dice
   «N varianti aggiunte a schede che non le avevano; M SKU scritti…; K
   varianti del negozio lasciate fuori perché lo SKU è già di un'altra scheda».
   `EsitoImportCollezioni` ha `variantiAggiunte`, `skuRiempiti`,
   `variantiSaltate` (solo nel messaggio: **nessun cambio di schema**).
   `risolviProdotti` è la funzione unica «un prodotto del negozio ↔ una
   scheda» (prima stava inline nell'import).
3. **Prova a secco**: `npx tsx scripts/varianti-mancanti.ts [negozio]` →
   `docs/varianti-mancanti-<giorno>-<ora>.md` (l'ora nel nome: la trappola del
   06/09 dei piani sovrascritti). Piani: `…-1417.md` Cake (1.087),
   `…-1425.md` Business Deluxy (1.227 + 1 SKU + 18 saltate), `…-1428.md`
   Flowers (679, 14 saltate), `…-1419.md` Gifts + Business + Flowers **col
   codice della prima versione** (dove «∅ (preso)» conflaziona «SKU di
   un'altra scheda» e «il negozio non ha lo SKU»): Gifts 2.617 di cui 552 ∅.
4. ✅ **Applicato dal PC oggi, negozio per negozio, col codice nuovo**
   (l'import vero, non uno script a parte — è lo stesso passo che farà il cron
   dopo il deploy): **Cake 1.087** varianti aggiunte (14:19, 81 s) — poi
   seconda prova a secco: **0 da creare, 0 da riempire: il giro è
   idempotente**; **Business Deluxy 1.227** aggiunte + 1 SKU scritto + 18
   lasciate fuori (239 s); **Flowers 557** aggiunte + 9 lasciate fuori (151 s;
   erano 679 nel piano perché 122 sono arrivate prima dalle gemelle di
   Business); **Gifts: VEDI RIGA SOTTO**.
   **Gifts 1.440** aggiunte + **23 SKU scritti** su varianti omonime che non
   l'avevano + 18 lasciate fuori, **569 s dal PC** (alle 08:08 dal cron erano
   447 s; dal PC il 06/09 erano 594 s senza questo passo, quindi la misura
   vera del costo è quella di Vercel domattina). Verifica finale sul
   database: varianti **11.067 → 15.378** (4.311 nate oggi dalle 14:15, di cui 739 senza SKU: 682 su schede ARCHIVED, 25 DRAFT, 32 ACTIVE); varianti ACTIVE senza sku 111 → **140** (le 8 di Cake + quelle dei prodotti non attivi di Business che qui stanno su una scheda attiva per un altro negozio); schede ACTIVE 1.259 → **1.203** perché Gifts ha importato per ultimo e «chi importa per ultimo scrive statoShopify» (effetto noto «una scheda, due negozi», non un calo di catalogo).
   ⚠️ **Cake è stato applicato con la PRIMA versione della regola**, che una
   variante con lo SKU di un'altra scheda la creava **senza SKU**: sono nate
   **21 varianti senza SKU** (righe «∅ (preso)» in `…-1417.md`: Easter Heart
   Garden 8, Vintage Cake Mother's Day 4, Millefoglie 4, Pastiera 2, Cuore,
   Sacher, Torta Crema e Fragole), **8 su schede ACTIVE** — le varianti ACTIVE
   senza sku sono passate da 111 a **119** per questo. Non le ho cancellate
   (mai cancellare da script); se le si vuole togliere sono quelle 21, a mano.
   Dalla seconda versione in poi (Business, Flowers, Gifts) non succede più.
5. ⚠️ **371 delle 1.227 varianti di Business Deluxy sono nate senza SKU perché
   il negozio stesso non ce l'ha**: «Romantico brindisi» 86 combinazioni,
   «telegramma e tulipani» 80, «Red passion» 60 — prodotti **non attivi**
   (la verifica dice 0 senza SKU fra gli attivi). Stessa regola di
   `creaProdottiMancanti`: si rispecchia il negozio. Se un domani vanno in
   vendita, lo SKU va dato lì (`assegna-sku.ts`) e l'import lo riporterà qui
   («SKU scritti su varianti che non l'avevano», riconosciute per nome).
6. **Verificato in locale**: `/collezioni` (server su :3120) mostra la riga
   «Cake · 07 set 2026 · … 1087 varianti aggiunte a schede che non le avevano
   … (durata 81 s)». ⚠️ In dev **non ho aperto la home**: gli ultimi import
   erano più vecchi di 4 ore e la sincronizzazione all'apertura avrebbe
   lanciato i tre import dal PC in parallelo. La pagina `/collezioni` pesa
   **4,1 MB** di HTML: non l'ho toccata, ma è la trappola «elenco coi figli».

**Cosa cambia col deploy** (quando l'utente lo chiede): i cron notturni fanno
il passo delle varianti da soli (stanotte, col codice vecchio in produzione,
non succede niente di male: i dati sono già allineati dal PC e il vecchio
import non tocca le varianti). Il primo numero da guardare è **la durata di
Gifts alle 03:10** in fondo a `/collezioni`.

**Da fare (in ordine):** correggere `canaleVendite` di Business Deluxy in
`/impostazioni`; push & deploy **a comando** (worktree + cherry-pick su
`origin/scout-ui`, `npx vercel deploy --prod --yes --scope deluxy`);
**domattina** in fondo a `/collezioni`: riga di Business Deluxy delle 04:15
«ok (durata N s)», Gifts sotto gli 800 s, e «Rotazione Fiori» scattata
l'08/09 in `/visual/rotazioni`; le **119 varianti ACTIVE senza sku** sono
schede doppie per lo stesso prodotto (si chiudono riconciliando, non
scrivendo SKU); i **1.259 prodotti ACTIVE senza costo** (punto n.1 storico,
allargato dal negozio nuovo); il resto sotto, alla mattina e al 06/09.

## 07/09/2026 mattina — punto di ripresa della mattina

✅ **L'IMPORT DI GIFTS È RISORTO, e il numero dice perché moriva.** Prima notte
dopo il deploy delle 15:28 del 06/09: `07/09 03:10:04 UTC · Gifts · ok · 237
collezioni · 32.459 appartenenze · **durata 428 s**`. 428 è **oltre i 300 s** del
vecchio limite e ben sotto gli 800 nuovi: la diagnosi del 06/09 era giusta e la
correzione regge. Flowers 95 s, Cake 42 s. La riga «in corso» → «ok (durata N s)»
funziona in produzione: **è il modo per accorgersene, si guarda in fondo a
`/collezioni`**.

🆕 **C'È UN QUARTO NEGOZIO: «Business Deluxy»** (`90bfeb-f5.myshopify.com`),
aggiunto da un'altra sessione stamattina alle 06:53, **1.715 prodotti sul
negozio**. Import lanciato a mano alle 07:01 (73 collezioni, 12.904
appartenenze, **406 schede create**). Effetti sui numeri, da non leggere come
crescita del catalogo: prodotti 4.633 → **5.042**, collezioni 346 → **419**,
`DA_CLASSIFICARE` 1.475 → **1.882**, schede ACTIVE 1.076 → **1.254**, varianti
ACTIVE senza sku 49 → **195** (42 sono del negozio nuovo). I 408 prodotti nati
oggi sono **tutti senza costo**: il punto aperto n.1 si allarga.

🔴 **Business Deluxy è in SOLA LETTURA: manca `write_products`.** Verificato in
tre modi (l'utente pensava di averlo già dato, ed è la ragione per cui questa
riga porta le prove): `access_scopes.json` restituisce **65 scope senza
write_products**, `currentAppInstallation` lo conferma, e la prova sul campo —
un `productUpdate` su un id inesistente, che non scrive nulla — risponde
`ACCESS_DENIED: Required access: 'write_products' access scope`, mentre lo
stesso identico test su Cake risponde «Product does not exist». Quindi su questo
negozio **non** funzionano: assegnazione SKU, rotazioni verso Shopify,
pubblicazione dal modulo prodotto, SEO spinto. ⚠️ **Dopo aver aggiunto lo scope
sull'app Shopify il token va riconiato**: premere «Verifica ora» sulla scheda
del negozio in `/impostazioni`, altrimenti resta valido quello vecchio (è a
client credentials e scade da solo, ma può volerci un giorno).

**Corretto oggi in locale (`tsc` 0, NON deployato — «lavora prima su locale»):**
1. 🔴 **Il negozio nuovo non aveva un cron: si sarebbe fermato al 07/09.**
   `vercel.json` aveva solo Gifts/Flowers/Cake — è **la stessa trappola del
   26/08** (import che esiste solo come bottone e nessuno lo preme; allora
   costò 22 giorni di catalogo vecchio), ripresentata sul negozio nuovo.
   Aggiunta la voce `/api/cron/collezioni?negozio=Business%20Deluxy` alle
   **04:15 UTC**: dopo Cake (03:50 + 42 s) e prima delle rotazioni delle 05:20,
   con 179 s misurati stamattina. ⭐ **Regola per chi aggiunge un negozio:
   collegarlo non basta, va messa anche la sua riga in `vercel.json`.**
2. 🔴 **Lo slittamento delle rotazioni, corretto il giorno prima che colpisse.**
   `eScaduta` (`src/lib/rotazione.ts`) faceva `Math.floor((adesso − ultima) /
   24h)` mentre **il commento sopra dichiarava di confrontare i giorni**: il
   codice contava gli istanti. `ultimaEsecuzioneIl` si scrive a fine corsa
   (05:20:20) e il cron parte alle 05:20:00, quindi a sette giorni la differenza
   è 6 g 23 h 59 min → `floor` = 6 → turno saltato, e il ritardo si accumula.
   Misurato prima di toccare il codice: «Fiori» (ultima 01/09 05:20:20) **domani
   08/09 sarebbe stata saltata di nuovo**, partendo il 09/09. Ora si confrontano
   le **mezzanotti di Roma** (`giornoRoma`, il calendario che l'app usa
   ovunque), con `Math.round` per i giorni del cambio d'ora (23/25 h). Provato:
   07/09 non parte, **08/09 parte**, 09/09 parte, 28/10 (cambio d'ora) parte,
   «Best Sellers» mensile parte il 10/09.

⚠️ **Un'altra sessione ha cambiato lo schema e non l'ha scritto qui** (commit
`3a4358f7`, `1c2a883a` del 07/09): **«tipologia di vendita»** — campo
obbligatorio nel modulo prodotto, con legenda e API — e **«note di specifica»**
su prodotto e variante, ricostruite dalla descrizione del negozio; più
`70d25f1f` che toglie dal repo i file temporanei di lavoro. Toccano
`prisma/schema.prisma`, `azioni-prodotto-nuovo.ts`, `dominio.ts`. Non li ho
provati: sono di quella sessione. ⭐ È la lezione già scritta il 04/09 —
**`git log -- <cartella>` prima dell'handoff, perché il documento invecchia
anche di lato**.

**Fotografia contata sul database il 07/09**: 5.042 prodotti (**1.254 schede
ACTIVE**), 419 collezioni, 7.304 righe di venduto, 1.882 `DA_CLASSIFICARE`, 14
prodotti con `origine ≠ merchandising`, 195 varianti ACTIVE senza sku (Business
Deluxy 42, Gifts 40, Flowers 3, 110 su schede senza negozio dichiarato).
Venduto vivo: giri delle 07:15/07:30/07:45 UTC tutti `ok`, **0 fallimenti in 48
ore**. Rotazioni: «Fiori» ultima 01/09 (dovuta **domani 08/09**, ora scatterà),
«Best Sellers» 11/08 (dovuta il 10/09).

🔴 **«Le foto su Shopify sono cambiate, nell'app no» — la causa non era quella
che sembrava.** Contato prima di toccare niente: `Prodotto.immagine` era
**identica** al negozio su tutte e 3.534 le schede confrontabili, zero diverse.
Il vero guasto: **1.926 schede hanno lo stesso prodotto su più negozi con foto
diverse** (ogni negozio ha il suo file, caricato in un momento suo), e
`immagine` veniva riscritta dall'**import di ogni negozio** — quindi vinceva
l'ultimo cron della notte. Con l'arrivo di «Business Deluxy», che gira per
ultimo, centinaia di schede hanno cominciato a mostrare la foto più vecchia:
«Semifreddo ai 3 cioccolati» tornava a quella del 2022 di Gifts invece di
quella del 2024. Da fuori sembrava un'app che non si aggiorna; in realtà si
aggiornava all'indietro.
- **Regola nuova, in un posto solo** (`src/lib/foto.ts`, usata dall'import e
  dallo script): **vince la più recente**, letta dal `?v=<epoch>` che il CDN di
  Shopify mette in coda all'URL; a parità non si scrive (giro idempotente), e
  una foto non si cancella mai se il negozio non ne ha.
- `importaCollezioniDa` ora legge le foto attuali delle schede in **una query
  sola** e passa da `fotoDaTenere`: **l'import non può più sostituire una foto
  con una più vecchia**.
- `scripts/foto-piu-recente.ts` (prova a secco, poi `--applica`; piano
  prima/dopo in `docs/foto-piu-recente-2026-09-07-08.md`) ha allineato
  **1.247 schede**. Ricontrollo: **0 da aggiornare**, e resta 0 dopo aver fatto
  girare per davvero gli import di Cake e Flowers col codice nuovo — è la prova
  che stanotte non torna indietro.
- ⚠️ **Trappola in cui sono ricascato io**: aprendo `/` in locale la
  sincronizzazione all'apertura ha lanciato gli import **veri** dal PC (Cake,
  Flowers, Gifts), che con la regola vecchia hanno risovrascritto le foto appena
  sistemate — il primo giro da 539 è stato vanificato e ho dovuto rifarlo dopo
  averli aspettati. **In dev non si apre la home**: si va diritti alla pagina che
  serve. La riga «in corso» ha fatto il suo mestiere, mostrando l'import di
  Gifts ancora in corsa (447 s).

🔴 **«Ho inserito un altro sito ma l'ambito non l'ha recepito».** Vero, e la
causa è di disegno: `brandDisponibili()` leggeva **solo i canali del venduto**
(`Vendita.canale`), quindi un negozio collegato che non ha ancora venduto
niente non compariva nel selettore in alto a destra — e con esso restavano
invisibili le sue 1.508 schede. Un negozio comincia a esistere quando lo si
collega, non quando arriva il primo ordine; e il primo ordine può tardare
settimane, cioè proprio il tempo in cui ci si lavora sopra.
- `brandDisponibili()` ora unisce **canali del venduto + negozi attivi**, usando
  il `canaleVendite` del negozio (il nome che il venduto avrà) e in mancanza il
  nome del negozio: così quando le vendite arrivano si fondono con la voce già
  presente invece di aprirne una seconda.
- `filtroProdotti(brand)` è diventata **`async`** (undici chiamanti aggiornati) e
  ora prende i prodotti **venduti su quel canale _oppure_ presenti nelle
  collezioni del suo negozio**. Senza il secondo ramo un negozio nuovo dava
  pagine vuote — non «nessuna vendita», proprio vuote.
- ⚠️ **I conteggi degli altri brand cambiano, ed è voluto**: deluxy.it 1.768 →
  **4.015**, Flowers 381 → **796**, cakedesign.me 242 → **570**, BUsiness 0 →
  **1.508**. Il catalogo di un brand ora è quello che sta sul suo negozio, non
  solo ciò che ha già venduto. **`filtroVendite` non è cambiata**: classifiche,
  trend e margini continuano a contare solo vendite vere. La riga sotto il
  titolo di `/prodotti` lo dichiara. Se si preferisce il criterio vecchio, si
  torna indietro togliendo il secondo ramo di `filtroProdotti`.
- Verificato in locale su `/prodotti`, `/anagrafica`, `/categorie`, `/costi` con
  l'ambito nuovo selezionato: tutte rispondono e mostrano i 1.508 prodotti.
- ⚠️ **Il nome nel menù esce «BUsiness»**, perché è così che è stato scritto
  `canaleVendite` sulla scheda del negozio. Quel campo deve contenere il nome
  **esatto** che il canale avrà nel venduto di Orders, altrimenti quando le
  vendite arriveranno apriranno una seconda voce accanto a questa. Da correggere
  in `/impostazioni` (non l'ho toccato: è un dato scelto da chi ha collegato il
  negozio).

✅ **PUSHATO E DEPLOYATO il 07/09** (utente: «fai push & deploy»). Push su
`origin/scout-ui` col solito worktree + cherry-pick. Due deploy: il primo
(`imagu727q`, 10:32) e il secondo (`aqzxv6k0p`, 10:47) con la correzione qui
sotto. Verificato in produzione, tre chiamate di fila per pagina, tutte 200:
`/prodotti` (globale e con l'ambito nuovo), `/anagrafica`, `/`,
`/visual/rotazioni`. Il menù Ambito online mostra **BUsiness, cakedesign.me,
deluxy.it, Flowers**; «Rotazione Fiori» dichiara **prossima 08 set 2026**; i
cron registrati sul deploy sono **otto**, compreso
`/api/cron/collezioni?negozio=Business%20Deluxy` alle 04:15.

🔴 **Subito dopo il primo deploy la produzione ha dato 500 per qualche minuto:
`FATAL: (EMAXCONN) max client connections reached, limit: 200`** — il tetto dei
client del **pooler Supavisor**, condiviso da tutte le app del cluster (dal
database si vedevano solo 31 connessioni: sono due limiti diversi, e guardare
`pg_stat_activity` non dice niente su questo). Colpite Merchandising **e
Personale**, che non avevo toccato; Orders, Budgets e CRM reggevano. Si è
ripreso da solo in pochi minuti.
- **La mia parte di colpa, corretta e deployata**: `brandDisponibili()` girava
  le sue **due** letture in `Promise.all`, e quella funzione la chiama il
  **layout**, cioè ogni pagina dell'app — raddoppiava le connessioni in volo su
  tutto il sito nel momento peggiore, quando un deploy sostituisce le lambda e
  le vecchie non si sono ancora spente. Ora vanno **in fila**. È la regola già
  pagata qui il 21/08 («una query nuova si aggiunge in coda, non in parallelo,
  finché non si è contato quante ne sono già in volo»), che avevo violato nel
  punto più caldo possibile.
- ⭐ **Da ricordare per ogni app del cluster**: il limite che ferma tutto non è
  `connection_limit` della singola app ma i **200 client del pooler**, ed è
  condiviso; un deploy è il momento di massima pressione, perché per qualche
  minuto convivono istanze vecchie e nuove.

**Da fare (in ordine):** dare `write_products` a Business Deluxy e premere
«Verifica ora»; correggere `canaleVendite` del negozio nuovo (ora è «BUsiness»);
assegnare gli SKU ai prodotti di Business Deluxy (gli script del 06/09 valgono
già, servono i permessi); **domattina** guardare in fondo a `/collezioni` che
il negozio nuovo abbia la sua riga «ok (durata N s)» delle 04:15 e che
«Rotazione Fiori» sia scattata l'08/09; il resto sotto, al 06/09.

## 06/09/2026 — punto di ripresa del giorno prima

**Fotografia contata sul database il 06/09**: 4.633 prodotti, **1.149 schede con
`statoShopify = ACTIVE`** (ma i prodotti attivi sui tre negozi sono **1.483**:
Gifts 893, Flowers 269, Cake 321 — vedi il limite «una scheda, due negozi» più
sotto), 346 collezioni Shopify, 7.295 righe di venduto, 1.475 `DA_CLASSIFICARE`,
**12 prodotti con `origine ≠ merchandising`** (erano 10 il 04/09), 1
`MediaProdotto`. Venduto vivo: ultimo giro 11:30 UTC `ok`, 0 fallimenti in 48
ore. Rotazioni: «Fiori» ultima 01/09 (dovuta l'08/09, e lo slittamento del
`Math.floor` non è ancora corretto), «Best Sellers» 11/08 (dovuta il 10/09).

🔴 **L'IMPORT DI GIFTS È MORTO DAL POMERIGGIO DEL 04/09, IN SILENZIO.** Prove:
`npx vercel logs deluxy-merchandising.vercel.app` mostra
`Vercel Runtime Timeout Error: Task timed out after 300 seconds` su
`GET /api/cron/collezioni` alle 05:10 di Roma del 06/09 (il cron di Gifts) e di
nuovo alle 13:31 e 13:33 (la sincronizzazione all'apertura lanciata dalla home
di produzione: anche `GET /` è scaduto a 300 s). In `ImportCollezioni` **nessuna
riga di Gifts dopo il 04/09 10:52 UTC**, mentre Flowers e Cake hanno la loro
ogni notte (05/09 e 06/09) e di nuovo alle 11:32/11:33 di oggi. Causa: la
**lettura dinamica dei metafield** deployata il 04/09 alle 16:20 (Gifts ha 48
definizioni → 15 prodotti per pagina, 196 pagine invece di 118, con query più
pesanti) su un import che **durava già ~288 s** — lo si vede dalle righe
vecchie: il cron parte alle 03:10:00 e la riga, scritta a fine corsa, ha
`iniziatoIl` 03:14:48. L'avvertimento del 04/09 («da guardare la durata del
cron delle 03:10») era fondato e nessuno l'ha guardato. E la riga di storico
nasceva **solo a fine corsa**: un import ucciso non lasciava niente, e
`/collezioni` mostrava l'ultimo «ok» del 04/09 come se fosse tutto in ordine.

**Corretto in locale (`tsc` 0, NON deployato — l'utente ha chiesto di lavorare
in locale):**
1. `src/app/api/cron/collezioni/route.ts`: `maxDuration = 800`. Verificato
   via API Vercel che il progetto ha **Fluid compute acceso sul piano Pro**
   (`resourceConfig.fluid: true`, `billing.plan: pro`): il tetto ammesso è
   800 s. Flowers e Cake restano sotto il minuto.
2. `importaCollezioniDa` (`shopify-collezioni.ts`): la riga `ImportCollezioni`
   **nasce all'avvio con esito «in corso»** e a fine corsa diventa
   «ok»/«errore» **con la durata nel messaggio** («… (durata 288 s)»). Una riga
   rimasta «in corso» è la prova che la funzione è stata interrotta.
   `sincronizza-apertura` filtra già `esito: "ok"`, `/collezioni` mostra
   l'ultima riga per negozio (quindi anche l'«in corso»), `health` la riporta.
   ⚠️ `iniziatoIl` ora è davvero l'inizio (prima era la fine).
3. Import di Gifts **lanciato dal PC** alle 13:49 di Roma
   (`npx tsx scripts/importa-tutte-collezioni.ts Gifts`, processo staccato) per
   riallineare il catalogo fermo al 04/09 e misurare. ✅ **Esito: `ok` in 594 s
   dal PC** (237 collezioni, 32.459 appartenenze, 2.932 prodotti), riga nata
   alle 11:49:22 UTC come «in corso» e chiusa con «(durata 594 s)». Dal PC il
   04/09 con 25 prodotti per pagina ci mettevano ~10 minuti: la lettura a 15
   per pagina non ha cambiato molto la durata da qui; su Vercel (fra1) prima
   erano 288 s, quindi 800 s dovrebbero bastare — ma il numero vero si vede
   solo dalla riga della prima notte dopo il deploy. ⚠️ Dopo l'import le schede
   `ACTIVE` sono scese da 1.149 a **1.076**: è l'effetto «una scheda, due
   negozi» (chi importa per ultimo scrive `statoShopify`), non un calo di
   catalogo.

✅ **PUSHATO E DEPLOYATO alle 15:28 del 06/09** (utente: «fai push & deploy»).
Push: worktree temporaneo da `origin/scout-ui` + cherry-pick dei sei commit
Merchandising + `push HEAD:scout-ui` (origin ora a `86521098`); l'unico
conflitto era `MANUALE-DELUXY.html` (righe locali di altre sessioni non
pushate, e il file su origin è CRLF): risolto prendendo origin e reinserendo
la riga finale. Deploy: `npx vercel deploy --prod --yes --scope deluxy` →
`deluxy-merchandising-c39kkjakx`, target production, Ready, `fra1`. ⚠️ Senza
`--scope deluxy` il deploy rispondeva **«Not authorized»** (la CLI era
autenticata e `ls`/`logs` funzionavano): da ora mettere sempre lo scope.
**Da guardare domani mattina** in `/collezioni`: la riga di Gifts della notte
deve dire «ok (durata N s)» con N ben sotto 800; se dice «in corso», il cron è
morto di nuovo e si legge `npx vercel logs deluxy-merchandising.vercel.app`.

**Verifica SKU** (chiesta dall'utente: «tutti i prodotti pubblicati su Shopify
e sul database devono avere il campo SKU»). Nuovo `scripts/verifica-sku.ts`
(sola lettura: legge i tre negozi coi token dell'app, `status:active`, varianti
complete anche oltre le 20) e rapporto `docs/verifica-sku-2026-09-06.md` con
gli elenchi. Risultato: **1.483 prodotti attivi, 8.142 varianti, 317 varianti
senza SKU su 81 prodotti** — Gifts 40 prodotti/190 varianti (torte di laurea
con 27 varianti tutte senza SKU, «Torta Love Me Deluxe» 27/27, i Bouquet dei
compositori 5/10, le Cappelliere 4/8, i quadri «Dream»/«Medio»), Flowers 40/124
(stessi Bouquet dei compositori, «103 Luxury Roses» 1/1, quadri «Dream»), Cake
1/3 («Letters»: 60/80/90). Nessuno SKU duplicato fra prodotti diversi dello
stesso negozio. Nel database: 4.284 varianti dei prodotti ACTIVE, **187 senza
sku** (rispecchiano il negozio, entro le prime dieci), 0 prodotti attivi senza
varianti. **Due limiti strutturali emersi, non corretti:**
- **L'import legge `variants(first: 10)`** (`leggiProdotti`, due query):
  85 prodotti attivi hanno più di 10 varianti e **449 varianti** oltre la
  decima **non esistono qui** (Gifts 412: le torte da 27-48 varianti). Se serve
  lo SKU di ogni variante, va allargato (costo: +1 punto per variante per
  prodotto sulla pagina, quindi meno prodotti per pagina o una seconda lettura
  solo per chi supera le dieci, come fa `verifica-sku.ts`).
- **Una scheda = un prodotto anche se sta su due negozi**: 312 prodotti attivi
  di Gifts hanno la scheda **con l'id di Flowers (231) o di Cake (74)**, quindi
  `shopifyId`, `statoShopify` e le varianti valgono per l'altro negozio; 22
  non hanno nemmeno una scheda con lo stesso handle. Per questo «1.149 attivi»
  conta le schede, non i prodotti in vendita (1.483). Scelta di disegno
  («lo stesso prodotto venduto su Flowers e su Gifts è davvero la stessa
  scheda»), da sapere quando si contano gli attivi per negozio.

✅ **SKU ASSEGNATI (chiesto dall'utente il 06/09 pomeriggio: «aggiungi sku a
tutti i prodotti e varianti pubblicati su Shopify»).** `scripts/assegna-sku.ts`
(prova a secco senza `--applica`; piano prima/dopo in
`docs/assegnazione-sku-2026-09-06.md`, reversibile svuotando gli SKU elencati).
Regola applicata = quella del modulo Nuovo prodotto: se il prodotto ha già SKU
con una base comune (`LWWELG-1…-5`) si continua la numerazione (`-6…-10`; il
gemello su Gifts prende `-11…-15`, perché lo SKU è unico fra i tre negozi e il
database, 14.816 valori presi letti prima di scegliere); senza alcuno SKU nasce
un codice di 7 cifre (`3860878`, varianti `3860878-1…-27`; «Default Title»
prende il codice da solo). Scritto con `productVariantsBulkUpdate`
(`inventoryItem.sku`): **81 prodotti, 317 varianti, 0 errori**; riverificato
coi negozi: **0 varianti senza SKU su 1.483 prodotti attivi**
(`docs/verifica-sku-2026-09-06-dopo.md`). Nel database: 88 varianti aggiornate
nella stessa passata + 1 con `scripts/riempi-sku-dal-negozio.ts` (seconda
passata solo sul DB, per nome di variante). **Restano 97 varianti ACTIVE senza
sku qui, e non è colpa dell'assegnazione**: lo SKU sul negozio esiste ma è
**già tenuto da un'altra scheda** (le otto «Sacher», «Tiramisù», «Bouquet
Girasoli»… — i 236 gruppi di doppioni mai riconciliati, `Variante.sku` è
`@unique`), più 5 nomi che sul negozio non esistono più. Si chiudono solo
riconciliando i doppioni, non scrivendo SKU. E le 449 varianti oltre la decima
non esistono qui finché l'import legge `variants(first: 10)`. ⚠️ Il codice
delle schede (`Prodotto.codice`, es. `TORTA-LOVE-ME-DELUXE`) **non** è stato
toccato: è la chiave unica usata ovunque; il nuovo codice a 7 cifre vive nelle
`Variante.sku`.

🔍 **SKU duplicati sui negozi** (chiesto dall'utente subito dopo;
`scripts/sku-duplicati.ts`, sola lettura, tutti gli stati; rapporto
`docs/sku-duplicati-2026-09-06.md`). Dentro un negozio, lo stesso SKU su
prodotti diversi: Cake 194, Flowers 104, Gifts 176 — **quasi tutti fra prodotti
archiviati** (le vecchie torte/bouquet copiati con lo SKU). Fra prodotti
**attivi** solo su Flowers: **4 prodotti pubblicati due volte** (handle e
handle`-1`, stessi SKU, entrambi ACTIVE: «MAXI Bouquet Rose Bianche, Gialle e
Arancioni» 6 SKU, «Champagne e Fiori di Stagione», «Cento Rose Bianche»,
«Ortensie Balloon») — il cliente vede due schede uguali; da spegnerne una. SKU
ripetuto **fra le varianti dello stesso prodotto**: Flowers «Bouquet Verdi» (5
varianti con lo stesso SKU), Gifts 16 prodotti (DUNE 7, i tre lettini MIRA
8-9, poi singoli). Fra negozi: 3.399 SKU su due negozi = lo stesso prodotto
venduto su Flowers/Cake e Gifts (voluto); 59 coppie con titoli diversi, quasi
tutte rinomine («Cuore» ↔ «Cream Tart - I love U», «007» ↔ «Bouquet - James
Bond»). Niente scritto: è una verifica.

✅ **SKU RESI UNICI (chiesto dall'utente: «ogni prodotto o variante deve avere
una sku unica», con la precisazione «un prodotto pubblicato su più piattaforme
condivide la stessa sku»).** Regola applicata: **unico dentro ogni negozio**,
fra prodotti e fra varianti dello stesso prodotto; **lo stesso prodotto su due
negozi tiene lo stesso SKU**. `scripts/sku-unici.ts` (prova a secco, poi
`--applica`; piano prima/dopo in `docs/sku-unici-2026-09-06.md`). Chi tiene lo
SKU: ACTIVE > DRAFT > ARCHIVED, a parità il più vecchio; chi perde riceve un
codice nuovo di 7 cifre (`-N` per variante); fra varianti dello stesso
prodotto la prima tiene e le altre continuano la base. **Terzo passo**: le 95
varianti di Gifts a cui la mattina avevo dato SKU diversi dal gemello su
Flowers (`-11…-15` contro `-6…-10`) sono tornate allo SKU di origine; 4 no
(Cappelliera Munch: numerazione Si/No invertita fra i due negozi, lo SKU di
Flowers è già su un'altra variante dello stesso prodotto Gifts); **193
differenze storiche** fra gemelli (stesso handle e titolo di variante, SKU
diverso da prima di oggi) **lasciate come sono** — da decidere se allineare
anche quelle. Scritto in due riprese (la prima esecuzione è morta a metà di
Flowers senza lasciare il piano: ora il piano si scrive PRIMA di toccare i
negozi, e ogni prodotto è in try/catch): **Cake 23 + Flowers 38 + Gifts 129 =
190 prodotti, 734 varianti, 0 errori**. Ricontrollo (`sku-duplicati.ts`): **0
duplicati in tutti e tre i negozi**; fra negozi 3.494 SKU condivisi = gemelli.
Database: 308 + 26 varianti aggiornate; **restano 68 varianti ACTIVE senza
sku** = schede doppie qui che puntano allo stesso prodotto Shopify (le otto
«Sacher»…): si chiudono solo con la Riconciliazione.

✅ **Database allineato al negozio, per SKU (sera del 06/09, «fai tu»).** Tre
script di sola lettura/scrittura locale, ognuno con prova a secco e piano in
`docs/`: `allinea-sku-db.ts` (183 varianti con SKU vecchio → quello del
negozio, 151 vuote riempite dove libero; 177 scritte, giri ripetuti sui
conflitti di unicità), `varianti-dal-negozio.ts` (**440 varianti rinominate
col titolo che il negozio dà a quello SKU** — «Media»→«Grande», «12»→«15», i
nomi-codice → «Unica»: i nomi qui erano del primo import; niente cancellato, 6
righe doppie elencate e lasciate), `gemelli-sku-diversi.ts` (elenco dei 197
gemelli con SKU diverso, `docs/gemelli-sku-diversi-2026-09-06.md`). **Le
varianti ACTIVE senza sku sono scese da 187 a 51**, e le 51 sono tutte lo
stesso caso: **due schede qui per un prodotto che sul negozio è uno** (o il
gemello sull'altro negozio, o una rinomina: «Bouquet Tramonto Autunnale» ↔
«Bouquet Dolce Autunno», «Sacher» ↔ «ex-Sacher»), e `Variante.sku` è unico.
La Riconciliazione dell'app **sposta solo il venduto e lascia le varianti**
(regola 3 di `azioni-riconciliazione.ts`), quindi non le chiude: si chiudono
solo decidendo che una delle due schede è quella vera e spostandole le
varianti — scelta da fare a mano, elenco in
`docs/varianti-dal-negozio-2026-09-06.md`. ⚠️ Un tentativo di far cancellare
allo script le righe doppie senza dati è stato fermato dal classificatore di
sicurezza della sessione: giusto così, si cancella solo a mano.

✅ **Gemelli allineati (chiesto dall'utente: «allinea anche i 197 gemelli
prendendo Flowers e Cake come origine»)**: `gemelli-sku-diversi.ts --applica`
scrive su Gifts, prodotto per prodotto con tutte le varianti insieme (gli
scambi Si↔No non passano da stati intermedi), saltando solo gli SKU già di un
altro prodotto Gifts. Due giri: **147 + 27 = 174 varianti su 49 prodotti, 0
errori**; fra i due, tre prodotti Gifts senza gemello che tenevano SKU copiati
da prodotti di Cake (Stella ← «Summer Number», Zodiaco Cake ← «Zodiaco funny
cake», Foglie D'Autunno) hanno avuto un codice nuovo per fare posto. Piano
prima/dopo in `docs/gemelli-allineati-2026-09-06.md` (ricostruito dal commit
`eefb41d2`: il secondo giro aveva sovrascritto il file del primo — ⚠️ il
piano di un'azione va scritto su un file **con l'ora nel nome**, non col solo
giorno). Restano **23 varianti su 12 prodotti** diverse, nessuna attiva su
entrambi i lati (catene fra archiviati). Ricontrollo duplicati: **0, 0, 0**.
DB riallineato: varianti ACTIVE senza sku **49**, sempre il caso «due schede
qui per un prodotto solo».

**Da fare / da provare (in ordine):** deploy delle due correzioni (decisione
dell'utente) e controllo della riga di Gifts la notte dopo; i 4 prodotti
pubblicati due volte su Flowers (handle `-1`) ora hanno SKU propri ma restano
due schede uguali per il cliente: da spegnerne una; decidere se allineare le
193 differenze storiche fra gemelli; decidere se
allargare le 10 varianti (con gli SKU ora completi sul negozio, è l'unico
motivo per cui il database non li ha tutti); correggere lo slittamento delle rotazioni (Fiori
dovuta l'08/09); il collaudo del modulo prodotto su Cake resta da fare (vedi
04/09).

## 04/09/2026 — PUNTO DI RIPRESA

**Fotografia contata sul database il 04/09**: 4.630 prodotti, **1.149 attivi sul
negozio e tutti e 1.149 senza costo**, 346 collezioni Shopify, 7.247 righe di
venduto, 0 collezioni maison, 0 linee, 0 tipologie, 1.475 `DA_CLASSIFICARE`
(2 fra gli attivi), 0 prodotti con un SEO nostro, **10 prodotti con `origine ≠
merchandising`** (il POST `/api/v1/prodotti` è stato esercitato da fuori: al
26/08 erano 0). Import del venduto ogni quarto d'ora vivo (194 giri in 48 ore,
1 fallito). I tre negozi risultano verificati ancora dal 26/07.

✅ **Il punto aperto n.8 (import collezioni fermo dal 04/08) È CHIUSO** dal
28-29/08: `src/app/api/cron/collezioni/route.ts` + tre voci in `vercel.json`
(Gifts 03:10, Flowers 03:35, Cake 03:50 UTC, un negozio per chiamata). Gira
ogni notte da almeno il 02/09 con esito `ok` (Gifts 237 collezioni / 32.458
appartenenze, Flowers 62 / 8.339, Cake 47 / 3.051). Quindi il «1.149 attivi» è
di stanotte, non più una foto vecchia.

⚠️ **Rotazione «Fiori» slittata di un giorno**: ultima corsa **01/09** dopo
quella del 24/08 = 8 giorni. È il difetto latente descritto il 26/08
(`ultimaEsecuzioneIl` scritto a fine corsa, `eScaduta` con `Math.floor`): il
31/08 la regola risultava a 6 giorni e il giro l'ha saltata. Da correggere
(confrontare i giorni di calendario, non i millisecondi). «Best Sellers»
mensile: ultima 11/08, dovuta il 10/09.

⚠️ **Produzione indietro di un commit** prima di oggi: il login con «Password
dimenticata?» (commit `567520c4` del 31/08) NON era deployato (verificato:
`/login` in produzione non contiene il testo). Gli ultimi deploy sono del 28/08.

**Fatto oggi (tutto in locale, `tsc` 0, pagine verificate via fetch col cookie
di sessione; deploy da fare con l'utente):**

1. **Periodi di calendario su `/vendite` con confronto sull'anno prima**
   (chiesto dall'utente): pillole «Mese in corso · Mese scorso · Ultimi 3 mesi ·
   Anno in corso» + «Intervallo personalizzato» (`?periodo=…&dal=&al=`, form
   GET senza JS in `IntervalloLibero.tsx`). Il «prima» sono **gli stessi giorni
   dell'anno scorso** (`Finestra.confronto = "anno-prima"`,
   `finestraCalendario()` in `vendite.ts`, `annoPrimaRoma()` in `fuso.ts`: il
   29/02 cade sul 28). `?giorni=` resta letto per i link vecchi col confronto
   «precedente». Regola nuova per i due periodi non contigui:
   `doveNeiDuePeriodi()` carica **solo** i due intervalli (non dodici mesi in
   mezzo) e `analizzaVendite`/`scomposizioneVendite` accettano `number |
   Finestra`; lo sparkline a 8 settimane si nutre di un `contorno` caricato a
   parte. `confrontoParzialeDi` ora tappa `giorniSenzaDati` a `f.giorni`
   («cioè tutti» quando l'archivio comincia dopo la fine del prima). Verificato:
   anno in corso → 01/01→04/09/2026 contro 01/01→04/09/2025 con l'avviso
   parziale (archivio dal 26/07/2025); mese in corso senza avviso.
2. **`/best-seller` con intervallo personalizzato** (stesso componente).
3. **«Prima» e «Ora» con le date sotto** nelle tabelle della scomposizione
   (`th .th-sub`), e la riga di testata dice «Ora = … · Prima = … (gli stessi
   giorni dell'anno scorso)».
4. **«Nuovo prodotto» rifatto come modulo unico** (`FormProdottoNuovo.tsx`,
   `azioni-prodotto-nuovo.ts`), su sette richieste dell'utente:
   - **SKU automatico di 7 cifre casuali, univoco** (`codiceLibero()`:
     controlla `Prodotto.codice` e `Variante.sku`, rigenera se preso e lo dice
     nel banner);
   - **Brand / negozio** scelto per primo: decide categorie, collezioni e dove
     vanno le foto;
   - **collezione**: le manuali del negozio scelto, oppure «Nessuna»
     (`Prodotto.collezioneShopifyId`, relazione «CollezionePrevista»);
   - **categorie per brand**: `CategoriaProdotto.negozio` (null = tutti), si
     imposta in `/classificazione` (select «Tutti i brand / Solo Gifts…»);
   - **«Pubblico» al posto di «In vendita»** (`ETICHETTA_FASE`, chiave
     `in_vendita` invariata) e **pubblico = va su Shopify**: con quella fase il
     prodotto si crea PRIMA sul negozio (`creaProdottoSuShopify`, stato ACTIVE o
     DRAFT se la finestra non è aperta) e poi qui con `shopifyId`; se il negozio
     rifiuta, nasce qui come «approvato» con l'errore nel banner e nella tappa;
   - **foto e video**: nuovo `MediaProdotto` + `shopify-media.ts`. I file vanno
     nei **Files del negozio** (`stagedUploadsCreate` → upload **dal browser**
     all'indirizzo temporaneo → `fileCreate` → attesa `READY`), anche se il
     prodotto non è pubblico; alla pubblicazione si agganciano con
     `fileUpdate(referencesToAdd)` — vale anche per i video, che con un URL
     esterno non si potrebbero. Rotte `/api/media/prepara` e
     `/api/media/registra` (dietro il login), ripiego via server solo sotto
     4 MB (limite Vercel 4,5 MB). ⚠️ **L'upload dal browser verso lo storage di
     Shopify non è stato provato** (CORS): il ripiego c'è, ma va collaudato con
     un file vero;
   - **descrizione con l'AI** (stessa rotta `/api/ai/descrizione`);
   - **traduzioni automatiche** alla pubblicazione (`ai-traduzioni.ts` →
     `translationsRegister` con i digest, `shopify-traduzioni-scrittura.ts`):
     8 lingue fisse, se Shopify rifiuta il lotto si riprova lingua per lingua e
     si riporta quali ha rifiutato. ⚠️ **Mai eseguita contro un negozio vero**;
   - **finestra di pubblicazione** `pubblicatoDal`/`pubblicatoFinoAl` + cron
     `/api/cron/pubblicazioni` (04:05 UTC in `vercel.json`): accende (ACTIVE)
     il giorno d'apertura, spegne (DRAFT, fase → approvato) il giorno dopo la
     chiusura, scrivendo prima su Shopify. ⚠️ Mai girato.
   Tutte le mutation nuove **validate contro lo schema Admin** col connettore
   Shopify (stagedUploadsCreate, fileCreate, fileUpdate, fileDelete,
   translatableResource, translationsRegister, collectionAddProducts).
   «Nuovo su Shopify» resta per varianti/magazzino/campi extra; in `/prodotti`
   il bottone primario è ora «Nuovo prodotto».
5. **`/sviluppo/calendario`**: il calendario mese per mese delle date di
   pubblicazione (▶ entra, ■ ultimo giorno) + tabella dei prodotti con finestra.
   Link da `/sviluppo`.
6. **`/prodotti/pruning`** (chiesto dall'utente): il merchandiser **propone**
   (`pruningPropostoIl`, `pruningMotivo`) fra i candidati — attivi sul negozio
   ordinati dal venduto più fermo a 180 giorni — e le proposte si **archiviano
   sul negozio con conferma** (`productUpdate status: ARCHIVED`, poi fase
   «archiviato» qui) o si ritirano. Il negozio si ricava da `negozioNome` o
   dalle collezioni del prodotto. ⚠️ Archiviazione mai eseguita contro Shopify.
7. Schema: `prisma db push` fatto sul Postgres condiviso (solo colonne additive
   + tabella `MediaProdotto`).
8. **Le date di pubblicazione sono sempre visibili** nel modulo (anche senza la
   fase Pubblico: si salvano come programma) e **si modificano dalla scheda**
   del prodotto (riquadro «Fase del ciclo di vita», form «Salva le date»,
   `aggiornaProdotto` legge `pubblicatoDal`/`pubblicatoFinoAl`).
10. **Varianti nel modulo Nuovo prodotto** (chieste dall'utente dopo il
    deploy, commit `e9d8167a`): riquadro «Varianti» con nome dell'opzione e
    righe (nome, prezzo, costo, giacenza). Lo SKU di ogni variante **non si
    scrive**: è quello principale più «-N» (`4839201-1`, `-2`…), mostrato in
    riga e ricalcolato se si rigenera il principale.
    `codiceLibero(chiesto, quanteVarianti)` verifica che siano liberi anche i
    derivati. Su Shopify vanno come varianti dell'opzione
    (`productVariantsBulkCreate`, già in `creaProdottoSuShopify`); qui nascono
    righe `Variante` con `deltaPrezzo`/`deltaCosto` rispetto alla base. Con le
    varianti il prezzo del prodotto è la base: se lasciato a 0 vale quello
    della variante più economica. ✅ Deployato alle 15:30 del 04/09
    (`deluxy-merchandising-j5ptz29ci`, build remota), riquadro «Varianti»
    verificato 200 in produzione; la creazione con varianti su Shopify resta
    da collaudare come il resto del modulo.
11. **Pomeriggio del 04/09 — modulo prodotto completo, IN LOCALE (non
    deployato: l'utente ha chiesto di pubblicare solo su sua richiesta):**
    - **giacenza facoltativa**: interruttore «Controlla la giacenza» sul
      prodotto; spenta, non c'è nemmeno per le varianti e su Shopify lo stock
      non si traccia;
    - **date di pubblicazione solo con la fase Pubblico** (deciso dall'utente
      dopo averle chieste sempre visibili), fine facoltativa; senza fase
      Pubblico si azzerano;
    - **tag**: chip con suggerimenti dai tag già in uso sui prodotti attivi
      importati (`tagShopify`), scritti sul negozio (`tags`) e in `tagShopify`;
    - **tutti i metafield del negozio**: nuovo `metafield-definizioni.ts` —
      legge `metafieldDefinitions` (PRODUCT) dal negozio (Gifts 48, Flowers
      33, Cake 21; verificato coi tre token), tiene solo i tipi compilabili
      (testo, testo lungo, lista di testi, sì/no, numero, url; via i namespace
      `shopify*`/app), cache di un giorno in
      `NegozioShopify.definizioniMetafield`. **L'import legge i metafield in
      modo dinamico** con un alias per definizione (più le 22 chiavi storiche
      senza definizione, `ALIAS_STORICI`), 20 prodotti per pagina (15 sopra i
      30 alias) per il tetto dei 1.000 punti; i valori grezzi vanno in
      `Prodotto.metafieldShopify` (`{"custom.occasioni": "[\"Natale\"]"}`) e le
      colonne tipizzate si ricostruiscono da lì (`nodoDaMf`,
      `colonneDaMetafield`). ⚠️ L'import di Gifts diventa più lento
      (pagine da 20 invece di 25): da guardare la durata del cron delle 03:10.
      Nel modulo, riquadro «Campi del negozio»: chip per le liste a scelta,
      select, sì/no, numeri con min/max, testo. Alla pubblicazione vanno in
      `productCreate.metafields` con namespace e tipo veri;
    - **modifica con lo stesso modulo**: `/prodotti/[id]/modifica`
      (`ProdottoIniziale` precompilato, bottone «✎ Modifica col modulo» sulla
      scheda) e `aggiornaProdottoCompleto`: aggiorna qui e, se il prodotto è
      sul negozio, `aggiornaProdottoSuShopify` (nuova in `shopify-admin.ts`:
      productUpdate titolo/descrizione/stato/tag/metafield, varianti per SKU
      con `productVariantsBulkUpdate`, nuove con `BulkCreate` solo se c'è già
      un'opzione, foto nuove agganciate, collezione aggiunta se cambia,
      traduzioni se spuntato). Fase tolta da Pubblico → DRAFT sul negozio. Un
      prodotto non sul negozio che passa a Pubblico si pubblica come nuovo (è
      il punto aperto «dalla scheda non pubblica», chiuso per questa via).
      Varianti sparite dal modulo si cancellano qui solo senza vendite; sul
      negozio restano (detto in pagina). `datiModuloProdotto()` serve le due
      pagine.
    - **Estetica dei campi del negozio** (dopo uno screenshot dell'utente su
      Cake, pieno di campi di prova): prima i campi **in evidenza** nell'admin
      (`pinnedPosition`), gli altri ripiegati in «Altri N campi non in
      evidenza» (aperto da solo se qualcuno è compilato); chiave tecnica in
      piccolo accanto al nome, pallino verde sui compilati, chip selezionate
      nere con ✓ e conteggio. In modifica, in testa al modulo un **riepilogo**
      («Stai modificando «…» · SKU · fase · sul negozio X: salvando si aggiorna
      anche là · N varianti») con la foto.
    - **Collezioni multiple** (chiesto dall'utente): in creazione si scelgono
      più collezioni manuali del negozio (ricerca + chip); in modifica il
      modulo parte da quelle in cui il prodotto sta (`collezioniShopify`,
      le automatiche in sola lettura) e aggiunge/toglie le manuali sul negozio
      (`collectionAddProducts` / `collectionRemoveProducts`, poi le righe
      locali). Per un prodotto non ancora sul negozio le scelte stanno in
      `Prodotto.collezioniPreviste` (JSON di id) e si applicano alla
      pubblicazione. `collezioneShopifyId` resta = la prima.
    - **Prezzo partner** (`Prodotto.prezzoPartner`, `Variante.prezzoPartner`,
      assoluti, vuoto = non indicato): quanto va al partner. Interno, non va
      su Shopify. Nel modulo e nella tabella delle varianti.
    - **Metafield vuoti in modifica** (segnalato dall'utente su gg_disp_min):
      i prodotti importati prima di oggi hanno i valori nelle colonne
      tipizzate ma non in `metafieldShopify`. `metafieldDaColonne()` li
      ricostruisce (liste → JSON) e il modulo li mostra subito; dopo l'import
      notturno arrivano anche i campi senza colonna. Il grezzo, quando c'è,
      vince.
    ✅ **Deployato alle 16:20 del 04/09 su richiesta dell'utente** («fai push
    & deploy»), build remota, pagine verificate 200 in produzione.
    ⚠️ Niente di tutto questo è stato provato contro un negozio vero: primo
    collaudo da fare su Cake con un prodotto di prova.
9. **Sincronizzazione all'apertura** (`src/lib/sincronizza-apertura.ts`,
   chiamata dal cruscotto `/`): se l'ultimo import `ok` di un negozio è più
   vecchio di **4 ore**, dopo la risposta (`after()` di Next, `maxDuration
   300` sulla home) si chiama `/api/cron/collezioni?negozio=X` col
   `CRON_SECRET` — stesso codice del cron notturno. Lucchetto per negozio in
   `Impostazione` (`sync-apertura:<negozio>`, scade dopo 20 minuti) contro i
   doppi avvii; banner in home «Sincronizzazione avviata / in corso». Il
   venduto non c'entra (già ogni quarto d'ora). ⚠️ In **dev** la home lancia
   l'import vero sul database condiviso (il `.env` ha `CRON_SECRET`): la prima
   apertura del 04/09 alle ~15:00 ha fatto partire Cake, Flowers e Gifts dal PC
   — non spegnere `next dev` mentre un import è in corso (deleteMany +
   ricostruzione fuori transazione).

✅ **Deployato il 04/09 alle 13:05** (`deluxy-merchandising-11dgsk4f0`),
pagine nuove verificate 200 in produzione col cookie di sessione. ⚠️ Su questo
PC `vercel build --prod` **fallisce con `EPERM symlink`** (Modalità
sviluppatore di Windows spenta): il deploy è stato fatto con `npx vercel deploy
--prod --yes` (build remota, ~1 minuto di Build CPU). Finché non si accende la
Modalità sviluppatore, il precompilato qui non si può fare. ✅ La
sincronizzazione all'apertura è stata provata dal PC: Cake 2′, Flowers 3′,
Gifts ~10′, tutti `ok`, e «Cappelliera Dalie Tramonto» è entrata in «Dolci
Rientri».

**Da fare / da provare (in ordine):** provare **un caricamento di
foto vero** e **una pubblicazione vera** su un negozio (Cake, il più piccolo)
con un prodotto di prova, poi cancellarlo; correggere lo slittamento delle
rotazioni; il cambio fase → «Pubblico» **dalla scheda** prodotto non pubblica
ancora (solo il modulo nuovo lo fa): scritto qui perché non sembri fatto.
Le voci sono in ordine di data: **le ultime stanno in fondo a FATTO**, appena sopra «COME AVVIARE».

## 24/08/2026 — Audit architettura: il seed non può più svuotare la produzione

1. **Guardia sui comandi che cancellano** (`prisma/guardia-locale.mjs`, importata
   in testa a `prisma/seed.mjs` e messa davanti a `db:reset`): se `DATABASE_URL`
   non è localhost/SQLite, il comando esce con errore PRIMA di aprire la
   connessione. Prima il seed apriva con sette `deleteMany()` senza filtro e la
   URL puntava al cluster condiviso: un `npm run db:seed` per abitudine avrebbe
   svuotato il PLM vero.
2. **Gli ordini annullati si ritirano dal venduto**: `importaVendite` ora chiede
   a Orders `?annullatiDa=` (ultimi 90 giorni) e toglie le righe `Vendita` di
   quegli ordini — solo `origine: "orders"`, mai demo o manuali. Chiude il
   limite dichiarato «un annullamento oltre i 30 giorni non arriva mai»;
   l'esito dell'import ora riporta anche `righeRitirate`.
3. **`Fornitore` dichiarato per quello che è**: dentro ci sono SOLO i 3
   fornitori del seed dimostrativo (verificato in produzione: 3 righe, 5
   prodotti collegati) e l'unico uso è il dizionario delle città — il fornitore
   operativo del PLM è `vendorShopify`. Aggiunto `anagraficaId` (unique, per
   l'eventuale aggancio al registro) e il commento che VIETA di compilare campi
   anagrafici a mano. Candidato alla rimozione: decidere se cancellare i 3
   record demo (e slegare i 5 prodotti) — non fatto senza conferma.

> 🏛️ **ARCHITETTURA (OBBLIGATORIA, Standard Deluxy §7)** — Il ruolo di QUESTA
> app nel giro dell'ordine D2C: **l'ASSORTIMENTO** — sceglie cosa va sui siti,
> cura la scheda di vendita (prezzo al cliente, collezioni, SEO) e pubblica su
> Shopify. L'**offerta** dei fornitori (prodotti caricati, `type=UNICO`, il
> loro prezzo) NON vive qui: la carica il fornitore nella piattaforma consegne
> dal suo account — questa app la legge e, quando pubblica un prodotto che
> nasce da lì, registra il legame **per id** (mai copiando i campi). Il
> venduto arriva da Orders via API (già così), gli annullati si ritirano
> (fatto il 24/08).

## Cos'è
App per gestire il **prodotto a 360° come una maison di moda**: fonte di verità a
monte, Shopify canale di vendita a valle. Next.js 15 + Prisma + SQLite (dev),
porta **3120**. Design system Deluxy v1.0.

## FATTO
- Scaffold completo (package.json, tsconfig, next.config, `.claude/launch.json`, `.env.example`).
- Schema Prisma (SQLite): `Collezione`, `Prodotto`, `Variante`, `TappaSviluppo`, `Fornitore`, `Vetrina`, `VetrinaProdotto`. Niente enum/array (compat SQLite): stati come stringhe con catalogo in `src/lib/dominio.ts`.
- Seed demo (`prisma/seed.mjs`): 3 collezioni, 8 prodotti, 3 varianti, 2 vetrine, 3 fornitori.
- Lib: `db.ts`, `dominio.ts` (stagioni, stati collezione, fasi PLM, categorie, calcolo margine/mark-up, euro), `shopify.ts` (payload + `shopifyConfigurato()`), `azioni.ts` (server actions).
- Shell UI riusa il design system: `tokens.css`, `globals.css`, `layout.tsx`, `Sidebar`, `ToggleSidebar`, `SbSezione`, `Icona`, `Badge`, `BarraMargine`, `FormFiltri`, `TabellaProdotti`.
- Pagine: `/` (collezioni+KPI), `/collezioni/nuova`, `/collezioni/[id]`, `/prodotti`, `/prodotti/nuovo`, `/prodotti/[id]` (scheda 360° a tab: Panoramica/Sviluppo/Costi/Visual/Shopify), `/sviluppo` (board PLM), `/costi`, `/visual`, `/visual/[id]`, `/shopify`.
- Server actions verificate end-to-end (creazione, aggiornamento, cambio fase, varianti, vetrine riordino/aggiungi/rimuovi, stato Shopify) con `revalidatePath`.
- **Vendite & trend** (`/vendite`, 26/07/2026): modello `Vendita` (il fatto elementare: riga venduta al giorno in cui è stata venduta) + `ImportVendite`. `src/lib/vendite.ts` calcola tutto — serie giorno/settimana, totali con confronto sul periodo precedente della stessa lunghezza, margine sul venduto, righe per prodotto con ritmo, tendenza e sparkline a 8 settimane, raggruppamenti per collezione/categoria/canale, righe non abbinate. `src/lib/orders.ts` importa da Deluxy Orders (`ORDERS_URL` + `ORDERS_API_KEY`), deduplicando su `"<idOrdine>#<indiceRiga>"`.
- **Ambito globale/brand + menù riorganizzato** (26/07/2026): in alto a destra c'è **un solo selettore d'ambito** — «Globale — tutti i brand» oppure un brand — salvato in cookie (`mrc_brand`, `src/lib/brand.ts`) e valido in **ogni** pagina; i filtri per brand che stavano dentro le singole pagine sono stati tolti (due selettori in due posti = non si capisce più cosa si guarda). Il brand **non è un campo del prodotto**: è del venduto (`Vendita.canale`), quindi «prodotti di un brand» = prodotti **venduti** su quel brand (`filtroProdotti` usa `vendite: { some: { canale } }`). La home `/` è diventata il **Cruscotto**: in globale mostra i brand affiancati (ricavo, Δ, quota, primo prodotto) invece di sommarli, dentro un brand mostra quel mondo. Le collezioni sono passate su `/collezioni` (erano in home) e restano trasversali ai brand, con una nota che lo dice. Menù raggruppato in **Panoramica · Vendite · Prodotto · Vetrina & canale · Collezioni**. Le ipotesi congelate salvano anche `PianoRiordino.canale`, e dentro un brand l'avviso ricorda che **la giacenza resta unica**: non esiste un magazzino per negozio.
- **Shopify: Client ID + Secret, non più solo token** (27/07/2026): le app Shopify di oggi (Dev Dashboard) non danno un token da incollare ma **Client ID e Client Secret**; l'app si conia il token con il **client credentials grant** (`POST /admin/oauth/access_token`, `grant_type=client_credentials`), che dura ~24h e si rinnova da solo **5 minuti prima** della scadenza. `coniaToken()` + `tokenValido()` in `src/lib/negozi.ts`, campi `clientIdCifrato`/`clientSecretCifrato`/`tokenScadeIl` (tutto cifrato); `tokenCifrato` è diventato **opzionale** ed è solo la copia di lavoro dell'ultimo token coniato. Il **token statico `shpat_…` resta supportato** per le app personalizzate create nell'admin del negozio: in pagina si mette l'uno *o* gli altri, e cambiando modo la verifica si azzera. Stesso flusso che deluxy-orders usa già (`tokenDaClientCredentials` in `src/lib/shopify.ts`). Provato con credenziali finte: «Il negozio ha rifiutato Client ID e Secret (HTTP 400). Controlla che l'app sia installata su questo negozio.»
- **Negozi & permessi** (`/impostazioni`, 26/07/2026): la pagina dove si decide **con quali negozi Shopify** l'app parla. Modello `NegozioShopify` (nome, dominio, token **cifrato** AES-256-GCM con `APP_SECRET` — `src/lib/crypto.ts`, stessa infrastruttura di deluxy-messaging), token mai rimostrato (solo un'impronta di 8 caratteri) e sostituibile. Salvando parte una **verifica automatica**: l'app chiede a Shopify i permessi reali del token (`/admin/oauth/access_scopes.json`) e prova a leggere una collezione, poi mostra pallini verdi/rossi permesso per permesso. Il catalogo dei permessi con "serve a" e livello (obbligatorio/consigliato/opzionale) sta in `PERMESSI` in `src/lib/negozi.ts`: è la stessa lista usata dalla verifica, così non può divergere dalla pagina. **Obbligatori `read_products` + `write_products`**: su Shopify le collezioni non hanno uno scope proprio, stanno dentro quello dei prodotti. `VERSIONE_API = 2024-10`.
  - Provato end-to-end con un token finto: dominio normalizzato (`https://…/admin` → `fb72b1-2.myshopify.com`), token cifrato, verifica che risponde «Token rifiutato dal negozio (401/403)» e permessi tutti segnati mancanti. **Il ramo "va tutto bene" non è ancora stato visto**: serve un token vero con `read_products` (nessuno dei token dell'ecosistema ce l'ha).
- **Descrizioni scritte dall'AI** (26/07/2026): copia la modalità dell'app reale — **il prompt sta sulla categoria**, non sul prodotto (in app.deluxy.it è il campo *AI Prompt* del form Categorie). Modello `PromptCategoria`, si compila in `/impostazioni` una casella per categoria; nel form prodotto si sceglie la **categoria Deluxy** (le voci con prompt lo dicono) e il **tono** (maison/caldo/essenziale), e «✦ Scrivi con l'AI» riempie la descrizione con claim + paragrafi + punti. `src/lib/ai-descrizione.ts` + rotta `POST /api/ai/descrizione` (dietro il middleware). Il modello riceve **solo** i dati del form e ha il divieto esplicito di inventare misure, numero di steli, tempi di consegna o materiali non scritti.
  - La **chiave OpenAI** ora si può inserire dall'app (`/impostazioni`, cifrata come i token Shopify, modello `Impostazione` + `src/lib/segreti.ts`): **l'ambiente ha comunque la precedenza**. `aiConfigurata()` è diventata `async` — attenzione: usata senza `await` accenderebbe sempre il bottone, perché una Promise è sempre "vera" (già capitato e corretto in `/trend-ai`).
  - Trappola trovata provando: nel client il form **non** si prende con `document.querySelector("form")` — il primo form della pagina è il selettore d'ambito nella barra in alto, e la generazione partiva senza nome prodotto. Si usa un `ref`.
  - Provato end-to-end con chiave finta: prompt di categoria salvato, bottone acceso, chiamata partita, errore «Chiave OpenAI rifiutata (401)» mostrato in pagina. **Il testo generato da un modello vero non è ancora stato visto.**
- **Nuovo prodotto su Shopify** (`/prodotti/nuovo-shopify`, 26/07/2026): form modellato su quello reale di app.deluxy.it (sezioni Dettagli · Magazzino · Varianti · Campi extra · Pubblicazione, col «reveal» dei flag e lo SKU generato `DXY-NNNNN` modificabile) e tradotto sui campi Shopify. `src/lib/shopify-admin.ts` scrive in **tre chiamate**, come vuole l'API 2024-10: `productCreate` (dal 2024-07 **non accetta più le varianti**), poi `productVariantsBulkCreate` (o `productVariantsBulkUpdate` per la variante unica), poi `productCreateMedia`. I campi extra diventano **metafield** nel namespace `deluxy`; «non fisico» toglie spedizione e stock. A creazione riuscita il prodotto nasce **anche nel catalogo locale** con `shopifyId`, e una tappa PLM registra la cronaca dei passi. Ordine voluto: prima Shopify, poi il locale — se Shopify rifiuta non resta un prodotto fantasma.
  - **Non ancora provato contro un negozio vero**: senza un token con `write_products` la pagina spegne il bottone e spiega cosa manca. Verificati solo il rendering, il «reveal» delle varianti e la serializzazione del form.
  - La verifica in `/impostazioni` chiede ora **anche i metafield** di un prodotto: stanno dentro `read_products`, ma è il genere di cosa che si dichiara e non funziona, meglio vederlo con un bottone.
- **Righe cliccabili** (26/07/2026): dove compare un prodotto — elenco prodotti, andamento, classifiche (elenchi e tabella), riordino, costi, Shopify, cruscotto — il bersaglio è **tutta la riga**, non le lettere del nome. Tecnica: `tr/li.riga-cliccabile` in `position: relative` + `a.link-riga::after` che copre la riga; resta un `<a>` vero (tasto centrale, screen reader) e i controlli dentro la riga (bottoni azione di Shopify, campi quantità) stanno sopra con `z-index: 1`. Verificato che sul `/shopify` il bottone «Pubblica» riceve ancora il clic.
- **Categorie, linee e collezioni decise nell'app** (`/classificazione`, 27/07/2026): modelli `CategoriaProdotto` (chiave = quella già scritta su `Prodotto.categoria`, travaso automatico dal catalogo di `dominio.ts` alla prima apertura) e `LineaProdotto` (+ `Prodotto.lineaId`), più le collezioni di maison. **Ogni voce ha una descrizione**: è il testo che l'AI leggerà per proporre dove va un prodotto importato — `vocabolarioPerAI()` in `src/lib/classificazione.ts` lo espone già, così cambiando una descrizione in pagina cambia quello che legge il modello. Categorie e linee si eliminano **solo se non le usa nessuno**: spostare d'ufficio i prodotti sarebbe una riclassificazione silenziosa.
- **Escludere un prodotto dalle analisi** (27/07/2026): `Prodotto.esclusoDaAnalisi` + `motivoEsclusione`, bottone in anagrafica. Non cancella niente — il prodotto resta con scritto perché è fuori — ma sparisce da classifiche, andamento, assortimento e ipotesi di ordinativo. Provato in produzione su `_Additional Price` (2.145 pz a 1 €): escluso, e sparito dalla classifica per quantità. In anagrafica si assegnano anche **categoria e linea dalla riga**, senza aprire la scheda, e c'è il filtro «esclusi».
- **Anagrafica completa** (`/anagrafica`, 27/07/2026): la lista di **tutti** i prodotti con tutto quello che l'app ne sa — codice, SKU delle varianti, **fornitore** e **categoria dal negozio** (i due campi del riquadro «Organizzazione del prodotto» di Shopify: Venditore e Tipo, con sotto la tassonomia Shopify quando dice qualcosa — `Uncategorized` non si scrive), categoria interna, prezzo, costo, collezioni Shopify, negozi e venduto a 90 giorni. Filtro per **fornitore** (Deluxy Flowers 206 · Deluxy 168 · CakeDesignME 98 · CLIVATI 1969 42 · …) e filtro «cosa manca» (senza costo · da classificare · senza tipo · senza fornitore · fuori da ogni collezione) ed **export CSV** con gli stessi filtri, per compilare i buchi in foglio di calcolo. I buchi sono scritti «—»: si vedono perché nessuno li ha riempiti con un valore di comodo.
  - **Raggruppa per** (28/07/2026): la stessa pagina diventa un riepilogo per **fornitore**, **categoria dal negozio**, **categoria interna**, **linea** o l'incrocio **fornitore × categoria**. Ogni gruppo dice prodotti, senza costo, esclusi, pezzi e venduto a 90 giorni con la quota sul totale; le colonne ordinano e **cliccando il gruppo si entra nei suoi prodotti** coi filtri già applicati (verificato: «Deluxy Flowers × Fiori» = 95 nel gruppo, 95 nell'elenco). Due regole: i gruppi si contano su **tutti** i prodotti filtrati e non sulla pagina (un totale che cambia sfogliando non è un totale), e il venduto del gruppo somma **solo i prodotti dentro le analisi** mentre gli esclusi restano contati a parte, altrimenti si leggerebbero fatturati che in classifica non esistono. Al 28/07/2026: Deluxy Flowers 206 prodotti e 112.839 € (48,1%), senza fornitore 1.377 e 64.670 € (27,6%), Deluxy 168 e 31.962 € (13,6%).
- **Multi prodotto** (`/multi-prodotto`, 28/07/2026): più prodotti del catalogo agganciati insieme diventano un prodotto nuovo (cesto, composizione, kit), con costo e listino di **ogni singolo componente** e i totali. Modelli: `ComponenteProdotto` (composto ↔ componente + quantità) e le relazioni `Prodotto.componenti` / `Prodotto.usatoIn`. Tre scelte di sostanza:
  - **il costo del composto non si scrive**: è la somma dei componenti, rifatta a ogni apertura. Un numero copiato resterebbe fermo per sempre quando cambia il costo di un pezzo, e nessuno se ne accorgerebbe;
  - **se anche un solo componente non ha costo il totale è «parziale» e il margine non si calcola**; se non ne ha nessuno il totale dice «non lo sappiamo» invece di `0,00 €` (provato in produzione con due bottiglie senza costo: diceva zero, che si legge come un'informazione);
  - **la bozza vive nell'indirizzo** (`?scelti=id×qta,…`), non nel database: si provano accostamenti e si cambia idea senza lasciare prodotti vuoti in catalogo. Il prodotto nasce solo alla conferma.
  Sulla scheda del composto la ricetta si modifica (quantità, 0 per togliere); su quella di un componente c'è scritto in quali composti finisce.
- **Griglie** (`/griglie`, 28/07/2026): due lenti incrociate in un rettangolo (categoria × fascia, fornitore × fascia, linea × categoria…). Ogni casella dice **quanti SKU** ci stanno dentro e **quanto vendono**, con le quote e lo scarto in punti: verde = rende più di quanto occupa, ambra = il contrario. Serve a vedere l'assortimento fermo (tanti SKU, poco venduto) e i buchi da riempire (pochi SKU, tanto venduto) — cose che nessun elenco a una dimensione mostra. Esempio reale al 28/07/2026: «Fiori × Cuore del catalogo» = 59 SKU (2,7%) che fanno 38.094 € (16,3%), **+13,5 pt**; mentre le 291 schede senza categoria dal negozio in fascia Pensiero fanno lo 0,6% del venduto, −12,8 pt. Le percentuali si leggono su tre basi (totale · riga · colonna) perché non sono la stessa cosa, e **il colore segue la base scelta**. **Righe e colonne si ordinano** ciascuna per venduto, SKU, pezzi o nome, crescente o decrescente, più l'ordine «naturale» (per le fasce, la scala dei prezzi: messa in ordine di fatturato smette di essere una scala); le intestazioni sono anche scorciatoie, un clic ordina e il successivo inverte. Ogni casella si apre in anagrafica coi due filtri combinati. Oltre 25 righe o 14 colonne la pagina scrive quante ne restano fuori e che i totali le contano comunque. La collocazione dei prodotti nelle lenti sta in `voceDi()` ([src/lib/gruppi.ts](../src/lib/gruppi.ts)), condivisa con i raggruppamenti: con due copie la stessa cosa finirebbe per avere due nomi.
- **Fasce di prezzo** (`/fasce`, 28/07/2026): sei scalini **ricavati dai 2.168 prezzi veri** (mediana 100 €, 78% sotto 200, 94% sotto 500), non inventati — Pensiero (fino a 50 €, 477 prodotti), Regalo (50–100, 537), Cuore del catalogo (100–200, 624 prodotti e **39% del venduto**), Premium (200–400, 321), Luxury (400–1.000, 155), Eccezionale (da 1.000, 54 prodotti e 14% del venduto). Due scelte di sostanza: **la fascia non si assegna a mano** — è quella in cui cade il prezzo, e se il prezzo cambia la fascia lo segue (a mano ci si ritroverebbe prodotti da 300 € nella fascia «fino a 50» perché nessuno ha aggiornato l'etichetta); e **`da` è compreso, `a` è escluso**, così un prodotto da 49,90 € non cade nel buco fra due fasce. I confini si modificano in pagina e `problemi()` in [src/lib/fasce.ts](../src/lib/fasce.ts) segnala buchi e sovrapposizioni. I 3 prodotti a prezzo zero non sono «economici»: stanno in «— senza prezzo —».
- **Riconciliazione dei doppioni** (`/prodotti/riconcilia` e `/prodotti/<id>/riconcilia`, 28/07/2026): schede diverse che sono lo stesso prodotto — inevitabile con 2.163 prodotti nati dai titoli del venduto di tre negozi (al 28/07/2026: **12 gruppi con lo stesso nome, 26 schede**, tipo «Saint Honorè» × 3 e «Dom perignon» × 2). L'app **propone dicendo perché** (stesso SKU · stessa pagina Shopify · stesso nome · nome simile) e la persona sceglie: unendo, il venduto passa sulla scheda buona e l'altra resta in anagrafica con scritto a chi è unita — non si cancella niente. Ogni riga spostata ricorda da dove veniva (`Vendita.prodottoOriginaleId`), quindi **«separa» la rimette esattamente dov'era**: senza quel campo l'unione sarebbe irreversibile, e un'operazione irreversibile su dati veri non si fa con un bottone. Le schede unite spariscono dall'elenco prodotti ma il conto è scritto, con l'interruttore per rivederle.
  - **Trappola già pagata**: il confronto va fatto sul nome normalizzato **anche nella query**. Cercando i candidati con un `contains` sul nome vero, la scheda «Saint Honorè» proponeva **zero** candidati mentre l'elenco dei doppioni ne mostrava tre: «saint honore» non trova né l'accento né il trattino, cioè proprio i casi per cui serve. Ora i prodotti si leggono e si confrontano in memoria.
- **Per fornitore, Per categoria, Per linea** (`/fornitori`, `/categorie`, `/linee`, 28/07/2026): voci di menu sotto **Prodotto**, accanto a Collezioni, col loro contatore (47 fornitori · 50 categorie dal negozio · 0 linee, che è il vero stato delle cose). Sono il catalogo visto per insieme invece che prodotto per prodotto: da ogni riga si entra nei suoi prodotti in anagrafica. `/fornitori` ha due viste (per fornitore · fornitore × categoria), `/categorie` ne ha **tre tenute separate apposta** — dal negozio (il «Tipo» di Shopify, letto), interna e linea (decise da noi in `/classificazione`): mescolarle farebbe sembrare classificato quello che nessuno ha classificato. Il conto sta in [src/lib/gruppi.ts](../src/lib/gruppi.ts) e la tabella in [src/components/TabellaGruppi.tsx](../src/components/TabellaGruppi.tsx), usati anche dall'anagrafica raggruppata: una funzione sola, così le tre pagine non danno tre numeri diversi per la stessa domanda. Al 28/07/2026 il gruppo più grosso è **«senza fornitore»: 1.377 prodotti e 64.670 €** — quelli nati dai titoli del venduto che nessun negozio ha ancora riconosciuto.
  - **Il CSV applicava meno filtri della pagina** (fornitore, linea, esclusi non c'erano): scaricava più righe di quelle a schermo. Ora sono allineati uno a uno, con le colonne Linea e Fornitore.
  - **Il tipo prodotto arriva da Shopify**, non da un'indovinata sul titolo: l'import delle collezioni prende nello stesso giro `productType`, `vendor` e `tags` e li scrive sul prodotto abbinato per SKU (`tipoShopify`, `vendorShopify`, `tagShopify`, `handleShopify`). Al 27/07/2026: **794 prodotti riconosciuti sui negozi**, 789 col tipo (Fiori 127, Torte 98, Originali Deluxy 77, Dolci 60…), 792 in almeno una collezione. La categoria interna **non viene sovrascritta**: una si legge dal negozio, l'altra la decide una persona.
  - **Un import per negozio**: facendoli tutti in una richiesta il più grande (Gifts, 2.894 prodotti) non arrivava in fondo e restava indietro in silenzio. Ora c'è un bottone per negozio e `maxDuration = 300`.
- **Collezioni vere di Shopify** (`/collezioni`, 27/07/2026, **importate davvero**): modelli `CollezioneShopify` + tabella di legame `ProdottoInCollezioneShopify` (su Shopify un prodotto sta in molte collezioni: `Prodotto.collezioneId` ne tiene una sola e non basta) + `ImportCollezioni` per lo storico. Restano **separate** dalle collezioni di maison: «Fioritura Notturna» è una scelta creativa, «Bouquet sotto i 50 €» un raggruppamento del sito. Bottone «Importa da Shopify» in `/collezioni`, scheda per collezione in `/collezioni/shopify/[id]` col venduto a 90 giorni.
  - **Esito reale del 27/07/2026**: Flowers 62 collezioni · 2.678 appartenenze · 297 prodotti del negozio non riconosciuti; Cake 46 · 1.054 · 306; Gifts 234 · 7.260 · 2.035. In tutto **342 collezioni**, 10.992 appartenenze, **272 collezioni** con almeno un prodotto riconosciuto.
  - L'import fa **una sola passata sui prodotti** chiedendo insieme SKU e collezioni: Shopify fa pagare i campi annidati, due giri costerebbero il doppio (pagine da 25 prodotti con 10 varianti e 10 collezioni ≈ 525 punti, sotto il tetto di 1.000). Abbinamento per SKU di variante → codice → titolo normalizzato; il resto resta fuori e viene **contato**, non indovinato. Le appartenenze si **riscrivono** a ogni import, altrimenti un prodotto tolto da una collezione resterebbe qui per sempre.
  - **Trappola pagata**: importando tre negozi di fila il terzo prende `Throttled` — Shopify non conta le richieste ma il **costo** dei campi. Ora la chiamata riprova con attesa crescente, leggendo `extensions.cost.throttleStatus` quando c'è, e fra un negozio e l'altro c'è una pausa.
  - **Nome nel venduto**: il negozio si chiama «Cake» qui e `cakedesign.me` negli ordini. `NegozioShopify.canaleVendite` tiene la corrispondenza (campo in `/impostazioni`, con l'elenco dei canali davvero presenti nelle vendite); finché manca, la scheda conta **tutti i canali** e lo dichiara invece di mostrare uno zero che sembra un dato.
- **Categorie & collezioni** (`/assortimento`, 27/07/2026): il venduto incrociato con le informazioni del prodotto (`analizzaAssortimento` in `vendite.ts`). Per ogni categoria e collezione: **prodotti venduti su prodotti a catalogo** (la parte di assortimento che sta ferma: oggi in globale 618 su 2.163, il 29%), pezzi, ricavo, Δ sul periodo precedente, quota, prezzo medio, margine (solo dove il costo c'è) e tendenza, con i **3 prodotti che tirano di più** sotto ogni riga. Le categorie/collezioni che non hanno venduto niente compaiono lo stesso a zero: senza riga si scambiano per «non esiste». La scheda di una collezione (`/collezioni/[id]`) mostra gli stessi numeri per sé. Segue l'ambito globale/brand e conta solo le vendite a buon fine.
  - **29/07/2026 — il report si appoggia alle lenti importate**: la categoria interna è al 100% «Da classificare» e la collezione maison è vuota, quindi le due tabelle di prima non dicevano niente. Ora `analizzaAssortimento` calcola e la pagina mostra **cinque lenti in ordine di quanto hanno da dire**: prima **Per categoria del negozio** (`tipoShopify`, letto da Shopify — Fiori, Torte, Fiori d'Arte…) e **Per fornitore** (`vendorShopify`), che hanno dati veri da subito; poi **Per linea** (nostra, si riempie in «Imposta categorie e linee»), **Per collezione** (maison) e in fondo **Per categoria interna** (quella «Da classificare»). Il banner ora spiega che le lenti importate hanno già dati e dove si riempiono le nostre. Verificato in dev su dati reali (234 k€, 603 prodotti venduti): tutte e cinque le tabelle rendono, nessun errore console.
- **Classifiche** (`/classifiche`, 26/07/2026): gli articoli in fila **per quantità** e **per valore**, filtrabili per periodo, **brand** (tutti o uno) e vista **prodotto/variante**, più una tabella che confronta le due posizioni (chi sale passando dai pezzi al valore è caro e raro, chi scende è volume a basso scontrino). Contano **solo le vendite andate a buon fine**: `Vendita.statoPagamento`/`statoEvasione` arrivano da Orders e il filtro è `PAID`/`PARTIALLY_PAID` (`FILTRO_BUON_FINE` in `vendite.ts`), applicato anche alle **ipotesi di ordinativo** perché un reso non è domanda. Sui 12 mesi restano fuori 22.283 € su 932.604 (rimborsati 7.015 €, rimborsati in parte 8.183 €, non incassati 7.085 €). **L'evasione NON viene pretesa**: il 47% del venduto è `UNFULFILLED` (consegne future o mai segnate), chiederla taglierebbe vendite verissime. I **prodotti archiviati** non entrano in classifica: è la leva umana per togliere le righe di servizio dei negozi — oggi `_Additional Price` (2.145 pz a 1 €) è primo per quantità e va archiviato a mano, perché riconoscerlo dal nome sarebbe indovinare.
- **Ipotesi di ordinativo** (`/riordini`, `/riordini/[id]`): `src/lib/riordino.ts` calcola quanto riordinare (ritmo pesato 65/35 fra metà recente e metà precedente, correzione di tendenza limitata a ±35%, fabbisogno = ritmo × (lead time + copertura) + scorta − giacenza). Parametri regolabili in querystring; l'ipotesi si congela in `PianoRiordino`/`RigaRiordino` con quantità modificabili, stato bozza/confermato/archiviato ed export CSV (`/riordini/[id]/csv`).
- **Trend con AI** (`/trend-ai`): `src/lib/ai-trend.ts` manda a OpenAI **solo numeri già calcolati** e ne riceve sintesi, osservazioni, azioni proposte e domande; tutto storicizzato in `LetturaTrend` **insieme al pacchetto di dati**, così la lettura resta verificabile. L'AI non calcola e non esegue niente.
- **Venduto reale in archivio (26/07/2026)**: importate **6.582 righe** da Deluxy Orders, 12 mesi (25/07/2025 → 25/07/2026): 9.366 pezzi, **932.604 €** (deluxy.it 63%, Flowers 30%, cakedesign.me 7%). Chiave API di Orders creata (`deluxy-merchandising`, sola lettura) e messa in `.env` locale **e** su Vercel (`ORDERS_API_KEY` + `ORDERS_URL`). Le vendite dimostrative sono state rimosse: in archivio ci sono solo dati veri.
- **Catalogo dal venduto**: `scripts/prodotti-da-vendite.mjs` (`npm run prodotti:da-vendite`, opzioni `--min N` e `--dry`) crea un prodotto per ogni titolo venduto, con varianti da SKU + nome variante, e aggancia le vendite già in archivio. Il 26/07/2026 sono stati creati **2.163 prodotti** (tutto il venduto: la coda lunga degli ordini su misura è quasi 1.900 titoli venduti una volta sola). Prezzo = media davvero incassata; **costo 0**, categoria **`DA_CLASSIFICARE`** e giacenza 0 restano da compilare: non si deducono dal titolo. La riga venduta porta anche `varianteNome` (la taglia scelta dal cliente), altrimenti gli SKU sono codici ciechi tipo `ICQLBN-2`.
- **Costo mancante ≠ costo zero (26/07/2026)**: con 2.163 prodotti importati a costo 0 l'app dichiarava «margine 100%» ovunque. Ora un costo assente **esclude** la riga dal margine invece di valere zero: `/vendite` mostra «n.d.» e dice su quale quota del venduto il margine è calcolabile, `/costi` tiene fuori dalla tabella i prodotti senza costo e li conta a parte, `/riordini` non stima il margine atteso (`margineAtteso: null`) e lo dichiara nell'avviso. Stessa regola del punteggio partner: una variabile senza dati si esclude, non vale zero.
- **Elenchi paginati (26/07/2026)**: con migliaia di prodotti `/prodotti` pesava 10 MB e `/shopify` 11 MB (35-67 s in dev). Ora `/prodotti` e `/shopify` sono paginati a 100, `/costi` mostra i 100 col margine peggiore, `/sviluppo` 40 schede per colonna con link al resto, `/vendite` i primi 60 prodotti per ricavo e `/riordini` le prime 80 righe per urgenza — sempre **dicendo quanti restano fuori** (nessun taglio silenzioso), e il «congela ipotesi» prende comunque tutte le righe.
- **Vendite dimostrative**: `scripts/vendite-demo.mjs` (`npm run vendite:demo`) genera 180 giorni di venduto plausibile con stagionalità settimanale e picchi (San Valentino, festa della mamma, Natale). Inserisce solo righe con `origine = "demo"`; `--pulisci` toglie solo quelle.
- **Hub**: voce `merchandising` in `deluxy-hub/src/lib/apps.ts` + icona in `AppIcon.tsx` (union estesa). In produzione compare con `APP_URL_MERCHANDISING`.
- Verifica: `npm run db:push` + `db:seed` ok; `npx tsc --noEmit` exit 0; navigazione browser su tutte le pagine senza errori console; azione Shopify testata (bozza + revalidation).

- **29/07/2026 — menù riordinato**: la sezione **Prodotto** era lunga 12 voci e mescolava consultazione e configurazione. Ora tiene solo Collezioni · Prodotti · Multi prodotto · Anagrafica · Sviluppo · Costi & margini; le viste per insieme (Per fornitore/categoria/linea/fascia + Griglie) sono in una sezione dedicata **«Il catalogo per insieme»**, e la pagina di gestione `/classificazione` è stata rinominata **«Imposta categorie e linee»** (icona da config) e spostata in fondo a quella sezione — prima si chiamava «Categorie, linee, collezioni» e si confondeva con «Categorie & collezioni» (`/assortimento`), che invece è il **report di vendita** sotto Vendite.

- **29/07/2026 — Visual merchandising sulle collezioni Shopify (con push dell'ordine)**: `/visual` non lavora più su allestimenti liberi (il modello `Vetrina` resta ma è dormiente) ma sulle **collezioni vere del negozio pubblicate su Shopify** (`pubblicataShopify`, letto all'import via `publishedOnPublication` sull'Online Store; «attive» = pubblicate, visibili ai clienti). Per ogni collezione si sceglie una **regola d'ordine** (più venduti / più fatturato / novità / margine / prezzo ↑↓ / manuale — `src/lib/ordinamento-vetrina.ts`), che **propone** l'ordine materializzandolo in `ProdottoInCollezioneShopify.posizione`; poi si **ritocca a mano** (frecce su/giù) e si **invia a Shopify** con `collectionReorderProducts` (prima `collectionUpdate sortOrder: MANUAL`). Azioni in `src/lib/azioni-vetrina-shopify.ts`.
  - **Paletti del push** (dichiarati in pagina, non aggirati): solo collezioni **manuali** (le smart si ordinano da regola su Shopify); serve un token con **write_products** collegato (il pulsante è disabilitato senza, letto da `NegozioShopify.permessi`); badge «da sincronizzare» quando `ordineModificatoIl > ordineSpintoIl`.
  - **L'import preserva l'ordine curato**: prima del `deleteMany` delle appartenenze rilegge le `posizione` esistenti e le riporta sui legami che restano; i prodotti nuovi entrano a 0. Salva anche il **GID Shopify del prodotto** (`prodottoShopifyId`), che serve al riordino. I campi nostri della collezione (regolaOrdinamento, ordine*, stato, note, posizioni, inCampagne) non vengono toccati dall'import.
  - **Verificato (29/07/2026)**: `prisma db push` sul Postgres condiviso (colonne additive, schema `merchandising`), `tsc` exit 0; in dev su dati veri: `/visual` mostra lo stato vuoto corretto (342 collezioni importate, 0 pubblicate → serve rifare l'import per popolare `pubblicataShopify`); la curatela di «Roma» (Gifts, 58 prodotti, manuale) rende bene; **«Applica regola → più venduti» provato end-to-end** (regolaOrdinamento=best_seller, posizioni rinumerate per venduto, poi stato ripulito); il pulsante «Invia a Shopify» risulta **abilitato** perché Gifts ha davvero `write_products` — **il push contro il negozio vero non è stato eseguito** (riordina lo storefront reale: da fare con conferma esplicita).
  - **MANCA qui**: rifare l'import collezioni per popolare `pubblicataShopify` (oggi 0 → `/visual` è vuoto in produzione finché non si reimporta); provare il push vero su una collezione manuale (con conferma).

- **29/07/2026 — tipologia di risposta al bisogno (per prodotto)**: ogni prodotto ha ora una lente che dice quanto in fretta si sa rispondere a chi lo ordina, ricavata dai **giorni minimi di evasione** — il metafield Shopify **`prodotto.consegna`** (mostrato come «gg_disp_min», tipo `number_integer`), salvato in `Prodotto.ggDispMin`. La scala (decisa dall'utente) sta in `src/lib/risposta-bisogno.ts`: **0 → Urgenze**, **1 → Da domani**, **2–3 → Pianificato**, **4+ → Su misura**; `null` = «non indicato» (non si deduce). Mostrata come badge nella scheda prodotto. L'import (`shopify-collezioni.ts` → `leggiProdotti`) legge il metafield e lo scrive sul prodotto abbinato per SKU.
  - **Verificato (29/07/2026)**: `db push` + `tsc` ok; metafield confermato via MCP Shopify (`prodotto.consegna` valorizzato: Cheesecake 0, Cassata 1, Montebianco 2, Rainbow Cake 5…); badge provato in dev su 4 prodotti con valori 0/2/5 → «Urgenze»/«Pianificato»/«Su misura» (poi valori di test azzerati). **MANCA**: rifare l'import per popolare `ggDispMin` sui prodotti veri (oggi null → badge assente finché non si reimporta).

- **30/07/2026 — tipologie di collezione con regola standing (estese a più collezioni)**: `/visual/tipologie`. Modello `TipologiaCollezione` (nome unico, `regolaOrdinamento`) + `CollezioneShopify.tipologiaId`. Una tipologia è un'etichetta editoriale nostra (Bouquet, Torte, Occasioni…) con una **regola d'ordine standing**: la si imposta una volta e vale per tutte le collezioni assegnate. Azioni in `src/lib/azioni-tipologie.ts`: crea/aggiorna/elimina, **assegna in blocco** (`<select multiple>`, `assegnaCollezioniATipologia`) che applica subito la regola a ogni collezione, «riapplica ora». La logica d'ordine è la funzione riusabile `applicaRegolaACollezione` in `ordinamento-vetrina.ts` (usata da: azione di pagina, assegnazione a tipologia, riapplico all'import) — una sola, così non divergono.
  - **Standing all'import**: a fine import (`importaCollezioniDa`) gira `riapplicaStandingPerNegozio`: le collezioni con una tipologia che ha una regola si **risistemano da sole coi prodotti nuovi**; quelle senza tipologia (ordine curato a mano) non si toccano. In try/catch: non fa fallire l'import.
  - **Verificato (30/07/2026)** su dati veri (pubblicando 2 collezioni manuali di prova): tipologia «Bouquet» (best_seller) creata via server action, assegnata in blocco a «Roma» + «Regali per Lei» → entrambe con `tipologiaId` + `regolaOrdinamento=best_seller`, Roma riordinata per venduto. Poi **tutti i dati di prova rimossi** (0 tipologie, 0 pubblicate, posizioni azzerate). `db push` + `tsc` ok. Nota: `navigate`/`read_page` del browser in-app deriva spesso a `/`; le server-action form vanno sottomesse con `form.requestSubmit()` da JS (il click programmatico non basta) — vale per tutta l'app.

- **30/07/2026 — import collezioni eseguito su tutti i negozi** (`scripts/importa-tutte-collezioni.ts`, via `npx tsx`, riusa `negoziAttivi`+`importaCollezioniDa`): Cake 47 collezioni/1.056 appartenenze, Flowers 62/2.678, Gifts 234/7.260. Popolati: **787 prodotti con `gg_disp_min`** (546 Urgenze, 125 Da domani, 115 Pianificato, 1 Su misura → badge risposta al bisogno attivo), **10.994 appartenenze col GID Shopify** (push ordine ora possibile). **`pubblicataShopify` = true su tutte le 343**: lo stato di pubblicazione **non è leggibile** con questi token (manca lo scope `read_publications`; `publishedOnCurrentPublication` fa fallire la query, quindi la lettura è best-effort e in mancanza si mostra tutto). Fix reso non fatale in `shopify-collezioni.ts`. **Per avere il filtro «solo pubblicate» vero serve aggiungere lo scope `read_publications` ai token** (poi ri-verificare in Impostazioni e reimportare). Finché non c'è, in Visual compaiono anche le collezioni tecniche/smart: si sospendono a mano (`stato`).

- **30/07/2026 — Visual rispetta l'ambito**: `/visual` ignorava il selettore brand in alto e mostrava tutte le collezioni. Ora filtra per il **negozio del brand scelto**: il brand è un canale di vendita (`deluxy.it`, `Flowers`, `cakedesign.me`), la collezione appartiene a un negozio (`Gifts`, `Flowers`, `Cake`), il ponte è `NegozioShopify.canaleVendite` — nuovo helper `negoziDelBrand()` in `brand.ts`. Verificato: deluxy.it→234 (Gifts), Flowers→62, globale→343. Le **tipologie** restano trasversali ai brand (config editoriale, non filtrata). Mappatura canaleVendite completa: Flowers↔Flowers, Gifts↔deluxy.it, Cake↔cakedesign.me.

- **30/07/2026 — più regole d'ordine in priorità**: una tipologia (e la singola collezione) può avere **più regole in priorità** invece di una: la 1ª decide l'ordine, le successive spezzano i pareggi (es. «più venduti → margine → prezzo alto»). Salvate in `regolaOrdinamento` separate da virgola (retro-compatibile: un valore singolo è una lista di uno). In `ordinamento-vetrina.ts`: `parseRegole`/`serializeRegole`/`regoleDaForm`, `ordineSecondoRegole(regole[])` (sort multi-chiave), `applicaRegoleACollezione(regole[])`; `etichettaRegola` mostra «A → B → C». UI: componente `SelettoreRegole` (N `<select name="regola">` in priorità, senza JS; il form li manda come lista). Verificato: creata «Prodotti Partner» = best_seller,margine,prezzo_desc, salvata e mostrata in priorità (poi rimossa).

- **30/07/2026 — prestazioni: da 3–7 secondi a mezzo secondo**. Misurato in produzione (minimo su più giri), non a naso. In ordine di guadagno:
  1. **La funzione girava a Washington, il database è a Francoforte.** Senza `regions` Vercel esegue in `iad1`: l'header diceva `X-Vercel-Id: fra1::iad1::…`, cioè ogni query attraversava l'Atlantico (~120 ms di sola latenza) e una pagina ne fa decine. Aggiunto [vercel.json](../vercel.json) con `"regions": ["fra1"]` → ora `fra1::fra1`. **Da solo ha tagliato il 77–89%.** È la prima cosa da controllare in ogni app Deluxy su Vercel col database in Europa.
  2. **I contatori del menu: nove query diventate una** ([Sidebar.tsx](../src/components/Sidebar.tsx), `$queryRaw` con le sotto-selezioni). La barra sta in *ogni* pagina, quindi quel costo si pagava ovunque e con `connection_limit=5` le query si accodavano: misurato **4,7 s → 0,3 s** in globale, 1,3 s → 0,14 s dentro un brand. I numeri sono stati **confrontati uno a uno** con le vecchie query (globale e brand) prima di sostituire. ⚠️ La query nomina lo schema `merchandising` esplicitamente.
  3. **Indici mancanti sul venduto**: `Vendita` non aveva indice su `canale` (ci passa ogni filtro d'ambito e l'elenco dei brand) né su `statoPagamento` (`FILTRO_BUON_FINE`, in quasi ogni conto). Aggiunti `[canale]`, `[canale,data]`, `[statoPagamento,data]`.
  4. **`brandCorrente`/`brandDisponibili` avvolte in `cache()` di React**: pagina, Sidebar e barra dell'ambito le chiedevano ognuna per conto suo (tre `distinct` sul venduto a schermata). È deduplica **per richiesta**, non una cache a tempo: nessun rischio di numeri vecchi.
  5. **La home esce subito** ([page.tsx](../src/app/page.tsx)): aspettava la più lenta di 6 analisi prima di mostrare qualsiasi cosa. Ora guscio, menu, titolo e periodo sono immediati e il contenuto arriva in **streaming** (`<Suspense>` + scheletro della stessa forma). Nessun calcolo cambiato. È il primo uso di Suspense nell'app.
  6. **`/collezioni`**: `brandCorrente` ed `elencoNegozi` erano in fila pur non dipendendo l'uno dall'altro; e il venduto usava un `IN (…)` con centinaia di id (la trappola di [feedback-prestazioni-next-liste]). Ora in parallelo e senza `IN`.

  **Esito (primo byte / pagina completa, produzione):** `/` 6,75 s → 1,27 s · `/anagrafica` 5,76 → 0,45 · `/collezioni` 6,78 → 1,11 · `/classifiche` 3,53 → 0,72 · `/griglie` 3,19 → 0,35 · `/prodotti` 2,62 → 0,47 · `/visual` 3,39 → 0,56. Tutte e 22 le pagine verificate 200.

  **Resta aperto**: la home ha ancora ~0,9 s di primo byte perché le 6 analisi pesanti saturano il pool (`connection_limit=5` nella `DATABASE_URL`) e le query del menu si accodano. Alzare quel numero aiuterebbe, **ma il cluster Postgres è condiviso con altre 5 app**: è una decisione da prendere guardando la capacità del pooler, non da cambiare di slancio.

- **30/07/2026 — le tipologie si definiscono per criteri** (`/visual/tipologie` + scheda `/visual/tipologie/[id]`). Una tipologia non è più un'etichetta da appiccicare a mano alle collezioni: è un **mondo commerciale definito dai criteri** che dicono quali prodotti ne fanno parte — «Lusso» = fasce alte, «Linea rose» = quella linea, «Originale» = quel tipo. `TipologiaCollezione.criteri` (JSON) + [src/lib/criteri-tipologia.ts](../src/lib/criteri-tipologia.ts).
  - **Otto criteri mescolabili**: fascia di prezzo · tipo prodotto (dal negozio) · fornitore (dal negozio) · linea · collezione del negozio · area (città del fornitore interno) · tag · novità (ultimi N giorni). **Dentro** un criterio i valori valgono in alternativa, **fra** criteri valgono tutti insieme — scritto in pagina, perché è la cosa che si sbaglia a intuito.
  - **Il giro è: definisci i criteri → guarda cosa hanno preso → scegli la priorità.** La creazione porta dritti sulla scheda, dove si vedono quanti e quali prodotti rientrano *già ordinati*, e lì si sceglie la priorità (le regole multiple di prima). `quantiCriteri()===0` non vuol dire «tutti i prodotti» ma «tipologia da finire»: `filtroCriteri` torna `null` apposta, così nessuno seleziona per sbaglio l'intero catalogo.
  - **Copertura reale dei criteri** (dichiarata nelle note sotto ogni riquadro, non nascosta): fascia 2.168/2.171 · tipo 50 valori · fornitore 47 · tag 768 prodotti · **linea 0 (nessuna creata)** · **area: solo 5 prodotti hanno un fornitore interno**, quindi quel criterio ne prende pochissimi. L'area è la città del fornitore per scelta dell'utente; nei dati l'area geografica vive piuttosto nelle collezioni («Roma», «Milano»).
  - `ordinaProdotti()` estratta in [ordinamento-vetrina.ts](../src/lib/ordinamento-vetrina.ts): la usano sia l'ordine dentro una collezione sia l'anteprima della tipologia — una funzione sola, altrimenti lo stesso concetto ordinerebbe in due modi.
  - **Verificato su dati veri**: «Lusso» = fasce Luxury+Eccezionale → **209 prodotti**, identico alla controprova indipendente (`prezzoVendita >= 400`); criteri descritti «fascia Luxury o Eccezionale»; con priorità «Più fatturato → Prezzo alto» l'ordine è passato dall'alfabetico ai prodotti che hanno fatturato di più. Tipologia di prova poi rimossa.

- **30/07/2026 — `/visual` dice a colpo d'occhio cosa sono e quanto vendono le collezioni**. Da griglia di card a **tabella ordinabile**: per ogni collezione le caratteristiche in pillole (**In vetrina / Non in vetrina**, Manuale/Automatica, Sospesa, tipologia, in campagne, altre posizioni, «da sincronizzare»), i **prodotti**, il **venduto 90gg** e la **quota %**, più la data di ultima modifica sul negozio.
  - **La vetrina si accende dalla riga** (bollino ★/☆, `cambiaVetrina` in `azioni-collezioni-shopify.ts`): «vetrina» è una delle `posizioni` già esistenti — non un flag nuovo, altrimenti la stessa cosa sarebbe scritta in due punti che possono contraddirsi. Vederlo senza poterlo cambiare sarebbe stata mezza risposta: al 30/07/2026 **nessuna collezione era segnata**, quindi il badge avrebbe detto «no» per sempre.
  - **Ordinamenti**: più vendute · ultima modifica sul negozio · più prodotti · nome · prima quelle in vetrina. **«Novità» non c'è, di proposito**: Shopify non espone una data di creazione per le collezioni e la nostra `creataIl` è il momento dell'import (343 valori a millisecondi di distanza) — ordinarci sopra darebbe una classifica che sembra vera e non lo è. È scritto in pagina.
  - **Trappola evitata**: sommando il venduto delle collezioni veniva **3.141.052 €** contro i 229.280 € reali del periodo, perché un prodotto sta in molte collezioni e il suo incasso si contava più volte. Ora il totale è il **venduto vero** (`229.280,42 €`, verificato con una controprova indipendente) e la quota dice «quanta parte del venduto passa da questa collezione»; in pagina è scritto che **le quote non sommano a 100%**.
  - Verificato in dev su dati veri: 343 collezioni, KPI corretti, toggle vetrina scritto e riletto, ordinamento «prima quelle in vetrina» che porta in testa quella segnata. Stato di prova poi ripristinato.

- **30/07/2026 — rotazioni periodiche delle collezioni** (`/visual/rotazioni`, modello `RegolaRotazione` + `CollezioneShopify.rotazioneId`). Una regola dice **ogni quanto** l'ordine si rifà da solo — giornaliera · settimanale · mensile — e **vale per più collezioni**: il ritmo si decide una volta. In `/visual` c'è la colonna **Rotazione** con la frequenza (o «—»), il nome della regola e se è in pausa.
  - **Due modi**: *Rinfresca l'ordine* (riapplica le regole d'ordine: chi vende di più oggi sale oggi — usa quelle della collezione, in mancanza quelle della sua tipologia; se non ce ne sono la collezione si salta invece di inventarle un ordine) e *Ruota le posizioni* (i primi `passo` prodotti passano in fondo, così a turno tutti hanno il loro momento in cima).
  - **Un cron solo, giornaliero** (`/api/cron/rotazioni`, `vercel.json`, 05:20): passa le regole attive e fa scattare **solo quelle scadute**, misurando i **giorni** dall'ultima esecuzione — così le tre frequenze convivono e se un giorno il giro salta, quello dopo recupera invece di perdere il turno. Una regola mai eseguita è subito scaduta (altrimenti sembrerebbe rotta per un periodo intero). Protetta da `CRON_SECRET`, **impostato su Vercel il 30/07/2026**; senza, la rotta risponde 503 e la pagina lo dice in cima.
  - **L'invio automatico a Shopify è spento di default** (`spingiSuShopify`): un automatismo che scrive da solo sul negozio vero è una decisione da prendere apposta, non un effetto collaterale. Senza la spunta l'ordine si rifà qui e la collezione resta «da sincronizzare». Si accende sulla singola regola, e vale solo per le collezioni manuali.
  - `spingiOrdineSuShopify` è stata divisa in due: `spingiOrdineSuShopifySilenzioso` (torna `true` o il messaggio d'errore, la usa il cron che non ha una pagina dove mandare l'utente) e l'azione di pagina che ci si appoggia per i redirect.
  - **Verificato end-to-end su dati veri** (collezione «Roma», 58 prodotti): regola mai eseguita = subito scaduta; dopo un giro in modo «ruota» il primo prodotto è passato in fondo, dopo due giri lo scorrimento era di due; a esecuzione fatta la regola non risultava più scaduta; `spinte: 0` perché l'invio a Shopify era spento. Stato di prova poi ripulito.

- **30/07/2026 — la tabella di `/visual` si ordina dalle intestazioni**: un clic ordina per quella colonna, il successivo inverte (freccia ↑↓ sulla colonna attiva), come già in `/griglie` — stessa convenzione, non una nuova. Ordinabili: vetrina (★), collezione, prodotti, venduto/quota, ordine, rotazione, ultima modifica. L'ordinamento sta in un solo parametro `?ordina=criterio-verso`; il menu a tendina di prima è stato tolto perché ridondante. Due scelte: il **pareggio si spezza sempre col nome** (altrimenti righe uguali ballano fra un caricamento e l'altro) e le collezioni **senza rotazione finiscono in fondo** (l'assenza non è un valore che compete con le frequenze). Verificato in dev: nome A→Z e Z→A, prodotti 730→0 e 0→730, modifica su date vere, e l'intestazione attiva che propone l'inversione.

- **30/07/2026 — anteprima dell'ordine e link alla collezione sul sito** (`/visual/[id]`). Il pulsante «Applica regole» è diventato **«Vedi come verrebbe»**: le regole scelte finiscono **nell'indirizzo** (form in GET, `?regola=…`), la pagina mostra l'ordine ipotizzato e **non scrive niente** finché non si preme «Applica quest'ordine». Stessa idea della bozza di `/multi-prodotto`: finché non confermi, non esiste. C'è anche «Annulla anteprima».
  - L'anteprima **non è un altro elenco**: accanto a ogni prodotto dice da dove viene e di quanto si muove (↑/↓ con la posizione di prima), e in cima quanti prodotti cambierebbero posto — su «Roma» con «Più fatturato → Prezzo alto»: **57 su 58**. Un ordine nuovo senza il confronto non si sa leggere.
  - **Casi vuoti distinti**: nessuna regola scelta ≠ collezione senza prodotti. Con zero prodotti «nessuno cambierebbe posto» sarebbe vero e inutile, quindi si dice il motivo vero (capitato sulla collezione «Wicky's Innovative Japanese Cuisine», che non ha prodotti riconosciuti).
  - **«Apri sul sito ↗»** porta alla collezione com'è per il cliente: `https://{dominio myshopify}/collections/{handle}`. Si passa dal dominio myshopify perché è quello che conosciamo sempre e **Shopify reindirizza da solo** al dominio vero — verificato: `deluxygifts.myshopify.com/collections/…` → 301 → `https://deluxy.it/collections/…` (200). Inventare qui il dominio pubblico vorrebbe dire sbagliarlo per i negozi che non l'hanno impostato.

- **30/07/2026 — da telefono il menu non si apriva** (segnalato dall'utente). In `globals.css` c'era `@media (max-width: 800px) { .sidebar { display: none } }`: la barra spariva e **non c'era modo di farla tornare**, perché il bottone agisce su `margin-left`/`opacity` e `display` vince su tutto. Ora sotto gli 800px è un **pannello a scomparsa** (`position: fixed`, fuori schermo, rientra su `data-menu-aperto`) con un **velo** dietro; si chiude toccando il velo, toccando una voce, o ripremendo il bottone.
  - **Due attributi, non uno**: `data-sidebar-chiusa` (desktop, salvato in localStorage) e `data-menu-aperto` (telefono, non salvato). Con un attributo solo il default dovrebbe essere insieme «aperto» da desktop e «chiuso» da telefono, e uno dei due casi resterebbe sbagliato. Su telefono lo stato **non si ricorda**, di proposito: un menu che si ritrova aperto al caricamento copre la pagina che si voleva leggere. La regola desktop è stata chiusa in `@media (min-width: 801px)` così le due logiche non si pestano i piedi.
  - Il bottone (e il velo) spariscono dove non c'è una barra da aprire — la pagina di accesso — via `body:not(:has(.sidebar))`.
  - **Verificato a 432px**: pannello inizialmente fuori schermo, bottone → `left: 0` e velo visibile, chiusura da velo / da voce / da bottone; e a **1280px** il desktop è intatto (sticky 250px, chiude e riapre, preferenza salvata). ⚠️ **Trappola di misura**: con la tab in background `document.hidden` è `true`, le transizioni CSS non avanzano e `getComputedStyle` restituisce i valori **iniziali** — sembrava che il pannello non si aprisse. Si misura iniettando `*{transition:none !important}`.

- **03/08/2026 — si cerca fra le collezioni** (`/visual`, chiesto dall'utente). Con 343 righe scorrere non è un modo di trovarle: ora in cima c'è una barra con **ricerca a testo**, **negozio**, **tipologia** e una **condizione** fra dieci (in vetrina · non in vetrina · da sincronizzare · senza regola d'ordine · senza rotazione · senza tipologia · manuali · automatiche · sospese · senza prodotti conosciuti). Tutto vive nell'indirizzo, quindi una ricerca si manda a qualcuno o si tiene fra i preferiti.
  - **Il testo si confronta normalizzato** (`normalizza()` di `riconciliazione.ts`, la stessa dei doppioni): via accenti, trattini e maiuscole, e **tutte le parole devono comparire in qualunque ordine** — si cerca «torte classiche» senza sapere com'è scritto il nome. Con 343 righe già in memoria si filtra qui: un `contains` sul titolo vero darebbe zero risultati proprio sui nomi accentati (trappola già pagata).
  - Guarda **nome, negozio, tipologia, posizioni e l'handle**. L'handle è dichiarato in pagina perché altrimenti un risultato sembra un errore: «roma» trova anche «Corteggiamento», che su Flowers vive a `/romantico`.
  - **Ordinare non azzera la ricerca** (i filtri restano nei link delle intestazioni) e **cercare non azzera l'ordinamento** (campo nascosto `ordina` nel form): prima uno dei due si sarebbe perso a ogni clic.
  - Le tendine offrono **solo i valori che esistono in questo ambito** (negozi con collezioni, tipologie davvero assegnate); la tendina tipologia non compare finché non ce n'è una. «Nessuna collezione» e «nessun risultato» sono **due stati vuoti distinti**, con scritto cosa cerca la ricerca.
  - ⚠️ **Doppio conteggio, ricascato e corretto**: il KPI del venduto filtrato sommava le righe delle collezioni e dava **2.874.458 €** in un periodo che ne vale 218.637 — un prodotto sta in molte collezioni. Ora somma i **prodotti distinti** delle collezioni trovate; la base della quota resta il venduto totale del periodo (non cambia perché sto cercando). È lo stesso errore già pagato sul totale di pagina il 30/07: **qualsiasi numero per insieme di collezioni va deduplicato per prodotto.**
  - **Verificato** su dati veri (343 collezioni, 218.637 € in 90 giorni): «roma» 17 · «torte» 32 · «san valentino» 4 · «torte classiche» 1 · senza prodotti conosciuti 70 · manuali 83 · automatiche 260 · Flowers 62 · ricerca a vuoto → stato vuoto giusto. Tutti i venduti filtrati ≤ totale del periodo, e manuali+automatiche (80.387+157.387) supera il totale come deve, perché un prodotto sta in entrambe. `tsc --noEmit` exit 0, `npm run build` ok.

- **03/08/2026 — le collezioni non sono più mezze vuote: l'import crea i prodotti che qui non c'erano** (era il punto aperto in cima a questo documento). L'import legava un prodotto del negozio solo per SKU → codice → titolo normalizzato, e quello che non combaciava veniva **contato e buttato**: 70 collezioni pubblicate su 343 senza nemmeno un prodotto, «Torte Classiche» 127 contro 440. Ora:
  - **Aggancio esatto per `shopifyId`**, prima di ogni altra chiave: non è una somiglianza, è lo stesso prodotto. L'ordine è id Shopify → SKU variante → SKU usato come codice → handle → titolo normalizzato. `handleShopify` entra nell'indice dei codici. Una funzione sola (`abbina()`), usata dall'import **e** dall'anteprima: con due copie lo stesso prodotto verrebbe riconosciuto in due modi.
  - **Quello che resta si crea** (`creaProdottiMancanti`), con **solo dati letti**: nome, handle, immagine, prezzo = minimo delle varianti (e ogni variante col suo `deltaPrezzo`, che è il modello «base + delta» dell'app), varianti con SKU, tipo, fornitore, tag, tassonomia, `gg_disp_min`, e lo **stato del negozio come fase** (ACTIVE→in vendita, DRAFT→concept, ARCHIVED→archiviato, quindi già fuori dalle classifiche). **Costo 0 e categoria «Da classificare» restano da compilare**: non si deducono. Nasce con `shopifyId`, quindi al prossimo import si riaggancia da lì e **non si ricrea**.
  - **Niente unioni per somiglianza**: le schede nuove non vengono attaccate a quelle vecchie «perché si somigliano» — si uniscono a mano in `/prodotti/riconcilia`, che propone dicendo perché ed è reversibile. Misurato dopo l'import: sui 2.273 nuovi, **0 nomi identici** a una scheda preesistente e **54 candidati sopra l'80%** di similarità, di cui la maggior parte sono **prodotti diversi davvero** («MAXI Bouquet Lavanda e Rose Bianche» ≠ «Bouquet Lavanda e Rose Bianche»: è la taglia). Unire in automatico avrebbe spostato il venduto sul prodotto sbagliato.
  - **Anteprima che non scrive**: `scripts/anteprima-abbinamento.ts` (`npx tsx`) dice quanti prodotti si riconoscono e quanti se ne creerebbero, con esempi. Da lanciare **prima** di un import quando si tocca l'abbinamento.
  - **Esito reale del 03/08/2026** (`scripts/importa-tutte-collezioni.ts`, 12 minuti in tutto): Cake 47 collezioni · 3.059 appartenenze · 311 schede create; Flowers 62 · 5.335 · 321; Gifts 234 · 24.849 · 1.641. **Catalogo da 2.171 a 4.444 prodotti**, appartenenze **da 10.994 a 33.243**, `gg_disp_min` da 787 a 2.691, 2.247 prodotti con immagine. **Collezioni pubblicate senza nemmeno un prodotto: da 70 a 24.** Campione: «Torte Classiche» 127→**436 su 445**, «MATRIMONI» 2→**34 su 34**, «Roma» **184 su 370**. Ne erano previste 2.704: ne sono nate 2.273 perché Cake e Flowers girano per primi e Gifts ha riconosciuto per SKU/handle quello che avevano appena creato.
  - ⚠️ **SCOPERTA GROSSA: due prodotti su tre del negozio sono archiviati.** Delle 2.273 schede create, **1.535 sono `ARCHIVED` su Shopify** (Gifts 1.278 su 1.641, Flowers 185 su 321, Cake 72 su 311). Verificato **in modo indipendente** con l'MCP Shopify su deluxy.it: 2.932 prodotti, **1.847 archiviati**, 849 attivi, 236 bozze. Vuol dire che il «buco» delle collezioni era in buona parte fatto di **prodotti che il cliente non vede**, e che oggi le collezioni in Visual contengono un sacco di roba archiviata. **Da fare**: in `/visual/[id]` e nelle regole d'ordine distinguere (o escludere) gli archiviati — ordinare e spingere su Shopify una fila calcolata anche sui prodotti invisibili non corrisponde a quello che vede il cliente.
  - Nuova colonna `ImportCollezioni.prodottiCreati` (additiva, `db push` fatto sul Postgres condiviso); il messaggio dell'import la scrive già, quindi `/collezioni` la mostra senza modifiche di pagina.

- **03/08/2026 — in Visual va in scena solo quello che il cliente vede** (chiesto dall'utente guardando `/visual/…` dopo l'import). Con 1.535 schede archiviate su Shopify entrate in catalogo, le collezioni si erano riempite di prodotti **invisibili al cliente**: ordinare e spingere quella fila vuol dire decidere l'ordine di una vetrina che non esiste. Un solo posto lo definisce — `FILTRO_IN_SCENA` (`fase: "in_vendita"`) in [ordinamento-vetrina.ts](../src/lib/ordinamento-vetrina.ts) — e vale in tutta la catena:
  - **scheda collezione**: la sequenza mostra solo i prodotti in vendita e scrive quanti restano fuori («332 prodotti in vendita · 182 archiviati o in bozza sul negozio, fuori dalla fila»);
  - **regole d'ordine** (`ordineSecondoRegole`) e **anteprima**: calcolano sulla sola fila in scena;
  - **frecce su/giù**: si spostano rispetto a quello che si vede — senza il filtro una freccia avrebbe scavalcato un prodotto invisibile *sembrando non fare niente*;
  - **push su Shopify**: manda solo la fila in scena, e se non c'è nessuno lo dice («o sono tutti archiviati sul negozio…») invece di rimandare a un import che non cambierebbe niente;
  - **tipologie**: il filtro dei criteri era «tutto tranne gli archiviati» e lasciava passare le **bozze**, che ora sono centinaia; adesso è `in_vendita`;
  - **elenco `/visual`**: la colonna è «In vendita» col «+N archiviati» sotto, e il filtro si chiama «Senza prodotti in vendita» (43 collezioni, contro le 24 che hanno zero legami).
  - **Il venduto resta su tutti i prodotti, archiviati compresi**: hanno venduto davvero, toglierli dal fatturato sarebbe falso. Si filtra la *fila*, non i *soldi*.
  - **Prestazioni**: la pagina si tirava dietro tutte le appartenenze (da 10.994 a **33.243** dopo l'import) per contarle in memoria — 4,7 s in dev. Ora prodotti in vendita e venduto per collezione escono da **una sola query SQL** (stessa scelta dei contatori del menu; lo schema `merchandising` è nominato esplicitamente), e il venduto delle collezioni filtrate si deduplica con un `DISTINCT` che parte **solo quando si sta cercando**. Controprova indipendente su 4 collezioni: identica al conto fatto con query separate («Bouquet & Cappelliere» 332 attivi e 112.769,50 €).

- **03/08/2026 — l'ordine mostrato in Visual non era quello del sito** (segnalato dall'utente su `Home-Page-Last-Minute`). Erano **tre bug in fila**, tutti con la stessa radice: le appartenenze si leggevano **dal lato prodotto**.
  1. **L'ordine non era mai stato letto.** Tutte le `posizione` erano **0**: si materializzavano solo applicando una regola, e nel frattempo la pagina mostrava «posizione, poi nome», cioè un ordine inventato. Sul sito la collezione partiva da «MAXI Bouquet Rose Bianche e Ortensie Rosa», in app da «Crostata ai frutti di bosco».
  2. **Le appartenenze erano troncate a 10.** L'import chiedeva `collections(first: 10)` sul prodotto: chi stava in più di dieci collezioni perdeva le altre **in silenzio**. `Home-Page-Last-Minute` risultava di 52 prodotti contro i 73 veri, «Roma» 184 contro 370.
  3. **La `fase` non bastava a dire chi è in vetrina.** I 2.171 prodotti nati dal venduto hanno `fase = in_vendita` per default *anche se sul negozio sono archiviati*: col solo filtro sulla fase sarebbero rimasti in vetrina.
  - **Come si legge adesso**: `leggiProdottiDiCollezione()` scorre `collection.products` (pagine da 250) **per ogni collezione**. È l'unico posto dove l'ordine esiste (per le manuali è la fila decisa nell'admin) e dove non si perde niente. `posizione` = indice nella fila vera; un prodotto non risolto non entra ma **la posizione avanza lo stesso**, così l'ordine dei rimanenti resta quello del negozio.
  - **Chi vince sull'ordine**: di norma il negozio, e la fila si riscrive. **Eccezione**: la collezione con curatela non ancora spinta (badge «da sincronizzare») tiene le posizioni nostre, e i prodotti nuovi entrano **in fondo** — in cima scavalcherebbero una scelta già fatta. Senza questa distinzione o si perdeva la curatela a ogni import, o non si vedeva mai l'ordine vero.
  - **Nuovo campo `Prodotto.statoShopify`** (ACTIVE | DRAFT | ARCHIVED), scritto a ogni import per **tutti** i prodotti abbinati, non solo per quelli creati. `FILTRO_IN_SCENA` è ora `statoShopify = ACTIVE` **e** `fase ≠ archiviato`: il primo è quello che vede il cliente, il secondo è la leva umana (è così che si archiviano a mano le righe di servizio) e **un import non la sovrascrive**.
  - **Lo stato si vede**: badge `Attivo / Bozza / Archiviato / Stato ignoto` accanto al codice di ogni riga, e un riquadro **«Non in vendita sul negozio (N)»** sotto la sequenza. I fuori scena non si nascondono: sapere che una collezione se ne porta dietro 182 è un'informazione, e nasconderli faceva sembrare che il negozio dichiarasse più prodotti senza motivo. Si riattivano **su Shopify**, non da qui: scritto in pagina.
  - ⚠️ **`statoShopify` si popola solo con l'import**: finché non gira, per l'app nessun prodotto è in vetrina. **Non mandare in produzione questo codice prima di aver reimportato tutti i negozi.**
  - Lo script accetta ora **un negozio per nome** (`npx tsx scripts/importa-tutte-collezioni.ts Cake`): si prova sul più piccolo prima di toccare tutto.
  - **Esito Cake (03/08/2026)**: 47 collezioni, **3.158 appartenenze** contro le 3.059 di prima (99 recuperate dal troncamento), 0 schede nuove (erano già state create), 440 prodotti con `statoShopify`. Posizioni vere: «MATRIMONI» 0,1,2,3… e una sola posizione 0 per collezione. Poi Flowers **8.036** (erano 5.335) e Gifts **31.254** (erano 24.849): in tutto **42.448** appartenenze contro 33.243, cioè **9.205 recuperate** dal solo troncamento a 10.
  - ⚠️ **E un quarto bug, trovato controllando l'ordine riga per riga**: `Home-Page-Last-Minute` combaciava col sito **tranne due righe su dodici**. Non era l'ordine: erano **due prodotti Shopify diversi collassati sulla stessa scheda**. Otto prodotti del negozio si chiamano «Sacher», e l'abbinamento per titolo normalizzato li mandava tutti sulla stessa: la fila mostrava il nome sbagliato e **il venduto di uno veniva attribuito all'altro**. Misurato: **111 schede rappresentavano più prodotti dello stesso negozio** (Gifts 89, Flowers 20, Cake 2; le altre 706 su 817 erano lo stesso prodotto su due negozi diversi, che è giusto).
    - Regola nuova: **un prodotto del negozio ↔ una scheda**. `abbina()` ora dice anche **con quanta forza** ha riconosciuto (5 = id Shopify, 4 = SKU variante, 3 = SKU come codice, 2 = handle, 1 = titolo normalizzato); i candidati si ordinano per forza, **chi ha la chiave più forte si prende la scheda** e agli altri se ne crea una. Il vincolo è **per negozio**: lo stesso prodotto venduto su Flowers e su Gifts resta una scheda sola, e quello è corretto.
    - Si scrive ora `shopifyId` **anche sulle schede già esistenti**, non solo su quelle create: senza, ogni import ripartiva da SKU e nomi, cioè dalle chiavi che sbagliano.
    - **Nota di lettura (superata il 03/08 stesso, vedi voce sotto)**: un nome diverso fra app e sito non è sempre un errore. «Bouquet Ortensie Bianche e Blu» qui e «Bouquet Ortensie Bianche, Azzurre e Blu» sul sito sono lo **stesso** prodotto (l'handle combacia): su Shopify rinominare un prodotto **non cambia l'handle**, e il nostro nome è quello vecchio, arrivato dal venduto. Allineare i nomi al negozio è una decisione a parte, non ancora presa.

- **03/08/2026 — il negozio è la fonte di verità del prodotto: nome, foto, descrizione e listino** (scelto dall'utente). Finora l'import scriveva questi campi **solo quando creava** la scheda; sulle schede già esistenti li ignorava. Conseguenze misurate prima della correzione: **2.272 prodotti su 4.490 con foto (51%), e tutte appartenenti a schede create dall'import** — le 2.171 nate dal venduto ne avevano **zero**, di cui **834 stavano su un negozio** (la foto c'era su Shopify e non la si copiava); **descrizione valorizzata su 0 prodotti su 4.490**; nomi fermi al titolo della riga d'ordine.
  - Ora `daAggiornare` riscrive anche **nome, immagine, descrizione e prezzo di listino** per ogni scheda abbinata a un prodotto vero. Le ultime tre solo **se il negozio ha qualcosa da dire**: si passa `undefined` (Prisma salta il campo) e non `null`, che vorrebbe dire cancellare quello che c'è.
  - **Il nome vecchio non si perde**: resta scritto in `Vendita.titolo`, che è da dove veniva.
  - **Prezzo**: sulle schede nate dal venduto era la *media davvero incassata*; ora è il **listino del negozio** (minimo delle varianti, con ogni variante che porta il suo `deltaPrezzo`). È un cambio che sposta fasce di prezzo e margini, deciso dall'utente sapendolo.
  - `descriptionHtml` aggiunto alla query dei prodotti; `prezzoDa()` e `descrizioneDa()` estratte e usate **sia** in creazione sia in aggiornamento — con due copie lo stesso prezzo si sarebbe calcolato in due modi.
  - **Nuovo script `scripts/allinea-prodotti.ts`** (`npx tsx`, accetta il nome di un negozio): riallinea le schede **senza rileggere le collezioni**, che è la parte lenta. Serve quando cambia solo la lettura del prodotto: minuti invece di venti.
  - **Miniature** (`src/components/Miniatura.tsx`, una sola implementazione): elenco prodotti, anagrafica, classifiche e `/visual` — lì è la foto **della collezione**, quella che il cliente vede in cima alla pagina del sito. Chi non ha foto tiene il suo posto col segnaposto ❀, altrimenti il nome si incolonna in due punti diversi proprio dove i dati mancano.
- **03/08/2026 — trappola dell'infrastruttura**: durante il secondo import completo, Gifts si è chiuso con `Can't reach database server … :6543` — **il pooler di Supabase ha smesso di rispondere a metà**. Verificato dopo: il corpo dell'import **era andato a buon fine** (32.330 appartenenze scritte, schede create), a fallire è stata solo la scrittura della riga di storico `ImportCollezioni` che sta **fuori** dal try/catch interno. Quindi «ECCEZIONE» in output non vuol dire «dati non scritti»: prima di rilanciare un import da venti minuti, **contare le appartenenze**. Stato dopo il giro: Cake 3.175 · Flowers 8.324 · Gifts 32.330 = **43.829**.

- **03/08/2026 — regole d'ordine salvate** (`/visual/regole`, chieste dall'utente: «regole che usino la categoria, il prezzo, il target… e che ognuna possa essere salvata»). Prima l'ordine si poteva esprimere **solo** con le sei metriche fisse, da riscegliere ogni volta collezione per collezione. Ora una regola è **una cosa con un nome** (`RegolaOrdine`), fatta di una **sequenza di passi in priorità**: il primo decide, i successivi spezzano i pareggi.
  - **Due nature di passo**: *metrica* (le sei di sempre, mettono in fila tutti) e *attributo* — categoria del negozio, categoria interna, fornitore, linea, **tag** (è lì che vivono occasione e destinatario), **risposta al bisogno** (dai giorni di consegna) e **prezzo** (da/a). Un passo di attributo **porta in cima chi corrisponde senza togliere nessuno dalla fila**: scelta presa con l'utente, ed è quella giusta perché i prodotti che non corrispondono restano comunque nella collezione su Shopify.
  - **Un dato mancante non corrisponde**: chi non ha tag non è «tutti i tag», chi non ha giorni di consegna non è «urgente». Non si inventa, e chi non si sa resta dov'era invece di essere spinto in cima.
  - **`da` compreso, `a` escluso** sul prezzo, come per le fasce: 200 € non cade nel buco fra due passi.
  - **Una sola implementazione dell'ordinamento**: `ordinaPerPassi()` è la funzione vera e `ordinaProdotti()` è il caso particolare in cui i passi sono tutte metriche — così una regola salvata e una rapida non ordinano in due modi diversi. Un passo di attributo vale 1/0 e si ordina decrescente come tutto il resto.
  - **Sulla collezione la regola salvata sta in un riquadro suo** e sceglierne una **stacca** la regola rapida (`regolaOrdineId` e `regolaOrdinamento` non convivono): due ordini impostati insieme non si saprebbe quale vince. Vale anche per le **tipologie**, dove la regola salvata vince su quella rapida anche nel riapplico standing all'import.
  - **Il senso di salvarla**: «Riapplica alle N collezioni» rifà tutte quelle che la usano. Si corregge in un posto e le vetrine si rifanno.
  - **I menu offrono solo valori che esistono davvero**, col numero di prodotti accanto: una regola su un valore che nessuno ha non sposta niente, ed è meglio vederlo prima di scriverla. I tag si contano uno per uno spezzando la stringa di Shopify.
  - **Eliminare una regola non rimescola le vetrine**: le collezioni tornano «solo a mano» (`onDelete: SetNull`) e **l'ordine già scritto resta**.
  - **Verificato su dati veri** (Home-Page-Last-Minute, 64 prodotti in scena): regola «prima sopra 200 € → prezzo alto» applicata end-to-end → in cima Cento Rose Rosse 1.200 €, MAXI Bouquet Rose Dolce Metà 600 €, Dom Pérignon Rosé 550 €; `regolaOrdineId` scritto e `regolaOrdinamento` azzerato come previsto. Posizioni e stato **ripristinati** a fine prova, regola di prova rimossa.

- **03/08/2026 — temi: raggruppamenti liberi di collezioni** (`/collezioni/temi`, chiesti dall'utente). Modello `TemaCollezioni`, **molti-a-molti** con `CollezioneShopify`. Un tema è un nome — «Natale», «San Valentino», «Matrimoni» — a cui si assegnano le collezioni che si vogliono, **anche di negozi diversi**. Serve a tenere insieme quello che va insieme e a ritrovarlo senza cercarlo fra 343 righe.
  - **Nessun criterio automatico, ed è tutta la differenza con le tipologie**: quelle si definiscono per criteri sui *prodotti* e sono **una sola** per collezione; il tema lo decide una persona e una collezione può stare in **più temi** insieme (Natale *e* Regali per lei). Due concetti separati apposta, scritto in pagina in tutti e due i posti.
  - **Prodotti e venduto del tema si contano sui prodotti distinti**, non sommando le collezioni: la stessa scheda in due collezioni del tema si conterebbe due volte. Misurato sulla prova: 5 collezioni «Natale» = **405 prodotti distinti** contro 494 sommandole.
  - **Assegnare aggiunge, non sostituisce**: riaprire la pagina e salvare senza scegliere niente non svuota il tema. La scelta ha una **ricerca** davanti, perché un menu con 343 voci non è un menu.
  - **Eliminare un tema non tocca le collezioni**: sparisce l'etichetta, restano ordine, tipologia e prodotti. Un tema è un modo di guardarle, non qualcosa che le possiede.
  - In `/collezioni` ogni riga mostra le **pillole dei temi** (oro, come le scelte editoriali nostre) e in testata c'è il bottone **Temi**.
  - **Verificato su dati veri**: tema di prova con 5 collezioni «Natale» di **Cake, Flowers e Gifts**, una collezione messa in due temi, poi temi rimossi e le 5 collezioni ancora tutte lì.

- **03/08/2026 — togliere un prodotto dalla collezione, e salvare una regola dalla scheda** (`/visual/[id]`, chiesti dall'utente).
  - **Togliere scrive sul negozio vero** (`collectionRemoveProducts`): toglierlo solo qui sarebbe una bugia che dura fino al prossimo import, perché le appartenenze si rileggono da Shopify e il prodotto tornerebbe. La riga locale si cancella **solo se il negozio conferma**; se Shopify dice no, l'app non racconta una collezione diversa da quella vera.
  - **Il × non esegue: porta a una conferma** (`?rimuovi=<id>` nell'indirizzo, poi «Sì, togli»). Stessa idea dell'anteprima dell'ordine — finché non confermi, non succede niente. Il pulsante compare **solo sulle collezioni manuali**: in una smart collection chi ci sta dentro lo decide la regola di Shopify, e un prodotto tolto a mano tornerebbe alla prima rivalutazione. Detto in pagina, non nascosto.
  - **Il prodotto non viene cancellato né archiviato**: esce da quella collezione e basta, resta a catalogo, nelle altre collezioni e nelle vendite.
  - **«Salva quest'ordine come regola»**: la regola nasce dove si sta guardando la fila, non da una pagina vuota — si prova con le metriche rapide finché convince e le si dà un nome. Prende le metriche in anteprima (o quelle già applicate), crea la `RegolaOrdine`, la assegna e la applica, e porta sulla sua scheda per aggiungere i passi per attributo. Le metriche viaggiano in campi nascosti `regola`, **stessa convenzione** del selettore rapido, così lato server si legge con l'unica `regoleDaForm()`. Senza metriche scelte la regola nasce vuota e **non tocca l'ordine di adesso** (una regola senza passi non è «tutti i prodotti»).
  - ✅ **Provata davvero il 03/08/2026**, dall'utente in produzione: «Spumante - Set Sommelier» tolto da «Home-Page-Last-Minute» sul negozio. È la **prima scrittura vera dell'app su Shopify**.
  - **Il ritorno è ancorato al prodotto che prende il posto di quello tolto.** Togliere è un gesto che si ripete — si scorre la fila e se ne tolgono tre o quattro — ma il × è un link e la pagina si ricarica: senza ancora si riparte dall'alto ogni volta, e con 300 righe diventa inutilizzabile (segnalato dall'utente dopo la prima prova). Le frecce su/giù non hanno il problema: sono server action senza `redirect`, quindi React aggiorna in posto e lo scorrimento resta.

- **03/08/2026 — le condizioni si scrivono dalla scheda della collezione** (segnalato dall'utente: «mi manca la possibilità di specificare le condizioni»). Salvando una regola da `/visual/[id]` si potevano portare **solo le metriche**: le condizioni per attributo stavano unicamente sulla pagina della regola. Ora il costruttore è **un componente solo** — [CostruttorePassi.tsx](../src/components/CostruttorePassi.tsx) — usato dalla pagina della regola **e** dalla scheda della collezione, coi valori letti da un'unica [vociPassi()](../src/lib/voci-passi.ts). Con due copie le due schermate avrebbero offerto condizioni diverse alla prima modifica.
  - **Ogni modifica fatta dalla collezione riapplica subito la regola a *quella* collezione** e ci riporta (`tornaA` + ancora `#regola`): altrimenti si aggiunge una condizione e a schermo non si muove niente, che si legge come «non ha funzionato». Le **altre** collezioni che usano la regola restano com'erano finché non si preme «Riapplica ovunque»: rifarle di nascosto sarebbe rimescolare vetrine che nessuno stava guardando.
  - I valori delle condizioni si leggono **solo se serve** (nessuna regola assegnata = nessuna query).
  - **Verificato su dati veri**: regola con la sola metrica «più venduti» → in cima Botticelli e Rose Rosse; aggiunta la condizione «prima il tipo *Originali Deluxy*» → in cima Regina di Cuori, Red Set, Cappelliera Rose e Palloncino PINK, cioè gli Originali ordinati **fra loro** per venduto. Posizioni e stato ripristinati.
  - **Bug segnalato e corretto**: il × per togliere un prodotto è un link, quindi ricaricava la pagina e riportava **in cima**, perdendo il punto in cui si stava lavorando fra 300 righe. Ogni riga ha ora un'ancora (`#p-<id>`) e × e «annulla» ci puntano.

- **03/08/2026 — SEO di prodotti e collezioni, letto dal negozio e correggibile qui** (chiesto dall'utente: «importa titolo e descrizione SEO che andremo poi a correggere e migliorare»).
  - **Due coppie di campi, e servono tutte e due.** Col suffisso — `seoTitoloShopify`, `seoDescrizioneShopify` — c'è quello che il negozio dice oggi: riletto e **sovrascritto a ogni import**. Senza suffisso — `seoTitolo`, `seoDescrizione` — c'è **il nostro**, che nessun import tocca. Con un campo solo il primo import avrebbe cancellato il lavoro di revisione. È la convenzione che l'app già usa: `tipoShopify` (letto) accanto a `categoria` (decisa da noi).
  - Le collezioni avevano già `seoTitolo`/`seoDescrizione` **ma erano i valori letti**: rinominati con `ALTER TABLE … RENAME COLUMN` invece di lasciar fare drop+create a `db push`, così i 166 titoli e 197 descrizioni già importati non si sono persi e non è servito un reimport da 20 minuti.
  - I **prodotti** non avevano nessun campo SEO: aggiunti tutti e quattro, e la query dell'import legge ora `seo { title description }`.
  - **Riquadro unico** ([RiquadroSeo.tsx](../src/components/RiquadroSeo.tsx)) in scheda prodotto e scheda collezione: a sinistra quello del negozio, a destra il nostro da scrivere. Affiancati apposta — un campo vuoto senza il testo di partenza accanto vorrebbe dire riscrivere a memoria. C'è «Parti dal testo del negozio», che **non sovrascrive** un nostro testo già presente: un bottone non deve poter buttare via una revisione fatta.
  - I contatori 60/160 sono **un avviso, non un limite**: oltre, Google taglia — scrivere più lungo non è un errore, è solo una parte che non si legge.
  - **Il nostro testo non viene ancora mandato a Shopify**, ed è scritto in pagina. La scrittura verso il negozio è il passo successivo.
  - Le API `/api/v1/collezioni` espongono **entrambe** le coppie: chi integrava leggeva il SEO del negozio e quel valore resta, sotto il nome col suffisso.
  - ⚠️ **Trappola pagata: 25 scritture in parallelo su un pool da 5.** Il primo allineamento del SEO è morto a metà con «Timed out fetching a new connection from the connection pool (timeout 10s, limit 5)». Non era il pooler di Supabase che faceva i capricci: `Promise.all` su blocchi da **25** update mentre `connection_limit=5` mette 20 richieste in coda, e col database condiviso fra sei app i 10 secondi scadono. Ora c'è `SCRITTURE_INSIEME = 5` in [shopify-collezioni.ts](../src/lib/shopify-collezioni.ts), usata da tutti i cicli di scrittura. **Regola generale per le app Deluxy su questo cluster: non mandare insieme più scritture di quante connessioni si hanno.**

- **03/08/2026 — SEO: letto dal negozio, correggibile qui, e rimandabile indietro** (chiesto dall'utente).
  - **Due coppie di campi su prodotti e collezioni**: `seoTitoloShopify`/`seoDescrizioneShopify` sono ciò che il negozio dice oggi (riletti e **sovrascritti** a ogni import), `seoTitolo`/`seoDescrizione` sono **i nostri** e nessun import li tocca. È la convenzione che l'app già usa (`tipoShopify` letto accanto a `categoria` decisa da noi): senza la separazione, il primo import avrebbe cancellato il lavoro di revisione. I campi delle collezioni sono stati **rinominati con `ALTER TABLE`** invece di lasciar fare drop+create a `db push`, così i 166 titoli e 197 descrizioni già letti non si sono persi e non è servito un reimport.
  - **Riquadro unico** [RiquadroSeo.tsx](../src/components/RiquadroSeo.tsx), usato da scheda prodotto (tab **Shopify**) e scheda collezione: a sinistra il testo del negozio in sola lettura, a destra il nostro modificabile, col conteggio caratteri e l'avviso sui limiti di Google (60 e 160 — avvisi, non limiti: oltre, quella parte non si legge). «Parti dal testo del negozio» **non sovrascrive** una revisione già fatta.
  - **Invio a Shopify** (`spingiSeoSuShopify`, `productUpdate`/`collectionUpdate`): una scheda per volta e **con conferma**, perché cambia quello che il cliente legge su Google. Paletti: token con `write_products`, id Shopify noto, e **qualcosa di nostro da mandare** — con titolo e descrizione vuoti si cancellerebbe il SEO del negozio, che non è quello che si sta chiedendo. A buon fine si segna `seoSpintoIl` e si riallineano i campi `...Shopify`, altrimenti la colonna di sinistra continuerebbe a mostrare un testo che il negozio non ha più. `seoModificatoIl` vs `seoSpintoIl` dice «il negozio ha ancora la versione precedente» — stessa convenzione di `ordineModificatoIl`/`ordineSpintoIl`.
  - `graphqlNegozio` è stata spostata in [shopify-scrittura.ts](../src/lib/shopify-scrittura.ts): in un file `"use server"` **ogni export diventa un endpoint**, e una funzione che manda una GraphQL qualunque al negozio non deve essere chiamabile dall'esterno.
  - **Copertura reale del SEO letto** (03/08/2026): sui **3.226 prodotti presenti sui negozi** solo **454 hanno un titolo** e 296 una descrizione — **2.733 non hanno né l'uno né l'altra**; collezioni **166/343** e 197/343. E **81 titoli superano i 60 caratteri**. Il lavoro è per l'85% *scrivere*, non correggere.
  - ⚠️ **L'invio non è mai stato eseguito contro Shopify**: verificato fino ai controlli e al rendering (conferma, stati, messaggi), ma **nessuna scheda è stata scritta sul negozio**. Da collaudare su una scheda scelta dall'utente.

- **03/08/2026 — le condizioni si compilano come una griglia** (segnalato dall'utente con uno screenshot: «ho bisogno di impostarle come se fosse una griglia»). Il costruttore era una **pila di form separati**, uno per attributo, ognuno col suo pulsante: per dire «prima i Fiori, poi chi costa più di 200 €, a parità il più venduto» ci volevano **tre salvataggi e tre ricariche**, e le righe — larghezze diverse, testi d'aiuto in mezzo — non si leggevano una accanto all'altra.
  - Ora è **una griglia sola**: due colonne allineate (condizione · valori), un solo `<form>`, un solo pulsante «Aggiungi le condizioni scelte». Sotto gli 820px diventa una colonna, altrimenti i menu a selezione multipla non ci starebbero.
  - **L'ordine è quello della griglia**, dall'alto in basso: è l'unico deducibile da un modulo senza chiedere anche la priorità riga per riga, e le frecce servono a correggerlo dopo.
  - **La metrica sta in fondo, ed è dove va**: mette in fila *tutti* i prodotti, quindi messa davanti a una condizione la renderebbe inutile — deciderebbe già tutto lei. Nel menu c'è «— nessuna —», perché una regola può essere fatta di sole condizioni.
  - **Verificato su dati veri**: una sola compilazione (tipo *Fiori*+*Torte*, tag *Compleanno*, prezzo da 200 €, metrica più venduti) ha prodotto 4 passi nell'ordine giusto — «Prima Categoria del negozio: Fiori, Torte → Prima Tag: Compleanno → Prima Prezzo da 200 € → Più venduti in cima». Regola di prova rimossa.

- **03/08/2026 — selezione multipla nella fila** (chiesto dall'utente). Con 64 righe spostarne dieci con le frecce vuol dire un centinaio di clic. Ora ogni riga ha una **casella** e sopra *e* sotto l'elenco c'è una barra con: **⤒ all'inizio**, **⤓ alla fine**, **alla posizione N**, e **togli dalla collezione** (con conferma, perché scrive sul negozio).
  - I prodotti scelti **mantengono l'ordine relativo** che avevano: riordinarli anche fra loro sarebbe una seconda decisione che nessuno ha chiesto.
  - La posizione è **quella che si legge in pagina** (1 = primo). Fuori intervallo si accosta all'estremo invece di rifiutare: chi scrive 999 sta dicendo «in fondo».
  - **Un solo `<form>` per tutto**, e frecce e × sono bottoni con la propria `formAction` invece di form annidati (HTML non valido). È anche l'unico modo che funziona: **la FormData si costruisce dal form, non dal bottone che l'ha inviata**, quindi due azioni diverse vogliono due `formAction` diverse e non un `value` da leggere — [[trappola-server-action-valore-bottone]].
  - **La rimozione in blocco è una sola chiamata** a `collectionRemoveProducts` con tutti gli id: dieci chiamate separate sarebbero dieci occasioni di restare a metà. Le righe locali si cancellano solo per i prodotti che il negozio ha accettato.
  - La barra **non dice quanti sono selezionati**: contarli richiederebbe JavaScript, e un numero che non si aggiorna sarebbe peggio di nessun numero.
  - **Verificato su dati veri** («Home-Page-Last-Minute», 63 prodotti in scena): 5° e 6° portati all'inizio → primi due nell'ordine giusto; poi «alla posizione 3» → finiti 3° e 4°; poi «alla fine» → ultimi due; «posizione 999» → in fondo. Ordine originale ripristinato.
  - ⚠️ **Trappola provando le server action da script**: `revalidatePath` fuori da una richiesta Next lancia «static generation store missing» — **dopo** aver già scritto. Il primo tentativo ha lasciato la collezione riordinata e va rimessa a posto a mano; nei collaudi va avvolta in try/catch.

- **03/08/2026 — condizioni a celle e anteprima dal vivo** (chiesto dall'utente: «cella 1: fiori / bouquet / urgente, cella 2: fiori / prezzo >1000»). Non si poteva dire: ogni condizione era un passo a sé, quindi «Fiori» e «urgente» erano **due priorità** — prima tutti i fiori, poi tutti gli urgenti — e non «i fiori urgenti». Ora un passo può essere una **cella**: più condizioni che valgono **tutte insieme**. Dentro una condizione i valori restano in alternativa, fra celle vale la priorità. I passi vecchi restano validi: sono celle da una condizione.
  - **Verificato su dati veri** (63 prodotti tipo «Fiori» attivi): «Fiori *e* urgenti» ne prende **54**, «Fiori *e* oltre 1.000 €» ne prende **1** (103 Luxury Roses, 1.545 €), la vecchia forma con la sola condizione «Fiori» ne prendeva **63**. È la dimostrazione del perché serviva.
  - **L'anteprima si aggiorna mentre si spunta** ([AnteprimaCella.tsx](../src/components/AnteprimaCella.tsx)): quanti prodotti prenderebbe la cella, con le prime dodici foto. Il conto gira **nel browser** — un giro di rete a ogni casella sarebbe lento — e usa la **stessa `corrisponde()`** del server, che è una funzione pura: con due implementazioni l'anteprima direbbe una cosa e la regola ne farebbe un'altra. Sulla scheda della collezione guarda i prodotti **di quella vetrina**; sulla pagina della regola un campione del catalogo in vendita (900), **dichiarato**.
  - «Nessuno» non è un errore ed è scritto: le condizioni di una cella valgono tutte insieme, quindi chiedendone troppe non resta nessuno.

- **03/08/2026 — le categorie e i fornitori doppi sono stati uniti, sul negozio** (segnalato dall'utente: «come è possibile abbiamo categoria torte e torta?»). Il «Tipo» e il «Venditore» di Shopify sono **testo libero**, riempiti a mano negli anni: c'erano «Torta» (147) e «Torte» (187), «Cena» e «Cene», «CLIVATI 1969» e «Clivati 1969». Non è estetica — spuntando «Torte» in una regola si lasciavano fuori 147 torte.
  - **Unito con [scripts/unisci-tipi-prodotto.ts](../scripts/unisci-tipi-prodotto.ts)**, che scrive **prima su Shopify** (`productUpdate`) e solo dopo in locale: se il negozio rifiuta, qui non cambia niente e al prossimo import il valore vecchio tornerebbe comunque. Le coppie sono **decise da una persona** e scritte nel file: mettere insieme «Crostata» e «Torte» è una scelta di merchandising, non un calcolo su una stringa.
  - **Esito**: tipi da **121 a 103** valori distinti, fornitori da **88 a 82**; **zero doppioni** residui per maiuscole/accenti o singolare/plurale. Torte 341 · Originali Deluxy 281 · Vini 140 · Drinks 55 · Cene 49 · Colazioni 43 · Uova 29 · Degustazioni & Aperitivi 26 · Aperitivi 12 · Gift Card 4. Fornitori: Deluxy 823 · Clivati 1969 220 · CANTINA FRANCO 100 · 142 Restaurant 66 · Deodato 49 · Maryflor 12.
  - **Lasciati separati di proposito** perché non richiesti: «Colazioni & Brunch» (70) e «Brunch» (3) restano fuori da «Colazioni»; «Fiori Originali» (11) fuori da «Originali Deluxy».
  - ⚠️ **Trappola confermata due volte**: su un giro lungo il pooler Supabase chiude la connessione (`P1017`, «server has closed the connection») **dopo** aver già scritto su Shopify. Non è un dato sbagliato, è la connessione caduta: ora la scrittura locale ha **tre tentativi** con attesa crescente, e lo script è ripetibile — rilanciandolo riprende da quello che manca.
  - **Le liste dei valori delle condizioni contano solo i prodotti attivi**: «Fiori 379» comprendeva archiviati e bozze, e spuntandolo l'anteprima ne mostrava molti meno. I valori che nessun prodotto attivo porta **non compaiono più**: sceglierli non sposterebbe niente.
  - **L'anteprima della cella resta appesa** in cima mentre si scorre la griglia (`position: sticky`): con 121 tipi e 400 tag, spuntare un tag in fondo senza più vedere il numero era tornare a costruire alla cieca.

- **07/08/2026 — la cella può ordinare con più metriche, in ordine di scelta** (chiesto dall'utente: «permetti più scelte con l'ordine da ordine di selezione»). «Poi ordina per» era un menu a scelta singola: per dire «i più venduti, e a parità il margine più alto» non c'era modo. Ora è una fila di chip: si cliccano e **si accodano nell'ordine in cui li premi**, col numero d'ordine scritto nel chip (1º, 2º…).
  - **L'ordine è quello del clic, non quello dell'elenco**: riordinarli da soli vorrebbe dire decidere al posto di chi sta scegliendo. Il 1º decide, gli altri **spezzano i pareggi** — e l'ultimo pareggio lo spezza il nome, come già faceva `ordinaPerPassi`.
  - `Passo` cella: `m?: RegolaOrdinamento` è diventato `m?: RegolaOrdinamento[]`. **Le regole salvate prima continuano a funzionare**: `parsePassi` converte al volo la metrica singola in lista da uno — una migrazione dei dati per un campo dentro un JSON sarebbe stata più rischiosa della conversione in lettura. L'etichetta le mostra con la freccia: «Prima Fiori e Bouquet — poi per Più venduti → Margine più alto».
  - Senza condizioni le metriche restano **passi separati**, uno per metrica: lì non c'è una cella a cui attaccarle, e in fila valgono come priorità successive — che è la stessa cosa.

- **07/08/2026 — le condizioni si scrivono sul catalogo, non sulla collezione** (segnalato dall'utente: «ma io non ho ancora scelto nulla», con la griglia che diceva «41 nascosti: non stanno insieme a quello che hai scelto»). Sulla scheda di una collezione il costruttore contava sui prodotti **già dentro**: con cinque prodotti attivi si vedevano cinque tag e la griglia sembrava vuota prima ancora di toccarla.
  - Ora i conti si fanno sul **campione del catalogo in vendita** (900, dichiarato a schermo) — è il vocabolario di quello che si può esprimere — e accanto compare il secondo numero: «di cui **N** in «questa collezione»». **Due numeri perché sono due domande diverse**: cosa prenderebbe la cella, e quanti di quelli stanno nella vetrina che si sta curando.
  - Il messaggio dei valori spenti distingue i due casi: senza condizioni «senza prodotti in vendita: non porterebbero niente in cima», con condizioni «non stanno insieme a quello che hai scelto». Prima diceva sempre la seconda, cioè accusava una scelta che non era stata fatta.

- ⚠️ **07/08/2026 — trappola React: il valore dell'evento letto dentro l'updater di stato** (segnalato dall'utente con la pagina morta: «Application error: a client-side exception has occurred», scegliendo fornitore → urgenze → «Novità prima»). Il chip della metrica faceva `setMetriche((m) => e.currentTarget.checked ? … : …)`: **React azzera `currentTarget` appena l'handler finisce**, e l'updater gira dopo, in fase di render — quindi `null.checked` e schermata bianca. In sviluppo non si vedeva. Il valore ora si legge **fuori** dall'updater (`const acceso = e.currentTarget.checked`). Gli altri checkbox della griglia non avevano il problema: passavano `e.currentTarget.checked` come **argomento**, valutato subito.

- **07/08/2026 — l'anteprima parte da quello che hai già scelto** (chiesto dall'utente: «voglio vedere solo l'anteprima di quelli scelti, quindi dei primi 3 per ora»). Con la griglia vuota il riquadro mostrava le foto di tutto il catalogo (900): non dicevano niente di *questa* regola. Ora, finché non spunti niente, mostra **i prodotti che i passi già salvati portano in cima**, nell'ordine dei passi e senza doppioni (chi è preso da due celle si conta dove sale per primo). Appena spunti qualcosa passa alla cella che stai scrivendo: è quella la domanda del momento. Verificato online su «Home-Page-Last-Minute»: **51 prodotti** dai 3 passi invece di 900.

- **07/08/2026 — i valori delle condizioni in ordine alfabetico, con la sola iniziale maiuscola** (chiesto dall'utente). Erano ordinati per numero di prodotti: con ottanta chip il più frequente in testa non serve, perché di un valore si sa **come si chiama**, non quanti prodotti abbia — il numero resta scritto sul chip. E la maiuscolatura arrivava da Shopify come capitava (`CDM FunnyCake`, `CANTINA FRANCO`, `fiori`), quindi la stessa riga mescolava tre stili: ora si mostra `Cdm funnycake`. **Si tocca solo l'etichetta**: il valore mandato al server resta quello vero del negozio, altrimenti la condizione non troverebbe più niente. Per i tag il taglio a 400 resta **per frequenza** (se si deve tagliare si tengono quelli che pesano) e l'alfabetico viene dopo.

- **07/08/2026 — il rinfresco periodico si sceglie dalla scheda della collezione** (chiuso il «consenti anche refresh automatico periodico»). Le rotazioni esistevano già — modello, cron giornaliero `/api/cron/rotazioni`, pagina `/visual/rotazioni` — ma si potevano assegnare **solo** dal modulo «vale per più collezioni». Ora c'è il riquadro «Si rinfresca da sola» sulla scheda: si sceglie il ritmo, si vede il prossimo giro e se l'ordine rifatto va **anche su Shopify**.
  - **Azione a sé, e non è un dettaglio**: `assegnaCollezioniARotazione` **riscrive l'iscrizione di tutta la regola** (la selezione è l'elenco completo), quindi usarla da una singola scheda avrebbe disiscritto tutte le altre collezioni. La nuova `iscriviCollezioneARotazione` tocca una riga sola.
  - **Iscrivere non fa scattare niente adesso**: dice da quando in poi l'ordine si rifà. Rimescolare la vetrina proprio mentre la si sta curando sarebbe il contrario di quello che si sta facendo.
  - Al 07/08/2026 **nessun ritmo è ancora stato creato** (0 regole, 0 collezioni iscritte): il riquadro mostra lo stato vuoto e manda a `/visual/rotazioni`. Il ritmo lo decide una persona — è un automatismo che riscrive vetrine.

- **Verificato su dati veri l'ordine a più metriche** (campione di 400 prodotti in vendita): serializza→rilegge senza perdere l'ordine; una cella vecchia con `"m": "best_seller"` si rilegge come lista da uno; i 36 Fiori vanno **tutti in testa**; dentro, prezzo decrescente con **28 pareggi di prezzo tutti risolti dalla seconda metrica**; e invertendo le due metriche **la fila cambia** — cioè l'ordine di scelta conta davvero.

- **07/08/2026 — due anteprime, perché sono due domande** (chiesto dall'utente: «ho bisogno di vedere proprio l'anteprima di questi 4 che usciranno e poi sotto l'anteprima man mano della selezione»). Sopra i passi salvati c'è ora **«come usciranno»**: la fila vera che la regola produrrebbe, calcolata **dal server con la stessa `ordinaPerPassi`** che poi scrive le posizioni — quindi comprende anche le metriche (più venduti, novità), che nel browser non si potrebbero calcolare. Sotto, nel costruttore, resta l'altra domanda: chi prenderebbe la cella che stai scrivendo, mentre la scrivi. Mescolarle in un riquadro solo voleva dire non sapere mai quale delle due si stesse guardando. Si mostrano solo i prodotti che **almeno un passo prende**: le metriche da sole metterebbero in fila l'intero campione. Verificato online: **73 prodotti** dai 5 passi, 24 foto numerate.

- **07/08/2026 — la griglia delle condizioni si apre solo con «+ Aggiungi condizione»** (chiesto dall'utente). Con sei righe di valori sempre aperte, l'elenco dei passi e la fila che producono finivano sotto la piega: si costruiva senza vedere cosa si stava costruendo. È un `<details>` e non un parametro nell'indirizzo, così aprire **non ricarica la pagina** e non perde la posizione — e il costruttore, che è un componente client, resta montato e non perde le spunte.

- **07/08/2026 — «Estendi alla collezione»** (chiesto dall'utente: «applica ai restanti prodotti della collezione… quando la regola non è applicabile si va in ordine di vendita»). Una regola a celle decide chi va in cima; **tutti gli altri** restavano nell'ordine in cui erano, che in una vetrina curata a mano nel tempo non vuol dire più niente. Il pulsante riordina tutta la collezione **aggiungendo un ultimo passo `best_seller`** alla regola, senza salvarlo: per i prodotti presi dalle celle le chiavi di prima hanno già deciso e questo spezza solo i pareggi; per gli altri, pari su quelle chiavi, decide lui. **Una funzione sola** con l'ordinamento normale — con un secondo motore le due strade divergerebbero al primo ritocco. Non tocca la regola salvata: le altre collezioni non si muovono.

- **07/08/2026 — la regola può ruotare: stesse condizioni, un'alternativa a turno** (chiesto dall'utente: «manca l'opzione di frequenza per far ruotare i prodotti ogni x periodo… i prodotti ruotano seguendo le stesse condizioni ma mostrando un'alternativa»). Nuovo campo `RegolaOrdine.rotazioneGiorni` e riquadro «Ogni quanto ruota» sulla scheda della regola (giorno / settimana / due settimane / mese).
  - **`ruotaDentroIGruppi()`**: i gruppi restano dove sono — chi era in cima ci resta *come gruppo* — e cambia **chi lo rappresenta**. Il gruppo di un prodotto è il **primo passo che lo prende**; chi nessun passo prende forma l'ultimo gruppo e ruota anche lui. È diverso dal modo «ruota» delle Rotazioni, che manda i primi in fondo ignorando le condizioni.
  - **Il turno si calcola dalla data**, non da un contatore salvato: due esecuzioni nello stesso periodo danno la stessa fila e non c'è uno stato che può disallinearsi.
  - ⚠️ **Salvarlo non riscrive nessuna vetrina**: la fila nuova si vede quando la regola **si riapplica** (a mano, o da sola se la collezione è iscritta a un ritmo in Rotazioni). È scritto in pagina — un'impostazione che sembra fare qualcosa e non lo fa è peggio che non averla.
  - **Verificato su 300 prodotti veri**: i gruppi restano al loro posto (impronta identica), stesso giorno = stessa fila, giorno dopo = fila diversa, nessun prodotto perso o doppio, e con «non ruota» la fila non si muove. Primo dei Fiori oggi «Bouquet Orange Elegance», domani «Bouquet Pink Grace».

- **07/08/2026 — l'anteprima mostra i primi cinque, col nome** (chiesto dall'utente: «qui però devono uscire i top 5 dell'anteprima»). Ventiquattro miniature senza nome erano un altro elenco di prodotti sopra a quello che c'è già in pagina, e non si capiva **chi** fosse davvero in cima. Ora: cinque foto grandi, numerate, col nome sotto, e «e altri N dietro».

- **07/08/2026 — la regola può far entrare i prodotti, non solo ordinarli** (chiesto dall'utente: «metti opzione Aggiungi automaticamente prodotti alla collezione… se l'utente aggiunge a mano un prodotto metti nel segnaposto Prodotto Manuale»). Nuovi campi `CollezioneShopify.aggiuntaAutomatica` e `ProdottoInCollezioneShopify.origine` (`regola` | `manuale`).
  - **Interruttore nel riquadro della regola**, spento di default: far entrare prodotti in una vetrina è una decisione, non un effetto collaterale dell'ordinamento. Accendendolo **fa subito il primo giro** — un interruttore che dice «da ora entrano da soli» e non fa entrare nessuno finché non tocchi altro si legge come rotto.
  - **Scrive prima su Shopify** (`collectionAddProducts`) e solo dopo qui: l'appartenenza vive sul negozio e si rilegge a ogni import, quindi segnarla solo in locale sarebbe una bugia che dura fino al prossimo giro. Massimo **250 per giro** (il limite della mutation), e quanti restano fuori è scritto: un'aggiunta troncata in silenzio si legge come «erano solo questi».
  - **Non toglie mai niente**: se un prodotto smette di corrispondere resta dov'è, e spegnendo l'interruttore non esce nessuno. Togliere da una vetrina è un'altra decisione.
  - **Sulle collezioni automatiche di Shopify non si applica**: lì chi entra lo decide il negozio. L'app lo dice invece di provarci.
  - **«Prodotto manuale»** compare accanto ai prodotti con `origine ≠ regola` **solo quando l'aggiunta automatica è accesa**: altrimenti sarebbe su ogni riga e non distinguerebbe niente. Il segnaposto sta **sul prodotto, non sulla posizione**, quindi spostando la riga si sposta con lei.
  - **L'ordine viene dopo l'ingresso**: nelle azioni che applicano la regola (assegna, «Estendi alla collezione», salvataggio di un passo dalla collezione) prima si fa entrare chi la regola porta dentro, poi si ordina — al contrario i nuovi arrivati resterebbero in fondo fino al giro dopo.

- **07/08/2026 — CDM accorpato e i vini passati a Deluxy, sul negozio** (chiesti dall'utente). **347 prodotti** dai 13 tipi `CDM *` (Adulti 79, FunnyCake 56, Bambini 50, Domani 47, Torte 32, Matrimoni 24, Cream Tart 18, Romantiche 15, Laurea 12, Nascite e Battesimi 7, Brand 4, Natale 2, Pasqua 1) → **«Cake Design»**, che passa da 68 a **415**; e **130 vini** → Venditore **«Deluxy»** (da 823 a 953; CANTINA FRANCO 100 → 11, 142 Restaurant 66 → 25). Zero residui, 347/347 e 130/130 riusciti.
  - ⚠️ **Cosa si è perso**: la distinzione dei CDM per occasione non è più nel Tipo (resta nei tag), e i vini non dicono più chi li fornisce. Erano scelte esplicite dell'utente — scritte qui perché non si deducano dopo.
  - **Ritorno indietro**: lo script ora salva i valori vecchi in `ripristino-<campo>-<valore>.json` **prima** di scrivere (in `.gitignore`: sono dati del negozio). Senza, l'unione sarebbe irreversibile.
  - Lo script accetta ora anche la forma **`seTipo`** — si sceglie per Tipo e si scrive il Venditore («tutti i vini sono di Deluxy») — invece di limitarsi a unire valori doppi. Chi ha già il valore giusto non viene toccato (10 vini erano già Deluxy).

- **07/08/2026 — sulla scheda della collezione l'anteprima è della collezione** (chiesto dall'utente: «qui ho bisogno di vedere l'anteprima della collezione»). Il riquadro calcolava la fila sul **campione del catalogo**: rispondeva a «cosa prenderebbe la regola in giro per il negozio» — utile per l'aggiunta automatica, non per guardare la vetrina. Ora sono i prodotti **che ci sono davvero**, in scena, ordinati dai passi. Con l'aggiunta automatica accesa si contano anche **quelli che entrerebbero** («di cui N entrerebbero dalla regola»): fra un attimo sono dentro, mostrare la fila senza di loro vorrebbe dire far vedere una vetrina che non esisterà mai. Sulla **pagina della regola** resta il campione del catalogo — lì una collezione non c'è. Verificato online: «Home-Page-Last-Minute» → 5 prodotti, in cima il MAXI Bouquet che il passo 1 prende.

- **07/08/2026 — nell'anteprima ci vanno solo i prodotti che i passi prendono davvero** (segnalato dall'utente: «dovrebbe mostrare solo i prodotti realmente selezionati»). Il riquadro mostrava **tutta** la collezione ordinata: `ordinaPerPassi` non toglie nessuno dalla fila — chi non corrisponde resta sotto — e così sotto il titolo «come usciranno coi 5 passi» finivano gelati e champagne che **nessuna condizione nomina**, come se li avesse scelti la regola. Ora in anteprima c'è solo chi almeno un passo prende, e gli altri sono **contati a parte**: «Altri N stanno nella vetrina ma nessun passo li prende: restano dietro, nell'ordine in cui erano». Verificato online su «Home-Page-Last-Minute» dopo che l'utente aveva acceso l'aggiunta automatica: **73 presi dai 5 passi, altri 5 dietro**.

- **07/08/2026 — ⭐ i passi si alternano, non si esauriscono** (chiesto dall'utente: «deve apparire un solo prodotto per il numero 1 (fiore sopra i 300 €), uno solo per il numero 2 (torta a Milano) ecc»). **È un cambio di significato della regola, non una correzione grafica.** Prima le condizioni erano solo priorità di ordinamento: la fila usciva a blocchi — *tutti* i fiori sopra i 300 €, poi *tutte* le torte, poi tutti i champagne — e in cima si vedevano settantatré bouquet di fila, mentre i passi 2, 3 e 4 non comparivano finché non finiva il primo (cioè mai, per chi guarda la prima riga della vetrina).
  - Ora `alternaFraLeCelle()` intreccia: **il primo del passo 1, il primo del passo 2, …, poi da capo**. Chi ha finito i suoi prodotti viene saltato — un passo che nella collezione non prende niente semplicemente non compare. **Dentro ogni passo l'ordine resta quello deciso dalle sue metriche**: cambia solo come i passi si intrecciano.
  - Un prodotto appartiene al **primo** passo che lo prende: senza, un fiore d'arte urgente comparirebbe due volte in vetrina.
  - Chi non è preso da nessun passo resta **in fondo**, com'era. Con una condizione sola (o nessuna) non c'è niente da alternare e la fila resta identica a prima — le regole di sole metriche non cambiano.
  - **L'etichetta dei passi è stata riscritta**: diceva «Spezza i pareggi rimasti dai passi sopra», che descriveva il comportamento vecchio. Ora «Apre la vetrina: il suo primo prodotto sta in posizione 1» / «Il suo primo prodotto sta in posizione N, poi si va a turno con gli altri passi».
  - **Verificato su «Home-Page-Last-Minute»** (78 prodotti, dopo l'aggiunta automatica): i passi dei primi dieci escono `1 3 4 5 1 3 4 5 1 3`, nessun prodotto perso o doppio. Il passo **2 non compare perché in quella collezione non prende niente**: le torte che ci sono non hanno il tag Milano.

- **07/08/2026 — un tag si confronta intero, e adesso lo fanno tutti e due** (nato da una domanda dell'utente: perché il passo «Torte e Tag: Milano e urgenze» non prende niente). Le due torte della collezione hanno il tag **«Martesana Milano»**, non «Milano»: `corrisponde()` confronta il **tag intero** — un tag è un valore, non una parola — quindi non le prende. È il comportamento giusto, ma non era l'unico in giro.
  - ⚠️ **Le due letture non coincidevano**: `filtroSuggerimenti()` traduce il tag in `contains` su `tagShopify` (che è la stringa di tutti i tag separati da virgola), quindi per **SQL** «Milano» pescava anche «Martesana Milano». L'aggiunta automatica usava quel filtro: faceva **entrare** prodotti che poi nessun passo prendeva — e in anteprima finivano nel gruppo «nessun passo li prende». La stessa condizione voleva dire due cose diverse a seconda di chi la leggeva.
  - Ora `aggiungiDaRegola()` usa il filtro SQL solo come **rete larga** (con `take` ×4) e poi passa i candidati per `corrisponde()`: entra solo chi un passo prende davvero. La rete larga resta perché SQL non sa confrontare un elemento di una lista scritta in una stringa.
  - Nel catalogo attivo il tag esiste in due forme: **«Milano» su 22 prodotti** e **«Martesana Milano» su 5**. Per far lavorare il passo 2 va spuntata anche la seconda — sono due tag diversi, e unirli è una decisione di merchandising, non un calcolo su una stringa (come per i Tipi doppi del 03/08).

- **07/08/2026 — «dove si consegna» arriva dai metafield, non dai tag** (indicato dall'utente: «i prodotti hanno un metafield NATIONS AVAILABILITY dove poter aggiungere il tag per città»). Su Shopify la disponibilità per città vive in `custom.nations_availability` — «ITALY-MILAN(MI) ITALY-MONZA AND BRIANZA(MB) ITALY-PAVIA(PV)…» — e la città dichiarata in `custom.citta` (`["Milano"]`). Nei tag no: lì convivono città, fornitori e occasioni.
  - Nuovi campi `Prodotto.zoneConsegna` e `Prodotto.cittaShopify`, letti **anche dall'import delle collezioni** (tre punti di scrittura) e riempibili da solo con [scripts/importa-zone-consegna.ts](../scripts/importa-zone-consegna.ts) senza rifare il giro lungo.
  - **Il valore non si spezza sugli spazi**: «ITALY-MONZA AND BRIANZA(MB)» ha gli spazi dentro il nome, quindi `zoneDa()` riconosce la forma `PAESE-<nome>(<sigla>)`. Si salvano separate da virgola, come i tag, così una condizione confronta **la zona intera**.
  - **Due condizioni nuove nella griglia**: «Zona di consegna» (etichette leggibili: «Monza and Brianza (MB)», valore vero sotto) e «Città». Il filtro SQL resta una rete larga e la verità è `corrisponde()`, come per i tag.
  - **Portati dentro anche gli altri metafield** (chiesti dall'utente subito dopo): `custom.occasioni`, `custom.classificazione`, `custom.tipologia`, `custom.data`, `custom.orario_consegna`, `custom.best_seller` sono diventati **sei condizioni nuove** nella griglia — Occasione, Classificazione, Tipologia del prodotto, Data di consegna, Orario di consegna, Best seller su Shopify. Sono liste scelte da un elenco chiuso, non testo libero: una condizione costruita qui sopra non sbaglia per una maiuscola o un sinonimo, ed è il motivo per cui valgono più dei tag.
  - Per «Best seller» i valori sono **Sì / No coi conti veri**: chi non ce l'ha segnato non sta in nessuno dei due, perché «non lo sappiamo» non è «no».
  - ⚠️ `custom.minimo_orario` (= 7 sul prodotto di prova) è **importato ma non è una condizione**: non è chiaro se sia l'ora limite dell'ordine o le ore di preavviso, e una condizione costruita sul significato sbagliato sceglierebbe i prodotti sbagliati in silenzio. Da chiarire con l'utente prima di esporla.

- **07/08/2026 — «ultima modifica» conta anche il lavoro fatto qui** (segnalato dall'utente: «ultima modifica dovrebbe essere home-last-minute»). In `/visual?ordina=modifica-desc` il criterio leggeva solo `aggiornataShopifyIl`, cioè l'`updatedAt` del negozio **fermo all'ultimo import**: curando una vetrina in app — regola applicata, prodotti spostati — quella data non si muove finché l'ordine non si spinge su Shopify, e la collezione appena toccata finiva in fondo. Ora si ordina sulla **più recente delle due** date, e la cella mostra quale: quando vince la nostra scrive «qui, da mandare al negozio», perché altrimenti sembrerebbe una data del negozio sbagliata.

- **07/08/2026 — la categoria interna è la macro famiglia, presa dal «Tipo» di Shopify** (chiesto dall'utente: «SOLO per l'App sposta la categoria di shopify in categoria interna e raggruppa per macro categorie: fiori e fiori d'arte vanno dentro fiori»). Erano **1.024 prodotti attivi tutti `DA_CLASSIFICARE`**: la lente nostra era vuota e mezze pagine giravano a vuoto.
  - [scripts/classifica-da-tipo.ts](../scripts/classifica-da-tipo.ts) mappa i tipi del negozio in **dieci famiglie** e riempie `Prodotto.categoria`. **Scrive solo qui**: su Shopify non tocca niente, come chiesto.
  - **3.137 prodotti classificati.** Attivi: Torte e dolci 424 · Fiori 180 · Vini e spirits 133 · Originali Deluxy 114 · Gastronomia 87 · Regali e accessori 48 · Arte 24 · Servizi 12 · (Casa e decoro e Animali solo fra gli archiviati) · **2 restano «Da classificare»** perché sul negozio non hanno un Tipo, e non si deduce.
  - **Le famiglie le decide una persona**, e sono scritte nel file. Tre scelte da rivedere se serve: **Cappelliere sta nei fiori** (una cappelliera Deluxy è una scatola di rose — nessuna somiglianza fra stringhe ci arrivava); **Originali Deluxy resta da sola** perché è una linea nostra, non una famiglia di prodotto; **Animali** è separata da Regali, perché una cuccia non è un regalo.
  - **Non sovrascrive chi è già classificato a mano** (`categoria: "DA_CLASSIFICARE"` nel where): rilanciarlo non disfa lavoro di nessuno. E i tipi che nessuna famiglia prende **vengono elencati**, invece di restare indietro in silenzio.

- **07/08/2026 — una condizione salvata si modifica, non si rifà** (chiesto dall'utente). Prima si poteva solo togliere e riscrivere da capo: per cambiare **una** spunta su una cella da cinque condizioni si ricominciava, e nel frattempo la vetrina restava ordinata da una regola a metà. Ora ogni passo ha la **matita**: la griglia si apre già compilata con le sue condizioni e le sue metriche, e salvando il passo **resta al suo posto** — la priorità non cambia, cambia il contenuto.
  - Il parsing della griglia sta ora in **una funzione sola** (`passiDaForm`) usata da «aggiungi» e da «modifica»: con due copie, il giorno che si aggiunge un campo una delle due lo ignorerebbe.
  - **Svuotare la griglia e salvare non cancella il passo**: per toglierlo c'è la ×. Far sparire una condizione perché si è deselezionato tutto sarebbe una cancellazione non chiesta.
  - Si passa da `?modifica=<indice>`, quindi il link è condivisibile e il `<details>` si apre da solo. Verificato online: `modifica=1` apre con **Fiori d'Arte** e **urgenze** già spuntati.

- **07/08/2026 — «Novità prima» è la data di pubblicazione sul negozio** (nato da una domanda dell'utente — «le novità da che campo vengono prese?» — e deciso da lui: «per noi conta in ordine di data di pubblicazione»). La metrica leggeva `Prodotto.creatoIl`, cioè **quando la scheda è stata creata qui**: fra i 1.024 attivi c'erano **tre sole date** (26/07 → 445, 03/08 → 538, 04/08 → 41), le tornate di import. Ordinava per lotto di importazione, cioè non ordinava.
  - Nuovi campi `pubblicatoIlShopify` e `creatoIlShopify`, letti dall'import delle collezioni (`createdAt publishedAt` nella query) e riempiti da [scripts/importa-zone-consegna.ts](../scripts/importa-zone-consegna.ts).
  - La metrica ora legge `pubblicatoIlShopify ?? creatoIlShopify ?? creatoIl`: **la pubblicazione è il momento in cui il cliente ha potuto vederlo**, la nostra data resta solo come ultimo ripiego per le schede che su Shopify non ci sono.

- ⚠️ **07/08/2026 — trappola: la metrica non trova il campo perché il `select` della pagina non lo chiede** (segnalato dall utente: «il gelato continua a non apparire»). La metrica «Novità» leggeva `pubblicatoIlShopify`, aggiunto a `SELECT_ORDINABILE` — ma la scheda della collezione costruisce la fila **con un suo select**, dove quel campo non c era: il valore arrivava `undefined` per tutti, la metrica non decideva niente e restava il pareggio finale, cioè **l ordine alfabetico** (Cofanetto prima di Gelato). Il calcolo era giusto, mancava il dato. **Quando si aggiunge un campo a una metrica, va aggiunto a tutti i punti che costruiscono una fila**: `SELECT_ORDINABILE` non è l unico. Nella stessa passata: i prodotti che *entrerebbero* con l aggiunta automatica avevano `creatoIl: new Date()` come riempitivo, che li faceva sembrare le novità più fresche del negozio — ora `new Date(0)`.

- **08/08/2026 — «Invia l ordine a Shopify» adesso dice cosa fa** (segnalato dall utente: «non si capisce cosa significhi»). Il riquadro spiega prima di premere: la fila curata **vive solo in app**, inviarla **riscrive l ordine dei prodotti sul sito** (col link alla collezione online), e **non aggiunge né toglie nessun prodotto**. Sotto, lo stato in chiaro: «Adesso il sito mostra un ordine diverso da questo», curato il … e mai inviato / inviato il …. Il bottone dice «Riscrivi l ordine sul sito (N prodotti)».

- **08/08/2026 — la rotazione si sceglie a numero + unità** (chiesto dall utente: «permetti di scegliere anche il numero di giorni, settimane o mesi»). Nuovo campo `RegolaRotazione.ogniQuanti` (1-52): «ogni 2 settimane», «ogni 10 giorni». Le tre frequenze fisse non bastavano — il ritmo di una vetrina non è sempre uno dei tre. E il campo «Passo» non spiegava sé stesso («non capisco il numero a cosa serve»): ora si chiama **«Quanti ne manda in fondo»**, con sotto scritto che vale a ogni giro e **solo per «Ruota le posizioni»**.

- **08/08/2026 — ⭐ due condizioni uguali con metriche diverse sono due condizioni** (segnalato dall utente: «no come vedi sono condizioni differenti»). Prima un prodotto apparteneva al **primo** passo che lo prendeva, quindi «Categoria interna FIORI — poi per Novità» e «Categoria interna FIORI — poi per Prezzo basso» erano una di troppo: la seconda restava a mani vuote e non compariva mai («non capisco perché non si vede il 6»). Ma sono due cose diverse — in vetrina si alternano il fiore nuovo e caro e quello economico.
  - Ora **ogni passo ordina tutti i prodotti che gli corrispondono, con le sue metriche**, e a turno ognuno mette il suo prossimo **non ancora piazzato**. Nessun doppione, e nessun passo resta muto perché un altro guarda lo stesso scaffale. Verificato: sulla collezione «Fiori» i due passi su FIORI portano **84 e 83** prodotti invece di 169 e 0.
  - **** rifà lo stesso giro per dire in pagina quanti ne porta ciascuno: dedurlo dalla fila finita avrebbe voluto dire riscrivere la stessa logica una seconda volta, ed è così che due parti dell app cominciano a raccontare cose diverse.

- **08/08/2026 — sotto ogni condizione c è scritto quanto porta.** «Porta N prodotti», e quando sono zero il motivo: nessuna corrispondenza qui dentro, oppure i suoi prodotti li mettono già in fila gli altri passi. Senza, un passo che non contribuisce si continua a cercarlo nella fila.

- **08/08/2026 — l anteprima della cella si mette in fila con le metriche scelte** (segnalato dall utente: «dovrebbero apparire prima i prodotti a prezzo più basso»). Ordina con quello che il browser può calcolare — prezzo, novità, margine — e **dichiara** che venduto e fatturato no: quelli stanno nel database e li applica il server quando la regola gira. Una fila che finge di essere ordinata è peggio di una dichiaratamente non ordinata.

- **08/08/2026 — le composizioni floreali sono passate a Fiori** (chiesto dall utente: «metti in categoria interna comunque fiori»). «Originali Deluxy» è il Tipo delle **composizioni** (Rose Rosse e Praline, Cappelliera Rose e Palloncino): tenendole a parte, cercando i fiori se ne perdevano 48. Spostati **177 prodotti (67 attivi)**: Fiori passa da **180 a 247 attivi**, Originali Deluxy scende a 47 (palloncini, Torta e Bollicine, caviale, telegrammi). Criterio **verificabile**: tag floreale, o negozio Flowers, o una parola inequivocabile nel nome — non «indovina dal nome». È l unico punto di  che **sovrascrive** una categoria già assegnata, ed è dichiarato nel file.

- **09/08/2026 — menu e layout semplificati** (chiesto dall utente: «rivedi layout di tutta l app e miglioralo e semplificalo al massimo compresi i menù»).
  - **Sidebar rifatta**: da sette sezioni con ~20 voci + l elenco di ogni collezione maison, a **Cruscotto + 5 gruppi** (Vendite, Catalogo, Lenti sul catalogo, Vetrina, Negozio). Le **Lenti** (fornitore, categoria, linea, fascia, griglie, classificazione) nascono **ripiegate**: tutte le pagine restano raggiungibili, ma il menu di default mostra solo il lavoro quotidiano. La scelta di aprire/chiudere si ricorda per sezione (localStorage).
  - **Via l elenco delle collezioni dal menu**: era una copia di /collezioni dentro la sidebar, ricalcolata a ogni pagina. Via anche i **contatori decorativi** (prodotti, fornitori, tipi, linee, fasce): un numero che dice quanti prodotti esistono è arredamento. Restano solo quelli che chiedono un azione: Sviluppo e da pubblicare su Shopify. La sidebar passa da 3 query (di cui una findMany su tutte le collezioni) a **una sola** con due contatori: si paga su ogni pagina.
  - **Scala tipografica compattata** in un giro solo: titoli 30→25px, sottotitoli 15→13.5, main 40→30px di padding, schede 24→20px, sidebar 250→232px con voci da 13px. Stessi token del design system, solo più aria e meno corpo.
  - **Schede ripiegabili** (`details.scheda` con `summary.scheda-titolo`, e `.scheda-stato` a destra): sulla scheda della collezione «Si rinfresca da sola», «Ordine su Shopify» e «Prodotti per riga» nascono **chiuse col loro stato nel titolo** («segue Bisettimana», «allineato col sito», «5 per riga»). «Ordine su Shopify» si apre **da sola quando c è un ordine da mandare**: è il momento in cui serve. Sono decisioni che si prendono una volta ogni tanto: aperte sempre, seppellivano la fila dei prodotti.

- **09/08/2026 — la Vetrina è quattro schede, non quattro viaggi.** Regole, Rotazioni e Tipologie si raggiungevano da tre bottoni in testa a /visual e si tornava col «←»: per passare da Regole a Rotazioni si faceva scalo. Ora le quattro pagine condividono la stessa riga di schede ([TabsVetrina.tsx](../src/components/TabsVetrina.tsx)) — Collezioni · Regole d'ordine · Rotazioni · Tipologie — con l'attiva sottolineata in oro (la classe è `.tab.attivo`, la stessa della scheda prodotto). Il titolo di /visual è diventato «Vetrina», come la voce di menu.

- **09/08/2026 — «Consegna dalle» è una condizione** (sbloccata dall'utente: `minimo_orario` = **l'ora del giorno da cui si può consegnare**, «7 significa che si può consegnare dalle 7» — era l'unico metafield importato ma non esposto, perché con tre letture possibili una condizione costruita sul significato sbagliato avrebbe scelto i prodotti sbagliati in silenzio). Sette valori distinti sugli attivi (7, 8, 9, 10, 11, 14, 19): niente da/a, è una riga di **chip** come le altre — «Dalle 7:00 · 286» — in ordine di **ora e non alfabetico** («Dalle 10» prima delle «Dalle 7» sarebbe l'ordine delle lettere, non della giornata). Campo `consegnaDalle` in `CAMPI`, `corrisponde()`, `filtroCondizione()`, voci, griglia, e nei `select` di pagine/aggiunta automatica/`SELECT_ORDINABILE` — la trappola del campo dimenticato in un select è già stata pagata con «Novità».

- **09/08/2026 — colonna «Prossimo giro» nell elenco delle collezioni** (chiesta dall utente). La colonna Rotazione dice il ritmo, questa dice **quando tocca**: la data del prossimo rinfresco (`prossimaVolta`, la stessa funzione della pagina Rotazioni — mai eseguita = scatta al prossimo cron, scritto in oro; in pausa = «in pausa»). È **ordinabile**: `?ordina=prossimo-desc` mette i giri più imminenti in cima, e chi non ruota va in fondo perché «non ne ha» non è una data.

- **09/08/2026 — la scheda della collezione Shopify rifatta** (chiesto dall'utente: «rendi layout comprensibile»). Nuovo ordine: **una scheda sola** «La collezione» (campi con la matita + com'è fatta sul negozio + come la usiamo noi, che erano tre riquadri sparsi), poi **il SEO in alto in un posto unico**, poi KPI, fila, **due classifiche** e l'«Elimina» ripiegata. La descrizione non compare più due volte (testata + matita): vive solo nel campo modificabile.
  - **Due classifiche dichiarate, per valore e per pezzi** — un pezzo da 3.000 € vale come trentacinque bouquet, e una tabella sola nascondeva metà della storia. Foto, posizione, top 30 con «mostra tutti», peso sul totale della collezione. Solo chi ha venduto nella finestra: una classifica di zeri è rumore.
  - **«Scrivi con AI» sul SEO** ([src/lib/ai-seo.ts](../src/lib/ai-seo.ts)): scrive una **bozza** nei campi nostri leggendo dati veri — titolo, condizioni d'ingresso, gli 8 più venduti (in ordine, esclusi archiviati e righe di servizio). **Non manda niente al negozio**: su Google non cambia nulla finché non si preme «Manda». Serve la chiave OpenAI in cassaforte (leggiSegreto), la stessa del resto dell'AI.
  - **Linee guida SEO per brand** (chiesto dall'utente: «una zona SEO nelle impostazioni per brand»): campo `NegozioShopify.lineeGuidaSeo`, form ripiegato nella scheda di ogni negozio in Impostazioni, con esito suo (`?esito=seo-brand`). L'AI le mette nel prompt **con precedenza sulle regole generiche** — stessa idea del prompt di categoria per le descrizioni.
  - **Revisione multi-agente prima del deploy** (19 agenti, 16 segnalazioni, 12 confermate): tra i difetti veri trovati — la pagina **buttava via** `?esito=&messaggio=` (gli errori dell'AI erano invisibili: ora c'è il banner), lo stile inline sulle classifiche **scavalcava la media query** (su tablet restavano schiacciate fianco a fianco: ora `.due-colonne-pari`), `findMany` **non conserva l'ordine dell'IN** (i «più venduti» arrivavano al modello mescolati), e la nota sotto le classifiche contava con un metro diverso da quello delle classifiche stesse.
  - ⚠️ Trappola pagata due volte oggi: **ristrutturare una pagina a colpi di regex/splice**. Un regex pigro su `<RiquadroSeo` è partito dal primo che ha trovato e ha mangiato mezza pagina; gli splice hanno mangiato la prima riga di due commenti. Se capita di nuovo: leggere il file, tagliare per numeri di riga CON guardie sul contenuto atteso, e mai backtick dentro `node -e` fra doppi apici.

- **09/08/2026 — «Elimina» in testata, rosso, con la conferma a popover** (chiesto dall'utente). Il bottone sta con le altre azioni della scheda collezione ma **premere apre, non esegue**: nel popover restano la spiegazione, la spunta «anche su Shopify» e il «Sì, elimina» — cancellare qui e cancellare sul negozio sono due gesti diversi. Nuova classe `.btn-pericolo`: il rosso è **solo** per il distruttivo, il primario resta nero perché il rosso deve restare raro per voler dire qualcosa.

- **09/08/2026 — /collezioni: stelline, ricerca e filtri** (chiesti dall'utente). Nuovo campo `CollezioneShopify.preferita` — vive **solo qui**, è una scorciatoia personale, non una proprietà del negozio. La stellina si accende dall'elenco **senza redirect** (lo scroll resta dov'era). Ricerca su **titolo, handle e temi** — i tre nomi con cui una collezione si conosce — più filtro per negozio e «★ Solo preferite», in un form GET: il filtro sta nell'indirizzo e si condivide, e l'ordinamento scelto sopravvive.

- **09/08/2026 — il contatore SEO conta mentre si scrive** (chiesto dall'utente). Nuovo componente client [CampiSeo](../src/components/CampiSeo.tsx): titolo e descrizione con `N/60` e `N/160` aggiornati a ogni tasto, in arancione oltre il limite. Prima il numero era fermo all'ultimo salvataggio: per sapere se si era lunghi bisognava salvare, cioè scoprirlo dopo. Solo i campi sono client — form, Salva e azioni restano server, e i `name` non cambiano.

- **09/08/2026 — tre ritocchi chiesti guardando la pagina.** In /collezioni la colonna **«Dove è usata»** (le posizioni dichiarate a pillole, «campagne» in oro, ordinabile per quanti posti la usano): era un grigino sotto lo stato e non si vedeva. Nella scheda della collezione la dl dice anche **«Ordine curato da»** (la regola nostra, con link a cura l'ordine) e **«Prossimo rinfresco automatico»** (data da `prossimaVolta`, «al prossimo giro del cron» se scaduta, «in pausa» se ferma, «non previsto» se non iscritta). E il **Salva del SEO ora risponde**: salvava e taceva — un bottone muto sembra rotto — ora il banner dice «Bozza SEO salvata. Il negozio non cambia finché non premi Manda».

- **09/08/2026 — il SEO si apre con la matita** (chiesto dall'utente). Il riquadro nasce **in lettura** — titolo e descrizione nostri come testo, coi conteggi — e la ✎ mette `?seoModifica=1`: solo allora compaiono i campi, il Salva, «Scrivi con AI» e «Chiudi». È la stessa matita dei campi del negozio qui sopra. Prima la scheda sembrava un modulo da compilare anche quando si passava solo a guardare.

- ⚠️ **09/08/2026 — due «Salva» che salvavano in silenzio** (segnalati dall'utente due volte, su form diversi): il SEO e le proprietà della collezione scrivevano davvero ma non dicevano niente, e un bottone muto sembra rotto. Ora entrambi fanno redirect col banner: «Bozza SEO salvata. Il negozio non cambia finché non premi Manda» e «Salvato. Sono proprietà nostre: le leggono le altre app via API, su Shopify non cambia niente». **Regola**: un'azione che scrive e non dice niente è un'azione che l'utente rifarà.

- **09/08/2026 — «Le altre lingue» sulla scheda della collezione** (chiesto dall'utente: «c'è la traduzione?»). [src/lib/traduzioni-shopify.ts](../src/lib/traduzioni-shopify.ts) legge `translations` di Shopify per titolo, descrizione e SEO, **otto lingue in una chiamata sola** (alias GraphQL invece di otto viaggi) e **solo su richiesta** (`?lingue=1`): è una chiamata viva al negozio, farla a ogni apertura sarebbe latenza pagata da chi guarda altro.
  - **Si leggono e basta**: si scrivono nell'admin del negozio. Riscriverle da qui vorrebbe dire fare danni in una lingua che qui nessuno rilegge.
  - **Il campanello è `outdated`** («da rifare»): Shopify lo alza quando l'originale è cambiato **dopo** la traduzione — cioè quando il cliente straniero legge ancora il testo vecchio. Misurato su «Regali Best Seller»: inglese e russo tradotti, col titolo inglese e tre voci russe già da rifare.
  - ⚠️ **Le lingue configurate sul negozio non si possono elencare**: `shopLocales` chiede lo scope `read_locales`, che i token di oggi non hanno (risposta ACCESS_DENIED). Si chiede una lista fissa di otto lingue, **dichiarata in pagina** — meglio un elenco onesto che una lista vuota che sembra «non ci sono traduzioni».

- **10/08/2026 — il venduto si aggiorna da solo, e gli stati vecchi si correggono.** Fino a oggi l'import da Deluxy Orders era **solo un bottone** in `/vendite`: se nessuno lo premeva, l'app continuava a rispondere su una fotografia vecchia **senza dirlo da nessuna parte**. Misurato all'apertura della sessione: l'ultima vendita in archivio era del **25/07**, sedici giorni di negozio che l'app non sapeva — mentre le regole d'ordine «più venduti», le classifiche, le ipotesi di ordinativo e le **rotazioni notturne delle vetrine** decidevano esattamente su quei numeri.
  - **Cron giornaliero** `/api/cron/vendite` (`vercel.json`, **05:00**) che importa gli ultimi **30 giorni**. Gira **prima** delle rotazioni delle 05:20, non dopo: l'ordine conta, così le vetrine si rifanno sul venduto di stanotte e non su quello di ieri. Protetto da `CRON_SECRET` come le rotazioni (già impostato su Vercel dal 30/07); senza segreto risponde 503 invece di restare aperto. Il middleware lascia già passare `/api/cron/*` — trappola pagata a suo tempo e qui ereditata gratis.
  - ⭐ **Il difetto vero era un altro, e si vedeva solo facendo girare l'import spesso**: `createMany({ skipDuplicates: true })` non riscrive **mai** una riga già presente. Un ordine entra `PENDING` e diventa `PAID` quando il bonifico arriva, o `REFUNDED` quando il cliente restituisce — ma quella riga restava congelata allo stato del primo import. Siccome `FILTRO_BUON_FINE` legge proprio quel campo, **una vendita incassata tre giorni dopo restava fuori dalle classifiche per sempre, e un rimborso restava dentro**. Nuova `riallineaStati()` in [orders.ts](../src/lib/orders.ts): legge gli stati attuali, li confronta e **scrive solo dove qualcosa è davvero cambiato**, a gruppi di stato uguale (pochi `updateMany` invece di un update per riga) e a cinque scritture per volta (`SCRITTURE_INSIEME`, il pool da 5 è condiviso con altre cinque app).
  - **Il limite è dichiarato**: girando ogni notte su 30 giorni, ogni ordine viene ricontrollato per trenta giorni di fila; un rimborso che arrivasse più tardi resta fuori. È il prezzo per non rileggere un anno di ordini ogni notte.
  - **Nuovo componente [FreschezzaVenduto](../src/components/FreschezzaVenduto.tsx)**, un punto solo per pagina sotto la testata, in `/`, `/vendite`, `/classifiche`, `/riordini`, `/visual` e la scheda della collezione: **riga grigia** con la data quando i numeri sono freschi, **avviso ambra** con quanti giorni e il link per aggiornare quando sono fermi da più di tre. Una classifica vecchia che si dichiara vecchia è un'informazione; la stessa classifica muta è un errore. Soglia a 3 giorni: sotto è latenza di Orders, sopra è un import che non gira.
  - ⚠️ **La data si formatta fissando `Europe/Rome`**, non nel fuso del server. Il giorno di una vendita è salvato come mezzanotte del fuso in cui gira l'import: letto in UTC — cioè su Vercel — la stessa riga torna indietro di un giorno, e la pagina direbbe «fermi a ieri» mentre in locale dice «di oggi».
  - `ImportVendite` ha due campi nuovi: `righeAggiornate` (contate a parte da `righeNuove` perché non sono venduto nuovo, è venduto che ha cambiato verdetto) e `automatico` (giro notturno o bottone), e `/vendite` lo scrive nell'ultima riga di esito.
  - **Verificato su dati veri (10/08/2026)**: import reale eseguito → **235 righe nuove**, venduto dal 25/07 al **09-10/08** (+38.274 €, totale 971.318 €), e **34 righe già in archivio hanno cambiato stato** — la prova che il difetto non era teorico. `db push` + `tsc` exit 0 + `next build` ok; le cinque pagine rendono la riga di freschezza (verificate via fetch autenticato); il **ramo dell'avviso è stato visto davvero**, abbassando la soglia per un giro e ripristinandola; la rotta cron risponde 503 senza segreto e non viene dirottata al login.

- **10/08/2026 — un massimo di prodotti per collezione** (chiesto dall'utente: «consentimi di impostare un numero massimo di prodotti che faranno parte della collezione»). Nuovo campo `CollezioneShopify.massimoProdotti` (`null` = nessun tetto) e riquadro **«Quanti prodotti al massimo»** nella scheda della collezione, che nasce chiuso con lo stato nel titolo («massimo 30 · ne ha 88») e **si apre da solo quando la vetrina è sopra il tetto**.
  - **Si conta su chi il cliente vede** (`FILTRO_IN_SCENA`), non su tutta l'appartenenza: due prodotti su tre del catalogo sono archiviati su Shopify, e un tetto che li contasse direbbe «piena» una vetrina mezza vuota. Gli archiviati sono dichiarati a parte in pagina.
  - **Vive sulla singola collezione**, non sulla regola d'ordine: la stessa priorità serve una vetrina di punta da venti pezzi e una categoria da duecento, e le regole restano condivisibili.
  - **Due effetti tenuti separati.** Il tetto da solo **ferma le aggiunte automatiche** (`aggiunta-da-regola.ts`: legge i posti liberi prima di scrivere e restituisce `fermatiDalMassimo`, che l'azione scrive nel banner — un'aggiunta che non aggiunge e non spiega perché si legge come «non c'era nessun candidato»). **Togliere** quelli di troppo è invece un gesto che si preme: `potaCollezione` in [azioni-massimo-collezione.ts](../src/lib/azioni-massimo-collezione.ts), bottone rosso con la conferma nel popover e il numero scritto sopra, `collectionRemoveProducts` su Shopify **prima** del database. **Il cron delle rotazioni non taglia mai**: un automatismo che di notte toglie prodotti dal sito vero è la cosa che qui non si fa, per la stessa ragione per cui l'invio dell'ordine è spento di default.
  - **Chi esce si vede prima**: sono **gli ultimi della fila di oggi** — quelli che la priorità della regola ha già messo in coda — e la pagina ne elenca i nomi. Non si ricalcola un ordine al momento del taglio: uscirebbero prodotti diversi da quelli appena letti a schermo.
  - ⚠️ **Un paletto scritto e poi tolto, perché avrebbe reso la funzione inerte.** Avevo previsto di risparmiare i prodotti segnati «manuale», per non disfare con un'automazione la scelta di una persona. Ma `ProdottoInCollezioneShopify.origine` vale `"manuale"` **anche per tutto ciò che arriva dall'import di Shopify**: misurato sulla collezione di prova, **0 su 68** venivano dalla regola. Il bottone non sarebbe comparso mai, e una funzione che sembra esserci e non fa niente è peggio che non averla. Ora si tagliano gli ultimi e basta; **quanti ne escono per origine è scritto nella conferma**, dove serve a decidere. Se un giorno servisse davvero distinguere, va aggiunto un terzo valore a `origine` all'import — non dedotto da quello che c'è.
  - **Verificato in dev su dati veri** (Gifts, «Palloncini», 88 in scena e 19 archiviati): con massimo 20 il riquadro si apre da solo e dice «68 oltre il massimo», elenca i nomi di chi uscirebbe, il bottone dice «Togli 68 prodotti dalla collezione» e la conferma «0 dalla regola, 68 manuale»; salvando 30 dal form il banner risponde «Massimo impostato a 30. La vetrina ne ha 88: non ne entrano altri, e i 58 di troppo restano finché non li togli tu» e lo stato nel titolo diventa «massimo 30 · ne ha 88». Stato di prova poi azzerato. `db push` + `tsc` exit 0 + `next build` ok.
  - ⚠️ **Difetto trovato subito dopo, segnalato dall'utente («qualcosa non funziona») su «Regali Best Seller»** (Gifts, 797 in scena, massimo 200 → 597 da togliere): `collectionRemoveProducts` accetta **250 prodotti per chiamata**, e il taglio ne mandava 597 in una sola mutation. È lo stesso limite che l'aggiunta rispettava già (`MAX_PER_GIRO = 250`) e che qui era stato dimenticato — quindi il taglio falliva **proprio sulle collezioni grandi, le uniche per cui un tetto serve**. Ora va a blocchi di 250, e **ogni blocco si cancella qui subito dopo che il negozio l'ha accettato**, non tutti alla fine: se il terzo fallisce, i primi due sono usciti sul sito e devono risultare usciti anche in app, altrimenti l'app dice che ci sono prodotti che sul sito non ci sono più. Il messaggio d'errore distingue i due casi («nessuno è stato tolto» / «ha rifiutato dopo i primi N»). Aggiunto anche `maxDuration = 120` alla pagina: tre chiamate di fila a Shopify non stanno nel tetto di default.
- ⭐ **10/08/2026 — la vera causa del «qualcosa non funziona»: app e negozio si erano disallineati, e nessuno se ne accorgeva.** Indagando la segnalazione ho contato su Shopify invece di fidarmi dell'app: la collezione «Regali Best Seller» aveva **686 prodotti sul negozio e 858 qui**, 172 di troppo. Ricostruzione: il taglio da 597 è partito, Shopify ha accettato la mutation e **ne ha tolti 172 davvero**, poi la richiesta è scaduta prima del `deleteMany` — nessun errore a schermo, e da quel momento **ogni numero della pagina era costruito su un conteggio gonfio** (797 «in vendita» invece di 625, «597 di troppo» invece di 425). Il bottone non era rotto: erano rotti i numeri.
  - **La lezione**: quando una server action scrive **prima** sul negozio e **poi** qui, ogni interruzione in mezzo lascia le due parti a raccontare cose diverse — e l'app non ha modo di accorgersene da sola, perché la sua unica fonte è sé stessa. Non basta l'ordine giusto delle scritture: serve **poter rileggere**.
  - **Nuova azione `rileggiCollezioneDalNegozio`** («Rileggi dal negozio», accanto al massimo): chiede a Shopify chi sta davvero in **questa** collezione e riscrive le appartenenze locali, senza rifare l'import di tutte le 234 collezioni (venti minuti per una domanda su una). **Scrive solo qui**, su Shopify non tocca niente; **conserva le posizioni curate** (chi resta tiene la sua, i nuovi in fondo) e **conta** i prodotti del negozio che qui non hanno una scheda invece di crearli — crearli è un'altra cosa e la fa l'import. `leggiProdottiDiCollezione` di `shopify-collezioni.ts` è stata resa esportabile invece di riscriverla: una copia sarebbe divergere.
  - **Eseguita per davvero il 10/08/2026** su «Regali Best Seller»: 858 → **686 appartenenze, identiche a Shopify**, 625 in scena, e la pagina ora dice «massimo 200 · ne ha 625», «425 oltre il massimo». I 172 usciti nel taglio interrotto erano comunque **fra quelli oltre il tetto**: sono usciti prima del previsto, non a sproposito.
  - **MANCA**: il taglio **completo** non è mai stato portato a termine contro il negozio. Riscrive lo storefront reale togliendo prodotti da una collezione: da fare con conferma esplicita dell'utente.
  - ⚠️ **Trappola di verifica ricascata**: il browser in-app, navigando su `/visual/[id]`, **deriva sulla home** (`h1` = «Cruscotto») e fa sembrare assente un riquadro che nell'HTML c'è. Era già scritto qui il 30/07. Per queste pagine vale solo il fetch autenticato col cookie `mrc_session`. E **non lanciare `next build` mentre il dev server gira**: sovrascrive `.next` sotto i suoi piedi e il server comincia a rispondere 500 con `Cannot find module './NNNN.js'` — sembra un difetto del codice e non lo è (`rm -rf .next` e riavvio).

- ⚠️ **10/08/2026 — la rotazione «rinfresca» ignorava le regole salvate, cioè era muta proprio sulle collezioni curate meglio** (nato da una domanda dell'utente: «cosa comporta l'applicazione di questa regola?», sulla rotazione mensile di «Regali Best Seller»). `eseguiRegola` cercava l'ordine da riapplicare **solo** in `regolaOrdinamento` (la regola rapida) e nella tipologia. Ma quella collezione segue la regola **salvata** «Best Seller Deluxy» a sei passi — e scegliere una regola salvata **azzera** `regolaOrdinamento`, apposta, perché due ordini insieme non si saprebbe quale vince. Risultato: `regole.length === 0` → `continue`, collezione **saltata**. In pagina si leggeva «ogni mese, rinfresca l'ordine, l'ordine rifatto viene mandato anche a Shopify»; nei fatti non sarebbe successo niente, e l'unica traccia sarebbe stata un «0 collezioni» nell'`ultimoEsito` che nessuno va a leggere.
  - Ora la precedenza è **regola salvata → regola rapida → tipologia**, la stessa della scheda della collezione (`applicaRegolaSalvata` quando c'è `regolaOrdineId`).
  - **Verificato**: scombinando la fila (primo prodotto mandato in fondo) e lanciando quello che farà il cron, l'ordine **torna identico** a quello vero — prima la collezione non veniva nemmeno toccata. La data di modifica è stata riportata al valore di prima, per non lasciare la collezione segnata «da mandare al negozio» con un ordine identico.
  - **Nota su cosa il cron NON fa**, ed è voluto: non fa **entrare** prodotti nuovi (`aggiungiDaRegola` non è chiamata dal giro notturno) e non **toglie** quelli oltre il massimo. Rimescola l'ordine di chi c'è già; l'appartenenza si cambia solo con un gesto.

- ⭐ **10/08/2026 — i «Porta N prodotti» sotto le condizioni erano contati su un campione, e per giunta alfabetico** (chiesto dall'utente: «sei sicuro i risultati siano giusti? motiva con una tabella»). Il costruttore delle condizioni legge il catalogo con `take: MAX_CATALOGO` e `orderBy: nome asc`: **900 contro 1.014 prodotti in vendita**. Non un campione, quindi, ma sistematicamente i prodotti col nome nella prima parte dell'alfabeto — e i conti sotto ogni passo uscivano **sempre per difetto**, che è il modo peggiore di sbagliare qui: una condizione sembra portare meno di quanto porta, e si finisce per aggiungerne un'altra che non serviva. Misurato sulla collezione «Torte»:

  | # | Condizione | Diceva | Vero | |
  |---|---|---|---|---|
  | 1 | TORTE_DOLCI + prezzo da 100 € | 83 | **99** | +16 |
  | 2 | TORTE_DOLCI + zona ITALY-MILAN(MI) | 104 | **105** | +1 |
  | 3 | TORTE_DOLCI + urgenze + città Milano | 22 | **23** | +1 |
  | 4 | Cake Design + TORTE_DOLCI | 111 | **131** | +20 |

  Su «Regali Best Seller» lo scarto era anche maggiore (passo 2: 150 → 182; passo 6: 150 → 181), mentre su «Fiori» era **zero**: lì i prodotti che le condizioni prendono stavano tutti dentro i primi 900 nomi. Ecco perché il difetto non si vedeva guardando una collezione a caso. `MAX_CATALOGO` portato a **5000**: resta un tetto (e la pagina dichiara già `campione` se lo superasse), ma sta **sopra** il catalogo vero invece che dentro.
- **10/08/2026 — una sola implementazione per fila e conteggi** (`ordinaPerPassiConConti`). Cercando il difetto qui sopra ne è saltato fuori un altro, latente: `quantiPerPasso` era una **seconda** implementazione del giro a turno, e i suoi gruppi **non erano ordinati** — non potevano esserlo, era sincrona mentre il venduto («più venduti», «più fatturato») si legge dal database. Siccome l'assegnazione va a turno, chi si aggiudica un prodotto che sta in due condizioni dipende da **dove sta nella sua fila**: con gruppi non ordinati i conteggi potevano non essere quelli veri. Sui dati di oggi i due davano gli stessi numeri (la pagina passava già una lista pre-ordinata), quindi **non è questo che l'utente vedeva** — ma era una divergenza in attesa di succedere. Ora il conto esce dallo stesso giro che costruisce la fila e `quantiPerPasso` è stata tolta. Ironia registrata: il commento di quella funzione diceva di rifare il giro «perché è così che due parti dell'app cominciano a raccontare cose diverse».

- ⭐ **15/08/2026 — revisione completa multi-agente e 20 correzioni** (chiesta dall'utente: «verifica il codice, bug e miglioramenti anche estetici»). Sei revisori (server actions, logica dati, sicurezza, Shopify, UI, prestazioni) + uno scettico per ogni bug: 45 segnalazioni, **12 bug confermati** (2 respinti con prove), 30 proposte. Applicati in questa tornata:
  - **Dati**: `analizzaVendite` ora esclude i prodotti «esclusi dalle analisi» e gli archiviati (la promessa di `esclusoDaAnalisi` era violata proprio nell'andamento; il registro resta completo dei rimborsi, che è dichiarato in pagina); `TabellaProdotti` mostra «n.d.» invece della **barra margine al 100%** sui 1.024 prodotti senza costo; lo **sparkline** si riempie anche dalle settimane del periodo precedente (non più «partito da zero» falso); la rotazione «ruota» sposta **solo i prodotti in scena**; l'import dichiara il **tetto delle 40 pagine** quando tronca; i candidati della riconciliazione si **ordinano per forza PRIMA del taglio** a 60 (un doppione con lo stesso SKU non può più sparire) e il loro venduto è a buon fine.
  - **Fuso orario, una volta per tutte** ([src/lib/fuso.ts](../src/lib/fuso.ts)): il giorno di una vendita, i confini delle finestre, le etichette delle serie e le date delle pagine Visual sono **il calendario di Roma** ovunque giri il codice — prima un ordine delle 00:30 finiva nel giorno prima su Vercel e in quello giusto in dev, per sempre. `giornoRoma`/`sommaGiorniRoma` gestiscono il cambio d'ora (testato sui passaggi di marzo e ottobre); `chiaveSerie` usa `round` non `floor`.
  - **Shopify**: le due `graphql` trattano **HTTP non-2xx e corpo vuoto come errori** (prima un 502 senza corpo passava per successo: varianti «create» su un prodotto a 0 € già pubblicato, 250 righe locali di prodotti mai entrati e irrecuperabili); tutti i chiamanti passano da `erroriDi`; la **rimozione in blocco spezza a 250** come la potatura; la **rilettura dal negozio** mette i nuovi **in fondo** (partivano dalla posizione 0, in testa alla curatela) e fa delete+create **in transazione**; `aggiungiDaRegola` ha un `orderBy` stabile (il take senza ordine non valutava MAI i candidati oltre il taglio) e il suo **esito non viene più scartato** dai tre chiamanti che lo ignoravano.
  - **Pool**: `numeraPosizioni` scrive a blocchi di **5**, non 50 (`connection_limit=5` condiviso: 45 query in coda → P2024 a metà rinumerazione → vetrina con posizioni miste).
  - **Sicurezza**: middleware **fail-closed in produzione** (senza `MERCHANDISING_APP_PASSWORD` su Vercel: 503, non app aperta); login con confronto su hash + **1 secondo di ritardo** sui tentativi falliti; `CRON_SECRET` confrontato **constant-time** ([segreto-cron.ts](../src/lib/segreto-cron.ts)); **CSV injection** neutralizzata nei due export (apostrofo sui prefissi-formula, i numeri restano numeri).
  - **UI**: la classe **`.nota-errore` esisteva solo nei JSX di sei pagine** — ora esiste anche nel CSS, e un push rifiutato da Shopify è rosso invece che oro-conferma; il banner della scheda prodotto mostra il **messaggio** (stampava la parola «ok», e gli errori arrivavano verdi); `salvaSeoProdotto` risponde col banner come la gemella; **«Manda al negozio» non cancella più il campo SEO lasciato vuoto** (con solo il titolo compilato, `description: ""` azzerava la meta description del negozio — e lo specchio locale nascondeva la perdita); rinominare una regola col nome di un'altra dà un messaggio invece della pagina d'errore di Next; `.pill-tema` col testo in `--gold-strong` (era ~2.8:1 di contrasto); `SelettoreCriteri` usa la classe `.modulo-due` invece dello stile inline che scavalcava la media query; `MAX_ANTEPRIMA` della scheda regola da 900 a 5000 (stesso taglio alfabetico della collezione); `/costi` con `select` mirato invece di `include` (megabyte di descrizioni per cinque numeri).
  - **Verificato**: tsc exit 0, `next build` ok, helper del fuso testati sui casi limite (mezzanotti, DST), `analizzaVendite` su dati veri coerente con `classifiche` (73.461 € col registro completo contro 72.284 € a buon fine), sparkline di un prodotto stabile ora pieno su 8 settimane.
  - **Respinti dallo scettico** (con prove, non da rifare): l'aggiunta in blocco non può superare 250 (il picker ne offre 60); la rotazione non ignora la regola salvata della **tipologia** perché `tipologia.regolaOrdineId` non è scrivibile da nessuna UI (nota: se mai nascerà quella UI, allineare `eseguiRegola` nello stesso commit).
  - **Restano da fare, in ordine di valore** (dalla stessa revisione, non applicati qui): `VERSIONE_API = 2024-10` è **fuori supporto** (Shopify serve in silenzio un'altra versione: da aggiornare validando le mutation, e leggere `X-Shopify-API-Deprecated-Reason` nella verifica); l'**import collezioni** fa deleteMany globale + ricostruzione fuori transazione dentro una richiesta che può morire per `maxDuration` (riscrivere per-collezione in transazione + riga «in corso» nello storico); il **cookie di sessione è sha256(password)**: brute-force offline possibile e nessuna revoca singola (passare a HMAC con scadenza); «Elimina» negozio e «Revoca» chiave in `/impostazioni` **eseguono al primo click** senza conferma; le collezioni **cancellate dal negozio non spariscono mai** dall'app (confrontare i gid a fine import e marcarle); `vociPassi` apre 7 query su un pool da 5; il `groupBy` del venduto può girare due volte nella stessa richiesta di `/visual/[id]` (avvolgere in `cache()`); tre pillole di stato diverse per lo stesso concetto (unificare in `Badge`); `variants(first: 10)` all'import è un taglio non dichiarato; le tabelle del cruscotto sforano su telefono (manca l'overflow-x); nessun ESLint configurato.

- **17/08/2026 — «I più venduti» per sito, con le foto** (`/best-seller`, chiesta dall'utente: «top 10 best sellers per sito con foto in classifica con scelta date»). Prima voce del menu Vendite, perché è la domanda che ci si fa più spesso.
  - **Affiancati, non sommati**, come il Cruscotto: deluxy.it, Flowers e cakedesign.me vendono cose diverse a persone diverse, e in una classifica unica il best seller del negozio piccolo sparirebbe sotto i volumi del grande. Per la stessa ragione **la quota di ogni riga è sul venduto del suo sito**, non sul totale. I siti sono in ordine di fatturato. Rispetta l'ambito: dentro un brand si vede solo quel sito.
  - **Sei periodi**, e non sono tutti la stessa cosa: oggi · 7 giorni · **mese corrente** · 30 giorni · trimestre · anno. «Mese corrente» è un pezzo di **calendario** (riparte il primo del mese), gli altri sono finestre che scorrono — chiamare «mese» gli ultimi 30 giorni è l'errore classico, e il 3 del mese sono due cose molto diverse. `PERIODI`/`periodoDa` in [vendite.ts](../src/lib/vendite.ts), `primoDelMeseRoma` in [fuso.ts](../src/lib/fuso.ts), tutto nel calendario di Roma. Periodo e vista stanno **nell'indirizzo**: la schermata si condivide e si mette nei preferiti.
  - **Per pezzi o per valore**, con l'interruttore: sono due classifiche diverse (chi vende cento bouquet da 30 € e chi vende un pezzo da 3.000 € fanno due mestieri), e l'app lo dice già altrove.
  - **Una sola query** per tutti i siti (`bestSellerPerSito`), raggruppata in memoria: il pool ha 5 connessioni condivise, e tre chiamate a `classifiche()` ne avrebbero prese sei. Conta solo il venduto a buon fine, esclude archiviati ed esclusi dalle analisi, e **dichiara quanti articoli restano fuori** dalla top dieci.
  - **La colonna «N ordini»** accanto al codice: distingue 75 pezzi venduti a un cliente solo da 75 clienti diversi. Si è rivelata subito utile — vedi qui sotto.
  - ⚠️ **«Torta Tisamisu Modena» è prima su deluxy.it ed è un supplemento di prezzo**, non un prodotto: 75 pezzi da **1,00 €** in **un ordine solo**. La classifica è giusta, il catalogo no. Non si filtra dal nome (sarebbe indovinare): si archivia o si esclude dalle analisi in `/anagrafica`, come già fatto con `_Additional Price`. La riga «N ordini» lo rende evidente a colpo d'occhio.
  - **Verificato in dev su dati veri**: tutti e sei i periodi rendono con le date giuste (oggi 17/08; mese corrente dal 01/08; anno dal 18/08/2025), 3 siti × 10 righe, 27 foto vere su 30, righe alte 62px uniformi, **nessuno scroll orizzontale a 1280px né a 375px** (su telefono la riga resta una riga: il primo tentativo col wrap la faceva salire a 151px). `tsc` + `next build` ok.

- **17/08/2026 — il venduto si aggiorna ogni quarto d'ora, e la freschezza si misura sul giro** (chiesto dall'utente). Prima l'import era **solo notturno**: contato sul database, girava puntuale ogni giorno alle 07:00 di Roma dall'11/08 — ma un ordine delle 9 del mattino si vedeva qui **il giorno dopo**. Misurato il 17/08: Deluxy Orders aveva un ordine di undici minuti prima, l'app non lo sapeva.
  - **Due ritmi, non uno**, perché servono a due cose diverse: `*/15` con `?giorni=2` è l'**aggiornamento** (Orders si sincronizza da Shopify con lo stesso passo, quindi più in fretta non si può andare: il collo di bottiglia sarebbe lui), e **06:30 con 30 giorni** è il **riallineamento degli stati** — un ordine incassato o rimborsato giorni dopo, che il giro corto non raggiungerebbe mai. È lo stesso schema di [deluxy-orders/vercel.json](../../deluxy-orders/vercel.json), non un'invenzione locale.
  - **Il giro lungo sta al :37, non a un minuto tondo**: a `30 6` sarebbe scattato **nello stesso istante** di quello dei quarti d'ora. Non si corromperebbe niente (righe scritte con `skipDuplicates` su `riferimento` unico, riallineo che riscrive gli stessi valori), ma un import da 30 giorni e uno da 2 si contenderebbero le **5 connessioni** del pool condiviso con altre cinque app — lo scenario che qui ha già prodotto dei `P2024`. Sette minuti di sfasamento costano nulla. ⚠️ In `deluxy-orders` la stessa collisione c'è ancora (`0 6` contro `*/15`): se un giorno lì compaiono P2024 all'alba, la causa è questa.
  - **Il parametro non può allungare il giro corto**: `?giorni=` è tagliato a `GIORNI_MAX = 90`. Ogni quarto d'ora un import da un anno saturerebbe il pool da 5 connessioni e l'API di Orders.
  - ⭐ **L'allarme si è spostato dall'ultima vendita al giro dell'import** ([orders.ts](../src/lib/orders.ts) → `Freschezza.minutiDallUltimoGiro`, soglia `MINUTI_ATTESI = 40` = due giri più il margine per uno slittamento). Finché l'import era notturno le due cose si confondevano; ora che passa ogni quarto d'ora **una giornata senza ordini è una notizia sul negozio, non un guasto dell'app** — e la vecchia regola («ultima vendita a più di 3 giorni») avrebbe gridato al lupo su un archivio perfettamente aggiornato. Un allarme che grida a vuoto smette di essere letto. Se **nessun** import è mai riuscito si dichiara vecchio: non sapere è peggio che sapere di no.
  - `FreschezzaVenduto` dice ora «Venduto aggiornato **12 minuti fa**, ultima vendita del …» invece della sola data, e nell'avviso «non passa da 3 ore». La durata si compone **senza** il «fa» dentro (`durata()`): la stessa stringa entra in due frasi e incollandocelo dentro se ne sgrammatica una — «non passa da 3 ore fa» era il primo tentativo.
  - **Verificato**: `tsc` exit 0 e `next build` ok; le tre pagine con la riga (`/`, `/vendite`, `/best-seller`) lette in dev sui dati veri col cookie di sessione — avviso ambra corretto («non passa da 3 ore», ultimo giro alle 07:00), stessa riga in tutte e tre. Contato sul database: **6.930 righe di venduto**, ultimi 8 import tutti `ok` e `automatico`, ultima vendita del 17/08.
  - ⚠️ Fra il deploy e il primo scatto del `*/15` la riga resta ambra: è corretta, non è un difetto.
  - ✅ **Confermato in produzione il 17/08/2026**: il primo scatto è arrivato alle **10:45:43**, `esito=ok`, `automatico=true`, finestra 15/08 → 17/08, **2 righe nuove su 29 lette** — cioè due vendite che con l'import notturno si sarebbero viste domani. Subito dopo le tre pagine dicono «**Venduto aggiornato adesso** — si aggiorna da solo ogni quarto d'ora». **Visti entrambi i rami** del componente: ambra prima del deploy (giro fermo da 3 ore), grigio dopo.

- **17/08/2026 — le date nelle analisi del cruscotto** (chiesto dall'utente: «mettimi le date anche nelle analisi all'apertura dell'app»). Il selettore diceva «ultimi 3 mesi», che è un'**etichetta**: le date sono il dato, e non c'erano da nessuna parte.
  - **In testata** una riga sola: «Ultimi 3 mesi: **dal 20/05/2026 al 17/08/2026** · confronto con 19/02/2026 – 19/05/2026». Il **periodo di confronto** è la metà che mancava davvero: ogni «+12% sul periodo precedente» dei KPI si misura contro quello, e nessuno sapeva dove cominciasse.
  - Le date escono **col guscio**, prima delle analisi: `finestra()` è un calcolo puro sul calendario di Roma, senza database, quindi si può fare fuori dal `<Suspense>`. Chi apre la pagina sa su cosa sta guardando mentre i numeri si contano ancora.
  - **In ogni scheda** la riga `.scheda-periodo` sotto il titolo (Andamento, I brand uno per uno, Top categorie, Top tipi, Primi 5 per valore): una scheda letta da sola — o messa in uno screenshot — non è più ambigua.
  - ⭐ **Le date hanno scoperto un riquadro su un altro orologio**: «Da riordinare per primi» **non segue il periodo della pagina**, gira sempre sui `giorniStorico` dei parametri di riordino (56), anche scegliendo «ultimo anno». È giusto così — un'ipotesi di ordinativo si fa sul passo recente — ma affiancato agli altri sembrava parlare degli stessi giorni. Ora dichiara la sua finestra e il perché. La finestra si legge da `ipotesi.parametri.giorniStorico`, non da una costante ricopiata: se il default cambia, la data in pagina cambia con lui.
  - `intervalloIt(dal, al)` in [fuso.ts](../src/lib/fuso.ts): l'anno si scrive una volta sola dentro lo stesso anno («20/05 → 17/08/2026») e su entrambi gli estremi quando cambia («18/08/2025 → 17/08/2026») — «ultimo anno» scavalca il capodanno, e lì l'anno è l'informazione che distingue le due date.
  - **Verificato**: `tsc` exit 0, `next build` ok; HTML letto in dev sui dati veri per **28 / 90 / 365 giorni** — testata e sei schede con le date giuste in ordine di documento, il riordino sempre a 56 giorni (23/06 → 17/08) mentre le altre seguono il periodo, e l'anno che compare su entrambi gli estremi solo su «ultimo anno».
  - ⚠️ **Non verificato a occhio**: col pannello del browser non a schermo la pagina non fa layout e `getBoundingClientRect` torna zeri (stessa famiglia della trappola «tab in background»). Spaziature e resa su telefono restano **da guardare**.

- ⭐ **21/08/2026 — «Da cosa viene la differenza», e il confronto che pescava prima dell'archivio.** Trovata la sezione **finita al 90% e mai committata** dal 17/08 (`scomposizione.ts`, `Scomposizione.tsx`, `DalNegozio.tsx`, `riempi-aree.ts` + provincia/paese in `orders.ts` e i metafield in `shopify-collezioni.ts`): **`tsc` non passava**, quindi da quattro giorni nessuno poteva pubblicare *niente* di quest'app. Il tipo `Scomposizione` dichiarava `confrontoParziale` e la funzione non lo restituiva — **la stessa identica trappola del 17/08** (allora era `Freschezza`), due volte in due settimane: quando ci si ferma a metà in quest'app, ci si ferma esattamente qui, fra il tipo scritto e il calcolo ancora da fare.
  - **Il pezzo mancante era il più importante della sezione**, non un dettaglio: su «ultimo anno» il periodo di confronto arriva a **due anni fa**, ma il venduto in archivio comincia il **26/07/2025**. Il «prima» risulta quasi vuoto (**336 pezzi contro 6.605**) e la pagina annunciava **+895.692 €** e voci a **+2238%** — che non è una crescita, è **archivio che non c'era travestito da risultato**. Ora un avviso ambra **subito sotto la cifra**, non in fondo: «dei 365 giorni del "prima" ne mancano **338**… la differenza resta una sottrazione esatta, ma non è una crescita».
  - L'inizio dell'archivio si cerca **con lo stesso filtro** delle righe confrontate (buon fine, ambito del brand, esclusi e archiviati fuori): cercarlo su tutto il venduto risponderebbe a una domanda diversa da quella che si sta facendo. `giorniSenzaDati` si conta sul **calendario di Roma** (`giornoRoma`), non a millisecondi diviso 86.400.000, se no il cambio d'ora sposta il conto di un giorno.
  - **Verificato in dev sui dati veri, entrambi i rami**: a **365 giorni** l'avviso c'è, con 22/08/2024, 26/07/2025 e 338 giorni mancanti; a **90 giorni** è **assente** (il confronto parte dal 25/02/2026, dentro l'archivio) e `quadra` è vero. `tsc` exit 0, `next build` ok.
  - Il resto della sezione era già a posto e le colonne del database **erano già state migrate** (`provinciaSpedizione`/`paeseSpedizione` su `Vendita`, undici metafield su `Prodotto`): la lente **Area di consegna** è compilata sul **65% del venduto** e in dev mostra RM, MI, NA con «— non indicato —» dichiarato. La lente **Linea** si dichiara vuota invece di dire «100% senza linea».
  - ⚠️ **Regola per quest'app, terza volta che serve**: prima di aggiungere qualsiasi cosa, `git status` **e** `npx tsc --noEmit`. Il working tree di `scoutwt` è condiviso fra sessioni e può contenere una feature intera ferma a un errore di tipo — che non si vede aprendo la pagina, si vede solo compilando.

- ⭐ **21/08/2026 — l'avviso è salito accanto al numero grande** (secondo commit dello stesso giorno). Messo in produzione il primo, si è visto il difetto vero: **l'avviso stava a metà pagina e il «+2295%» in cima**. Su `/vendite` e sul **cruscotto** — che è la prima schermata dell'app — il KPI «Venduto» annunciava **+2295% sul periodo precedente** senza una parola, e chi legge un numero grande in cima non scorre per verificarlo. Un avviso che arriva dopo la cifra arriva **dopo che la cifra è già stata raccontata a qualcuno**.
  - Il calcolo è salito in `analizzaVendite` — cioè **nella stessa funzione che produce quel «+2295%»** — come campo `Analisi.confrontoParziale`, con l'aiuto condiviso `confrontoParzialeDi(finestra, dove)` in [vendite.ts](../src/lib/vendite.ts). `dove` è il **medesimo** filtro con cui il chiamante ha caricato le righe confrontate: cercare l'inizio dell'archivio con un filtro diverso risponderebbe a una domanda diversa da quella che si sta facendo. Un solo componente, [ConfrontoParziale.tsx](../src/components/ConfrontoParziale.tsx), lo scrive in tutte e due le pagine.
  - **Tolto dalla scomposizione**, dove l'avevo messo un'ora prima: sulla stessa pagina sarebbero stati **due riquadri ambra identici a mezzo schermo di distanza**, e il secondo insegna a saltare anche il primo.
  - ⚠️ **La query in più ha fatto cadere il cruscotto in `P2024`**: messa dentro il `Promise.all` di `analizzaVendite` diventava la **sesta** query in volo di una pagina che ne lancia già cinque (classifiche, panoramica, assortimento, riordino, sidebar) su un pool da **5 connessioni condivise fra tutte le app del cluster**. Ora si chiede **dopo** le righe, in fila: costa un giro su un indice e non toglie una connessione a nessuno. **Regola**: in quest'app una query nuova va aggiunta in coda, non in parallelo, finché non si è contato quante ne sono già in volo su quella pagina.
  - **Verificato in dev sui dati veri, tutte e cinque le finestre**: l'avviso compare **solo** su «ultimo anno» (confronto dal 22/08/2024, archivio dal 26/07/2025, **338 giorni mancanti**) e resta assente su 28, 56, 90 e **180** giorni — dove il confronto parte dal 25/08/2025, cioè **dentro** l'archivio. Quattro richieste di fila su `/?giorni=365` tutte a 200. `tsc` exit 0, `next build` ok.
  - ⚠️ **Trappola del server di sviluppo, non del codice**: dopo una decina di modifiche a caldo `next dev` accumula client Prisma e comincia a rispondere **500 con `P2024` su pagine che funzionano** — misurato **anche riportando `vendite.ts` alla versione di HEAD**, quindi non era la modifica. Si riconosce così (rimettere il file com'era e vedere se il 500 resta) e si risolve **riavviando `next dev`**. Senza quella controprova avrei corretto un difetto che non c'era.

- 🔴 **21/08/2026 — la rotazione girava e il sito restava fermo** (chiesto dall'utente: «la rotazione dei prodotti ha funzionato?»). Risposta misurata: **a metà**, e la metà che mancava era quella che si vede.
  - **Contato sul database**: due regole, entrambe `attiva` e con `spingiSuShopify = true`. «Rotazione Best Sellers» (mensile, 1 collezione) ultima corsa **11/08**, esito «1 collezioni, **1 mandate a Shopify**». «Rotazione Fiori» (settimanale, 3 collezioni) ultima corsa **17/08**, esito «3 collezioni, **0 mandate a Shopify**» — **senza un errore**.
  - **La causa**: in `eseguiRegola` il push era dietro `if (r.spingiSuShopify && c.tipo === "manuale")`, e «Fiori», «Rose» e «Bouquet & Cappelliere» sono `automatica`. È la **stessa regola sbagliata già smontata il 03/08** in `spingiOrdineSuShopifySilenzioso` — dove il commento spiega per esteso che su Shopify il `ruleSet` decide *chi entra* e il `sortOrder` decide *in che ordine*, e che una smart collection può avere `sortOrder: MANUAL`. Quel giorno la correzione era stata applicata **al bottone e non alla copia nel cron**.
  - ⭐ **Provato contro Shopify, non dedotto** (MCP sullo store `deluxy.it`): tutte e tre le collezioni hanno **`sortOrder: MANUAL`** — quindi il riordino sarebbe passato — e il negozio mostra ancora la fila **del 08/08**. Su «Rose» il sito e l'app concordano solo su **2 righe su 5** (il sito ha «Cento Rose Rosse» e «Mongolfiera Romantica» dove l'app ha «MAXI Bouquet Rose Dolce Metà» e «Regina di Cuori - RED»); su «Fiori» differisce la testa. **Controprova che il meccanismo è sano**: «Regali Best Seller» (manuale) ha sul sito **le stesse 5 righe nello stesso ordine** dell'app.
  - **Corretto**: il push non guarda più `tipo`. E l'esito non è più muto — le collezioni **saltate si dichiarano col motivo** (`EsitoRotazione.saltate`), perché prima una collezione senza regola d'ordine usciva da un `continue` silenzioso e il giro diceva solo «0 collezioni», che è un numero che non manda nessuno a cercare la causa.
  - ⭐ **Lezione riusabile: quando si smonta una regola sbagliata, si cercano tutte le sue copie.** Quella sul percorso automatico non ha nessuno che la guarda — un bottone che sbaglia lo si vede subito, un cron che salta in silenzio dura **due settimane**. Il segnale c'era e diceva la verità («0 mandate a Shopify»), ma un esito che è solo un numero non si legge come un allarme.
  - ⚠️ **Da qui in avanti il cron delle 05:20 scrive davvero su `deluxy.it`** per quelle tre collezioni: è quello che `spingiSuShopify = true` prometteva, ma non era mai successo. La prossima corsa di «Rotazione Fiori» è dovuta il **24/08**.

- ✅ **25/08/2026 — la rotazione scrive davvero sul sito: verificato sul negozio.** L'handoff del 21/08 chiudeva con «la prossima corsa di *Rotazione Fiori* è dovuta il 24/08»: è arrivata, e stavolta ha scritto.
  - **Contato sul database**: «Rotazione Fiori» ha girato il **24/08 alle 07:20** con esito **«3 collezioni, 3 mandate a Shopify»** — contro le **«0 mandate»** mute del 17/08.
  - ⭐ **Controprova sul negozio vero, non sullo specchio dell'app**: interrogata «Fiori» (`gid://shopify/Collection/404145766654`) col connettore Shopify, il sito mostra **le stesse cinque righe nello stesso ordine** che ha l'app — MAXI Cesto Rose Rosse · Sunflowers Balloon · Monet - Giardino a Giverny · Cappelliera Girasoli · Bouquet - Odissea — con `sortOrder: MANUAL`. Il 21/08 su «Rose» sito e app concordavano su **2 righe su 5**. Il record dell'esito l'abbiamo scritto noi: da solo sarebbe stato un silenzio, non una conferma.
  - **Fotografia del 25/08**: 4.610 prodotti (**1.100 attivi, tutti ancora senza costo**), 343 collezioni, **7.067 righe di venduto**, **area di consegna compilata sul 76%** (era 22% quando il riempimento leggeva i parametri sbagliati), 0 linee, 0 tipologie. Il cron dei 15 minuti regge da otto giorni (import alle 12:15, 12:01, 11:45, 11:30, tutti `ok`/`automatico`). `GET /api/v1/prodotti` risponde **401** senza chiave in produzione.
  - ⚠️ **Le API prodotti non sono ancora state esercitate su dati veri**: tutti e 4.610 i prodotti hanno `origine = "merchandising"`, quindi dalla piattaforma non è mai arrivato niente e il ramo POST resta provato solo in sviluppo.

- 🔍 **26/08/2026 — ricontrollo dell'handoff contro il database: due righe dicevano il falso.** Nessun commit di codice oggi; è stata riverificata la parte che una sessione nuova prenderebbe per buona.
  - ❌ **«`OPENAI_API_KEY` non è su Vercel, quindi il pulsante è disabilitato»** — la conclusione era falsa e **contraddiceva la lista «Già risolti» del 10/08** nello stesso documento. La chiave sta in **cassaforte** (`Impostazione`, è l'unica riga che contiene) e in produzione `/trend-ai` risponde **200 col pulsante acceso**. Riga corretta in STATO DEPLOY. ⚠️ Acceso ≠ provato: una lettura generata da un modello vero **non è ancora stata vista**.
  - ❌ **«giacenze: tutte le varianti a 0»** — su **9.637 varianti ne hanno una 3** (44 pezzi in tutto, messi a mano). La sostanza del punto aperto regge, il numero assoluto no. Corretto al punto 6.
  - ✅ **Confermati invariati**: 4.610 prodotti, **1.100 attivi e tutti e 1.100 senza costo**, 343 collezioni, **0 linee**, **0 tipologie**, **0 prodotti composti**, **0 unioni di riconciliazione**. `Torta Tisamisu Modena` è ancora `fase=in_vendita` e **non** esclusa dalle analisi (punto 5 aperto).
  - 🟢 **Salute**: 7.083 righe di venduto, area di consegna al **76%**, import ogni 15 minuti con **zero fallimenti nelle ultime 36 ore** (ultimo alle 17:15), produzione su `fra1`, `GET /api/v1/prodotti` che risponde **401** senza chiave. Rotazioni in orario: «Fiori» settimanale ha girato il 24/08 (3 su 3 mandate), «Best Sellers» mensile l'11/08 — **nessuna delle due è in ritardo**.
  - ⭐ **Perché è annotato**: questo documento avverte già che «metà dei punti aperti erano stati risolti e nessuno li aveva depennati». Il guasto simmetrico è **una riga che resta scritta dopo essere diventata falsa**, e nel caso della chiave OpenAI il documento si contraddiceva da solo in due punti distanti — chi legge lo STATO DEPLOY e non la lista dei risolti conclude che l'AI è spenta.

- 🔍 **26/08/2026 (pomeriggio) — AUDIT OSTILE dell'handoff contro il database: altre sette righe false.** Un revisore col mandato di *smentire* ha ripassato il documento riga per riga. **I numeri scritti in memoria il 26/08 hanno retto tutti** (4.610 / 1.100 / 343 / 7.083 / 76% / 0 linee / 0 tipologie), ma il documento ne conteneva altre sette sbagliate, tutte corrette qui sopra:
  - **I doppioni non sono 12 gruppi ma 236, per 525 schede** — e la pagina taglia a 100, quindi non li mostra nemmeno tutti. Il «12» era del 28/07 su 2.171 prodotti ed è stato **ricopiato dalla riscrittura del 10/08 senza ricontarlo**: proprio il guasto che quella riscrittura dichiarava di evitare.
  - **`_Additional Price` oggi si chiama «Extra» ed è già escluso** (l'import Shopify le ha riscritto il nome); il documento lo dava da archiviare **contraddicendo una sua voce del 27/07**. E **`Torta Tisamisu Modena` non è più prima per quantità**: sulla finestra di default è seconda.
  - **Il cookie è `sha256`, non HMAC** — STATO DEPLOY lo descriveva come già a posto mentre la revisione del 15/08 lo tiene fra i difetti aperti.
  - **STATO DEPLOY è ancora datato 26/07** e cita come corrente un deploy di un mese fa, saltando sei commit.
  - I numeri **1.024 attivi** e **6.821 righe** erano ancora presentati come «contato oggi».
  - **Quattro punti aperti non erano scritti da nessuna parte**: import collezioni fermo dal 04/08, `Collezione` (PLM maison) vuota, `pubblicataShopify` vera su tutte, SEO mai spinto sui prodotti. Aggiunti come punti 8-12.
  - ⭐ **Il rilievo che conta di più**: l'import delle collezioni è fermo da 22 giorni e **nessun cron lo lancia**. Il «1.100 attivi» — numero su cui poggia il punto aperto n.1 — è una fotografia dei negozi di tre settimane fa, e nessuna pagina lo dichiara. Per il venduto questo problema era stato risolto (`FreschezzaVenduto`); per il catalogo no.
  - ⚠️ **Sulle rotazioni, una precisazione onesta**: «entrambe in orario» è **letteralmente vero** (`mensile` = 30 giorni fissi in `eScaduta`, Best Sellers è a 15 giorni su 30) ma è **dedotto da un campo che si muove solo quando una regola scatta**: se il cron delle 05:20 fosse morto il 25/08, il database sarebbe identico fino al 31/08. Indizio a favore: `/api/cron/rotazioni` usa lo stesso `CRON_SECRET` di `/api/cron/vendite`, che gira ogni quarto d'ora. **Non è una prova.**
  - ⚠️ **Difetto latente trovato nel codice**: `ultimaEsecuzioneIl` si scrive a **fine** corsa (05:20:39) mentre il cron parte alle 05:20:00, e `eScaduta` usa `Math.floor` sui millisecondi. Se un giro parte prima di 05:20:39 la regola risulta a 6 giorni e viene **saltata**, slittando di un giorno. Non è ancora successo (17/08 → 24/08 sono 7 giorni esatti), ma il meccanismo è lì.
  - ✅ **Contro l'ipotesi ostile**: `tsc` passa, working tree pulito, `scout-ui` allineato a origin. Nessuna delle due trappole storiche dell'app (lavoro a metà non committato, tipo dichiarato e non restituito) è attiva.

## COME AVVIARE
```
cd deluxy-merchandising
npm install
npm run db:push && npm run db:seed
npm run dev   # http://localhost:3120
```
`npm run db:reset` per ripartire dai dati demo.

## STATO DEPLOY (26/07/2026)
- **Pubblicata**: https://deluxy-merchandising.vercel.app (progetto Vercel `deluxy-merchandising`, Postgres condiviso Supabase schema `merchandising`).
- **UI protetta da password** (`MERCHANDISING_APP_PASSWORD`, middleware + `/login`, cookie `mrc_session` = **`sha256("deluxy-merchandising::" + password)`**, digest NON chiavato — ⚠️ *«HMAC» era scritto qui e nel commento di `auth.ts`, ma il codice fa uno SHA-256 semplice; è lo stesso difetto che la revisione del 15/08 lascia aperto, non una cosa risolta*). Cambiando la password su Vercel **decadono tutte le sessioni** e serve un **nuovo deploy** perché il valore entri in vigore.
- **Deploy del 26/07/2026 fatto** (`deluxy-merchandising-9zbwyzdqx`): password nuova attiva e verificata in produzione, `ORDERS_URL`/`ORDERS_API_KEY` operativi (il pulsante «Importa da Ordini» è abilitato online), pagine `/vendite`, `/classifiche`, `/riordini`, `/trend-ai` verificate sul sito. Nota: il primo tentativo di deploy è fallito con `fetch failed` (errore di rete lato upload), il secondo è andato — se ricapita, basta rilanciare.
- ⚠️ **Riga corretta il 26/08/2026 — diceva il falso.** Prima qui c'era scritto «`OPENAI_API_KEY` non è su Vercel: il pulsante *Chiedi la lettura* resta disabilitato», e contraddiceva la lista «Già risolti» del 10/08 che dava la chiave per presente. **Misurato oggi**: la chiave sta in cassaforte nella tabella `Impostazione` (l'unica riga che contiene) e in produzione `/trend-ai` risponde 200 col pulsante **acceso**. Resta vero che la chiave **non** è fra le variabili di Vercel — l'app la legge dalla cassaforte, con l'ambiente che avrebbe comunque la precedenza. ⚠️ «Acceso» non vuol dire «provato»: il testo generato da un modello vero non è ancora stato visto (vedi la voce del 26/07).
- Lo schema del database è già allineato alle tabelle nuove (`prisma db push` eseguito sul Postgres condiviso il 26/07/2026).
- CLI Vercel autenticata come `donatodnicolo-gif`.

## MANCA / PROSSIMI PASSI

> **Riscritta il 10/08/2026 contando sul database**, non ricopiando la lista
> precedente: metà dei punti aperti del 28/07 erano stati risolti nel frattempo e
> nessuno li aveva depennati, il che è peggio di non averli scritti.

**Contato oggi**: 4.610 prodotti di cui **1.024 attivi su Shopify**, 343
collezioni, 6.821 righe di venduto, 3 negozi collegati e verificati.
> ⚠️ **Numeri del 10/08 — al 26/08/2026 sono 1.100 attivi e 7.083 righe di venduto.**

**Già risolti** (erano scritti come aperti qui sotto):
- ~~classificazione~~ → **2 prodotti attivi su 1.024** restano `DA_CLASSIFICARE`, e non hanno un Tipo sul negozio (`classifica-da-tipo.ts`, 07/08);
- ~~1.377 prodotti senza fornitore~~ → **0 fra gli attivi**: erano tutte schede archiviate;
- ~~`OPENAI_API_KEY` non configurata~~ → **c'è**, in cassaforte nella tabella `Impostazione` (non in `.env`, non su Vercel: si mette da `/impostazioni`);
- ~~il nostro SEO non arriva al negozio~~ → `spingiSeoSuShopify` in [azioni-seo.ts](../src/lib/azioni-seo.ts);
- ~~collezioni pubblicate senza prodotti~~ → **1 su 343** (erano 70);
- ~~il venduto si aggiorna solo a mano~~ → cron delle 05:00, vedi la voce del 10/08.

> **Ricontato sul database il 25/08/2026** — la lista qui sotto regge nella sostanza, ma i numeri
> del punto 1 sono cambiati: gli attivi sono **1.100** (non 1.024) e **restano tutti senza costo**,
> quindi il punto è più grande di prima, non più piccolo. Confermati anche **0 linee** e **0
> tipologie**. ✅ Nel frattempo si sono chiusi due punti che qui non comparivano: la **rotazione
> scrive davvero su Shopify** (verificato sul negozio il 25/08, collezione «Fiori» identica riga per
> riga) e l'**area di consegna** è passata dal 22% al **76%** delle righe di venduto.

**Aperti davvero al 10/08/2026**
1. **Costi di produzione: 1.100 prodotti attivi su 1.100 non ne hanno uno** (ricontato il 26/08/2026; erano 1.024 il 10/08). È l'unico punto rimasto che avvelena tutto il resto: `/costi` non ha niente da confrontare col target, le griglie non mostrano marginalità, ogni prodotto composto esce con margine non calcolabile. C'è già l'export CSV con gli stessi filtri della pagina, pensato per compilarlo in foglio di calcolo — **manca il reimport del CSV compilato**, che oggi non esiste.
2. **Linee: 0.** È l'ultima lente *nostra* rimasta vuota (`/linee` dice 0, tutti i prodotti in «senza linea»). Prima di assegnarle serve decidere **quali linee esistono**: è una scelta commerciale, non un lavoro di codice. Gli strumenti ci sono (assegnazione dalla riga in anagrafica, `vocabolarioPerAI()`).
3. **Scope Shopify mancanti sui tre token**: niente `read_publications` (quindi «solo pubblicate» è finto: in Vetrina entrano anche le collezioni tecniche, si sospendono a mano) e niente `read_locales` (l'elenco delle otto lingue è fisso e dichiarato in pagina). I token **hanno** `read_products`, `write_products`, `read_translations`, `write_translations`. Si aggiungono nelle app Shopify, poi si ri-verifica in `/impostazioni` e si reimporta.
4. **Funzioni mai usate su dati veri** (ricontato il 26/08/2026): 0 tipologie di collezione, 0 prodotti composti, 0 unioni di riconciliazione, **0 ipotesi di ordinativo congelate** (`PianoRiordino`) e **0 letture AI storicizzate** (`LetturaTrend`, in quattro mesi). ⚠️ **I doppioni non sono più 12 gruppi**: rieseguito `doppioniEvidenti()` sono **236 gruppi per 525 schede** (`sacher` 8, `colomba tradizionale` 8, `pandoro` 6, `panettone tradizionale` 6) — e la funzione taglia a `limite = 100`, quindi **la pagina non riesce nemmeno a mostrarli tutti**. Il «12» era del 28/07 su 2.171 prodotti, ed è stato ricopiato dalla riscrittura del 10/08 senza ricontarlo: esattamente il guasto che quella riscrittura dichiarava di evitare.
5. **Collezioni di servizio in vetrina** (ricontato il 26/08/2026). ❌ La parte sui prodotti **era falsa**: `_Additional Price` oggi **si chiama «Extra»** (l'import Shopify le ha riscritto il nome) ed è **già escluso dalle analisi** col motivo «Non è un prodotto» — è l'**unico** prodotto escluso di tutto il catalogo, e il documento lo diceva già alla voce del 27/07 contraddicendosi qui. `Torta Tisamisu Modena` **non è più prima per quantità**: sulla finestra di **default (90 giorni) è seconda** dietro «Monet - Giardino a Giverny», a 28 giorni non compare affatto, ed è prima solo a 56 giorni — i 75 pezzi sono un colpo unico ormai vecchio. ✅ **Resta vero per le collezioni**: «Globo basis collection - Do not delete» e «Smart Products Filter Index - Do not delete» sono indici dei temi, sono ancora `attiva`, e **le collezioni sospese in tutto il database sono 0** — sospenderle a mano non è mai stato fatto.
6. **Giacenze**: nessuna fonte di magazzino collegata. ⚠️ **Ricontato il 26/08/2026**: non è vero che siano «tutte a 0» — su **9.637 varianti ne hanno una 3** (Bouquet Ora Blu Medium 24 e Deluxe 8, Composizione Crepuscolo 12: **44 pezzi in tutto**, evidentemente messi a mano). Cambia poco nella sostanza — le ipotesi di ordinativo partono comunque da «scorta ignota» e propongono la copertura piena per tutto il resto — ma un numero scritto come assoluto e falso è il modo in cui una lista smette di essere creduta.
7. **SSO Hub** non agganciato; **fornitori** locali, da valutare se collegarli al registro Anagrafiche; **immagini** solo via URL.
8. ✅ **RISOLTO il 28-29/08/2026: cron notturno `/api/cron/collezioni` (un negozio per chiamata), verificato vivo il 04/09** — sotto, la segnalazione com'era. ~~🔴 **L'IMPORT DELLE COLLEZIONI SHOPIFY È FERMO DAL 04/08/2026**~~ (scoperto il 26/08 da un audit ostile — 22 giorni). **Nessun cron lo lancia**: `vercel.json` ha solo `/api/cron/vendite` e `/api/cron/rotazioni`, l'import si preme a mano da `/collezioni`. Conta più di quanto sembri, perché questo documento avverte già (voce del 03/08) che **`statoShopify`, `pubblicataShopify`, `ggDispMin`, il GID del prodotto, foto, prezzi e appartenenze si popolano SOLO reimportando** — quindi il «1.100 attivi su Shopify», che è il numero su cui poggia il punto 1 e mezzo cruscotto, **è una fotografia dei negozi vecchia di tre settimane**. Da decidere: un cron settimanale, o accettarlo e **dichiararlo in pagina** con la data dell'ultimo import (come si è fatto per il venduto con `FreschezzaVenduto`).
9. 🔴 **Il modulo «Collezioni & stagioni» — il PLM di maison, il primo che ogni descrizione dell'app elenca — è VUOTO**: `Collezione` ha **0 righe** e **0 prodotti su 4.610** hanno un `collezioneId`. Le «343 collezioni» di cui parla tutto il documento sono quelle **di Shopify** (`CollezioneShopify`), che è un'altra cosa. Non compariva in nessuna lista di punti aperti.
10. ⚠️ **`pubblicataShopify` è `true` su tutte e 343 le collezioni**, perché senza lo scope `read_publications` (punto 3) la lettura è best-effort e in mancanza mostra tutto. Quindi **ogni conto «solo le pubblicate» è in realtà un conto su tutte** — compreso il «collezioni pubblicate senza prodotti: 1 su 343» citato più su come risultato. Lo scope mancante era annotato; il suo effetto sui numeri no.
11. ⚠️ **Il SEO nostro è catalogato fra i «già risolti» ma non è mai stato esercitato sui prodotti**: `spingiSeoSuShopify` esiste, ma **0 prodotti su 4.610** hanno un `seoTitolo` nostro e **0** un `seoSpintoIl` (sulle collezioni sono 4 e 2). Codice sì, dati no.
12. ⚠️ **`VERSIONE_API = "2024-10"`** (`src/lib/negozi.ts`) è ~10 mesi oltre la finestra di supporto Shopify **su un'app che scrive sul negozio**, e i tre token non sono riverificati dal **26/07** (`verificatoIl` identico su tutti e tre). Il rinnovo a client credentials funziona — Gifts è stato rinnovato il 24/08 durante la rotazione — ma **l'unica scrittura provata di recente resta su Gifts**: su Flowers e Cake nessuna scrittura provata da un mese.

<details>
<summary>La lista com'era il 28/07/2026 (storico)</summary>

**✅ RISOLTO 03/08/2026 — con la strada (b): l'import crea le schede mancanti.** Vedi la
voce del 03/08 qui sopra: 2.273 prodotti creati, collezioni pubblicate senza prodotti da
70 a 24, «Torte Classiche» da 127 a 436 su 445. **Resta aperto** il seguito che ne è
emerso: 1.535 delle schede create sono **archiviate su Shopify**, quindi le collezioni in
Visual contengono prodotti che il cliente non vede — da distinguere/escludere nell'ordine.
Sotto, la segnalazione originale.

**⚠️ SEGNALATO 30/07/2026 — nelle collezioni da ordinare si vedono pochi (o zero) prodotti.**
La scheda `/visual/[id]` e le tipologie mostrano **solo i prodotti abbinati per SKU**
durante l'import (tabella `ProdottoInCollezioneShopify`), non tutti quelli che la
collezione ha davvero su Shopify. Misurato: **70 collezioni pubblicate su 343 hanno
zero prodotti qui** pur avendone su Shopify, e molte ne mostrano una frazione — es.
«Torte Classiche» 127 qui contro **440 su Shopify**, «MATRIMONI» 2 contro 34. È lo
stesso buco dell'abbinamento (2.060 prodotti di Gifts non agganciati, vedi «1.377
senza fornitore»): l'import lega per SKU di variante → codice → titolo normalizzato,
e quello che non combacia resta fuori. **Da fare**: (a) migliorare l'abbinamento
(provare il nome normalizzato, riusando `normalizza()` di `riconciliazione.ts`),
oppure (b) all'import leggere e salvare **tutti** i prodotti della collezione dal
lato Shopify (`collection.products`), non solo quelli già a catalogo qui, creando le
schede mancanti come fa `prodotti:da-vendite`. La pagina già dichiara «X prodotti
conosciuti»: il numero non è sbagliato, è la copertura dell'abbinamento a essere bassa.

**I tre che sbloccano il resto**
1. **Costi di produzione: nessun prodotto ne ha uno.** Conseguenze a catena, tutte già visibili: `/costi` non ha niente da confrontare col target; le griglie non possono mostrare marginalità; **ogni prodotto composto** creato in `/multi-prodotto` esce con costo «non lo sappiamo» e margine non calcolabile. Nell'anagrafica c'è già il filtro «senza costo di produzione» e l'export CSV con gli stessi filtri, pensato apposta per compilarli in foglio di calcolo — manca il **reimport del CSV compilato**, che oggi non esiste.
2. **Classificazione: 2.163 prodotti su 2.171 sono `DA_CLASSIFICARE`** e **nessuna linea è stata creata** (`/linee` dice 0, tutti i prodotti in «senza linea»). Categoria interna e linea sono le due lenti *nostre*: finché sono vuote, `/categorie`, `/linee` e metà delle griglie girano a vuoto. Gli strumenti ci sono tutti (classificazione dalla riga in anagrafica, vocabolario per l'AI in `vocabolarioPerAI()`); manca **l'AI che propone** la categoria leggendo le descrizioni — è il pezzo per cui il vocabolario era stato scritto.
3. **`OPENAI_API_KEY` non è configurata** (né su Vercel né in `/impostazioni`): la lettura AI del trend e la scrittura delle descrizioni sono verificate **fino alla chiamata** (con chiave finta l'app dice «Chiave OpenAI rifiutata (401)»), mai contro un modello vero. Blocca anche il punto 2.

**Lavori aperti sul catalogo**
- **1.377 prodotti senza fornitore e 1.382 senza categoria dal negozio**: sono le schede nate dai titoli del venduto che nessun negozio ha riconosciuto (l'abbinamento è per SKU). Da provare: abbinamento per **nome normalizzato**, riusando `normalizza()` di [src/lib/riconciliazione.ts](../src/lib/riconciliazione.ts). Oggi sono il gruppo più grosso di ogni vista.
- **Riconciliazione mai eseguita su dati veri** (⚠️ al 26/08/2026 i gruppi sono **236 per 525 schede**, vedi il punto 4): la pagina trovava **12 gruppi con lo stesso nome, 26 schede** (Saint Honorè × 3, Dom perignon × 2), ma nessuna unione è stata fatta — di proposito, la prima la fa una persona. Il giro «unisci → separa» non è quindi ancora stato provato end-to-end in produzione.
- **Nessun prodotto composto esiste ancora**: `/multi-prodotto` è stata provata fino al form di creazione, il `creaCompostoAzione` non è mai stato eseguito su dati veri.
- **Righe di servizio in classifica**: `_Additional Price` (2.145 pz a 1 €) e `Torta Tisamisu Modena` (75 pz a 1 €) sono supplementi di prezzo dei negozi, non prodotti, e occupano i primi posti per quantità. Si tolgono mettendoli in fase **Archiviato**: gli archiviati non entrano in classifica. Non si filtrano dal nome — sarebbe indovinare.
- **Collezioni tecniche in cima alle classifiche**: «Globo basis collection - Do not delete» e «Smart Products Filter Index - Do not delete» sono indici dei temi Shopify, non collezioni commerciali, e occupano i primi posti. Da sospendere come si è fatto con `_Additional Price`.

**Infrastruttura e integrazioni**
- **Giacenze**: nessuna fonte di magazzino è collegata, tutte le varianti importate hanno giacenza 0. Le ipotesi di ordinativo partono quindi da «scorta ignota» e propongono la copertura piena.
- **Shopify reale**: `src/lib/shopify.ts` costruisce il payload ma non scrive. Da collegare: `SHOPIFY_STORE_DOMAIN` + `SHOPIFY_ADMIN_TOKEN` e la chiamata `productSet`/`productCreate` all'Admin API (con conferma). Esiste un MCP Shopify in sessione utilizzabile per il primo collaudo.
- **SSO Hub**: non ancora agganciato (come le app senza flag `sso`).
- **Anagrafiche/Fornitori**: i fornitori sono locali; valutare se collegarli al registro centralizzato.
- **Immagini**: gli still-life sono via URL; nessun upload asset (placeholder ❀ se assente).

</details>

## NOTE
- Committato e pushato su `scout-ui` (search.git) il 24/07/2026; vendite/trend/riordini/AI il 26/07/2026; anagrafica, classificazione, collezioni Shopify, fornitori/categorie il 27–28/07/2026; **fasce di prezzo, riconciliazione, griglie e multi prodotto il 28/07/2026** (ultimo commit `181873cc`, tutto in produzione e verificato).
- **Come si verifica in produzione senza browser** (usato per tutte le pagine di questi giorni): il cookie di sessione è `mrc_session` = `sha256("deluxy-merchandising::" + password)`. Con quello si può fare `fetch` autenticato di qualsiasi pagina da uno script node e leggere l'HTML — più veloce e più affidabile che aprire il browser.
- Il preview `.claude/launch.json` locale definisce `merchandising` (3120); nel launch.json condiviso della sessione ci sono `merchandising` (3120) e `merchandising-3121`, utile quando un'altra sessione tiene occupata la 3120.
- **Trappola già pagata**: il calcolo del riordino è per **prodotto**, non per variante. La giacenza sta sulle varianti e si somma, ma il venduto non arriva sempre con la variante riconosciuta: distribuirlo "a occhio" sulle taglie darebbe quantità inventate, cioè ordini sbagliati al fornitore. Stessa logica per le righe vendute non riconosciute: restano senza prodotto invece di essere abbinate per somiglianza.
