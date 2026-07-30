import { prisma } from "./db";
import { chiamataAdmin, tokenNegozio } from "./shopify";

// FARSI PAGARE QUALCOSA CHE NON È ANCORA UN ORDINE — «100 rose, 450 €».
//
// Si scrive cosa e quanto, Shopify prepara una **bozza d'ordine** e ne esce un
// link (`invoiceUrl`). Quando il cliente paga, **la bozza diventa un ordine
// vero**: entra nel negozio, la sync lo porta qui e da lì in poi è un ordine
// come tutti gli altri.
//
// Perché la bozza e non un ordine creato subito: un ordine creato prima del
// pagamento comparirebbe **ovunque** — nella bacheca, in consegna, al Customer
// Service — anche se il cliente non paga mai. Una bozza non è un ordine finché
// non è pagata, ed è esattamente quello che vuol dire un preventivo.
//
// ⚠️ SERVE IL PERMESSO `write_draft_orders` sul token del negozio. Al 30/07/2026
// i tre negozi hanno `read_orders`/`write_orders`/`write_customers` ma NON
// quello: si aggiunge nell'app della Dev Dashboard, poi il token si riconia da
// sé al primo uso (client credentials grant). Senza, Shopify risponde
// ACCESS_DENIED e qui si traduce in una frase che dice cosa fare.

const MUTAZIONE_CREA = `
  mutation CreaBozza($input: DraftOrderInput!) {
    draftOrderCreate(input: $input) {
      draftOrder {
        id
        name
        invoiceUrl
        status
        totalPriceSet { shopMoney { amount currencyCode } }
      }
      userErrors { field message }
    }
  }
`;

const QUERY_STATO = `
  query StatoBozza($id: ID!) {
    draftOrder(id: $id) {
      id
      name
      status
      invoiceUrl
      totalPriceSet { shopMoney { amount currencyCode } }
      order { id name processedAt }
    }
  }
`;

const MUTAZIONE_ELIMINA = `
  mutation EliminaBozza($input: DraftOrderDeleteInput!) {
    draftOrderDelete(input: $input) {
      deletedId
      userErrors { field message }
    }
  }
`;

export type Riga = { descrizione: string; quantita: number; prezzo: number };

export type DatiLink = {
  brand: string;
  righe: Riga[];
  clienteNome?: string | null;
  clienteEmail?: string | null;
  clienteTelefono?: string | null;
  note?: string | null;
};

export type EsitoCreazione =
  | { ok: true; id: string; nome: string; url: string; totale: number; valuta: string }
  | { ok: false; motivo: string };

// Il messaggio di Shopify tradotto in una cosa che si può fare. «ACCESS_DENIED»
// da solo manderebbe a cercare un guasto che non c'è: il guasto è un permesso.
function spiegaErrore(messaggio: string): string {
  if (/access denied|not approved|required access|write_draft_orders/i.test(messaggio)) {
    return (
      "Il negozio non concede ancora il permesso «write_draft_orders», che serve per creare la bozza da cui nasce il " +
      "link. Si aggiunge una volta sola nell'app della Dev Dashboard di quel negozio; il token si rifà da sé subito dopo. " +
      `(Shopify ha risposto: ${messaggio.slice(0, 160)})`
    );
  }
  return messaggio;
}

export async function creaLinkIncasso(dati: DatiLink): Promise<EsitoCreazione> {
  const righe = dati.righe.filter((r) => r.descrizione.trim() && r.quantita > 0);
  if (righe.length === 0) return { ok: false, motivo: "Serve almeno una riga con una descrizione e una quantità." };
  if (righe.some((r) => !Number.isFinite(r.prezzo) || r.prezzo < 0)) {
    return { ok: false, motivo: "Il prezzo di ogni riga dev'essere un numero (anche 0, se è un omaggio)." };
  }

  const negozio = await prisma.negozioShopify.findFirst({ where: { brand: dati.brand, attivo: true } });
  if (!negozio) return { ok: false, motivo: `Negozio «${dati.brand}» non collegato.` };

  const input: Record<string, unknown> = {
    lineItems: righe.map((r) => ({
      title: r.descrizione.trim(),
      originalUnitPrice: r.prezzo.toFixed(2),
      quantity: Math.round(r.quantita),
    })),
    // Il tag serve a riconoscerli dopo, dentro Shopify: da dove è nato questo
    // ordine se un giorno qualcuno lo guarda da là.
    tags: ["deluxy-orders", "link-di-pagamento"],
  };
  if (dati.clienteEmail?.trim()) input.email = dati.clienteEmail.trim();
  if (dati.clienteTelefono?.trim()) input.phone = dati.clienteTelefono.trim();
  if (dati.note?.trim()) input.note = dati.note.trim();

  try {
    const token = await tokenNegozio(negozio);
    const risposta = (await chiamataAdmin(negozio.dominio, token, MUTAZIONE_CREA, { input })) as {
      draftOrderCreate?: {
        draftOrder?: {
          id: string;
          name: string;
          invoiceUrl: string | null;
          totalPriceSet?: { shopMoney?: { amount?: string; currencyCode?: string } };
        } | null;
        userErrors?: { field: string[] | null; message: string }[];
      };
    };

    const errori = risposta.draftOrderCreate?.userErrors ?? [];
    if (errori.length > 0) return { ok: false, motivo: spiegaErrore(errori.map((e) => e.message).join(" · ")) };

    const bozza = risposta.draftOrderCreate?.draftOrder;
    if (!bozza?.invoiceUrl) {
      return { ok: false, motivo: "Shopify ha creato la bozza ma non ha dato un link di pagamento." };
    }

    const totale = Number(bozza.totalPriceSet?.shopMoney?.amount ?? "0") || 0;
    const valuta = bozza.totalPriceSet?.shopMoney?.currencyCode ?? "EUR";
    const descrizione = righe.map((r) => `${r.quantita}× ${r.descrizione.trim()}`).join(" · ");

    await prisma.linkIncasso.create({
      data: {
        brand: dati.brand,
        draftOrderId: bozza.id,
        nome: bozza.name,
        descrizione,
        totale,
        valuta,
        clienteNome: dati.clienteNome?.trim() || null,
        clienteEmail: dati.clienteEmail?.trim() || null,
        clienteTelefono: dati.clienteTelefono?.trim() || null,
        note: dati.note?.trim() || null,
      },
    });

    return { ok: true, id: bozza.id, nome: bozza.name, url: bozza.invoiceUrl, totale, valuta };
  } catch (e) {
    return { ok: false, motivo: spiegaErrore((e as Error).message) };
  }
}

