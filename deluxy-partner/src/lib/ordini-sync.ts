import { prisma } from "./db";
import { scaricaOrdini } from "./shopify";

// Nucleo dello scarico ordini Shopify, riutilizzabile dal bottone in pagina e
// dal cron notturno. Scarica gli ordini degli ultimi `giorni` da tutti i negozi
// collegati e li aggiorna (upsert). NON registra incassi né tocca fatture: la
// riconciliazione dei bonifici resta una conferma dell'operatore. Gli ordini a
// carta già pagati vengono marcati "incassato_gateway" (l'incasso è avvenuto
// lato gateway; il payout si riconcilia a blocco).
export async function eseguiSyncOrdini(
  giorni = 90
): Promise<{ nuovi: number; aggiornati: number; errori: string[] }> {
  const negozi = await prisma.negozioShopify.findMany({ where: { attivo: true } });
  const dal = new Date(Date.now() - giorni * 86400000);
  let nuovi = 0;
  let aggiornati = 0;
  const errori: string[] = [];

  for (const neg of negozi) {
    if (!neg.token) {
      errori.push(`${neg.brand}: token mancante`);
      continue;
    }
    let ordini;
    try {
      ordini = await scaricaOrdini(neg.dominio, neg.token, dal);
    } catch (e) {
      errori.push(`${neg.brand}: ${(e as Error).message}`);
      continue;
    }
    for (const o of ordini) {
      const paidCarta = o.categoriaPagamento === "carta" && (o.financialStatus ?? "").toUpperCase() === "PAID";
      const esistente = await prisma.ordineShopify.findUnique({
        where: { negozioId_orderId: { negozioId: neg.id, orderId: o.orderId } },
      });
      const datiBase = {
        brand: neg.brand,
        nome: o.nome,
        data: o.data,
        totale: o.totale,
        valuta: o.valuta,
        financialStatus: o.financialStatus,
        gateway: o.gateway,
        categoriaPagamento: o.categoriaPagamento,
        clienteNome: o.clienteNome,
        clienteEmail: o.clienteEmail,
        note: o.note,
      };
      if (!esistente) {
        await prisma.ordineShopify.create({
          data: {
            negozioId: neg.id,
            orderId: o.orderId,
            ...datiBase,
            statoRicon: paidCarta ? "incassato_gateway" : "da_riconciliare",
            riconciliatoIl: paidCarta ? new Date() : null,
          },
        });
        nuovi++;
      } else {
        const nuovoStato =
          esistente.statoRicon === "da_riconciliare" && paidCarta ? "incassato_gateway" : esistente.statoRicon;
        await prisma.ordineShopify.update({
          where: { id: esistente.id },
          data: { ...datiBase, statoRicon: nuovoStato },
        });
        aggiornati++;
      }
    }
    await prisma.negozioShopify.update({ where: { id: neg.id }, data: { ultimaSync: new Date() } });
  }
  return { nuovi, aggiornati, errori };
}
