// Dice QUALE chiave del registro sta usando la piattaforma, e con quali
// permessi — senza mai stampare il valore della chiave.
//
// Serve a spiegare una contraddizione osservata il 23/08/2026: il POST verso il
// registro rispondeva 200 mentre il PATCH rispondeva 403 «sola lettura», pur
// avendo entrambi lo stesso controllo (`autentica(req, { scrittura: true })`).
//
// Il registro custodisce solo lo SHA-256 della chiave: qui si calcola
// l'impronta di quella salvata in Impostazioni e la si cerca nell'elenco,
// leggendone soltanto nome e permessi.

import fs from 'node:fs';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
const url = (schema) =>
  `postgresql://${u.username}:${u.password}@${u.hostname}:6543/postgres?schema=${schema}&pgbouncer=true&connection_limit=1`;

const pia = new PrismaClient({ datasources: { db: { url: url('platform') } } });
const salvata = (await pia.appSetting.findMany()).find((x) => x.key === 'anagraficheApiKey')?.value ?? '';
await pia.$disconnect();

if (!salvata) { console.log('Nessuna chiave salvata in Impostazioni.'); process.exit(1); }

const sha = (v) => crypto.createHash('sha256').update(v).digest('hex');
const varianti = [
  ['così com\'è salvata', salvata],
  ['con spazi tolti (come fa l\'app)', salvata.trim()],
];
console.log(`chiave salvata: ${salvata.length} caratteri`);
console.log(`spazi/a-capo ai bordi: ${salvata !== salvata.trim() ? 'SI' : 'no'}\n`);

const reg = new PrismaClient({ datasources: { db: { url: url('anagrafiche') } } });
const chiavi = await reg.$queryRawUnsafe(
  'select hash, nome, attiva, scrittura from "anagrafiche"."ApiKey"');
for (const [etichetta, valore] of varianti) {
  const trovata = chiavi.find((k) => k.hash === sha(valore));
  console.log(`${etichetta}:`);
  console.log(trovata
    ? `   → è la chiave "${trovata.nome}" · attiva ${trovata.attiva} · SCRITTURA ${trovata.scrittura ? 'SI' : 'NO'}`
    : '   → non corrisponde a nessuna chiave del registro');
}
await reg.$disconnect();
