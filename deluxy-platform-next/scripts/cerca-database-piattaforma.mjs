// Cerca la connessione al database della piattaforma nella cassaforte chiavi
// dell'Hub (schema `hub` del cluster Postgres condiviso).
//
// Perche' esiste: la DATABASE_URL di produzione su Vercel e' di tipo "Sensitive"
// (sola scrittura, non rileggibile) e il 21/08 e' stato misurato che il database
// della piattaforma NON e' lo schema public del cluster condiviso — li' c'e' il
// FINANCE. Serve quindi ritrovare da qualche altra parte quale database sia.
//
// Stampa solo NOMI di chiave e, al massimo, l'host di una connessione trovata.
// Mai le password.
//
// Uso:  node C:/Users/nicol/app/deluxy-platform-next/scripts/cerca-database-piattaforma.mjs

import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

const ENV_FILE = 'C:/Users/nicol/app/deluxy-tasks/.env';
const riga = fs
  .readFileSync(ENV_FILE, 'utf8')
  .split(/\r?\n/)
  .find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
u.pathname = '/postgres';
u.search = '?pgbouncer=true&connection_limit=1';
process.env.DATABASE_URL = u.toString();

/** Nasconde la password di una stringa di connessione, lasciando leggibile l'host. */
const mascheraUrl = (s) => String(s).replace(/(:\/\/[^:@/]+:)[^@]*@/, '$1***@');

const prisma = new PrismaClient();
try {
  const tabelle = await prisma.$queryRawUnsafe(`
    select table_name from information_schema.tables
    where table_schema = 'hub' order by 1`);
  console.log(`TABELLE nello schema hub (${tabelle.length}):`);
  console.log('  ' + tabelle.map((r) => r.table_name).join(', '));

  // Cerca ogni tabella che abbia una colonna testuale plausibile per un segreto
  // e mostra solo i NOMI delle chiavi custodite.
  const colonne = await prisma.$queryRawUnsafe(`
    select table_name, column_name, data_type
    from information_schema.columns
    where table_schema = 'hub' order by table_name, ordinal_position`);
  console.log('\nCOLONNE:');
  let corrente = null;
  for (const c of colonne) {
    if (c.table_name !== corrente) {
      corrente = c.table_name;
      process.stdout.write(`\n  ${corrente}: `);
    }
    process.stdout.write(`${c.column_name} `);
  }
  console.log('\n');

  // Se esiste una tabella con una colonna "nome"/"chiave", elenca i nomi.
  const candidate = [...new Set(colonne.map((c) => c.table_name))];
  for (const t of candidate) {
    const cols = colonne.filter((c) => c.table_name === t).map((c) => c.column_name);
    const colNome = cols.find((c) => /^(nome|name|chiave|key|slug|codice)$/i.test(c));
    if (!colNome) continue;
    const righe = await prisma.$queryRawUnsafe(
      `select "${colNome}" as nome from "hub"."${t}" order by 1 limit 100`);
    console.log(`NOMI in hub.${t} (${righe.length}):`);
    for (const r of righe) console.log(`  - ${r.nome}`);
    console.log('');
  }

  // Ultima passata: cerca in tutte le colonne testuali una stringa postgres://
  for (const t of candidate) {
    const testuali = colonne
      .filter((c) => c.table_name === t && /char|text/.test(c.data_type))
      .map((c) => c.column_name);
    if (!testuali.length) continue;
    const where = testuali.map((c) => `"${c}" like 'postgres%'`).join(' or ');
    const sel = testuali.map((c) => `"${c}"`).join(', ');
    try {
      const hit = await prisma.$queryRawUnsafe(
        `select ${sel} from "hub"."${t}" where ${where} limit 5`);
      if (hit.length) {
        console.log(`⚑ CONNESSIONI POSTGRES trovate in hub.${t}:`);
        for (const r of hit)
          for (const [k, v] of Object.entries(r))
            if (String(v).startsWith('postgres')) console.log(`  ${k}: ${mascheraUrl(v)}`);
      }
    } catch {
      /* tabella non interrogabile, si prosegue */
    }
  }
} catch (e) {
  console.log(`ERRORE: ${e.constructor.name} ${e.errorCode ?? ''}`);
  console.log(String(e.message).split('\n').slice(0, 6).join('\n'));
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
