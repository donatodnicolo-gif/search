/**
 * AREA DI CONSEGNA (06/09/2026 sera, nuova architettura vendite — regola utente): «una volta avuto il flag
 * consegna partner consentire di impostare in quali province il partner consegna: minimo ordine e raggio
 * km per provincia di consegna, copiabili per tutte».
 * 1) tabella PartnerConsegnaProvincia (partner × provincia, minimo, raggio);
 * 2) semina: ai partner con «Consegna da Partner» acceso, una riga per ogni provincia effettiva
 *    (minimo/raggio vuoti = i predefiniti del partner): nulla cambia nel comportamento di oggi.
 * Idempotente. Uso: node scripts/applica-migrazione-area-consegna.mjs
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8').split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
u.searchParams.set('schema', 'platform'); process.env.DATABASE_URL = u.toString();
const p = new PrismaClient();
const q = (s, ...a) => p.$executeRawUnsafe(s, ...a);
const r = (s, ...a) => p.$queryRawUnsafe(s, ...a);
const cuid = (pre) => pre + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);

await q(`CREATE TABLE IF NOT EXISTS platform."PartnerConsegnaProvincia" (
  "id" TEXT PRIMARY KEY,
  "partnerId" TEXT NOT NULL REFERENCES platform."Partner"("id") ON DELETE CASCADE,
  "provinceId" TEXT NOT NULL REFERENCES platform."Province"("id"),
  "minimoOrdine" DOUBLE PRECISION NULL,
  "raggioKm" DOUBLE PRECISION NULL,
  UNIQUE ("partnerId", "provinceId"))`);
console.log('✓ tabella PartnerConsegnaProvincia');

const flag = await r(`SELECT pa.id, pa.insegna, (SELECT count(*)::int FROM platform."PartnerConsegnaProvincia" c WHERE c."partnerId" = pa.id) AS gia FROM platform."Partner" pa WHERE pa."autoDeliveredByPartner" AND NOT pa.deleted ORDER BY pa.insegna`);
let seminati = 0;
for (const pa of flag) {
  if (pa.gia > 0) continue;
  const prov = await r(`SELECT "provinceId" FROM platform."PartnerProvince" WHERE "partnerId" = $1`, pa.id);
  for (const x of prov) await q(`INSERT INTO platform."PartnerConsegnaProvincia" ("id","partnerId","provinceId") VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, cuid('pc'), pa.id, x.provinceId);
  console.log(`  ${pa.insegna}: ${prov.length} province di consegna`);
  seminati++;
}
console.log(`✓ partner con «Consegna da Partner»: ${flag.length} · seminati ora: ${seminati}`);
await p.$disconnect();
