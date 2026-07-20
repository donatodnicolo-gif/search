#!/usr/bin/env node
// Importa il registro centralizzato Deluxy Anagrafiche dentro Scout.
//
//   Anagrafiche (fonte di verità, Postgres condiviso)  ──API──▶  Scout (Supabase)
//     Partner  → places   (con anagrafiche_id per il legame)
//     Contatto → contacts
//
// È RI-ESEGUIBILE: il legame è `places.anagrafiche_id` (indice unico), quindi un
// secondo giro aggiorna invece di duplicare. Le anagrafiche già importate non
// vengono ri-geocodificate (le geocodifiche costano).
//
// Uso (PowerShell):
//   $env:ANAGRAFICHE_API_KEY = "dlxk_..."      # chiave di SOLA LETTURA
//   $env:SUPABASE_PAT        = "sbp_..."       # Management API (esegue l'SQL)
//   node scripts/import-anagrafiche.mjs [--dry]
//
// La chiave Google per il geocoding si legge da .env (EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY)
// o da GOOGLE_GEOCODING_KEY.
import { readFileSync } from 'node:fs';

const ANAG_URL = process.env.ANAGRAFICHE_URL || 'https://deluxy-anagrafiche.vercel.app';
const ANAG_KEY = process.env.ANAGRAFICHE_API_KEY;
const PAT = process.env.SUPABASE_PAT;
const REF = process.env.SUPABASE_REF || 'fdsziebgkljfsugqqbqd';
const DRY = process.argv.includes('--dry');

let GKEY = process.env.GOOGLE_GEOCODING_KEY;
if (!GKEY) {
  try {
    GKEY = (readFileSync('.env', 'utf8').match(/EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY=(.+)/) || [])[1]?.trim();
  } catch { /* .env assente */ }
}
if (!ANAG_KEY || !PAT) {
  console.error('Servono ANAGRAFICHE_API_KEY e SUPABASE_PAT');
  process.exit(1);
}
if (!GKEY) {
  console.error('Serve la chiave Google (GOOGLE_GEOCODING_KEY o .env)');
  process.exit(1);
}

/** Esegue SQL sul DB Scout via Management API. */
async function sql(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${PAT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`SQL ${r.status}: ${t.slice(0, 400)}`);
  return JSON.parse(t || '[]');
}

/** Incapsula un oggetto JS come letterale jsonb dollar-quoted (niente escaping fragile). */
function jsonLit(v) {
  const s = JSON.stringify(v);
  if (s.includes('$anag$')) throw new Error('delimitatore in collisione col contenuto');
  return `$anag$${s}$anag$`;
}

// Categoria del registro → categoria Scout (poi category_rules assegna linea/priorità/aggancio).
const CATEGORIA = {
  BOUTIQUE: 'moda',
  FIORISTA: 'fioraio',
  PASTICCERIA: 'pasticceria',
  CIOCCOLATERIA: 'pasticceria',
  GIOIELLERIA: 'gioielleria',
  RISTORANTE: 'ristorante premium',
  ENOTECA: 'ristorante premium',
  CATERING: 'event planner',
  PARTY: 'event planner',
  GIFTING: 'azienda corporate',
  MERCHANDISING: 'azienda corporate',
  'CHEF PRIVATO': 'altro',
  CONCIERGE: 'altro',
};
// Stato del registro (7 valori) → stato Scout (4). Quello originale resta in anagrafiche_stato.
const STATO = {
  prospect: 'da_visitare',
  in_attesa: 'da_visitare',
  in_contatto: 'da_visitare',
  da_ricontattare: 'da_visitare',
  in_trattativa: 'visitato',
  attivo: 'cliente',
  non_interessato: 'perso',
  dismesso: 'perso',
};
const DECISORE = /titolare|founder|owner|proprietar|ceo|general manager|direttore/i;

