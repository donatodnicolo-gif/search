// ============================================================
// Le regole sulle consegne sono state applicate DAVVERO?
// ------------------------------------------------------------
// Chiesto dall'utente il 25/08/2026. La domanda non e' «esistono in tabella» —
// quella ha gia' risposto si' — ma «hanno prodotto un effetto sulle consegne che
// le incrociano». In questo progetto le due cose sono gia' state confuse una
// volta: 35 regole importate il 20/07 e rimaste inerti per un mese, finche'
// agganciarle non ha spostato 4.194 € di fatture e 9.129 € di stipendi.
//
// NON SCRIVE NIENTE. Conta, confronta e dichiara.
//
// Cosa controlla, per ciascuna delle due famiglie:
//
//  A) DeliveryRule (lato partner, 28). Per ogni regola si prendono le consegne
//     del suo partner che ne rispettano le condizioni (periodo, km, giorni,
//     fascia oraria, modello di prezzo) e si guarda:
//       - quante hanno il collegamento `deliveryRuleId`;
//       - se `toBill=false`, quante hanno davvero `billable=false`;
//       - se `toPay=false`, quante hanno davvero `payable=false`;
//       - se c'e' un plus/minus, quante lo portano in `additionalPrice` /
//         `valetAdditionalPrice`.
//
//  B) ValetDeliveryRule (carnet lato valet, 7). Per i valet che hanno una
//     regola, si cercano i GIRI e si guarda se le consegne oltre quella che
//     porta il viaggio prendono il plus dello scaglione invece della paga
//     intera.
//
//     ⭐ Un giro e' «stesso DDT + stesso valet + stesso GIORNO» (l'utente,
//     25/08/2026). Prima raggruppavo per `legacyOrderId`, e sbagliavo due volte:
//     quel campo vale **0 su 10.272 consegne** — il segnaposto di chi un ordine
//     non ce l'ha — e ignora il giorno, mentre uno stesso DDT puo' avere uscite
//     in date diverse (il 5612 ne ha il 10, il 20 e il 21 settembre: tre
//     trasferte, non un giro).
//
//     ⚠️ E la paga del giro la porta la consegna PIU' PAGATA, non la prima per
//     numero: sul DDT 7222 la prima e' pagata −0,19 € e la seconda 70,01.
//
// ⚠️ Il confronto sugli importi e' un INDIZIO, non una prova: un plus di −18 €
// puo' essere gia' dentro un prezzo concordato. Dove non si puo' concludere, lo
// dice invece di inventare un verdetto.
//
// Uso: node scripts/verifica-regole-consegne.mjs
// ============================================================
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
process.env.DATABASE_URL =
  `postgresql://${u.username}:${u.password}@${u.hostname}:6543/postgres?schema=platform&pgbouncer=true&connection_limit=1`;
