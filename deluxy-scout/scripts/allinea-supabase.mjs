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
import { execSync } from 'node:child_process';
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
  '0049_linee_canoniche.sql',
  '0050_sequenze.sql',
  '0051_stato_lead.sql',
  '0052_passo_mail_propria.sql',
  '0053_visita_motivi.sql',
  '0054_places_cancellazione.sql',
  '0055_preventivi_fornitori.sql',
  '0056_stato_a_rischio.sql',
];
// `ordini` è il proxy verso Deluxy Orders (venduto per provincia): resta inerte
// finché in cassaforte non c'è `ORDERS_API_KEY`, ma senza deploy non esiste
// proprio e la vista Province non mostra nessun valore di vendita.
// `invio-email` è cambiata il 29/07: prova PRIMA a mandare da AI Mail, che
// lascia la copia in «Inviata», e tiene l'SMTP come ripiego. Finché non è
// rideployata, le mail di Scout continuano a partire in SMTP diretto e nella
// casella di chi le scrive non ne resta traccia.
// `lead` e `trattativa` sono qui dal 29/07: accettano anche la chiave generata
// dall'app (Profilo → Impostazioni), non più solo il secret.
const FUNZIONI = ['anagrafiche', 'ordini', 'health', 'finance', 'invio-email', 'partner', 'lead', 'trattativa'];
// `health` deve rispondere SENZA sessione (il Hub non ne ha una): va deployata
// con --no-verify-jwt, altrimenti risponde 401 e la pagina «stato dei servizi»
// vede Scout come irraggiungibile.
// `partner` la chiama il registro Anagrafiche server-to-server: non ha e non
// può avere una sessione utente. L'auth è la chiave `COMMERCIALE_API_KEY`, come
// per `lead` e `trattativa`.
// ⚠️ `lead` e `trattativa` erano GIÀ pubblicate così: rideployarle senza la
// flag le romperebbe: col gateway JWT attivo la chiamata muore prima di
// arrivare al codice («Missing authorization header») e l'`x-api-key` non
// serve a niente. Chi le chiama è un server, non un utente loggato.
const SENZA_JWT = new Set(['health', 'partner', 'lead', 'trattativa']);

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
    // ⚠️ NON usare execFileSync('npx.cmd', […]).
    // Da Node 18.20.2 / 20.12.2 in poi (correzione della CVE-2024-27980),
    // `spawn` su Windows **rifiuta di eseguire un .cmd** senza shell e muore
    // con `spawnSync npx.cmd EINVAL`. Ed è esattamente ciò che è successo il
    // 28 e il 29/07/2026: tutte e quattro le funzioni «FALLITO», sempre, con
    // qualunque token — perché npx non partiva nemmeno. Non c'entravano né
    // Docker né l'autorizzazione, le due piste su cui abbiamo perso un giorno.
    //
    // Si passa quindi dalla shell, con un comando costruito a mano: con
    // `shell: true` più l'array di argomenti, Node 24 avvisa che gli argomenti
    // vengono concatenati senza escape (DEP0190). Qui la riga la scriviamo noi
    // e i pezzi sono tutti nostri e validati qui sotto.
    if (!/^[a-z0-9-]+$/.test(f) || !/^[a-z0-9-]+$/.test(PROJECT_REF)) {
      throw new Error(`nome funzione o project-ref non valido: ${f} / ${PROJECT_REF}`);
    }
    // `--use-api`: il bundling lo fanno i server di Supabase invece che Docker
    // in locale, che su questa macchina non è installato.
    const comando = [
      'npx -y supabase@latest functions deploy',
      f,
      '--project-ref',
      PROJECT_REF,
      '--use-api',
      SENZA_JWT.has(f) ? '--no-verify-jwt' : '',
    ]
      .filter(Boolean)
      .join(' ');
    execSync(comando, { cwd: RADICE, stdio: 'pipe', env: { ...process.env, SUPABASE_ACCESS_TOKEN: PAT } });
    console.log(SENZA_JWT.has(f) ? 'deployata (pubblica)' : 'deployata');
  } catch (e) {
    // ⚠️ Il motivo vero sta qui dentro, e va stampato PER INTERO.
    // Prima si tenevano le ultime 3 righe: sul fallimento del 28/07/2026 non
    // bastavano — restava «fallito passo 4» e nessuno sapeva perché. Un errore
    // riassunto non è un errore: è un secondo giro a vuoto.
    const grezzo = [e.stderr?.toString(), e.stdout?.toString(), e.message]
      .filter(Boolean)
      .join('\n')
      .trim();
    // I casi che capitano davvero, tradotti: il testo del CLI dice cosa è
    // successo ma non cosa fare.
    let consiglio = '';
    if (/docker/i.test(grezzo)) {
      consiglio =
        '\n     → Serve Docker, che qui non c\'è. Questo script usa --use-api apposta per non averne bisogno: se l\'errore resta, aggiorna il CLI (la flag è nelle versioni recenti).';
    } else if (/unauthorized|invalid.*token|401|403/i.test(grezzo)) {
      consiglio =
        '\n     → Token non valido, scaduto, o di un account che non vede questo progetto.\n       Verifica con: curl -H "Authorization: Bearer <pat>" https://api.supabase.com/v1/projects';
    } else if (/enoent|not recognized|non è riconosciuto/i.test(grezzo)) {
      consiglio =
        '\n     → npx non è partito affatto: aggiungi Node al PATH ($env:Path = "$env:ProgramFiles\\nodejs;$env:Path") e rilancia.';
    } else if (/einval/i.test(grezzo)) {
      // Non dovrebbe più capitare (si passa dalla shell), ma se qualcuno
      // «semplifica» tornando a execFileSync su .cmd, l'errore si spiega da sé.
      consiglio =
        '\n     → Node su Windows rifiuta di eseguire un .cmd senza shell (dalla CVE-2024-27980).\n       Il comando va lanciato con execSync/shell, non con execFileSync("npx.cmd").';
    }
    const indentato = grezzo
      ? grezzo.split('\n').map((r) => `     ${r}`).join('\n')
      : '     (il CLI non ha scritto niente: esito ' + (e.status ?? '?') + ')';
    console.log(`FALLITO\n${indentato}${consiglio}`);
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
