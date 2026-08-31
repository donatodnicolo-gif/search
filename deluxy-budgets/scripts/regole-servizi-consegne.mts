// «Se il bonifico ha in causale "rimborso" o "servizi" è confermato: sono
// servizi di consegne» (utente, 31/08 notte). 144 controparti dal residuo di
// tutti gli anni — i valet dell'epoca 2021–22, pagati con causale «Servizi
// per Deluxy» / «servizio maggio» / «rimborso».
// ⚠️ UNA ESCLUSIONE: nicotra andrea («servizi sito») è il SITO WEB, non una
// consegna — resta fuori, da decidere a parte.
import { prisma } from "../src/lib/db";
import { readFileSync } from "fs";
const promossi: { nome: string; tot: number }[] = JSON.parse(readFileSync("../../app/promossi-consegne.json", "utf8"));
const cat = await prisma.categoriaCosto.findFirst({ where: { nome: "Consegne (valet e corrieri)" } });
if (!cat) process.exit(1);
let scritte = 0;
for (const p of promossi) {
  if (/nicotra/i.test(p.nome)) { console.log(`fuori (sito web): ${p.nome}`); continue; }
  const match = p.nome.toLowerCase().trim();
  const gia = await prisma.regolaCosto.findFirst({ where: { match } });
  if (gia) continue;
  await prisma.regolaCosto.create({ data: { match, esatto: false, categoriaId: cat.id } });
  scritte++;
}
console.log(`regole scritte: ${scritte} su ${promossi.length}`);
await prisma.$disconnect();
