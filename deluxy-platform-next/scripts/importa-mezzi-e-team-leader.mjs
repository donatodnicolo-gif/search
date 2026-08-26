// Importa dal legacy: i MEZZI dei valet (expert-vehicle + tabella-90) nel campo
// Valet.vehicle (piu' mezzi separati da virgola) e le PROVINCE DA TEAM LEADER
// (team-leader-province) in Valet.teamLeaderProvinces (JSON di id Province).
//
// Prova a secco di default; scrive solo con --scrivi. Prima di scrivere salva
// un backup dei valet toccati. Non toglie mai nulla: riempie i vuoti e
// AGGIUNGE le province mancanti (unione), segnalando ogni differenza.
//
//   node scripts/importa-mezzi-e-team-leader.mjs [--scrivi]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const RADICE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { PrismaClient } = require(path.join(RADICE, 'node_modules', '@prisma/client'));
const TABELLE = path.join(RADICE, 'legacy', 'tabelle');
const SCRIVI = process.argv.includes('--scrivi');

// ---- CSV con virgolette e a-capo nei campi -------------------------------
function* righeCsv(testo) {
  let campo = '', riga = [], inQ = false;
  for (let i = 0; i < testo.length; i++) {
    const c = testo[i];
    if (inQ) {
      if (c === '"') { if (testo[i + 1] === '"') { campo += '"'; i++; } else inQ = false; }
      else campo += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { riga.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && testo[i + 1] === '\n') i++;
      riga.push(campo); campo = '';
      if (riga.length > 1 || riga[0] !== '') yield riga;
      riga = [];
    } else campo += c;
  }
  if (campo !== '' || riga.length) { riga.push(campo); yield riga; }
}
function leggi(file) {
  const it = righeCsv(fs.readFileSync(path.join(TABELLE, file), 'utf8'));
  const testa = it.next().value;
  const out = [];
  for (const r of it) out.push(Object.fromEntries(testa.map((h, i) => [h, r[i] === 'NULL' ? null : r[i]])));
  return out;
}

