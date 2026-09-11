import { Prisma } from "@prisma/client";

import type { ProdottoIniziale } from "@/components/FormProdottoNuovo";
import { isoRoma } from "@/lib/fuso";
import type { datiModuloProdotto } from "@/lib/modulo-prodotto-dati";
import { orarioConsegnaDaOraMinima } from "@/lib/orario-consegna";
import { CAMPI_FISSI_DEL_PARTNER, CAMPI_PREDEFINITI_DEL_PARTNER, daPiattaforma } from "@/lib/prodotti-dal-partner";
import { metafieldDaColonne } from "@/lib/shopify-collezioni";

/**
 * **Il sito su cui si pubblica se nessuno ha detto altro: deluxy.it.**
 *
 * Regola dell'utente (11/09/2026). Si riconosce dal **canale di vendita**,
 * non dal nome: qui dentro il negozio si chiama «Gifts», e il nome puo'
 * cambiare senza che cambi il sito. Se per qualche motivo non c'e', si torna
 * al primo negozio, che e' il comportamento di prima.
 */
function negozioPredefinito<T extends { nome: string; canaleVendite?: string | null }>(negozi: T[]): T | undefined {
  return (
    negozi.find((n) => (n.canaleVendite ?? "").trim().toLowerCase() === "deluxy.it") ??
    negozi.find((n) => n.nome.trim().toLowerCase() === "deluxy.it") ??
    negozi[0]
  );
}

/**
 * Quello che il modulo prodotto vuole leggere insieme al prodotto. Sta qui
 * accanto alla mappatura: chi aggiunge una relazione la aggiunge in un posto
 * solo, e le due pagine che usano il modulo la ricevono tutte e due.
 */
export const PRODOTTO_PER_IL_MODULO = {
  varianti: { orderBy: [{ ordine: "asc" }, { creataIl: "asc" }] },
  media: { orderBy: { ordine: "asc" } },
  collezioniShopify: { select: { collezione: { select: { id: true, titolo: true, tipo: true, negozio: true } } }, orderBy: { posizione: "asc" } },
  pubblicazioni: true,
  // ⭐ 10/09/2026: i componenti del multiprodotto, per riproporli nel modulo.
  componenti: { orderBy: { creatoIl: "asc" }, select: { quantita: true, componente: { select: { id: true, nome: true, codice: true, prezzoVendita: true, costoProduzione: true } } } },
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
  // Il negozio: quello dichiarato, altrimenti quello delle sue collezioni,
  // altrimenti **deluxy.it**.
  //
  // ⭐ 11/09/2026 (regola utente): «di default il sito in cui pubblicare il
  // prodotto è deluxy.it». Prima era `dati.negozi[0]`, cioè il primo in ordine
  // alfabetico — Business Deluxy — che è il sito B2B: un prodotto senza negozio
  // dichiarato (tutti quelli dei partner) partiva dal sito sbagliato.
  // deluxy.it si riconosce dal canale di vendita, non dal nome: il nome qui
  // dentro è «Gifts», e un giorno potrebbe cambiare.
  const nomeNegozio = p.negozioNome ?? p.collezioniShopify[0]?.collezione.negozio ?? null;
  const negozio = dati.negozi.find((n) => n.nome === nomeNegozio) ?? negozioPredefinito(dati.negozi);
  // I campi del negozio: i valori grezzi letti dall'import dinamico e, sotto,
  // quelli ricostruiti dalle colonne tipizzate — così un prodotto importato
  // prima del 04/09 mostra subito quello che l'app sa (gg_disp_min, occasioni,
  // fiori…) senza aspettare l'import notturno. Il grezzo vince.
  const grezzi = (p.metafieldShopify && typeof p.metafieldShopify === "object" && !Array.isArray(p.metafieldShopify)
    ? (p.metafieldShopify as Record<string, string>)
    : {}) as Record<string, string>;
  const metafield: Record<string, string> = { ...metafieldDaColonne(p), ...grezzi };

  // ⭐⭐ 11/09/2026 — **il prodotto di un partner arriva con alcune cose già
  // decise** (regola utente): è un pezzo unico e non è fisico, perché lo
  // consegna la piattaforma. Questi due vincono su quello che c'è scritto: non
  // sono un suggerimento, sono cosa il prodotto è. L'id del partner invece si
  // riempie solo se manca — se qualcuno l'ha corretto qui, resta il suo.
  if (daPiattaforma(p.origine)) {
    Object.assign(metafield, CAMPI_FISSI_DEL_PARTNER);
    // ⭐ 11/09/2026 (regola utente): «se prodotto partner il valore è Creato
    // dall'Artista». È un **valore di partenza**, non un vincolo: si scrive solo
    // dove il campo è vuoto, e chi compila può cambiarlo.
    for (const [chiave, valore] of Object.entries(CAMPI_PREDEFINITI_DEL_PARTNER)) {
      if (!metafield[chiave]) metafield[chiave] = valore;
    }
    if (p.partnerIdShopify && !metafield["custom.partner_id"]) metafield["custom.partner_id"] = p.partnerIdShopify;
  }

  // ⭐ 11/09/2026 (regola utente): «Orario Consegna: deduci da ora minima di
  // consegna». Solo se nessuno l'ha scritto: una scheda che dichiara le sue
  // fasce sa meglio di noi quali sono.
  if (!metafield["custom.orario_consegna"] && metafield["custom.minimo_orario"]) {
    const dedotto = orarioConsegnaDaOraMinima(metafield["custom.minimo_orario"]);
    if (dedotto) metafield["custom.orario_consegna"] = dedotto;
  }
  const collezioniPreviste = Array.isArray(p.collezioniPreviste) ? (p.collezioniPreviste as string[]) : [];

  const iniziale: ProdottoIniziale = {
    id: p.id,
    nome: p.nome,
    // ⭐ 11/09/2026: lo sa il modulo, per bloccare i campi già decisi.
    dallaPiattaforma: daPiattaforma(p.origine),
    negozioId: negozio?.id ?? "",
    fase: p.fase === "archiviato" ? "approvato" : p.fase,
    categoria: p.categoria,
    tipoShopify: p.tipoShopify ?? "",
    seoTitolo: p.seoTitolo ?? "",
    seoDescrizione: p.seoDescrizione ?? "",
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
    pubblicazioni: p.pubblicazioni.map((r) => ({ negozio: r.negozio, shopifyId: r.shopifyId, handle: r.handle, statoShopify: r.statoShopify, statoVoluto: r.statoVoluto, errore: r.errore, origine: r.origine })),
    componenti: p.componenti.map((c) => ({ id: c.componente.id, nome: c.componente.nome, codice: c.componente.codice, prezzoVendita: c.componente.prezzoVendita, costoProduzione: c.componente.costoProduzione, quantita: c.quantita })),
  };

  // `negozio` esce insieme agli altri due: è quello **risolto** (col ripiego sul
  // primo dell'elenco quando il prodotto non ne dichiara uno), e serve a chi deve
  // dire «gli ALTRI negozi». Con il solo `nomeNegozio`, che può essere null, un
  // prodotto senza negozio dichiarato si vedeva elencare fra gli «altri» anche
  // il proprio.
  return { iniziale, nomeNegozio, negozio };
}
