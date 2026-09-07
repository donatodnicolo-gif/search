/**
 * LE CHIAVI DI TRADUZIONE USATE NEI TEMPLATE ESISTONO DAVVERO? (04/09/2026)
 *
 * Nato da un difetto ripetuto tre volte in un giorno: una voce nuova infilata
 * nel blocco sbagliato del JSON e in pagina compariva la CHIAVE GREZZA
 * («partnerAnagrafica.linkThis» dentro un bottone). Il typecheck non se ne
 * accorge — i template non li guarda — e nemmeno la build: ngx-translate
 * stampa la chiave e tira dritto.
 *
 * Qui si estraggono le chiavi scritte nei template (`'x.y' | translate`) e si
 * verificano contro it.json e en.json. Esce con codice 1 se ne manca una.
 *
 * Uso: node scripts/controlla-traduzioni.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const radice = path.resolve(process.cwd(), 'src/app');
const file = [];
(function cammina(dir) {
  for (const voce of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, voce.name);
    if (voce.isDirectory()) cammina(p);
    else if (voce.name.endsWith('.ts') || voce.name.endsWith('.html')) file.push(p);
  }
})(radice);

// 'chiave.punto.punto' | translate   →   chiave.punto.punto
const RE = /'([a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_]+)+)'\s*\|\s*translate/g;
const chiavi = new Set();
for (const f of file) {
  const testo = fs.readFileSync(f, 'utf8');
  for (const m of testo.matchAll(RE)) chiavi.add(m[1]);
}

const leggi = (o, p) => p.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o);
let problemi = 0;
for (const lingua of ['it', 'en']) {
  const dizionario = JSON.parse(fs.readFileSync(`public/i18n/${lingua}.json`, 'utf8'));
  const mancanti = [...chiavi].filter((k) => typeof leggi(dizionario, k) !== 'string').sort();
  console.log(`${lingua}: ${chiavi.size} chiavi controllate · mancanti ${mancanti.length}`);
  for (const k of mancanti) console.log(`   ✗ ${k}`);
  problemi += mancanti.length;
}
// ⚠️ Le chiavi COMPOSTE a runtime ('sales.orders.stato.' + x) qui non si vedono:
// il controllo prende quelle scritte per intero, che sono la stragrande
// maggioranza e quelle in cui l'errore capita.
if (problemi) process.exit(1);
console.log('Tutte le chiavi scritte nei template esistono in italiano e in inglese.');
