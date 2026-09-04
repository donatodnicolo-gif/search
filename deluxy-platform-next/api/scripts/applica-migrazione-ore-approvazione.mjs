/**
 * ORE DA APPROVARE SUI SERVIZI A ORA (04/09/2026, regola utente).
 * ⚠️ Solo ALTER ... ADD COLUMN IF NOT EXISTS: non tocca nessun dato. Idempotente.
 * Uso: node scripts/applica-migrazione-ore-approvazione.mjs
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
const SQL = [
  `ALTER TABLE platform."Delivery" ADD COLUMN IF NOT EXISTS "hoursFrom" TEXT`,
  `ALTER TABLE platform."Delivery" ADD COLUMN IF NOT EXISTS "hoursTo" TEXT`,
  `ALTER TABLE platform."Delivery" ADD COLUMN IF NOT EXISTS "hoursProposedAt" TIMESTAMP(3)`,
  `ALTER TABLE platform."Delivery" ADD COLUMN IF NOT EXISTS "hoursOriginal" DOUBLE PRECISION`,
  `ALTER TABLE platform."Delivery" ADD COLUMN IF NOT EXISTS "hoursDecision" TEXT`,
  `ALTER TABLE platform."Delivery" ADD COLUMN IF NOT EXISTS "hoursDecidedAt" TIMESTAMP(3)`,
  `ALTER TABLE platform."Delivery" ADD COLUMN IF NOT EXISTS "hoursDecidedBy" TEXT`,
];
for (const s of SQL) { await prisma.$executeRawUnsafe(s); console.log('✓', s.slice(0, 92)); }
const [{ n }] = await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM platform."Delivery" WHERE status = 'delivered_time_to_approve'`);
console.log(`consegne in attesa di approvazione: ${n}`);
await prisma.$disconnect();
