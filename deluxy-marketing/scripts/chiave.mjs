// Crea una chiave API per /api/v1: la chiave si stampa UNA volta sola,
// nel database resta solo lo SHA-256.
//   npm run chiave -- <nome> [--sola-lettura]
import { createHash, randomBytes } from "crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const argomenti = process.argv.slice(2).filter((a) => a !== "--");
const nome = argomenti.find((a) => !a.startsWith("--"));
const solaLettura = argomenti.includes("--sola-lettura");

if (!nome) {
  console.error("Uso: npm run chiave -- <nome-client> [--sola-lettura]");
  process.exit(1);
}

const chiave = `dmk_${randomBytes(24).toString("hex")}`;
const hash = createHash("sha256").update(chiave).digest("hex");

await prisma.apiKey.create({ data: { nome, hash, scrittura: !solaLettura } });
console.log(`Chiave creata per "${nome}" (${solaLettura ? "sola lettura" : "lettura+scrittura"}):`);
console.log(chiave);
console.log("\nConservala ora: non sarà più recuperabile. Header: x-api-key");
await prisma.$disconnect();
