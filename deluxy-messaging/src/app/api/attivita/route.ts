import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'

// I promemoria dell'operatore: «richiamare il cliente domani», «sollecitare il
// fiorista sull'ordine 2529». Nascono dalla schermata iniziale e da una
// conversazione o un ordine, che è dove viene in mente di scriverli.
export async function GET(req: NextRequest) {
  const fatte = req.nextUrl.searchParams.get('fatte') === '1'
  const attivita = await db.attivita.findMany({
    where: { fatta: fatte },
    orderBy: fatte ? [{ fattaIl: 'desc' }] : [{ scadenza: 'asc' }, { creatoIl: 'desc' }],
    take: 100,
  })
  return NextResponse.json({ attivita })
}

export async function POST(req: NextRequest) {
  const c = (await req.json().catch(() => ({}))) as {
    testo?: string
    scadenza?: string
    ordineId?: string
    conversazioneId?: string
    riferimento?: string
  }
  const testo = (c.testo ?? '').trim()
  if (!testo) return NextResponse.json({ errore: 'Serve il testo del promemoria.' }, { status: 400 })

  // Una data sbagliata non deve far fallire il salvataggio: meglio un
  // promemoria senza scadenza che nessun promemoria.
  const scadenza = c.scadenza?.trim() ? new Date(c.scadenza) : null
  const chiScrive = await utenteCorrente()

  const attivita = await db.attivita.create({
    data: {
      testo,
      scadenza: scadenza && !Number.isNaN(scadenza.getTime()) ? scadenza : null,
      ordineId: (c.ordineId ?? '').trim(),
      conversazioneId: (c.conversazioneId ?? '').trim(),
      riferimento: (c.riferimento ?? '').trim(),
      utenteId: chiScrive?.id ?? '',
      utenteNome: chiScrive?.nome ?? '',
    },
  })
  return NextResponse.json({ attivita })
}
