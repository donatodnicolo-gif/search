import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { utenteCorrente } from '@/lib/sessione'
import { statoRimborsoValido } from '@/lib/rimborsi'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

// Approva, rifiuta o segna come rimborsata una richiesta.
//
// «Eseguito» non muove denaro: dichiara che una persona l'ha già mosso altrove
// (Shopify, banca). Per questo chiede l'esito scritto — senza, resterebbe un
// "fatto" senza prova di dove e quando.
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  const { stato, esito } = (await req.json().catch(() => ({}))) as {
    stato?: string
    esito?: string
  }
  if (!stato || !statoRimborsoValido(stato)) {
    return NextResponse.json({ errore: 'Stato del rimborso non valido.' }, { status: 400 })
  }

  const esistente = await db.rimborso.findUnique({ where: { id } })
  if (!esistente) return NextResponse.json({ errore: 'Rimborso non trovato' }, { status: 404 })

  const testoEsito = (esito ?? '').trim() || esistente.esito
  if (stato === 'eseguito' && !testoEsito) {
    return NextResponse.json(
      { errore: 'Scrivi come è stato rimborsato (es. «reso su Shopify il 3/8»).' },
      { status: 400 }
    )
  }

  const utente = await utenteCorrente()
  const deciso = stato === 'approvato' || stato === 'rifiutato'

  const rimborso = await db.rimborso.update({
    where: { id },
    data: {
      stato,
      esito: testoEsito,
      // Chi ha deciso si scrive una volta sola, quando la decisione avviene.
      ...(deciso ? { decisoDa: utente?.nome ?? '', decisoIl: new Date() } : {}),
      ...(stato === 'eseguito' ? { eseguitoIl: esistente.eseguitoIl ?? new Date() } : {}),
    },
  })
  return NextResponse.json({ rimborso })
}
