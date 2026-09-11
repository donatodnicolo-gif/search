// QUANTO FATTURA UNA PROVINCIA (11/09/2026, richiesta dell'utente: nella
// tabella dei Selezionati, sulle Segnalazioni CS, «il fatturato che genera
// quella provincia che puoi prendere da /affiliazioni»).
//
// ⚠️ Qui sta solo la parte PURA — la somma per sigla e la forma del numero —
// così si prova con i test senza tirarsi dietro Supabase. La lettura vera
// (`fetchFatturatoProvince`) sta in `lib/ordini.ts`, che è la casa del venduto.
import { siglaProvincia } from '@/lib/province';

export interface FatturatoProvince {
  /** sigla di targa → lordo venduto in quella provincia. */
  perSigla: Map<string, number>;
  /** Quando è stata calcolata la vista salvata (null = calcolo dal vivo). */
  aggiornatoIl: string | null;
  /** false = Orders non è collegato: nessun numero, e va detto. */
  collegato: boolean;
  /** Il venduto degli ordini il cui indirizzo non ha la provincia. */
  senzaProvincia: number;
}

/** Somma il venduto per sigla, scartando ciò che non è una provincia italiana. */
export function sommaPerSigla(province: { provincia: string; lordo: number }[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const v of province) {
    const sigla = siglaProvincia(v.provincia);
    if (!sigla) continue; // valori esteri («ENG»): non sono province italiane
    m.set(sigla, (m.get(sigla) ?? 0) + (v.lordo ?? 0));
  }
  return m;
}

/**
 * «856k €», «12k €», «922 €»: la stessa forma della scheda Copertura, così lo
 * stesso numero si legge uguale nelle due schermate.
 * ⚠️ Il punto delle migliaia scritto a mano: `toLocaleString('it-IT')` non lo
 * mette sui runtime senza ICU completo (lezione di `euroTondo`).
 */
export function euroBreve(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return '—';
  if (n < 1000) return `${Math.round(n)} €`;
  const k = Math.round(n / 1000);
  return `${String(k).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}k €`;
}
