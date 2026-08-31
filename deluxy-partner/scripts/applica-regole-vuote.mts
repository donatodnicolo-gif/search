// APPLICA LE REGOLE ALLE CASELLE VUOTE — la replica CLI del primo bottone di
// /spese (riempie SOLO i movimenti senza categoria; quelli già assegnati non
// si toccano, per quelli c'è «Riclassifica tutto»).
//
// ⚠️ Nata il 31/08/2026 scoprendo la trappola: `categoriaDa: { not: "manuale" }`
// in Prisma NON prende i NULL, quindi la riclassifica (bottone e script)
// SALTA i movimenti mai categorizzati — Finotti (17.325 €) restava fuori da
// qualunque passata. Vedi la trappola «IN scarta i NULL», stessa famiglia.
//
// Uso: npx tsx@4 --env-file=.env scripts/applica-regole-vuote.mts [scrivi]
import { PrismaClient } from "@prisma/client";
import { categorieDaBudgets, categoriaDaRegole, contaRegole } from "../src/lib/categorie-spesa";
import { registra } from "../src/lib/registro";
const prisma = new PrismaClient();
const SCRIVI = process.argv.includes("scrivi");

const esito = await categorieDaBudgets(true);
if (!esito.ok) { console.log("ERRORE regole:", esito.errore); process.exit(1); }
console.log(`regole: ${contaRegole(esito.categorie)}`);

const vuote = await prisma.transazioneBancaria.findMany({
  where: { importo: { lt: 0 }, categoriaId: null },
  select: { id: true, descrizione: true, controparte: true, importo: true },
});
console.log(`uscite SENZA categoria: ${vuote.length}`);
const perCat = new Map<string, { cat: (typeof esito.categorie)[number]; ids: string[]; tot: number }>();
for (const tx of vuote) {
  const cat = categoriaDaRegole(tx.controparte, tx.descrizione, esito.categorie);
  if (!cat) continue;
  const g = perCat.get(cat.id) ?? { cat, ids: [], tot: 0 };
  g.ids.push(tx.id); g.tot += Math.abs(tx.importo); perCat.set(cat.id, g);
}
let n = 0;
for (const { cat, ids, tot } of perCat.values()) {
  n += ids.length;
  console.log(`  ${cat.nome.padEnd(36)} ${ids.length} mov · ${Math.round(tot).toLocaleString("it-IT")} €`);
}
console.log(`da riempire: ${n} · restano vuote: ${vuote.length - n}`);
if (!SCRIVI) { console.log("\n(prova a vuoto — rilancia con «scrivi»)"); await prisma.$disconnect(); process.exit(0); }
const adesso = new Date();
for (const { cat, ids } of perCat.values()) {
  for (let i = 0; i < ids.length; i += 500) {
    await prisma.transazioneBancaria.updateMany({
      where: { id: { in: ids.slice(i, i + 500) }, categoriaId: null },
      data: { categoriaId: cat.id, categoriaNome: cat.nome, categoriaTipoPL: cat.tipoPL, categoriaDa: "regola", categoriaIl: adesso },
    });
  }
}
await registra({
  azione: `Regole applicate a ${n} movimenti senza categoria`,
  categoria: "transazioni",
  dettaglio: "Passata CLI del 31/08 (replica del bottone «Applica le regole»): solo caselle vuote, con le regole nuove decise dall'utente (Finotti→Fornitori di eventi, Sara→Struttura, La Bursch→Viaggi, Cozzella/Rusu→Partner, Gariboldi→Stipendi, Bagni Sirena→Pasti).",
});
console.log("\nSCRITTO.");
await prisma.$disconnect();
