/**
 * Le due righe della coppia corporate finiscono DAVVERO nello stipendio?
 *
 * ⚠️ «Manca il filtro» non e' ancora «paga due volte»: si conta sul conto vero
 * di un valet, con la stessa clausola che usa il modulo stipendi.
 */
import fs from 'node:fs';
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
process.env.DATABASE_URL = `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform&connection_limit=5`;
const { PrismaClient } = await import('@prisma/client');
const p = new PrismaClient();

// La stessa clausola di SalariesService.DA_PAGARE.
const DA_PAGARE = {
  NOT: { valetId: null },
  valet: { placeholder: false },
  deletedAt: null,
  payable: true,
  status: { in: ['delivered', 'approved', 'delivered_time_to_approve', 'not_delivered'] },
};

// Il valet delle brioches.
const v = await p.valet.findFirst({ where: { firstName: 'Vittorio', lastName: 'Acampora' }, select: { id: true, firstName: true, lastName: true } });

// I legacyId delle righe di VENDITA che sono la gemella di una CORPORATE.
const gemelle = await p.$queryRawUnsafe(`
  SELECT d.id
  FROM platform."Delivery" d
  JOIN platform."ServiceType" sv ON sv.id=d."serviceTypeId" AND sv."pricingModel"='VENDITA'
  JOIN platform."Delivery" c ON c."legacyId"=d."legacyCorrespondDeliveryId" AND c."deletedAt" IS NULL
  JOIN platform."ServiceType" sc ON sc.id=c."serviceTypeId" AND sc."pricingModel"='CORPORATE'
  WHERE d."deletedAt" IS NULL AND d."valetId" = c."valetId"`);
const idGemelle = gemelle.map((x) => x.id);

const tutte = await p.delivery.findMany({
  where: { ...DA_PAGARE, valetId: v.id },
  select: { id: true, code: true, valetSalary: true, date: true },
});
const somma = (a) => a.reduce((s, x) => s + (x.valetSalary ?? 0), 0);
const senza = tutte.filter((x) => !idGemelle.includes(x.id));

console.log(`valet: ${v.firstName} ${v.lastName}`);
console.log(`consegne che entrano nello stipendio : ${tutte.length}  →  ${somma(tutte).toFixed(2)} €`);
console.log(`di cui righe GEMELLE di una corporate : ${tutte.length - senza.length}  →  ${(somma(tutte) - somma(senza)).toFixed(2)} €`);
console.log(`totale se le gemelle NON contassero  : ${senza.length}  →  ${somma(senza).toFixed(2)} €`);

// E su TUTTI i valet.
const tutteG = await p.delivery.findMany({
  where: { ...DA_PAGARE, id: { in: idGemelle } },
  select: { valetSalary: true, valet: { select: { firstName: true, lastName: true } } },
});
const perValet = {};
for (const x of tutteG) {
  const k = `${x.valet?.firstName ?? ''} ${x.valet?.lastName ?? ''}`.trim();
  perValet[k] = (perValet[k] ?? 0) + (x.valetSalary ?? 0);
}
console.log(`\nSU TUTTI I VALET — righe gemelle che entrano nello stipendio: ${tutteG.length}, per ${somma(tutteG).toFixed(2)} €`);
for (const [k, val] of Object.entries(perValet).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(26)} ${val.toFixed(2)} €`);
await p.$disconnect();
