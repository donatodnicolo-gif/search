/**
 * LA CATEGORIA MANCANTE SI PRENDE DA MERCHANDISING (10/09/2026, decisione utente «sistema pure»).
 *
 *   node api/scripts/categorie-da-merchandising.mjs            (anteprima)
 *   node api/scripts/categorie-da-merchandising.mjs --applica
 *
 * Il caso: ordine 12927 «Bouquet Pink Grace - Medio» fermo «da gestire» perché il prodotto in
 * piattaforma non ha categoria → nessun mestiere → nessuna lista di priorità. Merchandising la
 * categoria la sa (FIORI). Misura del 10/09: 899 prodotti attivi senza categoria, 668 con una
 * categoria in Merchandising, di cui 417 «DA_CLASSIFICARE» (inutile) e 251 utili.
 *
 * Abbinamento: per CODICE (sku = codice), poi per NOME esatto, poi per nome base senza la taglia
 * («Bouquet Pink Grace - Medio» → «Bouquet Pink Grace»). Mappa Merchandising → piattaforma
 * concordata con l'utente. Scrive SOLO categoryId dove è NULL; non tocca chi ce l'ha.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const APPLICA = process.argv.includes('--applica');
const M = 'C:/Users/nicol/scoutwt/deluxy-merchandising/'; const P = 'C:/Users/nicol/app/.claude/worktrees/deploy-delivery/deluxy-platform-next/';
const rm = createRequire(M + 'package.json'); const rp = createRequire(P + 'api/package.json');
const env = (f) => { const l = fs.readFileSync(f, 'utf8').split(/\r?\n/).find((x) => x.startsWith('DATABASE_URL=')); const u = new URL(l.slice(13).trim().replace(/^"|"$/g, '')); u.searchParams.set('connection_limit', '1'); return u; };
const um = env(M + '.env'); const up = env(P + 'api/.env'); up.searchParams.set('schema', 'platform');
const dm = new (rm('@prisma/client').PrismaClient)({ datasources: { db: { url: um.toString() } } });
const dp = new (rp('@prisma/client').PrismaClient)({ datasources: { db: { url: up.toString() } } });
const MAPPA = { FIORI: 'Fiori (2)', BOUQUET: 'Fiori (2)', COMPOSIZIONE: 'Fiori (2)', TORTE_DOLCI: 'Torte (2)', REGALI: 'Gift Boutique', VINI_SPIRITS: 'Vini', ORIGINALI_DELUXY: 'Originali Deluxy' };
const norma = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
const base = (s) => norma(s).replace(/\s*[-–]\s*(piccolo|medio|grande|medio-grande|xl|xxl|small|medium|large|\d+.*)$/i, '').trim();
const cats = await dp.category.findMany({ select: { id: true, name: true } });
const catId = Object.fromEntries(Object.entries(MAPPA).map(([k, v]) => [k, cats.find((c) => c.name === v)?.id ?? null]));
for (const [k, v] of Object.entries(catId)) if (!v) console.log(`⚠️ categoria piattaforma «${MAPPA[k]}» non trovata per ${k}`);
const merch = await dm.prodotto.findMany({ where: { fase: 'in_vendita', categoria: { in: Object.keys(MAPPA) } }, select: { codice: true, nome: true, categoria: true } });
const perNome = new Map(); for (const m of merch) { perNome.set(norma(m.nome), m); if (!perNome.has(base(m.nome))) perNome.set(base(m.nome), m); }
const perCodice = new Map(merch.map((m) => [String(m.codice).toUpperCase(), m]));
const senza = await dp.product.findMany({ where: { categoryId: null, active: true, archived: false, deletedAt: null }, select: { id: true, name: true, sku: true } });
const daScrivere = []; const conteggio = {};
for (const p of senza) {
  // Per codice; poi nome esatto; poi nome base SOLO se in piattaforma c'è la taglia dopo il trattino
  // (Bouquet Pink Grace - Medio → Bouquet Pink Grace) e il nome base non è una parola sola.
  const haTaglia = /\s[-–]\s/.test(p.name) && base(p.name) !== norma(p.name);
  const m = perCodice.get(String(p.sku ?? '').toUpperCase()) ?? perNome.get(norma(p.name)) ?? (haTaglia && base(p.name).length >= 8 && base(p.name).includes(' ') ? perNome.get(base(p.name)) : null);
  if (!m || !catId[m.categoria]) continue;
  daScrivere.push({ id: p.id, name: p.name, merch: m.nome, da: m.categoria, a: MAPPA[m.categoria], categoryId: catId[m.categoria] });
  conteggio[`${m.categoria} → ${MAPPA[m.categoria]}`] = (conteggio[`${m.categoria} → ${MAPPA[m.categoria]}`] ?? 0) + 1;
}
console.log(`senza categoria: ${senza.length} · da scrivere: ${daScrivere.length}`);
for (const [k, v] of Object.entries(conteggio).sort((a, b) => b[1] - a[1])) console.log(`  ${v} × ${k}`);
console.log('esempi (piattaforma ← Merchandising):'); daScrivere.filter((x) => norma(x.name) !== norma(x.merch)).slice(0, 12).forEach((x) => console.log(`   ${x.name}  ←  ${x.merch}  → ${x.a}`)); console.log('con nome identico:', daScrivere.filter((x) => norma(x.name) === norma(x.merch)).length);
if (!APPLICA) { console.log('ANTEPRIMA: nessuna scrittura.'); await dm.$disconnect(); await dp.$disconnect(); process.exit(0); }
let n = 0;
for (let i = 0; i < daScrivere.length; i += 100) { const lotto = daScrivere.slice(i, i + 100); await dp.$transaction(lotto.map((x) => dp.product.update({ where: { id: x.id }, data: { categoryId: x.categoryId } }))); n += lotto.length; }
console.log(`FATTO: ${n} categorie scritte. Ancora senza categoria: ${await dp.product.count({ where: { categoryId: null, active: true, archived: false, deletedAt: null } })}`);
await dm.$disconnect(); await dp.$disconnect();
