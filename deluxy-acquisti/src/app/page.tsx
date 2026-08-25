import { prisma } from "@/lib/db";
import { serializzaAcquisto, serializzaRichiesta, pagatoDi } from "@/lib/serializza";
import { aiDisponibile } from "@/lib/ai";
import { Dashboard } from "@/components/Dashboard";
import type { Riepilogo } from "@/lib/tipi";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [richiesteRaw, acquistiRaw] = await Promise.all([
    // Prima le richieste da approvare (più vecchie in cima), poi le decise recenti.
    prisma.richiestaAcquisto.findMany({ orderBy: [{ stato: "asc" }, { creataIl: "desc" }], take: 200 }),
    prisma.acquisto.findMany({ include: { movimenti: true }, orderBy: { dataOrdine: "desc" }, take: 200 }),
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

  // Riepilogo
  const statiApertiAcquisto = ["ordinato", "ricevuto", "pagato_parziale"];
  const acquistiAperti = acquistiRaw.filter((a) => statiApertiAcquisto.includes(a.stato));
  const daPagare = acquistiAperti.reduce(
    (s, a) => s + Math.max(0, a.totale - pagatoDi(a.movimenti)),
    0,
  );
  const dodici = new Date();
  dodici.setMonth(dodici.getMonth() - 12);
  const speso12Mesi = acquistiRaw.reduce(
    (s, a) =>
      s +
      a.movimenti
        .filter((m) => m.stato === "eseguito" && m.data >= dodici)
        .reduce((t, m) => t + (["nota_credito", "rimborso"].includes(m.tipo) ? -m.importo : m.importo), 0),
    0,
  );

  const riepilogo: Riepilogo = {
    richiesteDaApprovare: richiesteRaw.filter((r) => r.stato === "inviata").length,
    acquistiAperti: acquistiAperti.length,
    daPagare,
    speso12Mesi,
    valuta: "EUR",
  };

  return (
    <Dashboard richieste={richieste} acquisti={acquisti} riepilogo={riepilogo} aiAttiva={aiDisponibile()} />
  );
}
