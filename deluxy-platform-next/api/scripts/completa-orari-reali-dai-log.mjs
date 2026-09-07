/**
 * COMPLETA startedAt / deliveredAt DAI LOG (06/09/2026). La nuova app non li
 * scriveva al cambio di stato (corretto oggi in updateStatus): qui si
 * ricostruiscono dalla riga di registro «Stato: … -> in_delivery» e
 * «Stato: … -> delivered» (l'orario del click del valet), SOLO dove il campo e'
 * vuoto. Idempotente. Uso: node scripts/completa-orari-reali-dai-log.mjs [--applica]
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8').split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, '')); u.searchParams.set('schema', 'platform'); process.env.DATABASE_URL = u.toString();
const applica = process.argv.includes('--applica');
const p = new PrismaClient();
const consegne = await p.delivery.findMany({
  where: { deletedAt: null, date: { gte: new Date('2026-01-01') }, OR: [{ deliveredAt: null, status: { in: ['delivered', 'approved', 'delivered_time_to_approve'] } }, { startedAt: null, status: { in: ['delivered', 'approved', 'delivered_time_to_approve', 'in_delivery'] } }] },
  select: { id: true, code: true, startedAt: true, deliveredAt: true, logs: { where: { type: { in: ['status_change', 'departed', 'delivered'] } }, select: { message: true, createdAt: true, type: true }, orderBy: { createdAt: 'asc' } } },
});
let consegnate = 0, partite = 0, senzaLog = 0;
for (const d of consegne) {
  const partenza = d.logs.find((l) => /-> in_delivery\b/.test(l.message) || l.type === 'departed');
  const arrivo = d.logs.find((l) => /-> (delivered|delivered_time_to_approve)\b/.test(l.message) || l.type === 'delivered');
  const data = {};
  if (!d.startedAt && partenza) data.startedAt = partenza.createdAt;
  if (!d.deliveredAt && arrivo) data.deliveredAt = arrivo.createdAt;
  if (!Object.keys(data).length) { senzaLog++; continue; }
  if (data.startedAt) partite++;
  if (data.deliveredAt) consegnate++;
  if (applica) await p.delivery.update({ where: { id: d.id }, data });
}
console.log(`${applica ? 'SCRITTE' : 'DA SCRIVERE'} · consegne esaminate ${consegne.length} · deliveredAt ricostruiti ${consegnate} · startedAt ricostruiti ${partite} · senza log utile ${senzaLog}`);
await p.$disconnect();
