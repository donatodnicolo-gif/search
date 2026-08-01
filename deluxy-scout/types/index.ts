// Tipi condivisi dell'app. Rispecchiano lo schema Supabase (vedi /supabase/migrations).

export type Priorita = 'P1' | 'P2' | 'P3';

export type StatoPlace = 'da_visitare' | 'visitato' | 'cliente' | 'perso';

export type EsitoVisita = 'interessato' | 'da_richiamare' | 'non_target' | 'chiuso';

// Stato di lavorazione dell'affiliazione — gli 8 valori del registro Deluxy Anagrafiche.
// ⚠️ **VOCABOLARIO CONDIVISO CON DELUXY ANAGRAFICHE** (decisione dell'utente
// del 29/07/2026): stessi valori, stesso ordine, in
// `deluxy-anagrafiche/src/lib/stati.ts` → `STATI`. Un'azienda ha UN solo stato
// commerciale e dev'essere lo stesso da qualunque app la si guardi.
// Aggiungendone uno qui, va aggiunto anche di là.
//
// Prima erano due liste diverse: il registro ne aveva 8 e non conosceva
// `selezionato` né `lead`, che Scout doveva tradurre in `prospect` perdendo
// l'informazione. Ora li ha anche lui, e `a_rischio` — che non aveva nessuno
// dei due — li ha entrambi.
// ⚠️ 31/07/2026 — cinque valori se ne sono andati da qui: `in_contatto`,
// `in_attesa`, `da_ricontattare`, `a_rischio` e `non_interessato` sono passati
// alla dimensione LIVELLO DEL RAPPORTO qui sotto. Non erano gradini del funnel
// ma modi in cui va il rapporto, e tenerli nella stessa lista costringeva a
// scegliere fra due informazioni vere insieme: «a rischio» toglieva la parola
// *cliente* proprio a chi cliente lo è ancora, «non interessato» cancellava il
// fatto che restava un lead a cui avevamo parlato. Stessa decisione presa nel
// registro Anagrafiche, e stessi valori.
export type StatoAffiliazione =
  | 'selezionato'
  | 'lead'
  | 'prospect'
  | 'in_trattativa'
  | 'attivo'
  | 'dismesso';

// Ordine dello "step" (dal primo contatto alla chiusura) per la UI.
export const STATI_AFFILIAZIONE: StatoAffiliazione[] = [
  'selezionato',
  'lead',
  'prospect',
  'in_trattativa',
  'attivo',
  'dismesso',
];

/**
 * IL MOMENTO DEL CONTATTO — la seconda dimensione, dentro lo stato.
 *
 * Nel registro si chiama `livello`. ⚠️ **Qui NO**, e non è pignoleria: in Scout
 * «livello» è già la scala del funnel (Selezionato · Lead · Prospect · Cliente
 * · Dormiente, `lib/livelli.ts`). Chiamare `livello` anche questo avrebbe
 * creato la stessa trappola di `prospect`, che nelle due app voleva dire due
 * cose opposte e ci è costata un giro a vuoto. I **valori** sono gli stessi del
 * registro; cambia solo il nome del campo.
 *
 * Vuoto = non indicato. Nessuno dei tre è il punto di partenza «giusto».
 */
export type MomentoContatto =
  | 'in_contatto'
  | 'in_attesa'
  | 'da_ricontattare'
  | 'attivo'
  | 'a_rischio'
  | 'non_interessato';

export const MOMENTI_CONTATTO: MomentoContatto[] = [
  'in_contatto',
  'in_attesa',
  'da_ricontattare',
  'attivo',
  'a_rischio',
  'non_interessato',
];

export const LABEL_MOMENTO: Record<MomentoContatto, string> = {
  in_contatto: 'In contatto',
  in_attesa: 'In attesa',
  da_ricontattare: 'Da ricontattare',
  // ⚠️ Stesso slug dello stato commerciale `attivo`, ma è un'altra colonna e
  // vuol dire un'altra cosa: là «è un cliente», qui «il rapporto è vivo, ci
  // parliamo». Un cliente che non risponde più è stato `attivo` con livello
  // `da_ricontattare` — ed è proprio la coppia che prima non si poteva scrivere.
  attivo: 'Attivo',
  a_rischio: 'A rischio',
  non_interessato: 'Non interessato',
};

