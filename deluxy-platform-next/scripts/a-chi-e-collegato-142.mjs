// La scheda dice «Collegato, trovato per platformId — nessuna differenza».
// Ma nel registro la ragione sociale di 142 RESTAURANT e' BEYOND 142 SRL:
// una differenza c'e' per forza. Quindi il record a cui e' collegato non e'
// quello vero. Qui si guarda QUALE record porta quel platformId.
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
const url = (s) => `postgresql://${u.username}:${u.password}@${u.hostname}:6543/postgres?schema=${s}&pgbouncer=true&connection_limit=1`;
const reg = new PrismaClient({ datasources: { db: { url: url('anagrafiche') } } });

const ID = 'cmt5t89mv004fi6v4kzf7zhrk';
console.log(`Record del registro con platformId = ${ID}:`);
const collegati = await reg.$queryRawUnsafe(
  'select id, nome, "ragioneSociale", "pIva", email, citta, provincia, attivo, "creatoIl", "aggiornatoIl", fonte from "anagrafiche"."Partner" where "platformId" = $1', ID);
for (const r of collegati) console.log(`  ${r.id} · ${r.nome} · rag.soc. ${r.ragioneSociale} · P.IVA ${r.pIva} · citta ${r.citta ?? '—'} · fonte ${r.fonte ?? '—'} · creato ${r.creatoIl?.toISOString?.().slice(0, 16)}`);
if (!collegati.length) console.log('  nessuno');

console.log('\nTutti i record che parlano di 142 / BEYOND:');
const tutti = await reg.$queryRawUnsafe(
  `select id, nome, "ragioneSociale", "pIva", citta, "platformId", fonte, "creatoIl",
          (select count(*) from "anagrafiche"."Contatto" c where c."partnerId" = p.id) as contatti
     from "anagrafiche"."Partner" p
    where nome ilike '%142%' or "ragioneSociale" ilike '%142%' or "ragioneSociale" ilike '%beyond%'`);
for (const r of tutti)
  console.log(`  ${r.id}\n     nome «${r.nome}» · rag.soc. «${r.ragioneSociale}» · P.IVA ${r.pIva} · citta ${r.citta ?? '—'}`
    + `\n     platformId ${r.platformId ?? '—'} · fonte ${r.fonte ?? '—'} · contatti ${r.contatti} · creato ${r.creatoIl?.toISOString?.().slice(0, 16)}`);
await reg.$disconnect();
