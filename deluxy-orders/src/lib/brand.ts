import { prisma } from "./db";

// I brand (negozi Shopify) con il loro colore. Il colore distingue a colpo
// d'occhio gli ordini dei vari negozi: pallino nell'elenco, bordo colorato
// delle schede, testata delle colonne nella vista per brand.

export type Brand = { id: string; nome: string; colore: string; attivo: boolean };

// Tavolozza di ripiego per i negozi aggiunti senza scegliere un colore: si
// assegna in ordine, così due brand nuovi non finiscono mai identici.
export const COLORI_BRAND = [
  "#b8963e", // oro Deluxy
  "#d70015", // rosso
  "#6d3fc4", // viola
  "#0071e3", // blu
  "#248a3d", // verde
  "#c93400", // arancio
] as const;

export function coloreDiRipiego(indice: number): string {
  return COLORI_BRAND[indice % COLORI_BRAND.length];
}

// Tutti i brand in ordine alfabetico (i negozi sospesi restano, servono a
// colorare gli ordini storici importati quando erano attivi).
export async function brandConColore(): Promise<Brand[]> {
  const negozi = await prisma.negozioShopify.findMany({ orderBy: { brand: "asc" } });
  return negozi.map((n) => ({ id: n.id, nome: n.brand, colore: n.colore, attivo: n.attivo }));
}

// Mappa nome brand → colore, per colorare le righe senza altre query.
export function mappaColori(brand: Brand[]): Map<string, string> {
  return new Map(brand.map((b) => [b.nome, b.colore]));
}

// Colore di un brand con ripiego neutro se il negozio non c'è più.
export function coloreBrand(mappa: Map<string, string>, nome: string): string {
  return mappa.get(nome) ?? "var(--text-tertiary)";
}
