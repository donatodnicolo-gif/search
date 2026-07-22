// Accesso ai dati: un solo posto per le query Supabase usate dalle schermate.
import { supabase } from '@/lib/supabase';
import type { AffiliazioneRow, Contact, Deal, EsitoVisita, Linea, Place, Profilo, RichiestaPagamento, StatoAffiliazione, StatoPagamento, StatoPlace, Task, Visit } from '@/types';
import { LINEE_ATTIVE, statoDaEsito } from '@/types';
import { env } from '@/lib/env';
import { syncVisita } from '@/lib/hubspot';
import { notificaArchiviazioneReferente, sincronizzaNegozioRegistro } from '@/lib/anagrafiche';

/** Contatto arricchito con nome/indirizzo/linea del negozio (per la Rubrica globale). */
export interface ContattoConLuogo extends Contact {
  place_nome: string | null;
  place_indirizzo: string | null;
  place_linea: string | null;
  place_stato: StatoPlace | null; // stato del negozio (da_visitare/visitato/cliente/perso)
  place_zona: string | null; // zona/area del negozio (per il filtro territoriale)
  place_in_trattativa: boolean; // il negozio ha una trattativa aperta (per la storyline)
  place_nel_registro: boolean; // il negozio è collegato al registro Anagrafiche (anagrafiche_id presente)
}

/** Trattativa arricchita col nome del negozio (per la sezione Trattative). */
export interface TrattativaConLuogo extends Deal {
  place_nome: string | null;
  titolo?: string | null; // nome del deal HubSpot (quando non c'è una linea Scout)
  origine?: 'scout' | 'hubspot' | 'anagrafiche';
  anagrafiche_stato?: string | null; // stato dal registro Anagrafiche, se il negozio è schedato
  is_partner?: boolean; // registro = 'attivo' (già cliente/partner)
  owner_nome?: string | null; // nome del venditore che possiede la trattativa
  place_zona?: string | null; // zona/area del negozio (per i filtri della Dashboard)
}

export async function fetchLinee(): Promise<Linea[]> {
  const { data, error } = await supabase.from('lines').select('*').order('nome');
  if (error) throw error;
  return (data ?? []) as Linea[];
}

// ── Linee di interesse (Scout è il MASTER; admin le gestisce con sottolinee) ────

export interface LineaInteresse {
  id: string;
  nome: string;
  attiva_bool: boolean;
  archiviata: boolean;
  parent_id: string | null;
  ordine: number;
  icona: string | null;
  pitch: string | null;
  sottolinee?: LineaInteresse[]; // valorizzato solo per le linee top-level
}

/** Albero delle linee: top-level attive+inattive (non archiviate) con le sottolinee. */
export async function fetchLineeInteresse(): Promise<LineaInteresse[]> {
  const { data, error } = await supabase
    .from('lines')
    .select('id, nome, attiva_bool, archiviata, parent_id, ordine, icona, pitch')
    .eq('archiviata', false)
    .order('ordine')
    .order('nome');
  if (error) throw error;
  const righe = (data ?? []) as LineaInteresse[];
  const top = righe.filter((r) => !r.parent_id);
  const figli = righe.filter((r) => r.parent_id);
  return top.map((t) => ({ ...t, sottolinee: figli.filter((f) => f.parent_id === t.id) }));
}

/**
 * Nomi delle linee ATTIVE top-level, per i selettori dell'app. Tollerante:
 * se la migrazione/DB non risponde, ripiega sulle costanti LINEE_ATTIVE.
 */
export async function fetchNomiLineeAttive(): Promise<string[]> {
  try {
    const linee = await fetchLineeInteresse();
    const nomi = linee.filter((l) => l.attiva_bool).map((l) => l.nome);
    return nomi.length ? nomi : [...LINEE_ATTIVE];
  } catch {
    return [...LINEE_ATTIVE];
  }
}

/** Crea una linea o una sottolinea (parent_id valorizzato). Solo admin (RLS). */
export async function creaLinea(l: {
  nome: string;
  parent_id?: string | null;
  icona?: string | null;
  pitch?: string | null;
  attiva_bool?: boolean;
}): Promise<void> {
  const { error } = await supabase.from('lines').insert({
    nome: l.nome.trim(),
    parent_id: l.parent_id ?? null,
    icona: l.icona ?? null,
    pitch: l.pitch ?? null,
    attiva_bool: l.attiva_bool ?? true,
  });
  if (error) throw error;
}

