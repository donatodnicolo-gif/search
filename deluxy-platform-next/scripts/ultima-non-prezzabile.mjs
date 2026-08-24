/**
 * L'ULTIMA consegna non prezzabile e l'ultima non pagabile, per data.
 *
 * ⚠️ Solo consegne VALIDE: non cancellate logicamente (`deletedAt`), e con uno
 * stato che vale — niente `cancelled`, `not_delivered`, `invalidated`,
 * `not_accepted`.
 *
 * ⚠️ Le date fuori dal mondo (2029, 2926, 2001) si mostrano a parte: sono
 * errori di battitura del legacy, e prendere «l'ultima» senza guardarle
 * risponderebbe «anno 2926».
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
const { pagaConsegna, scegliListinoValet } = await compila(A + 'salaries/salaries.module.ts',
  'export type RegolaPaga', '@Injectable()', '_paga.mjs');

const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
const db = new PrismaClient({ datasources: { db: { url:
  `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform&connection_limit=1` } } });

const OGGI = new Date();
const plausibile = (d) => d.getFullYear() >= 2019 && d <= new Date(OGGI.getFullYear() + 1, 11, 31);
const g = (d) => d.toISOString().slice(0, 10);
const linea = (c) => console.log((c || '─').repeat(76));

// ─────────────────────────── FATTURE ───────────────────────────
const daFatturare = await db.delivery.findMany({
  where: {
    deletedAt: null, billable: true,
    status: { notIn: ['cancelled', 'not_delivered', 'invalidated', 'not_accepted'] },
    invoiceLines: { none: {} }, invoiced: false,
    OR: [{ price: null }, { price: 0 }],
  },
  select: {
    code: true, date: true, status: true, price: true, additionalPrice: true, hours: true,
    distanceKm: true, extraKm: true, extraOutOfCity: true, partnerId: true, serviceTypeId: true,
    partner: { select: { insegna: true } },
    serviceType: { select: { name: true, pricingModel: true, basePrice: true, perPiecePrice: true, minHours: true } },
    products: { select: { quantity: true, price: true } },
    deliveryRule: { select: { name: true, partnerBillingAdjustment: true, toBill: true } },
  },
  orderBy: { date: 'desc' },
});
const listiniP = new Map((await db.partnerService.findMany())
  .map((l) => [l.partnerId + '|' + l.serviceTypeId, l]));

const nonPrezzabili = daFatturare.filter((d) =>
  !prezzoConsegna(d, listiniP.get(d.partnerId + '|' + d.serviceTypeId) || null, d.deliveryRule || null)
  && !(d.deliveryRule && d.deliveryRule.toBill === false));

linea('═');
console.log('  ULTIMA CONSEGNA NON PREZZABILE');
linea('═');
const fuoriF = nonPrezzabili.filter((d) => !plausibile(d.date));
const veriF = nonPrezzabili.filter((d) => plausibile(d.date));
const uf = veriF[0];
if (uf) {
  console.log('   #' + uf.code + '   ' + g(uf.date) + '   ' + (uf.partner?.insegna || '—'));
  console.log('   stato       ' + uf.status);
  console.log('   servizio    ' + (uf.serviceType?.name || '—') + '  (' + uf.serviceType?.pricingModel + ')');
  console.log('   listino     ' + (listiniP.get(uf.partnerId + '|' + uf.serviceTypeId) ? 'presente' : 'NON ESISTE per questo partner + questo servizio'));
  console.log('   giorni fa   ' + Math.round((OGGI - uf.date) / 86400000));
}
console.log('   totale non prezzabili: ' + veriF.length.toLocaleString('it-IT'));
if (fuoriF.length) {
  console.log('   ⚠️ scartate ' + fuoriF.length + ' con data impossibile: ' +
    fuoriF.slice(0, 5).map((d) => '#' + d.code + ' ' + g(d.date)).join(' · '));
}

// ─────────────────────────── STIPENDI ───────────────────────────
const daPagare = await db.delivery.findMany({
  where: {
    NOT: { valetId: null }, valet: { placeholder: false },
    deletedAt: null, payable: true,
    status: { in: ['delivered', 'approved'] },
    paymentStatus: { not: 'paid' }, salaryLines: { none: {} },
    OR: [{ valetSalary: null }, { valetSalary: 0 }],
  },
  select: {
    code: true, date: true, status: true, valetSalary: true, valetAdditionalPrice: true,
    hours: true, extraKm: true, valetServiceId: true, valetId: true,
    valet: { select: { firstName: true, lastName: true } },
    serviceType: { select: { name: true, pricingModel: true, minHours: true } },
    deliveryRule: { select: { name: true, valetPayAdjustment: true, toPay: true } },
    valetDeliveryRule: { select: { name: true, tiers: true, active: true } },
    _count: { select: { pickups: true } },
  },
  orderBy: { date: 'desc' },
});
const valetIds = [...new Set(daPagare.map((d) => d.valetId).filter(Boolean))];
const righeV = await db.valetService.findMany({
  where: { valetId: { in: valetIds } },
  include: { serviceType: { select: { name: true, pricingModel: true, minHours: true } } },
});
const perId = new Map(righeV.map((r) => [r.id, r]));
const perValet = new Map();
for (const r of righeV) { const a = perValet.get(r.valetId) ?? []; a.push(r); perValet.set(r.valetId, a); }

const nonPagabili = daPagare.filter((d) =>
  !pagaConsegna(d, scegliListinoValet(d, perId, perValet), d.deliveryRule || null,
                d.valetDeliveryRule || null, d._count?.pickups || 0)
  && !(d.deliveryRule && d.deliveryRule.toPay === false));

console.log('');
linea('═');
console.log('  ULTIMA CONSEGNA NON PAGABILE');
linea('═');
const fuoriP = nonPagabili.filter((d) => !plausibile(d.date));
const veriP = nonPagabili.filter((d) => plausibile(d.date));
const up = veriP[0];
if (up) {
  const suoi = perValet.get(up.valetId || '') || [];
  console.log('   #' + up.code + '   ' + g(up.date) + '   ' + ((up.valet?.lastName || '') + ' ' + (up.valet?.firstName || '')).trim());
  console.log('   stato       ' + up.status);
  console.log('   servizio    ' + (up.serviceType?.name || '—') + '  (' + up.serviceType?.pricingModel + ')');
  console.log('   suoi listini ' + (suoi.length ? suoi.map((x) => x.serviceType?.name + '=' + x.salary).join(' · ') : 'NESSUNO'));
  console.log('   giorni fa   ' + Math.round((OGGI - up.date) / 86400000));
}
console.log('   totale non pagabili: ' + veriP.length.toLocaleString('it-IT'));
if (fuoriP.length) {
  console.log('   ⚠️ scartate ' + fuoriP.length + ' con data impossibile: ' +
    fuoriP.slice(0, 5).map((d) => '#' + d.code + ' ' + g(d.date)).join(' · '));
}
linea('═');
await db.$disconnect();
