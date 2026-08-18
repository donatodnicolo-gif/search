/**
 * Deluxy Fondo — statistica di base ed event study.
 *
 * Tutto qui dentro è puro: nessuna rete, nessun file. Riceve serie e restituisce numeri,
 * così è testabile e riproducibile.
 *
 * Convenzione: un valore mancante è `null` e viene ESCLUSO dal calcolo (non vale 0).
 */

import type { Barra, EventStudy, Finestra, SerieStorica } from "./tipi";

/** Rendimenti logaritmici giorno su giorno. `null` dove non calcolabile. */
export function rendimenti(barre: Barra[]): (number | null)[] {
  return barre.map((b, i) => {
    if (i === 0) return null;
    const prima = barre[i - 1].chiusura;
    if (!prima || !b.chiusura || prima <= 0 || b.chiusura <= 0) return null;
    return Math.log(b.chiusura / prima);
  });
}

/** Rendimento semplice fra due prezzi. */
export function variazione(da: number | null, a: number | null): number | null {
  if (da === null || a === null || da <= 0) return null;
  return a / da - 1;
}

export function media(valori: number[]): number | null {
  const v = valori.filter((x) => Number.isFinite(x));
  if (v.length === 0) return null;
  return v.reduce((s, x) => s + x, 0) / v.length;
}

export function deviazioneStandard(valori: number[]): number | null {
  const v = valori.filter((x) => Number.isFinite(x));
  if (v.length < 2) return null;
  const m = media(v)!;
  const varianza = v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1);
  return Math.sqrt(varianza);
}

export function mediana(valori: number[]): number | null {
  const v = valori.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const meta = Math.floor(v.length / 2);
  return v.length % 2 ? v[meta] : (v[meta - 1] + v[meta]) / 2;
}

/** Percentile (0..1) con interpolazione lineare. */
export function percentile(valori: number[], p: number): number | null {
  const v = valori.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const pos = (v.length - 1) * Math.min(Math.max(p, 0), 1);
  const basso = Math.floor(pos);
  const alto = Math.ceil(pos);
  if (basso === alto) return v[basso];
  return v[basso] + (v[alto] - v[basso]) * (pos - basso);
}

/**
 * Posizione di `x` nella distribuzione `campione`, in 0..1.
 * Serve a rendere confrontabili variabili di scala diversa (analisi 4).
 */
export function rangoPercentuale(x: number | null, campione: number[]): number | null {
  if (x === null || !Number.isFinite(x)) return null;
  const v = campione.filter((y) => Number.isFinite(y));
  if (v.length === 0) return null;
  const sotto = v.filter((y) => y < x).length;
  const uguali = v.filter((y) => y === x).length;
  return (sotto + uguali / 2) / v.length;
}

/** Taglia i valori estremi ai percentili indicati (default 5/95). */
export function winsorizza(valori: number[], basso = 0.05, alto = 0.95): number[] {
  const min = percentile(valori, basso);
  const max = percentile(valori, alto);
  if (min === null || max === null) return valori;
  return valori.map((x) => Math.min(Math.max(x, min), max));
}

/**
 * Normalizzazione min-max su un intervallo dichiarato, con direzione.
 * `verso: "alto"` = valori alti sono buoni; `"basso"` = valori bassi sono buoni.
 * Fuori intervallo satura a 0/1 invece di esplodere.
 */
export function normalizza(
  x: number | null,
  min: number,
  max: number,
  verso: "alto" | "basso" = "alto"
): number | null {
  if (x === null || !Number.isFinite(x) || max === min) return null;
  const q = Math.min(Math.max((x - min) / (max - min), 0), 1);
  return verso === "alto" ? q : 1 - q;
}

