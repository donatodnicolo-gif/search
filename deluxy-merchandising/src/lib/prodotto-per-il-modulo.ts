import { Prisma } from "@prisma/client";

import type { ProdottoIniziale } from "@/components/FormProdottoNuovo";
import { isoRoma } from "@/lib/fuso";
import type { datiModuloProdotto } from "@/lib/modulo-prodotto-dati";
import { metafieldDaColonne } from "@/lib/shopify-collezioni";

/**
 * Quello che il modulo prodotto vuole leggere insieme al prodotto. Sta qui
 * accanto alla mappatura: chi aggiunge una relazione la aggiunge in un posto
 * solo, e le due pagine che usano il modulo la ricevono tutte e due.
 */
export const PRODOTTO_PER_IL_MODULO = {
  varianti: { orderBy: { creataIl: "asc" } },
  media: { orderBy: { ordine: "asc" } },
  collezioniShopify: { select: { collezione: { select: { id: true, titolo: true, tipo: true, negozio: true } } }, orderBy: { posizione: "asc" } },
  pubblicazioni: true,
} satisfies Prisma.ProdottoInclude;

export type ProdottoConTutto = Prisma.ProdottoGetPayload<{ include: typeof PRODOTTO_PER_IL_MODULO }>;

/**
 * **Il prodotto come lo vuole il modulo.**
 *
 * ⚠️ Stava dentro la pagina di modifica, e l'08/09/2026 è servito anche alla
 * pagina di duplicazione. Ricopiarlo voleva dire due mappature da settanta
 * righe che divergono al primo campo nuovo: chi aggiunge un campo lo aggiunge
 * in una sola delle due, e la duplicazione perde dati **in silenzio** — nessun
 * errore, solo un prodotto nuovo con qualcosa in meno. Sta qui una volta sola.
 *
 * Il negozio si sceglie come faceva la pagina: quello dichiarato sul prodotto,
 * altrimenti quello delle sue collezioni, altrimenti il primo dell'elenco.
 */
