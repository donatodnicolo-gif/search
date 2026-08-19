/**
 * Deluxy Fondo — portafoglio: posizioni reali e ipotesi di investimento.
 *
 * Due cose deliberatamente separate e mai mescolate:
 *  - `posizioni`: quello che è stato comprato davvero, con quantità e prezzo pagati;
 *  - `ipotesi`: simulazioni «se comprassi N azioni», che non entrano in nessun totale reale.
 *
 * Regole di questo modulo:
 *  1. Un prezzo di carico o una quantità mancanti NON diventano zero: la posizione resta
 *     «da completare» e l'app lo dice, invece di mostrare una perdita del 100%.
 *  2. Il confronto con l'indice parte dalla **data di acquisto**, non dall'inizio dell'anno:
 *     la domanda è «avrei fatto meglio a comprare l'indice quel giorno?».
 *  3. Nessun ordine, nessuna integrazione con broker: qui si registra a mano ciò che è già
 *     stato deciso e si osserva come va.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { CARTELLA_DATI, leggiSerie } from "./archivio.ts";
import { variazione } from "./statistica.ts";
import { BENCHMARK_TOTALE, BENCHMARK_MERCATO } from "./universo.ts";
import type { SerieStorica } from "./tipi";

export type Posizione = {
  id: string;
  simbolo: string;
  nome: string;
  /** Numero di azioni. `null` = ancora da compilare. */
  quantita: number | null;
  /** Prezzo medio pagato per azione, nella valuta di acquisto. `null` = da compilare. */
  prezzoCarico: number | null;
  valuta: string;
  /** ISO `YYYY-MM-DD`. `null` = da compilare. */
  dataAcquisto: string | null;
  /** Commissioni e imposte pagate all'acquisto, nella stessa valuta. */
  commissioni: number | null;
  /** Codice ISIN: identifica il titolo senza ambiguità, a differenza del ticker. */
  isin?: string | null;
  /** Borsa su cui è stato eseguito l'ordine, in chiaro. */
  borsa: string | null;
  /**
   * Da dove vengono i prezzi mostrati, quando NON è la stessa piazza dell'esecuzione.
   * Capita: alcune sedi (per esempio Equiduct) non hanno una serie storica pubblica, e si
   * usa una piazza equivalente come riferimento. Va dichiarato, non nascosto.
   */
  fontePrezzi?: string | null;
  note: string | null;
  /** Perché è in portafoglio: la tesi, scritta prima e non riscritta dopo. */
  tesi: string | null;
};

export type Ipotesi = {
  id: string;
  simbolo: string;
  nome: string;
  quantita: number;
  /**
   * Prezzo a cui si ipotizza di comprare. `null` = si usa l'ultima chiusura disponibile,
   * che è il caso normale («quanto mi costerebbe oggi»).
   */
  prezzoIpotesi: number | null;
  note: string | null;
};

export type FilePortafoglio = {
  nota: string;
  /** Valuta in cui si esprimono i totali. */
  valutaBase: string;
  posizioni: Posizione[];
  ipotesi: Ipotesi[];
};

const NOME_FILE = "portafoglio.json";

export async function leggiPortafoglio(): Promise<FilePortafoglio> {
  try {
    const testo = await fs.readFile(path.join(CARTELLA_DATI, NOME_FILE), "utf8");
    return JSON.parse(testo) as FilePortafoglio;
  } catch {
    // Nessun file = portafoglio vuoto, non un errore.
    return { nota: "", valutaBase: "EUR", posizioni: [], ipotesi: [] };
  }
}

export async function scriviPortafoglio(p: FilePortafoglio): Promise<void> {
  await fs.mkdir(CARTELLA_DATI, { recursive: true });
  await fs.writeFile(path.join(CARTELLA_DATI, NOME_FILE), JSON.stringify(p, null, 2) + "\n", "utf8");
}

/** Tutti i simboli che il portafoglio richiede: servono allo script di aggiornamento. */
export async function simboliDelPortafoglio(): Promise<string[]> {
  const p = await leggiPortafoglio();
  return [...new Set([...p.posizioni.map((x) => x.simbolo), ...p.ipotesi.map((x) => x.simbolo)])];
}

