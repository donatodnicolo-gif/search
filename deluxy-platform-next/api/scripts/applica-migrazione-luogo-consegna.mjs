/**
 * IL LUOGO DELLA CONSEGNA (11/09/2026, regola utente: «metti anche un campo che si riempie automaticamente
 * dove si vede il luogo che è stato ricercato — in questo caso era un hotel»).
 *
 *   node api/scripts/applica-migrazione-luogo-consegna.mjs            (anteprima)
 *   node api/scripts/applica-migrazione-luogo-consegna.mjs --applica
 *
 * Una colonna sola, additiva: `platform."Delivery"."recipientPlace"`. Il nome del posto scelto su Google
 * («Hotel Da Vinci Milano») finora si vedeva solo mentre si compilava il modulo e poi si perdeva: chi apriva
 * la consegna leggeva «Via Senigallia 6» e non sapeva che si andava in un hotel — che è la differenza fra
 * suonare a un citofono e passare da una reception.
 *
 * ⚠️ Il Postgres è condiviso da 14 app: qui si AGGIUNGE una colonna che ammette NULL, non si tocca nulla di
 * esistente. Nessuna delle altre app la legge; ripetere lo script non fa danni (IF NOT EXISTS).
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const APPLICA = process.argv.includes('--applica');
const RADICE = 'C:/Users/nicol/app/.claude/worktrees/deploy-delivery/deluxy-platform-next/';
const require = createRequire(RADICE + 'api/package.json');
const { PrismaClient } = require('@prisma/client');
const riga = fs.readFileSync(RADICE + 'api/.env', 'utf8').split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
u.searchParams.set('schema', 'platform');
u.searchParams.set('connection_limit', '1');
const db = new PrismaClient({ datasources: { db: { url: u.toString() } } });

const prima = await db.$queryRawUnsafe(
  `SELECT column_name FROM information_schema.columns WHERE table_schema='platform' AND table_name='Delivery' AND column_name='recipientPlace'`,
);
console.log('colonna recipientPlace:', prima.length ? 'già presente' : 'da creare');
if (!APPLICA) {
  console.log('ANTEPRIMA: nessuna scrittura.');
  await db.$disconnect();
  process.exit(0);
}
await db.$executeRawUnsafe('ALTER TABLE platform."Delivery" ADD COLUMN IF NOT EXISTS "recipientPlace" TEXT');
const dopo = await db.$queryRawUnsafe(
  `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='platform' AND table_name='Delivery' AND column_name='recipientPlace'`,
);
console.log('VERIFICA:', JSON.stringify(dopo[0] ?? null));
await db.$disconnect();
