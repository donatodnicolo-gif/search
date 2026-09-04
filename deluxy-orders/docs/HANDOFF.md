# Handoff — Deluxy Orders

Stato al **04/09/2026** (sezione qui sotto; il corpo del documento
è del 30/07). Aggiornare a ogni tappa (regole di lavoro Deluxy). Serve a far
ripartire una finestra nuova senza contesto: prima lo stato, poi le **trappole
già pagate** — quelle valgono più dell'elenco delle funzioni.

> ✅ **RISOLTO (27/08, confermato dall'utente): `write_draft_orders` c'è.** I
> vecchi «PUNTI APERTI» qui sotto lo davano come mancante e bloccante per
> `/incassa` («Fatti pagare»). Non lo è più: il Customer Service crea ordini con
> `draftOrderCreate` (deluxy-messaging `src/lib/nuovo-ordine.ts`), che richiede
> proprio quello scope, e **i negozi condividono una sola app Shopify** (3 negozi,
> 1 `clientId`) → lo scope copre anche Orders. La sua `/incassa` può creare il
> link di pagamento. Ignorare le righe più sotto che lo danno per mancante.

## 04/09/2026 (sera) — LA SALUTE DELL'ORDINE: una parola su tutti e 14.563

Richiesta dell'utente: «assegna uno stato a tutti gli ordini» — conforme, a
rischio, non pagato, cancellati, nulli. Fatta, **in locale**, non pubblicata.

**Contato PRIMA di scrivere una riga** (è il motivo per cui la regola tiene):

| Salute | Ordini | % |
|---|---|---|
| Conforme | 13.818 | 94,9% |
| Nullo | 521 | 3,6% |
| A rischio | 124 | 0,9% |
| Non pagato | 61 | 0,4% |
| Cancellato | 39 | 0,3% |

**Dove si vede** — sempre, «Conforme» compreso: colonna «Salute» nell'elenco,
pillola su ogni card della vista **Colonne per brand** (in fila con evasione e
pagamento, così non allunga la card), pillola in cima alla scheda dell'ordine,
**striscia di cinque conteggi cliccabili** sotto i filtri
(contano dentro il filtro acceso), menu «Ogni salute», e campo `salute` nelle
API `/api/v1/ordini`. La pillola dice anche il perché: «Cancellato · magazzino»,
«A rischio · rischio alto».

### Le due cose che il dato NON dice, e cosa ha deciso l'utente
1. **171 ordini rimborsati senza essere annullati**: Shopify non registra
   nessun motivo, quindi **non si sa chi abbia chiesto il rimborso** — il
   cliente (nullo) o noi (cancellato). Decisione dell'utente del 04/09:
   **nulli**. È una scelta, non un dato, e nel codice è scritto così.
   🔴 **Si può smettere di indovinare**: Shopify espone la **nota del rimborso**
   e **chi l'ha emesso**, e la sync oggi **non legge i rimborsi affatto**
   (`src/lib/shopify.ts` chiede `cancelReason` ma niente `refunds`). Aggiungere
   il campo + backfill sui 171 è il modo di fondare quella riga su un dato.
2. **93 rimborsi parziali**: decisione dell'utente, **conformi** — l'ordine è
   avvenuto ed è stato pagato, il rimborso parziale ha già la sua coda
   (`problema=aperti`).

### Le trappole schivate (e come)
- ⚠️ **La regola scritta in due posti che divergono.** La pillola sulla riga la
  calcola in memoria, il filtro dell'elenco — che è **paginato** — la deve
  chiedere al database: due scritture della stessa frase. In `salute.ts` ogni
  regola porta insieme il suo `vale` (memoria) e il suo `dove` (Prisma), e
  `whereSalute` costruisce il filtro dalla stessa lista («la mia condizione, E
  nessuna di quelle che vengono prima»), così la precedenza è scritta una volta
  sola. **`npm run verifica:salute`** conta il registro in tutti e due i modi e
  confronta **ordine per ordine**, non i totali: al 04/09 **14.563 su 14.563
  coincidono**, nessuno esce da due filtri, nessuno resta fuori da tutti.
- ⚠️ **Il filtro che ne cancella un altro in silenzio.** `whereOrdini` scriveva
  già `where.annullatoIl` e `where.financialStatus` per i filtri `shopify`,
  `pagamento` e `problema`. Se la salute li avesse riscritti, accendere due
  filtri insieme avrebbe dato un elenco diverso da quello che dicono i menu.
  Va in `AND`. **Verificato dal vivo**: `?salute=nullo&shopify=validi` dà 171 —
  esattamente il gruppo dei rimborsi senza annullamento — e la zona filtri dice
  «Filtri (2)».
- ⚠️ **La colonna che finge di ordinare.** «Salute» non è una colonna del
  database: l'intestazione **non ordina** (stessa regola del 31/08 sul margine
  di /controllo). Per vedere una salute sola c'è il filtro, che chiede
  al database tutto l'archivio.
- ⚠️ **`annullatoIl: null` nel ramo dei rimborsi**: senza, i 22 ordini annullati
  da magazzino/staff *e poi* rimborsati diventavano «nulli», cioè colpa del
  cliente quando la decisione era nostra.
- ⚠️ **Le classi CSS senza regole** (trappola già pagata in questo repo): gli
  stili di `.badge-salute`, `.riga-salute` e `.chip-salute` sono in
  `globals.css` e usano solo token esistenti di `tokens.css` (verificati uno
  per uno).

> **Aggiunta subito dopo, su richiesta dell'utente**: nella vista **Colonne per
> brand** la pillola compariva solo sugli ordini storti. Ora c'è su tutte le
> card, «Conforme» compreso, dentro la riga di evasione e pagamento — non
> aggiunge una riga alla card (moltiplicata per centinaia di card sarebbe una
> vista più lunga di un terzo). Provato a 1500px e a 375px: niente scorrimento
> orizzontale, nessuna pillola esce dalla sua card sulle 39 provate.

### Cosa è stato tolto, e perché non si è perso niente
Nell'elenco il badge «rischio» e il badge «Annullato · motivo» **non si
ripetono più**: dicevano la stessa cosa della colonna Salute con due vocabolari
diversi, e nessuno dei due diceva niente degli ordini **non pagati**. Il motivo
resta scritto dentro la pillola, i motivi del rischio nel tooltip. In più la
colonna **Evasione ora parla anche sugli annullati**: prima al suo posto
compariva «Annullato», e nel frattempo nascondeva se la merce fosse partita o
no — che su un ordine annullato è proprio la domanda.

### File
`src/lib/salute.ts` (la regola, in un posto solo) · `src/components/BadgeSalute.tsx`
· `scripts/verifica-salute.ts` + `npm run verifica:salute` · `src/lib/ordini.ts`
(filtro `salute=` e campo `salute` nelle API) · `src/app/page.tsx` ·
`src/app/ordini/[id]/page.tsx` · `src/app/globals.css`.

**Verificato**: `tsc --noEmit` pulito, `next build` completa, `verifica:salute`
14.563/14.563, e dal vivo su `localhost:3150` (conteggi 13.818/124/61/39/521,
filtro «a rischio» → 124 righe tutte «A rischio», «cancellato» → 39 con il
motivo, combinazione con `shopify=validi` → 171).

### ✅ PUBBLICATO il 04/09 alle 21:42 — `deluxy-orders-t3gh4637x` (`dpl_2Xzdmbjj…`)

Push su `origin/scout-ui` (`57dbb223..59718132`) e deploy in produzione, dopo
l'ok dell'utente.

⚠️ **`vercel build --prod` NON funziona su questa macchina**: `EPERM: operation
not permitted, symlink 'login.func' -> …` (Windows senza i permessi per i
symlink — è il limite noto della macchina, non del progetto). Il deploy
precompilato di `/deploy` qui **non si può fare**: si è usato `vercel deploy
--prod`, cioè **build su Vercel** (~50 s di Build CPU, come tutti i deploy
precedenti di Orders).

**Verificato dall'esterno, in due modi indipendenti e senza fare login:**
1. `vercel inspect deluxy-orders.vercel.app` risolve a `dpl_2Xzdmbjj…`, cioè
   **l'alias segue il deploy** (non è il caso di Finance, dove il dominio era
   rimasto indietro di un giorno).
2. Il **CSS servito in produzione** (`/_next/static/css/f61f45657cfbcf6d.css`,
   raggiungibile dalla pagina di login che è pubblica) contiene `.badge-salute`,
   `.chip-salute`, `.riga-salute` e `.salute-a_rischio`: il codice nuovo è
   davvero là, non è un «Ready» che serve la versione di ieri.

⚠️ **Trappola pagata durante il lavoro**: `next build` lanciato mentre girava
`next dev` sulla stessa cartella riscrive `.next/` e fa cadere il server di
sviluppo in *Internal Server Error* (`Cannot find module './1331.js'`,
`routes-manifest.json` assente). Non è un errore del codice e non va cercato
lì: si spegne il dev server prima di buildare, e si riapre la pagina DOPO
l'ultimo comando lanciato.

## 04/09/2026 — Fotografia: l'app è LIVE al 31/08, e questo documento era indietro di tre giornate

Ripreso in mano il 04/09 («leggi l'handoff e aggiorna la memoria»). L'handoff si
fermava al **27/08**, ma nel frattempo erano entrate **tre giornate di lavoro mai
scritte qui** (28, 29 e 31 agosto): sono ricostruite più sotto dai commit.

**Cosa c'è in produzione.** `deluxy-orders.vercel.app` → deploy
**`deluxy-orders-kz9o5cysz`** del **31/08 alle 23:27**, `● Ready`. Alias
**verificato**: `vercel inspect deluxy-orders.vercel.app` risponde con quel
deploy — qui l'alias segue il deploy davvero (non è il caso di Finance, dove il
dominio era rimasto indietro). Dal 31/08 nessun altro deploy: **locale e
produzione coincidono**, non c'è lavoro fermo da pubblicare.

