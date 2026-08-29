#!/usr/bin/env node
'use strict';
// Riga di comando: usare l'app senza interfaccia (utile per script e collaudo).
//   node src/cli.js list
//   node src/cli.js recover <device|immagine> <cartella-destinazione> [opzioni]
//   node src/cli.js photorec <device|immagine> <cartella-destinazione>
// Opzioni recover: --carve | --filesystem | --live | --sector=512 | --size=BYTE

const path = require('path');
const { listAll, phoneSearch } = require('./devices');
const { recover } = require('./engine');
const { searchEverywhere } = require('./search');
const photorec = require('./engine/photorec');

function human(n) {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0; let v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
}

async function cmdList() {
  const { disks, phones } = await listAll();
  console.log('\nDISCHI / CHIAVETTE / SCHEDE:');
  if (!disks.length) console.log('  (nessuno — servono i permessi di amministratore?)');
  for (const d of disks) {
    const vols = d.volumes.map((v) => `${v.letter || '?'}:${v.fs || ''}`).join(' ');
    console.log(`  ${d.devicePath}  ${d.model}  ${human(d.size)}  [${d.bus}${d.removable ? ', rimovibile' : ''}]  ${vols}`);
  }
  console.log('\nTELEFONI (MTP):');
  if (!phones.length) console.log('  (nessuno collegato)');
  for (const p of phones) console.log(`  ${p.name}  (${p.type})`);
  console.log(`\nPhotoRec: ${photorec.info().hint}\n`);
}

function parseOpts(argv) {
  const o = { mode: 'auto', includeLive: false, sectorSize: 512, size: 0 };
  for (const a of argv) {
    if (a === '--carve') o.mode = 'carve';
    else if (a === '--filesystem') o.mode = 'filesystem';
    else if (a === '--live') o.includeLive = true;
    else if (a.startsWith('--sector=')) o.sectorSize = Number(a.split('=')[1]) || 512;
    else if (a.startsWith('--size=')) o.size = Number(a.split('=')[1]) || 0;
  }
  return o;
}

async function cmdRecover(target, outDir, rest) {
  if (!target || !outDir) { console.error('Uso: recover <device|immagine> <cartella-destinazione> [--carve|--filesystem|--live]'); process.exit(2); }
  const opts = parseOpts(rest);
  console.log(`\nRecupero da: ${target}\nDestinazione: ${outDir}\nModalita': ${opts.mode}${opts.includeLive ? ' (+ file vivi)' : ''}\n`);
  let lastPct = -1;
  const summary = await recover(target, path.resolve(outDir), Object.assign(opts, {
    onEvent: (ev) => {
      if (ev.type === 'phase') console.log(`\n>> ${ev.label}`);
      else if (ev.type === 'progress' && ev.total) {
        const pct = Math.floor((ev.scanned / ev.total) * 100);
        if (pct !== lastPct) { lastPct = pct; process.stdout.write(`\r   scansione ${pct}%  (${ev.found} inizi trovati)   `); }
      } else if (ev.type === 'file') {
        const f = ev.file;
        console.log(`\n   + ${f.group.padEnd(10)} ${f.name || f.file}  ${human(f.size)}${f.deleted ? '  [cancellato]' : ''}`);
      }
    },
  }));
  console.log(`\n\nFatto. File recuperati: ${summary.files.length}`);
  console.log('Per gruppo:', JSON.stringify(summary.byGroup));
  if (summary.volumes.length) console.log('Volumi:', summary.volumes.map((v) => v.kind).join(', '));
}

async function cmdSearch(pattern, rest) {
  if (!pattern || pattern.length < 3) { console.error('Uso: search <parte-del-nome> [radice...]  (almeno 3 caratteri)'); process.exit(2); }
  const roots = rest.filter((r) => !r.startsWith('--'));
  console.log(`\nCerco "${pattern}" fra i file ESISTENTI ${roots.length ? 'in: ' + roots.join(', ') : 'su tutte le unita\''} e nel Cestino…\n`);
  const results = await searchEverywhere([pattern], {
    roots: roots.length ? roots : undefined,
    onEvent: (ev) => {
      if (ev.type === 'phase') console.log(`>> ${ev.label}`);
      else if (ev.type === 'search-progress') process.stdout.write(`\r   ${ev.files.toLocaleString('it')} file esaminati, ${ev.matches} trovati   `);
      else if (ev.type === 'match') {
        const m = ev.match;
        if (m.source === 'cestino') console.log(`\n   [CESTINO] ${m.name}  (era in: ${m.origine || '?'}; cancellato: ${m.cancellato || '?'})`);
        else console.log(`\n   [ESISTE]  ${m.path}  ${human(m.size)}`);
      }
    },
  });
  console.log(`\n\n${results.length ? results.length + ' file trovati: il file potrebbe NON essere perso.' : 'Niente: il file non esiste piu\' fra i vivi — ha senso il recupero (comando recover).'}`);
}

async function cmdPhone(deviceName, pattern, dest) {
  if (!deviceName || !pattern || pattern.length < 3) { console.error('Uso: phone "<nome telefono>" <parte-del-nome> [cartella-copia]'); process.exit(2); }
  console.log(`\nCerco "${pattern}" dentro "${deviceName}"${dest ? ' (con copia in ' + dest + ')' : ''}…\n`);
  let last = 0;
  const r = await phoneSearch(deviceName, [pattern], {
    copyDest: dest ? path.resolve(dest) : '',
    onMatch: (m) => console.log(`   TROVATO  ${m.path}  ${human(m.size)}`),
    onProgress: (s) => { if (s.files - last >= 2000) { last = s.files; process.stdout.write(`\r   ${s.files.toLocaleString('it')} file esaminati…   `); } },
  });
  if (!r.ok) { console.error('\n' + (r.error || 'Ricerca fallita')); process.exit(1); }
  if (!r.files) console.log('Il telefono non espone alcun file: sbloccalo e imposta USB su "Trasferimento file".');
  else console.log(`\n\nEsaminati ${r.files.toLocaleString('it')} file, trovati ${r.matches.length}${dest ? ', copiati ' + r.copied : ''}.`);
}

async function cmdPhotorec(target, outDir) {
  const inf = photorec.info();
  if (!inf.available) { console.error(inf.hint); process.exit(1); }
  console.log(`PhotoRec: ${inf.path}\nRecupero ${target} -> ${outDir}\n`);
  const r = await photorec.run(target, path.resolve(outDir), (l) => console.log('   ' + l));
  console.log(`\nPhotoRec terminato (codice ${r.code}). File in ${r.outDir}`);
}

async function main() {
  const [cmd, a, b, ...rest] = process.argv.slice(2);
  try {
    if (cmd === 'list') await cmdList();
    else if (cmd === 'search') await cmdSearch(a, [b, ...rest].filter(Boolean));
    else if (cmd === 'recover') await cmdRecover(a, b, rest);
    else if (cmd === 'phone') await cmdPhone(a, b, rest[0]);
    else if (cmd === 'photorec') await cmdPhotorec(a, b);
    else {
      console.log('Recupero dati — comandi:');
      console.log('  node src/cli.js list');
      console.log('  node src/cli.js search <parte-del-nome> [radice...]   # prima di tutto: il file esiste ancora?');
      console.log('  node src/cli.js recover <device|immagine> <destinazione> [--carve|--filesystem|--live]');
      console.log('  node src/cli.js phone "<nome telefono>" <parte-del-nome> [cartella-copia]');
      console.log('  node src/cli.js photorec <device|immagine> <destinazione>');
    }
  } catch (e) { console.error('Errore:', e && e.message || e); process.exit(1); }
}

main();
