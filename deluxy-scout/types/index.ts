// Tipi condivisi dell'app. Rispecchiano lo schema Supabase (vedi /supabase/migrations).

export type Priorita = 'P1' | 'P2' | 'P3';

export type StatoPlace = 'da_visitare' | 'visitato' | 'cliente' | 'perso';

export type EsitoVisita = 'interessato' | 'da_richiamare' | 'non_target' | 'chiuso';

// Stato di lavorazione dell'affiliazione — gli 8 valori del registro Deluxy Anagrafiche.
export type StatoAffiliazione =
  | 'prospect'
  | 'in_contatto'
  | 'in_attesa'
  | 'in_trattativa'
  | 'da_ricontattare'
  | 'attivo'
  | 'non_interessato'
  | 'dismesso';

// Ordine dello "step" (dal primo contatto alla chiusura) per la UI.
export const STATI_AFFILIAZIONE: StatoAffiliazione[] = [
  'prospect',
  'in_contatto',
  'in_attesa',
  'in_trattativa',
  'da_ricontattare',
  'attivo',
  'non_interessato',
  'dismesso',
];

// Ponte tra i due modelli di stato: il registro Anagrafiche ha 8 stati
// (StatoAffiliazione), la pipeline interna di Scout ne ha 4 (StatoPlace). Quando
// si imposta lo stato "vero" (quello di Anagrafiche) si deriva anche lo stato di
// pipeline, così percorso/filtri restano coerenti.
export const statoPlaceDaAffiliazione: Record<StatoAffiliazione, StatoPlace> = {
  prospect: 'da_visitare',
  in_contatto: 'visitato',
  in_attesa: 'visitato',
  in_trattativa: 'visitato',
  da_ricontattare: 'visitato',
  attivo: 'cliente',
  non_interessato: 'perso',
  dismesso: 'perso',
};

// Stato Anagrafiche di default quando un negozio ha solo lo stato di pipeline
// (nessuno stato registro ancora impostato).
export const affiliazioneDaStatoPlace: Record<StatoPlace, StatoAffiliazione> = {
  da_visitare: 'prospect',
  visitato: 'in_contatto',
  cliente: 'attivo',
  perso: 'non_interessato',
};

// Contatto della scheda, per la lista Affiliazioni (numero da chiamare + referente).
export interface AffiliazioneRow {
  id: string;
  nome: string;
  indirizzo: string | null;
  zona: string | null;
  categoria: string | null;
  stato_affiliazione: StatoAffiliazione | null;
  telefono: string | null;
  referente: string | null;
  ultima_chiamata: string | null;
  starred: boolean; // "Selezionato" da contattare (stesso flag della stella in mappa)
}

// Stato del place derivato dall'esito della visita (regola commerciale unica,
// condivisa da visita completa, visita rapida e coda di sync).
export const statoDaEsito: Record<EsitoVisita, StatoPlace> = {
  interessato: 'visitato',
  da_richiamare: 'visitato',
  non_target: 'perso',
  chiuso: 'cliente',
};

// Fasi reali della pipeline HubSpot (dealstage).
export type DealStage =
  | 'appointmentscheduled'
  | 'decisionmakerboughtin'
  | 'contractsent'
  | 'closedwon'
  | 'closedlost';

// Le 9 linee di servizio Deluxy. Le ultime 3 sono in standby (attiva_bool=false):
// mai come ipotesi primaria, solo cross-sell manuale.
export type LineaNome =
  | 'Consegne'
  | 'Catering'
  | 'Regali aziendali'
  | 'Affiliazioni'
  | 'Re-seller'
  | 'Food Supplier'
  | 'Clientelling'
  | 'Concierge'
  | 'Magazzino';

export const LINEE_STANDBY: LineaNome[] = ['Clientelling', 'Concierge', 'Magazzino'];

// Tutte le 9 linee, nell'ordine di presentazione.
export const LINEE: LineaNome[] = [
  'Consegne',
  'Catering',
  'Regali aziendali',
  'Affiliazioni',
  'Re-seller',
  'Food Supplier',
  'Clientelling',
  'Concierge',
  'Magazzino',
];

// Linee attive: usabili come tipologia di interesse primaria (esclude le standby).
export const LINEE_ATTIVE: LineaNome[] = LINEE.filter((l) => !LINEE_STANDBY.includes(l));

