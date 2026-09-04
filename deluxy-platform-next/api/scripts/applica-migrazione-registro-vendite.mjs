/**
 * REGISTRO DELLE VENDITE (04/09/2026, regola utente): tabella platform."SaleLog".
 * ⚠️ Solo CREATE TABLE / INDEX IF NOT EXISTS: non tocca nessun dato. Idempotente.
 * Uso: node scripts/applica-migrazione-registro-vendite.mjs
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
  `CREATE TABLE IF NOT EXISTS platform."SaleLog" (
     "id" TEXT PRIMARY KEY,
     "saleId" TEXT NOT NULL REFERENCES platform."Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE,
     "type" TEXT NOT NULL,
     "message" TEXT NOT NULL,
     "userId" TEXT,
     "userEmail" TEXT,
     "userRole" TEXT,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
   )`,
  `CREATE INDEX IF NOT EXISTS "SaleLog_saleId_createdAt_idx" ON platform."SaleLog"("saleId", "createdAt")`,
  // Data storico: quando la vendita è passata in storico; sul pregresso vale l'ultimo aggiornamento (updatedAt).
  `ALTER TABLE platform."Sale" ADD COLUMN IF NOT EXISTS "historyAt" TIMESTAMP(3)`,
  `UPDATE platform."Sale" SET "historyAt" = "updatedAt" WHERE "historyAt" IS NULL AND status IN ('accettata', 'non_accettata', 'annullata')`,
];
for (const s of SQL) { await prisma.$executeRawUnsafe(s); console.log('✓', s.split('\n')[0].trim().slice(0, 70)); }
const [n] = await prisma.$queryRawUnsafe(`SELECT count(*) AS n FROM platform."SaleLog"`);
console.log(`righe nel registro: ${n.n}`);
await prisma.$disconnect();
