/**
 * Trova le consegne che stanno su piu' di una fattura.
 *
 * Perche' succedeva: `generate()` non escludeva le consegne gia' fatturate, e
 * rigenerare lo stesso periodo lo fatturava una seconda volta senza dire
 * niente. Il difetto e' chiuso dal 24/08 (la consegna ora e' collegata alle sue
 * righe di fattura, e il generatore le salta), ma lo storico importato dal
 * legacy se lo porta dietro.
 *
 * ⚠️ NON ripara: le fatture coinvolte sono gia' PAGATE, e riscrivere un
 * documento incassato non e' una cosa che si fa in silenzio. Serve una nota di
 * credito, che e' una decisione contabile.
 *
 * Sola lettura.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
const db = new PrismaClient({ datasources: { db: { url:
  `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform&connection_limit=1` } } });

const righe = await db.$queryRawUnsafe(`
  SELECT l."deliveryId", count(*)::int volte,
         string_agg(i.number || ' (' || i.status || ', ' ||
           to_char(i."periodStart",'DD/MM/YY') || '-' || to_char(i."periodEnd",'DD/MM/YY') || ')',
           ' + ' ORDER BY i."periodStart") fatture,
         sum(l.amount)::float totale, d.code::int codice, p.insegna
  FROM platform."InvoiceLine" l
  JOIN platform."Invoice" i ON i.id = l."invoiceId"
  LEFT JOIN platform."Delivery" d ON d.id = l."deliveryId"
  LEFT JOIN platform."Partner" p ON p.id = i."partnerId"
  WHERE l."deliveryId" IS NOT NULL
  GROUP BY l."deliveryId", d.code, p.insegna
  HAVING count(*) > 1
  ORDER BY sum(l.amount) DESC`);

if (!righe.length) {
  console.log('✅ Nessuna consegna fatturata piu\' di una volta.');
} else {
  console.log(`🔴 Consegne fatturate piu' di una volta: ${righe.length}\n`);
  for (const x of righe)
    console.log('  #' + String(x.codice ?? '—').padStart(6) + ' ' +
      String(x.insegna ?? '—').padEnd(22).slice(0, 22) + ' x' + x.volte + '  ' +
      x.totale.toFixed(2).padStart(9) + ' EUR   ' + x.fatture);
  const doppio = righe.reduce((s, x) => s + x.totale / 2, 0);
  console.log(`\n  Fatturato due volte: ${doppio.toFixed(2)} EUR — da restituire con nota di credito.`);
  const partners = [...new Set(righe.map((x) => x.insegna))];
  console.log(`  Partner coinvolti (${partners.length}): ${partners.join(', ')}`);
}
await db.$disconnect();
