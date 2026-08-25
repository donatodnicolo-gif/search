// ============================================================
// Le COMMISSIONI DI INCASSO per metodo di pagamento
// ------------------------------------------------------------
// Chiesto dall'utente il 25/08/2026: «per commissione incassi importa da Orders
// il metodo di pagamento utilizzato e costruisci una tabella cercando le
// commissioni di pagamento per tipologia attuate da Shopify, e attualizza i
// valori delle commissioni di incasso».
//
// Fa due cose, separate apposta:
//  1. POPOLA il listino delle commissioni (`CommissioneIncasso`);
//  2. COPIA sulle consegne il metodo di pagamento che sa Orders.
//
// ⚠️⚠️ LE PERCENTUALI SONO CERCATE, NON LETTE DA UN CONTRATTO. Le fonti
// pubbliche non concordano: per Shopify Payments Italia si trova «1,3–1,9% +
// 0,25 €» a seconda del piano (1,9% + 0,25 sul Basic, 1,8% + 0,30 sul Grow);
// per PayPal si trova 2,49%, 3,4% e 3,49% + 0,35 € nello stesso mese. Per
// questo ogni riga nasce con `confermata = false` e con la sua `fonte` scritta
// dentro: sono STIME DICHIARATE, e la pagina lo dice. Chi ha in mano la fattura
// del gestore le conferma cambiando quel campo.
//
// ⚠️ La commissione ha due parti — percentuale e quota FISSA per transazione —
// e la fissa pesa piu' della percentuale sui piccoli importi: 0,25 € su un
// ordine da 8 € sono il 3,1%. Tenerla fuori sottostima proprio gli ordini che
// gia' rendono poco.
//
// ⚠️ Il metodo di pagamento e' di ORDERS, non nostro. Qui se ne tiene una copia
// di comodo per il calcolo del margine: se i due divergono ha ragione Orders.
//
// PROVA A VUOTO DI DEFAULT. Si applica con --scrivi.
// ============================================================
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

const SCRIVI = process.argv.includes('--scrivi');
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
process.env.DATABASE_URL =
  `postgresql://${u.username}:${u.password}@${u.hostname}:6543/postgres?schema=platform&pgbouncer=true&connection_limit=1`;
const db = new PrismaClient();
const eu = (n) => n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

/**
 * Il listino, gateway per gateway.
 *
 * I `gateway` sono quelli che compaiono davvero in Orders, contati prima di
 * scrivere questa tabella: shopify_payments 10.170 · paypal 2.517 · manual 619 ·
 * Bank Deposit 438 · Cash on Delivery 212 · PostePay 67 · Satispay 63 ·
 * Binance/Crypto 12. Le combinazioni («shopify_payments, paypal») sono ordini
 * pagati in due volte: si prende il primo gateway della lista.
 */