/**
 * Lo stato da mandare ad Anagrafiche.
 *
 * ⚠️ Ora è l'identità: dal 29/07/2026 il registro conosce gli **stessi** stati,
 * `selezionato` e `lead` compresi, quindi non si traduce più niente — prima
 * diventavano entrambi `prospect` e l'informazione si perdeva per strada.
 * La funzione resta perché la chiamano già in tre punti, e perché il giorno che
 * i due cataloghi divergono di nuovo è qui che si mette la traduzione.
 */
export function statoRegistroDaAffiliazione(s: StatoAffiliazione | null | undefined): string | null {
  return s ?? null;
}

// Ponte tra i due modelli di stato: il registro Anagrafiche ha 8 stati
// (StatoAffiliazione), la pipeline interna di Scout ne ha 4 (StatoPlace). Quando
// si imposta lo stato "vero" (quello di Anagrafiche) si deriva anche lo stato di
// pipeline, così percorso/filtri restano coerenti.
export const statoPlaceDaAffiliazione: Record<StatoAffiliazione, StatoPlace> = {
  selezionato: 'da_visitare',
  lead: 'da_visitare',
  prospect: 'da_visitare',
  in_trattativa: 'visitato',
  attivo: 'cliente',
  dismesso: 'perso',
};

// Stato Anagrafiche di default quando un negozio ha solo lo stato di pipeline
// (nessuno stato registro ancora impostato).
export const affiliazioneDaStatoPlace: Record<StatoPlace, StatoAffiliazione> = {
  da_visitare: 'prospect',
  // Era `in_contatto`, che dal 31/07/2026 non è più uno stato ma il momento del
  // contatto. «Visitato» vuol dire che qualcuno c'è andato: come stato
  // commerciale è un lead, e il dettaglio sta in `livello_rapporto`.
  visitato: 'lead',
  cliente: 'attivo',
  // `non_interessato` non è più uno stato: è un livello. Un rapporto chiuso
  // resta un lead a cui abbiamo parlato — il «non interessato» si scrive
  // accanto, non al posto.
  perso: 'lead',
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
// ⚠️ I nomi sono quelli del **registro Anagrafiche**, che è la fonte di verità
// del catalogo (verificato il 28/07/2026: «Gifting» su 51 partner, «Eventi &
// Catering» su 47; «Regali aziendali» non esiste lì). Qui dentro erano rimasti
// i nomi vecchi, e le due scritture convivevano nelle liste come se fossero
// due interessi diversi.
export type LineaNome =
  | 'Consegne'
  | 'Eventi & Catering'
  | 'Gifting'
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
  'Eventi & Catering',
  'Gifting',
  'Affiliazioni',
  'Re-seller',
  'Food Supplier',
  'Clientelling',
  'Concierge',
  'Magazzino',
];

// Linee attive: usabili come tipologia di interesse primaria (esclude le standby).
export const LINEE_ATTIVE: LineaNome[] = LINEE.filter((l) => !LINEE_STANDBY.includes(l));

// Alias di linee LEGACY → nome canonico del catalogo attuale (allineato ad
// Anagrafiche). Serve a non mostrare più valori vecchi come "Regali aziendali"
// o "Catering", ricondotti alla linea canonica corrispondente.
const ALIAS_LINEE: Record<string, string> = {
  'regali aziendali': 'Gifting',
  regali: 'Gifting',
  gifting: 'Gifting',
  catering: 'Eventi & Catering',
  eventi: 'Eventi & Catering',
  'eventi & catering': 'Eventi & Catering',
};

/**
 * Riconduce una lista di linee ai nomi canonici del catalogo (dedup, ordine
 * invariato).
 *
 * ⚠️ Anche le MAIUSCOLE contano, ed è il motivo per cui questa funzione non
 * bastava: nel registro Anagrafiche convivono «Consegne» e «consegne», e senza
 * questo passaggio erano due tag diversi — filtravi per uno e perdevi gli altri
 * (segnalato il 31/07/2026). Prima si guardava solo la lista degli alias, che
 * copre i nomi *vecchi*, non le varianti di scrittura di quelli giusti.
 */