export function prodottoPerIlModulo(
  p: ProdottoConTutto,
  dati: Awaited<ReturnType<typeof datiModuloProdotto>>,
): { iniziale: ProdottoIniziale; nomeNegozio: string | null; negozio: (typeof dati.negozi)[number] | undefined } {
  // Il negozio: quello dichiarato, altrimenti quello delle sue collezioni, altrimenti il primo.
  const nomeNegozio = p.negozioNome ?? p.collezioniShopify[0]?.collezione.negozio ?? null;
  const negozio = dati.negozi.find((n) => n.nome === nomeNegozio) ?? dati.negozi[0];
  // I campi del negozio: i valori grezzi letti dall'import dinamico e, sotto,
  // quelli ricostruiti dalle colonne tipizzate — così un prodotto importato
  // prima del 04/09 mostra subito quello che l'app sa (gg_disp_min, occasioni,
  // fiori…) senza aspettare l'import notturno. Il grezzo vince.
  const grezzi = (p.metafieldShopify && typeof p.metafieldShopify === "object" && !Array.isArray(p.metafieldShopify)
    ? (p.metafieldShopify as Record<string, string>)
    : {}) as Record<string, string>;
  const metafield: Record<string, string> = { ...metafieldDaColonne(p), ...grezzi };
  const collezioniPreviste = Array.isArray(p.collezioniPreviste) ? (p.collezioniPreviste as string[]) : [];

  const iniziale: ProdottoIniziale = {
    id: p.id,
    nome: p.nome,
    negozioId: negozio?.id ?? "",
    fase: p.fase === "archiviato" ? "approvato" : p.fase,
    categoria: p.categoria,
    tipologiaVendita: p.tipologiaVendita ?? null,
    note: p.note ?? "",
    collezioneShopifyId: p.collezioneShopifyId ?? "",
    codice: p.codice,
    descrizione: p.descrizione ?? "",
    brief: p.brief ?? "",
    materiali: p.materiali ?? "",
    palette: p.palette ?? "",
    costoProduzione: p.costoProduzione,
    prezzoVendita: p.prezzoVendita,
    prezzoPartner: p.prezzoPartner,
    pubblicatoDal: p.pubblicatoDal ? isoRoma(p.pubblicatoDal) : "",
    pubblicatoFinoAl: p.pubblicatoFinoAl ? isoRoma(p.pubblicatoFinoAl) : "",
    controllaStock: p.varianti.some((v) => v.giacenza > 0),
    giacenza: p.varianti.length === 1 ? p.varianti[0].giacenza : 0,
    nomeOpzione: "Formato",
    varianti: p.varianti.map((v) => ({
      nome: v.nome,
      sku: v.sku,
      prezzo: String(p.prezzoVendita + v.deltaPrezzo),
      costo: v.deltaCosto ? String(p.costoProduzione + v.deltaCosto) : "",
      prezzoPartner: v.prezzoPartner != null ? String(v.prezzoPartner) : "",
      giacenza: String(v.giacenza),
    note: v.note ?? "" })),
    media: p.media
      .filter((x) => x.shopifyFileId)
      .map((x) => ({
        shopifyFileId: x.shopifyFileId as string,
        tipo: x.tipo === "video" ? "video" : "immagine",
        url: x.url,
        anteprima: x.anteprima,
        stato: x.stato === "fallito" ? "fallito" : x.stato === "in-elaborazione" ? "in-elaborazione" : "pronto",
        nome: x.nome ?? "",
        negozio: x.negozio ?? negozio?.nome ?? "",
      })),
    metafield,
    tags: (p.tagShopify ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    // ⭐ 08/09/2026: il primo dei tre punti e le sezioni già compilate, sito per sito.
    nomePartner: p.nomePartner ?? "",
    nomePartnerAttivo: p.nomePartnerAttivo,
    plusProdotto: p.plusProdotto ?? "",
    sezioniScheda:
      p.sezioniScheda && typeof p.sezioniScheda === "object" && !Array.isArray(p.sezioniScheda)
        ? (p.sezioniScheda as Record<string, Record<string, string>>)
        : {},
    // Sul negozio contano le appartenenze vere; se non c'è ancora, il programma scelto nel modulo.
    collezioni: p.collezioniShopify.length
      ? p.collezioniShopify.map((x) => ({ id: x.collezione.id, titolo: x.collezione.titolo, tipo: x.collezione.tipo, negozio: x.collezione.negozio }))
      : dati.collezioni.filter((c) => collezioniPreviste.includes(c.id)).map((c) => ({ id: c.id, titolo: c.titolo, tipo: "manuale", negozio: c.negozio })),
    shopifyId: p.shopifyId,
    // ⭐ 07/09/2026: gli altri negozi in cui sta già (dal modulo o dall'import),
    // spuntati in partenza; chi è stato tolto a mano non si ripropone.
    altriNegoziId: p.pubblicazioni
      .filter((r) => r.negozio !== negozio?.nome && r.shopifyId && r.origine !== "tolto")
      .map((r) => dati.negozi.find((n) => n.nome === r.negozio)?.id)
      .filter((x): x is string => !!x),
    pubblicazioni: p.pubblicazioni.map((r) => ({ negozio: r.negozio, shopifyId: r.shopifyId, statoShopify: r.statoShopify, statoVoluto: r.statoVoluto, errore: r.errore, origine: r.origine })),
  };

  // `negozio` esce insieme agli altri due: è quello **risolto** (col ripiego sul
  // primo dell'elenco quando il prodotto non ne dichiara uno), e serve a chi deve
  // dire «gli ALTRI negozi». Con il solo `nomeNegozio`, che può essere null, un
  // prodotto senza negozio dichiarato si vedeva elencare fra gli «altri» anche
  // il proprio.
  return { iniziale, nomeNegozio, negozio };
}
