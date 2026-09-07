/**
 * ⭐ 06/09/2026 (regola utente): «assegna attributo alle consegne (in orario,
 * in ritardo) per tutti i servizi». La PUNTUALITÀ di una consegna, calcolata
 * dagli stessi tre dati e con la stessa regola delle Statistiche
 * (`statistiche.module.ts`, che la fa in SQL): fascia promessa = giorno della
 * consegna + deliveryTimeFrom/To in ora di Roma; arrivo = `deliveredAt`.
 *
 *  - in orario: tra From − 30′ e To + 10′;
 *  - in ritardo: dopo To + 10′ (minuti oltre la tolleranza);
 *  - in anticipo: prima di From − 30′;
 *  - null: non valutabile (non consegnata, senza orario reale o senza fascia).
 *
 * Non si salva in tabella: è una lettura, e cambiare la tolleranza non deve
 * riscrivere 60.000 righe. Chi la vuole la calcola da qui.
 */
export const TOLLERANZA_RITARDO_MIN = 10;
export const TOLLERANZA_ANTICIPO_MIN = 30;
const CONCLUSE = new Set(['delivered', 'approved', 'delivered_time_to_approve', 'archived']);
const ORA = /^([01]\d|2[0-3]):([0-5]\d)$/;

export type Puntualita = { esito: 'in_orario' | 'in_ritardo' | 'in_anticipo'; minuti: number } | null;

/** L'istante UTC di «giorno + HH:MM» letti in Europe/Rome (ora legale compresa). */
export function istanteRoma(giorno: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const y = giorno.getUTCFullYear(), mo = giorno.getUTCMonth(), d = giorno.getUTCDate();
  // Prova con l'ora come fosse UTC, poi correggi con lo scarto reale di Roma in quel momento.
  const tentativo = new Date(Date.UTC(y, mo, d, h, m));
  const parti = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Rome', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(tentativo);
  const p = Object.fromEntries(parti.map((x) => [x.type, x.value]));
  const comeRoma = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour) % 24, Number(p.minute));
  const scarto = comeRoma - tentativo.getTime();
  return new Date(tentativo.getTime() - scarto);
}

export function puntualitaConsegna(d: {
  status?: string | null;
  date?: Date | string | null;
  deliveryTimeFrom?: string | null;
  deliveryTimeTo?: string | null;
  deliveredAt?: Date | string | null;
}): Puntualita {
  if (!d || !CONCLUSE.has(String(d.status)) || !d.deliveredAt || !d.date) return null;
  const a = String(d.deliveryTimeTo ?? '').trim();
  if (!ORA.test(a)) return null;
  const da = String(d.deliveryTimeFrom ?? '').trim();
  const giorno = new Date(d.date);
  let fine = istanteRoma(giorno, a);
  const inizio = ORA.test(da) ? istanteRoma(giorno, da) : fine;
  if (fine < inizio) fine = new Date(fine.getTime() + 86400000); // fascia notturna
  const arrivo = new Date(d.deliveredAt).getTime();
  const limiteRitardo = fine.getTime() + TOLLERANZA_RITARDO_MIN * 60000;
  const limiteAnticipo = inizio.getTime() - TOLLERANZA_ANTICIPO_MIN * 60000;
  // I minuti si contano dalla FINE della fascia (la tolleranza decide solo l'esito): è lo stesso numero dell'elenco ritardi.
  if (arrivo > limiteRitardo) return { esito: 'in_ritardo', minuti: Math.round((arrivo - fine.getTime()) / 60000) };
  if (arrivo < limiteAnticipo) return { esito: 'in_anticipo', minuti: Math.round((inizio.getTime() - arrivo) / 60000) };
  return { esito: 'in_orario', minuti: 0 };
}
