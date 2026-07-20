// Stati del ciclo di vita di un pagamento diretto, con etichetta e badge.
export const STATI_PAG: Record<string, { label: string; badge: string }> = {
  predisposto: { label: "Predisposto", badge: "blue" },
  pagato: { label: "Pagato", badge: "green" },
  annullato: { label: "Annullato", badge: "red" },
};
