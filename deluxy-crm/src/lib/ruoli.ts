export const RUOLI = ["admin", "partner", "commerciale"] as const;
export type Ruolo = (typeof RUOLI)[number];

export function isRuolo(v: unknown): v is Ruolo {
  return typeof v === "string" && (RUOLI as readonly string[]).includes(v);
}

export function isAdmin(ruolo: string | undefined | null): boolean {
  return ruolo === "admin";
}
