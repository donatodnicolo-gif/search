/**
 * Deluxy Fondo — KPI da analista e motore di regole operative.
 *
 * ATTENZIONE, è il punto centrale di questo file: qui NON si generano raccomandazioni.
 * Il motore prende le soglie che l'utente ha scritto nei dati (uno stop al −20%, un target
 * al +40%, un tempo massimo di 24 mesi) e calcola **a quale prezzo** ciascuna scatta e
 * quanto si è lontani. È la differenza fra «vendi a 25 €», che sarebbe un consiglio, e «la
 * regola che hai fissato tu tocca i 25 €, e oggi sei a 21,60».
 *
 * Le soglie stanno nei dati proprio perché sono una scelta di chi investe, non del
 * programma. Il programma le sorveglia e non le decide.
 *
 * Sui KPI vale la regola generale del progetto: un rapporto con denominatore negativo o
 * nullo non produce un numero grande, produce `null`. Un P/E calcolato su una perdita è
 * matematicamente valido e economicamente privo di senso.
 */

import type { Barra, SerieStorica } from "./tipi";
import type { Fondamentali } from "./fonti";
import { drawdownMassimo, variazione, volatilitaAnnua } from "./statistica.ts";

// ---------------------------------------------------------------------------
// KPI fondamentali
// ---------------------------------------------------------------------------

export type Kpi = {
  nome: string;
  valore: number | null;
  /** Come si formatta: percentuale, multiplo, valuta, numero puro. */
  tipo: "percentuale" | "multiplo" | "valuta" | "numero";
  /** Cosa misura, in una riga leggibile. */
  significato: string;
  /** Perché non è calcolabile, quando non lo è: mai un numero al posto di una spiegazione. */
  problema: string | null;
  /** Da dove viene il dato. */
  provenienza: string;
};

function ultimo(f: Fondamentali | null, voce: string): { valore: number; esercizio: number } | null {
  const serie = f?.[voce];
  if (!serie?.length) return null;
  const x = serie[serie.length - 1];
  return { valore: x.valore, esercizio: x.esercizio };
}

function precedente(f: Fondamentali | null, voce: string): number | null {
  const serie = f?.[voce];
  if (!serie || serie.length < 2) return null;
  return serie[serie.length - 2].valore;
}

/**
 * KPI di valutazione e qualità da un analista.
 *
 * `azioniInCircolazione` e `dividendoPerAzione` non sono nelle fonti gratuite verificate:
 * quando il chiamante non li fornisce, i KPI che li richiedono restano dichiaratamente
 * non calcolabili invece di essere stimati.
 */
