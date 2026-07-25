// Import storico completo: scarica da Shopify TUTTI gli ordini di sempre dei
// negozi collegati e li salva nel registro Orders. Riusa il motore dell'app
// (src/lib/sync.ts), quindi si comporta esattamente come la sync incrementale:
// non sovrascrive la classificazione già impostata ed è ripetibile senza
// creare doppioni (chiave negozio + orderId).
//
// Uso:
//   npm run import:storico            # tutto lo storico, tutti i negozi attivi
//   npm run import:storico -- 365     # solo gli ultimi N giorni
//
// È un'operazione lunga (decine di migliaia di ordini): stampa l'avanzamento
// pagina per pagina e si può rilanciare se si interrompe.
import { eseguiSyncOrdini } from "../src/lib/sync";
import { prisma } from "../src/lib/db";
import { assicuraStatiPredefiniti } from "../src/lib/stati";

async function main() {
  const arg = process.argv.slice(2).find((a) => /^\d+$/.test(a));
  const giorni = arg ? Number(arg) : null;

  const negozi = await prisma.negozioShopify.findMany({ where: { attivo: true } });
  if (negozi.length === 0) {
    console.error("Nessun negozio attivo: collegane uno in Impostazioni.");
    process.exit(1);
  }

  await assicuraStatiPredefiniti();

  console.log(
    `Import ${giorni ? `degli ultimi ${giorni} giorni` : "di TUTTO lo storico"} da ${negozi.length} negozi:`,
  );
  for (const n of negozi) console.log(`  · ${n.brand} (${n.dominio})`);
  console.log();

  const avvio = Date.now();
  let ultimoLog = 0;

  const esito = await eseguiSyncOrdini(giorni, ({ brand, pagina, nuovi, aggiornati }) => {
    // una riga ogni 10 pagine (250 ordini) per non allagare il log
    if (pagina - ultimoLog >= 10 || pagina === 1) {
      ultimoLog = pagina;
      const min = ((Date.now() - avvio) / 60000).toFixed(1);
      console.log(`[${min} min] ${brand} · pagina ${pagina} · nuovi ${nuovi} · aggiornati ${aggiornati}`);
    }
  });

  const totale = await prisma.ordine.count();
  const minuti = ((Date.now() - avvio) / 60000).toFixed(1);

  console.log();
  console.log(`FATTO in ${minuti} min — nuovi: ${esito.nuovi} · aggiornati: ${esito.aggiornati}`);
  console.log(`Ordini ora nel registro: ${totale}`);
  if (esito.errori.length) {
    console.log("\nErrori:");
    for (const e of esito.errori) console.log(`  ! ${e}`);
  }

  // Riepilogo per negozio, utile per confrontare con Shopify
  const perBrand = await prisma.ordine.groupBy({ by: ["brand"], _count: { _all: true } });
  console.log("\nPer negozio:");
  for (const b of perBrand) console.log(`  ${b.brand}: ${b._count._all}`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("Import interrotto:", e.message);
  await prisma.$disconnect();
  process.exit(1);
});
