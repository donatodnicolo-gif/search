/**
 * Esempi concreti di consegne che non entrano in fattura o in stipendio.
 *
 * ⚠️ Chiama le funzioni VERE (compilate al volo dai moduli di produzione): un
 * primo tentativo con la diagnosi riscritta a mano dava esempi sbagliati —
 * dava per «non prezzabile» una consegna che aveva un listino da 12 €.
 *
 * Sola lettura.
 */
import fs from 'node:fs';
import ts from 'typescript';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

const B = 'C:/Users/nicol/app/deluxy-platform-next/scripts/';
const A = 'C:/Users/nicol/app/deluxy-platform-next/api/src/';
async function compila(file, da, a, out) {
  const src = fs.readFileSync(file, 'utf8');
  const js = ts.transpileModule(src.slice(src.indexOf(da), src.indexOf(a)),
    { compilerOptions: { target: 'ES2022', module: 'ESNext' } }).outputText;
  fs.writeFileSync(B + out, js);
  return import('./' + out);
}
const { prezzoConsegna } = await compila(A + 'invoices/invoices.module.ts',
  'export type RegolaCarnet', '/** Aliquota IVA', '_prezzo.mjs');
const { pagaConsegna } = await compila(A + 'salaries/salaries.module.ts',
  'export type RegolaPaga', '@Injectable()', '_paga.mjs');

const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
const db = new PrismaClient({ datasources: { db: { url:
  `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform&connection_limit=1` } } });

const eur = (n) => n.toLocaleString('it-IT', { minimumFractionDigits: 2 }) + ' €';
const linea = (c) => console.log((c || '─').repeat(76));

// ═══════════════════════════ FATTURE ═══════════════════════════
const daFatturare = await db.delivery.findMany({
  where: {
    billable: true, status: { notIn: ['cancelled', 'notDelivered'] },
    invoiceLines: { none: {} }, invoiced: false,
    OR: [{ price: null }, { price: 0 }],
  },
  select: {
    code: true, date: true, price: true, additionalPrice: true, hours: true,
    distanceKm: true, extraKm: true, extraOutOfCity: true,
    partnerId: true, serviceTypeId: true,
    partner: { select: { insegna: true } },
    serviceType: { select: { name: true, pricingModel: true, basePrice: true, perPiecePrice: true, minHours: true } },
    products: { select: { quantity: true, price: true } },
    deliveryRule: { select: { name: true, partnerBillingAdjustment: true, toBill: true } },
  },
  orderBy: { date: 'desc' }, take: 5000,
});
const listiniP = new Map((await db.partnerService.findMany())
  .map((l) => [l.partnerId + '|' + l.serviceTypeId, l]));

const CAUSE_F = {
  listino: 'il partner NON HA un listino per questo servizio: non esiste una tariffa da applicare',
  regola: 'una regola carnet dice di NON fatturarla (il carnet è già stato pagato in anticipo)',
  prodotti: 'servizio corporate senza prodotti: il corporate si calcola sul loro valore',
};

console.log('');
linea('═');
console.log('  NON PREZZABILI — perché non entrano in fattura');
linea('═');

const gruppiF = {};
for (const d of daFatturare) {
  const l = listiniP.get(d.partnerId + '|' + d.serviceTypeId) || null;
  if (prezzoConsegna(d, l, d.deliveryRule || null)) continue;
  const causa = d.deliveryRule && d.deliveryRule.toBill === false ? 'regola' : (l ? 'prodotti' : 'listino');
  (gruppiF[causa] = gruppiF[causa] || []).push(d);
}
for (const [causa, dd] of Object.entries(gruppiF).sort((a, b) => b[1].length - a[1].length)) {
  linea();
  console.log('▸ ' + CAUSE_F[causa]);
  console.log('  ' + dd.length.toLocaleString('it-IT') + ' casi fra i ' + daFatturare.length.toLocaleString('it-IT') + ' letti');
  console.log('');
  for (const d of dd.slice(0, 3)) {
    const l = listiniP.get(d.partnerId + '|' + d.serviceTypeId) || null;
    const val = d.products.reduce((s, p) => s + (p.price || 0) * (p.quantity || 1), 0);
    console.log('   #' + String(d.code).padEnd(6) + ' ' + d.date.toISOString().slice(0, 10) + '  ' + String(d.partner?.insegna || '—').slice(0, 26));
    console.log('      servizio  ' + (d.serviceType?.name || '—') + '  (' + d.serviceType?.pricingModel + ')');
    console.log('      prezzo    ' + eur(d.price || 0) + ' sulla consegna');
    console.log('      listino   ' + (l
      ? 'tariffa ' + l.price + ' · km inclusi ' + l.includedKm + ' · extra km ' + l.extraKmPrice
      : 'nessuno, per questo partner + questo servizio'));
    if (d.products.length) console.log('      prodotti  ' + d.products.length + ' · valore ' + eur(val));
    if (d.deliveryRule) console.log('      regola    ' + d.deliveryRule.name + ' · daFatturare=' + d.deliveryRule.toBill);
    console.log('');
  }
}