/** Regressione lineare semplice y = alpha + beta·x sulle coppie complete. */
export function regressione(
  x: (number | null)[],
  y: (number | null)[]
): { alpha: number; beta: number; n: number } | null {
  const coppie: [number, number][] = [];
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const a = x[i];
    const b = y[i];
    if (a === null || b === null || !Number.isFinite(a) || !Number.isFinite(b)) continue;
    coppie.push([a, b]);
  }
  if (coppie.length < 2) return null;
  const mx = media(coppie.map((c) => c[0]))!;
  const my = media(coppie.map((c) => c[1]))!;
  let num = 0;
  let den = 0;
  for (const [a, b] of coppie) {
    num += (a - mx) * (b - my);
    den += (a - mx) ** 2;
  }
  if (den === 0) return null;
  const beta = num / den;
  return { alpha: my - beta * mx, beta, n: coppie.length };
}

/** Massimo ribasso dal picco precedente, su una serie di chiusure. */
export function drawdownMassimo(barre: Barra[]): { valore: number; da: string; a: string } | null {
  if (barre.length === 0) return null;
  let picco = barre[0].chiusura;
  let piccoData = barre[0].data;
  let peggiore = 0;
  let da = barre[0].data;
  let a = barre[0].data;
  for (const b of barre) {
    if (b.chiusura > picco) {
      picco = b.chiusura;
      piccoData = b.data;
    }
    const dd = b.chiusura / picco - 1;
    if (dd < peggiore) {
      peggiore = dd;
      da = piccoData;
      a = b.data;
    }
  }
  if (peggiore === 0) return null;
  return { valore: peggiore, da, a };
}

/** Volatilità annualizzata (252 sedute) dei rendimenti log. */
export function volatilitaAnnua(barre: Barra[]): number | null {
  const r = rendimenti(barre).filter((x): x is number => x !== null);
  const sd = deviazioneStandard(r);
  return sd === null ? null : sd * Math.sqrt(252);
}

/** Indice della prima barra con data >= `data`. -1 se non esiste. */
export function indiceDa(barre: Barra[], data: string): number {
  return barre.findIndex((b) => b.data >= data);
}

/** Media mobile semplice sulle chiusure; `null` finché non ci sono abbastanza dati. */
export function mediaMobile(barre: Barra[], periodi: number): (number | null)[] {
  const out: (number | null)[] = [];
  let somma = 0;
  for (let i = 0; i < barre.length; i++) {
    somma += barre[i].chiusura;
    if (i >= periodi) somma -= barre[i - periodi].chiusura;
    out.push(i >= periodi - 1 ? somma / periodi : null);
  }
  return out;
}

const FINESTRE_STANDARD: { etichetta: string; da: number; a: number }[] = [
  { etichetta: "[-1,+1]", da: -1, a: 1 },
  { etichetta: "[0,+5]", da: 0, a: 5 },
  { etichetta: "[0,+20]", da: 0, a: 20 },
  { etichetta: "[0,+120]", da: 0, a: 120 },
  { etichetta: "[0,+250]", da: 0, a: 250 },
];

/**
 * Event study con market model a un fattore.
 *
 * Stima alpha/beta su [-250,-30] rispetto al giorno dell'evento e misura il rendimento
 * anomalo cumulato (CAR) sulle finestre. Se le osservazioni di stima sono meno di
 * `minimoStima`, non stima nulla e lo dichiara in `problema`: meglio nessun numero che
 * un numero costruito su 12 giorni.
 */
