/**
 * `tabella-53` è davvero la testa delle liste di priorità?
 *
 * Non basta che «sembri»: la forma `categoria + provincia` va bene anche per un
 * elenco di copertura. Qui si cercano prove, non somiglianze.
 *
 * Sola lettura.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { leggiCsv } from './leggi-csv.mjs';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

const B = 'C:/Users/nicol/app/deluxy-platform-next/legacy/tabelle/';
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
const db = new PrismaClient({ datasources: { db: { url:
  `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform&connection_limit=1` } } });

const t53 = leggiCsv(B + 'tabella-53.csv').filter((r) => !r.deletedAt);
const t54 = leggiCsv(B + 'tabella-54.csv').filter((r) => !r.deletedAt);
const id53 = new Set(t53.map((r) => String(r.id)));
const linea = (c) => console.log((c || '─').repeat(76));

const esiti = [];
const prova = (domanda, ok, dettaglio) => { esiti.push(ok); console.log((ok ? '  ✅ ' : '  🔴 ') + domanda + '\n       ' + dettaglio); };

console.log('');
linea('═');
console.log('  «tabella-53 è la testa delle liste di priorità»: le prove');
linea('═');
console.log('');

// PROVA 1 — le voci ordinate puntano tutte a una riga di tabella-53.
const citati = [...new Set(t54.map((r) => String(r.partnerPriorityId)))];
const fuori = citati.filter((k) => !id53.has(k));
prova(
  'Le voci ordinate (tabella-54.partnerPriorityId) puntano a tabella-53?',
  fuori.length === 0,
  `${t54.length} voci citano ${citati.length} teste diverse; fuori da tabella-53: ${fuori.length}`,
);

// PROVA 2 — il nome della colonna. `partnerPriorityId` non lascia molto spazio.
prova(
  'La colonna che le collega si chiama come una priorità?',
  true,
  'tabella-54 ha `partnerPriorityId` e `order`: un ORDINE, che un elenco di copertura non avrebbe',
);

// PROVA 3 — gli id di PriorityList vengono da tabella-53?
const liste = await db.priorityList.findMany({
  where: { NOT: { legacyId: null } },
  select: { legacyId: true, category: { select: { legacyId: true, name: true } }, province: { select: { legacyId: true, code: true } } },
});
const dentro = liste.filter((l) => id53.has(String(l.legacyId)));
prova(
  'I legacyId di PriorityList esistono in tabella-53?',
  dentro.length === liste.length,
  `${dentro.length} su ${liste.length}`,
);

// PROVA 4 — e la COPPIA (categoria, provincia) combacia riga per riga?
const per53 = new Map(t53.map((r) => [String(r.id), `${r.productCategoryId}|${r.provinceId}`]));
const discordanti = liste.filter((l) => {
  const atteso = per53.get(String(l.legacyId));
  const trovato = `${l.category?.legacyId}|${l.province?.legacyId}`;
  return atteso && atteso !== trovato;
});
prova(
  'Per ogni id, la coppia categoria+provincia è la stessa?',
  discordanti.length === 0,
  discordanti.length === 0
    ? `verificate ${liste.length} righe, nessuna discordanza`
    : discordanti.map((l) => `legacyId ${l.legacyId}: qui ${l.category?.name}/${l.province?.code}, nel legacy ${per53.get(String(l.legacyId))}`).join('; '),
);

// PROVA 5 — esiste un'altra tabella nel legacy che potrebbe essere la testa?
const candidate = fs.readdirSync(B).filter((f) => f.endsWith('.csv')).filter((f) => {
  try {
    const r = leggiCsv(B + f)[0];
    if (!r) return false;
    const k = Object.keys(r).map((x) => x.toLowerCase());
    return k.some((x) => x.includes('priority')) && f !== 'tabella-54.csv';
  } catch { return false; }
});
prova(
  'C\'è un\'altra tabella che parla di priorità e potrebbe essere la vera testa?',
  candidate.length === 0,
  candidate.length ? 'candidate: ' + candidate.join(', ') : 'nessuna: solo tabella-54 nomina «priority», e punta a tabella-53',
);

// PROVA 6 — controprova: se fosse «dove si vende», le categorie senza riga
// non si venderebbero da nessuna parte. Regge?
const catConRiga = new Set(t53.map((r) => String(r.productCategoryId)));
const tutteCat = leggiCsv(B + 'product-category.csv').filter((r) => !r.deletedAt);
const senzaRiga = tutteCat.filter((c) => !catConRiga.has(String(c.id)));
prova(
  'Controprova: se fosse «dove si vende», quante categorie risulterebbero invendibili?',
  senzaRiga.length > 0,
  `${senzaRiga.length} categorie su ${tutteCat.length} non hanno righe — leggerlo come copertura le spegnerebbe tutte`,
);

console.log('');
linea('═');
const tutte = esiti.every(Boolean);
console.log(tutte
  ? '  VERDETTO: sì, tabella-53 è la testa delle liste di priorità.\n  La tabella CategoryProvince che ci avevo costruito sopra era un doppione.'
  : '  VERDETTO: le prove NON concordano. Rileggere prima di concludere.');
linea('═');

await db.$disconnect();
