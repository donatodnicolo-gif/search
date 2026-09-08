// Guarda com'è fatta una colonna del vecchio gestionale, prima di importarla.
// Non scrive niente: serve a non inventarsi la forma dei dati.
//
//   npx tsx scripts/guarda-vecchio.ts product productCategoryMetaFields

import { leggiTabella } from "./vecchio-gestionale";

async function main() {
  const tabella = process.argv[2] ?? "product";
  const colonna = process.argv[3] ?? "productCategoryMetaFields";
  const etichetta = process.argv[4] ?? "name";
  const righe = await leggiTabella(tabella, [etichetta, colonna]);
  const pieni = righe.filter((r) => (r[colonna] ?? "").trim().length > 2);
  console.log(`${tabella}.${colonna}: ${righe.length} record · valorizzati ${pieni.length}`);
  for (const r of pieni.slice(0, 4)) {
    console.log(`\n─── ${r[etichetta]}`);
    console.log((r[colonna] ?? "").slice(0, 900));
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
