/**
 * ARCHIVIA I PRODOTTI DI SERVIZIO (07/09/2026, regole utente: «tutti i prodotti con nome che
 * contiene "consegna" vanno messi come archiviati», «anche che contengono "extra"»).
 *
 * Non sono prodotti: sono righe di servizio nate per far quadrare un conto (supplementi,
 * spese, extra fuori città, consegne fatturate come articolo). A catalogo confondono le
 * ricerche e le classifiche.
 *
 * ⚠️ DUE ECCEZIONI, e sono necessarie:
 *  · il prodotto generico «Servizio Consegna» / «Servizio Consegne» SENZA partner: il canale
 *    app lo cerca per nome con `archived: false` per creare una consegna senza catalogo
 *    (`/api/v1/app/prodotti`, campo `generico`). Archiviarlo romperebbe l'inserimento da
 *    Customer Service e da Scout;
 *  · i prodotti già archiviati o cancellati non si toccano.
 *
 * Si ARCHIVIA, non si cancella: le consegne passate continuano a puntarci e i valori non
 * cambiano (il prezzo sta scritto sulla riga di consegna). Lo script MISURA le righe di
 * consegna coinvolte e la loro somma prima e dopo.
 * PROVA di default; `--scrivi` per archiviare; `--ripristina` per tornare indietro.
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
const MOTIVO = 'servizio-consegna-extra-2026-09-07';
const p = new PrismaClient();

const GENERICI = ['servizio consegna', 'servizio consegne'];
const candidati = await p.product.findMany({
  where: {
    deletedAt: null,
    archived: false,
    OR: [
      { name: { contains: 'consegna', mode: 'insensitive' } },
      { name: { contains: 'extra', mode: 'insensitive' } },
    ],
  },
  select: { id: true, name: true, sku: true, price: true, partnerId: true, active: true },
});
const intoccabili = await partnerIntoccabili(p);
const daArchiviare = candidati.filter((x) => !(x.partnerId === null && GENERICI.includes(x.name.trim().toLowerCase())) && !(x.partnerId && intoccabili.has(x.partnerId)));
const salvati = candidati.filter((x) => x.partnerId === null && GENERICI.includes(x.name.trim().toLowerCase()));

const ids = daArchiviare.map((x) => x.id);
const righe = ids.length
  ? await p.deliveryProduct.findMany({ where: { productId: { in: ids } }, select: { price: true, quantity: true } })
  : [];
const somma = righe.reduce((n, r) => n + (r.price ?? 0) * (r.quantity ?? 1), 0);
console.table([
  { voce: 'prodotti a catalogo col nome «consegna» o «extra»', n: candidati.length },
  { voce: '→ DA ARCHIVIARE', n: daArchiviare.length },
  { voce: '→ lasciati: prodotto generico usato dal canale app', n: salvati.length },
  { voce: 'righe di consegna che li usano', n: righe.length },
  { voce: 'somma dei loro prezzi scritti (€)', n: Math.round(somma * 100) / 100 },
]);
console.log('esempi:', daArchiviare.slice(0, 8).map((x) => `${x.name}${x.price ? ` (${x.price} €)` : ''}`).join(' · '));
console.log('salvati:', salvati.map((x) => x.name).join(' · ') || 'nessuno');

if (RIPRISTINA) {
  const r = await p.product.updateMany({ where: { archivedReason: MOTIVO }, data: { archived: false, archivedAt: null, archivedReason: null } });
  console.log('RIPRISTINATI:', r.count);
} else if (SCRIVI) {
  let n = 0;
  for (let i = 0; i < ids.length; i += 500) {
    const r = await p.product.updateMany({
      where: { id: { in: ids.slice(i, i + 500) } },
      data: { archived: true, archivedAt: new Date(), archivedReason: MOTIVO },
    });
    n += r.count;
  }
  const dopo = ids.length ? await p.deliveryProduct.findMany({ where: { productId: { in: ids } }, select: { price: true, quantity: true } }) : [];
  const sommaDopo = dopo.reduce((n2, r) => n2 + (r.price ?? 0) * (r.quantity ?? 1), 0);
  const restano = await p.product.count({ where: { deletedAt: null, archived: false } });
  console.log(`ARCHIVIATI: ${n} · righe di consegna dopo: ${dopo.length} · somma dopo: ${Math.round(sommaDopo * 100) / 100} €`);
  console.log(Math.abs(sommaDopo - somma) < 0.01 && dopo.length === righe.length ? '✓ i valori delle consegne NON sono cambiati' : '⚠️ CONTROLLARE');
  console.log('prodotti non archiviati rimasti a catalogo:', restano);
} else console.log('PROVA: nulla scritto. `--scrivi` per archiviare.');
await p.$disconnect();

// ⭐ 07/09/2026 (regola utente): «tutti quelli che sono abbinati a Chanel non vanno toccati».
// Le voci di Chanel (WFJ, Handbags, SLG, RTW, Flowers…) non sono prodotti da vetrina: sono le
// righe con cui le boutique inseriscono le loro consegne, e senza quelle il loro modulo resta
// vuoto. Una pulizia che le porta via non fa ordine, rompe un lavoro.
async function partnerIntoccabili(prisma) {
  const righe = await prisma.partner.findMany({ where: { insegna: { contains: 'chanel', mode: 'insensitive' } }, select: { id: true } });
  return new Set(righe.map((x) => x.id));
}
