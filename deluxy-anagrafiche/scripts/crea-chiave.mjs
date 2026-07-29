// Crea (o rigenera) una chiave API per un'app client.
// Uso:  npm run chiave -- <nome-app> [--scrittura | --scrittura-partner | --scrittura-referenti | --scrittura-feedback]
// Esempi:
//   npm run chiave -- deluxy-platform --scrittura           (scrittura piena)
//   npm run chiave -- deluxy-scout-referenti --scrittura-referenti  (solo archivio referenti)
//   npm run chiave -- deluxy-messaging-feedback --scrittura-feedback (solo feedback D2C)
//
// La chiave viene stampata UNA SOLA VOLTA: nel database resta solo lo SHA-256.
// Copiarla nel .env dell'app client (es. ANAGRAFICHE_API_KEY=...).
import { PrismaClient } from "@prisma/client";
import { createHash, randomBytes } from "crypto";

const prisma = new PrismaClient();

const argomenti = process.argv.slice(2).filter((a) => a !== "--");
const nome = argomenti.find((a) => !a.startsWith("--"));
const scrittura = argomenti.includes("--scrittura");
const scritturaReferenti = argomenti.includes("--scrittura-referenti");
const scritturaPartner = argomenti.includes("--scrittura-partner");
const scritturaFeedback = argomenti.includes("--scrittura-feedback");

if (!nome) {
  console.error(
    "Uso: npm run chiave -- <nome-app> [--scrittura | --scrittura-partner | --scrittura-referenti | --scrittura-feedback]",
  );
  process.exit(1);
}

const chiave = `dlxk_${randomBytes(24).toString("hex")}`;
const hash = createHash("sha256").update(chiave).digest("hex");
// Primi caratteri in chiaro: bastano a riconoscere la chiave nella pagina
// /chiavi, non a usarla.
const prefisso = `${chiave.slice(0, 12)}…`;

await prisma.apiKey.upsert({
  where: { nome },
  create: { nome, hash, prefisso, scrittura, scritturaReferenti, scritturaPartner, scritturaFeedback },
  update: { hash, prefisso, scrittura, scritturaReferenti, scritturaPartner, scritturaFeedback, attiva: true },
});

const permesso = scrittura
  ? "lettura+scrittura"
  : scritturaPartner
    ? "lettura + upsert partner (POST, con stato/interessi)"
    : scritturaReferenti
      ? "lettura + archivio referenti"
      : scritturaFeedback
        ? "lettura + invio feedback D2C"
        : "sola lettura";
console.log(`Chiave API per "${nome}" (${permesso}):`);
console.log();
console.log(`  ${chiave}`);
console.log();
console.log("Conservala ora: non sarà più recuperabile (nel DB c'è solo l'hash).");

await prisma.$disconnect();
