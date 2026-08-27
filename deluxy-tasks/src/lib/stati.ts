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
// Mappa allineata al Libro UX&UI cap.5 (27/08/2026):
// - aperta = attende un'azione → orange («richiesto/aperto/pending» → orange);
// - in_corso = in lavorazione → blue (prima era GOLD: l'oro non è mai uno stato);
// - completata = concluso bene → green;
// - annullata = terminato/inerte → grey (il rosso significherebbe «richiede
//   intervento adesso», che un'annullata non chiede).
export const COLORE_STATO: Record<Stato, string> = {
  aperta: "var(--orange)",
  in_corso: "var(--blue)",
  completata: "var(--green)",
  annullata: "var(--grey)",
};

// Tinta -soft di sfondo del badge (la formula: dot + tinta + testo pieno).
// Il grigio non ha una -soft nel DS: la neutra è --fill.
export const TINTA_STATO: Record<Stato, string> = {
  aperta: "var(--orange-soft)",
  in_corso: "var(--blue-soft)",
  completata: "var(--green-soft)",
  annullata: "var(--fill)",
};
