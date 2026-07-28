import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE, verificaSessione } from '@/lib/auth'

// CORS per le API a chiave (`/api/v1/*`): le altre app Deluxy possono leggerle
// anche dal browser. Restano protette dalla chiave `x-api-key`.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'x-api-key, authorization, content-type',
  'Access-Control-Max-Age': '86400',
}

export async function middleware(req: NextRequest) {
  // Le API a chiave si autenticano da sé (standard Deluxy §4.3): il cancello
  // della sessione le rimanderebbe al login, che per un'app che chiama da
  // server non vuol dire niente.
  if (req.nextUrl.pathname.startsWith('/api/v1')) {
    if (req.method === 'OPTIONS') {
      return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
    }
    const res = NextResponse.next()
    for (const [k, v] of Object.entries(CORS_HEADERS)) res.headers.set(k, v)
    return res
  }

  // Il cancello è la sessione firmata: solo chi ha fatto login con un utente
  // valido ha un cookie che supera la verifica della firma.
  const userId = await verificaSessione(req.cookies.get(SESSION_COOKIE)?.value)
  if (userId) return NextResponse.next()

  return NextResponse.redirect(new URL('/login', req.url))
}

export const config = {
  // Tutto tranne: il login, la pagina e le API del widget (pubbliche: sono la
  // chat dei visitatori dei siti, autenticata dal token di sessione del widget),
  // i webhook Meta (autenticati dal verify token e dalla firma X-Hub-Signature),
  // i cron di Vercel (autenticati dal Bearer CRON_SECRET: non hanno un cookie di
  // sessione, di qui verrebbero rimandati al login), il health-check e gli asset.
  //
  // ⚠️ `api/health` va escluso o il controllo NON FUNZIONA: il Hub lo chiama da
  // server, senza cookie di sessione, e il middleware gli risponderebbe con un
  // redirect al login. La pagina di stato mostrerebbe l'app come irraggiungibile
  // mentre sta benissimo — un falso allarme peggiore del non controllare, perché
  // insegna a ignorare i rossi.
  // Restare pubblico è accettabile perché la risposta non contiene dati: solo
  // «risponde», «il database scrive», e due conteggi.
  matcher: [
    '/((?!login|registrati|widget|api/widget|api/webhooks|api/cron|api/health|_next/static|_next/image|favicon.ico).*)',
  ],
}
