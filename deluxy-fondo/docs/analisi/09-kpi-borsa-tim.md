# KPI di borsa di TIM — 5 anni, calcolati sui dati reali

> Calcolati da un agente su `TIT.MI` (Yahoo chart v8, 1.270 sedute, 18/08/2021 → 18/08/2026).
> La verifica del raggruppamento è stata ripetuta e confermata anche in autonomia sul file
> `dati/serie-TIT.MI.json` scaricato dall'app.

## Verifica del raggruppamento — il punto da cui dipende tutto il resto

| data | open | close | adjclose | adjclose/close |
|---|---|---|---|---|
| 2026-06-12 | 7,670 | 7,886 | 7,886 | 1,000000 |
| **2026-06-15** (raggruppamento) | **8,050** | **7,867** | **7,867** | 1,000000 |
| 2026-06-16 | 7,832 | 7,988 | 7,988 | 1,000000 |

**Nessun salto ×10 il 15/06/2026**: 7,886 → 7,867, cioè −0,24%. Su tutte le 1.270 sedute il rapporto `adjclose/close` è esattamente 1,000000.

Controprova sul lato lungo: il **18/08/2021 la chiusura in serie è 3,852**, mentre TIM allora trattava a ~0,385 €. **La serie è stata rettificata ×10 all'indietro su tutta la storia.**

**Conclusione: serie già rettificata. Correzione applicata: nessuna.** Applicare il ×10 a mano avrebbe raddoppiato l'errore.

Attenzione: `adjclose == close` ovunque significa che la serie **non è total-return**. TIM non ha pagato dividendi nel periodo, quindi per TIM è ininfluente — ma il confronto col benchmark ne risente (vedi Avvertenze).

## Rendimenti (al 18/08/2026)

| periodo | TIM | FTSE MIB | Telecom EU | TIM−MIB | TIM−Telecom EU |
|---|---|---|---|---|---|
| 1 mese | −1,8% | +2,7% | +2,2% | **−4,5pp** | −4,0pp |
| 3 mesi | +6,3% | +9,5% | −8,3% | −3,1pp | +14,6pp |
| 6 mesi | +19,4% | +14,9% | −0,4% | +4,5pp | +19,8pp |
| 12 mesi | **+64,1%** | +24,9% | +15,7% | **+39,2pp** | +48,4pp |
| 3 anni | **+178,0%** | +91,9% | +73,0% | **+86,1pp** | +105,0pp |
| 5 anni | +100,0% | +102,1% | +42,7% | **−2,1pp** | +57,3pp |

**Su 5 anni TIM ha fatto quanto l'indice sopportando il doppio della volatilità e un drawdown del 65%.** Tutto il vantaggio è concentrato negli ultimi 3 anni.

## Rischio

| metrica | TIM | FTSE MIB |
|---|---|---|
| Volatilità annualizzata 60g | 17,3% | 13,6% |
| Volatilità annualizzata 250g | **28,6%** | 15,8% |
| Beta 250 sedute | **0,513** | 1,00 |
| Correlazione 250 sedute | **0,283** | — |
| Beta 5 anni | 0,904 | 1,00 |

Max drawdown 5 anni: **−65,5%**, dal 24/11/2021 (4,972, picco KKR) al 12/10/2022 (1,713). **Recupero del picco solo il 16/10/2025**: 3 anni e 11 mesi sott'acqua.

Il beta a 250 sedute (0,513) contro quello a 5 anni (0,904) dice la cosa più utile: **oggi TIM non è un titolo di mercato, è un titolo di operazione straordinaria.** Il prezzo è ancorato al perimetro dell'OPAS, non al ciclo.

## Tendenza

Prezzo **7,703** · MA50 **7,760** · MA200 **6,405** → −0,7% dalla MA50, **+20,3% dalla MA200**.

| tipo | data | prezzo | rendimento del tratto |
|---|---|---|---|
| GOLDEN | 2023-02-02 | 2,870 | −8,6% |
| DEATH | 2023-07-31 | 2,623 | +5,7% |
| GOLDEN | 2023-08-23 | 2,773 | −6,3% |
| DEATH | 2023-11-16 | 2,599 | +8,4% |
| GOLDEN | 2024-01-18 | 2,818 | **−22,5%** |
| DEATH | 2024-03-18 | 2,185 | +10,6% |
| **GOLDEN** | **2024-10-24** | **2,416** | **+218,8%** (in corso) |

