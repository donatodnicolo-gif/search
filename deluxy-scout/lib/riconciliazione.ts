// RICONCILIAZIONE — le cose che il computer non può decidere da solo.
//
// Due liste, stessa natura: un dato che c'è ma non basta, e una persona che
// deve guardarlo. Prima vivevano entrambe fuori dall'app — le posizioni
// mancanti non le vedeva nessuno, i doppioni li si scopriva aprendo una scheda
// per caso.
//
//  1. SENZA POSIZIONE — anagrafiche importate a 0,0 perché il registro non ha
//     un indirizzo da geocodificare. Entrano lo stesso (meglio dentro e da
//     sistemare che fuori e invisibili), ma sulla mappa non ci stanno.
//  2. DOPPIONI — coppie che forse sono lo stesso negozio. Il verdetto lo
//     calcola il database (`coppie_duplicate`, migrazione 0058): la distanza
//     decide, l'indirizzo corregge.
import { supabase } from '@/lib/supabase';

export interface SenzaPosizione {
  id: string;
  nome: string;
  indirizzo: string | null;
  zona: string | null;
  categoria: string | null;
  anagrafiche_id: string | null;
}

/**
 * I negozi rimasti a 0,0.
 *
 * ⚠️ Zero non è «vicino a Greenwich»: è il valore che diamo a «non lo
 * sappiamo», perché `places.lat/lng` non ammette il nulla. Cercare
 * `lat = 0 and lng = 0` è quindi il modo di chiedere «chi non ha una
 * posizione», non «chi sta all'incrocio fra equatore e meridiano».
 */
export async function fetchSenzaPosizione(): Promise<SenzaPosizione[]> {
  const { data, error } = await supabase
    .from('places')
    .select('id, nome, indirizzo, zona, categoria, anagrafiche_id')
    .eq('lat', 0)
    .eq('lng', 0)
    .not('nascosto', 'is', true)
    .order('nome');
  if (error) throw error;
  return (data ?? []) as SenzaPosizione[];
}

/** Scrive la posizione trovata e, con essa, toglie il negozio da questa lista. */
export async function salvaPosizione(
  placeId: string,
  p: { lat: number; lng: number; indirizzo?: string | null },
): Promise<void> {
  const patch: Record<string, unknown> = { lat: p.lat, lng: p.lng };
  // L'indirizzo si aggiorna solo se ne arriva uno: chi corregge solo il punto
  // sulla mappa non deve perdere quello che c'era scritto.
  if (p.indirizzo?.trim()) patch.indirizzo = p.indirizzo.trim();
  const { error } = await supabase.from('places').update(patch).eq('id', placeId);
  if (error) throw error;
}

export type VerdettoDuplicato = 'stesso negozio' | 'probabile' | 'da guardare' | 'sedi diverse';

export interface CoppiaDuplicata {
  tiene_id: string;
  tiene: string;
  togli_id: string;
  togli: string;
  citta: string | null;
  indirizzo_tiene: string | null;
  indirizzo_togli: string | null;
  metri: number | null;
  somiglianza: number;
  verdetto: VerdettoDuplicato;
}

export const COLORE_VERDETTO: Record<VerdettoDuplicato, string> = {
  'stesso negozio': '#2F7D46',
  probabile: '#B7791F',
  'da guardare': '#8A8A8E',
  'sedi diverse': '#1F6FEB',
};

export const AIUTO_VERDETTO: Record<VerdettoDuplicato, string> = {
  'stesso negozio': 'Stesso nome, a pochi metri, indirizzi che concordano.',
  probabile: 'Vicini, ma qualcosa non torna: guarda gli indirizzi prima di unire.',
  'da guardare': 'Il nome somiglia ma la distanza non decide.',
  'sedi diverse': 'Stessa insegna, chilometri di distanza: sono due negozi.',
};

/** Le coppie candidate, già col verdetto (il calcolo è in `coppie_duplicate`). */
export async function fetchCoppieDuplicate(): Promise<CoppiaDuplicata[]> {
  const { data, error } = await supabase.rpc('coppie_duplicate', { p_soglia: 0.6 });
  if (error) throw error;
  return (data ?? []) as CoppiaDuplicata[];
}

/**
 * Unisce: i figli del duplicato passano al superstite e il duplicato sparisce.
 *
 * ⚠️ Il `google_place_id` va spostato **prima**: la funzione di unione non lo
 * copia, e senza quello la scoperta sulla mappa ricreerebbe lo stesso negozio
 * al primo giro — riaprendo il doppione appena chiuso.
 */
export async function unisciCoppia(tieneId: string, togliId: string): Promise<void> {
  const { data: d } = await supabase
    .from('places')
    .select('google_place_id, google_rating, google_reviews')
    .eq('id', togliId)
    .maybeSingle();
  if (d?.google_place_id) {
    await supabase.from('places').update({ google_place_id: null }).eq('id', togliId);
    await supabase
      .from('places')
      .update({
        google_place_id: d.google_place_id,
        google_rating: d.google_rating,
        google_reviews: d.google_reviews,
      })
      .eq('id', tieneId);
  }
  const { error } = await supabase.rpc('unisci_places', { p_da: togliId, p_verso: tieneId });
  if (error) throw error;

  // ⚠️ Il superstite non deve restare NASCOSTO.
  //
  // `unisci_places` sposta i figli e completa i campi vuoti, ma non tocca il
  // flag «non interessante». Caso vero del 21/08/2026: la scheda buona di
  // «Amir Roma. Cioccolato e Pasticceria» — quella con lo stato *cliente* — era
  // nascosta, e il doppione vuoto no. Unendo nel modo giusto (resta il cliente)
  // il negozio sarebbe **sparito da tutte le liste**, finendo in Profilo →
  // Nascosti: il contrario di quello che uno si aspetta unendo due schede.
  // Nascondere è una scelta fatta su un'altra scheda, in un altro momento;
  // unire vuol dire «questa la tengo».
  //
  // Best-effort: se fallisce, l'unione è già avvenuta e non va annullata per
  // un flag — al massimo il negozio va ripescato dai Nascosti.
  await supabase.from('places').update({ nascosto: false }).eq('id', tieneId);
}

/** «Non sono la stessa cosa»: la coppia non ricompare più. */
export async function ignoraCoppia(a: string, b: string): Promise<void> {
  const [place_min, place_max] = a < b ? [a, b] : [b, a];
  const { error } = await supabase.from('duplicati_ignorati').upsert({ place_min, place_max });
  if (error) throw error;
}
