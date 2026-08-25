// Quante consegne "a buon fine" entrano nei Corrispettivi, divise per
// pricingModel del SERVIZIO DEL PARTNER (Delivery.serviceType).
//
// Non scrive niente: serve solo a misurare l'effetto del filtro "solo VENDITA".
//
// Uso: node scripts/conta-corrispettivi-per-servizio.mjs

import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
process.env.DATABASE_URL =
  `postgresql://${u.username}:${u.password}@${u.hostname}:6543/postgres?schema=platform&pgbouncer=true&connection_limit=1`;

const db = new PrismaClient();
const STATI = ['delivered', 'approved'];

try {
  const servizi = await db.serviceType.findMany({
    select: { id: true, name: true, code: true, pricingModel: true, scope: true },
  });
  const perId = new Map(servizi.map((s) => [s.id, s]));

  console.log('=== catalogo servizi (pricingModel) ===');
  const perModello = {};
  for (const s of servizi) (perModello[s.pricingModel] ??= []).push(s.name);
  for (const [m, nomi] of Object.entries(perModello)) console.log(`${m.padEnd(16)} ${nomi.length} servizi`);

  const gruppi = await db.delivery.groupBy({
    by: ['serviceTypeId'],
    where: { deletedAt: null, status: { in: STATI } },
    _count: { _all: true },
  });
  const tot = {};
  let totale = 0;
  for (const g of gruppi) {
    const s = perId.get(g.serviceTypeId);
    const m = s?.pricingModel ?? '(servizio sconosciuto)';
    tot[m] = (tot[m] ?? 0) + g._count._all;
    totale += g._count._all;
  }
  console.log('\n=== consegne a buon fine (delivered|approved), per pricingModel ===');
  for (const [m, n] of Object.entries(tot).sort((a, b) => b[1] - a[1])) {
    console.log(`${m.padEnd(20)} ${String(n).padStart(7)}   ${((n / totale) * 100).toFixed(1)}%`);
  }
  console.log(`${'TOTALE'.padEnd(20)} ${String(totale).padStart(7)}`);

  console.log('\n=== dettaglio per servizio (prime 25) ===');
  const righe = gruppi
    .map((g) => ({ ...perId.get(g.serviceTypeId), n: g._count._all }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 25);
  for (const r of righe) {
    console.log(`${String(r.n).padStart(7)}  ${(r.pricingModel ?? '?').padEnd(16)} ${r.name ?? '(sconosciuto)'}`);
  }
} finally {
  await db.$disconnect();
}
