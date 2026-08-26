import { db } from './db'
import { totaleConUniti } from './unione-ordini'
import { brandRicercaDaNegozio } from './negozi'
import {
  ordineDaOrders,
  pezziOrdine,
  righeOrdineDaOrders,
  type RigaOrdine,
  type SpedizioneOrdine,
  leggiQuotaFornitore,
  type QuotaFornitore,
} from './orders'

// IL DETTAGLIO DI UN ORDINE, da qualunque parte arrivi.
//
// Gli ordini si guardano in due posti che sembrano uno solo:
//  · quelli degli ultimi 60 giorni, che stanno **in casa** (tabella `Ordine`) e
//    si lavorano — hanno uno stato di lavorazione, i messaggi del cliente
//    collegati, il bottone «Gestito»;
//  · quelli più vecchi, che vivono **solo nel registro Orders** e qui si
//    cercano soltanto (l'«Archivio storico» di Ordini globali).
//
// Il pannello del dettaglio è lo stesso, quindi la risposta ha la stessa forma
// per entrambi: cambia `ordine.id`, che è vuoto quando l'ordine non è in casa.
// È quel campo — e non un parametro nell'URL — a dire al pannello quali azioni
// può offrire: un'azione che scrive su una riga che non esiste fallirebbe dopo
// il clic, che è il momento peggiore per scoprirlo.

export type OrdineDettaglioDto = {
  /** Vuoto quando l'ordine esiste solo nell'archivio Orders. */
  id: string
  numero: string
  negozioNome: string
  brandRicerca: string
  data: string
  totale: number
  valuta: string
  statoPagamento: string
  /** "manuale" = riservato a noi: lo smistamento automatico lo salta. */
  smistamento?: string
  /** Valorizzato = l'ordine è stato ANNULLATO su Shopify: non si lavora più
   *  (né fornitore né pagamento). Arriva dal ritiro `?annullatiDa=` di Orders. */
  annullatoIl?: string | null
  clienteNome: string
  telefono: string
  email: string
  indirizzo: string
  citta: string
  paese: string
  dataConsegna: string | null
  fasciaConsegna: string
  /** La consegna è stata spostata da noi (e allora diverge da Shopify). */
  consegnaSpostata?: boolean
  dataConsegnaOriginale?: string | null
  fasciaConsegnaOriginale?: string
  consegnaSpostataDa?: string
  statoNome: string
  statoColore: string
  note: string
  gestione: string
  /** Quello che dice la piattaforma consegne: copia a breve scadenza. */
  appStato: string
  appPartner: string
  appCostoPartner: number | null
  appInterrottoIl: string | null
  /** La richiesta di pagamento ancora aperta su quest'ordine ('' = nessuna). */
  pagamentoApertoId: string
  pagamentoApertoA: string
  pagamentoApertoQuanto: number
  /** L'unione: a chi è unito questo, e chi è unito a lui. */
  unitoA: string
  unitoDaNome: string
  uniti: { numero: string; totale: number }[]
  /** Il totale suo più quello degli ordini uniti: è la base vera del margine. */
  totaleConUniti: number
  /** L'ultimo link di riconsegna già creato: si rivede aprendo la scheda. */
  riconsegnaLink: string
  riconsegnaNumero: string
  /**
   * Le telefonate di questo cliente per quest'ordine.
   *
   * ⚠️⚠️ Stanno sulla scheda perché sono parte della storia dell'ordine come i
   * messaggi: senza, chi apre l'ordine non sa che il cliente ha già chiamato
   * due volte, e glielo fa raccontare da capo.
   */
  chiamate: { id: string; quando: string; numero: string; richiamataIl: string | null }[]
  clienteTipo: string
  clienteTipoDa: string
  /** A chi abbiamo dato l'ordine da preparare. Vedi `fornitore-ordine.ts`. */
  fornitoreNome: string
  fornitoreId: string
  fornitoreCitta: string
  fornitoreTelefono: string
  fornitoreEmail: string
  fornitoreCosto: number | null
  fornitoreNota: string
  fornitoreDaNome: string
  fornitoreIl: string | null
}

