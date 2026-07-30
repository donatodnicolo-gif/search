// PREVENTIVI FORNITORI — i prezzi che chiediamo per un lavoro specifico.
//
// Il cliente chiede qualcosa fuori standard; noi chiediamo il prezzo a due o tre
// fornitori e scegliamo. Finora quei numeri stavano su WhatsApp e nella memoria
// di chi li aveva chiesti: dopo una settimana nessuno sapeva più chi avesse
// offerto cosa, e la richiesta si rifaceva da capo.
//
// **Il lavoro è uno, i preventivi sono tanti**: è la separazione che permette di
// confrontarli, che è la ragione per cui si chiedono.
import { supabase } from '@/lib/supabase';

export type StatoLavoro = 'aperto' | 'chiuso' | 'annullato';
export type StatoPreventivo = 'richiesto' | 'ricevuto' | 'scelto' | 'scartato';

export const LABEL_STATO_LAVORO: Record<StatoLavoro, string> = {
  aperto: 'Aperto',
  chiuso: 'Chiuso',
  annullato: 'Annullato',
};

export const LABEL_STATO_PREVENTIVO: Record<StatoPreventivo, string> = {
  richiesto: 'In attesa',
  ricevuto: 'Ricevuto',
  scelto: 'Scelto',
  scartato: 'Scartato',
};

export interface Lavoro {
  id: string;
  titolo: string;
  descrizione: string | null;
  place_id: string | null;
  deal_id: string | null;
  linea: string | null;
  serve_entro: string | null;
  stato: StatoLavoro;
  note: string | null;
  created_at: string;
  /** Nome del negozio che l'ha chiesto (dalla join). */
  place_nome?: string | null;
}

export interface Preventivo {
  id: string;
  lavoro_id: string;
  fornitore: string;
  fornitore_place_id: string | null;
  /** NULL = chiesto ma non ancora risposto. Non è zero: è «non lo sappiamo». */
  importo: number | null;
  tempi: string | null;
  valido_fino: string | null;
  note: string | null;
  allegato_url: string | null;
  stato: StatoPreventivo;
  created_at: string;
}

/** Un lavoro con i suoi preventivi: è come si guarda, sempre. */
export interface LavoroConPreventivi extends Lavoro {
  preventivi: Preventivo[];
}

export async function fetchLavori(): Promise<LavoroConPreventivi[]> {
  const { data, error } = await supabase
    .from('lavori')
    .select('*, places(nome), preventivi(*)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    ...r,
    place_nome: r.places?.nome ?? null,
    // I preventivi arrivano nell'ordine che vuole il database: qui si mettono
    // dal più vecchio al più nuovo, che è l'ordine in cui sono stati chiesti.
    preventivi: ((r.preventivi ?? []) as Preventivo[]).sort((a, b) => a.created_at.localeCompare(b.created_at)),
  })) as LavoroConPreventivi[];
}

export async function creaLavoro(l: {
  titolo: string;
  descrizione?: string | null;
  placeId?: string | null;
  linea?: string | null;
  serveEntro?: string | null;
}): Promise<Lavoro> {
  const { data, error } = await supabase
    .from('lavori')
    .insert({
      titolo: l.titolo.trim(),
      descrizione: l.descrizione?.trim() || null,
      place_id: l.placeId || null,
      linea: l.linea || null,
      serve_entro: l.serveEntro || null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as Lavoro;
}

export async function aggiornaLavoro(id: string, patch: Partial<Pick<Lavoro, 'stato' | 'note' | 'serve_entro'>>): Promise<void> {
  const { error } = await supabase.from('lavori').update(patch).eq('id', id);
  if (error) throw error;
}

export async function eliminaLavoro(id: string): Promise<void> {
  const { error } = await supabase.from('lavori').delete().eq('id', id);
  if (error) throw error;
}

export async function aggiungiPreventivo(p: {
  lavoroId: string;
  fornitore: string;
  fornitorePlaceId?: string | null;
  importo?: number | null;
  tempi?: string | null;
  note?: string | null;
}): Promise<void> {
  const { error } = await supabase.from('preventivi').insert({
    lavoro_id: p.lavoroId,
    fornitore: p.fornitore.trim(),
    fornitore_place_id: p.fornitorePlaceId || null,
    importo: p.importo ?? null,
    tempi: p.tempi?.trim() || null,
    note: p.note?.trim() || null,
    // Con un prezzo dentro il preventivo è già arrivato; senza, lo stiamo
    // ancora aspettando. Lo stato si deduce, non si chiede.
    stato: p.importo != null ? 'ricevuto' : 'richiesto',
  });
  if (error) throw error;
}

export async function aggiornaPreventivo(
  id: string,
  patch: Partial<Pick<Preventivo, 'importo' | 'tempi' | 'note' | 'valido_fino' | 'allegato_url' | 'stato'>>,
): Promise<void> {
  const { error } = await supabase.from('preventivi').update(patch).eq('id', id);
  if (error) throw error;
}

export async function eliminaPreventivo(id: string): Promise<void> {
  const { error } = await supabase.from('preventivi').delete().eq('id', id);
  if (error) throw error;
}

/**
 * Sceglie un fornitore per il lavoro.
 *
 * ⚠️ Prima si toglie lo «scelto» agli altri, poi si mette a questo: l'indice
 * unico parziale (`preventivi_scelto_uix`) permette **un solo** scelto per
 * lavoro, quindi facendolo al contrario la scrittura verrebbe rifiutata e
 * l'utente vedrebbe un errore di database al posto di un cambio di scelta.
 */
export async function scegliPreventivo(lavoroId: string, preventivoId: string): Promise<void> {
  const { error: e1 } = await supabase
    .from('preventivi')
    .update({ stato: 'scartato' })
    .eq('lavoro_id', lavoroId)
    .eq('stato', 'scelto')
    .neq('id', preventivoId);
  if (e1) throw e1;
  const { error: e2 } = await supabase.from('preventivi').update({ stato: 'scelto' }).eq('id', preventivoId);
  if (e2) throw e2;
}

/**
 * Il confronto, in numeri: il più basso fra quelli **arrivati** e quanto ci
 * distano gli altri. I preventivi senza importo non entrano nel conto — non
 * sono «gratis», semplicemente non sono ancora arrivati.
 */
export function confronto(preventivi: Preventivo[]): {
  minimo: number | null;
  massimo: number | null;
  inAttesa: number;
} {
  const importi = preventivi
    .filter((p) => p.stato !== 'scartato' && p.importo != null)
    .map((p) => Number(p.importo));
  return {
    minimo: importi.length ? Math.min(...importi) : null,
    massimo: importi.length ? Math.max(...importi) : null,
    inAttesa: preventivi.filter((p) => p.importo == null && p.stato === 'richiesto').length,
  };
}
