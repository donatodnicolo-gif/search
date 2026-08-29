'use strict';
// Carver a firma: legge il dispositivo/immagine dall'inizio alla fine cercando gli
// inizi dei file (le "firme"); per ognuno calcola dove finisce e lo salva nella
// cartella di destinazione (MAI sulla sorgente). Funziona anche sui file cancellati:
// finche' i loro byte non sono stati sovrascritti, sono ancora li' sul disco.

const fs = require('fs');
const path = require('path');
const { prepare } = require('./signatures');

const SCAN_CHUNK = 4 * 1024 * 1024;   // 4 MB per giro di scansione
const WRITE_CHUNK = 4 * 1024 * 1024;
const FOOTER_WIN = 1 * 1024 * 1024;   // finestra per cercare la chiusura

function hexEq(buf, needle) { return buf.length >= needle.length && buf.subarray(0, needle.length).equals(needle); }

// Cerca `needle` in avanti a partire da `from`, entro `maxSpan` byte. Ritorna offset assoluto o -1.
async function scanForward(reader, from, needle, maxSpan) {
  const size = reader.size;
  const overlap = needle.length - 1;
  const limit = Math.min(size, from + maxSpan);
  let pos = from;
  let carry = Buffer.alloc(0);
  let base = from;
  while (pos < limit) {
    const want = Math.min(FOOTER_WIN, limit - pos);
    const buf = await reader.read(pos, want);
    if (!buf.length) break;
    const sb = carry.length ? Buffer.concat([carry, buf]) : buf;
    base = pos - carry.length;
    const idx = sb.indexOf(needle);
    if (idx >= 0) return base + idx;
    carry = overlap > 0 ? sb.subarray(sb.length - overlap) : Buffer.alloc(0);
    pos += buf.length;
  }
  return -1;
}

// Calcola la fine del file che inizia a `start`, secondo la strategia della firma.
// `bound` = inizio della firma successiva: per i tipi senza fine certa si taglia li'
// (cosi' una firma falsa non si ingoia i file che vengono dopo).
async function computeEnd(reader, sig, start, bound) {
  const size = reader.size;
  const cap = Math.min(size, start + sig.maxSize);
  const hardBound = bound == null ? cap : Math.min(cap, bound);
  const end = sig.end || { type: 'max' };

  switch (end.type) {
    case 'scanFooter': {
      const at = await scanForward(reader, start + Math.max(sig._magic.length, 4), sig._footer, sig.maxSize);
      if (at < 0) return null;
      return at + sig._footer.length;
    }
    case 'headerSizeLE': {
      const head = await reader.read(start + end.offset, end.bytes);
      if (head.length < end.bytes) return null;
      const declared = end.bytes === 4 ? head.readUInt32LE(0) : head.readUIntLE(0, end.bytes);
      if (declared < sig.minSize || start + declared > cap) return null;
      return start + declared;
    }
    case 'riff': {
      const head = await reader.read(start + 4, 4);
      if (head.length < 4) return null;
      const total = head.readUInt32LE(0) + 8;
      if (total < sig.minSize || start + total > cap) return null;
      return start + total;
    }
    case 'sqlite': {
      const head = await reader.read(start, 32);
      if (head.length < 32) return null;
      let pageSize = head.readUInt16BE(16);
      if (pageSize === 1) pageSize = 65536;
      const pageCount = head.readUInt32BE(28);
      const total = pageSize * pageCount;
      if (!total || start + total > cap) return null;
      return start + total;
    }
    case 'mp4box': {
      let cursor = start;
      const hardCap = cap;
      while (cursor < hardCap) {
        const box = await reader.read(cursor, 16);
        if (box.length < 8) break;
        let boxSize = box.readUInt32BE(0);
        const type = box.subarray(4, 8);
        // il type deve essere ASCII stampabile
        let printable = true;
        for (const b of type) { if (b < 0x20 || b > 0x7e) { printable = false; break; } }
        if (!printable) break;
        if (boxSize === 1) {
          if (box.length < 16) break;
          boxSize = Number(box.readBigUInt64BE(8));
        } else if (boxSize === 0) {
          // il box arriva fino a fine file
          return hardCap;
        }
        if (boxSize < 8) break;
        cursor += boxSize;
      }
      return cursor > start ? Math.min(cursor, hardCap) : null;
    }
    case 'zip': {
      const eocd = await scanForward(reader, start + 4, Buffer.from('504B0506', 'hex'), sig.maxSize);
      if (eocd < 0) return hardBound; // zip senza EOCD: taglio alla prossima firma
      const tail = await reader.read(eocd + 20, 2);
      const comment = tail.length >= 2 ? tail.readUInt16LE(0) : 0;
      return eocd + 22 + comment;
    }
    case 'pdf': {
      // ultima occorrenza di %%EOF entro la finestra
      const region = Math.min(sig.maxSize, cap - start);
      if (region <= 0) return null;
      // se ragionevole, leggo l'intera regione e uso lastIndexOf
      if (region <= 128 * 1024 * 1024) {
        const buf = await reader.read(start, region);
        const needle = Buffer.from('2525454F46', 'hex'); // %%EOF
        const at = buf.lastIndexOf(needle);
        if (at < 0) return null;
        let e = at + needle.length;
        if (buf[e] === 0x0d) e++;
        if (buf[e] === 0x0a) e++;
        return start + e;
      }
      const at = await scanForward(reader, start + 4, Buffer.from('2525454F46', 'hex'), sig.maxSize);
      return at < 0 ? null : at + 5;
    }
    case 'max':
    default:
      return hardBound;
  }
}

