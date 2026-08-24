// Porta in piattaforma i prodotti che vivono in Deluxy Merchandising (il PLM)
// e che qui non ci sono.
//
// ⚠️ NON e' una copia del catalogo. Su 4.610 prodotti di Merchandising, 3.526
// (il 76%) sono GIA' in piattaforma — 1.924 per SKU, 80 per SKU di variante,
// 1.522 per nome. Importarli tutti avrebbe creato 3.526 doppioni, cioe'
// esattamente la «tabella-copia» che l'architettura dei dati vieta.
// Se ne importano 1.084, e nemmeno tutti allo stesso modo:
//
//   - `in_vendita`  (283) -> entrano nel catalogo, attivi;
//   - `archiviato`  (784) -> entrano GIA' ARCHIVIATI: servono a riconoscere un
//                            ordine vecchio che li nomina, non a riempire la
//                            lista di roba morta;
//   - concept / prototipo / approvato (17) -> NON entrano. Sono prodotti in
//                            progettazione: la piattaforma non e' un PLM, e un
//                            prodotto che non si puo' ancora vendere qui non ha
//                            niente da fare.
//
// ℹ️ Misurato prima di scrivere: questi prodotti NON sbloccano lo smistamento.
// Dei 4 SKU non riconosciuti negli ultimi 200 ordini, ZERO stanno in
// Merchandising. L'import serve al catalogo, non agli ordini: dirlo evita di
// aspettarsi un effetto che non arrivera'.
//
// La provenienza resta scritta in `createdFrom = 'merchandising'`, cosi' si sa
// da dove vengono e l'import si puo' rifare senza duplicare.
//
// Di default non scrive. Con --scrivi applica.
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const SCRIVI = process.argv.includes('--scrivi');
const FONTE = 'merchandising';

const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
const url = (s) => `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=${s}&connection_limit=1`;

const merch = new PrismaClient({ datasources: { db: { url: url('merchandising') } } });
const prodottiM = await merch.$queryRawUnsafe(
  `select codice, nome, fase, categoria, descrizione, "costoProduzione", "prezzoVendita", immagine
     from "merchandising"."Prodotto" where "unitoAId" is null`);
await merch.$disconnect();

const db = new PrismaClient({ datasources: { db: { url: url('platform') } } });
const esistentiSku = new Set((await db.$queryRawUnsafe(
  `select sku from "platform"."Product" where sku is not null`)).map((x) => x.sku.trim().toUpperCase()));
const variantiSku = new Set((await db.$queryRawUnsafe(
  `select sku from "platform"."ProductVariant" where sku is not null`)).map((x) => x.sku.trim().toUpperCase()));
const esistentiNomi = new Set((await db.$queryRawUnsafe(
  `select name from "platform"."Product"`)).map((x) => x.name.trim().toLowerCase()));

// Le categorie: si abbinano per nome, senza inventarne di nuove. Chi non trova
// casa resta senza categoria — meglio vuoto che in una categoria sbagliata.
const categorie = new Map((await db.category.findMany({ select: { id: true, name: true } }))
  .map((c) => [c.name.trim().toLowerCase(), c.id]));

const VENDIBILI = new Set(['in_vendita']);
const ARCHIVIABILI = new Set(['archiviato']);

const daCreare = [], scartati = { gia: 0, inSviluppo: 0 };
for (const p of prodottiM) {
  const sku = String(p.codice).trim().toUpperCase();
  if (esistentiSku.has(sku) || variantiSku.has(sku) || esistentiNomi.has(String(p.nome).trim().toLowerCase())) {
    scartati.gia++; continue;
  }
  const vendibile = VENDIBILI.has(p.fase);
  if (!vendibile && !ARCHIVIABILI.has(p.fase)) { scartati.inSviluppo++; continue; }
  daCreare.push({
    sku: String(p.codice).trim(),
    name: String(p.nome).trim(),
    description: p.descrizione ?? null,
    // In Merchandising `costoProduzione` e' quanto ci costa, `prezzoVendita`
    // quanto lo paga il cliente: qui sono `price` e `publicPrice`.
    price: Number(p.costoProduzione) || 0,
    publicPrice: Number(p.prezzoVendita) || null,
    imageUrl: p.immagine ?? null,
    categoryId: categorie.get(String(p.categoria ?? '').trim().toLowerCase()) ?? null,
    type: 'NON_UNICO',
    active: vendibile,
    approved: false,
    archived: !vendibile,
    archivedAt: vendibile ? null : new Date(),
    archivedReason: vendibile ? null : 'archiviato-in-merchandising',
    createdFrom: FONTE,
  });
}

const conCategoria = daCreare.filter((x) => x.categoryId).length;
console.log(`prodotti in Merchandising (esclusi gli uniti): ${prodottiM.length}`);
console.log(`   gia' in piattaforma (SKU, variante o nome): ${scartati.gia}`);
console.log(`   in progettazione, non importati:            ${scartati.inSviluppo}`);
console.log(`   🔵 da creare:                               ${daCreare.length}`);
console.log(`        attivi: ${daCreare.filter((x) => x.active).length} · archiviati: ${daCreare.filter((x) => !x.active).length}`);
console.log(`        con una categoria riconosciuta: ${conCategoria} · senza: ${daCreare.length - conCategoria}`);
console.log('\nprimi 8:');
for (const x of daCreare.slice(0, 8))
  console.log(`   ${x.sku.slice(0, 22).padEnd(24)}${x.name.slice(0, 32).padEnd(34)}${x.active ? 'attivo    ' : 'archiviato'} €${x.price} / €${x.publicPrice ?? '—'}`);

if (!SCRIVI) { console.log('\n(prova a vuoto: rilanciare con --scrivi)'); await db.$disconnect(); process.exit(0); }

let fatti = 0;
for (const x of daCreare) {
  await db.product.create({ data: x });
  fatti++;
  if (fatti % 200 === 0) console.log(`   … ${fatti}/${daCreare.length}`);
}
console.log(`\n✅ creati ${fatti}`);
console.log('   catalogo ora:', await db.product.count(), '· in lista:', await db.product.count({ where: { archived: false } }));
console.log('   arrivati da Merchandising:', await db.product.count({ where: { createdFrom: FONTE } }));
await db.$disconnect();
