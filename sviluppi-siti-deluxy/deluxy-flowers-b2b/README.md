# Deluxy Flowers for Business — tema Shopify

Replica su Shopify del sito B2B costruito su base44
(https://deluxy-floral-studio.base44.app/): stessi testi, stesse immagini, stessa
tipografia (Cormorant Garamond + Inter), stessi colori e stessi comportamenti
(header che si nasconde scrollando, immagini laterali che seguono il mouse nei
Servizi, schede dei Settori, filtri del Portfolio, modulo di richiesta in 4 passi).

È un tema **Online Store 2.0 completo e autonomo**: si carica come nuovo tema
(non tocca Impulse), tutte le sezioni sono modificabili dall'editor del tema.

## Struttura

| Cartella | Contenuto |
|---|---|
| `layout/theme.liquid` | scheletro della pagina, font Google, CSS e JS |
| `assets/theme.css` | tutto lo stile (token in `:root`: alabaster, obsidian, platinum, sage, sage-dark) |
| `assets/theme.js` | header, menu mobile, comparsa progressiva, servizi, settori, portfolio, form |
| `assets/b2b-*.jpg` | le 18 immagini del sito originale (scaricate da base44) |
| `sections/b2b-*.liquid` | le sezioni del sito, con blocchi modificabili |
| `sections/header.liquid`, `footer.liquid` | testata e piè di pagina (gruppi `header-group` / `footer-group`) |
| `templates/index.json` | home: hero, studio, servizi, progetti, settori, subscription, come funziona, invito |
| `templates/page.*.json` | le 5 pagine: `servizi`, `settori`, `progetti`, `come-funziona`, `richiedi-un-progetto` |
| `sections/main-generic.liquid` | pagine di servizio richieste da Shopify (prodotto, carrello, account…), sobrie |
| `dev/` | anteprima locale (non fa parte del tema): `npm install` poi `node render.js && node serve.js` → http://localhost:3230 |

## Come si mette in produzione

1. **Zip del tema**: comprimere il contenuto di questa cartella (senza `dev/`)
   — oppure usare `deluxy-flowers-b2b.zip` già pronto.
2. **Admin Shopify → Negozio online → Temi → Aggiungi tema → Carica file zip.**
   Il tema arriva come *non pubblicato*: si guarda in anteprima, non tocca il live.
3. **Creare le 5 pagine** (Negozio online → Pagine) con questi handle e assegnare
   il template corrispondente nel pannello «Modello» a destra:

   | Titolo | Handle | Template |
   |---|---|---|
   | Servizi | `servizi` | `page.servizi` |
   | Settori | `settori` | `page.settori` |
   | Progetti | `progetti` | `page.progetti` |
   | Come Funziona | `come-funziona` | `page.come-funziona` |
   | Richiedi un Progetto | `richiedi-un-progetto` | `page.richiedi-un-progetto` |

   I link del menu, dei bottoni e del footer puntano già a `/pages/<handle>`.
   Se si vuole un menu diverso, si assegna un menu di navigazione nelle
   impostazioni dell'Header e del Footer.
4. **Pubblicare** solo dopo la verifica visiva (regola d'oro: mai di iniziativa).

## Modulo «Richiedi un Progetto»

Usa il **modulo contatti nativo di Shopify** (`{% form 'contact' %}`): la richiesta
arriva via email all'indirizzo mittente del negozio (Impostazioni → Notifiche),
con tutti i campi (azienda, referente, email, telefono, settore, città, data,
tipo di servizio, spazio/evento, quantità, budget, descrizione, link reference).
I quattro passi e i controlli sui campi obbligatori sono in `theme.js`.

**Differenza dall'originale**: base44 permetteva di caricare immagini di
riferimento; il modulo contatti di Shopify non accetta allegati, quindi al loro
posto c'è un campo per i link (Drive, Dropbox, Pinterest…) e una nota che invita ad
allegare le immagini rispondendo alla mail di conferma.

## Immagini

Le immagini vivono in `assets/` e sono referenziate per nome nel campo
«File in assets» di ogni blocco. Per sostituirne una basta caricare un'immagine nel
campo «Immagine» dello stesso blocco: quella caricata ha la precedenza e passa dal
CDN di Shopify (`image_url` + `srcset`).

Due immagini dell'originale (`Fashion & Luxury` e il settore `Retail`) risultano
**cancellate anche sul sito base44** (404 sul loro storage): qui sono sostituite
rispettivamente con la foto degli Eventi e quella delle Boutique.

## Verifiche fatte

- `shopify theme check`: 0 errori (restano 3 avvisi «RemoteAsset» per i font Google,
  come in qualsiasi tema che usa Google Fonts).
- Tutti i JSON dei template e gli schema delle sezioni validati.
- Anteprima locale renderizzata con `dev/render.js` e controllata pagina per pagina.
