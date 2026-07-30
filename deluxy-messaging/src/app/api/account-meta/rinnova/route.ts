import { NextResponse } from 'next/server'
import { rinnovaTokenInstagram } from '@/lib/token-instagram'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// «Rinnova i token adesso», dalla pagina Facebook e Instagram. Lo stesso lavoro
// del cron notturno, ma quando lo si chiede: serve la prima volta, per sapere
// subito se quel token si rinnova o se viene da un utente di sistema e non
// scade.
export async function POST() {
  try {
    const esito = await rinnovaTokenInstagram()
    return NextResponse.json(esito)
  } catch (e) {
    return NextResponse.json({ errore: (e as Error).message }, { status: 500 })
  }
}
