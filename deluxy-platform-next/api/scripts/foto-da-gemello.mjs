/**
 * ⭐ 13/09/2026 (segnalazione utente: «nella proposta vendita ai partner manca la possibilità di
 * cliccare sul nome prodotto per vedere la foto») — LA FOTO DAL GEMELLO.
 *
 * Il comando c'era già: nel pannello della vendita il nome è un bottone, ma **solo se ci sono foto**
 * («un comando che non fa niente è peggio di nessun comando», regola del 05/09). Sulla proposta #12952
 * restava testo perché il prodotto legato — «Bouquet Pink Grace - Piccolo», sku `SHUXWA1` — non ha
 * l'immagine, mentre lo stesso bouquet con lo sku provinciale (`SHUXWA1xRM`) ce l'ha.
 *
 * Qui la foto si copia dal GEMELLO, e gemello vuol dire due condizioni insieme:
 *  · **stesso nome** esatto (a meno di spazi e maiuscole), e
 *  · **sku parente**: quello di uno è l'inizio di quello dell'altro (`SHUXWA1` → `SHUXWA1xRM`).
 *
 * ⚠️ Le due condizioni servono entrambe. Col solo nome si prende la foto di un prodotto omonimo ma
 * diverso (in archivio ci sono quattro «Bouquet pink grace» di partner diversi); col solo sku si
 * pescano i codici che cominciano uguale per caso. E si preferisce il gemello NON archiviato: la foto
 * di un prodotto vivo è quella che il cliente vede oggi sul sito.
 *
 * Uso:  node scripts/foto-da-gemello.mjs [--applica]
 */
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
require('dotenv').config();

const APPLICA = process.argv.includes('--applica');
const url = new URL(process.env.DATABASE_URL.replace('schema=tasks', 'schema=platform'));
url.searchParams.set('connection_limit', '1');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({ datasources: { db: { url: url.toString() } } });

const norm = (s) => (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const haFoto = (p) => !!(p.imageUrl && p.imageUrl.trim()) || !!(p.images && !['', '[]'].includes(p.images.trim()));

async function main() {
  const tutti = await prisma.product.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, sku: true, imageUrl: true, images: true, archived: true },
  });
  console.log(`prodotti in archivio: ${tutti.length}`);

  const conFoto = tutti.filter(haFoto);
  const senza = tutti.filter((p) => !haFoto(p) && !p.archived);
  console.log(`  con almeno una foto: ${conFoto.length}`);
  console.log(`  SENZA foto e non archiviati: ${senza.length}`);

  const perNome = new Map();
  for (const p of conFoto) {
    const k = norm(p.name);
    if (!perNome.has(k)) perNome.set(k, []);
    perNome.get(k).push(p);
  }

  const proposte = [];
  for (const p of senza) {
    const candidati = (perNome.get(norm(p.name)) ?? []).filter((g) => {
      const a = (p.sku ?? '').trim().toUpperCase();
      const b = (g.sku ?? '').trim().toUpperCase();
      if (!a || !b || a === b) return false;
      return a.startsWith(b) || b.startsWith(a); // sku parente, non solo nome uguale
    });
    if (!candidati.length) continue;
    // Il gemello vivo batte quello archiviato; a pari condizioni, lo sku più corto (il «padre»).
    candidati.sort((x, y) => Number(x.archived) - Number(y.archived) || (x.sku ?? '').length - (y.sku ?? '').length);
    const g = candidati[0];
    proposte.push({ id: p.id, nome: p.name, sku: p.sku, daSku: g.sku, daArchiviato: g.archived, imageUrl: g.imageUrl, images: g.images });
  }

  console.log(`\nDA RIEMPIRE (foto dal gemello): ${proposte.length}`);
  for (const x of proposte.slice(0, 20)) console.log(`  ${String(x.nome).slice(0, 40).padEnd(42)} ${String(x.sku).padEnd(14)} ← ${String(x.daSku).padEnd(14)}${x.daArchiviato ? ' (gemello archiviato)' : ''}`);
  if (proposte.length > 20) console.log(`  … e altri ${proposte.length - 20}`);

  if (!APPLICA) { console.log('\nANTEPRIMA — nulla è stato scritto. Rilanciare con --applica.'); return; }

  writeFileSync(`scripts/foto-da-gemello-${Date.now()}.json`, JSON.stringify(proposte, null, 1));
  for (const x of proposte) {
    await prisma.product.update({
      where: { id: x.id },
      data: { imageUrl: x.imageUrl ?? null, ...(x.images ? { images: x.images } : {}) },
    });
  }
  console.log(`\nFoto copiate: ${proposte.length}`);
}

main().catch((e) => { console.error('ERRORE', e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
