// **Prova a secco** delle varianti che il negozio ha e la scheda no
// (07/09/2026). Legge i negozi con la stessa lettura dell'import — compresa
// la rilettura di chi ha più di dieci varianti — e stampa quante varianti
// l'import creerebbe e quanti SKU scriverebbe su varianti omonime che non
// l'hanno. **Non scrive niente**: a scrivere è l'import notturno (o quello
// lanciato da /collezioni), che ora fa questo passo da solo.
//
//   (dalla cartella deluxy-merchandising)
//   npx tsx scripts/varianti-mancanti.ts            # tutti i negozi attivi
//   npx tsx scripts/varianti-mancanti.ts Cake       # uno solo
//
// Rapporto in docs/varianti-mancanti-<giorno>-<ora>.md (l'ora nel nome: due
// giri lo stesso giorno non si sovrascrivono).
//
// Carica .env a mano (tsx non lo fa) PRIMA di importare i moduli che usano
// Prisma. Niente top-level await: il progetto è CJS.

import { readFileSync, writeFileSync } from "node:fs";

async function main() {
  for (const line of readFileSync("./.env", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }

  const { negoziAttivi } = await import("../src/lib/negozi");
  const { anteprimaVarianti } = await import("../src/lib/shopify-collezioni");
  const { prisma } = await import("../src/lib/db");

  const tutti = await negoziAttivi();
  const scelti = process.argv.slice(2).map((s) => s.toLowerCase());
  const negozi = scelti.length ? tutti.filter((n) => scelti.includes(n.nome.toLowerCase())) : tutti;
  if (negozi.length === 0) throw new Error("Nessun negozio attivo (o nessuno col nome chiesto).");

  const adesso = new Date();
  const giorno = adesso.toISOString().slice(0, 10);
  const ora = `${String(adesso.getHours()).padStart(2, "0")}${String(adesso.getMinutes()).padStart(2, "0")}`;
  const righe: string[] = [`# Varianti che il negozio ha e la scheda no — ${giorno} ${ora.slice(0, 2)}:${ora.slice(2)}`, "", "Prova a secco: niente scritto. L'import notturno crea le varianti elencate e scrive gli SKU elencati.", ""];

  for (const n of negozi) {
    const t0 = Date.now();
    const a = await anteprimaVarianti(n);
    const s = Math.round((Date.now() - t0) / 1000);
    console.log(
      `${n.nome}: ${a.letti} prodotti letti (${a.riconosciuti} riconosciuti, ${a.orfani} orfani), ${a.variantiNegozio} varianti sul negozio, ` +
        `${a.prodottiConPiuDiDieciVarianti} prodotti con più di 10 varianti; da creare ${a.daCreare.length} varianti, SKU da riempire ${a.daRiempire.length}, ` +
        `saltate ${a.saltate.length} (lo SKU è già di un'altra scheda); lettura ${s} s`,
    );
    righe.push(`## ${n.nome} — ${a.daCreare.length} varianti da creare, ${a.daRiempire.length} SKU da riempire, ${a.saltate.length} saltate`, "");
    righe.push(
      `${a.letti} prodotti letti (${a.riconosciuti} riconosciuti, ${a.orfani} orfani), ${a.variantiNegozio} varianti sul negozio, ${a.prodottiConPiuDiDieciVarianti} prodotti con più di 10 varianti, lettura ${s} s. Le saltate sono varianti del negozio il cui SKU è già su un'altra scheda qui (doppioni): non si creano, si chiudono riconciliando.`,
      "",
    );
    if (a.daCreare.length) {
      righe.push("| Prodotto | Variante | SKU | Δ prezzo |", "|---|---|---|---|");
      for (const v of a.daCreare) righe.push(`| ${v.titoloProdotto} | ${v.nome} | ${v.sku ? `\`${v.sku}\`` : "∅ (il negozio non ce l'ha)"} | ${v.deltaPrezzo} |`);
      righe.push("");
    }
    if (a.daRiempire.length) {
      righe.push("| Prodotto | Variante | SKU da scrivere |", "|---|---|---|");
      for (const v of a.daRiempire) righe.push(`| ${v.titoloProdotto} | ${v.nome} | \`${v.sku}\` |`);
      righe.push("");
    }
    if (a.saltate.length) {
      righe.push("### Saltate: lo SKU è già di un'altra scheda", "", "| Prodotto | Variante | SKU |", "|---|---|---|");
      for (const v of a.saltate) righe.push(`| ${v.titoloProdotto} | ${v.nome} | \`${v.sku}\` |`);
      righe.push("");
    }
  }

  const file = `docs/varianti-mancanti-${giorno}-${ora}.md`;
  writeFileSync(file, righe.join("\n"), "utf8");
  console.log(`Rapporto: ${file}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
