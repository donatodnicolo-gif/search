"use server";

// **Pruning: proporre e poi spegnere i prodotti che non lavorano più.**
//
// Due gesti, tenuti separati apposta:
// - **Proporre** è del merchandiser e non tocca niente: scrive una data e un
//   motivo sul prodotto, che finisce nella lista delle proposte.
// - **Archiviare sul negozio** è la decisione: scrive PRIMA su Shopify
//   (`productUpdate status: ARCHIVED`) e solo se il negozio accetta segna qui
//   fase «archiviato» e stato ARCHIVED — così classifiche e vetrine lo
//   lasciano fuori, e l'app non racconta uno stato che il sito non ha.
//   Passa da una conferma: è una scrittura sul negozio vero.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { negoziAttivi } from "./negozi";
import { erroriDi, graphqlNegozio } from "./shopify-scrittura";

function testo(fd: FormData, k: string): string {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
}

function torna(esito: string, messaggio: string) {
  for (const p of ["/prodotti/pruning", "/prodotti", "/anagrafica", "/sviluppo"]) revalidatePath(p);
  redirect(`/prodotti/pruning?esito=${esito}&messaggio=${encodeURIComponent(messaggio)}`);
}

export async function proponiPruning(fd: FormData) {
  const id = testo(fd, "prodottoId");
  if (!id) torna("errore", "Prodotto non indicato.");
  const p = await prisma.prodotto.update({
    where: { id },
    data: { pruningPropostoIl: new Date(), pruningMotivo: testo(fd, "motivo") || null, pruningArchiviatoIl: null },
    select: { nome: true },
  });
  torna("ok", `«${p.nome}» proposto per la disattivazione.`);
}

export async function ritiraPruning(id: string) {
  const p = await prisma.prodotto.update({
    where: { id },
    data: { pruningPropostoIl: null, pruningMotivo: null },
    select: { nome: true },
  });
  torna("ok", `Proposta ritirata per «${p.nome}».`);
}

/** Il negozio di un prodotto: quello dichiarato, o quello delle sue collezioni. */
async function negozioDiProdotto(id: string): Promise<string | null> {
  const p = await prisma.prodotto.findUnique({
    where: { id },
    select: { negozioNome: true, collezioniShopify: { select: { collezione: { select: { negozio: true } } }, take: 1 } },
  });
  return p?.negozioNome ?? p?.collezioniShopify[0]?.collezione.negozio ?? null;
}

export async function archiviaSulNegozio(id: string) {
  const p = await prisma.prodotto.findUnique({
    where: { id },
    select: { id: true, nome: true, shopifyId: true, fase: true, pruningPropostoIl: true },
  });
  if (!p) torna("errore", "Prodotto non trovato.");
  const prodotto = p as NonNullable<typeof p>;
  if (!prodotto.pruningPropostoIl) torna("errore", `«${prodotto.nome}» non è fra le proposte: prima si propone, poi si archivia.`);

  if (prodotto.shopifyId) {
    const nomeNegozio = await negozioDiProdotto(prodotto.id);
    const negozio = (await negoziAttivi()).find((n) => n.nome === nomeNegozio);
    if (!negozio) torna("errore", `Non so su quale negozio stia «${prodotto.nome}» (${nomeNegozio ?? "nessuno"}): non posso archiviarlo sul sito.`);
    const negozioOk = negozio as NonNullable<typeof negozio>;
    const r = await graphqlNegozio(
      negozioOk.dominio,
      negozioOk.token,
      `mutation archivia($input: ProductInput!) {
         productUpdate(input: $input) { product { id status } userErrors { field message } }
       }`,
      { input: { id: prodotto.shopifyId, status: "ARCHIVED" } }
    );
    const err = erroriDi(r, "productUpdate");
    if (err.length) torna("errore", `Shopify non ha archiviato «${prodotto.nome}»: ${err.join(" · ")}`);
  }

  await prisma.prodotto.update({
    where: { id: prodotto.id },
    data: {
      fase: "archiviato",
      statoShopify: prodotto.shopifyId ? "ARCHIVED" : undefined,
      shopifyStato: prodotto.shopifyId ? "non_pubblicato" : undefined,
      shopifySyncIl: prodotto.shopifyId ? new Date() : undefined,
      pruningArchiviatoIl: new Date(),
    },
  });
  await prisma.tappaSviluppo.create({
    data: {
      prodottoId: prodotto.id,
      da: prodotto.fase,
      a: "archiviato",
      nota: prodotto.shopifyId ? "Archiviato sul negozio dal pruning." : "Archiviato dal pruning (non era su Shopify).",
      origine: "ui",
    },
  });
  torna("ok", prodotto.shopifyId ? `«${prodotto.nome}» archiviato sul negozio.` : `«${prodotto.nome}» archiviato qui (non era sul negozio).`);
}
