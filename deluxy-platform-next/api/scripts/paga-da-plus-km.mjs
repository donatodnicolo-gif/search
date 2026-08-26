/**
 * IL PLUS USATO COME RIMBORSO KM torna a essere PAGA BASE.
 *
 * Deciso dall'utente il 26/08/2026, dopo che la nuova regola («il plus sopra i
 * 5 € e' un rimborso di acquisti e non entra nei margini») ha fatto risultare a
 * COSTO ZERO 144 consegne che avevano paga base 0 e solo un plus grosso —
 * quasi tutte trasferte lunghe: «sembrano casi in cui il plus e' stato usato
 * per il rimborso km: sistema la paga base come da funzionamento attuale e
 * azzera il plus».
 *
 * COME SI RICALCOLA — il «funzionamento attuale» per una consegna FUORI DAL
 * COMUNE (`CalculationsService.fixedPrice`, ramo `!inCity`):
 *     paga = extraOutOfCityPrice del valet × distanceKm
 *
 * ⭐ Che sia proprio questa la formula usata allora NON e' un'ipotesi: dove il
 * valet ha davvero un prezzo fuori citta', il plus scritto sulla consegna
 * COMBACIA con km × prezzo — 22 casi entro 50 centesimi e altri 18 entro 3 €
 * (es. #36415: 44,16 km, plus 44,00 con 1 €/km; #35419: 31,94 km, plus 32,00).
 * Il plus ERA il rimborso km, scritto nella casella sbagliata.
 *
 * ⚠️ NON si tocca dove non si sa: se manca `distanceKm`, se il valet ha
 * `extraOutOfCityPrice` a zero, o se la consegna e' gia' stata PAGATA al valet
 * (paymentStatus `paid` o gia' dentro una busta) la riga si SALTA e si dice
 * perche'. Una paga dedotta male e' peggio di una paga vecchia, e una gia'
 * pagata non si riscrive alle spalle di chi l'ha incassata.
 *
 * COSA SCRIVE: `valetSalary` (la paga ricalcolata), `valetAdditionalPrice` = 0,
 * e una riga di registro che dice il prima, il dopo e la formula.
 *
 * Sola lettura di default. `--applica` per scrivere (backup in
 * scripts/backup-paga-da-plus-km.json).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

const APPLICA = process.argv.includes('--applica');
const SOLO_VENDITE = !process.argv.includes('--tutte');
const QUI = path.dirname(fileURLToPath(import.meta.url));
const BACKUP = path.join(QUI, 'backup-paga-da-plus-km.json');

const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
const db = new PrismaClient({ datasources: { db: { url:
  `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform&connection_limit=1` } } });

const eur = (n) => (n ?? 0).toFixed(2).replace('.', ',') + ' EUR';
const gg = (d) => new Date(d).toISOString().slice(0, 10);
const r2 = (n) => Math.round(n * 100) / 100;

// Le consegne colpite: paga base a zero (o negativa) e un plus sopra i 5 €.
const dd = await db.delivery.findMany({
  where: {
    deletedAt: null, payable: true,
    status: { in: ['delivered', 'approved'] },
    valetAdditionalPrice: { gt: 5 },
    valetSalary: { lte: 0 },
    valetId: { not: null },
    ...(SOLO_VENDITE ? { serviceType: { pricingModel: 'VENDITA' } } : {}),
  },
  select: {
    id: true, legacyId: true, code: true, date: true, hours: true,
    valetSalary: true, valetAdditionalPrice: true, distanceKm: true, valetServiceId: true,
    paymentStatus: true, _count: { select: { salaryLines: true } },
    serviceType: { select: { name: true, pricingModel: true, minHours: true } },
    partner: { select: { insegna: true } },
    valet: {
      select: {
        id: true, firstName: true, lastName: true, minimumKmIncluded: true, extraOutOfCityPrice: true,
        services: { select: { serviceTypeId: true, salary: true, salaryPerItem: true, extraKmPrice: true,
                              serviceType: { select: { name: true, pricingModel: true, minHours: true } } } },
      },
    },
  },
  orderBy: { valetAdditionalPrice: 'desc' },
});

console.log(`\nConsegne con paga base 0 e plus > 5 €${SOLO_VENDITE ? ' (ambito VENDITA)' : ' (TUTTI i servizi)'}: ${dd.length}`);

/** Il listino del valet buono per questa consegna: per modello di prezzo. */
function listinoPer(d) {
  const s = d.valet?.services ?? [];
  if (!s.length) return null;
  if (d.valetServiceId) {
    const indicato = s.find((x) => x.serviceTypeId === d.valetServiceId);
    if (indicato) return indicato;
  }
  const modello = d.serviceType?.pricingModel ?? '';
  const stesso = s.filter((x) => (x.serviceType?.pricingModel ?? '') === modello);
  if (stesso.length === 1) return stesso[0];
  const fisso = s.filter((x) => (x.serviceType?.pricingModel ?? '') === 'PREZZO_FISSO');
  if (fisso.length >= 1) return fisso[0];
  return s.length === 1 ? s[0] : null;
}

