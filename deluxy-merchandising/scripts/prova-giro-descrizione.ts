// **Il giro completo: spezzo e ricompongo, poi confronto col vero.**
//
// È la prova che conta: se dopo aver spezzato una descrizione in pezzi e averla
// rimessa insieme il risultato non dice le stesse cose dell'originale, allora
// pubblicando si perderebbe del contenuto — e nessuno se ne accorgerebbe finché
// non lo guarda un cliente.
//
// Il confronto è sul **testo**, non sui tag: l'HTML che ricomponiamo è più
// pulito di quello scritto a mano negli anni (niente `<meta charset>` in mezzo
// a una riga, niente `<span>` vuoti). Quello che deve tornare sono le parole.
//
// Non scrive niente.
//
//   npx tsx scripts/prova-giro-descrizione.ts        # 30 per negozio
//   npx tsx scripts/prova-giro-descrizione.ts 60

import { caricaEnv } from "./vecchio-gestionale";

const parole = (s: string) =>
  s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;|&rsquo;|’/gi, "'")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9' ]+/g, " ")
    .split(/\s+/)
    .filter((x) => x.length > 2);

async function main() {
  caricaEnv();
  const { prisma } = await import("../src/lib/db");
  const { spezzaDescrizioneHtml, componiDescrizioneHtml } = await import("../src/lib/descrizione-shopify");
  const quanti = Number(process.argv[2] ?? 30);

  const negozi = await prisma.negozioShopify.findMany({ where: { attivo: true }, select: { nome: true, dominio: true, plusUno: true, plusDue: true } });
  let letti = 0, perfetti = 0, quasi = 0, scarsi = 0;
  const peggiori: { nome: string; resa: number; mancanti: string[] }[] = [];
  const conteggi = { punti: 0, conDescrizione: 0, sezioni: 0 };

  for (const n of negozi) {
    const righe = await prisma.pubblicazioneNegozio.findMany({
      where: { negozio: n.nome, statoShopify: "ACTIVE", handle: { not: null } },
      select: { handle: true },
      take: quanti,
    });
    for (const r of righe) {
      let originale = "";
      try {
        const res = await fetch(`https://${n.dominio}/products/${r.handle}.js`);
        if (!res.ok) continue;
        originale = ((await res.json()) as { description?: string }).description ?? "";
      } catch { continue; }
      if (!originale.trim()) continue;
      letti++;

      const pezzi = spezzaDescrizioneHtml(originale);
      conteggi.punti += pezzi.punti.length;
      if (pezzi.descrizione) conteggi.conDescrizione++;
      conteggi.sezioni += pezzi.sezioni.length;

      const rifatto = componiDescrizioneHtml({
        plusProdotto: pezzi.punti[0] ?? null,
        plusUno: pezzi.punti[1] ?? null,
        plusDue: pezzi.punti[2] ?? null,
        descrizione: pezzi.descrizione,
        sezioni: pezzi.sezioni.map((s, i) => ({ nome: s.nome, tipo: "testo", ordine: i, valore: s.testo })),
      });

      const a = parole(originale);
      const b = new Set(parole(rifatto));
      const mancanti = a.filter((w) => !b.has(w));
      const resa = a.length ? 1 - mancanti.length / a.length : 1;
      if (resa >= 0.999) perfetti++;
      else if (resa >= 0.97) quasi++;
      else {
        scarsi++;
        if (peggiori.length < 6) peggiori.push({ nome: r.handle ?? "?", resa, mancanti: [...new Set(mancanti)].slice(0, 12) });
      }
    }
    console.log(`${n.nome} fatto`);
  }

  console.log(`\nDescrizioni provate: ${letti}`);
  console.log(`  tornano IDENTICHE parola per parola : ${perfetti}`);
  console.log(`  tornano al 97% o più                : ${quasi}`);
  console.log(`  sotto il 97%                        : ${scarsi}`);
  console.log(`\n  in media per prodotto: ${(conteggi.punti / letti).toFixed(1)} punti · ${(conteggi.sezioni / letti).toFixed(1)} sezioni · con testo libero ${conteggi.conDescrizione}/${letti}`);
  for (const p of peggiori) console.log(`\n  ⚠️ ${p.nome} — resa ${(p.resa * 100).toFixed(1)}%\n     parole perse: ${p.mancanti.join(", ")}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
