// Etichette/badge per gli stati e le priorità delle attività finance.
export const STATI_TASK: Record<string, { label: string; badge: string }> = {
  aperto: { label: "Aperto", badge: "orange" },
  in_corso: { label: "In corso", badge: "blue" },
  fatto: { label: "Fatto", badge: "green" },
};
export const PRIORITA_TASK: Record<string, { label: string; badge: string }> = {
  alta: { label: "Alta", badge: "red" },
  media: { label: "Media", badge: "neutral" },
  bassa: { label: "Bassa", badge: "neutral" },
};
