// Ispeziona il cluster Postgres condiviso e dice se le tabelle della piattaforma
// ci sono davvero, e in quale schema.
//
// Perche' esiste: dal 26/07/2026 la produzione risponde 500 su ogni /api/v1/*
// perche' la DATABASE_URL su Vercel ha la password vecchia (Prisma P1000). Prima
// di riscrivere le env di produzione conviene verificare che il database giusto
// sia questo: se le tabelle non ci sono, cambiare la password non serve a niente
// e l'errore passerebbe solo da P1000 a "relation does not exist".
//
// La password si legge dal .env di deluxy-tasks (stessa utenza pooler del cluster
// condiviso) e non viene MAI stampata.
//
// Uso:  node C:/Users/nicol/app/deluxy-platform-next/scripts/ispeziona-cluster.mjs

import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

const ENV_FILE = 'C:/Users/nicol/app/deluxy-tasks/.env';

function urlDalEnv() {
  const testo = fs.readFileSync(ENV_FILE, 'utf8');
  const riga = testo.split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
  if (!riga) throw new Error(`Nessuna DATABASE_URL in ${ENV_FILE}`);
  const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
  // Il .env di tasks punta allo schema `tasks`: qui vogliamo il database intero.
  u.pathname = '/postgres';
  u.search = '?pgbouncer=true&connection_limit=1';
  return u;
}

const u = urlDalEnv();
process.env.DATABASE_URL = u.toString();
console.log(`host: ${u.host} · utenza: ${u.username} · db: ${u.pathname.slice(1)}`);
console.log('(password letta dal .env, non stampata)\n');

const prisma = new PrismaClient();
try {
  const schemi = await prisma.$queryRawUnsafe(`
    select table_schema, count(*)::int as n
    from information_schema.tables
    where table_type = 'BASE TABLE'
      and table_schema not in ('pg_catalog', 'information_schema')
    group by 1 order by 2 desc`);
  console.log('SCHEMI E NUMERO DI TABELLE:');
  for (const r of schemi) console.log(`  ${r.table_schema.padEnd(24)} ${r.n}`);

  const pub = await prisma.$queryRawUnsafe(`
    select table_name from information_schema.tables
    where table_schema = 'public' order by 1`);
  console.log(`\nTABELLE IN public (${pub.length}):`);
  console.log('  ' + (pub.map((r) => r.table_name).join(', ') || '(nessuna)'));

  // Le tabelle chiave della piattaforma: senza @@map nello schema Prisma,
  // Prisma usa il nome del modello cosi' com'e'.
  const attese = ['User', 'Delivery', 'Partner', 'Valet', 'Product', 'AppSetting'];
  const inSchema = async (schema) => {
    const r = await prisma.$queryRawUnsafe(
      `select table_name from information_schema.tables where table_schema = '${schema}'`);
    const presenti = new Set(r.map((x) => x.table_name));
    return attese.filter((t) => !presenti.has(t));
  };

  console.log('\nVERDETTO (atteso dal 21/08/2026):');

  const inPlatform = await inSchema('platform');
  console.log(inPlatform.length === 0
    ? "  OK — la piattaforma e' nello schema `platform`, dove deve stare."
    : `  ATTENZIONE — in \`platform\` mancano: ${inPlatform.join(', ')}`);

  // ⚠️ `Partner` esiste in ENTRAMBI (il FINANCE ha il suo): usarlo qui darebbe un
  // falso allarme. E' la stessa omonimia che il 21/08 rese credibile la diagnosi
  // sbagliata — per il controllo su `public` servono solo nomi non ambigui.
  const soloPiattaforma = ['User', 'Delivery', 'Valet', 'Product', 'AppSetting'];
  const nomiPublic = new Set(pub.map((r) => r.table_name));
  const intrusi = soloPiattaforma.filter((t) => nomiPublic.has(t));
  console.log(intrusi.length === 0
    ? "  OK — in `public` non c'e' nulla della piattaforma: li' vive il FINANCE, ed e' giusto cosi'."
    : `  ATTENZIONE — in \`public\` sono comparse tabelle della piattaforma (${intrusi.join(', ')}):\n` +
      '  quello e\' lo schema del FINANCE. Qualcuno ha puntato la DATABASE_URL senza `?schema=platform`.');
} catch (e) {
  console.log(`ERRORE: ${e.constructor.name} ${e.errorCode ?? ''}`);
  console.log(String(e.message).split('\n').slice(0, 6).join('\n'));
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
