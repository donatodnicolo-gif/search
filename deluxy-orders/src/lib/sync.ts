import { prisma } from "./db";
import { categorieOrdine } from "./categorie";
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

    // Salva una pagina di ordini appena arriva da Shopify, riprovando se il
    // database chiude la connessione (vedi conRiprova).
    const salvaPagina = async (ordini: OrdineNormalizzato[], pagina: number) => {
      const esito = await conRiprova(() =>
        salvaBloccoOrdini(neg.id, neg.brand, ordini, iniziale?.id ?? null, neg.categoriaPredefinita),
      );
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

// Su un import storico si resta collegati al database per più di un'ora e il
// pooler di Supabase ogni tanto chiude la connessione: senza rete di sicurezza
// l'intero giro si interrompe a metà (è successo tre volte, sempre sul negozio
// più grande). Prisma riapre da sé alla query successiva, quindi basta
// riprovare con una pausa crescente.
//
// Si riprova l'INTERA pagina, non la singola query: il salvataggio è
// idempotente (createMany con skipDuplicates, e al secondo giro gli ordini
// risultano già presenti e passano dal ramo di aggiornamento), quindi ripeterlo
// non crea doppioni.
// Le pause raddoppiano fino a mezzo minuto: in tutto si insiste per circa due
// minuti. Un primo tentativo con 4 riprove ravvicinate (18 secondi in tutto)
// non bastava — l'interruzione del pooler dura di più.
async function conRiprova<T>(operazione: () => Promise<T>, tentativi = 7): Promise<T> {
  let ultimo: unknown;
  for (let t = 0; t < tentativi; t++) {
    try {
      return await operazione();
    } catch (e) {
      const messaggio = (e as Error).message ?? "";
      const connessionePersa =
        /closed the connection|Can't reach database|Connection (reset|refused|closed)|ECONNRESET|Timed out fetching|Server has closed/i.test(
          messaggio,
        );
      if (!connessionePersa || t === tentativi - 1) throw e;
      ultimo = e;
      const pausa = Math.min(30000, 2000 * 2 ** t); // 2s, 4s, 8s, 16s, 30s, 30s
      console.log(`  database irraggiungibile, riprovo fra ${pausa / 1000}s (tentativo ${t + 1}/${tentativi - 1})`);
      await new Promise((r) => setTimeout(r, pausa));
    }
  }
  throw ultimo;
}

// Le righe vanno riscritte se è cambiato il numero (un rimborso parziale toglie
// un articolo) oppure le personalizzazioni scelte dal cliente. Confrontare solo
// il numero non bastava: le personalizzazioni sono arrivate dopo, e sugli
// ordini già salvati non sarebbero mai comparse.
function righeCambiate(
  salvate: { proprieta: string | null; immagine: string | null }[],
  arrivate: { proprieta: string | null; immagine: string | null }[],
): boolean {
  if (salvate.length !== arrivate.length) return true;
  // Nel confronto entra anche l'immagine: senza, le righe degli ordini già
  // presenti non venivano mai riscritte e le foto non arrivavano mai (erano 6
  // su 16.938). Il numero di righe da solo non basta a dire "è tutto a posto".
  const chiave = (r: { proprieta: string | null; immagine: string | null }[]) =>
    r.map((x) => `${x.proprieta ?? ""}§${x.immagine ?? ""}`).sort().join("|");
  return chiave(salvate) !== chiave(arrivate);
}

