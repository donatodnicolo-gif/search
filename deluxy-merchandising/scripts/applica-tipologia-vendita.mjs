/**
 * TIPOLOGIA DI VENDITA IN MERCHANDISING (06/09/2026, decisione dell'utente: «la casa della
 * tipologia è Merchandising»).
 *
 * Due cose, in quest'ordine:
 *  1. aggiunge la colonna `Prodotto.tipologiaVendita` (nullable: nessun prodotto cambia);
 *  2. la RIEMPIE copiando la classificazione già fatta nella piattaforma consegne, dove i
 *     prodotti si abbinano per codice (`Product.sku` = `Prodotto.codice`). Non riclassifica
 *     niente da capo: la piattaforma l'ha fatto stasera con regole scritte, e due
 *     classificazioni diverse per lo stesso prodotto sarebbero due verità.
 *
 * I prodotti che nella piattaforma non esistono restano NULL — «da classificare» — e li
 * compila una persona dal modulo prodotto, dove la tendina è obbligatoria.
 *
 * PROVA di default; `--scrivi` esegue.
 */
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { PrismaClient } = require("@prisma/client");
const SCRIVI = process.argv.includes("--scrivi");

const env = fs.readFileSync("C:/Users/nicol/scoutwt/deluxy-merchandising/.env", "utf8").split(/\r?\n/);
const url = (nome, schema) => {
  const riga = env.find((l) => l.startsWith(nome + "="));
  if (!riga) throw new Error(nome + " non trovata nel .env");
  const u = new URL(riga.slice(nome.length + 1).trim().replace(/^"|"$/g, ""));
  u.searchParams.set("schema", schema);
  return u.toString();
};
const merch = new PrismaClient({ datasources: { db: { url: url("DATABASE_URL", "merchandising") } } });
const piatta = new PrismaClient({ datasources: { db: { url: url("DATABASE_URL", "platform") } } });

// 1. la colonna
const colonna = await merch.$queryRawUnsafe(
  `SELECT column_name FROM information_schema.columns WHERE table_schema='merchandising' AND table_name='Prodotto' AND column_name='tipologiaVendita'`,
);
if (colonna.length) console.log("colonna già presente");
else if (SCRIVI) {
  await merch.$executeRawUnsafe(`ALTER TABLE merchandising."Prodotto" ADD COLUMN "tipologiaVendita" TEXT`);
  console.log("colonna creata");
} else console.log("PROVA: la colonna tipologiaVendita andrebbe creata");

// 2. il travaso dalla piattaforma, per codice
const dallaPiattaforma = await piatta.$queryRawUnsafe(
  `SELECT UPPER(sku) AS sku, "tipologiaVendita" AS t FROM platform."Product" WHERE sku IS NOT NULL AND "tipologiaVendita" IS NOT NULL AND "deletedAt" IS NULL`,
);
const mappa = new Map(dallaPiattaforma.map((r) => [r.sku, r.t]));
const prodotti = await merch.$queryRawUnsafe(
  `SELECT id, UPPER(codice) AS codice FROM merchandising."Prodotto" WHERE "unitoAId" IS NULL`,
);
const daScrivere = prodotti.filter((p) => mappa.has(p.codice));
const conteggio = {};
for (const p of daScrivere) { const t = mappa.get(p.codice); conteggio[t] = (conteggio[t] ?? 0) + 1; }
console.table([
  { voce: "prodotti in Merchandising", n: prodotti.length },
  { voce: "classificati nella piattaforma", n: mappa.size },
  { voce: "→ abbinati per codice e da scrivere", n: daScrivere.length },
  { voce: "→ restano da classificare a mano", n: prodotti.length - daScrivere.length },
]);
console.log("per tipologia:", Object.entries(conteggio).map(([k, v]) => `${k}=${v}`).join(" · "));

if (SCRIVI && colonna.length + 1) {
  let n = 0;
  for (const [tipo, _] of Object.entries(conteggio)) {
    const ids = daScrivere.filter((p) => mappa.get(p.codice) === tipo).map((p) => p.id);
    for (let i = 0; i < ids.length; i += 500) {
      const lotto = ids.slice(i, i + 500);
      n += await merch.$executeRawUnsafe(
        `UPDATE merchandising."Prodotto" SET "tipologiaVendita" = $1 WHERE id = ANY($2::text[])`, tipo, lotto,
      );
    }
  }
  console.log(`SCRITTI: ${n}`);
} else if (!SCRIVI) console.log("PROVA: nulla scritto. `--scrivi` per applicare.");

await merch.$disconnect();
await piatta.$disconnect();