export interface Place {
  id: string;
  nome: string;
  indirizzo: string | null;
  lat: number;
  lng: number;
  settore: string | null;
  categoria: string | null;
  priorita: Priorita;
  linea_ipotizzata: string | null; // linea "primaria" (= prima di linee_ipotizzate)
  linee_ipotizzate?: string[] | null; // tipologia di interesse MULTIPLA
  aggancio_apertura: string | null;
  fuoco_espansione: string | null;
  stato: StatoPlace; // stato di pipeline interno (derivato)
  stato_affiliazione?: StatoAffiliazione | null; // stato "vero" = gli 8 stati di Anagrafiche
  zona: string | null;
  hubspot_company_id: string | null;
  created_at: string;
  // Scoperta Google / cache (migrazione 0004). Opzionali: assenti sui record vecchi.
  source?: 'manual' | 'google';
  google_place_id?: string | null;
  google_types?: string[] | null;
  starred?: boolean;
  novita?: boolean;
  da_completare?: boolean;
  nascosto?: boolean; // "non interessante": escluso dalla scoperta, visibile solo in Profilo → Nascosti
  hubspot_ha_contatto?: boolean; // l'azienda abbinata ha almeno un contatto
  hubspot_deal_aperta?: boolean; // l'azienda abbinata ha una trattativa aperta
  google_rating?: number | null; // voto Google 0-5 (recensioni)
  google_reviews?: number | null; // numero di recensioni Google
  anagrafiche_stato?: string | null; // stato dal registro (attivo=partner, in_trattativa, ...)
  anagrafiche_account?: string | null; // account = venditore che segue il cliente (sync verso Anagrafiche)
  hubspot_sync_at?: string | null;
  google_refresh_at?: string | null;
}

export interface Contact {
  id: string;
  place_id: string;
  nome: string;
  ruolo: string | null;
  telefono: string | null;
  email: string | null;
  is_decisore: boolean;
  hubspot_contact_id: string | null;
  archiviato?: boolean; // referente archiviato (fuori dall'elenco attivo di Rubrica)
}

export interface Visit {
  id: string;
  place_id: string;
  data: string;
  lat: number | null;
  lng: number | null;
  esito: EsitoVisita | null;
  briefing: string | null;
  note_post_meeting: string | null;
  esito_analisi: string | null;
  next_step: string;
  linea_proposta: string | null;
  cross_sell: string[] | null;
  concorrenti: string | null; // concorrenti rilevati sul campo (testo libero, da riconciliare)
  foto_url: string | null;
  owner: string | null;
  hubspot_synced: boolean;
  created_at: string;
}

export interface Deal {
  id: string;
  place_id: string;
  linea: string | null; // linea primaria (prima di `linee`)
  linee?: string[] | null; // tipologie di interesse MULTIPLE della trattativa
  fase: DealStage;
  valore_atteso: number | null;
  next_action: string | null;
  scadenza: string | null; // data di scadenza del follow-up (YYYY-MM-DD)
  owner: string | null;
  hubspot_deal_id: string | null;
}

// Task personale del venditore (tasklist privata con priorità e scadenza).
export interface Task {
  id: string;
  owner: string | null;
  titolo: string;
  note: string | null;
  priorita: Priorita;
  scadenza: string | null; // YYYY-MM-DD
  completata: boolean;
  place_id: string | null;
  creato_da: string | null; // chi ha creato il task (owner = a chi è assegnato)
  created_at: string;
  completata_at: string | null;
  place_nome?: string | null; // nome del negozio collegato (join, opzionale)
  owner_nome?: string | null; // nome dell'assegnatario (risolto)
  creato_da_nome?: string | null; // nome del creatore (risolto)
}

// Richiesta di pagamento nata da una TRATTATIVA vinta: si invia al cliente (anche
// parziale/acconto) e si monitora l'esito dell'incasso.
export type StatoPagamento = 'inviata' | 'in_attesa' | 'pagata' | 'parziale' | 'insoluta' | 'annullata';

// Rata (split) di una richiesta: per valore € o per % del totale, con scadenza.
export interface RataPagamento {
  id: string;
  richiesta_id: string;
  etichetta: string | null;
  modo: 'valore' | 'percentuale';
  percentuale: number | null;
  importo: number;
  scadenza: string | null;
  pagata: boolean;
  ordine: number;
}

export interface RichiestaPagamento {
  id: string;
  owner: string;
  deal_id: string | null;
  place_id: string | null;
  cliente: string;
  importo: number; // importo richiesto totale (anche parziale rispetto al deal)
  importo_incassato: number;
  causale: string | null;
  scadenza: string | null;
  stato: StatoPagamento;
  nota: string | null;
  created_at: string;
  updated_at: string;
  owner_nome?: string | null; // risolto dai profili (per la supervisione)
  rate?: RataPagamento[]; // split in rate (se presenti)
  proforma_numero?: string | null; // riferimento "PF n/anno" su Deluxy Partner (migr. 0029)
  proforma_url?: string | null; // link al documento su deluxy-partner
}

export interface Profilo {
  id: string;
  email: string | null;
  nome: string | null;
  ultimo_accesso?: string | null;
}

export interface Linea {
  id: string;
  nome: LineaNome;
  attiva_bool: boolean;
  pitch: string | null;
  prezzo_min: number | null;
  prezzo_max: number | null;
}

export interface CategoryRule {
  id: string;
  categoria: string;
  linea_ipotizzata: string;
  aggancio_apertura: string;
  priorita: Priorita;
}

// Visita in coda offline: prima di avere un id server usa un id locale.
export interface QueuedVisit {
  localId: string;
  payload: Omit<Visit, 'id' | 'created_at' | 'hubspot_synced'>;
  fotoLocalUri: string | null;
  createdAt: string;
  retries: number;
}
