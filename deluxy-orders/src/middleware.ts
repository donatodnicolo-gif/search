import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, sessionToken } from "@/lib/auth";

// Due compiti:
// 1. /api/v1/* — CORS per le API di lettura: permette alle app Deluxy nel
//    browser di interrogare il registro ordini. Le chiamate restano protette
//    dalla chiave x-api-key; via CORS si espongono GET e PATCH.
// 2. tutto il resto (UI) — protezione con password unica come le altre app: se
//    ORDERS_APP_PASSWORD non è impostata (sviluppo locale) la UI è aperta.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "x-api-key, authorization, content-type",
  "Access-Control-Max-Age": "86400",
};

// DA QUANDO SEI QUI. Serve a una cosa sola, ma importante: segnare gli ordini
// **arrivati mentre stavi lavorando**, così in una tabella da 14.000 righe si
// vede subito cosa è nuovo senza doverla rileggere tutta.
//
// È un cookie di sessione — niente scadenza, muore quando si chiude il browser
// — e si scrive nel middleware perché una pagina server non può mettere cookie.
// Sta nel browser e non nel database apposta: due persone che lavorano insieme
// hanno due «da quando sono arrivato» diversi, ed è giusto così.
export const COOKIE_SESSIONE = "orders_sessione_da";

function conMarcaSessione(req: NextRequest, res: NextResponse): NextResponse {
  if (!req.cookies.get(COOKIE_SESSIONE)) {
    res.cookies.set(COOKIE_SESSIONE, new Date().toISOString(), { sameSite: "lax", path: "/" });
  }
  return res;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/api")) {
    if (req.method === "OPTIONS") {
      return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
    }
    const res = NextResponse.next();
    for (const [k, v] of Object.entries(CORS_HEADERS)) res.headers.set(k, v);
    return res;
  }

  const password = process.env.ORDERS_APP_PASSWORD;
  if (!password || pathname === "/login") return conMarcaSessione(req, NextResponse.next());

  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  if (cookie && cookie === (await sessionToken(password))) {
    return conMarcaSessione(req, NextResponse.next());
  }
  return NextResponse.redirect(new URL("/login", req.url));
}

export const config = {
  matcher: ["/api/:path*", "/((?!_next/static|_next/image|favicon.ico).*)"],
};
