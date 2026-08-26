// Riempie Delivery.ddtBrand per le consegne ESISTENTI con un DDT:
//   1) consegna nata da una vendita (Sale.deliveryId) -> brand della vendita;
//   2) consegna con realOrderNumber agganciabile a OrdineCliente -> brand
//      dell'ordine pagato (la cache dei 4 negozi).
// Dove il brand non e' determinabile NON si scrive nulla («non indicato»
// batte «sbagliato»). Prova a secco di default; --scrivi per applicare.
//
//   node scripts/riempi-ddt-brand.mjs [--scrivi]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const RADICE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { PrismaClient } = require(path.join(RADICE, 'node_modules', '@prisma/client'));
const SCRIVI = process.argv.includes('--scrivi');

const rigaEnv = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(rigaEnv.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
const db = new PrismaClient({ datasources: { db: { url:
  `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform&connection_limit=1` } } });

// Brand per orderId (le sole cifre del gid) dalla cache dei pagati.
const ordini = await db.$queryRawUnsafe(
  'SELECT "orderId", brand FROM platform."OrdineCliente" WHERE brand IS NOT NULL',
);
const brandPerOrdine = new Map(ordini.map((o) => [String(o.orderId).replace(/\D/g, ''), o.brand]));

// Brand per consegna dalle vendite che l'hanno generata.
const vendite = await db.sale.findMany({
  where: { deliveryId: { not: null } },
  select: { deliveryId: true, brand: true },
});
const brandPerConsegna = new Map(vendite.map((v) => [v.deliveryId, v.brand]));

const consegne = await db.delivery.findMany({
  where: { ddtNumber: { not: null }, ddtBrand: null, deletedAt: null },
  select: { id: true, code: true, ddtNumber: true, realOrderNumber: true },
});
console.log(`Consegne con DDT e senza brand: ${consegne.length}`);

let daVendita = 0, daOrdine = 0, indeterminate = 0;
const daScrivere = [];
for (const d of consegne) {
  let brand = brandPerConsegna.get(d.id) ?? null;
  if (brand) daVendita++;
  else if (d.realOrderNumber) {
    const cifre = String(d.realOrderNumber).replace(/\D/g, '');
    // Il realOrderNumber contiene il gid Shopify: si confronta per cifre intere,
    // non per pezzi («2792» non deve pescare «12792»).
    brand = cifre ? brandPerOrdine.get(cifre) ?? null : null;
    if (brand) daOrdine++;
  }
  if (!brand) { indeterminate++; continue; }
  daScrivere.push({ id: d.id, brand });
}
console.log(`da vendita: ${daVendita} · da ordine pagato: ${daOrdine} · indeterminabili (restano vuote): ${indeterminate}`);

if (!SCRIVI) {
  console.log('PROVA A SECCO: nessuna scrittura. Rilanciare con --scrivi.');
} else {
  let fatti = 0;
  // A blocchi per brand: pochi valori distinti, updateMany per gruppo.
  const perBrand = new Map();
  for (const r of daScrivere) {
    const l = perBrand.get(r.brand) ?? [];
    l.push(r.id);
    perBrand.set(r.brand, l);
  }
  for (const [brand, ids] of perBrand) {
    for (let i = 0; i < ids.length; i += 1000) {
      const blocco = ids.slice(i, i + 1000);
      await db.delivery.updateMany({ where: { id: { in: blocco } }, data: { ddtBrand: brand } });
      fatti += blocco.length;
      process.stdout.write(`  ${brand}: ${fatti}/${daScrivere.length}…`);
    }
  }
  console.log(`\nScritte ${fatti} consegne.`);
}
await db.$disconnect();
