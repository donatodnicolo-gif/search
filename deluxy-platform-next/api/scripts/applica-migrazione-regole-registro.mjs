/**
 * REGISTRO DELLE REGOLE CARNET (06/09/2026, regola utente «crea registro»):
 * la tabella platform."DeliveryRuleLog". Solo CREATE TABLE / INDEX IF NOT EXISTS:
 * non tocca colonne né righe esistenti. Idempotente.
 * Uso: node scripts/applica-migrazione-regole-registro.mjs
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8').split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
u.searchParams.set('schema', 'platform');
process.env.DATABASE_URL = u.toString();
const prisma = new PrismaClient();
await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS platform."DeliveryRuleLog" (
  "id" TEXT PRIMARY KEY,
  "deliveryRuleId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "userId" TEXT,
  "userEmail" TEXT,
  "message" TEXT NOT NULL,
  "before" TEXT,
  "after" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);
await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "DeliveryRuleLog_deliveryRuleId_createdAt_idx" ON platform."DeliveryRuleLog" ("deliveryRuleId", "createdAt")`);
const n = await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM platform."DeliveryRuleLog"`);
console.log('✓ tabella platform."DeliveryRuleLog" pronta · righe:', n[0].n);
await prisma.$disconnect();