const LISTINO = [
  // ⭐ IL PIANO E' DEL NEGOZIO, e cambia la tariffa. L'utente il 25/08/2026:
  // «il piano e' Basic per tutti tranne per gifts, dove abbiamo il primo piano
  // dopo il Basic». «gifts» e' `deluxygifts.myshopify.com`, brand `deluxy.it`,
  // e da solo fa 11.800 ordini su 14.406: una tariffa sola per tutti sarebbe
  // stata sbagliata proprio sul negozio piu' grande.
  { gateway: 'shopify_payments', brand: 'deluxy.it', categoria: 'carta', percentuale: 1.8, fissa: 0.30,
    fonte: 'shopify.com — piano Grow Italia (ago 2026); negozio deluxygifts, piano indicato dall\'utente',
    note: 'Carte extra-europee costano di piu\' e qui non sono distinte.' },
  { gateway: 'shopify_payments', brand: null, categoria: 'carta', percentuale: 1.9, fissa: 0.25,
    fonte: 'shopify.com / blog.smart-dato.com — piano Basic Italia, carte europee (ago 2026)',
    note: 'Vale per Flowers e cakedesign.me. Extra-europee fino al 3,6%: qui non distinte.' },
  { gateway: 'paypal', brand: null, categoria: 'carta', percentuale: 3.4, fissa: 0.35,
    fonte: 'paypal.com/it — tariffe venditori; le fonti danno 2,49 / 3,4 / 3,49% (ago 2026)',
    note: 'Presa la piu\' alta fra quelle trovate: sottostimare un costo e\' peggio che sovrastimarlo.' },
  { gateway: 'PostePay', brand: null, categoria: 'carta', percentuale: 1.9, fissa: 0.25,
    fonte: 'assimilata a Shopify Payments in mancanza di un dato proprio',
    note: 'DA VERIFICARE: nessuna tariffa trovata, e\' un\'assimilazione.' },
  { gateway: 'Satispay App', brand: null, categoria: 'altro', percentuale: 0, fissa: 0.20,
    fonte: 'Satispay: gratis sotto i 10 €, 0,20 € fissi sopra (ago 2026)',
    note: 'DA VERIFICARE: la soglia dei 10 € non e\' rappresentabile qui.' },
  { gateway: 'Bank Deposit', brand: null, categoria: 'bonifico', percentuale: 0, fissa: 0,
    fonte: 'bonifico: nessuna commissione di incasso', note: null },
  { gateway: 'manual', brand: null, categoria: 'altro', percentuale: 0, fissa: 0,
    fonte: 'pagamento registrato a mano: nessun gestore, nessuna commissione', note: null },
  { gateway: 'Cash on Delivery (COD)', brand: null, categoria: 'contrassegno', percentuale: 0, fissa: 0,
    fonte: 'contrassegno: l\'incasso e\' in contanti alla consegna',
    note: 'Il costo del contrassegno, se c\'e\', e\' del corriere e non e\' una commissione di incasso.' },
  { gateway: 'Binance / Crypto', brand: null, categoria: 'altro', percentuale: 0, fissa: 0,
    fonte: 'nessuna tariffa nota', note: 'DA VERIFICARE.' },
  { gateway: 'gift_card', brand: null, categoria: 'altro', percentuale: 0, fissa: 0,
    fonte: 'buono regalo: non e un incasso, e un credito gia nostro speso',
    note: 'Trovato contando i gateway veri: 1 consegna. Un listino si riempie da cio che c e, non da cio che ci si aspetta.' },
];

