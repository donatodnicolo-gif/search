/**
 * LA QUANTITÀ DEGLI «EXTRA» TORNA A 1 (11/09/2026, regola utente: «porta quantità a 1 tu»).
 *
 *   node api/scripts/quantita-extra-a-uno.mjs            (anteprima)
 *   node api/scripts/quantita-extra-a-uno.mjs --applica
 *
 * IL FATTO. Il modulo «Manda in app» del Customer Service proponeva la quantità della PRIMA riga
 * dell'ordine. Sui negozi che modellano i supplementi come righe da un euro («Extra» 35 × 1,00 €) arrivava
 * quel numero, e col prezzo sostituito dal costo concordato col fornitore la consegna nasceva con migliaia
 * di euro di merce: #101230 35 × 80 € = 2.800 €, #101207 15 × 65 € = 975 €, #101229 10 × 60 € = 600 €.
 * Il prezzo è GIUSTO — è quello pattuito, ed è un totale: sbagliata è solo la quantità.
 *
 * COSA FA. Porta a 1 la quantità di quelle tre righe. Il prezzo non si tocca.
 *
 * ⚠️ Si ferma se una delle tre consegne è stata FATTURATA nel frattempo: cambiare il valore della merce
 * sotto una fattura emessa vorrebbe dire riscrivere un documento già consegnato. In quel caso si decide a
 * mano, e lo script lo dice invece di procedere.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';

const APPLICA = process.argv.includes('--applica');
const CODICI = [101230, 101207, 101229];
const RADICE = 'C:/Users/nicol/app/.claude/worktrees/deploy-delivery/deluxy-platform-next/';
const require = createRequire(RADICE + 'api/package.json');
const { PrismaClient } = require('@prisma/client');
const riga = fs.readFileSync(RADICE + 'api/.env', 'utf8').split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
u.searchParams.set('schema', 'platform');
u.searchParams.set('connection_limit', '1');
const db = new PrismaClient({ datasources: { db: { url: u.toString() } } });

const consegne = await db.delivery.findMany({
  where: { code: { in: CODICI }, deletedAt: null },
  select: {
    id: true, code: true, status: true, invoiced: true, billable: true, date: true,
    partner: { select: { insegna: true } },
    products: { select: { id: true, quantity: true, price: true, product: { select: { name: true } } } },
  },
});

if (consegne.length !== CODICI.length) {
  console.log(`⚠️ trovate ${consegne.length} consegne su ${CODICI.length}: ${consegne.map((d) => d.code).join(', ')}`);
}

const daCambiare = [];
for (const d of consegne) {
  const fatturata = d.invoiced;
  for (const r of d.products) {
    const prima = (r.quantity ?? 1) * (r.price ?? 0);
    console.log(
      `#${d.code} ${d.date.toISOString().slice(0, 10)} ${d.partner?.insegna ?? '—'} · ${r.product?.name ?? '—'}: ` +
      `${r.quantity} × ${r.price} € = ${prima.toFixed(2)} €` +
      (r.quantity > 1 ? ` → 1 × ${r.price} € = ${(r.price ?? 0).toFixed(2)} €` : ' (già a 1: non si tocca)') +
      (fatturata ? '  ⛔ CONSEGNA FATTURATA' : ''),
    );
    if ((r.quantity ?? 1) > 1 && !fatturata) daCambiare.push({ id: r.id, deliveryId: d.id, code: d.code, da: r.quantity, price: r.price });
  }
}

const fatturate = consegne.filter((d) => d.invoiced).map((d) => d.code);
if (fatturate.length) {
  console.log('');
  console.log(`⛔ FERMO: ${fatturate.join(', ')} risultano già fatturate. Non tocco il valore della merce sotto una fattura emessa.`);
  await db.$disconnect();
  process.exit(1);
}

console.log('');
console.log(`righe da portare a 1: ${daCambiare.length}`);
if (!APPLICA) {
  console.log('ANTEPRIMA: nessuna scrittura.');
  await db.$disconnect();
  process.exit(0);
}

for (const r of daCambiare) {
  await db.deliveryProduct.update({ where: { id: r.id }, data: { quantity: 1 } });
  // Il registro della consegna dice cosa è successo: fra un mese, «perché qui c'era 35?» deve avere risposta.
  await db.deliveryLog.create({
    data: {
      deliveryId: r.deliveryId,
      type: 'note',
      message: `Quantità della riga portata da ${r.da} a 1 (11/09/2026, decisione dell'utente): il ${r.da} veniva dalla riga «Extra» dell'ordine, mentre il prezzo di ${r.price} € è il costo concordato col fornitore, che è un totale.`,
    },
  });
}
console.log(`FATTO: ${daCambiare.length} righe a quantità 1.`);

const dopo = await db.delivery.findMany({
  where: { code: { in: CODICI } },
  select: { code: true, products: { select: { quantity: true, price: true } } },
});
for (const d of dopo) {
  const tot = d.products.reduce((s, r) => s + (r.quantity ?? 1) * (r.price ?? 0), 0);
  console.log(`VERIFICA #${d.code}: ${d.products.map((r) => `${r.quantity} × ${r.price} €`).join(' + ')} = ${tot.toFixed(2)} €`);
}
await db.$disconnect();
