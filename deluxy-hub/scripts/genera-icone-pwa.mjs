// Genera le icone PWA di un'app Deluxy: quadrato scuro con una lettera oro,
// come il logo del Hub. Riusabile: `node scripts/genera-icone-pwa.mjs <LETTERA> [cartella]`.
// Produce icon-192, icon-512, icon-512-maskable (fondo pieno, lettera nella zona
// sicura) e apple-touch-icon (180, per l'«Aggiungi a Home» di iPhone).
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const lettera = (process.argv[2] || "D").slice(0, 2);
const dir = process.argv[3] || "public";
mkdirSync(dir, { recursive: true });

const ORO = "#c2a24e";
const svg = (size, maskable) => {
  const r = maskable ? 0 : Math.round(size * 0.22);
  const fs = Math.round(size * (maskable ? 0.46 : 0.56));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#2c2e36"/><stop offset="1" stop-color="#121319"/>
    </linearGradient></defs>
    <rect width="${size}" height="${size}" rx="${r}" ry="${r}" fill="url(#g)"/>
    <text x="50%" y="50%" dy="0.34em" text-anchor="middle"
      font-family="Georgia, 'Times New Roman', serif" font-weight="500"
      font-size="${fs}" fill="${ORO}">${lettera}</text>
  </svg>`;
};

const out = async (name, size, maskable = false) => {
  await sharp(Buffer.from(svg(size, maskable))).png().toFile(join(dir, name));
  console.log("  ✓", name, `(${size}px)`);
};

console.log("Icone PWA per «" + lettera + "» in", dir);
await out("icon-192.png", 192);
await out("icon-512.png", 512);
await out("icon-512-maskable.png", 512, true);
await out("apple-touch-icon.png", 180);
console.log("Fatto.");
