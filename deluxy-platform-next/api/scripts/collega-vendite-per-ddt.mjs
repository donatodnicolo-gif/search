/**
 * VENDITE APERTE CHE HANNO GIA' LA LORO CONSEGNA (05/09/2026, regola utente:
 * «tutte le vendite con consegna con DDT uguale alla vendita, anche in storico,
 * devono andare in storico»).
 *
 * Sul DDT della consegna si scrive il NUMERO D'ORDINE: dove il DDT di una
 * consegna e' uguale al numero d'ordine di una vendita ancora aperta, la
 * consegna e' gia' stata fatta e la vendita non ha piu' niente da chiedere.
 *
 * ⚠️ IL NUMERO DA SOLO NON BASTA — e non e' teoria. Con quattro negozi lo
 * stesso DDT esiste su brand diversi: nove vendite di cakedesign.me (ordini
 * 1772…1830) hanno lo stesso numero di consegne del brand Flowers fatte a
 * NOVEMBRE 2025, con destinatari, indirizzi e citta' completamente diversi.
 * Collegarle avrebbe chiuso nove vendite vere contro consegne di altri.
 * Percio' si pretende che il BRAND combaci; dove non combacia, o dove i
 * candidati sono piu' d'uno, si decide A MANO e la decisione sta scritta qui
 * sotto, in CONFERMATE, con il perche'.
 *
 * Uso:  node scripts/collega-vendite-per-ddt.mjs            (solo elenco)
 *       node scripts/collega-vendite-per-ddt.mjs --applica  (scrive)
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
const APPLICA = process.argv.includes('--applica');

/**
 * I casi che il controllo automatico non chiude da solo, verificati a mano il
 * 05/09/2026 confrontando destinatario, indirizzo e data.
 */
const CONFERMATE = {
  // La consegna non ha il brand scritto (5.132 sono cosi'), ma destinatario e
  // data combaciano e l'indirizzo differisce solo per una «v» di troppo.
  '12832': { code: 63193, perche: 'stesso destinatario, stessa data, stesso indirizzo; alla consegna manca solo il brand' },
  // Ordine servito da DUE partner (due consegne gemelle: stesso destinatario,
  // stesso indirizzo, stesso giorno). `Sale.deliveryId` e' unico, quindi la
  // vendita si aggancia alla prima e il registro cita anche l'altra.
  '12847': { code: 100788, perche: 'ordine diviso su due consegne gemelle (#100788 e #100789)' },
  '12857': { code: 100826, perche: 'ordine diviso su due consegne gemelle (#100826 e #100827)' },
};

const aperte = await prisma.sale.findMany({
  where: { status: { in: ['da_gestire', 'proposta'] }, externalOrderNumber: { not: null } },
  select: { id: true, externalOrderNumber: true, brand: true, status: true, deliveryId: true,
    deliveryDate: true, amount: true, partnerId: true,
    partner: { select: { insegna: true } }, province: { select: { code: true } } },
  orderBy: { externalOrderNumber: 'asc' },
});
console.log(`vendite aperte con numero d'ordine: ${aperte.length}`);

const numeri = [...new Set(aperte.map((v) => v.externalOrderNumber))];
const consegne = await prisma.delivery.findMany({
  where: { deletedAt: null, ddtNumber: { in: numeri } },
  select: { id: true, code: true, date: true, status: true, ddtNumber: true, ddtBrand: true,
    partnerId: true, partner: { select: { insegna: true } } },
  orderBy: { code: 'asc' },
});
const perDdt = new Map();
for (const d of consegne) {
  if (!perDdt.has(d.ddtNumber)) perDdt.set(d.ddtNumber, []);
  perDdt.get(d.ddtNumber).push(d);
}

const daFare = [];
const dubbie = [];
for (const v of aperte) {
  const tutte = perDdt.get(v.externalOrderNumber) ?? [];
  if (!tutte.length) continue;
  if (v.deliveryId) { dubbie.push({ v, tutte, perche: 'gia\' collegata a un\'altra consegna' }); continue; }
  const forzata = CONFERMATE[v.externalOrderNumber];
  if (forzata) {
    const d = tutte.find((x) => x.code === forzata.code);
    if (d) { daFare.push({ v, d, come: 'verificata a mano', nota: forzata.perche, altre: tutte.filter((x) => x.code !== d.code) }); continue; }
  }
  const stessoBrand = tutte.filter((d) => d.ddtBrand && v.brand && d.ddtBrand === v.brand);
  if (stessoBrand.length === 1) { daFare.push({ v, d: stessoBrand[0], come: 'DDT + brand', altre: [] }); continue; }
  if (stessoBrand.length > 1) { dubbie.push({ v, tutte: stessoBrand, perche: `${stessoBrand.length} consegne con lo stesso DDT e lo stesso brand` }); continue; }
  if (tutte.length === 1 && !tutte[0].ddtBrand) { dubbie.push({ v, tutte, perche: 'la consegna non ha il brand scritto' }); continue; }
  dubbie.push({ v, tutte, perche: `nessuna consegna col brand «${v.brand}» (candidate: ${tutte.map((d) => d.ddtBrand ?? 'senza brand').join(', ')})` });
}

const f = (d) => d.toISOString().slice(0, 10);
console.log(`\n================ DA COLLEGARE: ${daFare.length} ================`);
for (const { v, d, come, nota, altre } of daFare) {
  console.log(`ordine ${v.externalOrderNumber} (${v.brand}, ${v.amount} €, ${v.province?.code}) -> #${d.code} ${f(d.date)} ${d.status} · ${d.partner?.insegna ?? '—'} [${come}]${nota ? ' — ' + nota : ''}${altre?.length ? ' — anche #' + altre.map((x) => x.code).join(', #') : ''}`);
}
console.log(`\n================ NON TOCCATE: ${dubbie.length} ================`);
for (const { v, tutte, perche } of dubbie) {
  console.log(`ordine ${v.externalOrderNumber} (${v.brand}) — ${perche}: ${tutte.map((d) => '#' + d.code + ' ' + f(d.date) + ' ' + (d.ddtBrand ?? 'senza brand')).join(' | ')}`);
}

if (!APPLICA) { console.log('\n(prova: nessuna scrittura. Rilancia con --applica)'); await prisma.$disconnect(); process.exit(0); }

let fatte = 0;
for (const { v, d, altre } of daFare) {
  const coda = altre?.length ? ` (l'ordine sta anche sulla consegna #${altre.map((x) => x.code).join(', #')})` : '';
  await prisma.$transaction([
    prisma.sale.update({
      where: { id: v.id },
      data: { status: 'accettata', historyAt: new Date(), deliveryId: d.id, partnerId: d.partnerId ?? v.partnerId },
    }),
    prisma.saleLog.create({
      data: { saleId: v.id, type: 'stato',
        message: `Consegna #${d.code} gia' fatta (DDT ${d.ddtNumber}): vendita collegata e messa in storico${coda} — allineamento del 05/09/2026` },
    }),
    prisma.deliveryLog.create({
      data: { deliveryId: d.id, type: 'note',
        message: `Collegata alla vendita dell'ordine ${v.externalOrderNumber} dal DDT — allineamento del 05/09/2026` },
    }),
  ]);
  fatte++;
}
console.log(`\n✓ vendite messe in storico: ${fatte}`);
await prisma.$disconnect();
