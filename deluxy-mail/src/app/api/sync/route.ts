import { NextResponse } from 'next/server'
import { sincronizzaTutti } from '@/lib/sync'

// La sincronizzazione periodica gira da qui: un cron esterno (Vercel Cron,
// Task Scheduler, cron di sistema) chiama questa rotta ogni pochi minuti.
// Con il token in query, così funziona anche da un cron che non manda header.
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: Request) {
  const atteso = process.env.CRON_TOKEN
  if (!atteso) {
    return NextResponse.json(
      { errore: 'CRON_TOKEN non configurato: la sincronizzazione automatica è disattivata.' },
      { status: 503 }
    )
  }

  const token =
    new URL(request.url).searchParams.get('token') ??
    request.headers.get('authorization')?.replace('Bearer ', '')

  if (token !== atteso) {
    return NextResponse.json({ errore: 'Non autorizzato' }, { status: 401 })
  }

  try {
    const esiti = await sincronizzaTutti()
    return NextResponse.json({ ok: true, esiti })
  } catch (e) {
    return NextResponse.json(
      { ok: false, errore: e instanceof Error ? e.message : 'Errore imprevisto' },
      { status: 500 }
    )
  }
}
