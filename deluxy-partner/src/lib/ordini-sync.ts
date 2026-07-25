import { prisma } from "./db";
import { scaricaOrdini, tokenNegozio } from "./shopify";

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
    // token statico o coniato al volo dal Client ID/Secret (rinnovo automatico)
    let token: string;
    try {
      token = await tokenNegozio(neg);
    } catch (e) {
      errori.push(`${neg.brand}: ${(e as Error).message}`);
      continue;
    }
    let ordini;
    try {
      ordini = await scaricaOrdini(neg.dominio, token, dal);
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
  // Abbinamento automatico per numero d'ordine in causale (incassi + costi
  // fornitore): così scaricando gli ordini si riconcilia da sé quanto già
  // presente nei movimenti. Best-effort: un errore qui non fa fallire la sync.
  try {
    const { eseguiAbbinamentoPerNumero } = await import("./ordini-abbina");
    await eseguiAbbinamentoPerNumero();
  } catch (e) {
    console.warn("[ordini] abbinamento automatico per numero non riuscito:", (e as Error).message);
  }
  return { nuovi, aggiornati, errori };
}
