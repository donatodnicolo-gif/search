// Verifica che il cluster su cui gira la piattaforma sia davvero un progetto A
// PAGAMENTO, e non un Free — e che sia lo stesso delle altre app Deluxy.
//
// Il piano NON si legge dal database: cluster Free e Pro mostrano la stessa
// istanza Micro (max_connections=60, shared_buffers=224MB). La prova decisiva
// sono i BACKUP: sul piano Free non esistono proprio.
//
// Il PAT si legge da scoutwt/deluxy-scout/.env (SUPABASE_PAT) e non viene mai stampato.
//
// Uso:  node C:/Users/nicol/app/deluxy-platform-next/scripts/verifica-piano-supabase.mjs

import fs from 'node:fs';

const PROGETTI = {
  zegbztfxisqeowngvgvh: 'cluster condiviso — ci gira la PIATTAFORMA (schema platform) + 13 app',
  feleldlsreurqpdhstla: 'vecchio progetto della piattaforma (abbandonato il 21/08)',
  fdsziebgkljfsugqqbqd: 'deluxy-scout',
};

const riga = fs.readFileSync('C:/Users/nicol/scoutwt/deluxy-scout/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('SUPABASE_PAT='));
if (!riga) { console.log('Nessun SUPABASE_PAT trovato'); process.exit(1); }
const pat = riga.slice('SUPABASE_PAT='.length).trim().replace(/^"|"$/g, '');

const api = async (percorso) => {
  const r = await fetch(`https://api.supabase.com/v1${percorso}`, {
    headers: { Authorization: `Bearer ${pat}` },
  });
  return { stato: r.status, corpo: r.ok ? await r.json() : await r.text() };
};

const org = await api('/organizations');
if (org.stato !== 200) {
  console.log(`PAT non utilizzabile: HTTP ${org.stato} — ${String(org.corpo).slice(0, 200)}`);
  process.exit(1);
}
console.log('ORGANIZZAZIONI:');
for (const o of org.corpo) console.log(`  ${o.name} (${o.id}) · piano: ${o.plan?.name ?? o.plan ?? '(non esposto)'}`);

const prog = await api('/projects');
console.log('\nPROGETTI:');
for (const p of (prog.corpo ?? [])) {
  const nota = PROGETTI[p.id];
  console.log(`  ${p.id}  ${String(p.region).padEnd(14)} ${String(p.status).padEnd(14)} ${p.name}`);
  if (nota) console.log(`      → ${nota}`);
}

console.log('\nPROVA DEL PIANO (i backup non esistono sul Free):');
for (const ref of Object.keys(PROGETTI)) {
  const b = await api(`/projects/${ref}/database/backups`);
  if (b.stato !== 200) { console.log(`  ${ref}: HTTP ${b.stato}`); continue; }
  const n = (b.corpo.backups ?? []).length;
  console.log(`  ${ref}: ${n} backup · ${n > 0 ? '✅ progetto A PAGAMENTO' : '❌ nessun backup → Free'}`);
}
