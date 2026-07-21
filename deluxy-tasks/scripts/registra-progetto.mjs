// Registra (o aggiorna) un progetto nel registro di Deluxy Tasks, con l'URL di
// callback a cui Tasks lo "richiama" quando una sua task cambia qui.
//
// Uso:  npm run progetto -- <sistema> "<Nome>" [callbackUrl] [--segreto <hmac>]
// Es.:  npm run progetto -- scout "Scout" https://scout.deluxy.it/api/tasks-callback --segreto abc123
//
// Il segreto serve al progetto per verificare la firma HMAC dei callback
// (header x-tasks-signature). Se non lo passi, ne viene generato uno e stampato
// UNA VOLTA (poi resta solo nel DB).
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "crypto";

const prisma = new PrismaClient();
const argv = process.argv.slice(2).filter((a) => a !== "--");

// Estrae --segreto <valore> e lascia gli argomenti posizionali.
let segretoDato = null;
const posizionali = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--segreto") {
    segretoDato = argv[++i] ?? null;
    continue;
  }
  posizionali.push(argv[i]);
}
const [sis, nome, callbackUrl] = posizionali;

if (!sis) {
  console.error('Uso: npm run progetto -- <sistema> "<Nome>" [callbackUrl] [--segreto <hmac>]');
  process.exit(1);
}

const callbackSegreto = callbackUrl ? (segretoDato ?? randomBytes(24).toString("hex")) : segretoDato ?? undefined;

const dati = {
  nome: nome ?? sis,
  callbackUrl: callbackUrl ?? null,
  ...(callbackSegreto ? { callbackSegreto } : {}),
};

await prisma.progetto.upsert({
  where: { sistema: sis },
  create: { sistema: sis, ...dati },
  update: dati,
});

console.log(`Progetto "${sis}" registrato${callbackUrl ? ` con callback ${callbackUrl}` : " (senza callback)"}.`);
if (callbackUrl && !segretoDato) {
  console.log();
  console.log("Segreto per verificare i callback (conservalo nel progetto):");
  console.log(`  ${callbackSegreto}`);
}

await prisma.$disconnect();
