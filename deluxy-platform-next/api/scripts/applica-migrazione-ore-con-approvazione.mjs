/**
 * ORE CON APPROVAZIONE: quale servizio a ore le chiede (05/09/2026, regola utente:
 * «sono solo per i servizi orari con approvazione»).
 *
 * Dal 04/09 il flusso «il valet dichiara le ore → il partner approva» si
 * applicava a TUTTI i servizi con pricingModel A_ORA. Sbagliato: dei dieci
 * servizi a ore uno solo lo prevede, «Servizio Ora con Approvazione» (2.715
 * consegne, 7 partner). Gli altri — Chanel Milano/Firenze/Roma a ora, Servizio
 * a Ora, Ritiro Catering… — si chiudono come le altre consegne. Il 05/09 sei
 * consegne di quei servizi erano ferme in «ore da approvare» che nessuno
 * doveva approvare.
 *
 * ⚠️ Solo ADD COLUMN IF NOT EXISTS + un UPDATE mirato sul codice del servizio.
 * Idempotente. Uso: node scripts/applica-migrazione-ore-con-approvazione.mjs
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
await prisma.$executeRawUnsafe(`ALTER TABLE platform."ServiceType" ADD COLUMN IF NOT EXISTS "hoursApproval" BOOLEAN NOT NULL DEFAULT false`);
console.log('✓ colonna ServiceType.hoursApproval');
const n = await prisma.$executeRawUnsafe(`UPDATE platform."ServiceType" SET "hoursApproval" = true WHERE "code" = 'SERVIZIO_ORA_CON_APPROVAZIONE' AND "hoursApproval" = false`);
console.log(`✓ servizi marcati con approvazione: ${n} (attesi 1 la prima volta, 0 dopo)`);
const chi = await prisma.$queryRawUnsafe(`SELECT "name","code","hoursApproval" FROM platform."ServiceType" WHERE "pricingModel"='A_ORA' ORDER BY "hoursApproval" DESC, "name"`);
console.table(chi);
await prisma.$disconnect();
