/** ⭐ 07/09/2026 — colonna `fornitore` su RichiestaPagamento (schema messaging): chi PREPARA
 *  l'ordine, separato dall'intestatario del conto, che è il nome a cui esce il bonifico e
 *  può essere diverso (regola dell'utente: «l'intestatario conto di un fornitore può essere
 *  diverso da ragione sociale»). Le righe vecchie restano vuote = vale l'intestatario.
 *  Idempotente. */
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
await p.$executeRawUnsafe(`ALTER TABLE messaging."RichiestaPagamento" ADD COLUMN IF NOT EXISTS "fornitore" TEXT NOT NULL DEFAULT ''`);
const n = await p.$queryRawUnsafe(`SELECT COUNT(*)::int AS n FROM messaging."RichiestaPagamento" WHERE "fornitore" = ''`);
console.log(`colonna pronta · richieste senza fornitore separato (vale l'intestatario): ${n[0].n}`);
await p.$disconnect();
