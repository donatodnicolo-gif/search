'use strict';
// Database delle firme per il "carving" (ripescaggio a firma):
// si scandiscono i byte grezzi del disco cercando l'inizio riconoscibile di un file
// e si determina dove finisce. Ogni voce dice: come inizia, come finisce, quanto puo' essere grande.
//
// end.type:
//   'scanFooter'   -> cerca in avanti la sequenza di chiusura (es. JPEG FF D9)
//   'headerSizeLE' -> la dimensione del file e' scritta nell'intestazione (little-endian)
//   'riff'         -> contenitore RIFF: dimensione a offset 4 (LE) + 8
//   'mp4box'       -> contenitore ISO-BMFF: somma dei box a partire da inizio
//   'sqlite'       -> pageSize * pageCount letti dall'intestazione SQLite
//   'zip'          -> cerca l'End Of Central Directory (PK 05 06) e ne legge il commento
//   'pdf'          -> ultima occorrenza di %%EOF
//   'max'          -> nessun marcatore affidabile: si taglia a maxSize

const MB = 1024 * 1024;

/** @type {Array<any>} */
const SIGNATURES = [
  // ---------------- Immagini ----------------
  { name: 'JPEG', category: 'immagini', ext: 'jpg', magic: 'FFD8FF', end: { type: 'scanFooter', footer: 'FFD9' }, minSize: 128, maxSize: 60 * MB },
  { name: 'PNG',  category: 'immagini', ext: 'png', magic: '89504E470D0A1A0A', end: { type: 'scanFooter', footer: '49454E44AE426082' }, minSize: 64, maxSize: 200 * MB },
  { name: 'GIF',  category: 'immagini', ext: 'gif', magic: '474946383961', end: { type: 'scanFooter', footer: '003B' }, minSize: 32, maxSize: 60 * MB },
  { name: 'GIF87',category: 'immagini', ext: 'gif', magic: '474946383761', end: { type: 'scanFooter', footer: '003B' }, minSize: 32, maxSize: 60 * MB },
  { name: 'BMP',  category: 'immagini', ext: 'bmp', magic: '424D', end: { type: 'headerSizeLE', offset: 2, bytes: 4 }, minSize: 54, maxSize: 200 * MB },
  { name: 'TIFF-LE', category: 'immagini', ext: 'tif', magic: '49492A00', end: { type: 'max' }, minSize: 128, maxSize: 300 * MB },
  { name: 'TIFF-BE', category: 'immagini', ext: 'tif', magic: '4D4D002A', end: { type: 'max' }, minSize: 128, maxSize: 300 * MB },
  { name: 'WEBP', category: 'immagini', ext: 'webp', magic: '52494646', magic2: '57454250', magic2Offset: 8, end: { type: 'riff' }, minSize: 64, maxSize: 200 * MB },
  { name: 'HEIC', category: 'immagini', ext: 'heic', magic: '66747970', magicOffset: 4, magic2: '6865', magic2Offset: 8, end: { type: 'mp4box' }, minSize: 512, maxSize: 200 * MB },
  { name: 'PSD',  category: 'immagini', ext: 'psd', magic: '38425053', end: { type: 'max' }, minSize: 512, maxSize: 500 * MB },
  { name: 'CR2',  category: 'immagini', ext: 'cr2', magic: '49492A00', magic2: '43520200', magic2Offset: 8, end: { type: 'max' }, minSize: 1024, maxSize: 300 * MB },

  // ---------------- Documenti ----------------
  { name: 'PDF',  category: 'documenti', ext: 'pdf', magic: '25504446', end: { type: 'pdf' }, minSize: 64, maxSize: 500 * MB },
  { name: 'OLE2', category: 'documenti', ext: 'doc', magic: 'D0CF11E0A1B11AE1', end: { type: 'max' }, minSize: 512, maxSize: 200 * MB, note: 'doc/xls/ppt/msg legacy' },
  { name: 'RTF',  category: 'documenti', ext: 'rtf', magic: '7B5C72746631', end: { type: 'scanFooter', footer: '7D' }, minSize: 64, maxSize: 100 * MB },

  // ---------------- Archivi (anche docx/xlsx/pptx: sono ZIP) ----------------
  { name: 'ZIP',  category: 'archivi', ext: 'zip', magic: '504B0304', end: { type: 'zip' }, minSize: 64, maxSize: 2000 * MB, note: 'docx/xlsx/pptx/odt/epub sono ZIP' },
  { name: 'RAR4', category: 'archivi', ext: 'rar', magic: '526172211A0700', end: { type: 'max' }, minSize: 64, maxSize: 2000 * MB },
  { name: 'RAR5', category: 'archivi', ext: 'rar', magic: '526172211A070100', end: { type: 'max' }, minSize: 64, maxSize: 2000 * MB },
  { name: '7Z',   category: 'archivi', ext: '7z', magic: '377ABCAF271C', end: { type: 'max' }, minSize: 64, maxSize: 2000 * MB },
  { name: 'GZIP', category: 'archivi', ext: 'gz', magic: '1F8B08', end: { type: 'max' }, minSize: 32, maxSize: 1000 * MB },

  // ---------------- Audio ----------------
  { name: 'MP3-ID3', category: 'audio', ext: 'mp3', magic: '494433', end: { type: 'max' }, minSize: 1024, maxSize: 100 * MB },
  { name: 'WAV', category: 'audio', ext: 'wav', magic: '52494646', magic2: '57415645', magic2Offset: 8, end: { type: 'riff' }, minSize: 44, maxSize: 500 * MB },
  { name: 'FLAC', category: 'audio', ext: 'flac', magic: '664C6143', end: { type: 'max' }, minSize: 1024, maxSize: 500 * MB },
  { name: 'OGG', category: 'audio', ext: 'ogg', magic: '4F676753', end: { type: 'max' }, minSize: 1024, maxSize: 500 * MB },

  // ---------------- Video ----------------
  { name: 'MP4', category: 'video', ext: 'mp4', magic: '66747970', magicOffset: 4, end: { type: 'mp4box' }, minSize: 1024, maxSize: 4000 * MB, note: 'mp4/mov/m4v/m4a' },
  { name: 'AVI', category: 'video', ext: 'avi', magic: '52494646', magic2: '41564920', magic2Offset: 8, end: { type: 'riff' }, minSize: 1024, maxSize: 4000 * MB },
  { name: 'MKV', category: 'video', ext: 'mkv', magic: '1A45DFA3', end: { type: 'max' }, minSize: 1024, maxSize: 4000 * MB, note: 'mkv/webm' },

  // ---------------- Database / posta ----------------
  { name: 'SQLite', category: 'database', ext: 'sqlite', magic: '53514C69746520666F726D6174203300', end: { type: 'sqlite' }, minSize: 512, maxSize: 2000 * MB },
  { name: 'PST', category: 'posta', ext: 'pst', magic: '2142444E', end: { type: 'max' }, minSize: 1024, maxSize: 4000 * MB },
];

// Precompila i Buffer una volta sola.
function prepare(list = SIGNATURES) {
  return list.map((s) => {
    const p = Object.assign({}, s);
    p.magicOffset = s.magicOffset || 0;
    p._magic = Buffer.from(s.magic, 'hex');
    if (s.magic2) { p._magic2 = Buffer.from(s.magic2, 'hex'); p.magic2Offset = s.magic2Offset || 0; }
    if (s.end && s.end.footer) p._footer = Buffer.from(s.end.footer, 'hex');
    return p;
  });
}

module.exports = { SIGNATURES, prepare, MB };
