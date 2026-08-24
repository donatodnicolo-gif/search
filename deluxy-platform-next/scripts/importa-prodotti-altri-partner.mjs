// I collegamenti «questo prodotto lo vende anche quest'altro partner».
//
// Nel legacy sono in una tabella senza nome (`tabella-64`, coppie
// productId/partnerId). Sono il meccanismo del Corporate Service: un prodotto
// UNICO di un partner puo' essere venduto anche da altri quando il flag
// `visibleToOtherPartners` e' acceso.
//
// Senza questi collegamenti lo smistamento, per un prodotto unico, ha un solo
// candidato: se quel partner e' chiuso la vendita resta da gestire anche
// quando qualcun altro avrebbe potuto prenderla.
//
// Di default non scrive. Con --scrivi applica.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { leggiCsv } from './leggi-csv.mjs';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const SCRIVI = process.argv.includes('--scrivi');
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
const db = new PrismaClient({ datasources: { db: { url:
  `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform&connection_limit=1` } } });

const legami = leggiCsv('C:/Users/nicol/app/deluxy-platform-next/legacy/tabelle/tabella-64.csv')
  .filter((r) => !r.deletedAt);
console.log(`collegamenti nel legacy (non cancellati): ${legami.length}`);

const prodotti = new Map((await db.product.findMany({ where: { NOT: { legacyId: null } }, select: { id: true, legacyId: true, name: true, visibleToOtherPartners: true } })).map((p) => [String(p.legacyId), p]));
const partners = new Map((await db.partner.findMany({ where: { NOT: { legacyId: null } }, select: { id: true, legacyId: true, insegna: true } })).map((p) => [String(p.legacyId), p]));

const daCreare = [], senzaProdotto = [], senzaPartner = [], flagSpento = [];
for (const l of legami) {
  const p = prodotti.get(String(l.productId));
  const pa = partners.get(String(l.partnerId));
  if (!p) { senzaProdotto.push(l.productId); continue; }
  if (!pa) { senzaPartner.push(l.partnerId); continue; }
  // Il collegamento si importa comunque: il flag e' una decisione dell'utente,
  // e spegnerlo non deve cancellare la lista dei partner scelti.
  if (!p.visibleToOtherPartners) flagSpento.push(`${p.name} → ${pa.insegna}`);
  daCreare.push({ productId: p.id, partnerId: pa.id, etichetta: `${p.name.slice(0, 30)} → ${pa.insegna}` });
}
console.log(`  da creare: ${daCreare.length} · prodotto non trovato: ${senzaProdotto.length} · partner non trovato: ${senzaPartner.length}`);
if (flagSpento.length) console.log(`  ⚠️ ${flagSpento.length} collegamenti su prodotti col flag «visibile ad altri» SPENTO (importati lo stesso, non si vedranno finche' resta spento)`);
for (const d of daCreare.slice(0, 10)) console.log(`     ${d.etichetta}`);

if (!SCRIVI) { console.log('\n(prova a vuoto: rilanciare con --scrivi)'); await db.$disconnect(); process.exit(0); }
let creati = 0;
for (const d of daCreare) {
  await db.productPartnerLink.upsert({
    where: { productId_partnerId: { productId: d.productId, partnerId: d.partnerId } },
    update: {}, create: { productId: d.productId, partnerId: d.partnerId },
  });
  creati++;
}
console.log(`\n✅ collegamenti in piattaforma: ${await db.productPartnerLink.count()} (creati/confermati ${creati})`);
await db.$disconnect();
