// Compone le pagine di un PDF scansionato: le «image mask» CCITT vengono
// decodificate da pdf.js e qui si dipingono su una tela unica rispettando la
// matrice di trasformazione, poi si ritagliano in strisce leggibili.
import fs from "node:fs";
import zlib from "node:zlib";
import path from "node:path";

const [, , pdfPath, outDir, zoomArg, altezzaArg] = process.argv;
const ZOOM = Number(zoomArg || 3);
const ALTEZZA = Number(altezzaArg || 260);
const pdfjs = await import("./node_modules/pdfjs-dist/legacy/build/pdf.mjs");
const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(pdfPath)), isEvalSupported: false }).promise;
const nomi = Object.fromEntries(Object.entries(pdfjs.OPS).map(([k, v]) => [v, k]));

function crc32(b) { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return (~c) >>> 0; }
function chunk(t, d) { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([l, td, c]); }
function pngGrigio(w, h, gray) {
  const raw = Buffer.alloc((w + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w + 1)] = 0; gray.copy(raw, y * (w + 1) + 1, y * w, (y + 1) * w); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 0;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}
const mul = (a, b) => [
  a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
];
const risolvi = (objs, nome) => new Promise((res) => {
  try { const v = objs.get(nome, (o) => res(o)); if (v) res(v); } catch { res(null); }
  setTimeout(() => res(null), 15000);
});

for (let n = 1; n <= doc.numPages; n++) {
  const page = await doc.getPage(n);
  const vp = page.getViewport({ scale: ZOOM });
  const W = Math.round(vp.width), H = Math.round(vp.height);
  const tela = Buffer.alloc(W * H, 255);
  const ops = await page.getOperatorList();

  let ctm = [...vp.transform];
  const pila = [];
  for (let k = 0; k < ops.fnArray.length; k++) {
    const op = nomi[ops.fnArray[k]];
    const a = ops.argsArray[k];
    if (op === "save") pila.push([...ctm]);
    else if (op === "restore") ctm = pila.pop() ?? ctm;
    else if (op === "transform") ctm = mul(ctm, a);
    else if (op === "paintImageMaskXObject") {
      const arg = a[0];
      const obj = typeof arg.data === "string" ? await risolvi(page.objs, arg.data) : arg;
      const bits = obj?.data;
      const iw = obj?.width ?? arg.width, ih = obj?.height ?? arg.height;
      if (!bits || !(bits instanceof Uint8Array) || iw < 100) continue;
      // L'immagine occupa il quadrato unitario trasformato dal CTM.
      const xs = [ctm[4], ctm[0] + ctm[4], ctm[2] + ctm[4], ctm[0] + ctm[2] + ctm[4]];
      const ys = [ctm[5], ctm[1] + ctm[5], ctm[3] + ctm[5], ctm[1] + ctm[3] + ctm[5]];
      const x0 = Math.round(Math.min(...xs)), x1 = Math.round(Math.max(...xs));
      const y0 = Math.round(Math.min(...ys)), y1 = Math.round(Math.max(...ys));
      const dw = Math.max(1, x1 - x0), dh = Math.max(1, y1 - y0);
      const perRiga = (iw + 7) >> 3;
      // Polarita': se piu' di meta' dei bit sono accesi, l'inchiostro e' lo zero.
      let accesi = 0;
      for (let i = 0; i < bits.length; i++) { let v = bits[i]; while (v) { accesi += v & 1; v >>= 1; } }
      const inchiostro = accesi > iw * ih * 0.5 ? 0 : 1;
      for (let dy = 0; dy < dh; dy++) {
        const py = y0 + dy;
        if (py < 0 || py >= H) continue;
        const sy = Math.min(ih - 1, Math.floor((dy / dh) * ih));
        for (let dx = 0; dx < dw; dx++) {
          const px = x0 + dx;
          if (px < 0 || px >= W) continue;
          const sx = Math.min(iw - 1, Math.floor((dx / dw) * iw));
          if (((bits[sy * perRiga + (sx >> 3)] >> (7 - (sx & 7))) & 1) === inchiostro) tela[py * W + px] = 0;
        }
      }
    }
  }
  const inchiostro = tela.reduce((s, v) => s + (v === 0 ? 1 : 0), 0) / (W * H);
  console.log(`pagina ${n}: tela ${W}x${H}, inchiostro ${(inchiostro * 100).toFixed(2)}%`);
  for (let s = 0, y0 = 0; y0 < H; s++, y0 += ALTEZZA) {
    const h = Math.min(ALTEZZA, H - y0);
    if (h < 20) break;
    fs.writeFileSync(
      path.join(outDir, `pag${n}-${String(s + 1).padStart(2, "0")}.png`),
      pngGrigio(W, h, Buffer.from(tela.subarray(y0 * W, (y0 + h) * W)))
    );
  }
}
console.log("fatto");
