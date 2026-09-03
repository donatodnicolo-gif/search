/**
 * RIALLINEA gli importi delle ricevute legacy al TOTALE BONIFICO dei loro PDF
 * (deciso dall'utente 03/09, dopo ripara-importi-ricevute-legacy.mjs).
 *
 * Scoperta: dove il legacy un importo ce l'aveva, `totalAmount` era
 * sistematicamente bonifico − ritenuta (6 campioni su 6), NON il totale
 * pagato al valet. La fonte di verità superstite è il PDF della ricevuta
 * (nota di prestazione occasionale): riquadro lordo / ritenuta / netto /
 * rimborsi / Totale Bonifico.
 *
 * Per ogni ricevuta legacy con un PDF: scarica, estrae il riquadro con
 * pdftotext (Git mingw64), e scrive il Totale Bonifico come `amount`.
 * - PDF con altro formato (recap-tabella «Stipendi», niente riquadro): non
 *   si tocca, si riporta.
 * - Dove amount ≠ bonifico − ritenuta si scrive comunque il bonifico (il
 *   documento vince), ma la riga si segnala: il PDF potrebbe essere stato
 *   rigenerato dopo il congelamento dell'importo.
 *
 * Idempotente: chi ha già il bonifico non viene riscritto.
 * Anteprima; scrive con --applica.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

const APPLICA = process.argv.includes('--applica');
const PDFTOTEXT = 'C:/Program Files/Git/mingw64/bin/pdftotext.exe';
const CARTELLA = path.join(os.tmpdir(), 'ricevute-legacy-pdf');
fs.mkdirSync(CARTELLA, { recursive: true });

const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
u.searchParams.set('schema', 'platform');
process.env.DATABASE_URL = u.toString();
const prisma = new PrismaClient();
for (let t = 1; t <= 5; t++) {
  try { await prisma.$queryRaw`SELECT 1`; break; }
  catch (e) { if (t === 5) { console.error('DB irraggiungibile'); process.exit(1); } await new Promise((r) => setTimeout(r, 4000)); }
}

function numero(s) {
  const t = String(s).trim();
  if (/,\d{2}$/.test(t)) return Number(t.replace(/\./g, '').replace(',', '.'));
  return Number(t.replace(/,/g, ''));
}

/** Il riquadro della nota di prestazione: etichetta a inizio riga, importo in coda. */
function estraiRiquadro(testo) {
  const prendi = (eti) => {
    const r = testo.split(/\r?\n/).find((l) => l.trim().toLowerCase().startsWith(eti));
    if (!r) return null;
    const m = r.match(/(\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|\d+[.,]\d{2})\s*$/);
    return m ? numero(m[1]) : null;
  };
  return {
    lordo: prendi('corrispettivo lordo'),
    ritenuta: prendi('ritenuta'),
    netto: prendi('importo netto'),
    rimborsi: prendi('rimborsi'),
    bonifico: prendi('totale bonifico'),
  };
}

const ricevute = await prisma.receipt.findMany({
  where: { legacyId: { not: null }, fileUrl: { not: null }, amount: { gt: 0 } },
  select: { id: true, legacyId: true, amount: true, status: true, fileUrl: true, valet: { select: { firstName: true, lastName: true } } },
  orderBy: { legacyId: 'asc' },
});
console.log(`Ricevute legacy con importo e PDF: ${ricevute.length}`);

const daScrivere = [];   // bonifico trovato, diverso dall'amount attuale
const giaAllineate = []; // bonifico trovato, uguale
const senzaRiquadro = []; // PDF di altro formato o irraggiungibile
const anomale = [];      // amount ≠ bonifico − ritenuta: si segnala comunque

