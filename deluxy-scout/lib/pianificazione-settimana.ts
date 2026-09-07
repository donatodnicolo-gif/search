// L'agenda settimanale del commerciale — funzioni pure (testabili).
// Le query stanno in lib/db.ts; qui solo la logica: lunedì della settimana,
// giorno 1..7, quali attività cadono in un giorno (fisse + ricorrenti), le
// strade normalizzate, il link a Google Maps.
//
// ⭐ 07/09/2026, richiesta dell'utente (da un altro account, rifatta qui):
// «pianificazione settimanale: attività per giorno, anche su più giorni, per
// settimana o ricorrenti; per le visite le strade da battere (tap → Maps);
// in Oggi la sezione Piano di oggi».
//
// ⚠️ Tutte le date in ora LOCALE (lib/giorni.ts): la sera in Italia l'UTC
// direbbe «ieri» ([[trappola-periodi-fuso-server]]).
import type { PianoGiorno } from '@/types';
import { isoLocale } from '@/lib/giorni';

export const GIORNI_SETTIMANA = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
export const GIORNI_BREVI = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

/** YYYY-MM-DD → Date locale a mezzanotte. */
export function daIso(iso: string): Date {
  const [a, m, g] = iso.split('-').map(Number);
  return new Date(a, m - 1, g);
}

/** Giorno della settimana 1 (lunedì) … 7 (domenica). */
export function giornoSettimanaDi(d: Date | string): number {
  const dd = typeof d === 'string' ? daIso(d) : d;
  const js = dd.getDay(); // 0 = domenica
  return js === 0 ? 7 : js;
}

/** Il lunedì (YYYY-MM-DD) della settimana che contiene la data. */
export function lunediDi(d: Date | string): string {
  const dd = typeof d === 'string' ? daIso(d) : new Date(d);
  const delta = giornoSettimanaDi(dd) - 1;
  return isoLocale(new Date(dd.getFullYear(), dd.getMonth(), dd.getDate() - delta));
}

/** Il lunedì spostato di N settimane. */
export function spostaSettimana(lunediIso: string, n: number): string {
  const d = daIso(lunediIso);
  d.setDate(d.getDate() + n * 7);
  return isoLocale(d);
}

/** La data (YYYY-MM-DD) del giorno 1..7 nella settimana che inizia a `lunediIso`. */
export function dataDelGiorno(lunediIso: string, giorno: number): string {
  const d = daIso(lunediIso);
  d.setDate(d.getDate() + (giorno - 1));
  return isoLocale(d);
}

/** «7 – 13 set 2026», o «28 set – 4 ott 2026» a cavallo di due mesi. */
export function etichettaSettimana(lunediIso: string): string {
  const a = daIso(lunediIso);
  const b = daIso(dataDelGiorno(lunediIso, 7));
  if (a.getMonth() === b.getMonth()) return `${a.getDate()} – ${b.getDate()} ${MESI[b.getMonth()]} ${b.getFullYear()}`;
  return `${a.getDate()} ${MESI[a.getMonth()]} – ${b.getDate()} ${MESI[b.getMonth()]} ${b.getFullYear()}`;
}

/**
 * Le attività di un giorno della settimana scelta: quelle fissate su QUELLA
 * settimana più le ricorrenti. Ordinate per `ordine`, poi le fisse prima
 * delle ricorrenti, poi per creazione.
 */
export function attivitaDelGiorno(righe: PianoGiorno[], lunediIso: string, giorno: number): PianoGiorno[] {
  return righe
    .filter((r) => r.giorno_settimana === giorno && (r.settimana == null || r.settimana === lunediIso))
    .sort((x, y) => {
      if (x.ordine !== y.ordine) return x.ordine - y.ordine;
      const fx = x.settimana ? 0 : 1;
      const fy = y.settimana ? 0 : 1;
      if (fx !== fy) return fx - fy;
      return x.created_at.localeCompare(y.created_at);
    });
}

/** Il piano di una data precisa (es. oggi): stesso criterio di `attivitaDelGiorno`. */
export function pianoDelGiorno(righe: PianoGiorno[], dataIso: string): PianoGiorno[] {
  return attivitaDelGiorno(righe, lunediDi(dataIso), giornoSettimanaDi(dataIso));
}

/** Le strade scritte a mano: una per riga o virgola, senza doppioni né vuoti. */
export function normalizzaStrade(input: string | string[]): string[] {
  const parti = Array.isArray(input) ? input : input.split(/[\n,;]+/);
  const viste = new Set<string>();
  const out: string[] = [];
  for (const p of parti) {
    const s = p.trim().replace(/\s+/g, ' ');
    if (!s) continue;
    const k = s.toLowerCase();
    if (viste.has(k)) continue;
    viste.add(k);
    out.push(s);
  }
  return out;
}

/** Google Maps su una strada (con la città, o «via Torino» finisce a Torino). */
export function urlStrada(strada: string, citta?: string | null): string {
  const q = encodeURIComponent(`${strada}, ${citta?.trim() || 'Milano'}`);
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}
