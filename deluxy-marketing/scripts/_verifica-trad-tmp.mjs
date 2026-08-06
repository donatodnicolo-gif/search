import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const op = await p.operazioneAdv.findMany({
  where: { tipo: "nuova_keyword", creataIl: { gte: new Date(Date.now() - 15 * 60_000) } },
  orderBy: { creataIl: "desc" },
});
console.log("Operazioni nuova_keyword degli ultimi 15 minuti:", op.length);
for (const o of op) {
  console.log("  ", o.id);
  console.log("     bersaglio:", o.bersaglio, "| stato:", o.stato);
  console.log("     parametri:", o.parametri);
  console.log("     motivo:", o.motivo);
}
if (process.argv.includes("--cancella") && op.length) {
  const r = await p.operazioneAdv.deleteMany({ where: { id: { in: op.map((o) => o.id) } } });
  console.log("\nCancellate (prova):", r.count);
}
await p.$disconnect();
