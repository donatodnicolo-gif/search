// Scrive DATABASE_URL e DIRECT_URL del progetto Vercel `delivery` (produzione e
// preview) puntandole al cluster Postgres condiviso in piano Pro, schema `platform`.
//
// Storia in due tappe, entrambe del 21/08/2026:
//  1. la produzione era giu' da 26 giorni perche' la DATABASE_URL su Vercel aveva
//     la password vecchia del progetto Supabase Free `feleldlsreurqpdhstla`
//     (Prisma P1000). Rimessa in piedi leggendo la password dal .env di AI Mail.
//  2. quel progetto e' Free e pesa 567 MB contro un tetto di 500: alla prima
//     soglia superata l'app sarebbe andata in sola lettura. Su decisione
//     dell'utente la piattaforma e' stata spostata sul cluster condiviso in Pro
//     (`zegbztfxisqeowngvgvh`), schema `platform`, come le altre 13 app —
//     vedi scripts/sposta-su-cluster-condiviso.mjs.
//
// ⚠️ Runtime sulla 6543 (transaction mode + pgbouncer), migrazioni sulla 5432.
// ⚠️ Si passa --value e mai lo stdin: da stdin Vercel infila un a-capo nel segreto.
// ⚠️ Il deploy va lanciato dalla RADICE del repo: la Root Directory del progetto
//    Vercel e' gia' `deluxy-platform-next`, da dentro la cartella il CLI la
//    raddoppia e fallisce.
// La password non viene mai stampata ne' passata alla shell.
//
// Uso:  node C:/Users/nicol/app/deluxy-platform-next/scripts/ripristina-database-vercel.mjs

import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const RADICE_REPO = 'C:/Users/nicol/app';
const SCHEMA = 'platform';
const PROGETTO = ['--scope', 'deluxy', '--project', 'delivery'];

const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
if (!riga) { console.log('Nessuna DATABASE_URL nel .env di deluxy-tasks'); process.exit(1); }

const sorgente = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
const url = (porta, extra) =>
  `postgresql://${sorgente.username}:${sorgente.password}` +
  `@${sorgente.hostname}:${porta}/postgres?schema=${SCHEMA}${extra}`;

const DATABASE_URL = url(6543, '&pgbouncer=true');
const DIRECT_URL = url(5432, '');

// ⚠️ Con shell:true gli argomenti NON vengono protetti: la `&` di
// `?schema=platform&pgbouncer=true` spezzava il comando in due e Windows provava
// a eseguire `pgbouncer` come programma. Ogni argomento va quindi virgolettato.
const proteggi = (a) => (/[\s&|<>^"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);

const vercel = (...args) => {
  const r = spawnSync('npx', ['vercel', ...args].map(proteggi),
    { encoding: 'utf8', shell: true, cwd: RADICE_REPO });
  return { ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() };
};

function riscrivi(nome, valore, ambiente) {
  vercel('env', 'rm', nome, ambiente, ...PROGETTO, '--yes'); // se non c'e', pazienza
  const r = vercel('env', 'add', nome, ambiente, ...PROGETTO, '--value', valore);
  console.log(`  ${nome} (${ambiente}): ${r.ok ? 'scritta' : 'ERRORE'}`);
  if (!r.ok) console.log(`    ${r.out.split('\n').slice(-3).join('\n    ')}`);
  return r.ok;
}

console.log(`cluster: ${sorgente.hostname} · schema: ${SCHEMA} · pooler 6543/5432`);
console.log('(password letta dal .env di deluxy-tasks, mai stampata)\n');

console.log('Riscrittura delle variabili:');
let ok = true;
for (const ambiente of ['production', 'preview']) {
  ok = riscrivi('DATABASE_URL', DATABASE_URL, ambiente) && ok;
  ok = riscrivi('DIRECT_URL', DIRECT_URL, ambiente) && ok;
}
if (!ok) { console.log('\nQualcosa non e\' stato scritto: mi fermo prima del deploy.'); process.exit(1); }

console.log('\nDeploy di produzione (dalla radice del repo)…');
const dep = vercel('deploy', '--prod', '--yes', ...PROGETTO);
console.log(dep.out.split('\n').filter((l) => /https:\/\/|Error|Aliased/.test(l)).slice(-4).join('\n'));
if (!dep.ok) process.exit(1);

console.log('\nVerifica:');
for (const rotta of ['/api/v1/provinces', '/api/v1/settings/public']) {
  const r = await fetch(`https://deluxy-delivery.vercel.app${rotta}`);
  console.log(`  ${rotta.padEnd(28)} ${r.status}  ${r.status === 401 ? '(401 = app viva, rotta protetta)' : ''}`);
}
