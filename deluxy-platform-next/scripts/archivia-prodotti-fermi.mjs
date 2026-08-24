// Archivia i prodotti che nessuno ha piu' consegnato nel 2025 e nel 2026, e lo
// dice a Merchandising.
//
// Regola dell'utente (24/08/2026). Il catalogo importato dal legacy contiene
// vent'anni di prodotti: 22.952 schede, di cui 14.896 in lista. Ma i prodotti
// che hanno visto almeno una consegna nel biennio sono 4.886. Il resto e'
// archeologia che rende la lista inutilizzabile.
//
// ⚠️ 30 GIORNI DI GRAZIA. La regola letterale avrebbe archiviato anche i 283
// prodotti arrivati da Merchandising poche ore prima: sono nuovi, non morti, e
// non hanno ancora avuto l'occasione di essere consegnati. Un prodotto appena
// nato non si giudica sul passato che non ha.
//
// ⚠️ Lo stato va a Merchandising in un campo SUO (`statoPiattaforma`), che NON
// e' la `fase` del PLM. Un prodotto puo' essere «in vendita» per loro e
// archiviato qui perche' non lo consegna nessuno da due anni: sono due verita',
// e scriverne una sopra l'altra ne farebbe sparire una.
//
// Di default non scrive. Con --scrivi applica.
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const SCRIVI = process.argv.includes('--scrivi');
const GRAZIA = Number(process.argv.find((a) => a.startsWith('--grazia='))?.split('=')[1] ?? 30);
const MOTIVO = 'mai-consegnato-2025-2026';

const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
const db = new PrismaClient({ datasources: { db: { url:
  `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform&connection_limit=1` } } });

const fermi = await db.$queryRawUnsafe(`
  select p.id, p.sku, p.name, p."createdFrom"
    from "platform"."Product" p
   where not p.archived
     and p."createdAt" < now() - ($1 || ' days')::interval
     and not exists (
       select 1 from "platform"."DeliveryProduct" dp
         join "platform"."Delivery" d on d.id = dp."deliveryId"
        where dp."productId" = p.id
          and d.date >= timestamp '2025-01-01' and d.date < timestamp '2027-01-01')`, String(GRAZIA));

const inLista = await db.product.count({ where: { archived: false } });
console.log(`catalogo: ${await db.product.count()} · in lista: ${inLista}`);
console.log(`consegnati almeno una volta nel 2025-2026: ${inLista - fermi.length}`);
console.log(`🔴 fermi da archiviare: ${fermi.length} (grazia ${GRAZIA} giorni)`);
const risparmiati = await db.product.count({
  where: { archived: false, createdAt: { gte: new Date(Date.now() - GRAZIA * 864e5) } },
});
console.log(`   risparmiati perche' troppo nuovi per essere giudicati: ${risparmiati}`);

if (!SCRIVI) { console.log('\n(prova a vuoto: rilanciare con --scrivi)'); await db.$disconnect(); process.exit(0); }

// 1) archiviazione, a blocchi
let fatti = 0;
for (let i = 0; i < fermi.length; i += 500) {
  const lotto = fermi.slice(i, i + 500);
  const { count } = await db.product.updateMany({
    where: { id: { in: lotto.map((p) => p.id) } },
    data: { archived: true, archivedAt: new Date(), archivedReason: MOTIVO },
  });
  fatti += count;
}
console.log(`\n✅ archiviati ${fatti} · in lista ora: ${await db.product.count({ where: { archived: false } })}`);

// 2) lo stato a Merchandising
const cfg = Object.fromEntries((await db.appSetting.findMany()).map((x) => [x.key, x.value]));
const url = (cfg.merchandisingUrl ?? '').replace(/\/+$/, '');
const chiave = cfg.merchandisingApiKey ?? '';
if (!url || !chiave) { console.log('\n⚠️ Merchandising non configurato: stato non comunicato.'); await db.$disconnect(); process.exit(0); }

const conSku = fermi.filter((p) => p.sku);
let inviati = 0, aggiornati = 0, nonTrovati = 0;
for (let i = 0; i < conSku.length; i += 500) {
  const lotto = conSku.slice(i, i + 500);
  const res = await fetch(`${url}/api/v1/prodotti/stato-piattaforma`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': chiave },
    body: JSON.stringify({ stati: lotto.map((p) => ({ codice: p.sku, stato: 'archiviato' })) }),
  });
  if (!res.ok) { console.log(`   🔴 Merchandising risponde HTTP ${res.status} al lotto ${i / 500 + 1}`); break; }
  const esito = await res.json();
  inviati += esito.ricevuti ?? 0;
  aggiornati += esito.aggiornati ?? 0;
  nonTrovati += esito.nonTrovatiQui ?? 0;
}
console.log(`\n📤 stato comunicato a Merchandising: inviati ${inviati} · aggiornati la' ${aggiornati} · non presenti la' ${nonTrovati}`);
console.log('   (quelli non presenti non sono un errore: sono prodotti che Merchandising non ha mai visto)');
await db.$disconnect();
