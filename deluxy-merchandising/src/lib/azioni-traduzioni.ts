"use server";

// **«Traduci ora sui negozi».**
//
// ⭐ 11/09/2026, seconda segnalazione dell'utente sulle traduzioni (schermata
// di deluxyflowers.com/en): «questo è senza traduzioni». Era vero, e la
// risposta onesta era: l'app traduce quello che nasce dal suo modulo, per lo
// storico c'è solo il rastrello notturno — **e non c'era un modo di dire
// "questo, adesso"**. Ora c'è, ed è questo tasto.
//
// Due scelte, tutt'e due per lo stesso motivo (quello che conta è la pagina che
// vede il cliente, non quello che abbiamo in archivio):
//
// - il testo da tradurre **si rilegge dal negozio** (`descriptionHtml`), non da
//   `prodotto.descrizione`: sui prodotti importati il nostro campo è una
//   versione spezzata e ricomposta, e tradurre quella vorrebbe dire scrivere
//   sul sito una scheda diversa da quella italiana;
// - si traduce **l'HTML**, coi suoi `<h6>`, per la ragione misurata in
//   `traduzione-html.ts`: il tema costruisce una tab per ogni titolo.
//
// Le lingue sono solo quelle **davvero attive** sul negozio: una lingua spenta
// fa rifiutare a Shopify l'intero lotto, comprese le buone.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { traduciSchedaHtml } from "./ai-traduzioni";
import { prisma } from "./db";
import { tokenDi } from "./negozi";
import { graphqlNegozio } from "./shopify-scrittura";
import { registraTraduzioniProdotto } from "./shopify-traduzioni-scrittura";
import { lingueAttiveDi } from "./traduzioni-automatiche";

export async function traduciProdottoOra(id: string) {
  const p = await prisma.prodotto.findUnique({
    where: { id },
    select: {
      nome: true,
      shopifyId: true,
      negozioNome: true,
      pubblicazioni: { select: { negozio: true, shopifyId: true } },
    },
  });
  if (!p) redirect(`/prodotti/${id}?errore=` + encodeURIComponent("Prodotto non trovato."));

  // Dove sta davvero: le pubblicazioni, più il negozio principale se non
  // ha una riga sua (i prodotti vecchi, arrivati dall'import).
  const dove = new Map<string, string>();
  for (const r of p!.pubblicazioni) if (r.shopifyId) dove.set(r.negozio, r.shopifyId);
  if (p!.shopifyId && p!.negozioNome && !dove.has(p!.negozioNome)) dove.set(p!.negozioNome, p!.shopifyId);
  if (dove.size === 0) {
    redirect(`/prodotti/${id}?errore=` + encodeURIComponent("Questo prodotto non è su nessun negozio: non c'è niente da tradurre."));
  }

  const anagrafica = await prisma.negozioShopify.findMany({
    where: { nome: { in: [...dove.keys()] } },
    select: { id: true, nome: true },
  });
  const idPerNome = new Map(anagrafica.map((n) => [n.nome, n.id]));

  const righe: string[] = [];
  let scritteTot = 0;
  for (const [nome, shopifyId] of dove) {
    const negozioId = idPerNome.get(nome);
    const accesso = negozioId ? await tokenDi(negozioId).catch(() => null) : null;
    if (!accesso) { righe.push(`${nome}: non collegato`); continue; }
    const negozio = { nome, dominio: accesso.dominio, token: accesso.token };

    const attive = await lingueAttiveDi(negozio);
    if (attive.length === 0) { righe.push(`${nome}: nessuna lingua attiva`); continue; }

    const r = await graphqlNegozio(
      accesso.dominio,
      accesso.token,
      `query($id:ID!){ node(id:$id){ ... on Product { title descriptionHtml } } }`,
      { id: shopifyId },
    );
    const nodo = (r.corpo.data as unknown as { node?: { title: string; descriptionHtml: string } | null })?.node;
    if (!nodo?.title) { righe.push(`${nome}: il negozio non restituisce il prodotto`); continue; }

    const t = await traduciSchedaHtml({ titolo: nodo.title, html: nodo.descriptionHtml ?? "" }, attive);
    if (!t.ok) { righe.push(`${nome}: ${t.errore}`); continue; }
    const w = await registraTraduzioniProdotto({ dominio: accesso.dominio, token: accesso.token }, shopifyId, t.traduzioni);
    if (w.errori.length) righe.push(`${nome}: ${w.errori.join("; ")}`);
    else {
      scritteTot += w.scritte;
      righe.push(`${nome}: ${attive.join(", ")} · ${w.scritte} voci`);
    }
    if (t.avvisi?.length) righe.push(...t.avvisi.map((x) => `${nome}: ${x}`));
  }

  revalidatePath(`/prodotti/${id}`);
  const testo = scritteTot > 0 ? `Traduzioni scritte. ${righe.join(" · ")}` : `Nessuna traduzione scritta. ${righe.join(" · ")}`;
  redirect(`/prodotti/${id}?${scritteTot > 0 ? "esito" : "errore"}=` + encodeURIComponent(testo));
}
