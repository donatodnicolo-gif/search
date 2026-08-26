import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { formeNumero } from '@/lib/diario'
import { cercaInArchivio } from '@/lib/orders'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'

// Un ordine, cercato per numero — per collegarlo a una richiesta di pagamento.
//
//   GET /api/ordini/per-numero?q=2785
//
// ⚠️⚠️ Torna un ELENCO, non un ordine. Lo stesso numero esiste su più negozi
// («#1733» è sia di Cake sia di Deluxy): scegliere il primo vorrebbe dire
// calcolare il margine sul valore di un altro ordine, e mostrarlo come se fosse
// quello giusto. Se ce n'è più d'uno, sceglie una persona.
//
// ⚠️ Si cerca in tutte e due le forme del numero: in tabella stanno col
// cancelletto, a mano si scrivono senza. Senza questo, «2785» non troverebbe
// «#2785» e la casella sembrerebbe rotta.
//
// ⚠️⚠️ E SI CHIEDE ANCHE A ORDERS. Quello che teniamo qui è **una copia di 60
// giorni**, non l'archivio: segnalato dall'utente su «2791», che qui non c'era
// e in Orders sì — è del 13/03/2023. Cercare solo in casa vuol dire dire «non
// esiste» di un ordine che esiste, e chi lo sente smette di fidarsi della
// casella. Il proprietario degli ordini è Orders (Standard Deluxy §7.2).

type Trovato = {
  id: string
  numero: string
  negozioNome: string
  clienteNome: string
  totale: number
  valuta: string
  data: string
  fornitoreNome: string
  fornitoreCosto: number | null
  /** ⚠️ Viene dall'archivio di Orders, non dalla nostra copia: si dice. */
  daArchivio: boolean
}

export async function GET(req: NextRequest) {
  // ⚠️ Chi sei. Sta qui e non solo nel middleware: quello controlla la FIRMA
  // del cookie, non che l'utente esista ancora — e il cookie di un account
  // cancellato resta firmato bene per trenta giorni.
  const _io = await utenteCorrente()
  if (!_io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
  const cifre = q.replace(/\D/g, '')
  if (cifre.length < 2) return NextResponse.json({ ordini: [] })

  const locali = await db.ordine.findMany({
    where: {
      OR: [
        { numero: { in: formeNumero(cifre) } },
        // ⚠️ Anche «contiene», ma solo se si è scritto abbastanza: con due
        // cifre mezzo archivio corrisponde, e un elenco di cinquanta ordini non
        // è una risposta.
        ...(cifre.length >= 3 ? [{ numero: { contains: cifre } }] : []),
      ],
    },
    orderBy: { data: 'desc' },
    take: 8,
    select: {
      id: true,
      numero: true,
      negozioNome: true,
      clienteNome: true,
      totale: true,
      valuta: true,
      data: true,
      fornitoreNome: true,
      fornitoreCosto: true,
    },
  })

  const ordini: Trovato[] = locali.map((o) => ({
    ...o,
    data: o.data.toISOString(),
    daArchivio: false,
  }))

  // ── L'ARCHIVIO DI ORDERS ──
  //
  // ⚠️ Si chiede SEMPRE, non solo quando in casa non c'è niente: cercando
  // «2791» la copia locale risponde «#12791» (che contiene quelle cifre) e
  // sembrerebbe di aver trovato la risposta, mentre l'ordine cercato sta in
  // archivio ed è un altro. Una risposta plausibile e sbagliata è peggio di
  // nessuna risposta.
  //
  // ⚠️ Un errore qui non fa fallire la ricerca: quello che sappiamo in casa vale
  // lo stesso.
  let nota = ''
  try {
    const esito = await cercaInArchivio(cifre, 10)
    if (esito.stato === 'ok') {
      const gia = new Set(ordini.map((o) => `${o.numero}|${o.negozioNome}`))
      for (const a of esito.ordini) {
        // ⚠️ Dedup per numero + negozio: lo stesso ordine sta in tutt'e due i
        // posti (la nostra copia viene da lì), e mostrarlo due volte farebbe
        // credere a due ordini diversi con lo stesso numero — che è proprio
        // l'equivoco da cui questa rotta esiste per proteggere.
        const chiave = `${a.numero}|${a.brand}`
        if (gia.has(chiave) || ordini.some((o) => o.numero === a.numero)) continue
        ordini.push({
          id: a.orderId || a.id,
          numero: a.numero,
          negozioNome: a.brand,
          clienteNome: a.clienteNome,
          totale: a.totale,
          valuta: a.valuta,
          data: a.data,
          // ⚠️ Di un ordine d'archivio non sappiamo chi lo prepara: quel dato è
          // nostro e vale solo sugli ordini che abbiamo lavorato qui.
          fornitoreNome: '',
          fornitoreCosto: null,
          daArchivio: true,
        })
      }
    } else if (esito.stato === 'errore') {
      nota = 'L’archivio Ordini non ha risposto: qui sotto ci sono solo gli ordini recenti.'
    }
  } catch {
    nota = 'L’archivio Ordini non ha risposto: qui sotto ci sono solo gli ordini recenti.'
  }

  // ── L'ORDINE DEI RISULTATI ──
  //
  // ⚠️⚠️ Prima chi si chiama ESATTAMENTE così, poi i più recenti. Ordinando solo
  // per data, cercando «2791» in cima finiva **#12791** — che è del 2026 e
  // contiene quelle cifre — mentre **#2791**, che è l'ordine chiesto, restava in
  // fondo o fuori dai primi dodici. Un elenco che mette al primo posto una cosa
  // che non è quella cercata è peggio di un elenco vuoto: il primo risultato lo
  // si clicca.
  const esatti = new Set(formeNumero(cifre))
  ordini.sort((a, b) => {
    const ea = esatti.has(a.numero) ? 1 : 0
    const eb = esatti.has(b.numero) ? 1 : 0
    if (ea !== eb) return eb - ea
    return b.data.localeCompare(a.data)
  })
  return NextResponse.json({ ordini: ordini.slice(0, 12), nota })
}
