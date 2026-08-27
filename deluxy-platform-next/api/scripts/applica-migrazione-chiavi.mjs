/** Scadenza, note e autore sulle chiavi app. Solo ADD COLUMN idempotenti. */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8').split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
const db = new PrismaClient({ datasources: { db: { url: `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform&connection_limit=1` } } });
for (const p of [
  `ALTER TABLE platform."AppApiKey" ADD COLUMN IF NOT EXISTS "note" TEXT`,
  `ALTER TABLE platform."AppApiKey" ADD COLUMN IF NOT EXISTS "scadeIl" TIMESTAMP(3)`,
  `ALTER TABLE platform."AppApiKey" ADD COLUMN IF NOT EXISTS "creataDa" TEXT`,
]) { await db.$executeRawUnsafe(p); console.log(`✔ ${p.slice(0, 72)}…`); }
const c = await db.$queryRawUnsafe(`select column_name from information_schema.columns where table_schema='platform' and table_name='AppApiKey' order by ordinal_position`);
console.log('colonne:', c.map((x) => x.column_name).join(', '));
const chiavi = await db.appApiKey.findMany({ select: { nome: true, scrittura: true, attiva: true, ultimoUso: true } });
console.log('\nchiavi già esistenti:');
for (const k of chiavi) console.log(`  ${k.nome.padEnd(28)} ${k.scrittura ? 'lettura+scrittura' : 'sola lettura   '} ${k.attiva ? 'attiva' : 'spenta'} · ultimo uso ${k.ultimoUso ? k.ultimoUso.toISOString().slice(0,16) : 'mai'}`);
await db.$disconnect();