// primo elemento di `arr` (ordinato) strettamente maggiore di x, cercando da `lo`
function firstGreater(arr, x, lo) {
  let hi = arr.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid] > x) hi = mid; else lo = mid + 1; }
  return lo;
}

async function writeRange(reader, start, end, outPath) {
  const fd = fs.openSync(outPath, 'w');
  try {
    let pos = start;
    while (pos < end) {
      const want = Math.min(WRITE_CHUNK, end - pos);
      const buf = await reader.read(pos, want);
      if (!buf.length) break;
      fs.writeSync(fd, buf, 0, buf.length);
      pos += buf.length;
    }
    return pos - start;
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Scansiona `reader` e ripesca i file nella cartella `outDir`.
 * opts: { signatures?, onProgress(scanned,total,found), onFile(fileInfo), maxHeaders?, startOffset? }
 * Ritorna la lista dei file recuperati.
 */
async function carve(reader, outDir, opts = {}) {
  const sigs = opts.signatures || prepare();
  const size = reader.size;
  const overlap = 64; // basta a coprire l'intestazione piu' lunga a cavallo dei chunk
  fs.mkdirSync(outDir, { recursive: true });

  // ---- Fase 1: trova tutti gli inizi candidati ----
  const headers = [];
  const maxHeaders = opts.maxHeaders || 2_000_000;
  let pos = opts.startOffset || 0;
  let carry = Buffer.alloc(0);
  let carryBase = pos;
  let stopped = false;

  while (pos < size) {
    if (opts.signal && opts.signal.aborted) { stopped = true; break; }
    const buf = await reader.read(pos, SCAN_CHUNK);
    if (!buf.length) { pos += reader.sectorSize; continue; }
    const sb = carry.length ? Buffer.concat([carry, buf]) : buf;
    const base = carry.length ? carryBase : pos;

    for (const sig of sigs) {
      const magic = sig._magic;
      let from = 0;
      for (;;) {
        const idx = sb.indexOf(magic, from);
        if (idx < 0) break;
        const start = base + idx - sig.magicOffset;
        if (start >= 0) headers.push({ start, sig });
        from = idx + 1;
        if (headers.length >= maxHeaders) break;
      }
      if (headers.length >= maxHeaders) break;
    }

    carryBase = base + sb.length - overlap;
    carry = sb.subarray(sb.length - overlap);
    pos += buf.length;
    if (opts.onProgress) opts.onProgress(pos, size, headers.length);
    if (headers.length >= maxHeaders) { stopped = true; break; }
  }

  // ---- Fase 2: ordina, deduplica, estrai ----
  headers.sort((a, b) => a.start - b.start);
  const starts = headers.map((h) => h.start);
  const recovered = [];
  const counters = {};
  let carvedUntil = -1;
  const seen = new Set();

  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    if (opts.signal && opts.signal.aborted) break;
    if (h.start <= carvedUntil) continue;          // evita di ripescare pezzi dentro un file gia' preso
    const key = h.start + ':' + h.sig.name;
    if (seen.has(key)) continue;
    seen.add(key);

    // verifica la seconda firma (es. RIFF -> WEBP/WAVE/AVI, ftyp -> heic)
    if (h.sig._magic2) {
      const chk = await reader.read(h.start + h.sig.magic2Offset, h.sig._magic2.length);
      if (!hexEq(chk, h.sig._magic2)) continue;
    }

    // inizio della firma successiva: limite per i tipi senza fine certa
    const k = firstGreater(starts, h.start, i + 1);
    const nextStart = k < starts.length ? starts[k] : reader.size;

    let end;
    try { end = await computeEnd(reader, h.sig, h.start, nextStart); } catch (_) { end = null; }
    if (end == null) continue;
    const len = end - h.start;
    if (len < (h.sig.minSize || 1) || len > h.sig.maxSize) continue;

    const n = (counters[h.sig.ext] = (counters[h.sig.ext] || 0) + 1);
    const fileName = `${h.sig.name}_${String(n).padStart(5, '0')}.${h.sig.ext}`;
    const outPath = path.join(outDir, fileName);
    let written = 0;
    try { written = await writeRange(reader, h.start, end, outPath); } catch (_) { continue; }
    if (written < (h.sig.minSize || 1)) { try { fs.unlinkSync(outPath); } catch (_) {} continue; }

    const info = {
      type: h.sig.name, category: h.sig.category, ext: h.sig.ext,
      offset: h.start, size: written, file: fileName, path: outPath,
    };
    recovered.push(info);
    if (opts.onFile) opts.onFile(info);
    carvedUntil = end - 1;
  }

  return { recovered, stopped, scanned: pos };
}

module.exports = { carve, computeEnd, scanForward };