// Campi Shopify di un ordine (sempre aggiornati: sono informativi).
function datiShopify(brand: string, o: OrdineNormalizzato, categoriaPredefinita?: string | null) {
  return {
    brand,
    // Di che cosa è fatto l'ordine, dai titoli delle sue righe. NON entra in
    // `cambiato()`: sarebbe un motivo di riscrittura per tutto l'archivio. Si
    // riscrive quando l'ordine si aggiorna per altri motivi (righe comprese), e
    // lo storico si ricalcola in blocco dal pulsante in Impostazioni.
    categorie: categorieOrdine(o.righe.map((r) => r.titolo), categoriaPredefinita),
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
    consensoEmail: o.consensoEmail,
    consensoEmailIl: o.consensoEmailIl,
    consensoSms: o.consensoSms,
    consensoSmsIl: o.consensoSmsIl,
    dataConsegna: o.dataConsegna,
    fasciaConsegna: o.fasciaConsegna,
    biglietto: o.biglietto,
    bigliettoDaNota: o.bigliettoDaNota,
    spedizioneNome: o.spedizioneNome,
    indirizzo: o.indirizzo,
    citta: o.citta,
    cap: o.cap,
    provincia: o.provincia,
    paese: o.paese,
    noteShopify: o.noteShopify,
    tagShopify: o.tagShopify,
    // Provenienza di marketing. Questi campi stanno ANCHE in `cambiato()`:
    // scriverli senza confrontarli è l'errore già pagato coi consensi — l'import
    // gira, dice «tutto invariato» e non salva niente.
    sorgente: o.sorgente,
    visitaSorgente: o.visitaSorgente,
    utmSource: o.utmSource,
    utmMedium: o.utmMedium,
    utmCampaign: o.utmCampaign,
    canaleMarketing: o.canaleMarketing,
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
  categoriaPredefinita: string | null,
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
      // le personalizzazioni salvate, per capire se le righe vanno riscritte
      righe: { select: { proprieta: true, immagine: true } },
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
      consensoEmail: true,
      consensoSms: true,
      dataConsegna: true,
      fasciaConsegna: true,
      biglietto: true,
      bigliettoDaNota: true,
      spedizioneNome: true,
      indirizzo: true,
      citta: true,
      cap: true,
      provincia: true,
      paese: true,
      noteShopify: true,
      tagShopify: true,
      sorgente: true,
      visitaSorgente: true,
      utmSource: true,
      utmMedium: true,
      utmCampaign: true,
      canaleMarketing: true,
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
        ...datiShopify(brand, o, categoriaPredefinita),
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

    const righe: {
      ordineId: string;
      titolo: string;
      variante: string | null;
      sku: string | null;
      quantita: number;
      prezzo: number;
      proprieta: string | null;
      immagine: string | null;
    }[] = [];
    const eventi: { ordineId: string; tipo: string; descrizione: string; autore: string }[] = [];
    for (const o of nuovi) {
      const id = idPerOrderId.get(o.orderId);
      if (!id) continue;
      for (const r of o.righe) {
        righe.push({ ordineId: id, titolo: r.titolo, variante: r.variante, sku: r.sku, quantita: r.quantita, prezzo: r.prezzo, proprieta: r.proprieta, immagine: r.immagine });
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
        ...datiShopify(brand, o, categoriaPredefinita),
        // categoria: aggiorna solo se non corretta a mano
        ...(e.categoriaPagamentoManuale ? {} : { categoriaPagamento: o.categoriaPagamento }),
        // righe: si riscrivono se è cambiato il numero (rimborsi/modifiche) o
        // se sono cambiate le personalizzazioni; altrimenti si evita un
        // delete+insert inutile a ogni sync
        ...(!righeCambiate(e.righe, o.righe)
          ? {}
          : {
              righe: {
                deleteMany: {},
                create: o.righe.map((r) => ({
                  titolo: r.titolo,
                  proprieta: r.proprieta,
                  immagine: r.immagine,
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
  righe: { proprieta: string | null; immagine: string | null }[];
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
  consensoEmail: string | null;
  consensoSms: string | null;
  dataConsegna: Date | null;
  fasciaConsegna: string | null;
  biglietto: string | null;
  bigliettoDaNota: boolean;
  spedizioneNome: string | null;
  indirizzo: string | null;
  citta: string | null;
  cap: string | null;
  provincia: string | null;
  paese: string | null;
  noteShopify: string | null;
  tagShopify: string | null;
  sorgente: string | null;
  visitaSorgente: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  canaleMarketing: string;
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
  // Il rischio frode NON entra nel confronto: si importa sui NUOVI ordini e
  // basta. Se lo si confrontasse, ogni ordine storico risulterebbe "cambiato"
  // (il valore passa da vuoto a un livello) e ogni sincronizzazione si
  // trascinerebbe dietro la riscrittura di tutto l'archivio — un'ora di lavoro
  // per un dato che serve a decidere se spedire, quindi solo sugli ordini
  // freschi. Resta comunque salvato quando l'ordine si aggiorna per altri
  // motivi, perché fa parte dei campi scritti.
  if (e.gateway !== o.gateway) return true;
  if (e.clienteNome !== o.clienteNome) return true;
  if (e.clienteEmail !== o.clienteEmail) return true;
  if (e.clienteTelefono !== o.clienteTelefono) return true;
  // I consensi di marketing SÌ entrano nel confronto, al contrario del rischio
  // frode: cambiano nel tempo (un cliente si disiscrive) e sapere che si è
  // disiscritto è esattamente il punto. Prezzo da pagare: la prima sync dopo
  // questa modifica riscrive gli ordini della finestra, perché il valore passa
  // da vuoto a un consenso.
  if (e.consensoEmail !== o.consensoEmail) return true;
  if (e.consensoSms !== o.consensoSms) return true;
  if (!dataUguale(e.dataConsegna, o.dataConsegna)) return true;
  if (e.fasciaConsegna !== o.fasciaConsegna) return true;
  if (e.biglietto !== o.biglietto) return true;
  if (e.bigliettoDaNota !== o.bigliettoDaNota) return true;
  if (e.spedizioneNome !== o.spedizioneNome) return true;
  if (e.indirizzo !== o.indirizzo) return true;
  if (e.citta !== o.citta) return true;
  if (e.cap !== o.cap) return true;
  if (e.provincia !== o.provincia) return true;
  if (e.paese !== o.paese) return true;
  if (e.noteShopify !== o.noteShopify) return true;
  if (e.tagShopify !== o.tagShopify) return true;
  // La provenienza SÌ entra nel confronto, come i consensi: senza, sugli ordini
  // già salvati non comparirebbe mai — è l'errore che ha reso muti i consensi
  // per un intero backfill. Prezzo: la prima sync dopo questa modifica riscrive
  // gli ordini della finestra, perché il valore passa da vuoto a un canale.
  if (e.sorgente !== o.sorgente) return true;
  if (e.visitaSorgente !== o.visitaSorgente) return true;
  if (e.utmSource !== o.utmSource) return true;
  if (e.utmMedium !== o.utmMedium) return true;
  if (e.utmCampaign !== o.utmCampaign) return true;
  if (e.canaleMarketing !== o.canaleMarketing) return true;
  if (righeCambiate(e.righe, o.righe)) return true;
  if (e.brand !== brand) return true; // il negozio è stato rinominato
  if (!e.categoriaPagamentoManuale && e.categoriaPagamento !== o.categoriaPagamento) return true;
  return false;
}
