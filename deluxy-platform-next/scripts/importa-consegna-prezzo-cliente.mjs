// ============================================================
// Importa la CONSEGNA PAGATA DAL CLIENTE (`Delivery.deliveryPrice`)
// ------------------------------------------------------------
// Segnalato dall'utente il 25/08/2026: nella Finanza mancava «il valore della
// consegna pagata dal cliente». Il campo esiste da sempre — `deliveryPrice`,
// «tariffa consegna al cliente (Finanza)» — ed era **null su tutte le 61.836
// consegne**, perche' nel `delivery` legacy quel dato non c'e': sta sulla
// VENDITA, in `totalShippingAmount`.
//
// ⭐ LA CHIAVE GIUSTA, e per giorni ho usato quella sbagliata.
// Su #62950: la consegna ha `legacyOrderId 12790` e `primaryIdOfSale 11252`; la
// vendita ha `id 11252`, `orderId 12790`, `subTotalPrice 140`,
// **`totalShippingAmount 25`** e lo stesso cliente (Tara Booth). Il cliente ha
// pagato 165: 140 di torta piu' 25 di consegna.
// Giuntura: **`Delivery.legacyOrderId` -> `orderId` della vendita**.
// Misurato: `legacySaleId -> id` (quella che usavo) trovava 7.753 vendite col
// subtotale che combaciava nell'1,1% dei casi; `legacyOrderId -> orderId` ne
// trova **9.674** e combacia nel **19,8%**. Non e' una sfumatura, e' un'altra
// giuntura.
//
// ⚠️ UN ORDINE PUO' AVERE PIU' CONSEGNE. La spedizione e' dell'ORDINE, non
// della singola consegna: attribuirla intera a ciascuna la conterebbe due, tre,
// dieci volte. Qui si scrive **solo** dove l'ordine ha una consegna sola. Gli
// ordini multi-consegna vengono elencati e lasciati stare: dividere una
// spedizione fra piu' consegne e' una decisione, non un calcolo.
//
// ⚠️ `legacyOrderId = 0` non e' un ordine: e' il segnaposto di chi non ne ha, e
// ci stanno sotto 10.272 consegne. Escluso.
//
// PROVA A VUOTO DI DEFAULT. Si applica con --scrivi.
//
// Uso:
//   node scripts/importa-consegna-prezzo-cliente.mjs           (non scrive)
//   node scripts/importa-consegna-prezzo-cliente.mjs --scrivi
//   node scripts/importa-consegna-prezzo-cliente.mjs --disfa=<file json>
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { leggiCsv } from './leggi-csv.mjs';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

const argomenti = process.argv.slice(2);
const SCRIVI = argomenti.includes('--scrivi');
const DISFA = (argomenti.find((a) => a.startsWith('--disfa=')) ?? '').slice('--disfa='.length);

const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
process.env.DATABASE_URL =
  `postgresql://${u.username}:${u.password}@${u.hostname}:6543/postgres?schema=platform&pgbouncer=true&connection_limit=1`;

const db = new PrismaClient();
const TABELLE = path.join(process.cwd(), 'legacy', 'tabelle');
const FILE_VENDITE = ['tabella-72.csv', 'tabella-12.csv', 'tabella-42.csv',
  'tabella-9.csv', 'tabella-26.csv', 'tabella-28.csv'];
/** Numero, e il vuoto resta vuoto (`Number('')` vale 0, e 0 e' finito). */
const num = (v) => {
  if (v == null || String(v).trim() === '') return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};
const eu = (n) => n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

