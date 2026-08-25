import type { Acquisto, MovimentoFinanziario, RichiestaAcquisto } from "@prisma/client";
import type { AcquistoDTO, MovimentoDTO, RichiestaDTO } from "./tipi";

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export function serializzaMovimento(m: MovimentoFinanziario): MovimentoDTO {
  return {
    id: m.id,
    tipo: m.tipo,
    importo: m.importo,
    valuta: m.valuta,
    stato: m.stato,
    metodo: m.metodo,
    riferimento: m.riferimento,
    data: m.data.toISOString(),
    scadenza: iso(m.scadenza),
    note: m.note,
    creatoDa: m.creatoDa,
  };
}

export function pagatoDi(movimenti: MovimentoFinanziario[]): number {
  return movimenti
    .filter((m) => m.stato === "eseguito")
    .reduce((s, m) => s + (["nota_credito", "rimborso"].includes(m.tipo) ? -m.importo : m.importo), 0);
}

export function serializzaAcquisto(a: Acquisto & { movimenti: MovimentoFinanziario[] }): AcquistoDTO {
  const movimenti = [...a.movimenti].sort((x, y) => y.data.getTime() - x.data.getTime());
  return {
    id: a.id,
    numero: a.numero,
    descrizione: a.descrizione,
    categoria: a.categoria,
    fornitoreNome: a.fornitoreNome,
    fornitorePiva: a.fornitorePiva,
    imponibile: a.imponibile,
    iva: a.iva,
    totale: a.totale,
    valuta: a.valuta,
    stato: a.stato,
    numeroFattura: a.numeroFattura,
    dataFattura: iso(a.dataFattura),
    dataOrdine: a.dataOrdine.toISOString(),
    dataConsegnaPrevista: iso(a.dataConsegnaPrevista),
    dataConsegna: iso(a.dataConsegna),
    note: a.note,
    creatoDa: a.creatoDa,
    creatoIl: a.creatoIl.toISOString(),
    movimenti: movimenti.map(serializzaMovimento),
    pagato: pagatoDi(a.movimenti),
  };
}

export function serializzaRichiesta(r: RichiestaAcquisto): RichiestaDTO {
  return {
    id: r.id,
    numero: r.numero,
    richiedenteNome: r.richiedenteNome,
    richiedenteEmail: r.richiedenteEmail,
    titolo: r.titolo,
    descrizione: r.descrizione,
    categoria: r.categoria,
    fornitoreSuggerito: r.fornitoreSuggerito,
    importoStimato: r.importoStimato,
    valuta: r.valuta,
    priorita: r.priorita,
    dataNecessita: iso(r.dataNecessita),
    stato: r.stato,
    approvatoreNome: r.approvatoreNome,
    decisoIl: iso(r.decisoIl),
    notaDecisione: r.notaDecisione,
    acquistoId: r.acquistoId,
    creataIl: r.creataIl.toISOString(),
  };
}
