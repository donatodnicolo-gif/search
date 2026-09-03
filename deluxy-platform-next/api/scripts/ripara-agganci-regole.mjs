/**
 * RIPARA GLI AGGANCI MANCANTI delle regole carnet (03/09, dal check utente).
 *
 * Il bug «days=0000000 = nessun giorno» impediva l'aggancio di 15 regole su
 * 22 alle consegne nuove: le consegne VIVE e NON FATTURATE da agosto restano
 * senza sconto in fatturazione. Qui si riapplica l'aggancio con la stessa
 * logica del server corretto (partner, servizio, periodo, giorno con la
 * semantica giusta, sovrapposizione oraria, raggio km, regola attiva) e il
 * CONSUMO del carnet giorno per giorno in ordine cronologico, contando anche
 * le già agganciate.
 *
 * Solo consegne: deliveryRuleId nullo, non cancellate, non fatturate e senza
 * righe di fattura. Anteprima di default; scrive con --applica (log su ogni
 * consegna toccata + backup json).
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const APPLICA = process.argv.includes('--applica');
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
u.searchParams.set('schema', 'platform');
process.env.DATABASE_URL = u.toString();
const prisma = new PrismaClient();
for (let t = 1; t <= 5; t++) {
  try { await prisma.$queryRaw`SELECT 1`; break; }
  catch (e) { if (t === 5) { console.error('DB irraggiungibile'); process.exit(1); } await new Promise((r) => setTimeout(r, 4000)); }
}

const minuti = (hhmm) => {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
};
const sovrappone = (a1, a2, b1, b2) => (a1 == null || a2 == null || b1 == null || b2 == null) ? true : (a1 < b2 && b1 < a2);
const vincoloGiorni = (days) => days && days.length === 7 && days.includes('1');

const regole = (await prisma.deliveryRule.findMany({ where: { active: true }, include: { partners: { select: { partnerId: true } } } }));

const candidate = await prisma.delivery.findMany({
  where: { deliveryRuleId: null, deletedAt: null, invoiced: false, invoiceLines: { none: {} },
    status: { notIn: ['cancelled', 'not_accepted', 'invalidated'] },
    date: { gte: new Date('2026-08-01') },
    partnerId: { in: [...new Set(regole.flatMap((g) => g.partners.map((p) => p.partnerId)))] } },
  select: { id: true, code: true, date: true, status: true, partnerId: true, serviceTypeId: true,
    deliveryTimeFrom: true, deliveryTimeTo: true, distanceKm: true, partner: { select: { insegna: true } } },
  orderBy: [{ date: 'asc' }, { code: 'asc' }],
});
console.log(`Candidate (vive, non fatturate, da agosto, di partner con regole): ${candidate.length}`);

// Consumo attuale del carnet: le GIÀ agganciate, per regola+giorno e per regola (totale nel periodo).
const giaAgganciate = await prisma.delivery.findMany({
  where: { deliveryRuleId: { not: null }, deletedAt: null },
  select: { deliveryRuleId: true, date: true },
});
const usoGiorno = new Map(); // ruleId|yyyy-mm-dd -> n
const usoTotale = new Map(); // ruleId -> n (dentro il periodo della regola)
const perId = new Map(regole.map((g) => [g.id, g]));
for (const d of giaAgganciate) {
  const g = perId.get(d.deliveryRuleId);
  const k = d.deliveryRuleId + '|' + d.date.toISOString().slice(0, 10);
  usoGiorno.set(k, (usoGiorno.get(k) ?? 0) + 1);
  if (g && g.totalRule && g.totalCount > 0) {
    const dentro = (!g.periodStart || d.date >= g.periodStart) && (!g.periodEnd || d.date <= g.periodEnd);
    if (dentro) usoTotale.set(d.deliveryRuleId, (usoTotale.get(d.deliveryRuleId) ?? 0) + 1);
  }
}

const daAgganciare = [];
for (const c of candidate) {
  const applicabili = regole.filter((g) => {
    if (!g.partners.some((p) => p.partnerId === c.partnerId)) return false;
    if (g.serviceTypeId && g.serviceTypeId !== c.serviceTypeId) return false;
    if (g.periodStart && c.date < g.periodStart) return false;
    if (g.periodEnd && c.date > g.periodEnd) return false;
    if (vincoloGiorni(g.days) && g.days[c.date.getUTCDay()] !== '1') return false;
    const rf = minuti(g.timeFrom), rt = minuti(g.timeTo);
    if (rf != null && rt != null && !(rf === 0 && rt >= 1439)
      && !sovrappone(minuti(c.deliveryTimeFrom), minuti(c.deliveryTimeTo), rf, rt)) return false;
    if ((g.kmDistance ?? 0) > 0 && c.distanceKm != null && c.distanceKm > g.kmDistance) return false;
    return true;
  }).sort((a, b) => (a.serviceTypeId ? 0 : 1) - (b.serviceTypeId ? 0 : 1));

  for (const g of applicabili) {
    const k = g.id + '|' + c.date.toISOString().slice(0, 10);
    if (g.dailyRule && g.dailyCount > 0 && (usoGiorno.get(k) ?? 0) >= g.dailyCount) continue;
    if (g.totalRule && g.totalCount > 0 && (usoTotale.get(g.id) ?? 0) >= g.totalCount) continue;
    usoGiorno.set(k, (usoGiorno.get(k) ?? 0) + 1);
    if (g.totalRule && g.totalCount > 0) usoTotale.set(g.id, (usoTotale.get(g.id) ?? 0) + 1);
    daAgganciare.push({ c, g });
    break;
  }
}

console.log(`Da agganciare (nel rispetto del carnet): ${daAgganciare.length}\n`);
for (const { c, g } of daAgganciare) {
  console.log(`  #${c.code} ${c.date.toISOString().slice(0, 10)} ${c.status} · ${c.partner?.insegna} → ${g.name} (${g.toBill === false ? 'non fatturare' : (g.partnerBillingAdjustment ?? 0) + ' € in fattura'})`);
}

if (!APPLICA) {
  console.log('\nANTEPRIMA: niente scritto. Rilanciare con --applica.');
  await prisma.$disconnect();
  process.exit(0);
}

const backup = `C:/Users/nicol/AppData/Local/Temp/claude/backup-agganci-regole-${Date.now()}.json`;
fs.writeFileSync(backup, JSON.stringify(daAgganciare.map(({ c, g }) => ({ id: c.id, code: c.code, ruleId: g.id })), null, 1));
console.log(`\nBackup: ${backup}`);
let fatti = 0;
for (const { c, g } of daAgganciare) {
  await prisma.delivery.update({
    where: { id: c.id },
    data: {
      deliveryRuleId: g.id,
      logs: { create: [{ type: 'price_fix',
        message: `Agganciata la regola «${g.name}» (riparazione 03/09: il difetto sui giorni «0000000» aveva impedito l'aggancio automatico).` }] },
    },
  });
  fatti++;
}
console.log(`Agganciate: ${fatti}.`);
await prisma.$disconnect();
