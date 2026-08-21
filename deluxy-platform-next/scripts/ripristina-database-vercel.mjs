// Riscrive DATABASE_URL e DIRECT_URL di produzione sul progetto Vercel `delivery`
// e rimette in piedi https://deluxy-delivery.vercel.app.
//
// Storia: dal 26/07/2026 ogni /api/v1/* rispondeva 500 perche' la DATABASE_URL su
// Vercel aveva la password vecchia del progetto Supabase `feleldlsreurqpdhstla`
// (Prisma P1000). La password attuale esiste in una sola copia locale: il .env di
// AI Mail, che ha vissuto sullo stesso progetto fino al trasloco del 19/08.
//
// ⚠️ Si usa il POOLER e non il host diretto: `db.<ref>.supabase.co` risolve solo
// su IPv6 ed e' inadatto al runtime serverless.
// ⚠️ Si passa --value e mai lo stdin: da stdin Vercel infila un a-capo nel segreto.
// La password non viene mai stampata ne' passata alla shell (spawn senza shell).
//
// Uso:  node C:/Users/nicol/app/deluxy-platform-next/scripts/ripristina-database-vercel.mjs

import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const ENV_FILE = 'C:/Users/nicol/scoutwt/deluxy-mail/.env';
const CHIAVE = 'A_DATABASE_URL';
const REF = 'feleldlsreurqpdhstla';
const REGION = 'eu-west-1';
const PROGETTO = ['--scope', 'deluxy', '--project', 'delivery'];

const riga = fs.readFileSync(ENV_FILE, 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith(`${CHIAVE}=`));
if (!riga) { console.log(`Nessuna ${CHIAVE} in ${ENV_FILE}`); process.exit(1); }

const sorgente = new URL(riga.slice(CHIAVE.length + 1).trim().replace(/^"|"$/g, ''));
const password = decodeURIComponent(sorgente.password);

/** Costruisce la connessione pooler per la porta data. 6543 = transaction, 5432 = session. */
const url = (porta, extra) =>
  `postgresql://postgres.${REF}:${encodeURIComponent(password)}` +
  `@aws-0-${REGION}.pooler.supabase.com:${porta}/postgres${extra}`;

const DATABASE_URL = url(6543, '?pgbouncer=true');
const DIRECT_URL = url(5432, '');

const vercel = (...args) => {
  const r = spawnSync('npx', ['vercel', ...args], { encoding: 'utf8', shell: true });
  return { ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() };
};

/** Riscrive una variabile in un ambiente: prima la toglie, poi la rimette. */
function riscrivi(nome, valore, ambiente) {
  vercel('env', 'rm', nome, ambiente, ...PROGETTO, '--yes'); // se non c'e', non importa
  const r = vercel('env', 'add', nome, ambiente, ...PROGETTO, '--value', valore);
  console.log(`  ${nome} (${ambiente}): ${r.ok ? 'scritta' : 'ERRORE'}`);
  if (!r.ok) console.log(`    ${r.out.split('\n').slice(-3).join('\n    ')}`);
  return r.ok;
}

console.log(`progetto Supabase: ${REF} · region: ${REGION} · pooler 6543/5432`);
console.log('(password letta dal .env di AI Mail, mai stampata)\n');

console.log('Riscrittura delle variabili:');
let ok = true;
for (const ambiente of ['production', 'preview']) {
  ok = riscrivi('DATABASE_URL', DATABASE_URL, ambiente) && ok;
  ok = riscrivi('DIRECT_URL', DIRECT_URL, ambiente) && ok;
}
if (!ok) { console.log('\nQualcosa non e\' stato scritto: mi fermo prima del deploy.'); process.exit(1); }

console.log('\nDeploy di produzione…');
const dep = vercel('deploy', '--prod', '--yes', ...PROGETTO);
console.log(dep.out.split('\n').slice(-6).join('\n'));
if (!dep.ok) process.exit(1);

console.log('\nVerifica delle rotte (devono passare da 500 a 200):');
for (const rotta of ['/api/v1/provinces', '/api/v1/settings/public']) {
  const r = await fetch(`https://deluxy-delivery.vercel.app${rotta}`);
  console.log(`  ${rotta.padEnd(28)} ${r.status}`);
}
