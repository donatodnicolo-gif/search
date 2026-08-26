import { NextResponse } from 'next/server'
import { rinnovaTokenInstagram } from '@/lib/token-instagram'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// «Rinnova i token adesso», dalla pagina Facebook e Instagram. Lo stesso lavoro
// del cron notturno, ma quando lo si chiede: serve la prima volta, per sapere
// subito se quel token si rinnova o se viene da un utente di sistema e non
// scade.
export async function POST() {
  // ⚠️ Chi sei. Sta qui e non solo nel middleware: quello controlla la FIRMA
  // del cookie, non che l'utente esista ancora — e il cookie di un account
  // cancellato resta firmato bene per trenta giorni.
  const _io = await utenteCorrente()
  if (!_io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  try {
    const esito = await rinnovaTokenInstagram()
    return NextResponse.json(esito)
  } catch (e) {
    return NextResponse.json({ errore: (e as Error).message }, { status: 500 })
  }
}
