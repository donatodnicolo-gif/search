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
}

export interface ServiceType {
  id: string;
  name: string;
  code: string;
  pricingModel: string;
}

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
