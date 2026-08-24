/**
 * Prova la logica di PAGA VALET per tipo di servizio sulle consegne da pagare.
 *
 * Compila al volo `pagaConsegna()` dal modulo vero (`src/salaries/`): provare
 * una copia proverebbe la copia.
 *
 * Sola lettura.
 */
import fs from 'node:fs';
import ts from 'typescript';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

const src = fs.readFileSync('C:/Users/nicol/app/deluxy-platform-next/api/src/salaries/salaries.module.ts', 'utf8');
const js = ts.transpileModule(
  src.slice(src.indexOf('export type ConsegnaDaPagare'), src.indexOf('@Injectable()')),
  { compilerOptions: { target: 'ES2022', module: 'ESNext' } }).outputText;
fs.writeFileSync('C:/Users/nicol/app/deluxy-platform-next/scripts/_paga.mjs', js);
const { pagaConsegna } = await import('./_paga.mjs');

const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
const db = new PrismaClient({ datasources: { db: { url:
  `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform&connection_limit=1` } } });

const where = {
  NOT: { valetId: null }, valet: { placeholder: false }, payable: true,
  status: { in: ['delivered', 'delivered_time_approved'] },
  paymentStatus: { not: 'paid' }, salaryLines: { none: {} },
};
const dd = await db.delivery.findMany({ where, select: {
  id: true, valetId: true, valetServiceId: true, valetSalary: true, valetAdditionalPrice: true,
  hours: true, extraKm: true, paymentOnDelivery: true, paymentAmount: true,
  serviceType: { select: { pricingModel: true, minHours: true } },
  deliveryRule: { select: { valetPayAdjustment: true, toPay: true } },
  valetDeliveryRule: { select: { tiers: true, active: true } },
  _count: { select: { pickups: true } } } });

const ids = [...new Set(dd.map((d) => d.valetServiceId).filter(Boolean))];
const listini = new Map((await db.valetService.findMany({
  where: { id: { in: ids } },
  include: { serviceType: { select: { pricingModel: true, minHours: true } } },
})).map((r) => [r.id, r]));

let tot = 0, contanti = 0, senza = 0, daListino = 0, daConsegna = 0;
const perModello = {};
for (const d of dd) {
  const l = listini.get(d.valetServiceId ?? '') ?? null;
  const m = l?.serviceType?.pricingModel ?? d.serviceType?.pricingModel ?? '—';
  perModello[m] ??= { n: 0, eur: 0, senza: 0, recuperate: 0, recuperateEur: 0 };
  perModello[m].n++;
  const c = pagaConsegna(d, l, d.deliveryRule ?? null, d.valetDeliveryRule ?? null, d._count?.pickups ?? 0);
  if (!c) { perModello[m].senza++; senza++; continue; }
  perModello[m].eur += c.amount; tot += c.amount;
  if (d.paymentOnDelivery) contanti += d.paymentAmount ?? 0;
  if (c.origine === 'listino') { daListino++; perModello[m].recuperate++; perModello[m].recuperateEur += c.amount; }
  else daConsegna++;
}
console.log('PAGHE VALET PER TIPO DI SERVIZIO — consegne da pagare\n');
console.log('  modello'.padEnd(16) + 'n'.padStart(8) + '  pagabili'.padStart(11) + '  dal listino'.padStart(13) + '   recuperati'.padStart(14) + '        lordo');
for (const [m, x] of Object.entries(perModello).sort((a, b) => b[1].eur - a[1].eur))
  console.log('  ' + m.padEnd(14) + String(x.n).padStart(8) + String(x.n - x.senza).padStart(11) +
    String(x.recuperate).padStart(13) + x.recuperateEur.toLocaleString('it-IT', { maximumFractionDigits: 0 }).padStart(14) +
    x.eur.toLocaleString('it-IT', { minimumFractionDigits: 2 }).padStart(15) + ' EUR');
console.log('');
console.log('  consegne considerate:', dd.length.toLocaleString('it-IT'));
console.log('  lordo da pagare:  ', tot.toLocaleString('it-IT', { minimumFractionDigits: 2 }), 'EUR');
console.log('  contanti da scalare:', contanti.toLocaleString('it-IT', { minimumFractionDigits: 2 }), 'EUR');
console.log('  NETTO:            ', (tot - contanti).toLocaleString('it-IT', { minimumFractionDigits: 2 }), 'EUR');
console.log('  pagate dal listino:', daListino.toLocaleString('it-IT'), '· dalla consegna:', daConsegna.toLocaleString('it-IT'));
console.log('  ⚠️ NON pagabili (niente paga, niente listino):', senza.toLocaleString('it-IT'));
await db.$disconnect();
