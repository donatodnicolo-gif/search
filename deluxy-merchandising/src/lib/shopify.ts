// Ponte verso Shopify — il canale di vendita a valle.
//
// ⚠️ Qui dentro è rimasta SOLO la costruzione del payload, cioè l'anteprima di
// «che cosa manderemmo». La scrittura vera non passa di qui: sta in
// `shopify-admin.ts`, che prende dominio e token dai negozi di Impostazioni
// (`negozi.ts`) e non legge nessuna variabile d'ambiente.
//
// ⚠️⚠️ Il commento che stava qui parlava di SHOPIFY_STORE_DOMAIN e
// SHOPIFY_ADMIN_TOKEN come se fossero il modo di collegare il negozio: non lo
// sono più dal 24/07/2026, ed è per questo che due schermate hanno passato
// settimane a dire «nessun negozio collegato» mentre i prodotti andavano su
// Shopify regolarmente.

import { etichettaCategoria, prezzoVariante } from "./dominio";

export type ProdottoConVarianti = {
  codice: string;
  nome: string;
  descrizione: string | null;
  categoria: string;
  prezzoVendita: number;
  costoProduzione: number;
  immagine: string | null;
  collezione?: { nome: string; stagione: string } | null;
  varianti: { nome: string; sku: string | null; deltaPrezzo: number; deltaCosto: number; giacenza: number }[];
};

// Il payload che verrebbe inviato all'Admin API di Shopify (productSet/productCreate).
// Forma leggibile e stabile: è ciò che si vede in anteprima nella pagina Shopify.
export function costruisciPayloadShopify(p: ProdottoConVarianti) {
  const tags = [p.categoria && etichettaCategoria(p.categoria), p.collezione?.nome, p.collezione?.stagione].filter(
    Boolean
  ) as string[];

  const varianti = (p.varianti.length ? p.varianti : [{ nome: "Standard", sku: p.codice, deltaPrezzo: 0, deltaCosto: 0, giacenza: 0 }]).map(
    (v) => {
      const { prezzo, costo } = prezzoVariante(p, v);
      return {
        title: v.nome,
        sku: v.sku ?? p.codice,
        price: prezzo.toFixed(2),
        cost: costo.toFixed(2),
        inventoryQuantity: v.giacenza,
      };
    }
  );

  return {
    title: p.nome,
    handle: p.codice.toLowerCase(),
    descriptionHtml: p.descrizione ?? "",
    vendor: "Deluxy",
    productType: etichettaCategoria(p.categoria),
    tags,
    images: p.immagine ? [{ src: p.immagine }] : [],
    variants: varianti,
  };
}

// ⚠️⚠️ QUI C'ERA `shopifyConfigurato()`, tolta l'11/09/2026 (utente: «devi usare
// lo stesso modo che usiamo per pubblicare gli altri prodotti che finiscono su
// shopify»).
//
// Guardava `process.env.SHOPIFY_STORE_DOMAIN` e `SHOPIFY_ADMIN_TOKEN`, due
// variabili che questa app NON usa più dal 24 luglio e che nessuno imposta: da
// allora rispondeva sempre «nessun negozio», e le due schermate che la
// chiamavano lo scrivevano in faccia a chi pubblicava su quattro negozi tutti i
// giorni. Un avviso che dice il falso è peggio di nessun avviso.
//
// I negozi veri sono le righe di `NegozioShopify` (Impostazioni), ognuna col
// suo dominio e il suo token: si leggono da `negozi.ts` e sono gli stessi che
// usa il modulo del prodotto. **Non rimetterla**: se serve sapere se c'è un
// negozio, si contano quelli attivi.
