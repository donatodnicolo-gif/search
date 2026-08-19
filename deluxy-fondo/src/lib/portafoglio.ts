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
import { CARTELLA_DATI, leggiSerie, leggiFondamentali, leggiCambi } from "./archivio.ts";
import { variazione } from "./statistica.ts";
import { BENCHMARK_TOTALE, BENCHMARK_MERCATO } from "./universo.ts";
import {
  contestoTecnico,
  kpiFondamentali,
  livelliOperativi,
  type ContestoTecnico,
  type Kpi,
  type Livello,
  type Regole,
} from "./analisi-operativa.ts";
import type { SerieStorica } from "./tipi";
import type { Fondamentali } from "./fonti";

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

  /** Cedola annua per azione, indicata a mano: le fonti gratuite verificate non la danno. */
  dividendoPerAzione?: number | null;
  /** Valuta della cedola: se diversa da quella di quotazione, il rendimento passa dal cambio. */
  valutaDividendo?: string | null;
  /** Capitalizzazione in milioni, per i multipli di valutazione. */
  capitalizzazioneMln?: number | null;
  /**
   * Simbolo da cui prendere i fondamentali, quando è diverso da quello dei prezzi.
   * Le quotazioni secondarie europee non hanno bilanci: si usa quello primario.
   */
  simboloFondamentali?: string | null;
  /** Soglie di sorveglianza scelte da chi investe. Il programma non ne impone nessuna. */
  regole?: Regole | null;
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

  /** KPI da analista: valutazione, qualità, solidità. Vuoto se non ci sono fondamentali. */
  kpi: Kpi[];
  /** Livelli di prezzo a cui scattano le regole scelte. Vuoto se non sono state fissate. */
  livelli: Livello[];
  /** Dove sta il prezzo: massimi, minimi, medie, volatilità. */
  tecnico: ContestoTecnico | null;
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
  benchmark: SerieStorica | null,
  fondamentali: Fondamentali | null = null,
  /** Quanto vale 1 unità della valuta del dividendo nella valuta di quotazione. */
  cambio: number | null = null
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
    kpi: [],
    livelli: [],
    tecnico: null,
  };

  // Per valutare bastano quantità e prezzo pagato. La data serve solo al confronto con
  // l'indice e al conteggio dei giorni: se manca, quei due campi restano vuoti e il resto
  // si calcola comunque — meglio un utile reale senza confronto che nessun numero.
  const mancanti: string[] = [];
  if (posizione.quantita === null) mancanti.push("quantità");
  if (posizione.prezzoCarico === null) mancanti.push("prezzo di carico");

  const ultimo = serie?.barre.at(-1) ?? null;
  const tecnico = contestoTecnico(serie);

  // I KPI dipendono solo dai fondamentali e dal prezzo: si calcolano anche su una posizione
  // incompleta, perché servono a valutare la società, non l'operazione.
  const kpi = kpiFondamentali(fondamentali, {
    prezzo: ultimo?.chiusura ?? null,
    capitalizzazioneMln: posizione.capitalizzazioneMln ?? null,
    dividendoPerAzione: posizione.dividendoPerAzione ?? null,
    valutaDividendo: posizione.valutaDividendo ?? null,
    cambioDividendo: cambio,
  });

  const base = {
    ...vuoto,
    ultimoPrezzo: ultimo?.chiusura ?? null,
    ultimaData: ultimo?.data ?? null,
    seduteDaUltimoDato: seduteDa(ultimo?.data ?? null),
    kpi,
    tecnico,
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
  const dataAcquisto = posizione.dataAcquisto;
  const commissioni = posizione.commissioni ?? 0;

  const costoTotale = quantita * carico + commissioni;
  const valoreAttuale = quantita * ultimo.chiusura;
  const utilePerdita = valoreAttuale - costoTotale;

  // Le barre dall'acquisto a oggi: servono per massimo, minimo e confronto con l'indice.
  // Senza data di acquisto non esiste un «da quando», quindi questi campi restano vuoti.
  const dallAcquisto = dataAcquisto ? serie.barre.filter((b) => b.data >= dataAcquisto) : [];
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
  const massimoDaAcquisto = chiusure.length ? Math.max(...chiusure) : null;
  const mesiTrascorsi = dataAcquisto ? (Date.now() - Date.parse(dataAcquisto)) / (30.44 * 86_400_000) : null;

  const eccesso =
    utilePerditaPercentuale !== null && rendimentoIndice !== null
      ? utilePerditaPercentuale - rendimentoIndice
      : null;

  // I livelli esistono solo se qualcuno ha fissato delle regole: il programma non ne inventa.
  const livelli = posizione.regole
    ? livelliOperativi({
        prezzoCarico: carico,
        prezzoAttuale: ultimo.chiusura,
        massimoDaAcquisto,
        eccessoSuIndice: eccesso,
        mesiTrascorsi,
        regole: posizione.regole,
      })
    : [];

  return {
    ...base,
    livelli,
    completa: true,
    // Non è un errore, ma una parte della valutazione resta impossibile: va dichiarata.
    problema: dataAcquisto
      ? null
      : "Manca la data di acquisto: utile e perdita sono corretti, ma non si può dire se l'indice avrebbe fatto meglio nello stesso periodo.",
    costoTotale,
    valoreAttuale,
    utilePerdita,
    utilePerditaPercentuale,
    rendimentoIndice,
    eccesso,
    massimoDaAcquisto,
    minimoDaAcquisto: chiusure.length ? Math.min(...chiusure) : null,
    giorniDetenzione: dataAcquisto ? Math.round((Date.now() - Date.parse(dataAcquisto)) / 86_400_000) : null,
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

    /**
     * Il confronto che conta per un portafoglio: **con gli stessi soldi, alle stesse date,
     * nell'indice**. Non è il rendimento dell'indice nell'anno: è quello ottenuto investendo
     * ogni importo il giorno in cui è stato investito davvero.
     */
    valoreSeIndice: number | null;
    /** Differenza in valuta fra il portafoglio e lo stesso denaro nell'indice. */
    differenzaSuIndice: number | null;
    /** La stessa differenza in punti percentuali sul capitale investito. */
    differenzaSuIndicePunti: number | null;
    /** Quante posizioni hanno la data necessaria al confronto, e quante no. */
    confrontabili: number;
    nonConfrontabili: number;
  };
};

