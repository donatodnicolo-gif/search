/**
 * IMPORTA LO STORICO DI RECLAMI E RIMBORSI IN «Segnalazioni».
 *
 * Due sorgenti legacy diventano righe della tabella Segnalazione:
 *  - delivery-complaint.csv  -> tipo `reclamo`  (message, su valet o partner, con delivery)
 *  - refund-requests.csv     -> tipo `rimborso` (plusValue=importo, requestText, ricevuta, su valet)
 *
 * NON importa `partner-reminder.csv`: sono log automatici di solleciti di
 * pagamento (nessun testo, solo data/stato), non segnalazioni aperte da qualcuno.
 *
 * Gli id legacy (expertId, partnerId, deliveryId) si risolvono agli id di
 * piattaforma via `legacyId`. IDEMPOTENTE: ogni riga porta un `legacyRef`
 * univoco ("complaint:ID" / "refund:ID"), e chi c'è già non si ricrea.
 *
 * Simula di default. Scrive con `--applica`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const APPLICA = process.argv.includes('--applica');
const TABELLE = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..', 'legacy', 'tabelle');

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
  return righe.slice(1).filter((r) => r.some((v) => v !== '')).map((r) =>
    Object.fromEntries(testa.map((c, i) => [c, r[i] === 'NULL' || r[i] === undefined ? null : r[i]])));
}

const rigaEnv = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(rigaEnv.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
process.env.DATABASE_URL = `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform`;
const prisma = new PrismaClient();

// Mappe legacyId -> id di piattaforma
const [valets, partners, deliveries] = await Promise.all([
  prisma.valet.findMany({ where: { legacyId: { not: null } }, select: { id: true, legacyId: true } }),
  prisma.partner.findMany({ where: { legacyId: { not: null } }, select: { id: true, legacyId: true } }),
  prisma.delivery.findMany({ where: { legacyId: { not: null } }, select: { id: true, legacyId: true } }),
]);
const mV = new Map(valets.map((v) => [String(v.legacyId), v.id]));
const mP = new Map(partners.map((p) => [String(p.legacyId), p.id]));
const mD = new Map(deliveries.map((d) => [String(d.legacyId), d.id]));
console.log(`mappe: valet ${mV.size}, partner ${mP.size}, consegne ${mD.size}`);

function pulisci(s) { return (s ?? '').toString().trim(); }

// --- 1) RECLAMI da delivery-complaint -------------------------------------
const complaints = leggi('delivery-complaint');
const righeReclami = [];
let scartatiReclamo = 0;
for (const c of complaints) {
  const testo = pulisci(c.message);
  if (!testo) { scartatiReclamo++; continue; }
  const valetId = c.expertId ? mV.get(String(c.expertId)) ?? null : null;
  const partnerId = c.partnerId ? mP.get(String(c.partnerId)) ?? null : null;
  const deliveryId = c.deliveryId ? mD.get(String(c.deliveryId)) ?? null : null;
  righeReclami.push({
    legacyRef: `complaint:${c.id}`,
    tipo: 'reclamo', importo: null, partnerId, valetId, deliveryId,
    oggetto: deliveryId ? 'Reclamo su consegna (storico)' : 'Reclamo (storico)',
    testo,
    ricevutaUrl: null,
    stato: 'chiusa', // storico: già gestito ai tempi, l'ufficio può riaprire
    apertaDaRuolo: valetId ? 'VALET' : partnerId ? 'PARTNER' : null,
    createdAt: c.createdAt ? new Date(c.createdAt) : null,
  });
}

// --- 2) RIMBORSI da refund-requests ---------------------------------------
const refunds = leggi('refund-requests');
const righeRimborsi = [];
let scartatiRimborso = 0;
const statoRimborso = (s) => {
  const v = pulisci(s).toLowerCase();
  if (v === 'paid' || v === 'approved' || v === 'rejected') return 'chiusa';
  return 'aperta'; // created / vuoto: ancora da lavorare
};
// La ricevuta storica va in un campo suo (link cliccabile), non nel testo.
// Si normalizza solo il percorso ("/./" del vecchio sistema), senza inventare
// un dominio: è il riferimento originale, che i file siano ancora online o no.
const pulisciUrl = (s) => pulisci(s).replace('/api/./assets/', '/api/assets/') || null;
for (const r of refunds) {
  const testo = pulisci(r.requestText) || 'Richiesta di rimborso (storico)';
  const importo = r.plusValue != null && r.plusValue !== '' ? Number(r.plusValue) : null;
  const valetId = r.expertId ? mV.get(String(r.expertId)) ?? null : null;
  const deliveryId = r.deliveryId ? mD.get(String(r.deliveryId)) ?? null : null;
  righeRimborsi.push({
    legacyRef: `refund:${r.id}`,
    tipo: 'rimborso',
    importo: Number.isFinite(importo) ? importo : null,
    partnerId: null, valetId, deliveryId,
    oggetto: 'Richiesta rimborso (storico)',
    testo,
    ricevutaUrl: pulisciUrl(r.receipt),
    stato: statoRimborso(r.requestStatus),
    apertaDaRuolo: 'VALET',
    createdAt: r.createdAt ? new Date(r.createdAt) : null,
  });
}

const tutte = [...righeReclami, ...righeRimborsi];
console.log(`reclami pronti: ${righeReclami.length} (scartati senza testo: ${scartatiReclamo})`);
console.log(`rimborsi pronti: ${righeRimborsi.length} (scartati: ${scartatiRimborso})`);
console.log(`  reclami legati a un valet: ${righeReclami.filter((x) => x.valetId).length}, a un partner: ${righeReclami.filter((x) => x.partnerId).length}, orfani: ${righeReclami.filter((x) => !x.valetId && !x.partnerId).length}`);
console.log(`  rimborsi legati a un valet: ${righeRimborsi.filter((x) => x.valetId).length}, con importo: ${righeRimborsi.filter((x) => x.importo != null).length}`);

if (!APPLICA) {
  console.log('\nPROVA A VUOTO: niente scritto. Rilancia con --applica.');
  await prisma.$disconnect();
  process.exit(0);
}

let scritte = 0, aggiornate = 0;
for (const s of tutte) {
  // ON CONFLICT DO UPDATE: rende ri-eseguibile e sistema le righe del primo
  // import (ricevuta nel testo → nel suo campo). Non tocca stato/risposta
  // eventualmente cambiati dall'ufficio.
  const res = await prisma.$executeRawUnsafe(
    `INSERT INTO platform."Segnalazione"
       (id, "legacyRef", tipo, importo, "partnerId", "valetId", "deliveryId", oggetto, testo, "ricevutaUrl", stato, "apertaDaRuolo", "createdAt", "updatedAt")
     VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, COALESCE($12::timestamp, now()), now())
     ON CONFLICT ("legacyRef") DO UPDATE SET
       testo = EXCLUDED.testo, "ricevutaUrl" = EXCLUDED."ricevutaUrl", importo = EXCLUDED.importo, oggetto = EXCLUDED.oggetto`,
    s.legacyRef, s.tipo, s.importo, s.partnerId, s.valetId, s.deliveryId,
    s.oggetto, s.testo, s.ricevutaUrl, s.stato, s.apertaDaRuolo, s.createdAt,
  );
  if (res === 1) scritte++; else aggiornate++;
}

const [{ n }] = await prisma.$queryRawUnsafe('SELECT COUNT(*) n FROM platform."Segnalazione"');
console.log('\n--- esito ---');
console.log(`scritte nuove: ${scritte}, aggiornate: ${aggiornate}`);
console.log(`totale segnalazioni in tabella adesso: ${Number(n)}`);
await prisma.$disconnect();
