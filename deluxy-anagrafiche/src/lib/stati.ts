// Stati del ciclo di vita di un'anagrafica. "attivo" = partner operativo.
export const STATI = [
  "prospect",
  "in_contatto",
  "in_attesa",
  "in_trattativa",
  "da_ricontattare",
  "attivo",
  "non_interessato",
  "dismesso",
] as const;

export type Stato = (typeof STATI)[number];

export const ETICHETTE_STATO: Record<Stato, string> = {
  prospect: "Prospect",
  in_contatto: "In contatto",
  in_attesa: "In attesa",
  in_trattativa: "In trattativa",
  da_ricontattare: "Da ricontattare",
  attivo: "Attivo",
  non_interessato: "Non interessato",
  dismesso: "Dismesso",
};

// Colore semantico del badge (token del design system)
export const COLORE_STATO: Record<Stato, string> = {
  prospect: "var(--text-tertiary)",
  in_contatto: "var(--blue)",
  in_attesa: "var(--orange)",
  in_trattativa: "var(--purple)",
  da_ricontattare: "var(--orange)",
  attivo: "var(--green)",
  non_interessato: "var(--red)",
  dismesso: "var(--red)",
};

export function isStato(v: string): v is Stato {
  return (STATI as readonly string[]).includes(v);
}
