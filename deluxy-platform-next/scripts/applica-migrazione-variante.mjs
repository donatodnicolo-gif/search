// Applica le migrazioni pendenti al cluster condiviso (schema platform).
//
// ⚠️ Le DDL passano dalla 5432 (diretta): pgbouncer in transaction mode sulla
// 6543 non le regge. La stringa si legge dai .env locali e NON si stampa mai.
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
const url = `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform`;

const r = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
  cwd: 'C:/Users/nicol/app/deluxy-platform-next/api',
  shell: true,
  encoding: 'utf8',
  env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
});
// La password non deve finire nella trascrizione: si maschera la FORMA.
const pulisci = (s) => (s ?? '').replaceAll(u.password, '<pw>');
console.log(pulisci(r.stdout).trim().split('\n').slice(-12).join('\n'));
if (r.status !== 0) {
  console.error('MIGRAZIONE FALLITA:', pulisci(r.stderr).slice(-500));
  process.exit(1);
}
