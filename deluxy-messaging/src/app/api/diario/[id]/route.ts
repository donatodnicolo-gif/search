import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { utenteCorrente } from '@/lib/sessione'
import { normalizzaNumero } from '@/lib/diario'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

// Segna fatta (o riapre), corregge il testo, cambia l'ordine collegato.
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params
  const io = await utenteCorrente()
  if (!io) return NextResponse.json({ errore: 'Sessione scaduta' }, { status: 401 })
  const { fatta, testo, ordineNumero } = (await req.json().catch(() => ({}))) as {
    fatta?: boolean
    testo?: string
    ordineNumero?: string
  }
  const dati: Record<string, unknown> = {}
  if (typeof fatta === 'boolean') {
    dati.fatta = fatta
    // ⚠️ Chi l'ha chiusa e quando: su una riga che sparisce dall'elenco è la
    // prima domanda quando qualcuno chiede «l'avevamo fatto?».
    dati.fattaIl = fatta ? new Date() : null
    dati.fattaDaNome = fatta ? io.nome : ''
  }
  if (typeof testo === 'string' && testo.trim()) dati.testo = testo.trim()
  if (typeof ordineNumero === 'string') dati.ordineNumero = normalizzaNumero(ordineNumero)
  if (!Object.keys(dati).length) {
    return NextResponse.json({ errore: 'Niente da cambiare.' }, { status: 400 })
  }
  const nota = await db.notaDiario.update({ where: { id }, data: dati })
  return NextResponse.json({ nota })
}

// Cancella una riga.
//
// ⚠️ Si cancella davvero: il diario è un quaderno di lavoro, non un archivio, e
// una riga sbagliata («l'ho scritta sull'ordine di un altro») deve poter sparire
// invece di restare a confondere chi apre quell'ordine.
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const io = await utenteCorrente()
  if (!io) return NextResponse.json({ errore: 'Sessione scaduta' }, { status: 401 })
  await db.notaDiario.delete({ where: { id } }).catch(() => {})
  return NextResponse.json({ ok: true })
}
