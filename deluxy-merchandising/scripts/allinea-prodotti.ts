// Riporta a casa dai negozi Shopify **quello che sanno del prodotto**: nome,
// foto, descrizione, listino, stato, tipo, fornitore, tag e giorni di consegna.
// Non tocca le collezioni né l'ordine: per quelli serve l'import completo
// (scripts/importa-tutte-collezioni.ts), che è molto più lento perché legge
// ogni collezione una per una.
//
//   (dalla cartella deluxy-merchandising)
//   npx tsx scripts/allinea-prodotti.ts            # tutti i negozi attivi
//   npx tsx scripts/allinea-prodotti.ts Cake       # uno solo
//
// Carica .env a mano (tsx non lo fa) PRIMA di importare i moduli che usano
// Prisma. Niente top-level await: il progetto è CJS e tsx lo rifiuterebbe.

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
  const { allineaProdottiAlNegozio } = await import("../src/lib/shopify-collezioni");

  const tutti = await negoziAttivi();
  const scelti = process.argv.slice(2).map((s) => s.toLowerCase());
  const negozi = scelti.length ? tutti.filter((n) => scelti.includes(n.nome.toLowerCase())) : tutti;
  console.log("Negozi da allineare:", negozi.map((n) => n.nome).join(", ") || "(nessuno)");

  for (const n of negozi) {
    const t0 = Date.now();
    try {
      const e = await allineaProdottiAlNegozio(n);
      console.log(
        `OK ${e.negozio} (${Math.round((Date.now() - t0) / 1000)}s) - ${e.letti} prodotti letti, ${e.aggiornati} schede allineate` +
          (e.senzaScheda ? `, ${e.senzaScheda} senza scheda qui (rilancia l'import completo per crearle)` : "")
      );
    } catch (e) {
      console.log(`ERRORE ${n.nome} -`, e instanceof Error ? e.message : String(e));
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
