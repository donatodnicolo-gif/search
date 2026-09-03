/**
 * RICONTROLLO (ordine utente 03/09): nessuna vendita APERTA (da_gestire /
 * proposta) deve restare tale se la sua consegna esiste già in piattaforma
 * (storico compreso) — va in STORICO (accettata) agganciata alla consegna.
 *
 * Identità, non numero amichevole («numero ≠ identità»): la coda di
 * Sale.externalOrderId (gid://shopify/Order/N) contro Delivery.realOrderNumber
 * (l'ID numerico Shopify). Vendite senza externalOrderId non sono abbinabili.
 *
 * Anteprima; scrive con --applica. Idempotente (tocca solo le aperte).
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const APPLICA = process.argv.includes('--applica');
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
u.searchParams.set('schema', 'platform');
process.env.DATABASE_URL = u.toString();
const prisma = new PrismaClient();
for (let t = 1; t <= 5; t++) {
  try { await prisma.$queryRaw`SELECT 1`; break; }
  catch (e) { if (t === 5) { console.error('DB irraggiungibile'); process.exit(1); } await new Promise((r) => setTimeout(r, 4000)); }
}

const aperte = await prisma.sale.findMany({
  where: { status: { in: ['da_gestire', 'proposta'] } },
  select: { id: true, status: true, externalOrderId: true, externalOrderNumber: true, brand: true, deliveryId: true },
});
console.log(`Vendite aperte: ${aperte.length}`);

// Le consegne per ID Shopify (una passata sola, non 60 query).
const code = aperte.map((s) => String(s.externalOrderId ?? '').split('/').pop()).filter(Boolean);
const consegne = code.length ? await prisma.delivery.findMany({
  where: { realOrderNumber: { in: code }, deletedAt: null },
  select: { id: true, code: true, realOrderNumber: true, partnerId: true, status: true },
}) : [];
const perNumero = new Map();
for (const d of consegne) {
  const a = perNumero.get(d.realOrderNumber) ?? [];
  a.push(d);
  perNumero.set(d.realOrderNumber, a);
}
// deliveryId è @unique sulla vendita: chi è già agganciato non si ruba.
const occupate = new Set((await prisma.sale.findMany({
  where: { deliveryId: { not: null } }, select: { deliveryId: true },
})).map((x) => x.deliveryId));

const daSpostare = [];
for (const s of aperte) {
  const tail = String(s.externalOrderId ?? '').split('/').pop();
  if (!tail) continue;
  const cand = (perNumero.get(tail) ?? []).sort((a, b) => a.code - b.code);
  if (!cand.length) continue;
  const libera = cand.find((d) => !occupate.has(d.id)) ?? null;
  daSpostare.push({
    saleId: s.id, ordine: s.externalOrderNumber, brand: s.brand, stato: s.status,
    consegna: cand[0].code, statoConsegna: cand[0].status,
    deliveryId: libera?.id ?? null, partnerId: (libera ?? cand[0]).partnerId,
    nota: libera ? '' : '(consegna già agganciata a un\'altra vendita: solo stato)',
  });
  if (libera) occupate.add(libera.id);
}

console.log(`Da spostare in storico: ${daSpostare.length}`);
for (const x of daSpostare) console.log(`  #${x.ordine ?? '?'} ${x.brand} · ${x.stato} → accettata · consegna #${x.consegna} (${x.statoConsegna}) ${x.nota}`);

if (!APPLICA) {
  console.log('\nANTEPRIMA: niente scritto. Rilanciare con --applica.');
  await prisma.$disconnect();
  process.exit(0);
}

fs.writeFileSync('C:/Users/nicol/AppData/Local/Temp/claude/backup-vendite-ricontrollo-' + Date.now() + '.json',
  JSON.stringify({ aperte, daSpostare }, null, 1));
let scritte = 0;
for (const x of daSpostare) {
  await prisma.sale.update({
    where: { id: x.saleId },
    data: {
      status: 'accettata',
      ...(x.deliveryId ? { deliveryId: x.deliveryId } : {}),
      ...(x.partnerId ? { partnerId: x.partnerId } : {}),
      assignmentReason: `Ricontrollo 03/09: consegna #${x.consegna} già in piattaforma.`,
    },
  });
  scritte++;
}
console.log(`\nSpostate in storico: ${scritte}. Backup salvato.`);
await prisma.$disconnect();
