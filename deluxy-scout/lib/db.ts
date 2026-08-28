// Accesso ai dati: un solo posto per le query Supabase usate dalle schermate.
import { supabase } from '@/lib/supabase';
import type { AffiliazioneRow, Contact, Deal, EsitoVisita, FonteLead, Lead, Linea, Ordine, Place, Profilo, RichiestaCliente, RichiestaPagamento, StatoAffiliazione, StatoPagamento, StatoPlace, Task, Visit } from '@/types';
import { LINEE_ATTIVE, canonizzaLinee, statoDaEsito, statoRegistroDaAffiliazione } from '@/types';
import { env } from '@/lib/env';
import { syncVisita } from '@/lib/hubspot';
import { notificaArchiviazioneReferente, sincronizzaNegozioRegistro, trovaAnagraficaGiaPresente, type EsitoRegistro } from '@/lib/anagrafiche';
import { analizzaMessaggioLead } from '@/lib/lead-parse';
import { GIORNI_FOLLOWUP_DEAL, GIORNI_FOLLOWUP_LEAD, traGiorni } from '@/lib/cadenze';
import { pulisciTermine } from '@/lib/ricerca';

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
  place_account?: string | null; // account = venditore che segue il cliente (dal registro Anagrafiche)
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
  /** Compare fra i servizi richiedibili nella casa del partner (migr. 0071). */
  in_vetrina: boolean;
  archiviata: boolean;
  parent_id: string | null;
  ordine: number;
  icona: string | null;
  pitch: string | null;
  /** Il servizio della piattaforma consegne da cui è nata (migr. 0083).
   *  ⚠️ Riferimento, non copia: prezzi e modello restano di là. */
  servizio_codice?: string | null;
  sottolinee?: LineaInteresse[]; // valorizzato solo per le linee top-level
}

/** Albero delle linee: top-level attive+inattive (non archiviate) con le sottolinee. */
export async function fetchLineeInteresse(): Promise<LineaInteresse[]> {
  const { data, error } = await supabase
    .from('lines')
    .select('id, nome, attiva_bool, in_vetrina, archiviata, parent_id, ordine, icona, pitch, servizio_codice')
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
  /** Se compare fra i servizi richiedibili nella casa del partner. */
  in_vetrina?: boolean;
  /** Il servizio della piattaforma consegne da cui nasce (migr. 0083). */
  servizio_codice?: string | null;
}): Promise<void> {
  const { error } = await supabase.from('lines').insert({
    nome: l.nome.trim(),
    parent_id: l.parent_id ?? null,
    icona: l.icona ?? null,
    pitch: l.pitch ?? null,
    attiva_bool: l.attiva_bool ?? true,
    in_vetrina: l.in_vetrina ?? true,
    servizio_codice: l.servizio_codice ?? null,
  });
  if (error) throw error;
}

/** Modifica una linea/sottolinea (nome, icona, pitch, attiva, ordine). Solo admin. */
export async function aggiornaLinea(
  id: string,
  patch: Partial<Pick<LineaInteresse, 'nome' | 'icona' | 'pitch' | 'attiva_bool' | 'in_vetrina' | 'ordine'>>,
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
  // ⚠️ A PAGINE, obbligatoriamente. Una `select('*')` secca si ferma a **1000
  // righe** (limite di PostgREST) e i negozi sono già 1313: quelli oltre la
  // soglia sparivano da Mappa, Selezionati e Potenziali. Senza `order` il
  // troncamento non è nemmeno stabile — un negozio appena stellato compariva o
  // no a seconda della query, e sembrava che la stella non funzionasse.
  const BLOCCO = 1000;
  const righe: Place[] = [];
  for (let da = 0; ; da += BLOCCO) {
    const { data, error } = await supabase
      .from('places')
      .select('*')
      .order('id') // ordine stabile: senza, le pagine possono ripetere o saltare righe
      .range(da, da + BLOCCO - 1);
    if (error) throw error;
    const blocco = (data ?? []) as Place[];
    // Nomi di linea canonici già qui: le liste, i filtri e i tag leggono tutti
    // da `fetchPlaces`, e senza questo passaggio «Regali aziendali» e
    // «Gifting» — che sono lo stesso interesse — restavano due voci distinte
    // in ogni filtro dell'app.
    for (const p of blocco) {
      if (p.linea_ipotizzata) p.linea_ipotizzata = canonizzaLinee([p.linea_ipotizzata])[0] ?? p.linea_ipotizzata;
      if (p.linee_ipotizzate?.length) p.linee_ipotizzate = canonizzaLinee(p.linee_ipotizzate);
    }
    righe.push(...blocco);
    if (blocco.length < BLOCCO) break;
  }
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
  contesto: 'mappa' | 'affiliazioni'; // da dove è stato salvato (e dove si riapre)
}

export async function fetchPreferiti(): Promise<IndirizzoPreferito[]> {
  const { data, error } = await supabase
    .from('indirizzi_preferiti')
    .select('id, etichetta, indirizzo, lat, lng, contesto')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as IndirizzoPreferito[];
}

