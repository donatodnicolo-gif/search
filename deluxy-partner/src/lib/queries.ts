// Query condivise: riepiloghi mensili e rolling per partner.
import { prisma } from "./db";
import { riepilogoMese, rolling, type RiepilogoMese, type Rolling } from "./calc";

export const ANNO_CORRENTE = 2026;
// Anni selezionabili nelle viste (dal più recente). Aggiornare quando si apre un anno nuovo.
export const ANNI_DISPONIBILI = [2026, 2025];

// Normalizza un anno ricevuto da querystring: valido solo se tra quelli disponibili.
export function annoValido(v: string | undefined): number {
  const n = v ? parseInt(v) : NaN;
  return ANNI_DISPONIBILI.includes(n) ? n : ANNO_CORRENTE;
}

export type MeseParziale = { mese: number; riepilogo: RiepilogoMese; saldo: SaldoRecord | null };
export type SaldoRecord = NonNullable<Awaited<ReturnType<typeof prisma.saldoMensile.findFirst>>>;

// Riepilogo completo di un partner per un anno: 12 mesi calcolati + rolling.
export async function riepilogoPartner(partnerId: string, anno: number) {
  const [partner, fatture, vendite, saldi] = await Promise.all([
    prisma.partner.findUnique({ where: { id: partnerId }, select: { compensazione: true } }),
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

  const compensazione = partner?.compensazione ?? false;

  const mesi = Array.from({ length: 12 }, (_, i) => {
    const mese = i + 1;
    const f = fatture.filter((x) => x.mese === mese);
    const v = vendite.filter((x) => x.mese === mese);
    const saldo = saldi.find((x) => x.mese === mese) ?? null;
    return { mese, fatture: f, vendite: v, saldo, riepilogo: riepilogoMese(f, v, saldo, compensazione) };
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
          saldo,
          p.compensazione
        ),
      };
    });
    return { partner: p, fatture: pf, vendite: pv, saldiRecords: ps, mesi, rolling: rolling(mesi.map((m) => m.riepilogo)) };
  });
}

export type RiepilogoPartnerTotale = Awaited<ReturnType<typeof riepilogoTutti>>[number];
export type { Rolling };
