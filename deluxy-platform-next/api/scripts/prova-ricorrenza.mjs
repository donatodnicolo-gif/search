/**
 * PROVA della ricorrenza, sulla funzione VERA compilata (non una copia).
 * Nessun database, nessuna scrittura: e' una funzione pura.
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { toccaOggi } = require('../dist/recurring/recurring.module.js');

const D = (iso) => new Date(`${iso}T00:00:00.000Z`);
const nomi = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'];
let falliti = 0;

function prova(titolo, servizio, attesi, da, a) {
  const usciti = [];
  for (let d = D(da); d <= D(a); d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    if (toccaOggi(servizio, iso)) usciti.push(iso);
  }
  const ok = JSON.stringify(usciti) === JSON.stringify(attesi);
  if (!ok) falliti++;
  console.log(`${ok ? '✅' : '❌'} ${titolo}`);
  console.log(`   usciti : ${usciti.join(' ') || '(nessuno)'}`);
  if (!ok) console.log(`   attesi : ${attesi.join(' ')}`);
}

// «ogni lunedì, mercoledì e venerdì» — l'esempio dell'utente.
// 2026-09-01 è un martedì.
prova('ogni lunedì, mercoledì e venerdì (1ª settimana di settembre)',
  { frequenza: 'SETTIMANALE', ogni: 1, giorni: '1010100', dataInizio: D('2026-09-01') },
  ['2026-09-02', '2026-09-04', '2026-09-07', '2026-09-09', '2026-09-11'],
  '2026-09-01', '2026-09-11');

// ogni DUE settimane, lunedì e venerdì: le due date devono cadere nella
// STESSA settimana, non a sette giorni l'una dall'altra.
prova('ogni 2 settimane, lunedì e venerdì (parte da lunedì 7)',
  { frequenza: 'SETTIMANALE', ogni: 2, giorni: '1000100', dataInizio: D('2026-09-07') },
  ['2026-09-07', '2026-09-11', '2026-09-21', '2026-09-25'],
  '2026-09-07', '2026-09-30');

prova('ogni 3 giorni dal 1° settembre',
  { frequenza: 'GIORNALIERO', ogni: 3, giorni: '0000000', dataInizio: D('2026-09-01') },
  ['2026-09-01', '2026-09-04', '2026-09-07', '2026-09-10'],
  '2026-09-01', '2026-09-11');

prova('il 1 e il 15 di ogni mese',
  { frequenza: 'MENSILE', ogni: 1, giorni: '0000000', giorniMese: '1,15', dataInizio: D('2026-09-01') },
  ['2026-09-01', '2026-09-15', '2026-10-01', '2026-10-15'],
  '2026-09-01', '2026-10-20');

prova('il 15 ogni DUE mesi',
  { frequenza: 'MENSILE', ogni: 2, giorni: '0000000', giorniMese: '15', dataInizio: D('2026-09-15') },
  ['2026-09-15', '2026-11-15'],
  '2026-09-01', '2026-12-01');

// ⚠️ Il 31 nei mesi corti NON si arrotonda al 30: febbraio 2027 salta.
prova('il 31 di ogni mese: gennaio e marzo sì, febbraio NO',
  { frequenza: 'MENSILE', ogni: 1, giorni: '0000000', giorniMese: '31', dataInizio: D('2027-01-01') },
  ['2027-01-31', '2027-03-31'],
  '2027-01-01', '2027-04-05');

// Prima della data d'inizio non nasce niente.
prova('niente prima della data d.inizio',
  { frequenza: 'SETTIMANALE', ogni: 1, giorni: '1111111', dataInizio: D('2026-09-10') },
  ['2026-09-10', '2026-09-11'],
  '2026-09-05', '2026-09-11');

// Le righe vecchie non hanno frequenza: devono comportarsi come prima.
prova('riga vecchia senza frequenza = settimanale di sempre',
  { frequenza: null, ogni: null, giorni: '0000011', dataInizio: D('2026-09-01') },
  ['2026-09-05', '2026-09-06'],
  '2026-09-01', '2026-09-06');

console.log(falliti === 0 ? '\nTUTTE PASSATE' : `\n${falliti} PROVE FALLITE`);
process.exit(falliti === 0 ? 0 : 1);
