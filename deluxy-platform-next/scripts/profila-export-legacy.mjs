// Profila un export phpMyAdmin del database legacy (app.deluxy.it, MySQL) PRIMA
// di progettare qualsiasi importazione.
//
// Perche' esiste: docs/ANALISI-BACKEND-LEGACY.md descrive 76 entita' lette dal
// CODICE, non dai dati. Sapere che `delivery` ha ~90 colonne non dice quante di
// quelle colonne siano davvero popolate, ne' quali stati esistano per davvero.
// Progettare la mappatura sulla documentazione invece che sui dati e' lo stesso
// errore che il 21/08/2026 e' costato 26 giorni di produzione giu'.
//
// Questo script NON importa niente e non tocca nessun database: legge i file e
// riporta, per ogni tabella: righe, colonne, quanto e' piena ogni colonna, e i
// valori distinti di quelle a bassa cardinalita' (gli enum di fatto: stati,
// tipi, flag).
//
// Accetta i due formati che phpMyAdmin sa produrre:
//   - .sql  (mysqldump: CREATE TABLE + INSERT INTO)
//   - .csv  (una tabella per file, intestazione nella prima riga)
//
// Uso:
//   node C:/Users/nicol/app/deluxy-platform-next/scripts/profila-export-legacy.mjs
//   node .../profila-export-legacy.mjs --cartella C:/percorso/mio --tabella delivery

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opzione = (nome, predefinito) => {
  const i = args.indexOf(`--${nome}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : predefinito;
};

const CARTELLA = opzione('cartella', 'C:/Users/nicol/app/deluxy-platform-next/legacy');
const SOLO = opzione('tabella', null);
const INCROCIA = opzione('incrocia', null);   // es. --incrocia extraType,groupId
const MAX_DISTINTI = 25;   // oltre questa soglia una colonna non e' un enum

// ⚠️ Questi export contengono dati di persone reali: email e nomi di clienti,
// hash di password, token. Il profilatore serve a capire la FORMA dei dati, non
// a leggerli: gli esempi di queste colonne vengono oscurati, cosi' il suo output
// si puo' incollare in una chat o in un documento senza esporre nessuno.
const RISERVATE = /(email|mail|name|surname|nome|cognome|phone|tel|address|indirizzo|password|token|secret|iban|codice|sign)/i;

/** Oscura un valore lasciandone visibile solo la forma. */
function oscura(v, nomeColonna) {
  const s = String(v);
  if (!RISERVATE.test(nomeColonna)) return s;
  if (/^[^@]+@[^@]+$/.test(s)) {                       // email: tengo il dominio
    const [locale, dominio] = s.split('@');
    return `${locale[0]}${'•'.repeat(Math.min(locale.length - 1, 6))}@${dominio}`;
  }
  if (s.length <= 2) return '••';
  return `${s[0]}${'•'.repeat(Math.min(s.length - 1, 9))} (${s.length} car.)`;
}

// ---------------------------------------------------------------- parsing SQL

/**
 * Divide il contenuto di un `VALUES (...),(...)` in tuple, rispettando apici,
 * escape e parentesi dentro le stringhe. Un `split(',')` qui sbaglierebbe su
 * qualunque indirizzo che contiene una virgola.
 */
function tuple(testo) {
  const fuori = [];
  let corrente = [], campo = '', inStringa = false, escape = false, profondita = 0;

  for (const c of testo) {
    if (escape) { campo += c; escape = false; continue; }
    if (inStringa) {
      if (c === '\\') { campo += c; escape = true; continue; }
      if (c === "'") { inStringa = false; campo += c; continue; }
      campo += c; continue;
    }
    if (c === "'") { inStringa = true; campo += c; continue; }
    if (c === '(') { profondita++; if (profondita === 1) { corrente = []; campo = ''; continue; } }
    if (c === ')') {
      profondita--;
      if (profondita === 0) { corrente.push(campo.trim()); fuori.push(corrente); campo = ''; continue; }
    }
    if (c === ',' && profondita === 1) { corrente.push(campo.trim()); campo = ''; continue; }
    if (profondita >= 1) campo += c;
  }
  return fuori;
}

/** Toglie apici ed escape da un valore SQL; NULL diventa null. */
function valore(v) {
  if (v === undefined) return null;
  const t = v.trim();
  if (t === 'NULL' || t === '') return null;
  if (t.startsWith("'") && t.endsWith("'")) {
    return t.slice(1, -1)
      .replace(/\\'/g, "'").replace(/\\"/g, '"')
      .replace(/\\n/g, '\n').replace(/\\r/g, '\r')
      .replace(/\\\\/g, '\\');
  }
  return t;
}

/** Estrae { tabella: {colonne[], righe[][]} } da un dump mysqldump. */
function leggiSql(testo) {
  const tabelle = {};

  // Struttura: CREATE TABLE `x` ( `col` tipo, ... )
  const creates = testo.matchAll(/CREATE TABLE(?: IF NOT EXISTS)? [`"]?(\w+)[`"]?\s*\(([\s\S]*?)\n\)/gi);
  for (const m of creates) {
    const colonne = [];
    for (const riga of m[2].split('\n')) {
      const c = riga.trim().match(/^[`"](\w+)[`"]\s+(\w+)/);
      if (c) colonne.push({ nome: c[1], tipo: c[2] });
    }
    tabelle[m[1]] = { colonne, righe: [] };
  }

  // Dati: INSERT INTO `x` (`a`,`b`) VALUES (...),(...);
  const inserts = testo.matchAll(
    /INSERT INTO [`"]?(\w+)[`"]?\s*(\([^)]*\))?\s*VALUES\s*([\s\S]*?);[\r\n]/gi);
  for (const m of inserts) {
    const nome = m[1];
    tabelle[nome] ??= { colonne: [], righe: [] };
    // Se l'INSERT elenca le colonne, sono piu' attendibili del CREATE.
    if (m[2] && !tabelle[nome].colonne.length) {
      tabelle[nome].colonne = m[2].slice(1, -1).split(',')
        .map((c) => ({ nome: c.trim().replace(/[`"]/g, ''), tipo: '?' }));
    }
    for (const t of tuple(m[3])) tabelle[nome].righe.push(t.map(valore));
  }
  return tabelle;
}

// ---------------------------------------------------------------- parsing CSV

/** CSV con virgolette doppie e campi multiriga. */
function leggiCsv(testo) {
  const righe = [];
  let riga = [], campo = '', inStringa = false;
  for (let i = 0; i < testo.length; i++) {
    const c = testo[i];
    if (inStringa) {
      if (c === '"' && testo[i + 1] === '"') { campo += '"'; i++; continue; }
      if (c === '"') { inStringa = false; continue; }
      campo += c; continue;
    }
    if (c === '"') { inStringa = true; continue; }
    if (c === ',') { riga.push(campo); campo = ''; continue; }
    if (c === '\n') { riga.push(campo); righe.push(riga); riga = []; campo = ''; continue; }
    if (c === '\r') continue;
    campo += c;
  }
  if (campo !== '' || riga.length) { riga.push(campo); righe.push(riga); }
  if (!righe.length) return { colonne: [], righe: [] };
  return {
    colonne: righe[0].map((n) => ({ nome: n.trim(), tipo: '?' })),
    righe: righe.slice(1).filter((r) => r.some((v) => v !== ''))
      .map((r) => r.map((v) => (v === '' || v === 'NULL' ? null : v))),
  };
}

// ---------------------------------------------------------------- profilazione

function profila(nome, { colonne, righe }) {
  console.log(`\n${'='.repeat(72)}`);
  console.log(`TABELLA  ${nome}`);
  console.log(`righe    ${righe.length}   ·   colonne ${colonne.length}`);
  if (!righe.length) { console.log('  (nessuna riga nell\'export)'); return; }
  if (!colonne.length) { console.log('  (colonne sconosciute: l\'export non le dichiara)'); return; }

  console.log('\n  colonna                          piena    distinti  esempio / valori');
  console.log('  ' + '-'.repeat(68));

  for (let i = 0; i < colonne.length; i++) {
    const valori = righe.map((r) => r[i]);
    const pieni = valori.filter((v) => v !== null && v !== '');
    const perc = Math.round((pieni.length / righe.length) * 100);
    const distinti = new Set(pieni.map(String));

    const nomeCol = colonne[i].nome;
    let nota;
    if (pieni.length === 0) {
      nota = '⚠️ SEMPRE VUOTA';
    } else if (distinti.size <= MAX_DISTINTI) {
      // Bassa cardinalita' = enum di fatto: e' l'informazione piu' preziosa.
      // Gli enum non sono dati personali, ma la colonna potrebbe esserlo lo stesso.
      nota = [...distinti].sort()
        .map((v) => { const o = oscura(v, nomeCol); return o.length > 22 ? o.slice(0, 22) + '…' : o; })
        .join(' | ');
    } else {
      const es = oscura(String(pieni[0]).replace(/\s+/g, ' '), nomeCol);
      nota = `(${distinti.size} valori) es. ${es.length > 34 ? es.slice(0, 34) + '…' : es}`;
    }

    const barra = perc === 100 ? '100%' : `${String(perc).padStart(3)}%`;
    console.log(`  ${colonne[i].nome.padEnd(32)} ${barra}  ${String(distinti.size).padStart(8)}  ${nota}`);
  }
}

// ---------------------------------------------------------------- esecuzione

if (!fs.existsSync(CARTELLA)) {
  console.log(`La cartella ${CARTELLA} non esiste.`);
  console.log('Crearla e metterci dentro gli export di phpMyAdmin (.sql o .csv).');
  process.exit(1);
}

const file = fs.readdirSync(CARTELLA).filter((f) => /\.(sql|csv)$/i.test(f));
if (!file.length) {
  console.log(`Nessun .sql o .csv in ${CARTELLA}`);
  console.log('Vedi legacy/README.md per che cosa esportare.');
  process.exit(1);
}

console.log(`Cartella: ${CARTELLA}`);
console.log(`File trovati: ${file.join(', ')}`);

const tutte = {};
for (const f of file) {
  const testo = fs.readFileSync(path.join(CARTELLA, f), 'utf8');
  const dentro = f.toLowerCase().endsWith('.sql')
    ? leggiSql(testo)
    : { [path.basename(f, path.extname(f))]: leggiCsv(testo) };
  for (const [nome, dati] of Object.entries(dentro)) {
    if (tutte[nome]) tutte[nome].righe.push(...dati.righe);
    else tutte[nome] = dati;
  }
}

const nomi = Object.keys(tutte).filter((n) => !SOLO || n === SOLO).sort();
console.log(`\nTabelle nell'export: ${Object.keys(tutte).length}` +
  (SOLO ? ` (mostro solo "${SOLO}")` : ''));

console.log('\nRIEPILOGO:');
for (const n of Object.keys(tutte).sort())
  console.log(`  ${n.padEnd(36)} ${String(tutte[n].righe.length).padStart(8)} righe · ${tutte[n].colonne.length} colonne`);

for (const n of nomi) profila(n, tutte[n]);

/**
 * Incrocia due colonne e conta le combinazioni. Serve a capire le relazioni che
 * il singolo profilo non mostra: es. quali ruoli (`groupId`) corrispondono a
 * quali tipi (`extraType`), o quanti record di ogni tipo hanno una password.
 */
function incrocia(nome, { colonne, righe }, a, b) {
  const ia = colonne.findIndex((c) => c.nome === a);
  const ib = colonne.findIndex((c) => c.nome === b);
  if (ia < 0 || ib < 0) {
    console.log(`\nIncrocio impossibile su ${nome}: manca ${ia < 0 ? a : b}`);
    return;
  }
  const conta = new Map();
  for (const r of righe) {
    // Sulle colonne riservate non conta il valore ma la sua PRESENZA.
    const va = RISERVATE.test(a) ? (r[ia] ? 'valorizzato' : 'vuoto') : String(r[ia] ?? 'NULL');
    const vb = RISERVATE.test(b) ? (r[ib] ? 'valorizzato' : 'vuoto') : String(r[ib] ?? 'NULL');
    const k = `${va} ${vb}`;
    conta.set(k, (conta.get(k) ?? 0) + 1);
  }
  console.log(`\nINCROCIO  ${nome}: ${a} × ${b}`);
  console.log(`  ${a.padEnd(22)} ${b.padEnd(22)} righe`);
  console.log('  ' + '-'.repeat(56));
  for (const [k, n] of [...conta].sort((x, y) => y[1] - x[1])) {
    const [va, vb] = k.split(' ');
    console.log(`  ${va.padEnd(22)} ${vb.padEnd(22)} ${String(n).padStart(6)}`);
  }
}

if (INCROCIA) {
  const [a, b] = INCROCIA.split(',').map((s) => s.trim());
  for (const n of nomi) incrocia(n, tutte[n], a, b);
}

console.log(`\n${'='.repeat(72)}`);
console.log('Le colonne "⚠️ SEMPRE VUOTA" non vanno mappate: nel nuovo schema sarebbero');
console.log('campi finti. Le colonne a bassa cardinalita\' sono gli enum reali:');
console.log('vanno confrontate con api/src/common/enums.ts prima di importare.');
