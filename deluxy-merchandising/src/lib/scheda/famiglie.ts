// **Le famiglie di prodotto**: cosa si chiede a chi compila, e come esce la
// scheda sul negozio.
//
// Dall'architettura dell'08/09/2026 (`docs/ARCHITETTURA-MODULO-DESCRIZIONE.md`,
// §1 e §3.2), che ha misurato 210 prodotti veri dei quattro negozi: **i blocchi
// dipendono dalla famiglia, non dal negozio**. Una torta ha Ingredienti e
// Allergeni, un bouquet ha Come Funziona e Significato, un vino ha cinque voci
// fisse. Sapere la famiglia è quindi la prima domanda del modulo: da lì
// discendono i campi da mostrare, i titoli delle sezioni e il `productType`.
//
// I titoli `<h6>` sono **fissi e uno per concetto**: sui negozi lo stesso
// blocco esiste come «DESCRIZIONE», «Descrizione» e «Dettagli Prodotto», e
// quella libertà non serve a nessuno.

export type BloccoFamiglia =
  | "racconto"
  | "personalizzazione"
  | "ingredienti"
  | "allergeni"
  | "pesiMisure"
  | "conservazione"
  | "comeFunziona"
  | "significato"
  | "dimensioni"
  | "dettagliCoppie"
  | "menu"
  | "validita";

export type Famiglia = {
  chiave: string;
  /** Come si chiama nel modulo. */
  nome: string;
  /** Il `productType` scritto su Shopify: è anche ciò che pesca le collezioni automatiche. */
  productType: string;
  /** L'etichetta della **prima riga** dell'elenco: «**Torta**: sacher». */
  etichettaRiga1: string;
  /** Il titolo della sezione che ospita il racconto. */
  titoloRacconto: "DESCRIZIONE" | "Dettagli Prodotto";
  /** I blocchi previsti, nell'ordine in cui escono nella scheda. */
  blocchi: BloccoFamiglia[];
  /** La riga 2 dell'elenco, quando è fissa per la famiglia. */
  riga2?: string;
  /** Il nome dell'opzione proposto per le varianti. */
  opzione?: string;
  /** Vale per i negozi B2B (chiusura e occasioni diverse). */
  b2b?: boolean;
};

/**
 * Le famiglie che coprono il grosso del catalogo. L'elenco è **aperto**: se ne
 * aggiunge una quando serve, ma nessuno scrive più i titoli a mano.
 */
