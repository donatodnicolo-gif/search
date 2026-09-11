import { prisma } from "./db";
import { feeDaTariffe } from "./fee-calc";
import { condizioniVendorPartner } from "./condizioni-vendor";

// Il calcolo puro sta in fee-calc.ts (senza database, usabile anche dal client);
// qui resta la versione che legge da Postgres, per le server action.
export { feeDaTariffe, tariffeApplicabili, type Tariffa } from "./fee-calc";

/**
 * LA FEE CHE SI APPLICA a un mese, in ordine di autorità (11/09/2026):
 *   1. la TARIFFA di Finance con decorrenza (`TariffaPartner`), se copre quel
 *      mese: è un accordo datato, scritto qui apposta per sovrascrivere il
 *      resto in un periodo preciso;
 *   2. la fee del REGISTRO, che arriva dalla piattaforma consegne — la casa
 *      del dato (Standard §7);
 *   3. la copia locale `Partner.feePercent`, come ripiego quando il registro
 *      tace o non ha ancora valorizzato niente.
 * Prima il registro non entrava nel conto: la fee viveva solo qui e andava
 * riscritta a mano a ogni partner nuovo.
 */
export async function feeApplicabile(partnerId: string, anno: number, mese: number): Promise<number> {
  const [partner, tariffe, cond] = await Promise.all([
    prisma.partner.findUnique({ where: { id: partnerId }, select: { feePercent: true } }),
    prisma.tariffaPartner.findMany({ where: { partnerId } }),
    // non fatale: se il registro non risponde si va avanti con quello che c'è
    condizioniVendorPartner(partnerId).catch(() => null),
  ]);
  const dalRegistro = cond?.condizioni?.feeVenditePercent ?? null;
  const base = dalRegistro ?? partner?.feePercent ?? 0;
  return feeDaTariffe(tariffe, anno, mese, base);
}

/** Da dove viene la fee di questo partner, per dirlo a schermo. */
export async function origineFee(partnerId: string): Promise<{ valore: number | null; da: "registro" | "finance" | "nessuna" }> {
  const [partner, cond] = await Promise.all([
    prisma.partner.findUnique({ where: { id: partnerId }, select: { feePercent: true } }),
    condizioniVendorPartner(partnerId).catch(() => null),
  ]);
  const dalRegistro = cond?.condizioni?.feeVenditePercent ?? null;
  if (dalRegistro != null) return { valore: dalRegistro, da: "registro" };
  if (partner?.feePercent != null) return { valore: partner.feePercent, da: "finance" };
  return { valore: null, da: "nessuna" };
}
