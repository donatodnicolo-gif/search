import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

/**
 * Sposta la consegna di un ordine.
 *
 * Il cliente chiama e chiede un altro giorno: prima bisognava andare su
 * Shopify, cambiarla là e aspettare che il registro la ripassasse — e nel
 * frattempo qui l'ordine restava nel giorno sbagliato, in cima alla lista di
 * lavoro di oggi.
 *
 * ⚠️⚠️ QUI LA DATA DIVERGE DA SHOPIFY, e non si finge il contrario: l'ordine
 * resta segnato «consegna spostata», con chi l'ha spostata e quando, e la data
 * di Shopify continua a vedersi accanto. Chi guarda deve poter capire in due
 * secondi che le due non coincidono — è l'unico modo perché qualcuno vada a
 * sistemarla anche alla fonte.
 *
 * ⚠️ Il valore nuovo si scrive dentro `dataConsegna`/`fasciaConsegna`, cioè i
 * campi che leggono già urgenza, calendario, ordinamenti e messaggio al
 * fornitore: una data «nostra» tenuta in un campo a parte sarebbe vera solo
 * nella schermata che la mostra.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  const { data, fascia, ripristina } = (await req.json().catch(() => ({}))) as {
    /** Giorno nuovo, in forma `2026-08-21`. Vuoto = consegna senza data. */
    data?: string
    /** Fascia oraria come la scrive il cliente («16-20»). */
    fascia?: string
    /** Torna a quello che dice Shopify e spegne la deroga. */
    ripristina?: boolean
  }

  const ordine = await db.ordine.findUnique({ where: { id } })
  if (!ordine) return NextResponse.json({ errore: 'Ordine non trovato' }, { status: 404 })

  const io = await utenteCorrente()
  if (!io) return NextResponse.json({ errore: 'Sessione scaduta' }, { status: 401 })

  if (ripristina) {
    // Si torna alla fonte: la deroga si spegne e la data di Orders riprende a
    // valere (al prossimo giro la riscrive comunque).
    const tornato = await db.ordine.update({
      where: { id },
      data: {
        dataConsegna: ordine.dataConsegnaOriginale,
        fasciaConsegna: ordine.fasciaConsegnaOriginale,
        consegnaSpostata: false,
        consegnaSpostataDa: '',
        consegnaSpostataIl: null,
      },
    })
    return NextResponse.json({ ordine: tornato })
  }

  // ⚠️ Una data che il browser non ha saputo comporre non deve diventare
  // `Invalid Date` in tabella: si rifiuta, invece di salvare un buco.
  let quando: Date | null = null
  if ((data ?? '').trim()) {
    const d = new Date(`${data}T00:00:00`)
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json({ errore: 'Data non valida.' }, { status: 400 })
    }
    quando = d
  }

  const aggiornato = await db.ordine.update({
    where: { id },
    data: {
      dataConsegna: quando,
      fasciaConsegna: (fascia ?? '').trim(),
      // ⚠️ L'originale si fotografa ADESSO se non l'abbiamo ancora: senza, dopo
      // il primo spostamento non si saprebbe più da dove si è partiti.
      ...(ordine.dataConsegnaOriginale || ordine.consegnaSpostata
        ? {}
        : {
            dataConsegnaOriginale: ordine.dataConsegna,
            fasciaConsegnaOriginale: ordine.fasciaConsegna,
          }),
      consegnaSpostata: true,
      consegnaSpostataDa: io.nome,
      consegnaSpostataIl: new Date(),
    },
  })
  return NextResponse.json({ ordine: aggiornato })
}
