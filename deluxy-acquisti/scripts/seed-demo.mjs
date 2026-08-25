// Popola il database con alcuni dati d'esempio per vedere l'app in funzione.
// Uso: npm run seed:demo
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const richieste = [
  {
    titolo: "500 scatole regalo bordeaux",
    descrizione: "Per la collezione San Valentino. Servono entro fine mese.",
    categoria: "Confezionamento",
    fornitoreSuggerito: "Cartotecnica Milano",
    importoStimato: 1250,
    priorita: "alta",
    richiedenteEmail: "marta@deluxy.it",
    richiedenteNome: "Marta",
    stato: "inviata",
  },
  {
    titolo: "Rinnovo licenza Canva Team",
    descrizione: "Scade a fine mese, serve per i creativi ADV.",
    categoria: "Software e licenze",
    fornitoreSuggerito: "Canva",
    importoStimato: 300,
    priorita: "media",
    richiedenteEmail: "luca@deluxy.it",
    richiedenteNome: "Luca",
    stato: "inviata",
  },
];

const acquisti = [
  {
    descrizione: "Rose rosse premio Ecuador — carico settimanale",
    categoria: "Fiori e piante",
    fornitoreNome: "Florverde S.r.l.",
    fornitorePiva: "IT01234567890",
    imponibile: 2000,
    iva: 200,
    totale: 2200,
    stato: "pagato_parziale",
    numeroFattura: "2026/145",
    movimenti: [
      { tipo: "acconto", importo: 1000, metodo: "bonifico", stato: "eseguito" },
    ],
  },
  {
    descrizione: "Furgone refrigerato — noleggio mensile",
    categoria: "Logistica e trasporti",
    fornitoreNome: "TransFresh",
    imponibile: 900,
    iva: 198,
    totale: 1098,
    stato: "ordinato",
    movimenti: [],
  },
];

for (const r of richieste) {
  await prisma.richiestaAcquisto.create({ data: r });
}
for (const a of acquisti) {
  const { movimenti, ...dati } = a;
  const acq = await prisma.acquisto.create({ data: dati });
  for (const m of movimenti) {
    await prisma.movimentoFinanziario.create({ data: { ...m, acquistoId: acq.id, valuta: "EUR" } });
  }
}

console.log("Seed demo completato:", richieste.length, "richieste,", acquisti.length, "acquisti.");
await prisma.$disconnect();