export function eventStudy(
  eventoId: string,
  titolo: SerieStorica,
  benchmark: SerieStorica,
  dataEvento: string,
  opzioni: { minimoStima?: number; finestre?: typeof FINESTRE_STANDARD } = {}
): EventStudy {
  const minimoStima = opzioni.minimoStima ?? 120;
  const finestre = opzioni.finestre ?? FINESTRE_STANDARD;
  const vuoto: EventStudy = {
    eventoId,
    benchmark: benchmark.simbolo,
    alpha: null,
    beta: null,
    osservazioniStima: 0,
    finestre: [],
    problema: null,
  };

  // Allinea le due serie sulle date comuni: senza allineamento i rendimenti sono sfasati.
  const mappaBench = new Map(benchmark.barre.map((b) => [b.data, b.chiusura]));
  const comuni = titolo.barre.filter((b) => mappaBench.has(b.data));
  if (comuni.length < 30) {
    return { ...vuoto, problema: "Meno di 30 sedute in comune fra titolo e benchmark." };
  }

  const t0 = indiceDa(comuni, dataEvento);
  if (t0 < 0) {
    return { ...vuoto, problema: `Nessuna seduta a partire dal ${dataEvento}.` };
  }

  const rTitolo = rendimenti(comuni);
  const rBench = rendimenti(
    comuni.map((b) => ({ ...b, chiusura: mappaBench.get(b.data)! }))
  );

  const inizioStima = Math.max(1, t0 - 250);
  const fineStima = Math.max(1, t0 - 30);
  const stima = regressione(
    rBench.slice(inizioStima, fineStima),
    rTitolo.slice(inizioStima, fineStima)
  );

  if (!stima || stima.n < minimoStima) {
    return {
      ...vuoto,
      osservazioniStima: stima?.n ?? 0,
      problema: `Storico insufficiente prima dell'evento: ${stima?.n ?? 0} osservazioni, ne servono ${minimoStima}. Nessun CAR calcolato.`,
    };
  }

  const risultati: Finestra[] = finestre.map((f) => {
    const da = t0 + f.da;
    const a = t0 + f.a;
    if (da < 1 || a >= comuni.length) {
      return { etichetta: f.etichetta, da: f.da, a: f.a, car: null, grezzo: null, benchmark: null, giorniUsati: 0 };
    }
    let car = 0;
    let grezzo = 0;
    let bench = 0;
    let usati = 0;
    for (let i = da; i <= a; i++) {
      const rt = rTitolo[i];
      const rb = rBench[i];
      if (rt === null || rb === null) continue;
      car += rt - (stima.alpha + stima.beta * rb);
      grezzo += rt;
      bench += rb;
      usati++;
    }
    if (usati === 0) {
      return { etichetta: f.etichetta, da: f.da, a: f.a, car: null, grezzo: null, benchmark: null, giorniUsati: 0 };
    }
    // Da log-rendimenti cumulati a rendimento semplice, più leggibile a schermo.
    return {
      etichetta: f.etichetta,
      da: f.da,
      a: f.a,
      car: Math.expm1(car),
      grezzo: Math.expm1(grezzo),
      benchmark: Math.expm1(bench),
      giorniUsati: usati,
    };
  });

  return {
    eventoId,
    benchmark: benchmark.simbolo,
    alpha: stima.alpha,
    beta: stima.beta,
    osservazioniStima: stima.n,
    finestre: risultati,
    problema: null,
  };
}

/**
 * Intervallo di confidenza bootstrap sulla media di un campione.
 * Deterministico: il generatore è seminato, così due giri danno lo stesso risultato
 * e l'utente non vede il numero ballare senza motivo.
 */
export function bootstrapIC(
  campione: number[],
  { giri = 2000, livello = 0.95, seme = 42 } = {}
): { media: number; basso: number; alto: number; n: number } | null {
  const v = campione.filter((x) => Number.isFinite(x));
  if (v.length < 3) return null;
  let stato = seme >>> 0;
  const casuale = () => {
    // xorshift32: sufficiente per un bootstrap e riproducibile ovunque.
    stato ^= stato << 13;
    stato ^= stato >>> 17;
    stato ^= stato << 5;
    return (stato >>> 0) / 4294967296;
  };
  const medie: number[] = [];
  for (let g = 0; g < giri; g++) {
    let somma = 0;
    for (let i = 0; i < v.length; i++) somma += v[Math.floor(casuale() * v.length)];
    medie.push(somma / v.length);
  }
  medie.sort((a, b) => a - b);
  const coda = (1 - livello) / 2;
  return {
    media: media(v)!,
    basso: medie[Math.floor(coda * giri)],
    alto: medie[Math.min(giri - 1, Math.floor((1 - coda) * giri))],
    n: v.length,
  };
}
