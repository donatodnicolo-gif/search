'use strict';
// Server locale: serve l'interfaccia e le API. Lo usano sia il browser sia Electron.
// Il recupero gira qui (Node), con streaming degli eventi via SSE.

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');
const { spawn } = require('child_process');

const { listAll, phoneSearch } = require('./devices');
const { recover } = require('./engine');
const { searchEverywhere } = require('./search');
const photorec = require('./engine/photorec');

const PUBLIC = path.join(__dirname, '..', 'public');
const PORT = Number(process.env.PORT) || 4653;

const jobs = new Map();

function emit(job, ev) {
  job.events.push(ev);
  for (const res of job.clients) { try { res.write(`data: ${JSON.stringify(ev)}\n\n`); } catch (_) {} }
  if (ev.type === 'done' || ev.type === 'error') {
    job.done = true;
    for (const res of job.clients) { try { res.end(); } catch (_) {} }
  }
}

function suggestedOut() {
  const desk = path.join(os.homedir(), 'Desktop');
  const baseDir = fs.existsSync(desk) ? desk : os.homedir();
  return path.join(baseDir, 'Recupero-Dati');
}

function send(res, code, body, type = 'application/json') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve) => {
    let s = ''; req.on('data', (c) => (s += c)); req.on('end', () => { try { resolve(JSON.parse(s || '{}')); } catch (_) { resolve({}); } });
  });
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };

