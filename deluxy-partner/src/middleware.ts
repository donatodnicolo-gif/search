import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, sessionToken } from "@/lib/auth";

export async function middleware(req: NextRequest) {
  // Ritorno OAuth da Fatture in Cloud: la Redirect URL registrata è la root
  // del sito, quindi il codice arriva su "/?code=...&state=fic-..." e va
  // girato al callback che lo scambia coi token.
  if (
    req.nextUrl.pathname === "/" &&
    req.nextUrl.searchParams.get("code") &&
    req.nextUrl.searchParams.get("state")?.startsWith("fic-")
  ) {
    const cb = new URL("/api/fic/callback", req.url);
    cb.search = req.nextUrl.search;
    return NextResponse.redirect(cb);
  }

  const password = process.env.PARTNER_APP_PASSWORD;
  if (!password) return NextResponse.next(); // sviluppo locale: aperta

  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  if (cookie && cookie === (await sessionToken(password))) {
    return NextResponse.next();
  }
  const login = new URL("/login", req.url);
  return NextResponse.redirect(login);
}

export const config = {
  // tutto tranne login, callback OAuth, API pubblica di verifica (auth a chiave),
  // asset statici e file pubblici
  matcher: [
    "/((?!login|api/fic/callback|api/verifiche|api/fatture|api/proforma|api/tipologie|api/cron|_next/static|_next/image|favicon.ico).*)",
  ],
};
