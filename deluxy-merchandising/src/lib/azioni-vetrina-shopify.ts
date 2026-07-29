"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { tokenDi, VERSIONE_API } from "./negozi";
import { numeraPosizioni, ordineSecondoRegola, type RegolaOrdinamento, isRegola } from "./ordinamento-vetrina";

/** Applica una regola: propone l'ordine e lo scrive come punto di partenza. */
export async function applicaRegolaOrdinamento(collezioneId: string, fd: FormData) {
  const regola = fd.get("regola");
  if (!isRegola(regola)) return;
  if (regola !== "manuale") {
    const ordine = await ordineSecondoRegola(collezioneId, regola);
    await numeraPosizioni(collezioneId, ordine);
  }
  await prisma.collezioneShopify.update({
    where: { id: collezioneId },
    data: { regolaOrdinamento: regola, ordineModificatoIl: new Date() },
  });
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
  const membri = await prisma.prodottoInCollezioneShopify.findMany({
    where: { collezioneId },
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

async function graphqlNegozio(dominio: string, token: string, query: string, variables: Record<string, unknown>) {
  const res = await fetch(`https://${dominio}/admin/api/${VERSIONE_API}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(30000),
    cache: "no-store",
  });
  const corpo = (await res.json().catch(() => ({}))) as {
    data?: Record<string, { userErrors?: { message: string }[] } & Record<string, unknown>>;
    errors?: { message: string }[];
  };
  return { status: res.status, corpo };
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
  const c = await prisma.collezioneShopify.findUnique({ where: { id: collezioneId } });
  if (!c) redirect("/visual?esito=errore&messaggio=" + encodeURIComponent("Collezione non trovata."));
  const errore = (m: string) =>
    redirect(`/visual/${collezioneId}?esito=errore&messaggio=${encodeURIComponent(m)}`);

  if (c.tipo !== "manuale") {
    return errore(
      "È una collezione automatica: su Shopify l'ordine lo decide la regola, non si può imporre a mano."
    );
  }

  const negozio = await prisma.negozioShopify.findFirst({ where: { nome: c.negozio }, select: { id: true } });
  const accesso = negozio ? await tokenDi(negozio.id) : null;
  if (!accesso) {
    return errore(`Il negozio «${c.negozio}» non è collegato: collega un token con write_products in Impostazioni.`);
  }

  const membri = await prisma.prodottoInCollezioneShopify.findMany({
    where: { collezioneId, prodottoShopifyId: { not: null } },
    orderBy: { posizione: "asc" },
    select: { prodottoShopifyId: true },
  });
  if (membri.length === 0) {
    return errore("Nessun prodotto con un id Shopify: rilancia l'import delle collezioni e riprova.");
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
    if (err.length) return errore(`Shopify non ha messo l'ordine su «manuale»: ${err.join(" · ")}`);
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
    if (err.length) return errore(`Shopify ha rifiutato il riordino: ${err.join(" · ")}`);
  }

  await prisma.collezioneShopify.update({
    where: { id: collezioneId },
    data: { ordinamento: "MANUAL", ordineSpintoIl: new Date() },
  });
  revalidatePath(`/visual/${collezioneId}`);
  redirect(
    `/visual/${collezioneId}?esito=ok&messaggio=${encodeURIComponent(
      `Ordine inviato a Shopify per «${c.titolo}» (${moves.length} prodotti). Shopify lo applica in pochi istanti.`
    )}`
  );
}
