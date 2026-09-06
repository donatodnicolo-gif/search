/**
 * AREE (06/09/2026, regola utente): gruppi di province con un nome, assegnati ai partner
 * al posto delle 107 province una per una. Le province effettive del partner
 * (PartnerProvince) restano e sono l'unione delle sue aree: qui NON cambiano.
 *
 * 1) tabelle Area, AreaProvincia, PartnerArea; 2) le aree principali dai dati (misurato:
 * 72 partner sullo stesso blocco di 12 province lombarde, 13 su Roma, 7 su Firenze…);
 * 3) a ogni partner le aree la cui unione è ESATTAMENTE il suo insieme di province —
 * mai un'area che gli aggiunga province che non ha: se avanzano province scoperte,
 * nasce un'area con quella sola provincia (un'area ha almeno una provincia).
 * Idempotente. Uso: node scripts/applica-migrazione-aree.mjs
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8').split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
u.searchParams.set('schema', 'platform');
process.env.DATABASE_URL = u.toString();
const p = new PrismaClient();
const q = (s, ...a) => p.$executeRawUnsafe(s, ...a);
const cuid = (pre) => pre + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);

await q(`CREATE TABLE IF NOT EXISTS platform."Area" (
  "id" TEXT PRIMARY KEY, "nome" TEXT NOT NULL UNIQUE, "note" TEXT, "attiva" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
await q(`CREATE TABLE IF NOT EXISTS platform."AreaProvincia" (
  "id" TEXT PRIMARY KEY, "areaId" TEXT NOT NULL REFERENCES platform."Area"("id") ON DELETE CASCADE,
  "provinceId" TEXT NOT NULL REFERENCES platform."Province"("id"), UNIQUE ("areaId", "provinceId"))`);
await q(`CREATE TABLE IF NOT EXISTS platform."PartnerArea" (
  "id" TEXT PRIMARY KEY, "partnerId" TEXT NOT NULL REFERENCES platform."Partner"("id") ON DELETE CASCADE,
  "areaId" TEXT NOT NULL REFERENCES platform."Area"("id") ON DELETE CASCADE, UNIQUE ("partnerId", "areaId"))`);
console.log('✓ schema');

const province = await p.$queryRawUnsafe(`SELECT id, code, name FROM platform."Province"`);
const idDiCodice = Object.fromEntries(province.map((x) => [x.code, x.id]));
const nomeDiCodice = Object.fromEntries(province.map((x) => [x.code, x.name]));

// 2) aree principali (nome → codici). Ogni area ⊆ insiemi reali dei partner: nessuna allarga nessuno.
const AREE = {
  'Milano e hinterland': ['BG', 'BS', 'CO', 'CR', 'LC', 'LO', 'MB', 'MI', 'NO', 'PC', 'PV', 'VA'],
  'Roma': ['RM'], 'Firenze': ['FI'], 'Napoli': ['NA'], 'Como': ['CO'], 'Milano città': ['MI'], 'Monza e Brianza': ['MB'], 'Brescia': ['BS'],
  'Torino': ['TO'], 'Trento': ['TN'], 'Vicenza': ['VI'], 'Rimini': ['RN'], 'Venezia': ['VE'], 'Genova': ['GE'],
  'Puglia (Bari e BAT)': ['BA', 'BT'], 'Pisa': ['PI'], 'Lucca': ['LU'], 'Livorno': ['LI'], 'Viterbo': ['VT'], 'Salerno': ['SA'], 'Verbano-Cusio-Ossola': ['VB'],
  'Tutta Italia': province.map((x) => x.code).filter((c) => c !== 'EE'),
};
async function creaArea(nome, codici) {
  const gia = await p.$queryRawUnsafe(`SELECT id FROM platform."Area" WHERE nome = $1`, nome);
  const id = gia[0]?.id ?? cuid('ar');
  if (!gia[0]) await q(`INSERT INTO platform."Area" ("id","nome") VALUES ($1,$2)`, id, nome);
  for (const c of codici) if (idDiCodice[c]) await q(`INSERT INTO platform."AreaProvincia" ("id","areaId","provinceId") VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, cuid('ap'), id, idDiCodice[c]);
  return id;
}
const aree = []; // { id, nome, codici:Set }
for (const [nome, codici] of Object.entries(AREE)) aree.push({ id: await creaArea(nome, codici), nome, codici: new Set(codici.filter((c) => idDiCodice[c])) });
console.log('✓ aree principali:', aree.length);

// 3) assegnazione: copertura esatta, dalle aree più grandi
const partners = await p.$queryRawUnsafe(`SELECT pa.id, pa.insegna, string_agg(pr.code, ',') AS codici FROM platform."Partner" pa JOIN platform."PartnerProvince" pp ON pp."partnerId" = pa.id JOIN platform."Province" pr ON pr.id = pp."provinceId" WHERE NOT pa.deleted GROUP BY pa.id, pa.insegna`);
let assegnati = 0, singoleCreate = 0; const usoAree = {};
for (const pa of partners) {
  const gia = await p.$queryRawUnsafe(`SELECT count(*)::int AS n FROM platform."PartnerArea" WHERE "partnerId" = $1`, pa.id);
  if (gia[0].n > 0) continue; // già fatto (idempotenza)
  const set = new Set(pa.codici.split(','));
  const scelte = [];
  const restanti = new Set(set);
  for (const a of [...aree].sort((x, y) => y.codici.size - x.codici.size)) {
    if (a.codici.size === 0) continue;
    if ([...a.codici].every((c) => restanti.has(c))) { scelte.push(a); for (const c of a.codici) restanti.delete(c); }
  }
  for (const c of restanti) { // provincia scoperta → area di una provincia (creata se manca)
    let a = aree.find((x) => x.codici.size === 1 && x.codici.has(c));
    if (!a) { const nome = nomeDiCodice[c] ?? c; a = { id: await creaArea(nome, [c]), nome, codici: new Set([c]) }; aree.push(a); singoleCreate++; }
    scelte.push(a);
  }
  for (const a of scelte) { await q(`INSERT INTO platform."PartnerArea" ("id","partnerId","areaId") VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, cuid('pa'), pa.id, a.id); usoAree[a.nome] = (usoAree[a.nome] ?? 0) + 1; }
  // verifica: unione == insieme
  const unione = new Set(scelte.flatMap((a) => [...a.codici]));
  if (unione.size !== set.size || [...set].some((c) => !unione.has(c))) console.log('  ⚠️ copertura non esatta per', pa.insegna);
  assegnati++;
}
console.log(`✓ partner con aree: ${assegnati} · aree di una provincia create per i casi singoli: ${singoleCreate}`);
console.log('  uso:', Object.entries(usoAree).sort((a, b) => b[1] - a[1]).map(([n, k]) => `${n}=${k}`).join(' | '));
const tot = await p.$queryRawUnsafe(`SELECT count(*)::int AS n FROM platform."Area"`);
console.log('  aree totali:', tot[0].n);
await p.$disconnect();
