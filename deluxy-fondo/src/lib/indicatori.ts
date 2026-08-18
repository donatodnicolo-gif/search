/**
 * Deluxy Fondo — indicatori di mercato ricalcolati a ogni aggiornamento.
 *
 * Ogni indicatore può valere `null`: quando i dati non bastano non si inventa un numero e
 * non si mette zero. Chi mostra a schermo deve saper scrivere «non disponibile».
 */

import {
  drawdownMassimo,
  indiceDa,
  media,
  mediaMobile,
  rendimenti,
  variazione,
  volatilitaAnnua,
  regressione,
} from "./statistica";
import type { Barra, SerieStorica } from "./tipi";

export type Indicatori = {
  simbolo: string;
  nome: string;
  valuta: string;
  /** Ultima chiusura disponibile e la sua data: il numero non va mai mostrato senza la data. */
  ultimo: number | null;
  ultimaData: string | null;
  /** Quante sedute di borsa fa è l'ultimo dato: se > 3 il dato è vecchio e va detto. */
  seduteDaUltimoDato: number | null;

  rendimenti: Record<Orizzonte, number | null>;
  rendimentiRelativi: Record<Orizzonte, number | null>;

  volatilita60: number | null;
  volatilita250: number | null;
  beta250: number | null;
  drawdownMassimo: { valore: number; da: string; a: string } | null;

  ma50: number | null;
  ma200: number | null;
  distanzaMa200: number | null;
  /** `true` = MA50 sopra MA200 (tendenza rialzista di lungo), `null` se non calcolabile. */
  sopraMa200: boolean | null;
  incroci: { data: string; tipo: "rialzista" | "ribassista" }[];

  rsi14: number | null;
  momentum6m1m: number | null;

  massimo52w: number | null;
  minimo52w: number | null;
  /** Distanza percentuale dal massimo a 52 settimane (negativa = sotto il massimo). */
  daMassimo52w: number | null;

  volumeMedio20: number | null;
  /** Sedute con volume anomalo negli ultimi 12 mesi: sono i giorni-evento. */
  giorniDiVolume: { data: string; volume: number; rapportoSuMedia: number; variazione: number | null }[];
};

export type Orizzonte = "1m" | "3m" | "6m" | "12m" | "3a" | "5a";

/** Sedute di borsa approssimate per orizzonte (21 al mese, 252 all'anno). */
const SEDUTE: Record<Orizzonte, number> = { "1m": 21, "3m": 63, "6m": 126, "12m": 252, "3a": 756, "5a": 1260 };

function rendimentoIndietro(barre: Barra[], sedute: number): number | null {
  if (barre.length <= sedute) return null;
  return variazione(barre[barre.length - 1 - sedute].chiusura, barre[barre.length - 1].chiusura);
}

/** RSI di Wilder a 14 periodi. */
export function rsi(barre: Barra[], periodi = 14): number | null {
  if (barre.length < periodi + 1) return null;
  let guadagni = 0;
  let perdite = 0;
  for (let i = barre.length - periodi; i < barre.length; i++) {
    const d = barre[i].chiusura - barre[i - 1].chiusura;
    if (d >= 0) guadagni += d;
    else perdite -= d;
  }
  if (perdite === 0) return guadagni === 0 ? 50 : 100;
  const rs = guadagni / perdite;
  return 100 - 100 / (1 + rs);
}

/** Date in cui la MA50 ha incrociato la MA200 (nei giorni disponibili). */
function trovaIncroci(barre: Barra[], ma50: (number | null)[], ma200: (number | null)[]) {
  const out: { data: string; tipo: "rialzista" | "ribassista" }[] = [];
  for (let i = 1; i < barre.length; i++) {
    const a50 = ma50[i - 1];
    const a200 = ma200[i - 1];
    const b50 = ma50[i];
    const b200 = ma200[i];
    if (a50 === null || a200 === null || b50 === null || b200 === null) continue;
    if (a50 <= a200 && b50 > b200) out.push({ data: barre[i].data, tipo: "rialzista" });
    if (a50 >= a200 && b50 < b200) out.push({ data: barre[i].data, tipo: "ribassista" });
  }
  return out;
}

