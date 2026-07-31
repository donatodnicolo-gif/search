import { prisma } from "./db";
import { feeDaTariffe } from "./fee-calc";

// Il calcolo puro sta in fee-calc.ts (senza database, usabile anche dal client);
// qui resta la versione che legge da Postgres, per le server action.
export { feeDaTariffe, tariffeApplicabili, type Tariffa } from "./fee-calc";

export async function feeApplicabile(partnerId: string, anno: number, mese: number): Promise<number> {
  const [partner, tariffe] = await Promise.all([
    prisma.partner.findUnique({ where: { id: partnerId }, select: { feePercent: true } }),
    prisma.tariffaPartner.findMany({ where: { partnerId } }),
  ]);
  return feeDaTariffe(tariffe, anno, mese, partner?.feePercent ?? 0);
}
