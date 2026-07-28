import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { leggiImpostazioni } from '@/lib/impostazioni'

export const dynamic = 'force-dynamic'

// API pubbliche del widget: autenticate dal token di sessione del visitatore.

async function conversazioneDaToken(token: string | null) {
  if (!token || token.length < 20) return null
  return db.conversazione.findUnique({
    where: { canale_idEsterno_numeroId: { canale: 'widget', idEsterno: token, numeroId: '' } },
  })
}

// Il widget fa polling qui: torna i messaggi e la configurazione (titolo, benvenuto).
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')

  // Senza token la chat non è ancora cominciata: si risponde con titolo e
  // saluto, e nient'altro. Serve a mostrare il benvenuto SENZA aprire una
  // conversazione — prima bastava che il widget si caricasse per far comparire
  // in Inbox un cliente che non aveva scritto niente.
  if (!token) {
    const config = await leggiImpostazioni(['widgetTitolo', 'widgetMessaggio'])
    return NextResponse.json({
      titolo: config.widgetTitolo || 'Deluxy',
      benvenuto: config.widgetMessaggio || 'Ciao! Come possiamo aiutarti?',
      messaggi: [],
    })
  }

  const conversazione = await conversazioneDaToken(token)
  if (!conversazione) return NextResponse.json({ errore: 'Sessione non valida' }, { status: 404 })

  const [messaggi, config] = await Promise.all([
    db.messaggio.findMany({
      where: { conversazioneId: conversazione.id },
      orderBy: { creatoIl: 'asc' },
      take: 200,
      select: { id: true, direzione: true, testo: true, creatoIl: true },
    }),
    leggiImpostazioni(['widgetTitolo', 'widgetMessaggio']),
  ])

  return NextResponse.json({
    titolo: config.widgetTitolo || 'Deluxy',
    benvenuto: config.widgetMessaggio || 'Ciao! Come possiamo aiutarti?',
    messaggi,
  })
}

// Il visitatore scrive un messaggio.
export async function POST(req: NextRequest) {
  const { token, testo } = (await req.json().catch(() => ({}))) as {
    token?: string
    testo?: string
  }
  const conversazione = await conversazioneDaToken(token ?? null)
  if (!conversazione) return NextResponse.json({ errore: 'Sessione non valida' }, { status: 404 })

  const pulito = (testo ?? '').trim().slice(0, 4000)
  if (!pulito) return NextResponse.json({ errore: 'Testo vuoto' }, { status: 400 })

  const messaggio = await db.messaggio.create({
    data: { conversazioneId: conversazione.id, direzione: 'in', testo: pulito },
  })
  await db.conversazione.update({
    where: { id: conversazione.id },
    data: {
      ultimoTesto: pulito,
      ultimoMessaggioIl: new Date(),
      nonLetti: { increment: 1 },
      archiviata: false,
    },
  })

  return NextResponse.json({ messaggio: { id: messaggio.id, creatoIl: messaggio.creatoIl } })
}
