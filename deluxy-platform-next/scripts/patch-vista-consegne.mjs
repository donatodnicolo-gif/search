// Patch una tantum: aggiunge il filtro di vista (Attive / Storico) a tutti i
// punti in cui la lista consegne costruisce il proprio `scope`.
//
// Sta in un file invece che inline perche' la stringa da cercare contiene
// caratteri che la shell mangia.

import fs from 'node:fs';

const FILE = 'C:/Users/nicol/app/deluxy-platform-next/api/src/deliveries/deliveries.service.ts';
let s = fs.readFileSync(FILE, 'utf8');
const NL = s.includes('\r\n') ? '\r\n' : '\n';

const vecchio = [
  '    const scope: any = { ...this.roleFilter(user) };',
  '    if (query.status) scope.status = query.status;',
].join(NL) + NL;

const nuovo = [
  '    const scope: any = { ...this.roleFilter(user) };',
  '    if (query.status) scope.status = query.status;',
  '    // Vista Attive / Storico. Uno stato esplicito VINCE sulla vista: se si',
  '    // chiede "consegnate" si vogliono quelle, in qualunque tab ci si trovi.',
  "    else if (query.view === 'storico') scope.status = { in: DELIVERY_CLOSED_STATUSES };",
  "    else if (query.view === 'attive') scope.status = { notIn: DELIVERY_CLOSED_STATUSES };",
].join(NL) + NL;

const quante = s.split(vecchio).length - 1;
console.log('punti da correggere:', quante);
if (quante === 0) { console.log('nessuna occorrenza: forse gia\' applicata'); process.exit(1); }
s = s.split(vecchio).join(nuovo);

// Import della costante, se manca.
if (!/DELIVERY_CLOSED_STATUSES[\s\S]{0,400}from '\.\.\/common\/enums'/.test(s)) {
  const m = s.match(/import \{([\s\S]*?)\} from '\.\.\/common\/enums';/);
  if (!m) { console.log("! non trovo l'import da ../common/enums"); process.exit(1); }
  s = s.replace(m[0], `import {${m[1].replace(/\s*$/, '')},${NL}  DELIVERY_CLOSED_STATUSES,${NL}} from '../common/enums';`);
  console.log('import aggiunto');
}

fs.writeFileSync(FILE, s);
console.log('fatto');
