// IL COSTO SEGUE IL SUO RICAVO (31/08/2026, regola dell'utente: «il COGS deve
// essere abbinato al mese di competenza della fattura del servizio»).
//
// Caso: FINOTTI MATTEO, 17.325 € pagati il 28/08 — i prodotti dell'evento
// MONCLER, la cui fattura (364/2026, 20.250 €) ha competenza MAGGIO. La banca
// è cassa e vede agosto; la lettura gestionale sposta il costo a maggio, dove
// sta il ricavo. Meccanismo: RettificaCompetenza — la verità di cassa non si
// tocca, si sposta la lettura, e le pagine dicono quanto è spostato.
import { prisma } from "../src/lib/db";
const gia = await prisma.rettificaCompetenza.findFirst({ where: { nota: { contains: "Finotti" } } });
if (gia) { console.log("rettifica già presente"); process.exit(0); }
await prisma.rettificaCompetenza.create({
  data: {
    tipo: "USCITA",
    voce: "Fornitori di eventi",
    annoOrigine: 2026, meseOrigine: 8,
    annoCompetenza: 2026, meseCompetenza: 5,
    importo: 17325,
    nota: "Finotti Matteo: prodotti dell'evento Moncler. La fattura 364/2026 (20.250 €) ha competenza maggio: il costo la segue (regola utente 31/08).",
  },
});
console.log("rettifica scritta: 17.325 € da Ago a Mag (Fornitori di eventi)");
await prisma.$disconnect();
