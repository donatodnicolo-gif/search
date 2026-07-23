import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, leggiSessione } from "@/lib/session";

export async function middleware(req: NextRequest) {
  // La cassaforte /api/chiavi è server-to-server: si autentica col proprio token
  // di servizio (dentro la route), non con la sessione utente del portale.
  if (req.nextUrl.pathname.startsWith("/api/chiavi")) return NextResponse.next();

  const sessione = await leggiSessione(req.cookies.get(SESSION_COOKIE)?.value);

  if (!sessione) {
    const login = new URL("/login", req.url);
    login.searchParams.set("da", req.nextUrl.pathname);
    const risposta = NextResponse.redirect(login);
    risposta.cookies.delete(SESSION_COOKIE); // sessione scaduta o firma non valida
    return risposta;
  }

  // Gestione utenti e chiavi dei progetti: solo per gli amministratori.
  const soloAdmin =
    req.nextUrl.pathname.startsWith("/utenti") || req.nextUrl.pathname.startsWith("/chiavi");
  if (soloAdmin && sessione.ruolo !== "admin") {
    return NextResponse.redirect(new URL("/", req.url));
  }

  return NextResponse.next();
}

export const config = {
  // "api" è escluso: le route API si autenticano da sole (token di servizio),
  // non con il cookie di sessione — il middleware le reindirizzerebbe al login.
  matcher: ["/((?!api|login|_next/static|_next/image|favicon.ico).*)"],
};