export function kpiFondamentali(
  f: Fondamentali | null,
  opzioni: {
    prezzo: number | null;
    /**
     * Capitalizzazione in **milioni**, come la pubblicano le schede titolo.
     * I fondamentali arrivano invece in unità: la conversione va fatta qui, una volta sola.
     * Senza, il rendimento del free cash flow uscirebbe moltiplicato per un milione.
     */
    capitalizzazioneMln?: number | null;
    dividendoPerAzione?: number | null;
    valutaDividendo?: string | null;
    /**
     * Quanto vale 1 unità della valuta del dividendo nella valuta di quotazione.
     * Serve quando la cedola è dichiarata in una valuta e il titolo quota in un'altra:
     * dividere dollari per euro dà un rendimento più alto del vero.
     */
    cambioDividendo?: number | null;
  }
): Kpi[] {
  const ricavi = ultimo(f, "annualTotalRevenue");
  const ebitda = ultimo(f, "annualEBITDA");
  const utile = ultimo(f, "annualNetIncome");
  const fcf = ultimo(f, "annualFreeCashFlow");
  const debito = ultimo(f, "annualTotalDebt");
  const patrimonio = ultimo(f, "annualStockholdersEquity");
  const ricaviPrima = precedente(f, "annualTotalRevenue");

  const daBilancio = (e: number | undefined) =>
    e ? `Fondamentali di terza parte, esercizio ${e}` : "Fondamentali di terza parte";

  const kpi: Kpi[] = [];

  // --- Qualità operativa --------------------------------------------------
  kpi.push({
    nome: "Margine EBITDA",
    valore: ricavi && ebitda && ricavi.valore > 0 ? ebitda.valore / ricavi.valore : null,
    tipo: "percentuale",
    significato: "Quanto resta di ogni euro di ricavi prima di ammortamenti, interessi e imposte.",
    problema:
      ebitda && ebitda.valore < 0
        ? `EBITDA negativo nell'esercizio ${ebitda.esercizio}: il margine esiste ma è privo di significato come indicatore di qualità. Va guardata la causa, non il rapporto.`
        : !ricavi || !ebitda
          ? "Ricavi o EBITDA non disponibili."
          : null,
    provenienza: daBilancio(ebitda?.esercizio),
  });

  kpi.push({
    nome: "Andamento dei ricavi",
    valore: ricavi && ricaviPrima && ricaviPrima !== 0 ? ricavi.valore / ricaviPrima - 1 : null,
    tipo: "percentuale",
    significato: "Variazione dei ricavi fra gli ultimi due esercizi disponibili.",
    problema: !ricavi || !ricaviPrima ? "Servono almeno due esercizi." : null,
    provenienza: daBilancio(ricavi?.esercizio),
  });

  kpi.push({
    nome: "Utile netto",
    valore: utile?.valore ?? null,
    tipo: "valuta",
    significato: "Risultato dell'ultimo esercizio: dice se l'azienda guadagna, non se genera cassa.",
    problema: !utile ? "Non disponibile." : null,
    provenienza: daBilancio(utile?.esercizio),
  });

  kpi.push({
    nome: "Free cash flow",
    valore: fcf?.valore ?? null,
    tipo: "valuta",
    significato:
      "La cassa che resta dopo gli investimenti: è ciò che paga dividendi e debito. Può divergere molto dall'utile quando ci sono svalutazioni, che non costano cassa.",
    problema: !fcf ? "Non disponibile." : null,
    provenienza: daBilancio(fcf?.esercizio),
  });

  // --- Solidità -----------------------------------------------------------
  kpi.push({
    nome: "Debito lordo / EBITDA",
    valore: debito && ebitda && ebitda.valore > 0 ? debito.valore / ebitda.valore : null,
    tipo: "multiplo",
    significato: "Quanti anni di margine servirebbero per azzerare il debito. Sopra 4x lo spazio di manovra si stringe.",
    problema:
      ebitda && ebitda.valore <= 0
        ? "EBITDA non positivo: il rapporto non è calcolabile. Un numero qui sarebbe inventato."
        : !debito || !ebitda
          ? "Debito o EBITDA non disponibili."
          : "Debito LORDO, non posizione finanziaria netta: sovrastima la leva di tutta la cassa disponibile.",
    provenienza: daBilancio(debito?.esercizio),
  });

  kpi.push({
    nome: "Debito / patrimonio netto",
    valore: debito && patrimonio && patrimonio.valore > 0 ? debito.valore / patrimonio.valore : null,
    tipo: "multiplo",
    significato: "Quanto l'azienda è finanziata da terzi rispetto ai mezzi propri.",
    problema: !debito || !patrimonio ? "Non disponibile." : null,
    provenienza: daBilancio(patrimonio?.esercizio),
  });

  // --- Valutazione --------------------------------------------------------
  // Da milioni a unità: i fondamentali sono in unità e mescolare le due scale produce
  // rapporti sbagliati di sei ordini di grandezza.
  const mcap = opzioni.capitalizzazioneMln != null ? opzioni.capitalizzazioneMln * 1e6 : null;

  kpi.push({
    nome: "Prezzo / utili",
    valore: mcap && utile && utile.valore > 0 ? mcap / utile.valore : null,
    tipo: "multiplo",
    significato: "Quanti anni di utili correnti si stanno pagando.",
    problema:
      utile && utile.valore <= 0
        ? `Perdita nell'esercizio ${utile.esercizio}: il rapporto non si calcola. Un valore negativo sarebbe da leggere come «non applicabile», non come «economico».`
        : !mcap
          ? "Capitalizzazione non disponibile fra i dati raccolti."
          : null,
    provenienza: "Calcolato: capitalizzazione / utile netto",
  });

  kpi.push({
    nome: "Rendimento del free cash flow",
    valore: mcap && fcf && mcap > 0 ? fcf.valore / mcap : null,
    tipo: "percentuale",
    significato:
      "Cassa generata rispetto a quanto costa l'azienda in borsa. Regge anche quando l'utile è negativo, e per questo è più robusto del prezzo/utili.",
    problema: !mcap ? "Capitalizzazione non disponibile." : !fcf ? "Free cash flow non disponibile." : null,
    provenienza: "Calcolato: free cash flow / capitalizzazione",
  });

  if (opzioni.dividendoPerAzione != null && opzioni.prezzo) {
    // La cedola va portata nella valuta di quotazione prima di dividerla per il prezzo.
    const serveCambio = !!opzioni.valutaDividendo && opzioni.valutaDividendo !== "EUR";
    const cambio = serveCambio ? (opzioni.cambioDividendo ?? null) : 1;
    const dividendoConvertito = cambio !== null ? opzioni.dividendoPerAzione * cambio : null;

    kpi.push({
      nome: "Rendimento del dividendo",
      valore: dividendoConvertito !== null ? dividendoConvertito / opzioni.prezzo : null,
      tipo: "percentuale",
      significato:
        "Cedola annua rispetto al prezzo. Un rendimento molto alto è spesso il mercato che dubita che sia sostenibile, non un regalo.",
      problema:
        serveCambio && cambio === null
          ? `Dividendo dichiarato in ${opzioni.valutaDividendo} e prezzo in euro, ma il cambio non è disponibile: senza, il rapporto sarebbe più alto del vero.`
          : serveCambio
            ? `Cedola di ${opzioni.dividendoPerAzione} ${opzioni.valutaDividendo} convertita al cambio ${cambio}: il rendimento effettivo si muoverà col cambio, che non è merito della società.`
            : null,
      provenienza: "Dividendo indicato a mano nei dati della posizione",
    });

    if (fcf && mcap && opzioni.prezzo > 0 && dividendoConvertito !== null) {
      // Azioni stimate dalla capitalizzazione: la cedola totale va confrontata con la cassa.
      const azioni = mcap / opzioni.prezzo;
      const dividendoTotale = azioni * dividendoConvertito;
      kpi.push({
        nome: "Copertura del dividendo",
        valore: dividendoTotale > 0 ? fcf.valore / dividendoTotale : null,
        tipo: "multiplo",
        significato:
          "Quante volte il free cash flow copre la cedola. Sotto 1 l'azienda distribuisce più di quanto genera: è la condizione che precede un taglio.",
        problema:
          "Il numero di azioni è stimato da capitalizzazione e prezzo, non letto dal bilancio: è un ordine di grandezza, non un dato preciso.",
        provenienza: "Calcolato: free cash flow / (cedola convertita × azioni stimate)",
      });
    }
  }

  return kpi;
}

