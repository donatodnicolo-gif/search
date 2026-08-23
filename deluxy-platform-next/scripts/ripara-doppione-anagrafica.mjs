// Ripara il doppione creato nel registro il 23/08/2026 dall'invio della
// piattaforma per il partner "142 RESTAURANT".
//
// Che cosa era successo: la cascata di identita' del registro e'
//   platformId → P.IVA → codice fiscale → nome + citta'
// La piattaforma mandava una P.IVA DIVERSA da quella del registro e NON manda
// la citta', quindi l'ultimo passo cercava «nome + citta' vuota», non trovava
// l'originale (che la citta' ce l'ha) e creava un record nuovo.
//
// Qui si sposta il collegamento sul record giusto e si disattiva il doppione.
// La disattivazione e' un soft delete: reversibile.

import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

const DOPPIONE = 'cmt67ok950000l104xgf1gtt8';
const ORIGINALE = 'cmrv7cy480000l804efdnns2s';
const PARTNER = 'cmt5t89mv004fi6v4kzf7zhrk';

const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
const pia = new PrismaClient({ datasources: { db: { url:
  `postgresql://${u.username}:${u.password}@${u.hostname}:6543/postgres?schema=platform&pgbouncer=true&connection_limit=1` } } });
const imp = Object.fromEntries((await pia.appSetting.findMany()).map((x) => [x.key, x.value]));
await pia.$disconnect();

const base = (imp.anagraficheUrl || 'https://deluxy-anagrafiche.vercel.app').replace(/\/+$/, '');
const key = imp.anagraficheApiKey;
if (!key) { console.log('Chiave del registro non configurata.'); process.exit(1); }

const patch = async (id, body) => {
  const res = await fetch(`${base}/api/v1/partners/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key },
    body: JSON.stringify(body),
  });
  return `HTTP ${res.status} ${(await res.text()).slice(0, 140)}`;
};

// Il platformId è unico: va liberato prima di poterlo riassegnare.
console.log('1. tolgo il platformId dal doppione :', await patch(DOPPIONE, { platformId: null }));
console.log('2. lo metto sull\'originale         :', await patch(ORIGINALE, { platformId: PARTNER }));
console.log('3. disattivo il doppione           :', await patch(DOPPIONE, {
  attivo: false,
  note: 'Doppione creato per errore il 23/08/2026 dalla sync della piattaforma. Il record buono è cmrv7cy480000l804efdnns2s.',
}));
