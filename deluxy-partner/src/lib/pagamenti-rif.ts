import { prisma } from "./db";

// Registro dei pagamenti riconciliati: genera un RIFERIMENTO univoco e stabile
// (PAY-<anno>-<progressivo>) per ogni incasso/pagamento riconosciuto, così le
// altre app possono citarlo. Idempotente per (origineTipo, origineId): chiamarlo
// due volte per lo stesso record non crea doppioni e restituisce il riferimento
// già assegnato.

export type TipoPagamento =
  | "ordine_shopify"
  | "fattura_servizi"
  | "pagamento_diretto"
  | "bonifico_partner"
  | "incasso_partner";

export function formattaRiferimento(anno: number, numero: number): string {
  return `PAY-${anno}-${String(numero).padStart(6, "0")}`;
}

export async function registraPagamento(opts: {
  tipo: TipoPagamento;
  direzione: "in" | "out";
  importo: number;
  data: Date;
  origineId: string;
  controparte?: string | null;
  partnerId?: string | null;
  descrizione?: string | null;
  divisa?: string;
}): Promise<{ riferimento: string }> {
  const origineTipo = opts.tipo;
  // già registrato per questo record d'origine → torna il riferimento esistente
  const esistente = await prisma.pagamento.findUnique({
    where: { origineTipo_origineId: { origineTipo, origineId: opts.origineId } },
  });
  if (esistente) {
    // aggiorna i dati che possono cambiare (importo/data) mantenendo il riferimento
    await prisma.pagamento.update({
      where: { id: esistente.id },
      data: {
        tipo: opts.tipo,
        direzione: opts.direzione,
        importo: +opts.importo.toFixed(2),
        data: opts.data,
        controparte: opts.controparte ?? esistente.controparte,
        partnerId: opts.partnerId ?? esistente.partnerId,
        descrizione: opts.descrizione ?? esistente.descrizione,
      },
    });
    return { riferimento: esistente.riferimento };
  }

  const anno = opts.data.getUTCFullYear();
  // progressivo per anno; ritenta una volta in caso di collisione concorrente
  for (let tentativo = 0; ; tentativo++) {
    const ultimo = await prisma.pagamento.aggregate({ where: { anno }, _max: { numero: true } });
    const numero = (ultimo._max.numero ?? 0) + 1;
    try {
      const p = await prisma.pagamento.create({
        data: {
          riferimento: formattaRiferimento(anno, numero),
          numero,
          anno,
          tipo: opts.tipo,
          direzione: opts.direzione,
          importo: +opts.importo.toFixed(2),
          divisa: opts.divisa ?? "EUR",
          data: opts.data,
          controparte: opts.controparte ?? null,
          partnerId: opts.partnerId ?? null,
          descrizione: opts.descrizione ?? null,
          origineTipo,
          origineId: opts.origineId,
        },
      });
      return { riferimento: p.riferimento };
    } catch (e) {
      // altra scrittura ha preso lo stesso numero o lo stesso origine: rileggi
      if (tentativo >= 2) throw e;
      const giaFatto = await prisma.pagamento.findUnique({
        where: { origineTipo_origineId: { origineTipo, origineId: opts.origineId } },
      });
      if (giaFatto) return { riferimento: giaFatto.riferimento };
    }
  }
}

// Rimuove il pagamento quando la riconciliazione viene annullata/riaperta.
export async function rimuoviPagamento(tipo: TipoPagamento, origineId: string): Promise<void> {
  await prisma.pagamento.deleteMany({ where: { origineTipo: tipo, origineId } });
}
