// Valori ammessi per i campi "enum" (modellati come String in Prisma
// per compatibilita' SQLite; validati nei DTO con class-validator).

export enum Role {
  ADMIN = 'ADMIN',
  OPERATION = 'OPERATION',
  PARTNER = 'PARTNER',
  VALET = 'VALET',
  PROJECT_MANAGER = 'PROJECT_MANAGER',
  /**
   * Cliente finale. Introdotto con la migrazione dal legacy: lì i clienti erano
   * anagrafiche senza accesso (password sempre vuota su tutte le 4.514 righe).
   * Un account CUSTOMER vede solo le proprie consegne, mai quelle altrui.
   */
  CUSTOMER = 'CUSTOMER',
}

/** Stato dell'accesso di un utente (separato dall'operatività dell'anagrafica). */
export enum UserStatus {
  INVITED = 'invited', // creato, deve ancora scegliere la password
  ACTIVE = 'active', // può accedere
  SUSPENDED = 'suspended', // sospeso temporaneo
  ARCHIVED = 'archived', // cessato (record conservato)
  /**
   * Estinto: l'accesso è chiuso E i dati personali sono stati rimossi.
   *
   * È un gesto solo, non due. Archiviare senza anonimizzare lascia in giro
   * nome, email e telefono di persone che se ne sono andate anni fa;
   * anonimizzare senza chiudere l'accesso lascia un account che entra.
   *
   * ⚠️ L'ID non cambia mai: le consegne mantengono il legame col loro autore e
   * i conteggi non si muovono. Cancellare la riga avrebbe invece svuotato
   * l'autore su tutto lo storico (`ON DELETE SET NULL`), in silenzio.
   */
  EXTINCT = 'extinct',
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
  // ⚠️ Qui c'erano `delivered_time_approved` e `delivered_time_not_approved`:
  // due stati che in banca dati NON ESISTONO e non sono mai esistiti (misurato
  // il 26/08/2026 su tutte le 61.837 consegne: zero righe). Erano peggio che
  // inutili, perche' `@IsEnum(DeliveryStatus)` li ACCETTAVA in scrittura e il
  // menu «cambia stato» li proponeva: un operatore che ne sceglieva uno
  // portava la consegna in uno stato che nessun conto conosce — e lo stipendio,
  // che paga solo `delivered | approved | not_delivered`, smetteva di vederla.
  // Gli stati veri delle ore sono i due qui sotto.
  // --- stati che esistevano nel database originario e qui mancavano ---
  /** Consegnata, ore ancora DA approvare (708 consegne nel legacy). */
  DELIVERED_TIME_TO_APPROVE = 'delivered_time_to_approve',
  /** Approvata (550 consegne). */
  APPROVED = 'approved',
  /** Annullata d'ufficio / non valida (230 consegne). */
  INVALIDATED = 'invalidated',
}

/**
 * Stati "chiusi": la consegna non è più operativa, è storia.
 *
 * Definiti in UN SOLO POSTO perché la lista consegne, lo Storico e i conteggi
 * devono concordare: se due punti del codice decidessero da soli che cosa è
 * chiuso, una consegna potrebbe non comparire in nessuna delle due viste.
 *
 * Nell'archivio importato dal legacy sono l'89% del totale (55.060 su 61.836):
 * senza separarli, la lista operativa è illeggibile.
 */
export const DELIVERY_CLOSED_STATUSES: string[] = [
  DeliveryStatus.DELIVERED,
  DeliveryStatus.NOT_DELIVERED,
  DeliveryStatus.CANCELLED,
  DeliveryStatus.NOT_ACCEPTED,
  DeliveryStatus.APPROVED,
  DeliveryStatus.INVALIDATED,
];

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
  // Richieste di preventivo dei partner: nuova richiesta (per l'ufficio)
  // e risposta dell'ufficio (per il partner).
  // ⭐ 04/09/2026 (regola utente): le ore di un servizio A ORA dichiarate dal
  // valet, e la decisione del partner.
  DELIVERY_HOURS_TO_APPROVE = 'delivery_hours_to_approve',
  DELIVERY_HOURS_APPROVED = 'delivery_hours_approved',
  DELIVERY_HOURS_REJECTED = 'delivery_hours_rejected',
  QUOTE_REQUEST = 'quote_request',
  QUOTE_REPLY = 'quote_reply',
}

/**
 * Stati di una vendita, con i nomi che usa l'app reale.
 *
 * `DA_GESTIRE` non e' un errore: e' l'esito legittimo quando nessun partner
 * puo' prendere la vendita (provincia non servita, tutti chiusi, nessuna lista
 * priorita'). Assegnarla lo stesso a qualcuno la farebbe sparire da questa
 * coda, che e' proprio quella che qualcuno deve guardare.
 */
export enum SaleStatus {
  DA_GESTIRE = 'da_gestire',
  PROPOSTA = 'proposta',
  ACCETTATA = 'accettata',
  NON_ACCETTATA = 'non_accettata',
  ANNULLATA = 'annullata',
}
