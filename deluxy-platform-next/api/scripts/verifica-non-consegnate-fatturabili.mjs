/**
 * SOLA LETTURA (03/09): le NON CONSEGNATE che ora entrano nel da-fatturare
 * (decisione utente) — con verifica dell'APPLICAZIONE REGOLE su ognuna:
 * regola agganciata? applicabile ma mancante (rispettando il carnet del
 * giorno)? Scrive la tabella completa in un file .md e stampa il riepilogo.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
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
const r2 = (n) => Math.round(n * 100) / 100;
const minuti = (h) => { if (!h) return null; const [a, b] = h.split(':').map(Number); return Number.isFinite(a) && Number.isFinite(b) ? a * 60 + b : null; };
const sovrappone = (a1, a2, b1, b2) => (a1 == null || a2 == null || b1 == null || b2 == null) ? true : (a1 < b2 && b1 < a2);
const vincoloGiorni = (days) => days && days.length === 7 && days.includes('1');
const giornoDi = (d) => d.toISOString().slice(0, 10);

const regole = await prisma.deliveryRule.findMany({ where: { active: true }, include: { partners: { select: { partnerId: true } } } });
const usoGiorno = new Map();
for (const d of await prisma.delivery.findMany({ where: { deliveryRuleId: { in: regole.map((g) => g.id) }, deletedAt: null }, select: { deliveryRuleId: true, date: true } })) {
  const k = d.deliveryRuleId + '|' + giornoDi(d.date);
  usoGiorno.set(k, (usoGiorno.get(k) ?? 0) + 1);
}

const rows = await prisma.delivery.findMany({
  where: { deletedAt: null, status: 'not_delivered', billable: true, invoiced: false,
    invoiceLines: { none: {} }, partner: { deleted: false } },
  select: { code: true, date: true, price: true, additionalPrice: true, partnerId: true, serviceTypeId: true,
    deliveryTimeFrom: true, deliveryTimeTo: true, distanceKm: true, recipientAddress: true,
    partner: { select: { insegna: true } }, serviceType: { select: { name: true } },
    deliveryRule: { select: { name: true, partnerBillingAdjustment: true, toBill: true } } },
  orderBy: [{ date: 'asc' }, { code: 'asc' }],
});

const perPartner = new Map();
const md = ['# Non consegnate che entrano nel da-fatturare (decisione 03/09)', '',
  '| # | Data | Partner | Servizio | Prezzo | Plus | Regola | In fattura | Verifica regole |',
  '|---|---|---|---|---|---|---|---|---|'];
let conRegola = 0, applicabiliMancanti = 0, carnetPieno = 0, euroTot = 0;
const mancantiElenco = [];
for (const c of rows) {
  let verdetto = 'nessuna regola applicabile ✓';
  if (c.deliveryRule) { conRegola++; verdetto = 'agganciata ✓'; }
  else {
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
    });
    if (cand.length) {
      const g = cand[0];
      const k = g.id + '|' + giornoDi(c.date);
      if (g.dailyRule && g.dailyCount > 0 && (usoGiorno.get(k) ?? 0) >= g.dailyCount) {
        carnetPieno++;
        verdetto = `applicabile (${g.name}) ma carnet del giorno PIENO → resta piena ✓`;
      } else {
        applicabiliMancanti++;
        verdetto = `⚠️ MANCA l'aggancio: ${g.name} applicabile (carnet capiente)`;
        mancantiElenco.push({ c, g });
      }
    }
  }
  const fattura = c.deliveryRule?.toBill === false ? 0
    : r2(Math.max(0, (c.price ?? 0) + (c.additionalPrice ?? 0) + (c.deliveryRule?.partnerBillingAdjustment ?? 0)));
  euroTot += fattura;
  const k = c.partner?.insegna ?? '?';
  const g = perPartner.get(k) ?? { n: 0, euro: 0 };
  g.n++; g.euro += fattura; perPartner.set(k, g);
  md.push('| ' + [c.code, giornoDi(c.date), k, (c.serviceType?.name ?? '—'), (c.price ?? '—'),
    (c.additionalPrice ?? '—'), (c.deliveryRule ? c.deliveryRule.name + ' (' + (c.deliveryRule.partnerBillingAdjustment ?? 0) + ')' : '—'),
    fattura, verdetto].join(' | ') + ' |');
}
fs.writeFileSync('C:/Users/nicol/AppData/Local/Temp/claude/tabella-non-consegnate-fatturabili.md', md.join('\n'));

console.log('Totale non consegnate fatturabili:', rows.length, '· € in fattura (stato attuale, doppioni compresi):', r2(euroTot));
console.log('Verifica regole: agganciata su', conRegola, '· applicabile ma MANCANTE:', applicabiliMancanti, '· applicabile ma carnet pieno (giusto così):', carnetPieno);
console.log('\nPER PARTNER (n · €):');
for (const [k, g] of [...perPartner.entries()].sort((a, b) => b[1].euro - a[1].euro).slice(0, 15)) console.log('  ', k, '|', g.n, '|', r2(g.euro));
if (mancantiElenco.length) {
  console.log('\nAGGANCI MANCANTI (carnet capiente):');
  for (const { c, g } of mancantiElenco) console.log('  #' + c.code, giornoDi(c.date), '·', c.partner?.insegna, '→', g.name);
}
await prisma.$disconnect();
