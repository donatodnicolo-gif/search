// Tipologie di interesse commerciale di un'anagrafica (multi-scelta).
// Catalogo nato dai valori reali della colonna "TIPOLOGIA INTERESSE" del
// tracker Excel, più "consegne" e "affiliazione" per i flussi della piattaforma.
export const INTERESSI = [
  "consegne",
  "affiliazione",
  "gifting",
  "catering",
  "eventi",
  "pr_activation",
  "in_store",
  "vendor",
] as const;

export type Interesse = (typeof INTERESSI)[number];

export const ETICHETTE_INTERESSE: Record<Interesse, string> = {
  consegne: "Consegne",
  affiliazione: "Affiliazione",
  gifting: "Gifting",
  catering: "Catering",
  eventi: "Eventi",
  pr_activation: "PR / Activation",
  in_store: "Decorazioni in-store",
  vendor: "Vendor Deluxy",
};

// Colore del dot (token del design system), stesso linguaggio dei badge stato
export const COLORE_INTERESSE: Record<Interesse, string> = {
  consegne: "var(--gold)",
  affiliazione: "var(--gold-strong)",
  gifting: "var(--purple)",
  catering: "var(--orange)",
  eventi: "var(--blue)",
  pr_activation: "var(--green)",
  in_store: "var(--red)",
  vendor: "var(--text-secondary)",
};

export function isInteresse(v: string): v is Interesse {
  return (INTERESSI as readonly string[]).includes(v);
}
