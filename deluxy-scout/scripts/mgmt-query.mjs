#!/usr/bin/env node
// Esegue un file .sql sul database Supabase tramite la Management API.
// Uso: SUPABASE_PAT=sbp_... node scripts/mgmt-query.mjs <file.sql | -e "SQL inline">
//
// Non richiede la password del DB: usa il Personal Access Token dell'account.
// Il token NON viene mai scritto su file: si passa via variabile d'ambiente.
import { readFileSync } from 'node:fs';

const PROJECT_REF = process.env.SUPABASE_REF || 'fdsziebgkljfsugqqbqd';
const PAT = process.env.SUPABASE_PAT;

if (!PAT) {
  console.error('Manca SUPABASE_PAT');
  process.exit(1);
}

let query;
if (process.argv[2] === '-e') {
  query = process.argv[3];
} else if (process.argv[2]) {
  query = readFileSync(process.argv[2], 'utf8');
} else {
  console.error('Uso: node scripts/mgmt-query.mjs <file.sql | -e "SQL">');
  process.exit(1);
}

const res = await fetch(
  `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
  {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PAT}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  },
);

const text = await res.text();
if (!res.ok) {
  console.error(`ERRORE ${res.status}: ${text}`);
  process.exit(1);
}
console.log(`OK ${res.status}`);
// Stampa il risultato (righe) se presente.
try {
  const json = JSON.parse(text);
  console.log(JSON.stringify(json, null, 2).slice(0, 2000));
} catch {
  console.log(text.slice(0, 2000));
}
