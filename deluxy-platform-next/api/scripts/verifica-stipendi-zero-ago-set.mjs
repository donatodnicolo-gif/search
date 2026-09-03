/**
 * SOLA LETTURA (03/09, richiesta utente): stipendi a ZERO in agosto/settembre
 * 2026 — sia nelle RIGHE degli stipendi già fatti, sia nel DA PAGARE
 * (paga calcolata = 0), separando gli zeri VOLUTI (regola «non pagare»)
 * dagli zeri ANOMALI (nessun listino applicabile o listino a 0).
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
u.searchParams.set('schema', 'platform');
process.env.DATABASE_URL = u.toString();
const prisma = new PrismaClient();
for (let t = 1; t <= 5; t++) {
  try { await prisma.$queryRaw`SELECT 1`; break; }
  catch (e) { if (t === 5) { console.error('DB irraggiungibile'); process.exit(1); } await new Promise((r) => setTimeout(r, 4000)); }
}
const DA = new Date('2026-08-01'), A = new Date('2026-10-01');
const r2 = (n) => Math.round(n * 100) / 100;

// ---- A) righe stipendio a 0 negli stipendi gia' fatti ----
const righeZero = await prisma.salaryLine.findMany({
  where: { amount: 0, date: { gte: DA, lt: A } },
  select: { date: true, origin: true, delivery: { select: { code: true } },
    salary: { select: { status: true, archived: true, valet: { select: { firstName: true, lastName: true } } } } },
  orderBy: { date: 'asc' },
});
console.log('A) righe STIPENDIO a 0 € (ago-set):', righeZero.length);
for (const r of righeZero) console.log('   ', r.date.toISOString().slice(0, 10), '·', r.salary.valet.lastName, r.salary.valet.firstName, '· #' + (r.delivery?.code ?? '—'), '·', r.origin, '· stipendio', r.salary.status);

// ---- B) DA PAGARE con paga calcolata 0 ----
const cons = await prisma.delivery.findMany({
  where: { deletedAt: null, payable: true, valetId: { not: null },
    valet: { placeholder: false, deleted: false },
    status: { in: ['delivered', 'approved'] }, paymentStatus: { not: 'paid' },
    salaryLines: { none: {} }, date: { gte: DA, lt: A } },
  select: { code: true, date: true, valetSalary: true, valetAdditionalPrice: true, hours: true,
    distanceKm: true, extraKm: true, extraOutOfCity: true, valetId: true,
    valet: { select: { firstName: true, lastName: true, minimumKmIncluded: true, extraOutOfCityPrice: true } },
    serviceType: { select: { name: true, pricingModel: true, minHours: true } },
    partner: { select: { insegna: true } },
    deliveryRule: { select: { name: true, toPay: true, valetPayAdjustment: true } } },
  orderBy: { date: 'asc' },
});
const listini = await prisma.valetService.findMany({
  where: { valetId: { in: [...new Set(cons.map((c) => c.valetId))] } },
  include: { serviceType: { select: { pricingModel: true, minHours: true } } },
  orderBy: [{ validFrom: 'desc' }],
});
const perValet = new Map();
for (const l of listini) { const a = perValet.get(l.valetId) ?? []; a.push(l); perValet.set(l.valetId, a); }

let daRegola = 0; const perRegola = new Map(); const anomale = [];
for (const c of cons) {
  if (c.deliveryRule?.toPay === false) {
    daRegola++;
    const k = c.deliveryRule.name;
    perRegola.set(k, (perRegola.get(k) ?? 0) + 1);
    continue;
  }
  const extra = c.valetAdditionalPrice ?? 0;
  if ((c.valetSalary ?? 0) > 0) { if (r2(c.valetSalary + extra) <= 0) anomale.push([c, 'scritta+extra <= 0']); continue; }
  const suoi = perValet.get(c.valetId) ?? [];
  const tipo = c.serviceType?.pricingModel === 'A_ORA' ? 'A_ORA' : 'PREZZO_FISSO';
  const l = suoi.find((x) => x.serviceType?.pricingModel === tipo && (x.salary ?? 0) > 0)
    ?? suoi.find((x) => x.serviceType?.pricingModel === tipo)
    ?? (suoi.length === 1 ? suoi[0] : null);
  if (!l) { anomale.push([c, 'NESSUN listino applicabile']); continue; }
  let paga;
  if ((l.serviceType?.pricingModel ?? tipo) === 'A_ORA') {
    paga = (l.salary ?? 0) * Math.max(c.hours ?? 0, l.serviceType?.minHours ?? 1) + extra;
  } else if (c.extraOutOfCity && (c.distanceKm ?? 0) > 0 && (c.valet?.extraOutOfCityPrice ?? 0) > 0) {
    paga = Math.max((c.distanceKm ?? 0) * (c.valet?.extraOutOfCityPrice ?? 0), l.salary ?? 0) + extra;
  } else {
    paga = (l.salary ?? 0) + extra;
  }
  if (r2(paga) <= 0) anomale.push([c, 'listino a 0 (' + (l.salary ?? 0) + ')' + (extra ? ' + extra ' + extra : '')]);
}
console.log('\nB) DA PAGARE ago-set con paga 0:');
console.log('   · da REGOLA «non pagare» (voluti):', daRegola);
for (const [k, n] of perRegola) console.log('     -', k + ':', n);
console.log('   · ANOMALI (0 senza una regola che lo dica):', anomale.length);
for (const [c, perche] of anomale) {
  console.log('     ⚠️ #' + c.code, c.date.toISOString().slice(0, 10), '·', c.valet.lastName, '·', (c.partner?.insegna ?? '—'), '·', (c.serviceType?.name ?? '—'), '→', perche);
}
await prisma.$disconnect();
