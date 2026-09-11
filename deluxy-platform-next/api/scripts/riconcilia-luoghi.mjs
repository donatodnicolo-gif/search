/**
 * I LUOGHI DELLE CONSEGNE PASSATE (11/09/2026, richiesta utente).
 *
 *   node api/scripts/riconcilia-luoghi.mjs            (anteprima: non scrive niente)
 *   node api/scripts/riconcilia-luoghi.mjs --applica
 *
 * DA DOVE VIENE IL DIZIONARIO. Dai fogli «Hotel Chanel» (18 file, 2.657 righe, 482 indirizzi distinti):
 * ogni riga lega un indirizzo a un hotel. I nomi erano scritti in tutti i modi — «EXCELSIOR HOTEL GALIA»,
 * «FOUR SEASON», «Westing Palace» — quindi ogni indirizzo è stato chiesto a Google Places: 452 hanno
 * risposto con il nome ufficiale del posto (Excelsior Hotel Gallia, Four Seasons Hotel Milano, The Westin
 * Palace Milan), 29 no e tengono il nome del foglio, 1 non esiste per Google. Il dizionario sta in
 * `luoghi-hotel.json`, accanto a questo script.
 *
 * COSA FA. Per ogni consegna SENZA luogo:
 *   1. confronta l'indirizzo (normalizzato: niente accenti, «Milan»→«Milano», niente punteggiatura) col
 *      dizionario. Se combacia, il luogo è quello.
 *   2. se no, legge CITOFONO e NOTE: lì dentro il posto è spesso scritto a mano («room 525 Quark Hotel»,
 *      «HOTEL DE LA VILLE , # 403»). Si cerca un nome noto, il più lungo che ci sta dentro.
 *
 * ⚠️ NON tocca le consegne che un luogo ce l'hanno già: quello l'ha scelto una persona.
 * ⚠️ Scrive SOLO `recipientPlace`. Indirizzi, citofoni e note restano come sono: questo script aggiunge
 *    un'informazione, non corregge i dati di nessuno.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';

const APPLICA = process.argv.includes('--applica');
const RADICE = 'C:/Users/nicol/app/.claude/worktrees/deploy-delivery/deluxy-platform-next/';
const require = createRequire(RADICE + 'api/package.json');
const { PrismaClient } = require('@prisma/client');
const riga = fs.readFileSync(RADICE + 'api/.env', 'utf8').split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
u.searchParams.set('schema', 'platform');
u.searchParams.set('connection_limit', '1');
const db = new PrismaClient({ datasources: { db: { url: u.toString() } } });

const dizionario = JSON.parse(fs.readFileSync(RADICE + 'api/scripts/luoghi-hotel.json', 'utf8'));

const senzaAccenti = (s) => (s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '');

/**
 * ⚠️⚠️ LA CHIAVE VUOLE VIA, CIVICO E CAP. TUTTI E TRE.
 *
 * La prima versione confrontava l'indirizzo intero normalizzato, e la prova a vuoto ha mostrato il
 * disastro: il foglio conteneva una riga con indirizzo «Milano MI, Italia» (solo la città) legata a
 * «Park Hyatt», e **7.605 consegne** che hanno per indirizzo la sola città sarebbero finite dentro un
 * hotel dove non sono mai state. Un numero alto non è una conferma: era lo stesso errore moltiplicato.
 *
 * Quindi: dall'indirizzo si estraggono il NOME DELLA VIA (senza «via/piazza/corso…»), il CIVICO e il CAP.
 * Se manca anche uno solo dei tre, quell'indirizzo non partecipa — né come voce del dizionario né come
 * consegna da riconciliare. Meglio un luogo in meno che un luogo sbagliato.
 */
