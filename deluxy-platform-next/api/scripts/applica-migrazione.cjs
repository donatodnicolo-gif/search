/**
 * Applica una migrazione SQL sul database di produzione, un comando alla volta.
 * ⚠️ I blocchi `DO $$ … $$;` non si possono spezzare sui punto e virgola interni: si riconoscono e si
 * mandano interi. Senza questo, la migrazione parte a metà e lascia la tabella senza chiavi esterne.
 */
require('dotenv').config();
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');

const file = process.argv[2];
if (!file) { console.error('uso: node applica-migrazione.cjs <file.sql>'); process.exit(1); }

const u = new URL(process.env.DATABASE_URL.replace('schema=tasks', 'schema=platform'));
u.searchParams.set('connection_limit', '1');
const prisma = new PrismaClient({ datasources: { db: { url: u.toString() } } });

/** Divide lo script in comandi, tenendo insieme i blocchi DO $$ … $$. */
function comandi(sql) {
  const fuori = [];
  let resto = sql;
  const blocco = /DO \$\$[\s\S]*?\$\$;/g;
  let m, ultimo = 0;
  const pezzi = [];
  while ((m = blocco.exec(sql))) {
    pezzi.push({ testo: sql.slice(ultimo, m.index), blocco: false });
    pezzi.push({ testo: m[0], blocco: true });
    ultimo = m.index + m[0].length;
  }
  pezzi.push({ testo: sql.slice(ultimo), blocco: false });
  for (const p of pezzi) {
    if (p.blocco) { fuori.push(p.testo); continue; }
    for (const c of p.testo.split(';')) {
      const pulito = c.split('\n').filter((r) => !r.trim().startsWith('--')).join('\n').trim();
      if (pulito) fuori.push(pulito);
    }
  }
  return fuori;
}

(async () => {
  const sql = fs.readFileSync(file, 'utf8');
  const lista = comandi(sql);
  console.log(`comandi da eseguire: ${lista.length}`);
  for (const [i, c] of lista.entries()) {
    await prisma.$executeRawUnsafe(c);
    console.log(`  ${i + 1}/${lista.length} ok — ${c.replace(/\s+/g, ' ').slice(0, 70)}…`);
  }
  await prisma.$disconnect();
})().catch((e) => { console.error('ERRORE', e.message.slice(0, 400)); process.exit(1); });