// ---------------------------------------------------------------------------
// Regole operative
// ---------------------------------------------------------------------------

export type Regole = {
  /** Uscita se il prezzo scende di questa frazione sotto il carico. Es. 0.20 = −20%. */
  stopAssoluto: number | null;
  /** Uscita se si resta sotto l'indice di questa frazione dall'acquisto. Es. 0.12 = 12 punti. */
  stopRelativo: number | null;
  /** Attivo dopo un guadagno di `trailingAttivazione`: esce se si perde questa frazione dal massimo. */
  trailingAttivazione: number | null;
  trailingRitracciamento: number | null;
  /** Riduzione o uscita a questo guadagno. */
  target: number | null;
  /** Mesi oltre i quali la posizione va rivista comunque. */
  mesiMassimi: number | null;
  /** Fatti che, se accadono, invalidano la tesi: si controllano a mano, non si deducono. */
  tesiInvalidataSe: string[];
  /** Perche le soglie sono state scelte cosi: va scritto, o fra un anno non si ricorda. */
  notaRegole?: string;
};

export type Livello = {
  nome: string;
  /** Prezzo a cui la regola scatta, nella valuta del titolo. */
  prezzo: number | null;
  /** Distanza dal prezzo attuale, in frazione. Negativa = il livello è sotto. */
  distanza: number | null;
  stato: "lontano" | "vicino" | "scattata" | "non-calcolabile";
  /** Cosa succede secondo la regola scelta. Descrittivo, non prescrittivo. */
  descrizione: string;
  problema: string | null;
};

