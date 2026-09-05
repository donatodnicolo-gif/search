/**
 * PREZZO PARTNER DAL LISTINO DELLA VARIANTE, sulle vendite di prodotti UNICI
 * (05/09/2026, regola utente: «non devi togliere la % per il prezzo partner,
 * ma prendere il prezzo partner per variante già presente per quel prodotto»;
 * poi «applica il prezzo giusto»).
 *
 * Per ogni vendita UNICO aperta o accettata:
 *   PUBBLICO = la RIGA dell'ordine in Orders (prezzo × quantità), cioè quanto
 *              ha pagato il cliente. Senza Orders, `publicPrice` di catalogo.
 *   PARTNER  = `ProductVariant.price` (o `Product.price`) × la stessa quantità.
 *   QUOTA    = (1 − partner / pubblico) × 100.
 *
 * ⚠️ SI CORREGGE SOLO DOVE IL CATALOGO HA DUE PREZZI DISTINTI (`price` ≠
 * `publicPrice`): è la sola prova che `price` sia il prezzo del PARTNER. Dove
 * il catalogo ha un prezzo solo — o i due coincidono — quel numero potrebbe
 * essere il pubblico (Charlotte monoporzione: 9,50 a catalogo, 9,50 pagati
 * dal cliente) e correggere significherebbe regalare al partner tutto
 * l'incasso. Quelle vendite si ELENCANO come «da decidere» e non si toccano.
 * ⚠️ Se partner ≥ pubblico si segnala (sottocosto) e NON si scrive.
 *
 * Uso:  node scripts/allinea-prezzo-partner-unici.mjs            (prova)
 *       node scripts/allinea-prezzo-partner-unici.mjs --applica  (scrive)
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
const APPLICA = process.argv.includes('--applica');
const r2 = (n) => Math.round(n * 100) / 100;
const eur = (n) => (n == null ? '—' : n.toFixed(2).replace('.', ',') + ' €');
const w = (t, n) => String(t ?? '—').padEnd(n).slice(0, n);

const cfg = await prisma.appSetting.findMany({ where: { key: { in: ['ordersUrl', 'ordersApiKey'] } } });
const map = Object.fromEntries(cfg.map((x) => [x.key, x.value]));
const ordersUrl = (map.ordersUrl || '').replace(/\/+$/, '');
async function ordine(id) {
  if (!id || !ordersUrl || !map.ordersApiKey) return null;
  try {
    const res = await fetch(`${ordersUrl}/api/v1/ordini/${encodeURIComponent(id)}?annullati=inclusi`, { headers: { 'x-api-key': map.ordersApiKey } });
    return res.ok ? await res.json() : null;
  } catch { return null; }
}

const vendite = await prisma.sale.findMany({
  // ⭐ Regola utente 05/09: «applica a tutto il 2026 il controllo» — ogni stato, dal 1° gennaio.
  where: { product: { type: 'UNICO' }, createdAt: { gte: new Date('2026-01-01') } },
  select: { id: true, externalOrderNumber: true, externalOrderId: true, status: true, amount: true, discountPercent: true,
    productVariant: { select: { price: true, publicPrice: true, name: true, sku: true } },
    product: { select: { name: true, price: true, publicPrice: true, sku: true } } },
  orderBy: { externalOrderNumber: 'asc' },
});

const righe = [];
for (const v of vendite) {
  const listinoUnit = v.productVariant?.price ?? v.product?.price ?? null;
  const pubblicoCatalogo = v.productVariant?.publicPrice ?? v.product?.publicPrice ?? null;
  const dueprezzi = listinoUnit != null && pubblicoCatalogo != null && Math.abs(listinoUnit - pubblicoCatalogo) >= 0.005;
  const partnerOggi = r2(v.amount * (1 - (v.discountPercent ?? 0) / 100));
  let qta = 1, pubblico = null, fonte = '—';
  const o = await ordine(v.externalOrderId);
  if (o) {
    const skuVar = (v.productVariant?.sku ?? '').toUpperCase();
    const skuProd = (v.product?.sku ?? '').toUpperCase();
    const rig = (o.righe ?? []).find((x) => skuVar && String(x.sku ?? '').toUpperCase() === skuVar)
      ?? (o.righe ?? []).find((x) => skuProd && String(x.sku ?? '').toUpperCase() === skuProd)
      ?? (o.righe ?? []).find((x) => x.prezzo != null);
    if (rig?.prezzo != null) { qta = rig.quantita ?? 1; pubblico = r2(rig.prezzo * qta); fonte = qta > 1 ? `Orders ×${qta}` : 'Orders'; }
  }
  if (pubblico == null && pubblicoCatalogo != null) { pubblico = pubblicoCatalogo; fonte = 'catalogo'; }
  const partnerNuovo = listinoUnit == null ? null : r2(listinoUnit * qta);
  let esito, quota = null;
  if (listinoUnit == null) esito = 'SALTATA: senza listino';
  else if (!dueprezzi) esito = `DA DECIDERE: catalogo con un prezzo solo (${eur(listinoUnit)})`;
  else if (pubblico == null) esito = 'DA DECIDERE: pubblico ignoto';
  else if (partnerNuovo >= pubblico) esito = `⚠️ SOTTOCOSTO: listino ${eur(partnerNuovo)} ≥ pubblico ${eur(pubblico)} — non scritta`;
  else if (Math.abs(partnerOggi - partnerNuovo) < 0.005 && Math.abs(v.amount - pubblico) < 0.005) esito = 'già giusta';
  else { quota = r2((1 - partnerNuovo / pubblico) * 100); esito = 'CORRETTA'; }
  righe.push({ v, listinoUnit, pubblicoCatalogo, partnerOggi, partnerNuovo, pubblico, fonte, qta, esito, quota });
}

console.log('══════ VENDITE UNICO — prezzo partner dal listino della variante ══════');
console.log(w('ordine', 7), w('prodotto / variante', 38), w('stato', 10), w('catalogo p/pub', 15), w('cliente', 16), w('partner OGGI', 12), w('partner NUOVO', 13), w('quota', 7), 'esito');
for (const r of righe) {
  const nome = `${r.v.product?.name ?? '—'}${r.v.productVariant?.name ? ' «' + r.v.productVariant.name + '»' : ''}`;
  console.log(w(r.v.externalOrderNumber, 7), w(nome, 38), w(r.v.status, 10),
    w(`${eur(r.listinoUnit)}/${eur(r.pubblicoCatalogo)}`, 15), w(`${eur(r.pubblico)} ${r.fonte}`, 16),
    w(eur(r.partnerOggi), 12), w(eur(r.partnerNuovo), 13), w(r.quota == null ? '—' : r.quota + '%', 7), r.esito);
}
const daCorreggere = righe.filter((r) => r.esito === 'CORRETTA');
console.log(`\n${vendite.length} vendite · CORRETTE ${daCorreggere.length} · già giuste ${righe.filter((r) => r.esito === 'già giusta').length} · da decidere ${righe.filter((r) => r.esito.startsWith('DA DECIDERE')).length} · sottocosto ${righe.filter((r) => r.esito.startsWith('⚠️')).length}`);

if (APPLICA) {
  for (const r of daCorreggere) {
    await prisma.$transaction([
      prisma.sale.update({ where: { id: r.v.id }, data: { amount: r.pubblico, discountPercent: r.quota } }),
      prisma.saleLog.create({ data: { saleId: r.v.id, type: 'modifica',
        message: `Prezzo partner dal listino della variante (regola utente 05/09): cliente ${eur(r.pubblico)} (${r.fonte}), partner ${eur(r.partnerNuovo)} (listino ${eur(r.listinoUnit)}${r.qta > 1 ? ' × ' + r.qta : ''}), quota ${r.quota}% — prima cliente ${eur(r.v.amount)}, quota ${r.v.discountPercent}%, partner ${eur(r.partnerOggi)}` } }),
    ]);
  }
  console.log(`✓ scritte ${daCorreggere.length} vendite`);
} else console.log('(prova: nessuna scrittura. Rilancia con --applica)');
await prisma.$disconnect();
