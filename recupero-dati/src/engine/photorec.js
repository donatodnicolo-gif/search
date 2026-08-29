'use strict';
// Aggancio a PhotoRec/TestDisk (CGSecurity) per i casi difficili. Non lo
// reimplementiamo: se e' installato lo pilotiamo, altrimenti spieghiamo come averlo.
// PhotoRec e' fortissimo sul carving; TestDisk recupera le partizioni perse.

const { spawnSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const DOWNLOAD_URL = 'https://www.cgsecurity.org/wiki/TestDisk_Download';

function which(name) {
  const r = spawnSync('where', [name], { encoding: 'utf8', windowsHide: true });
  if (!r.error && r.status === 0) {
    const line = (r.stdout || '').split(/\r?\n/).find((l) => l.trim());
    if (line) return line.trim();
  }
  return null;
}

// posizioni tipiche in cui l'utente scompatta lo zip di testdisk
function commonPaths() {
  const roots = [process.env['ProgramFiles'], process.env['ProgramFiles(x86)'], 'C:\\', process.env.USERPROFILE].filter(Boolean);
  const out = [];
  for (const r of roots) {
    for (const d of ['testdisk', 'testdisk-7.2', 'testdisk-7.1', 'Downloads\\testdisk-7.2', 'Downloads\\testdisk-7.1']) {
      out.push(path.join(r, d, 'photorec_win.exe'));
    }
  }
  return out;
}

function findPhotorec() {
  const onPath = which('photorec_win.exe') || which('photorec.exe') || which('photorec');
  if (onPath) return onPath;
  for (const p of commonPaths()) { try { if (fs.existsSync(p)) return p; } catch (_) {} }
  return null;
}

function isAvailable() { return !!findPhotorec(); }

function info() {
  const exe = findPhotorec();
  return {
    available: !!exe,
    path: exe || null,
    downloadUrl: DOWNLOAD_URL,
    hint: exe
      ? `PhotoRec trovato: ${exe}`
      : `PhotoRec non installato. Scaricalo (portable, nessuna installazione) da ${DOWNLOAD_URL}, scompatta lo zip e riprova.`,
  };
}

/**
 * Lancia PhotoRec in modo automatico su un target (device path o file immagine).
 * onLine(riga) riceve l'output. Ritorna una Promise con il codice di uscita.
 * I file escono in <outDir>/recup_dir.N con nomi tipo f0000001.jpg.
 */
function run(target, outDir, onLine = () => {}) {
  return new Promise((resolve, reject) => {
    const exe = findPhotorec();
    if (!exe) return reject(new Error('PhotoRec non installato'));
    fs.mkdirSync(outDir, { recursive: true });
    // /log  -> crea photorec.log ; /d <dir> -> destinazione ; /cmd <target> <comandi>
    // "search" avvia il recupero con le opzioni predefinite (whole disk, tutti i tipi)
    const args = ['/log', '/d', path.join(outDir, 'recup'), '/cmd', target, 'search'];
    const child = spawn(exe, args, { windowsHide: true });
    child.stdout.on('data', (b) => String(b).split(/\r?\n/).forEach((l) => l && onLine(l)));
    child.stderr.on('data', (b) => String(b).split(/\r?\n/).forEach((l) => l && onLine(l)));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, outDir }));
  });
}

module.exports = { isAvailable, info, run, findPhotorec, DOWNLOAD_URL };
