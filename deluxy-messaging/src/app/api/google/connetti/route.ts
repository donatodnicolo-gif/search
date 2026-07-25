import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { leggiImpostazioni } from '@/lib/impostazioni'
import { urlConsenso } from '@/lib/google'

export const dynamic = 'force-dynamic'

// Avvia il consenso Google: reindirizza l'operatore (già loggato) alla
// schermata di Google. Protetto dal middleware di sessione.
export async function GET(req: NextRequest) {
  const { googleClientId, googleClientSecret } = await leggiImpostazioni([
    'googleClientId',
    'googleClientSecret',
  ])
  if (!googleClientId || !googleClientSecret) {
    return NextResponse.redirect(
      new URL('/impostazioni?erroreGoogle=' + encodeURIComponent('Inserisci prima Client ID e Client Secret.'), req.url)
    )
  }

  // Base pubblica dell'app: da APP_URL, altrimenti dall'host della richiesta.
  const host = req.headers.get('host') ?? 'localhost:3140'
  const base = process.env.APP_URL || `${host.startsWith('localhost') ? 'http' : 'https'}://${host}`

  const state = crypto.randomBytes(16).toString('hex')
  const url = urlConsenso(base, googleClientId, state)

  const res = NextResponse.redirect(url)
  // Lo state torna nel callback: lo confrontiamo con questo cookie (anti-CSRF).
  res.cookies.set('google_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 600,
    path: '/',
  })
  return res
}
