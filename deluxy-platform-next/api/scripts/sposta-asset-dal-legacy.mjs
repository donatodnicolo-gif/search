/**
 * PORTA IN CASA I FILE CHE VIVONO ANCORA SU app.deluxy.it.
 *
 * ⚠️ Il dominio `app.deluxy.it` è il LEGACY, e la nuova app ci appoggia ancora
 * 14.952 riferimenti (foto prodotto, ricevute dei valet, foto di consegna,
 * firme, PDF di fattura). Finché stanno lì, spostare il dominio sulla nuova app
 * significa perderli tutti: si copiano prima su Supabase Storage, poi si
 * riscrivono gli indirizzi nel database.
 *
 * Simula di default. Scrive solo con `--applica`. È IDEMPOTENTE: un file già
 * caricato non si riscarica, e una riga già riscritta non si tocca — si può
 * interrompere e ripartire.
 *
 * La chiave di servizio NON sta in nessun file: si chiede alla Management API
 * di Supabase con il PAT, e non viene mai stampata.
 */
import fs from 'node:fs';
import { PrismaClient } from '@prisma/client';

const APPLICA = process.argv.includes('--applica');
const LIMITE = Number((process.argv.find((a) => a.startsWith('--limite=')) ?? '').split('=')[1] || 0);
const PROGETTO = 'zegbztfxisqeowngvgvh';
const BUCKET = 'legacy';
const LEGACY = 'https://app.deluxy.it/api/assets/';

// le colonne che portano un indirizzo del legacy, censite sul database
const COLONNE = [
  { tabella: 'Product', colonna: 'imageUrl' },
  { tabella: 'Delivery', colonna: 'receipt' },
  { tabella: 'Invoice', colonna: 'documentUrl' },
  { tabella: 'Receipt', colonna: 'fileUrl' },
  { tabella: 'Receipt', colonna: 'fileUrlFrom' },
  { tabella: 'Delivery', colonna: 'receiverSign' },
  { tabella: 'Partner', colonna: 'imageUrl' },
];

const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
// ⚠️ 29/08/2026 — La 5432 DIRETTA, non il pooler: con un update per file il
// pooler in transaction mode è caduto a metà corsa (P1001 dopo ~4.000 file) e
// lo script è morto uscendo con codice 0 — un esito 0 non prova che il lavoro
// sia finito, si conta.
process.env.DATABASE_URL = `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform`;
const prisma = new PrismaClient();

const pat = (fs.readFileSync('C:/Users/nicol/scoutwt/deluxy-scout/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('SUPABASE_PAT=')) ?? '').slice('SUPABASE_PAT='.length).trim().replace(/^"|"$/g, '');
if (!pat) { console.error('PAT Supabase non trovato.'); process.exit(1); }

const chiavi = await (await fetch(`https://api.supabase.com/v1/projects/${PROGETTO}/api-keys`, {
  headers: { Authorization: `Bearer ${pat}` },
})).json();
const service = (Array.isArray(chiavi) ? chiavi : []).find((k) => k.name === 'service_role')?.api_key;
if (!service) { console.error('Chiave di servizio non ottenuta.'); process.exit(1); }
const BASE = `https://${PROGETTO}.supabase.co`;
const H = { Authorization: `Bearer ${service}`, apikey: service };

// bucket pubblico: questi file sono già pubblici sul legacy, e la nuova app li
// mostra dentro le pagine. Un bucket privato vorrebbe un URL firmato ovunque.
if (APPLICA) {
  const res = await fetch(`${BASE}/storage/v1/bucket`, {
    method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: BUCKET, id: BUCKET, public: true, file_size_limit: 52428800 }),
  });
  const esito = await res.text();
  console.log('bucket:', res.status === 200 ? 'creato' : `${res.status} ${esito.slice(0, 80)}`);
}

const nuovoUrl = (vecchio) => `${BASE}/storage/v1/object/public/${BUCKET}/${vecchio.slice(LEGACY.length)}`;