⚠️ Onestà sul metodo: il deploy è nato **7 secondi dopo** il commit `00fee53f`.
È un `--prebuilt` (la build gira prima, poi si carica l'output), quindi quasi
certamente contiene tutto — ma i metadati di un prebuilt **non portano lo sha di
git** e questo dai metadati non si può provare. L'unica cosa provata dal vivo è
il cron a 5 minuti (qui sotto).

### Contato sul database il 04/09 alle 20:44 (non ricordato)

|  | 30/07 | **04/09** |
|---|---|---|
| ordini | 14.027 | **14.562** |
| ordini con `costoFornitore` | 371 (3%) | **845 (5,8%)** |
| `TagCliente` confermati a mano | 0 | **0** |
| negozi attivi | 3 | **3** (+ `business.deluxy.it` ancora spento) |

- Ultimi 7 giorni: **113 ordini**.
- ⭐ **La sync a 5 minuti funziona in produzione, misurata**: l'ultimo ordine
  (**#1831**, cakedesign.me) è nato su Shopify alle **18:29:57 UTC** ed era in
  Orders alle **18:35:30** → **5 minuti e 33 secondi**. Prima della modifica del
  31/08 la mediana era 6,4 minuti e il caso peggiore 15,9.
- 🔴 **`TagCliente` è ANCORA vuota.** Il punto aperto n.2 (1.105 «probabili
  aziende» da confermare, **317.669 €** di venduto quasi certamente B2B contati
  come privati in Analisi e Marketing) **non si è mosso di una riga dal 30/07**.
  Finché si conferma un cliente alla volta non si smaltisce: serve la conferma in
  blocco dalla lista.
- Il costo fornitore cresce (371 → 845) ma resta una **fetta**: il margine
  misurato è vero su quella, non su tutto lo storico.

⚠️ **Il branch `scout-ui` è ahead 19 / behind 22 rispetto a `origin`.** Non è
roba di Orders (sono le altre app della cartella `scoutwt/`), ma chi pusha da qui
lo deve sapere prima: in questa cartella hanno lavorato più sessioni.

### Le tre giornate che mancavano

**28/08 — la guida visiva** (`c83aa7f1`): nasce `docs/guida-visiva.html`, la
guida per chi comincia, col «Registro delle funzionalità» da aggiornare a ogni
funzione nuova (regola 0-bis).

**29/08 — allineamento al Design System v1.4** (`59dd79de`, registro in
`afab7b9b`), con `architetto-ux` come custode: token, focus dorato sui campi,
intestazioni di tabella in tono minore, badge nella tinta tenue, bottoni e menu
uniformati alle app sorelle.

**31/08 — tre lavori in una sera:**

1. **Gli ordini arrivano in 5 minuti invece di 11** (`2babecdc`). Misurato PRIMA
   di toccare, su 91 ordini veri di sette giorni: Shopify→Orders mediana 6,4 min
   (90° 13,3, peggiore 15,9), Shopify→CS mediana 11,0 (peggiore 20,3). Non era
   lentezza: erano **due attese in fila, una per cron** (Orders leggeva Shopify
   ogni 15′, il CS leggeva Orders ogni 15′). Entrambi i giri passano a **5
   minuti**. ⚠️ Più spesso non vuol dire più carico: la lettura CS→Orders è
   incrementale (`aggiornatiDa`), un giro a vuoto costa una domanda e zero righe;
   la finestra su Shopify resta `giorni=2`, si guarda solo più spesso.
   ⚠️ **Il rimedio strutturale è un altro e NON è stato fatto**: un **webhook
   Shopify** verso Orders porterebbe l'attesa da minuti a **secondi**. Orders non
   ha una rotta webhook e i webhook vanno registrati sui tre negozi: è una cosa
   da fare insieme all'utente, non da accendere di nascosto. **Resta aperta.**
2. **SKU di 7 cifre sulle righe scritte a mano** (`2babecdc`). Le righe del Nuovo
   ordine che non vengono dal catalogo (titolo + prezzo a mano, riconsegne e
   preventivi compresi) partono con uno SKU casuale a sette cifre, così arrivano
   valorizzate alla piattaforma consegne. ⚠️ **Casuali e non progressive**: non
   c'è nessuna sequenza a cui appoggiarsi (la riga vive su Shopify) e un contatore
   su tabella condivisa da più app si scontra da solo. ⚠️ Mai `0000000`: sembra
   un campo non compilato, cioè proprio ciò che si sta evitando.
3. **Le tabelle si ordinano dalle intestazioni** (`c661e4f0`, `1b44114a`,
   `2f9e08cd`, `00fee53f`) — Libro UX&UI §8, su tutta l'app: ordini, controllo,
   incassa, script, automazioni, eventi, analisi, marketing, categorie, chiavi
   API, rubrica, schede cliente, coda quota. La riga si apre col click.
   ⚠️ **Tre trappole pagate lì, da non ripetere:**
   - dove l'elenco è **paginato o tagliato** l'ordinamento va nella **query**,
     non sull'array: ordinare le righe già estratte riordina solo la pagina che
     si sta guardando — una tabella che *sembra* ordinata e non lo è;
   - **spareggio sempre sulla data**: su una colonna con molti valori uguali
     (stato, evasione) senza secondo criterio l'ordine fra le pagine non è
     stabile, e la stessa riga può comparire due volte o sparire fra pagina 1 e 2;
   - le **colonne calcolate a schermo non fingono di ordinare**: il «Margine» di
     /controllo non è una colonna del database (lo fa `margineOrdine`), ordinarlo
     darebbe un ordine vero solo dentro la pagina corrente. Meglio nessun
     ordinamento che uno che mente.


## 27/08/2026 — Audit di sicurezza (red-team + verifica ostile): la porta esterna TIENE, due hardening

Su richiesta utente: un agente **red-team** ha cercato brecce (accesso esterno a
API non consentite, injection, SSRF, auth), un secondo agente **ostile** ha
demolito i rilievi prima di correggere.

⭐ **VERDETTO: nessuna breccia esterna.** Ogni rotta dati autentica PRIMA di
rispondere — `/api/v1/*` con la chiave (`autentica()`), `/api/cron/sync` con
`CRON_SECRET`, UI/CSV/server action dietro la password nel middleware.
Verificato **dal vivo** (401 senza chiave, 401 chiave falsa, read-key non
scrive, 307→/login per UI/CSV) e in codice. **Niente SQL injection** (raw query
tutte a segnaposto `$N`; `${SCHEMA}` viene da `DATABASE_URL`, non dall'utente),
**niente SSRF** (host dei `fetch` da env/DB fidati), **niente segreti** hardcodati,
e il **CVE-2025-29927** (bypass middleware) NON è sfruttabile (Next 15.5.21).

**Corretti (i 2 sopravvissuti alla verifica ostile):**
- **M3 — il cookie di sessione ora è un HMAC vero.** Era `SHA-256("deluxy-orders::"+password)`:
  non chiavato, quindi un cookie trapelato permetteva il **brute-force offline
  della password di team** (riusata su altre app → movimento laterale). Ora è
  **HMAC-SHA256 con `APP_SECRET`** (segreto server, Standard §4.4), via
  `crypto.subtle` (gira in Edge e Node). `src/lib/auth.ts`. ⚠️ **Impostato
  `APP_SECRET` su Vercel** (3 ambienti). ⚠️ Al deploy **le sessioni attuali
  cadono una volta** (i vecchi cookie SHA-256 sono rifiutati): tutti rifanno
  login. Corretto anche il commento che diceva «HMAC» quando non lo era.
- **B1 — header di sicurezza** in `next.config.ts`: `X-Frame-Options: DENY` +
  CSP `frame-ancestors 'none'` (niente clickjacking su /login), `nosniff`,
  `Referrer-Policy`. Niente CSP piena (romperebbe gli stili inline).

**Verificato**: `tsc` + `next build` ok; in locale il middleware accetta il
cookie HMAC (200), rifiuta il vecchio SHA-256 e l'assenza (307→/login), e i 4
header ci sono.

**Deliberatamente NON toccati (l'ostile li ha demoliti — non re-indurire):**
- **Rate-limiter sul login** e **`timingSafeEqual`**: over-engineering su
  serverless interno; la leva vera è una **`ORDERS_APP_PASSWORD` ad alta
  entropia** (🔴 azione dell'utente, non codice — disinnesca sia brute-force
  online sia offline). Il timing su rete è teorico e la toppa naïve rischia bug.
- **Scope per-endpoint delle chiavi**: oltre lo Standard; revoca (`attiva`),
  rotazione (`--rigenera`) e split lettura/scrittura ESISTONO già. Meglio:
  chiavi in cassaforte Hub + rotazione periodica (operativo, non codice).
- **CORS `*`, backstop auth nel middleware, messaggio d'errore del cron**:
  pattern benedetto dallo Standard e non sfruttabili (auth via header, non
  cookie; l'errore del cron lo vede solo chi ha già il `CRON_SECRET`).

## 27/08/2026 — Revisione UX a tre agenti (desktop + mobile + ostile), poi corretta

Passata su richiesta utente: un agente ha misurato il layout **desktop**, uno il
**mobile**, un terzo **ostile** ha demolito le segnalazioni prima di correggere.
Su 16 accuse: **2 cadute** (colonne kanban con scroll voluto; tabella-in-card con
`overflow-x` — pattern del DS, non difetti), 7 ridimensionate, **13 corrette**.

⭐⭐ **Il più grave, VERO: dal TELEFONO non c'era navigazione.** La sidebar era
`display:none` a ≤800px e l'hamburger cambiava solo `margin-left/opacity` (mai
`display`): un comando morto. L'unico link raggiungibile era il logo → «/». **Fix**:
su ≤800px la sidebar è un **cassetto** `position:fixed` che scorre da sinistra,
aperto dall'hamburger (`data-menu-aperto` su `<html>`), con velo (`.menu-backdrop`),
chiusura su Esc, sul tocco fuori e **al cambio pagina** (`usePathname`). Vedi
`ToggleSidebar.tsx` + il blocco `@media(max-width:800px)` in `globals.css`.

Gli altri 12, tutti in `globals.css` (un blocco «Revisione UX» in fondo) + `page.tsx`:
- **Bersagli del tocco** su ≤800px (i `<select>`/date NATIVI esclusi: il browser ne
  allarga l'area da sé — l'ostile l'ha fatto notare): alzati `.card-numero` (aprire
  l'ordine, era un link ~20px), `.stato-pill`, `.periodo-opz`, `.btn-testo` («salva»),
  `.btn.small`, e i gap a ≥8px.
- **Filtri**: 12 select sempre aperti seppellivano l'elenco sul telefono → ora
  collassano dietro il bottone **«Filtri»** (checkbox hack, niente JS) su ≤700px, e
  su desktop hanno larghezza uniforme.
- **Analisi/Margini**: i filtri Negozio/Confronto/Dimensione (classe `.scelta-vista`)
  sparivano sul telefono (`display:none`) senza sostituto → ora vanno a capo e
  restano usabili.
- **Righe di aiuto** (`.testo-guida`/`.page-sub`) senza `max-width` → ~180 car/riga
  su desktop: limite a 72ch. **Riga date «Dal…al»** che sforava a 375px → `flex-wrap`.
  **Pill «CS:»** senza forma → tinta a pillola come i badge. **Elenco vuoto** → link
  «Azzera i filtri».

Verificato: `tsc` pulito, `next build` completo, e sul dev server il markup nuovo +
le regole CSS compilate (drawer, touch target, filtri). ⚠️ Gli agenti UX **non
hanno il pannello browser** in questa sessione: hanno lavorato su HTML renderizzato
(curl) + analisi CSS deterministica + codice — affidabile per il layout.

## 26/08/2026 (2) — il QUARTO negozio: business.deluxy.it, creato ma ancora SPENTO

Chiesto dall'utente: «dobbiamo integrare business.deluxy.it».

**Cos'è**: `90bfeb-f5.myshopify.com`, «Business Deluxy», IT/EUR, Shopify Payments
attivo, 250+ prodotti a catalogo (B2B Colazione/Break/Lunch/Aperitivo, Boutique
Activation, regali personalizzabili, più fiori, torte e vini presi dagli altri
marchi). È il negozio **B2B**, e fino a oggi non esisteva per nessuna app del
gruppo: niente margine, niente consegna, niente Customer Service, niente CRM.

**Fatto**: creata la riga `NegozioShopify` `business.deluxy.it` →
`90bfeb-f5.myshopify.com`, colore `#0a84ff`, `brandRicerca =
business.deluxy.it`, `categoriaPredefinita = null` (vende tre cose insieme:
dedurre la categoria dal negozio scriverebbe «fiori» su una torta).

⚠️ **Client ID/Secret copiati dalla riga di deluxy.it, non scritti a mano**: i
tre negozi condividono **una sola app** della Dev Dashboard (misurato: 3 negozi,
1 solo `clientId`), quindi lo stesso Client ID/Secret vale anche per il quarto —
**purché l'app sia installata anche su quel negozio**.

🔴 **MANCA, ed è l'unico passo che non posso fare io**: verificare che l'app sia
installata su `90bfeb-f5.myshopify.com`. In Impostazioni → Negozi c'è il tasto di
verifica: se risponde col nome dello shop, si mette `attivo = true` e alla
prossima sync gli ordini entrano.

⚠️⚠️ **La riga nasce SPENTA di proposito.** Accesa, ogni giro del cron proverebbe
a coniare un token e — se l'app non è installata là — lascerebbe un errore a ogni
corsa, in mezzo a quelli veri. Un errore che si ripete ogni notte smette di
essere letto, e si porta dietro anche quelli che contano.

⚠️ Ho provato a coniare il token di prova da uno script per rispondere subito:
**bloccato dal classificatore di sicurezza** (manda Client ID e Secret a un host
esterno). Non l'ho aggirato — la stessa verifica la fa l'app, da dentro.

**Quando si accende, attenzione alla finestra**: `eseguiSyncOrdini(giorni)` di
default guarda 90 giorni indietro; `null` = tutto lo storico. Per un negozio
nuovo il primo import va deciso, non subìto.

**Il resto del giro** (fatto negli altri repo, stessa giornata):

- **Customer Service**: `business` si prova PRIMA di `deluxy` nelle regole di
  marchio — «business.deluxy.it» contiene «deluxy», quindi il quarto negozio
  veniva siglato **DL** e cercato come **deluxy.it**. Sigla nuova: **BS**. E lo
  smistamento delle mail per numero d'ordine ora pretende **un solo** ordine: la
  garanzia «zero numeri ripetuti fra i siti» era misurata su TRE negozi.
- **Ricerca fornitori** (repo search, su `main`): mappa `SHOP_BRAND` +
  `KNOWN_BRANDS` + opzione nel menu. La categoria per questo negozio **non si
  deduce**: si accendono fiorai *e* pasticcerie.
- **AI Mail**: `business.deluxy.it` nell'enum dei negozi.
- **Budgets e Merchandising: nessuna modifica, verificato.** Merchandising ricava
  i brand dal venduto (`distinct` su `Vendita.canale`), Budgets elenca a parte i
  brand senza maison invece di sommarli di nascosto. Il quarto negozio comparirà
  da solo, e in Budgets comparirà come **brand senza maison**: decidere se
  «Business» è una maison sua o parte di Deluxy.it è una scelta di business, non
  una deduzione.

## 26/08/2026 — `/api/v1/ricavi` espone l'economia della vendita (fee + primo margine), per il consuntivo di Budgets

**Richiesta dell'utente** (a Budgets): «per maison per il consuntivo prendi da
orders: le vendite lorde degli ordini, le fee incassate dai partners come
commissioni, la differenza tra pagato e valore dei prodotti a cui togliere iva
che dovresti trovare come primo margine». I dati ci sono da stamattina — i
commit `ad8ad45a` e `6a1d3a56` (altra sessione) hanno aggiunto allo schema
`primoMargine`, `feeVendita` e `margineFinale`, che la piattaforma consegne
manda già calcolati via PATCH — ma nessuna rotta aggregata li esponeva.

Ora `/api/v1/ricavi` risponde, per brand e per mese, anche con `fee` (somma
delle commissioni incassate dai partner, lorde) e `primoMargine` (somma di
(pagato − valore prodotti) ÷ 1,22, quindi **netto IVA**), con la **copertura
dichiarata**: `ordiniConEconomia` e `lordoConEconomia`, totali e mese per mese.
Somme sui **soli ordini col dato**. Al momento della modifica la copertura era
**ZERO su tutti e tre i brand**, ma il primo giro della piattaforma stava
scrivendo proprio in quelle ore: fra due query a mezz'ora di distanza gli ordini
col dato sono passati da 0 a 511 a 751 (deluxy.it/Flowers/cakedesign). ⚠️ È la
[[trappola-verifica-rimandata-al-cron]] vista dal lato buono: una misura di
copertura scattata durante il giro è una fotografia mossa — si dichiara l'ora, o
si rimisura a giro finito. Chi legge zero ordini col dato deve mostrare **n.d.,
non zero**.

⚠️ Le **basi sono tre e non tornano a occhio**: lordo IVA inclusa, fee lorde,
primo margine netto IVA. Ogni consumatore le deve dichiarare (è la stessa
lezione del 25/08 sulla percentuale senza base).

**Verificato**: `tsc` pulito, `next build` ok; la query con `FILTER` provata sul
database vero (è la stessa con cui è stata misurata la copertura).

## 25/08/2026 (pomeriggio 3) — La percentuale è il margine netto SUL TOTALE PAGATO (32,8%, non 40%)

**Decisione dell'utente**, dopo la sua domanda «81,97 su 250 non fa 40%»: la
percentuale del margine si calcola **sul totale che il cliente ha pagato**, non
sull'imponibile. Un ordine da 250 € con 150 € di costo fa **81,97 € · 32,8%**.
Si legge «di ogni 100 € incassati me ne restano 32,80, IVA e fornitore pagati».

Le due basi restano diverse **apposta** (valore netto, base lorda) — ed è la
lettura di chi guarda lo schermo: il conto si rifà a mente con i due numeri che
si vedono. La regola sta in **un posto solo**, `margineOrdine()` in
`controllo.ts`: `pct = valore / totale`.

⚠️⚠️ **LA CONSEGUENZA CHE NON SI PUÒ DIMENTICARE: l'atteso non è più
`100 − quota`.** Con la quota fornitore al 60% l'atteso non è 40% ma
**40 ÷ 1,22 = 32,8%**. Se si scorpora il margine e NON la soglia, ogni numero
risulta «sotto le attese» e `/margini` diventa rosso a torto. La soglia ha ora
la sua funzione, accanto all'aliquota: **`margineAttesoPct(quota)`** in
`controllo.ts` — usata dal colore e dalla scritta «atteso 32,8% con la quota del
60%», e citata sulla scheda dell'ordine.

⚠️ **Secondo effetto, dichiarato a schermo invece che scoperto**: `costo
fornitore %` e `margine %` **non fanno 100 fra loro** (44,0% + 45,9% ≠ 100). Il
costo è lordo su lordo, il margine è netto su lordo. È scritto nella nota in
fondo a `/margini`, perché è esattamente il tipo di scarto che fa pensare a un
errore di somma.

**Toccato**: `margineOrdine.pct` e `margineAttesoPct` (nuova) in
`src/lib/controllo.ts`; `calcola().pctMargine` in `src/lib/margini.ts`;
`coloreMargine` + KPI + nota in `/margini`; scheda ordine («· 32,8% del totale»
e la riga che nomina base e atteso); suggerimenti di elenco e `/controllo`;
`marginePct` nelle API (stessa base, commentata).

**Verificato**: `tsc` pulito, `next build`, pagine lette nel DOM col build di
produzione — #2798 «81,97 € · 32,8% del totale»; `/margini` **2.365,57 € su
5.152,15 € incassati** e **45,9%** (che è esattamente 2.365,57 ÷ 5.152,15),
atteso 32,8%.

## 25/08/2026 (pomeriggio 2) — «81,97 su 250 non fa 40%»: aveva ragione lui, e due didascalie mentivano

Domanda dell'utente davanti al margine di un ordine. Il conto era **giusto** e la
schermata **illeggibile**: 40% è `81,97 ÷ 204,92` (margine netto ÷ **imponibile**),
ma l'imponibile **non compariva da nessuna parte** — a schermo c'erano solo
81,97 € e 250 €, e con quei due numeri viene 32,8%.

⭐⭐ **La lezione: un valore NETTO e una percentuale accanto a un totale LORDO
sono due basi diverse nello stesso sguardo.** Chi legge divide per il numero che
ha davanti; se la base non è scritta, il numero giusto sembra sbagliato — e la
fiducia nel dato se ne va prima della spiegazione. La regola nuova, valida per
ogni app: *quando una percentuale non ha la sua base a schermo, scrivila accanto.*

**E cercando la base sono uscite due didascalie diventate false** il 25/08,
quando il margine è passato al netto IVA — nessuno rilegge le scritte sotto un
numero quando cambia la formula:
- scheda ordine: sotto il margine c'era **«sul lordo, IVA e spedizione incluse»**;
- `/margini`, in fondo: **«qui non si scorpora niente e questo è un margine sul
  lordo»** — mentre `calcola()` scorpora dal 25/08 (l'handoff dava la nota per
  aggiornata: era stata corretta quella nel **modulo**, non quella **a schermo**).

**Fatto** (commit `d9beaf13`, LIVE):
- `margineOrdine()` torna anche **`imponibile`** (totale ÷ 1,22): la base esce
  dalla funzione unica, nessuna pagina se la ricalcola;
- scheda ordine: «· 40% **dell'imponibile**» + riga «la percentuale è
  sull'imponibile (204,92 €), non sul totale lordo (250,00 €)»;
- `/margini`: KPI «Margine misurato **(netto IVA)**» con «su 4.151,72 €
  imponibili (5.065,10 € lordi)» — ora il KPI «Margine %» (56,2%) torna con la
  divisione che uno fa a occhio; nota di fondo riscritta;
- elenco e `/controllo`: la base sta nel suggerimento del chip;
- `calcola()` in `margini.ts` espone **`imponibileConCosto`**.

**Verificato**: `tsc` pulito, `next build`, pagine lette nel DOM col build di
produzione — #2798 «81,97 € · 40% dell'imponibile», `/margini` 2.335,20 € su
4.151,72 € imponibili.

## 25/08/2026 (pomeriggio) — DOVE SI È FERMATO IL GIRO, e chi comanda quando le due strade si incrociano

**Contato adesso sul database di produzione** (non ricordato): **14.402** ordini,
15 nelle ultime 24 h, **405** con un costo (finance 249 · causale 140 ·
**customer-service 16**). Produzione viva, `/api/health` risponde `ok`.

**✅ Il percorso A è VIVO e sta lavorando** — è la notizia nuova, e nessun
documento la diceva: **9 ordini `fornitore_diretto`**, di cui **8 col costo dal
Customer Service**, tutti fra la sera del 24/08 e il 25/08. Il Customer Service
trova il fornitore in chat, registra il costo, e il margine si calcola.

**🔴 Il percorso della piattaforma è partito e si è fermato a metà, e adesso si
sa DOVE.** Guardando la piattaforma (schema `platform`, stesso cluster) le
vendite con `source = deluxy-orders` sono **66** e stanno tutte così:

| stato vendita | quante | partner assegnato |
|---|---|---|
| `da_gestire` | 43 | nessuno |
| `proposta` | 23 | sì, ma nessuna risposta |
| `accettata` | **0** | — |

Tutte create in **un batch solo il 24/08 fra le 9:49 e le 9:54** (il suo
`orders-sync` lanciato a mano), e **mai più toccate**. Da qui discende tutto il
resto: **0 costi da `piattaforma`**, **0 consegne**, cursore `piattaforma.ritiroDa`
fermo al 24/08 09:54. **Il ritiro di Orders non ha nessun difetto: non ha nulla
da ritirare.** Si sblocca **dalla piattaforma** (far accettare le proposte, o
proporre le 43 senza partner), non da qui.

**⭐ TROVATO UN ORDINE SU DUE STRADE, e la regola che mancava.** Delle 66 vendite,
65 corrispondono a ordini con `evasione='piattaforma'` e **una no**: **#2790**
(Flowers, 85 €). La sua storia, per esteso: 9:31 importato → 13:30 «smistato
dalla piattaforma» → 15:50 il CS lo mette `in_pagamento` → 15:59 il CS registra
50 € di costo (Ratschiller Erika). Il CS **se l'è ripreso in chat** e l'ordine
oggi è `fornitore_diretto`, mentre sulla piattaforma la sua vendita è ancora lì,
`da_gestire`.

Il codice del ritiro, com'era, **avrebbe riscritto `fornitore_diretto` con
`piattaforma`** al primo aggiornamento di quella vendita: controllava solo
`evasione !== "piattaforma"`. Il costo era protetto («la mano batte il ritiro»),
l'evasione no. **Corretto** (`src/lib/piattaforma.ts`): se il CS ha già deciso
`fornitore_diretto`, il ritiro **non tocca il campo**, conta il caso in
`esito.conflitti` e scrive una riga nella storia dell'ordine («Conflitto di
strada: …», una sola per stato della vendita — il cursore rilegge le stesse
vendite a ogni sovrapposizione e una storia di righe identiche non la legge
nessuno).

**✅ E adesso il giro SI VEDE, senza aprire il database.** Nuova scheda in
**Impostazioni → «Il giro dell'ordine (piattaforma consegne)»** che **conta** a
ogni apertura: smistati dalla piattaforma · **col costo tornato indietro** (in
rosso se è 0 mentre gli smistati non lo sono) · consegnati · evasi da fornitore
diretto (e quanti col costo) · **ordini su due strade** · data dell'ultima
notizia dalla piattaforma. Oggi legge: **65 · 0 · 0 · 9 (8 col costo) · 0 ·
24 ago 26**, con l'avviso «il giro è partito e si è fermato a metà».

⭐⭐ **LA TRAPPOLA PAGATA QUI, e vale per tutte le app**: l'esito del ritiro
esisteva solo dentro la **risposta JSON del cron**, che non apre nessuno. Per un
mese i documenti hanno continuato a dire «fino ad allora il ritiro legge un
elenco vuoto» mentre aveva già smistato **65 ordini**. *Un numero che non ha una
schermata non è misurato: è ricordato.* La scheda nuova non può invecchiare
perché non racconta cos'è successo — conta cosa c'è.

**⚠️ Restano fermi, e non sono novità:**
- **`QuotaRegola` è VUOTA (0 righe)**: `/api/v1/quota-fornitore` risponde sempre
  col default 60% e la cascata provincia+categoria → provincia → default non ha
  niente su cui cascare. La UI di gestione non esiste, si popola via SQL.
- **`smistamento` è vuoto su tutti i 14.402 ordini**: nessuno è mai stato
  riservato al CS, quindi l'interruttore di governo non ha mai governato niente.
- **`csGestione` sta su 12 ordini** (8 `in_pagamento`, 4 `gestito`), e **3 dei 4
  chiusi non hanno il costo** → dicono «margine n/d». Il campione è minuscolo.
- **Da fare sulla piattaforma (non qui)**: il suo `orders-sync` dovrebbe
  **saltare** gli ordini già `fornitore_diretto`, altrimenti continuerà a
  crearne, di vendite orfane come quella di #2790.

**Verificato prima del commit**: `tsc --noEmit` pulito, `next build` completo,
app avviata in locale (`next start`) e scheda letta nel DOM coi numeri veri.
⚠️ `prisma generate` fallisce con `EPERM` se un'altra sessione tiene un
`next dev` aperto sulla cartella: si costruisce con `npx next build` (lo schema
non è cambiato).

## 25/08/2026 — Il margine è al NETTO IVA (scorporo 22%, un posto solo)

Su richiesta dell'utente: il **margine reale** si calcola **al netto dell'IVA**.
«Togliere il 22%» da un importo IVA-incluso è uno **scorporo** (÷ 1,22), non un
−22% (× 0,78). Applicato **una sola volta**, in `margineOrdine()`
(`src/lib/controllo.ts`, costante `ALIQUOTA_IVA = 22`): API, scheda ordine,
elenco e `/margini` lo ereditano.

- **`margineOrdine` ora torna anche `pct`** (margine reale in %). La % **non
  cambia** con lo scorporo — l'IVA colpisce ricavo e costo alla stessa aliquota,
  quindi resta `(totale − costo)/totale`; cambia solo il valore in euro. #2791:
  85 − 50 = 35 lordo → **28,69 € netto · 41%** (verificato in produzione via API
  e in lista).
- **Un posto solo, davvero**: ho ritrovato e instradato su `margineOrdine` gli
  ULTIMI due calcoli inline — il mio `MargineChiuso` in `page.tsx` (l'avevo
  aggiunto ieri a mano: era il 4° calcolo, l'errore che il commit «l'API
  calcolava il margine a mano» aveva già pagato) e la colonna del `/controllo`
  (`totale − costoFornitore` lordo). Serializzazione: una sola chiamata
  (`const mrg`), non tre; l'API espone `controllo.marginePct`.
- **`/margini` (aggregato)**: `calcola()` scorpora `margine` e `margineAtteso`;
  `pctMargine` invariato. Aggiornata la nota storica che diceva «non si scorpora
  niente perché fiori e torte hanno aliquote diverse».

⚠️⚠️ **DECISIONE ESPLICITA DELL'UTENTE — aliquota UNICA 22% su tutto.** Il codice
diceva (a ragione) di NON scorporare un'aliquota unica perché **fiori e torte in
Italia sono di norma al 10%**, non 22%. L'ho segnalato all'utente (il margine
reale su fiori/torte risulta più basso del vero): ha scelto **22% su tutto**,
consapevolmente. Se un giorno serve l'aliquota per categoria/brand, il punto è
`ALIQUOTA_IVA` in `controllo.ts` — l'unico che scorpora. I **ricavi**
(`/api/v1/ricavi`) restano **lordi** apposta: la regola è sul margine, non sul
venduto.

## 24/08/2026 sera — Il giro dell'ordine entra in Orders (Standard §7.4)

Quattro pezzi nuovi, costruiti insieme al canale app-to-app della piattaforma:

1. **Il ritiro dalla piattaforma** (`src/lib/piattaforma.ts`, chiamato in OGNI
   giro del cron): legge `GET {PLATFORM_URL}/api/v1/app/vendite?source=deluxy-orders`
   (pull incrementale su cursore `piattaforma.ritiroDa`) e scrive sull'ordine:
   `evasione='piattaforma'`, il costo del fornitore quando il partner ACCETTA
   (`costoPartner` = importo − sconto cristallizzato, `costoDa='piattaforma'`,
   mai sopra una decisione già presa), `consegnataIl/consegnataDa` quando la
   consegna è fatta. Env: `PLATFORM_URL` + `PLATFORM_API_KEY` (già su Vercel,
   chiave generata con `crea-chiave-app.mjs` della piattaforma). ⚠️ Il flusso
   si accende davvero quando la piattaforma PESCA gli ordini (il suo
   `orders-sync` con `applica=true`, oggi manuale/admin): fino ad allora il
   ritiro legge un elenco vuoto, e va bene così.
2. **La quota per provincia** (`QuotaRegola`: provincia+categoria → percento;
   cascata provincia+categoria → provincia → default):
   `GET /api/v1/quota-fornitore?provincia=CE&categoria=torte` risponde quota,
   `regola` (da dove viene il numero) e l'atteso. Vale per i fornitori in
   chat; gli smistati hanno lo sconto sulla vendita della piattaforma.
   ⚠️ La tabella si popola via Prisma/SQL: la UI di gestione non c'è ancora.
3. **Evasione e consegna sull'ordine** (`evasione`, `consegnataIl/Da`,
   `costoConsegna`/`feeConsegna` per quando la piattaforma esporrà i costi):
   il PATCH v1 accetta dal CS solo `evasione='fornitore_diretto'` e la
   consegna (percorso A) — `piattaforma` la scrive solo il ritiro: due mani
   sullo stesso campo con la stessa parola sono un conflitto invisibile.
4. **Il margine esce dalle API** (`margineOrdine` in controllo.ts, esposto da
   `serializzaOrdine`): `totale − costoFornitore` (− costoConsegna + fee sulla
   consegna nostra); `null` = manca il costo, `parziale` = manca un
   ingrediente della consegna. La formula vive SOLO qui.

5. **Il GOVERNO dello smistamento** (`Ordine.smistamento`, deciso dall'utente):
   `"manuale"` = il Customer Service se lo tiene e l'orders-sync della
   piattaforma lo salta (esito `riservato-al-cs`, mai un salto silenzioso);
   `""` = può andare in automatico. Lo scrive il CS via PATCH
   (`smistamento: "manuale" | "auto"`), esce da `serializzaOrdine`, e la
   piattaforma lo legge da qui: il registro è il punto d'incontro, CS e
   piattaforma non si parlano direttamente. Un ordine già evaso per
   fornitore diretto è comunque fuori dall'automatico, con o senza flag.

**Deciso e scartato**: il `productId` Shopify sulle righe — richiederebbe lo
scope `read_products` che ha già fatto fallire import interi (ACCESS_DENIED,
commento in shopify.ts); lo smistamento della piattaforma matcha per SKU e
non ne ha bisogno. **Completato**: il drop delle colonne orfane di
`FeedbackOrdine` (col `db push` di stasera: 6 colonne con 1 valore ciascuna,
copie che la fonte ha).

## 24/08/2026 — Audit architettura: copie ridotte, annullamenti non più muti

Cinque interventi dall'audit di conformità (il rapporto per app sta
nell'artifact «Architettura Dati Deluxy», §7):

1. **`FeedbackOrdine` non è più una copia: è un riferimento coi codici.**
   Tolte dalla tabella e dall'import le colonne coi contenuti del Customer
   Service: `clienteNome/Email/Telefono`, `descrizione`, `azioni`, `esito`,
   `testo`, `colpaNome`, `soggettoNome`. Restano l'identità (`idEsterno`),
   l'aggancio all'ordine e i codici per contare (tipo, stato, casistica,
   colpaTipo, gravità, voto, origine, soggettoTipo). La scheda ordine mostra i
   codici e rimanda al Customer Service per il racconto. ⚠️ Le colonne nel
   database cadono al prossimo `prisma db push` (chiede conferma perché
   contengono dati: sono copie, la fonte le ha tutte).
2. **`MovimentoBanca` resta, ed è una scelta dichiarata.** L'audit chiedeva di
   ridurlo a riferimento, ma l'abbinamento cerca DENTRO descrizione e
   controparte di tutto l'estratto (~11.000 movimenti in memoria): a domanda
   non si può fare. In cambio la completezza ora si **misura**: il riepilogo in
   Impostazioni confronta il totale locale col `totale` dichiarato da Finance
   (`/api/v1/movimenti?limit=1`) e segna in rosso lo scarto — una sync non si
   verifica dall'ultima data.
3. **Gli annullamenti non sono più silenziosi per chi tiene copie.**
   `GET /api/v1/ordini?annullatiDa=<ISO>` restituisce solo gli ordini annullati
   da quel momento (con `annullatoIl`), così un lettore (Customer Service,
   Merchandising, Marketing) ritira le sue righe. Prima un ordine annullato
   spariva dall'elenco e la copia a valle restava valida per sempre.
4. **La UI è fail-closed in produzione**: senza `ORDERS_APP_PASSWORD` su Vercel
   l'app risponde 503 invece di aprirsi (prima si apriva: 14.000 ordini a un
   typo di variabile dalla rete). In locale senza password si lavora come prima.
5. **`/api/health` sta fuori dal middleware** (return anticipato): nessuna riga
   futura del ramo `/api` può metterle un cancello davanti per sbaglio.

**Deciso e rimandato**: i webhook Shopify (`orders/create|updated|cancelled`
con verifica HMAC) al posto del solo polling a 15′ — richiedono la
registrazione sui 3 negozi e un segreto per negozio; il polling oggi basta.

> 🏛️ **ARCHITETTURA (OBBLIGATORIA, Standard Deluxy §7)** — Il ruolo di QUESTA
> app nel giro dell'ordine D2C: **registro e controllo economico**. Il
> **margine si calcola SOLO qui** (`incassato − costoFornitore` per la
> consegna del fornitore; `− costoConsegna + fee` per la nostra, con costo e
> fee ritirati dall'incarico della piattaforma; ingrediente mancante = «non
> calcolabile», mai zero). Il Customer Service PROPONE la gestione via PATCH
> (chiave con scrittura, `costoDa='customer-service'`: le decisioni prese qui
> non si sovrascrivono). **Da costruire qui**: il `productId` Shopify sulle
> righe (c'è nel payload: serve al riconoscimento del prodotto UNICO),
> `gestioneTipo` + campi consegna, il pull dello stato consegne dal cron, la
> formula del margine esposta via `/api/v1`.


## 24/08/2026 (sera) — Orders RICEVE lo stato di lavorazione dal Customer Service

Primo pezzo della roadmap qui sopra: Orders ora può **ricevere e mostrare** lo
stato di lavorazione che il Customer Service decide su un ordine (§7.2: il CS è
il decisore dell'evasione). Prima Orders mostrava solo la **propria pipeline**
(`statoId`: Nuovo/…) e i **codici dei feedback**; lo stato «come lo stiamo
lavorando» (`gestito`, `da_gestire`, `in_pagamento`, `ricerca_fornitore`,
`attesa_consegna`, `comunicazione`) viveva **solo** in deluxy-messaging.

- **Schema**: tre campi nuovi su `Ordine` — `csGestione`, `csGestioneDa` (nome
  denormalizzato), `csGestioneIl`. La sync da Shopify **non li tocca** (non sono
  un dato Shopify).
- **PATCH `/api/v1/ordini/:id`** accetta `csGestione` (+ `csGestioneDa`,
  `csGestioneIl`); `""`/`null` azzera anche chi e quando. Lascia una riga nella
  storia («lavorazione CS: gestito — …»).
- **API**: `serializzaOrdine` espone il blocco `customerService { gestione,
  etichetta, da, il }` (`null` finché il CS non l'ha comunicato). Le etichette e
  i colori stanno in `src/lib/customer-service.ts`, con **ripiego sul codice
  grezzo** per uno stato sconosciuto: il vocabolario è del CS e può crescere.
- **Pagina ordine**: scheda **«Customer Service — lavorazione»** con la pill
  colorata, chi e quando, sopra la pipeline «Stato» e **distinta** da essa.

✅ **Il giro è COMPLETO (aggiornato in serata).** Il **push** lato Customer
Service è stato scritto e deployato subito dopo (commit CS `6df84313`):
`comunicaStatoAOrders` in `deluxy-messaging/src/lib/orders.ts`, agganciato a
`POST /api/ordini/[id]/gestione` (il cambio stato dell'operatore). Quando un
operatore cambia stato, Orders lo riceve. ⚠️ Copre l'azione manuale, **non
ancora** le transizioni automatiche (pagamenti/riconciliazione/cron rimborsi).

✅ **IL MARGINE È VIVO (non era rotto, ed è alimentato).** La foto «0 ordini con
costo» era MATTUTINA: a fine 24/08 gli ordini con `costoFornitore` da
`customer-service` sono **8** (CS e Orders coincidono), e **#2791 ha margine
35 €** (85 − 50, «civico 95»). Il push del **costo** (`comunicaCostoAOrders`,
scritto nella «sera 3» del CS) è vivo: il margine compare dove l'operatore
registra il costo. Lezione: una conta istantanea di un contatore che si riempie
durante il giorno è una foto, non una sentenza.

⚠️ **Le colonne si sono aggiunte con un `ALTER TABLE … ADD COLUMN IF NOT
EXISTS`, NON con `prisma db push`**: il push avrebbe tentato anche il drop delle
colonne orfane di `FeedbackOrdine` (che va lanciato a mano, non come effetto
collaterale). Schema, client e DB sono allineati; il build (`prisma generate`)
rigenera il client coi campi nuovi.

**Verificato** (dev locale, codice nuovo): API con blocco `customerService`,
pagina con la scheda, `tsc --noEmit` pulito. #2791 seminato col suo valore vero
via SQL (nessun evento, storia intatta): idempotente col futuro push del CS.

**Nell'ELENCO (home `/`, 24/08 sera):** lo stato del Customer Service si vede
**subito** su ogni ordine — pill «CS: <stato>» in entrambe le viste (colonne per
brand ed elenco) — e per gli ordini **chiusi** (`csGestione = gestito`) compare
il **margine reale in € e %** (chip verde/rosso; **netto IVA** dal 25/08 — vedi
sezione in cima; la % è `(totale − costo)/totale`, invariante allo scorporo).
Chiuso senza costo ⇒ «margine n/d» (non zero). Helper `PillLavorazioneCs` e
`MargineChiuso` in `src/app/page.tsx`; il margine lo fa `margineOrdine()` (non
più a mano). ⚠️ Le query dell'elenco usano `include` (non `select`), quindi
`csGestione`/`costoFornitore` e i campi consegna arrivano già senza toccarle.
Verificato in locale: 12 pill CS e 6 chip margine nella colonna Flowers, #2791 → «CS: Gestito» + «margine 28,69 € ·
41%».


## 23/08/2026 — La quota del fornitore si può chiedere da fuori

Nuova rotta **`GET /api/v1/quota-fornitore`** (sola lettura, chiave come le
altre). Torna la percentuale di `controllo.quotaFornitore` — di norma **60** — e,
se le si passa `?totale=135`, anche l'importo atteso (`atteso: 81`).

⚠️⚠️ **Serve perché quella regola vive SOLO qui** e le altre app non devono
ricopiarsela: Deluxy Customer Service la mostra sulla scheda di un ordine
(«al fornitore, indicativamente, 81,00 €») prima che un operatore scriva al
fioraio. Una copia scritta nel codice di un'altra app resterebbe al vecchio
valore il giorno che la si cambia qui, e due schermate direbbero due numeri
diversi senza che nessuno se ne accorga.

⚠️ Il conto (`totale × quota`) lo fa **questa** app, che possiede la regola: se
lo facesse ogni consumatore, la moltiplicazione sarebbe sparsa in cinque posti.

⚠️ Un `totale` illeggibile **non diventa zero**: si risponde senza importo. Un
«≈ 0,00 €» sarebbe una risposta sbagliata con l'aria di una giusta.

## 23/08/2026 — `/api/v1/province`: il venduto per territorio, in torte, fiori e altro

`GET /api/v1/province` (sola lettura, chiave come le altre): venduto aggregato
per **provincia di consegna** — ordini, lordo, clienti distinti per sigla — con
le stesse esclusioni di `/api/v1/ricavi` e il blocco `senzaProvincia`
dichiarato. Filtri `anno=`, `da=`/`a=`, `brand=`; senza periodo risponde su
tutto lo storico, apposta: per capire dove si vende, tre anni dicono più di
dodici mesi.

⚠️ **Questa rotta era fuori dall'handoff**: è nata il **27/07/2026 dentro un
commit di Deluxy Scout** (`8b65ff53`, la vista Province di Scout la consuma) e
nessuno l'aveva registrata qui — scoperta e documentata il 24/08. Lezione: una
rotta scritta dalla sessione di un'ALTRA app non finisce da sola nei documenti
dell'app che la ospita.

- ⚠️ **La provincia non c'è sempre** (~10.300 su ~13.600 ordini italiani): chi
  non ce l'ha sta in `senzaProvincia`, non sparisce; e **non si deduce** da CAP
  o città. Le sigle restano quelle di Shopify («MI», ma anche «ENG»):
  normalizza chi legge (Scout ha `lib/province.ts`).
- **Dal 23/08 (`e53b268e`) ogni provincia porta lo split
  `torte`/`fiori`/`altro`**, chiesto da Scout per la vista Copertura: il
  fornitore da cercare è un fiorista o una pasticceria a seconda della
  risposta. Usa la colonna `categorie` già calcolata (regole + AI + mano):
  rifare qui la classificazione sarebbe una seconda regola che col tempo dice
  altro.
- ⚠️ **Ogni ordine sta in UNA colonna sola** e le tre sommano esatte al lordo:
  i misti torte+fiori (il 4% del fatturato) vanno dove pesano di più, contando
  il valore delle righe. In due colonne sforerebbero il totale; buttati in
  «altro» direbbero una cosa falsa.

## FOTOGRAFIA AL 17/08/2026 — contata sul database, non ricordata

**L'app è viva e la catena Shopify → Orders gira da sola.** `GET /api/v1/health`
in produzione risponde `ok:true` in **0,33 s** da `fra1` con `ultimoImport`
**17/08 09:15 UTC**; tutti e tre i negozi hanno `ultimaSync` in quello stesso
minuto, quindi il cron dei 15 minuti lavora su tutti, non solo sul primo.
Ultimo ordine entrato: **oggi alle 09:08**. **17 ordini nelle ultime 24 ore,
112 negli ultimi 7 giorni.**

**Il codice è fermo dal 03/08/2026** (`fad9b933`, verificato presente su
`origin/scout-ui`): niente di non pushato, e in 14 giorni nessuno ha toccato
Orders. Quindi **produzione = ultimo commit**, e tutti i punti aperti qui sotto
sono ancora aperti.

### I numeri (al 17/08, contro quelli del 30/07)

| | 30/07 | 17/08 |
| --- | --- | --- |
| Ordini | 14.027 | **14.284** (deluxy.it 11.766 · Flowers 1.732 · cake 786) |
| di cui annullati | — | 388 |
| Ordini con costo fornitore | 371 (3%) | **371 (2,6%)** — fermo, mentre il totale cresce |
| `TagCliente` (tipologie confermate a mano) | 0 | **0** |
| Riepiloghi AI dei clienti | 3 | **3** |
| Occasioni «da precisare» | — | **9.145 su 9.178 (99,6%)** |
| Ordini senza città | 2.421 | 2.463 |
| Ordini senza categoria | 607 | 611 |

Venduto per mese (annullati e rimborsati esclusi, lordo Shopify): maggio
**90.445 €** su 552 ordini · giugno **78.038 €** su 416 · luglio **97.731 €** su
453 · agosto al 17 **42.033 €** su 231.

### Cosa è cambiato davvero dal 30/07: le altre app hanno cominciato a leggere

Sette chiavi API, cinque attive e **usate tutte stamattina**: `deluxy-marketing`
(09:20), `deluxy-merchandising` (09:16), `deluxy-messaggi` (09:15),
`deluxy-budgets` (08:43), `deluxy-partner-import` (05:30). Al 30/07 i lettori
dichiarati erano tre: **Orders è diventato la fonte di verità di mezzo
ecosistema**, e questo cambia il peso di ogni modifica alle API.

Due chiavi da guardare, non da usare:
- **`deluxy-anagrafiche` è attiva ma l'ultimo uso è il 01/08**: qualcosa che
  leggeva ha smesso 16 giorni fa, e nessuno se n'è accorto.
- **`commerciale` è attiva e non è mai stata usata** (`ultimoUso` null): una
  chiave viva che non serve a niente è solo una porta in più.

### Tre cose che il documento diceva e che oggi non sono più vere

1. **La coda di riconciliazione non è 240, è 3.366.** Più sotto si legge che
   `normalizzaControllo()` fa scendere la coda «vera» a 240; contati oggi, gli
   ordini con `gestioneIncasso = 'riconciliazione'` sono **3.366** (2026: 2.151 ·
   2025: 1.031 · 2024: 184). E **non è l'accumulo dei nuovi**: solo **168** sono
   ordini successivi al 30/07, gli altri **3.198** sono più vecchi della
   normalizzazione stessa. Cioè la normalizzazione ha coperto meno di quanto il
   documento lasci credere. **Da ricontare prima di fidarsi del «240».**
2. **L'estratto conto NON parte dal 01/01/2025.** Il punto aperto 3 giustifica la
   copertura del 3% sui costi dicendo che sul più vecchio non c'è niente da
   trovare. La tabella `MovimentoBanca` qui dentro ha **22.081 movimenti dal
   23/11/2020 al 15/08/2026** (2020: 105 · 2021: 1.402 · 2022: 1.773 · 2023:
   2.355 · 2024: 5.411 · 2025: 6.965 · 2026: 4.070). **Il vincolo dichiarato non
   c'è più**: si può provare ad abbinare anche lo storico — resta da verificare
   se quelle causali contengano numeri d'ordine, che è cosa diversa.
3. **Il registro dei feedback non è più vuoto, ma quasi**: **1** feedback
   importato dal Customer Service in tutto (era 0 al 26/07). La catena è
   collegata, il contenuto no.

### Costruito e mai usato (zero righe, non «poche»)

`Script` 0 · `Automazione` 0 · `MessaggioAutomazione` 0 · `PrivacyCliente` 0 ·
`LinkIncasso` 0 · `TagCliente` 0. Le sezioni Script, Automazioni, Privacy e
«Fatti pagare» esistono, sono provate, e **nessuno le ha mai adoperate** — in
parte per il permesso Shopify mancante (punto 1), in parte perché non sono
entrate nel lavoro di nessuno.

Stessa cosa sulla coda dei problemi: **90 rimborsi parziali, 0 gestiti**. La
coda «da verificare» in cima agli Ordini non è mai stata lavorata.

### L'AI: accesa, quasi mai usata

Le occasioni lette dall'AI sono **41 su 9.178** (15 ricorrenza · 14 compleanno ·
8 rimaste «da precisare» · 2 anniversario · 1 condoglianze · 1 nascita). I
riepiloghi dei clienti sono **3**. Il motore funziona, il costo per chiamata è
il motivo per cui si sceglie quanti farne: **è una decisione dell'utente, non un
guasto**, ma finché resta così la dimensione «occasione» in Analisi non dice
niente (99,6% «da precisare»).

## Cos'è
Registro centralizzato degli ordini Shopify di tutti i brand Deluxy: la fonte di
verità degli ordini, come Anagrafiche lo è per i partner. Importa da Shopify, fa
riclassificare a piacimento, espone alle altre app via API a chiave.

Next.js 15 + Prisma + Postgres condiviso (**schema `orders`**), porta **3150**.
**LIVE su https://deluxy-orders.vercel.app** (progetto Vercel `deluxy-orders`).
Manuale funzionale completo: [COME-FUNZIONA.md](COME-FUNZIONA.md).

## Le sezioni, e dove sono documentate qui sotto
Ordini (`/`) · Bacheca · Consegna · **Fatti pagare** (`/incassa`) · Analisi ·
**Marketing** (`/marketing`) · **Margini** (`/margini`) · **Controllo**
(`/controllo`) · Clienti · Liste · Eventi clienti · Script · Automazioni ·
Categorie · Impostazioni.

Le quattro in grassetto sono del **30/07/2026** e hanno una sezione propria più
sotto, con i numeri veri e le trappole pagate. Le altre sono precedenti.

## Stato: funziona tutto, con dati reali

**13.995 ordini** importati e allineati esattamente con Shopify (13.959 al 26/07)
(`npm run verifica:totali` lo dimostra negozio per negozio: deluxy.it 11.640,
Flowers 1.584, cakedesign.me 730). Tre negozi collegati con Client ID+Secret,
credenziali riusate da Finance.

Le pagine: **Ordini** (vista predefinita a *colonne per brand*, più l'elenco in
tabella), **Bacheca** kanban, **scheda ordine**, **Clienti** (+ tag, + rubrica
Google), **Liste** (39 liste di clienti + export CSV), **Consegna**,
**Impostazioni**, **Fornitori vicini** per ordine.

### Liste e tag dei clienti (26/07/2026)
I 10.212 clienti (su 10.375 identificabili: 163 hanno solo ordini annullati e
non contano) sono classificati in tempo reale su due assi, e raccolti in **40
liste** con criterio scritto e consiglio d'uso — catalogo in
`src/lib/segmenti.ts`, query in `src/lib/clienti.ts`, API `/api/v1/liste`.

- **Segmento di valore** (uno solo per cliente): VIP 143 · Da non perdere 79 ·
  Fedeli 78 · Ricorrenti 591 · Nuovi 1.004 · Una tantum 2.775 · Da riattivare
  2.692 · Persi 2.850. Soglie tarate sui dati veri (mediana di spesa 110 EUR,
  p95 515, p99 1.498; 85% dei clienti ha un solo ordine).
- **Tipologia**: dedotta dal nome dell'**acquirente** (mai il destinatario) e
  correggibile a mano (`TagCliente`, la mano vince). Numeri onesti: aziende 75,
  hotel 4, eventi 1, rivenditori 0 — più 1.098 «probabili aziende da
  confermare» (email a dominio proprio), che è la coda di lavoro.

**Perché il riconoscimento automatico è così prudente**: la prima versione
pescava «Villa» e «Fiori» (cognomi) come location ed eventi, e «spa» come hotel
mentre erano S.p.A. Restano solo parole che in italiano non sono anche cognomi.
Meglio quattro hotel giusti che quaranta sbagliati.

Cosa si importa da Shopify: ordini, righe con personalizzazioni e **foto**,
cliente, spedizione, note, tag, **data e fascia di consegna**, **annullamento**
con motivo, evasione, stato pagamento, **rischio frode**, biglietto.

Copertura dei dati (non è il 100%, e va saputo):

| Dato | Copertura | Perché |
| --- | --- | --- |
| Ordini | 13.959 / 13.959 | allineato con Shopify |
| Data di consegna | ~9.400 | un terzo degli ordini non ha l'attributo (vedi trappole) |
| Rischio frode | ~9.800 | si importa **solo sui nuovi**, per scelta |
| Foto prodotti | ultimi 90 giorni | backfill completo costerebbe ore |
| Biglietto | 132 ordini | 128 dedotti dalla nota, marcati «da verificare» |

### Feedback dal Customer Service (26/07/2026)
Orders importa da **deluxy-messaging** (`GET /api/v1/feedback`, chiave di sola
lettura creata là con `npm run chiave -- deluxy-orders`) i **reclami** e i
**voti** legati a un ordine, li mostra sulla scheda dell'ordine e li conta in
Impostazioni. Import incrementale e idempotente (`idEsterno`, upsert), ogni
notte dentro `/api/cron/sync` e a mano dal pulsante.

- **Serve configurare** `MESSAGGI_URL` + `MESSAGGI_API_KEY` (in locale sono nel
  `.env`; su Vercel vanno impostate).
- **Il collegamento all'ordine è prudente**: solo numero+brand, oppure numero se
  è unico in tutto il registro; altrimenti `collegamento = ambiguo|non-trovato`
  e il feedback resta scollegato ma visibile. Provato: un voto con «1731» senza
  negozio resta ambiguo, il reclamo con «#1731» + `cakedesign.me` si attacca.
- **Verificato con dati di prova** (creati e poi cancellati): API 200 con
  chiave, 401 senza, un voto senza numero d'ordine non esce nemmeno; import
  ripetuto due volte → 0 nuovi, nessun doppione.
- **Stato reale al 26/07/2026**: nel Customer Service ci sono 7 casistiche
  configurate, **0 reclami** e 6 voti (nati mentre si lavorava). Quindi la
  catena c'è ma il registro è vuoto: non è un errore.
- **MANCA**: il Customer Service va **pubblicato** perché l'import funzioni in
  produzione (la rotta `/api/v1/feedback` è nuova), e le due variabili vanno
  messe sul progetto Vercel di Orders.

### Privacy, attività, ordinamento e automazioni (26/07/2026)
- **Consensi di marketing importati da Shopify** (`emailMarketingConsent`,
  `smsMarketingConsent` sul cliente dell'ordine): verificato che il token li
  legge su **tutti e tre** i negozi. Sull'ordine sono una fotografia; per il
  cliente vale quello dell'**ordine più recente**. Sopra tutto sta
  `PrivacyCliente`, modificabile dalla scheda cliente (sì/no per canale + «non
  contattare mai»), che **vince sempre**. Se non si sa niente → non si contatta.
- **I consensi entrano in `cambiato()`** (al contrario del rischio frode):
  cambiano nel tempo ed è il punto. Conseguenza: la prima sync dopo questa
  modifica riscrive gli ordini della finestra. Gli ordini più vecchi della
  finestra sincronizzata restano senza consenso → lista «Consenso da chiedere».
- **Attività**: stato ricavato dal solo tempo (Attivo ≤90gg, Recente ≤365,
  Dormiente ≤730, Inattivo oltre), come colonna, filtro e ordinamento.
- **Ordinamento su tutte le colonne**, nei due versi, dalle intestazioni. Le
  colonne a etichetta usano `array_position` sul vocabolario, non l'alfabeto.
- **Script** (`/script`): i testi da mandare, riusabili, con **variabili**
  dichiarate (chiave, etichetta, valore predefinito, obbligatoria) oltre a
  quelle automatiche del cliente. Una obbligatoria vuota **blocca** la
  preparazione; una citata e non riempita da nessuno è segnalata prima
  dell'invio; i dati del cliente non si possono sovrascrivere. Provato:
  variabile obbligatoria vuota → blocco col nome della variabile, valore
  predefinito 10% scavalcato dal 20% scelto dall'automazione, {{refuso}}
  riconosciuto come «nessuno lo riempirà».
- **Automazioni** (`/automazioni`): lista + canale + script (collegato o testo
  scritto lì) +
  guardrail (consenso, recapito, silenzio di N giorni fra un messaggio e
  l'altro, limite per giro). **Preparano** i messaggi, non li inviano: si
  esportano o si mandano dal Customer Service e poi si segnano come inviati.
  Ogni scheda mostra la prova a vuoto con i motivi degli esclusi.

### Split per brand e categorie di prodotto (26/07/2026)
Ogni lista si guarda per **brand** e per **categoria**: `?brand=` e `?categoria=`
su /liste, /liste/[chiave] e /clienti (e nell'export CSV). I due tagli NON sono
simmetrici, ed è voluto: il brand filtra gli ORDINI (numeri e segmento
ricalcolati su quel negozio), la categoria filtra i CLIENTI (numeri interi),
altrimenti «di quante categorie è amante» darebbe sempre 1. Vedi `Taglio` in
`src/lib/clienti.ts`.

Le **categorie di prodotto** stanno in `src/lib/categorie.ts` (vocabolario a
parole chiave, in TS e in SQL: la stessa regola in due linguaggi, per il
ricalcolo in una query sola) e si salvano su `Ordine.categorie` come stringa
(«dolci fiori»). Fallback: `NegozioShopify.categoriaPredefinita`, impostata a
Flowers=fiori e cakedesign.me=torte → quei due negozi sono classificati al 100%,
deluxy.it resta con 2.525 ordini «non classificato» (i best seller si chiamano
«Botticelli» o «Favolosa»). NON aggiungere i nomi propri al vocabolario: si
riscriverebbe a ogni collezione.
Ricalcolo: pulsante in Impostazioni → `ricalcolaCategorie()`, 13.967 ordini in
3,7 s, riscrive solo ciò che cambia. `categorie` NON entra in `cambiato()`
(sarebbe una riscrittura dell'archivio a ogni sync).
Numeri veri: mono-categoria 7.803, multi 1.001; fiori 5.199, torte 2.372,
colazioni 1.105, dolci 922. Split VIP: deluxy.it 109 · Flowers 24 · cake 3.

### Eventi clienti (26/07/2026)
Le occasioni per cui i clienti ordinano, ricavate dagli ordini: **9.129 ordini
con data di consegna → 8.729 occasioni**, 169 confermate da 2+ anni, **366 nei
prossimi 30 giorni**. Pagina `/eventi`, motore in `src/lib/eventi.ts`, tabella
`EventoCliente`, rilevamento nel cron notturno + pulsante.

- **Solo dati strutturati**: data di consegna + destinatario. Mai le note. Il
  TIPO (compleanno/anniversario) non si deduce: nessuno lo scrive in un ordine.
- Raggruppamento: stesso cliente + stesso destinatario + consegne entro 7
  giorni. Anni diversi = fatto; una volta sola = ipotesi.
- **Idempotente e non distruttivo**: rilanciarlo aggiorna solo i fatti
  (ricorrenze, anni, ordini) e lascia tipo/titolo/note/stato scritti a mano.
  Secondo giro misurato: 0 nuovi, 0 aggiornati, 1,6 s.
- Alimenta la lista **«Ha un'occasione fra 30 giorni»** (359 clienti): il
  confronto sulle date che tornano si fa su `mese*100+giorno`, che cresce come
  la data dentro l'anno — niente `make_date`, che sul 29 febbraio esploderebbe.

### Ordini problematici — rimborsi parziali (26/07/2026)
**89 ordini** (13.815 EUR) hanno `financialStatus = PARTIALLY_REFUNDED`: l'ordine
resta valido e sembra normale, ma parte del denaro è tornata al cliente e
**l'importo reso non esiste nel registro** (Shopify ci dà solo il totale). Sono
marcati «problematici»: badge nell'elenco e nelle colonne, riquadro nella scheda,
KPI-coda in cima alla pagina Ordini, filtro `problema=aperti|gestiti|tutti` e
campo `problema` nelle API.

- Il **motivo non si salva**: si ricava sempre da `motiviProblema()` in
  `src/lib/ordini.ts`, così non può invecchiare. Nel database c'è solo
  `problemaGestito` + `problemaNota` («l'ho guardato, ecco cosa ho concluso»).
- Aggiungere un altro caso = una riga in `motiviProblema()` più la costante in
  `STATI_PROBLEMA`. Candidati **non** inclusi per scelta: i 2 ordini
  `PARTIALLY_PAID` (pagati in parte) e gli ordini con un reclamo aperto dal
  Customer Service — vanno decisi con l'utente, non aggiunti di slancio.
- Provato su un ordine vero (#1713): segnato → 88 aperti / 1 gestito con
  l'evento nella storia, poi rimesso com'era.

### AI (ChatGPT) — prima applicazione: le categorie dei prodotti (26/07/2026)
`src/lib/ai.ts` è il cliente OpenAI dell'app (chiave `OPENAI_API_KEY`, modello
`gpt-4o-mini` come nelle altre app; impostata anche su Vercel). Nessun pacchetto
nuovo: chiamata fetch e basta.

Prima applicazione: `/categorie` — l'AI classifica i prodotti che le regole a
parole non riconoscono (`src/lib/categorie-ai.ts`, tabella `CategoriaProdotto`).
Precedenza: manuale → parole → AI → specialità del negozio → non classificato.

- **Misurato sui dati veri**: 40 prodotti chiesti in 1 chiamata, 17 secondi →
  12 classificati con motivo, 28 lasciati come «non so», 0 scartati. Copertura
  delle righe d'ordine dal 79% all'85%.
- ⚠️ **TRAPPOLA: l'AI risponde col NOME della categoria, non con la chiave.**
  Il primo controllo accettava solo `torte` e scartava «Torte e pasticceria»:
  12 prodotti su 40 buttati, e sembrava un errore del modello mentre era del
  controllo. Ora si normalizza (chiave o nome, senza maiuscole).
- ⚠️ **Il prompt va tenuto in equilibrio.** Una versione troppo severa («se
  l'unico argomento è il prezzo, rispondi non-classificato») ha portato a 0
  classificati su 40; una troppo permissiva faceva scrivere «il negozio indica
  una torta» anche per deluxy.it, che vende di tutto. Ora al modello si dice
  quale negozio ha una specialità e quale no.

### AI sugli eventi: il motivo dell'occasione dal biglietto (26/07/2026)
`src/lib/eventi-ai.ts` + pulsante su `/eventi`. Legge biglietto/nota degli
ordini di un evento e propone il TIPO, salvando **la frase su cui ha deciso**
(`prova`) e il motivo. Campi nuovi su `EventoCliente`: `tipoDa` ("" | ai |
manuale), `motivoTipo`, `prova`.

- **Misurato**: 50 biglietti, 2 chiamate → 37 riconosciuti, 9 «non si capisce»,
  0 scartati. 7.672 eventi su 8.729 hanno un testo leggibile.
- Vocabolario allargato (TIPI_EVENTO): compleanno, anniversario, matrimonio,
  nascita, laurea, ricorrenza, ringraziamento, **condoglianze**, altro.
  `TIPI_DELICATI` esiste perché le automazioni possano saltare i lutti.
- ⚠️ **Tarature pagate**: «Auguri Mamma» / «Feliz día de las madres» venivano
  letti come *nascita* invece che festa della mamma (corretto nel prompt), e un
  «auguri» generico veniva comunque classificato (ora è «da precisare»). Ne
  resta uno ambiguo su 33: si corregge in pagina, con la prova sotto gli occhi.
- Chi risponde «da precisare» viene comunque marcato `tipoDa = ai`: senza,
  ogni giro ripagherebbe la stessa domanda per la stessa risposta.

### Riepilogo AI del cliente, con preferenze e gusti (26/07/2026)
`src/lib/clienti-ai.ts` + card in cima a `/clienti/:chiave` + pulsante in blocco
su `/clienti`. Modello nuovo `RiepilogoCliente` (chiave unica, `testo`, `punti`,
`gusti`, `ordiniConsiderati`, `ultimoOrdine`, `modello`), già in produzione con
`prisma db push`.

- **Tre campi distinti**: riassunto in prosa, **gusti** (categorie e prodotti
  ripetuti, fascia di prezzo, destinatari abituali, stagionalità) e i **punti**,
  uno per ordine.
- **Incrementale per costruzione**: se il riepilogo esiste, all'AI vanno solo
  gli ordini più recenti di `ultimoOrdine`, col riepilogo vecchio davanti e
  l'ordine di non riscriverne i punti; i punti nuovi si **accodano** ai vecchi.
  I gusti invece si riscrivono ogni volta. `riepilogaCliente(chiave, { rifai:
  true })` riparte da zero — è il bottone «Riscrivi da capo».
- **Misurato su clienti veri**: 4 ordini → 3,7 s; 26 ordini → 10,9 s. I gusti
  escono con nomi di prodotto e destinatari veri («Bouquet Grande Gatsby …
  destinatari abituali Graziella Turchetti, …»).
- **MAX_ORDINI = 24**: oltre, si mandano i più recenti. La scheda lo scrive,
  perché `ordiniConsiderati` è *quanti ordini aveva quando è stato scritto* (lo
  usa il confronto «sono arrivati N ordini nuovi»), non quanti ne ha letti.
- **Il blocco si ferma da solo dopo 50 s** (`SECONDI_MAX`) e dice a che punto è
  arrivato: una server action su Vercel viene uccisa, e 100 clienti × ~7 s non
  ci stanno.
- ⚠️ `riepilogaCliente` può tornare `ok: true` **con** un messaggio («Nessun
  ordine nuovo»): non è un errore, e l'azione lo mostra come avviso verde.
- **Esposto alle altre app** (27/07/2026): `GET /api/v1/clienti` (elenco con
  `riassunto` e `gusti`, filtri `q, lista, ordina, verso`, `riepiloghiScritti`
  nella risposta) e `GET /api/v1/clienti/:cliente` (scheda completa coi
  `punti`; accetta base64url **o email in chiaro**). `/api/v1/liste/:chiave`
  accetta `riepilogo=si`. Provati in produzione con una chiave temporanea, poi
  cancellata.
- ⚠️ **Niente filtro `solo=con-riepilogo`**: era stato scritto e poi tolto
  perché filtrava *dopo* la paginazione — restituiva pagine vuote su 3.406
  pagine fingendo di aver selezionato. Se serve davvero, va fatto in SQL dentro
  `elencoClienti`, non a valle.

### Repeater e provenienza di marketing su ogni ordine (27/07/2026)
Due segni su ogni ordine, in elenco, in colonne, nella scheda e nelle API.

**Repeater** — `src/lib/repeater.ts`, `ordinali(ids)`: una query sola per
schermata che conta, per ciascun ordine, **quanti ordini validi lo precedono**
per lo stesso cliente (chiave email → telefono → nome, la stessa di Clienti,
via `chiaveDi(alias)` in `clienti.ts`). Non è «quanti ordini ha oggi»: un ordine
vecchio resta «1º» per sempre. Misurato: 50 ordini in 130–290 ms, di cui ~135 ms
sono latenza verso Supabase. Su 50 ordini recenti: 15 repeater, 32 primi ordini,
3 senza cliente riconoscibile (nessun segno: non si indovina).

**Provenienza** — campi nuovi su `Ordine` (`sorgente`, `visitaSorgente`,
`utmSource/Medium/Campaign`, `canaleMarketing` + indice). Vengono da
`customerJourneySummary.firstVisit` e `sourceName` di Shopify; il canale in
italiano lo deduce `deduciCanale()` in `src/lib/marketing.ts` (12 canali con
simbolo). **Attribuzione al primo contatto**, non all'ultimo clic.

- ⚠️ **I campi entrano in `cambiato()`**, non solo in `datiShopify()`: è
  l'errore già pagato coi consensi (scritti ma non confrontati → il backfill
  scrive zero). Conseguenza voluta: la prima sync dopo questa modifica riscrive
  gli ordini della finestra.
- ⚠️ **Niente backtick nei commenti dentro `ORDERS_QUERY`**: è un template
  literal, e un backtick nel commento GraphQL rompe il parse di TypeScript.
- Costo Shopify misurato: 25 ordini col percorso = **26 punti** su un bucket da
  1000. Non cambia il ritmo dell'import.
- Backfill: `npm run importa:provenienza [brand]`. Prima versione con un
  `update` per ordine: **~78 ordini/minuto**, cioè 2 ore e mezza per deluxy.it.
  Riscritta con `UPDATE … FROM (VALUES …)`, una scrittura per pagina da 100.
  Se serve di nuovo un backfill di massa su questo database, **partire da lì**.
- Distribuzione reale (Flowers, 1.588 ordini): 738 ricerca non pagata, 378
  diretto, 192 creati a mano, 189 sconosciuti, 48 Shopping, 16 email, 11
  referral, 8 Meta, 6 AI, 1 WhatsApp, 1 social.

**Esposto alle altre app (27/07/2026)**

- `GET /api/v1/ordini` porta `marketing{}` e, dentro `cliente`, `repeater`,
  `ordiniPrima`, `numeroOrdine`; nuovo filtro **`canale=`** (una chiave,
  `pagato`, oppure `sconosciuto`).
- `GET /api/v1/clienti` porta `acquisizione { canale, primoOrdine }` — il canale
  del **primo** ordine valido (`src/lib/acquisizione.ts`, `DISTINCT ON`).
- **`GET /api/v1/marketing`** (nuovo): per canale × mese ordini, lordo, `primi`
  / `daRepeater` / `nonAttribuibili`, clienti distinti, più le campagne per
  nome. Misurato in dev: **0,86 s** a caldo (a freddo 20–36 s = compilazione
  Next, non la query). Due query, ciascuna con una window function su tutta la
  tabella.
- ⚠️ **La numerazione dei clienti si fa PRIMA di tagliare il periodo**: la CTE
  `numerati` scorre tutti gli ordini e solo la CTE `dentro` applica le date. Se
  si invertisse, il secondo ordine di un cliente del 2024 risulterebbe «cliente
  nuovo» nel 2026 — il numero sarebbe plausibile e sbagliato.
- ⚠️ `clienti` nella risposta è la **somma dei distinti per mese**: chi compra a
  gennaio e a marzo è contato due volte. È dichiarato in `criteri`.

### Analisi delle vendite (`/analisi`, 27/07/2026)
`src/lib/analisi.ts` + pagina. Settimane / mesi / anni, confronto col periodo
precedente o con lo stesso dell'anno scorso, filtro per negozio, navigazione
all'indietro. KPI: venduto, ordini, clienti, pezzi, scontrino medio, **UPT**,
prezzo medio a pezzo, % ordini da clienti nuovi, % annullati, % rimborsati; più
categorie di prodotto e serie storica.

- **Confronto a parità di giorni** quando il periodo è in corso: il periodo di
  confronto viene troncato allo stesso numero di giorni. Senza, a metà mese la
  pagina mostrerebbe cali inventati.
- «Ordine medio» e «scontrino medio» sono **lo stesso numero** (venduto/ordini):
  la pagina lo dice invece di mostrare due KPI identici con nomi diversi. Quello
  che li spiega è la coppia UPT × prezzo medio.
- ⚠️ **Il conto dei clienti nuovi si fa su tutta la storia**, come in
  `/api/v1/marketing`: la CTE `numerati` non è filtrata per data.
- **Otto dimensioni** (27/07/2026): città di consegna, categoria, tipologia di
  cliente, occasione, **nazione di chi ordina**, **nazione di consegna**, tipo
  di ordine, canale di provenienza — ognuna con TUTTI i KPI e la
  loro variazione. Motore unico: `DIMENSIONI` + `perDimensione()` in
  `analisi.ts`; una dimensione nuova sono tre righe. Le due derivate usano CTE
  in più (`tipologie` da nomi+TagCliente con `SQL_TIPOLOGIA_AUTO`, `occasioni`
  da `EventoCliente.ordini` spezzato con `string_to_array`).
- **Periodo a mano** (`?da=&a=`, date ISO): il confronto diventa la stessa
  lunghezza appena prima, o le stesse date dell'anno scorso; l'etichetta mostra
  i giorni **davvero** confrontati (troncati a parità di giorni se il periodo è
  in corso). Date invertite → si ignora la scelta invece di rispondere a
  un'altra domanda.
- **Gli annullati sono sempre fuori dal venduto** e contati a parte: verificato
  su luglio 2026, 393 validi + 18 annullati + 9 rimborsati = 420 nel registro.
- ⚠️ Con i JOIN delle dimensioni la colonna `chiave` diventa **ambigua**: in
  `MISURE` va qualificata `x.chiave`, e ogni query che usa MISURE deve aliasare
  la sottoquery come `x`. È il primo errore che si prende aggiungendone una.
- **Verificato**: la somma delle righe di ogni dimensione torna esatta col
  totale della pagina (86.700,25 € a luglio 2026) — nessuna riga persa né
  contata due volte, categorie a parte che si moltiplicano apposta.
- ⚠️ **Categorie: doppio conteggio voluto.** Stanno sull'ordine, non sulla riga;
  un ordine multi-categoria è contato in ogni riga e la somma supera il totale.
  Scritto in pagina.

### Chiavi API create dall'app (30/07/2026)
`src/lib/chiavi.ts` + `ChiaviApi.tsx` + `chiavi-actions.ts`: le chiavi delle altre
app si creano, rigenerano, sospendono ed eliminano da **Impostazioni**, non più
solo da riga di comando.

- **Un solo motore**: `creaChiave()` sta in `src/lib/chiavi.ts` e lo usano sia la
  pagina sia `npm run chiave` (lo script è passato da `.mjs` a `.ts` per poterlo
  importare). Due modi di generare una credenziale divergono, e sulle credenziali
  divergere si scopre il giorno che una non funziona.
- ⚠️ **La chiave in chiaro non passa mai da un redirect**: torna nel valore di
  ritorno della server action. In una querystring finirebbe nella cronologia del
  browser e nei log, dove resta per sempre.
- Il riquadro della chiave appena nata **si chiude a mano**: nel DB c'è solo lo
  SHA-256, quindi chi non fa in tempo a copiarla deve rigenerarla.
- Rigenera ed Elimina sono **a due clic** (l'etichetta diventa «Confermi?»):
  spengono un'altra app all'istante.
- ⚠️ **`revalidatePath` non basta quando l'azione parte da un clic** e non da un
  `form action`: la tabella restava con la chiave appena eliminata ancora
  visibile — su una credenziale è la bugia peggiore, sembra attiva e non lo è.
  Serve `router.refresh()` nel client dopo crea/rigenera/elimina.
- **Provato davvero il 30/07/2026**: chiave creata → `GET /api/v1/ordini` risponde
  200; rigenerata → la vecchia risponde **401** e la nuova 200; eliminata → 401.
  Le due chiavi di prova sono state cancellate (restano le 7 vere).

### Sezione Marketing (30/07/2026)
`/marketing` + `src/lib/canali.ts`. Quanto vende ogni canale di provenienza, con
la variazione sul periodo prima e il taglio nuovi/di ritorno.

- **Il motore è stato estratto dall'API**: `venditePerCanale()` sta in
  `src/lib/canali.ts` e lo usano sia la pagina sia `/api/v1/marketing` (che
  l'app ADV legge). Prima la query viveva dentro la rotta: due implementazioni
  degli stessi numeri divergono, e quando divergono nessuno se ne accorge.
  Risposta dell'API invariata, più due campi nuovi (`sorgenti`,
  `totali.tracciati`); provata in locale con una chiave temporanea, poi
  cancellata.
- **`sorgenti`**: `utm_source` (o il sito di provenienza) sotto il canale. Nasce
  dalla domanda «Klaviyo lo vedi come canale?»: **sì, ma come *Email***, insieme a
  Shopify Email e alle newsletter. Sul 2026 Klaviyo è 5.797 € su 36 ordini, con
  il 22% di clienti nuovi.
- ⚠️ **Avviso automatico sui confronti sleali**: `totali.tracciati` conta gli
  ordini con un `utm_*`. Se la quota cambia molto fra i due periodi (soglia: 8
  punti) la pagina lo scrive. Caso vero: 2026 **27%** contro 2025 **1%**, da cui
  un «Google Ads +8.785%» che è soprattutto tracciamento, non mercato — i clic
  del 2025 finivano in *Ricerca* o *Diretto*. Verificato che **non** è un buco di
  import: la copertura del canale è ~90% in tutti gli anni, sono i link a essere
  cambiati.
- La **spesa** non c'è: sta in deluxy-marketing. Finché non si collega, la pagina
  misura il fatturato per canale, non il ritorno (niente ROAS/MER qui).

**Tabella «Acquisizione o fedeltà» (03/08/2026)** — gli stessi canali, ma i soldi
divisi fra clienti nuovi e clienti di ritorno, con **lo scontrino delle due
metà**. Tre `SUM(…) FILTER` in più nella query che c'era già (`lordoPrimi`,
`lordoDaRepeater`, `lordoNonAttribuibili` in `RigaCanale` e in `totali`): nessuna
query aggiuntiva. Escono anche da `/api/v1/marketing`, con i criteri scritti nella
risposta. Misurato su deluxy.it 25–31/07: 6.894 € da nuovi + 5.291 € da chi torna
+ 545 € non attribuibili = 12.730 €, che è il totale della tabella sopra.

- ⚠️ **I non attribuibili non si spalmano.** Gli ordini senza email, telefono né
  nome non possono stare in nessuna delle due colonne: si dichiarano sotto la
  tabella. Sommarli a metà per far quadrare le percentuali sarebbe un numero
  comodo e falso — e la somma delle due colonne **non** deve fare il venduto.
- Il taglio serve perché conteggio e denaro divergono sempre: Google Ads fa l'85%
  di *ordini* da clienti nuovi ma con scontrino 124 €, mentre il Diretto sembra
  il canale più grande solo perché chi torna spende 1.007 € a ordine.

### ⚠️ NON caricare gli ordini-bozza come conversioni offline in Google Ads (03/08/2026)
Proposta arrivata da un'altra sessione e **bocciata sui dati**: gli ordini nati
da bozza (assistiti dal Customer Service) ma con un percorso pubblicitario
alle spalle sarebbero «invisibili a Google», quindi andrebbero ricaricati come
conversioni offline. **Il fenomeno esiste, la conclusione è sbagliata: Google
quegli ordini li conta già.** Caricarli li conterebbe due volte e lo Smart
Bidding spenderebbe di più su campagne che sembrano rendere il doppio.

- **Il fenomeno, misurato**: 203 ordini `sorgente = shopify_draft_order` con
  `canaleMarketing` a pagamento, 39.612,50 € — di cui 201 nel 2026 e **202 su 203
  su deluxy.it** (Flowers 1, cakedesign.me 0: non è un problema «di tutti i
  brand»). Campagne più colpite: Fiori Milano 60, Torte MILANO 41, Torte ROMA 34.
- **La prova che sono già contate** (campagna «[Deluxy] Torte ROMA», luglio 2026):
  nei giorni delle bozze #12543 (11/07) e #12547 (12/07) Google dichiara 1 e 0,5
  conversioni; il 23/07, giorno della bozza **#12638**, ne dichiara **2** — e il
  clic di quell'ordine è delle 15:08 con l'ordine alle 15:25, stesso giorno.
  Il 19/07, giorno di un ordine **web**, Google dichiara **0**. Confermato
  dall'utente nell'interfaccia di Google Ads.
- **Perché**: pagando la fattura della bozza il cliente passa da un **checkout
  Shopify vero**, dove il tag di Google c'è. Infatti **198 dei 203** risultano
  pagati con shopify_payments o PayPal, non segnati a mano in admin.
- ⚠️ **La deduplica per `transactionId` non protegge**: Google deduplica solo
  **dentro la stessa azione di conversione**, e qui le azioni sarebbero due (il
  tag del sito e l'import offline).
- **E comunque non si potrebbe**: Shopify **taglia la query string** dalla landing
  page (`landingPage` torna senza `?gclid=…`, verificato su #12638 e #12682),
  quindi il GCLID non ce l'abbiamo; e la finestra di import è ~90 giorni, dentro
  la quale stanno solo **67 ordini** dei 203.
- **La lezione**: prima di costruire un recupero, misurare il verso opposto —
  *quel dato manca davvero?* Qui bastava guardare le conversioni del giorno.

### ⚠️ Il nome della campagna in Orders può essere un nome MORTO (03/08/2026)
Indagine su «6 conversioni di Fiori Milano ENG che non si vedono», 25–31/07/2026.
Non era un buco d'importazione: **`utm_campaign` è il nome che la campagna aveva
quando il link è stato scritto, non quello che ha oggi.**

- In Google Ads la campagna si chiama `[Deluxy] - Fiori Milano ENG` (id
  15012697091, attiva); nel registro i suoi ordini portano `[Deluxy] - Fiori
  Milano`, senza suffisso. A giugno 2026 le è stata staccata accanto una gemella
  ITA (id 23958449662) e la vecchia è stata rinominata: l'utm nel link è scritto a
  mano ed è rimasto indietro.
- **Prova**: su tutto luglio 2026 le conversioni Google Ads della ENG sono **18**
  e gli ordini con quell'utm sono **18**. Coincidono esattamente. Sulla singola
  settimana no (7 contro 4) perché **Google data la conversione sul giorno del
  CLIC, noi sul giorno dell'ORDINE**, e perché Google **modella** ciò che non
  vede (nei dati veri ci sono conversioni da 0,5).
- **Prima di dare la colpa all'import, chiedere a Shopify.** I 6 ordini della
  settimana senza canale (#12662 #12668 #12684 #12689 #12690 #12692) hanno
  `customerJourneySummary.ready = true`, `momentsCount = 0`, `firstVisit` e
  `lastVisit` null, `landingPageUrl` null: il dato **non esiste** lato Shopify,
  non c'è niente da recuperare né dal `gclid` né dalla landing.
- **Non è un problema della versione inglese del sito** (ipotesi provata e
  bocciata): a luglio gli ordini dal sito senza percorso sono il **20% degli
  inglesi e il 17% degli italiani**. È un buco strutturale (consensi cookie,
  blocchi, browser dentro le app) stabile fra il 13% e il 21% ogni mese da
  gennaio 2025, ~24 ordini al mese su deluxy.it.

### Margini e Controllo: i soldi degli ordini arrivano qui (30/07/2026)
Il controllo degli ordini — **incassi** e **costi del fornitore** — che si faceva
in Finance (`deluxy-partner/ordini`) ora vive qui, dove stanno gli ordini. In
Finance restano **i movimenti bancari**, che sono suoi.

**Come sono divisi i mestieri (deciso con l'utente)**
- Finance possiede l'estratto conto e lo espone in sola lettura:
  `GET /api/v1/movimenti` e `GET /api/v1/ordini-controllo` (chiave = quella delle
  API di verifica, `Impostazione api.verificheKey`).
- Orders copia i movimenti in `MovimentoBanca` (specchio, idempotente su `hash`) e
  possiede lo **stato del controllo** sull'ordine: `gestioneIncasso`,
  `statoIncasso`, `movimentoIncassoId`, `costoFornitore`, `costoMovimentoId`,
  `costoDa`.
- ⚠️ **Orders non scrive niente in Finance.** Là il movimento abbinato veniva
  marcato «registrata»; qui no: che un movimento sia usato lo dice **l'ordine che
  lo cita** (`movimentiUsati()` lo deriva). Così una reimportazione dell'estratto
  non può perdere il lavoro. È una deviazione voluta dal comportamento di Finance.
- **`/api/v1/ordini` porta un blocco `controllo{}`** (stato incasso, costo,
  margine): `margine` è `null` quando il costo non c'è, mai zero.

**Configurazione**: `FINANCE_URL` + `FINANCE_API_KEY` (impostate su Vercel per
production/preview/development il 30/07/2026, e nel `.env` locale puntano a
`localhost:3040`). Nel middleware di Finance è stato escluso `api/v1`, altrimenti
rispondeva con la PAGINA di login e stato 200.

**Numeri veri del primo giro (30/07/2026)**
- 10.998 movimenti copiati (1.497 entrate, 9.501 uscite, dal 01/01/2025);
- adozione da Finance: **249 costi** (23.224,47 € su 43.754,83 €) e 1.347 incassi
  da gateway, identici a Finance;
- abbinamento per numero in causale: **+122 costi** e +5 incassi che Finance non
  aveva (là c'erano solo 1.484 ordini, qui 14.027);
- **371 ordini con un costo** → margine misurato 33.916,16 € (49,7%), copertura 3%
  di tutto l'archivio e **9% sul 2026**.

**⚠️ Trappole di questo giro — tre, tutte pagate**
1. **La normalizzazione dell'archivio serve, e va fatta PRIMA dell'adozione.**
   Gli ordini importati prima che il controllo esistesse erano tutti «da
   riconciliare»: **12.680 ordini** in una coda che nessuno deve lavorare.
   `normalizzaControllo()` (due `updateMany`) porta le carte PAID a
   `incassato_gateway` e gli ordini deluxy.it a `gestione = partner`, ma **solo
   dove nessuno ha deciso niente**. Risultato: 10.728 + 10.823 righe sistemate, e
   la coda vera scende a **240 ordini**. Senza questo passo l'adozione da Finance
   non adottava le gestioni, perché confrontava col default dello schema.
2. **Niente una-riga-per-volta verso Supabase.** La prima versione dell'import
   faceva un upsert per movimento: 11.000 movimenti × ~135 ms = mezz'ora, e su
   Vercel la server action muore prima. Ora: una `findMany` per capire cosa c'è,
   `createMany` per i nuovi, `UPDATE … FROM (VALUES …)` a blocchi di 100 per i
   cambiati, `$transaction` a blocchi di 50 per l'adozione. Quarta volta che
   questa trappola si presenta in questo progetto.
3. **L'abbinamento per numero non si fa a coppie.** Una regex per ogni
   ordine×movimento sono **18 milioni** di confronti. Ora si costruisce un indice
   `numero → movimenti` in una passata (`numeriIsolati()` in `controllo.ts`, che è
   l'unico posto dove la regola del «token isolato» è scritta: chi fa un confronto
   solo usa `causaleContieneNumero`, che si appoggia allo stesso indice).
4. Un `<form>` dentro un `<p>` è HTML non valido: React lo segnala come errore di
   hydration e rimonta la pagina. Succede appena si mette un bottone-azione dentro
   una frase.

### Link di pagamento Shopify (30/07/2026)
`src/lib/pagamento-link.ts` + `LinkPagamento.tsx`: sugli ordini non incassati si
chiede a Shopify `paymentCollectionDetails.additionalPaymentCollectionUrl` — la
pagina su cui **quel** cliente paga **quell'ordine**. Verificato su ordini veri
(#2242 Flowers, 255 € da incassare).

- **Funziona con i permessi che già ci sono.** Scope misurati sui tre negozi il
  30/07/2026: `read_all_orders read_audit_events read_channels read_customers
  read_orders write_channels write_customers write_orders`. Il link si **legge**,
  non si crea.
- ⚠️ **Non usare `draftOrderCreate`/`invoiceUrl` per far pagare un ordine che
  esiste già**: quando il cliente paga la bozza, Shopify crea un **ordine nuovo**
  → due ordini per una vendita, il vecchio non pagato per sempre, venduto doppio
  in Analisi e nei Margini. La bozza serve solo per far pagare qualcosa che
  ordine non è ancora, e richiede lo scope **`write_draft_orders`** che oggi i
  token NON hanno (va aggiunto nell'app della Dev Dashboard, poi il token si
  riconia da sé col client credentials grant).
- ⚠️ **Il link contiene un segreto** (`?secret=…`): non si salva nel database,
  non si scrive nei log, si chiede quando serve. Un link vecchio salvato sarebbe
  una bugia con dentro una chiave.
- **L'app non invia niente**: prepara il link (come le automazioni preparano i
  messaggi). Ogni richiesta lascia una riga in `EventoOrdine`.
- Esiste anche la mutazione `orderInvoiceSend` (manda l'email di pagamento
  dell'ordine, e `write_orders` c'è): **non è stata collegata** perché scrivere a
  un cliente è un'azione che va decisa da una persona, non da un bottone dentro
  una tabella.

### «Fatti pagare» — link per ciò che non è ancora un ordine (30/07/2026)
`/incassa` + `src/lib/incassa.ts` + modello `LinkIncasso`. Si scrivono righe
libere («100 rose × 4,50»), Shopify crea una **bozza d'ordine** e ne esce
l'`invoiceUrl`. Pagando, la bozza **diventa un ordine vero** che la sync importa:
nessun doppione, perché prima non c'era niente.

- ⚠️ **BLOCCATO SUL PERMESSO**: `draftOrderCreate` risponde
  `ACCESS_DENIED — Required access: write_draft_orders access scope or
  write_quick_sale`. Provato davvero il 30/07/2026 su Flowers: nessuna bozza
  creata. Va aggiunto lo scope nell'app della Dev Dashboard di ogni negozio
  (**non c'è nessun `shopify.app.toml` nel repo**: la configurazione è solo lì);
  il token si riconia da sé col client credentials grant, senza toccare l'app.
- La pagina **diagnostica da sé** quali negozi sono pronti, leggendo
  `/admin/oauth/access_scopes.json` (`negoziPronti()`): non fa fallire il bottone
  per scoprirlo, e l'errore di Shopify è tradotto in cosa fare.
- **L'URL non si salva** (contiene un segreto): `LinkIncasso` tiene solo cosa,
  quanto, a chi e com'è finita; il link e lo stato si richiedono a Shopify.
- Le bozze nascono con i tag `deluxy-orders` + `link-di-pagamento`: dentro Shopify
  si riconosce da dove vengono.
- ⚠️ **Non sostituire questa pagina con `orderCreate`** (che i permessi
  attuali consentirebbero): un ordine creato prima del pagamento comparirebbe in
  bacheca, in consegna e al Customer Service anche se il cliente non paga mai.

**MANCA / da decidere**
- **Aggiungere `write_draft_orders`** ai tre negozi: finché non c'è, `/incassa`
  mostra tutto ma non può creare il link. È l'unica cosa che manca.
- **La pagina `/ordini` di Finance non è stata rimossa**: la funzione è qui, ma
  togliere di là pagina, modelli e cron è una scelta contabile (i `Pagamento` con
  riferimento `PAY-…` nascono là e `/api/incassi` li espone) e **in quella cartella
  lavora un'altra sessione**. Da concordare prima di toccarla.
- Il costo dei 13.271 ordini senza costo si recupera solo abbinando gli addebiti:
  l'estratto parte dal 01/01/2025, quindi per gli ordini più vecchi non c'è niente
  da trovare, e la pagina lo dice invece di lasciarlo indovinare.

### Scelta rapida di anni e mesi + filtro per anno (30/07/2026)
Due cose sole, ma toccano `whereOrdini`, quindi anche le API.

- **`/analisi`: due file di pillole** (anni del registro, mesi dell'anno
  mostrato). Non introducono un modo nuovo di dire il periodo: calcolano il
  **`salto`** che la pagina già usa (`saltoAnno` / `saltoMese` in `analisi.ts`),
  così confronto, parità di giorni ed etichette restano gli stessi. Il periodo a
  mano (`da`/`a`) viene azzerato dalla scelta rapida, altrimenti vincerebbe lui e
  la pillola sembrerebbe non funzionare.
- **I mesi futuri sono `<span>`, non link**: `salto` sulla pagina è clampato a
  `>= 0` (non si va nel futuro), quindi un link a dicembre 2026 avrebbe portato a
  luglio fingendo di aver capito.
- **`anniConOrdini()`**: gli anni si leggono dal database (`DISTINCT EXTRACT(YEAR
  …)`), non da una lista scritta. Sui dati veri: 2020…2026.
- **Ordini (`/`) e API: filtro `anno=`** in `whereOrdini`. Sta in `AND` e non in
  `where.data` per **convivere** con `da`/`a` invece di sovrascriverli in
  silenzio. Il confine è la mezzanotte **italiana** (`inizioGiornoItaliano`,
  riusata da `analisi.ts`: una sola implementazione della regola del fuso).
- **Verifica incrociata sui dati veri**: `/?anno=2025` dà 4.640 ordini ·
  845.505,69 €; l'Analisi del 2025, che ci arriva con SQL suo, dà 4.490 validi +
  118 annullati + 32 rimborsati = **4.640**, e le somme tornano. È la prova che i
  due tagli dell'anno cadono nello stesso punto.
- ⚠️ `ordini.ts` ora importa `analisi.ts`. Non è un ciclo (analisi non importa
  ordini) ma va tenuto d'occhio: se un giorno `analisi.ts` avesse bisogno di
  qualcosa da `ordini.ts`, la regola del fuso va spostata in un modulo suo, non
  duplicata.

**⚠️ Trappola del fuso orario, trovata e corretta il 27/07/2026 — riguardava
anche codice già in produzione.** `Ordine.data` è `timestamp without time zone`
e contiene UTC. Scrivere `data AT TIME ZONE 'Europe/Rome'` **sottrae** due ore
invece di aggiungerle (Postgres interpreta il valore come ora di Roma e lo
converte in UTC). La forma giusta è `data AT TIME ZONE 'UTC' AT TIME ZONE
'Europe/Rome'`. Effetto misurato sull'archivio: **593 ordini finivano nel giorno
sbagliato** e **16 nel mese sbagliato** (3.627 €) — il consuntivo D2C che
Budgets legge da `/api/v1/ricavi` era sbagliato di quei 16. Corretto in
`ricavi/route.ts`, `marketing/route.ts` e `analisi.ts`.

### Tag di luogo, mittente e tipo di urgenza (27/07/2026)
Campi nuovi su `Ordine`: `mittenteNome/Citta/Provincia/Paese` (da
`billingAddress` di Shopify) e `urgenza`. Indici su `urgenza`, `citta`, `paese`,
`mittenteCitta`, `mittentePaese`.

- `src/lib/luoghi.ts` — normalizzazione delle città (per raggruppare) e nomi dei
  paesi in italiano dal codice ISO2, più la bandiera come emoji. `daLontano()` =
  paese del mittente diverso da quello di consegna.
- `src/lib/urgenza.ts` — il vocabolario (urgenza ≤1 giorno, pensiero ≤2,
  pianificato ≤7, evento ≤30, lontano oltre) e **due implementazioni della
  stessa regola**: in TS per la sync, in SQL (`SQL_URGENZA`) per il ricalcolo di
  massa. Se cambia una, va cambiata l'altra.
- `src/lib/urgenza-ricalcolo.ts` — riscrive l'urgenza di tutto l'archivio in una
  query (9.430 ordini in 2,9 s), toccando solo le righe che cambiano.
- Filtri nuovi (UI + API): `citta`, `paese`, `cittaMittente`, `paeseMittente`,
  `estero=si`, `urgenza` (`senza-data` per gli ordini senza data di consegna).
  `estero=si` confronta due colonne della stessa riga con un **riferimento a
  campo Prisma** (`prisma.ordine.fields.paese`).
- **Numeri veri dopo la risincronizzazione completa** (27/07/2026, 36,7 minuti,
  13.367 ordini aggiornati): 13.980 ordini, **13.279 col mittente** (i 701 senza
  sono quasi tutti ordini creati a mano), **3.790 mandati dall'estero** (US
  1.220, GB 793, AE 272), 6.313 urgenze · 1.131 pensieri · 1.538 pianificati ·
  476 eventi · 37 molto in anticipo · 4.485 senza data di consegna.
- **Esonimi**: «Milan»→Milano, «Rome»→Roma… solo se il paese è `IT`. Il filtro
  cerca tutte le grafie (`variantiCitta`), altrimenti cliccando il tag «Milano»
  i 171 ordini scritti «Milan» sparivano in silenzio.

**⚠️ Trappola trovata e corretta il 27/07/2026: la fascia oraria letta come data
di consegna.** `RE_DATA` contiene il termine generico `consegn`, e la chiave
`Fascia_Oraria_Consegna` **corrisponde** — arrivando prima nell'elenco degli
attributi, vinceva lei. Due effetti opposti, entrambi gravi:

- su **cakedesign.me** la fascia `08-12` veniva letta come **8 dicembre**: un
  ordine da consegnare lo stesso giorno finiva in agenda a dicembre;
- su **deluxy.it** la fascia `14-15` non è una data valida, quindi la lettura
  tornava `null` e la vera `Data_Consegna` **non veniva mai guardata**: ordini
  con una data di consegna che risultavano «senza data».

Corretto passando a `cercaAttributo` un'esclusione esplicita (`RE_FASCIA`): la
chiave più specifica vince. Verificato su 180 ordini reali (60 per negozio): 6
corretti, il resto invariato. Se in futuro si aggiunge un attributo, controllare
che non finisca per corrispondere a due regex diverse.

**Effetto misurato dopo la risincronizzazione di tutto lo storico**: gli ordini
con una consegna a più di 300 giorni sono passati da **110 a 4**, e le consegne
finte di dicembre 2026 da 3+ a **zero**. Erano appuntamenti sbagliati in agenda.

⚠️ Il tema di **cakedesign.me** scrive date rotte: `Data_Consegna =
"2026-undefined-27"`. Ora quegli ordini risultano «consegna non indicata»
(giusto: non lo sappiamo) invece di prendersi la fascia oraria. **Il bug è del
sito e va sistemato là**: finché c'è, quegli ordini non hanno una data.

### Etichetta «Nuovo»: ordini arrivati durante la sessione (27/07/2026)
`src/lib/sessione.ts` + cookie scritto dal **middleware** (una pagina server non
può metterne). Due cookie: `orders_sessione_da` (inizio sessione, muore col
browser) e `orders_visto_fino` (pulsante «Ho visto»). Il confronto è su
`Ordine.createdAt` — quando è entrato nel REGISTRO, non la data Shopify.

- Filtro nuovo `nuoviDa=<iso>` in `whereOrdini` (vale anche per le API); in
  pagina il pulsante usa `nuovi=si` e ci mette dentro il momento di sessione.
- Se manca il cookie non si segna NIENTE, invece di segnare tutto come nuovo.
- Provato creando due ordini finti (`orderId` con prefisso `gid://prova/`),
  verificando badge, contatore, filtro e «Ho visto», e poi cancellandoli.

### Riconciliazione: città dai tag e dal nome del prodotto (27/07/2026)
`src/lib/riconcilia.ts` + pulsante in Impostazioni + `npm run riconcilia`.
Campi nuovi: `cittaDedotta`, `cittaDedottaDa` (tag|prodotto), `cittaDedottaProva`.

- **Non si scrive MAI in `citta`**: la deduzione sta in un campo suo. In pagina
  il tag è 📍? e il titolo dice la fonte; il filtro `citta=` cerca in tutt'e due,
  altrimenti cliccando il tag l'ordine stesso non uscirebbe.
- **La controprova** (`fiduciaNeiTitoli`): una città trovata in un titolo si
  accetta solo se quei prodotti, negli ordini indirizzati, ci sono andati
  davvero. Bocciate dai fatti: Capri, Dubai, Magenta, Monza, Napoli, Sorrento,
  Venezia («Bouquet Venezia» 21 volte su 21 fuori Venezia).
- **Vocabolario dalle 239 città degli indirizzi veri** (≥3 occorrenze, ≥4
  lettere, confini di parola): non una lista inventata.
- **La categoria dai tag sta DENTRO `sqlCategoria`**, nella catena titolo → AI
  → tag → specialità. Metterla accanto al ricalcolo è l'errore che ho fatto
  prima: il primo «Ricalcola le categorie» la cancellava senza dire niente.
- Risultati veri: 894 città recuperate (571 tag, 323 prodotto), 2.421 restano
  senza; «non classificato» da 2.525 a **607**.
- ⚠️ 200 `update` in parallelo esauriscono il pool (limite 5): scrivere in
  blocco con `UPDATE … FROM (VALUES …)`. Terza volta che succede.
- **Esposta alle altre app dal 03/08/2026**: blocco `cittaDedotta { citta, da,
  prova }` in `serializzaOrdine`, quindi sia in `GET /api/v1/ordini` sia nel
  dettaglio. **Fuori da `spedizione.citta`**, che resta l'indirizzo vero. Numeri
  al 03/08: 894 ordini, 571 dai tag e 323 dal prodotto, **tutti senza città
  vera**. Il motivo per cui andava esposta non è la completezza: `?citta=` cerca
  già in tutt'e due i campi, quindi la risposta restituiva ordini con
  `spedizione.citta` vuota **senza dire perché fossero usciti** — il filtro
  sapeva una cosa che la risposta non diceva.
- **LIVE in produzione dal 03/08/2026**, verificato su
  `https://deluxy-orders.vercel.app/api/v1/ordini/cms0w1n1n0iwxi6kk7p2jhkyj`
  (#7154 → `{citta: "Firenze", da: "tag", prova: "Firenze"}`).
- ⚠️ **Le altre app leggono la PRODUZIONE, non il locale.** Un campo nuovo nelle
  API non arriva a nessuno finché non si fa il deploy: `deluxy-marketing` punta a
  `https://deluxy-orders.vercel.app` per impostazione predefinita
  (`ORDERS_URL` in `src/lib/sync-ordini.ts`). Push ≠ pubblicato.
- ⚠️ **Esporre un campo non basta perché a valle lo usino.** In deluxy-marketing
  l'import scrive `citta: spedizione.citta ?? undefined` e `cittaDedotta` la
  ignora; e anche correggendo quella riga, il suo confronto «è cambiato?»
  (`sync-ordini.ts`) guarda solo totale, stato, numero, origine e utmSource — la
  città non c'è, quindi sull'archivio già importato non riscriverebbe niente.
  **Da concordare con l'utente** se in Marketing la città dedotta debba fondersi
  con quella vera o stare in una colonna sua (in quella cartella lavora un'altra
  sessione).

## Trappole già pagate — leggere prima di toccare l'import

1. **La consegna non si deduce dalle note.** Un ripiego a espressione regolare
   leggeva «30 Luglio 08/12» come *8 dicembre*, mentre `08/12` era la fascia
   oraria. In un registro operativo una consegna sbagliata è peggio di una
   mancante: se manca l'attributo, l'ordine resta «consegna non indicata».
   Vale anche per il **biglietto**: nessuno dei tre negozi ha un campo
   strutturato, quindi si mostra la nota intera etichettata «possibile
   biglietto — da verificare», senza inventare il testo da stampare.
2. **L'annullamento non si deduce dal pagamento.** Gli ordini #2565, #2562,
   #2563 sono annullati ma risultano «pagato». Senza `annullatoIl` un ordine
   annullato è indistinguibile da uno valido.
3. **Non riscrivere ciò che non è cambiato.** La sync confronta l'ordine prima
   di aggiornarlo (`cambiato()` in `sync.ts`). Senza, il cron notturno — che ha
   pochi minuti — non finiva mai: 90 giorni significano migliaia di ordini a
   ~110 aggiornamenti al minuto. Misurato: stessa finestra da 1,0 min a 0,1 min.
4. **Se aggiungi un campo alle RIGHE, mettilo anche in `righeCambiate()`.**
   Le righe si riscrivono solo se quel confronto dice che sono cambiate. Le foto
   sono rimaste vuote (6 righe su 16.938) proprio perché il confronto guardava
   solo le personalizzazioni.
5. **Il pooler Supabase chiude la connessione sui giri lunghi.** È successo tre
   volte oltre l'ora. `conRiprova()` riprova l'intera pagina (è idempotente) con
   pause fino a mezzo minuto. Un primo tentativo con 18 secondi di pazienza non
   bastava.
6. **`product.featuredImage` non è accessibile**: richiede lo scope
   `read_products`, che i token non hanno. Resta `lineItem.image` (57% delle
   righe su deluxy.it, 93-96% sugli altri).
7. **Nelle `$queryRaw` la tabella va qualificata con lo schema.** Prisma mette
   `orders.` da sé nelle query dei modelli, ma non in quelle grezze: quelle si
   appoggiano al `search_path` della connessione e col pooler in modalità
   transazione ne capita una senza. Sintomo visto in dev: la stessa query
   funziona, poi risponde `relation "Ordine" does not exist`, poi rifunziona.
   Si usa `tabella("Ordine")` di `src/lib/db.ts` (legge lo schema da
   `DATABASE_URL`), mai `FROM "Ordine"` nudo.
8. **Un campo Shopify in più può far cadere TUTTO l'import.** Vale per i
   consensi come per le foto: prima di aggiungerlo alla query si prova sul
   campo, negozio per negozio (`customer { emailMarketingConsent { … } }` è
   accessibile col token degli ordini, provato il 26/07/2026). Se un giorno
   rispondesse ACCESS_DENIED, l'import fallisce per intero, non «salta il
   campo».
9. **`WITH … AS MATERIALIZED` conta.** La vista dei clienti classificati ha
   espressioni regolari nella SELECT: senza materializzare, Postgres le
   ricalcola per ognuno dei 48 aggregati del catalogo (2,0 s → 0,6 s). Per
   l'elenco invece conviene il contrario — le calcola solo sulle righe mostrate
   (0,6 s → 0,2 s). Da qui l'interruttore in `vistaClienti()`.

## La regola più importante delle API
**Gli ordini annullati non escono.** `/api/v1/ordini` li esclude e il dettaglio
risponde **410**. Un'app a valle li lavorerebbe come validi — e restano spesso
«pagati», quindi non si riconoscono dal pagamento. Chi deve gestirli passa
`annullati=inclusi`; la risposta dichiara sempre `annullatiInclusi`.

**Finance è l'eccezione** e li chiede già
(`deluxy-partner/src/lib/ordini-registro.ts`): senza, perdeva 221 ordini con
26.200 EUR di movimenti (rimborsi da quadrare e incassi su ordini poi annullati)
e soprattutto non *scopriva* più gli annullamenti — un ordine importato quando
era valido spariva dalla risposta e restava valido per sempre.

Chi consuma oggi: `deluxy-partner-import` (Finance), `deluxy-messaggi` e
`deluxy-budgets` (sola lettura, 26/07/2026).

### `/api/v1/ricavi` — il venduto per brand e per mese (26/07/2026)
Nuovo endpoint di sola lettura, nato per il **consuntivo D2C di Budgets**: le
vendite ai consumatori non passano da Finance, quindi la voce di budget più
grande dell'anno restava a zero. La somma la fa il database (raw SQL con
`date_trunc` sui mesi **Europe/Rome**): a pagine di 200 ordini un anno sarebbe
stato decine di chiamate.

Scelte da conoscere prima di toccarlo:
- esclude **annullati** *e* **rimborsati/stornati** (REFUNDED, VOIDED);
- conta **per intero i rimborsi parziali** — l'importo reso non è nel registro,
  quindi si dichiara in `esclusi.parzialmenteRimborsati` invece di stimarlo;
- restituisce il **lordo Shopify** (IVA e spedizione incluse): l'aliquota non è
  sull'ordine, lo scorporo lo fa chi consuma e deve dichiararlo.

## PUNTI APERTI al 30/07/2026 — in ordine di cosa sblocca cosa

**Le prime due sono le uniche che bloccano qualcosa di già costruito.**

1. **`write_draft_orders` sui tre negozi Shopify.** Senza, la pagina
   **/incassa** («Fatti pagare», link per «100 rose») non può creare il link:
   `draftOrderCreate` risponde ACCESS_DENIED — provato davvero. Si aggiunge
   nella **Dev Dashboard** dell'app di ogni negozio (nel repo non c'è nessun
   `shopify.app.toml`: la configurazione sta solo lì), poi si preme «Ho aggiunto
   il permesso — rileggi» in pagina, che fa scadere il token: dura ~24 ore e i
   permessi ce li ha dentro. La pagina dice da sé quali negozi sono pronti.
2. **1.105 «probabili aziende» da confermare** (pagina Clienti, lista
   *Probabili aziende*). Al 30/07 la tabella `TagCliente` è **vuota**: nessuna
   tipologia è mai stata confermata a mano, quindi tutte sono dedotte dal nome
   dell'acquirente — aziende 75, hotel 4, eventi 1, rivenditori 0, tutto il
   resto «privato». Sono **317.669 €** di venduto quasi certamente B2B contati
   come privati, in Analisi e in Marketing. Oggi si conferma **un cliente alla
   volta**: la cosa che sblocca la coda è la conferma in blocco dalla lista.
3. **Il costo fornitore c'è solo su 371 ordini su 14.027** (copertura 3% dello
   storico, **9% sul 2026**): il margine misurato è vero ma su una fetta. Si
   allarga dal **/controllo**, abbinando gli addebiti. ⚠️ L'estratto conto di
   Finance parte dal **01/01/2025**: per gli ordini più vecchi non c'è niente da
   trovare, e la pagina lo dice invece di lasciarlo indovinare.
4. **La pagina `/ordini` di Finance non è stata rimossa.** La funzione è qui
   (/controllo), ma togliere di là pagina, modelli e cron è una **scelta
   contabile**: i `Pagamento` con riferimento `PAY-…` nascono in Finance e
   `/api/incassi` li espone alle altre app. **In quella cartella lavora
   un'altra sessione**: concordare prima.
5. **Il bug del tema di cakedesign.me.** Il sito scrive `Data_Consegna =
   "2026-undefined-27"`: quegli ordini restano «consegna non indicata» (giusto,
   ma è un buco vero). **Si corregge nel tema**, in `sviluppi-siti-deluxy/` —
   non qui.
6. **Le occasioni «da precisare»** sono il 59% del venduto 2026: ricorrenze vere
   di cui nessuno ha detto il motivo. Si fanno leggere all'AI dalla pagina
   Eventi clienti — finché non si fa, la dimensione «occasione» dice poco.
7. **2.421 ordini senza città** dopo la riconciliazione e **607** senza
   categoria. Residuo onesto: né i tag né i titoli dicono niente.
8. **Riepiloghi AI dei clienti: 3 su 10.285.** Il motore c'è ed è provato; vanno
   generati in blocco dalla pagina Clienti (ogni cliente è una chiamata a
   pagamento, quindi il numero si sceglie).
9. **La spesa pubblicitaria non è in /marketing.** La pagina misura il fatturato
   per canale, non il ritorno: la spesa vive in **deluxy-marketing**, che
   espone già la spesa reale via API. Collegandola nascono ROAS e MER per canale.
10. **Gli stessi dati nel Customer Service.** `repeater`, `marketing`,
    `mittente` e `urgenza` escono dalle API ma le tabelle di deluxy-messaging non
    li mostrano. Lì lavora un'altra sessione: concordare prima.
11. **Finance: cosa fare degli annullati** — li riceve ma li tratta come normali
    e finiscono in coda di riconciliazione. Scelta contabile, aspetta l'utente.
12. **`ORDERS_APP_PASSWORD` da cambiare**: è comparsa in chiaro in una chat.

## MANCA / prossimi passi
0. **Finance: cosa fare degli annullati.** Ora li riceve ma li tratta come
   ordini normali e finiscono in coda di riconciliazione. Va deciso se
   ignorarli o trasformarli in voci di rimborso: **è una scelta contabile**, non
   tecnica, e aspetta l'utente.
1. **Password della UI**: `ORDERS_APP_PASSWORD` è stata scelta dall'utente ma è
   comparsa in chiaro in una chat. Da cambiare quando si può.
2. **Backfill facoltativi**: rischio frode e foto sugli ordini storici. Costano
   ore e sono stati esclusi per scelta — le foto servono su ciò che è in
   lavorazione, il rischio su ciò che si deve ancora spedire.
3. **Riclassificazione avanzata** (idee): regole automatiche brand→stato,
   assegnazione massiva dalla bacheca, editor delle dimensioni libere
   `classificazioni`.
4. **Liste, prossimi passi**: tipologia in blocco dalla lista «probabili
   aziende» (oggi si conferma un cliente alla volta), invio diretto dei pubblici
   a Marketing/Google/Meta invece dell'export CSV, liste salvate dall'utente con
   criteri propri.

## Come si lavora qui
- **Import storico**: `npm run import:storico` (tutto) o `-- 90` (giorni).
  Ripetibile senza doppioni, riprende da dove si era fermato perché salta ciò
  che è già a posto.
- **Verifica**: `npm run verifica:totali` confronta con Shopify negozio per
  negozio. Da lanciare dopo ogni import importante.
- **Sync quotidiana**: cron Vercel `/api/cron/sync` (protetto da `CRON_SECRET`).
- La sync **non tocca mai** la classificazione Deluxy; la categoria di pagamento
  si aggiorna solo se non è stata corretta a mano (`categoriaPagamentoManuale`).
- Le chiavi API si vedono in chiaro una volta sola (nel DB c'è solo lo SHA-256).
- **Attenzione**: in questa cartella hanno lavorato due sessioni Claude in
  parallelo (contro la regola 4). Prima di partire, `git status` e `git log`.
