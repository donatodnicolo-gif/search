// Query condivise: riepiloghi mensili e rolling per partner.
import { prisma } from "./db";
import { riepilogoMese, rolling, type RiepilogoMese, type Rolling } from "./calc";

export const ANNO_CORRENTE = 2026;

export type MeseParziale = { mese: number; riepilogo: RiepilogoMese; saldo: SaldoRecord | null };
export type SaldoRecord = NonNullable<Awaited<ReturnType<typeof prisma.saldoMensile.findFirst>>>;

// Riepilogo completo di un partner per un anno: 12 mesi calcolati + rolling.
export async function riepilogoPartner(partnerId: string, anno: number) {
  const [fatture, vendite, saldi] = await Promise.all([
    prisma.fatturaServizio.findMany({
      where: { partnerId, anno },
      include: { tipologia: true },
      orderBy: [{ mese: "asc" }, { createdAt: "asc" }],
    }),
    prisma.venditaVendor.findMany({
      where: { partnerId, anno },
      orderBy: [{ mese: "asc" }, { createdAt: "asc" }],
    }),
    prisma.saldoMensile.findMany({ where: { partnerId, anno } }),
  ]);

  const mesi = Array.from({ length: 12 }, (_, i) => {
    const mese = i + 1;
    const f = fatture.filter((x) => x.mese === mese);
    const v = vendite.filter((x) => x.mese === mese);
    const saldo = saldi.find((x) => x.mese === mese) ?? null;
    return { mese, fatture: f, vendite: v, saldo, riepilogo: riepilogoMese(f, v, saldo) };
  });

  return { fatture, vendite, saldi, mesi, rolling: rolling(mesi.map((m) => m.riepilogo)) };
}

// Riepilogo di tutti i partner (per dashboard, saldi, report).
export async function riepilogoTutti(anno: number) {
  const [partners, fatture, vendite, saldi] = await Promise.all([
    prisma.partner.findMany({ orderBy: { nome: "asc" } }),
    prisma.fatturaServizio.findMany({ where: { anno }, include: { tipologia: true } }),
    prisma.venditaVendor.findMany({ where: { anno } }),
    prisma.saldoMensile.findMany({ where: { anno } }),
  ]);

  return partners.map((p) => {
    const pf = fatture.filter((f) => f.partnerId === p.id);
    const pv = vendite.filter((v) => v.partnerId === p.id);
    const ps = saldi.filter((x) => x.partnerId === p.id);
    const mesi = Array.from({ length: 12 }, (_, i) => {
      const mese = i + 1;
      const saldo = ps.find((x) => x.mese === mese) ?? null;
      return {
        mese,
        saldo,
        riepilogo: riepilogoMese(
          pf.filter((f) => f.mese === mese),
          pv.filter((v) => v.mese === mese),
          saldo
        ),
      };
    });
    return { partner: p, fatture: pf, vendite: pv, saldiRecords: ps, mesi, rolling: rolling(mesi.map((m) => m.riepilogo)) };
  });
}

export type RiepilogoPartnerTotale = Awaited<ReturnType<typeof riepilogoTutti>>[number];
export type { Rolling };
