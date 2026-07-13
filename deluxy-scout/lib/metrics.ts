// Calcolo metriche dashboard a partire dai dati grezzi (visits, deals, places).
import type { Deal, Place, Visit } from '@/types';
import type { BarDatum } from '@/components/BarChart';

// Settimana ISO come chiave "YYYY-Www" senza usare API di data proibite in build.
function chiaveSettimana(iso: string): string {
  const d = new Date(iso);
  const anno = d.getUTCFullYear();
  const inizioAnno = Date.UTC(anno, 0, 1);
  const giorni = Math.floor((d.getTime() - inizioAnno) / 86400000);
  const sett = Math.floor(giorni / 7) + 1;
  return `${anno}-W${String(sett).padStart(2, '0')}`;
}

export function visitePerSettimana(visits: Visit[], ultimeN = 6): BarDatum[] {
  const conteggio = new Map<string, number>();
  for (const v of visits) {
    const k = chiaveSettimana(v.data);
    conteggio.set(k, (conteggio.get(k) ?? 0) + 1);
  }
  return Array.from(conteggio.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-ultimeN)
    .map(([label, value]) => ({ label: label.replace(/^\d+-/, ''), value }));
}

export function visitePerVenditore(visits: Visit[]): BarDatum[] {
  const conteggio = new Map<string, number>();
  for (const v of visits) {
    const k = v.owner ? v.owner.slice(0, 6) : 'n/d';
    conteggio.set(k, (conteggio.get(k) ?? 0) + 1);
  }
  return Array.from(conteggio.entries()).map(([label, value]) => ({ label, value }));
}

/** Tasso appuntamento → decisore: quanti deal hanno superato appointmentscheduled. */
export function tassoAvanzamento(deals: Deal[]): { pct: number; num: number; den: number } {
  const oltre: Deal['fase'][] = ['decisionmakerboughtin', 'contractsent', 'closedwon'];
  const den = deals.filter((d) => d.fase !== 'closedlost').length;
  const num = deals.filter((d) => oltre.includes(d.fase)).length;
  return { pct: den ? Math.round((num / den) * 100) : 0, num, den };
}

export function dealApertiPerLinea(deals: Deal[]): BarDatum[] {
  const aperti = deals.filter((d) => d.fase !== 'closedwon' && d.fase !== 'closedlost');
  const conteggio = new Map<string, number>();
  for (const d of aperti) {
    const k = d.linea ?? 'n/d';
    conteggio.set(k, (conteggio.get(k) ?? 0) + 1);
  }
  return Array.from(conteggio.entries()).map(([label, value]) => ({ label, value }));
}

export interface CoperturaZona {
  zona: string;
  visitati: number;
  totali: number;
  pct: number;
}

export function coperturaZone(places: Place[]): CoperturaZona[] {
  const per = new Map<string, { visitati: number; totali: number }>();
  for (const p of places) {
    const z = p.zona ?? 'Senza zona';
    const cur = per.get(z) ?? { visitati: 0, totali: 0 };
    cur.totali += 1;
    if (p.stato !== 'da_visitare') cur.visitati += 1;
    per.set(z, cur);
  }
  return Array.from(per.entries())
    .map(([zona, v]) => ({ zona, ...v, pct: v.totali ? Math.round((v.visitati / v.totali) * 100) : 0 }))
    .sort((a, b) => b.totali - a.totali);
}

export function chiusePerse(deals: Deal[]): Deal[] {
  return deals.filter((d) => d.fase === 'closedlost');
}

export function followupAffiliazioni(deals: Deal[]): Deal[] {
  const linee = ['Affiliazioni', 'Re-seller'];
  return deals.filter(
    (d) => d.linea && linee.includes(d.linea) && d.fase !== 'closedwon' && d.fase !== 'closedlost',
  );
}