export async function salvaPreferito(p: {
  etichetta: string;
  indirizzo: string;
  lat: number;
  lng: number;
  contesto?: 'mappa' | 'affiliazioni';
}): Promise<void> {
  const { error } = await supabase.from('indirizzi_preferiti').insert({
    etichetta: p.etichetta.trim() || p.indirizzo.trim(),
    indirizzo: p.indirizzo.trim(),
    lat: p.lat,
    lng: p.lng,
    contesto: p.contesto ?? 'mappa',
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
export async function sincronizzaPlaceRegistro(
  placeId: string,
  opzioni?: {
    /** Referenti da portare nel registro insieme al negozio (fusi di là). */
    contatti?: { nome?: string | null; email?: string | null; telefono?: string | null; ruolo?: string | null }[];
    /**
     * Città da usare al posto della zona di Scout, quando si sa già a quale
     * scheda del registro si sta scrivendo: il suo upsert aggancia per
     * *nome + città*, e mandargli la città che ha LUI è il modo di finire su
     * quella scheda invece di crearne una seconda.
     */
    citta?: string | null;
  },
): Promise<EsitoRegistro> {
  try {
    const { data: p } = await supabase
      .from('places')
      .select('nome, zona, indirizzo, categoria, stato, stato_affiliazione, anagrafiche_account, linea_ipotizzata, linee_ipotizzate, anagrafiche_id')
      .eq('id', placeId)
      .single();
    if (!p) return { ok: false, reason: 'negozio_non_trovato' };
    // Canonizzate PRIMA di partire: il registro accetta solo le chiavi del suo
    // catalogo e scarta in silenzio i nomi fuori lista — «Regali aziendali»
    // sarebbe arrivato e sparito senza che nessuno se ne accorgesse.
    const linee = canonizzaLinee(p.linee_ipotizzate?.length ? p.linee_ipotizzate : p.linea_ipotizzata ? [p.linea_ipotizzata] : []);
    const esito = await sincronizzaNegozioRegistro({
      placeId,
      nome: p.nome,
      citta: opzioni?.citta !== undefined ? opzioni.citta : p.zona ?? null,
      indirizzo: p.indirizzo ?? null,
      categoria: p.categoria ?? null,
      stato: p.stato ?? null,
      // Stato "vero" di Anagrafiche (8 valori): se impostato ha priorità sulla
      // derivazione dai 4 stati di pipeline. ⚠️ Tradotto: `selezionato` è di
      // Scout e il registro non lo conosce — per lui è un prospect.
      statoRegistro: statoRegistroDaAffiliazione(p.stato_affiliazione),
      // Account = venditore che segue il cliente (aggiornato anche su Anagrafiche).
      account: p.anagrafiche_account ?? null,
      linee,
      contatti: opzioni?.contatti,
    });
    // L'AGGANCIO, appena il registro ci dice il suo id. Senza questa riga il
    // negozio finiva nel registro ma in Scout restava «non schedato» fino
    // all'import della notte: le schermate che guardano `anagrafiche_id`
    // (Copertura, «nel registro» sulla trattativa) dicevano di no su
    // un'anagrafica che avevamo appena creato noi.
    //
    // ⚠️ Solo se il posto non ne ha già uno, e senza far male se l'UPDATE non
    // passa: `anagrafiche_id` ha un indice UNICO, quindi se il registro ha
    // fuso la nostra scrittura in una scheda già agganciata a un ALTRO
    // negozio di Scout la scrittura viene rifiutata (23505). Non è un guasto:
    // è un doppione locale da unire, e si dice.
    if (esito.ok && esito.id && !p.anagrafiche_id) {
      const { error } = await supabase.from('places').update({ anagrafiche_id: esito.id }).eq('id', placeId);
      if (error) {
        return { ...esito, reason: error.code === '23505' ? 'gia_agganciato_ad_altro_negozio' : `aggancio_${error.code ?? 'fallito'}` };
      }
    }
    return esito;
  } catch {
    /* best-effort: non deve mai far fallire l'azione dell'utente */
    return { ok: false, reason: 'non_raggiungibile' };
  }
}

/**
 * **Il negozio dev'essere nel registro Anagrafiche: se non c'è, si crea.**
 *
 * Tre strade, in quest'ordine — la prima che risponde vince:
 *  1. il negozio ha già `anagrafiche_id` → **c'è**, non si scrive niente;
 *  2. il registro ha un'anagrafica con lo stesso nome (e città compatibile) →
 *     **c'era già**: la si aggancia qui e le si porta il referente, mandando la
 *     città che ha LEI perché l'upsert finisca su quella scheda;
 *  3. nessuno dei due → si crea, e l'id che torna aggancia il negozio.
 *
 * ⚠️ Il passo 2 non è pignoleria: la zona in Scout è vuota su più della metà
 * dei negozi, e senza quel controllo il registro — che quando la città manca
 * cerca fra le anagrafiche *senza* città — avrebbe creato una seconda scheda
 * accanto a quella giusta. Nel registro un doppione non è un fastidio: è la
 * fonte di verità delle anagrafiche B2B che si sdoppia.
 */
export async function assicuraNegozioNelRegistro(
  placeId: string,
  contatti?: { nome?: string | null; email?: string | null; telefono?: string | null; ruolo?: string | null }[],
): Promise<EsitoRegistro> {
  const { data: p } = await supabase
    .from('places')
    .select('nome, zona, anagrafiche_id')
    .eq('id', placeId)
    .maybeSingle();
  if (!p) return { ok: false, reason: 'negozio_non_trovato' };
  // 1. Già schedato: c'è, e lo sappiamo senza chiedere niente a nessuno.
  if (p.anagrafiche_id) return { ok: true, esito: 'gia_presente', id: p.anagrafiche_id, nome: p.nome };
  // 2. C'è ma non lo sapevamo (il legame non era mai stato scritto).
  let citta: string | null | undefined;
  try {
    const { partner } = await trovaAnagraficaGiaPresente(p.nome, p.zona ?? null);
    if (partner) citta = partner.citta;
  } catch {
    /* registro non raggiungibile in lettura: si prova comunque a scrivere */
  }
  // 3. Si scrive: crea o fonde, lo decide il registro (è lui che possiede
  //    l'identità delle anagrafiche).
  return sincronizzaPlaceRegistro(placeId, { contatti, ...(citta !== undefined ? { citta } : {}) });
}

/**
 * Il negozio che NON C'È: si crea qui, dalla richiesta.
 *
 * ⚠️ Segnalato dall'utente il 26/08/2026 sera guardando la finestra di
 * qualifica: «qualifica non crea, vedo ancora solo la possibilità di ricerca».
 * Aveva ragione, ed era il caso più frequente: una richiesta dal modulo del
 * sito porta il nome di una PERSONA che nel CRM non c'è ancora — cercarla non
 * la trova, e senza un modo per crearla la richiesta restava lì.
 *
 * Nasce a **0,0**: senza indirizzo non c'è niente da geocodificare, e meglio un
 * lead senza posizione che un lead perso — la stessa scelta che fanno «Prendi
 * in carico» e l'auto-qualifica delle Edge Function. La posizione si mette poi
 * dalla scheda.
 */
export async function creaPlaceDaRichiesta(
  nome: string,
  dati?: { zona?: string | null; indirizzo?: string | null; categoria?: string | null },
): Promise<Place> {
  const pulito = nome.trim();
  if (!pulito) throw new Error('Serve un nome per creare il negozio.');
  const { data: u } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('places')
    .insert({
      nome: pulito,
      lat: 0,
      lng: 0,
      stato: 'da_visitare',
      // Quello che la richiesta diceva: città, indirizzo e categoria arrivano
      // dalla lettura del messaggio (AI o regole) e passano di qui al registro
      // Anagrafiche, che li vuole per non tenere una scheda muta.
      zona: dati?.zona?.trim() || null,
      indirizzo: dati?.indirizzo?.trim() || null,
      categoria: dati?.categoria?.trim() || null,
      // Chi l'ha creato può anche cancellarlo (policy di delete, migr. 0054):
      // un negozio nato per sbaglio da qui dev'essere disfacibile da qui.
      creato_da: u.user?.id ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as Place;
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

// ── Negozi solo SCOPERTI (cache Google) ───────────────────────────────────────
//
// La scoperta non crea più target: i negozi trovati da Google vivono nella cache
// `google_negozi` (migrazione 0038) e arrivano al client con id `g:<place_id>`.
// Diventano un target vero — riga in `places`, con `creato_da` = chi l'ha preso —
// alla prima azione di una persona: stella, visita, cambio stato.

/** Se l'id è di un negozio ancora solo scoperto, il suo google_place_id; altrimenti null. */
export function idScoperto(id: string): string | null {
  return id.startsWith('g:') ? id.slice(2) : null;
}

/**
 * Garantisce che il negozio esista in `places` e ne torna l'id vero.
 * Per un target già esistente non fa nulla. Per un negozio solo scoperto crea la
 * riga (upsert su `google_place_id`: due venditori che lo prendono insieme non
 * creano un doppione) e la marca come presa da chi sta agendo.
 */
export async function assicuraPlace(p: Place): Promise<string> {
  const gid = idScoperto(p.id);
  if (!gid) return p.id;

  const { data: userRes } = await supabase.auth.getUser();

  // Niente upsert con onConflict: l'indice unico su google_place_id è PARZIALE
  // ("where google_place_id is not null") e Postgres non lo accetta in ON
  // CONFLICT. Si guarda prima se il negozio esiste già, poi si inserisce.
  const esistente = async () => {
    const { data } = await supabase.from('places').select('id').eq('google_place_id', gid).maybeSingle();
    return data?.id as string | undefined;
  };
  const gia = await esistente();
  if (gia) return gia;

  const { data, error } = await supabase
    .from('places')
    .insert({
      nome: p.nome,
      indirizzo: p.indirizzo,
      lat: p.lat,
      lng: p.lng,
      categoria: p.categoria,
      priorita: p.priorita,
      linea_ipotizzata: p.linea_ipotizzata,
      aggancio_apertura: p.aggancio_apertura,
      google_place_id: gid,
      google_types: p.google_types ?? null,
      google_rating: p.google_rating ?? null,
      google_reviews: p.google_reviews ?? null,
      source: 'google',
      stato: 'da_visitare',
      creato_da: userRes.user?.id ?? null,
    })
    .select('id')
    .single();

  if (error) {
    // Due venditori l'hanno preso nello stesso istante: vince chi è arrivato
    // prima, l'altro riusa la sua riga invece di vedere un errore.
    if (error.code === '23505') {
      const altrui = await esistente();
      if (altrui) return altrui;
    }
    throw error;
  }
  sincronizzaPlaceRegistro(data.id).catch(() => {}); // best-effort verso Anagrafiche
  return data.id as string;
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
  account: string | null; // chi segue il cliente (dal registro Anagrafiche)
  telefono: string | null; // primo recapito utile, per le azioni rapide
  email: string | null;
}

/** Tutti i clienti: negozi cliente in Scout OPPURE partner attivi nel registro. */
export async function fetchClienti(): Promise<Cliente[]> {
  const { data, error } = await supabase
    .from('places')
    .select('id, nome, indirizzo, zona, categoria, linea_ipotizzata, linee_ipotizzate, stato, anagrafiche_stato, anagrafiche_account, contacts(telefono, email, archiviato)')
    .or('stato.eq.cliente,anagrafiche_stato.eq.attivo')
    .order('nome');
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    nome: r.nome,
    indirizzo: r.indirizzo ?? null,
    zona: r.zona ?? null,
    categoria: r.categoria ?? null,
    // Nomi canonici del catalogo: nei dati convivono scritture vecchie
    // («Regali aziendali») e nuove («Gifting») per lo stesso interesse, e nei
    // filtri comparivano come due voci diverse.
    linee: canonizzaLinee(r.linee_ipotizzate?.length ? r.linee_ipotizzate : r.linea_ipotizzata ? [r.linea_ipotizzata] : []),
    cliente_scout: r.stato === 'cliente',
    partner_registro: r.anagrafiche_stato === 'attivo',
    account: r.anagrafiche_account ?? null,
    // Primo recapito dei contatti non archiviati: accende Chiama/WhatsApp/Email.
    telefono: (r.contacts ?? []).find((c: any) => c.telefono && !c.archiviato)?.telefono ?? null,
    email: (r.contacts ?? []).find((c: any) => c.email && !c.archiviato)?.email ?? null,
  })) as Cliente[];
}

/** Aggiorna i campi editabili di un'attività (correzione dati sul campo). */
export async function aggiornaPlace(
  id: string,
  // `lat`/`lng` incluse: cambiando indirizzo dalla ricerca Google si sposta
  // anche il punto sulla mappa. Senza, un negozio corretto nell'indirizzo
  // restava piantato sulle vecchie coordinate — e sulla mappa è il punto che
  // conta, non il testo.
  patch: Partial<
    Pick<Place, 'nome' | 'indirizzo' | 'zona' | 'categoria' | 'settore' | 'priorita' | 'stato' | 'stato_affiliazione' | 'livello_rapporto' | 'anagrafiche_account' | 'linea_ipotizzata' | 'linee_ipotizzate' | 'aggancio_apertura' | 'lat' | 'lng'>
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

/**
 * Gli id dei negozi che hanno almeno un contatto in rubrica.
 *
 * Serve ai livelli: dal 26/07/2026 un negozio diventa **Prospect** solo quando
 * c'è una persona con cui parlare — prima resta **Selezionato**, anche se
 * stellato o già visitato (decisione utente). Si carica una volta per tutta la
 * lista: chiederlo riga per riga sarebbe una query per negozio.
 */
export async function fetchPlaceIdConContatto(): Promise<Set<string>> {
  return idPaginati('contacts');
}

/**
 * Gli id dei negozi a cui è stato **avviato un contatto**: mail partita
 * dall'app, chiamata registrata o visita fatta. È ciò che distingue un LEAD da
 * un SELEZIONATO mai toccato (vedi lib/livelli.ts).
 *
 * Le tre fonti restano separate perché lo sono davvero: `contatti_avviati`
 * copre i canali senza registro proprio (email, WhatsApp), le chiamate e le
 * visite hanno già il loro. Qui si uniscono, non si duplicano.
 *
 * Best-effort per fonte: se `contatti_avviati` non esiste ancora (migrazione
 * 0046 non applicata) le altre due continuano a valere, e i lead si vedono lo
 * stesso — non si spegne tutta la sezione per una tabella mancante.
 */
export async function fetchPlaceIdContattati(): Promise<Set<string>> {
  const fonti = await Promise.all([
    idPaginati('contatti_avviati').catch(() => new Set<string>()),
    idPaginati('chiamate').catch(() => new Set<string>()),
    idPaginati('visits').catch(() => new Set<string>()),
  ]);
  const tutti = new Set<string>();
  for (const f of fonti) for (const id of f) tutti.add(id);
  return tutti;
}

/**
 * Come è partito il contatto. Chiamate e visite NON sono qui: hanno le loro
 * tabelle (`chiamate`, `visits`). `web` = è arrivato lui — modulo del sito,
 * social, richiesta spontanea.
 */
export type CanaleContatto = 'email' | 'whatsapp' | 'web' | 'altro';

/**
 * Registra un contatto avviato verso un negozio.
 *
 * Best-effort **di proposito**: se questa scrittura fallisce (o la tabella non
 * c'è ancora) la mail è comunque partita, e far fallire l'invio per il registro
 * sarebbe peggio del buco nel registro. L'errore torna a chi chiama, che decide
 * se dirlo o ignorarlo.
 */
export async function registraContattoAvviato(dati: {
  placeIds: string[];
  canale: CanaleContatto;
  scriptId?: string | null;
  oggetto?: string | null;
  destinatari?: string[];
}): Promise<void> {
  const ids = Array.from(new Set(dati.placeIds.filter(Boolean)));
  if (!ids.length) return;
  const { error } = await supabase.from('contatti_avviati').insert(
    ids.map((place_id) => ({
      place_id,
      canale: dati.canale,
      script_id: dati.scriptId ?? null,
      oggetto: dati.oggetto ?? null,
      destinatari: dati.destinatari ?? null,
    })),
  );
  if (error) throw error;
}

/**
 * Tutti i `place_id` di una tabella, **a blocchi**.
 *
 * ⚠️ Trappola già pagata due volte: senza `range()` PostgREST ne restituisce
 * 1000 e basta, senza errore. Con la rubrica sopra le mille righe i negozi in
 * fondo risultavano «senza contatto» e retrocedevano di livello da soli.
 */
/**
 * Chiude il richiamo post-visita di un negozio (la «×» nella coda).
 *
 * Non cancella niente: scrive QUANDO è stato chiuso. La coda lo salta finché
 * l'ultima visita è più vecchia di questa data, quindi una visita nuova con
 * esito «interessato» o «da richiamare» lo rimette in lista da sola.
 *
 * ⚠️ Un UPDATE che la RLS non fa passare **non è un errore**: torna zero righe.
 * Senza guardarle, l'app direbbe «chiuso» a un richiamo che domani ricompare.
 */
export async function chiudiRichiamo(placeId: string): Promise<void> {
  const { data: sessione } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('places')
    .update({
      richiamo_chiuso_il: new Date().toISOString(),
      richiamo_chiuso_da: sessione?.user?.id ?? null,
    })
    .eq('id', placeId)
    .select('id');
  if (error) {
    if (/richiamo_chiuso/.test(error.message)) {
      throw new Error(
        'Manca la migrazione 0060 sul database: la colonna «richiamo_chiuso_il» non esiste ancora. ' +
          'Si applica con APPLICA-MIGRAZIONI.cmd (o node scripts/allinea-supabase.mjs).',
      );
    }
    throw error;
  }
  if (!data?.length) {
    throw new Error('Richiamo non chiuso: il negozio non è stato trovato, o la scrittura è stata rifiutata.');
  }
}

/**
 * Ultimo contatto per negozio: chiamate e mail partite, la data più recente.
 *
 * Serve alla coda richiami (`daRicontattare`), che senza questo conta i giorni
 * dalla VISITA e quindi non si azzera mai — un negozio richiamato ieri restava
 * «in ritardo» di un mese.
 *
 * Best-effort per fonte: se una tabella manca o la RLS la nega, quella torna
 * vuota e l'altra risponde lo stesso. Una coda senza una fonte è imprecisa;
 * una coda che non si carica è una schermata rotta.
 */
export async function fetchUltimoContattoPerPlace(): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const fonti = await Promise.all([
    contattiPaginati('chiamate').catch(() => []),
    contattiPaginati('contatti_avviati').catch(() => []),
  ]);
  for (const righe of fonti) {
    for (const r of righe) {
      const cur = out.get(r.place_id);
      if (!cur || Date.parse(r.created_at) > Date.parse(cur)) out.set(r.place_id, r.created_at);
    }
  }
  return out;
}

/** Come `idPaginati`, ma tiene anche la data. Ordine per `id`: unico, quindi i blocchi non saltano righe. */
async function contattiPaginati(tabella: string): Promise<{ place_id: string; created_at: string }[]> {
  const BLOCCO = 1000;
  const righe: { place_id: string; created_at: string }[] = [];
  for (let da = 0; ; da += BLOCCO) {
    const { data, error } = await supabase
      .from(tabella)
      .select('place_id, created_at')
      .order('id')
      .range(da, da + BLOCCO - 1);
    if (error) throw error;
    const blocco = (data ?? []) as any[];
    for (const r of blocco) if (r.place_id && r.created_at) righe.push({ place_id: r.place_id, created_at: r.created_at });
    if (blocco.length < BLOCCO) break;
  }
  return righe;
}

async function idPaginati(tabella: string): Promise<Set<string>> {
  const BLOCCO = 1000;
  const ids = new Set<string>();
  for (let da = 0; ; da += BLOCCO) {
    const { data, error } = await supabase
      .from(tabella)
      .select('place_id')
      .order('place_id') // ordine stabile: senza, i blocchi possono ripetersi
      .range(da, da + BLOCCO - 1);
    if (error) throw error;
    const blocco = data ?? [];
    for (const r of blocco) if ((r as any).place_id) ids.add((r as any).place_id);
    if (blocco.length < BLOCCO) break;
  }
  return ids;
}

/**
 * TUTTE le righe di una tabella, a blocchi (27/08/2026).
 *
 * ⚠️ La trappola del tetto a 1000 righe è già stata pagata tre volte in questo
 * file, e ogni volta è stata chiusa solo dove faceva male: `idPaginati` e
 * `contattiPaginati` paginano, ma tre letture piene erano rimaste indietro —
 * la rubrica intera, i recapiti dei negozi e gli id già presi dal registro.
 * PostgREST non protesta: risponde 200 con le prime mille righe, e il resto
 * semplicemente non esiste. Qui la paginazione è generica, così la prossima
 * lettura piena non deve ricordarsi di niente.
 *
 * @param colonne  la `select` da fare (le stesse colonne che servono a chi legge)
 * @param ordine   colonna di ordinamento: serve a rendere i blocchi STABILI —
 *                 senza, due blocchi possono ripetere e saltare righe.
 */
async function tutteLeRighe<T = any>(
  tabella: string,
  colonne: string,
  ordine: string,
  // Filtri aggiuntivi sulla query (es. q => q.is('annullata_il', null)):
  // servono per portare qui anche le letture filtrate senza perdere il where.
  filtra?: (q: any) => any,
): Promise<T[]> {
  const BLOCCO = 1000;
  const righe: T[] = [];
  for (let da = 0; ; da += BLOCCO) {
    let query = supabase.from(tabella).select(colonne);
    if (filtra) query = filtra(query);
    const { data, error } = await query.order(ordine).range(da, da + BLOCCO - 1);
    if (error) throw error;
    const blocco = (data ?? []) as T[];
    righe.push(...blocco);
    if (blocco.length < BLOCCO) break;
  }
  return righe;
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
  // ⚠️ Le ANNULLATE non contano (migr. 0072): sono state messe da parte, e
  // farle comparire fra le trattative del negozio le rimetterebbe nei conti.
  const { data, error } = await supabase
    .from('deals')
    .select('*')
    .eq('place_id', placeId)
    .is('annullata_il', null);
  if (error) throw error;
  return (data ?? []) as Deal[];
}

export async function fetchAllVisits(): Promise<Visit[]> {
  // ⚠️ Paginata con tutteLeRighe (giuria performance 28/08): PostgREST tronca
  // a 1000 righe CON UN 200 — le visite crescono più in fretta dei negozi, e
  // la Dashboard avrebbe mostrato conteggi sbagliati senza dirlo. L'ordine
  // «più recenti prima» del vecchio contratto si rimette qui sotto.
  const righe = await tutteLeRighe<Visit>('visits', '*', 'id');
  righe.sort((a, b) => String(b.data ?? '').localeCompare(String(a.data ?? '')));
  return righe;
}

export async function fetchAllDeals(): Promise<Deal[]> {
  // Come sopra: le annullate non entrano nei conti di nessuna schermata.
  // ⚠️ Paginata (giuria 28/08): il tetto delle 1000 righe qui falsava i conti.
  return tutteLeRighe<Deal>('deals', '*', 'id', (q) => q.is('annullata_il', null));
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

/**
 * Token privato del feed iCal dell'utente corrente.
 *
 * ⚠️ NON si legge più da `profiles` (27/08/2026, revisione di sicurezza). La
 * RLS filtra le RIGHE, non le COLONNE: con `profiles_read using (true)` un
 * `select cal_token from profiles` restituiva il token di TUTTI. E quel token
 * apre il feed `.ics` senza sessione — quindi bastava leggerlo per scaricarsi
 * i task di un collega da qualsiasi browser, per sempre, anche dopo che
 * l'account era stato sospeso. Il `.eq('id', ...)` qui sotto era una buona
 * educazione del client, non un confine.
 *
 * Ora la colonna non è più selezionabile da nessuno (migr. 0085) e il proprio
 * token si chiede a una funzione che sa da sé chi la chiama.
 */
export async function fetchCalToken(): Promise<string | null> {
  const { data, error } = await supabase.rpc('mio_cal_token');
  if (error) return null;
  return (data as string) ?? null;
}

/**
 * Cambia il proprio token: il vecchio smette di valere all'istante.
 *
 * Serviva già prima e non c'era. Un token che non si ruota, quando esce di
 * mano, resta fuori per sempre — non c'è modo di richiamarlo.
 */
export async function rigeneraCalToken(): Promise<string | null> {
  const { data, error } = await supabase.rpc('rigenera_cal_token');
  if (error) throw error;
  return (data as string) ?? null;
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
  // ⚠️ PAGINATA: la rubrica è sopra le mille righe. Senza, PostgREST ne
  // restituiva 1000 in ordine di nome — le persone in fondo all'alfabeto
  // sparivano dalla Rubrica e, peggio, non entravano nelle liste dei
  // destinatari di sequenze e invii: a quelle la mail non partiva mai.
  const data = await tutteLeRighe<any>(
    'contacts',
    '*, places(nome, indirizzo, linea_ipotizzata, stato, zona, hubspot_deal_aperta, anagrafiche_id)',
    'nome',
  );
  return (data ?? []).map((r: any) => ({
    ...r,
    place_nome: r.places?.nome ?? null,
    place_indirizzo: r.places?.indirizzo ?? null,
    // Canonizzata: senza, il filtro Interessi della Rubrica mostrava
    // «Gifting» e «Regali aziendali» come due voci separate.
    place_linea: canonizzaLinee(r.places?.linea_ipotizzata ? [r.places.linea_ipotizzata] : [])[0] ?? null,
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
  anagrafiche_account: string | null;
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
 *
 * ⚠️ LE ANNULLATE SONO FUORI, salvo chiederle (27/08/2026). Il cestino delle
 * trattative non cambia la `fase` — «annullata» è un fatto amministrativo e sta
 * in una colonna sua (migr. 0072) — quindi una trattativa cestinata resta
 * `appointmentscheduled` per chiunque guardi solo la fase. Questa funzione le
 * restituiva sempre, e SETTE consumatori su otto non le rifiltravano: la
 * cestinata continuava a gonfiare la pipeline della Dashboard, a comparire fra
 * le «trattative da muovere» di Oggi, a disegnare il suo follow-up sul
 * Calendario, e — la più grave — a far risultare il negozio «già in pipeline»,
 * togliendolo sia dalla coda richiami sia da «visite da lavorare»: il negozio
 * usciva da tutte e due le liste operative e non lo lavorava più nessuno.
 * L'unica schermata che le vuole è Trattative, per la sua vista «Annullate»:
 * quella chiede `includiAnnullate`, le altre non devono ricordarsi di niente.
 */
export async function fetchTutteTrattative(
  { includiAnnullate = false }: { includiAnnullate?: boolean } = {},
): Promise<TrattativaConLuogo[]> {
  // Registro Anagrafiche (schedati) — per arricchire tipologia/stato e come fonte 3.
  const { data: reg } = await supabase
    .from('places')
    .select('id, nome, zona, linea_ipotizzata, anagrafiche_stato, hubspot_company_id, anagrafiche_account')
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
    if (!row.place_account) row.place_account = r.anagrafiche_account ?? null;
    if (!row.place_zona) row.place_zona = r.zona ?? null;
    row.anagrafiche_stato = r.anagrafiche_stato ?? null;
    row.is_partner = r.anagrafiche_stato === 'attivo';
    return row;
  };

  // 1. Trattative native Scout.
  // ⚠️ Paginata (giuria performance 28/08): il tetto delle 1000 righe di
  // PostgREST qui avrebbe fatto sparire trattative da Dashboard/Trattative/
  // Oggi/Calendario senza nessun errore.
  const scout = await tutteLeRighe<any>(
    'deals',
    '*, places(nome, zona, anagrafiche_account)',
    'id',
    includiAnnullate ? undefined : (q) => q.is('annullata_il', null),
  );
  const scoutRows: TrattativaConLuogo[] = (scout ?? []).map((r: any) =>
    arricchisci(
      {
        ...r,
        place_nome: r.places?.nome ?? null,
        place_zona: r.places?.zona ?? null,
        place_account: r.places?.anagrafiche_account ?? null,
        titolo: null,
        origine: 'scout',
      },
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
      .select('id, nome, zona, hubspot_company_id, anagrafiche_account')
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
      place_account: r.anagrafiche_account ?? null,
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
  // ⚠️ IL TERMINE SI RIPULISCE PRIMA (27/08/2026). Dentro un `or(...)` di
  // PostgREST la virgola separa le condizioni e il `%` è il jolly di `ilike`:
  // `supabase-js` non mette virgolette attorno ai valori, li interpola e basta.
  // Cercando «Rossi, Milano» la query tornava 400 e il typeahead mostrava zero
  // negozi SENZA dire niente — e chi cerca, non trovando, creava un doppione.
  // Non è un caso di laboratorio: il termine spesso non lo digita una persona,
  // lo precompila il nome di un mittente («Cognome, Nome») o la ragione sociale
  // letta dall'AI («Fiori S.r.l., Milano»).
  const q = pulisciTermine(term);
  let query = supabase.from('places').select('id, nome, indirizzo, zona').order('nome').limit(limit);
  if (q) query = query.or(`nome.ilike.%${q}%,indirizzo.ilike.%${q}%`);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as PlaceLite[];
}

/** Modifica una trattativa Scout (tabella `deals`). */
export async function aggiornaDeal(
  id: string,
  patch: Partial<
    Pick<
      Deal,
      | 'linea'
      | 'linee'
      | 'fase'
      | 'valore_atteso'
      | 'next_action'
      | 'scadenza'
      | 'oggetto'
      | 'canale'
      | 'motivo_perso'
      | 'riprendere_il'
      | 'chiusa_il'
      // ⭐ CHI LA PORTA AVANTI (27/08/2026, richiesta dell'utente: «manca la
      // possibilità di segnalare chi sta portando avanti la trattativa»).
      // ⚠️ Passarla a un collega FALLIVA fino alla migr. 0093: la policy
      // rifiutava la riga nuova perché l'owner non era più il tuo. Il campo
      // poteva scrivere solo il proprio nome, cioè non serviva a niente.
      | 'owner'
    >
  >,
): Promise<void> {
  const { error } = await supabase.from('deals').update(patch).eq('id', id);
  if (error) throw error;
}

/**
 * Cancella una trattativa aperta per sbaglio.
 *
 * Serve perché una trattativa nata male restava lì per sempre: dall'app non
 * c'era modo di toglierla. Cancellandola il negozio torna indietro nel funnel —
 * se ha una visita senza risposta ricompare fra le **Visite** da lavorare.
 *
 * ⚠️ Tocca solo la riga di Scout. Le trattative che arrivano da HubSpot o dal
 * registro Anagrafiche non nascono qui: vanno chiuse nell'app che le possiede,
 * altrimenti tornerebbero al primo sync.
 */
export async function eliminaDeal(id: string): Promise<void> {
  const { error } = await supabase.from('deals').delete().eq('id', id);
  if (error) throw error;
}

/**
 * ANNULLA una trattativa: è quello che fa il cestino dal 26/08/2026, su
 * richiesta dell'utente («aggiungi a tipo trattative anche "Annullate" dove
 * metti quelle cancellate con cestino»).
 *
 * Non è una cancellazione: la riga resta, esce dai conti e va nella sua vista,
 * da dove si può rimettere a posto. Una trattativa aperta per sbaglio è
 * comunque un fatto — qualcuno l'ha aperta — e farla sparire toglie anche la
 * possibilità di accorgersi che capita spesso.
 *
 * ⚠️ La UPDATE che la RLS non fa passare non è un errore: torna zero righe.
 * Senza questo controllo la schermata direbbe «fatto» su un annullamento mai
 * avvenuto, e la trattativa ricomparirebbe al ricaricamento.
 */
export async function annullaDeal(id: string): Promise<void> {
  const { data, error } = await supabase
    .from('deals')
    .update({ annullata_il: new Date().toISOString() })
    .eq('id', id)
    .select('id');
  if (error) throw error;
  if (!data?.length) {
    throw new Error('Trattativa non annullata: la scrittura è stata rifiutata (non è tua e ha già un proprietario).');
  }
}

/** La rimette in gioco: torna nella vista della sua fase. */
export async function ripristinaDeal(id: string): Promise<void> {
  const { data, error } = await supabase
    .from('deals')
    .update({ annullata_il: null })
    .eq('id', id)
    .select('id');
  if (error) throw error;
  if (!data?.length) {
    throw new Error('Trattativa non ripristinata: la scrittura è stata rifiutata.');
  }
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
  oggetto?: string | null;
  canale?: Deal['canale'];
}): Promise<Deal> {
  const { data: u } = await supabase.auth.getUser();
  // Cadenza: nessuna trattativa senza prossima scadenza. Se il chiamante non ne
  // indica una (undefined), l'app la mette a +7 giorni; null esplicito = scelta
  // consapevole di non averla, e si rispetta.
  const scadenza = d.scadenza === undefined ? traGiorni(GIORNI_FOLLOWUP_DEAL) : d.scadenza;
  const { data, error } = await supabase
    .from('deals')
    .insert({ ...d, scadenza, owner: u.user?.id ?? null, hubspot_deal_id: null })
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

/**
 * Cancella un negozio. **Solo chi l'ha creato** (migrazione 0054: la policy di
 * delete su `places` richiede `creato_da = auth.uid()`).
 *
 * ⚠️ Il controllo vero è nel database, non qui: il bottone nell'app si nasconde
 * per non proporre un'azione che fallirebbe, ma è la RLS a decidere.
 *
 * ⚠️ TRAPPOLA: con la RLS una DELETE che non trova righe **non è un errore** —
 * torna zero righe e basta. Senza il `.select('id')` qui sotto, l'app direbbe
 * «eliminato» anche quando non ha eliminato niente, che è il modo peggiore di
 * sbagliare: l'utente crede che sia sparito e lo ritrova domani.
 *
 * Si porta via anche contatti, visite, trattative, chiamate e iscrizioni alle
 * sequenze (FK `on delete cascade`). Il registro Anagrafiche non viene toccato.
 */
export async function eliminaPlace(placeId: string): Promise<void> {
  const { data, error } = await supabase.from('places').delete().eq('id', placeId).select('id');
  if (error) throw error;
  if (!data?.length) {
    throw new Error(
      'Non è stato cancellato: puoi cancellare solo i negozi che hai creato tu. I record importati o trovati da Google non hanno un creatore e non si cancellano dall’app.',
    );
  }
}

/** Marca/smarca un negozio come interessante (⭐ → entra nel giro). Azzera "novità". */
export async function aggiornaStarred(placeId: string, starred: boolean): Promise<void> {
  const { error } = await supabase.from('places').update({ starred, novita: false }).eq('id', placeId);
  if (error) throw error;
  // Mettere la stella = "questo negozio lo prendo come target". I record
  // arrivati dalla scoperta Google o dagli import non hanno `creato_da`, e
  // senza creatore non entrano più in Target: lo si registra qui, alla prima
  // stella, senza mai sovrascrivere un creatore già presente.
  if (starred) {
    const { data } = await supabase.auth.getUser();
    const uid = data.user?.id;
    if (uid) {
      // L'errore va fatto emergere: se questa scrittura fallisce in silenzio il
      // negozio resta senza creatore e sparisce dai Selezionati, e chi ha messo
      // la stella non capisce perché. (Il filtro della lista accetta comunque i
      // negozi stellati, quindi è una rete di sicurezza, non l'unica difesa.)
      const { error: errCreatore } = await supabase
        .from('places')
        .update({ creato_da: uid })
        .eq('id', placeId)
        .is('creato_da', null);
      if (errCreatore) throw errCreatore;
    }
  }
}

// ── Ordini (il punto d'arrivo del funnel: cosa abbiamo chiuso) ────────────────

/**
 * Annuncia un ordine nuovo a tutta la squadra (Edge Function
 * `notifica-ordine`), come Shopify fa con gli ordini del sito.
 *
 * ⚠️ **BEST EFFORT, E DI PROPOSITO.** L'ordine è già salvato quando questa
 * parte: se la mail non esce (SMTP non configurato, rete giù) non deve
 * *sembrare* che la creazione sia fallita. L'errore si ingoia qui.
 *
 * ⚠️ Il doppione lo impedisce il server (`annunciato_il`), non chi chiama:
 * chiamarla due volte è innocuo.
 */
export async function annunciaOrdine(ordineId: string): Promise<void> {
  try {
    const url = `${env.supabaseUrl().replace(/\/$/, '')}/functions/v1/notifica-ordine`;
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.supabaseAnonKey(),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ ordine_id: ordineId }),
    });
  } catch {
    // silenzio: vedi sopra
  }
}

/** Ordine arricchito col nome del negozio, per la schermata Ordini. */
export interface OrdineConLuogo extends Ordine {
  place_nome: string | null;
  /** L'id del negozio nel registro Anagrafiche, se collegato: serve al link
   *  che apre la sua scheda. Null = il negozio esiste solo in Scout. */
  place_anagrafiche_id?: string | null;
  /** Chi lo segue, risolto dal profilo (migr. — solo lettura, mai scritto). */
  owner_nome?: string | null;
}

export async function fetchOrdini(): Promise<OrdineConLuogo[]> {
  // ⚠️ Paginata (giuria performance 28/08): oltre i 1000 ordini PostgREST
  // avrebbe troncato CON UN 200, e la pagina Ordini (margini compresi)
  // avrebbe raccontato numeri sbagliati senza dirlo.
  const data = await tutteLeRighe<any>('ordini', '*, places(nome, anagrafiche_id)', 'id');
  data.sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')));
  const righe: OrdineConLuogo[] = (data ?? []).map((r: any) => ({
    ...r,
    place_nome: r.places?.nome ?? null,
    place_anagrafiche_id: r.places?.anagrafiche_id ?? null,
    owner_nome: null,
  }));
  /**
   * ⚠️ CHI L'HA SEGUITO (27/08/2026, richiesta dell'utente: «per ogni
   * trattativa e ordine poi indica anche chi è che l'ha seguita»).
   *
   * L'`owner` è un uuid: da solo, in tabella, non dice niente a nessuno. Si
   * risolve in nome con la stessa strada delle trattative (`fetchProfiles` +
   * `nomeDaProfilo`), e best-effort: se i profili non rispondono gli ordini si
   * vedono lo stesso col nome vuoto, invece di non vedersi affatto.
   */
  /**
   * ⚠️ CHI HA SEGUITO LA TRATTATIVA VINCE su chi ha creato l'ordine
   * (27/08/2026). L'ordine nasce dalla trattativa vinta, e il suo `owner` fino
   * a oggi era il default della colonna — cioè chi ha premuto il bottone. Chi
   * ha lavorato quel cliente per tre mesi è l'altro, ed è quello che va letto
   * in tabella: qui si risolve dal deal quando c'è, e si ripiega sull'ordine
   * quando l'ordine non viene da una trattativa (richiesta cliente, import).
   */
  const dealIds = [...new Set(righe.map((r) => r.deal_id).filter(Boolean))] as string[];
  const ownerDelDeal = new Map<string, string>();
  if (dealIds.length) {
    try {
      const { data: deals } = await supabase.from('deals').select('id, owner').in('id', dealIds);
      for (const d of (deals ?? []) as { id: string; owner: string | null }[]) {
        if (d.owner) ownerDelDeal.set(d.id, d.owner);
      }
    } catch {
      // niente trattative leggibili: vale il proprietario dell'ordine
    }
  }
  /**
   * ⚠️ UNA SCELTA FATTA A MANO VINCE SEMPRE (migr. 0091). La regola «comanda la
   * trattativa» serve a rimediare al default della colonna — chi ha premuto il
   * bottone — non a schiacciare chi ha deciso apposta: senza questo controllo,
   * cambiare il proprietario dell'ordine e salvare faceva ricomparire il nome
   * di prima, e un campo che non fa niente è peggio di un campo che non c'è.
   */
  const chiSegue = (r: OrdineConLuogo) =>
    r.owner_scelto
      ? (r as any).owner
      : (r.deal_id ? ownerDelDeal.get(r.deal_id) : null) ?? (r as any).owner;
  const ids = [...new Set(righe.map(chiSegue).filter(Boolean))] as string[];
  if (ids.length) {
    try {
      const profili = await fetchProfiles();
      const nome = new Map(profili.map((p) => [p.id, nomeDaProfilo(p)]));
      for (const r of righe) {
        const chi = chiSegue(r) as string | null;
        if (chi) r.owner_nome = nome.get(chi) ?? null;
      }
    } catch {
      // i profili non sono indispensabili: la colonna resta vuota
    }
  }
  return righe;
}

/**
 * La trattativa vinta genera l'ordine (idempotente: indice unico su deal_id).
 * Best-effort nel flusso di salvataggio: se fallisce, la vinta resta valida.
 */
export async function creaOrdineDaDeal(deal: {
  id: string;
  place_id: string;
  valore_atteso: number | null;
  oggetto?: string | null;
  canale?: string | null;
  linea: string | null;
  place_nome?: string | null;
  /** ⭐ CHI HA SEGUITO LA TRATTATIVA (27/08/2026, richiesta dell'utente: «anche
   *  qui va riportato chi ha seguito trattativa e di conseguenza ordine»).
   *
   *  ⚠️ Senza, l'ordine prendeva il proprietario di DEFAULT della colonna —
   *  cioè chi ha premuto il bottone. Chiudere la trattativa di un collega gli
   *  toglieva l'ordine dalle mani, e i conti per venditore lo attribuivano a
   *  chi aveva fatto l'ultimo clic. */
  owner?: string | null;
}): Promise<{ id: string }> {
  // Come per assicuraPlace: l'indice unico su deal_id è parziale, quindi niente
  // ON CONFLICT. Se l'ordine di questa trattativa c'è già, si aggiorna.
  const riga = {
    place_id: deal.place_id || null,
    cliente: deal.place_nome ?? 'Cliente',
    descrizione: deal.oggetto ?? null,
    valore: deal.valore_atteso,
    canale: deal.canale ?? null,
    linea: deal.linea,
    // Il proprietario viaggia con l'ordine; se la trattativa non ne ha uno, la
    // colonna applica il suo default (chi sta scrivendo) come prima.
    ...(deal.owner ? { owner: deal.owner } : {}),
  };
  const { data: gia } = await supabase.from('ordini').select('id').eq('deal_id', deal.id).maybeSingle();
  // ⚠️ Torna l'id dell'ordine (27/08/2026): prima non tornava niente, e chi lo
  // chiamava non poteva agganciarci la pro-forma. Era il buco per cui una
  // trattativa chiusa VINTA dal form generava un ordine senza documento,
  // mentre le altre due strade la pro-forma la emettevano.
  if (gia) {
    const { error } = await supabase.from('ordini').update(riga).eq('id', gia.id);
    if (error) throw error;
    return { id: gia.id };
  }
  const { data, error } = await supabase
    .from('ordini')
    .insert({ ...riga, deal_id: deal.id })
    .select('id')
    .single();
  if (error) throw error;
  return { id: data.id as string };
}

/**
 * Modifica un ordine. ⚠️ È una PATCH: si mandano solo i campi toccati.
 *
 * Un form che rimanda tutti i campi che conosce cancella in silenzio quelli
 * che non mostra — è già successo altrove, e da fuori sembra che il dato non
 * sia mai stato scritto.
 */
export async function aggiornaOrdine(
  id: string,
  patch: Partial<
    Pick<Ordine, 'stato' | 'incassato_il' | 'chiuso_il' | 'valore' | 'valore_unitario' | 'quantita' | 'unita' | 'owner' | 'owner_scelto' | 'descrizione' | 'cliente' | 'place_id' | 'linea' | 'canale' | 'brand' | 'altri_costi' | 'altri_costi_nota'>
  >,
): Promise<void> {
  const { error } = await supabase.from('ordini').update(patch).eq('id', id);
  if (error) throw error;
}

/**
 * ⭐ CHIUDE LA PRATICA — ed è l'unica porta per farlo (28/08/2026).
 *
 * Decisione dell'utente: «assegna il numero d'ordine solo alla chiusura, il
 * resto sono draft». Chiudere quindi fa due cose che prima erano sparse:
 *
 *  1. il DATABASE assegna `SCOUT00N` (migr. 0098) — non l'app, così vale per
 *     ogni strada, anche quelle che non esistono ancora;
 *  2. parte l'annuncio `[ORDINE SCOUT]` a tutta la squadra, che a quel punto
 *     porta il numero nell'oggetto invece di un ordine senza nome.
 *
 * ⚠️ Le due chiusure dell'app (aggancia le fatture / emetti la fattura)
 * passano di qui: se una sola delle due chiamasse `aggiornaOrdine` per conto
 * suo, metà degli ordini resterebbe senza annuncio e nessuno se ne accorgerebbe
 * — sarebbero mail che non arrivano, non un errore a schermo.
 */
export async function chiudiOrdine(id: string): Promise<void> {
  await aggiornaOrdine(id, { chiuso_il: new Date().toISOString() });
  void annunciaOrdine(id);
}

/**
 * ⭐ CHIEDE L'EVASIONE di un ordine chiuso (Edge Function
 * `richiesta-evasione`): manda alle consegne le informazioni per inserire il
 * servizio.
 *
 * ⚠️ NON è best effort come l'annuncio: qui l'utente sta chiedendo qualcosa a
 * qualcuno, e deve sapere se è partita. L'errore RISALE.
 */
export async function chiediEvasione(
  ordineId: string,
  dati: {
    data_servizio: string;
    ora_da?: string;
    ora_a?: string;
    destinatario: string;
    indirizzo: string;
    citofono?: string;
    telefono?: string;
    ritiro?: string;
    cosa?: string;
    note?: string;
  },
): Promise<{ canale: 'piattaforma' | 'mail'; giaEsistente: boolean; ripiego: boolean; a: string[]; motivoRipiego: string | null }> {
  const url = `${env.supabaseUrl().replace(/[/]$/, '')}/functions/v1/richiesta-evasione`;
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: env.supabaseAnonKey(),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ ordine_id: ordineId, ...dati }),
  });
  const esito = await res.json().catch(() => ({}));
  if (!res.ok || !esito?.sent) {
    throw new Error(String(esito?.error ?? esito?.reason ?? 'La richiesta non è partita.'));
  }
  return {
    canale: esito.canale === 'piattaforma' ? 'piattaforma' : 'mail',
    giaEsistente: !!esito.giaEsistente,
    ripiego: !!esito.ripiego,
    a: Array.isArray(esito.a) ? esito.a : [],
    motivoRipiego: esito.motivoRipiego ?? null,
  };
}

// ── Lead web (coda di qualificazione prima della trattativa) ──────────────────

export async function fetchLeads(): Promise<Lead[]> {
  const { data, error } = await supabase.from('leads').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Lead[];
}

export async function creaLead(l: {
  nome: string;
  contatto?: string | null;
  fonte: FonteLead;
  messaggio?: string | null;
}): Promise<void> {
  const { error } = await supabase.from('leads').insert({
    nome: l.nome.trim(),
    contatto: l.contatto?.trim() || null,
    fonte: l.fonte,
    messaggio: l.messaggio?.trim() || null,
  });
  if (error) throw error;
}

export async function scartaLead(id: string): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('leads')
    .update({ stato: 'scartato', owner: u.user?.id ?? null, lavorato_il: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

/**
 * Qualifica un lead: nasce la trattativa (canale web, oggetto = la richiesta del
 * lead) sul negozio scelto, e il lead ricorda quale trattativa ha generato.
 */
/**
 * Da richiesta a trattativa (e, se si vuole, anche a contatto in rubrica).
 *
 * `conContatto`: la richiesta porta già nome e indirizzo di una persona vera —
 * è arrivata lei a scriverci. Buttarli via e ridigitarli dopo, nella scheda del
 * negozio, è lavoro doppio su un dato che avevamo in mano.
 *
 * ⭐ 26/08/2026 — E IL NEGOZIO ENTRA NEL REGISTRO ANAGRAFICHE, se non c'è già.
 * Una richiesta qualificata è un'azienda con cui stiamo trattando: fino a ieri
 * restava solo dentro Scout, e in Anagrafiche — che è la casa delle anagrafiche
 * B2B — non ne sapeva niente nessuno. Misurato quel giorno: **1.807 negozi in
 * Scout, 1.051 agganciati al registro**, cioè 756 che il registro non conosce;
 * ed erano *zero* i lead mai qualificati, quindi questa strada non era mai
 * passata di lì.
 *
 * «Se non è già presente» lo decide il registro, non noi: `POST /api/v1/partners`
 * è un upsert che aggancia per riferimento esterno (`scout` + place_id), P.IVA,
 * o nome+città, e risponde `creato` oppure `merged`. Quindi rifare la stessa
 * qualifica non crea un doppione.
 *
 * ⚠️ Best-effort: se il registro non risponde, la trattativa si apre lo stesso —
 * ma l'esito torna al chiamante e **va detto a schermo**, perché «il negozio è
 * anche in Anagrafiche» e «è rimasto solo in Scout» sono due mondi diversi per
 * chi domani lo cerca di là.
 */
export async function qualificaLead(
  lead: Lead,
  placeId: string,
  conContatto = false,
): Promise<{ deal: Deal; registro: EsitoRegistro }> {
  const { data: u } = await supabase.auth.getUser();
  // Chi ci ha scritto DAVVERO: nome e recapito stanno dentro il messaggio, non
  // nel mittente — che sulle notifiche del modulo Shopify è un robot.
  const chi = analizzaMessaggioLead(lead.nome, lead.messaggio);
  const nomePersona = chi.persona || (chi.daModuloSito ? '' : lead.nome);
  const emailPersona = chi.email || (lead.contatto?.includes('@') ? lead.contatto : null);
  const telPersona = chi.telefono || (lead.contatto && !lead.contatto.includes('@') ? lead.contatto : null);
  if (conContatto && (nomePersona || emailPersona || telPersona)) {
    // Best-effort: se il contatto non si scrive, la trattativa si crea lo
    // stesso — è il pezzo che conta, e un errore qui non deve farla perdere.
    await inserisciContatto({
      place_id: placeId,
      nome: nomePersona || emailPersona || telPersona,
      ruolo: null,
      email: emailPersona,
      telefono: telPersona,
      is_decisore: false,
      note: 'Arrivato dalle Richieste Web',
    } as never).catch(() => {});
  }
  const deal = await inserisciDeal({
    place_id: placeId,
    linea: null,
    fase: 'appointmentscheduled',
    valore_atteso: null,
    scadenza: traGiorni(GIORNI_FOLLOWUP_LEAD), // cadenza web: primo follow-up a 3 giorni
    next_action: lead.contatto ? `Ricontattare ${lead.nome} (${lead.contatto})` : `Ricontattare ${lead.nome}`,
    oggetto: lead.messaggio?.slice(0, 120) || `Lead web: ${lead.nome}`,
    canale: 'web',
  });
  const { error } = await supabase
    .from('leads')
    .update({ stato: 'qualificato', deal_id: deal.id, place_id: placeId, owner: u.user?.id ?? null, lavorato_il: new Date().toISOString() })
    .eq('id', lead.id);
  if (error) throw error;
  // Il negozio va nel registro Anagrafiche, col referente che ci ha scritto.
  // Non `.catch(() => {})` come le altre chiamate: qui l'esito lo mostriamo.
  // ⚠️⚠️ IL REFERENTE È LA PERSONA, NON IL ROBOT (corretto il 26/08/2026: nel
  // registro stava per finire «Business Deluxy (Shopify)» con
  // mailer@shopify.com, che è il mittente della notifica del modulo, non chi
  // ci ha scritto). Nome e recapito veri li tira fuori `analizzaMessaggioLead`
  // — lo stesso che usa la finestra di qualifica per mostrarli (qui sopra).
  const registro = await assicuraNegozioNelRegistro(
    placeId,
    nomePersona || emailPersona || telPersona
      ? [{ nome: nomePersona || null, email: emailPersona, telefono: telPersona, ruolo: null }]
      : undefined,
  );
  return { deal, registro };
}

/**
 * Elimina una richiesta web.
 *
 * ⚠️ Una DELETE che la RLS non fa passare **non è un errore**: torna zero righe.
 * Fino alla migrazione 0064 la tabella `leads` non aveva nessuna policy di
 * delete, quindi un bottone «elimina» avrebbe detto «fatto» senza cancellare
 * niente, e la richiesta sarebbe ricomparsa al ricaricamento.
 */
export async function eliminaLead(id: string): Promise<void> {
  const { data, error } = await supabase.from('leads').delete().eq('id', id).select('id');
  if (error) throw error;
  if (!data?.length) {
    throw new Error('Richiesta non eliminata: non è stata trovata, o la scrittura è stata rifiutata.');
  }
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
    .select('*, places(nome), contacts(id, nome, ruolo, telefono, email)')
    .order('completata', { ascending: true })
    .order('scadenza', { ascending: true, nullsFirst: false })
    .order('priorita', { ascending: true })
    .order('created_at', { ascending: false });
  if (soloMiei && uid) q = q.eq('owner', uid);
  const { data, error } = await q;
  if (error) throw error;
  const righe = (data ?? []).map((r: any) => ({
    ...r,
    place_nome: r.places?.nome ?? null,
    contatto: r.contacts ?? null,
  })) as Task[];

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
/** Un contatto trovato dalla ricerca, col negozio a cui appartiene. */
export interface ContattoTrovato {
  id: string;
  nome: string;
  ruolo: string | null;
  telefono: string | null;
  email: string | null;
  place_id: string | null;
  place_nome: string | null;
}

/**
 * ⭐ CERCA UN CONTATTO IN RUBRICA (28/08/2026, richiesta dell utente:
 * «consenti di collegare un contatto a una task»).
 *
 * ⚠️ Gli ARCHIVIATI restano fuori: un referente archiviato non lavora piu la
 * per definizione, e proporlo vorrebbe dire farsi assegnare un promemoria da
 * dare a qualcuno che non risponde.
 *
 * ⚠️ Si cerca sul database e si torna il NEGOZIO di ciascuno: due persone
 * possono chiamarsi uguale, e il nome da solo non basta a riconoscerle.
 */
export async function cercaContatti(q: string, max = 8): Promise<ContattoTrovato[]> {
  const t = q.trim();
  if (t.length < 2) return [];
  const sicuro = t.replace(/[\\%_]/g, (c) => `\\${c}`);
  const { data, error } = await supabase
    .from('contacts')
    .select('id, nome, ruolo, telefono, email, place_id, places(nome)')
    .eq('archiviato', false)
    .ilike('nome', `%${sicuro}%`)
    .order('nome')
    .limit(max);
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    nome: r.nome,
    ruolo: r.ruolo ?? null,
    telefono: r.telefono ?? null,
    email: r.email ?? null,
    place_id: r.place_id ?? null,
    place_nome: r.places?.nome ?? null,
  }));
}

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
  contatto_id?: string | null;
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
      contatto_id: t.contatto_id ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as Task;
}