for (const r of ricevute) {
  const nome = path.join(CARTELLA, `ricevuta-${r.legacyId}.pdf`);
  try {
    if (!fs.existsSync(nome) || fs.statSync(nome).size === 0) {
      // Lo storage risponde 429 sotto raffica: si riprova con pausa.
      let res = await fetch(r.fileUrl);
      for (let t = 1; t <= 3 && res.status === 429; t++) {
        await new Promise((ok) => setTimeout(ok, 3000 * t));
        res = await fetch(r.fileUrl);
      }
      if (!res.ok) { senzaRiquadro.push({ ...r, motivo: `HTTP ${res.status}` }); continue; }
      const buf = Buffer.from(await res.arrayBuffer());
      // La SPA del nuovo app.deluxy.it risponde 200 con HTML a qualsiasi
      // rotta: un «PDF» che inizia con <!doctype è un file perso.
      if (buf.slice(0, 5).toString() === '<!doc') { senzaRiquadro.push({ ...r, motivo: 'file perso (HTML)' }); continue; }
      fs.writeFileSync(nome, buf);
    }
    const testo = execFileSync(PDFTOTEXT, ['-layout', nome, '-']).toString('utf8');
    const q = estraiRiquadro(testo);
    if (q.bonifico == null) { senzaRiquadro.push({ ...r, motivo: 'formato senza riquadro' }); continue; }
    const attesoLegacy = q.ritenuta != null ? Math.round((q.bonifico - q.ritenuta) * 100) / 100 : null;
    if (attesoLegacy != null && Math.abs(r.amount - attesoLegacy) > 0.02 && Math.abs(r.amount - q.bonifico) > 0.02) {
      anomale.push({ ...r, bonifico: q.bonifico, attesoLegacy });
    }
    if (Math.abs(r.amount - q.bonifico) <= 0.005) { giaAllineate.push(r); continue; }
    daScrivere.push({ id: r.id, legacyId: r.legacyId, valet: `${r.valet?.lastName} ${r.valet?.firstName}`, prima: r.amount, dopo: q.bonifico });
  } catch (e) {
    senzaRiquadro.push({ ...r, motivo: String(e).slice(0, 100) });
  }
}

console.log(`\nDa riallineare: ${daScrivere.length} · già allineate: ${giaAllineate.length} · senza riquadro/irraggiungibili: ${senzaRiquadro.length}`);
const deltaTot = daScrivere.reduce((s, x) => s + (x.dopo - x.prima), 0);
console.log(`Differenza complessiva: ${deltaTot >= 0 ? '+' : ''}${deltaTot.toFixed(2)} €`);
for (const x of daScrivere) console.log(`  ${x.legacyId} · ${x.valet} · ${x.prima.toFixed(2)} → ${x.dopo.toFixed(2)} €`);
if (senzaRiquadro.length) {
  console.log('\nNon toccate (senza riquadro nel PDF):');
  for (const x of senzaRiquadro) console.log(`  ${x.legacyId} · ${x.valet?.lastName ?? ''} · ${x.amount} € · ${x.motivo}`);
}
if (anomale.length) {
  console.log('\n⚠️ Importo a registro fuori da entrambe le semantiche (si scrive comunque il bonifico):');
  for (const x of anomale) console.log(`  ${x.legacyId} · ${x.valet?.lastName ?? ''} · registro ${x.amount} · bonifico ${x.bonifico} · bonifico−ritenuta ${x.attesoLegacy}`);
}

if (!APPLICA) {
  console.log('\nANTEPRIMA: niente scritto. Rilanciare con --applica.');
  await prisma.$disconnect();
  process.exit(0);
}

fs.writeFileSync('C:/Users/nicol/AppData/Local/Temp/claude/backup-riallineo-ricevute-' + Date.now() + '.json',
  JSON.stringify({ prima: ricevute, daScrivere, senzaRiquadro, anomale }, null, 1));
let scritte = 0;
for (const x of daScrivere) {
  await prisma.receipt.update({ where: { id: x.id }, data: { amount: x.dopo } });
  scritte++;
}
console.log(`\nScritte: ${scritte}. Backup salvato.`);
await prisma.$disconnect();
