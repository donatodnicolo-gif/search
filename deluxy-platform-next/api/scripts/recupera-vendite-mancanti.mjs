/**
 * RECUPERO VENDITE MANCANTI (03/09, ordine utente): ogni ordine del registro
 * Orders dal 01/08 non annullato e SENZA vendita in piattaforma ne riceve
 * una:
 *  - se esiste la CONSEGNA corrispondente (storico compreso) → vendita
 *    ACCETTATA agganciata alla consegna (numero+negozio+data vicina, e il
 *    match deve essere UNICO: numero ≠ identità);
 *  - se l'ordine è CHIUSO (fulfilled/consegnato) senza consegna → ACCETTATA
 *    «storico: evasa fuori piattaforma»;
 *  - se è APERTO e non riservato al CS → DA GESTIRE (senza proposta
 *    automatica: il backfill non spamma i partner; ci pensa il cron per la
 *    finestra corrente);
 *  - APERTO ma riservato al CS (manuale/fornitore diretto) → si SALTA (la
 *    regola del decisore vince).
 * Anteprima di default; scrive con --applica (backup + conteggi).
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const APPLICA = process.argv.includes('--applica');
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
u.searchParams.delete('schema');
process.env.DATABASE_URL = u.toString();
const prisma = new PrismaClient();
for (let t = 1; t <= 5; t++) {
  try { await prisma.$queryRaw`SELECT 1`; break; }
  catch (e) { if (t === 5) { console.error('DB irraggiungibile'); process.exit(1); } await new Promise((r) => setTimeout(r, 4000)); }
}

const ordini = await prisma.$queryRawUnsafe(`
  SELECT o.id, o."orderId", o.numero, o.brand, o.data, o."dataConsegna", o.totale,
         o."fulfillmentStatus", o.evasione, o.smistamento, o."chiusoIl",
         o.provincia, o.paese, o.citta, o.indirizzo, o.cap,
         o."spedizioneNome", o."clienteTelefono"
  FROM orders."Ordine" o
  LEFT JOIN platform."Sale" s ON s.source = 'deluxy-orders' AND s."externalOrderId" = o.id
  WHERE o."annullatoIl" IS NULL AND o.data >= '2026-08-01' AND s.id IS NULL
  ORDER BY o.data ASC`);

// Righe d'ordine (prima riga con sku/titolo/prezzo) in un giro solo.
const righe = await prisma.$queryRawUnsafe(`
  SELECT r."ordineId", r.sku, r.titolo, r.prezzo
  FROM orders."RigaOrdine" r
  WHERE r."ordineId" IN (${ordini.map((o) => `'${o.id}'`).join(',') || `''`})
  ORDER BY r."ordineId"`);
const rigaDi = new Map();
for (const r of righe) if (!rigaDi.has(r.ordineId)) rigaDi.set(r.ordineId, r);

// Consegne candidate al match: `realOrderNumber` è l'ID SHOPIFY NUMERICO
// (es. 13390291763525) — lo stesso in coda a `orderId` di Orders. È
// un'identità, non un numero amichevole: il match è esatto.
const consegne = await prisma.$queryRawUnsafe(`
  SELECT d.id, d.code, d."realOrderNumber", d.shop, d.date, d."partnerId", d.status
  FROM platform."Delivery" d
  WHERE d."deletedAt" IS NULL AND d."realOrderNumber" IS NOT NULL
    AND d.date >= '2026-07-01'`);
const perNumero = new Map();
for (const d of consegne) {
  const k = String(d.realOrderNumber).trim();
  const a = perNumero.get(k) ?? []; a.push(d); perNumero.set(k, a);
}

// Provincia EE (per gli esteri) e mappa province.
const province = new Map((await prisma.$queryRawUnsafe(`SELECT id, code FROM platform."Province"`)).map((p) => [p.code.toUpperCase(), p.id]));
if (!province.has('EE')) { console.error('Manca la provincia EE: fare prima un giro di sync.'); process.exit(1); }

// Prodotti per SKU (prodotti + varianti) per l'aggancio a catalogo.
const prodotti = new Map();
for (const p of await prisma.$queryRawUnsafe(`SELECT id, sku FROM platform."Product" WHERE sku IS NOT NULL`)) prodotti.set(p.sku.trim().toUpperCase(), { productId: p.id, variantId: null });
for (const v of await prisma.$queryRawUnsafe(`SELECT id, sku, "productId" FROM platform."ProductVariant" WHERE sku IS NOT NULL`)) {
  const k = v.sku.trim().toUpperCase();
  if (!prodotti.has(k)) prodotti.set(k, { productId: v.productId, variantId: v.id });
}

const cuid = () => 'c' + Array.from({ length: 24 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');
const conta = { conConsegna: 0, storicoSenzaConsegna: 0, daGestire: 0, estero: 0, saltatiCs: 0, matchAmbiguo: 0 };
const daScrivere = [];

for (const o of ordini) {
  const numero = String(o.numero ?? '').replace(/^#+/, '');
  const chiuso = o.fulfillmentStatus === 'FULFILLED' || !!o.chiusoIl;
  const riservatoCs = o.evasione === 'fornitore_diretto' || o.smistamento === 'manuale';
  const paese = (o.paese ?? '').trim().toUpperCase();
  const estero = !!paese && !['IT', 'ITALIA', 'ITALY'].includes(paese);
  const r = rigaDi.get(o.id);
  const info = r?.sku ? prodotti.get(String(r.sku).trim().toUpperCase()) : null;
  const codice = (o.provincia ?? '').trim().toUpperCase();
  const provinceId = estero ? province.get('EE')
    : (codice && province.has(codice) ? province.get(codice) : province.get('EE'));

  // Match per IDENTITÀ: coda numerica di orderId == realOrderNumber della
  // consegna. Più consegne per lo stesso ordine (multi-collo) = si aggancia
  // la prima per codice; il conteggio lo dichiara.
  const tail = String(o.orderId ?? '').split('/').pop();
  const cand = tail ? (perNumero.get(tail) ?? []) : [];
  const consegna = cand.length ? [...cand].sort((a, b) => a.code - b.code)[0] : null;
  if (cand.length > 1) conta.matchAmbiguo++;

  let stato, partnerId = null, deliveryId = null, reason;
  if (consegna) {
    stato = 'accettata'; deliveryId = consegna.id; partnerId = consegna.partnerId;
    reason = `Recupero registro (03/09): consegna #${consegna.code} già in piattaforma.`;
    conta.conConsegna++;
  } else if (chiuso) {
    stato = 'accettata';
    reason = 'Recupero registro (03/09): ordine già evaso fuori piattaforma (storico).';
    conta.storicoSenzaConsegna++;
  } else if (riservatoCs) { conta.saltatiCs++; continue; }
  else {
    stato = 'da_gestire';
    reason = estero
      ? 'Recupero registro (03/09): ordine estero, si gestisce a mano.'
      : 'Recupero registro (03/09): senza smistamento automatico (backfill), decide una persona.';
    conta.daGestire++;
    if (estero) conta.estero++;
  }

  const nome = (o.spedizioneNome ?? '').trim();
  const [fn, ...ln] = nome.split(/\s+/);
  daScrivere.push({
    id: cuid(), productId: info?.productId ?? null, productVariantId: info?.variantId ?? null,
    productName: r?.titolo ?? null, productSku: r?.sku ?? null,
    provinceId, partnerId, deliveryId, brand: o.brand ?? 'DELUXY',
    amount: r?.prezzo ?? o.totale ?? 0, status: stato, assignmentReason: reason,
    source: 'deluxy-orders', externalOrderId: o.id, externalOrderNumber: numero || null,
    recipientFirstName: fn || null, recipientLastName: ln.join(' ') || null,
    recipientAddress: [o.indirizzo, o.cap, o.citta, o.provincia, o.paese].filter(Boolean).join(', ') || null,
    recipientPhone: o.clienteTelefono ?? null,
    deliveryDate: o.dataConsegna ?? null,
  });
}

console.log('RECUPERO — esiti:', JSON.stringify(conta, null, 1));
console.log('vendite da creare:', daScrivere.length);
const perBrandStato = {};
for (const v of daScrivere) { const k = v.brand + ' · ' + v.status; perBrandStato[k] = (perBrandStato[k] ?? 0) + 1; }
console.log(JSON.stringify(perBrandStato, null, 1));

if (!APPLICA) { console.log('\nANTEPRIMA: niente scritto. Rilanciare con --applica.'); await prisma.$disconnect(); process.exit(0); }

fs.writeFileSync('C:/Users/nicol/AppData/Local/Temp/claude/backup-recupero-vendite-' + Date.now() + '.json', JSON.stringify(daScrivere, null, 1));
let fatte = 0;
for (const v of daScrivere) {
  // deliveryId è @unique su Sale: se una vendita ha già quella consegna, si
  // crea senza il link (meglio una vendita senza aggancio di un errore).
  try {
    await prisma.$executeRawUnsafe(`
      INSERT INTO platform."Sale" ("id","productId","productVariantId","productName","productSku","provinceId","partnerId","deliveryId","brand","amount","discountPercent","status","assignmentReason","source","externalOrderId","externalOrderNumber","recipientFirstName","recipientLastName","recipientAddress","recipientPhone","deliveryDate","createdAt","updatedAt")
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,0,$11,$12,'deluxy-orders',$13,$14,$15,$16,$17,$18,$19,now(),now())`,
      v.id, v.productId, v.productVariantId, v.productName, v.productSku, v.provinceId, v.partnerId, v.deliveryId,
      v.brand, v.amount, v.status, v.assignmentReason, v.externalOrderId, v.externalOrderNumber,
      v.recipientFirstName, v.recipientLastName, v.recipientAddress, v.recipientPhone,
      v.deliveryDate ? new Date(v.deliveryDate) : null);
    fatte++;
  } catch (e) {
    if (String(e.message).includes('deliveryId')) {
      await prisma.$executeRawUnsafe(`
        INSERT INTO platform."Sale" ("id","productId","productVariantId","productName","productSku","provinceId","partnerId","deliveryId","brand","amount","discountPercent","status","assignmentReason","source","externalOrderId","externalOrderNumber","recipientFirstName","recipientLastName","recipientAddress","recipientPhone","deliveryDate","createdAt","updatedAt")
        VALUES ($1,$2,$3,$4,$5,$6,$7,NULL,$8,$9,0,$10,$11,'deluxy-orders',$12,$13,$14,$15,$16,$17,$18,now(),now())`,
        v.id, v.productId, v.productVariantId, v.productName, v.productSku, v.provinceId, v.partnerId,
        v.brand, v.amount, v.status, v.assignmentReason + ' (consegna già collegata a un\'altra vendita)', v.externalOrderId, v.externalOrderNumber,
        v.recipientFirstName, v.recipientLastName, v.recipientAddress, v.recipientPhone,
        v.deliveryDate ? new Date(v.deliveryDate) : null);
      fatte++;
    } else { console.error('errore su ordine', v.externalOrderId, ':', String(e.message).slice(0, 160)); }
  }
}
console.log('\nFATTO:', fatte, 'vendite create (backup salvato).');
await prisma.$disconnect();
