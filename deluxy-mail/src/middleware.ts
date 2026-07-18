import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE, verificaSessione } from '@/lib/auth'

export async function middleware(req: NextRequest) {
  // Il cancello è la sessione firmata: solo chi ha fatto login con un utente
  // valido ha un cookie che supera la verifica della firma.
  const userId = await verificaSessione(req.cookies.get(SESSION_COOKIE)?.value)
  if (userId) return NextResponse.next()

  return NextResponse.redirect(new URL('/login', req.url))
}

export const config = {
  // Tutto tranne: il login, gli asset, il manifest della PWA e /api/sync —
  // quella si autentica col suo CRON_TOKEN, non ha un cookie da mostrare.
  matcher: [
    '/((?!login|api/sync|_next/static|_next/image|favicon.ico|manifest.webmanifest|icon-).*)',
  ],
}
