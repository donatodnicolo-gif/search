// **Applicare «⟲ Recupera dalla piattaforma» a tutti i prodotti in attesa.**
//
// L'11/09/2026 l'utente ha collegato l'app delivery («collegamento con app
// delivery su merchandising con chiave creato»). Da quel momento i prodotti dei
// partner già in coda si possono completare senza aprirli uno per uno.
//
// ⚠️ Usa **la stessa funzione del tasto** (`recuperaUnProdotto`), non una copia:
// riempie solo i campi vuoti, non sovrascrive mai quello che una persona ha
// corretto qui, e lascia la riga di cronaca sul prodotto.
//
// Uso:
//   npx tsx scripts/recupera-dalla-piattaforma.ts --prova   (non scrive niente)
//   npx tsx scripts/recupera-dalla-piattaforma.ts           (applica)

import { prisma } from "../src/lib/db";
import { leggiProdottoDallaPiattaforma } from "../src/lib/piattaforma";
import { daPiattaforma } from "../src/lib/prodotti-dal-partner";
import { recuperaUnProdotto } from "../src/lib/recupero-piattaforma";

async function main() {
  const prova = process.argv.includes("--prova");
  const prodotti = await prisma.prodotto.findMany({
    where: { fase: "attesa_approvazione" },
    select: { id: true, nome: true, codice: true, origine: true, idEsterno: true },
    orderBy: { creatoIl: "asc" },
  });
  const daiPartner = prodotti.filter((p) => daPiattaforma(p.origine));
  console.log(`${daiPartner.length} prodotti in attesa che vengono dalla piattaforma${prova ? "  (PROVA: non scrivo)" : ""}\n`);

  let cambiati = 0;
  let falliti = 0;
  for (const p of daiPartner) {
    if (prova) {
      const letto = await leggiProdottoDallaPiattaforma(p.codice, p.idEsterno);
      console.log(`${p.nome} (${p.codice}): ${letto.ok ? `trovato, ${letto.prodotto.varianti.length} varianti di là` : `❌ ${letto.messaggio}`}`);
      continue;
    }
    const esito = await recuperaUnProdotto(p.id);
    if (!esito.ok) {
      console.log(`${p.nome} (${p.codice}): ❌ ${esito.messaggio}`);
      falliti++;
      continue;
    }
    if (esito.cambiato) cambiati++;
    console.log(`${p.nome} (${p.codice}): ${esito.riassunto}`);
  }

  if (!prova) console.log(`\nCambiati: ${cambiati} · invariati: ${daiPartner.length - cambiati - falliti} · falliti: ${falliti}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
