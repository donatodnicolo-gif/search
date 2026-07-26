import { prisma } from "@/lib/db";
import { breakEvenRoas } from "@/lib/guardrail";

// I gruppi di annunci letti coi loro numeri, in un posto solo: la stessa
// funzione serve la pagina Gruppi, la scheda campagna e Copy & annunci, così
// le tre schermate non raccontano tre storie diverse.

export type GruppoConNumeri = {
  id: string;
  nome: string;
  campagnaId: string;
  campagna: string;
  brand: string;
  canale: string;
  stato: string;
  statoPiattaforma: string | null;
  tipo: string | null;
  idEsterno: string | null;
  spesa: number;
  click: number;
  impression: number;
  conversioni: number;
  ricavi: number;
  roas: number | null;
  cpa: number | null;
  giorniConDati: number;
  ultimoGiorno: Date | null;
};

export const GIORNI_LETTURA = 30; // finestra standard dei Definitivi

export function daGiorni(giorni: number): Date {
  const da = new Date();
  da.setHours(0, 0, 0, 0);
  da.setDate(da.getDate() - (giorni - 1));
  return da;
}

export async function gruppiConNumeri(opzioni: {
  campagnaId?: string;
  brand?: string;
  canale?: string;
  cerca?: string;
  giorni?: number;
}): Promise<GruppoConNumeri[]> {
  const da = daGiorni(opzioni.giorni ?? GIORNI_LETTURA);
  const gruppi = await prisma.gruppo.findMany({
    where: {
      ...(opzioni.campagnaId ? { campagnaId: opzioni.campagnaId } : {}),
      ...(opzioni.brand ? { brand: opzioni.brand } : {}),
      ...(opzioni.canale ? { canale: opzioni.canale } : {}),
      ...(opzioni.cerca ? { nome: { contains: opzioni.cerca, mode: "insensitive" as const } } : {}),
    },
    include: {
      campagna: { select: { id: true, nome: true } },
      metriche: { where: { data: { gte: da } }, orderBy: { data: "desc" } },
    },
  });

  const righe = gruppi.map((g): GruppoConNumeri => {
    const spesa = g.metriche.reduce((s, m) => s + (m.spesa ?? 0), 0);
    const ricavi = g.metriche.reduce((s, m) => s + (m.ricavi ?? 0), 0);
    const conversioni = g.metriche.reduce((s, m) => s + (m.conversioni ?? 0), 0);
    return {
      id: g.id,
      nome: g.nome,
      campagnaId: g.campagnaId,
      campagna: g.campagna.nome,
      brand: g.brand,
      canale: g.canale,
      stato: g.stato,
      statoPiattaforma: g.statoPiattaforma,
      tipo: g.tipo,
      idEsterno: g.idEsterno,
      spesa,
      ricavi,
      conversioni,
      click: g.metriche.reduce((s, m) => s + (m.click ?? 0), 0),
      impression: g.metriche.reduce((s, m) => s + (m.impression ?? 0), 0),
      roas: spesa > 0 ? ricavi / spesa : null,
      cpa: conversioni > 0 ? spesa / conversioni : null,
      giorniConDati: g.metriche.length,
      ultimoGiorno: g.metriche[0]?.data ?? null,
    };
  });

  return righe.sort((a, b) => b.spesa - a.spesa);
}

// Come si legge il ROAS di un gruppo: col break-even del SUO brand, non con un
// numero buono per tutti (doc 10 §11). Gifts va in pari a 3,33, Cake a 2,00:
// lo stesso 2,5 è un buon gruppo per uno e una perdita per l'altro.
export function letturaRoas(
  roas: number | null,
  spesa: number,
  brand: string
): { testo: string; colore: string; spiega: string } {
  if (spesa <= 0) {
    return { testo: "—", colore: "var(--text-tertiary)", spiega: "Nessuna spesa nel periodo" };
  }
  if (roas == null || roas === 0) {
    return {
      testo: "0×",
      colore: spesa >= 50 ? "var(--red)" : "var(--text-tertiary)",
      spiega:
        spesa >= 50
          ? `${spesa.toFixed(0)} € spesi e zero incasso attribuito: da guardare subito`
          : "Poca spesa e nessun incasso: non c'è ancora statistica",
    };
  }
  const be = breakEvenRoas(brand);
  if (roas >= be * 1.5) {
    return {
      testo: `${roas.toFixed(2)}×`,
      colore: "var(--green)",
      spiega: `Sopra il target (1,5× il break-even di ${be.toFixed(2)})`,
    };
  }
  if (roas >= be) {
    return {
      testo: `${roas.toFixed(2)}×`,
      colore: "var(--blue)",
      spiega: `Sopra il break-even del brand (${be.toFixed(2)}), sotto il target di ${(be * 1.5).toFixed(2)}`,
    };
  }
  return {
    testo: `${roas.toFixed(2)}×`,
    colore: "var(--red)",
    spiega: `Sotto il break-even del brand (${be.toFixed(2)}): a questo ritmo il gruppo perde`,
  };
}

// Quanto pesa un gruppo dentro la sua campagna: serve a dire "un gruppo si
// mangia il 70% della spesa e rende la metà degli altri".
export function quotaSpesa(righe: GruppoConNumeri[]): Map<string, number> {
  const totalePerCampagna = new Map<string, number>();
  for (const r of righe) {
    totalePerCampagna.set(r.campagnaId, (totalePerCampagna.get(r.campagnaId) ?? 0) + r.spesa);
  }
  const quote = new Map<string, number>();
  for (const r of righe) {
    const totale = totalePerCampagna.get(r.campagnaId) ?? 0;
    quote.set(r.id, totale > 0 ? r.spesa / totale : 0);
  }
  return quote;
}

export const ETICHETTA_TIPO_GRUPPO: Record<string, string> = {
  asset_group_pmax: "gruppo di asset (PMax)",
  search_standard: "search",
  search_dynamic_ads: "search dinamico",
  display_standard: "display",
  hotel_default: "hotel",
  video_bumper: "video",
  shopping_product_ads: "shopping",
};

export const STATI_GRUPPO = ["attivo", "vincente", "da_valutare", "in_pausa", "escluso"] as const;

export const ETICHETTA_STATO_GRUPPO: Record<string, string> = {
  attivo: "Attivo",
  vincente: "Vincente",
  da_valutare: "Da valutare",
  in_pausa: "In pausa",
  escluso: "Escluso",
};

export const COLORE_STATO_GRUPPO: Record<string, string> = {
  attivo: "var(--green)",
  vincente: "var(--gold-strong)",
  da_valutare: "var(--orange)",
  in_pausa: "var(--text-secondary)",
  escluso: "var(--red)",
};
