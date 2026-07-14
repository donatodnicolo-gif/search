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
