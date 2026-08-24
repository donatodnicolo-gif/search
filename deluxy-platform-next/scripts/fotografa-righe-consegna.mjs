// Scatta la fotografia sulle righe di consegna che non ce l'hanno.
//
// La riga di consegna NON e' un record agganciato al prodotto: e' la stampa di
// uno stato di fatto, come il destinatario e l'indirizzo. Ma finora il nome del
// prodotto non era scritto sulla riga — si leggeva dal catalogo. Due
// conseguenze, tutte e due sbagliate:
//
//   1. cancellare un prodotto era IMPOSSIBILE (il database si opponeva), anche
//      se quel prodotto era una prova o un doppione;
//   2. rinominare un prodotto RISCRIVEVA la storia: una consegna del 2023
//      cominciava a dire che era stato portato qualcos'altro.
//
// Questo script scrive sulla riga cio' che il catalogo dice OGGI. Non e'
// perfetto — la fotografia andava scattata allora, non adesso — ma e' il meglio
// che i dati permettono, e da qui in avanti la scatta il codice al momento
// giusto.
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

const daFare = await db.$queryRawUnsafe(`
  select count(*)::int n from "platform"."DeliveryProduct"
   where "productName" is null and "productId" is not null`);
const vendite = await db.$queryRawUnsafe(`
  select count(*)::int n from "platform"."Sale"
   where "productName" is null and "productId" is not null`);
console.log(`righe di consegna senza fotografia: ${daFare[0].n}`);
console.log(`vendite senza fotografia:           ${vendite[0].n}`);

if (!SCRIVI) { console.log('\n(prova a vuoto: rilanciare con --scrivi)'); await db.$disconnect(); process.exit(0); }

// Una UPDATE ... FROM sola: 59.141 righe una per una attraverso il pooler non
// arrivano in fondo (gia' successo il 23/08 con i clienti).
const a = await db.$executeRawUnsafe(`
  update "platform"."DeliveryProduct" dp
     set "productName" = p.name,
         "productSku"  = p.sku,
         -- il nome della variante con una sottoquery: Postgres non ammette di
         -- agganciare dp dentro il FROM di una UPDATE
         "variantName" = (select v.name from "platform"."ProductVariant" v where v.id = dp."productVariantId")
    from "platform"."Product" p
   where p.id = dp."productId" and dp."productName" is null`);
console.log(`\n✅ righe di consegna fotografate: ${a}`);

const b = await db.$executeRawUnsafe(`
  update "platform"."Sale" s
     set "productName" = p.name, "productSku" = p.sku
    from "platform"."Product" p
   where p.id = s."productId" and s."productName" is null`);
console.log(`✅ vendite fotografate: ${b}`);

const resto = await db.$queryRawUnsafe(`
  select count(*)::int n from "platform"."DeliveryProduct" where "productName" is null`);
console.log(`\n   righe ancora senza nome: ${resto[0].n} (sono quelle senza prodotto collegato)`);
const conVar = await db.$queryRawUnsafe(`
  select count(*)::int n from "platform"."DeliveryProduct" where "variantName" is not null`);
console.log(`   righe con anche il nome della variante: ${conVar[0].n}`);
await db.$disconnect();
