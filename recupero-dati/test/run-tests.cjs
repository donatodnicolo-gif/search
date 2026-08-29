'use strict';
// Verifica reale del motore:
//  1) carving a firma su immagine finta (file cancellati senza filesystem)
//  2) undelete FAT32 su immagine formattata (recupero di NOME + contenuto)

const fs = require('fs');
const path = require('path');
const { build: buildCarve } = require('./make-image.cjs');
const { build: buildFat } = require('./make-fat.cjs');
const { openReader } = require('../src/reader');
const { carve } = require('../src/engine/carver');
const { recoverFilesystem } = require('../src/engine/fat');
const { parseRecord } = require('../src/engine/ntfs');

function eq(a, b) { return a.length === b.length && a.equals(b); }

async function testCarve() {
  console.log('== 1) Carving a firma ==');
  const img = buildCarve();
  console.log(`   immagine ${img.size} byte, ${img.expected.length} file nascosti senza filesystem`);
  const outDir = path.join(__dirname, 'artifacts', 'recuperati-carve');
  fs.rmSync(outDir, { recursive: true, force: true });
  const reader = await openReader(img.imagePath, { sectorSize: 512 });
  const { recovered } = await carve(reader, outDir, {});
  await reader.close();

  const bufs = recovered.map((r) => ({ r, buf: fs.readFileSync(r.path) }));
  let pass = 0; const fails = [];
  for (const exp of img.expected) {
    const orig = fs.readFileSync(path.join(img.originalsDir, exp.name));
    const m = bufs.find((x) => x.r.type === exp.type && eq(x.buf, orig));
    if (m) { pass++; console.log(`   OK   ${exp.name.padEnd(18)} -> ${m.r.file}`); }
    else { fails.push(exp.name); console.log(`   FAIL ${exp.name}`); }
  }
  console.log(`   -> ${pass}/${img.expected.length} identici\n`);
  return fails.length === 0;
}

async function testFat() {
  console.log('== 2) Undelete FAT32 (nome + contenuto) ==');
  const fat = buildFat();
  console.log(`   immagine FAT32 ${fat.size} byte`);
  const outDir = path.join(__dirname, 'artifacts', 'recuperati-fat');
  fs.rmSync(outDir, { recursive: true, force: true });
  const reader = await openReader(fat.imagePath, { sectorSize: 512 });
  const { recovered, volumes } = await recoverFilesystem(reader, outDir, { includeLive: true });
  await reader.close();

  console.log(`   volumi trovati: ${volumes.map((v) => v.kind).join(', ') || 'nessuno'}`);
  for (const r of recovered) console.log(`   - ${r.deleted ? '[CANC]' : '[vivo]'} "${r.name}" -> ${r.file} (${r.size} byte)`);

  let ok = true;
  for (const d of fat.deleted) {
    const m = recovered.find((r) => r.deleted && eq(fs.readFileSync(r.path), d.content));
    if (m) console.log(`   OK   cancellato "${d.longName}" recuperato come "${m.name}" (contenuto identico)`);
    else { ok = false; console.log(`   FAIL cancellato "${d.longName}" NON recuperato identico`); }
  }
  // il nome lungo del file cancellato deve tornare intero
  const vac = recovered.find((r) => /vacanze/i.test(r.name));
  if (vac) console.log(`   OK   nome lungo ricostruito: "${vac.name}"`);
  else { ok = false; console.log('   FAIL nome lungo "foto delle vacanze.jpg" non ricostruito'); }
  console.log('');
  return ok;
}

// costruisce un record NTFS "FILE" fatto a mano: file CANCELLATO, con nome lungo
// ($FILE_NAME) e contenuto residente ($DATA), piu' i fixup della Update Sequence Array.
function buildNtfsRecord() {
  const dataStr = 'contenuto residente ntfs';
  const name = 'prova.txt';
  const rec = Buffer.alloc(1024, 0);
  rec.write('FILE', 0, 'latin1');
  rec.writeUInt16LE(48, 4);        // offset USA
  rec.writeUInt16LE(3, 6);         // conteggio USA (1 USN + 2 fixup)
  rec.writeUInt16LE(0x0000, 22);   // flags: bit0=0 -> CANCELLATO
  rec.writeUInt16LE(56, 20);       // primo attributo
  // USA: USN + due valori di fixup reali
  rec[48] = 0xcd; rec[49] = 0xab;  // USN
  rec[50] = 0x34; rec[51] = 0x12;  // fixup settore 1
  rec[52] = 0x78; rec[53] = 0x56;  // fixup settore 2
  rec[510] = 0xcd; rec[511] = 0xab; rec[1022] = 0xcd; rec[1023] = 0xab; // tail = USN

  // $FILE_NAME @56 (residente)
  let o = 56;
  rec.writeUInt32LE(0x30, o); rec.writeUInt32LE(112, o + 4); rec[o + 8] = 0;
  rec.writeUInt32LE(84, o + 16); rec.writeUInt16LE(24, o + 20);
  const c = o + 24;
  rec[c + 64] = name.length; rec[c + 65] = 1; rec.write(name, c + 66, 'utf16le');
  // $DATA @168 (residente)
  o = 168;
  rec.writeUInt32LE(0x80, o); rec.writeUInt32LE(48, o + 4); rec[o + 8] = 0; rec[o + 9] = 0;
  rec.writeUInt32LE(dataStr.length, o + 16); rec.writeUInt16LE(24, o + 20);
  rec.write(dataStr, o + 24, 'utf8');
  // fine attributi
  rec.writeUInt32LE(0xffffffff, 216);
  return { rec, name, dataStr };
}

