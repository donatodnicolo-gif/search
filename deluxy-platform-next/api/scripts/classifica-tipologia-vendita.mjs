/**
 * TIPOLOGIA DI VENDITA DEL PRODOTTO (06/09/2026 sera, regola utente): «se prodotto unico lascia così;
 * se è un prodotto a quantità (numero di rose) va segnato "a quantità"; se sono fiori non in cesti fai
 * prodotti mix; una torta di cake design (produttore cakedesign.me, o linea/categoria/tipologia che
 * inizia per CDM) è a preventivo, come i fiori in cesti e i bouquet di palloncini».
 *
 * I QUATTRO VALORI (la legenda vive anche nel form prodotti e nel manuale):
 *  · `unico`      — prodotto UNICO del partner: ha già il suo listino, si propone a lui e basta.
 *  · `quantita`   — si vende a NUMERO DI PEZZI identici (12 rose, 16 praline): il prezzo si fa
 *                   moltiplicando il prezzo unitario del partner (il suo Listino) per la quantità.
 *  · `mix`        — composizione a valore (bouquet, cappelliera, ghirlanda): si propone con la
 *                   PERCENTUALE DI SCONTO della provincia e la lista di priorità della categoria.
 *  · `preventivo` — va chiesto un PREVENTIVO ai partner del mestiere prima di accettare la vendita
 *                   (torte cake design, cesti floreali, bouquet di palloncini, personalizzati).
 *
 * Regole automatiche, in ordine (la prima che vale vince). Le ipotesi mie sono marcate «ipotesi».
 * Idempotente, e NON tocca i prodotti già classificati a mano (`--forza` per riscriverli).
 * PROVA di default; `--scrivi` per scrivere.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8').split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
u.searchParams.set('schema', 'platform'); process.env.DATABASE_URL = u.toString();
const SCRIVI = process.argv.includes('--scrivi');
const FORZA = process.argv.includes('--forza');
const p = new PrismaClient();

/** Il numero di pezzi scritto nel nome o nella variante: «12 rose», «Praline 16», «x 24». */
const numeroPezzi = (testo) => {
  const t = (testo ?? '').toLowerCase();
  const m = t.match(/(?:^|[^\d])(\d{1,3})\s*(?:x\s*)?(?:rose|rosa|steli|stelo|tulipani|girasoli|praline|cupcake|macaron|cioccolatini|pezzi|pz)\b/)
    || t.match(/\b(?:x|per)\s*(\d{1,3})\b/);
  return m ? Number(m[1]) : null;
};

const decide = (pr) => {
  const cat = pr.category?.name ?? '';
  const mest = pr.category?.mestiere?.nome ?? '';
  const nome = `${pr.name ?? ''} ${pr.line ?? ''}`.toLowerCase();
  const sku = (pr.sku ?? '').toUpperCase();
  const varianti = (pr.variants ?? []).map((v) => v.name ?? '').join(' ').toLowerCase();

  if (pr.type === 'UNICO') return ['unico', 'prodotto UNICO del partner'];

  // ── PREVENTIVO ──
  if (/^cdm/i.test(cat) || /^cdm/i.test(pr.line ?? '') || /^cdm/i.test(sku) || /cakedesign/i.test(pr.partner?.insegna ?? '')) return ['preventivo', 'torta cake design (CDM o cakedesign.me)'];
  if (/cesti floreali/i.test(cat)) return ['preventivo', 'fiori in cesto'];
  if (/palloncin/i.test(cat) || /palloncin/i.test(nome)) return ['preventivo', 'bouquet di palloncini'];
  // ipotesi: quello che si concorda a voce non ha un prezzo di listino
  if (/personalizzat|su misura|allestiment|matrimoni|evento|richieste speciali/i.test(`${cat} ${nome}`)) return ['preventivo', 'ipotesi: personalizzato o su misura'];
  if (/cake design|^torte/i.test(cat) && /personalizzat|su misura/i.test(nome)) return ['preventivo', 'ipotesi: torta su misura'];

  // ── A QUANTITÀ ──
  if (/fiori a stelo/i.test(cat)) return ['quantita', 'fiore a stelo (prezzo per stelo)'];
  const q = numeroPezzi(pr.name) ?? numeroPezzi(varianti);
  if (q && q > 1 && /fiorista|pasticceria|regali/i.test(mest)) return ['quantita', 'numero di pezzi nel nome o nella variante'];
  if (/^rose$/i.test(cat) && (q || /\brose\b/.test(nome))) return ['quantita', 'ipotesi: rose vendute a numero'];

  // ── MIX ──
  if (/fiorista/i.test(mest)) return ['mix', 'fiori non in cesto: composizione a valore'];
  if (/originali deluxy/i.test(mest)) return ['mix', 'ipotesi: composto di più prodotti'];

  // ── resto del catalogo ──
  return ['mix', 'ipotesi: prodotto a valore, si propone con lo sconto'];
};

const prodotti = await p.product.findMany({
  where: { deletedAt: null, ...(FORZA ? {} : { tipologiaVendita: null }) },
  select: { id: true, name: true, sku: true, line: true, type: true, tipologiaVendita: true, category: { select: { name: true, mestiere: { select: { nome: true } } } }, partner: { select: { insegna: true } }, variants: { select: { name: true } } },
});
const conteggio = {}; const motivi = {}; const esempi = {};
let scritti = 0;
for (const pr of prodotti) {
  const [tipo, perche] = decide(pr);
  conteggio[tipo] = (conteggio[tipo] ?? 0) + 1;
  motivi[`${tipo} · ${perche}`] = (motivi[`${tipo} · ${perche}`] ?? 0) + 1;
  (esempi[tipo] ??= []).push(pr.name);
  if (SCRIVI && pr.tipologiaVendita !== tipo) { await p.product.update({ where: { id: pr.id }, data: { tipologiaVendita: tipo } }); scritti++; }
}
console.log(`${SCRIVI ? 'SCRITTO' : 'PROVA'} · prodotti considerati ${prodotti.length}` + (SCRIVI ? ` · aggiornati ${scritti}` : ''));
console.table(Object.entries(conteggio).map(([tipo, n]) => ({ tipologia: tipo, prodotti: n, esempio: (esempi[tipo] ?? []).slice(0, 2).join(' · ').slice(0, 70) })));
console.log('perché:');
for (const [k, v] of Object.entries(motivi).sort((a, b) => b[1] - a[1])) console.log(`  ${v.toString().padStart(6)} · ${k}`);
await p.$disconnect();
