/**
 * PORTA IN CASA I DATI DEL LEGACY CHE QUI NON HANNO UN MODELLO.
 *
 * Prima di spegnere `app.deluxy.it` non deve restare di là niente che qui non
 * ci sia. Le tabelle con una casa propria (consegne, partner, valet, prodotti,
 * fatture, ricevute…) sono già importate da `importa-legacy.mjs`; questo
 * script prende TUTTO IL RESTO — reclami, promemoria, email in ingresso,
 * storico delle notifiche, collegamenti prodotti↔collezioni — e lo mette in
 * `LegacyArchive`: la riga originale, campo per campo, senza interpretarla.
 *
 * ⚠️ Interpretarla adesso vorrebbe dire decidere per il futuro con la fretta di
 * oggi. L'archivio conserva; il modello vero, se serve, si fa dopo.
 *
 * Simula di default. Scrive con `--applica`. È IDEMPOTENTE: la coppia
 * (tabella, legacyId) è unica, e chi c'è già non si tocca.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const APPLICA = process.argv.includes('--applica');
const TABELLE = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..', 'legacy', 'tabelle');

/** I CSV che una casa ce l'hanno già: non si archiviano, sarebbero doppioni. */
const GIA_IMPORTATE = new Set([
  'delivery', 'delivery-product', 'delivery-updates', 'delivery-rules', 'delivery-invoices',
  'product', 'products-variants', 'product-category', 'product-category-province-discount',
  'partner', 'partner-service', 'partner-time-availability',
  'expert', 'expert-service', 'expert-time-availability', 'expert-vehicle', 'expert-receipts',
  'customer', 'user', 'service', 'province', 'provinces', 'city', 'province-cities',
  'team-leader-province', 'valet-activities', 'refund-requests',
  'tabella-2', 'tabella-4', 'tabella-5', 'tabella-9', 'tabella-12', 'tabella-21', 'tabella-23',
  'tabella-38', 'tabella-42', 'tabella-54', 'tabella-56', 'tabella-57', 'tabella-64',
  'tabella-72', 'tabella-73', 'tabella-83', 'tabella-85', 'tabella-89', 'tabella-90',
]);

function leggi(nome) {
  const testo = fs.readFileSync(path.join(TABELLE, `${nome}.csv`), 'utf8');
  const righe = []; let riga = [], campo = '', inStr = false;
  for (let i = 0; i < testo.length; i++) {
    const c = testo[i];
    if (inStr) {
      if (c === '"' && testo[i + 1] === '"') { campo += '"'; i++; continue; }
      if (c === '"') { inStr = false; continue; }
      campo += c; continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === ',') { riga.push(campo); campo = ''; continue; }
    if (c === '\n') { riga.push(campo); righe.push(riga); riga = []; campo = ''; continue; }
    if (c === '\r') continue;
    campo += c;
  }
  if (campo !== '' || riga.length) { riga.push(campo); righe.push(riga); }
  if (!righe.length) return [];
  const testa = righe[0].map((x) => x.trim());
  // ⚠️ Nell'export phpMyAdmin il vuoto è la STRINGA "NULL": si converte, o
  // nell'archivio finirebbe la parola.
  return righe.slice(1).filter((r) => r.some((v) => v !== '')).map((r) =>
    Object.fromEntries(testa.map((c, i) => [c, r[i] === 'NULL' || r[i] === undefined ? null : r[i]])));
}

const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
// La 5432 diretta: qui si scrivono decine di migliaia di righe.
process.env.DATABASE_URL = `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform`;
const prisma = new PrismaClient();

const daArchiviare = fs.readdirSync(TABELLE)
  .filter((f) => f.endsWith('.csv'))
  .map((f) => f.replace(/\.csv$/, ''))
  .filter((n) => !GIA_IMPORTATE.has(n));

console.log('tabelle da archiviare:', daArchiviare.length);
let totale = 0, scritte = 0;
for (const nome of daArchiviare) {
  const righe = leggi(nome);
  totale += righe.length;
  if (!righe.length) continue;
  console.log(`${nome.padEnd(34)} ${String(righe.length).padStart(6)} righe`);
  if (!APPLICA) continue;
  const BLOCCO = 500;
  for (let i = 0; i < righe.length; i += BLOCCO) {
    const blocco = righe.slice(i, i + BLOCCO);
    // ⚠️ SQL diretto e non `prisma.legacyArchive`: il client tipizzato non
    // conosce il modello finché non lo si rigenera, e rigenerarlo mentre un
    // altro script sta usando il motore fallisce (EPERM sulla dll).
    const valori = blocco.map((_, k) => `(gen_random_uuid()::text, $${k * 3 + 1}::text, $${k * 3 + 2}::text, $${k * 3 + 3}::text::jsonb)`).join(',');
    const parametri = blocco.flatMap((r) => [nome, r.id != null ? String(r.id) : null, JSON.stringify(r)]);
    await prisma.$executeRawUnsafe(
      `INSERT INTO platform."LegacyArchive" (id, tabella, "legacyId", dati)
       VALUES ${valori}
       ON CONFLICT (tabella, "legacyId") DO NOTHING`, ...parametri);
    scritte += blocco.length;
  }
}
console.log('\n--- esito ---');
console.log('righe trovate:', totale);
if (!APPLICA) console.log('PROVA A VUOTO: niente scritto. Rilancia con --applica.');
else {
  const [{ n }] = await prisma.$queryRawUnsafe('SELECT COUNT(*) n FROM platform."LegacyArchive"');
  console.log('righe passate:', scritte, '| in archivio adesso:', Number(n));
}
await prisma.$disconnect();
