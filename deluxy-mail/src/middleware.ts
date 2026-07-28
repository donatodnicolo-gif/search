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
  // Tutto tranne: il login, gli asset, il manifest della PWA, il service worker
  // (sw.js: dev'essere sempre servito come JS, non protetto), /api/health (il
  // controllo di salute che legge la pagina /stato del Hub: non espone dati,
  // solo booleani — ⚠️ mancava, e per questo il Hub vedeva AI Mail come
  // irraggiungibile invece che come «database in sola lettura»), /api/sync (si
  // autentica col CRON_TOKEN), /api/calendario (feed iCal col suo token:
  // Google/Apple/Outlook non hanno un cookie da mostrare) e /api/invito (i link
  // Accetta/Rifiuta delle mail d'invito: chi risponde non ha un account qui,
  // il cancello è il token dell'evento).
  //
  // ⚠️ Ogni voce tolta da qui è una porta aperta: si aggiunge SOLO ciò che ha
  // già un cancello suo (un token) o che non dice niente di riservato.
  matcher: [
    '/((?!login|api/health|api/sync|api/calendario|api/invito|api/v1|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icon-).*)',
  ],
}
