import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { segnaConsegnataInPiattaforma } from '@/lib/piattaforma'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

// Segna CONSEGNATA nella piattaforma la consegna di quest'ordine (utente,
// 06/09/2026: quando il CS mette «Gestito», chiede se chiudere anche di là).
//
//   POST /api/ordini/<id>/consegna-consegnata   { consegnaId?: "…" }
//
// ⚠️ Lo stato lo cambia la piattaforma dalla sua rotta app-to-app, con la
// chiave di scrittura: qui si chiede e si copia la risposta. Senza consegnaId
// si usa quella agganciata all'ordine.
export async function POST(req: NextRequest, { params }: Params) {
  const io = await utenteCorrente()
  if (!io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  const { id } = await params
  const corpo = (await req.json().catch(() => ({}))) as { consegnaId?: string }
  const o = await db.ordine.findUnique({ where: { id }, select: { id: true, numero: true, appConsegnaId: true } })
  if (!o) return NextResponse.json({ errore: 'Ordine non trovato.' }, { status: 404 })
  const consegnaId = (corpo.consegnaId || o.appConsegnaId || '').trim()
  if (!consegnaId) return NextResponse.json({ errore: 'Nessuna consegna in piattaforma su questo ordine.' }, { status: 400 })

  const esito = await segnaConsegnataInPiattaforma(consegnaId)
  if (esito.stato === 'non-configurato') {
    return NextResponse.json({ errore: 'Piattaforma non collegata (Impostazioni).' }, { status: 400 })
  }
  if (esito.stato === 'non-trovato') {
    return NextResponse.json({ errore: 'La piattaforma non ha trovato quella consegna.' }, { status: 404 })
  }
  if (esito.stato === 'errore') return NextResponse.json({ errore: esito.messaggio }, { status: 502 })

  // La copia di qui si aggiorna subito: la sync la confermerebbe al giro dopo.
  if (o.appConsegnaId === consegnaId) {
    await db.ordine.update({ where: { id: o.id }, data: { appConsegnaStato: 'delivered' } })
  }
  return NextResponse.json({ ok: true, numero: esito.dati.numero ?? esito.dati.number ?? null })
}
