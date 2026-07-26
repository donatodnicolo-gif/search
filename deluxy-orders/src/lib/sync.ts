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
    annullatoIl: o.annullatoIl,
    motivoAnnullamento: o.motivoAnnullamento,
    chiusoIl: o.chiusoIl,
    rischioLivello: o.rischioLivello,
    rischioRaccomandazione: o.rischioRaccomandazione,
    rischioMotivi: o.rischioMotivi,
    gateway: o.gateway,
    clienteNome: o.clienteNome,
    clienteEmail: o.clienteEmail,
    clienteTelefono: o.clienteTelefono,
    dataConsegna: o.dataConsegna,
    fasciaConsegna: o.fasciaConsegna,
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
    select: {
      id: true,
      orderId: true,
      categoriaPagamento: true,
      categoriaPagamentoManuale: true,
      _count: { select: { righe: true } },
      // serve a capire se l'ordine è cambiato davvero (vedi sotto)
      brand: true,
      numero: true,
      data: true,
      totale: true,
      valuta: true,
      financialStatus: true,
      fulfillmentStatus: true,
      annullatoIl: true,
      motivoAnnullamento: true,
      chiusoIl: true,
      rischioLivello: true,
      rischioRaccomandazione: true,
      rischioMotivi: true,
      gateway: true,
      clienteNome: true,
      clienteEmail: true,
      clienteTelefono: true,
      dataConsegna: true,
      fasciaConsegna: true,
      spedizioneNome: true,
      indirizzo: true,
      citta: true,
      cap: true,
      provincia: true,
      paese: true,
      noteShopify: true,
      tagShopify: true,
    },
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

  // ---- ordini già presenti: si aggiornano solo se qualcosa è cambiato ----
  // Ogni update è un viaggio verso il database: riscrivere ordini identici
  // costava minuti a ogni sync (e mandava in timeout il cron notturno, che ha
  // due minuti). Nella sync quotidiana quasi tutti gli ordini della finestra
  // sono immutati, quindi qui si salta la stragrande maggioranza delle scritture.
  let invariati = 0;
  for (const o of daAggiornare) {
    const e = giaPresenti.get(o.orderId)!;
    if (!cambiato(e, o, brand)) {
      invariati++;
      continue;
    }
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

  return { nuovi: nuovi.length, aggiornati: daAggiornare.length - invariati };
}

// Un ordine già salvato è "cambiato" se differisce in un campo che importiamo
// da Shopify, nel numero di righe, o nella categoria dedotta (solo quando non
// è stata corretta a mano). Confronto per valore: le date si confrontano al
// millisecondo, i decimali con una tolleranza di un centesimo.
type OrdineSalvato = {
  categoriaPagamento: string;
  categoriaPagamentoManuale: boolean;
  _count: { righe: number };
  brand: string;
  numero: string;
  data: Date;
  totale: number;
  valuta: string;
  financialStatus: string | null;
  fulfillmentStatus: string | null;
  annullatoIl: Date | null;
  motivoAnnullamento: string | null;
  chiusoIl: Date | null;
  rischioLivello: string | null;
  rischioRaccomandazione: string | null;
  rischioMotivi: string | null;
  gateway: string | null;
  clienteNome: string | null;
  clienteEmail: string | null;
  clienteTelefono: string | null;
  dataConsegna: Date | null;
  fasciaConsegna: string | null;
  spedizioneNome: string | null;
  indirizzo: string | null;
  citta: string | null;
  cap: string | null;
  provincia: string | null;
  paese: string | null;
  noteShopify: string | null;
  tagShopify: string | null;
};

function cambiato(e: OrdineSalvato, o: OrdineNormalizzato, brand: string): boolean {
  const dataUguale = (a: Date | null, b: Date | null) =>
    a === null || b === null ? a === b : a.getTime() === b.getTime();

  if (e.numero !== o.numero) return true;
  if (!dataUguale(e.data, o.data)) return true;
  if (Math.abs(e.totale - o.totale) > 0.005) return true;
  if (e.valuta !== o.valuta) return true;
  if (e.financialStatus !== o.financialStatus) return true;
  if (e.fulfillmentStatus !== o.fulfillmentStatus) return true;
  if (!dataUguale(e.annullatoIl, o.annullatoIl)) return true;
  if (e.motivoAnnullamento !== o.motivoAnnullamento) return true;
  if (!dataUguale(e.chiusoIl, o.chiusoIl)) return true;
  if (e.rischioLivello !== o.rischioLivello) return true;
  if (e.rischioRaccomandazione !== o.rischioRaccomandazione) return true;
  if (e.rischioMotivi !== o.rischioMotivi) return true;
  if (e.gateway !== o.gateway) return true;
  if (e.clienteNome !== o.clienteNome) return true;
  if (e.clienteEmail !== o.clienteEmail) return true;
  if (e.clienteTelefono !== o.clienteTelefono) return true;
  if (!dataUguale(e.dataConsegna, o.dataConsegna)) return true;
  if (e.fasciaConsegna !== o.fasciaConsegna) return true;
  if (e.spedizioneNome !== o.spedizioneNome) return true;
  if (e.indirizzo !== o.indirizzo) return true;
  if (e.citta !== o.citta) return true;
  if (e.cap !== o.cap) return true;
  if (e.provincia !== o.provincia) return true;
  if (e.paese !== o.paese) return true;
  if (e.noteShopify !== o.noteShopify) return true;
  if (e.tagShopify !== o.tagShopify) return true;
  if (e._count.righe !== o.righe.length) return true;
  if (e.brand !== brand) return true; // il negozio è stato rinominato
  if (!e.categoriaPagamentoManuale && e.categoriaPagamento !== o.categoriaPagamento) return true;
  return false;
}
