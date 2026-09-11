// **Aggiungere al prodotto le varianti che arrivano dalla piattaforma.**
//
// Stava dentro la rotta `/api/v1/prodotti`; da qui la usano in due — la rotta,
// quando la piattaforma spinge, e il tasto «Recupera dalla piattaforma», che va
// a prenderle quando la spinta non le ha mandate (11/09/2026).
//
// ⚠️ **Aggiunge e basta.** Non cancella e non riscrive una variante già qui:
// quello che c'è può essere stato corretto da una persona, e una taglia che
// sparisce di là non è un buon motivo per perdere il suo legame con gli ordini.

import { prisma } from "./db";

export type VarianteArrivata = {
  nome: string;
  sku: string | null;
  prezzo: number | null;
  prezzoPartner: number | null;
  note: string | null;
  giacenza: number;
};

/** Ritorna quante varianti sono state aggiunte davvero. */
export async function allineaVarianti(
  prodottoId: string,
  gia: { id: string; nome: string; sku: string | null }[],
  arrivate: VarianteArrivata[],
  prezzoBase: number,
  costoBase: number,
): Promise<number> {
  if (!arrivate.length) return 0;
  const perSku = new Set(gia.map((v) => (v.sku ?? "").trim().toUpperCase()).filter(Boolean));
  const perNome = new Set(gia.map((v) => v.nome.trim().toLowerCase()));
  let nuove = 0;
  for (const [i, v] of arrivate.entries()) {
    const sku = (v.sku ?? "").trim().toUpperCase();
    if ((sku && perSku.has(sku)) || perNome.has(v.nome.trim().toLowerCase())) continue;
    // Uno SKU già di un'altra scheda non si prende: è un doppione da
    // riconciliare, e rubarlo romperebbe il legame con gli ordini.
    if (sku) {
      const altrove = await prisma.variante.findUnique({ where: { sku: v.sku as string }, select: { id: true } });
      if (altrove) continue;
    }
    await prisma.variante.create({
      data: {
        prodottoId,
        nome: v.nome,
        sku: v.sku,
        deltaPrezzo: v.prezzo != null ? v.prezzo - prezzoBase : 0,
        deltaCosto: v.prezzoPartner != null ? v.prezzoPartner - costoBase : 0,
        prezzoPartner: v.prezzoPartner,
        note: v.note,
        giacenza: v.giacenza,
        ordine: gia.length + i,
      },
    });
    // Le già viste si aggiornano man mano: due varianti con lo stesso nome
    // nello stesso invio non devono diventare due righe uguali.
    if (sku) perSku.add(sku);
    perNome.add(v.nome.trim().toLowerCase());
    nuove++;
  }
  return nuove;
}
