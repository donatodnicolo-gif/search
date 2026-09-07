/**
 * Il GIORNO e l'ORA di Roma, in un posto solo (07/09/2026).
 *
 * Le date delle consegne sono salvate come MEZZANOTTE UTC del giorno civile:
 * per confrontarle o mostrarle si parte dal giorno di Roma (non da `new Date()`
 * del server, che su Vercel è UTC) e si formatta in UTC, altrimenti la data
 * slitta di un giorno la sera. Prima ogni modulo si rifaceva il suo
 * `Intl.DateTimeFormat`; le mail al partner (notifica e recap) usano questo.
 */

/** Il giorno civile di Roma (+ scarto in giorni), come mezzanotte UTC, con la chiave AAAA-MM-GG. */
export function giornoRoma(scartoGiorni = 0): { chiave: string; data: Date } {
  const oggi = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const data = new Date(oggi + 'T00:00:00.000Z');
  data.setUTCDate(data.getUTCDate() + scartoGiorni);
  return { chiave: data.toISOString().slice(0, 10), data };
}

/** L'ora di Roma adesso (0-23). */
export function oraRoma(): number {
  const ora = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Rome', hour: '2-digit', hour12: false }).format(new Date());
  return Number(ora) % 24;
}

/** «lunedì 8 settembre 2026» da una data-giorno (mezzanotte UTC). */
export function dataLungaRoma(giorno: Date, conAnno = false): string {
  return new Intl.DateTimeFormat('it-IT', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', ...(conAnno ? { year: 'numeric' } : {}) }).format(giorno);
}

/** «08/09/2026» da una data-giorno (mezzanotte UTC). */
export function dataBreveRoma(giorno: Date): string {
  return new Intl.DateTimeFormat('it-IT', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' }).format(giorno);
}

/** La fascia oraria di una consegna o di un ritiro, a parole: «dalle 10:00 alle 12:00», «orario flessibile», «orario da definire». */
export function fasciaOraria(da: string | null | undefined, a: string | null | undefined, flessibile: boolean | null | undefined): string {
  if (flessibile) return 'orario flessibile';
  if (da && a) return `dalle ${da} alle ${a}`;
  if (da) return `dalle ${da}`;
  if (a) return `entro le ${a}`;
  return 'orario da definire';
}
