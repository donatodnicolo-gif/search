/**
 * Riferimenti ROTTI e riferimenti VUOTI nel vecchio database.
 *
 * Serve a rispondere «perché non l'avete importato?» con un fatto invece che
 * con una scusa.
 *
 * ⚠️ Sono due cose diverse e vanno contate separate:
 *  - **rotto**: la riga cita un id che non esiste. È un guasto della sorgente,
 *    e l'import non può che lasciarla fuori — copiarla dentro significherebbe
 *    portarsi in casa una riga che parla di niente.
 *  - **vuoto**: la riga non cita nessuno. Non è un guasto: è un lavoro lasciato
 *    a metà.
 * Contarle insieme fa cercare un colpevole dove non c'è.
 *
 * ⚠️ E il vuoto ha più facce: stringa vuota, `NULL` maiuscolo, `null`
 * minuscolo. Controllandone una sola, 3.306 righe con `deliveryId = "null"`
 * risultavano orfane — e sembravano consegne cancellate a tradimento.
 *
 * Sola lettura.
 */
import { leggiCsv } from './leggi-csv.mjs';

const B = 'C:/Users/nicol/app/deluxy-platform-next/legacy/tabelle/';
const carica = (f) => leggiCsv(B + f);
const linea = (c) => console.log((c || '─').repeat(78));

const vuoto = (v) => {
  const t = String(v ?? '').trim().toLowerCase();
  return !t || t === 'null' || t === 'undefined';
};

// Gli id che esistono davvero nella sorgente.
const consegne = carica('delivery.csv');
const idConsegne = new Set(consegne.map((x) => String(x.id)));
const prodotti = new Set(carica('product.csv').map((x) => String(x.id)));
const partner = new Set(carica('partner.csv').map((x) => String(x.id)));
const valet = new Set(carica('expert.csv').map((x) => String(x.id)));

function controlla(file, colonna, insieme) {
  let righe;
  try { righe = carica(file).filter((x) => !x.deletedAt); } catch { return null; }
  const senza = righe.filter((x) => vuoto(x[colonna]));
  const rotte = righe.filter((x) => !vuoto(x[colonna]) && !insieme.has(String(x[colonna]).trim()));
  return { file, colonna, totali: righe.length, rotte, senza };
}

const controlli = [
  controlla('delivery-product.csv', 'deliveryId', idConsegne),
  controlla('delivery-product.csv', 'productId', prodotti),
  controlla('tabella-21.csv', 'deliveryId', idConsegne),
  controlla('delivery-updates.csv', 'deliveryId', idConsegne),
  controlla('delivery-complaint.csv', 'deliveryId', idConsegne),
  controlla('valet-activities.csv', 'deliveryId', idConsegne),
  controlla('delivery.csv', 'partnerId', partner),
  controlla('delivery.csv', 'expertId', valet),
  controlla('partner-service.csv', 'partnerId', partner),
  controlla('expert-service.csv', 'expertId', valet),
].filter(Boolean);

const n = (x) => x.toLocaleString('it-IT');

console.log('');
linea('═');
console.log('  RIFERIMENTI NEL VECCHIO DATABASE — rotti e vuoti');
linea('═');
console.log('');
console.log('  tabella'.padEnd(32) + 'colonna'.padEnd(14) + 'righe'.padStart(8) + '     rotti' + '        vuoti');
for (const c of controlli.sort((a, b) => (b.rotte.length + b.senza.length) - (a.rotte.length + a.senza.length))) {
  console.log(
    '  ' + c.file.replace('.csv', '').padEnd(30) + c.colonna.padEnd(14) + String(c.totali).padStart(8) +
    (c.rotte.length ? ('🔴 ' + n(c.rotte.length)).padStart(11) : '         —') +
    (c.senza.length ? ('⬜ ' + n(c.senza.length)).padStart(14) : '            —'),
  );
}

const dp = controlli.find((c) => c.file === 'delivery-product.csv' && c.colonna === 'deliveryId');
if (dp?.senza.length) {
  console.log('');
  linea('═');
  console.log('  ESEMPI — righe prodotto che non appartengono a nessuna consegna');
  linea('═');
  console.log('');
  const nomi = new Map(carica('product.csv').map((x) => [String(x.id), x.name]));
  for (const r of dp.senza.slice(0, 6)) {
    console.log('  riga #' + String(r.id).padEnd(7) + 'deliveryId = ' + JSON.stringify(r.deliveryId) + '  ← non è attaccata a niente');
    console.log('           ' + String(nomi.get(String(r.productId)) ?? '(prodotto ' + r.productId + ')').slice(0, 40).padEnd(42) +
      '×' + (r.quantity ?? 1) + '  ' + (r.price ?? 0) + ' EUR   ' + String(r.createdAt ?? '—').slice(0, 10));
  }
  const anni = {};
  for (const r of dp.senza) { const a = String(r.createdAt ?? '').slice(0, 4) || '—'; anni[a] = (anni[a] ?? 0) + 1; }
  console.log('');
  console.log('  Sono ' + n(dp.senza.length) + ' righe con nome, prezzo e data — ' +
    Object.entries(anni).sort().map(([a, q]) => a + ': ' + q).join(' · '));
  console.log('  Non sono un guasto: sono lavori lasciati a metà. Qualcuno ha scelto');
  console.log('  un prodotto e non ha mai finito la consegna.');
  console.log('');
  console.log('  Nel modello nuovo una riga prodotto DEVE stare dentro una consegna,');
  console.log('  quindi non c\'è dove metterle: importarle vorrebbe dire inventare');
  console.log('  la consegna che non c\'è mai stata.');
}

console.log('');
linea();
console.log('  Per confronto: le consegne cancellate in modo TRACCIATO (deletedAt) sono ' +
  n(consegne.filter((x) => x.deletedAt).length) + '.');
console.log('  Quelle si sanno, e infatti non risultano rotte da nessuna parte.');
linea('═');
