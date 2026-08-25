// Emette un token di servizio del Hub da riga di comando — la stessa cosa che
// fa /chiavi → «Token di servizio». A database resta solo lo SHA-256.
// Uso: node scripts/emetti-token.mjs <nome-app> [progetto1,progetto2]
//      (nessun progetto = accesso a tutti; il token si stampa UNA volta sola)
import { PrismaClient } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";

const prisma = new PrismaClient();

const [nome, progettiArg] = process.argv.slice(2).filter((a) => a !== "--");
if (!nome) {
  console.error("Uso: node scripts/emetti-token.mjs <nome-app> [progetto1,progetto2]");
  process.exit(1);
}
const progetti = (progettiArg ?? "").split(",").map((p) => p.trim()).filter(Boolean);

const chiaro = "dht_" + randomBytes(32).toString("base64url");
const hash = createHash("sha256").update(chiaro).digest("hex");

await prisma.tokenApi.create({ data: { nome, hash, progetti } });

console.log(`Token di servizio per «${nome}» (progetti: ${progetti.length ? progetti.join(", ") : "tutti"}):`);
console.log();
console.log(`  ${chiaro}`);
console.log();
console.log("Conservalo ora: non sarà più recuperabile. Si revoca da /chiavi → Token di servizio.");

await prisma.$disconnect();
