// **La distribuzione vera del 2º e 3º punto su un sito.**
//
// Serve quando la soglia «metà delle schede» dice di no ma l'utente sa che il
// plus c'è: su un negozio che vende cose molto diverse (Gifts: beauty, food,
// regali) il secondo punto cambia con la merce, ma il terzo può essere sempre
// lo stesso. Guardare la classifica intera invece del solo vincitore evita di
// concludere «non c'è» quando c'è ed è il primo di venti.
// Non scrive niente.
//
//   npx tsx scripts/punti-di-un-sito.ts Gifts 200

import { caricaEnv } from "./vecchio-gestionale";

async function main() {
  caricaEnv();
  const { prisma } = await import("../src/lib/db");
  const { spezzaDescrizioneHtml } = await import("../src/lib/descrizione-shopify");
  const sito = process.argv[2] ?? "Gifts";
  const quanti = Number(process.argv[3] ?? 200);

  const n = await prisma.negozioShopify.findFirst({ where: { nome: sito }, select: { dominio: true, plusUno: true, plusDue: true } });
  if (!n) { console.log(`negozio «${sito}» non trovato`); await prisma.$disconnect(); return; }

  const righe = await prisma.pubblicazioneNegozio.findMany({
    where: { negozio: sito, statoShopify: "ACTIVE", handle: { not: null } },
    select: { handle: true },
    take: quanti,
  });

  const per = [new Map<string, number>(), new Map<string, number>(), new Map<string, number>()];
  let conTre = 0, letti = 0;
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
    if (p.length !== 3) continue;
    conTre++;
    p.forEach((t, i) => per[i].set(t, (per[i].get(t) ?? 0) + 1));
  }

  console.log(`${sito}: ${letti} schede lette, ${conTre} con tre punti`);
  console.log(`  già scritti qui: «${n.plusUno ?? "—"}» · «${n.plusDue ?? "—"}»`);
  for (const [i, m] of per.entries()) {
    const classifica = [...m.entries()].sort((a, b) => b[1] - a[1]);
    const diversi = classifica.length;
    console.log(`\n── ${i + 1}º punto — ${diversi} testi diversi`);
    for (const [t, v] of classifica.slice(0, 8)) {
      console.log(`   ${String(v).padStart(4)}  ${((v / conTre) * 100).toFixed(0).padStart(3)}%  «${t.slice(0, 76)}»`);
    }
    const primo = classifica[0];
    const secondo = classifica[1];
    if (primo) {
      const stacco = secondo ? (primo[1] / secondo[1]).toFixed(1) : "∞";
      console.log(`   → il più frequente copre il ${((primo[1] / conTre) * 100).toFixed(0)}% ed è ${stacco}× il secondo`);
    }
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
