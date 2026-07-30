// Lancia l'import delle collezioni per TUTTI i negozi attivi, riusando le stesse
// funzioni della pagina (`negoziAttivi` + `importaCollezioniDa`): niente logica
// duplicata. Serve per popolare pubblicataShopify, il GID prodotto, gg_disp_min e
// riapplicare le regole standing senza passare dal browser.
//
//   (dalla cartella deluxy-merchandising)
//   npx tsx scripts/importa-tutte-collezioni.ts
//
// Carica .env a mano (tsx non lo fa) PRIMA di importare i moduli che usano Prisma.
// Niente top-level await: il progetto è CJS e tsx lo rifiuterebbe.

import { readFileSync } from "node:fs";

async function main() {
  for (const line of readFileSync("./.env", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }

  const { negoziAttivi } = await import("../src/lib/negozi");
  const { importaCollezioniDa } = await import("../src/lib/shopify-collezioni");

  const negozi = await negoziAttivi();
  console.log("Negozi attivi:", negozi.map((n) => n.nome).join(", ") || "(nessuno)");

  for (const n of negozi) {
    console.log(`\n=== Import ${n.nome} (${n.dominio}) ===`);
    const t0 = Date.now();
    try {
      const esito = await importaCollezioniDa(n);
      console.log(`${esito.ok ? "OK" : "ERRORE"} (${Math.round((Date.now() - t0) / 1000)}s) - ${esito.messaggio}`);
    } catch (e) {
      console.log("ECCEZIONE -", e instanceof Error ? e.message : String(e));
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
