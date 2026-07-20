import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { scaricaStorico, sincronizzaTutti, type EsitoSync } from '@/lib/sync'

// La sincronizzazione periodica gira da qui: un cron esterno (Vercel Cron,
// Task Scheduler, cron di sistema) chiama questa rotta ogni pochi minuti.
// Con il token in query, così funziona anche da un cron che non manda header.
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: Request) {
  // Il cron di Vercel non può mettere il token nell'URL: chiama la rotta con
  // "Authorization: Bearer $CRON_SECRET". In locale invece è comodo il token
  // in query, quindi si accettano entrambi.
  const atteso = process.env.CRON_TOKEN || process.env.CRON_SECRET
  if (!atteso) {
    return NextResponse.json(
      { errore: 'CRON_TOKEN non configurato: la sincronizzazione automatica è disattivata.' },
      { status: 503 }
    )
  }

  const parametri = new URL(request.url).searchParams
  const token =
    parametri.get('token') ?? request.headers.get('authorization')?.replace('Bearer ', '')

  if (token !== atteso) {
    return NextResponse.json({ errore: 'Non autorizzato' }, { status: 401 })
  }

  try {
    // ?storico=25 scarica un blocco di posta vecchia invece dei messaggi nuovi.
    // Non è quello che fa il cron: serve a recuperare l'archivio quando lo
    // chiedi, dall'app o da uno script.
    const storico = parametri.get('storico')
    if (storico) {
      const quanti = Math.min(Number(storico) || 25, 100)
      const account = await db.account.findMany({ where: { attivo: true } })
      const esiti: EsitoSync[] = []
      for (const a of account) esiti.push(await scaricaStorico(a.id, quanti))
      return NextResponse.json({ ok: true, esiti })
    }

    const esiti = await sincronizzaTutti()
    return NextResponse.json({ ok: true, esiti })
  } catch (e) {
    return NextResponse.json(
      { ok: false, errore: e instanceof Error ? e.message : 'Errore imprevisto' },
      { status: 500 }
    )
  }
}
