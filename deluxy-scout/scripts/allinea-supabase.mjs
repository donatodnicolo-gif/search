#!/usr/bin/env node
// Allinea il backend Supabase di Deluxy Scout: applica le migrazioni non ancora
// applicate e rideploya le Edge Functions che sono cambiate.
//
// Uso (PowerShell):
//   $env:SUPABASE_PAT = "sbp_..."
//   node scripts/allinea-supabase.mjs
//
// Il token NON viene mai scritto su file né stampato: si passa da variabile
// d'ambiente e resta in memoria del processo. È lo stesso token che serve a
// `mgmt-query.mjs` (Management API) e a `supabase functions deploy`.
//
// Perché esiste: le migrazioni si applicavano una per una a mano, ricordandosi
// quali; e il deploy delle funzioni si dimenticava — con l'effetto che una
// schermata restava vuota senza dire perché (è successo con `anagrafiche` e il
// filtro per fonte). Qui c'è la lista di cosa deve essere allineato.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROJECT_REF = process.env.SUPABASE_REF || 'fdsziebgkljfsugqqbqd';
const PAT = process.env.SUPABASE_PAT || process.env.SUPABASE_ACCESS_TOKEN;

// Cosa allineare. Le migrazioni sono idempotenti: rilanciarle non fa danni, e
// la 0046 va anzi rilanciata apposta (il canale `web` è arrivato dopo).
const MIGRAZIONI = [
  '0045_chiavi_app.sql',
  '0046_contatti_avviati.sql',
  '0047_bozze_e_pianificazione.sql',
  '0048_stato_selezionato.sql',
];
// `ordini` è il proxy verso Deluxy Orders (venduto per provincia): resta inerte
// finché in cassaforte non c'è `ORDERS_API_KEY`, ma senza deploy non esiste
// proprio e la vista Province non mostra nessun valore di vendita.
const FUNZIONI = ['anagrafiche', 'ordini', 'health'];
// `health` deve rispondere SENZA sessione (il Hub non ne ha una): va deployata
// con --no-verify-jwt, altrimenti risponde 401 e la pagina «stato dei servizi»
// vede Scout come irraggiungibile.
const SENZA_JWT = new Set(['health']);

if (!PAT) {
  console.error('\n✗ Manca SUPABASE_PAT.\n');
  console.error('  Il token si crea da https://supabase.com/dashboard/account/tokens');
  console.error('  poi, in PowerShell, nella cartella deluxy-scout:\n');
  console.error('    $env:SUPABASE_PAT = "sbp_..."');
  console.error('    node scripts/allinea-supabase.mjs\n');
  process.exit(1);
}

async function eseguiSql(nomeFile) {
  const sql = readFileSync(join(RADICE, 'supabase/migrations', nomeFile), 'utf8');
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${PAT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const testo = await res.text();
  if (!res.ok) throw new Error(`${res.status} — ${testo.slice(0, 300)}`);
  return testo;
}

let errori = 0;

console.log(`\nProgetto Supabase: ${PROJECT_REF}\n`);
console.log('── Migrazioni ──────────────────────────────────');
for (const m of MIGRAZIONI) {
  process.stdout.write(`  ${m} … `);
  try {
    await eseguiSql(m);
    console.log('ok');
  } catch (e) {
    console.log(`FALLITA\n     ${e.message}`);
    errori++;
  }
}

console.log('\n── Edge Functions ──────────────────────────────');
for (const f of FUNZIONI) {
  process.stdout.write(`  ${f} … `);
  try {
    execFileSync(
      process.platform === 'win32' ? 'npx.cmd' : 'npx',
      [
        '-y',
        'supabase@latest',
        'functions',
        'deploy',
        f,
        '--project-ref',
        PROJECT_REF,
        ...(SENZA_JWT.has(f) ? ['--no-verify-jwt'] : []),
      ],
      { cwd: RADICE, stdio: 'pipe', env: { ...process.env, SUPABASE_ACCESS_TOKEN: PAT } },
    );
    console.log(SENZA_JWT.has(f) ? 'deployata (pubblica)' : 'deployata');
  } catch (e) {
    // stderr del CLI: contiene il motivo vero (Docker mancante, token scaduto…).
    const dettaglio = (e.stderr?.toString() || e.message || '').trim().split('\n').slice(-3).join(' ');
    console.log(`FALLITO\n     ${dettaglio}`);
    errori++;
  }
}

console.log('');
if (errori) {
  console.log(`✗ ${errori} passo/i non riuscito/i: vedi sopra.\n`);
  process.exit(1);
}
console.log('✓ Backend allineato. Nell\'app: le bozze di visita si salvano, la data');
console.log('  della visita si può impostare e i Segnalati · Fornitori si vedono tutti.\n');
