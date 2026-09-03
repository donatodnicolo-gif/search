import { NextRequest, NextResponse } from 'next/server'
import { autentica, erroreApi } from '@/lib/api-auth'
import { db } from '@/lib/db'
import { formeNumero } from '@/lib/diario'
import { cercaInArchivio } from '@/lib/orders'

export const dynamic = 'force-dynamic'

// GET /api/v1/ordini?numero=2785 — lo STATO di un ordine, per le altre app
// (oggi: AI Mail, che quando arriva una mail con un numero d'ordine mostra
// subito a che punto è). Basta una chiave di sola lettura.
//
// È il gemello API di /api/ordini/per-numero (che resta per chi è loggato
// qui dentro), con le stesse tre regole:
// - torna un ELENCO, non un ordine: lo stesso numero esiste su più negozi,
//   e scegliere il primo mostrerebbe lo stato di un altro ordine;
// - si cerca in tutte e due le forme del numero («2785» e «#2785»);
// - si chiede ANCHE all'archivio di Orders: la copia locale dura 60 giorni,
//   e «non trovato» detto di un ordine vecchio che esiste è falso. Di un
//   ordine d'archivio però NON sappiamo la lavorazione (gestione, fornitore):
//   quei campi restano null e `daArchivio` lo dice.
//
// Cosa NON esce di qui: i costi pattuiti col fornitore e i dati personali
// della consegna (indirizzo, telefono). Chi chiede lo stato di un ordine non
// ha bisogno dell'economia né dell'indirizzo di casa del cliente.

type StatoOrdine = {
  numero: string
  negozio: string
  cliente: string
  totale: number
  valuta: string
  data: string
  /** Consegna richiesta: giorno e fascia (null = non nota). */
  dataConsegna: string | null
  fasciaConsegna: string
  /** Lo stato della pipeline Deluxy (da Orders): es. «Da lavorare». */
  statoNome: string
  /** Come sta il pagamento secondo Shopify: PAID | PENDING | REFUNDED… */
  statoPagamento: string
  /** Come lo stiamo lavorando QUI: da_gestire | in_pagamento | comunicazione
   *  | gestito. Null per gli ordini d'archivio: quel dato è solo nostro. */
  gestione: string | null
  /** Chi l'ha in mano l'ultima volta che lo stato è cambiato. */
  gestioneDaNome: string | null
  /** Il fornitore a cui l'abbiamo affidato ('' = non ancora assegnato). */
  fornitoreNome: string | null
  /** Annullato su Shopify: un ordine con questa data non si lavora. */
  annullatoIl: string | null
  /** Unito a un altro ordine (numero) perché sono una vendita sola. */
  unitoA: string | null
  /** true = viene dall'archivio di Orders: della lavorazione non sappiamo. */
  daArchivio: boolean
}

export async function GET(req: NextRequest) {
  const client = await autentica(req)
  if (client instanceof NextResponse) return client

  const q = (req.nextUrl.searchParams.get('numero') ?? req.nextUrl.searchParams.get('q') ?? '').trim()
  const cifre = q.replace(/\D/g, '')
  if (cifre.length < 2) return erroreApi(400, 'Serve il numero dell’ordine (?numero=, almeno 2 cifre)')

  const locali = await db.ordine.findMany({
    where: {
      OR: [
        { numero: { in: formeNumero(cifre) } },
        // «Contiene» solo con abbastanza cifre: con due, mezzo archivio
        // corrisponde e un elenco di cinquanta ordini non è una risposta.
        ...(cifre.length >= 3 ? [{ numero: { contains: cifre } }] : []),
      ],
    },
    orderBy: { data: 'desc' },
    take: 8,
    select: {
      numero: true,
      negozioNome: true,
      clienteNome: true,
      totale: true,
      valuta: true,
      data: true,
      dataConsegna: true,
      fasciaConsegna: true,
      statoNome: true,
      statoPagamento: true,
      gestione: true,
      gestioneDaNome: true,
      fornitoreNome: true,
      annullatoIl: true,
      unitoA: true,
    },
  })

  const ordini: StatoOrdine[] = locali.map((o) => ({
    numero: o.numero,
    negozio: o.negozioNome,
    cliente: o.clienteNome,
    totale: o.totale,
    valuta: o.valuta,
    data: o.data.toISOString(),
    dataConsegna: o.dataConsegna?.toISOString() ?? null,
    fasciaConsegna: o.fasciaConsegna,
    statoNome: o.statoNome,
    statoPagamento: o.statoPagamento,
    gestione: o.gestione,
    gestioneDaNome: o.gestioneDaNome || null,
    fornitoreNome: o.fornitoreNome || null,
    annullatoIl: o.annullatoIl?.toISOString() ?? null,
    unitoA: o.unitoA || null,
    daArchivio: false,
  }))

  // L'archivio di Orders: si chiede SEMPRE, come in per-numero — cercando
  // «2791» la copia locale risponde «#12791» (contiene quelle cifre) mentre
  // l'ordine cercato sta in archivio ed è un altro. Un errore qui non fa
  // fallire la risposta: quello che sappiamo in casa vale lo stesso.
  let nota = ''
  try {
    const esito = await cercaInArchivio(cifre, 10)
    if (esito.stato === 'ok') {
      for (const a of esito.ordini) {
        // ⚠️ L'archivio cerca `q` su TUTTI i campi (nome cliente, telefono…):
        // chiedendo «2785» tornano anche ordini il cui numero non c'entra
        // niente. Qui la domanda è UN NUMERO, quindi si tiene solo chi ce l'ha
        // nel numero — misurato al primo giro: 6 righe su 8 erano rumore.
        if (!a.numero.replace(/\D/g, '').includes(cifre)) continue
        // Dedup per numero + negozio: la copia locale viene da lì, e due righe
        // per lo stesso ordine sembrerebbero due ordini con lo stesso numero.
        if (ordini.some((o) => o.numero === a.numero)) continue
        ordini.push({
          numero: a.numero,
          negozio: a.brand,
          cliente: a.clienteNome,
          totale: a.totale,
          valuta: a.valuta,
          data: a.data,
          dataConsegna: a.dataConsegna,
          fasciaConsegna: a.fasciaConsegna,
          statoNome: a.statoNome,
          statoPagamento: a.statoPagamento,
          gestione: null,
          gestioneDaNome: null,
          fornitoreNome: null,
          annullatoIl: null,
          unitoA: null,
          daArchivio: true,
        })
      }
    } else if (esito.stato === 'errore') {
      nota = 'L’archivio Ordini non ha risposto: qui sotto ci sono solo gli ordini degli ultimi 60 giorni.'
    }
  } catch {
    nota = 'L’archivio Ordini non ha risposto: qui sotto ci sono solo gli ordini degli ultimi 60 giorni.'
  }

  // Prima chi si chiama ESATTAMENTE così, poi i più recenti (stessa regola di
  // per-numero: cercando «2791», #12791 non deve stare sopra #2791).
  const esatti = new Set(formeNumero(cifre))
  ordini.sort((a, b) => {
    const ea = esatti.has(a.numero) ? 1 : 0
    const eb = esatti.has(b.numero) ? 1 : 0
    if (ea !== eb) return eb - ea
    return b.data.localeCompare(a.data)
  })

  return NextResponse.json({ ordini: ordini.slice(0, 8), nota })
}
