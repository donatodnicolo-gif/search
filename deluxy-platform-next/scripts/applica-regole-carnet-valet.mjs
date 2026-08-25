// ============================================================
// Applica allo storico le REGOLE CARNET dei valet
// ------------------------------------------------------------
// Deciso dall'utente il 25/08/2026: «vanno applicate le regole nel caso la
// vendita (identificata con ddt) sia la stessa».
//
// LA REGOLA. Quando un valet fa piu' consegne dello STESSO giro, il giro si
// paga una volta: la prima consegna porta la tariffa piena, le altre prendono
// solo il PLUS dello scaglione (`ValetDeliveryRule.tiers`). «Regola valet 1»:
// 2 ritiri +3 €, piu' di 2 +4 €. «Regola valet 4»: piu' di 1 ritiro +0 €, cioe'
// le altre non si pagano affatto.
//
// ⭐ LA CHIAVE E' IL DDT, non l'id ordine. Il numero di documento di trasporto
// identifica la vendita, e su una vendita di consegne ce ne possono essere
// diverse. Raggruppare per `legacyOrderId` sarebbe sbagliato in due modi: quel
// campo vale **0 su 10.272 consegne** (il segnaposto di chi un ordine non ce
// l'ha, che le metterebbe tutte nello stesso mucchio) e non c'e' su tutte.
//
// ⚠️ E il gruppo comprende anche lo STESSO VALET e lo STESSO GIORNO.
//  - due valet diversi sulla stessa vendita fanno due giri, e si pagano tutti e
//    due: il carnet sconta il secondo ritiro di chi era gia' li', non il lavoro
//    di un'altra persona;
//  - e uno stesso DDT puo' avere consegne in giorni diversi. Il DDT 5612 ne ha
//    il 10, il 20 e il 21 settembre: sono tre uscite, non un giro. Senza il
//    giorno nella chiave, due trasferte separate sarebbero state trattate come
//    una sola e pagate una volta.
//
// ⚠️ E LA PAGA DEL GIRO LA PORTA LA CONSEGNA PIU' PAGATA, non la prima per
// numero. Sul DDT 7222 la prima e' pagata **−0,19 €** e la seconda 70,01: tenere
// la prima avrebbe pagato una trasferta a Dumenza dieci euro in tutto. La
// consegna piu' pagata e' quella che porta il viaggio; le altre sono i ritiri in
// piu' fatti mentre si era gia' in strada.
//
// ⚠️ SI CORREGGE SOLO IN GIU'. Dove la paga di adesso e' gia' pari o inferiore
// al plus, si lascia stare: qualcuno ha deciso cosi' e alzarla sarebbe
// inventare un aumento.
//
// Misurato prima di scrivere: 489 giri con piu' di una consegna pagata,
// 4.861,27 € pagati contro 1.577,70 € dovuti — 3.283,57 € di differenza.
//
// PROVA A VUOTO DI DEFAULT. Si applica con --scrivi, si torna indietro con
// --disfa=<file>.
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

const argomenti = process.argv.slice(2);
const SCRIVI = argomenti.includes('--scrivi');
const DISFA = (argomenti.find((a) => a.startsWith('--disfa=')) ?? '').slice('--disfa='.length);

const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
process.env.DATABASE_URL =
  `postgresql://${u.username}:${u.password}@${u.hostname}:6543/postgres?schema=platform&pgbouncer=true&connection_limit=1`;
const db = new PrismaClient();
const eu = (n) => n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const r2 = (x) => Math.round(x * 100) / 100;

/** Il plus dello scaglione per un giro di `quante` consegne. */
function plusDaScaglioni(tiersJson, quante) {
  let plus = null;
  try {
    for (const t of JSON.parse(tiersJson ?? '[]')) {
      const n = Number(t.pickUps), p = Number(t.plusSalary);
      if (!Number.isFinite(n) || !Number.isFinite(p)) continue;
      if (t.operator === 'equal' && quante === n) plus = p;
      if (t.operator === 'moreThan' && quante > n && plus === null) plus = p;
    }
  } catch { /* scaglioni illeggibili: si lascia null e la riga si salta */ }
  return plus;
}

