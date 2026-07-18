import { prisma } from "./db";

export type Tariffa = { dalAnno: number; dalMese: number; feePercent: number };

// Fee valida per un dato mese: la tariffa più recente con decorrenza <= (anno,
// mese); se nessuna tariffa la copre, la fee base del partner.
export function feeDaTariffe(
  tariffe: Tariffa[],
  anno: number,
  mese: number,
  feeBase: number
): number {
  const applicabili = tariffe
    .filter((t) => t.dalAnno < anno || (t.dalAnno === anno && t.dalMese <= mese))
    .sort((a, b) => b.dalAnno - a.dalAnno || b.dalMese - a.dalMese);
  return applicabili[0]?.feePercent ?? feeBase;
}

// Versione che carica le tariffe dal DB (per le server action).
export async function feeApplicabile(partnerId: string, anno: number, mese: number): Promise<number> {
  const [partner, tariffe] = await Promise.all([
    prisma.partner.findUnique({ where: { id: partnerId }, select: { feePercent: true } }),
    prisma.tariffaPartner.findMany({ where: { partnerId } }),
  ]);
  return feeDaTariffe(tariffe, anno, mese, partner?.feePercent ?? 0);
}
