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
// `let`: se mancano nella finestra si leggono dal .env, qui sotto.
let ANAG_KEY = process.env.ANAGRAFICHE_API_KEY;
let PAT = process.env.SUPABASE_PAT ?? process.env.SUPABASE_ACCESS_TOKEN;
const REF = process.env.SUPABASE_REF || 'fdsziebgkljfsugqqbqd';
const DRY = process.argv.includes('--dry');

let GKEY = process.env.GOOGLE_GEOCODING_KEY;
/**
 * Le chiavi si leggono anche dal `.env` della cartella, non solo dalle
 * variabili della finestra.
 *
 * Perché: prima bisognava incollarle a ogni lancio, in una finestra che poi si
 * chiude — ed è il tipo di attrito che fa rimandare un import finché non serve
 * più. Il `.env` è **gitignored** (vedi §4 dell'handoff): un token lì è un
 * token sul tuo disco, non nel repo. Le variabili della finestra, se ci sono,
 * hanno comunque la precedenza.
 */
function daEnvFile(nome) {
  try {
    const riga = readFileSync('.env', 'utf8').match(new RegExp(`^${nome}=(.+)$`, 'm'));
    // Via apici e spazi: un valore incollato fra virgolette è l'errore più
    // comune, e produrrebbe una chiave che sembra giusta e viene rifiutata.
    return riga?.[1]?.trim().replace(/^["']|["']$/g, '');
  } catch {
    return undefined; // .env assente
  }
}

if (!GKEY) GKEY = daEnvFile('EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY');
if (!ANAG_KEY) ANAG_KEY = daEnvFile('ANAGRAFICHE_API_KEY');
if (!PAT) PAT = daEnvFile('SUPABASE_PAT') ?? daEnvFile('SUPABASE_ACCESS_TOKEN');

if (!ANAG_KEY || !PAT) {
  console.error('\n✗ Manca una chiave.\n');
  console.error(`  ANAGRAFICHE_API_KEY  ${ANAG_KEY ? 'ok' : 'MANCA — chiave di sola lettura del registro'}`);
  console.error(`  SUPABASE_PAT         ${PAT ? 'ok' : 'MANCA — https://supabase.com/dashboard/account/tokens'}`);
  console.error('\n  Si mettono in una riga del file deluxy-scout/.env (che non finisce su git):');
  console.error('    SUPABASE_PAT=sbp_...\n');
  console.error('  Oppure, solo per questa finestra:  $env:SUPABASE_PAT = "sbp_..."\n');
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
// Stato commerciale (vocabolario condiviso, 11 valori) → stato di PIPELINE di
// Scout (4).
//
// ⚠️ Il valore originale finisce in `anagrafiche_stato` **e** in
// `stato_affiliazione`: è da lì che `lib/livelli.ts` ricava il livello —
// attivo→Cliente, in_contatto/in_attesa→Lead, in_trattativa→Prospect,
// dismesso→Dormiente, a_rischio→Cliente col segno «a rischio».
const STATO = {
  selezionato: 'da_visitare',
  lead: 'da_visitare',
  prospect: 'da_visitare',
  in_trattativa: 'visitato',
  attivo: 'cliente',
  a_rischio: 'cliente',
  non_interessato: 'perso',
  dismesso: 'perso',
};

// ⚠️ 31/07/2026 — «in contatto / in attesa / da ricontattare» non sono più
// stati: sono il MOMENTO del contatto, una dimensione a sé (registro: `livello`,
// Scout: `places.livello_rapporto`). Le anagrafiche vecchie possono averli
// ancora come stato: si spostano qui e lo stato diventa `lead`, che è ciò che
// quei tre hanno sempre voluto dire — un contatto c'è stato.
const MOMENTI = ['in_contatto', 'in_attesa', 'da_ricontattare', 'attivo', 'a_rischio', 'non_interessato'];
// Se uno di quelli arriva ancora come STATO (registro non aggiornato), ecco
// cosa diventa lo stato: «a rischio» resta un cliente, gli altri sono lead.
const STATO_DA_LIVELLO = {
  in_contatto: 'lead',
  in_attesa: 'lead',
  da_ricontattare: 'lead',
  non_interessato: 'lead',
  a_rischio: 'attivo',
  attivo: 'attivo',
};
const DECISORE = /titolare|founder|owner|proprietar|ceo|general manager|direttore/i;

// Gli INTERESSI del registro (Re-seller, Consegne, Gifting…) sono la cosa che
// dice di che si parla con quel negozio, e fino al 31/07/2026 l'import **non li
// portava affatto**: Scout mostrava la linea indovinata dalla categoria, quindi
// un partner «Re-seller + Consegne» compariva come «Food Supplier». Segnalato
// dall'utente.
//
// ⚠️ Copia dell'alias in types/index.ts: questo file è JS puro e non può
// importare il TypeScript dell'app. Se là si aggiunge un alias, va aggiunto qui.
const ALIAS_LINEE = {
  'regali aziendali': 'Gifting',
  regali: 'Gifting',
  gifting: 'Gifting',
  catering: 'Eventi & Catering',
  eventi: 'Eventi & Catering',
  'eventi & catering': 'Eventi & Catering',
};
// Il catalogo, per riportare alla grafia giusta le varianti di maiuscole: nel
// registro convivono «Consegne» e «consegne», e senza questo passaggio sono due
// tag diversi — filtri per uno e perdi gli altri.
const LINEE = [
  'Consegne',
  'Eventi & Catering',
  'Gifting',
  'Affiliazioni',
  'Re-seller',
  'Food Supplier',
  'Clientelling',
  'Concierge',
  'Magazzino',
];
const canonizzaLinee = (linee) => {
  const out = [];
  for (const l of linee ?? []) {
    const grezzo = String(l).trim();
    const min = grezzo.toLowerCase();
    const c = ALIAS_LINEE[min] ?? LINEE.find((x) => x.toLowerCase() === min) ?? grezzo;
    if (c && !out.includes(c)) out.push(c);
  }
  return out;
};

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
  // ⚠️ SENZA COORDINATE SI IMPORTA LO STESSO, a 0,0 (decisione utente
  // 31/07/2026). Prima si saltava — e 196 anagrafiche su 1012 restavano fuori
  // da Scout senza che nulla lo dicesse: un'esclusione silenziosa, che è il
  // modo peggiore di perdere dei dati. Lo 0,0 non è una posizione vera ed è
  // riconoscibile come tale: la sezione **Riconciliazione** le elenca e ci fa
  // mettere l'indirizzo. È la stessa scelta della Edge Function `partner`.
  const trovata = coord.get(p.id) ?? gia.get(p.id);
  const c = trovata && isFinite(trovata.lat) && isFinite(trovata.lng) ? trovata : { lat: 0, lng: 0 };
  const catOrig = (p.categoria || 'ALTRO').toUpperCase().trim();
  righe.push({
    aid: p.id,
    nome: p.nome,
    indirizzo: [p.indirizzo, p.citta].filter(Boolean).join(', ') || null,
    zona: p.citta || null,
    settore: catOrig, // categoria originale del registro, per riferimento
    categoria: CATEGORIA[catOrig] ?? 'altro',
    // Se il registro manda ancora un livello come stato, quello è il livello e
    // lo stato è quello che c'era sempre stato sotto (STATO_DA_LIVELLO).
    stato: STATO[MOMENTI.includes(p.stato) ? STATO_DA_LIVELLO[p.stato] : p.stato] ?? 'da_visitare',
    account: p.account || null,
    ana_stato: MOMENTI.includes(p.stato) ? STATO_DA_LIVELLO[p.stato] : p.stato || null,
    // `livello` è il nome che ha nel registro; qui diventa `livello_rapporto`.
    momento: MOMENTI.includes(p.livello) ? p.livello : MOMENTI.includes(p.stato) ? p.stato : null,
    interessi: canonizzaLinee(p.interessi),
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
  stato text, account text, ana_stato text, momento text, interessi text[],
  ultima_visita timestamptz, lat float8, lng float8)`;

for (let i = 0; i < righe.length; i += 100) {
  const lotto = righe.slice(i, i + 100);
  await sql(`
    with d as (select * from jsonb_to_recordset(${jsonLit(lotto)}::jsonb) as ${COLONNE}),
    r as (select d.*, cr.linea_ipotizzata, cr.aggancio_apertura, cr.priorita
          from d left join category_rules cr on lower(cr.categoria) = lower(d.categoria))
    insert into places (nome, indirizzo, zona, settore, categoria, stato, lat, lng, source,
                        anagrafiche_id, anagrafiche_account, anagrafiche_stato, anagrafiche_ultima_visita,
                        stato_affiliazione, livello_rapporto, starred,
                        linea_ipotizzata, linee_ipotizzate, aggancio_apertura, priorita)
    select r.nome, r.indirizzo, r.zona, r.settore, r.categoria, r.stato::stato_place_t, r.lat, r.lng,
           'anagrafiche', r.aid, r.account, r.ana_stato, r.ultima_visita,
           -- Lo stato commerciale su cui lavora Scout: senza, il livello non si
           -- ricava e un in_trattativa del registro resterebbe Selezionato.
           -- (Niente apici inversi in questi commenti: sono dentro un template
           -- literal JS, e chiuderebbero la stringa. Ci sono già cascato.)
           r.ana_stato::stato_affiliazione_t,
           r.momento,
           -- starred e obbligatorio perche il negozio si VEDA: gli elenchi
           -- mostrano solo chi e stato scelto da qualcuno (inLavorazione in
           -- lib/livelli.ts), e un partner del registro e una scelta fatta in
           -- un altra app. Senza, l import riempie il database e le liste
           -- restano vuote.
           true,
           -- Gli interessi del registro vincono; la linea indovinata dalla
           -- categoria resta solo come ripiego per chi non ne ha nessuno.
           coalesce(r.interessi[1], r.linea_ipotizzata),
           case when coalesce(array_length(r.interessi, 1), 0) > 0 then r.interessi end,
           r.aggancio_apertura, coalesce(r.priorita, 'P3')::priorita_t
    from r
    on conflict (anagrafiche_id) where anagrafiche_id is not null do update set
      nome = excluded.nome,
      indirizzo = excluded.indirizzo,
      zona = excluded.zona,
      settore = excluded.settore,
      anagrafiche_account = excluded.anagrafiche_account,
      stato_affiliazione = excluded.stato_affiliazione,
      livello_rapporto = excluded.livello_rapporto,
      -- Gli interessi si riscrivono SOLO se il registro ne ha: è lui la fonte
      -- di verità, ma un registro vuoto non deve cancellare quello che un
      -- venditore ha scelto qui e non ha ancora rimandato di là.
      linee_ipotizzate = case when coalesce(array_length(excluded.linee_ipotizzate, 1), 0) > 0
                              then excluded.linee_ipotizzate else places.linee_ipotizzate end,
      linea_ipotizzata = case when coalesce(array_length(excluded.linee_ipotizzate, 1), 0) > 0
                              then excluded.linea_ipotizzata else places.linea_ipotizzata end,
      starred = true,
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