/** Sotto questa distanza il livello si considera «vicino» e va guardato. */
const SOGLIA_VICINO = 0.07;

function stato(distanza: number | null, verso: "sotto" | "sopra"): Livello["stato"] {
  if (distanza === null) return "non-calcolabile";
  // Per un livello sotto il prezzo: scattato se il prezzo lo ha raggiunto o superato al ribasso.
  if (verso === "sotto") {
    if (distanza >= 0) return "scattata";
    return Math.abs(distanza) <= SOGLIA_VICINO ? "vicino" : "lontano";
  }
  if (distanza <= 0) return "scattata";
  return distanza <= SOGLIA_VICINO ? "vicino" : "lontano";
}

/**
 * Calcola i livelli di prezzo a cui scattano le regole fissate dall'utente.
 *
 * Nessuna regola è imposta dal programma: quelle che valgono `null` non producono livelli.
 * Il rendimento della posizione usato qui è quello **sul prezzo pagato**, perché è quello
 * che conta per chi ha messo i soldi.
 */
export function livelliOperativi(opzioni: {
  prezzoCarico: number | null;
  prezzoAttuale: number | null;
  /** Massima chiusura raggiunta dall'acquisto: serve al trailing. */
  massimoDaAcquisto: number | null;
  /** Rendimento della posizione meno quello dell'indice, in frazione. */
  eccessoSuIndice: number | null;
  mesiTrascorsi: number | null;
  regole: Regole;
}): Livello[] {
  const { prezzoCarico: carico, prezzoAttuale: p, massimoDaAcquisto, eccessoSuIndice, mesiTrascorsi, regole } = opzioni;
  const out: Livello[] = [];

  const distanzaVerso = (livello: number | null) =>
    livello !== null && p !== null && p > 0 ? livello / p - 1 : null;

  // --- Stop assoluto ------------------------------------------------------
  if (regole.stopAssoluto !== null) {
    const livello = carico !== null ? carico * (1 - regole.stopAssoluto) : null;
    const d = distanzaVerso(livello);
    out.push({
      nome: "Stop sul prezzo pagato",
      prezzo: livello,
      distanza: d,
      stato: stato(d, "sotto"),
      descrizione: `La regola scelta esce se il prezzo scende del ${Math.round(regole.stopAssoluto * 100)}% sotto il carico.`,
      problema: carico === null ? "Serve il prezzo di carico." : null,
    });
  }

  // --- Stop relativo ------------------------------------------------------
  if (regole.stopRelativo !== null) {
    const scattata = eccessoSuIndice !== null && eccessoSuIndice <= -regole.stopRelativo;
    out.push({
      nome: "Stop sulla sottoperformance",
      prezzo: null,
      distanza: eccessoSuIndice !== null ? eccessoSuIndice + regole.stopRelativo : null,
      stato:
        eccessoSuIndice === null
          ? "non-calcolabile"
          : scattata
            ? "scattata"
            : eccessoSuIndice + regole.stopRelativo <= SOGLIA_VICINO
              ? "vicino"
              : "lontano",
      descrizione: `La regola scelta esce se la posizione resta ${Math.round(regole.stopRelativo * 100)} punti sotto l'indice. Non è un livello di prezzo: dipende anche da come va il mercato.`,
      problema:
        eccessoSuIndice === null
          ? "Serve la data di acquisto per confrontare i due rendimenti sullo stesso periodo."
          : null,
    });
  }

  // --- Trailing -----------------------------------------------------------
  if (regole.trailingAttivazione !== null && regole.trailingRitracciamento !== null) {
    const guadagnoMassimo =
      carico !== null && massimoDaAcquisto !== null ? massimoDaAcquisto / carico - 1 : null;
    const attivo = guadagnoMassimo !== null && guadagnoMassimo >= regole.trailingAttivazione;
    const livello = attivo && massimoDaAcquisto !== null ? massimoDaAcquisto * (1 - regole.trailingRitracciamento) : null;
    const d = distanzaVerso(livello);
    out.push({
      nome: "Trailing dal massimo",
      prezzo: livello,
      distanza: d,
      stato: attivo ? stato(d, "sotto") : "non-calcolabile",
      descrizione: attivo
        ? `Attivo: dal massimo di ${massimoDaAcquisto?.toFixed(3)} la regola esce con un ritracciamento del ${Math.round(regole.trailingRitracciamento * 100)}%.`
        : `Si attiva solo dopo un guadagno del ${Math.round(regole.trailingAttivazione * 100)}% dal carico: serve a proteggere un profitto già maturato, non a limitare una perdita.`,
      problema: attivo
        ? null
        : guadagnoMassimo === null
          ? "Servono prezzo di carico e data di acquisto."
          : `Guadagno massimo finora ${(guadagnoMassimo * 100).toFixed(1)}%, sotto la soglia di attivazione.`,
    });
  }

  // --- Target -------------------------------------------------------------
  if (regole.target !== null) {
    const livello = carico !== null ? carico * (1 + regole.target) : null;
    const d = distanzaVerso(livello);
    out.push({
      nome: "Target di guadagno",
      prezzo: livello,
      distanza: d,
      stato: stato(d, "sopra"),
      descrizione: `La regola scelta prevede di ridurre o chiudere a un guadagno del ${Math.round(regole.target * 100)}% sul carico.`,
      problema: carico === null ? "Serve il prezzo di carico." : null,
    });
  }

  // --- Tempo --------------------------------------------------------------
  if (regole.mesiMassimi !== null) {
    const restano = mesiTrascorsi !== null ? regole.mesiMassimi - mesiTrascorsi : null;
    out.push({
      nome: "Revisione per tempo",
      prezzo: null,
      distanza: null,
      stato:
        restano === null ? "non-calcolabile" : restano <= 0 ? "scattata" : restano <= 3 ? "vicino" : "lontano",
      descrizione:
        restano === null
          ? `Revisione obbligatoria dopo ${regole.mesiMassimi} mesi dall'acquisto.`
          : restano <= 0
            ? `Superati i ${regole.mesiMassimi} mesi previsti: la regola chiede di rivedere la tesi da zero.`
            : `Mancano ${Math.round(restano)} mesi ai ${regole.mesiMassimi} previsti per la revisione.`,
      problema: mesiTrascorsi === null ? "Serve la data di acquisto." : null,
    });
  }

  return out;
}

