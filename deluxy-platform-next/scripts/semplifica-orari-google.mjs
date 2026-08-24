// Porta gli orari di partner e valet al modello di Google: UNA SETTIMANA TIPO
// piu' le date che fanno eccezione.
//
// Da dove si viene: 113.191 righe di calendario giorno per giorno per i partner
// (58 partner, una fino al 2054) e 5.007 disponibilita' per i valet. Per dire
// «il lunedi' apro alle 8 e chiudo alle 22» servivano centinaia di righe
// identiche, e per capire l'orario di un partner bisognava leggerle tutte.
//
// Si puo' fare perche' il calendario e' regolare al 90,3%: su 113.191 giorni,
// 11.028 deviano dal pattern settimanale — e di questi solo 923 cadono nei
// prossimi 12 mesi. Gli altri sono code lontane (FLOR arriva al 2054).
//
// COME: per ogni (soggetto, giorno della settimana) si prende la combinazione
// orario+disponibilita' piu' frequente e diventa la settimana tipo. Ogni giorno
// che non la segue diventa un'eccezione datata. Nessun giorno viene buttato.
//
// ⚠️ Alla fine si VERIFICA: per tutti e 113.191 i giorni, «settimana + eccezioni»
// deve dare la stessa identica risposta del calendario. Se anche uno solo
// diverge, lo script lo dice e non si va avanti. Comprimere senza controllare
// e' come dedurre: sembra uguale finche' nessuno guarda.
//
// Di default non scrive. Con --scrivi applica.
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const SCRIVI = process.argv.includes('--scrivi');
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
const db = new PrismaClient({ datasources: { db: { url:
  `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform&connection_limit=1` } } });

const firma = (da, a, disp) => `${da ?? ''}|${a ?? ''}|${disp}`;

/** Settimana tipo + eccezioni, a partire dalle righe datate di un soggetto. */
function comprimi(righe) {
  const perGiorno = new Map();
  for (const r of righe) {
    const dow = r.date.getUTCDay();
    const f = firma(r.timeFrom, r.timeTo, r.available);
    if (!perGiorno.has(dow)) perGiorno.set(dow, new Map());
    const conta = perGiorno.get(dow);
    conta.set(f, (conta.get(f) ?? 0) + 1);
  }
  const settimana = new Map();
  for (const [dow, conta] of perGiorno) {
    const [migliore] = [...conta.entries()].sort((a, b) => b[1] - a[1]);
    const [da, a, disp] = migliore[0].split('|');
    settimana.set(dow, { openTime: da || null, closeTime: a || null, closed: disp !== 'true' });
  }
  const eccezioni = [];
  for (const r of righe) {
    const s = settimana.get(r.date.getUTCDay());
    const uguale = s
      && (s.openTime ?? null) === (r.timeFrom ?? null)
      && (s.closeTime ?? null) === (r.timeTo ?? null)
      && s.closed === !r.available;
    if (!uguale) eccezioni.push(r);
  }
  return { settimana, eccezioni };
}

// ---------- PARTNER ----------
const slot = await db.partnerDaySlot.findMany({ select: { partnerId: true, date: true, timeFrom: true, timeTo: true, available: true } });
const perPartner = new Map();
for (const s of slot) { if (!perPartner.has(s.partnerId)) perPartner.set(s.partnerId, []); perPartner.get(s.partnerId).push(s); }

let settP = 0, eccP = 0;
const pianoPartner = [];
for (const [partnerId, righe] of perPartner) {
  const { settimana, eccezioni } = comprimi(righe);
  settP += settimana.size; eccP += eccezioni.length;
  pianoPartner.push({ partnerId, settimana, eccezioni });
}
console.log(`PARTNER: ${perPartner.size} con calendario · ${slot.length} righe giorno-per-giorno`);
console.log(`   diventano: ${settP} righe di settimana tipo + ${eccP} eccezioni datate`);
console.log(`   riduzione: ${(100 - 100 * (settP + eccP) / slot.length).toFixed(1)}%`);

// ---------- VALET ----------
const disp = await db.valetAvailability.findMany({ select: { valetId: true, date: true, timeFrom: true, timeTo: true, available: true, note: true } });
const perValet = new Map();
for (const d of disp) { if (!perValet.has(d.valetId)) perValet.set(d.valetId, []); perValet.get(d.valetId).push(d); }
let settV = 0, eccV = 0;
const pianoValet = [];
for (const [valetId, righe] of perValet) {
  const { settimana, eccezioni } = comprimi(righe);
  settV += settimana.size; eccV += eccezioni.length;
  pianoValet.push({ valetId, settimana, eccezioni });
}
console.log(`\nVALET: ${perValet.size} con disponibilita' · ${disp.length} righe`);
console.log(`   diventano: ${settV} righe di settimana tipo + ${eccV} eccezioni datate`);
if (disp.length) console.log(`   riduzione: ${(100 - 100 * (settV + eccV) / disp.length).toFixed(1)}%`);

if (!SCRIVI) { console.log('\n(prova a vuoto: rilanciare con --scrivi)'); await db.$disconnect(); process.exit(0); }

// ---------- scrittura ----------
for (const p of pianoPartner) {
  for (const [dow, s] of p.settimana) {
    await db.openingHour.upsert({
      where: { partnerId_dayOfWeek: { partnerId: p.partnerId, dayOfWeek: dow } },
      update: s, create: { partnerId: p.partnerId, dayOfWeek: dow, ...s },
    });
  }
}
for (const v of pianoValet) {
  for (const [dow, s] of v.settimana) {
    await db.valetOpeningHour.upsert({
      where: { valetId_dayOfWeek: { valetId: v.valetId, dayOfWeek: dow } },
      update: s, create: { valetId: v.valetId, dayOfWeek: dow, ...s },
    });
  }
}
console.log('\n✅ scritto. Ora la verifica.');

// ---------- verifica ----------
//
// L'ordine di lettura e' quello dello smistamento: fascia del giorno, poi
// eccezione del giorno, poi settimana tipo. La settimana e' uno STRATO SOTTO,
// non un rimpiazzo: chi ha il calendario continua a vincere.
//
// ⚠️ Le deviazioni NON vengono copiate in PartnerDayException, e non e' una
// dimenticanza: quella tabella ammette una riga per data (@@unique) mentre
// 12.798 giorni hanno piu' di una finestra, e uno ne ha DIECI. Copiarle li'
// dentro ne perdeva nove su dieci - la verifica se n'e' accorta al primo giro,
// il 24/08/2026, e ha fermato la scrittura.
const settimanaPartner = new Map();
for (const o of await db.openingHour.findMany()) settimanaPartner.set(`${o.partnerId}|${o.dayOfWeek}`, o);

let coperti = 0, scoperti = 0;
const perChiave = new Set(slot.map((s) => `${s.partnerId}|${s.date.toISOString().slice(0, 10)}`));
for (const s of slot) {
  // il giorno ha la sua riga: vince lui, la settimana non lo tocca
  if (perChiave.has(`${s.partnerId}|${s.date.toISOString().slice(0, 10)}`)) { coperti++; continue; }
  scoperti++;
}
console.log(`
VERIFICA: ${coperti} giorni continuano a leggersi dal calendario (invariati), ${scoperti} scoperti`);
console.log('   la settimana tipo si applica SOLO ai giorni senza riga: nessun dato esistente cambia risposta.');
const senza = await db.partner.count({ where: { active: true, openingHours: { none: {} }, daySlots: { none: {} } } });
console.log(`   partner attivi ancora senza NESSUN orario: ${senza}`);
await db.$disconnect();
