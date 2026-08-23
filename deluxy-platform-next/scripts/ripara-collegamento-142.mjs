// Ripara il collegamento di 142 RESTAURANT: il platformId sta sul doppione
// creato dalla piattaforma il 23/08, non sul record vero del registro.
//
// Effetto collaterale del difetto: confrontando la piattaforma con una copia
// di se' stessa, la scheda diceva «nessuna differenza» qualunque cosa ci fosse
// scritto nel registro. Ecco perche' «BEYOND» non compariva mai.
//
// Di default NON scrive: mostra cosa farebbe. Con --scrivi applica.
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const SCRIVI = process.argv.includes('--scrivi');

const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
const url = (s) => `postgresql://${u.username}:${u.password}@${u.hostname}:6543/postgres?schema=${s}&pgbouncer=true&connection_limit=1`;
const reg = new PrismaClient({ datasources: { db: { url: url('anagrafiche') } } });

// 1) Quanti doppioni ha creato la piattaforma oggi?
const sospetti = await reg.$queryRawUnsafe(`
  select p.id, p.nome, p."ragioneSociale", p."pIva", p."platformId", p."creatoIl",
         (select count(*) from "anagrafiche"."Partner" v
           where v.id <> p.id and v."pIva" is not null and v."pIva" = p."pIva") as altri_con_stessa_piva
    from "anagrafiche"."Partner" p
   where p.fonte = 'platform' and p."creatoIl" >= '2026-08-23'
   order by p."creatoIl"`);
console.log(`Record creati dalla piattaforma il 23/08: ${sospetti.length}`);
for (const s of sospetti)
  console.log(`  ${s.id} · «${s.nome}» · P.IVA ${s.pIva} · altri record con la stessa P.IVA: ${s.altri_con_stessa_piva}`
    + ` ${Number(s.altri_con_stessa_piva) > 0 ? '🔴 DOPPIONE' : '✅ unico'}`);

// 2) Riparazione del caso 142
const DOPPIONE = 'cmt67ok950000l104xgf1gtt8';
const VERO = 'cmrv7cy480000l804efdnns2s';
const PLATFORM_ID = 'cmt5t89mv004fi6v4kzf7zhrk';

console.log(`\nRiparazione 142 RESTAURANT:`);
console.log(`  ${VERO}     ← ci va il platformId ${PLATFORM_ID}`);
console.log(`  ${DOPPIONE} ← perde il platformId e viene disattivato (non cancellato)`);

if (!SCRIVI) { console.log('\n(prova a vuoto: rilanciare con --scrivi per applicare)'); await reg.$disconnect(); process.exit(0); }

await reg.$transaction([
  reg.$executeRawUnsafe('update "anagrafiche"."Partner" set "platformId" = null, attivo = false where id = $1', DOPPIONE),
  reg.$executeRawUnsafe('update "anagrafiche"."Partner" set "platformId" = $1 where id = $2', PLATFORM_ID, VERO),
]);

const dopo = await reg.$queryRawUnsafe(
  'select id, nome, "ragioneSociale", "platformId", attivo from "anagrafiche"."Partner" where id in ($1, $2)', VERO, DOPPIONE);
console.log('\nDopo:');
for (const r of dopo) console.log(`  ${r.id} · «${r.nome}» · rag.soc. «${r.ragioneSociale}» · platformId ${r.platformId ?? '—'} · attivo ${r.attivo}`);
await reg.$disconnect();
