import { prisma } from "./db";
import { chiamataAdmin, tokenNegozio } from "./shopify";

// IL LINK PER FAR PAGARE UN ORDINE.
//
// Shopify ce l'ha già e non lo diceva a nessuno: per un ordine non ancora
// saldato l'Admin API restituisce `paymentCollectionDetails.
// additionalPaymentCollectionUrl`, cioè la pagina su cui **quel** cliente paga
// **quell'ordine** con carta. È esattamente ciò che serve per i bonifici che non
// arrivano mai: si manda il link e l'ordine si chiude da sé.
//
// ⚠️ PERCHÉ NON SI CREA UN ORDINE BOZZA. L'altro modo di fare un link di
// pagamento su Shopify è la bozza d'ordine (`draftOrderCreate` → `invoiceUrl`),
// ma quando il cliente paga **nasce un ORDINE NUOVO**: nel registro ci sarebbero
// due ordini per una vendita sola, il vecchio resterebbe non pagato per sempre e
// il venduto risulterebbe doppio. Il link dell'ordine esistente paga l'ordine
// esistente, che diventa PAID alla sync successiva. (Serve anche lo scope
// `write_draft_orders`, che i token dei tre negozi oggi non hanno: hanno
// read_orders/write_orders.)
//
// ⚠️ IL LINK CONTIENE UN SEGRETO (`?secret=…`): è una chiave d'accesso a un
// pagamento. Per questo NON si salva nel database e non si scrive nei log: si
// chiede a Shopify quando serve, si copia e si manda. Se un ordine cambia stato,
// il link chiesto ieri può non valere più — un link vecchio salvato sarebbe una
// bugia con dentro un segreto.

const QUERY = `
  query LinkPagamento($id: ID!) {
    order(id: $id) {
      id
      name
      displayFinancialStatus
      cancelledAt
      totalOutstandingSet { shopMoney { amount currencyCode } }
      paymentCollectionDetails { additionalPaymentCollectionUrl }
    }
  }
`;

export type EsitoLink =
  | { ok: true; url: string; daPagare: number | null; stato: string | null }
  | { ok: false; motivo: string };

type Risposta = {
  order?: {
    displayFinancialStatus?: string | null;
    cancelledAt?: string | null;
    totalOutstandingSet?: { shopMoney?: { amount?: string } } | null;
    paymentCollectionDetails?: { additionalPaymentCollectionUrl?: string | null } | null;
  } | null;
};

// Il link di pagamento di un ordine, chiesto a Shopify sul momento.
export async function linkPagamento(ordineId: string): Promise<EsitoLink> {
  const ordine = await prisma.ordine.findUnique({
    where: { id: ordineId },
    select: { orderId: true, numero: true, annullatoIl: true, negozio: true },
  });
  if (!ordine) return { ok: false, motivo: "Ordine non trovato." };
  if (ordine.annullatoIl) return { ok: false, motivo: "L'ordine è annullato: non si fa pagare un ordine annullato." };
  if (!ordine.negozio) return { ok: false, motivo: "Negozio non collegato." };

  try {
    const token = await tokenNegozio(ordine.negozio);
    const dati = (await chiamataAdmin(ordine.negozio.dominio, token, QUERY, { id: ordine.orderId })) as Risposta;
    const o = dati.order;
    if (!o) return { ok: false, motivo: "Shopify non trova più quest'ordine." };
    if (o.cancelledAt) return { ok: false, motivo: "Su Shopify l'ordine risulta annullato." };

    const url = o.paymentCollectionDetails?.additionalPaymentCollectionUrl ?? null;
    if (!url) {
      // Nessun link non vuol dire «errore»: vuol dire che non c'è niente da
      // incassare, ed è la risposta giusta da mostrare.
      return {
        ok: false,
        motivo:
          o.displayFinancialStatus === "PAID"
            ? "Shopify dice che quest'ordine è già pagato: non c'è niente da incassare."
            : `Shopify non offre un link di pagamento per quest'ordine (stato ${o.displayFinancialStatus ?? "sconosciuto"}).`,
      };
    }
    const importo = Number(o.totalOutstandingSet?.shopMoney?.amount ?? "");
    return {
      ok: true,
      url,
      daPagare: Number.isFinite(importo) ? importo : null,
      stato: o.displayFinancialStatus ?? null,
    };
  } catch (e) {
    return { ok: false, motivo: (e as Error).message };
  }
}
