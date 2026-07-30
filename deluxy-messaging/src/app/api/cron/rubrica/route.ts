import { NextRequest, NextResponse } from 'next/server'
import { riconosciDaRubrica } from '@/lib/rubrica'

// Dà un nome ai numeri che ci scrivono, guardando la rubrica Google. Una volta
// l'ora, sfasato rispetto al cron dei contatti: usano la stessa People API e lo
// stesso minuto, e messi insieme si rubano il tempo a vicenda — quello dei
// contatti da solo ha già misurato oltre 3 minuti.
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const segreto = process.env.CRON_SECRET
  if (!segreto) {
    return NextResponse.json(
      { errore: 'CRON_SECRET non configurato: riconoscimento automatico disattivato.' },
      { status: 503 }
    )
  }
  if (req.headers.get('authorization') !== `Bearer ${segreto}`) {
    return NextResponse.json({ errore: 'Non autorizzato.' }, { status: 401 })
  }

  try {
    return NextResponse.json({ ok: true, ...(await riconosciDaRubrica()) })
  } catch (e) {
    return NextResponse.json({ errore: (e as Error).message }, { status: 500 })
  }
}
