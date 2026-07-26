import { prisma } from "./db";
import { scaricaOrdiniDaRegistro } from "./ordini-registro";
import { gestioneIniziale } from "./ordini";

// Nucleo dello scarico ordini, riutilizzabile dal bottone in pagina e dal cron
// notturno. Dal 26/07/2026 la sorgente è il REGISTRO CENTRALIZZATO Deluxy Orders
// (deluxy-orders.vercel.app) via API a chiave, NON più l'API Shopify diretta.
// Scarica gli ordini degli ultimi `giorni` (o tutto lo storico se giorni molto
// grande) e li aggiorna (upsert per brand+orderId, così gli ordini esistenti si
// aggiornano senza duplicarsi). NON registra incassi né tocca fatture: la
// riconciliazione resta una conferma dell'operatore. Gli ordini a carta già
// pagati vengono marcati "incassato_gateway".
export async function eseguiSyncOrdini(
  giorni = 90
): Promise<{ nuovi: number; aggiornati: number; errori: string[] }> {
  let nuovi = 0;
  let aggiornati = 0;
  const errori: string[] = [];

  // "giorni" molto grande (es. cron con storico) → scarica tutto
  const dal = giorni >= 3650 ? null : new Date(Date.now() - giorni * 86400000);

  let ordini;
  try {
    ordini = await scaricaOrdiniDaRegistro(dal);
  } catch (e) {
    return { nuovi, aggiornati, errori: [`Deluxy Orders: ${(e as Error).message}`] };
  }

  // Mappa brand → negozio (crea il negozio se un brand nuovo compare nel registro).
  const negozi = await prisma.negozioShopify.findMany();
  const perBrand = new Map(negozi.map((n) => [n.brand, n]));
  const brandToccati = new Set<string>();

  // Precarica in blocco gli ordini già presenti (chiave negozioId:orderId) per
  // evitare una query di lookup per ogni ordine del registro.
  const gid = ordini.map((o) => o.orderId);
  const gia = await prisma.ordineShopify.findMany({
    where: { orderId: { in: gid } },
    select: { id: true, negozioId: true, orderId: true, statoRicon: true },
  });
  const esistenti = new Map(gia.map((e) => [`${e.negozioId}:${e.orderId}`, e]));

  for (const o of ordini) {
    let neg = perBrand.get(o.brand);
    if (!neg) {
      neg = await prisma.negozioShopify.create({ data: { brand: o.brand, dominio: "", token: "", attivo: true } });
      perBrand.set(o.brand, neg);
    }
    brandToccati.add(neg.brand);

    const paidCarta = o.categoriaPagamento === "carta" && (o.financialStatus ?? "").toUpperCase() === "PAID";
    const esistente = esistenti.get(`${neg.id}:${o.orderId}`);
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
          // Solo alla creazione: gli ordini deluxy.it nascono «ordine partner».
          // In update NON si tocca, altrimenti ogni sync cancellerebbe la
          // classificazione decisa a mano dall'operatore.
          gestione: gestioneIniziale(neg.brand),
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
  // aggiorna l'ora dell'ultima sync sui negozi che hanno ricevuto ordini
  await prisma.negozioShopify.updateMany({
    where: { brand: { in: [...brandToccati] } },
    data: { ultimaSync: new Date() },
  });
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