// ---------------------------------------------------------------------------
// Orizzonte lungo: 3, 5, 7 anni
// ---------------------------------------------------------------------------

export type FinestraStorica = {
  anni: number;
  /** Rendimento del solo prezzo nel periodo. */
  prezzo: number | null;
  /** Rendimento annuo composto del prezzo. */
  annuo: number | null;
  /** Con i dividendi reinvestiti a rendimento costante: stima, non dato storico. */
  annuoConDividendi: number | null;
  daData: string | null;
};

export type Tolleranza = {
  /** Su quante finestre mobili di 12 mesi è calcolata. */
  finestre: number;
  ribassoPeggiore: number | null;
  ribassoMediano: number | null;
  /** Quota di finestre annuali con un ribasso oltre la soglia dello stop. */
  quotaOltreSoglia: number | null;
  /** Quante volte, su orizzonte pari a quello dichiarato, il titolo è scivolato sotto lo stop. */
  probabilitaStop: number | null;
  sogliaUsata: number | null;
};

export type AnalisiOrizzonte = {
  /** Gli orizzonti dichiarati, in anni. */
  orizzonti: number[];
  /** Come è andato il titolo su finestre pari a quegli orizzonti, guardando indietro. */
  storico: FinestraStorica[];
  /** Quanto ribasso bisogna essere disposti a sopportare, misurato sul titolo. */
  tolleranza: Tolleranza;
  /** Quanto renderebbe la posizione ai vari orizzonti, se il solo dividendo restasse costante. */
  soloDividendo: { anni: number; totale: number | null }[];
};

