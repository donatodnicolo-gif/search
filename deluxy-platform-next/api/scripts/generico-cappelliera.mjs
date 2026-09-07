/**
 * UN SOLO GENERICO «CAPPELLIERA FIORI» (07/09/2026, regola utente: «crea in prodotti un
 * generico cappelliera fiori che sostituisce tutti i generici cappelliere»).
 *
 * Le cappelliere fuori Shopify sono decine di righe nate per un ordine solo — «cappelliera 50
 * rose rosse», «cappelliera rose e palloncino blu S con fattura Firenze», copie per provincia
 * («-S null», «-2FI») — e nessuna si può riusare. Restano al loro posto:
 *  · le cappelliere DEL NEGOZIO (su Shopify): sono prodotti veri, con foto e varianti;
 *  · i prodotti UNICI di un partner (il suo listino, es. Enrico Rizzi);
 *  · quelle APPROVATE, che qualcuno ha messo a catalogo per davvero;
 *  · tutto ciò che è abbinato a Chanel (regola dell'utente).
 * PROVA di default; `--scrivi` esegue; `--ripristina` disfa.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/nicol/app/.claude/worktrees/deploy-delivery/deluxy-platform-next/api/package.json');
const { PrismaClient } = require('@prisma/client');
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8').split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
u.searchParams.set('schema', 'platform'); process.env.DATABASE_URL = u.toString();
const SCRIVI = process.argv.includes('--scrivi');
const RIPRISTINA = process.argv.includes('--ripristina');
const MOTIVO = 'sostituito-da-generico-cappelliera-2026-09-07';
const p = new PrismaClient();

const deluxy = await p.partner.findFirst({ where: { insegna: 'Deluxy' }, select: { id: true } });
const chanel = new Set((await p.partner.findMany({ where: { insegna: { contains: 'chanel', mode: 'insensitive' } }, select: { id: true } })).map((x) => x.id));
const cat = await p.category.findFirst({ where: { name: { contains: 'cappellier', mode: 'insensitive' } }, select: { id: true, name: true } })
  ?? await p.category.findFirst({ where: { name: 'Fiori' }, select: { id: true, name: true } });

const tutte = await p.product.findMany({
  where: { deletedAt: null, archived: false, name: { contains: 'cappellier', mode: 'insensitive' }, type: 'NON_UNICO', approved: false },
  select: { id: true, name: true, sku: true, platforms: true, partnerId: true },
});
const daArchiviare = tutte.filter(
  (x) => (x.platforms ?? '').replace(/[[\]"\s]/g, '').length === 0 && !(x.partnerId && chanel.has(x.partnerId)) && x.sku !== 'GEN-CAPPELLIERA',
);
const righe = daArchiviare.length
  ? await p.deliveryProduct.findMany({ where: { productId: { in: daArchiviare.map((x) => x.id) } }, select: { price: true, quantity: true } })
  : [];
const somma = righe.reduce((n, r) => n + (r.price ?? 0) * (r.quantity ?? 1), 0);
console.table([
  { voce: 'cappelliere non approvate a catalogo', n: tutte.length },
  { voce: '→ DA ARCHIVIARE (fuori Shopify, non Chanel)', n: daArchiviare.length },
  { voce: 'righe di consegna che le usano', n: righe.length },
  { voce: 'somma dei loro prezzi scritti (€)', n: Math.round(somma * 100) / 100 },
  { voce: 'categoria del generico', n: cat?.name ?? '(nessuna)' },
]);
console.log('esempi:', daArchiviare.slice(0, 6).map((x) => x.name).join(' · '));

if (RIPRISTINA) {
  const r = await p.product.updateMany({ where: { archivedReason: MOTIVO }, data: { archived: false, archivedAt: null, archivedReason: null } });
  console.log('RIPRISTINATE:', r.count);
} else if (SCRIVI) {
  const dati = {
    name: 'Cappelliera fiori',
    description: 'Prodotto generico: la cappelliera di fiori quando non c\'è un articolo preciso a catalogo. Il prezzo si scrive sulla riga della consegna (07/09/2026).',
    price: 0, type: 'NON_UNICO', partnerId: deluxy?.id ?? null, categoryId: cat?.id ?? null,
    active: true, approved: true, hasVariants: false, tipologiaVendita: 'mix', createdFrom: 'generico-2026-09-07',
  };
  const gia = await p.product.findFirst({ where: { sku: 'GEN-CAPPELLIERA' }, select: { id: true } });
  if (gia) await p.product.update({ where: { id: gia.id }, data: dati });
  else await p.product.create({ data: { ...dati, sku: 'GEN-CAPPELLIERA' } });
  let n = 0;
  for (let i = 0; i < daArchiviare.length; i += 500) {
    const r = await p.product.updateMany({ where: { id: { in: daArchiviare.slice(i, i + 500).map((x) => x.id) } }, data: { archived: true, archivedAt: new Date(), archivedReason: MOTIVO } });
    n += r.count;
  }
  const dopo = daArchiviare.length ? await p.deliveryProduct.findMany({ where: { productId: { in: daArchiviare.map((x) => x.id) } }, select: { price: true, quantity: true } }) : [];
  const sommaDopo = dopo.reduce((s, r) => s + (r.price ?? 0) * (r.quantity ?? 1), 0);
  const restano = await p.product.count({ where: { deletedAt: null, archived: false } });
  console.log(`GENERICO «Cappelliera fiori» pronto · archiviate ${n}`);
  console.log(Math.abs(sommaDopo - somma) < 0.01 ? '✓ i valori delle consegne NON sono cambiati' : '⚠️ CONTROLLARE');
  console.log('prodotti non archiviati a catalogo:', restano);
} else console.log('PROVA: nulla scritto. `--scrivi` per applicare.');
await p.$disconnect();
