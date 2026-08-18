# Verdetto dell'agente ostile

> Un investitore istituzionale scettico ha letto le cinque analisi, ne ha verificate le
> affermazioni con chiamate proprie e ha emesso un giudizio. È il documento più importante
> di questa cartella.
>
> **Nota di trasparenza**: il file `01-evidenza-turnover.md` che gli è stato dato in lettura
> è una sintesi redatta a valle dell'analisi originale, in cui alcuni prezzi citati dalla
> fonte erano stati omessi. L'agente ostile lo ha correttamente rilevato. L'errore è di
> редazione, non dell'analisi 1.

## Demolizione

### 1. «Il cambio di management ha alpha» contro «l'alpha viene dall'M&A»: ha ragione la seconda, con la prova sul caso-guida

Event study eseguito dall'agente ostile (market model su [-250,-30], due specifiche: contro FTSE MIB e contro STOXX 600 Telecom via EXV2.DE). CAR[-1,+1] con t-stat:

| Evento | Data | CAR vs MIB | t | CAR vs settore |
|---|---|---|---|---|
| Uscita Cattaneo | 28/07/2017 | +1,1% | 0,53 | +0,3% |
| Genish AD | 28/09/2017 | −1,1% | −0,50 | −0,6% |
| Assemblea Elliott | 04/05/2018 | +2,1% | 0,95 | +3,4% |
| Revoca deleghe Genish | 13/11/2018 | +2,3% | 0,86 | −1,6% |
| Gubitosi AD | 19/11/2018 | +6,1% | **2,32** | +4,6% |
| **Dimissioni Gubitosi + KKR** | 22/11/2021 | **+32,0%** | **12,06** | +28,8% |
| Dimissioni Gubitosi (formali) | 26/11/2021 | −1,3% | −0,50 | −2,2% |
| Labriola AD | 21/01/2022 | +3,5% | 0,70 | +3,2% |
| **Piano 2024-26 di Labriola** | 07/03/2024 | **−20,0%** | **−5,97** | −19,4% |
| Closing NetCo | 01/07/2024 | +2,5% | 0,58 | +2,5% |
| Annuncio OPAS Poste | 23/03/2026 | +1,9% | 0,60 | +1,4% |

Su 11 eventi solo due superano |t| = 2,4: il **+32% del 22/11/2021**, che è l'offerta KKR (l'uscita di Gubitosi formalizzata il 26/11 fa −1,3%, t = −0,50), e il **−20% del 07/03/2024**, cioè la presentazione del piano industriale del CEO su cui il fondo costruisce la tesi.

**L'unico evento di management statisticamente significativo su TIM in dieci anni è negativo, e nessuna delle cinque analisi lo cita.**

L'analisi 1 non è sbagliata in astratto, ma è inapplicabile a TIM **per ammissione della stessa analisi 1**: la sua condizione n. 8 (settore non in declino strutturale) esclude il telecom europeo, e la n. 2 (successore esterno) è violata da Labriola, interno al gruppo dal 2001.

### 2. Scale di prezzo mescolate nello stesso documento

L'analisi 2 usa `€0,505`, `€0,3465`, `~€0,83`, `€0,635/az. vecchia` nella tabella degli effetti di prezzo, e poi `€7,698` nel paragrafo finale. Il disclaimer in testa non salva un documento destinato a essere letto da un programma: qualunque estrattore produce una serie con un salto ×10. **Va riscritto in scala post-raggruppamento**, con il prezzo storico effettivo in colonna separata e mai in linea di testo.

### 3. Su cosa si regge la tesi: su niente di misurato

L'analisi 2 dichiara confidenza **bassa** su 7 eventi di management su 11. L'unico «alta» è il 22/11/2021, dove la nota dice che il driver è l'offerta KKR. Il caso-guida del fondo ha **zero effetti di prezzo misurati attribuibili al management**.

### 4. Il raggruppamento 1:10 è già gestito da Yahoo, e nessuna delle cinque analisi l'aveva testato

