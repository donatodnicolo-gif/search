// Deluxy Merchandising — vocabolario di dominio e calcoli.
// Niente enum a DB (SQLite): gli stati sono stringhe e qui vivono etichette,
// colori e ordine. Un unico posto per parlare la lingua della maison.

// ---------- Stagioni ----------
export const STAGIONI = [
  "SS26",
  "FW26",
  "CRUISE26",
  "HOLIDAY26",
  "SS27",
  "FW27",
] as const;

export const ETICHETTA_STAGIONE: Record<string, string> = {
  SS26: "Primavera/Estate 26",
  FW26: "Autunno/Inverno 26",
  CRUISE26: "Cruise 26",
  HOLIDAY26: "Feste 26",
  SS27: "Primavera/Estate 27",
  FW27: "Autunno/Inverno 27",
};

export function etichettaStagione(s?: string | null): string {
  if (!s) return "—";
  return ETICHETTA_STAGIONE[s] ?? s;
}

// ---------- Stato collezione ----------
export const STATI_COLLEZIONE = ["in_sviluppo", "in_vendita", "archiviata"] as const;
export type StatoCollezione = (typeof STATI_COLLEZIONE)[number];

export const ETICHETTA_STATO_COLLEZIONE: Record<string, string> = {
  in_sviluppo: "In sviluppo",
  in_vendita: "In vendita",
  archiviata: "Archiviata",
};
export const COLORE_STATO_COLLEZIONE: Record<string, string> = {
  in_sviluppo: "var(--orange)",
  in_vendita: "var(--green)",
  archiviata: "var(--text-tertiary)",
};

// ---------- Fasi del ciclo di vita prodotto (PLM) ----------
export const FASI_PLM = ["concept", "prototipo", "approvato", "in_vendita", "archiviato"] as const;
export type FasePlm = (typeof FASI_PLM)[number];

// Fasi "vive" mostrate nel board di sviluppo (l'archiviato è fuori pipeline).
export const FASI_PIPELINE: FasePlm[] = ["concept", "prototipo", "approvato", "in_vendita"];

export const ETICHETTA_FASE: Record<string, string> = {
  concept: "Concept",
  prototipo: "Prototipo",
  approvato: "Approvato",
  in_vendita: "In vendita",
  archiviato: "Archiviato",
};
export const COLORE_FASE: Record<string, string> = {
  concept: "var(--purple)",
  prototipo: "var(--blue)",
  approvato: "var(--gold-strong)",
  in_vendita: "var(--green)",
  archiviato: "var(--text-tertiary)",
};
export function ordineFase(f: string): number {
  const i = (FASI_PLM as readonly string[]).indexOf(f);
  return i === -1 ? 99 : i;
}

// ---------- Categorie prodotto ----------
export const CATEGORIE = [
  "BOUQUET",
  "COMPOSIZIONE",
  "PIANTA",
  "GIFT_BOX",
  "EDIZIONE_LIMITATA",
  "ACCESSORIO",
  "HOME_FRAGRANCE",
] as const;
export type Categoria = (typeof CATEGORIE)[number];

export const ETICHETTA_CATEGORIA: Record<string, string> = {
  BOUQUET: "Bouquet",
  COMPOSIZIONE: "Composizione",
  PIANTA: "Pianta",
  GIFT_BOX: "Gift box",
  EDIZIONE_LIMITATA: "Edizione limitata",
  ACCESSORIO: "Accessorio",
  HOME_FRAGRANCE: "Home fragrance",
};
export function etichettaCategoria(c?: string | null): string {
  if (!c) return "—";
  return ETICHETTA_CATEGORIA[c] ?? c;
}

// ---------- Stato Shopify ----------
export const STATI_SHOPIFY = ["non_pubblicato", "bozza", "pubblicato"] as const;
export type StatoShopify = (typeof STATI_SHOPIFY)[number];

export const ETICHETTA_SHOPIFY: Record<string, string> = {
  non_pubblicato: "Non pubblicato",
  bozza: "Bozza su Shopify",
  pubblicato: "Pubblicato",
};
export const COLORE_SHOPIFY: Record<string, string> = {
  non_pubblicato: "var(--text-tertiary)",
  bozza: "var(--orange)",
  pubblicato: "var(--green)",
};

// ---------- Denaro e margini ----------
const EUR = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
export function euro(n: number): string {
  return EUR.format(n || 0);
}

const PCT = new Intl.NumberFormat("it-IT", { style: "percent", maximumFractionDigits: 0 });
export function percentuale(frazione: number): string {
  return PCT.format(frazione || 0);
}

export type Margine = {
  costo: number;
  prezzo: number;
  guadagno: number; // prezzo - costo
  marginePct: number; // guadagno / prezzo  (marginalità sul venduto)
  ricaricoPct: number; // guadagno / costo   (mark-up)
};

// Marginalità sul prezzo di vendita: è la lettura da maison ("che margine fa").
export function calcolaMargine(costo: number, prezzo: number): Margine {
  const c = costo || 0;
  const p = prezzo || 0;
  const guadagno = p - c;
  return {
    costo: c,
    prezzo: p,
    guadagno,
    marginePct: p > 0 ? guadagno / p : 0,
    ricaricoPct: c > 0 ? guadagno / c : 0,
  };
}

// Verde se il margine raggiunge il target, oro se è vicino (entro 8 punti),
// rosso se è sotto. Senza target: neutro.
export function coloreMargine(marginePct: number, targetPct?: number | null): string {
  if (targetPct == null) return "var(--text)";
  const m = marginePct * 100;
  if (m >= targetPct) return "var(--green)";
  if (m >= targetPct - 8) return "var(--gold-strong)";
  return "var(--red)";
}

// Prezzo/costo effettivi di una variante (base + delta).
export function prezzoVariante(base: { prezzoVendita: number; costoProduzione: number }, v: { deltaPrezzo: number; deltaCosto: number }) {
  return {
    prezzo: (base.prezzoVendita || 0) + (v.deltaPrezzo || 0),
    costo: (base.costoProduzione || 0) + (v.deltaCosto || 0),
  };
}

export function iso(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const data = typeof d === "string" ? new Date(d) : d;
  return data.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
}
