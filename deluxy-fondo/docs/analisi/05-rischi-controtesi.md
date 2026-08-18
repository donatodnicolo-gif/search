# Analisi 5 di 5 — Rischi e contro-tesi (risk manager / avvocato del diavolo)

## Le 10 ragioni per cui questo fondo perde soldi

**1. La tesi è costruita all'indietro sull'unico caso che ha funzionato.** Il fondo nasce perché TIM è salita. Ma TIM è salita *dopo* il quarto CEO, non per merito del cambio di management: chi ha comprato all'arrivo di Labriola (gen. 2022) ha perso il 33% nei successivi 30 mesi. Il rendimento è arrivato tutto negli ultimi 14 mesi, dopo la cessione di NetCo e l'ingresso di Poste. È selezione ex post di un episodio, non una strategia.

**2. Il ritorno non viene dal turnaround operativo ma dall'M&A.** Da giugno 2024 a oggi TIM fa +240%: nel mezzo ci sono la vendita della rete a KKR, l'uscita di Vivendi, l'ingresso di Poste al posto di CDP e un'OPAS. Se il vero fattore è "arriva un compratore controllante", la strategia da comprare è **merger-arb** — con costi, rischi e capacità completamente diversi.

**3. Il settore distrugge capitale a monte del management.** Il ROCE dei membri ETNO è passato dal 9,1% (2017) al 5,8% (2022), sotto il costo del capitale. L'ARPU mobile TIM Italia è fermo a €10,7/mese nel 2° trim. 2026 nonostante dieci ritocchi di prezzo nel 2026. Il nuovo corso non cambia la struttura del mercato.

**4. La leva mangia il turnaround.** TIM, dopo aver ceduto l'asset più grande della sua storia, ha ancora ~€7,3 mld di debito netto (giu. 2026). Con leva alta, ogni miglioramento operativo va ai creditori prima che all'azionista.

**5. Vincoli sindacali e politici rendono il piano non eseguibile.** Le leve che un CEO userebbe in un turnaround privato in Italia sono negoziate, non decise. Il piano annunciato e il piano eseguibile divergono sistematicamente.

**6. Azionisti in conflitto strutturale.** Il decennio TIM è la guerra Vivendi–Elliott–CDP–governo. Quattro CEO dal 2016 e ≥€31 mln di buonuscite sono il prezzo di quel conflitto, pagato dall'azionista.

**7. Rischio delisting/OPA che tronca la tesi — ed è attivo ora.** L'OPAS Poste (adesioni fino all'11 set. 2026, regolamento 18 set.) punta al 66,67% e al delisting. Al 7 ago. le adesioni erano l'1,53%. Due esiti, entrambi cattivi per la tesi: l'offerta passa e il titolo esce dal mercato, oppure fallisce e il premio da controllo si sgonfia.

**8. Il corrispettivo non è cash: si è lunghi Poste senza saperlo.** ~78% del valore dell'offerta è in azioni Poste. Chi tiene TIM oggi ha un'esposizione implicita a un titolo bancario-postale controllato dallo Stato, non a un turnaround telco.

**9. Illiquidità e trappole tecniche dei titoli "in ristrutturazione".** TIM ha fatto un **raggruppamento 1:10 il 15 giugno 2026 con cambio ISIN** (IT0003497168 → IT0005712671). Ogni serie storica non rettificata mostra un -90% inesistente. Un backtest o un alert costruito su prezzi grezzi è semplicemente sbagliato.

**10. Golden power e nomine politiche.** Il fondo non compra un'azienda: compra una politica industriale, con un decisore che non massimizza il valore per l'azionista di minoranza.

## TIM: i numeri contro la tesi

Rendimenti al 17/08/2026, chiusure mensili rettificate per dividendi e raggruppamento (fonte: Yahoo Finance, `TIT.MI`, `FTSEMIB.MI`, `EXV2.DE`).

| Periodo | TIM | FTSE MIB (solo prezzo) | Telecom EU (iShares STOXX 600 Telecom, TR) |
|---|---|---|---|
| 10 anni (ago 2016 → ago 2026) | **+8,6%** (0,8%/anno) | +226,7% (12,6%/anno) | +44,6% (3,8%/anno) |
| 5 anni (ago 2021 → ago 2026) | **+124,9%** (17,6%/anno) | +108,6% (15,8%/anno) | +51,9% (8,7%/anno) |
| Da luglio 2017 (uscita Cattaneo) | **+0,6% in 9 anni** | — | — |
| Sotto Labriola, ago 2021 → giu 2024 | **−33,2%** | — | — |
| Da giugno 2024 (post-NetCo) | **+239,7%** | — | — |
| Da febbraio 2025 (Poste rileva la quota CDP) | **+147,8%** | — | — |

**Onestà metodologica**: il FTSE MIB è un indice di *prezzo*, quindi il divario a 10 anni è **sottostimato** di ~3-4 punti l'anno di dividendi. Il 5 anni di TIM è calcolato da un minimo storico e batte l'indice: è il dato che la tesi userà. Ma quel +125% è concentrato negli ultimi 14 mesi ed è attribuibile a cessione di asset, cambio di azionista e OPAS — eventi che nessuno screening "nuovo CEO" avrebbe anticipato. **Su dieci anni e quattro nuovi corsi, TIM ha reso lo 0,8% annuo contro il 12,6% del listino.**

