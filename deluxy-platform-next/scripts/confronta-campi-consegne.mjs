// Confronta le 114 colonne di `delivery` del legacy col modello `Delivery` del
// nuovo schema, e dice ONESTAMENTE che cosa NON ha una destinazione.
//
// Serve a rispondere a «hai tutti i campi?» contando, invece che a memoria.
// Ogni colonna finisce in una di tre categorie:
//   ✅ mappata            -> c'e' un campo che la riceve
//   ○  vuota nel legacy   -> nessun dato da perdere, si ignora
//   🔴 CON DATI, NON MAPPATA -> qui si perderebbe qualcosa
//
// Uso:  node C:/Users/nicol/app/deluxy-platform-next/scripts/confronta-campi-consegne.mjs

import fs from 'node:fs';

const CSV = 'C:/Users/nicol/app/deluxy-platform-next/legacy/tabelle/delivery.csv';

// La mappatura proposta: colonna legacy -> campo del nuovo Delivery.
// `null` = deliberatamente non mappata, con il motivo accanto.
const MAPPA = {
  id: 'legacyId + code',
  status: 'status',
  surname: 'recipientLastName',
  name: 'recipientFirstName',
  address: 'recipientAddress',
  deliveryDate: 'date',
  fromTime: 'deliveryTimeFrom',
  toTime: 'deliveryTimeTo',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  partnerId: 'partnerId',
  expertId: 'valetId',
  internalNotes: 'internalNotes',
  ddtNumber: 'ddtNumber',
  ddtFile: 'ddtFile',
  receiverPhone: 'recipientPhone',
  senderSurname: 'senderLastName',
  senderName: 'senderFirstName',
  senderPhone: 'senderPhone',
  notes: 'notes',
  email: 'recipientEmail',
  longitude: 'longitude',
  latitude: 'latitude',
  payAtDelivery: 'paymentOnDelivery',
  payAtDeliveryAmount: 'paymentAmount',
  tryAndReturn: 'tryAndReturn',
  deluxyDelivery: 'deluxyDelivery',
  intercom: 'recipientIntercom',
  pickUpTime: 'pickupTimeFrom/To',
  smsPhoneNo: 'smsPhoneNo',
  service: 'serviceTypeId',
  pickUpAddress: 'pickupAddress',
  distance: 'distanceKm',
  isFlexblePickUpTime: 'pickupFlexible',
  additionalPrice: 'additionalPrice',
  hours: 'hours',
  price: 'price',
  billable: 'billable',
  expertSalary: 'valetSalary',
  valetAdditionalPrice: 'valetAdditionalPrice',
  payable: 'payable',
  customerId: 'customerId',
  paymentStatus: 'paymentStatus',
  isFlexiblePrice: 'isFlexiblePrice',
  flexiblePrice: 'flexiblePrice',
  deliveryCodeRequired: 'deliveryCodeRequired',
  personalizeSaleNotes: 'personalizeSaleNotes',
  deliveredToken: 'trackingToken',
  receiverName: 'receivedBy (nome)',
  receiverSurname: 'receivedBy (cognome)',
  expertServiceId: 'valetServiceId',
  deletedAt: 'status = cancelled/archiviata',
  serviceType: 'ricavabile dal servizio',
  deliveryRuleId: 'deliveryRuleId',
  requestExpert: 'requestExpert',
  createdUser: 'createdByUserId',
  readDelivery: 'readDelivery',
  invoiced: 'invoiced',
  sendToExpert: 'sendToExpert',
  existingCustomer: 'existingCustomer',
  customSaleDelivery: 'customSaleDelivery',
  paidViaCard: 'paidViaCard',
  notDeliveredActionTaken: 'notDeliveredActionTaken',
  expertIdentityCheck: 'valetIdentityCheck',
  expertVerified: 'valetVerified',
  pickUpCompleted: 'pickupCompleted',
  deliveryCodeVerifed: 'deliveryCodeVerified',
  stockConsumed: 'stockConsumed',
  stockReturned: 'stockReturned',
  additionalValetPlusMinus: 'additionalValetPlusMinus',
  productManagement: 'productManagement',
  identifier: 'identifier',
  invoicePaymentStatus: 'invoicePaymentStatus',
  productValue: 'productValue',
  deliveryReadAt: 'readAt',
  deliveryStartedAt: 'startedAt',
  deliveryDeliveredAt: 'deliveredAt',
  deliveryReadAtByExpert: 'readAtByValet',
  approvedTimingStatus: 'approvedTimingStatus',
  province: 'provinceId',
  deliveryReadByExpert: 'readByValetUserId',
  orderId: 'legacyOrderId',
  receiverType: 'receiverType',
  deliveryReadAtByPartner: 'readAtByPartner',
  deliveryReadByPartner: 'readByPartnerUserId',
  saleId: 'legacySaleId',
  realOrderNumber: 'realOrderNumber',
  shop: 'shop',
  startTime: 'serviceStartTime',
  endTime: 'serviceEndTime',
  valetStartTime: 'valetStartTime',
  valetEndTime: 'valetEndTime',
  primaryIdOfSale: 'legacyPrimarySaleId',
  receipt: 'receipt',
  withDailyDeliveryRule: 'withDailyDeliveryRule',
  createdFrom: 'createdFrom',
  expertRuleId: 'valetDeliveryRuleId',
  saleType: 'saleType',
  acceptSale: 'acceptSale',
  externalOrderSource: 'externalOrderSource',
  withTotalDeliveryRule: 'withTotalDeliveryRule',
  correspondDelivery: 'legacyCorrespondDeliveryId',
  parentDeliveryId: 'parentDeliveryId',
  receiverSign: 'receiverSign',
  deliveryCode: 'deliveryCode',
};

