import { prisma } from "./db";

// Gruppi di pagamento gia' in uso. Servono a suggerirli nei form: farli
// riscrivere a mano ogni volta significa ritrovarsi «CHANEL» e «Chanel» come
// due gruppi distinti, e il raggruppamento che non funziona senza un motivo
// visibile.
export async function gruppiEsistenti(): Promise<string[]> {
  const righe = await prisma.partner.findMany({
    where: { gruppo: { not: null } },
    select: { gruppo: true },
    distinct: ["gruppo"],
    orderBy: { gruppo: "asc" },
  });
  return righe.map((r) => r.gruppo!).filter(Boolean);
}
