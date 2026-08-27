/**
 * Applica la migrazione del RESET PASSWORD.
 * ⚠️ Solo ADD COLUMN IF NOT EXISTS e un indice: non tocca nessun dato.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8').split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
const db = new PrismaClient({ datasources: { db: { url: `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform&connection_limit=1` } } });

const ISTRUZIONI = [
  `ALTER TABLE platform."User" ADD COLUMN IF NOT EXISTS "resetTokenHash" TEXT`,
  `ALTER TABLE platform."User" ADD COLUMN IF NOT EXISTS "resetTokenExpiresAt" TIMESTAMP(3)`,
  `ALTER TABLE platform."User" ADD COLUMN IF NOT EXISTS "resetRequestedAt" TIMESTAMP(3)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "User_resetTokenHash_key" ON platform."User"("resetTokenHash")`,
];
for (const p of ISTRUZIONI) { await db.$executeRawUnsafe(p); console.log(`✔ ${p.slice(0, 76)}…`); }

const c = await db.$queryRawUnsafe(
  `select column_name from information_schema.columns
    where table_schema='platform' and table_name='User' and column_name like 'reset%' order by 1`);
console.log('\ncolonne nuove:', c.map((x) => x.column_name).join(', '));
await db.$disconnect();
