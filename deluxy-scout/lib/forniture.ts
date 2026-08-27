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

/**
 * IL PONTE DAL PREVENTIVO AL LISTINO (27/08/2026, «sistema il buco»).
 *
 * Il buco, detto dall'utente in una domanda: «i preventivi che inserisco qua
 * finiscono in forniture?». No — e non era un difetto di codice, era una cosa
 * che non c'era. Un preventivo è il prezzo di UN lavoro; una fornitura è quello
 * che un fornitore fa SEMPRE. Ma un prezzo ricevuto è, di fatto, la prova
 * migliore di che cosa quel fornitore fa e a quanto: lasciarlo attaccato a un
 * solo ordine vuol dire ricominciare da capo la volta dopo — che è esattamente
 * il problema che le Forniture erano nate per risolvere.
 *
 * ⚠️ NON è una copia automatica di ogni preventivo. Lo decide chi lo scrive,
 * con una spunta: metà dei preventivi sono una tantum e riempirebbero il
 * listino di righe che nessuno cercherà mai.
 *
 * ⚠️ NON crea doppioni: stesso fornitore + stesso titolo = la riga c'è già, e
 * si torna quella invece di aggiungerne un'altra con un prezzo diverso. Due
 * righe identiche con due prezzi sono la ragione per cui poi non ci si fida
 * di nessuno dei due.
 */
export async function salvaNelListino(f: {
  fornitore: string;
  fornitoreAnagraficheId?: string | null;
  titolo: string;
  descrizione?: string | null;
  linea?: string | null;
  prezzo: number | null;
  /** Da dove viene: «preventivo per <cliente>», così il prezzo si sa datare. */
  provenienza: string;
  /** Gli ingredienti, quando il prezzo era a unità. */
  prezzoUnitario?: number | null;
  quantita?: number | null;
  unita?: 'pezzi' | 'giorni' | 'ore' | null;
}): Promise<{ creata: boolean; fornitura: Fornitura | null }> {
  const nome = f.fornitore.trim();
  const titolo = f.titolo.trim();
  if (!nome || !titolo) return { creata: false, fornitura: null };

  const { data: gia } = await supabase
    .from('forniture')
    .select('*')
    .eq('fornitore', nome)
    .eq('titolo', titolo)
    .limit(1);
  if ((gia ?? []).length) return { creata: false, fornitura: (gia as Fornitura[])[0] };

  const unitario =
    f.prezzoUnitario != null && f.quantita != null && f.unita
      ? `${f.prezzoUnitario} a ${f.unita === 'pezzi' ? 'pezzo' : f.unita === 'giorni' ? 'giorno' : 'ora'} × ${f.quantita}`
      : null;

  const fornitura = await creaFornitura({
    fornitore: nome,
    fornitoreAnagraficheId: f.fornitoreAnagraficheId ?? null,
    titolo,
    descrizione: f.descrizione ?? null,
    linea: f.linea ?? null,
    prezzo: f.prezzo,
    // ⚠️ Il prezzo di un preventivo NON è un listino: è quello che quel
    // fornitore ha chiesto quella volta, per quel lavoro. Scritto senza dirlo,
    // fra sei mesi diventa «il suo prezzo» e ci si costruisce sopra un'offerta.
    prezzoNote: [unitario, `prezzo ricevuto ${f.provenienza}`].filter(Boolean).join(' · '),
    note: `Nata da un preventivo fornitore (${f.provenienza}). Non è un listino: è il prezzo di quella volta.`,
  });
  return { creata: true, fornitura };
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
