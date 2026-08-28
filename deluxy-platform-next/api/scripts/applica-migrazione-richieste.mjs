/** Tabella delle RICHIESTE di consegna. Solo CREATE/ADD idempotenti. */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8').split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
const db = new PrismaClient({ datasources: { db: { url: `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform&connection_limit=1` } } });
for (const p of [
  `CREATE TABLE IF NOT EXISTS platform."RichiestaConsegna" ("id" TEXT NOT NULL, "testo" TEXT NOT NULL, "origine" TEXT NOT NULL, "riferimento" TEXT, "contatto" TEXT, "stato" TEXT NOT NULL DEFAULT 'nuova', "deliveryId" TEXT, "note" TEXT, "decisaDa" TEXT, "decisaIl" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "RichiestaConsegna_pkey" PRIMARY KEY ("id"))`,
  `CREATE INDEX IF NOT EXISTS "RichiestaConsegna_stato_createdAt_idx" ON platform."RichiestaConsegna"("stato", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "RichiestaConsegna_origine_riferimento_idx" ON platform."RichiestaConsegna"("origine", "riferimento")`,
  `DO $$ BEGIN ALTER TABLE platform."RichiestaConsegna" ADD CONSTRAINT "RichiestaConsegna_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES platform."Delivery"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
]) { await db.$executeRawUnsafe(p); console.log(`✔ ${p.slice(0, 70)}…`); }
const c = await db.$queryRawUnsafe(`select column_name from information_schema.columns where table_schema='platform' and table_name='RichiestaConsegna' order by ordinal_position`);
console.log('colonne:', c.map((x) => x.column_name).join(', '));
await db.$disconnect();
