"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { tokenDi } from "./negozi";
import { graphqlNegozio } from "./shopify-scrittura";
import { numeraPosizioni, applicaRegoleACollezione, regoleDaForm, FILTRO_IN_SCENA } from "./ordinamento-vetrina";

/** Applica una o più regole in priorità: propone l'ordine come punto di partenza. */
export async function applicaRegolaOrdinamento(collezioneId: string, fd: FormData) {
  await applicaRegoleACollezione(collezioneId, regoleDaForm(fd));
  revalidatePath(`/visual/${collezioneId}`);
}

/** Ritocco a mano: sposta un prodotto su o giù di una posizione. */
export async function spostaInCollezione(
  collezioneId: string,
  prodottoId: string,
  direzione: "su" | "giu"
) {
  // Ordinato per posizione e, a pari posizione, per nome: lo stesso ordine che
  // la pagina mostra, così le frecce spostano rispetto a quello che si vede.
  // **Solo i prodotti in scena**: gli archiviati stanno in mezzo nel database ma
  // non a schermo, e senza questo filtro una freccia avrebbe scavalcato un
  // prodotto invisibile sembrando non fare niente.
  const membri = await prisma.prodottoInCollezioneShopify.findMany({
    where: { collezioneId, prodotto: FILTRO_IN_SCENA },
    orderBy: [{ posizione: "asc" }, { prodotto: { nome: "asc" } }],
    select: { prodottoId: true },
  });
  const ordine = membri.map((m) => m.prodottoId);
  const i = ordine.indexOf(prodottoId);
  if (i === -1) return;
  const j = direzione === "su" ? i - 1 : i + 1;
  if (j < 0 || j >= ordine.length) return;
  [ordine[i], ordine[j]] = [ordine[j], ordine[i]];
  await numeraPosizioni(collezioneId, ordine);
  await prisma.collezioneShopify.update({
    where: { id: collezioneId },
    data: { ordineModificatoIl: new Date() },
  });
  revalidatePath(`/visual/${collezioneId}`);
}


/**
 * **Toglie un prodotto dalla collezione, sul negozio vero.**
 *
 * Toglierlo solo qui sarebbe una bugia che dura fino al prossimo import: le
 * appartenenze si rileggono da Shopify, e il prodotto tornerebbe. Quindi si
 * chiama `collectionRemoveProducts` e **solo se il negozio conferma** si toglie
 * anche la riga locale.
 *
 * Gli stessi paletti del riordino, per lo stesso motivo:
 * - **solo collezioni manuali** — in una smart collection chi ci sta dentro lo
 *   decide la regola di Shopify: togliere un prodotto a mano non è previsto, e
 *   alla prima rivalutazione tornerebbe comunque;
 * - serve un **token con `write_products`**.
 *
 * Il prodotto **non viene cancellato né archiviato**: esce da questa collezione
 * e basta. Resta a catalogo, nelle altre collezioni e nelle vendite.
 */
export async function rimuoviProdottoDaCollezione(collezioneId: string, prodottoId: string) {
  const errore = (m: string) =>
    redirect(`/visual/${collezioneId}?esito=errore&messaggio=${encodeURIComponent(m)}`);

  const c = await prisma.collezioneShopify.findUnique({ where: { id: collezioneId } });
  if (!c) errore("Collezione non trovata.");
  if (c!.tipo !== "manuale") {
    errore(
      "È una collezione automatica: chi ci sta dentro lo decide la regola di Shopify. Per togliere questo prodotto va cambiata la regola sul negozio.",
    );
  }

  const riga = await prisma.prodottoInCollezioneShopify.findFirst({
    where: { collezioneId, prodottoId },
    select: { id: true, prodottoShopifyId: true, prodotto: { select: { nome: true } } },
  });
  if (!riga) errore("Questo prodotto non risulta in questa collezione.");
  if (!riga!.prodottoShopifyId) {
    errore("Di questo prodotto non conosciamo l'id su Shopify: rilancia l'import delle collezioni e riprova.");
  }

  const negozio = await prisma.negozioShopify.findFirst({ where: { nome: c!.negozio }, select: { id: true } });
  const accesso = negozio ? await tokenDi(negozio.id) : null;
  if (!accesso) errore(`Il negozio «${c!.negozio}» non è collegato: serve un token con write_products in Impostazioni.`);

  const { corpo } = await graphqlNegozio(
    accesso!.dominio,
    accesso!.token,
    `mutation($id: ID!, $productIds: [ID!]!) {
       collectionRemoveProducts(id: $id, productIds: $productIds) {
         job { id done }
         userErrors { field message }
       }
     }`,
    { id: c!.shopifyId, productIds: [riga!.prodottoShopifyId] },
  );
  const err = [
    ...(corpo.errors ?? []).map((e) => e.message),
    ...((corpo.data?.collectionRemoveProducts?.userErrors as { message: string }[] | undefined) ?? []).map(
      (e) => e.message,
    ),
  ];
  if (err.length) errore(`Shopify ha rifiutato: ${err.join(" · ")}`);

  // Solo adesso si toglie la riga qui: se il negozio avesse detto no, l'app
  // avrebbe mostrato una collezione diversa da quella vera.
  await prisma.prodottoInCollezioneShopify.delete({ where: { id: riga!.id } });
  revalidatePath(`/visual/${collezioneId}`);
  redirect(
    `/visual/${collezioneId}?esito=ok&messaggio=${encodeURIComponent(
      `«${riga!.prodotto.nome}» tolto dalla collezione su Shopify. Il prodotto resta a catalogo e nelle altre collezioni.`,
    )}`,
  );
}

