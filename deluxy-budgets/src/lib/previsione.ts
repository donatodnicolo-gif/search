// **Previsione per la parte d'anno che deve ancora venire.**
//
// La domanda è: «se andiamo avanti così, dove chiudiamo?». La risposta NON è
// una media dei mesi fatti moltiplicata per quelli che restano: il business è
// stagionale — a febbraio si vende il doppio di gennaio — e una media
// spalmata direbbe che dicembre vale come agosto.
//
// Il metodo è un altro: si misura **di quanto stiamo crescendo** rispetto allo
// stesso periodo dell'anno scorso, e si applica quella crescita ai mesi che
// mancano **così com'erano l'anno scorso**. La stagionalità la mette l'anno
// precedente, che l'ha già vissuta; noi ci mettiamo solo il ritmo.
//
// Cosa NON fa, di proposito:
// - non prevede niente se non c'è l'anno precedente su cui appoggiarsi. Senza
//   base, «proiezione» vorrebbe dire inventare una curva;
// - non usa il budget come sostituto della storia: il budget è un obiettivo,
//   non un andamento;
// - il mese in corso è parziale, quindi entra nella crescita solo se lo si
//   confronta con lo stesso pezzo di mese dell'anno prima (chi chiama passa
//   già i dati tagliati allo stesso giorno).

export type Previsione = {
  ok: boolean;
  // Perché non si può prevedere, quando ok = false.
  motivo: string;
  // Crescita misurata sui mesi già fatti (%), es. +53
  crescitaPct: number;
  // Quanto è già stato realizzato nei mesi conclusi/parziali
  fatto: number;
  // Quanto ci si aspetta dai mesi che mancano
  restante: number;
  // fatto + restante
  totale: number;
  // I mesi ancora da fare, con la stima di ciascuno
  mesiRestanti: { mese: number; stima: number; annoPrec: number }[];
  // Mesi dell'anno prima usati come base (se ne mancano, la stima è più fragile)
  mesiBase: number;
};

const NIENTE: Previsione = {
  ok: false,
  motivo: "",
  crescitaPct: 0,
  fatto: 0,
  restante: 0,
  totale: 0,
  mesiRestanti: [],
  mesiBase: 0,
};

/**
 * @param mese        12 valori dell'anno in corso (indice 0 = gennaio)
 * @param mesePrec    12 valori dell'anno precedente, stessa scala
 * @param mesiFatti   i mesi già osservati (1..12), l'ultimo può essere parziale
 * @param precFatti   il corrispondente dell'anno prima sui mesi già osservati,
 *                    tagliato allo stesso giorno quando il mese è in corso
 */
export function proietta(
  mese: number[],
  mesePrec: number[],
  mesiFatti: number[],
  precFatti: number
): Previsione {
  if (mesiFatti.length === 0) return { ...NIENTE, motivo: "Nessun mese osservato." };

  const fatto = mesiFatti.reduce((s, m) => s + (mese[m - 1] ?? 0), 0);
  const restanti: number[] = [];
  for (let m = 1; m <= 12; m++) if (!mesiFatti.includes(m)) restanti.push(m);
  if (restanti.length === 0) {
    return { ...NIENTE, ok: true, motivo: "Anno completo: non manca niente da prevedere.", fatto, totale: fatto };
  }

  // Base dell'anno prima sui mesi che mancano. Se è zero non c'è storia su cui
  // appoggiarsi: meglio dirlo che proiettare una media piatta.
  const baseRestante = restanti.reduce((s, m) => s + (mesePrec[m - 1] ?? 0), 0);
  const mesiBase = restanti.filter((m) => (mesePrec[m - 1] ?? 0) > 0).length;
  if (baseRestante <= 0) {
    return {
      ...NIENTE,
      fatto,
      totale: fatto,
      motivo: "L'anno precedente non ha dati sui mesi che mancano: senza una base non si proietta.",
    };
  }
  if (precFatti <= 0) {
    return {
      ...NIENTE,
      fatto,
      totale: fatto,
      motivo: "L'anno precedente non ha dati sui mesi già fatti: non si può misurare la crescita.",
    };
  }

  const fattore = fatto / precFatti;
  const mesiRestanti = restanti.map((m) => ({
    mese: m,
    annoPrec: mesePrec[m - 1] ?? 0,
    stima: (mesePrec[m - 1] ?? 0) * fattore,
  }));
  const restante = mesiRestanti.reduce((s, r) => s + r.stima, 0);

  return {
    ok: true,
    motivo: "",
    crescitaPct: (fattore - 1) * 100,
    fatto,
    restante,
    totale: fatto + restante,
    mesiRestanti,
    mesiBase,
  };
}
