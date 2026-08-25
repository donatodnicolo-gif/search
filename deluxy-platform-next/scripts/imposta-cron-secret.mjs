// Genera CRON_SECRET e lo scrive nelle env del progetto Vercel `delivery`.
//
// Vercel invoca i cron di vercel.json con `Authorization: Bearer <CRON_SECRET>`
// quando la variabile esiste: e' l'identita' della corsa notturna dei margini
// (`/api/v1/cron/margini`). Senza variabile la rotta risponde 401 a tutti.
//
// ⚠️ Il segreto NON si stampa mai (regola 3: niente segreti in chiaro).
// Uso: node scripts/imposta-cron-secret.mjs
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const PROGETTO = ['--scope', 'deluxy', '--project', 'delivery'];
const segreto = randomBytes(32).toString('hex');

const vercel = (...args) =>
  spawnSync('npx', ['vercel', ...args], {
    cwd: 'C:/Users/nicol/app',
    shell: true,
    encoding: 'utf8',
  });

for (const ambiente of ['production', 'preview']) {
  vercel('env', 'rm', 'CRON_SECRET', ambiente, ...PROGETTO, '--yes'); // se non c'e', pazienza
  const r = vercel('env', 'add', 'CRON_SECRET', ambiente, ...PROGETTO, '--value', segreto);
  const esito = r.status === 0 ? 'ok' : `FALLITO (exit ${r.status}): ${(r.stderr || r.stdout || '').slice(-300)}`;
  console.log(`CRON_SECRET ${ambiente}: ${esito}`);
}

// Copia locale per le verifiche a mano (curl con Bearer), fuori dal repo.
import { writeFileSync } from 'node:fs';
const dove = process.env.TEMP
  ? `${process.env.TEMP}/deluxy-cron-secret.txt`
  : 'C:/Users/nicol/AppData/Local/Temp/deluxy-cron-secret.txt';
writeFileSync(dove, segreto, 'utf8');
console.log(`Copia per la verifica in: ${dove} (da cancellare dopo)`);
