// **La regola porta dentro i prodotti, non solo li mette in fila.**
//
// Una regola d'ordine dice «prima i fiori urgenti sopra i 300 €»: sa quali
// prodotti valgono per questa vetrina. Finché ordina soltanto, però, quelli che
// non sono ancora nella collezione restano fuori — e la vetrina resta indietro
// rispetto alla regola che la governa. Con l'aggiunta automatica accesa, ogni
// volta che la regola si applica quei prodotti **entrano**.
//
// Sta in un modulo a sé e non in `azioni-vetrina-shopify.ts` perché lì c'è
// `"use server"`: ogni export di quel file diventa un endpoint del sito, e una
// funzione interna non deve esserlo.

import { prisma } from "./db";
import { tokenDi } from "./negozi";
import { graphqlNegozio } from "./shopify-scrittura";
import { FILTRO_IN_SCENA } from "./ordinamento-vetrina";
import { corrisponde, filtroSuggerimenti, parsePassi } from "./regole-ordine";

/**
 * Quanti prodotti al massimo entrano in un giro. `collectionAddProducts` di
 * Shopify ne accetta 250 per chiamata: oltre, si spezzerebbe in più chiamate e
 * un giro potrebbe restare a metà. Se ne restano fuori lo dice il risultato —
 * un'aggiunta silenziosamente troncata si legge come «erano solo questi».
 */
const MAX_PER_GIRO = 250;

export type EsitoAggiunta = { aggiunti: number; restano: number; errore?: string };

/**
 * Fa entrare nella collezione i prodotti che **le condizioni della sua regola
 * prendono** e che dentro non ci sono ancora. Scrive **prima su Shopify** e solo
 * dopo qui: l'appartenenza vive sul negozio e si rilegge a ogni import, quindi
 * segnarla solo in locale sarebbe una bugia che dura fino al prossimo giro.
 *
 * Le righe create nascono con `origine: "regola"`, così a schermo si distingue
 * quello che ha portato la regola da quello che ci ha messo una persona.
 *
 * **Non toglie mai niente**: se un prodotto smette di corrispondere alle
 * condizioni resta dov'è. Togliere prodotti da una vetrina per conto proprio è
 * un'altra decisione, e non è questa.
 */
export async function aggiungiDaRegola(collezioneId: string): Promise<EsitoAggiunta> {
  const c = await prisma.collezioneShopify.findUnique({
    where: { id: collezioneId },
    select: {
      shopifyId: true,
      negozio: true,
      tipo: true,
      aggiuntaAutomatica: true,
      regolaOrdine: { select: { passi: true } },
    },
  });
  if (!c || !c.aggiuntaAutomatica || !c.regolaOrdine) return { aggiunti: 0, restano: 0 };
  // Una collezione automatica di Shopify decide da sé chi ci sta dentro: qui si
  // può cambiare l'ordine, non l'appartenenza.
  if (c.tipo !== "manuale") {
    return { aggiunti: 0, restano: 0, errore: "È una collezione automatica: chi ci entra lo decide la regola di Shopify." };
  }

  const filtro = filtroSuggerimenti(parsePassi(c.regolaOrdine.passi));
  // Una regola di sole metriche non dice **quali** prodotti, dice solo in che
  // ordine: farne entrare qualcuno sarebbe inventarsi un criterio.
  if (!filtro) return { aggiunti: 0, restano: 0 };

  // **Il filtro SQL è largo, la verità è `corrisponde()`.** Sui tag il filtro
  // Prisma può solo cercare il testo dentro la stringa dei tag, quindi «Milano»
  // pesca anche «Martesana Milano»; `corrisponde()` confronta il **tag intero**,
  // com'è giusto — un tag è un valore, non una parola. Senza questo secondo
  // passaggio entravano prodotti che poi nessun passo prendeva: la stessa
  // condizione avrebbe voluto dire due cose diverse a seconda di chi la legge.
  const larghi = await prisma.prodotto.findMany({
    where: {
      ...FILTRO_IN_SCENA,
      ...filtro,
      shopifyId: { not: null },
      collezioniShopify: { none: { collezioneId } },
    },
    select: {
      id: true, shopifyId: true, prezzoVendita: true, categoria: true, tipoShopify: true,
      vendorShopify: true, lineaId: true, tagShopify: true, ggDispMin: true, minimoOrario: true,
    },
    take: (MAX_PER_GIRO + 1) * 4,
  });
  const passi = parsePassi(c.regolaOrdine.passi).filter((p) => p.t !== "metrica");
  const candidati = larghi.filter((p) => passi.some((x) => corrisponde(p, x))).slice(0, MAX_PER_GIRO + 1);
  if (candidati.length === 0) return { aggiunti: 0, restano: 0 };
  const giro = candidati.slice(0, MAX_PER_GIRO);
  const restano = candidati.length - giro.length;

  const negozio = await prisma.negozioShopify.findFirst({ where: { nome: c.negozio }, select: { id: true } });
  const accesso = negozio ? await tokenDi(negozio.id) : null;
  if (!accesso) {
    return { aggiunti: 0, restano, errore: `Il negozio «${c.negozio}» non è collegato: serve un token con write_products.` };
  }

  const { corpo } = await graphqlNegozio(
    accesso.dominio,
    accesso.token,
    `mutation($id: ID!, $productIds: [ID!]!) {
       collectionAddProducts(id: $id, productIds: $productIds) {
         collection { id }
         userErrors { field message }
       }
     }`,
    { id: c.shopifyId, productIds: giro.map((p) => p.shopifyId as string) },
  );
  const err = [
    ...(corpo.errors ?? []).map((e) => e.message),
    ...((corpo.data?.collectionAddProducts?.userErrors as { message: string }[] | undefined) ?? []).map((e) => e.message),
  ];
  if (err.length) return { aggiunti: 0, restano, errore: `Shopify ha rifiutato: ${err.join(" · ")}` };

  // In fondo: l'ordine lo decide subito dopo la regola, e metterli in mezzo
  // adesso vorrebbe dire scegliere una posizione che dura un istante.
  const ultima = await prisma.prodottoInCollezioneShopify.aggregate({
    where: { collezioneId },
    _max: { posizione: true },
  });
  let posizione = (ultima._max.posizione ?? -1) + 1;
  const creati = await prisma.prodottoInCollezioneShopify.createMany({
    data: giro.map((p) => ({
      collezioneId,
      prodottoId: p.id,
      prodottoShopifyId: p.shopifyId as string,
      posizione: posizione++,
      origine: "regola",
    })),
    skipDuplicates: true,
  });
  return { aggiunti: creati.count, restano };
}