/** Aggiorna i campi editabili di un task (incl. riassegnazione via `owner`). */
export async function aggiornaTask(
  id: string,
  patch: Partial<Pick<Task, 'titolo' | 'note' | 'priorita' | 'scadenza' | 'owner' | 'contatto_id'>>,
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
    .select(
      'id, nome, indirizzo, zona, categoria, stato, stato_affiliazione, anagrafiche_stato, starred, creato_da, source, created_at, contacts(nome, ruolo, telefono, is_decisore), chiamate(created_at)',
    )
    // ⚠️ DUE NOMI PER LA STESSA COSA, e uno solo era guardato.
    //
    // Il registro Anagrafiche tratta «Affiliazioni» e «Re-seller» come la
    // stessa categoria (`INTERESSI_AFFILIAZIONE` in src/lib/interessi.ts), e
    // chi entra dall'app fornitori riceve per regola l'interesse
    // **«Affiliazioni»**. Questa schermata filtrava solo «Re-seller», e per di
    // più solo sulla linea PRIMARIA: misurato il 23/08/2026, **37 negozi**
    // restavano fuori dall'elenco che porta il loro nome — fra cui **23 dei 25
    // segnalati dall'app fornitori**, che l'utente si aspettava di trovare qui.
    //
    // Ora vale l'una o l'altra, sia come linea primaria sia fra gli interessi
    // multipli (`ov` = gli array si sovrappongono).
    .or(
      'linea_ipotizzata.in.(Re-seller,Affiliazioni),linee_ipotizzate.ov.{Re-seller,Affiliazioni}',
    )
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
      stato: r.stato ?? null,
      anagrafiche_stato: r.anagrafiche_stato ?? null,
      creato_da: r.creato_da ?? null,
      source: r.source ?? null,
      created_at: r.created_at ?? null,
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

/** Quante chiamate ha fatto l'utente da una certa data (KPI settimana in Home). */
export interface ChiamataFatta {
  id: string;
  place_id: string;
  esito: string | null;
  note: string | null;
  created_at: string;
}

/**
 * Le MIE chiamate registrate dalla data indicata, righe intere.
 *
 * Sostituisce il vecchio `contaChiamateDal`, che tornava solo il numero: la
 * tessera «Chiamate 7g» in Home ora si apre e mostra quali sono, e un conteggio
 * calcolato per conto suo prima o poi non torna con l'elenco che dovrebbe
 * spiegarlo. Un solo dato, contato in un posto solo.
 */
export async function fetchChiamateDal(dalISO: string): Promise<ChiamataFatta[]> {
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id;
  if (!uid) return [];
  const { data, error } = await supabase
    .from('chiamate')
    .select('id, place_id, esito, note, created_at')
    .eq('owner', uid)
    .gte('created_at', dalISO)
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data ?? []) as ChiamataFatta[];
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

/** "Non interessante": nasconde (o ripristina) un'attività dalla scoperta.
 *  Su un negozio ancora solo scoperto (`g:`) si segna nella cache Google: non
 *  ha senso creare un target per dire che non ci interessa. */
export async function aggiornaNascosto(placeId: string, nascosto: boolean): Promise<void> {
  if (idScoperto(placeId)) {
    const { error } = await supabase
      .from('google_negozi')
      .update({ nascosto })
      .eq('google_place_id', idScoperto(placeId));
    if (error) throw error;
    return;
  }
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

/**
 * La visita lasciata a metà: quello che era stato scritto nel pop-up prima di
 * chiuderlo. Una riga per negozio, riscritta ogni volta.
 */
export interface BozzaVisita {
  place_id: string;
  esito: EsitoVisita | null;
  note: string | null;
  concorrenti: string | null;
  nome: string | null;
  ruolo: string | null;
  telefono: string | null;
  email: string | null;
  decisore: boolean;
  updated_at: string;
}

/**
 * Salva (o aggiorna) la bozza di una visita.
 *
 * Chiamata mentre si scrive: deve essere **silenziosa e a prova di rete**. Se
 * fallisce non si dice niente — l'utente sta ancora scrivendo, e un pop-up
 * d'errore ogni tre lettere sarebbe peggio del danno. Il vero salvataggio
 * resta «Salva visita».
 */
export async function salvaBozzaVisita(placeId: string, b: Partial<Omit<BozzaVisita, 'place_id' | 'updated_at'>>): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  const { error } = await supabase.from('bozze_visita').upsert(
    {
      place_id: placeId,
      esito: b.esito ?? null,
      note: b.note ?? null,
      concorrenti: b.concorrenti ?? null,
      nome: b.nome ?? null,
      ruolo: b.ruolo ?? null,
      telefono: b.telefono ?? null,
      email: b.email ?? null,
      decisore: b.decisore ?? false,
      owner: u.user?.id ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'place_id' },
  );
  if (error) throw error;
}

/** La bozza di un negozio, se c'è. `null` anche quando la tabella non esiste
 *  ancora (migrazione 0047 non applicata): il pop-up si apre lo stesso, vuoto. */
export async function fetchBozzaVisita(placeId: string): Promise<BozzaVisita | null> {
  const { data, error } = await supabase.from('bozze_visita').select('*').eq('place_id', placeId).maybeSingle();
  if (error) return null;
  return (data as BozzaVisita) ?? null;
}

/**
 * Il registro dei contatti esiste nel database?
 *
 * Serve alle schermate che promettono «questo diventerà un Lead»: senza la
 * migrazione 0046 la promessa non si può mantenere, ed è meglio dirlo prima
 * che l'utente compili un form intero — non dopo aver salvato.
 */
export async function registroContattiDisponibile(): Promise<boolean> {
  const { error } = await supabase.from('contatti_avviati').select('place_id').limit(1);
  return !error;
}

/** I negozi che hanno una bozza aperta: serve alle liste per il giallo. */
export async function fetchPlaceIdConBozza(): Promise<Set<string>> {
  return idPaginati('bozze_visita');
}

/**
 * I negozi con una trattativa **aperta**: è ciò che distingue un Prospect da un
 * Lead (scala ridefinita dall'utente il 28/07/2026 — prospect = ha mostrato
 * interesse e la trattativa è partita).
 *
 * Aperta = non chiusa: `closedwon` è già un cliente, `closedlost` un perso, e
 * tenerli qui farebbe risultare «in trattativa» rapporti finiti da mesi.
 */
export async function fetchPlaceIdInTrattativa(): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('deals')
    .select('place_id, fase')
    .not('fase', 'in', '("closedwon","closedlost")')
    // …e nemmeno le annullate (migr. 0072): una trattativa messa da parte non
    // rende «prospect» un negozio.
    .is('annullata_il', null);
  if (error) throw error;
  return new Set((data ?? []).map((r: any) => r.place_id).filter(Boolean) as string[]);
}

