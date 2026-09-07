// Trattative — regole pure (testabili): ordinamento per priorità e quando serve
// il motivo di chiusura.
import { FASI_CHIUSE, type Deal, type DealStage, type PrioritaDeal } from '@/types';

const RANGO: Record<PrioritaDeal, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };

/** Priorità effettiva di una trattativa (le righe senza valore contano come P2). */
export function prioritaDi(d: Pick<Deal, 'priorita'>): PrioritaDeal {
  return d.priorita && RANGO[d.priorita] != null ? d.priorita : 'P2';
}

/** Rango numerico (0 = P0, la più importante). */
export function rangoPriorita(d: Pick<Deal, 'priorita'>): number {
  return RANGO[prioritaDi(d)];
}

type Ordinabile = Pick<Deal, 'priorita' | 'scadenza' | 'valore_atteso' | 'fase'> & { place_nome?: string | null };

/**
 * Ordina le trattative: prima per priorità (P0 → P3), poi scadenza più vicina,
 * poi valore più alto, infine nome del negozio. Le chiuse vanno in fondo a
 * parità di priorità (sono storia, non lavoro da fare).
 */
export function ordinaTrattative<T extends Ordinabile>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const p = rangoPriorita(a) - rangoPriorita(b);
    if (p !== 0) return p;
    const ca = FASI_CHIUSE.includes(a.fase) ? 1 : 0;
    const cb = FASI_CHIUSE.includes(b.fase) ? 1 : 0;
    if (ca !== cb) return ca - cb;
    if (a.scadenza !== b.scadenza) {
      if (!a.scadenza) return 1;
      if (!b.scadenza) return -1;
      return a.scadenza.localeCompare(b.scadenza);
    }
    const v = (b.valore_atteso ?? 0) - (a.valore_atteso ?? 0);
    if (v !== 0) return v;
    return (a.place_nome ?? '').localeCompare(b.place_nome ?? '');
  });
}

/**
 * Serve il pop-up del motivo quando la trattativa PASSA a una fase chiusa
 * (vinta o persa). Non si richiede se era già chiusa nella stessa fase.
 */
export function richiedeMotivoChiusura(fasePrecedente: DealStage | null | undefined, nuovaFase: DealStage): boolean {
  if (!FASI_CHIUSE.includes(nuovaFase)) return false;
  return fasePrecedente !== nuovaFase;
}

/** Chiave di una trattativa per gli allegati: uuid Scout oppure `hs_<id>`. */
export function chiaveTrattativa(d: { id: string; hubspot_deal_id?: string | null; origine?: string }): string {
  if (d.origine === 'hubspot' && d.hubspot_deal_id) return `hs_${d.hubspot_deal_id}`;
  return d.id;
}
