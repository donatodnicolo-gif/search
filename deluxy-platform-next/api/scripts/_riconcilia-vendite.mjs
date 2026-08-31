import fs from 'node:fs';
import { PrismaClient } from '@prisma/client';
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
process.env.DATABASE_URL = `postgresql://${u.username}:${u.password}@${u.hostname}:6543/postgres?schema=platform&pgbouncer=true`;
const prisma = new PrismaClient();
const APPLICA = process.argv.includes('--applica');

// vendite aperte + il loro ordine
const aperte = await prisma.$queryRawUnsafe(
  `SELECT s.id AS sale_id, s.status, s."productName", s."externalOrderNumber",
          o.id AS ordine_id, o."orderId" AS shopify_id, o.numero, o.brand,
          o."consegnataIl", o."fulfillmentStatus", o.evasione, o."annullatoIl",
          o."spedizioneNome", o."dataConsegna"::date::text AS data_consegna
   FROM platform."Sale" s
   JOIN orders."Ordine" o ON o.id = s."externalOrderId"
   WHERE s.status IN ('proposta','da_gestire')`);
console.log('vendite aperte:', aperte.length);

// ponte 1: consegna con realOrderNumber = id shopify
// ponte 2: consegna con realOrderNumber = numero (senza #)
// ponte 3: ordine gia' CHIUSO dal lato Orders (consegnataIl/annullatoIl/fulfilled)
let p1 = 0, p2 = 0, chiusi = [];
const daAccettare = [];
for (const r of aperte) {
  const num = String(r.numero ?? '').replace(/^#+/, '');
  const d = await prisma.delivery.findFirst({
    where: { OR: [
      { realOrderNumber: String(r.shopify_id ?? '-') },
      ...(num ? [{ realOrderNumber: num }, { realOrderNumber: '#' + num }] : []),
    ] },
    select: { id: true, code: true, status: true },
  });
  if (d) { (String(r.shopify_id) === d.id ? p1++ : p2++); daAccettare.push({ ...r, delivery: d }); continue; }
  if (r.annullatoIl || r.consegnataIl || r.fulfillmentStatus === 'FULFILLED') chiusi.push(r);
}
console.log('aperte con CONSEGNA esistente:', daAccettare.length);
daAccettare.slice(0, 12).forEach((r) => console.log(
  `  ${r.status} · #${String(r.numero).replace(/^#+/, '')} (${r.brand}) ${r.productName ?? ''} -> consegna #${r.delivery.code} (${r.delivery.status})`));
console.log('aperte SENZA consegna ma ordine gia\' chiuso lato Orders:', chiusi.length);
chiusi.slice(0, 12).forEach((r) => console.log(
  `  ${r.status} · #${String(r.numero).replace(/^#+/, '')} (${r.brand}) ${r.productName ?? ''} · fulfillment=${r.fulfillmentStatus} annullato=${r.annullatoIl ? 'si' : 'no'} consegnato=${r.consegnataIl ? 'si' : 'no'}`));

if (APPLICA) {
  let n = 0;
  for (const r of daAccettare) {
    await prisma.sale.update({ where: { id: r.sale_id },
      data: { status: 'accettata', deliveryId: r.delivery.id,
        assignmentReason: 'riconciliata 31/08: la consegna esisteva già (#' + r.delivery.code + ')' } });
    n++;
  }
  console.log('accettate con consegna agganciata:', n);
  let m = 0;
  for (const r of chiusi) {
    await prisma.sale.update({ where: { id: r.sale_id },
      data: { status: 'annullata',
        assignmentReason: 'riconciliata 31/08: ordine già evaso (fulfilled) lato Orders prima dello smistamento' } });
    m++;
  }
  console.log('chiuse in storico (annullate, ordine già evaso):', m);
  // e i numeri con il cancelletto doppio: si normalizza QUI, una volta
  const puliti = await prisma.$executeRawUnsafe(`UPDATE platform."Sale" SET "externalOrderNumber" = regexp_replace("externalOrderNumber", '^#+', '') WHERE "externalOrderNumber" LIKE '#%'`);
  console.log('numeri ripuliti dal cancelletto:', puliti);
}
await prisma.$disconnect();
