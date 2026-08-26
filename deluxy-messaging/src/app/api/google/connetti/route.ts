import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { leggiImpostazioni } from '@/lib/impostazioni'
import { redirectUri, urlConsenso } from '@/lib/google'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'

// Avvia il consenso Google: reindirizza l'operatore (già loggato) alla
// schermata di Google. Protetto dal middleware di sessione.
export async function GET(req: NextRequest) {
  // ⚠️ Chi sei. Sta qui e non solo nel middleware: quello controlla la FIRMA
  // del cookie, non che l'utente esista ancora — e il cookie di un account
  // cancellato resta firmato bene per trenta giorni.
  const _io = await utenteCorrente()
  if (!_io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
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

  // ── `?mostra=1`: cosa stiamo mandando a Google, invece di andarci ──
  //
  // ⚠️ NASCE DA UN CASO VERO, e capitato due volte: Google risponde
  // `redirect_uri_mismatch` e da fuori non c'è modo di sapere QUALE indirizzo
  // abbiamo mandato — si finisce a confrontare a memoria una stringa scritta in
  // due posti diversi (e magari in un altro progetto Google, o su un altro
  // client OAuth). Qui l'indirizzo esatto e il client id si leggono e si
  // copiano, e il confronto con la console diventa carattere per carattere.
  //
  // Non è un segreto: il client id e il redirect URI viaggiano in chiaro nella
  // barra degli indirizzi a ogni consenso. Il client SECRET non compare.
  if (req.nextUrl.searchParams.get('mostra') === '1') {
    return NextResponse.json({
      redirectUri: redirectUri(base),
      clientId: googleClientId,
      base,
      urlConsenso: url,
      istruzioni:
        'Nella console Google Cloud → API e servizi → Credenziali, apri il client OAuth con QUESTO client id e incolla QUESTO redirectUri fra gli «URI di reindirizzamento autorizzati» (non fra le origini JavaScript). Deve combaciare carattere per carattere.',
    })
  }

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
