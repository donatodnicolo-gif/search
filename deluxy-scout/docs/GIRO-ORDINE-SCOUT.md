# Il giro di un ordine Scout: chi lo racconta a Budgets

_28/08/2026 — nasce dalla domanda dell'utente: «ordini per cui viene richiesta
una consegna finiscono in app delivery che poi comunica comunque con budget,
come funziona?»_

## Il numero d'ordine: SCOUT001, e arriva alla CHIUSURA

Un ordine nasce **bozza**, senza numero. Prende `SCOUT001`, `SCOUT002`, … nel
momento in cui la pratica viene **chiusa** (decisione dell'utente: «assegna il
numero d'ordine solo alla chiusura, il resto sono draft»). Il progressivo
racconta così gli ordini veri in ordine di chiusura, senza i buchi lasciati
dalle pratiche morte per strada.

Lo assegna il **database** (migr. 0095 + 0098: sequenza e trigger), non l'app:
un ordine si chiude da due strade diverse — aggancia le fatture, oppure emetti
la fattura — e domani da una terza. Se il numero lo desse il codice, la strada
nuova nascerebbe senza.

Tre proprietà che valgono più della comodità:

- **non riparte da 1 ogni anno** (nel 2027 SCOUT001 rinascerebbe uguale, e due
  consegne diverse avrebbero lo stesso DDT);
- **non si può cambiare** (l'UPDATE solleva un'eccezione);
- **riaprire un ordine non glielo toglie**, e richiuderlo non gliene dà uno
  nuovo.

I cinque ordini che c'erano quando la funzione è nata si tengono il numero
anche se non ancora chiusi: toglierlo vorrebbe dire cancellare un
identificativo già letto, e forse già scritto altrove.

## L'annuncio alla squadra

Alla chiusura parte `[ORDINE SCOUT] SCOUT001 · Cliente · € 1.200` a tutti gli
account (Edge Function `notifica-ordine`), come Shopify fa con gli ordini del
sito. Una sola volta per ordine: la data dell'annuncio è scritta sull'ordine
(`annunciato_il`) e la prenotazione è una update condizionata, così due schede
aperte non mandano due copie.

Il mittente è la **casella dell'azienda** — `commerciale@deluxy.it`, in
`impostazioni.mail.casella_annunci` (migr. 0097) — non quella personale di chi
ha chiuso: è la voce dell'azienda, e deve essere sempre la stessa.

Nella mail c'è l'istruzione operativa: scrivere il numero nel campo **DDT** del
servizio sulla piattaforma consegne. In /ordini la pillola col numero si copia
con un tocco.

## Dove finisce ogni euro (misurato, non dedotto)

Deluxy Budgets si costruisce il conto economico da **tre fonti**, e nessuna di
queste è Scout:

| Voce | Casa del dato | Come arriva a Budgets |
| --- | --- | --- |
| **Ricavo** dell'ordine | FINANCE (fattura emessa) | Budgets legge le fatture |
| **Costo della fornitura** (fioraio, catering, backdrop) | banca | uscita categorizzata dal CFO |
| **Costo della consegna** (paga del valet + ritenuta) | piattaforma consegne | `GET /app/costi-consegne` |

Ognuno è raccontato **una volta sola, da una app sola**. È lo Standard Deluxy §7:
ogni dato ha una casa, gli altri leggono.

## ⚠️ Perché le consegne con DDT `SCOUT…` NON si escludono da Budgets

La richiesta era: «in app delivery quelli così vengono esclusi da budget perché
passano da questa scout a finance direttamente».

**Da Scout a FINANCE passa la fattura, cioè il RICAVO — non i costi.** Il valet
che porta la consegna di un ordine Scout viene pagato lo stesso, e quella paga
la conosce solo la piattaforma: è lei la casa del dato. Togliendola dal feed,
il costo non si sposterebbe altrove — **sparirebbe**, e il conto economico
mostrerebbe un margine più alto del vero.

Non c'è nemmeno il doppio conteggio che l'esclusione voleva evitare: il ricavo
arriva da FINANCE, il costo della consegna dalla piattaforma, la fornitura dalla
banca. Tre voci diverse, tre fonti diverse.

**Quello che invece va tenuto d'occhio**, ed è dove il doppione può nascere
davvero:

1. **La consegna di un ordine Scout non si fattura a un partner.** Deluxy la fa
   per sé e la fattura al cliente finale da FINANCE: se sulla piattaforma
   restasse `billable = true` verso un negozio, nascerebbe un ricavo che non
   esiste.
2. **Il costo della consegna non si riscrive in Scout come «altri costi».**
   Nel margine del singolo ordine ci sta (serve a sapere quanto resta), ma la
   casa di quel numero è la piattaforma: Scout non lo trasmette a nessuno, e non
   deve iniziare a farlo.

Se un giorno si vorrà davvero escluderle, prima si **misura quanto sono**: la
riga «consegne» del consuntivo si abbasserebbe di quella cifra esatta, e va
saputo prima, non dopo.

## ⚠️ Il DDT sulla piattaforma ha già un significato

`ddtNumber` non è un campo libero: stesso valet + stesso giorno + stesso DDT
vuol dire **un giro solo**, pagato una volta (`giriPerDdt` in
`api/src/salaries`). Se un ordine Scout genera **due consegne distinte fatte
dallo stesso valet nello stesso giorno**, scrivere lo stesso `SCOUT00N` su
entrambe **taglia la paga di una**. Con una consegna per ordine non succede
niente; se capita il caso doppio serve un campo dedicato, non il DDT.
