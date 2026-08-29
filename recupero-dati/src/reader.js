'use strict';
// Lettura a blocchi, SEMPRE in sola lettura.
// Due sorgenti: un file-immagine (.img/.dd/.vhd raw) oppure un dispositivo grezzo
// di Windows (\\.\PhysicalDriveN oppure \\.\X:). Sul dispositivo grezzo le letture
// devono essere allineate al settore: qui allineiamo noi e ritagliamo il pezzo giusto.

const fs = require('fs');

const DEFAULT_SECTOR = 512;

// Le letture usano API sincrone (veloci), ma un recupero lungo DEVE cedere il passo
// all'event loop, altrimenti il server si blocca: niente risposta di avvio, niente
// eventi SSE, niente "Ferma" (bug pagato su un volume da 117 GB). Respiro ogni ~8ms.
let _lastBreath = 0;
async function maybeBreathe() {
  const now = Date.now();
  if (now - _lastBreath > 8) {
    _lastBreath = now;
    await new Promise((r) => setImmediate(r));
  }
}

class BlockReader {
  constructor() {
    this.size = 0;
    this.sectorSize = DEFAULT_SECTOR;
    this.label = '';
    this.readOnly = true;
  }
  // eslint-disable-next-line no-unused-vars
  async read(offset, length) { throw new Error('read() non implementata'); }
  async close() {}
}

class ImageReader extends BlockReader {
  constructor(path, opts = {}) {
    super();
    this.path = path;
    this.sectorSize = opts.sectorSize || DEFAULT_SECTOR;
    this.label = opts.label || path;
  }
  async open() {
    const st = fs.statSync(this.path);
    this.size = st.size;
    this.fd = fs.openSync(this.path, 'r');
    return this;
  }
  async read(offset, length) {
    await maybeBreathe();
    if (offset < 0) { length += offset; offset = 0; }
    if (length <= 0 || offset >= this.size) return Buffer.alloc(0);
    if (offset + length > this.size) length = this.size - offset;
    const buf = Buffer.alloc(length);
    let read = 0;
    while (read < length) {
      const n = fs.readSync(this.fd, buf, read, length - read, offset + read);
      if (n <= 0) break;
      read += n;
    }
    return read === length ? buf : buf.subarray(0, read);
  }
  async close() { if (this.fd != null) { fs.closeSync(this.fd); this.fd = null; } }
}

class RawDeviceReader extends BlockReader {
  // devicePath: '\\\\.\\PhysicalDrive2' oppure '\\\\.\\E:'
  // size va passato da chi enumera i dischi: su \\.\ lo stat spesso torna 0.
  constructor(devicePath, opts = {}) {
    super();
    this.devicePath = devicePath;
    this.sectorSize = opts.sectorSize || DEFAULT_SECTOR;
    this.size = opts.size || 0;
    this.label = opts.label || devicePath;
  }
  async open() {
    // 'r' = sola lettura. Non apriamo MAI in scrittura la sorgente.
    this.fd = fs.openSync(this.devicePath, 'r');
    if (!this.size) {
      try { const st = fs.fstatSync(this.fd); if (st.size) this.size = st.size; } catch (_) { /* device: size 0 */ }
    }
    return this;
  }
  async read(offset, length) {
    await maybeBreathe();
    const ss = this.sectorSize;
    if (offset < 0) { length += offset; offset = 0; }
    if (length <= 0) return Buffer.alloc(0);
    const size = this.size || Number.MAX_SAFE_INTEGER;
    if (offset >= size) return Buffer.alloc(0);

    const start = Math.floor(offset / ss) * ss;          // allineo giu'
    let end = offset + length;
    if (end > size) end = size;
    let alignedEnd = Math.ceil(end / ss) * ss;            // allineo su
    if (this.size && alignedEnd > this.size) {
      // il device e' un multiplo del settore: non leggere oltre l'ultimo settore intero
      alignedEnd = Math.floor(this.size / ss) * ss;
    }
    const readLen = alignedEnd - start;
    if (readLen <= 0) return Buffer.alloc(0);

    const buf = Buffer.alloc(readLen);
    let got = 0;
    try {
      // lettura singola, resta allineata al settore (start e readLen sono multipli)
      got = fs.readSync(this.fd, buf, 0, readLen, start);
    } catch (e) {
      // settore illeggibile (disco danneggiato): torniamo vuoto invece di fermare tutto
      return Buffer.alloc(0);
    }
    if (got <= 0) return Buffer.alloc(0);
    const sliceStart = offset - start;
    const sliceEnd = Math.min(got, sliceStart + length);
    if (sliceEnd <= sliceStart) return Buffer.alloc(0);
    return buf.subarray(sliceStart, sliceEnd);
  }
  async close() { if (this.fd != null) { fs.closeSync(this.fd); this.fd = null; } }
}

// Fabbrica: dato un "target" (percorso file immagine o device path) crea il reader giusto.
function openReader(target, opts = {}) {
  const isDevice = /^\\\\[.?]\\/.test(target) || /^\\\\\.\\/.test(target);
  const reader = isDevice
    ? new RawDeviceReader(target, opts)
    : new ImageReader(target, opts);
  return reader.open();
}

module.exports = { BlockReader, ImageReader, RawDeviceReader, openReader, DEFAULT_SECTOR };
