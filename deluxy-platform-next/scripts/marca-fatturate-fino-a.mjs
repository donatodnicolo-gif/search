/**
 * Segna come GIA' FATTURATE le consegne fino a una data.
 *
 * Serve a chiudere l'arretrato: tutto quello che precede la data non deve piu'
 * comparire fra le cose da fatturare, perche' o e' gia' stato fatturato altrove
 * o non lo sara' mai.
 *
 * ⚠️ SCRIVE su dati veri. Due precauzioni:
 *  1. di default NON scrive: mostra il conto di cosa farebbe. Con `--scrivi`
 *     applica.
 *  2. prima di scrivere salva gli id toccati in un file JSON accanto allo
 *     script. Senza quello «disfare» vorrebbe dire indovinare quali righe erano
 *     gia' a `true` prima — e sarebbero 35.135, cioe' non si potrebbe piu'.
 *
 * Uso:
 *   node scripts/marca-fatturate-fino-a.mjs                  (prova a vuoto, fino al 2026-08-01)
 *   node scripts/marca-fatturate-fino-a.mjs --scrivi
 *   node scripts/marca-fatturate-fino-a.mjs --al=2026-07-31 --scrivi
 *   node scripts/marca-fatturate-fino-a.mjs --disfa=<file.json>
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

const arg = (n, d) => (process.argv.find((a) => a.startsWith(`--${n}=`)) ?? `--${n}=${d}`).split('=')[1];
const SCRIVI = process.argv.includes('--scrivi');
const DISFA = process.argv.find((a) => a.startsWith('--disfa='))?.split('=')[1];

// «fino al 1° agosto» compreso: la giornata intera, in ora di Roma.
// Il fuso conta: a Greenwich le 23:30 del 1° agosto sono ancora il 1°, ma le
// 00:30 del 2 in Italia sarebbero le 22:30 del 1° a Greenwich — prendendo UTC
// si porterebbe dentro mezza giornata di troppo.
const AL = arg('al', '2026-08-01');
const fine = new Date(`${AL}T23:59:59.999+02:00`);

const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
const db = new PrismaClient({ datasources: { db: { url:
  `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform&connection_limit=1` } } });

const CARTELLA = 'C:/Users/nicol/app/deluxy-platform-next/scripts/';

if (DISFA) {
  const ids = JSON.parse(fs.readFileSync(DISFA, 'utf8')).ids;
  console.log(`Disfa: rimette a «non fatturate» ${ids.length.toLocaleString('it-IT')} consegne.`);
  let fatte = 0;
  for (let i = 0; i < ids.length; i += 1000) {
    const r = await db.delivery.updateMany({
      where: { id: { in: ids.slice(i, i + 1000) } },
      data: { invoiced: false },
    });
    fatte += r.count;
  }
  console.log(`Rimesse a «non fatturate»: ${fatte.toLocaleString('it-IT')}`);
  await db.$disconnect();
  process.exit(0);
}

// Solo quelle che oggi risultano DA fatturare: le altre sono gia' a posto, e
// toccarle allargherebbe la scrittura senza cambiare niente.
const dove = {
  deletedAt: null,
  billable: true,
  status: { notIn: ['cancelled', 'not_delivered', 'invalidated', 'not_accepted'] },
  invoiced: false,
  invoiceLines: { none: {} },
  date: { lte: fine },
};

const bersagli = await db.delivery.findMany({ where: dove, select: { id: true, date: true } });

const perAnno = {};
for (const d of bersagli) {
  const a = d.date.getFullYear();
  perAnno[a] = (perAnno[a] ?? 0) + 1;
}

console.log(SCRIVI ? 'SCRITTURA' : 'PROVA A VUOTO — rilancia con --scrivi per applicare');
console.log(`Data limite: fino al ${AL} compreso (ora di Roma).`);
console.log(`Consegne da segnare come gia' fatturate: ${bersagli.length.toLocaleString('it-IT')}`);
console.log('  per anno: ' + Object.entries(perAnno).sort((a, b) => b[0] - a[0])
  .map(([a, n]) => `${a}=${n.toLocaleString('it-IT')}`).join(' · '));

const restano = await db.delivery.count({
  where: { ...dove, date: { gt: fine } },
});
console.log(`Restano da fatturare (dopo il ${AL}): ${restano.toLocaleString('it-IT')}`);

if (!SCRIVI) {
  await db.$disconnect();
  process.exit(0);
}

// La traccia PRIMA della scrittura: se il processo muore a meta', il file c'e'
// gia' e si sa comunque cosa e' stato toccato.
const traccia = `${CARTELLA}marcate-fatturate-${AL}.json`;
fs.writeFileSync(traccia, JSON.stringify({
  al: AL, quante: bersagli.length, ids: bersagli.map((d) => d.id),
}, null, 0));
console.log(`Traccia salvata: ${traccia}`);

let scritte = 0;
for (let i = 0; i < bersagli.length; i += 1000) {
  const r = await db.delivery.updateMany({
    where: { id: { in: bersagli.slice(i, i + 1000).map((d) => d.id) } },
    data: { invoiced: true },
  });
  scritte += r.count;
}
console.log(`Segnate come gia' fatturate: ${scritte.toLocaleString('it-IT')}`);
console.log(`Per tornare indietro: node scripts/marca-fatturate-fino-a.mjs --disfa=${traccia}`);

await db.$disconnect();