export async function costruisciPortafoglio(): Promise<VistaPortafoglio> {
  const file = await leggiPortafoglio();
  const cambi = await leggiCambi();
  const totale = await leggiSerie(BENCHMARK_TOTALE);
  const benchmark = totale ?? (await leggiSerie(BENCHMARK_MERCATO));

  const posizioni: PosizioneValutata[] = [];
  for (const p of file.posizioni) {
    const serie = await leggiSerie(p.simbolo);
    // I bilanci stanno sulla quotazione primaria: una secondaria europea non ne ha.
    const fondamentali = await leggiFondamentali(p.simboloFondamentali ?? p.simbolo);
    const cambio = p.valutaDividendo && p.valutaDividendo !== "EUR" ? (cambi?.tassi?.[p.valutaDividendo] ?? null) : 1;
    posizioni.push(valutaPosizione(p, serie, benchmark, fondamentali, cambio));
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

  // «E se avessi comprato l'indice?» — ogni importo cresciuto come l'indice dalla SUA data.
  // Le posizioni senza data restano fuori dal confronto, ma vengono contate: un confronto
  // su metà del portafoglio presentato come totale sarebbe fuorviante.
  const confrontabili = valutate.filter((p) => p.rendimentoIndice !== null);
  const nonConfrontabili = valutate.length - confrontabili.length;

  const costoConfrontabile = confrontabili.reduce((s, p) => s + (p.costoTotale ?? 0), 0);
  const valoreConfrontabile = confrontabili.reduce((s, p) => s + (p.valoreAttuale ?? 0), 0);
  const valoreSeIndice =
    valutaComune && confrontabili.length > 0
      ? confrontabili.reduce((s, p) => s + (p.costoTotale ?? 0) * (1 + (p.rendimentoIndice ?? 0)), 0)
      : null;

  const differenzaSuIndice = valoreSeIndice !== null ? valoreConfrontabile - valoreSeIndice : null;

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
      valoreSeIndice,
      differenzaSuIndice,
      differenzaSuIndicePunti:
        differenzaSuIndice !== null && costoConfrontabile > 0 ? differenzaSuIndice / costoConfrontabile : null,
      confrontabili: confrontabili.length,
      nonConfrontabili,
    },
  };
}
