// nicotra andrea → Stipendi dei dipendenti (utente, 31/08 notte). Era
// l'esclusione della passata valet: la causale «servizi sito» lo faceva
// sembrare un fornitore del sito, ma la paga è di un dipendente.
import { prisma } from "../src/lib/db";
const cat = await prisma.categoriaCosto.findFirst({ where: { nome: "Stipendi dei dipendenti" } });
if (!cat) process.exit(1);
const gia = await prisma.regolaCosto.findFirst({ where: { match: "nicotra andrea" } });
if (gia) { console.log("già presente"); process.exit(0); }
await prisma.regolaCosto.create({ data: { match: "nicotra andrea", esatto: false, categoriaId: cat.id } });
console.log("scritta: «nicotra andrea» → Stipendi dei dipendenti");
await prisma.$disconnect();
