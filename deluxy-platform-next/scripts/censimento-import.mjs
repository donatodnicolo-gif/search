/**
 * Che cosa del vecchio database NON è ancora nella piattaforma.
 *
 * Confronta ogni tabella del legacy (`legacy/tabelle/*.csv`) con la tabella
 * corrispondente qui, e dice quante righe mancano.
 *
 * ⚠️ Il confronto è sui NUMERI, e un numero uguale non prova che il contenuto
 * sia giusto: prova solo che non manca niente. Serve a decidere DOVE guardare,
 * non a dichiarare un import riuscito.
 *
 * Sola lettura.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { leggiCsv } from './leggi-csv.mjs';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

const B = 'C:/Users/nicol/app/deluxy-platform-next/legacy/tabelle/';

const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
const db = new PrismaClient({ datasources: { db: { url:
  `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform&connection_limit=1` } } });

/**
 * La corrispondenza legacy → piattaforma.
 *
 * `null` = tabella che di proposito non si importa, con la ragione accanto:
 * scriverla è meglio che lasciarla fuori dall'elenco, perché una tabella
 * assente da un censimento sembra dimenticata.
 */
const MAPPA = {
  'partner.csv': 'Partner',
  'expert.csv': 'Valet',
  'customer.csv': 'Customer',
  'operation.csv': 'Operation',
  'delivery.csv': 'Delivery',
  'delivery-product.csv': 'DeliveryProduct',
  'product.csv': 'Product',
  'products-variants.csv': 'ProductVariant',
  'product-category.csv': 'Category',
  'provinces.csv': 'Province',
  'province-cities.csv': 'City',
  'service.csv': 'ServiceType',
  'partner-service.csv': 'PartnerService',
  'expert-service.csv': 'ValetService',
  'partner-time-availability.csv': 'PartnerDaySlot',
  'expert-time-availability.csv': 'ValetAvailability',
  'delivery-invoices.csv': 'Invoice',
  'delivery-rules.csv': 'DeliveryRule',
  'delivery-complaint.csv': 'Complaint',
  'delivery-updates.csv': 'DeliveryLog',
  'expert-receipts.csv': 'Receipt',
  'expert-vehicle.csv': 'Vehicle',
  'expert-contracts.csv': null,
  'partner-reminder.csv': 'PartnerReminder',
  'partner-invoice.csv': null,
  'custom-payments.csv': 'Payment',
  'refund-requests.csv': 'RefundRequest',
  'email-template.csv': 'EmailTemplate',
  'emails-webhook.csv': null,
  'offer.csv': 'Offer',
  'shop-collection.csv': 'ShopCollection',
  'stripe-card.csv': 'StripeCard',
  'stripe-customer.csv': null,
  'product-category-province-discount.csv': 'CategoryDiscount',
  'tabella-21.csv': 'InvoiceLine',
  'tabella-23.csv': null,
  'tabella-34.csv': 'ValetDeliveryRule',
  'tabella-35.csv': 'PartnerProvince',
  'tabella-36.csv': 'ValetPriorityEntry',
  'tabella-4.csv': 'PartnerDayException',
  'tabella-5.csv': 'PartnerWeeklyException',
  'tabella-53.csv': 'CategoryProvince',
  'tabella-54.csv': 'PriorityEntry',
  'tabella-57.csv': 'PartnerCategory',
  'tabella-64.csv': 'ProductPartnerLink',
  'tabella-76.csv': 'ShopCollectionProduct',
  'tabella-83.csv': 'ProductComponent',
  'tabella-2.csv': 'ValetDeliveryRuleValet',
  'tabella-3.csv': 'DeliveryRulePartner',
  'tabella-89.csv': 'ValetPartnerProvince',
  'tabella-85.csv': 'ValetPartner',
  'tabella-46.csv': 'OfferProduct',
};

const RAGIONI = {
  'expert-contracts.csv': 'contratti dei valet: 2 righe, sono PDF su S3',
  'partner-invoice.csv': 'documenti fattura del partner: sono URL, non dati',
  'emails-webhook.csv': 'traccia dei webhook email: log del vecchio sistema',
  'stripe-customer.csv': 'clienti Stripe: vivono in Stripe, non qui',
  'tabella-23.csv': 'ponte consegna→prodotto: sostituito da DeliveryProduct',
};

const tabelle = fs.readdirSync(B).filter((f) => f.endsWith('.csv')).sort();
const righe = [];

for (const f of tabelle) {
  let legacy = 0;
  try {
    legacy = leggiCsv(B + f).filter((r) => !r.deletedAt).length;
  } catch {
    righe.push({ f, legacy: null, qui: null, nota: 'CSV illeggibile' });
    continue;
  }
  const modello = MAPPA[f];
  if (modello === null) { righe.push({ f, legacy, qui: null, nota: RAGIONI[f] ?? 'non si importa' }); continue; }
  if (modello === undefined) { righe.push({ f, legacy, qui: null, nota: '🔴 NON MAPPATA' }); continue; }
  let qui = null;
  try {
    qui = (await db.$queryRawUnsafe(`SELECT count(*)::int n FROM platform."${modello}"`))[0].n;
  } catch {
    righe.push({ f, legacy, qui: null, nota: `🔴 tabella "${modello}" NON ESISTE` });
    continue;
  }
  righe.push({ f, legacy, qui, modello });
}

const mancanti = righe.filter((r) => r.qui != null && r.qui < r.legacy);
const uguali = righe.filter((r) => r.qui != null && r.qui >= r.legacy);
const fuori = righe.filter((r) => r.qui == null);

console.log('');
console.log('='.repeat(78));
console.log('  CENSIMENTO DELL\'IMPORT — legacy contro piattaforma');
console.log('='.repeat(78));

console.log(`\n🔴 MANCA QUALCOSA (${mancanti.length}):\n`);
console.log('  tabella legacy'.padEnd(36) + 'legacy'.padStart(9) + 'qui'.padStart(9) + '   mancano');
for (const r of mancanti.sort((a, b) => (b.legacy - b.qui) - (a.legacy - a.qui))) {
  console.log('  ' + r.f.padEnd(34) + String(r.legacy).padStart(9) + String(r.qui).padStart(9) +
    ('  −' + (r.legacy - r.qui).toLocaleString('it-IT')).padStart(12) + '  → ' + r.modello);
}

console.log(`\n✅ COMPLETE (${uguali.length}): ` + uguali.map((r) => r.f.replace('.csv', '')).join(', '));

console.log(`\n⬜ FUORI DAL CONFRONTO (${fuori.length}):\n`);
for (const r of fuori) {
  console.log('  ' + r.f.padEnd(34) + String(r.legacy ?? '—').padStart(9) + '   ' + (r.nota ?? ''));
}

await db.$disconnect();
