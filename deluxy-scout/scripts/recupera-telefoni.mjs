#!/usr/bin/env node
// Recupera i telefoni delle affiliazioni dal testo libero `contattiRaw` di Anagrafiche
// e li rende chiamabili in Scout: per ogni affiliazione (place con anagrafiche_id) che
// NON ha ancora un contatto con telefono, inserisce un contatto "Recapito" col numero.
//
// Uso (PowerShell):
//   $env:ANAGRAFICHE_API_KEY = "dlxk_..."   # sola lettura
//   $env:SUPABASE_PAT        = "sbp_..."     # Management API
//   node scripts/recupera-telefoni.mjs [--dry]
import { readFileSync } from 'node:fs';

const ANAG_URL = process.env.ANAGRAFICHE_URL || 'https://deluxy-anagrafiche.vercel.app';
const ANAG_KEY = process.env.ANAGRAFICHE_API_KEY;
const PAT = process.env.SUPABASE_PAT;
const REF = process.env.SUPABASE_REF || 'fdsziebgkljfsugqqbqd';
const DRY = process.argv.includes('--dry');
if (!ANAG_KEY || !PAT) { console.error('Servono ANAGRAFICHE_API_KEY e SUPABASE_PAT'); process.exit(1); }

async function sql(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${PAT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`SQL ${r.status}: ${t.slice(0, 300)}`);
  return JSON.parse(t || '[]');
}
const lit = (v) => (v == null ? 'null' : `$q$${String(v)}$q$`);

// Estrae numeri di telefono italiani VALIDI da testo libero.
// Validazione stretta per non inserire numeri troncati/sbagliati:
//   cellulare = 10 cifre che iniziano per 3 · fisso = inizia per 0, 8-11 cifre.
// Ritorna { mobile, fisso } (dial-safe: solo cifre; il display li mostra così).
function estraiTelefoni(testo) {
  if (!testo) return { mobile: null, fisso: null };
  const mobili = [], fissi = [];
  // Sequenze con eventuale +39, gruppi di cifre separati da spazi/punti/trattini/slash.
  const re = /(?:\+?39[\s.]?)?(?:\d[\d\s.\-/]{6,14}\d)/g;
  for (const m of testo.matchAll(re)) {
    let n = m[0].replace(/[^\d]/g, '').replace(/^0039/, '').replace(/^39(?=3\d{9}$)/, '');
    if (/^3\d{9}$/.test(n)) mobili.push(n); // cellulare valido (10 cifre)
    else if (/^0\d{7,10}$/.test(n)) fissi.push(n); // fisso valido
  }
  const fmtMob = (n) => (n ? n.replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2 $3') : null);
  return { mobile: fmtMob(mobili[0] ?? null), fisso: fissi[0] ?? null };
}

// 1. Affiliazioni Scout SENZA telefono in rubrica (per anagrafiche_id).
const senza = await sql(`
  select p.anagrafiche_id
  from places p
  where p.linea_ipotizzata = 'Re-seller' and p.anagrafiche_id is not null
    and not exists (select 1 from contacts c where c.place_id = p.id and c.telefono is not null);
`);
const senzaSet = new Set(senza.map((r) => r.anagrafiche_id));
console.log(`Affiliazioni senza telefono in Scout: ${senzaSet.size}`);

// 2. Scarica le anagrafiche col loro contattiRaw.
const partners = [];
for (let pagina = 1; ; pagina++) {
  const r = await fetch(`${ANAG_URL}/api/v1/partners?perPage=200&attivo=tutti&page=${pagina}`, {
    headers: { 'x-api-key': ANAG_KEY },
  });
  const j = await r.json();
  partners.push(...j.dati);
  if (partners.length >= j.totale || !j.dati.length) break;
}

// 3. Per quelle senza telefono, prova a estrarlo dal raw.
const daInserire = [];
let conMobile = 0, conFisso = 0;
for (const p of partners) {
  if (!senzaSet.has(p.id)) continue;
  const raw = p.contattiRaw || (p.contatti ?? []).map((c) => `${c.ruolo ?? ''} ${c.nome ?? ''} ${c.telefono ?? ''}`).join('\n');
  const { mobile, fisso } = estraiTelefoni(raw);
  const tel = mobile ?? fisso;
  if (!tel) continue;
  if (mobile) conMobile++; else conFisso++;
  daInserire.push({ aid: p.id, tel, tipo: mobile ? 'cellulare' : 'fisso' });
}

console.log(`Numeri recuperati dal testo: ${daInserire.length}  (cellulari ${conMobile}, fissi ${conFisso})`);
console.log('Esempi:');
for (const d of daInserire.slice(0, 8)) {
  const nome = partners.find((p) => p.id === d.aid)?.nome;
  console.log(`  ${d.tel.padEnd(14)} ${d.tipo.padEnd(10)} ${nome}`);
}

if (DRY) { console.log('\n(--dry: nessuna scrittura)'); process.exit(0); }

// 4. Inserisci un contatto "Recapito" con il numero (a lotti).
let scritti = 0;
for (let i = 0; i < daInserire.length; i += 100) {
  const lotto = daInserire.slice(i, i + 100);
  const values = lotto.map((d) => `(${lit(d.aid)}, ${lit(d.tel)}, ${lit(d.tipo === 'cellulare' ? 'Recapito (cell.)' : 'Recapito')})`).join(',\n');
  await sql(`
    with d(aid, tel, ruolo) as (values ${values})
    insert into contacts (place_id, nome, ruolo, telefono, is_decisore)
    select p.id, 'Recapito', d.ruolo, d.tel, false
    from d join places p on p.anagrafiche_id = d.aid
    where not exists (select 1 from contacts c where c.place_id = p.id and c.telefono is not null);
  `);
  scritti += lotto.length;
  console.log(`  inseriti ${Math.min(scritti, daInserire.length)}/${daInserire.length}`);
}
console.log('Fatto ✔');
