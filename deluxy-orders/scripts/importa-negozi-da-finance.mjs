// Copia i negozi Shopify già collegati in Deluxy Partner (Finance) dentro il
// registro Orders: stesso cluster Postgres, schema diverso. Serve a non
// riconfigurare a mano le stesse credenziali in due app.
//
// Uso: node scripts/importa-negozi-da-finance.mjs [percorso-env-finance]
//      (default: ../deluxy-partner/.env)
//
// Non stampa mai token, Client ID o Secret.
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";
import { resolve } from "path";

const sorgente = process.argv[2] || "../deluxy-partner/.env";

function urlDaEnv(percorso, nome) {
  const righe = readFileSync(resolve(percorso), "utf8").split(/\r?\n/);
  const riga = righe.find((r) => r.startsWith(nome + "="));
  if (!riga) return null;
  let v = riga.slice(nome.length + 1).trim();
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  return v;
}

const urlFinance = urlDaEnv(sorgente, "DATABASE_URL");
if (!urlFinance) {
  console.error(`DATABASE_URL non trovata in ${sorgente}`);
  process.exit(1);
}

// Client sul DB di Orders (dal .env di questa app) e su quello di Finance.
const orders = new PrismaClient();
const finance = new PrismaClient({ datasources: { db: { url: urlFinance } } });

const negozi = await finance.negozioShopify.findMany();
console.log(`Trovati ${negozi.length} negozi in Finance.`);

let creati = 0;
let aggiornati = 0;
for (const n of negozi) {
  const esistente = await orders.negozioShopify.findUnique({ where: { brand: n.brand } });
  const dati = {
    dominio: n.dominio,
    token: "", // il token si conia da sé al primo uso col client credentials grant
    clientId: n.clientId,
    clientSecret: n.clientSecret,
    tokenScadeIl: null,
    attivo: n.attivo,
  };
  if (esistente) {
    await orders.negozioShopify.update({ where: { id: esistente.id }, data: dati });
    aggiornati++;
  } else {
    await orders.negozioShopify.create({ data: { brand: n.brand, ...dati } });
    creati++;
  }
  const auth = n.clientId ? "client credentials" : n.token ? "token statico" : "NESSUNA";
  console.log(`- ${n.brand} (${n.dominio}) → ${auth}${n.attivo ? "" : " [sospeso]"}`);
}

console.log(`\nNegozi creati: ${creati} · aggiornati: ${aggiornati}`);
await orders.$disconnect();
await finance.$disconnect();
