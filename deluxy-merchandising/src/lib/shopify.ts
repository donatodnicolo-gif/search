// Ponte verso Shopify — il canale di vendita a valle.
// L'app di merchandising è la fonte di verità: qui si costruisce il payload del
// prodotto e si tiene traccia dello stato di pubblicazione. La scrittura reale
// su Shopify richiede le credenziali del negozio (SHOPIFY_STORE_DOMAIN +
// SHOPIFY_ADMIN_TOKEN) e va confermata: finché mancano, l'app prepara tutto ma
// non pubblica, così non si tocca il negozio per errore.

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

export function shopifyConfigurato(): boolean {
  return Boolean(process.env.SHOPIFY_STORE_DOMAIN && process.env.SHOPIFY_ADMIN_TOKEN);
}
