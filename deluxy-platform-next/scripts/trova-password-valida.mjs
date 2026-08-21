// Cerca, fra le copie locali, una password ANCORA VALIDA per il progetto Supabase
// della piattaforma (`feleldlsreurqpdhstla`, account cs@deluxy.it, eu-west-1).
//
// Contesto: la password fu cambiata il 26/07/2026 e su Vercel non fu mai
// riportata (P1000 da allora). La copia in scoutwt/deluxy-platform-next/api/.env
// e' altrettanto vecchia. Ma AI Mail ha vissuto sullo STESSO progetto (schema
// `mail`) fino al trasloco del 19/08, cioe' ben dopo il cambio: le sue copie
// dovrebbero contenere la password attuale.
//
// ⚠️ Il host diretto `db.<ref>.supabase.co` risolve solo su IPv6 e da questa
// macchina non si raggiunge: si prova sempre dal POOLER IPv4, utenza
// `postgres.<ref>`, porta 6543.
//
// Stampa solo QUALE file funziona. Mai la password.
//
// Uso:  node C:/Users/nicol/app/deluxy-platform-next/scripts/trova-password-valida.mjs

import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

const REF = 'feleldlsreurqpdhstla';
const REGION = 'eu-west-1';

const CANDIDATI = [
  'C:/Users/nicol/scoutwt/deluxy-mail/.env',
  'C:/Users/nicol/scoutwt/deluxy-mail/.env.sposta',
  'C:/Users/nicol/scoutwt/deluxy-platform-next/api/.env',
];

/** Estrae tutte le stringhe di connessione del progetto cercato da un file. */
function connessioni(file) {
  if (!fs.existsSync(file)) return [];
  const fuori = [];
  for (const l of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!m) continue;
    const val = m[2].trim().replace(/^"|"$/g, '');
    if (!val.startsWith('postgres') || !val.includes(REF)) continue;
    try { fuori.push({ chiave: m[1], url: new URL(val) }); } catch { /* non e' un URL */ }
  }
  return fuori;
}

/** Riscrive una connessione qualsiasi nella forma pooler IPv4. */
function versoPooler(u) {
  const p = new URL(u.toString());
  p.username = `postgres.${REF}`;
  p.hostname = `aws-0-${REGION}.pooler.supabase.com`;
  p.port = '6543';
  p.pathname = '/postgres';
  p.search = '?pgbouncer=true&connection_limit=1';
  return p.toString();
}

let vincente = null;

for (const file of CANDIDATI) {
  const trovate = connessioni(file);
  if (!trovate.length) { console.log(`— ${file}: nessuna connessione a ${REF}`); continue; }

  for (const { chiave, url } of trovate) {
    process.env.DATABASE_URL = versoPooler(url);
    const prisma = new PrismaClient();
    try {
      const [{ n }] = await prisma.$queryRawUnsafe(
        `select count(*)::int as n from information_schema.tables where table_schema = 'public'`);
      console.log(`✅ ${file} · ${chiave}: PASSWORD VALIDA (public ha ${n} tabelle)`);
      vincente = vincente ?? { file, chiave, url };
    } catch (e) {
      const codice = e.errorCode ?? e.constructor.name;
      console.log(`❌ ${file} · ${chiave}: ${codice === 'P1000' ? 'password rifiutata (P1000)' : codice}`);
    } finally {
      await prisma.$disconnect();
    }
  }
}

console.log('');
if (!vincente) {
  console.log('NESSUNA copia locale ha la password attuale.');
  console.log(`→ Serve resettarla dalla dashboard Supabase del progetto ${REF}`);
  console.log('  (account cs@deluxy.it): Settings → Database → Reset database password.');
  process.exitCode = 1;
} else {
  console.log(`Password attuale disponibile in: ${vincente.file} (${vincente.chiave}).`);
  console.log('→ Si puo' + "' " + 'procedere a riscrivere le env di produzione del progetto Vercel `delivery`.');
}
