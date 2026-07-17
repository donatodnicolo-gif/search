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
}

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

export interface Delivery {
  id: string;
  code: number;
  date: string;
  status: string;
  pickupTimeFrom?: string;
  pickupTimeTo?: string;
  pickupFlexible: boolean;
  recipientFirstName: string;
  recipientLastName: string;
  recipientAddress: string;
  paymentOnDelivery: boolean;
  paymentAmount?: number;
  price?: number;
  partner?: { id: string; insegna: string };
  valet?: { id: string; firstName: string; lastName: string } | null;
  serviceType?: { id: string; name: string; pricingModel: string };
}

export interface Province {
  id: string;
  name: string;
  code: string;
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
  // Setup prenotazione
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
}

export interface Product {
  id: string;
  name: string;
  price?: number;
  sku?: string;
  partner?: { id: string; insegna: string } | null;
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
  delivered_time_approved: 'Consegnata (orario approvato)',
  delivered_time_not_approved: 'Consegnata (orario da approvare)',
};
