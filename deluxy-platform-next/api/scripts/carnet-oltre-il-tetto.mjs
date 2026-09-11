/**
 * IL CARNET OLTRE IL TETTO (11/09/2026, richiesta utente: «sistema tutto»).
 *
 *   node api/scripts/carnet-oltre-il-tetto.mjs            (anteprima: non scrive niente)
 *   node api/scripts/carnet-oltre-il-tetto.mjs --applica
 *
 * IL FATTO. Una regola carnet con «Regola giornaliera N» vale per le PRIME N consegne di quel giorno.
 * Il codice della piattaforma lo rispetta — prima di agganciare conta quelle già agganciate — e lo
 * rispetta anche lo script che ha recuperato gli agganci vecchi. Ma le consegne IMPORTATE dal sistema
 * precedente si sono portate dietro l'aggancio così com'era, senza che nessuno contasse: sulla sola
 * «Regola 10 · prezzo fisso» ci sono 52 giorni su 515 con più consegne del tetto, fino a undici in un
 * giorno contro un tetto di quattro.
 *
 * Non è un difetto estetico: oltre la quarta consegna la regola toglie comunque 25 € al partner e mette
 * la consegna a «non pagare», cioè toglie al valet una paga che ha guadagnato.
 *
 * COSA FA. Per ogni regola attiva con un tetto (giornaliero o totale di periodo) tiene l'aggancio sulle
 * PRIME N consegne in ordine di creazione e lo toglie dalle altre. Togliere l'aggancio vuol dire:
 *   · `deliveryRuleId` a vuoto e `ruleAdjustment` a 0 (il plus/minus veniva dalla regola);
 *   · `payable`/`billable` rimessi a «sì» SOLO se la regola li aveva messi a «no» — se erano stati
 *     spenti per un'altra ragione restano spenti, perché non è questo script a doverlo decidere.
 *
 * ⚠️⚠️ NON TOCCA CIÒ CHE È GIÀ STATO PAGATO O FATTURATO. Una consegna già fatturata al partner, o già
 * entrata in uno stipendio, porta numeri che stanno su un documento consegnato a qualcuno: cambiarli
 * qui non li cambia là, crea solo due verità diverse. Quelle righe si elencano a parte, per decidere a
 * mano.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';

const APPLICA = process.argv.includes('--applica');
const RADICE = 'C:/Users/nicol/app/.claude/worktrees/deploy-delivery/deluxy-platform-next/';
const require = createRequire(RADICE + 'api/package.json');
const { PrismaClient } = require('@prisma/client');
const riga = fs.readFileSync(RADICE + 'api/.env', 'utf8').split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
u.searchParams.set('schema', 'platform');
u.searchParams.set('connection_limit', '1');
const db = new PrismaClient({ datasources: { db: { url: u.toString() } } });

const giornoDi = (d) => new Date(d).toISOString().slice(0, 10);
const euro = (n) => (n ?? 0).toFixed(2).replace('.', ',') + ' €';

const regole = await db.deliveryRule.findMany({
  where: { active: true, OR: [{ dailyRule: true }, { totalRule: true }] },
  select: {
    id: true, name: true, dailyRule: true, dailyCount: true, totalRule: true, totalCount: true,
    periodStart: true, periodEnd: true, toPay: true, toBill: true, partnerBillingAdjustment: true,
  },
});
console.log(`regole attive con un tetto: ${regole.length}\n`);

const daStaccare = [];
const intoccabili = [];

for (const r of regole) {
  const consegne = await db.delivery.findMany({
    where: { deliveryRuleId: r.id, deletedAt: null },
    orderBy: [{ createdAt: 'asc' }, { code: 'asc' }],
    select: {
      id: true, code: true, date: true, createdAt: true, legacyId: true, invoiced: true,
      payable: true, billable: true, ruleAdjustment: true, valetSalary: true,
      partner: { select: { insegna: true } },
      salaryLines: { select: { salaryId: true } },
    },
  });
  if (!consegne.length) continue;

  // Il tetto GIORNALIERO: si guarda giorno per giorno, in ordine di creazione.
  const perGiorno = new Map();
  if (r.dailyRule && r.dailyCount > 0) {
    for (const d of consegne) {
      const k = giornoDi(d.date);
      const gia = perGiorno.get(k) ?? [];
      gia.push(d);
      perGiorno.set(k, gia);
    }
  }
  const oltre = [];
  for (const [giorno, righe] of perGiorno) {
    if (righe.length > r.dailyCount) oltre.push(...righe.slice(r.dailyCount).map((d) => ({ ...d, motivo: `oltre le ${r.dailyCount} del ${giorno}` })));
  }
  // Il tetto TOTALE del periodo: le prime N del periodo, poi basta.
  if (r.totalRule && r.totalCount > 0) {
    const nelPeriodo = consegne.filter((d) =>
      (!r.periodStart || d.date >= r.periodStart) && (!r.periodEnd || d.date <= r.periodEnd));
    for (const d of nelPeriodo.slice(r.totalCount)) {
      if (!oltre.some((x) => x.id === d.id)) oltre.push({ ...d, motivo: `oltre le ${r.totalCount} del periodo` });
    }
  }
  if (!oltre.length) continue;

  const bloccate = oltre.filter((d) => d.invoiced || d.salaryLines.length > 0);
  const libere = oltre.filter((d) => !d.invoiced && d.salaryLines.length === 0);
  console.log(`${r.name}: ${consegne.length} consegne agganciate, ${oltre.length} oltre il tetto` +
    ` (${libere.length} correggibili, ${bloccate.length} già fatturate o già in uno stipendio)`);
  for (const d of libere) daStaccare.push({ ...d, regola: r });
  for (const d of bloccate) intoccabili.push({ ...d, regola: r });
}

console.log('');
console.log('DA CORREGGERE :', daStaccare.length);
console.log('DA GUARDARE A MANO (già fatturate o già pagate):', intoccabili.length);

const somma = (righe, campo) => righe.reduce((s, d) => s + (d[campo] ?? 0), 0);
console.log('');
console.log(`Sulle correggibili: plus/minus da regola che sparisce ${euro(somma(daStaccare, 'ruleAdjustment'))}`);
console.log(`  tornano «da pagare»   : ${daStaccare.filter((d) => d.payable === false && d.regola.toPay === false).length}`);
console.log(`  tornano «da fatturare»: ${daStaccare.filter((d) => d.billable === false && d.regola.toBill === false).length}`);
console.log(`  nate qui (non importate): ${daStaccare.filter((d) => !d.legacyId).length}`);

console.log('');
console.log('PRIME 15 DA CORREGGERE:');
for (const d of daStaccare.slice(0, 15)) {
  console.log(`  #${d.code} ${giornoDi(d.date)} ${(d.partner?.insegna ?? '').padEnd(26)} ${d.motivo.padEnd(30)} plus/minus ${euro(d.ruleAdjustment)}`);
}
if (intoccabili.length) {
  console.log('');
  console.log('PRIME 15 DA GUARDARE A MANO:');
  for (const d of intoccabili.slice(0, 15)) {
    console.log(`  #${d.code} ${giornoDi(d.date)} ${(d.partner?.insegna ?? '').padEnd(26)} ${d.invoiced ? 'FATTURATA' : ''}${d.salaryLines.length ? ' IN UNO STIPENDIO' : ''}`);
  }
}

if (!APPLICA) {
  console.log('');
  console.log('ANTEPRIMA: nessuna scrittura. Rilanciare con --applica.');
  await db.$disconnect();
  process.exit(0);
}

let fatte = 0;
for (const d of daStaccare) {
  await db.delivery.update({
    where: { id: d.id },
    data: {
      deliveryRuleId: null,
      ruleAdjustment: 0,
      // Si riaccende SOLO ciò che la regola aveva spento.
      ...(d.regola.toPay === false && d.payable === false ? { payable: true } : {}),
      ...(d.regola.toBill === false && d.billable === false ? { billable: true } : {}),
    },
  });
  await db.deliveryLog.create({
    data: {
      deliveryId: d.id,
      type: 'note',
      message: `Regola carnet «${d.regola.name}» tolta: ${d.motivo}. Il tetto vale per le prime consegne del giorno in ordine di creazione; questa lo superava e l'aggancio veniva dall'importazione del vecchio sistema. Plus/minus da regola riportato a 0.`,
    },
  });
  fatte++;
}
console.log('');
console.log(`FATTO: ${fatte} consegne staccate dalla loro regola.`);
await db.$disconnect();
