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
  titolo?: string | null; // nome del deal HubSpot (quando non c'è una linea Scout)
  origine?: 'scout' | 'hubspot' | 'anagrafiche';
  anagrafiche_stato?: string | null; // stato dal registro Anagrafiche, se il negozio è schedato
  is_partner?: boolean; // registro = 'attivo' (già cliente/partner)
  owner_nome?: string | null; // nome del venditore che possiede la trattativa
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
    .select('id, nome, linea_ipotizzata, anagrafiche_stato, hubspot_company_id')
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
  const { data: scout, error } = await supabase.from('deals').select('*, places(nome)');
  if (error) throw error;
  const scoutRows: TrattativaConLuogo[] = (scout ?? []).map((r: any) =>
    arricchisci(
      { ...r, place_nome: r.places?.nome ?? null, titolo: null, origine: 'scout' },
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
  const placeByCompany = new Map<string, { id: string; nome: string }>();
  const companyName = new Map<string, string>();
  if (companyIds.length) {
    const { data: places } = await supabase
      .from('places')
      .select('id, nome, hubspot_company_id')
      .in('hubspot_company_id', companyIds);
    for (const p of places ?? []) placeByCompany.set(p.hubspot_company_id, { id: p.id, nome: p.nome });
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
        owner: null,
        hubspot_deal_id: d.hubspot_id,
        place_nome: nomeNegozio,
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
      owner: null,
      hubspot_deal_id: null,
      place_nome: r.nome,
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
function nomeDaProfilo(p: Profilo): string {
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
  patch: Partial<Pick<Deal, 'linea' | 'fase' | 'valore_atteso' | 'next_action'>>,
): Promise<void> {
  const { error } = await supabase.from('deals').update(patch).eq('id', id);
  if (error) throw error;
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
