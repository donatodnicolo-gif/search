/**
 * QUATTRO COLONNE IN AGGIUNTA su merchandising."Prodotto" (10/09/2026): i valori EFFETTIVI di
 * disponibilità dei prodotti unici, calcolati dal calendario del partner.
 *
 *   node scripts/applica-migrazione-disponibilita-unici.mjs            (anteprima)
 *   node scripts/applica-migrazione-disponibilita-unici.mjs --applica
 *
 * Solo ADD COLUMN IF NOT EXISTS, tutte nullable: le altre app non se ne accorgono, rilanciarla
 * non fa danno. Va PRIMA del deploy del codice che le legge.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const APPLICA = process.argv.includes('--applica');
const M = 'C:/Users/nicol/scoutwt/deluxy-merchandising/';
const require = createRequire(M + 'package.json');
const { PrismaClient } = require('@prisma/client');
const l = fs.readFileSync(M + '.env', 'utf8').split(/\r?\n/).find((x) => x.startsWith('DATABASE_URL='));
const u = new URL(l.slice(13).trim().replace(/^"|"$/g, '')); u.searchParams.set('connection_limit', '1');
const db = new PrismaClient({ datasources: { db: { url: u.toString() } } });
const SQL = [
  'ALTER TABLE merchandising."Prodotto" ADD COLUMN IF NOT EXISTS "ggDispEffettivo" INTEGER',
  'ALTER TABLE merchandising."Prodotto" ADD COLUMN IF NOT EXISTS "minimoOrarioEffettivo" INTEGER',
  'ALTER TABLE merchandising."Prodotto" ADD COLUMN IF NOT EXISTS "disponibilitaCalcolataIl" TIMESTAMP(3)',
  'ALTER TABLE merchandising."Prodotto" ADD COLUMN IF NOT EXISTS "disponibilitaMotivo" TEXT',
];
const prima = await db.$queryRawUnsafe(`SELECT column_name FROM information_schema.columns WHERE table_schema='merchandising' AND table_name='Prodotto' AND column_name IN ('ggDispEffettivo','minimoOrarioEffettivo','disponibilitaCalcolataIl','disponibilitaMotivo')`);
console.log('colonne già presenti:', prima.map((r) => r.column_name).join(', ') || 'nessuna');
if (!APPLICA) { console.log('ANTEPRIMA: nessuna scrittura.'); await db.$disconnect(); process.exit(0); }
for (const s of SQL) { await db.$executeRawUnsafe(s); console.log('OK', s.slice(0, 80)); }
const dopo = await db.$queryRawUnsafe(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='merchandising' AND table_name='Prodotto' AND column_name IN ('ggDispEffettivo','minimoOrarioEffettivo','disponibilitaCalcolataIl','disponibilitaMotivo') ORDER BY column_name`);
console.log('VERIFICA (' + dopo.length + '):', dopo.map((r) => `${r.column_name} ${r.data_type}`).join(' · '));
await db.$disconnect();
