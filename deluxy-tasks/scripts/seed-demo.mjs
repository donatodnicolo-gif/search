// Popola qualche task di esempio per vedere la UI (solo sviluppo).
// Uso: npm run seed:demo
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const oggi = new Date();
function fra(giorni) {
  const d = new Date(oggi);
  d.setDate(d.getDate() + giorni);
  return d;
}

const demo = [
  {
    sistema: "mail",
    idEsterno: "demo-mail-1",
    utenteEmail: "donatod.nicolo@gmail.com",
    utenteNome: "Donato",
    titolo: "Rispondere a Bottega Veneta sul preventivo",
    descrizione: "Chiedono i tempi di consegna per l'evento del 5.",
    priorita: "alta",
    scadenza: fra(1),
    link: "http://localhost:3070",
    contestoTipo: "mail",
    contestoEtichetta: "BOTTEGA VENETA — Milano",
    tag: ["preventivo"],
  },
  {
    sistema: "scout",
    idEsterno: "demo-scout-1",
    utenteEmail: "donatod.nicolo@gmail.com",
    utenteNome: "Donato",
    titolo: "Visita da Pasticceria Marchesi",
    priorita: "media",
    scadenza: fra(3),
    contestoTipo: "partner",
    contestoEtichetta: "MARCHESI 1824 — Milano",
  },
  {
    sistema: "platform",
    idEsterno: "demo-plat-1",
    utenteEmail: "gaia@deluxy.it",
    utenteNome: "Gaia",
    titolo: "Confermare valletto per consegna di domani",
    priorita: "urgente",
    scadenza: oggi,
    contestoTipo: "consegna",
    contestoEtichetta: "Consegna #4821",
  },
  {
    sistema: "partner",
    idEsterno: "demo-part-1",
    utenteEmail: "gaia@deluxy.it",
    utenteNome: "Gaia",
    titolo: "Emettere bonifico SEPA fornitore fiori",
    priorita: "media",
    scadenza: fra(5),
  },
];

for (const t of demo) {
  await prisma.task.upsert({
    where: { sistema_idEsterno: { sistema: t.sistema, idEsterno: t.idEsterno } },
    create: t,
    update: t,
  });
}

// Una task con PIÙ livelli di priorità e date diverse (es. data ideale vs limite).
const conLivelli = {
  sistema: "partner",
  idEsterno: "demo-livelli-1",
  utenteEmail: "donatod.nicolo@gmail.com",
  utenteNome: "Donato",
  titolo: "Chiudere il bilancio trimestrale",
  descrizione: "Meglio prima, ma la scadenza vera è fine mese.",
  stato: "aperta",
  contestoTipo: "documento",
  contestoEtichetta: "Bilancio Q3",
};
const task = await prisma.task.upsert({
  where: { sistema_idEsterno: { sistema: conLivelli.sistema, idEsterno: conLivelli.idEsterno } },
  create: conLivelli,
  update: conLivelli,
});
await prisma.taskLivello.deleteMany({ where: { taskId: task.id } });
const l1 = await prisma.taskLivello.create({
  data: { taskId: task.id, priorita: "media", data: fra(9), nota: "ideale", ordine: 0 },
});
await prisma.taskLivello.create({
  data: { taskId: task.id, priorita: "alta", data: fra(4), nota: "consigliata", ordine: 1 },
});
await prisma.taskLivello.create({
  data: { taskId: task.id, priorita: "urgente", data: fra(1), nota: "limite", ordine: 2 },
});
// Livello effettivo iniziale = "ideale"
await prisma.task.update({
  where: { id: task.id },
  data: { livelloSceltoId: l1.id, priorita: "media", scadenza: fra(9) },
});

console.log(`Inserite/aggiornate ${demo.length + 1} task di esempio (una con più livelli).`);
await prisma.$disconnect();
