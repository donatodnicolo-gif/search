/**
 * COSTI RIMBORSATI (05/09/2026, regola utente): colonna `Delivery.refundedCosts`.
 * ⚠️ Solo ADD COLUMN IF NOT EXISTS: non tocca nessun dato. Idempotente.
 * Uso: node scripts/applica-migrazione-costi-rimborsati.mjs
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
await prisma.$executeRawUnsafe(`ALTER TABLE platform."Delivery" ADD COLUMN IF NOT EXISTS "refundedCosts" DOUBLE PRECISION`);
console.log('✓ colonna refundedCosts');
const [{ n }] = await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM platform."Delivery" WHERE "refundedCosts" IS NOT NULL`);
console.log(`consegne con costi rimborsati: ${n}`);
await prisma.$disconnect();
