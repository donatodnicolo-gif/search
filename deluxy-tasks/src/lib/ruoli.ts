// Ruoli utente, allineati a quelli del Deluxy Hub (fonte degli utenti).
// Solo "admin" vede il tasks di tutti; gli altri vedono i propri task
// e quelli della propria squadra.

export const RUOLI = ["admin", "partner", "commerciale"] as const;
export type Ruolo = (typeof RUOLI)[number];

export function isRuolo(v: unknown): v is Ruolo {
  return typeof v === "string" && (RUOLI as readonly string[]).includes(v);
}

export function isAdmin(ruolo: string | undefined | null): boolean {
  return ruolo === "admin";
}
