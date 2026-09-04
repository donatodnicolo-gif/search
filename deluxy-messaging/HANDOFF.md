# Handoff — Deluxy Customer Service

## 04/09/2026 (15) — in produzione, e il push da un worktree separato

**LIVE**: `dpl_DJkyvCGN1gzkKtRBTPp4PYNHmQjj` →
`deluxy-messaging-jkfp48hdo-deluxy.vercel.app`, e il dominio
`deluxy-messaging.vercel.app` ci punta (verificato con `vercel inspect` sul
dominio, non solo con «Ready»). ⚠️ Verificato anche **dal bundle**: la classe
`colonna-dettaglio` c'è nel CSS servito in produzione
(`/_next/static/css/6135e456df876505.css`). «Ready» dice che la build è andata,
non che il dominio serva quella.

⚠️ **Build su Vercel, non precompilata.** `vercel build --prod` muore su questa
macchina con `EPERM: operation not permitted, symlink 'chat\[codice].func'`: è
la trappola già scritta in memoria (i symlink dell'output Vercel su Windows
senza modalità sviluppatore). Quindi `vercel deploy --prod`, che costa minuti di
build a Vercel. Resta il modo di pubblicare da qui finché quella non si risolve.

### ⚠️⚠️ Il push è dovuto passare da un worktree separato

`C:\Users\nicol\scoutwt` e `C:\Users\nicol\app` sono **due worktree dello stesso
repository** (`donatodnicolo-gif/search`), e ce ne sono altri sei. Al momento del
push:

- il branch locale `scout-ui` era **divergente** dal remoto: gli stessi commit
  di Orders esistevano due volte con hash diversi (75a6a7bc/fda980c0,
  04cda80c/59718132, e98c31a5/80d56c7e, 5f162d1c/17d1d8f1);
- il working tree aveva **modifiche non committate di un'altra sessione** su
  `deluxy-mail/HANDOFF.md` e due file nuovi, e i commit in arrivo toccavano
  proprio quel file: né rebase né merge né checkout erano possibili senza
  metterci le mani.

Soluzione, senza toccare niente di altri: `git worktree add` su
`origin/scout-ui`, **cherry-pick dei soli quattro commit di CS**, `git diff` per
verificare che i file di `deluxy-messaging` fossero identici al mio lavoro, push,
e worktree rimosso. Rete di sicurezza `rete-sicurezza-04-09` sul vecchio HEAD,
ancora lì.

⚠️ **Il branch locale resta divergente**: la prossima sessione che lavora qui lo
troverà così. Sistemarlo vuol dire toccare i file non committati di AI Mail,
che sono di un'altra sessione (worktree `Temp/wt-mail`).

## 04/09/2026 (16) — perché il checkout rifiuta Napoli (analisi, niente toccato)

Segnalazione dell'utente con la foto del checkout: «The product in your cart is
not available for delivery to your location», indirizzo Via Toledo 46, 80134
Napoli.

**Non è un difetto: è la configurazione di Shopify, e dice la verità su com'è
impostata oggi.** Letti i profili di consegna del negozio `deluxy.it`
(Admin API, sola lettura):

| profilo | varianti | province coperte |
|---|---|---|
| **Profilo generale** (predefinito) | 500 | BG, CO, MI, MB, PV, VA con «Consegna in Giacca, Cravatta e Guanti Bianchi»; FI e RM con «Consegna Deluxy» |
| **Nikky** | 133 | **solo MB** (Monza e Brianza) |

Napoli non sta in nessuna zona, quindi nessuna tariffa si applica e Shopify
ferma il carrello. **Otto province in tutto**, e 133 prodotti che si possono
comprare solo per Monza e Brianza.

**Misurato sui nostri ordini** (negozio Deluxy, consegne in Italia, 599 ordini):

| | |
|---|---|
| dentro le zone | 523 |
| **fuori dalle zone** | **13** (1.885 €) |
| provincia non ricavabile | 63 |

I 13 fuori zona ci sono arrivati lo stesso: sono ordini creati **a mano** (bozze
dal Customer Service), che le zone di consegna non le attraversano. Cioè la
strada per vendere fuori zona esiste già, ma passa da una telefonata.

**La domanda vera, che è dell'utente**: quel limite è un fatto del servizio o un
residuo? I nostri dati dicono che l'operatività è nazionale — i fornitori hanno
consegnato per noi a Napoli, Sorrento, Castellammare, Bosa, Tropea, Palermo,
Porto Rotondo, Quartu Sant'Elena. Il valet in giacca e guanti no, quello è
davvero locale. Oggi i due stanno nello stesso profilo, quindi **il limite del
valet vale per tutto il catalogo**.

**Le tre strade, in ordine di quanto costano:**

1. **Zona «Resto d'Italia» nel profilo generale**, con una tariffa che copra il
   costo di far preparare a un fiorista locale. ⚠️ Le province vanno elencate
   una per una: Shopify non lascia la stessa provincia in due zone dello stesso
   profilo, quindi non si può mettere «Italia» accanto alle otto che ci sono.
2. **Separare i due servizi in due profili**: il valet resta sulle otto
   province, i prodotti che un fioraio locale può fare vanno su un profilo
   nazionale. È la strada giusta se il catalogo ha davvero due nature.
3. **Lasciare com'è** e continuare a prendere gli ordini fuori zona al telefono,
   come per i 13 di quest'anno.

🔴 **Non ho toccato niente**: cambiare le zone di consegna di un negozio vivo
cambia cosa può comprare un cliente, e la decisione è dell'utente. Da verificare
anche sugli altri due negozi (`deluxyflowers.com`, `cakedesign.me`): il
connettore Shopify di questa sessione è agganciato solo a `deluxy.it`.

## 04/09/2026 (14) — la salute di Orders, e l'ordine non conforme non va avanti

Regola dell'utente: «importa lo stato di Orders; se lo stato non è conforme
l'ordine non può essere mandato avanti».

Lo stato è la **salute** che Deluxy Orders ha introdotto oggi stesso (commit
`75a6a7bc`): una parola sola per ordine, fra **conforme · a rischio · non
pagato · cancellato · nullo**. Arriva già dalla sua API, in cima alla risposta
di `GET /api/v1/ordini`.

### ⚠️⚠️ Si CHIEDE, non si copia

Sembrava naturale importarla in colonna con la sync. È sbagliato, e il motivo
sta scritto nel file di Orders: **di là non è una colonna**, si ricalcola dai
campi veri (annullamento, motivo, pagamento, rischio) a ogni lettura. Una copia
qui sarebbe vecchia **proprio nel momento in cui conta**: un ordine annullato
stamattina resterebbe «conforme» fino al prossimo giro di sync, ed è quello il
giro in cui qualcuno lo manda a un fioraio.

Quindi la salute si chiede nel momento della decisione: quando si apre la
scheda, e di nuovo quando si preme un passo. E non si ricalcola in casa: sarebbe
la stessa regola in due posti, e il giorno che di là la cambiano qui resterebbe
quella vecchia senza che nessuna delle due schermate dia errore.

### ⚠️⚠️ Il buco che gli annullati aprivano, misurato

`GET /api/v1/ordini` **esclude gli ordini annullati** per difesa (un'app a valle
potrebbe lavorarli come validi). Ma chi chiede «com'è messo questo ordine» ha
bisogno proprio di quelli: senza, un ordine annullato tornava «non è nel
registro» → «non lo so» → **passava**. Misurato su **#12858**, che risultava
sconosciuto e adesso risulta `nullo`. `ordineDaOrders` ha ora l'opzione
`conAnnullati`, e la salute la usa.

### I tre casi, tenuti distinti a vista

`conforme` · `non conforme, ed ecco quale` · **`non lo so`**. Il terzo non
diventa né un divieto né un permesso silenzioso: si passa, e a schermo si legge
«non ho potuto chiedere la salute a Orders, il controllo non è stato fatto». Se
«non lo so» valesse «no», Orders giù fermerebbe tutto il lavoro dell'azienda; se
sparisse dentro un sì muto, la regola si aggirerebbe staccando la spina.

### Cosa si blocca, e cosa no

⚠️ **Solo i passi che mandano avanti**: ricerca fornitore, comunicazione, in
pagamento, attesa consegna, in app. **«Gestito» e «Da iniziare» restano sempre
cliccabili**: un ordine annullato dal cliente deve poter essere chiuso,
altrimenti resta in lista per sempre e la regola si impara ad aggirarla.

⚠️ Bloccato anche **«Manda in app»** (rotta `/api/ordini/[id]/in-app`), e lì
prima che altrove: di là nasce una consegna vera, con un valet e una paga, e non
si disfa spegnendo un'etichetta.

⚠️⚠️ **Il divieto è nelle ROTTE, non nei bottoni.** I passi spenti servono a non
far perdere tempo; il no lo dà il server con un 409 e il motivo scritto. Una
regola che vive solo nell'interfaccia si aggira con una chiamata, ed è la
trappola già pagata qui («una server action è un endpoint»).

### Misurato sui 125 ordini aperti, prima di scrivere la regola

| salute | ordini aperti |
|---|---|
| conforme | 97 |
| nullo | 21 |
| non pagato | 6 |
| a rischio | 1 |

**28 ordini verrebbero fermati, e sono tutti in «Da iniziare»**: nessun lavoro
in corso si rompe. Fra questi #2714, che è anche una delle contestazioni aperte.

### Dove si vede

- Una **fascia rossa in testa al pannello** quando la salute non è conforme, col
  motivo in italiano. Sta in cima perché è la prima domanda: se questa vendita
  non vale, tutto quello che c'è sotto è lavoro da non fare.
- Un badge **conforme** accanto a quello dello smistamento quando lo è.
- Nella lavorazione, la spiegazione e i passi spenti col `title` che dice perché.

### ⚠️ La trappola pagata di nuovo (quinta volta)

`DettaglioOrdine.tsx` è un componente **client**: importando `salute-ordine.ts`
— che parla con Orders e quindi con la configurazione cifrata — la build muore
con «Reading from `node:crypto` is not handled by plugins». Le regole pure
stanno in **`src/lib/salute-regole.ts`**, che non importa niente, come già
`fornitore-ordine.ts`, `turni.ts`, `refusi.ts` e `glossario.ts`. Trovato
guardando la pagina, non dal typecheck: `tsc` passava.

### Più: `ignoreCommand` nel vercel.json

Questa app non ce l'aveva, e la regola del repo lo pretende su tutte
(`git diff --quiet HEAD^ HEAD -- .`): senza, ogni push del monorepo la
ricostruisce su Vercel. 🔴 Nella cartella `scoutwt` ce l'ha **solo**
`deluxy-partner`: le altre otto no.

## 04/09/2026 (13) — il pop-up dell'ordine riorganizzato, con due agenti ostili

Chiesto dall'utente: «riorganizza questo pop-up, analizza prima con un agente
ostile tutte le info che mostra e poi allinea tutte le informazioni in modo che
siano organizzate con logica; approva il risultato finale e procedi a mostrarlo
con l'agente ostile».

Due giri di `ux-ostile`: il primo ha censito **ogni** blocco del pannello e ha
prodotto 16 accuse (12 piene, 4 ridimensionate, 6 refutate); il secondo ha
ricevuto la riorganizzazione col mandato di demolirla, e ha trovato altre 9 cose
vere. Tutte e nove corrette prima di questo commit.

### Il difetto strutturale: la posizione dei riquadri dipendeva dal contenuto

⚠️⚠️ `.griglia-dettaglio` era `column-count: 3`, cioè un **flusso**, non una
griglia: il browser distribuiva i riquadri per pareggiare le altezze. Bastava
che il cliente avesse telefonato, o scritto tre mail, perché la card «Ordine» —
indirizzo, totale, i passi, tutte le azioni — passasse dalla seconda colonna
alla terza. Chi apre dieci ordini di fila cercava l'indirizzo ogni volta a
un'altezza diversa; l'ordine di Tab e dei lettori di schermo restava quello del
DOM, che a schermo non si vedeva più.

E `gridColumn: '1 / -1'` sulla card dei fornitori — scritta per prendere tutta
la larghezza, con tanto di commento che lo dichiarava — **dentro un
`column-count` non esiste**: usciva larga 385px come le altre, e la griglia
delle tessere (`minmax(260px, 1fr)`) ci stava a **una per riga**. Cioè
l'elenco «in una striscia stretta» che quel commento diceva di aver eliminato.

### Come è organizzato adesso

Tre colonne esplicite, ognuna con un mestiere, e ogni riquadro ha una casa fissa:

| colonna | che cosa | contiene |
|---|---|---|
| 1 · **IL LAVORO** | che cosa va fatto, e chi lo prepara | piattaforma consegne · Chiedi al fornitore · Chi prepara quest'ordine |
| 2 · **IL CLIENTE** | cosa ci siamo detti, cosa resta da fare | Ha telefonato · Diario · Messaggi del cliente |
| 3 · **L'ORDINE** | chi, dove, quando, quanto, a che punto, cosa si può fare | la card Ordine con lavorazione, riconsegna, unione, fattura, azioni |

Sotto le tre colonne, a **tutta larghezza**, la fascia «Fornitori in provincia
di X». Misurato a 1400px: colonne 385px ciascuna allineate in testa, fascia
1187px, **quattro tessere per riga** invece di una.

⚠️ Il riquadro «Se ne sta occupando la piattaforma consegne» è salito in cima
alla colonna 1. Prima stava a metà della card «Ordine», in un'altra colonna: il
suo stesso commento diceva «si vede PRIMA delle azioni, chi cerca un fornitore
deve accorgersene prima di cominciare», e chi cerca un fornitore da lì non
passava mai. Il costo di non vederlo è telefonare a un fioraio per un ordine che
un partner sta già preparando.

⚠️ **Riconsegna e Unione sono diventati `<details>` chiusi**: erano due moduli
sempre aperti, per casi rari, fra «a che punto siamo» e le azioni vere. I due
bottoni della testata li aprono (`vaiAlRiquadro` mette `open = true`). Nascono
**aperti** quando hanno qualcosa da dire: un link di riconsegna già creato, un
ordine unito, o un esito da leggere.

### Le nove cose che il secondo ostile ha trovato, e che sono corrette

1. ⚠️⚠️ **Fra 800 e 1150px tornava il buco.** Tre colonne in due posti mettono
   la terza da sola sulla riga sotto, con mezzo pannello bianco alla sua destra
   per tutta la sua altezza — lo stesso difetto che il flusso a colonne evitava.
   Adesso a quelle larghezze sopra stanno **il lavoro e l'ordine**, sotto a
   tutta larghezza **il cliente**. Misurato a 1000px: due colonne da 442px in
   riga 1, la terza a 899px sotto. A 760px una colonna sola, nell'ordine giusto.
2. ⚠️⚠️ **«Disfa l'unione» richiudeva il riquadro e si portava via l'esito.**
   Svuotando `ordine.unitoA` la prop `open` passava da vero a falso e React
   scriveva `open=false`: il messaggio del server — l'unica cosa che dice se è
   andata bene — non si leggeva mai. Adesso `esitoUnione` tiene aperto.
3. **«A chi abbiamo già chiesto» mancava sugli ordini senza provincia.** Quel
   dato non dipende dalla provincia (viene da `/api/ordini/[id]/chiesti`), ma
   stava dentro il ramo con la provincia: due persone potevano scrivere allo
   stesso fioraio senza saperlo, che è il caso per cui quella riga esiste.
4. **Il badge «su Orders: X» poteva sfondare la colonna** (una pillola è
   `inline-flex` e non va a capo, dentro una `dd` il cui minimo è il
   min-content): `min-width: 0` sulla cella e `max-width: 100%` sulla pillola.
5. **La colonna 1 partiva 12px più in basso delle altre**: due `marginTop: 12`
   inline ereditati dalla vecchia posizione. Lo stacco lo dà il `gap`.
6. **Il titolo del riquadro Unione ripeteva il corpo**: «Unito a #1777» due
   volte, una sotto l'altra.
7. **La misura 403px era impossibile** (403 × 3 + 32 = 1241, più larga del
   pannello): ricopiata dal primo audit senza rifare il conto, e già scolpita in
   due commenti. È 385px.
8. **Un commento raccontava come risolto un difetto vivo**: il bottone WhatsApp
   compare anche sui numeri fissi (bastano 8 cifre) e porta a una chat che non
   esiste, segnando «chiesto» un fornitore a cui non è arrivato niente. Il
   commento adesso dice che è aperto.
9. **La frase del ramo senza provincia diceva «qui accanto»** mentre la fascia
   sta sotto.

Più, nello stesso giro: senza provincia la fascia **non sparisce più** (c'era
`: null`, e chi lavorava ne concludeva che in quella zona non abbiamo
fornitori); il badge dello stato di Orders è etichettato, perché erano due
tassonomie diverse disegnate identiche; e nelle tessere c'è il **numero di
telefono** come link, che c'era nei dati e serviva solo a comporre il link di
WhatsApp.

### 🔴 Quello che ho lasciato aperto, e perché

- ⚠️⚠️ **Due messaggi allo stesso fornitore con due orari diversi.** Il
  messaggio della colonna 1 dice «con **ritiro** 15-19» (`ritiro.ts`, un'ora
  prima); quello delle tessere dice «**consegna** a … all'ora 16-20»
  (`messaggio-fornitore.ts`, fascia grezza). Le due etichette sono corrette e
  diverse, ma un fioraio che legge la seconda prepara per le 16 e il valet
  arriva alle 15. ⚠️ **La riorganizzazione ha reso questo secondo percorso
  quattro volte più raggiungibile** (una tessera per riga → quattro). Non l'ho
  toccato di mia iniziativa: cambia il testo che arriva davvero a un fornitore,
  ed è lo stesso testo dell'app di ricerca. **Serve la decisione dell'utente.**
- La quota indicativa al fornitore si calcola su `ordine.totale` e non su
  `totaleConUniti`: sugli ordini uniti propone una cifra su metà vendita.
- La lista dei fornitori si richiude a ogni clic sui passi di lavorazione
  (l'effetto dipende dall'oggetto `ordine` intero, non dal suo id).
- Segnare il passo «In App» a mano fa sparire il modulo «Manda in app». Non è
  un vicolo cieco (`Interrompi: lo facciamo noi` lo riporta indietro), ma adesso
  l'affermazione «se ne sta occupando la piattaforma» sta in cima al pannello,
  quindi una etichetta messa a mano è più visibile di prima. Accanto c'è la
  smentita: «Nessuna consegna creata da qui».

## 04/09/2026 (12) — il diario sale in cima alla colonna dei messaggi

Chiesto dall'utente, con la foto del riquadro: «metti questa cosa in Messaggi
cliente in alto».

Il diario stava **in fondo alla prima colonna**, sotto i bottoni per scrivere al
cliente: un punto che si raggiunge solo scorrendo. Ma è **la lista di quello che
resta da fare su questa vendita**, cioè la prima cosa da leggere prima di
toccare l'ordine. Adesso è un riquadro suo, in cima alla colonna centrale, sopra
«Messaggi del cliente».

- `DiarioOrdine` ha una prop nuova, `inCima`: in cima al riquadro il bordo
  superiore e il margine sopra **non servono** — sono l'attacco a quello che
  c'era prima, e lassù disegnano una riga che non separa niente.
- L'avviso «Chiuse N note del diario: l'ordine è gestito» si è spostato con lui:
  è la sua risposta, e restare dov'era vorrebbe dire mostrarlo lontano dalle
  note di cui parla.
- Invariato: sugli ordini di solo archivio il diario non c'è (la riga si
  scriverebbe e non si ritroverebbe più).

## 04/09/2026 (11) — nell'elenco dei nostri fornitori resta SOLO la provincia certa

Chiesto dall'utente subito dopo la correzione della sera: «mostra solo quelli di
cui sei certo della provincia».

⚠️⚠️ **Il ripiego era rimasto acceso.** Con la provincia chiesta a Google
l'elenco di Genova si era pulito, ma quando in zona non c'è nessuno la lista
**ripiegava** su quelli di cui non si ricava la provincia — e su #2867 restava
lì «Fiorista Donatella · non sappiamo dove ha consegnato», sotto un titolo che
promette fornitori in provincia di GE. Un ripiego che nessuno ha chiesto è
rumore: chi legge non sa che quella riga vale meno delle altre.

Adesso nell'elenco c'è **solo `inZona`**, cioè solo chi ha una provincia certa e
uguale a questa. Se non c'è nessuno, l'elenco resta vuoto e lo dice.

⚠️ **Nessuno sparisce**: la riga «Fuori dall'elenco» ha adesso **due bottoni
separati**, perché le due ragioni non sono la stessa cosa —
«**N consegnano altrove**» è un fatto (province note e diverse), «**M non
sappiamo in che provincia**» è un buco nostro (comuni non ancora risolti, o
ordini senza nessuna città). Si aprono tutti e due, con città e province
scritte. Chi ha bisogno di telefonare lo stesso li trova con un clic.

Su #2867 (Genova, fiorai): elenco **vuoto**, e sotto «54 consegnano altrove · 1
non sappiamo in che provincia · 16 fanno l'altro mestiere».

## 04/09/2026 (10) — la scheda del prodotto, di fianco all'ordine

Chiesto dall'utente: «nel pop-up della vendita fai aprire dettaglio prodotto
nella relativa colonna che apre un pop-up di fianco con i dettagli del prodotto
con provenienza app merchandising».

- **Dove**: colonna «Chiedi al fornitore», sotto ogni riga, bottone
  **Dettaglio prodotto**. Il pannello (`.scheda-prodotto`) è **ancorato al bordo
  destro**, non centrato: una seconda modale coprirebbe l'ordine, e le due cose
  servono insieme — si legge il prodotto mentre si scrive al fornitore.
- ⚠️ **Niente copie**: il prodotto ha una casa sola ed è Merchandising (Standard
  §7). `src/lib/merchandising.ts` chiama `GET /api/v1/prodotti?q=` con la chiave
  nell'header **dal server** (`/api/prodotto-merchandising`, verificata 307 verso
  /login senza cookie). Qui non nasce nessuna tabella e nessun campo.
- ⚠️⚠️ **Prima per SKU, poi per nome, e si DICE quale**: la rotta di
  Merchandising cerca per nome, quindi lo SKU si usa dopo, sulle righe tornate.
  Un match per nome porta un avviso in pannello: sul catalogo (4.632 prodotti)
  lo stesso bouquet esiste in più taglie, e un costo di produzione letto sulla
  scheda sbagliata è peggio di nessun costo. **Nessun ripiego sul primo
  risultato.**
- I tre «no» sono distinti e detti distinti: *non configurato* (si risolve in
  Impostazioni), *non trovato* (in Merchandising non c'è), *errore* (l'app non
  risponde). `leggiJson` per la sessione scaduta, come ovunque.
- Impostazioni → **Merchandising**: `merchandisingUrl` (nella lista bianca degli
  indirizzi) e `merchandisingApiKey` (in `CHIAVI_CIFRATE`, campo segreto).

🔴 **MANCA la chiave, ed è un gesto dell'utente**: in Merchandising →
Impostazioni → Chiavi API se ne crea una di sola lettura (`dlxm_…`, si vede una
volta sola) e si incolla in Impostazioni → Merchandising. Verificato il
04/09/2026: di là esiste **una sola chiave**, `deluxy-platform`, e l'hash non si
può riusare. Finché manca, il pannello dice che manca la chiave.

⚠️ **Limite noto dell'API di Merchandising**: `brief`, `materiali`, `palette`
NON sono fra i campi pubblicati — e `materiali` sarebbe il dato più utile a chi
telefona a un fioraio. Va aggiunto **di là**, nella rotta `/api/v1/prodotti`,
non letto da qui.

## 04/09/2026 (9) — «non si sa dove consegnano»: adesso la provincia si CHIEDE

Segnalazione dell'utente sull'ordine **#2867** (consegna a Genova): «non capisco
ancora perché mi escono fornitori di province che non sono Genova (da civico 95
in giù)». Aveva ragione, e il riquadro si contraddiceva da solo — titolo «non si
sa dove consegnano», righe «ha consegnato a Marnate, Galliate, Cadrezzate con
Osmate».

⚠️⚠️ **Non era il filtro del 29/08 a essere rotto: era il dato.** La provincia si
ricavava da `siglaProvincia`, che risponde **solo sui capoluoghi**. Marnate non è
un capoluogo → provincia ignota → `vicinanza 0` → «non si sa» → e chi non si sa
resta in elenco (regola giusta). Risultato: l'elenco di Genova pieno di gente di
Varese.

⚠️ **La strada dell'indirizzo è chiusa e l'ho misurata**: sugli 80 ordini con un
fornitore scritto, `indirizzo` è vuoto su **79** (resta in Orders). L'unica cosa
che c'è è il nome del comune.

**Quindi la provincia si chiede, non si indovina** — `src/lib/comuni.ts`:

- Google Geocoding, **una volta per comune**, e la risposta resta in
  `Impostazione.comuniProvince` (JSON). I comuni distinti in tutto l'archivio
  sono **74**.
- Tetto di **12 comuni per apertura di scheda** e 4 in parallelo: questo giro sta
  dentro la scheda di un ordine. I restanti si imparano alle aperture dopo, e
  intanto nessuno sparisce (chi non è ancora stato chiesto resta «non si sa»).
- `!` = trovato ma fuori Italia, `?` = Google non sa dirlo: si conservano per non
  richiedere all'infinito, e da fuori valgono «non lo sappiamo».
- Errore di rete: **non si scrive niente** e al giro dopo si riprova.
- ⚠️ `province.ts` conosce ora le **province soppresse** (OT→SS, OG→NU, VS→SU,
  CI→SU): Google risponde ancora «OT» per Porto Rotondo e «SS» per Romazzino,
  che sono a tre chilometri.

⚠️ **Da qui il segnale può ESCLUDERE**, al contrario dei comuni del registro
Anagrafiche che potevano solo includere. È lecito solo perché è un fatto letto:
se la risposta manca, il fornitore torna ignoto e resta in elenco.

**Misurato sui dati veri il 04/09/2026** (`nostriFornitori()`, 71 fornitori,
56 comuni su 74 risolti):

| consegna | prima | dopo |
|---|---|---|
| Genova (GE) | 0 in zona · 27 «non si sa» · 28 altrove | 0 in zona · **1** «non si sa» · 54 altrove |
| Roma (RM) | 0 in zona | **1 in zona** (Valmontone) |
| Olbia (SS) | 0 in zona | **2 in zona** (Porto Rotondo, Porto Cervo) |
| Como (CO) | 1 in zona | **3 in zona** (Blevio, Cadenabbia, Tremezzo) |

⚠️⚠️ **E chi esce si può guardare**: «Fuori dall'elenco: N consegnano altrove»
adesso **si apre** e mostra nomi, città e province. Un filtro che toglie 54 righe
e non si può controllare è un filtro di cui ci si fida per fede.

Corretto anche il testo che si contraddiceva: «non si sa dove consegnano» →
**«non sappiamo in che provincia consegnano»**.

## 04/09/2026 (8) — la fotografia ricontata (la sezione MANCA era ferma al 26/08)

Ricontato sul database di produzione (`node scripts/conta.mjs` più letture di
sola lettura). ⚠️ Fra parentesi il 26/08, che è quello che l'handoff diceva
ancora.

- **Ordini 1.514** (1.371): gestito 1.392, da_gestire **98**, attesa_consegna 17,
  in_pagamento 4, ricerca_fornitore 2, comunicazione 1. **404 senza data di
  consegna.**
- **Conversazioni 747** (644) — email 483, WhatsApp 190, widget 48, Instagram 26,
  **Messenger 0**. **5.220 messaggi**, 5 non lette, **165 prese in carico** (91).
- **Utenti 3**: nicolo (admin), federica e **eva.ascenzi** (operatori). ⚠️
  Riccardo non c'è più: qualunque conteggio storico fatto sul NOME lo perde.
- 🔴🔴 **CHARGEBACK: 4 da rispondere, e due scadono OGGI.** #12726 (99,94 €) e
  #1741 (103,34 €) scadenza **04/09/2026**; #2714 (84,54 €) il **10/09**; #12829
  (115,77 €) il **17/09**. Su tutti e quattro: **prove mai inviate** e **bozza a
  ZERO caratteri**. Le perse restano **11** (2.257,66 €).
- 🟡 **Richieste di pagamento 81** (22), e adesso **35 sono partite davvero**
  (erano ZERO): canale `transactions`, tutte e 35 `in_attesa` di là. Le altre
  **46** (4.898 €) non sono mai uscite, e il motivo è scritto sulla riga:
  33 «Nessun canale di pagamento configurato», 7 «Partner non configurato»,
  **5 «IBAN non valido: il checksum non torna»**, 1 link di pagamento non
  completo. ⚠️ La più recente è del **26/08**: da quando il canale Transactions
  è acceso non se ne è più fermata nessuna.
- 🔴 **La piattaforma consegne è ancora scollegata**: `piattaformaApiKey` **non
  esiste come riga** in `Impostazione`, quindi `appStato` e `appConsegnaStato`
  sono vuoti su **1.514 ordini su 1.514** e il cron dei 15 minuti gira a vuoto.
  Il pezzo mancante è sempre lo stesso gesto: chiave di sola lettura di là,
  incollata in Impostazioni.
- **Reclami 9, tutti aperti** (6), due di gravità 3 (#12790, #12826); il più
  vecchio è #1731, aperto il **27/07**. **Rimborsi «richiesto» 6** (4).
- **Note di diario 31**, di cui **18 da fare**. **Turni: 5 righe**, invariato.
- Sync ordini vivo: ultimo giro **04/09 17:50 UTC**, «ok: 45 ordini, 0 nuovi»;
  webhook Meta ricevuto alle 17:50.
- Chiavi ancora **vuote**: `partnerUrl`, `searchUrl`, `waBusinessAccountId`,
  `widgetTitolo`/`widgetMessaggio`, `shopifyToken` (giusto),
  `openaiModelloImmagini`, `openaiModelloRisposte`. **`apreSulSito` false** su
  tutti e tre i siti, invariato dal 17/08.


## 02/09/2026 (8) — la sezione Statistiche

Chiesto dall'utente: «crea una sezione statistiche dove fai vedere tutte le KPI
dell'app — esempio % di reclami su totale, tempo di gestione, tempo medio di
risposta a chat, ecc.».

`/statistiche` (sidebar → Qualità, e fra gli strumenti in Oggi), con il periodo
a 7 / 30 / 90 giorni e 12 mesi.

### Le tre regole della pagina — sono di sostanza, non di stile

1. ⚠️⚠️ **Ogni percentuale porta la sua base.** «1,8%» da solo non si giudica;
   «1,8% — 8 reclami su 445 ordini» sì. E una percentuale su base zero è
   **`—`**, mai «0%»: «0% di reclami su 0 ordini» sembra un complimento e non
   vuol dire niente.
2. ⚠️⚠️ **Mediana, non media**, con la media accanto in piccolo. La distanza fra
   le due È un dato: la risposta in chat ha **mediana 2 minuti e media 72**,
   cioè quasi tutto è immediato e qualcosa resta indietro un giorno. Con la sola
   media si sarebbe detto «rispondiamo in un'ora», che non è vero per nessuno.
3. ⚠️⚠️ **Chi non ha il dato si esclude, non vale zero.** Un ordine senza data di
   chiusura non è chiuso in zero minuti: ogni tempo dice **su quanti casi** è
   calcolato.

### Cosa mostra (numeri veri, 30 giorni al 02/09/2026)

- **Ordini** 445 · venduto **83.492 €** · scontrino **187,62 €** · chiusi 85,4%
  · **tempo di gestione: 15 ore** di mediana (media 32 ore, su 373 ordini)
- **Servizio** 555 conversazioni · 2.926 ricevuti / 1.483 inviati ·
  **risposta 2 min** di mediana (media 72, su 1.129 risposte)
- ⚠️⚠️ **278 conversazioni su 555 (50,1%) senza NESSUNA risposta.** È il numero
  che la mediana nasconde — una conversazione mai risposta non ha un tempo,
  quindi dalla media sparisce. Ha un riquadro suo apposta. Da guardare: quante
  di quelle sono newsletter e mail di servizio e quante clienti veri.
- **Qualità** reclami **1,8%** (8 su 445), gravi 25% (2 su 8), rimborsi 3
  chiesti / 0 eseguiti
- **Pagamenti** 73 richieste, **98,6% pagate**, mediana **7 minuti**
- **Lavorazione**: dove stanno gli ordini, a barre (gestito 380, da_gestire 46,
  attesa_consegna 14…)
- «Passati in app **0%**»: è vero e si vede, ed è l'effetto della chiave della
  piattaforma che manca (vedi il punto 6 di oggi).

### Come è fatto

- `src/lib/statistiche.ts`: una ventina di conteggi in parallelo (`count` e
  `groupBy`, mai `findMany` di ordini interi — Libro PERFORMANCE) più **due
  query SQL con `LAG`** per i tempi di risposta: le coppie
  cliente→risposta si fanno nel database, non portandosi a casa decine di
  migliaia di testi. Misurato: **2,9 s** su 30 giorni.
- Le note interne (`tipo = 'nota'`) non contano come risposta al cliente, e due
  nostri messaggi di fila non sono due risposte.
- In fondo alla pagina, «Come leggere questi numeri»: il tempo di risposta conta
  anche la notte e i festivi, i reclami sono per data di APERTURA, e gli avvisi
  che compaiono da soli quando i casi sono pochi.

Provato con `npx tsx scripts/prova-statistiche.mts` (numeri veri) e guardato a
schermo con una pagina d'anteprima temporanea sotto `/widget`, cancellata prima
del commit.

## 02/09/2026 (7) — quattro cose su Nuovo ordine

### 1. Il CAP che non si autocompilava (segnalato dall'utente)

⚠️ **Dal server il CAP torna**: misurato su tre indirizzi veri — Via Monte
Napoleone 8 → `20121`, Piazza di Spagna 1 → `00187`, Viale Roma 12 Guidonia →
`00012`. Quindi il buco non è nella lettura: sono i casi in cui Google **non
mette `postal_code` fra i componenti**, e allora il campo restava vuoto senza
dire niente. Due toppe:

- se `postal_code` manca e il paese è l'Italia, il CAP si prende
  dall'**indirizzo formattato** («Via Torino, 20123 Milano MI, Italia») con
  cinque cifre isolate. Solo in Italia: altrove il codice postale ha un'altra
  forma e prenderne uno a caso vorrebbe dire scriverne uno finto;
- ⚠️⚠️ **senza `route` non si torna più `null`**: succede scegliendo un posto
  che non è una via (un albergo, un ospedale), e prima la rotta rispondeva 502
  e la schermata non riempiva NIENTE, in silenzio. Ora si dà quello che c'è.

### 2. «Togliere il costo di consegna» dava errore

Non l'ho riprodotto (serve il messaggio esatto), ma ho chiuso la strada più
probabile: la **stima fuori zona** che ho aggiunto stamattina girava dentro la
rotta delle tariffe **senza rete di sicurezza**. Un'eccezione da Google o dalle
impostazioni usciva dalla rotta → 502 → il modulo mostrava un errore rosso *al
posto del prezzo del sito, che era lì e funzionava*. Ora sia `cittaDiCasa()` sia
`stimaFuoriZona()` sono avvolte: al massimo la stima non c'è.
⚠️ Misurato: con un indirizzo fuori zona la chiamata costa **6,3 s** (1,7 di
Shopify + 4,6 di Google). Non è un timeout — `maxDuration` è 30 — ma è tanto.

### 3. La fascia oraria si sceglie, come sul sito

Era testo libero, e nei dati veri si vede: `116-20`, `8-16`, `9-17`, «16-20
ultimo orario disponibile». Le voci **non sono inventate**, sono quelle che i
siti mandano davvero (ordini dal 01/06/2026):

- **Flowers** 178 × `08-12`, 128 × `12-16`, 120 × `16-20`
- **Cake** 68 × `08-12`, 46 × `12-16`, 47 × `16-20`
- **Deluxy** fasce di **un'ora** (08-09 … 21-22) più le doppie (08-10, 10-12,
  12-14, 14-16, 16-18, 18-20, 20-22) — consegna «a ora» col valet.

⚠️ Resta **«Flessibile: la scrivo io»**, e non è un ripiego: le eccezioni
concordate al telefono esistono, e senza via d'uscita finirebbero nelle note
dove il fornitore non le legge. Riaprendo una bozza con una fascia che non è
del sito, il campo si apre **da solo** in modalità libera — la tendina non deve
cancellarla scegliendo la prima voce al posto sua.

### 4. Consegna anonima

Spunta in Consegna. ⚠️⚠️ Viaggia in **tre** posti, perché scritta in uno solo
arriverebbe a metà strada:

1. la **nota dell'ordine**, per PRIMA riga e in maiuscolo (in fondo si legge
   dopo, e questa è l'unica riga che se non viene letta rovina il regalo);
2. l'attributo Shopify **`Consegna_Anonima`** — la nota la legge una persona,
   l'attributo una macchina (Orders, e da lì la piattaforma);
3. la **nota della consegna** in «Manda in app», riconosciuta dalla nota
   dell'ordine: è lì che la vede il valet.

## 02/09/2026 (6) — lo stato di OGNI vendita dentro l'app delivery

Domanda dell'utente: «per ogni vendita riesci a recuperare lo stato all'interno
dell'app delivery?».

**Sì, il meccanismo c'è già tutto** — e oggi torna zero. Misurato:

| | |
|---|---|
| `piattaformaApiKey` in Impostazioni | **VUOTA** |
| `piattaformaCollegata()` | **false** |
| ordini con `appStato` valorizzato | **0 su 1.495** |

Il client (`src/lib/piattaforma.ts`), il giro di lettura
(`sync-piattaforma.ts`, UNA chiamata a `/app/vendite?aggiornateDa=`), il cron
(`*/15`: `12,27,42,57`) e le colonne (`appStato`, `appPartner`,
`appCostoPartner`, `appVenditaId`) esistono da giorni. Manca **solo la chiave**:
si genera di là in **Configurazione → Chiavi delle app** (sola lettura basta
per questo) e si incolla in **Impostazioni → piattaformaApiKey**. Da lì in poi
si riempie da solo, ogni quarto d'ora.

### Il pezzo che mancava davvero, e che ho aggiunto

La sync teneva solo lo stato della **vendita** (proposta · accettata · …) e
buttava quello della **consegna**, che arriva nella stessa risposta
(`voce.consegna`). Sono due cose diverse: la vendita dice se un partner ha preso
il lavoro, la consegna dice **a che punto è il giro**. Un ordine appena proposto
e uno già consegnato si leggevano uguali.

- Tre colonne nuove: `appConsegnaStato`, `appConsegnaData`, `appConsegnaFascia`
  (ALTER additivi, come per la foto dei pagamenti — non `prisma db push`).
- La sync le scrive, **e le azzera** quando di là la consegna non c'è più:
  lasciare «in consegna» su un giro annullato è peggio che non scrivere niente.
- ⚠️ Il confronto «è cambiato qualcosa?» adesso guarda anche lo stato della
  consegna: senza, una consegna che passa a «consegnata» a parità di stato della
  vendita non veniva mai scritta, e la scheda restava ferma.
- `appConsegnaId` si riempie solo se vuoto: quando l'ordine è stato mandato in
  app da qui, quello è il nostro e non si sovrascrive.
- Sulla scheda: «Consegna: **in consegna** · 3 settembre 17-18», con i nomi
  italiani degli stati della piattaforma (`nomeStatoConsegna`).

⚠️ **Non verificato sui dati veri**: senza chiave la piattaforma non risponde,
quindi il giro completo non l'ho potuto vedere girare. Typecheck e build sì.

## 02/09/2026 (5) — la foto letta dall'AI adesso si può riprendere

Chiesto dall'utente: «in pagamenti, se è stata caricata una richiesta di
pagamento tramite foto interpretata da AI, consenti di recuperare quella
immagine o file».

**La foto veniva buttata.** `/api/pagamenti/estrai` la mandava all'AI, la
richiesta nasceva con `origine: "immagine"` — cioè si sapeva CHE era stata
letta da una foto — e del file non restava niente. Restava solo quello che l'AI
aveva capito: e quando l'IBAN non torna, o il fornitore dice «io ti avevo
scritto un'altra cifra», è esattamente l'originale che serve.

- Tre colonne nuove su `RichiestaPagamento`: `fonteDati` (data URI),
  `fonteNome`, `fonteTipo` — stesso schema della ricevuta, e per lo stesso
  motivo (quest'app non ha uno storage).
- Nell'elenco, sulla riga, un bollino **🖼️** che scarica l'originale.
  ⚠️ Si vede **anche quando il file non c'è** — spento, col motivo nel titolo:
  le richieste create prima di oggi sono state lette da una foto che allora si
  buttava, e un bollino che compare solo quando c'è rende l'assenza invisibile.
- La rotta `/api/pagamenti/[id]/fonte` è ricalcata su quella della ricevuta:
  sessione obbligatoria, `Content-Type` preso dalla NOSTRA lista e mai dal
  database, `attachment` + `nosniff`. Un tipo scelto da chi carica è la strada
  per farsi servire uno script dal nostro dominio.
- I byte **non escono nell'elenco** (il `select` prende solo nome e tipo):
  duecento righe con dentro duecento foto sarebbero decine di MB per disegnare
  una tabella che di quel file usa solo il nome.
- La foto si allega solo se `origine === 'immagine'`: correggendo a mano una
  riga letta da testo, attaccarci un file di un altro giro sarebbe una prova
  falsa.

⚠️ **Schema del Postgres condiviso**: le tre colonne NON sono state messe con
`prisma db push` — che confronta tutto lo schema e potrebbe proporre di togliere
quello che un'altra sessione ha aggiunto — ma con tre
`ALTER TABLE messaging."RichiestaPagamento" ADD COLUMN IF NOT EXISTS … DEFAULT ''`
additive, seguite da `prisma generate`.

Prova: `npx tsx scripts/prova-foto-pagamento.mts` — scrive, rilegge e confronta
i byte **dentro una transazione che torna indietro**, così nel registro dei
pagamenti veri non resta nessuna riga di prova.

⚠️ **Vale dalle richieste nuove**: le foto vecchie non esistono più da nessuna
parte, e non c'è modo di recuperarle.

## 02/09/2026 (4) — dal rimborso APPROVATO partono i soldi veri

Chiesto dall'utente: «ok puoi in caso approvato far partire il rimborso?».
Fino a ieri da Customer Service non usciva un centesimo: la pagina Rimborsi
registrava la decisione e i soldi li rendeva una persona da Shopify.

**Adesso, su una richiesta `approvato`, un admin ha il bottone «Rimborsa su
Shopify»**: `refundCreate` sull'ordine, sul metodo con cui il cliente ha
pagato. `write_orders` c'è su tutti e tre i negozi (verificato).

### Le difese, in ordine

1. **Ruolo `admin`** sulla rotta (`/api/rimborsi/[id]/shopify`). L'operatore
   continua a chiedere e a segnare. Il bottone si nasconde a chi non può, ma
   quello che conta è il controllo del server.
2. **Solo da `approvato`**: chiedere e approvare restano due atti di due
   persone; il rimborso è il terzo.
3. **Conferma a due clic**, con scritto **l'importo e il numero d'ordine** («Rendo
   45,00 € su #1824»). Un «sei sicuro?» non fa rileggere niente.
4. ⚠️⚠️ **La presa della riga**: `updateMany({ where: { id, stato: 'approvato' } })`
   PRIMA di chiamare Shopify — chi vince scrive, gli altri contano zero e si
   fermano. Senza, due clic ravvicinati sarebbero **due rimborsi veri**.
5. **Il tetto lo dice Shopify, non noi**: `netPaymentSet` è quanto resta da
   rendere (pagato − già rimborsato). L'ordine può essere stato rimborsato
   altrove mentre la richiesta dormiva.
6. **Se non parte, torna `approvato`** col motivo scritto nell'esito: mai «fatto»
   per finta, mai a metà.
7. **Errore di Shopify parola per parola**. E se cade la rete DOPO l'invio si
   dice che *non si sa*, e si manda a guardare l'ordine — non si invita a
   riprovare.

### Il pezzo che si sbaglia facile

⚠️⚠️ Senza `transactions` nell'input, `refundCreate` registra un rimborso
**contabile e non muove un euro**: sembrerebbe fatto, e il cliente non
riceverebbe niente. Il rimborso va agganciato alla transazione con cui ha
pagato (`parentId` + `gateway`), e quella può essere già stata rimborsata in
parte: il residuo si calcola togliendo i `REFUND` che le pendono sotto.
Verificato sui pagamenti veri: `shopify_payments` e **`paypal`** riconosciuti
tutti e due.

Altre due: `discrepancyReason: CUSTOMER` (si rende un IMPORTO, non delle righe:
senza, Shopify rifiuta) e **valuta di presentazione ≠ valuta del negozio** →
non si rimborsa da qui, si dice di farlo da Shopify (rendere la cifra sbagliata
a una persona vera è peggio che non rendere).

### Com'è stato provato

`npx tsx scripts/prova-rimborso-shopify.mts` — **senza far uscire un euro**:
`preparaRimborso()` è separata da `rimborsaSuShopify()` proprio per questo (una
funzione che si può verificare solo spendendo non la verifica nessuno). Su tre
ordini pagati veri sceglie l'incasso giusto; i paletti fermano l'importo troppo
alto, lo zero e l'ordine che non è nostro.

⚠️ **NON provato**: la chiamata `refundCreate` vera. Il primo rimborso vero
è il collaudo — meglio farlo su una cifra piccola e guardare l'ordine su
Shopify subito dopo.

### Aperto

- Il rimborso **non finisce in Deluxy Transactions**, che è il collettore unico
  del denaro. Qui esce da Shopify e rientra nel giro da lì; se deve comparire
  anche là, è un lavoro a parte.
- `esito` porta l'id del rimborso Shopify come testo: non c'è una colonna
  dedicata perché lo schema sta sul Postgres condiviso e non si tocca in
  autonomia. L'idempotenza NON dipende da quel testo: dipende dalla presa della
  riga (punto 4) e dal tetto di Shopify (punto 5).

## 02/09/2026 (3) — l'importo di consegna lo puoi scrivere tu, sempre

Chiesto dall'utente: «puoi creare draft orders per mettere importi di consegna
personalizzati?».

**La bozza lo permetteva già**: ogni ordine fatto da qui è un draft order
Shopify, e la riga di spedizione è NOSTRA — `shippingLine { title, price }`
liberi, non una tariffa del sito. Verificato sulle bozze vere (sola lettura):

- `#D255` Cake — «Consegna = 45,00 €» (il sito ne chiede 10)
- `#D493` Flowers — «Consegna = 15,00 €» (il sito consegna gratis)
- `#D262` Cake — «Consegna = 0,00 €»
- `#D269` **palermo**, `#D501` **København**, `#D496` **Miami Beach**: bozze
  `COMPLETED`, cioè **pagate**, fuori da qualsiasi zona del sito.

⚠️ Il motivo per cui funziona: sulla bozza la spedizione è **già scritta**, e al
pagamento Shopify non ricalcola le zone. Alla cassa normale un indirizzo fuori
zona bloccherebbe l'acquisto; con la bozza no.

**Quello che NON si poteva era scriverlo dalla schermata**: con una tariffa del
sito compariva solo la tendina. Su Cake, che chiede 10 € piatti ovunque, una
consegna a Palermo non si poteva far pagare più di 10 € — ed è esattamente
quello che è successo su `#D269`.

- Ora accanto alla tendina c'è **«Importo mio»**: apre titolo e prezzo liberi,
  con sotto «Il sito chiederebbe 10,00 € (Standard Delivery)» e il ritorno alla
  tariffa del sito. Il ricalcolo automatico non scrive più niente finché
  l'importo è a mano.
- La **stima al chilometro** adesso si calcola **anche quando una tariffa
  c'è**, se la consegna è fuori dalle città da cui usciamo (Impostazioni →
  `cittaDiPartenza`). Misurato: Cake + Sesto San Giovanni → il sito dice 10 €,
  la stima dice **25 €** (10,2 km da Milano); Cake + Palermo → «troppo
  lontano», e nessun numero.
- ⚠️ Dentro Milano/Roma/Firenze non si spende una chiamata a Google: lì il
  listino del sito è quello giusto e la stima non serve.

## 02/09/2026 (2) — indirizzi ovunque, e un prezzo per le extra-urbane

Chiesto dall'utente: «consenti di inserire qualsiasi indirizzo (anche fuori
Milano, Roma e Firenze), in quel caso il prezzo della consegna si può
disabilitare, è possibile? Inoltre puoi calcolare automaticamente il costo della
consegna per extra-urbane?».

**L'indirizzo libero c'era già** e l'ho verificato sui negozi veri: nessun
elenco di città ammesse, l'autocomplete non è vincolato all'Italia, e il costo
si azzera con la spunta «senza costo di consegna» (02/09). Quello che mancava
era il NUMERO quando il sito non ha una tariffa.

### Cosa dice il sito, oggi (misurato il 02/09 sul catalogo vero)

| | Milano | Monza | Bergamo | Matera | Enna | Paris |
|---|---|---|---|---|---|---|
| **deluxy.it** | 15 € | 45 € | 80 € | — | — | — |
| **Cake** | 10 € | 10 € | 10 € | 10 € | 10 € | 15 € |
| **Flowers** | 0 € | 0 € | 0 € | 0 € | 0 € | 0 € |

⚠️ Solo deluxy.it ha zone vere (otto). Cake ha una tariffa piatta a 10 € e
Flowers consegna gratis **ovunque**: su una consegna fuori città quei due
prezzi non coprono niente. Non è un bug dell'app — è quello che il sito chiede
alla cassa, ed è una decisione commerciale.

### La stima al chilometro (`src/lib/consegna-fuori-zona.ts`)

Compare **solo quando Shopify torna a mani vuote**: dentro le sue zone il
listino è del sito e il sito vince (Standard §7).

`tariffa della città coperta più vicina + km di strada × €/km`, arrotondato per
eccesso a 5 €. Non è inventata: sulle zone vere di deluxy.it (Milano 15 € in
città, Monza 45 € a 25,6 km, Bergamo 80 € a 58,6 km) la retta che passa per i
due punti è **18 € + 1,06 €/km** — cioè la tariffa cittadina più circa un euro
al chilometro. Impostazioni → **Consegne fuori zona** (`euroPerKmFuoriCitta`
1,00 di suo, `cittaDiPartenza` «Milano, Roma, Firenze»).

- Si misura da TUTTE le città coperte e vince la più vicina: Matera è a 422 km
  da Roma e 922 da Milano.
- ⚠️ **Si mostra, non si scrive**: c'è un bottone «Metti 450 €». Vale se
  usciamo NOI dalla città; se consegna un fornitore del posto quei chilometri
  non li fa nessuno, e il riquadro lo dice.
- ⚠️ **Due buchi trovati dalla misura, non dal ragionamento**:
  1. la tariffa cittadina chiesta con la sola città («Roma») tornava **zero** —
     Shopify vuole CAP e provincia. La stima partiva da base 0. Ora c'è
     `DATI_CITTA` (Milano 20121/MI, Roma 00184/RM, Firenze 50122/FI): Matera è
     passata da 425 € a **450 €** (25 € di tariffa Roma + 422,6 km).
  2. per **Abu Dhabi Google una strada la trova** (5.910 km via terra) e la
     stima diceva **5.915 €**. Oltre 800 km, o fuori dall'Italia, non si
     propone più niente: «là consegna un fornitore del posto». Enna (879 km) e
     Paris (867) rientrano in questo caso.

## 02/09/2026 — il catalogo: prima il prodotto, poi la variante

Chiesto dall'utente: «non mostrare tutti i prodotti con tutte le varianti:
mostra i prodotti e poi una volta scelto il prodotto l'utente sceglie la
variante».

L'elenco era **piatto, una riga per variante**. Misura sul catalogo vero:
cercando «botticelli» uscivano **23 righe**, di cui cinque col medesimo titolo e
la sola taglia a distinguerle; «rose» ne dava 30. Adesso: **4 schede** e **12**.

- `cercaProdotti()` torna **due liste dallo stesso giro**: `prodotti` (piatta) e
  `raggruppati` (un prodotto, le sue varianti dentro).
  ⚠️ La piatta **resta**: è il contratto di `/api/v1/nuovo-ordine/prodotti`, che
  leggono altre app — cambiargli forma sarebbe romperle senza accorgersene
  (Standard §7). La schermata usa solo `raggruppati`.
- Sotto il nome del prodotto si legge il prezzo **unico** o l'**intervallo**
  («da 85,00 € a 1.195,00 €») + «N varianti».
  ⚠️ Mai il primo prezzo da solo: al telefono si prometterebbe una cifra che poi
  cambia alla variante scelta.
- «non disponibile» si scrive **solo se lo sono tutte**: se una taglia c'è, il
  prodotto si vende ancora.
- **Una variante sola** (il `Default Title` di Shopify) si aggiunge col primo
  clic: nessun passo in più per scegliere l'unica cosa scegliibile.
- Dal riquadro delle varianti si torna indietro («← Torna ai risultati») senza
  rifare la ricerca; la conferma «Scelto: …» resta com'era.
- Prodotto **senza varianti**: non compare. Non ha un `variantId` da mettere in
  bozza — sarebbe una scheda che al clic non fa niente.

Prova sul catalogo vero: `npx tsx scripts/prova-elenco-prodotti.mts` (stampa
schede/righe per negozio e controlla che non ci siano titoli ripetuti).

## 31/08/2026 — «In App» diventa un PASSO, e l'ordine si manda di là dal suo modulo

Chiesto dall'utente: «ho bisogno di un nuovo stato prima di *Gestito* che sia
*In App* e indichi che l'ordine è stato spostato in app; **prendi lo stesso form
da app delivery che si usa per inserire una consegna da vendita**; sincronizza in
questo modo gli ordini che ricevi tu con quelli dell'app delivery».

### 1. Lo stato

`in_app` **esisteva già** ma stava fuori dai `PASSI`, perché lo scriveva solo la
sincronizzazione. Ora è **l'ultimo passo prima di «Gestito»**: da lì la consegna
la fa la piattaforma, e l'ordine non torna indietro da solo.

⚠️ Sceglierlo dalla fila **non crea** la consegna di là: la crea il modulo. Per
questo il riquadro sulla scheda adesso dice sempre **se la consegna c'è**
(numero e chi l'ha mandata) oppure che «l'etichetta è solo nostra»: «In App»
senza un numero è una parola che nessuno può verificare.

### 2. Il modulo — **la stessa porta del form di là**

`POST /api/v1/app/consegne` della piattaforma è dichiarata «stessa strada del
form: prezzo dal listino del partner, paga dal listino del valet, attività e
notifiche». ⚠️⚠️ Scrivere la consegna in un altro modo vorrebbe dire una consegna
**senza prezzo, senza paga e senza avvisi**: esisterebbe e non funzionerebbe. Per
lo stesso motivo i campi del modulo sono i campi di quel DTO, non un
sottoinsieme comodo.

**Il prefill viene dalle stesse fonti del form della piattaforma**, che arrivando
da una vendita legge `GET /sales/:id`: qui si legge la stessa vendita
(`/app/vendite/by-ref/deluxy-orders/<ordersId>`) per il **partner**, e il
**destinatario dal nostro ordine** — che è più fresco, perché l'indirizzo di
consegna lo possiede Orders.

⚠️ **Il destinatario non è il cliente**: da noi chi ordina e chi riceve sono due
persone diverse quasi sempre (è un regalo). Mandare il valet dal mittente è
l'errore più facile e più grave, e per questo la spedizione si chiede a Orders.

⚠️ **Senza partner la piattaforma rifiuta** («dal canale app non c'è un partner
sottinteso») e l'app-API **non espone l'elenco dei partner**: quando la vendita
non ha ancora un partner, il modulo lo dice e porta al form di là
(`/deliveries/new?vendita=<id>`), che la lista ce l'ha. È l'unico caso in cui si
arrende, e lo dichiara.

### 3. L'ordine delle tre cose, che non è casuale

1. si **crea la consegna** (l'unica cosa che può fallire davvero);
2. si scrive **il nostro stato**, solo se la consegna esiste — segnare «In App»
   prima vorrebbe dire fermare il nostro lavoro su un ordine che di là non è mai
   arrivato;
3. si dice alla vendita di andare in storico (`…/in-consegna`), **best-effort**:
   se fallisce la consegna c'è comunque, e rifare tutto creerebbe un doppione.
   Il messaggio lo dice: «controllala, ma non rifare la consegna».

⚠️ **Idempotenza**: il `riferimentoEsterno` lo decide il codice (l'id in Orders),
non l'utente. Di là lo stesso riferimento dalla stessa chiave **non crea una
seconda consegna**; lasciandolo modificabile, due invii diventerebbero due
consegne, due valet e due paghe per lo stesso regalo.

⚠️ Il modulo **non compare** se l'ordine risulta già in app: il riquadro «se ne
sta occupando la piattaforma» e il modulo sono la stessa casella in due momenti.

### 4. La sincronizzazione

Resta quella che c'era (`/api/cron/piattaforma` → `sync-piattaforma.ts`, una
chiamata a giro su `/app/vendite?aggiornateDa=`): quando la piattaforma propone o
accetta, l'ordine passa «In App»; quando la proposta decade torna dov'era. Adesso
il giro è **nei due sensi**: di là ci arriva anche quello che mandiamo noi.

🔴 **MANCA, e senza questo non funziona niente**: la **chiave della piattaforma
con permesso di SCRITTURA**. Oggi `piattaformaApiKey` è **vuota** — quindi non
funziona nemmeno la lettura. Si crea da app.deluxy.it (admin → Chiavi API,
spuntando *scrittura*; la chiave in chiaro si vede **una volta sola**) e si
incolla in *Impostazioni → piattaforma*. Finché non c'è, il modulo si apre, dice
«chiave non configurata» e non manda niente.

**Provato**: typecheck e build. ⚠️ Il giro vero (leggere la vendita, creare la
consegna, portarla in storico) **non è stato provato**: senza chiave non si può
chiamare la piattaforma, e una consegna di prova su app.deluxy.it è una consegna
vera con un valet e una paga — si prova con una persona davanti, non da uno
script.

## 29/08/2026 (12) — «Hanno già preparato ordini per noi» adesso FILTRA

Segnalazione dell'utente, su un ordine di cioccolatini a **Roma**, guardando la
scheda ordine di `deluxy-messaging.vercel.app`:

> «qui devono apparire solo quelli collegati a quella provincia» ·
> «bliss cake è su milano» · «e poi due sono legati ai fiori»

A schermo c'erano sei righe: una pasticceria di Milano, quattro fiorai e un
negozio di palloncini. **Sei telefonate sbagliate su sei.**

### Perché non filtrava, e perché adesso si può

⚠️⚠️ Non era un filtro rotto: **il filtro non c'era**, ed era una scelta scritta
nei commenti del 27/08 — filtrare avrebbe svuotato l'elenco, perché la provincia
di una consegna passata si ricava dalla città e `siglaProvincia` risponde solo
sui capoluoghi. **Misurato oggi sui dati veri**: 49 ordini con fornitore, 47
fornitori distinti, la provincia si ricava da **12 ordini su 49**; `indirizzo` è
vuoto su tutti (resta in Orders, per non tenerne due copie), `fornitoreCitta` è
vuoto su **47 su 47**, `fornitoreId` (registro) su **47 su 47**.

Quello che rende il filtro possibile sono **tre dati che c'erano e non si
guardavano**:

1. **il negozio dell'ordine** (`negozioNome`: Cake → pasticceria, FLowers →
   fioraio) e **il nome del fornitore** → che mestiere fa
   (`mestierePerFornitore`, in `src/lib/fornitori-zona.ts`). ⚠️ Il nome viene
   PRIMA del negozio: «Bianchi Fiorista Como» ha preparato un ordine del negozio
   Cake — il negozio dice che ordine era, il nome dice che mestiere fa.
   ⚠️ Parole apposta diverse da quelle del prodotto: i nostri si chiamano
   «SO'FLEUR», «Malus Flowers Crete», «Blumen Kocher». E «rose» NON c'è: «ROSE
   CAKE DI ZORZ ALESSANDRO» è una pasticceria.
2. **il paese** della consegna (`paese`, su ogni ordine): chi ha lavorato solo
   in Francia o in Germania, su una consegna in Italia, è altrove **per certo** —
   senza doverne indovinare la provincia. Da solo riconosce Cannes, Algiers,
   Toronto, Ludwigsburg, Budens.
3. **i comuni della provincia, letti dal registro Anagrafiche** nella STESSA
   richiesta (`esito.fornitori.map(f => f.citta)`): se in provincia di RM il
   registro ha una pasticceria a **Valmontone**, allora Valmontone è in provincia
   di RM. Letto, non indovinato, e costa zero.

### ⚠️⚠️ La correzione che conta: «altrove» diceva il falso

Prima bastava avere una città qualunque per essere dichiarato altrove:

```ts
if (f.province.length || f.citta.length) return 1   // ← diceva il falso
```

Chi ha consegnato solo a **Valmontone** finiva «altrove» su un ordine a **Roma**.
Finché l'elenco ordinava soltanto, la bugia costava una posizione; **da quando
filtra, costa la riga**. Adesso «altrove» si dice con due prove sole (una sua
provincia ricavata che non è questa, oppure solo paesi esteri) e tutto il resto è
`vicinanza: 0` = **non lo sappiamo**, che non si scarta.

### Che cosa si vede adesso

- `perQuestaConsegna()` in `src/lib/nostri-fornitori.ts` torna quattro cose:
  `inZona` (da mostrare), `senzaLuogo` (lavorano con noi, non si sa dove),
  `altrove` e `altroMestiere` (**quanti** sono usciti, e perché).
- La sezione mostra `inZona`; `senzaLuogo` sta dietro al bottone «Altri N
  lavorano con noi, non sappiamo dove» (e si apre da sola se `inZona` è vuoto,
  altrimenti la sezione utile sparirebbe). Sotto, una riga dice quanti sono
  fuori e per quale dei due motivi. ⚠️ Un elenco che si accorcia in silenzio fa
  credere che quei fornitori non esistano: è lo stesso errore che nascondeva
  Passiflora.
- Il filtro del mestiere si applica **solo quando lo si sa da tutte e due le
  parti**: fornitore senza mestiere noto resta, ordine senza mestiere noto non
  toglie niente.

**Verifica**: `tsc` 0, `next build` 0, e
`npx tsx scripts/prova-nostri-fornitori.mts` — **21 prove, tutte passate**, sui
dati veri. Il caso segnalato, misurato: su Roma + pasticceria si passa da 47
righe a **5**, nessun fioraio, niente Bliss Cake; 5 tolti come «altrove», 37 come
«altro mestiere». ⚠️ `inZona` resta **0** finché il registro non risponde coi
comuni: nell'app vera Valmontone rientra, nella prova (che non chiama il
registro) no — la prova lo verifica passando i comuni a mano.

⚠️ **Da guardare più avanti**: Nembro, Nonantola, jesolo restano «non sappiamo
dove» perché in quelle province il registro non ha nessuno. L'unico modo per
chiuderla del tutto è una tavola comune→provincia (ISTAT), che serve anche alla
piattaforma consegne (31.987 consegne senza provincia): **non inventarla a
memoria**.

## Le sei tappe non scritte (28/08 sera → 29/08)

⚠️ Fra la tappa (11) e questa, l'handoff è rimasto indietro di sei commit. In
breve, dal più vecchio:

- `5908da4d` **Paga fornitore**: il testo diceva ancora «Deluxy Partner» mentre
  la richiesta va a Transactions, e l'esito torna da solo con la ricevuta.
- `98261ed3` **Partner**: la riga si apre col clic (non solo il bottone) e dice
  **perché** è comparsa quando la parola cercata sta in un campo nascosto.
- `be9629dd` **Avviso WhatsApp per OGNI richiesta di pagamento del collettore**
  (chiesto dall'utente il 29/08): rotta `POST /api/pagamenti/avvisa`, la chiama
  Transactions quando una richiesta nasce in Scout, Finance o Piattaforma.
- `6719324e` **Impostazioni, scheda pagamenti**: dice la verità — canale
  Transactions con lo stato letto dall'ambiente, via la configurazione del canale
  Partner ormai morto.
- `29b2a2cf` **Nuovo ordine**: l'IVA è una casella da spuntare (spenta di suo).
- `3aa1415f` **Le tariffe di consegna le calcola il SITO** (rotta
  `/api/nuovo-ordine/tariffe`): le regole scritte a mano la mattina stessa
  (`regole-consegna.ts`) sono state buttate il pomeriggio — le tariffe non si
  ricopiano, si chiedono a Shopify.


## 28/08/2026 (11) — gli esiti dei pagamenti arrivano da Transactions (collettore unico)

Decisione utente: Transactions raccoglie TUTTE le richieste di pagamento
dell'ecosistema; per il CS «rimane lo stesso, solo che esiti e allegati
arrivano da Transactions». Costruito e deployato:

- **`src/lib/effetti-pagata.ts`** — gli effetti del «pagata» (ordine →
  attesa_consegna, riconciliazione, avviso fornitore, registro anagrafiche)
  estratti dal PATCH `/api/pagamenti/[id]`: ora sono UNA strada sola, la
  stessa per il bottone e per il webhook. Il PATCH è stato rifattorizzato per
  chiamarla (risposta identica a prima).
- **`POST /api/pagamenti/notifica`** — il webhook degli esiti da Transactions:
  firma HMAC verificata PRIMA del corpo (fail-closed, 503 senza segreto,
  finestra ±5′ sul timestamp dell'header: i ritentativi arrivano rifirmati),
  **escluso dal middleware** (ancorato, solo quel percorso), 200 subito e
  lavoro pesante in `after()`, **idempotente** (pagata già scritta = nessun
  secondo avviso). Su `stato=pagata`: pagataIl/pagataDaNome «Deluxy
  Transactions»/pagatoCon `app`, scarica la PROVA con GET firmata e **sha256
  verificato** (mai da URL nel payload: base URL configurato) e la salva nei
  campi ricevuta esistenti → graffetta identica a prima. Deroga §7.3.4
  dichiarata: la copia dei byte è ammessa perché la prova è immutabile;
  misura di completezza = «pagate da Transactions con prova là ∧ ricevuta
  assente qui» (da contare, non da ultima data).
- **Client `transactions.ts`**: manda anche `metodo`+`riferimentoPagamento`
  (Transactions ora accetta link/paypal/carta/altro) e `urlNotifica`
  (`APP_URL/api/pagamenti/notifica`); nuove `notificaAutentica()` e
  `scaricaAllegatoTransactions()`.
- **`partner.ts`**: spento il ripiego morto verso Finance — quella coda
  (`POST /api/richieste-pagamento`) non esiste più dal 26/07 (commit
  `97b53692` di deluxy-partner): il fallback colpiva un 404 credendosi una
  rete di sicurezza.
- **Canale acceso in produzione**: chiave `deluxy-messaging` NUOVA emessa in
  Transactions (la trx_CLl3bYu_ del 26/07, mai usata, è stata revocata),
  `TRANSACTIONS_API_KEY`/`TRANSACTIONS_HMAC_SECRET` su Vercel; l'urlNotifica
  di default sta sulla CHIAVE lato Transactions.
- Manuale aggiornato (§07 Novità). ⚠️ Il pull di recupero
  `GET /api/v1/richieste?aggiornateDa=` esiste lato Transactions: un cron di
  riconciliazione qui NON è ancora stato aggiunto (il webhook ritenta 3 volte
  e si rilancia a mano da là) — se si vedono righe ferme su `in_attesa` che
  là risultano decise, è il pezzo da costruire.

## 27/08/2026 (10) — tre segnalazioni, un guasto solo; e i pagamenti di Shopify

### ⚠️⚠️ Il guasto: la sessione moriva e l'app non lo diceva

Segnalato a raffica: «Federica non vede quali sono i negozi nel nuovo ordine»,
«non si riesce più a leggere il diario», «e anche la chat». **Tre sintomi, un
guasto solo, e l'ho fatto io** con la tappa (8): cambiando la forma del cookie
per rendere revocabili le sessioni, tutti i cookie già in giro sono diventati
invalidi.

⚠️⚠️ Chi aveva l'app **aperta in una scheda non è stato mandato al login**: la
pagina non si ricarica, quindi il middleware non la vede mai passare. Da quel
momento ogni `fetch` del browser si è preso un **307 verso /login**, che `fetch`
segue di suo restituendo la pagina di login **con stato 200**.

**Provato in produzione**, non dedotto: con un cookie della forma nuova
`/api/diario` e `/api/ordini` rispondono **200**, con quello della forma vecchia
**307 → /login**. L'app stava bene: erano i cookie nei browser a essere scaduti.

E la causa per cui i negozi sparivano **in silenzio**:

```ts
.then((r) => (r.ok ? r.json() : { negozi: [] }))
.catch(() => setNegozi([]))
```

Qualunque cosa vada storta diventa «non ci sono negozi». Adesso c'è
`src/lib/leggi-json.ts`, che distingue i tre casi (sessione scaduta, errore,
davvero zero righe) e li dice.

⚠️ E c'è una **fascia rossa fissa in cima** (`SessioneScaduta`) col bottone
«Rientra». La fa comparire chiunque se ne accorga, e il punto che se ne accorge
**sempre** è la barra laterale: c'è su ogni pagina e fa polling, quindi la fascia
arriva entro un giro anche sulle schermate che i propri errori se li mangiano.
⚠️ **Non** un salto automatico al login: chi sta compilando un ordine al telefono
ha mezz'ora di lavoro in quel modulo.

Trappola: [[trappola-il-fallimento-che-sembra-una-lista-vuota]].

### I metodi di pagamento glieli chiede Shopify

La tendina del nuovo ordine aveva **cinque voci scritte nel codice** (bonifico,
contanti, POS, PayPal, altro): i nomi che usiamo noi, mai confrontati con
Shopify.

⚠️⚠️ **E a Shopify non si possono chiedere in elenco.** Provato sull'API vera
(2024-10): `manualPaymentGatewayConfigs` **non esiste** su `QueryRoot`, e
`shop.paymentSettings` dà solo i portafogli digitali. L'unico posto dove i metodi
di un negozio sono scritti sono **i suoi ordini** — quindi si fa come per le
spedizioni: si guarda cosa ha usato davvero.

Misurato sugli ultimi 60 ordini di ciascuno:

| negozio | metodi |
|---|---|
| Deluxy | Shopify Payments (48) · Paypal (9) · Manual (3) |
| Cake | Shopify Payments (45) · Paypal (12) · **Bank Deposit (3)** · Manual (1) |
| FLowers | Shopify Payments (52) · Paypal (7) · Manual (1) |

⚠️ **«Bank Deposit» ce l'ha solo Cake**: una lista nel codice l'avrebbe data a
tutti e tre o a nessuno. ⚠️ Si legge `formattedGateway` e non
`paymentGatewayNames`: il primo è il nome che si rilegge nell'ordine su Shopify
(«Bank Deposit»), il secondo è la chiave tecnica («manual»).

⚠️ E **si dice dove finisce**: `draftOrderComplete` accetta un `paymentGatewayId`
che questa app non ha modo di ricavare, quindi il mezzo resta nelle **note**
dell'ordine e su Shopify la transazione risulta «Manual».

### Segnare pagata una bozza già creata

⚠️ È il caso di tutti i giorni: si manda il link, il cliente paga **fuori da
Shopify** — bonifico, contanti alla consegna, POS — e la bozza resta aperta
finché dopo sette giorni il cron la annulla come scaduta. **Si buttava via un
ordine incassato.**

Il bottone chiude la bozza con `draftOrderComplete`, la stessa cosa che fa «Crea
come pagato»: cambia solo il momento in cui si è saputo.

⚠️⚠️ **Prima si chiede a Shopify com'è messa**, e non ci si fida della riga
nostra: fra l'apertura della pagina e il clic quella bozza può essere già stata
pagata col link o annullata a mano. Se l'ha già pagata il cliente si scrive il
numero e **lo si dice**, invece di rispondere un errore.
⚠️ Il **mezzo è obbligatorio** — «pagata» senza dire come non si riconcilia con
l'estratto conto — e si scrive **chi** l'ha dichiarato (`segnataPagataDaNome`):
davanti a un ordine contestato «lo ha chiuso l'app» non è una risposta.
Migrazione additiva, verificata con `migrate diff`.

**Verifica**: `tsc` 0, `build` 0, `prova-sicurezza` 67/67, e le rotte nuove
provate in produzione **con la sessione di un operatore** (200, e i tre negozi
coi loro metodi). Commit `19633f38` e `e6f1db7b`.


## 27/08/2026 (9) — ancorando le eccezioni avevo spento widget.js su tre siti

⚠️⚠️ **DIFETTO MIO, di poche ore prima, e in produzione.** Ancorare le eccezioni
del matcher chiudeva un rischio latente vero (un percorso che COMINCIA con
«chat» o «widget» nasceva pubblico) — ma **`widget.js` passava proprio grazie a
quel prefisso**. Ancorato, `widget` pretende `/` o fine stringa e `widget.js` ha
un punto: finito dietro al cancello, **307 verso /login**. Cioè lo script che i
tre siti dei clienti caricano con `<script src="…/widget.js">` non si caricava
più, e la chat spariva da tutti e tre.

⚠️ **Il guasto non dà nessun errore**: nessun 500, nessuna riga di log — uno
script che non arriva, su un sito che non è questo. Si scopre tardi.

⚠️ Ed era passato la verifica: avevo provato `/loginX`, `/chat-interna`,
`/widget-statistiche` — **tutti i falsi positivi, nessun file statico**. Provare
solo il verso «adesso è protetto» lascia scoperto il verso «adesso non lo è più».

Adesso `widget.js` è un'eccezione esplicita, e **una prova lo tiene**: la suite
legge il matcher DAL FILE, lo applica ai percorsi veri e controlla tutti e due i
versi. ⚠️ Il matcher nel sorgente è un letterale JS (`\.` sono due caratteri lì
e uno a runtime): senza il `replace` si proverebbe una regex diversa da quella
che gira.

### E le quattro intestazioni di sicurezza

L'agente ostile ha chiuso il suo ultimo caveat verificandolo invece di
assumerlo: **`vercel.app` è nella Public Suffix List** (sottomesso da Vercel),
quindi `deluxy-messaging.vercel.app` è un dominio registrabile a sé e le altre
app Deluxy su `*.vercel.app` sono **cross-site**. Il clickjacking oggi **non
funziona**: il cookie `SameSite=Lax` non parte in un iframe di terzi e
l'attaccante incornicia una pagina di login.

⚠️ Ma quella protezione è **gratuita e fragile**: il giorno che l'app passa a un
dominio proprio (`cs.deluxy.it`), `www.deluxy.it` e ogni altra app sullo stesso
dominio registrabile diventano *same-site*, il cookie Lax parte anche
nell'iframe, e il clickjacking diventa reale **senza che nessuno tocchi questo
repo**. Quindi le intestazioni ci sono.

⚠️⚠️ **Il `source` esclude il widget e il suo script, ancorato.** Una regola larga
(`/(.*)`) metterebbe `DENY` anche sul widget — e il widget dentro l'iframe dei
clienti **è il prodotto**: sarebbe una correzione di sicurezza che spegne una
funzione che funziona. Verificato in produzione: `/widget` e `/widget.js` senza
`X-Frame-Options` e col loro `frame-ancestors *`, tutto il resto con `DENY`,
`nosniff` e `Referrer-Policy`.

Commit `53b38897`, deployato. `prova-sicurezza.mts` **67/67**.

## 27/08/2026 (8) — revisione di sicurezza: 23 accuse, 4 agenti, 11 correzioni

Chiesto dall'utente: verificare se un utente può arrivare a informazioni che non
gli spettano richiamando le API dall'esterno, più una revisione di sicurezza
generale, **con un agente ostile** che concordi le migliorie. Due agenti hanno
cercato (autorizzazione delle API, sicurezza generale) e due hanno avuto il
mandato di **demolire**: su ventitré accuse, **3 demolite, 6 ridimensionate**.

### Dall'esterno l'app tiene

Sondate tutte e **131 le rotte** senza cookie: ogni `/api/*` risponde 307 verso
`/login`, gli undici cron 401, le `/api/v1/*` 401, il webhook Meta 403. Un
cookie inventato viene rifiutato. Pubbliche di proposito restano `/api/health`,
`/widget` e le due API del widget — e nessuna restituisce dati di nessuno.

**Il problema non era chi sta fuori. Era chi sta dentro.**

### 1. ⚠️⚠️ Un operatore era un amministratore a cui mancavano tre schermate

Le sei pagine di configurazione — Impostazioni, Caselle, Negozi, Numeri
WhatsApp, Facebook e Instagram, Widget dei siti — **non chiedevano il ruolo**:
né la pagina, né le dodici server action. E il menu le mostrava a tutti (solo
Turni e Operatori erano nascoste). Utenti reali: **1 amministratore e 2
operatori**.

Che cosa si otteneva davvero, con le credenziali di un operatore:
- ⚠️⚠️ **la posta aziendale**: si scrive `imapHost` di una casella lasciando
  **vuoto** il campo password — la password vera resta cifrata in tabella e al
  giro successivo il cron la presenta al server nuovo. `rejectUnauthorized:
  false` (vedi sotto) risparmia perfino il certificato;
- ⚠️⚠️ **le chiavi delle app sorelle**: si scrive `anagraficheUrl` e al primo
  giro la chiave da 53 caratteri parte nell'header verso un server qualunque.
  ⚠️ La via di fuga «le variabili d'ambiente hanno la precedenza» è stata
  **verificata e chiusa**: in produzione ce ne sono cinque (`CRON_SECRET`,
  `APP_URL`, `APP_SECRET`, `DIRECT_URL`, `DATABASE_URL`) e **nessuna** è di
  queste; e due ponti (Partner, Search) dall'ambiente non leggono affatto;
- **spegnere la verifica delle firme** del webhook Meta svuotando l'App Secret.

⚠️ La regola era **già scritta**, in italiano e col motivo, in
`utenti/actions.ts`: «una server action è un endpoint a tutti gli effetti».
Applicata in **un file su sette**. Adesso `soloAmministratore()` sta in
`src/lib/sessione.ts` ed è in tutte e dodici le azioni e in tutte e sei le
pagine; le voci sono sotto `amministratore` nel menu.

### 2. ⚠️⚠️ Il cancello dell'AI si aggirava dall'altra porta

`/api/ai-fuori-turno` riserva all'amministratore l'accensione delle risposte
automatiche, con un 403 e la spiegazione. La **stessa chiave** si scriveva dal
modulo Impostazioni senza controlli — e il cron gira ogni dieci minuti, quindi
non serviva nemmeno far partire il giro a mano: bastava accendere e aspettare.

### 3. ⚠️ Diciassette handler non guardavano se l'utente esiste ancora

`const io = await utenteCorrente()` e poi `io?.nome ?? ''`, senza mai un
`if (!io)`. Il cookie è firmato sull'id e vive trenta giorni; cancellare un
utente **non lo invalidava**. Un ex dipendente col cookie in mano mandava mail
da `cs@deluxy.it`, scriveva ai clienti su WhatsApp, approvava rimborsi e creava
richieste di pagamento — e l'archivio scriveva autore `''`, cioè **nessuno**.
⚠️ Anche qui la regola era già nel repo: `clienti/unisci/route.ts` ce l'ha nella
DELETE e non nella POST, **nello stesso file**.

### 4. ⚠️⚠️ La sessione adesso si revoca

Il cookie era `userId.HMAC(userId)`: nessuna scadenza, nessun numero di serie.
Conseguenza — **cambiare la password non buttava fuori nessuno**, cioè proprio
la mossa che si fa quando si sospetta un accesso rubato lasciava dentro
l'attaccante. L'unica leva globale era cambiare `APP_SECRET`, che è **anche** la
chiave con cui sono cifrati tutti i segreti: usarla per chiudere una sessione
rendeva illeggibili token Meta, chiavi API e password delle caselle, in blocco e
in silenzio.

Ora il cookie è `userId.generazione.HMAC(userId.generazione)` e `Utente` ha una
colonna `generazione` (migrazione **additiva**, verificata con `migrate diff`).
Cambiare la password la incrementa; `utenteCorrente()` la confronta col
database. ⚠️ Il middleware continua a verificare **solo la firma** — gira su
edge e il database non lo legge — ed è giusto così: la firma dice «l'ho scritto
io», la lettura dell'utente dice «e vale ancora».
⚠️ **I cookie della vecchia forma non valgono più**: tutti rientrano dal login
una volta sola. È voluto — una correzione che serve a invalidare le sessioni
vecchie e le lascia vive non ha corretto niente.

### 5. ⚠️ L'allegato che poteva eseguire codice

`/api/media/[id]` serviva il file col `Content-Type` **dichiarato da chi manda
il messaggio** (`mime_type` arriva nel payload di Meta dal documento caricato
dal mittente), con `Content-Disposition: inline` e senza `nosniff`. Uno
sconosciuto manda al numero del servizio clienti un «fattura.html» con dentro
uno `<script>`, l'operatore in inbox ci clicca — è il suo mestiere — e quel
codice gira **sull'origine dell'app**, con la sua sessione.

⚠️⚠️ **`nosniff` da solo NON basta**, ed è la correzione che verrebbe naturale:
impedisce di *indovinare* un tipo, non di rispettare un `text/html`
**dichiarato**. Serve la lista bianca. ⚠️ Misurata prima di stringere sui
**3.779 messaggi veri**: 126 `image/jpeg`, 6 `png`, 3 `webp`, 3 `audio/ogg`, 1
`pdf` — e **nessun** html né svg. La lista non toglie niente di quello che i
clienti mandano.

### 6. Le altre correzioni

- **Gli indirizzi delle app sorelle validati** (`src/lib/indirizzi-app.ts`):
  solo `https:` e host Deluxy. ⚠️ Serve **anche** col controllo di ruolo: quello
  guarda CHI passa, questo guarda COSA passa, e resta l'amministratore distratto.
- **Il webhook Meta non si apre più a segreti vuoti**: 503 invece di accettare
  tutto. ⚠️ Non era una falla remota — i segreti ci sono, **verificato: 32
  caratteri entrambi** — era una **trappola di configurazione**: la casella
  «cancella il valore salvato» spegneva l'autenticazione senza spegnere il
  webhook, cioè un guasto che si manifesta come «tutto a posto». Stessa cosa
  ruotando `APP_SECRET`.
- **`piattaformaApiKey` non si stampa più nell'HTML**: era l'unico dei
  diciassette campi della pagina fuori posto, un `<input defaultValue>` invece
  di `CampoSegreto`. ⚠️ Cambiando componente cambia anche la regola di
  salvataggio: **vuoto adesso vuol dire «non l'ho toccata»**, e per cancellarla
  c'è la casella — senza questa modifica il primo salvataggio l'avrebbe azzerata.
- **Un tetto per IP sull'apertura delle chat del widget** (10/ora). ⚠️ Vive
  nella memoria della funzione: su Vercel le istanze sono più d'una, quindi è un
  tetto **per istanza** e **non sostituisce** il Vercel Firewall, che è lo
  strumento giusto e va acceso dal pannello.
- **Le eccezioni del middleware ancorate**: prima bastava che un percorso
  COMINCIASSE con «chat» o «widget» per nascere pubblico. Oggi non esponeva
  niente (verificato voce per voce), ma è il difetto che non si trova mai
  guardando il file che l'ha causato. **Provato in produzione**: `/loginX`,
  `/chat-interna`, `/widget-statistiche`, `/api/cronologia` → **307**, e le
  rotte pubbliche di proposito → ancora 200.

### 🟡 Confermati e NON corretti, con il motivo

- ⚠️⚠️ **Le tre caselle di posta non verificano il certificato TLS.**
  `ignoraCertTls` ha `@default(true)` e **non compare in nessun form**: si può
  cambiare solo con una query a mano. Tutte e tre in produzione sono a `true`.
  **Non l'ho toccato**, e il motivo è che il rimedio può fermare la posta: il
  default fu messo così perché `register.it` presenta un certificato intestato a
  un altro dominio, e cambiare `@default` **non tocca le righe che esistono**.
  Va fatto in tre passi — provare la connessione con la verifica attiva, poi
  `servername` esplicito se il certificato non combacia, poi l'`UPDATE`.
- **SSRF su `mediaUrl`**: demolita. L'unico punto di scrittura è il payload
  **firmato** di Meta, e su Vercel non c'è un metadata service da colpire.
- **Intestazioni globali (CSP, X-Frame-Options)**: il clickjacking è demolito —
  `SameSite=Lax` **non** manda il cookie in un iframe cross-site, quindi
  l'attaccante incornicia una pagina di login. ⚠️ E una regola scritta larga
  (`source: '/(.*)'`) **spegnerebbe il widget sui siti dei clienti**, che è un
  danno più grande del problema. Il pezzo che serviva davvero (`nosniff` + tipo
  controllato) è dentro la correzione di `/api/media`.
- **`ruolo @default("admin")`**: demolita. Le due sole creazioni passano sempre
  il ruolo esplicito, e la seconda è protetta due volte da `installazioneVergine`.
- **Iniezione nel prompt**: ridimensionata. La risposta torna **solo a chi ha
  scritto** — non si può far scrivere l'app a un terzo — e passa da sei
  serrature. Il danno resta «farsi recitare gli script aziendali».
- **Nessun limite ai tentativi di login**: vero, non corretto. Password scrypt
  con sale e confronto a tempo costante, messaggio d'errore identico nei due
  casi; resta un oracolo di **temporizzazione** (l'email che non esiste esce
  subito, quella che esiste paga uno scrypt).

**Verifica**: `tsc` 0, `build` 0, `prova-sicurezza.mts` **48/48**, il giro del
cookie con la generazione provato a parte (9/9), le altre suite rilette. Commit
`63e069fc`, deployato, alias + health 200 + cancello provato in produzione.

## 27/08/2026 (7) — Partner: una sezione che dice chi ha preparato che cosa

Chiesto dall'utente. L'elenco dei partner dice **chi esiste** e lo legge dal
registro Anagrafiche; non diceva **chi ha lavorato** — che è un dato di questa
app (`Ordine.fornitoreNome`, `fornitoreCosto`) e si poteva guardare solo un
ordine alla volta.

Adesso `/partner` ha due sezioni. «Fornitori usati» mostra, per ogni fornitore,
i suoi ordini con venduto, quanto è andato a lui e il margine. I pagamenti
aggiungono quello che l'ordine non dice — un fornitore pagato su un ordine che
non lo nomina — **marcato come tale**, perché l'importo di un bonifico non è il
costo concordato e potrebbe essere un acconto.

⚠️⚠️ **E dice quanto poco sa**: **22 ordini su 1.380** dicono chi li ha
preparati (1,6%). Ventidue righe senza quel numero accanto si leggono «abbiamo
usato ventidue fornitori», che è falso.

⚠️ Gli ordini aperti **non sono una tabella dentro la tabella**: una `<table>`
dentro un `<td>` non ha una larghezza contro cui restringersi, quindi
`overflow-x: auto` non si accende mai e la cella cresce. Misurato a 375px:
tabella interna da **564** dentro una cella da **373**, e **tutta la pagina
scorreva di lato**. Ora ogni ordine è una riga che va a capo — misurato dopo:
pagina 375 su schermo 375, e su desktop resta una riga sola da 36px.

⚠️ **Nota di metodo**: la prima misura diceva anche «14px di scorrimento
laterale» ed era **un artefatto della pagina di prova**, che usava un `<main>`
nudo invece della classe `.main` (padding 14px sul telefono) — cioè proprio i
14px che il margine negativo dei contatori si mangia. Corretta la cornice della
prova, l'accusa è sparita. Misurare su una cornice diversa da quella vera è lo
stesso errore delle anteprime con dati inventati.


## 27/08/2026 (7) — l'AI non rispondeva, e il suo bottone non si accendeva

Segnalato dall'utente: «la risposta automatica dell'AI non funziona, inoltre il
bottone su inbox non è chiaro, dovrebbe essere colorato se AI è attivo».

### Il bottone: la regola CSS non si applicava, mai

⚠️⚠️ La regola c'era ed era scritta `button.ai-accesa` — specificità **(0,1,1)**.
Il bottone porta `.bottone.secondario.mini`, che è **(0,3,0)**: sfondo, bordo e
colore li vinceva quella, sempre. **Acceso e spento avevano la stessa identica
faccia**, e l'unica differenza era la parola scritta dentro.

**Provato, non dedotto**: la regola nella forma vecchia, iniettata **per ultima**
nel documento, perde lo stesso (fondo `rgb(255,255,255)`, testo
`rgb(29,29,31)` invece dell'oro). Perde per specificità, non per ordine.

Adesso il selettore è `button.bottone.secondario.ai-accesa` — **(0,3,1)**, batte
per costruzione e non per posizione nel file. Misurato dopo: fondo
`rgba(184,150,62,.12)`, bordo `#B8963E`, testo `#A07F2C`, peso 600, **pallino
oro da 7px**. ⚠️ Oro come **accento e non come fondo pieno**: il Design System
dice che i bottoni pieni sono neri. E «spenta» adesso è uno **stato** anche lui —
pallino grigio, testo secondario — mentre finché lo stato non si sa il pallino
**non c'è**, perché «non lo so» non deve somigliare a «spenta».

### L'AI: metà del giro se lo mangiavano conversazioni bloccate

⚠️⚠️ **Il filtro stava DOPO il taglio.** La query prendeva le prime `PER_GIRO`
(10) **dalla più vecchia**, e solo dopo scartava «ha già una risposta in fondo»,
«c'è già una domanda aperta all'amministratore», «tetto raggiunto». Ma gli scarti
stanno **esattamente in cima**, perché sono i più vecchi — e una domanda aperta
resta aperta **finché una persona non risponde**, quindi quel posto è perso a
ogni giro, per sempre.

**Misurato sulla coda vera del 27/08 alle 11:45: 10 candidate, 10 posti, e
CINQUE bruciati.** Con undici messaggi in coda, l'undicesimo cliente non sarebbe
mai entrato nel giro.

Adesso si guarda largo (`PER_GIRO * 6`) e si conta come **lavorata** solo una
conversazione che arriva davvero a chiedere all'AI: gli scarti non costano una
chiamata e non consumano il tetto.

⚠️ **E le caselle a cui non c'è nessuno non si toccano.** Nella coda vera non
c'era **un solo cliente**: un avviso di mancata consegna (`mailer-daemon@…`), due
newsletter, un fornitore. A un `mailer-daemon` non si può rispondere, e chiedere
all'amministratore su WhatsApp «non so cosa rispondere a mailer-daemon» è il modo
più veloce di insegnargli a non guardare più gli avvisi. Si guarda
l'**indirizzo** e non il testo, con una lista corta e ancorata: `norberto@` non è
`no-reply@`, e sbagliare in quel verso vorrebbe dire non rispondere a un cliente.

⚠️ **L'orologio mentiva.** L'ultimo giro si scriveva **solo in fondo**, cioè solo
quando il giro arrivava a guardare le conversazioni — ma esce prima in quattro
casi su cinque (spenta, c'è chi lavora, niente in coda, nessuno script). Il
pannello diceva «ultimo giro alle 08:50» alle 11:45, che si legge in un modo
solo: **il cron è morto**. Non lo era, stava rispettando i turni. Adesso sono due
righe: «ultimo controllo» (il cron è passato) e «l'ultima volta che ha lavorato»
(l'ultimo esito vero, che non si sovrascrive).

### ⚠️ Quello che resta com'è, e va saputo

**L'AI risponde SOLO fuori turno**, ed è la seconda delle quattro serrature. In
griglia ci sono 21 ore coperte su 168 e adesso ce n'è una attiva: finché c'è
qualcuno in turno il giro non parte, ed è giusto così. Chi guarda l'inbox in
orario di lavoro **non vedrà mai** l'AI rispondere.

**Quattro domande aperte all'amministratore** (una del 23/08). Finché restano
aperte, quelle conversazioni non si lavorano — adesso però non bloccano più le
altre.

**Verifica**: `tsc` 0, `build` 0, prova nuova `prova-coda-ai.mts` **13/13**, stili
misurati nel browser su una pagina temporanea poi cancellata.

## 27/08/2026 (6) — Google Maps entra in anagrafica, e la carta da remoto

Due richieste dell'utente: «devi importare **tutti** i dati da maps che servono
per creare il contatto in anagrafiche», e «aggiungi come metodo di pagamento:
**carta da remoto**».

### 1. Da Google Maps al contatto in anagrafica

⚠️⚠️ **Prima: di un fornitore trovato su Maps entrava nel registro IL NOME E
BASTA.** La chiamata di dettaglio chiedeva a Google cinque campi e la schermata
ne teneva **due** (telefono e città); indirizzo, CAP, provincia, regione, sito,
voto e `place_id` si buttavano nel punto stesso in cui erano appena arrivati. E
poi qualcuno riapriva Google sul telefono e li ricopiava a mano — cioè il lavoro
che quella ricerca esisteva per togliere.

**Adesso** la scheda arriva intera e viaggia dalla schermata al registro:

- ⚠️ **L'indirizzo si prende A PEZZI** (`addressComponents`), non tagliando la
  riga formattata. La riga è fatta per essere letta, cambia forma fra le due API
  di Google (è il motivo per cui esiste `cittaDa`) e in Francia cambia del tutto;
  i pezzi hanno un nome — `locality`, `postal_code`,
  `administrative_area_level_2` — e quel nome vale in ogni paese. `cittaDa`
  resta come **ripiego**, non come regola.
- ⚠️ **La provincia si prende breve** («MI») e **solo se sono due lettere**: in
  Francia `administrative_area_level_2` breve è «Alpes-Maritimes», e infilarla
  in un campo che il registro tratta come sigla sporca i filtri. Senza sigla da
  Google si ricade su `siglaProvincia`, che risponde solo quando è certa —
  serve perché la lista «fornitori in zona» **filtra per provincia**.
- ⚠️ **`bakery` NON diventa PASTICCERIA.** La tabella dei mestieri
  (`src/lib/anagrafica-da-maps.ts`) è corta apposta: in Italia un `bakery` è
  anche il panificio, e il merge del registro **protegge** una categoria già
  scritta. Meglio `ALTRO`, che chiunque corregge, di «PASTICCERIA» addosso a un
  fornaio. E il mestiere ricavato dal **nostro** ordine (`mestierePerNegozio`)
  batte sempre i tipi di Google: quello è un fatto, questo è una descrizione.
- ⚠️⚠️ **Il voto di Google resta di Google**: va nelle note, mai in `votoD2C`,
  che nel registro è **il nostro** giudizio sulle consegne. Confonderli vuol
  dire leggere «4,6» credendo di aver valutato noi un fornitore mai usato.
- ⚠️ **Quello che Anagrafiche non ha dove mettere** — sito, CAP e `place_id` —
  finisce nelle **note**, in chiaro e attribuito a Google. Il registro non ha
  quei campi, e i `RiferimentoEsterno` sono agganciati al sistema che scrive:
  metterci un `place_id` spacciandolo per un nostro id renderebbe
  irrintracciabile la richiesta vera.
- ⚠️⚠️ **Non si copia niente in casa nostra.** La scheda attraversa il
  salvataggio come argomento e finisce nel registro, che è il proprietario di
  indirizzo, telefono e categoria (Standard Deluxy §7). Nessuna colonna nuova.
  **Conseguenza da sapere:** al richiamo dal «Pagata» quell'argomento non c'è
  più, quindi se la scrittura del salvataggio è fallita (registro
  irraggiungibile, match ambiguo) i dati di Maps non tornano da soli.

**Due trappole schivate, tutte e due misurate sul codice dell'altra app:**

⚠️⚠️ **La città NON si manda al match**, nemmeno adesso che la sappiamo. Il
registro, nel match, la confronta come `citta: citta.toUpperCase()` — un uguale
**sensibile alle maiuscole**, eredità dell'import Excel. Su un'anagrafica
scritta «Milano» quel filtro non trova niente, il match risponde «nessuna» e noi
creeremmo il doppione **proprio del fornitore che c'era**.

⚠️ **La scheda si applica solo se parla di chi stiamo scrivendo.** Il nome che va
al registro è quello dell'ORDINE quando c'è, non l'intestatario da cui è nata la
scheda: normalmente sono la stessa azienda (la rotta blocca con un 409 chi chiede
di pagare Caio su un ordine di Tizio), ma quel blocco ha un'eccezione — il
**rimborso al cliente** — e lì si attaccherebbe l'indirizzo di un'azienda a
un'altra.

E la schermata **dice cosa entrerà**, elencando i campi che ci sono davvero: una
scrittura su un'altra app che avviene in silenzio si scopre quando dà fastidio.

### 2. «Carta da remoto»

Il metodo nuovo: la **nostra** carta data al fornitore per telefono o digitata
sul suo sito. Finché non c'era finiva in «Altro (scritto)», cioè una spesa fatta
con la carta aziendale che negli elenchi non si distingueva da un accordo a voce.
`metodo` è una colonna di testo: nessuna migrazione.

⚠️⚠️ **E il numero della carta il salvataggio lo RIFIUTA** — per tutti i metodi,
non solo per questo: `riferimentoPagamento` sta **in chiaro** in un Postgres
condiviso con altre tredici app e viene ricopiato dentro l'avviso su
WhatsApp/Telegram. Si riconosce per la **forma del valore** (13-19 cifre, anche
spezzate, **e valide col controllo di Luhn**), non per il nome del campo. Luhn
serve a non bloccare un IBAN incollato o un codice d'ordine lungo: sbagliare in
quel verso fermerebbe il lavoro. Le ultime quattro cifre restano libere, ed è
quello che il campo chiede di scrivere.

**Verifica**: `tsc` 0, `build` 0, due suite nuove (**18/18** e **36/36**) e le
altre rilette. ⚠️ Le tre che falliscono — `ai-fuori-turno` (21 ore di turni
coperte su 168), `messaggi-ordine` (0 ordini in quello stato) — falliscono **sui
dati**, non sul codice, ed erano già così.

## 27/08/2026 (5) — chiusi tutti i punti rimasti aperti

Chiesto dall'utente: «sistema tutto» — cioè i tre punti di layout lasciati in
sospeso e i tre difetti latenti della caccia agli errori.

### I tre di layout

**1. Le pillole grigie identiche adesso hanno delle FAMIGLIE.** Sulla stessa
scheda ce n'erano quattro-cinque **identiche al pixel** che dicevano cose
diverse: chi prepara l'ordine, che cliente è, a che punto siamo, cosa dice
l'altra app. Il design system diceva già come si fa («pillola con dot colorato +
testo, testo semantico pieno») e il dot in `.badge::before` c'era già, in
`currentColor`: mancava dare a ogni famiglia il suo colore, che tinge testo e
pallino insieme.
- `.badge-fornitore` → **oro**: è la famiglia del denaro che esce.
- `.badge-cliente` (tipo e storia) → **contorno invece di pieno**, così la
  famiglia si riconosce anche quando il colore è il grigio di «Privato», che è il
  tipo neutro e grigio deve restare.
- `.badge-altrove` → **blu**: quello che dice un'altra app (stato Shopify,
  canale). ⚠️ Confonderlo col nostro stato di lavorazione è l'errore che questa
  distinzione esiste per impedire.

**2. Un solo vocabolario di bottoni.** Convivevano `.btn` (grigio pieno, senza
bordo, 28px) e `.bottone` (bianco, bordo hairline, 26px), stessa funzione e due
facce. Contati: **`.bottone` ~1.534 usi, `.btn` ~30**, quasi tutti nel pannello
del dettaglio. ⚠️ Non ho riscritto trenta chiamate: ho **allineato `.btn` a
`.bottone`**, che è quello che l'app usa davvero. Stesso risultato, nessun file
toccato, niente da sbagliare in trenta punti.

**3. La cornice della bacheca si stringe (~60px).** Sopra il primo ordine ci sono
18 controlli e la prima scheda cominciava a **y=390** su 900 — il 43% è cornice.
⚠️⚠️ **Non ho tolto niente**: i comandi restano tutti, è la regola di quest'app.
Si sono ridotti i margini fra le tre righe di filtri e la larghezza minima della
casella di ricerca, che a 240px mandava la barra a capo su due righe.

Più l'etichetta che non combaciava: l'avviso diceva «Premi **Aggiorna adesso**» e
il bottone si chiama «Aggiorna».

### I tre difetti latenti

**4. ⚠️⚠️ LA RICONCILIAZIONE NON INDOVINA PIÙ QUALE ORDINE.** Era il più serio:
`riconcilia.ts` cercava l'ordine con un `findFirst` **sul numero**, e ci scriveva
sopra `fornitoreNome` e `fornitoreCosto` — che entrano nel margine e vengono
mandati a Deluxy Orders — **da solo**, quando qualcuno preme «Pagata». Il giorno
che due negozi hanno lo stesso numero, quel costo finisce sull'ordine sbagliato:
un costo falso su una vendita e un margine falso su un'altra, tutti e due in
silenzio.

L'identità c'era già e si buttava via: **l'operatore l'ordine lo SCEGLIE** da un
elenco, e al salvataggio restava solo il numero. Adesso si conserva.
- Schema: **`RichiestaPagamento.ordineId`**, aggiunta con una sola
  `ALTER TABLE ADD COLUMN … DEFAULT ''` (verificata prima con `migrate diff`:
  nessuna deriva, nessun dato toccato).
- La rotta la salva, il modulo la manda, `riconcilia.ts` la preferisce al numero.
- ⚠️ Sulle righe **vecchie** `ordineId` è vuoto: lì si usa ancora il numero, ma
  **solo se porta a un ordine solo**. Se sono due, non si sceglie — si risponde
  `numero-ambiguo` e si manda a registrare il fornitore dall'ordine giusto.
  Misurato: **zero numeri ripetuti su 1.373 ordini e 3 negozi**, quindi oggi il
  ripiego non sbaglia mai; il controllo è per il giorno del quarto negozio.

**5. La sincronizzazione con la piattaforma legge a pagine, e il segnaposto segue
quello che ha letto.** Prima chiedeva **una pagina da 200** e poi scriveva il
segnaposto ad `adesso`: oltre le 200, il resto non si leggeva **mai più**. Il caso
peggiore era il primo giro (`da = null`), dove la piattaforma torna le 200 **più
vecchie**. Ora si continua da **`aggiornataIl` dell'ultima letta** (non serve un
`offset`: la rotta accetta `aggiornateDa` e ordina per data), fino a 20 pagine, e
il segnaposto diventa **l'ultima data davvero letta** — così un giro interrotto a
metà riprende da lì invece di saltare avanti. Se si è dovuto smettere prima,
**lo scrive**.

**6. «Da rispondere in chat» contato sul database.** Nasceva da una lista con
`take: 200`, mentre «da rispondere» è un `count` vero: sopra le duecento in
attesa, `daRispondereEmail` — che è la differenza fra i due — si sarebbe presa
tutto l'errore. Due numeri sullo stesso schermo devono venire dallo stesso
insieme.

### Verifica

`npx tsc --noEmit` esito 0 · `npm run build` esito 0 · **sette suite di prove,
tutte passate** · nessun carattere di controllo nei sorgenti.

## 27/08/2026 (4) — layout: due agenti misurano, due li smontano, sei correzioni

Chiesto dall'utente: «crea un agente che esamina il layout lato desktop e uno
lato mobile, entrambi insieme a un agente ostile ne valuta la ux e ui… da mobile
esempio il popup su un ordine non è funzionale e poi ci sono dei bottoni che
sembrano ripetuti».

Due agenti hanno misurato (uno desktop, uno telefono) montando i componenti veri
su una pagina d'anteprima sotto `/widget`. Altri due li hanno **rimisurati con
l'incarico di smontarli** — e con i **dati veri del database**, che è la parte
che ha cambiato le conclusioni.

### ⚠️ Quello che i dati veri hanno smontato

- **«WhatsApp ed Email del fornitore raddoppiati nella scheda»**: su **1.375
  ordini su 1.375** `fornitoreTelefono` e `fornitoreEmail` sono **vuoti**, e quei
  due bottoni esistono solo se pieni. Era l'artefatto di un fornitore inventato
  nell'anteprima.
- **«Il pannello è alto 4.925px»**: su un ordine vero è **3.321px**, e le righe
  prodotto per ordine sono **mediana 1** (111 su 120 ne hanno una sola). Il
  pannello gonfio veniva dai dati finti… **ma il numero peggiore era vero per un
  altro motivo**, vedi sotto.
- **«Lo stato dell'ordine è scritto due volte sulla scheda»**: il doppione è
  **impedito di proposito** (`PASSI.includes(gestione) ? null : badge`); ricompare
  solo sugli ordini già gestiti, a 32px, e sono due oggetti diversi.
- **«Il select Assegna è largo 171px»**: **158**, sta **da solo sulla sua riga**,
  e lo vede solo un amministratore.
- **«`top: 63px` scritto a mano diverge da `--h-topbar`»**: la media query
  riscrive **tutti e due** i valori con la variabile. Oggi non possono divergere.
- **«Il menu laterale è troppo lungo»**: 33 voci, a 900px se ne vedono 18 e la
  prima nascosta è «Punteggi» — cioè esattamente il gruppo che il commento mette
  in fondo apposta. **Non è un difetto.**
- **«9 comandi dell'inbox sono inerti»**: non inerti — dietro una barra di
  scorrimento orizzontale. Che però nessuno cerca, quindi la correzione si fa lo
  stesso.

### Le sei correzioni

**1. ⚠️⚠️ IL POP-UP DELL'ORDINE SUL TELEFONO: «Chiudi» era fuori dallo schermo.**
Esattamente la segnalazione dell'utente. Misurato a 375px: **«Chiudi» occupava
370→430, cinque pixel visibili**; a 360px zero. Il pop-up guadagnava **55px di
scorrimento laterale**, e per chiudere bisognava strisciare di lato dentro una
finestra — un gesto che non prova nessuno. Rientrava solo **sopra i 430px**, cioè
su nessun telefono comune, e per questo dal computer non si vedeva.
Causa: `.pannello-testa` è `flex` **senza `flex-wrap`**, il blocco di destra tiene
297px di bottoni e quello di sinistra non ha `min-width: 0`. Ora ha tutti e due.
**Misurato dopo: «Chiudi» a 295→354, dentro; scorrimento laterale ZERO.**

**2. La testata resta in alto.** Era `static` in cima a un pannello alto **4,1
schermate di telefono**, con **un solo** «Chiudi» in tutto il pannello, nessuno
in fondo, Esc che sul telefono non esiste e del velo due strisce da 8px per lato.
Ora `position: sticky`. **Misurato: scorrendo di 1.200px «Chiudi» è ancora a
y=96.**

**3. ⚠️⚠️ La lista dei fornitori in zona non aveva nessun tetto.** È il motivo
vero per cui il pannello diventa enorme: nel registro **Milano ha 31 fornitori**
(22 pasticcerie + 9 fiorai), e il **51% degli ordini è del negozio «Deluxy»**,
che non dice il mestiere — quindi si mostrano **entrambe** le liste. Misurato: 9
schede = 4.904px, 22 schede = **7.312px**, con tutto acceso **9.722px**. Adesso
se ne mostrano **sei**, con «Mostra tutti (N)» che dice **quanti** ne restano —
una lista tagliata senza dire quanti ne mancano fa chiamare il primo che c'è
invece del più adatto.

**4. Lo scorrimento del pannello non trascina più la bacheca sotto**
(`overscroll-behavior: contain` sul velo): finiti i 3.000px il dito continuava
sull'elenco, e chiudendo ci si ritrovava altrove.

**5. I campi «nudi» del pannello.** Quattro input su ogni ordine erano HTML
grezzo: **Arial 13,3px, bordo `inset`, alti 21px**. ⚠️ E sotto i 16px **Safari
ingrandisce la pagina quando ci si entra** — con lo scorrimento laterale già
presente, si finiva a spasso. Ora **40px e 16px** (non 15: il `font: inherit`
dell'app non sarebbe bastato). **Misurato: 40px / 16px.** Insieme: la casella
«fatta» del diario da **13×13** a 22.

**6. ⚠️⚠️ LO STESSO COMANDO CHE FA DUE COSE DIVERSE.** Questo è il «bottoni che
sembrano ripetuti» dell'utente, ed è peggio di un doppione: **«Chiedi rimborso»
dal pannello non passava telefono ed email**, mentre lo stesso comando dalla
bacheca sì — e la pagina Rimborsi li legge dall'indirizzo per riempire il modulo.
Aprendo il rimborso dal pannello, la richiesta **nasceva senza recapiti**.

### E dal desktop

**7. La griglia del dettaglio lasciava «Ordine» in seconda riga con due colonne
vuote.** Cinque riquadri su tre colonne: la seconda riga comincia sotto il **più
alto** della prima, quindi destinatario, indirizzo, totale e i bottoni per
chiamare il cliente cadevano a **y=1.101** su un ordine vero, con circa 3.000px
di buco di fianco. Ora è `column-count` con `break-inside: avoid`, e le colonne
si riempiono. **Misurato: «Ordine» da y=1.101 a y=294, pannello da ~2.240 a
1.279px.** Due colonne sotto 1100px, una sola sotto 800.

**8. `.colonna { max-height: calc(100vh - 190px) }` sbagliava di 126px.** Sopra
la colonna, a 1440×900, ce ne sono **316**: la colonna finiva **126px sotto il
bordo**, e ci volevano due scorrimenti annidati — quello dentro la colonna per
gli ordini e quello della pagina per vedere il fondo della colonna, che gli
ordini non li muove. Cioè esattamente ciò che quel `max-height` esisteva per
evitare. Ora **330**.

**9. La barra dell'inbox va a capo.** In vista «Elenco» la colonna è larga 324px
e la barra ne chiede **900**: tredici comandi finivano dietro una barra di
scorrimento orizzontale in fondo a un elenco alto 790px. Fra quelli fuori:
«Colonne» (la via di ritorno) e l'interruttore «Risponde l'AI».

### 🟡 Confermati e non corretti

- **Quattro-cinque badge grigi pixel-identici** sulla stessa scheda dicono cose
  di famiglie diverse (costo fornitore, canale, tipo cliente, stato Shopify), tre
  su quattro senza `title`. Vero e misurato; è un lavoro di tassonomia visiva che
  merita una passata sua.
- **18 controlli sopra il primo ordine**, che comincia a y=390 su 900. Vero: a
  900px si vede una scheda e mezza.
- **Due sistemi di bottoni** (`.btn` e `.bottone`) convivono, ma non si vedono
  mai affiancati (distanza minima misurata: 90px).
- **«Premi Aggiorna adesso» / bottone «Aggiorna»**: una parola, su un avviso che
  compare solo se la sync è ferma da un'ora.

### Verifica

Misure prese nel browser a **375×812** e **1440×900** su una pagina d'anteprima
temporanea (ora cancellata), con i valori riportati qui sopra.
`npx tsc --noEmit` esito 0 · `npm run build` esito 0.

## 27/08/2026 (3) — caccia agli errori: 32 sospetti, 3 agenti ostili, 20 corretti

Chiesto dall'utente: «correggi tutti gli errori di codice dell'app; prima di
vedere che sia un errore sottoponi l'errore a un agente ostile».

Tre agenti hanno cercato (rotte API, componenti React, librerie) e hanno prodotto
**32 sospetti**. Altri tre, con l'incarico di **REFUTARE**, li hanno riletti sul
codice vero e sul database. Ne sono caduti nove.

### ⚠️ Quello che gli agenti ostili hanno SMONTATO (e che quindi NON ho toccato)

- **«Il webhook Meta accetta chiunque»**: falso. `metaAppSecret` e `igAppSecret`
  ci sono entrambi, la firma si verifica. Resta un `if` che fallisce in apertura
  se un giorno fossero vuote — annotato, non cambiato.
- **«Il passaggio a in_pagamento cerca il numero in una forma sola»**: vero come
  codice, impossibile come scenario — **1.373 ordini su 1.373 col cancelletto,
  22 richieste su 22 col cancelletto**, e il numero non arriva mai da un campo
  libero.
- **«L'avviso al fornitore non parte per via del numero»**: non parte, ma per un
  altro motivo, dichiarato: **21 fornitori su 21 non hanno né telefono né email**.
  Il messaggio che manda a compilarli è corretto.
- **«Il conteggio delle note perde una riga»**: nessuna nota è scritta senza
  cancelletto (28 su 28), e tutte le strade di scrittura normalizzano.
- **«La percentuale di margine si vede solo in perdita»**: la condizione morta
  c'è, ma il numero è comunque a schermo su ogni riga.
- **«Il contatore "ordini nuovi" confronta due orologi»**: l'aritmetica
  dell'accusa era sbagliata, e lo scarto misurato è ~1 s.
- **«appCostoPartner non si aggiorna mai»**: il ramo accusato non è quello che
  scrive.
- **«La corsa fra due conversazioni mostra i messaggi di A sotto il nome di B»**:
  si ripara da sola in 4 s e non sporca nessuna scrittura.
- **«L'avviso anti-doppione mancante fa creare due pagamenti»**: falso, la
  serratura è sul server (409).

### 🔴 I difetti confermati e corretti

**1. Settantuno rotte API non chiedevano CHI SEI.** Il cookie è
`userId.firma(userId)`, dura 30 giorni e la verifica guarda **solo la firma**: un
account cancellato continua a passare. Le **pagine** lo buttavano fuori (il
layout rilegge l'utente dal database), le **API no** — e `GET /api/clienti`
restituiva la rubrica completa dei clienti. Contate: 131 rotte, 22 esenti per
disegno, **71 delle restanti 109 senza nessun controllo**, e nessuna con una
difesa alternativa.
Adesso ce l'hanno tutte. ⚠️ Per chi lavora **non cambia niente**: erano già
dietro al middleware, che pretende un cookie firmato.
⚠️⚠️ E dodici file avevano il controllo in **qualche** handler e non in tutti —
`turni`, `glossario`, `pagamenti`, `rimborsi`… È il modo in cui un buco resta
aperto proprio dove sembra chiuso: il file «ha l'autenticazione», e nessuno va a
vedere in quale dei suoi tre handler.

**2. Il costo del fornitore finiva sul fornitore sbagliato.** In
`riconciliazione.ts` il confronto dei nomi usava `nomeCorrisponde`, che è la
regola di una **casella di ricerca** («basta una parola»). Qui però non si cerca:
si **afferma** che il pagamento riguarda quel fornitore, e da lì parte una
scrittura che entra nel margine e viaggia fino a Deluxy Orders — **da sola**,
premendo «Pagata». Misurato sui 21 fornitori veri: **28 coppie su 420 (6,7%) di
fornitori diversi risultavano «lo stesso»** — «S.A.S. ELENA FLEURS» con «RIGUTTO
ELENA», «LA PEONIA FIORI PIANTE» con «donna di fiori di Longo Michela»,
«Passiflora flower market» con «Goshà flowers»; e un intestatario di **una
lettera** combaciava con tutti.
Adesso usa `stessaIdentita`, che in questo stesso file c'era già, con scritto
sopra il motivo. **Provato**: le 6 corrispondenze false cadono tutte, le 3 vere
reggono.

**3. `ordineDaOrders` poteva rispondere con l'ordine di un altro negozio.** Il
ripiego «se ce n'è uno solo prendi quello» era in `??`, e `??` scatta anche
quando il primo ramo **è stato provato e ha fallito**: chiedendo un ordine col
suo `shopifyId`, se quello non entrava nella pagina di 20 risultati si tornava
l'omonimo di un altro negozio, in silenzio. (Misurato su Orders: `q=2705` dà 26
candidati e la pagina si ferma a 20.) Ora, con l'id in mano, «non l'ho trovato» è
la risposta.

**4. Le ore di copertura dei turni si SOMMAVANO invece di unirsi.** Tre operatori
lunedì-venerdì 09-18 davano «33 ore scoperte» quando sono **123**; con cinque
usciva «**−57**». È il numero che una persona legge **prima di accendere** l'unica
funzione che scrive ai clienti da sola, con la soglia rossa a 100: l'errore
andava **sempre** verso «è sicuro accendere». Ora gli intervalli si uniscono per
giorno. **8 prove**, compresa la griglia vera (21 ore su 168, invariata).

**5. Quattro segreti stavano in chiaro** nella tabella `Impostazione` di un
Postgres condiviso con altre tredici app: `igAppSecret` era in chiaro mentre
`metaAppSecret`, nella stessa pagina e con lo stesso uso, era cifrato. Aggiunte
a `CHIAVI_CIFRATE` (+ `shopifyClientSecret`, `googleMapsApiKey`,
`piattaformaApiKey`).
⚠️⚠️ **Cambiare l'elenco non cifra quello che è già scritto**, e leggere un
valore in chiaro come se fosse cifrato avrebbe **spento la verifica delle firme
dei webhook**. Perciò la lettura ora **riconosce la forma** di un valore cifrato:
se non ce l'ha, è un valore vecchio e si restituisce com'è. Migrazione:
`scripts/cifra-segreti-in-chiaro.mjs --scrivi` (idempotente, non stampa mai un
valore). Trovati in chiaro: **2** — `igAppSecret` e `googleMapsApiKey`.

**6. «Oggi» era il giorno del server, cioè UTC.** Misurato in diretta alle 00:42
di Roma: la schermata «Oggi» mostrava le consegne di **ieri** e **8 ordini in
ritardo invece di 3**. Ora `inizioOggi()` legge il giorno di **Roma**.

**7. Un ordine annullato contava come lavoro da fare.** `gestione != gestito`
senza `annullatoIl: null`: **104 «da fare», di cui 16 annullati** (15%), sia nel
numero accanto alla voce di menu sia nella schermata «Oggi».

**8. Il numero d'ordine letto nella causale bloccava salvataggi legittimi.** La
regola era `/#?\s?(\d{3,})/`, senza confini: «Canone agosto 2026» diventava
l'ordine **#2026** e la richiesta **non si salvava**, con un messaggio che mandava
a cercare un ordine inesistente. Ora: cancelletto, oppure numero staccato di 3-6
cifre, non dentro una data e non dopo una parola che lo qualifica (mese, anno,
fattura…), e **un anno da solo non è un ordine**. ⚠️ Si sbaglia **per difetto**:
perdere un avviso costa meno che bloccare il lavoro. **15 prove.**

**9. Il filtro «non le mie» si applicava DOPO il taglio a dieci.** Con 12
pagamenti di cui i 10 più recenti fatti da me, i 2 dei colleghi non si vedevano —
e non si sarebbero visti **mai più**, perché il segnaposto è già oltre. Ora si
filtra prima. Stessa cosa per i rimborsi.

**10. Il pallino si accendeva per una cosa SPARITA.** Il confronto era
`!==` («diverso»), non `>` («più recente»): le sezioni filtrano le righe
cestinate e annullate, quindi cancellando la più recente la data **torna
indietro** e il menu segnalava una novità che non c'era.

**11. Cancellare un rimborso ESEGUITO, e una richiesta GIÀ PAGATA, con un clic.**
Nessuna conferma, nessun controllo di stato, nessun cestino — mentre le
conversazioni un cestino di 30 giorni ce l'hanno. E per i rimborsi c'era di
peggio: il tetto «non rendere più di quanto incassato» si calcola sommando i
rimborsi esistenti, quindi cancellandone uno da 250 € su un ordine da 250 € se ne
poteva fare un altro totale. Adesso: **il server rifiuta** (409) su un rimborso
eseguito e su una richiesta con `pagataIl`, e il client **chiede conferma
dicendo cosa sparisce**.

**12. La risposta al cliente spariva dal riquadro senza essere partita.**
`setBozza('')` era incondizionato: se la risposta non era JSON — il 307 verso
`/login` che `fetch` segue e che torna **HTML con stato 200** — non compariva
nessun errore **e la casella si svuotava lo stesso**. Ora si svuota solo dopo il
sì del server. Stessa correzione nel diario dell'ordine.

**13. Nella vista di partenza, gli errori dei gesti sull'elenco non erano
disegnati MAI.** Il riquadro rosso stava dentro il ramo «c'è una conversazione
aperta», ma archivia, elimina, spam e «da leggere» hanno il bottone su ogni riga
— e la vista di default è «colonne», dove il thread esiste solo in una finestra.
Si premeva, non succedeva niente, e non si sapeva perché. Ora sta in cima.
⚠️ E la segnalazione **riuscita** finiva nel riquadro **rosso**: adesso ha il suo
verde.

**14. La traduzione fallita si ripeteva ogni 4 secondi, per sempre.** Falliva →
`daTradurre = false` → il polling del thread la rimetteva a `true` → si
riprovava. Con la chiave OpenAI scaduta, **fino a dodici chiamate ogni quattro
secondi** finché quella chat restava aperta. Ora le conversazioni su cui è già
fallita non si riprovano.

**15. «Silenzia per un'ora» voleva dire «finché non ricarichi».** Allo scadere
non cambiava nessuna dipendenza e non c'era nessun timer: gli avvisi restavano
spenti. Ora il silenzio scade da solo.

**16. Il bottone diceva «AI spenta» anche quando non lo sapeva.** Se la lettura
falliva, lo stato restava nullo e `?? false` faceva scrivere «spenta» —
sull'unico interruttore che decide se l'app parla ai clienti da sola. Adesso dice
**«AI: non lo so»** e riprova ogni minuto.

**17. Un cambio di stato non salvato restava scritto a schermo.** `segna()` non
guardava `res.ok`; ora lo dice, con il riquadro che era già lì.

**18. «Nessun ordine ancora» quando la lettura era fallita** — con in più il
falso allarme «Google Contacts non è collegato», due bugie da una causa sola.
Ora la pagina distingue «vuoto» da «non ho letto».

**19. Il diario restava su «Carico…» per sempre** su una lettura fallita, e la
ricerca partiva a ogni tasto senza attesa né guardia di sequenza (otto richieste
per «biglietto», con la più vecchia che poteva arrivare per ultima). Ora c'è
l'attesa di 300 ms — la stessa che la bacheca degli ordini aveva già.

**20. Una mail a un indirizzo con maiuscole apriva una SECONDA conversazione.**
L'indirizzo è la **chiave** della conversazione; la posta in arrivo lo normalizza
e la rotta gemella pure, solo `email/invia` no. Sono **35 ordini su 1.152 (3%)**
ad avere l'email con maiuscole: al primo, la storia si sarebbe spezzata in due.

### 🟡 Confermati e NON corretti (annotati apposta)

- **`riconcilia.ts` sceglie il primo ordine con quel numero.** Latente: **zero
  numeri omonimi su 1.373 ordini e 3 negozi**. Si accende il giorno che si
  collega il quarto negozio — e la correzione giusta non è un `orderBy`, è
  **salvare l'id dell'ordine sulla `RichiestaPagamento`**, che oggi butta via il
  negozio scelto nel picker e tiene solo il numero.
- **La sync della piattaforma non pagina** (200 per giro, segnaposto spostato
  comunque). Oggi non gira: nessuna chiave configurata, 66 vendite in tutto. ⚠️ Da
  sistemare **prima** di configurare la chiave: al primo giro leggerebbe le 200
  **più vecchie** e salterebbe tutto il resto.
- **`daRispondereEmail` è una differenza fra un `count` vero e una lista tagliata
  a 200.** Il carico oggi è 3.

### 🩸 E un danno che mi sono fatto da solo, riparato

Lo script di migrazione dei segreti si era **riscritte** `cifra` e `decifra`
invece di importarle, e derivava la chiave con `sha256(APP_SECRET)` mentre l’app
usa `scryptSync(APP_SECRET, 'deluxy-messaging', 32)`. Il controllo che lo script
fa prima di scrivere **tornava** — perché cifrava e decifrava con la stessa
chiave sbagliata — quindi non ha fermato niente.

Risultato: `igAppSecret` e `googleMapsApiKey` scritti nel database in una forma
che l’app **non sapeva più leggere** — cioè verifica delle firme dei webhook
Instagram spenta, e Maps senza chiave. Me ne sono accorto perché **ho riletto i
valori dopo la migrazione**, e uscivano vuoti.

**Recuperati**: erano ancora decifrabili con la chiave sbagliata, quindi riletti
e riscritti con la funzione vera. Ricontrollati uno per uno: `igAppSecret` 32
caratteri, `googleMapsApiKey` 39, `metaAppSecret` 32, `openaiApiKey` 164,
`shopifyClientSecret` 38 — **tutti si rileggono**.

⚠️⚠️ **La lezione, e il motivo per cui quello script adesso è un `.mts`**: una
funzione crittografica **non si ricopia, si importa**. E «è già cifrata» adesso
si decide **provando a decifrarla con la funzione vera**, non guardandone la
forma: una forma giusta cifrata con la chiave sbagliata sembrerebbe a posto e
resterebbe illeggibile per sempre.

### Verifica

`npx tsc --noEmit` esito 0 · `npm run build` esito 0 · **sei suite di prove, tutte
passate** (`prova-causale-e-oggi`, `prova-copertura-pallini`, `prova-pallini`,
`prova-data-italiana`, `prova-correggi-riga`, `prova-chiusura-note`).

⚠️ **Un errore mio, da ricordare.** Scrivendo una patch con un heredoc, il `\b`
di una regex è diventato un **carattere di backspace vero** dentro il file: la
regex non combaciava più e la funzione dava il risultato sbagliato **senza
nessun errore**. Me ne sono accorto solo perché una prova falliva. Da allora ogni
patch finisce con `grep -P '[\x00-\x08...]'` su `src/`: oggi è pulito.

## 27/08/2026 (2) — il menu dice quanto lavoro c'è, non solo dove andare

Chiesto dall'utente: «rivedi tutto il menù per ottimizzare il lavoro del customer
service».

### Cosa NON ho cambiato, e perché

⚠️⚠️ **L'ordine delle voci era già ragionato, e le ragioni stanno scritte nel
codice**: «Preventivi» prima di «Nuovo ordine» perché un preventivo è il momento
in cui un ordine può nascere o non nascere; «Chiamate» subito sotto «Inbox»
perché è l'altro canale in entrata e l'unico che si cancella da solo;
«Riconciliazione» sotto «Pagamenti» perché ne è la conseguenza; «Turni» in cima
solo per l'amministratore, che per l'operatore quel gruppo non esiste.
**Riscrivere quell'ordine a gusto mio avrebbe buttato via ragioni nate dall'uso
vero**, sostituendole con niente. Quindi l'ho lasciato.

### Quello che al menu mancava davvero: il carico

Ventotto voci che dicono **dove andare** e nessuna che dica **quanto c'è da
fare**. Per sapere se l'inbox aspetta o se i reclami si stanno accumulando
bisognava aprirli uno per uno.

Adesso ogni voce porta **il numero** di quello che aspetta, con le stesse
definizioni della schermata «Oggi». Misurato adesso: **Inbox 2 · Ordini aperti
104 · Diario 25 · Pagamenti 2 · Reclami 6 · Rimborsi 4 · Chargeback 2** (Chiamate
e Preventivi a zero, e infatti il numero non compare).

⚠️⚠️ **NUMERO E PALLINO DICONO COSE DIVERSE, e servono tutti e due.** Il numero è
*quanto lavoro c'è*, il pallino è *è arrivato qualcosa da quando hai guardato*.
Una sezione può avere venti cose ferme da ieri (numero, niente pallino) o una
novità che un collega ha già preso (pallino, niente numero): con un segnale solo,
uno dei due casi diventa invisibile.

⚠️⚠️ **I conteggi sono quelli di `dashboard.ts`, riga per riga.** Due modi di
contare la stessa cosa nella stessa app producono due numeri diversi sullo stesso
schermo, e a quel punto non si crede più a nessuno dei due.
⚠️ **Un'eccezione, dichiarata**: i pagamenti. «Oggi» conta quelli non ancora
mandati a chi approva (`inviataIl: null`), che oggi sono **tutti e 22** perché il
collegamento a FINANCE non è configurato — un 22 fisso accanto alla voce sarebbe
rumore permanente. Nel menu si conta quello che resta **da pagare**
(`pagataIl: null`): **2**.

⚠️ **Il numero è neutro, il rosso è riservato a chi ha una SCADENZA.** Quasi
tutte le sezioni hanno un numero: se fossero tutti colorati non li guarderebbe
più nessuno. Rosso solo le **contestazioni con le prove in scadenza entro sette
giorni** — ⚠️ oggi 27/08 sono **ancora neutre**, perché la scadenza è il 4/09:
diventeranno rosse il 28.

### L'unica voce spostata

**«Casistiche» da «Reclami» a «Configurazione».** Non è lavoro: è il **catalogo**
dei tipi di reclamo con le azioni, e lo si tocca quando se ne aggiunge uno — cioè
quasi mai. In mezzo al lavoro quotidiano una voce che non si apre mai non è
neutra: **spinge più in basso quelle che si aprono ogni giorno**, e insegna a
scorrere il gruppo invece di leggerlo.

### Il costo, misurato

⚠️ La chiamata che riempie il menu fa **diciannove query** (nove date, nove
conteggi, più le contestazioni in scadenza) e gira **su ogni pagina, per ogni
persona**: misurata, **1,2 s**. Per questo il giro è passato da 60 a **90
secondi**: l'immediatezza ce l'hanno già i riquadri in basso a destra, che
chiedono ogni 25 secondi una cosa molto più leggera. Qui basta essere aggiornati,
non istantanei.

### Verifica

- **`npx tsx scripts/prova-pallini.mts` — 14 prove, tutte passate** (aggiornate
  alla forma nuova).
- **Sui dati veri**: `sezioniDelMenu()` in **1.222 ms**, con i nove numeri qui
  sopra.
- **Nel browser**, su una pagina d'anteprima temporanea (ora cancellata): il
  numero compare **solo dove è maggiore di zero** (Chiamate a 0 non mostra
  niente), quello delle contestazioni è **rosso** `rgb(215,0,21)` e gli altri
  grigi, il pallino sta **dopo** il numero a 12px dal bordo, **l'altezza della
  riga non cambia** (42px su tutte) e **nessun nome viene troncato** — nemmeno
  «Ordini aperti» con «104» e il pallino accanto.

`npx tsc --noEmit` esito 0, `npm run build` esito 0.

## 27/08/2026 (1) — la risposta automatica dell'AI si governa dall'INBOX, e il pallino giallo sul menu

Due richieste dell'utente.

### «Porta la possibilità di rispondere automaticamente tramite AI qui»

Il motore c'era dal 25/08 (`src/lib/ai-fuori-turno.ts`) ed era fatto bene —
quattro serrature, il dubbio che diventa una domanda su WhatsApp invece di
un'invenzione. Ma viveva in due posti che dall'inbox non si vedono: un
interruttore in fondo a **Impostazioni** e un **cron ogni dieci minuti**.

⚠️⚠️ **Risultato, misurato il 26/08: spento da sempre, ZERO risposte mandate su
1.070 messaggi usciti** — e nessuno che potesse accorgersene, perché l'esito di
ogni giro finiva **solo nel JSON della chiamata**. Un interruttore che sta dove
non si lavora è un interruttore che nessuno tocca; uno di cui non si vede lo
stato è peggio che non averlo, perché si crede di essere coperti quando non lo si è.

Adesso, nella barra dell'inbox accanto a «Suono» e «Avvisi», c'è **«AI accesa» /
«AI spenta»** — e il bottone diventa **oro pieno** quando è accesa. Aprendolo:

- **com'è messa**: accesa o spenta, **chi è in turno adesso** (in turno l'AI non
  risponde: è la regola, non un guasto), **quante conversazioni aspettano**,
  **quante risposte pronte** ha da cui attingere (a zero non parte: non inventa),
  e **l'ultimo giro** con data ed esito;
- **«Prova (non manda niente)»**: fa tutto il giro e mostra riga per riga cosa
  risponderebbe e a chi. È la cosa che mancava per potersi fidare;
- **«Accendi»/«Spegni»** e **«Rispondi adesso»**, solo per gli amministratori.

⚠️⚠️ **L'esito del giro adesso SI SCRIVE** (`aiFuoriTurnoUltimo` e
`aiFuoriTurnoEsito`): era l'unico modo per accorgersi che non stava girando.
⚠️ Il giro che si ferma perché **spenta** non scrive l'esito: se lo scrivesse a
ogni giro, l'ultima riga vera — quella dell'ultima volta che ha davvero risposto
— sparirebbe dopo dieci minuti.
⚠️⚠️ **Accendere e far partire un giro vero sono da AMMINISTRATORE** (prima la
rotta non chiedeva niente a nessuno): sono i due gesti che fanno arrivare un
messaggio a un cliente senza che una persona l'abbia letto. La **prova** invece
la può fare chiunque sia dentro, e non manda niente.
⚠️ Le conferme dicono **cosa succede**, non «sei sicuro?»: «da adesso un cliente
può ricevere una risposta che nessuno in azienda ha letto prima».

### «Metti un pallino giallo se arriva qualcosa di nuovo»

Un pallino oro in fondo alla voce del menu — Inbox, Ordini aperti, Chiamate,
Preventivi, Diario, Pagamenti, Reclami, Rimborsi, Chargeback — quando in quella
sezione è arrivato qualcosa **da quando l'hai guardata**.

⚠️ È il **fratello lento** dei riquadri in basso a destra: quelli dicono cosa è
appena successo e spariscono dopo nove secondi, questo **resta finché non vai a
guardare**. Un richiamo e un segnalibro.

⚠️⚠️ **Non si confrontano orologi.** Il server dice, per sezione, la data della
cosa più recente **che c'è**; il browser si ricorda **l'ultima già vista** e
accende il pallino se le due sono diverse. Segnando «visto» con `Date.now()` del
browser, un computer avanti di un minuto avrebbe il pallino sempre acceso e uno
indietro non l'avrebbe mai.

⚠️⚠️ **La prima volta non si accende niente**: da un browser nuovo si troverebbero
nove pallini accesi insieme, che non vogliono dire «è arrivato qualcosa» ma «non
ti conosco» — e un segnale che parte sbagliato non lo si guarda più.
⚠️ **Stando sulla pagina il pallino non si accende** e il segnalibro avanza da
solo: la si sta guardando adesso.
⚠️ Il segnalibro sta in `localStorage`: «l'ho guardato io» non è un fatto
dell'azienda, e tenerlo sul server vorrebbe dire una tabella in più per un pallino.
⚠️ La regola sta in **`src/lib/pallini.ts`** (pura, senza `db`): la barra
laterale è un componente del browser, e importare `novita.ts` ci avrebbe tirato
dentro Prisma.

### Verifica

- **`npx tsx scripts/prova-pallini.mts` — 14 prove, tutte passate**, comprese le
  due che contano: la prima volta non accende niente, e sulla pagina che si sta
  guardando nemmeno.
- **Sui dati veri**: `ultimoPerSezione()` risponde in **742 ms** con le nove date
  (Chiamate e Preventivi vuote, perché nessuno le ha ancora usate);
  `statoAiFuoriTurno()` dice `acceso: false`, nessuno in turno, 0 in attesa, 31
  risposte pronte.
- **Nel browser**, su una pagina d'anteprima temporanea (ora cancellata):
  ⚠️ **difetto trovato e corretto** — il pannello, allineato al bordo **destro**
  del bottone, cominciava a **x = −159**: un terzo fuori dalla finestra, perché
  il bottone sta in una colonna larga 340px sul lato sinistro. Ora è allineato a
  sinistra e **tenuto dentro lo schermo**: a 1280 sta a x=173, a **375 è largo
  351 e non fa scorrere la pagina di lato**. E **non si sposta né si taglia
  scorrendo l'elenco** (è `position: fixed`: la barra dell'inbox vive dentro un
  contenitore con `overflow-y: auto`, che ritaglia i figli assoluti su tutti e
  due gli assi).
  Il pallino: 8px, oro `rgb(184,150,62)`, 12px dal bordo della voce.

`npx tsc --noEmit` esito 0, `npm run build` esito 0.

## 26/08/2026 (18) — il «/» vale anche IN MEZZO alla riga, e togliendolo si chiude

Due segnalazioni dell'utente sul calendario di poche ore prima, tutte e due vere.

### 1. «sto provando a fare modifica ma non esce il calendario»

Con lo schermo davanti: la riga era **«chiamare / alle 9!»** — cioè aveva
selezionato «domani» e scritto «/» al suo posto, **in mezzo**. La mia regola
guardava **solo la fine del campo** (`dopo.endsWith('/')`), quindi lì non si
apriva mai.

⚠️⚠️ **In fondo si scrive quando la riga NASCE; in mezzo quando la si
CORREGGE.** Sono lo stesso gesto, e una regola che guarda solo la fine funziona
mentre si scrive e **non funziona mai mentre si corregge** — che è esattamente il
momento in cui una data si sostituisce. Il difetto è nato dal fatto che la
funzione l'avevo pensata sul campo «scrivi una riga nuova» e poi riusata nel
campo «correggi», senza rileggere la regola con quel secondo caso in mente.

Adesso `posizioneBarraComando(prima, dopo)` torna **dove** sta la barra (o -1):
confronta prefisso e suffisso comuni, quindi vale sia per una barra **inserita**
sia per una scritta **al posto di una selezione**. Restano fuori le stesse cose
di prima: «27/08», «e/o», e un testo incollato che contiene una barra.

⚠️ E la data va **al posto della barra, dov'era**: `value.endsWith('/')` avrebbe
tagliato l'ultimo carattere della frase lasciando la barra in mezzo. Lo spazio
dopo la data si mette **solo se serve** (in fondo sì, davanti a « alle 9!» no,
farebbe due spazi), e il **cursore torna dopo la data** — non in fondo alla riga,
o correggendo in mezzo bisogna ricercare a mano il punto in cui si era.

### 2. «tolto il "/" nascondi calendario»

Cancellata la barra, il pannello restava aperto sopra la pagina. Sta lì **per
quella barra**: sparita lei, non ha più un posto dove mettere la data.

⚠️⚠️ **Il tasto non bastava.** Scrivendo, il pannello si chiudeva già da
`onKeyDown` (`e.key.length === 1`), ma **Backspace e Canc non sono caratteri** e
passavano oltre. Ora si guarda **il testo**, non il tasto: così valgono anche il
taglia, il seleziona-tutto-e-cancella e l'annulla del browser.

⚠️ Si chiude anche se la barra c'è ancora ma **non è più dov'era** (una
cancellazione più a sinistra la sposta): la posizione salvata punterebbe a un
altro carattere, e la data finirebbe in un punto che nessuno ha scelto.

### Verifica

**`npx tsx scripts/prova-data-italiana.mts` — 25 prove, tutte passate**, fra cui
la nuova che descrive il caso segnalato: `dove('chiamare domani alle 9!',
'chiamare / alle 9!') === 9`.

**Provato nel browser** su una pagina d'anteprima temporanea (ora cancellata),
partendo proprio da «chiamare domani alle 9!»:
- «domani» sostituito da «/» → **il pannello si apre**;
- scelto il 28 → **«chiamare 28 agosto alle 9!»**, un solo spazio, e il cursore
  resta **a metà frase** (posizione 18), non in fondo;
- barra scritta in fondo dopo uno spazio → si apre; **barra cancellata → si
  chiude**;
- barra in mezzo → si apre; **cancellata una lettera prima di lei → si chiude**.

⚠️ **Un errore mio, per il prossimo che legge**: aggiornando il file di prova ho
usato `s.slice(inizio, fine)` con `fine = indexOf(...)` che aveva risposto
**-1** — e `slice(x, -1)` non vuol dire «fino alla fine», vuol dire «fino
all'ultimo carattere escluso»: mi sono mangiato metà file di prova, e me ne sono
accorto solo perché le prove stampate erano 12 invece di 25. Ripreso da git.
**Il controllo di `indexOf` va fatto su tutti e due gli estremi**, ed è ora nello
script.

`npx tsc --noEmit` esito 0, `npm run build` esito 0.
Design system portato a **1.3** (la regola della barra è cambiata: sta scritta lì).

## 26/08/2026 (17) — le righe del diario si CORREGGONO

Chiesto dall'utente: «consenti la modifica di singole note».

⚠️ Prima una riga sbagliata si poteva solo **cancellare e riscrivere**: per un
refuso si buttavano via **chi l'aveva scritta, quando, il filo dei suoi seguiti e
la spunta di chi l'aveva già chiusa**. La rotta `PATCH /api/diario/[id]`
accettava già `testo` e `ordineNumero`: mancava solo il modo di arrivarci.

**Adesso**: bottone **«Modifica»** accanto a «Cancella», su **ogni riga** — sia
le capofila sia i **seguiti**. Il campo prende il posto della riga (non si apre
sotto: vedere la frase vecchia sopra e la nuova sotto fa dubitare di quale delle
due varrà), con **Salva** e **Annulla**. Invio salva, Esc annulla. È lo stesso
campo del diario, quindi **«/» apre il calendario** anche mentre si corregge.

### La decisione difficile: il numero in testa

Aprendo la correzione, il numero d'ordine **torna in testa al testo** — altrimenti
sarebbe l'unica cosa della riga che non si può toccare. Ma trattarlo sempre da
numero d'ordine sarebbe stato un difetto silenzioso.

⚠️⚠️ **Il numero in testa comanda SOLO sulle righe che un ordine ce l'hanno già.**
Lì, cambiarlo **sposta** la riga e toglierlo la **stacca** (`ordineNumero: ''`,
mandato apposta: non mandarlo lascerebbe la riga attaccata a un ordine che dal
testo è appena sparito).

⚠️⚠️ **Sulle righe SENZA ordine il numero in testa resta TESTO.** È il caso che
la regola esiste per non rovinare: **«100 rose da consegnare»** comincia con tre
cifre, e trattarle da numero d'ordine farebbe **sparire la riga dentro l'ordine
#100, in silenzio**, mentre chi scriveva stava correggendo un refuso più avanti.
Quando la riga **nasce** quella scommessa si può fare — la si vede subito, ed è
il modo in cui si scrive sul quaderno; su una riga già esistente e già letta da
altri, no. **Fra due sbagli si sceglie quello che si VEDE**: chi voleva legarla e
non ci riesce se ne accorge subito, perché il numero resta scritto e il badge
dell'ordine non compare.

⚠️ E **lo dice a schermo**, sotto il campo, con due frasi diverse a seconda che
la riga un ordine ce l'abbia o no. Una regola che vive solo nel codice non è una
regola: è una sorpresa.

⚠️ La regola sta in **`correggiRiga()`** (`src/lib/diario.ts`, pura) e non dentro
il componente: è la parte che si può sbagliare in silenzio, e da lì si prova con
dei casi.

⚠️ **Vuoto non si salva**: la rotta ignora un testo vuoto, quindi la riga
tornerebbe com'era — cioè sembrerebbe che il salvataggio non abbia funzionato.
Il bottone «Salva» è spento finché il campo è vuoto. Per far sparire una riga
c'è «Cancella», che chiede conferma.

⚠️ La bozza sta in una **mappa per id**, non in una variabile sola: aprendo una
seconda riga in correzione, con una variabile sola il testo della prima sparirebbe
senza dire niente.

⚠️ CSS `.modifica-riga` con **`flex-wrap`**: la riga di un seguito è già
rientrata e porta i suoi bottoni a destra — su uno schermo stretto, senza andare
a capo, il campo si schiaccerebbe fino a non far più leggere quello che si sta
correggendo.

### Verifica

`npx tsx scripts/prova-correggi-riga.mts` — **12 prove, tutte passate**. Le due
che contano: **«100 rose da consegnare» su una riga senza ordine resta testo** (e
non diventa l'ordine #100), e su una riga con ordine **togliere il numero
restituisce `ordineNumero: ''`**, cioè la stacca davvero. Più: lo stesso numero
pulisce il testo senza spostare niente, un numero diverso sposta, il cancelletto
scritto a mano funziona uguale, e una riga fatta **solo** dal numero non resta
vuota.

`npx tsc --noEmit` esito 0, `npm run build` esito 0.

⚠️ **Quello che NON ho potuto provare**: il giro completo a schermo. La pagina
`/diario` sta dietro al login e da qui non ci si entra, quindi il salvataggio
vero — clic su «Modifica», correggo, «Salva», la riga si aggiorna — **lo deve
guardare l'utente**. Le regole sotto sono provate, il giro no.

## 26/08/2026 (16) — «/» apre il calendario dentro la riga del diario

Chiesto dall'utente, con la barra già scritta nel campo del diario: «con lo "/"
apre nella riga un calendario».

⚠️ Nel codice non c'era **niente** che rispondesse alla barra nel diario: non era
un guasto, era un gesto che non esisteva ancora. Ma la barra **è già una
convenzione di quest'app** — nell'inbox, a riquadro vuoto, apre le risposte
pronte — e le righe vere del quaderno hanno quasi tutte una data dentro
(«12562 da fare 16 luglio», «per 27 agosto, loro per la torta»), scritta a mano
ogni volta guardando un calendario da un'altra parte.

**Dove**: `src/components/CampoRigaDiario.tsx` (campo + pannello),
`src/lib/data-italiana.ts` (le regole, pure e provabili), CSS `.calendario-*`.
Montato in **tutti e tre** i campi che scrivono una riga di diario: quello
principale, quello del **seguito**, e quello dentro la **scheda dell'ordine**.

### Le decisioni

⚠️⚠️ **LA BARRA APRE SOLO DOVE È UN COMANDO**, e la regola è più stretta di
quella dell'inbox perché qui si usa **in mezzo alla riga** (la data sta in fondo,
dopo il numero e dopo la cosa da fare). `barraEComando()`: si apre solo se la
barra è a **inizio di parola** (campo vuoto o dopo uno spazio) **ed è appena
stata scritta in fondo**. Così **«27/08» non apre niente** — che è il caso che
avrebbe reso la funzione un dispetto proprio per chi le date le scrive. Nemmeno
incollare un testo che contiene una barra apre qualcosa.

⚠️ **La barra sparisce quando il comando riesce**: al suo posto va la data. Se
restasse, la riga direbbe «da fare / 27 agosto» e quella barra finirebbe nel
quaderno di tutti. Chiudendo con **Esc** invece la barra **resta**: chi voleva
davvero scrivere una barra ce l'ha.

⚠️⚠️ **Col pannello aperto, Invio NON manda la riga**: sceglie la data. Senza
questo si spedirebbe una nota che finisce con «/». (Verificato: vedi sotto.)

⚠️ **La data si scrive come la scrive una persona**: «16 luglio», «2 settembre»
— niente zeri davanti — e **l'anno solo se non è quello corrente**. A gennaio,
«27 dicembre» senza anno sarebbe letto come fra undici mesi invece che un mese fa.

⚠️⚠️ **Le scorciatoie scrivono la DATA, non la parola.** «Oggi» inserisce «26
agosto», non «oggi»: una riga che dice «chiamare domani» la si rilegge fra tre
giorni e vuol dire un altro giorno — la parola invecchia, la data no.

⚠️ **Il giorno di partenza si decide APRENDO**, non nel primo disegno: `new
Date()` durante il render girerebbe anche sul server (Francoforte, UTC) e alle 23
di Roma sarebbe un altro giorno, con React che si lamenta della differenza.

⚠️ Tastiera: **↑↓←→** muovono il giorno (non il cursore nel testo), **Invio**
sceglie, **Esc** chiude. Un piedino nel pannello lo ricorda.

⚠️ **Design system**: aggiunto prima come componente «Scelta data — il «/» dentro
un campo» (**versione 1.2**), poi usato qui.

### Verifica

**`npx tsx scripts/prova-data-italiana.mts` — 24 prove, tutte passate.** Le due
che contano: «27/» **non** è un comando, e «16 luglio» si scrive senza anno
mentre «5 gennaio 2027» ce l'ha. Più il calendario: agosto 2026 comincia con 5
caselle vuote (il 1° è sabato), febbraio 2028 ne ha 29, la **domenica sta in
fondo** e non in testa.

**Provato a mano nel browser** su una pagina d'anteprima temporanea (ora
cancellata), digitando con tasti veri:
- «chiamare il fornitore » + «/» → il pannello si apre, 268×345, sotto il campo,
  mese «agosto 2026», oggi = 26;
- **↓** porta al 3 e la testata passa a **«settembre 2026»** (il salto di mese
  funziona), **Invio** scrive **«12562 da fare 3 settembre »** e chiude;
- ⚠️ e in quel momento la riga **non è stata mandata**: Invio se l'è preso il
  calendario, come deve;
- **«27/08»** digitato di seguito: il pannello **non si apre**;
- **Esc** chiude e lascia la barra; **Invio** a pannello chiuso manda la riga;
- clic su un giorno → «per 15 agosto »; **«Oggi»** → «26 agosto »; **clic fuori**
  chiude.

⚠️ **Onestà sul metodo**: a metà prova il pannello del browser ha smesso di
consegnare i tasti (non è un difetto dell'app — gli stessi tasti avevano appena
funzionato). Gli ultimi rami — Esc, clic sul giorno, «Oggi», clic fuori — sono
stati provati facendo partire **eventi veri sugli stessi handler** dalla console,
non manipolando lo stato di React.

`npx tsc --noEmit` esito 0, `npm run build` esito 0.

## 26/08/2026 (15) — l'ordine gestito si porta dietro le sue note del diario

Chiesto dall'utente: «quando un ordine viene messo come gestito chiudi le note
associate».

⚠️⚠️ Il diario è **la lista di quello che resta da fare**. Una riga che parla di
un ordine finito non resta da fare, ma finora restava lì, mescolata a quelle
vere: due o tre righe così e l'elenco si smette di leggere — che è il modo in cui
una nota importante passa inosservata.

**Adesso**, premendo «Gestito» (dalla bacheca o dalla scheda), tutte le note
**ancora aperte** di quell'ordine si chiudono, con il **nome di chi ha premuto**
e la data. La funzione è `chiudiNoteDellOrdine()` in
`src/lib/diario-chiusura.ts`.

⚠️ **Sta in un file suo e non in `src/lib/diario.ts`**: quello è fatto di
funzioni pure e deve poter essere importato ovunque. Bastava aggiungerci `db` per
tirarsi dietro il client Prisma in un bundle del browser, con un errore che parla
di webpack e non nomina mai la causa.

⚠️ **Tutte e due le forme del numero** (`2799` e `#2799`): in tabella stanno col
cancelletto, a mano si scrivono senza. Cercandone una sola non si chiuderebbe
niente **senza dare errore**.

⚠️ **Il `fatta: false` sta nel `where` della SCRITTURA**, non in una lettura
fatta prima: fra le due query lo stato può cambiare, e riscrivere
`fattaIl`/`fattaDaNome` su una nota che qualcuno ha appena chiuso cancellerebbe
il suo nome dal registro. (Stessa lezione della sezione 13.)

⚠️⚠️ **NON ESISTE IL CONTRARIO, ED È VOLUTO.** Riaprendo un ordine le note **non
si riaprono**: potrebbero essere state fatte davvero, e riaprirle vorrebbe dire
rimettere in lista cose finite — cioè disfare con un automatismo la spunta di una
persona. Si riapre a mano dal diario, dove il bottone c'è.

⚠️ **Lo dice.** La bacheca scrive «Chiuse N note del diario di quest'ordine», la
scheda lo scrive **sopra l'elenco delle note** e **rilegge l'elenco**
(`DiarioOrdine` ha una prop `rileggiA`): senza, si spuntava «Gestito», le note
erano chiuse nel database e a schermo continuavano a risultare da fare — una
schermata che mostra il contrario di quello che è appena successo fa premere il
bottone una seconda volta. E righe che spariscono senza lasciare un numero fanno
credere di essersi perse.

⚠️ **Non l'ho agganciato al cron dei rimborsi** (`sincronizza.ts`, che mette
`gestito` sugli ordini rimborsati). Lì «gestito» lo decide l'app, non una
persona, e una nota tipo «richiamare il cliente per il rimborso» verrebbe chiusa
**proprio nel momento in cui serve**. Se lo si vuole, è una riga — ma va deciso,
non dedotto.

### Il già scritto: 2 note su ordini già gestiti, e solo UNA andava chiusa

`scripts/chiudi-note-ordini-gestiti.mjs` (senza argomenti = prova, `--scrivi`
applica). Misurato: **26 note aperte con un ordine**, di cui **2 su ordini già
gestiti**.

⚠️⚠️ **Ma non erano lo stesso caso, e la differenza è la DATA.**
- **#1807** — nota del 25/08, ordine gestito il **26/08**: è esattamente quello
  che il codice nuovo avrebbe chiuso. **Chiusa.**
- **#1741** — nota del 25/08, ordine gestito il **5/08**: la nota è stata scritta
  **venti giorni DOPO** la chiusura dell'ordine. Non è un residuo del codice
  vecchio: è qualcuno che ha voluto lasciare una cosa da fare su un ordine già
  chiuso. Chiuderla sarebbe stato cancellare la decisione di una persona
  spacciandola per una correzione. **Lasciata aperta.** (⚠️ E #1741 è anche uno
  dei due chargeback in scadenza il 4/09.)

Lo script porta dentro questa regola: chiude **solo** le note scritte **prima**
di `gestioneIl`, e stampa in chiaro quelle che lascia aperte e perché. Se
`gestioneIl` manca, non indovina: lascia stare.

### Verifica

`npx tsx scripts/prova-chiusura-note.mts` — 9 prove sul database vero con righe
finte su un ordine inesistente (#999999), cancellate per ID alla fine. Tutte
passate, comprese quelle che contano:
- chiude sia `#999999` sia `999999`;
- una nota **già fatta non viene riscritta** (nome e data di chi l'aveva chiusa
  restano suoi);
- una nota di un **altro** ordine resta aperta;
- rilanciandola non chiude niente;
- ⚠️ **con numero vuoto non tocca NIENTE** — sarebbe stata la peggiore: avrebbe
  chiuso in un colpo tutte le note senza ordine.

`npx tsc --noEmit` esito 0, `npm run build` esito 0.

## 26/08/2026 (14) — i riquadri in basso a destra: l'app dice cosa sta succedendo

Chiesto dall'utente: «genera un pop-up in basso a destra ogni volta che viene
compiuta un'azione — esempio nuovo messaggio in inbox, nuovo ordine, ordine
pagato — in modo tale che l'utente si accorga di ciò che succede nell'app».

⚠️⚠️ Il problema vero: **quasi tutto quello che succede qui lo fa qualcun
altro** — un cliente che scrive, Shopify che manda un ordine, un collega che
paga un fornitore — e finché non si andava sulla pagina giusta non lo sapeva
nessuno. Le pagine sono venti.

**Otto tipi**, tutti con un dot del colore del tipo, il titolo, una riga di
dettaglio e l'ora: **messaggio** in arrivo · **nuovo ordine** · **fornitore
pagato** · **reclamo** · **rimborso chiesto** · **contestazione** ·
**preventivo** · **chiamata**. Il riquadro è cliccabile e porta alla cosa
(`/inbox?c=…`, `/ordini?apri=…`, `/pagamenti?richiesta=…`).

### Le decisioni che contano

⚠️⚠️ **NON C'È UNA TABELLA DEGLI EVENTI, ED È VOLUTO.** Le novità si **ricavano
dai fatti già scritti** (`Messaggio.creatoIl`, `Ordine.creatoIl`,
`RichiestaPagamento.pagataIl`…). Una tabella-copia sarebbe un secondo racconto
della stessa cosa, che può divergere da quello vero, e andrebbe scritta in ogni
punto del codice dove succede qualcosa — cioè in un punto che prima o poi
qualcuno dimentica. Così invece **una novità non può esistere senza il fatto**.
(Standard §7: ogni dato ha una casa sola.)
⚠️ Il prezzo, detto: si vedono solo gli eventi che **lasciano una data su una
riga**. «Il cliente ha pagato» non c'è, perché il passaggio di `statoPagamento`
non lascia un timestamp suo — quello che si vede è l'ordine che **arriva**, che
nella pratica è lo stesso momento. **«Ordine pagato» qui vuol dire pagato il
FORNITORE**, e il riquadro lo scrive per esteso.

⚠️⚠️ **IL SEGNAPOSTO È L'OROLOGIO DEL DATABASE** (`select now()`), restituito
nella risposta e rimandato indietro alla chiamata dopo. Con `Date.now()` del
browser, un computer avanti di un minuto **salterebbe** le novità di quel minuto
e uno indietro **le ripeterebbe per sempre**. La finestra è chiusa in cima
(`gt: da, lte: adesso`) con `adesso` letto **prima** delle query: una riga
scritta mentre girano non si perde e non si ripete.

⚠️⚠️ **LA PRIMA CHIAMATA NON MOSTRA NIENTE**, prende solo il segnaposto. Sparare
le novità delle ultime ore a ogni ricarica insegna in due giorni che quei
riquadri non vogliono dire niente.

⚠️ **Le tre regole che li rendono sopportabili**: massimo **3** a schermo (2 sul
telefono) e oltre **uno solo che li conta** («7 novità: 5 messaggi, 2 ordini»);
**«Silenzia per un'ora»** (e mentre è in pausa resta una pillola che lo dice e li
riaccende — un interruttore che scompare non lo ritrova nessuno); **niente
passato**.

⚠️ **Non doppia gli avvisi che c'erano già.** L'inbox ha già suono + notifica di
sistema (`Inbox.tsx`, `avvisa()`) che partono **solo a scheda nascosta**. Questi
fanno l'opposto: **si fermano** a scheda nascosta e parlano quando è davanti. E
**sulla pagina dell'inbox i messaggi non li ripetono affatto** — lì la
conversazione sale in cima da sola.

⚠️ **Le cose fatte da te non te le racconta**: i pagamenti segnati da te e i
rimborsi chiesti da te sono filtrati per nome. Verificato sui dati veri: «io 0 ·
altri 2».

⚠️ **Design system**: il componente è stato aggiunto prima al design system
(**versione 1.1**, sezione «Avvisi (toast)») e poi usato qui, come vuole la
regola.

⚠️ Il modulo si chiama **`src/lib/novita.ts`, non `avvisi.ts`**: quel nome era
già preso da un'altra cosa — la regola di CHI avvisare per i messaggi in inbox —
e due moduli omonimi con due tipi `Avviso` diversi sono un import sbagliato che
aspetta il momento. (Ci sono cascato: l'ho sovrascritto e ripreso da git.)

### 🩸 Il difetto trovato provando, non leggendo

⚠️⚠️ **SENZA SESSIONE LA ROTTA NON RISPONDE 401.** Provato sul server vero:
`/api/novita` senza cookie risponde **307 verso `/login`**, perché il middleware
la intercetta prima che la rotta esista. `fetch` segue il redirect da solo, e
quello che torna è **la pagina di login: HTML, stato 200**. Cioè `res.ok` è
**vero**, `res.json()` esplode, il `catch` se lo mangia — e il ciclo avrebbe
continuato a bussare a una porta chiusa **ogni 25 secondi, per sempre**, senza
che nessuno se ne accorgesse. Il controllo `res.status === 401` che avevo scritto
**non sarebbe mai scattato**.
Ora si guardano le tre cose che lo dicono davvero: `res.redirected`, il
`content-type`, e il 401 (che resta giusto se un giorno la rotta uscisse dal
middleware). **Misurato in pagina**: `{status: 200, ok: true, redirected: true,
urlFinale: "/login", contentType: "text/html", siFerma: true}`.

### Come è stato verificato

- `npx tsx scripts/prova-novita.mts 24` — la libreria sui **dati veri**: 9 prove,
  tutte passate (ordinamento, id unici, link, niente fuori dalla finestra, **il
  giro dopo non ripete niente**, i pagamenti miei non li vedo io). Nelle ultime
  24 ore: **10 messaggi + 10 ordini**, troncato.
- **Misure nel browser** su una pagina d'anteprima temporanea (ora cancellata),
  con i dati veri: a 1280×720 la pila sta a **16px** dai bordi, riquadri
  **360×64** con 8px di distanza, la pillola del silenzio ancorata in basso;
  a **375×812** i riquadri sono **351px** con margini 12 e **nessuno scorrimento
  orizzontale**. `z-index 55`: sopra la pagina, sotto veli e finestre.
- ⚠️ **Niente schermata**: il pannello del browser non era a schermo, quindi non
  compone fotogrammi — le prove sono misure del DOM, non un'immagine. E per lo
  stesso motivo il componente non chiedeva niente durante la prova: `document.hidden`
  era **true**, cioè si stava comportando come deve.

Verifica: `npx tsc --noEmit` esito 0, `npm run build` esito 0.

## 26/08/2026 (13) — due pagamenti sullo stesso ordine (con la domanda), e i buchi trovati da una revisione ostile

### La richiesta dell'utente

«Consenti di emettere due pagamenti sullo stesso ordine ma chiedi prima conferma
che si voglia fare, e mantieni l'alert attivo anche in pagamenti.»

Stamattina il bottone «Paga fornitore» era stato **spento** quando una richiesta
era già aperta. ⚠️⚠️ **Il divieto secco vietava anche il caso vero**: due
fornitori sullo stesso ordine (i fiori e la torta), o un acconto e un saldo. E
per aggirarlo bisognava segnare **«pagata» una richiesta che pagata non era**,
pur di sbloccare un bottone — cioè scrivere il falso sul registro dei soldi
usciti. **Un divieto che si aggira falsificando un dato è peggio del doppione che
voleva impedire.**

Adesso: bottone **acceso col segno ⚠️** → modulo Pagamenti con il **riquadro in
cima** (quale richiesta c'è, per chi, di quanto, di che giorno, e il bottone per
aprirla) → al salvataggio la **domanda** «Sì, è un secondo pagamento: falla» /
«No, apri quella che c'è» / «Annulla».

⚠️ **La serratura resta sul server**: senza `confermaDoppio` la rotta risponde
**409** con `doppioPossibile: true`. Un doppio invio o un ritorno indietro del
browser non hanno letto nessun avviso e non passano.
⚠️ **Non un `confirm()` del browser**: quello non può dire PER CHI e DI QUANTO è
la richiesta che c'è già, e una conferma che non dice cosa si conferma la si
preme e basta.
⚠️ L'avviso in Pagamenti è **vivo**: si accende anche scrivendo il numero a mano,
e **non** mentre si corregge quella stessa riga (si avviserebbe di sé stessa).

### Quello che ha trovato la revisione ostile (e che è stato corretto)

Due agenti ostili hanno riletto il lavoro della sezione (12). Tre difetti veri:

⚠️⚠️ **1. Il filtro di stato c'era nella LETTURA e non nella SCRITTURA.** La
`findMany` filtrava per `gestione`, la `updateMany` scriveva per solo `id`. Fra
le due passano due query, e in quel momento lo stato può cambiare: il cron della
piattaforma gira **ogni 15 minuti**, quello degli ordini **quattro volte l'ora** e
può scrivere `gestito` sui rimborsati, e un collega può premere «Gestito» dalla
bacheca. Con il solo `id` nel `where`, quella riga **riapriva un ordine appena
chiuso da una persona** — esattamente l'invariante che la regola dichiara di
proteggere. Il filtro ora sta in tutti e due i punti, e il push a Orders parte
**solo se `updateMany` ha davvero toccato qualcosa** (`spostati.count > 0`):
mandare a Orders uno stato che qui non è stato scritto sarebbe peggio del
silenzio.

⚠️⚠️ **2. Il salto era muto.** Il ramo «numero ambiguo» era vuoto: nessun log,
nessun campo, nessun messaggio. E la pagina, dopo «Pagata», non nominava mai lo
stato dell'ordine. Chi premeva non poteva distinguere **«spostato»** da **«non
l'ho toccato»**. Ora la rotta torna `ordine: { stato, orders }` e il bottone
«Allinea lo stato» della Riconciliazione **non dice più «stato allineato» e
basta**: se Orders non l'ha preso, lo scrive.

⚠️⚠️ **3. L'uscita di sicurezza indicata dal commento non esisteva.** Il codice
diceva «si lascia il lavoro a una persona, che ha il bottone Allinea lo stato»,
ma quel bottone accettava solo `STATI_IMPOSSIBILI_SE_PAGATO` (tre stati): su un
ordine fermo in **`in_pagamento`** rispondeva **«Lo stato è già coerente col
pagamento»** con status 400 — che è falso — e nell'elenco non compariva nemmeno
(`statoDaAllineare`). Numero ambiguo + `in_pagamento` = **nessuna strada, né
automatica né manuale**. Ora tutti e due usano `STATI_DA_SPOSTARE_SE_PAGATO`.

### 🔴 Quello che la revisione ha trovato e NON è stato corretto

Sono punti aperti veri, non rumore. In ordine di gravità:

1. 🔴 **Il cron della piattaforma può riscrivere `attesa_consegna` → `in_app` e
   non lo dice a Orders.** `sync-piattaforma.ts` non chiama mai
   `comunicaStatoAOrders`; nemmeno `sincronizza.ts` quando scrive `gestito` sui
   rimborsati. La divergenza CS↔Orders ha ancora **due porte**, e una si apre da
   sola **quattro volte l'ora**.
2. 🔴 **`maxDuration = 60` contro una catena più lunga.** Lo spostamento aggiunge
   fino a **27 s** seriali di HTTP davanti a riconciliazione, avviso e registro
   fornitori — e le due fetch di `registro-fornitori.ts` **non hanno timeout**.
   Se si supera il minuto, `avvisoIl/avvisoCanale/avvisoEsito` non vengono
   scritti e un secondo clic su «Pagata» **rimanda l'avviso al fornitore**.
3. ⚠️ **Il bottone «Allinea lo stato» sceglie a caso su un numero ambiguo**:
   `findFirst` **senza `orderBy`** nella rotta, e nell'elenco una `Map` in cui
   **l'ultimo vince** — due tiri a caso con criteri diversi, quindi la schermata
   può mostrare l'ordine A e il bottone aggiornare il B.
4. ⚠️ **`gestioneDaId` ha smesso di voler dire «una persona»**: lo scrive anche
   l'automatismo, e `sincronizza.ts` lo usa come «nessuno l'ha mai toccato a
   mano». `daQuandoSiMisura` (KPI operatori) ora può essere datato da un
   automatismo.
5. ⚠️ **Due normalizzazioni del numero nella stessa funzione**: lo spostamento a
   `attesa_consegna` prova `2799` e `#2799`, quello a `in_pagamento`
   (`POST /api/pagamenti`) fa un confronto **esatto**. Una delle due smetterà di
   trovare l'ordine senza dirlo.
6. ⚠️ **Togliere il segno «pagata» non disfa la riconciliazione**: restano
   `fornitoreNome`/`fornitoreCosto` sull'ordine e Orders non viene informato. Un
   ordine può restare «attesa consegna, fornitore X, costo Y» senza più nessun
   pagamento dietro. (Pre-esistente.)

### 🔴 E i numeri che la seconda revisione ha contato sul database

- **La sezione `MANCA` è invecchiata di nuovo** (è la quarta volta). Dice 1.356
  ordini / 505 da gestire / 17 richieste di pagamento / 5 reclami / 3 note di
  diario / 4 utenti con `diagnostica@` ancora presente. **Veri stasera**: 1.371 /
  **99** / **22** / **6** / **29** / **3 utenti, diagnostica cancellato**.
- ⚠️⚠️ **La riga più pericolosa**: «`partnerApiKey` e `partnerUrl` vuoti … *oggi
  la tabella è comunque a 0 richieste*». **Falsa di 22 righe e 1.938 € segnati
  come già pagati**, con `inviataIl = null` su tutte. È la frase che declassa il
  buco a innocuo, e lo fa con un numero sbagliato di 22.
- ⚠️ E la causa citata è sbagliata: `partnerUrl` **non blocca niente** (in
  `src/lib/partner.ts` c'è un `BASE_DEFAULT`). Il gate vero è **`partnerApiKey`,
  che non esiste proprio come riga** in `Impostazione`.
- ⚠️⚠️ **I 417 ordini chiusi in blocco non sono scritti da nessuna parte.**
  `scripts/segna-gestiti-da-piattaforma.mjs` ha portato **417** ordini da
  `da_gestire` a `gestito` (backup in `scripts/backup-segna-gestiti-2026-08-26.json`).
  È il salto **505 → 99**, il numero più vistoso del documento, e `grep "417"` su
  questo file dava **zero occorrenze**. Chi legge «99 da gestire» crede che il CS
  sia in pari: di quei 99, **74 non hanno data di consegna** e **9 ce l'hanno già
  passata**.
- ⚠️ **Errore di fatto nella sezione (4)**: «#1798 (370 €)». Sul database **#1798
  = 170 €**; 370 è la **somma** di #1798 e #1777. Il conto sotto è giusto,
  l'etichetta no — e `schema.prisma` scrive la cifra corretta: documento e codice
  si contraddicono nello stesso repo.
- ⚠️ **Il caso che ha fatto nascere l'unione ordini non è stato unito**:
  `unitoA ≠ ''` = **0**. #1777 è ancora `in_pagamento` con una richiesta da 253 €
  mai inviata, #1798 ancora `da_gestire` e senza fornitore. Il margine falso in
  negativo (−43,44 €) è ancora lì.
- ⚠️ **`aiFuoriTurnoAttivo` è VUOTA (spenta)** e i turni coprono **21 ore su
  168, tutte di Federica**: 147 ore a settimana senza turno e senza il tampone
  dell'AI, mentre il cron `ai-fuori-turno` gira ogni 10 minuti a vuoto. `MANCA`
  elenca le chiavi vuote e **non cita `aiFuoriTurnoAttivo`**.
- ⚠️ **`gestioneDaNome` ha sei grafie per tre persone** («Federica Zicchinella»
  265 / «Federica ZIcchinella» 103, «Riccardo Cuccurello» 18 / «riccardo
  cuccurullo» 119, «Nicolo Daniele Donato» 58 / «Admin Donato» 33). Le KPI si
  salvano perché raggruppano per `fornitoreDaId`: qualunque conteggio futuro
  fatto sul **nome** spaccherà ogni operatore in due.
- ⚠️ **La KPI «margine per operatore» poggia su 16 ordini** (21 con
  `fornitoreDaId` meno 5 automatici). Tre ordini bastano a ribaltare la classifica.
- ⚠️ **920 ordini su 1.371 hanno `ordersId` vuoto**: per due terzi del registro
  il ponte verso Orders non esiste. E `gestione = in_app` è a **0**: nessuna
  chiave `piattaforma*` in `Impostazione`, quindi il cron `/api/cron/piattaforma`
  gira **96 volte al giorno a vuoto**.
- ⚠️ **32 proposte di glossario aperte** su 50, le più vecchie ferme dal 23/08.
- ⚠️ Correzione a un numero della sezione (12): l'ultimo giro di sync era
  **16:35:31 UTC** con «**0 nuovi**», non 16:20 con «1 nuovi».

Verifica: `npx tsc --noEmit` esito 0, `npm run build` esito 0.

## 26/08/2026 (12) — pagato = «attesa consegna», da solo (e i 5 rimasti indietro)

Chiesto dall'utente su un ordine vero, **#2799** (Mya Mouzon, 250 €): «se è
pagato in automatico metti in attesa di consegna». Sulla scheda si vedeva il
bollino verde **pagato** e, accanto, lo stato **«Comunicazione con cliente»**.

**Perché succedeva.** L'automatismo del 24/08 spostava l'ordine **solo** da
`in_pagamento`. Ma `comunicazione` **l'app se lo scrive da sola** quando qualcuno
preme WhatsApp, Email o Chiama: bastava una telefonata al cliente dopo aver
chiesto il pagamento perché lo stato uscisse da `in_pagamento` e il pagamento non
spostasse più niente. #2799 è esattamente questo: pagato il 25/08 alle 13:48,
ancora «Comunicazione con cliente» il 26.

**Adesso** si sposta da tutti e quattro gli stati indietro — da iniziare, ricerca
fornitore, in pagamento, comunicazione — elencati in
`STATI_DA_SPOSTARE_SE_PAGATO` (`src/lib/riconciliazione.ts`), accanto ai già
esistenti `STATI_IMPOSSIBILI_SE_PAGATO` che usa il bottone a mano della
Riconciliazione.

⚠️ **Tre stati restano fermi, di proposito:**
- `attesa_consegna` è la destinazione;
- `gestito` è la **fine**: un automatismo non riapre un ordine che una persona ha
  chiuso;
- `in_app` **non dice a che punto siamo, dice CHI se ne sta occupando** (la
  piattaforma consegne, che l'ha proposto a un partner). Scriverci sopra «attesa
  consegna» toglierebbe dalla bacheca l'unico segnale che dice «non cercare un
  fornitore a mano» — e la sincronizzazione lo rimetterebbe `in_app` al giro
  dopo: un'altalena che non aggiunge niente.

⚠️ Lo spostamento scrive anche **`gestioneDaNome`**: l'etichetta dice «segnato da
…», e lasciare il nome di chi aveva messo lo stato di prima con la data di adesso
racconta una cosa mai successa.

⚠️ Il confronto sul numero adesso prova **entrambe le forme** (`2799` e `#2799`):
oggi le richieste di pagamento lo salvano tutte col cancelletto — **verificato: 20
su 20** — ma un confronto esatto che smette di trovare l'ordine non lo direbbe a
nessuno.

⚠️⚠️ **CORREGGERE IL CODICE NON CORREGGE QUELLO CHE IL CODICE VECCHIO HA GIÀ
SCRITTO.** Misurati sul database: **20 richieste pagate**, e **5 ordini rimasti
indietro** — #2778, #2780, #2783 (in pagamento), #2785 (da iniziare), #2799
(comunicazione), tutti FLowers. Allineati una volta sola con
`scripts/allinea-pagati-attesa-consegna.mjs --scrivi` (senza `--scrivi` dice solo
cosa farebbe), attribuendo lo spostamento a **chi aveva pagato**. Ricontato dopo:
**20 pagati = 11 attesa consegna + 9 gestito, zero fermi prima**.

⚠️ Perché 4 dei 5 erano del 24/08: l'automatismo è nato quel giorno
(`308b7c97`) e quei pagamenti erano stati segnati **prima** del rilascio. Non era
rotto, era **troppo stretto**.

⚠️⚠️ **E LO SA ANCHE ORDERS.** Il buco che l'handoff del 24/08 lasciava aperto
(«resta da agganciare il push alle transizioni AUTOMATICHE») era proprio questo:
lo stato cambiato da solo restava **dentro casa nostra**, e in Deluxy Orders
l'ordine continuava a risultare «in pagamento» finché qualcuno non lo toccava a
mano. Un automatismo che aggiorna una schermata sola è peggio di nessun
automatismo: due app dicono due cose e nessuno sa quale vale. Adesso
`comunicaStatoAOrders` parte **sia** dallo spostamento automatico dei Pagamenti
**sia** dal bottone «Allinea lo stato» della Riconciliazione, che pure scriveva
solo qui.

⚠️ Anche i **5 già allineati** l'hanno detto a Orders, con
`npx tsx scripts/allinea-orders-attesa-consegna.mts`: **5 OK su 5** (26/08).

⚠️⚠️ **IL NUMERO NON È UN'IDENTITÀ, e qui è l'unica cosa che abbiamo.** La
`RichiestaPagamento` porta `ordineNumero` e basta: non il negozio, non l'id. Se
quel numero appartiene a **più di un ordine** adesso non si sposta **niente** —
spostarli entrambi direbbe il falso su uno, sceglierne uno sarebbe indovinare — e
il lavoro resta a una persona col bottone della Riconciliazione. **Contati il
26/08 su 1.371 ordini e 3 negozi: ZERO numeri ripetuti.** Ma non è teoria: in
Orders, che di negozi ne ha **quattro** da ieri, `#2799` **esiste già su più di
uno** (l'API risponde «esiste su più negozi: non so quale mostrare»). Il giorno
che business.deluxy.it entra anche qui, la guardia serve.

Verifica: `npx tsc --noEmit` esito 0, `npm run build` esito 0.

## 26/08/2026 (11) — Bozze: «Tutte» di partenza, e dopo 7 giorni si annullano

Due richieste dell'utente sulla sezione appena messa in cima a «Nuovo ordine».

**1. «Default metti tutte.»** La vista di partenza era «Da incassare», e nei
giorni buoni — cioè quasi sempre — mostrava una lista vuota: la sezione sembrava
rotta invece che a posto. Ora apre su **Tutte**.

**2. «Dopo 7 giorni annulla le bozze e portale in uno stato annullate che non
compare in tutte.»** Fatto, con un cron giornaliero (`/api/cron/bozze`, 04:35).

⚠️⚠️ **QUESTO PEZZO CANCELLA PER DAVVERO, E FUORI DA CASA NOSTRA**: la bozza
sparisce da Shopify e il link smette di funzionare. Le guardie, tutte necessarie:

- si toccano **solo** le bozze create da qui col link di pagamento (`OrdineCreato`
  con `bozzaId`), mai altre;
- **solo** quelle più vecchie del limite;
- **solo dopo aver chiesto a Shopify** come stanno. Una bozza **pagata non si
  cancella mai** — a quel punto è un ordine, e cancellarla sarebbe cancellare una
  vendita. Se nel frattempo è stata pagata si registra il numero dell'ordine e si
  lascia stare;
- se Shopify **non risponde non si annulla niente**: «non lo so» non è «scaduta»;
- se la cancellazione **fallisce**, la riga NON si segna annullata — resterebbe in
  giro un link pagabile che qui risulta chiuso;
- se la bozza **non c'è più** su Shopify (cancellata a mano) si chiude la riga
  senza cancellare niente: altrimenti resta a chiedere per sempre lo stato di una
  cosa che non esiste.

⚠️ **Il limite sta in Impostazioni** (`giorniBozzaScaduta`, campo nuovo in fondo
alla pagina, vuoto = 7): è una regola commerciale — per quanto tiene il prezzo —
e cambiarla non deve richiedere un rilascio.

⚠️ **Le annullate non spariscono, escono dagli elenchi di lavoro**: non stanno in
«Tutte» (come chiesto), hanno un filtro loro **«Annullate (n)»** e il numero
compare nel riassunto in testa. Cancellare la riga vorrebbe dire perdere chi
aveva mandato quel link, a chi e per quanto — cioè la sola traccia che quel
preventivo sia mai esistito. E una fila che sparisce senza lasciare un numero fa
credere che non sia mai esistita: nessuno si accorgerebbe se il cron ne stesse
chiudendo troppe.

**Misurato prima di accendere**: candidate all'annullamento **adesso: ZERO** (le
due bozze in tabella sono una pagata — #D5636 → ordine #12819 — e una del 24/08
che su Shopify non c'è già più). Quindi il primo giro non cancella niente.

⚠️ Trappola incontrata: due chiavi `NOT` nello stesso `where` di Prisma — la
seconda **sovrascrive la prima** e il filtro sparisce in silenzio. Il typecheck
lo ha visto (TS2783), ma solo perché erano nello stesso oggetto letterale: la
forma giusta è `campo: { not: … }`.

## 26/08/2026 (10) — PREVENTIVI e BOZZE: la parte di prima e la parte di dopo

Due richieste dell'utente, e sono i due lati dello stesso momento — quando un
ordine **può nascere o non nascere**.

### Preventivi (`/preventivi`, in «Ordini», primo del gruppo)

«Crea una sezione preventivi dove sono indicati tutti i preventivi che vengono
richiesti per brand, simile a ordini aperti.»

A colonne per marchio, come la bacheca. Ogni scheda: cliente, **la richiesta con
le parole sue**, città e data volute, stato, da quanti giorni è ferma.

⚠️⚠️ **Un preventivo non ha una data di consegna che lo renda urgente**: la sua
urgenza è **da quanto aspetta**. I più vecchi stanno in cima e oltre i 3 giorni
l'attesa si colora — ordinandoli per «ultimo arrivato», come si fa con la posta,
si seppelliscono proprio quelli che stanno marcendo. Chi chiede un prezzo e non
riceve risposta non lascia traccia: non è un ordine perso, è **un ordine mai
contato**.

Il giro: `da_fare` → «Prepara il prezzo» (importo, descrizione, giorni di
validità) → crea la **bozza Shopify col link** (stessa strada di «Nuovo ordine»,
`pagamento: 'link'`) → `inviato` → `accettato | rifiutato | scaduto`.

⚠️ **Non è un registro ordini**: l'ordine nasce su Shopify e vive in Orders.
Quando il cliente paga arriva in bacheca dal giro normale e il preventivo si
**chiude** — non diventa lui l'ordine.
⚠️ Il **marchio serve** per mandare: la bozza nasce dentro un negozio Shopify.
Una richiesta può però arrivare **senza marchio** («quanto costa una torta per
30 persone» a una casella che serve tutti): resta in «Senza marchio» e lo si
sceglie dalla scheda.
⚠️ Il link **non parte da solo**: un prezzo si accompagna.
⚠️ **Validità in giorni** (7 di default): un prezzo senza scadenza diventa un
impegno eterno — il cliente ripesca il link di marzo a novembre.
⚠️ In KPI il «valore in attesa» conta **solo gli inviati**: sommare quelli da
preparare, che non hanno prezzo, vorrebbe dire contare zero come se fosse un dato.

⚠️ Da non confondere con `QuoteRequest` della **piattaforma consegne**: quelle
sono richieste di preventivo dei **partner** dal loro accesso. Queste sono i
clienti.

### Bozze (in cima a `/nuovo-ordine`, sopra il modulo)

«Metti una sezione Bozze in Nuovo Ordine dove poter vedere lo stato delle bozze
inviate (se sono state pagate e tramutate in ordine oppure no).»

⚠️⚠️ **Lo stato non è nostro**: la bozza vive su Shopify, e l'unico che sa se è
stata pagata è Shopify. Si **chiede** a ogni apertura (`draftOrder → status,
order { name }, invoiceUrl`), negozio per negozio. L'unica cosa che si scrive è
il **numero dell'ordine** nato dalla bozza, e solo perché quel fatto non torna
più indietro.

⚠️⚠️ **«Non lo so» non diventa «non pagata»**: se Shopify non risponde per un
negozio, quelle bozze escono come **«stato non disponibile»** e la pagina lo
scrive in rosso in cima. Dedurre lo stato dal silenzio è il modo di richiamare un
cliente che ha già pagato. Stessa cosa per una bozza **cancellata** su Shopify:
«non c'è più», che è diverso da «aperta».

**Misurato**: in tabella ci sono **2 bozze** create da qui, tutte e due col link
e **senza ordine** — #D5636 (140 €, oggi, Nicolò) e #D5627 (1,22 €, 24/08, CRM).
⚠️ **La chiamata a Shopify NON è stata provata da qui**: la rotta sta dietro al
login e uno script che manda client id e secret a Shopify è bloccato dal
classificatore. La prova è aprire la pagina: se lo stato appare, funziona; se
appare l'avviso rosso, il token di quel negozio non c'è.

⚠️⚠️ La sezione sta **in cima alla pagina, sopra il modulo** (corretto lo stesso
giorno su segnalazione dell'utente: messa sotto non la vedeva nessuno — il modulo
è lungo una schermata e mezza, e ci si arriva solo dopo aver fatto l'ordine,
quando la domanda «quel link l'hanno pagato?» non se la fa più nessuno).

⚠️ Ma sopra il modulo **ogni riga pesa**: riquadro compatto, elenco con un
**tetto d'altezza** (320px, 190 sul telefono) e una riga sola quando non c'è
niente in sospeso. **Misurato a 375×812**: senza il tetto il riquadro era alto
**447px** e il modulo cominciava a **y=539** — cioè il problema che la sezione
doveva risolvere, spostato di un posto. Col tetto: **314px** e **y=406**.

⚠️⚠️ **Trappola già vista, ricascata**: `PreventiviLista` (client) importava
`nomeStato` da `preventivi.ts`, che importa `nuovo-ordine.ts` → `crypto.ts` →
`node:crypto`: **build fallita** con un errore che parla di webpack e non nomina
mai la causa. Rimedio identico a `piattaforma-stati.ts`: gli stati stanno in
`preventivi-stati.ts`, che nel browser ci può stare.

## 26/08/2026 (9) — dal telefono: la pagina cominciava a y=712

Chiesto dall'utente: «da mobile sistema la ux&ui».

**Misurato** su 375×812 (schermo di un iPhone), pagina Chiamate — ma la barra, la
testata e i contatori sono gli stessi su una dozzina di pagine:

| | prima | dopo |
|---|---|---|
| barra in alto | 81 px | **56 px** |
| testata (titolo + sottotitolo) | 205 px | 156 px |
| contatori | 302 px | **76 px** |
| **prima riga di lavoro a** | **y = 712** | **y = 396** |
| altezza di una chiamata | 199 px | 140 px |
| pagina intera | 1585 px | 1051 px |

⚠️⚠️ **y=712 su uno schermo alto 812**: si apriva la pagina e non si vedeva
niente di quello per cui la si era aperta. Si scorreva uno schermo intero di
spiegazioni e riquadri prima del primo dato.

**Cosa è cambiato, e perché così:**

- **I contatori diventano una striscia che scorre di lato** (una riga invece di
  tre). ⚠️ Vanno **a filo schermo** di proposito: il riquadro tagliato sul bordo
  destro è quello che dice «continua» — senza, una striscia orizzontale sembra
  un elenco che finisce lì. Vale per tutte le pagine con `.kpi-riga`.
- **Titolo da 30 a 22px** (a 30px un titolo di due parole prendeva due righe) e
  **margini della pagina da 32/24 a 16/14**.
- ⚠️ **Il sottotitolo resta INTERO**, solo più piccolo: è la riga che dice cosa
  fa la pagina, e a chi legge per la prima volta serve tutta. Si toglie spazio al
  contorno, non al contenuto.
- **Le righe delle chiamate**: numero e ora sulla stessa riga, «Correggi numero»
  spostato dentro il pannello della notifica (è la via d'eccezione, e i suoi
  133px mandavano i bottoni a capo). Su computer restano quattro colonne, e la
  riga è **più bassa di prima** (61px).

⚠️⚠️ **UN DIFETTO VERO, non solo spazio sprecato**: il pannello del menu era
ancorato a `top: 63px`, il numero scritto a mano quando la barra era di una riga
sola. Sul telefono il logo «Deluxy Customer Service» a 19px andava a capo **tre
volte** e la barra diventava alta **81px**: il menu si apriva **18px sotto** il
suo bordo, e la prima voce spariva dietro la striscia traslucida — a chi guarda
il menu sembrava cominciare da «Inbox».

Due rimedi, e servono tutti e due: **i due numeri diventano uno**
(`--h-topbar`, usata dalla barra, dal pannello e dal `min-height` del layout —
finché erano due valori scritti a mano in due punti del foglio potevano
divergere, e sono divergiti); e sul telefono **la barra sta su una riga sola**
(logo 15px senza andare a capo). Il nome di chi ha fatto l'accesso si è spostato
**in fondo al menu** (`Sidebar` ora riceve `utente`): in 347px ci sta il nome
dell'app *o* quello della persona, e il primo dice dove sei.

⚠️ **Le finestre (scheda ordine)**: la griglia del dettaglio chiede colonne da
almeno 300px, ma su uno schermo da 360px dentro il pop-up ne restavano 292 —
**la scheda usciva dallo schermo di 8px**. Imbottitura ridotta e colonne che
possono stringersi a 260.

**Come è stato provato**: pagina temporanea sotto `/widget` (ramo pubblico) con
il componente vero su dati finti, `resize_window` a 375×812 e a 1280×900, misure
prese dal DOM. Il file è stato **cancellato** e non è nel commit.
⚠️ **NON verificato a occhio**: il pannello del browser non era a schermo, quindi
niente screenshot — i numeri vengono dal layout, che è composto (`body` alto
1051px, non zero). Le altre pagine ereditano barra, testata e contatori ma non le
ho aperte una per una: **serve un giro dell'utente dal telefono**.

## 26/08/2026 (8) — CHIAMATE: le telefonate diventano righe, e un promemoria

Chiesto dall'utente: «crea una sezione chiamate dove registri le notifiche per
brand delle chiamate che vengono ricevute e apre un task per aprire la richiesta
di richiamare il cliente. Le chiamate arriveranno ad una mail chiamate@deluxy.it.
Riconosci automaticamente in caso il cliente se è relativo a un ordine e registra
che ha chiamato anche visibilmente in ordini, altrimenti specifica che il
contatto va richiamato e non si tratta di un attuale cliente».

**Com'è fatto**: la casella `chiamate@deluxy.it` si dichiara di tipo **chiamate**
(campo `CasellaEmail.tipo`, in *Caselle → A cosa serve*). Lo scarico IMAP è
quello di sempre: quando la casella è di quel tipo, le mail **non** diventano
conversazioni ma righe `Chiamata` — nel cron (`/api/cron/posta`, ogni 5 minuti) e
nel bottone «Scarica posta» (`/api/email/sync`), tutti e due.

⚠️⚠️ **Una chiamata non è una conversazione**: non c'è un testo da leggere né una
risposta da scrivere. In inbox sarebbe stata una conversazione per ogni squillo,
mittente il centralino, corpo che nessuno legge — il canale delle risposte pieno
di roba a cui non si risponde.

⚠️⚠️ **Il cron è il ramo che conta.** Registrare le chiamate solo quando qualcuno
preme «Scarica posta» sarebbe una chiamata persa con un passaggio in più.

**Riconoscimento**, con la chiave del resto dell'app (`cifreTelefono`, ultime 9
cifre): ordine locale aperto → `ordine`; ordini nell'archivio di Orders →
`cliente`; niente → `sconosciuto`, e la riga lo scrive **in rosso**.
⚠️ Sapere chi NON si ha davanti vale quanto sapere chi si ha: chi richiama apre
con «buongiorno, per il suo ordine».

⚠️⚠️ **L'archivio si interroga ma la risposta si VERIFICA**: `/api/v1/ordini?q=`
cerca in una dozzina di campi (indirizzo, note, cap…), quindi «trovato» non vuol
dire «è il suo numero». Si tengono solo gli ordini il cui telefono ha davvero
quelle 9 cifre. **Misurato** sugli ordini veri: **8 su 8** riconosciuti col loro
numero, tre numeri inventati → `sconosciuto`. ⚠️ Un quarto numero «inventato»
(`+393200000000`) risultava `cliente`: **non era un falso positivo**, quel numero
esiste davvero sull'ordine #1634 — la prova sbagliata era la mia.

**Il promemoria nasce insieme alla chiamata** (`Attivita` «Richiamare …», con
l'ordine collegato) e si spunta da solo quando si segna «Richiamato».
⚠️ Due liste che dicono cose diverse sulla stessa telefonata sono peggio di una
lista sola: si richiama due volte, e la seconda il cliente dice che ne aveva già
parlato con un collega.

**Si vede negli ORDINI**: bollino ☎ in bacheca (oro finché nessuno ha
richiamato, come i messaggi non letti) e riquadro «Ha telefonato» nella scheda,
**sopra** i messaggi — una telefonata a cui nessuno ha risposto è la cosa più
urgente che ci sia su un ordine.

**Per marchio**: caselle in cima con quante restano da richiamare. Il marchio si
sa dall'ordine del chiamante o dal **nostro numero che ha squillato**
(`NegozioShopify.telefonoChiamate`, in *Negozi*). Quando non si sa: **«Senza
marchio»**, che è una risposta.

⚠️⚠️ **ONESTÀ SUL PARSER**: al 26/08 la casella è appena aperta e **non abbiamo
ancora una notifica vera**. `scripts/prova-chiamate.mts` (12 casi) copre le forme
comuni scritte a mano — non un campione misurato. Per questo il testo della
notifica si conserva **intero** e si mostra col bottone «Notifica», il numero non
riconosciuto si dichiara invece di essere inventato, e c'è «Correggi numero» che
rifà il riconoscimento. **Quando arriva la prima notifica vera, incollarla nella
prova e rimisurare.**

⚠️ Una data assomiglia a un telefono: «26/08/2026» ridotto a cifre fa 26082026,
otto cifre esatte. Senza il filtro su `/` e `:` ogni notifica avrebbe avuto un
chiamante inventato — e credibile.

**DUE DIFETTI TROVATI STRADA FACENDO, tutti e due silenziosi:**

1. ⚠️⚠️ **Sospendere un negozio gli cancellava la configurazione.** Il bottone
   «Sospendi» manda un form con dentro solo id, nome, dominio e attivo, e
   `salvaNegozioAction` leggeva gli altri campi con `?? ''`: sigla in rubrica,
   brand di Ricerca fornitori e `phone_number_id` di WhatsApp finivano a vuoto.
   Ora un campo che non arriva **non si tocca**.
2. ⚠️⚠️ **Le risposte ai clienti sarebbero potute partire da chiamate@**: le
   caselle si ordinano per indirizzo e `chiamate@deluxy.it` viene prima di
   `cs@deluxy.it`, quindi senza una predefinita il ripiego di `casellaPerId()`
   avrebbe scelto quella. C'è `caselleDaCuiScrivere()`, che esclude le caselle
   di tipo chiamate.

🔴 **MANCA (serve l'utente)**: la casella `chiamate@deluxy.it` va **creata in
Caselle** con la sua password e il tipo «Chiamate», e il centralino va puntato
lì. Finché non c'è, la sezione resta vuota — correttamente.

## 26/08/2026 (7) — il QUARTO negozio: business.deluxy.it non è deluxy.it

Chiesto dall'utente: «dobbiamo integrare business.deluxy.it» — il negozio **B2B**
(`90bfeb-f5.myshopify.com`, «Business Deluxy»).

⚠️⚠️ **Il problema non era aggiungere una riga.** Finché i negozi erano tre, le
regole scritte a mano davano la risposta giusta *per costruzione*: «se contiene
deluxy allora è deluxy.it». «business.deluxy.it» **contiene** «deluxy» — quindi
il quarto negozio veniva siglato **DL** in rubrica e cercato come **deluxy.it**
in Ricerca fornitori: scambiato per il negozio regali, senza un errore a schermo.
Una regola scritta su tre valori non dice «non lo so» quando i valori diventano
quattro: **dice il terzo**.

- `brandRicercaDaNegozio()` e `prefissoDaNegozio()`: «business» si prova **prima**
  di «deluxy», come già faceva «Deluxy Flowers» col marchio più specifico. Sigla
  nuova: **BS**.

⚠️⚠️ **E una garanzia è scaduta.** `smistaMailPerSito()` decideva il marchio di
una mail dal numero d'ordine con un `findFirst`, appoggiandosi a una misura del
30/07: «981 ordini, zero numeri ripetuti fra i siti». Quella misura vale su
**tre** negozi; col quarto i numeri bassi possono ricadere sulle fasce di Cake
(1623–1742) e Flowers (2318–2614), e `findFirst` avrebbe restituito il primo che
capita — la mail nella colonna dell'altro marchio, in silenzio. Ora il numero
decide **solo se pesca un ordine solo**; se ne pesca due si scende al tag.

Una garanzia scaduta è peggio di una che non c'è mai stata: il codice che ci si
appoggiava non cambia faccia.

**Provato**: `npx tsx scripts/prova-quarto-negozio.mts` — 13 casi sui quattro
negozi. ⚠️ La prova ha corretto **me**: davo per scontato che il tag `[deluxy]`
pescasse i regali, e invece torna **null** da sempre, perché combacia col dominio
dei regali **e** col brand dei fiori. Ambiguo = nessun marchio, per scelta; il
quarto negozio non peggiora quel caso.

🔴 **Gli ordini business non arrivano ancora**: la riga in Deluxy Orders esiste ma
è **spenta** finché non si verifica che l'app Shopify sia installata su quel
negozio (vedi l'handoff di Orders). Queste regole sono pronte per quando arriva.

## 26/08/2026 (6) — i comandi si TROVANO, e il link di riconsegna non si perde

Due cose viste dall'utente sulla scheda di **#1798**.

**«Dove trovo il pulsante per unire ad un altro ordine?»** — c'era, ma stava in
un riquadro più in basso, fuori dalla prima schermata. ⚠️⚠️ **Un comando che c'è
ma non si trova, per chi lavora non esiste**: si continua a fare a mano la cosa
che il bottone farebbe, e chi l'ha scritto crede che nessuno ne avesse bisogno.
Ora in testa alla scheda, accanto a «Apri in Shopify», ci sono **«Unisci ordini»**
e **«Riconsegna»**: portano al riquadro e lo **accendono** per un attimo (bordo
oro, 1,6 s), così si capisce dove si è finiti invece di ritrovarsi a metà pagina.

⚠️ L'elemento si cerca col `getElementById` **al momento del clic** invece di
tenere un ref: un ref scritto come arrow dentro il JSX React lo stacca e
riattacca a ogni render, ed è già costato una pagina che saltava a ogni tasto
premuto.

**«Segna comunque un link all'apertura del pop-up»** — il link della riconsegna
adesso si **scrive sull'ordine** (`riconsegnaLink`, `riconsegnaNumero`,
`riconsegnaIl`) e si rivede riaprendo la scheda.

⚠️⚠️ Senza, chiudendo il pop-up il link spariva: per riaverlo si premeva di nuovo
«Crea il link», cioè si creava una **seconda bozza su Shopify per la stessa
riconsegna**. Due link in giro allo stesso cliente e nessuno che sappia quale ha
pagato — e chi paga quella sbagliata ha pagato comunque. Ora il riquadro dice
«c'è già un link di riconsegna (bozza #…): mandalo invece di farne un altro», con
Copia e WhatsApp.

Provato: typecheck e build.

## 26/08/2026 (5) — il bottone «Riconsegna»: il link di pagamento pronto

Chiesto dall'utente: «crea per ogni ordine un bottone Riconsegna con un link
veloce di pagamento da mandare al cliente (esempio destinatario non c'era)».
Sulla scheda: importo, motivo, «Crea il link» → link con Copia e WhatsApp.
Rotta `POST /api/ordini/<id>/riconsegna`.

⚠️⚠️ È un **ordine nuovo**, non una modifica di quello vecchio: il cliente paga
una cosa in più e in Orders dev'essere un incasso in più. Toccare il totale
dell'originale falsificherebbe la prima vendita.

⚠️⚠️ Resta una **bozza** finché non paga (`pagamento: 'link'`): nessun incasso
registrato che non sia vero. E il messaggio lo dice — «diventa un ordine quando
il cliente paga» — perché chi legge «creato» crede di aver incassato.

⚠️ **Nessun prezzo di riserva**: l'importo si scrive a mano. Una riconsegna costa
quello che si è detto al cliente, e un default silenzioso finirebbe per essere il
prezzo di tutti. ⚠️ L'indirizzo si chiede a **Orders**, che è chi lo possiede:
mandare il valet dove stava scritto tre settimane fa sarebbe sbagliare due volte.
Senza data: si concorda al telefono. ⚠️ Il titolo della riga dice **di quale**
ordine è la riconsegna: fra un mese «Riconsegna 15 €» non si capisce più.

⚠️ Il link si copia, **non parte da solo**: a un cliente che ha appena mancato una
consegna non si manda un link secco.

**MANCA**: la creazione vera scrive una bozza su Shopify a un cliente vero —
quella si prova a mano, una volta, da una persona.

## 26/08/2026 (4) — unire due ordini che sono una vendita sola

Chiesto dall'utente su **#1798 (370 €)** e **#1777 (200 €)**, stessa cliente «ada
hunca», stessa consegna: `src/lib/unione-ordini.ts`, riquadro nella scheda.

⚠️⚠️ **È una cosa NOSTRA**: in Deluxy Orders quei due ordini restano **due**,
ognuno col suo margine. Qui si dice «sono un lavoro solo», non si riscrive
l'economia di un'altra app.

🔴 **DECISIONE APERTA, non presa**: su #1777 il costo del fornitore (253 €) sta
tutto su un ordine da 200 €, e in Orders quel margine è **−43,44 €** — che nella
nuova KPI cade su Riccardo. Unire risolve **qui** ma non **lì**. Le due strade
sono: (a) spezzare il costo in proporzione al venduto (136,76 / 116,24) e
riscriverlo in Orders, oppure (b) far conoscere a Orders gli **ordini uniti**.
Non toccato senza l'ok dell'utente: è economia di un'altra app.

## 26/08/2026 (3) — nelle KPI il MARGINE per operatore, e in % sul venduto

Chiesto dall'utente: «nelle kpis metti anche i margini che ogni operatore genera,
prendi il margine da orders» → poi «mettilo in % sul venduto».
`src/lib/margine-operatori.ts`. Ultimi 7 giorni: **Nicolò 463,12 € · 34,6% di
1.340** · **Federica 382,91 € · 34,0% di 1.125** · **Riccardo 46,72 € · 9,9% di
470**.

⚠️⚠️ **La base si scrive accanto**: una percentuale che non si può controllare
sembra sbagliata anche quando è giusta, e la stessa percentuale su 1.340 € o su
470 € è un lavoro diverso.

⚠️ Il margine si **legge** da Orders, non si ricalcola: è l'unico posto dove
nasce (netto IVA, sul totale pagato). ⚠️ La base è il venduto dei **soli** ordini
di cui si conosce il margine — quelli senza costo scritto restano fuori dal
totale **e** dalla base, e si contano a parte. ⚠️ L'attribuzione va a un
operatore solo se è un `Utente` vero; il resto finisce in «automatismi» invece di
essere spalmato su qualcuno. ⚠️ Nessuna percentuale nella vista «al giorno»: una
media giornaliera di percentuali non vuol dire niente.

## 26/08/2026 (2b) — il fornitore entra in Anagrafiche già al SALVATAGGIO

Chiesto dall'utente. Prima la scrittura al registro partiva **solo** premendo
«Pagata».

⚠️⚠️ Fra il salvataggio e il bonifico possono passare **giorni**, e in quei
giorni il fornitore non esiste per nessun'altra app: chi lo cerca in anagrafica
non lo trova e **lo ricrea a mano**. È così che nascono i doppioni.

⚠️ **La divisione dei dati**: al registro va **chi è** (nome, recapiti, stato di
fornitore); **qui** restano gli ordini che gli abbiamo dato e le condizioni di
pagamento (metodo, IBAN, intestatario). Nessuno tiene una copia dell'altro
(Standard Deluxy §7). ⚠️ Il richiamo dal «Pagata» **resta** — lì l'IBAN è stato
usato davvero — e l'upsert-merge non duplica. ⚠️ Anticipare la scrittura non può
**riabilitare** un fornitore escluso: se è «da evitare», il registro ignora la
riga. ⚠️ Best-effort, ma l'esito si **restituisce**: se non entra si vede.

## 26/08/2026 (2) — «Paga fornitore» si spegne se una richiesta è già aperta

Chiesto dall'utente. ⚠️⚠️ Il danno che evita: premendolo una seconda volta
nasceva una richiesta **gemella** — due righe per lo stesso ordine, due avvisi a
chi paga, e nessuna delle due che dice che l'altra esiste. È il modo in cui si
paga due volte lo stesso fornitore, e non se ne accorge nessuno: ognuna delle due
sembra giusta.

⚠️⚠️ **La guardia sta in due posti**, e servono tutti e due:

- il **bottone spento** — riga della tabella, scheda a bacheca e scheda
  dell'ordine: tre punti, un componente solo (`BottonePaga`);
- il **controllo nella rotta**: un link già aperto in un'altra scheda, un doppio
  invio o un ritorno indietro del browser arrivano al POST **senza passare dal
  bottone**. Risponde 409 e dice **quale** richiesta c'è già.

⚠️ Spento non vuol dire nascosto: diventa **«Già in pagamento»** e **porta** alla
richiesta che c'è. Un bottone che sparisce fa credere che la funzione non ci sia.

⚠️ Blocca solo se la richiesta è ancora **da pagare**. Una già pagata non blocca:
su un ordine può esserci un **secondo fornitore** (i fiori e la torta), e vietarlo
sarebbe vietare un caso vero.

⚠️⚠️ Si cerca in **tutte e due le forme del numero**: in tabella le richieste
vecchie stanno senza cancelletto e le nuove con, e cercandone una sola la guardia
non troverebbe il doppione — cioè non farebbe niente, in silenzio.

Provato: `npx tsx scripts/prova-paga-doppio.mts` (5 casi). Misurato: c'è **1
richiesta aperta** adesso (#2801, Petali e Sogni, 80 €), quindi su quell'ordine
il bottone è già grigio.

## 26/08/2026 — via l account Diagnostica, e i Turni stanno sulla settimana corrente

**Eliminato l’account `diagnostica@deluxy.local`** (ruolo operatore, creato il 26/07/2026). Contate
prima le tracce in tutte e tredici le tabelle che possono riferirsi a un utente:
**zero ovunque**, tranne un turno del lunedi 09-18.

⚠️⚠️ Il turno e stato tolto per PRIMO: la riga porta il nome **copiato**, quindi
cancellando solo l utente il lunedi sarebbe rimasto in griglia intestato a
«Diagnostica» — e l AI fuori turno avrebbe taciuto tutti i lunedi per un
operatore che non esiste. Cancellato per id, mai con un filtro largo.
Utenti rimasti: **3**.

**I Turni si aprono sulla settimana corrente** (prima: sulla regola di sempre), e
ci restano: un controllo al minuto sposta la vista quando cambia la settimana.
⚠️ Si sposta solo chi stava guardando la settimana che era corrente un attimo
prima — chi e andato apposta sulla prossima non se la vede cambiare sotto le
mani. ⚠️ E quando non si e sulla corrente c e il bollino «settimana passata /
futura»: una griglia mezza vuota di tre settimane fa si legge come «non c e
nessuno in servizio».

🔴 Dopo la cancellazione la regola copre **21 ore su 168** (venerdi e weekend):
martedi, mercoledi e giovedi non sono scritti da nessuna parte, e la prova
dell AI fuori turno continua a fallire apposta.

## 25/08/2026 (sera 9) — lo stato «In App»: quali ordini li sta gestendo la piattaforma

Chiesto dall'utente: «parla con l'app deluxy delivery per capire quali ordini
sono proposti in automatico tramite app e genera un nuovo stato "In App" per
questi con possibilità di interrompere però la gestione dell'ordine dall'app».

### Cosa ho trovato parlandoci (letto nel suo codice, e provato sul vivo)

La piattaforma ha già un **canale app-to-app** (Standard §4.3), di sola lettura,
con chiave `x-api-key`:

    GET /api/v1/app/vendite?source=deluxy-orders&aggiornateDa=<ISO>&limit=200
    GET /api/v1/app/vendite/by-ref/deluxy-orders/<idOrdineInOrders>

✅ **È vivo**: su `https://deluxy-delivery.vercel.app` risponde **401** senza
chiave (e una rotta inventata **404**, quindi quel 401 vuol dire qualcosa). Su
`app.deluxy.it` invece è 404: l'indirizzo buono è il primo.

Gli stati della vendita là dentro: `da_gestire` · `proposta` · `accettata` ·
`non_accettata` · `annullata`. **«Proposta» è l'automatico che ci interessa.**

⚠️⚠️ **Il ponte è l'id di ORDERS** (`Sale.externalOrderId`), non il numero né il
gid Shopify. Non lo tenevamo: aggiunto `Ordine.ordersId`, che la sync con Orders
riempie da sé. 🔴 Oggi è vuoto su tutti e 1.362 gli ordini: si riempie al
prossimo giro del cron ordini, e gli ordini più vecchi della finestra di sync non
lo avranno mai — quelli non saranno agganciabili.

### Cosa ho fatto

- **Stato «In App»** in `GESTIONI`, fuori dai `PASSI` come «Comunicazione»: lo
  scrive la sincronizzazione, non una persona.
- **Sync ogni 15 minuti** (`/api/cron/piattaforma`): una chiamata a giro. Tre
  regole — non tocca i `Gestito`, non riprende gli interrotti a mano, e quando la
  proposta **decade riporta l'ordine dov'era** (non a «Da iniziare»).
  ⚠️⚠️ Quest'ultima è quella che non si può sbagliare: se «non accettata»
  restasse «In App», quell'ordine non lo lavorerebbe più nessuno — noi lo
  crediamo dell'app, l'app l'ha lasciato andare.
- **Copia a breve scadenza** sull'ordine (`appStato`, `appPartner`,
  `appCostoPartner`, `appAggiornatoIl`) più `appGestionePrima` e
  `appInterrottoIl`: la verità resta di là.
- **Interrompi** sulla scheda: riporta la lavorazione dov'era, segna la decisione
  della persona e dice a **Orders** di non smistarlo più in automatico.
  ⚠️⚠️ **Non annulla la proposta già aperta** — il canale è di sola lettura — e
  lo **scrive nel messaggio**: «nella piattaforma la proposta a X risulta ancora
  aperta, va annullata di là». Prometterlo e non farlo sarebbe peggio del bottone.
- ⚠️ Diviso `piattaforma-stati.ts` (solo parole) da `piattaforma.ts` (rete e
  chiavi): importando il secondo in un componente client il build falliva con
  «Reading from "node:crypto" is not handled by plugins» — un errore che non
  nomina il colpevole.

**Provato**: `npx tsx scripts/prova-piattaforma.mts` (12 casi) — il vocabolario
degli stati, «In App» nel nostro, il ponte, e la rotta viva che chiede la chiave.

🔴 **DUE COSE PRIMA CHE FUNZIONI DAVVERO**

1. **La chiave**: `node api/scripts/crea-chiave-app.mjs` nella piattaforma, poi
   incollarla in Impostazioni → Piattaforma consegne. Da questa sessione non si
   poteva fare: il `DATABASE_URL` della piattaforma qui è un segnaposto.
2. **Annullare una proposta dalla nostra parte** vorrebbe dire una rotta di
   scrittura sulla piattaforma. Va scritta là, e quella cartella ha la regola
   «una sola sessione per volta».

## 25/08/2026 (sera 9) — la mail si apre in un pop-up, e quelle solo-HTML arrivavano VUOTE

Chiesto dall'utente: «al click apri la mail con un popup», sulla scheda
dell'ordine (riquadro **Messaggi del cliente**, `MessaggiOrdine.tsx`). Fatto — ma
la schermata che ha mandato conteneva anche un difetto che nessuno aveva notato.

**1. Il pop-up (quello che era stato chiesto).** Ogni battuta è ora un
`<button>`: cliccandola — o arrivandoci col Tab e premendo Invio — si apre il
messaggio **per intero**. Nell'elenco il testo è tagliato a 400 caratteri dentro
un riquadro alto 260px: basta a capire di cosa si parlava, non a leggere una
richiesta vera con indirizzo e orari. Il pop-up ha oggetto, mittente, data per
esteso, il corpo che scorre dentro di sé (max 60vh, la testata resta ferma) e
«Apri in Inbox». Si chiude con la ✕, con Esc o col clic sul velo.

⚠️⚠️ **Due trappole dell'annidamento**, perché questo pop-up nasce DENTRO la
scheda dell'ordine, che è già una finestra:

- **Il velo**: serve `velo velo-sopra` (z-index 70 contro 60) o nasce dietro; e
  il clic sul proprio velo va fermato con `stopPropagation`, perché il velo
  della scheda ordine è un antenato nel DOM e ha anche lui un `onClick` che
  chiude. Senza, chiudere il pop-up chiudeva anche l'ordine.
- **Esc**: `DettaglioOrdine` ascolta `keydown` sullo **stesso `document`**. Due
  ascoltatori sullo stesso nodo non si fermano a vicenda con `stopPropagation`
  in risalita — decide l'ordine di registrazione, e la scheda ordine si è
  registrata prima. La soluzione è ascoltare **in cattura**
  (`addEventListener('keydown', h, true)`): lì si arriva prima della fase di
  risalita, e `stopPropagation()` basta a non farlo vedere alla scheda.
- Provato a schermo su tutti e tre i modi di chiudere (Esc, clic sul velo,
  bottone Chiudi): il pop-up si chiude, **la scheda dell'ordine resta aperta**.

**2. Il difetto trovato per strada: 36 mail in archivio col corpo VUOTO.** Nella
schermata dell'utente le due «Re: ORDER 2798» mostravano l'oggetto e sotto il
nulla. Non era la grafica: sul database quelle due righe hanno
`length(testo) = 0`. Causa in `src/lib/email.ts`, che faceva
`testo: (m.text ?? '').trim()` — ma **una mail può non avere affatto la parte
`text/plain`**: chi la scrive con un editor visuale, o la manda una piattaforma,
spedisce spesso solo `text/html`. In quel caso `m.text` è `undefined` e il
messaggio entrava in archivio bianco. Non era solo estetica: `linguaDelTesto('')`
non riconosce niente, e l'AI che legge quelle conversazioni leggeva una riga
vuota. Misura del 25/08: **36 su 1.240** mail email, fra cui le due segnalate.

- Ora il corpo si prende dall'HTML come ripiego, ridotto a testo
  (`corpoDellaMail` in `email.ts`, con `testoDaHtml` nel nuovo
  `src/lib/html-a-testo.ts` — la stessa funzione che usava già `documenti-ai.ts`,
  che ora la importa invece di tenersene una copia).
- ⚠️ **Correggere il codice non basta**: le 36 già in archivio il dedup le
  salterebbe per sempre, e la correzione varrebbe solo per la posta futura. Sia
  `POST /api/email/sync` sia il **cron `/api/cron/posta`** ora, quando trovano
  una mail già presente **col testo vuoto** e stavolta ce l'hanno, la
  **riscrivono** (solo da vuoto a pieno, mai il contrario: il testo in archivio è
  quello che l'operatore ha letto e a cui ha risposto). Le due rotte tornano
  `ripescate` accanto a `nuove`. È il cron a fare il lavoro vero, da solo, sulle
  mail ancora sul server — che guarda **gli ultimi 2 giorni**: le vuote più
  vecchie di così restano vuote, e per quelle c'è «Apri in Inbox».
- Nel frattempo l'elenco scrive **«(senza testo)»** invece di lasciare il buco, e
  il pop-up spiega perché invece di aprirsi bianco.

**Verifica**: `tsc --noEmit` pulito e `npm run build` a buon fine (esito letto
direttamente, non da una pipe). Il comportamento è stato provato nel browser su
una pagina d'anteprima temporanea sotto `/chat` (unico ramo pubblico), poi
cancellata.

⚠️ **Nota sul repo condiviso**: le regole CSS di questo lavoro
(`.mail-aperta*`, `.battuta` come bottone) sono finite dentro il commit
`0f58293e` di un'**altra sessione**, che ha staggiato `globals.css` mentre la mia
modifica era già nel file. Nulla è andato perso — ma è il motivo per cui in
`git log -- globals.css` questo lavoro non compare col suo messaggio.

## 25/08/2026 (sera 8) — «non vedo Passiflora fra i fornitori» (ordine #2798)

Segnalato dall'utente. Aveva ragione, e i motivi erano **tre**, tutti silenziosi.

1. **Nel registro Passiflora non ha né città né provincia** — come tutti e 15 i
   fornitori entrati pagandoli — e l'elenco «fornitori in zona» filtra per
   provincia: chi non ce l'ha è invisibile.
2. **Ha `categoria: ALTRO`**, e quell'elenco tiene solo FIORISTA e PASTICCERIA.
   Anche con la provincia, sarebbe rimasto fuori.
3. ⚠️⚠️ **Quella consegna non è nemmeno in Italia.** #2798 va a **Mijas
   (Málaga)** e l'indirizzo dice «MA», che in Italia **non è una provincia**. La
   schermata scriveva «Nessun fornitore censito in provincia di MA»: si legge
   come «non ne abbiamo», mentre la verità è «qui non so cercare».

**Cosa è cambiato**

- **«Hanno già preparato ordini per noi»**: una sezione nuova nella scheda
  dell'ordine, letta dai **nostri ordini** e non dal registro, che si vede
  **anche quando l'elenco in zona è vuoto**. In cima chi ha già consegnato in
  **quella città**, poi in quella provincia, poi chi ha lavorato di più.
  ⚠️ Le città scritte accanto sono quelle di **consegna**, non l'indirizzo del
  fornitore: dove abbia il negozio continuiamo a non saperlo, e non si scrive
  come se lo sapessimo. Nel registro non finisce niente.
- **Provincia non italiana**: si dice, invece di dire «non ne abbiamo».
- **La categoria adesso parte** verso il registro quando è un fatto: chi ha
  preparato per **FLowers** è FIORISTA, per **Cake** è PASTICCERIA. ⚠️ Non è una
  deduzione dal nome — «Vecchio Maurizio» non dice niente — è il negozio
  dell'ordine che ha davvero preparato. Su «Deluxy», che vende di tutto, non si
  manda niente: meglio ALTRO che una categoria sbagliata.

**Provato sui dati veri**: `npx tsx scripts/prova-nostri-fornitori.mts` — sui 18
fornitori che risultano dai nostri ordini, per la consegna di #2798 il **primo
della lista è Passiflora**, cioè proprio chi quell'ordine l'ha preparato. E
`siglaProvincia('MA')` è vuota, mentre «MS» e «Firenze» si riconoscono.

🔴 **Resta**: i 15 già in anagrafica hanno ancora categoria ALTRO e nessuna
città. La categoria si potrebbe ripassare (sappiamo da che negozio veniva
l'ordine di ognuno); la città no, quella non ce l'abbiamo.


## 25/08/2026 (sera 7) — fuori turno risponde l'AI, e se non sa chiede su WhatsApp

Chiesto dall'utente: «quando non c'è nessuno sul cs attivo come operatore tutte
le risposte vengono fornite dall'AI e in caso di dubbi come rispondere chiede
informazioni a +393498853209».

🟡 **È FATTO MA È SPENTO**: l'interruttore sta in **Impostazioni → Fuori turno
risponde l'AI** e va acceso a mano. Una funzione che parla ai clienti da sola non
si accende con un deploy.

**Come funziona.** Cron ogni 10 minuti (`/api/cron/ai-fuori-turno`) →
`giroAiFuoriTurno()` in `src/lib/ai-fuori-turno.ts`. Se non c'è nessuno in turno,
prende le conversazioni non lette e non prese in carico e usa
`suggerisciRisposta` (le stesse risposte pronte e le stesse istruzioni CS AI del
bottone che usa l'operatore).

⚠️⚠️ **Il dubbio è la parte importante.** L'AI sceglie fra gli script e può dire
«nessuno adatto»: lì al cliente **non si scrive niente** e nasce una
`DomandaAiuto` con `utenteNome: 'AI fuori turno'`, mandata su WhatsApp
all'amministratore — che è già il numero **+39 349 885 3209** (era il default di
`aiuto-whatsapp.ts`, non l'ho dovuto aggiungere) e si cambia da Impostazioni.
L'amministratore risponde dal telefono citando il messaggio o col codice.

**Le quattro serrature**: interruttore spento di suo · solo fuori turno · solo su
chat non prese e con l'ultimo messaggio del cliente · massimo 3 risposte
automatiche per conversazione.

⚠️⚠️ **L'ora è quella di ROMA**, non del server: il cron gira in UTC e d'estate
alle 09:30 italiane segnerebbe le 07:30 — «non c'è nessuno» a turno appena
cominciato, e l'AI si metterebbe a rispondere sopra a chi lavora. E a mezzanotte
e mezza in UTC è ancora ieri, cioè la griglia sbagliata. `adessoARoma()` lo
calcola con `Intl`, ed è la prima cosa che la prova verifica (è la trappola
[«Oggi» calcolato sul server], già costata altrove).

⚠️ La risposta si vede in chat come **«AI (fuori turno)»** e la conversazione
resta **da leggere**: ha tamponato, non ha chiuso. Un invio fallito si registra
con l'errore invece di sparire.

**Provato**: `npx tsx scripts/prova-ai-fuori-turno.mts` (8 casi) — l'ora di Roma
nei due sensi, e la coerenza del giro con lo stato vero. Poi il giro vero in
modalità **prova** (accendendo l'interruttore per un istante e rimettendolo
subito): «nessuna conversazione che aspetta una risposta» — al momento le non
lette sono **0**. La prova non manda mai niente a nessuno, di proposito.

🔴 **Da fare prima di accenderlo davvero**:
1. controllare che la griglia dei **Turni** sia vera (oggi ci sono 4 fasce
   scritte): se è vuota o sbagliata, «fuori turno» vale sempre;
2. lanciare `POST /api/ai-fuori-turno?prova=1` in un momento con chat non lette
   e leggere riga per riga cosa risponderebbe;
3. solo dopo, accendere l'interruttore.


## 25/08/2026 (sera 6) — lo spam va nel cestino, e l'ordine si apre in una scheda nuova

**«Cliccando spam deve essere proprio spam e non apparire mai più»** (utente).
Prima non era così: il mittente entrava nell'elenco degli ignorati, la
conversazione andava **in archivio** e le mail successive entravano «già
archiviate». Cioè restavano sotto gli occhi di tutti — 58 conversazioni
archiviate, quasi tutte spazzatura.

Adesso: la conversazione va nel **cestino**, e le prossime mail di quel mittente
**nascono già nel cestino**.

- ⚠️⚠️ **Il punto che non si vedeva**: nel cron della posta c'era
  `eliminataIl: null` su ogni mail nuova — «chi scrive di nuovo non sa che
  l'avevamo buttata». Giusto per un cliente, **sbagliatissimo per uno spam**:
  sarebbe risalito dal cestino a ogni invio, e «non apparire mai più» sarebbe
  durato fino alla mail dopo. Ora i mittenti ignorati non risalgono.
- ⚠️ In `email/rismista` la condizione era `!c.archiviata`: chi era già in
  archivio non veniva più toccato e ci sarebbe rimasto per sempre — cioè proprio
  il mucchio da svuotare.
- ⚠️⚠️ **La conseguenza da dire, ed è scritta in tutti e due i posti** (la
  conferma dello spam e la pagina Caselle): il cestino si svuota dopo **30
  giorni**, quindi ora una regola larga (`@gmail.com`, `info`) **può far perdere
  davvero** la mail di un cliente. Prima restava in archivio per sempre.
- ⚠️ Il contatore che cresce nella schermata è quello del **cestino**, non
  dell'archivio: alzare il numero sbagliato manda a cercare dove non è.

**Il numero d'ordine nella testata della chat è un link** e apre l'ordine in una
**scheda nuova**. Era un cartellino muto: chi rispondeva a «did they arrive?»
apriva un'altra scheda a mano, cercava il numero, tornava indietro. ⚠️ Scheda
nuova di proposito — la conversazione resta aperta con la bozza dentro — e il
link lo costruisce `linkOrdine()`, che tiene il cancelletto: senza, «#2797»
pescherebbe anche «#12797» e si aprirebbe un elenco invece della scheda.


## 🔴 DA DECIDERE — scalare gli esiti dei reclami a valet e partner

Domanda dell'utente (25/08/2026): «dobbiamo comunicare gli esiti all'app di
delivery così che possa scalarli ai valet o ai partner nel caso di loro colpe».
**Contato prima di rispondere**, e oggi la catena non può funzionare:

| dov'è il buco | misura |
|---|---|
| **Chi ha colpa non è mai indicato** | 6 reclami su 6 hanno `colpaId` e `colpaNome` **vuoti**: si sa il *tipo* (3 partner · 2 valet · 1 azienda), non *chi*. |
| **I registri valet sono vuoti** | 0 valet nel registro locale del CS, **0** in Anagrafiche (dove esiste già `Valet.platformId`, il ponte alla piattaforma). |
| **L'esito è testo libero** | «Rimborsa spedizione e buono da 25€ **(da scalare a maurizio)**» — il «da scalare a chi» oggi è una frase dentro una nota. |
| **La piattaforma non ha le penali** | `Salary.cashDeductions` sono i **contanti incassati alla consegna**, non una trattenuta per colpa: riusarla mischierebbe due cose e il totale non direbbe più cosa contiene. |

**Il giro proposto** (Standard §7: ogni dato ha una casa sola — il reclamo è del
CS, il compenso del valet è della piattaforma, il denaro esce da Transactions):

1. **CS**: sul reclamo la colpa diventa *chi* (id vero) e l'esito diventa
   `addebito { importo, aChi, motivo }`. Senza un numero non si scala niente.
2. **Ponte identità**: il valet del CS si aggancia ad Anagrafiche, che ha già
   `platformId`. È il primo lavoro: senza, la piattaforma non sa di chi parliamo.
3. **CS → piattaforma**: `POST /addebiti` idempotente su `reclamoId` — ⚠️ un
   addebito applicato due volte è denaro tolto due volte a una persona.
4. **Piattaforma**: l'addebito resta **proposto** finché una persona non lo
   approva, poi diventa una **riga a parte** sul prossimo stipendio (mai su uno
   già firmato o pagato) o sulla prossima fattura al partner.
5. **Ritorno**: la piattaforma dice quando è stato scalato e il reclamo lo
   mostra. Senza il ritorno, «scalato» sarebbe dedotto e non misurato.

⚠️ **Colpa ≠ addebito**: non tutte le colpe si scalano. Deve deciderlo una
persona, e il valet deve poter contestare (la piattaforma ha già i `claims` sugli
stipendi).


## 25/08/2026 (sera 5) — «ci sono domande aperte?» si vede dalla pagina, e l'esito pure

Due richieste dell'utente su `/reclami`.

**Il riquadro «Domande aperte»** in cima: quante ne aspettano una risposta e su
quanti reclami (il primo numero è il lavoro, il secondo quante persone andare a
cercare). ⚠️⚠️ Contato su **tutto l'archivio**, non sui filtri: una domanda su un
reclamo chiuso aspetta lo stesso, e un numero che cambia coi filtri non serve a
decidere. ⚠️ **Zero si scrive** («Nessuna domanda aperta»): un riquadro che
sparisce non è una risposta. ⚠️ È **cliccabile** e filtra sugli stessi reclami
che dichiara — numero e filtro nascono dalla stessa lista, così non possono
divergere.

**L'esito nella riga.** Sotto lo stato ora si legge come è andata a finire.
⚠️⚠️ Stato ed esito sono due cose diverse: il primo dice *a che punto è*, il
secondo *come è finita*. In un elenco di chiusi «Risolto» da solo non dice se
abbiamo rimborsato 250 € o scritto una mail di scuse — e il campo c'era, si
leggeva solo aprendo i reclami uno per uno. ⚠️ Su un reclamo non più aperto senza
esito scritto compare **«esito non scritto»** in rosso.

⚠️ E nel filo una domanda con risposta dice **chi ha risposto**, non solo
«risposta».

Contato in produzione mentre lo facevo: **1 domanda aperta** (qualcuno il filo lo
sta già usando) e **3 reclami su 6 con l'esito scritto**.


## 25/08/2026 (sera 4) — le note del diario hanno un seguito

Chiesto dall'utente su `/diario`: «metti "completato" per le note, o consenti di
aggiungere un thread a una nota già esistente che la cita».

⚠️ **«Completato» c'era già**: ogni riga ha la sua casella e, spuntata, resta
scritto chi l'ha chiusa. L'ho reso solo più esplicito a parole («completata da
Tizio» invece di «fatta da»). Il pezzo che mancava è il **filo**, ed è quello
che ho fatto.

**Il seguito** (`NotaDiario.rispostaA`, campo nuovo). Sotto ogni riga c'è
*Aggiungi seguito*: la riga nuova cita quella e le si mette sotto, rientrata.

- ⚠️⚠️ Un seguito è una **nota**, non un commento: si spunta, ha un autore, ed
  **eredita ordine e conversazione** della capofila — altrimenti cercando quel
  numero d'ordine si troverebbe metà della storia.
- ⚠️⚠️ **Una capofila completata con un seguito aperto resta fra le aperte**, e
  a schermo si dice perché. Senza, spuntando la prima riga di un filo si
  farebbero sparire in silenzio le cose che restano da fare. È il caso che la
  prova verifica per primo.
- ⚠️ Un solo livello: il seguito di un seguito si aggancia alla capofila.
- ⚠️ La rotta risponde `{ note, seguiti }` **separati**, e un seguito non compare
  mai come riga a sé: da solo — «richiamato, vuole il biglietto riscritto» — non
  si capisce di chi parli.
- ⚠️⚠️ **Trappola evitata per un soffio**: `DiarioOrdine` e `DiarioConversazione`
  leggevano solo `d.note`. Con la rotta nuova un seguito **sarebbe sparito** da
  quelle due viste senza nessun errore, e il numeretto delle note in sospeso su
  una chat avrebbe detto «zero» con del lavoro ancora aperto. Ora usano
  `insieme(note, seguiti)`.

Provato sui dati veri (`npx tsx scripts/prova-seguito-diario.mts`, 8 casi):
crea capofila e seguito, verifica che il seguito non compaia da solo, che
spuntando la capofila il filo resti in vista, e che con tutto chiuso esca dalle
aperte e si ritrovi fra le completate. Cancella **solo le righe che ha creato
lei**, per id. Schema con `prisma db push` (campo additivo).


## 25/08/2026 (sera 3) — un reclamo adesso ha un filo, e dice quanto vale l'ordine

Chiesto dall'utente su `/reclami?apri=cmt8q1opb000njv04q4vvyhzk`: «consenti di
fare un thread di domande e risposte per ogni reclamo» e «indica anche il valore
dell'ordine e il margine che abbiamo avuto».

### Il filo (`MessaggioReclamo`, tabella nuova)

⚠️⚠️ Un reclamo non si risolve con «descrizione» + «esito»: in mezzo c'è una
conversazione — «il valet dice che ha citofonato, il cliente dice di no» ·
«chiedo al fioraio se ha la prova di consegna» · «risposto: ce l'ha». Finora
viveva nelle chat fra colleghi: chi riapriva il reclamo tre giorni dopo
ricominciava da capo, e chi decideva un rimborso non sapeva cosa era già stato
chiesto.

- Una riga si segna come **domanda** e resta **«domanda aperta»** finché
  qualcuno non preme *Rispondi*. ⚠️ **Scrivere nel filo NON chiude una domanda**:
  è la differenza fra «ho detto qualcosa» e «ho risposto», ed è provata.
- Le **risposte stanno sotto la loro domanda**, non in fondo: un filo piatto con
  la risposta quaranta righe più giù è di nuovo una chat da ricostruire a mente.
- ⚠️ Il conto delle domande aperte si vede **dall'elenco** (accanto alla
  casistica): un reclamo fermo perché aspetta una risposta non è trascurato, ed è
  l'unico che si sblocca andando a cercare una persona. Due query per l'elenco
  intero, non una per riga.
- ⚠️ Il nome dell'autore si **copia** sulla riga: il filo si legge senza caricare
  gli utenti, e chi scrive oggi può non essere più in squadra fra sei mesi.
- ⚠️ `rispostaA` si valida lato server contro il reclamo: un id arrivato dal
  browser non è una prova, e una risposta agganciata al filo sbagliato
  sparirebbe dalla vista di tutti e due.

### I soldi dell'ordine (`GET /api/reclami/<id>/soldi`)

Valore dell'ordine · quanto è andato al fornitore · **quanto ci è rimasto**, con
la percentuale **sul totale pagato dal cliente** (stessa base di Orders).

⚠️⚠️ **Il margine si LEGGE da Deluxy Orders** (`soldiOrdineDaOrders`, che
esisteva e non lo usava nessuno) e non si rifà qui: è l'unico posto dove si
calcola (Standard §7.4) ed è al **netto IVA**. Misurato: #2798 → 250 € − 150 € =
100 € lordi, ma il margine vero è **81,97 €** (÷1,22). Rifarlo in casa avrebbe
dato un numero più alto e altrettanto credibile, senza errori da nessuna parte.

⚠️ `null` non è zero: se Orders non risponde, o non conosce il costo, si scrive
**«non calcolabile»**. Sul reclamo dell'utente (#12805) è proprio così: totale
100 €, costo del fornitore mai registrato → nessun margine, e lo dice.

⚠️ Quota fornitore e margine **non fanno 100 fra loro** (costo lordo su lordo,
margine netto su lordo): scritto a schermo invece che lasciato scoprire.

**Provato sui dati veri**: `npx tsx scripts/prova-filo-reclamo.mts <idReclamo>` —
crea domanda, nota e risposta sul reclamo vero, verifica che solo la risposta
chiuda la domanda, e **cancella solo le righe che ha creato lui** (mai un
`deleteMany` largo: il Postgres è condiviso). Schema applicato con
`prisma db push`; contati dopo: 1.360 ordini, 6 reclami, 18 pagamenti intatti.


## 25/08/2026 (sera 2) — «clicco mail e non succede nulla»

Segnalato dall'utente con lo screenshot della riga della tabella. Era vero, alla
lettera: **quel bottone non faceva niente.**

I bottoni per parlare col cliente stavano scritti in **due punti** — la scheda a
bacheca e la riga della tabella — e quella della tabella disegnava **tutti** i
canali come link, `<a href={c.url}>`. Ma l'**email un `url` non ce l'ha**: da
quando il `mailto:` è stato tolto (apriva il programma di posta del computer e
mandava la mail da un indirizzo personale, fuori dall'app) il canale email porta
una **bozza** che apre il pop-up. Quindi in tabella «Email» era
`<a href={undefined}>`.

⚠️⚠️ **Un link senza indirizzo non dà nessun segnale**: non si illumina, non si
raggiunge da tastiera, non scrive un errore in console. È il guasto più difficile
da vedere — sembra che l'app abbia ignorato il clic, e chi lavora ci riprova due
volte e poi apre la posta a mano (che è esattamente quello che il pop-up esiste
per evitare: la mail deve uscire dalla casella aziendale e restare in Inbox).

⚠️⚠️ **È la stessa forma del difetto di stamattina** con «Paga fornitore»: la
stessa azione scritta in due posti, e uno dei due impara qualcosa che l'altro
non sa. Qui la copia rimasta indietro non ha perso un dato: ha perso il gesto.

**Corretto due volte**, perché una sola non bastava:

1. i bottoni li disegna **una funzione sola** (`BottoniContatto`);
2. il tipo del canale è un'**unione**: `url` e `mail` **non esistono** finché non
   si è detto di quale caso si parla (`'mail' in c`). Provato rimettendo lo
   sbaglio: `error TS2339: Property 'url' does not exist on type
   'CanaleContatto'`.
   ⚠️ Marcarli facoltativi NON bastava: `href` accetta `string | undefined`,
   quindi `href={c.url}` compilava lo stesso e il bottone morto tornava. Il campo
   dev'essere **assente**, non facoltativo.

🔴 Da guardare a schermo: premi «Email» su una riga della tabella e deve aprirsi
il pop-up «Scrivi al cliente».


## 25/08/2026 (sera) — quanto lavoro diamo a un fornitore, e dove sta

Due domande dell'utente, tutte e due misurate prima di rispondere.

### «Tieni traccia del valore dei lavori dati?» — c'era per ordine, non per fornitore

Il costo concordato sta sull'ordine da giorni; **nessuna schermata lo sommava**.
Ora accanto a ogni fornitore c'è una riga: `3 ordini · 210 € dati`, o **«mai
lavorato con lui»** — nella **lista dei fornitori in zona** (dove si sceglie a
chi telefonare) e nella **ricerca del fornitore** (dove si chiede il pagamento).

- ⚠️⚠️ **Un ordine senza costo non vale zero, vale «non lo so»**, e si dice
  (`… · 1 senza costo`). Sommarlo come zero direbbe che a quel fornitore abbiamo
  dato meno del vero, e chi tratta un prezzo partirebbe più in basso.
- ⚠️ Si conta **sugli ordini** (il lavoro dato), non sui pagamenti (la
  conseguenza). Nessuna copia dall'economia di Orders: si somma quello che
  quest'app già possiede.
- ⚠️ Una **query aggregata sola** per tutta la lista: la zona ne mostra decine.
- ⚠️ Nella ricerca il conto **non** è il numero di ordini pescati dalla ricerca
  (che guarda 200 ordini per parola): è la storia intera. Mostrare il primo per
  il secondo direbbe «un ordine» di uno che ne ha avuti dieci.
- Prova sui dati veri: `npx tsx scripts/prova-lavoro-fornitore.mts` — confronta
  l'aggregato con gli ordini contati uno per uno (17 fornitori, **1.628 € dati
  su 2.800 € venduti**, nessuna differenza).
  ⚠️ `toLocaleString` con la valuta usa uno **spazio unificatore** (U+00A0): due
  stringhe identiche a occhio non erano uguali, e la prova falliva mostrando la
  stessa riga due volte.

### «Ti salvi la provincia del fornitore?» — no, e si vedeva

Contato: **0 dei 17 ordini con fornitore ha la città**, 0 ha l'id del registro,
0 ha il telefono. Sono stati tutti registrati scrivendo il nome a mano.

⚠️⚠️ La conseguenza è precisa: `fornitoriInZona` ricava la sigla della provincia
da `provincia` **o dalla città**, quindi i **15 fornitori nostri in anagrafica,
tutti senza città, non compariranno MAI** fra i «fornitori in zona» di un ordine
nuovo. Li abbiamo pagati, e alla prossima consegna in quella stessa provincia
non li propone nessuno.

Fatto: pagando, al registro va anche la **sua** città e la **provincia** quando
dalla città si ricava una sigla certa. ⚠️ È la città del FORNITORE, non quella di
consegna (si consegna a Milano un mazzo preparato a Sesto). E sotto il campo
«Città» del riquadro «chi prepara quest'ordine» ora c'è scritto **perché**
serve — il campo c'era già, e lo saltavano tutti.

🔴 **Resta aperto**: per i 15 già in anagrafica la città non ce l'abbiamo, e non
si inventa. Si riempirà al prossimo ordine in cui qualcuno la scrive. Se serve
prima, la strada onesta è cercarli su Google Maps per nome e prendere
l'indirizzo da lì (a mano, guardando: un nome generico pesca il negozio
sbagliato).


## 25/08/2026 (pomeriggio 2) — il fornitore pagato finiva sull'anagrafica sbagliata

Domanda dell'utente: «salvi le informazioni dei fornitori dalle richieste di
pagamento, e le aggiorni in anagrafiche?». Contato invece di risposto a memoria —
ed è saltato fuori un errore in produzione.

### Che cosa è arrivato davvero in Anagrafiche: 5 fornitori su 17

- **11** pagati il 24/08 **prima** che il gancio esistesse: mai mandati.
- **5** creati il 25/08 nell'istante del «Pagata» (`statoFornitore: abituale`,
  IBAN solo col checksum ok).
- **1** — «Paradis des fleurs» — **finito sull'anagrafica sbagliata**. 👇

### 🔴 L'errore, letto nel registro delle modifiche di Anagrafiche

```
RichiestaMatch  25/08 11:10  «nome:Paradis des fleurs» → agganciata (media)
                             → «Contatti senza azienda (HubSpot)»
Modifica        25/08 11:10  statoFornitore: «» → «abituale»  [origine: customer-service]
```

⚠️⚠️ **Perché**: la ricerca del registro pretende che **ogni parola** compaia in
**almeno un campo**, compresi i **contatti collegati**. Quel contenitore ne ha
**288**: «paradis» in uno, «des» in sei, «fleurs» in un altro. Combacia. Ed
essendo l'**unico** risultato, il registro lo promuoveva ad «agganciata».

Danno doppio: il fioraio vero **non è in anagrafica**, e un record che non è
un'azienda risulta nostro **fornitore abituale**.

⚠️⚠️ Sono due errori sovrapposti, e li conosciamo tutti e due: **la regola larga
di una ricerca riusata per AFFERMARE**, e **«un solo risultato» scambiato per
certezza** — la stessa cosa chiusa stamattina sul collegamento dell'ordine.

### La correzione, dai due lati

- **Qui** (`src/lib/aggancio-fornitore.ts`, agganciato in `registro-fornitori.ts`):
  un «agganciata» si accetta solo se **il nome regge il confronto**. Passa lo
  stesso nome, lo stesso nome con altra punteggiatura («S.R.L.S.» / «srls») e il
  più corto contenuto **per intero e in sequenza** nell'altro («Ketty Flowers» →
  «Ketty Flowers · PORTO CERVO», che è il caso per cui il match esiste). Non
  passa «Battistella fioreria srl» ↔ «Fioreria Battistella»: stesse parole in
  ordine diverso è una somiglianza, e a unirle è una persona.
  ⚠️ Il nome corto deve avere sostanza (due parole, sei caratteri), o
  un'anagrafica generica come «Fiori» si aggancerebbe a mezzo registro.
  Prova: `npx tsx scripts/prova-aggancio-fornitore.mts` (13 casi).
- **Nel registro** (commit `5494b526` di `deluxy-anagrafiche`, deployato): il
  risultato unico diventa «agganciata» solo se `nomeAffine()`, altrimenti torna
  fra i **candidati**. Provato sui dati veri coi 17 nomi
  (`npx tsx scripts/prova-match-nome.mts`): «Paradis des fleurs» ora è
  `candidati`, «RIGUTTO ELENA» resta agganciata a «Il Giardino Di Rigutto
  Elena» — che è giusto, evita il doppione.


### ✅ E i dati sono stati rimessi a posto (25/08, ore 14)

Correggere il codice non basta: il difetto **aveva già scritto**.

- **Tolto** lo `statoFornitore: abituale` dal contenitore «Contatti senza
  azienda (HubSpot)», con la riga nello storico delle modifiche del registro
  (`deluxy-anagrafiche/scripts/ripara-aggancio-sbagliato.mts`). Una correzione
  silenziosa è indistinguibile da un altro errore.
- **Ripassati tutti i 17 pagamenti**
  (`npx tsx scripts/recupera-fornitori-in-anagrafica.mts --scrivi`, di default
  non scrive): **9 creati, 6 aggiornati, 1 lasciato, 1 ambiguo**.
- I fornitori «abituali» nel registro sono passati da **5 (uno dei quali
  sbagliato) a 15**. «RIGUTTO ELENA» è finito sul record che esisteva già
  («Il Giardino Di Rigutto Elena»): il doppione non è nato.
- ⚠️ **Due restano fuori, e apposta**: «Battistella fioreria srl» (in registro
  c'è «Fioreria Battistella» — la unisce una persona) e «Paradis des fleurs»
  (ora torna «candidati», e la richiesta è nella **pagina Match** del registro).
  🔴 Sono due gesti da fare a mano su <https://deluxy-anagrafiche.vercel.app>.

⚠️ Al registro va solo **chi è** (nome, stato di fornitore, IBAN se il checksum
torna, telefono/email **se l'ordine li ha** — oggi sono vuoti su tutti e 17).
Restano qui gli ordini assegnati e le condizioni di pagamento: ognuno scrive
quello che possiede.

### E adesso finiscono anche in Scout (25/08, ore 15)

Verificato: i fornitori che entrano nel registro pagandoli **non comparivano**
in «Segnalazioni CS» di [Deluxy Scout](https://deluxy-scout.vercel.app) — la
schermata chiedeva al registro la sola fonte `deluxy-suppliers`, e i nostri
hanno `fonte: customer-service`. Misurato: 14 contro 43.

Aggiunta la seconda fonte (commit `72a1743d`, deployato): chi va a visitarli
vede ora anche i fornitori che hanno **già lavorato per noi e sono stati
pagati**, con l'etichetta che li distingue. Sono i contatti più caldi che
abbiamo, ed erano gli unici a non arrivare a nessuno.

⚠️ Se la Edge Function `anagrafiche` deployata su Supabase è più vecchia del
parametro `fonte`, l'elenco dei nostri **resta vuoto e dichiarato incompleto**
(non si finge zero): si risolve con `supabase functions deploy anagrafiche`.

### 🔴 MANCA: quanto lavoro abbiamo dato a un fornitore

Il valore c'è **per ordine** (`Ordine.fornitoreCosto`, il costo concordato, e
`RichiestaPagamento.importo`; il costo va anche a Orders per il margine), ma
**nessuna schermata somma per fornitore** — e ad Anagrafiche va solo chi è
(nome, stato, IBAN), nessun volume.

Contato a mano il 25/08: **17 fornitori, un ordine a testa, 1.628 € dati contro
2.800 € venduti**. Nessuno si ripete ancora.

⚠️ Dove andrebbe: l'aggregazione è **sugli ordini** e l'economia dell'ordine è di
Orders; qui c'è «chi lo prepara». Il punto in cui servirebbe davvero è la
**scelta del fornitore**, accanto al nome: «gli abbiamo già dato N ordini per
X €» — la domanda che questo manuale dichiarava di non saper rispondere.

## 25/08/2026 (pomeriggio) — «Paga fornitore» perdeva l'ordine per strada

Segnalato dall'utente aprendo
`/pagamenti?ordine=%232792&cliente=Darya+Byelikova&importo=135`: **il campo
«Ordine» era vuoto**, pur essendo partiti dalla scheda di quell'ordine.

⚠️⚠️ **Non era la ricerca a non funzionare: era il link a non dire QUALE ordine.**
Portava il numero e basta, e il numero non è un'identità. Misurato sui dati veri:
cercando «2792» tornano **due** ordini — **#2792** (FLowers, Darya Byelikova,
135 €) e **#12792** (Deluxy, Sophia Moein, 64 €). Davanti a due, la regola «si
collega da solo solo se il risultato è UNO» si ferma — **e fa bene**: scegliere a
caso vorrebbe dire calcolare il margine sul valore di un altro ordine. Ma chi
aveva premuto «Paga fornitore» quell'ordine l'aveva già indicato, e si ritrovava
a doverlo ricercare a mano.

Ora il link porta **id e negozio** (`linkPagamentoOrdine()` in
`src/lib/link-ordine.ts`) e dall'altra parte non si cerca più: si **riconosce**
(`riconosciOrdine()`, tre prove in quest'ordine — **id** → **numero esatto +
negozio** → **un solo risultato**).

- ⚠️ La terza prova resta l'ultima, e se nessuna dice sì il campo **resta vuoto
  apposta**: collegare l'ordine sbagliato non dà nessun errore, dà un margine
  sbagliato e un bonifico intestato a chi ha preparato un'altra consegna. Provato
  anche il caso cattivo: un id che non è in elenco **non fa ripiegare** sul
  somigliante.
- ⚠️ La prova del numero + negozio serve agli ordini **d'archivio**, che un id
  nostro non ce l'hanno.
- ⚠️⚠️ **Trovato per strada**: i due bottoni «Paga fornitore» erano **due copie
  diverse**. Quello dell'elenco portava fornitore e costo concordato, quello
  della **scheda no** — quindi proprio dalla scheda dell'ordine (dove si vede chi
  lo prepara) si ribattevano a mano nome e cifra. Adesso il link lo costruisce
  una funzione sola.
- La prova gira sui **dati veri**: `npx tsx scripts/prova-paga-fornitore.mts`
  (14 casi). Se un domani «2792» tornasse un ordine solo, il caso non sarebbe più
  riproducibile e **la prova lo dice** invece di passare in silenzio.

### I tre commit di stamattina, che l'handoff non aveva ancora

Sono usciti **dopo** la sezione qui sotto (che si ferma a `7ddfbd21`):

- **`01c98ce1` — il fornitore va SCELTO, non scritto.** Nella schermata vera
  l'intestatario del conto era **«p»**: un campo di testo obbligatorio si
  soddisfa con una lettera, e da lì in poi tutto «funziona» — la richiesta si
  salva, «p» finisce sull'ordine come fornitore, il bonifico parte verso un nome
  che non è un nome. ⚠️ Non si vietano i nomi corti (esistono insegne di due
  lettere): si chiede **da dove viene** il nome — dalla ricerca (i nostri, il
  registro, Google Maps) o dichiarato nuovo apposta. ⚠️ Il controllo sta nella
  **schermata**, non nella rotta: «da dove viene» è un fatto dell'interfaccia.
- **`11c2bbb8` — «già a posto» non è un guasto.** Il messaggio verde diceva
  «⚠️ L'ordine NON l'ho aggiornato: #2798 è già a posto». Due cose opposte nella
  stessa riga, e **vince la forma**: si andava a cercare un problema che non
  c'era. Ora `gia-registrato` conta come esito buono (spunta verde). Stesso
  difetto del bollino «non avvisato» di ieri.
- **`5b7ec51a` — la pagina non salta più mentre si scrive.** Difetto
  introdotto il 24/08 con l'evidenziazione della riga: `ref` scritto come arrow
  **inline nel JSX** → React lo stacca e riattacca a ogni render → `scrollIntoView`
  **a ogni tasto premuto**, in qualunque campo. Ora il ref è stabile e lo
  scorrimento sta in un effetto che guarda solo l'id della riga.


## 25/08/2026 — la catena ordine→fornitore→pagamento chiusa, e il glossario per più marchi

Otto commit, tutti deployati. In fondo alla giornata la catena regge da sola:
si chiede a un fornitore, lui accetta, l'ordine sa chi lo prepara, il pagamento
lo trova già scritto, il costo arriva a Orders e il margine si calcola.

### Le proposte ai fornitori (`cb883e9a`)

Il bottone WhatsApp apriva la chat col messaggio pronto e **non restava traccia
di niente**: non si sapeva a chi si era già chiesto, un collega richiedeva allo
stesso fornitore, e chi rispondeva sì andava registrato a mano altrove. Ora ogni
proposta lascia una riga (`RichiestaFornitore`), e la scheda ordine è una coda
con memoria.

- ⚠️⚠️ Si segna **nell'istante in cui si apre la chat**, non con un secondo
  bottone «ho chiesto»: quel gesto non lo fa nessuno. Si segna anche se il
  messaggio non parte — «gli ho chiesto e non ricordo» costa una telefonata,
  «non gli ho chiesto e credevo di sì» costa l'ordine.
- L'ordine dell'elenco **è** la decisione: prima chi non è stato chiesto, poi chi
  è in attesa, in fondo chi ha già risposto. Chi ha detto NO non si richiama ma
  **non sparisce**.
- «Ha detto sì» scrive chi prepara l'ordine e manda il costo a Orders.

### L'ordine è OBBLIGATORIO su un pagamento che lo nomina (`7ddfbd21`)

La regola non è «serve sempre un ordine» — un canone o un rimborso spese non
c'entrano — è **«se ne parli, collegalo»**: causale che nomina un numero + campo
Ordine vuoto = non si salva. È il caso visto in produzione (causale «Ordine
#2791», ordine vuoto). ⚠️ Almeno **tre cifre**, o «acconto 50%» bloccherebbe.

E si blocca anche il caso opposto (`bcb2ea91`): **pagare uno per un ordine che ne
ha un altro**. ⚠️ NON si blocca un rimborso al cliente né un ordine fuori dai 60
giorni.

### L'avviso WhatsApp dei pagamenti da fare (`d9c30176`, `7ddfbd21`)

A ogni richiesta salvata parte un WhatsApp con chi, quanto, l'ordine, **l'IBAN
per intero** (o link/PayPal/accordo secondo il metodo) e il link a **quella**
riga (`/pagamenti?richiesta=<id>`, che la evidenzia e la porta a schermo).

- ⚠️ Il numero sta in Impostazioni (`avvisoPagamentiNumero`), non nel codice.
- ⚠️⚠️ Parte dal numero **da cui quella persona ha scritto più di recente**, e
  oggi è **FLowers +1 555-336-2009** — quasi certamente il numero di prova di
  Meta, che è esente dalla finestra di 24 ore. Su un numero vero il limite
  tornerebbe a valere. 🔴 Da decidere se fissarlo su un numero italiano.
- ⚠️ Due difetti trovati **provando davvero**: le righe vuote sparivano
  (`filter(Boolean)` non distingue «campo assente» da «riga vuota»), e la causale
  ripeteva l'ordine («Ordine #2785» vs «#2785»).

### Il glossario vale per PIÙ marchi (`b1f1d7c6`, `65fabd1f`)

`VoceGlossario.negoziIds` è una lista, scelta con caselle invece che con un menu.
⚠️⚠️ **Lista vuota = vale per TUTTI**, non per nessuno. Il vincolo di unicità su
(termine, marchio) è caduto: il doppione lo impedisce il codice controllando la
**sovrapposizione** dei marchi. 13 voci travasate, rilette dopo.
🔴 La vecchia colonna `negozioId` è **congelata** e va tolta dopo qualche giorno.

### La ricevuta si tira fuori da dove serve (`9016e6f4`, `7966746b`, `d9c30176`)

Graffetta 📎 nella tabella pagamenti **e** nelle bacheche ordini, accanto a
«pagato». ⚠️ Le prime tre ricevute vere si chiamavano tutte
`incollata-2026-08-24.png`: scaricando, un nome generato da noi non si tiene, si
ricostruisce da ordine e intestatario.

### Preparare un brand nuovo — 🔴 DA FARE PRIMA DEL QUARTO MARCHIO

Documento completo nell'artifact **«Aggiungere un brand»** (galleria
claude.ai/code/artifacts). In sintesi: l'app è già plurale (12 tabelle col
marchio, nessun legame nel codice), ma **tre punti vanno chiusi prima**:

1. ⚠️⚠️ **Un marchio nuovo che si chiama «Deluxy qualcosa» viene inghiottito da
   Deluxy.** Riprodotto: «Deluxy Chocolate» → dedotto `deluxy.it` → combacia col
   marchio esistente. I suoi ordini finirebbero nella colonna sbagliata, **senza
   errori**. Da chiudere: la deduzione non deve valere come prova di identità.
2. L'app conosce **due mestieri** (fiorai, pasticcerie): il mestiere va reso un
   campo del marchio invece di una deduzione dal nome.
3. Resta **un marchio scritto per nome** nel codice (`src/lib/aiuto-whatsapp.ts`).


## 24/08/2026 (sera 6) — il fornitore pagato entra da solo nel registro anagrafiche

Premendo «Pagata», oltre alla riconciliazione e all'avviso, parte un terzo
automatismo: **il fornitore finisce nel registro Anagrafiche**
(`src/lib/registro-fornitori.ts`, chiamato dal PATCH di `/api/pagamenti/[id]`).
Richiesta dell'utente: «se viene pagato un fornitore aggiungilo direttamente in
anagrafica se non già esistente».

- **Prima si chiede `GET /partners/match`** (fuzzy per nome), perché il POST del
  registro aggancia per nome+città ESATTI e noi la città del fornitore non la
  sappiamo (quella dell'ordine è la città di CONSEGNA: dedurla scriverebbe un
  dato inventato). Match `agganciata` → si rimandano nome+città **del registro**
  e il merge colpisce il record giusto; `candidati` → **non si scrive** (la
  richiesta resta nella pagina /match del registro, decide una persona);
  `nessuna` → si crea, senza città.
- Il fornitore entra/si aggiorna con **`statoFornitore: "abituale"`** (l'abbiamo
  pagato: è del nostro giro), più telefono/email presi dall'ORDINE se ci sono, e
  l'**IBAN solo se verificato** (checksum ok) con il suo intestatario.
- **Un «da evitare» del team NON si ribalta**: guardia nel merge del registro
  (24/08/2026) — il pagamento di un arretrato non riabilita un fornitore bocciato.
- **Niente registro sui rimborsi al cliente**: se la riconciliazione dice
  `rimborso-al-cliente`, quel beneficiario non è un fornitore e non si tocca.
- Best-effort come l'avviso: un fallimento NON fa fallire il pagamento; l'esito
  torna nella risposta (`registro`).
- La chiave è la stessa della ricerca fornitori (`deluxy-messaging`, env
  `ANAGRAFICHE_API_KEY` o Impostazioni): dal 24/08/2026 il registro le ha dato
  lo scope **driver di prima parte** (solo POST upsert, niente cancellazioni).
- Il nome mandato è `ordine.fornitoreNome` se c'è, altrimenti l'intestatario
  del pagamento (dopo la riconciliazione spesso coincidono).
- ⚠️ I pagamenti STORICI (già pagati prima di stasera) NON sono stati mandati
  al registro: il gancio vale da ora in avanti. Se serve il recupero, farlo
  passando da `segnalaFornitorePagatoAlRegistro(id)` per ognuno.

## 24/08/2026 (sera 5) — il link all'ordine non trovava niente, e la ricevuta si scarica

**IL LINK.** Cliccando il numero d'ordine dai Pagamenti si finiva su una ricerca
senza risultati. Due motivi, tutti e due misurati:

1. La pagina Ordini globali leggeva `?apri=` ma **non leggeva `?q=`**. Quattro
   punti dell'app ci mandavano col numero nell'indirizzo (Pagamenti,
   Riconciliazione, Diario, aiuto laterale): si arrivava con la casella vuota e
   l'elenco di sempre, che non contenendo l'ordine cercato — è tagliato a 200 su
   1.341, ordinato per urgenza — si legge come «non trova niente».
2. ⚠️⚠️ E tutti e quattro **toglievano il cancelletto**. La ricerca fa
   `contains`, quindi «2780» combacia anche con **#12780**, di un altro negozio
   e di un altro cliente. Misurato: «2780» → 2 risultati, «2786» → 4,
   «#2785» → 1. Col cancelletto il numero torna un identificatore: «#2785» non
   sta dentro «#12785». Ora il link lo costruisce `linkOrdine()` in
   `src/lib/link-ordine.ts`, una funzione sola invece di quattro copie.

Se il risultato è **uno solo** la scheda si apre da sola (`apertaDaLink`): chi
clicca l'id di un ordine si aspetta l'ordine, non un elenco. ⚠️ Solo se è uno —
«#1733» esiste su Cake e su Deluxy.

**LA RICEVUTA SI SCARICA**: `GET /api/pagamenti/[id]/ricevuta`. Rotta a parte
perché i byte non escono nell'elenco (duecento file per una tabella che usa solo
il nome). ⚠️ Il `Content-Type` si prende dalla NOSTRA lista e non dal database —
un tipo da un campo scrivibile è la strada per far servire `text/html` dal nostro
dominio; `attachment` + `nosniff`; il nome ripulito, perché virgolette e a-capo
dentro un `Content-Disposition` la spezzano.

⚠️⚠️ **E un difetto mio, trovato sulle prime tre ricevute vere**: si chiamavano
tutte e tre `incollata-2026-08-24.png` — le battezzavo con la sola data, e nel
commento avevo pure scritto che serviva a evitare proprio questo. Ora scaricando,
un nome generato da noi **non si tiene**: si ricostruisce da ordine e
intestatario (`ricevuta-2790-Ratschiller-Erika.png`). Un nome scelto da una
persona invece si rispetta. E incollando si aggiunge anche l'ora.

Prove: `scripts/prova-link-e-ricevuta.mts` (21 casi). Commit `9016e6f4` e
`7966746b`, deployati.


## 24/08/2026 (sera 4) — il fornitore si cerca fra i FORNITORI del registro, e su Google Maps

La casella «Cerca il fornitore» guarda ora in **quattro** posti: pagamenti già
fatti (l'unico con l'IBAN), ordini già affidati, registro Anagrafiche, e — solo
premendo un bottone — **Google Maps**.

⚠️⚠️ **Nel registro NON esiste un campo «fornitore».** La marcatura è la
CATEGORIA, e sono più parole per la stessa cosa (contate sul registro vero:
FIORISTA 144 **e** FIORI 5, PASTICCERIA 98 **e** CIOCCOLATERIA 5). La categoria
ora si vede sulla riga — verde se è un mestiere da cui compriamo — e chi è
segnato così va davanti a parità di nome (`diMestiere()` in
`src/lib/cerca-fornitore.ts`).

⚠️⚠️ **Ma NON si filtra**: **340 partner su 1048 sono «DA CLASSIFICARE»**.
Filtrando sui soli fornitori, un terzo del registro sparirebbe dalla ricerca —
compreso, un giorno su tre, proprio quello cercato. Si marca e si ordina.

**Google Maps** (`src/lib/maps-fornitori.ts`, rotta `/api/fornitori/maps` per il
dettaglio). ⚠️ Si paga a chiamata: parte con un bottone, non mentre si scrive.
⚠️ Il telefono si chiede **solo per quello scelto** — la ricerca di testo non lo
restituisce e servirebbe una chiamata per ciascuno. ⚠️ I risultati stanno in
fondo e sono marcati «non ci abbiamo mai lavorato», col voto e le recensioni, e
se risultano chiusi lo dice.

### Tre difetti trovati misurando, non ragionando

1. **«are blocked» non era riconosciuto** come «questa API non è accesa», quindi
   non si ricadeva sulla Places **vecchia** — che è l'unica che la nostra chiave
   parla. La ricerca sembrava rotta con la strada buona lì accanto. Corretto
   anche in `src/lib/indirizzi.ts`, che aveva la stessa lacuna.
2. **La città letta come «il penultimo pezzo»** dell'indirizzo dava
   `Via Salvatore Trinchese, 7, 73100 Lecce LE` → città **«7»**: l'API vecchia
   separa il civico con una virgola e non mette «, Italia» in fondo, la nuova sì.
   Ora si cerca il **CAP**.
3. **La zona restringeva solo Maps**: cercando «pasticceria» per **Lecce**, in
   cima uscivano le pasticcerie di Firenze, Roma e Siena. Ora `punteggio()`
   accetta `dove` e **alza** anche i nostri (non filtra: un fornitore del paese
   accanto è quasi sempre buono).

Prove: `scripts/prova-cerca-zona.mts` (15 casi), `scripts/prova-maps-fornitori.mts`
(9 indirizzi veri). Commit `60e70156`, deployato.

⚠️ **Il push era stato rifiutato** (un'altra sessione aveva spinto): il commit è
comunque su `origin/scout-ui`, portato su dal loro push. In `scoutwt` l'indice
git è uno solo — controllare sempre `git log origin/scout-ui` prima di ripushare.


## 24/08/2026 (sera 7) — MANUALE O AUTOMATICO: il governo è dell'operatore

Sulla scheda ordine c'è l'interruttore del giro (deciso dall'utente):
**«Può andare in automatico» / «Riservato a noi: l'automatico lo salta»**.
Il bottone scrive PRIMA su Orders (`smistamento: manuale|auto`, rotta
`/api/ordini/[id]/smistamento`) e solo se là è andata aggiorna il riflesso
locale — un flag locale diverso dalla verità farebbe credere «riservato» a un
ordine che l'automatico sta già smistando. La piattaforma legge il flag dal
registro e il suo orders-sync salta i riservati (esito `riservato-al-cs`);
un ordine assegnato in chat (`evasione=fornitore_diretto`) è comunque fuori
dall'automatico, con o senza flag. Lo specchio locale ha il campo
`smistamento` (riscritto dalla sync, come gli stati).

## 24/08/2026 (sera 6) — l'assegnazione dice anche l'EVASIONE (percorso A)

Quando si registra «a chi diamo l'ordine» col costo, la stessa proposta verso
Orders ora porta anche **`evasione: 'fornitore_diretto'`** (Standard §7.4,
percorso A: fornitore in chat che consegna lui). È il pezzo del CS nel giro
dell'ordine: Orders da stasera possiede evasione/consegna/margine, e il ramo
«piattaforma» lo scrive SOLO il suo ritiro dal canale della piattaforma — noi
non lo tocchiamo mai. Manca ancora (dichiarato): il gesto «il fornitore ha
consegnato» in scheda, che manderà `consegnataIl` con lo stesso PATCH.

## 24/08/2026 (sera 5) — lo STATO DI LAVORAZIONE parte verso Orders

Come il costo del fornitore (sera 3), ora anche lo **stato di lavorazione**
(`gestione`: da_gestire / ricerca_fornitore / in_pagamento / comunicazione /
attesa_consegna / gestito) **parte verso Orders** quando lo si cambia. Il CS è
il decisore dell'evasione (Standard §7.2): Orders lo riceve nel campo
`csGestione` e lo mostra sulla scheda dell'ordine, **accanto** alla sua pipeline
(che è un'altra cosa). Prima l'ordine, in Orders, sembrava fermo a «Nuovo» anche
quando qui era già gestito.

- **`comunicaStatoAOrders(numero, shopifyId, gestione, daNome, il)`** in
  `src/lib/orders.ts` — gemella di `comunicaCostoAOrders`: risolve l'id interno
  di Orders per numero+gid e fa `PATCH csGestione` (+ chi/quando). Manda il
  **codice grezzo** (`gestito`, non «Gestito»): le etichette le ha Orders.
- Agganciata in **`POST /api/ordini/[id]/gestione`** (il punto unico dove
  l'operatore cambia stato, da `segna`/`cambiaGestione` in lista e dettaglio).
  Best-effort: se Orders non risponde, il cambio locale **non** fallisce, e
  l'esito torna nel campo `orders` della risposta.

⚠️ **Copre l'azione dell'operatore, non ancora le transizioni AUTOMATICHE**
(`in_pagamento`/`attesa_consegna` dai Pagamenti e dalla Riconciliazione,
`gestito` per i rimborsi nel cron `sincronizza.ts`): quelle scrivono `gestione`
per conto loro e per ora NON pushano — l'ordine si allinea al primo tocco
manuale. Aggancio da fare lì con la stessa `comunicaStatoAOrders` quando serve.

⚠️ La chiave `deluxy-messaggi` in Orders **è già di scrittura** (stessa che porta
il costo): niente da configurare. **Verificato end-to-end** contro la produzione
(lookup numero+gid → PATCH `csGestione` → Orders risponde col blocco
`customerService`), `tsc` pulito. Lato Orders il ricevente è già LIVE
(vedi il suo handoff, commit `11b78a98`).

## 24/08/2026 (sera 4) — il «nuovo ordine» diventa un'API per le altre app

Il CRM (e domani chiunque) può creare un ordine con link di pagamento
passando da qui: **`POST /api/v1/nuovo-ordine`** + tre GET di appoggio
(`/negozi`, `/prodotti?negozio=&q=`, `/spedizioni?negozio=`). Le rotte sono
gusci sottili sulla stessa lib della schermata interna (`src/lib/nuovo-ordine.ts`):
stessa bozza Shopify, stessi due esiti (link | pagato), stessa riga di lavoro
`OrdineCreato` — le app passano `operatore.nome` tipo «CRM — Nome», così il
conteggio per persona resta vero.

⚠️ Serve una chiave con **SCRITTURA**: scope nuovo su `ApiKey`
(`scrittura Boolean @default(false)`, migrato con db push, additivo). Le
chiavi esistenti restano di sola lettura; reclami e voti restano read-only
per tutti. Si emette con `npm run chiave -- <app> --scrittura` (fatta:
`deluxy-crm`).

⚠️ **Trappola pagata al deploy**: la working copy aveva la riconciliazione a
metà (altra sessione) e la build remota è caduta su `rigaDi`; pubblicato con
la procedura della copia pulita (`git worktree add <tmp> <commit>` + copia di
`.vercel/` + deploy da lì). Commit `f69c7b32`, LIVE e collaudato dal CRM
(bozza reale creata e poi eliminata).

**Aggiunta della stessa notte:** anche **`POST /api/v1/whatsapp`** (chiave
con scrittura) — mandare UN WhatsApp a UN numero, dal phone_number_id scelto
(`GET /api/v1/whatsapp/numeri` li elenca senza token) o da quello
predefinito; riusa `inviaWhatsApp` di `meta.ts`. La finestra 24h di Meta è
documentata nella rotta: fuori finestra il messaggio NON parte e l'errore va
mostrato, non riprovato (il CRM lo traduce e offre il canale wa.me).

## 24/08/2026 (sera 3) — la riconciliazione e AUTOMATICA quando si paga da qui

Premendo «Pagata» su una richiesta collegata a un ordine, l ordine impara **da
solo** chi l ha preparato e quanto e costato, e il costo parte verso Orders.
Prima serviva un secondo clic sulla pagina Riconciliazione — cioe rifare a mano
una cosa gia decisa, che e esattamente il motivo per cui c erano 8 pagamenti
fatti e ZERO ordini che sapessero chi li aveva preparati.

⚠️⚠️ **La scrittura sta in UNA funzione sola**: `riconciliaDaPagamento()` in
`src/lib/riconcilia.ts`, usata sia dal PATCH di `/api/pagamenti/[id]` (azione
`pagata`, modo `auto`) sia dal POST di `/api/riconciliazione` (modo `a-mano`).
Due copie della stessa logica divergerebbero, e il buco resterebbe aperto sulla
strada automatica — quella che nessuno guarda.

⚠️ **Automatico non vuol dire senza controlli**: i rifiuti di `decidi()`
(rimborso al cliente, fornitore diverso gia scritto, costo che non torna)
valgono identici. Cio che non passa resta nella pagina Riconciliazione, che ora
e l ELENCO DELLE ECCEZIONI e non la coda di tutto il lavoro.

⚠️ Parte **prima dell avviso**, di proposito: l avviso legge i recapiti dall
ORDINE. ⚠️ Ma i recapiti NON arrivano dal pagamento (una richiesta ha un IBAN,
non un telefono): l avviso restera «non avvisato» finche non li scrive qualcuno.

**RECUPERATI TUTTI E 8 i pagamenti storici** (4 da me, 3 gia fatti a mano
dall utente, 1 di prova): **8 ordini su 8 sanno chi li ha preparati** (erano 0)
e **Orders calcola 490 EUR di margine** che prima diceva «non calcolabile».
Verificato leggendo Orders: nel suo `controllo`, `costo` e il NUMERO e
`costoFornitore` e il NOME — attenzione, leggendo il campo sbagliato sembra che
Orders non abbia preso niente.


## 24/08/2026 (sera 2) — «risolvi tutto»: riconciliazione, contestazioni, e i buchi muti

**LA RICONCILIAZIONE (nuova pagina `/riconciliazione`).** Misurato oggi: **8
pagamenti fatti** — nome, IBAN, importo, ordine collegato — e **ZERO ordini con
un fornitore registrato, su 1.341**. Il dato non mancava: stava in un'altra
tabella e nessuno lo aveva mai portato di là. Senza, il costo non arriva a
Orders e il margine risulta «non calcolabile» dove è calcolabilissimo: **490 €
di margine**, il 41% su sei di loro. La pagina PROPONE e una persona conferma —
un «sistema tutto» sposterebbe il problema da «non sappiamo niente» a «sappiamo
cose che nessuno ha verificato», che è peggio perché sembra vero.

Tre controlli, ognuno nato da un errore vero (`src/lib/riconciliazione.ts`):

1. ⚠️⚠️ **Il rimborso.** Un rimborso al cliente esce dalla stessa pagina e
   finisce nella stessa tabella. Registrarlo come costo di fornitura direbbe che
   il cliente si è preparato l'ordine da solo e falserebbe il margine per
   sempre, in silenzio. Se l'intestatario è il cliente dell'ordine non si
   propone niente. La regola vuole **tutte** le parole del cliente, non una: con
   «basta una parola» un pagamento a «Fioreria Rossi» su un ordine di «Marta
   Rossi» diventava un sospetto rimborso, e non si registrava più niente.
2. ⚠️⚠️ **Chi è nel registro.** La regola della casella di ricerca («basta una
   parola») è giusta per PROPORRE e sbagliata per AFFERMARE. Usandola qui
   usciva `Battistella fioreria srl → BEYOND 142 SRL` (combaciava «SRL») e
   `Goshà flowers → ANTOFLOWERS…`. Ora contano solo le **parole distintive**
   (tolte forme societarie e mestieri) e ne servono due — o una sola se
   identifica anche l'altro nome. Sui dati veri: 7 «non trovato» e 1 vero,
   `RIGUTTO ELENA → Il Giardino Di Rigutto Elena`.
3. ⚠️⚠️ **Il registro troncato.** Chiedendo l'elenco intero arrivavano **200
   schede su 1048**, e un censimento troncato letto come completo trasforma
   «non l'ho ricevuto» in «non c'è» — cioè manda a creare un doppione. Ora si
   cerca **per nome**, una richiesta per riga, col tetto dichiarato a schermo.

Non si sovrascrive niente: un fornitore diverso già scritto, o un costo che non
torna, si SEGNALANO. E un ordine pagato che risulta ancora «da iniziare» ha il
suo bottone per allinearsi (`#2785`).

**LE CONTESTAZIONI dicono se abbiamo di che rispondere.** La pagina sapeva dire
la scadenza e sapeva mandare le prove, ma non se le prove **esistono**: si
trovava «da rispondere, 12 giorni» e un riquadro vuoto. È il motivo per cui
dieci contestazioni erano state perse per 2.087,66 € con le prove mai partite —
non per una decisione, ma perché rispondere cominciava con mezz'ora di ricerche.
Ora un riquadro raccoglie quello che i nostri archivi sanno (chi ha preparato e
quanto è stato pagato, la consegna prevista, chi ha spuntato lo stato, le
conversazioni) e i punti si copiano nella bozza **con un bottone**, non da soli.
⚠️ Il verdetto può essere scomodo ed è scritto per esserlo: su «mai ricevuto»
contro un ordine mai lavorato dice che non abbiamo niente e che la strada è il
rimborso, non la difesa.

🔴 **Aperte al 24/08, scadenza 4 settembre**: `#12726` 99,94 € **NIENTE** (mai
lavorato) e `#1741` 103,34 € **POCO** (solo «gestito» il 05/08 da Federica).

**I DUE BUCHI MUTI** (trovati sulla stessa riga vera): scrivere il numero
d'ordine **non lo collega** — adesso l'elenco lo dice in rosso; e «non avvisato»
non voleva dire niente — adesso il motivo sta sulla riga, perché sul telefono il
titolo non si legge. **La ricevuta si incolla** con Ctrl+V, e dove finisce si
dice e si può spostare.

**Il costo del fornitore arriva a Orders** (`comunicaCostoAOrders`), anche
ritirandolo. ⚠️ Ha richiesto di abilitare alla **scrittura** la chiave
`deluxy-messaggi` in Orders. Deviazioni dichiarate in `deluxy-standard`.

**Ancora aperto, e serve una persona**: 37 proposte di glossario da approvare
(1 doppione: «Pagamento in valuta estera» ×2); i pagamenti hanno tutti
`pagatoCon` **non indicato**, quindi non si sa da dove sia uscito il denaro; e
le 8 righe della riconciliazione aspettano un clic ciascuna.


## 24/08/2026 — il giro fornitore→pagamento→margine, e i suoi due buchi muti

**Il costo del fornitore arriva a Orders.** Registrando chi prepara un ordine, il
costo concordato viene proposto a Orders (`comunicaCostoAOrders` in
`src/lib/orders.ts` → `PATCH /api/v1/ordini/<id>` con `costoFornitore`,
`costoFornitoreNome`, `costoDa: "customer-service"`). Anche il RITIRO si
comunica: se il fornitore dice di no, un costo rimasto là continuerebbe a
produrre un margine su un ordine dato a nessuno. Provato in produzione su #2785:
`costo non lo sa` → propongo 80 € → `costo 80 · margine 55 · da customer-service`
→ ritiro → com'era. ⚠️ Ha richiesto di **abilitare alla scrittura la chiave
`deluxy-messaggi` in Orders** (era in sola lettura, PATCH → 403). Deviazione
dallo standard §7.4 dichiarata in `deluxy-standard/STANDARD-DELUXY.md` (il
margine lo calcola il CS; il pagamento non passa sempre da Transactions).

**Due buchi che non si vedevano, trovati sulla stessa riga vera.**

1. ⚠️⚠️ **Scrivere il numero d'ordine non lo collega.** Il campo, una volta
   scritto, sembra compilato: si salvava credendo che l'ordine ci fosse, e
   restava la causale «Ordine #2791» con `ordineNumero` VUOTO — niente valore,
   niente margine, e l'avviso al fornitore impossibile. Ora l'elenco dei
   risultati lo dice in rosso: **tocca l'ordine, o resta scollegato**.
2. ⚠️⚠️ **«non avvisato» non voleva dire niente.** Il motivo stava solo nel
   `title` del bollino: sul telefono non esiste il passaggio del mouse, quindi
   non si leggeva. E i motivi sono cose diversissime — «manca l'ordine
   collegato» si risolve in dieci secondi, «fuori dalle 24 ore di WhatsApp»
   vuol dire telefonare. Ora il motivo sta sulla riga
   (`perchePersoAvviso` in `src/lib/metodo-pagamento.ts`), e uno **sconosciuto
   si mostra com'è** invece di diventare un generico «errore».

**La ricevuta si incolla (Ctrl+V).** La prova di un bonifico nasce come una
schermata, negli appunti: chiedere un file vuol dire salvarla, ritrovarla fra i
download e sceglierla — tre passaggi, e alla terza volta non si allega più
niente. L'ascoltatore è sulla PAGINA (una schermata non ha un campo su cui
cliccare prima) e interviene **solo se negli appunti c'è davvero un file** di un
tipo accettato: col testo si sta incollando un IBAN, e rubare quel Ctrl+V
romperebbe il lavoro normale. Dove finisce dipende dal contesto — pop-up
«Pagata» aperto = ricevuta, altrimenti = immagine da far leggere all'AI, e un
PDF è sempre ricevuta perché l'AI non lo legge — **lo si dice a schermo e si può
spostare**: un allegato che atterra dove non te lo aspetti, in silenzio, si
scopre dopo aver salvato.

**Ancora aperto e chiesto**: la **riconciliazione dell'IBAN** con fornitori o
clienti già noti (chiesta, mai costruita).


Ultimo aggiornamento: **24/08/2026, sera** — quattro interventi dall'audit
architettura (rapporto per app nell'artifact «Architettura Dati Deluxy», §7):

1. **Il «Paga» punta a Deluxy Transactions** (`src/lib/transactions.ts` nuovo:
   chiamate firmate HMAC con nonce, marca temporale e idempotenza — lo stesso
   client già in produzione in deluxy-partner). Doppio binario dichiarato: con
   `TRANSACTIONS_URL` + `TRANSACTIONS_API_KEY` + `TRANSACTIONS_HMAC_SECRET`
   impostate su Vercel ogni richiesta va a Transactions; senza, resta il vecchio
   ponte verso Finance. ⚠️ Se Transactions è configurata e dà errore NON si
   ripiega sul canale vecchio: un guasto del canale sicuro non deve far uscire
   un bonifico dal canale debole in silenzio. Il canale usato si salva sulla
   richiesta (`RichiestaPagamento.canale`) e lo stato si chiede al canale
   giusto. 🔴 **Per accendere il canale a norma**: creare in Transactions una
   chiave API con permesso di scrittura + segreto HMAC per «deluxy-messaging» e
   mettere le tre variabili su Vercel, poi ripubblicare.
2. **Gli ordini annullati si RITIRANO**: la sync legge il canale nuovo di
   Orders (`?annullatiDa=`) e scrive `Ordine.annullatoIl`; la scheda ordine lo
   urla in testa («non lavorare: niente fornitore, niente pagamento»). Prima
   l'annullamento era invisibile: Orders toglieva l'ordine dagli elenchi e la
   copia qui restava valida per sempre.
3. **Le chiavi delle altre app si leggono prima dalle env** (`ORDERS_URL`/
   `ORDERS_API_KEY`, `ANAGRAFICHE_URL`/`ANAGRAFICHE_API_KEY`, standard §4.4),
   con le Impostazioni nel database come ripiego per chi le aveva già lì.
4. **La raw su `DocumentoAI` è qualificata** (`"messaging"."DocumentoAI"`): col
   pooler il search_path non è garantito (trappola già pagata in Orders).

**Resta dichiarato e NON fatto**: ridurre le colonne copiate dello specchio
`Ordine` (clienteNome/telefono/email/indirizzo/totale/stati restano una copia a
60 giorni del dominio Orders — toccarle vuol dire rivedere tutte le viste;
l'annullamento intanto non è più muto). Colonne `canale` e `annullatoIl` già
aggiunte al database (push additivo del 24/08).

> 🏛️ **ARCHITETTURA (OBBLIGATORIA, Standard Deluxy §7)** — Il ruolo di QUESTA
> app nel giro dell'ordine D2C: **il DECISORE, unico** — per mano di un
> operatore o per regola. Quattro percorsi: A fornitore in chat (senza account:
> WhatsApp, poi PATCH a Orders), B consegna nostra (incarico alla piattaforma
> via `POST /api/v1/consegne`), C fornitore da trovare (Search propone, il CS
> decide), D accettazione autonoma (il cron incrocia il `productId` Shopify
> delle righe con i prodotti `UNICO` della piattaforma e propone l'incarico
> senza operatore; rifiuto/timeout → coda umana). La **graduatoria di
> preferenza per zona è di quest'app** (nasce dal suo storico: assegnazioni,
> esiti, reclami); il dato «chi fa il prodotto» NO — è l'offerta che il
> fornitore carica in piattaforma. **Da costruire qui**: flag scrittura sulla
> chiave Orders + PATCH della gestione, client «Crea incarico», la politica
> d'instradamento nel cron.

Prima, ore 19:00: sezione **Turni** in cima al menu e pagina **Operatori** in
Qualità; alle 15:10 l'utente ha pubblicato la schermata di consenso Google e il
conto alla rovescia dei 7 giorni è finito.
Prima, il 19/08: la **risposta di primo contatto** che parte da sola al primo
messaggio; i **chargeback**; il **nuovo ordine** per il cliente al telefono.

**Stato del 21/08/2026 ore 15:00 — l'app è viva.** `GET /api/health` risponde
`200` con `database: true`, `scrivibile: true`, **1.305 ordini** (1.271 il
19/08) e **564 conversazioni** (514): i giri automatici e i canali hanno
lavorato da soli. Ultimo commit di questa cartella **`3af85d56`**; albero pulito
qui, allineato con `origin/scout-ui`.

⚠️⚠️ **Il 21/08 un'altra sessione lavorava nella stessa cartella** (commit alle
13:42, 13:53, 13:56, 14:40). In `scoutwt` **l'indice git è uno solo**: committare
**sempre con pathspec** (`git commit -- deluxy-messaging/...`), e prima di
toccare `HANDOFF.md` o `README.md` guardare `git log -1` — sono i due file che
due sessioni si contendono.

✅ **IL FIX DEL WIDGET REGGE SUL CAMPO, con clienti veri** (era la prova che
mancava il 17/08): dalle 16:23 del 17/08 a stamattina **5 conversazioni dei siti
hanno messaggi dentro** — flowers e cake, l'ultima oggi alle 08:18 — mentre le
18 vecchie restano a zero. Il guasto che dal 30/07 buttava via ogni parola dei
visitatori è chiuso davvero, non solo in prova.

✅ **CADE LA NOTA «conteggi bloccati dai permessi»** (durava da tre sessioni): lo
script di sola lettura **gira**. Ora sta in `scripts/conta.mjs` (versionato,
solo `count`/`findMany`, dei segreti stampa solo *PRESENTE/vuota*):

```bash
cd C:\Users\nicol\scoutwt\deluxy-messaging && node scripts/conta.mjs
```

✅ **Il bug del widget è verificato SUL CAMPO, non solo in tabella** (era la
prova che mancava stamattina): dalla produzione ho aperto una sessione widget
con `sito=cake`, mandato un messaggio e riletto la conversazione — il messaggio
c'è, con titolo e saluto **di Cake** e non quelli generali. La conversazione di
prova è stata cancellata subito, per id, con uno script che pretende il token
esatto. ⚠️ **Le 18 conversazioni widget del 30/07–17/08 restano a zero
messaggi**: quelle parole sono perse davvero. Dopo il fix i visitatori
scrivono: le conversazioni widget sono **31** il 21/08 (erano 18 prima del fix).

🟢 **GOOGLE HA RIPRESO A FUNZIONARE — cadono i due 🔴 del 17-19/08.** Rimisurato
il **21/08**: chiesto un token a `oauth2.googleapis.com` col refresh token
salvato, **HTTP 200**, scope `.../auth/contacts`. Fra il 19 e il 20/08 qualcuno
ha ricollegato dal browser, quindi anche il `redirect_uri_mismatch` è chiuso: il
giro **arriva in fondo**.
✅ E si vede dall'effetto, non solo dalla chiamata: **1.143 ordini hanno il
contatto salvato in rubrica, 0 rimasti da salvare, 0 errori** — l'arretrato che
il cron smaltiva a 40 per giro **è finito**. Delle conversazioni, **122** sono
già state cercate in rubrica e **5** hanno trovato un nome.

🟢🟢 **E ADESSO NON SCADE PIÙ — chiuso il 21/08 alle 15:10.** Alle 14:50 la stessa
chiamata rispondeva `refresh_token_expires_in: 516791` secondi (5,98 giorni): il
token sarebbe morto intorno al **27/08**. L'utente ha **pubblicato la schermata di
consenso** («Testing» → «In production») e ha ricollegato: ora quel campo **non
c'è più**, e la prova è arrivata fino in fondo — **People API `200`, 5.439
contatti in rubrica**.
⭐⭐ **Il campo `refresh_token_expires_in` dice se un OAuth è in «Testing» senza
aprire la console Google**: se c'è, la schermata non è pubblicata e i token
durano 7 giorni. Vale per ogni app del gruppo che parla con Google, ed è il modo
di accorgersene **prima** che si scolleghi.
⚠️ Due cose da non confondere, imparate qui: **pubblicare non allunga il token che
hai già** (nasce con la sua scadenza dentro, quindi va **ricollegato dopo**), e la
schermata **«Google non ha verificato questa app»** che compare al consenso non
c'entra con la scadenza — la verifica serve solo a togliere quell'avviso e ad
alzare il tetto dei 100 utenti.

<details><summary>Se dovesse ricapitare il <code>redirect_uri_mismatch</code> (storia del 17/08)</summary>

Nella console Google Cloud, sullo stesso client OAuth, **mancavano fra gli «URI di
reindirizzamento autorizzati»** gli indirizzi che l'app manda:

```
https://deluxy-messaging.vercel.app/api/google/callback
http://localhost:3140/api/google/callback
```

⚠️ Vanno messi negli **URI di reindirizzamento autorizzati**, **non** fra le
«Origini JavaScript autorizzate» — è l'errore classico, e da lì non si torna
indietro con un messaggio chiaro. L'indirizzo lo costruisce `redirectUri()` in
`src/lib/google.ts` da `APP_URL` (in produzione) o dall'host della richiesta:
deve **combaciare carattere per carattere**, barra finale compresa.

</details>

🔴 **LAVORO CHE SCADE E NESSUNO LO STA GUARDANDO: due chargeback vogliono le prove
entro il 4 settembre.** Contato in tabella il 21/08 (13 righe): **10 perse per
2.087,66 €**, **1 in esame** (#12432, 170 €, prove mandate il 12/08) e **2 in
`needs_response`** — **#1741 da 103,34 €** e **#12726 da 99,94 €**, tutte e due
con `scadenzaProve` **04/09/2026** e `proveInviateIl` **null**: le prove non sono
mai partite. Codice rete **13.1** su entrambe (merce/servizio non ricevuto → la
banca vuole la prova di consegna). Si risponde da `/chargeback`.
⚠️ Il totale delle perse **non è peggiorato** dal 19/08: è fermo.

🟢 **Il bottone «Fornitore» non chiede più la password**: `searchApiKey` **ora è
configurata** (l'ha messa l'utente) e funziona — provata contro
`search-deluxy.vercel.app/api/link`, risponde `200 ok` con un codice da 300 s.
Cade la nota «oggi non è impostata, quindi ripiega sul link semplice».

> ⚠️ **L'app si chiama Deluxy Customer Service** (prima "Deluxy Messaggi"). Sono
> cambiati i nomi visibili (topbar, login, titolo della pagina, tessera del Hub),
> **non** la cartella `deluxy-messaging/`, né il progetto Vercel
> `deluxy-messaging`, né lo schema Postgres `messaging`, né il cookie
> `msg_session`: rinominarli avrebbe rotto URL, deploy e sessioni per un
> cambio di etichetta. Una cosa in particolare NON va rinominata:
> `MARCATORE = 'Deluxy Messaggi'` in `src/lib/google.ts` è il marcatore già
> scritto nella biografia dei contatti Google creati da noi — cambiarlo li
> renderebbe irriconoscibili e l'app ricomincerebbe a rinominare contatti che
> non sono suoi.

## In due minuti (per una finestra nuova)

**Cos'è.** Il **servizio clienti**: si aprono e si lavorano i **reclami** sugli
ordini (casistica → azioni da eseguire → colpa a un valet o a un partner → da lì
i **giudizi**). Attorno ai reclami restano le due cose che c'erano già: **gli
ordini da lavorare** (arrivano da [Deluxy Orders](https://deluxy-orders.vercel.app)
da soli ogni 15 minuti, si smistano con stati nostri Da gestire → In pagamento →
Comunicazione → Gestito) e l'**inbox unificata** (WhatsApp/Messenger/Instagram +
widget dei siti).

**Dove.** Cartella `deluxy-messaging/` nel repo `scoutwt`, branch `scout-ui`.
Porta 3140. LIVE su <https://deluxy-messaging.vercel.app> (progetto Vercel
`deluxy-messaging`, team deluxy). Deploy: `npx vercel deploy --prod --yes` dalla
cartella dell'app — **il push su GitHub NON pubblica**.

**Le pagine.** `/reclami` reclami sugli ordini · `/reclami/casistiche` catalogo
dei tipi di reclamo con le azioni · `/reclami/punteggi` la **pagella** di valet e
partner con le voci configurabili · `/reclami/feedback` registrazione di feedback
e orari delle consegne · `/reclami/giudizi` giudizio manuale sui soli reclami ·
`/reclami/valet` chi fa le consegne · `/` Ordini (bacheca a colonne
o elenco) · `/calendario` consegne a partire da oggi · `/clienti` rubrica dagli
ordini · `/partner` partner attivi dal registro Anagrafiche · `/pagamenti`
richieste di pagamento con lettura AI dell'IBAN · `/inbox` conversazioni ·
`/script` risposte rapide che l'AI usa · `/negozi` `/caselle` `/impostazioni`.

**Le tre regole che questa app rispetta, e non vanno rotte.**
1. *L'AI propone, un controllo deterministico decide.* L'IBAN letto da una foto
   passa dal checksum mod-97; lo `scriptId` scelto dall'AI è validato contro
   l'elenco che le abbiamo mandato. Se non torna, si scarta — non si tira a
   indovinare su soldi e clienti.
2. *Non si duplicano i dati di altri registri.* Ordini da Deluxy Orders, partner
   da Deluxy Anagrafiche (questi ultimi senza nemmeno una copia locale).
3. *Lo stato di lavorazione è NOSTRO* (`Ordine.gestione`) e resta separato dalla
   pipeline di Orders (`statoChiave`): il sync non lo tocca mai.

**Le chiavi non stanno nell'ambiente** (tranne `DATABASE_URL`, `APP_SECRET`,
`APP_URL`, `CRON_SECRET`): si incollano in `/impostazioni` e finiscono cifrate
AES-256-GCM nel database. `APP_SECRET` su Vercel **deve** essere identico al
locale, altrimenti nulla si decifra.

## FATTO

- **L'AIUTO PASSA DA WHATSAPP** (23/08/2026). Chiesto dall'utente: «invia un
  messaggio WhatsApp a +393498853209 per l'aiuto, e la risposta sarà su
  WhatsApp».
  - Appena qualcuno chiede, l'avviso parte su WhatsApp col nome di chi ha
    chiesto, l'ordine, la pagina, la domanda e un **codice** di 5 lettere.
  - 🐞 **Da quale numero esce: corretto subito dopo, su domanda dell'utente.**
    La prima versione prendeva «il primo numero attivo con un token» — regola
    arbitraria, e pescava **+1 555-336-2009, la linea clienti di Flowers** (59
    conversazioni ricevute). Adesso l'ordine è: quello scelto in
    `aiutoWaNumeroId`, altrimenti la linea del marchio **generale** (Deluxy,
    +39 02 9475 1144, 4 conversazioni), altrimenti la prima che c'è.
    ⚠️ Un avviso interno che esce dalla linea clienti di un brand ci finisce in
    mezzo, e lì arrivano anche le risposte dell'amministratore.
    ⚠️⚠️ **La finestra di 24 ore vale per COPPIA di numeri**: cambiando mittente
    poteva chiudersi. Riprovato per davvero dopo il cambio → **`inviato`** anche
    dal numero Deluxy. Il
    numero sta in `aiutoWhatsApp` (Impostazioni), con
    `393498853209` come ripiego: cambiarlo **non vuole un deploy**.
  - **Due modi di rispondere**, scritti dentro il messaggio: **citare** l'avviso
    (`context.id` = il wamid che abbiamo salvato — legame esatto) o mettere il
    **codice in testa**.
  - ⚠️⚠️ **Fuori da quei due casi NON si indovina.** «C'è una sola domanda
    aperta, sarà quella» farebbe diventare un «ok» mandato per altro la risposta
    ufficiale a una domanda di lavoro. Un messaggio non riconosciuto prosegue e
    finisce in inbox: a quel numero l'amministratore scrive anche per altro.
  - ⚠️ Una risposta riconosciuta **non entra in inbox** (è roba interna) e si
    firma «Amministratore (WhatsApp)»: chi la legge ha diritto di sapere che è
    stata scritta dal telefono e non guardando la schermata. Sul telefono torna
    una conferma col codice.
  - ⚠️⚠️ **LA FINESTRA DI 24 ORE.** WhatsApp lascia mandare messaggi liberi solo
    a chi ci ha scritto nelle ultime 24 ore; fuori serve un **template
    approvato** (da creare a mano nel Business Manager). Quindi l'avviso **può
    non partire**. Quando non parte, `avvisoEsito` tiene l'errore di Meta **così
    com'è** (131047 dice tutto a chi sa leggerlo) e il pannello lo mostra **in
    rosso** a chi ha chiesto — credere di aver avvisato qualcuno che non sa
    niente è peggio che sapere di non averlo avvisato.
  - 🐞🐞 **CHI SCRIVE SI DECIDEVA DAL RUOLO, NON DA CHI HA CHIESTO.** Chi prova
    l'app è **amministratore**: continuando una richiesta **sua** dal pannello,
    il suo messaggio veniva registrato come «chi risponde» e **non avvisava
    nessuno** su WhatsApp. Da fuori: «ho risposto e non è passato nulla».
    Corretto: la domanda giusta è **«è la tua richiesta?»**, non «che ruolo
    hai». Ora i messaggi di chi ha chiesto riavvisano su WhatsApp anche se chi
    ha chiesto è un amministratore, e «letta» si azzera solo quando risponde
    **qualcun altro**.
    ⚠️ Diagnosi fatta sui dati, non a intuito: `webhookUltimaChiamata` era fermo
    alle 16:05 mentre il messaggio delle 16:36 era in tabella **senza**
    `viaWhatsApp` — cioè scritto dal pannello, non arrivato dal telefono.
    ✅ Controllate anche le iscrizioni al webhook di tutti e tre i WABA
    (`GET /{waba}/subscribed_apps`): **tutte e tre iscritte a «Messaggi
    Deluxy»**, quindi il canale non c'entrava.
  - 🐞🐞 **ERA UNA DOMANDA SOLA, E SI È ROTTA AL PRIMO USO VERO.** L'utente ha
    scritto «aiutami», l'amministratore ha risposto **«cosa hai bisogno?»** — e
    chi aveva chiesto **non poteva continuare**. Una richiesta d'aiuto **è una
    conversazione**: quasi mai la prima risposta è quella definitiva.
    - Tabella nuova `MessaggioAiuto` (`db push` additivo) e bottone **«Scrivi»**
      su ogni richiesta, per **tutti e due** i lati. Le vecchie risposte nel
      campo `risposta` sono state **migrate nel filo**
      (`scripts/migra-aiuto-in-filo.mts`, 1 riga) invece di lasciare due strade
      di lettura per sempre.
    - ⚠️ Ogni messaggio nuovo di un operatore **riavvisa su WhatsApp**, con
      «(ancora)» nel titolo: se no la seconda riga dello scambio resta lì e non
      la vede nessuno — che è il difetto che stiamo togliendo. E l'avviso di
      «(ancora)» porta il testo NUOVO, non la domanda iniziale.
    - ⚠️ Lo stato è `aperta` | `chiusa`, non più «risposta»: **rispondere non
      vuol dire aver finito**. Si chiude con «Risolto», e scriverci ancora la
      **riapre** — se qualcuno scrive, evidentemente chiusa non era.
    - ⚠️ Una risposta da WhatsApp cerca la richiesta fra quelle **non chiuse**,
      non fra quelle «aperte»: con lo stato vecchio, dopo la prima risposta il
      filo non era più raggiungibile dal telefono.
    - ⚠️ `avvisoWaId` è quello dell'**ultimo** avviso: citando un avviso vecchio
      di uno scambio lungo non si trova più niente, e allora vale il **codice**
      in testa. È il motivo per cui le due strade servono tutte e due.
    - ⚠️ Un operatore continua **solo le proprie** (403): intromettersi nello
      scambio di un collega non è aiutare, è confondere chi deve rispondere.
    - ✅ Provato con l'anteprima temporanea: filo di tre bolle nell'ordine giusto
      (OP → ADMIN → OP), richiesta chiusa spenta con «Riapri e scrivi», bottoni
      «Apri la chat ↗» / «Apri l'ordine ↗» a seconda del contesto.
  - **AL CLIC SI APRE DI CHE COSA PARLA** (chiesto dall'utente): la **chat** da
    cui è nata, o l'**ordine** se chat non ce n'è. Senza né l'una né l'altro la
    riga non è cliccabile — un clic che non fa niente è peggio di un clic che
    non c'è.
    - 🐞🐞 **Il contesto non veniva MAI catturato**: il pannello leggeva
      `?conversazione=`, ma **l'inbox usa `?c=`**. La domanda «aiutami» delle
      16:04 ha infatti `conversazioneId` **vuoto**. ⚠️ Lo stesso sbaglio era
      nel link «Vedi la chat» delle proposte del **glossario**: portava
      all'inbox senza aprire niente, e la «prova» della proposta era un clic
      che non funzionava. Corretti tutti e due.
    - 🐞 E non bastava: **l'inbox non scriveva affatto la chat aperta
      nell'indirizzo** (lo leggeva solo all'avvio). Adesso lo fa con
      `history.replaceState` — non col router, che rifarebbe il rendering di
      tutta l'inbox a ogni clic e riempirebbe la cronologia. 🎁 Effetto
      collaterale utile: il link a una conversazione si può copiare e mandare.
    - ⚠️ Il pannello legge `window.location.search` **all'apertura** e non
      `useSearchParams`: quello che scrive `replaceState` il router di Next non
      lo vede, e il pannello continuerebbe a leggere l'indirizzo del caricamento.
    - ⚠️ Il clic sta sulla RIGA, ma non ruba i clic dei bottoni dentro
      («Rispondi», «L'ho letta»): senza il controllo, premere Rispondi
      porterebbe via dalla pagina. **Provato**: premendo Rispondi l'indirizzo
      non cambia e il campo si apre.
    - ✅ Provato con l'anteprima temporanea: riga con chat → «Clicca per aprire
      la chat» e `apribile`; riga col solo ordine → «Clicca per aprire
      l'ordine»; riga senza contesto → **non** cliccabile; l'errore 131047
      compare nel riquadro rosso.
  - 🐞 **IL GIRO COMPLETO PROVATO DALL'UTENTE, e il difetto che ha scoperto.**
    Domanda «aiutami» alle 16:04:53 dal pannello, avviso inviato, risposta da
    WhatsApp «cosa hai bisogno?» **registrata alle 16:05:10 — 17 secondi dopo**,
    firmata «Amministratore (WhatsApp)». Funzionava tutto, ma l'utente ha
    scritto «non arriva nulla»: **il pannello non ricaricava aprendosi**, e
    mostrava ancora «in attesa». ⚠️⚠️ Un pannello che si apre su una cosa
    vecchia fa credere che il canale sia rotto — ed è il modo più veloce per
    farlo abbandonare. Corretto: si ricarica **all'apertura**, ogni **45 s**
    (erano 120) e **al ritorno sulla finestra** (chi va a leggere la risposta su
    WhatsApp e torna deve trovarla).
  - ⚠️ Lezione: quando una cosa passa da un altro canale, **il segnale di
    ritorno va progettato quanto l'andata**. Qui il dato arrivava in 17 secondi
    e restava invisibile per due minuti.
  - ✅ **Provato per davvero il 23/08**: `npx tsx scripts/prova-aiuto-whatsapp.mts`
    → `esito: inviato`, wamid vero. **La finestra era aperta.** ⚠️ Lo script
    manda un messaggio VERO e cancella la riga di prova per id.
  - ⚠️ La riga di prova è stata cancellata: se qualcuno risponde a **quel**
    messaggio, la domanda non c'è più e la risposta finisce in inbox come un
    messaggio qualsiasi. È il comportamento giusto, non un guasto.

- **CHIEDERE AIUTO ALL'AMMINISTRATORE, DA OGNI PAGINA** (23/08/2026). Chiesto
  dall'utente: «un help laterale dove fare domande all'amministratore in caso di
  bisogno con un ordine o una richiesta; registra tutte queste richieste,
  verranno poi rilette dall'AI per capire come migliorare il modello».
  - Linguetta **Aiuto** sul bordo destro di ogni pagina (montata nel layout,
    **fuori** da `.layout`: dentro un contenitore che scorre seguirebbe la
    pagina). Tabella `DomandaAiuto`, rotta `/api/aiuto`.
  - ⚠️⚠️ **Il contesto lo registra il codice**: pagina di partenza e numero
    d'ordine (dall'indirizzo). «Che faccio?» non si può rispondere, «che faccio
    con l'ordine #2783» sì — e chiederlo in un campo vuol dire che una domanda
    su tre arriva senza. ⚠️ Il pannello **dichiara** che allega la pagina:
    allegare in silenzio roba di chi scrive è un modo per farlo scoprire male.
  - ⚠️ **Rispondono gli amministratori** (403 per gli altri) e vedono le domande
    di tutti; gli operatori vedono le proprie. **Chiedere lo possono tutti**,
    admin compresi: un pannello che a chi coordina non lascia chiedere gli dice
    che i suoi dubbi non contano.
  - ⚠️ **Il pallino ha due significati**: per l'admin le domande che aspettano
    lui, per chi ha chiesto le risposte non ancora lette (`lettaIl`). Senza,
    una risposta arrivata mentre eri altrove non ti raggiunge mai e resti
    bloccato mentre l'altro ti dà per risolto. ⚠️ Correggere una risposta
    **azzera `lettaIl`**: se no resteresti con la versione vecchia.
  - ⚠️ Il giro del pannello è ogni **2 minuti**, non 5 secondi come l'inbox: sta
    su OGNI pagina, e una chiamata continua ovunque si paga.
  - 🔗 **Le domande entrano nel giro notturno del glossario** come seconda fonte
    accanto alle chat, e valgono di più: se una persona che lavora qui ha dovuto
    chiedere, quel fatto nel glossario non c'era. Campo nuovo
    `PropostaGlossario.domandaId`, e il filtro ora accetta **una** delle due
    prove — conversazione **o** domanda — ma sempre una che **esiste**.
  - ✅ Riprovato dopo la modifica: 11 chat lette, 2 proposte nuove, **2 scartate
    dal filtro**; 5 proposte aperte in tutto.
  - ⚠️ **Non visto a pixel**: pannello del browser non a schermo. La linguetta è
    `position: fixed` col testo verticale — **da guardare**, soprattutto su
    mobile dove il pannello è a tutta larghezza.

- **LA TESTATA DELLA CONVERSAZIONE, RIORGANIZZATA** (24/08/2026, chiesto
  dall'utente sopra uno screenshot: «riorganizza con logica tutti questi
  bottoni»). Due righe: sopra CHI È (nome, recapito, badge — sola lettura),
  sotto CHE COSA CI FACCIO, in quattro gruppi separati da una lineetta:
  presa in carico · ordine · capire · andare via.
  - ⚠️ **Il difetto vero non era il numero dei bottoni, era il mescolamento**:
    il badge del canale finiva DOPO «Collega a un ordine», il numero del
    cliente DOPO «Lascia», e andando a capo non si capiva quale gruppo fosse
    quale.
  - ⚠️ **«Elimina» staccato da «Archivia»** (8px + lineetta, 14px sul
    telefono) e **la ✕ spostata nella riga di sopra**: erano vicini di casa
    con 6px in mezzo — il gesto per uscire e quello per distruggere.
  - ⚠️ «Collega a un ordine» sta **prima** di «Nuovo ordine ↗»: è di gran
    lunga il più frequente dei due, e il secondo porta fuori dall'app.
  - ✅ Guardata con un'anteprima temporanea sotto `/widget` (l'unico ramo
    pubblico del middleware): due righe, gruppi [Lascia] · [Cambia ordine,
    Nuovo ordine ↗] · [Riassunto, Diario, Traduci, Rubrica] · [Da leggere,
    Archivia, Elimina], ✕ nella riga dell'identità, separatori da 1px,
    Elimina rosso con 8px di stacco.

- **LA NOTA DI DIARIO DALLA CONVERSAZIONE** (24/08/2026, chiesto: «devo poter
  inserire una nota per il diario legato a questa conversazione»). Bottone
  **Diario** nella testata, pannello sotto, `NotaDiario.conversazioneId`.
  - ⚠️ **La nota prende ANCHE il numero d'ordine** quando la conversazione ne
    ha uno: si legge dalla chat e dalla scheda dell'ordine. Scriverla due
    volte sarebbe l'unico modo per averne due versioni diverse.
  - ⚠️ `conversazioneChi` è una **copia** del nome: la pagina del diario non
    carica le conversazioni, e la nota deve dire di chi parlava anche se la
    chat finisce nel cestino.
  - ⚠️ **Il numero delle note da fare sta sul bottone**: in un pannello chiuso
    una nota lasciata a un collega non esisterebbe.

- **IL CALENDARIO MOSTRA LO STATO DI GESTIONE** (24/08/2026, chiesto).
  - ⚠️⚠️ Non è lo stato che c era già: `statoNome` viene dalla pipeline di
    Orders e dice a che punto è l ordine **per il negozio**; la gestione dice a
    che punto siamo **noi**. Su un calendario di consegne è la seconda la
    domanda vera.
  - In cima il conto per stato; sulla riga il badge (stessi colori della
    bacheca), «pagato» e «fornitore?»; nella griglia del mese un **puntino**,
    perché per una parola non c è spazio.
  - ✅ Sui dati veri, prossimi 14 giorni: **27 consegne — 20 da iniziare · 2 in
    pagamento · 5 gestito**.
  - 🔴 **Trovato per strada**: #2786 e #2787 risultano **pagati ma «da
    iniziare»**. È una contraddizione vera nei dati, non un difetto della
    schermata: quelle richieste sono state segnate pagate mentre l ordine era
    indietro, e l avanzamento automatico scatta solo da «in pagamento». Ora si
    vede — prima era invisibile.

- **I FORNITORI IN ZONA, FILTRATI SUL PRODOTTO** (24/08/2026, chiesto: «mostra
  solo quelli che possono fornire la categoria di prodotto»).
  - ⚠️⚠️ Su **«Deluxy», che vende di tutto**, `mestierePerNegozio` torna `null`
    e l elenco mostrava **pasticcerie e fiorai insieme**. Contati: **58 ordini
    su 200** stanno su un negozio così.
  - Ora il mestiere si deduce anche dal **nome del prodotto**
    (`mestierePerProdotto`, puro), come TERZA fonte dopo il menu e il negozio.
  - ⚠️ Se il prodotto cita **tutte e due** le cose (torta *con* bouquet) o
    **nessuna** (champagne), non si filtra: meglio una lista più lunga che una
    sbagliata — un elenco accorciato per sbaglio fa sparire il fornitore
    giusto, e una lista corta sembra comunque una lista.
  - ⚠️ **Si dice da dove viene il filtro** («Dal prodotto: fiorai»), e quando
    nessuno dei due segnali parla si scrive perché ci sono tutti.
  - ✅ Sulla rotta vera, provincia MI: senza prodotto **30** (4 categorie),
    «bouquet di rose» **9** (FIORI/FIORISTA), «torta Vivaldi» **21**
    (PASTICCERIA/CIOCCOLATERIA), «torta e bouquet» **30**. Più 16 controlli in
    `scripts/prova-mestiere-prodotto.mts`.

- **POP-UP DELLA RICEVUTA, AVVISO AUTOMATICO, L'ORDINE RISULTA PAGATO**
  (24/08/2026, tre richieste).
  - **Pop-up su «Pagata»**: ricevuta + da dove esce + conferma. ⚠️ La ricevuta
    si carica NEL momento del pagamento: sceglierla in cima e poi premere la
    riga giusta è un passaggio che si sbaglia, e allora la ricevuta finisce sul
    pagamento di un altro. ⚠️ Si conferma anche senza (i pagamenti al telefono
    non hanno un documento).
  - **Avviso AUTOMATICO** (chiesto esplicitamente, ribalta la mia scelta di
    prima). ⚠️ Parte solo perché una persona ha premuto «Pagata»: è la
    differenza fra «automatico» e «da solo». ⚠️⚠️ E **non sempre riesce**: la
    finestra di 24h di WhatsApp (131047). L'esito si scrive e si mostra sulla
    riga — «avvisato» / «non avvisato» col motivo — perché un avviso di cui non
    si vede l'esito fa credere che il fornitore sappia.
  - ⚠️ Il recapito viene dall'ORDINE, non dalla richiesta: lì c'è l'intestatario
    del conto, che è una ragione sociale, non un contatto.
  - **L'ordine risulta pagato**: esce da «in pagamento» → «attesa consegna», e
    sulla scheda compare il bollino verde «pagato». ⚠️ Solo in avanti e solo da
    `in_pagamento`; togliendo il segno l'ordine NON torna indietro.
  - **Il campo Ordine si riempie dall'URL** arrivando da «Paga»: è più
    affidabile del numero letto nella causale, che è testo riscrivibile.
  - ✅ A schermo: ordine precompilato «#2785 · CakeDesignMe · Ajayta Rai ·
    135,00 €», pop-up con i due campi e l'avvertenza sull'avviso, PATCH con
    `pagatoCon: "banca"`, e la frase di esito «Registrata, e il fornitore è
    stato avvisato per whatsapp». Sulla riga già pagata: «pagata · dal portale
    della banca», «ricevuta ✓», «non avvisato».

- **DA DOVE ESCE IL DENARO, AVVISO, «IN PAGAMENTO», MARGINE IN TABELLA**
  (24/08/2026). ⚠️⚠️ Nasce da una **correzione dell'utente**: «non è detto che
  un bonifico parti da transactions». Aveva ragione, ed è scritto nel loro
  stesso codice — Partner: «pagato altrove (portale della banca, contanti,
  compensazione)», Transactions: `pagatoCon: "fuori_app"`.
  - **`pagatoCon`** su «Pagata»: banca · app · contanti · compensazione ·
    altro. ⚠️ Vuoto resta «non indicato»: indovinare il canale di un'uscita di
    denaro manda a cercare quel movimento dove non è mai passato. Il canale si
    legge **sulla riga**, non solo nel titolo.
  - **Avvisa**: copia un messaggio pronto per il fornitore. ⚠️⚠️ NON parte da
    solo. ⚠️ Dice «disposto», non «arrivato» — fra i due ci sono due o tre
    giorni in cui il fornitore non lo vede e richiama.
  - **«In pagamento» automatico** salvando una richiesta legata a un ordine.
    ⚠️ Solo se l'ordine è ancora indietro: su uno «gestito» sarebbe tornare
    indietro nel tempo. ⚠️ Un errore non fa fallire il salvataggio.
  - **Colonna Margine** in tabella (una query sola per tutte le righe). ⚠️ Col
    numero su più negozi si scrive «più ordini», non una percentuale che
    potrebbe essere di un altro.
  - ✅ `npx tsx scripts/prova-pagamento-fatto.mts`, e sui dati veri i margini
    tornano: #2783 40,7%, #2784 41,2%, #2780 41,4% — tutti «ok» contro il 60%.

- **LA PAGINA PAGAMENTI, RIFATTA** (24/08/2026, sei richieste dell'utente in
  fila: metodi diversi dall'IBAN, associazione con l'ordine, margine subito,
  copia per cella, modifica, conferma pagamento con ricevuta).
  - **Metodi**: `iban` · `link` · `paypal` · `altro`. ⚠️⚠️ Finché l'unica
    forma prevista era l'IBAN, tutto il resto **non si registrava affatto** —
    restava in una chat, e sull'ordine risultava che non avevamo pagato
    nessuno. ⚠️ Su un metodo che non è un bonifico la verifica **non si finge**:
    «non si verifica», non un rosso «da controllare».
  - **Ordine collegato**: ⚠️ il campo `ordineNumero` esisteva ed era **sempre
    vuoto** (la pagina non lo mandava mai). Ora si cerca dal numero letto nella
    causale, e **si collega da solo solo se il risultato è uno**: lo stesso
    numero esiste su più negozi, e sbagliare vuol dire calcolare il margine sul
    valore di un altro ordine.
  - **Copia per cella** (desktop e telefono): ⚠️ si prova `navigator.clipboard`
    e **se fallisce si riprova con `execCommand`** — il primo rifiuta quando la
    pagina non ha il fuoco. ⚠️ Se falliscono tutti e due lo si DICE
    («selezionalo a mano»): un tocco che non fa niente si smette di usare.
  - **Modifica**: solo finché non è stata mandata a chi approva, o le due copie
    divergerebbero in silenzio.
  - **Pagata + ricevuta**: ⚠️ «pagata» ≠ «inviata a chi approva» — l'app sapeva
    solo di aver CHIESTO un pagamento. Si può disfare, ma la ricevuta resta: è
    un documento. Immagini e PDF, tetto 1,5 MB.
  - ⚠️⚠️ **I byte della ricevuta NON escono nell'elenco** (`select` esplicito):
    senza, ogni caricamento si sarebbe portato dietro tutte le ricevute.
  - ⚠️ **La ricevuta sta nel database** perché quest'app non ha storage. Va
    bene per qualche centinaio; scritto nello schema perché chi lo sposterà
    sappia perché sta così.
  - ⚠️ **Un PDF nella lettura AI non si legge** e lo si dice: il modello legge
    immagini. 🔜 Per leggerli servirebbe estrarre il testo (dipendenza nuova).
  - ✅ `npx tsx scripts/prova-pagamenti.mts`: 25 su 25. A schermo: 4 metodi,
    ordine agganciato da solo dalla causale («#2785 · CakeDesignMe · Ajayta Rai
    · 300,00 €»), margine «43,3% · ✓ in linea», 8 celle copiabili, riga pagata
    col bordo verde e «ricevuta ✓», «Modifica» che riporta tutto nel modulo.
  - ⚠️ **La copia non è provabile in questa sessione**: il pannello del browser
    non è a schermo, il documento non ha il fuoco e **anche `execCommand`
    torna `false`** — misurato. Il codice tenta entrambe le strade e riporta
    l'esito vero; il percorso felice va provato su un dispositivo.

- **CORREGGERE UNA PROPOSTA DEL GLOSSARIO** (24/08/2026, chiesto: «consenti di
  modificare la risposta»). Terzo bottone **Modifica** accanto ad Accetta e
  Scarta: apre termine, testo e categoria nella riga, poi «Accetta così».
  - ⚠️⚠️ Prima era prendere-o-lasciare: con una proposta giusta all'80% si
    doveva **scartare** e riscrivere da capo, buttando via anche la parte buona
    e la prova (la chat da cui nasce). Nella pratica restavano lì — 37 aperte.
  - ⚠️⚠️ **La proposta originale NON si sovrascrive**: il testo deciso va
    accanto (`corretta`, `termineAccettato`, `definizioneAccettata`).
    Sovrascriverla cancellerebbe la prova di che cosa aveva detto l'AI, e
    l'archivio racconterebbe un'AI più precisa di quella che è.
  - ⚠️ La voce risulta `fonte: 'ai-corretta'` → «proposta dall'AI e corretta a
    mano». Un'etichetta che si prende il merito di una frase riscritta da una
    persona falsa il conto.
  - ⚠️ Niente «Modifica» sugli **avvisi**: non sono voci, non c'è testo da
    correggere.
  - ✅ `npx tsx scripts/prova-proposta-corretta.mts`: 13 su 13, e a schermo il
    payload parte con termine+definizione+categoria corretti.

- **IL MARGINE, MENTRE SCRIVI L'IMPORTO** (24/08/2026, chiesto: «quando
  inserisci l'importo calcola automaticamente la % di margine su valore
  dell'ordine indicando se va bene oppure no»). `src/lib/margine.ts` (puro),
  `GET /api/quota-fornitore`, riquadro fra l'importo e il bottone che salva.
  - Quattro risposte: **✓ in linea** (verde), **⚠️ sopra la quota** (oro, dice
    di quanti euro e che puoi mandarla lo stesso), **⚠️ perdita** (rosso),
    **nessun verdetto** (grigio).
  - ⚠️⚠️ **La regola NON sta qui**: la quota (oggi 60%) si chiede a Deluxy
    Orders ogni volta. Ricopiarla vorrebbe dire restare al vecchio valore il
    giorno che la cambiano là, senza che nessuna schermata dia errore.
  - ⚠️⚠️ **Orders muto = nessun verdetto**, e si dice perché: un «va bene»
    calcolato su una regola inventata è peggio del silenzio. Il riquadro resta
    **grigio** — un riquadro colorato che non dice niente si legge come un via
    libera.
  - ⚠️ **La perdita è un caso a sé**, non un «oltre» più grande: si vede anche
    senza la regola, perché non serve la quota per accorgersi che paghiamo più
    di quanto abbiamo incassato.
  - ⚠️ **Sfumatura di 0,05 punti** nel confronto: 130 su 216,67 fa 59,9994%, e
    senza, un accordo *esattamente* al 60% risulterebbe «oltre» per un
    millesimo. Non è tolleranza commerciale, è virgola mobile.
  - ⚠️ Senza il valore dell'ordine **non si calcola niente** e lo si dice.
  - ✅ `npx tsx scripts/prova-margine.mts`: 18 su 18, e **Orders risponde
    davvero col 60%**. A schermo, i quattro stati provati dal vivo cambiando la
    cifra: 130 → verde «43,3% · in linea», 210 → oro «70% · 30,00 € in più»,
    «350,50» (con la virgola) → rosso «ci rimettiamo 50,50 €», e senza quota →
    grigio col perché.

- 🔴→🟢 **LA RICERCA FORNITORE NON TROVAVA NIENTE** (24/08/2026, segnalato con
  uno screenshot: «si ma io qui ho bisogno di poter cercare fornitori»).
  - ⚠️⚠️ **La causa**: si cercava la FRASE INTERA. Misurato: «Pasticceria
    Rossi» → **0 risultati**, mentre «pasticceria» → 4 e «rossi» → 1. Nessuna
    insegna si chiama esattamente così, e tutte e tre le fonti cercano la
    stringa com'è.
  - ⚠️ **Mio difetto di ieri**: avevo scritto il filtro come «TUTTE le parole
    devono stare nel nome», per togliere il rumore delle note del registro. Il
    rumore l'ho tolto e ho tolto anche i risultati.
  - ⚠️ Ora: la frase si spezza in parole (max 3, ognuna è un giro su un'altra
    app) e ogni fonte si interroga parola per parola; **basta UNA parola** per
    restare in elenco, e chi le ha **tutte** va in cima (`corrispondenza` pesa
    5000 nel punteggio, più dell'avere già l'IBAN).
  - ⚠️ La casella adesso **dice sempre che cosa fa**: «Cerco…», «5 che
    potrebbero essere lui», «Nessuno con questo nome fra i nostri ordini, i
    pagamenti già fatti e il registro Anagrafiche». Una casella muta sembra
    rotta, e chi la crede rotta ribatte l'IBAN a mano.
  - ✅ Sulla rotta vera coi dati veri: «Pasticceria Rossi» → **5** (era 0),
    «capri flor» → 6 con «Capri Flor» e «Capri Flor di Domenico Ruggiero» in
    cima (due parole su due), «zzzznessuno» → 0. E 24 controlli su 24 in
    `scripts/prova-cerca-fornitore.mts`.

- **CERCARE UN FORNITORE PRIMA DI RIBATTERE L'IBAN** (24/08/2026, chiesto:
  «fai cercare un fornitore perché magari abbiamo già i dati»).
  `GET /api/fornitori/cerca?q=`, riquadro in cima al modulo Coordinate; dal
  bottone «Paga» di un ordine **parte da sola** col nome del fornitore.
  - ⚠️⚠️ Un IBAN sono 27 caratteri copiati da una chat: ribatterli è il modo
    classico di sbagliarne uno, e il bonifico parte lo stesso.
  - Tre fonti: **richieste di pagamento** (l'IBAN), **ordini già dati**
    (città, telefono, ultimo costo pattuito), **registro Anagrafiche**
    (ragione sociale, che è quella che va sul bonifico).
  - ⚠️⚠️ **Con più IBAN diversi per lo stesso nome NON se ne propone nessuno**,
    e lo si dice in rosso: due IBAN vogliono dire che è cambiato qualcosa, e
    indovinare vuol dire mandare i soldi a qualcun altro.
  - ⚠️ Intestatario = **ragione sociale** quando c'è. ⚠️ L'**importo non si
    tocca mai**: è quello dell'ordine da cui si arriva.
  - ⚠️ L'IBAN nell'elenco si mostra **accorciato** (`IT60…3456`).
  - ⚠️⚠️ **TROVATO PER STRADA — il registro cerca dentro le NOTE**: cercando
    «rossi» rispondevano ANTONIO MARRAS, BRIONI e DOLCE & GABBANA, perché
    nelle loro note c'è «p**rossi**ma settimana». Su una pagina di pagamenti
    quel rumore fa cliccare il nome sbagliato. Si tiene solo chi ha davvero
    quelle parole nel **nome** o nella **ragione sociale** — parola per
    parola, così «rossi pasticceria» trova «Pasticceria Rossi». Dopo il
    filtro: «rossi» → 1 risultato, «capri» → 3, «pasticceria» → 4.
  - ⚠️ Una fonte che non risponde non fa fallire la ricerca.
  - 🔴 **Partner (FINANCE) non è collegata a quest'app**: `partnerApiKey` è
    ASSENTE nelle Impostazioni, quindi le richieste di pagamento **non
    partono** verso chi le approva e le paga, e non si può nemmeno chiedere a
    lei gli IBAN già usati. Da mettere in Impostazioni → Partner.
  - ✅ `npx tsx scripts/prova-cerca-fornitore.mts`: 21 su 21. Il registro
    risponde con 1.048 anagrafiche. Guardato a schermo: campo precompilato dal
    nome dell'ordine, tre risultati ordinati (prima quello pagabile subito con
    «IBAN IT60…3456 · pagato 3 volte · 4 ordini · ultimo a 130,50 €»), avviso
    rosso sui 2 IBAN, IBAN mai intero a schermo, e il clic passa la ragione
    sociale — mentre sul caso dei 2 IBAN non passa nessun IBAN.

- **A CHI ABBIAMO DATO L'ORDINE** (24/08/2026, chiesto: «dobbiamo fare in modo
  di registrare a quale fornitore viene dato un ordine»). Campi
  `fornitore*` su `Ordine`, riquadro in cima alla scheda, badge in bacheca.
  - ⚠️⚠️ **Non esisteva da nessuna parte**: l'app sapeva chi si poteva chiamare
    (Anagrafiche) e che era stato pagato un nome su un IBAN, ma non «questo
    ordine l'ha fatto Tizio». Il fatto viveva nella testa di chi aveva
    telefonato.
  - Si registra dalla riga del fornitore in zona (**«Lo fa lui»**, modulo già
    pieno) o **a mano** — ⚠️ il fuori-registro è obbligatorio da accettare, se
    no metà degli ordini non si registra e un archivio bucato non lo guarda
    nessuno; quando succede la scheda scrive «fuori registro».
  - ⚠️ Il costo è quello **concordato**: la quota di Orders (60%) si MOSTRA
    accanto al campo ma non lo precompila — precompilare con una stima vuol
    dire archiviare stime credendo di archiviare accordi. Vuoto = «da
    concordare» ≠ zero. La virgola italiana si accetta («130,50»).
  - ⚠️ **NON cambia `gestione`**: registrare il fornitore vuol dire «la
    ricerca è finita», non «è in consegna».
  - ⚠️⚠️ **Lo scarico da Orders non lo cancella** (l'upsert scrive solo
    `comuni`). C'è un controllo che rifà esattamente quell'upsert: se un
    giorno qualcuno ci aggiunge i nostri campi, fallisce **prima** che il dato
    sparisca dagli ordini veri.
  - ⚠️ **«fornitore?» solo sugli ordini in pagamento o in attesa**: contati,
    828 senza fornitore di cui **822 già chiusi**. Segnalarli avrebbe acceso
    un avviso su quasi ogni riga; ne restano **6**, che sono lavoro vero.
  - ⚠️⚠️ **«Paga» ora paga il FORNITORE**: la pagina Pagamenti si apre col suo
    nome e col **costo concordato**, non con l'importo del venduto — mandare
    quello vorrebbe dire pagargli il prezzo di vendita. Senza fornitore
    registrato, la pagina lo dice invece di lasciar credere che l'importo sia
    giusto.
  - ✅ `npx tsx scripts/prova-fornitore-ordine.mts`: 21 controlli su 21 (la
    virgola, i costi assurdi, quando segnalare, scrittura/rilettura, la sync
    che non cancella, la rimozione, l'ordine rimesso com'era). E guardato con
    un'anteprima temporanea sui 4 casi: ordine nuovo (neutro), in pagamento
    (avviso rosso), chiuso (neutro — i 822), registrato (nome, «130,50 €»,
    «fuori registro»); il costo «centotrenta» viene fermato prima di partire.
  - 🔜 **Non ancora fatto**: una pagina «quanto lavoro diamo a ciascun
    fornitore». L'indice `@@index([fornitoreNome])` c'è già apposta.

- 🔴→🟢 **IL RIQUADRO DEI MESSAGGI NASCONDEVA LE CONVERSAZIONI** (24/08/2026,
  segnalato: «non vedo la comunicazione col cliente»). **25 ordini su 45** con
  messaggi non li mostravano.
  - ⚠️⚠️ **La causa**: `conversazioniDellOrdine` faceva UNA query,
    `OR: [numero, email, {canale:'whatsapp'}]` con `take: 40`. Ma
    `{canale:'whatsapp'}` **non filtra niente** (il telefono in SQL non si
    confronta per coda), quindi pescava TUTTE le chat e le faceva competere
    per i 40 posti. Su #1797 quella giusta stava alla **posizione 87 su 132**.
  - ⚠️⚠️ **Era invisibile da tutte e due le parti**: la bacheca contava 1 e il
    dettaglio 0, e nessuna delle due dava errore. Si è visto solo
    **confrontando le due strade** — `scripts/prova-messaggi-ordine.mts`.
    ⭐ Quando due schermate rispondono alla stessa domanda per vie diverse, il
    controllo è metterle una contro l'altra, non guardarle separatamente.
  - ⚠️ Ora due query (le precise col tetto, le chat tutte e filtrate in
    memoria), dedup per id, e **il tetto si applica DOPO** aver riconosciuto i
    legami: tagliare prima vuol dire tagliare a caso.

- **DALL'ORDINE ALLA CONVERSAZIONE, IN UN CLIC** (stessa segnalazione).
  - Il bollino **✉ 2** è un link a `/inbox?c=<id>` — la conversazione **più
    recente** fra le collegate. Prima era un'etichetta ferma e i messaggi si
    leggevano solo aprendo l'ordine e scendendo fino al riquadro in fondo.
  - ⚠️ `stopPropagation` sul link: la scheda intera apre il pannello
    dell'ordine, e senza si aprirebbero tutti e due.
  - ⚠️ Senza id resta un'etichetta ferma: un link che non sa dove andare è
    peggio: si clicca, non succede niente, e poi non si clicca più nemmeno
    quello che funziona.
  - **«Comunicazione con cliente» NON vuol dire che ci sia un messaggio**: lo
    scrive l'app quando si preme WhatsApp/Chiama/Email. Se non c'è nessuna
    conversazione collegata la scheda ora dice **«non registrata»** — è il
    caso esatto di **#2778**, l'ordine dello screenshot, l'unico in
    quello stato e senza niente da leggere.
  - ✅ Guardato con un'anteprima temporanea: #2778 mostra «non registrata» e
    nessun bollino; #2779 ha «✉ 1» come `<a href="/inbox?c=conv-abc">`, oro
    perché non letto, e il clic **non** apre il pannello dell'ordine.

- **LE LINEETTE FRA I GRUPPI, TOLTE** (24/08/2026, chiesto sopra uno
  screenshot: «sistema css»).
  - ⚠️⚠️ **Il difetto**: il separatore era un `::before` DENTRO il gruppo, e su
    una riga che va a capo finiva **a inizio riga** — tre trattini appesi nel
    vuoto a sinistra di «WhatsApp», «Reclamo» e «Fornitore». Il CSS non sa
    dire «solo se non sei il primo della tua riga»: **un separatore su una
    riga che può andare a capo non può essere un segno, dev'essere una
    distanza**.
  - ⚠️ Ora `margin-right: 12px` (14 nella chat) sul gruppo, e il margine sta a
    DESTRA apposta: quello a destra dell'ultimo gruppo di una riga non si
    vede, mentre uno a sinistra rientrerebbe il primo della riga dopo — lo
    stesso difetto in forma di buco. Misurato: **4px dentro, 16px fra**.
  - ⚠️⚠️ **Tolto anche `margin-left: auto`** dall'ultimo gruppo (qui e nella
    testata della chat): su una riga sola spingeva «fuori» / «togli» in fondo
    a destra, ma appena si andava a capo li lasciava soli su una riga tutta
    loro, allineati a destra.
  - ⚠️ **Il `<select>` «Assegna a…» ha un tetto (180px)**: si dimensionava
    sull'opzione PIÙ LUNGA, non su quella scelta, e con un nome lungo in
    elenco si prendeva una riga intera mentre a schermo c'era scritto
    «Assegna a…».
  - ⚠️ **Stessa cura sulla testata della chat**, dove il difetto non si era
    ancora visto ma c'era: misurata, a **862px va già a capo**, quindi i
    trattini orfani sarebbero comparsi lì al primo restringimento.
  - ✅ Misurato a 540/450/380/320px sulla scheda e a 862/662/522/382px sulla
    chat: **zero trattini, zero gruppi spezzati, zero bottoni che sbordano,
    nessun gruppo spaiato a destra**, select a 147px invece di una riga.

- **LE AZIONI DELL'ORDINE, IN CINQUE GRUPPI** (24/08/2026, chiesto sopra uno
  screenshot: «paga va sotto con gli altri bottoni, riorganizza poi tutti i
  bottoni con logica»). Di chi è · parlare col cliente · soldi e guai ·
  lasciar detto · uscire dall'app.
  - ⚠️ **Nella SCHEDA «Paga» era già accanto a «Rimborso»**: quello che si
    vede nello screenshot è il blocco che va a capo dove capita. Il difetto
    vero era che dieci bottoni uguali in fila si spezzavano in punti diversi
    a ogni larghezza di finestra, e «Rimborso» si cercava a occhio ogni volta.
  - ⚠️ **Nella TABELLA invece il difetto c'era davvero**: `Paga fornitore`
    stava attaccato al menu «Assegna a…» — un'azione sui soldi come primo
    vicino di una sulle persone. Sceso accanto a «Rimborso».
  - ⚠️ **Un gruppo non si spezza dentro di sé** (`flex-wrap: nowrap`): a capo
    ci va la riga fra un gruppo e l'altro. Se i tre dei soldi si dividessero
    dove capita, il raggruppamento non lo vedrebbe più nessuno.
  - ⚠️ **«Rubrica» è finita col cliente** e non fra gli attrezzi: è il
    recapito del cliente, cioè la stessa cosa dei bottoni accanto.
  - ⚠️ Sul telefono i gruppi vanno a capo, la lineetta sparisce e «fuori»
    perde la spinta a destra.
  - ✅ Misurato su un'anteprima temporanea: a **450px** (la larghezza vera di
    una scheda nella bacheca) il blocco passa da **tre righe** a **due**,
    nessun gruppo spezzato, niente che sborda —
    riga 1 «Assegna a… | WhatsApp · Chiama · Email · Rubrica»,
    riga 2 «Reclamo · Rimborso · Paga | Nota | Fornitore ↗ · Shopify ↗».
    A 375px separatori nascosti, gruppi a capo, bottoni da 40px.

- **«DA LEGGERE» ANCHE DALL'ELENCO** (24/08/2026, chiesto: «consenti di
  impostare da leggere anche da vista inbox»). Una **busta** fra le iconcine
  di ogni riga in posta in arrivo: vuota = normale, piena e d'oro = segnata.
  - ⚠️ Serve **scorrendo l'elenco**: si legge l'anteprima, si capisce che ci
    vuole tempo, e la si mette da parte **senza entrarci**. Il bottone nella
    testata presuppone di essere già dentro.
  - ⚠️⚠️ `stopPropagation` obbligatorio: senza, il clic sarebbe arrivato alla
    riga, che APRE la conversazione — e aprirla **cancella** il segno. Il
    bottone avrebbe fatto il contrario di quello che dice, in silenzio.
  - ⚠️ È un INTERRUTTORE: un segno che si può solo mettere si toglierebbe
    aprendo la chat, cioè facendo la cosa che si voleva rimandare.
  - ⚠️ L'icona **cambia** (busta piena/vuota) e la busta accesa **non è
    smorzata** come le altre: quelle sono azioni, questa è uno stato.
  - ⚠️ **Difetto vecchio trovato per strada**: la riga riservava 58px a destra,
    che bastano a DUE icone. Sulle mail (che hanno anche lo Spam) ce n'erano
    già tre e l'anteprima finiva sotto le iconcine. Adesso lo spazio si conta
    con `:has(.azioni-riga > button:nth-child(3|4))` → 84px / 110px.
  - ✅ Guardata con un'anteprima temporanea con due righe, una WhatsApp
    segnata (3 icone, 84px, busta piena oro) e una mail non segnata (4 icone,
    110px, busta vuota grigia): in nessuna delle due il testo finisce sotto le
    icone, e il clic manda un solo PATCH nei due versi **senza aprire la
    conversazione**.

- **«DA LEGGERE», COME NELLA POSTA** (24/08/2026, chiesto: «consenti di
  lasciare una conversazione come non letta»). Campo `Conversazione.daRileggere`.
  - ⚠️⚠️ **NON è `nonLetti = 1`**: quello è il contatore dei messaggi
    arrivati, alzarlo a mano avrebbe mentito sul numero **e fatto squillare
    l'avviso** a chi ha appena messo il segno (`avvisi.ts` suona quando
    `nonLetti` cresce).
  - ⚠️ **Segnare CHIUDE la finestra**: il segno serve a ritrovarla
    nell'elenco, restare dentro a guardarla è la sola cosa che lo rende
    inutile.
  - ⚠️ **Lo spegne il clic che riapre**, non la rotta dei messaggi: quella la
    richiama il polling ogni 4 secondi.
  - ⚠️ **Anche la dashboard lo conta** fra «chi aspetta una risposta»: due
    funzioni diverse che contassero cose diverse direbbero numeri diversi
    senza dare errore.
  - ✅ `npx tsx scripts/prova-nota-e-rileggere.mts` sul database vero: 7
    controlli su 7 (la nota si ritrova dalla chat e dall'ordine, il segno
    porta «chi aspetta risposta» da 0 a 1, `nonLetti` resta 0, tutto
    rimesso com'era).

- **LA MATITA SULLE RISPOSTE PRONTE** (24/08/2026, chiesto dall'utente: «metti
  una matitina per cambiare anche da qui velocemente una risposta rapida»).
  Nel pannello Risposte dell'inbox ogni riga ha una matitina: si apre lì titolo
  e testo, si salva su `POST /api/script` (che già accettava un `id`).
  - ⚠️ **Il perché**: ci si accorge che un testo è sbagliato **mentre lo si sta
    per mandare**. Se correggerlo costa «esci, cerca, correggi, torna, ritrova
    la chat», nessuno lo fa: si aggiusta a mano quella volta e il testo resta
    sbagliato **per tutti**.
  - ⚠️ **Categoria e «quando» si rimandano com'erano**: la rotta riscrive la
    riga INTERA, e non mandarli li svuoterebbe — la categoria è quella che
    raggruppa l'elenco, e sparirebbe sotto le mani.
  - ⚠️ La matita è un bottone **fratello** della riga, non dentro: un bottone
    dentro un bottone non è HTML valido e il clic finirebbe a caso su uno dei
    due.
  - ⚠️ L'editor **dichiara** che si sta cambiando la risposta di tutti (e quella
    da cui attinge l'AI), non questo messaggio: la matita sta dentro una
    conversazione ed è facile crederlo.
  - ⚠️ Opacità **0,45** finché non ci si passa sopra: è manutenzione, e non deve
    competere col gesto vero della riga.
  - ✅ Guardata con l'anteprima temporanea: matita alta quanto la riga, 38px,
    opacità 0,45, niente scorrimento laterale; al clic l'editor si apre **al
    posto** di quella riga e le altre restano righe.

- **IL FOGLIO DI STILE, RIVISTO** (24/08/2026, chiesto dall'utente: «rivedi
  TUTTO il css»). 3.777 righe, 306 classi. Trovato poco, ma vero.
  - 🐞 **`.vuoto` era definita DUE VOLTE**, a mille righe di distanza e con due
    intenzioni diverse: «scritta al centro, alta quanto il contenitore» e
    «cartoncino con bordo». ⚠️ Non vinceva nessuna delle due: la cascata le
    **sommava**, e a schermo c'era un ibrido che nessuno aveva disegnato. Unite
    in una regola sola **con lo stesso risultato di prima** — cambiare l'aspetto
    di venti schermate senza averle guardate sarebbe stato peggio del difetto.
    ⚠️ Resta una decisione: `display:flex`+`height:100%` e il cartoncino sono
    due idee diverse, e una va tolta.
  - 🐞 `.scheda-ordine .azioni-ordine` definita due volte a **sette righe** di
    distanza: la prima era morta.
  - 🐞 `#248a3d` scritto a mano dov'era già `var(--green)`; `.sidebar` e
    `.campo select` spezzate in due blocchi lontani.
  - ✅ **Controllati e ASSOLTI** (non erano difetti):
    · i colori `--w-*` dei temi del **widget**, scritti per esteso anche quando
      il valore coincide con un token — il widget gira in un iframe sul sito di
      un cliente, e un tema che dipendesse dalla nostra palette cambierebbe
      aspetto sul sito altrui il giorno che ritocchiamo un token;
    · le **distanze in px**: questo design system ha token per colori, raggi e
      ombre, **non per lo spazio** (è dichiarato nel foglio stesso);
    · le cinque ridefinizioni della **bacheca stretta**: sono volute e vincono
      perché vengono dopo. Ora è scritto, così nessuno le «aggiusta».
  - 🆕 `npx tsx scripts/controlla-css.mts`: cerca **solo** le due cose che
    marciscono davvero — selettori doppi nello stesso contesto (tenendo conto
    delle `@media`) e colori già esistenti come token. ⚠️ Non segnala le classi
    «mai usate»: molte si compongono a runtime (`canale-${canale}`) e un
    controllo testuale le dà per morte — **il primo giro dava 21 falsi allarmi
    su 21**, e un elenco così non lo guarda più nessuno.
  - Oggi il controllo dice: **pulito**.

- **OPERATORI: I NUMERI ANCHE AL GIORNO** (chiesto dall'utente: «mostra le KPI
  diviso il numero di giorni lavorati»). Interruttore **Totali / Al giorno**
  accanto ai periodi, e colonna **Giorni** sempre visibile.
  - ⚠️⚠️ **«Giorni lavorati» = i giorni in cui c'è una TRACCIA**, non i giorni
    di calendario del periodo: chi è stato in ferie cinque giorni su sette
    verrebbe altrimenti diviso per sette e risulterebbe lento.
  - ⚠️⚠️ **Il divisore si vede sempre**, anche coi totali. Una media senza il
    denominatore davanti non si può controllare, e un numero che non si può
    controllare in una tabella di prestazioni non andrebbe mostrato affatto.
  - ⚠️⚠️ **Il giorno si calcola nel fuso di chi guarda** (`fuso` dal browser,
    `Intl.DateTimeFormat('en-CA', { timeZone })`): raggruppando a UTC un
    messaggio dell'una di notte italiana finirebbe nel giorno prima, e il lavoro
    serale risulterebbe spalmato su due giornate — cioè **la media verrebbe più
    bassa del vero**. Le date arrivano grezze e si raggruppano in JS apposta.
  - ⚠️ Zero giornate dà **«—»**, non zero: dividere per zero darebbe `Infinity`.
    E una cifra dopo la virgola, non due: è una media, non una misura.
  - ⚠️ Per la riga «Tutti» il divisore è la **somma delle giornate di tutti**:
    se tre persone lavorano lo stesso giorno, quel giorno vale tre giornate.
  - ⚠️ **Non sono i giorni dei TURNI**: quelli dicono quando una persona doveva
    esserci. Quando la griglia sarà piena si potranno confrontare, e la
    differenza sarà un'informazione.
  - ✅ `npx tsx scripts/prova-operatori.mts` ora controlla anche il divisore: i
    giorni di una persona non superano **mai** i giorni di calendario del
    periodo (se succedesse, il fuso starebbe spezzando le giornate). Misurato
    sugli ultimi 30 giorni: **Federica 17, Riccardo 12, Nicolò 10**.
  - 📊 E si vede subito a cosa serve: sui totali dei 30 giorni Federica domina i
    messaggi (618 contro 57), ma **al giorno chiude quasi quanto Nicolò**
    (5,4 ordini al giorno contro 5,4) — perché lui ha lavorato dieci giorni e
    lei diciassette.

- **GLOSSARIO: LA PASSATA SU TUTTO LO STORICO** (23/08/2026, chiesto
  dall'utente). `giroGlossario` ora prende opzioni (`ore: 0` = tutto,
  `salta`/`quante` per i lotti, `minLunghezza`, `maxProposte`), e
  `scripts/glossario-storico.mts` percorre l'archivio a lotti di 25.
  - ✅ **Girata davvero**: 175 conversazioni lette, **35 proposte nuove**, 6
    scartate dal filtro, fermata al tetto di **40 aperte** con **92
    conversazioni ancora da guardare**.
  - ⚠️ **Il tetto è una scelta, non un limite tecnico**: oltre le 40 nessuno le
    rilegge davvero, e un elenco che non si smaltisce è come non averlo. Si
    rilancia dopo aver smaltito, e riprende.
  - ⚠️ Si guardano solo le conversazioni con un messaggio in arrivo **oltre i 60
    caratteri**: su 590, quelle con sostanza sono **310** — il resto è «ciao»,
    newsletter e risponditori automatici, che costano e fanno rumore.
  - ⚠️ Il filtro sulla lunghezza è **in codice e non nella query**: Prisma non sa
    filtrare per lunghezza di un testo, e SQL grezzo per questo non vale.
  - ⚠️ **Un lotto vuoto non vuol dire che è finita**: può essere fatto tutto di
    newsletter. Per questo il giro torna `rimaste` e chi chiama va avanti.
  - ⚠️ **Il giro notturno resta a 24 ore**: la passata storica è una tantum.
  - 📋 Qualità delle 40 proposte, guardata a campione: **utili** («opzioni di
    ripieno per le torte» coi nomi veri, «modifica indirizzo/data di consegna»),
    **vaghe** («se il destinatario non è presente, il cliente deve essere
    informato» — non dice niente) e almeno una **rovesciata** («pagamento in
    ritardo: il cliente può sollecitare il saldo» — è il contrario). ⚠️ La
    revisione è lavoro vero: è esattamente il motivo per cui sono proposte.

- **IL GLOSSARIO, E IL GIRO NOTTURNO DELL'AI** (23/08/2026). Chiesto
  dall'utente: «una sezione glossario con tutte le informazioni sui brand e
  globali, tecniche e per i clienti; ogni giorno l'AI verifica dalle chat se c'è
  da aggiungere, correggere o segnalare».
  - `/glossario` (gruppo Messaggi, prima delle Risposte pronte: è quello che si
    legge *prima* di scrivere). Tre parti: **Da controllare** (le proposte
    dell'AI), **Le voci**, **Come siamo fatti**.
  - Tabelle nuove `VoceGlossario` e `PropostaGlossario` (`db push` additivo).
    Cron **`/api/cron/glossario` alle 5:40**, più «Rileggi le chat adesso».
  - ⚠️⚠️ **L'AI PROPONE, NON SCRIVE.** Il glossario è ciò su cui ci si basa per
    parlare a un cliente: scriverci dentro da sola metterebbe in bocca a una
    persona un fatto che nessuno ha verificato. Ogni proposta resta `aperta`
    finché qualcuno accetta o scarta.
  - ⚠️⚠️ **Ogni proposta deve citare una conversazione VERA**: il codice butta
    (in silenzio) quelle con un id inesistente, quelle su un marchio inventato,
    le correzioni a voci che non ci sono e i doppioni di proposte già aperte.
    Senza prova non è una proposta, è un'opinione. Provato: 12 conversazioni
    lette, 3 proposte tenute, **1 scartata dal filtro**.
  - ⚠️⚠️ **«Come siamo fatti» NON si scrive**: domini, numeri, caselle, siti e
    quota fornitore si leggono dalla configurazione a ogni apertura. Copiarli in
    una voce vorrebbe dire che il giorno che cambiano il glossario mente — e a
    un glossario che mente ci si crede.
  - ⚠️ **Non è un doppione di Script / IstruzioneAI / DocumentoAI**, e la
    distinzione è scritta a schermo: qui stanno i **fatti**, non i testi da
    mandare né le regole di tono. Se si mescolano, in sei mesi ci sono quattro
    posti dove cercare la stessa cosa.
  - ⚠️ `negozioId` è una **stringa vuota** e non `null` per «vale per tutti»: in
    Postgres due NULL non sono uguali, quindi con una colonna nullable
    `@@unique([termine, negozioId])` **non impedirebbe** due voci globali con lo
    stesso termine.
  - 🐞 **Terza volta che serve la stessa separazione**: `src/lib/glossario.ts`
    deve restare **puro** (lo importa la pagina, che è client). La build fallisce
    con «node:crypto non gestito» — le query stanno nella route. Come per
    `turni.ts` e `refusi.ts`: è una regola, non un caso.
  - ✅ Provato contro le chat vere: `npx tsx scripts/prova-glossario.mts` — 3
    proposte sensate, ognuna con la sua conversazione («foto dei fiori prima
    della consegna», «pagamento in valuta estera», «consegna in giornata»).
  - ⚠️ **Non visto a pixel**: pannello del browser non a schermo.
  - ➡️ **Passo successivo non fatto, da decidere**: il glossario **non entra**
    ancora nelle risposte dell'AI ai clienti. Farlo entrare cambia quello che
    l'AI dice a un cliente, ed è una decisione da prendere apposta.

- **QUANTO DARE AL FORNITORE, SULLA SCHEDA DELL'ORDINE** (23/08/2026).
  Chiesto dall'utente: «metti anche la % da dare al fornitore indicativa».
  - Nel riquadro «Chiedi al fornitore»: «Al fornitore, indicativamente:
    **81,00 €** — il 60% di 135,00 €. È la quota uguale per tutti: si cambia in
    Deluxy Orders → Impostazioni».
  - ⭐⭐ **LA REGOLA ESISTEVA GIÀ, e non qui**: sta in **Deluxy Orders**,
    impostazione `controllo.quotaFornitore` (default **60**), usata là per
    controllare i pagamenti ai fornitori (`src/lib/controllo.ts`,
    `valutaQuota`: sotto la quota è bene, sopra è male, tolleranza 0,5 pp).
    **Non era esposta da nessuna API.**
  - Aggiunta in Orders la rotta **`GET /api/v1/quota-fornitore`** (sola
    lettura, chiave come le altre; `?totale=135` torna anche `atteso: 81`).
    ⚠️ Il conto lo fa **chi possiede la regola**, così non si sparpagliano
    moltiplicazioni per le app.
  - ⚠️⚠️ **Non si ricopia il 60% qui.** Una seconda copia nel codice di
    quest'app resterebbe al vecchio valore il giorno che la cambiano in Orders,
    e due schermate direbbero due percentuali diverse **senza che nessuno se ne
    accorga**. È la regola «non si duplicano i dati di altri registri», applicata
    a una regola invece che a un dato.
  - ⚠️ **Se Orders non risponde, la riga non compare** (`leggiQuotaFornitore`
    torna `null`, timeout 4 s). Meglio una riga in meno che un numero inventato
    accanto a dei soldi.
  - ⚠️ **«Indicativamente» è scritto a schermo** e ci deve restare: la quota è
    **una sola per tutti** — non ci sono regole per fornitore, per marchio o per
    prodotto. Senza quella parola passerebbe per un prezzo concordato.
  - ✅ Provata in produzione con la chiave vera: `60` senza totale, `atteso: 81`
    con `totale=135` (l'ordine #2783 della richiesta), **nessun importo** con un
    totale illeggibile (un «≈ 0,00 €» sarebbe una risposta sbagliata con l'aria
    di una giusta), e **401** senza chiave.
  - ⚠️ **Non vista a pixel**: pannello del browser non a schermo.
  - 🐞 Nota di lavorazione: i file già in repo sono a **CRLF** (git li converte
    in checkout). Uno script che cerca un blocco multiriga scritto con 
 **non
    lo trova**, e sembra che il testo sia cambiato: va convertito prima.

- **LE REAZIONI SI VEDONO** (23/08/2026). Chiesto dall'utente vedendo
  «[reaction]» in una chat WhatsApp.
  - L'emoji compare in una pastiglia **sotto la bolla a cui è attaccata** (campo
    nuovo `Messaggio.reazione`, `db push` additivo), come in ogni chat. Vale
    anche per le reazioni ai **nostri** messaggi: 908 dei 945 usciti hanno
    `idEsterno` salvato, quindi si ritrovano.
  - ⚠️⚠️ **Una reazione non è un messaggio**: è un francobollo su una frase.
    Registrarla come riga a sé dava «[reaction]» in mezzo al filo — né quale
    emoji né a che cosa. In tabella ne restano **19** così, **irrecuperabili**
    (l'evento l'emoji non la salvava): a schermo ora dicono «Il cliente ha messo
    una reazione — quale, non lo sappiamo», con la data.
  - ⚠️ **L'emoji vuota è l'annullamento**, non un evento da ignorare (su
    Instagram `action: 'unreact'`): chi leva il cuore se lo deve veder sparire.
  - ⚠️ **Non tocca `ultimoMessaggioIl`**: il filo si ordina per quello, e un
    pollice non è lavoro da fare. Far risalire una chat chiusa per una reazione
    sarebbe rumore.
  - ⚠️ **Se il messaggio riferito non c'è** (più vecchio dell'archivio) l'emoji
    non si butta: si registra come riga normale. Meglio un cuore senza contesto
    che un cuore perso.
  - 🐞 **Su Instagram e Messenger le reazioni non arrivavano AFFATTO**, nemmeno
    come «[reaction]»: lì Meta le manda in `messaging[].reaction`, **fuori da
    `message`**, e il codice leggeva solo `ev.message` — il `continue` le
    buttava via in silenzio. Adesso si leggono.
  - ✅ `npx tsx scripts/prova-reazioni.mts`: 8 casi, tutti passano (attacca,
    sostituisce, toglie, id inesistente, e la conversazione che non risale).
    ⚠️ Lo script SCRIVE: crea righe sue con un id riconoscibile e **le cancella
    per id**. Mai un `deleteMany` senza filtro su questo database.
  - ⚠️ **Non visto a pixel** (pannello del browser non a schermo): la pastiglia
    ha la sua regola CSS `.bolla .reazione`, con la variante chiara sulle bolle
    in uscita. **Da guardare.**

- **IL CORRETTORE DI BOZZE** (23/08/2026). Chiesto dall'utente dopo aver visto
  partire «Good mornign» e «Yes we recived your order».
  - 📊 **Misurato prima di costruire**: su **120 messaggi usciti** scritti a
    mano, **18 avevano almeno un refuso vero (15%)** — «consegnsa»,
    «servirbbe», «realzzazioen», «tranfer», «theese», «tutta via», «un ora».
    ⚠️ Nel campione **103 messaggi su 120 sono di una persona sola**: non si
    può leggere come «è un problema suo», scrive lei quasi tutto.
  - **Come funziona**: premi Invia → il messaggio viene riletto. A posto, parte
    subito; con dei refusi **non parte**, e sopra la casella compaiono le
    parole trovate con **«Correggi»** e **«Manda così»**.
  - ⚠️⚠️ **L'AI propone, il codice decide** (`src/lib/refusi.ts`): ogni parola
    proposta deve **esistere nel testo come parola intera**, o si butta in
    silenzio. Senza questo filtro un modello che «migliora» la frase
    riscriverebbe un cognome o una via, e non se ne accorgerebbe nessuno.
  - ⚠️⚠️ **Non corregge e non manda mai da solo.** «Manda così» **deve
    restare**: chi scrive sa cose che il correttore non sa, e senza via d'uscita
    il correttore diventa un ostacolo — che si aggira smettendo di leggerlo.
  - ⚠️ **Fallisce aperto**: timeout 2,5 s, errori ingoiati, `controllato:false`
    → il messaggio parte. Bloccare le risposte ai clienti è peggio di un refuso.
  - ⚠️ **Mascherati prima di andare al modello**: link, email, `#numeri`,
    telefoni, IBAN. E ogni proposta con cifre si butta comunque («21018» è un
    CAP). **Più di 5 refusi = nessuno**: non è un testo pieno di errori, è un
    testo non capito.
  - ⚠️ **Modello grande, misurato**: `gpt-4o` 18 trovati, `gpt-4o-mini` 11 sugli
    stessi 120. ~1 €/mese al nostro volume. Stessa lezione già in `src/lib/ai.ts`.
  - ⚠️ `src/lib/refusi.ts` **non importa né OpenAI né il database**: lo importa
    l'Inbox, che è un componente client. Le chiamate stanno in `correttore.ts`.
  - 🎁 Aggiunto anche l'attributo `lang` alla casella di risposta (dalla lingua
    del cliente, che l'app già calcola in codice): il correttore del browser
    era acceso ma inutile — con il solo dizionario italiano ogni parola inglese
    risultava sbagliata.
  - ✅ `npx tsx scripts/prova-correttore.mts`: **17 casi**, tutti passano.
    `prova-correttore-vero.mts` prova la catena col modello: le quattro frasi
    vere corrette, e la frase giusta con indirizzo/ordine/telefono **non dà
    nessun falso allarme**.
  - ⚠️ **Il riquadro non è stato visto a pixel**: il pannello del browser non
    era a schermo e `getBoundingClientRect` tornava zeri (trappola nota). La
    struttura è verificata nel DOM — etichetta, pastiglie, «Correggi», «Manda
    così» — ma **l'occhio ce lo deve mettere una persona**.

- **«PAGA» FRA LE AZIONI, E «NOTA» CHE SCRIVE SUL DIARIO** (23/08/2026, LIVE,
  commit `587edfc8`). Chiesto dall'utente guardando la bacheca ordini.
  - **«Paga»** stava in cima accanto al menu «Assegna a…» e ci faceva riga a
    sé. Un pagamento non è compagno di riga dell'assegnazione: è un'azione come
    «Rimborso», con cui si legge insieme. Spostato lì accanto — i soldi vicini
    ai soldi.
  - **«Nota»** (`BottoneNota` in `OrdiniLista.tsx`) scrive una riga del diario
    **dall'ordine che si ha davanti**. Prima: cambiare pagina, ritrovare il
    numero, ribatterlo — tre passaggi, e quello che costa tre passaggi non si
    scrive. Invio salva, Esc chiude.
  - ⚠️ **Il numero dell'ordine lo mette il codice, non la persona**: l'API sa
    staccarlo dalla testa del testo, ma qui il contesto lo conosciamo già, e
    farlo ribattere vuol dire prima o poi attaccare la nota all'ordine
    sbagliato.
  - ⚠️ **La casella si svuota e si chiude SOLO dopo un salvataggio riuscito**:
    chiuderla comunque farebbe sparire una frase appena scritta proprio quando
    il salvataggio è fallito.
  - ⚠️ Il commit toccava **solo `OrdiniLista.tsx`**: manuale e handoff sono
    arrivati dopo, in un commit a parte. La regola del repo li vuole **nello
    stesso commit** — segnato qui perché non si ripeta.

- **TURNI: CHI LAVORA E QUANDO** (21/08/2026). Chiesto dall'utente: «una
  sezione in alto per admin TURNI dove consenti di impostare i turni per gli
  operatori». Pagina `/turni`, **primo gruppo del menu**, **solo
  amministratori** — e il gruppo per un operatore **non compare proprio**: una
  voce che risponde «serve un amministratore» sembra un guasto, non una regola.
  Per farlo, il ruolo ora arriva alla `Sidebar` dal layout (stessa cosa fatta
  anche per «Operatori»).
  - ⚠️ **Rifatta subito dopo la prima versione, su richiesta dell'utente
    («semplifica: è tipo gli orari di apertura di Google»).** Prima era una
    griglia persone × 7 giorni con sopra una barra da **quattro tendine**:
    funzionava e non si capiva — per mettere il lunedì di Federica bisognava
    scegliere persona, giorno e due ore in controlli diversi, e poi cercare dove
    fosse finita la pastiglia. Ora si sceglie **una persona** e si aprono o
    chiudono i suoi **sette giorni**, con le ore scritte dov'è scritto l'orario.
  - Tre parti: **Adesso** (chi è dentro, fino a che ora, e chi entra dopo), **gli
    orari della persona scelta** (7 righe Aperto/Chiuso, «+ Aggiungi orario» per
    la seconda fascia), **Giorni speciali** (ferie, permessi, orari diversi).
  - ⚠️ Le pastiglie delle persone dicono **quanti giorni** hanno già («· 4g»):
    si vede chi non ha ancora un orario senza aprirlo.
  - ⚠️ Chiudere un giorno è **una chiamata sola** (`DELETE ?cosa=giorno`): una
    per fascia vorrebbe dire più risposte in parallelo, ognuna con lo stato
    completo, e l'ultima che arriva vince — il giorno resterebbe mezzo aperto a
    schermo.
  - Due tabelle e non una (`TurnoSettimanale`, `EccezioneTurno`; `db push`
    additivo): la regola che si ripete e le volte in cui non vale sono due
    domande diverse. Con una sola, ogni permesso costringerebbe a riscrivere la
    settimana e poi a rimetterla a posto — e nessuno lo farebbe, così la griglia
    direbbe il falso in silenzio.
  - ⚠️⚠️ **L'eccezione vince sempre sulla settimana.** *Non lavora* cancella
    **tutte** le fasce di quel giorno (non una); *orario diverso* le
    **sostituisce**. Provato: `npx tsx scripts/prova-turni.mts`, 18 casi, tutti
    passano — compreso il caso in cui Federica ha due fasce e le ferie le
    devono togliere entrambe.
  - ⚠️⚠️ **Ore e giorni sono TESTO, non date**: `"09:00"` è un orario da parete,
    `"2026-08-25"` un giorno di calendario. Con dei `DateTime`, a fine ottobre
    — finita l'ora legale — tutti i turni si sposterebbero di un'ora da soli, e
    il 25 agosto salvato a mezzanotte italiana tornerebbe indietro come «24
    agosto 22:00». Stessa ragione per cui «Adesso» si calcola nel browser.
  - ⚠️ `giornoValido` controlla che il giorno **esista**: `2026-04-31`
    scivolerebbe al primo maggio senza dare errore, e l'eccezione finirebbe sul
    giorno sbagliato.
  - **I TURNI SI IMPOSTANO ANCHE PER SETTIMANA** (chiesto subito dopo: «consenti
    di impostare per settimane»). Sopra i sette giorni c'è **Sempre** (la regola
    che si ripete) oppure **‹ 24 – 30 ago ›** con le frecce e «Questa
    settimana». Dentro una settimana i giorni portano la **data**; appena se ne
    cambia uno, quel giorno si **stacca** dalla regola — etichetta «solo questa
    settimana», campo per il motivo, e «Torna al solito» che lo riattacca. In
    fondo, **Prossimi cambi**: i giorni staccati di tutti, cliccabili per aprire
    la loro settimana.
    - ⚠️⚠️ **La regola non si tocca mai** quando si lavora dentro una settimana:
      è tutto il punto. Le ferie del 25 agosto non devono costringere a
      riscrivere il martedì e poi a rimetterlo a posto.
    - ⚠️⚠️ **Un giorno si scrive INTERO, in una chiamata sola** (`cosa:
      'settimana-giorno'` e `cosa: 'giorno-data'`, dentro una transazione).
      Prima era «cancella il giorno, poi riscrivi le fasce» in più chiamate: se
      la seconda non arriva, il giorno resta **vuoto** — cioè si è cancellato un
      turno per cambiargli mezz'ora. Ora o cambia tutto o non cambia niente.
    - ⚠️ **`GET /api/turni?dal=<lunedì>`**: senza, i cambi partono da ieri e una
      settimana passata torna vuota — direbbe «era una settimana normale»
      invece di «non te l'ho caricata».
    - ⚠️ Un giorno non può essere insieme «non lavora» e «lavora dalle…»:
      scrivere un orario toglie il riposo e viceversa, altrimenti in tabella
      restano righe che si contraddicono.
    - ⚠️ `lunediDi`/`giornoSettimana`/`piuGiorni` stanno nel **lib puro** e
      hanno le loro prove: `getDay()` chiama la domenica **0** (presa così
      sposta la settimana di un giorno, e si vedrebbe solo di domenica), e
      `piuGiorni` usa `setDate` e non «più 7 × 86.400.000 ms» — le due notti in
      cui cambia l'ora legale durano 23 e 25 ore.
    - ✅ Guardata con l'anteprima temporanea: in «Sempre» si vede la regola; in
      «17 – 23 ago» il mercoledì staccato mostra **14:00–18:00** (non il
      09:00–18:00 della regola) col motivo «visita»; nella settimana dopo il
      martedì 25 è «non lavora · solo questa settimana · ferie» e il mercoledì
      26 **torna a seguire la regola**. A 375px non scorre di lato.
    - ✅ `npx tsx scripts/prova-turni.mts`: **28 casi**, tutti passano.

  - 🐞⚠️⚠️ **Le `24:00` erano ammesse e sono state TOLTE — bug trovato provando
    la pagina, non leggendo il codice.** Il campo orario del browser
    (`<input type="time">`) arriva alle **23:59**: un turno salvato con le 24:00
    tornava a schermo **con la casella di fine vuota**. Dato giusto nel
    database, pagina che sembra rotta — il modo peggiore di sbagliare. Ora si
    finisce al più tardi alle **23:59**, e i turni di notte vanno spezzati in
    due. ⚠️ Le tabelle erano vuote, quindi niente da migrare.
  - ⚠️ `src/lib/turni.ts` **non parla col database** ed è una regola da non
    rompere: lo importa anche il componente client. Le query stanno in
    `src/app/api/turni/route.ts`.
  - ⚠️ **I turni non fanno succedere niente**: non assegnano ordini, non
    smistano conversazioni, non impediscono di lavorare fuori orario. Scritto
    anche a schermo, perché è la prima cosa che si dà per scontata.
  - ✅ **Guardata davvero**, con un trucco che vale la pena ricordare: la pagina
    vuole un login e le password non le usa una sessione Claude, quindi si mette
    un file **temporaneo** sotto `src/app/widget/…` — l'unico ramo fuori dal
    cancello del middleware — che rende il componente con dati finti e la
    `window.fetch` sostituita. Si guarda, si cancella, non si committa. È così
    che è saltata fuori la casella vuota delle 24:00.
  - ✅ Provata anche a **375px**: le righe dei giorni vanno a capo e la pagina
    **non scorre di lato** (`scrollWidth === clientWidth`). La vecchia griglia a
    7 colonne, quella, scorreva.
  - ⚠️ `npx tsx scripts/prova-turni.mts`: 20 casi, tutti passano.

- **OPERATORI: QUANTO LAVORO HA FATTO CIASCUNO** (21/08/2026). Chiesto
  dall'utente: «una sezione per giudicare gli operatori — quanti ordini
  gestiscono, quante chat, quanti link di pagamento inviano». Pagina
  `/operatori`, **prima voce del gruppo Qualità** (le altre misurano chi
  consegna, questa misura noi) e **solo amministratori** — il controllo sta in
  `/api/operatori`, non solo nella pagina.
  - Sette colonne: **Ordini presi** (`Ordine.presaDaId`/`presaIl`), **Ordini
    chiusi** (`gestione='gestito'` + `gestioneDaId`/`gestioneIl`), **Chat
    prese** (`Conversazione.presaDaId`), **Chat risposte** (conversazioni
    *diverse* in cui ha scritto), **Messaggi inviati**
    (`Messaggio.direzione='out'` + `utenteId`), **Link di pagamento** e
    **Ordini creati**.
  - ⚠️ *Chat prese* e *Chat risposte* sono due cose diverse apposta: prendere
    in carico è un clic, rispondere è il lavoro. Chi risponde senza prendere in
    carico lo vede solo la seconda.
  - **Periodi**: oggi · ieri · 7 giorni · questo mese · 30 giorni · trimestre ·
    anno · date a scelta. Mese/trimestre/anno di **calendario**, 7 e 30 giorni
    **mobili**; *ieri* è il giorno intero; nelle date a scelta l'ultimo giorno è
    **compreso** (il confine è la mezzanotte del giorno dopo).
  - ⚠️⚠️ **I confini si calcolano nel BROWSER e si mandano come istanti.** Sul
    server sarebbero UTC — Vercel sta lì — e «oggi» comincerebbe alle 02:00
    italiane: due ore di lavoro di ogni mattina finirebbero nel giorno prima,
    **senza che nulla desse errore**. L'intervallo risolto è sempre scritto a
    schermo, perché «trimestre» non vuol dire la stessa cosa per tutti.
  - 🆕 **Tabella `OrdineCreato`** (`prisma db push`, additiva). Serviva perché
    **i link di pagamento non erano misurabili**: `/nuovo-ordine` creava la
    bozza su Shopify e nessuno scriveva chi era stato — il nome dell'operatore
    vive solo nella sessione, Shopify non lo sa, e **all'indietro quel dato non
    si recupera**. Ora la riga si scrive alla nascita dell'ordine, col totale
    vero calcolato da Shopify (`totalPriceSet`, validato contro lo schema prima
    di toccare la mutation).
  - ⚠️⚠️ **La scrittura di quella riga non può far fallire l'ordine**: quando ci
    si arriva la bozza su Shopify **esiste già**, e un errore mostrato
    all'operatore lo farebbe ricominciare — col cliente che si ritrova due
    ordini e due link. È in try/catch, l'errore va nei log e finisce lì.
  - ⚠️ **`OrdineCreato` NON è un secondo registro degli ordini**: quello resta
    Deluxy Orders. Qui c'è solo la riga di lavoro (chi, quando, come, quanto), e
    nessuna schermata legge di lì lo stato di un ordine.
  - ⚠️ **Il campanello grosso, scritto anche a schermo**: `gestioneDaId`/
    `gestioneIl` tengono **solo l'ULTIMO cambio di stato**. Se qualcuno riapre
    un ordine chiuso, quella chiusura non si conta più a nessuno. Non c'è un
    registro delle azioni in quest'app: la pagina misura **il lavoro, non il
    merito**, e lo dice.
  - ⚠️ Ogni colonna dichiara **da quando si misura** (riquadro in fondo, letto
    dal database): serve a non leggere «zero» come «non ha fatto niente» quando
    la verità è «qui non si misurava ancora». Link e ordini creati: dal 21/08;
    le altre da fine luglio 2026.
  - ✅ **Provato contro il database vero**: `npx tsx scripts/prova-operatori.mts`
    stampa tutti i periodi e verifica che «da sempre» dia gli stessi totali di
    un conteggio senza filtri — **tornano tutti** (16 presi, 143 chiusi, 51 chat
    prese, 810 messaggi). I periodi discriminano davvero: oggi 11 messaggi, ieri
    23, 7 giorni 183, il mese 759.
  - ⚠️ **Non verificato a schermo da una sessione**: la pagina vuole un login da
    amministratore, e le password non le usa una sessione Claude. Typecheck e
    build passano, `/operatori` compare fra le rotte. **Da guardare con gli
    occhi.**

- **NUOVO ORDINE PER IL CLIENTE AL TELEFONO** (19/08/2026, LIVE). Pagina
  `/nuovo-ordine`: negozio, cliente (precompilato dalla conversazione), giorno e
  fascia, indirizzo, prodotti, biglietto, e **due metodi di pagamento**:
  «link di pagamento» (bozza + invito, resta bozza finché non paga) o «ha già
  pagato» (bonifico/contanti/POS → ordine **pagato**, con conferma davanti e il
  mezzo scritto nelle note).
  - ⚠️⚠️ L'ordine **nasce in Shopify** come bozza e torna dal registro come
    tutti gli altri: uno scritto solo da noi sarebbe invisibile a logistica e
    contabilità.
  - ⚠️ Giorno e fascia vanno negli attributi `Data_Consegna` e
    `Fascia_Oraria_Consegna`, gli unici che il registro legge.
  - ✅ **`read_products` aggiunto il 19/08**: il catalogo si legge su tutti e
    tre i negozi (30 varianti Deluxy, 12 Cake, 30 Flowers, **tutte con foto**) e
    nei risultati c'è la miniatura — al telefono col cliente «quello con le
    peonie» si riconosce a colpo d'occhio, e i titoli si somigliano tutti
    («· Medio», «· Medio-Grande», «· Grande»). La riga scritta a mano resta per
    i fuori-listino. ⚠️ L'avviso «catalogo non leggibile» resta nel codice: se
    il permesso venisse tolto, una lista vuota direbbe «non c'è niente con quel
    nome», che è un'altra cosa da «non posso guardare».

- **CHARGEBACK: SEZIONE, RISPOSTA ALLA BANCA E COMPITO DEL GIORNO** (19/08/2026,
  LIVE). Chiesto dall'utente. Il dato viveva solo dentro Shopify: misurato lo
  stesso giorno, **10 contestazioni perse per 2.087,66 €** e **3 aperte per
  373,28 €**, due con le prove da mandare entro il **5 settembre**.
  - `src/lib/chargeback.ts`: legge `shopify_payments/disputes` sui tre negozi
    (REST) e risponde con la mutation GraphQL `disputeEvidenceUpdate`.
  - ⚠️⚠️ **È L'UNICO PUNTO IN CUI QUEST'APP PARLA CON SHOPIFY**, ed è una deroga
    **dichiarata** alla regola di `src/lib/negozi.ts`. Quella regola esiste per
    non avere due verità sugli **ordini**; qui gli ordini non si toccano — le
    contestazioni Orders non le ha, non le importa e non le espone. Il confine
    sta nel codice: quelle funzioni sanno raggiungere solo le dispute.
  - Pagina `/chargeback`: elenco per scadenza più vicina con «quanto manca»;
    il dettaglio dice **che cosa vuole la banca** a seconda del motivo.
  - ⚠️ Due gesti distinti: «Salva bozza» resta qui, «Invia le prove» è
    **irreversibile** e chiede conferma con numero e importo davanti.
  - ⚠️ Il testo già scritto su Shopify **vince** sulla bozza nostra: se un
    collega ha risposto dal pannello, riscriverci sopra sarebbe cancellarlo.
  - Dashboard: numero in cima + riquadro **primo di tutti** (è l'unica cosa che
    scade da sola). ⚠️ Se non ce ne sono, il riquadro sparisce: uno vuoto tutti
    i giorni si impara a saltare.
  - Cron `25 * * * *`, più il bottone «Aggiorna da Shopify».
  - ⚠️ Permessi: bastano quelli aggiunti il 19/08 (`read_shopify_payments_disputes`
    + `write_orders` per le prove). **Non** serve `read_shopify_payments`: quello
    aprirebbe `shopifyPaymentsAccount`, che non usiamo.

- **ORDINI: CHI SE NE OCCUPA, PAGAMENTO E FRODE, FORNITORI IN ZONA** (19/08/2026,
  tutto LIVE). Una giornata sulla bacheca degli ordini, su richiesta dell'utente.
  - **Presa in carico degli ordini**, con le stesse regole delle conversazioni
    (`Ordine.presaDaId/presaDaNome/presaIl`, db push additivo). Bollino oro se è
    di un collega, grigio se è mio; filtro «Chi se ne occupa: Liberi / Miei».
    ⚠️ Update **condizionato** (`updateMany` su «libero o già mio»): con un
    update secco due operatori che premono nello stesso secondo leggerebbero
    entrambi il proprio nome. ⚠️ Si lascia **solo il proprio**.
  - **L'amministratore assegna, l'operatore prende**: per l'admin il bottone
    diventa il menu «Assegna a…» con tutti gli operatori. ⚠️ Assegnare a un
    altro è **403 per i non-admin**: un operatore che può scaricare un ordine su
    un collega non fa una presa in carico, fa uno scarico di responsabilità con
    l'aria di essere una funzione. ⚠️ Anche l'admin passa dal 409 se l'ordine è
    in mano a un terzo: toglierlo di soppiatto è il guaio di sempre.
  - **Pagamento e rischio frode nella lista** (`rischioLivello`,
    `rischioRaccomandazione`, e `statoPagamento` che il sync **non riempiva
    più**: 491 ordini su 1.273 l'avevano vuoto). Il dato c'era già in Orders
    (`shopify.financialStatus`, `shopify.rischio`, che tiene la valutazione più
    severa fra quelle che Shopify conosce). ⚠️ LOW/NONE e pagamento sconosciuto
    **non si mostrano**: un bollino su tutto è come nessun bollino. Misurato su
    7 giorni di ordini veri: 3 PENDING, 2 MEDIUM/INVESTIGATE (#2749, #2714).
    Riempito l'arretrato con un giro completo (866 ordini).
  - **Fornitori del registro nella provincia di consegna**, nel pannello
    dell'ordine: pasticcerie per il negozio Cake, fiorai per Flowers, con
    WhatsApp/Email/«Copia richiesta». ⚠️ La richiesta usa **lo stesso testo
    dell'app Ricerca fornitori**. ⚠️⚠️ `src/lib/province.ts` perché nel registro
    la stessa provincia è scritta in due modi (**20 «MI» e 9 «MILANO»**): senza
    normalizzare, Milano trovava 20 fornitori su 29 e la lista sembrava solo più
    corta. ⚠️ I mestieri hanno più etichette (FIORISTA+FIORI, PASTICCERIA+
    CIOCCOLATERIA) e il recapito può essere di un **referente**. Misurato:
    Milano → 9 pasticcerie / 6 fiorai; Firenze e Novara → nessuno, e lo dice.
  - **IL SALUTO AUTOMATICO PARLA LA LINGUA DEL CLIENTE** (19/08/2026, LIVE).
    Un cliente ha scritto in inglese e si è visto rispondere in italiano: un
    saluto nella lingua sbagliata dice che dall'altra parte non lo hanno nemmeno
    letto. Ora it/en/fr/es/de.
    ⚠️⚠️ `linguaDelTesto` **da sola non basta**, e non è un difetto: pretende 3
    parole comuni e 2 punti di margine perché decide se *pagare* una traduzione
    (senza margine, 13 newsletter italiane su 384 risultavano portoghesi). Su
    «Hi I want deliver a sympathy flower in Italy address is Via Teocrito 56
    Milano» risponde «non so»: metà delle parole sono nomi propri italiani.
    Qui la decisione costa meno, quindi la catena è **testo → marcatori
    («hello», «please», «bonjour») → prefisso del telefono → italiano**.
    ✅ Provata con 10 casi: `npx tsx scripts/prova-primo-contatto.mts`.
    ⚠️ Le traduzioni sono **scritte a mano** nel codice: il messaggio parte
    dentro il webhook, e una chiamata a un traduttore lì dentro è un messaggio
    che rischia di perdersi. Il testo delle Impostazioni vale per l'italiano.
  - **ORA DI INVIO E RICEZIONE SU OGNI MESSAGGIO** e **«/» apre le risposte
    pronte** (ricerca per titolo, Invio sceglie la prima; solo a riquadro vuoto,
    e la barra non resta scritta).
  - 🐛 **«COLLEGA A UN ORDINE» SEMBRAVA NON FARE NIENTE**: il pop-up nasceva
    prima della finestra della conversazione e, **a parità di z-index, ordina il
    DOM** — finiva dietro. Ora ha il suo livello (`velo-sopra`).
    ⚠️ Da ricordare: nell'inbox a colonne il thread È già una finestra col suo
    velo. Ogni nuovo pop-up aperto da lì va sopra, o non si vede.
  - **I NUMERI D'ORDINE CITATI NELLA CONVERSAZIONE** si propongono con un clic
    nel pop-up. ⚠️ Solo le forme che dichiarano un ordine (#2759, «ordine
    2759»): in chat girano civici, CAP e importi.
  - **COLLEGARE UNA CONVERSAZIONE A UN ORDINE, A MANO** (19/08/2026, LIVE):
    bottone nella testata del thread + pop-up di ricerca (numero, cliente,
    telefono, email, indirizzo) che parte già col nome del cliente.
    ⚠️ Cerca fra **tutti** gli ordini, non i soli aperti: una mail arriva spesso
    dopo la consegna. ⚠️ Si salva il **numero**, non l'id — è la chiave
    dell'aggancio automatico e sopravvive all'uscita dai 60 giorni. ⚠️ Un numero
    inventato non diventa un aggancio a niente: la rotta risponde 404.
  - **«GESTITO» RESTA LA CHIUSURA, NON UN PASSO** (19/08/2026, LIVE). Era
    finito in fila coi passi come se fosse il quinto: ma gli altri dicono *a che
    punto siamo* e questo dice che *abbiamo finito*, ed è l'unico che fa uscire
    l'ordine dalla lista. Ora sta accanto, staccato, verde, e da acceso il clic
    riapre. ⚠️ È una distinzione da non perdere al prossimo ritocco.
  - **RIGA DI FILTRI PER PUNTO DI LAVORAZIONE** (19/08/2026, LIVE): Solo nuovi |
    Tutti gli aperti · i quattro passi | Gestiti, sotto i filtri lunghi.
    ⚠️ Stessa impostazione della tendina, non una seconda: due comandi che
    raccontano stati diversi sono il modo più rapido per non fidarsi di
    nessuno dei due.
  - **LA CONSEGNA SI SPOSTA DAL PANNELLO, E LO STATO SI CAMBIA ANCHE LÌ**
    (19/08/2026, LIVE). Il pannello è dove si lavora l'ordine: ci si accorge lì
    di essere passati al punto dopo, e chiudere per cambiare stato sulla scheda
    è un giro che non fa nessuno. Stessa cosa per la consegna: il cliente
    chiede un altro giorno, e prima si andava su Shopify aspettando il reimport.
    - ⚠️⚠️ Il valore nuovo si scrive **dentro `dataConsegna`/`fasciaConsegna`**,
      i campi che leggono già urgenza, calendario, ordinamenti e messaggio al
      fornitore: una data «nostra» in un campo a parte sarebbe vera solo nella
      schermata che la mostra.
    - ⚠️ `consegnaSpostata` dice al sync di non ripassarci sopra — senza,
      la decisione di una persona sparirebbe entro 15 minuti — e
      `dataConsegnaOriginale` tiene quella di Shopify per mostrarla accanto.
    - ⚠️ **La divergenza si dichiara a schermo** («spostata da X · su Shopify
      resta Y»): è l'unico modo perché qualcuno vada a sistemarla alla fonte.
    - 🔴 **MANCA la nota su Shopify** (chiesta dall'utente): da qui non si
      scrive su Shopify — il client è stato tolto di proposito, e le credenziali
      dei tre negozi coniano un token ma **non dichiarano `write_orders`**
      (provato il 19/08: `access_scopes` torna vuoto).
      ✅✅ **CORREZIONE del 19/08: `write_orders` C'È GIÀ.** Interrogata
      l'installazione (`currentAppInstallation { accessScopes }`) su tutti e tre i
      negozi: **read_all_orders, read_audit_events, read_channels, read_customers,
      read_orders, write_channels, write_customers, write_orders**. La nota su
      Shopify si può scrivere **subito**, senza toccare niente.
      ⚠️ Da dove nasceva l'errore: `/admin/oauth/access_scopes.json` torna VUOTO
      con i token client-credentials — non vuol dire «nessun permesso». Il modo
      giusto di chiederlo è la query GraphQL `currentAppInstallation`. Appena fatto: qui si aggiunge la scrittura della nota
      sull'ordine («Consegna spostata al … da …») usando le credenziali già in
      `NegozioShopify` (client credentials grant, `src/lib/negozi.ts`), e si
      valuta di aggiornare la data **alla fonte** così la divergenza non nasce.
      ⚠️ Prima di scrivere: ricontrollare `access_scopes`, perché oggi torna
      vuoto anche col token valido.
  - 🐛🐛 **GLI ORDINI APPENA FATTI ARRIVAVANO SEMPRE UN GIRO DOPO** (19/08,
    segnalato dall'utente: «ne ho ricevuti ora alcuni su Flowers che non
    vedo»). Non era un guasto: era una **gara persa in partenza**. Anche il
    registro Orders importa da Shopify ogni 15 minuti (`*/15`), e il nostro
    cron girava sullo stesso `*/15` — cioè leggevamo il registro
    sistematicamente un attimo **prima** che si aggiornasse. Misurato: nostro
    sync **15:30:44**, import di Orders **15:31:11**, e i tre Flowers delle
    15:19/15:20/15:29 rimasti fuori per un giro intero.
    Ora il nostro cron è `5,20,35,50`: si legge **dopo** che il registro ha
    finito, e il ritardo passa da 15-30 minuti a 5-20.
    ⚠️ **Regola generale**: due cron con lo stesso passo non sono
    «contemporanei», sono uno prima e uno dopo — e quale dei due sia lo decide
    il caso. Chi legge deve girare **sfasato** rispetto a chi scrive.
    ⚠️ Il ritardo residuo è quello del registro: un ordine può comparire in
    bacheca fino a ~20 minuti dopo che il cliente l'ha fatto. Per averlo subito
    c'è «Aggiorna da Ordini».
  - 🐛 **IL PASSO IN CORSO ERA UNA PILLOLA VUOTA** (19/08, «il vuoto cosa
    sarebbe?»): `.bottone.mini` forzava lo sfondo chiaro su **tutti** i mini,
    ma il testo dei primari è bianco — bianco su bianco. Lo sfondo serviva solo
    ai mini *secondari* (per renderli opachi sopra le righe) e ora sta lì.
    Stesso difetto, mai notato, sul bottone «Nuovo messaggio» dell'inbox.
  - **I PASSI DELLA LAVORAZIONE, SOPRA I BOTTONI** (19/08/2026, LIVE):
    **Da iniziare · Ricerca fornitore · In pagamento · Attesa consegna**, il
    passo in corso pieno e gli altri no. Stanno prima dei bottoni perché
    rispondono a un'altra domanda: i bottoni dicono *cosa posso fare*, la fila
    dice *dove siamo* — e un ordine fermo sul fornitore chiede una cosa diversa
    da uno che aspetta solo la consegna, mentre finora erano tutti «Da gestire».
    ⚠️ La chiave resta `da_gestire` anche se ora si legge «Da iniziare»: è
    scritta su 1.274 ordini e nei filtri, e rinominarla per un'etichetta
    vorrebbe dire migrare i dati per una parola. ⚠️ `comunicazione` resta nel
    vocabolario pur non essendo un passo: **lo scrive l'app da sé** quando
    scrivi al cliente, e toglierlo lascerebbe uno stato senza nome sugli ordini
    che ce l'hanno.
  - **FILTRO «SOLO NUOVI»** (19/08/2026, LIVE): un interruttore in alto per
    vedere i soli ordini col bollino NUOVO (ultime 12 ore, la finestra di
    `ORE_APPENA_ARRIVATO`).
    ⚠️ Filtra il **server**: la lista è tagliata a 200 e ordinata per urgenza,
    quindi a valle si vedrebbero i soli nuovi fra i 200 già scelti. Misurato
    alla nascita: 7 col bollino, 4 ancora da gestire.
  - **IL RIQUADRO FORNITORI DIVENTA UNA FASCIA SUA, COL MESTIERE A SCELTA**
    (19/08/2026, LIVE). Stava in fondo alla prima colonna: una lista di nomi con
    tre bottoni ciascuno, in una striscia stretta, è un elenco che non si
    guarda. Ora è largo quanto la finestra, con le tessere affiancate. E il
    mestiere si sceglie — pasticcerie / fiorai / quello del negozio — perché
    sugli ordini **Deluxy** il negozio non dice niente e su una torta uscivano
    anche i fiorai. ⚠️ Non si indovina dal nome del prodotto: «Numbers»,
    «Millefoglie», «Bouquet» sono nomi di listino.
  - **LA FOTO DEL PRODOTTO PARTE ALLEGATA** nella mail al fornitore (spunta per
    toglierla, con anteprima). ⚠️ Si scarica **lato server con la stessa lista
    bianca di `/api/immagine`** (`src/lib/immagine-prodotto.ts`, solo
    `cdn.shopify.com`): una funzione che prende un URL da chi la chiama e va a
    scaricarlo è un proxy verso la rete interna. ⚠️ Se non si riesce, la mail
    parte lo stesso **e lo dice**.
  - **L'ORDINE RIMBORSATO SI CHIUDE DA SOLO** (richiesta dell'utente). ⚠️⚠️ Si
    reagisce al **passaggio** REFUNDED, non allo stato: chiudendo a ogni giro,
    un ordine riaperto apposta verrebbe richiuso all'infinito — **chi riapre
    lascia il proprio id e da lì comanda lui**. Vale anche per i rimborsati
    «mai toccati da nessuno», che altrimenti nessun passaggio avrebbe più
    ripescato: erano **9**, chiusi; 3 di quelli erano fuori dalla finestra dei
    60 giorni e sono stati chiusi a mano con lo stesso filtro. Solo REFUNDED
    pieno: un rimborso parziale lascia una consegna da fare.
  - **ORARIO DI ARRIVO DELL'ORDINE** nel dettaglio: su una consegna per oggi
    dice se è entrato stamattina o cinque minuti fa, cioè quanto tempo resta.
  - 🐛 **«ASSEGNA A…»: SEMBRAVA NON FARE NIENTE** (segnalato dall'utente).
    Faceva il suo lavoro, ma il menu tornava sempre in bianco e assegnare a sé
    un ordine già proprio non muove niente a schermo — il bollino «Mio» è in
    cima alla scheda, lontano. Ora il menu **mostra chi ce l'ha** e l'esito si
    scrive in una riga. ⚠️ Un comando che non lascia traccia dove viene premuto
    è indistinguibile da un comando rotto.
  - 🐛 **«NESSUN FORNITORE» CON IL FORNITORE IN TABELLA** (segnalato
    dall'utente: «nell'app search ne ho uno possibile»). Due difetti sovrapposti
    sullo stesso riquadro appena fatto: (1) si leggeva **una pagina da 200
    righe su 1.040** — la pasticceria di Arona stava a pagina 3; (2) si
    chiedevano **solo i partner attivi**, mentre chi cerca qualcuno da chiamare
    per domani vuole anche i **prospect** già censiti (è quello che mostra da
    sempre Ricerca fornitori). Ora si leggono tutte le pagine (le successive
    insieme, memoria di 5 minuti nel processo) e entrano tutti gli stati tranne
    `non_interessato` e `dismesso`; a schermo si legge Partner o Prospect.
    ⚠️ È lo stesso difetto delle province scritte in due modi: **una lista
    tagliata non sembra sbagliata, sembra corta**. Misurato dopo: Novara 0 → 1,
    Firenze 0 → 5, Milano 5 → 21.
  - **«Spam» anche dalla conversazione aperta** (inbox), non solo dall'icona
    nella riga: la spazzatura la si riconosce leggendola. Solo sulla posta e non
    nel cestino.
  - 🐛 **«Fornitore» apriva una scheda vuota (about:blank)**, segnalato
    dall'utente: la scheda si apre prima della chiamata (deve nascere dentro il
    clic) ma era aperta con `noopener`, e **con `noopener` il browser
    restituisce null** invece della scheda — l'indirizzo non si poteva più
    scrivere dentro. Ora si apre senza `noopener` e il legame si toglie a mano
    con `opener = null`.
  - ⚠️ Resa a schermo **non verificata** (login): verificati `tsc`, `build`, i
    dati veri dal registro e da Orders, e il deploy promosso.

- **GLI AVVISI SUONANO PER LE CONVERSAZIONI TUE O LIBERE, NON PER QUELLE DI UN
  COLLEGA** (19/08/2026, LIVE). Era l'ultimo pezzo che mancava alla presa in
  carico del 17/08: la funzione esisteva, ma l'avviso continuava a suonare
  **tutto a tutti**. Un avviso che nove volte su dieci riguarda il lavoro di
  qualcun altro si impara a ignorare — e a quel punto è inutile anche quando
  conta.
  - **mia** → suona; **libera** → suona (è il caso in cui rischia di non
    rispondere **nessuno**, per questo «Libere» pesa più di «Mie»); **di un
    collega** → silenzio. Il testo dell'avviso dice quale dei due casi è.
  - ⚠️ Si confronta il non letto **conversazione per conversazione**, non la
    somma di prima: con la somma, un collega che *libera* una conversazione con
    tre non letti farebbe salire il totale filtrato e suonerebbe come se fossero
    appena arrivati. **Un cambio di proprietario non è un messaggio nuovo.**
  - ⚠️ Con `ioId` vuoto si avvisa **solo per le libere**: senza sapere chi
    guarda, il ripiego prudente non è «tutto mio».
  - ✅ **Provata con 9 casi, tutti passano** (`npx tsx scripts/prova-avvisi.mts`):
    primo caricamento muto, mia, libera, del collega, conversazione liberata,
    conversazione nuova, mista, apertura che azzera i non letti, `ioId` vuoto.
    La regola è in `src/lib/avvisi.ts` proprio per poterla provare senza
    browser: **un avviso che non suona non lascia traccia da nessuna parte**.
  - ⚠️ Resa a schermo non verificata (login): il suono e l'avviso vanno sentiti
    da un operatore vero.

- **LA RISPOSTA DI PRIMO CONTATTO PARTE DA SOLA** (19/08/2026, LIVE e **accesa
  in produzione**). Chi scrive per la prima volta riceve subito «abbiamo
  ricevuto il tuo messaggio»: fra il messaggio di un cliente e la prima risposta
  di una persona può passare un'ora, e in quell'ora non sa nemmeno se ha scritto
  al posto giusto.
  - `src/lib/primo-contatto.ts`. Parte **solo se in quella conversazione c'è un
    messaggio in tutto** — il controllo che la rende «di PRIMO contatto» e
    insieme la protegge dal doppione, perché la risposta stessa diventa il
    secondo messaggio e al giro dopo il conto non torna più. Nessun flag da
    tenere allineato.
  - ⚠️⚠️ **Nessun nome di operatore**, ed è il punto: `tipo: 'auto'`,
    `utenteNome` vuoto, e l'inbox scrive «risposta automatica». Firmare
    «Federica» un messaggio che Federica non ha scritto vuol dire che il cliente
    le risponde per nome e che nel thread non si distingue più la persona dal
    sistema.
  - ⚠️ **La conversazione non si tocca**: `ultimoTesto` resta la frase del
    cliente (altrimenti l'inbox mostrerebbe la stessa riga identica su ogni
    conversazione nuova e la domanda vera sparirebbe), `ultimoMessaggioIl` resta
    la sua ora (così «da quanto aspetta» misura la sua attesa), `nonLetti` non
    si azzera e **nessuno risulta averla presa in carico**: un robot non ha
    letto niente.
  - ⚠️ **La posta è esclusa di proposito**: lì arrivano newsletter, notifiche e
    spam, e rispondere da soli vuol dire scrivere agli spammer o aprire un
    ping-pong fra due risponditori automatici.
  - ⚠️ Il saluto parte **in italiano per tutti**: la lingua si riconosce solo
    dopo aver letto il messaggio e su una frase sola sbaglia spesso. È un limite
    dichiarato, non una svista.
  - `src/lib/invio.ts` (nuovo): le regole di «da quale nostro numero/pagina esce
    la risposta» stavano dentro la rotta dell'operatore; ora i chiamanti sono
    due e stanno in un posto solo.
  - ✅ **VERIFICATO IN PRODUZIONE, non solo compilato**: aperta una sessione
    widget su `sito=cake`, mandato un messaggio → il saluto è tornato nella chat
    del visitatore; mandato un **secondo** messaggio → **non** si è ripetuto; in
    tabella il messaggio ha `tipo=auto`, `utenteNome` vuoto, la conversazione ha
    `nonLetti=2`, `presaDaId` vuoto e `ultimoTesto` = la frase del cliente. La
    conversazione di prova è stata cancellata per id.
  - ⚠️ **Su WhatsApp/Instagram/Messenger non è ancora successo con un cliente
    vero** (`tipo='auto'` a 0 in tabella al momento del deploy): il primo caso
    reale va guardato in inbox.

- **IL BOTTONE «SHOPIFY ↗» ANCHE FRA LE AZIONI RAPIDE** (17/08/2026, LIVE).
  Stava solo dentro il pannello del dettaglio: rimborsare davvero, cambiare le
  righe o guardare un pagamento però si decide **scorrendo l'elenco**, e aprire
  il pannello per prendere un link era un clic in più su ogni ordine. Ora il
  bottone sta accanto agli altri nei **tre** posti dove si lavora: schede a
  colonne, righe della tabella, **archivio storico**.
  - ⚠️ Nell'**archivio** serve più che altrove: di quegli ordini non abbiamo la
    copia in casa, quindi le azioni che scrivono non ci sono e l'unica cosa da
    fare sul serio si fa là. Lì il negozio si trova **per brand** (le righe
    dell'archivio non portano il `negozioId`); la colonna «Fornitore» è
    diventata «Azioni», perché ora ne contiene due.
  - ⚠️ Il link nasce sempre da **gid + dominio del negozio di quell'ordine**,
    mai dal numero, e se non si può costruire **il bottone non c'è**. Contato
    sul database: **0 ordini su 1.245 senza gid**, quindi in pratica compare
    sempre; verificato anche che le tre maniglie sono quelle vere
    (`deluxygifts`, `cakedesign-5921`, `fb72b1-2`).
  - ⚠️ Resa a schermo **non verificata**: la bacheca sta dietro il login.
    Verificati `tsc`, `build` e il deploy promosso all'alias di produzione.

- **«COLLEGATO» A GOOGLE LO DICE GOOGLE, NON LA CHIAVE SALVATA** (17/08/2026,
  LIVE — commit `17bab22a`).
  - **Due schermate, due risposte opposte, entrambe convinte.** In
    *Impostazioni* il bollino verde «collegato» nasceva da
    `!!config.googleRefreshToken`, cioè dalla sola **presenza** della chiave in
    tabella; nella **bacheca degli ordini** l'avviso rosso «Google Contacts non
    è collegato» nasceva dal **provare a usarla**. La ragione era della bacheca:
    misurato oggi, Google risponde **`invalid_grant`** a quel token.
  - `statoGoogle()` in `src/lib/contatti.ts` distingue le due cose che prima
    erano una sola: **`configurato`** (la chiave c'è) e **`collegato`** (Google
    la accetta *adesso*), più l'`errore` con le parole di Google. Impostazioni
    mostra il terzo caso che prima non esisteva — badge **«chiave rifiutata da
    Google»** — e sotto il motivo, il pulsante *Ricollega Google* e la causa più
    probabile (consenso in «Testing» = refresh token che scadono dopo 7 giorni).
  - `/api/ordini` non butta più via il motivo: `googleAccessToken().catch(() =>
    null)` trasformava «Google ha revocato l'accesso» in un muto «non
    collegato». Ora la rotta torna anche `googleErrore` e `OrdiniLista` lo
    mostra: *«Google Contacts non risponde più: <parole di Google>. La chiave è
    salvata ma Google la rifiuta»*.
  - ⚠️ **Regola generale**: uno stato di collegamento va **misurato**, non
    dedotto dalla presenza di una credenziale. Un sì/no dedotto manda a cercare
    un interruttore che non c'è; il messaggio d'errore di chi rifiuta dice cosa
    fare.
  - ⚠️ `statoGoogle()` **costa una chiamata a Google**: si usa dove lo stato
    viene *mostrato* (la pagina Impostazioni), mai nei giri di lavoro.
  - ⚠️ Resa a schermo **non verificata** (login). Verificati `tsc`, `build`, il
    deploy promosso all'alias di produzione, e — sul database — che la chiave
    salvata sia davvero rifiutata, che è il caso che il nuovo badge racconta.

- **«APRI IN SHOPIFY» SUL DETTAGLIO ORDINE, ED «ETICHETTA NUOVO» CHE SI VEDE**
  (17/08/2026, LIVE).
  - **Link a Shopify.** Una parte del lavoro non si fa da qui e non deve farsi
    da qui: rimborsi veri, modifica delle righe, rispedizione della conferma,
    pagamenti. Prima si apriva Shopify a mano, si sceglieva il negozio giusto
    fra tre e si cercava il numero — e **`#1733` esiste su più negozi**, quindi
    ogni tanto si finiva sull'ordine di un altro marchio. Il link nasce dal
    **gid**, che quell'ambiguità non ce l'ha, più il dominio del negozio *di
    quell'ordine* (campo `dominio` aggiunto alla risposta di `/api/ordini`).
  - `src/lib/link-shopify.ts`: da `xxx.myshopify.com` si ricava la maniglia per
    `admin.shopify.com/store/<maniglia>/orders/<id>`; con un dominio pubblico si
    ripiega su `<dominio>/admin/orders/<id>`, che Shopify redirige da sé.
    ⚠️ Se il link non si può costruire **il bottone non c'è**: uno che porta a
    una pagina d'errore è peggio di uno assente.
  - **⚠️⚠️ L'etichetta NUOVO c'era già e non si vedeva MAI.** Confrontava
    `creatoIl` con l'istante in cui avevi **aperto la scheda**: aprendo la
    bacheca la mattina nessun ordine è più recente dell'apertura, quindi zero
    etichette. Ora `appenaArrivato()` marca quelli entrati nelle ultime
    **12 ore** (`ORE_APPENA_ARRIVATO`) — la giornata del servizio clienti, non
    24 ore: un ordine di ieri sera non è una novità per chi si siede stamattina.
    Resta il grado più forte per quelli comparsi *sotto i tuoi occhi*: cambia la
    spiegazione, non il bollino — due bollini per la stessa cosa sarebbero un
    rebus.
  - ⚠️ `adesso` sta in uno **stato riempito in un effetto**, non `Date.now()` nel
    render: server e browser darebbero valori diversi (idratazione). Si aggiorna
    ogni 5 minuti, altrimenti su una scheda lasciata aperta tutto il giorno
    l'etichetta non si spegnerebbe mai. Con `0` non marca niente, che è il
    ripiego giusto prima di sapere che ore sono.
  - ⚠️ **`creatoIl` è quando l'ordine è comparso DA NOI**, non la data
    dell'ordine: al primo scarico di un negozio nuovo entrano insieme due mesi
    di ordini e sono tutti «appena arrivati». È vero, ed è il motivo per cui
    questa etichetta non va usata come «ordine recente».
  - ⚠️ Resa a schermo **non verificata** (login). Verificati `tsc`, `build`, e
    che `/api/ordini` mandi `shopifyId` — nessun `select` che lo tagli fuori.

- **DALLA SCHERMATA «OGGI» SI ARRIVA SULL'ELEMENTO, NON SULL'ELENCO**
  (17/08/2026, LIVE). Due difetti diversi con lo stesso effetto: si clicca e non
  si arriva dove si voleva.
  - **I reclami portavano a `/reclami` e basta.** C'era perfino un commento che
    lo dichiarava («servirebbe un parametro che quella pagina non legge»). Ora la
    pagina lo legge: `/reclami?apri=<id>` **evidenzia la riga** e la porta sotto
    gli occhi. Il parametro si legge lato server e si passa come prop, come già
    fa il `prefill` — niente `useSearchParams`, che vorrebbe un `<Suspense>`
    attorno a tutta la lista.
  - ⚠️ **Se nel frattempo il reclamo è stato chiuso non sparisce**: il filtro di
    partenza è «aperti», e la pagina lo allarga a «tutti». Un link che porta a un
    elenco dove la cosa promessa non c'è è peggio di nessun link. ⚠️
    L'allargamento scatta **una volta sola** (`allargato`): senza la guardia, un
    id che non esiste più farebbe rimbalzare i filtri all'infinito, perché
    `carica()` rigira a ogni cambio di filtro.
  - **Il bersaglio cliccabile era il solo nome.** Su righe che si leggono per
    intero — nome, canale, testo, da quanto aspetta — il collegamento erano poche
    decine di pixel: si mirava al testo del messaggio e **non succedeva niente**,
    da telefono peggio ancora. Ora **l'intera riga è il collegamento**, in tutti
    e tre gli elenchi (chi aspetta, ordini, reclami). Dentro quelle righe non ci
    sono altri comandi, quindi un link che avvolge tutto non annida niente di
    interattivo, e `.riga-collegamento` eredita il `flex` della riga: l'aspetto
    non cambia. Stessa lezione dei bersagli da 24px di luglio.
  - ⚠️ **Le tessere dei numeri in cima restano collegamenti all'elenco** (consegne
    di oggi, reclami aperti, rimborsi da decidere): lì l'«elemento» è un conteggio,
    non una riga. Per farle atterrare su un elenco già filtrato servirebbero
    filtri via URL che quelle pagine oggi non leggono.
  - ⚠️ **Resa a schermo NON verificata**: la dashboard sta dietro il login e in
    questa sessione non c'è un account. Verificati `tsc`, `build` e che le rotte
    col parametro rispondano in produzione (307 al login, come tutte).

- **IL LINK DELLA CHAT PORTA SUL SITO, E LA × LA NASCONDE** (17/08/2026, LIVE).
  `/chat/<codice>` era una chat a pagina intera su sfondo vuoto: chi arriva
  dalla bio di Instagram o da un QR non vedeva il negozio, e premendo la ×
  veniva portato via da una pagina che non aveva nient'altro. Ora, se il sito ha
  il widget, il link rimanda a `https://<dominio>/#chat` e `widget.js` si apre
  da solo: la × torna a fare quello che fa ovunque — **nasconde** la chat e
  lascia il bottone per riaprirla, col negozio sotto.
  - ⚠️ Si usa il **frammento**, non un parametro di query: non arriva al server,
    non finisce nei log né nelle statistiche del sito, e non sporca gli `utm` da
    cui l'inbox ricava la provenienza del visitatore. Dopo l'apertura si toglie
    dall'indirizzo con `replaceState` — senza, un aggiornamento della pagina o il
    tasto indietro riaprirebbero la chat addosso a chi l'aveva appena chiusa.
  - ⚠️⚠️ **Nuova spunta `WidgetSito.apreSulSito`, DI PARTENZA SPENTA, e non
    basta che il dominio sia compilato.** Se su quel sito `widget.js` non c'è, il
    cliente atterra su una vetrina senza nessuna chat e il link diventa un
    **vicolo cieco** — peggio di prima. Controllato il 17/08/2026 scaricando le
    home: **deluxyflowers.com sì, cakedesign.me sì, deluxy.it NO.** Per questo la
    decisione sta in una spunta che accende una persona (pagina «Widget dei
    siti»), non in una deduzione del codice.
  - **VERIFICATO END-TO-END sul `widget.js` pubblicato**, da una pagina di prova
    che lo carica come farebbe un sito vero: con `#chat` la chat si apre da sola
    (`eAperta() === true`), il frammento sparisce dall'indirizzo mentre la query
    resta, la × la chiude **senza cambiare pagina**, il bottone flottante resta e
    la chat si riapre. File di prova rimosso.

- **LE CONVERSAZIONI SI PRENDONO IN CARICO** (17/08/2026, LIVE). Gli operatori
  sono tre e l'inbox è una sola: *chi aveva fatto cosa* restava scritto
  (`Messaggio.utenteNome`), ma nessuno *prendeva in carico*. Due persone
  potevano rispondere allo stesso cliente nello stesso momento, e il cliente
  riceveva **due risposte diverse dalla stessa azienda**.
  - Campi `Conversazione.presaDaId` / `presaDaNome` / `presaIl`. Nel client:
    bollino sulla riga (**oro** se è di un collega, **grigio** se è mia),
    bottone «Me ne occupo io» nella testata del thread, linguette
    **Tutte / Mie / Libere** coi conteggi.
  - ⚠️⚠️ **NON È UN LUCCHETTO, ed è una scelta.** Prendere in carico **segnala,
    non blocca**: in un servizio clienti un blocco vero si ritorce sul cliente
    — chi ha preso la conversazione va a pranzo, il cliente aspetta, e chi
    potrebbe rispondere trova la porta chiusa. **Il pezzo che serve davvero non
    è il badge: è l'avviso fra chi scrive e il campo di risposta** («Se ne sta
    occupando Federica — controlla prima che non l'abbia già fatto»). Il badge
    nell'elenco lo leggi solo se lo guardi; l'avviso sta nell'unico punto in cui
    è impossibile non vederlo.
  - ⚠️⚠️ **L'aggiornamento è CONDIZIONATO** (`updateMany` con
    `presaDaId: { in: ['', io] }`). Con un `update` secco due operatori che
    premono nello stesso secondo leggerebbero **entrambi il proprio nome** e
    risponderebbero insieme: esattamente il guaio che la funzione esiste per
    evitare. Il secondo riceve **409** e la conferma «se ne sta già occupando
    X, vuoi prenderla comunque tu?».
  - ⚠️ **Rispondere prende in carico da solo, ma solo se è libera.** Chiedere un
    secondo clic vuol dire che nove volte su dieci non lo si fa. Ma se ce l'ha
    già un altro **non gliela si porta via di soppiatto**: sparirebbe dal suo
    elenco «Mie» un cliente che pensa di seguire.
  - ⚠️ **Si libera solo la propria**: liberare quella di un collega con un clic
    è togliergli il cliente da sotto le mani senza che se ne accorga. Per
    prenderla davvero c'è la conferma, che almeno è un gesto dichiarato.
  - ⚠️ Il **ritorno indietro** dell'aggiornamento ottimistico è obbligatorio,
    per la regola imparata poche ore prima col widget (qui sotto): un'interfaccia
    che non sa disfare mostrerebbe il proprio nome su una conversazione che il
    server ha assegnato a un altro.
  - ⚠️ **RESA A SCHERMO NON VERIFICATA da chi ha scritto il codice**: servono le
    credenziali di un account, e su questo database **condiviso** non se ne
    creano di prova (la regola vale ancora, vedi in fondo). Verificati
    `npx tsc --noEmit`, `npm run build` e che `prisma db push` sia **additivo**
    (nessun `--accept-data-loss`). Chi riprende: la prima cosa da guardare è
    l'inbox con due account diversi aperti insieme.

- **⚠️⚠️ LA CHAT DEI SITI BUTTAVA VIA OGNI MESSAGGIO DEI VISITATORI** (17/08/2026,
  LIVE). Dal **30/07 al 17/08** chi scriveva dal widget di un sito non è mai
  stato letto da nessuno: **18 conversazioni, tutte con zero messaggi**.
  - **Perché.** Da quando i siti passano `data-sito`, `/api/widget/sessione`
    scrive lo **slug del sito** (`cake`, `flowers`, `deluxy`) in
    `Conversazione.numeroId`; ma `/api/widget/messaggi` cercava la riga con la
    chiave unica a tre campi e `numeroId: ''`. Con lo slug valorizzato la
    `findUnique` non trovava **mai** la conversazione: GET e POST rispondevano
    404. Ora si cerca per **canale + token** con `findFirst` — il token è 24 byte
    casuali, identifica da solo.
  - ⚠️ **Il difetto non si vedeva perché il widget FINGEVA**: la bolla del
    messaggio compariva a schermo (eco locale) anche quando il server aveva
    rifiutato, e il visitatore restava ad aspettare una risposta che non poteva
    arrivare. Ora se il server rifiuta **la bolla sparisce**, il testo torna nel
    campo e compare «Messaggio non inviato»; su 404 si dimentica il token, così
    l'invio successivo riapre la sessione.
    **REGOLA: un'interfaccia ottimistica deve saper tornare indietro.** Una che
    mostra sempre «inviato» non è ottimista, è muta — e nasconde il guasto
    proprio a chi lo sta subendo.
  - Trovato da una revisione multi-agente e **confermato contando in tabella**,
    non dedotto dal codice.

- **IL TITOLO DEL WIDGET NON TORNA PIÙ «DELUXY» SOTTO GLI OCCHI DI CHI SCRIVE**
  (17/08/2026, LIVE). Coda del punto sopra: il **polling** di
  `/api/widget/messaggi` non passava `sito`, e il server senza quel parametro
  risponde con titolo e saluto **generali**. Effetto: chi apriva la chat su
  cakedesign.me leggeva «CakedesignMe», poi al primo giro dopo l'invio
  l'intestazione diventava **«Deluxy»**, cioè il nome di un altro marchio.
  - **Misurato in produzione, non supposto**:
    `/api/widget/messaggi?sito=cake` → «CakedesignMe», senza parametro →
    «Deluxy». Ora `sito` viaggia in **tutte e tre** le chiamate (ripresa con
    token, ripresa senza token, polling) ed è fra le dipendenze di `aggiorna`.
  - **Verificato sul bundle pubblicato**, non solo sul deploy riuscito: nel
    chunk live di `/widget` compaiono tutte e tre le concatenazioni
    (`?sito=` una volta, `&sito=` due).
  - Nella stessa passata: l'hover/attivo delle intestazioni ordinabili usava
    `var(--text-primary)`, **token che non esiste** (in `tokens.css` è `--text`)
    e che non compare più da nessuna parte nel repo — era una regola morta, il
    colore non cambiava mai.

- **LA × DELLA CHAT PUBBLICA RIPORTA IL CLIENTE DA DOVE ERA VENUTO** (15/08/2026,
  LIVE). Su `/chat/<codice>` la × dentro l'iframe mandava `deluxy-widget:chiudi`
  alla pagina ospite, come sui siti — ma qui la pagina ospite siamo noi e non la
  ascoltava nessuno: il cliente premeva e non succedeva niente.
  `src/components/RitornoChatPubblica.tsx` (montato dalla pagina) ascolta il
  messaggio (solo dalla nostra origine) e torna: **indietro nella storia** se
  c'è una pagina prima; **sul sito del marchio** (`WidgetSito.dominio`) se la
  scheda è nuova; altrimenti prova `window.close()`.
  - ⚠️ «Scheda nuova» = una voce di storia, **oppure due senza referrer**:
    about:blank + la chat, come quando la apre uno script o un lettore di QR.
    Trovato provando: con `history.length` 2 l'indietro portava su una pagina
    bianca.
  - ⚠️ `history.back()` non promette di navigare: dopo averlo chiesto si aspetta
    500 ms e, se non è arrivato `pagehide`, si va sul sito. Non si guarda
    `document.hidden`: una scheda in secondo piano è ancora questa pagina.
  - Verificato in produzione: da una scheda che veniva da `/login` la × torna
    su `/login`; da una scheda nuova va su `deluxy.it`.

- **L'ORDINE DELL'ARCHIVIO SI APRE, E LA TABELLA SI ORDINA** (15/08/2026, LIVE).
  In «Ordini globali» le righe dell'**Archivio storico** — gli ordini più vecchi
  dei 60 giorni che teniamo in casa — non facevano niente al clic: si cercava un
  ordine vecchio e la ricerca finiva lì.
  - Ora aprono lo **stesso pannello** degli altri, costruito in una sola chiamata
    a Orders: prodotti con le foto, biglietto, destinatario, recapiti, lingua del
    cliente. Rotta `GET /api/ordini/archivio/dettaglio?numero=&orderId=`,
    costruzione in **`src/lib/dettaglio-ordine.ts`** (che ora serve anche la
    rotta locale: era la stessa forma scritta due volte).
  - ⚠️ **Se quell'ordine è ANCHE in casa, si apre la versione locale.** La
    ricerca dell'archivio pesca pure i recenti: senza questo controllo (per gid
    Shopify) lo stesso ordine avrebbe mostrato metà azioni a seconda della
    tabella da cui lo si apriva.
  - ⚠️ **Le azioni che scrivono non si offrono** su un ordine che non abbiamo
    (Gestito, messaggi del cliente): un bottone che fallisce dopo il clic è
    peggio di un bottone assente. Il pannello dice **perché**: «archivio storico
    (sola lettura)». Reclamo e rimborso invece restano — `Reclamo.ordineId` e
    `Rimborso.ordineId` nascono già col vuoto ammesso proprio per questo caso.
  - ⚠️ Il gid Shopify non è un vezzo: **`#1894` esiste su due negozi**, e nella
    verifica i candidati col numero erano due. Si sceglie per gid.
  - **Verificato sui dati veri** (ordine #1894 del 31/12/2025, fuori dalla copia
    locale): tornano cliente, telefono, tipo, fascia di consegna `12-16`, stato
    «Nuovo», **destinatario diverso dal mittente** (Almarri → Alfarraj), 1
    prodotto **con foto** e 93 caratteri di biglietto.
  - **Le intestazioni della tabella ORDINANO** (negozio, data, consegna, cliente,
    tipo, telefono, totale, lavorazione): primo clic il verso utile, secondo lo
    rovescia, terzo si torna all'ordine per **urgenza** — che non è «nessun
    ordinamento», è quello di lavoro, e senza una via di ritorno servirebbe
    ricaricare la pagina.
  - ⚠️ **Ordina il SERVER** (`ordiniOrdinati` in `/api/ordini`), per la stessa
    ragione dell'urgenza: la lista è tagliata a **200 su 1.216**, e ordinare nel
    browser avrebbe riordinato i 200 che il server aveva già scelto — «il totale
    più alto» sarebbe stato il più alto *fra quelli mostrati*.
  - ⚠️ **Il vuoto va in fondo in tutt'e due i versi**: 40 ordini senza nome e 160
    senza telefono aprivano l'elenco crescente con righe bianche. Le date di
    consegna mancanti con `nulls: 'last'`, i campi di testo con due query (i
    pieni, poi i vuoti) — verificato: 0 righe vuote fra le prime 200 di
    «Cliente ↑».
  - ⚠️ **Il numero d'ordine NON è ordinabile**, e l'intestazione lo spiega: è
    testo e i tre negozi numerano con lunghezze diverse, quindi «#12121»
    finirebbe prima di «#1623». Un ordinamento che sembra giusto ed è sbagliato
    è peggio di uno che non c'è; per il cronologico c'è *Data*.
  - Corretta anche la riga «mostrati i N **più recenti**», che era falsa: sono i
    primi N *dell'ordine in corso*.

- **SI LEGGE IN ITALIANO E SI RISPONDE NELLA LINGUA DEL CLIENTE** (31/07/2026).
  Come su AI Mail, ma qui vale su tutti i canali (WhatsApp, Messenger,
  Instagram, widget, email).
  - **La lingua si riconosce in CODICE, gratis**: si contano le parole più
    comuni (`src/lib/lingua-testo.ts`, stesso impianto di
    `deluxy-mail/src/lib/rilevaLingua.ts`). ⚠️ Nel webhook non entra nessuna
    chiamata a OpenAI: una chiamata lenta lì manda Meta in timeout, cioè fa
    **perdere messaggi**. La lingua si scrive su `Messaggio.lingua` appena il
    messaggio arriva; la traduzione si compra dopo.
  - **Si traduce solo quello che non leggiamo**, e solo **all'apertura** della
    conversazione (`POST /api/conversazioni/[id]/traduci`). Le lingue lette e
    l'interruttore «traduci da solo» stanno in Impostazioni → *Lingue e
    traduzione* (`lingueLette`, `traduzioneAuto`). La traduzione si salva:
    riaprire non la ricompra.
  - Nella bolla si parte **dalla traduzione**, con «Originale (inglese)» a un
    clic: chi apre una conversazione in olandese deve capirla subito, ma su una
    data o un indirizzo si controlla l'originale.
  - **La risposta AI esce nella lingua del cliente** anche con la traduzione
    spenta. ⚠️ L'istruzione sta in fondo al prompt e in maiuscolo: gli script
    sono in italiano e occupano dieci volte lo spazio, quindi trascinano il
    modello: senza dirglielo esplicitamente rispondeva in italiano a chi aveva
    scritto in inglese.
  - **Quello che scrivi tu non parte mai tradotto da solo**: «Traduci in
    inglese» mette la traduzione nel riquadro e la mandi tu. Una frase che un
    cliente legge e in azienda non ha letto nessuno non esiste.
  - ⚠️ **Il rumore decide la lingua, se non lo togli.** Misurato sugli ultimi
    384 messaggi veri: contando le parole *senza* togliere URL ed entità HTML,
    **12 newsletter italiane e inglesi risultavano portoghesi** — in una mail
    dove il testo vero sono tre righe, un indirizzo lungo e una riga di
    `&#8203;` sono la maggioranza. Togliendoli: da 12 falsi a **2** (due
    «Respuesta automática» spagnole lette come portoghese, che comunque
    finiscono tradotte in italiano lo stesso). Serve anche un **margine di 2
    punti** sul secondo classificato: vincere per un punto è rumore.
  - Esito della misura: 180 inglese, 113 italiano, 89 non deciso (troppo corti:
    «ciao»), 2 portoghese. Con «leggo italiano e inglese» si traducono **2
    messaggi su 384** — la traduzione non è un costo di massa.

- **LA CHAT COME LINK: `/chat/<codice>`** (31/07/2026). La stessa chat del
  widget, ma senza un sito attorno: si manda per link. Bio di Instagram, firma
  delle mail, QR sul biglietto che va col mazzo, «scrivici qui» su WhatsApp. Le
  conversazioni arrivano in Inbox nella colonna del marchio giusto, perché sotto
  è sempre `/widget?sito=<slug>`.
  - ⚠️ **Il pezzo finale è un codice casuale, non lo slug.** Lo slug è pubblico
    per costruzione (sta nello snippet di ogni sito, lo legge chiunque guardi il
    sorgente): con `/chat/cake` bastava provare `/chat/deluxy` per aprire
    conversazioni a nome di un altro marchio. Il codice sta in
    `WidgetSito.codice`, 32 caratteri da `crypto.getRandomValues` — non
    `Math.random()`, perché due siti creati nello stesso istante possono uscire
    uguali e un codice uguale vuol dire scrivere al marchio sbagliato. **Non
    cambia mai**: cambiarlo romperebbe i QR già stampati.
  - ⚠️ **Va escluso dal middleware** (`chat` nel matcher), o il link mandato ai
    clienti finisce al login: cioè non funziona per nessuno tranne noi.
  - ⚠️ **I link rapidi sono relativi** («/collections/oggi») e qui non c'è un
    sito ospite a cui appoggiarli: `postMessage` non lo ascolta nessuno e il
    ripiego avrebbe aperto `deluxy-messaging.vercel.app/collections/oggi`. Il
    dominio del sito viaggia nell'URL dell'iframe (`&dominio=`) e il widget
    ricostruisce l'indirizzo vero.
  - Il link si copia da **Widget dei siti**, che crea il codice alla prima
    apertura per i soli siti **salvati** (a una proposta non si mandano
    clienti). Verificato in locale: codice valido → la chat di Cakedesign col
    suo saluto e il suo tema; codice inventato → «questa chat non esiste più»;
    **`/chat/cake` non funziona**; e le pagine protette continuano a
    rimandare al login (307).

- **IL NUMERO DI CHI SCRIVE, E UNA TESTATA CHE NON SI TAGLIA** (31/07/2026).
  - Su WhatsApp `idEsterno` **è** il numero del cliente (Meta lo manda senza
    «+»): ora si legge in chiaro accanto ai badge ed è un link `tel:`. Prima
    stava nel testo grigio `.dettaglio`, che è `flex: 1 1 auto` e quindi, appena
    la testata si riempiva, si accorciava fino a sparire: c'era e non si vedeva.
    Su Messenger e Instagram resta piccolo — lì è un id interno che non dice
    niente a nessuno.
  - ⚠️ **La testata ora va a capo sempre, non solo su mobile.** Con quattro
    azioni, tre badge e il numero, in una finestra da 760px la riga non ci stava
    e «Chiudi» finiva tagliato contro il bordo: si perdevano insieme il dato più
    utile e l'unica via d'uscita della finestra.
  - ⚠️ **La larghezza della finestra non era mai stata applicata.**
    `.pannello-thread` e `.pannello` hanno la stessa specificità e `.pannello`
    sta più in basso nel file: vinceva lei, quindi la chat è sempre stata larga
    760px invece degli 880 che c'erano scritti. Ora la regola è
    `.pannello.pannello-thread` (due classi) e la finestra è **1000px**: a
    quella larghezza la testata sta su una riga sola. Verificato a 1480 e a 900
    px sul CSS compilato: niente fuori dal bordo, «Chiudi» dentro, numero
    visibile, nessuno scorrimento orizzontale.

- **LA CONVERSAZIONE SI APRE ANCHE DAL TELEFONO** (31/07/2026). Da mobile la
  finestra della chat si rompeva in tre punti: i bottoni del riquadro di
  scrittura uscivano dal bordo (si leggeva «R…» e «Invia» non c'era), le azioni
  della testata (Riassunto/Archivia/Elimina/Chiudi) finivano fuori schermo
  perché la riga era `nowrap`, e le bolle larghe al massimo il 68% riducevano
  una mail a due parole per riga.
  - ⚠️ **Non si toglie nessuna azione per fare spazio**: i bottoni ci sono
    tutti, si accorcia la cornice (etichette a larghezza naturale, meno
    padding, font 13px) e si va a capo. Un'azione che sparisce su mobile è
    un'azione che non esiste, e chi risponde dal telefono ha più fretta.
  - Misurato a 375×812 sul CSS compilato: nessuno scorrimento orizzontale,
    tutti e quattro i bottoni della testata dentro lo schermo, i tre aiuti del
    composer su una riga sola e «Invia» da solo sulla sua (è l'unica azione
    irreversibile del gruppo). Cornice da 374px a 300px, cioè **399px per i
    messaggi invece di 324**.
  - Media query `max-width: 700px` in fondo a `globals.css`.

- **DUE RIGHE, UNA PERSONA: I CLIENTI SI UNISCONO A MANO** (31/07/2026). In
  `/clienti` la stessa persona compariva due volte con metà storia ciascuna.
  - I clienti non sono una tabella: si ricavano dagli ordini raggruppando per
    telefono (ultime 9 cifre) e, in mancanza, per email. Regge finché la persona
    usa sempre gli stessi recapiti.
  - ⚠️ **Non si può indovinare.** Misurato sui dati veri: «Nicolò Donato» sono
    **due righe** — `+393338052490 / nicolo.donato@deluxy.it` (5 ordini) e
    `+393498853209 / donatod.nicolo@gmail.com` (3 ordini). Nessun dato le
    collega: solo il nome, e il nome non è una chiave — unire due omonimi
    vorrebbe dire mostrare a un cliente gli ordini di un altro. Quindi l'app
    **consiglia** e una persona **decide**.
  - Su 865 righe: **23** hanno la stessa email di un'altra (indizio forte),
    **32** lo stesso nome (indizio debole). Il filtro «Possibili doppioni» le
    mostra ordinate per nome, così i gemelli stanno uno sotto l'altro.
  - Si spuntano le righe e si sceglie **quale resta**: non è estetica, il suo
    telefono e la sua email restano quelli «buoni», ed è a quelli che si scrive.
  - Nuova tabella `ClienteUnito` (`chiave` assorbita → `principale`):
    `src/lib/clienti-uniti.ts`, rotte `POST/DELETE /api/clienti/unisci`.
    **Nessun ordine viene toccato**, per questo «Separa» rimette tutto com'era.
  - ⚠️ **GOOGLE NON HA UN'API PER FONDERE DUE CONTATTI.** La People API sa
    creare, aggiornare e cancellare; «Unisci e correggi» esiste solo dentro
    contacts.google.com. Quindi «Allinea in Google»
    (`POST /api/clienti/google`) fa la metà che si può fare bene: il contatto
    principale prende **tutti** i numeri e **tutte** le email della persona, e i
    doppioni rimasti li elenca per nome. **Non cancella nulla**: un doppione è un
    fastidio, un contatto cancellato per sbaglio è una perdita (e può avere note,
    foto e gruppi che noi non vediamo).
  - Verificato sul database vero, andata e ritorno: 5 + 3 ordini → **8 ordini in
    una riga** col secondo numero mostrato come recapito in più, poi «Separa» e
    di nuovo 5 e 3. Nessuna riga di prova lasciata indietro.
  - **Pulizia fatta il 31/07/2026: da 865 righe a 834** (31 unite). Regola usata:
    resta la riga **con più dati**, e email + telefono insieme valgono più di
    tutto — dopo l'unione **nessuna** riga sopravvissuta è senza telefono o
    senza email. 22 gruppi per *stessa email*, 10 per *stesso nome + stessa
    città*. Lasciato aperto **1** gruppo: «Mustafa Moneir», stesso nome ma
    città diverse — potrebbero essere due persone, e quello lo decide una
    persona.
  - ⚠️ **STESSA EMAIL NON VUOL DIRE SEMPRE STESSA PERSONA**, e questo cambia la
    regola. `dandrea_michele@virgilio.it` stava su due righe con nomi diversi —
    *Danila Cattani* (Paris) e *Michele Dandrea* (Châtillon): una casella di
    posta condivisa in famiglia, non un doppione. Unite dalla pulizia e poi
    **separate a mano su decisione dell'utente**. Quindi «stessa email» resta
    l'indizio più forte che abbiamo, ma quando i **nomi sono diversi** va
    guardato prima di unire — nel dubbio si lascia stare, perché unire due
    persone fa vedere a un cliente gli ordini di un altro.
  - ⚠️ **GLI ANELLI**: unendo gli stessi due clienti prima a mano e poi in
    blocco, nei due versi opposti, si scrivono `A→B` e `B→A`. Le due unioni si
    annullano e le righe restano separate **senza che si capisca perché**
    (`mappaUnioni` interrompe il giro per non bloccare la pagina). Successo
    davvero su Donato. Ora `unisciClienti()` scioglie il vecchio legame quando
    la riga scelta era stata assorbita da una di quelle che si stanno unendo:
    **l'ultima parola è di chi sceglie adesso**.
  - ⚠️ **Le righe selezionate sono NUMERATE, e il bottone dice chi sparisce.**
    Gli omonimi sono il caso per cui questa funzione esiste, quindi i due
    bottoni uscivano identici — «Tieni Adhiraj singh rathore» e «Tieni Adhiraj
    singh rathore» — e sceglierne uno era un sorteggio. Ora ogni riga
    selezionata porta il suo numero e il bottone dice **«Tieni 1 — togli 2»**,
    col dettaglio (telefono, città) nel titolo al passaggio del mouse.
  - ⚠️ **Appena unita, la riga NON è più un doppione**: col filtro «Possibili
    doppioni» attivo spariva subito dopo l'unione, e la pagina diceva «Nessun
    cliente per donato» — sembrava di averla persa. Ora le chiavi unite in
    quella sessione viaggiano nel parametro `tieni` e saltano i filtri, e
    l'avviso lo dice a parole.
  - ⚠️ **«ALLINEA IN GOOGLE NON FA NULLA»**, e non era Google. La rotta
    funzionava (token ottenuto, cliente ricostruito, contatto trovato e nostro):
    a mancare era il **bottone**. In `/api/clienti` i recapiti uniti si
    raccoglievano dentro il ciclo, e se l'ordine più recente del gruppo
    apparteneva alla riga **assorbita**, quella riga apriva il gruppo dal ramo
    «else» e il suo recapito non veniva registrato: niente `uniti`, quindi
    niente badge «unito» e niente bottone — proprio sui clienti appena uniti.
    Ora i recapiti si raccolgono a parte e si assegnano dopo, e il conteggio
    delle righe assorbite (`assorbite`) è un dato suo, non dedotto dai recapiti.
  - ⚠️ Due contorni dello stesso problema: il **telefono non si completava**
    dagli ordini più vecchi (una riga unita mostrava «—» proprio dove il
    cliente un numero ce l'ha), e l'esito dell'operazione compariva **solo in
    cima alla pagina** — con 833 righe si clicca a metà elenco e l'avviso è
    fuori schermo, che si legge come «non fa niente». Ora il bottone dice
    «Allineo…» e l'esito si scrive **sulla riga**.
  - **Dall'elenco si apre la SCHEDA** (31/07/2026): dal nome del cliente si va a
    `/clienti/scheda`, con ordini passati, reclami, rimborsi, conversazioni, a
    chi manda di solito e quando ordina. È un link sul nome e non la riga
    intera: la riga ha già una casella da spuntare e due bottoni, e cliccarla
    per sbaglio sarebbe la norma.
  - ⚠️ **La scheda ora SEGUE le unioni.** Prima interrogava Orders con un solo
    identificativo: su un cliente unito avrebbe mostrato la metà da cui si
    entrava — il problema che l'unione doveva risolvere, spostato dove non si
    vede. Ora raccoglie tutti i recapiti del gruppo, chiede a Orders per
    ognuno (**tetto di 4**: ogni recapito è una chiamata di rete) e fonde le
    risposte per numero d'ordine. Verificato sui dati veri: Michele Capaccioli
    (i due numeri che differiscono di una cifra) apre **6 ordini** da entrambe
    le direzioni, e Rodrigo Taddeo dà la stessa scheda sia dalla riga
    principale sia da quella assorbita.

- **OGNI CANALE RISPONDE DAL SUO INDIRIZZO: INSTAGRAM HA UN GRAPH SUO**
  (30/07/2026). I direct Instagram si **ricevevano** ma non si potevano
  **mandare**: la risposta restava lì con «errore».
  - ⚠️ **Il prodotto «Instagram API con login di Instagram» rilascia token che
    cominciano per `IGAA`, e quei token vivono SOLO su `graph.instagram.com`.**
    Su `graph.facebook.com` non sono nemmeno leggibili: Meta risponde *cannot
    parse access token*, cioè un errore che sembra «token sbagliato» mentre il
    token è giusto ed è l'indirizzo a essere quello di un altro prodotto. Il
    Page Access Token di Facebook (`EAA…`) invece parla col Graph di Facebook,
    ed è quello che serve a Messenger e agli account Instagram collegati a una
    Pagina.
  - Quindi l'indirizzo **non si sceglie una volta per tutte nel codice**: lo
    decide il token di quell'account. `graphPerCanale()` in `src/lib/meta.ts`
    guarda il prefisso; `inviaPagina()` prende il **canale** come parametro e
    lo riceve dalla rotta `/api/conversazioni/[id]/messaggi` (che vale anche
    per le risposte dalla scheda dell'ordine, `MessaggiOrdine.tsx`: è la stessa
    rotta).
  - Se Meta dice che il token non sa nemmeno leggerlo, si riprova **una volta
    sola** sull'altro Graph: copre i casi che il prefisso non prende (un token
    vecchio, un account migrato). Se fallisce anche il secondo si torna
    l'errore del **primo**, che è quello che descrive la strada giusta per come
    è configurato l'account.
  - In `/account-meta` il campo del token ora dice quale dei due si sta
    incollando: chi lo prende dal Business Manager non ha modo di saperlo da sé.
  - ⚠️ **Non verificabile da qui**: serve un direct vero su Instagram e una
    risposta dall'app in produzione. Il permesso richiesto è
    `instagram_business_manage_messages`.

- **I NUMERI SI RICONOSCONO DALLA RUBRICA GOOGLE** (29/07/2026). Su WhatsApp
  arrivava il nome che il cliente si è messo sul profilo — «Nicolo», «Ale», a
  volte niente. In rubrica (`deluxy.delivery@gmail.com`, la stessa che l'app
  riempie dagli ordini) quel numero è già salvato come **«FL Mario Rossi
  #1042»**, che dice chi è e con quale ordine.
  - `src/lib/rubrica.ts`: `riconosciConversazione(id)` per una sola (bottone
    **Rubrica** nella testata del thread, risposta immediata) e
  `riconosciDaRubrica(25)` per il giro automatico — cron **`/api/cron/rubrica`
    al minuto 37**, sfasato da quello dei contatti (minuto 7) perché usano la
    stessa People API e insieme si rubano il tempo.
  - `Conversazione.nomeRubrica` è un campo **a parte** da `nome`: sono due cose
    diverse (il nostro nome e quello del profilo) e nessuna sovrascrive l'altra.
    In elenco vince la rubrica, e il titolino mostra entrambi.
  - `rubricaCercataIl` evita di richiedere ogni ora i numeri che non ci sono: un
    numero che manca oggi manca anche fra un'ora. Se Google non risponde la data
    **non** si scrive, così quella conversazione si riprova.
  - ⚠️ **Non si cerca dentro il webhook.** Una ricerca sono 2-3 chiamate HTTP:
    nel percorso che riceve i messaggi allungano la risposta a Meta e, se Google
    è lento, mandano il webhook in timeout — cioè fanno perdere messaggi.
  - Solo WhatsApp: su Instagram e Messenger l'id non è un numero di telefono e
    in rubrica non c'è niente da cercare.

- **GLI ORDINI MOSTRANO SE IL CLIENTE HA SCRITTO, E SI RISPONDE DA LÌ**
  (30/07/2026). Rispondere a un ordine senza sapere che quel cliente ha già
  scritto vuol dire richiedergli quello che ha già detto — o chiamarlo per una
  cosa che aveva spiegato per iscritto.
  - Sulla scheda dell'ordine compare **«✉ 2»**, in **oro quando ci sono messaggi
    non letti**: quell'ordine ha qualcuno che aspetta.
  - Nella scheda laterale, riquadro **«Messaggi del cliente»**: le conversazioni
    collegate con le ultime sei battute e un riquadro per **rispondere** senza
    uscire — la risposta passa dalla stessa rotta dell'Inbox, quindi esce dal
    canale giusto e dall'account che aveva ricevuto.
  - ⚠️ **Come si collega un ordine a una conversazione**, in ordine di certezza:
    il **numero d'ordine** scritto sulla conversazione (lo mette lo smistamento
    delle mail), l'**email**, il **telefono** (coda di 9 cifre, perché lo stesso
    numero gira come `349…` e come `39349…`). **Mai per nome**: due clienti
    possono chiamarsi uguale, e mostrare la conversazione di un'altra persona
    sotto l'ordine sbagliato è peggio che non mostrare niente. Il riquadro dice
    anche **come** è collegata («cita questo ordine» / «stessa email»).
  - ⚠️ In elenco i collegamenti si calcolano con **due query per tutta la
    pagina**, non una per ordine: con 200 ordini a schermo sarebbero 200 andate
    e ritorni al database a ogni caricamento della bacheca.
  - Misurato il 30/07: 17 conversazioni con un numero d'ordine, 9 mail che
    combaciano con l'email di un ordine, 5 chat WhatsApp da confrontare.

- **LINK RAPIDI NEL WIDGET: «Come ti aiutiamo?» → «Regali per oggi»**
  (30/07/2026). Sotto il saluto compaiono le opzioni, e ognuna porta a una
  pagina del sito: chi apre la chat vuole spesso una cosa che il sito ha già, e
  mandarcelo subito vale più di una risposta scritta bene dieci minuti dopo.
  Si configurano per sito in «Widget dei siti» (testo + indirizzo, massimo sei,
  `WidgetSito.linkRapidi` in JSON).
  - ⚠️ **Come funziona la navigazione, e perché non è banale**: i bottoni vivono
    dentro l'iframe, su un altro dominio, e da lì il browser **non lascia
    cambiare l'indirizzo della pagina ospite**. Quindi la chat *chiede* con
    `postMessage` e **decide `widget.js`**: accetta solo i messaggi che vengono
    dal nostro iframe e dalla nostra origine, apre i link **di quel sito** al
    posto della pagina e quelli esterni in una scheda nuova. Il controllo sta
    fuori perché un messaggio può arrivare da qualunque iframe della pagina.
  - Se sul sito c'è uno snippet vecchio che non ascolta i messaggi, dopo mezzo
    secondo il link si apre comunque in una scheda nuova: meglio una scheda in
    più che un bottone che non fa niente.
  - I bottoni **spariscono appena la conversazione comincia**: sopra la risposta
    di una persona sarebbero un invito ad andarsene.

- **DA DOVE ARRIVA CHI SCRIVE, E IL RIASSUNTO DELLA CHAT** (30/07/2026).
  - **PROVENIENZA** (`Conversazione.origine`, `origineDettaglio`,
    `paginaIngresso`): chi apre la chat dopo un annuncio non è chi arriva dal
    passaparola — cambia urgenza, tono e cosa vale la pena proporgli, e in Inbox
    erano tutti «Visitatore sito». `widget.js` legge sulla **pagina ospite**
    `utm_*`, la presenza di `gclid`/`fbclid`, il sito che ha mandato e il
    percorso della pagina; `src/lib/provenienza.ts` classifica in google-ads ·
    google · meta-ads · social · referral · **diretto**.
    - ⚠️ Dentro l'iframe non si potrebbe sapere: là `document.referrer` è il sito
      che ci ospita, non Google. Per questo lo raccoglie lo script di fuori.
    - ⚠️ **Niente cookie e niente storia salvata sul sito ospite**: si legge solo
      quello che c'è quando la chat si apre. Chi clicca l'annuncio oggi e scrive
      fra due giorni risulta «diretto» — che vuol dire «non lo sappiamo», e va
      detto così invece di costruirci sopra un tracciamento.
    - Del `gclid` si tiene **il fatto che c'è, non il valore** (identifica il
      singolo clic), e della pagina il **percorso senza query**: in quei parametri
      finisce di tutto, email comprese.
  - **RIASSUNTO AI** (bottone «Riassunto» nella testata del thread,
    `POST /api/conversazioni/[id]/riassunto`): legge la conversazione e ne tira
    fuori **data, ora, luogo, prodotto** più due righe di sintesi e cosa manca
    ancora da chiedere. Si salva su `Conversazione.riassunto`: riaprendo si
    rilegge, l'AI si scomoda solo con «Rifai».
    - ⚠️ **Ogni campo esce solo con la FRASE del cliente da cui viene**, e il
      controllo che la frase ci sia è **nostro**, non del modello: un campo senza
      citazione viene buttato. È la differenza fra «lo ha detto il cliente» e «lo
      ha pensato l'AI», e su una consegna quella differenza è tutta — un «08/12»
      che è una fascia oraria letto come l'8 dicembre manda i fiori quattro mesi
      dopo. Il prompt vieta esplicitamente di convertire «domani» in una data.
    - Quello che il cliente non ha detto resta **«non indicato»**, in un riquadro
      tratteggiato: è un'informazione, non un buco da riempire a intuito.

- **LA DIAGNOSI SI PUÒ FARE SU UN NUMERO SOLO** (30/07/2026). Con più numeri
  collegati «Perché non arrivano i messaggi?» rispondeva **errore**: ogni numero
  costa 4-5 chiamate a Meta e la richiesta sforava i 30 secondi della funzione.
  Si rompeva proprio lo strumento che serve a capire cos'è rotto — e un numero
  che non risponde portava giù la diagnosi di tutti gli altri.
  - `GET /api/whatsapp/diagnosi?numero=<phoneNumberId>` controlla solo quello: il
    conto delle chiamate resta fisso. In `/numeri-whatsapp` ogni scheda ha il suo
    **«Controlla questo numero»**; quello generale resta in fondo, con scritto
    accanto che su più numeri può sforare.
  - Un numero **sospeso** si può comunque controllare se lo si chiede per id: è il
    caso in cui si vuole capire perché è stato sospeso.

- **SI PUÒ SCRIVERE PER PRIMI: «NUOVO MESSAGGIO» IN INBOX** (30/07/2026). Prima
  si poteva solo *rispondere*: per scrivere a un cliente che non aveva mai
  scritto bisognava uscire dall'app. Bottone in cima all'elenco, finestra con tre
  cose nell'ordine in cui si pensa: **da quale casella** parte (predefinita
  preselezionata), **quale ordine** agganciare, **a chi** e cosa.
  - `GET /api/ordini/cerca?numero=1742` trova l'ordine e riempie destinatario e
    oggetto — ma **non sovrascrive** quello che una persona ha già scritto.
    Agganciare l'ordine fa anche finire il thread nella **colonna del suo
    marchio** invece che in quella della casella.
  - `POST /api/email/nuovo` invia dalla casella scelta (con la sua **firma**) e
    ⚠️ **crea la conversazione in Inbox**: se il nostro messaggio non lasciasse
    traccia, la risposta del cliente arriverebbe in un thread che comincia a
    metà. I non letti restano a 0 — le nostre uscite non sono un debito.
  - **Per ora solo posta.** Su WhatsApp scrivere per primi fuori dalle 24 ore
    richiede un modello approvato da Meta: è un lavoro a parte, non un campo in
    più in questa finestra.
  - **17 conversazioni email già arrivate rismistate** con
    `scripts/rismista-mail.mjs` (numero d'ordine → ordine in tabella → marchio):
    `#1742 → Cake` (era in Deluxy), `#2587 → FLowers`, `#12663 → Deluxy`… Su 125
    conversazioni senza marchio, 17 avevano un numero d'ordine che esiste in
    tabella; le altre sono newsletter e mail senza ordine.

- **IL WIDGET CHIEDEVA LA CONFIGURAZIONE PRIMA DI SAPERE IL SITO** (30/07/2026).
  Su cakedesign.me lo snippet mandava `data-sito="cake"` e l'API rispondeva
  «CakedesignMe», ma la chat mostrava «Deluxy — Ciao! Come possiamo aiutarti?»:
  i testi generali.
  - ⚠️ **La causa è l'ordine degli effetti.** Il sito veniva letto dentro un
    `useEffect`, e gli effetti girano tutti **dopo** il primo disegno: la
    richiesta al server partiva da un altro effetto quando `sito` era ancora
    vuoto, e non si ripeteva perché `sito` non stava fra le sue dipendenze.
  - Ora si legge nell'inizializzatore dello stato (`useState(() => …)`, con la
    guardia `typeof window`) e sta fra le dipendenze della richiesta.
  - **Verificato sulla pagina pubblicata**: `/widget?sito=cake` mostra
    «CakedesignMe» col saluto delle torte, `/widget` senza parametro mostra
    «Deluxy» coi testi generali.
  - Da tenere a mente: un valore che decide **quale** richiesta fare non può
    nascere in un effetto se la richiesta parte da un altro effetto.

- **LE NEWSLETTER SI TOLGONO DI MEZZO, E SI VEDONO SOLO GLI ORDINI**
  (30/07/2026). Misurato: colonna Deluxy con **85 conversazioni e 107 non
  letti**, quasi tutte newsletter e piattaforme (TikTok, chatbot Shopify,
  agenzie immobiliari) — il lavoro vero stava in mezzo. Due strumenti, diversi
  di proposito:
  - **Filtro «Solo ordini»** in Inbox: mostra le conversazioni con un numero
    d'ordine (o che lo citano) **più tutte le chat**, perché una persona che
    scrive su WhatsApp non è mai rumore anche se non nomina un ordine. È un
    filtro sulla vista, non tocca i dati.
  - **Mittenti da ignorare** (`/caselle`, `Impostazione.mittentiIgnorati`): le
    loro mail entrano **già archiviate** e non contano fra i non letti. Tre
    forme: `info@tiktok.com`, `@tiktok.com`, `tiktok` (pezzo dell'indirizzo, da
    usare con prudenza). Le righe con `#` sono commenti.
  - ⚠️ **Non è un antispam e non deve diventarlo.** Non si indovina se una mail è
    pubblicità: si ignorano i mittenti che **una persona** ha messo in elenco. Un
    filtro che decide da sé, il giorno che sbaglia, fa sparire la mail di un
    cliente e nessuno se ne accorge — perché il posto dove cercarla non esiste.
    Per lo stesso motivo si **archivia**, non si cancella.
  - ⚠️ **Entrambe agiscono all'ARRIVO**: le conversazioni già in casa restano
    dove sono. Per questo in Inbox si vedeva ancora «[cakedesign] Ordine #1742»
    nella colonna Deluxy. Il bottone **«Applica alle mail già arrivate»**
    (`POST /api/email/rismista`) ripassa fino a 500 conversazioni email: smista
    per numero d'ordine e archivia i mittenti in elenco. Non tocca chi ha già un
    marchio scritto a mano, e non cancella niente.

- **IL SITO SCELTO RESTA DOPO IL SALVATAGGIO** (30/07/2026). Sembrava che
  «Mostra anche il bottone tondo» si riaccendesse da sola dopo Salva. In tabella
  il dato era **giusto** (`mostraBottone: false`): a mentire era la schermata —
  dopo il salvataggio la pagina si rimonta e ripartiva dal **primo** sito
  dell'elenco, quindi chi aveva appena configurato Cakedesign si ritrovava
  davanti Deluxy con la sua spunta accesa.
  - Ora il sito scelto sta nell'**URL** (`?sito=cake`, aggiornato senza ricaricare
    quando si cambia scheda) e l'action **torna su quel sito** con `?salvato=1`,
    che mostra anche la conferma «Widget salvato per questo sito» — prima dopo
    Salva non compariva niente.
  - Da tenere a mente: un form che si rimonta perde lo stato del client. Se una
    scelta deve sopravvivere al salvataggio, va nell'URL o nel database, non
    soltanto in `useState`.

- **LA CHAT SI APRE DA UN LINK CHE C'È GIÀ SUL SITO** (30/07/2026). Sui siti la
  voce «Live Chat» del menu contatti esiste già e punta a un servizio esterno
  (`<a class="dialogify" href="https://chatting.page/…">`). Ora quel link può
  aprire la nostra chat senza mettere le mani nel tema: nello snippet
  **`data-apri-da="a.dialogify"`** (più selettori separati da virgola), e
  **`data-bottone="no"`** per togliere il bottone tondo quando quel punto
  d'ingresso basta. Si configurano per sito in «Widget dei siti»
  (`WidgetSito.selettoreApri`, `mostraBottone`).
  - ⚠️ Il clic si ascolta **sul documento**, non sull'elemento: i menu dei temi
    Shopify si costruiscono con JavaScript e quel link spesso non esiste ancora
    quando parte lo script. Con la delega funziona anche se compare dopo, e per
    tutti gli elementi che combaciano.
  - Un selettore scritto male non rompe il sito ospite: `closest()` sta in un
    `try` e in caso di errore il clic prosegue come prima.
  - Da codice resta `window.DeluxyChat.apri()` (già presente).

- **LE MAIL D'ORDINE SI SMISTANO PER SITO, E IL TOKEN INSTAGRAM SI RINNOVA DA SÉ**
  (30/07/2026).
  - ⚠️ **Le notifiche d'ordine dei tre siti arrivano tutte sulla stessa casella**:
    `[cakedesign] Ordine #1742…` finiva nella colonna della CASELLA («Deluxy»,
    perché la posta arriva a cs@deluxy.it) e non in quella del sito che ha
    venduto. Ora `src/lib/ordine-da-email.ts` prende il **numero d'ordine**
    dall'oggetto o dal corpo e lo **cerca nella tabella ordini**: se lo trova, il
    marchio è quello dell'ordine. È una ricerca, non una deduzione dal testo.
    - Misurato il 30/07: **981 ordini, zero numeri ripetuti** fra i siti (Deluxy
      12121–12684, Cake 1623–1742, Flowers 2318–2614). La tabella locale però
      tiene solo ~60 giorni: per una mail su un ordine più vecchio si scende al
      tag `[cakedesign]`, usato **solo se combacia con un solo negozio** — se ne
      pesca due o nessuno non si assegna niente.
    - `Conversazione.negozioId` + `ordineNumero`: il marchio scritto sulla
      conversazione **vince** su quello della casella. Il numero d'ordine si vede
      nella testata del thread.
  - **Si vede su quale ACCOUNT è arrivata**: nella testata, accanto al marchio,
    ora c'è `← cs@deluxy.it`. Prima con due caselle non si sapeva quale delle due
    avesse ricevuto — la prima cosa da sapere per rispondere. Per le mail
    l'etichetta è l'**indirizzo**, non il nome che ci siamo dati noi.
  - **Il CSS non si legge più nelle mail**: le notifiche Shopify cominciano con
    venti righe di `.button__cell { background: #d04c66 }` e il messaggio vero sta
    sotto, fuori schermo. `senzaCss()` in `src/lib/testo-email.ts` conta le graffe
    e butta le righe interne. ⚠️ Il riconoscimento è **stretto di proposito**:
    solo righe che COMINCIANO come un selettore, perché una riga di testo vero può
    finire con la virgola («Gentile cliente,») e non deve sparire. Provato su
    prosa con orari (`10:00-12:00`) e virgole: intatta.
  - ⚠️ **IL TOKEN INSTAGRAM SCADE OGNI 60 GIORNI** e non si rinnova da sé: al
    sessantesimo giorno i direct smettono di arrivare e non lo segnala nessuno.
    `src/lib/token-instagram.ts` + cron **`/api/cron/token-meta`** (ogni notte
    alle 4:50) lo rinnovano **dal quindicesimo giorno prima** della scadenza —
    Meta lascia rinnovare solo un token ancora valido, quindi «quando ce ne
    accorgiamo» è troppo tardi. In `/account-meta` si vede la scadenza di ogni
    account e c'è «Rinnova i token adesso».
    - **La strada migliore resta un'altra**: un token generato da un **utente di
      sistema non scade**. Su quello l'endpoint di rinnovo risponde errore, e
      l'app lo scrive come esito invece di ritentare ogni notte: un rinnovo che
      non serve non è un guasto.
  - **AVVISI DEL BROWSER**: bottone «Avvisi» in Inbox. Il permesso lo chiede un
    clic (i browser rifiutano la richiesta al caricamento, e chiederlo subito è il
    modo migliore per farselo negare per sempre) e l'avviso compare **solo a
    scheda non in primo piano**: se stai guardando l'inbox la conversazione nuova
    la vedi, e una notifica sopra ciò che guardi è rumore.

- **UN WIDGET PER OGNI SITO, CESTINO A 30 GIORNI, POSTA OGNI 5 MINUTI, FIRME,
  SUONO** (30/07/2026). Sei richieste in fila, tutte in produzione.
  - **`/aspetto-widget` → «Widget dei siti»**: si scegle il sito e la pagina
    PROPONE già la sua versione — tema, colore, scritta del bottone, titolo e
    saluto nella voce di quel brand (deluxy.it nero e oro e cerimonioso,
    l'atelier dei fiori minimale, Cakedesign caldo e con le emoji). Tabella
    nuova **`WidgetSito`**; la proposta **non si salva da sola**: finché nessuno
    conferma il sito è marcato «proposto», perché fra «così l'abbiamo deciso» e
    «così te lo suggeriamo» c'è la differenza fra una configurazione e
    un'ipotesi. Anche non salvata, però, la proposta è quella che il widget usa.
  - Lo snippet ora porta **`data-sito`**, e quello slug finisce in
    `Conversazione.numeroId`: in Inbox le chat dei siti vanno **nella colonna
    del marchio** invece di stare tutte in «Senza marchio». Gli snippet vecchi
    senza `data-sito` continuano a funzionare coi testi generali.
  - **CESTINO**: `Conversazione.eliminataIl`. Elimina non cancella più subito —
    la conversazione va nel cestino e ci resta **30 giorni**, poi
    `/api/cron/cestino` (ogni notte alle 4:20) la cancella davvero coi suoi
    messaggi. Terza linguetta in Inbox con Ripristina e «Cancella per sempre».
    ⚠️ Un messaggio nuovo **riporta fuori dal cestino** la conversazione: chi
    riscrive non sa che l'avevamo buttata.
  - **POSTA OGNI 5 MINUTI**: `/api/cron/posta`. Prima serviva premere «Scarica
    posta»: una mail delle 9:02 restava invisibile fino al clic. Finestra di 2
    giorni e non 7 — a 288 giri al giorno, rileggere una settimana di posta per
    trovare una mail nuova è lavoro buttato.
  - **FIRME PER CASELLA**: `CasellaEmail.firma`, in coda alle mail che partono da
    quella casella. `conFirma()` non la aggiunge se il testo già la contiene (le
    risposte pronte e l'AI a volte firmano da sole, e due firme si notano).
    Firmare una mail della pasticceria «Servizio Clienti Deluxy, guanti bianchi»
    è dire al cliente una cosa che per quel brand non esiste.
  - **SUONO ALL'ARRIVO**: due note generate con la Web Audio API (nessun file da
    caricare), con l'interruttore **Suono/Muto** in Inbox. ⚠️ I browser non
    suonano niente prima di un clic dell'utente nella pagina: è una regola loro.
    E si suona solo quando il totale dei non letti **cresce** — aprire l'inbox
    con 106 non letti non è un messaggio appena arrivato.
  - **Layout della testata del thread**: nome, badge e bottoni stavano su tre
    righe diverse. Ora la riga è una, e chi si accorcia è l'indirizzo.
  - ⚠️ **Perché una mail arrivata a Cake risultava «Senza marchio»**: la casella
    `info@cakedesignme.it` esisteva ma non era collegata a nessun marchio.
    Collegata a **Cake** (dato di produzione). Non l'ho dedotta dal dominio: il
    collegamento casella → marchio lo dichiara una persona, e «cakedesignme.it»
    somiglia a «Cake» ma somigliare non è essere.

- **IL WEBHOOK ACCETTA DUE FIRME, E I SEGRETI SI POSSONO CANCELLARE**
  (30/07/2026). Due cose che si tenevano per mano.
  - ⚠️ **«Instagram API con login di Instagram» ha una chiave segreta SUA** e
    firma i webhook dei DM con quella, non con l'App Secret dell'app Facebook.
    `POST /api/webhooks/meta` verificava con un segreto solo: gli eventi
    Instagram venivano respinti con **401**, e da fuori sembrava «Meta non ci
    manda niente» — si andava a controllare l'iscrizione al webhook, che era a
    posto. Ora si provano **tutti i segreti configurati** e basta che uno
    combaci. Nuovo campo in Impostazioni: **Chiave segreta di Instagram**
    (`igAppSecret`); vuoto = vale l'App Secret.
  - **Non si sceglie la chiave da `body.object`**: quel campo sta nel corpo, e il
    corpo non è ancora verificato — decidere quale serratura usare partendo da un
    dato non firmato vuol dire lasciarla scegliere a chi chiama. Provato: firma
    Instagram + solo App Secret → 401; con entrambi → accettata; firma di un
    estraneo → 401.
  - **I segreti ora si cancellano.** I campi segreti si salvavano solo se pieni
    (comodo: non si reincolla tutto a ogni modifica) e quindi **un token
    revocato o incollato per errore non si poteva togliere**, solo sovrascrivere.
    Nuovo componente `CampoSegreto` con la casella «Cancella il valore salvato»
    (arriva come `svuota_<chiave>`), usato da tutti gli 11 campi segreti della
    pagina. La cancellazione vince sul valore incollato: se qualcuno spunta e
    incolla, l'intenzione dichiarata è la casella.
  - La diagnosi ha una riga in più sulla chiave di Instagram.

- **LA GUIDA CUSTOMER SERVICE È DENTRO L'AI** (30/07/2026).
  `scripts/carica-guida-cs.mjs` (in catalogo) porta nell'app la parte della
  **Guida Customer Service Deluxy unificata v1.0** (14/07/2026, 49.000 caratteri)
  che serve a rispondere ai clienti: **27 risposte pronte**, **12 istruzioni** di
  tono per brand e canale, **1 documento** di riferimento.
  - ⚠️ **La divisione fatti / forma non è arbitraria.** Il prompt delle risposte
    rapide (`src/lib/ai.ts`) vieta all'AI di aggiungere fatti: prende il
    contenuto da uno **Script** e ne cambia solo la forma seguendo le
    **Istruzioni**. Quindi tempi, cut-off, costi e coperture stanno negli
    Script; tono, firma e lessico nelle Istruzioni. Mettere un fatto in
    un'istruzione vuol dire che non arriverà mai in una risposta.
  - Gli Script **non hanno un campo marchio**: quelli validi per un solo brand lo
    dichiarano in coda al `quando` («Vale SOLO per il marchio …»), che è il testo
    su cui l'AI decide. Senza, avrebbe proposto i guanti bianchi a chi scrive ai
    fiori.
  - **Restano fuori di proposito**: operatività interna (Shopify admin, bozze,
    tag, ticket Tidio), liste partner e fornitori, sconti riconosciuti, ricarichi
    +30%/+40%, costi a noi e margini, nomi delle persone interne.
  - ⚠️ **I punti in conflitto NON sono stati caricati come fatti.** La guida
    marca «DA VALIDARE» sei punti dove i due documenti sorgente si contraddicono
    — **numero della carta Postepay (due carte diverse)**, soglia di spesa per la
    chiamata di feedback, link per la recensione, tipo di compensazione, orari di
    contatto, formato del nome in rubrica. C'è un'istruzione esplicita che vieta
    di rispondere su quei punti. Far scegliere all'AI una delle due versioni
    voleva dire dare a un cliente un numero di carta sbagliato.
  - I 3 script che l'handoff chiamava «di prova» **sono rimasti**: «Ritardo nella
    consegna» ha **199 usi** e copre un caso che il set nuovo non ha. Allineate
    solo le categorie (`Consegne`→`Consegna`, `Amministrazione`→`Pagamenti`):
    nel selettore comparivano come gruppi separati.
  - **Non verificato con l'AI vera**: la chiave OpenAI è cifrata con l'`APP_SECRET`
    di produzione e da qui non si legge. Va provato dall'app pubblicata con
    «Risposta rapida» su un messaggio vero.

- **603 ORDINI VECCHI CHIUSI, E I RECLAMI APERTI IN PRIMA PAGINA** (29/07/2026).
  - `scripts/chiudi-consegne-passate.mjs` (in catalogo in `scripts/README.md`):
    segna **gestiti** gli ordini con consegna precedente a ieri. Eseguito in
    produzione: **603 chiusi**, da 907 a **304 da gestire**. `gestione` era
    arrivata dopo e nessuno aveva spuntato i vecchi: la bacheca metteva il
    lavoro di oggi sotto due mesi di archeologia.
    - Senza `--esegui` non scrive; `--giorni N` sposta il confine.
    - ⚠️ Non tocca i **286 ordini senza data di consegna**: non si sa se sono
      passati, e chiuderli a scatola chiusa vuol dire perderli. Sono il prossimo
      problema da guardare, ed è un problema di dati (Orders non manda la data),
      non di questa app.
    - `gestioneDaNome = "Chiusura automatica · consegna passata"`, non il nome di
      una persona: quel campo dice chi ha spuntato l'ordine, e una firma falsa in
      un registro di chi-ha-fatto-cosa è peggio del campo vuoto.
  - Nella schermata «Oggi» c'è il riquadro **Reclami aperti**: gravità in
    parole (lieve/media/grave), ordine, marchio, casistica + **prima azione da
    fare**, colpa e **da quanti giorni è aperto** — dal terzo giorno in rosso.
    Ordinati per gravità e poi per età: un grave di ieri prima di un lieve di una
    settimana, ma il lieve che invecchia non sparisce sotto.

- **SCHERMATA INIZIALE «OGGI», MENU RIORDINATO, PROMEMORIA** (29/07/2026).
  `/` non è più la bacheca ordini: è la **dashboard dell'operatore**. La bacheca
  sta su **`/ordini`**, che era un redirect ed è diventato la pagina vera —
  ⚠️ è anche l'URL registrato dell'app su Shopify, quindi chi arriva da lì
  continua a trovare gli ordini.
  - Fascia dei numeri (ognuno è un link a dove si lavora): chat da rispondere,
    consegne di oggi, ordini da gestire con quanti in ritardo, reclami aperti,
    rimborsi da decidere, pagamenti da inviare.
  - ⚠️ **Chat ed email sono contate a parte, e non è estetica.** Misurato:
    **106 conversazioni non lette, di cui 105 email** — quasi tutte newsletter.
    Un unico «106 da rispondere» sarebbe un allarme che suona sempre, cioè che
    non si guarda più. Il numero grande sono le chat; le mail stanno nella nota.
  - «Chi aspetta una risposta» ordina per: **finestra WhatsApp che sta
    scadendo** → chat → chi aspetta da più tempo. La finestra è l'unica cosa
    rossa della schermata: passate 24 ore dal messaggio del cliente, Meta non
    lascia più rispondere in testo libero e serve un modello approvato.
  - «Ordini da lavorare» usa le **stesse fasce di urgenza della bacheca**
    (`src/lib/urgenza.ts`: oggi → prossimi → scaduti da poco → senza data →
    scaduti da tempo) su tutti i marchi, solo i non gestiti. Le due schermate
    non devono raccontare priorità diverse.
  - I collegamenti portano sulla **riga precisa**: `/inbox?c=<id>` apre quella
    conversazione, `/ordini?apri=<id>` apre quel dettaglio.
  - **Menu laterale riordinato per priorità**: `Lavoro` (Oggi, Inbox, Ordini
    aperti, Calendario) · `Ordini` · `Reclami` · **`Qualità`** (Punteggi,
    Feedback, Giudizi, Valet) · Messaggi · Configurazione. Le misure servono a
    chi guarda indietro una volta a settimana, non a chi ha un cliente al
    telefono: erano in cima, ora sono in fondo.
  - **Promemoria** (`Attivita`, `/api/attivita`): si scrivono dalla dashboard,
    con scadenza facoltativa, e si spuntano. ⚠️ **Non sono il registro attività
    dell'ecosistema**: quello è **Deluxy Tasks** (porta 3090, API a chiave).
    Questi sono i promemoria attaccati al lavoro di questa schermata; quando la
    chiave di Tasks sarà configurata **vanno spinti anche là**, altrimenti
    diventano due registri. La cartella `deluxy-tasks/` non è su questo branch:
    il contratto dell'API va letto lì prima di integrare.

- **ICONCINE SULLA RIGA E LINGUETTA «ARCHIVIATE»** (29/07/2026). Archiviare
  richiedeva di aprire la conversazione: per fare pulizia di 112 newsletter è
  un clic di troppo per riga.
  - Ogni riga ha ora **due iconcine in basso a destra**: archivia (o «riporta in
    inbox», quando si è nell'archivio) ed elimina. Sempre visibili, smorzate —
    un'azione che compare solo se la cerchi non è un'azione rapida. Le icone
    sono SVG scritti nel componente: tre disegni non giustificano un pacchetto.
  - **Linguette «In arrivo» / «Archiviate N»** in cima all'elenco. Il numero
    dell'archivio arriva sempre dal server (`/api/conversazioni` lo torna anche
    quando si guarda la posta in arrivo), così si sa quante se ne sono messe via
    senza dover cliccare. `?archiviate=1` filtra al contrario, stesso
    raggruppamento per marchio.
  - ⚠️ **La riga è un `div role="button"`, non più un `<button>`**: le iconcine
    sono bottoni, e un bottone dentro un bottone è HTML non valido — i browser
    lo "riparano" buttando fuori i figli e la riga si scompone. Con
    `tabIndex` + Invio/Spazio resta raggiungibile da tastiera.
  - ⚠️ Sulle iconcine c'è `stopPropagation()`: senza, archiviare aprirebbe anche
    il thread di una conversazione che sta sparendo.

- **SI PUÒ TOGLIERE UNA CONVERSAZIONE DALL'INBOX** (29/07/2026). Nella testata
  del thread: **Archivia** (sparisce dall'elenco, resta nel database — è il
  gesto giusto per la pubblicità) e **Elimina** (cancella la conversazione **e
  tutti i suoi messaggi**, `onDelete: Cascade`, con conferma che dice cosa se ne
  va). `DELETE` e `PATCH` su `/api/conversazioni/[id]`.
  - ⚠️ **Nessuna delle due tocca la casella di posta vera**: la mail resta sul
    server IMAP. E con **«Scarica posta» una mail eliminata rientra**, se è
    ancora in posta in arrivo e dentro la finestra dei 7 giorni — la dedup
    guarda i messaggi che abbiamo, e quello cancellato non c'è più. Archiviare
    invece regge.

- **LE MAIL SI POSSONO SCRIVERE DA AI MAIL** (29/07/2026). `src/lib/ai-mail.ts`
  → `urlScriviAiMail()` costruisce il deep link
  `https://deluxy-mail.vercel.app/scrivi?a=…&oggetto=…&corpo=…&app=Deluxy Customer Service&rif=…`,
  la strada comune a tutte le app Deluxy (stessa convenzione di
  `deluxy-scout/lib/aimail.ts`).
  - Due punti d'ingresso: il bottone **AI Mail** nel riquadro di risposta delle
    conversazioni **email** (destinatario, `Re: oggetto` e bozza già dentro) e
    **Apri in AI Mail** nel pop-up di composizione degli Ordini.
  - ⚠️ **Quello che parte da AI Mail NON torna in questa conversazione**: il
    thread registra solo ciò che spedisce quest'app. È scritto accanto al
    bottone e nel titolino, perché è la cosa che si scoprirebbe dopo.
  - Il corpo si ferma a 6000 caratteri: oltre, l'URL non arriva (i browser
    tagliano intorno a 8000 e AI Mail taglia a 8000).
  - L'invio SMTP di quest'app **resta**: è quello che tiene la traccia in Inbox.
    Oggi però la casella `cs@deluxy.it` non ha la password salvata, quindi la
    posta da qui non parte davvero: finché è così, AI Mail è la strada che
    funziona.

- **RISPOSTE PRONTE PER TIPOLOGIA NEL RIQUADRO DI RISPOSTA** (29/07/2026).
  Bottone **Risposte** accanto a «Risposta rapida»: apre l'elenco degli Script
  attivi **raggruppati per categoria**, con ricerca; un clic e il testo entra
  nel riquadro dove sta il cursore. Il conteggio `usi` cresce, quindi i più
  usati salgono in cima.
  - Convive con la **Risposta rapida** (AI) e non la sostituisce: l'AI serve
    per i messaggi da capire, l'elenco per i casi che si riconoscono a colpo
    d'occhio — e non fa aspettare né sceglie al posto tuo.
  - Riusa `inserisciScript()` di `src/lib/script-testo.ts`: se nel riquadro c'è
    già un saluto, quello dello script si toglie. Senza, il cliente riceveva
    «Buongiorno… Buongiorno…» ogni volta.
  - ⚠️ **Niente invio automatico.** Il testo si mette nel riquadro e parte solo
    quando lo manda una persona. Un invio davvero automatico va deciso a parte:
    servono le regole di quando scatta, e sbagliarne una vuol dire scrivere una
    cosa sbagliata a un cliente vero senza che nessuno l'abbia letta.
  - Da fare: **i testi veri**. In tabella ci sono ancora i 3 script di prova
    creati per collaudare l'AI.

- **L'ETICHETTA DI UN ACCOUNT NON È UN MARCHIO** (29/07/2026). In Inbox
  comparivano quattro colonne — Cake, Deluxy, FLowers, **CakeDesignMe** — ma
  «CakeDesignMe» non è un brand: è il nome che avevamo dato al numero WhatsApp
  di Cake. Il ripiego «se il numero non ha un negozio, usa la sua etichetta»
  andava bene per il badge di una riga e **inventava un marchio** in una
  bacheca a colonne.
  - `risolutoreMarchio()` ora restituisce **due** cose: `marchioDi` (solo il
    negozio collegato, altrimenti vuoto → colonna «Senza marchio») e
    `etichettaDi` (come si chiama la linea, per il badge). Una linea non
    collegata adesso si vede che manca, invece di sembrare un brand in più.
  - Dati sistemati in produzione: il numero **CakeDesignMe → Cake**, e i due
    account Instagram **@deluxyflowers → FLowers**, **@cakedesignme → Cake**
    (erano senza marchio: appena Instagram riceve, sarebbero finiti fuori posto).

- **FOTO E ALLEGATI SU WHATSAPP, IN USCITA E IN ENTRATA** (29/07/2026). Prima si
  mandava solo testo, e di una foto ricevuta restava la scritta «[image]».
  - **In uscita**: bottone **Allega** nel riquadro di risposta (solo WhatsApp).
    Sono due chiamate, non una: `POST /{phoneNumberId}/media` per caricare il
    file e avere un id, poi il messaggio che punta a quell'id
    (`caricaMediaWhatsApp` + `inviaMediaWhatsApp` in `src/lib/meta.ts`). Il
    testo già scritto nel riquadro diventa la **didascalia**.
  - ⚠️ **Tetto 4 MB, e non è una scelta estetica**: la richiesta passa da una
    funzione serverless, che accetta ~4,5 MB di corpo. Oltre, il file non
    arriva nemmeno alla rotta e l'errore non spiega niente: meglio dirlo prima
    (`/api/conversazioni/[id]/allegati`).
  - **In entrata** il webhook ora salva `mediaId`, `mimeType` e `nomeFile` di
    foto, video, audio, sticker e documenti — e la **didascalia**, che prima si
    buttava insieme al resto (era il messaggio del cliente).
  - ⚠️ **Il file non lo teniamo noi.** Lo tiene Meta e lo dà a richiesta;
    `/api/media/[id]` fa da ponte. L'`id` nella rotta è quello del
    **messaggio**, non del media: così si sa quale token usare (quello del
    numero che ha ricevuto) e un id indovinato non tira fuori la foto di un
    altro cliente. L'indirizzo che dà Meta vale pochi minuti e vuole il token
    anche solo per leggerlo: come `src` di una `<img>` risponderebbe 401.
    Dopo ~30 giorni Meta il file non ce l'ha più e la rotta lo dice.
  - Non ancora: allegati su **email, Messenger, Instagram** (strade diverse —
    SMTP e altre rotte Meta); sugli altri canali il bottone non compare invece
    di comparire e fallire.

- **LE COLONNE SONO TUTTI I MARCHI, E LA CONVERSAZIONE SI APRE IN UNA FINESTRA**
  (29/07/2026). Seguito immediato della voce qui sotto, che nasceva monca.
  - Le colonne ora partono da **tutti i negozi attivi** (`Cake`, `Deluxy`,
    `FLowers`), non solo da quelli con un account Meta collegato: prima esisteva
    la sola colonna «FLowers» e deluxy.it non c'era.
  - **`CasellaEmail.negozioId`** (campo nuovo, `prisma db push` fatto): una mail
    non porta con sé «il nostro numero» come WhatsApp, quindi il marchio è
    quello della casella, dichiarato in **`/caselle` → Marchio**. Vuoto resta
    una risposta legittima (una casella che serve tutti i marchi).
    ⚠️ **Dato cambiato in produzione**: `cs@deluxy.it` è stato assegnato al
    marchio **Deluxy** (= deluxy.it), così le 112 mail hanno una colonna. Si
    cambia dal menu in `/caselle`.
  - A colonne il thread **non sta più di fianco**: la bacheca prende tutta la
    larghezza e la conversazione si apre in una **finestra** (`.velo` +
    `.pannello-thread`, gli stessi del dettaglio ordine) con Esc, clic fuori e
    bottone Chiudi. In vista Elenco resta il classico elenco + thread a destra.
  - ⚠️ **`src/lib/marchio-conversazione.ts`**: il marchio si calcola in UN posto
    solo, usato dalla pagina e da `/api/conversazioni`. Erano due logiche
    diverse — la rotta non conosceva Messenger/Instagram — e con l'inbox a
    colonne una conversazione **cambiava colonna da sola** al primo
    aggiornamento automatico (5 secondi dopo).

- **INBOX A COLONNE PER MARCHIO** (29/07/2026). L'elenco unico non rispondeva a
  «come stiamo andando su Flowers?». Ora `/inbox` apre con **una colonna per
  marchio** (stessa grammatica della bacheca degli Ordini: pallino, nome,
  conteggio, pill dei non letti) e il thread resta a destra; il bottone
  **Elenco/Colonne** riporta alla lista unica per ordine di arrivo. Sotto i
  1100px il thread passa sotto le colonne.
  - Le colonne partono dai **marchi collegati** (numeri WhatsApp + account Meta),
    così un marchio a zero messaggi si vede lo stesso: «oggi nessuno ha
    scritto» e «non è collegato» sono due cose diverse.
  - ⚠️ **Oggi la vista dice poco, ed è colpa dei dati, non della vista.**
    Misurato in produzione il 29/07: 112 conversazioni email + 1 WhatsApp, e
    **113 su 113 finiscono in «Senza marchio»**. Due motivi distinti:
    1. **le mail non hanno marchio**: `CasellaEmail` non ha un legame col
       negozio, e c'è una casella sola (`cs@deluxy.it`). Per dare un marchio
       alle mail servirebbe o un campo `negozioId` sulla casella, o una casella
       per marchio — è una decisione, non un dettaglio tecnico: il servizio
       clienti potrebbe legittimamente essere unico per tutti i marchi.
    2. **l'unica conversazione WhatsApp è arrivata su `numeroId`
       `1227556353776499`, che non è il numero registrato**
       (`677520672119409`, marchio «FLowers»): finché quell'id non è in
       `/numeri-whatsapp`, la conversazione resta senza marchio.

- **UNA MAIL APERTA IN INBOX SI LEGGE** (29/07/2026). Cliccando una mail, la
  schermata si smontava: elenco delle conversazioni bianco, testata e riquadro
  di scrittura fuori campo, e al posto del testo un muro di link di
  tracciamento SendGrid e di indirizzi di immagini.
  - ⚠️ **Il colpevole era un `min-height` mancante**, non la mail. In una
    colonna flex il figlio non scende sotto la dimensione del suo contenuto: con
    un messaggio lungo `.messaggi` non attivava mai il proprio scorrimento, e lo
    `scrollIntoView` di fine thread finiva per scorrere `.inbox` — che è
    `overflow: hidden` ma resta scorribile da codice. Aggiunto
    `min-height: 0` a `.inbox .thread` e `.thread .messaggi` in `globals.css`.
  - `src/lib/testo-email.ts`: le mail HTML arrivano come testo generato da chi
    le manda, con i link fra parentesi quadre e le immagini scritte per esteso.
    `ripulisciTestoEmail()` toglie immagini, parentesi, spazi invisibili e
    righe vuote a colonne; `pezziDiTesto()` rende i link cliccabili mostrando
    **solo il nome del sito** (un link SendGrid è lungo 300 caratteri).
  - La pulizia è **solo per gli occhi**: nel database il testo resta intero e la
    bolla ha «Testo originale» per rileggerlo com'era arrivato. Oltre 900
    caratteri si chiude con «Mostra tutto». L'oggetto della mail si vede in
    grassetto in cima alla bolla (`Messaggio.oggetto`, c'era già ma non usciva).
  - Ripulitura attiva **solo sul canale email**: su WhatsApp e widget scrive una
    persona e quello che manda va letto com'è.

- **IL WIDGET SI ADATTA AL SITO CHE LO OSPITA** (28/07/2026). Pagina
  **`/aspetto-widget`** («Widget dei siti»): sei temi, colore del sito,
  posizione, scritta accanto al bottone, anteprima e codice pronto da copiare.
  - I temi sono blocchi di variabili `--w-…` su `.widget-app[data-tema=…]` in
    `globals.css`: chiaro, scuro, deluxy, caldo, minimale, automatico. Il widget
    **non usa i token dell'app**, altrimenti cambiare tema non cambierebbe
    niente. Il colore del sito arriva da `data-accento` → `?accento=` e vince
    sul tema (una variabile sola, `--w-accento`).
  - ⚠️ **`public/widget.js` ora vive in uno SHADOW DOM.** Gira su siti che non
    controlliamo: un `button { … !important }` del tema ospite ci riscriveva il
    bottone. Verificato su una pagina di prova con CSS ostile: il bottone del
    sito diventa rosso, quadrato e maiuscolo, il nostro resta pillola, accento
    corretto, font di sistema; l'iframe ignora `border: 8px solid green` e
    `filter: invert(1)`.
  - Sul telefono (≤480px) la chat va a schermo intero e la × è **dentro** la
    chat: il bottone che l'ha aperta ci finisce sotto. `100dvh`, `16px` esatti
    sul campo (sotto, Safari zooma) e `env(safe-area-inset-bottom)`.
  - **IL WIDGET SI APRE ANCHE DAI PULSANTI DEL SITO** (30/07/2026). Lo shadow DOM
    protegge dai CSS altrui ma chiude fuori anche noi: il bottone flottante era
    l'**unico** modo di aprire la chat, e i siti hanno già il loro punto
    d'ingresso. Aggiunta `window.DeluxyChat` in `public/widget.js`: `apri()`,
    `chiudi()`, `alterna()`, `eAperta()`. Nient'altro è cambiato.
    - Primo uso: **cakedesign.me**, dove la voce «Live Chat» del pannello
      contatti portava a `chatting.page` — servizio esterno, il cliente usciva
      dal sito e la conversazione non arrivava mai in Inbox. Il tema intercetta
      il click e chiama `DeluxyChat.apri()`; il link vecchio resta come rete di
      sicurezza se il widget non si carica. Codice e trappole:
      `sviluppi-siti-deluxy/skills/sviluppi-siti-deluxy/reference/STATO-CAKEDESIGN.md`.
    - ⚠️ Chi si aggancia deve **chiudere il proprio pannello** prima di chiamare
      `apri()`: un menu a tendina che copre lo schermo lascia la chat dietro.
  - ⚠️ **La conversazione nasce al PRIMO MESSAGGIO, non al caricamento.** Prima
    bastava che il widget si caricasse: ogni visitatore di passaggio (e ogni
    anteprima, e ogni prova) lasciava in Inbox una conversazione vuota
    indistinguibile da un cliente in attesa. `GET /api/widget/messaggi` senza
    token risponde con titolo e saluto e basta; `POST /api/widget/sessione` lo
    chiama l'invio. Misurato: aprire la chat → 0 conversazioni, scrivere → 1.
  - L'anteprima (`/widget?anteprima=1`) è il widget vero con messaggi finti e
    **non parla col server**: le sei miniature dei temi avrebbero creato sei
    conversazioni ogni volta che si guarda la pagina.
  - Corretto un errore vecchio: il messaggio di benvenuto era marcato come
    scritto dal visitatore (`bolla out`); coi temi, che colorano la sua bolla,
    il nostro saluto sembrava suo.

- **CHI HA FATTO COSA: l'operatore resta scritto su ordini e messaggi**
  (28/07/2026). Con più persone sugli stessi ordini, «chi l'ha preso in mano» e
  «chi ha risposto al cliente» erano domande senza risposta.
  - `Ordine.gestioneDaId` + `gestioneDaNome`: chi ha cambiato lo stato di
    lavorazione (`/api/ordini/[id]/gestione`); in lista si legge nel titolino
    del badge. Verificato in produzione: ordine **#1738 → `da_gestire`, segnato
    da Nicolo Daniele Donato**.
  - `Messaggio.utenteId` + `utenteNome`: chi ha scritto il messaggio in
    **uscita** — risposte dall'Inbox (`/api/conversazioni/[id]/messaggi`) e mail
    dal pop-up (`/api/email/invia`). Si vede nella bolla accanto all'ora e nella
    riga «ultimo messaggio» della scheda cliente.
  - ⚠️ Il **nome è copiato, non collegato**: se quell'utente viene tolto resta
    scritto chi aveva risposto al cliente invece di un id orfano. E i campi sono
    **vuoti sullo storico**: partono da adesso, a posteriori non si indovina —
    «vuoto» non vuol dire «nessuno», vuol dire «prima di questa data».

- **PIÙ PAGINE FACEBOOK E PIÙ ACCOUNT INSTAGRAM** (28/07/2026). Stesso impianto
  dei numeri WhatsApp, esteso agli altri due canali Meta.
  - Tabella `PaginaMeta` (`canale` + `idPagina` unici insieme, `token` cifrato,
    `negozioId` per il marchio), pagina **`/account-meta`** «Facebook e
    Instagram» in Configurazione, `src/lib/pagine-meta.ts` per la traduzione.
  - Il webhook non butta più via il destinatario: legge
    `entry[].messaging[].recipient.id` (ripiego `entry.id`) e lo scrive nello
    **stesso campo** `Conversazione.numeroId` usato dal numero WhatsApp — fa lo
    stesso mestiere, tenere separate le conversazioni di marchi diversi.
  - Si risponde **dall'account che ha ricevuto**: `tokenPerPagina(canale, id)` e
    `inviaPagina(..., mittenteId)` che chiama `/{idPagina}/messages` invece di
    `/me/messages`. ⚠️ Con `/me` il token generale mandava il messaggio dalla
    pagina di un altro marchio.
  - ⚠️ **Il ripiego sul token generale qui non è un'equivalenza** (come invece è
    su WhatsApp, dove un token vale per tutti i numeri dello stesso Business
    Manager): ogni Pagina ha il SUO Page Access Token. Con più pagine, il token
    per pagina è obbligatorio, non facoltativo.
  - Verificato in locale con webhook firmato: lo stesso cliente che scrive a due
    pagine diverse crea **due conversazioni separate**, ciascuna col suo
    `nostroAccount` — prima ne faceva una sola con i due discorsi mescolati.
    Righe di prova cancellate per id.
  - Da fare quando arrivano gli account veri: incollare l'ID pagina/profilo e il
    token in `/account-meta` (in Impostazioni `fbPageToken` e `igToken` non sono
    mai stati riempiti), e spuntare `messages` per Messenger e Instagram
    nell'app Meta — il webhook è lo stesso già usato da WhatsApp.

- **INBOX MULTI-NUMERO: si sa su quale nostro WhatsApp è arrivato un messaggio**
  (27/07/2026). Preparato per l'arrivo dei numeri veri (l'utente ha connesso il
  WABA «Deluxy Flowers», ID 1473727904063695).
  `Conversazione.numeroId` + `numeroNostro`, chiave unica ora
  **`[canale, idEsterno, numeroId]`**; `NegozioShopify.waPhoneNumberId` collega
  numero → brand (campo in `/negozi`); `src/lib/numeri-whatsapp.ts` per la
  traduzione; l'Inbox mostra il brand accanto al canale, in elenco e in testata.

  ⚠️⚠️ **IL DIFETTO CHE C'ERA: il webhook buttava via `metadata`.** Meta dice
  SEMPRE su quale nostro numero è arrivato il messaggio
  (`value.metadata.phone_number_id` / `display_phone_number`) e non lo leggevamo.
  Con più WhatsApp Business (Flowers, Cake Design, Deluxy Cake Delivery…) le
  conseguenze erano tre, tutte silenziose:
   1. non si sapeva a quale marchio avesse scritto il cliente — e le istruzioni
      di CS AI sono **per brand**, quindi si sarebbe risposto col tono e la firma
      di un altro negozio;
   2. la chiave era `[canale, idEsterno]`, quindi lo **stesso cliente che scrive
      a due numeri finiva in UNA conversazione**, con due discorsi mescolati;
   3. la risposta usciva dall'unico `waPhoneNumberId` delle Impostazioni: per
      metà dei messaggi il numero sbagliato — dal telefono del cliente è
      un'altra azienda che gli scrive di un ordine che non ha fatto lì.
  Ora si risponde da `conversazione.numeroId`, con l'impostazione come ripiego
  per le conversazioni vecchie che il numero non l'hanno.

  **Verificato simulando il webhook vero** (forma Meta completa, due
  `phone_number_id` diversi collegati a FLowers e Cake): lo stesso cliente
  produce **2 conversazioni distinte**, ognuna col suo numero e il suo brand, e
  l'Inbox mostra «WhatsApp + FLowers» e «WhatsApp + Cake». Il dedup per
  `idMessaggio` regge (evento ripetuto → nessun messaggio in più).
  Dati di prova rimossi, e i `waPhoneNumberId` finti (prefisso 9999) azzerati
  sui brand veri: nessun numero inventato è rimasto in tabella.

  ⚠️ `prisma db push` chiedeva `--accept-data-loss` per il nuovo vincolo unico.
  Accettato **dopo aver verificato che `Conversazione` ha 0 righe**: l'avviso
  riguarda solo il fallimento in caso di duplicati, non la cancellazione. Su una
  tabella piena andrebbe fatta prima una migrazione che riempie `numeroId`.

  ⚠️⚠️ **PERCHÉ L'INBOX È ANCORA VUOTA: manca tutta la configurazione Meta.**
  Verificato in produzione: `metaVerifyToken`, `metaAppSecret`, `waToken`,
  `waPhoneNumberId`, `fbPageToken`, `igToken` sono **tutte mancanti**, e
  conversazioni/messaggi sono 0. Per RICEVERE non serve il token, servono:
   1. **Impostazioni → Verify token**: una parola scelta da chi configura;
   2. su developers.facebook.com, app Meta → WhatsApp → Configurazione →
      **Webhook**: URL `https://deluxy-messaging.vercel.app/api/webhooks/meta`,
      lo stesso verify token, e **iscrizione al campo `messages`**;
   3. il WABA va **iscritto all'app** (`POST /{waba-id}/subscribed_apps`);
   4. **Impostazioni → App Secret** (facoltativo ma consigliato: se c'è, il
      webhook accetta solo richieste firmate — vedi `x-hub-signature-256`);
   5. per **rispondere** servono anche token permanente e Phone Number ID;
   6. in **Negozi**, il Phone Number ID sul brand giusto, altrimenti in Inbox si
      vede il numero grezzo invece di «Deluxy Flowers».
  I token li crea una persona sul suo account Meta: non li genero io.

- **CORREZIONE: il biglietto sta nelle NOTE dell'ordine, non nell'attributo**
  (27/07/2026). Segnalato dall'utente, e i numeri gli danno ragione.
  `testoBiglietto(nota, attributo)` in `src/lib/orders.ts` unisce i due campi:
  la nota (`shopify.note`) è la fonte, l'attributo (`biglietto`) si aggiunge solo
  se dice qualcosa di diverso e non è già contenuto nell'altra.
  ⚠️ **Misurato su 800 ordini del registro**: `shopify.note` ha testo su **680
  (85%)**, l'attributo `biglietto` su **71** — e dei 70 con entrambi, **67 sono
  lo stesso testo**. Leggendo solo l'attributo (come faceva la prima versione)
  nove ordini su dieci risultavano «senza biglietto» pur avendone uno scritto:
  era il caso di **#12663**, dove la nota è «They say the best trips… Bien à toi,
  Arthur» e la sezione non compariva affatto.
  **Effetto della correzione, misurato in locale: buste da 77 a 758 su 938
  (dal 8,2% all'80,8%)**, dopo `POST /api/ordini/sync?completo=1`.
  ⚠️ **CONSEGUENZA DA DECIDERE**: un'icona presente sull'81% delle righe non
  distingue più niente — l'informazione è diventata l'ASSENZA (il 19% senza
  biglietto). Se dà fastidio, si inverte: si marca chi NON ha il biglietto. Per
  ora resta come chiesto, ma il numero va tenuto presente.
  ⚠️ La sezione nel dettaglio ora dice «note dell'ordine» e non «nota del
  cliente», e nello stato vuoto «Nessun biglietto: il cliente non ha scritto
  note»: le parole devono corrispondere al campo che si legge davvero.
  ⚠️ **Resta valida la regola di non interpretare il testo**: le note contengono
  spesso anche indirizzo, telefoni e istruzioni per il fornitore (e in un caso
  «30 Luglio 08/12», dove 08/12 è la fascia oraria). Si mostra tutto, si copia
  tutto, taglia una persona.
  ⚠️ **Lezione di metodo**: avevo scartato la pista «biglietto previsto» con una
  misura corretta (il Sì/No della variante NON c'entra — verificato) ma stavo
  leggendo un secondo campo sbagliato senza accorgermene, perché il campo si
  chiamava proprio `biglietto`. **Un nome giusto non garantisce il contenuto
  giusto**: quando un campo «di dominio» risulta pieno nell'8% dei casi, il
  sospetto va al campo, non ai dati.

- **La sezione Biglietto nel dettaglio c'è SEMPRE, con l'icona lettera**
  (27/07/2026). Prima spariva quando il campo era vuoto, e una sezione che
  scompare è ambigua: chi apre un ordine senza biglietto non sa se non c'è, se
  l'app non l'ha caricato o se va cercato altrove. Ora due stati espliciti —
  il testo con «Copia biglietto», oppure «Non indicato: su questo ordine il
  cliente non ha scritto niente». Verificati entrambi su ordini veri (#12372 con
  282 caratteri, e un ordine senza). L'icona è la stessa busta dell'elenco:
  icone diverse per la stessa cosa non si collegano.

  ⚠️⚠️ **«SE È PREVISTO BIGLIETTO» NON È UN DATO CHE ABBIAMO — MISURATO.**
  Sull'ordine dello screenshot (#12663) la riga è «Bouquet Beethoven —
  Medio-Grande / **No**», e sembrava naturale leggere quel «No» come «biglietto:
  no». **È una deduzione, e sarebbe stata sbagliata.** Su 800 ordini del
  registro:
    - la variante è la sola stringa dei VALORI (`variantTitle` di Shopify):
      i NOMI delle opzioni non li salva nessuno, quindi non si sa a cosa si
      riferisca quel Sì/No;
    - l'opzione finale Sì/No compare su **23 ordini su 800** (2 «Sì», 21 «No»):
      è una famiglia di prodotti, non un meccanismo generale;
    - **correlazione zero col biglietto**: i 2 ordini con «Sì» hanno **0** note
      del cliente, mentre il 9% dei 777 senza quell'opzione ce l'ha. Se il «Sì»
      fosse il biglietto, sarebbe il contrario.
    - nelle proprietà delle righe (che SONO strutturate, «chiave: valore»:
      Ingredienti, Base, Farcitura, Scritta sulla torta, Topping…) **non esiste
      nessuna chiave «Biglietto»** su 120 righe con proprietà.
  Quindi l'icona resta agganciata al solo segnale reale: **il testo scritto dal
  cliente** (`biglietto` non vuoto), 70 ordini su 800 (8,8%).
  **COME AVERE IL DATO VERO**: in `deluxy-orders` l'import Shopify chiede
  `variantTitle`; va aggiunto `selectedOptions { name value }` sul line item —
  lì il nome dell'opzione c'è. Poi si espone nell'API e qui l'icona può dire
  «biglietto previsto» come fatto e non come indovinello. Serve un re-import per
  riempire lo storico.

- **«DA MOBILE LA MAIL NON SI APRE»: bersagli troppo piccoli, e l'indirizzo che
  non si toccava** (27/07/2026).

  Il pop-up di posta **funzionava**: aperto da uno schermo da 375px con una
  sequenza di tocco vera (touchstart/touchend + click) si apre, sta dentro lo
  schermo, e col dettaglio già aperto riceve lui il tocco (stesso z-index 60 ma
  più avanti nel DOM — verificato con `elementFromPoint`). Il guasto era prima
  del pop-up: **non si riusciva a premere il bottone**.
  ⚠️ **Misurato: le nove azioni di una scheda erano alte 24px** — «Email» 47×24,
  con «Chiama» e «Reclamo» appiccicati ai lati. Il minimo per un polpastrello è
  44px (Apple) / 48 (Google). A 24px si manca, e mancare qui vuol dire o non far
  succedere niente o aprire il pannello dell'ordine: da fuori sembra che la mail
  sia rotta. Ora sotto gli 800px i comandi sono **alti 40px** con 8px di stacco
  (verificato: Email 63×40, nessun bottone sotto i 40). Sul desktop restano
  piccoli: lì si punta col mouse e lo spazio serve per far stare più ordini.
  ⚠️ **Nel dettaglio l'indirizzo email era testo semplice.** Su un telefono è la
  cosa più naturale su cui premere — è scritto lì e sembra un link — e non
  faceva niente. Ora è un bottone (`.come-link`) che apre il modulo già
  compilato; verificato: destinatario e oggetto «Ordine #1736» precompilati.
  La bozza (`bozzaMail`) è stata tirata fuori dall'IIFE dei canali e calcolata
  una volta sola, così la usano sia il bottone «Email» sia l'indirizzo.
  Anche il telefono, che era testo, ora è un `tel:`.
  ⚠️ Nota di metodo: la prima ipotesi (il pop-up non si apre su mobile) era
  sbagliata, e l'ho scartata riproducendo invece di correggere alla cieca. Il
  difetto vero non era nel codice del pop-up ma nella dimensione dei bottoni —
  una cosa che si vede solo misurando i rettangoli su un viewport da telefono.

- **PAGINA UTENTI + REGISTRAZIONE LIBERA CHIUSA** (27/07/2026).
  `/utenti` (voce di sidebar sotto Configurazione): un amministratore apre gli
  account dei colleghi, cambia ruolo, cambia password e toglie l'accesso.
  Libreria `src/lib/utenti.ts` (ruoli, controlli), azioni in
  `src/app/(app)/utenti/actions.ts`.

  ⚠️⚠️ **ERA UN BUCO, NON UNA FEATURE MANCANTE.** `/registrati` era **aperta a
  chiunque**: chi conosceva l'indirizzo dell'app si apriva un account ed entrava
  fra 929 ordini con nomi, indirizzi, telefoni ed email dei clienti, i reclami e
  i rimborsi. Era nata come bootstrap («il primo che si registra è admin, gli
  altri operatori») ma restava aperta per sempre. Ora la registrazione libera
  passa **solo se non esiste NESSUN utente**, per creare il primo
  amministratore; tolto anche il link «Non hai un account? Registrati» dal
  login, che altrimenti invitava a un giro a vuoto.

  ⚠️ **Il controllo del ruolo sta in OGNI server action, non nella pagina.** Una
  server action è un endpoint: nascondere il bottone non impedisce di chiamarla.
  **Verificato costruendo a mano il modulo** che la pagina non mostra
  all'operatore (con l'`$ACTION_ID` preso dall'HTML dell'admin) e inviandolo:
  da operatore l'account NON viene creato, con lo stesso identico modulo da
  admin viene creato. Il controllo vale perché ci sono entrambe le prove — la
  prima volta avevo provato con curl e falliva anche da admin, quindi non
  dimostrava niente: una richiesta malformata non è un cancello che funziona.

  ⚠️ **L'ultimo amministratore non si può togliere né retrocedere**
  (`puoEssereRimosso` / `puoCambiareRuolo`): senza, un clic distratto chiude
  tutti fuori dalla gestione degli account e da dentro l'app non si rientra più.
  **NON verificato end-to-end**: al momento c'è **un solo** amministratore
  (quello vero) e provarlo vorrebbe dire tentare di cancellare l'account del
  titolare su dati veri. Verificati i conteggi su cui la regola si regge
  (`altriAmministratori` esclude l'id giusto, e con un id inesistente torna il
  totale). Da esercitare quando ci saranno due amministratori.
  Verificati invece: **non si può cancellare il proprio account** (rifiutato col
  motivo scritto) e la cancellazione legittima di un operatore.

  ⚠️ La password la scrive l'amministratore e **la comunica a voce**: l'app non
  manda email. Non finisce mai nel messaggio di ritorno, perché quello sta
  nell'URL e da lì passa in cronologia e nei log.

  ⚠️ **PULITO IN PRODUZIONE**: c'era `prova-tipo@local.test` con diritti di
  **amministratore**, avanzo di una sessione precedente. Rimosso insieme ai miei
  account di prova. Resta `diagnostica@deluxy.local` (operatore), che non ho
  creato io: **da decidere se serve** — è un accesso attivo all'app.
  Regola per il futuro: un account di prova su un'app live va cancellato nella
  stessa sessione in cui lo si crea, e mai con ruolo admin.

- **SIMBOLO «C'È IL BIGLIETTO» + SEZIONE BIGLIETTO NEL DETTAGLIO** (27/07/2026).
  Icona a busta oro su ogni ordine che ha una nota del cliente (in scheda e in
  tabella), e nel dettaglio una sezione **Biglietto e note del cliente** col
  testo intero e il tasto **Copia biglietto**.
  Campo nuovo `Ordine.haBiglietto` (solo il sì/no), riempito dal sync da
  `biglietto` di Orders; il TESTO non si copia in locale — lo chiede il
  dettaglio a Orders, come già fa per destinatario e indirizzo.
  Misurato: **77 ordini su 929 (8,3%)** hanno una nota, 76 fra quelli da gestire.

  ⚠️⚠️ **IL CAMPO NON CONTIENE «IL BIGLIETTO»: CONTIENE TUTTO.** Guardati gli
  ordini veri, dentro ci sono — nello stesso testo libero — il messaggio per il
  cartoncino, l'indirizzo completo del destinatario, uno o due numeri di
  telefono, il budget, le specifiche della torta, e in un caso
  «30 Luglio 08/12», dove 08/12 è la FASCIA ORARIA e non l'8 dicembre. Un altro
  ordine dice «20 giugno ore 17-17.30 / Via delle Calasanziane… / +39 389…
  marito per ritiro / BIGLIETTO: …».
  Quindi: **niente estrazione automatica del messaggio**. Sarebbe comodissimo e
  stamperebbe un numero di telefono su un cartoncino, o butterebbe via metà
  messaggio. Si mostra il testo COM'È, in sola lettura, e sotto c'è scritto che
  va riletto prima di girarlo al fornitore. La copia prende tutto: chi taglia è
  una persona che ha letto. È la stessa regola già scritta per consegna e stati
  («meglio non indicato che sbagliato»).
  ⚠️ `haBiglietto` si riscrive SEMPRE nel sync, anche a falso — al contrario
  degli ordinali del cliente: se il cliente toglie la nota il simbolo deve
  spegnersi, mentre un ordinale mancante vuol dire «non calcolato», non «non
  c'è più».
  ⚠️ Per accendere il simbolo sugli ordini già in tabella serve un **sync
  completo** (`POST /api/ordini/sync?completo=1`).
  ⚠️ Il tasto Copia usa lo stesso `copia()` di «Copia messaggio», già in uso in
  produzione. Dal pannello browser nascosto fallisce sempre
  (`NotAllowedError: Document is not focused`) e **non è un bug**: gli appunti
  vogliono la finestra a fuoco. Verificato che il ripiego lo dice
  («seleziona il testo e copialo a mano») invece di tacere.

- **MENU A SCOMPARSA SU MOBILE + ETICHETTA «NUOVO» + CHE CLIENTE È** (27/07/2026).

  **Menu mobile.** Sotto gli 800px il menu non è più una riga orizzontale sopra
  il contenuto (ventidue voci da scorrere di lato, intestazioni dei gruppi
  nascoste, e il tasto che lo spostava fuori lasciando una banda vuota alta come
  prima): ora è un pannello `position: fixed` che scorre da sinistra, chiuso di
  partenza, col velo dietro. Si chiude toccando il velo, con Esc, e **da solo
  quando cambi pagina** (`useEffect` su `usePathname` in `Sidebar.tsx`: al
  cambio di percorso, così copre anche tasto indietro e redirect).
  Stato mobile = `data-menu-aperto` sull'html, **non** salvato: un pannello che
  copre lo schermo e si ritrova aperto domani è una porta lasciata aperta.
  Lo stato desktop (`data-sidebar-chiusa`, in localStorage) è rimasto identico.
  ⚠️ **Nella media query mobile bisogna AZZERARE il collasso desktop**
  (`margin-left/opacity/pointer-events` di `[data-sidebar-chiusa] .sidebar`):
  la preferenza sta sull'html e vale per entrambi gli schermi, quindi chi tiene
  il menu chiuso sul computer si ritroverebbe il pannello invisibile sul telefono.
  ⚠️ **`visibility: hidden` sul pannello chiuso non è estetica**: senza, i 19
  link e il bottone del velo **restano nell'ordine di tabulazione** — misurato,
  `link.focus()` funzionava a pannello chiuso. Il ritardo `visibility 0s linear
  260ms` serve a non farlo sparire di colpo mentre scorre via.
  ⚠️ **NON VERIFICATO**: il ritorno a desktop col pannello aperto. Il browser di
  prova non propaga NESSUN segnale di ridimensionamento — né `resize`, né il
  `change` di matchMedia, né ResizeObserver (provati tutti e tre, zero scatti).
  Il listener su matchMedia in `ToggleSidebar.tsx` è il meccanismo standard e su
  un browser vero scatta, ma qui non si può dimostrare: da riprovare a mano.

  **Etichetta «NUOVO».** Gli ordini comparsi mentre la sessione è aperta si
  accendono con un bollino oro pieno (l'unico pieno della lista, di proposito).
  `src/lib/cliente-valore.ts`: l'istante di apertura sta in **sessionStorage**
  (per scheda — con localStorage riaprendo domani sarebbero «nuovi» tutti quelli
  di ieri sera), e il confronto è su **`creatoIl`**, cioè quando l'ordine è
  comparso DA NOI, non sulla data dell'ordine: al primo scarico entrano insieme
  due mesi di ordini, e con la data sarebbero nuovi tutti quelli di oggi.
  ⚠️ L'istante si legge in un `useEffect`, non nel render: sul server
  sessionStorage non esiste e si avrebbe un errore di idratazione. Finché vale 0,
  `arrivatoAdesso()` torna **falso** — senza quella guardia `t > 0` è vero per
  qualunque data e per un istante si accende tutta la lista.
  Verificato spostando indietro l'inizio sessione: 19 ordini accesi su 928.

  **Che cliente è.** Bollino «Nuovo cliente» / «2° ordine» / «Cliente VIP · N°
  ordine» accanto al tipo cliente, in scheda e in tabella. Campi nuovi
  `Ordine.clienteNumeroOrdine` / `clienteOrdiniPrima`, ricopiati da Orders come
  `clienteTipo` (stessa regola: un null in arrivo non cancella un ordinale noto).
  ⚠️⚠️ **IL CONTO LO FA ORDERS, E NON POTEVA FARLO QUESTA APP.** Misurato: la
  copia locale copre **solo 2 mesi** (928 ordini, 25/05→27/07) contro i ~14.000
  del registro. Contando qui, dei 795 clienti distinti il 91,7% risultava con un
  ordine solo e appena 3 arrivavano a cinque — un cliente che compra ogni Natale
  sarebbe stato «nuovo» ogni Natale. Con gli ordinali di Orders sulla storia
  intera: 845 ordini su 928 hanno il dato, 646 sono primi ordini, e ci sono
  clienti al 20°, 21°, 26° e **33° ordine**. Gli ordini da clienti affezionati
  sono **61 su 845 (7,2%)** — abbastanza rari da voler dire qualcosa.
  ⚠️ **Soglia VIP = dal 4° ordine in su, ed è misurata, non un numero tondo.**
  A cinque ordini l'etichetta sarebbe comparsa su pochissimi; a due su troppi.
  ⚠️ **Quando l'ordinale è `null` non si scrive «nuovo cliente»**: è lo stesso
  errore del voto dato a chi non ha dati (vedi la pagella dei partner). 83
  ordini su 928 sono in questo caso — clienti che Orders non riesce a
  riconoscere — e per loro il bollino semplicemente non c'è.
  ⚠️ Per riempire il campo sugli ordini già in tabella serve **un sync completo**
  (`POST /api/ordini/sync?completo=1`): quello normale guarda solo la finestra
  recente e la prima volta ne aveva aggiornati 26 su 928.

- **DOCUMENTI, BRAND ed ESPORTAZIONE in CS AI** (27/07/2026).
  Tre cose in una: si CARICANO documenti da cui l'AI ricava le istruzioni, ogni
  istruzione può valere per un solo BRAND, e le linee guida si ESPORTANO come
  documento leggibile dalle persone.
  Tabella `DocumentoAI` + campi `IstruzioneAI.negozioId` / `documentoId` /
  `sostituisceId`; librerie `src/lib/documenti-ai.ts` (estrazione) e
  `src/lib/linee-guida.ts` (Markdown + HTML da stampare); rotte
  `/api/cs-ai/documenti` (carica/elenca/elimina), `/api/cs-ai/documenti/proposte`
  (POST propone, PUT salva le scelte) e `/api/cs-ai/esporta?formato=md|html`.
  Si legge PDF, .docx, .txt/.md, .csv, .html fino a 4 MB.
  **Il documento NON entra nel prompt**: da trenta pagine l'AI ricava poche
  regole, ognuna con la CITAZIONE della frase da cui nasce, e una persona spunta
  quali tenere. Le regole salvate ricordano da quale documento vengono.
  Verificato su un manuale finto ma realistico: delle sei sezioni ha preso solo
  le regole di comunicazione, lasciando fuori turni di laboratorio, storia
  dell'azienda e fatturazione.

  ⚠️⚠️ **IL MODELLO DELLE RISPOSTE È `gpt-4o`, NON `gpt-4o-mini` — misurato.**
  Impostazione dedicata `openaiModelloRisposte`, default `MODELLO_RISPOSTE_DEFAULT`
  in `src/lib/ai.ts`. `openaiModello` resta mini per il resto (estrazione IBAN).
  Su 6 chiamate identiche per condizione, con **mini**: brand Cake firma giusta
  **0/6**, brand Flowers **0/6**, senza brand 5/6. Con **4o**: Cake 6/6, Flowers
  6/6, senza brand 6/6, oggetto 6/6, **mai** la firma di un marchio sbagliato.
  Ci ho girato attorno per cinque riscritture del prompt — brand in testa, brand
  in coda, gerarchie scritte in maiuscolo, identità nel messaggio di sistema — e
  nessuna cambiava il risultato. **Non era il prompt: era il modello.**
  Regola operativa: prima di riscrivere un prompt per la sesta volta, misura su
  N chiamate e prova il modello grande. Una chiamata sola non dice niente: le
  risposte oscillano fra chiamate identiche, e ci ho creduto due volte.

  ⚠️ **Le istruzioni vanno scritte come ORDINI, non come descrizioni.**
  «Chiudi ogni mail con…» attecchisce, «ci si firma sempre…» viene ignorata: il
  modello legge una descrizione come un'informazione sull'azienda, non come una
  cosa da fare. Vale anche per l'estrazione dai documenti — il prompt di
  `ricavaIstruzioni` ordina esplicitamente di trasformare il raccontato in
  comandi, perché i manuali aziendali sono scritti al descrittivo. Le 6
  istruzioni di partenza sono state riscritte all'imperativo per lo stesso
  motivo (e le righe già in tabella migrate una tantum).

  ⚠️ **La firma di partenza non nomina più «Deluxy» ma «il negozio per cui stai
  scrivendo»**: in un gruppo con più marchi una firma fissa è una firma che
  sparisce — col brand impostato, il modello preferiva non firmare piuttosto che
  firmare col nome di un altro.

  ⚠️ **`sostituisceId`: una regola di brand può mandare in pensione una regola
  generale.** Serve quando le due si contraddicono (firma Deluxy contro firma
  Cake Design): la generale non viene proprio mandata all'AI. Con `gpt-4o` il
  conflitto si risolve bene anche senza — il 6/6 è stato ottenuto SENZA
  collegamento — ma il campo resta come valvola di sicurezza e rende la scelta
  visibile invece che affidata al modello. Nel documento esportato la regola
  sostituita si vede **barrata**, con scritto da cosa è rimpiazzata: toglierla
  farebbe sparire una regola che per gli altri brand vale, lasciarla muta
  farebbe credere che l'AI la legga.

  ⚠️ **`serverExternalPackages: ['pdf-parse', 'mammoth']` in `next.config.ts` non
  è facoltativo**: impacchettato da Next, pdf-parse fallisce su OGNI pdf con
  «Object.defineProperty called on non-object». In uno script node di prova non
  si vede — lì il pacchetto è già esterno — quindi il caricamento va provato
  passando dall'app.

  ⚠️ Un PDF **scansionato** non contiene testo: viene respinto dicendolo
  («è un'immagine, serve l'originale o l'OCR») invece di salvare un documento
  vuoto da cui non si ricava niente. Verificato, insieme al rifiuto dei formati
  non letti (.png, .doc vecchio, file Apple) e del file mancante.
  L'elenco dei documenti NON rilegge i testi: estratto e lunghezza li calcola
  Postgres con `left()`/`length()`, altrimenti dieci manuali sarebbero megabyte
  per disegnare dieci righe di tabella.

- SEZIONE **CS AI** — le istruzioni con cui l'AI parla ai clienti (26/07/2026).
  Tabella `IstruzioneAI`, libreria `src/lib/cs-ai.ts`, pagina `/cs-ai`, rotte
  `/api/cs-ai` (CRUD), `/api/cs-ai/iniziali` (6 istruzioni di partenza, non
  duplicano) e `/api/cs-ai/anteprima` (il blocco esatto che finisce nel prompt).
  **Sono il COME, non il cosa**: i testi da mandare restano gli Script. Ogni
  istruzione ha un `ambito` — sempre / solo chat / solo email — perché a una chat
  e a una mail si scrive in modo diverso.
  ⚠️ **DUE LIVELLI: i PALETTI restano nel codice.** Cinque regole (non inventare
  dati, non promettere rimborsi o date, non spacciare decisioni non prese, tacere
  se non si sa) stanno in `PALETTI` e **non si cancellano dall'interfaccia**: se
  fossero righe modificabili basterebbe toglierne una perché l'AI cominci a
  promettere cose mai decise, e nessuno se ne accorgerebbe finché un cliente non
  ci tiene per la parola. Le istruzioni scritte si AGGIUNGONO, e il prompt dichiara
  che in caso di conflitto vincono i paletti.
  ⚠️⚠️ **DOVE VANNO LE ISTRUZIONI NEL PROMPT — misurato, non supposto.** Con
  `gpt-4o-mini` metterle nel **messaggio di sistema NON funziona**: il modello
  restituiva lo script IDENTICO e un'istruzione di prova («chiudi sempre con —
  Reparto Fiori, Deluxy») non compariva mai. Funziona mettendole nel **messaggio
  utente, per ultime**, subito prima di «ora scrivi la risposta». Contava anche la
  `description` del campo `risposta` nello schema JSON: diceva «lo script adattato
  al messaggio (nome, numero ordine, data)», un elenco chiuso che il modello
  prendeva come l'unica libertà concessa — ora dice che il testo si RISCRIVE.
  VERIFICATO con l'AI vera, nei due versi: con l'istruzione di prova attiva la
  risposta finisce con «— Reparto Fiori, Deluxy»; cancellata l'istruzione, la
  firma sparisce. E in contesto **email** la risposta si chiude con «Un cordiale
  saluto…» (istruzione solo-email) mentre in chat no: il filtro per ambito regge
  end-to-end. Logica pura provata a parte: i 5 paletti sempre presenti, le regole
  solo-chat fuori dal prompt mail e viceversa, nessuna sezione vuota senza
  istruzioni.
  `suggerisciRisposta(messaggio, script, contesto)` ha il terzo parametro
  ('chat' | 'email', default 'chat'); `/api/script/suggerisci` lo accetta nel body.
  ⚠️ **DEBITO DA SANARE**: `prisma generate` non è potuto girare (il `.dll` è
  bloccato dal dev server dell'altra sessione, PID sulla porta 3140). Ho aggirato
  generando in una cartella temporanea e copiando tutto tranne il motore — i tipi
  sono giusti, typecheck e build passano, il DB risponde. **Effetto collaterale**:
  il client non carica più `.env` da solo negli script `node` (Next e Vercel lo
  caricano, quindi app e produzione non sono toccate). Al primo momento in cui la
  cartella è libera, rilanciare `npx prisma generate` per rimettere le cose a posto.

- SCRIPT RICHIAMABILI DAL POP-UP DI POSTA (26/07/2026). Dentro il modulo della
  mail c'è **«Usa uno script»**: si cerca fra le risposte pronte e si clicca —
  il testo entra nel messaggio **dove sta il cursore** (o in fondo, se il riquadro
  non è stato toccato). `POST /api/script/[id]/usato` incrementa `usi`, come fa
  già l'AI in `/api/script/suggerisci`: se contasse solo l'AI, l'ordinamento «i
  più usati in cima» racconterebbe le sue abitudini e non quelle di chi lavora.
  ⚠️ **IL SALUTO NON DEVE USCIRE DOPPIO.** Ogni script comincia con «Buongiorno,»
  e il corpo della mail ce l'ha già («Buongiorno Shontelle, le scriviamo…»).
  `src/lib/script-testo.ts` toglie il saluto allo script SOLO se il testo che lo
  precede ne ha già uno, e rimette la maiuscola. Riconosce pochi saluti in testa
  alla frase (buongiorno/buonasera/salve/ciao/gentile…/hello/bonjour/…): meglio
  lasciare un saluto doppio che tagliare una parola che serviva.
  Con una SELEZIONE attiva si sostituisce **in linea**; con il solo cursore lo
  script diventa un **paragrafo a sé**, e le righe vuote non si accumulano.
  ⚠️ **BUG TROVATO IN VERIFICA, il caso più comune di tutti**: un riquadro di testo
  mai cliccato riporta `selectionStart = 0`, indistinguibile da «cursore
  all'inizio». Chi apriva il pop-up e prendeva subito uno script se lo vedeva
  infilato PRIMA del saluto, col «Buongiorno» doppio. Ora la posizione si RICORDA
  (`cursore` in `ComponiMail`) e vale solo se il riquadro è a fuoco o è già stato
  usato; altrimenti si aggiunge in fondo.
  VERIFICATO in pagina: aprendo il pop-up e prendendo subito «Ritardo nella
  consegna» → **un solo «Buongiorno»**, script come paragrafo dopo l'apertura,
  elenco che si chiude, `usi` che cresce, ricerca che filtra («fattura» → 1
  script, «consegna» → 2, testo inesistente → «Nessuno script per «…»»).
  I contatori `usi` gonfiati dai miei clic sono stati riazzerati.

- POP-UP DI POSTA: LA MAIL SI SCRIVE E SI MANDA DA QUI (26/07/2026).
  Il bottone **Email** non è più un link `mailto:` ma apre `ComponiMail.tsx`:
  Da (casella aziendale) · A · Oggetto · Messaggio, già scritti nella lingua del
  cliente, e **Invia**. Rotte nuove: `POST /api/email/invia` e
  `GET /api/caselle` (che espone solo indirizzo/nome/predefinita — password, host
  e porte restano lato server).
  PERCHÉ: `mailto:` dipende dal programma di posta del computer — dove non è
  configurato non succede niente, e dove lo è la mail parte da un indirizzo
  personale, fuori da quest'app e senza lasciare traccia. Ora esce da
  `cs@deluxy.it` via SMTP e **viene registrata in Inbox** come conversazione
  email (stesse convenzioni del sync: canale `email`, `idEsterno` = indirizzo).
  ⚠️ **L'HANDOFF DICEVA IL FALSO**: «SMTP risponde 535 authentication rejected».
  Provato con `provaCasella()` sulla casella vera: **«Invio e ricezione funzionano
  per cs@deluxy.it»**. Il 535 è rientrato, la nota era vecchia. `inviaEmail()`
  esisteva già in `src/lib/email.ts`: mancava solo la rotta per una mail NUOVA
  (prima si potevano solo mandare risposte dentro un thread).
  ⚠️ **DIFETTO TROVATO E CORRETTO**: `casellaPerId()` ripiega da sé sulla
  predefinita, quindi un `casellaId` inesistente faceva partire la mail **da un
  altro indirizzo senza dirlo**. Ora se l'id è indicato esplicitamente e non
  esiste si rifiuta (400): una mail a nome di qualcun altro non è un ripiego
  accettabile.
  VERIFICATO: rifiutati prima di toccare l'SMTP → destinatario mancante, non
  valido, senza dominio, corpo vuoto, casella inesistente. Pop-up su #1731: Da
  `cs@deluxy.it`, A precompilato, oggetto «Ordine #1731», testo nella lingua del
  cliente, Esc chiude, `mailto:` **non compare più** in pagina.
  ⚠️ **NON ho premuto Invia su un cliente vero** (sarebbe una mail a una persona
  reale). Da provare a mano: l'unica cosa non verificata è l'invio vero dal
  pop-up. Il percorso SMTP però è provato da `provaCasella` (autenticazione ok).
  ⚠️ **INCIDENTE DEL MIO TEST**: un caso di prova con destinatario e testo validi
  ha **inviato davvero** una mail «ciao» a `x@esempio.it`. Traccia rimossa dal
  database (conversazioni email tornate a 0). Lezione: nei test su una rotta che
  invia, i casi devono essere **non spedibili per costruzione** (indirizzo o corpo
  non validi), non «probabilmente innocui».

- CANALI DI CONTATTO A SCELTA (26/07/2026). Il bottone «Contatta» sceglieva da
  solo: WhatsApp se c'era un numero, la mail altrimenti. Non è una gerarchia
  vera — a chi ha appena scritto una mail si risponde per mail, un ritardo
  grave si dice al telefono — quindi ora si mostra **un bottone per ogni canale
  che quel cliente ha davvero**: WhatsApp, Chiama, Email. Senza recapiti resta
  scritto «Nessun recapito» col motivo.
  Vale in tutti e tre i posti: schede, tabella e pannello di dettaglio
  (`canaliContatto()` in OrdiniLista, stessa logica nel dettaglio).
  La telefonata usa un link `tel:` col numero come è scritto (il + conta) e **non porta
  nessun testo**: il messaggio precompilato lì non serve. WhatsApp e mail
  restano nella lingua del cliente e non partono da soli.

- DETTAGLIO: MITTENTE, DESTINATARIO E INDIRIZZO DI CONSEGNA (26/07/2026).
  Nel pannello di un ordine ora si distinguono **chi ordina** (mittente, coi suoi
  recapiti) e **chi riceve** (destinatario), con l'indirizzo di consegna
  completo di CAP, provincia e paese. Quando sono la stessa persona lo dice.
  ⚠️ **Il destinatario NON è in casa**: qui l'ordine tiene i dati di chi compra.
  Arriva da Orders (campo spedizione di GET /api/v1/ordini) nella stessa chiamata
  che già portava le righe e le foto — nessuna copia locale, regola 2 dell'app.
  Verificato su #1733: in casa il campo indirizzo è VUOTO e la città «Florence», da
  Orders arriva «11 Campbell Avenue… IG6 1EA ENG GB». Quindi questa aggiunta
  non è solo un'etichetta in più: prima l'indirizzo di consegna su quegli
  ordini non si vedeva proprio.
  Se Orders non risponde si mostra l'indirizzo della copia locale, dicendo che
  è senza CAP e provincia.

- ORDINI APERTI / ORDINI GLOBALI (26/07/2026): la lista degli ordini ora è due
  pagine, stessa tabella (`OrdiniLista` con prop `modalita`):
  · **/** «Ordini aperti» — la lista di LAVORO: non gestiti, e **senza gli
    ordini con un rimborso vivo** (stato richiesto o approvato). Da quando si
    apre un rimborso quell'ordine si lavora in /rimborsi, e lasciarlo qui vuol
    dire che prima o poi qualcuno lo rilavora per sbaglio. Rifiutato o
    annullato → l'ordine torna nella lista.
  · **/ordini-globali** «Ordini globali» — l'archivio intero, gestiti e
    rimborsati compresi, con la ricerca. Parte dalla vista a tabella perché qui
    si cerca, non si lavora.
  Il filtro sta nell'API (`GET /api/ordini?rimborsi=nascondi`), non nel client:
  così il conteggio e l'elenco non possono divergere. Il rimborso esclude
  **sia per id sia per numero**, perché l'ordine può vivere solo nell'archivio
  di Orders.
  Verificato sui dati veri: aperti 906 → **905** (sparisce #2585, rimborso
  «richiesto»), globali **923**; l'ordine esiste ancora ed è `da_gestire`.

- URGENTI IN CIMA, PAGINA COMPATTA, COPIA FOTO (26/07/2026).
  **ORDINE PER URGENZA A FASCE** (`src/lib/urgenza.ts` + `ordiniPerUrgenza()` in
  `/api/ordini`): oggi (per fascia oraria, prima chi va consegnato presto) →
  domani e oltre (per data) → scadute da ≤3 giorni (dalla più recente) → senza
  data (dalle più recenti) → **scadute da tempo per ultime**.
  ⚠️ NON si ordina per «consegna più vecchia prima», che sarebbe l'ovvio: misurato
  sui dati veri, fra i non gestiti **578 hanno la consegna già passata** (fino a
  due mesi indietro) e quelli di **oggi sono 8** — perché `gestione` è recente e
  nessuno ha spuntato gli ordini vecchi. Ordinando per data il lavoro di oggi
  finiva sotto 578 righe di archeologia.
  ⚠️ Si ordina LATO SERVER perché l'elenco è tagliato a 200: ordinando nel browser
  si ordinerebbero i 200 più recenti, e un ordine da consegnare oggi ma ricevuto
  tre settimane fa non entrerebbe. Sono 5 query, una per fascia, che si fermano al
  tetto. Verificato: gli 8 di oggi in cima nell'ordine 08-12 → 18-20, poi +1gg,
  +2gg…
  In testa: pillole **«8 da consegnare oggi»**, «7 domani», «28 scadute di
  recente», contate sul filtro in corso.
  **SPAZIO**: primo ordine da ~430px a **344px**, scheda da 237 a **166px**
  (−30%), **con tutti i bottoni al loro posto**. Come: testa in una riga sola (il
  dettaglio della catena Shopify → Ordini → qui è nel `title` del pallino);
  azioni con etichette corte ("Paga", "Contatta") e cornice più stretta (gap 4px,
  padding 2×8, font 12px), che porta i 6-7 bottoni da tre righe a due — il blocco
  azioni scende da 97px a 56px. Tolta anche la data dell'ORDINE dalla scheda
  (quella che serve a chi lavora è la consegna, due righe sopra): faceva andare i
  badge a capo, 27px per scheda.
  ⚠️ **ERRORE MIO, CORRETTO**: in un primo giro avevo lasciato sulla scheda solo
  Contatta e Gestito, spostando le altre nel dettaglio. Sono azioni fondamentali e
  vanno tenute tutte: lo spazio si prende dalla cornice dei bottoni, non dal loro
  numero. Stringendola si ottiene **lo stesso risparmio** (166px contro i 167 che
  avevo ottenuto togliendole) senza perdere niente. Le azioni ci sono comunque
  anche nel dettaglio, che è utile a chi ci arriva da lì.
  **COPIA FOTO** (`copiaFoto` in `DettaglioOrdine.tsx`), accanto a Scarica.
  Due vincoli del browser da cui nasce il giro: negli appunti si può mettere
  **solo PNG** (`ClipboardItem` con image/jpeg viene rifiutato), e il canvas si
  sporca con un'immagine di un altro dominio — quindi la foto si carica dalla
  NOSTRA rotta `/api/immagine` (stessa origine) e si riesporta in PNG su canvas,
  con sfondo bianco perché un PNG trasparente incollato in chat diventa nero.
  VERIFICATO fin dove si può da qui: foto scaricata dalla nostra rotta (352 KB),
  canvas **non** sporcato, PNG prodotto (453 KB), `ClipboardItem` presente.
  ⚠️ **La scrittura negli appunti NON è verificata**: da questa sessione il
  pannello del browser non è in primo piano e Chrome risponde `NotAllowedError:
  Document is not focused`. Con un clic vero della persona la finestra è a fuoco,
  quindi dovrebbe funzionare — **da provare a mano**. Se fallisse, il messaggio
  distingue i casi (finestra non a fuoco / browser che non sa copiare / permesso
  negato) invece di dare una spiegazione sola e sbagliata.

- DETTAGLIO ORDINE CON FOTO E MESSAGGIO PER IL FORNITORE (26/07/2026).
  Cliccando **un punto qualsiasi** della scheda (o della riga in tabella) si apre
  `DettaglioOrdine`: foto grande del prodotto, **Scarica foto**, e il messaggio
  già scritto «Per mercoledì 29 luglio possibile questo prodotto con ritiro
  15-19?» da copiare. La riga delle azioni fa `stopPropagation`, altrimenti
  premere *Reclamo* aprirebbe anche il pannello; `role=button` + Invio/Spazio +
  Esc per chiudere.
  RITIRO = **fascia di consegna meno un'ora** (`src/lib/ritiro.ts`): il valet deve
  avere il prodotto prima di partire. 16-20 → 15-19. Una fascia di forma diversa
  da HH-HH, o che comincia a mezzanotte (un'ora prima sarebbe il giorno prima),
  diventa «ritiro da concordare»: a un fornitore non si manda un orario inventato.
  Il messaggio è in ITALIANO anche se il cliente è straniero — qui il destinatario
  è un fornitore, che è un partner italiano (la lingua del cliente è un'altra
  cosa, vedi `src/lib/lingua.ts`).
  LE FOTO VENGONO DA ORDERS: `RigaOrdine.immagine` c'era già ma l'API non la
  esponeva — aggiunta in `serializzaOrdine` (**lato Orders, pubblicato**). Il
  Customer Service NON tiene copia delle righe: le chiede a
  `righeOrdineDaOrders()` quando si apre il dettaglio.
  ⚠️ L'ordine si riconosce dal **gid Shopify**, non dal nome del negozio: `#1733`
  esiste sia su Cake sia su Deluxy, e col match sul brand il pannello diceva «il
  numero esiste su più negozi». Il gid è la stessa chiave con cui il sync fa
  l'upsert, quindi è esatta.
  ⚠️ `/api/immagine` è un proxy con **lista bianca obbligatoria**
  (`cdn.shopify.com`, https): serve perché il browser ignora `download` sui link
  cross-origin, ma una rotta che scarica un URL arbitrario è un proxy aperto verso
  la rete interna. VERIFICATO che respinge 169.254.169.254 (metadata AWS),
  localhost, 192.168.1.1, host estranei, http su host ammesso e URL malformati;
  e che ciò che torna sia davvero `image/*`.
  Copertura reale: negli ultimi 60 giorni **730 ordini su 892 hanno almeno una
  foto** (80% delle righe). Chi non l'ha mostra «nessuna foto».
  Verificato in pagina su #1733: foto 1108×1108, le 4 personalizzazioni del
  prodotto (Numeri: 30, Base, Ingredienti, Topping), messaggio col ritiro 15-19,
  Esc chiude, e premere *Gestito ✓* non apre il pannello.

- «PAGA FORNITORE» + SI SCRIVE AL CLIENTE NELLA SUA LINGUA (26/07/2026).
  Il bottone «Richiedi pagamento» è ora **Paga fornitore** (scheda e tabella), e
  la pagina di arrivo diceva una cosa sbagliata — «le coordinate su cui **farsi
  pagare**» — mentre sono le coordinate del fornitore **da pagare**: corretta.
  LINGUA: `src/lib/lingua.ts` decide in che lingua aprire il messaggio al cliente
  (it/en/fr/es/de) e `linkContatto()` la usa per testo e oggetto; il titolo del
  bottone dice **quale lingua e perché**.
  ⚠️ **IL SEGNALE È CHI COMPRA, NON DOVE VANNO I FIORI.** Qui si vende regalo:
  `paese` è quello di SPEDIZIONE, cioè il destinatario, mentre il messaggio va al
  CLIENTE. Prima avevo messo il paese per primo: sbagliato in entrambi i versi —
  italiano a un londinese che manda a Milano, francese a un italiano che manda a
  Parigi. Ordine corretto: (1) prefisso del suo telefono, (2) dominio della sua
  email, (3) **se il prefisso è estero ma fuori tabella si ferma qui in inglese**
  (altrimenti a un cliente di Dubai che spedisce a Parigi si scriverebbe in
  francese — caso vero, ordine #2378), (4) paese di spedizione, (5) numero senza
  prefisso di forma italiana, (6) niente del tutto → **italiano**, perché 3
  ordini su 4 spediscono in Italia: rispondere inglese a un italiano solo perché
  manca il suo numero è scommettere contro i propri dati.
  Svizzera, Belgio e Canada NON sono in tabella di proposito: da un indirizzo non
  si sa se a Berna si parli tedesco o francese.
  Campo nuovo `Ordine.paese` (ISO 2 lettere) da `spedizione.paese` di Orders.
  VERIFICATO sui 922 ordini veri: italiano 69%, inglese 26%, francese 3%, tedesco
  1%, spagnolo 1% — coerente col 75% di spedizioni in Italia. Casi provati:
  #12572 spedisce in IT ma il cliente ha un +43 → **tedesco**; #2378 (+971 → FR)
  e #2377 (+41 → FR) → inglese; `07534…` (mobile UK senza +44) con spedizione GB
  → inglese. In pagina: Emma Baker → «Hello Emma, we are writing about your order
  #1733.», gli altri in italiano.
  Il messaggio **non parte da solo**: wa.me e mailto lo precompilano, l'operatore
  lo rilegge e può cambiarlo — è la rete di sicurezza di tutte queste deduzioni.

- FORNITORE: PERCHÉ CHIEDE LA PASSWORD, E ORA LO DICE (26/07/2026).
  Diagnosi di `search-deluxy.vercel.app/?brand=…&ordine=…` che chiedeva il login:
  **non è un guasto**, è il link NON firmato. Quell'app si apre senza password
  solo con un codice monouso `?t=<code>` (schema authorization-code: `POST
  /api/link` con `x-api-key: dlxs_…` → codice valido 5 minuti → il browser lo
  scambia con `GET /api/link?code=` per una sessione di 1 ora; vedi
  `deluxy-search-supplier/api/link.js` sul branch **main**).
  CAUSA VERA: in questa app `searchApiKey` **non è impostata** (verificato sulla
  tabella `Impostazione`), quindi `linkFornitore()` ripiega sul link semplice.
  I campi ci sono già in Impostazioni → Ricerca fornitori.
  **PER SISTEMARLO SERVE UNA PERSONA**: la chiave si crea SOLO da amministratore
  dell'app Ricerca fornitori (`POST /api/chiavi {azione:'crea'}`, che risponde
  403 a chi non è admin) e va incollata qui. Non è una cosa che si possa fare da
  codice.
  CORRETTO NEL FRATTEMPO il difetto nostro: il bottone ripiegava **in silenzio**,
  e l'operatore si trovava davanti a un login senza sapere perché. Ora
  `linkFornitore()` torna una `nota` anche nel caso «chiave assente», e
  `apriFornitore()` la mostra in pagina. Verificato: l'API risponde
  `firmato:false` con l'URL identico a quello che l'utente aveva aperto, e
  premendo *Fornitore* compare l'avviso con l'istruzione.

- DATA E FASCIA DI CONSEGNA IN ELENCO (26/07/2026): sulla scheda dell'ordine una
  riga sotto il cliente, e in tabella la colonna **Consegna**. I campi
  (`dataConsegna`, `fasciaConsegna`) c'erano già da Orders e li usava solo il
  calendario. Sui dati veri: 618 ordini su 922 hanno la data, 633 la fascia.
  ⚠️ **LA FASCIA SI SCRIVE SEMPRE CON «ore» DAVANTI** (`fasciaLeggibile`):
  da Orders arriva come `"08-12"`, che accanto a una data si legge come **8
  dicembre** — è l'equivoco già costato (vedi la regola «non dedurre dati
  critici»). `"08-12"` → «ore 8–12». Una fascia di forma diversa da HH-HH si
  mostra **così com'è**, senza interpretarla.
  `consegnaLeggibile` dice «consegna OGGI» (rosso), «domani» (oro), «scaduta da N
  giorni» (rosso) o la data con il giorno della settimana. Se manca il giorno ma
  c'è la fascia: «consegna ore 12–16, giorno non indicato»; se non c'è niente:
  «consegna non indicata» — mai riempita a caso.
  Verificato sui 200 ordini in pagina: tutti e cinque i casi resi correttamente.

- LA REGOLA «GLI ORDINI LI SCARICA SOLO ORDERS» È ORA IMPOSSIBILE DA VIOLARE
  (26/07/2026). Il codice per prendere gli ordini da Shopify era ancora qui,
  inerte ma pronto: `src/lib/shopify.ts` con `scaricaOrdini()` e `risolviToken()`,
  `tokenPerNegozio()`/`negoziAttivi()` in `negozi.ts`, e la pagina `/negozi` che
  **chiedeva e cifrava credenziali Admin di Shopify** che nessuno leggeva.
  Verificato prima di togliere: `scaricaOrdini`, `verificaStore`, `tokenPerNegozio`
  e `negoziAttivi` non erano chiamati da nessuno.
  Ora `src/lib/shopify.ts` è **cancellato**, le credenziali non si chiedono né si
  salvano più, e la regola è scritta in testa a `src/lib/negozi.ts`. Motivo:
  due sorgenti per lo stesso ordine vorrebbero dire due verità, con
  classificazioni diverse a seconda dell'app che si guarda.
  Le colonne `token`/`clientId`/`clientSecret` restano sulla tabella coi valori
  storici — **non le legge più nessuno**. Se si vogliono azzerare quei segreti,
  è una cancellazione di dati e va chiesta prima.

- ORDINI VISIBILMENTE AGGIORNATI, E DAVVERO OGNI 15 MINUTI (26/07/2026).
  ⚠️ **LA CATENA ERA ROTTA A MONTE**: questo cron gira ogni quarto d'ora, ma
  **Orders scaricava da Shopify una volta al giorno (06:00)** — quindi si
  interrogava una fonte ferma e un ordine delle 10:00 compariva qui il mattino
  dopo. Non si poteva nemmeno sospettare: la pagina scriveva «aggiornati 3 minuti
  fa», che era vero e inutile.
  Corretto in `deluxy-orders/vercel.json`: due giri, `*/15 * * * *` su
  `/api/cron/sync?giorni=2` (gli ordini NUOVI in fretta) più la passata piena a
  90 giorni una volta al giorno (rimborsi, annullamenti, evasioni: cose che
  cambiano DOPO e che il giro veloce non guarda). I feedback restano sul giro
  lento — sono una chiamata a un'altra app e un reclamo non si aspetta come un
  ordine. Il parametro `giorni` è letto dalla rotta (max 365, default 90).
  In pagina, al posto della scritta grigia c'è la **barra della catena**
  (`.catena-sync`): pallino verde che pulsa se il giro è vivo, «Ordini aggiornati
  N minuti fa», «Ordini ha scaricato da Shopify N minuti fa» — quest'ultimo da
  `ultimoImportOrders()` che legge `ultimoImport`, campo nuovo di
  `GET /api/v1/health` di Orders (pubblico, è un orario) — e «questa pagina si
  rilegge da sola». Il pulsante è diventato «Aggiorna adesso».
  DUE ALLARMI, perché un elenco fermo e un elenco senza novità si vedono uguali:
  pallino rosso + avviso se l'ultimo giro è **fallito** (`ordiniSyncEsito` che non
  inizia per "ok") o se non si aggiorna **da più di un'ora** (quattro giri
  mancati di fila non sono un ritardo, sono un guasto).
  L'elenco si **rilegge da solo ogni 60 secondi** (non 15 minuti: i giri del cron
  non sono allineati a quando apri la pagina, quindi con un solo controllo ogni
  quarto d'ora un ordine appena arrivato potrebbe aspettarne quasi trenta). Si
  **ferma a scheda nascosta** e rilegge appena torna in primo piano.
  VERIFICATO: barra con i tre orari veri; scheda nascosta → 0 letture, ritorno in
  primo piano → 1 lettura subito; simulando 3 ore di fermo → pallino `fermo` +
  avviso; simulando un giro fallito → avviso con il messaggio d'errore; stato
  normale → nessun avviso. `ultimoImport` in produzione risponde davvero.
  ⚠️ DA CONTROLLARE FRA UN GIRO: che il cron `*/15` di Orders parta **da solo**
  (si vede da `ultimoImport` che avanza). Vercel registra i cron al deploy.

- RIMBORSI: BOTTONE SULL'ORDINE + REGISTRO (26/07/2026): da ogni ordine (scheda e
  tabella) il pulsante **Rimborso** apre `/rimborsi` col modulo già pieno
  (ordine, cliente, recapiti, **totale** e **stato del pagamento**). Tabella
  `Rimborso`, `src/lib/rimborsi.ts`, API `/api/rimborsi` e
  `/api/rimborsi/[id]/stato`, pagina + voce di menu.
  Flusso: **richiesto → approvato → rimborsato** (oppure rifiutato/annullato).
  ⚠️ **QUEST'APP NON RIMBORSA.** Registra la richiesta e la decisione; i soldi li
  muove una persona su Shopify o in banca e poi si segna «rimborsato». È la
  regola del repo (nessuna app Deluxy paga per conto proprio, vedi
  deluxy-transactions): **non aggiungere qui una chiamata che sposta denaro** —
  semmai si instrada a Transactions.
  I PALETTI, verificati contro l'API vera sull'ordine #1729 da 64 €:
  · non si rende più di quanto incassato → 64,01 rifiutato;
  · il tetto è **cumulativo** sulle altre richieste dello stesso ordine → 40 ok,
    poi 25 rifiutato («al massimo 24,00 €»), 24 ok, poi anche 1 € rifiutato
    («già chiesto o reso l'intero importo»);
  · importo 0 / negativo / NaN rifiutati; **motivo obbligatorio** (un rimborso
    senza motivo scritto è indifendibile dopo); ordine obbligatorio;
  · rifiutato e annullato **non impegnano** denaro: dopo un rifiuto si può
    richiedere di nuovo l'intero importo (verificato);
  · «rimborsato» **esige l'esito scritto** (400 senza), stato inventato → 400.
  I confronti sono in **centesimi interi**, non in float: con 66,66 già impegnati
  su 100, chiedere 33,34 deve passare — in virgola mobile il residuo risulta
  negativo e verrebbe rifiutato un rimborso legittimo (provato).
  AVVISI (non bloccano, informano) da `avvisoPagamento(statoPagamento)`: REFUNDED
  «già rimborsato per intero», PARTIALLY_REFUNDED, VOIDED «pagamento stornato»,
  PENDING «non ancora incassato», vuoto «stato sconosciuto». Sui dati veri
  servono davvero: 16 REFUNDED, 11 PARTIALLY_REFUNDED, 11 VOIDED, 5 PENDING.
  KPI: da approvare, approvati da pagare, **promesso e non ancora uscito** (somma
  di richiesti+approvati: un eseguito non ci conta, verificato) e rimborsato.
  MANCA: legare la richiesta al reclamo da cui nasce (il campo `reclamoId` c'è ed
  è accettato dall'API, ma non c'è ancora il pulsante dal reclamo), e l'invio a
  deluxy-transactions per l'uscita vera.

- TIPO DI CLIENTE SUGLI ORDINI (26/07/2026): ogni ordine mostra **da che tipo di
  cliente arriva** — privato, azienda, hotel/ristorante, eventi, rivenditore.
  Il dato **viene da Orders, non si calcola qui**: campi nuovi `Ordine.clienteTipo`
  e `clienteTipoDa` (copia riscritta a ogni sync), letti da `cliente.tipo`/`tipoDa`
  di `GET /api/v1/ordini`. Nomi e colori in `src/lib/clienti-tipo.ts` — solo
  presentazione: la classificazione resta di Orders, e un valore sconosciuto si
  mostra grezzo invece di sparire.
  In pagina: bollino su ogni scheda e colonna in tabella, filtro «Tipo cliente»
  (con *Tipo non rilevato* per gli ordini senza recapiti) e la riga «Da che
  clienti: …» coi conteggi cliccabili, da `perTipoCliente` in `/api/ordini`.
  ⚠️ **LATO ORDERS SERVE IL DEPLOY**: l'esposizione del campo è in
  `deluxy-orders/src/lib/tipologia-cliente.ts` + `serializzaOrdine` + la rotta
  `/api/v1/ordini`, ma **finché Orders non è pubblicato** la produzione risponde
  senza `cliente.tipo` e il sync scrive vuoto. Verificato in locale contro Orders
  vero: 894 ordini su 917 marcati, distribuzione reale **858 privato, 3 azienda,
  1 horeca, 32 non rilevati**; filtro «Azienda» → i 3 giusti (Recarlo Spa,
  Chatwin SRL, Eightstone Pte Ltd), «Tipo non rilevato» → 54.
  NOTA SUL DATO: la deduzione guarda il NOME DELL'ACQUIRENTE, e su Shopify quello
  è quasi sempre una persona anche quando compra un'azienda — perciò il B2B
  risulta sottostimato. Non è un errore del codice: si corregge caso per caso in
  Orders (tag manuale sul cliente), e da lì arriva qui col sync.
- CORRETTO «Scarico non riuscito.» SUL PULSANTE AGGIORNA (26/07/2026):
  `/api/ordini/sync` chiamava `sincronizzaOrdini({completo})` e `contatti` ha
  come default **true**, quindi il pulsante salvava anche la rubrica Google:
  ~218 secondi misurati (40 chiamate alla People API) contro `maxDuration = 60`.
  La funzione veniva uccisa, Vercel rispondeva 504 con una pagina non-JSON e il
  client — che fa `res.json().catch(() => ({}))` — restava senza campo `errore`,
  mostrando il messaggio generico. Per lo stesso motivo l'errore non finiva
  nemmeno in `ordiniSyncEsito`: `annotaSync` non faceva in tempo a girare.
  Ora passa `contatti: false`: i contatti li salva il cron dedicato
  (`/api/cron/contatti`, ogni ora, maxDuration 300) o il pulsante «Salva tutti i
  contatti». È la stessa correzione già applicata al cron dei 15 minuti, che sul
  pulsante era rimasta indietro. Verificato: **200 in 7,3s**, 36 ordini, 2 nuovi.

- API A CHIAVE PER LE ALTRE APP (26/07/2026): `GET /api/v1/feedback` espone in
  **sola lettura** i reclami e i voti legati a un ordine, per il registro ordini
  (deluxy-orders), che li mostra sulla scheda dell'ordine. Nuovi: `model ApiKey`
  (nel DB solo lo SHA-256), `src/lib/api-auth.ts`, `scripts/crea-chiave.mjs`
  (`npm run chiave -- <app>`), e in `middleware.ts` il ramo che lascia passare
  `/api/v1/*` — si autentica da sé (standard Deluxy §4.3) — con gli header CORS.
  Chiave già creata per **deluxy-orders**.
  Due scelte da non ribaltare per sbaglio: (a) **niente scrittura**, un reclamo
  si apre e si chiude qui, dove c'è chi ha parlato col cliente; (b) un voto
  **senza numero d'ordine non esce**, perché a un registro di ordini non serve
  un giudizio che non sa dove attaccare.
  ⚠️ **Da pubblicare**: finché questa versione non è su Vercel, l'import di
  Orders in produzione non trova la rotta (in locale è già provato e funziona).

- PUNTEGGI CONFIGURABILI DI VALET E PARTNER (26/07/2026): la "pagella".
  4 tabelle nuove (`VocePunteggio`, `Feedback`, `Puntualita`, `MetricaManuale`),
  motore di calcolo in `src/lib/punteggi.ts`, pagine `/reclami/punteggi` (pagella
  + configurazione delle voci) e `/reclami/feedback` (registrazione di feedback e
  orari), API `/api/punteggi`, `/api/punteggi/voci`, `/api/punteggi/voci/iniziali`,
  `/api/punteggi/manuale`, `/api/feedback`, `/api/puntualita`.
  **IL PUNTEGGIO NON È UNA FORMULA NEL CODICE.** È la media pesata di VOCI che
  l'operatore configura: ognuna ha una `fonte` (`reclami` | `feedback` |
  `puntualita` | `manuale`), un `peso` e una `soglia`. Aggiungere una variabile
  ("cura del confezionamento") = aggiungere una voce, non toccare il codice.
  Le 4 voci di partenza: Reclami (tutti, peso 3, soglia 10), Feedback (tutti,
  peso 3), Puntualità (solo valet, peso 4, tolleranza 15 min), Qualità del
  prodotto (solo partner, manuale, peso 2). Peso 0 = voce presente ma esclusa.
  **DUE REGOLE CHE TENGONO ONESTO IL NUMERO, da non rompere.**
  1. Una voce SENZA DATI per quel soggetto è **esclusa** dalla media, non contata
     come zero: un partner di cui non misuriamo la puntualità non deve risultare
     scarso per un dato mai raccolto. Svuotare un valore manuale lo rimuove
     (≠ metterlo a 0), e l'interfaccia lo dice.
  2. Sotto il 50% di peso coperto (`COPERTURA_MINIMA`) **non si dà la fascia**:
     si scrive "Da valutare". Nata da un problema visto in verifica: 38 partner su
     41 uscivano "100 Ottimo" solo perché non avevano ancora reclami — un
     complimento costruito sul nulla, che seppelliva i due soggetti con dati veri.
     Ora la pagella mostra per default solo chi ha prove sufficienti, col
     conteggio degli altri e il link per andare a misurarli.
  `Puntualita` salva i **minuti di ritardo** (0 = in orario, negativo = anticipo),
  non un "in orario sì/no": la tolleranza vive sulla voce, così cambiandola gli
  stessi dati si rileggono da soli (VERIFICATO: tolleranza 15→60 porta un valet
  da Critico 37,8 a Attenzione 57,8; rimettendo 15 torna esatto a 37,8). Se si
  passano le due date, il ritardo si **calcola** e il numero scritto a mano viene
  ignorato: una sola verità.
  VERIFICATO sui dati veri: voci iniziali 4 aggiunte / al secondo giro 0 aggiunte
  e 4 saltate; valet puntuale (9/10 in orario, feedback 5-5-4) → **93,5 Ottimo**,
  valet ritardatario (1/10, feedback 2-1) → **37,8 Critico**, ordinati dal
  peggiore; partner vero del registro con feedback 4 e qualità 80 → 85,6 su 3
  voci, togliendo il valore manuale → **87,5 su 2 voci con la terza "ESCLUSA"**
  (sale, perché l'80 non viene più contato né azzerato). Rifiutati: valore a mano
  su una voce calcolata 400, voce "puntualità" su un partner 400, voto 9 su 5 400,
  feedback senza soggetto 400, consegna senza valet 400, consegna senza minuti né
  date 400, data non valida 400; valore manuale 999 → 100, −50 → 0, soglia 0 non
  produce NaN.
  Dati di prova cancellati filtrando solo i miei record: 914 ordini e 2 utenti
  veri intatti. Le 4 voci restano: sono il catalogo di partenza.
- CUSTOMER SERVICE — RECLAMI, CASISTICHE, VALET, GIUDIZI (26/07/2026): l'app
  diventa il servizio clienti. Quattro tabelle nuove (`Valet`, `CasistaReclamo`,
  `Reclamo`, `Giudizio`), vocabolario e calcoli in `src/lib/reclami.ts`, quattro
  pagine sotto `/reclami` e sei rotte API. `prisma db push` fatto: sono tabelle
  NUOVE, nessuna esistente è stata toccata.
  **Il giro completo**: da ogni ordine (card e tabella) il bottone **Reclamo**
  apre `/reclami?ordineId=&ordine=&cliente=&telefono=&email=&negozio=` con il
  form già pieno → si scegle una **casistica** e questa riempie da sola gravità,
  colpa tipica e la **checklist delle azioni** → si attribuisce la **colpa** a un
  valet (registro locale `/reclami/valet`) o a un partner (tendina letta da
  Anagrafiche via `/api/partner`, la chiave non passa dal browser) → in
  `/reclami/giudizi` i reclami di ogni soggetto diventano un **giudizio**.
  **GIUDIZIO AUTOMATICO, come funziona** (`giudizioAutomatico()`): si sommano i
  pesi dei reclami, dove il peso è la gravità (1 lieve / 2 media / 3 grave)
  **dimezzata se il reclamo è risolto o chiuso** — rimediare conta. Soglie: 0 →
  Ottimo, ≤2 → Buono, ≤6 → Attenzione, oltre → Critico. Le soglie sono state
  ritarate durante la verifica: con la prima versione (≤3 → Buono) UN reclamo
  grave ancora aperto risultava "Buono", troppo indulgente. Il giudizio manuale
  (voto 1-5 + nota, upsert su `[soggettoTipo, soggettoId]`) **non sostituisce**
  quello automatico: si affianca, così resta visibile da cosa nasce il numero.
  **VERIFICATO sui dati veri** (dev server su porta 3141 per non litigare col
  3140 di un'altra sessione): casistiche di esempio 7 aggiunte e al secondo giro
  0 aggiunte / 7 saltate (il seed non duplica, match sul nome); un valet con 2
  gravi + 1 medio aperti → punti 8 **Critico**, un altro con 1 medio risolto →
  punti 1 **Buono**, ordinati dal peggiore; `risoltoIl` valorizzato da solo
  passando a "risolto"; azioni copiate dalla casistica (3 righe); tendina partner
  popolata con i **41 partner veri** del registro; nella sidebar si accende una
  sola voce anche sulle sotto-pagine. **Rifiutati come devono**: reclamo senza
  casistica 400, stato inventato 400, giudizio a un soggetto non giudicabile
  (azienda/cliente) 400, voto 99 → stretto a 5.
  I dati di prova sono stati cancellati **filtrando solo i miei record** (mai
  `deleteMany` globali su questo DB condiviso): 914 ordini e 2 utenti veri
  intatti. Le **7 casistiche di esempio sono state lasciate**: sono il catalogo
  di partenza, non dati di test.
  NON rinominati (romperebbero cose vive): cartella, progetto Vercel, schema
  `messaging`, cookie `msg_session`, `MARCATORE` di google.ts.
  **DEVIAZIONE SCRITTA, da sapere prima di toccare i valet.** La tabella `Valet`
  di quest'app **duplica** un registro che esiste già: quello vero è in
  deluxy-platform-next (`model Valet`, con IBAN, codice fiscale, veicolo, regole
  di stipendio). Non lo rileggiamo perché **per i valet non c'è una API a
  chiave**: `GET /api/v1/valets` è protetta da JWT utente + ruolo
  (`api/src/valets/valets.controller.ts`, guardie globali in `app.module.ts`), e
  l'unica strada praticabile oggi sarebbe tenere la password di un utente di
  servizio — peggio della copia. Perciò qui c'è solo il minimo per attribuire una
  colpa (nome, recapito, zona), e la pagina lo dice all'operatore. **Da fare
  quando si potrà**: aggiungere in platform-next una lettura a `x-api-key` sul
  modello di `deluxy-orders/src/lib/api-auth.ts`, poi sostituire la tabella con un
  `src/lib/valet.ts` che rilegge il registro, esattamente come
  `src/lib/anagrafiche.ts` fa per i partner (quelli infatti **non** sono
  duplicati). Attenzione a non prendere la strada opposta per comodità: se questa
  tabella diventa il posto dove si gestiscono i valet, nasce un secondo registro
  divergente da quello dei compensi.
- ORDINI AUTOMATICI OGNI 15 MINUTI (26/07/2026): `vercel.json` → cron
  `*/15 * * * *` su `/api/cron/ordini`, protetto da `Authorization: Bearer
  CRON_SECRET` (Vercel lo manda da solo; senza segreto la rotta risponde 503
  invece di restare aperta). `CRON_SECRET` impostata su Vercel (Production) e in
  `.env` locale. Il middleware ora ESCLUDE `api/cron` (i cron non hanno cookie:
  finivano rimandati al login).
  La logica di scarico è stata estratta in `src/lib/sincronizza.ts`
  (`sincronizzaOrdini({completo, contatti})`), condivisa fra il cron e il
  pulsante "Aggiorna" — prima viveva dentro la rotta e non era riusabile.
  MISURATO: il giro con i contatti Google durava **218 secondi** (40 chiamate
  alla People API), quello coi soli ordini **~21-25 s** (31 ordini). Perciò i
  contatti sono stati staccati sul loro cron `/api/cron/contatti` (`7 * * * *`,
  maxDuration 300): attaccati ai 15 minuti li avrebbero fatti scadere, cioè
  avrebbero fatto perdere proprio gli ordini che il cron deve salvare.
  `ordiniSyncUltimo`/`ordiniSyncEsito` in Impostazione registrano ogni giro; la
  pagina Ordini scrive "Aggiornati da soli 4 minuti fa" (verificato: "adesso").
  Verificato in locale e in produzione: senza header 401, header sbagliato 401,
  header giusto 200 con `{scaricati: 31}`. **PROVA DEFINITIVA**: alle 12:30:34
  UTC del 26/07 il giro è partito **da solo** (nessuna chiamata nostra), come si
  legge da `ordiniSyncUltimo` — il cron è davvero registrato, non solo dichiarato
  in `vercel.json`. In produzione dura **~2 secondi** (il DB Supabase è a fianco),
  contro i 21-25 s da casa.
- SEZIONE PARTNER (26/07/2026): `/partner` + `src/lib/anagrafiche.ts`
  (`partnerAttivi()`) + `/api/partner` (proxy: la chiave non passa dal browser).
  Legge `GET {anagraficheUrl}/api/v1/partners?stato=attivo` con `x-api-key`.
  NESSUNA copia locale (regola del registro: "non tenete una copia, rileggete").
  `stato=attivo` è lo stato COMMERCIALE, che nel registro vuol dire "è Partner".
  Chiave di sola lettura creata con `npm run chiave -- deluxy-messaging` in
  deluxy-anagrafiche e salvata cifrata in Impostazione `anagraficheApiKey`
  (+ `anagraficheUrl`); card dedicata in Impostazioni.
  SCOPERTA CHE HA CAMBIATO IL CODICE: nel registro **nessuno** dei 41 partner
  attivi ha un telefono proprio, ma 28 hanno un REFERENTE col numero. Il bottone
  "Scrivi" guarda prima l'insegna e poi i referenti: senza quel ripiego sarebbe
  spento per 37 partner su 41. Verificato sui dati veri: 41 righe, 38
  contattabili (27 WhatsApp + 11 email), 3 senza recapito; filtro FIORISTA → 11,
  ricerca "milano" → 22.

- SCRIPT — RISPOSTE RAPIDE CHE L'AI IMPARA (26/07/2026): tabella `Script`
  (titolo, categoria, testo, `quando` = quando usarlo, attivo, `usi`), pagina `/script`
  (`src/components/ScriptLista.tsx`) con CRUD, ricerca, copia e un BANCO DI PROVA
  ("Prova la risposta automatica": si incolla un messaggio e si vede cosa risponderebbe).
  `suggerisciRisposta()` in `src/lib/ai.ts` manda all'AI SOLO i nostri script (max 60, i
  più usati per primi) e le chiede quale usare + il testo adattato al cliente.
  API `POST /api/script/suggerisci` con `{messaggio}` oppure `{conversazioneId}` (in questo
  caso prende da sola l'ultimo messaggio IN ENTRATA della conversazione); lo script scelto
  incrementa `usi`, così i più usati salgono.
  PRINCIPIO (come per l'IBAN): l'AI propone, noi decidiamo. Lo `scriptId` restituito è
  validato contro l'elenco mandato — se l'AI inventa un id, la risposta viene scartata; e
  se nessuno script c'entra torna `null` invece di improvvisare.
  Nell'inbox: bottone **Risposta rapida** accanto a Invia — il testo finisce nel riquadro
  di scrittura, NON parte da solo, e un avviso dice da quale script arriva.
  Verificato con 3 script veri e l'AI vera: "ordine in ritardo" → Ritardo nella consegna
  (con il nome del cliente inserito), "mi serve la fattura" → Richiesta di fattura,
  "vendete macchine fotografiche usate?" → nessuno script, rifiutato correttamente.
  Dall'inbox su una conversazione widget: bottone → riquadro riempito + avviso, invio non
  automatico.
- CALENDARIO, VISTA "DA OGGI" (26/07/2026): `/calendario` apre sull'AGENDA che parte da
  oggi (`/api/ordini/calendario?giorni=60`), con "Oggi" evidenziato; la griglia del mese
  resta a un clic. Le date di consegna arrivano da Orders (campo `consegna`).
- AI = OPENAI (26/07/2026): `src/lib/ai.ts` usa la chiave OpenAI (Impostazione
  `openaiApiKey`, cifrata), con Anthropic come ripiego. Due modelli per motivo misurato:
  `gpt-4o-mini` per il testo, `gpt-4o` per le IMMAGINI — mini ha sbagliato un IBAN letto da
  foto (due zeri persi, beccato dal checksum), 4o l'ha letto giusto.

- Scaffold completo dell'app (Next 15 + Prisma, porta 3140, design system Deluxy).
- Schema dati: `Utente`, `Impostazione` (token cifrati AES-256-GCM), `Conversazione`
  (unica per canale+idEsterno), `Messaggio` (dedup su id Meta, stati di consegna).
- Webhook Meta unico (`/api/webhooks/meta`): verifica GET col verify token, firma
  X-Hub-Signature-256 con l'App Secret, ricezione WhatsApp/Messenger/Instagram,
  aggiornamenti di stato WhatsApp.
- Invio: WhatsApp Cloud API, Messenger e Instagram via `/{nostro account}/messages`
  (src/lib/meta.ts) — su `graph.facebook.com` col Page Access Token, su
  `graph.instagram.com` se il token comincia per `IGAA`.
- Inbox a due colonne con polling (elenco 5s, thread 4s), badge canale, non letti,
  stati di consegna e errori d'invio visibili in bolla.
- Widget: `public/widget.js` (bottone flottante + iframe) → pagina `/widget` (pubblica,
  frame-ancestors *), API pubbliche `/api/widget/sessione` e `/api/widget/messaggi`
  autenticate dal token di sessione del visitatore.
- Impostazioni: token canali (cifrati, "vuoto = non toccare"), verify token, App Secret,
  titolo/benvenuto widget, URL webhook e snippet pronti da copiare.
- Login (`/login`) e registrazione (`/registrati`) come pagine separate con link
  incrociati: il primo account registrato è l'amministratore (bootstrap), i successivi
  nascono operatori; middleware a sessione firmata.
- Tessera "Messaggi" nel catalogo del Hub (`deluxy-hub/src/lib/apps.ts`, icona nuova).

- Negozi Shopify MULTI-STORE: tabella `NegozioShopify` (credenziali cifrate), pagina
  `/negozi` (aggiungi/modifica/sospendi/elimina), `src/lib/negozi.ts`. Ogni negozio si
  autentica con token statico `shpat_` OPPURE Client ID+Secret (client credentials grant
  `POST {shop}/admin/oauth/access_token`, `src/lib/shopify.ts` `risolviToken`/`tokenDaClientCredentials`).
  Lo scarico ordini gira su tutti i negozi attivi e riporta l'esito per-negozio; ogni
  `Ordine` è legato al negozio (`negozioId`, unique `[negozioId, shopifyId]`).
  NB: il "Token di automazione dell'app" (`atkn_`) NON legge ordini — serve solo al deploy CI/CD.
- Ordini da Shopify: `src/lib/shopify.ts` (Admin GraphQL 2024-10, `X-Shopify-Access-Token`,
  ultimi 60 giorni), tabella `Ordine`, API `/api/ordini/sync` (scarica+upsert),
  `/api/ordini` (lista + se Google collegato), `/api/ordini/[id]/contatto` e
  `/api/ordini/contatti-tutti` (salva su Google), pagina `/ordini`. Dominio+token in
  Impostazioni (token cifrato).
- Google Contacts: OAuth server-side con refresh token (`src/lib/google.ts`), People API.
  Flusso `/api/google/connetti` → consenso Google → `/api/google/callback` (salva
  refresh token cifrato). `src/lib/contatti.ts` conia l'access token e salva con dedup
  per telefono. Client ID/Secret + redirect URI in Impostazioni. Scelta server-side (non
  il token-client del browser di anagrafiche) perché su Vercel i contatti vanno salvati
  anche senza operatore davanti. Verificato: il connetti reindirizza a accounts.google.com
  col client_id giusto (serve progetto Google Cloud reale per completare).
  NB: il redirect URI va messo negli **URI di reindirizzamento autorizzati**, non nelle
  Origini JavaScript (quelle rifiutano i percorsi) → errore `redirect_uri_mismatch`.
- LIVE su https://deluxy-messaging.vercel.app (progetto Vercel `deluxy-messaging`, team
  deluxy). Env di produzione: DATABASE_URL, DIRECT_URL, APP_SECRET (LO STESSO del locale,
  altrimenti i token cifrati nel DB condiviso non si aprono), APP_URL.
- Vista a colonne + bottone Fornitore (26/07/2026): `/ordini` alterna Colonne/Elenco; le
  colonne sono per negozio con conteggio e valore dell'intero filtro (groupBy). Bottone
  "Fornitore" = deep link `search-deluxy/?brand=&ordine=` (`linkRicercaFornitori`), brand
  per negozio da `brandRicercaDaNegozio()` (campo `brandRicerca` per l'override).
  Verificato: cakedesign.me/1730, deluxy.it/12650, deluxyflowers.com/2582.
- Clienti/rubrica (26/07/2026): `/clienti` + `/api/clienti`, ricavati dagli ordini
  raggruppando per telefono (fallback email) — nessuna tabella nuova. Verificato: 684
  clienti da 782 ordini.
- Archivio storico via Orders (26/07/2026): `src/lib/orders.ts` → `GET {ordersUrl}/api/v1/ordini`
  con header `x-api-key`. Chiave creata in deluxy-orders (`npm run chiave -- deluxy-messaggi`,
  sola lettura) e salvata cifrata in Impostazione `ordersApiKey` (+ `ordersUrl`). La ricerca
  in `/ordini` mostra la sezione "Archivio storico" con i risultati. Il brand di Orders viene
  tradotto per Ricerca fornitori ("Flowers" → "deluxyflowers.com").
- Email register.it, PIÙ CASELLE (26/07/2026): tabella `CasellaEmail` + pagina `/caselle`
  (schema/pagina gemelli di NegozioShopify//negozi). `src/lib/email.ts` lavora per casella.
  PARAMETRI UFFICIALI verificati su www.register.it/assistenza/parametri-email:
  IMAP `pop.securemail.pro:993` SSL, SMTP `authsmtp.securemail.pro:465` SSL, utente =
  indirizzo completo — host GENERICI, non del dominio cliente. (Prima avevo messo
  `imaps./smtps.register.it`: ERRATO. Attenzione: il DNS di questa rete risolve QUALSIASI
  nome a 10.147.17.27, quindi non è una verifica valida.) Porte/host modificabili; sulla
  587 `smtpSicuro=false` (STARTTLS). TLS con `rejectUnauthorized:false` (certificato
  intestato ad altro nome; connessione comunque cifrata).
  `/api/email/sync` gira su TUTTE le caselle attive con esito per casella; la risposta
  parte dalla casella che ha ricevuto (`Conversazione.casellaId`), altrimenti dalla
  predefinita. `/api/email/prova` prova SMTP **e** IMAP e legge dal DB (salvare prima).
  Campo `Messaggio.oggetto`. MANCA: allegati, HTML (solo testo), cartella Inviata sul
  server, cron di scarico, invio di una mail NUOVA (oggi solo risposte da thread).
- Link firmato Ricerca fornitori (26/07/2026): `src/lib/fornitori.ts` — POST
  `{searchUrl}/api/link` con `x-api-key: dlxs_…` e body `{quando: ISO}` torna
  `{url: …/?t=<code>}` valido ~5 min; ci aggiungiamo brand+ordine. Senza chiave ripiega
  sul link semplice `?brand=&ordine=` (verificato: `firmato: false`). Il bottone apre la
  scheda PRIMA della fetch, altrimenti il browser la blocca come popup.
- LAVORAZIONE ORDINI + MENU A SCOMPARSA (26/07/2026): `Ordine.gestione`
  (da_gestire | in_pagamento | comunicazione | gestito) + `gestioneIl`, con
  `src/lib/gestione.ts` per nomi e colori. NON confonderlo con `statoChiave` (pipeline di
  Orders): il sync non lo tocca. `POST /api/ordini/[id]/gestione` lo cambia; il filtro
  `gestione=aperti` (default in pagina) mostra solo i non gestiti.
  Pulsanti su card e tabella: Richiedi pagamento (→ `/pagamenti?ordine=&cliente=&importo=`,
  segna in_pagamento), Contatta cliente (wa.me se c'è il telefono, altrimenti mailto; segna
  comunicazione), Gestito ✓ / Riapri. I link si aprono in modo sincrono nel gestore del
  click, altrimenti il browser li blocca come popup.
  Menu a scomparsa: `ToggleSidebar` + `[data-sidebar-chiusa] .sidebar { margin-left:-232px }`
  + script nel `<head>` che riapplica la scelta da localStorage prima del paint.
  ⚠️ VERIFICA: col pannello del browser nascosto le TRANSIZIONI CSS non avanzano, quindi
  `margin-left`/`opacity` risultano fermi ai valori iniziali anche se la regola si applica
  (si vede da `pointer-events: none` che invece cambia). Misurare con
  `.sidebar { transition: none !important }`: così risulta 1033px → 1265px, corretto.
- INOLTRO A DELUXY PARTNER (26/07/2026): `src/lib/partner.ts` →
  `POST {partnerUrl}/api/richieste-pagamento`, header `X-API-Key` + `X-App: deluxy-messaging`,
  body {importo, beneficiario, iban, bic, causale, contatto, linkConversazione, riferimento,
  note}. Idempotente su (origine, riferimento) — vedi
  deluxy-partner/src/app/api/richieste-pagamento/route.ts. Campi nuovi su RichiestaPagamento:
  bic, contatto, linkConversazione, riferimento (unique), inviataIl, partnerId, partnerStato,
  esitoInvio. Partner RIFIUTA importo <= 0. Un invio fallito non annulla il salvataggio: si
  rimanda con `POST /api/pagamenti/[id]/invia`, e `GET` sulla stessa rotta aggiorna lo stato.
  Verificato con un finto Partner: header e body esattamente come da contratto.
  MANCA: chiave API vera di Partner in Impostazioni.
- RICHIEDI PAGAMENTO (26/07/2026): tabella `RichiestaPagamento` + pagina `/pagamenti`.
  `src/lib/iban.ts` verifica l'IBAN col checksum mod-97 (ISO 13616) + lunghezza per paese;
  `stringaPagamento()` compone la stringa pulita. `src/lib/ai.ts` estrae iban/intestatario/
  importo/causale con **Claude Opus 5** (`@anthropic-ai/sdk`, `output_config.format` con
  json_schema, immagini via blocco `image` base64), gestendo `stop_reason: "refusal"`.
  API `/api/pagamenti/estrai` (testo e/o immagine) e `/api/pagamenti` (GET/POST/DELETE).
  Chiave in Impostazione `anthropicApiKey` (cifrata).
  PRINCIPIO: l'AI propone, il checksum decide — un IBAN che non torna si salva ma resta
  "da controllare", non viene mai dato per buono. Verificato: cifra alterata → rifiutata,
  spazi → normalizzati, lunghezza IT sbagliata → rifiutata, DE valido → accettato.
  MANCA: prova reale dell'estrazione AI (serve una chiave Anthropic vera).
- Menu a SINISTRA (26/07/2026): `src/components/Sidebar.tsx` + `.layout/.sidebar/.main`
  copiati da deluxy-orders; la topbar tiene solo marchio e utente. Sotto 800px la sidebar
  diventa una riga orizzontale. Voci: Ordini/Calendario/Clienti · Inbox · Negozi/Caselle/
  Impostazioni.
- CALENDARIO ORDINI (26/07/2026): `/calendario` + `/api/ordini/calendario?mese=YYYY-MM`.
  Griglia del mese per DATA DI CONSEGNA, ogni ordine con il bordo del colore dello stato;
  legenda cliccabile per filtrare, filtro negozio, KPI consegne/valore.
  Campi nuovi su `Ordine`: `dataConsegna`, `fasciaConsegna`, `statoChiave`, `statoNome`,
  `statoColore` (da `consegna` e `classificazione.stato` di Orders + `GET /api/v1/stati`
  per i colori). Verificato: 610 ordini su 911 hanno una data di consegna, 876 hanno stato;
  luglio mostra 260 consegne per €47.539,98.
  NB: i campi nuovi NON si riempiono col sync incrementale — serve
  `POST /api/ordini/sync?completo=1` (rifà tutta la finestra di 60 giorni, dura minuti).
- FONTE ORDINI = DELUXY ORDERS (26/07/2026, non più Shopify diretto): `/api/ordini/sync`
  usa `scaricaOrdiniDaOrders()` (`GET {ordersUrl}/api/v1/ordini?da=&page=&limit=200`,
  `x-api-key`). INCREMENTALE: `da` = giorno dell'ordine più recente locale − 1 (primo giro
  fino a 60gg), altrimenti su Vercel si sfora il tetto di tempo. Dedup sul **gid Shopify**
  (`orderId` di Orders = il nostro `shopifyId`): i 782 ordini presi prima da Shopify si
  aggiornano, non si duplicano (verificato: 782→789→…→910 senza doppioni).
  Ogni brand di Orders → negozio in `NegozioShopify` (match su nome/dominio/brandRicerca,
  altrimenti creato). ATTENZIONE: `negozioNome` va scritto col nome del NEGOZIO, non col
  brand grezzo — Orders chiama lo stesso negozio ora "Flowers" ora "deluxyflowers.com" e si
  ottengono 6 nomi per 3 negozi (già corretto + riallineati i record vecchi).
  Le credenziali Shopify in /negozi non servono più (restano per storia).
  `src/lib/shopify.ts` non è più usato dal sync.
- Fornitore, link firmato VERIFICATO (26/07/2026) contro un finto `/api/link`: il backend
  fa POST con `x-api-key: dlxs_…` e body `{quando: ISO}`, poi al `url` restituito aggiunge
  brand e ordine → `…/?t=<code>&brand=deluxyflowers.com&ordine=2582` (numero senza #).
  La chiave non passa mai dal browser.
- Home = Ordini (26/07/2026): `/` mostra gli ordini, l'inbox è su `/inbox`, `/ordini`
  reindirizza a `/` (resta valido: è l'URL registrato come app su Shopify). Ordine in
  barra: Ordini, Clienti, Messaggi, Negozi, Caselle, Impostazioni.
- Grafica di Deluxy Orders importata (26/07/2026): stessi nomi di classe
  (`page-head/page-title/page-sub`, `kpi-riga/kpi`, `ricerca` a pillola con lente,
  `filtri` + `stato-pill`, `tabella-wrap` + `cella-*`, `tag`, `paginazione`, `vuoto`,
  `btn`) copiati da deluxy-orders/src/app/globals.css. Le regole di tabella sono confinate
  in `.tabella-wrap` per non toccare la `.tabella` preesistente. `/clienti` rifatta su quel
  modello (KPI, ordinamenti Più spesa/Più ordini/Più recenti/Nome — verificati).
- Ricerca ordini (25/07/2026): `/api/ordini` accetta `q` (numero, cliente, telefono con
  normalizzazione delle cifre, email, indirizzo, negozio), `negozio` e `contatto=si|no`;
  torna anche `totale` e l'elenco negozi. UI: barra con campo di ricerca (ritardo 300ms),
  due select e "Azzera"; lista tagliata a 200 con conteggio dei corrispondenti.
  Verificato su 782 ordini reali: nome→1, telefono con spazi→1, email→1, negozio→145,
  negozio+nome→4.
- Contatti automatici (25/07/2026): `src/lib/contatti.ts` → `salvaContattiOrdini()`, chiamata
  in coda a `/api/ordini/sync` (e da `/api/ordini/contatti-tutti`). Nome in rubrica
  `SIGLA Nome #ordine` (es. `FL Mario Rossi #1042`): sigla per negozio da
  `prefissoDaNegozio()` — flowers→FL, cake→CK, deluxy→DL, campo `prefisso` per l'override.
  Dedup per ultime 9 cifre del telefono: un contatto per persona, aggiornato col numero
  dell'ordine PIÙ RECENTE (`aggiornaContatto` = people.updateContact con etag rifresco).
  I contatti NON creati da noi non vengono mai rinominati (marcatore "Deluxy Messaggi" in
  biografia). Tetto di 40 clienti per giro (serverless): `rimasti` nel riepilogo.
  Verificato con le funzioni reali: FL/CK/DL corretti sui 3 negozi dell'utente.

## MANCA

> ⚠️⚠️ **RICONTATA IL 04/09/2026 IN CIMA A QUESTO FILE** (tappa 8). Tutto
> quello che sta qui sotto è **storia**: la riga «richieste di pagamento: ZERO
> inviate» è falsa da quando il canale Transactions è acceso (35 partite), gli
> utenti non sono più gli stessi e i chargeback da rispondere sono quattro, non
> due. È la **quinta volta** che questa sezione invecchia: prima di scrivere
> «manca X», ricontarlo.

> ⚠️ **Questa sezione era ferma al 28/07 e diceva il falso su quasi tutto.** Ricontata sul
> database di produzione il **15/08/2026** e di nuovo il **17/08/2026 pomeriggio**
> (`node scripts/conta.mjs`, solo pieno/vuoto, mai i valori). I canali li collega
> **l'utente, non una sessione**: prima di scrivere «manca X», **ricontarlo**.

**RICONTATO IL 26/08/2026, ore 18:45** (sul database di produzione, verificato
due volte da una revisione ostile). ⚠️ Le righe qui sotto datate 25/08 sono
**STORIA**: quasi ogni numero è cambiato in 36 ore.

- **Ordini: 1.371.** Per stato: **gestito 1.259**, **da iniziare 99**, **attesa
  consegna 11**, **in pagamento 2**, e **ZERO** `comunicazione`, **ZERO**
  `ricerca_fornitore`, **ZERO** `in_app`. **402 senza data di consegna.**
  ⚠️⚠️ **I «505 da gestire» non sono stati lavorati, sono stati CHIUSI IN
  BLOCCO**: `scripts/segna-gestiti-da-piattaforma.mjs` ha portato **417** ordini
  a `gestito` (backup `scripts/backup-segna-gestiti-2026-08-26.json`). Dei 99
  che restano, **74 non hanno data di consegna** e **9 ce l'hanno già passata**.
- **Conversazioni: 644** (email 440, WhatsApp 146, widget 38, Instagram 20,
  **Messenger 0**), **3.725 messaggi**, **2 non lette**, **91 prese in carico**.
- **Utenti: 3** — nicolo (admin), federica e riccardo (operatori). ✅
  `diagnostica@deluxy.local` **cancellato**.
- 🔴 **Richieste di pagamento: 22** (2.221 €), **20 pagate** (**1.938 €**), e
  **ZERO inviate**: `inviataIl = null` su **tutte e 22**. ⚠️⚠️ La riga della
  tabella «Cosa manca davvero» che dice «oggi la tabella è comunque a 0
  richieste» **è falsa di 22 righe**. ⚠️ E la causa non è `partnerUrl` (in
  `src/lib/partner.ts` c'è un `BASE_DEFAULT`): è **`partnerApiKey`, che non
  esiste proprio come riga** in `Impostazione`.
- 🔴 **Chargeback 13**: 11 perse (**2.257,66 €**), **2 da rispondere** — #1741
  (103,34 €) e #12726 (99,94 €), scadenza **4/09/2026**, **prove mai inviate** e
  **bozza a ZERO caratteri**. Restano **9 giorni**, invariato dal 25/08.
- **Reclami: 6, tutti aperti** (uno di gravità 3, #12790). **Rimborsi
  «richiesto»: 4** (325,83 €, i due più vecchi fermi dal 26 e 27 luglio).
- **Note di diario: 29** (di cui **27 non fatte**). **Glossario: 17 voci** e
  **50 proposte, 32 ancora aperte** (le più vecchie dal 23/08).
- **21 ordini con un fornitore scritto**, tutti con `fornitoreDaId`. **0 ordini
  uniti** (`unitoA` vuoto ovunque): il caso #1777/#1798 che ha fatto nascere la
  funzione **non è stato unito**.
- **Preventivi: 0 righe. Chiamate: 0 righe. RichiestaFornitore: 0. Attivita: 0.**
  Tre funzioni consegnate oggi e non ancora usate da nessuno.
  **OrdineCreato: 2**, tutti e due con bozza.
- 🔴 **Turni: 5 righe = 21 ore su 168, tutte di Federica** (Riccardo e Nicolò
  zero; martedì, mercoledì e giovedì non esistono). ⚠️ E
  **`aiFuoriTurnoAttivo` è VUOTA**: 147 ore a settimana senza turno **e** senza
  il tampone dell'AI, mentre il cron gira ogni 10 minuti a vuoto.
- ⚠️ **920 ordini su 1.371 hanno `ordersId` vuoto**; nessuna chiave
  `piattaforma*` in `Impostazione`, quindi `/api/cron/piattaforma` gira **96
  volte al giorno a vuoto**.
- ⚠️ **`gestioneDaNome`: sei grafie per tre persone.** Federica 265+103,
  Riccardo 18+119, Nicolò 58+33. Qualunque conteggio futuro fatto sul **nome**
  spacca ogni operatore in due.
- **`apreSulSito` ancora `false`** su tutti e tre i siti — invariato dal 17/08.
- Sync ordini: ultimo giro **26/08 16:35:31 UTC**, «ok: 34 ordini, 0 nuovi».

**RICONTATO IL 25/08/2026, ore 13** (`node scripts/conta.mjs` sul database di
produzione, più `Chargeback`, `RichiestaPagamento`, `NotaDiario`,
`VoceGlossario`). Fra parentesi il 21/08:

- **Ordini: 1.356** (1.305), **505 da gestire** (494), **395 senza data di
  consegna** (383). **17 hanno un fornitore scritto**: è il giro nato in questi
  due giorni, e prima erano zero.
- **Conversazioni: 618** (564) e **3.540 messaggi** — email **425**, WhatsApp
  **138**, widget **36**, Instagram **19**, **Messenger 0** (invariato: nessuna
  riga `facebook` in `PaginaMeta`). **7 non lette**, **78 prese in carico** (50).
- **Richieste di pagamento: 17**, **tutte e 17 collegate a un ordine** — il campo
  che fino al 24/08 era sempre vuoto adesso è pieno su tutte. **17 segnate
  pagate**, e **ZERO inviate a chi approva**: `partnerUrl` e `partnerApiKey`
  sono ancora vuote, quindi **FINANCE non vede niente di tutto questo**. ⚠️ È il
  buco più grosso rimasto: qui si registra un'uscita di denaro che l'app dei
  pagamenti non conosce.
- 🔴 **CHARGEBACK: le due contestazioni sono ANCORA da rispondere.** `#12726`
  (99,94 €) e `#1741` (103,34 €), scadenza prove **4 settembre 2026**, `prove
  inviate: mai` e **bozza di risposta VUOTA su tutte e due**. Restano **10
  giorni**. Delle 13, ora **11 sono perse** (una in più: quella «in esame» del
  21/08 è finita anche lei fra le perse — cioè aspettare è costato un'altra
  contestazione).
- **Reclami: 5, tutti aperti** (erano 1). La strada per aprirne uno si trova:
  quella domanda del 21/08 ha risposta.
- **Rimborsi «richiesto»: 4** (erano 2), fermi in attesa di una decisione.
- **Diario di lavoro: 3 note** (erano 0). **Glossario: 17 voci** (13 travasate + 4).
- **`apreSulSito` ancora `false`** su tutti e tre i siti — invariato dal 17/08.
- **Utenti: 4**, e `diagnostica@deluxy.local` è ancora lì.
- **Chiavi vuote**: `partnerUrl`, `searchUrl`, `waBusinessAccountId`,
  `widgetTitolo`/`widgetMessaggio`, `shopifyToken` (giusto).

**Ricontato il 21/08/2026** (`node scripts/conta.mjs`, più le tabelle
`Chargeback`, `NotaDiario` e `PaginaMeta`):

- **Ordini: 1.305**, **494 da gestire**, **383 senza data di consegna**.
- **Conversazioni: 564** e **3.071 messaggi** — email **394**, WhatsApp **122**,
  widget **31**, Instagram **17**, **Messenger 0** (in `PaginaMeta` le 3 righe
  sono tutte `instagram`, token che si rinnovano da soli fino al **28/09/2026**).
  Due non lette.
- **Presa in carico: 50 conversazioni** hanno un proprietario (erano 8 il 17/08).
- **Rubrica Google: arretrato finito** — 1.143 ordini con contatto salvato, **0
  rimasti**, **0 errori**.
- **Chargeback: 13** — 10 perse (2.087,66 €), 1 in esame, **2 da rispondere entro
  il 4 settembre, prove mai inviate**.
- **Diario di lavoro: 0 note.** La sezione è nata il 21/08 e nessuno ci ha ancora
  scritto: fra qualche giorno vale la pena chiedere all'utente se il quaderno si è
  spostato lì davvero, o se le righe finiscono ancora in chat.
- **`apreSulSito` ancora `false` su tutti e tre i siti** (deluxy, flowers, cake).
- **Utenti: 4**, fra cui ancora `diagnostica@deluxy.local`.
- **Chiavi vuote**: `shopifyToken` (giusto), `waBusinessAccountId`,
  `widgetTitolo`/`widgetMessaggio`, `partnerUrl`, `searchUrl`.

**Contato il 17/08/2026 pomeriggio** — STORIA (fra parentesi il 15/08):

- **Ordini**: **1.245** (1.216), **488 da gestire** (474), **371 senza data di consegna**
  (367).
- **Conversazioni: 468** (425) e **2.589 messaggi** — email **346**, WhatsApp **91**,
  widget **18**, Instagram **13**, **Messenger 0**. Una sola non letta.
- **Presa in carico già usata: 8 conversazioni** hanno un proprietario, il giorno stesso
  in cui la funzione è nata.
- **WhatsApp**: **3 numeri** attivi, tutti con token, WABA e marchio.
- **Instagram**: **3 account**, tutti con token e marchio, e i token si **rinnovano da
  soli** — `tokenEsito` dice «rinnovato: scade fra 59 giorni», scadenza **28/09/2026**.
- **Email**: **3 caselle** attive, tutte con password e marchio — `cs@deluxy.it`
  (predefinita), `info@deluxyflowers.com` (nuova dal 15/08), `info@cakedesignme.it`.
- **Contenuti**: 31 script, 18 istruzioni AI.
- **Lavoro che aspetta una persona**: **1 reclamo aperto** (è l'unico reclamo mai
  registrato), **2 rimborsi «richiesto»** fermi da prima del 15/08.
- **Utenti: 4**, fra cui ancora `diagnostica@deluxy.local`.
- **Chiavi**: presenti Orders, Anagrafiche, OpenAI, Meta (app secret, verify token, IG,
  fbPageToken), Google (client + refresh) e **`searchApiKey`** — nuova, e **funziona**.
  Vuote: `partnerApiKey`/`partnerUrl`, `waBusinessAccountId`, `widgetTitolo`/
  `widgetMessaggio`, `shopifyToken` (giusto: gli ordini li scarica Orders).

**Cosa manca davvero (contato il 17/08/2026):**

| Cosa manca | Cosa non funziona finché manca |
|---|---|
| 🔴 **2 chargeback in `needs_response`, prove mai inviate** (#1741 · 103,34 € e #12726 · 99,94 €) | Scadono il **4 settembre 2026**: passata quella data la banca decide senza di noi. Si risponde da `/chargeback`. |
| 🟡 **`apreSulSito` è ancora SPENTO su tutti e tre i siti** (verificato in tabella) | Il link `/chat/<codice>` continua a portare sulla chat a pagina intera invece che sul sito. Su **Flowers e Cake** la spunta va accesa (il `widget.js` là c'è, misurato il 17/08); su **deluxy.it no**, il widget non è installato. |
| **Messenger**: `fbPageToken` è in Impostazioni ma in `PaginaMeta` **non c'è nessuna riga `facebook`** (le 3 righe sono tutte Instagram) | È l'unico canale ancora spento: zero conversazioni Messenger. Il token generale non basta — ogni Pagina vuole il **suo** Page Access Token, messo in `/account-meta`. |
| `partnerApiKey` e `partnerUrl` (entrambi vuoti) | Le richieste di pagamento si salvano qui ma non arrivano a **FINANCE** (`deluxy-partner`). Oggi la tabella è comunque a 0 richieste. |
| `widgetTitolo` / `widgetMessaggio` | Il widget generale mostra i valori di riserva («Deluxy», «Ciao! Come possiamo aiutarti?»). I 3 siti configurati hanno i propri testi, quindi non è un guasto. |
| `waBusinessAccountId` | Serve alla diagnosi di `/numeri-whatsapp` per interrogare il WABA; i messaggi passano lo stesso. |

Da fare, in ordine di utilità:

- 🟡 **CHARGEBACK APERTI: il dato non c'è ancora, ma i permessi SÌ** (chiesto dall'utente il 19/08).
  Né questa app né Deluxy Orders leggono le contestazioni: sull'ordine di Shopify
  stanno in `disputes { id status initiatedAt }` (Shopify Payments), e la query di
  Orders (`src/lib/shopify.ts`) oggi chiede solo `risk`. Strada: **Orders le legge →
  qui si copiano** come già si fa per pagamento e rischio frode, poi bollino rosso e
  filtro. ✅ **MISURATO il 19/08** interrogando Shopify: `disputes { id status }`
  sull'ordine **risponde già** con i permessi che l'app ha (zero contestazioni
  sugli ultimi 50 ordini di ciascun negozio), quindi per l'elenco **non serve
  aggiungere niente**. Serve un permesso solo per il DETTAGLIO (importo, motivo,
  scadenza delle prove), che sta su `shopifyPaymentsAccount`: Shopify chiede
  **`read_shopify_payments`** o **`read_shopify_payments_accounts`**.
  ⚠️ Vale solo per Shopify Payments: una contestazione su un altro gateway lì non
  compare.

- **371 ordini senza data di consegna** (su 1.245 in tabella, 488 ancora «da gestire»):
  sono quelli che `chiudi-consegne-passate.mjs` non tocca di proposito. È un problema di
  **dati di Orders**, non di questa app, e va risolto lì.
- **2 rimborsi in stato «richiesto»** fermi in attesa di una decisione, e **1 reclamo
  aperto**: non è debito tecnico, è lavoro che aspetta una persona. ⚠️ Il reclamo aperto
  è **l'unico reclamo mai registrato** in tre settimane: o i reclami si trattano ancora
  fuori dall'app, o la strada per aprirne uno non si trova. Da chiedere all'utente prima
  di aggiungere altre funzioni a `/reclami`.
- **Template WhatsApp**: fuori dalla finestra di 24h Meta rifiuta i messaggi liberi, e
  «Nuovo messaggio» in Inbox oggi funziona **solo per la posta**. Costi (listino Meta
  1/7/2026, per messaggio, Italia): Marketing €0,0658, Utility/Authentication €0,0248,
  Service (risposte entro 24h) **gratis**.
- **Promemoria da spingere su Deluxy Tasks** (porta 3090, API a chiave): oggi le
  `Attivita` della dashboard restano qui, e sono un secondo registro.
- Allegati su **email** (su WhatsApp ci sono nei due versi; su Instagram e Messenger dal
  17/08/2026 si **ricevono**, non si inviano). ⚠️ Di quelli Instagram/Messenger teniamo
  solo l'indirizzo firmato di Meta, **che scade**: per conservarli davvero serve uno
  storage nostro, e lo scaricamento non può stare nel webhook (un webhook lento perde
  messaggi). Le foto arrivate **prima del 17/08 sono perse**: l'indirizzo veniva buttato.
- **Accendere `apreSulSito`** su Flowers e Cake dalla pagina «Widget dei siti»: il codice
  c'è ed è verificato, ma la spunta va accesa da una persona che sa se il widget è
  installato. Su deluxy.it **non va accesa** finché il sito non ha `widget.js`.
- **Segnalare spam sui canali chat**: oggi funziona solo sulla posta, perché l'elenco dei
  mittenti ignorati lo leggono solo le rotte email. Su WhatsApp e Instagram il blocco si
  fa da Meta.
- ~~Notifiche push filtrate sulle conversazioni mie~~ → **fatto il 19/08/2026** (mie e
  libere sì, quelle di un collega no). Resta da fare il passo successivo, se servirà:
  l'avviso **fuori dal browser** (telefono a schermo spento), che vuole un service worker
  e le Web Push — oggi se l'inbox è chiusa non arriva niente.
- **Il widget non sa chi sta scrivendo**: nessun campo nome/email prima del primo
  messaggio, quindi le conversazioni dei siti non si agganciano né al cliente né
  all'ordine. ⚠️ Le **18** rimaste a zero messaggi sono quelle del bug chiuso il 17/08 e
  restano perse; dopo il fix i visitatori hanno scritto davvero (**5 conversazioni con
  messaggi** al 19/08), quindi quella parte non è più «da provare».
- ~~**Rubrica Google**: restano clienti da smaltire~~ → **finito**, misurato il
  21/08: 1.143 contatti salvati, 0 rimasti, 0 errori. E ~~il conto alla rovescia
  della schermata di consenso in «Testing»~~ → **chiuso lo stesso giorno**: app
  pubblicata, token senza scadenza, People API `200` su 5.439 contatti.
- Account **`diagnostica@deluxy.local`** (operatore): è lì da luglio, non l'ha creato
  nessuna sessione nota. Da tenere o togliere — decisione dell'utente.

## Come riprendere

```bash
cd C:\Users\nicol\scoutwt\deluxy-messaging && npm install && npx prisma generate && npm run dev
```

Porta 3140. Senza `.env` con `DATABASE_URL` l'app non parte: vedi `.env.example`.
Il manuale funzionale completo è il **README.md** di questa cartella.

Prima di ogni commit, **entrambe**: `npx tsc --noEmit && npm run build`.
Su Windows, se `prisma generate` dà `EPERM … query_engine.dll`, ferma prima il dev
server: tiene il file bloccato.

Attenzione al database: è il **Postgres Supabase condiviso** con le altre app
(`?schema=messaging`). Mai `deleteMany` senza filtro per ripulire i test — cancella dati
veri (è già successo con la tabella `Utente`). Filtrare sui soli record creati dal test.
