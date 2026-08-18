/**
 * Deluxy Fondo — costruzione della vista che le pagine mostrano.
 *
 * Gira solo sul server (legge i file in `dati/`). Se un dato manca, il campo resta `null`
 * e la pagina deve dirlo: mai riempire un buco con l'ultimo valore noto senza dichiararlo.
 */

import { leggiSerie, leggiFondamentali, leggiNotizie, leggiIstantanea } from "./archivio";
import { leggiBilanci, type Bilanci } from "./bilanci";
import { calcolaIndicatori, giorniEstremi, type Indicatori } from "./indicatori";
import { calcolaPunteggio } from "./punteggio";
import { eventStudy } from "./statistica";
import { BENCHMARK_MERCATO, EVENTI, TITOLI, eventiDi, type Titolo } from "./universo";
import type { EventStudy, EventoManagement, Istantanea, Punteggio, SerieStorica } from "./tipi";
import type { Notizia } from "./fonti";

export type VistaTitolo = {
  titolo: Titolo;
  serie: SerieStorica | null;
  indicatori: Indicatori | null;
  punteggio: Punteggio | null;
  /** L'evento di management più recente registrato per questo titolo. */
  ultimoEvento: EventoManagement | null;
  eventi: EventoManagement[];
  /** Bilanci da fonte primaria, quando esistono per questo titolo. */
  bilanci: Bilanci | null;
  /** Perché il dato non c'è, quando non c'è. */
  problema: string | null;
};

export type Cruscotto = {
  generatoIl: string;
  istantanea: Istantanea | null;
  benchmark: SerieStorica | null;
  titoli: VistaTitolo[];
  notizie: Notizia[];
};

/** Notizie considerate rilevanti: governance oppure operazione straordinaria. */
export function notizieRilevanti(notizie: Notizia[]): Notizia[] {
  return notizie.filter((n) => n.segnali.length > 0 || n.straordinarie.length > 0);
}

export async function costruisciCruscotto(): Promise<Cruscotto> {
  const benchmark = await leggiSerie(BENCHMARK_MERCATO);
  const istantanea = await leggiIstantanea();
  const notizie = (await leggiNotizie()) ?? [];
  const rilevanti = notizieRilevanti(notizie).length;

  const titoli: VistaTitolo[] = [];
  for (const t of TITOLI) {
    const serie = await leggiSerie(t.simbolo);
    const eventi = eventiDi(t.simbolo);
    // «Ultimo evento» = il più recente già annunciato: un evento futuro non è un segnale.
    const oggi = new Date().toISOString().slice(0, 10);
    const ultimoEvento = eventi.find((e) => e.dataAnnuncio <= oggi) ?? null;

    if (!serie || serie.barre.length === 0) {
      titoli.push({
        titolo: t,
        serie: null,
        indicatori: null,
        punteggio: null,
        ultimoEvento,
        eventi,
        bilanci: null,
        problema: "Serie storica non disponibile: esegui `npm run aggiorna`.",
      });
      continue;
    }

    const indicatori = calcolaIndicatori(serie, benchmark);
    const fondamentali = await leggiFondamentali(t.simbolo);
    const bilanci = await leggiBilanci(t.simbolo);
    const punteggio = calcolaPunteggio({
      evento: ultimoEvento,
      indicatori,
      fondamentali,
      bilanci,
      notizieRilevanti: t.simbolo === "TIT.MI" ? rilevanti : null,
    });

    titoli.push({ titolo: t, serie, indicatori, punteggio, ultimoEvento, eventi, bilanci, problema: null });
  }

  // Ordine: prima chi ha il punteggio più alto, poi chi non ne ha uno mostrabile.
  titoli.sort((a, b) => (b.punteggio?.valore ?? -1) - (a.punteggio?.valore ?? -1));

  return { generatoIl: new Date().toISOString(), istantanea, benchmark, titoli, notizie };
}

export type VistaEvento = {
  evento: EventoManagement;
  studio: EventStudy | null;
};

/** Event study su tutti gli eventi di un titolo, contro il benchmark di mercato. */
export async function studiaEventi(simbolo: string): Promise<VistaEvento[]> {
  const serie = await leggiSerie(simbolo);
  const benchmark = await leggiSerie(BENCHMARK_MERCATO);
  const eventi = eventiDi(simbolo);
  if (!serie || !benchmark) return eventi.map((evento) => ({ evento, studio: null }));

  return eventi.map((evento) => ({
    evento,
    studio: eventStudy(evento.id, serie, benchmark, evento.dataAnnuncio),
  }));
}

/** Tutti gli eventi dell'universo, ordinati dal più recente. */
export const eventiRecenti = () => [...EVENTI].sort((a, b) => b.dataAnnuncio.localeCompare(a.dataAnnuncio));

export async function dettaglioTitolo(simbolo: string) {
  const serie = await leggiSerie(simbolo);
  const benchmark = await leggiSerie(BENCHMARK_MERCATO);
  const fondamentali = await leggiFondamentali(simbolo);
  const notizie = (await leggiNotizie()) ?? [];
  const indicatori = serie ? calcolaIndicatori(serie, benchmark) : null;
  return {
    serie,
    benchmark,
    fondamentali,
    indicatori,
    estremi: serie ? giorniEstremi(serie) : null,
    notizie: notizieRilevanti(notizie),
    studi: await studiaEventi(simbolo),
  };
}
