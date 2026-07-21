// Catalogo chiuso delle categorie (tipologie) di un'anagrafica. La UI obbliga a
// scegliere una di queste; il valore è sempre in MAIUSCOLO. "DA CLASSIFICARE" è
// lo stato iniziale delle anagrafiche non ancora smistate.
export const CATEGORIE = [
  "BOUTIQUE",
  "CORPORATE",
  "FIORISTA",
  "PASTICCERIA",
  "CIOCCOLATERIA",
  "GIOIELLERIA",
  "GIFTING",
  "MERCHANDISING",
  "RISTORANTE",
  "CATERING",
  "CHEF PRIVATO",
  "ENOTECA",
  "PARTY",
  "CONCIERGE",
  "ALTRO",
  "DA CLASSIFICARE",
] as const;

export type Categoria = (typeof CATEGORIE)[number];

export function isCategoria(v: string): v is Categoria {
  return (CATEGORIE as readonly string[]).includes(v);
}