export const FAMIGLIE: Famiglia[] = [
  {
    chiave: "torta-classica",
    nome: "Torta classica",
    productType: "Torte",
    etichettaRiga1: "Torta",
    titoloRacconto: "DESCRIZIONE",
    blocchi: ["racconto", "personalizzazione", "ingredienti", "allergeni", "pesiMisure", "conservazione"],
    riga2: "Personalizza: farcitura e dettagli",
    opzione: "Porzioni",
  },
  {
    chiave: "cake-design",
    nome: "Cake design",
    productType: "Cake Design",
    etichettaRiga1: "Torta di alta pasticceria",
    titoloRacconto: "DESCRIZIONE",
    blocchi: ["racconto", "personalizzazione", "ingredienti", "allergeni", "pesiMisure", "conservazione"],
    opzione: "Porzioni",
  },
  {
    chiave: "cream-tart",
    nome: "Cream tart",
    productType: "Cream Tart",
    etichettaRiga1: "Cream Tart",
    titoloRacconto: "DESCRIZIONE",
    blocchi: ["racconto", "personalizzazione", "ingredienti", "allergeni", "conservazione"],
    opzione: "Formato",
  },
  {
    chiave: "bouquet",
    nome: "Bouquet",
    productType: "Bouquet",
    etichettaRiga1: "Bouquet",
    titoloRacconto: "Dettagli Prodotto",
    blocchi: ["racconto", "comeFunziona", "significato", "dimensioni"],
    riga2: "Inclusi: biglietto scritto a mano e confezione regalo",
    opzione: "Dimensione",
  },
  {
    chiave: "rose-a-numero",
    nome: "Rose a numero",
    productType: "Bouquet",
    etichettaRiga1: "Bouquet di rose",
    titoloRacconto: "Dettagli Prodotto",
    blocchi: ["racconto", "comeFunziona", "significato", "dimensioni"],
    riga2: "Inclusi: biglietto scritto a mano e confezione regalo",
    opzione: "Numero di rose",
  },
  {
    chiave: "cappelliera",
    nome: "Cappelliera",
    productType: "Cappelliere",
    etichettaRiga1: "Cappelliera",
    titoloRacconto: "Dettagli Prodotto",
    blocchi: ["racconto", "comeFunziona", "significato", "dimensioni"],
    riga2: "Inclusi: biglietto scritto a mano e confezione regalo",
    opzione: "Dimensione",
  },
  {
    chiave: "cesto-floreale",
    nome: "Cesto floreale",
    productType: "Cesti",
    etichettaRiga1: "Cesto",
    titoloRacconto: "Dettagli Prodotto",
    blocchi: ["racconto", "comeFunziona", "dimensioni"],
    riga2: "Inclusi: biglietto scritto a mano e confezione regalo",
    opzione: "Dimensione",
  },
  {
    chiave: "vino",
    nome: "Vino / Spirits",
    productType: "Cantina",
    etichettaRiga1: "Bottiglia",
    titoloRacconto: "Dettagli Prodotto",
    blocchi: ["racconto", "dettagliCoppie"],
    riga2: "Inclusi: confezione regalo",
    opzione: "Formato",
  },
  {
    chiave: "box-gastronomico",
    nome: "Box gastronomico",
    productType: "Gastronomia",
    etichettaRiga1: "Box",
    titoloRacconto: "Dettagli Prodotto",
    blocchi: ["racconto", "comeFunziona", "ingredienti", "allergeni"],
    riga2: "Inclusi: biglietto scritto a mano e confezione regalo",
    opzione: "Formato",
  },
  {
    chiave: "servizio",
    nome: "Servizio / Voucher",
    productType: "Esperienze",
    etichettaRiga1: "Esperienza",
    titoloRacconto: "DESCRIZIONE",
    blocchi: ["racconto", "comeFunziona", "validita"],
  },
  {
    chiave: "oggetto",
    nome: "Oggetto",
    productType: "Regali",
    etichettaRiga1: "Regalo",
    titoloRacconto: "Dettagli Prodotto",
    blocchi: ["racconto", "dettagliCoppie"],
    riga2: "Inclusi: confezione regalo",
  },
  {
    chiave: "catering-b2b",
    nome: "Catering B2B",
    productType: "Catering",
    etichettaRiga1: "Catering",
    titoloRacconto: "DESCRIZIONE",
    blocchi: ["racconto", "menu", "allergeni", "personalizzazione"],
    b2b: true,
  },
];

export const famigliaDi = (chiave: string | null | undefined): Famiglia | null =>
  FAMIGLIE.find((f) => f.chiave === chiave) ?? null;

/**
 * **La riga 3 dell'elenco: la consegna, con le parole del negozio.**
 * Misurata sui quattro cataloghi: ognuno la dice a modo suo, e il cliente la
 * legge accanto al bottone di acquisto. Cambiarla è una decisione di quel
 * negozio, non del prodotto.
 */
export const RIGA_CONSEGNA: Record<string, string> = {
  Gifts: "Consegna: in guanti bianchi, a casa o dove vuoi tu",
  Flowers: "Consegna: a casa o dove vuoi tu",
  Cake: "Consegna: dove vuoi tu nel mondo",
  "Business Deluxy": "Consegna: in ufficio o dove vuoi tu",
};

/** Le note in corsivo che i negozi ripetono a mano su quasi ogni scheda. */
export const NOTA_FOTO = "La foto è a scopo illustrativo, l'aspetto potrebbe variare secondo la creatività dell'artista.";
export const NOTA_ALLERGENI = "Può contenere tracce di frutta a guscio.";

/** «Come Funziona» dei fiori: quattro punti identici in 26 schede su 45. */
export const COME_FUNZIONA_FIORI = [
  "Scegli il prodotto e la data di consegna.",
  "Un artista floreale della tua città lo prepara a mano il giorno stesso.",
  "Un valet Deluxy lo consegna in guanti bianchi, nella fascia oraria scelta.",
  "Ti avvisiamo a consegna avvenuta, con la foto della composizione.",
];

/** La tabella «Conservazione» delle torte: tre righe, sempre le stesse. */
export const CONSERVAZIONE_TORTE = [
  "Conservare in frigorifero a +4 °C.",
  "Togliere dal frigo 20 minuti prima di servire.",
  "Consumare entro 48 ore dalla consegna.",
];
