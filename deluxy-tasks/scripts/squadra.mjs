// Gestisce le squadre del calendario (chi vede gli eventi di chi). Un utente non
// admin vede i propri eventi + quelli dei compagni di squadra.
//
// Uso:
//   npm run squadra -- "<Nome squadra>" <email1> <email2> ...   aggiunge i membri
//   npm run squadra -- "<Nome squadra>" --rimuovi <email> ...    toglie i membri
//   npm run squadra -- --elenco                                  mostra le squadre
//
// Es.: npm run squadra -- "Commerciali Milano" mario@deluxy.it luca@deluxy.it
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const argv = process.argv.slice(2).filter((a) => a !== "--");

if (argv[0] === "--elenco") {
  const squadre = await prisma.squadra.findMany({ include: { membri: true }, orderBy: { nome: "asc" } });
  if (!squadre.length) console.log("Nessuna squadra.");
  for (const s of squadre) {
    console.log(`\n${s.nome}`);
    for (const m of s.membri) console.log(`  - ${m.utenteEmail}`);
  }
  await prisma.$disconnect();
  process.exit(0);
}

const nome = argv.find((a) => !a.startsWith("--") && !a.includes("@"));
const rimuovi = argv.includes("--rimuovi");
const email = argv.filter((a) => a.includes("@")).map((e) => e.trim().toLowerCase());

if (!nome || email.length === 0) {
  console.error('Uso: npm run squadra -- "<Nome>" <email...>   |   --rimuovi <email...>   |   --elenco');
  process.exit(1);
}

const squadra = await prisma.squadra.upsert({
  where: { nome },
  create: { nome },
  update: {},
});

if (rimuovi) {
  const r = await prisma.membroSquadra.deleteMany({
    where: { squadraId: squadra.id, utenteEmail: { in: email } },
  });
  console.log(`Rimossi ${r.count} membri da "${nome}".`);
} else {
  for (const e of email) {
    await prisma.membroSquadra.upsert({
      where: { squadraId_utenteEmail: { squadraId: squadra.id, utenteEmail: e } },
      create: { squadraId: squadra.id, utenteEmail: e },
      update: {},
    });
  }
  console.log(`Squadra "${nome}": aggiunti ${email.length} membri (${email.join(", ")}).`);
}

await prisma.$disconnect();
