// Sposta il database della piattaforma dal progetto Supabase Free
// `feleldlsreurqpdhstla` (567 MB, oltre il tetto di 500) al cluster condiviso in
// piano Pro `zegbztfxisqeowngvgvh`, in uno schema dedicato `platform` — come le
// altre 13 app Deluxy.
//
// Non cancella NIENTE sul progetto vecchio: resta intatto come rete di sicurezza.
// Il contenuto era comunque di soli dati di seed (misurato il 21/08/2026).
//
// Passi: crea lo schema → migrate deploy della baseline → seed.
// Le env di Vercel si riscrivono dopo, con ripristina-database-vercel.mjs.
//
// ⚠️ Migrazioni sulla porta 5432 (session mode), runtime sulla 6543 (transaction
// mode + pgbouncer): pgbouncer in transaction mode non regge le DDL di Prisma.
// La password non viene mai stampata.
//
// Uso:  node C:/Users/nicol/app/deluxy-platform-next/scripts/sposta-su-cluster-condiviso.mjs

import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

const RADICE = 'C:/Users/nicol/app/deluxy-platform-next';
const SCHEMA = 'platform';

// La password del cluster condiviso e' nei .env di tutte le app che ci stanno sopra.
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const sorgente = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
const utenza = sorgente.username;                    // postgres.zegbztfxisqeowngvgvh
const password = sorgente.password;                  // gia' URL-encoded nel file
const host = sorgente.hostname;                      // aws-0-eu-central-1.pooler.supabase.com

const url = (porta, extra) =>
  `postgresql://${utenza}:${password}@${host}:${porta}/postgres?schema=${SCHEMA}${extra}`;

const RUNTIME = url(6543, '&pgbouncer=true');   // per l'app
const MIGRAZIONI = url(5432, '');               // per le DDL

console.log(`cluster: ${host} · utenza: ${utenza} · schema: ${SCHEMA}`);
console.log('(password letta dal .env di deluxy-tasks, mai stampata)\n');

// 1. Lo schema deve esistere prima che Prisma ci scriva dentro.
process.env.DATABASE_URL = MIGRAZIONI;
{
  const prisma = new PrismaClient();
  try {
    await prisma.$executeRawUnsafe(`create schema if not exists "${SCHEMA}"`);
    console.log(`1/3  schema "${SCHEMA}" pronto`);
  } catch (e) {
    console.log(`1/3  ERRORE creando lo schema: ${e.message.split('\n')[0]}`);
    process.exit(1);
  } finally { await prisma.$disconnect(); }
}

const esegui = (titolo, comando, args, cwd, env) => {
  const r = spawnSync(comando, args, {
    cwd, encoding: 'utf8', shell: true,
    env: { ...process.env, ...env },
  });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim();
  console.log(`${titolo}  ${r.status === 0 ? 'OK' : 'ERRORE'}`);
  console.log(out.split('\n').slice(-8).map((l) => `     ${l}`).join('\n'));
  return r.status === 0;
};

// 2. La baseline Postgres (41 tabelle) dentro lo schema nuovo.
if (!esegui('2/3  migrate deploy:', 'npx', ['prisma', 'migrate', 'deploy'],
  `${RADICE}/api`, { DATABASE_URL: MIGRAZIONI })) process.exit(1);

// 3. Dati demo (province, servizi, categorie, utenti): senza, l'app e' vuota.
if (!esegui('3/3  seed:', 'npm', ['run', 'seed'],
  `${RADICE}/api`, { DATABASE_URL: MIGRAZIONI })) process.exit(1);

// Controprova sul runtime vero (pooler 6543), non su quello delle migrazioni.
process.env.DATABASE_URL = RUNTIME;
{
  const prisma = new PrismaClient();
  try {
    console.log('\nControprova dal pooler 6543 (la connessione che user\u00e0 l\'app):');
    for (const t of ['User', 'Province', 'ServiceType', 'Partner', 'Product']) {
      const [{ n }] = await prisma.$queryRawUnsafe(`select count(*)::int as n from "${t}"`);
      console.log(`  ${t.padEnd(14)} ${n}`);
    }
  } catch (e) {
    console.log(`  ERRORE: ${e.message.split('\n')[0]}`);
    process.exitCode = 1;
  } finally { await prisma.$disconnect(); }
}