try {
  // ---------- 1) il listino ----------
  console.log('=== listino delle commissioni ===');
  console.log('| gateway | negozio | categoria | % | fissa | fonte |');
  console.log('|---|---|---|---|---|---|');
  for (const r of LISTINO) {
    console.log(`| ${r.gateway} | ${r.brand ?? 'tutti'} | ${r.categoria} | ${r.percentuale}% | ${eu(r.fissa)} | ${String(r.fonte).slice(0, 50)} |`);
  }

  // ---------- 2) il metodo di pagamento, da Orders ----------
  // ⚠️ Si legge lo schema di Orders in SOLA LETTURA e una volta sola, per
  // popolare una copia di comodo. Il possesso resta suo.
  const ordini = await db.$queryRawUnsafe(
    `select "numero", "orderId", "gateway", "categoriaPagamento", "brand" from orders."Ordine" where "gateway" is not null`);
  console.log(`\nordini con un gateway in Orders: ${ordini.length}`);

  const perNumero = new Map();
  const perOrderId = new Map();
  for (const o of ordini) {
    const n = String(o.numero ?? '').replace('#', '').trim();
    if (n) perNumero.set(n, o);
    if (o.orderId) perOrderId.set(String(o.orderId).trim(), o);
  }

  const consegne = await db.delivery.findMany({
    where: { deletedAt: null, serviceType: { pricingModel: 'VENDITA' } },
    select: { id: true, code: true, legacyOrderId: true, realOrderNumber: true, paymentGateway: true },
  });
  const lavori = [];
  let perNum = 0, perReal = 0;
  for (const c of consegne) {
    const o = (c.realOrderNumber && perOrderId.get(String(c.realOrderNumber).trim()))
      ?? (c.legacyOrderId ? perNumero.get(String(c.legacyOrderId)) : null);
    if (!o) continue;
    if (c.realOrderNumber && perOrderId.get(String(c.realOrderNumber).trim())) perReal++; else perNum++;
    // ⚠️ «shopify_payments, paypal» sono due incassi sullo stesso ordine: si
    // prende il primo, e lo si dichiara invece di far finta che sia uno solo.
    const gateway = String(o.gateway).split(',')[0].trim();
    if (c.paymentGateway === gateway) continue;
    lavori.push({ id: c.id, code: c.code, gateway, categoria: o.categoriaPagamento ?? null, brand: o.brand ?? null });
  }
  console.log(`consegne di vendita: ${consegne.length} — ritrovate in Orders: ${perNum + perReal}`);
  console.log(`  per numero d'ordine ${perNum} · per id Shopify ${perReal}`);
  console.log(`  da aggiornare: ${lavori.length}`);
  const conta = {};
  for (const l of lavori) conta[l.gateway] = (conta[l.gateway] ?? 0) + 1;
  console.log('  per gateway:', JSON.stringify(Object.entries(conta).sort((a, b) => b[1] - a[1])));

  if (!SCRIVI) { console.log('\nPROVA A VUOTO — non ho scritto niente. Rilancia con --scrivi.'); process.exit(0); }

  // ⚠️ Niente upsert: la chiave unica comprende `brand` e `validoDa`, che qui
  // sono NULL, e Prisma rifiuta una chiave composta con un valore nullo
  // («Argument validoDa must not be null»). Il vincolo nel database funziona lo
  // stesso; e' il client che non sa indirizzarlo. Si cerca e si scrive.
  for (const r of LISTINO) {
    const esistente = await db.commissioneIncasso.findFirst({
      where: { gateway: r.gateway, brand: r.brand, validoDa: null },
      select: { id: true, confermata: true },
    });
    const dati = { categoria: r.categoria, percentuale: r.percentuale, fissa: r.fissa,
      fonte: r.fonte, note: r.note };
    if (esistente) {
      // ⚠️ Una riga gia' CONFERMATA non si tocca: se qualcuno ha messo la tariffa
      // vera del contratto, rilanciare questo script non deve riportarla alla stima.
      if (esistente.confermata) {
        console.log(`  = ${r.gateway}${r.brand ? " / " + r.brand : ""}: confermata, lasciata com'e'`);
        continue;
      }
      await db.commissioneIncasso.update({ where: { id: esistente.id }, data: dati });
    } else {
      await db.commissioneIncasso.create({
        data: { gateway: r.gateway, brand: r.brand, ...dati, confermata: false } });
    }
  }
  console.log(`\nlistino scritto: ${await db.commissioneIncasso.count()} righe (tutte con confermata = false)`);

  // ⚠️ A BLOCCHI, non riga per riga. Diecimila `update` attraverso il pooler
  // si impiantano: e' la trappola gia' pagata sull'import delle anagrafiche,
  // dove un tentativo e' morto a meta' uscendo con codice 0. Qui le consegne
  // che condividono gateway, categoria e negozio si aggiornano insieme con un
  // solo `updateMany` ogni 500 id: da 10.714 query a poche decine.
  const gruppi = new Map();
  for (const l of lavori) {
    const k = [l.gateway, l.categoria ?? "", l.brand ?? ""].join("|");
    if (!gruppi.has(k)) gruppi.set(k, []);
    gruppi.get(k).push(l.id);
  }
  let fatte = 0;
  for (const [k, ids] of gruppi) {
    const [gateway, categoria, brand] = k.split("|");
    for (let i = 0; i < ids.length; i += 500) {
      const blocco = ids.slice(i, i + 500);
      const r = await db.delivery.updateMany({
        where: { id: { in: blocco } },
        data: { paymentGateway: gateway, paymentCategory: categoria || null, paymentBrand: brand || null },
      });
      fatte += r.count;
    }
    console.log(`  ${gateway}${brand ? " / " + brand : ""}: ${ids.length}`);
  }
  console.log(`metodo di pagamento copiato su ${fatte} consegne.`);
  // ⭐ Un esito 0 non prova che il lavoro sia finito: si conta.
  const controllo = await db.delivery.count({ where: { paymentGateway: { not: null } } });
  console.log(`controprova: ${controllo} consegne hanno un metodo di pagamento in tabella.`);
} finally {
  await db.$disconnect();
}