/** Modifica una linea/sottolinea (nome, icona, pitch, attiva, ordine). Solo admin. */
export async function aggiornaLinea(
  id: string,
  patch: Partial<Pick<LineaInteresse, 'nome' | 'icona' | 'pitch' | 'attiva_bool' | 'ordine'>>,
): Promise<void> {
  const { error } = await supabase.from('lines').update(patch).eq('id', id);
  if (error) throw error;
}

/** Archivia una linea (soft-delete) e le sue sottolinee. Solo admin. */
export async function archiviaLinea(id: string): Promise<void> {
  const { error } = await supabase.from('lines').update({ archiviata: true }).or(`id.eq.${id},parent_id.eq.${id}`);
  if (error) throw error;
}

export async function fetchPlaces(): Promise<Place[]> {
  const { data, error } = await supabase.from('places').select('*');
  if (error) throw error;
  const righe = (data ?? []) as Place[];
  // Risolvi il nome di chi ha inserito ogni target (dai profili).
  const ids = [...new Set(righe.map((p) => p.creato_da).filter(Boolean))] as string[];
  if (ids.length) {
    const profili = await fetchProfiles().catch(() => [] as Profilo[]);
    const nome = new Map(profili.map((p) => [p.id, nomeDaProfilo(p)]));
    for (const p of righe) p.creato_da_nome = p.creato_da ? nome.get(p.creato_da) ?? null : null;
  }
  return righe;
}

/**
 * Trova i possibili duplicati di un target: stesso indirizzo (case-insensitive)
 * o nome con lo stesso prefisso (es. "AMIRI" e "AMIRI - Milan"). Esclude se
 * stesso e i target nascosti.
 */
export async function trovaDuplicati(place: Place): Promise<Place[]> {
  const out = new Map<string, Place>();
  const aggiungi = (rows: Place[] | null | undefined) => {
    for (const r of rows ?? []) if (r.id !== place.id && !r.nascosto) out.set(r.id, r);
  };
  // Stesso indirizzo, MA solo se l'indirizzo è specifico (contiene un numero
  // civico): indirizzi generici come "Italy"/"Milano" sono condivisi da decine
  // di negozi importati e non indicano un duplicato.
  const indirizzo = place.indirizzo?.trim();
  if (indirizzo && /\d/.test(indirizzo) && indirizzo.length >= 6) {
    const { data } = await supabase.from('places').select('*').ilike('indirizzo', indirizzo).neq('id', place.id).limit(25);
    aggiungi(data as Place[]);
  }
  // Nome con lo stesso prefisso significativo (prima parola alfanumerica, ≥3
  // caratteri) E stessa città: evita match tra omonimi di città diverse.
  const primo = (place.nome ?? '').replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/)[0];
  if (primo && primo.length >= 3) {
    let q = supabase.from('places').select('*').ilike('nome', `${primo}%`).neq('id', place.id).limit(25);
    if (place.zona?.trim()) q = q.eq('zona', place.zona.trim());
    const { data } = await q;
    aggiungi(data as Place[]);
  }
  // Escludi le coppie già segnate come "non duplicati".
  if (out.size) {
    const { data: ign } = await supabase
      .from('duplicati_ignorati')
      .select('place_min, place_max')
      .or(`place_min.eq.${place.id},place_max.eq.${place.id}`);
    for (const r of ign ?? []) {
      const altro = r.place_min === place.id ? r.place_max : r.place_min;
      out.delete(altro);
    }
  }
  return [...out.values()];
}

/** Segna una coppia di target come "NON duplicati" (suggerimento ignorato). */
export async function ignoraDuplicato(a: string, b: string): Promise<void> {
  const [place_min, place_max] = a < b ? [a, b] : [b, a];
  const { error } = await supabase.from('duplicati_ignorati').upsert({ place_min, place_max });
  if (error) throw error;
}

// ── Indirizzi preferiti (per tornare in fretta su una zona in Mappa) ────────────

export interface IndirizzoPreferito {
  id: string;
  etichetta: string;
  indirizzo: string;
  lat: number;
  lng: number;
}

export async function fetchPreferiti(): Promise<IndirizzoPreferito[]> {
  const { data, error } = await supabase
    .from('indirizzi_preferiti')
    .select('id, etichetta, indirizzo, lat, lng')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as IndirizzoPreferito[];
}

export async function salvaPreferito(p: { etichetta: string; indirizzo: string; lat: number; lng: number }): Promise<void> {
  const { error } = await supabase.from('indirizzi_preferiti').insert({
    etichetta: p.etichetta.trim() || p.indirizzo.trim(),
    indirizzo: p.indirizzo.trim(),
    lat: p.lat,
    lng: p.lng,
  });
  if (error) throw error;
}

