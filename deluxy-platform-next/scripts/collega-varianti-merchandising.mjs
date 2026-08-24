// Dichiara chi comanda sulle varianti, senza spostare niente.
//
// La stessa variante vive in due app: 18.375 in piattaforma, 8.518 in
// Merchandising, e 5.201 hanno lo STESSO SKU e sono lo stesso oggetto
// («Botticelli - Nascita di Venere», Medio / Medio-Grande / Grande / Luxury).
// E' la duplicazione che ha gia' fatto danni: gli ordini arrivano con lo SKU
// della VARIANTE, e per settimane la piattaforma non li riconosceva.
//
// La variante dice COM'E' FATTO il prodotto (taglia, colore): e' mestiere del
// PLM. Qui serve a due cose sole — riconoscere lo SKU di un ordine e prezzare
// una riga di consegna.
//
// ⚠️ Questo script NON cancella e NON copia: scrive solo il collegamento
// (`merchandisingId`). Serve a sapere, quando i due valori discordano, quale
// guardare invece di indovinare. Spostare i dati e' il passo dopo, e va fatto
// sapendo quanti discordano — cosa che oggi nessuno sa, perche' non c'era il
// collegamento per chiederselo.
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
const url = (s) => `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=${s}&connection_limit=1`;

const merch = new PrismaClient({ datasources: { db: { url: url('merchandising') } } });
const varianti = await merch.$queryRawUnsafe(`
  select v.id, v.sku, v.nome, v."deltaCosto", v."deltaPrezzo", p.nome as prodotto, p."prezzoVendita"
    from "merchandising"."Variante" v
    join "merchandising"."Prodotto" p on p.id = v."prodottoId"
   where v.sku is not null`);
await merch.$disconnect();
const perSku = new Map(varianti.map((v) => [v.sku.trim().toUpperCase(), v]));

const db = new PrismaClient({ datasources: { db: { url: url('platform') } } });
const nostre = await db.$queryRawUnsafe(`
  select v.id, v.sku, v.name, v.price, v."publicPrice", v."merchandisingId", p.archived, p.name as prodotto
    from "platform"."ProductVariant" v
    join "platform"."Product" p on p.id = v."productId"
   where v.sku is not null`);

const daCollegare = [], discordanti = [];
for (const n of nostre) {
  const m = perSku.get(n.sku.trim().toUpperCase());
  if (!m) continue;
  if (n.merchandisingId !== m.id) daCollegare.push({ id: n.id, merchandisingId: m.id });
  // Il nome della variante e' il pezzo che si legge a schermo: se discorda,
  // qualcuno vede due cose diverse per lo stesso SKU.
  if (String(n.name).trim().toLowerCase() !== String(m.nome).trim().toLowerCase()) {
    discordanti.push({ sku: n.sku, qui: n.name, la: m.nome, prodotto: n.prodotto, archiviato: n.archived });
  }
}

console.log(`varianti in piattaforma: ${nostre.length} · in Merchandising: ${perSku.size}`);
console.log(`   stesso SKU in tutte e due: ${nostre.filter((n) => perSku.has(n.sku.trim().toUpperCase())).length}`);
console.log(`   🔗 da collegare: ${daCollegare.length}`);
console.log(`\n⚠️ nome della variante DISCORDANTE: ${discordanti.length}`);
console.log(`   di prodotti ancora in lista: ${discordanti.filter((d) => !d.archiviato).length}`);
for (const d of discordanti.slice(0, 8))
  console.log(`   ${d.sku.padEnd(14)}qui «${String(d.qui).slice(0, 22)}» ≠ la' «${String(d.la).slice(0, 22)}»  (${String(d.prodotto).slice(0, 26)})`);

if (!SCRIVI) { console.log('\n(prova a vuoto: rilanciare con --scrivi)'); await db.$disconnect(); process.exit(0); }

let fatti = 0;
for (const c of daCollegare) {
  await db.productVariant.update({ where: { id: c.id }, data: { merchandisingId: c.merchandisingId } });
  fatti++;
  if (fatti % 1000 === 0) console.log(`   … ${fatti}/${daCollegare.length}`);
}
console.log(`\n✅ collegate ${fatti}`);
console.log('   varianti con una madre dichiarata:', await db.productVariant.count({ where: { NOT: { merchandisingId: null } } }));
console.log('   varianti che restano solo nostre:', await db.productVariant.count({ where: { merchandisingId: null } }));
await db.$disconnect();