/** I negozi con almeno una visita registrata: il verde del semaforo. */
export async function fetchPlaceIdVisitati(): Promise<Set<string>> {
  return idPaginati('visits');
}

/** Butta la bozza: la visita vera è stata registrata, gli appunti non servono
 *  più (e riaprendo il pop-up ricomparirebbero sopra una visita già fatta). */
export async function eliminaBozzaVisita(placeId: string): Promise<void> {
  await supabase.from('bozze_visita').delete().eq('place_id', placeId);
}

/**
 * Quando si ha intenzione di andare a trovarlo (`null` = toglie la data).
 * ⚠️ Non è `visits.data`: quella dice quando ci si è andati davvero.
 */
export async function pianificaVisita(placeId: string, giorno: string | null): Promise<void> {
  const { error } = await supabase.from('places').update({ visita_pianificata: giorno }).eq('id', placeId);
  if (error) throw error;
}

/**
 * Porta in Scout un partner **segnalato da un'altra app** (oggi: i fioristi e
 * le pasticcerie trovati dall'app fornitori). Nasce come SELEZIONATO: qualcuno
 * l'ha scelto, ma nessuno gli ha ancora detto niente.
 *
 * Il legame col registro passa da `anagrafiche_id`, che ha un indice unico: se
 * due persone lo prendono in carico nello stesso momento, la seconda non crea
 * un doppione — si ritrova la riga già esistente.
 */
