/**
 * LA PROVINCIA MANCANTE SI LEGGE DALL'INDIRIZZO (10/09/2026, richiesta utente:
 * «negli indirizzi italiani sono 2 lettere dopo il comune, esempio Milano MI»).
 *
 *   node api/scripts/province-dall-indirizzo.mjs              (anteprima + misura)
 *   node api/scripts/province-dall-indirizzo.mjs --applica    (scrive provinceId)
 *   node api/scripts/province-dall-indirizzo.mjs --solo-attive --applica
 *
 * IL BUCO. 32.014 consegne vive senza `provinceId` (31.986 importate dal vecchio
 * gestionale). Il csv legacy NON aiuta: la colonna `province` è valorizzata su 9 di
 * quelle 31.986 — nel vecchio sistema la provincia della consegna non si scriveva.
 *
 * COME SI RICAVA (due passi, nell'ordine, sull'indirizzo del DESTINATARIO):
 *  1. la SIGLA: due lettere maiuscole isolate («… 20121 Milano MI, Italia»), presa
 *     l'ULTIMA che è un codice della tabella Province (così «Via San Marco 2, Milano MI»
 *     non legge SM di San Marino… che comunque non è in tabella). Esclusa «IT».
 *  2. il NOME del capoluogo/provincia come parola intera («Milano», «Roma», «Monza»),
 *     confronto senza accenti e senza maiuscole. Solo se la sigla non c'è.
 * Chi non passa nessuno dei due resta com'è (hotel senza via, «varie, Vimercate»…):
 * meglio vuoto che inventato.
 *
 * MISURA del 10/09 (anteprima): 24.809 con la sigla + 5.971 col nome = 30.780 su
 * 32.014 (96 %); 1.234 restano vuote. Non chiama Google, non costa niente.
 *
 * COSA SCRIVE. Solo `provinceId` sulle consegne che NON ce l'hanno, più una riga di
 * registro «Provincia ricavata dall'indirizzo (…)». Non tocca indirizzi, prezzi, valet.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';

const APPLICA = process.argv.includes('--applica');
const SOLO_ATTIVE = process.argv.includes('--solo-attive');
const RADICE = 'C:/Users/nicol/app/.claude/worktrees/deploy-delivery/deluxy-platform-next/';
const require = createRequire(RADICE + 'api/package.json');
const { PrismaClient } = require('@prisma/client');
const rigaEnv = fs.readFileSync(RADICE + 'api/.env', 'utf8').split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(rigaEnv.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
u.searchParams.set('schema', 'platform');
u.searchParams.set('connection_limit', '1');
const db = new PrismaClient({ datasources: { db: { url: u.toString() } } });

const norma = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
const province = await db.province.findMany({ select: { id: true, code: true, name: true } });
const perSigla = new Map(province.map((p) => [p.code.toUpperCase(), p]));
// Nomi più lunghi prima: «Monza e della Brianza» prima di «Monza», «Reggio Emilia» prima di «Reggio».
const perNome = province
  .flatMap((p) => [[norma(p.name), p], ...(p.name.includes('-') ? p.name.split('-').map((n) => [norma(n.trim()), p]) : [])])
  .filter(([n]) => n.length >= 4)
  .sort((a, b) => b[0].length - a[0].length);

function ricava(indirizzo) {
  const up = norma(indirizzo);
  if (!up.trim()) return null;
  const sigle = [...up.matchAll(/(?:^|[\s,.()\-])([A-Z]{2})(?=$|[\s,.()\-])/g)].map((m) => m[1]).filter((c) => c !== 'IT' && perSigla.has(c));
  if (sigle.length) return { p: perSigla.get(sigle[sigle.length - 1]), come: `sigla ${sigle[sigle.length - 1]}` };
  for (const [nome, p] of perNome) {
    if (new RegExp(`(^|[^A-Z])${nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^A-Z]|$)`).test(up)) return { p, come: `nome «${p.name}»` };
  }
  return null;
}

const CHIUSE = ['delivered', 'not_delivered', 'cancelled', 'not_accepted', 'approved', 'invalidated'];
const where = { provinceId: null, deletedAt: null, ...(SOLO_ATTIVE ? { status: { notIn: CHIUSE } } : {}) };
const rows = await db.delivery.findMany({ where, select: { id: true, code: true, recipientAddress: true } });
console.log(`consegne senza provincia${SOLO_ATTIVE ? ' (solo attive)' : ''}: ${rows.length}`);
let sigla = 0, nome = 0, nulla = 0; const perProv = {}; const esempi = [];
const daScrivere = [];
for (const r of rows) {
  const e = ricava(r.recipientAddress);
  if (!e) { nulla++; if (esempi.length < 10) esempi.push(`#${r.code} ${String(r.recipientAddress ?? '').slice(0, 70)}`); continue; }
  if (e.come.startsWith('sigla')) sigla++; else nome++;
  perProv[e.p.code] = (perProv[e.p.code] ?? 0) + 1;
  daScrivere.push({ id: r.id, provinceId: e.p.id, come: e.come });
}
console.log(`ricavate: ${daScrivere.length} (sigla ${sigla}, nome ${nome}) · non risolte: ${nulla}`);
console.log('per provincia:', Object.entries(perProv).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, v]) => `${k}=${v}`).join(', '));
console.log('esempi non risolti:'); esempi.forEach((x) => console.log('  ', x));
if (!APPLICA) { console.log('\nANTEPRIMA: nessuna scrittura. Aggiungi --applica per scrivere.'); await db.$disconnect(); process.exit(0); }

let fatte = 0;
for (let i = 0; i < daScrivere.length; i += 100) {
  const lotto = daScrivere.slice(i, i + 100);
  await db.$transaction(lotto.flatMap((x) => [
    db.delivery.update({ where: { id: x.id }, data: { provinceId: x.provinceId } }),
    db.deliveryLog.create({ data: { deliveryId: x.id, type: 'note', message: `Provincia ricavata dall'indirizzo di consegna (${x.come}), script province-dall-indirizzo del 10/09/2026` } }),
  ]));
  fatte += lotto.length;
  if (fatte % 2000 === 0 || fatte === daScrivere.length) console.log(`  … ${fatte}/${daScrivere.length}`);
}
const rimaste = await db.delivery.count({ where });
console.log(`\nFATTO: ${fatte} province scritte. Ancora senza provincia: ${rimaste}.`);
await db.$disconnect();
