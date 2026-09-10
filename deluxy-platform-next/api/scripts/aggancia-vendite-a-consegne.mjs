/**
 * CINQUE VENDITE ACCETTATE CHE AVEVANO GIÀ LA CONSEGNA MA NON IL LEGAME (10/09/2026, decisione utente
 * «ok il resto delle sistemazioni»). Scrive solo `Sale.deliveryId` + riga nel registro della vendita.
 *   node api/scripts/aggancia-vendite-a-consegne.mjs            (anteprima)
 *   node api/scripts/aggancia-vendite-a-consegne.mjs --applica
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
const COPPIE = [['12804', 63031], ['12818', 63124], ['2729', 62868], ['12895', 101104], ['12901', 101130]];
let fatte = 0;
for (const [ordine, code] of COPPIE) {
  const s = await db.sale.findFirst({ where: { externalOrderNumber: ordine, status: 'accettata', deliveryId: null }, select: { id: true, productName: true, partner: { select: { insegna: true } } } });
  const d = await db.delivery.findUnique({ where: { code }, select: { id: true, status: true, partner: { select: { insegna: true } } } });
  if (!s || !d) { console.log(`#${ordine} → #${code}: ${!s ? 'vendita non trovata o già agganciata' : 'consegna non trovata'}`); continue; }
  console.log(`#${ordine} (${s.productName ?? '—'}, ${s.partner?.insegna ?? '—'}) → consegna #${code} (${d.status}, ${d.partner.insegna})`);
  if (!APPLICA) continue;
  await db.$transaction([
    db.sale.update({ where: { id: s.id }, data: { deliveryId: d.id } }),
    db.saleLog.create({ data: { saleId: s.id, type: 'modifica', message: `Agganciata alla consegna #${code} già esistente (10/09/2026, decisione utente): la consegna c'era, mancava solo il legame.` } }),
  ]);
  fatte++;
}
console.log(APPLICA ? `FATTO: ${fatte} agganci. Vendite accettate senza consegna ora: ${await db.sale.count({ where: { status: 'accettata', deliveryId: null } })}` : 'ANTEPRIMA: nessuna scrittura.');
await db.$disconnect();
