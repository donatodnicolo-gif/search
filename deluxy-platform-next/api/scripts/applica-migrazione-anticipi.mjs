/**
 * Applica la migrazione 20260909_recupero_anticipi_valet.sql: le due colonne che
 * servono a recuperare gli anticipi dei valet sugli stipendi.
 *
 *   node api/scripts/applica-migrazione-anticipi.mjs            (guarda e basta)
 *   node api/scripts/applica-migrazione-anticipi.mjs --applica   (aggiunge le colonne)
 *
 * ⚠️ Le colonne si aggiungono PRIMA di pubblicare il codice che le legge:
 * aggiungere una colonna è retrocompatibile (il codice già in produzione non la
 * vede nemmeno), pubblicare prima no — ogni query su Payment darebbe P2022.
 *
 * ⚠️ Postgres CONDIVISO da 14 app: `ADD COLUMN` con default costante non riscrive
 * la tabella (da PG 11), quindi non prende un lock lungo. Le tabelle sono sempre
 * qualificate con `platform.`: il search_path del ruolo ha un altro schema
 * davanti, e una DDL senza qualifica finirebbe nel posto sbagliato senza dare
 * errore.
 *
 * Ripetibile: `IF NOT EXISTS` su entrambe, quindi rilanciarlo non fa danno.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';

const APPLICA = process.argv.includes('--applica');
const require = createRequire('C:/Users/nicol/app/.claude/worktrees/deploy-delivery/deluxy-platform-next/api/package.json');
const { PrismaClient } = require('@prisma/client');

const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
u.searchParams.set('schema', 'platform');
u.searchParams.set('connection_limit', '1');
const db = new PrismaClient({ datasources: { db: { url: u.toString() } } });

const guarda = async () => db.$queryRaw`
  SELECT column_name, data_type, column_default, is_nullable
  FROM information_schema.columns
  WHERE table_schema = 'platform' AND table_name = 'Payment'
    AND column_name IN ('recuperatoImporto', 'recuperatoSuSalaryId')
  ORDER BY column_name`;

const prima = await guarda();
console.log(`Colonne presenti PRIMA: ${prima.length} su 2`);
for (const c of prima) console.log(`   ${c.column_name} · ${c.data_type} · default ${c.column_default ?? '—'} · null ${c.is_nullable}`);

if (prima.length === 2) {
  console.log('\nCi sono già tutte e due: niente da fare.');
  await db.$disconnect();
  process.exit(0);
}
if (!APPLICA) {
  console.log('\nANTEPRIMA — niente scritto. Rilancia con --applica per aggiungerle.');
  await db.$disconnect();
  process.exit(0);
}

await db.$executeRawUnsafe(
  'ALTER TABLE platform."Payment" ADD COLUMN IF NOT EXISTS "recuperatoImporto" DOUBLE PRECISION NOT NULL DEFAULT 0',
);
await db.$executeRawUnsafe(
  'ALTER TABLE platform."Payment" ADD COLUMN IF NOT EXISTS "recuperatoSuSalaryId" TEXT',
);

const dopo = await guarda();
console.log(`\nColonne presenti DOPO: ${dopo.length} su 2`);
for (const c of dopo) console.log(`   ${c.column_name} · ${c.data_type} · default ${c.column_default ?? '—'} · null ${c.is_nullable}`);
console.log(dopo.length === 2 ? '\n✓ Migrazione applicata: ora si può pubblicare.' : '\n⚠️ Qualcosa non ha attecchito: NON pubblicare e riguarda.');
await db.$disconnect();
