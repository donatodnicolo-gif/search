import { prisma } from "./db";
import { QUOTA_FORNITORE_DEFAULT } from "./ordini";

// Lettura della quota fornitore configurata (chiave `ordini.quotaFornitore`),
// con fallback al default. Separata da `ordini.ts` (che resta puro) perché legge
// dal DB.
export async function quotaFornitore(): Promise<number> {
  const r = await prisma.impostazione.findUnique({ where: { chiave: "ordini.quotaFornitore" } });
  const n = r ? parseFloat(String(r.valore).replace(",", ".")) : NaN;
  return Number.isFinite(n) && n > 0 && n < 100 ? n : QUOTA_FORNITORE_DEFAULT;
}

export const CHIAVE_QUOTA_FORNITORE = "ordini.quotaFornitore";