// ── 1. Scarica il registro ──────────────────────────────────────────────────
console.log('→ scarico le anagrafiche…');
const partners = [];
for (let pagina = 1; ; pagina++) {
  const r = await fetch(`${ANAG_URL}/api/v1/partners?perPage=200&attivo=tutti&page=${pagina}`, {
    headers: { 'x-api-key': ANAG_KEY },
  });
  if (!r.ok) throw new Error(`Anagrafiche ${r.status}: ${await r.text()}`);
  const j = await r.json();
  partners.push(...j.dati);
  if (partners.length >= j.totale || !j.dati.length) break;
}
// --limite=N: prova su poche anagrafiche prima di lanciare tutto (le geocodifiche costano).
const LIMITE = Number((process.argv.find((a) => a.startsWith('--limite=')) ?? '').split('=')[1]) || 0;
if (LIMITE) partners.splice(LIMITE);
console.log(`  ${partners.length} anagrafiche${LIMITE ? ` (limitate a ${LIMITE})` : ''}`);

// ── 2. Quali sono già dentro (per non ri-geocodificare) ─────────────────────
const gia = new Map(
  (await sql(`select anagrafiche_id, lat, lng from places where anagrafiche_id is not null;`))
    .map((r) => [r.anagrafiche_id, r]),
);
console.log(`  già importate: ${gia.size}`);

