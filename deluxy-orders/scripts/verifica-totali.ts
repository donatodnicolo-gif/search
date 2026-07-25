// Confronta, negozio per negozio, quanti ordini ci sono su Shopify e quanti ne
// ha il registro Orders. Serve a dimostrare che l'import è completo.
//
// Uso: npm run verifica:totali
import { prisma } from "../src/lib/db";
import { tokenNegozio } from "../src/lib/shopify";

const API_VERSION = "2024-10";

async function contaSuShopify(dominio: string, token: string): Promise<number | null> {
  const res = await fetch(`https://${dominio}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ query: "query { ordersCount(limit: 1000000) { count } }" }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) return null;
  const j = await res.json();
  return j?.data?.ordersCount?.count ?? null;
}

async function main() {
  const negozi = await prisma.negozioShopify.findMany({ where: { attivo: true }, orderBy: { brand: "asc" } });
  console.log("negozio".padEnd(18), "Shopify".padStart(9), "Orders".padStart(9), "  esito");
  let tuttoOk = true;

  for (const n of negozi) {
    const token = await tokenNegozio(n);
    const suShopify = await contaSuShopify(n.dominio, token);
    const nelRegistro = await prisma.ordine.count({ where: { negozioId: n.id } });
    const ok = suShopify != null && suShopify === nelRegistro;
    if (!ok) tuttoOk = false;
    console.log(
      n.brand.padEnd(18),
      String(suShopify ?? "?").padStart(9),
      String(nelRegistro).padStart(9),
      ok ? "  OK" : `  DIFFERENZA (${suShopify != null ? suShopify - nelRegistro : "?"} mancanti)`,
    );
  }

  const totale = await prisma.ordine.count();
  const righe = await prisma.rigaOrdine.count();
  console.log(`\nTotale registro: ${totale} ordini · ${righe} righe`);
  console.log(tuttoOk ? "Tutti i negozi allineati con Shopify." : "Attenzione: qualche negozio non è allineato.");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("Verifica fallita:", e.message);
  await prisma.$disconnect();
  process.exit(1);
});
