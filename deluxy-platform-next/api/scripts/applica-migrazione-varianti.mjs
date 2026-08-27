/**
 * Applica la migrazione delle ECCEZIONI PER GIORNO dei servizi ricorrenti.
 *
 * ⚠️ Solo CREATE TABLE / CREATE INDEX / ADD CONSTRAINT, tutti idempotenti: non
 * tocca nessun dato esistente. Si esegue a mano perche' `prisma migrate deploy`
 * su un cluster condiviso da 14 app non e' una cosa da lanciare alla cieca.
 *
 * ⚠️ Le istruzioni stanno QUI, una per elemento, e non si ricavano spezzando il
 * file .sql sui punto e virgola: dentro i commenti ci sono apostrofi e dentro i
 * blocchi DO ci sono altri punto e virgola, e lo spezzettamento sbagliava.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

const riga = fs
  .readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/)
  .find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
const db = new PrismaClient({
  datasources: {
    db: {
      url: `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform&connection_limit=1`,
    },
  },
});

const ISTRUZIONI = [
  `CREATE TABLE IF NOT EXISTS platform."RecurringServiceVariant" (
     "id"                 TEXT NOT NULL,
     "recurringServiceId" TEXT NOT NULL,
     "giorni"             TEXT NOT NULL,
     "timeFrom"           TEXT NOT NULL,
     "timeTo"             TEXT NOT NULL,
     "valetId"            TEXT,
     "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedAt"          TIMESTAMP(3) NOT NULL,
     CONSTRAINT "RecurringServiceVariant_pkey" PRIMARY KEY ("id")
   )`,
  `CREATE INDEX IF NOT EXISTS "RecurringServiceVariant_recurringServiceId_idx"
     ON platform."RecurringServiceVariant"("recurringServiceId")`,
  `DO $$ BEGIN
     ALTER TABLE platform."RecurringServiceVariant"
       ADD CONSTRAINT "RecurringServiceVariant_recurringServiceId_fkey"
       FOREIGN KEY ("recurringServiceId") REFERENCES platform."RecurringService"("id")
       ON DELETE CASCADE ON UPDATE CASCADE;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE platform."RecurringServiceVariant"
       ADD CONSTRAINT "RecurringServiceVariant_valetId_fkey"
       FOREIGN KEY ("valetId") REFERENCES platform."Valet"("id")
       ON DELETE SET NULL ON UPDATE CASCADE;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
];

for (const p of ISTRUZIONI) {
  await db.$executeRawUnsafe(p);
  console.log(`✔ ${p.replace(/\s+/g, ' ').slice(0, 78)}…`);
}

const colonne = await db.$queryRawUnsafe(
  `select column_name, data_type, is_nullable from information_schema.columns
    where table_schema='platform' and table_name='RecurringServiceVariant'
    order by ordinal_position`,
);
console.log('\ncolonne di RecurringServiceVariant:');
for (const c of colonne) {
  console.log(`  ${c.column_name.padEnd(20)} ${c.data_type.padEnd(28)} ${c.is_nullable === 'YES' ? 'può essere vuota' : 'obbligatoria'}`);
}
const vincoli = await db.$queryRawUnsafe(
  `select conname from pg_constraint
    where conrelid = 'platform."RecurringServiceVariant"'::regclass order by conname`,
);
console.log('vincoli:', vincoli.map((v) => v.conname).join(', '));
await db.$disconnect();