/**
 * Analisi per chi vuole tenere il titolo anni, non mesi.
 *
 * Il punto non è prevedere: è misurare **cosa è già accaduto** su finestre della stessa
 * lunghezza dell'orizzonte dichiarato, e quanta oscillazione bisogna essere disposti a
 * sopportare per restare dentro. È l'informazione che manca quando si fissa uno stop tecnico
 * su un investimento pluriennale: se il titolo scende regolarmente del 20% e il piano è
 * tenerlo sette anni, lo stop non protegge, interrompe il piano.
 */
export function analisiOrizzonte(
  serie: SerieStorica | null,
  opzioni: {
    orizzonti?: number[];
    /** Rendimento da dividendo annuo, per stimare il rendimento totale. */
    rendimentoDividendo?: number | null;
    /** Soglia di stop da testare, per dire quanto spesso sarebbe scattata. */
    sogliaStop?: number | null;
  } = {}
): AnalisiOrizzonte {
  const orizzonti = opzioni.orizzonti ?? [3, 5, 7];
  const soglia = opzioni.sogliaStop ?? null;
  const div = opzioni.rendimentoDividendo ?? null;

  const vuoto: AnalisiOrizzonte = {
    orizzonti,
    storico: orizzonti.map((a) => ({ anni: a, prezzo: null, annuo: null, annuoConDividendi: null, daData: null })),
    tolleranza: {
      finestre: 0,
      ribassoPeggiore: null,
      ribassoMediano: null,
      quotaOltreSoglia: null,
      probabilitaStop: null,
      sogliaUsata: soglia,
    },
    soloDividendo: orizzonti.map((a) => ({ anni: a, totale: div !== null ? Math.pow(1 + div, a) - 1 : null })),
  };
  if (!serie || serie.barre.length < 60) return vuoto;

  const b = serie.barre;
  const ultimo = b[b.length - 1];

  // --- Come è andato, guardando indietro ---------------------------------
  const storico: FinestraStorica[] = orizzonti.map((anni) => {
    const sedute = Math.round(anni * 252);
    if (b.length <= sedute) return { anni, prezzo: null, annuo: null, annuoConDividendi: null, daData: null };
    const inizio = b[b.length - 1 - sedute];
    const r = variazione(inizio.chiusura, ultimo.chiusura);
    const annuo = r !== null ? Math.pow(1 + r, 1 / anni) - 1 : null;
    return {
      anni,
      prezzo: r,
      annuo,
      // Somma approssimata: il dividendo di oggi applicato a tutto il periodo. È una stima
      // grossolana, perché la cedola storica era diversa — va letta come ordine di grandezza.
      annuoConDividendi: annuo !== null && div !== null ? annuo + div : null,
      daData: inizio.data,
    };
  });

  // --- Quanta oscillazione bisogna sopportare ----------------------------
  const ribassi: number[] = [];
  for (let i = 0; i + 252 < b.length; i += 21) {
    const f = b.slice(i, i + 252);
    let picco = f[0].chiusura;
    let peggio = 0;
    for (const x of f) {
      if (x.chiusura > picco) picco = x.chiusura;
      const d = x.chiusura / picco - 1;
      if (d < peggio) peggio = d;
    }
    ribassi.push(peggio);
  }
  ribassi.sort((a, b) => a - b);

  // Quante volte, su un orizzonte pari al più corto dichiarato, il prezzo è scivolato sotto
  // la soglia di stop rispetto al punto di partenza.
  let probabilitaStop: number | null = null;
  if (soglia !== null && orizzonti.length) {
    const sedute = Math.round(Math.min(...orizzonti) * 252);
    let tocchi = 0;
    let prove = 0;
    for (let i = 0; i + sedute < b.length; i += 21) {
      prove++;
      const p0 = b[i].chiusura;
      if (b.slice(i, i + sedute).some((x) => x.chiusura <= p0 * (1 - soglia))) tocchi++;
    }
    probabilitaStop = prove > 0 ? tocchi / prove : null;
  }

  return {
    orizzonti,
    storico,
    tolleranza: {
      finestre: ribassi.length,
      ribassoPeggiore: ribassi.length ? ribassi[0] : null,
      ribassoMediano: ribassi.length ? ribassi[Math.floor(ribassi.length / 2)] : null,
      quotaOltreSoglia:
        soglia !== null && ribassi.length ? ribassi.filter((x) => x <= -soglia).length / ribassi.length : null,
      probabilitaStop,
      sogliaUsata: soglia,
    },
    soloDividendo: orizzonti.map((a) => ({ anni: a, totale: div !== null ? Math.pow(1 + div, a) - 1 : null })),
  };
}

