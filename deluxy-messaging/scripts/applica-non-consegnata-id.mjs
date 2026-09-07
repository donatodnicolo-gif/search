/** ⭐ 07/09/2026 — colonna `appNonConsegnataId` su Ordine (schema messaging): la riapertura
 *  «non consegnata» scatta una volta per CONSEGNA e non per cambio di stato, così recupera
 *  anche gli ordini rimasti chiusi con la consegna fallita. Idempotente. */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
if (!process.env.DATABASE_URL) {
  const env = fs.readFileSync(new URL('../.env', import.meta.url), 'utf8');
  const riga = env.split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
  if (riga) process.env.DATABASE_URL = riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, '');
}
const p = new PrismaClient();
await p.$executeRawUnsafe(`ALTER TABLE messaging."Ordine" ADD COLUMN IF NOT EXISTS "appNonConsegnataId" TEXT NOT NULL DEFAULT ''`);
const n = await p.$queryRawUnsafe(`SELECT COUNT(*)::int AS n FROM messaging."Ordine" WHERE "appConsegnaStato" = 'not_delivered'`);
console.log(`colonna pronta · ordini con consegna non riuscita che il prossimo giro riaprirà: ${n[0].n}`);
await p.$disconnect();
