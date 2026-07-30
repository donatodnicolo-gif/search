import { prisma } from "./db";
import { causaleSenzaParole, numeriIsolati, numeroOrdine, quotaFornitore, valutaQuota, movimentiUsati } from "./controllo";
import type { MovimentoBanca } from "@prisma/client";

// ABBINAMENTO AUTOMATICO ordini ↔ movimenti PER NUMERO D'ORDINE IN CAUSALE.
//
// La priorità è il NUMERO, non l'importo: per il costo del fornitore l'importo è
// ~60% del totale, quindi cercare l'uguaglianza non troverebbe niente.
//  · accredito con il numero in causale → INCASSO del cliente (importo ~ totale);
//  · addebito la cui causale è il SOLO numero → COSTO del fornitore.
//
// Si agisce solo sui match UNIVOCI 1:1. Un numero che compare su due ordini o
// due movimenti resta «ambiguo» e non viene scritto: meglio una coda di lavoro
// che un abbinamento sbagliato dentro un conto.
//
// Non è una server action: gira dal pulsante, dopo l'import dei movimenti e nel
// cron notturno.

export type EsitoAbbina = {
  incassi: number;
  incassiImportoDiverso: number;
  costi: number;
  costiFuoriQuota: number;
  costiImplausibili: number;
  ambigui: number;
};

type OrdineMinimo = { id: string; numero: string; totale: number };

// L'indice numero → movimenti che lo citano in causale. Si costruisce in UNA
// passata sui movimenti, invece di provare ogni ordine contro ogni movimento:
// 12.680 ordini × 1.400 accrediti sono 18 milioni di confronti, cioè minuti di
// attesa dentro una server action che Vercel ucciderebbe prima.
// `soloNumero` è il criterio stretto dei pagamenti al fornitore: la causale non
// deve contenere parole.
function indicePerNumero(movimenti: MovimentoBanca[], soloNumero: boolean): Map<string, MovimentoBanca[]> {
  const indice = new Map<string, MovimentoBanca[]>();
  for (const m of movimenti) {
    if (soloNumero && !causaleSenzaParole(m.descrizione)) continue;
    const testo = soloNumero ? m.descrizione ?? "" : `${m.descrizione} ${m.controparte ?? ""}`;
    for (const numero of numeriIsolati(testo)) {
      if (numero.length < 2) continue;
      indice.set(numero, [...(indice.get(numero) ?? []), m]);
    }
  }
  return indice;
}

// Le coppie univoche (un ordine ↔ un movimento) secondo un criterio di causale.
function coppieUnivoche<O extends OrdineMinimo>(
  ordini: O[],
  movimenti: MovimentoBanca[],
  soloNumero: boolean,
): { coppie: { ordine: O; movimento: MovimentoBanca }[]; ambigui: number } {
  const indice = indicePerNumero(movimenti, soloNumero);
  const perOrdine = new Map<string, string[]>();
  const perMovimento = new Map<string, string[]>();
  const grezze: { ordineId: string; movimentoId: string }[] = [];

  for (const o of ordini) {
    const numero = numeroOrdine(o.numero);
    if (!numero || numero.length < 2) continue;
    for (const m of indice.get(numero) ?? []) {
      grezze.push({ ordineId: o.id, movimentoId: m.id });
      perOrdine.set(o.id, [...(perOrdine.get(o.id) ?? []), m.id]);
      perMovimento.set(m.id, [...(perMovimento.get(m.id) ?? []), o.id]);
    }
  }

  const ordinePerId = new Map(ordini.map((o) => [o.id, o]));
  const movimentoPerId = new Map(movimenti.map((m) => [m.id, m]));
  const coppie: { ordine: O; movimento: MovimentoBanca }[] = [];
  const usati = new Set<string>();
  let ambigui = 0;

  for (const { ordineId, movimentoId } of grezze) {
    if (perOrdine.get(ordineId)!.length !== 1 || perMovimento.get(movimentoId)!.length !== 1) {
      ambigui++;
      continue;
    }
    if (usati.has(movimentoId)) continue;
    usati.add(movimentoId);
    coppie.push({ ordine: ordinePerId.get(ordineId)!, movimento: movimentoPerId.get(movimentoId)! });
  }
  return { coppie, ambigui };
}

