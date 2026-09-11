/**
 * ⭐⭐ 11/09/2026 (regola utente) — ARCHIVIA I PRODOTTI FERMI.
 *
 * «Per quanto riguarda tutti i prodotti in prodotti devi verificare uno a uno quelli che non sono mai
 * entrati in nessuna consegna nel 2026 e non sono prodotti unici e metterli come archiviati.»
 *
 * ⚠️ «Verificare uno a uno» va preso alla lettera, perché il legame prodotto→consegna è di DUE tipi:
 *  · per **id** (`DeliveryProduct.productId`), il legame buono;
 *  · per **nome**, sulle righe importate dal sistema precedente che l'id non ce l'hanno.
 * Guardare solo l'id archivierebbe prodotti che nel 2026 hanno lavorato eccome, e un prodotto
 * archiviato per sbaglio sparisce dal modulo consegna di chi lo usa ogni giorno.
 * Si guarda anche lo SKU della variante, per lo stesso motivo.
 *
 * NON si toccano, e ognuno per una ragione sua:
 *  · i **prodotti unici** — lo dice la regola;
 *  · i **prodotti di servizio** — non entrano MAI in una consegna per come sono fatti (biglietti,
 *    buste): archiviarli col metro delle consegne è misurarli con un righello che non li riguarda;
 *  · i **nati da poco** (ultimi 30 giorni) — non hanno ancora avuto il tempo di lavorare, e archiviare
 *    un prodotto caricato ieri è il modo più veloce di far dire «l'app cancella le cose»;
 *  · i **già archiviati** e i cancellati.
 *
 * Uso:  node scripts/archivia-prodotti-fermi.mjs [--applica] [--giorni-di-grazia 30]
 */
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
require('dotenv').config();

const APPLICA = process.argv.includes('--applica');
const iGrazia = process.argv.indexOf('--giorni-di-grazia');
const GRAZIA = iGrazia > 0 ? Number(process.argv[iGrazia + 1]) : 30;

const url = new URL(process.env.DATABASE_URL.replace('schema=tasks', 'schema=platform'));
url.searchParams.set('connection_limit', '1');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({ datasources: { db: { url: url.toString() } } });

const norm = (s) => (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

async function main() {
  const inizio2026 = new Date('2026-01-01T00:00:00.000Z');

  /** Tutto ciò che nel 2026 è entrato in una consegna: id, nomi, sku. */
  const righe2026 = await prisma.$queryRawUnsafe(`
    SELECT DISTINCT dp."productId", COALESCE(dp."productName", '') AS nome, COALESCE(dp."productSku", '') AS sku
    FROM platform."DeliveryProduct" dp
    JOIN platform."Delivery" d ON d."id" = dp."deliveryId"
    WHERE dp."deletedAt" IS NULL AND d."deletedAt" IS NULL AND d."date" >= '2026-01-01'`);
  const idUsati = new Set(righe2026.map((r) => r.productId).filter(Boolean));
  const nomiUsati = new Set(righe2026.map((r) => norm(r.nome)).filter(Boolean));
  const skuUsati = new Set(righe2026.map((r) => r.sku.trim().toUpperCase()).filter(Boolean));
  console.log(`Righe di consegna del 2026: ${righe2026.length} combinazioni distinte`);
  console.log(`  prodotti riconosciuti per id: ${idUsati.size} · nomi diversi: ${nomiUsati.size} · sku: ${skuUsati.size}`);
  console.log(`  ⚠️ righe SENZA productId: ${righe2026.filter((r) => !r.productId).length} — è per queste che si guarda anche il nome`);

  const prodotti = await prisma.product.findMany({
    where: { deletedAt: null, archived: false },
    select: {
      id: true, name: true, sku: true, type: true, servizio: true, createdAt: true, active: true,
      partner: { select: { insegna: true } },
      variants: { select: { sku: true, name: true } },
    },
  });
  console.log(`\nProdotti vivi e non archiviati: ${prodotti.length}`);

  const limiteGrazia = new Date(Date.now() - GRAZIA * 86_400_000);
  const daArchiviare = [], tenuti = { unici: 0, servizio: 0, recenti: 0, usati: 0 };

  for (const p of prodotti) {
    if (p.type === 'UNICO') { tenuti.unici++; continue; }
    if (p.servizio) { tenuti.servizio++; continue; }
    if (p.createdAt > limiteGrazia) { tenuti.recenti++; continue; }
    const usato =
      idUsati.has(p.id) ||
      nomiUsati.has(norm(p.name)) ||
      (p.sku && skuUsati.has(p.sku.trim().toUpperCase())) ||
      p.variants.some((v) => (v.sku && skuUsati.has(v.sku.trim().toUpperCase())) || nomiUsati.has(norm(`${p.name} ${v.name}`)));
    if (usato) { tenuti.usati++; continue; }
    daArchiviare.push({ id: p.id, nome: p.name, sku: p.sku ?? '', tipo: p.type, partner: p.partner?.insegna ?? '—', creato: p.createdAt.toISOString().slice(0, 10) });
  }

  console.log('\nTENUTI:');
  console.log(`  prodotti unici          ${tenuti.unici}`);
  console.log(`  materiale di servizio   ${tenuti.servizio}`);
  console.log(`  creati da meno di ${GRAZIA} gg  ${tenuti.recenti}`);
  console.log(`  usati nel 2026          ${tenuti.usati}`);
  console.log(`\nDA ARCHIVIARE: ${daArchiviare.length}`);
  for (const p of daArchiviare.slice(0, 25)) console.log(`  ${p.nome.slice(0, 44).padEnd(46)} ${p.tipo.padEnd(10)} ${String(p.sku).padEnd(14)} ${p.partner.slice(0, 22)} (creato ${p.creato})`);
  if (daArchiviare.length > 25) console.log(`  … e altri ${daArchiviare.length - 25}`);

  if (!APPLICA) { console.log('\nANTEPRIMA — nulla è stato scritto. Rilanciare con --applica.'); return; }

  const salvataggio = `scripts/prodotti-archiviati-${Date.now()}.json`;
  writeFileSync(salvataggio, JSON.stringify(daArchiviare, null, 1));
  console.log(`\nElenco salvato in ${salvataggio} (per ripristinarli basta rimettere archived=false su questi id)`);

  const adesso = new Date();
  let fatti = 0;
  for (let i = 0; i < daArchiviare.length; i += 200) {
    const blocco = daArchiviare.slice(i, i + 200);
    await prisma.product.updateMany({
      where: { id: { in: blocco.map((p) => p.id) } },
      data: { archived: true, archivedAt: adesso, archivedReason: 'fermo: nessuna consegna nel 2026' },
    });
    fatti += blocco.length;
    console.log(`  archiviati ${fatti}/${daArchiviare.length}`);
  }
}

main().catch((e) => { console.error('ERRORE', e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
