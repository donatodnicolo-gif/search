// ============================================================
// La tariffa del valet ALLA DATA della consegna
// ------------------------------------------------------------
// Aggiunto il 25/08/2026. Prima `ValetService` aveva una riga sola per coppia
// valet+servizio — la tariffa di oggi — e verificare una paga del 2024 contro
// quella riga voleva dire confrontarla con un listino che allora non esisteva.
//
// Misurato: SERGIO DE ROSA ha oggi «Consegna Standard» a 8,00 €, ma nel 2024
// l'importo ricorrente e' 7,20 € (781 volte) e nel 2025 ancora (916); 8,00
// compare solo nel 2026. Su 26.787 consegne con valet e distanza risultavano
// 4.120 paghe «non spiegate», e **3.260 pagavano semplicemente la tariffa di
// allora**: non erano errori, era storia che non avevamo.
//
// ⚠️ NON si sceglie la tariffa da `Delivery.valetServiceId`. Quel campo punta a
// una RIGA, e la riga e' quella corrente: seguirlo riporta al problema di
// partenza. Si cerca per (valet, servizio, DATA).
// ============================================================

/** Una riga di listino con il suo periodo di validita'. */
export interface TariffaValet {
  id: string;
  salary: number;
  salaryPerItem?: number | null;
  extraKmPrice?: number | null;
  validFrom?: Date | null;
  validTo?: Date | null;
  /** `listino` (documentata) oppure `dedotta` (ricostruita dai pagamenti). */
  origine?: string;
}

/**
 * La tariffa in vigore a una certa data, fra quelle di un valet per un servizio.
 *
 * Regole, nell'ordine:
 *  1. si tengono solo le righe il cui periodo contiene la data (estremi nulli =
 *     aperti);
 *  2. fra quelle, vince la piu' RECENTE per `validFrom` — cosi' una tariffa
 *     nuova che parte oggi non riscrive quelle di ieri;
 *  3. a parita', vince quella di `origine` documentata: una ricostruzione non
 *     deve scavalcare un listino vero.
 *
 * ⚠️ Torna `null` se nessuna riga copre quella data. Il chiamante deve dirlo,
 * non ripiegare in silenzio sulla tariffa di oggi: e' esattamente l'errore che
 * questa funzione esiste per evitare.
 */
export function tariffaAllaData(
  tariffe: TariffaValet[],
  data: Date,
): TariffaValet | null {
  const t = data.getTime();
  const valide = tariffe.filter(
    (x) =>
      (x.validFrom == null || x.validFrom.getTime() <= t) &&
      (x.validTo == null || x.validTo.getTime() >= t),
  );
  if (!valide.length) return null;
  valide.sort((a, b) => {
    const da = a.validFrom?.getTime() ?? Number.NEGATIVE_INFINITY;
    const db = b.validFrom?.getTime() ?? Number.NEGATIVE_INFINITY;
    if (da !== db) return db - da;
    const pa = a.origine === 'dedotta' ? 1 : 0;
    const pb = b.origine === 'dedotta' ? 1 : 0;
    return pa - pb;
  });
  return valide[0];
}

/**
 * La paga urbana: base piu' i chilometri oltre quelli inclusi.
 *
 * ⚠️ Vale quando ritiro e consegna sono nella STESSA citta'. Se sono diverse
 * vale `pagaFuoriCitta`, che e' un'altra formula e non una variante di questa.
 */
export function pagaUrbana(t: TariffaValet, km: number, kmInclusi: number): number {
  return arrotonda(t.salary + (t.extraKmPrice ?? 0) * Math.max(0, km - kmInclusi));
}

/**
 * La paga fuori citta': la tariffa al chilometro del valet su TUTTI i km, senza
 * base e senza soglia.
 *
 * ⚠️ Con `extraOutOfCityPrice = 1` la paga coincide col numero dei chilometri.
 * Non e' un difetto — e' una moltiplicazione per uno, e ci ho creduto per mezza
 * giornata prima di guardare il listino.
 */
export function pagaFuoriCitta(tariffaAlKm: number, km: number): number {
  return arrotonda(tariffaAlKm * km);
}

function arrotonda(n: number): number {
  return Math.round(n * 100) / 100;
}
