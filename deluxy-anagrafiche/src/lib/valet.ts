// Valet: cataloghi ed etichette. Come per gli stati dei partner, un posto solo
// così elenco, scheda, form e API dicono le stesse cose.

export const STATI_VALET = ["in_servizio", "sospeso", "cessato"] as const;

export type StatoValet = (typeof STATI_VALET)[number];

export const ETICHETTE_STATO_VALET: Record<StatoValet, string> = {
  in_servizio: "In servizio",
  sospeso: "Sospeso",
  cessato: "Cessato",
};

export const COLORE_STATO_VALET: Record<StatoValet, string> = {
  in_servizio: "var(--green)",
  sospeso: "var(--orange)",
  cessato: "var(--text-tertiary)",
};

export const STATO_VALET_PREDEFINITO: StatoValet = "in_servizio";

export function isStatoValet(v: string): v is StatoValet {
  return (STATI_VALET as readonly string[]).includes(v);
}

// I mezzi sono gli stessi che usa la piattaforma consegne (campo `vehicle`),
// così un valet importato da lì non cambia parola.
export const MEZZI = ["Auto", "Moto/Scooter", "Bicicletta", "Furgone", "A piedi"] as const;

// Nome per esteso: «Cognome Nome» quando il cognome c'è, così gli elenchi si
// leggono in ordine alfabetico come una rubrica.
export function nomeCompleto(v: { nome: string; cognome?: string | null }): string {
  return [v.cognome, v.nome].filter(Boolean).join(" ").trim() || v.nome;
}

// Province servite: si scrivono a mano separate da virgola, qui si normalizzano
// in sigle maiuscole senza doppioni.
export function normalizzaProvince(v: string | null | undefined): string | null {
  if (!v) return null;
  const parti = [
    ...new Set(
      v
        .split(/[,;/]+/)
        .map((p) => p.trim().toUpperCase())
        .filter(Boolean),
    ),
  ];
  return parti.length ? parti.join(", ") : null;
}
