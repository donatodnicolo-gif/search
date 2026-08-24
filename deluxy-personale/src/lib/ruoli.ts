// Ruoli del Deluxy Hub: qui servono solo per decidere chi gestisce le chiavi.
export const RUOLI = ["admin", "partner", "commerciale"] as const;
export type Ruolo = (typeof RUOLI)[number];

export function isRuolo(v: unknown): v is Ruolo {
  return typeof v === "string" && (RUOLI as readonly string[]).includes(v);
}

export function isAdmin(ruolo: Ruolo): boolean {
  return ruolo === "admin";
}
