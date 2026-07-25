import { prisma } from "./db";
import { scaricaOrdini, tokenNegozio, type OrdineNormalizzato } from "./shopify";
import { statoPredefinito } from "./stati";

// Nucleo dello scarico ordini Shopify, riutilizzabile dal bottone in pagina, dal
// cron e dagli script CLI. Scarica gli ordini da tutti i negozi collegati e li
// aggiorna (upsert), importando anche le righe d'ordine.
//
// `giorni`: quanti giorni indietro guardare. **null = tutto lo storico**
// (import iniziale completo). Gli ordini si salvano pagina per pagina, così
// anche un negozio da decine di migliaia di ordini non satura la memoria.
//
// La classificazione Deluxy NON viene sovrascritta dagli aggiornamenti:
//  - lo stato resta quello impostato (i nuovi ordini partono dallo stato
//    predefinito della pipeline);
//  - la categoria di pagamento si aggiorna dalla deduzione solo se non è stata
//    corretta a mano (categoriaPagamentoManuale = false);
//  - etichette, assegnazione, note interne e dimensioni libere non si toccano.
export async function eseguiSyncOrdini(
  giorni: number | null = 90,
  onProgresso?: (info: { brand: string; pagina: number; nuovi: number; aggiornati: number }) => void,
): Promise<{ nuovi: number; aggiornati: number; errori: string[] }> {
  const negozi = await prisma.negozioShopify.findMany({ where: { attivo: true } });
  const dal = giorni == null ? null : new Date(Date.now() - giorni * 86400000);
  const iniziale = await statoPredefinito();
  let nuovi = 0;
  let aggiornati = 0;
  const errori: string[] = [];

  for (const neg of negozi) {
    let token: string;
    try {
      token = await tokenNegozio(neg);
    } catch (e) {
      errori.push(`${neg.brand}: ${(e as Error).message}`);
      continue;
    }

    // Salva una pagina di ordini appena arriva da Shopify.
    const salvaPagina = async (ordini: OrdineNormalizzato[], pagina: number) => {
      const esito = await salvaBloccoOrdini(neg.id, neg.brand, ordini, iniziale?.id ?? null);
      nuovi += esito.nuovi;
      aggiornati += esito.aggiornati;
      onProgresso?.({ brand: neg.brand, pagina, nuovi, aggiornati });
    };

    try {
      await scaricaOrdini(neg.dominio, token, dal, 5000, salvaPagina);
    } catch (e) {
      errori.push(`${neg.brand}: ${(e as Error).message}`);
      continue;
    }
    await prisma.negozioShopify.update({ where: { id: neg.id }, data: { ultimaSync: new Date() } });
  }
  return { nuovi, aggiornati, errori };
}

// Campi Shopify di un ordine (sempre aggiornati: sono informativi).
function datiShopify(brand: string, o: OrdineNormalizzato) {
  return {
    brand,
    numero: o.numero,
    data: o.data,
    totale: o.totale,
    valuta: o.valuta,
    financialStatus: o.financialStatus,
    fulfillmentStatus: o.fulfillmentStatus,
    gateway: o.gateway,
    clienteNome: o.clienteNome,
    clienteEmail: o.clienteEmail,
    clienteTelefono: o.clienteTelefono,
    spedizioneNome: o.spedizioneNome,
    indirizzo: o.indirizzo,
    citta: o.citta,
    cap: o.cap,
    provincia: o.provincia,
    paese: o.paese,
    noteShopify: o.noteShopify,
    tagShopify: o.tagShopify,
  };
}

// Salva un blocco di ordini (una pagina Shopify) in poche query invece di una
// manciata per ordine: su un import storico da decine di migliaia di ordini la
// differenza è fra ore e minuti.
//  - una query per sapere quali esistono già;
//  - createMany per i nuovi ordini, poi createMany di righe ed eventi;
//  - solo i già esistenti si aggiornano uno per uno (nella sync quotidiana sono pochi).
async function salvaBloccoOrdini(
  negozioId: string,
  brand: string,
  ordini: OrdineNormalizzato[],
  statoIniziale: string | null,
): Promise<{ nuovi: number; aggiornati: number }> {
  if (ordini.length === 0) return { nuovi: 0, aggiornati: 0 };

  const esistenti = await prisma.ordine.findMany({
    where: { negozioId, orderId: { in: ordini.map((o) => o.orderId) } },
    select: { id: true, orderId: true, categoriaPagamentoManuale: true, _count: { select: { righe: true } } },
  });
  const giaPresenti = new Map(esistenti.map((e) => [e.orderId, e]));
  const nuovi = ordini.filter((o) => !giaPresenti.has(o.orderId));
  const daAggiornare = ordini.filter((o) => giaPresenti.has(o.orderId));

  // ---- nuovi ordini, a blocchi ----
  if (nuovi.length) {
    await prisma.ordine.createMany({
      data: nuovi.map((o) => ({
        negozioId,
        orderId: o.orderId,
        ...datiShopify(brand, o),
        categoriaPagamento: o.categoriaPagamento,
        statoId: statoIniziale,
      })),
      skipDuplicates: true,
    });
    // rileggo gli id appena creati per agganciare righe ed eventi
    const creati = await prisma.ordine.findMany({
      where: { negozioId, orderId: { in: nuovi.map((o) => o.orderId) } },
      select: { id: true, orderId: true },
    });
    const idPerOrderId = new Map(creati.map((c) => [c.orderId, c.id]));

    const righe: { ordineId: string; titolo: string; variante: string | null; sku: string | null; quantita: number; prezzo: number }[] = [];
    const eventi: { ordineId: string; tipo: string; descrizione: string; autore: string }[] = [];
    for (const o of nuovi) {
      const id = idPerOrderId.get(o.orderId);
      if (!id) continue;
      for (const r of o.righe) {
        righe.push({ ordineId: id, titolo: r.titolo, variante: r.variante, sku: r.sku, quantita: r.quantita, prezzo: r.prezzo });
      }
      eventi.push({
        ordineId: id,
        tipo: "sync",
        descrizione: `Importato da Shopify (${brand}) ${o.numero}`,
        autore: "sync",
      });
    }
    if (righe.length) await prisma.rigaOrdine.createMany({ data: righe });
    if (eventi.length) await prisma.eventoOrdine.createMany({ data: eventi });
  }

  // ---- ordini già presenti: aggiornamento mirato ----
  for (const o of daAggiornare) {
    const e = giaPresenti.get(o.orderId)!;
    await prisma.ordine.update({
      where: { id: e.id },
      data: {
        ...datiShopify(brand, o),
        // categoria: aggiorna solo se non corretta a mano
        ...(e.categoriaPagamentoManuale ? {} : { categoriaPagamento: o.categoriaPagamento }),
        // righe: si riscrivono solo se cambiate di numero (rimborsi/modifiche),
        // altrimenti si evita un delete+insert inutile a ogni sync
        ...(e._count.righe === o.righe.length
          ? {}
          : {
              righe: {
                deleteMany: {},
                create: o.righe.map((r) => ({
                  titolo: r.titolo,
                  variante: r.variante,
                  sku: r.sku,
                  quantita: r.quantita,
                  prezzo: r.prezzo,
                })),
              },
            }),
      },
    });
  }

  return { nuovi: nuovi.length, aggiornati: daAggiornare.length };
}
