// Verifica il database REALE della piattaforma.
//
// Il 21/08/2026 e' emerso che il DB della piattaforma non e' il cluster condiviso
// (li' in public c'e' il FINANCE) ma il progetto Supabase `feleldlsreurqpdhstla`
// (account cs@deluxy.it, eu-west-1, piano Free), schema `public`. L'unica copia
// locale della sua stringa di connessione e' in:
//   C:\Users\nicol\scoutwt\deluxy-platform-next\api\.env
// (la cartella scoutwt e' obsoleta per il CODICE, ma ha l'ambiente).
//
// ⚠️ Il host diretto `db.<ref>.supabase.co` risolve SOLO su IPv6: da questa
// macchina non e' raggiungibile ("Can't reach database server"), mentre da Vercel
// si' — infatti da li' l'errore e' P1000, cioe' il server risponde e rifiuta la
// password. Per provare la password da qui si deve passare dal POOLER, che ha
// indirizzi IPv4, con l'utenza nella forma `postgres.<ref>`.
//
// Risponde a tre domande, senza mai stampare la password:
//   1. la password salvata in locale e' ancora valida?
//   2. le tabelle della piattaforma ci sono, e in quale schema?
//   3. cosa c'e' dentro: soli dati di seed o dati veri da salvare?
//
// Uso:  node C:/Users/nicol/app/deluxy-platform-next/scripts/verifica-database-vero.mjs

import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

// ⚠️ NON si legge da scoutwt/deluxy-platform-next/api/.env: quella copia ha la
// password VECCHIA (verificato, P1000). L'unica copia locale con la password
// attuale e' quella di AI Mail, che ha vissuto sullo stesso progetto Supabase
// fino al trasloco del 19/08 — vedi scripts/trova-password-valida.mjs.
const ENV_FILE = 'C:/Users/nicol/scoutwt/deluxy-mail/.env';
const CHIAVE = 'A_DATABASE_URL';
const REGION = 'eu-west-1';

const testo = fs.readFileSync(ENV_FILE, 'utf8');
const riga = testo.split(/\r?\n/).find((l) => l.startsWith(`${CHIAVE}=`));
if (!riga) { console.log(`Nessuna ${CHIAVE} in ${ENV_FILE}`); process.exit(1); }

const diretta = new URL(riga.slice(CHIAVE.length + 1).trim().replace(/^"|"$/g, ''));
// Il ref si ricava dal host diretto oppure dall'utenza `postgres.<ref>` del pooler.
const ref = /^db\./.test(diretta.hostname)
  ? diretta.hostname.replace(/^db\./, '').replace(/\.supabase\.co$/, '')
  : diretta.username.replace(/^postgres\./, '');

// Forma pooler: utenza `postgres.<ref>`, host regionale, porta 6543.
const pooler = new URL(diretta.toString());
pooler.username = `postgres.${ref}`;
pooler.hostname = `aws-0-${REGION}.pooler.supabase.com`;
pooler.port = '6543';
pooler.pathname = '/postgres';
pooler.search = '?pgbouncer=true&connection_limit=1';

console.log(`progetto: ${ref} · region: ${REGION}`);
console.log(`host nel file: ${diretta.host}`);
console.log(`host usato ora (pooler IPv4): ${pooler.host}`);
console.log('nota: db.<ref>.supabase.co risolve solo su IPv6 e da qui non si raggiunge.');
console.log('(password letta dal file, non stampata)\n');

process.env.DATABASE_URL = pooler.toString();
const prisma = new PrismaClient();

try {
  const schemi = await prisma.$queryRawUnsafe(`
    select table_schema, count(*)::int as n
    from information_schema.tables
    where table_type = 'BASE TABLE'
      and table_schema not in ('pg_catalog', 'information_schema')
    group by 1 order by 2 desc`);
  console.log('LA PASSWORD LOCALE E\' VALIDA. Schemi trovati:');
  for (const r of schemi) console.log(`  ${r.table_schema.padEnd(24)} ${r.n}`);

  const attese = ['User', 'Delivery', 'Partner', 'Valet', 'Product', 'AppSetting'];
  const pub = await prisma.$queryRawUnsafe(`
    select table_name from information_schema.tables where table_schema = 'public'`);
  const presenti = new Set(pub.map((r) => r.table_name));
  const mancanti = attese.filter((t) => !presenti.has(t));
  console.log('\nVERDETTO SULLE TABELLE:');
  console.log(mancanti.length === 0
    ? "  OK — e' il database della piattaforma (tabelle in public)."
    : `  NO — mancano in public: ${mancanti.join(', ')}`);

  console.log('\nCONTENUTO (per capire se sono soli dati di seed):');
  for (const t of ['User', 'Partner', 'Valet', 'Delivery', 'Customer', 'Product', 'Invoice', 'Salary']) {
    try {
      const [{ n }] = await prisma.$queryRawUnsafe(`select count(*)::int as n from "${t}"`);
      console.log(`  ${t.padEnd(16)} ${n}`);
    } catch { console.log(`  ${t.padEnd(16)} (assente)`); }
  }

  try {
    const utenti = await prisma.$queryRawUnsafe(
      `select email, role, "createdAt"::date as creato from "User" order by "createdAt" limit 20`);
    console.log('\nUTENTI (le demo del seed sono @deluxy.it):');
    for (const r of utenti)
      console.log(`  ${String(r.email).padEnd(36)} ${String(r.role).padEnd(16)} ${new Date(r.creato).toISOString().slice(0, 10)}`);
  } catch { /* schema diverso dal previsto */ }

  const [{ peso }] = await prisma.$queryRawUnsafe(
    `select pg_size_pretty(pg_database_size(current_database())) as peso`);
  const ro = await prisma.$queryRawUnsafe(`show transaction_read_only`);
  console.log(`\nDIMENSIONE: ${peso} · sola lettura: ${ro[0].transaction_read_only}`);
} catch (e) {
  const codice = e.errorCode ?? '';
  console.log(`ERRORE: ${e.constructor.name} ${codice}`);
  console.log(String(e.message).split('\n').slice(0, 6).join('\n'));
  if (codice === 'P1000')
    console.log('\n→ Il server risponde ma rifiuta la password: anche la copia locale e\' VECCHIA.\n' +
                '  Serve la password attuale dalla dashboard Supabase del progetto ' + ref + '.');
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
