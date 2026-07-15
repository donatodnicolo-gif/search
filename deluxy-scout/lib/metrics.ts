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

/** Visite negli ultimi 7 giorni: il ritmo settimanale conta più del totale storico. */
export function visiteUltimi7Giorni(visits: Visit[], oggi: Date = new Date()): number {
  const soglia = oggi.getTime() - 7 * 86400000;
  return visits.filter((v) => new Date(v.data).getTime() >= soglia).length;
}

export interface Richiamo {
  place: Place;
  visita: Visit;
  giorni: number; // giorni trascorsi dall'ultima visita
  inRitardo: boolean; // oltre la soglia di richiamo per quell'esito
}

// Soglie di richiamo in giorni: il recap all'interessato è urgente,
// il "da richiamare" può attendere fino a una settimana.
const SOGLIA_RICHIAMO: Record<string, number> = { interessato: 3, da_richiamare: 7 };

/**
 * Coda richiami: attività la cui ULTIMA visita ha esito "interessato" o
 * "da richiamare" (e che non sono già chiuse come cliente/perso).
 * Ordinate: prima i ritardi, poi le più vecchie.
 */
export function daRicontattare(places: Place[], visits: Visit[], oggi: Date = new Date()): Richiamo[] {
  const ultime = new Map<string, Visit>();
  for (const v of visits) {
    const cur = ultime.get(v.place_id);
    if (!cur || v.data > cur.data) ultime.set(v.place_id, v);
  }
  const perId = new Map(places.map((p) => [p.id, p]));
  const out: Richiamo[] = [];
  for (const [placeId, v] of ultime) {
    if (v.esito !== 'interessato' && v.esito !== 'da_richiamare') continue;
    const place = perId.get(placeId);
    if (!place || place.stato === 'cliente' || place.stato === 'perso') continue;
    const giorni = Math.floor((oggi.getTime() - new Date(v.data).getTime()) / 86400000);
    out.push({ place, visita: v, giorni, inRitardo: giorni > SOGLIA_RICHIAMO[v.esito] });
  }
  return out.sort((a, b) => Number(b.inRitardo) - Number(a.inRitardo) || b.giorni - a.giorni);
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
