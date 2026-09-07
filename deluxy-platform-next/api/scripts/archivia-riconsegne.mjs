/**
 * ARCHIVIA I PRODOTTI «RICONSEGNA» (06/09/2026 sera, regola utente: «tutti i prodotti con nome che
 * contiene "riconsegna" vanno in archivio»). Sono righe di servizio nate per rifare una consegna,
 * non prodotti di catalogo. Si archivia, non si cancella. PROVA di default; `--scrivi` archivia.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8').split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
u.searchParams.set('schema', 'platform'); process.env.DATABASE_URL = u.toString();
const SCRIVI = process.argv.includes('--scrivi');
const p = new PrismaClient();
const trovati = await p.product.findMany({
  where: { name: { contains: 'riconsegna', mode: 'insensitive' }, deletedAt: null, archived: false },
  select: { id: true, name: true, sku: true, active: true },
});
console.log(`prodotti «riconsegna» da archiviare: ${trovati.length}`);
console.log(trovati.slice(0, 8).map((x) => `  ${x.name} [${x.sku ?? '—'}]${x.active ? '' : ' (già disattivato)'}`).join('\n'));
if (SCRIVI && trovati.length) {
  const r = await p.product.updateMany({ where: { id: { in: trovati.map((x) => x.id) } }, data: { archived: true, archivedAt: new Date() } });
  const restano = await p.product.count({ where: { deletedAt: null, archived: false } });
  console.log(`ARCHIVIATI: ${r.count} · prodotti attivi rimasti: ${restano}`);
} else if (!SCRIVI) console.log('PROVA: nulla scritto.');
await p.$disconnect();
