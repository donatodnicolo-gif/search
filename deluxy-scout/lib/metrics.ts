// Calcolo metriche dashboard a partire dai dati grezzi (visits, deals, places).
import type { Deal, Place, Profilo, Visit } from '@/types';
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

export function chiusePerse<T extends Deal>(deals: T[]): T[] {
  return deals.filter((d) => d.fase === 'closedlost');
}

// ── Dashboard di Team (admin): chi ha fatto cosa ────────────────────────────

export interface StatVenditore {
  ownerId: string | null;
  nome: string;
  visite: number;
  visite7: number; // ultimi 7 giorni
  ultimaData: string | null;
  ultimoAccesso: string | null; // ultimo login all'app (per chi non ha visite)
  interessati: number;
  daRichiamare: number;
  dealAperti: number;
  dealVinti: number;
}

/** Nome visualizzato per un owner: profilo (nome→email) o ripiego leggibile. */
export function nomeVenditore(ownerId: string | null, profili: Map<string, Profilo>): string {
  if (!ownerId) return 'Non attribuito';
  const p = profili.get(ownerId);
  if (p?.nome?.trim()) return p.nome.trim();
  if (p?.email?.trim()) return p.email.split('@')[0];
  return `Utente ${ownerId.slice(0, 6)}`;
}

/**
 * Rollup per venditore: volume visite (totale + ultimi 7 giorni), ultima
 * attività, esiti caldi (interessati / da richiamare) e deal aperti/vinti.
 * Ordinato per visite negli ultimi 7 giorni (poi totale), così l'admin vede
 * subito chi è attivo ora.
 */
export function attivitaPerVenditore(
  visits: Visit[],
  deals: Deal[],
  profili: Profilo[],
  oggi: Date = new Date(),
): StatVenditore[] {
  const mappaProfili = new Map(profili.map((p) => [p.id, p]));
  const soglia7 = oggi.getTime() - 7 * 86400000;
  const acc = new Map<string, StatVenditore>();

  const chiave = (id: string | null) => id ?? '∅';
  const assicura = (id: string | null): StatVenditore => {
    const k = chiave(id);
    let s = acc.get(k);
    if (!s) {
      s = {
        ownerId: id,
        nome: nomeVenditore(id, mappaProfili),
        visite: 0,
        visite7: 0,
        ultimaData: null,
        ultimoAccesso: id ? (mappaProfili.get(id)?.ultimo_accesso ?? null) : null,
        interessati: 0,
        daRichiamare: 0,
        dealAperti: 0,
        dealVinti: 0,
      };
      acc.set(k, s);
    }
    return s;
  };

  // Includi OGNI venditore noto (anche a 0 attività), così è visibile e selezionabile.
  for (const p of profili) assicura(p.id);

  for (const v of visits) {
    const s = assicura(v.owner);
    s.visite += 1;
    if (new Date(v.data).getTime() >= soglia7) s.visite7 += 1;
    if (!s.ultimaData || v.data > s.ultimaData) s.ultimaData = v.data;
    if (v.esito === 'interessato') s.interessati += 1;
    if (v.esito === 'da_richiamare') s.daRichiamare += 1;
  }

  for (const d of deals) {
    const s = assicura(d.owner);
    if (d.fase === 'closedwon') s.dealVinti += 1;
    else if (d.fase !== 'closedlost') s.dealAperti += 1;
  }

  return Array.from(acc.values()).sort((a, b) => b.visite7 - a.visite7 || b.visite - a.visite);
}

export interface GiornoAttivita {
  giorno: string; // 'YYYY-MM-DD'
  visite: Visit[];
  totale: number;
  interessati: number;
  daRichiamare: number;
  nonTarget: number;
  chiusi: number;
  contatti: number; // visite in cui è stato aggiunto un contatto (heuristica: esito interessato/chiuso)
}

/**
 * Attività di UN venditore, raggruppata per giorno (più recente in cima), con
 * le KPI del giorno. Il giorno è la parte data dell'ISO (UTC): sufficiente per
 * la reportistica quotidiana. Le visite del giorno sono ordinate dalla più
 * recente. Passa ownerId=null per le visite non attribuite.
 */
export function attivitaPerGiorno(visits: Visit[], ownerId: string | null): GiornoAttivita[] {
  const mie = visits.filter((v) => (v.owner ?? null) === ownerId);
  const perGiorno = new Map<string, Visit[]>();
  for (const v of mie) {
    const g = v.data.slice(0, 10);
    const lista = perGiorno.get(g) ?? [];
    lista.push(v);
    perGiorno.set(g, lista);
  }
  return Array.from(perGiorno.entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([giorno, vs]) => {
      const ordinate = [...vs].sort((a, b) => (a.data < b.data ? 1 : -1));
      return {
        giorno,
        visite: ordinate,
        totale: vs.length,
        interessati: vs.filter((v) => v.esito === 'interessato').length,
        daRichiamare: vs.filter((v) => v.esito === 'da_richiamare').length,
        nonTarget: vs.filter((v) => v.esito === 'non_target').length,
        chiusi: vs.filter((v) => v.esito === 'chiuso').length,
        contatti: vs.filter((v) => v.esito === 'interessato' || v.esito === 'chiuso').length,
      };
    });
}

// ── Analisi trattative (valori pipeline) ───────────────────────────────────────

export interface ValoreTrattative {
  aperto: number; // valore atteso dei deal ancora aperti
  vinto: number; // valore dei closedwon
  perso: number; // valore dei closedlost
  nAperti: number;
  nVinti: number;
  nPersi: number;
}

/** Somma i valori dei deal per stato (aperto / vinto / perso). */
export function valoreTrattative(deals: Deal[]): ValoreTrattative {
  const r: ValoreTrattative = { aperto: 0, vinto: 0, perso: 0, nAperti: 0, nVinti: 0, nPersi: 0 };
  for (const d of deals) {
    const v = d.valore_atteso ?? 0;
    if (d.fase === 'closedwon') {
      r.vinto += v;
      r.nVinti += 1;
    } else if (d.fase === 'closedlost') {
      r.perso += v;
      r.nPersi += 1;
    } else {
      r.aperto += v;
      r.nAperti += 1;
    }
  }
  return r;
}

/** Tasso di vittoria: vinte / (vinte + perse). */
export function winRate(deals: Deal[]): { pct: number; num: number; den: number } {
  const num = deals.filter((d) => d.fase === 'closedwon').length;
  const den = deals.filter((d) => d.fase === 'closedwon' || d.fase === 'closedlost').length;
  return { pct: den ? Math.round((num / den) * 100) : 0, num, den };
}

/** Numero di deal per fase (per un funnel/istogramma). Ritorna le fasi grezze. */
export function dealPerFase(deals: Deal[]): { fase: Deal['fase']; value: number }[] {
  const ordine: Deal['fase'][] = [
    'appointmentscheduled',
    'decisionmakerboughtin',
    'contractsent',
    'closedwon',
    'closedlost',
  ];
  const conteggio = new Map<string, number>();
  for (const d of deals) conteggio.set(d.fase, (conteggio.get(d.fase) ?? 0) + 1);
  return ordine
    .filter((f) => conteggio.has(f))
    .map((fase) => ({ fase, value: conteggio.get(fase) ?? 0 }));
}

/** Valore ATTESO (deal aperti) sommato per linea. */
export function valorePerLinea(deals: Deal[]): BarDatum[] {
  const aperti = deals.filter((d) => d.fase !== 'closedwon' && d.fase !== 'closedlost');
  const somma = new Map<string, number>();
  for (const d of aperti) {
    const k = d.linea ?? 'n/d';
    somma.set(k, (somma.get(k) ?? 0) + (d.valore_atteso ?? 0));
  }
  return Array.from(somma.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

export function followupAffiliazioni<T extends Deal>(deals: T[]): T[] {
  const linee = ['Affiliazioni', 'Re-seller'];
  return deals.filter(
    (d) => d.linea && linee.includes(d.linea) && d.fase !== 'closedwon' && d.fase !== 'closedlost',
  );
}