export async function eliminaPreferito(id: string): Promise<void> {
  const { error } = await supabase.from('indirizzi_preferiti').delete().eq('id', id);
  if (error) throw error;
}

/**
 * Unisce due target duplicati: sposta contatti/visite/trattative/chiamate/task/
 * pagamenti dal duplicato (`da`) al target che resta (`verso`), completa i campi
 * mancanti ed elimina il duplicato. Transazionale via RPC `unisci_places`.
 */
export async function unisciPlaces(da: string, verso: string): Promise<void> {
  const { error } = await supabase.rpc('unisci_places', { p_da: da, p_verso: verso });
  if (error) throw error;
}

/**
 * Sincronizza un negozio verso il registro Anagrafiche (crea/aggiorna il partner
 * con stato + interessi). Best-effort e NON bloccante: si chiama dopo creazione
 * e cambi di stato del negozio. Inerte finché Anagrafiche non abilita la
 * scrittura partner per Scout.
 */
export async function sincronizzaPlaceRegistro(placeId: string): Promise<void> {
  try {
    const { data: p } = await supabase
      .from('places')
      .select('nome, zona, indirizzo, categoria, stato, stato_affiliazione, anagrafiche_account, linea_ipotizzata, linee_ipotizzate')
      .eq('id', placeId)
      .single();
    if (!p) return;
    const linee = (p.linee_ipotizzate?.length ? p.linee_ipotizzate : p.linea_ipotizzata ? [p.linea_ipotizzata] : []) as string[];
    await sincronizzaNegozioRegistro({
      placeId,
      nome: p.nome,
      citta: p.zona ?? null,
      indirizzo: p.indirizzo ?? null,
      categoria: p.categoria ?? null,
      stato: p.stato ?? null,
      // Stato "vero" di Anagrafiche (8 valori): se impostato ha priorità sulla
      // derivazione dai 4 stati di pipeline.
      statoRegistro: p.stato_affiliazione ?? null,
      // Account = venditore che segue il cliente (aggiornato anche su Anagrafiche).
      account: p.anagrafiche_account ?? null,
      linee,
    });
  } catch {
    /* best-effort: non deve mai far fallire l'azione dell'utente */
  }
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
  sincronizzaPlaceRegistro(data.id).catch(() => {}); // best-effort verso Anagrafiche
  return data as Place;
}

/** Un cliente/partner nella sezione Clienti. */
export interface Cliente {
  id: string;
  nome: string;
  indirizzo: string | null;
  zona: string | null;
  categoria: string | null;
  linee: string[];
  cliente_scout: boolean; // stato = 'cliente' in Scout
  partner_registro: boolean; // partner 'attivo' nel registro Anagrafiche
}

/** Tutti i clienti: negozi cliente in Scout OPPURE partner attivi nel registro. */
export async function fetchClienti(): Promise<Cliente[]> {
  const { data, error } = await supabase
    .from('places')
    .select('id, nome, indirizzo, zona, categoria, linea_ipotizzata, linee_ipotizzate, stato, anagrafiche_stato')
    .or('stato.eq.cliente,anagrafiche_stato.eq.attivo')
    .order('nome');
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    nome: r.nome,
    indirizzo: r.indirizzo ?? null,
    zona: r.zona ?? null,
    categoria: r.categoria ?? null,
    linee: r.linee_ipotizzate?.length ? r.linee_ipotizzate : r.linea_ipotizzata ? [r.linea_ipotizzata] : [],
    cliente_scout: r.stato === 'cliente',
    partner_registro: r.anagrafiche_stato === 'attivo',
  })) as Cliente[];
}

