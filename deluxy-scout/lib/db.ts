// Accesso ai dati: un solo posto per le query Supabase usate dalle schermate.
import { supabase } from '@/lib/supabase';
import type { AffiliazioneRow, Contact, Deal, EsitoVisita, Linea, Place, Profilo, StatoAffiliazione, StatoPlace, Visit } from '@/types';
import { statoDaEsito } from '@/types';
import { env } from '@/lib/env';
import { syncVisita } from '@/lib/hubspot';

/** Contatto arricchito con nome/indirizzo/linea del negozio (per la Rubrica globale). */
export interface ContattoConLuogo extends Contact {
  place_nome: string | null;
  place_indirizzo: string | null;
  place_linea: string | null;
}

/** Trattativa arricchita col nome del negozio (per la sezione Trattative). */
export interface TrattativaConLuogo extends Deal {
  place_nome: string | null;
}

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
  linee_ipotizzate?: string[] | null;
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
    Pick<Place, 'nome' | 'indirizzo' | 'zona' | 'categoria' | 'settore' | 'priorita' | 'stato' | 'linea_ipotizzata' | 'linee_ipotizzate' | 'aggancio_apertura'>
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

/** Marca un contatto HubSpot come "non pertinente" per questo negozio (non riproporlo). */
export async function scartaContatto(placeId: string, hubspotContactId: string): Promise<void> {
  const { error } = await supabase
    .from('contatti_scartati')
    .upsert({ place_id: placeId, hubspot_contact_id: hubspotContactId });
  if (error) throw error;
}

/** Id dei contatti HubSpot scartati per un negozio. */
export async function fetchContattiScartati(placeId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('contatti_scartati')
    .select('hubspot_contact_id')
    .eq('place_id', placeId);
  if (error) throw error;
  return (data ?? []).map((r: any) => r.hubspot_contact_id);
}

/** Rifiuta TUTTA l'associazione azienda↔negozio: l'azienda non verrà più riproposta. */
export async function scartaAzienda(placeId: string, hubspotCompanyId: string): Promise<void> {
  await supabase.from('aziende_scartate').upsert({ place_id: placeId, hubspot_company_id: hubspotCompanyId });
  const { error } = await supabase
    .from('places')
    .update({ hubspot_company_id: null, hubspot_ha_contatto: false, hubspot_deal_aperta: false })
    .eq('id', placeId);
  if (error) throw error;
}

/** Id delle aziende HubSpot scartate per un negozio. */
export async function fetchAziendeScartate(placeId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('aziende_scartate')
    .select('hubspot_company_id')
    .eq('place_id', placeId);
  if (error) throw error;
  return (data ?? []).map((r: any) => r.hubspot_company_id);
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

/** Profili utente (owner → nome/email), per la dashboard di Team. Tollerante:
 *  se la migrazione 0014 non è applicata, ritorna [] e la UI usa un nome di ripiego. */
export async function fetchProfiles(): Promise<Profilo[]> {
  const { data, error } = await supabase.from('profiles').select('id, email, nome, ultimo_accesso');
  if (error) return [];
  return (data ?? []) as Profilo[];
}

/** Un singolo profilo (per la schermata del venditore / il proprio Profilo). */
export async function fetchProfilo(id: string): Promise<Profilo | null> {
  const { data, error } = await supabase.from('profiles').select('id, email, nome, ultimo_accesso').eq('id', id).single();
  if (error) return null;
  return data as Profilo;
}

/** Imposta il nome visualizzato di un profilo (proprio, o chiunque se admin — via RLS). */
export async function aggiornaNomeProfilo(id: string, nome: string): Promise<void> {
  const { error } = await supabase.from('profiles').update({ nome: nome.trim() || null }).eq('id', id);
  if (error) throw error;
}

/** Tutti i contatti registrati, col negozio di appartenenza (Rubrica globale). */
export async function fetchTuttiContatti(): Promise<ContattoConLuogo[]> {
  const { data, error } = await supabase
    .from('contacts')
    .select('*, places(nome, indirizzo, linea_ipotizzata)')
    .order('nome');
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    ...r,
    place_nome: r.places?.nome ?? null,
    place_indirizzo: r.places?.indirizzo ?? null,
    place_linea: r.places?.linea_ipotizzata ?? null,
  })) as ContattoConLuogo[];
}

