// Quanti prodotti dei negozi l'app riconosce, e quanti ne creerebbe l'import.
// **Non scrive niente**: serve a guardare il conto prima di toccare dati veri.
//
//   (dalla cartella deluxy-merchandising)
//   npx tsx scripts/anteprima-abbinamento.ts
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
  const { anteprimaAbbinamento } = await import("../src/lib/shopify-collezioni");

  const negozi = await negoziAttivi();
  console.log("Negozi attivi:", negozi.map((n) => n.nome).join(", ") || "(nessuno)");

  let letti = 0;
  let creati = 0;
  for (const n of negozi) {
    console.log(`\n=== ${n.nome} (${n.dominio}) ===`);
    try {
      const a = await anteprimaAbbinamento(n);
      letti += a.letti;
      creati += a.daCreare;
      const quota = a.letti ? Math.round((a.riconosciuti / a.letti) * 100) : 0;
      console.log(`letti ${a.letti} · riconosciuti ${a.riconosciuti} (${quota}%) · da creare ${a.daCreare}`);
      for (const e of a.esempi) {
        console.log(`   · ${e.titolo.slice(0, 50).padEnd(52)} handle=${e.handle.slice(0, 28).padEnd(30)} sku=${e.sku.slice(0, 24).padEnd(26)} coll=${e.collezioni}`);
      }
    } catch (e) {
      console.log("ERRORE -", e instanceof Error ? e.message : String(e));
    }
  }
  console.log(`\nTOTALE: ${letti} prodotti letti sui negozi, ${creati} schede da creare.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
