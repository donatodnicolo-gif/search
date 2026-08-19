/**
 * Deluxy Fondo — percorso professionale e note biografiche di chi guida.
 *
 * A cosa serve e a cosa NON serve.
 *
 * Il **percorso** è informazione di sostanza: sapere che una persona ha già guidato
 * un'azienda, dove e per quanto, è il dato più vicino a un track record che si possa
 * ricostruire da fonti pubbliche. Un amministratore delegato al primo incarico e uno al terzo
 * non sono la stessa scommessa.
 *
 * I **tratti personali** sono un'altra cosa: contesto biografico, non segnali. Non esiste
 * evidenza solida che leghi abitudini, sport o carattere ai rendimenti di un titolo, e la
 * letteratura che ci ha provato è piena di correlazioni che spariscono fuori campione.
 * Stanno qui perché aiutano a farsi un'idea della persona, e la pagina lo dichiara: chi li
 * usasse come criterio di investimento starebbe facendo astrologia con i dati di borsa.
 *
 * Perimetro raccolto: carriera, formazione, modo di lavorare dichiarato pubblicamente,
 * abitudini riportate da interviste. Esclusi di proposito salute, famiglia, orientamento
 * politico o religioso e patrimonio: non servono a valutare una gestione e non sono affari
 * di un'app di ricerca finanziaria.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { CARTELLA_DATI } from "./archivio.ts";
import type { Confidenza, Fonte } from "./tipi";

export type TappaCarriera = {
  /** Anno di inizio, come stringa: a volte le fonti danno solo l'anno. */
  da: string | null;
  /** Anno di fine, `null` se ancora in corso. */
  a: string | null;
  azienda: string;
  ruolo: string;
  /** Perché questa tappa conta, quando conta. */
  nota: string | null;
};

export type Tratto = {
  tratto: string;
  dettaglio: string | null;
  fonte: string | null;
  data: string | null;
};

export type Biografia = {
  nome: string;
  annoNascita: number | null;
  formazione: string | null;
  carriera: TappaCarriera[];
  /**
   * Se ha già ricoperto il ruolo di amministratore delegato prima di questo incarico.
   * È l'unico campo di questa scheda con un legame plausibile con il risultato, e anche
   * quello va preso come contesto: la letteratura sull'esperienza pregressa dà risultati
   * contrastanti.
   */
  giaAmministratoreDelegato: boolean | null;
  stileDichiarato: string | null;
  tratti: Tratto[];
  fonti: Fonte[];
  confidenza: Confidenza;
};

export type FileBiografie = {
  nota: string;
  avvertenza: string;
  persone: Biografia[];
};

const NOME_FILE = "biografie.json";

export async function leggiBiografie(): Promise<FileBiografie> {
  try {
    const testo = await fs.readFile(path.join(CARTELLA_DATI, NOME_FILE), "utf8");
    return JSON.parse(testo) as FileBiografie;
  } catch {
    return { nota: "", avvertenza: "", persone: [] };
  }
}

/** La biografia di una persona, se censita. Il confronto è sul nome esatto. */
export function biografiaDi(file: FileBiografie, nome: string): Biografia | null {
  return file.persone.find((p) => p.nome === nome) ?? null;
}

/**
 * Anni di esperienza come capo azienda **prima** dell'incarico attuale.
 * Somma le tappe in cui il ruolo contiene «amministratore delegato» o «chief executive»,
 * escludendo quelle ancora in corso: serve a distinguere chi è al primo incarico.
 */
export function anniDaCapoAzienda(bio: Biografia | null, primaDi: string | null = null): number | null {
  if (!bio?.carriera?.length) return null;
  const rilevanti = bio.carriera.filter((t) => {
    const r = t.ruolo.toLowerCase();
    const eCapo = r.includes("amministratore delegato") || r.includes("chief executive") || r.includes("ceo");
    if (!eCapo || !t.da || !t.a) return false;
    // Solo le tappe concluse prima dell'incarico in esame.
    return primaDi ? t.a < primaDi.slice(0, 4) || t.a <= primaDi.slice(0, 4) : true;
  });
  if (!rilevanti.length) return 0;
  return rilevanti.reduce((s, t) => {
    const da = Number(t.da);
    const a = Number(t.a);
    return s + (Number.isFinite(da) && Number.isFinite(a) && a >= da ? a - da : 0);
  }, 0);
}
