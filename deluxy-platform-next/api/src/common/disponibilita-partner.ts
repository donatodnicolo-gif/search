/**
 * ⭐ 08/09/2026 — QUANDO UN PARTNER È APERTO: la regola, in un posto solo.
 *
 * La cascata era scritta in DUE punti (`sales.module.ts` per lo smistamento,
 * `availability.module.ts` per il tabellone) e stava per diventare tre: il badge
 * «oggi risulti aperto» che il partner vede entrando. Tre copie della stessa regola
 * divergono al primo cambiamento — e quando divergono nessuno se ne accorge, perché
 * ognuna sembra giusta da sola: l'ufficio vedrebbe un partner aperto a cui lo
 * smistamento non propone niente, e il partner leggerebbe «aperto» mentre non gli
 * arriva nulla. È la trappola della regola ricopiata in N posti.
 *
 * LA CASCATA, in ordine di precedenza:
 *
 *   1. **L'ECCEZIONE del giorno** (`PartnerDayException`) — «giovedì chiudo».
 *   2. **Le FASCE del giorno** (`PartnerDaySlot`) — il calendario di disponibilità.
 *   3. **L'ORARIO settimanale** (`OpeningHour`) — l'apertura di sempre.
 *   4. Nessuno dei tre: **sempre aperto**.
 *
 * ⚠️ L'ordine fra 1 e 2 è stato invertito il 08/09/2026, e non era teoria: **34 partner
 * hanno 102.874 fasce future**, generate in massa, che rendevano muta ogni eccezione
 * scritta a mano. Fra un dato scritto APPOSTA per quel giorno e uno generato in blocco,
 * vince quello scritto apposta.
 */

/** Da dove viene la risposta: serve a dirlo a chi guarda, non solo a decidere. */
export type OrigineDisponibilita = 'eccezione' | 'giorno' | 'settimanale' | 'sempre';

export interface FasciaGiorno {
  timeFrom: string | null;
  timeTo: string | null;
  available: boolean;
}

export interface EccezioneGiorno {
  closed: boolean;
  openTime: string | null;
  closeTime: string | null;
  note?: string | null;
}

export interface OrarioSettimanale {
  dayOfWeek: number;
  openTime: string | null;
  closeTime: string | null;
  closed: boolean;
}

export interface StatoDelGiorno {
  aperto: boolean;
  origine: OrigineDisponibilita;
  /** Le fasce in cui è aperto, in ordine di inizio. Vuoto se è chiuso. */
  fasce: { dalle: string | null; alle: string | null }[];
  /** La nota dell'eccezione, se c'è: «inventario», «ponte». */
  nota?: string | null;
}

const perOra = (a: { dalle: string | null }, b: { dalle: string | null }) =>
  (a.dalle ?? '').localeCompare(b.dalle ?? '');

/**
 * Lo stato di UN partner in UN giorno, dai tre elenchi già letti dal database.
 *
 * È una funzione pura: chi chiama fa le query come gli conviene (una per partner nello
 * smistamento, una sola per tutti nel tabellone) e qui si decide sempre allo stesso modo.
 */
export function statoDelGiorno(
  eccezione: EccezioneGiorno | null | undefined,
  fasce: FasciaGiorno[] | null | undefined,
  settimanali: OrarioSettimanale[] | null | undefined,
  giornoDellaSettimana: number,
): StatoDelGiorno {
  // 1) L'eccezione: esiste solo se qualcuno l'ha scritta a mano per QUESTO giorno.
  if (eccezione) {
    return {
      aperto: !eccezione.closed,
      origine: 'eccezione',
      fasce: eccezione.closed ? [] : [{ dalle: eccezione.openTime, alle: eccezione.closeTime }],
      nota: eccezione.note ?? null,
    };
  }

  // 2) Le fasce del giorno: il calendario di disponibilità.
  if (fasce?.length) {
    const aperte = fasce.filter((f) => f.available);
    return {
      aperto: aperte.length > 0,
      origine: 'giorno',
      fasce: aperte.map((f) => ({ dalle: f.timeFrom, alle: f.timeTo })).sort(perOra),
    };
  }

  // 3) L'orario settimanale.
  const oggi = (settimanali ?? []).filter((h) => h.dayOfWeek === giornoDellaSettimana);
  if (oggi.length) {
    const aperte = oggi.filter((h) => !h.closed);
    return {
      aperto: aperte.length > 0,
      origine: 'settimanale',
      fasce: aperte.map((h) => ({ dalle: h.openTime, alle: h.closeTime })).sort(perOra),
    };
  }

  // 4) Nessun orario configurato: l'app lo considera sempre aperto.
  // ⚠️ Non è «non si sa»: è una scelta, ed è quella che fa arrivare le proposte. Va detta
  // al partner, perché è il caso in cui l'app potrebbe proporgli una consegna alle 23.
  return { aperto: true, origine: 'sempre', fasce: [] };
}

/**
 * La stessa domanda, ma per una FINESTRA di consegna: non «è aperto oggi» ma «è aperto
 * quando serve». Lo smistamento ha bisogno di questa; il badge del partner della prima.
 */
export function apertoNellaFinestra(
  stato: StatoDelGiorno,
  siSovrappone: (dalle: string | null, alle: string | null) => boolean,
): boolean {
  if (!stato.aperto) return false;
  // «Sempre aperto» non ha fasce da incrociare: passa.
  if (stato.origine === 'sempre') return true;
  return stato.fasce.some((f) => siSovrappone(f.dalle, f.alle));
}

/** Il giorno a mezzanotte UTC, come lo scrivono le tabelle dei giorni. */
export function giornoUtc(quando: Date): Date {
  return new Date(Date.UTC(quando.getFullYear(), quando.getMonth(), quando.getDate()));
}
