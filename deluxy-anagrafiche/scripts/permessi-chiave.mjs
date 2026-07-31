// Cambia i PERMESSI di una chiave API già esistente, senza rigenerarla.
//
// Perché serve: `crea-chiave.mjs` rifà anche il segreto, quindi per aggiungere
// uno scope a una chiave già in uso bisognerebbe reincollarla in tutte le app
// che la usano. Qui si tocca solo il permesso: la chiave resta quella.
//
// Uso:
//   node --env-file=.env scripts/permessi-chiave.mjs <nome>                 (mostra)
//   node --env-file=.env scripts/permessi-chiave.mjs <nome> --scrittura-partner
//   node --env-file=.env scripts/permessi-chiave.mjs <nome> --no-scrittura-partner
//
// Gli scope: `--scrittura` (PATCH/DELETE sul partner), `--scrittura-partner`
// (driver di PRIMA PARTE: può dichiarare stato commerciale e interessi, che di
// norma restano curati dal team), `--scrittura-referenti`, `--scrittura-feedback`.
// Ogni scope ha la sua forma `--no-…` per toglierlo.
//
// ⚠️ Non stampa mai la chiave: qui si vedono solo nome e permessi.
import { PrismaClient } from "@prisma/client";

const argomenti = process.argv.slice(2);
const nome = argomenti.find((a) => !a.startsWith("--"));
if (!nome) {
  console.error("Manca il nome della chiave. Es: node scripts/permessi-chiave.mjs app-ai-mail --scrittura-partner");
  process.exit(1);
}

const SCOPE = {
  "scrittura": "scrittura",
  "scrittura-partner": "scritturaPartner",
  "scrittura-referenti": "scritturaReferenti",
  "scrittura-feedback": "scritturaFeedback",
};

const cambi = {};
for (const a of argomenti) {
  if (!a.startsWith("--")) continue;
  const spento = a.startsWith("--no-");
  const chiave = a.replace(/^--(no-)?/, "");
  const campo = SCOPE[chiave];
  if (!campo) {
    console.error(`Scope sconosciuto: ${a}. Ammessi: ${Object.keys(SCOPE).map((s) => `--${s}`).join(", ")}`);
    process.exit(1);
  }
  cambi[campo] = !spento;
}

const VISTA = {
  nome: true,
  scrittura: true,
  scritturaPartner: true,
  scritturaReferenti: true,
  scritturaFeedback: true,
  attiva: true,
  ultimoUso: true,
};

const prisma = new PrismaClient();
try {
  const prima = await prisma.apiKey.findUnique({ where: { nome }, select: VISTA });
  if (!prima) {
    console.error(`Nessuna chiave con nome «${nome}».`);
    process.exit(1);
  }
  console.log("PRIMA:", JSON.stringify(prima));

  if (Object.keys(cambi).length === 0) {
    console.log("\nNessuno scope indicato: non ho cambiato niente.");
  } else {
    const dopo = await prisma.apiKey.update({ where: { nome }, data: cambi, select: VISTA });
    console.log("DOPO :", JSON.stringify(dopo));
  }
} catch (e) {
  console.error("Errore:", String(e?.message || e).split("\n")[0]);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
