# Deluxy Fondo — handoff

Aggiornato il **18 agosto 2026**. Una sessione nuova deve poter riprendere da qui senza
altro contesto.

## Cos'è

App di ricerca (porta **3180**, cartella `C:\Users\nicol\app\deluxy-fondo`) per una
strategia di investimento basata sul cambio di management. Aggiorna i dati ogni giorno e
misura se gli eventi di management hanno davvero spostato il prezzo.

Nasce da un'analisi con cinque agenti indipendenti + un revisore ostile + un team che ha
letto nove bilanci di TIM. Tutto il materiale è in `docs/analisi/`.

## FATTO

- **Analisi completa** (`docs/analisi/`): 5 analisi indipendenti, verdetto del revisore
  ostile, bilanci TIM 2017-2019 / 2020-2022 / 2023-2025, KPI di borsa a 5 anni.
- **Motore dati**: download da Yahoo chart v8 (prezzi rettificati), fundamentals-timeseries,
  Google News RSS. `npm run aggiorna` funziona: 13 fonti su 13, 2.539 sedute su 10 anni per
  6 titoli.
- **Motore di calcolo**: event study con modello di mercato, indicatori (rendimenti
  multi-orizzonte, volatilità, beta, drawdown, medie mobili, RSI, momentum, volumi
  anomali), punteggio a blocchi con rinormalizzazione e soglia di copertura.
- **Bilanci da fonte primaria** in `dati/bilanci-tim.json`: nove esercizi con la data di
  pubblicazione, il perimetro, gli indicatori della svolta e dodici trappole contabili.
- **Quattro pagine** (`/`, `/tim`, `/metodo`, `/dati`) + `/api/health`.
- **Verificato sul campo**: build pulita, typecheck pulito, server avviato, pagine lette,
  zero errori in console. `/api/health` risponde `ok:true` con 2.539 sedute in archivio.
- **Controllo incrociato riuscito**: l'event study calcolato dall'app riproduce in autonomia
  i numeri del revisore ostile (piano 7/03/2024: app −20,9% contro −20,0%; Labriola: +3,7%
  contro +3,5%; Gubitosi 2018: +6,2% contro +6,1%).

## Il verdetto — da leggere prima di riprendere

La tesi di partenza **non regge sui dati**, e l'app lo dice in prima pagina:

- La strategia «compra a ogni cambio di amministratore delegato» su TIM ha reso **+60,3%**
  in 4,7 anni contro **+100%** del comprare e tenere e **+106%** dell'indice.
- TIM su dieci anni ha reso **circa zero** contro **+350%** del FTSE MIB a dividendi
  reinvestiti (l'indice di prezzo, che l'app mostra, favorisce il titolo di 3-4 punti l'anno).
- L'unico evento di management statisticamente significativo in dieci anni è **negativo**:
  −20% (t = −5,97) al piano del 7 marzo 2024.
- Il rialzo viene da cessione della rete, cambio dell'azionista e offerta pubblica.

**Oggi TIM è di fatto un derivato di Poste**: correlazione 0,82 e beta 0,74 con Poste dal
20/07/2026, contro 0,14 con l'indice. L'offerta chiude l'**11 settembre 2026** (pagamento il
18/09) con adesioni all'1,97% contro una soglia del 66,67% rinunciabile.

## Il «mandato in corso» — correzione del 18/08

Gli eventi hanno una `categoria`: **management** (chi guida), **controllo** (chi possiede:
attivisti, offerte pubbliche), **perimetro** (cessioni, scorpori). Il punteggio e le misure
di gestione usano solo il primo tipo.

Serve perché all'inizio l'app prendeva come «ultimo evento di management» di TIM l'**OPAS di
Poste** (marzo 2026), che è un'operazione societaria, non un cambio di vertice. Il mandato
in corso è **Pietro Labriola dal 21/01/2022**. Correggendolo, il punteggio di TIM è sceso da
**81 a 59** (e la copertura è salita dal 61% al 74%): era gonfiato da un evento di tier
massimo che non c'entrava con la gestione.

La pagina `/tim` mostra ora il mandato spezzato nelle sue fasi, ed è il numero più
istruttivo dell'app:

| Fase | Periodo | TIM | Indice | Differenza |
|---|---|---|---|---|
| **Intero mandato Labriola** | 21/01/2022 → oggi | +83,6% | +96,8% | **−13,2 pp** |
| Prima della cessione di NetCo | 21/01/2022 → 01/07/2024 | −46,1% | +24,6% | **−70,7 pp** |
| Dalla cessione a oggi | 01/07/2024 → oggi | +240,6% | +57,9% | **+182,7 pp** |

Su tutto il mandato il titolo **resta sotto l'indice**, e lo spartiacque fra le due fasi non
è una decisione di gestione: è la cessione della rete.

## Pagina `/mandati` — il monitoraggio

Un tratto per ogni amministratore delegato, dall'annuncio della nomina a quella del
successore, con rendimento, differenza rispetto all'indice, rendimento annuo composto,
volatilità e massimo ribasso. È la vista da guardare per prima.

**Il confronto usa `XMIB.MI`** (Xtrackers FTSE MIB ad accumulazione), cioè l'indice **a
dividendi reinvestiti**, non il FTSE MIB puro. Motivo: le serie dei titoli sono rettificate
e includono i dividendi; misurarle contro un indice di prezzo regala loro 3-4 punti l'anno.
Il difetto è emerso su UniCredit, che con l'indice sbagliato risultava avanti di oltre mille
punti percentuali. Verificato: 2.533 sedute dal 2016, +348,4% su dieci anni contro il +219%
dell'indice di prezzo.

