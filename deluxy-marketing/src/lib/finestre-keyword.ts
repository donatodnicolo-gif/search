import { prisma } from "@/lib/db";

// Le performance di una keyword per finestra: 7 giorni · mese corrente ·
// 30 giorni · anno. Vengono dalla storia giornaliera (`MetricaKeyword`, dal
// 10/08/2026), l'unica fonte che permette di tagliare per periodo — la
// fotografia del giro `copy` è a finestra fissa e non si può affettare.
//
// ⚠️ Una query per finestra sull'INSIEME delle keyword mostrate, non una per
// keyword: aprire una scheda gruppo con 400 parole vorrebbe dire 400 query
// (regola del repo: mai una query per riga).

export const FINESTRE_KW = [
  { chiave: "7g", nome: "7 giorni" },
  { chiave: "mese", nome: "Mese corrente" },
  { chiave: "30g", nome: "30 giorni" },
  { chiave: "anno", nome: "Anno" },
] as const;

export type NumeriFinestra = {
  spesa: number;
  clic: number;
  conversioni: number;
  ricavi: number;
  giorni: number;
};
// id di criterio → { "7g": {...}, "mese": {...}, … }
export type FinestrePerKeyword = Record<string, Record<string, NumeriFinestra>>;

function inizioDi(chiave: string): Date {
  const d = new Date();
  if (chiave === "mese") d.setDate(1);
  else if (chiave === "anno") d.setMonth(0, 1);
  else d.setDate(d.getDate() - (chiave === "7g" ? 6 : 29));
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function finestrePerKeyword(idEsterni: string[]): Promise<FinestrePerKeyword> {
  const validi = idEsterni.filter((x) => /^[\d-]+:\d+:\d+$/.test(x));
  if (validi.length === 0) return {};

  // Il periodo più lungo una volta sola, poi si ritaglia in memoria: quattro
  // groupBy sullo stesso insieme costerebbero quattro scansioni per niente.
  const righe = await prisma.metricaKeyword.findMany({
    where: { idEsterno: { in: validi }, data: { gte: inizioDi("anno") } },
    select: { idEsterno: true, data: true, spesa: true, clic: true, conversioni: true, ricavi: true },
  });

  const esito: FinestrePerKeyword = {};
  for (const f of FINESTRE_KW) {
    const da = inizioDi(f.chiave);
    for (const r of righe) {
      if (r.data < da) continue;
      const perKw = (esito[r.idEsterno] ??= {});
      const v = (perKw[f.chiave] ??= { spesa: 0, clic: 0, conversioni: 0, ricavi: 0, giorni: 0 });
      v.spesa += r.spesa ?? 0;
      v.clic += r.clic ?? 0;
      v.conversioni += r.conversioni ?? 0;
      v.ricavi += r.ricavi ?? 0;
      v.giorni++;
    }
  }
  return esito;
}