/** Aggiorna i campi editabili di un'attività (correzione dati sul campo). */
export async function aggiornaPlace(
  id: string,
  patch: Partial<
    Pick<Place, 'nome' | 'indirizzo' | 'zona' | 'categoria' | 'settore' | 'priorita' | 'stato' | 'stato_affiliazione' | 'anagrafiche_account' | 'linea_ipotizzata' | 'linee_ipotizzate' | 'aggancio_apertura'>
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

// ── Storico visite (per giorno, con account, negozio e via) ─────────────────────

export interface VisitaStorico {
  id: string;
  data: string; // ISO
  esito: EsitoVisita | null;
  owner: string | null;
  owner_nome: string | null; // venditore (account) risolto
  place_id: string;
  place_nome: string;
  place_indirizzo: string | null; // via
  place_zona: string | null;
}

/** Storico di tutte le visite (RLS: condivise), col negozio e la via, per la
 *  sezione Andamento → Storico. Risolve il nome del venditore (account). */
export async function fetchStorico(limite = 1000): Promise<VisitaStorico[]> {
  const { data, error } = await supabase
    .from('visits')
    .select('id, data, esito, owner, place_id, places(nome, indirizzo, zona)')
    .order('data', { ascending: false })
    .limit(limite);
  if (error) throw error;
  const righe = (data ?? []).map((r: any) => ({
    id: r.id,
    data: r.data,
    esito: r.esito ?? null,
    owner: r.owner ?? null,
    owner_nome: null,
    place_id: r.place_id,
    place_nome: r.places?.nome ?? 'Negozio',
    place_indirizzo: r.places?.indirizzo ?? null,
    place_zona: r.places?.zona ?? null,
  })) as VisitaStorico[];
  const ids = [...new Set(righe.map((r) => r.owner).filter(Boolean))] as string[];
  if (ids.length) {
    const profili = await fetchProfiles();
    const nome = new Map(profili.map((p) => [p.id, nomeDaProfilo(p)]));
    for (const r of righe) r.owner_nome = r.owner ? nome.get(r.owner) ?? null : null;
  }
  return righe;
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

/** Token privato del feed iCal dell'utente corrente (per sottoscrivere il calendario). */
export async function fetchCalToken(): Promise<string | null> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return null;
  const { data, error } = await supabase.from('profiles').select('cal_token').eq('id', u.user.id).single();
  if (error) return null;
  return (data as any)?.cal_token ?? null;
}

/** URL del feed iCal sottoscrivibile (Google/Apple/Outlook). */
export function urlFeedCalendario(token: string): string {
  return `${env.supabaseUrl().replace(/\/$/, '')}/functions/v1/calendario-ics?token=${token}`;
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
    .select('*, places(nome, indirizzo, linea_ipotizzata, stato, zona, hubspot_deal_aperta, anagrafiche_id)')
    .order('nome');
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    ...r,
    place_nome: r.places?.nome ?? null,
    place_indirizzo: r.places?.indirizzo ?? null,
    place_linea: r.places?.linea_ipotizzata ?? null,
    place_stato: r.places?.stato ?? null,
    place_zona: r.places?.zona ?? null,
    place_in_trattativa: Boolean(r.places?.hubspot_deal_aperta),
    place_nel_registro: Boolean(r.places?.anagrafiche_id),
  })) as ContattoConLuogo[];
}

/**
 * Archivia (o ripristina) un contatto: sparisce dall'elenco attivo di Rubrica.
 * Comunica l'archiviazione anche ad Anagrafiche (best-effort, non blocca).
 */
export async function archiviaContatto(
  c: { id: string; place_id: string; nome: string; email: string | null; telefono: string | null; place_nome?: string | null; place_zona?: string | null },
  archiviato: boolean,
): Promise<void> {
  const { error } = await supabase.from('contacts').update({ archiviato }).eq('id', c.id);
  if (error) throw error;
  notificaArchiviazioneReferente({
    placeId: c.place_id,
    nome: c.nome,
    email: c.email,
    telefono: c.telefono,
    negozio: c.place_nome ?? null,
    citta: c.place_zona ?? null,
    archiviato,
  }).catch(() => {});
}

