/**
 * FIORI A STELO come PRODOTTI UNICI per partner (06/09/2026 sera, regola utente): «con i fiori ci
 * siamo: per ogni partner carica come prodotto unico non modificabile questi prezzi per fiori singoli».
 * Fonte: gli aggregati dello studio sui prezzi unitari (scratchpad pu_agg.json: per fiorista, per
 * tipo di fiore, mediana del prezzo AL PARTNER per stelo sulle righe delle consegne degli ultimi 3 anni).
 * Regole: solo fioristi (mest F), solo fiori con almeno 3 osservazioni; categoria «Fiori a stelo»
 * (mestiere Fiorista, creata se manca); prodotto UNICO del partner, modificabile dal fioraio nella
 * sua pagina Listino, prezzo = mediana per stelo, sku `STELO-<fiore>-<partnerId>`.
 * Idempotente (upsert per sku). PROVA di default; `--scrivi` per scrivere.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8').split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
u.searchParams.set('schema', 'platform'); process.env.DATABASE_URL = u.toString();
const SCRIVI = process.argv.includes('--scrivi');
const AGG = process.argv.find((a) => a.endsWith('.json')) ?? 'C:/Users/nicol/AppData/Local/Temp/claude/C--Users-nicol-app-deluxy-platform-next/d2bc95f0-a0a3-4271-a49f-3c9c76403920/scratchpad/pu_agg.json';
const agg = JSON.parse(fs.readFileSync(AGG, 'utf8'));
const p = new PrismaClient();
const cuid = (pre) => pre + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
const titolo = (s) => s.replace(/(^|\s)(\p{L})/gu, (m) => m.toUpperCase());

// categoria «Fiori a stelo» sotto il mestiere Fiorista
const fiorista = await p.mestiere.findFirst({ where: { nome: 'Fiorista' }, select: { id: true } });
let cat = await p.category.findFirst({ where: { name: 'Fiori a stelo' }, select: { id: true } });
if (!cat) {
  if (SCRIVI) cat = await p.category.create({ data: { name: 'Fiori a stelo', mestiereId: fiorista?.id ?? null }, select: { id: true } });
  console.log(SCRIVI ? '✓ categoria «Fiori a stelo» creata' : '(prova) creerei la categoria «Fiori a stelo»');
}
const partners = (Array.isArray(agg.partners) ? agg.partners : Object.values(agg.partners)).filter((x) => x.mest === 'F');
const righe = []; let creati = 0, aggiornati = 0, saltati = 0;
for (const pa of partners) {
  const partner = await p.partner.findUnique({ where: { id: pa.id }, select: { id: true, insegna: true, active: true, deleted: true } });
  if (!partner || partner.deleted) { console.log('  ⚠️ partner non trovato o cancellato:', pa.nome); continue; }
  for (const f of pa.fiori ?? []) {
    if (!(f.n >= 3) || !(f.med > 0)) { saltati++; continue; }
    const sku = `STELO-${f.tipo.toUpperCase().replace(/[^A-Z0-9]+/g, '-')}-${pa.id}`;
    const nome = `${titolo(f.label ?? f.tipo)} a stelo`;
    const descr = `Prezzo per stelo, dallo storico delle consegne (${f.n} righe, ${f.steli ?? '?'} steli, ultima ${f.ultima ?? '?'}); minimo ${f.min} €, massimo ${f.max} €. Caricato il 06/09/2026 dall'ufficio: il fioraio lo può correggere dal suo Listino.`;
    righe.push({ partner: partner.insegna, prodotto: nome, sku, prezzo: f.med, n: f.n, ultima: f.ultima });
    if (!SCRIVI) continue;
    const gia = await p.product.findFirst({ where: { sku }, select: { id: true } });
    const dati = { name: nome, description: descr, price: f.med, type: 'UNICO', partnerId: partner.id, categoryId: cat.id, notEditable: false, approved: true, active: true, hasVariants: false, visibleToOtherPartners: false, deletedAt: null, createdFrom: 'storico-consegne-2026-09-06' };
    if (gia) { await p.product.update({ where: { id: gia.id }, data: dati }); aggiornati++; }
    else { await p.product.create({ data: { ...dati, sku } }); creati++; }
  }
}
const perPartner = {};
for (const r of righe) perPartner[r.partner] = (perPartner[r.partner] ?? 0) + 1;
console.table(righe.slice(0, 40));
console.log(`${SCRIVI ? 'SCRITTO' : 'PROVA'} · prodotti: ${righe.length} su ${partners.length} fioristi · saltati (< 3 osservazioni): ${saltati}` + (SCRIVI ? ` · creati ${creati} · aggiornati ${aggiornati}` : ''));
console.log('per partner:', Object.entries(perPartner).map(([k, v]) => `${k}=${v}`).join(' · '));
await p.$disconnect();
