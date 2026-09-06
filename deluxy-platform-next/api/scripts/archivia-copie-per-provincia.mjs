/**
 * ARCHIVIA LE COPIE PER PROVINCIA (06/09/2026 sera, regola utente): «archivia tutti i prodotti con
 * varianti che hanno la provincia alla fine dello SKU; assicurati però che questo non impatti sui
 * valori delle consegne».
 *
 * Perché si può: con la nuova architettura il prezzo al partner NON sta più in una copia del
 * prodotto per provincia — lo calcola il Customer Service con la percentuale della provincia
 * (regola del territorio) o la lista di prodotto. Il prodotto torna uno solo: lo SKU della variante.
 *
 * COME RICONOSCO UNA COPIA (criterio stretto, niente indovinelli):
 *  · lo SKU del prodotto finisce con una sigla di provincia esistente, E
 *  · esiste il PRODOTTO MASTER con lo stesso SKU senza quella sigla.
 * Senza il master non si tocca niente: uno SKU che finisce per «CO» può essere un codice e basta.
 *
 * PERCHÉ NON CAMBIA I VALORI DELLE CONSEGNE:
 *  · si ARCHIVIA (`archived`), non si cancella: id, nome e prezzo restano leggibili;
 *  · le righe di consegna portano il prezzo scritto (`DeliveryProduct.price`), che non si tocca;
 *  · dove la riga NON ha un prezzo, la stima legge comunque il listino del prodotto archiviato
 *    (`valore-prodotti.ts` non filtra su `archived`): il numero resta lo stesso.
 * Lo script MISURA e stampa: quante righe di consegna toccano queste copie, quante senza prezzo, e
 * la somma dei valori PRIMA e DOPO (deve essere identica).
 *
 * PROVA di default; `--scrivi` per archiviare. `--ripristina` disarchivia (torna indietro).
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8').split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
u.searchParams.set('schema', 'platform'); process.env.DATABASE_URL = u.toString();
const SCRIVI = process.argv.includes('--scrivi');
const RIPRISTINA = process.argv.includes('--ripristina');
const p = new PrismaClient();

const sigle = (await p.province.findMany({ select: { code: true } })).map((x) => x.code.toUpperCase());
const prodotti = await p.product.findMany({
  where: { deletedAt: null, sku: { not: null } },
  select: { id: true, name: true, sku: true, price: true, archived: true, variants: { select: { id: true, sku: true } } },
});
const perSku = new Map(prodotti.filter((x) => x.sku).map((x) => [x.sku.toUpperCase(), x]));
// ⚠️ 06/09 sera (segnalazione utente su NZDWTK-3RM): il master può essere una VARIANTE, non un
// prodotto: «NZDWTK-3RM» è la copia romana della variante «NZDWTK-3». Senza guardare anche le
// varianti quelle copie restavano a catalogo.
const varianti = await p.productVariant.findMany({ select: { sku: true } });
const skuVarianti = new Set(varianti.filter((v) => v.sku).map((v) => v.sku.toUpperCase()));

const copie = [];
for (const pr of prodotti) {
  const sku = pr.sku.toUpperCase();
  const sigla = sigle.find((c) => sku.endsWith(c) && sku.length > c.length + 2);
  if (!sigla) continue;
  const senzaSigla = sku.slice(0, -sigla.length);
  const master = perSku.get(senzaSigla);
  const masterVariante = skuVarianti.has(senzaSigla);
  if ((!master && !masterVariante) || master?.id === pr.id) continue; // senza master non è una copia: non si tocca
  // «prodotti con varianti che hanno la provincia alla fine dello sku»: almeno una variante col suffisso
  const suePerSigla = pr.variants.filter((v) => (v.sku ?? '').toUpperCase().endsWith(sigla));
  copie.push({ ...pr, sigla, masterId: master?.id ?? null, masterSku: master?.sku ?? senzaSigla + ' (variante)', varianti: suePerSigla.length, variantIds: pr.variants.map((v) => v.id) });
}
// 06/09 sera: si archiviano TUTTE le copie riconosciute, con o senza varianti proprie (la copia di
// una variante non ha varianti sue). Il criterio resta stretto: serve il master.
const conVarianti = copie;
const senzaVarianti = copie.filter((c) => c.varianti === 0);

// ── L'IMPATTO SULLE CONSEGNE, misurato prima di toccare qualcosa ──────────────
const ids = conVarianti.map((c) => c.id);
const variantIds = conVarianti.flatMap((c) => c.variantIds);
const righeConsegna = ids.length
  ? await p.deliveryProduct.findMany({ where: { OR: [{ productId: { in: ids } }, { productVariantId: { in: variantIds } }] }, select: { price: true, quantity: true, productId: true } })
  : [];
const senzaPrezzo = righeConsegna.filter((r) => r.price === null || r.price === 0);
const sommaPrima = righeConsegna.reduce((n, r) => n + (r.price ?? 0) * (r.quantity ?? 1), 0);
// il valore che la stima leggerebbe dal listino per le righe senza prezzo (resta identico: si archivia, non si cancella)
const prezzoDi = new Map(prodotti.map((x) => [x.id, x.price ?? 0]));
const stimaSenzaPrezzo = senzaPrezzo.reduce((n, r) => n + (prezzoDi.get(r.productId ?? '') ?? 0) * (r.quantity ?? 1), 0);

console.log('COPIE PER PROVINCIA');
console.table([
  { voce: 'prodotti a catalogo', n: prodotti.length },
  { voce: 'copie riconosciute (SKU = master + sigla, master esistente)', n: copie.length },
  { voce: '· con varianti che portano la sigla → DA ARCHIVIARE', n: conVarianti.length },
  { voce: '· senza varianti con la sigla → lasciate stare', n: senzaVarianti.length },
  { voce: 'già archiviate', n: conVarianti.filter((c) => c.archived).length },
]);
console.log('IMPATTO SULLE CONSEGNE');
console.table([
  { voce: 'righe di consegna che puntano a queste copie', n: righeConsegna.length },
  { voce: '· con il prezzo scritto (non cambia nulla)', n: righeConsegna.length - senzaPrezzo.length },
  { voce: '· senza prezzo: la stima legge il listino, che resta leggibile', n: senzaPrezzo.length },
  { voce: 'somma dei prezzi scritti (€)', n: Math.round(sommaPrima * 100) / 100 },
  { voce: 'valore stimato dal listino per le righe senza prezzo (€)', n: Math.round(stimaSenzaPrezzo * 100) / 100 },
]);
const perSigla = {};
for (const c of conVarianti) perSigla[c.sigla] = (perSigla[c.sigla] ?? 0) + 1;
console.log('per provincia:', Object.entries(perSigla).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(' · '));
console.log('esempi:', conVarianti.slice(0, 5).map((c) => `${c.name} [${c.sku}] → master ${c.masterSku}`).join(' · '));

if (RIPRISTINA) {
  const r = await p.product.updateMany({ where: { id: { in: ids } }, data: { archived: false, archivedAt: null } });
  console.log('RIPRISTINATE:', r.count);
} else if (SCRIVI) {
  let n = 0;
  for (const c of conVarianti) {
    if (c.archived) continue;
    await p.product.update({ where: { id: c.id }, data: { archived: true, archivedAt: new Date() } });
    n++;
  }
  // ricontrollo: i valori delle consegne non si muovono (le righe non sono state toccate)
  const dopo = ids.length ? await p.deliveryProduct.findMany({ where: { OR: [{ productId: { in: ids } }, { productVariantId: { in: variantIds } }] }, select: { price: true, quantity: true } }) : [];
  const sommaDopo = dopo.reduce((n2, r) => n2 + (r.price ?? 0) * (r.quantity ?? 1), 0);
  console.log(`ARCHIVIATE: ${n} · righe di consegna dopo: ${dopo.length} · somma dopo: ${Math.round(sommaDopo * 100) / 100} €`);
  console.log(Math.abs(sommaDopo - sommaPrima) < 0.01 && dopo.length === righeConsegna.length ? '✓ i valori delle consegne NON sono cambiati' : '⚠️ CONTROLLARE: qualcosa è cambiato');
} else {
  console.log('PROVA: nulla scritto. `--scrivi` per archiviare, `--ripristina` per tornare indietro.');
}
await p.$disconnect();
