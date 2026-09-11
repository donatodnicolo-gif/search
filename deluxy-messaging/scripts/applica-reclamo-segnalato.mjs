/** ⭐ 11/09/2026 — due colonne su `Reclamo` (schema messaging): la SEGNALAZIONE
 *  alla piattaforma consegne (utente: «se all'ordine è associato una consegna su
 *  app delivery invia una segnalazione all'app delivery di vedere il reclamo»).
 *  `segnalatoIl` è la guardia contro il doppio invio, `segnalazioneEsito` è cosa
 *  ha risposto la piattaforma — o perché non è partita. Idempotente. */
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
await p.$executeRawUnsafe(`ALTER TABLE messaging."Reclamo" ADD COLUMN IF NOT EXISTS "segnalatoIl" TIMESTAMP(3)`);
await p.$executeRawUnsafe(`ALTER TABLE messaging."Reclamo" ADD COLUMN IF NOT EXISTS "segnalazioneEsito" TEXT NOT NULL DEFAULT ''`);
const n = await p.$queryRawUnsafe(`SELECT COUNT(*)::int AS n FROM messaging."Reclamo"`);
console.log(`colonne pronte · reclami in archivio: ${n[0].n} (nessuno segnalato: la segnalazione parte dai prossimi)`);
await p.$disconnect();
