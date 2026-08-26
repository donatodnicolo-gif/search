/**
 * Recupera i PREZZI FLESSIBILI dal legacy: il valore vero della riga prodotto.
 *
 * Nel vecchio sistema il prezzo concordato di una consegna «su misura» sta nel
 * campo `delivery.flexiblePrice` (un JSON per prodotto:
 * `[{"product":{"id":18625,"flexiblePrice":"680",…},"productVariant":null}]`)
 * che l'import non ha mai letto: la riga nuova restava col prezzo del
 * segnaposto (62510: «Bouquet» 200 dove il concordato era 680) o vuota.
 *
 * Cosa fa: per ogni consegna del CSV con quel JSON, trova la riga
 * DeliveryProduct corrispondente (per legacyId di consegna e prodotto) e
 * scrive `price` (+ `flexiblePrice: true`, + la variante se il JSON la dichiara
 * e la riga non ce l'ha). Dove il prezzo scritto viene CAMBIATO si aggiunge
 * una riga al registro della consegna: fra un mese nessuno saprebbe perche'.
 *
 * Sola lettura di default. `--applica` per scrivere; prima salva i valori
 * vecchi in scripts/backup-prezzi-flessibili.json (senza, non si puo' disfare).
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

const APPLICA = process.argv.includes('--applica');
const TABELLE = 'C:/Users/nicol/app/deluxy-platform-next/legacy/tabelle';

const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
const db = new PrismaClient({ datasources: { db: { url:
  `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform&connection_limit=1` } } });

// --- parser CSV (stesso di importa-legacy.mjs: virgolette doppie, multiriga)
function leggi(nome) {
  const file = path.join(TABELLE, `${nome}.csv`);
  const testo = fs.readFileSync(file, 'utf8');
  const righe = []; let r = [], campo = '', inStr = false;
  for (let i = 0; i < testo.length; i++) {
    const c = testo[i];
    if (inStr) {
      if (c === '"' && testo[i + 1] === '"') { campo += '"'; i++; continue; }
      if (c === '"') { inStr = false; continue; }
      campo += c; continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === ',') { r.push(campo); campo = ''; continue; }
    if (c === '\n') { r.push(campo); righe.push(r); r = []; campo = ''; continue; }
    if (c === '\r') continue;
    campo += c;
  }
  if (campo !== '' || r.length) { r.push(campo); righe.push(r); }
  const testa = righe[0].map((x) => x.trim());
  return righe.slice(1).filter((x) => x.some((v) => v !== ''))
    .map((x) => Object.fromEntries(testa.map((c, i) => [c, x[i]])));
}
const testo = (v) => { const t = String(v ?? '').trim(); return t === '' || t === 'NULL' ? null : t; };

// --- 1) il JSON dei prezzi flessibili, misurato prima di fidarsene
// ⚠️ Due difese decise guardando la prima simulazione:
//  - il JSON vale solo se il flag `isFlexiblePrice` della consegna era ACCESO:
//    un JSON col flag spento e' un avanzo, non una decisione;
//  - un prezzo <= 0 non si scrive MAI: lo zero e' il default di un campo mai
//    compilato, e sopra un prezzo vero cancellerebbe il venduto (95 -> 0).
const conteggi = { consegneCsv: 0, conJson: 0, flagSpento: 0, jsonRotto: 0, vociSenzaPrezzo: 0, prezzoZeroScartato: 0, voci: 0, conVariante: 0 };
/** legacyDeliveryId -> [{prodottoLegacy, prezzo, varianteLegacy}] */
const perConsegna = new Map();
for (const d of leggi('delivery')) {
  conteggi.consegneCsv++;
  const grezzo = testo(d.flexiblePrice);
  if (!grezzo || grezzo === '[]') continue;
  conteggi.conJson++;
  const flag = testo(d.isFlexiblePrice);
  if (flag !== '1' && (flag ?? '').toLowerCase() !== 'true') { conteggi.flagSpento++; continue; }
  let voci;
  try { voci = JSON.parse(grezzo); } catch { conteggi.jsonRotto++; continue; }
  if (!Array.isArray(voci)) { conteggi.jsonRotto++; continue; }
  const buone = [];
  for (const v of voci) {
    const prodottoLegacy = Number(v?.product?.id);
    const prezzo = Number(v?.product?.flexiblePrice);
    const varianteLegacy = v?.productVariant?.id != null ? Number(v.productVariant.id) : null;
    conteggi.voci++;
    if (!Number.isFinite(prodottoLegacy) || !Number.isFinite(prezzo)) { conteggi.vociSenzaPrezzo++; continue; }
    if (prezzo <= 0) { conteggi.prezzoZeroScartato++; continue; }
    if (varianteLegacy != null) conteggi.conVariante++;
    buone.push({ prodottoLegacy, prezzo, varianteLegacy });
  }
  if (buone.length) perConsegna.set(Number(d.id), buone);
}
console.log('CSV:', JSON.stringify(conteggi));

