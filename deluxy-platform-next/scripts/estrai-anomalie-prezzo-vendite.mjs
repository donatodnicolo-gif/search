// ============================================================
// Estrazione degli ERRORI DI PREZZO sulle vendite
// ------------------------------------------------------------
// Chiesta dall'utente il 25/08/2026: «tutto quello che e' stato inserito, anche
// quello che risulta dall'ordine Shopify».
//
// ⭐ Allineato la sera stessa al modello vero, quello che usa anche la pagina:
//   prezzo pubblico = somma( DeliveryProduct.price x quantita )
//   dato al partner = Delivery.productValue     <- SCRITTO, non dedotto
//   guadagno lordo  = pubblico - dato al partner
//   guadagno netto  = lordo / 1,22
//   quota a listino = Delivery.price + plus/minus  (la fee di contratto)
//
// Tira fuori, per ogni consegna di vendita andata a buon fine che non torna:
//   - TUTTO quello che e' stato inserito a mano sulla consegna (prezzo, plus e
//     minus, consegna prezzo, paga valet, prezzo flessibile, ore);
//   - TUTTE le righe prodotto, col prezzo scritto sulla riga e quello che il
//     catalogo dice oggi (sono due cose diverse, e la differenza e' il punto);
//   - quello che dice l'ORDINE SHOPIFY di provenienza, letto dalle tabelle di
//     vendita del legacy: totale, imponibile, sconti, spedizione, e la somma
//     delle righe d'ordine ricalcolata dal JSON `lineItems`.
//
// ⚠️ NON SCRIVE NIENTE su nessun database. Produce un CSV e un riepilogo.
//
// Uso:
//   node scripts/estrai-anomalie-prezzo-vendite.mjs
//   node scripts/estrai-anomalie-prezzo-vendite.mjs --tutte     (anche le righe che tornano)
//   node scripts/estrai-anomalie-prezzo-vendite.mjs --out=C:/percorso/file.csv
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { leggiCsv } from './leggi-csv.mjs';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

const argomenti = process.argv.slice(2);
const TUTTE = argomenti.includes('--tutte');
const OUT = (argomenti.find((a) => a.startsWith('--out=')) ?? '').slice('--out='.length)
  || path.join(process.cwd(), 'anomalie-prezzo-vendite.csv');

const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
process.env.DATABASE_URL =
  `postgresql://${u.username}:${u.password}@${u.hostname}:6543/postgres?schema=platform&pgbouncer=true&connection_limit=1`;

const db = new PrismaClient();
const TABELLE = path.join(process.cwd(), 'legacy', 'tabelle');
/**
 * Le sei tabelle di vendita del legacy.
 *
 * ⚠️ Nell'export phpMyAdmin hanno perso il nome e si chiamano `tabella-N`: quale
 * sia quale non e' scritto da nessuna parte, quindi NON si indovina — si
 * indicizzano tutte per id e si guarda dove l'id combacia davvero. Il campo
 * `Delivery.shop` (ShopifySale | FlowersSales | CakeSales | BusinessSales) dice
 * da quale negozio viene, ma non quale file lo contiene.
 */
const FILE_VENDITE = ['tabella-72.csv', 'tabella-12.csv', 'tabella-42.csv',
  'tabella-9.csv', 'tabella-26.csv', 'tabella-28.csv'];

/**
 * Numero, e il vuoto resta VUOTO.
 *
 * ⚠️ `Number('')` vale 0, e 0 e' finito: un campo vuoto diventava «ordine da
 * 0 €» e produceva 2.264 falsi scostamenti, tutti verosimili. Un dato che manca
 * non vale zero — vale niente.
 */
const n = (v) => {
  if (v == null || String(v).trim() === '') return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};
const r2 = (x) => Math.round(x * 100) / 100;

/**
 * Le righe d'ordine dentro il JSON `lineItems` di una vendita Shopify: somma,
 * pezzi e il dettaglio leggibile (che e' la parte che fa capire l'errore —
 * «Penne 1140 €» sulla consegna contro «Bouquet Rose Rosa» da 170 € sull'ordine).
 */
