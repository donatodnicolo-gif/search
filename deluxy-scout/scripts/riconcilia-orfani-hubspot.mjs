#!/usr/bin/env node
// RICONCILIA I DEAL ORFANI DI HUBSPOT con la loro azienda (03/09/2026,
// richiesta dell'utente: «puoi riconciliare?» → «finisci riconciliazioni»).
//
// IL PROBLEMA. Su HubSpot 73 deal su 186 non sono associati a nessuna company.
// Per Scout quei deal NON ESISTONO: lo specchio `hubspot_deals` li tiene, ma
// senza `company_hubspot_id` non si attaccano a nessun negozio e la scheda del
// cliente non li mostra. È così che il 03/09 è nato un doppione su Papera
// Flowers: la trattativa di giugno c'era su HubSpot, e da qui non si vedeva.
//
// COME SI SCEGLIE L'AZIENDA. Solo corrispondenze SICURE: il nome dell'azienda
// deve comparire nel nome del deal come sequenza di PAROLE INTERE, e deve
// essere l'unica azienda del CRM che ci sta dentro. Il confronto per pezzi di
// parola era sbagliato e si è visto: «Floreale» pescava L'Oréal, «x Deluxy»
// pescava Deluxy (che è nostra, ed è esclusa).
//
// ⚠️ SE ABBIAMO GIÀ UNA TRATTATIVA NOSTRA su quel cliente, l'orfano NON si
// aggancia: regola dell'utente («verifica se nel frattempo abbiamo già creato
// delle trattative noi e in quel caso lascia le nostre»). Agganciarlo farebbe
// due trattative sulla stessa azienda.
//
// ⚠️ NON SOVRASCRIVE MAI un'associazione esistente: l'Edge legge prima da
// HubSpot e risponde `gia_associato` senza toccare niente.
//
// USO (dalla cartella deluxy-scout):
//   node scripts/riconcilia-orfani-hubspot.mjs            → PROVA: dice solo cosa farebbe
//   node scripts/riconcilia-orfani-hubspot.mjs --scrivi   → scrive su HubSpot
//
// Legge `SUPABASE_PAT` ed `EXPO_PUBLIC_SUPABASE_ANON_KEY` da `.env` (non
// stampa mai nessuna chiave).
import { readFileSync } from 'node:fs';

const REF = process.env.SUPABASE_REF || 'fdsziebgkljfsugqqbqd';
const SCRIVI = process.argv.includes('--scrivi');

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
const PAT = process.env.SUPABASE_PAT || env.SUPABASE_PAT;
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (!PAT) throw new Error('Manca SUPABASE_PAT (in .env o nell\'ambiente).');
if (!ANON) throw new Error('Manca EXPO_PUBLIC_SUPABASE_ANON_KEY.');

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${PAT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`Management API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

// Le proposte: un solo candidato, a parole intere, escluse le nostre aziende.
const CANDIDATI = `
with pulisci as (
  select hubspot_id, nome,
         ' ' || btrim(regexp_replace(lower(translate(nome,'àèéìòùÀÈÉÌÒÙ','aeeiouAEEIOU')), '[^a-z0-9]+', ' ', 'g')) || ' ' as frase
  from hubspot_companies where nome is not null and nome !~* 'deluxy'
),
orfani as (
  select d.hubspot_id, d.nome, d.aperta,
         ' ' || btrim(regexp_replace(lower(translate(d.nome,'àèéìòùÀÈÉÌÒÙ','aeeiouAEEIOU')), '[^a-z0-9]+', ' ', 'g')) || ' ' as frase
  from hubspot_deals d where d.company_hubspot_id is null and d.nome is not null
),
proposte as (
  select o.hubspot_id as deal_id, o.nome as deal, o.aperta,
         c.hubspot_id as azienda_id, c.nome as azienda
  from orfani o join pulisci c on length(btrim(c.frase)) >= 5 and o.frase like '%' || c.frase || '%'
  where (select count(*) from pulisci c2 where length(btrim(c2.frase)) >= 5 and o.frase like '%' || c2.frase || '%') = 1
)
select p.deal_id, p.deal, p.aperta, p.azienda_id, p.azienda,
       (select count(*) from places pl join deals d on d.place_id = pl.id where pl.hubspot_company_id = p.azienda_id) as nostre_trattative,
       (select string_agg(distinct pl.nome, ' | ') from places pl where pl.hubspot_company_id = p.azienda_id) as negozi_scout
from proposte p
order by 6, p.azienda;
`;

const righe = await sql(CANDIDATI);
const daFare = righe.filter((r) => Number(r.nostre_trattative) === 0);
const lasciate = righe.filter((r) => Number(r.nostre_trattative) > 0);

console.log(`Orfani con un solo candidato: ${righe.length}`);
console.log(`  · da agganciare (nessuna trattativa nostra): ${daFare.length}`);
console.log(`  · lasciati stare (abbiamo già la nostra):    ${lasciate.length}`);
for (const r of lasciate) console.log(`    – ${r.azienda}: resta la nostra (${r.nostre_trattative})`);
console.log('');

// La chiave d'ingresso di Scout: serve a chiamare l'Edge da riga di comando.
const chiave = (await sql("select chiave from chiavi_app where app = '_ingresso'"))[0]?.chiave;
if (!chiave) throw new Error("Scout non ha la chiave d'ingresso: generala da Profilo → Impostazioni.");

let fatti = 0;
const problemi = [];
for (const r of daFare) {
  const res = await fetch(`https://${REF}.supabase.co/functions/v1/hubspot-match`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': chiave,
      apikey: ANON,
      Authorization: `Bearer ${ANON}`,
    },
    body: JSON.stringify({
      action: 'associa_deal_azienda',
      dealId: r.deal_id,
      companyId: r.azienda_id,
      ...(SCRIVI ? {} : { prova: true }),
    }),
  });
  const esito = await res.json().catch(() => ({ error: `risposta non JSON (${res.status})` }));
  const etichetta = `${r.aperta ? 'APERTA' : 'chiusa'} «${r.deal}» → ${r.azienda}`;
  if (esito.ok) {
    fatti += 1;
    console.log(`${SCRIVI ? 'AGGANCIATO' : 'si potrebbe agganciare'}: ${etichetta}`);
  } else {
    problemi.push({ ...r, esito });
    console.log(`NON fatto: ${etichetta} — ${esito.reason ?? esito.error ?? JSON.stringify(esito)}`);
  }
}

console.log('');
console.log(SCRIVI ? `Agganciati: ${fatti} su ${daFare.length}.` : `PROVA: nessuna scrittura. Con --scrivi ne aggancerebbe ${fatti}.`);
if (problemi.length) console.log(`Da guardare: ${problemi.length}.`);
