/**
 * PREZZI FATTI DAL PARTNER, DAI DDT (06/09/2026 sera, regola utente): «prendi come prodotto padre il
 * prodotto della vendita Shopify (lo trovi col DDT delle consegne) e il prezzo effettivo dato dal
 * prezzo partner, anche se il prodotto della consegna ha un altro nome. Escludi Artista Locale.
 * Risultato: Vintage Cake per 6, pubblico 90 € a Roma, Pappagallo la fa a 50 € → carica un prodotto
 * unico a Pappagallo da 50 €.»
 *
 * Fonte: `ddt-prezzi-padre.json` (analisi del 06/09: 16.390 consegne con DDT, 10.388 abbinate a una
 * vendita, prezzo = somma delle righe della consegna, dedotte le gemelle sullo stesso DDT).
 * Regole di prudenza, dichiarate:
 *  · almeno 3 consegne per coppia (prodotto+variante, partner): sotto, il dato non è un listino;
 *  · niente partner interni o segnaposto (Artista Locale, Deluxy, Magazzino, Deluxy Flowers, Cakedesignme…);
 *  · niente righe dove il «prezzo partner» è uguale al prezzo pubblico (prezzo mai inserito);
 *  · se lo stesso partner ha prezzi diversi per provincia, vince la provincia con più consegne
 *    (il prodotto UNICO non ha provincia: la provincia la dà l'area commerciale del partner).
 * Prodotti: UNICO del partner, categoria del prodotto padre, `notEditable` FALSE (il partner lo
 * corregge), sku `PP-<sku padre o id>-<partnerId>`. Idempotente. PROVA di default; `--scrivi` scrive.
 * `--tutti` carica ogni mestiere; senza, solo TORTE e pasticceria (la richiesta dell'utente).
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8').split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
u.searchParams.set('schema', 'platform'); process.env.DATABASE_URL = u.toString();
const SCRIVI = process.argv.includes('--scrivi');
const TUTTI = process.argv.includes('--tutti');
const FILE = process.argv.find((a) => a.endsWith('.json')) ?? 'C:/Users/nicol/AppData/Local/Temp/claude/C--Users-nicol-app-deluxy-platform-next/d2bc95f0-a0a3-4271-a49f-3c9c76403920/scratchpad/ddt-prezzi-padre.json';
const MIN_CONSEGNE = 3;
const dati = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const righe = Array.isArray(dati) ? dati : (dati.righe ?? dati.rows ?? []);
const p = new PrismaClient();

const eTorta = (r) => /cake|torta|pasticc|dolc/i.test(`${r.mestiere ?? ''} ${r.categoria ?? ''}`);
const buone = righe.filter((r) =>
  (r.n ?? 0) >= MIN_CONSEGNE && r.mediana > 0 && !r.partnerInterno && r.partnerId &&
  !(r.pubblico && Math.abs((r.prezzoConsigliato ?? r.mediana) - r.pubblico) < 0.01) &&
  (TUTTI || eTorta(r)),
);
// una riga per (partner, prodotto+variante): vince la provincia con più consegne
const perChiave = new Map();
for (const r of buone) {
  const k = `${r.partnerId}|${r.productId ?? r.sku ?? r.productName}|${r.variantId ?? r.variantName ?? ''}`;
  const gia = perChiave.get(k);
  if (!gia || (r.n ?? 0) > (gia.n ?? 0)) perChiave.set(k, r);
}
const scelte = [...perChiave.values()].sort((a, b) => (a.partner ?? '').localeCompare(b.partner ?? '') || (b.n ?? 0) - (a.n ?? 0));

const esito = []; let creati = 0, aggiornati = 0, saltati = 0;
for (const r of scelte) {
  const partner = await p.partner.findUnique({ where: { id: r.partnerId }, select: { id: true, insegna: true, deleted: true, active: true } });
  if (!partner || partner.deleted) { saltati++; continue; }
  const base = (r.sku || r.productId || r.productName || '').toString().toUpperCase().replace(/[^A-Z0-9]+/g, '-').slice(0, 28);
  const sku = `PP-${base}-${r.partnerId}`;
  const nome = `${r.catalogoNome || r.productName}${r.variantName ? ` ${r.variantName}` : ''}`.trim();
  const prezzo = Math.round((r.prezzoConsigliato ?? r.mediana) * 100) / 100;
  esito.push({ partner: partner.insegna, prodotto: nome, prezzo, pubblico: r.pubblico ?? null, n: r.n, prov: r.provincia ?? '', ultima: r.ultima });
  if (!SCRIVI) continue;
  const categoryId = r.productId
    ? (await p.product.findUnique({ where: { id: r.productId }, select: { categoryId: true } }))?.categoryId ?? null
    : null;
  const descr = `Prezzo ricavato dai DDT delle consegne: ${r.n} consegne${r.provincia ? ` in ${r.provincia}` : ''}, mediana ${r.mediana} €, tra ${r.min} e ${r.max} €, ultima il ${(r.ultima ?? '').slice(0, 10)}${r.pubblico ? `; prezzo pubblico ${r.pubblico} €` : ''}. Caricato il 06/09/2026: il partner lo può correggere.`;
  const gia = await p.product.findFirst({ where: { sku }, select: { id: true } });
  const d = { name: nome, description: descr, price: prezzo, publicPrice: r.pubblico ?? null, type: 'UNICO', partnerId: partner.id, categoryId, active: true, approved: true, hasVariants: false, notEditable: false, deletedAt: null, createdFrom: 'ddt-consegne-2026-09-06' };
  if (gia) { await p.product.update({ where: { id: gia.id }, data: d }); aggiornati++; }
  else { await p.product.create({ data: { ...d, sku } }); creati++; }
}
const perPartner = {};
for (const e of esito) perPartner[e.partner] = (perPartner[e.partner] ?? 0) + 1;
console.table(esito.slice(0, 30));
console.log(`${SCRIVI ? 'SCRITTO' : 'PROVA'} · righe lette ${righe.length} · buone (≥${MIN_CONSEGNE} consegne, non interne, prezzo ≠ pubblico${TUTTI ? '' : ', solo torte'}) ${buone.length} · prodotti ${scelte.length}` + (SCRIVI ? ` · creati ${creati} · aggiornati ${aggiornati} · saltati ${saltati}` : ''));
console.log('per partner:', Object.entries(perPartner).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(' · '));
await p.$disconnect();