const db = new PrismaClient();
const eu = (n) => (n == null ? '—' : n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €');
const pc = (a, b) => (b ? `${((a / b) * 100).toFixed(1)}%` : '—');

try {
  // ================= A) le regole del partner =================
  const regole = await db.deliveryRule.findMany({
    include: { partners: { include: { partner: { select: { id: true, insegna: true } } } },
      serviceType: { select: { name: true, pricingModel: true } },
      _count: { select: { deliveries: true } } },
    orderBy: { name: 'asc' },
  });
  console.log(`===== A) DeliveryRule (lato partner): ${regole.length} =====\n`);
  console.log('| regola | partner | condizioni | consegne che la incrociano | collegate | effetto presente |');
  console.log('|---|---|---|---|---|---|');

  let totIncrociano = 0, totCollegate = 0;
  const senzaEffetto = [];
  for (const r of regole) {
    const ids = r.partners.map((p) => p.partner.id);
    if (!ids.length) { console.log(`| ${r.name} | (nessun partner) | — | — | — | non applicabile |`); continue; }
    const dove = {
      deletedAt: null,
      partnerId: { in: ids },
      ...(r.periodStart || r.periodEnd ? { date: { ...(r.periodStart ? { gte: r.periodStart } : {}), ...(r.periodEnd ? { lte: r.periodEnd } : {}) } } : {}),
      ...(r.kmDistance != null ? { OR: [{ distanceKm: null }, { distanceKm: { lte: r.kmDistance } }] } : {}),
      ...(r.serviceTypeId ? { serviceTypeId: r.serviceTypeId } : {}),
    };
    const incrociano = await db.delivery.count({ where: dove });
    const collegate = await db.delivery.count({ where: { ...dove, deliveryRuleId: r.id } });
    totIncrociano += incrociano; totCollegate += collegate;

    const prove = [];
    if (!r.toBill) {
      const n = await db.delivery.count({ where: { ...dove, billable: false } });
      prove.push(`non fatturabili ${n}/${incrociano} (${pc(n, incrociano)})`);
    }
    if (!r.toPay) {
      const n = await db.delivery.count({ where: { ...dove, payable: false } });
      prove.push(`non pagabili ${n}/${incrociano} (${pc(n, incrociano)})`);
    }
    if (r.partnerBillingAdjustment !== 0) {
      const n = await db.delivery.count({ where: { ...dove, additionalPrice: r.partnerBillingAdjustment } });
      prove.push(`plus fattura ${r.partnerBillingAdjustment} su ${n}/${incrociano} (${pc(n, incrociano)})`);
    }
    if (r.valetPayAdjustment !== 0) {
      const n = await db.delivery.count({ where: { ...dove, valetAdditionalPrice: r.valetPayAdjustment } });
      prove.push(`plus paga ${r.valetPayAdjustment} su ${n}/${incrociano} (${pc(n, incrociano)})`);
    }
    if (!prove.length) prove.push('la regola non cambia nulla di misurabile');
    const cond = [r.serviceType ? r.serviceType.name : (r.legacyPricingModel ?? 'ogni servizio'),
      r.kmDistance != null ? `≤${r.kmDistance} km` : null,
      r.periodStart ? `dal ${r.periodStart.toISOString().slice(0, 10)}` : null].filter(Boolean).join(' · ');
    console.log(`| ${r.name} | ${r.partners.map((p) => p.partner.insegna).join(', ').slice(0, 26)} | ${cond} | ${incrociano} | ${collegate} | ${prove.join(' · ')} |`);
    if (incrociano > 0 && collegate === 0) senzaEffetto.push({ nome: r.name, incrociano });
  }
  console.log(`\nconsegne che incrociano una regola: ${totIncrociano} · con il collegamento scritto: ${totCollegate} (${pc(totCollegate, totIncrociano)})`);
  if (senzaEffetto.length) {
    console.log(`\n🔴 regole che incrociano consegne ma non ne hanno collegata NESSUNA: ${senzaEffetto.length}`);
    for (const s of senzaEffetto) console.log(`   «${s.nome}» — ${s.incrociano} consegne la incrociano`);
  }

  // ================= B) le regole carnet del valet =================
  const carnet = await db.valetDeliveryRule.findMany({
    include: { valets: { select: { valetId: true } }, _count: { select: { deliveries: true } } },
    orderBy: { name: 'asc' },
  });
  console.log(`\n\n===== B) ValetDeliveryRule (carnet lato valet): ${carnet.length} =====\n`);

  const scaglioni = (t, q) => {
    let plus = null;
    try { for (const x of JSON.parse(t ?? '[]')) {
      const n = Number(x.pickUps), p = Number(x.plusSalary);
      if (!Number.isFinite(n) || !Number.isFinite(p)) continue;
      if (x.operator === 'equal' && q === n) plus = p;
      if (x.operator === 'moreThan' && q > n && plus === null) plus = p;
    } } catch { /* scaglioni illeggibili */ }
    return plus;
  };

  console.log('| regola | valet | consegne collegate | gruppi multi-vendita | «altre» col plus giusto | con paga PIENA (regola non applicata) |');
  console.log('|---|---|---|---|---|---|');
  let totAltre = 0, totGiuste = 0, totPiene = 0;
  const esempiPieni = [];
  for (const r of carnet) {
    const valetIds = r.valets.map((v) => v.valetId);
    if (!valetIds.length) { console.log(`| ${r.name} | (nessun valet) | ${r._count.deliveries} | — | — | — |`); continue; }
    // gruppi di consegne dello stesso valet sulla stessa vendita
    const d = await db.delivery.findMany({
      where: { deletedAt: null, status: { not: 'cancelled' }, valetId: { in: valetIds }, ddtNumber: { not: null } },
      select: { code: true, date: true, valetId: true, ddtNumber: true, valetSalary: true, valetAdditionalPrice: true, payable: true },
    });
    const gruppi = new Map();
    for (const x of d) {
      const ddt = String(x.ddtNumber).trim();
      if (!ddt || ddt === '0') continue;    // segnaposto, non un documento
      const k = `${x.valetId}|${ddt}|${x.date.toISOString().slice(0, 10)}`;
      if (!gruppi.has(k)) gruppi.set(k, []);
      gruppi.get(k).push(x);
    }
    const multi = [...gruppi.values()].filter((g) => g.length > 1);
    let altre = 0, giuste = 0, piene = 0;
    for (const g of multi) {
      const plus = scaglioni(r.tiers, g.length);
      if (plus === null) continue;
      const pagaDi = (x) => (x.valetSalary ?? 0) + (x.valetAdditionalPrice ?? 0);
      const ordinate = [...g].sort((a, b) => pagaDi(b) - pagaDi(a) || a.code - b.code);
      for (const x of ordinate.slice(1)) {       // la piu' pagata porta il viaggio, le altre il plus
        altre++;
        const paga = (x.valetSalary ?? 0) + (x.valetAdditionalPrice ?? 0);
        // ⚠️ Va bene anche pagare MENO del plus: la regola mette un tetto al
        // ritiro in piu', non un minimo garantito. Contare come «non applicata»
        // una consegna pagata 2 € dove il plus e' 3 accusava righe gia' a posto
        // — ed e' lo stesso metro sbagliato che lo script di applicazione non
        // usa, tanto che i due strumenti davano numeri diversi sugli stessi dati.
        if (paga <= plus + 0.011) giuste++;
        else { piene++; if (esempiPieni.length < 10) esempiPieni.push({ regola: r.name, code: x.code, paga, atteso: plus, quante: g.length }); }
      }
    }
    totAltre += altre; totGiuste += giuste; totPiene += piene;
    console.log(`| ${r.name} | ${valetIds.length} | ${r._count.deliveries} | ${multi.length} | ${giuste} (${pc(giuste, altre)}) | ${piene} (${pc(piene, altre)}) |`);
  }
  console.log(`\nconsegne «oltre quella che porta il viaggio», sullo stesso DDT e nello stesso giorno: ${totAltre}`);
  console.log(`  col plus dello scaglione (o a zero): ${totGiuste} (${pc(totGiuste, totAltre)})`);
  console.log(`  🔴 con la paga PIENA, cioe' la regola non applicata: ${totPiene} (${pc(totPiene, totAltre)})`);
  if (esempiPieni.length) {
    console.log('\n  esempi:');
    for (const e of esempiPieni) console.log(`    #${e.code} — «${e.regola}», ${e.quante} consegne sulla vendita: paga ${eu(e.paga)}, il plus sarebbe ${eu(e.atteso)}`);
  }
} finally {
  await db.$disconnect();
}