/** Tutte le trattative, col nome del negozio (per raggruppamento per negozio). */
export async function fetchTutteTrattative(): Promise<TrattativaConLuogo[]> {
  const { data, error } = await supabase.from('deals').select('*, places(nome)');
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    ...r,
    place_nome: r.places?.nome ?? null,
  })) as TrattativaConLuogo[];
}

export async function aggiornaFaseDeal(dealId: string, fase: Deal['fase']): Promise<void> {
  const { error } = await supabase.from('deals').update({ fase }).eq('id', dealId);
  if (error) throw error;
}

/** Negozio in forma leggera, per il typeahead del form "Nuova trattativa". */
export interface PlaceLite {
  id: string;
  nome: string;
  indirizzo: string | null;
  zona: string | null;
}

/** Cerca negozi per nome/indirizzo (per collegare la trattativa a un contatto/negozio). */
export async function cercaPlaces(term: string, limit = 20): Promise<PlaceLite[]> {
  const q = term.trim();
  let query = supabase.from('places').select('id, nome, indirizzo, zona').order('nome').limit(limit);
  if (q) query = query.or(`nome.ilike.%${q}%,indirizzo.ilike.%${q}%`);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as PlaceLite[];
}

/** Crea una trattativa a mano (poi sincronizzabile su HubSpot col valore). */
export async function inserisciDeal(d: {
  place_id: string;
  linea: string | null;
  fase: Deal['fase'];
  valore_atteso: number | null;
  next_action: string | null;
}): Promise<Deal> {
  const { data: u } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('deals')
    .insert({ ...d, owner: u.user?.id ?? null, hubspot_deal_id: null })
    .select('*')
    .single();
  if (error) throw error;
  return data as Deal;
}

export async function aggiornaStatoPlace(placeId: string, stato: StatoPlace): Promise<void> {
  const { error } = await supabase.from('places').update({ stato }).eq('id', placeId);
  if (error) throw error;
}

/** Marca/smarca un negozio come interessante (⭐ → entra nel giro). Azzera "novità". */
export async function aggiornaStarred(placeId: string, starred: boolean): Promise<void> {
  const { error } = await supabase.from('places').update({ starred, novita: false }).eq('id', placeId);
  if (error) throw error;
}

// ── Affiliazioni (linea Re-seller: fioristi/pasticcerie da reclutare) ──────────

/** Elenco affiliazioni con dati anagrafici, referente principale e ultima chiamata. */
export async function fetchAffiliazioni(): Promise<AffiliazioneRow[]> {
  const { data, error } = await supabase
    .from('places')
    .select('id, nome, indirizzo, zona, categoria, stato_affiliazione, starred, contacts(nome, ruolo, telefono, is_decisore), chiamate(created_at)')
    .eq('linea_ipotizzata', 'Re-seller')
    .order('nome');
  if (error) throw error;
  return (data ?? []).map((r: any) => {
    const contatti: any[] = r.contacts ?? [];
    // Referente da chiamare: primo con telefono, preferendo il decisore.
    const conTel = contatti.filter((c) => c.telefono);
    const ref = conTel.find((c) => c.is_decisore) ?? conTel[0] ?? null;
    const ultima = (r.chiamate ?? [])
      .map((c: any) => c.created_at)
      .sort()
      .at(-1) ?? null;
    return {
      id: r.id,
      nome: r.nome,
      indirizzo: r.indirizzo,
      zona: r.zona,
      categoria: r.categoria,
      stato_affiliazione: r.stato_affiliazione,
      telefono: ref?.telefono ?? null,
      referente: ref?.nome ?? null,
      ultima_chiamata: ultima,
      starred: Boolean(r.starred),
    } as AffiliazioneRow;
  });
}

export async function aggiornaStatoAffiliazione(
  placeId: string,
  stato: StatoAffiliazione,
): Promise<void> {
  const { error } = await supabase.from('places').update({ stato_affiliazione: stato }).eq('id', placeId);
  if (error) throw error;
}

/** Registra una chiamata effettuata (chi la fa lo mette l'RLS/owner di default). */
export async function registraChiamata(placeId: string, esito?: string, note?: string): Promise<void> {
  const { data: userRes } = await supabase.auth.getUser();
  const { error } = await supabase.from('chiamate').insert({
    place_id: placeId,
    owner: userRes.user?.id ?? null,
    esito: esito ?? null,
    note: note ?? null,
  });
  if (error) throw error;
}

