// **Archiviare vuol dire archiviare anche sul negozio.**
//
// ⚠️⚠️ 11/09/2026 — segnalazione dell'utente: «perché non riesco a mettere
// questo prodotto come Archiviato?». La misura ha detto che *lo era*: la fase
// era passata a `archiviato` alle 19:59, con la sua tappa. Quello che non era
// successo stava dall'altra parte — su Gifts «Torta Damianoooo» rispondeva
// `status: ACTIVE`. Cioè il prodotto era archiviato **solo nella nostra
// etichetta** e restava in vendita per il cliente: il gesto sembrava non
// funzionare perché, dove conta, non funzionava.
//
// Qui sta il passo che mancava, in un posto solo perché lo usano due strade —
// il tasto rapido delle fasi e il modulo — e due copie della stessa regola
// diventerebbero due comportamenti diversi alla prima correzione.
//
// ⚠️ **ARCHIVED su Shopify non cancella niente**: il prodotto esce dalla
// vendita, resta nell'admin con i suoi ordini e le sue statistiche, e si
// riattiva quando si vuole. È la ragione per cui si può fare da qui senza
// chiedere conferma ogni volta: non è un gesto che porta via dati.

import { prisma } from "./db";
import { tokenDi } from "./negozi";
import { aggiornaProdottoSuShopify } from "./shopify-admin";

export type EsitoArchiviazione = {
  /** Una riga per negozio, da mostrare a chi ha premuto. Vuoto = non era su nessun negozio. */
  righe: string[];
  archiviati: number;
};

export async function archiviaSuiNegozi(prodottoId: string): Promise<EsitoArchiviazione> {
  const p = await prisma.prodotto.findUnique({
    where: { id: prodottoId },
    select: {
      shopifyId: true,
      negozioNome: true,
      statoShopify: true,
      pubblicazioni: { select: { id: true, negozio: true, shopifyId: true, statoShopify: true } },
    },
  });
  if (!p) return { righe: [], archiviati: 0 };

  // Dove sta davvero: le pubblicazioni, più il negozio principale se non ha una
  // riga sua (i prodotti vecchi, arrivati dall'import, spesso non ce l'hanno).
  const dove = new Map<string, { shopifyId: string; stato: string | null; rigaId: string | null }>();
  for (const r of p.pubblicazioni) {
    if (r.shopifyId) dove.set(r.negozio, { shopifyId: r.shopifyId, stato: r.statoShopify, rigaId: r.id });
  }
  if (p.shopifyId && p.negozioNome && !dove.has(p.negozioNome)) {
    dove.set(p.negozioNome, { shopifyId: p.shopifyId, stato: p.statoShopify, rigaId: null });
  }
  if (dove.size === 0) return { righe: [], archiviati: 0 };

  const anagrafica = await prisma.negozioShopify.findMany({
    where: { nome: { in: [...dove.keys()] } },
    select: { id: true, nome: true },
  });
  const idPerNome = new Map(anagrafica.map((n) => [n.nome, n.id]));

  const righe: string[] = [];
  let archiviati = 0;
  for (const [nome, dati] of dove) {
    if (dati.stato === "ARCHIVED") {
      righe.push(`${nome}: era già archiviato`);
      continue;
    }
    const negozioId = idPerNome.get(nome);
    const accesso = negozioId ? await tokenDi(negozioId).catch(() => null) : null;
    if (!accesso) {
      // Si dice, non si tace: un prodotto che qui risulta archiviato e là è in
      // vendita è esattamente il difetto da cui nasce questo file.
      righe.push(`${nome}: non collegato, là resta ${dati.stato ?? "com'è"}`);
      continue;
    }
    const r = await aggiornaProdottoSuShopify(accesso, { shopifyId: dati.shopifyId, stato: "ARCHIVED" });
    const fallito = r.errori.length > 0;
    if (fallito) {
      righe.push(`${nome}: il negozio ha rifiutato (${r.errori.map((e) => e.messaggio).join("; ").slice(0, 120)})`);
      continue;
    }
    archiviati++;
    righe.push(`${nome}: archiviato sul negozio`);
    if (dati.rigaId) {
      await prisma.pubblicazioneNegozio.update({ where: { id: dati.rigaId }, data: { statoShopify: "ARCHIVED" } });
    }
    if (p.shopifyId === dati.shopifyId) {
      await prisma.prodotto.update({
        where: { id: prodottoId },
        // `shopifyStato` è una nota nostra con tre valori soli: un archiviato
        // non è una «bozza». Lo stato vero del negozio sta in `statoShopify`.
        data: { statoShopify: "ARCHIVED", shopifyStato: "non_pubblicato", shopifySyncIl: new Date() },
      });
    }
  }
  return { righe, archiviati };
}
