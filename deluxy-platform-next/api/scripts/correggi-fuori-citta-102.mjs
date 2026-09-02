/**
 * CORREGGE le due consegne marcate «fuori città» fra indirizzi dello STESSO
 * comune (02/09, controllo listini dell'utente sulla #100845):
 *
 *   #100845 Luca Faloni — ritiro «Corso Giacomo Matteotti 1 20121 MI» (senza
 *     virgole né la parola Milano): il parser della città restituiva TUTTA la
 *     via e il confronto diceva comuni diversi → prezzata fuori città
 *     2,7 km × 2 = 5,40 invece del listino in città (base 15, 2,7 ≤ 5 inclusi
 *     della scheda). → extraOutOfCity=false, extraKm=0, price 15,00.
 *   #100797 Fiorista Tonino — consegna al Rosa Grand di Piazza Fontana,
 *     Milano: stesso comune del ritiro. Vendita (la quota non usa i km), ma il
 *     flag avrebbe pagato il valet a chilometraggio su 5,3 km urbani.
 *     → extraOutOfCity=false.
 *
 * La #100795 (Garbagnate Milanese) resta fuori città: è GIUSTA — il comune è
 * davvero un altro. Il parser è stato corretto nel codice (una «città» con
 * dentro numeri non è una città): questo script ripara solo il già scritto.
 * Prova a vuoto di default; con --applica scrive (log su ogni consegna).
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const APPLICA = process.argv.includes('--applica');
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
process.env.DATABASE_URL = `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform`;
const prisma = new PrismaClient();

const PIANO = [
  { code: 100845, dati: { extraOutOfCity: false, extraKm: 0, price: 15 },
    log: 'Fuori città corretto: ritiro e consegna sono entrambi a Milano — il ritiro senza virgole («…20121 MI») ingannava il confronto dei comuni. Prezzo dal listino in città: base 15,00, 2,7 km entro i 5 inclusi della scheda (era 5,40 = 2,7 km × 2 fuori città). Controllo listini utente, 02/09.' },
  { code: 100797, dati: { extraOutOfCity: false },
    log: 'Fuori città corretto: la consegna in Piazza Fontana (Rosa Grand) è a Milano come il ritiro — il testo dell\u2019indirizzo ingannava il confronto dei comuni. Vendita: la quota non usa i km, la paga del valet torna in città. Controllo listini utente, 02/09.' },
];
for (const p of PIANO) {
  const d = await prisma.delivery.findFirst({ where: { code: p.code },
    select: { id: true, status: true, extraOutOfCity: true, price: true, invoiced: true,
      invoiceLines: { select: { id: true } }, salaryLines: { select: { id: true } } } });
  if (!d) { console.log(`#${p.code}: NON TROVATA`); continue; }
  if (!d.extraOutOfCity) { console.log(`#${p.code}: già in città, salto`); continue; }
  if (d.invoiced || d.invoiceLines.length || d.salaryLines.length) { console.log(`#${p.code}: fatturata/in stipendio, NON toccata`); continue; }
  console.log(`#${p.code} [${d.status}]: fuori città → in città${p.dati.price ? ` · price ${d.price} → ${p.dati.price}` : ''}`);
  if (!APPLICA) continue;
  await prisma.delivery.update({ where: { id: d.id }, data: {
    ...p.dati,
    logs: { create: [{ type: 'price_fix', message: p.log }] },
  } });
  console.log('  ✅ corretta');
}
if (!APPLICA) console.log('(prova a vuoto: rilanciare con --applica)');
await prisma.$disconnect();
