/**
 * 06/09/2026 (regola utente): «i valet che hanno assegnato milano metti per tutti area milano e hinterland».
 * Ogni valet attivo con MI fra le province riceve l'area «Milano e hinterland» (12 province lombarde);
 * le sue aree già comprese in quel blocco vengono tolte (ridondanti), quelle fuori restano.
 * Chi ha già «Tutto il mondo»/«Tutta Italia» non cambia. Province effettive ricalcolate = unione.
 * Idempotente. Uso: node scripts/applica-valet-milano-hinterland.mjs [--prova]
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8').split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
u.searchParams.set('schema', 'platform'); process.env.DATABASE_URL = u.toString();
const PROVA = process.argv.includes('--prova');
const p = new PrismaClient();
const q = (s, ...a) => p.$executeRawUnsafe(s, ...a);
const r = (s, ...a) => p.$queryRawUnsafe(s, ...a);
const cuid = (pre) => pre + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);

const [mi] = await r(`SELECT id FROM platform."Area" WHERE nome = 'Milano e hinterland'`);
if (!mi) { console.error('area «Milano e hinterland» non trovata'); process.exit(1); }
const areeDb = await r(`SELECT a.id, a.nome, string_agg(pr.code, ',') AS codici FROM platform."Area" a JOIN platform."AreaProvincia" ap ON ap."areaId" = a.id JOIN platform."Province" pr ON pr.id = ap."provinceId" GROUP BY a.id, a.nome`);
const aree = Object.fromEntries(areeDb.map((a) => [a.id, { nome: a.nome, codici: new Set(a.codici.split(',')) }]));
const blocco = aree[mi.id].codici;
const valets = await r(`SELECT v.id, v."firstName" || ' ' || v."lastName" AS nome,
  (SELECT string_agg(pr.code, ',') FROM platform."ValetProvince" vp JOIN platform."Province" pr ON pr.id = vp."provinceId" WHERE vp."valetId" = v.id) AS codici,
  (SELECT string_agg(va."areaId", ',') FROM platform."ValetArea" va WHERE va."valetId" = v.id) AS aree
  FROM platform."Valet" v WHERE NOT v.deleted AND EXISTS (SELECT 1 FROM platform."ValetProvince" vp JOIN platform."Province" pr ON pr.id = vp."provinceId" WHERE vp."valetId" = v.id AND pr.code = 'MI')
  ORDER BY nome`);
const esito = [];
for (const v of valets) {
  const sue = (v.aree ?? '').split(',').filter(Boolean);
  const nomi = sue.map((id) => aree[id]?.nome ?? id);
  if (sue.includes(mi.id)) { esito.push({ valet: v.nome, aree_prima: nomi.join(' + '), aree_dopo: '(già)', prov_prima: v.codici.split(',').length, prov_dopo: v.codici.split(',').length }); continue; }
  if (sue.some((id) => [...blocco].every((c) => aree[id]?.codici.has(c)))) { esito.push({ valet: v.nome, aree_prima: nomi.join(' + '), aree_dopo: '(copre già tutto il blocco)', prov_prima: v.codici.split(',').length, prov_dopo: v.codici.split(',').length }); continue; }
  const tolte = sue.filter((id) => [...aree[id].codici].every((c) => blocco.has(c)));
  const restano = sue.filter((id) => !tolte.includes(id));
  const nuove = [mi.id, ...restano];
  const unione = new Set(nuove.flatMap((id) => [...aree[id].codici]));
  esito.push({ valet: v.nome, aree_prima: nomi.join(' + '), aree_dopo: nuove.map((id) => aree[id].nome).join(' + '), prov_prima: v.codici.split(',').length, prov_dopo: unione.size });
  if (PROVA) continue;
  for (const id of tolte) await q(`DELETE FROM platform."ValetArea" WHERE "valetId" = $1 AND "areaId" = $2`, v.id, id);
  await q(`INSERT INTO platform."ValetArea" ("id","valetId","areaId") VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, cuid('va'), v.id, mi.id);
  const ids = await r(`SELECT DISTINCT ap."provinceId" FROM platform."ValetArea" va JOIN platform."AreaProvincia" ap ON ap."areaId" = va."areaId" WHERE va."valetId" = $1`, v.id);
  await q(`DELETE FROM platform."ValetProvince" WHERE "valetId" = $1`, v.id);
  for (const x of ids) await q(`INSERT INTO platform."ValetProvince" ("id","valetId","provinceId") VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, cuid('vp'), v.id, x.provinceId);
}
console.table(esito);
console.log(PROVA ? 'PROVA: nulla scritto' : 'scritto', '· valet con Milano:', valets.length, '· cambiati:', esito.filter((e) => !e.aree_dopo.startsWith('(')).length);
const inutili = await r(`SELECT a.nome FROM platform."Area" a WHERE NOT EXISTS (SELECT 1 FROM platform."ValetArea" WHERE "areaId" = a.id) AND NOT EXISTS (SELECT 1 FROM platform."PartnerArea" WHERE "areaId" = a.id) ORDER BY a.nome`);
console.log('aree non usate da nessuno (' + inutili.length + '):', inutili.map((x) => x.nome).join(', '));
await p.$disconnect();