// ---- Connessione (stessa via degli altri script: 5432 diretto) -----------
const rigaEnv = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(rigaEnv.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
const db = new PrismaClient({ datasources: { db: { url:
  `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform&connection_limit=1` } } });

const valets = await db.valet.findMany({ select: {
  id: true, legacyId: true, firstName: true, lastName: true,
  vehicle: true, isTeamLeader: true, teamLeaderProvinces: true,
} });
const perLegacy = new Map(valets.filter((v) => v.legacyId != null).map((v) => [v.legacyId, v]));
const province = new Map((await db.province.findMany({ select: { id: true, legacyId: true, code: true } }))
  .filter((p) => p.legacyId != null).map((p) => [p.legacyId, p]));

// ---- 1) Mezzi -------------------------------------------------------------
// Catalogo legacy (tabella-90) e ordine fisso di presentazione (come la UI).
const nomiMezzo = new Map(leggi('tabella-90.csv').map((r) => [r.id, r.name]));
const ORDINE = ['Auto', 'Bicicletta', 'Furgone', 'Moto/Scooter'];

const mezziPerValet = new Map();
for (const r of leggi('expert-vehicle.csv')) {
  const nome = nomiMezzo.get(r.vehicleId);
  if (!nome) continue;
  const s = mezziPerValet.get(Number(r.expertId)) ?? new Set();
  s.add(nome);
  mezziPerValet.set(Number(r.expertId), s);
}

const daScrivere = new Map(); // valetId -> { dati, note }
let mezziRiempiti = 0, mezziGiaUguali = 0, mezziConflitto = 0, valetAssenti = 0;
for (const [legacyId, mezzi] of mezziPerValet) {
  const v = perLegacy.get(legacyId);
  if (!v) { valetAssenti++; console.log(`  ⚠ mezzi: valet legacy ${legacyId} non in banca`); continue; }
  const valore = ORDINE.filter((m) => mezzi.has(m)).join(', ');
  const attuale = (v.vehicle ?? '').trim();
  if (!attuale) {
    daScrivere.set(v.id, { ...(daScrivere.get(v.id) ?? {}), vehicle: valore });
    mezziRiempiti++;
  } else if (attuale === valore) mezziGiaUguali++;
  else {
    // gia' valorizzato a mano nella nuova app: non si sovrascrive, si segnala
    mezziConflitto++;
    console.log(`  ✋ mezzi diversi per ${v.firstName} ${v.lastName} (legacy ${legacyId}): in banca «${attuale}», nel legacy «${valore}» — lasciato com'e'`);
  }
}

// ---- 2) Province da team leader ------------------------------------------
const tlPerValet = new Map();
for (const r of leggi('team-leader-province.csv')) {
  if (r.deletedAt) continue;
  const p = province.get(Number(r.provinceId));
  if (!p) { console.log(`  ⚠ team leader: provincia legacy ${r.provinceId} non in banca`); continue; }
  const s = tlPerValet.get(Number(r.expertId)) ?? new Set();
  s.add(p.id);
  tlPerValet.set(Number(r.expertId), s);
}

let tlRiempiti = 0, tlUnione = 0, tlGiaUguali = 0, tlFlagAccesi = 0;
for (const [legacyId, provNuove] of tlPerValet) {
  const v = perLegacy.get(legacyId);
  if (!v) { console.log(`  ⚠ team leader: valet legacy ${legacyId} non in banca`); continue; }
  let attuali = [];
  try { attuali = JSON.parse(v.teamLeaderProvinces ?? '[]') ?? []; } catch { attuali = []; }
  const mancanti = [...provNuove].filter((id) => !attuali.includes(id));
  const voce = daScrivere.get(v.id) ?? {};
  if (!attuali.length && mancanti.length) {
    voce.teamLeaderProvinces = JSON.stringify([...provNuove]);
    tlRiempiti++;
  } else if (mancanti.length) {
    voce.teamLeaderProvinces = JSON.stringify([...attuali, ...mancanti]);
    tlUnione++;
    const codici = mancanti.map((id) => [...province.values()].find((p) => p.id === id)?.code ?? id);
    console.log(`  ＋ ${v.firstName} ${v.lastName} (legacy ${legacyId}): aggiungo ${codici.join(', ')} alle ${attuali.length} gia' presenti`);
  } else { tlGiaUguali++; }
  if (!v.isTeamLeader) {
    voce.isTeamLeader = true;
    tlFlagAccesi++;
    console.log(`  ⚑ ${v.firstName} ${v.lastName} (legacy ${legacyId}): nel legacy e' team leader, accendo il flag`);
  }
  if (Object.keys(voce).length) daScrivere.set(v.id, voce);
}

console.log(`\nMEZZI: ${mezziPerValet.size} valet nel legacy → da riempire ${mezziRiempiti}, gia' uguali ${mezziGiaUguali}, conflitti lasciati ${mezziConflitto}, valet assenti ${valetAssenti}`);
console.log(`TEAM LEADER: ${tlPerValet.size} valet nel legacy → da riempire ${tlRiempiti}, da unire ${tlUnione}, gia' coperti ${tlGiaUguali}, flag da accendere ${tlFlagAccesi}`);
console.log(`Valet da aggiornare in tutto: ${daScrivere.size}`);

if (!SCRIVI) {
  console.log('\nPROVA A SECCO: nessuna scrittura. Rilanciare con --scrivi per applicare.');
} else if (daScrivere.size) {
  // Backup dei valet che stiamo per toccare.
  const backup = valets.filter((v) => daScrivere.has(v.id));
  const fileBackup = path.join(TABELLE, '..', `backup-valet-mezzi-tl-${new Date().toISOString().slice(0, 10)}.json`);
  fs.writeFileSync(fileBackup, JSON.stringify(backup, null, 2));
  console.log(`\nBackup di ${backup.length} valet in ${fileBackup}`);
  let fatti = 0;
  for (const [id, dati] of daScrivere) {
    await db.valet.update({ where: { id }, data: dati });
    if (++fatti % 50 === 0) process.stdout.write(`  aggiornati ${fatti}/${daScrivere.size}…`);
  }
  console.log(`\nAggiornati ${fatti} valet.`);
}
await db.$disconnect();
