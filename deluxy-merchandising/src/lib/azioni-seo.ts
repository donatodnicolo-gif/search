"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "./db";

// Il **SEO nostro**: titolo e descrizione che correggiamo e miglioriamo, tenuti
// separati da quelli letti dal negozio (`seoTitoloShopify`,
// `seoDescrizioneShopify`). Un import riscrive i secondi e non tocca mai i
// primi: senza questa separazione il primo giro d'import cancellerebbe il lavoro.

const pulisci = (v: FormDataEntryValue | null) => String(v ?? "").trim() || null;

export async function salvaSeoProdotto(id: string, fd: FormData) {
  await prisma.prodotto.update({
    where: { id },
    data: { seoTitolo: pulisci(fd.get("seoTitolo")), seoDescrizione: pulisci(fd.get("seoDescrizione")) },
  });
  revalidatePath(`/prodotti/${id}`);
}

export async function salvaSeoCollezione(id: string, fd: FormData) {
  await prisma.collezioneShopify.update({
    where: { id },
    data: { seoTitolo: pulisci(fd.get("seoTitolo")), seoDescrizione: pulisci(fd.get("seoDescrizione")) },
  });
  revalidatePath(`/collezioni/shopify/${id}`);
}

/**
 * Parte dal testo del negozio: si corregge quello invece di riscrivere da zero.
 * **Non sovrascrive** un nostro testo già presente — quello si cambia a mano nel
 * riquadro, e un bottone non deve poter buttare via una revisione già fatta.
 */
export async function copiaSeoDalNegozio(tipo: "prodotto" | "collezione", id: string) {
  if (tipo === "prodotto") {
    const p = await prisma.prodotto.findUnique({
      where: { id },
      select: { seoTitolo: true, seoDescrizione: true, seoTitoloShopify: true, seoDescrizioneShopify: true },
    });
    if (!p) return;
    await prisma.prodotto.update({
      where: { id },
      data: {
        seoTitolo: p.seoTitolo ?? p.seoTitoloShopify,
        seoDescrizione: p.seoDescrizione ?? p.seoDescrizioneShopify,
      },
    });
    revalidatePath(`/prodotti/${id}`);
    return;
  }
  const c = await prisma.collezioneShopify.findUnique({
    where: { id },
    select: { seoTitolo: true, seoDescrizione: true, seoTitoloShopify: true, seoDescrizioneShopify: true },
  });
  if (!c) return;
  await prisma.collezioneShopify.update({
    where: { id },
    data: {
      seoTitolo: c.seoTitolo ?? c.seoTitoloShopify,
      seoDescrizione: c.seoDescrizione ?? c.seoDescrizioneShopify,
    },
  });
  revalidatePath(`/collezioni/shopify/${id}`);
}
