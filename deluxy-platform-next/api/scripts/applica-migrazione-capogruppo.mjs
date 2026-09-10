/**
 * CAPOGRUPPO IN PIATTAFORMA (10/09/2026, regola utente): la società che paga per uno o più
 * punti vendita. Tabella platform."Capogruppo" + due colonne su platform."Partner".
 *
 *   node api/scripts/applica-migrazione-capogruppo.mjs            (anteprima)
 *   node api/scripts/applica-migrazione-capogruppo.mjs --applica
 *
 * Solo CREATE TABLE / ADD COLUMN IF NOT EXISTS: additiva, ripetibile, le altre app non se ne
 * accorgono. Va PRIMA del deploy del codice che la legge.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const APPLICA = process.argv.includes('--applica');
const RADICE = 'C:/Users/nicol/app/.claude/worktrees/deploy-delivery/deluxy-platform-next/';
const require = createRequire(RADICE + 'api/package.json');
const { PrismaClient } = require('@prisma/client');
const rigaEnv = fs.readFileSync(RADICE + 'api/.env', 'utf8').split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(rigaEnv.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, '')); u.searchParams.set('schema', 'platform'); u.searchParams.set('connection_limit', '1');
const db = new PrismaClient({ datasources: { db: { url: u.toString() } } });
const SQL = [
  `CREATE TABLE IF NOT EXISTS platform."Capogruppo" (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    "pIva" TEXT,
    "codiceFiscale" TEXT,
    "codiceSdi" TEXT,
    pec TEXT,
    email TEXT,
    note TEXT,
    "registroId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  'CREATE UNIQUE INDEX IF NOT EXISTS "Capogruppo_nome_key" ON platform."Capogruppo" (nome)',
  'CREATE UNIQUE INDEX IF NOT EXISTS "Capogruppo_registroId_key" ON platform."Capogruppo" ("registroId")',
  'ALTER TABLE platform."Partner" ADD COLUMN IF NOT EXISTS "capogruppoId" TEXT',
  'ALTER TABLE platform."Partner" ADD COLUMN IF NOT EXISTS "pagaDaSe" BOOLEAN NOT NULL DEFAULT true',
  'CREATE INDEX IF NOT EXISTS "Partner_capogruppoId_idx" ON platform."Partner" ("capogruppoId")',
];
const prima = await db.$queryRawUnsafe(`SELECT to_regclass('platform."Capogruppo"')::text AS t`);
const col = await db.$queryRawUnsafe(`SELECT column_name FROM information_schema.columns WHERE table_schema='platform' AND table_name='Partner' AND column_name IN ('capogruppoId','pagaDaSe')`);
console.log('tabella Capogruppo:', prima[0]?.t ? 'esiste' : 'manca', '· colonne Partner presenti:', col.map((c) => c.column_name).join(', ') || 'nessuna');
if (!APPLICA) { console.log('ANTEPRIMA: nessuna scrittura.'); await db.$disconnect(); process.exit(0); }
for (const s of SQL) { await db.$executeRawUnsafe(s); console.log('OK', s.replace(/\s+/g, ' ').slice(0, 80)); }
const dopo = await db.$queryRawUnsafe(`SELECT column_name FROM information_schema.columns WHERE table_schema='platform' AND table_name='Partner' AND column_name IN ('capogruppoId','pagaDaSe')`);
console.log('VERIFICA colonne Partner:', dopo.map((c) => c.column_name).join(', '), '· tabella:', (await db.$queryRawUnsafe(`SELECT to_regclass('platform."Capogruppo"')::text AS t`))[0]?.t);
await db.$disconnect();