/**
 * Spinge su Shopify l'ordine curato qui, con `collectionReorderProducts`.
 *
 * Tre paletti, tutti dichiarati all'utente e mai aggirati:
 * - **solo collezioni manuali**: una smart collection si ordina da sola per
 *   regola, Shopify non accetta un ordine a mano;
 * - serve un **token con `write_products`** collegato al negozio della
 *   collezione;
 * - prima si mette il `sortOrder` a MANUAL, poi si riordina: altrimenti Shopify
 *   rifiuta le mosse.
 */
export async function spingiOrdineSuShopify(collezioneId: string) {
  const esito = await spingiOrdineSuShopifySilenzioso(collezioneId);
  if (esito !== true) {
    redirect(`/visual/${collezioneId}?esito=errore&messaggio=${encodeURIComponent(esito)}`);
  }
  revalidatePath(`/visual/${collezioneId}`);
  redirect(
    `/visual/${collezioneId}?esito=ok&messaggio=${encodeURIComponent(
      "Ordine inviato a Shopify. Il negozio lo applica in pochi istanti."
    )}`
  );
}

/**
 * Lo stesso invio, ma **senza redirect**: torna `true` se è andata, altrimenti il
 * messaggio dell'errore. Serve alla rotazione automatica, che gira da un cron e
 * non ha nessuna pagina dove mandare l'utente — e a chiunque debba sapere com'è
 * finita invece di essere sbalzato altrove.
 */
export async function spingiOrdineSuShopifySilenzioso(collezioneId: string): Promise<true | string> {
  const c = await prisma.collezioneShopify.findUnique({ where: { id: collezioneId } });
  if (!c) return "Collezione non trovata.";

  if (c.tipo !== "manuale") {
    return "È una collezione automatica: su Shopify l'ordine lo decide la regola, non si può imporre a mano.";
  }

  const negozio = await prisma.negozioShopify.findFirst({ where: { nome: c.negozio }, select: { id: true } });
  const accesso = negozio ? await tokenDi(negozio.id) : null;
  if (!accesso) {
    return `Il negozio «${c.negozio}» non è collegato: collega un token con write_products in Impostazioni.`;
  }

  // Si manda **solo la fila in scena**: mettere in ordine anche gli archiviati
  // vorrebbe dire decidere la posizione di prodotti che il cliente non vede, e
  // la fila spinta non corrisponderebbe a quella mostrata qui.
  const membri = await prisma.prodottoInCollezioneShopify.findMany({
    where: { collezioneId, prodottoShopifyId: { not: null }, prodotto: FILTRO_IN_SCENA },
    orderBy: { posizione: "asc" },
    select: { prodottoShopifyId: true },
  });
  if (membri.length === 0) {
    return "Nessun prodotto in vendita con un id Shopify: o sono tutti archiviati sul negozio, o va rilanciato l'import delle collezioni.";
  }

  // 1) sortOrder = MANUAL (se non lo è già): senza, il riordino viene rifiutato.
  if (c.ordinamento !== "MANUAL") {
    const { corpo } = await graphqlNegozio(
      accesso.dominio,
      accesso.token,
      `mutation($input: CollectionInput!) {
         collectionUpdate(input: $input) { collection { id sortOrder } userErrors { field message } }
       }`,
      { input: { id: c.shopifyId, sortOrder: "MANUAL" } }
    );
    const err = [
      ...(corpo.errors ?? []).map((e) => e.message),
      ...((corpo.data?.collectionUpdate?.userErrors as { message: string }[] | undefined) ?? []).map((e) => e.message),
    ];
    if (err.length) return `Shopify non ha messo l'ordine su «manuale»: ${err.join(" · ")}`;
  }

  // 2) le mosse, a blocchi: si riordina tutto verso la testa nell'ordine curato.
  const moves = membri.map((m, i) => ({ id: m.prodottoShopifyId as string, newPosition: String(i) }));
  for (let i = 0; i < moves.length; i += 200) {
    const { corpo } = await graphqlNegozio(
      accesso.dominio,
      accesso.token,
      `mutation($id: ID!, $moves: [MoveInput!]!) {
         collectionReorderProducts(id: $id, moves: $moves) {
           job { id done }
           userErrors { field message }
         }
       }`,
      { id: c.shopifyId, moves: moves.slice(i, i + 200) }
    );
    const err = [
      ...(corpo.errors ?? []).map((e) => e.message),
      ...((corpo.data?.collectionReorderProducts?.userErrors as { message: string }[] | undefined) ?? []).map(
        (e) => e.message
      ),
    ];
    if (err.length) return `Shopify ha rifiutato il riordino: ${err.join(" · ")}`;
  }

  await prisma.collezioneShopify.update({
    where: { id: collezioneId },
    data: { ordinamento: "MANUAL", ordineSpintoIl: new Date() },
  });
  return true;
}
