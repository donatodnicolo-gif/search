/**
 * Deluxy Fondo — bilanci ricostruiti da fonti primarie.
 *
 * Perché esistono, invece di usare i fondamentali gratuiti: su TIM le due cose divergono in
 * modo che rovina qualunque calcolo. Il `freeCashFlow` di Yahoo per il 2025 vale 37 milioni,
 * mentre TIM comunica un equity free cash flow after lease di +700 milioni. Un punteggio
 * alimentato da Yahoo legge il 2025 come l'anno peggiore della serie per la cassa: è il
 * contrario. Stessa storia per la leva: 2,87x contro 1,85x, cioè il 48% di errore, senza che
 * nessun calcolo fallisca.
 *
 * Regola: dove esiste il bilancio verificato, comanda quello. Yahoo resta come controllo
 * incrociato, e la divergenza si mostra invece di nasconderla.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { CARTELLA_DATI } from "./archivio";
import type { Confidenza } from "./tipi";

export type EsercizioBilancio = {
  esercizio: number;
  chiusura: string;
  /** Giorno da cui il dato era pubblicamente conoscibile: senza, ogni backtest ha look-ahead. */
  pubblicato: string;
  /** Descrizione del perimetro: dice se l'anno è confrontabile col precedente. */
  perimetro: string;
  ricavi: number | null;
  ricaviDomestic: number | null;
  ricaviBrasile: number | null;
  ricaviDaServizi: number | null;
  ebitda: number | null;
  ebitdaAL: number | null;
  ebit: number | null;
  ebitRestated: number | null;
  nonRicorrenti: number | null;
  risultatoNettoGruppo: number | null;
  risultatoNettoConsolidato: number | null;
  oneriFinanziariNetti: number | null;
  debitoNettoAL: number | null;
  debitoNettoContabile: number | null;
  capex: number | null;
  equityFcfAL: number | null;
  leva: number | null;
  dipendenti: number | null;
  arpuMobile: number | null;
  arpuFissoConsumer: number | null;
  ultrabroadband: number | null;
  rating: string | null;
  dividendo: number | null;
  guidanceCentrata: boolean | null;
  guidanceNota?: string;
  confidenza: Confidenza;
};

export type IndicatoreSvolta = {
  ordine: number;
  indicatore: string;
  primoSegnale: string;
  /** Data in cui il segnale è diventato pubblico: è quella che conta, non la chiusura d'esercizio. */
  dataPubblica: string;
  natura: string;
};

export type Bilanci = {
  nota: string;
  simbolo: string;
  valuta: string;
  unita: string;
  divergenzeNote: string;
  esercizi: EsercizioBilancio[];
  indicatoriDellaSvolta: IndicatoreSvolta[];
  effettoNetCo: Record<string, unknown>;
  cessioneOGestione: Record<string, string>;
  /** Voci che, prese alla lettera da un programma, danno un numero sbagliato senza fallire. */
  trappoleContabili: string[];
  /** Segnali leggibili nei bilanci prima che il prezzo se ne accorgesse. */
  segnaliAnticipatori: { segnale: string; serie: string; lettura: string }[];
  /** Sequenza dei tagli alla guidance del 2021, fino alle dimissioni dell'amministratore delegato. */
  profitWarning2021: { data: string; evento: string; contenuto: string }[];
  anticipabilita: string;
};

/** Bilanci verificati di un titolo, oppure `null` se non ne abbiamo ricostruiti. */
export async function leggiBilanci(simbolo: string): Promise<Bilanci | null> {
  const nome = simbolo === "TIT.MI" ? "bilanci-tim.json" : null;
  if (!nome) return null;
  try {
    return JSON.parse(await fs.readFile(path.join(CARTELLA_DATI, nome), "utf8")) as Bilanci;
  } catch {
    return null;
  }
}

/** L'esercizio più recente già pubblicato a una certa data (default: oggi). */
export function esercizioNoto(bilanci: Bilanci, alGiorno = new Date().toISOString().slice(0, 10)) {
  const noti = bilanci.esercizi.filter((e) => e.pubblicato <= alGiorno);
  return noti.length ? noti[noti.length - 1] : null;
}

/** Variazione di una voce fra gli ultimi due esercizi pubblicati e confrontabili. */
export function variazione(bilanci: Bilanci, voce: keyof EsercizioBilancio): number | null {
  const noti = bilanci.esercizi.filter((e) => e.pubblicato <= new Date().toISOString().slice(0, 10));
  if (noti.length < 2) return null;
  const ultimo = noti[noti.length - 1][voce];
  const prima = noti[noti.length - 2][voce];
  if (typeof ultimo !== "number" || typeof prima !== "number" || prima === 0) return null;
  return ultimo / prima - 1;
}

/**
 * Quanto è vecchio il bilancio più recente, in mesi.
 * Un fondamentale di 14 mesi fa non è un dato «attuale» e la pagina deve dirlo.
 */
export function mesiDallUltimoBilancio(bilanci: Bilanci): number | null {
  const e = esercizioNoto(bilanci);
  if (!e) return null;
  return (Date.now() - Date.parse(e.pubblicato)) / (30 * 86_400_000);
}