/** Normalizza un nome per il match (minuscolo, senza accenti/punteggiatura). */
function normNome(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

interface RegPlace {
  id: string;
  nome: string;
  zona: string | null;
  linea_ipotizzata: string | null;
  anagrafiche_stato: string | null;
  hubspot_company_id: string | null;
}

/**
 * Tutte le trattative, col nome del negozio. Unisce TRE fonti:
 *  1. i deal "nativi" di Scout (tabella `deals`, creati da visita o a mano);
 *  2. le trattative APERTE dalla copia locale del CRM HubSpot (`hubspot_deals`,
 *     sync notturno) — così si vedono anche gli **importi** del pipeline HubSpot;
 *  3. i partner del registro **Anagrafiche** con stato `in_trattativa` (che non
 *     hanno un deal Scout/HubSpot), con la loro **tipologia** (linea).
 * Ogni riga è arricchita con la **tipologia** e lo **stato registro** del negozio
 * corrispondente (match per negozio Scout → azienda HubSpot → nome normalizzato).
 * Dedup: vince Scout, poi HubSpot, poi registro; niente doppioni per negozio.
 */
export async function fetchTutteTrattative(): Promise<TrattativaConLuogo[]> {
  // Registro Anagrafiche (schedati) — per arricchire tipologia/stato e come fonte 3.
  const { data: reg } = await supabase
    .from('places')
    .select('id, nome, zona, linea_ipotizzata, anagrafiche_stato, hubspot_company_id')
    .not('anagrafiche_stato', 'is', null);
  const regPlaces = (reg ?? []) as RegPlace[];
  const regById = new Map<string, RegPlace>();
  const regByCompany = new Map<string, RegPlace>();
  const regByNorm = new Map<string, RegPlace>();
  for (const r of regPlaces) {
    regById.set(r.id, r);
    if (r.hubspot_company_id) regByCompany.set(r.hubspot_company_id, r);
    const k = normNome(r.nome);
    if (k && !regByNorm.has(k)) regByNorm.set(k, r);
  }
  const trovaReg = (placeId?: string, companyId?: string, ...nomi: (string | null | undefined)[]) => {
    if (placeId && regById.has(placeId)) return regById.get(placeId);
    if (companyId && regByCompany.has(companyId)) return regByCompany.get(companyId);
    for (const n of nomi) {
      const k = normNome(n);
      if (k && regByNorm.has(k)) return regByNorm.get(k);
    }
    return undefined;
  };
  const arricchisci = (row: TrattativaConLuogo, r?: RegPlace) => {
    if (!r) return row;
    if (!row.linea) row.linea = r.linea_ipotizzata ?? null;
    row.anagrafiche_stato = r.anagrafiche_stato ?? null;
    row.is_partner = r.anagrafiche_stato === 'attivo';
    return row;
  };

  // 1. Trattative native Scout.
  const { data: scout, error } = await supabase.from('deals').select('*, places(nome, zona)');
  if (error) throw error;
  const scoutRows: TrattativaConLuogo[] = (scout ?? []).map((r: any) =>
    arricchisci(
      { ...r, place_nome: r.places?.nome ?? null, place_zona: r.places?.zona ?? null, titolo: null, origine: 'scout' },
      trovaReg(r.place_id, undefined, r.places?.nome),
    ),
  );
  const hsGiaScout = new Set(scoutRows.map((r) => r.hubspot_deal_id).filter(Boolean));

  // 2. Trattative aperte dal CRM HubSpot (con valore). Degrada con grazia se la
  //    copia CRM non è popolata (mostra solo Scout + registro).
  const { data: hsDeals } = await supabase
    .from('hubspot_deals')
    .select('hubspot_id, company_hubspot_id, nome, fase, valore, linea, aperta')
    .eq('aperta', true);

  // Risolvi il nome: negozio Scout collegato → azienda HubSpot → nome del deal.
  const companyIds = [
    ...new Set((hsDeals ?? []).map((d: any) => d.company_hubspot_id).filter(Boolean)),
  ];
  const placeByCompany = new Map<string, { id: string; nome: string; zona: string | null }>();
  const companyName = new Map<string, string>();
  if (companyIds.length) {
    const { data: places } = await supabase
      .from('places')
      .select('id, nome, zona, hubspot_company_id')
      .in('hubspot_company_id', companyIds);
    for (const p of places ?? []) placeByCompany.set(p.hubspot_company_id, { id: p.id, nome: p.nome, zona: p.zona });
    const { data: comps } = await supabase
      .from('hubspot_companies')
      .select('hubspot_id, nome')
      .in('hubspot_id', companyIds);
    for (const c of comps ?? []) companyName.set(c.hubspot_id, c.nome);
  }

  const hsRows: TrattativaConLuogo[] = (hsDeals ?? [])
    .filter((d: any) => !hsGiaScout.has(d.hubspot_id))
    .map((d: any) => {
      const place = d.company_hubspot_id ? placeByCompany.get(d.company_hubspot_id) : undefined;
      const nomeAzienda = d.company_hubspot_id ? companyName.get(d.company_hubspot_id) : null;
      const nomeNegozio = place?.nome ?? nomeAzienda ?? null;
      const row: TrattativaConLuogo = {
        id: `hs_${d.hubspot_id}`,
        place_id: place?.id ?? '',
        linea: d.linea ?? null,
        fase: d.fase,
        valore_atteso: d.valore != null ? Number(d.valore) : null,
        next_action: null,
        scadenza: null,
        owner: null,
        hubspot_deal_id: d.hubspot_id,
        place_nome: nomeNegozio,
        place_zona: place?.zona ?? null,
        titolo: d.nome ?? null,
        origine: 'hubspot',
      };
      return arricchisci(row, trovaReg(place?.id, d.company_hubspot_id, nomeAzienda, nomeNegozio, d.nome));
    });

  // 3. Registro Anagrafiche: partner in trattativa senza deal Scout/HubSpot.
  const negoziGiaMostrati = new Set(
    [...scoutRows, ...hsRows].map((r) => r.place_id).filter(Boolean),
  );
  const anaRows: TrattativaConLuogo[] = regPlaces
    .filter((r) => r.anagrafiche_stato === 'in_trattativa' && !negoziGiaMostrati.has(r.id))
    .map((r) => ({
      id: `ana_${r.id}`,
      place_id: r.id,
      linea: r.linea_ipotizzata ?? null,
      // Nessuna dealstage nel registro: la mappiamo a uno stage aperto "medio"
      // per raggruppamento/filtro; in UI si mostra lo stato registro reale.
      fase: 'decisionmakerboughtin' as Deal['fase'],
      valore_atteso: null,
      next_action: null,
      scadenza: null,
      owner: null,
      hubspot_deal_id: null,
      place_nome: r.nome,
      place_zona: r.zona ?? null,
      titolo: null,
      origine: 'anagrafiche',
      anagrafiche_stato: 'in_trattativa',
      is_partner: false,
    }));

  // Owner (venditore) → nome: risolvi gli UUID dai profili (best effort).
  const righe = [...scoutRows, ...hsRows, ...anaRows];
  const ownerIds = [...new Set(righe.map((r) => r.owner).filter(Boolean))] as string[];
  if (ownerIds.length) {
    const profili = await fetchProfiles();
    const nomePerId = new Map(profili.map((p) => [p.id, nomeDaProfilo(p)]));
    for (const r of righe) {
      if (r.owner) r.owner_nome = nomePerId.get(r.owner) ?? null;
    }
  }

  return righe;
}

/** Nome visualizzato di un venditore: nome → prefisso email → "Utente xxxxxx". */
export function nomeDaProfilo(p: Profilo): string {
  if (p.nome?.trim()) return p.nome.trim();
  if (p.email) return p.email.split('@')[0];
  return `Utente ${p.id.slice(0, 6)}`;
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

/** Modifica una trattativa Scout (tabella `deals`). */
export async function aggiornaDeal(
  id: string,
  patch: Partial<Pick<Deal, 'linea' | 'linee' | 'fase' | 'valore_atteso' | 'next_action' | 'scadenza'>>,
): Promise<void> {
  const { error } = await supabase.from('deals').update(patch).eq('id', id);
  if (error) throw error;
}

/** Crea una trattativa a mano (poi sincronizzabile su HubSpot col valore). */
export async function inserisciDeal(d: {
  place_id: string;
  linea: string | null;
  linee?: string[] | null;
  fase: Deal['fase'];
  valore_atteso: number | null;
  next_action: string | null;
  scadenza?: string | null;
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
  sincronizzaPlaceRegistro(placeId).catch(() => {}); // best-effort verso Anagrafiche
}

/** Marca/smarca un negozio come interessante (⭐ → entra nel giro). Azzera "novità". */
export async function aggiornaStarred(placeId: string, starred: boolean): Promise<void> {
  const { error } = await supabase.from('places').update({ starred, novita: false }).eq('id', placeId);
  if (error) throw error;
}

// ── Task personali (tasklist privata del venditore) ────────────────────────────

/**
 * Task visibili. `soloMiei=true` → solo quelli assegnati a me; altrimenti tutti
 * quelli che l'RLS concede (assegnati a me + creati da me + TUTTI se admin).
 * Risolve i nomi di assegnatario e creatore dai profili.
 */
export async function fetchTask(soloMiei: boolean): Promise<Task[]> {
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id ?? null;
  let q = supabase
    .from('tasks')
    .select('*, places(nome)')
    .order('completata', { ascending: true })
    .order('scadenza', { ascending: true, nullsFirst: false })
    .order('priorita', { ascending: true })
    .order('created_at', { ascending: false });
  if (soloMiei && uid) q = q.eq('owner', uid);
  const { data, error } = await q;
  if (error) throw error;
  const righe = (data ?? []).map((r: any) => ({ ...r, place_nome: r.places?.nome ?? null })) as Task[];

  const ids = [...new Set(righe.flatMap((t) => [t.owner, t.creato_da]).filter(Boolean))] as string[];
  if (ids.length) {
    const profili = await fetchProfiles();
    const nome = new Map(profili.map((p) => [p.id, nomeDaProfilo(p)]));
    for (const t of righe) {
      t.owner_nome = t.owner ? nome.get(t.owner) ?? null : null;
      t.creato_da_nome = t.creato_da ? nome.get(t.creato_da) ?? null : null;
    }
  }
  return righe;
}

/** Retrocompat: i task assegnati a me. */
export function fetchMieiTask(): Promise<Task[]> {
  return fetchTask(true);
}

/** I task collegati a un negozio (RLS: quelli che l'utente può vedere). */
export async function fetchTaskPlace(placeId: string): Promise<Task[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*, places(nome)')
    .eq('place_id', placeId)
    .order('completata', { ascending: true })
    .order('scadenza', { ascending: true, nullsFirst: false })
    .order('priorita', { ascending: true })
    .order('created_at', { ascending: false });
  if (error) throw error;
  const righe = (data ?? []).map((r: any) => ({ ...r, place_nome: r.places?.nome ?? null })) as Task[];
  const ids = [...new Set(righe.flatMap((t) => [t.owner, t.creato_da]).filter(Boolean))] as string[];
  if (ids.length) {
    const profili = await fetchProfiles();
    const nome = new Map(profili.map((p) => [p.id, nomeDaProfilo(p)]));
    for (const t of righe) {
      t.owner_nome = t.owner ? nome.get(t.owner) ?? null : null;
      t.creato_da_nome = t.creato_da ? nome.get(t.creato_da) ?? null : null;
    }
  }
  return righe;
}

/** Crea un task; `owner` = assegnatario (default: l'utente corrente). */
export async function inserisciTask(t: {
  titolo: string;
  note?: string | null;
  priorita: Task['priorita'];
  scadenza?: string | null;
  place_id?: string | null;
  owner?: string | null;
}): Promise<Task> {
  const { data: u } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('tasks')
    .insert({
      owner: t.owner ?? u.user?.id ?? undefined,
      creato_da: u.user?.id ?? undefined,
      titolo: t.titolo,
      note: t.note ?? null,
      priorita: t.priorita,
      scadenza: t.scadenza ?? null,
      place_id: t.place_id ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as Task;
}

/** Aggiorna i campi editabili di un task (incl. riassegnazione via `owner`). */
export async function aggiornaTask(
  id: string,
  patch: Partial<Pick<Task, 'titolo' | 'note' | 'priorita' | 'scadenza' | 'owner'>>,
): Promise<void> {
  const { error } = await supabase.from('tasks').update(patch).eq('id', id);
  if (error) throw error;
}

/** Segna un task come completato (o lo riapre), tracciando la data. */
export async function completaTask(id: string, completata: boolean): Promise<void> {
  const { error } = await supabase
    .from('tasks')
    .update({ completata, completata_at: completata ? new Date().toISOString() : null })
    .eq('id', id);
  if (error) throw error;
}

/** Elimina un task (azione dell'utente sul proprio elenco). */
export async function eliminaTask(id: string): Promise<void> {
  const { error } = await supabase.from('tasks').delete().eq('id', id);
  if (error) throw error;
}

/**
 * Notifica via email l'assegnatario di un task (Edge Function `notifica-task`).
 * Best effort: se lo SMTP non è configurato la funzione non invia nulla.
 */
export async function notificaAssegnazioneTask(taskId: string): Promise<void> {
  const url = `${env.supabaseUrl().replace(/\/$/, '')}/functions/v1/notifica-task`;
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: env.supabaseAnonKey(),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ task_id: taskId }),
  });
}

// ── Richieste di pagamento (aperte dal commerciale, gestite da Finance) ────────

/** Le richieste di pagamento visibili (RLS: le mie; admin: tutte), col nome owner. */
export async function fetchRichiestePagamento(): Promise<RichiestaPagamento[]> {
  const { data, error } = await supabase
    .from('richieste_pagamento')
    .select('*, rate_pagamento(*)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  const righe = (data ?? []).map((r: any) => ({
    ...r,
    importo: Number(r.importo),
    importo_incassato: Number(r.importo_incassato),
    rate: (r.rate_pagamento ?? [])
      .map((x: any) => ({ ...x, importo: Number(x.importo), percentuale: x.percentuale != null ? Number(x.percentuale) : null }))
      .sort((a: any, b: any) => a.ordine - b.ordine),
  })) as RichiestaPagamento[];
  const ids = [...new Set(righe.map((r) => r.owner))];
  if (ids.length) {
    const profili = await fetchProfiles();
    const nome = new Map(profili.map((p) => [p.id, nomeDaProfilo(p)]));
    for (const r of righe) r.owner_nome = nome.get(r.owner) ?? null;
  }
  return righe;
}

