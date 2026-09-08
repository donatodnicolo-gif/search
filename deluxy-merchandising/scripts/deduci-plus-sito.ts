// **I due plus di ogni sito, letti dai prodotti che ci sono già.**
//
// Le colonne `plusUno`/`plusDue` esistono e il modulo le legge, ma erano vuote:
// qualcuno avrebbe dovuto scriverle a mano per quattro negozi. Non serve —
// stanno già scritte in cima a ogni scheda pubblicata, come secondo e terzo
// punto, e si ripetono uguali su tutti i prodotti dello stesso sito.
//
// ⚠️ **Si prende il più frequente, e solo se è davvero il più frequente**: la
// soglia è metà delle schede lette. Sotto quella soglia il negozio non ha un
// plus fisso, e inventarne uno vorrebbe dire stampare la stessa riga su
// prodotti che non l'hanno mai avuta. In quel caso non si scrive niente e lo si
// dice.
//
//   npx tsx scripts/deduci-plus-sito.ts            # prova, non scrive
//   npx tsx scripts/deduci-plus-sito.ts --applica

import { caricaEnv } from "./vecchio-gestionale";

const QUANTI = 80;

async function main() {
  caricaEnv();
  const { prisma } = await import("../src/lib/db");
  const { spezzaDescrizioneHtml } = await import("../src/lib/descrizione-shopify");
  const applica = process.argv.includes("--applica");

  const negozi = await prisma.negozioShopify.findMany({ where: { attivo: true }, select: { id: true, nome: true, dominio: true, plusUno: true, plusDue: true } });

  for (const n of negozi) {
    const righe = await prisma.pubblicazioneNegozio.findMany({
      where: { negozio: n.nome, statoShopify: "ACTIVE", handle: { not: null } },
      select: { handle: true },
      take: QUANTI,
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
      const p = spezzaDescrizioneHtml(html).punti;
      if (p.length !== 3) continue;
      letti++;
      secondo.set(p[1], (secondo.get(p[1]) ?? 0) + 1);
      terzo.set(p[2], (terzo.get(p[2]) ?? 0) + 1);
    }
    const migliore = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1])[0];
    const s = migliore(secondo);
    const t = migliore(terzo);
    const soglia = Math.max(3, Math.floor(letti / 2));
    const uno = s && s[1] >= soglia ? s[0] : null;
    const due = t && t[1] >= soglia ? t[0] : null;

    console.log(`\n── ${n.nome}  (${letti} schede con tre punti, soglia ${soglia})`);
    console.log(`   2º  ${s ? `${String(s[1]).padStart(3)}×  «${s[0].slice(0, 74)}»` : "—"}${s && !uno ? "   ⚠️ sotto soglia: NON si scrive" : ""}`);
    console.log(`   3º  ${t ? `${String(t[1]).padStart(3)}×  «${t[0].slice(0, 74)}»` : "—"}${t && !due ? "   ⚠️ sotto soglia: NON si scrive" : ""}`);
    if (n.plusUno || n.plusDue) console.log(`   già scritti qui: «${n.plusUno ?? ""}» · «${n.plusDue ?? ""}» — non si sovrascrivono`);

    if (applica && !n.plusUno && !n.plusDue && (uno || due)) {
      await prisma.negozioShopify.update({ where: { id: n.id }, data: { plusUno: uno, plusDue: due } });
      console.log("   → scritti.");
    }
  }
  if (!applica) console.log("\nProva: niente scritto. Rilancia con --applica.");
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
