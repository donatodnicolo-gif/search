// Il criterio dei fiorai esteso a TUTTI GLI ANNI (243 controparti, 19.941 €)
// + le evidenze: ADER è l'Agenzia delle Entrate-Riscossione («avviso di
// pagamento»), Telecom è un'utenza, ENI/ASPIT/MISER sono benzina e autogrill.
import { prisma } from "../src/lib/db";
import { readFileSync } from "fs";
const promossi: { nome: string; tot: number }[] = JSON.parse(readFileSync("../../app/promossi-tutti-anni.json", "utf8"));
const partner = await prisma.categoriaCosto.findFirst({ where: { nome: "Partner che eseguono gli ordini" } });
if (!partner) process.exit(1);
let scritte = 0;
for (const p of promossi) {
  const match = p.nome.toLowerCase().trim();
  if (await prisma.regolaCosto.findFirst({ where: { match } })) continue;
  await prisma.regolaCosto.create({ data: { match, esatto: false, categoriaId: partner.id } });
  scritte++;
}
console.log(`fiorai/pasticcerie tutti gli anni: ${scritte} regole`);
const EVIDENTI = [
  { match: "ader", esatto: true, categoria: "Imposte e tributi" },
  { match: "telecom italia", esatto: false, categoria: "Struttura e servizi fissi" },
  { match: "eni 5", esatto: false, categoria: "Carburante, pedaggi e parcheggi" },
  { match: "aspit ", esatto: false, categoria: "Carburante, pedaggi e parcheggi" },
  { match: "miser ", esatto: false, categoria: "Carburante, pedaggi e parcheggi" },
];
for (const r of EVIDENTI) {
  const cat = await prisma.categoriaCosto.findFirst({ where: { nome: r.categoria } });
  if (!cat) continue;
  if (await prisma.regolaCosto.findFirst({ where: { match: r.match } })) { console.log(`«${r.match}» già presente`); continue; }
  await prisma.regolaCosto.create({ data: { match: r.match, esatto: r.esatto, categoriaId: cat.id } });
  console.log(`scritta: «${r.match}»${r.esatto ? " (esatta)" : ""} → ${r.categoria}`);
}
await prisma.$disconnect();
