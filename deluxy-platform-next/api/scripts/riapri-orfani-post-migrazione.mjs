/**
 * RIAPRE (invoiced=false) le consegne ORFANE dal 01/11/2025 in poi: segnate
 * «già fatturata» ma senza NESSUNA riga di fattura, quindi invisibili sia in
 * fatturazione sia nel «Da fatturare».
 *
 * ⚠️ PERCHÉ ESISTONO, misurato il 09/09/2026:
 * le ha marcate `scripts/marca-fatturate-fino-a.mjs --al=2026-08-01 --scrivi`,
 * lanciato il 24/08/2026 su 19.496 consegne per chiudere l'arretrato
 * («o è già stato fatturato altrove o non lo sarà mai»). Per le consegne fino a
 * ottobre 2025 è vero: la fatturazione si faceva fuori dal gestionale. Dal
 * 01/11/2025 no — da lì il vecchio gestionale emetteva i documenti, e nel suo
 * dump queste consegne hanno `invoiced = 0` e non compaiono in nessun
 * `delivery_invoice`: non sono mai state fatturate a nessuno.
 * `riapri-orfani-agosto.mjs` aveva già fatto la stessa cosa per il solo agosto.
 *
 * COSA RIAPRE, e cosa no:
 *  · solo gli id elencati nel file passato con --elenco (costruito incrociando
 *    il dump del vecchio gestionale: si riaprono SOLO quelle che lì risultavano
 *    NON fatturate e fuori da ogni documento);
 *  · CHANEL resta fuori (regola dell'utente: i partner Chanel non si toccano);
 *  · e comunque, al momento della scrittura, si ricontrolla sul database che
 *    la consegna sia ancora orfana: se nel frattempo qualcuno l'ha fatturata,
 *    non la si tocca.
 *
 * Anteprima di default. Scrive con --applica, e PRIMA salva la traccia degli id
 * per poter tornare indietro con --disfa=<file>.
 *
 * Uso:
 *   node api/scripts/riapri-orfani-post-migrazione.mjs --elenco=<file.json>
 *   node api/scripts/riapri-orfani-post-migrazione.mjs --elenco=<file.json> --applica
 *   node api/scripts/riapri-orfani-post-migrazione.mjs --disfa=<traccia.json>
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const APPLICA = process.argv.includes('--applica');
const ELENCO = arg('elenco');
const DISFA = arg('disfa');
/**
 * I partner CHANEL restano fuori per regola dell'utente, e la regola vale anche
 * qui dentro: si deroga solo dicendolo, con `--con-chanel`. La deroga è stata
 * data a voce il 09/09/2026 («includi») dopo aver visto quanto valeva lasciarli
 * fuori: 2.220 consegne e 57.041,76 € che nel vecchio gestionale non erano mai
 * state fatturate. Restano comunque escluse le 19 consegne Chanel che nel
 * vecchio gestionale stavano dentro un documento: quelle sono fatturate davvero.
 */
const CON_CHANEL = process.argv.includes('--con-chanel');

const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
u.searchParams.set('schema', 'platform');
u.searchParams.set('connection_limit', '1');
u.searchParams.set('pool_timeout', '180');
const db = new PrismaClient({ datasources: { db: { url: u.toString() } } });

const eur = (n) => n.toFixed(2).replace('.', ',');
const q2 = (n) => Math.round(n * 100) / 100;

// ── Disfare: rimette invoiced=true sugli id della traccia.
if (DISFA) {
  const t = JSON.parse(fs.readFileSync(DISFA, 'utf8'));
  console.log(`Disfa: rimette a «già fatturate» ${t.ids.length} consegne.`);
  let fatte = 0;
  for (let i = 0; i < t.ids.length; i += 500) {
    const r = await db.delivery.updateMany({
      where: { id: { in: t.ids.slice(i, i + 500) } },
      data: { invoiced: true },
    });
    fatte += r.count;
  }
  console.log(`Rimesse a «già fatturate»: ${fatte}`);
  await db.$disconnect();
  process.exit(0);
}

