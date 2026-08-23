// Controprova della modifica: la ricerca del registro riceve «beyond 142»
// (nome semplificato) invece di «BEYOND 142 S.R.L.» — trova un solo record?
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
const url = (s) => `postgresql://${u.username}:${u.password}@${u.hostname}:6543/postgres?schema=${s}&pgbouncer=true&connection_limit=1`;
const reg = new PrismaClient({ datasources: { db: { url: url('anagrafiche') } } });

for (const q of ['BEYOND 142 S.R.L.', 'beyond 142']) {
  const r = await reg.$queryRawUnsafe(
    `select nome, "ragioneSociale", "pIva" from "anagrafiche"."Partner"
     where nome ilike $1 or "ragioneSociale" ilike $1`, `%${q}%`);
  console.log(`«${q}» → ${r.length} risultati`);
  for (const x of r) console.log(`     ${x.nome} · ragione sociale: ${x.ragioneSociale} · P.IVA ${x.pIva}`);
}
await reg.$disconnect();
