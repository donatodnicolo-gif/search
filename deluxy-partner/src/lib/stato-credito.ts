// Stato finanziario del cliente (credit management).
//
// Classifica ogni partner come farebbe un CFO guardando il partitario clienti:
// non conta solo "quanto mi deve", ma **da quanto** e **come ha pagato finora**.
// Due dimensioni, tenute separate di proposito:
//
//   1. ESPOSIZIONE OGGI — l'aging del credito aperto: quanto è a scadere e
//      quanto è scaduto, spaccato nelle fasce classiche 1-30 / 31-60 / 61-90 / >90.
//      La fascia più vecchia con un importo materiale decide lo stato.
//   2. COMPORTAMENTO STORICO — come ha pagato le fatture già chiuse:
//      puntualità (quota di importo incassato entro scadenza) e ritardo medio
//      ponderato. Un cliente senza scaduto ma che paga sistematicamente a 40
//      giorni non è "regolare": è da monitorare.
//
// Convenzioni:
// - si ragiona sempre su importi IVATI (è quello che entra in banca);
// - le fatture `compensata` NON sono esposizione: si chiudono compensando il
//   dovuto vendite, non con un bonifico;
// - sotto la soglia di materialità (MATERIALITA) uno scaduto non declassa il
//   cliente: 17 € scaduti da 90 giorni sono un residuo contabile, non un rischio.

import { ivato } from "./calc";
import { prisma } from "./db";

/** Fatture aperte/chiuse sotto questa cifra non fanno cambiare stato. */
export const MATERIALITA = 25;

/** Confini delle fasce di scaduto, in giorni. */
export const FASCE = { primo: 30, secondo: 60, terzo: 90 } as const;

/** Ritardo medio storico (giorni) oltre il quale un cliente puntuale diventa "da monitorare". */
export const RITARDO_TOLLERATO = 15;

export type FatturaCredito = {
  id: string;
  numero: string | null;
  imponibile: number;
  aliquotaIva: number;
  pagata: boolean;
  compensata: boolean;
  emissione: Date | null;
  scadenza: Date | null;
  dataPagamento: Date | null;
};

export type StatoCredito =
  | "nessuna"     // nessun credito aperto
  | "regolare"    // esposizione tutta a scadere, storico puntuale
  | "monitorare"  // scaduto entro 30 gg, oppure storico di ritardi
  | "ritardo"     // scaduto 31-60 gg
  | "grave"       // scaduto 61-90 gg
  | "insoluto";   // scaduto oltre 90 gg

export type Aging = {
  correnti: number;   // non ancora scadute
  f30: number;        // scadute da 1 a 30 giorni
  f60: number;        // 31-60
  f90: number;        // 61-90
  oltre90: number;    // oltre 90
  senzaScadenza: number; // aperte senza data di scadenza (da sistemare)
};

export type SchedaCredito = {
  stato: StatoCredito;
  etichetta: string;
  /** classe del badge nel design system */
  colore: "neutral" | "green" | "gold" | "orange" | "red" | "purple";
  /** cosa farebbe un CFO domani mattina */
  azione: string;
  /** perché siamo in questo stato, in una riga */
  motivo: string;

  esposizione: number;      // totale aperto IVATO (esclusa la compensazione)
  scaduto: number;          // quota già scaduta
  aging: Aging;
  giorniRitardoMax: number; // fattura aperta più vecchia, in giorni di ritardo
  ritardoMedioAperto: number; // giorni di ritardo medi, pesati per importo, sull'aperto

  // storico (fatture già incassate)
  incassato: number;          // importo storico incassato considerato
  puntualita: number | null;  // % di importo incassato entro scadenza (null se non c'è storico)
  ritardoMedioStorico: number | null; // giorni medi tra scadenza e incasso (pesati per importo)
  fattureStorico: number;

  fattureAperte: number;
  fattureScadute: number;
};

const giorni = (da: Date, a: Date) => Math.floor((a.getTime() - da.getTime()) / 86400000);

/** Aging del credito aperto di un insieme di fatture. */
export function aging(fatture: FatturaCredito[], oggi = new Date()): Aging {
  const a: Aging = { correnti: 0, f30: 0, f60: 0, f90: 0, oltre90: 0, senzaScadenza: 0 };
  for (const f of aperte(fatture)) {
    const v = ivato(f);
    if (!f.scadenza) { a.senzaScadenza += v; continue; }
    const g = giorni(f.scadenza, oggi);
    if (g <= 0) a.correnti += v;
    else if (g <= FASCE.primo) a.f30 += v;
    else if (g <= FASCE.secondo) a.f60 += v;
    else if (g <= FASCE.terzo) a.f90 += v;
    else a.oltre90 += v;
  }
  return a;
}

