/**
 * LE NOTE DI SPECIFICA, RICOSTRUITE DALLA DESCRIZIONE (07/09/2026, regola utente).
 *
 * «In merchandising esamina tutti i prodotti: noterai che nella descrizione di alcuni bouquet
 * c'è scritto che la variante media ha 7-10 fiori, quella grande 12-15 ecc. Crea questo campo
 * note per prodotto o variante e riempi ricostruendo in base alla descrizione (esempio per le
 * torte potrebbe essere la dimensione se c'è).»
 *
 * Le descrizioni del negozio hanno una sezione fatta a mano ma regolare:
 *   «Dimensioni Medio: 10-15 fiori Medio-Grande: 15-20 fiori Grande: 30-35 fiori Luxury: 45-55 fiori»
 *   «Dimensioni Small: Diametro minore di 15 cm, circa 10-15 rose Medium: …»
 *   «Pesi e Misure 350 - 500 g 14 - 16 cm …» (torte: vale per il prodotto, non per la taglia)
 *   «Ideale per 6/8 Persone» (torte)
 *
 * Cosa fa: per ogni TAGLIA trovata cerca la variante che si chiama così e le scrive la nota;
 * quello che vale per tutto il prodotto (pesi e misure, porzioni) va sulla nota del prodotto.
 *
 * ⚠️ Non inventa: se la descrizione non dice niente, la nota resta vuota. E non sovrascrive una
 * nota già scritta a mano (`--forza` per rifarle tutte).
 * PROVA di default; `--scrivi` per salvare.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
if (!process.env.DATABASE_URL) {
  const env = fs.readFileSync(new URL('../.env', import.meta.url), 'utf8');
  const riga = env.split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
  if (riga) process.env.DATABASE_URL = riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, '');
}
const SCRIVI = process.argv.includes('--scrivi');
const FORZA = process.argv.includes('--forza');
const p = new PrismaClient();

const pulisci = (s) =>
  (s ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

/** Le taglie come le scrive il negozio. L'ordine conta: «Medio-Grande» prima di «Medio». */
const TAGLIE = [
  'Medio-Grande', 'Medio Grande', 'Piccolo', 'Medium', 'Medio', 'Grande', 'Large', 'Small',
  'Luxury', 'Maxi', 'Mini', 'XL', 'S', 'M', 'L',
];
const RE_TAGLIA = new RegExp(`\\b(${TAGLIE.map((t) => t.replace('-', '[- ]')).join('|')})\\s*:`, 'gi');

/** Normalizza il nome di una taglia per confrontarlo con quello della variante. */
const chiave = (s) =>
  (s ?? '')
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-z]/g, '');
const SINONIMI = { s: 'small', m: 'medium', l: 'large', medium: 'medio', large: 'grande', small: 'piccolo', mediograndE: 'mediogrande' };
const canonica = (s) => { const k = chiave(s); return SINONIMI[k] ?? k; };

/** Le note per taglia dentro una descrizione. */
function notePerTaglia(testo) {
  const fuori = {};
  const trovate = [...testo.matchAll(RE_TAGLIA)];
  for (let i = 0; i < trovate.length; i++) {
    const m = trovate[i];
    const inizio = m.index + m[0].length;
    const fine = i + 1 < trovate.length ? trovate[i + 1].index : Math.min(testo.length, inizio + 120);
    let valore = testo.slice(inizio, fine).trim();
    // si taglia alla fine della frase o al blocco successivo (REGALA, Come Funziona…)
    valore = valore.split(/\s(?=REGALA|Come Funziona|Personalizza|Ingredienti|Allergeni|Consegna|Inclusi)\b/)[0];
    valore = valore.replace(/[,;.\s]+$/, '').trim();
    if (valore.length >= 2 && valore.length <= 120 && /\d/.test(valore)) fuori[canonica(m[1])] = valore;
  }
  return fuori;
}

/** Quello che vale per tutto il prodotto: porzioni, pesi e misure. */
function noteProdotto(testo) {
  const pezzi = [];
  const persone = testo.match(/(?:ideale per|torta per|per)\s*(\d{1,2}\s*[\/–-]\s*\d{1,2}|\d{1,2})\s*(persone|porzioni)/i);
  if (persone) pezzi.push(`${persone[1].replace(/\s/g, '')} ${persone[2].toLowerCase()}`);
  const pesi = testo.match(/Pesi e Misure\s+([^A-Z]{10,160})/);
  if (pesi) pezzi.push(`pesi e misure: ${pesi[1].replace(/\s+/g, ' ').trim().slice(0, 140)}`);
  const cm = !pesi && testo.match(/(?:altezza|diametro|dimensione)[^.;]{0,40}?\d{1,3}\s*(?:[-–x]\s*\d{1,3})?\s*cm/i);
  if (cm) pezzi.push(cm[0].trim());
  return pezzi.join(' · ') || null;
}

const prodotti = await p.prodotto.findMany({
  where: { unitoAId: null, descrizione: { not: null } },
  select: { id: true, nome: true, categoria: true, descrizione: true, note: true, varianti: { select: { id: true, nome: true, note: true } } },
});

let conTaglie = 0, conProdotto = 0, varianti = 0, saltatiScritti = 0;
const esempi = [];
const daScrivere = [];
for (const pr of prodotti) {
  const testo = pulisci(pr.descrizione);
  const perTaglia = notePerTaglia(testo);
  const nota = noteProdotto(testo);
  const varDaScrivere = [];
  for (const v of pr.varianti) {
    const n = perTaglia[canonica(v.nome)];
    if (!n) continue;
    if (v.note && !FORZA) { saltatiScritti++; continue; }
    varDaScrivere.push({ id: v.id, nome: v.nome, note: n });
  }
  const prodDaScrivere = nota && (!pr.note || FORZA) ? nota : null;
  if (!varDaScrivere.length && !prodDaScrivere) continue;
  if (varDaScrivere.length) conTaglie++;
  if (prodDaScrivere) conProdotto++;
  varianti += varDaScrivere.length;
  daScrivere.push({ id: pr.id, note: prodDaScrivere, varianti: varDaScrivere });
  if (esempi.length < 10) esempi.push({ prodotto: pr.nome.slice(0, 34), categoria: pr.categoria, nota: (prodDaScrivere ?? '—').slice(0, 40), taglie: varDaScrivere.map((v) => `${v.nome}: ${v.note}`).join(' · ').slice(0, 80) });
}

console.table(esempi);
console.table([
  { voce: 'prodotti con descrizione', n: prodotti.length },
  { voce: 'con note per TAGLIA ricostruite', n: conTaglie },
  { voce: '→ varianti che ricevono una nota', n: varianti },
  { voce: 'con una nota di PRODOTTO (porzioni, pesi e misure)', n: conProdotto },
  { voce: 'varianti saltate perché la nota c\'era già', n: saltatiScritti },
]);

if (SCRIVI) {
  let np = 0, nv = 0;
  for (const x of daScrivere) {
    if (x.note) { await p.prodotto.update({ where: { id: x.id }, data: { note: x.note } }); np++; }
    for (const v of x.varianti) { await p.variante.update({ where: { id: v.id }, data: { note: v.note } }); nv++; }
  }
  console.log(`SCRITTE: ${np} note di prodotto · ${nv} note di variante`);
} else console.log('PROVA: nulla scritto. `--scrivi` per salvare.');

await p.$disconnect();