export async function eseguiAbbinamentoPerNumero(): Promise<EsitoAbbina> {
  const quota = await quotaFornitore();
  const usati = await movimentiUsati();

  const [daRiconciliare, senzaCosto, entrate, uscite] = await Promise.all([
    // Solo gli ordini per cui in banca c'è davvero qualcosa da cercare.
    prisma.ordine.findMany({
      where: { statoIncasso: "da_riconciliare", gestioneIncasso: { in: ["riconciliazione", "pagamento_esterno"] } },
      select: { id: true, numero: true, totale: true, brand: true, valuta: true },
    }),
    prisma.ordine.findMany({
      where: { costoFornitore: null, statoIncasso: { not: "ignorato" } },
      select: { id: true, numero: true, totale: true },
    }),
    prisma.movimentoBanca.findMany({ where: { importo: { gt: 0 } }, orderBy: { data: "desc" }, take: 8000 }),
    prisma.movimentoBanca.findMany({ where: { importo: { lt: 0 } }, orderBy: { data: "desc" }, take: 12000 }),
  ]);

  const entrateLibere = entrate.filter((m) => !usati.has(m.id) && m.statoFinance !== "registrata");
  const usciteLibere = uscite.filter((m) => !usati.has(m.id));

  // ---- INCASSO: accredito col numero in causale ----
  const inc = coppieUnivoche(daRiconciliare, entrateLibere, false);
  let incassi = 0;
  let incassiImportoDiverso = 0;
  for (const { ordine, movimento } of inc.coppie) {
    // Il numero c'è ma l'importo è un altro: non si scrive in automatico. Può
    // essere un acconto o un altro ordine dello stesso cliente.
    if (Math.abs(movimento.importo - ordine.totale) > Math.max(0.5, ordine.totale * 0.05)) {
      incassiImportoDiverso++;
      continue;
    }
    await prisma.ordine.update({
      where: { id: ordine.id },
      data: { statoIncasso: "riconciliato", movimentoIncassoId: movimento.id, incassatoIl: movimento.data },
    });
    await prisma.eventoOrdine.create({
      data: {
        ordineId: ordine.id,
        tipo: "controllo",
        descrizione: `Incasso riconciliato in automatico: movimento del ${movimento.data.toLocaleDateString("it-IT")} (numero in causale)`,
        autore: "abbinamento",
      },
    });
    incassi++;
  }

  // ---- COSTO FORNITORE: addebito la cui causale è il solo numero ----
  const cos = coppieUnivoche(senzaCosto, usciteLibere, true);
  let costi = 0;
  let costiFuoriQuota = 0;
  let costiImplausibili = 0;
  for (const { ordine, movimento } of cos.coppie) {
    const importo = +Math.abs(movimento.importo).toFixed(2);
    const pct = ordine.totale > 0.005 ? (importo / ordine.totale) * 100 : 999;
    // Guardia di plausibilità: un costo del fornitore sta fra il 5% e il 90% del
    // valore dell'ordine. Fuori da lì l'aggancio è un caso, e un caso scritto in
    // automatico dentro un margine è un numero falso che nessuno rileggerà.
    if (pct < 5 || pct > 90) {
      costiImplausibili++;
      continue;
    }
    if (valutaQuota(ordine.totale, importo, quota).stato === "alto") costiFuoriQuota++;
    await prisma.ordine.update({
      where: { id: ordine.id },
      data: {
        costoFornitore: importo,
        costoIl: movimento.data,
        costoFornitoreNome: movimento.controparte ?? null,
        costoMovimentoId: movimento.id,
        costoDa: "causale",
      },
    });
    await prisma.eventoOrdine.create({
      data: {
        ordineId: ordine.id,
        tipo: "controllo",
        descrizione: `Costo fornitore ${importo.toLocaleString("it-IT", { style: "currency", currency: "EUR" })} agganciato in automatico (numero in causale)`,
        autore: "abbinamento",
      },
    });
    costi++;
  }

  return {
    incassi,
    incassiImportoDiverso,
    costi,
    costiFuoriQuota,
    costiImplausibili,
    ambigui: inc.ambigui + cos.ambigui,
  };
}