export type PosizioneValutata = {
  posizione: Posizione;
  /** `false` quando quantità, prezzo di carico o data non sono ancora stati inseriti. */
  completa: boolean;
  /** Motivo per cui non è valutabile, quando non lo è. */
  problema: string | null;

  ultimoPrezzo: number | null;
  ultimaData: string | null;
  /** Sedute passate dall'ultimo prezzo: se troppe, il dato è vecchio e va detto. */
  seduteDaUltimoDato: number | null;

  costoTotale: number | null;
  valoreAttuale: number | null;
  utilePerdita: number | null;
  utilePerditaPercentuale: number | null;

  /** Rendimento dell'indice dalla data di acquisto: il vero termine di confronto. */
  rendimentoIndice: number | null;
  /** Quanto la posizione ha fatto meglio o peggio dell'indice, in frazione. */
  eccesso: number | null;

  /** Prezzo massimo e minimo dall'acquisto: dice quanto si è sopportato per stare qui. */
  massimoDaAcquisto: number | null;
  minimoDaAcquisto: number | null;
  giorniDetenzione: number | null;
};

function seduteDa(dataISO: string | null): number | null {
  if (!dataISO) return null;
  const giorni = (Date.now() - Date.parse(dataISO + "T20:00:00Z")) / 86_400_000;
  return Math.max(0, Math.round((giorni * 5) / 7));
}

/**
 * Valuta una posizione ai prezzi correnti.
 *
 * Il rendimento della posizione è confrontato con quello dell'indice **sulle stesse date**.
 * Se la valuta della posizione non è quella dell'indice, il confronto include il cambio: il
 * chiamante deve dirlo, perché quella differenza non è merito né colpa della società.
 */
export function valutaPosizione(
  posizione: Posizione,
  serie: SerieStorica | null,
  benchmark: SerieStorica | null
): PosizioneValutata {
  const vuoto: PosizioneValutata = {
    posizione,
    completa: false,
    problema: null,
    ultimoPrezzo: null,
    ultimaData: null,
    seduteDaUltimoDato: null,
    costoTotale: null,
    valoreAttuale: null,
    utilePerdita: null,
    utilePerditaPercentuale: null,
    rendimentoIndice: null,
    eccesso: null,
    massimoDaAcquisto: null,
    minimoDaAcquisto: null,
    giorniDetenzione: null,
  };

  const mancanti: string[] = [];
  if (posizione.quantita === null) mancanti.push("quantità");
  if (posizione.prezzoCarico === null) mancanti.push("prezzo di carico");
  if (posizione.dataAcquisto === null) mancanti.push("data di acquisto");

  const ultimo = serie?.barre.at(-1) ?? null;
  const base = {
    ...vuoto,
    ultimoPrezzo: ultimo?.chiusura ?? null,
    ultimaData: ultimo?.data ?? null,
    seduteDaUltimoDato: seduteDa(ultimo?.data ?? null),
  };

  if (!serie || !ultimo) {
    return { ...base, problema: "Prezzi non disponibili per questo titolo: esegui l'aggiornamento." };
  }
  if (mancanti.length > 0) {
    return {
      ...base,
      problema: `Posizione da completare: manca ${mancanti.join(", ")}. Finché non c'è, non viene valutata né conteggiata nei totali.`,
    };
  }

  const quantita = posizione.quantita!;
  const carico = posizione.prezzoCarico!;
  const dataAcquisto = posizione.dataAcquisto!;
  const commissioni = posizione.commissioni ?? 0;

  const costoTotale = quantita * carico + commissioni;
  const valoreAttuale = quantita * ultimo.chiusura;
  const utilePerdita = valoreAttuale - costoTotale;

  // Le barre dall'acquisto a oggi: servono per massimo, minimo e confronto con l'indice.
  const dallAcquisto = serie.barre.filter((b) => b.data >= dataAcquisto);
  const chiusure = dallAcquisto.map((b) => b.chiusura);

  let rendimentoIndice: number | null = null;
  if (benchmark && dallAcquisto.length > 1) {
    const mappa = new Map(benchmark.barre.map((b) => [b.data, b.chiusura]));
    const inizio = dallAcquisto.find((b) => mappa.has(b.data));
    const fine = [...dallAcquisto].reverse().find((b) => mappa.has(b.data));
    if (inizio && fine && inizio.data !== fine.data) {
      rendimentoIndice = variazione(mappa.get(inizio.data)!, mappa.get(fine.data)!);
    }
  }

  // Il rendimento della posizione si misura sul prezzo pagato, commissioni incluse: è quello
  // che conta per chi ha messo i soldi, non la variazione teorica del titolo.
  const utilePerditaPercentuale = costoTotale > 0 ? utilePerdita / costoTotale : null;

  return {
    ...base,
    completa: true,
    problema: null,
    costoTotale,
    valoreAttuale,
    utilePerdita,
    utilePerditaPercentuale,
    rendimentoIndice,
    eccesso:
      utilePerditaPercentuale !== null && rendimentoIndice !== null
        ? utilePerditaPercentuale - rendimentoIndice
        : null,
    massimoDaAcquisto: chiusure.length ? Math.max(...chiusure) : null,
    minimoDaAcquisto: chiusure.length ? Math.min(...chiusure) : null,
    giorniDetenzione: Math.round((Date.now() - Date.parse(dataAcquisto)) / 86_400_000),
  };
}

