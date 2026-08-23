// Cerca i backtick dentro i commenti HTML dei template Angular.
//
// Perche' esiste: un backtick dentro `template: \`…\`` CHIUDE il template
// literal. Il compilatore poi segnala errori a righe lontanissime dal punto
// vero ("',' expected" a 200 righe di distanza), e si perde tempo a cercare
// nel posto sbagliato. E' successo due volte in un pomeriggio.
//
// Uso:  node C:/Users/nicol/app/deluxy-platform-next/scripts/controlla-template.mjs

import fs from 'node:fs';
import path from 'node:path';

const RADICE = 'C:/Users/nicol/app/deluxy-platform-next/web/src';

function* file(dir) {
  for (const v of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, v.name);
    if (v.isDirectory()) yield* file(p);
    else if (v.name.endsWith('.ts')) yield p;
  }
}

let problemi = 0;
for (const f of file(RADICE)) {
  const righe = fs.readFileSync(f, 'utf8').split(/\r?\n/);
  let dentroCommento = false;
  righe.forEach((r, i) => {
    const apre = r.includes('<!--');
    const chiude = r.includes('-->');
    const inCommento = dentroCommento || apre;
    if (inCommento && r.includes('`')) {
      console.log(`🔴 ${path.relative(RADICE, f)}:${i + 1}`);
      console.log(`   ${r.trim()}`);
      problemi++;
    }
    if (apre && !chiude) dentroCommento = true;
    if (chiude) dentroCommento = false;
  });
}

console.log(problemi === 0
  ? '✅ nessun backtick nei commenti dei template'
  : `\n${problemi} punti da correggere: un backtick li' dentro chiude il template.`);
process.exitCode = problemi ? 1 : 0;
