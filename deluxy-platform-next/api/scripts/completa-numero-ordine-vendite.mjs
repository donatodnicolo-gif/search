/**
 * COMPLETA `Delivery.realOrderNumber` sulle consegne nate dalle VENDITE (06/09/2026).
 * Le consegne create da `creaConsegna` non scrivevano l'id Shopify dell'ordine, e
 * Finanza non trovava la cache di Orders (venduto «stimato»). Qui si risale:
 * Sale.deliveryId → Sale.externalOrderId (id interno Orders) → OrdineCliente.ordersId
 * → OrdineCliente.orderId (id Shopify) e si scrive SOLO dove manca. Idempotente.
 * Uso: node scripts/completa-numero-ordine-vendite.mjs [--applica]
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8').split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, '')); u.searchParams.set('schema', 'platform'); process.env.DATABASE_URL = u.toString();
const applica = process.argv.includes('--applica');
const p = new PrismaClient();
const vendite = await p.sale.findMany({ where: { deliveryId: { not: null }, externalOrderId: { not: null } }, select: { deliveryId: true, externalOrderId: true, externalOrderNumber: true } });
const consegne = await p.delivery.findMany({ where: { id: { in: vendite.map((v) => v.deliveryId) }, realOrderNumber: null }, select: { id: true, code: true } });
const daFare = new Map(consegne.map((c) => [c.id, c.code]));
const cache = await p.ordineCliente.findMany({ where: { ordersId: { in: vendite.filter((v) => daFare.has(v.deliveryId)).map((v) => v.externalOrderId) } }, select: { ordersId: true, orderId: true, numero: true } });
const perOrdersId = new Map(cache.map((c) => [c.ordersId, c]));
let scritte = 0, senzaCache = 0;
for (const v of vendite) {
  if (!daFare.has(v.deliveryId)) continue;
  const c = perOrdersId.get(v.externalOrderId);
  if (!c) { senzaCache++; continue; }
  if (applica) await p.delivery.update({ where: { id: v.deliveryId }, data: { realOrderNumber: c.orderId } });
  scritte++;
}
console.log(`${applica ? 'SCRITTE' : 'DA SCRIVERE'}: ${scritte} consegne (id Shopify dalla cache di Orders) · senza cache ancora: ${senzaCache} · consegne di vendita senza numero: ${consegne.length}`);
await p.$disconnect();