export async function importaDalRegistro(p: {
  anagraficheId: string;
  nome: string;
  indirizzo: string | null;
  citta: string | null;
  categoria: string | null;
  lat: number;
  lng: number;
  linee: string[];
}): Promise<Place> {
  const esistente = async () => {
    const { data } = await supabase.from('places').select('*').eq('anagrafiche_id', p.anagraficheId).maybeSingle();
    return (data as Place) ?? null;
  };
  const gia = await esistente();
  if (gia) {
    // ⚠️ IL NOME È DEL REGISTRO (28/08/2026, segnalazione dell'utente: «in
    // anagrafiche è già stato cambiato il nome, come mai non lo trova
    // ancora?»). `places.nome` è una copia fatta all'import e nessuno la
    // aggiornava: HAVI era diventata HAVI LOGISTICS nel registro e qui
    // restava HAVI per sempre. Quando la riga si ritrova e il registro dice
    // un nome diverso, il nome si ALLINEA — è una riparazione, non una
    // scelta.
    if (p.nome && gia.nome !== p.nome) {
      const { data: agg } = await supabase
        .from('places')
        .update({ nome: p.nome })
        .eq('id', gia.id)
        .select('*')
        .single();
      if (agg) return agg as Place;
    }
    return gia;
  }

  const { data, error } = await supabase
    .from('places')
    .insert({
      nome: p.nome,
      indirizzo: p.indirizzo,
      zona: p.citta,
      categoria: p.categoria,
      lat: p.lat,
      lng: p.lng,
      priorita: 'P2',
      stato: 'da_visitare',
      // È stato scelto da una persona (in un'altra app): la ⭐ lo fa entrare
      // nei Selezionati come qualsiasi altro negozio messo in lista a mano.
      starred: true,
      anagrafiche_id: p.anagraficheId,
      linea_ipotizzata: p.linee[0] ?? null,
      linee_ipotizzate: p.linee.length ? p.linee : null,
    })
    .select('*')
    .single();
  if (error) {
    // 23505 = l'indice unico su anagrafiche_id: è arrivato prima qualcun altro.
    if ((error as any).code === '23505') {
      const altrui = await esistente();
      if (altrui) return altrui;
    }
    throw error;
  }
  return data as Place;
}