/** Crea una richiesta di pagamento da una trattativa, con eventuali rate (split). */
export async function inserisciRichiestaPagamento(r: {
  cliente: string;
  importo: number;
  causale?: string | null;
  scadenza?: string | null;
  deal_id?: string | null;
  place_id?: string | null;
  rate?: { etichetta?: string | null; modo: 'valore' | 'percentuale'; percentuale?: number | null; importo: number; scadenza?: string | null }[];
}): Promise<RichiestaPagamento> {
  const { data: u } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('richieste_pagamento')
    .insert({
      owner: u.user?.id ?? undefined,
      cliente: r.cliente,
      importo: r.importo,
      causale: r.causale ?? null,
      scadenza: r.scadenza ?? null,
      deal_id: r.deal_id ?? null,
      place_id: r.place_id ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  if (r.rate?.length) {
    const righe = r.rate.map((x, i) => ({
      richiesta_id: data.id,
      etichetta: x.etichetta ?? null,
      modo: x.modo,
      percentuale: x.percentuale ?? null,
      importo: x.importo,
      scadenza: x.scadenza ?? null,
      ordine: i,
    }));
    const { error: e2 } = await supabase.from('rate_pagamento').insert(righe);
    if (e2) throw e2;
  }
  return { ...data, importo: Number(data.importo), importo_incassato: Number(data.importo_incassato) } as RichiestaPagamento;
}

/**
 * Segna una rata pagata/non pagata e ricalcola il rollup della richiesta.
 * Ritorna lo stato risultante, così il chiamante sa se l'incasso è completo
 * (es. per comunicare il pagamento della pro-forma a Deluxy Partner).
 */
export async function aggiornaRataPagata(
  rata: { id: string; richiesta_id: string },
  pagata: boolean,
): Promise<StatoPagamento> {
  const { error } = await supabase.from('rate_pagamento').update({ pagata }).eq('id', rata.id);
  if (error) throw error;
  // Ricalcola incassato/stato della richiesta dalle sue rate.
  const { data: rate } = await supabase
    .from('rate_pagamento')
    .select('importo, pagata')
    .eq('richiesta_id', rata.richiesta_id);
  const { data: req } = await supabase.from('richieste_pagamento').select('importo').eq('id', rata.richiesta_id).single();
  const incassato = (rate ?? []).filter((x: any) => x.pagata).reduce((s: number, x: any) => s + Number(x.importo), 0);
  const totale = Number(req?.importo ?? 0);
  const stato: StatoPagamento = incassato <= 0 ? 'inviata' : incassato >= totale ? 'pagata' : 'parziale';
  await supabase
    .from('richieste_pagamento')
    .update({ importo_incassato: incassato, stato, updated_at: new Date().toISOString() })
    .eq('id', rata.richiesta_id);
  return stato;
}

/**
 * Preferenza "emetti la pro-forma insieme alla richiesta" (Profilo → Pagamenti).
 * Attiva di default: se la migrazione 0030 non c'è o il profilo manca, torna true.
 */
export async function fetchPreferenzaProforma(): Promise<boolean> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return true;
  const { data, error } = await supabase.from('profiles').select('proforma_default').eq('id', u.user.id).single();
  if (error) return true;
  return (data as any)?.proforma_default ?? true;
}

/** Salva la preferenza pro-forma (tollerante se la migrazione 0030 non è applicata). */
export async function salvaPreferenzaProforma(attiva: boolean): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return;
  const { error } = await supabase.from('profiles').update({ proforma_default: attiva }).eq('id', u.user.id);
  if (error) throw error;
}

