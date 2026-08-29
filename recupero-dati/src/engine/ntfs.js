'use strict';
// Undelete NTFS (SPERIMENTALE). Legge la $MFT, trova i record dei file cancellati
// (bit "in uso" azzerato) e ne estrae nome + contenuto. Il contenuto NTFS e' descritto
// da "data runs", quindi qui la frammentazione e' gestita (a differenza di FAT).
// Nota: il carving recupera comunque il CONTENUTO dei file NTFS anche senza questo modulo;
// questo aggiunge i NOMI. Non ancora verificato su volume reale: usare con giudizio.

const fs = require('fs');
const path = require('path');

function readLE(buf, off, size) { let v = 0; for (let i = 0; i < size; i++) v += buf[off + i] * Math.pow(256, i); return v; }
function readSignedLE(buf, off, size) { let v = readLE(buf, off, size); if (size > 0 && (buf[off + size - 1] & 0x80)) v -= Math.pow(256, size); return v; }

function parseNtfsBoot(bs) {
  if (bs.length < 512) return null;
  if (bs.subarray(3, 11).toString('latin1') !== 'NTFS    ') return null;
  const bytesPerSec = bs.readUInt16LE(11);
  const secPerClus = bs.readUInt8(13);
  if (!bytesPerSec || !secPerClus) return null;
  const mftClus = Number(bs.readBigUInt64LE(48));
  const clustersPerRec = bs.readInt8(64);
  const clusterSize = bytesPerSec * secPerClus;
  const recSize = clustersPerRec > 0 ? clustersPerRec * clusterSize : (1 << (-clustersPerRec));
  if (recSize < 42 || recSize > 65536) return null;
  return { kind: 'NTFS', bytesPerSec, secPerClus, clusterSize, mftClus, recSize, mftByte: mftClus * clusterSize };
}

function applyFixups(rec, bytesPerSec) {
  const usaOff = rec.readUInt16LE(4);
  const usaCount = rec.readUInt16LE(6);
  if (!usaOff || usaCount < 1) return rec;
  for (let i = 1; i < usaCount; i++) {
    const sectorEnd = i * bytesPerSec - 2;
    const fixOff = usaOff + i * 2;
    if (sectorEnd + 2 > rec.length || fixOff + 2 > rec.length) break;
    rec[sectorEnd] = rec[fixOff];
    rec[sectorEnd + 1] = rec[fixOff + 1];
  }
  return rec;
}

function parseDataRuns(buf, start) {
  const runs = []; let pos = start; let lcn = 0;
  while (pos < buf.length && buf[pos] !== 0x00) {
    const h = buf[pos++]; const lenSize = h & 0x0f; const offSize = (h >> 4) & 0x0f;
    if (lenSize === 0 || pos + lenSize + offSize > buf.length) break;
    const length = readLE(buf, pos, lenSize); pos += lenSize;
    const sparse = offSize === 0;
    const delta = sparse ? 0 : readSignedLE(buf, pos, offSize); pos += offSize;
    lcn += delta;
    runs.push({ length, lcn: sparse ? null : lcn });
  }
  return runs;
}

function parseRecord(rec, geo) {
  if (rec.subarray(0, 4).toString('latin1') !== 'FILE') return null;
  applyFixups(rec, geo.bytesPerSec);
  const flags = rec.readUInt16LE(22);
  const inUse = (flags & 0x0001) !== 0;
  const isDir = (flags & 0x0002) !== 0;
  let off = rec.readUInt16LE(20);
  let name = null, nameNs = 9, dataResident = null, dataRuns = null, dataSize = 0, hasData = false;

  while (off + 8 <= rec.length) {
    const type = rec.readUInt32LE(off);
    if (type === 0xffffffff) break;
    const len = rec.readUInt32LE(off + 4);
    if (len < 8 || off + len > rec.length) break;
    const nonResident = rec[off + 8];

    if (type === 0x30) { // $FILE_NAME (residente)
      const c = rec.readUInt16LE(off + 20);
      const nl = rec[off + c + 64];
      const ns = rec[off + c + 65];
      const nm = rec.subarray(off + c + 66, off + c + 66 + nl * 2).toString('utf16le');
      if (name == null || (nameNs === 2 && ns !== 2)) { name = nm; nameNs = ns; } // preferisci non-DOS
    } else if (type === 0x80 && rec[off + 9] === 0) { // $DATA senza nome
      hasData = true;
      if (nonResident === 0) {
        const c = rec.readUInt16LE(off + 20);
        const cl = rec.readUInt32LE(off + 16);
        dataResident = Buffer.from(rec.subarray(off + c, off + c + cl));
        dataSize = cl;
      } else {
        const runOff = rec.readUInt16LE(off + 32);
        dataSize = Number(rec.readBigUInt64LE(off + 48));
        dataRuns = parseDataRuns(rec, off + runOff);
      }
    }
    off += len;
  }
  return { inUse, isDir, name, dataResident, dataRuns, dataSize, hasData };
}