// ---------------------------------------------------------------------------
// Contesto tecnico: dove sta il prezzo, senza giudizio
// ---------------------------------------------------------------------------

export type ContestoTecnico = {
  prezzo: number | null;
  massimo52: number | null;
  minimo52: number | null;
  /** Posizione nel range a 52 settimane, 0 = sul minimo, 1 = sul massimo. */
  posizioneRange: number | null;
  ma50: number | null;
  ma200: number | null;
  distanzaMa200: number | null;
  volatilita: number | null;
  drawdown: number | null;
  /** Supporti e resistenze come minimi e massimi recenti: livelli osservati, non previsioni. */
  minimoRecente: number | null;
  massimoRecente: number | null;
};

function mediaSemplice(barre: Barra[], n: number): number | null {
  if (barre.length < n) return null;
  const ultime = barre.slice(-n);
  return ultime.reduce((s, b) => s + b.chiusura, 0) / n;
}

export function contestoTecnico(serie: SerieStorica | null): ContestoTecnico {
  const vuoto: ContestoTecnico = {
    prezzo: null,
    massimo52: null,
    minimo52: null,
    posizioneRange: null,
    ma50: null,
    ma200: null,
    distanzaMa200: null,
    volatilita: null,
    drawdown: null,
    minimoRecente: null,
    massimoRecente: null,
  };
  if (!serie || serie.barre.length < 2) return vuoto;

  const barre = serie.barre;
  const p = barre[barre.length - 1].chiusura;
  const anno = barre.slice(-252).map((b) => b.chiusura);
  const trimestre = barre.slice(-63).map((b) => b.chiusura);
  const max52 = anno.length ? Math.max(...anno) : null;
  const min52 = anno.length ? Math.min(...anno) : null;
  const ma200 = mediaSemplice(barre, 200);

  return {
    prezzo: p,
    massimo52: max52,
    minimo52: min52,
    posizioneRange: max52 !== null && min52 !== null && max52 > min52 ? (p - min52) / (max52 - min52) : null,
    ma50: mediaSemplice(barre, 50),
    ma200,
    distanzaMa200: ma200 !== null ? variazione(ma200, p) : null,
    volatilita: volatilitaAnnua(barre.slice(-250)),
    drawdown: drawdownMassimo(barre.slice(-252))?.valore ?? null,
    minimoRecente: trimestre.length ? Math.min(...trimestre) : null,
    massimoRecente: trimestre.length ? Math.max(...trimestre) : null,
  };
}