/**
 * Allinea il nome di un negozio a quello del REGISTRO (che del nome è la
 * casa). Best effort: se fallisce, l'azione principale di chi chiama non deve
 * fallire con lui — il nome giusto è comunque già sull'ordine.
 */
export async function allineaNomeDalRegistro(placeId: string, nome: string): Promise<void> {
  const pulito = nome.trim();
  if (!pulito) return;
  try {
    await supabase.from('places').update({ nome: pulito }).eq('id', placeId);
  } catch {
    // vedi sopra
  }
}

/** Gli id del registro già presi in carico: servono a non riproporli. */
export async function fetchAnagraficheIdPresi(): Promise<Set<string>> {
  // ⚠️ PAGINATA: i negozi agganciati al registro erano 1.051 il 26/08 — undici
  // in più del tetto. I 51 esclusi si ripresentavano come «da prendere in
  // carico» pur essendo già dentro, e siccome non c'era ordinamento cambiavano
  // a ogni caricamento.
  const data = await tutteLeRighe<any>('places', 'anagrafiche_id', 'id');
  return new Set(data.map((r: any) => r.anagrafiche_id).filter(Boolean) as string[]);
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
    .update({
      stato: statoDaEsito[opts.esito],
      da_completare: false,
      novita: false,
      // La visita è stata fatta: la data che ci si era dati non serve più, e
      // lasciarla farebbe restare il negozio fra i «da visitare questa
      // settimana» per sempre.
      visita_pianificata: null,
    })
    .eq('id', placeId);
  if (error) throw error;
  // Gli appunti hanno fatto il loro lavoro: ora esiste la visita vera.
  eliminaBozzaVisita(placeId).catch(() => {});
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

/** Un negozio trovato dalla ricerca, con quel poco che serve a riconoscerlo. */
export interface NegozioTrovato {
  id: string;
  nome: string;
  indirizzo: string | null;
  zona: string | null;
  anagrafiche_id: string | null;
}

/**
 * ⭐ CERCA UN NEGOZIO PER NOME (28/08/2026, richiesta dell'utente: «dai
 * possibilità di cercare un altro cliente»).
 *
 * ⚠️ La ricerca la fa il DATABASE, non il browser. I negozi sono 1.813:
 * scaricarli tutti per filtrarli a schermo vorrebbe dire tre pagine di dati
 * ogni volta che si apre un ordine, per mostrarne sei.
 *
 * ⚠️ I caratteri jolly di LIKE si NEUTRALIZZANO: un nome che contiene «%»
 * cercherebbe qualunque cosa, e «_» qualunque carattere — chi scrive un nome
 * non sta scrivendo un modello.
 */
export async function cercaNegozi(q: string, max = 8): Promise<NegozioTrovato[]> {
  const t = q.trim();
  if (t.length < 2) return [];
  const sicuro = t.replace(/[\\%_]/g, (c) => `\\${c}`);
  const { data, error } = await supabase
    .from('places')
    .select('id, nome, indirizzo, zona, anagrafiche_id')
    .ilike('nome', `%${sicuro}%`)
    .order('nome')
    .limit(max);
  if (error) throw error;
  return (data ?? []) as NegozioTrovato[];
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
  // Colonne che il database potrebbe non avere ancora (migrazione non
  // applicata): si tolgono UNA ALLA VOLTA, quella che l'errore nomina, e si
  // riprova. Perdere un campo accessorio è meglio che perdere la visita, che è
  // il lavoro di una persona uscita di casa.
  //
  // ⚠️ Il giro serve perché le colonne mancanti possono essere PIÙ DI UNA, e
  // PostgREST ne nomina una sola per volta. Prima c'erano due `if` separati, uno
  // per `concorrenti` e uno per `motivi`: il secondo ricostruiva il payload
  // dall'originale e **rimetteva dentro `concorrenti`**, così con entrambe le
  // colonne mancanti il salvataggio falliva comunque — è successo davvero
  // (29/07/2026: «Could not find the 'concorrenti' column of 'visits'»).
  //
  // Il campo si ricava dal messaggio di PostgREST (PGRST204), che ha sempre la
  // forma: Could not find the 'xxx' column of 'visits' in the schema cache.
  const payload: Record<string, unknown> = { ...v, hubspot_synced: false };
  // Senza questi la visita non è una visita: se manca uno di loro è un guasto
  // vero e va detto, non aggirato togliendo il campo.
  const IRRINUNCIABILI = new Set(['place_id', 'data', 'esito', 'next_step', 'owner', 'hubspot_synced']);
  const tolte: string[] = [];

  let res = await supabase.from('visits').insert(payload).select('*').single();
  for (let giro = 0; res.error && giro < 6; giro++) {
    const nome = /could not find the '([^']+)' column/i.exec(res.error.message ?? '')?.[1];
    if (!nome || IRRINUNCIABILI.has(nome) || !(nome in payload)) break;
    delete payload[nome];
    tolte.push(nome);
    res = await supabase.from('visits').insert(payload).select('*').single();
  }
  if (res.error) throw res.error;
  // Non è un errore, ma non è nemmeno niente: chi legge i log deve poter capire
  // perché una visita non ha i concorrenti o i motivi.
  if (tolte.length) console.warn(`[visita] salvata senza ${tolte.join(', ')}: colonne assenti nel database.`);
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

// ── Impostazioni dell'app (migr. 0043) ────────────────────────────────────────
// Coppie chiave/valore modificabili da Profilo → Impostazioni. Solo l'admin
// scrive (RLS). Qui NON vanno segreti: quelli restano nei secret delle Edge.

export const CHIAVE_CASELLA_RICHIESTE = 'mail.casella_richieste';

/**
 * ⭐ I DATI PER LA FATTURAZIONE (27/08/2026, migr. 0080).
 *
 * L'identità fiscale dell'azienda: non appartiene a un template né a un
 * documento. Da qui parte ogni template nuovo, così una partita IVA si scrive
 * UNA volta — e se cambia si cambia in un posto solo.
 *
 * ⚠️ Li scrive SOLO l'amministratore, e non è un filtro dell'interfaccia: lo
 * impone la policy `impostazioni_write` nel database.
 */
export const CHIAVI_AZIENDA = {
  ragioneSociale: 'azienda.ragione_sociale',
  piva: 'azienda.piva',
  indirizzo: 'azienda.indirizzo',
  capCitta: 'azienda.cap_citta',
  sdi: 'azienda.sdi',
  pec: 'azienda.pec',
  // Informazioni bancarie: dove il cliente manda i soldi. ⚠️ Vuote finché non
  // le scrive un amministratore — un IBAN non lo inventa il codice.
  iban: 'banca.iban',
  intestatarioConto: 'banca.intestatario',
  banca: 'banca.istituto',
  bic: 'banca.bic',
  // Chi risponde di fatture e pagamenti: finisce nei contatti del documento.
  ammReferente: 'amministrazione.referente',
  ammEmail: 'amministrazione.email',
  ammTelefono: 'amministrazione.telefono',
} as const;

export interface DatiAzienda {
  ragioneSociale: string;
  piva: string;
  indirizzo: string;
  capCitta: string;
  sdi: string;
  pec: string;
  iban: string;
  intestatarioConto: string;
  banca: string;
  bic: string;
  ammReferente: string;
  ammEmail: string;
  ammTelefono: string;
}

