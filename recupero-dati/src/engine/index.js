'use strict';
// Orchestratore del recupero. Mette insieme due strategie complementari:
//   1) UNDELETE via filesystem (FAT/exFAT, NTFS sperimentale) -> ritrova i NOMI
//   2) CARVING a firma                                        -> ripesca il contenuto
//      anche quando il filesystem non c'e' piu' (formattazioni, cancellazioni vecchie)
// Emette eventi (fase/progresso/file/fine) per l'interfaccia.

const path = require('path');
const { openReader } = require('../reader');
const { carve } = require('./carver');
const { recoverFilesystem } = require('./fat');
const { prepare } = require('./signatures');

let scanNtfs = null;
try { ({ scanNtfs } = require('./ntfs')); } catch (_) { /* modulo opzionale */ }

async function recover(target, outDir, opts = {}) {
  const onEvent = opts.onEvent || (() => {});
  const mode = opts.mode || 'auto'; // 'auto' | 'carve' | 'filesystem'
  const reader = await openReader(target, { sectorSize: opts.sectorSize || 512, size: opts.size || 0, label: opts.label });

  const summary = { target, outDir, files: [], byCategory: {}, byGroup: {}, volumes: [], size: reader.size };
  const push = (info, group) => {
    const rec = Object.assign({ group }, info);
    summary.files.push(rec);
    const cat = info.category || 'con-nome';
    summary.byCategory[cat] = (summary.byCategory[cat] || 0) + 1;
    summary.byGroup[group] = (summary.byGroup[group] || 0) + 1;
    onEvent({ type: 'file', file: rec });
  };

  try {
    if (mode === 'auto' || mode === 'filesystem') {
      onEvent({ type: 'phase', phase: 'filesystem', label: 'Recupero per filesystem (ritrova i nomi dei file)' });
      const r = await recoverFilesystem(reader, path.join(outDir, 'con-nome'), {
        includeLive: !!opts.includeLive, signal: opts.signal, onFile: (f) => push(f, 'filesystem'),
      });
      summary.volumes = r.volumes;

      if (scanNtfs && (opts.ntfs !== false)) {
        try {
          onEvent({ type: 'phase', phase: 'ntfs', label: 'Recupero NTFS (sperimentale)' });
          await scanNtfs(reader, path.join(outDir, 'ntfs'), {
            includeLive: !!opts.includeLive, signal: opts.signal, onFile: (f) => push(f, 'ntfs'),
          });
        } catch (_) { /* NTFS sperimentale: non deve fermare il resto */ }
      }
    }

    if (mode === 'auto' || mode === 'carve') {
      onEvent({ type: 'phase', phase: 'carving', label: 'Carving a firma (ripesca il contenuto anche senza filesystem)' });
      await carve(reader, path.join(outDir, 'senza-nome'), {
        signatures: prepare(),
        signal: opts.signal,
        onProgress: (scanned, total, found) => onEvent({ type: 'progress', scanned, total, found }),
        onFile: (f) => push(f, 'carving'),
      });
    }
  } finally {
    await reader.close();
  }

  onEvent({ type: 'done', summary });
  return summary;
}

module.exports = { recover };