// Colonne che il legacy ha ma il nuovo schema no. Se hanno dati, e' una perdita.
const MOTIVO = {
  actualDate: 'sempre vuota',
  city: 'sempre vuota',
  expiration_time: 'sempre vuota',
  approvedTimings: 'sempre vuota',
  requestExpert: 'flag "richiedi valet"',
  identifier: 'codice pubblico alfanumerico del legacy',
  createdUser: 'chi ha creato la consegna',
  updatedUser: 'chi l\'ha modificata',
  readDelivery: 'flag "letta"',
  deliveryReadAt: 'quando e\' stata letta',
  deliveryReadByPartner: 'letta da quale partner',
  deliveryReadByExpert: 'letta da quale valet',
  deliveryReadAtByPartner: 'quando letta dal partner',
  deliveryReadAtByExpert: 'quando letta dal valet',
  deliveryDeliveredAt: 'orario di consegna effettivo',
  deliveryStartedAt: 'orario di partenza',
  startTime: 'orario servizio (a ora)',
  endTime: 'orario servizio (a ora)',
  valetStartTime: 'orario valet',
  valetEndTime: 'orario valet',
  serviceName: 'nome servizio denormalizzato',
  sendToExpert: 'flag invio al valet',
  receipt: 'foto/ricevuta della consegna',
  receiverType: 'chi ha ritirato: destinatario/portiere/altro',
  acceptSale: 'flag',
  createdFrom: 'origine (automazione vendite)',
  orderId: 'ordine collegato',
  realOrderNumber: 'numero ordine del negozio',
  shop: 'negozio di provenienza',
  isPickUpTimePassed: 'flag calcolato',
  isDeliveryTimePassed: 'flag calcolato',
  withDailyDeliveryRule: 'regola giornaliera applicata',
  withTotalDeliveryRule: 'regola totale applicata',
  correspondDelivery: 'consegna corrispondente',
  externalOrderSource: 'sito di provenienza',
  approvedTimingStatus: 'stato approvazione ore',
  saleType: 'tipo di vendita',
  createdWith: 'creata con (xl)',
  province: 'provincia',
  existingCustomer: 'flag cliente gia\' esistente',
  expertRuleId: 'regola valet applicata',
  saleId: 'vendita collegata',
  primaryIdOfSale: 'id primario della vendita',
  invoicePaymentStatus: 'stato pagamento fattura',
  customSaleDelivery: 'flag',
  paidViaCard: 'pagata con carta',
  receiverSign: 'firma del ricevente',
  notDeliveredActionTaken: 'azione presa su non consegnata',
  productManagement: 'destino merce: magazzino/in auto/nessuno',
  expertIdentityCheck: 'controllo identita\' valet',
  expertVerified: 'valet verificato',
  pickUpCompleted: 'ritiro completato',
  deliveryCode: 'codice consegna',
  deliveryCodeVerifed: 'codice verificato',
  parentDeliveryId: 'consegna padre (multi-ritiro DDT)',
  additionalValetPlusMinus: 'plus/minus valet aggiuntivo',
  stockConsumed: 'magazzino scalato',
  stockReturned: 'magazzino reso',
  sensibleUpdateAt: 'ultima modifica sensibile',
};

