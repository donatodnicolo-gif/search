/**
 * LE DUE CONSEGNE NATE DA VENDITA CON LA RIGA AL PREZZO PUBBLICO (10/09/2026, decisione utente):
 * #101251 (ordine 12922, Lijoi: 85 → 60) e #101138 (ordine 12899, Martesana: 130 → 108).
 * Misurato su 69 vendite accettate con consegna dal 06/09: solo queste due hanno la riga uguale al
 * pubblico nonostante una quota > 0; le altre 25 differenze sono righe già a prezzo partner
 * (listino/patto) e NON si toccano.
 *   node api/scripts/correggi-riga-vendita-quota.mjs            (anteprima)
 *   node api/scripts/correggi-riga-vendita-quota.mjs --applica
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const APPLICA = process.argv.includes('--applica');
const RADICE = 'C:/Users/nicol/app/.claude/worktrees/deploy-delivery/deluxy-platform-next/';
const require = createRequire(RADICE + 'api/package.json');
const { PrismaClient } = require('@prisma/client');
const rigaEnv = fs.readFileSync(RADICE + 'api/.env', 'utf8').split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(rigaEnv.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, '')); u.searchParams.set('schema', 'platform'); u.searchParams.set('connection_limit', '1');
const db = new PrismaClient({ datasources: { db: { url: u.toString() } } });
const r2 = (x) => Math.round(x * 100) / 100;
for (const [ordine, code] of [['12922', 101251], ['12899', 101138]]) {
  const s = await db.sale.findFirst({ where: { externalOrderNumber: ordine, status: 'accettata' }, select: { id: true, amount: true, discountPercent: true, quantity: true, productId: true } });
  const d = await db.delivery.findUnique({ where: { code }, select: { id: true, products: { select: { id: true, productId: true, price: true } } } });
  const riga = d?.products.find((p) => p.productId === s?.productId);
  if (!s || !riga) { console.log(`#${ordine}: non trovata`); continue; }
  const nuovo = r2((s.amount * (1 - s.discountPercent / 100)) / Math.max(1, s.quantity || 1));
  console.log(`#${ordine} → consegna #${code}: riga ${riga.price} € → ${nuovo} € (cliente ${s.amount} €, quota ${s.discountPercent} %)`);
  if (!APPLICA) continue;
  await db.$transaction([
    db.deliveryProduct.update({ where: { id: riga.id }, data: { price: nuovo } }),
    db.deliveryLog.create({ data: { deliveryId: d.id, type: 'note', message: `Prezzo riga ${riga.price} → ${nuovo} € (10/09/2026, decisione utente): la riga vale quanto va al partner (cliente ${s.amount} € − quota ${s.discountPercent} %), non il prezzo pubblico. Su questo valore si calcolano commissione del listino e IVA.` } }),
  ]);
  console.log('  OK');
}
console.log(APPLICA ? 'FATTO' : 'ANTEPRIMA: nessuna scrittura.');
await db.$disconnect();
