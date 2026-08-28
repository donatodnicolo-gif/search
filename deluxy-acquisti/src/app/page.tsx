import { prisma } from "@/lib/db";
import { serializzaAcquisto, serializzaRichiesta, pagatoDi } from "@/lib/serializza";
import { aiDisponibile } from "@/lib/ai";
import { Dashboard } from "@/components/Dashboard";
import type { Riepilogo } from "@/lib/tipi";

export const dynamic = "force-dynamic";

export default async function Home() {
  // ⚠️ I KPI NON si calcolano sulla fetta (giuria performance 28/08, Libro
  // PERFORMANCE legge 2): prima «da pagare», «speso 12 mesi» e i conteggi
  // erano ricavati dai soli 200 record più recenti del take della LISTA — al
  // 201° acquisto i numeri finanziari in testa diventavano falsi in silenzio.
  // Ora la lista resta a 200 (è un elenco), ma i numeri vengono da query
  // dedicate sull'insieme COMPLETO.
  const dodici = new Date();
  dodici.setMonth(dodici.getMonth() - 12);
  const statiApertiAcquisto = ["ordinato", "ricevuto", "pagato_parziale"];
  const [richiesteRaw, acquistiRaw, richiesteDaApprovare, acquistiApertiTutti, movimenti12] = await Promise.all([
    // Prima le richieste da approvare (più vecchie in cima), poi le decise recenti.
    prisma.richiestaAcquisto.findMany({ orderBy: [{ stato: "asc" }, { creataIl: "desc" }], take: 200 }),
    prisma.acquisto.findMany({ include: { movimenti: true }, orderBy: { dataOrdine: "desc" }, take: 200 }),
    prisma.richiestaAcquisto.count({ where: { stato: "inviata" } }),
    // Gli APERTI sono un insieme piccolo per natura (si chiudono pagando):
    // si leggono tutti, coi movimenti che servono al saldo.
    prisma.acquisto.findMany({ where: { stato: { in: statiApertiAcquisto } }, include: { movimenti: true } }),
    prisma.movimentoFinanziario.groupBy({
      by: ["tipo"],
      where: { stato: "eseguito", data: { gte: dodici } },
      _sum: { importo: true },
    }),
  ]);

  const richieste = richiesteRaw
    .map(serializzaRichiesta)
    // Ordine: prima "inviata" (da approvare), poi il resto per data.
    .sort((a, b) => {
      const rank = (s: string) => (s === "inviata" ? 0 : 1);
      if (rank(a.stato) !== rank(b.stato)) return rank(a.stato) - rank(b.stato);
      return b.creataIl.localeCompare(a.creataIl);
    });
  const acquisti = acquistiRaw.map(serializzaAcquisto);

  // Riepilogo — sull'insieme COMPLETO (vedi il commento in testa), mai sulla
  // fetta da 200 della lista.
  const daPagare = acquistiApertiTutti.reduce(
    (s, a) => s + Math.max(0, a.totale - pagatoDi(a.movimenti)),
    0,
  );
  const speso12Mesi = movimenti12.reduce(
    (t, g) =>
      t + (["nota_credito", "rimborso"].includes(g.tipo) ? -(g._sum.importo ?? 0) : (g._sum.importo ?? 0)),
    0,
  );

  const riepilogo: Riepilogo = {
    richiesteDaApprovare,
    acquistiAperti: acquistiApertiTutti.length,
    daPagare,
    speso12Mesi,
    valuta: "EUR",
  };

  return (
    <Dashboard richieste={richieste} acquisti={acquisti} riepilogo={riepilogo} aiAttiva={aiDisponibile()} />
  );
}
