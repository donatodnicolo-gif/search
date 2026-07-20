import { euro, dataIt } from "./format";

type FatturaConPartner = {
  numero: string | null;
  imponibile: number;
  aliquotaIva: number;
  scadenza: Date | null;
  emissione: Date | null;
  partner: { nome: string };
};

// Testo standard del sollecito di pagamento (modificabile prima dell'invio).
export function testoSollecito(f: FatturaConPartner): { oggetto: string; corpo: string } {
  const rif = f.numero ? `fattura n. ${f.numero}` : "fattura";
  const importo = euro(f.imponibile * (1 + f.aliquotaIva / 100));
  const scad = f.scadenza ? ` scaduta il ${dataIt(f.scadenza)}` : "";

  const oggetto = `Sollecito di pagamento — ${rif} di ${importo}`;
  const corpo = [
    `Spett.le ${f.partner.nome},`,
    ``,
    `con la presente Vi segnaliamo che, dai nostri riscontri contabili, risulta ancora insoluta la ${rif}` +
      `${f.emissione ? ` emessa il ${dataIt(f.emissione)}` : ""} di ${importo} (IVA inclusa)${scad}.`,
    ``,
    `Vi preghiamo di provvedere al saldo entro 7 giorni dalla ricezione della presente, oppure di ` +
      `contattarci qualora il pagamento fosse già stato disposto o vi fossero contestazioni in merito.`,
    ``,
    `Restiamo a disposizione per qualsiasi chiarimento.`,
    ``,
    `Cordiali saluti,`,
    `Deluxy — Amministrazione`,
  ].join("\n");

  return { oggetto, corpo };
}
