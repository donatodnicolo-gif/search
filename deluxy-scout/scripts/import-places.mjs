#!/usr/bin/env node
// Importa lead esistenti nella tabella `places` di Supabase da un file CSV.
//
// Uso:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     node scripts/import-places.mjs percorso/lead.csv
//
// Il CSV deve avere l'intestazione (colonne minime: nome, lat, lng).
// Colonne riconosciute:
//   nome, indirizzo, lat, lng, settore, categoria, priorita, zona,
//   linea_ipotizzata, aggancio_apertura, fuoco_espansione, stato
//
// Nota: usa la SERVICE ROLE KEY (solo lato terminale, MAI nell'app). Non committare.
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const file = process.argv[2];

if (!url || !key) {
  console.error('Mancano SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
if (!file) {
  console.error('Uso: node scripts/import-places.mjs <file.csv>');
  process.exit(1);
}

const supabase = createClient(url, key);

// Parser CSV minimale con gestione delle virgolette.
function parseCsv(text) {
  const righe = text.replace(/\r\n/g, '\n').split('\n').filter((r) => r.trim().length);
  const header = splitRiga(righe[0]).map((h) => h.trim().toLowerCase());
  return righe.slice(1).map((r) => {
    const cells = splitRiga(r);
    const obj = {};
    header.forEach((h, i) => (obj[h] = (cells[i] ?? '').trim()));
    return obj;
  });
}

function splitRiga(riga) {
  const out = [];
  let cur = '';
  let dentro = false;
  for (let i = 0; i < riga.length; i++) {
    const c = riga[i];
    if (c === '"') {
      if (dentro && riga[i + 1] === '"') {
        cur += '"';
        i++;
      } else dentro = !dentro;
    } else if (c === ',' && !dentro) {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

function toRecord(row) {
  const num = (v) => (v === '' || v == null ? null : Number(v));
  return {
    nome: row.nome,
    indirizzo: row.indirizzo || null,
    lat: num(row.lat),
    lng: num(row.lng),
    settore: row.settore || null,
    categoria: row.categoria || null,
    // Se priorità/ipotesi non ci sono, l'app le pre-popola da category_rules al primo load.
    priorita: ['P1', 'P2', 'P3'].includes(row.priorita) ? row.priorita : 'P3',
    zona: row.zona || null,
    linea_ipotizzata: row.linea_ipotizzata || null,
    aggancio_apertura: row.aggancio_apertura || null,
    fuoco_espansione: row.fuoco_espansione || null,
    stato: ['da_visitare', 'visitato', 'cliente', 'perso'].includes(row.stato) ? row.stato : 'da_visitare',
  };
}

const rows = parseCsv(readFileSync(file, 'utf8'))
  .map(toRecord)
  .filter((r) => r.nome && r.lat != null && r.lng != null);

console.log(`Trovati ${rows.length} lead validi. Inserimento in corso…`);

const BATCH = 500;
let inseriti = 0;
for (let i = 0; i < rows.length; i += BATCH) {
  const chunk = rows.slice(i, i + BATCH);
  const { error } = await supabase.from('places').insert(chunk);
  if (error) {
    console.error('Errore batch', i, error.message);
    process.exit(1);
  }
  inseriti += chunk.length;
  console.log(`  ${inseriti}/${rows.length}`);
}
console.log('Fatto ✔');