/** "Non interessante": nasconde (o ripristina) un'attività dalla scoperta. */
export async function aggiornaNascosto(placeId: string, nascosto: boolean): Promise<void> {
  const patch = nascosto ? { nascosto: true, starred: false, novita: false } : { nascosto: false };
  const { error } = await supabase.from('places').update(patch).eq('id', placeId);
  if (error) throw error;
}

/** Attività nascoste ("non interessanti") — per la sezione Nascosti nel Profilo. */
export async function fetchNascosti(): Promise<Place[]> {
  const { data, error } = await supabase
    .from('places')
    .select('*')
    .eq('nascosto', true)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Place[];
}

/** "Sono stato qui" ma compilo dopo: il negozio resta come attività "da completare". */
export async function segnaVisitatoDaCompletare(placeId: string): Promise<void> {
  const { error } = await supabase
    .from('places')
    .update({ stato: 'visitato', da_completare: true, novita: false })
    .eq('id', placeId);
  if (error) throw error;
}

/** Prossimo passo commerciale suggerito dall'esito (per la visita rapida). */
export const nextStepDaEsito: Record<EsitoVisita, string> = {
  interessato: 'Inviare recap email entro 12 ore',
  da_richiamare: 'Richiamare il punto vendita',
  non_target: 'Nessuna azione',
  chiuso: 'Attivare il cliente',
};

/** Registra una visita rapida (esito + contatto opzionale + note) e chiude il "da completare". */
export async function registraVisitaRapida(
  placeId: string,
  opts: {
    esito: EsitoVisita;
    note: string;
    concorrenti?: string | null;
    contatto?: { nome: string; ruolo?: string | null; telefono?: string | null; email?: string | null; is_decisore?: boolean };
  },
): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  const owner = u.user?.id ?? null;

  if (opts.contatto?.nome?.trim()) {
    await inserisciContatto({
      place_id: placeId,
      nome: opts.contatto.nome.trim(),
      ruolo: opts.contatto.ruolo ?? null,
      telefono: opts.contatto.telefono ?? null,
      email: opts.contatto.email ?? null,
      is_decisore: !!opts.contatto.is_decisore,
    });
  }

  const visita = await inserisciVisita({
    place_id: placeId,
    data: new Date().toISOString(),
    lat: null,
    lng: null,
    esito: opts.esito,
    briefing: null,
    note_post_meeting: opts.note.trim() || null,
    esito_analisi: null,
    next_step: nextStepDaEsito[opts.esito],
    linea_proposta: null,
    cross_sell: null,
    concorrenti: opts.concorrenti?.trim() || null,
    foto_url: null,
    owner,
  });

  const { error } = await supabase
    .from('places')
    .update({ stato: statoDaEsito[opts.esito], da_completare: false, novita: false })
    .eq('id', placeId);
  if (error) throw error;

  // Best effort: porta subito la visita su HubSpot (company+contact+deal).
  // Se fallisce resta hubspot_synced=false e verrà ripresa dai sync successivi.
  // I "non target" NON creano deal su HubSpot: non inquinare la pipeline.
  if (opts.esito !== 'non_target' && env.hubspotSyncUrl()) {
    try {
      await syncVisita(visita.id);
    } catch {
      /* la visita è salva su Supabase; il sync si recupera dopo */
    }
  }
}

/** Attività segnate come "da completare" (visita registrata senza dettagli). */
export async function fetchDaCompletare(): Promise<Place[]> {
  const { data, error } = await supabase
    .from('places')
    .select('*')
    .eq('da_completare', true)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Place[];
}

/** Inserisce una visita già sincronizzabile e ritorna l'id server. */
export async function inserisciVisita(
  v: Omit<Visit, 'id' | 'created_at' | 'hubspot_synced'>,
): Promise<Visit> {
  const payload = { ...v, hubspot_synced: false };
  let res = await supabase.from('visits').insert(payload).select('*').single();
  // Degrada con grazia se la migrazione 0013 (colonna concorrenti) non è applicata:
  // salva la visita senza quel campo invece di far fallire tutto il salvataggio.
  if (res.error && /concorrenti/i.test(res.error.message)) {
    const { concorrenti: _omesso, ...senzaConcorrenti } = payload;
    res = await supabase.from('visits').insert(senzaConcorrenti).select('*').single();
  }
  if (res.error) throw res.error;
  return res.data as Visit;
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