Effetto della correzione: il mandato di Labriola passa da **−13,2 a −59,2 punti** sotto
l'indice, e la differenza mediana dei mandati da −27,2 a **−50,0 punti**.

## MANCA / prossimi passi

1. **La scadenza del 11/09/2026 va sorvegliata**: dopo quella data il regime di prezzo di
   TIM cambia comunque (offerta riuscita → delisting; fallita → sgonfiamento del premio).
   L'app non ha ancora un banner che conti i giorni: va aggiunto in `/tim`.
2. **Backtest vero** (`npm run backtest` è dichiarato in package.json ma lo script non
   esiste ancora). La condizione posta dal revisore: ≥150 cambi di CEO in Europa 2005-2020,
   universo point-in-time con delistati e scalate, ingresso il giorno *dopo* l'annuncio,
   alpha a quattro fattori, e **verifica che l'alpha sopravviva escludendo i casi con OPA,
   cambio di controllo o cessione > 20% dell'EV entro 24 mesi**. Senza questo, la strategia
   resta un aneddoto.
3. **Universo troppo piccolo**: 5 titoli. Per dire qualcosa di statistico servono decine di
   eventi, e l'infrastruttura attuale non li produce.
4. **Blocco «valutazione» dichiaratamente scoperto**: servono capitalizzazione e posizione
   finanziaria netta a data certa, che le fonti gratuite non danno in modo affidabile. È il
   motivo per cui la copertura del punteggio si ferma attorno al 60%.
5. **Bilanci solo per TIM.** Per gli altri titoli il punteggio usa i fondamentali gratuiti,
   che sono meno affidabili (vedi trappola sotto).
6. **Registro storico dei segnali**: oggi l'app ricalcola tutto sul presente. Per avere un
   track record verificabile serve salvare uno snapshot datato a ogni giro.
7. **Cron giornaliero**: l'aggiornamento va lanciato a mano. Su Vercel servirebbe una route
   `/api/cron/aggiorna` (il filesystem lì è in sola lettura: andrebbe ripensato con un DB).
8. **Aggiungere l'app al catalogo del Hub** (`deluxy-hub/src/lib/apps.ts`) se deve essere
   raggiungibile dal portale.

## Trappole trovate — non ripeterle

- **Yahoo mente sui fondamentali di TIM.** `freeCashFlow` 2025 = 37 mln contro i **+700**
  comunicati dalla società: un modello alimentato da lì legge il 2025 come l'anno peggiore
  quando è il migliore. La leva da debito lordo Yahoo dà 2,87x contro **1,85x** reale after
  lease: 48% di errore senza che nulla fallisca. Per questo esiste `dati/bilanci-tim.json`.
- **Il raggruppamento 1:10 del 15/06/2026 è già dentro `adjclose`.** Verificato due volte:
  nessun salto (7,886 → 7,867) e `adjclose/close` = 1,000000 su tutta la serie. Il rischio
  reale non è la discontinuità, è **applicare un secondo ×10 "per correggere"**.
- **SEC EDGAR non serve per TIM dal 2019**: deregistrata con Form 15F-12B, ultimo 20-F
  sull'esercizio 2018. E il CIK 1826168 è **TIM S.A. brasiliana**, società diversa.
- **La svalutazione 2018 era pubblica dall'8/11/2018** (2.000 dei 2.590 mln), non dal
  bilancio di febbraio 2019: usare la data sbagliata introduce 3,5 mesi di look-ahead.
- **Il fondo per contratti onerosi da 548 mln stanziato nel 2021 viene utilizzato per 346
  nel 2022 e gonfia l'EBITDA "organico"** del primo anno del nuovo amministratore delegato.
  La parola «organico» suggerisce «pulito» e non lo è.
- **Stooq non è utilizzabile** (verifica JavaScript anti-robot), e non esistono RSS di Borsa
  Italiana né download strutturati da Consob. Non riprovarli.
- **Il FTSE MIB è un indice di prezzo**: ogni confronto mostrato favorisce il titolo di 3-4
  punti l'anno. È dichiarato in `/dati`, ma va ricordato leggendo le tabelle.
- **Mai lanciare `next build` mentre `next dev` è in esecuzione.** La build di produzione
  sovrascrive `.next` sotto il processo di sviluppo, che da quel momento serve HTTP 500 con
  `Cannot find module './873.js'`. Il codice non c'entra nulla: si ferma il server, si
  cancella `.next`, si riavvia. Per verificare la build, fermare prima il server.
- **La console del browser conserva i messaggi delle sessioni precedenti.** Dopo un riavvio,
  per sapere se un errore è ancora vivo si guardano i log del server, non la console: lì
  restano visibili errori già risolti.

## Vincolo di legge

Gestione di portafogli e consulenza in materia di investimenti sono attività riservate
(Testo unico della finanza); l'esercizio abusivo è reato. Le raccomandazioni diffuse al
pubblico ricadono nel regolamento europeo sugli abusi di mercato. **L'app resta uno
strumento di ricerca a uso interno**: nessun linguaggio prescrittivo, nessun collegamento a
intermediari, nessuna gestione di denaro di terzi senza parere legale e autorizzazione.

## Come riprendere

```bash
cd C:\Users\nicol\app\deluxy-fondo
npm install
npm run aggiorna -- --breve
npm run dev
```

Poi <http://localhost:3180>. Se la pagina dice che mancano i dati, il giro di aggiornamento
non è mai stato eseguito in quella copia.
