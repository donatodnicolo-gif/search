// Le decisioni dell'utente (01/09 notte):
//   ISP 3265 → prelievi di contante → Banca e giroconti (un prelievo non è un
//     costo: è cassa che cambia tasca)
//   TSPAY*MADBIT → è Madbit Entertainment = FATTURE IN CLOUD (verificato in
//     rete): l'abbonamento → Abbonamenti software
//   MADERA MILANO, GIANNONE → ristoranti → Pasti e rappresentanza
//   7 STAR DRIVERS → servizi di consegna → Consegne
//   AGORA, PASSION FRANCE → fornitori → Partner che eseguono gli ordini
//   POP EMILIA → viaggi → Viaggi e trasferte
//   UNOBRAVO → benefit al personale → Stipendi dei dipendenti
import { prisma } from "../src/lib/db";
const REGOLE = [
  { match: "isp 3265", categoria: "Banca e giroconti" },
  { match: "madbit", categoria: "Abbonamenti software" },
  { match: "madera milano", categoria: "Pasti e rappresentanza" },
  { match: "giannone", categoria: "Pasti e rappresentanza" },
  { match: "7 star drivers", categoria: "Consegne (valet e corrieri)" },
  { match: "agora srl", categoria: "Partner che eseguono gli ordini" },
  { match: "passion france", categoria: "Partner che eseguono gli ordini" },
  { match: "pop emilia", categoria: "Viaggi e trasferte" },
  { match: "unobravo", categoria: "Stipendi dei dipendenti" },
];
for (const r of REGOLE) {
  const cat = await prisma.categoriaCosto.findFirst({ where: { nome: r.categoria } });
  if (!cat) continue;
  if (await prisma.regolaCosto.findFirst({ where: { match: r.match } })) { console.log(`«${r.match}» già presente`); continue; }
  await prisma.regolaCosto.create({ data: { match: r.match, esatto: false, categoriaId: cat.id } });
  console.log(`scritta: «${r.match}» → ${r.categoria}`);
}
await prisma.$disconnect();
