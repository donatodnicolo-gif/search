/**
 * PREPARA L'EXPORT-DELTA per il riallineamento del 30/08/2026.
 *
 * L'import di casa (`importa-legacy.mjs`) è ripetibile ma AGGIORNA le righe
 * esistenti per legacyId: lanciato sull'export pieno sovrascriverebbe le
 * correzioni fatte in piattaforma (prezzi flessibili, ritiri, payable delle
 * gemelle, paghe ricalcolate) — e sui 3.584 utenti ESTINTI ripristinerebbe i
 * dati personali che l'estinzione ha tolto. Per questo si prepara una
 * cartella `tabelle-delta/` che contiene SOLO le righe nuove: l'import può
 * solo creare, mai toccare.
 *
 * Regola dell'utente (30/08): consegne e servizi mancanti si caricano in
 * autonomia; ogni divergenza sugli esistenti si riporta e si chiede.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const QUI = path.resolve(fileURLToPath(new URL('.', import.meta.url)));
const NUOVO = path.join(QUI, '..', 'legacy-2026-08-30', 'tabelle');
const DELTA = path.join(QUI, '..', 'legacy-2026-08-30', 'tabelle-delta');

function leggiGrezzo(nome) {
  // Si lavora sulle RIGHE ORIGINALI (record interi, con i loro a-capo interni):
  // riscrivere i campi rischierebbe di alterare virgolette e NULL.
  const testo = fs.readFileSync(path.join(NUOVO, `${nome}.csv`), 'utf8');
  const record = []; let corrente = ''; let inStr = false;
  for (let i = 0; i < testo.length; i++) {
    const c = testo[i];
    if (inStr) {
      if (c === '"' && testo[i + 1] === '"') { corrente += '""'; i++; continue; }
      if (c === '"') { inStr = false; corrente += c; continue; }
      corrente += c; continue;
    }
    if (c === '"') { inStr = true; corrente += c; continue; }
    if (c === '\n') { record.push(corrente.replace(/\r$/, '')); corrente = ''; continue; }
    corrente += c;
  }
  if (corrente.trim() !== '') record.push(corrente);
  return record; // record[0] è l'intestazione; le righe restano GREZZE
}
const idDi = (riga) => {
  const m = riga.match(/^"?([0-9]+)"?,/);
  return m ? Number(m[1]) : null;
};

const rigaEnv = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(rigaEnv.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
process.env.DATABASE_URL = `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform`;
const prisma = new PrismaClient();

const legacyIds = async (modello) => new Set((await prisma[modello].findMany({
  where: { legacyId: { not: null } }, select: { legacyId: true } })).map((x) => x.legacyId));

fs.mkdirSync(DELTA, { recursive: true });
const scrivi = (nome, righe) =>
  fs.writeFileSync(path.join(DELTA, `${nome}.csv`), righe.join('\n') + '\n');

// --- 1. Le tabelle da FILTRARE alle sole righe nuove -------------------------
// Consegne: solo le DAVVERO nuove (nate dopo il primo export). Le 541 che il
// primo import scartò di proposito (senza partner o senza data) restano fuori:
// riaprire quella scelta è una decisione dell'utente, non un caricamento.
// Gli id del PRIMO export: una consegna assente in piattaforma ma presente
// anche lì NON è nuova — è una che l'import scartò di proposito.
const vecchioExport = fs.readFileSync(path.join(QUI, '..', 'legacy', 'tabelle', 'delivery.csv'), 'utf8');
const vecchiIds = new Set();
{
  let inStr = false, riga = '';
  for (let i = 0; i < vecchioExport.length; i++) {
    const c = vecchioExport[i];
    if (c === '"' && vecchioExport[i + 1] === '"' && inStr) { riga += '""'; i++; continue; }
    if (c === '"') inStr = !inStr;
    if (c === '\n' && !inStr) { const id = idDi(riga); if (id != null) vecchiIds.add(id); riga = ''; continue; }
    riga += c;
  }
  const id = idDi(riga); if (id != null) vecchiIds.add(id);
}

const filtri = [
  // [csv, modello per i legacyId già in casa, filtro extra]
  ['delivery', 'delivery', (id) => !vecchiIds.has(id)],
  ['user', 'user', null],
  ['customer', 'customer', null],
  ['product', 'product', null],
];
const nuoveConsegne = new Set();
for (const [nome, modello, extra] of filtri) {
  const record = leggiGrezzo(nome);
  const inCasa = await legacyIds(modello);
  const tenute = [record[0]];
  for (const r of record.slice(1)) {
    const id = idDi(r);
    if (id == null || inCasa.has(id)) continue;
    if (extra && !extra(id)) continue;
    tenute.push(r);
    if (nome === 'delivery') nuoveConsegne.add(id);
  }
  scrivi(nome, tenute);
  console.log(`${nome}: ${tenute.length - 1} righe nuove nel delta`);
}

// --- 2. Le righe prodotto: SOLO quelle delle consegne nuove ------------------
// Le righe nuove agganciate a consegne ESISTENTI cambierebbero i loro conti:
// si contano e si riportano, la decisione è dell'utente.
{
  const record = leggiGrezzo('delivery-product');
  const inCasa = await legacyIds('deliveryProduct');
  const testa = record[0].replace(/"/g, '').split(',');
  const posDelivery = testa.indexOf('deliveryId');
  const tenute = [record[0]];
  let perEsistenti = 0;
  for (const r of record.slice(1)) {
    const id = idDi(r);
    if (id == null || inCasa.has(id)) continue;
    // il deliveryId va letto dal record parsato (campo in posizione nota)
    const campi = []; let campo = '', inStr = false;
    for (let i = 0; i < r.length; i++) {
      const c = r[i];
      if (inStr) { if (c === '"' && r[i+1] === '"') { campo += '"'; i++; continue; } if (c === '"') { inStr = false; continue; } campo += c; continue; }
      if (c === '"') { inStr = true; continue; }
      if (c === ',') { campi.push(campo); campo = ''; continue; }
      campo += c;
    }
    campi.push(campo);
    const deliveryId = Number(campi[posDelivery]);
    if (nuoveConsegne.has(deliveryId)) tenute.push(r);
    else perEsistenti++;
  }
  scrivi('delivery-product', tenute);
  console.log(`delivery-product: ${tenute.length - 1} righe per le consegne nuove · ${perEsistenti} righe nuove su consegne ESISTENTI (non nel delta: decisione utente)`);
}

// --- 3. Tutto ciò che le fasi leggono ma NON deve essere toccato -------------
// Sola intestazione: il ciclo dell'import gira zero volte.
for (const nome of ['partner', 'expert', 'operation', 'provinces', 'province-cities',
  'product-category', 'products-variants']) {
  const record = leggiGrezzo(nome);
  scrivi(nome, [record[0]]);
}
console.log('tabelle di riferimento: sola intestazione (zero tocchi)');
await prisma.$disconnect();
