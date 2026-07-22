// Periodo temporale condiviso (Storico, Dashboard): Oggi / Ieri / Ultimi 7 gg /
// Ultimi 30 gg / Personalizzato (da–a). Le date custom sono ISO YYYY-MM-DD.

export type PeriodoTipo = 'oggi' | 'ieri' | '7g' | '30g' | 'custom';

export interface Periodo {
  tipo: PeriodoTipo;
  da?: string; // YYYY-MM-DD (solo custom)
  a?: string; // YYYY-MM-DD (solo custom)
}

export const PERIODO_DEFAULT: Periodo = { tipo: '30g' };

export const OPZIONI_PERIODO: { tipo: PeriodoTipo; label: string }[] = [
  { tipo: 'oggi', label: 'Oggi' },
  { tipo: 'ieri', label: 'Ieri' },
  { tipo: '7g', label: 'Ultimi 7 giorni' },
  { tipo: '30g', label: 'Ultimi 30 giorni' },
  { tipo: 'custom', label: 'Personalizzato' },
];

const GG = 24 * 60 * 60 * 1000;
const inizioGiorno = (ms: number) => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
const fineGiorno = (ms: number) => {
  const d = new Date(ms);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
};
const daISO = (s?: string) => {
  if (!s) return NaN;
  const t = new Date(`${s}T00:00:00`).getTime();
  return Number.isFinite(t) ? t : NaN;
};

/** Intervallo [da, a] in millisecondi corrispondente al periodo. */
export function intervalloPeriodo(p: Periodo): { da: number; a: number } {
  const now = Date.now();
  switch (p.tipo) {
    case 'oggi':
      return { da: inizioGiorno(now), a: fineGiorno(now) };
    case 'ieri':
      return { da: inizioGiorno(now - GG), a: fineGiorno(now - GG) };
    case '7g':
      return { da: inizioGiorno(now - 6 * GG), a: fineGiorno(now) };
    case '30g':
      return { da: inizioGiorno(now - 29 * GG), a: fineGiorno(now) };
    case 'custom': {
      const d = daISO(p.da);
      const a = daISO(p.a);
      return {
        da: Number.isFinite(d) ? inizioGiorno(d) : 0,
        a: Number.isFinite(a) ? fineGiorno(a) : now,
      };
    }
  }
}

/** La data (ISO) rientra nel periodo? Le date non valide passano sempre. */
export function inPeriodo(dataISO: string, p: Periodo): boolean {
  const t = new Date(dataISO).getTime();
  if (!Number.isFinite(t)) return true;
  const { da, a } = intervalloPeriodo(p);
  return t >= da && t <= a;
}

export function labelPeriodo(p: Periodo): string {
  if (p.tipo === 'custom') return p.da || p.a ? `${p.da ?? '…'} → ${p.a ?? '…'}` : 'Personalizzato';
  return OPZIONI_PERIODO.find((o) => o.tipo === p.tipo)?.label ?? '';
}
