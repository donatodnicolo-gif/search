/**
 * Deluxy Fondo — costruzione della vista che le pagine mostrano.
 *
 * Gira solo sul server (legge i file in `dati/`). Se un dato manca, il campo resta `null`
 * e la pagina deve dirlo: mai riempire un buco con l'ultimo valore noto senza dichiararlo.
 */

import { leggiSerie, leggiFondamentali, leggiNotizie, leggiIstantanea } from "./archivio.ts";
import { leggiBilanci, type Bilanci } from "./bilanci.ts";
import {
  calcolaIndicatori,
  calcolaMandato,
  giorniEstremi,
  tratto,
  type Indicatori,
  type Mandato,
  type Tratto,
} from "./indicatori.ts";
import { calcolaPunteggio } from "./punteggio.ts";
import { eventStudy } from "./statistica.ts";
import { BENCHMARK_MERCATO, BENCHMARK_TOTALE, EVENTI_TUTTI, TITOLI, TITOLI_TUTTI, eventiDi, mandatoInCorso, type Titolo } from "./universo.ts";
import type { EventStudy, EventoManagement, Istantanea, Punteggio, SerieStorica } from "./tipi";
import type { Notizia } from "./fonti";

export type VistaTitolo = {
  titolo: Titolo;
  serie: SerieStorica | null;
  indicatori: Indicatori | null;
  punteggio: Punteggio | null;
  /**
   * Il mandato in corso: l'ultimo cambio di CHI GUIDA l'azienda.
   * Non è semplicemente l'evento più recente: offerte e cessioni sono escluse.
   */
  ultimoEvento: EventoManagement | null;
  /** L'evento più recente in assoluto, di qualunque categoria: serve da contesto. */
  eventoPiuRecente: EventoManagement | null;
  /**
   * Il mandato in corso misurato: rendimento dall'annuncio della nomina a oggi, contro
   * l'indice. È la misura giusta per una tesi sul cambio di management — un rendimento a
   * 12 mesi non sa nulla di chi comanda e di quando è arrivato.
   */
  mandato: Mandato | null;
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
  // Per i confronti di mandato serve l'indice a dividendi reinvestiti, come in /mandati:
  // usare quello di prezzo regalerebbe ai titoli 3-4 punti l'anno.
  const benchmarkTotale = (await leggiSerie(BENCHMARK_TOTALE)) ?? benchmark;
  const istantanea = await leggiIstantanea();
  const notizie = (await leggiNotizie()) ?? [];
  const rilevanti = notizieRilevanti(notizie).length;

  const titoli: VistaTitolo[] = [];
  for (const t of TITOLI_TUTTI) {
    const serie = await leggiSerie(t.simbolo);
    const eventi = eventiDi(t.simbolo);
    const oggi = new Date().toISOString().slice(0, 10);
    // Il punteggio si basa sul MANDATO in corso, non sull'ultimo evento qualsiasi:
    // su TIM l'evento più recente è l'offerta di Poste, ma la gestione è di Labriola.
    const ultimoEvento = mandatoInCorso(t.simbolo, oggi);
    const eventoPiuRecente = eventi.find((e) => e.dataAnnuncio <= oggi) ?? null;

    if (!serie || serie.barre.length === 0) {
      titoli.push({
        titolo: t,
        serie: null,
        indicatori: null,
        punteggio: null,
        ultimoEvento,
        eventoPiuRecente,
        mandato: null,
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

    // Il mandato in corso, misurato dall'annuncio della nomina a oggi.
    const mandato = ultimoEvento
      ? calcolaMandato(
          {
            eventoId: ultimoEvento.id,
            chi: ultimoEvento.titolo,
            tier: ultimoEvento.tier,
            forzato: ultimoEvento.forzato,
            successoreEsterno: ultimoEvento.successoreEsterno,
            dataInizio: ultimoEvento.dataAnnuncio,
            dataFine: null,
            dataEfficacia: ultimoEvento.dataEfficacia,
          },
          serie,
          benchmarkTotale
        )
      : null;

    titoli.push({ titolo: t, serie, indicatori, punteggio, ultimoEvento, eventoPiuRecente, mandato, eventi, bilanci, problema: null });
  }

  // Ordine: chi sta facendo meglio del mercato nel proprio mandato viene per primo. È la
  // domanda della tesi, e ordinare per punteggio metterebbe invece in cima chi somiglia di
  // più a un turnaround sulla carta, che è un'altra cosa.
  titoli.sort((a, b) => (b.mandato?.eccesso ?? -Infinity) - (a.mandato?.eccesso ?? -Infinity));

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
export const eventiRecenti = () => [...EVENTI_TUTTI].sort((a, b) => b.dataAnnuncio.localeCompare(a.dataAnnuncio));

/**
 * La successione dei mandati di un titolo: un tratto per ogni amministratore delegato,
 * dalla nomina alla nomina del successore (o a oggi).
 *
 * È il monitoraggio stabile della tesi: si guarda quanto ha reso il titolo sotto ciascuna
 * gestione, rispetto al mercato, invece di guardare finestre temporali arbitrarie.
 *
 * Contano solo le **nomine**: le uscite non aprono un mandato, e i piani industriali sono
 * lavoro di chi è già in carica. Gli eventi di controllo e di perimetro restano fuori — se
 * li si contasse, un'offerta pubblica aprirebbe un «mandato» che nessuno ha guidato.
 */
export function mandatiDi(simbolo: string, serie: SerieStorica, benchmark: SerieStorica | null): Mandato[] {
  const oggi = new Date().toISOString().slice(0, 10);
  const nomine = EVENTI_TUTTI.filter(
    (e) =>
      e.simbolo === simbolo &&
      e.categoria === "management" &&
      e.dataAnnuncio <= oggi &&
      !e.id.endsWith("-out") &&
      !e.id.includes("piano")
  ).sort((a, b) => a.dataAnnuncio.localeCompare(b.dataAnnuncio));

  return nomine
    .map((e, i) => {
      const successiva = nomine[i + 1];
      return calcolaMandato(
        {
          eventoId: e.id,
          chi: e.titolo,
          tier: e.tier,
          forzato: e.forzato,
          successoreEsterno: e.successoreEsterno,
          dataInizio: e.dataAnnuncio,
          dataFine: successiva ? successiva.dataAnnuncio : null,
          dataEfficacia: e.dataEfficacia,
        },
        serie,
        benchmark
      );
    })
    .filter((m): m is Mandato => m !== null);
}

/**
 * Tutti i mandati dell'universo, per il monitoraggio complessivo.
 *
 * Il confronto usa il benchmark **a dividendi reinvestiti**: le serie dei titoli li
 * includono, quindi misurarli contro un indice di prezzo regalerebbe loro 3-4 punti l'anno.
 * Se quella serie manca, si ripiega sull'indice di prezzo e il chiamante lo dichiara.
 */
export async function tuttiIMandati(): Promise<{ mandati: Mandato[]; benchmarkUsato: string; totalReturn: boolean }> {
  const totale = await leggiSerie(BENCHMARK_TOTALE);
  const benchmark = totale ?? (await leggiSerie(BENCHMARK_MERCATO));
  const fuori: Mandato[] = [];
  for (const t of TITOLI_TUTTI) {
    const serie = await leggiSerie(t.simbolo);
    if (!serie) continue;
    fuori.push(...mandatiDi(t.simbolo, serie, benchmark));
  }
  // I mandati in corso per primi, poi i più recenti: è l'ordine in cui si guardano.
  fuori.sort((a, b) => {
    if (a.inCorso !== b.inCorso) return a.inCorso ? -1 : 1;
    return b.dataInizio.localeCompare(a.dataInizio);
  });

  return {
    mandati: fuori,
    benchmarkUsato: benchmark?.nome ?? "nessuno",
    totalReturn: totale !== null,
  };
}

export async function dettaglioTitolo(simbolo: string) {
  const serie = await leggiSerie(simbolo);
  const benchmark = await leggiSerie(BENCHMARK_MERCATO);
  const fondamentali = await leggiFondamentali(simbolo);
  const notizie = (await leggiNotizie()) ?? [];
  const indicatori = serie ? calcolaIndicatori(serie, benchmark) : null;
  const mandato = mandatoInCorso(simbolo);

  return {
    serie,
    benchmark,
    fondamentali,
    indicatori,
    mandato,
    fasiDelMandato: serie && mandato ? fasiDelMandato(simbolo, serie, benchmark, mandato) : [],
    estremi: serie ? giorniEstremi(serie) : null,
    notizie: notizieRilevanti(notizie),
    studi: await studiaEventi(simbolo),
  };
}

/**
 * Il mandato in corso, spezzato nelle sue fasi.
 *
 * Un rendimento complessivo di mandato può nascondere due storie opposte. Su TIM lo fa in
 * modo clamoroso: il mandato di Labriola vale +84% in totale, ma è la somma di un −46% nei
 * primi due anni e mezzo e di un +241% dopo la cessione della rete. Mostrare solo il totale
 * farebbe credere a una gestione lineare che non è mai esistita: le fasi sono separate dagli
 * eventi di **perimetro e di controllo**, cioè da ciò che il management non ha deciso da solo.
 */
function fasiDelMandato(
  simbolo: string,
  serie: SerieStorica,
  benchmark: SerieStorica | null,
  mandato: EventoManagement
): Tratto[] {
  const oggi = new Date().toISOString().slice(0, 10);
  const cesure = EVENTI_TUTTI.filter(
    (e) =>
      e.simbolo === simbolo &&
      (e.categoria === "perimetro" || e.categoria === "controllo") &&
      e.dataAnnuncio > mandato.dataAnnuncio &&
      e.dataAnnuncio <= oggi
  ).sort((a, b) => a.dataAnnuncio.localeCompare(b.dataAnnuncio));

  const fasi: Tratto[] = [];
  const completo = tratto(`Intero mandato`, serie, benchmark, mandato.dataAnnuncio);
  if (completo) fasi.push(completo);

  // Una sola cesura per volta sarebbe rumore: si tiene la più rilevante, cioè quella di
  // perimetro, che è la discontinuità vera dei conti.
  const principale = cesure.find((e) => e.categoria === "perimetro") ?? cesure[0];
  if (principale) {
    const prima = tratto(`Prima di «${principale.titolo}»`, serie, benchmark, mandato.dataAnnuncio, principale.dataAnnuncio);
    const dopo = tratto(`Da «${principale.titolo}» a oggi`, serie, benchmark, principale.dataAnnuncio);
    if (prima) fasi.push(prima);
    if (dopo) fasi.push(dopo);
  }
  return fasi;
}
