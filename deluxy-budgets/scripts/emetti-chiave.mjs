// Emette una chiave API di questa app per un'app client, da riga di comando —
// la stessa cosa che fa Configurazione → Chiavi, per quando serve da script.
// Uso: node scripts/emetti-chiave.mjs <nome-app> [--scrittura]
// La chiave si stampa UNA volta sola: a database resta l'impronta SHA-256
// (stessa convenzione di src/lib/chiavi-emesse.ts: prefisso dxb_, 32 byte).
import { PrismaClient } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";

const prisma = new PrismaClient();

const argomenti = process.argv.slice(2).filter((a) => a !== "--");
const nome = argomenti.find((a) => !a.startsWith("--"));
const scope = argomenti.includes("--scrittura") ? "scrittura" : "lettura";

if (!nome) {
  console.error("Uso: node scripts/emetti-chiave.mjs <nome-app> [--scrittura]");
  process.exit(1);
}

const chiaro = "dxb_" + randomBytes(32).toString("base64url");
const prefisso = chiaro.slice(0, 10);
const hash = createHash("sha256").update(chiaro, "utf8").digest("hex");

await prisma.chiaveEmessa.create({ data: { nome, prefisso, hash, scope } });

console.log(`Chiave emessa per «${nome}» (scope ${scope}):`);
console.log();
console.log(`  ${chiaro}`);
console.log();
console.log("Conservala ora: non sarà più recuperabile (a database c'è solo l'impronta).");
console.log("Si revoca da Budgets → Configurazione → Chiavi.");

await prisma.$disconnect();