// ═══════════════════════════ STIPENDI ═══════════════════════════
const daPagare = await db.delivery.findMany({
  where: {
    NOT: { valetId: null }, valet: { placeholder: false }, payable: true,
    status: { in: ['delivered', 'delivered_time_approved'] },
    paymentStatus: { not: 'paid' }, salaryLines: { none: {} },
    OR: [{ valetSalary: null }, { valetSalary: 0 }],
  },
  select: {
    code: true, date: true, valetSalary: true, valetAdditionalPrice: true,
    hours: true, extraKm: true, valetServiceId: true,
    valet: { select: { firstName: true, lastName: true } },
    serviceType: { select: { name: true, pricingModel: true, minHours: true } },
    deliveryRule: { select: { name: true, valetPayAdjustment: true, toPay: true } },
    valetDeliveryRule: { select: { name: true, tiers: true, active: true } },
    _count: { select: { pickups: true } },
  },
  orderBy: { date: 'desc' }, take: 5000,
});
const ids = [...new Set(daPagare.map((d) => d.valetServiceId).filter(Boolean))];
const listiniV = new Map((await db.valetService.findMany({
  where: { id: { in: ids } },
  include: { serviceType: { select: { name: true, pricingModel: true, minHours: true } } },
})).map((r) => [r.id, r]));

const CAUSE_P = {
  servizio: 'sulla consegna non è scritto QUALE servizio ha svolto il valet: senza quello non c\u2019è un listino da leggere',
  listino: 'il servizio è indicato ma quel listino del valet non esiste',
  regola: 'una regola carnet dice di NON pagarla',
};

console.log('');
linea('═');
console.log('  NON PAGABILI — perché non entrano nello stipendio');
linea('═');

const gruppiP = {};
for (const d of daPagare) {
  const l = listiniV.get(d.valetServiceId || '') || null;
  if (pagaConsegna(d, l, d.deliveryRule || null, d.valetDeliveryRule || null, d._count?.pickups || 0)) continue;
  const causa = d.deliveryRule && d.deliveryRule.toPay === false ? 'regola' : (d.valetServiceId ? 'listino' : 'servizio');
  (gruppiP[causa] = gruppiP[causa] || []).push(d);
}
for (const [causa, dd] of Object.entries(gruppiP).sort((a, b) => b[1].length - a[1].length)) {
  linea();
  console.log('▸ ' + CAUSE_P[causa]);
  console.log('  ' + dd.length.toLocaleString('it-IT') + ' casi fra i ' + daPagare.length.toLocaleString('it-IT') + ' letti');
  console.log('');
  for (const d of dd.slice(0, 3)) {
    const l = listiniV.get(d.valetServiceId || '') || null;
    console.log('   #' + String(d.code).padEnd(6) + ' ' + d.date.toISOString().slice(0, 10) + '  ' +
      ((d.valet?.lastName || '') + ' ' + (d.valet?.firstName || '')).trim().slice(0, 26));
    console.log('      servizio partner  ' + (d.serviceType?.name || '—') + '  (' + d.serviceType?.pricingModel + ')');
    console.log('      servizio valet    ' + (d.valetServiceId
      ? (l ? l.serviceType?.name + ' · paga ' + l.salary : 'id presente ma il listino non esiste')
      : 'NON INDICATO sulla consegna'));
    console.log('      paga              ' + eur(d.valetSalary || 0) + ' sulla consegna · ritiri nel giro ' + (d._count?.pickups || 0));
    if (d.deliveryRule) console.log('      regola carnet     ' + d.deliveryRule.name + ' · daPagare=' + d.deliveryRule.toPay);
    console.log('');
  }
}
linea('═');
await db.$disconnect();