function righeOrdine(json) {
  if (!json) return { totale: null, pezzi: null, dettaglio: '' };
  try {
    const v = JSON.parse(json);
    const righe = Array.isArray(v) ? v : (v.lineItems ?? v.line_items ?? []);
    if (!Array.isArray(righe) || !righe.length) return { totale: null, pezzi: null, dettaglio: '' };
    let totale = 0, pezzi = 0;
    const testo = [];
    for (const r of righe) {
      const q = Number(r.quantity ?? r.current_quantity ?? r.qty ?? 1) || 1;
      const p = Number(r.price ?? r.originalUnitPrice ?? r.unitPrice ?? 0) || 0;
      totale += p * q; pezzi += q;
      testo.push(`${r.name ?? r.title ?? '?'} | ${q} | ${p}`);
    }
    return { totale: r2(totale), pezzi, dettaglio: testo.join(' ;; ') };
  } catch { return { totale: null, pezzi: null, dettaglio: '(JSON illeggibile)' }; }
}

try {
  // ---- 1) le vendite, dal database ----------------------------------------
  const consegne = await db.delivery.findMany({
    where: { deletedAt: null, status: { in: ['delivered', 'approved'] },
      serviceType: { pricingModel: 'VENDITA' } },
    select: {
      code: true, legacyId: true, date: true, status: true,
      price: true, additionalPrice: true, deliveryPrice: true, productValue: true,
      valetSalary: true, valetAdditionalPrice: true,
      isFlexiblePrice: true, flexiblePrice: true, hours: true,
      shop: true, legacySaleId: true, legacyOrderId: true, realOrderNumber: true,
      saleType: true, createdFrom: true, identifier: true,
      partner: { select: { insegna: true, commissionPercent: true } },
      serviceType: { select: { name: true } },
      products: {
        select: {
          quantity: true, price: true, flexiblePrice: true, withoutCommission: true,
          productName: true, variantName: true,
          product: { select: { name: true, price: true, publicPrice: true } },
        },
      },
    },
    orderBy: { date: 'desc' },
  });

  // ---- 1-bis) gli ordini Shopify, dalle tabelle di vendita del legacy ------
  // Indice unico id -> vendita, con annotato da quale file viene.
  const indice = new Map();
  const perFile = {};
  for (const f of FILE_VENDITE) {
    const pf = path.join(TABELLE, f);
    if (!fs.existsSync(pf)) { console.log(`  (${f} non c'e', salto)`); continue; }
    const righe = leggiCsv(pf);
    perFile[f] = righe.length;
    for (const r of righe) if (r.id != null && !indice.has(String(r.id))) indice.set(String(r.id), { ...r, _file: f });
  }
  console.log('tabelle di vendita lette:', JSON.stringify(perFile));

  /**
   * ⚠️⚠️ LO SCARTO COL TOTALE SHOPIFY **NON E'** UN ERRORE.
   *
   * Ci ero cascato: avevo classificato come anomale le 7.207 consegne (il 58,8%)
   * il cui venduto non combaciava col totale dell'ordine Shopify. Due prove che
   * era una falsa pista, trovate prima di darle per buone:
   *  - il totale combacia nell'**1,6%** dei casi, e in TUTTE le tabelle di
   *    vendita allo stesso modo: se un criterio "sbaglia" ovunque uguale, non
   *    sta misurando quel che credi;
   *  - raggruppando le consegne che condividono lo stesso ordine (168 gruppi,
   *    fino a 128 consegne su un ordine solo) la percentuale non si muove: 1,5%.
   *
   * E la ragione l'ha detta l'utente: **su Shopify c'e' il prezzo PUBBLICO, che
   * e' un'altra cosa dal prezzo del prodotto concordato col partner.** Sono due
   * grandezze diverse, non due misure della stessa. Quindi i dati dell'ordine
   * restano nel CSV come RIFERIMENTO — servono a capire un caso guardandolo —
   * ma non decidono se una riga e' sbagliata.
   *
   * ⚠️ In piu' la giuntura consegna->ordine e' ambigua di suo: 1.752 id di
   * vendita esistono in piu' di una tabella, e quale tabella sia quale non e'
   * scritto da nessuna parte. La fonte solida per gli ordini Shopify e' Deluxy
   * Orders, non questo export.
   */
  const SOGLIA_SCARTO = 1;

  const valutate = consegne.map((d) => {
    const venduto = r2(d.products.reduce((s, l) => s + (l.price ?? 0) * (l.quantity ?? 1), 0));
    // ⚠️ SI LEGGE. Il vuoto resta vuoto: con zero il partner risulterebbe non
    // aver preso niente e il guadagno sarebbe tutto nostro.
    const alPartner = (d.productValue ?? 0) > 0 ? r2(d.productValue) : null;
    const guadagno = alPartner != null ? r2(venduto - alPartner) : null;
    const guadagnoNetto = guadagno != null ? r2(guadagno / 1.22) : null;
    const trattenuto = r2(Math.max(0, (d.price ?? 0) + (d.additionalPrice ?? 0)));
    const catalogo = r2(d.products.reduce(
      (s, l) => s + ((l.product?.publicPrice ?? l.product?.price ?? 0) * (l.quantity ?? 1)), 0));
    const o = d.legacySaleId != null ? indice.get(String(d.legacySaleId)) : null;
    const li = righeOrdine(o?.lineItems);
    // ⚠️ `total` vince su `totalPrice`: sulle vendite piu' vecchie `totalPrice`
    // e' scritto "0" mentre `total` ha l'importo vero (#20978: total 185,
    // totalPrice 0). Leggere prima il secondo faceva risultare a zero centinaia
    // di ordini che a zero non erano.
    const totOrdine = n(o?.total) ?? n(o?.totalPrice) ?? li.totale;
    const feeContratto = d.partner?.commissionPercent ?? 0;
    const scarto = totOrdine != null && venduto > 0 ? r2(totOrdine - venduto) : null;
    // Solo controlli INTERNI, che si reggono da soli. Lo scarto Shopify e'
    // informazione, non verdetto (vedi SOGLIA_SCARTO qui sopra).
    //
    // ⚠️ Un guadagno a ZERO non e' un'anomalia: con un partner a fee 0% e' una
    // scelta commerciale. Delle 3.003 vendite senza quota, 2.880 erano proprio
    // questo — accusarle tutte avrebbe segnalato righe sane.
    const guadagnoPc = guadagno != null && venduto > 0 ? (guadagno / venduto) * 100 : null;
    const scostaDaContratto = feeContratto > 0 && guadagnoPc != null && guadagno > 0
      && Math.abs(guadagnoPc - feeContratto) > 5;
    const anomalia = venduto <= 0 ? 'prezzo pubblico a zero'
      : alPartner == null ? 'manca il valore dato al partner'
        : alPartner > venduto ? 'al partner piu\' del pubblico'
          : scostaDaContratto ? 'guadagno lontano dalla fee di contratto'
            : null;
    return { d, venduto, alPartner, guadagno, guadagnoNetto, trattenuto, catalogo,
      anomalia, o, li, totOrdine, scarto,
      feeReale: guadagnoPc != null ? r2(guadagnoPc) : null };
  });
  const scelte = TUTTE ? valutate : valutate.filter((x) => x.anomalia);

  // ---- 2) unione + CSV -----------------------------------------------------
  const testa = [
    'consegna', 'data', 'stato', 'partner', 'fee contratto %', 'servizio', 'anomalia',
    'prezzo pubblico (righe consegna)', 'DATO AL PARTNER (productValue)',
    'guadagno lordo', 'guadagno netto IVA', 'guadagno %',
    'quota a listino (Delivery.price+plus)',
    'valore a catalogo oggi', 'Delivery.price', 'plus/minus', 'consegna prezzo',
    'paga valet', 'plus/minus valet', 'prezzo flessibile', 'flexiblePrice', 'ore',
    'righe prodotto', 'dettaglio righe (nome | q | prezzo riga | prezzo catalogo | prezzo pubblico)',
    'shop', 'id vendita', 'id ordine', 'numero ordine Shopify', 'tipo vendita', 'origine',
    'ORDINE: trovato in', 'ORDINE: totale', 'ORDINE: total', 'ORDINE: totalPrice',
    'ORDINE: subTotalPrice', 'ORDINE: totalDiscounts', 'ORDINE: totalShippingAmount',
    'ORDINE: totalTax', 'ORDINE: somma righe', 'ORDINE: pezzi',
    'ORDINE: righe (nome | q | prezzo)', 'ORDINE vs venduto',
  ];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const righeCsv = [testa];
  let trovati = 0, scostati = 0;
  const scostamenti = [];

  for (const x of scelte) {
    const { d, o, li, totOrdine, scarto } = x;
    if (o) trovati++;
    if (scarto != null && Math.abs(scarto) >= SOGLIA_SCARTO) {
      scostati++;
      scostamenti.push({ code: d.code, venduto: x.venduto, ordine: totOrdine, scarto });
    }
    righeCsv.push([
      d.code, d.date.toISOString().slice(0, 10), d.status,
      d.partner?.insegna ?? '', d.partner?.commissionPercent ?? '', d.serviceType?.name ?? '',
      x.anomalia ?? '',
      x.venduto, x.alPartner ?? '', x.guadagno ?? '', x.guadagnoNetto ?? '', x.feeReale ?? '',
      x.trattenuto,
      x.catalogo, d.price ?? '', d.additionalPrice ?? '', d.deliveryPrice ?? '',
      d.valetSalary ?? '', d.valetAdditionalPrice ?? '',
      d.isFlexiblePrice ? 'si' : '', d.flexiblePrice ?? '', d.hours ?? '',
      d.products.length,
      d.products.map((l) => [
        l.productName ?? l.product?.name ?? '?', l.quantity ?? 1,
        l.price ?? '', l.product?.price ?? '', l.product?.publicPrice ?? '',
      ].join(' | ')).join(' ;; '),
      d.shop ?? '', d.legacySaleId ?? '', d.legacyOrderId ?? '', d.realOrderNumber ?? '',
      d.saleType ?? '', d.createdFrom ?? '',
      o?._file ?? 'NON TROVATO',
      totOrdine ?? '', o?.total ?? '', o?.totalPrice ?? '', o?.subTotalPrice ?? '',
      o?.totalDiscounts ?? '', o?.totalShippingAmount ?? '', o?.totalTax ?? '',
      li.totale ?? '', li.pezzi ?? '', li.dettaglio, scarto ?? '',
    ]);
  }

  fs.writeFileSync(OUT, '\ufeff' + righeCsv.map((r) => r.map(esc).join(';')).join('\r\n'), 'utf8');

  // ---- 4) il riepilogo, che e' la parte che si legge davvero ---------------
  const perTipo = {};
  for (const x of valutate) { const k = x.anomalia ?? 'a posto'; perTipo[k] = (perTipo[k] ?? 0) + 1; }
  console.log(`\nvendite a buon fine esaminate: ${valutate.length}`);
  for (const [k, v] of Object.entries(perTipo).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(30)} ${String(v).padStart(6)}  ${((v / valutate.length) * 100).toFixed(1)}%`);
  }
  console.log(`\nrighe nel CSV: ${scelte.length}${TUTTE ? ' (tutte)' : ' (solo le anomale)'}`);
  console.log(`ordine Shopify ritrovato (riferimento, non verdetto): ${trovati} su ${scelte.length}`);
  console.log(`di cui col totale diverso dal venduto: ${scostati} — atteso: su Shopify c'e' il`);
  console.log(`prezzo PUBBLICO, che e' un'altra cosa dal prezzo concordato col partner.`);
  console.log(`\nscritto: ${OUT}`);
} finally {
  await db.$disconnect();
}