export type DettaglioOrdinePayload = {
  ordine: OrdineDettaglioDto
  righe: RigaOrdine[]
  // Il DESTINATARIO e l'indirizzo di consegna arrivano da Orders: qui in casa
  // c'è solo chi compra. Nei regali sono quasi sempre due persone diverse, e
  // confonderle vuol dire scrivere alla persona sbagliata.
  spedizione: SpedizioneOrdine | null
  biglietto: string
  /** Perché i prodotti non ci sono, quando non ci sono. */
  righeNota: string
  /**
   * Quanto ci si aspetta di pagare al fornitore per quest'ordine.
   *
   * ⚠️ `null` quando non si sa (Orders non configurato o non risponde): allora
   * la scheda **non mostra niente**. La regola è di Orders e non si ricopia
   * qui: un 60% scritto nel nostro codice resterebbe al vecchio valore il
   * giorno che lo cambiano là.
   */
  quotaFornitore: QuotaFornitore | null
}

/**
 * Il dettaglio di un ordine che abbiamo in casa: i nostri dati più i PRODOTTI
 * (con le foto), che stanno nel registro Ordini e si chiedono a lui.
 *
 * Le righe non si tengono in copia: servono solo qui, e duplicare il catalogo
 * vorrebbe dire mantenerlo aggiornato mentre Orders lo sincronizza già.
 * Se Orders non risponde, l'ordine si apre comunque con i dati locali e si dice
 * perché i prodotti non ci sono: meglio mezzo dettaglio che una pagina bianca.
 */