const chiaveIndirizzo = (s) => {
  const testo = senzaAccenti(s).toLowerCase().replace(/\bmilan\b/g, 'milano');
  const cap = (testo.match(/\b(\d{5})\b/) ?? [])[1];
  if (!cap) return null;
  const pezzi = testo.split(',').map((x) => x.trim()).filter(Boolean);
  if (pezzi.length < 2) return null;
  const via = pezzi[0]
    .replace(/^(via|v|viale|vle|piazza|p za|pza|piazzale|largo|corso|c so|galleria|strada|lungotevere|borgo|vicolo|salita)\b\.?\s*/, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
  if (via.length < 3) return null;
  // Il civico è il primo numero che NON è il CAP, cercato nei pezzi dopo la via (e, se la via lo contiene
  // in coda, anche lì: «Via Gesù 6-8» senza virgola).
  const dopo = pezzi.slice(1).join(' ').replace(cap, ' ');
  const civico = (dopo.match(/\b(\d{1,4})\b/) ?? pezzi[0].match(/\b(\d{1,4})\b/) ?? [])[1];
  if (!civico) return null;
  return `${via}|${civico}|${cap}`;
};
const normNome = (s) => senzaAccenti(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();

// Il dizionario si ricostruisce sulla chiave rigorosa: le voci senza civico o senza CAP si buttano.
const perChiave = new Map();
let vociScartate = 0;
for (const v of Object.values(dizionario)) {
  const k = chiaveIndirizzo(v.indirizzo);
  if (!k) { vociScartate++; continue; }
  const gia = perChiave.get(k);
  if (!gia || (v.volte ?? 0) > (gia.volte ?? 0)) perChiave.set(k, v);
}
console.log(`dizionario: ${perChiave.size} indirizzi utilizzabili (scartati ${vociScartate} senza civico o CAP)`);

// I nomi noti, dal più lungo al più corto: «Grand Hotel Et De Milan» prima di «Milan».
// ⚠️ Sotto i 6 caratteri non si cerca nel testo libero: «W», «Rome», «Casa» prenderebbero qualunque frase.
const nomi = [...new Set([...perChiave.values()].map((v) => v.luogo))]
  .map((n) => ({ nome: n, ago: normNome(n) }))
  .filter((x) => x.ago.length >= 6)
  .sort((a, b) => b.ago.length - a.ago.length);

const CAMPI = { id: true, code: true, date: true, recipientAddress: true, recipientIntercom: true, notes: true,
  partner: { select: { insegna: true } } };
const PASSO = 2000;
let saltate = 0, daIndirizzo = 0, daCitofono = 0, daNote = 0, nulla = 0, scritte = 0;
const esempi = [];
const conteggio = new Map();
let cursore = null;

for (;;) {
  const lotto = await db.delivery.findMany({
    where: { deletedAt: null, OR: [{ recipientPlace: null }, { recipientPlace: '' }] },
    select: CAMPI, orderBy: { id: 'asc' }, take: PASSO,
    ...(cursore ? { skip: 1, cursor: { id: cursore } } : {}),
  });
  if (!lotto.length) break;
  cursore = lotto[lotto.length - 1].id;

  for (const d of lotto) {
    let luogo = null, fonte = null;
    const k = chiaveIndirizzo(d.recipientAddress);
    const voce = k ? perChiave.get(k) : null;
    if (voce) { luogo = voce.luogo; fonte = 'indirizzo'; daIndirizzo++; }
    if (!luogo) {
      for (const [campo, testo] of [['citofono', d.recipientIntercom], ['note', d.notes]]) {
        if (!testo) continue;
        const ago = ' ' + normNome(testo) + ' ';
        /**
         * ⚠️ IL NOME DEVE STARE FRA DUE SPAZI. La prova a vuoto ha pescato la consegna #5705 come
         * «Mandarin» perché nelle note c'era «1 Panettone Nocciole IGP Piemonte e Mandarino»: un hotel
         * dentro un panettone. Cercare una parola dentro un'altra parola non è cercare un nome.
         *
         * ⚠️ E il nome del PARTNER non è il luogo della consegna: «Armani Fiori» che scrive «Armani»
         * nelle note sta nominando sé stesso, non l'albergo dove porta i fiori.
         */
        const insegna = ' ' + normNome(d.partner?.insegna ?? '') + ' ';
        const trovato = nomi.find((n) => ago.includes(' ' + n.ago + ' ') && !insegna.includes(' ' + n.ago + ' '));
        if (trovato) {
          luogo = trovato.nome; fonte = campo;
          if (campo === 'citofono') daCitofono++; else daNote++;
          break;
        }
      }
    }
    if (!luogo) { nulla++; continue; }
    conteggio.set(luogo, (conteggio.get(luogo) ?? 0) + 1);
    if (esempi.length < 12) esempi.push(`#${d.code} ${String(d.date).slice(0,10)} ${d.partner?.insegna ?? '—'} · ${fonte}: ${luogo}  ←  ${(fonte==='indirizzo'?d.recipientAddress:fonte==='citofono'?d.recipientIntercom:d.notes ?? '').slice(0,58)}`);
    if (APPLICA) { await db.delivery.update({ where: { id: d.id }, data: { recipientPlace: luogo } }); scritte++; }
  }
  process.stdout.write(`${daIndirizzo + daCitofono + daNote}/${daIndirizzo + daCitofono + daNote + nulla}… `);
}

console.log('');
console.log('CONSEGNE SENZA LUOGO ESAMINATE:', daIndirizzo + daCitofono + daNote + nulla);
console.log('  luogo trovato dall\'INDIRIZZO :', daIndirizzo);
console.log('  luogo trovato dal CITOFONO   :', daCitofono);
console.log('  luogo trovato dalle NOTE     :', daNote);
console.log('  nessun luogo                 :', nulla);
console.log('');
console.log('I PIÙ SERVITI:');
for (const [n, q] of [...conteggio.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`  ${String(q).padStart(5)}  ${n}`);
console.log('');
console.log('ESEMPI:'); for (const e of esempi) console.log('  ' + e);
console.log('');
console.log(APPLICA ? `SCRITTE: ${scritte} consegne hanno ora un luogo.` : 'ANTEPRIMA: nessuna scrittura. Rilanciare con --applica.');
await db.$disconnect();
