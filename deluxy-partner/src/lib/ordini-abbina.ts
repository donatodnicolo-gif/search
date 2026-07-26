import { prisma } from "./db";
import { numeroOrdine, causaleContieneNumero, causaleSoloNumero, valutaQuota } from "./ordini";
import type { TransazioneBancaria } from "@prisma/client";
import { quotaFornitore } from "./ordini-config";
import { registraPagamento } from "./pagamenti-rif";

// Abbinamento automatico ordini ↔ movimenti PER NUMERO D'ORDINE IN CAUSALE.
// Non è una server action (nessun "use server"): così può girare in automatico
// dopo la sync ordini e dopo l'import transazioni, oltre che dal pulsante.
//
// La priorità è l'ID/NUMERO dell'ordine riportato nella causale del movimento —
// NON l'importo (che per il costo fornitore è ~40% e quindi diverso dal totale):
//   • addebito (uscita) col numero → COSTO fornitore = |importo| del movimento;
//   • accredito (entrata) col numero → INCASSO del cliente (importo ~ totale).
// Si agisce solo sui match UNIVOCI 1:1 (un ordine ↔ un movimento).

export type EsitoAbbina = {
  incassi: number;
  incassiImportoDiverso: number;
  costi: number;
  costiFuoriQuota: number;
  costiImplausibili: number;
  ambigui: number;
};

// Trova le coppie univoche (un ordine ↔ un movimento) per numero in causale.
function abbinamentiUnivoci<O extends { id: string; nome: string }, T extends TransazioneBancaria>(
  ordini: O[],
  movimenti: T[],
  predicato: (t: TransazioneBancaria, num: string) => boolean
): { coppie: { o: O; t: T }[]; ambigui: number } {
  const perOrdine = new Map<string, string[]>();
  const perTx = new Map<string, string[]>();
  const raw: { oId: string; tId: string }[] = [];
  for (const o of ordini) {
    const num = numeroOrdine(o.nome);
    if (!num || num.length < 2) continue;
    for (const t of movimenti) {
      if (!predicato(t, num)) continue;
      raw.push({ oId: o.id, tId: t.id });
      (perOrdine.get(o.id) ?? perOrdine.set(o.id, []).get(o.id)!).push(t.id);
      (perTx.get(t.id) ?? perTx.set(t.id, []).get(t.id)!).push(o.id);
    }
  }
  const oById = new Map(ordini.map((o) => [o.id, o]));
  const tById = new Map(movimenti.map((t) => [t.id, t]));
  const coppie: { o: O; t: T }[] = [];
  let ambigui = 0;
  const usati = new Set<string>();
  for (const { oId, tId } of raw) {
    if (perOrdine.get(oId)!.length !== 1 || perTx.get(tId)!.length !== 1) { ambigui++; continue; }
    if (usati.has(tId)) continue;
    usati.add(tId);
    coppie.push({ o: oById.get(oId)!, t: tById.get(tId)! });
  }
  return { coppie, ambigui };
}

export async function eseguiAbbinamentoPerNumero(): Promise<EsitoAbbina> {
  const quota = await quotaFornitore();
  const [daRic, senzaCosto, ordiniAbbinati, entrate, uscite] = await Promise.all([
    prisma.ordineShopify.findMany({ where: { statoRicon: "da_riconciliare" } }),
    prisma.ordineShopify.findMany({ where: { pagatoFornitore: null, statoRicon: { not: "ignorato" } } }),
    prisma.ordineShopify.findMany({ where: { transazioneId: { not: null } }, select: { transazioneId: true } }),
    prisma.transazioneBancaria.findMany({ where: { importo: { gt: 0 } }, orderBy: { data: "desc" }, take: 5000 }),
    prisma.transazioneBancaria.findMany({ where: { importo: { lt: 0 } }, orderBy: { data: "desc" }, take: 5000 }),
  ]);
  const giaAbbinati = new Set(ordiniAbbinati.map((o) => o.transazioneId!));

  // INCASSO: accrediti liberi ↔ ordini da riconciliare (importo ~ totale)
  const entrateLibere = entrate.filter((t) => !giaAbbinati.has(t.id));
  const inc = abbinamentiUnivoci(daRic, entrateLibere, causaleContieneNumero);
  let incassi = 0;
  let incassiImportoDiverso = 0;
  for (const { o, t } of inc.coppie) {
    if (Math.abs(t.importo - o.totale) > Math.max(0.5, o.totale * 0.05)) { incassiImportoDiverso++; continue; }
    await prisma.$transaction([
      prisma.ordineShopify.update({ where: { id: o.id }, data: { statoRicon: "riconciliato", transazioneId: t.id, riconciliatoIl: new Date() } }),
      prisma.transazioneBancaria.update({ where: { id: t.id }, data: { stato: "registrata", esito: `ordine ${o.nome} riconciliato (n° in causale)` } }),
    ]);
    await registraPagamento({
      tipo: "ordine_shopify", direzione: "in", importo: o.totale, data: t.data,
      origineId: o.id, controparte: o.clienteNome ?? o.brand,
      descrizione: `Ordine ${o.nome} (${o.brand})`, divisa: o.valuta,
    });
    incassi++;
  }

  // COSTO FORNITORE: addebiti ↔ ordini senza costo. L'importo è quello del
  // movimento (~40%, diverso dal totale). Guardia di plausibilità: il costo deve
  // stare SOTTO il valore ordine (5–90%) — così un ID gateway che aggancia per
  // sbaglio un importo assurdo (es. 588% del totale) NON viene scritto in
  // automatico ma segnalato come da verificare.
  const cost = abbinamentiUnivoci(senzaCosto, uscite, causaleSoloNumero);
  let costi = 0;
  let costiFuoriQuota = 0;
  let costiImplausibili = 0;
  for (const { o, t } of cost.coppie) {
    const importo = +Math.abs(t.importo).toFixed(2);
    const pct = o.totale > 0.005 ? (importo / o.totale) * 100 : 999;
    if (pct < 5 || pct > 90) { costiImplausibili++; continue; }
    if (valutaQuota(o.totale, importo, quota).stato === "alto") costiFuoriQuota++;
    await prisma.ordineShopify.update({
      where: { id: o.id },
      data: { pagatoFornitore: importo, pagatoIl: t.data, fornitoreNome: t.controparte ?? null, transazionePagamentoId: t.id },
    });
    await registraPagamento({
      tipo: "costo_ordine_shopify", direzione: "out", importo, data: t.data,
      origineId: o.id, controparte: t.controparte ?? "fornitore",
      descrizione: `Costo ordine ${o.nome} (${o.brand}) — n° in causale`, divisa: o.valuta,
    });
    costi++;
  }

  return { incassi, incassiImportoDiverso, costi, costiFuoriQuota, costiImplausibili, ambigui: inc.ambigui + cost.ambigui };
}
