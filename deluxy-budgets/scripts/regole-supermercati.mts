// Supermercati → SPESE VARIE (decisione utente 31/08). Non esiste una
// categoria «Spese varie»: la casa delle spese generali è «Struttura e
// servizi fissi» (stesso tipo di P&L che avrebbe una "varie"), e ci vanno lì.
// Regole di famiglia: prendono anche la coda dei minimarket da pochi euro.
import { prisma } from "../src/lib/db";
const MATCHES = ["supermercato", "ipermercato", "minimarket", "iper montebello", "il gigante"];
const cat = await prisma.categoriaCosto.findFirst({ where: { nome: "Struttura e servizi fissi" } });
if (!cat) process.exit(1);
for (const match of MATCHES) {
  const gia = await prisma.regolaCosto.findFirst({ where: { match } });
  if (gia) { console.log(`«${match}» già presente`); continue; }
  await prisma.regolaCosto.create({ data: { match, esatto: false, categoriaId: cat.id } });
  console.log(`scritta: «${match}» → Struttura e servizi fissi`);
}
await prisma.$disconnect();
