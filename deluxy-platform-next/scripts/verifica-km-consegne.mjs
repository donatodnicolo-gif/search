// La distanza delle consegne: confronto uno a uno col legacy.
//
// In piattaforma `Delivery.distanceKm` e' valorizzata su 31.768 consegne su
// 61.836 — sembra un buco a meta'. Ma nel legacy la `distance` e' vuota su
// altrettante: prima di «importare i km mancanti» va verificato che manchino
// davvero, invece di riempirli con uno zero che sembrerebbe un dato.
//
// `Delivery.extraKm` resta 0 ovunque: nel legacy quella colonna non esiste.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { leggiCsv } from './leggi-csv.mjs';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
const db = new PrismaClient({ datasources: { db: { url:
  `postgresql://${u.username}:${u.password}@${u.hostname}:6543/postgres?schema=platform&pgbouncer=true&connection_limit=1` } } });

const legacy = new Map(leggiCsv('C:/Users/nicol/app/deluxy-platform-next/legacy/tabelle/delivery.csv')
  .map((d) => [d.id, d.distance]));

const nostre = await db.delivery.findMany({ select: { legacyId: true, distanceKm: true } });
let confrontate = 0, uguali = 0;
const vuotaQuiPienaLa = [], diverse = [], senzaLegacy = [];
for (const d of nostre) {
  if (d.legacyId === null) { senzaLegacy.push(d); continue; }
  if (!legacy.has(String(d.legacyId))) { senzaLegacy.push(d); continue; }
  confrontate++;
  const la = legacy.get(String(d.legacyId));
  const laN = la === null || la === '' ? null : Number(la);
  if (laN === null && d.distanceKm === null) { uguali++; continue; }
  if (laN !== null && d.distanceKm === null) { vuotaQuiPienaLa.push([d.legacyId, laN]); continue; }
  if (Math.abs((d.distanceKm ?? 0) - (laN ?? 0)) < 0.005) uguali++;
  else diverse.push([d.legacyId, d.distanceKm, laN]);
}
console.log(`consegne in piattaforma: ${nostre.length} · confrontate col legacy: ${confrontate}`);
console.log(`  ✅ distanza identica (vuoto compreso): ${uguali}`);
console.log(`  ${vuotaQuiPienaLa.length ? '🔴' : '✅'} vuota qui ma piena nel legacy: ${vuotaQuiPienaLa.length}`);
for (const [id, v] of vuotaQuiPienaLa.slice(0, 8)) console.log(`       consegna legacy ${id}: ${v} km`);
console.log(`  ${diverse.length ? '🔴' : '✅'} valori diversi: ${diverse.length}`);
for (const [id, q, l] of diverse.slice(0, 8)) console.log(`       consegna legacy ${id}: qui ${q} ≠ ${l}`);
console.log(`  ℹ️ senza corrispondenza nel legacy (create qui): ${senzaLegacy.length}`);
await db.$disconnect();