// --- 2) gli oggetti nuovi corrispondenti
const consegne = await db.delivery.findMany({
  where: { legacyId: { in: [...perConsegna.keys()] } },
  select: { id: true, code: true, legacyId: true },
});
const perLegacy = new Map(consegne.map((d) => [d.legacyId, d]));
const righeDb = await db.deliveryProduct.findMany({
  where: { deliveryId: { in: consegne.map((d) => d.id) } },
  select: {
    id: true, deliveryId: true, price: true, flexiblePrice: true,
    productVariantId: true,
    product: { select: { legacyId: true } },
  },
});
const righePerConsegna = new Map();
for (const r of righeDb) {
  const a = righePerConsegna.get(r.deliveryId) ?? [];
  a.push(r); righePerConsegna.set(r.deliveryId, a);
}
const varianti = new Map(
  (await db.productVariant.findMany({ where: { legacyId: { not: null } }, select: { id: true, legacyId: true } }))
    .map((v) => [v.legacyId, v.id]),
);

// --- 3) il confronto, voce per voce
const esiti = {
  consegnaAssente: 0, rigaAssente: 0,
  giaGiusta: 0, daRiempire: 0, daCorreggere: 0, varianteDaScrivere: 0,
};
let sommaVecchi = 0, sommaNuovi = 0;
const scritture = []; // {rigaId, code, prezzoVecchio, prezzoNuovo, varianteVecchia, varianteNuova, cambiata}
const esempiCorrezioni = [];
for (const [legacyId, voci] of perConsegna) {
  const consegna = perLegacy.get(legacyId);
  if (!consegna) { esiti.consegnaAssente++; continue; }
  const righe = [...(righePerConsegna.get(consegna.id) ?? [])];
  for (const voce of voci) {
    const i = righe.findIndex((r) => r.product?.legacyId === voce.prodottoLegacy);
    if (i < 0) { esiti.rigaAssente++; continue; }
    const rigaDb = righe.splice(i, 1)[0]; // ogni riga si usa una volta sola
    const varianteNuova = voce.varianteLegacy != null ? varianti.get(voce.varianteLegacy) ?? null : null;
    const serveVariante = varianteNuova != null && rigaDb.productVariantId == null;
    if (serveVariante) esiti.varianteDaScrivere++;
    if (rigaDb.price === voce.prezzo && !serveVariante) { esiti.giaGiusta++; continue; }
    const cambiata = rigaDb.price != null && rigaDb.price !== voce.prezzo;
    if (rigaDb.price == null) esiti.daRiempire++;
    else if (cambiata) {
      esiti.daCorreggere++;
      sommaVecchi += rigaDb.price; sommaNuovi += voce.prezzo;
      if (esempiCorrezioni.length < 8) esempiCorrezioni.push(`#${consegna.code}: ${rigaDb.price} -> ${voce.prezzo}`);
    }
    scritture.push({
      rigaId: rigaDb.id, deliveryId: consegna.id, code: consegna.code,
      prezzoVecchio: rigaDb.price, prezzoNuovo: voce.prezzo,
      flexVecchio: rigaDb.flexiblePrice,
      varianteVecchia: rigaDb.productVariantId, varianteNuova: serveVariante ? varianteNuova : rigaDb.productVariantId,
      cambiata,
    });
  }
}
console.log('Confronto:', JSON.stringify(esiti));
console.log(`Da scrivere: ${scritture.length} righe · correzioni di prezzi gia' scritti: ${esiti.daCorreggere} (${sommaVecchi.toFixed(2)} -> ${sommaNuovi.toFixed(2)} EUR)`);
for (const e of esempiCorrezioni) console.log('  ' + e);

if (!APPLICA) { console.log('\nPROVA A VUOTO — rilancia con --applica'); await db.$disconnect(); process.exit(0); }

// --- 4) scrittura: prima il backup, senza il quale non si puo' disfare
const backup = 'C:/Users/nicol/app/deluxy-platform-next/api/scripts/backup-prezzi-flessibili.json';
fs.writeFileSync(backup, JSON.stringify(scritture, null, 1), 'utf8');
console.log(`\nBackup dei valori vecchi in ${backup}`);

let fatte = 0;
for (const s of scritture) {
  await db.deliveryProduct.update({
    where: { id: s.rigaId },
    data: { price: s.prezzoNuovo, flexiblePrice: true, productVariantId: s.varianteNuova },
  });
  // Il registro solo dove un prezzo SCRITTO cambia: e' la correzione delicata.
  if (s.cambiata) {
    await db.deliveryLog.create({
      data: {
        deliveryId: s.deliveryId,
        type: 'prezzo-flessibile-recuperato',
        message: `Prezzo riga ${s.prezzoVecchio} -> ${s.prezzoNuovo} EUR: recuperato dal «Dettaglio prezzo flessibile» del sistema originario (campo mai importato).`,
      },
    });
  }
  fatte++;
  if (fatte % 250 === 0) process.stdout.write(`\r  scritte ${fatte}/${scritture.length}…`);
}
console.log(`\r  Righe aggiornate: ${fatte} su ${scritture.length}          `);
await db.$disconnect();
