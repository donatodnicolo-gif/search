// Query condivise: riepiloghi mensili e rolling per partner.
import { prisma } from "./db";
import { riepilogoMese, rolling, type RiepilogoMese, type Rolling } from "./calc";
import { separaFattureVere } from "./fattura-vera";

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
  const [partner, fattureTutte, vendite, saldi] = await Promise.all([
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

  // Contano solo le fatture VERE, quelle con un documento su Fatture in Cloud
  // (regola dell'utente del 04/09/2026, vedi `fattura-vera.ts`). La divisione
  // si fa QUI, una volta: l'elenco del mese e il saldo del mese nascono dalla
  // stessa lista, così non può succedere che una riga sparisca dall'elenco ma
  // resti dentro il totale. Le `nonEmesse` tornano alla pagina, che le dichiara
  // invece di farle sparire in silenzio.
  const { vere: fatture, nonEmesse } = separaFattureVere(fattureTutte);

  const compensazione = partner?.compensazione ?? false;

  const mesi = Array.from({ length: 12 }, (_, i) => {
    const mese = i + 1;
    const f = fatture.filter((x) => x.mese === mese);
    const v = vendite.filter((x) => x.mese === mese);
    const saldo = saldi.find((x) => x.mese === mese) ?? null;
    return { mese, fatture: f, vendite: v, saldo, riepilogo: riepilogoMese(f, v, saldo, compensazione) };
  });

  return { fatture, vendite, saldi, mesi, nonEmesse, rolling: rolling(mesi.map((m) => m.riepilogo)) };
}

// Riepilogo di tutti i partner (per dashboard, saldi, report).
// Ottimizzata: le tipologie (poche righe) si caricano a parte invece di un
// `include` su ogni fattura, e il raggruppamento per partner/mese usa mappe
// invece di filtrare l'intero elenco per ogni partner (era O(partner × righe)).
export async function riepilogoTutti(anno: number) {
  const [partners, fattureRaw, vendite, saldi, tipologie] = await Promise.all([
    prisma.partner.findMany({ orderBy: { nome: "asc" } }),
    prisma.fatturaServizio.findMany({ where: { anno } }),
    prisma.venditaVendor.findMany({ where: { anno } }),
    prisma.saldoMensile.findMany({ where: { anno } }),
    prisma.tipologiaServizio.findMany(),
  ]);
  const tipPerId = new Map(tipologie.map((t) => [t.id, t]));
  // Stessa regola della scheda partner: senza un documento su Fatture in Cloud
  // non è una fattura, quindi non entra nei saldi, nella dashboard, nei report.
  // Se qui contasse e nella scheda no, lo stesso partner avrebbe due dovuti
  // diversi a seconda della pagina da cui lo si guarda.
  const fatture = separaFattureVere(fattureRaw).vere.map((f) => ({ ...f, tipologia: tipPerId.get(f.tipologiaId)! }));

  // indicizza una volta sola per partner
  const perPartner = <T extends { partnerId: string }>(righe: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of righe) {
      const arr = m.get(r.partnerId);
      if (arr) arr.push(r);
      else m.set(r.partnerId, [r]);
    }
    return m;
  };
  const fattureBy = perPartner(fatture);
  const venditeBy = perPartner(vendite);
  const saldiBy = perPartner(saldi);

  return partners.map((p) => {
    const pf = fattureBy.get(p.id) ?? [];
    const pv = venditeBy.get(p.id) ?? [];
    const ps = saldiBy.get(p.id) ?? [];
    // raggruppa per mese in una passata sola (invece di 12 filtri per partner)
    const fMese: (typeof pf)[] = Array.from({ length: 13 }, () => []);
    for (const f of pf) fMese[f.mese]?.push(f);
    const vMese: (typeof pv)[] = Array.from({ length: 13 }, () => []);
    for (const v of pv) vMese[v.mese]?.push(v);
    const sMese = new Map(ps.map((x) => [x.mese, x]));

    const mesi = Array.from({ length: 12 }, (_, i) => {
      const mese = i + 1;
      const saldo = sMese.get(mese) ?? null;
      return {
        mese,
        saldo,
        riepilogo: riepilogoMese(fMese[mese], vMese[mese], saldo, p.compensazione),
      };
    });
    return { partner: p, fatture: pf, vendite: pv, saldiRecords: ps, mesi, rolling: rolling(mesi.map((m) => m.riepilogo)) };
  });
}

export type RiepilogoPartnerTotale = Awaited<ReturnType<typeof riepilogoTutti>>[number];
export type { Rolling };
