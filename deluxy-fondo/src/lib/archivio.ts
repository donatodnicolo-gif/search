/**
 * Deluxy Fondo — persistenza su file JSON nella cartella `dati/`.
 *
 * Perché file e non database: l'app deve poter girare su un portatile senza credenziali,
 * e lo storico dei prezzi è piccolo (~300 KB per titolo su 10 anni). Il file è anche
 * versionabile con git, quindi ogni giro di aggiornamento lascia una traccia verificabile
 * di che dati sono stati usati — che è un requisito, non un dettaglio.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import type { Istantanea, SerieStorica } from "./tipi";
import type { Fondamentali, Notizia } from "./fonti";

export const CARTELLA_DATI = path.join(process.cwd(), "dati");

async function leggiJSON<T>(nomeFile: string): Promise<T | null> {
  try {
    const testo = await fs.readFile(path.join(CARTELLA_DATI, nomeFile), "utf8");
    return JSON.parse(testo) as T;
  } catch {
    // File assente o illeggibile: è un'assenza di dato, non un errore da propagare.
    return null;
  }
}

async function scriviJSON(nomeFile: string, valore: unknown): Promise<void> {
  await fs.mkdir(CARTELLA_DATI, { recursive: true });
  await fs.writeFile(path.join(CARTELLA_DATI, nomeFile), JSON.stringify(valore, null, 2) + "\n", "utf8");
}

const nomeSerie = (simbolo: string) => `serie-${simbolo.replace(/[^A-Za-z0-9.-]/g, "_")}.json`;

export const leggiSerie = (simbolo: string) => leggiJSON<SerieStorica>(nomeSerie(simbolo));
export const scriviSerie = (serie: SerieStorica) => scriviJSON(nomeSerie(serie.simbolo), serie);

export const leggiFondamentali = (simbolo: string) =>
  leggiJSON<Fondamentali>(`fondamentali-${simbolo.replace(/[^A-Za-z0-9.-]/g, "_")}.json`);
export const scriviFondamentali = (simbolo: string, dati: Fondamentali) =>
  scriviJSON(`fondamentali-${simbolo.replace(/[^A-Za-z0-9.-]/g, "_")}.json`, dati);

export const leggiNotizie = () => leggiJSON<Notizia[]>("notizie.json");
export const scriviNotizie = (notizie: Notizia[]) => scriviJSON("notizie.json", notizie);

export const leggiCambi = () => leggiJSON<import("./fonti").Cambi>("cambi.json");
export const scriviCambi = (c: import("./fonti").Cambi) => scriviJSON("cambi.json", c);

export const leggiIstantanea = () => leggiJSON<Istantanea>("istantanea.json");
export const scriviIstantanea = (istantanea: Istantanea) => scriviJSON("istantanea.json", istantanea);

/** Età di un dato in ore, per decidere se mostrarlo come fresco o come vecchio. */
export function oreDa(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return (Date.now() - t) / 3_600_000;
}

/**
 * Descrizione leggibile dell'età di un dato.
 * L'app non deve mai mostrare un numero senza dire di quando è.
 */
export function eta(iso: string | null): string {
  const ore = oreDa(iso);
  if (ore === null) return "data ignota";
  if (ore < 1) return `${Math.max(1, Math.round(ore * 60))} min fa`;
  if (ore < 48) return `${Math.round(ore)} ore fa`;
  return `${Math.round(ore / 24)} giorni fa`;
}