/** Fatture che rappresentano credito vero: non pagate, non compensate, di importo > 0. */
function aperte(fatture: FatturaCredito[]): FatturaCredito[] {
  return fatture.filter((f) => !f.pagata && !f.compensata && f.imponibile > 0);
}

const somma = (v: number[]) => v.reduce((a, x) => a + x, 0);

/** Media pesata per importo, arrotondata al giorno. */
function mediaPesata(valori: { g: number; peso: number }[]): number | null {
  const peso = somma(valori.map((v) => v.peso));
  if (peso < 0.005) return null;
  return Math.round(somma(valori.map((v) => v.g * v.peso)) / peso);
}

/**
 * Scheda credito di un cliente. `fatture` sono TUTTE le sue fatture servizi
 * (aperte e chiuse) del periodo che si vuole considerare: le aperte fanno
 * l'esposizione, le chiuse il comportamento di pagamento.
 */
export function schedaCredito(fatture: FatturaCredito[], oggi = new Date()): SchedaCredito {
  const ap = aperte(fatture);
  const ag = aging(fatture, oggi);
  const esposizione = ag.correnti + ag.f30 + ag.f60 + ag.f90 + ag.oltre90 + ag.senzaScadenza;
  const scaduto = ag.f30 + ag.f60 + ag.f90 + ag.oltre90;

  const scadute = ap.filter((f) => f.scadenza && giorni(f.scadenza, oggi) > 0);
  const giorniRitardoMax = Math.max(0, ...scadute.map((f) => giorni(f.scadenza!, oggi)));
  const ritardoMedioAperto =
    mediaPesata(scadute.map((f) => ({ g: giorni(f.scadenza!, oggi), peso: ivato(f) }))) ?? 0;

  // Storico: fatture incassate con data di pagamento e scadenza note.
  const chiuse = fatture.filter((f) => f.pagata && f.dataPagamento && f.scadenza && f.imponibile > 0);
  const incassato = somma(chiuse.map((f) => ivato(f)));
  const puntuale = somma(chiuse.filter((f) => giorni(f.scadenza!, f.dataPagamento!) <= 0).map((f) => ivato(f)));
  const puntualita = incassato > 0.005 ? Math.round((puntuale / incassato) * 100) : null;
  const ritardoMedioStorico = mediaPesata(
    chiuse.map((f) => ({ g: Math.max(0, giorni(f.scadenza!, f.dataPagamento!)), peso: ivato(f) }))
  );

  // Lo stato lo decide la fascia più vecchia con importo materiale.
  const materiale = (v: number) => v >= MATERIALITA;
  let stato: StatoCredito;
  let motivo: string;
  if (esposizione < MATERIALITA && scaduto < MATERIALITA) {
    stato = "nessuna";
    motivo = "Nessun credito aperto significativo.";
  } else if (materiale(ag.oltre90)) {
    stato = "insoluto";
    motivo = `${arrotonda(ag.oltre90)} scaduti da oltre 90 giorni.`;
  } else if (materiale(ag.f90)) {
    stato = "grave";
    motivo = `${arrotonda(ag.f90)} scaduti da 61-90 giorni.`;
  } else if (materiale(ag.f60)) {
    stato = "ritardo";
    motivo = `${arrotonda(ag.f60)} scaduti da 31-60 giorni.`;
  } else if (materiale(ag.f30)) {
    stato = "monitorare";
    motivo = `${arrotonda(ag.f30)} scaduti entro i 30 giorni.`;
  } else if (ritardoMedioStorico !== null && ritardoMedioStorico > RITARDO_TOLLERATO) {
    stato = "monitorare";
    motivo = `Niente di scaduto, ma paga in media ${ritardoMedioStorico} giorni dopo la scadenza.`;
  } else {
    stato = "regolare";
    motivo = "Esposizione tutta a scadere e storico dei pagamenti regolare.";
  }

  return {
    stato,
    etichetta: ETICHETTE[stato],
    colore: COLORI[stato],
    azione: azioneConsigliata(stato, scaduto),
    motivo,
    esposizione,
    scaduto,
    aging: ag,
    giorniRitardoMax,
    ritardoMedioAperto,
    incassato,
    puntualita,
    ritardoMedioStorico,
    fattureStorico: chiuse.length,
    fattureAperte: ap.length,
    fattureScadute: scadute.length,
  };
}

const ETICHETTE: Record<StatoCredito, string> = {
  nessuna: "Nessuna esposizione",
  regolare: "Regolare",
  monitorare: "Da monitorare",
  ritardo: "In ritardo",
  grave: "Scaduto grave",
  insoluto: "Insoluto",
};

