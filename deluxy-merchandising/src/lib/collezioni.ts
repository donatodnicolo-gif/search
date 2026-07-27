// Le proprietà che decidiamo NOI sulle collezioni di Shopify.
//
// Shopify sa che cosa contiene una collezione e come si ordina; non sa dove la
// usiamo (vetrina, home, un menu, una campagna) né se è materiale buono per
// l'advertising. Quelle sono decisioni di merchandising: vivono qui, non sul
// negozio, e da qui le leggono le altre app.

export const POSIZIONI = [
  { chiave: "vetrina", nome: "Vetrina", cosaSignifica: "Va nella vetrina fisica o nella prima schermata del sito." },
  { chiave: "home", nome: "Home", cosaSignifica: "Compare nella home del negozio." },
  { chiave: "menu", nome: "Menu di navigazione", cosaSignifica: "È una voce del menu del sito." },
  { chiave: "landing", nome: "Landing", cosaSignifica: "Ha una pagina dedicata, di solito per una campagna." },
  { chiave: "newsletter", nome: "Newsletter", cosaSignifica: "Si usa nelle email ai clienti." },
  { chiave: "social", nome: "Social", cosaSignifica: "Materiale per i canali social organici." },
  { chiave: "stagionale", nome: "Stagionale", cosaSignifica: "Vive solo in una finestra dell'anno (Natale, San Valentino…)." },
] as const;

export type ChiavePosizione = (typeof POSIZIONI)[number]["chiave"];

export function posizioniDa(testo: string | null | undefined): string[] {
  return (testo ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function nomePosizione(chiave: string): string {
  return POSIZIONI.find((p) => p.chiave === chiave)?.nome ?? chiave;
}

export const ETICHETTA_STATO_COLLEZIONE_SHOPIFY: Record<string, string> = {
  attiva: "Attiva",
  sospesa: "Sospesa",
};

export const COLORE_STATO_COLLEZIONE_SHOPIFY: Record<string, string> = {
  attiva: "var(--green)",
  sospesa: "var(--text-tertiary)",
};

export const ETICHETTA_TIPO_COLLEZIONE: Record<string, string> = {
  manuale: "Manuale",
  automatica: "Automatica",
};

/** Le condizioni di una collezione automatica, in italiano leggibile. */
export function descriviRegole(regoleJson: string | null): string[] {
  if (!regoleJson) return [];
  try {
    const r = JSON.parse(regoleJson) as {
      appliedDisjunctively?: boolean;
      rules?: { column: string; relation: string; condition: string }[];
    };
    const colonne: Record<string, string> = {
      TITLE: "il titolo",
      TYPE: "il tipo prodotto",
      VENDOR: "il vendor",
      TAG: "i tag",
      PRODUCT_TAXONOMY_NODE_ID: "la categoria Shopify",
      VARIANT_PRICE: "il prezzo",
      VARIANT_COMPARE_AT_PRICE: "il prezzo pieno",
      VARIANT_WEIGHT: "il peso",
      VARIANT_INVENTORY: "la giacenza",
      VARIANT_TITLE: "il titolo della variante",
      IS_PRICE_REDUCED: "il prezzo ribassato",
    };
    const relazioni: Record<string, string> = {
      EQUALS: "è",
      NOT_EQUALS: "non è",
      GREATER_THAN: "è maggiore di",
      LESS_THAN: "è minore di",
      STARTS_WITH: "comincia con",
      ENDS_WITH: "finisce con",
      CONTAINS: "contiene",
      NOT_CONTAINS: "non contiene",
      IS_SET: "è valorizzato",
      IS_NOT_SET: "non è valorizzato",
    };
    return (r.rules ?? []).map(
      (x) => `${colonne[x.column] ?? x.column} ${relazioni[x.relation] ?? x.relation} «${x.condition}»`
    );
  } catch {
    return [];
  }
}

export function regoleInOEd(regoleJson: string | null): "tutte" | "almeno una" | null {
  if (!regoleJson) return null;
  try {
    const r = JSON.parse(regoleJson) as { appliedDisjunctively?: boolean };
    return r.appliedDisjunctively ? "almeno una" : "tutte";
  } catch {
    return null;
  }
}
