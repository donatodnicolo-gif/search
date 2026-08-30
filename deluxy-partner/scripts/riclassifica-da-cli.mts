// RICLASSIFICA TUTTE LE SPESE da riga di comando — la replica fedele di
// `riclassificaTutteLeSpese()` in src/lib/spese-actions.ts, che è una server
// action e da fuori non si chiama. Stessa strada del 27/08/2026; rifatta il
// 30/08 dopo che le 26 regole nuove di Budgets hanno adottato i 228 movimenti
// orfani (l'utente ha chiesto di procedere: «fai tu», poi «prova ancora»).
//
// Stesse cinture dell'azione, nessuna in meno:
//  - si ferma se le regole ricevute sono ZERO (riclassificare allora
//    toglierebbe la categoria a tutte le spese);
//  - non tocca le assegnazioni manuali né le entrate;
//  - e in più QUI si ferma se c'è anche UN SOLO movimento da svuotare: con le
//    regole al completo non deve svuotarsi niente — se succede, è cambiato
//    qualcosa e si guarda prima di scrivere.
//
// Prova a vuoto del 30/08 mattina: 13.608 invariate, 18 da cambiare
// (Green Click + Zoè → Pubblicità 7.921 €, Marcopolo → Partner 2.926 €),
// 0 da svuotare.
//
// Uso:
//   npx tsx@4 --env-file=.env scripts/riclassifica-da-cli.mts          → prova a vuoto
//   npx tsx@4 --env-file=.env scripts/riclassifica-da-cli.mts scrivi   → applica
import { PrismaClient } from "@prisma/client";
import { categorieDaBudgets, categoriaDaRegole, contaRegole } from "../src/lib/categorie-spesa";
import { registra } from "../src/lib/registro";

const prisma = new PrismaClient();
const SCRIVI = process.argv.includes("scrivi");

const esito = await categorieDaBudgets(true);
if (!esito.ok) { console.log("ERRORE regole:", esito.errore); process.exit(1); }
const quanteRegole = contaRegole(esito.categorie);
console.log(`regole: ${quanteRegole}`);
if (quanteRegole === 0) { console.log("ZERO regole: mi fermo."); process.exit(1); }

const uscite = await prisma.transazioneBancaria.findMany({
  where: { importo: { lt: 0 }, categoriaDa: { not: "manuale" } },
  select: { id: true, descrizione: true, controparte: true, categoriaId: true, categoriaNome: true, importo: true },
});
console.log(`uscite non manuali: ${uscite.length}`);

const perCategoria = new Map<string, { cat: (typeof esito.categorie)[number]; ids: string[] }>();
const daSvuotare: string[] = [];
let invariate = 0;
const cambi = new Map<string, { n: number; tot: number }>();
for (const tx of uscite) {
  const cat = categoriaDaRegole(tx.controparte, tx.descrizione, esito.categorie);
  if (!cat) { if (tx.categoriaId) daSvuotare.push(tx.id); continue; }
  if (cat.id === tx.categoriaId) { invariate++; continue; }
  const g = perCategoria.get(cat.id) ?? { cat, ids: [] };
  g.ids.push(tx.id); perCategoria.set(cat.id, g);
  const k = `${tx.categoriaNome ?? "(vuota)"} → ${cat.nome}`;
  const v = cambi.get(k) ?? { n: 0, tot: 0 };
  v.n++; v.tot += Math.abs(tx.importo); cambi.set(k, v);
}
const daCambiare = [...perCategoria.values()].reduce((s, g) => s + g.ids.length, 0);
console.log(`\ninvariate ${invariate} · da cambiare ${daCambiare} · da svuotare ${daSvuotare.length}`);
for (const [k, v] of [...cambi].sort((a, b) => b[1].tot - a[1].tot))
  console.log(`  ${v.n.toString().padStart(4)} mov ${Math.round(v.tot).toLocaleString("it-IT", { useGrouping: "always" }).padStart(10)} €  ${k}`);

if (!SCRIVI) { console.log("\n(prova a vuoto — rilancia con «scrivi»)"); await prisma.$disconnect(); process.exit(0); }
if (daSvuotare.length > 0) { console.log("\nMI FERMO: con le regole al completo non deve svuotarsi niente."); process.exit(1); }

const adesso = new Date();
let cambiate = 0;
for (const { cat, ids } of perCategoria.values()) {
  for (let i = 0; i < ids.length; i += 500) {
    const blocco = ids.slice(i, i + 500);
    await prisma.transazioneBancaria.updateMany({
      where: { id: { in: blocco } },
      data: { categoriaId: cat.id, categoriaNome: cat.nome, categoriaTipoPL: cat.tipoPL, categoriaDa: "regola", categoriaIl: adesso },
    });
    cambiate += blocco.length;
  }
}
await registra({
  azione: `Spese riclassificate con le regole di Budgets: ${cambiate} cambiate`,
  categoria: "transazioni",
  dettaglio: `${quanteRegole} regole importate da Budgets · ${invariate} già giuste, 0 svuotate; passata da riga di comando del 30/08 (le 26 regole nuove adottano i 228 orfani; corrette Marcopolo→Partner, Green Click e Zoè→Pubblicità); le assegnazioni manuali non toccate`,
});
console.log(`\nSCRITTO: ${cambiate} movimenti riclassificati, 0 svuotati.`);
await prisma.$disconnect();
