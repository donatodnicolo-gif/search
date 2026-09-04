/**
 * HOME «SERVIZI» DEL PARTNER (04/09/2026): scrive l'impostazione
 * `homePartnerEmails` (le email dei partner che all'accesso atterrano sulla
 * pagina dei servizi richiedibili). Stessa cosa che fa Configurazione →
 * Impostazioni → «Home Servizi all'accesso»; da qui per il primo valore.
 *
 * Uso:  node scripts/imposta-home-partner.mjs                 → mostra il valore attuale
 *       node scripts/imposta-home-partner.mjs --imposta a@b.it,c@d.it
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
u.searchParams.set('schema', 'platform');
process.env.DATABASE_URL = u.toString();
const prisma = new PrismaClient();
const KEY = 'homePartnerEmails';
const i = process.argv.indexOf('--imposta');
const attuale = await prisma.appSetting.findUnique({ where: { key: KEY } });
console.log(`prima: ${attuale?.value ?? '(vuoto)'}`);
if (i > 0) {
  const valore = String(process.argv[i + 1] ?? '').trim();
  const emails = valore.split(/[,;\s]+/).filter(Boolean);
  // Ogni email deve corrispondere a un utente PARTNER attivo: un refuso
  // scritto qui accenderebbe la home a nessuno, in silenzio.
  for (const e of emails) {
    const utente = await prisma.user.findUnique({ where: { email: e.toLowerCase() }, select: { role: true, status: true } });
    if (!utente || utente.role !== 'PARTNER') { console.error(`✗ ${e}: non è un utente PARTNER (${utente ? utente.role : 'inesistente'})`); process.exit(1); }
    console.log(`✓ ${e}: PARTNER, stato ${utente.status}`);
  }
  const salvato = await prisma.appSetting.upsert({ where: { key: KEY }, update: { value: valore }, create: { key: KEY, value: valore } });
  console.log(`dopo: ${salvato.value}`);
}
await prisma.$disconnect();
