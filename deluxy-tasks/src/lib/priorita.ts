// Priorità di una task, condivise tra le app. Ordine = crescente.

export const PRIORITA = ["bassa", "media", "alta", "urgente"] as const;
export type Priorita = (typeof PRIORITA)[number];

export const PRIORITA_DEFAULT: Priorita = "media";

export function isPriorita(v: unknown): v is Priorita {
  return typeof v === "string" && (PRIORITA as readonly string[]).includes(v);
}

// Peso per l'ordinamento (urgente prima).
export const PESO_PRIORITA: Record<Priorita, number> = {
  urgente: 0,
  alta: 1,
  media: 2,
  bassa: 3,
};

export const ETICHETTA_PRIORITA: Record<Priorita, string> = {
  bassa: "Bassa",
  media: "Media",
  alta: "Alta",
  urgente: "Urgente",
};

export const COLORE_PRIORITA: Record<Priorita, string> = {
  bassa: "var(--text-tertiary)",
  media: "var(--text-secondary)",
  alta: "var(--orange)",
  urgente: "var(--red)",
};
