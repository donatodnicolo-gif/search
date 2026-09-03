/**
 * APPLICA gli AGGANCI di regola mancanti (03/09, ordine utente «sistema
 * tutti i 55»): per ogni consegna viva non fatturata di un partner con
 * regole ATTIVE, se una regola era applicabile (partner, servizio, periodo,
 * giorno, fascia, raggio km) e la consegna non ne ha una, la si aggancia —
 * in ORDINE CRONOLOGICO e rispettando i carnet (dailyCount per giorno,
 * totalCount nel periodo, contando le già agganciate).
 * Anteprima di default; scrive con --applica (backup + log per riga).
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

const minuti = (h) => { if (!h) return null; const [a, b] = h.split(':').map(Number); return Number.isFinite(a) && Number.isFinite(b) ? a * 60 + b : null; };
const sovrappone = (a1, a2, b1, b2) => (a1 == null || a2 == null || b1 == null || b2 == null) ? true : (a1 < b2 && b1 < a2);
const vincoloGiorni = (days) => days && days.length === 7 && days.includes('1');
const giornoDi = (d) => d.toISOString().slice(0, 10);

const regole = await prisma.deliveryRule.findMany({ where: { active: true }, include: { partners: { select: { partnerId: true } } } });
const partnerConRegole = new Set(regole.flatMap((g) => g.partners.map((p) => p.partnerId)));

// Consumo attuale dei carnet: già agganciate per (regola, giorno) e totali.
const giaAgganciate = await prisma.delivery.findMany({
  where: { deliveryRuleId: { in: regole.map((g) => g.id) }, deletedAt: null },
  select: { deliveryRuleId: true, date: true },
});
const usoGiorno = new Map(); // ruleId|day -> n
const usoTotale = new Map(); // ruleId -> n (dentro il periodo della regola)
for (const d of giaAgganciate) {
  const g = regole.find((x) => x.id === d.deliveryRuleId);
  if (!g) continue;
  const k = g.id + '|' + giornoDi(d.date);
  usoGiorno.set(k, (usoGiorno.get(k) ?? 0) + 1);
  const dentro = (!g.periodStart || d.date >= g.periodStart) && (!g.periodEnd || d.date <= g.periodEnd);
  if (dentro) usoTotale.set(g.id, (usoTotale.get(g.id) ?? 0) + 1);
}

const senza = await prisma.delivery.findMany({
  where: { deliveryRuleId: null, deletedAt: null, invoiced: false, invoiceLines: { none: {} },
    status: { notIn: ['cancelled', 'not_accepted', 'invalidated'] },
    date: { gte: new Date('2026-08-01') }, partnerId: { in: [...partnerConRegole] } },
  select: { id: true, code: true, date: true, status: true, price: true, additionalPrice: true,
    partnerId: true, serviceTypeId: true, deliveryTimeFrom: true, deliveryTimeTo: true, distanceKm: true,
    partner: { select: { insegna: true } } },
  orderBy: [{ date: 'asc' }, { code: 'asc' }],
});

const daFare = [];
const saltate = [];
for (const c of senza) {
  const cand = regole.filter((g) => {
    if (!g.partners.some((x) => x.partnerId === c.partnerId)) return false;
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
  if (!cand.length) continue;
  // Fra le candidate, la prima col carnet ancora capiente.
  let scelta = null;
  for (const g of cand) {
    const k = g.id + '|' + giornoDi(c.date);
    if (g.dailyRule && g.dailyCount > 0 && (usoGiorno.get(k) ?? 0) >= g.dailyCount) continue;
    if (g.totalRule && g.totalCount > 0 && (usoTotale.get(g.id) ?? 0) >= g.totalCount) continue;
    scelta = g;
    usoGiorno.set(k, (usoGiorno.get(k) ?? 0) + 1);
    usoTotale.set(g.id, (usoTotale.get(g.id) ?? 0) + 1);
    break;
  }
  if (scelta) daFare.push({ c, g: scelta });
  else saltate.push({ c, g: cand[0] });
}

console.log(`Da agganciare: ${daFare.length} · saltate per carnet pieno: ${saltate.length}\n`);
for (const { c, g } of daFare) {
  const oggi = Math.max(0, (c.price ?? 0) + (c.additionalPrice ?? 0));
  const dopo = g.toBill === false ? 'NON FATT.' : Math.round(Math.max(0, oggi + (g.partnerBillingAdjustment ?? 0)) * 100) / 100;
  console.log(`  #${c.code} | ${giornoDi(c.date)} | ${c.status} | ${c.partner?.insegna} | ${g.name} (${g.partnerBillingAdjustment ?? 0}, paga ${g.toPay === false ? 'NO' : 'sì'}) | fattura ${oggi} → ${dopo}`);
}
for (const { c, g } of saltate) {
  console.log(`  ✋ #${c.code} | ${giornoDi(c.date)} | ${c.partner?.insegna} | ${g.name}: carnet pieno quel giorno — resta senza regola`);
}

if (!APPLICA) { console.log('\nANTEPRIMA: niente scritto. Rilanciare con --applica.'); await prisma.$disconnect(); process.exit(0); }

fs.writeFileSync('C:/Users/nicol/AppData/Local/Temp/claude/backup-agganci-regole-' + Date.now() + '.json',
  JSON.stringify(daFare.map(({ c, g }) => ({ id: c.id, code: c.code, deliveryRuleId_prima: null, regola: g.id })), null, 1));
let fatte = 0;
for (const { c, g } of daFare) {
  await prisma.delivery.update({ where: { id: c.id }, data: { deliveryRuleId: g.id,
    logs: { create: [{ type: 'legacy_update', message: `Regola «${g.name}» agganciata in bonifica (03/09, ordine utente): era applicabile ma il filtro giorni «0000000» la teneva spenta all'epoca della consegna.` }] } } });
  fatte++;
}
console.log(`\nFATTO: ${fatte} agganci scritti (backup salvato).`);
await prisma.$disconnect();