function testNtfs() {
  console.log('== 3) Parser record NTFS (nome + dati residenti + fixup) ==');
  const { rec, name, dataStr } = buildNtfsRecord();
  const info = parseRecord(rec, { bytesPerSec: 512 });
  let ok = true;
  const check = (cond, msg) => { console.log(`   ${cond ? 'OK  ' : 'FAIL'} ${msg}`); if (!cond) ok = false; };
  check(info && info.name === name, `nome ricostruito = "${info && info.name}"`);
  check(info && info.inUse === false, 'record riconosciuto come CANCELLATO');
  check(info && info.dataResident && info.dataResident.toString('utf8') === dataStr, 'contenuto residente estratto');
  check(rec[510] === 0x34 && rec[1022] === 0x78, 'fixup della Update Sequence Array applicati');
  console.log('');
  return ok;
}

async function testSearch() {
  console.log('== 4) Ricerca fra i file esistenti ==');
  const { searchLive } = require('../src/search');
  const root = path.join(__dirname, 'artifacts', 'albero-ricerca');
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(path.join(root, 'sotto', 'profondo'), { recursive: true });
  fs.mkdirSync(path.join(root, 'node_modules', 'pacchetto'), { recursive: true });
  fs.writeFileSync(path.join(root, 'IMG-20240314-WA0011.jpg'), 'x');
  fs.writeFileSync(path.join(root, 'sotto', 'profondo', '20240314-WA0011.jpg'), 'xx');
  fs.writeFileSync(path.join(root, 'sotto', 'altro.txt'), 'x');
  fs.writeFileSync(path.join(root, 'node_modules', 'pacchetto', 'WA0011-dentro-node-modules.js'), 'x'); // va saltato

  // caso OneDrive: cartella raggiungibile solo attraverso una junction (reparse point).
  // La junction NON va saltata come un symlink qualsiasi, ma seguita senza creare cicli.
  const fuori = path.join(__dirname, 'artifacts', 'albero-fuori');
  fs.rmSync(fuori, { recursive: true, force: true });
  fs.mkdirSync(fuori, { recursive: true });
  fs.writeFileSync(path.join(fuori, 'VID-20240314-WA0011.mp4'), 'xxx');
  let junctionOk = true;
  try { fs.symlinkSync(fuori, path.join(root, 'CloudDrive'), 'junction'); }
  catch (_) { junctionOk = false; }
  // ciclo: junction che punta alla radice stessa (non deve mandare in loop)
  try { fs.symlinkSync(root, path.join(root, 'sotto', 'ciclo'), 'junction'); } catch (_) {}

  const found = await searchLive(['wa0011'], { roots: [root] });
  let ok = true;
  const check = (cond, msg) => { console.log(`   ${cond ? 'OK  ' : 'FAIL'} ${msg}`); if (!cond) ok = false; };
  const attesi = junctionOk ? 3 : 2;
  check(found.length === attesi, `trovati ${found.length}/${attesi} file attesi (senza doppioni, nonostante il ciclo)`);
  check(found.some((m) => m.name === '20240314-WA0011.jpg'), 'trovato il file annidato');
  if (junctionOk) check(found.some((m) => m.name === 'VID-20240314-WA0011.mp4'), 'trovato il file dietro la junction (caso OneDrive)');
  check(!found.some((m) => m.path.includes('node_modules')), 'node_modules saltata');
  console.log('');
  return ok;
}

async function main() {
  console.log('===== Recupero dati — verifica del motore =====\n');
  const a = await testCarve();
  const b = await testFat();
  const c = testNtfs();
  const d = await testSearch();
  if (a && b && c && d) { console.log('TUTTO OK — carving + undelete FAT32 + parser NTFS + ricerca verificati.'); }
  else { console.error('QUALCOSA E\' FALLITO.'); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });
