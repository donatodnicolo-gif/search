// Trattative — regole pure (testabili): l'ordine dell'elenco per priorità,
// quando la chiusura vuole il suo motivo, la chiave degli allegati.
//
// ⭐ 07/09/2026, richieste dell'utente (fatte da un altro account e rifatte
// qui): «priorità P0–P3 sulle trattative, elenco ordinato per priorità»;
// «alla chiusura vinta o persa il motivo è obbligatorio».
import { FASI_CHIUSE, type Deal, type DealStage, type PrioritaDeal } from '@/types';

const RANGO: Record<PrioritaDeal, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };

/** Priorità effettiva: le righe senza (HubSpot, registro, pre-0120) valgono P2. */
export function prioritaDi(d: Pick<Deal, 'priorita'>): PrioritaDeal {
  return d.priorita && RANGO[d.priorita] != null ? d.priorita : 'P2';
}

/** Rango numerico (0 = P0, la più importante): serve alle tabelle ordinabili. */
export function rangoPriorita(d: Pick<Deal, 'priorita'>): number {
  return RANGO[prioritaDi(d)];
}

type Ordinabile = Pick<Deal, 'priorita' | 'scadenza' | 'valore_atteso' | 'fase'> & {
  place_nome?: string | null;
  created_at?: string | null;
};

/**
 * L'ordine dell'elenco: prima per priorità (P0 → P3); a parità le CHIUSE in
 * fondo (sono storia, non lavoro); poi la scadenza più vicina (chi non ne ha
 * va dopo chi ce l'ha); poi la più RECENTE (era il default dal 26/08: «voglio
 * vedere l'ultima che ho aperto»); poi il valore più alto; infine il nome.
 *
 * ⚠️ Con tutte le righe a P2 — com'è il giorno della migrazione — l'ordine è
 * quello di prima, dal secondo criterio in poi: la priorità si fa sentire
 * solo dove qualcuno l'ha messa.
 */
export function ordinaTrattative<T extends Ordinabile>(righe: T[]): T[] {
  return [...righe].sort((a, b) => {
    const p = rangoPriorita(a) - rangoPriorita(b);
    if (p !== 0) return p;
    const ca = FASI_CHIUSE.includes(a.fase) ? 1 : 0;
    const cb = FASI_CHIUSE.includes(b.fase) ? 1 : 0;
    if (ca !== cb) return ca - cb;
    if ((a.scadenza ?? null) !== (b.scadenza ?? null)) {
      if (!a.scadenza) return 1;
      if (!b.scadenza) return -1;
      return a.scadenza.localeCompare(b.scadenza);
    }
    const ra = a.created_at ?? '';
    const rb = b.created_at ?? '';
    if (ra !== rb) return rb.localeCompare(ra);
    const v = (b.valore_atteso ?? 0) - (a.valore_atteso ?? 0);
    if (v !== 0) return v;
    return (a.place_nome ?? '').localeCompare(b.place_nome ?? '');
  });
}

/** La priorità più alta fra le righe di un gruppo (per ordinare i gruppi-negozio). */
export function prioritaMassima(righe: Pick<Deal, 'priorita'>[]): PrioritaDeal {
  let min: PrioritaDeal = 'P3';
  for (const r of righe) {
    const p = prioritaDi(r);
    if (RANGO[p] < RANGO[min]) min = p;
  }
  return righe.length ? min : 'P2';
}

/**
 * Il motivo serve quando la trattativa PASSA a una fase chiusa (vinta o
 * persa). Non si richiede a chi la risalva già chiusa nella stessa fase — ma
 * si richiede a chi la sposta da vinta a persa, perché quella è una chiusura
 * nuova con un perché nuovo.
 */
export function richiedeMotivoChiusura(
  fasePrecedente: DealStage | null | undefined,
  nuovaFase: DealStage,
): boolean {
  if (!FASI_CHIUSE.includes(nuovaFase)) return false;
  return fasePrecedente !== nuovaFase;
}

/** La chiave di una trattativa per gli allegati: uuid Scout oppure `hs_<id>`. */
export function chiaveTrattativa(d: { id: string; hubspot_deal_id?: string | null; origine?: string }): string {
  if (d.origine === 'hubspot' && d.hubspot_deal_id) return `hs_${d.hubspot_deal_id}`;
  return d.id;
}

/** Un link che si può aprire: solo http(s), niente `javascript:` e simili. */
export function linkApribile(url: string | null | undefined): boolean {
  if (!url) return false;
  return /^https?:\/\/\S+$/i.test(url.trim());
}

/** Normalizza un link scritto a mano: aggiunge https:// se manca lo schema. */
export function normalizzaLink(url: string): string | null {
  const s = url.trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  if (/^[a-z0-9.-]+\.[a-z]{2,}(\/\S*)?$/i.test(s)) return `https://${s}`;
  return s;
}