try {
  // --- disfare -------------------------------------------------------------
  if (DISFA) {
    const backup = JSON.parse(fs.readFileSync(DISFA, 'utf8'));
    console.log(`disfo ${backup.length} consegne dal backup ${DISFA}`);
    if (!SCRIVI) { console.log('prova a vuoto: aggiungi --scrivi per applicare'); process.exit(0); }
    let n = 0;
    for (const b of backup) {
      await db.delivery.update({ where: { id: b.id }, data: { deliveryPrice: b.prima } });
      n++;
    }
    console.log(`rimesse ${n} consegne come prima`);
    process.exit(0);
  }

  // --- 1) le vendite del legacy, indicizzate per orderId --------------------
  const perOrderId = new Map();
  for (const f of FILE_VENDITE) {
    const p = path.join(TABELLE, f);
    if (!fs.existsSync(p)) continue;
    for (const r of leggiCsv(p)) {
      const k = r.orderId != null && String(r.orderId).trim() !== '' ? String(r.orderId).trim() : null;
      if (k && !perOrderId.has(k)) perOrderId.set(k, { ...r, _file: f });
    }
  }
  console.log(`vendite legacy indicizzate per orderId: ${perOrderId.size}`);

  // --- 2) le consegne, raggruppate per ordine ------------------------------
  const consegne = await db.delivery.findMany({
    where: { deletedAt: null, legacyOrderId: { not: null } },
    select: { id: true, code: true, legacyOrderId: true, deliveryPrice: true,
      serviceType: { select: { pricingModel: true } } },
  });
  const perOrdine = new Map();
  for (const c of consegne) {
    // ⚠️ 0 non e' un ordine: e' il segnaposto di chi non ne ha.
    if (!c.legacyOrderId) continue;
    const k = String(c.legacyOrderId);
    if (!perOrdine.has(k)) perOrdine.set(k, []);
    perOrdine.get(k).push(c);
  }

  const daScrivere = [];
  let ordiniConSped = 0, sommaSped = 0, multi = 0, sommaMulti = 0, giaScritte = 0;
  for (const [k, g] of perOrdine) {
    const o = perOrderId.get(k);
    const sped = o ? num(o.totalShippingAmount) : null;
    if (!(sped > 0)) continue;
    ordiniConSped++; sommaSped += sped;
    if (g.length > 1) { multi++; sommaMulti += sped; continue; }   // si lascia stare
    const c = g[0];
    if (c.deliveryPrice != null) { giaScritte++; continue; }
    daScrivere.push({ id: c.id, code: c.code, ordine: k, prima: c.deliveryPrice, dopo: sped,
      vendita: g[0].serviceType?.pricingModel === 'VENDITA' });
  }

  console.log(`\nordini con spedizione > 0 e ritrovati : ${ordiniConSped}   (${eu(sommaSped)})`);
  console.log(`  ⚠️ ordini con PIU' consegne, lasciati stare: ${multi}   (${eu(sommaMulti)})`);
  console.log(`  gia' valorizzate, non toccate              : ${giaScritte}`);
  console.log(`  DA SCRIVERE                                : ${daScrivere.length}   (${eu(daScrivere.reduce((s, x) => s + x.dopo, 0))})`);
  console.log(`     di cui su consegne di VENDITA           : ${daScrivere.filter((x) => x.vendita).length}   (${eu(daScrivere.filter((x) => x.vendita).reduce((s, x) => s + x.dopo, 0))})`);

  console.log('\nprimi otto:');
  daScrivere.slice(0, 8).forEach((x) => console.log(`  #${String(x.code).padEnd(7)} ordine ${String(x.ordine).padEnd(8)} consegna cliente ${eu(x.dopo)}`));

  if (!SCRIVI) {
    console.log('\nPROVA A VUOTO — niente e\' stato scritto. Aggiungi --scrivi per applicare.');
    process.exit(0);
  }

  const nomeBackup = path.join(process.cwd(), 'scripts', 'backup-consegna-prezzo-cliente.json');
  fs.writeFileSync(nomeBackup, JSON.stringify(daScrivere.map((x) => ({ id: x.id, code: x.code, prima: x.prima })), null, 1));
  console.log(`\nbackup di cosa c'era prima: ${nomeBackup}`);

  let fatte = 0;
  for (const x of daScrivere) {
    await db.delivery.update({ where: { id: x.id }, data: { deliveryPrice: x.dopo } });
    if (++fatte % 500 === 0) console.log(`  ${fatte}/${daScrivere.length}`);
  }
  console.log(`\nscritte ${fatte} consegne.`);
  const controllo = await db.delivery.count({ where: { deliveryPrice: { gt: 0 } } });
  console.log(`controprova: consegne con deliveryPrice > 0 in tabella: ${controllo}`);
} finally {
  await db.$disconnect();
}
