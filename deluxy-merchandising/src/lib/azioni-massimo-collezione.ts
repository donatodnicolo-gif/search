"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { tokenDi } from "./negozi";
import { FILTRO_IN_SCENA } from "./ordinamento-vetrina";
import { erroriDi, graphqlNegozio } from "./shopify-scrittura";

// **Quanti prodotti al massimo può avere una vetrina, e come si tolgono quelli
// di troppo.**
//
// Il massimo fa due cose diverse, di proposito tenute separate:
// - da solo **ferma le aggiunte automatiche** (in `aggiunta-da-regola.ts`), che
//   è un effetto silenzioso e innocuo: non entra più nessuno;
// - **togliere** quelli già dentro è invece un gesto che si preme, con la
//   conferma davanti e il numero scritto sul bottone. Non lo fa mai il cron
//   delle rotazioni: un automatismo che di notte toglie prodotti dal sito vero è
//   la cosa che in quest'app non si fa (stessa ragione per cui l'invio
//   dell'ordine a Shopify è spento di default nelle rotazioni).

/** Il massimo di prodotti della collezione. Vuoto = nessun tetto. */
export async function salvaMassimoProdotti(id: string, fd: FormData) {
  const grezzo = String(fd.get("massimoProdotti") ?? "").trim();
  let massimo: number | null = null;
  if (grezzo !== "") {
    const n = parseInt(grezzo, 10);
    if (!Number.isFinite(n) || n < 1) {
      redirect(
        `/visual/${id}?esito=errore&messaggio=${encodeURIComponent(
          "Il massimo dev'essere un numero maggiore di zero. Per togliere il tetto, lascia il campo vuoto.",
        )}`,
      );
    }
    massimo = n;
  }

  await prisma.collezioneShopify.update({ where: { id }, data: { massimoProdotti: massimo } });

  const inScena = await prisma.prodottoInCollezioneShopify.count({
    where: { collezioneId: id, prodotto: FILTRO_IN_SCENA },
  });

  revalidatePath(`/visual/${id}`);
  revalidatePath("/visual");
  const messaggio =
    massimo == null
      ? "Tetto tolto: la vetrina può avere tutti i prodotti che le condizioni portano."
      : inScena > massimo
        ? `Massimo impostato a ${massimo}. La vetrina ne ha ${inScena}: non ne entrano altri, e i ${inScena - massimo} di troppo restano finché non li togli tu.`
        : `Massimo impostato a ${massimo}. Adesso la vetrina ne ha ${inScena}: ci stanno ancora ${massimo - inScena} posti.`;
  redirect(`/visual/${id}?esito=ok&messaggio=${encodeURIComponent(messaggio)}`);
}

/**
 * Toglie dalla collezione i prodotti oltre il massimo — **sul negozio vero e
 * qui** — tenendo i primi secondo l'ordine curato.
 *
 * Due paletti, dichiarati in pagina:
 * - si guarda **la fila come si vede oggi**: chi esce sono gli ultimi, cioè
 *   quelli che la priorità della regola ha già messo in coda. Non si ricalcola
 *   un ordine diverso al momento del taglio, altrimenti uscirebbero prodotti
 *   diversi da quelli che si erano appena letti a schermo;
 * - **gli archiviati non contano e non si toccano**: non sono in vetrina.
 *
 * ⚠️ Un terzo paletto era stato scritto e poi tolto: risparmiare i prodotti
 * segnati «manuale», per non disfare con un'automazione la scelta di una
 * persona. Ma `origine` vale `"manuale"` **anche per tutto quello che è arrivato
 * dall'import di Shopify** — cioè, oggi, per la totalità delle appartenenze: il
 * taglio non avrebbe mai tolto niente e il bottone non sarebbe mai comparso. Una
 * funzione che sembra esserci e non fa niente è peggio che non averla. Quanti ne
 * escono per origine è scritto nella conferma, dove serve.
 *
 * Prima Shopify e poi il database: se il negozio rifiuta, qui non resta il buco
 * di un prodotto che sul sito c'è ancora.
 */