L'analisi 5 avvertiva del «-90% inesistente», l'analisi 3 certificava Yahoo senza provare il caso, l'analisi 4 elencava il rischio senza il test. **Il rischio reale è opposto**: che chi «corregge a mano» applichi un secondo ×10 sbagliando di un ordine di grandezza, in senso favorevole.

### 5. I numeri di rendimento dell'analisi 5 sono sbagliati, e a favore della tesi che l'analisi 5 voleva demolire

L'analisi 5 scrive 10 anni **+8,6%** e 5 anni **+124,9%**, concludendo che su 5 anni TIM batte l'indice. Ricalcolo dell'agente ostile: 10 anni **+0,1%**, 5 anni **+99,9%** contro FTSE MIB **total return +153,0%**. Il +124,9% si ottiene solo partendo da fine settembre 2021.

**Con il benchmark giusto TIM perde su tutte le finestre, inclusa quella scelta apposta per farla vincere.**

### 6. Quota Poste sbagliata e cronologia fuori ordine

Il comunicato Poste del 19/07/2026 dice **429.363.990 azioni TIM detenute** su 2.135.725.819 = **20,10%** (20,23% netto azioni proprie), non il 19,6% dell'analisi 2. Inoltre la timeline mette il 20-21/05/2026 sopra il 22/03/2026, e attribuisce una delibera del 18/07 a un comunicato del 29/07.

### 7. Le analisi 3 e 4 sono le uniche oneste, e si contraddicono sul punto che conta

L'analisi 4 richiede **≥40 eventi indipendenti out-of-sample** e ~64 per un t ≈ 2, e dice che nel telecom europeo non esistono. L'analisi 3 progetta un'infrastruttura per **40 titoli**. **L'infrastruttura proposta non può produrre il campione che il metodo richiede.**

Trappola concreta trovata incrociandole: Yahoo dà `annualTotalDebt 2025 = 13,22B`, TIM comunica leva `1,94x`. Il rapporto 13,22/4,60 dà **2,87x**. Sono metriche diverse (debito lordo IFRS 16 incluso contro posizione finanziaria netta after lease): un blocco «fondamentali» che leghi la leva a Yahoo produce un input **sbagliato del 48% senza fallire**.

## Verifiche eseguite dall'agente ostile

### A. Yahoo gestisce il raggruppamento? Sì, in `close` e in `adjclose`

Il payload contiene l'evento: `"splits":{"1781506800":{"numerator":1,"denominator":10,"splitRatio":"1:10"}}` — cioè il 15/06/2026. Attorno alla data nessuna discontinuità (7,886 → 7,867). Scansione dei 10 anni: **nessun salto tecnico**, solo due movimenti reali (+30,2% il 22/11/2021, −23,8% il 07/03/2024).

Regola operativa che ne deriva: leggere `adjclose`, **non applicare correzioni manuali**, ma leggere `events.splits` e mostrarlo in banner. *Se `events.splits` non è vuoto e l'interfaccia non lo dichiara, il grafico va marcato «non certificato»* — non «moltiplica per 10».

### B. Rendimenti ricalcolati (adjclose, dal 18/08 al 18/08)

| Finestra | TIM | FTSE MIB prezzo | **FTSE MIB total return** | STOXX600 Telecom TR |
|---|---|---|---|---|
| **10 anni** | **+0,1%** (CAGR 0,0%) | +219,5% | **+349,4% / +354,0%** (16,2%) | +41,3% |
| **5 anni** | **+99,9%** (14,9%) | +102,1% | **+153,0% / +152,8%** (20,4%) | +42,7% |
| 3 anni | +178,0% | +91,9% | — | +73,0% |
| 1 anno | +64,1% | +24,9% | — | +15,7% |

Due proxy total return indipendenti (Xtrackers ad accumulazione, Amundi a distribuzione) concordano entro 0,5 punti.

Sotto-periodi che smontano l'attribuzione al management:

