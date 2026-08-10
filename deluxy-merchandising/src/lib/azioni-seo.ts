"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { tokenDi } from "./negozi";
import { erroriDi, graphqlNegozio } from "./shopify-scrittura";

// Il **SEO nostro**: titolo e descrizione che correggiamo e miglioriamo, tenuti
// separati da quelli letti dal negozio (`seoTitoloShopify`,
// `seoDescrizioneShopify`). Un import riscrive i secondi e non tocca mai i
// primi: senza questa separazione il primo giro d'import cancellerebbe il lavoro.

const pulisci = (v: FormDataEntryValue | null) => String(v ?? "").trim() || null;

export async function salvaSeoProdotto(id: string, fd: FormData) {
  await prisma.prodotto.update({
    where: { id },
    data: {
      seoTitolo: pulisci(fd.get("seoTitolo")),
      seoDescrizione: pulisci(fd.get("seoDescrizione")),
      // Si segna **quando** è cambiato: confrontato con `seoSpintoIl` dice se
      // il negozio ha ancora la versione vecchia.
      seoModificatoIl: new Date(),
    },
  });
  revalidatePath(`/prodotti/${id}`);
}

export async function salvaSeoCollezione(id: string, fd: FormData) {
  await prisma.collezioneShopify.update({
    where: { id },
    data: {
      seoTitolo: pulisci(fd.get("seoTitolo")),
      seoDescrizione: pulisci(fd.get("seoDescrizione")),
      seoModificatoIl: new Date(),
    },
  });
  revalidatePath(`/collezioni/shopify/${id}`);
}

/**
 * **La bozza SEO scritta dall'AI**, nei campi nostri: legge titolo, descrizione,
 * condizioni e i prodotti più venduti della collezione, e propone meta title e
 * meta description. **Non manda niente al negozio** — resta una bozza da
 * rileggere, e su Google non cambia nulla finché non si preme «Manda».
 *
 * Sovrascrive la bozza attuale, ed è scritto sul bottone: è l'unico dato che
 * questo gesto può toccare, e resta comunque una bozza.
 */
export async function scriviSeoCollezioneConAI(id: string) {
  const { generaSeoCollezione } = await import("./ai-seo");
  const dove = `/collezioni/shopify/${id}`;
  const esito = await generaSeoCollezione(id);
  if (!esito.ok) {
    redirect(`${dove}?esito=errore&messaggio=${encodeURIComponent(esito.errore)}`);
  }
  await prisma.collezioneShopify.update({
    where: { id },
    data: { seoTitolo: esito.titolo, seoDescrizione: esito.descrizione, seoModificatoIl: new Date() },
  });
  revalidatePath(dove);
  redirect(
    `${dove}?esito=ok&messaggio=${encodeURIComponent(
      `Bozza scritta da ${esito.modello} sui dati veri della collezione: rileggila, correggila e poi mandala al negozio.`,
    )}`,
  );
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

/**
 * **Manda il nostro SEO al negozio.** È la prima scrittura dell'app che cambia
 * quello che il cliente legge su Google: si fa **una scheda per volta e con
 * conferma**, non in blocco.
 *
 * Paletti, gli stessi del push dell'ordine:
 * - serve un **token con `write_products`** sul negozio giusto;
 * - serve l'**id Shopify** della scheda (senza, non sappiamo cosa aggiornare);
 * - serve che **ci sia qualcosa di nostro** da mandare: un titolo e una
 *   descrizione vuoti cancellerebbero il SEO del negozio, e cancellare non è
 *   quello che si sta chiedendo.
 *
 * A buon fine si segna `seoSpintoIl` e si riallineano anche i campi
 * `...Shopify`: da quel momento il negozio dice quello che abbiamo mandato, e
 * mostrare ancora il testo vecchio a sinistra sarebbe falso.
 */
export async function spingiSeoSuShopify(tipo: "prodotto" | "collezione", id: string) {
  const dove = tipo === "prodotto" ? `/prodotti/${id}?tab=shopify` : `/collezioni/shopify/${id}`;
  const errore = (m: string) => redirect(`${dove}${dove.includes("?") ? "&" : "?"}esito=errore&messaggio=${encodeURIComponent(m)}`);

  const scheda =
    tipo === "prodotto"
      ? await prisma.prodotto.findUnique({
          where: { id },
          select: { seoTitolo: true, seoDescrizione: true, shopifyId: true, nome: true },
        })
      : await prisma.collezioneShopify.findUnique({
          where: { id },
          select: { seoTitolo: true, seoDescrizione: true, shopifyId: true, titolo: true, negozio: true },
        });
  if (!scheda) errore("Scheda non trovata.");
  if (!scheda!.seoTitolo && !scheda!.seoDescrizione) {
    errore("Non c'è niente di nostro da mandare: scrivi prima titolo o descrizione.");
  }
  if (!scheda!.shopifyId) {
    errore("Di questa scheda non conosciamo l'id su Shopify: rilancia l'import e riprova.");
  }

  // Il negozio: per una collezione è scritto sulla riga; per un prodotto si
  // ricava da una collezione a cui appartiene — è l'unico posto dove l'app sa
  // **su quale** negozio vive quel prodotto.
  const nomeNegozio =
    tipo === "collezione"
      ? (scheda as { negozio: string }).negozio
      : (
          await prisma.prodottoInCollezioneShopify.findFirst({
            where: { prodottoId: id },
            select: { collezione: { select: { negozio: true } } },
          })
        )?.collezione.negozio;
  if (!nomeNegozio) errore("Non risulta su nessun negozio collegato: rilancia l'import delle collezioni.");

  const negozio = await prisma.negozioShopify.findFirst({ where: { nome: nomeNegozio }, select: { id: true, permessi: true } });
  if (!negozio || !(negozio.permessi ?? "").includes("write_products")) {
    errore(`Il negozio «${nomeNegozio}» non ha un token con write_products: si collega in Impostazioni.`);
  }
  const accesso = await tokenDi(negozio!.id);
  if (!accesso) errore(`Il negozio «${nomeNegozio}» non è collegato.`);

  const campo = tipo === "prodotto" ? "productUpdate" : "collectionUpdate";
  const mutazione =
    tipo === "prodotto"
      ? `mutation($input: ProductInput!) { productUpdate(input: $input) { product { id seo { title description } } userErrors { field message } } }`
      : `mutation($input: CollectionInput!) { collectionUpdate(input: $input) { collection { id seo { title description } } userErrors { field message } } }`;

  const r = await graphqlNegozio(accesso!.dominio, accesso!.token, mutazione, {
    input: {
      id: scheda!.shopifyId,
      seo: { title: scheda!.seoTitolo ?? "", description: scheda!.seoDescrizione ?? "" },
    },
  });
  const err = erroriDi(r, campo);
  if (err.length) errore(`Shopify ha rifiutato: ${err.join(" · ")}`);

  const adesso = new Date();
  const dati = {
    seoSpintoIl: adesso,
    seoTitoloShopify: scheda!.seoTitolo,
    seoDescrizioneShopify: scheda!.seoDescrizione,
  };
  if (tipo === "prodotto") await prisma.prodotto.update({ where: { id }, data: dati });
  else await prisma.collezioneShopify.update({ where: { id }, data: dati });

  revalidatePath(dove);
  redirect(
    `${dove}${dove.includes("?") ? "&" : "?"}esito=ok&messaggio=${encodeURIComponent(
      "SEO mandato al negozio. Google lo riprende al prossimo passaggio, non subito.",
    )}`,
  );
}
