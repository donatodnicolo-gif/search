import { NextRequest, NextResponse } from 'next/server'
import { correggiNumero, segnaRichiamata } from '@/lib/chiamate'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

// Due gesti su una chiamata:
//   { azione: 'richiamata', esito }  → l'ho richiamato, ed è andata così
//   { azione: 'numero', numero }     → il numero letto dalla notifica è
//                                      sbagliato: eccolo, e si rifà il
//                                      riconoscimento
//
// ⚠️ Il secondo esiste perché il formato delle notifiche non lo decidiamo noi.
// Un riconoscimento che si può correggere a mano vale più di uno che indovina:
// quando sbaglia, chi lavora non resta fermo.
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  const c = (await req.json().catch(() => ({}))) as {
    azione?: string
    esito?: string
    numero?: string
  }

  if (c.azione === 'numero') {
    const esito = await correggiNumero(id, String(c.numero ?? ''))
    if (!esito.ok) return NextResponse.json({ errore: esito.errore }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  const io = await utenteCorrente()
  const esito = await segnaRichiamata(id, {
    esito: String(c.esito ?? ''),
    // ⚠️ Il nome di chi ha richiamato si scrive: «richiamato» senza un nome, in
    // una squadra di turni, non dice a chi chiedere com'è andata.
    chi: io?.nome ?? '',
  })
  if (!esito.ok) return NextResponse.json({ errore: esito.errore }, { status: 404 })
  return NextResponse.json({ ok: true })
}