let daFare = 0, gia = 0, caricati = 0, falliti = 0, scritti = 0;
const errori = [];

for (const { tabella, colonna } of COLONNE) {
  const righe = await prisma.$queryRawUnsafe(
    `SELECT id, "${colonna}" AS url FROM platform."${tabella}" WHERE "${colonna}" LIKE '%app.deluxy.it%'` +
    (LIMITE ? ` LIMIT ${LIMITE}` : ''));
  console.log(`\n${tabella}.${colonna}: ${righe.length} riferimenti`);
  daFare += righe.length;
  if (!APPLICA) continue;

  // a lotti, con un po' di concorrenza: 15.000 file uno alla volta sono ore
  const LOTTO = 8;
  // Gli indirizzi si scrivono a BLOCCHI (una query ogni 100 file) invece di
  // un update per file: è ciò che aveva messo in ginocchio la connessione.
  let daScrivere = [];
  const scarica = async () => {
    if (!daScrivere.length) return;
    const valori = daScrivere.map((x, k) => k === 0 ? `($${k * 2 + 1}::text, $${k * 2 + 2}::text)` : `($${k * 2 + 1}, $${k * 2 + 2})`).join(',');
    const parametri = daScrivere.flatMap((x) => [x.id, x.url]);
    await prisma.$executeRawUnsafe(
      `UPDATE platform."${tabella}" AS t SET "${colonna}" = v.url
       FROM (VALUES ${valori}) AS v(id, url) WHERE t.id = v.id`, ...parametri);
    scritti += daScrivere.length;
    daScrivere = [];
  };
  for (let i = 0; i < righe.length; i += LOTTO) {
    await Promise.all(righe.slice(i, i + LOTTO).map(async (r) => {
      const url = String(r.url);
      if (!url.startsWith(LEGACY)) return;
      const percorso = url.slice(LEGACY.length);
      const dest = `${BASE}/storage/v1/object/${BUCKET}/${percorso}`;
      try {
        // già in casa? (idempotenza)
        const c = await fetch(`${BASE}/storage/v1/object/info/public/${BUCKET}/${percorso}`);
        if (c.ok) gia++;
        else {
          let file = await fetch(url);
          if (!file.ok && file.status >= 500) file = await fetch(url); // un secondo tentativo
          if (!file.ok) { falliti++; errori.push(`${percorso}: legacy ${file.status}`); return; }
          const buf = Buffer.from(await file.arrayBuffer());
          const up = await fetch(dest, {
            method: 'POST',
            headers: { ...H, 'Content-Type': file.headers.get('content-type') ?? 'application/octet-stream', 'x-upsert': 'true' },
            body: buf,
          });
          if (!up.ok) { falliti++; errori.push(`${percorso}: storage ${up.status} ${(await up.text()).slice(0, 60)}`); return; }
          caricati++;
        }
        daScrivere.push({ id: r.id, url: nuovoUrl(url) });
      } catch (e) { falliti++; errori.push(`${percorso}: ${String(e.message).slice(0, 60)}`); }
    }));
    if (daScrivere.length >= 100) await scarica();
    if ((i + LOTTO) % 400 === 0) console.log(`   ...${Math.min(i + LOTTO, righe.length)}/${righe.length} (caricati ${caricati}, già ${gia}, falliti ${falliti})`);
  }
  await scarica();
}

console.log('\n--- esito ---');
console.log('riferimenti trovati:', daFare);
if (!APPLICA) {
  console.log('PROVA A VUOTO: niente scaricato, niente scritto. Usa --applica (e --limite=N per un assaggio).');
} else {
  console.log('caricati:', caricati, '| già in casa:', gia, '| indirizzi riscritti:', scritti, '| falliti:', falliti);
  if (errori.length) {
    fs.writeFileSync('scripts/errori-asset-legacy.txt', errori.join('\n'));
    console.log('primi errori:', errori.slice(0, 5).join(' | '));
    console.log('elenco completo in scripts/errori-asset-legacy.txt');
  }
}
await prisma.$disconnect();
