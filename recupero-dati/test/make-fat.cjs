'use strict';
// Costruisce un'immagine FAT32 reale con dentro file veri, poi ne "cancella"
// alcuni come fa Windows: primo byte della voce di directory = 0xE5 e cluster
// liberati nella FAT (il contenuto resta sul disco). Serve a provare l'undelete.

const fs = require('fs');
const path = require('path');
const { lfnChecksum } = require('../src/engine/fat');

const ART = path.join(__dirname, 'artifacts');

const BYTES_PER_SEC = 512;
const SEC_PER_CLUS = 1;
const RSVD = 32;
const NUM_FATS = 2;
const FAT_SZ = 8;                       // settori per FAT
const CLUSTERS = 512;
const CLUSTER_SIZE = BYTES_PER_SEC * SEC_PER_CLUS;
const FIRST_DATA_SEC = RSVD + NUM_FATS * FAT_SZ;   // 48
const TOT_SEC = FIRST_DATA_SEC + CLUSTERS;         // 560
const IMG_SIZE = TOT_SEC * BYTES_PER_SEC;

const clusterByte = (n) => (FIRST_DATA_SEC + (n - 2) * SEC_PER_CLUS) * BYTES_PER_SEC;
const fatByte = (copy, idx) => (RSVD + copy * FAT_SZ) * BYTES_PER_SEC + idx * 4;

function bootSector() {
  const b = Buffer.alloc(512, 0);
  b[0] = 0xeb; b[1] = 0x58; b[2] = 0x90;
  b.write('MSDOS5.0', 3, 'latin1');
  b.writeUInt16LE(BYTES_PER_SEC, 11);
  b.writeUInt8(SEC_PER_CLUS, 13);
  b.writeUInt16LE(RSVD, 14);
  b.writeUInt8(NUM_FATS, 16);
  b.writeUInt16LE(0, 17);          // rootEntCnt = 0 (FAT32)
  b.writeUInt16LE(0, 19);          // totSec16
  b.writeUInt8(0xf8, 21);          // media
  b.writeUInt16LE(0, 22);          // fatSz16 = 0 (FAT32)
  b.writeUInt16LE(63, 24); b.writeUInt16LE(255, 26);
  b.writeUInt32LE(0, 28);
  b.writeUInt32LE(TOT_SEC, 32);
  b.writeUInt32LE(FAT_SZ, 36);
  b.writeUInt32LE(2, 44);          // rootClus
  b.writeUInt16LE(1, 48); b.writeUInt16LE(6, 50);
  b.write('FAT32   ', 82, 'latin1');
  b[510] = 0x55; b[511] = 0xaa;
  return b;
}

function shortEntry(name11, attr, firstClus, size, deleted) {
  const e = Buffer.alloc(32, 0);
  e.write(name11.padEnd(11, ' ').slice(0, 11), 0, 'latin1');
  if (deleted) e[0] = 0xe5;
  e[11] = attr;
  e.writeUInt16LE((firstClus >>> 16) & 0xffff, 20);
  e.writeUInt16LE(firstClus & 0xffff, 26);
  e.writeUInt32LE(size, 28);
  return e;
}

function lfnEntry(seq, chars, checksum, deleted) {
  const e = Buffer.alloc(32, 0xff);
  e[0] = deleted ? 0xe5 : seq;
  e[11] = 0x0f; e[12] = 0x00; e[13] = checksum;
  e[26] = 0x00; e[27] = 0x00;
  const pos = [1, 3, 5, 7, 9, 14, 16, 18, 20, 22, 24, 28, 30];
  for (let k = 0; k < 13; k++) {
    if (k < chars.length) e.writeUInt16LE(chars.charCodeAt(k), pos[k]);
    else if (k === chars.length) e.writeUInt16LE(0x0000, pos[k]);
  }
  return e;
}

function lfnEntriesFor(longName, short11, deleted) {
  const sum = lfnChecksum(Buffer.from(short11.padEnd(11, ' ').slice(0, 11), 'latin1'));
  const n = Math.ceil(longName.length / 13);
  const out = [];
  for (let s = n; s >= 1; s--) {                     // ordine su disco: seq alta per prima
    const chars = longName.slice((s - 1) * 13, s * 13);
    out.push(lfnEntry(s === n ? (0x40 | s) : s, chars, sum, deleted));
  }
  return out;
}

function build() {
  fs.mkdirSync(ART, { recursive: true });
  const img = Buffer.alloc(IMG_SIZE, 0);
  bootSector().copy(img, 0);

  // contenuti
  const contentA = Buffer.from('Sono un file VIVO, non cancellato.\n'.repeat(8), 'utf8'); // ~280 byte, 1 cluster
  const contentB = Buffer.alloc(1000); for (let i = 0; i < contentB.length; i++) contentB[i] = (i * 31 + 7) & 0xff; // 2 cluster
  const contentC = Buffer.alloc(700); for (let i = 0; i < contentC.length; i++) contentC[i] = (i * 17 + 3) & 0xff;  // 2 cluster

  // posiziono i contenuti (contigui)
  contentA.copy(img, clusterByte(3));
  contentB.copy(img, clusterByte(5));
  contentC.copy(img, clusterByte(8));

  // FAT (2 copie): root=EOC, A=EOC, B/C liberati (cancellati)
  const EOC = 0x0fffffff;
  const setFat = (idx, val) => { for (let c = 0; c < NUM_FATS; c++) img.writeUInt32LE(val >>> 0, fatByte(c, idx)); };
  setFat(0, 0x0ffffff8); setFat(1, 0x0fffffff);
  setFat(2, EOC);            // root
  setFat(3, EOC);            // A vivo, 1 cluster
  // 5,6,8,9 restano 0 = liberi (cancellati)

  // voci di directory nella root (cluster 2)
  const entries = [];
  entries.push(shortEntry('LIVE    TXT', 0x20, 3, contentA.length, false));
  // B cancellato con nome lungo
  const shortB = 'FOTODE~1JPG';
  for (const l of lfnEntriesFor('foto delle vacanze.jpg', shortB, true)) entries.push(l);
  entries.push(shortEntry(shortB, 0x20, 5, contentB.length, true));
  // C cancellato con nome corto
  entries.push(shortEntry('SEGRETO PDF', 0x20, 8, contentC.length, true));

  Buffer.concat(entries).copy(img, clusterByte(2));

  const imagePath = path.join(ART, 'fat32-test.img');
  fs.writeFileSync(imagePath, img);

  return {
    imagePath, size: IMG_SIZE, kind: 'FAT32',
    deleted: [
      { hint: 'vacanze', ext: 'jpg', longName: 'foto delle vacanze.jpg', content: contentB },
      { hint: 'EGRETO', ext: 'pdf', longName: 'SEGRETO.PDF (primo carattere perso)', content: contentC },
    ],
    live: [{ name: 'LIVE.TXT', content: contentA }],
  };
}

if (require.main === module) {
  const r = build();
  console.log(`Immagine FAT32 creata: ${r.imagePath} (${r.size} byte)`);
}

module.exports = { build };
