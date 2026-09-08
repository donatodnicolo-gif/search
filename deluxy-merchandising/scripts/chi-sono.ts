// Chi sono davvero i prodotti dietro una sezione non importata: serve a
// decidere se aggiungere la sezione o se la categoria è sbagliata.
// Non scrive niente.
//
//   npx tsx scripts/chi-sono.ts FIORI "Ingredienti e Allergeni"

import { caricaEnv, leggiTabella, normalizza, pulisci } from "./vecchio-gestionale";

function nomiSezioni(grezzo: string | null): string[] | null {
  if (!grezzo) return null;
  try {
    const v = JSON.parse(grezzo);
    if (!Array.isArray(v)) return null;
    return v.map((x) => (x && typeof x === "object" && "fieldName" in x ? String(x.fieldName ?? "") : ""));
  } catch { return null; }
}
function comeArray(grezzo: string | null): string[] | null {
  if (!grezzo) return null;
  try {
    const v = JSON.parse(grezzo);
    if (!Array.isArray(v) || v.some((x) => x && typeof x === "object")) return null;
    return v.map((x) => (x == null ? "" : String(x)));
  } catch { return null; }
}

async function main() {
  caricaEnv();
  const { prisma } = await import("../src/lib/db");
  const categoriaNostra = process.argv[2] ?? "FIORI";
  // Le parole dopo la categoria fanno il nome della sezione: passarlo fra
  // virgolette non sopravvive al giro di shell su Windows.
  const sezione = process.argv.slice(3).join(" ") || "Ingredienti e Allergeni";

  const categorieVecchie = await leggiTabella("product_category", ["id", "categoryName", "categoryMetaFields"]);
  const sezioniDi = new Map<string, string[]>();
  const nomeDi = new Map<string, string>();
  for (const c of categorieVecchie) {
    const nomi = nomiSezioni(c.categoryMetaFields);
    if (nomi?.length) sezioniDi.set(String(c.id), nomi);
    nomeDi.set(String(c.id), String(c.categoryName ?? ""));
  }
  const vecchi = await leggiTabella("product", ["name", "sku", "productCategory", "productCategoryMetaFields"]);

  const nostri = await prisma.prodotto.findMany({
    where: { categoria: categoriaNostra },
    select: { id: true, nome: true, codice: true, categoria: true, varianti: { select: { sku: true } } },
  });
  const perSku = new Map<string, string>();
  const perNome = new Map<string, string>();
  for (const p of nostri) {
    if (p.codice) perSku.set(p.codice.trim().toUpperCase(), p.id);
    for (const v of p.varianti) if (v.sku) perSku.set(v.sku.trim().toUpperCase(), p.id);
    perNome.set(normalizza(p.nome), p.id);
  }
  const perId = new Map(nostri.map((p) => [p.id, p]));

  const trovati: { nome: string; codice: string; categoriaVecchia: string; valore: string }[] = [];
  for (const r of vecchi) {
    const valori = comeArray(r.productCategoryMetaFields);
    const nomi = sezioniDi.get(String(r.productCategory ?? ""));
    if (!valori || !nomi) continue;
    const i = nomi.findIndex((x) => normalizza(x) === normalizza(sezione));
    if (i < 0 || i >= valori.length) continue;
    const valore = pulisci(valori[i] ?? "").replace(/\n/g, " ");
    if (!valore || valore === ".") continue;
    const chiavi = (r.sku ?? "").split(/[,;\s]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
    let id: string | undefined;
    for (const k of chiavi) { const t = perSku.get(k); if (t) { id = t; break; } }
    if (!id) id = perNome.get(normalizza(r.name ?? ""));
    if (!id) continue;
    const p = perId.get(id);
    if (!p) continue;
    trovati.push({ nome: p.nome, codice: p.codice ?? "", categoriaVecchia: nomeDi.get(String(r.productCategory ?? "")) ?? "?", valore });
  }

  console.log(`«${sezione}» su prodotti che da noi stanno in ${categoriaNostra}: ${trovati.length}`);
  const perCatVecchia: Record<string, number> = {};
  for (const t of trovati) perCatVecchia[t.categoriaVecchia] = (perCatVecchia[t.categoriaVecchia] ?? 0) + 1;
  console.log("\n  da quale categoria del VECCHIO gestionale venivano:");
  for (const [k, v] of Object.entries(perCatVecchia).sort((a, b) => b[1] - a[1])) console.log(`   ${String(v).padStart(4)}  ${k}`);
  console.log("\n  esempi:");
  for (const t of trovati.slice(0, 10)) console.log(`   ${t.codice.padEnd(14)} ${t.nome.slice(0, 34).padEnd(34)} [${t.categoriaVecchia}] → «${t.valore.slice(0, 70)}»`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
