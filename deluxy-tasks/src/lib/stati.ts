// Stati di una task, condivisi tra le app. Ordine = ciclo di vita.

export const STATI = ["aperta", "in_corso", "completata", "annullata"] as const;
export type Stato = (typeof STATI)[number];

export const STATO_DEFAULT: Stato = "aperta";

// Una task è "chiusa" (non più da fare) se completata o annullata.
export const STATI_CHIUSI: readonly Stato[] = ["completata", "annullata"];

export function isStato(v: unknown): v is Stato {
  return typeof v === "string" && (STATI as readonly string[]).includes(v);
}

export const ETICHETTA_STATO: Record<Stato, string> = {
  aperta: "Aperta",
  in_corso: "In corso",
  completata: "Completata",
  annullata: "Annullata",
};

// Colore semantico (token del design system) per il badge di stato.
export const COLORE_STATO: Record<Stato, string> = {
  aperta: "var(--blue)",
  in_corso: "var(--gold-strong)",
  completata: "var(--green)",
  annullata: "var(--text-tertiary)",
};