Sei incroci su sette hanno dato il segno sbagliato. Il settimo ha fatto +219%.

## Momentum e volume

Rendimento 6-1: **+21,6%** · RSI 14: **55,9** (neutro) · massimo 52w **8,139** (01/07/2026) · minimo 52w **4,096** (29/08/2025) · posizione nel range 52w **89,2%**.

Volume medio 20g **10,8 mln** contro media 250g **16,4 mln**: rapporto **0,66**. Il volume si prosciuga — tipico di un titolo in attesa di un esito societario.

## Eventi e rendimenti in eccesso sul FTSE MIB (punti percentuali)

| evento | data | t+1 | t+5 | t+20 | t+60 | t+120 |
|---|---|---|---|---|---|---|
| Offerta KKR | 22/11/21 | −3,1 | +9,3 | +0,2 | −6,7 | **−26,3** |
| Dimissioni Gubitosi | 26/11/21 | −2,7 | −3,7 | −14,7 | −18,2 | **−36,3** |
| Labriola AD | 21/01/22 | +1,5 | −1,1 | −1,1 | −18,0 | **−19,4** |
| Closing NetCo | 01/07/24 | +2,9 | +0,0 | +1,3 | +7,7 | **+19,4** |
| Piano 2025-27 | 12/02/25 | −3,6 | −12,3 | −12,4 | +12,0 | **+24,9** |
| Poste compra 15% | 29/03/25 | +1,5 | +4,4 | +13,1 | +30,9 | **+31,1** |
| Annuncio OPAS Poste | 22/03/26 | −0,8 | −2,6 | −0,6 | +8,2 | n.d. |
| Raggruppamento 1:10 | 15/06/26 | +0,4 | −3,0 | +0,1 | n.d. | n.d. |
| Risultati H1 2026 | 29/07/26 | −1,7 | −0,4 | n.d. | n.d. | n.d. |

Quattro letture:

1. **Nessun evento paga a t+1.** La mediana dell'eccesso a t+1 è −0,8pp. Comprare sulla notizia non funziona mai.
2. **L'eccesso si forma tra t+60 e t+120, e solo sugli eventi del 2024-2025**: closing NetCo (+19,4pp), Piano 2025-27 (+24,9pp), ingresso Poste (+31,1pp). Il Piano a t+20 era a −12,4pp: chi vendeva sulla debolezza a un mese si perdeva i +24,9pp del quarto mese.
3. **Gli eventi 2021-2022 distruggono valore a ogni orizzonte.** L'offerta KKR: il +30,2% è tutto nel *giorno* dell'annuncio, e nei 120 giorni successivi il titolo perde 26,3pp contro l'indice.
4. **Il raggruppamento è un non-evento** (+0,4pp a t+1): come dev'essere, è un'operazione contabile.

## Concentrazione dei rendimenti

| scenario | rendimento 5 anni |
|---|---|
| tutte le sedute | **+100,0%** |
| togliendo le 10 migliori | **−30,0%** |
| togliendo le 10 peggiori | +553,1% |
| togliendo entrambe | +128,7% |

**Dieci sedute su 1.269 fanno la differenza fra +100% e −30%.** Le due che pesano di più (22 e 24/11/2021: +30,2% e +15,6%) sono la reazione all'offerta KKR: nessun filtro di momentum e nessun incrocio di medie le avrebbe prese. Simmetricamente il −23,8% del 07/03/2024 è arrivato in un giorno in cui l'indice faceva +0,2%. **Su questo titolo un segnale lento non cattura né il guadagno né la protezione.**

## Le strategie a confronto — la risposta alla domanda

| tratto | da | a | TIM | MIB | eccesso |
|---|---|---|---|---|---|
| Uscita Gubitosi | 26/11/21 | 21/01/22 | **−12,7%** | +4,7% | −17,4pp |
| Insediamento Labriola | 21/01/22 | 18/08/26 | +83,7% | +96,9% | −13,1pp |
| **Catena completa** | 26/11/21 | 18/08/26 | **+60,3%** | +106,1% | **−45,8pp** |

