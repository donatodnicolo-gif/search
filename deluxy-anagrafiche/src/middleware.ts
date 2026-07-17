import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, sessionToken } from "@/lib/auth";

// Due compiti:
// 1. /api/* — CORS per le API di lettura: permette alle app Deluxy nel browser
//    (es. l'app search/supplier su search-deluxy.vercel.app) di interrogare il
//    registro. Le chiamate restano protette dalla chiave x-api-key; via CORS si
//    espongono solo GET (le scritture arrivano server-to-server dalla piattaforma).
// 2. tutto il resto (UI) — protezione con password unica come deluxy-partner:
//    se ANAGRAFICHE_APP_PASSWORD non è impostata (sviluppo locale) la UI è aperta.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "x-api-key, authorization, content-type",
  "Access-Control-Max-Age": "86400",
};

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

  const password = process.env.ANAGRAFICHE_APP_PASSWORD;
  if (!password || pathname === "/login") return NextResponse.next();

  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  if (cookie && cookie === (await sessionToken(password))) {
    return NextResponse.next();
  }
  return NextResponse.redirect(new URL("/login", req.url));
}

export const config = {
  // API (per il CORS) e tutta la UI tranne gli asset statici
  matcher: ["/api/:path*", "/((?!_next/static|_next/image|favicon.ico).*)"],
};
