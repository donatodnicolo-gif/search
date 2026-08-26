import { NextRequest, NextResponse } from 'next/server'
import { leggiImpostazioni, salvaImpostazione } from '@/lib/impostazioni'
import { scambiaCodice } from '@/lib/google'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'

// Callback OAuth di Google: riceve il `code`, lo scambia col refresh token e lo
// salva cifrato. L'operatore è loggato, quindi il middleware lascia passare.
export async function GET(req: NextRequest) {
  // ⚠️ Chi sei. Sta qui e non solo nel middleware: quello controlla la FIRMA
  // del cookie, non che l'utente esista ancora — e il cookie di un account
  // cancellato resta firmato bene per trenta giorni.
  const _io = await utenteCorrente()
  if (!_io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  const p = req.nextUrl.searchParams
  const impostazioni = new URL('/impostazioni', req.url)

  const errore = p.get('error')
  if (errore) {
    impostazioni.searchParams.set('erroreGoogle', 'Consenso negato: ' + errore)
    return NextResponse.redirect(impostazioni)
  }

  const code = p.get('code')
  const state = p.get('state')
  const statoCookie = req.cookies.get('google_oauth_state')?.value
  if (!code || !state || !statoCookie || state !== statoCookie) {
    impostazioni.searchParams.set('erroreGoogle', 'Sessione di consenso non valida: riprova.')
    return NextResponse.redirect(impostazioni)
  }

  const { googleClientId, googleClientSecret } = await leggiImpostazioni([
    'googleClientId',
    'googleClientSecret',
  ])
  if (!googleClientId || !googleClientSecret) {
    impostazioni.searchParams.set('erroreGoogle', 'Client ID/Secret mancanti.')
    return NextResponse.redirect(impostazioni)
  }

  const host = req.headers.get('host') ?? 'localhost:3140'
  const base = process.env.APP_URL || `${host.startsWith('localhost') ? 'http' : 'https'}://${host}`

  try {
    const { refreshToken } = await scambiaCodice(base, googleClientId, googleClientSecret, code)
    if (!refreshToken) {
      // Google dà il refresh token solo al primo consenso: per riottenerlo va
      // revocato l'accesso e rifatto (prompt=consent lo forza, ma segnaliamo).
      impostazioni.searchParams.set(
        'erroreGoogle',
        'Google non ha restituito un refresh token. Revoca l’accesso all’app da myaccount.google.com/permissions e riprova.'
      )
      return NextResponse.redirect(impostazioni)
    }
    await salvaImpostazione('googleRefreshToken', refreshToken)
    impostazioni.searchParams.set('okGoogle', '1')
  } catch (e) {
    impostazioni.searchParams.set('erroreGoogle', (e as Error).message)
  }

  const res = NextResponse.redirect(impostazioni)
  res.cookies.delete('google_oauth_state')
  return res
}
