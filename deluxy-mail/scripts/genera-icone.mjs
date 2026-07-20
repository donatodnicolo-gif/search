// Genera le icone dell'app (PWA + APK) dal marchio Deluxy: la "D" oro su
// tessera scura del design system. Sfondo pieno fino ai bordi così vale anche
// come icona "maskable" (Android la ritaglia a piacere senza tagliare la D).
//
//   node scripts/genera-icone.mjs
//
// Richiede sharp (arriva con Next.js). Riscrive public/icon-192.png e 512.

import sharp from 'sharp'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="sfondo" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#232630"/>
      <stop offset="1" stop-color="#15171d"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#sfondo)"/>
  <text x="50%" y="52%" dominant-baseline="middle" text-anchor="middle"
        font-family="Georgia, 'Times New Roman', serif" font-size="300"
        fill="#b8963e">D</text>
</svg>`

async function main() {
  const base = sharp(Buffer.from(svg))
  await base.clone().resize(512, 512).png().toFile(join(publicDir, 'icon-512.png'))
  await base.clone().resize(192, 192).png().toFile(join(publicDir, 'icon-192.png'))
  console.log('Icone generate: public/icon-192.png, public/icon-512.png')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
