// Assegna i due ambiti di LETTURA nati il 27/08/2026 alle chiavi che ne hanno
// davvero bisogno. Tutte le altre restano chiuse — è il senso della modifica.
//
// ⚠️ Chi riceve cosa è MISURATO, non supposto: si è cercato nel codice delle
// altre app chi legge `datiFinanziari` e chi legge `contatti` dal registro.
//   · datiFinanziari → SOLO deluxy-partner (FINANCE): è l'unica app che li usa
//     (fatture, pro-forma, bonifici).
//   · contatti       → deluxy-partner, deluxy-messaging (Customer Service),
//     deluxy-scout (rubrica di chi visita) e app-ai-mail, che aggancia le mail
//     ai clienti confrontando le email dei referenti.
// ⚠️ Restano SENZA di proposito: deluxy-suppliers e commercial-key (rigirano la
// risposta al browser dei loro utenti e non mostrano né persone né IBAN),
// nuovo-fornitori-cs e deluxy-platform (scrivono, non leggono le persone).
//
//   npx tsx scripts/assegna-ambiti-lettura.mts            → elenca, non scrive
//   npx tsx scripts/assegna-ambiti-lettura.mts --scrivi   → scrive
import "dotenv/config";
import { prisma } from "../src/lib/db";

const SCRIVI = process.argv.includes("--scrivi");
const FINANZIARI = ["deluxy-partner"];
const PERSONE = ["deluxy-partner", "deluxy-messaging", "deluxy-scout", "deluxy-scout-partner", "app-ai-mail"];

const chiavi = await prisma.apiKey.findMany({ orderBy: { creataIl: "asc" } });
for (const k of chiavi) {
  const fin = FINANZIARI.includes(k.nome);
  const per = PERSONE.includes(k.nome);
  const cambia = k.leggeDatiFinanziari !== fin || k.leggePersone !== per;
  console.log(
    `${k.nome.padEnd(24)} finanziari: ${k.leggeDatiFinanziari ? "sì" : "no"} → ${fin ? "SÌ" : "no"}   ` +
      `persone: ${k.leggePersone ? "sì" : "no"} → ${per ? "SÌ" : "no"}${cambia ? "   ←" : ""}`,
  );
  if (SCRIVI && cambia) {
    await prisma.apiKey.update({ where: { id: k.id }, data: { leggeDatiFinanziari: fin, leggePersone: per } });
  }
}
console.log(SCRIVI ? "\nscritto." : "\n(prova: non ho scritto niente — rilancia con --scrivi)");
await prisma.$disconnect();
