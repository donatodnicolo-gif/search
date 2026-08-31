// NCC → servizi per consegne (decisione utente 31/08): sono viaggi fatti per
// consegnare, non trasferte → «Consegne (valet e corrieri)».
import { prisma } from "../src/lib/db";
const cat = await prisma.categoriaCosto.findFirst({ where: { nome: "Consegne (valet e corrieri)" } });
if (!cat) process.exit(1);
for (const match of ["ncc roma citta", "ncc group"]) {
  const gia = await prisma.regolaCosto.findFirst({ where: { match } });
  if (gia) { console.log(`«${match}» già presente`); continue; }
  await prisma.regolaCosto.create({ data: { match, esatto: false, categoriaId: cat.id } });
  console.log(`scritta: «${match}» → Consegne (valet e corrieri)`);
}
await prisma.$disconnect();