/** Legge i dati di fatturazione in un colpo solo (una query, non sei). */
export async function leggiDatiAzienda(): Promise<DatiAzienda> {
  const { data } = await supabase
    .from('impostazioni')
    .select('chiave, valore')
    .in('chiave', Object.values(CHIAVI_AZIENDA));
  const m = new Map((data ?? []).map((r: any) => [r.chiave, r.valore ?? '']));
  return {
    ragioneSociale: m.get(CHIAVI_AZIENDA.ragioneSociale) ?? '',
    piva: m.get(CHIAVI_AZIENDA.piva) ?? '',
    indirizzo: m.get(CHIAVI_AZIENDA.indirizzo) ?? '',
    capCitta: m.get(CHIAVI_AZIENDA.capCitta) ?? '',
    sdi: m.get(CHIAVI_AZIENDA.sdi) ?? '',
    pec: m.get(CHIAVI_AZIENDA.pec) ?? '',
    iban: m.get(CHIAVI_AZIENDA.iban) ?? '',
    intestatarioConto: m.get(CHIAVI_AZIENDA.intestatarioConto) ?? '',
    banca: m.get(CHIAVI_AZIENDA.banca) ?? '',
    bic: m.get(CHIAVI_AZIENDA.bic) ?? '',
    ammReferente: m.get(CHIAVI_AZIENDA.ammReferente) ?? '',
    ammEmail: m.get(CHIAVI_AZIENDA.ammEmail) ?? '',
    ammTelefono: m.get(CHIAVI_AZIENDA.ammTelefono) ?? '',
  };
}

// ── L'import automatico della posta (migr. 0084) ─────────────────────────────
//
// La pagina Lead legge la casella commerciale da sola, aprendola (richiesta
// dell'utente, 27/08/2026). Queste tre funzioni sono la lavagna condivisa che
// dice se tocca a me farlo.
//
// ⚠️ NON è `impostazioni`: quella la scrive solo l'amministratore, e un import
// automatico che non riesce a segnare il proprio passaggio non parte. Per un
// venditore sarebbe rimasto un bottone da premere a mano.

export interface StatoImportPosta {
  ultimo_tentativo: string | null;
  ultimo_esito: string | null;
  ultimo_ok: boolean | null;
}

/** Com'è finita l'ultima lettura, per chiunque apra la pagina. */
export async function statoImportPosta(): Promise<StatoImportPosta | null> {
  const { data, error } = await supabase
    .from('import_posta')
    .select('ultimo_tentativo, ultimo_esito, ultimo_ok')
    .maybeSingle();
  if (error) return null;
  return (data as StatoImportPosta) ?? null;
}

/**
 * Prenota il giro: torna `true` solo a chi lo deve fare davvero.
 *
 * ⚠️ La condizione sta DENTRO la UPDATE, sul server: leggere «quando» e poi
 * scrivere «adesso» in due passi lascia aperta la finestra in cui due persone
 * leggono lo stesso «mai» e leggono la casella in due. E l'orologio è quello
 * del server, non del telefono di chi apre la pagina.
 */
export async function prenotaLetturaPosta(attesaMinuti: number): Promise<boolean> {
  const { data, error } = await supabase.rpc('prenota_lettura_posta', { attesa_minuti: attesaMinuti });
  if (error) return false;
  return data === true;
}

/** Scrive com'è andata, perché la legga anche chi arriva dopo. */
export async function chiudiLetturaPosta(esito: string, ok: boolean): Promise<void> {
  await supabase.rpc('chiudi_lettura_posta', { esito, ok });
}

/** Rimette indietro l'orologio quando il giro è fallito. */
export async function rilasciaLetturaPosta(precedente: string | null): Promise<void> {
  await supabase.rpc('rilascia_lettura_posta', { precedente });
}

export async function leggiImpostazione(chiave: string): Promise<string | null> {
  const { data, error } = await supabase.from('impostazioni').select('valore').eq('chiave', chiave).maybeSingle();
  if (error) return null;
  return data?.valore ?? null;
}

export async function salvaImpostazione(chiave: string, valore: string): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  const { error } = await supabase.from('impostazioni').upsert(
    { chiave, valore: valore.trim(), aggiornato_il: new Date().toISOString(), aggiornato_da: u.user?.id ?? null },
    { onConflict: 'chiave' },
  );
  if (error) throw error;
}

// ── Il catalogo dei servizi della PIATTAFORMA CONSEGNE ───────────────────────
//
// Scout è il master delle linee di interesse, ma i servizi che si vendono
// davvero sono già scritti nella piattaforma. Da qui si leggono per decidere
// quali linee creare (richiesta dell'utente, 27/08/2026).
//
// ⚠️ Si LEGGE e basta. Il servizio è di casa loro, la linea è di casa nostra:
// quello che nasce di qua è una linea Deluxy Scout che tiene il codice del
// servizio come riferimento, non una copia di quel record.

export interface ServizioPiattaforma {
  id: string;
  nome: string;
  codice: string;
  /** partner | valet | both — a chi è rivolto. */
  ambito: string;
  /** VENDITA | PREZZO_FISSO | A_ORA | MAGAZZINO | CORPORATE. */
  modello: string;
  attivo: boolean;
  note?: string | null;
}

export type EsitoServiziPiattaforma =
  | { ok: true; servizi: ServizioPiattaforma[] }
  | { ok: false; motivo: 'non_configurato' }
  | { ok: false; motivo: 'errore'; dettaglio: string };

/**
 * Chiede alla piattaforma il suo catalogo dei servizi, passando dalla Edge
 * Function `servizi-consegne` (la chiave resta sul server).
 *
 * ⚠️ Non lancia: «non collegata» è uno STATO, non un guasto, e la schermata lo
 * scrive come tale. Una eccezione qui farebbe sembrare rotta la piattaforma
 * quando manca solo una chiave da incollare.
 */
export async function fetchServiziPiattaforma(ambito?: string): Promise<EsitoServiziPiattaforma> {
  try {
    const url = `${env.supabaseUrl().replace(/\/$/, '')}/functions/v1/servizi-consegne`;
    const { data: s } = await supabase.auth.getSession();
    const token = s.session?.access_token;
    if (!token) return { ok: false, motivo: 'errore', dettaglio: 'Sessione scaduta: rientra.' };
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        apikey: env.supabaseAnonKey(),
      },
      body: JSON.stringify(ambito ? { ambito } : {}),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body) {
      return { ok: false, motivo: 'errore', dettaglio: `La funzione ha risposto ${res.status}.` };
    }
    if (body.ok) return { ok: true, servizi: (body.servizi ?? []) as ServizioPiattaforma[] };
    if (body.motivo === 'non_configurato') return { ok: false, motivo: 'non_configurato' };
    return {
      ok: false,
      motivo: 'errore',
      dettaglio: [body.stato ? `Errore ${body.stato}` : null, body.dettaglio].filter(Boolean).join(': ') || 'Non riuscito.',
    };
  } catch (e: any) {
    return { ok: false, motivo: 'errore', dettaglio: String(e?.message ?? e) };
  }
}

// ── Chiavi API delle altre app Deluxy (migr. 0044) ───────────────────────────
// A differenza di `impostazioni`, qui **legge e scrive solo l'amministratore**
// (RLS): una chiave in mano a ogni venditore varrebbe come dargli l'accesso a
// quell'app. La chiave non torna mai al client: la schermata sa solo SE c'è.

/** Le app dell'ecosistema che Scout può richiamare. */
export interface AppDeluxy {
  id: string;
  nome: string;
  urlDefault: string;
  /** A cosa serve, detto in una riga: è quello che si legge in Impostazioni. */
  aCosaServe: string;
}

export const APP_DELUXY: AppDeluxy[] = [
  { id: 'anagrafiche', nome: 'Anagrafiche', urlDefault: 'https://deluxy-anagrafiche.vercel.app', aCosaServe: 'Il registro dei partner e prospect B2B: schede negozio e referenti.' },
  { id: 'orders', nome: 'Orders', urlDefault: 'https://deluxy-orders.vercel.app', aCosaServe: 'Gli ordini Shopify: cosa ha già comprato un cliente.' },
  { id: 'tasks', nome: 'Tasks', urlDefault: 'https://deluxy-tasks.vercel.app', aCosaServe: 'Le attività condivise fra tutte le app.' },
  { id: 'calendario', nome: 'Calendario', urlDefault: 'https://deluxy-calendario.vercel.app', aCosaServe: 'Gli appuntamenti datati di tutte le app.' },
  { id: 'scripts', nome: 'Scripts', urlDefault: 'https://deluxy-scripts.vercel.app', aCosaServe: 'I testi pronti da mandare al cliente, già composti.' },
  { id: 'marketing', nome: 'Marketing', urlDefault: 'https://deluxy-marketing.vercel.app', aCosaServe: 'La spesa pubblicitaria reale per brand.' },
  { id: 'partner', nome: 'Partner', urlDefault: 'https://deluxy-partner.vercel.app', aCosaServe: 'La parte finanziaria dei partner: fatture e saldi.' },
  // ⚠️ L'indirizzo è quello del CANALE APP (`/api/v1`), non della pagina: la
  // piattaforma serve web e API sullo stesso dominio, e puntare alla home
  // farebbe rispondere l'HTML dell'app al posto dei dati.
  { id: 'piattaforma', nome: 'Consegne (piattaforma)', urlDefault: 'https://deluxy-delivery.vercel.app/api/v1', aCosaServe: 'I servizi che si vendono davvero: da qui si decide quali linee di interesse creare.' },
];

export interface StatoChiaveApp {
  app: string;
  url_base: string | null;
  note: string | null;
  configurata: boolean;
  aggiornato_il: string | null;
}

/** Quali app risultano collegate. Non restituisce le chiavi: solo se ci sono. */
export async function fetchStatoChiaviApp(): Promise<StatoChiaveApp[]> {
  const { data, error } = await supabase.from('chiavi_app_stato').select('*');
  if (error) throw error;
  return (data ?? []) as StatoChiaveApp[];
}

/** Salva (o aggiorna) la chiave di un'app. Passa solo la RLS se sei admin. */
export async function salvaChiaveApp(
  app: string,
  chiave: string,
  urlBase?: string | null,
): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  const riga: Record<string, unknown> = {
    app,
    chiave: chiave.trim(),
    aggiornato_il: new Date().toISOString(),
    aggiornato_da: u.user?.id ?? null,
  };
  // L'URL si scrive solo se indicato: un campo lasciato vuoto non deve
  // cancellare quello già salvato.
  if (urlBase !== undefined && urlBase !== null && urlBase.trim()) riga.url_base = urlBase.trim();
  const { error } = await supabase.from('chiavi_app').upsert(riga, { onConflict: 'app' });
  if (error) throw error;
}

/** Toglie il collegamento con un'app (cancella la chiave). */
export async function rimuoviChiaveApp(app: string): Promise<void> {
  const { error } = await supabase.from('chiavi_app').delete().eq('app', app);
  if (error) throw error;
}

// ── La chiave con cui le ALTRE app chiamano Scout ─────────────────────────────
//
// Le righe di `chiavi_app` sono «la chiave per chiamare l'app X». Questa è il
// verso opposto: **il segreto di Scout**, quello che le Edge Function `partner`,
// `lead` e `trattativa` confrontano con l'header `x-api-key` di chi bussa.
//
// Perché sta qui e non solo nei secret di Supabase: un secret **non si rilegge**
// (`supabase secrets list` mostra un'impronta, non il valore). Quando serve
// darlo a un'altra app — al registro Anagrafiche, ad AI Mail — o ce l'hai
// scritto da qualche parte, o devi rigenerarlo e aggiornarlo ovunque, con il
// rischio di spegnere in silenzio le integrazioni che lo usavano già. È
// esattamente il muro contro cui si è finiti il 29/07/2026.
//
// L'id della riga comincia con `_`: le altre sono nomi di app, e questa non lo
// è. Il catalogo `APP_DELUXY` non la contiene, quindi non compare nell'elenco
// delle app collegate.
export const APP_CHIAVE_INGRESSO = '_ingresso';

/**
 * Genera una chiave nuova, la salva e la **restituisce una volta sola**.
 *
 * ⚠️ Il valore si vede adesso o mai più: nel database resta, ma la vista di
 * stato non lo espone e il client non lo rilegge. È lo stesso patto delle
 * chiavi di Anagrafiche, e serve a non lasciare segreti in giro per le
 * schermate.
 *
 * ⚠️ Niente `Math.random()`: per un segreto serve un generatore
 * crittografico. Se l'ambiente non ce l'ha si fallisce e lo si dice — una
 * chiave debole è peggio di nessuna chiave, perché sembra una chiave.
 */
