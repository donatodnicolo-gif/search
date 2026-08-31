// LA FAMIGLIA DEI FIORAI → Partner che eseguono gli ordini (31/08/2026 sera,
// «Sì» dell'utente). Criterio del 29/07 riapplicato al residuo 2026: nome da
// fiorista/pasticceria, oppure causale con «ordine»/«fiori»/«torta» o un
// numero d'ordine (non gli anni, non i numeri di documento). Le causali con
// un nome di MESE si SALTANO (possibile rimborso valet). Il ricavo D2C è già
// netto dei prodotti: questi pagamenti si ESCLUDONO, sennò il prodotto è
// tolto due volte.
import { prisma } from "../src/lib/db";
import { readFileSync } from "fs";
const proposte: { nome: string; tot: number; perche: string }[] = JSON.parse(
  readFileSync("../../app/regole-fiorai-proposte.json", "utf8")
);
// Il POS «VIVA, Bologna»: le cifre nel descrittore sono il codice del
// terminale, non un numero d'ordine. Fuori.
const ESCLUSE = [/VIVA, BOLOGNA/i];
const cat = await prisma.categoriaCosto.findFirst({ where: { nome: "Partner che eseguono gli ordini" } });
const banca = await prisma.categoriaCosto.findFirst({ where: { nome: "Banca e giroconti" } });
if (!cat || !banca) process.exit(1);
let scritte = 0, saltate = 0;
for (const p of proposte) {
  if (ESCLUSE.some((r) => r.test(p.nome))) { console.log(`fuori (falso positivo): ${p.nome}`); continue; }
  const match = p.nome.toLowerCase().trim();
  const gia = await prisma.regolaCosto.findFirst({ where: { match } });
  if (gia) { saltate++; continue; }
  await prisma.regolaCosto.create({ data: { match, esatto: false, categoriaId: cat.id } });
  scritte++;
}
// Coinbase: bonifico uscito e RIENTRATO il giorno dopo (netto 0), verificato.
const cb = await prisma.regolaCosto.findFirst({ where: { match: "coinbase" } });
if (!cb) { await prisma.regolaCosto.create({ data: { match: "coinbase", esatto: false, categoriaId: banca.id } }); console.log("coinbase → Banca e giroconti"); }
console.log(`regole fiorai scritte: ${scritte} · già presenti: ${saltate} · proposte: ${proposte.length}`);
await prisma.$disconnect();