/**
 * Calcola tutti gli indicatori di un titolo.
 * `benchmark` serve per i rendimenti relativi e per il beta; se manca, quei campi sono `null`.
 */
export function calcolaIndicatori(serie: SerieStorica, benchmark: SerieStorica | null): Indicatori {
  const barre = serie.barre;
  const ultimo = barre.at(-1) ?? null;

  const vuotiOrizzonte = () =>
    Object.fromEntries(Object.keys(SEDUTE).map((k) => [k, null])) as Record<Orizzonte, number | null>;

  const rend = vuotiOrizzonte();
  const rendRel = vuotiOrizzonte();
  for (const [chiave, sedute] of Object.entries(SEDUTE) as [Orizzonte, number][]) {
    rend[chiave] = rendimentoIndietro(barre, sedute);
    if (benchmark) {
      const rb = rendimentoIndietro(benchmark.barre, sedute);
      const rt = rend[chiave];
      rendRel[chiave] = rt !== null && rb !== null ? rt - rb : null;
    }
  }

  const ma50 = mediaMobile(barre, 50);
  const ma200 = mediaMobile(barre, 200);
  const ultimaMa50 = ma50.at(-1) ?? null;
  const ultimaMa200 = ma200.at(-1) ?? null;

  // Beta: regressione dei rendimenti del titolo su quelli del benchmark, ultime 250 sedute.
  let beta: number | null = null;
  if (benchmark) {
    const mappa = new Map(benchmark.barre.map((b) => [b.data, b.chiusura]));
    const comuni = barre.filter((b) => mappa.has(b.data));
    if (comuni.length > 60) {
      const finestra = comuni.slice(-251);
      const rt = rendimenti(finestra);
      const rb = rendimenti(finestra.map((b) => ({ ...b, chiusura: mappa.get(b.data)! })));
      beta = regressione(rb, rt)?.beta ?? null;
    }
  }

  // Momentum 6 mesi escluso l'ultimo mese: la convenzione standard, che salta l'inversione
  // di breve periodo.
  let momentum: number | null = null;
  if (barre.length > SEDUTE["6m"]) {
    momentum = variazione(barre[barre.length - 1 - SEDUTE["6m"]].chiusura, barre[barre.length - 1 - SEDUTE["1m"]]?.chiusura ?? null);
  }

  const ultimoAnno = barre.slice(-252);
  const chiusure52 = ultimoAnno.map((b) => b.chiusura);
  const massimo52 = chiusure52.length ? Math.max(...chiusure52) : null;
  const minimo52 = chiusure52.length ? Math.min(...chiusure52) : null;

  const volumi = ultimoAnno.map((b) => b.volume).filter((v): v is number => v !== null && v > 0);
  const volumeMedio = media(volumi.slice(-20));
  const giorniDiVolume = volumeMedio
    ? ultimoAnno
        .map((b, i) => {
          if (!b.volume || b.volume <= 0) return null;
          const rapporto = b.volume / volumeMedio;
          if (rapporto < 2.5) return null;
          const prima = ultimoAnno[i - 1]?.chiusura ?? null;
          return { data: b.data, volume: b.volume, rapportoSuMedia: rapporto, variazione: variazione(prima, b.chiusura) };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)
        .sort((a, b) => b.rapportoSuMedia - a.rapportoSuMedia)
        .slice(0, 8)
    : [];

  // Quante sedute sono passate dall'ultimo dato: serve a dire «questo prezzo è vecchio».
  let seduteDaUltimo: number | null = null;
  if (ultimo) {
    const giorni = (Date.now() - Date.parse(ultimo.data + "T20:00:00Z")) / 86_400_000;
    seduteDaUltimo = Math.max(0, Math.round((giorni * 5) / 7));
  }

  return {
    simbolo: serie.simbolo,
    nome: serie.nome,
    valuta: serie.valuta,
    ultimo: ultimo?.chiusura ?? null,
    ultimaData: ultimo?.data ?? null,
    seduteDaUltimoDato: seduteDaUltimo,
    rendimenti: rend,
    rendimentiRelativi: rendRel,
    volatilita60: volatilitaAnnua(barre.slice(-60)),
    volatilita250: volatilitaAnnua(barre.slice(-250)),
    beta250: beta,
    drawdownMassimo: drawdownMassimo(barre.slice(-1260)),
    ma50: ultimaMa50,
    ma200: ultimaMa200,
    distanzaMa200: ultimaMa200 && ultimo ? ultimo.chiusura / ultimaMa200 - 1 : null,
    sopraMa200: ultimaMa50 !== null && ultimaMa200 !== null ? ultimaMa50 > ultimaMa200 : null,
    incroci: trovaIncroci(barre, ma50, ma200).slice(-6),
    rsi14: rsi(barre),
    momentum6m1m: momentum,
    massimo52w: massimo52,
    minimo52w: minimo52,
    daMassimo52w: massimo52 && ultimo ? ultimo.chiusura / massimo52 - 1 : null,
    volumeMedio20: volumeMedio,
    giorniDiVolume,
  };
}

export type Tratto = {
  etichetta: string;
  da: string;
  a: string;
  /** Rendimento del titolo nel tratto. */
  titolo: number | null;
  /** Rendimento del benchmark nello stesso tratto. */
  benchmark: number | null;
  /** Differenza fra i due, in frazione (0,01 = 1 punto percentuale). */
  eccesso: number | null;
  anni: number;
  /** Rendimento annuo composto del titolo nel tratto. */
  cagr: number | null;
};

/**
 * Rendimento del titolo e del benchmark fra due date, con l'eccesso.
 *
 * Serve a misurare un **mandato**: quanto ha reso il titolo da quando una certa persona
 * guida l'azienda. È la domanda giusta da fare a una tesi sul cambio di management —
 * più utile del rendimento a 12 mesi, che non sa nulla di chi comanda.
 */
export function tratto(
  etichetta: string,
  serie: SerieStorica,
  benchmark: SerieStorica | null,
  da: string,
  a?: string
): Tratto | null {
  const dentro = (b: Barra) => b.data >= da && (!a || b.data <= a);
  const barre = serie.barre.filter(dentro);
  if (barre.length < 2) return null;

  const primo = barre[0];
  const ultimo = barre[barre.length - 1];
  const rTitolo = variazione(primo.chiusura, ultimo.chiusura);

  let rBench: number | null = null;
  if (benchmark) {
    const mappa = new Map(benchmark.barre.map((b) => [b.data, b.chiusura]));
    // Si allinea sulle stesse sedute del titolo: confrontare date diverse falsa il conto.
    const inizio = barre.find((b) => mappa.has(b.data));
    const fine = [...barre].reverse().find((b) => mappa.has(b.data));
    if (inizio && fine && inizio.data !== fine.data) {
      rBench = variazione(mappa.get(inizio.data)!, mappa.get(fine.data)!);
    }
  }

  const anni = (Date.parse(ultimo.data) - Date.parse(primo.data)) / (365.25 * 86_400_000);
  return {
    etichetta,
    da: primo.data,
    a: ultimo.data,
    titolo: rTitolo,
    benchmark: rBench,
    eccesso: rTitolo !== null && rBench !== null ? rTitolo - rBench : null,
    anni,
    cagr: rTitolo !== null && anni > 0.5 ? Math.pow(1 + rTitolo, 1 / anni) - 1 : null,
  };
}

/** Le sedute migliori e peggiori del periodo: mostrano se il guadagno è concentrato. */
export function giorniEstremi(serie: SerieStorica, quanti = 8) {
  const righe = serie.barre
    .map((b, i) => ({ data: b.data, variazione: i === 0 ? null : variazione(serie.barre[i - 1].chiusura, b.chiusura) }))
    .filter((r): r is { data: string; variazione: number } => r.variazione !== null);
  const ordinate = [...righe].sort((a, b) => b.variazione - a.variazione);
  return { migliori: ordinate.slice(0, quanti), peggiori: ordinate.slice(-quanti).reverse() };
}
