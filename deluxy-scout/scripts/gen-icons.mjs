#!/usr/bin/env node
// Genera icona, adaptive icon, splash e favicon di Deluxy Scout da SVG (navy/oro).
// Uso: node scripts/gen-icons.mjs   (richiede la dipendenza dev "sharp")
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const NAVY = '#1B2A4A';
const GOLD = '#A6832B';

// Pin (map marker) centrato: gold con "foro" navy.
const pin = (holeFill) => `
  <path d="M512 205 C392 205 296 301 296 421 C296 561 512 810 512 810 C512 810 728 561 728 421 C728 301 632 205 512 205 Z" fill="${GOLD}"/>
  <circle cx="512" cy="421" r="86" fill="${holeFill}"/>
`;

// Icona full-bleed (sfondo navy).
const iconSvg = `<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <rect width="1024" height="1024" fill="${NAVY}"/>
  ${pin(NAVY)}
</svg>`;

// Adaptive/splash: sfondo trasparente (Android/Expo mettono il navy dietro).
const foregroundSvg = `<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  ${pin(NAVY)}
</svg>`;

async function png(svg, size, out) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(out);
  console.log(`+ ${out} (${size}px)`);
}

await mkdir('assets', { recursive: true });
await writeFile('assets/icon.svg', iconSvg);
await writeFile('assets/adaptive-icon.svg', foregroundSvg);
await png(iconSvg, 1024, 'assets/icon.png');
await png(foregroundSvg, 1024, 'assets/adaptive-icon.png');
await png(foregroundSvg, 1024, 'assets/splash-icon.png');
await png(iconSvg, 48, 'assets/favicon.png');
console.log('Asset generati ✔');