if (!ELENCO) {
  console.error('Manca --elenco=<file.json> con { ids: [...] }.');
  await db.$disconnect();
  process.exit(1);
}
const elenco = JSON.parse(fs.readFileSync(ELENCO, 'utf8'));
console.log(`Elenco: ${elenco.ids.length} consegne candidate (generato ${elenco.generato ?? '—'}).`);

// ⚠️ La condizione si ricontrolla QUI, sul database, non ci si fida dell'elenco:
// fra la costruzione e la scrittura qualcuno può aver fatturato o annullato.
const NON_FATT = ['CANCELLED', 'NOT_DELIVERED', 'DRAFT', 'PENDING'];
const bersagli = [];
for (let i = 0; i < elenco.ids.length; i += 500) {
  const parte = await db.delivery.findMany({
    where: {
      id: { in: elenco.ids.slice(i, i + 500) },
      invoiced: true,
      invoiceLines: { none: {} },
      deletedAt: null,
      billable: true,
      status: { notIn: NON_FATT },
      date: { gte: new Date('2025-11-01T00:00:00.000Z') },
      // La cintura di sicurezza sulla regola dell'utente, ripetuta qui.
      partner: CON_CHANEL
        ? { deleted: false }
        : { deleted: false, NOT: { insegna: { contains: 'chanel', mode: 'insensitive' } } },
    },
    select: {
      id: true, code: true, date: true, price: true, additionalPrice: true, ruleAdjustment: true,
      partner: { select: { insegna: true } },
    },
  });
  bersagli.push(...parte);
}
const imp = (d) => q2((d.price ?? 0) + (d.additionalPrice ?? 0) + (d.ruleAdjustment ?? 0));
const conPrezzo = bersagli.filter((d) => imp(d) > 0);
const totale = q2(bersagli.reduce((s, d) => s + imp(d), 0));

console.log(APPLICA ? 'SCRITTURA' : 'ANTEPRIMA — niente scritto. Rilancia con --applica.');
console.log(`  partner CHANEL             : ${CON_CHANEL ? 'INCLUSI (--con-chanel)' : 'esclusi'}`);
const chanel = bersagli.filter((d) => /chanel/i.test(d.partner?.insegna ?? ''));
if (chanel.length) console.log(`     di cui Chanel           : ${chanel.length} consegne · ${eur(q2(chanel.reduce((s, d) => s + imp(d), 0)))} €`);
console.log(`  ancora orfane e riapribili : ${bersagli.length} (delle ${elenco.ids.length} in elenco)`);
console.log(`  di cui con un prezzo > 0   : ${conPrezzo.length}`);
console.log(`  imponibile che rientra     : ${eur(totale)} €`);
const perMese = new Map();
for (const d of bersagli) {
  const m = d.date.toISOString().slice(0, 7);
  const v = perMese.get(m) ?? { n: 0, i: 0 };
  v.n += 1; v.i += imp(d); perMese.set(m, v);
}
console.log('  per mese: ' + [...perMese].sort().map(([k, v]) => `${k}=${v.n} (${eur(q2(v.i))} €)`).join(' · '));

if (!APPLICA) { await db.$disconnect(); process.exit(0); }

// La traccia PRIMA di scrivere: se il processo muore a metà, si sa comunque cosa è stato toccato.
const traccia = ELENCO.replace(/\.json$/, '') + `-riaperte-${new Date().toISOString().slice(0, 10)}.json`;
fs.writeFileSync(traccia, JSON.stringify({
  quando: new Date().toISOString(), quante: bersagli.length, imponibile: totale,
  ids: bersagli.map((d) => d.id), codes: bersagli.map((d) => d.code),
}));
console.log(`  traccia salvata: ${traccia}`);

let scritte = 0;
for (let i = 0; i < bersagli.length; i += 500) {
  const r = await db.delivery.updateMany({
    where: { id: { in: bersagli.slice(i, i + 500).map((d) => d.id) } },
    data: { invoiced: false },
  });
  scritte += r.count;
}
console.log(`RIAPERTE (invoiced=false): ${scritte} consegne — ora sono nel «Da fatturare».`);
console.log(`Per tornare indietro: node api/scripts/riapri-orfani-post-migrazione.mjs --disfa=${traccia}`);
await db.$disconnect();