export async function potaCollezione(id: string) {
  const c = await prisma.collezioneShopify.findUnique({
    where: { id },
    select: {
      shopifyId: true,
      negozio: true,
      massimoProdotti: true,
      prodotti: {
        where: { prodotto: FILTRO_IN_SCENA },
        orderBy: { posizione: "asc" },
        select: { id: true, origine: true, prodottoShopifyId: true, prodotto: { select: { nome: true } } },
      },
    },
  });
  if (!c) redirect("/visual");
  if (c.massimoProdotti == null) {
    redirect(
      `/visual/${id}?esito=errore&messaggio=${encodeURIComponent(
        "Questa vetrina non ha un massimo: non c'è niente da togliere.",
      )}`,
    );
  }

  const daTogliere = c.prodotti.slice(c.massimoProdotti).filter((vp) => vp.prodottoShopifyId);
  if (daTogliere.length === 0) {
    redirect(
      `/visual/${id}?esito=ok&messaggio=${encodeURIComponent(
        "Niente da togliere: o la vetrina sta dentro il massimo, o ai prodotti di troppo manca il riferimento sul negozio (rilancia l'import delle collezioni).",
      )}`,
    );
  }

  const negozio = await prisma.negozioShopify.findFirst({
    where: { nome: c.negozio },
    select: { id: true, permessi: true },
  });
  const accesso =
    negozio && (negozio.permessi ?? "").includes("write_products") ? await tokenDi(negozio.id) : null;
  if (!accesso) {
    redirect(
      `/visual/${id}?esito=errore&messaggio=${encodeURIComponent(
        `Il negozio «${c.negozio}» non è collegato con un token che può scrivere sui prodotti: nessuno è stato tolto.`,
      )}`,
    );
  }

  // **A blocchi di 250, che è quanti ne accetta Shopify per chiamata.** Lo stesso
  // limite che l'aggiunta rispettava già (`MAX_PER_GIRO`) e che qui mancava: con
  // 597 prodotti in una sola mutation il negozio rifiuta tutto, e il taglio non
  // partiva mai proprio sulle collezioni grandi, cioè le uniche per cui un tetto
  // serve davvero.
  //
  // Ogni blocco si cancella **subito dopo** che il negozio l'ha accettato, non
  // tutti insieme alla fine: se il terzo blocco fallisce, i primi due sono usciti
  // sul sito e devono risultare usciti anche qui. Rimandare la cancellazione
  // lascerebbe l'app a dire che ci sono prodotti che sul sito non ci sono più.
  const PER_CHIAMATA = 250;
  let tolti = 0;
  for (let i = 0; i < daTogliere.length; i += PER_CHIAMATA) {
    const blocco = daTogliere.slice(i, i + PER_CHIAMATA);
    const r = await graphqlNegozio(
      accesso.dominio,
      accesso.token,
      `mutation($id: ID!, $productIds: [ID!]!) {
         collectionRemoveProducts(id: $id, productIds: $productIds) {
           job { id }
           userErrors { field message }
         }
       }`,
      { id: c.shopifyId, productIds: blocco.map((vp) => vp.prodottoShopifyId as string) },
    );
    const errori = erroriDi(r, "collectionRemoveProducts");
    if (errori.length) {
      redirect(
        `/visual/${id}?esito=errore&messaggio=${encodeURIComponent(
          tolti === 0
            ? `Shopify ha rifiutato: ${errori.join(" · ")}. Nessun prodotto è stato tolto.`
            : `Shopify ha rifiutato dopo i primi ${tolti}: ${errori.join(" · ")}. Quei ${tolti} sono usciti davvero; premi di nuovo per gli altri.`,
        )}`,
      );
    }
    await prisma.prodottoInCollezioneShopify.deleteMany({
      where: { id: { in: blocco.map((vp) => vp.id) } },
    });
    tolti += blocco.length;
  }

  revalidatePath(`/visual/${id}`);
  revalidatePath("/visual");
  redirect(
    `/visual/${id}?esito=ok&messaggio=${encodeURIComponent(
      `${tolti} prodotti tolti dalla collezione, qui e sul sito. Shopify li rimuove con un lavoro in coda: se li vedi ancora online, ricarica fra qualche secondo.`,
    )}`,
  );
}