export async function dettaglioOrdineLocale(id: string): Promise<DettaglioOrdinePayload | null> {
  const ordine = await db.ordine.findUnique({ where: { id } })
  if (!ordine) return null
  // ⚠️⚠️ La richiesta di pagamento ancora APERTA su quest'ordine: serve a
  // spegnere il bottone «Paga fornitore» invece di lasciar nascere una seconda
  // richiesta gemella. Si cerca in tutte e due le forme del numero — in tabella
  // le vecchie stanno senza cancelletto e le nuove con — perché cercandone una
  // sola la guardia non troverebbe niente e non farebbe niente, in silenzio.
  // ⚠️ Gli ordini uniti a questo: servono al riquadro e al TOTALE su cui ha
  // senso guardare il margine (il costo del fornitore è uno solo).
  const insieme = await totaleConUniti(ordine.numero ?? '', ordine.totale ?? 0)
  const senzaCancelletto = (ordine.numero ?? '').replace(/^#+/, '')
  const aperta = senzaCancelletto
    ? await db.richiestaPagamento.findFirst({
        where: {
          ordineNumero: { in: [senzaCancelletto, `#${senzaCancelletto}`] },
          pagataIl: null,
        },
        orderBy: { creatoIl: 'desc' },
        select: { id: true, intestatario: true, importo: true },
      })
    : null
  // ⚠️ In parallelo con le righe, non dopo: sono due chiamate a Orders e messe
  // in fila raddoppierebbero l'attesa di chi apre una scheda.
  const quota = await leggiQuotaFornitore(ordine.totale)

  const chiamate = await db.chiamata.findMany({
    where: { ordineId: ordine.id },
    orderBy: { quando: 'desc' },
    take: 20,
    select: { id: true, quando: true, numero: true, richiamataIl: true },
  })

  const negozio = await db.negozioShopify.findUnique({ where: { id: ordine.negozioId } })
  const brandRicerca = negozio
    ? brandRicercaDaNegozio(negozio.nome, negozio.dominio, negozio.brandRicerca)
    : ''

  // `shopifyId` è il gid Shopify: identifica l'ordine anche quando lo stesso
  // numero esiste su più negozi.
  const esito = await righeOrdineDaOrders(ordine.numero, ordine.shopifyId)

  return {
    ordine: {
      id: ordine.id,
      numero: ordine.numero,
      negozioNome: ordine.negozioNome,
      brandRicerca,
      data: ordine.data.toISOString(),
      totale: ordine.totale,
      valuta: ordine.valuta,
      statoPagamento: ordine.statoPagamento,
      smistamento: ordine.smistamento,
      annullatoIl: ordine.annullatoIl ? ordine.annullatoIl.toISOString() : null,
      clienteNome: ordine.clienteNome,
      telefono: ordine.telefono,
      email: ordine.email,
      indirizzo: ordine.indirizzo,
      citta: ordine.citta,
      paese: ordine.paese,
      dataConsegna: ordine.dataConsegna ? ordine.dataConsegna.toISOString() : null,
      fasciaConsegna: ordine.fasciaConsegna,
      consegnaSpostata: ordine.consegnaSpostata,
      dataConsegnaOriginale: ordine.dataConsegnaOriginale
        ? ordine.dataConsegnaOriginale.toISOString()
        : null,
      fasciaConsegnaOriginale: ordine.fasciaConsegnaOriginale,
      consegnaSpostataDa: ordine.consegnaSpostataDa,
      statoNome: ordine.statoNome,
      statoColore: ordine.statoColore,
      note: ordine.note,
      gestione: ordine.gestione,
      // ⚠️ Si mandano SEMPRE, anche vuoti: la scheda deve poter distinguere
      // «se ne occupa la piattaforma» da «non ne sappiamo niente».
      appStato: ordine.appStato ?? '',
      appPartner: ordine.appPartner ?? '',
      appCostoPartner: ordine.appCostoPartner ?? null,
      appInterrottoIl: ordine.appInterrottoIl ? ordine.appInterrottoIl.toISOString() : null,
      // ⚠️ La richiesta ancora DA PAGARE su quest'ordine: spegne il bottone
      // «Paga fornitore». Una già pagata non blocca (secondo fornitore).
      pagamentoApertoId: aperta?.id ?? '',
      pagamentoApertoA: aperta?.intestatario ?? '',
      pagamentoApertoQuanto: aperta?.importo ?? 0,
      unitoA: ordine.unitoA ?? '',
      unitoDaNome: ordine.unitoDaNome ?? '',
      uniti: insieme.uniti,
      totaleConUniti: insieme.totale,
      riconsegnaLink: ordine.riconsegnaLink ?? '',
      riconsegnaNumero: ordine.riconsegnaNumero ?? '',
      chiamate: chiamate.map((c) => ({
        id: c.id,
        quando: c.quando.toISOString(),
        numero: c.numero,
        richiamataIl: c.richiamataIl ? c.richiamataIl.toISOString() : null,
      })),
      clienteTipo: ordine.clienteTipo,
      clienteTipoDa: ordine.clienteTipoDa,
      fornitoreNome: ordine.fornitoreNome,
      fornitoreId: ordine.fornitoreId,
      fornitoreCitta: ordine.fornitoreCitta,
      fornitoreTelefono: ordine.fornitoreTelefono,
      fornitoreEmail: ordine.fornitoreEmail,
      fornitoreCosto: ordine.fornitoreCosto,
      fornitoreNota: ordine.fornitoreNota,
      fornitoreDaNome: ordine.fornitoreDaNome,
      fornitoreIl: ordine.fornitoreIl?.toISOString() ?? null,
    },
    righe: esito.stato === 'ok' ? esito.righe : [],
    spedizione: esito.stato === 'ok' ? esito.spedizione : null,
    biglietto: esito.stato === 'ok' ? esito.biglietto : '',
    righeNota:
      esito.stato === 'ok'
        ? ''
        : esito.stato === 'non-configurato'
          ? 'Registro Ordini non collegato: metti URL e chiave in Impostazioni.'
          : esito.messaggio,
    quotaFornitore: quota,
  }
}

/**
 * Il dettaglio di un ordine dell'**archivio storico**: tutto arriva da Orders,
 * in una sola chiamata.
 *
 * ⚠️ Prima si guarda se quell'ordine è anche in casa (stesso gid Shopify): la
 * ricerca dell'archivio pesca pure gli ordini recenti, che qui ci sono già. Se
 * si aprisse comunque la versione dell'archivio, lo stesso ordine mostrerebbe
 * metà delle azioni a seconda della tabella da cui lo si è cliccato — e nessuno
 * capirebbe perché.
 *
 * ⚠️ Qui non c'è il ripiego «mezzo dettaglio»: senza Orders non abbiamo NIENTE
 * di questo ordine, quindi si torna l'errore invece di un pannello vuoto che
 * sembra un guasto nostro.
 */
export async function dettaglioOrdineArchivio(
  numero: string,
  orderId = ''
): Promise<
  { stato: 'ok'; dati: DettaglioOrdinePayload } | { stato: 'errore'; messaggio: string }
> {
  if (orderId) {
    const locale = await db.ordine.findFirst({ where: { shopifyId: orderId } })
    if (locale) {
      const dati = await dettaglioOrdineLocale(locale.id)
      if (dati) return { stato: 'ok', dati }
    }
  }

  const esito = await ordineDaOrders(numero, orderId)
  if (esito.stato === 'non-configurato') {
    return {
      stato: 'errore',
      messaggio: 'Registro Ordini non collegato: metti URL e chiave in Impostazioni.',
    }
  }
  if (esito.stato === 'errore') return { stato: 'errore', messaggio: esito.messaggio }

  const o = esito.ordine
  const pezzi = pezziOrdine(o)
  const brand = o.brand ?? ''

  return {
    stato: 'ok',
    dati: {
      ordine: {
        // Vuoto di proposito: questo ordine non è nella nostra tabella, e il
        // pannello ci si appoggia per spegnere le azioni che scrivono.
        id: '',
        numero: o.numero ?? numero,
        negozioNome: brand,
        brandRicerca: brandRicercaDaNegozio(brand, '') || brand,
        data: o.data ?? '',
        totale: o.totale ?? 0,
        valuta: o.valuta ?? 'EUR',
        statoPagamento: o.shopify?.financialStatus ?? '',
        clienteNome: o.cliente?.nome ?? '',
        telefono: o.cliente?.telefono ?? '',
        email: o.cliente?.email ?? '',
        // L'indirizzo del dettaglio è quello di consegna, che qui arriva dentro
        // `spedizione`: questi tre servono solo da ripiego e resterebbero
        // doppioni: si lasciano vuoti invece di ripetere lo stesso dato.
        indirizzo: '',
        citta: pezzi.spedizione?.citta ?? '',
        // Il paese serve a scegliere la lingua in cui si scrive al cliente:
        // senza, si finirebbe a scrivere in italiano a chiunque.
        paese: pezzi.spedizione?.paese ?? '',
        dataConsegna: o.consegna?.data ?? null,
        fasciaConsegna: o.consegna?.fascia ?? '',
        statoNome: o.classificazione?.stato?.nome ?? '',
        statoColore: '',
        note: '',
        // Lo stato di lavorazione è NOSTRO e vale sugli ordini che lavoriamo:
        // su uno dell'archivio non esiste, e inventargli un «da gestire»
        // vorrebbe dire mettere in coda un ordine di due anni fa.
        gestione: '',
        // Un ordine d'archivio non l'abbiamo in casa: della piattaforma non
        // sappiamo niente, e si tace invece di scrivere «non in app».
        appStato: '',
        appPartner: '',
        appCostoPartner: null,
        appInterrottoIl: null,
        pagamentoApertoId: '',
        pagamentoApertoA: '',
        pagamentoApertoQuanto: 0,
        unitoA: '',
        unitoDaNome: '',
        uniti: [],
        totaleConUniti: 0,
        riconsegnaLink: '',
        riconsegnaNumero: '',
        // Le chiamate si attaccano a un ordine NOSTRO (per id): su uno
        // dell'archivio quell'id non esiste, quindi l'elenco è vuoto — non
        // «nessuno ha chiamato», ma «qui non lo si può sapere».
        chiamate: [],
        // ⚠️ L'ARCHIVIO STORICO non ha questi campi: quegli ordini vivono solo
        // in Orders, e qui in casa non esiste una riga su cui scrivere. Il
        // riquadro del fornitore non si mostra (vedi DettaglioOrdine), invece
        // di mostrarne uno che non salva niente.
        fornitoreNome: '',
        fornitoreId: '',
        fornitoreCitta: '',
        fornitoreTelefono: '',
        fornitoreEmail: '',
        fornitoreCosto: null,
        fornitoreNota: '',
        fornitoreDaNome: '',
        fornitoreIl: null,
        clienteTipo: o.cliente?.tipo ?? '',
        clienteTipoDa: o.cliente?.tipoDa ?? '',
      },
      ...pezzi,
      righeNota: '',
      quotaFornitore: await leggiQuotaFornitore(o.totale ?? 0),
    },
  }
}
