'use strict';
// Ricerca tra i file ESISTENTI: prima di scomodare il recupero profondo, l'app
// controlla se il file "perso" vive ancora da qualche parte (altre cartelle, altre
// unita', Cestino). E' il primo passo giusto: spesso il file non e' perso affatto.

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// la camminata usa API sincrone (veloci), ma deve cedere il passo all'event loop
// ogni tanto, altrimenti il server non risponde durante la ricerca
const breathe = () => new Promise((r) => setImmediate(r));

// cartelle che non contengono file dell'utente: saltarle rende la ricerca veloce
const SKIP_DIRS = new Set([
  'windows', 'program files', 'program files (x86)', 'programdata',
  '$recycle.bin', 'system volume information', 'node_modules', '.git',
  'winsxs', '$windows.~bt', 'recovery', 'perflogs',
]);

function driveRoots() {
  const roots = [];
  for (let c = 67; c <= 90; c++) { // C..Z
    const r = String.fromCharCode(c) + ':\\';
    try { fs.accessSync(r); roots.push(r); } catch (_) {}
  }
  return roots;
}

function makeMatcher(patterns) {
  const pats = patterns.map((p) => String(p).toLowerCase().trim()).filter(Boolean);
  return (name) => {
    const n = name.toLowerCase();
    for (const p of pats) if (n.includes(p)) return p;
    return null;
  };
}

/**
 * Cerca i pattern (sottostringhe del nome, senza distinzione maiuscole) fra i file
 * vivi. opts: { roots?, onMatch(m), onProgress({dirs,files,matches}), signal, maxMatches? }
 */
async function searchLive(patterns, opts = {}) {
  const roots = (opts.roots && opts.roots.length ? opts.roots : driveRoots());
  const match = makeMatcher(patterns);
  const maxMatches = opts.maxMatches || 5000;
  const state = { dirs: 0, files: 0, matches: 0 };
  const results = [];
  let lastTick = 0;

  const stack = [...roots];
  const visitedLinks = new Set();   // percorsi reali gia' visti arrivando da un link: blocca i cicli
  const seenPaths = new Set();      // niente doppioni se un sottoalbero e' raggiungibile per due strade

  const emit = (full, name, st) => {
    // deduplica sul percorso REALE: lo stesso file raggiunto da due strade
    // (es. via junction) ha stringhe diverse ma un solo percorso fisico
    let key = full;
    try { key = fs.realpathSync(full); } catch (_) {}
    key = key.toLowerCase();
    if (seenPaths.has(key)) return true;
    seenPaths.add(key);
    const m = { source: 'disco', path: full, name, size: st ? st.size : 0, mtime: st ? st.mtime.toISOString() : null };
    results.push(m); state.matches++;
    if (opts.onMatch) opts.onMatch(m);
    return state.matches < maxMatches;
  };

  while (stack.length) {
    if (opts.signal && opts.signal.aborted) break;
    const dir = stack.pop();
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { continue; }
    state.dirs++;
    if (state.dirs % 25 === 0) await breathe();   // lascia respirare il server (SSE, altre richieste)

    for (const e of entries) {
      if (opts.signal && opts.signal.aborted) break;
      const full = path.join(dir, e.name);

      if (e.isSymbolicLink()) {
        // ATTENZIONE: OneDrive e simili sono reparse point che appaiono come "symlink".
        // Non si saltano: si seguono, ma registrando il percorso reale per bloccare i cicli.
        let st = null;
        try { st = fs.statSync(full); } catch (_) { continue; }
        if (st.isDirectory()) {
          if (SKIP_DIRS.has(e.name.toLowerCase())) continue;
          let real = full;
          try { real = fs.realpathSync(full); } catch (_) {}
          const key = real.toLowerCase();
          if (!visitedLinks.has(key)) { visitedLinks.add(key); stack.push(full); }
        } else if (st.isFile()) {
          state.files++;
          if (match(e.name) && !emit(full, e.name, st)) { if (opts.onProgress) opts.onProgress(state); return results; }
        }
        continue;
      }

      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name.toLowerCase())) stack.push(full);
        continue;
      }
      if (!e.isFile()) continue;
      state.files++;
      if (match(e.name)) {
        let st = null;
        try { st = fs.statSync(full); } catch (_) {}
        if (!emit(full, e.name, st)) { if (opts.onProgress) opts.onProgress(state); return results; }
      }
    }
    const now = Date.now();
    if (opts.onProgress && now - lastTick > 400) { lastTick = now; opts.onProgress(state); }
  }
  if (opts.onProgress) opts.onProgress(state);
  return results;
}

// Cestino di Windows (dell'utente corrente, tutte le unita') via Shell COM.
// Asincrono: non deve bloccare il server mentre PowerShell lavora.
function searchRecycleBin(patterns) {
  const script = `
$ErrorActionPreference='SilentlyContinue'
$shell = New-Object -ComObject Shell.Application
$rb = $shell.NameSpace(10)
$out = @()
if ($rb) {
  foreach ($item in $rb.Items()) {
    $out += [pscustomobject]@{
      name = [string]$item.Name
      origine = [string]$rb.GetDetailsOf($item, 1)
      cancellato = [string]$rb.GetDetailsOf($item, 2)
      dim = [string]$rb.GetDetailsOf($item, 3)
    }
  }
}
@($out) | ConvertTo-Json -Depth 3
`;
  return new Promise((resolve) => {
    let out = '';
    let child;
    try {
      child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true });
    } catch (_) { return resolve([]); }
    child.stdout.on('data', (b) => { out += b; });
    child.on('error', () => resolve([]));
    child.on('close', () => {
      let items = [];
      try { const t = out.trim(); if (t) { const v = JSON.parse(t); items = Array.isArray(v) ? v : [v]; } } catch (_) {}
      const match = makeMatcher(patterns);
      resolve(items.filter((it) => it && it.name && match(it.name)).map((it) => ({
        source: 'cestino', path: (it.origine ? it.origine + '\\' : '') + it.name,
        name: it.name, origine: it.origine || '', cancellato: it.cancellato || '', dimTesto: it.dim || '', size: 0, mtime: null,
      })));
    });
  });
}

/**
 * Ricerca completa: Cestino prima (veloce), poi i dischi.
 * Emette gli stessi eventi del recupero: onEvent({type:'match'|'search-progress'|'done'}).
 */
async function searchEverywhere(patterns, opts = {}) {
  const onEvent = opts.onEvent || (() => {});
  const all = [];

  onEvent({ type: 'phase', phase: 'cestino', label: 'Controllo il Cestino' });
  const binned = await searchRecycleBin(patterns);
  for (const m of binned) { all.push(m); onEvent({ type: 'match', match: m }); }

  onEvent({ type: 'phase', phase: 'disco', label: 'Cerco fra i file esistenti su tutte le unita\'' });
  await searchLive(patterns, {
    roots: opts.roots,
    signal: opts.signal,
    maxMatches: opts.maxMatches,
    onMatch: (m) => { all.push(m); onEvent({ type: 'match', match: m }); },
    onProgress: (s) => onEvent({ type: 'search-progress', dirs: s.dirs, files: s.files, matches: s.matches }),
  });

  onEvent({ type: 'done', summary: { patterns, matches: all.length, results: all } });
  return all;
}

module.exports = { searchLive, searchRecycleBin, searchEverywhere, driveRoots };
