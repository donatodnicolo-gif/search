// Accesso ai dati: un solo posto per le query Supabase usate dalle schermate.
import { supabase } from '@/lib/supabase';
import type { Contact, Deal, Linea, Place, StatoPlace, Visit } from '@/types';

export async function fetchLinee(): Promise<Linea[]> {
  const { data, error } = await supabase.from('lines').select('*').order('nome');
  if (error) throw error;
  return (data ?? []) as Linea[];
}

export async function fetchPlaces(): Promise<Place[]> {
  const { data, error } = await supabase.from('places').select('*');
  if (error) throw error;
  return (data ?? []) as Place[];
}

/** Crea un nuovo target sul territorio (scoperto in mobilità). */
export async function inserisciPlace(p: {
  nome: string;
  indirizzo: string | null;
  lat: number;
  lng: number;
  categoria: string | null;
  settore: string | null;
  zona: string | null;
  priorita: Place['priorita'];
  linea_ipotizzata: string | null;
  aggancio_apertura: string | null;
}): Promise<Place> {
  const { data, error } = await supabase
    .from('places')
    .insert({ ...p, stato: 'da_visitare' })
    .select('*')
    .single();
  if (error) throw error;
  return data as Place;
}

/** Aggiorna i campi editabili di un'attività (correzione dati sul campo). */
export async function aggiornaPlace(
  id: string,
  patch: Partial<
    Pick<Place, 'nome' | 'indirizzo' | 'zona' | 'categoria' | 'settore' | 'priorita' | 'stato' | 'linea_ipotizzata' | 'aggancio_apertura'>
  >,
): Promise<void> {
  const { error } = await supabase.from('places').update(patch).eq('id', id);
  if (error) throw error;
}

/** Aggiunge un contatto a un'attività. */
export async function inserisciContatto(
  c: Omit<Contact, 'id' | 'hubspot_contact_id'>,
): Promise<Contact> {
  const { data, error } = await supabase
    .from('contacts')
    .insert({ ...c, hubspot_contact_id: null })
    .select('*')
    .single();
  if (error) throw error;
  return data as Contact;
}

export async function fetchPlace(id: string): Promise<Place | null> {
  const { data, error } = await supabase.from('places').select('*').eq('id', id).single();
  if (error) return null;
  return data as Place;
}

export async function fetchContatti(placeId: string): Promise<Contact[]> {
  const { data, error } = await supabase.from('contacts').select('*').eq('place_id', placeId);
  if (error) throw error;
  return (data ?? []) as Contact[];
}

export async function fetchVisit(id: string): Promise<Visit | null> {
  const { data, error } = await supabase.from('visits').select('*').eq('id', id).single();
  if (error) return null;
  return data as Visit;
}

export async function fetchVisitePlace(placeId: string): Promise<Visit[]> {
  const { data, error } = await supabase
    .from('visits')
    .select('*')
    .eq('place_id', placeId)
    .order('data', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Visit[];
}

export async function fetchDealPlace(placeId: string): Promise<Deal[]> {
  const { data, error } = await supabase.from('deals').select('*').eq('place_id', placeId);
  if (error) throw error;
  return (data ?? []) as Deal[];
}

export async function fetchAllVisits(): Promise<Visit[]> {
  const { data, error } = await supabase.from('visits').select('*').order('data', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Visit[];
}

export async function fetchAllDeals(): Promise<Deal[]> {
  const { data, error } = await supabase.from('deals').select('*');
  if (error) throw error;
  return (data ?? []) as Deal[];
}

export async function aggiornaFaseDeal(dealId: string, fase: Deal['fase']): Promise<void> {
  const { error } = await supabase.from('deals').update({ fase }).eq('id', dealId);
  if (error) throw error;
}

export async function aggiornaStatoPlace(placeId: string, stato: StatoPlace): Promise<void> {
  const { error } = await supabase.from('places').update({ stato }).eq('id', placeId);
  if (error) throw error;
}

/** Inserisce una visita già sincronizzabile e ritorna l'id server. */
export async function inserisciVisita(
  v: Omit<Visit, 'id' | 'created_at' | 'hubspot_synced'>,
): Promise<Visit> {
  const { data, error } = await supabase
    .from('visits')
    .insert({ ...v, hubspot_synced: false })
    .select('*')
    .single();
  if (error) throw error;
  return data as Visit;
}

/** Carica la foto vetrina su Supabase Storage e ritorna l'URL pubblico. */
export async function caricaFotoVetrina(localUri: string, placeId: string): Promise<string> {
  const res = await fetch(localUri);
  const blob = await res.arrayBuffer();
  const path = `${placeId}/${nomeFileUnico(localUri)}`;
  const { error } = await supabase.storage
    .from('vetrine')
    .upload(path, blob, { contentType: mimeDaUri(localUri), upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from('vetrine').getPublicUrl(path);
  return data.publicUrl;
}

function nomeFileUnico(uri: string): string {
  const ext = uri.split('.').pop()?.split('?')[0] ?? 'jpg';
  const rand = Date.now().toString(36) + Math.round(Math.random() * 1e6).toString(36);
  return `vetrina_${rand}.${ext}`;
}

function mimeDaUri(uri: string): string {
  const ext = uri.split('.').pop()?.split('?')[0]?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'heic') return 'image/heic';
  return 'image/jpeg';
}
