// Riempie SUBITO la cache OrdineCliente (prodotti/consegna/totale pagati dal
// cliente) leggendo tutti gli ordini da Deluxy Orders — la stessa cosa che la
// corsa notturna dei margini fara' da stanotte in poi.
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
const db = new PrismaClient({ datasources: { db: { url:
  `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform&connection_limit=1` } } });

const imp = Object.fromEntries(
  (await db.appSetting.findMany({ where: { key: { in: ['ordersUrl', 'ordersApiKey'] } } }))
    .map((x) => [x.key, x.value]),
);
const url = imp.ordersUrl.replace(/\/+$/, '');
const numeroShopify = (v) => {
  const coda = String(v ?? '').trim().split('/').pop() ?? '';
  return /^\d+$/.test(coda) ? coda : null;
};

const economia = [];
let pagina = 1;
process.stdout.write('Leggo gli ordini da Orders');
while (true) {
  const res = await fetch(`${url}/api/v1/ordini?page=${pagina}&limit=200`, { headers: { 'x-api-key': imp.ordersApiKey } });
  if (!res.ok) { console.log(`\nHTTP ${res.status} a pagina ${pagina}`); break; }
  const b = await res.json();
  for (const o of b.ordini ?? []) {
    const k = numeroShopify(o.orderId);
    if (!k || o.totale == null || !o.righe?.length) continue;
    const prodotti = Math.round(o.righe.reduce((s, r) => s + (r.prezzo ?? 0) * (r.quantita ?? 1), 0) * 100) / 100;
    economia.push({ orderId: k, ordersId: o.id ?? null, brand: o.brand ?? null, numero: o.numero ?? null, prodotti,
      consegna: Math.max(0, Math.round((o.totale - prodotti) * 100) / 100), totale: o.totale });
  }
  process.stdout.write('.');
  if (!b.ordini?.length || pagina >= (b.pagine ?? 1)) break;
  pagina++;
}
console.log(` ${economia.length.toLocaleString('it-IT')} ordini con economia.`);

let scritti = 0;
for (let i = 0; i < economia.length; i += 500) {
  const blocco = economia.slice(i, i + 500);
  const valori = blocco
    .map((_, j) => `($${j * 7 + 1}::text, $${j * 7 + 2}::text, $${j * 7 + 3}::text, $${j * 7 + 4}::text, $${j * 7 + 5}::float8, $${j * 7 + 6}::float8, $${j * 7 + 7}::float8)`)
    .join(',');
  const parametri = blocco.flatMap((e) => [e.orderId, e.ordersId, e.brand, e.numero, e.prodotti, e.consegna, e.totale]);
  await db.$executeRawUnsafe(
    `INSERT INTO platform."OrdineCliente" ("id", "orderId", "ordersId", "brand", "numero", "prodotti", "consegna", "totale", "aggiornatoIl")
     SELECT gen_random_uuid(), v.o, v.oi, v.b, v.n, v.p, v.c, v.t, now()
     FROM (VALUES ${valori}) AS v(o, oi, b, n, p, c, t)
     ON CONFLICT ("orderId") DO UPDATE
     SET "ordersId" = EXCLUDED."ordersId", "brand" = EXCLUDED."brand", "numero" = EXCLUDED."numero",
         "prodotti" = EXCLUDED."prodotti", "consegna" = EXCLUDED."consegna", "totale" = EXCLUDED."totale", "aggiornatoIl" = now()`,
    ...parametri,
  );
  scritti += blocco.length;
  process.stdout.write(`\r  scritti ${scritti}/${economia.length}…`);
}
console.log(`\r  Cache OrdineCliente: ${scritti.toLocaleString('it-IT')} ordini.          `);
const dodici = await db.ordineCliente.findUnique({ where: { orderId: '18013706813770' } });
console.log('Controprova #12731:', JSON.stringify(dodici ? { prodotti: dodici.prodotti, consegna: dodici.consegna, totale: dodici.totale } : null));
await db.$disconnect();
