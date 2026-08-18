# Deluxy Fondo

Strumento di ricerca per una strategia di investimento basata sul **cambio di management**:
monitora ogni giorno aziende che hanno cambiato vertice o azionista di controllo e misura
quanto quel cambio abbia davvero spostato il prezzo.

Porta **3180**. `npm run dev`, poi <http://localhost:3180>.

> **Non è consulenza finanziaria.** L'app mostra dati pubblici, indicatori calcolati e
> ipotesi con le loro assunzioni. Non raccomanda operazioni, non esegue ordini, non si
> collega ad alcun intermediario. In Italia gestione di portafogli e consulenza in materia
> di investimenti sono attività riservate ai sensi del Testo unico della finanza.

## Il risultato, in breve

L'app nasce da un'analisi condotta da cinque agenti indipendenti, sottoposta a un revisore
ostile e verificata sui dati reali. **Il verdetto è negativo per la tesi di partenza**:

- Sul caso guida (TIM), la strategia «compra a ogni cambio di amministratore delegato»
  ha reso **+60,3%** in 4,7 anni, contro **+100%** del comprare e tenere e **+106%**
  dell'indice.
- Su dieci anni TIM ha reso **circa zero**, contro **+350%** del FTSE MIB a dividendi
  reinvestiti.
- Su undici eventi di management misurati, l'unico statisticamente significativo
  attribuibile al lavoro di un amministratore delegato è **negativo**: −20% (t = −5,97)
  alla presentazione del piano del 7 marzo 2024.
- Il rialzo del titolo viene da **cessione della rete, cambio dell'azionista e offerta
  pubblica**: è merger arbitrage, non gestione d'impresa.

L'app implementa quindi ciò che il lavoro giustifica: un **motore di studio degli eventi e
di igiene del dato**, che dice quando un evento non ha effetto misurabile.

## Comandi

```bash
npm run dev          # sviluppo sulla porta 3180
npm run aggiorna     # giro completo: prezzi 10 anni, fondamentali, notizie
npm run aggiorna -- --breve   # giro giornaliero: solo l'ultimo anno
npm run typecheck    # controllo dei tipi
npm run build        # build di produzione
```

`npm run aggiorna` scrive i dati in `dati/` e l'esito di **ogni** fonte in
`dati/istantanea.json`. Se una fonte fallisce, il file esistente non viene toccato e il
fallimento viene dichiarato a schermo: mai un dato vecchio servito come fresco.

## Pagine

| Percorso | Cosa mostra |
|---|---|
| `/` | Cruscotto: verdetto sulla strategia, titoli monitorati con punteggio, notizie da leggere a mano, stato delle fonti |
| `/mandati` | **Il monitoraggio**: un tratto per ogni amministratore delegato, dall'annuncio della nomina a quella del successore, con rendimento contro l'indice a dividendi reinvestiti, rendimento annuo, volatilità e massimo ribasso |
| `/tim` | Il caso guida: offerta in corso, event study su tutti gli eventi, nove bilanci, indicatori della svolta, trappole contabili |
| `/metodo` | Come è costruito il punteggio, il verdetto del revisore ostile, la condizione che lo cambierebbe, i vincoli di legge |
| `/dati` | Provenienza di ogni numero, fonti in uso e fonti provate e scartate |
| `/api/health` | Stato per la pagina Servizi del Hub: `ok:false` se i dati sono più vecchi di 72 ore o se una fonte è caduta |

## Regole del progetto

Non sono preferenze di stile: ognuna nasce da un errore trovato durante l'analisi.

1. **Un dato mancante vale `null`, mai `0`.** Nel punteggio la variabile viene *esclusa* e i
   pesi si rinormalizzano. Sotto il 50% di copertura non si mostra alcun numero, ma la
   scritta «da valutare».
2. **Nessun numero senza la sua data.** Ogni valore porta con sé quando è stato rilevato.
3. **Se una fonte cade, il valore sparisce**, non diventa neutro. Un verde per assenza di
   dati è il difetto che costa i soldi.
4. **Mai dedurre fatti societari dal testo libero.** Un titolo di giornale con la parola
   «nomina» non è una nomina: le notizie si elencano perché siano lette a mano.
5. **Sui fondamentali comanda il bilancio, non l'API gratuita.** Su TIM il free cash flow di
   Yahoo per il 2025 dà 37 milioni contro i +700 comunicati dalla società, e la leva 2,87x
   contro 1,85x: un errore del 48% che non fa fallire alcun calcolo.
6. **L'universo contiene anche i fallimenti.** Stellantis e Bayer sono lì apposta: un elenco
   di soli casi riusciti insegna la lezione sbagliata.
7. **Nessun linguaggio prescrittivo.** Nessun «comprare», nessun «vendere», nessun prezzo
   obiettivo: solo descrizioni di eventi e misure.
8. **Il confronto è a dividendi reinvestiti.** Le serie dei titoli li includono; misurarle
   contro un indice di prezzo regala loro 3-4 punti l'anno. Su dieci anni il FTSE MIB fa
   +219% di prezzo contro **+348%** a dividendi reinvestiti: la differenza basta a far
   sembrare vincente una gestione che ha perso contro il mercato.
9. **La gestione si misura dal mandato**, cioè dall'annuncio della nomina di chi guida — non
   dall'ultimo evento societario. Un'offerta pubblica o una cessione non sono un cambio di
   management: gli eventi hanno una `categoria` (`management`, `controllo`, `perimetro`) e
   solo la prima conta per valutare una gestione.

## Struttura

```
src/lib/
  tipi.ts         tipi condivisi
  fonti.ts        accesso alle fonti esterne (solo quelle verificate sul campo)
  archivio.ts     lettura e scrittura dei file in dati/
  statistica.ts   event study, regressione, bootstrap, drawdown
  indicatori.ts   KPI di mercato ricalcolati a ogni aggiornamento
  bilanci.ts      bilanci da fonte primaria
  punteggio.ts    punteggio a blocchi con rinormalizzazione
  universo.ts     titoli monitorati ed eventi di management
  vista.ts        assemblaggio dei dati per le pagine
  formato.ts      formattazione italiana
dati/             serie storiche, bilanci, notizie, istantanea delle fonti
docs/analisi/     le cinque analisi, il verdetto ostile, i nove bilanci, i KPI di borsa
scripts/          aggiorna.mjs
```

## Fonti

In uso e verificate: Yahoo chart v8 (prezzi rettificati per dividendi e operazioni sul
capitale), Yahoo fundamentals-timeseries (solo come controllo incrociato), Google News RSS,
comunicati e relazioni del Gruppo TIM, Consob, Borsa Italiana.

Provate e **non utilizzabili**: Stooq (verifica anti-robot), Yahoo quoteSummary (401),
Alpha Vantage / Twelve Data / Financial Modeling Prep / EODHD (chiave a pagamento), RSS di
Borsa Italiana (inesistente), eMarket Storage e Consob (nessun download strutturato), SEC
EDGAR per TIM S.p.A. (deregistrata nel 2019 — attenzione, la brasiliana TIM S.A. continua a
depositare e una ricerca per nome la scambia per la capogruppo).

Il dettaglio completo è in [`docs/analisi/03-fonti-dati.md`](docs/analisi/03-fonti-dati.md)
e sulla pagina `/dati`.
