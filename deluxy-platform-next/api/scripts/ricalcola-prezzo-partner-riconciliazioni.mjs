/**
 * IL PREZZO DELLE RICONCILIAZIONI È QUELLO DELLA CONSEGNA (04/09/2026, regola
 * utente: «85 € conta, è il prezzo che alla fine è stato dato al partner; il
 * 94,50 è un suggerimento»).
 *
 * Le proposte scritte prima di quella regola portano il conto della vendita
 * (importo × (1 − quota)). Qui si riportano al numero vero: il prezzo della
 * RIGA DELLA CONSEGNA nata da quella vendita, che è quello che il partner ha
 * incassato e che finisce in fattura.
 *
 * ⚠️ Tocca SOLO le proposte ancora aperte: le riconciliazioni già accettate o
 * rifiutate sono decisioni prese da una persona e non si riscrivono.
 * ⚠️ Dove la consegna non c'è o non ha prezzo, la riga resta com'è e lo si
 * dice: meglio un numero dichiarato come suggerimento che uno cambiato al buio.
 *
 * Uso: node scripts/ricalcola-prezzo-partner-riconciliazioni.mjs [--applica]
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
u.searchParams.set('schema', 'platform');
const prisma = new PrismaClient({ datasources: { db: { url: u.toString() } } });

const applica = process.argv.includes('--applica');
const arrotonda = (n) => Math.round(n * 100) / 100;

const righe = await prisma.productReconciliation.findMany({
  where: { status: 'proposta' },
  select: { id: true, productId: true, partnerPrice: true, price: true, discountPercent: true, lastSaleId: true,
    product: { select: { name: true } } },
});
let cambiate = 0, senzaConsegna = 0, uguali = 0;
for (const r of righe) {
  const vendita = r.lastSaleId
    ? await prisma.sale.findUnique({ where: { id: r.lastSaleId }, select: { deliveryId: true, amount: true, discountPercent: true } })
    : null;
  const consegna = vendita?.deliveryId
    ? await prisma.delivery.findUnique({ where: { id: vendita.deliveryId }, select: { code: true, products: { select: { productId: true, price: true } } } })
    : null;
  const rigaProdotto = consegna?.products.find((p) => p.productId === r.productId)
    ?? (consegna?.products.length === 1 ? consegna.products[0] : null);
  const dato = rigaProdotto?.price != null && rigaProdotto.price > 0 ? arrotonda(rigaProdotto.price) : null;
  if (dato == null) { senzaConsegna++; continue; }
  if (arrotonda(r.partnerPrice ?? 0) === dato) { uguali++; continue; }
  console.log(`${applica ? 'CAMBIO' : 'cambierei'} · ${r.product.name.slice(0, 40)} · ${r.partnerPrice ?? '—'} € → ${dato} € (consegna #${consegna.code})`);
  if (applica) await prisma.productReconciliation.update({ where: { id: r.id }, data: { partnerPrice: dato } });
  cambiate++;
}
console.log(`\nproposte aperte: ${righe.length} · corrette ${cambiate} · già giuste ${uguali} · senza consegna da cui leggere ${senzaConsegna}`);
if (!applica) console.log('(prova: nessuna scrittura. Rilancia con --applica.)');
await prisma.$disconnect();
