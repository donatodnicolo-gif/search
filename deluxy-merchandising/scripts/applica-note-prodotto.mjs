/** ⭐ 07/09/2026 — colonne `note` su Prodotto e Variante (schema merchandising): la specifica di
 *  che cosa c'è dentro, per prodotto o per taglia. Idempotente. */
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
await p.$executeRawUnsafe(`ALTER TABLE merchandising."Prodotto" ADD COLUMN IF NOT EXISTS "note" TEXT`);
await p.$executeRawUnsafe(`ALTER TABLE merchandising."Variante" ADD COLUMN IF NOT EXISTS "note" TEXT`);
const a = await p.$queryRawUnsafe(`SELECT COUNT(*)::int AS n FROM merchandising."Prodotto" WHERE "note" IS NOT NULL`);
const b = await p.$queryRawUnsafe(`SELECT COUNT(*)::int AS n FROM merchandising."Variante" WHERE "note" IS NOT NULL`);
console.log(`colonne pronte · note già scritte: ${a[0].n} prodotti, ${b[0].n} varianti`);
await p.$disconnect();