function serveStatic(req, res, pathname) {
  let file = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const full = path.join(PUBLIC, file);
  if (!full.startsWith(PUBLIC)) return send(res, 403, { error: 'no' });
  fs.readFile(full, (err, data) => {
    if (err) return send(res, 404, { error: 'non trovato' });
    res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`);
  const p = u.pathname;

  try {
    if (req.method === 'GET' && p === '/api/devices') {
      const all = await listAll();
      // la lettura grezza dei dischi funziona solo da amministratore: meglio dirlo
      // subito che scoprirlo con una scansione che trova zero file
      let rawAccess = false;
      try { const fd = fs.openSync('\\\\.\\PhysicalDrive0', 'r'); fs.closeSync(fd); rawAccess = true; } catch (_) {}
      return send(res, 200, Object.assign(all, { suggestedOut: suggestedOut(), photorec: photorec.info(), rawAccess }));
    }

    if (req.method === 'POST' && p === '/api/recover') {
      const body = await readBody(req);
      const target = String(body.target || '').trim();
      const outDir = String(body.outDir || '').trim() || suggestedOut();
      if (!target) return send(res, 400, { error: 'Manca il dispositivo o il file immagine.' });
      // sicurezza: non scrivere sulla stessa unita' che stiamo leggendo
      const outLetter = (outDir.match(/^([A-Za-z]):/) || [])[1];
      const tgtLetter = (target.match(/\\\\\.\\([A-Za-z]):/) || [])[1];
      if (outLetter && tgtLetter && outLetter.toUpperCase() === tgtLetter.toUpperCase()) {
        return send(res, 400, { error: 'La cartella di destinazione e\' sulla stessa unita\' da recuperare: scegline un\'altra (mai scrivere sulla sorgente).' });
      }
      const job = { id: crypto.randomUUID(), events: [], clients: new Set(), done: false, controller: new AbortController() };
      jobs.set(job.id, job);
      recover(target, path.resolve(outDir), {
        mode: body.mode || 'auto',
        includeLive: !!body.includeLive,
        sectorSize: Number(body.sectorSize) || 512,
        size: Number(body.size) || 0,
        label: body.label || target,
        signal: job.controller.signal,
        onEvent: (ev) => emit(job, ev),
      }).catch((e) => emit(job, { type: 'error', message: String((e && e.message) || e) }));
      return send(res, 200, { jobId: job.id, outDir: path.resolve(outDir) });
    }

    if (req.method === 'POST' && p === '/api/search') {
      const body = await readBody(req);
      const patterns = Array.isArray(body.patterns) ? body.patterns : String(body.pattern || '').split(/[,;\n]+/);
      const clean = patterns.map((x) => String(x).trim()).filter((x) => x.length >= 3);
      if (!clean.length) return send(res, 400, { error: 'Scrivi almeno 3 caratteri del nome del file.' });
      const job = { id: crypto.randomUUID(), events: [], clients: new Set(), done: false, controller: new AbortController() };
      jobs.set(job.id, job);
      searchEverywhere(clean, {
        roots: Array.isArray(body.roots) && body.roots.length ? body.roots : undefined,
        maxMatches: Number(body.maxMatches) || 2000,
        signal: job.controller.signal,
        onEvent: (ev) => emit(job, ev),
      }).catch((e) => emit(job, { type: 'error', message: String((e && e.message) || e) }));
      return send(res, 200, { jobId: job.id });
    }

    if (req.method === 'POST' && p === '/api/phone-search') {
      const body = await readBody(req);
      const device = String(body.device || '').trim();
      const pattern = String(body.pattern || '').trim();
      if (!device || pattern.length < 3) return send(res, 400, { error: 'Servono il telefono e almeno 3 caratteri del nome.' });
      const copyDest = body.copy ? path.join(String(body.outDir || suggestedOut()), 'telefono') : '';
      const job = { id: crypto.randomUUID(), events: [], clients: new Set(), done: false, controller: new AbortController() };
      jobs.set(job.id, job);
      emit(job, { type: 'phase', phase: 'telefono', label: `Cerco "${pattern}" dentro ${device}` });
      phoneSearch(device, [pattern], {
        copyDest,
        signal: job.controller.signal,
        onMatch: (m) => emit(job, { type: 'match', match: { source: 'telefono', path: m.path, name: m.name, size: m.size, mtime: null } }),
        onProgress: (s) => emit(job, { type: 'search-progress', dirs: 0, files: s.files, matches: 0 }),
      }).then((r) => {
        if (!r.ok) emit(job, { type: 'error', message: r.error || 'Ricerca fallita' });
        else emit(job, { type: 'done', summary: { files: r.files, matches: r.matches.length, copied: r.copied, copyDest } });
      }).catch((e) => emit(job, { type: 'error', message: String((e && e.message) || e) }));
      return send(res, 200, { jobId: job.id, copyDest });
    }

    if (req.method === 'GET' && p.startsWith('/api/events/')) {
      const job = jobs.get(p.split('/').pop());
      if (!job) return send(res, 404, { error: 'job non trovato' });
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      for (const ev of job.events) res.write(`data: ${JSON.stringify(ev)}\n\n`);
      if (job.done) return res.end();
      job.clients.add(res);
      req.on('close', () => job.clients.delete(res));
      return;
    }

    if (req.method === 'POST' && p.startsWith('/api/stop/')) {
      const job = jobs.get(p.split('/').pop());
      if (job) job.controller.abort();
      return send(res, 200, { ok: true });
    }

    if (req.method === 'POST' && p === '/api/open-folder') {
      const body = await readBody(req);
      const dir = String(body.path || '');
      if (dir && fs.existsSync(dir)) {
        // se e' un file, apri la cartella con il file selezionato
        const isFile = fs.statSync(dir).isFile();
        try { spawn('explorer.exe', isFile ? ['/select,' + dir] : [dir], { detached: true }); } catch (_) {}
        return send(res, 200, { ok: true });
      }
      return send(res, 400, { ok: false });
    }

    if (req.method === 'GET' && p.startsWith('/api/')) return send(res, 404, { error: 'api sconosciuta' });

    return serveStatic(req, res, p);
  } catch (e) {
    return send(res, 500, { error: String((e && e.message) || e) });
  }
});

if (require.main === module) {
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`Recupero dati — interfaccia su http://127.0.0.1:${PORT}`);
    console.log('Suggerimento: per leggere i dischi grezzi avvia come AMMINISTRATORE.');
  });
}

module.exports = { server, PORT };