try {
  if (DISFA) {
    const backup = JSON.parse(fs.readFileSync(DISFA, 'utf8'));
    console.log(`disfo ${backup.length} consegne da ${DISFA}`);
    if (!SCRIVI) { console.log('prova a vuoto: aggiungi --scrivi'); process.exit(0); }
    for (const b of backup) {
      await db.delivery.update({ where: { id: b.id },
        data: { valetSalary: b.valetSalary, valetAdditionalPrice: b.valetAdditionalPrice,
          valetDeliveryRuleId: b.valetDeliveryRuleId } });
    }
    console.log('rimesse come prima.'); process.exit(0);
  }

  const regole = await db.valetDeliveryRule.findMany({
    where: { active: true }, include: { valets: { select: { valetId: true } } },
  });
  const perValet = new Map();
  for (const r of regole) for (const v of r.valets) if (!perValet.has(v.valetId)) perValet.set(v.valetId, r);
  console.log(`regole carnet attive: ${regole.length} — valet coperti: ${perValet.size}`);

  const consegne = await db.delivery.findMany({
    where: { deletedAt: null, status: { not: 'cancelled' }, ddtNumber: { not: null }, valetId: { not: null } },
    select: { id: true, code: true, date: true, ddtNumber: true, valetId: true, payable: true,
      valetSalary: true, valetAdditionalPrice: true, valetDeliveryRuleId: true,
      valet: { select: { firstName: true, lastName: true } } },
  });
  console.log(`consegne con DDT e valet: ${consegne.length}`);

  // ⚠️ Zero e vuoto non sono un DDT: sono segnaposto.
  const giri = new Map();
  for (const x of consegne) {
    const ddt = String(x.ddtNumber).trim();
    if (!ddt || ddt === '0') continue;
    const giorno = x.date.toISOString().slice(0, 10);
    const k = `${ddt}|${x.valetId}|${giorno}`;
    if (!giri.has(k)) giri.set(k, []);
    giri.get(k).push(x);
  }

  const lavori = [];
  let senzaRegola = 0, senzaScaglione = 0, giriToccati = 0;
  for (const [k, g] of giri) {
    if (g.length < 2) continue;
    const [ddt, valetId, giorno] = k.split('|');
    const regola = perValet.get(valetId);
    if (!regola) { senzaRegola++; continue; }
    const plus = plusDaScaglioni(regola.tiers, g.length);
    if (plus === null) { senzaScaglione++; continue; }

    const paga = (x) => r2((x.valetSalary ?? 0) + (x.valetAdditionalPrice ?? 0));
    // La piu' pagata porta il viaggio; le altre sono i ritiri in piu'.
    const ordinate = [...g].sort((a, b) => paga(b) - paga(a) || a.code - b.code);
    const pagate = ordinate.filter((x) => x.payable && paga(x) > 0);
    // Se ne risulta pagata al massimo una, la regola e' gia' rispettata.
    if (pagate.length < 2) continue;
    giriToccati++;

    for (const x of ordinate.slice(1)) {
      if (!x.payable) continue;
      const ora = paga(x);
      if (ora <= plus) continue;           // solo in giu'
      lavori.push({ id: x.id, code: x.code, ddt, giorno, quante: g.length,
        valet: `${x.valet?.firstName} ${x.valet?.lastName}`,
        regola: regola.name, regolaId: regola.id, ora, plus: r2(plus),
        backup: { id: x.id, valetSalary: x.valetSalary, valetAdditionalPrice: x.valetAdditionalPrice,
          valetDeliveryRuleId: x.valetDeliveryRuleId } });
    }
  }

  console.log(`\ngiri (stesso DDT, stesso valet) con piu' di una consegna pagata: ${giriToccati}`);
  console.log(`  consegne da riportare al plus: ${lavori.length}`);
  console.log(`  pagato ora ${eu(lavori.reduce((s, l) => s + l.ora, 0))} → dovuto ${eu(lavori.reduce((s, l) => s + l.plus, 0))}`);
  console.log(`  differenza ${eu(lavori.reduce((s, l) => s + l.plus - l.ora, 0))}`);
  console.log(`  giri saltati: valet senza regola ${senzaRegola} · nessuno scaglione applicabile ${senzaScaglione}`);

  const perRegola = {};
  for (const l of lavori) (perRegola[l.regola] ??= []).push(l);
  console.log('\n  per regola:');
  for (const [r, g] of Object.entries(perRegola).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`    ${r.padEnd(18)} ${String(g.length).padStart(5)} consegne  ${eu(g.reduce((s, l) => s + l.ora - l.plus, 0)).padStart(12)} in meno`);
  }
  console.log('\n  le 10 piu' + ' grosse:');
  for (const l of [...lavori].sort((a, b) => (b.ora - b.plus) - (a.ora - a.plus)).slice(0, 10)) {
    console.log(`    DDT ${String(l.ddt).padEnd(8)} #${String(l.code).padEnd(6)} ${l.quante} consegne · ${eu(l.ora)} → ${eu(l.plus)} · ${l.valet} («${l.regola}»)`);
  }

  if (!SCRIVI) { console.log('\nPROVA A VUOTO — non ho scritto niente. Rilancia con --scrivi.'); process.exit(0); }

  const nomeBackup = path.join(process.cwd(), 'scripts', 'backup-regole-carnet.json');
  fs.writeFileSync(nomeBackup, JSON.stringify(lavori.map((l) => l.backup), null, 1));
  console.log(`\nbackup: ${nomeBackup}`);

  let fatte = 0;
  for (const l of lavori) {
    await db.$transaction([
      db.delivery.update({ where: { id: l.id },
        data: { valetSalary: l.plus, valetAdditionalPrice: 0, valetDeliveryRuleId: l.regolaId } }),
      db.deliveryLog.create({ data: { deliveryId: l.id, type: 'regola-carnet-applicata',
        message: `Paga ${l.ora} € → ${l.plus} €, per «${l.regola}»: sul DDT ${l.ddt} il ${l.giorno} questo valet ha ${l.quante} consegne, `
          + `e il giro si paga una volta sola — la consegna piu' pagata porta il viaggio, le altre prendono il plus dello scaglione. `
          + `La regola era in tabella dal 20/07/2026 e non era mai stata applicata allo storico.` } }),
    ]);
    if (++fatte % 100 === 0) console.log(`  ${fatte}/${lavori.length}`);
  }
  console.log(`\nfatto: ${fatte} consegne riportate al plus, ognuna con la sua riga nel registro.`);
} finally {
  await db.$disconnect();
}