export type IpotesiValutata = {
  ipotesi: Ipotesi;
  ultimoPrezzo: number | null;
  ultimaData: string | null;
  valuta: string;
  /** Prezzo usato per la simulazione: quello indicato, oppure l'ultima chiusura. */
  prezzoUsato: number | null;
  /** Se il prezzo viene dal mercato invece che dall'ipotesi. */
  prezzoDalMercato: boolean;
  esborso: number | null;
  problema: string | null;
};

/** Valuta un'ipotesi: quanto costerebbe comprare N azioni. */
export function valutaIpotesi(ipotesi: Ipotesi, serie: SerieStorica | null): IpotesiValutata {
  const ultimo = serie?.barre.at(-1) ?? null;
  const prezzoUsato = ipotesi.prezzoIpotesi ?? ultimo?.chiusura ?? null;
  return {
    ipotesi,
    ultimoPrezzo: ultimo?.chiusura ?? null,
    ultimaData: ultimo?.data ?? null,
    valuta: serie?.valuta ?? "EUR",
    prezzoUsato,
    prezzoDalMercato: ipotesi.prezzoIpotesi === null,
    esborso: prezzoUsato !== null ? prezzoUsato * ipotesi.quantita : null,
    problema: prezzoUsato === null ? "Prezzo non disponibile: impossibile stimare l'esborso." : null,
  };
}

export type VistaPortafoglio = {
  file: FilePortafoglio;
  posizioni: PosizioneValutata[];
  ipotesi: IpotesiValutata[];
  /** Nome dell'indice usato per il confronto. */
  benchmarkUsato: string;
  totalReturn: boolean;
  totali: {
    /** Quante posizioni sono valutabili e quante restano da completare. */
    valutate: number;
    daCompletare: number;
    /**
     * I totali sommano valute diverse solo se tutte le posizioni valutate sono nella stessa:
     * altrimenti restano `null`, perché sommare euro e dollari senza convertirli è sbagliato.
     */
    valutaComune: string | null;
    costo: number | null;
    valore: number | null;
    utilePerdita: number | null;
    utilePerditaPercentuale: number | null;
  };
};

export async function costruisciPortafoglio(): Promise<VistaPortafoglio> {
  const file = await leggiPortafoglio();
  const totale = await leggiSerie(BENCHMARK_TOTALE);
  const benchmark = totale ?? (await leggiSerie(BENCHMARK_MERCATO));

  const posizioni: PosizioneValutata[] = [];
  for (const p of file.posizioni) {
    const serie = await leggiSerie(p.simbolo);
    posizioni.push(valutaPosizione(p, serie, benchmark));
  }

  const ipotesi: IpotesiValutata[] = [];
  for (const i of file.ipotesi) {
    const serie = await leggiSerie(i.simbolo);
    ipotesi.push(valutaIpotesi(i, serie));
  }

  const valutate = posizioni.filter((p) => p.completa);
  const valute = new Set(valutate.map((p) => p.posizione.valuta));
  const valutaComune = valute.size === 1 ? [...valute][0] : null;

  const costo = valutaComune ? valutate.reduce((s, p) => s + (p.costoTotale ?? 0), 0) : null;
  const valore = valutaComune ? valutate.reduce((s, p) => s + (p.valoreAttuale ?? 0), 0) : null;

  return {
    file,
    posizioni,
    ipotesi,
    benchmarkUsato: benchmark?.nome ?? "nessuno",
    totalReturn: totale !== null,
    totali: {
      valutate: valutate.length,
      daCompletare: posizioni.length - valutate.length,
      valutaComune,
      costo,
      valore,
      utilePerdita: costo !== null && valore !== null ? valore - costo : null,
      utilePerditaPercentuale: costo !== null && valore !== null && costo > 0 ? (valore - costo) / costo : null,
    },
  };
}
