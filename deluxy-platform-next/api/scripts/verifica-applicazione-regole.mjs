/**
 * VERIFICA APPLICAZIONE REGOLE (sola lettura, 03/09 su richiesta utente).
 *
 * A. Consegne AGGANCIATE a una regola carnet: la regola rispettava davvero
 *    tutte le sue condizioni? (partner, servizio, periodo, giorno, fascia,
 *    kmDistance, attiva)
 * B. CARNET SFORATI: giorni con più consegne agganciate del dailyCount;
 *    periodi oltre il totalCount.
 * C. Consegne VIVE senza regola dove una regola APPLICABILE esisteva
 *    (candidate all'aggancio mancato) — solo non fatturate.
 * D. REGOLE VALET: consegne assegnate a valet con regola attiva ma senza
 *    valetDeliveryRuleId (pre-fix: la paga usa comunque il ripiego).
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
// ⚠️ 03/09: il pooler in session mode (5432) può non rispondere — si passa
// dal transaction pooler (6543) come fa la produzione, cambiando solo schema.
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
u.searchParams.set('schema', 'platform');
process.env.DATABASE_URL = u.toString();
const prisma = new PrismaClient();
// La rete verso il pooler oggi singhiozza: qualche tentativo prima di mollare.
for (let t = 1; t <= 5; t++) {
  try { await prisma.$queryRaw`SELECT 1`; break; }
  catch (e) { if (t === 5) { console.error('DB irraggiungibile dopo 5 tentativi'); process.exit(1); } await new Promise((r) => setTimeout(r, 4000)); }
}

// «0000000» = filtro giorni SPENTO (misurato 03/09), non «nessun giorno».
const vincoloGiorni = (days) => days && days.length === 7 && days.includes('1');

const minuti = (hhmm) => {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
};
const sovrappone = (a1, a2, b1, b2) => (a1 == null || a2 == null || b1 == null || b2 == null) ? true : (a1 < b2 && b1 < a2);

const regole = await prisma.deliveryRule.findMany({ include: { partners: { select: { partnerId: true } } } });
const perId = new Map(regole.map((g) => [g.id, g]));
console.log(`Regole carnet: ${regole.length} (attive: ${regole.filter(g=>g.active).length})\n`);

// ---- A + B: le agganciate (2026, vive) rispettano le condizioni? ----
const agganciate = await prisma.delivery.findMany({
  where: { deliveryRuleId: { not: null }, deletedAt: null, date: { gte: new Date('2026-01-01') } },
  select: { code: true, date: true, status: true, partnerId: true, serviceTypeId: true,
    deliveryTimeFrom: true, deliveryTimeTo: true, distanceKm: true, deliveryRuleId: true, invoiced: true,
    invoiceLines: { select: { id: true } } },
  orderBy: { date: 'asc' },
});
console.log(`A) consegne 2026 agganciate a una regola: ${agganciate.length}`);
let violazioni = 0;
const perGiorno = new Map(); // ruleId|day -> [codes]
for (const c of agganciate) {
  const g = perId.get(c.deliveryRuleId);
  const errori = [];
  if (!g) { errori.push('regola INESISTENTE'); }
  else {
    if (!g.active) errori.push('regola SPENTA');
    if (!g.partners.some((p) => p.partnerId === c.partnerId)) errori.push('partner NON in regola');
    if (g.serviceTypeId && g.serviceTypeId !== c.serviceTypeId) errori.push('servizio diverso');
    if (g.periodStart && c.date < g.periodStart) errori.push('prima del periodo');
    if (g.periodEnd && c.date > g.periodEnd) errori.push('dopo il periodo');
    if (vincoloGiorni(g.days) && g.days[c.date.getUTCDay()] !== '1') errori.push('giorno escluso');
    const rf = minuti(g.timeFrom), rt = minuti(g.timeTo);
    if (rf != null && rt != null && !(rf === 0 && rt >= 1439)
      && !sovrappone(minuti(c.deliveryTimeFrom), minuti(c.deliveryTimeTo), rf, rt)) errori.push(`fascia fuori (${c.deliveryTimeFrom ?? '—'}–${c.deliveryTimeTo ?? '—'} vs ${g.timeFrom}–${g.timeTo})`);
    if ((g.kmDistance ?? 0) > 0 && c.distanceKm != null && c.distanceKm > g.kmDistance) errori.push(`oltre il raggio (${c.distanceKm} km > ${g.kmDistance})`);
    if (g.dailyRule && g.dailyCount > 0) {
      const k = g.id + '|' + c.date.toISOString().slice(0, 10);
      const arr = perGiorno.get(k) ?? []; arr.push(c.code); perGiorno.set(k, arr);
    }
  }
  if (errori.length) {
    violazioni++;
    console.log(`   ⚠️ #${c.code} ${c.date.toISOString().slice(0,10)} ${c.status}${c.invoiceLines.length ? ' FATTURATA' : ''} · ${g?.name ?? c.deliveryRuleId} → ${errori.join(' · ')}`);
  }
}
console.log(`   violazioni statiche: ${violazioni}\n`);

console.log('B) carnet giornalieri SFORATI:');
let sforati = 0;
for (const [k, codes] of perGiorno) {
  const [rid, giorno] = k.split('|');
  const g = perId.get(rid);
  if (codes.length > g.dailyCount) {
    sforati++;
    console.log(`   ⚠️ ${g.name} · ${giorno}: ${codes.length} agganciate su ${g.dailyCount} (${codes.join(', ')})`);
  }
}
if (!sforati) console.log('   nessuno');
for (const g of regole.filter((x) => x.totalRule && x.totalCount > 0)) {
  const usate = await prisma.delivery.count({ where: { deliveryRuleId: g.id, deletedAt: null,
    ...(g.periodStart || g.periodEnd ? { date: { ...(g.periodStart ? { gte: g.periodStart } : {}), ...(g.periodEnd ? { lte: g.periodEnd } : {}) } } : {}) } });
  if (usate > g.totalCount) console.log(`   ⚠️ ${g.name}: TOTALE ${usate} su ${g.totalCount}`);
}
console.log('');

// ---- C: vive non fatturate SENZA regola dove una si applicherebbe ----
const attive = regole.filter((g) => g.active);
const partnerConRegole = new Set(attive.flatMap((g) => g.partners.map((p) => p.partnerId)));
const senza = await prisma.delivery.findMany({
  where: { deliveryRuleId: null, deletedAt: null, invoiced: false, invoiceLines: { none: {} },
    status: { notIn: ['cancelled', 'not_accepted', 'invalidated'] },
    date: { gte: new Date('2026-08-01') }, partnerId: { in: [...partnerConRegole] } },
  select: { code: true, date: true, status: true, partnerId: true, serviceTypeId: true,
    deliveryTimeFrom: true, deliveryTimeTo: true, distanceKm: true,
    partner: { select: { insegna: true } } },
  orderBy: { date: 'asc' },
});
console.log(`C) vive non fatturate (da agosto) di partner CON regole ma SENZA aggancio: ${senza.length}`);
for (const c of senza) {
  const candidate = attive.filter((g) => {
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
  });
  if (candidate.length) {
    console.log(`   ⚠️ #${c.code} ${c.date.toISOString().slice(0,10)} ${c.status} · ${c.partner?.insegna} · fascia ${c.deliveryTimeFrom ?? '—'}–${c.deliveryTimeTo ?? '—'} → applicabile: ${candidate.map((g) => g.name).join(' / ')}`);
  }
}
console.log('');

// ---- D: regole valet non agganciate (paga usa il ripiego, ma il dato tace) ----
const conRegolaValet = await prisma.valetDeliveryRuleValet.findMany({
  where: { valetDeliveryRule: { active: true } },
  select: { valetId: true, valetDeliveryRuleId: true },
});
const valetIds = [...new Set(conRegolaValet.map((x) => x.valetId))];
const nonAgganciate = await prisma.delivery.count({
  where: { valetId: { in: valetIds }, valetDeliveryRuleId: null, deletedAt: null,
    date: { gte: new Date('2026-08-01') } },
});
console.log(`D) consegne (da agosto) di valet CON regola attiva ma senza aggancio sulla riga: ${nonAgganciate}`);
console.log('   (la paga la applica comunque col ripiego; le NUOVE assegnazioni ora scrivono l\'aggancio)');
await prisma.$disconnect();
