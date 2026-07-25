import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { SESSION_COOKIE, verificaSessione } from '@/lib/auth'
import { ripassaDimensioni } from '@/lib/sync'

// POST /api/dimensioni — riempie la DIMENSIONE REALE (allegati compresi) delle
// mail che ne sono prive, chiedendola al server IMAP. Non scarica contenuti:
// chiede solo i numeri, quindi è veloce anche su archivi grandi.
//
// La chiama la lista quando ordini per dimensione: è lì che il dato serve.
// Torna { aggiornate, finito }: il client ripassa finché non è finito.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  const userId = await verificaSessione(token)
  if (!userId) return NextResponse.json({ ok: false }, { status: 401 })

  try {
    const aggiornate = await ripassaDimensioni(userId)
    return NextResponse.json({ ok: true, aggiornate, finito: aggiornate === 0 })
  } catch (e) {
    return NextResponse.json(
      { ok: false, messaggio: e instanceof Error ? e.message.slice(0, 160) : 'errore' },
      { status: 500 }
    )
  }
}