export async function generaChiaveIngresso(): Promise<string> {
  const rnd = globalThis.crypto?.getRandomValues?.bind(globalThis.crypto);
  if (!rnd) {
    throw new Error(
      'Questo dispositivo non ha un generatore casuale sicuro: genera la chiave dal browser (versione web di Scout).',
    );
  }
  const buf = rnd(new Uint8Array(24));
  const esa = Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
  const chiave = `dlxs_${esa}`;
  await salvaChiaveApp(APP_CHIAVE_INGRESSO, chiave);
  return chiave;
}

/** C'è già una chiave d'ingresso? (solo il fatto, mai il valore) */
export async function chiaveIngressoConfigurata(): Promise<boolean> {
  const { data } = await supabase
    .from('chiavi_app_stato')
    .select('configurata')
    .eq('app', APP_CHIAVE_INGRESSO)
    .maybeSingle();
  return Boolean(data?.configurata);
}

/** Il recapito da usare per contattare un negozio (dal referente migliore). */
export interface RecapitoPlace {
  telefono: string | null;
  email: string | null;
}

/**
 * I recapiti dei negozi, presi dai contatti in rubrica.
 *
 * Serve ai **Potenziali**: lì le azioni sono quelle per instaurare un contatto
 * (chiama, WhatsApp, email), e i recapiti non stanno su `places` ma sui
 * `contacts`. Si carica tutto in una query sola: chiederlo riga per riga
 * sarebbe una query per negozio.
 *
 * Fra più referenti vince chi **decide**, poi chi ha un recapito.
 */
export async function fetchRecapitiPlace(): Promise<Map<string, RecapitoPlace>> {
  // ⚠️ PAGINATA, e ordinata: senza `range()` tornavano 1000 righe su una
  // rubrica più grande, e senza `order` il taglio non era nemmeno lo stesso da
  // una volta all'altra. Il risultato era il peggiore possibile: i bottoni
  // Chiama/WhatsApp/Email spenti su negozi che il recapito ce l'hanno, e spenti
  // a caso — accesi ora, spenti fra un minuto, impossibile da riprodurre.
  const data = await tutteLeRighe<any>(
    'contacts',
    'place_id, telefono, email, is_decisore, archiviato',
    'id',
  );
  const out = new Map<string, RecapitoPlace>();
  for (const c of (data ?? []) as any[]) {
    if (!c.place_id || c.archiviato) continue;
    const attuale = out.get(c.place_id) ?? { telefono: null, email: null };
    // Il decisore sovrascrive; altrimenti si tiene il primo valore trovato.
    if (c.telefono && (c.is_decisore || !attuale.telefono)) attuale.telefono = c.telefono;
    if (c.email && (c.is_decisore || !attuale.email)) attuale.email = c.email;
    out.set(c.place_id, attuale);
  }
  return out;
}

// ── Richieste clienti (le saltuarie che arrivano al commerciale) ──────────────
//
// Stanno FUORI dalla pipeline di proposito: una richiesta che si evade alle
// condizioni note non è una trattativa (regola del binario, 26/08/2026), e
// metterla lì la farebbe contare due volte. Il registro dei risultati resta
// FINANCE: qui si tiene il lavoro, e del documento solo il riferimento.

export async function fetchRichiesteCliente(): Promise<RichiestaCliente[]> {
  const { data, error } = await supabase
    .from('richieste_cliente')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as RichiestaCliente[];
}

export async function creaRichiestaCliente(r: {
  place_id: string | null;
  cliente: string;
  descrizione: string;
  importo: number | null;
  canale: RichiestaCliente['canale'];
  /** Su quale linea si vende (migr. 0087): finisce nell'ordine. */
  linea?: string | null;
  tipologia: RichiestaCliente['tipologia'];
  serve_entro: string | null;
  nota: string | null;
  /** Da quale mail arriva (id del messaggio in AI Mail): per rileggerla. */
  mail_ref?: string | null;
  /** Chi l'ha scritta: `commerciale` a mano, `scout-mail` presa dalla posta. */
  origine?: string | null;
  /** L'id della richiesta web da cui nasce: impedisce di prenderla due volte. */
  riferimento_esterno?: string | null;
}): Promise<RichiestaCliente> {
  const { data: u } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('richieste_cliente')
    .insert({
      ...r,
      cliente: r.cliente.trim(),
      descrizione: r.descrizione.trim(),
      origine: r.origine ?? 'commerciale',
      owner: u.user?.id,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as RichiestaCliente;
}

/**
 * La richiesta web (mail) da cui è nata una richiesta cliente: si segna
 * lavorata e si ricorda cosa ha generato.
 *
 * ⚠️ Segnalato dall'utente il 26/08/2026: «manca possibilità di richiamare la
 * richiesta dalla mail». La mail era già in coda — in Richieste Web — ma da
 * qui non si poteva riprendere, e chi scriveva a mano la richiesta di un
 * cliente ricopiava a mano quello che il cliente aveva già scritto, lasciando
 * la mail in coda a sembrare non lavorata.
 *
 * Best-effort: se questa scrittura non passa, la richiesta cliente è già
 * salvata — è il pezzo che conta.
 */
export async function leadDiventaRichiesta(leadId: string, richiestaId: string, placeId: string | null): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  await supabase
    .from('leads')
    .update({
      stato: 'qualificato',
      richiesta_cliente_id: richiestaId,
      place_id: placeId,
      owner: u.user?.id ?? null,
      lavorato_il: new Date().toISOString(),
    })
    .eq('id', leadId);
}

export async function aggiornaRichiestaCliente(
  id: string,
  campi: Partial<Pick<RichiestaCliente, 'cliente' | 'descrizione' | 'importo' | 'canale' | 'linea' | 'tipologia' | 'stato' | 'serve_entro' | 'nota'>>,
): Promise<void> {
  const { data, error } = await supabase.from('richieste_cliente').update(campi).eq('id', id).select('id');
  if (error) throw error;
  // Una UPDATE fermata dalla RLS non è un errore: torna zero righe. Senza
  // questo controllo la schermata direbbe «fatto» su una modifica mai avvenuta.
  if (!data?.length) {
    throw new Error('Richiesta non aggiornata: la scrittura è stata rifiutata (non è tua e ha già un proprietario).');
  }
}

export async function eliminaRichiestaCliente(id: string): Promise<void> {
  const { data, error } = await supabase.from('richieste_cliente').delete().eq('id', id).select('id');
  if (error) throw error;
  if (!data?.length) throw new Error('Richiesta non eliminata: la cancellazione è stata rifiutata.');
}

/**
 * Salva sulla richiesta il RIFERIMENTO alla pro-forma emessa in FINANCE, e la
 * porta a «prezzo concordato» (il documento esiste, l'incasso no).
 *
 * ⚠️ Si salvano numero e link, non i suoi importi: la pro-forma vive di là, e
 * una copia degli importi qui sarebbe un secondo numero per lo stesso fatto.
 */
export async function collegaProformaARichiesta(id: string, numero: string, url: string): Promise<void> {
  const { error } = await supabase
    .from('richieste_cliente')
    .update({ proforma_numero: numero, proforma_url: url, stato: 'concordata' })
    .eq('id', id);
  if (error) throw error;
}

/**
 * ⭐ DALLA RICHIESTA ALL'ORDINE (26/08/2026, richiesta dell'utente: «metti
 * Trasforma in Ordini che porta la cosa sotto Ordini e genera in automatico
 * una proforma che sarà agganciata»).
 *
 * Fin qui una richiesta cliente moriva dov'era nata: si prezzava, si chiedeva
 * il documento, e il lavoro venduto non compariva fra gli ORDINI — cioè nel
 * posto dove si guarda cosa c'è da consegnare e da incassare.
 *
 * ⚠️ Serve l'importo: un ordine senza valore non si incassa e non si misura.
 * ⚠️ Il legame è nei DUE versi (ordine→richiesta e richiesta→ordine): con uno
 * solo, una delle due domande — «perché lo stiamo facendo» e «che fine ha
 * fatto» — resta sempre senza risposta.
 */
export async function creaOrdineDaRichiesta(r: RichiestaCliente): Promise<{ id: string }> {
  if (!r.importo) {
    throw new Error('Serve l’importo concordato: un ordine senza valore non si incassa e non si misura.');
  }
  const { data: u } = await supabase.auth.getUser();
  // Già trasformata: non se ne fa un secondo. Due ordini per una richiesta
  // varrebbero due volte la stessa vendita.
  if (r.ordine_id) {
    const { data: gia } = await supabase.from('ordini').select('id').eq('id', r.ordine_id).maybeSingle();
    if (gia) return { id: (gia as { id: string }).id };
  }
  const { data, error } = await supabase
    .from('ordini')
    .insert({
      place_id: r.place_id,
      cliente: r.cliente,
      descrizione: r.descrizione,
      valore: r.importo,
      canale: r.canale === 'web' ? 'web' : 'altro',
      // ⚠️ LA LINEA VIAGGIA CON L'ORDINE (27/08/2026). Era il vero motivo per
      // cui serviva sulla richiesta: senza, ogni ordine nato qui arrivava in
      // /ordini con la colonna Linea vuota e restava fuori da tutti i conti per
      // linea — un pezzo di ricavo che spariva dalle statistiche, non un campo
      // mancante in una maschera.
      linea: r.linea ?? null,
      richiesta_id: r.id,
      // Il documento che la richiesta ha già, se c'è: l'ordine nasce sapendo
      // quale pro-forma lo rappresenta.
      proforma_numero: r.proforma_numero ?? null,
      proforma_url: r.proforma_url ?? null,
      owner: u.user?.id ?? null,
    })
    .select('id')
    .single();
  if (error) throw error;
  const ordineId = (data as { id: string }).id;
  const { error: e2 } = await supabase
    .from('richieste_cliente')
    .update({ ordine_id: ordineId, stato: 'in_ordine' })
    .eq('id', r.id);
  if (e2) throw e2;
  return { id: ordineId };
}

/**
 * ⭐ DALLA TRATTATIVA ALL'ORDINE (26/08/2026, richiesta dell'utente: «anche qui
 * metti pulsante per trasformare in ordine, stessa logica che c'è in richieste
 * clienti»).
 *
 * Stessa regola: serve il valore, l'ordine nasce agganciato, e non se ne fa un
 * secondo se c'è già — due ordini per una trattativa varrebbero due volte la
 * stessa vendita. `creaOrdineDaDeal` (che gira alla vittoria) fa l'upsert su
 * `deal_id`: qui si riusa, e si torna l'id per attaccarci il documento.
 */
export async function creaOrdineDaTrattativa(d: {
  id: string;
  place_id: string;
  valore_atteso: number | null;
  oggetto?: string | null;
  titolo?: string | null;
  canale?: string | null;
  linea: string | null;
  place_nome?: string | null;
  /** Chi ha seguito la trattativa: segue anche l ordine (27/08/2026). */
  owner?: string | null;
}): Promise<{ id: string }> {
  if (!d.valore_atteso) {
    throw new Error('Serve il valore della trattativa: un ordine senza importo non si incassa e non si misura.');
  }
  await creaOrdineDaDeal({ ...d, oggetto: d.oggetto ?? d.titolo ?? null });
  const { data, error } = await supabase.from('ordini').select('id').eq('deal_id', d.id).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Ordine non trovato dopo la creazione.');
  return { id: (data as { id: string }).id };
}

/** Aggancia all'ORDINE il documento emesso da FINANCE (riferimento, non copia). */
export async function collegaDocumentoAOrdine(
  ordineId: string,
  doc: {
    proformaNumero?: string;
    proformaUrl?: string;
    fatturaNumero?: string;
    fatturaUrl?: string;
    /** Tutte le fatture dell'ordine (migr. 0092). ⚠️ La prima finisce anche in
     *  `fattura_numero`: la colonna della tabella e il giro verso FINANCE
     *  leggono quel campo, e lasciarlo vuoto farebbe sparire il documento. */
    fatture?: string[];
  },
): Promise<void> {
  const patch: Record<string, string | string[] | null> = {};
  if (doc.fatture?.length) {
    patch.fatture = doc.fatture;
    patch.fattura_numero = doc.fatture[0];
  }
  if (doc.proformaNumero) patch.proforma_numero = doc.proformaNumero;
  if (doc.proformaUrl) patch.proforma_url = doc.proformaUrl;
  if (doc.fatturaNumero) patch.fattura_numero = doc.fatturaNumero;
  if (doc.fatturaUrl) patch.fattura_url = doc.fatturaUrl;
  if (!Object.keys(patch).length) return;
  const { error } = await supabase.from('ordini').update(patch).eq('id', ordineId);
  if (error) throw error;
}

/**
 * Il PREVENTIVO emesso da FINANCE resta agganciato alla richiesta: numero e
 * link, mai una copia degli importi. La richiesta passa a «preventivo inviato»
 * — che è lo stato vero, e dice che la palla adesso è del cliente.
 */
export async function collegaPreventivoARichiesta(id: string, numero: string, url: string): Promise<void> {
  const { error } = await supabase
    .from('richieste_cliente')
    .update({ preventivo_numero: numero, preventivo_url: url, stato: 'preventivo_inviato' })
    .eq('id', id);
  if (error) throw error;
}
