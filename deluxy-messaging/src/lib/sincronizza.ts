import { db } from './db'
import { salvaContattiOrdini } from './contatti'
import { brandRicercaDaNegozio, prefissoDaNegozio } from './negozi'
import { salvaImpostazione } from './impostazioni'
import { scaricaOrdiniDaOrders, statiDaOrders } from './orders'

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
      dataConsegna: o.dataConsegna ? new Date(o.dataConsegna) : null,
      fasciaConsegna: o.fasciaConsegna,
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

  // Salvataggio automatico dei contatti (salta da solo se Google non è collegato).
  let contatti: unknown
  if (conContatti) {
    try {
      contatti = await salvaContattiOrdini()
    } catch (e) {
      contatti = { errore: (e as Error).message }
    }
  }

  return { scaricati: ordini.length, nuovi, contatti }
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
