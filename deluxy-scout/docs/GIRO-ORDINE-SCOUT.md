# Il giro di un ordine Scout: chi lo racconta a Budgets

_28/08/2026 — nasce dalla domanda dell'utente: «ordini per cui viene richiesta
una consegna finiscono in app delivery che poi comunica comunque con budget,
come funziona?»_

## Il riferimento: SCOUT001

Ogni ordine nasce con un **riferimento progressivo** — `SCOUT001`, `SCOUT002`,
… — assegnato dal database (migr. 0095, trigger + sequenza), non dall'app: un
ordine nasce da tre strade diverse e domani da una quarta, e il numero deve
esserci comunque.

**Non riparte da 1 ogni anno** e **non si può cambiare**: è il filo che lega una
consegna, in un'altra app, al suo ordine. Un numero riusato o spostato romperebbe
quel filo in silenzio.

Alla creazione parte una mail `[ORDINE SCOUT] SCOUT001 · Cliente · € 1.200` a
tutti gli account (Edge Function `notifica-ordine`), come Shopify fa con gli
ordini del sito. Una sola volta per ordine: la data dell'annuncio è scritta
sull'ordine (`annunciato_il`).

Quando l'ordine ha bisogno di una consegna, il riferimento si scrive nel campo
**DDT** del servizio sulla piattaforma consegne. Dalla pillola in /ordini si
copia con un tocco.

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
   esiste. Va aperta con la vendita a nome Deluxy.
2. **Il costo della consegna non si riscrive in Scout come «altri costi».**
   Nel margine del singolo ordine ci sta (serve a sapere quanto resta), ma è un
   numero di cui la casa è la piattaforma: Scout non lo trasmette a nessuno, e
   non deve iniziare a farlo.

Se un giorno si vorrà davvero escluderle, prima si **misura quanto sono**: la
riga «consegne» del consuntivo si abbasserebbe di quella cifra esatta, e va
saputo prima, non dopo.
