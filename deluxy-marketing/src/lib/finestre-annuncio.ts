import { prisma } from "@/lib/db";
import { FINESTRE_KW, type FinestrePerKeyword } from "@/lib/finestre-keyword";

// Le performance di un ANNUNCIO per finestra, dalla sua storia giornaliera
// (`MetricaAnnuncio`, dal 15/08/2026). Gemella di `finestrePerKeyword`: stesse
// finestre, stessa regola — una query per l'insieme, mai una per riga.
export async function finestrePerAnnuncio(idEsterni: string[]): Promise<FinestrePerKeyword> {
  const validi = idEsterni.filter((x) => /^[\d-]+:\d+:\d+$/.test(x));
  if (validi.length === 0) return {};

  const inizioAnno = new Date();
  inizioAnno.setMonth(0, 1);
  inizioAnno.setHours(0, 0, 0, 0);

  const righe = await prisma.metricaAnnuncio.findMany({
    where: { idEsterno: { in: validi }, data: { gte: inizioAnno } },
    select: { idEsterno: true, data: true, spesa: true, clic: true, conversioni: true, ricavi: true },
  });

  const inizioDi = (chiave: string): Date => {
    const d = new Date();
    if (chiave === "mese") d.setDate(1);
    else if (chiave === "anno") d.setMonth(0, 1);
    else d.setDate(d.getDate() - (chiave === "7g" ? 6 : 29));
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const esito: FinestrePerKeyword = {};
  for (const f of FINESTRE_KW) {
    const da = inizioDi(f.chiave);
    for (const r of righe) {
      if (r.data < da) continue;
      const per = (esito[r.idEsterno] ??= {});
      const v = (per[f.chiave] ??= { spesa: 0, clic: 0, conversioni: 0, ricavi: 0, giorni: 0 });
      v.spesa += r.spesa ?? 0;
      v.clic += r.clic ?? 0;
      v.conversioni += r.conversioni ?? 0;
      v.ricavi += r.ricavi ?? 0;
      v.giorni++;
    }
  }
  return esito;
}
