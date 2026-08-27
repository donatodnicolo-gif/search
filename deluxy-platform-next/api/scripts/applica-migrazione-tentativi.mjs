/** Applica la tabella dei tentativi di accesso. Solo CREATE idempotenti. */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8').split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
const db = new PrismaClient({ datasources: { db: { url: `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform&connection_limit=1` } } });
for (const p of [
  `CREATE TABLE IF NOT EXISTS platform."TentativoAccesso" ("id" TEXT NOT NULL, "chiave" TEXT NOT NULL, "ip" TEXT, "quando" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "TentativoAccesso_pkey" PRIMARY KEY ("id"))`,
  `CREATE INDEX IF NOT EXISTS "TentativoAccesso_chiave_quando_idx" ON platform."TentativoAccesso"("chiave", "quando")`,
]) { await db.$executeRawUnsafe(p); console.log(`✔ ${p.slice(0, 74)}…`); }
const c = await db.$queryRawUnsafe(`select column_name from information_schema.columns where table_schema='platform' and table_name='TentativoAccesso' order by ordinal_position`);
console.log('colonne:', c.map((x) => x.column_name).join(', '));
await db.$disconnect();
