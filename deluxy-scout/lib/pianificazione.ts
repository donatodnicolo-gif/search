// Pianificazione settimanale — funzioni pure (testabili) per date e filtri.
// Le query vivono in lib/db.ts; qui solo la logica: lunedì della settimana,
// giorno 1..7, quali attività cadono in un giorno (fisse + ricorrenti).
import type { PianoAttivita } from '@/types';

export const GIORNI_SETTIMANA = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
export const GIORNI_BREVI = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

const pad = (n: number) => String(n).padStart(2, '0');

/** Data locale → YYYY-MM-DD (senza il salto di fuso di toISOString). */
export function isoLocale(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** YYYY-MM-DD → Date locale a mezzanotte. */
export function daIso(iso: string): Date {
  const [a, m, g] = iso.split('-').map(Number);
  return new Date(a, m - 1, g);
}

/** Giorno della settimana 1 (lunedì) … 7 (domenica) di una data. */
export function giornoSettimanaDi(d: Date | string): number {
  const dd = typeof d === 'string' ? daIso(d) : d;
  const js = dd.getDay(); // 0 = domenica
  return js === 0 ? 7 : js;
}

/** Il lunedì (YYYY-MM-DD) della settimana che contiene la data. */
export function lunediDi(d: Date | string): string {
  const dd = typeof d === 'string' ? daIso(d) : new Date(d);
  const delta = giornoSettimanaDi(dd) - 1;
  const lun = new Date(dd.getFullYear(), dd.getMonth(), dd.getDate() - delta);
  return isoLocale(lun);
}

/** Lunedì della settimana spostata di N settimane. */
export function spostaSettimana(lunediIso: string, n: number): string {
  const d = daIso(lunediIso);
  d.setDate(d.getDate() + n * 7);
  return isoLocale(d);
}

/** Data (YYYY-MM-DD) del giorno 1..7 nella settimana che inizia a `lunediIso`. */
export function dataDelGiorno(lunediIso: string, giorno: number): string {
  const d = daIso(lunediIso);
  d.setDate(d.getDate() + (giorno - 1));
  return isoLocale(d);
}

/** Etichetta leggibile di una settimana: "7 – 13 set 2026". */
export function etichettaSettimana(lunediIso: string): string {
  const a = daIso(lunediIso);
  const b = daIso(dataDelGiorno(lunediIso, 7));
  const meseA = MESI[a.getMonth()];
  const meseB = MESI[b.getMonth()];
  if (meseA === meseB) return `${a.getDate()} – ${b.getDate()} ${meseB} ${b.getFullYear()}`;
  return `${a.getDate()} ${meseA} – ${b.getDate()} ${meseB} ${b.getFullYear()}`;
}

/**
 * Attività che cadono in un giorno della settimana scelta: quelle fissate su
 * quella settimana + quelle ricorrenti (settimana = null). Ordinate per `ordine`,
 * poi per creazione. Le fisse vengono prima delle ricorrenti a parità di ordine.
 */
export function attivitaDelGiorno(rows: PianoAttivita[], lunediIso: string, giorno: number): PianoAttivita[] {
  return rows
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
export function pianoDelGiorno(rows: PianoAttivita[], dataIso: string): PianoAttivita[] {
  return attivitaDelGiorno(rows, lunediDi(dataIso), giornoSettimanaDi(dataIso));
}

/** Normalizza l'elenco strade digitato: una per riga/virgola, senza doppioni né vuoti. */
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

/** URL Google Maps che cerca una strada (per aprirla dal piano del giorno). */
export function urlStrada(strada: string, citta = 'Milano'): string {
  const q = encodeURIComponent(`${strada}, ${citta}`);
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}
