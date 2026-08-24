// Per OGNI colonna di `partner.csv` dice: quanti valori veri ha nel legacy, se
// in piattaforma esiste un campo corrispondente, e quanti sono valorizzati qui.
//
// Serve a smettere di scoprire i buchi uno alla volta. Il 23/08/2026 sono
// emersi in fila la Fee%, il flag magazzino e i km inclusi — tutti e tre
// «c'erano nel legacy e qui no», tutti e tre trovati per caso guardando una
// schermata. Questa e' la lista completa, contata.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { leggiCsv } from './leggi-csv.mjs';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
const db = new PrismaClient({ datasources: { db: { url:
  `postgresql://${u.username}:${u.password}@${u.hostname}:6543/postgres?schema=platform&pgbouncer=true&connection_limit=1` } } });

// legacy -> campo della piattaforma (null = nessuna casa, ancora)
const MAPPA = {
  businessName: 'insegna', vatCode: 'vatNumber', fiscalCode: 'fiscalCode', phone: 'phone',
  address: 'address', city: 'city', notes: 'notes', longitude: 'longitude', latitude: 'latitude',
  sendSms: 'smsTemplatesEnabled', kmIncluded: 'kmIncluded', receiveWhatsappMsg: 'whatsappNotifications',
  receiveEmailMsg: 'mailNotifications', extraOutSideCityKmPrice: 'extraOutOfCityPrice',
  billingAccess: 'invoicingEnabled', billingEmail: 'invoiceEmail', agency: 'businessName',
  partnerPaymentStatus: 'paymentStatus', partnerPaymentMethod: 'paymentMethod',
  bankAccount: 'bankAccount', bankAccountName: 'bankAccountName', sdiCode: 'sdiCode',
  startContractDate: 'contractStart', endContractDate: 'contractEnd', saleImage: 'imageUrl', partnerShopUrl: 'storeUrl',
  checkExpertIndentity: 'valetIdentityCheck', deliveryCodeCheck: 'deliveryCodeRequired',
  deliveryCodeCheckType: 'deliveryCodeCheckType', partnerHasWarehouse: 'hasWarehouse',
  isMultiplePickUpAddress: 'isMultiPickup', pickupAddresses: 'pickupAddresses',
  contractExpiryNotificationSent: null /* stato di una notifica del vecchio sistema */, wooCommerceApiKey: null /* credenziale: non si importa */, certifiedEmail: 'certifiedEmail',
  activityReminder: 'activityReminder',
};

const legacy = leggiCsv('C:/Users/nicol/app/deluxy-platform-next/legacy/tabelle/partner.csv');
const colonne = Object.keys(legacy[0]);
const nostri = await db.partner.findMany();
const pieno = (v) => v !== null && v !== undefined && v !== '' && v !== 'NULL' && v !== 'NaN';

const righe = [];
for (const c of colonne) {
  if (['id', 'userId', 'createdAt', 'updatedAt', 'deletedAt'].includes(c)) continue;
  const conValore = legacy.filter((r) => pieno(r[c]) && r[c] !== '0').length;
  const campo = MAPPA[c];
  const qui = campo === undefined ? '???' : campo;
  const valorizzatiQui = campo ? nostri.filter((p) => pieno(p[campo]) && p[campo] !== false && p[campo] !== 0).length : null;
  righe.push({ c, conValore, qui, valorizzatiQui });
}
righe.sort((a, b) => b.conValore - a.conValore);

console.log('COLONNA LEGACY'.padEnd(32) + 'con valore'.padStart(11) + '   CAMPO IN PIATTAFORMA'.padEnd(26) + 'valorizzati');
console.log('-'.repeat(84));
for (const r of righe) {
  const stato = r.qui === null ? '⛔ NON ESISTE' : r.qui === '???' ? '❓ da mappare' : r.qui;
  const v = r.valorizzatiQui === null ? (r.conValore > 0 ? '— DA IMPORTARE' : '—') : String(r.valorizzatiQui);
  const segno = r.qui === null && r.conValore > 0 ? '🔴 ' : '   ';
  console.log(segno + r.c.padEnd(29) + String(r.conValore).padStart(10) + '   ' + stato.padEnd(24) + v);
}
const daFare = righe.filter((r) => r.qui === null && r.conValore > 0);
console.log(`\n🔴 colonne con dati veri che in piattaforma NON hanno casa: ${daFare.length}`);
console.log('   ' + daFare.map((r) => `${r.c} (${r.conValore})`).join(', '));
await db.$disconnect();
