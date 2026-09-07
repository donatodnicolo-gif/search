/**
 * LA TABELLA «DOVE STA LA SCHEDA SUI NEGOZI» (07/09/2026, chiesto dall'utente: pubblicare
 * un prodotto su più brand, nuovo o esistente).
 *
 * Crea `merchandising."PubblicazioneNegozio"` come la descrive prisma/schema.prisma, con
 * CREATE ... IF NOT EXISTS: si può rilanciare. Non tocca nessuna riga esistente; la
 * tabella si riempie dall'import delle collezioni (una riga per prodotto riconosciuto,
 * origine «import») e dal modulo prodotto (origine «modulo»).
 *
 * PROVA di default; `--scrivi` esegue.
 *   node scripts/crea-tabella-pubblicazioni.mjs [--scrivi]
 */
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { PrismaClient } = require("@prisma/client");
const SCRIVI = process.argv.includes("--scrivi");

const env = fs.readFileSync(new URL("../.env", import.meta.url), "utf8").split(/\r?\n/);
const riga = env.find((l) => l.startsWith("DATABASE_URL="));
if (!riga) throw new Error("DATABASE_URL non trovata nel .env");
const u = new URL(riga.slice("DATABASE_URL=".length).trim().replace(/^"|"$/g, ""));
u.searchParams.set("schema", "merchandising");
const db = new PrismaClient({ datasources: { db: { url: u.toString() } } });

const SQL = [
  `CREATE TABLE IF NOT EXISTS merchandising."PubblicazioneNegozio" (
    "id" TEXT PRIMARY KEY,
    "prodottoId" TEXT NOT NULL REFERENCES merchandising."Prodotto"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "negozio" TEXT NOT NULL,
    "shopifyId" TEXT,
    "handle" TEXT,
    "statoShopify" TEXT,
    "origine" TEXT NOT NULL DEFAULT 'modulo',
    "spintoIl" TIMESTAMP(3),
    "errore" TEXT,
    "creatoIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aggiornatoIl" TIMESTAMP(3) NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "PubblicazioneNegozio_prodottoId_negozio_key" ON merchandising."PubblicazioneNegozio"("prodottoId", "negozio")`,
  `CREATE INDEX IF NOT EXISTS "PubblicazioneNegozio_negozio_shopifyId_idx" ON merchandising."PubblicazioneNegozio"("negozio", "shopifyId")`,
];

const c = await db.$queryRawUnsafe(
  `SELECT table_name FROM information_schema.tables WHERE table_schema='merchandising' AND table_name='PubblicazioneNegozio'`,
);
if (c.length) console.log("tabella già presente");
else if (SCRIVI) {
  for (const s of SQL) await db.$executeRawUnsafe(s);
  console.log("tabella e indici creati");
} else console.log("PROVA: la tabella PubblicazioneNegozio andrebbe creata (rilancia con --scrivi)");
await db.$disconnect();
