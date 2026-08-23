// Dimostra QUALE database sta davvero servendo https://deluxy-delivery.vercel.app.
//
// Non ci si puo' fidare di "l'ho scritta io": su Vercel DATABASE_URL e' di tipo
// Sensitive e non si rilegge. Si prova dal lato dati, con due impronte:
//
//   1. l'id dell'utente admin restituito dal login in produzione deve combaciare
//      con quello presente nel database, e i due database hanno id DIVERSI
//      (sono stati seedati in momenti diversi);
//   2. le 5 sospensioni fatte oggi via API devono comparire solo nel database
//      che la produzione sta davvero usando.
//
// Nessuna password viene stampata.
//
// Uso:  node C:/Users/nicol/app/deluxy-platform-next/scripts/quale-database-serve-la-produzione.mjs

import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

/** Legge una variabile da un .env e la riscrive in forma pooler. */
function connessione({ file, chiave, region, schema }) {
  const riga = fs.readFileSync(file, 'utf8').split(/\r?\n/).find((l) => l.startsWith(`${chiave}=`));
  if (!riga) return null;
  const u = new URL(riga.slice(chiave.length + 1).trim().replace(/^"|"$/g, ''));
  const ref = /^db\./.test(u.hostname)
    ? u.hostname.replace(/^db\./, '').replace(/\.supabase\.co$/, '')
    : u.username.replace(/^postgres\./, '');
  u.username = `postgres.${ref}`;
  u.hostname = `aws-0-${region}.pooler.supabase.com`;
  u.port = '6543';
  u.pathname = '/postgres';
  u.search = `?pgbouncer=true&connection_limit=1${schema ? `&schema=${schema}` : ''}`;
  return { ref, schema: schema ?? 'public', url: u.toString() };
}

const CANDIDATI = [
  {
    nome: 'cluster condiviso Pro (dove credo di aver puntato)',
    ...connessione({
      file: 'C:/Users/nicol/app/deluxy-tasks/.env', chiave: 'DATABASE_URL',
      region: 'eu-central-1', schema: 'platform',
    }),
  },
  {
    nome: 'vecchio progetto Free (dove stava fino a stamattina)',
    ...connessione({
      file: 'C:/Users/nicol/scoutwt/deluxy-mail/.env', chiave: 'A_DATABASE_URL',
      region: 'eu-west-1', schema: null,
    }),
  },
];

// Impronta presa dalla produzione, dall'esterno.
const r = await fetch('https://deluxy-delivery.vercel.app/api/v1/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'admin@deluxy.it', password: 'Deluxy2026!' }),
});
if (!r.ok) { console.log(`Login in produzione fallito: HTTP ${r.status}`); process.exit(1); }
const { user } = await r.json();
console.log('PRODUZIONE (misurata dall\'esterno):');
console.log(`  id dell'admin: ${user.id}\n`);

for (const c of CANDIDATI) {
  console.log(`${c.nome}`);
  console.log(`  progetto ${c.ref} · schema ${c.schema}`);
  process.env.DATABASE_URL = c.url;
  const prisma = new PrismaClient();
  try {
    const utenti = await prisma.$queryRawUnsafe(
      `select id, email, status from "User" order by email`);
    const admin = utenti.find((u) => u.email === 'admin@deluxy.it');
    const sospesi = utenti.filter((u) => u.status === 'suspended').length;
    const combacia = admin?.id === user.id;
    console.log(`  id dell'admin qui: ${admin?.id ?? '(assente)'}`);
    console.log(`  utenti sospesi: ${sospesi} su ${utenti.length}`);
    console.log(`  ${combacia ? '✅ E\' QUESTO il database che serve la produzione.' : '❌ non e\' questo.'}\n`);
  } catch (e) {
    console.log(`  errore: ${String(e.message).split('\n')[0]}\n`);
  } finally { await prisma.$disconnect(); }
}
