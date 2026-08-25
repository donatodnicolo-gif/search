import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, sessionToken } from "@/lib/auth";

// Tre compiti:
// 1. /api/interno/* — endpoint della UI (ricerca ed estrazione AI): stessa
//    sessione a cookie della UI, niente CORS, niente chiavi API.
// 2. /api/* (v1) — CORS: permette alle app Deluxy nel browser di leggere gli
//    acquisti. Le chiamate restano protette dalla chiave x-api-key.
// 3. tutto il resto (UI) — protezione con password unica come le altre app.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "x-api-key, authorization, content-type",
  "Access-Control-Max-Age": "86400",
};

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/api/interno")) {
    const password = process.env.ACQUISTI_APP_PASSWORD;
    if (password) {
      const cookie = req.cookies.get(SESSION_COOKIE)?.value;
      if (!cookie || cookie !== (await sessionToken(password))) {
        return NextResponse.json({ errore: "Non autenticato" }, { status: 401 });
      }
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/api")) {
    if (req.method === "OPTIONS") {
      return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
    }
    const res = NextResponse.next();
    for (const [k, v] of Object.entries(CORS_HEADERS)) res.headers.set(k, v);
    return res;
  }

  const password = process.env.ACQUISTI_APP_PASSWORD;
  if (!password || pathname === "/login") return NextResponse.next();

  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  if (cookie && cookie === (await sessionToken(password))) {
    return NextResponse.next();
  }
  return NextResponse.redirect(new URL("/login", req.url));
}

export const config = {
  matcher: ["/api/:path*", "/((?!_next/static|_next/image|favicon.ico).*)"],
};