## Rischi normativi e operativi

**Non è un fondo, ed è illegale far finta che lo sia.** In Italia gestione di portafogli, gestione collettiva e **consulenza in materia di investimenti** sono attività riservate (TUF, D.Lgs. 58/1998): servono autorizzazione Consob/Banca d'Italia e forma di SIM/SGR (o, per la consulenza indipendente, iscrizione all'albo OCF), con perimetro MiFID II. L'esercizio abusivo è **reato** ex art. 166 TUF. Una web-app che pubblica segnali su singoli titoli con tono prescrittivo ("comprare TIM") è raccomandazione personalizzata o, se generica, ricade nella disciplina sulle *investment recommendations* (MAR, Reg. UE 596/2014 art. 20 + Reg. delegato 2016/958: identità dell'autore, metodologia, conflitti, storico delle raccomandazioni).

**Rischi tecnici che diventano rischi finanziari.** Fonti gratuite non hanno SLA. Un endpoint che cambia schema, un ISIN che cambia, un raggruppamento non gestito, un prezzo di chiusura provvisorio: ognuno produce un segnale "verde" per bug. Il rischio peggiore non è il dato mancante (visibile) ma il dato **stantio servito come fresco** (invisibile).

## Requisiti non negoziabili per l'app

1. **Timestamp del dato e sua età** su ogni numero, con la riga che si spegne oltre una soglia. Mai un numero senza data.
2. **Fonte esplicita per ogni numero**, cliccabile. Nessun valore derivato senza formula ispezionabile.
3. **Stato di ogni fonte** in testata: se una fonte cade, **il segnale sparisce**, non diventa neutro. Un "verde" per assenza di dati è il bug che costa i soldi.
4. **Banner corporate actions**: raggruppamenti, cambi ISIN, OPA/OPAS in corso con scadenza e corrispettivo. Nessun grafico storico senza flag "rettificato (sì/no)".
5. **Disclaimer non chiudibile**: contenuto informativo, non consulenza; nessun soggetto autorizzato ai sensi del TUF. Vietato il linguaggio imperativo ("compra", "vendi", "target"); ammesso solo descrittivo ("evento rilevato: cambio CEO").
6. **Nessun bottone che esegue ordini**, nessuna integrazione con broker, nessuna gestione di denaro di terzi.
7. **Contro-evidenza obbligatoria accanto a ogni tesi**: benchmark (MIB e settore) sempre a fianco del titolo, e i casi in cui lo stesso segnale ha fallito.
8. **Registro immutabile dei segnali** (data, dato usato, versione del codice): senza track record verificabile ex ante, ogni performance dichiarata è aneddotica.

## Cosa mi farebbe cambiare idea

- Un backtest **out-of-sample** su ≥150 cambi di CEO in Europa 2005-2020, che includa fallimenti e delisting, con rendimenti *risk-adjusted* contro il settore.
- Isolamento del fattore: se l'alpha sparisce controllando per M&A, cessioni di asset e cambio di azionista di controllo, la tesi è merger-arb travestita e va detta così.
- Evidenza che il segnale funzioni **in settori con ROCE > WACC** e leva < 2x.
- Un caso in cui il fondo abbia **perso** su un cambio di management e lo abbia pubblicato prima che glielo chiedessero.
- Autorizzazione o partnership con un soggetto vigilato prima di toccare capitale di terzi.

## Fonti

[Yahoo Finance TIT.MI](https://finance.yahoo.com/quote/TIT.MI/) · [TIM: reverse stock split completed](https://www.gruppotim.it/en/press-archive/corporate/2026/PR-TIM-Reverse-stock-split-15-june.html) · [Il Sole 24 Ore: OPAS Poste su TIM](https://en.ilsole24ore.com/art/poste-launches-tender-offer-to-acquire-telecom-italia-AISLRU6B) · [Poste: quota TIM al 27,32%](https://www.posteitaliane.it/en/press-releases/posteitalianeincre-1476645021841.html) · [Il Sole 24 Ore: quattro CEO in 5 anni, 31 mln di buonuscite](https://www.ilsole24ore.com/art/tim-quarto-ceo-5-anni-e-31-milioni-spesi-buonuscite-AEyB3tfG) · [CEPR: EU telecom and cost of capital](https://cepr.org/voxeu/columns/analysis-eu-telecom-sectors-ability-remunerate-its-cost-capital) · [Light Reading: ROCE ETNO 9,1% → 5,8%](https://www.lightreading.com/5g/crisis-hit-european-telecom-sector-needs-a-reboot) · [Art. 166 TUF — abusivismo](https://www.brocardi.it/testo-unico-intermediazione-finanziaria/parte-v/titolo-i/capo-i/art166.html) · [Consob — TUF](https://www.consob.it/documents/46180/46181/TUF_agg_dlgs_233_2017.html)
