// I campi **del negozio** che si possono correggere da qui.
//
// Sono quelli che Shopify possiede: modificarli solo nel nostro database non
// servirebbe a niente, perché al primo import tornerebbe il valore del negozio.
// Quindi la matita scrive **prima su Shopify**, e la copia locale si aggiorna
// solo se il negozio accetta. Così non esistono due verità.
//
// **È un elenco chiuso, e deve restarlo.** Una funzione che scrive «il campo
// che le dici» su Shopify sarebbe un endpoint per modificare qualunque cosa del
// negozio: qui si dichiara quali campi, e nient'altro passa.
//
// Fuori di proposito:
// - **handle**: cambia l'indirizzo pubblico della pagina. I link esistenti si
//   rompono e il posizionamento su Google riparte da zero. Si fa su Shopify, con
//   il redirect che serve.
// - **prezzo e immagini**: stanno sulle varianti e sui media, non sul prodotto;
//   toccarli da qui vorrebbe dire riscrivere mezzo catalogo con una casella di
//   testo.

export type TipoScheda = "prodotto" | "collezione";

export type CampoNegozio = {
  chiave: string;
  etichetta: string;
  /** Come si scrive: una riga o un testo lungo. */
  multiriga?: boolean;
  /** Il campo nostro dove si tiene la copia di quello che dice il negozio. */
  colonna: string;
  /** Come si chiama nell'input della mutation di Shopify. */
  campoShopify: string;
  /** Il testo di Shopify è HTML: si mostra ripulito, e si rimanda come paragrafo. */
  html?: boolean;
  aiuto?: string;
};

export const CAMPI_PRODOTTO: CampoNegozio[] = [
  { chiave: "titolo", etichetta: "Titolo", colonna: "nome", campoShopify: "title", aiuto: "È il nome che il cliente legge sul sito." },
  {
    chiave: "descrizione",
    etichetta: "Descrizione",
    multiriga: true,
    colonna: "descrizione",
    campoShopify: "descriptionHtml",
    html: true,
    aiuto: "Il testo della scheda sul sito. Qui si scrive in chiaro; la formattazione ricca si cura su Shopify.",
  },
  { chiave: "tipo", etichetta: "Categoria del negozio", colonna: "tipoShopify", campoShopify: "productType", aiuto: "Il «Tipo» nel riquadro Organizzazione del prodotto." },
  { chiave: "fornitore", etichetta: "Fornitore", colonna: "vendorShopify", campoShopify: "vendor", aiuto: "Il «Venditore» su Shopify." },
];

export const CAMPI_COLLEZIONE: CampoNegozio[] = [
  { chiave: "titolo", etichetta: "Titolo", colonna: "titolo", campoShopify: "title" },
  {
    chiave: "descrizione",
    etichetta: "Descrizione",
    multiriga: true,
    colonna: "descrizione",
    campoShopify: "descriptionHtml",
    html: true,
  },
];

export const campiDi = (tipo: TipoScheda) => (tipo === "prodotto" ? CAMPI_PRODOTTO : CAMPI_COLLEZIONE);

export const campoDi = (tipo: TipoScheda, chiave: string) => campiDi(tipo).find((c) => c.chiave === chiave) ?? null;

/**
 * Il testo da mandare a Shopify per un campo HTML. Si avvolge in paragrafi
 * invece di mandare il testo nudo: senza, gli a-capo scritti qui spariscono sul
 * sito e la descrizione diventa un muro.
 */
export function perShopify(campo: CampoNegozio, valore: string): string {
  if (!campo.html) return valore;
  const righe = valore.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return righe.map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("");
}