| Periodo | TIM | MIB prezzo | Telecom EU |
|---|---|---|---|
| Labriola 21/01/2022 → closing NetCo 01/07/2024 | **−46,1%** | +24,6% | +0,8% |
| Labriola → minimo 12/10/2022 | **−59,1%** | — | — |
| Post-NetCo 01/07/2024 → oggi | **+240,8%** | +58,0% | +49,7% |
| Da Poste-CDP 14/02/2025 → oggi | +180,1% | +40,3% | +24,0% |
| Era Gubitosi (11/2018 → 11/2021) | −4,0% | +36,9% | +1,7% |
| Era Genish (09/2017 → 11/2018) | −32,6% | −14,9% | −8,7% |

**Chi ha comprato all'arrivo di ogni nuovo amministratore delegato ha perso. Il 100% del rendimento decennale di TIM è arrivato dopo la vendita della rete.**

### C. OPAS Poste — stato reale da fonte primaria

Dal comunicato Poste Italiane del 19/07/2026 (PDF scaricato e parsato):

- Corrispettivo: **€1,67 in denaro + 0,218 azioni Poste** di nuova emissione per azione TIM
- Periodo di adesione: **20/07/2026 → 11/09/2026** (40 giorni di borsa aperta)
- **Data di pagamento 18/09/2026**; eventuale riapertura dei termini 21-25/09 con pagamento **02/10/2026**
- **429.363.990 azioni TIM già detenute** da Poste su 2.135.725.819 emesse → **20,10%** (20,23% netto azioni proprie)
- Azioni oggetto d'offerta: 1.693.220.516

**Adesioni: 33.650.098 strumenti al 17/08/2026 = 1,9720%.** Poste più adesioni = 21,68% contro una soglia del **66,67%**, che è **rinunciabile**. Mancano ~45 punti in 18 sedute.

Il fatto più importante sul titolo oggi, che nessuna delle cinque analisi aveva calcolato:

| Data | Poste | Valore offerta (1,67 + 0,218 × Poste) | TIM | Spread |
|---|---|---|---|---|
| 20/03/2026 (pre-annuncio) | 20,821 | **6,209** | 5,762 | −7,2% (premio 7,8%) |
| 20/07/2026 (apertura) | 27,590 | 7,685 | 7,662 | −0,3% |
| 18/08/2026 | 27,310 | **7,624** | **7,702** | **+1,0%** |

**Il corrispettivo non è mai stato rilanciato: è salito del 22,8% da solo, perché Poste è salita del 31%.** La componente in carta vale oggi **78,1%** dell'offerta.

Conferma econometrica: dall'apertura del periodo di adesione i rendimenti giornalieri di TIM hanno **correlazione 0,82 e beta 0,74 con Poste**, contro **correlazione 0,14 col FTSE MIB**.

**Chi è lungo TIM oggi è lungo Poste Italiane con un delta del 74%. Non è un turnaround telco: è un tracker di Poste con un pavimento in contanti di €1,67.**

### D. Valutazione ricalcolata

Capitalizzazione €16,45 mld + posizione finanziaria netta AL €7,3 mld = **EV €23,75 mld**. Su EBITDA 2025 (4,60) = **5,16x**; su EBITDA AL a ritmo corrente (~3,9) = **6,09x**. Utile netto 2025 €297 mln → **P/E 55x**. FCF 2025 €37 mln → **rendimento del FCF 0,22%**.

**Il titolo non è a sconto su nulla. Il prezzo è l'offerta.**

## Elementi fondamentali che sopravvivono