| strategia | totale | CAGR |
|---|---|---|
| **Catena dei cambi di CEO** | **+60,3%** | **+10,5%** |
| Buy & hold TIM 5 anni | +100,0% | +14,9% |
| Buy & hold FTSE MIB 5 anni | +102,1% | +15,1% |
| Buy & hold telecom EU (EXV2) | +42,7% | +7,4% |
| Incrocio MA50/MA200 long-only | +111,8% | — |
| — buy & hold stesso sottoperiodo | **+166,4%** | — |
| **TIM dal closing NetCo** (01/07/24) | **+240,8%** | +77,8% |
| — MIB stesso periodo | +58,0% | +24,0% |
| **TIM dall'ingresso di Poste** (31/03/25) | **+147,8%** | +92,8% |
| — MIB stesso periodo | +40,0% | +27,5% |

**La strategia "compra a ogni cambio di CEO" ha reso +60,3% in 4,73 anni: 40 punti sotto il buy & hold su TIM, 46 sotto l'indice, e persino sotto il banale "compra quando arriva Labriola e non fare più niente" (+83,7%).** Il motivo è meccanico: il cambio di CEO fa entrare a 6 sedute dal picco da offerta KKR, cioè nel punto di massima euforia da M&A.

Anche il segnale tecnico perde: l'incrocio MA50/MA200 fa +111,8% contro +166,4% del buy & hold, perché i sei falsi segnali del 2023-2024 mangiano quello che il settimo produce.

**Quello che ha funzionato non è un segnale di calendario né di trend, ma il cambio di struttura proprietaria e di perimetro**: closing NetCo e ingresso di Poste. Entrambi con l'eccesso accumulato lentamente fra t+20 e t+120, quindi catturabile anche entrando settimane dopo l'annuncio — al contrario dell'offerta KKR, tutta in una seduta.

## Avvertenze

- **Il campione è N=8 eventi e 2 tratti di "strategia CEO".** Nessuna significatività statistica: sono descrizioni di casi, non stime. Un tratto su due è un lancio di moneta.
- **Rendimenti non omogenei fra loro.** TIM non paga dividendi, quindi la sua serie è corretta. Ma **FTSE MIB è un indice di prezzo** (esclude ~3-4% annuo di dividendi) mentre **EXV2.DE è total-return**. Il confronto TIM vs MIB **sovrastima TIM di circa 15-20 punti su 5 anni**: il "−2,1pp" reale è nell'ordine di **−17/−22pp**. È la fragilità più grossa del rapporto.
- **L'ultima seduta è parziale** (volume 1,7 mln contro media 10,8 mln): tutti i valori "attuali" si muoveranno alla chiusura.
- **Il raggruppamento è verificato, la conversione delle risparmio no.** I rendimenti per azione qui calcolati non sono rendimenti per azionista se la conversione di maggio 2026 ha diluito. Nessuna discontinuità anomala trovata, ma è assenza di prova, non prova di assenza.
- **Beta e correlazione a 250 sedute (0,513 / 0,283) non sono misure di rischio utilizzabili.** Con correlazione 0,28 il beta spiega meno dell'8% della varianza: il titolo è guidato dall'OPAS. Usarlo in un modello di portafoglio darebbe un falso senso di decorrelazione che sparisce il giorno in cui l'operazione salta.
- **Il rendimento a 5 anni parte dal 18/08/2021**, tre mesi prima del picco KKR: spostare l'inizio di poche settimane cambia il verdetto di decine di punti. Il confronto quinquennale è un artefatto della finestra.
- **Tutti i rendimenti sono lordi**: nessuna commissione, nessuno spread, nessuna imposta.
- Il titolo oggi tratta **dentro il perimetro di un'offerta pubblica**: il prezzo riflette la probabilità di esito di quell'operazione, non una valutazione autonoma. Nessun KPI tecnico di queste tabelle ha potere predittivo in quel regime.
