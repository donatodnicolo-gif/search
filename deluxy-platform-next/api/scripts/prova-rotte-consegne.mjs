/**
 * PROVA REALE delle rotte app-to-app delle consegne, in produzione.
 *
 * Crea una chiave usa-e-getta, chiama le rotte, poi la CANCELLA. La chiave non
 * viene mai stampata: si vede solo la risposta.
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
const db = new PrismaClient({ datasources: { db: { url:
  `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform&connection_limit=1` } } });

const BASE = 'https://deluxy-delivery.vercel.app/api/v1';
const chiave = crypto.randomBytes(32).toString('hex');
const hash = crypto.createHash('sha256').update(chiave).digest('hex');

const creata = await db.appApiKey.create({
  data: { nome: 'PROVA rotte consegne (usa e getta)', hash, attiva: true },
});
console.log(`chiave temporanea creata (id ${creata.id}) — il valore non si stampa`);

const chiama = async (percorso) => {
  const res = await fetch(`${BASE}${percorso}`, { headers: { 'x-api-key': chiave } });
  const testo = await res.text();
  let corpo = null;
  try { corpo = JSON.parse(testo); } catch { /* non JSON */ }
  return { stato: res.status, corpo, testo };
};

try {
  console.log('\n=== 1) senza chiave: deve rifiutare ===');
  const senza = await fetch(`${BASE}/app/consegne?limit=1`);
  console.log(`  HTTP ${senza.status} · ${(await senza.text()).slice(0, 90)}`);

  console.log('\n=== 2) elenco incrementale (limit 2) ===');
  const lista = await chiama('/app/consegne?limit=2');
  console.log(`  HTTP ${lista.stato} · quante: ${lista.corpo?.quante} · altrePagine: ${lista.corpo?.altrePagine} · cursore: ${lista.corpo?.prossimoCursore}`);
  const prima = lista.corpo?.consegne?.[0];
  if (prima) {
    console.log(`  #${prima.numero} · stato ${prima.esito?.stato} · chiusa ${prima.esito?.chiusa} · consegnata ${prima.esito?.consegnata}`);
    console.log(`  costo: totale ${prima.costoConsegna?.totale} = paga ${prima.costoConsegna?.paga} + ritenuta ${prima.costoConsegna?.ritenuta}`);
    console.log(`  ingredienti: pagaScritta ${prima.costoConsegna?.pagaScritta} · plusContato ${prima.costoConsegna?.plusContato} · plusScartato ${prima.costoConsegna?.plusScartato} · minus ${prima.costoConsegna?.minus}`);
    console.log(`  partner ${prima.partner?.insegna ?? '—'} · valet ${prima.valet?.nome ?? '—'} · servizio ${prima.servizio?.nome ?? '—'}`);
    console.log(`  campi in tutto: ${Object.keys(prima).length} → ${Object.keys(prima).join(', ')}`);
  }

  console.log('\n=== 3) il cursore non ripropone le stesse ===');
  if (lista.corpo?.prossimoCursore) {
    const dopo = await chiama(`/app/consegne?limit=2&aggiornateDa=${encodeURIComponent(lista.corpo.prossimoCursore)}`);
    const nuoveNumeri = (dopo.corpo?.consegne ?? []).map((x) => x.numero);
    const vecchieNumeri = (lista.corpo?.consegne ?? []).map((x) => x.numero);
    const sovrapposte = nuoveNumeri.filter((n) => vecchieNumeri.includes(n));
    console.log(`  seconda pagina: ${dopo.corpo?.quante} righe · sovrapposte con la prima: ${sovrapposte.length} ${sovrapposte.length === 0 ? '✅' : '❌'}`);
  }

  console.log('\n=== 4) una consegna per numero (una col plus, per vedere lo scomposto) ===');
  const conPlus = await db.delivery.findFirst({
    where: { deletedAt: null, valetAdditionalPrice: { gt: 5 }, payable: true },
    select: { code: true },
  });
  if (conPlus) {
    const una = await chiama(`/app/consegne/${conPlus.code}`);
    const c = una.corpo?.costoConsegna;
    console.log(`  #${una.corpo?.numero} · HTTP ${una.stato}`);
    console.log(`  pagaScritta ${c?.pagaScritta} · plusContato ${c?.plusContato} · plusScartato ${c?.plusScartato} → paga ${c?.paga} + ritenuta ${c?.ritenuta} = ${c?.totale}`);
    console.log(`  esito: ${una.corpo?.esito?.stato}, consegnata il ${una.corpo?.esito?.consegnataIl ?? '—'}`);
  }

  console.log('\n=== 5) numero che non esiste: 404 pulito ===');
  const manca = await chiama('/app/consegne/99999999');
  console.log(`  HTTP ${manca.stato} · ${manca.corpo?.message ?? manca.testo.slice(0, 80)}`);

  console.log('\n=== 6) una cancellata logicamente NON esce ===');
  const cancellata = await db.delivery.findFirst({ where: { deletedAt: { not: null } }, select: { code: true } });
  if (cancellata) {
    const c = await chiama(`/app/consegne/${cancellata.code}`);
    console.log(`  #${cancellata.code} → HTTP ${c.stato} ${c.stato === 404 ? '✅ (giusto: per chi legge non esiste)' : '❌'}`);
  }
} finally {
  await db.appApiKey.delete({ where: { id: creata.id } });
  const resta = await db.appApiKey.findUnique({ where: { id: creata.id } });
  console.log(`\nchiave temporanea cancellata: ${resta ? '❌ c.e ancora' : '✅'}`);
  await db.$disconnect();
}
