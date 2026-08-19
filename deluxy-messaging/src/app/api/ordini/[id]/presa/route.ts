import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

// Chi si occupa di questo ordine — le stesse regole della presa in carico delle
// conversazioni, perché il problema è lo stesso: gli operatori sono tre e la
// bacheca è una sola. Senza, due persone chiamano lo stesso fornitore per lo
// stesso ordine, o (peggio) nessuna delle due, ognuna convinta che ci pensi
// l'altra.
//
// ⚠️ SEGNALA, NON BLOCCA: chi ha preso l'ordine può andare a pranzo, e una
// porta chiusa la pagherebbe il cliente. Il badge dice di chi è; per prenderlo
// comunque c'è `forza`, che almeno è un gesto dichiarato.
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  const { presa, forza } = (await req.json().catch(() => ({}))) as {
    /** 'io' = me ne occupo io · 'nessuno' = lo lascio libero */
    presa?: 'io' | 'nessuno'
    forza?: boolean
  }

  const esiste = await db.ordine.findUnique({ where: { id }, select: { id: true } })
  if (!esiste) return NextResponse.json({ errore: 'Ordine non trovato' }, { status: 404 })

  const io = await utenteCorrente()
  if (!io) return NextResponse.json({ errore: 'Sessione scaduta' }, { status: 401 })

  if (presa === 'nessuno') {
    // ⚠️ Si lascia SOLO quello che si è preso: liberare l'ordine di un altro con
    // un clic vuol dire togliergli il lavoro da sotto le mani senza che se ne
    // accorga — e senza che sparisca dal suo elenco «Miei» in modo visibile.
    const liberato = await db.ordine.updateMany({
      where: { id, presaDaId: io.id },
      data: { presaDaId: '', presaDaNome: '', presaIl: null },
    })
    if (liberato.count === 0) {
      return NextResponse.json(
        { errore: 'Questo ordine non è tuo: puoi prenderlo, non liberarlo.' },
        { status: 409 }
      )
    }
    return NextResponse.json({ presaDaId: '', presaDaNome: '', presaIl: null })
  }

  const dati = { presaDaId: io.id, presaDaNome: io.nome, presaIl: new Date() }

  // ⚠️⚠️ AGGIORNAMENTO CONDIZIONATO, ed è il punto della funzione: con un update
  // secco, due operatori che premono nello stesso secondo leggerebbero
  // **entrambi il proprio nome** e lavorerebbero lo stesso ordine — cioè il
  // guaio che questa funzione esiste per evitare. Filtrando su «libero o già
  // mio», il secondo scrive zero righe e se lo sente dire.
  if (!forza) {
    const preso = await db.ordine.updateMany({
      where: { id, presaDaId: { in: ['', io.id] } },
      data: dati,
    })
    if (preso.count === 0) {
      const chi = await db.ordine.findUnique({ where: { id }, select: { presaDaNome: true } })
      return NextResponse.json(
        {
          errore: `Se ne sta già occupando ${chi?.presaDaNome || 'un altro operatore'}.`,
          occupato: true,
        },
        { status: 409 }
      )
    }
    return NextResponse.json(dati)
  }

  await db.ordine.update({ where: { id }, data: dati })
  return NextResponse.json(dati)
}
