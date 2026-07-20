import { euro, dataIt } from "./format";

// Helper delle pro-forma: totali calcolati dalle righe, riferimento documento
// (PF n/anno) e testo standard dell'email di accompagnamento.

export type RigaLike = {
  descrizione: string;
  quantita: number;
  prezzoUnitario: number;
  aliquotaIva: number;
};

export type ProFormaLike = {
  numero: number;
  anno: number;
  data: Date;
  scadenza: Date | null;
  oggetto: string | null;
  partner: { nome: string };
};

// Stati del ciclo di vita, con etichetta e colore del badge.
export const STATI_PF: Record<string, { label: string; badge: string }> = {
  bozza: { label: "Bozza", badge: "neutral" },
  inviata: { label: "Inviata", badge: "blue" },
  fatturata: { label: "Fatturata", badge: "green" },
  annullata: { label: "Annullata", badge: "red" },
};

export function importoRiga(r: RigaLike): number {
  return r.quantita * r.prezzoUnitario;
}

export function totaliProForma(righe: RigaLike[]): {
  imponibile: number;
  iva: number;
  totale: number;
  // scomposizione IVA per aliquota (per il riepilogo a norma in calce)
  perAliquota: { aliquota: number; imponibile: number; iva: number }[];
} {
  const perAliquotaMap = new Map<number, { imponibile: number; iva: number }>();
  for (const r of righe) {
    const imp = importoRiga(r);
    const e = perAliquotaMap.get(r.aliquotaIva) ?? { imponibile: 0, iva: 0 };
    e.imponibile += imp;
    e.iva += (imp * r.aliquotaIva) / 100;
    perAliquotaMap.set(r.aliquotaIva, e);
  }
  const perAliquota = [...perAliquotaMap.entries()]
    .map(([aliquota, v]) => ({ aliquota, ...v }))
    .sort((a, b) => a.aliquota - b.aliquota);
  const imponibile = perAliquota.reduce((a, x) => a + x.imponibile, 0);
  const iva = perAliquota.reduce((a, x) => a + x.iva, 0);
  return { imponibile, iva, totale: imponibile + iva, perAliquota };
}

export function rifProForma(p: { numero: number; anno: number }): string {
  return `PF ${p.numero}/${p.anno}`;
}

// Testo standard dell'email di accompagnamento (modificabile prima dell'invio).
export function testoEmailProForma(
  p: ProFormaLike,
  righe: RigaLike[]
): { oggetto: string; corpo: string } {
  const { imponibile, iva, totale } = totaliProForma(righe);
  const rif = rifProForma(p);

  const dettaglio = righe
    .map((r) => {
      const qta = r.quantita !== 1 ? ` (${r.quantita.toLocaleString("it-IT")} × ${euro(r.prezzoUnitario)})` : "";
      return `  - ${r.descrizione}${qta}: ${euro(importoRiga(r))} + IVA ${r.aliquotaIva}%`;
    })
    .join("\n");

  const oggetto = `Pro-forma ${rif} — ${euro(totale)}${p.oggetto ? ` — ${p.oggetto}` : ""}`;
  const corpo = [
    `Spett.le ${p.partner.nome},`,
    ``,
    `con la presente Vi trasmettiamo la fattura pro-forma ${rif} del ${dataIt(p.data)}` +
      `${p.oggetto ? ` relativa a: ${p.oggetto}` : ""}.`,
    ``,
    `Dettaglio:`,
    dettaglio,
    ``,
    `Imponibile: ${euro(imponibile)}`,
    `IVA: ${euro(iva)}`,
    `Totale documento: ${euro(totale)}`,
    p.scadenza ? `\nTermine di pagamento proposto: ${dataIt(p.scadenza)}.` : ``,
    ``,
    `Ricordiamo che la pro-forma non costituisce fattura ai fini IVA: la fattura definitiva ` +
      `sarà emessa al ricevimento del pagamento.`,
    ``,
    `Restiamo a disposizione per qualsiasi chiarimento.`,
    ``,
    `Cordiali saluti,`,
    `Deluxy — Amministrazione`,
  ]
    .filter((r) => r !== null)
    .join("\n");

  return { oggetto, corpo };
}
