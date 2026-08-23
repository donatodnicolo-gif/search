// Quante tabelle contiene davvero l'export unico, e quali NON sono finite
// nella cartella tabelle/.
//
// Nato da un dubbio dell'utente il 23/08/2026: «la fee per 142 e' sbagliata,
// sei sicuro di averla importata giusta?». La fee dei partner non e' 0 solo su
// 142: e' 0 su tutti e 267, perche' la colonna non compare da nessuna parte fra
// le tabelle divise. Prima di concludere che il database originario non ce
// l'ha, va escluso che lo splitter abbia perso il blocco che la contiene:
// l'export ha 92 intestazioni, la cartella 75 file.
//
// Non scrive niente: legge e conta.
import fs from 'node:fs';
import readline from 'node:readline';
import path from 'node:path';

const BASE = 'C:/Users/nicol/app/deluxy-platform-next/legacy';
const intestazione = (l) => /^"[a-zA-Z_]+"(,"[a-zA-Z_]+")*$/.test(l);

// Firme dei file gia' divisi: intestazione -> nome del file
const suDisco = new Map();
for (const f of fs.readdirSync(path.join(BASE, 'tabelle'))) {
  if (!f.endsWith('.csv')) continue;
  const prima = fs.readFileSync(path.join(BASE, 'tabelle', f), 'utf8').split('\n', 1)[0].trim();
  suDisco.set(prima, f);
}

const rl = readline.createInterface({ input: fs.createReadStream(path.join(BASE, 'deluxy.csv'), 'utf8'), crlfDelay: Infinity });
const blocchi = [];
let corrente = null;
for await (const riga of rl) {
  const l = riga.trim();
  if (intestazione(l)) { corrente = { n: blocchi.length + 1, testa: l, righe: 0 }; blocchi.push(corrente); }
  else if (corrente && l) corrente.righe++;
}

const persi = blocchi.filter((b) => !suDisco.has(b.testa));
console.log(`blocchi nell'export: ${blocchi.length} · file su disco: ${suDisco.size} · NON divisi: ${persi.length}\n`);
for (const b of persi)
  console.log(`  #${String(b.n).padStart(2)} · ${String(b.righe).padStart(7)} righe · ${b.testa.slice(0, 150)}`);

const cercate = /fee|percent|commission|provv/i;
const sospetti = persi.filter((b) => cercate.test(b.testa));
console.log(`\nFra i persi, quelli che parlano di fee/percentuali: ${sospetti.length}`);
for (const b of sospetti) console.log(`  #${b.n}: ${b.testa}`);
