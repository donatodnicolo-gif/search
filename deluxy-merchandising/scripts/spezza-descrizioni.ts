// **Spezza le descrizioni delle schede che ci sono già.**
//
// L'import ora spezza solo le schede nuove: farlo anche negli aggiornamenti
// vorrebbe dire cancellare a ogni notte le sezioni degli altri negozi e le
// modifiche fatte a mano. Per il pregresso serve un giro solo, che **unisce**
// invece di sovrascrivere.
//
// Per ogni prodotto pubblicato legge la scheda dalla vetrina del negozio, la
// spezza e scrive:
//   · `plusProdotto`   solo se qui è vuoto (il primo punto);
//   · `descrizione`    solo il testo libero, al posto di tutto appiattito;
//   · `sezioniScheda`  unito: si aggiungono le sezioni di QUESTO negozio, e
//                      solo quelle ancora vuote qui.
//
// ⚠️ Va lanciato **insieme** al codice che compone la descrizione in
// pubblicazione: spezzare senza comporre significa che il primo salvataggio
// sovrascrive sul negozio la scheda ricca col solo testo libero.
//
//   npx tsx scripts/spezza-descrizioni.ts             # prova sui primi 40
//   npx tsx scripts/spezza-descrizioni.ts --applica
//   npx tsx scripts/spezza-descrizioni.ts --applica --tutti

import { caricaEnv } from "./vecchio-gestionale";

async function main() {
  caricaEnv();
  const { prisma } = await import("../src/lib/db");
  const { spezzaDescrizioneHtml } = await import("../src/lib/descrizione-shopify");
  const applica = process.argv.includes("--applica");
  const tutti = process.argv.includes("--tutti");

  const negozi = await prisma.negozioShopify.findMany({ where: { attivo: true }, select: { nome: true, dominio: true } });
  let letti = 0, scritti = 0, senzaSezioni = 0, saltati = 0, strozzati = 0;
  const esempi: string[] = [];

  for (const n of negozi) {
    const righe = await prisma.pubblicazioneNegozio.findMany({
      where: { negozio: n.nome, statoShopify: "ACTIVE", handle: { not: null } },
      select: {
        handle: true,
        prodotto: { select: { id: true, nome: true, codice: true, plusProdotto: true, sezioniScheda: true } },
      },
      ...(tutti ? {} : { take: 40 }),
    });
    for (const r of righe) {
      const p = r.prodotto;
      if (!p) continue;
      // ⚠️⚠️ **Un 429 non è una scheda senza descrizione.**
      // Prima qui c'era `if (!res.ok) continue`: leggendo la vetrina a raffica
      // Shopify limita e risponde **429**, e il prodotto veniva saltato in
      // silenzio. Il conto «222 su 311 letti» del 08/09 era gonfiato al
      // ribasso proprio da questo — e lo stesso errore mi ha fatto scrivere
      // che «60 handle su 120 danno 404», quando erano tutti 429 (misurato il
      // 09/09: 83 volte 200, 37 volte 429, zero 404).
      // Ora si aspetta e si riprova, e chi non risponde comunque si conta a
      // parte invece di sparire dal totale.
      let html = "";
      let risposto = false;
      for (let giro = 0; giro < 4 && !risposto; giro++) {
        try {
          const res = await fetch(`https://${n.dominio}/products/${r.handle}.js`, { signal: AbortSignal.timeout(15000) });
          if (res.status === 429) { await new Promise((ok) => setTimeout(ok, 2000 * (giro + 1))); continue; }
          if (!res.ok) { risposto = true; break; }
          html = ((await res.json()) as { description?: string }).description ?? "";
          risposto = true;
        } catch { await new Promise((ok) => setTimeout(ok, 1500)); }
      }
      if (!risposto) { strozzati++; continue; }
      // Una pausa breve fra una scheda e l'altra: costa meno del riprovare.
      await new Promise((ok) => setTimeout(ok, 200));
      if (!html.trim()) continue;
      letti++;
      const pezzi = spezzaDescrizioneHtml(html);
      if (!pezzi.sezioni.length && !pezzi.punti.length && !pezzi.descrizione) { saltati++; continue; }
      if (!pezzi.sezioni.length) senzaSezioni++;

      const gia = (p.sezioniScheda && typeof p.sezioniScheda === "object" && !Array.isArray(p.sezioniScheda)
        ? (p.sezioniScheda as Record<string, Record<string, string>>)
        : {});
      const suo = { ...(gia[n.nome] ?? {}) };
      let cambiato = false;
      for (const s of pezzi.sezioni) {
        if ((suo[s.nome] ?? "").trim()) continue; // già compilata qui: non si tocca
        if (!s.testo.trim()) continue;
        suo[s.nome] = s.testo.slice(0, 4000);
        cambiato = true;
      }
      const scheda = { ...gia, [n.nome]: suo };
      const plus = !(p.plusProdotto ?? "").trim() && pezzi.punti[0] ? pezzi.punti[0].slice(0, 140) : undefined;
      const testo = pezzi.descrizione.trim() ? pezzi.descrizione.slice(0, 4000) : undefined;
      if (!cambiato && !plus && !testo) { saltati++; continue; }

      if (esempi.length < 6) {
        esempi.push(`${(p.codice ?? "").padEnd(12)} ${p.nome.slice(0, 26).padEnd(26)} ${n.nome.padEnd(16)} ${pezzi.sezioni.length} sezioni · plus ${plus ? "sì" : "—"} · testo ${testo ? `${testo.length} car.` : "—"}`);
      }
      if (applica) {
        await prisma.prodotto.update({
          where: { id: p.id },
          data: { ...(cambiato ? { sezioniScheda: scheda } : {}), ...(plus ? { plusProdotto: plus } : {}), ...(testo ? { descrizione: testo } : {}) },
        });
      }
      scritti++;
    }
    console.log(`${n.nome}: letti finora ${letti}`);
  }

  console.log([
    "",
    `  schede lette              ${String(letti).padStart(6)}`,
    `  non hanno risposto (429)  ${String(strozzati).padStart(6)}   ← NON sono schede vuote: solo non lette`,
    `  senza nessuna sezione     ${String(senzaSezioni).padStart(6)}`,
    `  niente da cambiare        ${String(saltati).padStart(6)}`,
    "  --------------------------------",
    `  ${applica ? "AGGIORNATI" : "DA AGGIORNARE"}            ${String(scritti).padStart(6)}`,
  ].join("\n"));
  for (const e of esempi) console.log("   " + e);
  if (!applica) console.log("\nProva: niente scritto. Rilancia con --applica (aggiungi --tutti per l'intero catalogo).");
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
