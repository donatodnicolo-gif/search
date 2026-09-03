/**
 * APPLICA (03/09) gli agganci di regola alle NON CONSEGNATE fatturabili del
 * pregresso: entrano in fattura per decisione utente e senza la regola
 * uscirebbero a prezzo pieno. Stessa logica di applica-agganci-regole
 * (tutte le condizioni + carnet), perimetro: status not_delivered,
 * billable, non fatturate. Anteprima; scrive con --applica.
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
const usoGiorno = new Map();
const usoTotale = new Map();
for (const d of await prisma.delivery.findMany({ where: { deliveryRuleId: { in: regole.map((g) => g.id) }, deletedAt: null }, select: { deliveryRuleId: true, date: true } })) {
  const g = regole.find((x) => x.id === d.deliveryRuleId);
  if (!g) continue;
  usoGiorno.set(g.id + '|' + giornoDi(d.date), (usoGiorno.get(g.id + '|' + giornoDi(d.date)) ?? 0) + 1);
  const dentro = (!g.periodStart || d.date >= g.periodStart) && (!g.periodEnd || d.date <= g.periodEnd);
  if (dentro) usoTotale.set(g.id, (usoTotale.get(g.id) ?? 0) + 1);
}

const rows = await prisma.delivery.findMany({
  where: { deletedAt: null, status: 'not_delivered', billable: true, invoiced: false, deliveryRuleId: null,
    invoiceLines: { none: {} }, partner: { deleted: false } },
  select: { id: true, code: true, date: true, price: true, additionalPrice: true, partnerId: true, serviceTypeId: true,
    deliveryTimeFrom: true, deliveryTimeTo: true, distanceKm: true, partner: { select: { insegna: true } } },
  orderBy: [{ date: 'asc' }, { code: 'asc' }],
});
const daFare = [];
for (const c of rows) {
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
}
console.log('Non consegnate da agganciare:', daFare.length);
const perRegola = new Map();
for (const { g } of daFare) perRegola.set(g.name, (perRegola.get(g.name) ?? 0) + 1);
for (const [k, n] of perRegola) console.log('  ', k, ':', n);
if (!APPLICA) { console.log('ANTEPRIMA: niente scritto. Rilanciare con --applica.'); await prisma.$disconnect(); process.exit(0); }
fs.writeFileSync('C:/Users/nicol/AppData/Local/Temp/claude/backup-agganci-nonconsegnate-' + Date.now() + '.json',
  JSON.stringify(daFare.map(({ c, g }) => ({ id: c.id, code: c.code, regola: g.id })), null, 1));
for (const { c, g } of daFare) {
  await prisma.delivery.update({ where: { id: c.id }, data: { deliveryRuleId: g.id,
    logs: { create: [{ type: 'legacy_update', message: `Regola «${g.name}» agganciata (03/09): la consegna entra in fattura per la nuova regola sulle non consegnate, e la regola era applicabile.` }] } } });
}
console.log('FATTO:', daFare.length, 'agganci scritti (backup salvato).');
await prisma.$disconnect();
