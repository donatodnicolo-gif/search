// Genera una migrazione Prisma confrontando schema.prisma col database vero, e
// la applica. Non usa `migrate dev`, che vorrebbe un shadow database e che su un
// ambiente gia' in produzione e' rischioso.
//
// ⚠️ Le DDL vanno sulla porta 5432 (session mode): pgbouncer in transaction mode
// non le regge.
//
// Uso:
//   node .../crea-migrazione.mjs nome_migrazione            # mostra l'SQL e basta
//   node .../crea-migrazione.mjs nome_migrazione --applica  # scrive e applica

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const NOME = args.find((a) => !a.startsWith('--'));
const APPLICA = args.includes('--applica');
if (!NOME) { console.log('Manca il nome della migrazione.'); process.exit(1); }

const RADICE = 'C:/Users/nicol/app/deluxy-platform-next';
const SCHEMA = `${RADICE}/api/prisma/schema.prisma`;
const SCHEMA_DB = 'platform';

const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
const MIGRAZIONI =
  `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=${SCHEMA_DB}`;

const prisma = (...a) => spawnSync('npx', ['prisma', ...a], {
  cwd: `${RADICE}/api`, encoding: 'utf8', shell: true,
  env: { ...process.env, DATABASE_URL: MIGRAZIONI },
});

// 1. Che cosa manca al database per somigliare allo schema?
const diff = prisma('migrate', 'diff',
  '--from-url', `"${MIGRAZIONI}"`,
  '--to-schema-datamodel', `"${SCHEMA}"`,
  '--script');

if (diff.status !== 0) {
  console.log('Errore nel calcolo del diff:');
  console.log(`${diff.stdout ?? ''}${diff.stderr ?? ''}`.trim().split('\n').slice(-10).join('\n'));
  process.exit(1);
}

const sql = (diff.stdout ?? '').trim();
if (!sql || /^-- This is an empty migration/i.test(sql)) {
  console.log('Nessuna differenza: il database e\' gia\' allineato allo schema.');
  process.exit(0);
}

console.log('SQL della migrazione:\n');
console.log(sql);

if (!APPLICA) {
  console.log('\n(solo anteprima — aggiungi --applica per scriverla ed eseguirla)');
  process.exit(0);
}

// 2. La si scrive come migrazione vera, cosi' resta nello storico e vale anche
//    per chi ricostruisce il database da zero.
const stampa = new Date(fs.statSync(SCHEMA).mtime).toISOString()
  .replace(/[-:T]/g, '').slice(0, 14);
const cartella = path.join(RADICE, 'api/prisma/migrations', `${stampa}_${NOME}`);
fs.mkdirSync(cartella, { recursive: true });
fs.writeFileSync(path.join(cartella, 'migration.sql'), sql + '\n');
console.log(`\nScritta in ${path.relative(RADICE, cartella)}`);

// 3. Applicata.
const dep = prisma('migrate', 'deploy');
console.log(`${dep.stdout ?? ''}${dep.stderr ?? ''}`.trim().split('\n').slice(-6).join('\n'));
process.exitCode = dep.status ?? 1;