/**
 * Salva sulla richiesta il riferimento della pro-forma emessa su Deluxy Partner.
 * Tollerante: se la migrazione 0029 (colonne proforma_*) non è ancora applicata,
 * il riferimento non si salva ma la richiesta resta valida.
 */
export async function salvaRiferimentoProforma(id: string, numero: string, url: string): Promise<void> {
  const { error } = await supabase
    .from('richieste_pagamento')
    .update({ proforma_numero: numero, proforma_url: url, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error && !/proforma_/.test(error.message ?? '')) throw error;
}

/** Aggiorna l'esito/monitoraggio di una richiesta (stato, incassato, nota, scadenza). */
export async function aggiornaRichiestaPagamento(
  id: string,
  patch: Partial<Pick<RichiestaPagamento, 'stato' | 'importo_incassato' | 'nota' | 'scadenza' | 'importo' | 'causale'>>,
): Promise<void> {
  const { error } = await supabase
    .from('richieste_pagamento')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

/**
 * Chiede l'invio del riepilogo email (task in scadenza + follow-up) all'utente
 * corrente (Edge Function `promemoria`). Inerte se SMTP non configurato.
 */
export async function inviaPromemoriaEmail(): Promise<{ sent: boolean; reason?: string }> {
  const url = `${env.supabaseUrl().replace(/\/$/, '')}/functions/v1/promemoria`;
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: env.supabaseAnonKey(),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(`Promemoria ${res.status}`);
  return (await res.json()) as { sent: boolean; reason?: string };
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
  sincronizzaPlaceRegistro(placeId).catch(() => {}); // best-effort verso Anagrafiche

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
