// **La descrizione di un prodotto per un negozio: un posto solo.**
//
// Import e pubblicazione devono usare la STESSA regola, altrimenti si
// distruggono a vicenda: l'import spezza l'HTML nei pezzi, la pubblicazione lo
// ricompone. Se le due parti non corrispondono, il primo salvataggio di un
// prodotto **sovrascrive sul negozio la scheda ricca con quello che è rimasto
// nel campo descrizione** — cioè cancella le tab dal sito.
//
// Qui sta solo la parte che legge dal database (plus del sito, sezioni
// definite, nome della categoria). La regola di composizione — quali sezioni,
// in che ordine, dove va il testo libero — è in `descrizione-shopify.ts`, che
// è pura e la usa anche il modulo nel browser: così l'anteprima che si vede
// mentre si scrive e la scheda che arriva su Shopify sono la stessa cosa.

import { prisma } from "./db";
import { componiDescrizioneHtml, sezioniDaScrivere, type SchedaComponibile } from "./descrizione-shopify";

export type SchedaProdotto = SchedaComponibile;
export { sezioniDaScrivere };

/**
 * L'HTML da mandare a Shopify per questo prodotto su questo negozio.
 * Torna stringa vuota se non c'è niente: chi chiama deve **non toccare** la
 * descrizione sul negozio invece di scriverci il vuoto.
 */
export async function descrizionePerNegozio(p: SchedaProdotto, sito: string): Promise<string> {
  const [negozio, definite, categoria] = await Promise.all([
    prisma.negozioShopify.findFirst({ where: { nome: sito }, select: { plusUno: true, plusDue: true } }),
    prisma.sezioneCategoria.findMany({
      where: { attiva: true, categoria: p.categoria },
      select: { categoria: true, negozio: true, nome: true, tipo: true, ordine: true },
    }),
    // ⚠️⚠️ Il nome leggibile della categoria si legge dalla TABELLA, non dalla
    // mappa `ETICHETTA_CATEGORIA` di `dominio.ts`: quella è una tassonomia
    // vecchia (BOUQUET, PIANTA, HOME_FRAGRANCE) che non conosce le categorie di
    // oggi e restituisce la CHIAVE GREZZA. Il 10/09/2026 su un panettone vero è
    // finito «<b>TORTE_DOLCI</b>» in cima alla scheda del cliente.
    prisma.categoriaProdotto.findFirst({ where: { chiave: p.categoria }, select: { nome: true } }),
  ]);
  return componiDescrizioneHtml({
    // L'etichetta in grassetto del primo punto, quando il plus non ne ha una
    // sua. Senza un nome leggibile non si scrive niente: meglio un punto senza
    // etichetta che una chiave di database stampata al cliente.
    etichettaCategoria: categoria?.nome ?? null,
    plusProdotto: p.plusProdotto,
    plusUno: negozio?.plusUno,
    plusDue: negozio?.plusDue,
    descrizione: p.descrizione,
    sezioni: sezioniDaScrivere(p, sito, definite),
  });
}
