// La coda del residuo (31/08 notte, decisioni dell'utente):
//  - «nerino e tutti i ristoranti» → Pasti e rappresentanza
//  - pasticcerie e fiorai (anche i «?») → acquisto prodotti per ordini D2C
//    → Partner che eseguono gli ordini (il ricavo è già netto del prodotto)
//  - vini → Materiali per gli ordini (famiglia di ripetta 19 / champagne 29/07):
//    FLACCIANELLO è il Flaccianello della Pieve, un vino.
import { prisma } from "../src/lib/db";
const REGOLE = [
  { match: "nerino", categoria: "Pasti e rappresentanza" },
  { match: "ristorante", categoria: "Pasti e rappresentanza" },
  { match: "micaela floral", categoria: "Partner che eseguono gli ordini" },
  { match: "saes groenten", categoria: "Partner che eseguono gli ordini" },
  { match: "nadia mousouri", categoria: "Partner che eseguono gli ordini" },
  { match: "nataliia voronova", categoria: "Partner che eseguono gli ordini" },
  { match: "olivier luck", categoria: "Partner che eseguono gli ordini" },
  { match: "pegna", categoria: "Partner che eseguono gli ordini" },
  { match: "06dc59e1c6db1bc8d9", categoria: "Partner che eseguono gli ordini" },
  { match: "omise xpress", categoria: "Partner che eseguono gli ordini" },
  { match: "enotria", categoria: "Materiali per gli ordini" },
  { match: "flaccianello", categoria: "Materiali per gli ordini" },
];
for (const r of REGOLE) {
  const cat = await prisma.categoriaCosto.findFirst({ where: { nome: r.categoria } });
  if (!cat) continue;
  const gia = await prisma.regolaCosto.findFirst({ where: { match: r.match } });
  if (gia) { console.log(`«${r.match}» già presente`); continue; }
  await prisma.regolaCosto.create({ data: { match: r.match, esatto: false, categoriaId: cat.id } });
  console.log(`scritta: «${r.match}» → ${r.categoria}`);
}
await prisma.$disconnect();