// ── 3. Geocodifica (solo le nuove con indirizzo) ────────────────────────────
async function geocodifica(p) {
  const parti = [p.indirizzo, p.citta, p.provincia].filter(Boolean).join(', ');
  if (!parti.trim()) return null;
  const u = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(parti + ', Italia')}&region=it&key=${GKEY}`;
  const g = await (await fetch(u)).json();
  if (g.status !== 'OK' || !g.results?.length) return null;
  const l = g.results[0].geometry.location;
  return { lat: l.lat, lng: l.lng };
}

const daGeocodificare = partners.filter((p) => !gia.has(p.id));
console.log(`→ geocodifico ${daGeocodificare.length} anagrafiche…`);
const coord = new Map();
let fatte = 0, falliti = 0;
const CONCORRENZA = 5;
for (let i = 0; i < daGeocodificare.length; i += CONCORRENZA) {
  const lotto = daGeocodificare.slice(i, i + CONCORRENZA);
  const esiti = await Promise.all(lotto.map((p) => geocodifica(p).catch(() => null)));
  esiti.forEach((c, k) => {
    if (c) coord.set(lotto[k].id, c);
    else falliti++;
  });
  fatte += lotto.length;
  if (fatte % 100 < CONCORRENZA) console.log(`  ${fatte}/${daGeocodificare.length}`);
}
console.log(`  geocodificate: ${coord.size} | senza coordinate: ${falliti}`);

// ── 4. Prepara i record ─────────────────────────────────────────────────────
const righe = [];
for (const p of partners) {
  const c = coord.get(p.id) ?? gia.get(p.id);
  if (!c || !isFinite(c.lat) || !isFinite(c.lng)) continue; // senza coordinate Scout non può mapparla
  const catOrig = (p.categoria || 'ALTRO').toUpperCase().trim();
  righe.push({
    aid: p.id,
    nome: p.nome,
    indirizzo: [p.indirizzo, p.citta].filter(Boolean).join(', ') || null,
    zona: p.citta || null,
    settore: catOrig, // categoria originale del registro, per riferimento
    categoria: CATEGORIA[catOrig] ?? 'altro',
    stato: STATO[p.stato] ?? 'da_visitare',
    account: p.account || null,
    ana_stato: p.stato || null,
    ultima_visita: p.ultimaVisita || null,
    lat: c.lat,
    lng: c.lng,
  });
}
const contatti = [];
for (const p of partners) {
  for (const c of p.contatti ?? []) {
    const nome = (c.nome || c.ruolo || '').trim();
    if (!nome) continue;
    contatti.push({
      aid: p.id,
      nome,
      ruolo: c.ruolo || null,
      telefono: c.telefono || null,
      email: c.email || null,
      decisore: DECISORE.test(c.ruolo || ''),
    });
  }
}
console.log(`→ da scrivere: ${righe.length} attività, ${contatti.length} contatti`);
if (DRY) { console.log('(--dry: nessuna scrittura)'); process.exit(0); }

// ── 5. Upsert places (a lotti) ──────────────────────────────────────────────
const COLONNE = `x(aid text, nome text, indirizzo text, zona text, settore text, categoria text,
  stato text, account text, ana_stato text, ultima_visita timestamptz, lat float8, lng float8)`;

for (let i = 0; i < righe.length; i += 100) {
  const lotto = righe.slice(i, i + 100);
  await sql(`
    with d as (select * from jsonb_to_recordset(${jsonLit(lotto)}::jsonb) as ${COLONNE}),
    r as (select d.*, cr.linea_ipotizzata, cr.aggancio_apertura, cr.priorita
          from d left join category_rules cr on lower(cr.categoria) = lower(d.categoria))
    insert into places (nome, indirizzo, zona, settore, categoria, stato, lat, lng, source,
                        anagrafiche_id, anagrafiche_account, anagrafiche_stato, anagrafiche_ultima_visita,
                        linea_ipotizzata, aggancio_apertura, priorita)
    select r.nome, r.indirizzo, r.zona, r.settore, r.categoria, r.stato::stato_place_t, r.lat, r.lng,
           'anagrafiche', r.aid, r.account, r.ana_stato, r.ultima_visita,
           r.linea_ipotizzata, r.aggancio_apertura, coalesce(r.priorita, 'P3')::priorita_t
    from r
    on conflict (anagrafiche_id) where anagrafiche_id is not null do update set
      nome = excluded.nome,
      indirizzo = excluded.indirizzo,
      zona = excluded.zona,
      settore = excluded.settore,
      anagrafiche_account = excluded.anagrafiche_account,
      anagrafiche_stato = excluded.anagrafiche_stato,
      anagrafiche_ultima_visita = excluded.anagrafiche_ultima_visita;
  `);
  console.log(`  attività ${Math.min(i + 100, righe.length)}/${righe.length}`);
}

// ── 6. Contatti (solo i nuovi: non tocca quelli aggiunti dai venditori) ─────
for (let i = 0; i < contatti.length; i += 200) {
  const lotto = contatti.slice(i, i + 200);
  await sql(`
    with d as (select * from jsonb_to_recordset(${jsonLit(lotto)}::jsonb)
                 as x(aid text, nome text, ruolo text, telefono text, email text, decisore boolean))
    insert into contacts (place_id, nome, ruolo, telefono, email, is_decisore)
    select p.id, d.nome, d.ruolo, d.telefono, d.email, d.decisore
    from d join places p on p.anagrafiche_id = d.aid
    where not exists (
      select 1 from contacts c
      where c.place_id = p.id
        and lower(c.nome) = lower(d.nome)
        and coalesce(c.telefono,'') = coalesce(d.telefono,'')
    );
  `);
  console.log(`  contatti ${Math.min(i + 200, contatti.length)}/${contatti.length}`);
}

// ── 7. Report ───────────────────────────────────────────────────────────────
const [tot] = await sql(`select
  (select count(*) from places where source='anagrafiche') as attivita_da_registro,
  (select count(*) from places) as attivita_totali,
  (select count(*) from contacts) as contatti_totali;`);
console.log('\n=== FATTO ===');
console.log(tot);

const doppi = await sql(`
  select a.nome as da_registro, b.nome as gia_presente, b.source as fonte,
         round(st_distance(a.geo, b.geo)::numeric, 0) as metri
  from places a
  join places b on b.id <> a.id
   and b.anagrafiche_id is null
   and similarity(lower(a.nome), lower(b.nome)) > 0.45
   and st_dwithin(a.geo, b.geo, 150)
  where a.source = 'anagrafiche'
  order by metri limit 30;`);
console.log(`\n=== PROBABILI DOPPIONI col già presente (${doppi.length}, primi 30) ===`);
for (const d of doppi) console.log(`  "${d.da_registro}" ~ "${d.gia_presente}" (${d.fonte}, ${d.metri}m)`);
