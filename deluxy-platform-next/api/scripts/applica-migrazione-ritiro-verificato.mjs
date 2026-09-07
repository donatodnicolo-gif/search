/**
 * RITIRO VERIFICATO COL CODICE DEL VALET (05/09/2026, regola utente): due
 * colonne su Delivery — quando il partner ha verificato il codice del valet al
 * ritiro, e chi. ⚠️ Solo ADD COLUMN IF NOT EXISTS. Idempotente.
 * Uso: node scripts/applica-migrazione-ritiro-verificato.mjs
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
await prisma.$executeRawUnsafe(`ALTER TABLE platform."Delivery" ADD COLUMN IF NOT EXISTS "pickupVerifiedAt" TIMESTAMP(3)`);
await prisma.$executeRawUnsafe(`ALTER TABLE platform."Delivery" ADD COLUMN IF NOT EXISTS "pickupVerifiedBy" TEXT`);
console.log('✓ colonne Delivery.pickupVerifiedAt / pickupVerifiedBy');
await prisma.$disconnect();
