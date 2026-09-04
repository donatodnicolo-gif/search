export type Role =
  | 'ADMIN'
  | 'OPERATION'
  | 'PARTNER'
  | 'VALET'
  | 'PROJECT_MANAGER';

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  isSupport: boolean;
  partnerId: string | null;
  valetId: string | null;
  /** Password temporanea da cambiare al primo accesso (bonifica 31/08). */
  mustChangePassword?: boolean;
  /** Valet team leader: può assegnare consegne nel suo perimetro. */
  isTeamLeader?: boolean;
  /** Partner con la home «Servizi» all'accesso (impostazione homePartnerEmails, 04/09). */
  homeVetrina?: boolean;
}

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
  /** Vero se l'account ha una password temporanea da cambiare al primo accesso. */
  mustChangePassword?: boolean;
}

export interface Delivery {
  id: string;
  code: number;
  date: string;
  status: string;
  deliveryTimeFrom?: string;
  deliveryTimeTo?: string;
  deliveryFlexible?: boolean;
  pickupTimeFrom?: string;
  pickupAddress?: string | null;
  pickupTimeTo?: string;
  pickupFlexible: boolean;
  recipientFirstName: string;
  recipientLastName: string;
  recipientAddress: string;
  recipientIntercom?: string | null;
  /** Consegne da Fornitore: la consegna la fa il partner, non un valet. */
  deliveredByPartner?: boolean;
  /** VENDITA (02/09): il partner ha premuto «Accetta» — i bottoni si spengono. */
  acceptSale?: boolean;
  /** Regola carnet applicata (id + nome), se la consegna ne segue una. */
  deliveryRuleId?: string | null;
  deliveryRule?: { name: string } | null;
  paymentOnDelivery: boolean;
  paymentAmount?: number;
  price?: number;
  /** Paga del valet: arrivano SOLO al valet della consegna (maschera server). */
  valetSalary?: number | null;
  valetAdditionalPrice?: number | null;
  valetSalaryDalListino?: number | null;
  partner?: { id: string; insegna: string };
  valet?: { id: string; firstName: string; lastName: string } | null;
  serviceType?: { id: string; name: string; pricingModel: string; scope?: string };
  /** Provincia SALVATA (geocodificata dal server): l'assegnazione la usa così
   *  com'è, senza ri-dedurla dalla stringa dell'indirizzo (fragile). */
  province?: { id: string; code: string; name: string } | null;
}

export interface Province {
  id: string;
  name: string;
  code: string;
  cities?: { name: string }[];
}

export interface Category {
  id: string;
  name: string;
  notes?: string;
  aiPrompt?: string;
  fields?: { id: string; name: string; fieldType: string }[];
  discounts?: { id: string; discountPercent: number; province: Province }[];
}

export const PRODUCT_TYPE_LABELS: Record<string, string> = {
  UNICO: 'Unico',
  NON_UNICO: 'Non unico',
  SUPERPRODOTTO: 'Superprodotto',
};

export const PRODUCT_PLATFORMS: { value: string; label: string }[] = [
  { value: 'deluxy', label: 'Deluxy' },
  { value: 'cakes', label: 'Cakes' },
  { value: 'flowers', label: 'Flowers' },
  { value: 'business', label: 'Business' },
  { value: 'experience', label: 'Deluxy Experience' },
  { value: 'dotcom', label: 'Deluxy Dot Com' },
];

export interface ProductRef {
  id: string;
  name: string;
  price?: number;
  sku?: string;
  type?: string;
  approved?: boolean;
  active?: boolean;
  /** Negozi Shopify su cui è pubblicato (JSON di nomi, es. ["DELUXY_FLOWERS"]). */
  platforms?: string | null;
  /** Gestito dall'ufficio: il partner lo vede a catalogo ma non lo tocca. */
  notEditable?: boolean;
  partner?: { id: string; insegna: string } | null;
  category?: { id: string; name: string } | null;
}

export interface ServiceType {
  id: string;
  name: string;
  code: string;
  pricingModel: string;
  scope?: string;
  notes?: string;
  // Setup prenotazione (usato dal form consegna)
  noticeDays?: number | null;
  slotHours?: number | null;
  minOrderTime?: string | null;
  maxOrderTime?: string | null;
  allowFlexibleTime?: boolean;
}

export const SERVICE_PRICING_OPTIONS: { value: string; label: string }[] = [
  { value: 'VENDITA', label: 'Vendita' },
  { value: 'PREZZO_FISSO', label: 'A prezzo fisso' },
  { value: 'A_ORA', label: 'A ora' },
  { value: 'MAGAZZINO', label: 'Magazzino' },
  { value: 'CORPORATE', label: 'Aziendale (corporate)' },
];

export const SERVICE_PRICING_LABELS: Record<string, string> = {
  VENDITA: 'Vendita',
  PREZZO_FISSO: 'A prezzo fisso',
  A_ORA: 'A ora',
  MAGAZZINO: 'Magazzino',
  CORPORATE: 'Aziendale',
};

export const SERVICE_SCOPE_LABELS: Record<string, string> = {
  partner: 'Partner',
  valet: 'Valet',
  both: 'Partner e Valet',
};