1. Yahoo `TIT.MI` gestisce correttamente split e dividendi; l'evento split è nel payload — *verificata*
2. `TIT.MI` è il simbolo giusto; `annualTotalDebt` salta 31,55 → 14,72 nel 2024 per NetCo — *verificata*
3. **TIM ha reso ~0% in 10 anni contro +350% del FTSE MIB total return** — *verificata* (contro il numero pubblicato dall'analisi 5)
4. **Nessun cambio di CEO su TIM produce CAR significativo; l'unico significativo positivo è l'offerta KKR, l'unico significativo negativo è il piano del CEO in carica** — *verificata*
5. Corrispettivo, calendario e quota Poste dell'OPAS — *verificata su comunicato primario*
6. Adesioni 1,972% al 17/08/2026 contro soglia 66,67% rinunciabile — *verificata*
7. **78,1% del corrispettivo è carta Poste; TIM ha beta 0,74 e correlazione 0,82 su Poste** — *verificata*. È l'unica affermazione forte dei cinque documenti che passa indenne
8. Inesistenza di feed strutturati italiani — *plausibile*, non ri-testata
9. Quadro regolamentare (riserva TUF, art. 166, MAR) — *plausibile*, da confermare con un legale
10. La letteratura dell'analisi 1 esiste ed è correttamente riassunta, ma è statunitense, precedente al 2008, e **non è stata dimostrata applicabile all'Europa 2026 né a questo caso** — *non verificabile*

Tutto il resto (cronologia pre-2021, quota CDP residua, earn-out NetCo, closing Sparkle, TIM Brasil, buonuscite) resta **non verificato**.

## Il verdetto

> **Il fondo così com'è: da buttare. Non «da riformulare» — la tesi centrale è falsificata sul suo stesso caso-guida, e l'unico numero che la sosteneva è un errore aritmetico.**

- Il segnale «cambio management» su TIM ha CAR indistinguibile da zero in dieci anni e undici eventi, e l'unica reazione significativa al lavoro di un amministratore delegato è **−20% con t = −5,97**.
- Il rendimento che ha generato l'idea (+240% dal luglio 2024) è **cessione di asset + cambio di azionista + OPAS**: è merger arbitrage e situazioni speciali, con capacità, costi e competenze completamente diverse.
- TIM ha reso 0,1% in dieci anni contro +350% del listino.
- Il caso è **strutturalmente non ripetibile ora**: oggi TIM è un'esposizione a Poste con beta 0,74, un'offerta all'1,97% di adesioni contro una soglia del 66,67% e l'uscita dal mercato come esito più probabile.
- **La strategia non è testabile con i dati che il progetto prevede di raccogliere.**
- Senza autorizzazione TUF il prodotto descritto non è pubblicabile con quel linguaggio.

**Cosa si salva**: le analisi 3 e 4. Il piano dati a costo zero funziona, lo schema con stato delle fonti e confidenza è giusto, e il metodo (percentili di peer, blocchi rinormalizzati, «da valutare» sotto il 50% di copertura, placebo, calendar-time invece di BHAR) è di livello professionale.

> **Il prodotto giusto non è un fondo: è un motore di event study e di igiene del dato, che dice onestamente «questo evento non ha effetto misurabile». Su TIM avrebbe dato la risposta giusta in un pomeriggio.**

## La condizione che farebbe cambiare idea

Una sola:

> Un backtest su **≥150 cambi di CEO in Europa fra il 2005 e il 2020**, universo point-in-time **comprensivo di delistati, OPA e dissesti**, ingresso alla chiusura del giorno **successivo** all'annuncio, alpha su **calendar-time portfolio a 4 fattori con dummy di settore**, con **alpha positiva e intervallo di confidenza al 95% che esclude lo zero dopo spread, impatto e costo del prestito titoli**, **mediana e hit-rate positivi**, **robusta a ±50% sui pesi**, e — condizione decisiva — **che l'alpha sopravviva all'esclusione di ogni evento in cui, entro 24 mesi, si sia verificata un'OPA, un cambio di azionista di controllo o una cessione superiore al 20% dell'enterprise value**.

Se l'alpha sopravvive a quest'ultima esclusione, il fondo esiste. Se sparisce, la strategia va rinominata **«situazioni speciali / merger arbitrage europeo»**: legittimo, molto affollato, e da vendere per quello che è.