async function extractNtfs(reader, geo, base, info, outPath) {
  const fd = fs.openSync(outPath, 'w');
  try {
    if (info.dataResident) {
      const n = Math.min(info.dataResident.length, info.dataSize || info.dataResident.length);
      fs.writeSync(fd, info.dataResident, 0, n); return n;
    }
    if (info.dataRuns && info.dataRuns.length) {
      let remaining = info.dataSize || 0, written = 0;
      for (const run of info.dataRuns) {
        if (remaining <= 0) break;
        if (run.lcn == null) { // sparso: zeri
          let z = Math.min(remaining, run.length * geo.clusterSize);
          const zero = Buffer.alloc(Math.min(z, 1 << 20));
          while (z > 0) { const w = Math.min(z, zero.length); fs.writeSync(fd, zero, 0, w); z -= w; written += w; remaining -= w; }
          continue;
        }
        let left = run.length, clus = run.lcn;
        while (left > 0 && remaining > 0) {
          const want = Math.min(geo.clusterSize, remaining);
          const buf = await reader.read(base + clus * geo.clusterSize, want);
          if (!buf.length) break;
          fs.writeSync(fd, buf, 0, buf.length); written += buf.length; remaining -= buf.length; left--; clus++;
        }
      }
      return written;
    }
    return 0;
  } finally { fs.closeSync(fd); }
}

async function findNtfsVolumes(reader) {
  const out = [];
  const first = await reader.read(0, 512);
  if (parseNtfsBoot(first)) out.push(0);
  if (first.length >= 512 && first[510] === 0x55 && first[511] === 0xaa) {
    for (let i = 0; i < 4; i++) {
      const p = 446 + i * 16;
      const type = first[p + 4];
      const lba = first.readUInt32LE(p + 8);
      if (type === 0x07 && lba) { const off = lba * 512; if (off < reader.size) { const bs = await reader.read(off, 512); if (parseNtfsBoot(bs)) out.push(off); } }
    }
  }
  return [...new Set(out)];
}

async function scanNtfs(reader, outDir, opts = {}) {
  const vols = await findNtfsVolumes(reader);
  if (!vols.length) return { recovered: [], volumes: [] };
  const recovered = [];
  const cap = opts.maxRecords || 300000;

  for (const base of vols) {
    if (opts.signal && opts.signal.aborted) break;
    const geo = parseNtfsBoot(await reader.read(base, 512));
    if (!geo) continue;
    fs.mkdirSync(outDir, { recursive: true });

    // estensioni della $MFT dal record 0
    let extents;
    try {
      const rec0 = parseRecord(Buffer.from(await reader.read(base + geo.mftByte, geo.recSize)), geo);
      extents = (rec0 && rec0.dataRuns && rec0.dataRuns.length)
        ? rec0.dataRuns
        : [{ length: Math.floor((reader.size - base - geo.mftByte) / geo.clusterSize), lcn: Math.floor(geo.mftByte / geo.clusterSize) }];
    } catch (_) {
      extents = [{ length: Math.floor((reader.size - base - geo.mftByte) / geo.clusterSize), lcn: Math.floor(geo.mftByte / geo.clusterSize) }];
    }

    let count = 0; const counters = {};
    for (const run of extents) {
      if (run.lcn == null) continue;
      const runBytes = run.length * geo.clusterSize;
      for (let p = 0; p + geo.recSize <= runBytes && count < cap; p += geo.recSize) {
        if (opts.signal && opts.signal.aborted) return { recovered, volumes: vols };
        count++;
        const buf = await reader.read(base + run.lcn * geo.clusterSize + p, geo.recSize);
        if (buf.length < 4 || buf.subarray(0, 4).toString('latin1') !== 'FILE') continue;
        let info; try { info = parseRecord(Buffer.from(buf), geo); } catch (_) { continue; }
        if (!info || info.isDir || !info.hasData || !info.name) continue;
        const deleted = !info.inUse;
        if (!deleted && !opts.includeLive) continue;
        const safe = info.name.replace(/[<>:"/\\|?*]/g, '_').slice(0, 180) || 'file';
        const n = (counters[safe] = (counters[safe] || 0) + 1);
        const outName = n > 1 ? `(${n}) ${safe}` : safe;
        const outPath = path.join(outDir, outName);
        let written = 0;
        try { written = await extractNtfs(reader, geo, base, info, outPath); } catch (_) { continue; }
        if (written <= 0) { try { fs.unlinkSync(outPath); } catch (_) {} continue; }
        const rec = { name: info.name, file: outName, path: outPath, size: written, deleted, fs: 'NTFS' };
        recovered.push(rec);
        if (opts.onFile) opts.onFile(rec);
      }
    }
  }
  return { recovered, volumes: vols };
}

module.exports = { scanNtfs, parseNtfsBoot, parseRecord, applyFixups, parseDataRuns, findNtfsVolumes };