// --- lettura in streaming: 57 MB, niente stringone in memoria ---------------
const flusso = fs.createReadStream(CSV, { encoding: 'utf8', highWaterMark: 1 << 20 });
let testa = null, pieni = null, righe = 0;
let campi = [], campo = '', inStr = false, chiusa = false;

const record = (r) => {
  if (!testa) { testa = r.map((x) => x.trim()); pieni = new Array(testa.length).fill(0); return; }
  righe++;
  for (let i = 0; i < r.length && i < pieni.length; i++) {
    const v = r[i];
    if (v !== '' && v !== 'NULL') pieni[i]++;
  }
};

for await (const pezzo of flusso) {
  for (let i = 0; i < pezzo.length; i++) {
    const c = pezzo[i];
    if (chiusa) { chiusa = false; if (c === '"') { campo += '"'; continue; } inStr = false; }
    if (inStr) { if (c === '"') { chiusa = true; continue; } campo += c; continue; }
    if (c === '"') { inStr = true; continue; }
    if (c === ',') { campi.push(campo); campo = ''; continue; }
    if (c === '\n') { campi.push(campo); record(campi); campi = []; campo = ''; continue; }
    if (c === '\r') continue;
    campo += c;
  }
}
if (campo !== '' || campi.length) { campi.push(campo); record(campi); }

// --- verdetto ---------------------------------------------------------------
const perc = (i) => Math.round((pieni[i] / righe) * 100);
const mappate = [], vuote = [], perse = [];

for (let i = 0; i < testa.length; i++) {
  const c = testa[i];
  if (MAPPA[c]) mappate.push([c, MAPPA[c], perc(i)]);
  else if (pieni[i] === 0) vuote.push(c);
  else perse.push([c, MOTIVO[c] ?? '(motivo non annotato)', perc(i), pieni[i]]);
}

console.log(`delivery: ${righe.toLocaleString('it-IT')} righe · ${testa.length} colonne\n`);
console.log(`✅ mappate ....................... ${mappate.length}`);
console.log(`○  vuote nel legacy (nessun dato)  ${vuote.length}   ${vuote.join(', ')}`);
console.log(`🔴 CON DATI E SENZA DESTINAZIONE   ${perse.length}\n`);

console.log('🔴 Ecco che cosa si perderebbe importando adesso:\n');
console.log('   colonna                        piena   righe   che cosa e\'');
console.log('   ' + '-'.repeat(88));
for (const [c, motivo, p, n] of perse.sort((a, b) => b[3] - a[3]))
  console.log(`   ${c.padEnd(30)} ${String(p).padStart(3)}%  ${String(n).padStart(6)}   ${motivo}`);
