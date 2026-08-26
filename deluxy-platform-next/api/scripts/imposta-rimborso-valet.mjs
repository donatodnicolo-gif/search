/**
 * Imposta la % di rimborso spese (`withholdingPercent`) sulla scheda di un
 * valet, dicendo prima che cosa cambia nei conti.
 *
 * Uso:  node scripts/imposta-rimborso-valet.mjs --legacyId=149 --percento=50 [--applica]
 *
 * La percentuale entra nella ritenuta d'acconto che Deluxy versa sopra la paga
 * (`ritenuta = paga × (1 − %) × 25%`, forma verificata sulle ricevute firmate
 * del legacy): cambia il costo consegna in Finanza e quello spinto a Orders.
 * Sola lettura di default; con `--applica` scrive e salva il valore vecchio.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

const arg = (nome, def) => {
  const v = process.argv.find((a) => a.startsWith(`--${nome}=`));
  return v ? v.split('=')[1] : def;
};
const LEGACY_ID = Number(arg('legacyId'));
const PERCENTO = Number(arg('percento'));
const APPLICA = process.argv.includes('--applica');
const QUI = path.dirname(fileURLToPath(import.meta.url));

if (!Number.isFinite(LEGACY_ID) || !Number.isFinite(PERCENTO) || PERCENTO < 0 || PERCENTO > 100) {
  console.log('Servono --legacyId=<n> e --percento=<0..100>.');
  process.exit(1);
}

const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
const db = new PrismaClient({ datasources: { db: { url:
  `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform&connection_limit=1` } } });

const eur = (n) => (n ?? 0).toFixed(2).replace('.', ',') + ' EUR';

const v = await db.valet.findFirst({
  where: { legacyId: LEGACY_ID },
  select: { id: true, legacyId: true, firstName: true, lastName: true, hasVat: true, withholdingPercent: true },
});
if (!v) { console.log(`Nessun valet con legacyId ${LEGACY_ID}.`); process.exit(1); }

const dd = await db.delivery.findMany({
  where: { valetId: v.id, deletedAt: null, payable: true, status: { in: ['delivered', 'approved'] } },
  select: { valetSalary: true, valetAdditionalPrice: true, serviceType: { select: { pricingModel: true } } },
});
const ritenuta = (paga, perc) => paga * (1 - perc / 100) * 0.25;
let paghe = 0, pagheV = 0, prima = 0, dopo = 0, primaV = 0, dopoV = 0;
for (const d of dd) {
  const paga = Math.max(0, (d.valetSalary ?? 0) + Math.max(0, d.valetAdditionalPrice ?? 0));
  paghe += paga;
  prima += ritenuta(paga, v.withholdingPercent ?? 0);
  dopo += ritenuta(paga, PERCENTO);
  if (d.serviceType?.pricingModel === 'VENDITA') {
    pagheV += paga;
    primaV += ritenuta(paga, v.withholdingPercent ?? 0);
    dopoV += ritenuta(paga, PERCENTO);
  }
}

console.log(`\n${v.firstName} ${v.lastName} (legacyId ${v.legacyId}) · P.IVA ${v.hasVat ? 'SI' : 'NO'}`);
console.log(`  % rimborso: ${v.withholdingPercent} → ${PERCENTO}`);
console.log(`  consegne a buon fine e pagabili: ${dd.length} · paghe ${eur(paghe)}`);
console.log(`  ritenuta stimata su TUTTE:      ${eur(prima)} → ${eur(dopo)}  (${eur(dopo - prima)})`);
console.log(`  di cui ambito VENDITA (margini): ${eur(primaV)} → ${eur(dopoV)}  (${eur(dopoV - primaV)}) su ${eur(pagheV)} di paghe`);
if (v.hasVat) console.log('  ⚠️ Ha la P.IVA: la ritenuta non si applica comunque, il campo resta solo anagrafico.');

if (!APPLICA) {
  console.log("\nPROVA A SECCO — niente e' stato scritto. Rilanciare con --applica.");
  await db.$disconnect();
  process.exit(0);
}

const BACKUP = path.join(QUI, `backup-rimborso-${v.legacyId}.json`);
fs.writeFileSync(BACKUP, JSON.stringify({ id: v.id, legacyId: v.legacyId,
  nome: `${v.firstName} ${v.lastName}`, prima: v.withholdingPercent, dopo: PERCENTO,
  quando: 'impostato a mano su decisione dell\'ufficio' }, null, 2), 'utf8');
await db.valet.update({ where: { id: v.id }, data: { withholdingPercent: PERCENTO } });
const dopoScrittura = await db.valet.findUnique({ where: { id: v.id }, select: { withholdingPercent: true } });
console.log(`\nScritto. Valore in banca adesso: ${dopoScrittura.withholdingPercent}. Backup in ${BACKUP}.`);

await db.$disconnect();
