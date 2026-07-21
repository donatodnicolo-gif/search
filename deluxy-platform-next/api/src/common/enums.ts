// Valori ammessi per i campi "enum" (modellati come String in Prisma
// per compatibilita' SQLite; validati nei DTO con class-validator).

export enum Role {
  ADMIN = 'ADMIN',
  OPERATION = 'OPERATION',
  PARTNER = 'PARTNER',
  VALET = 'VALET',
  PROJECT_MANAGER = 'PROJECT_MANAGER',
}

/** Stato dell'accesso di un utente (separato dall'operatività dell'anagrafica). */
export enum UserStatus {
  INVITED = 'invited', // creato, deve ancora scegliere la password
  ACTIVE = 'active', // può accedere
  SUSPENDED = 'suspended', // sospeso temporaneo
  ARCHIVED = 'archived', // cessato (record conservato)
}

export enum DeliveryStatus {
  CREATED = 'created', // da gestire
  ASSIGNED = 'assigned', // in gestione
  IN_PREPARATION = 'in_preparation',
  ACCEPTED = 'accepted',
  IN_DELIVERY = 'in_delivery', // in consegna
  DELIVERED = 'delivered',
  NOT_DELIVERED = 'not_delivered',
  CANCELLED = 'cancelled',
  CANCELLATION_REQUESTED = 'cancellation_requested',
  NOT_ACCEPTED = 'not_accepted',
  // Solo per servizi a ora:
  DELIVERED_TIME_APPROVED = 'delivered_time_approved',
  DELIVERED_TIME_NOT_APPROVED = 'delivered_time_not_approved',
}

export enum PricingModel {
  PREZZO_FISSO = 'PREZZO_FISSO',
  A_ORA = 'A_ORA',
  VENDITA = 'VENDITA',
  CORPORATE = 'CORPORATE',
  MAGAZZINO = 'MAGAZZINO',
}

export enum ProductType {
  UNICO = 'UNICO',
  NON_UNICO = 'NON_UNICO',
  SUPERPRODOTTO = 'SUPERPRODOTTO',
}

/**
 * Brand / piattaforme di vendita (6 nel legacy, chiave interna tra parentesi):
 *  DELUXY (shopifysale), CAKEDESIGN_ME (cakesales),
 *  BUSINESS_DELUXY (businesssales), DELUXY_FLOWERS (flowerssales),
 *  DELUXY_EXPERIENCE (deluxyexperiencesales), DELUXY_DOT_COM (deluxydotcomsales).
 */
export enum Brand {
  DELUXY = 'DELUXY',
  DELUXY_FLOWERS = 'DELUXY_FLOWERS',
  CAKEDESIGN_ME = 'CAKEDESIGN_ME',
  BUSINESS_DELUXY = 'BUSINESS_DELUXY',
  DELUXY_EXPERIENCE = 'DELUXY_EXPERIENCE',
  DELUXY_DOT_COM = 'DELUXY_DOT_COM',
}

/** Stato pagamenti del partner (valori legacy). */
export enum PartnerPaymentStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  BLOCKED = 'blocked',
}

/** Metodo di pagamento del partner (valori legacy). */
export enum PartnerPaymentMethod {
  BANK_TRANSFER = 'bankTransfer',
  CREDIT_CARD = 'creditCard',
  DIRECT_DEBIT_MANDATE = 'directDebitMandate',
}

/** Mezzi del valet (valori usati nel legacy). */
export enum VehicleType {
  AUTO = 'Auto',
  BICICLETTA = 'Bicicletta',
  FURGONE = 'Furgone',
  MOTO_SCOOTER = 'Moto/Scooter',
}

export enum SmsTrigger {
  CREATED = 'CREATED', // consegna creata
  DEPARTED = 'DEPARTED', // consegna partita
  ARRIVED = 'ARRIVED', // consegna arrivata
}

export enum ActivityType {
  PICKUP = 'PICKUP',
  DELIVERY = 'DELIVERY',
}

export enum SalaryStatus {
  DRAFT = 'DRAFT',
  SENT = 'SENT',
  RECEIPT_PENDING = 'RECEIPT_PENDING',
  APPROVED = 'APPROVED',
  PAID = 'PAID',
}

export enum SalaryDocumentType {
  PROFORMA_INVOICE = 'PROFORMA_INVOICE',
  WITHHOLDING_RECEIPT = 'WITHHOLDING_RECEIPT',
}

export enum PaymentType {
  REIMBURSEMENT = 'REIMBURSEMENT',
  CLAIM = 'CLAIM',
  SALARY = 'SALARY', // storico del pagamento di uno stipendio
}

export enum PaymentStatus {
  REQUESTED = 'REQUESTED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  PAID = 'PAID',
}

// Fatturazione partner: Bozza -> Emessa -> Pagata
export enum InvoiceStatus {
  DRAFT = 'DRAFT',
  ISSUED = 'ISSUED',
  PAID = 'PAID',
}

export enum DeliveryRuleType {
  DAILY_COUNT = 'DAILY_COUNT',
  TOTAL_COUNT = 'TOTAL_COUNT',
}

// Notifiche in-app / Web Push. I primi tre replicano i punti in cui l'app
// reale avvisa Admin e Operation durante il processo di consegna (§5 del
// manuale COME-FUNZIONA-APP-DELUXY.md).
export enum NotificationType {
  DELIVERY_IN_DELIVERY = 'delivery_in_delivery',
  DELIVERY_DELIVERED = 'delivery_delivered',
  DELIVERY_NOT_DELIVERED = 'delivery_not_delivered',
  PARTNER_CONTRACT_EXPIRING = 'partner_contract_expiring',
}
