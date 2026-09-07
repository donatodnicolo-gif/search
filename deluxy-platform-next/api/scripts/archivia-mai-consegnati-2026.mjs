/**
 * ARCHIVIA I PRODOTTI MAI ENTRATI IN UNA CONSEGNA NEL 2026 (06/09/2026 sera, regola utente:
 * «ci sono ancora troppi prodotti in applicativo: calcola quali prodotti non sono mai entrati in una
 * consegna nel 2026 e mettili in archivio»).
 *
 * Si ARCHIVIA, non si cancella: id, nome e prezzo restano, e le consegne passate continuano a
 * puntarci. `archived` è uno stato separato da `active`: il prodotto esce dalla lista principale e
 * va in Archivio.
 *
 * NON SI TOCCANO (e il conto lo dice):
 *  · i prodotti nati nel 2026 e mai ancora consegnati: sono nuovi, non morti (`--giorni N` cambia
 *    la finestra di grazia, predefinita 90 giorni);
 *  · i listini dei partner caricati il 06/09 (sku `STELO-*` e `PP-*`) e quelli scritti dal fioraio;
 *  · i prodotti UNICI di un partner attivo: sono il suo listino, anche se non li ha ancora venduti;
 *  · i prodotti già archiviati o cancellati.
 *
 * PROVA di default; `--scrivi` archivia; `--ripristina` disarchivia quelli toccati da questo script.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8').split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
u.searchParams.set('schema', 'platform'); process.env.DATABASE_URL = u.toString();
const SCRIVI = process.argv.includes('--scrivi');
const RIPRISTINA = process.argv.includes('--ripristina');
const GIORNI = Number((process.argv.find((a) => a.startsWith('--giorni=')) ?? '--giorni=90').split('=')[1]);
const p = new PrismaClient();
const q = (s, ...a) => p.$queryRawUnsafe(s, ...a);

const DAL = '2026-01-01';
const grazia = new Date(Date.now() - GIORNI * 86400000).toISOString();

// 1. Chi È entrato in una consegna nel 2026 (per prodotto e per variante)
const vivi = await q(`
  SELECT DISTINCT dp."productId" AS id FROM platform."DeliveryProduct" dp
  JOIN platform."Delivery" d ON d.id = dp."deliveryId"
  WHERE dp."productId" IS NOT NULL AND d.date >= $1::timestamp`, DAL);
const viviIds = new Set(vivi.map((x) => x.id));
// anche le vendite del 2026 tengono vivo un prodotto (proposte, non ancora consegnate)
const venduti = await q(`SELECT DISTINCT "productId" AS id FROM platform."Sale" WHERE "productId" IS NOT NULL AND "createdAt" >= $1::timestamp`, DAL);
for (const x of venduti) viviIds.add(x.id);

// 2. I candidati: attivi, non archiviati, non cancellati, nati prima della finestra di grazia
const candidati = await p.product.findMany({
  where: {
    deletedAt: null, archived: false,
    createdAt: { lt: new Date(grazia) },
    // ⚠️ 06/09 sera: il NOT su una colonna che può essere NULL scarta anche i NULL (in SQL NOT(NULL)
    // è NULL, non TRUE): con  i prodotti SENZA SKU sparivano dai candidati e non
    // venivano archiviati. Il filtro sui listini si fa dopo, in memoria.
  },
  select: { id: true, name: true, sku: true, type: true, createdAt: true, createdFrom: true, partner: { select: { insegna: true, active: true, deleted: true } }, category: { select: { name: true } } },
});
const intoccabili = await partnerIntoccabili(p);
const daArchiviare = candidati.filter((x) => {
  if (x.partnerId && intoccabili.has(x.partnerId)) return false; // Chanel non si tocca
  if ((x.sku ?? '').startsWith('STELO-') || (x.sku ?? '').startsWith('PP-')) return false; // listini caricati oggi
  if (viviIds.has(x.id)) return false;
  if (x.type === 'UNICO' && x.partner && x.partner.active && !x.partner.deleted) return false; // è il listino di un partner vivo
  return true;
});

const perCategoria = {}; const perAnno = {};
for (const x of daArchiviare) {
  perCategoria[x.category?.name ?? '(senza categoria)'] = (perCategoria[x.category?.name ?? '(senza categoria)'] ?? 0) + 1;
  const anno = new Date(x.createdAt).getFullYear();
  perAnno[anno] = (perAnno[anno] ?? 0) + 1;
}
console.table([
  { voce: 'prodotti vivi (consegna o vendita nel 2026)', n: viviIds.size },
  { voce: 'candidati esaminati (attivi, non archiviati, nati da oltre ' + GIORNI + ' giorni)', n: candidati.length },
  { voce: 'DA ARCHIVIARE: mai in una consegna né vendita del 2026', n: daArchiviare.length },
  { voce: '· lasciati stare perché listino UNICO di un partner attivo', n: candidati.filter((x) => !viviIds.has(x.id) && x.type === 'UNICO' && x.partner?.active && !x.partner?.deleted).length },
]);
console.log('per anno di nascita:', Object.entries(perAnno).sort().map(([k, v]) => `${k}=${v}`).join(' · '));
console.log('prime categorie:', Object.entries(perCategoria).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${k}=${v}`).join(' · '));
console.log('esempi:', daArchiviare.slice(0, 5).map((x) => `${x.name} [${x.sku ?? '—'}]`).join(' · '));

if (RIPRISTINA) {
  const r = await p.product.updateMany({ where: { archivedAt: { not: null }, createdFrom: { not: 'listino-fiorista' } }, data: { archived: false, archivedAt: null } });
  console.log('RIPRISTINATI:', r.count);
} else if (SCRIVI) {
  const ids = daArchiviare.map((x) => x.id);
  let fatti = 0;
  for (let i = 0; i < ids.length; i += 500) {
    const r = await p.product.updateMany({ where: { id: { in: ids.slice(i, i + 500) } }, data: { archived: true, archivedAt: new Date() } });
    fatti += r.count;
  }
  const restano = await p.product.count({ where: { deletedAt: null, archived: false } });
  console.log(`ARCHIVIATI: ${fatti} · prodotti attivi rimasti a catalogo: ${restano}`);
} else {
  console.log('PROVA: nulla scritto. `--scrivi` per archiviare.');
}
await p.$disconnect();

// ⭐ 07/09/2026 (regola utente): «tutti quelli che sono abbinati a Chanel non vanno toccati».
// Le voci di Chanel (WFJ, Handbags, SLG, RTW, Flowers…) non sono prodotti da vetrina: sono le
// righe con cui le boutique inseriscono le loro consegne, e senza quelle il loro modulo resta
// vuoto. Una pulizia che le porta via non fa ordine, rompe un lavoro.
async function partnerIntoccabili(prisma) {
  const righe = await prisma.partner.findMany({ where: { insegna: { contains: 'chanel', mode: 'insensitive' } }, select: { id: true } });
  return new Set(righe.map((x) => x.id));
}
