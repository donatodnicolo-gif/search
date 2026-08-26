import { db } from './db'
import { salvaContattiOrdini } from './contatti'
import { brandRicercaDaNegozio, prefissoDaNegozio } from './negozi'
import { salvaImpostazione } from './impostazioni'
import { annullatiDaOrders, scaricaOrdiniDaOrders, statiDaOrders } from './orders'

// Lo scarico degli ordini da Deluxy Orders, in un posto solo: lo chiamano sia il
// pulsante "Aggiorna" (POST /api/ordini/sync) sia il cron dei 15 minuti
// (GET /api/cron/ordini). Prima la logica viveva dentro la rotta e il cron non
// avrebbe potuto riusarla senza duplicarla.
//
// Ogni brand di Orders diventa un "negozio" locale: serve alle colonne della
// bacheca, alla sigla in rubrica (FL/CK/DL) e al bottone Fornitore. Se un brand
// non c'è ancora, si crea da solo — senza credenziali, perché non serve più
// parlare con Shopify.
type Negozio = { id: string; nome: string }

async function negozioPerBrand(brand: string, cache: Map<string, Negozio>): Promise<Negozio> {
  const chiave = brand.trim().toLowerCase()
  const gia = cache.get(chiave)
  if (gia) return gia

  // solo alla prima comparsa di un brand: poi risponde la cache
  const esistenti = await db.negozioShopify.findMany()
  const trovato = esistenti.find(
    (n) =>
      n.nome.trim().toLowerCase() === chiave ||
      n.dominio.trim().toLowerCase() === chiave ||
      brandRicercaDaNegozio(n.nome, n.dominio, n.brandRicerca).toLowerCase() ===
        brandRicercaDaNegozio(brand, '').toLowerCase()
  )
  if (trovato) {
    const n = { id: trovato.id, nome: trovato.nome }
    cache.set(chiave, n)
    return n
  }

  const creato = await db.negozioShopify.create({
    data: {
      nome: brand,
      dominio: chiave,
      prefisso: prefissoDaNegozio(brand, ''),
      brandRicerca: brandRicercaDaNegozio(brand, ''),
    },
  })
  const n = { id: creato.id, nome: creato.nome }
  cache.set(chiave, n)
  return n
}

export type EsitoSync = {
  scaricati: number
  nuovi: number
  annullati: number // righe locali ritirate perché l'ordine è stato annullato su Shopify
  contatti: unknown
}

/**
 * Scarica gli ordini e li allinea in locale.
 *
 * `completo` rifà tutta la finestra di 60 giorni: serve dopo aver aggiunto campi
 * nuovi (come consegna e stato), che gli ordini già salvati non hanno. Senza,
 * l'aggiornamento è INCREMENTALE — riparte dal giorno dell'ordine più recente
 * che abbiamo, meno un giorno di margine — perché su Vercel una funzione ha un
 * tetto di tempo e i 60 giorni pieni non ci starebbero.
 *
 * `contatti: false` salta il salvataggio in rubrica Google.
 */
