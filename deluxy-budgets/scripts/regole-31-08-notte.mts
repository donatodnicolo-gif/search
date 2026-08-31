// Ultime cinque dell'utente (31/08 notte), sul residuo:
//   pianigiani lorenzo → Consegne (valet e corrieri): è un valet
//   shopify            → Abbonamenti software: il canone del sito
//   ripetta 19         → Materiali per gli ordini: vino comprato per un ordine
//                        (stessa famiglia di Metro/champagne del 29/07)
//   linkedin           → Pubblicità (grafia nuova che la regola vecchia non prendeva)
//   gaetano russo      → Partner che eseguono gli ordini: fiori per un ordine,
//                        come gli altri fornitori D2C (il ricavo è già netto)
import { prisma } from "../src/lib/db";
const REGOLE = [
  { match: "pianigiani lorenzo", categoria: "Consegne (valet e corrieri)" },
  { match: "shopify", categoria: "Abbonamenti software" },
  { match: "ripetta 19", categoria: "Materiali per gli ordini" },
  { match: "linkedin", categoria: "Pubblicità" },
  { match: "gaetano russo", categoria: "Partner che eseguono gli ordini" },
];
for (const r of REGOLE) {
  const cat = await prisma.categoriaCosto.findFirst({ where: { nome: r.categoria } });
  if (!cat) { console.log(`categoria «${r.categoria}» mancante`); continue; }
  const gia = await prisma.regolaCosto.findFirst({ where: { match: r.match } });
  if (gia) { console.log(`«${r.match}» già presente`); continue; }
  await prisma.regolaCosto.create({ data: { match: r.match, esatto: false, categoriaId: cat.id } });
  console.log(`scritta: «${r.match}» → ${r.categoria}`);
}
await prisma.$disconnect();