export interface Partner {
  id: string;
  insegna: string;
  email: string;
  businessName?: string;
  vatNumber?: string;
  fiscalCode?: string;
  address?: string;
  phone?: string;
  contactName?: string;
  paymentStatus?: string;
  active: boolean;
  provinces?: { province: Province }[];
  /**
   * I servizi che il partner ha a listino, col PREZZO.
   * ⚠️ Il prezzo arriva gia' in questa risposta (PARTNER_INCLUDE lato API): il
   * form lo usa per proporre il prezzo di listino al cambio di servizio, senza
   * una seconda chiamata.
   */
  services?: {
    serviceTypeId?: string;
    price?: number | null;
    includedKm?: number | null;
    extraKmPrice?: number | null;
    serviceType: { id: string; name?: string };
  }[];
  categories?: { category: Category }[];
}

export interface Valet {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  vehicle?: string;
  isTeamLeader: boolean;
  active: boolean;
  provinces?: { province: Province }[];
}

export const VEHICLE_OPTIONS = ['Auto', 'Bicicletta', 'Furgone', 'Moto/Scooter'];

export const SALARY_FREQUENCY_LABELS: Record<string, string> = {
  monthly: 'Mensile',
  weekly: 'Settimanale',
};

export interface ValetRef {
  id: string;
  firstName: string;
  lastName: string;
  hasVat?: boolean;
  active?: boolean;
  /** Account segnaposto dell'import: non è una persona da proporre. */
  placeholder?: boolean;
  salaryFrequency?: string; // monthly | weekly
  provinces?: { province: Province }[];
  /** Il listino del valet: serve a proporre solo chi ha il servizio abilitato. */
  services?: { serviceTypeId?: string; serviceType?: { id?: string } | null }[];
}

export interface Product {
  id: string;
  name: string;
  price?: number;
  sku?: string;
  partner?: { id: string; insegna: string } | null;
  /** Le taglie/varianti: senza, una consegna per la «M» nasce col prodotto base. */
  variants?: { id: string; name: string; price?: number | null; publicPrice?: number | null; active?: boolean }[];
}

export interface Customer {
  id: string;
  firstName: string;
  lastName: string;
  address?: string;
  phone?: string;
  intercom?: string;
  email?: string;
}

export interface Operation {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  address?: string;
  operationRole: string;
  active: boolean;
}

/** Ruolo operatore → etichetta + sezioni visibili. */
export const OPERATION_ROLE_OPTIONS: {
  value: string;
  label: string;
  hint: string;
}[] = [
  { value: 'operation', label: 'Operation', hint: 'Ruolo base d\'ufficio.' },
  { value: 'finance', label: 'Finance', hint: 'Vede anche la sezione Amministrazione.' },
  { value: 'project_manager', label: 'Project Manager', hint: 'Non vede la sezione Operatività.' },
  { value: 'customer_service', label: 'Customer Service', hint: 'Non vede la sezione Amministrazione.' },
];

export const OPERATION_ROLE_LABELS: Record<string, string> = Object.fromEntries(
  OPERATION_ROLE_OPTIONS.map((o) => [o.value, o.label]),
);

export const DELIVERY_PAYMENT_STATUS_LABELS: Record<string, string> = {
  default: 'Da definire',
  paid: 'Pagato',
  toBePaid: 'Da pagare',
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  bankTransfer: 'Bonifico bancario',
  creditCard: 'Carta di credito',
  directDebitMandate: 'Addebito diretto (SDD)',
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  active: 'Attivo',
  inactive: 'Inattivo',
  blocked: 'Bloccato',
};

export const DELIVERY_STATUS_LABELS: Record<string, string> = {
  created: 'Da gestire',
  assigned: 'In gestione',
  in_preparation: 'In preparazione',
  accepted: 'Accettata',
  in_delivery: 'In consegna',
  delivered: 'Consegnata',
  not_delivered: 'Non consegnata',
  cancelled: 'Annullata',
  cancellation_requested: 'Cancellazione richiesta',
  not_accepted: 'Non accettata',
  // ⚠️ Qui c'erano `delivered_time_approved` e `delivered_time_not_approved`:
  // due stati che in banca dati NON ESISTONO (zero righe su 61.837), mentre
  // mancavano i due VERI — `approved` (1.258 consegne) e `invalidated` (230).
  // Questa mappa non serve solo a scrivere l'etichetta: da lei nascono la
  // tendina del filtro e il menu «cambia stato» (`statusKeys` in
  // deliveries-list). Quindi l'elenco proponeva due stati che non trovano mai
  // niente e ne nascondeva due che valgono 1.488 consegne vere.
  delivered_time_to_approve: 'Consegnata (ore da approvare)',
  approved: 'Approvata',
  invalidated: "Annullata d'ufficio",
};

/**
 * Stati «chiusi»: la consegna non è più operativa, è storia.
 *
 * ⚠️ È il gemello di `DELIVERY_CLOSED_STATUSES` in `api/src/common/enums.ts`,
 * che resta la fonte: il browser non può importare dal server. Chi tocca l'una
 * tocchi anche l'altra — se divergono, la pagina pubblica offre un bottone che
 * il server rifiuta, e chi lo preme non capisce perché.
 */
export const DELIVERY_CLOSED_STATUSES: string[] = [
  'delivered',
  'not_delivered',
  'cancelled',
  'not_accepted',
  'approved',
  'invalidated',
];
