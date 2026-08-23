// Conta quanti record ha finora lo schema `platform`, divisi fra quelli arrivati
// dal legacy (hanno `legacyId`) e quelli nati qui (seed).
//
// Serve a vedere se un import lungo sta avanzando davvero, invece di aspettare
// al buio che finisca.
//
// Uso:  node C:/Users/nicol/app/deluxy-platform-next/scripts/conta-importati.mjs

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
const MODELLI = ['province', 'city', 'partner', 'valet', 'operation', 'customer', 'user'];

console.log('modello        totale   dal legacy   dal seed');
console.log('-'.repeat(48));
try {
  for (const m of MODELLI) {
    const totale = await db[m].count();
    const legacy = await db[m].count({ where: { legacyId: { not: null } } });
    console.log(`${m.padEnd(14)} ${String(totale).padStart(6)} ${String(legacy).padStart(12)} ${String(totale - legacy).padStart(10)}`);
  }
  const perRuolo = await db.user.groupBy({ by: ['role'], _count: true });
  console.log('\nutenti per ruolo:');
  for (const r of perRuolo.sort((a, b) => b._count - a._count))
    console.log(`  ${String(r.role).padEnd(18)} ${String(r._count).padStart(6)}`);
} finally {
  await db.$disconnect();
}
