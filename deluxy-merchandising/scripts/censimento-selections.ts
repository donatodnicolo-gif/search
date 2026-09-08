// **Chi sono i prodotti «… - Selections», e a chi li lega il nome.**
//
// L'utente (08/09/2026): «tutti i prodotti selections devono essere integrati
// nel prodotto a cui il nome li collega con valore Aggiunte a Pagamento».
// Prima di toccare qualcosa: quanti sono, che forma ha il nome, su quali siti
// stanno, e — soprattutto — **il prodotto padre esiste davvero?** Un'operazione
// che «integra» centinaia di schede in un padre che non c'è farebbe sparire
// dei prodotti.
// Non scrive niente.
//
//   npx tsx scripts/censimento-selections.ts

import { caricaEnv } from "./vecchio-gestionale";

const normalizza = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Il nome senza la coda «- Selections» (e varianti di scrittura). */
function radice(nome: string): string | null {
  const m = nome.match(/^(.*?)\s*[-–—]\s*selections?\s*$/i);
  return m && m[1].trim() ? m[1].trim() : null;
}

async function main() {
  caricaEnv();
  const { prisma } = await import("../src/lib/db");

  const tutti = await prisma.prodotto.findMany({
    select: {
      id: true, nome: true, codice: true, categoria: true, prezzoVendita: true, fase: true,
      negozioNome: true, shopifyId: true,
      pubblicazioni: { select: { negozio: true, statoShopify: true, shopifyId: true } },
    },
  });
  const sel = tutti.filter((p) => radice(p.nome));
  console.log(`Prodotti in tutto: ${tutti.length} · con «- Selections» nel nome: ${sel.length}`);

  // Dove stanno e come stanno
  const perSito: Record<string, number> = {};
  const perStato: Record<string, number> = {};
  const perPrezzo: Record<string, number> = {};
  for (const p of sel) {
    const siti = p.pubblicazioni.filter((x) => x.shopifyId).map((x) => x.negozio);
    for (const s of siti.length ? siti : [p.negozioNome ?? "(nessun sito)"]) perSito[s] = (perSito[s] ?? 0) + 1;
    for (const x of p.pubblicazioni) perStato[x.statoShopify ?? "(mai letto)"] = (perStato[x.statoShopify ?? "(mai letto)"] ?? 0) + 1;
    const k = p.prezzoVendita === 0 ? "0" : p.prezzoVendita <= 5 ? "fino a 5 €" : p.prezzoVendita <= 15 ? "6-15 €" : "oltre 15 €";
    perPrezzo[k] = (perPrezzo[k] ?? 0) + 1;
  }
  console.log("\n  dove stanno:", JSON.stringify(perSito));
  console.log("  stato sul negozio:", JSON.stringify(perStato));
  console.log("  prezzo:", JSON.stringify(perPrezzo));

  // Il padre esiste?
  const perNome = new Map<string, { id: string; nome: string; categoria: string }[]>();
  for (const p of tutti) {
    if (radice(p.nome)) continue; // un Selections non può essere padre di un altro
    const k = normalizza(p.nome);
    perNome.set(k, [...(perNome.get(k) ?? []), { id: p.id, nome: p.nome, categoria: p.categoria }]);
  }

  let conPadre = 0, senzaPadre = 0, ambigui = 0;
  const esempiOk: string[] = [];
  const esempiNo: string[] = [];
  for (const p of sel) {
    const r = radice(p.nome) as string;
    const candidati = perNome.get(normalizza(r)) ?? [];
    if (candidati.length === 1) {
      conPadre++;
      if (esempiOk.length < 8) esempiOk.push(`${p.nome.slice(0, 40).padEnd(40)} → «${candidati[0].nome.slice(0, 34)}» (${candidati[0].categoria})`);
    } else if (candidati.length > 1) {
      ambigui++;
      if (esempiOk.length < 8) esempiOk.push(`${p.nome.slice(0, 40).padEnd(40)} → ${candidati.length} padri possibili`);
    } else {
      senzaPadre++;
      if (esempiNo.length < 10) esempiNo.push(`${p.nome.slice(0, 46)}   (cercavo «${r}»)`);
    }
  }

  console.log([
    "",
    `  con UN padre chiaro       ${String(conPadre).padStart(5)}`,
    `  con più padri possibili   ${String(ambigui).padStart(5)}`,
    `  SENZA nessun padre        ${String(senzaPadre).padStart(5)}`,
  ].join("\n"));
  console.log("\n  esempi con padre:");
  for (const e of esempiOk) console.log("   " + e);
  if (esempiNo.length) {
    console.log("\n  esempi SENZA padre (qui «integrare» vorrebbe dire far sparire il prodotto):");
    for (const e of esempiNo) console.log("   " + e);
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
