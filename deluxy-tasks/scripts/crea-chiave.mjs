// Crea (o rigenera) una chiave API per un'app client di Deluxy Tasks.
// Uso:  npm run chiave -- <nome-app> [--scrittura]
// Esempio: npm run chiave -- deluxy-scout --scrittura
//
// La chiave viene stampata UNA SOLA VOLTA: nel database resta solo lo SHA-256.
// Copiarla nel .env dell'app client (es. TASKS_API_KEY=...).
import { PrismaClient } from "@prisma/client";
import { createHash, randomBytes } from "crypto";

const prisma = new PrismaClient();

const argomenti = process.argv.slice(2).filter((a) => a !== "--");
const nome = argomenti.find((a) => !a.startsWith("--"));
const scrittura = argomenti.includes("--scrittura");

if (!nome) {
  console.error("Uso: npm run chiave -- <nome-app> [--scrittura]");
  process.exit(1);
}

const chiave = `dltk_${randomBytes(24).toString("hex")}`;
const hash = createHash("sha256").update(chiave).digest("hex");

await prisma.apiKey.upsert({
  where: { nome },
  create: { nome, hash, scrittura },
  update: { hash, scrittura, attiva: true },
});

console.log(`Chiave API per "${nome}" (${scrittura ? "lettura+scrittura" : "sola lettura"}):`);
console.log();
console.log(`  ${chiave}`);
console.log();
console.log("Conservala ora: non sarà più recuperabile (nel DB c'è solo l'hash).");

await prisma.$disconnect();
