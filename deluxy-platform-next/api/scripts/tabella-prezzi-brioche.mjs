/**
 * TABELLE PREZZI BRIOCHE (richiesta utente 04/09/2026) — SOLA LETTURA.
 * 1) le brioche visibili a casati14 (perimetro partner) coi prezzi;
 * 2) gli stessi prodotti visti da malia;
 * 3) i prezzi scritti nelle consegne di casati14 di un giorno (default 30/07/2026).
 * Uso: node scripts/tabella-prezzi-brioche.mjs [--giorno 2026-07-30]
 * Se la ricerca per nome non basta: CASATI_PARTNER_ID=... MALIA_PARTNER_ID=...
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
for (let t = 1; t <= 5; t++) {
  try { await prisma.$queryRaw`SELECT 1`; break; }
  catch (e) { if (t === 5) { console.error('DB irraggiungibile', e.message); process.exit(1); } await new Promise((r) => setTimeout(r, 4000)); }
}
const gi = process.argv.indexOf('--giorno');
const GIORNO = gi > 0 ? process.argv[gi + 1] : '2026-07-30';
const eur = (n) => (n == null ? '—' : Number(n).toFixed(2).replace('.', ',') + ' €');
const ci = (s) => ({ contains: s, mode: 'insensitive' });

async function cerca(chiave) {
  const users = await prisma.user.findMany({
    where: { OR: [{ email: ci(chiave) }, { firstName: ci(chiave) }, { lastName: ci(chiave) }] },
    select: { id: true, email: true, role: true, partnerId: true, valetId: true, status: true },
  });
  const partners = await prisma.partner.findMany({
    where: { OR: [{ email: ci(chiave) }, { insegna: ci(chiave) }, { businessName: ci(chiave) }] },
    select: { id: true, insegna: true, email: true },
  });
  return { users, partners };
}
function perimetro(partnerId) {
  return { OR: [
    { partnerId: null, name: { in: ['Servizio Consegna', 'Servizio Consegne'] } },
    { partnerId },
    { partnerLinks: { some: { partnerId } } },
  ] };
}
async function brioche(partnerId) {
  return prisma.product.findMany({
    where: { AND: [perimetro(partnerId), { name: ci('brioche') }] },
    select: { id: true, sku: true, name: true, price: true, publicPrice: true, type: true, partnerId: true, archived: true, active: true, deletedAt: true,
      partner: { select: { insegna: true } }, variants: { select: { name: true, price: true, publicPrice: true } } },
    orderBy: { name: 'asc' },
  });
}
function tabellaProdotti(titolo, rows) {
  console.log(`\n### ${titolo} (${rows.length})\n`);
  console.log('| SKU | Prodotto | Proprietario | Tipo | Prezzo partner | Prezzo pubblico | Varianti (partner / pubblico) | Stato |');
  console.log('|---|---|---|---|---:|---:|---|---|');
  for (const p of rows) {
    const stato = [p.archived ? 'archiviato' : null, !p.active ? 'disattivo' : null, p.deletedAt ? 'cancellato' : null].filter(Boolean).join(', ') || 'attivo';
    const v = p.variants.map((x) => `${x.name}: ${eur(x.price)} / ${eur(x.publicPrice)}`).join('; ') || '—';
    console.log(`| ${p.sku ?? '—'} | ${p.name} | ${p.partner?.insegna ?? 'Deluxy (senza partner)'} | ${p.type} | ${eur(p.price)} | ${eur(p.publicPrice)} | ${v} | ${stato} |`);
  }
}

const trovati = {};
for (const chiave of ['casati', 'malia']) {
  const r = await cerca(chiave);
  trovati[chiave] = r;
  console.log(`\n## Ricerca «${chiave}»`);
  for (const x of r.users) console.log(`- utente ${x.email} · ruolo ${x.role} · stato ${x.status} · partnerId ${x.partnerId ?? '—'} · valetId ${x.valetId ?? '—'}`);
  for (const x of r.partners) console.log(`- partner «${x.insegna}» (${x.email}) id ${x.id}`);
}
const idCasati = process.env.CASATI_PARTNER_ID || trovati.casati.users.find((x) => x.role === 'PARTNER' && x.partnerId)?.partnerId || trovati.casati.partners[0]?.id;
const idMalia = process.env.MALIA_PARTNER_ID || trovati.malia.users.find((x) => x.role === 'PARTNER' && x.partnerId)?.partnerId || trovati.malia.partners[0]?.id;
console.log(`\npartner casati14 = ${idCasati ?? 'NON TROVATO'} · partner malia = ${idMalia ?? 'NON TROVATO'}`);

if (idCasati) {
  const pc = await brioche(idCasati);
  tabellaProdotti('Tabella 1 — brioche visibili a casati14', pc);
  const idsCasati = new Set(pc.map((p) => p.id));
  if (idMalia) {
    const pm = await brioche(idMalia);
    const nomi = new Set(pc.map((p) => p.name.trim().toLowerCase()));
    const stessi = pm.filter((p) => idsCasati.has(p.id) || nomi.has(p.name.trim().toLowerCase()));
    tabellaProdotti('Tabella 2 — gli stessi prodotti visti da malia (stesso id o stesso nome)', stessi);
    const soloMalia = pm.filter((p) => !idsCasati.has(p.id) && !nomi.has(p.name.trim().toLowerCase()));
    if (soloMalia.length) tabellaProdotti('(altre brioche che vede solo malia)', soloMalia);
  }
  const da = new Date(`${GIORNO}T00:00:00.000Z`), a = new Date(`${GIORNO}T23:59:59.999Z`);
  const cons = await prisma.delivery.findMany({
    where: { partnerId: idCasati, date: { gte: da, lte: a }, deletedAt: null },
    select: { id: true, code: true, date: true, status: true, price: true,
      products: { where: { deletedAt: null }, select: { productId: true, productName: true, productSku: true, variantName: true, quantity: true, price: true, flexiblePrice: true,
        product: { select: { name: true, sku: true, price: true, publicPrice: true, partnerId: true } },
        productVariant: { select: { name: true, price: true, publicPrice: true } } } } },
    orderBy: { code: 'asc' },
  });
  console.log(`\n### Tabella 3 — consegne di casati14 del ${GIORNO} (${cons.length}) coi prezzi scritti in consegna\n`);
  console.log('| Consegna | Stato | Prodotto in consegna | Variante | Q.tà | Prezzo scritto in consegna | Flessibile | Listino OGGI (partner / pubblico) | Nel perimetro di casati14 |');
  console.log('|---|---|---|---|---:|---:|---|---|---|');
  for (const c of cons) {
    if (!c.products.length) { console.log(`| #${c.code} | ${c.status} | (nessun prodotto) | | | | | | |`); continue; }
    for (const r of c.products) {
      const nome = r.productName ?? r.product?.name ?? '—';
      const isBrioche = /brioche/i.test(nome);
      const listino = r.productVariant ? `${eur(r.productVariant.price)} / ${eur(r.productVariant.publicPrice)} (variante)` : `${eur(r.product?.price)} / ${eur(r.product?.publicPrice)}`;
      const perim = r.productId ? (idsCasati.has(r.productId) ? 'sì' : 'no') : '—';
      console.log(`| #${c.code} | ${c.status} | ${isBrioche ? '**' + nome + '**' : nome} | ${r.variantName ?? r.productVariant?.name ?? '—'} | ${r.quantity} | ${eur(r.price)} | ${r.flexiblePrice ? 'sì' : 'no'} | ${r.product ? listino : '(prodotto non più collegato)'} | ${perim} |`);
    }
  }
}
await prisma.$disconnect();
