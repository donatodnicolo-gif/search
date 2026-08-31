// Le regole decise dall'utente il 31/08/2026 sera, guardando i 47.767 € di
// «Da classificare» Gen–Ago:
//   FINOTTI MATTEO       → Fornitori di eventi (evento Moncler)  [già scritta]
//   SARA ASSICURAZIONI   → Struttura e servizi fissi (assicurazione)
//   LA BURSCH SRL        → Viaggi e trasferte (spesa per viaggi)
//   MARTINA COZZELLA     → Partner che eseguono gli ordini (è Il Fiore di
//                          Fabula: la titolare pagata col suo nome)
import { prisma } from "../src/lib/db";
const REGOLE: { match: string; categoria: string }[] = [
  { match: "sara assicurazioni", categoria: "Struttura e servizi fissi" },
  { match: "la bursch", categoria: "Viaggi e trasferte" },
  { match: "martina cozzella", categoria: "Partner che eseguono gli ordini" },
  // EMMA GARIBOLDI → stipendi (detto dall utente)
  { match: "emma gariboldi", categoria: "Stipendi dei dipendenti" },
  // BAGNI SIRENA → catering aziendale: pasti per l azienda
  { match: "bagni sirena", categoria: "Pasti e rappresentanza" },
  // RUSU CAMELIA → fornitore fiori (D2C: il ricavo e gia netto del prodotto,
  // quindi il pagamento si esclude come per gli altri fiorai)
  { match: "rusu camelia", categoria: "Partner che eseguono gli ordini" },
];
for (const r of REGOLE) {
  const cat = await prisma.categoriaCosto.findFirst({ where: { nome: r.categoria } });
  if (!cat) { console.log(`categoria «${r.categoria}» non trovata: salto`); continue; }
  const gia = await prisma.regolaCosto.findFirst({ where: { match: r.match } });
  if (gia) { console.log(`«${r.match}» già presente`); continue; }
  await prisma.regolaCosto.create({ data: { match: r.match, esatto: false, categoriaId: cat.id } });
  console.log(`scritta: «${r.match}» → ${r.categoria}`);
}
await prisma.$disconnect();
