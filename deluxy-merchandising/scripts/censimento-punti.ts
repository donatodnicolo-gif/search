// **Quanti punti hanno davvero le schede, e quali sono i due del sito.**
//
// Due domande in una lettura sola:
//   1. quante descrizioni hanno più di tre punti in cima (il modello ne prevede
//      tre: uno del prodotto e due del sito) — serve a sapere se il quarto è un
//      caso isolato o una forma diffusa;
//   2. **quali sono i due punti del sito**: se il secondo e il terzo si
//      ripetono uguali su tutti i prodotti di un negozio, allora sono i suoi
//      plus, e invece di farli scrivere a mano si possono leggere dai prodotti
//      che ci sono già.
// Non scrive niente.
//
//   npx tsx scripts/censimento-punti.ts 60

import { caricaEnv } from "./vecchio-gestionale";

async function main() {
  caricaEnv();
  const { prisma } = await import("../src/lib/db");
  const { spezzaDescrizioneHtml } = await import("../src/lib/descrizione-shopify");
  const quanti = Number(process.argv[2] ?? 60);

  const negozi = await prisma.negozioShopify.findMany({ where: { attivo: true }, select: { nome: true, dominio: true } });
  const quantiPunti: Record<number, number> = {};

  for (const n of negozi) {
    const righe = await prisma.pubblicazioneNegozio.findMany({
      where: { negozio: n.nome, statoShopify: "ACTIVE", handle: { not: null } },
      select: { handle: true },
      take: quanti,
    });
    const secondo = new Map<string, number>();
    const terzo = new Map<string, number>();
    let letti = 0;
    for (const r of righe) {
      let html = "";
      try {
        const res = await fetch(`https://${n.dominio}/products/${r.handle}.js`);
        if (!res.ok) continue;
        html = ((await res.json()) as { description?: string }).description ?? "";
      } catch { continue; }
      if (!html.trim()) continue;
      letti++;
      const p = spezzaDescrizioneHtml(html).punti;
      quantiPunti[p.length] = (quantiPunti[p.length] ?? 0) + 1;
      if (p[1]) secondo.set(p[1], (secondo.get(p[1]) ?? 0) + 1);
      if (p[2]) terzo.set(p[2], (terzo.get(p[2]) ?? 0) + 1);
    }
    const top = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2);
    console.log(`\n── ${n.nome} (${letti} descrizioni)`);
    for (const [t, v] of top(secondo)) console.log(`   2º punto  ${String(v).padStart(3)}×  «${t.slice(0, 78)}»`);
    for (const [t, v] of top(terzo)) console.log(`   3º punto  ${String(v).padStart(3)}×  «${t.slice(0, 78)}»`);
  }

  console.log("\nquanti punti per descrizione:");
  for (const [k, v] of Object.entries(quantiPunti).sort((a, b) => Number(a[0]) - Number(b[0]))) console.log(`   ${k} punti: ${v}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
