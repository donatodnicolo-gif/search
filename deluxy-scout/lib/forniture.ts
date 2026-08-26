// FORNITURE — cosa sa fare un fornitore, e a quali condizioni (migr. 0074).
//
// Accanto ai Preventivi, e non dentro, perché rispondono a due domande diverse:
// il preventivo è il prezzo di UN lavoro chiesto oggi; la fornitura è quello
// che quel fornitore fa SEMPRE — listino, tempi, minimi, zona. È la memoria
// che oggi sta nella testa di chi ha telefonato l'ultima volta.
import { supabase } from '@/lib/supabase';

export interface Fornitura {
  id: string;
  owner: string | null;
  fornitore: string;
  fornitore_anagrafiche_id: string | null;
  fornitore_place_id: string | null;
  titolo: string;
  descrizione: string | null;
  linea: string | null;
  /** Riferimento, non impegno: vuoto = non lo sappiamo (mai zero). */
  prezzo: number | null;
  prezzo_note: string | null;
  tempi: string | null;
  minimo_ordine: string | null;
  zona: string | null;
  allegato_url: string | null;
  note: string | null;
  attiva: boolean;
  created_at: string;
  updated_at: string;
}

export async function fetchForniture(): Promise<Fornitura[]> {
  const { data, error } = await supabase
    .from('forniture')
    .select('*')
    .order('fornitore')
    .order('titolo');
  if (error) throw error;
  return (data ?? []) as Fornitura[];
}

export async function creaFornitura(f: {
  fornitore: string;
  titolo: string;
  descrizione?: string | null;
  linea?: string | null;
  prezzo?: number | null;
  prezzoNote?: string | null;
  tempi?: string | null;
  minimoOrdine?: string | null;
  zona?: string | null;
  allegatoUrl?: string | null;
  note?: string | null;
  fornitoreAnagraficheId?: string | null;
  fornitorePlaceId?: string | null;
}): Promise<Fornitura> {
  const { data: u } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('forniture')
    .insert({
      owner: u.user?.id ?? null,
      fornitore: f.fornitore.trim(),
      titolo: f.titolo.trim(),
      descrizione: f.descrizione?.trim() || null,
      linea: f.linea || null,
      prezzo: f.prezzo ?? null,
      prezzo_note: f.prezzoNote?.trim() || null,
      tempi: f.tempi?.trim() || null,
      minimo_ordine: f.minimoOrdine?.trim() || null,
      zona: f.zona?.trim() || null,
      allegato_url: f.allegatoUrl?.trim() || null,
      note: f.note?.trim() || null,
      fornitore_anagrafiche_id: f.fornitoreAnagraficheId || null,
      fornitore_place_id: f.fornitorePlaceId || null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as Fornitura;
}

export async function aggiornaFornitura(
  id: string,
  patch: Partial<Pick<Fornitura, 'titolo' | 'descrizione' | 'linea' | 'prezzo' | 'prezzo_note' | 'tempi' | 'minimo_ordine' | 'zona' | 'allegato_url' | 'note' | 'attiva'>>,
): Promise<void> {
  const { data, error } = await supabase.from('forniture').update(patch).eq('id', id).select('id');
  if (error) throw error;
  // Una UPDATE fermata dalla RLS non è un errore: torna zero righe. Senza
  // questo controllo la schermata direbbe «fatto» su una modifica mai avvenuta.
  if (!data?.length) throw new Error('Fornitura non aggiornata: la scrittura è stata rifiutata.');
}

export async function eliminaFornitura(id: string): Promise<void> {
  const { data, error } = await supabase.from('forniture').delete().eq('id', id).select('id');
  if (error) throw error;
  if (!data?.length) throw new Error('Fornitura non eliminata: la cancellazione è stata rifiutata.');
}
