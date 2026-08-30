// La fattura 605/2026 (D'Ascanio, «Servizi Deluxy Luglio 2026») stava in
// competenza AGOSTO: la descrizione dice luglio, e l'utente il 30/08 ha deciso
// «c'è scritto luglio quindi va dentro luglio».
import { PrismaClient } from "@prisma/client";
import { registra } from "../src/lib/registro";
const prisma = new PrismaClient();
const f = await prisma.fatturaServizio.findFirst({ where: { numero: "605/2026" }, include: { partner: { select: { nome: true } } } });
if (!f) { console.log("605/2026 non trovata"); process.exit(1); }
console.log(`trovata: ${f.numero} · ${f.partner.nome} · comp. ${f.anno}-${f.mese} · ${f.imponibile} €`);
if (f.mese === 7) { console.log("già a luglio, niente da fare"); process.exit(0); }
await prisma.fatturaServizio.update({ where: { id: f.id }, data: { mese: 7 } });
await registra({
  azione: `Fattura 605/2026 spostata a competenza luglio`,
  categoria: "fatture", entita: "fattura", entitaId: f.id, partner: f.partner.nome,
  dettaglio: "La descrizione dice «Servizi Deluxy Luglio 2026» ma la competenza era agosto: allineata (decisione utente 30/08).",
});
console.log("spostata: competenza 2026-07");
await prisma.$disconnect();
