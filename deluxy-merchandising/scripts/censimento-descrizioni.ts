// **Com'è fatta davvero la descrizione dei prodotti, sui quattro negozi.**
//
// Serve a scrivere il parser sui dati veri e non su un esempio: prima di
// decidere che «le sezioni sono i <h6>» bisogna sapere quanti prodotti usano
// h6, quanti usano altro e quanti non hanno struttura per niente.
// Legge dalle vetrine pubbliche (`/products/<handle>.js`), non scrive niente.
//
//   npx tsx scripts/censimento-descrizioni.ts            # 40 per negozio
//   npx tsx scripts/censimento-descrizioni.ts 100

import { caricaEnv } from "./vecchio-gestionale";

async function main() {
  caricaEnv();
  const { prisma } = await import("../src/lib/db");
  const quanti = Number(process.argv[2] ?? 40);

  const negozi = await prisma.negozioShopify.findMany({ where: { attivo: true }, select: { nome: true, dominio: true } });
  const conta: Record<string, number> = {};
  const titoli = new Map<string, number>();
  let letti = 0, vuoti = 0, senzaStruttura = 0;

  for (const n of negozi) {
    const righe = await prisma.pubblicazioneNegozio.findMany({
      where: { negozio: n.nome, statoShopify: "ACTIVE", handle: { not: null } },
      select: { handle: true },
      take: quanti,
    });
    let okQui = 0;
    for (const r of righe) {
      let html = "";
      try {
        const res = await fetch(`https://${n.dominio}/products/${r.handle}.js`, { redirect: "follow" });
        if (!res.ok) continue;
        const j = (await res.json()) as { description?: string };
        html = j.description ?? "";
      } catch {
        continue;
      }
      letti++;
      okQui++;
      if (!html.trim()) { vuoti++; continue; }
      const tag = [...html.matchAll(/<(h[1-6])[^>]*>/gi)].map((m) => m[1].toLowerCase());
      if (!tag.length) senzaStruttura++;
      for (const t of new Set(tag)) conta[t] = (conta[t] ?? 0) + 1;
      for (const m of html.matchAll(/<h6[^>]*>([\s\S]{1,60}?)<\/h6>/gi)) {
        const nome = m[1].replace(/<[^>]+>/g, "").replace(/&nbsp;/gi, " ").trim();
        if (nome) titoli.set(nome, (titoli.get(nome) ?? 0) + 1);
      }
    }
    console.log(`${n.nome.padEnd(18)} letti ${okQui}/${righe.length}`);
  }

  console.log(`\nDescrizioni lette: ${letti} · vuote: ${vuoti} · SENZA nessun titolo: ${senzaStruttura}`);
  console.log("\ntag di titolo usati (quante descrizioni ne contengono almeno uno):");
  for (const [t, v] of Object.entries(conta).sort((a, b) => b[1] - a[1])) console.log(`   ${t}  ${v}`);
  console.log("\ni titoli <h6> più frequenti (= le tab sul sito):");
  for (const [t, v] of [...titoli.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`   ${String(v).padStart(4)}  ${t}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
