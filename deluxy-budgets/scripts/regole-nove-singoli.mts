// I nove singoli, decisi dall'utente (31/08 notte):
//   Nerini, Akshara, Genia → consulenza → Consulenti esterni
//   capri 360 → barca noleggiata per un cliente → Fornitori di eventi
//     (servizio comprato per un lavoro fatturato al cliente: costo pieno)
//   Voilà → torte per clienti → Partner (come le altre pasticcerie: il
//     ricavo D2C è già netto del prodotto)
//   Chalet Morel → trasferta → Viaggi e trasferte
//   GoDaddy → dominio → Abbonamenti software
//   jobby → servizi di consegne → Consegne (valet e corrieri)
//   Solbiati (CIOCCOLATO) → partner → Partner che eseguono gli ordini
import { prisma } from "../src/lib/db";
const REGOLE = [
  { match: "samanta nerini", categoria: "Consulenti esterni" },
  { match: "akshara akileshwar", categoria: "Consulenti esterni" },
  { match: "genia team", categoria: "Consulenti esterni" },
  { match: "capri 360", categoria: "Fornitori di eventi" },
  { match: "voilà di aurelio", categoria: "Partner che eseguono gli ordini" },
  { match: "voila di aurelio", categoria: "Partner che eseguono gli ordini" },
  { match: "chalet morel", categoria: "Viaggi e trasferte" },
  { match: "godaddy", categoria: "Abbonamenti software" },
  { match: "jobby", categoria: "Consegne (valet e corrieri)" },
  { match: "cioccolato s.a.s. di simona", categoria: "Partner che eseguono gli ordini" },
];
for (const r of REGOLE) {
  const cat = await prisma.categoriaCosto.findFirst({ where: { nome: r.categoria } });
  if (!cat) { console.log(`manca «${r.categoria}»`); continue; }
  const gia = await prisma.regolaCosto.findFirst({ where: { match: r.match } });
  if (gia) { console.log(`«${r.match}» già presente`); continue; }
  await prisma.regolaCosto.create({ data: { match: r.match, esatto: false, categoriaId: cat.id } });
  console.log(`scritta: «${r.match}» → ${r.categoria}`);
}
await prisma.$disconnect();