export async function sincronizzaOrdini(
  opzioni: { completo?: boolean; contatti?: boolean } = {}
): Promise<EsitoSync> {
  const { completo = false, contatti: conContatti = true } = opzioni

  const piuRecente = completo
    ? null
    : await db.ordine.findFirst({ orderBy: { data: 'desc' }, select: { data: true } })
  const giorniIndietro = piuRecente
    ? Math.max(1, Math.ceil((Date.now() - piuRecente.data.getTime()) / 86400000) + 1)
    : 60

  const ordini = await scaricaOrdiniDaOrders(Math.min(giorniIndietro, 60))

  // Com'erano PRIMA di questo giro: serve a riconoscere i **passaggi di
  // stato**, non gli stati. Una query sola per tutto il lotto, non una per
  // ordine.
  const primaDiOra = new Map<
    string,
    {
      statoPagamento: string
      gestione: string
      gestioneDaId: string
      consegnaSpostata: boolean
    }
  >()
  for (const riga of await db.ordine.findMany({
    where: { shopifyId: { in: ordini.map((o) => o.orderId).filter(Boolean) } },
    select: {
      shopifyId: true,
      statoPagamento: true,
      gestione: true,
      gestioneDaId: true,
      consegnaSpostata: true,
    },
  })) {
    primaDiOra.set(riga.shopifyId, {
      statoPagamento: riga.statoPagamento,
      gestione: riga.gestione,
      gestioneDaId: riga.gestioneDaId,
      consegnaSpostata: riga.consegnaSpostata,
    })
  }

  const cache = new Map<string, Negozio>()
  const stati = await statiDaOrders() // colori della pipeline, per il calendario
  let nuovi = 0

  for (const o of ordini) {
    const negozio = await negozioPerBrand(o.brand || 'senza brand', cache)
    const negozioId = negozio.id
    const comuni = {
      // il nome del NEGOZIO, non il brand grezzo: Orders chiama lo stesso
      // negozio ora "Flowers" ora "deluxyflowers.com", qui dev'essere uno solo
      negozioNome: negozio.nome,
      // ⚠️ L'id che l'ordine ha in Orders: è il ponte verso la piattaforma
      // consegne, che lo usa come `externalOrderId`. Si scrive qui perché è
      // l'unico momento in cui ce l'abbiamo in mano senza chiederlo.
      ordersId: o.id,
      numero: o.numero,
      data: new Date(o.data),
      totale: o.totale,
      valuta: o.valuta || 'EUR',
      clienteNome: o.clienteNome,
      telefono: o.telefono,
      email: o.email,
      citta: o.citta,
      // Serve a scegliere la lingua in cui scrivere al cliente.
      paese: o.paese,
      // ── La consegna, e la deroga per quella spostata da noi ──
      //
      // Di suo vince Orders: la consegna la chiede il cliente e sta su Shopify.
      // ⚠️ MA se qualcuno l'ha spostata da qui (`consegnaSpostata`), riscriverla
      // a ogni giro vorrebbe dire cancellare la decisione di una persona **ogni
      // 15 minuti**, senza che nessuno capisca perché la data «torna indietro».
      // Quello che dice Orders si tiene comunque, in `dataConsegnaOriginale`:
      // serve a mostrare la divergenza e a spegnere la deroga quando la fonte
      // si allinea (vedi `consegnaAllineata`).
      ...(primaDiOra.get(o.orderId)?.consegnaSpostata
        ? {}
        : {
            dataConsegna: o.dataConsegna ? new Date(o.dataConsegna) : null,
            fasciaConsegna: o.fasciaConsegna,
          }),
      dataConsegnaOriginale: o.dataConsegna ? new Date(o.dataConsegna) : null,
      fasciaConsegnaOriginale: o.fasciaConsegna,
      statoChiave: o.statoChiave,
      statoNome: o.statoNome || stati.get(o.statoChiave)?.nome || '',
      statoColore: stati.get(o.statoChiave)?.colore || '',
      // Da che tipo di cliente arriva l'ordine: deciso in Orders, qui solo
      // ricopiato (vedi la nota su `clienteTipo` nello schema).
      //
      // Si scrive SOLO se Orders ce lo dice davvero: se il campo torna vuoto —
      // perché quella versione di Orders non lo espone ancora, o perché
      // dell'ordine non si sa chi sia il cliente — si tiene quello che c'è già
      // invece di cancellarlo. Un dato mancante in arrivo non è la notizia che
      // il dato è diventato falso, e non deve svuotare una colonna che qualcuno
      // sta guardando.
      ...(o.clienteTipo ? { clienteTipo: o.clienteTipo, clienteTipoDa: o.clienteTipoDa } : {}),
      // Stessa regola per gli ordinali del cliente: si scrivono solo se Orders
      // li ha davvero calcolati. Un null in arrivo non deve cancellare un
      // ordinale già noto e far tornare «nuovo» un cliente affezionato.
      ...(o.clienteNumeroOrdine !== null
        ? { clienteOrdiniPrima: o.clienteOrdiniPrima, clienteNumeroOrdine: o.clienteNumeroOrdine }
        : {}),
      // Qui invece si riscrive SEMPRE, anche a falso: se il cliente cancella la
      // nota, il simbolo in lista deve spegnersi. È l'opposto degli ordinali,
      // dove un null in arrivo vuol dire «non calcolato» e non «non c'è più».
      haBiglietto: o.haBiglietto,
      // Il GOVERNO dello smistamento: la verità sta su Orders, qui il
      // riflesso per la scheda — si riscrive sempre, come gli stati.
      smistamento: o.smistamento,
      // ⚠️ Pagamento e rischio si riscrivono SEMPRE, anche a vuoto: sono lo
      // stato di adesso, non un dato che si accumula. Un ordine rimborsato
      // ieri e «PENDING» oggi deve smettere di dirsi pagato — e uno che Shopify
      // ha smesso di considerare sospetto deve smettere di allarmare, altrimenti
      // il bollino rosso diventa un'etichetta che nessuno guarda più.
      statoPagamento: o.statoPagamento,
      rischioLivello: o.rischioLivello,
      rischioRaccomandazione: o.rischioRaccomandazione,
      // ── L'ordine rimborsato si chiude da solo ──
      //
      // Su un ordine reso non c'è più niente da lavorare: restava «Da gestire»
      // in mezzo al lavoro vero, e qualcuno prima o poi lo rilavorava.
      //
      // ⚠️⚠️ SI REAGISCE AL PASSAGGIO, NON ALLO STATO, e la differenza è tutta
      // qui: chiudendo ogni volta che Shopify dice REFUNDED, un ordine che una
      // persona ha riaperto apposta (magari per finire una pratica) verrebbe
      // richiuso al giro dopo, e al successivo, senza che si capisca perché.
      // Così invece si chiude **una volta sola**, quando il rimborso compare —
      // dopo, l'ultima parola è di chi lavora.
      //
      // ⚠️ Solo REFUNDED (reso per intero). Un rimborso PARZIALE lascia una
      // consegna da fare, e chiuderlo vorrebbe dire perderla.
      ...(o.statoPagamento === 'REFUNDED' &&
      (primaDiOra.get(o.orderId)?.gestione ?? 'da_gestire') !== 'gestito' &&
      // ⚠️ Due strade per arrivarci, e servono tutt'e due:
      //  · il rimborso è **appena** comparso (il passaggio di stato), oppure
      //  · l'ordine è rimborsato da prima ma **nessuno l'ha mai toccato a mano**
      //    (`gestioneDaId` vuoto) — sono i 9 che stavano già in mezzo al lavoro
      //    quando questa regola è nata, e che nessun passaggio avrebbe più
      //    ripescato.
      // Chi RIAPRE un ordine lascia il proprio id: da quel momento comanda lui,
      // e il sync non lo richiude più.
      (primaDiOra.get(o.orderId)?.statoPagamento !== 'REFUNDED' ||
        !primaDiOra.get(o.orderId)?.gestioneDaId)
        ? {
            gestione: 'gestito',
            gestioneIl: new Date(),
            gestioneDaId: '',
            // Il nome dice CHI ha chiuso: qui non è una persona, ed è meglio
            // scritto che lasciato in bianco — «chi è stato?» su un ordine
            // sparito dalla lista è la prima domanda.
            gestioneDaNome: 'rimborso su Shopify',
          }
        : {}),
    }
    const esito = await db.ordine.upsert({
      // il gid Shopify è la chiave stabile: gli ordini presi prima da Shopify
      // si aggiornano invece di duplicarsi
      where: { negozioId_shopifyId: { negozioId, shopifyId: o.orderId } },
      // contattoSalvato/contattoEsito sono nostri: non si sovrascrivono
      update: comuni,
      create: { negozioId, shopifyId: o.orderId, ...comuni },
    })
    if (Date.now() - esito.creatoIl.getTime() < 5000) nuovi++
  }

  // ── Gli annullati si RITIRANO, non si scoprono per assenza ──
  //
  // Orders esclude gli annullati dai suoi elenchi: da qui non arriverebbero mai
  // più, e la copia resterebbe «valida» per sempre — smistabile a un fornitore,
  // pagabile (audit 24/08/2026). Il canale è `?annullatiDa=`: si chiede la
  // stessa finestra dello specchio e si scrive `annullatoIl` sulle righe
  // locali. Idempotente (si toccano solo le righe non ancora marcate), e un
  // errore qui non fa fallire la sync: il ritiro riparte al giro dopo.
  let annullati = 0
  try {
    for (const a of await annullatiDaOrders(60)) {
      const marcato = await db.ordine.updateMany({
        // il gid Shopify è globale per tutta la piattaforma Shopify: basta lui
        where: { shopifyId: a.orderId, annullatoIl: null },
        data: { annullatoIl: a.annullatoIl ? new Date(a.annullatoIl) : new Date() },
      })
      annullati += marcato.count
    }
  } catch {
    // il ritiro è un contorno: la sync resta valida
  }

  // Salvataggio automatico dei contatti (salta da solo se Google non è collegato).
  let contatti: unknown
  if (conContatti) {
    try {
      contatti = await salvaContattiOrdini()
    } catch (e) {
      contatti = { errore: (e as Error).message }
    }
  }

  return { scaricati: ordini.length, nuovi, annullati, contatti }
}

/**
 * Annota com'è andato l'ultimo giro automatico, così la pagina Ordini può dire
 * "aggiornato 4 minuti fa" invece di lasciare il dubbio che il cron sia fermo.
 * Un errore qui non deve far fallire la sincronizzazione: è solo un promemoria.
 */
export async function annotaSync(esito: { ok: boolean; nota: string }): Promise<void> {
  try {
    await salvaImpostazione('ordiniSyncUltimo', new Date().toISOString())
    await salvaImpostazione('ordiniSyncEsito', (esito.ok ? 'ok: ' : 'errore: ') + esito.nota)
  } catch {
    // il registro dell'orario non vale il fallimento di una sync riuscita
  }
}
