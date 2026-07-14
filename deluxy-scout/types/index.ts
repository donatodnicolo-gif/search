// Tipi condivisi dell'app. Rispecchiano lo schema Supabase (vedi /supabase/migrations).

export type Priorita = 'P1' | 'P2' | 'P3';

export type StatoPlace = 'da_visitare' | 'visitato' | 'cliente' | 'perso';

export type EsitoVisita = 'interessato' | 'da_richiamare' | 'non_target' | 'chiuso';

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
  linea_ipotizzata: string | null;
  aggancio_apertura: string | null;
  fuoco_espansione: string | null;
  stato: StatoPlace;
  zona: string | null;
  hubspot_company_id: string | null;
  created_at: string;
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
  foto_url: string | null;
  owner: string | null;
  hubspot_synced: boolean;
  created_at: string;
}

export interface Deal {
  id: string;
  place_id: string;
  linea: string | null;
  fase: DealStage;
  valore_atteso: number | null;
  next_action: string | null;
  owner: string | null;
  hubspot_deal_id: string | null;
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
