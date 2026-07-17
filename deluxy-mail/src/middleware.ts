import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE, sessionToken, ambienteLocale } from '@/lib/auth'

export async function middleware(req: NextRequest) {
  const password = process.env.APP_PASSWORD

  if (!password) {
    // In locale l'app può restare aperta: ci arrivi solo tu da questa macchina.
    if (ambienteLocale()) return NextResponse.next()

    // In rete no. Meglio un'app che non si apre di una casella di posta
    // lasciata a chiunque conosca l'indirizzo.
    return new NextResponse(
      'APP_PASSWORD non impostata. AI Mail non parte senza password quando è raggiungibile dalla rete: contiene una casella di posta intera.',
      { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } }
    )
  }

  const cookie = req.cookies.get(SESSION_COOKIE)?.value
  if (cookie && cookie === (await sessionToken(password))) {
    return NextResponse.next()
  }

  return NextResponse.redirect(new URL('/login', req.url))
}

export const config = {
  // Tutto tranne: il login, gli asset, il manifest della PWA e /api/sync —
  // quella si autentica già col suo CRON_TOKEN, e un cron non ha un cookie di
  // sessione da mostrare.
  matcher: [
    '/((?!login|api/sync|_next/static|_next/image|favicon.ico|manifest.webmanifest|icon-).*)',
  ],
}
