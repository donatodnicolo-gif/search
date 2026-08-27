/**
 * PROVA REALE, in produzione:
 *  1) il TOTALE dell'elenco per consegna combacia con quello di costi-consegne
 *     (il numero che legge Budgets)?
 *  2) una chiave di SOLA LETTURA riesce a creare una consegna? (non deve)
 *  3) la creazione dal canale app funziona e passa dalla strada del form?
 *
 * Le chiavi sono usa-e-getta e non si stampano mai. La consegna di prova viene
 * CANCELLATA alla fine, e il conto delle consegne si rilegge per dimostrarlo.
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
const eur = (n) => (n ?? 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const nuovaChiave = async (nome, scrittura) => {
  const valore = crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(valore).digest('hex');
  const r = await db.appApiKey.create({ data: { nome, hash, attiva: true, scrittura } });
  return { id: r.id, valore };
};
const chiama = async (percorso, chiave, opzioni = {}) => {
  const res = await fetch(`${BASE}${percorso}`, {
    ...opzioni,
    headers: { 'x-api-key': chiave, 'Content-Type': 'application/json', ...(opzioni.headers ?? {}) },
  });
  const testo = await res.text();
  let corpo = null;
  try { corpo = JSON.parse(testo); } catch { /* non JSON */ }
  return { stato: res.status, corpo, testo };
};

const lettura = await nuovaChiave('PROVA sola lettura (usa e getta)', false);
const scrittura = await nuovaChiave('PROVA scrittura (usa e getta)', true);
let consegnaCreata = null;

try {
  console.log('\n=== 1) IL TOTALE COMBACIA CON QUELLO DI BUDGETS? ===');
  const [elenco, budget] = await Promise.all([
    chiama('/app/consegne?dal=2026-01-01&al=2026-12-31&limit=1', lettura.valore),
    chiama('/app/costi-consegne?anno=2026', lettura.valore),
  ]);
  const t = elenco.corpo?.totali;
  const b = budget.corpo?.totali;
  console.log(`  elenco per consegna : costo ${eur(t?.costo)} (paga ${eur(t?.paga)} + ritenute ${eur(t?.ritenute)}) su ${t?.consegneNelCosto} consegne`);
  console.log(`  costi-consegne      : costo ${eur(b?.costo)} (paga ${eur(b?.paga)} + ritenute ${eur(b?.ritenute)}) su ${b?.consegne} consegne`);
  const scarto = Math.abs((t?.costo ?? 0) - (b?.costo ?? 0));
  console.log(`  scarto: ${eur(scarto)} ${scarto < 0.02 ? '✅ COMBACIANO' : '❌ DIVERGONO'}`);
  console.log(`  base dichiarata: ${t?.consegneNelFiltro} nel filtro, ${t?.consegneNelCosto} nel costo, ${t?.consegneFuoriDalCosto} fuori`);

  console.log('\n=== 2) una chiave di SOLA LETTURA non deve poter creare ===');
  const rifiutata = await chiama('/app/consegne', lettura.valore, {
    method: 'POST',
    body: JSON.stringify({ date: '2026-09-01', serviceTypeId: 'x', partnerId: 'y', recipientAddress: 'Via di prova 1' }),
  });
  console.log(`  HTTP ${rifiutata.stato} · ${String(rifiutata.corpo?.message ?? '').slice(0, 90)} ${rifiutata.stato === 401 ? '✅' : '❌'}`);

  console.log('\n=== 3) creazione con la chiave di SCRITTURA ===');
  // Un partner attivo e uno dei SUOI servizi: la consegna dev'essere plausibile.
  const partner = await db.partner.findFirst({
    where: { active: true, services: { some: {} } },
    select: { id: true, insegna: true, services: { select: { serviceTypeId: true }, take: 1 } },
  });
  const corpo = {
    date: '2026-09-01',
    partnerId: partner.id,
    serviceTypeId: partner.services[0].serviceTypeId,
    recipientFirstName: 'PROVA',
    recipientLastName: 'CANALE APP',
    recipientAddress: 'Via di prova 1, Milano',
    deliveryTimeFrom: '09:00',
    deliveryTimeTo: '12:00',
  };
  const creata = await chiama('/app/consegne', scrittura.valore, { method: 'POST', body: JSON.stringify(corpo) });
  console.log(`  HTTP ${creata.stato}`);
  if (creata.corpo?.numero) {
    consegnaCreata = creata.corpo.numero;
    console.log(`  #${creata.corpo.numero} · partner ${creata.corpo.partner?.insegna} · servizio ${creata.corpo.servizio?.nome}`);
    console.log(`  stato ${creata.corpo.esito?.stato} · prezzo dal listino: ${creata.corpo.economiaPartner?.prezzo} · costo ${eur(creata.corpo.costoConsegna?.totale)}`);
    console.log(`  risposta nello stesso formato della lettura: ${Object.keys(creata.corpo).length} blocchi`);
    // La strada del form lascia tracce: attivita' e registro.
    const dentro = await db.delivery.findFirst({
      where: { code: creata.corpo.numero },
      select: { id: true, _count: { select: { activities: true, logs: true } } },
    });
    console.log(`  attivita' generate: ${dentro?._count.activities} · righe di registro: ${dentro?._count.logs}`);
  } else {
    console.log(`  ${creata.testo.slice(0, 200)}`);
  }
} finally {
  if (consegnaCreata) {
    const d = await db.delivery.findFirst({ where: { code: consegnaCreata }, select: { id: true } });
    if (d) {
      await db.delivery.delete({ where: { id: d.id } });
      const resta = await db.delivery.findFirst({ where: { code: consegnaCreata } });
      console.log(`\nconsegna di prova #${consegnaCreata} cancellata: ${resta ? '❌ c.e ancora' : '✅'}`);
    }
  }
  await db.appApiKey.deleteMany({ where: { id: { in: [lettura.id, scrittura.id] } } });
  const restano = await db.appApiKey.count({ where: { id: { in: [lettura.id, scrittura.id] } } });
  console.log(`chiavi di prova cancellate: ${restano === 0 ? '✅' : '❌ ne restano ' + restano}`);
  await db.$disconnect();
}