export type EsitoStato =
  | { ok: true; stato: string; url: string | null; ordineNumero: string | null; totale: number }
  | { ok: false; motivo: string };

// Com'è finita: la bozza è ancora aperta, oppure è stata pagata ed è diventata un
// ordine. La verità sta su Shopify, qui si aggiorna solo lo specchio.
export async function statoLink(linkId: string): Promise<EsitoStato> {
  const link = await prisma.linkIncasso.findUnique({ where: { id: linkId } });
  if (!link) return { ok: false, motivo: "Link non trovato." };
  const negozio = await prisma.negozioShopify.findFirst({ where: { brand: link.brand } });
  if (!negozio) return { ok: false, motivo: `Negozio «${link.brand}» non collegato.` };

  try {
    const token = await tokenNegozio(negozio);
    const risposta = (await chiamataAdmin(negozio.dominio, token, QUERY_STATO, { id: link.draftOrderId })) as {
      draftOrder?: {
        status?: string;
        invoiceUrl?: string | null;
        totalPriceSet?: { shopMoney?: { amount?: string } };
        order?: { name?: string; processedAt?: string } | null;
      } | null;
    };
    const b = risposta.draftOrder;
    if (!b) {
      // La bozza non c'è più: o è stata eliminata in Shopify, o è diventata un
      // ordine e qualcuno l'ha ripulita. Non si indovina: si scrive.
      await prisma.linkIncasso.update({ where: { id: linkId }, data: { stato: "annullato" } });
      return { ok: false, motivo: "Su Shopify questa bozza non esiste più: segnata come annullata." };
    }

    const pagato = Boolean(b.order?.name) || b.status === "COMPLETED";
    const totale = Number(b.totalPriceSet?.shopMoney?.amount ?? link.totale) || link.totale;
    await prisma.linkIncasso.update({
      where: { id: linkId },
      data: {
        stato: pagato ? "pagato" : "aperto",
        totale,
        ordineNumero: b.order?.name ?? null,
        pagatoIl: b.order?.processedAt ? new Date(b.order.processedAt) : null,
      },
    });
    return { ok: true, stato: pagato ? "pagato" : "aperto", url: b.invoiceUrl ?? null, ordineNumero: b.order?.name ?? null, totale };
  } catch (e) {
    return { ok: false, motivo: spiegaErrore((e as Error).message) };
  }
}

export async function annullaLinkIncasso(linkId: string): Promise<{ ok: boolean; motivo?: string }> {
  const link = await prisma.linkIncasso.findUnique({ where: { id: linkId } });
  if (!link) return { ok: false, motivo: "Link non trovato." };
  if (link.stato === "pagato") return { ok: false, motivo: "È già stato pagato: non si annulla un incasso avvenuto." };
  const negozio = await prisma.negozioShopify.findFirst({ where: { brand: link.brand } });
  if (!negozio) return { ok: false, motivo: `Negozio «${link.brand}» non collegato.` };

  try {
    const token = await tokenNegozio(negozio);
    const risposta = (await chiamataAdmin(negozio.dominio, token, MUTAZIONE_ELIMINA, {
      input: { id: link.draftOrderId },
    })) as { draftOrderDelete?: { userErrors?: { message: string }[] } };
    const errori = risposta.draftOrderDelete?.userErrors ?? [];
    if (errori.length > 0) return { ok: false, motivo: spiegaErrore(errori.map((e) => e.message).join(" · ")) };
    await prisma.linkIncasso.update({ where: { id: linkId }, data: { stato: "annullato" } });
    return { ok: true };
  } catch (e) {
    return { ok: false, motivo: spiegaErrore((e as Error).message) };
  }
}

// Quali negozi possono già creare un link: si chiede a Shopify l'elenco dei
// permessi del token, invece di provare a creare una bozza per scoprirlo con un
// errore. `null` = non si è riusciti a chiedere (token o rete).
export async function negoziPronti(): Promise<{ brand: string; pronto: boolean | null; permessi: string[] }[]> {
  const negozi = await prisma.negozioShopify.findMany({ where: { attivo: true }, orderBy: { brand: "asc" } });
  return Promise.all(
    negozi.map(async (n) => {
      try {
        const token = await tokenNegozio(n);
        const res = await fetch(`https://${n.dominio}/admin/oauth/access_scopes.json`, {
          headers: { "X-Shopify-Access-Token": token },
          cache: "no-store",
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) return { brand: n.brand, pronto: null, permessi: [] };
        const j = (await res.json()) as { access_scopes?: { handle: string }[] };
        const permessi = (j.access_scopes ?? []).map((s) => s.handle);
        return { brand: n.brand, pronto: permessi.includes("write_draft_orders"), permessi };
      } catch {
        return { brand: n.brand, pronto: null, permessi: [] };
      }
    }),
  );
}
