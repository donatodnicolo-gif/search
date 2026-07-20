import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, leggiSessione } from "@/lib/session";

export async function middleware(req: NextRequest) {
  const sessione = await leggiSessione(req.cookies.get(SESSION_COOKIE)?.value);

  if (!sessione) {
    const login = new URL("/login", req.url);
    login.searchParams.set("da", req.nextUrl.pathname);
    const risposta = NextResponse.redirect(login);
    risposta.cookies.delete(SESSION_COOKIE); // sessione scaduta o firma non valida
    return risposta;
  }

  // La gestione utenti è solo per gli amministratori.
  if (req.nextUrl.pathname.startsWith("/utenti") && sessione.ruolo !== "admin") {
    return NextResponse.redirect(new URL("/", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!login|_next/static|_next/image|favicon.ico).*)"],
};
