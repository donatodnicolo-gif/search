/**
 * AREE anche per i VALET + «Tutto il mondo» (06/09/2026, regola utente):
 * «un'area può essere tutta italia (tutte le province), un'altra tutto il mondo (italia + estero)
 * e assegna già questa cosa a artista locale, blu logistica, blu logistica valet, swiss food, eci,
 * deluxyflowers, cakedesignme, renato cassoli, adonato daniele. le aree valgono anche per i valet».
 *
 * 1) tabella ValetArea; 2) area «Tutto il mondo» = tutte le province, Estero (EE) compreso
 *    («Tutta Italia» esiste già: 107 province senza EE); 3) ai partner e valet elencati SOLO
 *    «Tutto il mondo» e province effettive ricalcolate = unione (qui quindi CRESCONO: è la regola);
 * 4) agli altri valet le aree che coprono ESATTAMENTE le loro province (come per i partner:
 *    mai un'area che aggiunge; province scoperte → area di una provincia).
 * Idempotente. Uso: node scripts/applica-migrazione-aree-valet.mjs
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
const r = (s, ...a) => p.$queryRawUnsafe(s, ...a);
const cuid = (pre) => pre + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);

await q(`CREATE TABLE IF NOT EXISTS platform."ValetArea" (
  "id" TEXT PRIMARY KEY, "valetId" TEXT NOT NULL REFERENCES platform."Valet"("id") ON DELETE CASCADE,
  "areaId" TEXT NOT NULL REFERENCES platform."Area"("id") ON DELETE CASCADE, UNIQUE ("valetId", "areaId"))`);
console.log('✓ schema ValetArea');

const province = await r(`SELECT id, code, name FROM platform."Province"`);
const idDiCodice = Object.fromEntries(province.map((x) => [x.code, x.id]));
const nomeDiCodice = Object.fromEntries(province.map((x) => [x.code, x.name]));

async function creaArea(nome, codici) {
  const gia = await r(`SELECT id FROM platform."Area" WHERE nome = $1`, nome);
  const id = gia[0]?.id ?? cuid('ar');
  if (!gia[0]) await q(`INSERT INTO platform."Area" ("id","nome","note") VALUES ($1,$2,$3)`, id, nome, nome === 'Tutto il mondo' ? 'Tutte le province italiane più Estero.' : null);
  for (const c of codici) if (idDiCodice[c]) await q(`INSERT INTO platform."AreaProvincia" ("id","areaId","provinceId") VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, cuid('ap'), id, idDiCodice[c]);
  return id;
}
// 2) «Tutto il mondo» (tutte, EE compreso) — e «Tutta Italia» completata se mancasse una provincia
const mondoId = await creaArea('Tutto il mondo', province.map((x) => x.code));
await creaArea('Tutta Italia', province.map((x) => x.code).filter((c) => c !== 'EE'));
console.log('✓ area «Tutto il mondo»:', mondoId, '·', province.length, 'province');

// 3) assegnazione mirata: partner e valet dell'elenco → SOLO «Tutto il mondo»
const PARTNER = [ // insegna (ILIKE) — Blu Logistica: la riga Partner «Blulogistica» è deleted=true ma resta il suo utente partner → la teniamo
  ['artista locale', `insegna ILIKE 'artista locale%'`],
  ['blu logistica', `(insegna ILIKE 'blu%logistica%' OR insegna ILIKE 'blulogistica%')`],
  ['swiss food', `insegna ILIKE 'swiss food%'`],
  ['eci', `(insegna ILIKE 'eci' OR insegna ILIKE 'eci %' OR insegna ILIKE 'e.c.i.%')`],
  ['deluxyflowers', `(insegna ILIKE 'deluxy%flowers%' OR insegna ILIKE 'deluxyflowers%')`],
  ['cakedesignme', `(insegna ILIKE 'cake%design%me%' OR insegna ILIKE 'cakedesignme%')`],
];
const VALET = [
  ['blu logistica valet', `(("firstName" || ' ' || "lastName") ILIKE '%logistica%valet%blu%' OR ("firstName" || ' ' || "lastName") ILIKE '%blu%logistica%')`],
  ['renato cassoli', `(("firstName" || ' ' || "lastName") ILIKE 'renato cassoli' OR ("firstName" || ' ' || "lastName") ILIKE 'cassoli renato')`],
  ['adonato daniele', `(("firstName" || ' ' || "lastName") ILIKE 'daniele adonato' OR ("firstName" || ' ' || "lastName") ILIKE 'adonato daniele')`],
];
const tutteLeProvince = province.map((x) => x.id);
async function ricalcolaPartner(id) {
  const ids = await r(`SELECT DISTINCT ap."provinceId" FROM platform."PartnerArea" pa JOIN platform."AreaProvincia" ap ON ap."areaId" = pa."areaId" WHERE pa."partnerId" = $1`, id);
  await q(`DELETE FROM platform."PartnerProvince" WHERE "partnerId" = $1`, id);
  for (const x of ids) await q(`INSERT INTO platform."PartnerProvince" ("id","partnerId","provinceId") VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, cuid('pp'), id, x.provinceId);
  return ids.length;
}
async function ricalcolaValet(id) {
  const ids = await r(`SELECT DISTINCT ap."provinceId" FROM platform."ValetArea" va JOIN platform."AreaProvincia" ap ON ap."areaId" = va."areaId" WHERE va."valetId" = $1`, id);
  await q(`DELETE FROM platform."ValetProvince" WHERE "valetId" = $1`, id);
  for (const x of ids) await q(`INSERT INTO platform."ValetProvince" ("id","valetId","provinceId") VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, cuid('vp'), id, x.provinceId);
  return ids.length;
}
const esito = [];
for (const [nome, where] of PARTNER) {
  const righe = await r(`SELECT id, insegna, deleted, (SELECT count(*)::int FROM platform."PartnerProvince" WHERE "partnerId" = pa.id) AS prima FROM platform."Partner" pa WHERE ${where} ORDER BY deleted, insegna`);
  if (!righe.length) { esito.push({ tipo: 'partner', cercato: nome, trovato: '— NON TROVATO', prima: '', dopo: '' }); continue; }
  for (const x of righe) {
    await q(`DELETE FROM platform."PartnerArea" WHERE "partnerId" = $1`, x.id);
    await q(`INSERT INTO platform."PartnerArea" ("id","partnerId","areaId") VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, cuid('pa'), x.id, mondoId);
    const dopo = await ricalcolaPartner(x.id);
    esito.push({ tipo: 'partner', cercato: nome, trovato: x.insegna + (x.deleted ? ' (CANCELLATO)' : ''), prima: x.prima, dopo });
  }
}
for (const [nome, where] of VALET) {
  const righe = await r(`SELECT id, "firstName", "lastName", deleted, (SELECT count(*)::int FROM platform."ValetProvince" WHERE "valetId" = v.id) AS prima FROM platform."Valet" v WHERE ${where} ORDER BY deleted`);
  if (!righe.length) { esito.push({ tipo: 'valet', cercato: nome, trovato: '— NON TROVATO', prima: '', dopo: '' }); continue; }
  for (const x of righe) {
    await q(`DELETE FROM platform."ValetArea" WHERE "valetId" = $1`, x.id);
    await q(`INSERT INTO platform."ValetArea" ("id","valetId","areaId") VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, cuid('va'), x.id, mondoId);
    const dopo = await ricalcolaValet(x.id);
    esito.push({ tipo: 'valet', cercato: nome, trovato: `${x.firstName} ${x.lastName}` + (x.deleted ? ' (CANCELLATO)' : ''), prima: x.prima, dopo });
  }
}
console.table(esito);

// 4) gli altri valet: copertura esatta con le aree esistenti
const areeDb = await r(`SELECT a.id, a.nome, string_agg(pr.code, ',') AS codici FROM platform."Area" a JOIN platform."AreaProvincia" ap ON ap."areaId" = a.id JOIN platform."Province" pr ON pr.id = ap."provinceId" GROUP BY a.id, a.nome`);
const aree = areeDb.map((a) => ({ id: a.id, nome: a.nome, codici: new Set(a.codici.split(',')) }));
const valets = await r(`SELECT v.id, v."firstName" || ' ' || v."lastName" AS nome, string_agg(pr.code, ',') AS codici FROM platform."Valet" v JOIN platform."ValetProvince" vp ON vp."valetId" = v.id JOIN platform."Province" pr ON pr.id = vp."provinceId" WHERE NOT v.deleted GROUP BY v.id, v."firstName", v."lastName"`);
let assegnati = 0, singoleCreate = 0; const usoAree = {};
for (const v of valets) {
  const gia = await r(`SELECT count(*)::int AS n FROM platform."ValetArea" WHERE "valetId" = $1`, v.id);
  if (gia[0].n > 0) continue;
  const set = new Set(v.codici.split(','));
  const scelte = []; const restanti = new Set(set);
  for (const a of [...aree].sort((x, y) => y.codici.size - x.codici.size)) {
    if (a.codici.size === 0) continue;
    if ([...a.codici].every((c) => restanti.has(c))) { scelte.push(a); for (const c of a.codici) restanti.delete(c); }
  }
  for (const c of restanti) {
    let a = aree.find((x) => x.codici.size === 1 && x.codici.has(c));
    if (!a) { const nome = nomeDiCodice[c] ?? c; a = { id: await creaArea(nome, [c]), nome, codici: new Set([c]) }; aree.push(a); singoleCreate++; }
    scelte.push(a);
  }
  for (const a of scelte) { await q(`INSERT INTO platform."ValetArea" ("id","valetId","areaId") VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, cuid('va'), v.id, a.id); usoAree[a.nome] = (usoAree[a.nome] ?? 0) + 1; }
  const unione = new Set(scelte.flatMap((a) => [...a.codici]));
  if (unione.size !== set.size || [...set].some((c) => !unione.has(c))) console.log('  ⚠️ copertura non esatta per', v.nome);
  assegnati++;
}
console.log(`✓ valet con aree (copertura esatta): ${assegnati} · aree di una provincia create: ${singoleCreate}`);
console.log('  uso:', Object.entries(usoAree).sort((a, b) => b[1] - a[1]).map(([n, k]) => `${n}=${k}`).join(' | '));
const senza = await r(`SELECT count(*)::int AS n FROM platform."Valet" v WHERE NOT v.deleted AND NOT EXISTS (SELECT 1 FROM platform."ValetArea" WHERE "valetId" = v.id)`);
console.log('  valet attivi senza aree (= senza province):', senza[0].n);
await p.$disconnect();
