/**
 * RICONCILIAZIONI PRODOTTO ↔ PARTNER (04/09/2026, regola utente): tabella
 * platform."ProductReconciliation".
 * ⚠️ Solo CREATE TABLE / INDEX IF NOT EXISTS: non tocca nessun dato. Idempotente.
 * Uso: node scripts/applica-migrazione-riconciliazioni.mjs
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
  `CREATE TABLE IF NOT EXISTS platform."ProductReconciliation" (
     "id" TEXT PRIMARY KEY,
     "productId" TEXT NOT NULL REFERENCES platform."Product"("id") ON DELETE CASCADE ON UPDATE CASCADE,
     "from" TIMESTAMP(3) NOT NULL,
     "to" TIMESTAMP(3) NOT NULL,
     "salesCount" INTEGER NOT NULL,
     "stats" TEXT NOT NULL,
     "recommend" BOOLEAN NOT NULL,
     "partnerId" TEXT,
     "price" DOUBLE PRECISION,
     "reason" TEXT NOT NULL,
     "confidence" TEXT NOT NULL,
     "model" TEXT NOT NULL,
     "previousPartnerId" TEXT,
     "previousType" TEXT NOT NULL,
     "previousPrice" DOUBLE PRECISION NOT NULL,
     "status" TEXT NOT NULL DEFAULT 'proposta',
     "trigger" TEXT NOT NULL,
     "decidedAt" TIMESTAMP(3),
     "decidedBy" TEXT,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
   )`,
  `CREATE INDEX IF NOT EXISTS "ProductReconciliation_productId_createdAt_idx" ON platform."ProductReconciliation"("productId", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "ProductReconciliation_status_createdAt_idx" ON platform."ProductReconciliation"("status", "createdAt")`,
];
for (const s of SQL) { await prisma.$executeRawUnsafe(s); console.log('✓', s.split('\n')[0].trim().slice(0, 80)); }
const [n] = await prisma.$queryRawUnsafe(`SELECT count(*) AS n FROM platform."ProductReconciliation"`);
console.log(`righe: ${n.n}`);
await prisma.$disconnect();
