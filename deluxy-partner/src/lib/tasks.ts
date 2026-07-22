// Etichette/badge per gli stati e le priorità delle attività finance.
export const STATI_TASK: Record<string, { label: string; badge: string }> = {
  aperto: { label: "Aperto", badge: "orange" },
  in_corso: { label: "In corso", badge: "blue" },
  fatto: { label: "Fatto", badge: "green" },
};

// Priorità su 3 livelli: P0 (massima) → P1 → P2. `peso` guida l'ordinamento.
export const PRIORITA_TASK: Record<string, { label: string; badge: string; peso: number }> = {
  P0: { label: "P0 · urgente", badge: "red", peso: 0 },
  P1: { label: "P1 · media", badge: "orange", peso: 1 },
  P2: { label: "P2 · bassa", badge: "neutral", peso: 2 },
};

// Compatibilità coi vecchi valori (alta/media/bassa) → P0/P1/P2.
const ALIAS_PRIORITA: Record<string, string> = { alta: "P0", media: "P1", bassa: "P2" };
export function normPriorita(p: string | null | undefined): string {
  if (!p) return "P1";
  if (PRIORITA_TASK[p]) return p;
  return ALIAS_PRIORITA[p] ?? "P1";
}
export function pesoPriorita(p: string | null | undefined): number {
  return PRIORITA_TASK[normPriorita(p)].peso;
}