export function canonizzaLinee(linee: string[] | null | undefined): string[] {
  const out: string[] = [];
  for (const l of linee ?? []) {
    const grezzo = l.trim();
    const minuscolo = grezzo.toLowerCase();
    const c =
      ALIAS_LINEE[minuscolo] ??
      // Stesso nome scritto in un altro modo: vince la grafia del catalogo.
      LINEE.find((x) => x.toLowerCase() === minuscolo) ??
      grezzo;
    if (c && !out.includes(c)) out.push(c);
  }
  return out;
}

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
  stato_affiliazione?: StatoAffiliazione | null; // stato commerciale, condiviso col registro
  /** Come va il rapporto *dentro* lo stato (migr. 0057). */
  livello_rapporto?: MomentoContatto | null;
  creato_da?: string | null; // uuid dell'utente che ha inserito il target
  creato_da_nome?: string | null; // nome del creatore, risolto dai profili
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
  // Quando si ha intenzione di andarci (migrazione 0047). È un'INTENZIONE: il
  // fatto compiuto sta in `visits.data`, e registrando la visita si azzera.
  visita_pianificata?: string | null;
  nascosto?: boolean; // "non interessante": escluso dalla scoperta, visibile solo in Profilo → Nascosti
  hubspot_ha_contatto?: boolean; // l'azienda abbinata ha almeno un contatto
  hubspot_deal_aperta?: boolean; // l'azienda abbinata ha una trattativa aperta
  google_rating?: number | null; // voto Google 0-5 (recensioni)
  google_reviews?: number | null; // numero di recensioni Google
  // Id del partner nel registro Anagrafiche (migr. 0016). È il ponte con le
  // altre app: FINANCE dice «non fattura più» per anagraficaId, non per nome —
  // i nomi si scrivono in dieci modi e sbagliare match qui vorrebbe dire
  // dichiarare dormiente il cliente sbagliato.
  anagrafiche_id?: string | null;
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
  /** Perché si è andati: uno o più motivi (migrazione 0053). `linea_proposta`
   *  resta il PRIMO motivo — lo leggono già storico, export e sync HubSpot.
   *  Opzionale: le visite registrate prima della 0053 non ce l'hanno. */
  motivi?: string[] | null;
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
  // Quando la trattativa è stata aperta (migr. 0039). Assente sulle trattative
  // aperte prima di quella data e su quelle che arrivano da HubSpot/registro.
  created_at?: string | null;
  // Memoria della trattativa (migr. 0040, docs/VISIONE-COMMERCIALE.md):
  oggetto?: string | null; // per cosa è (es. "consegne weekend")
  canale?: CanaleTrattativa | null; // quale attività l'ha generata
  motivo_perso?: MotivoPerso | null; // perché è persa → strategia di ripresa
  riprendere_il?: string | null; // quando ricompare in Home (YYYY-MM-DD)
  chiusa_il?: string | null; // quando è stata vinta/persa
}

// I 3 canali di acquisizione (+ altro): territorio, telefono, web.
export type CanaleTrattativa = 'territorio' | 'telefono' | 'web' | 'altro';
export const CANALI: { valore: CanaleTrattativa; label: string }[] = [
  { valore: 'territorio', label: 'Territorio' },
  { valore: 'telefono', label: 'Telefono' },
  { valore: 'web', label: 'Web' },
  { valore: 'altro', label: 'Altro' },
];

// Ordine: il punto d'arrivo del funnel — cosa abbiamo chiuso davvero.
export interface Ordine {
  id: string;
  deal_id: string | null;
  place_id: string | null;
  cliente: string;
  descrizione: string | null;
  valore: number | null;
  canale: CanaleTrattativa | null;
  linea: string | null;
  stato: 'da_incassare' | 'incassato' | 'annullato';
  incassato_il: string | null;
  owner: string | null;
  created_at: string;
}

// Lead da internet in coda di qualificazione, prima di diventare trattativa.
export type FonteLead = 'sito' | 'mail' | 'social' | 'passaparola' | 'altro';
export interface Lead {
  id: string;
  nome: string;
  contatto: string | null;
  fonte: FonteLead;
  messaggio: string | null;
  stato: 'nuovo' | 'qualificato' | 'scartato';
  place_id: string | null;
  deal_id: string | null;
  owner: string | null;
  created_at: string;
  lavorato_il: string | null;
}

// Perché una trattativa si perde. Il motivo decide come (e se) riprenderla.
export type MotivoPerso = 'prezzo' | 'tempistica' | 'concorrente' | 'non_risponde' | 'non_target' | 'altro';
export const MOTIVI_PERSO: { valore: MotivoPerso; label: string; riprendibile: boolean }[] = [
  { valore: 'prezzo', label: 'Prezzo', riprendibile: true },
  { valore: 'tempistica', label: 'Tempistica', riprendibile: true },
  { valore: 'concorrente', label: 'Concorrente', riprendibile: true },
  { valore: 'non_risponde', label: 'Non risponde', riprendibile: true },
  { valore: 'non_target', label: 'Non target', riprendibile: false },
  { valore: 'altro', label: 'Altro', riprendibile: true },
];

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