const piano = [];
const saltate = [];
for (const d of dd) {
  if (d.paymentStatus === 'paid' || (d._count?.salaryLines ?? 0) > 0) {
    saltate.push({ d, perche: 'gia\' pagata al valet: non si riscrive' });
    continue;
  }
  if (d.distanceKm == null) { saltate.push({ d, perche: 'la consegna non ha una distanza scritta' }); continue; }
  const prezzoFuori = d.valet?.extraOutOfCityPrice ?? 0;
  if (!prezzoFuori) { saltate.push({ d, perche: 'il valet non ha un prezzo fuori citta\' in scheda' }); continue; }
  const nuova = r2(prezzoFuori * d.distanceKm);
  const formula = `${prezzoFuori} €/km × ${d.distanceKm} km = ${nuova}`;
  piano.push({ d, nuova, formula, primaPaga: d.valetSalary ?? 0, primaPlus: d.valetAdditionalPrice ?? 0 });
}

const primaTot = piano.reduce((s, p) => s + p.primaPaga + p.primaPlus, 0);
const dopoTot = piano.reduce((s, p) => s + p.nuova, 0);
console.log(`\nRicalcolabili: ${piano.length} · da saltare: ${saltate.length}`);
console.log(`  quello che il valet prendeva (paga + plus): ${eur(primaTot)}`);
console.log(`  quello che prenderebbe con la tariffa:      ${eur(dopoTot)}   (differenza ${eur(dopoTot - primaTot)})`);

console.log('\nprime 15 (consegna | data | valet | km | prima paga+plus | dopo | formula):');
for (const p of piano.slice(0, 15)) {
  console.log(`  #${p.d.legacyId ?? p.d.code} | ${gg(p.d.date)} | ${p.d.valet?.firstName} ${p.d.valet?.lastName} | ${p.d.distanceKm ?? '-'} km | ${eur(p.primaPaga)} + ${eur(p.primaPlus)} | ${eur(p.nuova)} | ${p.formula}`);
}

if (saltate.length) {
  const perche = new Map();
  for (const s of saltate) perche.set(s.perche, (perche.get(s.perche) ?? 0) + 1);
  console.log('\nSALTATE (e resta tutto com\'era):');
  for (const [k, n] of perche) console.log(`  ${n} × ${k}`);
  console.log('  esempi:');
  for (const s of saltate.slice(0, 8)) console.log(`   #${s.d.legacyId ?? s.d.code} | ${gg(s.d.date)} | ${s.d.valet?.firstName} ${s.d.valet?.lastName} | ${s.d.distanceKm ?? 'km assenti'} | plus ${eur(s.d.valetAdditionalPrice)} → ${s.perche}`);
}

if (!APPLICA) {
  console.log("\nPROVA A SECCO — niente e' stato scritto. Rilanciare con --applica.");
  await db.$disconnect();
  process.exit(0);
}

fs.writeFileSync(BACKUP, JSON.stringify(piano.map((p) => ({
  id: p.d.id, legacyId: p.d.legacyId, valetSalaryPrima: p.primaPaga,
  valetAdditionalPricePrima: p.primaPlus, valetSalaryDopo: p.nuova,
})), null, 2), 'utf8');
console.log(`\nBackup in ${BACKUP} (${piano.length} righe).`);

let scritte = 0;
for (const p of piano) {
  const messaggio = `Paga ricalcolata dalla tariffa del valet (${p.formula}); il plus di `
    + `${p.primaPlus.toFixed(2)} € era il rimborso km e torna nella paga base. `
    + `Prima: paga ${p.primaPaga.toFixed(2)} + plus ${p.primaPlus.toFixed(2)}. Dopo: paga ${p.nuova.toFixed(2)}, plus 0.`;
  await db.$transaction([
    db.delivery.update({ where: { id: p.d.id }, data: { valetSalary: p.nuova, valetAdditionalPrice: 0 } }),
    db.deliveryLog.create({ data: { deliveryId: p.d.id, type: 'note', message: messaggio } }),
  ]);
  scritte++;
  if (scritte % 25 === 0) console.log(`  ${scritte}/${piano.length}…`);
}
console.log(`\nScritte: ${scritte}.`);

await db.$disconnect();
