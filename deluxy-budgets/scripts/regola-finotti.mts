// FINOTTI MATTEO → Fornitori di eventi (31/08/2026, detto dall'utente:
// «costo prodotto per evento fatto per Moncler»). 17.325 € di agosto che
// stavano in «Da classificare»: per gli eventi il ricavo è PIENO, quindi
// questo è un costo vero del conto economico — solo nella riga giusta.
import { prisma } from "../src/lib/db";
const cat = await prisma.categoriaCosto.findFirst({ where: { nome: "Fornitori di eventi" } });
if (!cat) { console.log("categoria non trovata"); process.exit(1); }
const gia = await prisma.regolaCosto.findFirst({ where: { match: "finotti matteo" } });
if (gia) { console.log("regola già presente"); process.exit(0); }
await prisma.regolaCosto.create({ data: { match: "finotti matteo", esatto: false, categoriaId: cat.id } });
console.log("scritta: «finotti matteo» → Fornitori di eventi");
await prisma.$disconnect();