const COLORI: Record<StatoCredito, SchedaCredito["colore"]> = {
  nessuna: "neutral",
  regolare: "green",
  monitorare: "gold",
  ritardo: "orange",
  grave: "red",
  insoluto: "purple",
};

/** Ordine di gravità: serve per ordinare gli elenchi dal cliente più a rischio. */
export const GRAVITA: Record<StatoCredito, number> = {
  nessuna: 0, regolare: 1, monitorare: 2, ritardo: 3, grave: 4, insoluto: 5,
};

function arrotonda(v: number): string {
  return `${Math.round(v).toLocaleString("it-IT")} €`;
}

function azioneConsigliata(stato: StatoCredito, scaduto: number): string {
  switch (stato) {
    case "nessuna":
      return "Nessuna azione.";
    case "regolare":
      return "Nessuna azione: continuare a fatturare alle condizioni correnti.";
    case "monitorare":
      return "Sollecito cortese e verifica delle condizioni di pagamento al prossimo rinnovo.";
    case "ritardo":
      return "Sollecito formale con nuova scadenza; concordare un rientro se l'importo è alto.";
    case "grave":
      return `Fermare l'affidamento su nuovi servizi e chiedere il rientro di ${arrotonda(scaduto)}: se non arriva, messa in mora.`;
    case "insoluto":
      return `Blocco dei servizi, messa in mora e passaggio al recupero: ${arrotonda(scaduto)} scaduti da oltre 90 giorni.`;
  }
}

// ---------- Caricamento dati ----------
//
// Le fatture si guardano su una finestra mobile (default 24 mesi): l'aperto c'è
// tutto comunque, mentre per il comportamento storico contano gli ultimi due
// anni — com'è stato pagato nel 2023 non dice più niente su come paga oggi.

const CAMPI = {
  id: true, numero: true, imponibile: true, aliquotaIva: true,
  pagata: true, compensata: true, emissione: true, scadenza: true, dataPagamento: true,
} as const;

function daMesiFa(mesi: number, oggi = new Date()): Date {
  const d = new Date(oggi);
  d.setMonth(d.getMonth() - mesi);
  return d;
}

/** Scheda credito di un singolo partner. */
export async function schedaPartner(
  partnerId: string,
  opts?: { mesi?: number; oggi?: Date }
): Promise<SchedaCredito> {
  const oggi = opts?.oggi ?? new Date();
  const dal = daMesiFa(opts?.mesi ?? 24, oggi);
  const fatture = await prisma.fatturaServizio.findMany({
    where: { partnerId, imponibile: { gt: 0 }, OR: [{ pagata: false }, { emissione: { gte: dal } }, { emissione: null }] },
    select: CAMPI,
  });
  return schedaCredito(fatture, oggi);
}

/** Schede credito di tutti i partner, per id (una sola lettura). */
export async function schedeTutti(opts?: { mesi?: number; oggi?: Date }): Promise<Map<string, SchedaCredito>> {
  const oggi = opts?.oggi ?? new Date();
  const dal = daMesiFa(opts?.mesi ?? 24, oggi);
  const fatture = await prisma.fatturaServizio.findMany({
    where: { imponibile: { gt: 0 }, OR: [{ pagata: false }, { emissione: { gte: dal } }, { emissione: null }] },
    select: { ...CAMPI, partnerId: true },
  });
  const perPartner = new Map<string, FatturaCredito[]>();
  for (const f of fatture) {
    const arr = perPartner.get(f.partnerId);
    if (arr) arr.push(f);
    else perPartner.set(f.partnerId, [f]);
  }
  return new Map([...perPartner].map(([id, ff]) => [id, schedaCredito(ff, oggi)]));
}

/** Scheda "vuota" per i partner senza nessuna fattura nel periodo. */
export function schedaVuota(oggi = new Date()): SchedaCredito {
  return schedaCredito([], oggi);
}

/** Aggrega più aging (per i totali di portafoglio). */
export function sommaAging(parti: Aging[]): Aging {
  return parti.reduce(
    (a, x) => ({
      correnti: a.correnti + x.correnti,
      f30: a.f30 + x.f30,
      f60: a.f60 + x.f60,
      f90: a.f90 + x.f90,
      oltre90: a.oltre90 + x.oltre90,
      senzaScadenza: a.senzaScadenza + x.senzaScadenza,
    }),
    { correnti: 0, f30: 0, f60: 0, f90: 0, oltre90: 0, senzaScadenza: 0 }
  );
}
