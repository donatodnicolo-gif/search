/**
 * Le coppie corporate hanno DUE righe per UN viaggio solo. Se tutte e due
 * portano una paga, il valet viene pagato due volte per lo stesso giro.
 */
import fs from 'node:fs';
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
process.env.DATABASE_URL = `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform&connection_limit=5`;
const { PrismaClient } = await import('@prisma/client');
const p = new PrismaClient();

const r = await p.$queryRawUnsafe(`
  SELECT c.code AS corp, d.code AS ven, c.date,
         c."valetId" AS corp_valet, d."valetId" AS ven_valet,
         c."valetSalary" AS corp_paga, d."valetSalary" AS ven_paga,
         c.status AS corp_stato, d.status AS ven_stato
  FROM platform."Delivery" d
  JOIN platform."ServiceType" sv ON sv.id=d."serviceTypeId" AND sv."pricingModel"='VENDITA'
  JOIN platform."Delivery" c ON c."legacyId"=d."legacyCorrespondDeliveryId" AND c."deletedAt" IS NULL
  JOIN platform."ServiceType" sc ON sc.id=c."serviceTypeId" AND sc."pricingModel"='CORPORATE'
  WHERE d."deletedAt" IS NULL`);

const PAGABILI = ['delivered', 'approved', 'delivered_time_to_approve', 'not_delivered'];
let stessoValet = 0, entrambePagate = 0, doppioneEuro = 0, entrambePagabili = 0;
const esempi = [];
for (const x of r) {
  if (x.corp_valet && x.corp_valet === x.ven_valet) stessoValet++;
  const a = Number(x.corp_paga ?? 0), b = Number(x.ven_paga ?? 0);
  // ⚠️ Conta solo se la gemella e PAGABILE: dal 28/08 le 50 coppie col doppio
  // importo hanno payable=false sulla riga di vendita, e senza questo filtro
  // lo script continuerebbe ad accusare un difetto gia corretto.
  if (a > 0 && b > 0 && x.ven_pay) {
    entrambePagate++;
    if (PAGABILI.includes(x.corp_stato) && PAGABILI.includes(x.ven_stato)) {
      entrambePagabili++;
      doppioneEuro += Math.min(a, b);
      if (esempi.length < 6) esempi.push(`#${x.corp}+#${x.ven} ${new Date(x.date).toISOString().slice(0, 10)} → ${a} + ${b}`);
    }
  }
}
console.log('coppie corporate:', r.length);
console.log('con lo STESSO valet su tutte e due le righe:', stessoValet);
console.log('con una paga > 0 su tutte e due le righe:', entrambePagate);
console.log('…e tutte e due in uno stato PAGABILE:', entrambePagabili);
console.log('euro pagati in piu\' se il conto le somma entrambe:', doppioneEuro.toFixed(2), '€');
console.log('esempi:', esempi.join(' | '));
await p.$disconnect();
