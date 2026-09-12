/**
 * ⭐ 12/09/2026 (correzione chiesta dall'utente: «lascia in prodotti tutti quelli creati nel 2026»).
 *
 * L'archiviazione dei prodotti fermi aveva usato un mio criterio — «nati da più di 14 giorni» — al posto
 * della regola vera, che è l'anno di nascita: un prodotto **creato nel 2026** resta in Prodotti anche se
 * finora non è mai entrato in una consegna. È catalogo nuovo, non catalogo morto, e archiviarlo lo toglie
 * dal modulo consegna di chi lo ha appena caricato.
 *
 * Rimette `archived = false` sui prodotti archiviati ieri con motivo «fermo: nessuna consegna nel 2026»
 * che sono nati dal 1º gennaio 2026 in poi. Gli altri — quelli davvero vecchi — restano archiviati.
 *
 * Uso:  node scripts/ripristina-prodotti-2026.mjs [--applica]
 */
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
require('dotenv').config();

const APPLICA = process.argv.includes('--applica');
const MOTIVO = 'fermo: nessuna consegna nel 2026';

const url = new URL(process.env.DATABASE_URL.replace('schema=tasks', 'schema=platform'));
url.searchParams.set('connection_limit', '1');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({ datasources: { db: { url: url.toString() } } });

async function main() {
  const archiviati = await prisma.product.findMany({
    where: { deletedAt: null, archived: true, archivedReason: MOTIVO },
    select: { id: true, name: true, createdAt: true, partner: { select: { insegna: true } } },
    orderBy: { createdAt: 'asc' },
  });
  const del2026 = archiviati.filter((p) => p.createdAt >= new Date('2026-01-01T00:00:00.000Z'));
  const prima = archiviati.length - del2026.length;

  console.log(`Archiviati ieri col motivo «${MOTIVO}»: ${archiviati.length}`);
  console.log(`  nati nel 2026 → DA RIMETTERE in Prodotti: ${del2026.length}`);
  console.log(`  nati prima del 2026 → restano archiviati: ${prima}`);
  for (const p of del2026.slice(0, 15)) console.log(`  ${p.createdAt.toISOString().slice(0, 10)}  ${p.name.slice(0, 46).padEnd(48)} ${p.partner?.insegna ?? '—'}`);
  if (del2026.length > 15) console.log(`  … e altri ${del2026.length - 15}`);

  if (!APPLICA) { console.log('\nANTEPRIMA — nulla è stato scritto. Rilanciare con --applica.'); return; }

  writeFileSync(`scripts/prodotti-ripristinati-${Date.now()}.json`, JSON.stringify(del2026, null, 1));
  for (let i = 0; i < del2026.length; i += 200) {
    const blocco = del2026.slice(i, i + 200);
    await prisma.product.updateMany({
      where: { id: { in: blocco.map((p) => p.id) } },
      data: { archived: false, archivedAt: null, archivedReason: null },
    });
    console.log(`  rimessi ${Math.min(i + 200, del2026.length)}/${del2026.length}`);
  }
}

main().catch((e) => { console.error('ERRORE', e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
