// **Quali sezioni hanno DAVVERO i prodotti, sito per sito e categoria per
// categoria.**
//
// L'utente (08/09/2026): «le sezioni per categoria e sito sono sbagliate,
// controlla con vecchio database e precedenti prodotti già pubblicati».
// Le nostre `SezioneCategoria` venivano dal vecchio gestionale, mappato a mano
// sulle nostre 18 categorie: una deduzione. La prova vera è **cosa c'è scritto
// nelle schede online adesso** — i titoli `<h6>` sono le tab che il cliente
// vede.
//
// Legge le vetrine pubbliche, non scrive niente. Confronta con quello che
// abbiamo e dice, per ogni coppia sito × categoria: cosa c'è là, cosa abbiamo
// noi, cosa manca e cosa abbiamo in più.
//
//   npx tsx scripts/sezioni-vere-per-sito.ts            # 60 prodotti per sito
//   npx tsx scripts/sezioni-vere-per-sito.ts 120

import { caricaEnv } from "./vecchio-gestionale";

const senzaAccenti = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

async function main() {
  caricaEnv();
  const { prisma } = await import("../src/lib/db");
  const { spezzaDescrizioneHtml } = await import("../src/lib/descrizione-shopify");
  const quanti = Number(process.argv[2] ?? 60);

  const negozi = await prisma.negozioShopify.findMany({ where: { attivo: true }, select: { nome: true, dominio: true } });
  const nostre = await prisma.sezioneCategoria.findMany({ where: { attiva: true }, select: { categoria: true, negozio: true, nome: true, ordine: true } });

  /** sito → categoria → titolo → quante volte */
  const visto = new Map<string, Map<string, Map<string, number>>>();
  /** sito → categoria → quanti prodotti letti */
  const letti = new Map<string, Map<string, number>>();

  for (const n of negozi) {
    const righe = await prisma.pubblicazioneNegozio.findMany({
      where: { negozio: n.nome, statoShopify: "ACTIVE", handle: { not: null } },
      select: { handle: true, prodotto: { select: { categoria: true } } },
      take: quanti,
    });
    for (const r of righe) {
      const cat = r.prodotto?.categoria ?? "?";
      let html = "";
      try {
        const res = await fetch(`https://${n.dominio}/products/${r.handle}.js`);
        if (!res.ok) continue;
        html = ((await res.json()) as { description?: string }).description ?? "";
      } catch { continue; }
      if (!html.trim()) continue;
      const perSito = visto.get(n.nome) ?? new Map();
      const perCat = perSito.get(cat) ?? new Map<string, number>();
      for (const s of spezzaDescrizioneHtml(html).sezioni) {
        const k = s.nome.trim();
        perCat.set(k, (perCat.get(k) ?? 0) + 1);
      }
      perSito.set(cat, perCat);
      visto.set(n.nome, perSito);
      const lSito = letti.get(n.nome) ?? new Map<string, number>();
      lSito.set(cat, (lSito.get(cat) ?? 0) + 1);
      letti.set(n.nome, lSito);
    }
    console.log(`${n.nome} letto`);
  }

  console.log("\n══════ CONFRONTO: cosa c'è sul sito vs cosa abbiamo noi ══════");
  for (const [sito, perSito] of visto) {
    for (const [cat, titoli] of perSito) {
      const quantiProdotti = letti.get(sito)?.get(cat) ?? 0;
      if (quantiProdotti < 3) continue; // troppo pochi per dire qualcosa
      // Le nostre per questa coppia, con la regola «il negozio vince».
      const sue = nostre.filter((x) => x.categoria === cat && x.negozio === sito);
      const comuni = nostre.filter((x) => x.categoria === cat && !x.negozio);
      const nostreQui = (sue.length ? sue : comuni).sort((a, b) => a.ordine - b.ordine).map((x) => x.nome);
      const nostreNorm = new Set(nostreQui.map(senzaAccenti));

      // Sul sito: quelle presenti su almeno un terzo dei prodotti letti.
      const soglia = Math.max(2, Math.ceil(quantiProdotti / 3));
      const laFuori = [...titoli.entries()].filter(([, v]) => v >= soglia).sort((a, b) => b[1] - a[1]);
      const laFuoriNorm = new Set(laFuori.map(([t]) => senzaAccenti(t)));

      const mancano = laFuori.filter(([t]) => !nostreNorm.has(senzaAccenti(t)));
      const inPiu = nostreQui.filter((t) => !laFuoriNorm.has(senzaAccenti(t)));
      if (!mancano.length && !inPiu.length) continue;

      console.log(`\n── ${sito} · ${cat}   (${quantiProdotti} prodotti letti, soglia ${soglia})`);
      console.log(`   noi:      ${nostreQui.join(" · ") || "(nessuna)"}${sue.length ? "   [specifiche del negozio]" : ""}`);
      console.log(`   sul sito: ${laFuori.map(([t, v]) => `${t} (${v})`).join(" · ") || "(nessuna)"}`);
      if (mancano.length) console.log(`   ➕ CI MANCANO: ${mancano.map(([t, v]) => `${t} (${v}/${quantiProdotti})`).join(" · ")}`);
      if (inPiu.length) console.log(`   ➖ ABBIAMO IN PIÙ: ${inPiu.join(" · ")}`);
    }
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
